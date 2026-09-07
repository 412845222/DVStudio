// @vitest-environment node
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runV16 } from '../../../../electron/localdb/migrations.mjs'
import { createDeepSeekHarnessProfilesRepo } from '../../../../electron/localdb/repos/deepseekHarnessProfiles.mjs'

describe('Harness additive database schema', () => {
	it('preserves old data and enforces revisions and unique directories', () => {
		const db = new Database(':memory:')
		try {
			db.exec(
				"CREATE TABLE projects (id INTEGER, data TEXT); INSERT INTO projects VALUES (1, 'original')"
			)
			runV16(db)
			runV16(db)
			const repo = createDeepSeekHarnessProfilesRepo(db)
			const value = repo.save({ name: 'source', canonicalPath: '/source' }, 0)
			expect(() => repo.save({ ...value, name: 'stale' }, 0)).toThrow('REVISION_CONFLICT')
			expect(() => repo.save({ name: 'duplicate', canonicalPath: '/source' }, 0)).toThrow()
			repo.activate(value.id, 0)
			expect(repo.list().activeProfileId).toBe(value.id)
			expect(() => repo.activate(value.id, 0)).toThrow('REVISION_CONFLICT')
			repo.remove(value.id, 1)
			expect(repo.list().activeProfileId).toBeNull()
			expect(db.prepare('SELECT data FROM projects').get()).toEqual({ data: 'original' })
		} finally {
			db.close()
		}
	})
})
