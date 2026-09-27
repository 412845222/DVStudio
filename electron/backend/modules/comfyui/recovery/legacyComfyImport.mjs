import { createRequire } from 'node:module'
import { createRecoveryBundle } from './recoveryBundle.mjs'

const require = createRequire(import.meta.url)

// Explicit user-selected database only. Never migrate/open the old full DB writable.
export function readLegacyComfyBundle(file, base) {
	const Database = require('better-sqlite3')
	const db = new Database(file, { readonly: true, fileMustExist: true })
	try {
		const has = (name) =>
			Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name))
		const sources = [base]
		if (has('comfyui_profiles')) {
			const p = db
				.prepare("SELECT id FROM comfyui_profiles WHERE endpoint=? AND user_scope='' ")
				.get(base)
			if (p) sources.push(`profile://${p.id}`)
		}
		const entries = new Map()
		if (has('comfyui_history_snapshots')) {
			for (const source of sources) {
				for (const row of db
					.prepare('SELECT data FROM comfyui_history_snapshots WHERE source_key=?')
					.all(source)) {
					const e = JSON.parse(row.data)
					if (entries.has(e.promptId) && entries.get(e.promptId).contentHash !== e.contentHash)
						throw new Error('旧库存在冲突的历史 ID')
					entries.set(e.promptId, e)
				}
			}
		}
		const workflows = has('comfyui_workflows')
			? db
					.prepare('SELECT id, name, data FROM comfyui_workflows')
					.all()
					.map((w) => ({ ...w, data: JSON.parse(w.data) }))
			: []
		if (!entries.size && !workflows.length)
			throw new Error('旧库未找到该服务的快照或本地模板，请核对原服务地址')
		return createRecoveryBundle({ entries: [...entries.values()], workflows })
	} finally {
		db.close()
	}
}
