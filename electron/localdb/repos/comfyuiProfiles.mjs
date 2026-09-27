import crypto from 'node:crypto'
import { getLocalDb } from '../db.mjs'

export function createComfyuiProfilesRepo(db = getLocalDb()) {
	return {
		getOrCreate(endpoint, userScope = '') {
			const find = db.prepare(
				'SELECT * FROM comfyui_profiles WHERE endpoint = ? AND user_scope = ?'
			)
			let row = find.get(endpoint, userScope)
			if (!row) {
				db.prepare(
					'INSERT INTO comfyui_profiles (id, endpoint, user_scope, created_at) VALUES (?, ?, ?, ?)'
				).run(crypto.randomUUID(), endpoint, userScope, Date.now())
				row = find.get(endpoint, userScope)
			}
			return { id: row.id, endpoint: row.endpoint, userScope: row.user_scope }
		}
	}
}
