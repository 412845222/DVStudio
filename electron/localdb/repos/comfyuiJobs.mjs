import crypto from 'node:crypto'

import { getLocalDb } from '../db.mjs'
import { parseOptionalJson, stringifyOptionalJson } from '../json.mjs'

function randomId() {
	if (crypto.randomUUID) return crypto.randomUUID()
	const bytes = crypto.randomBytes(16)
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	return `cjob-${bytes.toString('hex').slice(0, 10)}`
}

function nowMs() {
	return Date.now()
}

function serializeJob(row) {
	if (!row) return null
	return {
		id: row.id,
		projectId: row.project_id ?? null,
		status: row.status || 'queued',
		progress: Number(row.progress) || 0,
		outputs: parseOptionalJson(row.outputs) || {},
		error: row.error || '',
		createdAt: Number(row.created_at) || nowMs(),
		updatedAt: Number(row.updated_at) || nowMs()
	}
}

export function createComfyuiJobsRepo() {
	const db = getLocalDb()

	const listByProjectStmt = db.prepare(
		'SELECT * FROM comfyui_jobs WHERE project_id = ? ORDER BY created_at DESC'
	)
	const getStmt = db.prepare('SELECT * FROM comfyui_jobs WHERE id = ?')
	const insertStmt = db.prepare(
		'INSERT INTO comfyui_jobs (id, project_id, status, progress, outputs, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
	)
	const updateStmt = db.prepare(
		"UPDATE comfyui_jobs SET status = ?, progress = ?, outputs = ?, error = ?, updated_at = ? WHERE id = ?"
	)
	const deleteStmt = db.prepare('DELETE FROM comfyui_jobs WHERE id = ?')

	function create({ id, projectId } = {}) {
		const jid = String(id || '').trim() || randomId()
		const pid = projectId !== null && projectId !== undefined ? Number(projectId) : null
		const now = nowMs()
		if (getStmt.get(jid)) return { ok: false, error: 'job already exists' }
		insertStmt.run(jid, pid, 'queued', 0, '{}', '', now, now)
		return { ok: true, job: serializeJob(getStmt.get(jid)) }
	}

	function get(id) {
		const jid = String(id || '').trim()
		if (!jid) return null
		return serializeJob(getStmt.get(jid))
	}

	function updateStatus(id, { status, progress, outputs, error } = {}) {
		const jid = String(id || '').trim()
		if (!jid) return { ok: false, error: 'id is required' }
		const existing = getStmt.get(jid)
		if (!existing) return { ok: false, error: 'job not found' }
		const newStatus = String(status || existing.status || 'queued').trim()
		const newProgress = progress !== undefined ? Number(progress) : Number(existing.progress)
		let newOutputs = existing.outputs
		if (outputs !== undefined) {
			newOutputs = stringifyOptionalJson(outputs) || '{}'
		}
		const newError = error !== undefined ? String(error) : existing.error
		updateStmt.run(newStatus, newProgress, newOutputs, newError, nowMs(), jid)
		return { ok: true, job: serializeJob(getStmt.get(jid)) }
	}

	function listByProject(projectId) {
		const pid = Number(projectId)
		if (!Number.isFinite(pid) || pid <= 0) return []
		return listByProjectStmt.all(pid).map(serializeJob)
	}

	function remove(id) {
		const jid = String(id || '').trim()
		if (!jid) return { ok: false, error: 'id is required' }
		if (!getStmt.get(jid)) return { ok: false, error: 'job not found' }
		deleteStmt.run(jid)
		return { ok: true, id: jid }
	}

	return { create, get, updateStatus, listByProject, remove }
}
