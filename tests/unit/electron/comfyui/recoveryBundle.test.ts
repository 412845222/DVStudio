// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import {
	createRecoveryBundle,
	validateRecoveryBundle,
	restoreRecoveryBundle
} from '../../../../electron/backend/modules/comfyui/recovery/recoveryBundle.mjs'
import { promptHash } from '../../../../electron/backend/modules/comfyui/runtime/historyCatalog.mjs'
import { runV17, runV18 } from '../../../../electron/localdb/migrations.mjs'
import { createComfyuiProfilesRepo } from '../../../../electron/localdb/repos/comfyuiProfiles.mjs'
import { createComfyuiHistorySnapshotsRepo } from '../../../../electron/localdb/repos/comfyuiHistorySnapshots.mjs'
import { archiveScope } from '../../../../electron/backend/modules/comfyui/runtime/archiveScope.mjs'

let DatabaseSync: typeof import('node:sqlite').DatabaseSync | undefined
try {
	;({ DatabaseSync } = createRequire(import.meta.url)('node:sqlite'))
} catch {
	/* Node <22 */
}
const graph = { '1': { class_type: 'Test', inputs: { text: 'user content' } } }
const snapshot = { promptId: 'p', contentHash: promptHash(graph), promptGraph: graph, timestamp: 1 }
const template = { id: 't', name: 'Template', data: graph }

describe('Comfy recovery bundle validation', () => {
	it('rejects tampering and embedded credentials', () => {
		const bundle = createRecoveryBundle({ entries: [snapshot], workflows: [template] })
		expect(validateRecoveryBundle(bundle).entries).toHaveLength(1)
		expect(() => validateRecoveryBundle({ ...bundle, version: 99 })).toThrow()
		expect(() => validateRecoveryBundle({ ...bundle, entries: [] })).toThrow('校验')
		expect(() =>
			createRecoveryBundle({
				workflows: [
					{ ...template, data: { '1': { class_type: 'Partner', inputs: { api_key: 'private' } } } }
				]
			})
		).toThrow('凭证')
	})
})

describe.skipIf(!DatabaseSync)('Comfy recovery across installation locations', () => {
	function open() {
		const db = new DatabaseSync!(':memory:')
		runV17(db)
		runV18(db)
		runV18(db)
		db.exec(
			"CREATE TABLE comfyui_workflows (id TEXT PRIMARY KEY, name TEXT, data TEXT, created_at INTEGER, updated_at INTEGER); CREATE TABLE projects (name TEXT); INSERT INTO projects VALUES ('unrelated');"
		)
		return db
	}
	it('restores into a new profile, is idempotent and keeps unrelated data intact', () => {
		const db = open()
		try {
			const profiles = createComfyuiProfilesRepo(db)
			const first = profiles.getOrCreate('http://old')
			expect(profiles.getOrCreate('http://old').id).toBe(first.id)
			const next = profiles.getOrCreate('http://new')
			expect(next.id).not.toBe(first.id)
			const bundle = createRecoveryBundle({
				profile: first,
				entries: [snapshot],
				workflows: [template]
			})
			const source = `profile://${next.id}`
			restoreRecoveryBundle(db, source, bundle)
			restoreRecoveryBundle(db, source, bundle)
			const repo = createComfyuiHistorySnapshotsRepo(db)
			expect(repo.list(source)).toHaveLength(1)
			expect(db.prepare('SELECT COUNT(*) AS n FROM comfyui_workflows').get()?.n).toBe(1)
			expect(db.prepare('SELECT name FROM projects').get()?.name).toBe('unrelated')
		} finally {
			db.close()
		}
	})
	it('rolls back the entire import on a template conflict', () => {
		const db = open()
		try {
			db.prepare('INSERT INTO comfyui_workflows VALUES (?, ?, ?, 0, 0)').run('t', 'existing', '{}')
			const bundle = createRecoveryBundle({ entries: [snapshot], workflows: [template] })
			expect(() => restoreRecoveryBundle(db, 'target', bundle)).toThrow('冲突')
			expect(db.prepare('SELECT COUNT(*) AS n FROM comfyui_history_snapshots').get()?.n).toBe(0)
			expect(db.prepare('SELECT data FROM comfyui_workflows').get()?.data).toBe('{}')
		} finally {
			db.close()
		}
	})
	it('reads legacy URL archives while new writes use an isolated stable profile', () => {
		const db = open()
		try {
			const repo = createComfyuiHistorySnapshotsRepo(db)
			repo.save('http://old', snapshot)
			const ctx = {
				localdb: { comfyuiHistorySnapshots: repo, comfyuiProfiles: createComfyuiProfilesRepo(db) }
			}
			const scope = archiveScope(ctx, 'http://old')
			expect(scope.repo.get('http://old', 'p').contentHash).toBe(snapshot.contentHash)
			scope.repo.save('http://old', { ...snapshot, promptId: 'new' })
			expect(scope.repo.list('http://old')).toHaveLength(2)
			expect(archiveScope(ctx, 'http://other').repo.list()).toHaveLength(0)
			expect(repo.list('http://old')).toHaveLength(1)
		} finally {
			db.close()
		}
	})
})
