import { getLocalDb } from '../db.mjs'

export function createComfyuiHistorySnapshotsRepo(db = getLocalDb()) {
	const get = db.prepare(
		'SELECT data FROM comfyui_history_snapshots WHERE source_key = ? AND prompt_id = ?'
	)
	const list = db.prepare(
		'SELECT data FROM comfyui_history_snapshots WHERE source_key = ? ORDER BY completed_at DESC'
	)
	const insert = db.prepare(
		'INSERT OR IGNORE INTO comfyui_history_snapshots (source_key, prompt_id, content_hash, completed_at, data) VALUES (?, ?, ?, ?, ?)'
	)
	return {
		get(source, id) {
			const row = get.get(source, id)
			return row ? JSON.parse(row.data) : null
		},
		list(source) {
			return list.all(source).map((row) => JSON.parse(row.data))
		},
		save(source, entry) {
			const existing = get.get(source, entry.promptId)
			if (existing && JSON.parse(existing.data).contentHash !== entry.contentHash)
				throw new Error('Conflicting ComfyUI prompt id')
			insert.run(
				source,
				entry.promptId,
				entry.contentHash,
				entry.timestamp || 0,
				JSON.stringify(entry)
			)
		}
	}
}
