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

export function createJob(ctx, payload) {
	const repo = getRepo(ctx)
	const p = payload || {}
	const projectId = p.projectId !== undefined ? Number(p.projectId) : null
	const config = p.config && typeof p.config === 'object' ? p.config : {}
	const result = repo.create({ projectId, config })
	if (!result.ok) throw internalError(result.error || 'failed to create export job')
	return { job: result.job }
}

export function getJob(ctx, payload) {
	const repo = getRepo(ctx)
	const id = String(payload?.id || '').trim()
	if (!id) throw invalidParamsError('id is required')
	const job = repo.get(id)
	if (!job) throw notFoundError('export job not found')
	const frames = repo.getFrames(id)
	return { job, frames }
}

export function finalizeJob(ctx, payload) {
	const repo = getRepo(ctx)
	const id = String(payload?.id || '').trim()
	const outputPath = String(payload?.outputPath || '').trim()
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
	return { job: result.job }
}

export function getJobFile(ctx, payload) {
	const repo = getRepo(ctx)
	const id = String(payload?.id || '').trim()
	if (!id) throw invalidParamsError('id is required')
	const job = repo.get(id)
	if (!job) throw notFoundError('export job not found')
	const outputPath = job.outputPath
	if (!outputPath || !fs.existsSync(outputPath)) {
		throw notFoundError('output file not found')
	}
	return { ok: true, filePath: outputPath, fileName: path.basename(outputPath) }
}

export function listJobsByProject(ctx, payload) {
	const repo = getRepo(ctx)
	const pid = Number(payload?.projectId)
	if (!Number.isFinite(pid) || pid <= 0) return { items: [] }
	return { items: repo.listByProject(pid) }
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
	const expectedFrames = Number(job?.config?.expectedFrames) || 0
	let progress = 5
	if (expectedFrames > 0) {
		progress = Math.min(95, Math.floor((frames.length / expectedFrames) * 95))
	} else {
		progress = Math.min(95, 5 + frames.length * 2)
	}
	repo.updateStatus(jobId, { status: 'processing', progress })
	return { ok: true, filePath: fpath, frameIndex, progress, totalFrames: frames.length }
}

export function uploadFrame(ctx, payload) {
	const repo = getRepo(ctx)
	const p = payload || {}
	const jobId = String(p.jobId || '').trim()
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
	const jobId = String(p.jobId || '').trim()
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
	const jobId = String(p.jobId || '').trim()
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
	const id = String(payload?.id || '').trim()
	if (!id) {
		yield JSON.stringify({ type: 'error', error: 'id is required' })
		return
	}
	let job = repo.get(id)
	if (!job) {
		yield JSON.stringify({ type: 'error', error: 'job not found' })
		return
	}
	yield JSON.stringify({ type: 'status', job })
	const terminalStatuses = new Set(['completed', 'failed', 'cancelled'])
	let attempts = 0
	const maxAttempts = 3600
	while (attempts < maxAttempts) {
		await new Promise(r => setTimeout(r, 500))
		attempts++
		job = repo.get(id)
		if (!job) break
		yield JSON.stringify({ type: 'progress', job })
		if (terminalStatuses.has(String(job.status))) break
	}
	yield JSON.stringify({ type: 'done', job: repo.get(id) })
}
