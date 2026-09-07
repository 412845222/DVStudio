// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { runV16 } from '../../../../electron/localdb/migrations.mjs'
import { createDeepSeekHarnessProfilesRepo } from '../../../../electron/localdb/repos/deepseekHarnessProfiles.mjs'

// CI 的 frontend-test 任务使用 `npm ci --ignore-scripts`，不会构建 better-sqlite3
// 原生绑定（.node 文件）。动态导入本身会成功（返回 JS 模块），但 `new Database()`
// 才会加载原生绑定并抛出 "Could not locate the bindings file"。
// 因此用探测实例验证原生绑定是否可用，不可用时跳过（本地与 build-check 任务
// 使用完整 `npm ci`，仍会执行该测试）。
let Database: typeof import('better-sqlite3').default | null = null
try {
	const DatabaseCtor = (await import('better-sqlite3')).default
	const probe = new DatabaseCtor(':memory:')
	probe.close()
	Database = DatabaseCtor
} catch {
	Database = null
}

describe('Harness additive database schema', () => {
	it.skipIf(!Database)('preserves old data and enforces revisions and unique directories', () => {
		const db = new (Database as NonNullable<typeof Database>)(':memory:')
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
