import fs from 'node:fs'
import path from 'node:path'
import { internalError, invalidParamsError, notFoundError } from '../../core/errors.mjs'

function getRepo(ctx) {
	const repo = ctx.localdb?.exportJobs
	if (!repo) throw internalError('exportJobs repo not available')
	return repo
}

function extFromFilename(filename) {
	const ext = path.extname(String(filename || '')).toLowerCase().replace('.', '')
	if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) return '.' + ext
	return '.png'
}

function frameFilename(frameIndex, ext) {
	const idx = Math.max(0, Number(frameIndex) || 0)
	return `frame_${String(idx).padStart(6, '0')}${ext}`
}

const STATUS_MAP = {
	pending: 'queued',
	processing: 'running',
	completed: 'done',
	failed: 'error',
	cancelled: 'error',
}

function serializeJobForFrontend(job, frames = []) {
	if (!job) return null
	const config = job.config && typeof job.config === 'object' ? job.config : {}
	const frameCount = Number(config.frameCount || config.expectedFrames) || 0
	const receivedFrames = Array.isArray(frames) ? frames.length : 0
	const format = String(config.format || 'mp4').toLowerCase()
	const outputPath = String(job.outputPath || '')
	const fileName = outputPath ? path.basename(outputPath) : ''
	const serverPath = outputPath
	return {
		jobId: job.id,
		id: job.id,
		status: STATUS_MAP[job.status] || job.status || 'queued',
		progress: Number(job.progress) || 0,
		format: format,
		width: Number(config.width) || undefined,
		height: Number(config.height) || undefined,
		fps: Number(config.fps) || undefined,
		frameCount: frameCount || undefined,
		expectedFrames: frameCount || undefined,
		receivedFrames: receivedFrames,
		fileName: fileName || undefined,
		downloadUrl: undefined,
		serverPath: serverPath || undefined,
		outputPath: serverPath || undefined,
		error: String(job.error || '') || undefined,
		projectId: job.projectId || undefined,
		createdAt: job.createdAt,
		updatedAt: job.updatedAt,
	}
}

function normalizeCreatePayload(payload) {
	const p = payload || {}
	if (p.config && typeof p.config === 'object') {
		return { projectId: p.projectId, config: p.config }
	}
	const config = {
		format: p.format || 'mp4',
		width: Number(p.width) || 1920,
		height: Number(p.height) || 1080,
		fps: Number(p.fps) || 30,
		frameCount: Number(p.frameCount) || 0,
		quality: p.quality || 'high',
		uploadMode: p.uploadMode,
		ignoreStageBackground: !!p.ignoreStageBackground,
		snapshot: p.snapshot || null,
	}
	if (p.expectedFrames) config.expectedFrames = Number(p.expectedFrames)
	return { projectId: p.projectId, config }
}

export function createJob(ctx, payload) {
	const repo = getRepo(ctx)
	const normalized = normalizeCreatePayload(payload)
	const projectId = normalized.projectId !== undefined ? Number(normalized.projectId) : null
	const config = normalized.config || {}
	const result = repo.create({ projectId, config })
	if (!result.ok) throw internalError(result.error || 'failed to create export job')
	const frames = repo.getFrames(result.job.id)
	return serializeJobForFrontend(result.job, frames)
}

export function getJob(ctx, payload) {
	const repo = getRepo(ctx)
	const id = String(payload?.id || payload?.jobId || '').trim()
	if (!id) throw invalidParamsError('id is required')
	const job = repo.get(id)
	if (!job) throw notFoundError('export job not found')
	const frames = repo.getFrames(id)
	return serializeJobForFrontend(job, frames)
}

export function finalizeJob(ctx, payload) {
	const repo = getRepo(ctx)
	const id = String(payload?.id || payload?.jobId || '').trim()
	const outputPath = String(payload?.outputPath || payload?.serverPath || '').trim()
	if (!id) throw invalidParamsError('id is required')
	const job = repo.get(id)
	if (!job) throw notFoundError('export job not found')
	const result = repo.updateStatus(id, {
		status: 'completed',
		progress: 100,
		outputPath: outputPath || job.outputPath || '',
		error: ''
	})
	if (!result.ok) throw internalError(result.error || 'failed to finalize job')
	const frames = repo.getFrames(id)
	return serializeJobForFrontend(result.job, frames)
}

export function getJobFile(ctx, payload) {
	const repo = getRepo(ctx)
	const id = String(payload?.id || payload?.jobId || '').trim()
	if (!id) throw invalidParamsError('id is required')
	const job = repo.get(id)
	if (!job) throw notFoundError('export job not found')
	const outputPath = job.outputPath
	if (!outputPath || !fs.existsSync(outputPath)) {
		throw notFoundError('output file not found')
	}
	return { ok: true, filePath: outputPath, fileName: path.basename(outputPath), jobId: id }
}

export function listJobsByProject(ctx, payload) {
	const repo = getRepo(ctx)
	const pid = Number(payload?.projectId)
	if (!Number.isFinite(pid) || pid <= 0) return { items: [] }
	const jobs = repo.listByProject(pid)
	const items = jobs.map(j => {
		const frames = repo.getFrames(j.id)
		return serializeJobForFrontend(j, frames)
	})
	return { items }
}

function writeFrame(repo, jobId, frameIndex, data, filename) {
	const frameDir = repo.resolveFrameDir(jobId)
	if (!frameDir) throw internalError('frame directory not available')
	fs.mkdirSync(frameDir, { recursive: true })
	const ext = filename ? extFromFilename(filename) : '.png'
	const fname = frameFilename(frameIndex, ext)
	const fpath = path.resolve(frameDir, fname)
	fs.writeFileSync(fpath, data)
	repo.addFrame({ jobId, frameIndex, filePath: fpath })
	const frames = repo.getFrames(jobId)
	const job = repo.get(jobId)
	const expectedFrames = Number(job?.config?.expectedFrames || job?.config?.frameCount) || 0
	let progress = 5
	if (expectedFrames > 0) {
		progress = Math.min(95, Math.floor((frames.length / expectedFrames) * 95))
	} else {
		progress = Math.min(95, 5 + frames.length * 2)
	}
	repo.updateStatus(jobId, { status: 'processing', progress })
	const updatedJob = repo.get(jobId)
	return {
		ok: true,
		filePath: fpath,
		frameIndex,
		progress,
		totalFrames: frames.length,
		job: serializeJobForFrontend(updatedJob, frames),
	}
}

export function uploadFrame(ctx, payload) {
	const repo = getRepo(ctx)
	const p = payload || {}
	const jobId = String(p.jobId || p.id || '').trim()
	const frameIndex = Number(p.frameIndex) || 0
	const dataBase64 = String(p.data || '').trim()
	const filename = String(p.filename || '').trim()
	if (!jobId) throw invalidParamsError('jobId is required')
	if (!dataBase64) throw invalidParamsError('data (base64) is required')
	const job = repo.get(jobId)
	if (!job) throw notFoundError('export job not found')
	let buf
	try {
		buf = Buffer.from(dataBase64, 'base64')
	} catch {
		throw invalidParamsError('invalid base64 data')
	}
	return writeFrame(repo, jobId, frameIndex, buf, filename)
}

export function uploadFrameRaw(ctx, payload) {
	const repo = getRepo(ctx)
	const p = payload || {}
	const jobId = String(p.jobId || p.id || '').trim()
	const frameIndex = Number(p.frameIndex) || 0
	const filePath = String(p.filePath || '').trim()
	if (!jobId) throw invalidParamsError('jobId is required')
	if (!filePath) throw invalidParamsError('filePath is required')
	const job = repo.get(jobId)
	if (!job) throw notFoundError('export job not found')
	if (!fs.existsSync(filePath)) throw invalidParamsError('source file not found')
	const data = fs.readFileSync(filePath)
	return writeFrame(repo, jobId, frameIndex, data, path.basename(filePath))
}

export function uploadFramesBatch(ctx, payload) {
	const repo = getRepo(ctx)
	const p = payload || {}
	const jobId = String(p.jobId || p.id || '').trim()
	const frames = Array.isArray(p.frames) ? p.frames : []
	if (!jobId) throw invalidParamsError('jobId is required')
	if (!frames.length) throw invalidParamsError('frames array is required')
	const job = repo.get(jobId)
	if (!job) throw notFoundError('export job not found')
	const results = []
	for (const f of frames) {
		const idx = Number(f?.frameIndex) || 0
		const fp = String(f?.filePath || '').trim()
		if (!fp || !fs.existsSync(fp)) {
			results.push({ frameIndex: idx, ok: false, error: 'file not found' })
			continue
		}
		try {
			const data = fs.readFileSync(fp)
			const result = writeFrame(repo, jobId, idx, data, path.basename(fp))
			results.push({ ...result, ok: true })
		} catch (err) {
			results.push({ frameIndex: idx, ok: false, error: String(err?.message || err) })
		}
	}
	return { ok: true, results }
}

export async function* streamJob(ctx, payload) {
	const repo = getRepo(ctx)
	const id = String(payload?.id || payload?.jobId || '').trim()
	if (!id) {
		yield JSON.stringify({ type: 'error', error: 'id is required' })
		return
	}
	let job = repo.get(id)
	if (!job) {
		yield JSON.stringify({ type: 'error', error: 'job not found' })
		return
	}
	let frames = repo.getFrames(id)
	yield JSON.stringify({ type: 'status', job: serializeJobForFrontend(job, frames) })
	const terminalStatuses = new Set(['completed', 'failed', 'cancelled'])
	let attempts = 0
	const maxAttempts = 3600
	while (attempts < maxAttempts) {
		await new Promise(r => setTimeout(r, 500))
		attempts++
		job = repo.get(id)
		if (!job) break
		frames = repo.getFrames(id)
		yield JSON.stringify({ type: 'progress', job: serializeJobForFrontend(job, frames) })
		if (terminalStatuses.has(String(job.status))) break
	}
	const finalJob = repo.get(id)
	const finalFrames = finalJob ? repo.getFrames(id) : []
	yield JSON.stringify({ type: 'done', job: finalJob ? serializeJobForFrontend(finalJob, finalFrames) : null })
}
