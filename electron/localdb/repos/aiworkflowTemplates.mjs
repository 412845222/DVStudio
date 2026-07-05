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
	return text.split(',').map((x) => x.trim()).filter(Boolean)
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
		createdAt: Number(row.created_at) || Date.now(),
		updatedAt: Number(row.updated_at) || Date.now()
	}
}

export function createAiworkflowTemplatesRepo({ backendDataDir } = {}) {
	const db = getLocalDb()
	const templatesDir = backendDataDir ? path.resolve(backendDataDir, 'aiworkflow_templates') : null

	if (templatesDir) {
		try { fs.mkdirSync(templatesDir, { recursive: true }) } catch {}
	}

	const listAllStmt = db.prepare(
		'SELECT * FROM aiworkflow_templates WHERE source = ? ORDER BY updated_at DESC'
	)
	const getByIdStmt = db.prepare('SELECT * FROM aiworkflow_templates WHERE id = ?')
	const insertStmt = db.prepare(
		`INSERT INTO aiworkflow_templates
			(id, name, description, category, tags, node_count, source, file_path, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	)
	const deleteStmt = db.prepare('DELETE FROM aiworkflow_templates WHERE id = ?')

	function resolveTemplateFilePath(templateId) {
		if (!templatesDir || !templateId) return ''
		const safeId = String(templateId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
		return path.resolve(templatesDir, `${safeId}.zip`)
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

	function save({ id, name, description, category, tags, nodeCount, zipBuffer } = {}) {
		const nameText = String(name || '').trim()
		if (!nameText) return { ok: false, error: 'name is required' }
		if (!zipBuffer || !(zipBuffer instanceof Uint8Array) && !Buffer.isBuffer(zipBuffer)) {
			return { ok: false, error: 'zipBuffer is required' }
		}

		const tid = String(id || '').trim() || generateTemplateId()
		const cat = String(category || 'other').trim() || 'other'
		const desc = String(description || '').trim()
		const tagArr = Array.isArray(tags) ? tags.map((x) => String(x || '').trim()).filter(Boolean) : parseTags(tags)
		const tagsJson = JSON.stringify(tagArr)
		const nCount = Math.max(0, Number(nodeCount) || 0)
		const now = Date.now()

		const filePath = resolveTemplateFilePath(tid)
		if (!filePath) return { ok: false, error: 'templates directory not available' }

		const run = db.transaction(() => {
			const buf = Buffer.from(zipBuffer)
			fs.writeFileSync(filePath, buf)
			insertStmt.run(tid, nameText, desc, cat, tagsJson, nCount, 'user', filePath, now, now)
			return getById(tid)
		})

		try {
			const saved = run()
			return { ok: true, template: saved }
		} catch (err) {
			try { fs.unlinkSync(filePath) } catch {}
			return { ok: false, error: String(err?.message || err) }
		}
	}

	function remove(id) {
		const tid = String(id || '').trim()
		if (!tid) return { ok: false, error: 'id is required' }
		const existing = getById(tid)
		if (!existing) return { ok: false, error: 'template not found' }

		if (existing.filePath && fs.existsSync(existing.filePath)) {
			try { fs.unlinkSync(existing.filePath) } catch {}
		}
		deleteStmt.run(tid)
		return { ok: true }
	}

	return { list, getById, getBlob, save, remove, templatesDir }
}
