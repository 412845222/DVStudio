import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'

import { getLocalDb } from '../db.mjs'

function generateTemplateId() {
	return `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function parseTags(raw) {
	if (raw === null || raw === undefined) return []
	if (Array.isArray(raw)) return raw.map((x) => String(x || '').trim()).filter(Boolean)
	const text = String(raw).trim()
	if (!text) return []
	try {
		const parsed = JSON.parse(text)
		if (Array.isArray(parsed)) return parsed.map((x) => String(x || '').trim()).filter(Boolean)
	} catch {}
	return text
		.split(',')
		.map((x) => x.trim())
		.filter(Boolean)
}

function serializeTemplate(row) {
	if (!row) return null
	return {
		id: row.id,
		name: row.name || '',
		description: row.description || '',
		category: row.category || 'other',
		tags: parseTags(row.tags),
		nodeCount: Number(row.node_count) || 0,
		source: row.source || 'user',
		filePath: row.file_path || '',
		coverPath: row.cover_path || '',
		createdAt: Number(row.created_at) || Date.now(),
		updatedAt: Number(row.updated_at) || Date.now()
	}
}

export function createAiworkflowTemplatesRepo({ backendDataDir } = {}) {
	const db = getLocalDb()
	const templatesDir = backendDataDir ? path.resolve(backendDataDir, 'aiworkflow_templates') : null

	if (templatesDir) {
		try {
			fs.mkdirSync(templatesDir, { recursive: true })
		} catch {}
	}

	const listAllStmt = db.prepare(
		'SELECT * FROM aiworkflow_templates WHERE source = ? ORDER BY updated_at DESC'
	)
	const getByIdStmt = db.prepare('SELECT * FROM aiworkflow_templates WHERE id = ?')
	const insertStmt = db.prepare(
		`INSERT OR REPLACE INTO aiworkflow_templates
			(id, name, description, category, tags, node_count, source, file_path, cover_path, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	)
	const deleteStmt = db.prepare('DELETE FROM aiworkflow_templates WHERE id = ?')

	function resolveTemplateFilePath(templateId) {
		if (!templatesDir || !templateId) return ''
		const safeId = String(templateId)
			.replace(/[^a-zA-Z0-9_-]/g, '_')
			.slice(0, 80)
		return path.resolve(templatesDir, `${safeId}.zip`)
	}

	function resolveCoverFilePath(templateId) {
		if (!templatesDir || !templateId) return ''
		const safeId = String(templateId)
			.replace(/[^a-zA-Z0-9_-]/g, '_')
			.slice(0, 80)
		return path.resolve(templatesDir, `${safeId}_cover.png`)
	}

	function list() {
		const rows = listAllStmt.all('user')
		return rows.map(serializeTemplate).filter(Boolean)
	}

	function getById(id) {
		const tid = String(id || '').trim()
		if (!tid) return null
		const row = getByIdStmt.get(tid)
		return serializeTemplate(row)
	}

	function getBlob(id) {
		const tid = String(id || '').trim()
		if (!tid) return { ok: false, error: 'id is required' }
		const tpl = getById(tid)
		if (!tpl) return { ok: false, error: 'template not found' }
		const fp = tpl.filePath
		if (!fp || !fs.existsSync(fp)) return { ok: false, error: 'template file not found' }
		try {
			const buf = fs.readFileSync(fp)
			return { ok: true, buffer: buf }
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	}

	function getCoverBlob(id) {
		const tid = String(id || '').trim()
		if (!tid) return { ok: false, error: 'id is required' }
		const tpl = getById(tid)
		if (!tpl) return { ok: false, error: 'template not found' }
		const fp = tpl.coverPath
		if (!fp || !fs.existsSync(fp)) return { ok: false, error: 'cover not found' }
		try {
			const buf = fs.readFileSync(fp)
			return { ok: true, buffer: buf, mimeType: 'image/png' }
		} catch (err) {
			return { ok: false, error: String(err?.message || err) }
		}
	}

	function save({ id, name, description, category, tags, nodeCount, zipBuffer, coverBuffer } = {}) {
		const nameText = String(name || '').trim()
		if (!nameText) return { ok: false, error: 'name is required' }
		if (!zipBuffer || (!(zipBuffer instanceof Uint8Array) && !Buffer.isBuffer(zipBuffer))) {
			return { ok: false, error: 'zipBuffer is required' }
		}

		const tid = String(id || '').trim() || generateTemplateId()
		const cat = String(category || 'other').trim() || 'other'
		const desc = String(description || '').trim()
		const tagArr = Array.isArray(tags)
			? tags.map((x) => String(x || '').trim()).filter(Boolean)
			: parseTags(tags)
		const tagsJson = JSON.stringify(tagArr)
		const nCount = Math.max(0, Number(nodeCount) || 0)
		const now = Date.now()

		const existing = getById(tid)
		const createdAt = existing?.createdAt ? Number(existing.createdAt) : now

		const filePath = resolveTemplateFilePath(tid)
		if (!filePath) return { ok: false, error: 'templates directory not available' }
		const coverPath = resolveCoverFilePath(tid)

		const run = db.transaction(() => {
			const buf = Buffer.from(zipBuffer)
			fs.writeFileSync(filePath, buf)

			let finalCoverPath = ''
			if (coverBuffer && (coverBuffer instanceof Uint8Array || Buffer.isBuffer(coverBuffer))) {
				const cBuf = Buffer.from(coverBuffer)
				fs.writeFileSync(coverPath, cBuf)
				finalCoverPath = coverPath
			} else {
				try {
					if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath)
				} catch {}
			}

			if (existing) {
				const updateStmt = db.prepare(
					`UPDATE aiworkflow_templates SET name=?, description=?, category=?, tags=?, node_count=?, file_path=?, cover_path=?, updated_at=? WHERE id=?`
				)
				updateStmt.run(nameText, desc, cat, tagsJson, nCount, filePath, finalCoverPath, now, tid)
			} else {
				insertStmt.run(
					tid,
					nameText,
					desc,
					cat,
					tagsJson,
					nCount,
					'user',
					filePath,
					finalCoverPath,
					createdAt,
					now
				)
			}
			return getById(tid)
		})

		try {
			const saved = run()
			return { ok: true, template: saved }
		} catch (err) {
			try {
				fs.unlinkSync(filePath)
			} catch {}
			try {
				if (coverPath && fs.existsSync(coverPath)) fs.unlinkSync(coverPath)
			} catch {}
			return { ok: false, error: String(err?.message || err) }
		}
	}

	function remove(id) {
		const tid = String(id || '').trim()
		if (!tid) return { ok: false, error: 'id is required' }
		const existing = getById(tid)
		if (!existing) return { ok: false, error: 'template not found' }

		if (existing.filePath && fs.existsSync(existing.filePath)) {
			try {
				fs.unlinkSync(existing.filePath)
			} catch {}
		}
		if (existing.coverPath && fs.existsSync(existing.coverPath)) {
			try {
				fs.unlinkSync(existing.coverPath)
			} catch {}
		} else {
			const coverFp = resolveCoverFilePath(tid)
			if (coverFp && fs.existsSync(coverFp)) {
				try {
					fs.unlinkSync(coverFp)
				} catch {}
			}
		}
		deleteStmt.run(tid)
		return { ok: true }
	}

	return { list, getById, getBlob, getCoverBlob, save, remove, templatesDir }
}
