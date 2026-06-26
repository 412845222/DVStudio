import { internalError, invalidParamsError, notFoundError, upstreamError } from '../../core/errors.mjs'

const DEFAULT_COMFYUI_BASE = 'http://127.0.0.1:8188'

function getWorkflowsRepo(ctx) {
	const repo = ctx.localdb?.comfyuiWorkflows
	if (!repo) throw internalError('comfyuiWorkflows repo not available')
	return repo
}

function getJobsRepo(ctx) {
	const repo = ctx.localdb?.comfyuiJobs
	if (!repo) throw internalError('comfyuiJobs repo not available')
	return repo
}

function getBaseUrl(ctx) {
	try {
		const keyRepo = ctx.localdb?.apiKeys
		if (keyRepo) {
			const result = keyRepo.getPlaintext('comfyui')
			if (result.ok && result.plaintext) {
				const url = String(result.plaintext).trim().replace(/\/+$/, '')
				if (url) return url
			}
		}
	} catch {}
	return DEFAULT_COMFYUI_BASE
}

const activePollers = new Map()

export function listWorkflows(ctx) {
	const repo = getWorkflowsRepo(ctx)
	return { items: repo.list() }
}

export function getWorkflow(ctx, payload) {
	const repo = getWorkflowsRepo(ctx)
	const id = String(payload?.id || '').trim()
	if (!id) throw invalidParamsError('id is required')
	const wf = repo.get(id)
	if (!wf) throw notFoundError('workflow not found')
	return { workflow: wf }
}

export function saveWorkflow(ctx, payload) {
	const repo = getWorkflowsRepo(ctx)
	const p = payload || {}
	const name = String(p.name || '未命名工作流').trim()
	const data = p.data
	if (!data || typeof data !== 'object') throw invalidParamsError('data is required')
	if (p.id) {
		const existing = repo.get(String(p.id).trim())
		if (existing) {
			const result = repo.update(String(p.id).trim(), { name, data })
			if (!result) throw internalError('failed to update workflow')
			return { workflow: repo.get(String(p.id).trim()) }
		}
	}
	const result = repo.create({ id: p.id, name, data })
	if (!result.ok) throw internalError(result.error || 'failed to create workflow')
	return { workflow: result.workflow }
}

export function deleteWorkflow(ctx, payload) {
	const repo = getWorkflowsRepo(ctx)
	const id = String(payload?.id || '').trim()
	if (!id) throw invalidParamsError('id is required')
	if (!repo.get(id)) throw notFoundError('workflow not found')
	repo.remove(id)
	return { ok: true }
}

export async function proxyRequest(ctx, payload) {
	const client = ctx.httpClient
	const base = getBaseUrl(ctx)
	const method = String(payload?.method || 'GET').toUpperCase().trim()
	const reqPath = String(payload?.path || '').trim()
	if (!reqPath) throw invalidParamsError('path is required')
	const url = `${base}${reqPath.startsWith('/') ? '' : '/'}${reqPath}`
	const body = payload?.body
	try {
		let res
		if (method === 'GET') res = await client.get(url, { timeout: 30000 })
		else if (method === 'POST') res = await client.post(url, body, { timeout: 60000 })
		else res = await client.post(url, body, { timeout: 60000, method })
		return { ok: true, status: res.status, body: res.body }
	} catch (err) {
		return { ok: false, error: String(err?.message || err) }
	}
}

export function listJobs(ctx, payload) {
	const repo = getJobsRepo(ctx)
	const pid = Number(payload?.projectId)
	if (!Number.isFinite(pid) || pid <= 0) return { items: [] }
	return { items: repo.listByProject(pid) }
}

export function getJob(ctx, payload) {
	const repo = getJobsRepo(ctx)
	const id = String(payload?.id || '').trim()
	if (!id) throw invalidParamsError('id is required')
	const job = repo.get(id)
	if (!job) throw notFoundError('job not found')
	return { job }
}

async function pollJobCompletion(ctx, jobId, promptId, baseUrl) {
	const jobsRepo = getJobsRepo(ctx)
	const client = ctx.httpClient
	const cancelled = new Set()
	activePollers.set(jobId, cancelled)
	try {
		let attempts = 0
		const maxAttempts = 600
		while (attempts < maxAttempts) {
			await new Promise(r => setTimeout(r, 1000))
			attempts++
			if (cancelled.has('stop')) break
			try {
				const historyUrl = `${baseUrl}/history/${encodeURIComponent(promptId)}`
				const res = await client.get(historyUrl, { timeout: 10000 })
				if (res.ok && res.body && typeof res.body === 'object') {
					const historyData = res.body[promptId]
					if (historyData) {
						const outputs = historyData.outputs || {}
						const images = []
						for (const [nodeId, nodeOutput] of Object.entries(outputs)) {
							if (nodeOutput.images && Array.isArray(nodeOutput.images)) {
								for (const img of nodeOutput.images) {
									const params = new URLSearchParams()
									if (img.filename) params.set('filename', img.filename)
									if (img.subfolder) params.set('subfolder', img.subfolder)
									if (img.type) params.set('type', img.type)
									images.push({
										filename: img.filename,
										subfolder: img.subfolder,
										type: img.type,
										url: `${baseUrl}/view?${params.toString()}`,
										nodeId
									})
								}
							}
						}
						const status = historyData.status
						if (status && status.status_str === 'error') {
							const errMsg = Array.isArray(status.messages)
								? status.messages.map(m => Array.isArray(m) ? m.join(': ') : String(m)).join('; ')
								: 'execution failed'
							jobsRepo.updateStatus(jobId, { status: 'failed', error: errMsg, progress: 100, outputs: { promptId, images } })
							return
						}
						if (images.length > 0 || Object.keys(outputs).length > 0) {
							jobsRepo.updateStatus(jobId, { status: 'succeeded', progress: 100, outputs: { promptId, images } })
							return
						}
					}
				}
				const progress = Math.min(99, Math.floor((attempts / maxAttempts) * 100))
				jobsRepo.updateStatus(jobId, { status: 'running', progress })
			} catch (pollErr) {
				// ignore transient poll errors
			}
		}
		jobsRepo.updateStatus(jobId, { status: 'failed', error: 'polling timed out', progress: 0 })
	} catch (err) {
		jobsRepo.updateStatus(jobId, { status: 'failed', error: String(err?.message || err) })
	} finally {
		activePollers.delete(jobId)
	}
}

export async function createJob(ctx, payload) {
	const jobsRepo = getJobsRepo(ctx)
	const client = ctx.httpClient
	const base = getBaseUrl(ctx)
	const projectId = payload?.projectId !== undefined ? Number(payload.projectId) : null
	const workflow = payload?.workflow
	if (!workflow || typeof workflow !== 'object') throw invalidParamsError('workflow is required')
	const createResult = jobsRepo.create({ projectId })
	if (!createResult.ok) throw internalError(createResult.error || 'failed to create job')
	const jobId = createResult.job.id
	try {
		const promptUrl = `${base}/prompt`
		const res = await client.post(promptUrl, { prompt: workflow }, { timeout: 30000 })
		if (!res.ok) {
			const errMsg = typeof res.body === 'object' && res.body?.error ? String(res.body.error.message || res.body.error) : `HTTP ${res.status}`
			jobsRepo.updateStatus(jobId, { status: 'failed', error: errMsg })
			return { ok: true, job: jobsRepo.get(jobId), promptId: '' }
		}
		const promptId = String(res.body?.prompt_id || '').trim()
		if (!promptId) {
			jobsRepo.updateStatus(jobId, { status: 'failed', error: 'no prompt_id in response' })
			return { ok: true, job: jobsRepo.get(jobId), promptId: '' }
		}
		jobsRepo.updateStatus(jobId, { status: 'running', progress: 1, outputs: { promptId } })
		pollJobCompletion(ctx, jobId, promptId, base)
		return { ok: true, job: jobsRepo.get(jobId), promptId }
	} catch (err) {
		jobsRepo.updateStatus(jobId, { status: 'failed', error: String(err?.message || err) })
		return { ok: true, job: jobsRepo.get(jobId), promptId: '' }
	}
}

export async function cancelJob(ctx, payload) {
	const jobsRepo = getJobsRepo(ctx)
	const client = ctx.httpClient
	const base = getBaseUrl(ctx)
	const id = String(payload?.id || '').trim()
	if (!id) throw invalidParamsError('id is required')
	const job = jobsRepo.get(id)
	if (!job) throw notFoundError('job not found')
	const poller = activePollers.get(id)
	if (poller) poller.add('stop')
	try {
		await client.post(`${base}/interrupt`, {}, { timeout: 10000 })
	} catch {}
	jobsRepo.updateStatus(id, { status: 'cancelled', error: 'cancelled by user' })
	return { ok: true, job: jobsRepo.get(id) }
}
