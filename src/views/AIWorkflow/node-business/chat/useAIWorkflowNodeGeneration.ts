import type { Store } from 'vuex'
import type {
	WorkflowNodeChatSubmitPayload,
	WorkflowNodeGenerationTask,
	WorkflowState
} from '../../../../aiworkflow/types'
import { ComfyUIBridgeService, type MeshyTaskResponse } from '../../../../network/ComfyUIBridgeService'
import { getErrorMessage } from '../../../../types/utils'

export type NodeGenerationApiDeps = {
	store: Store<WorkflowState>
	comfyService?: ComfyUIBridgeService | null
	resolveBackendUrl: (raw: string) => string
	resolveBackendFetchUrl?: (raw: string) => string
	pushToast?: (message: string, tone?: 'info' | 'warn' | 'error') => void
	/** Bind produced asset url to the originating node, e.g. as its resource. */
	bindImageResultToNode?: (nodeId: string, url: string) => boolean | void | Promise<boolean | void>
	bindVideoResultToNode?: (nodeId: string, url: string) => boolean | void | Promise<boolean | void>
	bindTextResultToNode?: (nodeId: string, text: string) => void
	bindModel3dResultToNode?: (
		nodeId: string,
		url: string,
		format?: string
	) => boolean | void | Promise<boolean | void>
	/**
	 * Resolve a URL to a Blob. In Electron this may route downloads through the
	 * main process to avoid browser CORS for signed CDN URLs. In the browser
	 * it falls back to fetch().
	 */
	downloadUrlAsBlob?: (url: string) => Promise<Blob | null>
	/**
	 * Persist an external asset URL to the project, downloading and storing it locally.
	 */
	persistExternalAssetToProject?: (payload: {
		kind: 'image' | 'video' | 'file'
		name: string
		sourceUrl?: string
		sourcePath?: string
	}) => Promise<{
		url: string
		absolutePath: string
		projectRelativePath?: string
	} | null>
}

// Loose alias for store action callers that don't want to import types directly.
export type NodeGenerationApiDepsAny = NodeGenerationApiDeps

const makeTaskId = () =>
	`node-gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const getComfyService = (deps: NodeGenerationApiDeps) => {
	if (deps.comfyService) return deps.comfyService
	// 页面已经传入 comfyService，通常不会走到这里；
	// 兜底构造的服务不写 baseUrl，以避免路径拼接错误（例如 /api/workflow/api/workflow/...）。
	return new ComfyUIBridgeService({ baseUrl: '' })
}

const pushToast = (
	deps: NodeGenerationApiDeps,
	message: string,
	tone: 'info' | 'warn' | 'error' = 'warn'
) => {
	if (typeof deps.pushToast === 'function') deps.pushToast(message, tone)
}

const updateTask = (
	deps: NodeGenerationApiDeps,
	taskId: string,
	patch: Partial<WorkflowNodeGenerationTask>
) => {
	deps.store.commit('patchNodeGenerationTask', { taskId, patch })
}

const appendDetail = (deps: NodeGenerationApiDeps, taskId: string, line: string) => {
	deps.store.commit('appendNodeGenerationDetail', { taskId, line })
}

const appendResult = (
	deps: NodeGenerationApiDeps,
	taskId: string,
	result: WorkflowNodeGenerationTask['results'][number]
) => {
	deps.store.commit('appendNodeGenerationResult', { taskId, result })
}

/**
 * Collect reference images from the input anchors of a node.
 *
 * Walks the incoming edges of the node. For each edge whose source node
 * carries an image / video resource (identified via `resourceId`),
 * fetches the media as a Blob so it can be uploaded to the backend API.
 *
 * The resolved url is also run through `deps.resolveBackendUrl` to ensure
 * any relative / project-internal URLs are resolved correctly.
 */
const collectReferenceImages = async (
	deps: NodeGenerationApiDeps,
	nodeId: string,
	maxRefs: number = 4
): Promise<Array<{ name: string; blob: Blob }>> => {
	const state = deps.store.state as {
		nodesById: Record<string, Record<string, unknown>>
		edgesById: Record<string, Record<string, unknown>>
		edgeOrder: string[]
		resourcesById: Record<string, Record<string, unknown>>
	}
	const node = state.nodesById[nodeId]
	if (!node) return []

	const incoming: Array<Record<string, unknown>> = []
	for (const edgeId of state.edgeOrder) {
		const edge = state.edgesById[edgeId]
		if (!edge) continue
		if (String(edge.toNodeId ?? '') === String(nodeId)) incoming.push(edge)
	}

	const refs: Array<{ name: string; blob: Blob }> = []
	for (const edge of incoming) {
		if (refs.length >= maxRefs) break
		const sourceNode = state.nodesById[String(edge.fromNodeId ?? '')]
		if (!sourceNode) continue

		const resourceRid = String(sourceNode.resourceId ?? '').trim()
		let candidateUrl: string = ''
		if (resourceRid) {
			const res = state.resourcesById[resourceRid]
			candidateUrl = typeof res?.url === 'string' ? String(res.url) : ''
		}
		if (!candidateUrl) {
			const imageSettings =
				typeof sourceNode.imageSettings === 'object' && sourceNode.imageSettings
					? (sourceNode.imageSettings as Record<string, unknown>)
					: {}
			const lastGenerated =
				typeof imageSettings?.lastGeneratedImageUrl === 'string'
					? String(imageSettings.lastGeneratedImageUrl)
					: ''
			candidateUrl = lastGenerated
		}
		if (!candidateUrl) continue

		const fetchUrl =
			typeof deps.resolveBackendFetchUrl === 'function'
				? deps.resolveBackendFetchUrl(candidateUrl)
				: deps.resolveBackendUrl(candidateUrl)
		try {
			// In Electron, prefer the main-process download (bypasses CORS).
			// In the browser, fall back to direct fetch().
			let blob: Blob | null = null
			if (typeof deps.downloadUrlAsBlob === 'function') {
				blob = await deps.downloadUrlAsBlob(fetchUrl)
			}
			if (!blob) {
				const resp = await fetch(fetchUrl)
				if (!resp.ok) continue
				blob = await resp.blob()
			}
			if (!blob || blob.size === 0) continue
			const name = `ref-${String(sourceNode.type || 'image')}-${String(edge.fromNodeId)}-${Date.now()}.png`
			refs.push({ name, blob })
		} catch {
			continue
		}
	}
	return refs
}

const normalizeImageModel = (params: Record<string, unknown>) => {
	const rawModel = String(params?.imageModel ?? params?.model ?? '').trim()
	// Meshy 图片生成模型
	if (rawModel === 'meshy') {
		const meshyAiModel = String(params?.meshyImageAiModel || 'nano-banana').trim()
		return { kind: 'meshy', model: meshyAiModel }
	}
	if (rawModel.startsWith('jimeng')) return { kind: 'jimeng', model: rawModel }
	if (rawModel.startsWith('nanobanana')) return { kind: 'nanobanana', model: rawModel }
	// When user picks 'seedream' as the interface, the actual model ID is in seedreamModelVersion.
	if (rawModel === 'seedream') {
		const seedreamVersion = String(params?.seedreamModelVersion ?? '').trim()
		return { kind: 'seedream', model: seedreamVersion || 'doubao-seedream-4-5-251128' }
	}
	// Default to seedream (Doubao / 字节方舟) when the user did not pick a provider.
	return { kind: 'seedream', model: rawModel || 'doubao-seedream-4-5-251128' }
}

const normalizeVideoModel = (params: Record<string, unknown>) => {
	const rawModel = String(params?.videoModel ?? params?.model ?? '').trim()
	if (rawModel.startsWith('jimeng')) return { kind: 'jimeng', model: rawModel }
	// When user picks 'seedance' as the interface, the actual model ID is in seedanceModelVersion.
	if (rawModel === 'seedance') {
		const seedanceVersion = String(params?.seedanceModelVersion ?? '').trim()
		return { kind: 'seedance', model: seedanceVersion || 'doubao-seedance-2-0-260128' }
	}
	// Default to seedance (Doubao / 字节方舟) when the user did not pick a provider.
	return { kind: 'seedance', model: rawModel || 'doubao-seedance-2-0-260128' }
}

interface PollingConfig {
	maxPolls: number
	pollInterval: number
	maxConsecutiveErrors: number
}

const enum PollingAction {
	CONTINUE = 'continue',
	STOP = 'stop'
}

type MeshyOutputSummary = {
	preferredUrl: string
	imageUrls: string[]
	thumbnailUrl: string
}

const handleMeshySuccess = async (
	deps: NodeGenerationApiDeps,
	taskId: string,
	generationTaskId: string,
	nodeId: string,
	_taskType: string,
	taskRes: Extract<MeshyTaskResponse, { ok: true }>
) => {
	const imageUrls = taskRes.imageUrls || []
	const preferredUrl = taskRes.preferredImageUrl || imageUrls[0] || ''

	const outputSummary: MeshyOutputSummary = {
		preferredUrl: '',
		imageUrls: [],
		thumbnailUrl: ''
	}

	if (preferredUrl) {
		const resolved = deps.resolveBackendUrl(preferredUrl)

		if (typeof deps.persistExternalAssetToProject === 'function') {
			const fileName = `meshy_${taskId}${String(preferredUrl).match(/\.[^.]+$/)?.[0] || '.png'}`
			const persisted = await deps.persistExternalAssetToProject({
				kind: 'image',
				name: fileName,
				sourceUrl: resolved
			})
			if (persisted) {
				outputSummary.preferredUrl = String(persisted.url || resolved)
				outputSummary.imageUrls = imageUrls.map((u: string) => deps.resolveBackendUrl(u))
				console.log('[Meshy Poll] 资产已持久化:', {
					taskId,
					originalUrl: preferredUrl,
					persistedUrl: persisted.url,
					absolutePath: persisted.absolutePath
				})
			} else {
				console.warn('[Meshy Poll] 资产持久化失败，使用原始URL:', preferredUrl)
			}
		}

		let bound = true
		if (typeof deps.bindImageResultToNode === 'function') {
			const bindRet = await deps.bindImageResultToNode(
				nodeId,
				outputSummary.preferredUrl || resolved
			)
			bound = bindRet !== false
		}
		if (bound) {
			appendResult(deps, generationTaskId, {
				kind: 'image',
				url: outputSummary.preferredUrl || resolved,
				label: 'Meshy 图片'
			})
		}
	}

	deps.store.commit('setNodeImageSettings', {
		nodeId,
		imageSettings: {
			meshyImageSettings: {
				taskId,
				taskStatus: 'succeeded',
				progress: 100,
				statusText: 'Meshy 图片生成完成',
				outputSummary
			}
		}
	})

	updateTask(deps, generationTaskId, {
		status: 'completed',
		statusText: `Meshy 图片生成完成（共 ${imageUrls.length} 张）`,
		progress: 100,
		finishedAt: Date.now()
	})
}

const handleMeshyTaskStatus = async (
	deps: NodeGenerationApiDeps,
	taskId: string,
	generationTaskId: string,
	nodeId: string,
	taskType: string,
	taskRes: MeshyTaskResponse
): Promise<PollingAction> => {
	if (!taskRes.ok) {
		const errorDetails = {
			status: taskRes.status,
			error: taskRes.error,
			taskId,
			taskType
		}
		appendDetail(
			deps,
			generationTaskId,
			`轮询失败（状态码: ${taskRes.status}）：${taskRes.error}`
		)
		console.warn('[Meshy Poll] 轮询失败:', errorDetails)

		if (taskRes.status === 502) {
			appendDetail(deps, generationTaskId, `502 Bad Gateway - 后端服务可能暂时不可用，将重试`)
			pushToast(deps, 'Meshy 服务暂时不可用，正在重试...', 'warn')
		}
		return PollingAction.CONTINUE
	}

	const status = String(taskRes.status || '')
		.trim()
		.toUpperCase()
	const progress = Number(taskRes.progress ?? 0)
	const progressPct = Math.min(95, Math.max(20, progress))

	updateTask(deps, generationTaskId, {
		statusText: `Meshy ${taskType} ${status}（${progress}%）`,
		progress: progressPct
	})

	switch (status) {
		case 'SUCCEEDED':
			await handleMeshySuccess(deps, taskId, generationTaskId, nodeId, taskType, taskRes)
			return PollingAction.STOP

		case 'FAILED': {
			const errorMsg = String(taskRes.errorMessage || '未知错误')
			throw new Error(`Meshy 任务失败：${errorMsg}`)
		}

		case 'CANCELED':
			throw new Error('Meshy 任务已取消')

		default:
			return PollingAction.CONTINUE
	}
}

const createPollingController = async <T>(
	config: PollingConfig,
	deps: NodeGenerationApiDeps,
	generationTaskId: string,
	taskId: string,
	taskType: string,
	pollFn: () => Promise<T>,
	handleFn: (result: T) => Promise<PollingAction>
): Promise<void> => {
	let consecutiveErrors = 0

	for (let i = 0; i < config.maxPolls; i++) {
		await new Promise((r) => setTimeout(r, config.pollInterval))

		try {
			const result = await pollFn()
			consecutiveErrors = 0

			const action = await handleFn(result)

			if (action === PollingAction.STOP) {
				return
			}
		} catch (err: unknown) {
			const errMsg = getErrorMessage(err)
			if (errMsg.includes('失败') || errMsg.includes('取消')) {
				throw err
			}

			consecutiveErrors++
			const errorDetails = {
				message: errMsg,
				taskId,
				taskType,
				attempt: i + 1,
				consecutiveErrors,
				timestamp: Date.now()
			}

			appendDetail(
				deps,
				generationTaskId,
				`轮询异常（第${i + 1}次，连续${consecutiveErrors}次）：${errMsg}`
			)
			console.error('[Meshy Poll] 轮询异常:', errorDetails)

			if (consecutiveErrors >= 5) {
				pushToast(
					deps,
					`Meshy 轮询连续失败${consecutiveErrors}次，请检查网络连接或后端服务状态。`,
					'warn'
				)
			}

			if (consecutiveErrors >= config.maxConsecutiveErrors) {
				throw err
			}
		}
	}

	throw new Error('Meshy 任务超时')
}

/**
 * 轮询 Meshy 任务状态直到完成
 */
const pollMeshyTaskStatus = async (
	deps: NodeGenerationApiDeps,
	svc: ComfyUIBridgeService,
	taskId: string,
	generationTaskId: string,
	nodeId: string,
	taskType: string
) => {
	const config: PollingConfig = {
		maxPolls: 120,
		pollInterval: 2000,
		maxConsecutiveErrors: 10
	}

	await createPollingController(
		config,
		deps,
		generationTaskId,
		taskId,
		taskType,
		() => svc.meshyTask(taskId, taskType),
		(taskRes) => handleMeshyTaskStatus(deps, taskId, generationTaskId, nodeId, taskType, taskRes)
	)
}

const createTask = (payload: WorkflowNodeChatSubmitPayload): WorkflowNodeGenerationTask => ({
	id: makeTaskId(),
	nodeId: payload.nodeId,
	nodeType: payload.nodeType,
	status: 'submitting',
	statusText: '正在提交任务…',
	progress: 5,
	startedAt: Date.now(),
	results: [],
	detailLines: []
})

export type NodeGenerationResult = {
	ok: boolean
	taskId?: string
	taskType?: 'meshy-3d' | 'meshy-image' | 'other'
	mode?: string
	error?: string
}

export const runNodeGenerationTask = async (
	deps: NodeGenerationApiDeps,
	payload: WorkflowNodeChatSubmitPayload
): Promise<NodeGenerationResult> => {
	const node = deps.store.state.nodesById[payload.nodeId]
	if (!node) {
		pushToast(deps, '未找到对应节点，无法发起生成任务。', 'error')
		return { ok: false, error: '未找到对应节点' }
	}
	if (!payload.prompt.trim() && payload.nodeType !== 'model3d') {
		pushToast(deps, '请先填写提示词再发起生成。', 'warn')
		return { ok: false, error: '提示词为空' }
	}

	const task = createTask(payload)
	deps.store.commit('registerNodeGenerationTask', { task })
	deps.store.commit('setNodeChatSubmitting', { submitting: true })

	try {
		if (payload.nodeType === 'text') {
			await runTextTask(deps, task, payload)
			return { ok: true, taskType: 'other' }
		} else if (payload.nodeType === 'image') {
			const params = payload.params ?? {}
			const { kind } = normalizeImageModel(params)
			await runImageTask(deps, task, payload)
			return { ok: true, taskType: kind === 'meshy' ? 'meshy-image' : 'other' }
		} else if (payload.nodeType === 'video') {
			await runVideoTask(deps, task, payload)
			return { ok: true, taskType: 'other' }
		} else if (payload.nodeType === 'model3d') {
			const params = payload.params ?? {}
			const provider = String(params.provider || '').trim()
			if (provider === 'meshy') {
				const result = await runModel3dMeshyTask(deps, task, payload)
				return {
					ok: result.ok,
					taskId: result.taskId,
					taskType: 'meshy-3d',
					mode: result.mode,
					error: result.error
				}
			} else {
				runModel3dStub(deps, task, payload)
				return { ok: false, error: '不支持的 3D 生成提供商' }
			}
		}
		return { ok: true, taskType: 'other' }
	} catch (err: unknown) {
		const raw = getErrorMessage(err)
		// 典型的浏览器网络错误（后端未启、CORS 被拒、或断网）给出更明确的中文提示。
		const looksLikeNetworkError =
			/Failed to fetch/i.test(raw) ||
			/NetworkError/i.test(raw) ||
			/TypeError.*fetch/i.test(raw) ||
			/CORS/i.test(raw) ||
			/Failed to connect/i.test(raw) ||
			/ECONNREFUSED/i.test(raw)
		const message = looksLikeNetworkError
			? `后端不可达（${raw}）。请确认 django-app 已在 127.0.0.1:5800 启动，或在 Settings 页面设置正确的后端地址。`
			: raw
		appendDetail(deps, task.id, message)
		updateTask(deps, task.id, {
			status: 'error',
			statusText: `失败：${message}`,
			errorMessage: message,
			finishedAt: Date.now()
		})
		pushToast(deps, `${labelForType(payload.nodeType)}生成失败：${message}`, 'error')
		return { ok: false, error: message }
	} finally {
		deps.store.commit('setNodeChatSubmitting', { submitting: false })
	}
}

const labelForType = (t: WorkflowNodeGenerationTask['nodeType']) => {
	if (t === 'text') return '文本'
	if (t === 'image') return '图片'
	if (t === 'video') return '视频'
	return '3D 模型'
}

const runTextTask = async (
	deps: NodeGenerationApiDeps,
	task: WorkflowNodeGenerationTask,
	payload: WorkflowNodeChatSubmitPayload
) => {
	const svc = getComfyService(deps)
	updateTask(deps, task.id, {
		status: 'running',
		statusText: '正在调用文本模型（字节方舟 Doubao）…',
		progress: 15
	})
	appendDetail(deps, task.id, `提示词：${payload.prompt.slice(0, 120)}`)

	// Default provider is "bytedance" (Doubao). User params may override to "deepseek".
	const params = payload.params ?? {}
	const provider = String(params.model ?? params.provider ?? 'bytedance').toLowerCase()
	const modelId =
		String(params.modelId ?? params.textModelVersion ?? '').trim() ||
		(provider === 'deepseek' ? 'deepseek-chat' : 'doubao-seed-2-0-pro-260215')
	const body: Record<string, unknown> = { content: payload.prompt, provider, modelId }
	if (params.speed) body.speed = params.speed
	if (params.thinking) body.thinking = params.thinking
	if (params.responseFormat) body.responseFormat = params.responseFormat
	if (params.maxTokens) body.maxTokens = params.maxTokens

	let accumulated = ''
	try {
			for await (const ev of (svc as ComfyUIBridgeService).blueprintChatStream({
				content: String(body.content ?? ''),
				history: body.history as Array<{ role: 'user' | 'assistant' | 'system'; content: string }> | undefined
			})) {
			if (ev.type === 'done') break
			if (ev.type === 'error') {
				throw new Error(String(ev.error?.message ?? 'unknown'))
			}
			const message = ev.message as Record<string, unknown>
			if (message?.type === 'agentToUi/text') {
				const payload =
					typeof message.payload === 'object' && message.payload
						? (message.payload as Record<string, unknown>)
						: {}
				const delta = String(payload.text ?? '')
				if (delta) accumulated += delta
				updateTask(deps, task.id, {
					progress: Math.min(75, task.progress + 2),
					statusText: '文本模型正在生成内容…'
				})
				continue
			}
			if (message?.type === 'agentToUi/taskStatus') {
				const payload =
					typeof message.payload === 'object' && message.payload
						? (message.payload as Record<string, unknown>)
						: {}
				const line = String(payload.message ?? payload.phase ?? '')
				if (line) appendDetail(deps, task.id, line)
				continue
			}
		}
	} catch (err: unknown) {
		// Fallback: attempt simple non-streaming endpoint to keep the node task observable.
		const fallbackMsg = getErrorMessage(err)
		appendDetail(deps, task.id, `流式调用失败：${fallbackMsg}`)
		updateTask(deps, task.id, { status: 'running', statusText: '尝试失败回退…' })
		try {
			const plain = await (svc as ComfyUIBridgeService).blueprintChat({
				content: String(body.content ?? ''),
				history: body.history as Array<{ role: 'user' | 'assistant' | 'system'; content: string }> | undefined
			})
			const text =
				plain.ok && typeof plain.assistant === 'string'
					? plain.assistant
					: ''
			if (text) accumulated = text
		} catch (fallbackErr: unknown) {
			appendDetail(deps, task.id, `兜底请求失败：${getErrorMessage(fallbackErr)}`)
			throw err
		}
	}

	const finalText = accumulated.trim()
	if (!finalText) throw new Error('文本模型返回为空')
	appendResult(deps, task.id, { kind: 'text', url: '', label: finalText.slice(0, 80) })
	if (typeof deps.bindTextResultToNode === 'function')
		deps.bindTextResultToNode(payload.nodeId, finalText)
	updateTask(deps, task.id, {
		status: 'completed',
		statusText: '文本生成完成',
		progress: 100,
		finishedAt: Date.now()
	})
}

const runImageTask = async (
	deps: NodeGenerationApiDeps,
	task: WorkflowNodeGenerationTask,
	payload: WorkflowNodeChatSubmitPayload
) => {
	const svc = getComfyService(deps)
	const params = payload.params ?? {}
	const { kind, model } = normalizeImageModel(params)
	updateTask(deps, task.id, {
		status: 'running',
		statusText: `正在调用图片模型（${kind}）…`,
		progress: 15
	})
	appendDetail(deps, task.id, `模型：${model}`)
	appendDetail(deps, task.id, `提示词：${payload.prompt.slice(0, 120)}`)

	const form = new FormData()
	form.set('prompt', payload.prompt)
	form.set('imageModel', model)
	if (typeof params.aspectRatio === 'string' && params.aspectRatio)
		form.set('aspectRatio', params.aspectRatio)
	if (typeof params.resolution === 'string' && params.resolution)
		form.set('resolution', params.resolution)
	const quantity = Number(params.quantity ?? 1)
	if (Number.isFinite(quantity) && quantity > 0)
		form.set('quantity', String(Math.min(8, Math.max(1, Math.floor(quantity)))))

	// Collect connected reference images for meshy image-to-image or seedream.
	const refs = await collectReferenceImages(deps, payload.nodeId, 5)
	const hasRefImages = refs.length > 0

	// Meshy 图片生成任务（异步任务模式，非流式）
	if (kind === 'meshy') {
		const meshyAiModel = String(params?.meshyImageAiModel || model || 'nano-banana').trim()
		const meshyAspectRatio = String(params?.meshyAspectRatio || params?.aspectRatio || '1:1').trim()
		const meshyPoseMode = String(params?.meshyPoseMode || '').trim()
		const meshyGenerateMultiView = Boolean(params?.meshyGenerateMultiView)
		const meshyNegativePrompt = String(params?.meshyNegativePrompt || '').trim()
		const meshySeed = Number(params?.meshySeed ?? 0)
		const taskType = hasRefImages ? 'image-to-image' : 'text-to-image'

		appendDetail(deps, task.id, `Meshy 模式：${taskType}`)
		appendDetail(deps, task.id, `AI 模型：${meshyAiModel}`)

		try {
			// 构建 Meshy API 请求体
			const meshyPayload: Record<string, unknown> = {
				mode: taskType,
				ai_model: meshyAiModel,
				prompt: payload.prompt,
				negative_prompt: meshyNegativePrompt,
				output_image_count: quantity
			}

			if (!hasRefImages) {
				// text-to-image 参数
				if (meshyAspectRatio) meshyPayload.aspect_ratio = meshyAspectRatio
				if (meshyPoseMode) meshyPayload.pose_mode = meshyPoseMode
				if (meshyGenerateMultiView) meshyPayload.generate_multi_view = true
			}

			if (Number.isFinite(meshySeed) && meshySeed > 0) {
				meshyPayload.seed = meshySeed
			}

			updateTask(deps, task.id, { statusText: `正在创建 Meshy ${taskType} 任务…`, progress: 20 })

			// 如果有参考图，需要先上传或转换为 URL
			if (hasRefImages) {
				const refForm = new FormData()
				for (const key of Object.keys(meshyPayload)) {
					refForm.set(key, String(meshyPayload[key]))
				}
				for (const ref of refs) {
					refForm.append('refImages', ref.blob, ref.name)
				}
				const createRes = await svc.meshyGenerateImage(refForm)
				if (!createRes.ok) {
					throw new Error(String(createRes.error || 'Meshy 任务创建失败'))
				}
				const taskId = String(createRes.taskId || '').trim()
				if (!taskId) throw new Error('Meshy 返回空任务 ID')
				appendDetail(deps, task.id, `任务已创建：${taskId}`)

				// 标记图片节点的 imageGenerationSource 为 meshy，使任务面板能找到该节点
				deps.store.commit('setNodeImageSettings', {
					nodeId: payload.nodeId,
					imageSettings: {
						imageGenerationSource: 'meshy',
						meshyImageSettings: {
							taskId,
							taskStatus: 'pending',
							taskFamily: taskType,
							progress: 20,
							statusText: `Meshy ${taskType} 任务已创建`
						}
					}
				})

				// 轮询任务状态
				await pollMeshyTaskStatus(deps, svc, taskId, task.id, payload.nodeId, taskType)
			} else {
				const createRes = await svc.meshyGenerate(meshyPayload)
				if (!createRes.ok) {
					throw new Error(String(createRes.error || 'Meshy 任务创建失败'))
				}
				const taskId = String(createRes.taskId || '').trim()
				if (!taskId) throw new Error('Meshy 返回空任务 ID')
				appendDetail(deps, task.id, `任务已创建：${taskId}`)

				// 标记图片节点的 imageGenerationSource 为 meshy
				deps.store.commit('setNodeImageSettings', {
					nodeId: payload.nodeId,
					imageSettings: {
						imageGenerationSource: 'meshy',
						meshyImageSettings: {
							taskId,
							taskStatus: 'pending',
							taskFamily: taskType,
							progress: 20,
							statusText: `Meshy ${taskType} 任务已创建`
						}
					}
				})

				// 轮询任务状态
				await pollMeshyTaskStatus(deps, svc, taskId, task.id, payload.nodeId, taskType)
			}

			return
		} catch (err: unknown) {
			const errMsg = getErrorMessage(err)
			pushToast(deps, `Meshy 生成失败：${errMsg}`, 'error')
			updateTask(deps, task.id, {
				status: 'error',
				statusText: `失败：${errMsg}`,
				progress: 0,
				finishedAt: Date.now()
			})
			throw err
		}
	}

	// Collect connected reference images (anchor-based input) for seedream image-to-image.
	if (kind === 'seedream') {
		for (const ref of refs) form.append('refImages', ref.blob, ref.name)
	}

	const stream =
		kind === 'jimeng'
			? svc.jimengImageGenerateStream(form)
			: kind === 'nanobanana'
				? svc.nanoBananaGenerateStream(form)
				: svc.seedreamGenerateStream(form)

	let produced = 0
	for await (const ev of stream) {
		if (ev.type === 'done') break
		if (ev.type === 'error') {
			const message = String(ev.error?.message ?? 'unknown')
			throw new Error(message)
		}
		const message = ev.message as Record<string, unknown>
		if (message?.type === 'agentToUi/chatMessage') {
			const msgPayload =
				typeof message.payload === 'object' && message.payload
					? (message.payload as Record<string, unknown>)
					: {}
			const obj: Record<string, unknown> | null = (() => {
				try {
					const raw = String(msgPayload.content ?? '')
					return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
				} catch {
					return null
				}
			})()
			if (obj && typeof obj.imageUrl === 'string') {
				const sourceUrl = String(obj.imageUrl || '').trim()
				if (!sourceUrl) continue
				let bound = true
				if (typeof deps.bindImageResultToNode === 'function') {
					const bindRet = await deps.bindImageResultToNode(payload.nodeId, sourceUrl)
					bound = bindRet !== false
				}
				if (!bound) {
					appendDetail(deps, task.id, '图片结果已返回，但导入本地资产失败，已跳过远程地址渲染。')
					continue
				}
				const resolved = deps.resolveBackendUrl(sourceUrl)
				appendResult(deps, task.id, { kind: 'image', url: resolved, label: `图 ${produced + 1}` })
				produced += 1
				updateTask(deps, task.id, {
					status: 'running',
					statusText: `已接收图片 ${produced} 张`,
					progress: Math.min(95, 40 + produced * 12)
				})
			}
			continue
		}
		if (message?.type === 'agentToUi/taskStatus') {
			const payload =
				typeof message.payload === 'object' && message.payload
					? (message.payload as Record<string, unknown>)
					: {}
			const line = String(payload.message ?? payload.phase ?? '')
			if (line) appendDetail(deps, task.id, line)
			continue
		}
		if (message?.type === 'agentToUi/error') {
			const payload =
				typeof message.payload === 'object' && message.payload
					? (message.payload as Record<string, unknown>)
					: {}
			const line = String(payload.message ?? 'unknown')
			throw new Error(line)
		}
	}

	if (produced === 0) throw new Error('未接收到图片结果，请检查 API 配置与提示词')
	updateTask(deps, task.id, {
		status: 'completed',
		statusText: `图片生成完成（共 ${produced} 张）`,
		progress: 100,
		finishedAt: Date.now()
	})
}

const runVideoTask = async (
	deps: NodeGenerationApiDeps,
	task: WorkflowNodeGenerationTask,
	payload: WorkflowNodeChatSubmitPayload
) => {
	const svc = getComfyService(deps)
	const params = payload.params ?? {}
	const { kind, model } = normalizeVideoModel(params)
	updateTask(deps, task.id, {
		status: 'running',
		statusText: `正在调用视频模型（${kind}）…`,
		progress: 20
	})
	appendDetail(deps, task.id, `模型：${model}`)
	appendDetail(deps, task.id, `提示词：${payload.prompt.slice(0, 120)}`)

	const form = new FormData()
	form.set('prompt', payload.prompt)
	form.set('model', model)
	if (typeof params.mode === 'string' && params.mode) form.set('mode', params.mode)
	if (typeof params.ratio === 'string' && params.ratio) form.set('ratio', params.ratio)
	if (typeof params.resolution === 'string' && params.resolution)
		form.set('resolution', params.resolution)
	const duration = Number(params.duration ?? 5)
	if (Number.isFinite(duration) && duration > 0)
		form.set('duration', String(Math.min(30, Math.max(1, Math.floor(duration)))))
	if (typeof params.seed === 'number' && Number.isFinite(params.seed))
		form.set('seed', String(params.seed))
	form.set('generateAudio', params.generateAudio ? '1' : '0')
	form.set('watermark', params.watermark ? '1' : '0')

	// Collect connected reference images from input anchors for seedance i2v/r2v.
	if (kind === 'seedance') {
		const refs = await collectReferenceImages(deps, payload.nodeId, 4)
		for (const ref of refs) form.append('refImages', ref.blob, ref.name)
		// Map the panel's "video mode" to the backend refMode semantics:
		//   image_to_video → first (use single anchor image as first frame)
		//   first-last     → first-last
		//   reference      → reference (multi-reference, e.g. consistent character)
		//   text_to_video / auto → auto
		const rawMode = typeof params.mode === 'string' ? params.mode : ''
		if (rawMode === 'image_to_video') form.set('refMode', 'first')
		else if (rawMode === 'first-last') form.set('refMode', 'first-last')
		else if (rawMode === 'reference') form.set('refMode', 'reference')
		else form.set('refMode', 'auto')
	}

	const stream =
		kind === 'jimeng'
			? svc.jimengVideoGenerateStream(form)
			: svc.seedanceGenerateStream(form)

	let produced = 0
	for await (const ev of stream) {
		if (ev.type === 'done') break
		if (ev.type === 'error') {
			const message = String(ev.error?.message ?? 'unknown')
			throw new Error(message)
		}
		const message = ev.message as Record<string, unknown>
		if (message?.type === 'agentToUi/chatMessage') {
			const msgPayload =
				typeof message.payload === 'object' && message.payload
					? (message.payload as Record<string, unknown>)
					: {}
			const obj: Record<string, unknown> | null = (() => {
				try {
					const raw = String(msgPayload.content ?? '')
					return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
				} catch {
					return null
				}
			})()
			if (obj) {
				const urlRaw = String(obj.videoUrl ?? obj.videoUrlRemote ?? obj.url ?? '').trim()
				const url = deps.resolveBackendUrl(urlRaw)
				const downloadStatus = String(obj.downloadStatus ?? '').trim()
				const progressRaw = Number(obj.downloadProgress ?? 0)
				const progress = Number.isFinite(progressRaw)
					? Math.max(0, Math.min(100, Math.round(progressRaw)))
					: task.progress
				if (urlRaw) {
					let bound = true
					if (typeof deps.bindVideoResultToNode === 'function') {
						const bindRet = await deps.bindVideoResultToNode(payload.nodeId, urlRaw)
						bound = bindRet !== false
					}
					if (!bound) {
						appendDetail(deps, task.id, '视频结果已返回，但导入本地资产失败，已跳过远程地址渲染。')
						continue
					}
					appendResult(deps, task.id, { kind: 'video', url, label: '视频结果' })
					produced += 1
				}
				updateTask(deps, task.id, {
					status: produced > 0 ? 'completed' : 'running',
					statusText: downloadStatus || (produced > 0 ? '视频结果已就绪' : '任务处理中…'),
					progress,
					...(produced > 0 ? { finishedAt: Date.now() } : {})
				})
			}
			continue
		}
		if (message?.type === 'agentToUi/taskStatus') {
			const msgPayload =
				typeof message.payload === 'object' && message.payload
					? (message.payload as Record<string, unknown>)
					: {}
			const line = String(msgPayload.message ?? msgPayload.phase ?? '')
			if (line) {
				appendDetail(deps, task.id, line)
				updateTask(deps, task.id, {
					status: 'running',
					statusText: line,
					progress: Math.min(80, task.progress + 2)
				})
			}
			continue
		}
		if (message?.type === 'agentToUi/error') {
			const msgPayload =
				typeof message.payload === 'object' && message.payload
					? (message.payload as Record<string, unknown>)
					: {}
			const line = String(msgPayload.message ?? 'unknown')
			throw new Error(line)
		}
	}

	if (produced === 0) throw new Error('未接收到视频结果，请检查 API 配置与提示词')
	updateTask(deps, task.id, {
		status: 'completed',
		statusText: '视频生成完成',
		progress: 100,
		finishedAt: Date.now()
	})
}

const pollMeshy3DTaskStatus = async (
	deps: NodeGenerationApiDeps,
	svc: ComfyUIBridgeService,
	taskId: string,
	generationTaskId: string,
	nodeId: string,
	taskMode: string,
	outputFormat: string
) => {
	const maxPolls = 180
	const pollInterval = 3000
	let consecutiveErrors = 0

	for (let i = 0; i < maxPolls; i++) {
		await new Promise((r) => setTimeout(r, pollInterval))

		try {
			const taskRes = await svc.meshyTask(taskId, taskMode)

			consecutiveErrors = 0

			if (!taskRes.ok) {
				appendDetail(
					deps,
					generationTaskId,
					`轮询失败（状态码: ${taskRes.status}）：${taskRes.error}`
				)
				console.warn('[Meshy 3D Poll] 轮询失败:', {
					status: taskRes.status,
					error: taskRes.error,
					taskId,
					taskMode
				})
				continue
			}

			const status = String(taskRes.status || '')
				.trim()
				.toUpperCase()
			const progress = Number(taskRes.progress ?? 0)
			const progressPct = status === 'SUCCEEDED' ? 100 : Math.min(99, Math.max(10, progress))

			const statusText = `Meshy 3D ${taskMode} ${status}（${progress}%）`

			updateTask(deps, generationTaskId, {
				statusText,
				progress: progressPct
			})

			// 同步更新 meshyModelSettings（绿色进度条）
			const meshyStatus = (() => {
				const s = status.toLowerCase()
				if (s === 'succeeded' || s === 'success' || s === 'completed') return 'succeeded' as const
				if (s === 'failed' || s === 'error') return 'failed' as const
				if (s === 'cancelled' || s === 'canceled') return 'canceled' as const
				if (s === 'pending' || s === 'queued') return 'pending' as const
				return 'running' as const
			})()

			deps.store.commit('setNodeModel3DSettings', {
				nodeId,
				model3dSettings: {
					meshyModelSettings: {
						taskId,
						taskStatus: meshyStatus,
						taskFamily: taskMode,
						progress: progressPct,
						statusText
					}
				}
			})

			if (status === 'SUCCEEDED') {
				const modelUrls =
					taskRes.modelUrls && typeof taskRes.modelUrls === 'object' ? taskRes.modelUrls : {}
				const preferredModelUrl = String(taskRes.preferredModelUrl || '').trim()
				const thumbnailUrl = String(taskRes.thumbnailUrl || '').trim()

				let finalModelUrl = preferredModelUrl
				let finalFormat = outputFormat || 'glb'

				if (!finalModelUrl) {
					const urlKeys = Object.keys(modelUrls)
					if (urlKeys.length > 0) {
						const priorityOrder = ['glb', 'gltf', 'obj', 'fbx', 'usdz', 'stl']
						for (const key of priorityOrder) {
							if (modelUrls[key]) {
								finalModelUrl = String(modelUrls[key])
								finalFormat = key
								break
							}
						}
						if (!finalModelUrl) {
							finalModelUrl = String(modelUrls[urlKeys[0]])
							finalFormat = urlKeys[0]
						}
					}
				}

				if (!finalModelUrl) {
					throw new Error('Meshy 任务成功但未返回模型 URL')
				}

				const resolvedUrl = deps.resolveBackendUrl(finalModelUrl)

				let persistedUrl = resolvedUrl
				let persistedAssetPath = ''
				let persistFailed = false

				if (typeof deps.persistExternalAssetToProject === 'function') {
					try {
						const urlObj = finalModelUrl.split('?')[0]
						const extMatch = urlObj.match(/\.[^.]+$/)
						const ext = extMatch ? extMatch[0] : `.${finalFormat}`
						const fileName = `meshy-3d-${taskId}${ext}`
						const persisted = await deps.persistExternalAssetToProject({
							kind: 'file',
							name: fileName,
							sourceUrl: resolvedUrl
						})
						if (persisted) {
							persistedUrl = String(persisted.url || resolvedUrl)
							persistedAssetPath = persisted.projectRelativePath || persisted.absolutePath || ''
							console.log('[Meshy 3D Poll] 资产已持久化:', { taskId, persistedUrl })
						} else {
							persistFailed = true
						}
					} catch (e) {
						persistFailed = true
						console.warn('[Meshy 3D Poll] 资产持久化失败:', e)
					}
				}

				let bound = true
				if (typeof deps.bindModel3dResultToNode === 'function') {
					try {
						const bindRet = await deps.bindModel3dResultToNode(nodeId, persistedUrl, finalFormat)
						bound = bindRet !== false
					} catch (e) {
						bound = false
						console.warn('[Meshy 3D Poll] 绑定模型到节点失败:', e)
					}
				}
				if (bound) {
					appendResult(deps, generationTaskId, {
						kind: 'model3d',
						url: persistedUrl,
						label: `Meshy 3D 模型 (${finalFormat})`
					})
				}

				if (thumbnailUrl) {
					const resolvedThumb = deps.resolveBackendUrl(thumbnailUrl)
					appendResult(deps, generationTaskId, {
						kind: 'image',
						url: resolvedThumb,
						label: '模型预览图'
					})
				}

				const fetchSucceeded = bound && !persistFailed

				deps.store.commit('setNodeModel3DSettings', {
					nodeId,
					model3dSettings: {
						modelGenerationSource: 'meshy',
						modelUrl: fetchSucceeded ? persistedUrl : '',
						modelAssetUrl: fetchSucceeded ? persistedUrl : '',
						modelAssetPath: fetchSucceeded ? persistedAssetPath : '',
						modelFormat: finalFormat,
						meshyModelSettings: {
							taskId,
							taskStatus: fetchSucceeded ? 'succeeded' : 'fetch-failed',
							taskFamily: taskMode,
							progress: 100,
							statusText: fetchSucceeded
								? 'Meshy 3D 模型生成完成'
								: 'Meshy 3D 模型生成完成，但拉取失败',
							errorMessage: fetchSucceeded
								? ''
								: '模型文件拉取失败，请点击重试或在任务面板中手动拉取',
							outputSummary: {
								preferredUrl: persistedUrl,
								assetUrl: persistedUrl,
								thumbnailUrl: deps.resolveBackendUrl(thumbnailUrl),
								format: finalFormat
							}
						}
					}
				})

				updateTask(deps, generationTaskId, {
					status: fetchSucceeded ? 'completed' : 'completed',
					statusText: fetchSucceeded
						? `Meshy 3D 模型生成完成`
						: `Meshy 3D 模型生成完成，但拉取失败`,
					progress: 100,
					finishedAt: Date.now()
				})
				return
			}

			if (status === 'FAILED') {
				const errorMsg = String(taskRes.errorMessage || '未知错误')
				throw new Error(`Meshy 3D 任务失败：${errorMsg}`)
			}

			if (status === 'CANCELED') {
				throw new Error('Meshy 3D 任务已取消')
			}
		} catch (err: unknown) {
			const errMsg = getErrorMessage(err)
			if (errMsg.includes('失败') || errMsg.includes('取消') || errMsg.includes('未返回模型 URL')) {
				throw err
			}

			consecutiveErrors++
			appendDetail(
				deps,
				generationTaskId,
				`轮询异常（第${i + 1}次，连续${consecutiveErrors}次）：${errMsg}`
			)
			console.error('[Meshy 3D Poll] 轮询异常:', {
				message: errMsg,
				taskId,
				taskMode,
				attempt: i + 1,
				consecutiveErrors
			})

			if (consecutiveErrors >= 10) {
				throw new Error(`Meshy 3D 任务轮询连续失败 ${consecutiveErrors} 次，任务中止`)
			}
		}
	}

	throw new Error('Meshy 3D 任务超时（超过最大轮询次数）')
}

const blobToBase64DataUri = async (blob: Blob): Promise<string> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result || ''))
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(blob)
	})
}

const runModel3dMeshyTask = async (
	deps: NodeGenerationApiDeps,
	task: WorkflowNodeGenerationTask,
	payload: WorkflowNodeChatSubmitPayload
): Promise<{ ok: boolean; taskId?: string; mode?: string; error?: string }> => {
	const svc = getComfyService(deps)
	const params = payload.params ?? {}

	const meshyMode = String(params.meshyMode || 'text-to-3d').trim()
	const meshyAiModel = String(params.meshyAiModel || 'latest').trim()
	const meshyModelType = String(params.meshyModelType || 'standard').trim()
	const meshyOutputFormat = String(params.meshyOutputFormat || 'glb').trim()
	const meshyTopology = String(params.meshyTopology || '').trim()
	const meshySymmetryMode = String(params.meshySymmetryMode || '').trim()
	const meshyOriginAt = String(params.meshyOriginAt || '').trim()
	const meshyPoseMode = String(params.meshyPoseMode || '').trim()
	const meshySeed = Number(params.meshySeed ?? -1)

	updateTask(deps, task.id, {
		status: 'running',
		statusText: `正在创建 Meshy 3D 任务（${meshyMode}）…`,
		progress: 10
	})
	appendDetail(deps, task.id, `模式：${meshyMode}`)
	appendDetail(deps, task.id, `AI 模型：${meshyAiModel}`)
	appendDetail(deps, task.id, `输出格式：${meshyOutputFormat}`)
	if (payload.prompt) appendDetail(deps, task.id, `提示词：${payload.prompt.slice(0, 120)}`)

	try {
		const meshyPayload: Record<string, unknown> = {
			mode: meshyMode,
			ai_model: meshyAiModel
		}

		if (payload.prompt) {
			meshyPayload.prompt = payload.prompt
		}

		if (meshyModelType) meshyPayload.model_type = meshyModelType
		if (meshyTopology) meshyPayload.topology = meshyTopology
		if (meshySymmetryMode) meshyPayload.symmetry_mode = meshySymmetryMode
		if (meshyOriginAt) meshyPayload.origin_at = meshyOriginAt
		if (meshyPoseMode) meshyPayload.pose_mode = meshyPoseMode
		if (meshyOutputFormat) meshyPayload.output_format = meshyOutputFormat
		if (meshySeed > 0) meshyPayload.seed = meshySeed

		let refImages: Array<{ name: string; blob: Blob }> = []
		let imageDataUris: string[] = []
		let maxRefs = 1

		if (meshyMode === 'image-to-3d') {
			maxRefs = 1
		} else if (meshyMode === 'multi-image-to-3d') {
			maxRefs = 4
		}

		if (meshyMode === 'image-to-3d' || meshyMode === 'multi-image-to-3d') {
			refImages = await collectReferenceImages(deps, payload.nodeId, maxRefs)

			if (refImages.length === 0 && meshyMode === 'image-to-3d') {
				throw new Error('图生3D 模式需要连接至少一张图片输入')
			}

			if (refImages.length === 0 && meshyMode === 'multi-image-to-3d') {
				throw new Error('多图生3D 模式需要连接图片输入（1-4 张）')
			}

			appendDetail(deps, task.id, `参考图片数量：${refImages.length}`)

			for (const ref of refImages) {
				try {
					const dataUri = await blobToBase64DataUri(ref.blob)
					if (dataUri) imageDataUris.push(dataUri)
				} catch {
					// skip failed images
				}
			}

			if (imageDataUris.length === 0) {
				throw new Error('参考图片读取失败，请检查图片是否有效')
			}

			if (meshyMode === 'image-to-3d') {
				meshyPayload.image_url = imageDataUris[0]
			} else if (meshyMode === 'multi-image-to-3d') {
				meshyPayload.image_urls = imageDataUris
			}
		}

		updateTask(deps, task.id, { statusText: `正在提交 Meshy 3D 任务…`, progress: 15 })

		const createRes = await svc.meshyGenerate(meshyPayload)

		if (!createRes.ok) {
			throw new Error(String(createRes.error || 'Meshy 3D 任务创建失败'))
		}

		const meshyTaskId = String(createRes.taskId || '').trim()
		if (!meshyTaskId) throw new Error('Meshy 返回空任务 ID')

		appendDetail(deps, task.id, `任务已创建：${meshyTaskId}`)

		deps.store.commit('setNodeModel3DSettings', {
			nodeId: payload.nodeId,
			model3dSettings: {
				modelGenerationSource: 'meshy',
				meshyModelSettings: {
					taskId: meshyTaskId,
					taskStatus: 'pending',
					taskFamily: meshyMode,
					progress: 15,
					statusText: `Meshy 3D ${meshyMode} 任务已创建`,
					imageCount: refImages.length,
					imageUrls: imageDataUris,
					prompt: payload.prompt
				}
			}
		})

		updateTask(deps, task.id, {
			status: 'running',
			statusText: `Meshy 3D 任务已提交，等待处理…`,
			progress: 15
		})

		// 启动 Meshy 3D 任务轮询（异步，不阻塞返回）
		void pollMeshy3DTaskStatus(
			deps,
			svc,
			meshyTaskId,
			task.id,
			payload.nodeId,
			meshyMode,
			meshyOutputFormat
		)

		return { ok: true, taskId: meshyTaskId, mode: meshyMode }
	} catch (err: unknown) {
		const errMsg = getErrorMessage(err)
		pushToast(deps, `Meshy 3D 生成失败：${errMsg}`, 'error')
		updateTask(deps, task.id, {
			status: 'error',
			statusText: `失败：${errMsg}`,
			progress: 0,
			finishedAt: Date.now()
		})
		return { ok: false, error: errMsg }
	}
}

const runModel3dStub = (
	deps: NodeGenerationApiDeps,
	task: WorkflowNodeGenerationTask,
	payload: WorkflowNodeChatSubmitPayload
) => {
	appendDetail(
		deps,
		task.id,
		'3D 模型节点暂不直接调用字节方舟接口，请使用 Meshy 节点或本地 ComfyUI 流程。'
	)
	updateTask(deps, task.id, {
		status: 'error',
		statusText: '当前节点类型尚未支持直接提交',
		errorMessage: '3D 生成请使用 Meshy 节点',
		finishedAt: Date.now()
	})
	pushToast(deps, `节点「${labelForType(payload.nodeType)}」尚未在此环境中接入`, 'warn')
}

export const getLatestTaskForNode = (
	state: WorkflowState,
	nodeId: string
): WorkflowNodeGenerationTask | null => {
	const ids = state.nodeGenerationTaskIdsByNodeId?.[nodeId] || []
	if (!ids.length) return null
	const id = ids[0]
	return state.nodeGenerationTasksById?.[id] || null
}

export const getTasksForNode = (
	state: WorkflowState,
	nodeId: string
): WorkflowNodeGenerationTask[] => {
	const ids = state.nodeGenerationTaskIdsByNodeId?.[nodeId] || []
	return ids
		.map((id) => state.nodeGenerationTasksById?.[id])
		.filter((t): t is WorkflowNodeGenerationTask => Boolean(t))
}
