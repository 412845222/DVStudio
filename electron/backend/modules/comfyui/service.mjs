import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import {
	internalError,
	invalidParamsError,
	notFoundError,
	upstreamError
} from '../../core/errors.mjs'

const DEFAULT_COMFYUI_BASE = 'http://127.0.0.1:8188'

function getHistoryCacheDir() {
	const dir = path.join(app.getPath('userData'), 'comfyui_history_cache')
	try {
		fs.mkdirSync(dir, { recursive: true })
	} catch {}
	return dir
}

function getCacheKey(baseUrl, workflowPath) {
	const raw = `${String(baseUrl).trim()}::${String(workflowPath).trim()}`
	return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24)
}

function readHistoryCache(baseUrl, workflowPath) {
	try {
		const key = getCacheKey(baseUrl, workflowPath)
		const filePath = path.join(getHistoryCacheDir(), `${key}.json`)
		if (!fs.existsSync(filePath)) return null
		const raw = fs.readFileSync(filePath, 'utf-8')
		const data = JSON.parse(raw)
		if (!data || typeof data !== 'object' || Array.isArray(data)) return null
		if (
			!data.promptGraph ||
			typeof data.promptGraph !== 'object' ||
			Array.isArray(data.promptGraph)
		)
			return null
		return data
	} catch {
		return null
	}
}

function writeHistoryCache(baseUrl, workflowPath, data) {
	try {
		const key = getCacheKey(baseUrl, workflowPath)
		const filePath = path.join(getHistoryCacheDir(), `${key}.json`)
		fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8')
		return true
	} catch {
		return false
	}
}

function clearHistoryCache(baseUrl, workflowPath) {
	try {
		const key = getCacheKey(baseUrl, workflowPath)
		const filePath = path.join(getHistoryCacheDir(), `${key}.json`)
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath)
		}
		return { ok: true }
	} catch (err) {
		return { ok: false, error: err.message || 'clear cache failed' }
	}
}

/**
 * Enrich/rebuild a cached resolveHistory response from its stored promptGraph.
 *
 * Scenario this solves: schema upgrades (e.g. new text-node recognizers, new
 * output fields like textNodeCount/positiveTextCount/negativeTextCount) were
 * introduced after the cache file was written. The stale cache contained e.g.
 * hasTextPrompt=false + textNodes.positive=[] even though promptGraph actually
 * contains PrimitiveStringMultiline nodes → front-end would show "图片×1" only,
 * no text prompt indicator.
 *
 * Strategy (cheap & safe):
 *  - Always re-run analyzeInputNodes(cached.promptGraph) synchronously (it's
 *    just object iteration over ~20 nodes) — cost is negligible.
 *  - If any of the text-/input-/output-related top-level fields differ from
 *    cache, write back the updated response to heal the cache.
 */
function rebuildCachedHistoryResponse(baseUrl, workflowPath, cached, sourceLabel) {
	if (!cached || !cached.promptGraph || typeof cached.promptGraph !== 'object') {
		return cached
	}
	const inputInfo = analyzeInputNodes(cached.promptGraph)
	const nodeCount =
		typeof cached.nodeCount === 'number' ? cached.nodeCount : Object.keys(cached.promptGraph).length
	const rebuilt = {
		...cached,
		nodeCount,
		imageInputs: inputInfo.images,
		videoInputs: inputInfo.videos,
		textNodes: inputInfo.textNodes,
		seedNodes: inputInfo.seedNodes,
		outputs: inputInfo.outputs,
		hasImageInput: inputInfo.hasImageInput,
		hasVideoInput: inputInfo.hasVideoInput,
		hasTextPrompt: inputInfo.hasTextPrompt,
		textNodeCount: inputInfo.textNodeCount,
		positiveTextCount: inputInfo.positiveTextCount,
		negativeTextCount: inputInfo.negativeTextCount,
		hasImageOutput: inputInfo.hasImageOutput,
		hasVideoOutput: inputInfo.hasVideoOutput,
		hasModel3dOutput: inputInfo.hasModel3dOutput,
		fromCache: true,
		source: sourceLabel || cached.source || 'cache-healed'
	}
	// Cache self-heal: if the enriched version differs materially from what was
	// stored, persist it so subsequent reads don't pay even the tiny rebuild cost
	// and so callers that don't go through this path still see fresh data.
	const stale =
		cached.textNodeCount !== rebuilt.textNodeCount ||
		cached.positiveTextCount !== rebuilt.positiveTextCount ||
		cached.negativeTextCount !== rebuilt.negativeTextCount ||
		cached.hasTextPrompt !== rebuilt.hasTextPrompt ||
		lenText(cached.textNodes?.positive) !== lenText(rebuilt.textNodes?.positive) ||
		lenText(cached.textNodes?.negative) !== lenText(rebuilt.textNodes?.negative)
	if (stale) {
		writeHistoryCache(baseUrl, workflowPath, {
			...rebuilt,
			fromCache: false,
			source: cached.source || sourceLabel || 'cache-matched'
		})
	}
	return rebuilt
}

function lenText(arr) {
	return Array.isArray(arr) ? arr.length : 0
}

export async function runtimeClearHistoryCache(ctx, payload) {
	const p = payload || {}
	const { base, error: baseErr } = normalizeBaseUrl(p.baseUrl || getBaseUrl(ctx))
	if (baseErr) return { ok: false, error: baseErr }
	const workflowPath = String(p.workflowPath || '').trim()
	if (!workflowPath) return { ok: false, error: 'workflowPath is required' }
	return clearHistoryCache(base, workflowPath)
}

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
		if (u.protocol !== 'http:' && u.protocol !== 'https:')
			return { error: 'baseUrl must be http or https' }
		if (!u.hostname) return { error: 'baseUrl host is missing' }
		return { base: v.replace(/\/+$/, '') }
	} catch {
		return { error: 'baseUrl is invalid' }
	}
}

function coerceBool(v) {
	if (typeof v === 'boolean') return v
	if (typeof v === 'number') return v !== 0
	const s = String(v || '')
		.trim()
		.toLowerCase()
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

// Phase 1 新增：判定是否为 ComfyUI 保存的工作流 UI JSON（含 nodes/links 数组 + 至少 1 个 node 有 type/widgets_values）
function isWorkflowUiJson(v) {
	if (!isRecord(v)) return false
	if (!Array.isArray(v.nodes) || !Array.isArray(v.links)) return false
	for (const n of v.nodes) {
		if (isRecord(n) && typeof n.type === 'string' && Array.isArray(n.widgets_values)) return true
	}
	return false
}

// Phase 1 新增：把工作流 UI JSON 转换成 ComfyUI API 格式的 prompt graph
//   规则：
//   - class_type = node.type
//   - widget 类型 input（link === null 且有 widget.name）：从 widgets_values[widget_index] 取值；widget_index 是该 node 中 widget 声明的顺序下标
//   - socket 类型 input（link !== null）：从 links[linkId] 取 src 端，写成 [srcNodeId, srcSlotIdx]
//   - links 格式兼容两种：
//       6项: [linkId, srcId, srcSlot, tgtId, tgtSlot, type]
//       5项: [srcId, srcSlot, tgtId, tgtSlot, type]
function convertWorkflowUiJsonToPromptGraph(wf) {
	if (!isWorkflowUiJson(wf)) return null
	const result = {}
	const linkRows = Array.isArray(wf.links) ? wf.links : []
	// 先构造 linkMap: string(linkId) -> [srcId, srcSlot]
	// 注意：links 的元素可能是数组下标作为 linkId（扁平数组，外层对象是 key=linkId, value=row），但 ComfyUI 常见是 links 为扁平数组，row[0] 就是 linkId（若 length===6）或无 linkId（length===5）
	const linkMap = new Map()
	// 先处理 links 为扁平数组的常见情况（每个元素都是 row）
	for (const row of linkRows) {
		if (!Array.isArray(row)) continue
		if (row.length === 6) {
			const [linkId, srcId, srcSlot] = row
			linkMap.set(String(linkId), [String(srcId), Number(srcSlot)])
		} else if (row.length === 5) {
			// 无 linkId：以整行转字符串或下标为 key；但 node.inputs 的 link 字段拿什么去匹配？
			// 实际上如果 links 是扁平数组且 row.length === 5，ComfyUI 在 node.inputs[i].link 里会存 "row 在 links 中的下标"。我们用顺序匹配。
			linkMap.set(String(linkMap.size), [String(row[0]), Number(row[1])])
		}
	}
	// 处理 links 为对象的情况（少见，但兼容）：Object.keys(wf.links) 就是 linkId
	if (!Array.isArray(wf.links) && isRecord(wf.links)) {
		for (const [linkId, row] of Object.entries(wf.links)) {
			if (!Array.isArray(row)) continue
			if (row.length >= 2) linkMap.set(String(linkId), [String(row[0]), Number(row[1])])
		}
	}

	for (const node of wf.nodes) {
		if (!isRecord(node) || typeof node.type !== 'string') continue
		const nid = String(node.id)
		const classType = node.type
		const inputs = {}
		const widgetsValues = Array.isArray(node.widgets_values) ? node.widgets_values : []
		let widgetCursor = 0
		const nodeInputs = Array.isArray(node.inputs) ? node.inputs : []
		for (const inp of nodeInputs) {
			if (!isRecord(inp)) continue
			const name = String(inp.name || '')
			if (!name) continue
			const link = inp.link
			const widget = isRecord(inp.widget) ? inp.widget : null
			if (link !== null && link !== undefined) {
				// socket 输入
				const key = String(link)
				const socket =
					linkMap.get(key) ||
					(Array.isArray(link) && link.length >= 2 ? [String(link[0]), Number(link[1])] : null)
				if (socket) {
					inputs[name] = [socket[0], socket[1]]
				}
				continue
			}
			// widget 输入
			if (widget && typeof widget.name === 'string') {
				const idx =
					typeof widget.cursor === 'number'
						? widget.cursor
						: Number.isInteger(widgetCursor)
							? widgetCursor
							: 0
				const val = idx < widgetsValues.length ? widgetsValues[idx] : undefined
				// widget 声明顺序对应 widgets_values 递增 cursor
				if (typeof widget.cursor !== 'number') widgetCursor += 1
				inputs[widget.name] = val === undefined ? '' : val
			}
		}
		result[nid] = {
			class_type: classType,
			inputs
		}
	}
	return result
}

// Phase 1 新增：fileBaseline 作为主基线的情况下，把 history 中存在但 fileBaseline 缺失的非文本字段补过来（如 MODEL/VAE 加载节点的复杂配置）
//   严格限制：文本源节点的 TEXT_SOURCE_KEYS（value/text/string/body/content/prompt）永远从 fileBaseline 拿，不从 history 覆盖
//   返回：{ merged, mergedFromHistoryCount }
function mergeBaselineAndHistoryNodes(fileBaseline, historyPromptGraph) {
	const TEXT_KEYS_MERGE_PROTECT = new Set([
		'value',
		'text',
		'string',
		'body',
		'content',
		'prompt',
		'negative',
		'text_g',
		'text_l',
		'prompt_text',
		'guidance',
		'guidance_text',
		'positive_prompt',
		'negative_prompt'
	])
	if (!isRecord(fileBaseline))
		return { merged: {}, mergedFromHistoryCount: 0, whitelistFiltered: 0 }
	// —— Phase E2：白名单裁剪策略 ——
	// 以 historyPromptGraph 的 id 集合为强白名单（cache 20 个节点是自包含的，anyOutside=0）。
	// 仅保留这些 id，避免把 mode=4(muted/routing) UI-only 节点（rgthree bypass、MarkdownNote 等 59 个）传到 ComfyUI 执行端导致 missing_node_type。
	const merged = {}
	let mergedFromHistoryCount = 0
	let whitelistFiltered = 0
	let classTypeFromHistory = 0
	if (!isRecord(historyPromptGraph)) {
		// 兜底：没有 history 参考时，仅过滤 mode=4 节点 + UI-only 显示类节点（无法保证，返回 fileBaseline 原样）
		return {
			merged: JSON.parse(JSON.stringify(fileBaseline)),
			mergedFromHistoryCount: 0,
			whitelistFiltered: 0
		}
	}
	const keepIds = new Set(Object.keys(historyPromptGraph))
	for (const [nid, fNode] of Object.entries(fileBaseline)) {
		if (!keepIds.has(nid)) {
			whitelistFiltered += 1
			continue
		}
		const hNode = historyPromptGraph[nid]
		if (!isRecord(fNode) || !isRecord(hNode)) {
			if (isRecord(hNode)) {
				merged[nid] = JSON.parse(JSON.stringify(hNode))
				mergedFromHistoryCount += 1
			}
			continue
		}
		// class_type：优先用 history 的注册名（UI JSON 中的 type 可能是显示名，与 Python 类实际注册名不一致）
		let finalClassType = fNode.class_type
		if (
			typeof hNode.class_type === 'string' &&
			hNode.class_type.length > 0 &&
			String(fNode.class_type || '') !== String(hNode.class_type || '')
		) {
			finalClassType = hNode.class_type
			classTypeFromHistory += 1
		}
		// inputs：默认从 history 拿（包含正确的模型路径、seed、socket 引用），但 TEXT_KEYS_MERGE_PROTECT 中的字符串类型字段从 fileBaseline 覆盖（保证 UI 中最新保存的文本/清空值生效）
		const inputs = isRecord(hNode.inputs) ? JSON.parse(JSON.stringify(hNode.inputs)) : {}
		if (isRecord(fNode.inputs)) {
			for (const [k, fVal] of Object.entries(fNode.inputs)) {
				// Phase E2-B 修正：仅当 history 中该项也是字符串（不是 socket 数组）时才覆盖
				//   如果 history 中是 [id, slot] socket（说明用户有连线），保留连线，绝不把 convert 时残留的 widget 字符串覆盖到连线值上
				if (TEXT_KEYS_MERGE_PROTECT.has(k) && typeof fVal === 'string') {
					const hVal = inputs[k]
					if (typeof hVal === 'string') {
						inputs[k] = fVal
					}
				}
			}
		}
		merged[nid] = {
			class_type: finalClassType,
			inputs
		}
	}
	// history 中存在但 fileBaseline 完全缺失的 id：补回，保证白名单完整性
	for (const [nid, hNode] of Object.entries(historyPromptGraph)) {
		if (nid in merged) continue
		if (!isRecord(hNode) || !('class_type' in hNode)) continue
		merged[nid] = JSON.parse(JSON.stringify(hNode))
		mergedFromHistoryCount += 1
	}
	return { merged, mergedFromHistoryCount, whitelistFiltered, classTypeFromHistory }
}

function buildProxyViewUrl(base, filename, subfolder, folderType) {
	const params = new URLSearchParams({
		filename,
		subfolder: subfolder || '',
		type: folderType || 'output'
	})
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
	const method = String(payload?.method || 'GET')
		.toUpperCase()
		.trim()
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
			await new Promise((r) => setTimeout(r, 1000))
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
								? status.messages
										.map((m) => (Array.isArray(m) ? m.join(': ') : String(m)))
										.join('; ')
								: 'execution failed'
							jobsRepo.updateStatus(jobId, {
								status: 'failed',
								error: errMsg,
								progress: 100,
								outputs: { promptId, images }
							})
							return
						}
						if (images.length > 0 || Object.keys(outputs).length > 0) {
							jobsRepo.updateStatus(jobId, {
								status: 'succeeded',
								progress: 100,
								outputs: { promptId, images }
							})
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
			const errMsg =
				typeof res.body === 'object' && res.body?.error
					? String(res.body.error.message || res.body.error)
					: `HTTP ${res.status}`
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
			return {
				error: `http ${res.status}: ${typeof res.body === 'string' ? res.body.slice(0, 200) : JSON.stringify(res.body).slice(0, 200)}`
			}
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
			const errMsg =
				typeof res.body === 'object' && res.body?.error
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
		chunks.push(
			Buffer.from(
				`Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"${crlf}`
			)
		)
		chunks.push(Buffer.from(`Content-Type: ${contentType}${crlf}${crlf}`))
		chunks.push(Buffer.isBuffer(content) ? content : Buffer.from(content))
		chunks.push(Buffer.from(crlf))
	}

	chunks.push(Buffer.from(`--${boundary}--${crlf}`))
	const body = Buffer.concat(chunks)
	return {
		body,
		headers: {
			'Content-Type': `multipart/form-data; boundary=${boundary}`,
			'Content-Length': String(body.length)
		}
	}
}

async function uploadImageToComfyui(client, base, filename, content, contentType) {
	const url = `${base}/upload/image`
	const mp = encodeMultipartForm({ type: 'input' }, [
		{
			fieldName: 'image',
			filename: filename || 'input.png',
			content,
			contentType: contentType || 'application/octet-stream'
		}
	])
	try {
		const parsedUrl = new URL(url)
		const transport =
			parsedUrl.protocol === 'https:'
				? (await import('node:https')).default
				: (await import('node:http')).default
		const result = await new Promise((resolve, reject) => {
			const req = transport.request(
				{
					hostname: parsedUrl.hostname,
					port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
					path: parsedUrl.pathname + parsedUrl.search,
					method: 'POST',
					headers: mp.headers,
					timeout: 30000
				},
				(res) => {
					const chunks = []
					res.on('data', (c) => chunks.push(c))
					res.on('end', () => {
						const raw = Buffer.concat(chunks).toString('utf-8')
						try {
							resolve({ status: res.statusCode, body: JSON.parse(raw) })
						} catch {
							resolve({ status: res.statusCode, body: raw })
						}
					})
					res.on('error', reject)
				}
			)
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
	'LoadImage',
	'LoadImageFromUrl',
	'LoadImageMask',
	'LoadImageOutput'
])

const VIDEO_INPUT_CLASS_TYPES = new Set([
	'VHS_LoadVideo',
	'VHS_LoadAudio',
	'LoadVideo',
	'VideoLoad'
])

const MODEL3D_INPUT_CLASS_TYPES = new Set([
	'LoadGLB',
	'LoadGLTF',
	'LoadFBX',
	'LoadOBJ',
	'Load3DModel',
	'TripoLoadGLB',
	'MeshyLoadModel',
	'LoadModel3D'
])

function getNodePosition(node) {
	if (!isRecord(node)) return [0, 0]
	const pos = node._meta?.pos
	if (Array.isArray(pos) && pos.length >= 2) {
		const x = Number(pos[0]),
			y = Number(pos[1])
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
	const ctl = ct.toLowerCase()
	if (/image/.test(ctl) && /load/.test(ctl)) return 'image'
	if (/video|vhs/.test(ctl) && /load/.test(ctl)) return 'video'
	if (/(glb|gltf|fbx|obj|3d|model|mesh)/.test(ctl) && /load/.test(ctl)) return 'model3d'
	return null
}

function isSocketValue(v) {
	return (
		Array.isArray(v) &&
		v.length === 2 &&
		(typeof v[0] === 'string' || typeof v[0] === 'number') &&
		typeof v[1] === 'number'
	)
}

function detectFileInputKindFromParamName(name) {
	const n = String(name || '').toLowerCase()
	if (!n) return null
	if (/\bvideo\b|\bvhs\b|\bmp4\b|\bwebm\b|\bmov\b|\bgif\b/.test(n)) return 'video'
	if (/\bmodel\b|\bglb\b|\bgltf\b|\bfbx\b|\bobj\b|\bmesh\b|\b3d\b/.test(n)) return 'model3d'
	if (/\bimage\b|\bimg\b|\bphoto\b|\bpicture\b|\bfile\b|\bpath\b|\bfilename\b|\bupload\b/.test(n))
		return 'image'
	return null
}

function detectFileInputKeyForNode(node, objectInfo) {
	if (!isRecord(node)) return null
	const classType = String(node.class_type || '').trim()
	const inputs = isRecord(node.inputs) ? node.inputs : {}
	const defs = objectInfo ? extractObjectInfoInputDefs(objectInfo[classType]) : {}

	const candidates = []
	for (const [key, val] of Object.entries(inputs)) {
		if (isSocketValue(val)) continue
		if (isObjectInfoWidgetDef(defs[key])) {
			candidates.push({
				key,
				kind: detectFileInputKindFromParamName(key),
				order: candidates.length
			})
			continue
		}
		if (typeof val === 'string') {
			const kind = detectFileInputKindFromParamName(key)
			if (kind) candidates.push({ key, kind, order: candidates.length })
		}
	}

	if (candidates.length === 0) return null

	const nodeKind = classifyInputNode(classType)
	const nodeNameLower = classType.toLowerCase()
	const preferredKind =
		nodeKind ||
		(/\bvideo\b|vhs/.test(nodeNameLower)
			? 'video'
			: /\bmodel\b|3d|glb|gltf|fbx|obj|mesh/.test(nodeNameLower)
				? 'model3d'
				: 'image')

	for (const c of candidates) {
		if (c.kind === preferredKind) return { key: c.key, kind: c.kind }
	}
	return { key: candidates[0].key, kind: candidates[0].kind || preferredKind }
}

function patchPromptGraphInputs(
	promptGraph,
	uploadedImages,
	uploadedVideos,
	uploadedModels,
	objectInfo
) {
	const imageNodes = []
	const videoNodes = []
	const modelNodes = []
	const IMAGE_EXTS = /\.(png|jpg|jpeg|webp|gif|bmp|tiff)$/i
	const VIDEO_EXTS = /\.(mp4|webm|mov|avi|mkv)$/i
	const MODEL_EXTS = /\.(glb|gltf|fbx|obj|safetensors|ckpt|pt|pth|bin)$/i

	const detectByFilename = (inputs) => {
		for (const [key, val] of Object.entries(inputs)) {
			if (isSocketValue(val)) continue
			if (typeof val !== 'string') continue
			const base = val.split(/[\\/]/).pop() || val
			if (IMAGE_EXTS.test(base)) return { key, kind: 'image' }
			if (VIDEO_EXTS.test(base)) return { key, kind: 'video' }
			if (MODEL_EXTS.test(base)) return { key, kind: 'model3d' }
		}
		return null
	}

	for (const [k, v] of Object.entries(promptGraph)) {
		if (!isRecord(v)) continue
		const classType = String(v.class_type || '')
		const meta = isRecord(v._meta) ? v._meta : {}
		const title = String(meta.title || '')
		const pos = getNodePosition(meta)
		const inputs = isRecord(v.inputs) ? v.inputs : {}

		let fileInput = detectFileInputKeyForNode(v, objectInfo)
		if (!fileInput) {
			const fallbackCategory = classifyInputNode(classType)
			if (fallbackCategory) {
				const fallbackKey =
					fallbackCategory === 'image'
						? 'image'
						: fallbackCategory === 'video'
							? 'video'
							: 'model_file'
				fileInput = { key: fallbackKey, kind: fallbackCategory }
			}
		}
		if (!fileInput) {
			fileInput = detectByFilename(inputs)
		}
		if (!fileInput) continue

		const entry = {
			id: k,
			node: v,
			title,
			pos,
			classType,
			inputKey: fileInput.key,
			kind: fileInput.kind
		}
		if (fileInput.kind === 'image') imageNodes.push(entry)
		else if (fileInput.kind === 'video') videoNodes.push(entry)
		else if (fileInput.kind === 'model3d') modelNodes.push(entry)
	}

	const sortedImages = sortNodesByPosition(imageNodes)
	const sortedVideos = sortNodesByPosition(videoNodes)
	const sortedModels = sortNodesByPosition(modelNodes)

	const assignPaths = (nodes, paths) => {
		for (let idx = 0; idx < paths.length && idx < nodes.length; idx++) {
			const { node, inputKey } = nodes[idx]
			if (!isRecord(node.inputs)) node.inputs = {}
			node.inputs[inputKey] = paths[idx]
		}
	}

	assignPaths(sortedImages, uploadedImages)
	assignPaths(sortedVideos, uploadedVideos)
	assignPaths(sortedModels, uploadedModels)

	if (uploadedImages.length > 0 && imageNodes.length === 0) {
		let imgIdx = 0
		for (const [, v] of Object.entries(promptGraph)) {
			if (!isRecord(v) || imgIdx >= uploadedImages.length) break
			const ct = String(v.class_type || '').toLowerCase()
			if (/loadimage|load.image|image.input/i.test(ct) && isRecord(v.inputs)) {
				if (!isSocketValue(v.inputs.image) && typeof v.inputs.image !== 'string') continue
				v.inputs.image = uploadedImages[imgIdx++]
			}
		}
	}

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
	out.sort((a, b) =>
		a.name === b.name ? a.path.localeCompare(b.path) : a.name.localeCompare(b.name)
	)
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
		const socketTypes = new Set([
			'MODEL',
			'CLIP',
			'VAE',
			'CONDITIONING',
			'LATENT',
			'IMAGE',
			'MASK',
			'SAMPLER',
			'SIGMAS',
			'AUDIO',
			'VIDEO',
			'CLIP_VISION_OUTPUT'
		])
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
		if (typeof value === 'string') {
			const s = value.trim()
			return /^-?\d+$/.test(s)
		}
		return false
	}
	if (tt === 'FLOAT') {
		if (typeof value === 'boolean') return false
		if (typeof value === 'number') return true
		if (typeof value === 'string') {
			try {
				return !isNaN(parseFloat(value.trim()))
			} catch {
				return false
			}
		}
		return false
	}
	if (tt === 'BOOLEAN' || tt === 'BOOL') {
		if (typeof value === 'boolean') return true
		if (typeof value === 'number') return true
		if (typeof value === 'string') {
			const v = value.trim().toLowerCase()
			return ['true', 'false', 'enable', 'disable', 'enabled', 'disabled', '1', '0'].includes(v)
		}
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
		if (
			typeof value === 'number' &&
			!Number.isNaN(value) &&
			Number.isFinite(value) &&
			typeof value !== 'boolean'
		)
			return Math.trunc(value)
		if (typeof value === 'string') {
			try {
				const n = parseInt(value.trim(), 10)
				if (!isNaN(n)) return n
			} catch {}
		}
		const d = defn[1]?.default
		return d !== undefined ? d : value
	}
	if (tt === 'FLOAT') {
		if (
			typeof value === 'number' &&
			!Number.isNaN(value) &&
			Number.isFinite(value) &&
			typeof value !== 'boolean'
		)
			return value
		if (typeof value === 'string') {
			try {
				const n = parseFloat(value.trim())
				if (!isNaN(n)) return n
			} catch {}
		}
		const d = defn[1]?.default
		return d !== undefined ? d : value
	}
	if (tt === 'BOOLEAN' || tt === 'BOOL') {
		if (typeof value === 'boolean') return value
		if (typeof value === 'number') return Boolean(value)
		if (typeof value === 'string') {
			const v = value.trim().toLowerCase()
			if (['true', 'enable', 'enabled', '1'].includes(v)) return true
			if (['false', 'disable', 'disabled', '0'].includes(v)) return false
		}
		const d = defn[1]?.default
		return d !== undefined ? d : value
	}
	if (tt === 'STRING') return String(value)
	return value
}

const FRONTEND_ONLY_NODE_TYPES = new Set([
	'MarkdownNote',
	'Note',
	'Reroute',
	'PrimitiveNode',
	'PrimitiveString',
	'PrimitiveStringMultiline',
	'PrimitiveNumber',
	'PrimitiveBoolean',
	'PrimitiveInteger',
	'PrimitiveFloat',
	'PrimitiveText',
	'GroupNode',
	'SubgraphNode',
	'ComfyNote',
	'NoteNode',
	'NodeNote',
	'Comment',
	'Annotation',
	'Label',
	'WidgetNode',
	'Converter',
	'RelayNode',
	'RerouteNode',
	'FrontendNode',
	'VirtualNode',
	'PlaceholderNode',
	'QuickNodes',
	'TextNote',
	'StickyNote'
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
		props.comfyClass,
		props.class_type,
		props.classType,
		props.node_type,
		props.nodeType,
		node.class_type,
		node.classType
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
		const outType = String(outputs[0].type || '*')
			.trim()
			.toUpperCase()
		if (['*', 'STRING', 'INT', 'FLOAT', 'NUMBER', 'BOOLEAN', 'BOOL'].includes(outType)) {
			return true
		}
	}
	return false
}

function structurallyLooksLikeNote(node) {
	if (!isRecord(node)) return false
	const ct = String(node.type || '').trim()
	if (FRONTEND_ONLY_NODE_TYPES.has(ct) && !isPrimitiveNodeType(ct) && !isRerouteLikeNode(node))
		return true
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
	if (
		isRecord(v.data) &&
		Array.isArray(v.data.nodes) &&
		v.data.nodes.length > 0 &&
		Array.isArray(v.data.links)
	)
		return true
	if (
		isRecord(v.graph) &&
		Array.isArray(v.graph.nodes) &&
		v.graph.nodes.length > 0 &&
		Array.isArray(v.graph.links)
	)
		return true
	if (
		isRecord(v.subgraph) &&
		Array.isArray(v.subgraph.nodes) &&
		v.subgraph.nodes.length > 0 &&
		Array.isArray(v.subgraph.links)
	)
		return true
	return false
}

function extractSubgraphContent(v) {
	if (!isRecord(v)) return null
	if (Array.isArray(v.nodes) && v.nodes.length > 0 && Array.isArray(v.links)) return v
	if (
		isRecord(v.data) &&
		Array.isArray(v.data.nodes) &&
		v.data.nodes.length > 0 &&
		Array.isArray(v.data.links)
	)
		return v.data
	if (
		isRecord(v.graph) &&
		Array.isArray(v.graph.nodes) &&
		v.graph.nodes.length > 0 &&
		Array.isArray(v.graph.links)
	)
		return v.graph
	if (
		isRecord(v.subgraph) &&
		Array.isArray(v.subgraph.nodes) &&
		v.subgraph.nodes.length > 0 &&
		Array.isArray(v.subgraph.links)
	)
		return v.subgraph
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
		if (isRecord(sg.data) && Array.isArray(sg.data.nodes) && Array.isArray(sg.data.links))
			content = sg.data
		else if (isRecord(sg.graph) && Array.isArray(sg.graph.nodes) && Array.isArray(sg.graph.links))
			content = sg.graph
		else if (
			isRecord(sg.subgraph) &&
			Array.isArray(sg.subgraph.nodes) &&
			Array.isArray(sg.subgraph.links)
		)
			content = sg.subgraph
		if (!Array.isArray(content.nodes) || !Array.isArray(content.links)) continue
		const sgId = normalizeNodeId(sg.id ?? sg.uuid)
		if (!sgId) continue
		let vInId = null,
			vOutId = null
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
		if (which === 'from')
			return { id: normalizeNodeId(l[1]), slot: Number(l[2]), type: String(l[5] || '*') }
		return { id: normalizeNodeId(l[3]), slot: Number(l[4]), type: String(l[5] || '*') }
	}
	if (isRecord(l)) {
		if (which === 'from')
			return {
				id: normalizeNodeId(l.origin_id ?? l.fromId ?? l.sourceId),
				slot: Number(l.origin_slot ?? l.fromSlot ?? l.sourceSlot ?? 0),
				type: String(l.type || l.dataType || '*')
			}
		return {
			id: normalizeNodeId(l.target_id ?? l.toId ?? l.targetId),
			slot: Number(l.target_slot ?? l.toSlot ?? l.targetSlot ?? 0),
			type: String(l.type || l.dataType || '*')
		}
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
			if (!isRecord(n)) {
				newNodes.push(n)
				continue
			}
			const nid = normalizeNodeId(n.id)
			const ntype = String(n.type || '').trim()
			if (!nid) {
				newNodes.push(n)
				continue
			}

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
			console.log(
				`[subgraph]   virtual in=${vInId}, out=${vOutId}, internal nodes=${internalNodes.length}, links=${internalLinks.length}`
			)

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
						if (isRecord(inp)) {
							inp.link = null
							if (Array.isArray(inp.links)) inp.links = []
						}
					}
				}
				if (Array.isArray(inNode.outputs)) {
					for (const out of inNode.outputs) {
						if (isRecord(out)) {
							if (Array.isArray(out.links)) out.links = []
						}
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
						outputBridges
							.get(slot)
							.push({ sourceId: newSrcId, sourceSlot: from.slot, type: from.type })
					}
				}
			}

			const extInLinks = new Map()
			const extOutLinks = new Map()
			const remainingLinks = []
			for (const l of links) {
				const from = parseLinkEndpoint(l, 'from')
				const to = parseLinkEndpoint(l, 'to')
				if (!from || !to) {
					remainingLinks.push(l)
					continue
				}
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

			let rewireIn = 0,
				rewireOut = 0
			for (const [slot, sources] of extInLinks) {
				const bridges = inputBridges.get(slot) || []
				for (const src of sources) {
					for (const br of bridges) {
						const ltype = br.type !== '*' ? br.type : src.type
						newLinks.push([
							crypto.randomUUID(),
							src.id,
							src.slot,
							br.targetId,
							br.targetSlot,
							ltype
						])
						rewireIn++
					}
				}
			}
			for (const [slot, targets] of extOutLinks) {
				const bridges = outputBridges.get(slot) || []
				for (const tgt of targets) {
					for (const br of bridges) {
						const ltype = br.type !== '*' ? br.type : tgt.type
						newLinks.push([
							crypto.randomUUID(),
							br.sourceId,
							br.sourceSlot,
							tgt.id,
							tgt.slot,
							ltype
						])
						rewireOut++
					}
				}
			}

			console.log(
				`[subgraph]   rewired in=${rewireIn}, out=${rewireOut}, internal links=${newLinks.length}, added ${keptInternal.length} nodes`
			)

			for (const kn of keptInternal) newNodes.push(kn)
			for (const nl of newLinks) links.push(nl)
		}
		nodes = newNodes
	}
	console.log(
		`[subgraph] Expansion complete after ${passCount} passes. Nodes: ${nodes.length}, Links: ${links.length}`
	)

	const resolved = resolveAllReroutes(nodes, links)
	console.log(
		`[subgraph] After Reroute resolution: nodes=${resolved.nodes.length}, links=${resolved.links.length}`
	)
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
				const evtype = Array.isArray(ev)
					? `array[${ev.length}]`
					: isRecord(ev)
						? `object{keys:${Object.keys(ev).join(',')}}`
						: typeof ev
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
	if (!Array.isArray(nodes) || !Array.isArray(links))
		return { error: 'workflow.nodes/workflow.links missing' }

	console.log('[ComfyUI workflowToPrompt] nodes count:', nodes.length, 'links count:', links.length)
	const remainingUuidNodes = []
	for (let i = 0; i < nodes.length; i++) {
		const n = nodes[i]
		if (isRecord(n)) {
			const ct = String(n.type || '').trim()
			const nodeKeys = Object.keys(n)
			console.log(
				`  node[${i}] id=`,
				n.id,
				'type=',
				n.type,
				'title=',
				n.title,
				'keys=[',
				nodeKeys.join(','),
				']'
			)
			if (isUuidLikeType(ct)) {
				remainingUuidNodes.push({ index: i, id: n.id, type: ct, title: n.title, keys: nodeKeys })
				console.log(
					`    [UUID NODE FULL JSON - AFTER EXPANSION]:`,
					JSON.stringify(n, null, 2).substring(0, 8000)
				)
				if (n.properties && isRecord(n.properties)) {
					console.log(`    [UUID NODE PROPERTIES KEYS]:`, Object.keys(n.properties))
					for (const [pk, pv] of Object.entries(n.properties)) {
						const pvt = Array.isArray(pv) ? `array[${pv.length}]` : typeof pv
						console.log(
							`      property "${pk}": ${pvt}${isRecord(pv) ? ` keys=[${Object.keys(pv).join(',')}]` : ''}`
						)
					}
				}
				if (n.widgets_values) {
					console.log(
						`    [UUID NODE WIDGETS_VALUES]:`,
						JSON.stringify(n.widgets_values, null, 2).substring(0, 3000)
					)
				}
			}
		}
	}
	if (remainingUuidNodes.length > 0) {
		console.log(
			`[ComfyUI workflowToPrompt] WARNING: ${remainingUuidNodes.length} UUID-type nodes remain after expansion. These may cause ComfyUI errors:`
		)
		for (const un of remainingUuidNodes) {
			console.log(`  - Node id=${un.id}, type=${un.type}, title=${un.title}`)
		}
		const sgType = typeof workflow.subgraphs
		console.log(`[ComfyUI workflowToPrompt] workflow.subgraphs type: ${sgType}`)
		if (workflow.subgraphs) {
			if (Array.isArray(workflow.subgraphs)) {
				console.log(
					`[ComfyUI workflowToPrompt] workflow.subgraphs is array with ${workflow.subgraphs.length} entries`
				)
				for (let si = 0; si < workflow.subgraphs.length; si++) {
					const sg = workflow.subgraphs[si]
					if (isRecord(sg)) {
						console.log(
							`  subgraphs[${si}]: id=${sg.id}, type=${sg.type}, nodes=${Array.isArray(sg.nodes) ? sg.nodes.length : 'N/A'}, links=${Array.isArray(sg.links) ? sg.links.length : 'N/A'}`
						)
					}
				}
			} else if (isRecord(workflow.subgraphs)) {
				console.log(
					`[ComfyUI workflowToPrompt] workflow.subgraphs is object with keys: ${Object.keys(workflow.subgraphs).join(',')}`
				)
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
		nodeOutputsMap.set(
			nid,
			outputsArr.map((o, i) =>
				isRecord(o)
					? {
							name: String(o.name || '').trim(),
							type: String(o.type || '*').trim(),
							links: Array.isArray(o.links) ? o.links : [],
							slot_index: typeof o.slot_index === 'number' ? o.slot_index : i
						}
					: { name: '', type: '*', links: [], slot_index: i }
			)
		)
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
			fromNodeId = normalizeNodeId(
				l.origin_id ?? l.fromId ?? l.from_node_id ?? l.sourceId ?? l.source_node_id
			)
			fromSlot = Number(
				l.origin_slot ?? l.fromSlot ?? l.from_slot ?? l.sourceSlot ?? l.source_slot ?? 0
			)
			toNodeId = normalizeNodeId(
				l.target_id ?? l.toId ?? l.to_node_id ?? l.targetId ?? l.target_node_id
			)
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
		if (
			structurallyLooksLikeNote(node) ||
			structurallyLooksLikePrimitive(node) ||
			structurallyLooksLikeReroute(node)
		) {
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
			const targetOutType = String(targetOutput.type || '*')
				.trim()
				.toUpperCase()
			const targetOutName = String(targetOutput.name || '')
				.trim()
				.toLowerCase()
			for (let i = 0; i < relayInputs.length; i++) {
				const inp = relayInputs[i]
				if (!isRecord(inp)) continue
				const inType = String(inp.type || '*')
					.trim()
					.toUpperCase()
				const inName = String(inp.name || '')
					.trim()
					.toLowerCase()
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
				if (
					isRecord(candidate) &&
					(candidate.link != null || (Array.isArray(candidate.links) && candidate.links.length > 0))
				) {
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
			const px = Number(node.pos[0]),
				py = Number(node.pos[1])
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
			console.log(
				`    [SaveImage DEBUG] inputs detail:`,
				JSON.stringify(pnode.inputs, null, 2).substring(0, 500)
			)
		}
	}
	console.log('[ComfyUI workflowToPrompt] rerouteNodeIds:', [...rerouteNodeIds])
	console.log('[ComfyUI workflowToPrompt] valueProviderNodes:', [...valueProviderNodes.keys()])
	console.log('[ComfyUI workflowToPrompt] skippedNodeIds:', [...skippedNodeIds])
	console.log(
		'[ComfyUI workflowToPrompt] total nodes in workflow:',
		nodes.length,
		'→ final prompt nodes:',
		Object.keys(prompt).length
	)

	return { prompt }
}

function applyTextOverrides(promptGraph, positivePrompt, negativePrompt) {
	const pp = String(positivePrompt || '').trim()
	const np = String(negativePrompt || '').trim()
	const diagnostics = { positive: 0, negative: 0 }
	if (!pp && !np) return diagnostics

	const TEXT_SOURCE_NODE_TYPES = new Set([
		'PrimitiveStringMultiline',
		'PrimitiveString',
		'Primitive',
		'String',
		'StringMultiline',
		'InputText',
		'TextInput',
		'PromptInput',
		'LoadText',
		'LoadTextFile',
		'ReadTextFile',
		'Note',
		'MarkdownNote',
		'ShowText',
		'TextShow'
	])
	const TEXT_SOURCE_KEYS = ['value', 'text', 'string', 'body', 'content', 'prompt']
	const BLACKLIST_TEXT_INFER_CLASS_RE =
		/LoadImage|LoadVideo|SaveImage|SaveVideo|VHS_|CLIPLoader|VAELoader|CheckpointLoader|ControlNet|LoraLoader|UNETLoader|GligenLoader|KSampler|SamplerCustom|BasicScheduler|BasicGuider|Denoise|Sampler/i

	const textNodes = []
	const TEXT_ENCODE_TYPE_RE =
		/TextEncode|CLIPText|text.*encode|prompt.*encode|TextPrompt|PromptText|T5Text|UMT5|LLMText|GemmaText|QwenText|text_to_conditioning|MiniMax|H3|Guidance|PromptCfg|ConditioningText|FluxText|PromptOnly|AudioConditioning|Conditioning|Hunyuan|CogVideo|Wan/i
	const TEXT_INPUT_KEYS = [
		'value',
		'text',
		'text_g',
		'text_l',
		'prompt',
		'positive',
		'negative',
		'caption',
		'description',
		'instruction',
		'text_positive',
		'text_negative',
		'guidance',
		'guidance_text',
		'prompt_text',
		'pos_prompt',
		'neg_prompt',
		'user_prompt',
		'positive_prompt',
		'negative_prompt',
		't5_prompt',
		'llm_prompt',
		'flux_prompt',
		'positive_caption',
		'negative_caption'
	]
	for (const [k, v] of Object.entries(promptGraph)) {
		if (!isRecord(v)) continue
		const ct = String(v.class_type || '')
		const inputs = isRecord(v.inputs) ? v.inputs : {}
		let isTextNode = false
		let primaryKey = 'text'
		if (
			ct === 'CLIPTextEncode' ||
			ct === 'BNK_CLIPTextEncodeAdvanced' ||
			TEXT_SOURCE_NODE_TYPES.has(ct) ||
			TEXT_ENCODE_TYPE_RE.test(ct)
		) {
			isTextNode = true
			if (TEXT_SOURCE_NODE_TYPES.has(ct)) primaryKey = 'value'
		} else if (!BLACKLIST_TEXT_INFER_CLASS_RE.test(ct)) {
			for (const tk of TEXT_INPUT_KEYS) {
				if (tk in inputs && typeof inputs[tk] === 'string' && !isSocketValue(inputs[tk])) {
					isTextNode = true
					primaryKey = tk
					break
				}
			}
			if (!isTextNode) {
				for (const [key, val] of Object.entries(inputs)) {
					if (isSocketValue(val)) continue
					if (typeof val !== 'string') continue
					const kl = key.toLowerCase()
					if (
						kl.includes('text') ||
						kl === 'prompt' ||
						kl.includes('prompt') ||
						kl.includes('guidance') ||
						kl.includes('caption') ||
						kl.includes('description') ||
						kl.includes('instruction')
					) {
						isTextNode = true
						primaryKey = key
						break
					}
				}
			}
		}
		if (isTextNode) {
			const meta = isRecord(v._meta) ? v._meta : {}
			const title = String(meta.title || '')
			const textKeys = []
			for (const tk of TEXT_INPUT_KEYS) {
				if (tk in inputs && typeof inputs[tk] === 'string' && !isSocketValue(inputs[tk])) {
					textKeys.push(tk)
				}
			}
			// 对 TEXT_SOURCE_NODE_TYPES 额外扫描 TEXT_SOURCE_KEYS（允许空字符串命中）
			if (TEXT_SOURCE_NODE_TYPES.has(ct) && textKeys.length === 0) {
				for (const k of TEXT_SOURCE_KEYS) {
					if (k in inputs && (typeof inputs[k] === 'string' || inputs[k] == null)) {
						textKeys.push(k)
					}
				}
			}
			if (textKeys.length === 0) textKeys.push(primaryKey)
			textNodes.push({ nodeId: k, node: v, title, textKeys, primaryKey })
		}
	}

	if (textNodes.length === 0) return diagnostics

	const negativeIdxs = []
	const positiveIdxs = []
	for (let i = 0; i < textNodes.length; i++) {
		const tn = textNodes[i]
		const t = tn.title.toLowerCase()
		let isNeg = false
		for (const key of tn.textKeys) {
			const val = String(tn.node.inputs?.[key] || '').toLowerCase()
			if (
				key.includes('negative') ||
				t.includes('negative') ||
				t.includes('负') ||
				val.includes('negative') ||
				val.includes('nsfw') ||
				val.includes('worst quality') ||
				val.includes('low quality') ||
				val.includes('bad anatomy')
			) {
				isNeg = true
				break
			}
		}
		if (isNeg) negativeIdxs.push(i)
		else positiveIdxs.push(i)
	}

	function writeText(idx, val) {
		const tn = textNodes[idx]
		if (!tn || !isRecord(tn.node.inputs)) return false
		let written = false
		for (const key of tn.textKeys) {
			if (key in tn.node.inputs && isSocketValue(tn.node.inputs[key])) continue
			tn.node.inputs[key] = val
			written = true
		}
		if (!written) {
			const pk = tn.primaryKey || 'text'
			if (!(pk in tn.node.inputs) || !isSocketValue(tn.node.inputs[pk])) {
				tn.node.inputs[pk] = val
				written = true
			}
		}
		if (!written) {
			tn.node.inputs.text = val
			written = true
		}
		return written
	}

	if (pp) {
		const targets = positiveIdxs.length > 0 ? positiveIdxs : [0]
		for (const i of targets) {
			if (writeText(i, pp)) diagnostics.positive += 1
		}
	}
	if (np) {
		let targets
		if (negativeIdxs.length > 0) targets = negativeIdxs
		else if (textNodes.length >= 2) targets = [1]
		else targets = [0]
		for (const i of targets) {
			if (writeText(i, np)) diagnostics.negative += 1
		}
	}
	return diagnostics
}

function normalizePromptGraphForRuntime(promptGraph, objectInfo) {
	const knownSocketTypes = new Set([
		'MODEL',
		'CLIP',
		'VAE',
		'CONDITIONING',
		'LATENT',
		'IMAGE',
		'MASK',
		'SAMPLER',
		'SIGMAS',
		'AUDIO',
		'VIDEO',
		'CLIP_VISION_OUTPUT',
		'CONTROL_NET',
		'STYLE_MODEL',
		'CLIP_VISION',
		'UPSCALE_MODEL',
		'GLIGEN',
		'NOISE',
		'GUIDER',
		'BOOST',
		'WEBCAM',
		'IPADAPTER',
		'FACEID',
		'INSTANTID',
		'FACEMASK'
	])
	const isValidLinkRef = (v) =>
		Array.isArray(v) &&
		v.length === 2 &&
		(typeof v[0] === 'string' || typeof v[0] === 'number') &&
		typeof v[1] === 'number'
	const isPrimitiveValue = (v) =>
		typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

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
			if (key in inputs && !isValidLinkRef(inputs[key]) && !isPrimitiveValue(inputs[key]))
				delete inputs[key]
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
	const VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.gif', '.m4v', '.wmv', '.flv']
	const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff', '.tif', '.gif']
	const MODEL3D_EXTS = [
		'.glb',
		'.gltf',
		'.fbx',
		'.obj',
		'.stl',
		'.dae',
		'.ply',
		'.3ds',
		'.usdz',
		'.usd',
		'.blend',
		'.step',
		'.iges'
	]
	const kindByFilename = (name) => {
		const n = String(name || '')
			.trim()
			.toLowerCase()
		if (!n) return null
		if (VIDEO_EXTS.some((ext) => n.endsWith(ext))) return 'video'
		if (IMAGE_EXTS.some((ext) => n.endsWith(ext))) return 'image'
		if (MODEL3D_EXTS.some((ext) => n.endsWith(ext))) return 'model3d'
		return null
	}
	const nodeSortKey = (v) => {
		const s = String(v || '').trim()
		const n = Number(s)
		return Number.isFinite(n) ? [0, n] : [1, s]
	}

	const sortedNodes = Object.entries(outputs).sort((a, b) => {
		const ka = nodeSortKey(a[0]),
			kb = nodeSortKey(b[0])
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
				const lkey = String(key || '').toLowerCase()
				if (lkey === 'gifs' || lkey === 'videos') kind = 'video'
				else if (lkey === 'images') kind = 'image'
				else if (
					lkey === 'meshes' ||
					lkey === 'models' ||
					lkey === 'models3d' ||
					lkey === 'files' ||
					lkey === 'results'
				)
					kind = 'model3d'
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
	try {
		const v = Number(String(raw).trim())
		return v > 0 ? v : 0
	} catch {
		return 0
	}
}

function extractEntryTimestamp(entry) {
	if (!isRecord(entry)) return 0
	try {
		const status = entry.status
		if (isRecord(status) && Array.isArray(status.messages) && status.messages.length > 0) {
			const firstMsg = status.messages[0]
			if (Array.isArray(firstMsg) && firstMsg.length > 0) {
				const ts = Number(firstMsg[0])
				if (Number.isFinite(ts) && ts > 0) return ts * 1000
			}
		}
	} catch {}
	const promptArr = Array.isArray(entry?.prompt) ? entry.prompt : null
	if (promptArr && promptArr.length >= 4) {
		const ct = extractCreateTimeFromExtra(promptArr[3])
		if (ct > 0) return ct
	}
	return 0
}

function isEntrySuccessful(entry) {
	if (!isRecord(entry)) return false
	const status = entry.status
	if (!isRecord(status)) return false
	const statusStr = String(status.status_str || '').toLowerCase()
	if (statusStr === 'success') return true
	if (status.completed === true && !status.status_str) return true
	return false
}

function buildWorkflowFingerprint(promptGraph) {
	if (!isRecord(promptGraph)) return ''
	const classTypes = []
	for (const node of Object.values(promptGraph)) {
		if (isRecord(node) && typeof node.class_type === 'string') {
			classTypes.push(node.class_type)
		}
	}
	classTypes.sort()
	return classTypes.join('|')
}

function buildWorkflowFingerprintFromWorkflowJson(workflow) {
	if (!isRecord(workflow)) return ''
	const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : []
	const types = []
	for (const node of nodes) {
		if (isRecord(node) && typeof node.type === 'string') {
			const t = node.type
			if (t !== 'Reroute' && t !== 'Note' && t !== 'PrimitiveNode') {
				types.push(t)
			}
		}
	}
	types.sort()
	return types.join('|')
}

async function findLatestSuccessfulPromptByWorkflowId(
	client,
	base,
	workflowId,
	workflowFingerprint
) {
	const maxItems = 200
	const histResult = await comfyJsonGet(client, `${base}/history?max_items=${maxItems}`, 15000)
	if (histResult.error || !isRecord(histResult.data)) return { error: 'failed to fetch history' }

	const exactMatches = []
	const fuzzyMatches = []

	for (const [promptId, entry] of Object.entries(histResult.data)) {
		if (!isRecord(entry)) continue
		const promptArr = entry.prompt
		if (!Array.isArray(promptArr) || promptArr.length < 3 || !isRecord(promptArr[2])) continue
		const promptGraph = promptArr[2]
		if (!isPromptGraphJson(promptGraph)) continue

		const extra = promptArr.length >= 4 && isRecord(promptArr[3]) ? promptArr[3] : null
		const entryWorkflowId = extractWorkflowIdFromExtra(extra)
		const timestamp = extractEntryTimestamp(entry)
		const successful = isEntrySuccessful(entry)
		const candidate = {
			promptId,
			promptGraph,
			extra,
			workflow:
				isRecord(extra?.extra_pnginfo) && isRecord(extra.extra_pnginfo.workflow)
					? extra.extra_pnginfo.workflow
					: null,
			timestamp,
			successful
		}

		if (entryWorkflowId && workflowId && entryWorkflowId === workflowId) {
			if (successful) exactMatches.push(candidate)
		} else if (workflowFingerprint && successful) {
			const histWorkflowFp = candidate.workflow
				? buildWorkflowFingerprintFromWorkflowJson(candidate.workflow)
				: buildWorkflowFingerprint(promptGraph)
			if (histWorkflowFp === workflowFingerprint) fuzzyMatches.push(candidate)
		}
	}

	const pick = (arr) => {
		if (arr.length === 0) return null
		arr.sort((a, b) => b.timestamp - a.timestamp)
		return arr[0]
	}

	const best = pick(exactMatches) || pick(fuzzyMatches)
	if (!best) {
		const hasAny = Object.keys(histResult.data).length > 0
		return { error: hasAny ? 'no matching successful run in history' : 'history is empty' }
	}

	return {
		promptGraph: best.promptGraph,
		workflow: best.workflow,
		promptId: best.promptId,
		timestamp: best.timestamp,
		matchType: exactMatches.includes(best) ? 'exact' : 'fuzzy'
	}
}

function randomizeSeedInPrompt(promptGraph) {
	if (!isRecord(promptGraph)) return
	const samplerTypes = new Set([
		'KSampler',
		'KSamplerAdvanced',
		'KSampler (Efficient)',
		'BNK_CLIPTextEncodeAdvanced'
	])
	const seedKeyNames = ['noise_seed', 'seed', 'seed_num']
	for (const node of Object.values(promptGraph)) {
		if (!isRecord(node)) continue
		const ct = String(node.class_type || '')
		if (!samplerTypes.has(ct) && !/sampler/i.test(ct)) continue
		if (!isRecord(node.inputs)) continue
		for (const key of seedKeyNames) {
			if (key in node.inputs && !isSocketValue(node.inputs[key])) {
				if (typeof node.inputs[key] === 'number' || typeof node.inputs[key] === 'string') {
					const s = String(node.inputs[key]).trim()
					if (/^\d+$/.test(s) && BigInt(s) <= 0xffffffffffffffffn) {
						node.inputs[key] = Math.floor(Math.random() * 0xffffffff)
					}
				}
			}
		}
	}
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
	candidates.sort((a, b) => b[0] - a[0] || b[1] - a[1])
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
			return {
				ok: true,
				baseUrl: base,
				objectInfo: cached,
				nodeCount: Object.keys(cached).length,
				cached: true
			}
		}
	}

	const oiResult = await comfyJsonGet(client, `${base}/object_info`, 15000)
	if (oiResult.error || !isRecord(oiResult.data)) {
		return { ok: false, error: `failed to fetch object_info: ${oiResult.error || 'unknown error'}` }
	}
	setCachedObjectInfo(base, oiResult.data)
	return {
		ok: true,
		baseUrl: base,
		objectInfo: oiResult.data,
		nodeCount: Object.keys(oiResult.data).length,
		cached: false
	}
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
			if (
				isRecord(status) &&
				status.messages &&
				Array.isArray(status.messages) &&
				status.messages.length > 0
			) {
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
				if (
					ct !== 'CLIPTextEncode' &&
					ct !== 'LoadImage' &&
					ct !== 'SaveImage' &&
					ct !== 'KSampler' &&
					ct !== 'VAEDecode' &&
					ct !== 'VAEEncode' &&
					ct !== 'CheckpointLoaderSimple'
				) {
					classType = ct
					break
				}
			}
		}

		const timeStr =
			timestamp > 0
				? new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
				: promptId.slice(0, 8)
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

// 从 LocalDB comfyui_workflows 表读取本地模板，映射为列表项
function listLocalWorkflowItems(ctx) {
	try {
		const repo = ctx.localdb?.comfyuiWorkflows
		if (!repo) return []
		return repo.list().map((w) => ({
			path: `local://${w.id}`,
			name: w.name || '未命名工作流',
			source: 'local',
			localId: w.id,
			updatedAt: Number(w.updatedAt) || 0
		}))
	} catch (err) {
		console.warn('[ComfyUI] listLocalWorkflowItems failed:', err?.message || err)
		return []
	}
}

// 从 LocalDB 读取单个本地模板，返回其 data（期望为 prompt graph API 格式）
function getLocalWorkflowData(ctx, id) {
	const wid = String(id || '').trim()
	if (!wid) return null
	try {
		const repo = ctx.localdb?.comfyuiWorkflows
		if (!repo) return null
		const wf = repo.get(wid)
		if (!wf) return null
		return wf
	} catch (err) {
		console.warn('[ComfyUI] getLocalWorkflowData failed:', err?.message || err)
		return null
	}
}

export async function runtimeListWorkflowFiles(ctx, payload) {
	const client = ctx.httpClient
	const p = payload || {}
	const { base, error: baseErr } = normalizeBaseUrl(p.baseUrl || getBaseUrl(ctx))
	if (baseErr) return { ok: false, error: baseErr }

	// 本地模板始终置顶，无论 ComfyUI 服务是否在线
	const localWorkflows = listLocalWorkflowItems(ctx)

	let remoteWorkflows = []
	let source = 'userdata'
	let userdataError = null
	let apiFailed = false

	try {
		const params = new URLSearchParams({ dir: 'workflows', recurse: 'true' })
		const userdataUrl = `${base}/userdata?${params.toString()}`
		const userdataResult = await comfyJsonGet(client, userdataUrl, 10000)

		if (!userdataResult.error && Array.isArray(userdataResult.data)) {
			remoteWorkflows = filterWorkflowFiles(userdataResult.data)
		} else {
			userdataError = userdataResult.error
			apiFailed = !!userdataError
		}

		if (remoteWorkflows.length === 0) {
			const maxHistory = Number(p.maxHistory) || 20
			const histUrl = `${base}/history?max_items=${maxHistory}`
			const histResult = await comfyJsonGet(client, histUrl, 10000)
			if (!histResult.error && isRecord(histResult.data)) {
				const historyWorkflows = extractHistoryWorkflows(histResult.data, maxHistory)
				if (historyWorkflows.length > 0) {
					remoteWorkflows = historyWorkflows
					source = 'history'
				}
			}
		}
	} catch (err) {
		// 服务不可达时不阻断本地模板返回
		userdataError = String(err?.message || err)
		apiFailed = true
	}

	// 合并：本地模板置顶 + 远程结果
	const workflows = [...localWorkflows, ...remoteWorkflows]

	if (remoteWorkflows.length === 0 && apiFailed && localWorkflows.length === 0) {
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
					if (
						Array.isArray(inputVal) &&
						inputVal.length === 2 &&
						(typeof inputVal[0] === 'string' || typeof inputVal[0] === 'number') &&
						typeof inputVal[1] === 'number'
					) {
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
				if (
					Array.isArray(inputVal) &&
					inputVal.length === 2 &&
					(typeof inputVal[0] === 'string' || typeof inputVal[0] === 'number') &&
					typeof inputVal[1] === 'number'
				) {
					const fromNodeId = normalizeNodeId(inputVal[0])
					const fromSlot = Number(inputVal[1])
					const toIdx = idToIdx.get(fromNodeId)
					if (toIdx !== undefined) {
						const fromNode = nodes[fromIdx]
						if (!fromNode.outputs[slotIdx]) {
							fromNode.outputs.push({
								name: `OUTPUT_${slotIdx}`,
								type: '*',
								links: [],
								slot_index: slotIdx,
								shape: 6
							})
						}
						links.push([String(linkId), fromNodeId, fromSlot, nid, slotIdx, '*'])
						const toInput = fromNode.inputs.find((i) => i.name === inputName)
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

export async function runtimeResolveHistoryPrompt(ctx, payload) {
	const client = ctx.httpClient
	const p = payload || {}
	const { base, error: baseErr } = normalizeBaseUrl(p.baseUrl || getBaseUrl(ctx))
	if (baseErr) return { ok: false, error: baseErr }

	const workflowPath = String(p.workflowPath || '').trim()
	if (!workflowPath) return { ok: false, error: 'workflowPath is required' }

	if (workflowPath.startsWith('history://')) {
		const promptId = workflowPath.slice('history://'.length)
		const histUrl = `${base}/history/${encodeURIComponent(promptId)}`
		const histResult = await comfyJsonGet(client, histUrl, 10000)
		if (!histResult.error && isRecord(histResult.data)) {
			const entry = histResult.data[promptId]
			if (isRecord(entry)) {
				const promptArr = entry.prompt
				if (Array.isArray(promptArr) && promptArr.length >= 3 && isRecord(promptArr[2])) {
					const directGraph = promptArr[2]
					const directInputInfo = analyzeInputNodes(directGraph)
					const directTs = extractEntryTimestamp(entry)
					const resp = {
						ok: true,
						baseUrl: base,
						hasHistory: true,
						promptGraph: directGraph,
						promptId,
						timestamp: directTs,
						matchType: 'direct',
						nodeCount: directInputInfo.nodeCount,
						imageInputs: directInputInfo.images,
						videoInputs: directInputInfo.videos,
						textNodes: directInputInfo.textNodes,
						seedNodes: directInputInfo.seedNodes,
						outputs: directInputInfo.outputs,
						hasImageInput: directInputInfo.hasImageInput,
						hasVideoInput: directInputInfo.hasVideoInput,
						hasTextPrompt: directInputInfo.hasTextPrompt,
						textNodeCount: directInputInfo.textNodeCount,
						positiveTextCount: directInputInfo.positiveTextCount,
						negativeTextCount: directInputInfo.negativeTextCount,
						hasImageOutput: directInputInfo.hasImageOutput,
						hasVideoOutput: directInputInfo.hasVideoOutput,
						hasModel3dOutput: directInputInfo.hasModel3dOutput,
						source: 'history-direct',
						fromCache: false
					}
					writeHistoryCache(base, workflowPath, resp)
					return resp
				}
			}
		}
		const cached = readHistoryCache(base, workflowPath)
		if (cached) {
			return rebuildCachedHistoryResponse(base, workflowPath, cached, 'cache-direct')
		}
		return {
			ok: false,
			error: 'NO_HISTORY',
			message: '历史记录已不存在，请重新在ComfyUI中运行该工作流'
		}
	}

	// 本地模板：直接从 LocalDB 取 data 作为 prompt graph，无需 ComfyUI /history 在线
	if (workflowPath.startsWith('local://')) {
		const localId = workflowPath.slice('local://'.length)
		const wf = getLocalWorkflowData(ctx, localId)
		if (!wf) {
			return {
				ok: false,
				error: 'NO_LOCAL',
				message: '本地工作流模板不存在: ' + localId,
				baseUrl: base
			}
		}
		const data = wf.data
		if (!isRecord(data) || !isPromptGraphJson(data)) {
			return {
				ok: false,
				error: 'INVALID_LOCAL_FORMAT',
				message:
					'本地模板数据格式无效：仅支持 ComfyUI API 格式（prompt graph）。请在 ComfyUI 中使用"保存(API格式)"后重新导入。',
				baseUrl: base
			}
		}
		const inputInfo = analyzeInputNodes(data)
		const resp = {
			ok: true,
			baseUrl: base,
			hasHistory: true,
			promptGraph: data,
			promptId: `local://${wf.id}`,
			timestamp: Number(wf.updatedAt) || 0,
			matchType: 'direct',
			nodeCount: inputInfo.nodeCount,
			imageInputs: inputInfo.images,
			videoInputs: inputInfo.videos,
			textNodes: inputInfo.textNodes,
			seedNodes: inputInfo.seedNodes,
			outputs: inputInfo.outputs,
			hasImageInput: inputInfo.hasImageInput,
			hasVideoInput: inputInfo.hasVideoInput,
			hasTextPrompt: inputInfo.hasTextPrompt,
			textNodeCount: inputInfo.textNodeCount,
			positiveTextCount: inputInfo.positiveTextCount,
			negativeTextCount: inputInfo.negativeTextCount,
			hasImageOutput: inputInfo.hasImageOutput,
			hasVideoOutput: inputInfo.hasVideoOutput,
			hasModel3dOutput: inputInfo.hasModel3dOutput,
			source: 'local-direct',
			fromCache: false
		}
		return resp
	}

	const wfResult = await runtimeGetWorkflowFile(ctx, { baseUrl: base, workflowPath })
	if (!wfResult.ok) return { ok: false, error: `读取工作流失败：${wfResult.error}` }
	const workflowAny = wfResult.workflow
	const workflowId = isRecord(workflowAny) ? String(workflowAny.id || '').trim() : ''
	const workflowFingerprint = buildWorkflowFingerprintFromWorkflowJson(workflowAny)

	const historyResult = await findLatestSuccessfulPromptByWorkflowId(
		client,
		base,
		workflowId,
		workflowFingerprint || null
	)
	if (historyResult.error || !isRecord(historyResult.promptGraph)) {
		const cached = readHistoryCache(base, workflowPath)
		if (cached) {
			return rebuildCachedHistoryResponse(base, workflowPath, cached, 'cache-matched')
		}
		return {
			ok: false,
			error: 'NO_HISTORY',
			message: `该工作流暂无成功运行记录。请先打开ComfyUI界面（${base}），加载"${workflowPath}"工作流并成功运行一次，然后回到DVStudio重试。`,
			baseUrl: base
		}
	}

	const nodeCount = Object.keys(historyResult.promptGraph).length
	const inputNodeInfo = analyzeInputNodes(historyResult.promptGraph)

	const resp = {
		ok: true,
		baseUrl: base,
		hasHistory: true,
		promptGraph: historyResult.promptGraph,
		promptId: historyResult.promptId,
		timestamp: historyResult.timestamp,
		matchType: historyResult.matchType,
		nodeCount,
		imageInputs: inputNodeInfo.images,
		videoInputs: inputNodeInfo.videos,
		textNodes: inputNodeInfo.textNodes,
		seedNodes: inputNodeInfo.seedNodes,
		outputs: inputNodeInfo.outputs,
		hasImageInput: inputNodeInfo.hasImageInput,
		hasVideoInput: inputNodeInfo.hasVideoInput,
		hasTextPrompt: inputNodeInfo.hasTextPrompt,
		textNodeCount: inputNodeInfo.textNodeCount,
		positiveTextCount: inputNodeInfo.positiveTextCount,
		negativeTextCount: inputNodeInfo.negativeTextCount,
		hasImageOutput: inputNodeInfo.hasImageOutput,
		hasVideoOutput: inputNodeInfo.hasVideoOutput,
		hasModel3dOutput: inputNodeInfo.hasModel3dOutput,
		source: 'history-matched',
		fromCache: false
	}
	writeHistoryCache(base, workflowPath, resp)
	return resp
}

function analyzeInputNodes(promptGraph) {
	const images = []
	const videos = []
	const allTextNodes = []
	const seedNodes = []
	const IMAGE_EXTS = /\.(png|jpg|jpeg|webp|gif|bmp|tiff)$/i
	const VIDEO_EXTS = /\.(mp4|webm|mov|avi|mkv)$/i
	const IMAGE_LOADER_TYPES = new Set([
		'LoadImage',
		'LoadImageFromPath',
		'Load Image',
		'ImageLoader',
		'LoadImageMasked'
	])
	const VIDEO_LOADER_TYPES = new Set(['LoadVideo', 'Load Video', 'VHS_LoadVideo', 'VideoLoader'])
	// 文本源头节点（本次已实证命中：PrimitiveStringMultiline = Input Text (Prompt)）
	const TEXT_SOURCE_NODE_TYPES = new Set([
		'PrimitiveStringMultiline',
		'PrimitiveString',
		'Primitive',
		'String',
		'StringMultiline',
		'InputText',
		'TextInput',
		'PromptInput',
		'LoadText',
		'LoadTextFile',
		'ReadTextFile',
		'Note',
		'MarkdownNote',
		'ShowText',
		'TextShow'
	])
	const TEXT_SOURCE_KEYS = new Set(['value', 'text', 'string', 'body', 'content', 'prompt'])
	const TEXT_ENCODE_TYPE_RE =
		/TextEncode|CLIPText|text.*encode|prompt.*encode|TextPrompt|PromptText|T5Text|UMT5|LLMText|GemmaText|QwenText|text_to_conditioning|MiniMax|H3|Guidance|PromptCfg|ConditioningText|FluxText|PromptOnly|AudioConditioning|Conditioning|Hunyuan|CogVideo|Wan/i
	const BLACKLIST_TEXT_INFER_CLASS_RE =
		/LoadImage|LoadVideo|SaveImage|SaveVideo|VHS_|CLIPLoader|VAELoader|CheckpointLoader|ControlNet|LoraLoader|UNETLoader|GligenLoader|KSampler|SamplerCustom|BasicScheduler|BasicGuider|Denoise|Sampler/i
	const SAMPLER_TYPE_RE =
		/sampler|KSampler|KSamplerSelect|BasicScheduler|FlowSampler|CausalVideoSampler|WanSampler|WanImageToVideo|WanI2V|WanTextToVideo|WanT2V|HunyuanVideoSampler|CogVideoSampler|VideoSampler|LTXVSampler|MochiSampler|SVD_img2vid/i
	const SEED_KEYS = ['noise_seed', 'seed', 'seed_num', 'rand_seed']
	const TEXT_INPUT_KEYS = [
		'value',
		'text',
		'text_g',
		'text_l',
		'prompt',
		'positive',
		'negative',
		'caption',
		'description',
		'instruction',
		'text_positive',
		'text_negative',
		'guidance',
		'guidance_text',
		'prompt_text',
		'pos_prompt',
		'neg_prompt',
		'user_prompt',
		'positive_prompt',
		'negative_prompt',
		't5_prompt',
		'llm_prompt',
		'flux_prompt',
		'positive_caption',
		'negative_caption'
	]

	function detectFileKind(classType, key, val) {
		if (isSocketValue(val)) return null
		if (typeof val !== 'string') return null
		const base = val.split(/[\\/]/).pop() || val
		if (IMAGE_EXTS.test(base)) return 'image'
		if (VIDEO_EXTS.test(base)) return 'video'
		if (
			IMAGE_LOADER_TYPES.has(classType) &&
			(key === 'image' || key === 'image_path' || key === 'path')
		)
			return 'image'
		if (
			VIDEO_LOADER_TYPES.has(classType) &&
			(key === 'video' || key === 'video_path' || key === 'path')
		)
			return 'video'
		if (/LoadImage|Load.*Image/i.test(classType) && key === 'image') return 'image'
		if (/LoadVideo|Load.*Video/i.test(classType) && key === 'video') return 'video'
		return null
	}

	function detectTextInputKeys(node, inputs) {
		const found = []
		for (const key of TEXT_INPUT_KEYS) {
			if (key in inputs && typeof inputs[key] === 'string' && !isSocketValue(inputs[key])) {
				found.push(key)
			}
		}
		if (found.length > 0) return found
		for (const [key, val] of Object.entries(inputs)) {
			if (isSocketValue(val)) continue
			if (typeof val !== 'string') continue
			const kl = key.toLowerCase()
			if (
				kl.includes('text') ||
				kl === 'prompt' ||
				kl.includes('prompt') ||
				kl.includes('guidance') ||
				kl.includes('caption') ||
				kl.includes('description') ||
				kl.includes('instruction')
			) {
				found.push(key)
			}
		}
		return found
	}

	function isTextEncoderNode(ct, inputs) {
		if (ct === 'CLIPTextEncode') return true
		if (ct === 'BNK_CLIPTextEncodeAdvanced') return true
		if (TEXT_SOURCE_NODE_TYPES.has(ct)) return true
		if (TEXT_ENCODE_TYPE_RE.test(ct)) return true
		if (isRecord(inputs) && !BLACKLIST_TEXT_INFER_CLASS_RE.test(ct)) {
			for (const key of TEXT_INPUT_KEYS) {
				if (key in inputs && typeof inputs[key] === 'string' && !isSocketValue(inputs[key])) {
					return true
				}
			}
		}
		return false
	}

	for (const [nid, node] of Object.entries(promptGraph)) {
		if (!isRecord(node)) continue
		const ct = String(node.class_type || '')
		const inputs = isRecord(node.inputs) ? node.inputs : {}
		const meta = isRecord(node._meta) ? node._meta : {}
		const title = String(meta.title || '')

		if (isTextEncoderNode(ct, inputs)) {
			let textKeys = detectTextInputKeys(node, inputs)
			// Primitive/String 家族节点的 key 优先从 TEXT_SOURCE_KEYS 枚举匹配，
			// 允许 inputs[key] 为空字符串或字符串（即使 detect 因空串被跳过）
			if (TEXT_SOURCE_NODE_TYPES.has(ct) && textKeys.length === 0) {
				for (const k of TEXT_SOURCE_KEYS) {
					if (k in inputs && (typeof inputs[k] === 'string' || inputs[k] == null)) {
						textKeys.push(k)
					}
				}
			}
			if (textKeys.length > 0) {
				const primaryKey = textKeys[0]
				const textVal = typeof inputs[primaryKey] === 'string' ? inputs[primaryKey] : ''
				allTextNodes.push({
					nodeId: nid,
					classType: ct,
					inputKey: primaryKey,
					allTextKeys: textKeys,
					originalText: textVal,
					title
				})
			}
		}

		if (SAMPLER_TYPE_RE.test(ct)) {
			for (const seedKey of SEED_KEYS) {
				if (seedKey in inputs && !isSocketValue(inputs[seedKey])) {
					seedNodes.push({ nodeId: nid, classType: ct, inputKey: seedKey })
					break
				}
			}
		}

		for (const [key, val] of Object.entries(inputs)) {
			const kind = detectFileKind(ct, key, val)
			if (kind === 'image') {
				images.push({
					nodeId: nid,
					classType: ct,
					inputKey: key,
					originalValue: String(val),
					displayName: `${ct}.${key}`
				})
			} else if (kind === 'video') {
				videos.push({
					nodeId: nid,
					classType: ct,
					inputKey: key,
					originalValue: String(val),
					displayName: `${ct}.${key}`
				})
			}
		}
	}

	// ── STRING socket 反向追踪专项 Pass ────────────────────────────────────
	// 命中本次实证场景：PrimitiveStringMultiline.value ──STRING──► MiniMaxH3AudioConditioningT8.prompt
	// 若文本消费节点的 prompt/text input 是 socket（而非直接字符串），反向追溯到文本源头节点，
	// 并确保它被加入 allTextNodes（写入源头即自然经 socket 传递到下游）。
	{
		const PROMPT_SOCKET_KEY_RE = /prompt|guidance|text|caption|description|instruction/i
		// 已记录的文本源 nodeId，避免重复
		const knownTextNodeIds = new Set(allTextNodes.map((t) => String(t.nodeId)))
		// 记录 Primitive→Consumer 的链路（用于 diagnostic downstream 字段）
		const downstreamBySource = new Map()
		// 收集 socket 值指向的上游源，以及下游 consumer 为文本类时的补全
		const directConsumerCandidates = [] // 当没有 Primitive 上游时，尝试直接把 consumer.prompt 作为写入口

		for (const [nid, node] of Object.entries(promptGraph)) {
			if (!isRecord(node)) continue
			const ct = String(node.class_type || '')
			const inputs = isRecord(node.inputs) ? node.inputs : {}
			const isConsumer =
				TEXT_ENCODE_TYPE_RE.test(ct) || TEXT_SOURCE_NODE_TYPES.has(ct)
					? false
					: TEXT_ENCODE_TYPE_RE.test(ct)
			for (const [key, val] of Object.entries(inputs)) {
				if (!PROMPT_SOCKET_KEY_RE.test(key)) continue
				if (!isSocketValue(val)) continue
				const [sourceId] = val
				const sourceNid = String(sourceId)
				const sourceNode = promptGraph[sourceNid]
				if (!isRecord(sourceNode)) continue
				const sct = String(sourceNode.class_type || '')
				const inputsHavePromptLikeKey = PROMPT_SOCKET_KEY_RE.test(key)

				const consumerLooksLikeTextSink = TEXT_ENCODE_TYPE_RE.test(ct) || inputsHavePromptLikeKey
				if (!consumerLooksLikeTextSink) continue

				// 优先：上游是 TEXT_SOURCE_NODE_TYPES（Primitive* / String / Note 等）
				if (TEXT_SOURCE_NODE_TYPES.has(sct)) {
					// 记录 downstream
					if (!downstreamBySource.has(sourceNid)) downstreamBySource.set(sourceNid, [])
					downstreamBySource.get(sourceNid).push({ nodeId: String(nid), key })
					if (knownTextNodeIds.has(sourceNid)) continue
					// 推导 sourceNode 的文本 key
					const sInputs = isRecord(sourceNode.inputs) ? sourceNode.inputs : {}
					let primaryKey = null
					const allTextKeys = []
					for (const k of TEXT_SOURCE_KEYS) {
						if (k in sInputs && (typeof sInputs[k] === 'string' || sInputs[k] == null)) {
							allTextKeys.push(k)
						}
					}
					if (allTextKeys.length === 0) allTextKeys.push('value')
					primaryKey = allTextKeys[0]
					const sMeta = isRecord(sourceNode._meta) ? sourceNode._meta : {}
					const title = String(sMeta.title || '')
					const originalText = typeof sInputs[primaryKey] === 'string' ? sInputs[primaryKey] : ''
					allTextNodes.push({
						nodeId: sourceNid,
						classType: sct,
						inputKey: primaryKey,
						allTextKeys,
						originalText,
						title,
						writeTargetKind: 'source'
					})
					knownTextNodeIds.add(sourceNid)
				} else {
					// 非 Primitive 上游：记为 direct consumer 候选（若上游非文本源但该 socket 本应承载字符串 prompt）
					directConsumerCandidates.push({ nodeId: String(nid), classType: ct, key })
				}
			}
		}

		// 把 downstream 注入 allTextNodes 对应项（便于诊断日志观察）
		for (const tn of allTextNodes) {
			const dn = downstreamBySource.get(String(tn.nodeId))
			if (dn && dn.length) tn.downstream = dn
		}

		// 若仍没有任何 allTextNodes，兜底：把 directConsumerCandidates（prompt 为 socket 但上游非 Primitive 的）
		// 中满足 key ∈ TEXT_INPUT_KEYS / 上游节点 inputs.value 是字符串的做一层判断，
		// 或直接将这些 consumer 的 key 视作文本写入口（提示词在部分历史中也可能直接填在消费节点）
		if (allTextNodes.length === 0) {
			const seen = new Set()
			for (const c of directConsumerCandidates) {
				const k = `${c.nodeId}:${c.key}`
				if (seen.has(k)) continue
				seen.add(k)
				const node = promptGraph[c.nodeId]
				if (!isRecord(node)) continue
				const inputs = isRecord(node.inputs) ? node.inputs : {}
				// 如果实际输入是 socket，跳过（我们无法安全写入 socket）；仅当该 key 也可存在为字符串时兜底
				const val = inputs[c.key]
				if (isSocketValue(val)) continue
				const meta = isRecord(node._meta) ? node._meta : {}
				allTextNodes.push({
					nodeId: c.nodeId,
					classType: c.classType,
					inputKey: c.key,
					allTextKeys: [c.key],
					originalText: typeof val === 'string' ? val : '',
					title: String(meta.title || ''),
					writeTargetKind: 'direct'
				})
			}
		}
	}

	const samplerNodes = []
	const conditioningNodes = []
	for (const [nid, node] of Object.entries(promptGraph)) {
		if (!isRecord(node)) continue
		const ct = String(node.class_type || '')
		const inputs = isRecord(node.inputs) ? node.inputs : {}
		if (SAMPLER_TYPE_RE.test(ct) && inputs) {
			samplerNodes.push({ nodeId: nid, inputs })
		}
		if (
			isRecord(inputs) &&
			('positive' in inputs ||
				'negative' in inputs ||
				'positive_conditioning' in inputs ||
				'negative_conditioning' in inputs ||
				'positive_embeds' in inputs ||
				'negative_embeds' in inputs ||
				'positive_embeddings' in inputs ||
				'negative_embeddings' in inputs ||
				'cond_positive' in inputs ||
				'cond_negative' in inputs)
		) {
			conditioningNodes.push({ nodeId: nid, inputs, ct })
		}
	}

	const positiveIds = new Set()
	const negativeIds = new Set()

	function addConnectedId(conn, set) {
		if (Array.isArray(conn) && conn.length >= 1) set.add(String(conn[0]))
	}

	for (const s of [...samplerNodes, ...conditioningNodes]) {
		addConnectedId(s.inputs.positive, positiveIds)
		addConnectedId(s.inputs.negative, negativeIds)
		addConnectedId(s.inputs.positive_conditioning, positiveIds)
		addConnectedId(s.inputs.negative_conditioning, negativeIds)
		addConnectedId(s.inputs.positive_embeds, positiveIds)
		addConnectedId(s.inputs.negative_embeds, negativeIds)
		addConnectedId(s.inputs.positive_embeddings, positiveIds)
		addConnectedId(s.inputs.negative_embeddings, negativeIds)
		addConnectedId(s.inputs.cond_positive, positiveIds)
		addConnectedId(s.inputs.cond_negative, negativeIds)
	}

	const classifiedPositive = []
	const classifiedNegative = []
	const unclassifiedText = []
	for (const tn of allTextNodes) {
		if (positiveIds.has(tn.nodeId)) {
			classifiedPositive.push(tn)
		} else if (negativeIds.has(tn.nodeId)) {
			classifiedNegative.push(tn)
		} else {
			unclassifiedText.push(tn)
		}
	}

	for (const tn of unclassifiedText) {
		const text = (tn.originalText || '').toLowerCase()
		const title = (tn.title || '').toLowerCase()
		const key = (tn.inputKey || '').toLowerCase()
		const isNegative =
			key.includes('negative') ||
			title.includes('negative') ||
			title.includes('负') ||
			text.includes('negative') ||
			text.includes('nsfw') ||
			text.includes('worst quality') ||
			text.includes('low quality') ||
			text.includes('bad anatomy')
		if (isNegative) {
			classifiedNegative.push(tn)
		} else {
			classifiedPositive.push(tn)
		}
	}

	if (
		classifiedPositive.length === 0 &&
		classifiedNegative.length === 0 &&
		allTextNodes.length > 0
	) {
		if (allTextNodes.length === 1) {
			classifiedPositive.push(allTextNodes[0])
		} else {
			classifiedPositive.push(allTextNodes[0])
			for (let i = 1; i < allTextNodes.length; i++) {
				classifiedNegative.push(allTextNodes[i])
			}
		}
	}

	const SAVE_IMAGE_TYPES = new Set([
		'SaveImage',
		'PreviewImage',
		'SaveImageNoPreview',
		'SaveImageWebp'
	])
	const SAVE_VIDEO_TYPES = new Set([
		'VHS_VideoCombine',
		'SaveVideo',
		'SaveAnimatedWEBP',
		'SaveAnimatedPNG',
		'SaveGif'
	])
	const SAVE_VIDEO_TYPE_RE =
		/SaveVideo|VHS_VideoCombine|AnimateCombine|SaveAnimated|VideoCombine|VHS_Save/i
	const SAVE_IMAGE_TYPE_RE = /SaveImage|PreviewImage|SaveImageNoPreview/i
	const SAVE_MODEL_TYPE_RE =
		/SaveGLB|SaveModel3D|SaveMesh|ExportModel|ExportMesh|SaveGltf|Save3D|SaveOBJ|SaveFBX|SaveSTL|SavePLY/i
	const VIDEO_EXTS_OUTPUT = /\.(mp4|webm|mov|mkv|avi|gif|m4v|wmv|flv)$/i
	const IMAGE_EXTS_OUTPUT = /\.(png|jpg|jpeg|webp|bmp|tiff?)$/i
	const MODEL3D_EXTS_OUTPUT = /\.(glb|gltf|fbx|obj|stl|dae|ply|3ds|usdz?|blend|step|iges)$/i
	const outputs = []

	function detectOutputKind(ct, inputs) {
		if (SAVE_IMAGE_TYPES.has(ct) || SAVE_IMAGE_TYPE_RE.test(ct)) return 'image'
		if (SAVE_VIDEO_TYPES.has(ct) || SAVE_VIDEO_TYPE_RE.test(ct)) return 'video'
		if (SAVE_MODEL_TYPE_RE.test(ct)) return 'model3d'
		if (isRecord(inputs)) {
			for (const [key, val] of Object.entries(inputs)) {
				if (isSocketValue(val)) continue
				if (typeof val !== 'string') continue
				const base = val.split(/[\\/]/).pop() || val
				if (VIDEO_EXTS_OUTPUT.test(base)) return 'video'
				if (MODEL3D_EXTS_OUTPUT.test(base)) return 'model3d'
			}
			const filename_prefix =
				typeof inputs.filename_prefix === 'string' ? inputs.filename_prefix.toLowerCase() : ''
			if (filename_prefix.includes('video') || filename_prefix.includes('animate')) return 'video'
		}
		return null
	}

	for (const [nid, node] of Object.entries(promptGraph)) {
		if (!isRecord(node)) continue
		const ct = String(node.class_type || '')
		const inputs = isRecord(node.inputs) ? node.inputs : {}
		if (/LoadImage|LoadVideo|LoadAudio|LoadData/i.test(ct)) continue
		const meta = isRecord(node._meta) ? node._meta : {}
		const title = String(meta.title || '')
		const kind = detectOutputKind(ct, inputs)
		if (kind) {
			outputs.push({
				nodeId: nid,
				classType: ct,
				mediaKind: kind,
				displayName: title || ct
			})
		}
	}

	const outputKinds = new Set(outputs.map((o) => o.mediaKind))
	const hasImageOutput = outputKinds.has('image')
	const hasVideoOutput = outputKinds.has('video')
	const hasModel3dOutput = outputKinds.has('model3d')

	const nodeCount = Object.keys(promptGraph).length
	return {
		images,
		videos,
		textNodes: {
			positive: classifiedPositive,
			negative: classifiedNegative
		},
		seedNodes,
		outputs,
		nodeCount,
		hasImageInput: images.length > 0,
		hasVideoInput: videos.length > 0,
		hasTextPrompt:
			allTextNodes.length > 0 || classifiedPositive.length > 0 || classifiedNegative.length > 0,
		textNodeCount: allTextNodes.length,
		positiveTextCount: classifiedPositive.length,
		negativeTextCount: classifiedNegative.length,
		hasImageOutput,
		hasVideoOutput,
		hasModel3dOutput
	}
}

function applyExactInputMappings(promptGraph, mappings, uploadedImages, uploadedVideos) {
	const imgMappings = Array.isArray(mappings?.imageInputs) ? mappings.imageInputs : []
	const vidMappings = Array.isArray(mappings?.videoInputs) ? mappings.videoInputs : []
	const missingNodes = []

	function assignPaths(nodeMappings, paths, label) {
		for (let i = 0; i < paths.length && i < nodeMappings.length; i++) {
			const m = nodeMappings[i]
			const node = promptGraph[m.nodeId]
			if (!node || !isRecord(node.inputs)) {
				missingNodes.push(`${label}[${i}]: node ${m.nodeId}`)
				continue
			}
			node.inputs[m.inputKey] = paths[i]
		}
	}

	assignPaths(imgMappings, uploadedImages, 'image')
	assignPaths(vidMappings, uploadedVideos, 'video')

	if (missingNodes.length > 0) {
		throw new Error(
			`Input nodes not found in prompt graph: ${missingNodes.join(', ')}. The workflow history may be outdated, please re-run in ComfyUI.`
		)
	}
}

function applyTextOverridesWithMappings(promptGraph, mappings, positivePrompt, negativePrompt) {
	const pp = String(positivePrompt || '').trim()
	const np = String(negativePrompt || '').trim()
	const textNodeMappings = mappings?.textNodes || {}
	const posNodes = Array.isArray(textNodeMappings.positive) ? textNodeMappings.positive : []
	const negNodes = Array.isArray(textNodeMappings.negative) ? textNodeMappings.negative : []

	const EXTENDED_COMMON_NEG_KEYS = [
		'text',
		'text_l',
		'negative',
		'caption',
		'description',
		'text_negative',
		'value',
		'guidance',
		'guidance_text',
		'prompt_text',
		'neg_prompt',
		'negative_prompt',
		'negative_caption'
	]
	const EXTENDED_COMMON_POS_KEYS = [
		'text',
		'text_g',
		'text_l',
		'prompt',
		'positive',
		'caption',
		'description',
		'instruction',
		'text_positive',
		'value',
		'guidance',
		'guidance_text',
		'prompt_text',
		'pos_prompt',
		'user_prompt',
		'positive_prompt',
		't5_prompt',
		'llm_prompt',
		'flux_prompt',
		'positive_caption'
	]

	const writtenDetails = { positive: [], negative: [] }

	function writeTextToNode(node, mapping, textValue, isNegative) {
		if (!node || !isRecord(node.inputs)) return { ok: false, writtenKey: null }
		const keys =
			mapping && Array.isArray(mapping.allTextKeys) && mapping.allTextKeys.length > 0
				? mapping.allTextKeys
				: mapping && mapping.inputKey
					? [mapping.inputKey]
					: []
		const commonKeys = isNegative ? EXTENDED_COMMON_NEG_KEYS : EXTENDED_COMMON_POS_KEYS
		let written = false
		let lastKey = null
		for (const key of [...new Set([...keys, ...commonKeys])]) {
			if (typeof key !== 'string') continue
			if (key in node.inputs && isSocketValue(node.inputs[key])) continue
			node.inputs[key] = textValue
			written = true
			lastKey = key
		}
		if (!written) {
			const skipKeys = new Set([
				'filename_prefix',
				'image',
				'video',
				'model',
				'clip',
				'vae',
				'samples',
				'latent_image',
				'noise_seed',
				'seed',
				'steps',
				'cfg',
				'sampler_name',
				'scheduler',
				'denoise',
				'width',
				'height',
				'ckpt_name',
				'vae_name',
				'clip_name',
				'lora_name',
				'control_net_name',
				'style',
				'strength',
				'ratio'
			])
			const antiKey = isNegative ? /positive/i : /negative/i
			for (const [key, val] of Object.entries(node.inputs)) {
				if (skipKeys.has(key)) continue
				if (antiKey.test(key)) continue
				if (
					typeof val === 'string' &&
					!/^https?:\/\//.test(val) &&
					!isSocketValue(val) &&
					!/\.(png|jpg|jpeg|webp|mp4|webm|mov|avi|mkv|safetensors|ckpt|pt|bin)$/i.test(val)
				) {
					node.inputs[key] = textValue
					written = true
					lastKey = key
					break
				}
			}
		}
		if (!written) {
			node.inputs.text = textValue
			written = true
			lastKey = 'text'
		}
		return { ok: written, writtenKey: lastKey }
	}

	let posWrites = 0
	let negWrites = 0
	let posAttempts = 0
	let negAttempts = 0

	if (pp) {
		for (const m of posNodes) {
			posAttempts += 1
			const node = promptGraph[m.nodeId]
			const result = writeTextToNode(node, m, pp, false)
			if (result.ok) {
				posWrites += 1
				writtenDetails.positive.push({
					nodeId: m.nodeId,
					classType: m.classType,
					key: result.writtenKey,
					valuePreview: pp.slice(0, 80)
				})
			}
		}
	}
	if (np) {
		for (const m of negNodes) {
			negAttempts += 1
			const node = promptGraph[m.nodeId]
			const result = writeTextToNode(node, m, np, true)
			if (result.ok) {
				negWrites += 1
				writtenDetails.negative.push({
					nodeId: m.nodeId,
					classType: m.classType,
					key: result.writtenKey,
					valuePreview: np.slice(0, 80)
				})
			}
		}
	}

	// —— 自检 + 兜底必触发 ——
	const needsFallback =
		(pp || np) &&
		((posNodes.length === 0 && negNodes.length === 0) ||
			(pp && posAttempts > 0 && posWrites === 0) ||
			(np && negAttempts > 0 && negWrites === 0) ||
			(pp && posNodes.length === 0) ||
			(np && negNodes.length === 0))
	let fallbackRan = false
	let fallbackWrites = { positive: 0, negative: 0 }
	if (needsFallback) {
		console.warn(
			`[ComfyUI] Text override fallback triggered: pos(${posNodes.length}/${posWrites} written) neg(${negNodes.length}/${negWrites} written). Running full-graph applyTextOverrides.`
		)
		fallbackWrites = applyTextOverrides(promptGraph, pp, np)
		fallbackRan = true
	}

	return {
		mappingsUsed: posNodes.length > 0 || negNodes.length > 0,
		positivePromptProvided: Boolean(pp),
		negativePromptProvided: Boolean(np),
		positiveMappingCount: posNodes.length,
		negativeMappingCount: negNodes.length,
		positiveWriteCount: posWrites,
		negativeWriteCount: negWrites,
		positiveAttemptCount: posAttempts,
		negativeAttemptCount: negAttempts,
		fallbackRan,
		fallbackWrites,
		writtenDetails
	}
}

function randomizeSeedFromMappings(promptGraph, mappings) {
	const seedMappings = Array.isArray(mappings?.seedNodes) ? mappings.seedNodes : []
	for (const m of seedMappings) {
		const node = promptGraph[m.nodeId]
		if (node && isRecord(node.inputs) && m.inputKey in node.inputs) {
			node.inputs[m.inputKey] = Math.floor(Math.random() * 0xffffffff)
		}
	}
	if (seedMappings.length === 0) {
		randomizeSeedInPrompt(promptGraph)
	}
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

	// 本地模板：从 LocalDB 读取，data 应为 prompt graph API 格式或 UI JSON
	if (workflowPath.startsWith('local://')) {
		const localId = workflowPath.slice('local://'.length)
		const wf = getLocalWorkflowData(ctx, localId)
		if (!wf) return { ok: false, error: '本地工作流模板不存在: ' + localId }
		return {
			ok: true,
			baseUrl: base,
			workflowPath,
			workflow: wf.data || {},
			source: 'local',
			localId: wf.id,
			localName: wf.name
		}
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
		if (
			res.body &&
			typeof res.body === 'object' &&
			!Array.isArray(res.body) &&
			!Buffer.isBuffer(res.body)
		) {
			workflow = res.body
		} else {
			let text
			if (typeof res.body === 'string') {
				text = res.body
			} else if (Buffer.isBuffer(res.rawBody)) {
				text = res.rawBody.toString('utf-8')
				if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
			} else {
				text = String(res.body ?? res.rawBody ?? '')
			}
			try {
				workflow = JSON.parse(text)
			} catch {
				return { ok: false, error: 'invalid workflow json' }
			}
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
	const inputMappings = isRecord(p.inputMappings) ? p.inputMappings : null
	const historyPromptId = String(p.historyPromptId || '').trim()

	const workflowMergeStats = {
		whitelistFiltered: 0,
		classTypeFromHistory: 0,
		mergedFromHistoryCount: 0
	}

	// Upload input files first (classified by mediaType)
	const uploadedImages = []
	const uploadedVideos = []
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
		fileMime =
			fileMime || f.contentType || f.mimeType || (mediaType === 'video' ? 'video/mp4' : 'image/png')

		const upResult = await uploadImageToComfyui(client, base, fileName, fileBuf, fileMime)
		if (upResult.error)
			return {
				ok: false,
				error: `上传${mediaType === 'video' ? '视频' : '图片'}失败：${upResult.error}`
			}
		const name = String(upResult.data?.name || '').trim()
		const subfolder = String(upResult.data?.subfolder || '')
			.trim()
			.replace(/\\/g, '/')
		const upPath = subfolder ? `${subfolder}/${name}` : name
		if (!upPath) continue

		if (mediaType === 'video') {
			uploadedVideos.push(upPath)
		} else {
			uploadedImages.push(upPath)
		}
	}

	let promptGraph = null
	let promptSource = 'none'
	let resolvedWorkflow = null
	let matchType = 'none'
	let effectiveMappings = inputMappings

	// —— 修复 B：将各来源 promptGraph 存储为独立变量，不再提前赋给最终 promptGraph 造成 Phase 2 路径死锁 ——
	// 之前的 bug：一旦 historyPromptId 命中，promptGraph 会被直接赋值成旧剧情，
	// 导致 L4245 `if (!isRecord(promptGraph))` 为 false，Phase 2 工作流文件基线永远走不到。
	let historyByIdPromptGraph = null // source 1: historyPromptId 精准匹配 (L4152)
	let historyByIdMatchType = null

	let historyByPathPromptGraph = null // source 2: workflowPath === 'history://xxx' (L4184)
	let historyByPathMatchType = null

	let localPromptGraph = null // source 3: workflowPath === 'local://xxx' (L4217)
	let localMatchType = null

	const baselineDiag = {
		used: false,
		from: 'none', // 'file' | 'historyById' | 'historyByPath' | 'local' | 'none'
		historyPromptIdMatch: false,
		historyByPathMatch: false,
		localMatch: false,
		fileBaselineNodes: 0,
		historyReferenceNodes: 0,
		whitelistFiltered: 0,
		mergedFromHistoryCount: 0,
		phase2Reason: ''
	}

	if (historyPromptId) {
		const histUrl = `${base}/history/${encodeURIComponent(historyPromptId)}`
		const histResult = await comfyJsonGet(client, histUrl, 10000)
		if (!histResult.error && isRecord(histResult.data)) {
			const entry = histResult.data[historyPromptId]
			if (isRecord(entry)) {
				const pa = entry.prompt
				if (Array.isArray(pa) && pa.length >= 3 && isRecord(pa[2])) {
					historyByIdPromptGraph = pa[2]
					historyByIdMatchType = 'direct'
					baselineDiag.historyPromptIdMatch = true
				}
			}
		}
		if (!isRecord(historyByIdPromptGraph)) {
			const cached = readHistoryCache(base, `history://${historyPromptId}`)
			if (cached && isRecord(cached.promptGraph)) {
				historyByIdPromptGraph = cached.promptGraph
				historyByIdMatchType = cached.matchType || 'direct'
				baselineDiag.historyPromptIdMatch = true
				if (!effectiveMappings) {
					effectiveMappings = {
						imageInputs: cached.imageInputs || [],
						videoInputs: cached.videoInputs || [],
						textNodes: cached.textNodes || { positive: [], negative: [] },
						seedNodes: cached.seedNodes || []
					}
				}
			}
		}
	}

	if (workflowPath.startsWith('history://')) {
		const promptId = workflowPath.slice('history://'.length)
		const histUrl = `${base}/history/${encodeURIComponent(promptId)}`
		const histResult = await comfyJsonGet(client, histUrl, 10000)
		if (!histResult.error && isRecord(histResult.data)) {
			const entry = histResult.data[promptId]
			if (isRecord(entry)) {
				const pa = entry.prompt
				if (Array.isArray(pa) && pa.length >= 3 && isRecord(pa[2])) {
					historyByPathPromptGraph = pa[2]
					historyByPathMatchType = 'direct'
					baselineDiag.historyByPathMatch = true
				}
			}
		}
		if (!isRecord(historyByPathPromptGraph)) {
			const cached = readHistoryCache(base, workflowPath)
			if (cached && isRecord(cached.promptGraph)) {
				historyByPathPromptGraph = cached.promptGraph
				historyByPathMatchType = cached.matchType || 'direct'
				baselineDiag.historyByPathMatch = true
				if (!effectiveMappings) {
					effectiveMappings = {
						imageInputs: cached.imageInputs || [],
						videoInputs: cached.videoInputs || [],
						textNodes: cached.textNodes || { positive: [], negative: [] },
						seedNodes: cached.seedNodes || []
					}
				}
			}
		}
	}

	// 本地模板：直接从 LocalDB 取 data 作为 prompt graph，无需 ComfyUI /history 在线
	if (workflowPath.startsWith('local://')) {
		const localId = workflowPath.slice('local://'.length)
		const wf = getLocalWorkflowData(ctx, localId)
		if (!wf) {
			return {
				ok: false,
				error: 'NO_LOCAL',
				message: '本地工作流模板不存在: ' + localId,
				baseUrl: base
			}
		}
		const data = wf.data
		if (isRecord(data) && isPromptGraphJson(data)) {
			localPromptGraph = data
			localMatchType = 'direct'
			baselineDiag.localMatch = true
		} else {
			return {
				ok: false,
				error: 'INVALID_LOCAL_FORMAT',
				message:
					'本地模板数据格式无效：仅支持 ComfyUI API 格式（prompt graph）。请在 ComfyUI 中使用"保存(API格式)"后重新导入。',
				baseUrl: base
			}
		}
	}

	// —— 修复 B：强制触发 Phase 2（workflow-file baseline）——
	// 当 workflowPath 是文件系统路径时（非 history:// 非 local://），不管是否命中了 historyPromptId 缓存，
	// 都先读取用户最新保存的工作流 UI JSON 作为主基线，只把 history 作为结构补全参考，彻底杜绝旧缓存泄漏。
	const isFileSystemWorkflowPath =
		workflowPath && !workflowPath.startsWith('history://') && !workflowPath.startsWith('local://')

	if (isFileSystemWorkflowPath) {
		baselineDiag.phase2Reason = 'filesystem-path-forced'
	} else {
		baselineDiag.phase2Reason = 'no-fs-path-skip'
	}

	if (isFileSystemWorkflowPath || !isRecord(promptGraph)) {
		const wfResult = await runtimeGetWorkflowFile(ctx, { baseUrl: base, workflowPath })
		if (!wfResult.ok) return { ok: false, error: `读取工作流失败：${wfResult.error}` }
		resolvedWorkflow = wfResult.workflow

		// —— Phase 2 (P0 Fix)：以最新保存的工作流文件为 prompt graph 主基线 ——
		// 之前的 bug：resolvedWorkflow 只用于拿 workflowId 去匹配 history，实际 promptGraph 直接从
		// history 或 cache 取，所以用户删除 InputText 值并保存后仍然泄漏旧的环绕镜头提示词。
		// 修复思路：
		//   1. 把 resolvedWorkflow 转成 fileBaseline（API JSON 直接用；UI JSON 用 convertWorkflowUiJsonToPromptGraph 转换）
		//   2. history/cache 不再覆盖作为主基线，只用于补充缺失的非文本节点字段
		//   3. 如果 fileBaseline 完全不可用（转换失败或结构严重失真），再 fallback 旧逻辑（history → cache → NO_HISTORY）
		let fileBaseline = null
		let baselineConversionFailedReason = null
		if (isPromptGraphJson(resolvedWorkflow)) {
			fileBaseline = resolvedWorkflow
		} else if (isWorkflowUiJson(resolvedWorkflow)) {
			try {
				fileBaseline = convertWorkflowUiJsonToPromptGraph(resolvedWorkflow)
			} catch (e) {
				baselineConversionFailedReason = e?.message || String(e)
				fileBaseline = null
			}
		}
		// 结构合理性校验：转换后的 fileBaseline 节点数至少为 3 且有 class_type/inputs；否则认为转换失败
		if (isRecord(fileBaseline)) {
			const nids = Object.keys(fileBaseline)
			let valid = 0
			for (const nid of nids) {
				const nd = fileBaseline[nid]
				if (isRecord(nd) && typeof nd.class_type === 'string' && isRecord(nd.inputs)) valid++
			}
			if (nids.length < 3 || valid < Math.max(2, Math.floor(nids.length * 0.5))) {
				baselineConversionFailedReason = `structural validation: validNodes=${valid} totalNodes=${nids.length}`
				fileBaseline = null
			}
		}

		const workflowId = isRecord(resolvedWorkflow) ? String(resolvedWorkflow.id || '').trim() : ''
		const workflowFingerprint = buildWorkflowFingerprintFromWorkflowJson(resolvedWorkflow)
		// 仍然获取 history/cache 的 promptGraph 用于"结构补全"（但不再作为主基线）
		// 修复 B：优先复用 historyPromptId 分支已经拉过的 historyByIdPromptGraph，避免重复 HTTP 调用
		let historyPromptGraph = null
		let historyMatchType = null
		if (isRecord(historyByIdPromptGraph)) {
			historyPromptGraph = historyByIdPromptGraph
			historyMatchType = historyByIdMatchType || 'direct'
		} else {
			const histResult = await findLatestSuccessfulPromptByWorkflowId(
				client,
				base,
				workflowId,
				workflowFingerprint || null
			)
			if (isRecord(histResult.promptGraph)) {
				historyPromptGraph = histResult.promptGraph
				historyMatchType = histResult.matchType || 'exact'
				if (!effectiveMappings && !fileBaseline) {
					const analyzed = analyzeInputNodes(historyPromptGraph)
					effectiveMappings = {
						imageInputs: analyzed.images,
						videoInputs: analyzed.videos,
						textNodes: analyzed.textNodes,
						seedNodes: analyzed.seedNodes
					}
				}
			}
		}
		let cachePromptGraph = null
		let cacheMatchType = null
		let cacheMappings = null
		if (!historyPromptGraph) {
			const cached = readHistoryCache(base, workflowPath)
			if (cached && isRecord(cached.promptGraph)) {
				cachePromptGraph = cached.promptGraph
				cacheMatchType = cached.matchType || 'exact'
				cacheMappings = {
					imageInputs: cached.imageInputs || [],
					videoInputs: cached.videoInputs || [],
					textNodes: cached.textNodes || { positive: [], negative: [] },
					seedNodes: cached.seedNodes || []
				}
				if (!effectiveMappings && !fileBaseline) {
					effectiveMappings = cacheMappings
				}
			}
		}
		const referencePromptGraph = historyPromptGraph || cachePromptGraph
		const referenceMatchType = historyMatchType || cacheMatchType || null

		if (isRecord(fileBaseline)) {
			baselineDiag.used = true
			baselineDiag.from = 'file'
			baselineDiag.fileBaselineNodes = Object.keys(fileBaseline).length
			// 主基线走 workflow-file 路径
			if (isRecord(referencePromptGraph)) {
				baselineDiag.historyReferenceNodes = Object.keys(referencePromptGraph).length
				const m = mergeBaselineAndHistoryNodes(fileBaseline, referencePromptGraph)
				promptGraph = m.merged
				matchType = referenceMatchType || 'merged'
				promptSource = m.mergedFromHistoryCount > 0 ? 'workflow-file-merged' : 'workflow-file'
				workflowMergeStats.whitelistFiltered = m.whitelistFiltered || 0
				workflowMergeStats.classTypeFromHistory = m.classTypeFromHistory || 0
				workflowMergeStats.mergedFromHistoryCount = m.mergedFromHistoryCount || 0
				baselineDiag.whitelistFiltered = workflowMergeStats.whitelistFiltered
				baselineDiag.mergedFromHistoryCount = workflowMergeStats.mergedFromHistoryCount
			} else {
				promptGraph = fileBaseline
				matchType = 'workflow-file'
				promptSource = 'workflow-file'
			}
			if (!effectiveMappings) {
				const analyzed = analyzeInputNodes(promptGraph)
				effectiveMappings = {
					imageInputs: analyzed.images,
					videoInputs: analyzed.videos,
					textNodes: analyzed.textNodes,
					seedNodes: analyzed.seedNodes
				}
			}
			console.log(
				`[ComfyUI] Phase 2 success: baseline from workflow file (source=${promptSource}), fileNodes=${
					Object.keys(fileBaseline).length
				}, refNodes=${isRecord(referencePromptGraph) ? Object.keys(referencePromptGraph).length : 0}, mergedNodes=${
					workflowMergeStats.mergedFromHistoryCount
				}, whitelistFiltered=${workflowMergeStats.whitelistFiltered}, classTypeFromHistory=${
					workflowMergeStats.classTypeFromHistory
				}, historyPromptIdMatch=${baselineDiag.historyPromptIdMatch}, phase2Reason=${baselineDiag.phase2Reason}`
			)
		} else {
			// Fallback：workflow 文件不可用或结构失真，退回 history/cache 路径（旧行为）
			baselineDiag.used = false
			baselineDiag.phase2Reason = baselineConversionFailedReason || 'unknown'
			console.warn(
				`[ComfyUI] Phase 2 fallback: workflow-file baseline unavailable (reason=${
					baselineConversionFailedReason || 'unknown'
				}), using ordered fallback: historyById → historyByPath → local → historyPromptGraph → cachePromptGraph.`
			)
			// 修复 B：按优先级回退（workflowPath 指定来源优先）
			if (workflowPath.startsWith('history://') && isRecord(historyByPathPromptGraph)) {
				promptGraph = historyByPathPromptGraph
				matchType = historyByPathMatchType || 'direct'
				promptSource = 'fallback-history-path'
				baselineDiag.from = 'historyByPath'
			} else if (workflowPath.startsWith('local://') && isRecord(localPromptGraph)) {
				promptGraph = localPromptGraph
				matchType = localMatchType || 'direct'
				promptSource = 'fallback-local'
				baselineDiag.from = 'local'
			} else if (isRecord(historyByIdPromptGraph)) {
				promptGraph = historyByIdPromptGraph
				matchType = historyByIdMatchType || 'direct'
				promptSource = 'fallback-history-by-id'
				baselineDiag.from = 'historyById'
			} else if (isRecord(historyByPathPromptGraph)) {
				promptGraph = historyByPathPromptGraph
				matchType = historyByPathMatchType || 'direct'
				promptSource = 'fallback-history-path'
				baselineDiag.from = 'historyByPath'
			} else if (isRecord(localPromptGraph)) {
				promptGraph = localPromptGraph
				matchType = localMatchType || 'direct'
				promptSource = 'fallback-local'
				baselineDiag.from = 'local'
			} else if (isRecord(historyPromptGraph)) {
				promptGraph = historyPromptGraph
				matchType = historyMatchType
				promptSource = `fallback-history-${matchType}`
				baselineDiag.from = 'historyPromptGraph'
			} else if (isRecord(cachePromptGraph)) {
				promptGraph = cachePromptGraph
				matchType = cacheMatchType
				promptSource = 'fallback-cache-matched'
				baselineDiag.from = 'cachePromptGraph'
			}
		}
	}

	if (!isRecord(promptGraph)) {
		return {
			ok: false,
			error: 'NO_HISTORY',
			message: `该工作流暂无成功运行记录且工作流文件无法转换为可执行格式。请先打开ComfyUI界面（${base}），加载"${workflowPath}"工作流并成功运行一次，然后回到DVStudio重试。`,
			baseUrl: base,
			requiresHistorySetup: true
		}
	}

	if (!effectiveMappings) {
		const analyzed = analyzeInputNodes(promptGraph)
		effectiveMappings = {
			imageInputs: analyzed.images,
			videoInputs: analyzed.videos,
			textNodes: analyzed.textNodes,
			seedNodes: analyzed.seedNodes
		}
	} else {
		// —— s4b: 陈旧 mappings 检测与强制重跑 ——
		// 场景：缓存读取的 effectiveMappings.textNodes 为旧版本数据（positive/negative 均为空数组），
		// 但用户实际上通过前端传入了 positivePrompt/negativePrompt。若不重跑 analyzeInputNodes，
		// applyTextOverridesWithMappings 会立即进入 needsFallback 路径，虽然兜底扫描能工作，
		// 但无法保证"按 mappings 精准写入 PrimitiveStringMultiline.value"这一关键链路。
		const posCount = Array.isArray(effectiveMappings.textNodes?.positive)
			? effectiveMappings.textNodes.positive.length
			: 0
		const negCount = Array.isArray(effectiveMappings.textNodes?.negative)
			? effectiveMappings.textNodes.negative.length
			: 0
		const hasPrompt = Boolean(positivePrompt || negativePrompt)
		const hasEmptyTextMappings = posCount === 0 && negCount === 0
		// 额外：analyzeInputNodes 最新版本返回 hasTextPrompt/textNodeCount，如果当前 mappings 没有这些字段
		// 或它们不一致（例如旧缓存 hasTextPrompt=false 但新分析=true），也要重跑。
		const analyzedSnapshot = analyzeInputNodes(promptGraph)
		const freshHasTextPrompt = analyzedSnapshot.hasTextPrompt === true
		const staleByFlag =
			freshHasTextPrompt &&
			(effectiveMappings.hasTextPrompt === false || effectiveMappings.hasTextPrompt == null)
		if ((hasPrompt && hasEmptyTextMappings) || staleByFlag) {
			console.warn(
				`[ComfyUI] Stale text mappings detected: pos=${posCount} neg=${negCount} hasPrompt=${hasPrompt} staleByFlag=${staleByFlag}. Re-running analyzeInputNodes to refresh mappings.`
			)
			effectiveMappings = {
				imageInputs: analyzedSnapshot.images,
				videoInputs: analyzedSnapshot.videos,
				textNodes: analyzedSnapshot.textNodes,
				seedNodes: analyzedSnapshot.seedNodes
			}
		}
	}

	try {
		promptGraph = JSON.parse(JSON.stringify(promptGraph))
	} catch {}

	// —— 修复 B：提交前审计 ① baseline 决策 ——
	console.log(
		`[ComfyUI] Baseline diag: used=${baselineDiag.used} from=${baselineDiag.from} phase2Reason=${baselineDiag.phase2Reason} ` +
			`historyPromptIdMatch=${baselineDiag.historyPromptIdMatch} historyByPathMatch=${baselineDiag.historyByPathMatch} localMatch=${baselineDiag.localMatch} ` +
			`fileBaselineNodes=${baselineDiag.fileBaselineNodes} historyReferenceNodes=${baselineDiag.historyReferenceNodes} ` +
			`whitelistFiltered=${baselineDiag.whitelistFiltered} mergedFromHistoryCount=${baselineDiag.mergedFromHistoryCount}`
	)
	// —— 修复 B：提交前审计 ② 关键文本节点快照（提交前/Mappings&Defense前）——
	//    针对 MiniMax H3 全能参考工作流（nodeId=312 源；nodeId=333 消费），防止再次出现 "缓存泄漏环绕镜头"
	const auditNodeIds = new Set(['312', '333'])
	// 兜底：如果 mappings 里有文本节点，也加到审计集合里
	for (const n of effectiveMappings?.textNodes?.positive || []) {
		if (n.nodeId) auditNodeIds.add(String(n.nodeId))
	}
	for (const n of effectiveMappings?.textNodes?.negative || []) {
		if (n.nodeId) auditNodeIds.add(String(n.nodeId))
	}
	const audit = {}
	for (const nid of auditNodeIds) {
		const nd = promptGraph[nid]
		if (isRecord(nd)) {
			const snippet = {}
			for (const key of Object.keys(nd.inputs || {})) {
				const v = nd.inputs[key]
				if (typeof v === 'string')
					snippet[key] = v.length > 200 ? v.slice(0, 200) + '…(len=' + v.length + ')' : v
				else if (Array.isArray(v)) snippet[key] = '[SOCKET REF] ' + JSON.stringify(v)
				else snippet[key] = v
			}
			audit[nid] = { class_type: nd.class_type, inputs: snippet }
		}
	}
	console.log(
		'[ComfyUI] Pre-submit node audit (before applyTextOverrides + Defense):',
		JSON.stringify(audit, null, 2)
	)
	// —— 修复 B：提交前审计 ③ 如果 positivePrompt === 空但前端传过来的 historyPromptId 有匹配，WARN——
	if (!positivePrompt && !negativePrompt) {
		console.warn(
			`[ComfyUI] ⚠️ positivePrompt & negativePrompt BOTH EMPTY! Defense-Clear / Defense-Downstream will be SKIPPED! ` +
				`historyPromptId=${historyPromptId ? 'HAS (match=' + baselineDiag.historyPromptIdMatch + ')' : 'none'}. ` +
				`If frontend upstream text node is connected, this indicates text extraction bug on DVStudio (collectComfyInputTexts).`
		)
	}

	console.log(
		`[ComfyUI] Using prompt graph (source=${promptSource}, match=${matchType}), nodes:`,
		Object.keys(promptGraph).length
	)
	console.log(
		`[ComfyUI] Positive prompt: "${positivePrompt.slice(0, 100)}${positivePrompt.length > 100 ? '...' : ''}"`
	)
	console.log(
		`[ComfyUI] Negative prompt: "${negativePrompt.slice(0, 100)}${negativePrompt.length > 100 ? '...' : ''}"`
	)
	console.log(
		`[ComfyUI] Text node mappings - positive:`,
		(effectiveMappings?.textNodes?.positive || []).map(
			(n) => `${n.nodeId}(${n.classType}).${n.inputKey}`
		),
		'negative:',
		(effectiveMappings?.textNodes?.negative || []).map(
			(n) => `${n.nodeId}(${n.classType}).${n.inputKey}`
		)
	)

	try {
		applyExactInputMappings(promptGraph, effectiveMappings, uploadedImages, uploadedVideos)
	} catch (mappingErr) {
		return { ok: false, error: mappingErr.message || 'Input mapping failed' }
	}

	const textWriteDiagnostics = applyTextOverridesWithMappings(
		promptGraph,
		effectiveMappings,
		positivePrompt,
		negativePrompt
	)

	// —— Phase 3 (Pre-Submit Defense Pass)：三道防线阻止旧文本泄漏 ——
	//
	//   ① Defense-Clear：清空所有 TEXT_SOURCE_NODE_TYPES 节点的文本值槽位。
	//     如果 mappings 路径和 fallback 扫描路径都因为节点错位/重排而漏写，
	//     至少 promptGraph 中不会再携带上一次成功的旧环绕镜头提示词；
	//     最坏情况 ComfyUI 收到空字符串报错，而不是悄无声息生成错视频。
	//
	//   ② Defense-Downstream：对下游 TEXT_CONSUMER_CLASS_RE 命中的文本消费节点
	//     （MiniMaxH3AudioConditioningT8 / CLIPTextEncode / H3Guidance 等）做 socket 覆盖双写：
	//     就算上游 PrimitiveStringMultiline 的 socket 指向错了，消费端 prompt/guidance 槽位
	//     也会被直接写成传入的 positivePrompt / negativePrompt 字符串。
	//
	// 注意：本 Defense 是"最后的护城河"，不替代正常的 mappings 写入链路；
	// mappings/fallback 成功写入的节点会被我们跳过（避免重复写入同一 key 多次），
	// 只对"写漏了/仍是 socket 引用"的槽位做兜底。
	const DEFENSE_TEXT_SOURCE_NODE_TYPES = new Set([
		'PrimitiveStringMultiline',
		'PrimitiveString',
		'Primitive',
		'String',
		'StringMultiline',
		'InputText',
		'TextInput',
		'PromptInput',
		'LoadText',
		'LoadTextFile',
		'ReadTextFile',
		'Note',
		'MarkdownNote',
		'ShowText',
		'TextShow'
	])
	const DEFENSE_TEXT_SOURCE_KEYS = new Set([
		'value',
		'text',
		'string',
		'body',
		'content',
		'prompt',
		'text_g',
		'text_l',
		'caption',
		'description',
		'instruction',
		'guidance',
		'guidance_text',
		'prompt_text',
		'positive',
		'positive_prompt',
		'neg_prompt',
		'negative',
		'negative_prompt'
	])
	const DEFENSE_TEXT_CONSUMER_CLASS_RE =
		/TextEncode|CLIPText|text.*encode|prompt.*encode|TextPrompt|PromptText|T5Text|UMT5|LLMText|GemmaText|QwenText|text_to_conditioning|MiniMaxH3AudioConditioning|MiniMax.*H3|H3Audio|H3Guidance|Guidance.*Audio|GuidanceText|PromptCfg|ConditioningText|FluxText|PromptOnly|AudioConditioning|ConditioningCombine|ConditioningConcat|Hunyuan.*Text|CogVideo.*Text|Wan.*Text/i
	const DEFENSE_COMMON_POS_KEYS = [
		'text',
		'text_g',
		'text_l',
		'prompt',
		'positive',
		'caption',
		'description',
		'instruction',
		'text_positive',
		'value',
		'guidance',
		'guidance_text',
		'prompt_text',
		'pos_prompt',
		'user_prompt',
		'positive_prompt',
		't5_prompt',
		'llm_prompt',
		'flux_prompt',
		'positive_caption'
	]
	const DEFENSE_COMMON_NEG_KEYS = [
		'text_neg',
		'negative',
		'neg_prompt',
		'negative_prompt',
		'negative_caption',
		'neg',
		'nagative_prompt'
	]
	let preClearCount = 0
	for (const [nid, node] of Object.entries(promptGraph)) {
		if (!isRecord(node) || !isRecord(node.inputs)) continue
		const ct = String(node.class_type || '')
		if (!DEFENSE_TEXT_SOURCE_NODE_TYPES.has(ct)) continue
		for (const [key, val] of Object.entries(node.inputs)) {
			if (!DEFENSE_TEXT_SOURCE_KEYS.has(key)) continue
			if (typeof val === 'string' && val.length > 0) {
				node.inputs[key] = ''
				preClearCount += 1
			}
		}
	}
	// 清空完 Defense-Clear，再 re-run 一次 applyTextOverridesWithMappings（这次不会被旧字符串干扰）
	let reapplyInfo = null
	if ((positivePrompt || negativePrompt) && preClearCount > 0) {
		reapplyInfo = applyTextOverridesWithMappings(
			promptGraph,
			effectiveMappings,
			positivePrompt,
			negativePrompt
		)
		// 以 reapply 结果覆盖统计值（但保留 fallbackRan 等复合字段的 OR 关系）
		textWriteDiagnostics.positiveWriteCount = reapplyInfo.positiveWriteCount
		textWriteDiagnostics.negativeWriteCount = reapplyInfo.negativeWriteCount
		textWriteDiagnostics.positiveAttemptCount = reapplyInfo.positiveAttemptCount
		textWriteDiagnostics.negativeAttemptCount = reapplyInfo.negativeAttemptCount
		if (reapplyInfo.fallbackRan) textWriteDiagnostics.fallbackRan = true
		if (reapplyInfo.writtenDetails?.positive?.length) {
			textWriteDiagnostics.writtenDetails = textWriteDiagnostics.writtenDetails || {
				positive: [],
				negative: []
			}
			textWriteDiagnostics.writtenDetails.positive = reapplyInfo.writtenDetails.positive
		}
		if (reapplyInfo.writtenDetails?.negative?.length) {
			textWriteDiagnostics.writtenDetails = textWriteDiagnostics.writtenDetails || {
				positive: [],
				negative: []
			}
			textWriteDiagnostics.writtenDetails.negative = reapplyInfo.writtenDetails.negative
		}
	}
	// Defense-Downstream：下游文本消费节点 socket 覆盖双写
	const downstreamWrites = { positive: 0, negative: 0 }
	const alreadyDownstreamPos = new Set()
	const alreadyDownstreamNeg = new Set()
	if (positivePrompt || negativePrompt) {
		for (const [nid, node] of Object.entries(promptGraph)) {
			if (!isRecord(node) || !isRecord(node.inputs)) continue
			const ct = String(node.class_type || '')
			if (!DEFENSE_TEXT_CONSUMER_CLASS_RE.test(ct)) continue
			// 跳过 TEXT_SOURCE_NODE_TYPES（上游源节点不应作为 consumer 双写目标；它们会被 Clear+reapply 处理）
			if (DEFENSE_TEXT_SOURCE_NODE_TYPES.has(ct)) continue
			if (positivePrompt) {
				for (const key of DEFENSE_COMMON_POS_KEYS) {
					const token = `${nid}:${key}`
					if (alreadyDownstreamPos.has(token)) continue
					if (!(key in node.inputs)) continue
					const cur = node.inputs[key]
					const alreadyCorrectString =
						typeof cur === 'string' && cur.length > 0 && cur === positivePrompt
					if (alreadyCorrectString) {
						alreadyDownstreamPos.add(token)
						downstreamWrites.positive += 0
						continue
					}
					// 不管原来是 socket 引用还是旧字符串，都覆盖成 positivePrompt 字符串
					node.inputs[key] = positivePrompt
					alreadyDownstreamPos.add(token)
					downstreamWrites.positive += 1
				}
			}
			if (negativePrompt) {
				for (const key of DEFENSE_COMMON_NEG_KEYS) {
					const token = `${nid}:${key}`
					if (alreadyDownstreamNeg.has(token)) continue
					if (!(key in node.inputs)) continue
					const cur = node.inputs[key]
					const alreadyCorrectString =
						typeof cur === 'string' && cur.length > 0 && cur === negativePrompt
					if (alreadyCorrectString) {
						alreadyDownstreamNeg.add(token)
						continue
					}
					node.inputs[key] = negativePrompt
					alreadyDownstreamNeg.add(token)
					downstreamWrites.negative += 1
				}
			}
		}
	}
	// 把 Phase 3 新增统计 + baselineSource 写入 diagnostic 输出对象
	textWriteDiagnostics.baselineSource = String(promptSource || '')
	textWriteDiagnostics.preClearCount = preClearCount
	textWriteDiagnostics.downstreamWrites = downstreamWrites
	textWriteDiagnostics.whitelistFiltered = workflowMergeStats.whitelistFiltered || 0
	textWriteDiagnostics.classTypeFromHistory = workflowMergeStats.classTypeFromHistory || 0
	textWriteDiagnostics.mergedFromHistoryCount = workflowMergeStats.mergedFromHistoryCount || 0

	randomizeSeedFromMappings(promptGraph, effectiveMappings)

	// —— s4d: 提交前 diagnostic 快照 ——
	// 扫描 promptGraph 中所有 TEXT_SOURCE_NODE_TYPES/文本编码节点的实际 value，
	// 用于前端 rr 结果确认"文本真的被写入了 promptGraph"。
	const textNodeSnapshot = {}
	const DIAG_TEXT_CLASS_RE =
		/PrimitiveStringMultiline|PrimitiveString|InputText|TextInput|CLIPTextEncode|TextEncode|MiniMax|H3|Guidance|ConditioningText|FluxText|PromptOnly|AudioConditioning/i
	for (const [nid, node] of Object.entries(promptGraph)) {
		if (!isRecord(node)) continue
		const ct = String(node.class_type || '')
		if (!DIAG_TEXT_CLASS_RE.test(ct)) continue
		const inputs = isRecord(node.inputs) ? node.inputs : {}
		const snapshot = {}
		for (const [k, v] of Object.entries(inputs)) {
			if (isSocketValue(v)) continue
			if (typeof v === 'string') {
				snapshot[k] = v.length > 120 ? `${v.slice(0, 120)}...` : v
			}
		}
		if (Object.keys(snapshot).length > 0) {
			textNodeSnapshot[nid] = { classType: ct, inputs: snapshot }
		}
	}
	textWriteDiagnostics.snapshot = textNodeSnapshot

	console.log(
		'[ComfyUI] Text write diagnostics:',
		JSON.stringify({
			baselineSource: textWriteDiagnostics.baselineSource,
			preClearCount: textWriteDiagnostics.preClearCount,
			downstreamWrites: textWriteDiagnostics.downstreamWrites,
			mappingsUsed: textWriteDiagnostics.mappingsUsed,
			posMap: textWriteDiagnostics.positiveMappingCount,
			negMap: textWriteDiagnostics.negativeMappingCount,
			posWrite: textWriteDiagnostics.positiveWriteCount,
			negWrite: textWriteDiagnostics.negativeWriteCount,
			fallbackRan: textWriteDiagnostics.fallbackRan,
			fallbackWrites: textWriteDiagnostics.fallbackWrites,
			snapshotKeys: Object.keys(textNodeSnapshot)
		})
	)
	for (const [nid, info] of Object.entries(textNodeSnapshot)) {
		console.log(`  [TextNode ${nid}] ${info.classType}:`, JSON.stringify(info.inputs))
	}
	if (
		textWriteDiagnostics.downstreamWrites &&
		(textWriteDiagnostics.downstreamWrites.positive > 0 ||
			textWriteDiagnostics.downstreamWrites.negative > 0)
	) {
		console.log(
			`[ComfyUI] Phase 3 Defense downstream double-writes summary: pos=${textWriteDiagnostics.downstreamWrites.positive} neg=${textWriteDiagnostics.downstreamWrites.negative} nodes=${[
				...alreadyDownstreamPos,
				...alreadyDownstreamNeg
			]
				.map((t) => t.split(':')[0])
				.filter((v, i, a) => a.indexOf(v) === i)
				.join(',')}`
		)
	}

	// —— 修复 B：提交前审计 ④ 关键节点 POST-Defense 快照——
	//    对比 ① 的 Pre-Defense 快照：确认 node 312.value 被重新写入，node 333.prompt 从 [SOCKET REF] 被双写成纯字符串
	const auditPost = {}
	for (const nid of auditNodeIds) {
		const nd = promptGraph[nid]
		if (isRecord(nd)) {
			const snippet = {}
			for (const key of Object.keys(nd.inputs || {})) {
				const v = nd.inputs[key]
				if (typeof v === 'string')
					snippet[key] = v.length > 200 ? v.slice(0, 200) + '…(len=' + v.length + ')' : v
				else if (Array.isArray(v)) snippet[key] = '[SOCKET REF] ' + JSON.stringify(v)
				else snippet[key] = v
			}
			auditPost[nid] = { class_type: nd.class_type, inputs: snippet }
		}
	}
	console.log(
		'[ComfyUI] Post-Defense node audit (FINAL before submit):',
		JSON.stringify(auditPost, null, 2)
	)
	// 关键断言：MiniMax 消费节点 prompt 字段如果原来是 socket 引用（["312", 0]），Defense-Downstream 触发 positivePrompt 后
	// 必须变成纯字符串；如果 positivePrompt 为空（前端遗漏），这里 WARN，提示用户先看修复 A。
	const auditConsumerKeys = DEFENSE_COMMON_POS_KEYS.concat(DEFENSE_COMMON_NEG_KEYS)
	for (const nid of auditNodeIds) {
		const nd = promptGraph[nid]
		const ct = String(nd?.class_type || '')
		if (!ct || !DEFENSE_TEXT_CONSUMER_CLASS_RE.test(ct) || !isRecord(nd?.inputs)) continue
		for (const key of auditConsumerKeys) {
			const v = nd.inputs[key]
			if (Array.isArray(v) && positivePrompt) {
				console.warn(
					`[ComfyUI] ⚠️ DEFENSE LEAK SUSPECTED! Consumer node ${nid}(${ct}).inputs.${key} = [SOCKET REF] ${JSON.stringify(v)}, ` +
						`but positivePrompt.length=${positivePrompt.length} (non-empty). Defense-Downstream should have overwritten it to string. ` +
						`Check DEFENSE_TEXT_CONSUMER_CLASS_RE matches the class and key is in POS/NEG keys list.`
				)
			}
			// 旧剧情泄漏检测：任何字符串字段包含 "360°" 或 "全景环绕" 且与传入 positivePrompt 不同，WARN
			if (typeof v === 'string' && positivePrompt && v !== positivePrompt && v.length > 100) {
				const leakSignals = ['全景环绕', '360°', '环绕镜头', '360度环绕']
				if (leakSignals.some((s) => v.includes(s)) && !positivePrompt.includes(v.slice(0, 30))) {
					console.warn(
						`[ComfyUI] ⚠️ OLD CACHE LEAK SUSPECTED! Node ${nid}(${ct}).inputs.${key} contains old cache prompt signal tokens. ` +
							`Snippet (first 200 chars):`,
						v.slice(0, 200)
					)
				}
			}
		}
	}

	const workflowForSubmit = isRecord(resolvedWorkflow) ? resolvedWorkflow : {}
	const clientId = crypto.randomBytes(16).toString('hex')
	const comfyPayload = {
		prompt: promptGraph,
		client_id: clientId,
		extra_data: {
			extra_pnginfo: { workflow: workflowForSubmit },
			create_time: Date.now()
		}
	}

	console.log(
		'[ComfyUI] Submitting prompt, nodes:',
		Object.keys(promptGraph).length,
		'source:',
		promptSource
	)
	for (const [nid, node] of Object.entries(promptGraph)) {
		if (!isRecord(node)) continue
		const inputs = isRecord(node.inputs) ? node.inputs : {}
		const inputSummary = {}
		for (const [k, v] of Object.entries(inputs)) {
			if (
				Array.isArray(v) &&
				v.length === 2 &&
				(typeof v[0] === 'string' || typeof v[0] === 'number') &&
				typeof v[1] === 'number'
			) {
				inputSummary[k] = `[link ${v[0]}:${v[1]}]`
			} else if (typeof v === 'string' && v.length > 80) {
				inputSummary[k] = `${v.slice(0, 80)}...`
			} else {
				inputSummary[k] = v
			}
		}
		console.log(
			`  node[${nid}] class_type=${node.class_type}, inputs:`,
			JSON.stringify(inputSummary)
		)
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
			status: submitResult.status || 502,
			textWriteDiagnostics
		}
	}

	const promptId = String(submitResult.data?.prompt_id || '').trim()
	return {
		ok: true,
		baseUrl: base,
		promptId,
		promptSource,
		result: submitResult.data,
		textWriteDiagnostics
	}
}

export async function runtimeGetOutputs(ctx, payload) {
	const client = ctx.httpClient
	const p = payload || {}
	const { base, error: baseErr } = normalizeBaseUrl(p.baseUrl || getBaseUrl(ctx))
	if (baseErr) return { ok: false, error: baseErr }

	const promptId = String(p.promptId || p.id || '').trim()
	if (!promptId) return { ok: false, error: 'promptId is required' }

	const result = await comfyJsonGet(
		client,
		`${base}/history/${encodeURIComponent(promptId)}`,
		10000
	)
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
	const jobsResult = await comfyJsonGet(
		client,
		`${base}/api/jobs/${encodeURIComponent(jobId)}`,
		10000
	)
	if (!jobsResult.error && isRecord(jobsResult.data)) {
		const statusText = String(jobsResult.data.status || '')
			.trim()
			.toLowerCase()
		const detailText = String(jobsResult.data.detail || jobsResult.data.error || '')
			.trim()
			.toLowerCase()
		if (!statusText && (detailText.includes('not found') || detailText.includes('missing'))) {
			return { ok: true, baseUrl: base, result: { id: jobId, status: 'not_found' } }
		}
		return { ok: true, baseUrl: base, result: jobsResult.data }
	}

	// Fallback to /history/{id}
	const histResult = await comfyJsonGet(
		client,
		`${base}/history/${encodeURIComponent(jobId)}`,
		10000
	)
	if (histResult.error || !isRecord(histResult.data)) {
		return {
			ok: false,
			error: `job status failed: ${jobsResult.error || histResult.error || 'unknown error'}`
		}
	}
	if (!(jobId in histResult.data)) {
		return {
			ok: true,
			baseUrl: base,
			fallback: 'history',
			result: { id: jobId, status: 'not_found' }
		}
	}
	return { ok: true, baseUrl: base, fallback: 'history', result: histResult.data }
}
