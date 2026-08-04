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
	return `exp-${bytes.toString('hex').slice(0, 12)}`
}

function nowMs() {
	return Date.now()
}

function serializeJob(row) {
	if (!row) return null
	return {
		id: row.id,
		projectId: row.project_id ?? null,
		status: row.status || 'pending',
		config: parseOptionalJson(row.config) || {},
		progress: Number(row.progress) || 0,
		error: row.error || '',
		outputPath: row.output_path || '',
		createdAt: Number(row.created_at) || nowMs(),
		updatedAt: Number(row.updated_at) || nowMs()
	}
}

function serializeFrame(row) {
	if (!row) return null
	return {
		id: row.id,
		jobId: row.job_id,
		frameIndex: Number(row.frame_index) || 0,
		filePath: row.file_path || '',
		createdAt: Number(row.created_at) || nowMs()
	}
}

export function createExportJobsRepo({ backendDataDir } = {}) {
	const db = getLocalDb()
	const exportDir = backendDataDir ? path.resolve(backendDataDir, 'export') : null

	const listByProjectStmt = db.prepare(
		'SELECT * FROM export_jobs WHERE project_id = ? ORDER BY created_at DESC'
	)
	const getJobStmt = db.prepare('SELECT * FROM export_jobs WHERE id = ?')
	const insertJobStmt = db.prepare(
		'INSERT INTO export_jobs (id, project_id, status, config, progress, error, output_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
	)
	const updateStatusStmt = db.prepare(
		'UPDATE export_jobs SET status = ?, progress = ?, error = ?, output_path = ?, updated_at = ? WHERE id = ?'
	)
	const deleteFramesStmt = db.prepare('DELETE FROM export_frames WHERE job_id = ?')
	const deleteJobStmt = db.prepare('DELETE FROM export_jobs WHERE id = ?')

	const addFrameStmt = db.prepare(
		'INSERT INTO export_frames (job_id, frame_index, file_path, created_at) VALUES (?, ?, ?, ?)'
	)
	const getFramesStmt = db.prepare(
		'SELECT * FROM export_frames WHERE job_id = ? ORDER BY frame_index ASC'
	)

	function resolveFrameDir(jobId) {
		if (!exportDir) return null
		const dir = path.resolve(exportDir, jobId, 'frames')
		fs.mkdirSync(dir, { recursive: true })
		return dir
	}

	function create({ id, projectId, config } = {}) {
		const jid = String(id || '').trim() || randomId()
		const pid = projectId !== null && projectId !== undefined ? Number(projectId) : null
		const now = nowMs()
		if (getJobStmt.get(jid)) return { ok: false, error: 'job already exists' }
		insertJobStmt.run(
			jid,
			pid,
			'pending',
			stringifyOptionalJson(config) || '{}',
			0,
			'',
			'',
			now,
			now
		)
		if (exportDir) {
			try {
				fs.mkdirSync(path.resolve(exportDir, jid), { recursive: true })
			} catch {}
		}
		return { ok: true, job: serializeJob(getJobStmt.get(jid)) }
	}

	function get(id) {
		const jid = String(id || '').trim()
		if (!jid) return null
		return serializeJob(getJobStmt.get(jid))
	}

	function updateStatus(id, { status, progress, error, outputPath } = {}) {
		const jid = String(id || '').trim()
		if (!jid) return { ok: false, error: 'id is required' }
		const existing = getJobStmt.get(jid)
		if (!existing) return { ok: false, error: 'job not found' }
		const newStatus = String(status || existing.status || 'pending').trim()
		const newProgress = progress !== undefined ? Number(progress) : Number(existing.progress)
		const newError = error !== undefined ? String(error) : existing.error
		const newOutputPath = outputPath !== undefined ? String(outputPath) : existing.output_path
		updateStatusStmt.run(newStatus, newProgress, newError, newOutputPath, nowMs(), jid)
		return { ok: true, job: serializeJob(getJobStmt.get(jid)) }
	}

	function addFrame({ jobId, frameIndex, filePath } = {}) {
		const jid = String(jobId || '').trim()
		if (!jid) return { ok: false, error: 'jobId is required' }
		if (!getJobStmt.get(jid)) return { ok: false, error: 'job not found' }
		const idx = Math.max(0, Number(frameIndex) || 0)
		const fp = String(filePath || '').trim()
		if (!fp) return { ok: false, error: 'filePath is required' }
		const now = nowMs()
		const info = addFrameStmt.run(jid, idx, fp, now)
		return { ok: true, frameId: Number(info.lastInsertRowid) }
	}

	function getFrames(jobId) {
		const jid = String(jobId || '').trim()
		if (!jid) return []
		return getFramesStmt.all(jid).map(serializeFrame)
	}

	function listByProject(projectId) {
		const pid = Number(projectId)
		if (!Number.isFinite(pid) || pid <= 0) return []
		return listByProjectStmt.all(pid).map(serializeJob)
	}

	function remove(id) {
		const jid = String(id || '').trim()
		if (!jid) return { ok: false, error: 'id is required' }
		if (!getJobStmt.get(jid)) return { ok: false, error: 'job not found' }
		const run = db.transaction(() => {
			deleteFramesStmt.run(jid)
			deleteJobStmt.run(jid)
		})
		run()
		if (exportDir) {
			try {
				fs.rmSync(path.resolve(exportDir, jid), { recursive: true, force: true })
			} catch {}
		}
		return { ok: true, id: jid }
	}

	return { create, get, updateStatus, addFrame, getFrames, listByProject, remove, resolveFrameDir }
}
