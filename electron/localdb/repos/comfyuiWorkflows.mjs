import crypto from 'node:crypto'

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

function serializeWorkflow(row) {
	if (!row) return null
	return {
		id: row.id,
		name: row.name || '',
		data: parseOptionalJson(row.data) || {},
		createdAt: Number(row.created_at) || nowMs(),
		updatedAt: Number(row.updated_at) || nowMs()
	}
}

export function createComfyuiWorkflowsRepo() {
	const db = getLocalDb()

	const listStmt = db.prepare('SELECT * FROM comfyui_workflows ORDER BY updated_at DESC')
	const getStmt = db.prepare('SELECT * FROM comfyui_workflows WHERE id = ?')
	const insertStmt = db.prepare(
		'INSERT INTO comfyui_workflows (id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
	)
	const updateStmt = db.prepare(
		"UPDATE comfyui_workflows SET name = ?, data = ?, updated_at = ? WHERE id = ?"
	)
	const deleteStmt = db.prepare('DELETE FROM comfyui_workflows WHERE id = ?')

	function list() {
		return listStmt.all().map(serializeWorkflow)
	}

	function get(id) {
		const wid = String(id || '').trim()
		if (!wid) return null
		return serializeWorkflow(getStmt.get(wid))
	}

	function create({ id, name, data } = {}) {
		const wid = String(id || '').trim() || randomId()
		if (getStmt.get(wid)) return { ok: false, error: 'workflow already exists' }
		const now = nowMs()
		const nameText = String(name || '未命名工作流').trim()
		const dataJson = stringifyOptionalJson(data) || '{}'
		insertStmt.run(wid, nameText, dataJson, now, now)
		return { ok: true, workflow: serializeWorkflow(getStmt.get(wid)) }
	}

	function update(id, { name, data } = {}) {
		const wid = String(id || '').trim()
		if (!wid) return { ok: false, error: 'id is required' }
		const existing = getStmt.get(wid)
		if (!existing) return { ok: false, error: 'workflow not found' }
		const newName = name !== undefined ? String(name).trim() : existing.name
		const newData = data !== undefined ? (stringifyOptionalJson(data) || '{}') : existing.data
		updateStmt.run(newName, newData, nowMs(), wid)
		return { ok: true, workflow: serializeWorkflow(getStmt.get(wid)) }
	}

	function remove(id) {
		const wid = String(id || '').trim()
		if (!wid) return { ok: false, error: 'id is required' }
		if (!getStmt.get(wid)) return { ok: false, error: 'workflow not found' }
		deleteStmt.run(wid)
		return { ok: true, id: wid }
	}

	return { list, get, create, update, remove }
}
