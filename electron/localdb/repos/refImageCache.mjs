import { getLocalDb } from '../db.mjs'

function nowMs() {
	return Date.now()
}

function serializeEntry(row) {
	if (!row) return null
	return {
		id: row.id,
		provider: row.provider || '',
		originalPath: row.original_path || '',
		cacheKey: row.cache_key || '',
		createdAt: Number(row.created_at) || nowMs()
	}
}

export function createRefImageCacheRepo() {
	const db = getLocalDb()

	const getStmt = db.prepare(
		'SELECT * FROM ref_image_cache WHERE provider = ? AND cache_key = ? LIMIT 1'
	)
	const putStmt = db.prepare(
		'INSERT OR REPLACE INTO ref_image_cache (id, provider, original_path, cache_key, created_at) VALUES (?, ?, ?, ?, ?)'
	)
	const deleteByProviderStmt = db.prepare('DELETE FROM ref_image_cache WHERE provider = ?')
	const deleteOldStmt = db.prepare(
		'DELETE FROM ref_image_cache WHERE created_at < ?'
	)

	function makeId(provider, cacheKey) {
		return `${String(provider)}::${String(cacheKey)}`
	}

	function get(provider, cacheKey) {
		const p = String(provider || '').trim()
		const k = String(cacheKey || '').trim()
		if (!p || !k) return null
		return serializeEntry(getStmt.get(p, k))
	}

	function put({ provider, originalPath, cacheKey } = {}) {
		const p = String(provider || '').trim()
		const k = String(cacheKey || '').trim()
		const op = String(originalPath || '').trim()
		if (!p || !k) return { ok: false, error: 'provider and cacheKey are required' }
		const id = makeId(p, k)
		putStmt.run(id, p, op, k, nowMs())
		return { ok: true, entry: serializeEntry(getStmt.get(p, k)) }
	}

	function clearProvider(provider) {
		const p = String(provider || '').trim()
		if (!p) return { ok: false, error: 'provider is required' }
		deleteByProviderStmt.run(p)
		return { ok: true }
	}

	function clearOlderThan(ms) {
		const cutoff = Number(ms)
		if (!Number.isFinite(cutoff) || cutoff <= 0) return { ok: false, error: 'invalid ms' }
		const info = deleteOldStmt.run(nowMs() - cutoff)
		return { ok: true, deleted: info.changes }
	}

	return { get, put, clearProvider, clearOlderThan }
}
