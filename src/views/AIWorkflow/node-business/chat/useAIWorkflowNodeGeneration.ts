import type { Store } from 'vuex'
import type {
	WorkflowNodeChatSubmitPayload,
	WorkflowNodeGenerationTask,
	WorkflowState
} from '../../../../aiworkflow/types'
import { ComfyUIBridgeService, type MeshyTaskResponse } from '../../../../network/ComfyUIBridgeService'
import { getErrorMessage } from '../../../../types/utils'
import { t } from '../../../../i18n'

export type NodeGenerationApiDeps = {
	store: Store<WorkflowState>
	comfyService?: ComfyUIBridgeService | null
	resolveBackendUrl: (raw: string) => string
	resolveBackendFetchUrl?: (raw: string) => string
	getProjectId?: () => number | null
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

class FatalTaskError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'FatalTaskError'
	}
}

const throwFatal = (message: string): never => {
	throw new FatalTaskError(message)
}

const isFatalError = (err: unknown): boolean => {
	return err instanceof FatalTaskError
}

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

const collectReferenceImagesWithUrl = async (
	deps: NodeGenerationApiDeps,
	nodeId: string,
	maxRefs: number = 4
): Promise<Array<{ name: string; blob: Blob; url: string; fromNodeId: string }>> => {
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

	const refs: Array<{ name: string; blob: Blob; url: string; fromNodeId: string }> = []
	for (const edge of incoming) {
		if (refs.length >= maxRefs) break
		const fromNodeId = String(edge.fromNodeId ?? '')
		const sourceNode = state.nodesById[fromNodeId]
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
		if (!candidateUrl) {
			const meshySettings =
				typeof sourceNode.meshySettings === 'object' && sourceNode.meshySettings
					? (sourceNode.meshySettings as Record<string, unknown>)
					: {}
			const outputSummary =
				typeof meshySettings?.meshyOutputSummary === 'object' && meshySettings.meshyOutputSummary
					? (meshySettings.meshyOutputSummary as Record<string, unknown>)
					: {}
			const preferredUrl = typeof outputSummary?.preferredUrl === 'string' ? String(outputSummary.preferredUrl) : ''
			const thumbnailUrl = typeof outputSummary?.thumbnailUrl === 'string' ? String(outputSummary.thumbnailUrl) : ''
			candidateUrl = preferredUrl || thumbnailUrl
		}
		if (!candidateUrl) continue

		const fetchUrl =
			typeof deps.resolveBackendFetchUrl === 'function'
				? deps.resolveBackendFetchUrl(candidateUrl)
				: deps.resolveBackendUrl(candidateUrl)
		try {
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
			const name = `ref-${String(sourceNode.type || 'image')}-${fromNodeId}-${Date.now()}.png`
			refs.push({ name, blob, url: candidateUrl, fromNodeId })
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
				label: t('aiworkflow.runtime.meshyImageLabel')
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
				statusText: t('aiworkflow.runtime.meshyImageComplete'),
				outputSummary
			}
		}
	})

	updateTask(deps, generationTaskId, {
		status: 'completed',
		statusText: t('aiworkflow.runtime.meshyImageCompleteCount', { count: String(imageUrls.length) }),
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
			t('aiworkflow.runtime.pollFailed', { status: String(taskRes.status), error: String(taskRes.error) })
		)
		console.warn('[Meshy Poll] 轮询失败:', errorDetails)

		if (taskRes.status === 502) {
			appendDetail(deps, generationTaskId, t('aiworkflow.runtime.poll502Retry'))
			pushToast(deps, t('aiworkflow.toast.meshyRetryUnavailable'), 'warn')
		}
		return PollingAction.CONTINUE
	}

	const status = String(taskRes.status || '')
		.trim()
		.toUpperCase()
	const progress = Number(taskRes.progress ?? 0)
	const progressPct = Math.min(95, Math.max(20, progress))

	updateTask(deps, generationTaskId, {
		statusText: t('aiworkflow.runtime.meshyTaskStatus', { taskType, status, progress: String(progress) }),
		progress: progressPct
	})

	switch (status) {
		case 'SUCCEEDED':
			await handleMeshySuccess(deps, taskId, generationTaskId, nodeId, taskType, taskRes)
			return PollingAction.STOP

		case 'FAILED': {
			const errorMsg = String(taskRes.errorMessage || t('aiworkflow.runtime.unknownError'))
			return throwFatal(t('aiworkflow.runtime.meshyTaskFailed', { error: errorMsg }))
		}

		case 'CANCELED':
			return throwFatal(t('aiworkflow.runtime.meshyTaskCanceled'))

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
			if (isFatalError(err)) {
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
				t('aiworkflow.runtime.pollException', { attempt: String(i + 1), consecutive: String(consecutiveErrors), error: errMsg })
			)
			console.error('[Meshy Poll] 轮询异常:', errorDetails)

			if (consecutiveErrors >= 5) {
				pushToast(
					deps,
					t('aiworkflow.runtime.meshyPollConsecutiveFailures', { count: String(consecutiveErrors) }),
					'warn'
				)
			}

			if (consecutiveErrors >= config.maxConsecutiveErrors) {
				throw err
			}
		}
	}

	throwFatal(t('aiworkflow.runtime.meshyTaskTimeout'))
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
	statusText: t('aiworkflow.runtime.submittingTask'),
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
		pushToast(deps, t('aiworkflow.toast.nodeNotFound'), 'error')
		return { ok: false, error: t('aiworkflow.runtime.nodeNotFound') }
	}
	if (!payload.prompt.trim() && payload.nodeType !== 'model3d') {
		pushToast(deps, t('aiworkflow.toast.promptRequired'), 'warn')
		return { ok: false, error: t('aiworkflow.runtime.promptEmpty') }
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
				return { ok: false, error: t('aiworkflow.runtime.unsupported3dProvider') }
			}
		}
		return { ok: true, taskType: 'other' }
	} catch (err: unknown) {
		const raw = getErrorMessage(err)
		const looksLikeNetworkError =
			/Failed to fetch/i.test(raw) ||
			/NetworkError/i.test(raw) ||
			/TypeError.*fetch/i.test(raw) ||
			/CORS/i.test(raw) ||
			/Failed to connect/i.test(raw) ||
			/ECONNREFUSED/i.test(raw)
		const message = looksLikeNetworkError
			? t('aiworkflow.runtime.backendUnreachable', { error: raw })
			: raw
		appendDetail(deps, task.id, message)
		updateTask(deps, task.id, {
			status: 'error',
			statusText: t('aiworkflow.runtime.failedStatus', { message }),
			errorMessage: message,
			finishedAt: Date.now()
		})
		pushToast(deps, t('aiworkflow.toast.generationFailed', { type: labelForType(payload.nodeType), message }), 'error')
		return { ok: false, error: message }
	} finally {
		deps.store.commit('setNodeChatSubmitting', { submitting: false })
	}
}

const labelForType = (nodeType: WorkflowNodeGenerationTask['nodeType']) => {
	if (nodeType === 'text') return t('aiworkflow.toast.nodeTypeText')
	if (nodeType === 'image') return t('aiworkflow.toast.nodeTypeImage')
	if (nodeType === 'video') return t('aiworkflow.toast.nodeTypeVideo')
	return t('aiworkflow.toast.nodeTypeModel3d')
}

const runTextTask = async (
	deps: NodeGenerationApiDeps,
	task: WorkflowNodeGenerationTask,
	payload: WorkflowNodeChatSubmitPayload
) => {
	const svc = getComfyService(deps)
	updateTask(deps, task.id, {
		status: 'running',
		statusText: t('aiworkflow.runtime.callingTextModel'),
		progress: 15
	})
	appendDetail(deps, task.id, t('aiworkflow.runtime.detailPrompt', { prompt: payload.prompt.slice(0, 120) }))

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

	// Collect connected reference images from input anchors
	const refs = await collectReferenceImages(deps, payload.nodeId, 5)
	const refImages: string[] = []
	for (const ref of refs) {
		try {
			const dataUri = await blobToBase64DataUri(ref.blob)
			if (dataUri) refImages.push(dataUri)
		} catch {
			// skip failed images
		}
	}
	if (refImages.length > 0) {
		appendDetail(deps, task.id, t('aiworkflow.runtime.detailRefImageCount', { count: String(refImages.length) }))
	}

	let accumulated = ''
	try {
			for await (const ev of (svc as ComfyUIBridgeService).blueprintChatStream({
				content: String(body.content ?? ''),
				history: body.history as Array<{ role: 'user' | 'assistant' | 'system'; content: string }> | undefined,
				provider: String(body.provider ?? ''),
				modelId: String(body.modelId ?? ''),
				refImages
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
					statusText: t('aiworkflow.runtime.textModelGenerating')
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
		appendDetail(deps, task.id, t('aiworkflow.runtime.streamCallFailed', { error: fallbackMsg }))
		updateTask(deps, task.id, { status: 'running', statusText: t('aiworkflow.runtime.fallbackAttempt') })
		try {
			const plain = await (svc as ComfyUIBridgeService).blueprintChat({
				content: String(body.content ?? ''),
				history: body.history as Array<{ role: 'user' | 'assistant' | 'system'; content: string }> | undefined,
				provider: String(body.provider ?? ''),
				modelId: String(body.modelId ?? ''),
				refImages
			})
			const text =
				plain.ok && typeof plain.assistant === 'string'
					? plain.assistant
					: ''
			if (text) accumulated = text
		} catch (fallbackErr: unknown) {
			appendDetail(deps, task.id, t('aiworkflow.runtime.fallbackRequestFailed', { error: getErrorMessage(fallbackErr) }))
			throw err
		}
	}

	const finalText = accumulated.trim()
	if (!finalText) throw new Error(t('aiworkflow.runtime.textModelEmpty'))
	appendResult(deps, task.id, { kind: 'text', url: '', label: finalText.slice(0, 80) })
	if (typeof deps.bindTextResultToNode === 'function')
		deps.bindTextResultToNode(payload.nodeId, finalText)
	updateTask(deps, task.id, {
		status: 'completed',
		statusText: t('aiworkflow.runtime.textGenerationComplete'),
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
		statusText: t('aiworkflow.runtime.callingImageModel', { kind }),
		progress: 15
	})
	appendDetail(deps, task.id, t('aiworkflow.runtime.detailModel', { model }))
	appendDetail(deps, task.id, t('aiworkflow.runtime.detailPrompt', { prompt: payload.prompt.slice(0, 120) }))

	const form = new FormData()
	form.set('prompt', payload.prompt)
	form.set('imageModel', model)
	const imgProjectId = deps.getProjectId?.() ?? null
	if (imgProjectId != null) form.set('projectId', String(imgProjectId))

	const isSeedream = kind === 'seedream'

	if (isSeedream) {
		const seedreamModelVersion = String(params.seedreamModelVersion || 'doubao-seedream-4-5-251128').trim()
		const seedreamSize = String(params.seedreamSize || '2K').trim()
		const seedreamAspectRatio = String(params.seedreamAspectRatio || '1:1').trim()
		const seedreamQuantity = Number(params.seedreamQuantity ?? 1)
		const seedreamWatermark = Boolean(params.seedreamWatermark)
		const seedreamSeed = Number(params.seedreamSeed ?? -1)
		const seedreamNegativePrompt = String(params.seedreamNegativePrompt || '').trim()
		const seedreamOutputFormat = String(params.seedreamOutputFormat || 'jpeg').trim()

		form.set('model', seedreamModelVersion)
		form.set('size', seedreamSize)
		form.set('aspectRatio', seedreamAspectRatio)
		form.set('outputFormat', seedreamOutputFormat)
		form.set('quantity', String(Math.min(4, Math.max(1, Math.floor(seedreamQuantity)))))
		form.set('watermark', seedreamWatermark ? '1' : '0')
		if (seedreamNegativePrompt) form.set('negativePrompt', seedreamNegativePrompt)
		if (Number.isFinite(seedreamSeed) && seedreamSeed >= 0) form.set('seed', String(Math.floor(seedreamSeed)))

		appendDetail(deps, task.id, t('aiworkflow.runtime.detailSeedreamModel', { model: seedreamModelVersion }))
		appendDetail(deps, task.id, t('aiworkflow.runtime.detailResolution', { size: seedreamSize, ratio: seedreamAspectRatio }))
	} else {
		if (typeof params.aspectRatio === 'string' && params.aspectRatio)
			form.set('aspectRatio', params.aspectRatio)
		if (typeof params.resolution === 'string' && params.resolution)
			form.set('resolution', params.resolution)
		const quantity = Number(params.quantity ?? 1)
		if (Number.isFinite(quantity) && quantity > 0)
			form.set('quantity', String(Math.min(8, Math.max(1, Math.floor(quantity)))))
	}

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
		const meshyQuantity = Number(params?.meshyOutputImageCount ?? 1)
		const taskType = hasRefImages ? 'image-to-image' : 'text-to-image'

		appendDetail(deps, task.id, t('aiworkflow.runtime.detailMeshyMode', { mode: taskType }))
		appendDetail(deps, task.id, t('aiworkflow.runtime.detailAiModel', { model: meshyAiModel }))

		try {
			// 构建 Meshy API 请求体
			const meshyPayload: Record<string, unknown> = {
				mode: taskType,
				ai_model: meshyAiModel,
				prompt: payload.prompt,
				negative_prompt: meshyNegativePrompt,
				output_image_count: Math.min(4, Math.max(1, Math.floor(meshyQuantity)))
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

			updateTask(deps, task.id, { statusText: t('aiworkflow.runtime.creatingMeshyTask', { taskType }), progress: 20 })

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
					throw new Error(String(createRes.error || t('aiworkflow.runtime.meshyTaskCreateFailed')))
				}
				const taskId = String(createRes.taskId || '').trim()
				if (!taskId) throw new Error(t('aiworkflow.runtime.meshyEmptyTaskId'))
				appendDetail(deps, task.id, t('aiworkflow.runtime.detailTaskCreated', { taskId }))

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
							statusText: t('aiworkflow.runtime.meshyTaskCreatedStatus', { taskType })
						}
					}
				})

				// 轮询任务状态
				await pollMeshyTaskStatus(deps, svc, taskId, task.id, payload.nodeId, taskType)
			} else {
				const createRes = await svc.meshyGenerate(meshyPayload)
				if (!createRes.ok) {
					throw new Error(String(createRes.error || t('aiworkflow.runtime.meshyTaskCreateFailed')))
				}
				const taskId = String(createRes.taskId || '').trim()
				if (!taskId) throw new Error(t('aiworkflow.runtime.meshyEmptyTaskId'))
				appendDetail(deps, task.id, t('aiworkflow.runtime.detailTaskCreated', { taskId }))

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
							statusText: t('aiworkflow.runtime.meshyTaskCreatedStatus', { taskType })
						}
					}
				})

				// 轮询任务状态
				await pollMeshyTaskStatus(deps, svc, taskId, task.id, payload.nodeId, taskType)
			}

			return
		} catch (err: unknown) {
			const errMsg = getErrorMessage(err)
			pushToast(deps, t('aiworkflow.toast.meshyGenerateFailed', { error: errMsg }), 'error')
			updateTask(deps, task.id, {
				status: 'error',
				statusText: t('aiworkflow.runtime.failedStatus', { message: errMsg }),
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
					appendDetail(deps, task.id, t('aiworkflow.runtime.imageImportFailed'))
					continue
				}
				const resolved = deps.resolveBackendUrl(sourceUrl)
				appendResult(deps, task.id, { kind: 'image', url: resolved, label: t('aiworkflow.runtime.imageLabel', { index: String(produced + 1) }) })
				produced += 1
				updateTask(deps, task.id, {
					status: 'running',
					statusText: t('aiworkflow.runtime.imagesReceived', { count: String(produced) }),
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

	if (produced === 0) throw new Error(t('aiworkflow.runtime.noImagesReceived'))
	updateTask(deps, task.id, {
		status: 'completed',
		statusText: t('aiworkflow.runtime.imageGenerationComplete', { count: String(produced) }),
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
		statusText: t('aiworkflow.runtime.callingVideoModel', { kind }),
		progress: 20
	})
	appendDetail(deps, task.id, t('aiworkflow.runtime.detailModel', { model }))
	appendDetail(deps, task.id, t('aiworkflow.runtime.detailPrompt', { prompt: payload.prompt.slice(0, 120) }))

	const form = new FormData()
	form.set('prompt', payload.prompt)
	form.set('model', model)
	const projectId = deps.getProjectId?.() ?? null
	if (projectId != null) form.set('projectId', String(projectId))
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
						appendDetail(deps, task.id, t('aiworkflow.runtime.videoImportFailed'))
						continue
					}
					appendResult(deps, task.id, { kind: 'video', url, label: t('aiworkflow.runtime.videoResultLabel') })
					produced += 1
				}
				updateTask(deps, task.id, {
					status: produced > 0 ? 'completed' : 'running',
					statusText: downloadStatus || (produced > 0 ? t('aiworkflow.runtime.videoResultReady') : t('aiworkflow.runtime.taskProcessing')),
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

	if (produced === 0) throw new Error(t('aiworkflow.runtime.noVideosReceived'))
	updateTask(deps, task.id, {
		status: 'completed',
		statusText: t('aiworkflow.runtime.videoGenerationComplete'),
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
					t('aiworkflow.runtime.pollFailed', { status: String(taskRes.status), error: String(taskRes.error) })
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

			const statusText = t('aiworkflow.runtime.meshy3dTaskStatus', { taskMode, status, progress: String(progress) })

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
					return throwFatal(t('aiworkflow.runtime.meshyNoModelUrl'))
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
						label: t('aiworkflow.runtime.meshy3dModelLabel', { format: finalFormat })
					})
				}

				if (thumbnailUrl) {
					const resolvedThumb = deps.resolveBackendUrl(thumbnailUrl)
					appendResult(deps, generationTaskId, {
						kind: 'image',
						url: resolvedThumb,
						label: t('aiworkflow.runtime.modelPreviewLabel')
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
								? t('aiworkflow.runtime.meshy3dComplete')
								: t('aiworkflow.runtime.meshy3dCompleteFetchFailed'),
							errorMessage: fetchSucceeded
								? ''
								: t('aiworkflow.runtime.meshy3dFetchFailedMessage'),
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
						? t('aiworkflow.runtime.meshy3dComplete')
						: t('aiworkflow.runtime.meshy3dCompleteFetchFailed'),
					progress: 100,
					finishedAt: Date.now()
				})
				return
			}

			if (status === 'FAILED') {
				const errorMsg = String(taskRes.errorMessage || t('aiworkflow.runtime.unknownError'))
				return throwFatal(t('aiworkflow.runtime.meshy3dTaskFailed', { error: errorMsg }))
			}

			if (status === 'CANCELED') {
				return throwFatal(t('aiworkflow.runtime.meshy3dTaskCanceled'))
			}
		} catch (err: unknown) {
			const errMsg = getErrorMessage(err)
			if (isFatalError(err)) {
				throw err
			}

			consecutiveErrors++
			appendDetail(
				deps,
				generationTaskId,
				t('aiworkflow.runtime.pollException', { attempt: String(i + 1), consecutive: String(consecutiveErrors), error: errMsg })
			)
			console.error('[Meshy 3D Poll] 轮询异常:', {
				message: errMsg,
				taskId,
				taskMode,
				attempt: i + 1,
				consecutiveErrors
			})

			if (consecutiveErrors >= 10) {
				return throwFatal(t('aiworkflow.runtime.meshy3dConsecutiveFailures', { count: String(consecutiveErrors) }))
			}
		}
	}

	return throwFatal(t('aiworkflow.runtime.meshy3dTaskTimeout'))
}

const blobToBase64DataUri = async (blob: Blob): Promise<string> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result || ''))
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(blob)
	})
}

const normalizeModelUrlForMeshy = async (deps: NodeGenerationApiDeps, rawUrl: string, _label?: string): Promise<string> => {
	const value = String(rawUrl ?? '').trim()
	if (!value) return ''
	if (value.startsWith('data:')) return value

	// Handle dweb:// URLs first before any resolution
	if (value.startsWith('dweb://')) {
		try {
			let blob: Blob | null = null
			if (typeof deps.downloadUrlAsBlob === 'function') {
				blob = await deps.downloadUrlAsBlob(value)
			}
			if (!blob) {
				const resp = await fetch(value)
				if (!resp.ok) return ''
				blob = await resp.blob()
			}
			if (!blob || blob.size === 0) return ''
			return await blobToBase64DataUri(blob)
		} catch (err) {
			console.warn(`[Meshy] failed to convert dweb model URL to data URL: ${value}`, err)
			return ''
		}
	}

	const resolved =
		value.startsWith('http://') || value.startsWith('https://') || value.startsWith('blob:')
			? value
			: deps.resolveBackendUrl(value)

	if (resolved.startsWith('blob:')) {
		try {
			const resp = await fetch(resolved)
			if (!resp.ok) return ''
			const blob = await resp.blob()
			if (!blob || blob.size === 0) return ''
			return await blobToBase64DataUri(blob)
		} catch {
			return ''
		}
	}

	if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
		try {
			const parsed = new URL(resolved)
			const hostname = parsed.hostname
			if (
				hostname === 'localhost' ||
				hostname === '127.0.0.1' ||
				hostname.startsWith('192.168.') ||
				hostname.startsWith('10.') ||
				hostname.endsWith('.local')
			) {
				let blob: Blob | null = null
				if (typeof deps.downloadUrlAsBlob === 'function') {
					blob = await deps.downloadUrlAsBlob(resolved)
				}
				if (!blob) {
					const resp = await fetch(resolved)
					if (!resp.ok) return resolved
					blob = await resp.blob()
				}
				if (!blob || blob.size === 0) return resolved
				return await blobToBase64DataUri(blob)
			}
		} catch {
			// keep resolved url
		}
		return resolved
	}

	return resolved
}

const resolveModel3DInput = async (
	deps: NodeGenerationApiDeps,
	nodeId: string
): Promise<{ inputTaskId?: string; modelUrl?: string } | null> => {
	const state = deps.store.state
	// 1. 查找 in-model 输入边
	const edge = Object.values(state.edgesById || {}).find(
		(e) => String(e.toNodeId ?? '') === String(nodeId) && String(e.toAnchorId ?? '').trim() === 'in-model'
	)
	if (edge) {
		const fromNode = state.nodesById[String(edge.fromNodeId ?? '')]
		if (!fromNode) return null
		if (fromNode.type === 'meshy') {
			const settings = (fromNode as Record<string, unknown>).meshySettings as Record<string, unknown> | undefined
			const relationSummary = settings && typeof settings.meshyRelationSummary === 'object' && settings.meshyRelationSummary !== null
				? (settings.meshyRelationSummary as Record<string, unknown>)
				: {}
			const taskId = String(settings?.meshyTaskId ?? relationSummary?.effectiveTaskId ?? '').trim()
			if (taskId) return { inputTaskId: taskId }
			const outputSummary = settings && typeof settings.meshyOutputSummary === 'object' && settings.meshyOutputSummary !== null
				? (settings.meshyOutputSummary as Record<string, unknown>)
				: {}
			const sourceUrl = String(
				relationSummary?.preferredUrl ?? outputSummary?.preferredUrl ?? ''
			).trim()
			if (sourceUrl) {
				const normalized = await normalizeModelUrlForMeshy(deps, sourceUrl, `meshy_model_${fromNode.id}`)
				if (normalized) return { modelUrl: normalized }
			}
		}
		if (fromNode.type === 'model3d') {
			const m3d = (fromNode as Record<string, unknown>).model3dSettings as Record<string, unknown> | undefined
			const url = String(m3d?.modelAssetUrl ?? m3d?.modelUrl ?? '').trim()
			if (url) {
				const normalized = await normalizeModelUrlForMeshy(deps, url, `model3d_${fromNode.id}`)
				if (normalized) return { modelUrl: normalized }
			}
		}
	}
	// 2. 回退到当前节点自身的已有模型
	const selfNode = state.nodesById[String(nodeId)]
	if (selfNode) {
		const selfM3d = (selfNode as Record<string, unknown>).model3dSettings as Record<string, unknown> | undefined
		const url = String(selfM3d?.modelAssetUrl ?? selfM3d?.modelUrl ?? '').trim()
		if (url) {
			const normalized = await normalizeModelUrlForMeshy(deps, url, `self_model_${nodeId}`)
			if (normalized) return { modelUrl: normalized }
		}
		const selfMeshy = (selfNode as Record<string, unknown>).meshyModelSettings as Record<string, unknown> | undefined
		const taskId = String(selfMeshy?.taskId ?? '').trim()
		if (taskId) return { inputTaskId: taskId }
	}
	return null
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
	const meshyTargetPolycount = Number(params.meshyTargetPolycount ?? 30000)
	const meshyDecimationMode = String(params.meshyDecimationMode || '').trim()
	const meshyEnableOriginalUv = Boolean(params.meshyEnableOriginalUv ?? true)
	const meshyEnablePbr = Boolean(params.meshyEnablePbr ?? false)
	const meshyHdTexture = Boolean(params.meshyHdTexture ?? false)
	const meshyRemoveLighting = Boolean(params.meshyRemoveLighting ?? true)
	const meshyAlphaThumbnail = Boolean(params.meshyAlphaThumbnail ?? false)
	const meshyStyleSource = String(params.meshyStyleSource || 'text').trim()

	const isPostProcessMode = meshyMode === 'remesh' || meshyMode === 'retexture' || meshyMode === 'uv-unwrap'

	updateTask(deps, task.id, {
		status: 'running',
		statusText: `正在创建 Meshy 3D 任务（${meshyMode}）…`,
		progress: 10
	})
	appendDetail(deps, task.id, `模式：${meshyMode}`)
	if (!isPostProcessMode) appendDetail(deps, task.id, `AI 模型：${meshyAiModel}`)
	if (meshyOutputFormat && meshyMode !== 'uv-unwrap') appendDetail(deps, task.id, `输出格式：${meshyOutputFormat}`)
	if (payload.prompt) appendDetail(deps, task.id, `提示词：${payload.prompt.slice(0, 120)}`)

	try {
		const meshyPayload: Record<string, unknown> = {
			mode: meshyMode
		}

		if (!isPostProcessMode) {
			meshyPayload.ai_model = meshyAiModel
		}

		if (payload.prompt) {
			meshyPayload.prompt = payload.prompt
		}

		if (meshyModelType && !isPostProcessMode) meshyPayload.model_type = meshyModelType
		if (meshyTopology && meshyMode !== 'retexture' && meshyMode !== 'uv-unwrap') meshyPayload.topology = meshyTopology
		if (meshySymmetryMode && !isPostProcessMode) meshyPayload.symmetry_mode = meshySymmetryMode
		if (meshyOriginAt && (!isPostProcessMode || meshyMode === 'remesh')) meshyPayload.origin_at = meshyOriginAt
		if (meshyPoseMode && !isPostProcessMode) meshyPayload.pose_mode = meshyPoseMode
		if (meshyOutputFormat && meshyMode !== 'uv-unwrap') meshyPayload.output_format = meshyOutputFormat
		if (!isPostProcessMode && meshySeed > 0) meshyPayload.seed = meshySeed
		if (isPostProcessMode && Number.isFinite(meshyTargetPolycount)) meshyPayload.target_polycount = Math.max(100, Math.min(300000, Math.floor(meshyTargetPolycount)))
		if (meshyMode === 'remesh' && meshyDecimationMode) meshyPayload.decimation_mode = meshyDecimationMode
		if (meshyMode === 'retexture') {
			if (meshyStyleSource === 'text' && payload.prompt) {
				meshyPayload.text_style_prompt = payload.prompt
			}
			meshyPayload.enable_original_uv = meshyEnableOriginalUv
			meshyPayload.enable_pbr = meshyEnablePbr
			meshyPayload.hd_texture = meshyHdTexture
			meshyPayload.remove_lighting = meshyRemoveLighting
			meshyPayload.alpha_thumbnail = meshyAlphaThumbnail
		}

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

		// retexture with image style: use user-selected image or first connected
		if (meshyMode === 'retexture' && meshyStyleSource === 'image') {
			const styleRefs = await collectReferenceImagesWithUrl(deps, payload.nodeId, 4)
			const selectedNodeId = String(params.meshyTextureImageNodeId || '').trim()
			let selectedRef: { name: string; blob: Blob; url: string; fromNodeId: string } | null = null
			if (selectedNodeId && styleRefs.length > 0) {
				selectedRef = styleRefs.find(ref => ref.fromNodeId === selectedNodeId) || null
			}
			if (!selectedRef && styleRefs.length > 0) {
				selectedRef = styleRefs[0]
			}
			if (selectedRef) {
				try {
					const dataUri = await blobToBase64DataUri(selectedRef.blob)
					if (dataUri) {
						meshyPayload.image_style_url = dataUri
						appendDetail(deps, task.id, `已使用${selectedNodeId ? '选择的' : '连接的'}图片作为纹理风格参考`)
					}
				} catch {
					// skip
				}
			}
		}

		if (isPostProcessMode) {
			const modelInput = await resolveModel3DInput(deps, payload.nodeId)
			if (modelInput?.inputTaskId) {
				meshyPayload.input_task_id = modelInput.inputTaskId
				appendDetail(deps, task.id, `上游任务ID：${modelInput.inputTaskId}`)
			} else if (modelInput?.modelUrl) {
				meshyPayload.model_url = modelInput.modelUrl
				appendDetail(deps, task.id, `输入模型URL已就绪`)
			} else {
				throw new Error(`${meshyMode === 'remesh' ? '重建网格' : meshyMode === 'retexture' ? '重新纹理' : 'UV Unwrap'} 需要连接上游 3D 模型输入或已有模型数据`)
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
