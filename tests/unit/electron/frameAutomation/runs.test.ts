// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runV19 } from '../../../../electron/localdb/migrations.mjs'
import { createFrameAutomationRunsRepo } from '../../../../electron/localdb/repos/frameAutomationRuns.mjs'
import { validateAssets } from '../../../../electron/backend/modules/frame-automation/assets.mjs'

let DatabaseSync: any
try {
	;({ DatabaseSync } = createRequire(import.meta.url)('node:sqlite'))
} catch {
	/* Node <22 */
}
function fixture() {
	const native = new DatabaseSync(':memory:')
	native.exec(
		'PRAGMA foreign_keys=ON; CREATE TABLE projects(id INTEGER PRIMARY KEY); INSERT INTO projects VALUES (1),(2);'
	)
	runV19(native)
	runV19(native)
	const db = {
		prepare: (s: string) => native.prepare(s),
		transaction: (fn: () => unknown) => () => {
			native.exec('BEGIN')
			try {
				const result = fn()
				native.exec('COMMIT')
				return result
			} catch (err) {
				native.exec('ROLLBACK')
				throw err
			}
		}
	}
	const repo = createFrameAutomationRunsRepo(db)
	const recipe = { version: 1, frame: { id: 'f' }, nodes: [{ id: 'a' }], order: ['a'] }
	return { native, repo, recipe }
}
describe.skipIf(!DatabaseSync)('durable frame journal', () => {
	it('orders events, deduplicates retries, isolates projects and seals terminal runs', () => {
		const { native, repo, recipe } = fixture()
		try {
			const { id } = repo.create({ projectId: 1, frameId: 'f', recipe })
			const event = {
				projectId: 1,
				runId: id,
				eventId: 'event',
				type: 'RunCreated',
				status: 'running'
			}
			expect(repo.append(event).seq).toBe(1)
			expect(repo.append(event).seq).toBe(1)
			expect(() => repo.get({ projectId: 2, runId: id })).toThrow('RUN_NOT_FOUND')
			expect(() => repo.create({ projectId: 2, frameId: 'f', recipe, parentRunId: id })).toThrow(
				'PARENT_RUN_NOT_FOUND'
			)
			repo.append({ ...event, eventId: 'end', type: 'RunCompleted', status: 'succeeded' })
			expect(() => repo.append({ ...event, eventId: 'late' })).toThrow('RUN_ALREADY_TERMINAL')
			expect(repo.get({ projectId: 1, runId: id }).events).toHaveLength(2)
		} finally {
			native.close()
		}
	})
	it('ends restart sessions and permits a new run without reconciliation', () => {
		const { native, repo, recipe } = fixture()
		try {
			const { id } = repo.create({ projectId: 1, frameId: 'f', recipe })
			expect(repo.recoverInterrupted()).toBe(1)
			expect(repo.recoverInterrupted()).toBe(0)
			expect(repo.get({ projectId: 1, runId: id }).status).toBe('cancelled')
			expect(repo.create({ projectId: 1, frameId: 'f', recipe }).id).not.toBe(id)
		} finally {
			native.close()
		}
	})
	it('rejects credentials and unknown schema before writing', () => {
		const { native, repo, recipe } = fixture()
		try {
			expect(() =>
				repo.create({ projectId: 1, frameId: 'f', recipe: { ...recipe, version: 99 } })
			).toThrow('INVALID_RUN')
			expect(() =>
				repo.create({
					projectId: 1,
					frameId: 'f',
					recipe: { ...recipe, params: { apiKey: 'secret' } }
				})
			).toThrow('CREDENTIALS')
			expect(repo.list({ projectId: 1, frameId: 'f' })).toEqual([])
		} finally {
			native.close()
		}
	})
})
describe('replay asset verification', () => {
	it('checks content hashes and refuses missing and outside-project files', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dvs-frame-test-'))
		try {
			fs.mkdirSync(path.join(root, 'project'))
			fs.writeFileSync(path.join(root, 'project', 'asset.txt'), 'one')
			fs.writeFileSync(path.join(root, 'outside.txt'), 'private')
			const project = path.join(root, 'project'),
				resource = { id: 'r', projectRelativePath: 'asset.txt' }
			const expected = await validateAssets(project, [resource])
			expect(expected.r.sha256).toHaveLength(64)
			fs.writeFileSync(path.join(project, 'asset.txt'), 'two')
			await expect(validateAssets(project, [resource], expected)).rejects.toThrow('ASSET_CHANGED')
			await expect(
				validateAssets(project, [{ ...resource, projectRelativePath: '../outside.txt' }])
			).rejects.toThrow('ASSET_OUTSIDE_PROJECT')
			await expect(
				validateAssets(project, [{ ...resource, projectRelativePath: 'missing' }])
			).rejects.toThrow()
		} finally {
			fs.rmSync(root, { recursive: true, force: true })
		}
	})
})

it.skipIf(!DatabaseSync)(
	'supersedes stale running and unknown records without locking a second test',
	() => {
		const { native, repo, recipe } = fixture()
		try {
			for (const status of ['running', 'submission_unknown', 'interrupted']) {
				const old = repo.create({ projectId: 1, frameId: 'f', recipe })
				repo.append({ projectId: 1, runId: old.id, eventId: 'old-' + status, type: 'test', status })
				const next = repo.create({ projectId: 1, frameId: 'f', recipe })
				expect(next.id).not.toBe(old.id)
				const record = repo.get({ projectId: 1, runId: old.id })
				expect(record.status).toBe('cancelled')
				expect(record.events.at(-1).type).toBe('RunSuperseded')
				expect(record.events.at(-1).payload.remoteTaskCancelled).toBe(false)
			}
		} finally {
			native.close()
		}
	}
)
