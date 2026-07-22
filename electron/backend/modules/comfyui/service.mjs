import crypto from 'node:crypto'
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

function normalizeBaseUrl(raw) {
	let v = String(raw || '').trim()
	if (!v) return { error: 'baseUrl is required' }
	if (!v.includes('://')) v = 'http://' + v
	try {
		const u = new URL(v)
		if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: 'baseUrl must be http or https' }
		if (!u.hostname) return { error: 'baseUrl host is missing' }
		return { base: v.replace(/\/+$/, '') }
	} catch {
		return { error: 'baseUrl is invalid' }
	}
}

function coerceBool(v) {
	if (typeof v === 'boolean') return v
	if (typeof v === 'number') return v !== 0
	const s = String(v || '').trim().toLowerCase()
	return s === '1' || s === 'true' || s === 'yes' || s === 'on' || s === 'y'
}

function isRecord(v) {
	return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function isPromptGraphJson(v) {
	if (!isRecord(v)) return false
	if ('nodes' in v && 'links' in v) return false
	let saw = 0
	for (const [k, val] of Object.entries(v)) {
		if (!/^\d+$/.test(k) || !isRecord(val)) continue
		if (!('class_type' in val) || !('inputs' in val)) continue
		if (!isRecord(val.inputs)) continue
		saw++
		if (saw >= 2) return true
	}
	return saw >= 1
}

function buildProxyViewUrl(base, filename, subfolder, folderType) {
	const params = new URLSearchParams({ filename, subfolder: subfolder || '', type: folderType || 'output' })
	return `${base}/view?${params.toString()}`
}

const activePollers = new Map()

const objectInfoCache = new Map()
const OBJECT_INFO_CACHE_TTL = 5 * 60 * 1000

function getCachedObjectInfo(baseUrl) {
	const entry = objectInfoCache.get(baseUrl)
	if (!entry) return null
	if (Date.now() - entry.ts > OBJECT_INFO_CACHE_TTL) {
		objectInfoCache.delete(baseUrl)
		return null
	}
	return entry.data
}

function setCachedObjectInfo(baseUrl, data) {
	objectInfoCache.set(baseUrl, { ts: Date.now(), data })
}

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
	let url = `${base}${reqPath.startsWith('/') ? '' : '/'}${reqPath}`
	const query = payload?.query
	if (query && typeof query === 'object') {
		const params = new URLSearchParams()
		for (const [k, v] of Object.entries(query)) {
			if (v !== undefined && v !== null) params.set(k, String(v))
		}
		const qs = params.toString()
		if (qs) url += (url.includes('?') ? '&' : '?') + qs
	}
	const body = payload?.body
	const timeout = Number(payload?.timeout) || 60000
	try {
		let res
		if (method === 'GET') res = await client.get(url, { timeout })
		else if (method === 'POST') res = await client.post(url, body, { timeout })
		else res = await client.post(url, body, { timeout, method })
		return { ok: true, status: res.status, body: res.body }
	} catch (err) {
		return { ok: false, error: String(err?.message || err), status: 0 }
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

// ============================================================================
// ComfyUI Runtime methods (for AIWorkflow ComfyUI nodes)
// These replace the Django /api/workflow/* endpoints
// ============================================================================

async function comfyJsonGet(client, url, timeout = 10000) {
	try {
		const res = await client.get(url, { timeout })
		if (!res.ok) {
			return { error: `http ${res.status}: ${typeof res.body === 'string' ? res.body.slice(0, 200) : JSON.stringify(res.body).slice(0, 200)}` }
		}
		return { data: res.body }
	} catch (err) {
		return { error: String(err?.message || err) }
	}
}

async function comfyJsonPost(client, url, body, timeout = 30000) {
	try {
		const res = await client.post(url, body, { timeout })
		if (!res.ok) {
			const errMsg = typeof res.body === 'object' && res.body?.error
				? String(res.body.error?.message || JSON.stringify(res.body.error))
				: `http ${res.status}`
			return { error: errMsg, status: res.status, body: res.body }
		}
		return { data: res.body }
	} catch (err) {
		return { error: String(err?.message || err) }
	}
}

function encodeMultipartForm(fields, files) {
	const boundary = `----FormBoundary${crypto.randomBytes(12).toString('hex')}`
	const crlf = '\r\n'
	const chunks = []

	for (const [name, value] of Object.entries(fields || {})) {
		chunks.push(Buffer.from(`--${boundary}${crlf}`))
		chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"${crlf}${crlf}`))
		chunks.push(Buffer.from(String(value)))
		chunks.push(Buffer.from(crlf))
	}

	for (const f of files || []) {
		const fieldName = f.fieldName || 'image'
		const filename = f.filename || 'file.bin'
		const contentType = f.contentType || 'application/octet-stream'
		const content = f.content || Buffer.alloc(0)
		chunks.push(Buffer.from(`--${boundary}${crlf}`))
		chunks.push(Buffer.from(`Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"${crlf}`))
		chunks.push(Buffer.from(`Content-Type: ${contentType}${crlf}${crlf}`))
		chunks.push(Buffer.isBuffer(content) ? content : Buffer.from(content))
		chunks.push(Buffer.from(crlf))
	}

	chunks.push(Buffer.from(`--${boundary}--${crlf}`))
	const body = Buffer.concat(chunks)
	return {
		body,
		headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': String(body.length) }
	}
}

async function uploadImageToComfyui(client, base, filename, content, contentType) {
	const url = `${base}/upload/image`
	const mp = encodeMultipartForm({ type: 'input' }, [
		{ fieldName: 'image', filename: filename || 'input.png', content, contentType: contentType || 'application/octet-stream' }
	])
	try {
		const parsedUrl = new URL(url)
		const transport = parsedUrl.protocol === 'https:' ? (await import('node:https')).default : (await import('node:http')).default
		const result = await new Promise((resolve, reject) => {
			const req = transport.request({
				hostname: parsedUrl.hostname,
				port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
				path: parsedUrl.pathname + parsedUrl.search,
				method: 'POST',
				headers: mp.headers,
				timeout: 30000
			}, (res) => {
				const chunks = []
				res.on('data', c => chunks.push(c))
				res.on('end', () => {
					const raw = Buffer.concat(chunks).toString('utf-8')
					try { resolve({ status: res.statusCode, body: JSON.parse(raw) }) }
					catch { resolve({ status: res.statusCode, body: raw }) }
				})
				res.on('error', reject)
			})
			req.on('error', reject)
			req.on('timeout', () => req.destroy(new Error('timeout')))
			req.write(mp.body)
			req.end()
		})
		if (result.status < 200 || result.status >= 300 || !isRecord(result.body)) {
			return { error: `ComfyUI /upload/image failed: http ${result.status}` }
		}
		return { data: result.body }
	} catch (err) {
		return { error: `ComfyUI /upload/image failed: ${String(err?.message || err)}` }
	}
}

function filterWorkflowFiles(items) {
	if (!Array.isArray(items)) return []
	const out = []
	for (const it of items) {
		if (typeof it !== 'string') continue
		const rel = it.trim().replace(/\\/g, '/')
		if (!rel) continue
		const lower = rel.toLowerCase()
		if (!lower.endsWith('.json')) continue
		if (lower.endsWith('.index.json')) continue
		const parts = rel.split('/')
		let name = parts[parts.length - 1] || rel
		if (name.toLowerCase().endsWith('.json')) name = name.slice(0, -5)
		out.push({ path: `workflows/${rel}`, name })
	}
	out.sort((a, b) => (a.name === b.name ? a.path.localeCompare(b.path) : a.name.localeCompare(b.name)))
	return out
}

function extractObjectInfoInputDefs(info) {
	if (!isRecord(info)) return {}
	const raw = info.input
	if (!isRecord(raw)) return {}
	const out = {}
	for (const bucket of ['required', 'optional']) {
		const b = raw[bucket]
		if (!isRecord(b)) continue
		for (const [k, v] of Object.entries(b)) {
			out[k] = v
		}
	}
	return out
}

function isObjectInfoWidgetDef(defn) {
	if (!Array.isArray(defn) || defn.length === 0) return false
	const t = defn[0]
	if (Array.isArray(t)) return true
	if (typeof t === 'string') {
		const socketTypes = new Set(['MODEL', 'CLIP', 'VAE', 'CONDITIONING', 'LATENT', 'IMAGE', 'MASK', 'SAMPLER', 'SIGMAS', 'AUDIO', 'VIDEO', 'CLIP_VISION_OUTPUT'])
		if (socketTypes.has(t)) return false
		return true
	}
	return false
}

function objectInfoValueFits(defn, value) {
	if (!Array.isArray(defn) || defn.length === 0) return false
	const t = defn[0]
	if (Array.isArray(t)) {
		if (typeof value === 'string') return t.includes(value)
		return false
	}
	if (typeof t !== 'string') return false
	const tt = t.toUpperCase()
	if (tt === 'INT') {
		if (typeof value === 'boolean') return false
		if (typeof value === 'number' && Number.isInteger(value)) return true
		if (typeof value === 'string') { const s = value.trim(); return /^-?\d+$/.test(s) }
		return false
	}
	if (tt === 'FLOAT') {
		if (typeof value === 'boolean') return false
		if (typeof value === 'number') return true
		if (typeof value === 'string') { try { return !isNaN(parseFloat(value.trim())) } catch { return false } }
		return false
	}
	if (tt === 'BOOLEAN' || tt === 'BOOL') {
		if (typeof value === 'boolean') return true
		if (typeof value === 'number') return true
		if (typeof value === 'string') { const v = value.trim().toLowerCase(); return ['true', 'false', 'enable', 'disable', 'enabled', 'disabled', '1', '0'].includes(v) }
		return false
	}
	if (tt === 'STRING') return typeof value === 'string'
	return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function objectInfoCoerceValue(defn, value) {
	if (!Array.isArray(defn) || defn.length === 0) return value
	const t = defn[0]
	if (Array.isArray(t)) {
		if (typeof value === 'string' && t.includes(value)) return value
		const d = defn[1]?.default
		return d !== undefined ? d : value
	}
	if (typeof t !== 'string') return value
	const tt = t.toUpperCase()
	if (tt === 'INT') {
		if (typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value) && typeof value !== 'boolean') return Math.trunc(value)
		if (typeof value === 'string') { try { const n = parseInt(value.trim(), 10); if (!isNaN(n)) return n } catch {} }
		const d = defn[1]?.default; return d !== undefined ? d : value
	}
	if (tt === 'FLOAT') {
		if (typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value) && typeof value !== 'boolean') return value
		if (typeof value === 'string') { try { const n = parseFloat(value.trim()); if (!isNaN(n)) return n } catch {} }
		const d = defn[1]?.default; return d !== undefined ? d : value
	}
	if (tt === 'BOOLEAN' || tt === 'BOOL') {
		if (typeof value === 'boolean') return value
		if (typeof value === 'number') return Boolean(value)
		if (typeof value === 'string') { const v = value.trim().toLowerCase(); if (['true', 'enable', 'enabled', '1'].includes(v)) return true; if (['false', 'disable', 'disabled', '0'].includes(v)) return false }
		const d = defn[1]?.default; return d !== undefined ? d : value
	}
	if (tt === 'STRING') return String(value)
	return value
}

function workflowToPrompt(workflow, objectInfo, knownNodeTypes) {
	if (!isRecord(workflow)) return { error: 'workflow must be object' }
	const nodes = workflow.nodes
	const links = workflow.links
	if (!Array.isArray(nodes) || !Array.isArray(links)) return { error: 'workflow.nodes/workflow.links missing' }

	const linkFromById = new Map()
	const usedNodeIds = new Set()
	for (const l of links) {
		if (!Array.isArray(l) || l.length < 5) continue
		try {
			const linkId = Number(l[0])
			const fromNodeId = Number(l[1])
			const fromSlot = Number(l[2])
			linkFromById.set(linkId, [fromNodeId, fromSlot])
			usedNodeIds.add(Number(l[1]))
			usedNodeIds.add(Number(l[3]))
		} catch {}
	}

	const prompt = {}
	const unknownUsedTypes = new Set()

	for (const node of nodes) {
		if (!isRecord(node)) continue
		const rawNodeId = node.id
		if (rawNodeId == null) continue
		let nodeId
		try { nodeId = Number(rawNodeId) } catch { continue }
		const classType = String(node.type || '').trim()
		if (!classType) continue
		if (classType === 'MarkdownNote') continue

		if (knownNodeTypes && !knownNodeTypes.has(classType)) {
			if (usedNodeIds.has(nodeId)) unknownUsedTypes.add(classType)
			continue
		}

		const inputsList = Array.isArray(node.inputs) ? node.inputs : []
		const values = Array.isArray(node.widgets_values) ? node.widgets_values : []
		const inputs = {}
		const linkedNames = new Set()

		for (const inp of inputsList) {
			if (!isRecord(inp)) continue
			const name = String(inp.name || '').trim()
			if (!name) continue
			if (inp.link != null) {
				try {
					const linkId = Number(inp.link)
					const fromInfo = linkFromById.get(linkId)
					if (!fromInfo) continue
					const [fromNodeId, fromSlot] = fromInfo
					inputs[name] = [String(fromNodeId), fromSlot]
					linkedNames.add(name)
				} catch {}
				continue
			}
		}

		const orderedWidgetNames = []
		const defs = objectInfo ? extractObjectInfoInputDefs(objectInfo[classType]) : {}
		if (Object.keys(defs).length > 0) {
			for (const inp of inputsList) {
				if (!isRecord(inp)) continue
				const name = String(inp.name || '').trim()
				if (!name || linkedNames.has(name) || name in inputs) continue
				if (!isObjectInfoWidgetDef(defs[name])) continue
				orderedWidgetNames.push(name)
			}
		}

		if (orderedWidgetNames.length > 0 && values.length > 0) {
			let idx = 0
			for (const name of orderedWidgetNames) {
				if (name in inputs) continue
				const defn = defs[name]
				let assigned = false
				while (idx < values.length) {
					const cand = values[idx]
					if (objectInfoValueFits(defn, cand)) {
						inputs[name] = objectInfoCoerceValue(defn, cand)
						idx++
						assigned = true
						break
					}
					idx++
				}
				if (!assigned) {
					const d = defn?.[1]?.default
					if (d !== undefined) inputs[name] = d
				}
			}
		} else {
			let valueIdx = 0
			for (const inp of inputsList) {
				if (!isRecord(inp)) continue
				const name = String(inp.name || '').trim()
				if (!name || name in inputs) continue
				if (inp.link != null) continue
				if (isRecord(inp.widget)) {
					if (valueIdx < values.length) inputs[name] = values[valueIdx]
					valueIdx++
				}
			}
		}

		prompt[String(nodeId)] = { class_type: classType, inputs }
	}

	if (unknownUsedTypes.size > 0) {
		return { error: `workflow contains unknown node types (used by links): ${[...unknownUsedTypes].sort().join(', ')}` }
	}

	return { prompt }
}

function applyTextOverrides(promptGraph, positivePrompt, negativePrompt) {
	const pp = String(positivePrompt || '').trim()
	const np = String(negativePrompt || '').trim()
	if (!pp && !np) return

	const textNodes = []
	for (const [k, v] of Object.entries(promptGraph)) {
		if (!/^\d+$/.test(k) || !isRecord(v)) continue
		if (String(v.class_type || '') !== 'CLIPTextEncode') continue
		try { textNodes.push([Number(k), v]) } catch {}
	}
	textNodes.sort((a, b) => a[0] - b[0])
	if (textNodes.length === 0) return

	const negativeIdxs = []
	const positiveIdxs = []
	for (let i = 0; i < textNodes.length; i++) {
		const [, node] = textNodes[i]
		const meta = node._meta
		let title = ''
		if (isRecord(meta)) title = String(meta.title || '')
		const t = title.toLowerCase()
		if (t.includes('negative') || title.includes('负')) negativeIdxs.push(i)
		else positiveIdxs.push(i)
	}

	if (pp) {
		const targets = positiveIdxs.length > 0 ? positiveIdxs : [0]
		for (const i of targets) {
			const node = textNodes[i][1]
			if (!isRecord(node.inputs)) node.inputs = {}
			node.inputs.text = pp
		}
	}
	if (np) {
		let targets
		if (negativeIdxs.length > 0) targets = negativeIdxs
		else if (textNodes.length >= 2) targets = [1]
		else targets = [0]
		for (const i of targets) {
			const node = textNodes[i][1]
			if (!isRecord(node.inputs)) node.inputs = {}
			node.inputs.text = np
		}
	}
}

function patchPromptGraphLoadImages(promptGraph, uploadedPaths) {
	const loadNodes = []
	for (const [k, v] of Object.entries(promptGraph)) {
		if (!/^\d+$/.test(k) || !isRecord(v)) continue
		if (String(v.class_type || '') !== 'LoadImage') continue
		try { loadNodes.push([Number(k), v]) } catch {}
	}
	loadNodes.sort((a, b) => a[0] - b[0])
	for (let idx = 0; idx < uploadedPaths.length && idx < loadNodes.length; idx++) {
		const [, node] = loadNodes[idx]
		if (!isRecord(node.inputs)) node.inputs = {}
		node.inputs.image = uploadedPaths[idx]
	}
}

function normalizePromptGraphForRuntime(promptGraph, objectInfo) {
	const socketTypes = new Set(['MODEL', 'CLIP', 'VAE', 'CONDITIONING', 'LATENT', 'IMAGE', 'MASK', 'SAMPLER', 'SIGMAS', 'AUDIO', 'VIDEO', 'CLIP_VISION_OUTPUT'])
	const isValidLinkRef = v => Array.isArray(v) && v.length === 2 && (typeof v[0] === 'string' || typeof v[0] === 'number') && typeof v[1] === 'number'

	for (const node of Object.values(promptGraph)) {
		if (!isRecord(node)) continue
		const inputs = node.inputs
		if (!isRecord(inputs)) continue
		const classType = String(node.class_type || '')
		const defs = objectInfo ? extractObjectInfoInputDefs(objectInfo[classType]) : {}

		if (Object.keys(defs).length > 0) {
			for (const [name, defn] of Object.entries(defs)) {
				if (!(name in inputs)) continue
				if (!Array.isArray(defn) || defn.length === 0) continue
				const t = defn[0]
				if (typeof t !== 'string' || !socketTypes.has(t)) continue
				if (!isValidLinkRef(inputs[name])) delete inputs[name]
			}
		}

		for (const key of ['clip_vision_output', 'audio']) {
			if (key in inputs && !isValidLinkRef(inputs[key])) delete inputs[key]
		}
		node.inputs = inputs
	}
}

function extractMediaFromHistoryResult(base, result, promptId) {
	let item = null
	if (isRecord(result)) {
		if (promptId && isRecord(result[promptId])) item = result[promptId]
		else if (Object.keys(result).length === 1) {
			const firstVal = Object.values(result)[0]
			if (isRecord(firstVal)) item = firstVal
		}
	}
	if (!isRecord(item)) return []
	const outputs = item.outputs
	if (!isRecord(outputs)) return []

	const media = []
	const kindByFilename = name => {
		const n = String(name || '').trim().toLowerCase()
		if (!n) return null
		if (['.mp4', '.webm', '.mov', '.mkv', '.avi', '.gif'].some(ext => n.endsWith(ext))) return 'video'
		if (['.png', '.jpg', '.jpeg', '.webp', '.bmp'].some(ext => n.endsWith(ext))) return 'image'
		return null
	}
	const nodeSortKey = v => {
		const s = String(v || '').trim()
		const n = Number(s)
		return Number.isFinite(n) ? [0, n] : [1, s]
	}

	const sortedNodes = Object.entries(outputs).sort((a, b) => {
		const ka = nodeSortKey(a[0]), kb = nodeSortKey(b[0])
		if (ka[0] !== kb[0]) return ka[0] - kb[0]
		if (ka[0] === 0) return ka[1] - kb[1]
		return String(ka[1]).localeCompare(String(kb[1]))
	})

	for (const [nodeId, nodeOut] of sortedNodes) {
		if (!isRecord(nodeOut)) continue
		for (const key of ['images', 'gifs', 'videos']) {
			const arr = nodeOut[key]
			if (!Array.isArray(arr)) continue
			for (const m of arr) {
				if (!isRecord(m)) continue
				const filename = String(m.filename || '').trim()
				if (!filename) continue
				const subfolder = String(m.subfolder || '').trim()
				const folderType = String(m.type || 'output').trim()
				let kind = key === 'gifs' || key === 'videos' ? 'video' : 'image'
				const inferred = kindByFilename(filename)
				if (inferred) kind = inferred
				media.push({
					nodeId: String(nodeId),
					kind,
					filename,
					subfolder,
					type: folderType,
					url: buildProxyViewUrl(base, filename, subfolder, folderType)
				})
			}
		}
	}
	return media
}

function extractPromptAndExtraFromEntry(entry) {
	if (Array.isArray(entry) && entry.length >= 3 && isRecord(entry[2])) {
		const extra = entry.length >= 4 && isRecord(entry[3]) ? entry[3] : null
		return { prompt: entry[2], extra }
	}
	return { prompt: null, extra: null }
}

function extractWorkflowIdFromExtra(extra) {
	if (!isRecord(extra)) return ''
	const epi = extra.extra_pnginfo
	if (!isRecord(epi)) return ''
	const wf = epi.workflow
	if (!isRecord(wf)) return ''
	return wf.id != null ? String(wf.id).trim() : ''
}

function extractCreateTimeFromExtra(extra) {
	if (!isRecord(extra)) return 0
	const raw = extra.create_time
	if (raw == null) return 0
	try { const v = Number(String(raw).trim()); return v > 0 ? v : 0 } catch { return 0 }
}

async function findPromptGraphFromComfyState(client, base, workflowId) {
	const histResult = await comfyJsonGet(client, `${base}/history`, 10000)
	if (histResult.error || !isRecord(histResult.data)) return { error: 'failed to fetch history' }
	const candidates = []
	let rank = 0
	for (const item of Object.values(histResult.data)) {
		if (!isRecord(item)) continue
		const p = item.prompt
		const { prompt } = extractPromptAndExtraFromEntry(p)
		if (!isRecord(prompt)) continue
		// Note: we can't extract extra from history entry easily in this format;
		// the prompt tuple format depends on ComfyUI version. Skip workflow ID filtering for reliability.
		candidates.push([0, rank, prompt])
		rank++
	}
	if (candidates.length === 0) return { error: 'no reusable prompt in history' }
	candidates.sort((a, b) => (b[0] - a[0]) || (b[1] - a[1]))
	return { prompt: candidates[0][2] }
}

// ---- Runtime API handlers ----

export async function runtimePing(ctx, payload) {
	const client = ctx.httpClient
	const p = payload || {}
	const { base, error: baseErr } = normalizeBaseUrl(p.baseUrl || getBaseUrl(ctx))
	if (baseErr) return { ok: false, error: baseErr }

	const statsResult = await comfyJsonGet(client, `${base}/system_stats`, 5000)
	if (statsResult.error || !isRecord(statsResult.data)) {
		return { ok: false, error: `ComfyUI unreachable: ${statsResult.error || 'unknown error'}` }
	}
	const system = isRecord(statsResult.data.system) ? statsResult.data.system : {}
	const devices = Array.isArray(statsResult.data.devices) ? statsResult.data.devices : []
	const device0 = isRecord(devices[0]) ? devices[0] : {}

	let nodeCount
	try {
		const cached = getCachedObjectInfo(base)
		if (cached && isRecord(cached)) {
			nodeCount = Object.keys(cached).length
		} else {
			const oiResult = await comfyJsonGet(client, `${base}/object_info`, 15000)
			if (!oiResult.error && isRecord(oiResult.data)) {
				setCachedObjectInfo(base, oiResult.data)
				nodeCount = Object.keys(oiResult.data).length
			}
		}
	} catch {}

	const systemInfo = {
		system: {
			comfyui_version: system.comfyui_version,
			os: system.os,
			python_version: system.python_version,
			pytorch_version: system.pytorch_version,
			embedded_python: system.embedded_python
		},
		devices
	}

	return {
		ok: true,
		baseUrl: base,
		comfyui: {
			version: system.comfyui_version,
			os: system.os,
			deviceName: device0.name,
			devices
		},
		systemInfo,
		nodeCount
	}
}

export async function runtimeGetObjectInfo(ctx, payload) {
	const client = ctx.httpClient
	const p = payload || {}
	const { base, error: baseErr } = normalizeBaseUrl(p.baseUrl || getBaseUrl(ctx))
	if (baseErr) return { ok: false, error: baseErr }

	const forceRefresh = coerceBool(p.forceRefresh)
	if (!forceRefresh) {
		const cached = getCachedObjectInfo(base)
		if (cached && isRecord(cached)) {
			return { ok: true, baseUrl: base, objectInfo: cached, nodeCount: Object.keys(cached).length, cached: true }
		}
	}

	const oiResult = await comfyJsonGet(client, `${base}/object_info`, 15000)
	if (oiResult.error || !isRecord(oiResult.data)) {
		return { ok: false, error: `failed to fetch object_info: ${oiResult.error || 'unknown error'}` }
	}
	setCachedObjectInfo(base, oiResult.data)
	return { ok: true, baseUrl: base, objectInfo: oiResult.data, nodeCount: Object.keys(oiResult.data).length, cached: false }
}

function extractHistoryWorkflows(historyData, maxItems) {
	if (!isRecord(historyData)) return []
	const entries = []
	for (const [promptId, entry] of Object.entries(historyData)) {
		if (!isRecord(entry)) continue
		const promptArr = entry.prompt
		if (!Array.isArray(promptArr) || promptArr.length < 3) continue
		const promptGraph = promptArr[2]
		if (!isRecord(promptGraph)) continue
		const numNodes = Object.keys(promptGraph).filter(k => /^\d+$/.test(k)).length
		if (numNodes === 0) continue

		let classType = '工作流'
		let timestamp = 0
		try {
			const status = entry.status
			if (isRecord(status) && status.messages && Array.isArray(status.messages) && status.messages.length > 0) {
				const firstMsg = status.messages[0]
				if (Array.isArray(firstMsg) && firstMsg.length > 0) {
					const ts = Number(firstMsg[0])
					if (Number.isFinite(ts) && ts > 0) timestamp = ts * 1000
				}
			}
		} catch {}

		const nodes = Object.values(promptGraph)
		for (const node of nodes) {
			if (isRecord(node) && typeof node.class_type === 'string' && node.class_type.trim()) {
				const ct = node.class_type.trim()
				if (ct !== 'CLIPTextEncode' && ct !== 'LoadImage' && ct !== 'SaveImage' && ct !== 'KSampler' && ct !== 'VAEDecode' && ct !== 'VAEEncode' && ct !== 'CheckpointLoaderSimple') {
					classType = ct
					break
				}
			}
		}

		const timeStr = timestamp > 0 ? new Date(timestamp).toLocaleString('zh-CN', { hour12: false }) : promptId.slice(0, 8)
		entries.push({
			path: `history://${promptId}`,
			name: `[历史] ${classType} - ${timeStr}`,
			source: 'history',
			promptId
		})
		if (entries.length >= maxItems) break
	}
	return entries
}

export async function runtimeListWorkflowFiles(ctx, payload) {
	const client = ctx.httpClient
	const p = payload || {}
	const { base, error: baseErr } = normalizeBaseUrl(p.baseUrl || getBaseUrl(ctx))
	if (baseErr) return { ok: false, error: baseErr }

	const params = new URLSearchParams({ dir: 'workflows', recurse: 'true' })
	const userdataUrl = `${base}/userdata?${params.toString()}`
	const userdataResult = await comfyJsonGet(client, userdataUrl, 10000)

	let workflows = []
	let source = 'userdata'
	let userdataError = null
	let apiFailed = false

	if (!userdataResult.error && Array.isArray(userdataResult.data)) {
		workflows = filterWorkflowFiles(userdataResult.data)
	} else {
		userdataError = userdataResult.error
		apiFailed = !!userdataError
	}

	if (workflows.length === 0) {
		const maxHistory = Number(p.maxHistory) || 20
		const histUrl = `${base}/history?max_items=${maxHistory}`
		const histResult = await comfyJsonGet(client, histUrl, 10000)
		if (!histResult.error && isRecord(histResult.data)) {
			const historyWorkflows = extractHistoryWorkflows(histResult.data, maxHistory)
			if (historyWorkflows.length > 0) {
				workflows = historyWorkflows
				source = 'history'
			}
		}
	}

	if (workflows.length === 0 && apiFailed) {
		return {
			ok: false,
			error: `无法获取工作流列表（/userdata错误: ${userdataError}）`,
			workflows: [],
			source
		}
	}

	return { ok: true, baseUrl: base, workflows, source }
}

export async function runtimeGetHistoryWorkflow(ctx, payload) {
	const client = ctx.httpClient
	const p = payload || {}
	const { base, error: baseErr } = normalizeBaseUrl(p.baseUrl || getBaseUrl(ctx))
	if (baseErr) return { ok: false, error: baseErr }

	const promptId = String(p.promptId || '').trim()
	if (!promptId) return { ok: false, error: 'promptId is required' }

	const histUrl = `${base}/history/${encodeURIComponent(promptId)}`
	const histResult = await comfyJsonGet(client, histUrl, 10000)
	if (histResult.error || !isRecord(histResult.data)) {
		return { ok: false, error: `failed to fetch history: ${histResult.error || 'unknown error'}` }
	}

	const entry = histResult.data[promptId]
	if (!isRecord(entry)) {
		return { ok: false, error: `history entry ${promptId} not found` }
	}

	const promptArr = entry.prompt
	if (!Array.isArray(promptArr) || promptArr.length < 3 || !isRecord(promptArr[2])) {
		return { ok: false, error: 'history entry does not contain valid prompt graph' }
	}
	const promptGraph = promptArr[2]

	let workflow = null
	if (Array.isArray(promptArr) && promptArr.length >= 4 && isRecord(promptArr[3])) {
		const extra = promptArr[3]
		const epi = extra.extra_pnginfo
		if (isRecord(epi) && isRecord(epi.workflow)) {
			workflow = epi.workflow
		}
	}

	if (!workflow) {
		workflow = { nodes: [], links: [], groups: [], config: {}, extra: {}, version: 0.4 }
		const nodes = []
		const links = []
		let nodeIdx = 0
		let linkId = 0
		const idToIdx = new Map()

		for (const [nodeId, nodeData] of Object.entries(promptGraph)) {
			if (!isRecord(nodeData)) continue
			const nid = Number(nodeId)
			if (!Number.isFinite(nid)) continue
			idToIdx.set(nid, nodeIdx)
			const classType = String(nodeData.class_type || '')
			const inputs = []
			const widgetsValues = []
			const inputDefs = nodeData.inputs
			if (isRecord(inputDefs)) {
				for (const [inputName, inputVal] of Object.entries(inputDefs)) {
					if (Array.isArray(inputVal) && inputVal.length === 2) {
						inputs.push({ name: inputName, type: '*', link: null })
					} else {
						inputs.push({ name: inputName, type: '*', link: null, widget: { name: inputName } })
						widgetsValues.push(inputVal)
					}
				}
			}
			nodes.push({
				id: nid,
				type: classType,
				pos: [nodeIdx * 220, 0],
				size: [210, 100],
				flags: {},
				order: nodeIdx,
				mode: 0,
				inputs,
				outputs: [],
				properties: { 'Node name for S&R': classType },
				widgets_values: widgetsValues
			})
			nodeIdx++
		}

		for (const [nodeId, nodeData] of Object.entries(promptGraph)) {
			if (!isRecord(nodeData)) continue
			const nid = Number(nodeId)
			if (!Number.isFinite(nid)) continue
			const fromIdx = idToIdx.get(nid)
			if (fromIdx === undefined) continue
			const inputDefs = nodeData.inputs
			if (!isRecord(inputDefs)) continue
			let slotIdx = 0
			for (const [, inputVal] of Object.entries(inputDefs)) {
				if (Array.isArray(inputVal) && inputVal.length === 2) {
					const fromNodeId = Number(inputVal[0])
					const fromSlot = Number(inputVal[1])
					const toIdx = idToIdx.get(fromNodeId)
					if (toIdx !== undefined) {
						const fromNode = nodes[fromIdx]
						if (!fromNode.outputs[slotIdx]) {
							fromNode.outputs.push({ name: `OUTPUT_${slotIdx}`, type: '*', links: [], slot_index: slotIdx, shape: 6 })
						}
						links.push([linkId, fromNodeId, fromSlot, nid, slotIdx, '*'])
						const toInput = fromNode.inputs.find(i => i.name === Object.keys(inputDefs)[slotIdx])
						if (toInput) toInput.link = linkId
						linkId++
					}
				}
				slotIdx++
			}
		}
		workflow.nodes = nodes
		workflow.links = links
	}

	const workflowPath = `history://${promptId}`
	return { ok: true, baseUrl: base, workflowPath, workflow, promptGraph, source: 'history' }
}

export async function runtimeGetWorkflowFile(ctx, payload) {
	const client = ctx.httpClient
	const p = payload || {}
	const { base, error: baseErr } = normalizeBaseUrl(p.baseUrl || getBaseUrl(ctx))
	if (baseErr) return { ok: false, error: baseErr }

	let workflowPath = String(p.workflowPath || '').trim()
	if (!workflowPath) return { ok: false, error: 'workflowPath is required' }

	if (workflowPath.startsWith('history://')) {
		const promptId = workflowPath.slice('history://'.length)
		return runtimeGetHistoryWorkflow(ctx, { baseUrl: base, promptId })
	}

	if (workflowPath.startsWith('/')) workflowPath = workflowPath.slice(1)

	const quoted = encodeURIComponent(workflowPath)
	const url = `${base}/userdata/${quoted}`
	try {
		const res = await client.get(url, { timeout: 10000 })
		if (!res.ok) {
			return { ok: false, error: `ComfyUI /userdata/{file} http ${res.status}` }
		}
		let workflow
		if (res.body && typeof res.body === 'object' && !Array.isArray(res.body) && !Buffer.isBuffer(res.body)) {
			workflow = res.body
		} else {
			let text
			if (typeof res.body === 'string') {
				text = res.body
			} else if (Buffer.isBuffer(res.rawBody)) {
				text = res.rawBody.toString('utf-8')
				if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
			} else {
				text = String(res.body ?? res.rawBody ?? '')
			}
			try { workflow = JSON.parse(text) }
			catch { return { ok: false, error: 'invalid workflow json' } }
		}

		return { ok: true, baseUrl: base, workflowPath, workflow, source: 'userdata' }
	} catch (err) {
		return { ok: false, error: `ComfyUI /userdata/{file} failed: ${String(err?.message || err)}` }
	}
}

export async function runtimeRunWorkflow(ctx, payload) {
	const client = ctx.httpClient
	const p = payload || {}
	const { base, error: baseErr } = normalizeBaseUrl(p.baseUrl || getBaseUrl(ctx))
	if (baseErr) return { ok: false, error: baseErr }

	const workflowPath = String(p.workflowPath || '').trim()
	if (!workflowPath) return { ok: false, error: 'workflowPath is required' }
	const positivePrompt = String(p.positivePrompt || '')
	const negativePrompt = String(p.negativePrompt || '')

	// Fetch workflow JSON from ComfyUI userdata
	const wfResult = await runtimeGetWorkflowFile(ctx, { baseUrl: base, workflowPath })
	if (!wfResult.ok) return { ok: false, error: `读取工作流失败：${wfResult.error}` }
	const workflowAny = wfResult.workflow

	// Upload input images
	const uploadedPaths = []
	const inputFiles = Array.isArray(p.files) ? p.files : []
	for (let i = 0; i < inputFiles.length; i++) {
		const f = inputFiles[i]
		if (!f) continue
		let fileBuf, fileName, fileMime
		if (f.dataUrl) {
			const match = String(f.dataUrl).match(/^data:([^;]+);base64,(.+)$/)
			if (match) {
				fileMime = match[1]
				fileBuf = Buffer.from(match[2], 'base64')
			}
		}
		if (!fileBuf && f.content) {
			fileBuf = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, 'base64')
		}
		if (!fileBuf) continue
		fileName = String(f.name || f.filename || `input_${i}.png`)
		fileMime = fileMime || f.contentType || f.mimeType || 'image/png'

		const upResult = await uploadImageToComfyui(client, base, fileName, fileBuf, fileMime)
		if (upResult.error) return { ok: false, error: `上传图片失败：${upResult.error}` }
		const name = String(upResult.data?.name || '').trim()
		const subfolder = String(upResult.data?.subfolder || '').trim().replace(/\\/g, '/')
		const upPath = subfolder ? `${subfolder}/${name}` : name
		if (upPath) uploadedPaths.push(upPath)
	}

	// Get object_info for workflow-to-prompt conversion (use cache if available)
	let objectInfo = getCachedObjectInfo(base)
	if (!objectInfo) {
		try {
			const oiResult = await comfyJsonGet(client, `${base}/object_info`, 15000)
			if (!oiResult.error && isRecord(oiResult.data)) {
				objectInfo = oiResult.data
				setCachedObjectInfo(base, objectInfo)
			}
		} catch {}
	}

	const knownNodeTypes = objectInfo ? new Set(Object.keys(objectInfo).filter(k => typeof k === 'string')) : null

	// Determine prompt graph
	let promptGraph
	let promptSource = 'history'

	if (isRecord(wfResult.promptGraph) && isPromptGraphJson(wfResult.promptGraph)) {
		promptGraph = wfResult.promptGraph
		promptSource = 'history-direct'
	}

	// Try to find from ComfyUI history first
	if (!isRecord(promptGraph)) {
		const workflowId = isRecord(workflowAny) ? String(workflowAny.id || '').trim() : ''
		if (workflowId) {
			const histResult = await findPromptGraphFromComfyState(client, base, workflowId)
			if (isRecord(histResult.prompt)) {
				promptGraph = histResult.prompt
			}
		}
	}

	// If workflow JSON is already a prompt graph, use it directly
	if (!isRecord(promptGraph)) {
		if (isPromptGraphJson(workflowAny)) {
			promptGraph = workflowAny
			promptSource = 'prompt-graph'
		} else if (isRecord(workflowAny) && isPromptGraphJson(workflowAny.prompt)) {
			promptGraph = workflowAny.prompt
			promptSource = 'wrapped-prompt'
		}
	}

	// Convert from workflow UI format
	if (!isRecord(promptGraph)) {
		if (isRecord(workflowAny) && Array.isArray(workflowAny.nodes) && Array.isArray(workflowAny.links)) {
			const convResult = workflowToPrompt(workflowAny, objectInfo, knownNodeTypes)
			if (convResult.error) {
				return { ok: false, error: `工作流转换失败：${convResult.error}` }
			}
			promptGraph = convResult.prompt
			promptSource = 'template'
		}
	}

	if (!isRecord(promptGraph)) {
		return { ok: false, error: '无法从工作流构建可执行的 prompt graph' }
	}

	// Deep copy to avoid mutating source
	try { promptGraph = JSON.parse(JSON.stringify(promptGraph)) } catch {}

	// Patch uploaded images into LoadImage nodes
	if (uploadedPaths.length > 0) {
		patchPromptGraphLoadImages(promptGraph, uploadedPaths)
	}

	// Normalize socket inputs
	normalizePromptGraphForRuntime(promptGraph, objectInfo)

	// Apply text overrides
	applyTextOverrides(promptGraph, positivePrompt, negativePrompt)

	// Submit to ComfyUI
	const clientId = crypto.randomBytes(16).toString('hex')
	const comfyPayload = {
		prompt: promptGraph,
		client_id: clientId,
		extra_data: {
			extra_pnginfo: { workflow: workflowAny },
			create_time: Date.now()
		}
	}

	const submitResult = await comfyJsonPost(client, `${base}/prompt`, comfyPayload, 30000)
	if (submitResult.error) {
		let comfyError = null
		if (submitResult.status === 400 && isRecord(submitResult.body)) {
			comfyError = submitResult.body
		}
		return {
			ok: false,
			error: `ComfyUI /prompt failed: ${submitResult.error}`,
			comfyuiError: comfyError,
			status: submitResult.status || 502
		}
	}

	const promptId = String(submitResult.data?.prompt_id || '').trim()
	return {
		ok: true,
		baseUrl: base,
		promptId,
		promptSource,
		result: submitResult.data
	}
}

export async function runtimeGetOutputs(ctx, payload) {
	const client = ctx.httpClient
	const p = payload || {}
	const { base, error: baseErr } = normalizeBaseUrl(p.baseUrl || getBaseUrl(ctx))
	if (baseErr) return { ok: false, error: baseErr }

	const promptId = String(p.promptId || p.id || '').trim()
	if (!promptId) return { ok: false, error: 'promptId is required' }

	const result = await comfyJsonGet(client, `${base}/history/${encodeURIComponent(promptId)}`, 10000)
	if (result.error || !isRecord(result.data)) {
		return { ok: false, error: `ComfyUI /history failed: ${result.error || 'unknown error'}` }
	}
	const media = extractMediaFromHistoryResult(base, result.data, promptId)
	return { ok: true, baseUrl: base, promptId, media, result: result.data }
}

export async function runtimeCancelRun(ctx, payload) {
	const client = ctx.httpClient
	const p = payload || {}
	const { base, error: baseErr } = normalizeBaseUrl(p.baseUrl || getBaseUrl(ctx))
	if (baseErr) return { ok: false, error: baseErr }

	const promptId = String(p.promptId || '').trim()
	if (!promptId) return { ok: false, error: 'promptId is required' }

	const result = await comfyJsonPost(client, `${base}/interrupt`, { prompt_id: promptId }, 10000)
	if (result.error) return { ok: false, error: `ComfyUI /interrupt failed: ${result.error}` }
	return { ok: true, baseUrl: base, result: result.data }
}

export async function runtimeGetJobStatus(ctx, payload) {
	const client = ctx.httpClient
	const p = payload || {}
	const { base, error: baseErr } = normalizeBaseUrl(p.baseUrl || getBaseUrl(ctx))
	if (baseErr) return { ok: false, error: baseErr }

	const jobId = String(p.id || p.promptId || '').trim()
	if (!jobId) return { ok: false, error: 'id is required' }

	// Try /api/jobs/{id} first
	const jobsResult = await comfyJsonGet(client, `${base}/api/jobs/${encodeURIComponent(jobId)}`, 10000)
	if (!jobsResult.error && isRecord(jobsResult.data)) {
		const statusText = String(jobsResult.data.status || '').trim().toLowerCase()
		const detailText = String(jobsResult.data.detail || jobsResult.data.error || '').trim().toLowerCase()
		if (!statusText && (detailText.includes('not found') || detailText.includes('missing'))) {
			return { ok: true, baseUrl: base, result: { id: jobId, status: 'not_found' } }
		}
		return { ok: true, baseUrl: base, result: jobsResult.data }
	}

	// Fallback to /history/{id}
	const histResult = await comfyJsonGet(client, `${base}/history/${encodeURIComponent(jobId)}`, 10000)
	if (histResult.error || !isRecord(histResult.data)) {
		return { ok: false, error: `job status failed: ${jobsResult.error || histResult.error || 'unknown error'}` }
	}
	if (!(jobId in histResult.data)) {
		return { ok: true, baseUrl: base, fallback: 'history', result: { id: jobId, status: 'not_found' } }
	}
	return { ok: true, baseUrl: base, fallback: 'history', result: histResult.data }
}
