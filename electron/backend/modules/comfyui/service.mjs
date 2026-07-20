import crypto from 'node:crypto'
import { internalError, invalidParamsError, notFoundError, upstreamError } from '../../core/errors.mjs'
import { workflowToPrompt as newWorkflowToPrompt } from './workflow-converter.mjs'

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
		if (typeof k !== 'string' || !k || !isRecord(val)) continue
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

const IMAGE_INPUT_CLASS_TYPES = new Set([
	'LoadImage', 'LoadImageFromUrl', 'LoadImageMask',
	'LoadImageOutput'
])

const VIDEO_INPUT_CLASS_TYPES = new Set([
	'VHS_LoadVideo', 'VHS_LoadAudio', 'LoadVideo', 'VideoLoad'
])

const MODEL3D_INPUT_CLASS_TYPES = new Set([
	'LoadGLB', 'LoadGLTF', 'LoadFBX', 'LoadOBJ', 'Load3DModel',
	'TripoLoadGLB', 'MeshyLoadModel', 'LoadModel3D'
])

function getNodePosition(node) {
	if (!isRecord(node)) return [0, 0]
	const pos = node._meta?.pos
	if (Array.isArray(pos) && pos.length >= 2) {
		const x = Number(pos[0]), y = Number(pos[1])
		if (Number.isFinite(x) && Number.isFinite(y)) return [x, y]
	}
	return [0, 0]
}

function sortNodesByPosition(nodes) {
	return nodes.sort((a, b) => {
		const [ax, ay] = a.pos
		const [bx, by] = b.pos
		if (Math.abs(ax - bx) > 50) return ax - bx
		return ay - by
	})
}

function classifyInputNode(classType) {
	const ct = String(classType || '').trim()
	if (IMAGE_INPUT_CLASS_TYPES.has(ct)) return 'image'
	if (VIDEO_INPUT_CLASS_TYPES.has(ct)) return 'video'
	if (MODEL3D_INPUT_CLASS_TYPES.has(ct)) return 'model3d'
	if (/load.*image/i.test(ct)) return 'image'
	if (/load.*video/i.test(ct)) return 'video'
	if (/load.*(glb|gltf|fbx|obj|3d|model)/i.test(ct)) return 'model3d'
	return null
}

function patchPromptGraphInputs(promptGraph, uploadedImages, uploadedVideos, uploadedModels) {
	const imageNodes = []
	const videoNodes = []
	const modelNodes = []

	for (const [k, v] of Object.entries(promptGraph)) {
		if (!isRecord(v)) continue
		const classType = String(v.class_type || '')
		const meta = isRecord(v._meta) ? v._meta : {}
		const title = String(meta.title || '')
		const pos = getNodePosition(meta)
		const category = classifyInputNode(classType)
		const entry = { id: k, node: v, title, pos, classType }
		if (category === 'image') imageNodes.push(entry)
		else if (category === 'video') videoNodes.push(entry)
		else if (category === 'model3d') modelNodes.push(entry)
	}

	const sortedImages = sortNodesByPosition(imageNodes)
	const sortedVideos = sortNodesByPosition(videoNodes)
	const sortedModels = sortNodesByPosition(modelNodes)

	const assignPaths = (nodes, paths, inputKey) => {
		for (let idx = 0; idx < paths.length && idx < nodes.length; idx++) {
			const { node } = nodes[idx]
			if (!isRecord(node.inputs)) node.inputs = {}
			node.inputs[inputKey] = paths[idx]
		}
	}

	assignPaths(sortedImages, uploadedImages, 'image')
	assignPaths(sortedVideos, uploadedVideos, 'video')
	assignPaths(sortedModels, uploadedModels, 'model_file')

	if (uploadedModels.length > 0 && modelNodes.length === 0) {
		for (let idx = 0; idx < uploadedModels.length; idx++) {
			const modelPath = uploadedModels[idx]
			for (const [k, v] of Object.entries(promptGraph)) {
				if (!isRecord(v)) continue
				const classType = String(v.class_type || '')
				if (!/glb|gltf|fbx|obj|model3d|3dmodel/i.test(classType)) continue
				if (!isRecord(v.inputs)) v.inputs = {}
				if (!v.inputs.model_file && !v.inputs.model && !v.inputs.model_path) {
					v.inputs.model_file = modelPath
					break
				}
			}
		}
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

const FRONTEND_ONLY_NODE_TYPES = new Set([
	'MarkdownNote', 'Note', 'Reroute', 'PrimitiveNode',
	'PrimitiveString', 'PrimitiveStringMultiline', 'PrimitiveNumber', 'PrimitiveBoolean',
	'PrimitiveInteger', 'PrimitiveFloat', 'PrimitiveText',
	'GroupNode', 'SubgraphNode', 'ComfyNote', 'NoteNode',
	'NodeNote', 'Comment', 'Annotation', 'Label',
	'WidgetNode', 'Converter', 'RelayNode', 'RerouteNode',
	'FrontendNode', 'VirtualNode', 'PlaceholderNode',
	'QuickNodes', 'TextNote', 'StickyNote'
])

function isPrimitiveNodeType(typeStr) {
	if (typeof typeStr !== 'string') return false
	const t = typeStr.trim()
	if (!t) return false
	if (FRONTEND_ONLY_NODE_TYPES.has(t)) {
		return t === 'PrimitiveNode' || t.startsWith('Primitive')
	}
	return false
}

function normalizeNodeId(id) {
	if (id == null) return ''
	const s = String(id).trim()
	if (!s || s === 'undefined' || s === 'null' || s === 'NaN') return ''
	return s
}

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

function isUuidLikeType(typeStr) {
	if (typeof typeStr !== 'string') return false
	return UUID_RE.test(typeStr.trim())
}

function isPassthroughNode(node) {
	if (!isRecord(node)) return false
	const ct = String(node.type || '').trim()
	if (FRONTEND_ONLY_NODE_TYPES.has(ct)) return true
	return false
}

function isNodeSkipped(node, nid, rerouteNodeIds, valueProviderNodes) {
	if (!isRecord(node)) return true
	const ct = String(node.type || '').trim()
	if (FRONTEND_ONLY_NODE_TYPES.has(ct)) return true
	if (rerouteNodeIds.has(nid)) return true
	if (valueProviderNodes.has(nid)) return true
	return false
}

function isRerouteLikeNode(node) {
	if (!isRecord(node)) return false
	const ct = String(node.type || '').trim()
	if (ct === 'Reroute' || ct === 'RerouteNode' || ct === 'RelayNode') return true
	return false
}

function hasNodeInputConnections(node, nodeInputLinksMap) {
	const nid = normalizeNodeId(node.id)
	const links = nodeInputLinksMap.get(nid)
	return Array.isArray(links) && links.length > 0
}

function resolveNodeClassType(node) {
	if (!isRecord(node)) return ''
	const t = String(node.type || '').trim()
	if (t) return t
	const props = isRecord(node.properties) ? node.properties : {}
	const candidates = [
		props.comfyClass, props.class_type, props.classType,
		props.node_type, props.nodeType,
		node.class_type, node.classType
	]
	for (const c of candidates) {
		const s = String(c || '').trim()
		if (s) return s
	}
	return t
}

function structurallyLooksLikeReroute(node) {
	if (!isRecord(node)) return false
	if (isRerouteLikeNode(node)) return true
	const inputs = Array.isArray(node.inputs) ? node.inputs : []
	const outputs = Array.isArray(node.outputs) ? node.outputs : []
	if (inputs.length <= 1 && outputs.length <= 1) {
		const inpType = inputs.length === 1 ? String(inputs[0]?.type || '*').trim() : ''
		const outType = outputs.length === 1 ? String(outputs[0]?.type || '*').trim() : ''
		if (inpType === '*' && outType === '*') return true
	}
	return false
}

function structurallyLooksLikePrimitive(node) {
	if (!isRecord(node)) return false
	const ct = String(node.type || '').trim()
	if (isPrimitiveNodeType(ct)) return true
	const inputs = Array.isArray(node.inputs) ? node.inputs : []
	const outputs = Array.isArray(node.outputs) ? node.outputs : []
	const values = Array.isArray(node.widgets_values) ? node.widgets_values : []
	if (inputs.length === 0 && outputs.length <= 1 && values.length >= 1) {
		return true
	}
	if (inputs.length === 0 && outputs.length === 1 && isRecord(outputs[0])) {
		const outType = String(outputs[0].type || '*').trim().toUpperCase()
		if (['*', 'STRING', 'INT', 'FLOAT', 'NUMBER', 'BOOLEAN', 'BOOL'].includes(outType)) {
			return true
		}
	}
	return false
}

function structurallyLooksLikeNote(node) {
	if (!isRecord(node)) return false
	const ct = String(node.type || '').trim()
	if (FRONTEND_ONLY_NODE_TYPES.has(ct) && !isPrimitiveNodeType(ct) && !isRerouteLikeNode(node)) return true
	const inputs = Array.isArray(node.inputs) ? node.inputs : []
	const outputs = Array.isArray(node.outputs) ? node.outputs : []
	if (inputs.length === 0 && outputs.length === 0) return true
	return false
}

function deepCloneJson(v) {
	if (v === undefined || v === null) return v
	return JSON.parse(JSON.stringify(v))
}

function findSubgraphDefsInObject(obj, depth, results) {
	if (depth > 6 || obj == null || typeof obj !== 'object') return
	if (Array.isArray(obj)) {
		for (const item of obj) {
			findSubgraphDefsInObject(item, depth + 1, results)
		}
		return
	}
	const hasNodesLinks = Array.isArray(obj.nodes) && obj.nodes.length > 0 && Array.isArray(obj.links)
	if (hasNodesLinks) {
		results.push(obj)
	}
	for (const [k, v] of Object.entries(obj)) {
		if (k === 'links') continue
		findSubgraphDefsInObject(v, depth + 1, results)
	}
}

function looksLikeSubgraphDef(v) {
	if (!isRecord(v)) return false
	if (Array.isArray(v.nodes) && v.nodes.length > 0 && Array.isArray(v.links)) return true
	if (isRecord(v.data) && Array.isArray(v.data.nodes) && v.data.nodes.length > 0 && Array.isArray(v.data.links)) return true
	if (isRecord(v.graph) && Array.isArray(v.graph.nodes) && v.graph.nodes.length > 0 && Array.isArray(v.graph.links)) return true
	if (isRecord(v.subgraph) && Array.isArray(v.subgraph.nodes) && v.subgraph.nodes.length > 0 && Array.isArray(v.subgraph.links)) return true
	return false
}

function extractSubgraphContent(v) {
	if (!isRecord(v)) return null
	if (Array.isArray(v.nodes) && v.nodes.length > 0 && Array.isArray(v.links)) return v
	if (isRecord(v.data) && Array.isArray(v.data.nodes) && v.data.nodes.length > 0 && Array.isArray(v.data.links)) return v.data
	if (isRecord(v.graph) && Array.isArray(v.graph.nodes) && v.graph.nodes.length > 0 && Array.isArray(v.graph.links)) return v.graph
	if (isRecord(v.subgraph) && Array.isArray(v.subgraph.nodes) && v.subgraph.nodes.length > 0 && Array.isArray(v.subgraph.links)) return v.subgraph
	return null
}

function findSubgraphDefinitions(workflow) {
	const defs = new Map()
	if (!isRecord(workflow) || !isRecord(workflow.definitions)) return defs
	const subgraphsArr = workflow.definitions.subgraphs
	if (!Array.isArray(subgraphsArr)) return defs
	for (const sg of subgraphsArr) {
		if (!isRecord(sg)) continue
		let content = sg
		if (isRecord(sg.data) && Array.isArray(sg.data.nodes) && Array.isArray(sg.data.links)) content = sg.data
		else if (isRecord(sg.graph) && Array.isArray(sg.graph.nodes) && Array.isArray(sg.graph.links)) content = sg.graph
		else if (isRecord(sg.subgraph) && Array.isArray(sg.subgraph.nodes) && Array.isArray(sg.subgraph.links)) content = sg.subgraph
		if (!Array.isArray(content.nodes) || !Array.isArray(content.links)) continue
		const sgId = normalizeNodeId(sg.id ?? sg.uuid)
		if (!sgId) continue
		let vInId = null, vOutId = null
		if (isRecord(sg.inputNode)) vInId = normalizeNodeId(sg.inputNode.id)
		else if (sg.inputNode != null) vInId = normalizeNodeId(sg.inputNode)
		if (isRecord(sg.outputNode)) vOutId = normalizeNodeId(sg.outputNode.id)
		else if (sg.outputNode != null) vOutId = normalizeNodeId(sg.outputNode)
		defs.set(sgId, {
			id: sgId,
			name: String(sg.name || ''),
			inputNodeId: vInId,
			outputNodeId: vOutId,
			nodes: content.nodes,
			links: content.links
		})
	}
	return defs
}

function parseLinkEndpoint(l, which) {
	if (Array.isArray(l) && l.length >= 5) {
		if (which === 'from') return { id: normalizeNodeId(l[1]), slot: Number(l[2]), type: String(l[5] || '*') }
		return { id: normalizeNodeId(l[3]), slot: Number(l[4]), type: String(l[5] || '*') }
	}
	if (isRecord(l)) {
		if (which === 'from') return { id: normalizeNodeId(l.origin_id ?? l.fromId ?? l.sourceId), slot: Number(l.origin_slot ?? l.fromSlot ?? l.sourceSlot ?? 0), type: String(l.type || l.dataType || '*') }
		return { id: normalizeNodeId(l.target_id ?? l.toId ?? l.targetId), slot: Number(l.target_slot ?? l.toSlot ?? l.targetSlot ?? 0), type: String(l.type || l.dataType || '*') }
	}
	return null
}

function getMaxNumericId(nodesArr) {
	let max = 0
	for (const n of nodesArr) {
		if (!isRecord(n)) continue
		const id = Number(n.id)
		if (Number.isFinite(id) && id > max) max = id
	}
	return max
}

function expandSubgraphsInWorkflow(workflow) {
	if (!isRecord(workflow) || !Array.isArray(workflow.nodes) || !Array.isArray(workflow.links)) {
		return { nodes: workflow?.nodes || [], links: workflow?.links || [] }
	}
	let nodes = deepCloneJson(workflow.nodes)
	let links = deepCloneJson(workflow.links)
	const defs = findSubgraphDefinitions(workflow)
	if (defs.size === 0) {
		console.log('[subgraph] No subgraph definitions found')
		return resolveAllReroutes(nodes, links)
	}
	console.log(`[subgraph] Found ${defs.size} subgraph definitions`)

	let passCount = 0
	let expandedAny = true
	while (expandedAny && passCount < 10) {
		passCount++
		expandedAny = false
		const newNodes = []
		let maxId = getMaxNumericId([...nodes, ...newNodes])
		const usedIds = new Set()
		for (const existing of [...nodes, ...newNodes]) {
			if (!isRecord(existing)) continue
			const eid = normalizeNodeId(existing.id)
			if (eid) usedIds.add(eid)
		}

		for (let ni = 0; ni < nodes.length; ni++) {
			const n = nodes[ni]
			if (!isRecord(n)) { newNodes.push(n); continue }
			const nid = normalizeNodeId(n.id)
			const ntype = String(n.type || '').trim()
			if (!nid) { newNodes.push(n); continue }

			const def = defs.get(ntype)
			if (!def || !isUuidLikeType(ntype)) {
				newNodes.push(n)
				continue
			}

			console.log(`[subgraph] Expanding node ${nid} type=${ntype} (${def.name})`)
			expandedAny = true

			const internalNodes = deepCloneJson(def.nodes)
			const internalLinks = deepCloneJson(def.links)
			const vInId = def.inputNodeId
			const vOutId = def.outputNodeId
			console.log(`[subgraph]   virtual in=${vInId}, out=${vOutId}, internal nodes=${internalNodes.length}, links=${internalLinks.length}`)

			const idRemap = new Map()
			const keptInternal = []

			for (const inNode of internalNodes) {
				if (!isRecord(inNode)) continue
				const oldId = normalizeNodeId(inNode.id)
				if (!oldId) continue
				const oldIdNum = Number(oldId)
				if (Number.isFinite(oldIdNum) && oldIdNum < 0) {
					idRemap.set(oldId, '__VIRTUAL__')
					continue
				}
				const itype = String(inNode.type || '').trim()
				if (itype === 'Note' || itype === 'MarkdownNote') {
					idRemap.set(oldId, '__VIRTUAL__')
					continue
				}
				maxId++
				while (usedIds.has(String(maxId))) maxId++
				const newId = String(maxId)
				idRemap.set(oldId, newId)
				usedIds.add(newId)
				inNode.id = newId
				if (Array.isArray(inNode.inputs)) {
					for (const inp of inNode.inputs) {
						if (isRecord(inp)) { inp.link = null; if (Array.isArray(inp.links)) inp.links = [] }
					}
				}
				if (Array.isArray(inNode.outputs)) {
					for (const out of inNode.outputs) {
						if (isRecord(out)) { if (Array.isArray(out.links)) out.links = [] }
					}
				}
				keptInternal.push(inNode)
			}

			const inputBridges = new Map()
			const outputBridges = new Map()
			for (const l of internalLinks) {
				const from = parseLinkEndpoint(l, 'from')
				const to = parseLinkEndpoint(l, 'to')
				if (!from || !to) continue
				if (vInId && from.id === vInId) {
					const slot = from.slot
					if (!inputBridges.has(slot)) inputBridges.set(slot, [])
					const newTgtId = idRemap.get(to.id)
					if (newTgtId && newTgtId !== '__VIRTUAL__') {
						inputBridges.get(slot).push({ targetId: newTgtId, targetSlot: to.slot, type: to.type })
					}
				}
				if (vOutId && to.id === vOutId) {
					const slot = to.slot
					if (!outputBridges.has(slot)) outputBridges.set(slot, [])
					const newSrcId = idRemap.get(from.id)
					if (newSrcId && newSrcId !== '__VIRTUAL__') {
						outputBridges.get(slot).push({ sourceId: newSrcId, sourceSlot: from.slot, type: from.type })
					}
				}
			}

			const extInLinks = new Map()
			const extOutLinks = new Map()
			const remainingLinks = []
			for (const l of links) {
				const from = parseLinkEndpoint(l, 'from')
				const to = parseLinkEndpoint(l, 'to')
				if (!from || !to) { remainingLinks.push(l); continue }
				if (to.id === nid) {
					const slot = to.slot
					if (!extInLinks.has(slot)) extInLinks.set(slot, [])
					extInLinks.get(slot).push(from)
				} else if (from.id === nid) {
					const slot = from.slot
					if (!extOutLinks.has(slot)) extOutLinks.set(slot, [])
					extOutLinks.get(slot).push(to)
				} else {
					remainingLinks.push(l)
				}
			}
			links = remainingLinks

			const newLinks = []
			for (const l of internalLinks) {
				const from = parseLinkEndpoint(l, 'from')
				const to = parseLinkEndpoint(l, 'to')
				if (!from || !to) continue
				const newFrom = idRemap.get(from.id)
				const newTo = idRemap.get(to.id)
				if (!newFrom || !newTo) continue
				if (newFrom === '__VIRTUAL__' || newTo === '__VIRTUAL__') continue
				const ltype = from.type !== '*' ? from.type : to.type
				newLinks.push([crypto.randomUUID(), newFrom, from.slot, newTo, to.slot, ltype])
			}

			let rewireIn = 0, rewireOut = 0
			for (const [slot, sources] of extInLinks) {
				const bridges = inputBridges.get(slot) || []
				for (const src of sources) {
					for (const br of bridges) {
						const ltype = br.type !== '*' ? br.type : src.type
						newLinks.push([crypto.randomUUID(), src.id, src.slot, br.targetId, br.targetSlot, ltype])
						rewireIn++
					}
				}
			}
			for (const [slot, targets] of extOutLinks) {
				const bridges = outputBridges.get(slot) || []
				for (const tgt of targets) {
					for (const br of bridges) {
						const ltype = br.type !== '*' ? br.type : tgt.type
						newLinks.push([crypto.randomUUID(), br.sourceId, br.sourceSlot, tgt.id, tgt.slot, ltype])
						rewireOut++
					}
				}
			}

			console.log(`[subgraph]   rewired in=${rewireIn}, out=${rewireOut}, internal links=${newLinks.length}, added ${keptInternal.length} nodes`)

			for (const kn of keptInternal) newNodes.push(kn)
			for (const nl of newLinks) links.push(nl)
		}
		nodes = newNodes
	}
	console.log(`[subgraph] Expansion complete after ${passCount} passes. Nodes: ${nodes.length}, Links: ${links.length}`)

	const resolved = resolveAllReroutes(nodes, links)
	console.log(`[subgraph] After Reroute resolution: nodes=${resolved.nodes.length}, links=${resolved.links.length}`)
	return resolved
}

function workflowToPrompt(workflow, objectInfo, knownNodeTypes) {
	if (!isRecord(workflow)) return { error: 'workflow must be object' }

	console.log('[ComfyUI workflowToPrompt] ===== WORKFLOW TOP-LEVEL KEYS =====')
	for (const [k, v] of Object.entries(workflow)) {
		const vtype = Array.isArray(v) ? `array[${v.length}]` : typeof v
		console.log(`  key "${k}": ${vtype}`)
		if (k === 'extra' && isRecord(v)) {
			console.log(`  extra keys:`, Object.keys(v))
			for (const [ek, ev] of Object.entries(v)) {
				const evtype = Array.isArray(ev) ? `array[${ev.length}]` : (isRecord(ev) ? `object{keys:${Object.keys(ev).join(',')}}` : typeof ev)
				console.log(`    extra["${ek}"]: ${evtype}`)
				if (isRecord(ev) && ('nodes' in ev || 'links' in ev)) {
					console.log(`    >>> extra["${ek}"] CONTAINS nodes/links - POSSIBLE SUBGRAPH!`)
					console.log(`    ${JSON.stringify(ev).substring(0, 2000)}`)
				}
			}
		}
		if (k === 'groups' && Array.isArray(v)) {
			for (let gi = 0; gi < Math.min(v.length, 5); gi++) {
				console.log(`  group[${gi}]:`, JSON.stringify(v[gi]).substring(0, 500))
			}
		}
		if (k !== 'nodes' && k !== 'links' && isRecord(v) && ('nodes' in v || 'links' in v)) {
			console.log(`  >>> KEY "${k}" CONTAINS nodes/links!`)
		}
	}

	function findSubgraphDefs(obj, path, depth, found) {
		if (depth > 5) return
		if (Array.isArray(obj)) {
			for (let i = 0; i < obj.length; i++) {
				findSubgraphDefs(obj[i], `${path}[${i}]`, depth + 1, found)
			}
		} else if (isRecord(obj)) {
			if (Array.isArray(obj.nodes) && Array.isArray(obj.links) && path !== '') {
				found.push({ path, nodeCount: obj.nodes.length, linkCount: obj.links.length })
			}
			for (const [k2, v2] of Object.entries(obj)) {
				if (k2 === 'nodes' || k2 === 'links') continue
				findSubgraphDefs(v2, `${path}.${k2}`, depth + 1, found)
			}
		}
	}
	const subgraphsFound = []
	findSubgraphDefs(workflow, '', 0, subgraphsFound)
	if (subgraphsFound.length > 0) {
		console.log('[ComfyUI workflowToPrompt] ===== FOUND NESTED GRAPHS (possible subgraphs):')
		for (const sg of subgraphsFound) {
			console.log(`  path: ${sg.path}, nodes: ${sg.nodeCount}, links: ${sg.linkCount}`)
		}
	}

	const expanded = expandSubgraphsInWorkflow(workflow)
	const nodes = expanded.nodes
	const links = expanded.links
	if (!Array.isArray(nodes) || !Array.isArray(links)) return { error: 'workflow.nodes/workflow.links missing' }

	console.log('[ComfyUI workflowToPrompt] nodes count:', nodes.length, 'links count:', links.length)
	const remainingUuidNodes = []
	for (let i = 0; i < nodes.length; i++) {
		const n = nodes[i]
		if (isRecord(n)) {
			const ct = String(n.type || '').trim()
			const nodeKeys = Object.keys(n)
			console.log(`  node[${i}] id=`, n.id, 'type=', n.type, 'title=', n.title, 'keys=[', nodeKeys.join(','), ']')
			if (isUuidLikeType(ct)) {
				remainingUuidNodes.push({ index: i, id: n.id, type: ct, title: n.title, keys: nodeKeys })
				console.log(`    [UUID NODE FULL JSON - AFTER EXPANSION]:`, JSON.stringify(n, null, 2).substring(0, 8000))
				if (n.properties && isRecord(n.properties)) {
					console.log(`    [UUID NODE PROPERTIES KEYS]:`, Object.keys(n.properties))
					for (const [pk, pv] of Object.entries(n.properties)) {
						const pvt = Array.isArray(pv) ? `array[${pv.length}]` : typeof pv
						console.log(`      property "${pk}": ${pvt}${isRecord(pv) ? ` keys=[${Object.keys(pv).join(',')}]` : ''}`)
					}
				}
				if (n.widgets_values) {
					console.log(`    [UUID NODE WIDGETS_VALUES]:`, JSON.stringify(n.widgets_values, null, 2).substring(0, 3000))
				}
			}
		}
	}
	if (remainingUuidNodes.length > 0) {
		console.log(`[ComfyUI workflowToPrompt] WARNING: ${remainingUuidNodes.length} UUID-type nodes remain after expansion. These may cause ComfyUI errors:`)
		for (const un of remainingUuidNodes) {
			console.log(`  - Node id=${un.id}, type=${un.type}, title=${un.title}`)
		}
		const sgType = typeof workflow.subgraphs
		console.log(`[ComfyUI workflowToPrompt] workflow.subgraphs type: ${sgType}`)
		if (workflow.subgraphs) {
			if (Array.isArray(workflow.subgraphs)) {
				console.log(`[ComfyUI workflowToPrompt] workflow.subgraphs is array with ${workflow.subgraphs.length} entries`)
				for (let si = 0; si < workflow.subgraphs.length; si++) {
					const sg = workflow.subgraphs[si]
					if (isRecord(sg)) {
						console.log(`  subgraphs[${si}]: id=${sg.id}, type=${sg.type}, nodes=${Array.isArray(sg.nodes)?sg.nodes.length:'N/A'}, links=${Array.isArray(sg.links)?sg.links.length:'N/A'}`)
					}
				}
			} else if (isRecord(workflow.subgraphs)) {
				console.log(`[ComfyUI workflowToPrompt] workflow.subgraphs is object with keys: ${Object.keys(workflow.subgraphs).join(',')}`)
			}
		}
	}
	for (let i = 0; i < Math.min(links.length, 50); i++) {
		console.log(`  link[${i}]:`, links[i])
	}

	const linkFromById = new Map()
	const linkToById = new Map()
	const usedNodeIds = new Set()
	const nodeOutputsMap = new Map()
	const nodeInputLinksMap = new Map()
	const allNodeIds = new Set()
	const rerouteNodeIds = new Set()
	const valueProviderNodes = new Map()
	const nodeById = new Map()

	function getPrimitiveNodeValue(node) {
		if (!isRecord(node)) return undefined
		const values = Array.isArray(node.widgets_values) ? node.widgets_values : []
		if (values.length > 0) return values[0]
		const inputs = Array.isArray(node.inputs) ? node.inputs : []
		for (const inp of inputs) {
			if (isRecord(inp) && isRecord(inp.widget) && 'value' in inp.widget) {
				return inp.widget.value
			}
		}
		return undefined
	}

	for (const node of nodes) {
		if (!isRecord(node)) continue
		const nid = normalizeNodeId(node.id)
		if (!nid) continue
		allNodeIds.add(nid)
		nodeById.set(nid, node)
		const outputsArr = Array.isArray(node.outputs) ? node.outputs : []
		nodeOutputsMap.set(nid, outputsArr.map((o, i) => isRecord(o) ? { name: String(o.name || '').trim(), type: String(o.type || '*').trim(), links: Array.isArray(o.links) ? o.links : [], slot_index: typeof o.slot_index === 'number' ? o.slot_index : i } : { name: '', type: '*', links: [], slot_index: i }))
	}

	for (const l of links) {
		let linkId, fromNodeId, toNodeId, fromSlot, toSlot
		
		if (Array.isArray(l)) {
			if (l.length < 5) continue
			linkId = normalizeNodeId(l[0])
			fromNodeId = normalizeNodeId(l[1])
			fromSlot = Number(l[2])
			toNodeId = normalizeNodeId(l[3])
			toSlot = Number(l[4])
			if (!fromNodeId || !toNodeId) {
				if (l.length >= 4) {
					const raw0 = normalizeNodeId(l[0])
					const raw1 = Number(l[1])
					const raw2 = normalizeNodeId(l[2])
					const raw3 = Number(l[3])
					if (raw0 && raw2 && Number.isFinite(raw1) && Number.isFinite(raw3)) {
						linkId = crypto.randomUUID()
						fromNodeId = raw0
						fromSlot = raw1
						toNodeId = raw2
						toSlot = raw3
					}
				}
			}
		} else if (isRecord(l)) {
			linkId = normalizeNodeId(l.id ?? l.linkId ?? l.link_id)
			fromNodeId = normalizeNodeId(l.origin_id ?? l.fromId ?? l.from_node_id ?? l.sourceId ?? l.source_node_id)
			fromSlot = Number(l.origin_slot ?? l.fromSlot ?? l.from_slot ?? l.sourceSlot ?? l.source_slot ?? 0)
			toNodeId = normalizeNodeId(l.target_id ?? l.toId ?? l.to_node_id ?? l.targetId ?? l.target_node_id)
			toSlot = Number(l.target_slot ?? l.toSlot ?? l.to_slot ?? l.targetSlot ?? l.target_slot ?? 0)
			if (!linkId) {
				linkId = crypto.randomUUID()
			}
		} else {
			continue
		}
		
		if (!linkId || !fromNodeId || !toNodeId) continue
		if (!Number.isFinite(fromSlot) || !Number.isFinite(toSlot)) continue
		
		linkFromById.set(linkId, { origin_id: fromNodeId, origin_slot: fromSlot })
		linkToById.set(linkId, { target_id: toNodeId, target_slot: toSlot })
		usedNodeIds.add(fromNodeId)
		usedNodeIds.add(toNodeId)
		
		if (!nodeInputLinksMap.has(toNodeId)) {
			nodeInputLinksMap.set(toNodeId, [])
		}
		nodeInputLinksMap.get(toNodeId).push({ linkId, fromNodeId, fromSlot, toSlot })
	}

	for (const [nid, node] of nodeById) {
		const ct = resolveNodeClassType(node)
		if (structurallyLooksLikeNote(node)) {
			if (!structurallyLooksLikePrimitive(node) && !structurallyLooksLikeReroute(node)) {
				continue
			}
		}
		if (structurallyLooksLikeReroute(node)) {
			rerouteNodeIds.add(nid)
			continue
		}
		if (structurallyLooksLikePrimitive(node)) {
			const v = getPrimitiveNodeValue(node)
			if (v !== undefined) {
				valueProviderNodes.set(nid, v)
			} else if (hasNodeInputConnections(node, nodeInputLinksMap)) {
				rerouteNodeIds.add(nid)
			}
			continue
		}
		if (FRONTEND_ONLY_NODE_TYPES.has(ct)) {
			if (hasNodeInputConnections(node, nodeInputLinksMap)) {
				rerouteNodeIds.add(nid)
			} else {
				const v = getPrimitiveNodeValue(node)
				if (v !== undefined) {
					valueProviderNodes.set(nid, v)
				}
			}
			continue
		}
	}

	const prompt = {}
	const skippedNodeIds = new Set()
	const finalPromptNodeIds = new Set()

	for (const node of nodes) {
		if (!isRecord(node)) continue
		const nid = normalizeNodeId(node.id)
		if (!nid) continue
		const classType = resolveNodeClassType(node)
		if (!classType) {
			skippedNodeIds.add(nid)
			continue
		}
		if (rerouteNodeIds.has(nid) || valueProviderNodes.has(nid)) {
			skippedNodeIds.add(nid)
			continue
		}
		if (structurallyLooksLikeNote(node) || structurallyLooksLikePrimitive(node) || structurallyLooksLikeReroute(node)) {
			skippedNodeIds.add(nid)
			continue
		}
		if (FRONTEND_ONLY_NODE_TYPES.has(classType)) {
			skippedNodeIds.add(nid)
			continue
		}

		finalPromptNodeIds.add(nid)
	}

	function resolveLinkSource2(linkId, visited) {
		if (visited.has(linkId)) return null
		visited.add(linkId)
		const fromInfo = linkFromById.get(linkId)
		if (!fromInfo) return null
		const { origin_id, origin_slot } = fromInfo
		if (valueProviderNodes.has(origin_id)) {
			return { value: valueProviderNodes.get(origin_id) }
		}
		if (finalPromptNodeIds.has(origin_id)) {
			return { nodeId: origin_id, slot: origin_slot }
		}
		const relayNode = nodeById.get(origin_id)
		if (!isRecord(relayNode)) return null

		const relayInputs = Array.isArray(relayNode.inputs) ? relayNode.inputs : []
		const relayOutputs = Array.isArray(relayNode.outputs) ? relayNode.outputs : []

		let targetInputIndex = -1
		const targetOutput = relayOutputs[origin_slot]
		if (isRecord(targetOutput)) {
			const targetOutType = String(targetOutput.type || '*').trim().toUpperCase()
			const targetOutName = String(targetOutput.name || '').trim().toLowerCase()
			for (let i = 0; i < relayInputs.length; i++) {
				const inp = relayInputs[i]
				if (!isRecord(inp)) continue
				const inType = String(inp.type || '*').trim().toUpperCase()
				const inName = String(inp.name || '').trim().toLowerCase()
				if (inType === targetOutType || inName === targetOutName) {
					const hasLink = inp.link != null || (Array.isArray(inp.links) && inp.links.length > 0)
					if (hasLink) {
						targetInputIndex = i
						break
					}
				}
			}
			if (targetInputIndex < 0 && origin_slot < relayInputs.length) {
				const candidate = relayInputs[origin_slot]
				if (isRecord(candidate) && (candidate.link != null || (Array.isArray(candidate.links) && candidate.links.length > 0))) {
					targetInputIndex = origin_slot
				}
			}
		}
		if (targetInputIndex < 0) {
			for (let i = 0; i < relayInputs.length; i++) {
				const inp = relayInputs[i]
				if (!isRecord(inp)) continue
				if (inp.link != null || (Array.isArray(inp.links) && inp.links.length > 0)) {
					targetInputIndex = i
					break
				}
			}
		}

		if (targetInputIndex < 0) {
			const v = getPrimitiveNodeValue(relayNode)
			if (v !== undefined) {
				return { value: v }
			}
			return null
		}

		const targetInput = relayInputs[targetInputIndex]
		let prevLinkId = null
		if (targetInput.link != null) {
			prevLinkId = normalizeNodeId(targetInput.link)
		} else if (Array.isArray(targetInput.links) && targetInput.links.length > 0) {
			prevLinkId = normalizeNodeId(targetInput.links[0])
		}
		if (!prevLinkId) {
			const v = getPrimitiveNodeValue(relayNode)
			if (v !== undefined) {
				return { value: v }
			}
			return null
		}
		return resolveLinkSource2(prevLinkId, visited)
	}

	for (const node of nodes) {
		if (!isRecord(node)) continue
		const nid = normalizeNodeId(node.id)
		if (!nid) continue
		if (!finalPromptNodeIds.has(nid)) continue
		const classType = resolveNodeClassType(node)
		if (!classType) continue

		const inputsList = Array.isArray(node.inputs) ? node.inputs : []
		const values = Array.isArray(node.widgets_values) ? node.widgets_values : []
		const inputs = {}
		const linkedNames = new Set()

		const inputWidgetValues = new Map()
		for (const inp of inputsList) {
			if (!isRecord(inp)) continue
			const inpName = String(inp.name || '').trim()
			if (!inpName) continue
			if (isRecord(inp.widget) && 'value' in inp.widget) {
				inputWidgetValues.set(inpName, inp.widget.value)
			}
		}

		for (const inp of inputsList) {
			if (!isRecord(inp)) continue
			const name = String(inp.name || '').trim()
			if (!name) continue
			let inputLinkId = null
			if (inp.link != null) {
				inputLinkId = normalizeNodeId(inp.link)
			} else if (Array.isArray(inp.links) && inp.links.length > 0) {
				inputLinkId = normalizeNodeId(inp.links[0])
			}
			if (inputLinkId) {
				const linkId = inputLinkId
				const resolved = resolveLinkSource2(linkId, new Set())
				if (!resolved) continue
				if ('value' in resolved) {
					inputs[name] = resolved.value
					linkedNames.add(name)
				} else {
					inputs[name] = [String(resolved.nodeId), resolved.slot]
					linkedNames.add(name)
				}
				continue
			}
		}

		if (inputWidgetValues.size > 0) {
			for (const [wname, wval] of inputWidgetValues) {
				if (wname in inputs || linkedNames.has(wname)) continue
				inputs[wname] = wval
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
				let hasLink = false
				if (inp.link != null) hasLink = true
				if (Array.isArray(inp.links) && inp.links.length > 0) hasLink = true
				if (hasLink) continue
				if (isRecord(inp.widget)) {
					if (valueIdx < values.length) inputs[name] = values[valueIdx]
					valueIdx++
				}
			}
		}

		const nodeMeta = isRecord(node._meta) ? { ...node._meta } : {}
		if (node.title && !nodeMeta.title) nodeMeta.title = String(node.title)
		if (node.type && !nodeMeta.node_type) nodeMeta.node_type = String(node.type)
		if (Array.isArray(node.pos) && node.pos.length >= 2) {
			const px = Number(node.pos[0]), py = Number(node.pos[1])
			if (Number.isFinite(px) && Number.isFinite(py)) nodeMeta.pos = [px, py]
		}
		prompt[nid] = { class_type: classType, inputs, _meta: nodeMeta }
	}

	console.log('[ComfyUI workflowToPrompt] Final prompt nodes:')
	for (const [pid, pnode] of Object.entries(prompt)) {
		if (!isRecord(pnode)) continue
		const ct = String(pnode.class_type || '')
		const inputKeys = Object.keys(isRecord(pnode.inputs) ? pnode.inputs : {})
		const isUuid = isUuidLikeType(ct)
		const inKnown = knownNodeTypes ? knownNodeTypes.has(ct) : 'N/A (no objectInfo)'
		console.log(`  [${pid}] ${ct}${isUuid ? ' [UUID]' : ''} (known=${inKnown}): inputs=`, inputKeys)
		if (ct.includes('SaveImage') || ct.includes('Save')) {
			console.log(`    [SaveImage DEBUG] inputs detail:`, JSON.stringify(pnode.inputs, null, 2).substring(0, 500))
		}
	}
	console.log('[ComfyUI workflowToPrompt] rerouteNodeIds:', [...rerouteNodeIds])
	console.log('[ComfyUI workflowToPrompt] valueProviderNodes:', [...valueProviderNodes.keys()])
	console.log('[ComfyUI workflowToPrompt] skippedNodeIds:', [...skippedNodeIds])
	console.log('[ComfyUI workflowToPrompt] total nodes in workflow:', nodes.length, '→ final prompt nodes:', Object.keys(prompt).length)

	return { prompt }
}

function applyTextOverrides(promptGraph, positivePrompt, negativePrompt) {
	const pp = String(positivePrompt || '').trim()
	const np = String(negativePrompt || '').trim()
	if (!pp && !np) return

	const textNodes = []
	for (const [k, v] of Object.entries(promptGraph)) {
		if (!isRecord(v)) continue
		if (String(v.class_type || '') !== 'CLIPTextEncode') continue
		textNodes.push([k, v])
	}

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

function normalizePromptGraphForRuntime(promptGraph, objectInfo) {
	const knownSocketTypes = new Set([
		'MODEL', 'CLIP', 'VAE', 'CONDITIONING', 'LATENT', 'IMAGE', 'MASK',
		'SAMPLER', 'SIGMAS', 'AUDIO', 'VIDEO', 'CLIP_VISION_OUTPUT',
		'CONTROL_NET', 'STYLE_MODEL', 'CLIP_VISION', 'UPSCALE_MODEL',
		'GLIGEN', 'NOISE', 'GUIDER', 'BOOST', 'WEBCAM',
		'IPADAPTER', 'FACEID', 'INSTANTID', 'FACEMASK'
	])
	const isValidLinkRef = v => Array.isArray(v) && v.length === 2 && (typeof v[0] === 'string' || typeof v[0] === 'number') && typeof v[1] === 'number'
	const isPrimitiveValue = v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

	for (const node of Object.values(promptGraph)) {
		if (!isRecord(node)) continue
		const inputs = node.inputs
		if (!isRecord(inputs)) continue
		const classType = String(node.class_type || '')
		const defs = objectInfo ? extractObjectInfoInputDefs(objectInfo[classType]) : {}

		for (const [name, val] of Object.entries(inputs)) {
			if (isValidLinkRef(val)) continue
			if (isPrimitiveValue(val)) continue
			if (Array.isArray(val) && !isValidLinkRef(val) && val.length !== 2) continue
			const defn = defs[name]
			if (Array.isArray(defn) && defn.length > 0) {
				const t = defn[0]
				if (typeof t === 'string' && knownSocketTypes.has(t.toUpperCase())) {
					delete inputs[name]
				}
			}
		}

		for (const key of ['clip_vision_output', 'audio']) {
			if (key in inputs && !isValidLinkRef(inputs[key]) && !isPrimitiveValue(inputs[key])) delete inputs[key]
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
		if (['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff', '.tif'].some(ext => n.endsWith(ext))) return 'image'
		if (['.glb', '.gltf', '.fbx', '.obj', '.stl', '.dae', '.ply', '.3ds', '.usdz', '.usd'].some(ext => n.endsWith(ext))) return 'model3d'
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
		for (const key of Object.keys(nodeOut)) {
			const arr = nodeOut[key]
			if (!Array.isArray(arr)) continue
			for (const m of arr) {
				if (!isRecord(m)) continue
				const filename = String(m.filename || m.name || '').trim()
				if (!filename) continue
				const subfolder = String(m.subfolder || '').trim()
				const folderType = String(m.type || 'output').trim()
				let kind = null
				if (key === 'gifs' || key === 'videos') kind = 'video'
				else if (key === 'images') kind = 'image'
				else if (key === 'meshes' || key === 'models' || key === 'models3d' || key === 'files') kind = 'model3d'
				const inferred = kindByFilename(filename)
				if (inferred) kind = inferred
				if (!kind) continue
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
		let validNodeCount = 0
		for (const node of Object.values(promptGraph)) {
			if (isRecord(node) && typeof node.class_type === 'string' && node.class_type.trim()) {
				validNodeCount++
			}
		}
		if (validNodeCount === 0) continue

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
			const nid = normalizeNodeId(nodeId)
			if (!nid) continue
			idToIdx.set(nid, nodeIdx)
			const classType = String(nodeData.class_type || '')
			const inputs = []
			const widgetsValues = []
			const inputDefs = nodeData.inputs
			if (isRecord(inputDefs)) {
				for (const [inputName, inputVal] of Object.entries(inputDefs)) {
					if (Array.isArray(inputVal) && inputVal.length === 2 && (typeof inputVal[0] === 'string' || typeof inputVal[0] === 'number') && typeof inputVal[1] === 'number') {
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
			const nid = normalizeNodeId(nodeId)
			if (!nid) continue
			const fromIdx = idToIdx.get(nid)
			if (fromIdx === undefined) continue
			const inputDefs = nodeData.inputs
			if (!isRecord(inputDefs)) continue
			let slotIdx = 0
			for (const [inputName, inputVal] of Object.entries(inputDefs)) {
				if (Array.isArray(inputVal) && inputVal.length === 2 && (typeof inputVal[0] === 'string' || typeof inputVal[0] === 'number') && typeof inputVal[1] === 'number') {
					const fromNodeId = normalizeNodeId(inputVal[0])
					const fromSlot = Number(inputVal[1])
					const toIdx = idToIdx.get(fromNodeId)
					if (toIdx !== undefined) {
						const fromNode = nodes[fromIdx]
						if (!fromNode.outputs[slotIdx]) {
							fromNode.outputs.push({ name: `OUTPUT_${slotIdx}`, type: '*', links: [], slot_index: slotIdx, shape: 6 })
						}
						links.push([String(linkId), fromNodeId, fromSlot, nid, slotIdx, '*'])
						const toInput = fromNode.inputs.find(i => i.name === inputName)
						if (toInput) toInput.link = String(linkId)
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

	// === COMPREHENSIVE WORKFLOW DIAGNOSTIC ===
	console.log('\n========== [ComfyUI Workflow Diagnostic] ==========')
	console.log('workflowPath:', workflowPath)
	if (isRecord(workflowAny)) {
		console.log('[Top-level keys]:', Object.keys(workflowAny))
		console.log('[version]:', workflowAny.version)
		console.log('[id]:', workflowAny.id)
		console.log('[has nodes]:', Array.isArray(workflowAny.nodes), 'count:', Array.isArray(workflowAny.nodes) ? workflowAny.nodes.length : 0)
		console.log('[has links]:', Array.isArray(workflowAny.links), 'count:', Array.isArray(workflowAny.links) ? workflowAny.links.length : 0)
		console.log('[has groups]:', Array.isArray(workflowAny.groups), 'count:', Array.isArray(workflowAny.groups) ? workflowAny.groups.length : 0)
		console.log('[has extra]:', isRecord(workflowAny.extra))
		if (isRecord(workflowAny.extra)) {
			console.log('[extra keys]:', Object.keys(workflowAny.extra))
			if (workflowAny.extra.ds) console.log('[extra.ds scale]:', workflowAny.extra.ds.scale, 'offset:', workflowAny.extra.ds.offset)
		}
		console.log('[has config]:', isRecord(workflowAny.config))
		if (isRecord(workflowAny.config)) console.log('[config keys]:', Object.keys(workflowAny.config))
		// Print all node types found
		if (Array.isArray(workflowAny.nodes)) {
			const typeCount = new Map()
			const uuidNodes = []
			for (const n of workflowAny.nodes) {
				if (!isRecord(n)) continue
				const t = String(n.type || '').trim()
				typeCount.set(t, (typeCount.get(t) || 0) + 1)
				if (isUuidLikeType(t)) {
					uuidNodes.push(n)
				}
			}
			console.log('\n[Node type counts]:')
			for (const [t, c] of [...typeCount.entries()].sort((a, b) => b[1] - a[1])) {
				console.log(`  ${t}: ${c}`)
			}
			console.log(`\n[UUID-typed nodes count]: ${uuidNodes.length}`)
			for (const n of uuidNodes) {
				console.log(`\n--- UUID Node id=${n.id} type=${n.type} ---`)
				console.log('  title:', n.title)
				console.log('  pos:', n.pos)
				console.log('  size:', n.size)
				console.log('  flags:', JSON.stringify(n.flags))
				console.log('  order:', n.order)
				console.log('  mode:', n.mode)
				console.log('  widgets_values:', JSON.stringify(n.widgets_values))
				console.log('  inputs:', JSON.stringify(n.inputs))
				console.log('  outputs:', JSON.stringify(n.outputs))
				console.log('  properties:', JSON.stringify(n.properties))
				console.log('  ALL KEYS:', Object.keys(n))
				// Print the full node JSON
				console.log('  FULL JSON:', JSON.stringify(n))
			}
		}
		// Check for components/extra node definitions
		if (workflowAny.extra && isRecord(workflowAny.extra)) {
			for (const key of Object.keys(workflowAny.extra)) {
				const val = workflowAny.extra[key]
				if (typeof val === 'object' && val !== null) {
					console.log(`\n[extra.${key}] type:`, Array.isArray(val) ? 'array' : typeof val, Array.isArray(val) ? `length=${val.length}` : `keys=${Object.keys(val).slice(0, 20)}`)
				}
			}
		}
	} else {
		console.log('workflowAny is NOT a record, type:', typeof workflowAny)
	}
	console.log('========== [End Workflow Diagnostic] ==========\n')

	// Upload input files (classified by mediaType)
	const uploadedImages = []
	const uploadedVideos = []
	const uploadedModels = []
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
		const mediaType = String(f.mediaType || 'image').toLowerCase()
		fileName = String(f.name || f.filename || `input_${i}.png`)
		fileMime = fileMime || f.contentType || f.mimeType || (mediaType === 'video' ? 'video/mp4' : mediaType === 'model3d' ? 'application/octet-stream' : 'image/png')

		const upResult = await uploadImageToComfyui(client, base, fileName, fileBuf, fileMime)
		if (upResult.error) return { ok: false, error: `上传${mediaType === 'video' ? '视频' : mediaType === 'model3d' ? '3D模型' : '图片'}失败：${upResult.error}` }
		const name = String(upResult.data?.name || '').trim()
		const subfolder = String(upResult.data?.subfolder || '').trim().replace(/\\/g, '/')
		const upPath = subfolder ? `${subfolder}/${name}` : name
		if (!upPath) continue

		if (mediaType === 'video') {
			uploadedVideos.push(upPath)
		} else if (mediaType === 'model3d') {
			uploadedModels.push(upPath)
		} else {
			uploadedImages.push(upPath)
		}
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
			const convResult = newWorkflowToPrompt(workflowAny, objectInfo)
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

	// Patch uploaded files into input nodes (images/videos/3D models)
	patchPromptGraphInputs(promptGraph, uploadedImages, uploadedVideos, uploadedModels)

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

	console.log('[ComfyUI] Submitting prompt, nodes:', Object.keys(promptGraph).length, 'source:', promptSource)
	for (const [nid, node] of Object.entries(promptGraph)) {
		if (!isRecord(node)) continue
		const inputKeys = isRecord(node.inputs) ? Object.keys(node.inputs) : []
		console.log(`  node[${nid}] class_type=${node.class_type}, inputs:`, inputKeys.join(', '))
	}

	const submitResult = await comfyJsonPost(client, `${base}/prompt`, comfyPayload, 30000)
	if (submitResult.error) {
		let comfyError = null
		if (submitResult.status === 400 && isRecord(submitResult.body)) {
			comfyError = submitResult.body
			console.error('[ComfyUI] /prompt validation error:', JSON.stringify(comfyError, null, 2))
			if (isRecord(comfyError.node_errors)) {
				for (const [nid, err] of Object.entries(comfyError.node_errors)) {
					console.error(`  node_errors[${nid}]:`, JSON.stringify(err))
				}
			}
		} else {
			console.error('[ComfyUI] /prompt failed:', submitResult.status, submitResult.error)
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
