import { hashJson, isRecord, promptHash, unwrapPrompt } from '../runtime/historyCatalog.mjs'

export const MAX_BUNDLE_BYTES = 32 * 1024 * 1024
const secretKey =
	/^(api[_-]?key|access[_-]?token|auth[_-]?token|authorization|password|secret|comfy_api_key)$/i

function assertPortable(value, depth = 0) {
	if (depth > 100) throw new Error('恢复包结构过深')
	if (!value || typeof value !== 'object') return
	for (const [key, child] of Object.entries(value)) {
		if (secretKey.test(key) && child)
			throw new Error('模板含凭证字段，不能导出或导入；请先移除凭证字段')
		if (['__proto__', 'constructor', 'prototype'].includes(key))
			throw new Error('恢复包包含不安全字段')
		assertPortable(child, depth + 1)
	}
}

export function createRecoveryBundle({ profile, entries = [], workflows = [] }) {
	const data = {
		format: 'dvstudio-comfy-recovery',
		version: 1,
		profile: profile
			? { id: profile.id, endpoint: profile.endpoint, userScope: profile.userScope || '' }
			: null,
		entries: entries.map((e) => ({
			promptId: e.promptId,
			promptGraph: e.promptGraph,
			workflow: e.workflow || null,
			contentHash: e.contentHash,
			workflowHash: e.workflowHash || '',
			timestamp: e.timestamp || 0,
			schemaVersion: e.schemaVersion || 1
		})),
		workflows: workflows.map((w) => ({ id: w.id, name: w.name, data: w.data }))
	}
	assertPortable(data)
	const bundle = { ...data, checksum: hashJson(data) }
	validateRecoveryBundle(bundle)
	return bundle
}

export function validateRecoveryBundle(bundle) {
	if (!isRecord(bundle) || bundle.format !== 'dvstudio-comfy-recovery' || bundle.version !== 1)
		throw new Error('不支持的 ComfyUI 恢复包格式或版本')
	if (Buffer.byteLength(JSON.stringify(bundle)) > MAX_BUNDLE_BYTES)
		throw new Error('恢复包超过 32 MB')
	const { checksum, ...data } = bundle
	if (checksum !== hashJson(data)) throw new Error('恢复包校验失败，文件可能不完整或已被修改')
	assertPortable(data)
	if (
		!Array.isArray(data.entries) ||
		!Array.isArray(data.workflows) ||
		data.entries.length + data.workflows.length > 10000
	)
		throw new Error('恢复包记录数量无效')
	const ids = new Set()
	for (const e of data.entries) {
		if (
			!isRecord(e) ||
			typeof e.promptId !== 'string' ||
			!e.promptId ||
			ids.has(e.promptId) ||
			!unwrapPrompt(e.promptGraph) ||
			promptHash(e.promptGraph) !== e.contentHash
		)
			throw new Error('恢复包含无效或重复的执行快照')
		ids.add(e.promptId)
	}
	ids.clear()
	for (const w of data.workflows) {
		if (
			!isRecord(w) ||
			typeof w.id !== 'string' ||
			!w.id ||
			ids.has(w.id) ||
			(!unwrapPrompt(w.data) && !(Array.isArray(w.data?.nodes) && Array.isArray(w.data?.links)))
		)
			throw new Error('恢复包含无效或重复的本地模板')
		ids.add(w.id)
	}
	return data
}

// One savepoint covers both tables; conflicts abort without overwriting user data.
export function restoreRecoveryBundle(db, source, bundle) {
	const data = validateRecoveryBundle(bundle)
	db.exec('SAVEPOINT comfy_recovery')
	try {
		for (const entry of data.entries) {
			const existing = db
				.prepare(
					'SELECT content_hash FROM comfyui_history_snapshots WHERE source_key = ? AND prompt_id = ?'
				)
				.get(source, entry.promptId)
			if (existing && existing.content_hash !== entry.contentHash)
				throw new Error('历史 ID 冲突，已取消整个导入')
			db.prepare(
				'INSERT OR IGNORE INTO comfyui_history_snapshots (source_key, prompt_id, content_hash, completed_at, data) VALUES (?, ?, ?, ?, ?)'
			).run(source, entry.promptId, entry.contentHash, entry.timestamp || 0, JSON.stringify(entry))
		}
		for (const w of data.workflows) {
			const existing = db.prepare('SELECT data FROM comfyui_workflows WHERE id = ?').get(w.id)
			if (existing && hashJson(JSON.parse(existing.data)) !== hashJson(w.data))
				throw new Error('本地模板 ID 冲突，已取消整个导入')
			db.prepare(
				'INSERT OR IGNORE INTO comfyui_workflows (id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
			).run(w.id, String(w.name || '恢复的模板'), JSON.stringify(w.data), Date.now(), Date.now())
		}
		db.exec('RELEASE comfy_recovery')
		return { snapshots: data.entries.length, workflows: data.workflows.length }
	} catch (error) {
		db.exec('ROLLBACK TO comfy_recovery')
		db.exec('RELEASE comfy_recovery')
		throw error
	}
}
