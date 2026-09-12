// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
// Built-in SQLite avoids rebuilding the application's Electron ABI dependencies.
let DatabaseSync: any
try {
	;({ DatabaseSync } = createRequire(import.meta.url)('node:sqlite'))
} catch {
	/* Node < 22 */
}
import { runV17 } from '../../../../electron/localdb/migrations.mjs'
import { createComfyuiHistorySnapshotsRepo } from '../../../../electron/localdb/repos/comfyuiHistorySnapshots.mjs'

describe.skipIf(!DatabaseSync)('ComfyUI archive migration and isolation', () => {
	it('preserves existing data and isolates immutable snapshots by server', () => {
		const db = new DatabaseSync(':memory:')
		try {
			db.exec("CREATE TABLE projects (name TEXT); INSERT INTO projects VALUES ('existing');")
			runV17(db)
			runV17(db)
			const repo = createComfyuiHistorySnapshotsRepo(db)
			const entry = { promptId: 'same', contentHash: 'one', timestamp: 1, promptGraph: {} }
			repo.save('server-a', entry)
			repo.save('server-a', entry)
			repo.save('server-b', { ...entry, contentHash: 'two' })
			expect(() => repo.save('server-a', { ...entry, contentHash: 'two' })).toThrow('Conflicting')
			expect(repo.list('server-a')).toEqual([entry])
			expect(repo.get('server-b', 'same').contentHash).toBe('two')
			expect(db.prepare('SELECT name FROM projects').get()?.name).toBe('existing')
		} finally {
			db.close()
		}
	})
})
