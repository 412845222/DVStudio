import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'

import { getLocalDb } from '../db.mjs'
import { parseOptionalJson, stringifyOptionalJson } from '../json.mjs'

function randomId() {
	if (crypto.randomUUID) return crypto.randomUUID()
	const bytes = crypto.randomBytes(16)
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	return bytes.toString('hex')
}

function nowMs() {
	return Date.now()
}

function parseTags(raw) {
	if (raw === null || raw === undefined) return []
	if (Array.isArray(raw)) return raw.map(x => String(x || '').trim()).filter(Boolean)
	const text = String(raw).trim()
	if (!text) return []
	try {
		const parsed = JSON.parse(text)
		if (Array.isArray(parsed)) return parsed.map(x => String(x || '').trim()).filter(Boolean)
	} catch {}
	return text.split(',').map(x => x.trim()).filter(Boolean)
}

function serializeComponent(row) {
	if (!row) return null
	return {
		id: row.id,
		templateId: row.template_id || '',
		name: row.name || '',
		category: row.category || '',
		thumbnailPath: row.thumbnail_path || '',
		thumbAssetId: row.thumb_asset_id || '',
		thumbUrl: '',
		schemaVersion: Number(row.schema_version) || 1,
		template: parseOptionalJson(row.data) || {},
		tags: parseTags(row.tags),
		source: row.source || 'builtin',
		createdAt: new Date(Number(row.created_at) || nowMs()).toISOString(),
		savedAt: new Date(Number(row.updated_at) || nowMs()).toISOString()
	}
}

export function createEditorComponentsRepo({ backendDataDir } = {}) {
	const db = getLocalDb()
	const thumbsDir = backendDataDir ? path.resolve(backendDataDir, 'editor_thumbs') : null

	const listAllStmt = db.prepare('SELECT * FROM editor_components ORDER BY updated_at DESC')
	const getByIdStmt = db.prepare('SELECT * FROM editor_components WHERE id = ?')
	const getByTemplateIdStmt = db.prepare('SELECT * FROM editor_components WHERE template_id = ?')
	const insertStmt = db.prepare(
		`INSERT INTO editor_components
			(id, template_id, name, category, thumbnail_path, thumb_asset_id, schema_version, data, tags, source, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	)
	const updateStmt = db.prepare(
		`UPDATE editor_components SET name = ?, category = ?, thumbnail_path = ?, thumb_asset_id = ?,
			schema_version = ?, data = ?, tags = ?, updated_at = ? WHERE id = ?`
	)
	const updateByTemplateIdStmt = db.prepare(
		`UPDATE editor_components SET name = ?, category = ?, thumbnail_path = ?, thumb_asset_id = ?,
			schema_version = ?, data = ?, tags = ?, updated_at = ? WHERE template_id = ?`
	)
	const deleteStmt = db.prepare('DELETE FROM editor_components WHERE id = ?')
	const deleteByTemplateIdStmt = db.prepare('DELETE FROM editor_components WHERE template_id = ?')

	if (thumbsDir) {
		try { fs.mkdirSync(thumbsDir, { recursive: true }) } catch {}
	}

	function resolveThumbPath(filename) {
		if (!thumbsDir || !filename) return ''
		return path.resolve(thumbsDir, filename)
	}

	function saveThumbnailFromDataUrl(dataUrl, templateId) {
		if (!thumbsDir || !dataUrl || typeof dataUrl !== 'string') return ''
		const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
		if (!match) return ''
		const mime = match[1]
		const raw = match[2]
		let ext = 'png'
		if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg'
		else if (mime.includes('webp')) ext = 'webp'
		else if (mime.includes('gif')) ext = 'gif'
		try {
			const buf = Buffer.from(raw, 'base64')
			const fname = `${String(templateId || randomId()).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)}_${Date.now()}.${ext}`
			const fp = path.resolve(thumbsDir, fname)
			fs.writeFileSync(fp, buf)
			return fp
		} catch {
			return ''
		}
	}

	function computeThumbUrl(row) {
		if (row.thumb_asset_id) return `dweb://project-assets?id=${encodeURIComponent(row.thumb_asset_id)}`
		if (row.thumbnail_path) {
			const absPath = path.isAbsolute(row.thumbnail_path) ? row.thumbnail_path : resolveThumbPath(row.thumbnail_path)
			if (absPath && fs.existsSync(absPath)) {
				return `file:///${absPath.replace(/\\/g, '/')}`
			}
		}
		return ''
	}

	function list({ q, limit, offset } = {}) {
		let rows = listAllStmt.all()
		if (q) {
			const query = String(q).trim().toLowerCase()
			if (query) {
				rows = rows.filter(r =>
					String(r.name || '').toLowerCase().includes(query) ||
					String(r.template_id || '').toLowerCase().includes(query)
				)
			}
		}
		const total = rows.length
		const off = Math.max(0, Number(offset) || 0)
		const lim = Math.max(1, Math.min(1000, Number(limit) || 200))
		const paged = rows.slice(off, off + lim)
		const items = paged.map(r => {
			const s = serializeComponent(r)
			s.thumbUrl = computeThumbUrl(r)
			return s
		})
		return { items, total, limit: lim, offset: off }
	}

	function getById(id) {
		const cid = String(id || '').trim()
		if (!cid) return null
		const row = getByIdStmt.get(cid)
		if (!row) return null
		const s = serializeComponent(row)
		s.thumbUrl = computeThumbUrl(row)
		return s
	}

	function getByTemplateId(templateId) {
		const tid = String(templateId || '').trim()
		if (!tid) return null
		const row = getByTemplateIdStmt.get(tid)
		if (!row) return null
		const s = serializeComponent(row)
		s.thumbUrl = computeThumbUrl(row)
		return s
	}

	function upsert({ id, templateId, name, template, thumbAssetId, thumbDataUrl, category, tags } = {}) {
		const tid = String(templateId || '').trim()
		const nameText = String(name || '').trim()
		if (!tid) return { ok: false, error: 'templateId is required' }
		if (!nameText) return { ok: false, error: 'name is required' }
		if (!template || typeof template !== 'object') return { ok: false, error: 'template must be object' }

		const coerced = { ...template }
		coerced.templateId = tid
		coerced.name = nameText
		if (!coerced.schemaVersion && !coerced.schema_version) coerced.schemaVersion = 1

		const schemaVer = Number(coerced.schemaVersion || coerced.schema_version || 1) || 1
		const catText = String(category || '').trim()
		const tagArr = Array.isArray(tags) ? tags.map(x => String(x || '').trim()).filter(Boolean) : parseTags(tags)
		const tagsJson = stringifyOptionalJson(tagArr) || '[]'

		let thumbPath = ''
		if (thumbDataUrl) {
			thumbPath = saveThumbnailFromDataUrl(thumbDataUrl, tid)
		}

		const existing = getByTemplateIdStmt.get(tid)
		const now = nowMs()
		const dataJson = stringifyOptionalJson(coerced) || '{}'
		const tAssetId = thumbAssetId !== undefined ? String(thumbAssetId || '').trim() : (existing?.thumb_asset_id || '')
		const tPath = thumbPath || existing?.thumbnail_path || ''

		if (existing) {
			updateByTemplateIdStmt.run(
				nameText,
				catText || existing.category || '',
				tPath,
				tAssetId,
				schemaVer,
				dataJson,
				tagsJson,
				now,
				tid
			)
			const updated = getByTemplateIdStmt.get(tid)
			const s = serializeComponent(updated)
			s.thumbUrl = computeThumbUrl(updated)
			return { ok: true, item: s, upserted: true, created: false }
		} else {
			const cid = String(id || '').trim() || randomId()
			insertStmt.run(
				cid,
				tid,
				nameText,
				catText,
				tPath,
				tAssetId,
				schemaVer,
				dataJson,
				tagsJson,
				'user',
				now,
				now
			)
			const created = getByIdStmt.get(cid)
			const s = serializeComponent(created)
			s.thumbUrl = computeThumbUrl(created)
			return { ok: true, item: s, upserted: true, created: true }
		}
	}

	function remove(id) {
		const cid = String(id || '').trim()
		if (!cid) return { ok: false, error: 'id is required' }
		const existing = getByIdStmt.get(cid)
		if (!existing) {
			const byTid = getByTemplateIdStmt.get(cid)
			if (!byTid) return { ok: false, error: 'component not found' }
			if (byTid.thumbnail_path && thumbsDir) {
				try { fs.unlinkSync(byTid.thumbnail_path) } catch {}
			}
			deleteByTemplateIdStmt.run(cid)
			return { ok: true }
		}
		if (existing.thumbnail_path && thumbsDir) {
			try { fs.unlinkSync(existing.thumbnail_path) } catch {}
		}
		deleteStmt.run(cid)
		return { ok: true }
	}

	function importComponents(items = []) {
		if (!Array.isArray(items)) return { ok: false, error: 'items must be an array' }
		let imported = 0
		const failed = []
		for (let i = 0; i < items.length; i++) {
			const it = items[i]
			if (!it || typeof it !== 'object') {
				failed.push({ index: i, error: 'item must be object' })
				continue
			}
			const result = upsert({
				id: it.id,
				templateId: it.templateId,
				name: it.name,
				template: it.template,
				thumbAssetId: it.thumbAssetId,
				thumbDataUrl: it.thumbDataUrl,
				category: it.category,
				tags: it.tags
			})
			if (result.ok) imported++
			else failed.push({ index: i, error: result.error })
		}
		return { ok: true, imported, failed }
	}

	return { list, getById, getByTemplateId, upsert, remove, importComponents, resolveThumbPath }
}
