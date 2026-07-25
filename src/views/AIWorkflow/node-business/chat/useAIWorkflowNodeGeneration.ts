import type { Store } from 'vuex'
import type {
	WorkflowNodeChatSubmitPayload,
	WorkflowNodeGenerationTask,
	WorkflowNode,
	WorkflowState
} from '../../../../aiworkflow/types'
import { ComfyUIBridgeService, type MeshyTaskResponse } from '../../../../network/ComfyUIBridgeService'
import type { Tripo3DGenerateResponse } from '../tripo3d/types'
import { getErrorMessage } from '../../../../types/utils'
import { t } from '../../../../i18n'
import { checkVideoReferencePrerequisites, clearPendingPrompt } from '../seedance/useSeedanceVideoReferenceCheck'
import type { useGlobalTaskBridge } from '../../../../composables/useGlobalTaskBridge'

type GlobalTaskBridge = ReturnType<typeof useGlobalTaskBridge>

export type NodeGenerationApiDeps = {
	store: Store<WorkflowState>
	comfyService?: ComfyUIBridgeService | null
	resolveBackendUrl: (raw: string) => string
	resolveBackendFetchUrl?: (raw: string) => string
	getProjectId?: () => number | null
	pushToast?: (message: string, tone?: 'info' | 'warn' | 'error') => void
	nodeResourceUrl?: (node: any) => string | null
	createImageNodeAtCenter?: (url: string, name?: string) => string | null
	createImageNodeAt?: (worldX: number, worldY: number, url: string, name?: string) => string | null
	/** Bind produced asset url to the originating node, e.g. as its resource. Returns final persisted URL or false on failure. */
	bindImageResultToNode?: (nodeId: string, url: string) => string | false | void | Promise<string | false | void>
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
	globalTaskBridge?: GlobalTaskBridge
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

class UserAbortError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'UserAbortError'
	}
}

const throwFatal = (message: string): never => {
	throw new FatalTaskError(message)
}

const isFatalError = (err: unknown): err is FatalTaskError => {
	return err instanceof FatalTaskError
}

const isUserAbortError = (err: unknown): err is UserAbortError => {
	return err instanceof UserAbortError
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
const isImageInputAnchor = (anchorId: string): boolean => {
	const id = String(anchorId || '').trim()
	return id === 'in-image' || id === 'in-resource' || id === 'in-0' || /^in-image-\d+$/.test(id)
}

const isVideoInputAnchor = (anchorId: string): boolean => {
	const id = String(anchorId || '').trim()
	return id === 'in-video' || id === 'in-resource' || /^in-video-\d+$/.test(id)
}

const isMediaInputAnchor = (anchorId: string): boolean => {
	return isImageInputAnchor(anchorId) || isVideoInputAnchor(anchorId)
}

const getNodeEffectiveImageUrl = (
	node: Record<string, unknown>,
	state: {
		resourcesById: Record<string, Record<string, unknown>>
	},
	nodeResourceUrl?: (n: any) => string | null
): string => {
	const resourceRid = String(node.resourceId ?? '').trim()
	if (resourceRid) {
		const res = state.resourcesById[resourceRid]
		const resUrl = typeof res?.url === 'string' ? String(res.url).trim() : ''
		if (resUrl) {
			console.log('[collectReferenceImages] 从resourceId获取URL:', resUrl)
			return resUrl
		}
	}
	const imageSettings =
		typeof node.imageSettings === 'object' && node.imageSettings
			? (node.imageSettings as Record<string, unknown>)
			: {}
	const lastGenerated =
		typeof imageSettings?.lastGeneratedImageUrl === 'string'
			? String(imageSettings.lastGeneratedImageUrl).trim()
			: ''
	if (lastGenerated) {
		console.log('[collectReferenceImages] 从lastGeneratedImageUrl获取URL:', lastGenerated)
		return lastGenerated
	}
	// Blender 节点：上一轮 Agent 会话的视口截图产物（设计文档 §4.5）
	const blenderSettings =
		typeof node.blenderSettings === 'object' && node.blenderSettings
			? (node.blenderSettings as Record<string, unknown>)
			: undefined
	if (blenderSettings) {
		const lastOutputs =
			typeof blenderSettings.lastOutputs === 'object' && blenderSettings.lastOutputs
				? (blenderSettings.lastOutputs as Record<string, unknown>)
				: {}
		const blenderImage = typeof lastOutputs.imageUrl === 'string' ? String(lastOutputs.imageUrl).trim() : ''
		if (blenderImage) return blenderImage
	}
	const meshySettings =
		typeof imageSettings.meshyImageSettings === 'object' && imageSettings.meshyImageSettings
			? (imageSettings.meshyImageSettings as Record<string, unknown>)
			: undefined
	if (meshySettings) {
		const outputSummary =
			typeof meshySettings.outputSummary === 'object' && meshySettings.outputSummary
				? (meshySettings.outputSummary as Record<string, unknown>)
				: {}
		const preferredUrl = typeof outputSummary.preferredUrl === 'string' ? String(outputSummary.preferredUrl).trim() : ''
		if (preferredUrl) {
			console.log('[collectReferenceImages] 从meshyOutputSummary获取URL:', preferredUrl)
			return preferredUrl
		}
	}
	const tripo3dImgSettings =
		typeof (imageSettings as Record<string, unknown>).tripo3dImageSettings === 'object' && (imageSettings as Record<string, unknown>).tripo3dImageSettings
			? ((imageSettings as Record<string, unknown>).tripo3dImageSettings as Record<string, unknown>)
			: undefined
	if (tripo3dImgSettings) {
		const outputSummary =
			typeof tripo3dImgSettings.outputSummary === 'object' && tripo3dImgSettings.outputSummary
				? (tripo3dImgSettings.outputSummary as Record<string, unknown>)
				: {}
		const preferredUrl = typeof outputSummary.preferredUrl === 'string' ? String(outputSummary.preferredUrl).trim() : ''
		if (preferredUrl) {
			return preferredUrl
		}
		const tripoThumb = typeof tripo3dImgSettings.thumbnailUrl === 'string' ? String(tripo3dImgSettings.thumbnailUrl).trim() : ''
		if (tripoThumb) return tripoThumb
		const tripoImgs = Array.isArray(tripo3dImgSettings.imageUrls) ? tripo3dImgSettings.imageUrls as string[] : []
		if (tripoImgs.length > 0 && typeof tripoImgs[0] === 'string' && tripoImgs[0].trim()) return tripoImgs[0].trim()
	}
	const geminiImgSettings =
		typeof (imageSettings as Record<string, unknown>).geminiImageSettings === 'object' && (imageSettings as Record<string, unknown>).geminiImageSettings
			? ((imageSettings as Record<string, unknown>).geminiImageSettings as Record<string, unknown>)
			: undefined
	if (geminiImgSettings) {
		const geminiThumb = typeof geminiImgSettings.thumbnailUrl === 'string' ? String(geminiImgSettings.thumbnailUrl).trim() : ''
		if (geminiThumb) return geminiThumb
		const geminiImgs = Array.isArray(geminiImgSettings.imageUrls) ? geminiImgSettings.imageUrls as string[] : []
		if (geminiImgs.length > 0 && typeof geminiImgs[0] === 'string' && geminiImgs[0].trim()) return geminiImgs[0].trim()
	}
	if (typeof nodeResourceUrl === 'function') {
		const standardUrl = nodeResourceUrl(node)
		if (standardUrl) {
			console.log('[collectReferenceImages] 从nodeResourceUrl获取URL:', standardUrl)
			return standardUrl
		}
	}
	return ''
}

const getNodeEffectiveVideoUrl = (
	node: Record<string, unknown>,
	state: {
		resourcesById: Record<string, Record<string, unknown>>
	},
	nodeResourceUrl?: (n: any) => string | null
): string => {
	const resourceRid = String(node.resourceId ?? '').trim()
	if (resourceRid) {
		const res = state.resourcesById[resourceRid]
		const resUrl = typeof res?.url === 'string' ? String(res.url).trim() : ''
		if (resUrl) {
			return resUrl
		}
	}
	const videoSettings =
		typeof node.videoSettings === 'object' && node.videoSettings
			? (node.videoSettings as Record<string, unknown>)
			: {}
	const lastGenerated =
		typeof videoSettings?.lastGeneratedVideoUrl === 'string'
			? String(videoSettings.lastGeneratedVideoUrl).trim()
			: ''
	if (lastGenerated) {
		return lastGenerated
	}
	const videoUrlLocal =
		typeof videoSettings?.videoUrlLocal === 'string'
			? String(videoSettings.videoUrlLocal).trim()
			: ''
	if (videoUrlLocal) {
		return videoUrlLocal
	}
	if (typeof nodeResourceUrl === 'function') {
		const standardUrl = nodeResourceUrl(node)
		if (standardUrl) {
			return standardUrl
		}
	}
	return ''
}

const downloadImageAsBlob = async (
	deps: NodeGenerationApiDeps,
	candidateUrl: string
): Promise<Blob | null> => {
	const fetchUrl =
		typeof deps.resolveBackendFetchUrl === 'function'
			? deps.resolveBackendFetchUrl(candidateUrl)
			: deps.resolveBackendUrl(candidateUrl)

	console.log('[downloadImageAsBlob] 准备下载, candidateUrl:', candidateUrl, 'fetchUrl:', fetchUrl)

	try {
		let blob: Blob | null = null
		if (typeof deps.downloadUrlAsBlob === 'function') {
			console.log('[downloadImageAsBlob] 使用downloadUrlAsBlob下载')
			blob = await deps.downloadUrlAsBlob(fetchUrl)
			console.log('[downloadImageAsBlob] downloadUrlAsBlob结果:', blob ? `size=${blob.size}, type=${blob.type}` : 'null')
		}
		if (!blob) {
			console.log('[downloadImageAsBlob] 使用fetch下载')
			const resp = await fetch(fetchUrl)
			console.log('[downloadImageAsBlob] fetch响应:', resp.ok, resp.status)
			if (!resp.ok) return null
			blob = await resp.blob()
		}
		if (!blob || blob.size === 0) {
			console.warn('[downloadImageAsBlob] blob为空或大小为0')
			return null
		}
		return blob
	} catch (e) {
		console.error('[downloadImageAsBlob] 下载图片失败:', e)
		return null
	}
}

const collectReferenceImages = async (
	deps: NodeGenerationApiDeps,
	nodeId: string,
	maxRefs: number = 5
): Promise<Array<{ name: string; blob: Blob }>> => {
	const state = deps.store.state as {
		nodesById: Record<string, Record<string, unknown>>
		edgesById: Record<string, Record<string, unknown>>
		edgeOrder: string[]
		resourcesById: Record<string, Record<string, unknown>>
	}
	const node = state.nodesById[nodeId]
	if (!node) {
		console.warn('[collectReferenceImages] 节点不存在:', nodeId)
		return []
	}

	console.log('[collectReferenceImages] 开始收集参考图, nodeId:', nodeId, '总边数:', state.edgeOrder.length)

	const refs: Array<{ name: string; blob: Blob }> = []

	// Step 1: If the current node has its own image, add it as the first reference
	const selfUrl = getNodeEffectiveImageUrl(node, state, deps.nodeResourceUrl)
	if (selfUrl && refs.length < maxRefs) {
		console.log('[collectReferenceImages] 节点自身图片URL:', selfUrl)
		const blob = await downloadImageAsBlob(deps, selfUrl)
		if (blob) {
			const name = `ref-self-${nodeId}-${Date.now()}.png`
			refs.push({ name, blob })
			console.log('[collectReferenceImages] 成功添加节点自身参考图:', name, 'size:', blob.size)
		}
	}

	// Step 2: Collect images from connected input edges
	const incoming: Array<Record<string, unknown>> = []
	for (const edgeId of state.edgeOrder) {
		const edge = state.edgesById[edgeId]
		if (!edge) continue
		const toNodeId = String(edge.toNodeId ?? '')
		if (toNodeId !== String(nodeId)) continue
		const toAnchorId = String(edge.toAnchorId ?? '').trim()
		const isImageAnchor = isImageInputAnchor(toAnchorId)
		console.log('[collectReferenceImages] 找到入边:', {
			edgeId,
			fromNodeId: String(edge.fromNodeId ?? ''),
			toNodeId,
			toAnchorId,
			isImageAnchor
		})
		if (!isImageAnchor) continue
		incoming.push(edge)
	}

	console.log('[collectReferenceImages] 匹配到的图片输入边数量:', incoming.length)

	for (const edge of incoming) {
		if (refs.length >= maxRefs) break
		const sourceNode = state.nodesById[String(edge.fromNodeId ?? '')]
		if (!sourceNode) {
			console.warn('[collectReferenceImages] 源节点不存在:', String(edge.fromNodeId ?? ''))
			continue
		}

		const sourceUrl = getNodeEffectiveImageUrl(sourceNode, state, deps.nodeResourceUrl)
		if (!sourceUrl) {
			console.warn('[collectReferenceImages] 无法获取源节点图片URL, fromNodeId:', String(edge.fromNodeId ?? ''))
			continue
		}

		const blob = await downloadImageAsBlob(deps, sourceUrl)
		if (!blob) continue

		const name = `ref-connected-${String(sourceNode.type || 'image')}-${String(edge.fromNodeId)}-${Date.now()}.png`
		refs.push({ name, blob })
		console.log('[collectReferenceImages] 成功添加连接参考图:', name, 'size:', blob.size)
	}

	console.log('[collectReferenceImages] 最终收集到参考图数量:', refs.length)
	return refs
}

const downloadVideoAsBlob = async (
	deps: NodeGenerationApiDeps,
	candidateUrl: string
): Promise<Blob | null> => {
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
			if (!resp.ok) return null
			blob = await resp.blob()
		}
		if (!blob || blob.size === 0) {
			return null
		}
		return blob
	} catch (e) {
		console.error('[downloadVideoAsBlob] 下载视频失败:', e)
		return null
	}
}

const collectReferenceVideos = async (
	deps: NodeGenerationApiDeps,
	nodeId: string,
	maxRefs: number = 3
): Promise<Array<{ name: string; blob: Blob }>> => {
	const state = deps.store.state as {
		nodesById: Record<string, Record<string, unknown>>
		edgesById: Record<string, Record<string, unknown>>
		edgeOrder: string[]
		resourcesById: Record<string, Record<string, unknown>>
	}
	const node = state.nodesById[nodeId]
	if (!node) {
		return []
	}

	const refs: Array<{ name: string; blob: Blob }> = []

	const incoming: Array<Record<string, unknown>> = []
	for (const edgeId of state.edgeOrder) {
		const edge = state.edgesById[edgeId]
		if (!edge) continue
		const toNodeId = String(edge.toNodeId ?? '')
		if (toNodeId !== String(nodeId)) continue
		const toAnchorId = String(edge.toAnchorId ?? '').trim()
		if (!isVideoInputAnchor(toAnchorId)) continue
		incoming.push(edge)
	}

	for (const edge of incoming) {
		if (refs.length >= maxRefs) break
		const sourceNode = state.nodesById[String(edge.fromNodeId ?? '')]
		if (!sourceNode) continue

		const sourceUrl = getNodeEffectiveVideoUrl(sourceNode, state, deps.nodeResourceUrl)
		if (!sourceUrl) continue

		const blob = await downloadVideoAsBlob(deps, sourceUrl)
		if (!blob) continue

		const name = `ref-video-${String(sourceNode.type || 'video')}-${String(edge.fromNodeId)}-${Date.now()}.mp4`
		refs.push({ name, blob })
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
		if (String(edge.toNodeId ?? '') !== String(nodeId)) continue
		const toAnchorId = String(edge.toAnchorId ?? '').trim()
		if (!isImageInputAnchor(toAnchorId)) continue
		incoming.push(edge)
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
				typeof sourceNode.imageSettings === 'object' && sourceNode.imageSettings
					? ((sourceNode.imageSettings as Record<string, unknown>).meshyImageSettings as Record<string, unknown> | undefined)
					: undefined
			if (meshySettings) {
				const outputSummary =
					typeof meshySettings?.outputSummary === 'object' && meshySettings.outputSummary
						? (meshySettings.outputSummary as Record<string, unknown>)
						: {}
				const preferredUrl = typeof outputSummary?.preferredUrl === 'string' ? String(outputSummary.preferredUrl) : ''
				const thumbnailUrl = typeof outputSummary?.thumbnailUrl === 'string' ? String(outputSummary.thumbnailUrl) : ''
				candidateUrl = preferredUrl || thumbnailUrl
			}
		}
		// 优先级4: nodeResourceUrl (标准方法)
		if (!candidateUrl && typeof deps.nodeResourceUrl === 'function') {
			const standardUrl = deps.nodeResourceUrl(sourceNode as Record<string, unknown>)
			if (standardUrl) candidateUrl = standardUrl
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
	if (rawModel === 'tripo3d') {
		const tripo3dImageModel = String(params?.tripo3dImageModel ?? 'seedream_v4').trim()
		return { kind: 'tripo3d', model: tripo3dImageModel }
	}
	// Gemini/NanoBanana 图片生成模型（统一使用Gemini官方API）
	if (rawModel === 'gemini' || rawModel === 'nanobanana') {
		const geminiModelVersion = String(
			params?.geminiImageModelVersion || 
			params?.nanobananaModelVersion || 
			'gemini-3.1-flash-image'
		).trim()
		return { kind: 'gemini', model: geminiModelVersion }
	}
	if (rawModel.startsWith('gemini')) return { kind: 'gemini', model: rawModel }
	// Meshy 图片生成模型
	if (rawModel === 'meshy') {
		const meshyAiModel = String(params?.meshyImageAiModel || 'nano-banana').trim()
		return { kind: 'meshy', model: meshyAiModel }
	}
	if (rawModel.startsWith('jimeng')) return { kind: 'jimeng', model: rawModel }
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
	const imageUrls = Array.isArray(taskRes.imageUrls) ? taskRes.imageUrls : []
	const preferredUrl = String(taskRes.preferredImageUrl || '').trim()

	console.log('[Meshy Poll] 收到任务结果:', {
		taskId,
		imageUrlsCount: imageUrls.length,
		imageUrls: imageUrls,
		preferredImageUrl: preferredUrl,
		rawResult: taskRes
	})

	const urlSet = new Set<string>()
	const allUrls: string[] = []
	if (preferredUrl) {
		urlSet.add(preferredUrl)
		allUrls.push(preferredUrl)
	}
	for (const u of imageUrls) {
		const us = String(u || '').trim()
		if (us && !urlSet.has(us)) {
			urlSet.add(us)
			allUrls.push(us)
		}
	}

	console.log('[Meshy Poll] 去重后allUrls数量:', allUrls.length, 'urls:', allUrls)

	const outputSummary: MeshyOutputSummary = {
		preferredUrl: '',
		imageUrls: [],
		thumbnailUrl: ''
	}

	let targetNodeId = nodeId
	let nodeCreated = false
	let createdNodes: string[] = []

	const state = deps.store.state as {
		nodesById: Record<string, Record<string, unknown>>
	}
	let currentNode = state.nodesById[targetNodeId]

	if (!currentNode && typeof deps.createImageNodeAtCenter === 'function') {
		const newNodeId = deps.createImageNodeAtCenter(preferredUrl, t('aiworkflow.runtime.meshyResultNodeName'))
		if (newNodeId) {
			targetNodeId = newNodeId
			nodeCreated = true
			createdNodes.push(newNodeId)
			currentNode = state.nodesById[targetNodeId]
			console.log('[Meshy Poll] 目标节点不存在，已在视口中心创建新节点:', newNodeId)
		}
	}

	if (!currentNode) {
		console.error('[Meshy Poll] 无法找到或创建目标节点，任务结果丢失')
		updateTask(deps, generationTaskId, {
			status: 'error',
			statusText: t('aiworkflow.runtime.meshyCannotCreateNode'),
			progress: 100,
			finishedAt: Date.now()
		})
		return
	}

	const currentWorldX = Number(currentNode.worldX ?? 0)
	const currentWorldY = Number(currentNode.worldY ?? 0)
	const NODE_SPACING = 350

	const currentImgSettings =
		typeof currentNode.imageSettings === 'object' && currentNode.imageSettings
			? (currentNode.imageSettings as Record<string, unknown>)
			: {}
	const currentMeshySettings =
		typeof currentImgSettings.meshyImageSettings === 'object' && currentImgSettings.meshyImageSettings
			? (currentImgSettings.meshyImageSettings as Record<string, unknown>)
			: {}

	const persistedUrls: string[] = []

	for (let i = 0; i < allUrls.length; i++) {
		const url = allUrls[i]
		if (!url) continue

		const resolved = deps.resolveBackendUrl(url)
		let finalUrl = resolved

		if (typeof deps.persistExternalAssetToProject === 'function') {
			const ext = String(url).match(/\.[^.]+$/)?.[0] || '.png'
			const fileName = `meshy_${taskId}_${i}${ext}`
			const persisted = await deps.persistExternalAssetToProject({
				kind: 'image',
				name: fileName,
				sourceUrl: resolved
			})
			if (persisted) {
				finalUrl = String(persisted.url || resolved)
				console.log('[Meshy Poll] 资产已持久化:', {
					taskId,
					index: i,
					originalUrl: url,
					persistedUrl: persisted.url
				})
			} else {
				console.warn('[Meshy Poll] 资产持久化失败，使用原始URL:', url)
			}
		}

		persistedUrls.push(finalUrl)

		let bindNodeId = targetNodeId
		let isNewNode = false

		if (i > 0) {
			if (typeof deps.createImageNodeAt === 'function') {
				const newX = currentWorldX + NODE_SPACING * i
				const newY = currentWorldY
				const newNodeId = deps.createImageNodeAt(newX, newY, finalUrl, t('aiworkflow.runtime.meshyResultNodeNameIndexed', { index: String(i + 1) }))
				if (newNodeId) {
					bindNodeId = newNodeId
					isNewNode = true
					createdNodes.push(newNodeId)
					console.log('[Meshy Poll] 为额外图片创建新节点:', { index: i, nodeId: newNodeId, x: newX, y: newY })
				}
			} else if (typeof deps.createImageNodeAtCenter === 'function') {
				const newNodeId = deps.createImageNodeAtCenter(finalUrl, t('aiworkflow.runtime.meshyResultNodeNameIndexed', { index: String(i + 1) }))
				if (newNodeId) {
					bindNodeId = newNodeId
					isNewNode = true
					createdNodes.push(newNodeId)
					console.log('[Meshy Poll] 为额外图片在中心创建新节点:', { index: i, nodeId: newNodeId })
				}
			}
		}

		if (bindNodeId && typeof deps.bindImageResultToNode === 'function') {
			const bindRet = await deps.bindImageResultToNode(bindNodeId, finalUrl)
			const bound = bindRet !== false
			if (bound) {
				appendResult(deps, generationTaskId, {
					kind: 'image',
					url: finalUrl,
					label: i === 0 ? t('aiworkflow.runtime.meshyImageLabel') : t('aiworkflow.runtime.meshyImageLabelIndexed', { index: String(i + 1) })
				})

				if (isNewNode) {
					const newNodeState = state.nodesById[bindNodeId]
					if (newNodeState) {
						deps.store.commit('setNodeImageSettings', {
							nodeId: bindNodeId,
							imageSettings: {
								meshyImageSettings: {
									taskId,
									taskStatus: 'succeeded',
									progress: 100,
									statusText: t('aiworkflow.runtime.meshyImageComplete'),
									outputSummary: {
										preferredUrl: finalUrl,
										imageUrls: [finalUrl],
										thumbnailUrl: ''
									}
								}
							}
						})
					}
				}
			}
		}
	}

	if (persistedUrls.length > 0) {
		outputSummary.preferredUrl = persistedUrls[0]
		outputSummary.imageUrls = persistedUrls
	}

	deps.store.commit('setNodeImageSettings', {
		nodeId: targetNodeId,
		imageSettings: {
			meshyImageSettings: {
				...currentMeshySettings,
				taskId,
				taskStatus: 'succeeded',
				progress: 100,
				statusText: nodeCreated || createdNodes.length > 0
					? t('aiworkflow.runtime.meshyImageCompleteWithNewNodes', { count: String(allUrls.length), nodes: String(createdNodes.length) })
					: t('aiworkflow.runtime.meshyImageComplete'),
				outputSummary
			}
		}
	})

	updateTask(deps, generationTaskId, {
		status: 'completed',
		statusText: nodeCreated || createdNodes.length > 0
			? t('aiworkflow.runtime.meshyImageCompleteWithNewNodes', { count: String(allUrls.length), nodes: String(createdNodes.length) })
			: t('aiworkflow.runtime.meshyImageCompleteCount', { count: String(allUrls.length) }),
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
	const pollStatusText = t('aiworkflow.runtime.meshyTaskStatus', { taskType, status, progress: String(progress) })

	updateTask(deps, generationTaskId, {
		statusText: pollStatusText,
		progress: progressPct
	})

	const node = (deps.store.state as any)?.nodesById?.[nodeId] as any
	if (node?.imageSettings?.meshyImageSettings) {
		deps.store.commit('setNodeImageSettings', {
			nodeId,
			imageSettings: {
				...node.imageSettings,
				meshyImageSettings: {
					...node.imageSettings.meshyImageSettings,
					taskStatus: status.toLowerCase(),
					progress: progressPct,
					statusText: pollStatusText,
				}
			}
		})
	}

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

const inferTaskProvider = (nodeType: string, params: Record<string, unknown>): string => {
	if (nodeType === 'image') {
		const rawModel = String(params?.imageModel ?? params?.model ?? '').trim().toLowerCase()
		if (rawModel === 'gemini' || rawModel === 'nanobanana' || rawModel.startsWith('gemini')) return 'gemini'
		if (rawModel === 'meshy') return 'meshy'
		if (rawModel.startsWith('jimeng')) return 'jimeng'
		if (rawModel === 'tripo3d') return 'tripo3d'
		return 'seedream'
	}
	if (nodeType === 'model3d') {
		const p = String(params?.provider ?? '').trim().toLowerCase()
		if (p === 'tripo3d' || p === 'tripo') return 'tripo3d'
		return 'meshy'
	}
	if (nodeType === 'video') {
		const rawModel = String(params?.videoModel ?? params?.model ?? '').trim().toLowerCase()
		if (rawModel.startsWith('jimeng')) return 'jimeng'
		return 'seedance'
	}
	return ''
}

const createTask = (payload: WorkflowNodeChatSubmitPayload): WorkflowNodeGenerationTask => ({
	id: makeTaskId(),
	nodeId: payload.nodeId,
	nodeType: payload.nodeType,
	provider: inferTaskProvider(payload.nodeType, payload.params ?? {}),
	status: 'submitting',
	statusText: t('aiworkflow.runtime.submittingTask'),
	progress: 5,
	startedAt: Date.now(),
	results: [],
	detailLines: [],
	prompt: payload.prompt || ''
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
	if (!payload.prompt.trim() && payload.nodeType !== 'model3d' && payload.nodeType !== 'image') {
		pushToast(deps, t('aiworkflow.toast.promptRequired'), 'warn')
		return { ok: false, error: t('aiworkflow.runtime.promptEmpty') }
	}

	const task = createTask(payload)

	const globalBridge = deps.globalTaskBridge
	let globalRegistered = false
	if (globalBridge) {
		const category = task.nodeType === 'video' ? 'video' : task.nodeType === 'model3d' ? '3d' : task.nodeType === 'text' ? 'custom' : 'image'
		const regResult = await globalBridge.registerTask({
			nodeId: task.nodeId,
			provider: task.provider || '',
			category: category as any,
			title: (task.prompt || '').slice(0, 50) || t('aiworkflow.runtime.taskDefaultTitle'),
			prompt: task.prompt,
			nodeType: payload.nodeType,
		})
		if (regResult.ok && 'taskId' in regResult && regResult.taskId) {
			task.globalTaskId = regResult.taskId
			task.clientRequestId = regResult.clientRequestId
			globalRegistered = true
		}
	}

	deps.store.commit('registerNodeGenerationTask', { task })
	deps.store.commit('setNodeChatSubmitting', { submitting: true })

	const syncGlobalProgress = (patch: { progress?: number; statusText?: string; status?: string }) => {
		if (!globalRegistered || !task.globalTaskId || !globalBridge) return
		void globalBridge.updateTask(task.globalTaskId, {
			progress: patch.progress,
			statusText: patch.statusText,
			status: patch.status === 'running' ? 'running' : patch.status === 'submitting' ? 'submitting' : undefined,
		})
	}

	const syncGlobalFail = (errorMessage: string) => {
		if (!globalRegistered || !task.globalTaskId || !globalBridge) return
		void globalBridge.failTask(task.globalTaskId, errorMessage)
	}

	const syncGlobalComplete = (resultUrl?: string, coverUrl?: string, statusText?: string) => {
		if (!globalRegistered || !task.globalTaskId || !globalBridge) return
		void globalBridge.completeTask(task.globalTaskId, { resultUrl, coverUrl, statusText })
	}

	const syncGlobalBindRemote = (remoteTaskId: string) => {
		if (!globalRegistered || !task.globalTaskId || !globalBridge) return
		void globalBridge.bindRemoteTask(task.globalTaskId, remoteTaskId)
	}

	try {
		let result: NodeGenerationResult
		if (payload.nodeType === 'text') {
			await runTextTask(deps, task, payload, { syncGlobalProgress, syncGlobalComplete, syncGlobalFail })
			result = { ok: true, taskType: 'other' }
		} else if (payload.nodeType === 'image') {
			const params = payload.params ?? {}
			const { kind } = normalizeImageModel(params)
			await runImageTask(deps, task, payload, { syncGlobalProgress, syncGlobalComplete, syncGlobalFail, syncGlobalBindRemote })
			result = { ok: true, taskType: kind === 'meshy' ? 'meshy-image' : kind === 'tripo3d' ? 'other' : 'other' }
		} else if (payload.nodeType === 'video') {
			await runVideoTask(deps, task, payload, { syncGlobalProgress, syncGlobalComplete, syncGlobalFail, syncGlobalBindRemote })
			result = { ok: true, taskType: 'other' }
		} else if (payload.nodeType === 'model3d') {
			const params = payload.params ?? {}
			const provider = String(params.provider || '').trim()
			if (provider === 'meshy') {
				const res = await runModel3dMeshyTask(deps, task, payload, { syncGlobalProgress, syncGlobalComplete, syncGlobalFail, syncGlobalBindRemote })
				result = {
					ok: res.ok,
					taskId: res.taskId,
					taskType: 'meshy-3d',
					mode: res.mode,
					error: res.error
				}
			} else if (provider === 'tripo3d') {
				const res = await runModel3dTripo3dTask(deps, task, payload, { syncGlobalProgress, syncGlobalComplete, syncGlobalFail, syncGlobalBindRemote })
				result = {
					ok: res.ok,
					taskId: res.taskId,
					taskType: 'other',
					mode: res.mode,
					error: res.error
				}
			} else {
				runModel3dStub(deps, task, payload)
				result = { ok: false, error: t('aiworkflow.runtime.unsupported3dProvider') }
			}
		} else {
			result = { ok: true, taskType: 'other' }
		}

		if (result.ok) {
			syncGlobalComplete(undefined, undefined, t('aiworkflow.runtime.completedStatus'))
		}
		return result
	} catch (err: unknown) {
		if (isUserAbortError(err)) {
			clearPendingPrompt()
			updateTask(deps, task.id, {
				status: 'cancelled',
				statusText: err.message || '已取消',
				finishedAt: Date.now()
			})
			if (globalRegistered && task.globalTaskId && globalBridge) {
				void globalBridge.updateTask(task.globalTaskId, { status: 'cancelled', statusText: err.message || '已取消' })
			}
			return { ok: false, error: 'aborted' }
		}
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
		syncGlobalFail(message)
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

type GlobalTaskSyncHelpers = {
	syncGlobalProgress?: (patch: { progress?: number; statusText?: string; status?: string }) => void
	syncGlobalComplete?: (resultUrl?: string, coverUrl?: string, statusText?: string) => void
	syncGlobalFail?: (errorMessage: string) => void
	syncGlobalBindRemote?: (remoteTaskId: string) => void
}

const runTextTask = async (
	deps: NodeGenerationApiDeps,
	task: WorkflowNodeGenerationTask,
	payload: WorkflowNodeChatSubmitPayload,
	syncHelpers?: GlobalTaskSyncHelpers
) => {
	const svc = getComfyService(deps)
	const params = payload.params ?? {}
	const modelSelection = String(params.model ?? params.provider ?? 'bytedance').toLowerCase()
	let provider = modelSelection
	let modelId = ''
	let providerDisplayName = ''

	if (modelSelection === 'gemini') {
		provider = 'gemini'
		modelId = String(params.geminiTextModelVersion ?? params.modelId ?? '').trim() || 'gemini-3.5-flash'
		providerDisplayName = 'Gemini'
	} else {
		provider = 'bytedance'
		modelId = String(params.textModelVersion ?? params.modelId ?? '').trim() || 'doubao-seed-evolving'
		providerDisplayName = '字节方舟 Doubao'
	}

	updateTask(deps, task.id, {
		status: 'running',
		statusText: t('aiworkflow.runtime.callingTextModelWithProvider', { provider: providerDisplayName }),
		progress: 15
	})
	appendDetail(deps, task.id, t('aiworkflow.runtime.detailAiModel', { model: modelId }))
	appendDetail(deps, task.id, t('aiworkflow.runtime.detailPrompt', { prompt: payload.prompt.slice(0, 120) }))

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
	// Add user @mentioned attachments
	if (payload.attachments && payload.attachments.length > 0) {
		for (const att of payload.attachments) {
			if (att.type === 'image_url' && att.data && att.data.startsWith('data:image/')) {
				refImages.push(att.data)
			}
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
	payload: WorkflowNodeChatSubmitPayload,
	syncHelpers?: GlobalTaskSyncHelpers
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
	if (task.clientRequestId) form.set('clientRequestId', task.clientRequestId)
	if (task.nodeId) form.set('nodeId', task.nodeId)
	if (task.globalTaskId) form.set('globalTaskId', task.globalTaskId)

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
		const meshyOutputImageCount = Number(params?.meshyOutputImageCount ?? 1)
		const meshySeed = Number(params?.meshySeed ?? -1)
		const taskType = hasRefImages ? 'image-to-image' : 'text-to-image'

		console.log('[Meshy Image - Node Chat] 原始参数:', {
			paramsMeshyImageAiModel: params?.meshyImageAiModel,
			paramsMeshyAspectRatio: params?.meshyAspectRatio,
			paramsAspectRatio: params?.aspectRatio,
			paramsMeshyNegativePrompt: params?.meshyNegativePrompt,
			paramsMeshyOutputImageCount: params?.meshyOutputImageCount,
			paramsMeshySeed: params?.meshySeed,
			meshyAiModel,
			meshyAspectRatio,
			meshyPoseMode,
			meshyGenerateMultiView,
			meshyNegativePrompt,
			meshyOutputImageCount,
			meshySeed,
			hasRefImages,
			refCount: refs.length,
			taskType,
			nodeId: payload.nodeId
		})

		appendDetail(deps, task.id, t('aiworkflow.runtime.detailMeshyMode', { mode: taskType }))
		appendDetail(deps, task.id, t('aiworkflow.runtime.detailAiModel', { model: meshyAiModel }))
		appendDetail(deps, task.id, t('aiworkflow.runtime.detailAspectRatio', { ratio: meshyGenerateMultiView ? 'Multi-View (1:1)' : meshyAspectRatio }))
		if (meshyPoseMode) appendDetail(deps, task.id, t('aiworkflow.runtime.detailPoseMode', { mode: meshyPoseMode }))
		if (meshyGenerateMultiView) appendDetail(deps, task.id, t('aiworkflow.runtime.multiViewEnabled'))
		appendDetail(deps, task.id, t('aiworkflow.runtime.detailOutputCount', { count: String(meshyOutputImageCount) }))
		if (meshyNegativePrompt) appendDetail(deps, task.id, t('aiworkflow.runtime.detailNegativePrompt', { prompt: meshyNegativePrompt.slice(0, 80) }))
		if (Number.isFinite(meshySeed) && meshySeed >= 0) appendDetail(deps, task.id, t('aiworkflow.runtime.detailSeed', { seed: String(meshySeed) }))
		if (hasRefImages) appendDetail(deps, task.id, t('aiworkflow.runtime.detailRefImageCount', { count: String(refs.length) }))

		try {
			// 构建 Meshy API 请求体 - 严格按照官方文档
			// 官方文档：https://docs.meshy.ai/zh/api/text-to-image
			// 官方文档：https://docs.meshy.ai/zh/api/image-to-image
			const meshyPayload: Record<string, unknown> = {
				mode: taskType,
				ai_model: meshyAiModel,
				prompt: payload.prompt
			}

			// 根据模式和参数互斥规则传递参数
			// text-to-image 和 image-to-image 都支持：aspect_ratio, generate_multi_view, pose_mode, negative_prompt, output_image_count, seed
			//   注意：generate_multi_view 为 true 时不能设置 aspect_ratio，且强制返回4张图片
			if (meshyPoseMode) meshyPayload.pose_mode = meshyPoseMode
			if (meshyGenerateMultiView) {
				meshyPayload.generate_multi_view = true
				meshyPayload.output_image_count = 4
			} else {
				meshyPayload.aspect_ratio = meshyAspectRatio || '1:1'
				console.log(`[Meshy Image - Node Chat] ${taskType}: EXPLICITLY setting aspect_ratio=${meshyPayload.aspect_ratio}, model=${meshyAiModel}`)
				if (Number.isFinite(meshyOutputImageCount) && meshyOutputImageCount > 0 && meshyOutputImageCount <= 4) {
					meshyPayload.output_image_count = Math.floor(meshyOutputImageCount)
				}
			}

			// 通用参数（两种模式都支持）
			if (meshyNegativePrompt) meshyPayload.negative_prompt = meshyNegativePrompt
			if (Number.isFinite(meshySeed) && meshySeed >= 0) {
				meshyPayload.seed = Math.floor(meshySeed)
			}

			console.log('[Meshy Image] 提交参数:', JSON.stringify(meshyPayload, null, 2))

			// 记录完整提交参数（用于任务面板显示，不发送给API）
			const submittedParams = {
				model: meshyAiModel,
				mode: taskType,
				aspectRatio: meshyGenerateMultiView ? '1:1 (Multi-View)' : meshyAspectRatio,
				poseMode: meshyPoseMode || 'None',
				generateMultiView: meshyGenerateMultiView,
				negativePrompt: meshyNegativePrompt || 'None',
				outputCount: meshyGenerateMultiView ? 4 : (Number.isFinite(meshyOutputImageCount) && meshyOutputImageCount > 0 ? Math.floor(meshyOutputImageCount) : 1),
				seed: Number.isFinite(meshySeed) && meshySeed >= 0 ? Math.floor(meshySeed) : 'Random',
				referenceImageCount: hasRefImages ? refs.length : 0,
				submittedAt: new Date().toISOString()
			}

			// 将submittedParams添加到请求payload中，确保后端能记录
			meshyPayload.submittedParams = submittedParams

			updateTask(deps, task.id, { statusText: t('aiworkflow.runtime.creatingMeshyTask', { taskType }), progress: 20 })

			// 关键修复：统一使用FormData + meshyGenerateImage路径处理所有情况（文生图/图生图）
			// 确保参数类型转换一致（布尔值、数字、JSON对象都经过正确处理）
			const form = new FormData()
			for (const key of Object.keys(meshyPayload)) {
				const value = meshyPayload[key]
				if (typeof value === 'object' && value !== null) {
					form.set(key, JSON.stringify(value))
				} else if (typeof value === 'boolean') {
					form.set(key, value ? 'true' : 'false')
				} else if (typeof value === 'number') {
					form.set(key, String(value))
				} else {
					form.set(key, String(value))
				}
			}
			for (const ref of refs) {
				form.append('refImages', ref.blob, ref.name)
			}

			const projectIdForForm = deps.getProjectId?.() ?? null
			if (projectIdForForm != null) form.set('projectId', String(projectIdForForm))
			if (task.clientRequestId) form.set('clientRequestId', task.clientRequestId)
			if (task.nodeId) form.set('nodeId', task.nodeId)
			if (task.globalTaskId) form.set('globalTaskId', task.globalTaskId)

			console.log('[Meshy Image - Node Chat] 发送请求（统一FormData路径），hasRefImages:', hasRefImages, 'refCount:', refs.length)
			const createRes = await svc.meshyGenerateImage(form)
			if (!createRes.ok) {
				throw new Error(String(createRes.error || t('aiworkflow.runtime.meshyTaskCreateFailed')))
			}
			const newTaskId = String(createRes.taskId || '').trim()
			if (!newTaskId) throw new Error(t('aiworkflow.runtime.meshyEmptyTaskId'))
			appendDetail(deps, task.id, t('aiworkflow.runtime.detailTaskCreated', { taskId: newTaskId }))

			// 标记图片节点的 imageGenerationSource 为 meshy，使任务面板能找到该节点
			deps.store.commit('setNodeImageSettings', {
				nodeId: payload.nodeId,
				imageSettings: {
					imageGenerationSource: 'meshy',
					meshyImageSettings: {
						taskId: newTaskId,
						taskStatus: 'pending',
						taskFamily: taskType,
						progress: 20,
						statusText: t('aiworkflow.runtime.meshyTaskCreatedStatus', { taskType }),
						submittedParams
					}
				}
			})
			syncHelpers?.syncGlobalBindRemote?.(newTaskId)

			// 轮询任务状态
			await pollMeshyTaskStatus(deps, svc, newTaskId, task.id, payload.nodeId, taskType)

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

	// Gemini/NanoBanana 图片生成任务（流式SSE，使用官方API）
	if (kind === 'gemini') {
		const geminiModelVersion = model
		const geminiImageSize = String(params?.geminiImageSize || params?.imageSize || '2K').trim()
		const geminiAspectRatio = String(
			params?.geminiAspectRatio || 
			params?.aspectRatio || 
			'1:1'
		).trim()
		const geminiQuantity = Math.max(1, Math.min(4, Number(params?.geminiQuantity ?? params?.quantity ?? 1)))
		const geminiThinkingLevel = String(params?.geminiThinkingLevel || params?.thinkingLevel || 'minimal').trim()
		const geminiNegativePrompt = String(params?.geminiNegativePrompt || params?.negativePrompt || '').trim()

		console.log('[Gemini Image - Node Chat] 原始参数:', {
			geminiModelVersion,
			geminiImageSize,
			geminiAspectRatio,
			geminiQuantity,
			geminiThinkingLevel,
			geminiNegativePrompt,
			hasRefImages,
			refCount: refs.length,
			nodeId: payload.nodeId,
			projectId: imgProjectId,
			prompt: payload.prompt.slice(0, 200)
		})

		appendDetail(deps, task.id, t('aiworkflow.runtime.detailAiModel', { model: geminiModelVersion }))
		appendDetail(deps, task.id, t('aiworkflow.runtime.detailResolution', { size: geminiImageSize, ratio: geminiAspectRatio }))
		appendDetail(deps, task.id, t('aiworkflow.runtime.detailOutputCount', { count: String(geminiQuantity) }))
		if (geminiNegativePrompt) appendDetail(deps, task.id, t('aiworkflow.runtime.detailNegativePrompt', { prompt: geminiNegativePrompt.slice(0, 80) }))
		if (hasRefImages) appendDetail(deps, task.id, t('aiworkflow.runtime.detailRefImageCount', { count: String(refs.length) }))

		try {
			// 将参考图片转换为base64 data URI
			const refImages: string[] = []
			for (const ref of refs) {
				try {
					const dataUri = await blobToBase64DataUri(ref.blob)
					if (dataUri) refImages.push(dataUri)
				} catch (refErr) {
					console.warn('[Gemini Image] 参考图片转换失败:', refErr)
				}
			}

			// 构造提交给后端的参数
			const geminiPayload: Record<string, unknown> = {
				prompt: payload.prompt,
				model: geminiModelVersion,
				modelId: geminiModelVersion,
				imageSize: geminiImageSize,
				image_size: geminiImageSize,
				aspectRatio: geminiAspectRatio,
				aspect_ratio: geminiAspectRatio,
				numImages: geminiQuantity,
				num_images: geminiQuantity,
				quantity: geminiQuantity,
				thinkingLevel: geminiThinkingLevel,
				thinking_level: geminiThinkingLevel,
				negativePrompt: geminiNegativePrompt,
				negative_prompt: geminiNegativePrompt,
				refImages: refImages,
				reference_images: refImages,
				projectId: imgProjectId,
				nodeId: payload.nodeId
			}

			// 记录完整提交参数（用于任务面板显示）
			const submittedParams = {
				model: geminiModelVersion,
				imageSize: geminiImageSize,
				aspectRatio: geminiAspectRatio,
				numImages: geminiQuantity,
				thinkingLevel: geminiThinkingLevel,
				negativePrompt: geminiNegativePrompt || 'None',
				referenceImageCount: refImages.length,
				submittedAt: new Date().toISOString()
			}

			updateTask(deps, task.id, { statusText: t('aiworkflow.runtime.callingGeminiApi'), progress: 20 })

			// 标记图片节点的 imageGenerationSource 为 gemini
			deps.store.commit('setNodeImageSettings', {
				nodeId: payload.nodeId,
				imageSettings: {
					imageGenerationSource: 'gemini',
					geminiImageSettings: {
						taskStatus: 'submitting',
						progress: 20,
						statusText: t('aiworkflow.runtime.geminiTaskSubmitting'),
						submittedParams
					}
				}
			})

			// 调用Gemini图片生成流式接口
			const state = deps.store.state as {
				nodesById: Record<string, Record<string, unknown>>
			}
			const sourceNode = state.nodesById[payload.nodeId]
			const sourceWorldX = Number(sourceNode?.worldX ?? 0)
			const sourceWorldY = Number(sourceNode?.worldY ?? 0)
			const NODE_SPACING = 350

			let produced = 0
			let targetNodeId = payload.nodeId
			const createdNodes: string[] = []

			for await (const ev of svc.geminiImageGenerateStream(geminiPayload)) {
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
						// 优先使用dwebUrl，其次是imageUrl
						let sourceUrl = String(obj.dwebUrl || obj.imageUrl || '').trim()
						if (!sourceUrl) continue

						let bindNodeId = targetNodeId
						let isNewNode = false

						if (produced > 0) {
							if (typeof deps.createImageNodeAt === 'function') {
								const newX = sourceWorldX + NODE_SPACING * produced
								const newY = sourceWorldY
								const newNodeId = deps.createImageNodeAt(newX, newY, sourceUrl, t('aiworkflow.runtime.geminiResultNodeNameIndexed', { index: String(produced + 1) }))
								if (newNodeId) {
									bindNodeId = newNodeId
									isNewNode = true
									createdNodes.push(newNodeId)
								}
							} else if (typeof deps.createImageNodeAtCenter === 'function') {
								const newNodeId = deps.createImageNodeAtCenter(sourceUrl, t('aiworkflow.runtime.geminiResultNodeNameIndexed', { index: String(produced + 1) }))
								if (newNodeId) {
									bindNodeId = newNodeId
									isNewNode = true
									createdNodes.push(newNodeId)
								}
							}
						}

						let finalUrl = ''
						if (typeof deps.bindImageResultToNode === 'function') {
							const bindRet = await deps.bindImageResultToNode(bindNodeId, sourceUrl)
							if (bindRet === false || bindRet === undefined || bindRet === null) {
								appendDetail(deps, task.id, t('aiworkflow.runtime.imageImportFailed'))
								continue
							}
							finalUrl = typeof bindRet === 'string' ? bindRet : deps.resolveBackendUrl(sourceUrl)
						} else {
							finalUrl = deps.resolveBackendUrl(sourceUrl)
						}
						appendResult(deps, task.id, { kind: 'image', url: finalUrl, label: t('aiworkflow.runtime.imageLabel', { index: String(produced + 1) }) })
						
						if (isNewNode) {
							deps.store.commit('setNodeImageSettings', {
								nodeId: bindNodeId,
								imageSettings: {
									imageGenerationSource: 'gemini',
									geminiImageSettings: {
										taskStatus: 'completed',
										progress: 100,
										statusText: t('tasks.gemini.statusCompleted'),
										imageUrls: [finalUrl],
										thumbnailUrl: finalUrl
									}
								}
							})
						}

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
					const statusPayload =
						typeof message.payload === 'object' && message.payload
							? (message.payload as Record<string, unknown>)
							: {}
					const line = String(statusPayload.message ?? statusPayload.phase ?? '')
					if (line) {
						appendDetail(deps, task.id, line)
						updateTask(deps, task.id, {
							statusText: line,
							progress: Number(statusPayload.progress) || task.progress
						})
					}
					continue
				}
				if (message?.type === 'agentToUi/error') {
					const errPayload =
						typeof message.payload === 'object' && message.payload
							? (message.payload as Record<string, unknown>)
							: {}
					const line = String(errPayload.message ?? 'unknown')
					throw new Error(line)
				}
			}

			if (produced === 0) throw new Error(t('aiworkflow.runtime.noImagesReceived'))
			updateTask(deps, task.id, {
				status: 'completed',
				statusText: createdNodes.length > 0
					? t('aiworkflow.runtime.geminiImageCompleteWithNewNodes', { count: String(produced), nodes: String(createdNodes.length) })
					: t('aiworkflow.runtime.imageGenerationComplete', { count: String(produced) }),
				progress: 100,
				finishedAt: Date.now()
			})

			return
		} catch (err: unknown) {
			const errMsg = getErrorMessage(err)
			pushToast(deps, t('aiworkflow.toast.geminiGenerateFailed', { error: errMsg }), 'error')
			updateTask(deps, task.id, {
				status: 'error',
				statusText: t('aiworkflow.runtime.failedStatus', { message: errMsg }),
				progress: 0,
				finishedAt: Date.now()
			})
			deps.store.commit('setNodeImageSettings', {
				nodeId: payload.nodeId,
				imageSettings: {
					imageGenerationSource: 'gemini',
					geminiImageSettings: {
						taskStatus: 'failed',
						progress: 0,
						statusText: errMsg,
						errorMessage: errMsg
					}
				}
			})
			throw err
		}
	}

	// Tripo3D 图片生成任务（异步任务模式）
	if (kind === 'tripo3d') {
		// 重新收集参考图，确保是最新状态
		const tripo3dRefs = await collectReferenceImages(deps, payload.nodeId, 5)
		const tripo3dHasRefImages = tripo3dRefs.length > 0

		const tripo3dImageModel = String(params?.tripo3dImageModel || model || 'seedream_v4').trim()
		const tripo3dImageSize = String(params?.tripo3dImageSize || params?.imageSize || '').trim()
		const tripo3dImageAspectRatio = String(params?.tripo3dImageAspectRatio || params?.aspectRatio || '').trim()
		const tripo3dImageOutputFormat = String((params as Record<string, unknown>)?.tripo3dImageOutputFormat || (params as Record<string, unknown>)?.outputFormat || 'png').trim() as 'png' | 'jpeg'
		const tripo3dImageWatermark = Boolean((params as Record<string, unknown>)?.tripo3dImageWatermark ?? (params as Record<string, unknown>)?.watermark ?? false)
		const tripo3dImageNumOutputs = Number((params as Record<string, unknown>)?.tripo3dImageNumOutputs ?? (params as Record<string, unknown>)?.quantity ?? 1)
		const tripo3dImageNegativePrompt = String((params as Record<string, unknown>)?.tripo3dImageNegativePrompt || (params as Record<string, unknown>)?.negativePrompt || '').trim()
		const tripo3dImageSeed = Number((params as Record<string, unknown>)?.tripo3dImageSeed ?? (params as Record<string, unknown>)?.seed ?? -1)
		const tripo3dImageStrength = Number((params as Record<string, unknown>)?.tripo3dImageStrength ?? (params as Record<string, unknown>)?.strength ?? 0.7)
		const tripo3dImageTemplate = String(params?.tripo3dImageTemplate || '').trim()
		const tripo3dUserMode = String(params?.tripo3dImageMode || '').trim()
		const tripo3dImageForceSingleImage = Boolean((params as Record<string, unknown>)?.tripo3dImageForceSingleImage)

		// 模式判断：优先根据参考图自动判断，用户手动选择仅作为补充
		let effectiveMode: 'text_to_image' | 'image_to_image' | 'image_to_multiview'
		if (tripo3dRefs.length === 0) {
			effectiveMode = 'text_to_image'
		} else if (tripo3dRefs.length === 1 || tripo3dImageForceSingleImage) {
			effectiveMode = 'image_to_image'
		} else {
			effectiveMode = 'image_to_multiview'
		}

		// 如果用户明确指定了模式，并且模式与参考图情况兼容，则使用用户指定的模式
		if (tripo3dUserMode === 'text_to_image' && tripo3dRefs.length === 0) {
			effectiveMode = 'text_to_image'
		} else if (tripo3dUserMode === 'image_to_image' && tripo3dRefs.length > 0) {
			effectiveMode = 'image_to_image'
		} else if (tripo3dUserMode === 'image_to_multiview' && tripo3dRefs.length >= 2) {
			effectiveMode = 'image_to_multiview'
		}

		console.info('[Tripo3D Image - Node Chat] 模式判断:', {
			tripo3dUserMode,
			tripo3dRefsCount: tripo3dRefs.length,
			tripo3dHasRefImages,
			tripo3dImageForceSingleImage,
			effectiveMode,
			nodeId: payload.nodeId,
			prompt: payload.prompt
		})

		const finalPrompt = payload.prompt.trim()
		if (!finalPrompt && effectiveMode === 'text_to_image') {
			pushToast(deps, t('aiworkflow.toast.promptRequired'), 'warn')
			updateTask(deps, task.id, {
				status: 'error',
				statusText: t('aiworkflow.runtime.promptEmpty'),
				progress: 0,
				finishedAt: Date.now()
			})
			deps.store.commit('setNodeChatSubmitting', { submitting: false })
			return
		}

		if ((effectiveMode === 'image_to_image' || effectiveMode === 'image_to_multiview') && tripo3dRefs.length === 0) {
			pushToast(deps, t('tasks.tripo3d.imageToModelRequiresImage'), 'warn')
			updateTask(deps, task.id, {
				status: 'error',
				statusText: t('tasks.tripo3d.imageToModelRequiresImage'),
				progress: 0,
				finishedAt: Date.now()
			})
			deps.store.commit('setNodeChatSubmitting', { submitting: false })
			return
		}

		appendDetail(deps, task.id, t('aiworkflow.runtime.detailTripo3dMode', { mode: effectiveMode }))
		appendDetail(deps, task.id, t('aiworkflow.runtime.detailAiModel', { model: tripo3dImageModel }))
		if (effectiveMode !== 'image_to_multiview') {
			if (tripo3dImageSize && !tripo3dImageModel.startsWith('banana')) {
				appendDetail(deps, task.id, t('aiworkflow.runtime.detailResolution', { size: tripo3dImageSize, ratio: tripo3dImageAspectRatio || 'Default' }))
			}
			if (tripo3dImageModel.startsWith('banana') && tripo3dImageAspectRatio) {
				appendDetail(deps, task.id, t('aiworkflow.runtime.detailAspectRatio', { ratio: tripo3dImageAspectRatio }))
			}
			appendDetail(deps, task.id, t('aiworkflow.runtime.detailOutputCount', { count: String(Math.min(4, Math.max(1, Math.floor(tripo3dImageNumOutputs)))) }))
			if (tripo3dImageNegativePrompt) appendDetail(deps, task.id, t('aiworkflow.runtime.detailNegativePrompt', { prompt: tripo3dImageNegativePrompt.slice(0, 80) }))
			if (Number.isFinite(tripo3dImageSeed) && tripo3dImageSeed >= 0) appendDetail(deps, task.id, t('aiworkflow.runtime.detailSeed', { seed: String(Math.floor(tripo3dImageSeed)) }))
		}
		if (tripo3dHasRefImages) appendDetail(deps, task.id, t('aiworkflow.runtime.detailRefImageCount', { count: String(tripo3dRefs.length) }))

		try {
			const isBananaModel = tripo3dImageModel.startsWith('banana')
			const isSeedreamModel = tripo3dImageModel.startsWith('seedream')

			const tripo3dPayload: Record<string, unknown> = {
				model: tripo3dImageModel,
			}

			if (effectiveMode !== 'image_to_multiview') {
				if (finalPrompt) tripo3dPayload.prompt = finalPrompt
				if (tripo3dImageNegativePrompt) tripo3dPayload.negative_prompt = tripo3dImageNegativePrompt
				tripo3dPayload.output_format = tripo3dImageOutputFormat === 'jpeg' ? 'jpeg' : 'png'
				tripo3dPayload.num_outputs = Number.isFinite(tripo3dImageNumOutputs) && tripo3dImageNumOutputs >= 1 && tripo3dImageNumOutputs <= 4
					? Math.floor(tripo3dImageNumOutputs)
					: 1

				if (isBananaModel && tripo3dImageAspectRatio) {
					tripo3dPayload.aspect_ratio = tripo3dImageAspectRatio
				} else if (tripo3dImageSize) {
					tripo3dPayload.size = tripo3dImageSize
				}

				if (isSeedreamModel && tripo3dImageWatermark !== undefined) {
					tripo3dPayload.watermark = Boolean(tripo3dImageWatermark)
				}

				if (tripo3dImageTemplate && (effectiveMode === 'text_to_image' || effectiveMode === 'image_to_image')) {
					tripo3dPayload.template = tripo3dImageTemplate
				}

				if (Number.isFinite(tripo3dImageSeed) && tripo3dImageSeed >= 0) {
					tripo3dPayload.seed = Math.floor(tripo3dImageSeed)
				}
			}

			let imageDataUris: string[] = []
			if (effectiveMode === 'image_to_image' || effectiveMode === 'image_to_multiview') {
				updateTask(deps, task.id, { statusText: t('aiworkflow.runtime.uploadingTripo3DImage'), progress: 10 })
				appendDetail(deps, task.id, t('aiworkflow.runtime.uploadingImage'))

				// 上传所有参考图，获取file tokens
				const fileTokens: string[] = []
				for (let i = 0; i < tripo3dRefs.length; i++) {
					const ref = tripo3dRefs[i]
					if (!ref?.blob) {
						throw new Error(t('aiworkflow.runtime.refImageReadFailed'))
					}
					const dataUri = await blobToBase64DataUri(ref.blob)
					if (!dataUri) {
						throw new Error(t('aiworkflow.runtime.refImageReadFailed'))
					}
					imageDataUris.push(dataUri)

					const uploadRes = await svc.tripo3dUploadFile({
						fileData: dataUri,
						fileName: `reference-${i + 1}-${Date.now()}.png`,
						fileType: 'image/png'
					})
					if (!uploadRes.ok) {
						throw new Error(t('aiworkflow.runtime.tripo3dUploadFailed', { error: String(uploadRes.error || 'unknown') }))
					}
					const fileToken = String(uploadRes.fileToken || '').trim()
					if (!fileToken) {
						throw new Error(t('aiworkflow.runtime.tripo3dEmptyFileToken'))
					}
					fileTokens.push(fileToken)
					appendDetail(deps, task.id, t('aiworkflow.runtime.detailFileToken', { token: fileToken }))
				}

				// 设置input/inputs参数
				if (effectiveMode === 'image_to_multiview' && fileTokens.length >= 2) {
					tripo3dPayload.inputs = fileTokens
					tripo3dPayload.input = fileTokens[0]
				} else {
					tripo3dPayload.input = fileTokens[0]
				}

				if (effectiveMode === 'image_to_image') {
					const strengthValue = Number.isFinite(tripo3dImageStrength) && tripo3dImageStrength >= 0 && tripo3dImageStrength <= 1
						? tripo3dImageStrength
						: 0.7
					tripo3dPayload.strength = strengthValue
				}
			}

			console.info('[Tripo3D Image - Node Chat] 最终请求payload:', {
				mode: effectiveMode,
				model: tripo3dImageModel,
				hasPrompt: !!tripo3dPayload.prompt,
				hasInput: !!tripo3dPayload.input,
				hasInputs: !!tripo3dPayload.inputs,
				refCount: tripo3dRefs.length,
				payloadKeys: Object.keys(tripo3dPayload)
			})

			const submittedParams = {
				model: tripo3dImageModel,
				mode: effectiveMode,
				size: (tripo3dPayload.size as string) || 'Default',
				aspectRatio: (tripo3dPayload.aspect_ratio as string) || 'None',
				outputFormat: tripo3dPayload.output_format as string,
				watermark: tripo3dPayload.watermark as boolean | undefined,
				template: (tripo3dPayload.template as string) || 'None',
				numOutputs: (tripo3dPayload.num_outputs as number) || 1,
				negativePrompt: tripo3dImageNegativePrompt || 'None',
				seed: Number.isFinite(tripo3dImageSeed) && tripo3dImageSeed >= 0 ? Math.floor(tripo3dImageSeed) : 'Random',
				strength: (effectiveMode === 'image_to_image' || effectiveMode === 'image_to_multiview') ? (tripo3dPayload.strength as number) : undefined,
				referenceImageCount: tripo3dHasRefImages ? tripo3dRefs.length : 0,
				submittedAt: new Date().toISOString()
			}

			updateTask(deps, task.id, { statusText: t('aiworkflow.runtime.creatingTripo3dTask', { mode: effectiveMode }), progress: 20 })

			deps.store.commit('setNodeImageSettings', {
				nodeId: payload.nodeId,
				imageSettings: {
					imageGenerationSource: 'tripo3d',
					tripo3dImageSettings: {
						taskStatus: 'submitting',
						taskFamily: effectiveMode,
						progress: 20,
						statusText: t('aiworkflow.runtime.tripo3dSubmitting'),
						submittedParams,
						imageUrls: imageDataUris
					}
				}
			})

			let createRes: Tripo3DGenerateResponse
			if (effectiveMode === 'text_to_image') {
				createRes = await svc.tripo3dGenerateTextToImage(tripo3dPayload as any)
			} else if (effectiveMode === 'image_to_image') {
				createRes = await svc.tripo3dGenerateImageToImage(tripo3dPayload as any)
			} else {
				createRes = await svc.tripo3dGenerateImageToMultiview(tripo3dPayload as any)
			}

			if (!createRes.ok) {
				throw new Error(String(createRes.error || t('tasks.tripo3d.createTaskFailed')))
			}

			const newTaskId = String(createRes.taskId || '').trim()
			if (!newTaskId) throw new Error(t('tasks.tripo3d.missingTaskId'))
			appendDetail(deps, task.id, t('aiworkflow.runtime.detailTaskCreated', { taskId: newTaskId }))

			deps.store.commit('setNodeImageSettings', {
				nodeId: payload.nodeId,
				imageSettings: {
					imageGenerationSource: 'tripo3d',
					tripo3dImageSettings: {
						taskId: newTaskId,
						taskStatus: 'pending',
						taskFamily: effectiveMode,
						progress: 0,
						statusText: t('tasks.tripo3d.taskCreatedPolling'),
						submittedParams
					}
				}
			})

			const state2 = deps.store.state as { nodesById: Record<string, Record<string, unknown>> }
			const sourceNode = state2.nodesById[payload.nodeId]
			const sourceWorldX = Number(sourceNode?.worldX ?? 0)
			const sourceWorldY = Number(sourceNode?.worldY ?? 0)
			const NODE_SPACING = 350

			const maxPolls = 180
			const pollInterval = 3000
			let produced = 0

			for (let pollI = 0; pollI < maxPolls; pollI++) {
				await new Promise((r) => setTimeout(r, pollInterval))

				const taskRes = await svc.tripo3dTask(newTaskId)
				if (!taskRes.ok) {
					appendDetail(deps, task.id, t('aiworkflow.runtime.pollFailed', { status: String(taskRes.status), error: String(taskRes.error) }))
					continue
				}

				const status = String(taskRes.status || '').trim().toLowerCase()
				const progress = Number(taskRes.progress ?? 0)
				const progressPct = status === 'success' || status === 'succeeded' || status === 'completed'
					? 100
					: Math.min(95, Math.max(10, progress))

				const statusText = t('aiworkflow.runtime.tripo3dTaskStatus', { taskMode: effectiveMode, status, progress: String(progress) })
				updateTask(deps, task.id, { statusText, progress: progressPct })

				deps.store.commit('setNodeImageSettings', {
					nodeId: payload.nodeId,
					imageSettings: {
						imageGenerationSource: 'tripo3d',
						tripo3dImageSettings: {
							taskId: newTaskId,
							taskStatus: status === 'failed' || status === 'error' ? 'failed' : status === 'cancelled' || status === 'canceled' ? 'canceled' : 'running',
							taskFamily: effectiveMode,
							progress: progressPct,
							statusText
						}
					}
				})

				if (status === 'failed' || status === 'error') {
					const errMsg = String(taskRes.errorMessage || t('aiworkflow.runtime.unknownError'))
					throw new Error(t('aiworkflow.runtime.tripo3dTaskFailed', { error: errMsg }))
				}

				if (status === 'cancelled' || status === 'canceled') {
					throw new Error(t('aiworkflow.runtime.tripo3dTaskCanceled'))
				}

				if (status === 'success' || status === 'succeeded' || status === 'completed') {
					const rawImageUrls = Array.isArray((taskRes as any).imageUrls) ? (taskRes as any).imageUrls as string[] : []
					const thumbnailUrl = String(taskRes.thumbnailUrl || '').trim()

					const allUrls: string[] = []
					const urlSet = new Set<string>()
					for (const u of rawImageUrls) {
						const us = String(u || '').trim()
						if (us && !urlSet.has(us)) { urlSet.add(us); allUrls.push(us) }
					}
					if (thumbnailUrl && !urlSet.has(thumbnailUrl)) { urlSet.add(thumbnailUrl); allUrls.unshift(thumbnailUrl) }

					if (allUrls.length === 0) {
						throw new Error(t('aiworkflow.runtime.tripo3dNoImages'))
					}

					const targetNodeId = payload.nodeId
					const createdNodes: string[] = []

					for (let imgI = 0; imgI < allUrls.length; imgI++) {
						const imageUrl = allUrls[imgI]
						if (!imageUrl) continue

						const resolvedUrl = deps.resolveBackendUrl(imageUrl)
						let finalUrl = resolvedUrl
						let persistFailed = false

						if (typeof deps.persistExternalAssetToProject === 'function') {
							try {
								const ext = String(imageUrl).split('?')[0].match(/\.[^.]+$/)?.[0] || '.png'
								const fileName = `tripo3d-img-${newTaskId}-${imgI}${ext}`
								const persisted = await deps.persistExternalAssetToProject({
									kind: 'image',
									name: fileName,
									sourceUrl: resolvedUrl
								})
								if (persisted && persisted.url) {
									finalUrl = persisted.url
								} else {
									persistFailed = true
								}
							} catch (e) {
								persistFailed = true
								console.warn('[Tripo3D Image Poll] 持久化失败:', e)
							}
						}

						let bindNodeId = targetNodeId
						let isNewNode = false
						if (produced > 0) {
							if (typeof deps.createImageNodeAt === 'function') {
								const newX = sourceWorldX + NODE_SPACING * produced
								const newY = sourceWorldY
								const newNodeId = deps.createImageNodeAt(newX, newY, finalUrl, t('aiworkflow.runtime.tripo3dResultNodeNameIndexed', { index: String(produced + 1) }))
								if (newNodeId) { bindNodeId = newNodeId; isNewNode = true; createdNodes.push(newNodeId) }
							} else if (typeof deps.createImageNodeAtCenter === 'function') {
								const newNodeId = deps.createImageNodeAtCenter(finalUrl, t('aiworkflow.runtime.tripo3dResultNodeNameIndexed', { index: String(produced + 1) }))
								if (newNodeId) { bindNodeId = newNodeId; isNewNode = true; createdNodes.push(newNodeId) }
							}
						}

						let bound = true
						if (typeof deps.bindImageResultToNode === 'function') {
							try {
								const bindRet = await deps.bindImageResultToNode(bindNodeId, finalUrl)
								bound = bindRet !== false
							} catch (e) {
								bound = false
								console.warn('[Tripo3D Image Poll] 绑定图片失败:', e)
							}
						}

						if (bound) {
							appendResult(deps, task.id, { kind: 'image', url: finalUrl, label: t('aiworkflow.runtime.imageLabel', { index: String(produced + 1) }) })
						}

						if (isNewNode) {
							deps.store.commit('setNodeImageSettings', {
								nodeId: bindNodeId,
								imageSettings: {
									imageGenerationSource: 'tripo3d',
									tripo3dImageSettings: {
										taskStatus: 'completed',
										progress: 100,
										statusText: t('tasks.tripo3d.statusCompleted'),
										imageUrls: [finalUrl],
										thumbnailUrl: finalUrl
									}
								}
							})
						}

						produced++
					}

					deps.store.commit('setNodeImageSettings', {
						nodeId: payload.nodeId,
						imageSettings: {
							imageGenerationSource: 'tripo3d',
							tripo3dImageSettings: {
								taskId: newTaskId,
								taskStatus: produced > 0 ? 'completed' : 'failed',
								taskFamily: effectiveMode,
								progress: 100,
								statusText: produced > 0
									? t('aiworkflow.runtime.tripo3dComplete')
									: t('aiworkflow.runtime.tripo3dCompleteFetchFailed'),
								imageUrls: allUrls.map(u => deps.resolveBackendUrl(u)),
								thumbnailUrl: thumbnailUrl ? deps.resolveBackendUrl(thumbnailUrl) : (allUrls.length > 0 ? deps.resolveBackendUrl(allUrls[0]) : ''),
								outputSummary: {
									preferredUrl: produced > 0 ? deps.resolveBackendUrl(allUrls[0]) : '',
									imageUrls: allUrls.map(u => deps.resolveBackendUrl(u)),
									thumbnailUrl: thumbnailUrl ? deps.resolveBackendUrl(thumbnailUrl) : ''
								}
							}
						}
					})

					updateTask(deps, task.id, {
						status: produced > 0 ? 'completed' : 'error',
						statusText: produced > 0
							? t('aiworkflow.runtime.imageGenerationComplete', { count: String(produced) })
							: t('aiworkflow.runtime.tripo3dCompleteFetchFailed'),
						progress: 100,
						finishedAt: Date.now()
					})

					return
				}
			}

			throw new Error(t('aiworkflow.runtime.tripo3dPollTimeout'))
		} catch (err: unknown) {
			const errMsg = getErrorMessage(err)
			pushToast(deps, t('aiworkflow.toast.tripo3dGenerateFailed', { error: errMsg }), 'error')
			updateTask(deps, task.id, {
				status: 'error',
				statusText: t('aiworkflow.runtime.failedStatus', { message: errMsg }),
				progress: 0,
				finishedAt: Date.now()
			})
			deps.store.commit('setNodeImageSettings', {
				nodeId: payload.nodeId,
				imageSettings: {
					imageGenerationSource: 'tripo3d',
					tripo3dImageSettings: {
						taskStatus: 'failed',
						progress: 0,
						statusText: errMsg,
						errorMessage: errMsg
					}
				}
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
				let finalUrl = ''
				if (typeof deps.bindImageResultToNode === 'function') {
					const bindRet = await deps.bindImageResultToNode(payload.nodeId, sourceUrl)
					if (bindRet === false || bindRet === undefined || bindRet === null) {
						appendDetail(deps, task.id, t('aiworkflow.runtime.imageImportFailed'))
						continue
					}
					finalUrl = typeof bindRet === 'string' ? bindRet : deps.resolveBackendUrl(sourceUrl)
				} else {
					finalUrl = deps.resolveBackendUrl(sourceUrl)
				}
				appendResult(deps, task.id, { kind: 'image', url: finalUrl, label: t('aiworkflow.runtime.imageLabel', { index: String(produced + 1) }) })
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
	payload: WorkflowNodeChatSubmitPayload,
	syncHelpers?: GlobalTaskSyncHelpers
) => {
	const svc = getComfyService(deps)
	const params = payload.params ?? {}
	const { kind, model } = normalizeVideoModel(params)
	appendDetail(deps, task.id, t('aiworkflow.runtime.detailModel', { model }))
	appendDetail(deps, task.id, t('aiworkflow.runtime.detailPrompt', { prompt: payload.prompt.slice(0, 120) }))

	const form = new FormData()
	form.set('prompt', payload.prompt)
	form.set('model', model)
	const projectId = deps.getProjectId?.() ?? null
	if (projectId != null) form.set('projectId', String(projectId))
	if (task.clientRequestId) form.set('clientRequestId', task.clientRequestId)
	if (task.nodeId) form.set('nodeId', task.nodeId)
	if (task.globalTaskId) form.set('globalTaskId', task.globalTaskId)
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
	form.set('cameraFixed', params.cameraFixed ? '1' : '0')
	form.set('returnLastFrame', params.returnLastFrame ? '1' : '0')
	form.set('enableWebSearch', params.enableWebSearch ? '1' : '0')
	const priority = Number(params.priority ?? 0)
	if (Number.isFinite(priority) && priority >= 0) {
		form.set('priority', String(Math.min(9, Math.floor(priority))))
	}

	let hasVideoReferences = false

	if (kind === 'seedance') {
		const [imageRefs, videoRefs] = await Promise.all([
			collectReferenceImages(deps, payload.nodeId, 9),
			collectReferenceVideos(deps, payload.nodeId, 3),
		])
		for (const ref of imageRefs) form.append('refImages', ref.blob, ref.name)
		for (const ref of videoRefs) form.append('refVideos', ref.blob, ref.name)
		hasVideoReferences = videoRefs.length > 0
		const rawMode = (typeof params.mode === 'string' ? params.mode : '') as string
		if (rawMode === 'image_to_video') form.set('refMode', 'first')
		else if (rawMode === 'first-last') form.set('refMode', 'first-last')
		else if (rawMode === 'reference') form.set('refMode', 'reference')
		else if (rawMode === 'video_edit') form.set('refMode', 'video_edit')
		else form.set('refMode', 'auto')
	}

	if (hasVideoReferences) {
		const checkResult = await checkVideoReferencePrerequisites(true)
		if (!checkResult.canProceed) {
			throw new UserAbortError('需要配置云存储')
		}
	}

	updateTask(deps, task.id, {
		status: 'running',
		statusText: t('aiworkflow.runtime.callingVideoModel', { kind }),
		progress: 20
	})

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
	console.log('[Tripo3D Chat] resolveModel3DInput 开始解析, nodeId:', nodeId)

	const tryGetTripo3DTaskIdFromModel3d = (m3d: Record<string, unknown> | undefined, source: string): string => {
		if (!m3d) {
			console.log('[Tripo3D Chat]   tryGetTripo3DTaskIdFromModel3d (' + source + '): m3d为空')
			return ''
		}
		console.log('[Tripo3D Chat]   tryGetTripo3DTaskIdFromModel3d (' + source + '): m3d keys:', Object.keys(m3d))
		const tripo = m3d.tripo3dModelSettings
		console.log('[Tripo3D Chat]   tripo3dModelSettings:', tripo)
		if (tripo && typeof tripo === 'object' && tripo !== null) {
			const t = tripo as Record<string, unknown>
			const id = String(t.tripo3dUpstreamTaskId ?? t.tripo3dTaskId ?? t.taskId ?? '').trim()
			console.log('[Tripo3D Chat]   找到tripo3dTaskId (包含upstream):', id)
			if (id) return id
		}
		const directId = String(m3d.tripo3dUpstreamTaskId ?? m3d.tripo3dTaskId ?? '').trim()
		if (directId) {
			console.log('[Tripo3D Chat]   在m3d根找到tripo3dTaskId:', directId)
			return directId
		}
		return ''
	}
	const tryGetMeshyTaskIdFromModel3d = (m3d: Record<string, unknown> | undefined): string => {
		if (!m3d) return ''
		const meshy = m3d.meshyModelSettings
		if (meshy && typeof meshy === 'object' && meshy !== null) {
			const m = meshy as Record<string, unknown>
			const id = String(m.taskId ?? '').trim()
			if (id) return id
		}
		return ''
	}

	// 1. 查找 in-model 或 in-resource 输入边
	const allEdges = Object.values(state.edgesById || {})
	console.log('[Tripo3D Chat]  所有边数量:', allEdges.length)
	const incomingEdges = allEdges.filter(
		(e) => String(e.toNodeId ?? '') === String(nodeId)
	)
	console.log('[Tripo3D Chat]  目标节点入边数量:', incomingEdges.length)
	for (const e of incomingEdges) {
		console.log('[Tripo3D Chat]   入边:', {
			from: String(e.fromNodeId ?? ''),
			to: String(e.toNodeId ?? ''),
			fromAnchor: String(e.fromAnchorId ?? ''),
			toAnchor: String(e.toAnchorId ?? '')
		})
	}

	const edge = allEdges.find(
		(e) => String(e.toNodeId ?? '') === String(nodeId) && (String(e.toAnchorId ?? '').trim() === 'in-model' || String(e.toAnchorId ?? '').trim() === 'in-resource')
	)
	console.log('[Tripo3D Chat]  匹配到模型输入边:', edge ? {
		fromNodeId: String(edge.fromNodeId ?? ''),
		toAnchorId: String(edge.toAnchorId ?? '')
	} : null)

	if (edge) {
		const fromNodeId = String(edge.fromNodeId ?? '')
		const fromNode = state.nodesById[fromNodeId]
		console.log('[Tripo3D Chat]  上游节点:', fromNode ? {
			id: fromNode.id,
			type: fromNode.type,
			keys: Object.keys(fromNode as Record<string, unknown>)
		} : null)

		if (!fromNode) {
			console.log('[Tripo3D Chat]  上游节点不存在')
		} else if (fromNode.type === 'meshy') {
			const settings = (fromNode as Record<string, unknown>).meshySettings as Record<string, unknown> | undefined
			const relationSummary = settings && typeof settings.meshyRelationSummary === 'object' && settings.meshyRelationSummary !== null
				? (settings.meshyRelationSummary as Record<string, unknown>)
				: {}
			const taskId = String(settings?.meshyTaskId ?? relationSummary?.effectiveTaskId ?? '').trim()
			if (taskId) {
				console.log('[Tripo3D Chat]  从meshy节点找到taskId:', taskId)
				return { inputTaskId: taskId }
			}
			const outputSummary = settings && typeof settings.meshyOutputSummary === 'object' && settings.meshyOutputSummary !== null
				? (settings.meshyOutputSummary as Record<string, unknown>)
				: {}
			const sourceUrl = String(
				relationSummary?.preferredUrl ?? outputSummary?.preferredUrl ?? ''
			).trim()
			if (sourceUrl) {
				console.log('[Tripo3D Chat]  meshy节点使用modelUrl:', sourceUrl.slice(0, 80))
				return { modelUrl: sourceUrl }
			}
		} else if (fromNode.type === 'tripo3d' || fromNode.type === 'image') {
			let settings: Record<string, unknown> | undefined
			if (fromNode.type === 'image') {
				const imgSettings = (fromNode as Record<string, unknown>).imageSettings as Record<string, unknown> | undefined
				const rawImgTripo = imgSettings && typeof imgSettings.tripo3dImageSettings === 'object' && imgSettings.tripo3dImageSettings !== null
					? imgSettings.tripo3dImageSettings as Record<string, unknown>
					: {}
				settings = {}
				for (const [key, value] of Object.entries(rawImgTripo)) {
					settings[`tripo3d${key.charAt(0).toUpperCase()}${key.slice(1)}`] = value
				}
			} else {
				settings = (fromNode as Record<string, unknown>).tripo3dSettings as Record<string, unknown> | undefined
			}
			const tripoTaskId = String(settings?.tripo3dTaskId ?? '').trim()
			const tripoTaskFamily = String(settings?.tripo3dTaskFamily ?? settings?.tripo3dTaskMode ?? '').trim()
			const tripoTaskStatus = String(settings?.tripo3dTaskStatus ?? '').trim()
			console.log('[Tripo3D Chat]  tripo3d/image节点设置 (normalized):', settings)
			const isModelTask = tripoTaskFamily === 'text_to_model' || tripoTaskFamily === 'image_to_model' || tripoTaskFamily === 'multiview_to_model'
				|| tripoTaskFamily === 'texture' || tripoTaskFamily === 'refine' || tripoTaskFamily === 'mesh_segment'
				|| tripoTaskFamily === 'mesh_smartsegment' || tripoTaskFamily === 'mesh_complete' || tripoTaskFamily === 'mesh_decimate'
				|| tripoTaskFamily === 'models_convert'
			if (tripoTaskId && isModelTask) {
				console.log('[Tripo3D Chat]  从tripo3d/image节点找到model taskId:', tripoTaskId)
				return { inputTaskId: tripoTaskId }
			}
			const outputSummary = settings && typeof settings.tripo3dOutputSummary === 'object' && settings.tripo3dOutputSummary !== null
				? (settings.tripo3dOutputSummary as Record<string, unknown>)
				: {}
			const modelUrl = String(outputSummary.preferredUrl ?? outputSummary.assetUrl ?? '').trim()
			if (modelUrl && isModelTask) {
				console.log('[Tripo3D Chat]  tripo3d/image节点使用modelUrl:', modelUrl.slice(0, 80))
				return { modelUrl }
			}
		} else if (fromNode.type === 'model3d') {
			const m3d = (fromNode as Record<string, unknown>).model3dSettings as Record<string, unknown> | undefined
			console.log('[Tripo3D Chat]  上游model3d节点设置:', m3d)
			const tripoTaskId = tryGetTripo3DTaskIdFromModel3d(m3d, 'upstream-model3d')
			if (tripoTaskId) {
				console.log('[Tripo3D Chat]  从上游model3d节点找到tripoTaskId:', tripoTaskId)
				return { inputTaskId: tripoTaskId }
			}
			const meshyTaskId = tryGetMeshyTaskIdFromModel3d(m3d)
			if (meshyTaskId) {
				console.log('[Tripo3D Chat]  从上游model3d节点找到meshyTaskId:', meshyTaskId)
				return { inputTaskId: meshyTaskId }
			}
			const url = String(m3d?.modelAssetUrl ?? m3d?.modelUrl ?? '').trim()
			if (url) {
				console.log('[Tripo3D Chat]  上游model3d节点使用modelUrl:', url.slice(0, 80))
				// 对于Tripo3D，直接返回原始URL，不做Meshy式转换
				return { modelUrl: url }
			}
		}
	}

	// 2. 回退到当前节点自身的已有模型
	const selfNode = state.nodesById[String(nodeId)]
	if (selfNode) {
		console.log('[Tripo3D Chat]  回退检查当前节点自身, type:', selfNode.type)
		const selfM3d = (selfNode as Record<string, unknown>).model3dSettings as Record<string, unknown> | undefined
		console.log('[Tripo3D Chat]  当前节点model3dSettings:', selfM3d)
		const selfTripoTaskId = tryGetTripo3DTaskIdFromModel3d(selfM3d, 'self-model3d')
		if (selfTripoTaskId) {
			console.log('[Tripo3D Chat]  从当前节点找到tripoTaskId:', selfTripoTaskId)
			return { inputTaskId: selfTripoTaskId }
		}
		const selfMeshy = (selfNode as Record<string, unknown>).meshyModelSettings as Record<string, unknown> | undefined
		const taskId = String(selfMeshy?.taskId ?? '').trim()
		if (taskId) {
			console.log('[Tripo3D Chat]  从当前节点找到meshyTaskId:', taskId)
			return { inputTaskId: taskId }
		}
		const url = String(selfM3d?.modelAssetUrl ?? selfM3d?.modelUrl ?? '').trim()
		if (url) {
			console.log('[Tripo3D Chat]  当前节点使用modelUrl:', url.slice(0, 80))
			// 对于Tripo3D，直接返回原始URL，不做Meshy式转换
			return { modelUrl: url }
		}
	}

	console.log('[Tripo3D Chat]  resolveModel3DInput 未找到任何模型输入，返回null')
	return null
}

const runModel3dMeshyTask = async (
	deps: NodeGenerationApiDeps,
	task: WorkflowNodeGenerationTask,
	payload: WorkflowNodeChatSubmitPayload,
	syncHelpers?: GlobalTaskSyncHelpers
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
		statusText: t('aiworkflow.runtime.creatingMeshy3dTask', { mode: meshyMode }),
		progress: 10
	})
	appendDetail(deps, task.id, t('aiworkflow.runtime.detailMode', { mode: meshyMode }))
	if (!isPostProcessMode) appendDetail(deps, task.id, t('aiworkflow.runtime.detailAiModel', { model: meshyAiModel }))
	if (meshyOutputFormat && meshyMode !== 'uv-unwrap') appendDetail(deps, task.id, t('aiworkflow.runtime.detailOutputFormat', { format: meshyOutputFormat }))
	if (payload.prompt) appendDetail(deps, task.id, t('aiworkflow.runtime.detailPrompt', { prompt: payload.prompt.slice(0, 120) }))

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
				throw new Error(t('aiworkflow.runtime.imageTo3dNeedImage'))
			}

			if (refImages.length === 0 && meshyMode === 'multi-image-to-3d') {
				throw new Error(t('aiworkflow.runtime.multiImageTo3dNeedImages'))
			}

			appendDetail(deps, task.id, t('aiworkflow.runtime.detailRefImageCount', { count: String(refImages.length) }))

			for (const ref of refImages) {
				try {
					const dataUri = await blobToBase64DataUri(ref.blob)
					if (dataUri) imageDataUris.push(dataUri)
				} catch {
					// skip failed images
				}
			}

			if (imageDataUris.length === 0) {
				throw new Error(t('aiworkflow.runtime.refImageReadFailed'))
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
						appendDetail(deps, task.id, selectedNodeId
							? t('aiworkflow.runtime.usingSelectedImageStyle')
							: t('aiworkflow.runtime.usingConnectedImageStyle')
						)
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
				appendDetail(deps, task.id, t('aiworkflow.runtime.detailUpstreamTaskId', { taskId: modelInput.inputTaskId }))
			} else if (modelInput?.modelUrl) {
				meshyPayload.model_url = modelInput.modelUrl
				appendDetail(deps, task.id, t('aiworkflow.runtime.inputModelUrlReady'))
			} else {
				const modeLabel = meshyMode === 'remesh'
					? t('aiworkflow.runtime.modeRemesh')
					: meshyMode === 'retexture'
						? t('aiworkflow.runtime.modeRetexture')
						: t('aiworkflow.runtime.modeUvUnwrap')
				throw new Error(t('aiworkflow.runtime.postProcessNeedInput', { mode: modeLabel }))
			}
		}

		updateTask(deps, task.id, { statusText: t('aiworkflow.runtime.submittingMeshy3dTask'), progress: 15 })

		const projectIdFor3d = deps.getProjectId?.() ?? null
		if (projectIdFor3d != null) meshyPayload.projectId = String(projectIdFor3d)
		if (task.clientRequestId) meshyPayload.clientRequestId = task.clientRequestId
		if (task.nodeId) meshyPayload.nodeId = task.nodeId
		if (task.globalTaskId) meshyPayload.globalTaskId = task.globalTaskId

		const createRes = await svc.meshyGenerate(meshyPayload)

		if (!createRes.ok) {
			throw new Error(String(createRes.error || t('aiworkflow.runtime.meshy3dTaskCreateFailed')))
		}

		const meshyTaskId = String(createRes.taskId || '').trim()
		if (!meshyTaskId) throw new Error(t('aiworkflow.runtime.meshyEmptyTaskId'))

		appendDetail(deps, task.id, t('aiworkflow.runtime.detailTaskCreated', { taskId: meshyTaskId }))

		deps.store.commit('setNodeModel3DSettings', {
			nodeId: payload.nodeId,
			model3dSettings: {
				modelGenerationSource: 'meshy',
				meshyModelSettings: {
					taskId: meshyTaskId,
					taskStatus: 'pending',
					taskFamily: meshyMode,
					progress: 15,
					statusText: t('aiworkflow.runtime.meshy3dTaskCreatedStatus', { mode: meshyMode }),
					imageCount: refImages.length,
					imageUrls: imageDataUris,
					prompt: payload.prompt
				}
			}
		})
		syncHelpers?.syncGlobalBindRemote?.(meshyTaskId)

		updateTask(deps, task.id, {
			status: 'running',
			statusText: t('aiworkflow.runtime.meshy3dTaskSubmitted'),
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
		pushToast(deps, t('aiworkflow.runtime.meshy3dGenerateFailed', { error: errMsg }), 'error')
		updateTask(deps, task.id, {
			status: 'error',
			statusText: t('aiworkflow.runtime.failedStatus', { message: errMsg }),
			progress: 0,
			finishedAt: Date.now()
		})
		return { ok: false, error: errMsg }
	}
}

const runModel3dTripo3dTask = async (
	deps: NodeGenerationApiDeps,
	task: WorkflowNodeGenerationTask,
	payload: WorkflowNodeChatSubmitPayload,
	syncHelpers?: GlobalTaskSyncHelpers
): Promise<{ ok: boolean; taskId?: string; mode?: string; error?: string }> => {
	const svc = getComfyService(deps)
	const params = payload.params ?? {}

	const tripo3dModelVersion = String(params.tripo3dModelVersion || '').trim()
	const tripo3dFaceLimit = Number(params.tripo3dFaceLimit ?? 0)
	const tripo3dTexture = Boolean(params.tripo3dTexture ?? true)
	const tripo3dPbr = Boolean(params.tripo3dPbr ?? false)
	const tripo3dEnableImageAutofix = params.tripo3dEnableImageAutofix !== false
	const tripo3dTextureAlignment = String(params.tripo3dTextureAlignment || '').trim()
	const tripo3dOrientation = String(params.tripo3dOrientation || '').trim()
	const tripo3dGeometryQuality = String(params.tripo3dGeometryQuality || '').trim()
	const tripo3dTextureQuality = String(params.tripo3dTextureQuality || '').trim()
	const tripo3dQuad = Boolean(params.tripo3dQuad ?? false)
	const tripo3dSmartLowPoly = Boolean(params.tripo3dSmartLowPoly ?? false)
	const tripo3dGenerateParts = Boolean(params.tripo3dGenerateParts ?? false)
	const tripo3dAutoSize = params.tripo3dAutoSize !== false
	const tripo3dCompress = String(params.tripo3dCompress || '').trim()
	const tripo3dExportUv = Boolean(params.tripo3dExportUv ?? false)
	const tripo3dModelSeed = Number(params.tripo3dModelSeed ?? -1)
	const tripo3dTextureSeed = Number(params.tripo3dTextureSeed ?? -1)
	const tripo3dNegativePrompt = String(params.tripo3dNegativePrompt || '').trim()
	const tripo3dSelectedImages = Array.isArray(params.tripo3dSelectedImages) ? params.tripo3dSelectedImages : []
	const tripo3dForceSingleImage = params.tripo3dForceSingleImage === true

	const tripo3dTaskMode = String(params.tripo3dTaskMode || '').trim()
	const tripo3dSegType = String(params.tripo3dSegType || 'image').trim()
	const tripo3dGranularity = String(params.tripo3dGranularity || '').trim()
	const tripo3dDecimateModel = String(params.tripo3dDecimateModel || 'v2.0').trim()
	const tripo3dConvertFormat = String(params.tripo3dConvertFormat || 'GLTF').trim()
	const tripo3dConvertQuad = Boolean(params.tripo3dConvertQuad ?? false)
	const tripo3dConvertFlattenBottom = Boolean(params.tripo3dConvertFlattenBottom ?? false)
	const tripo3dConvertFaceLimit = Number(params.tripo3dConvertFaceLimit ?? 0)
	const tripo3dConvertTextureSize = Number(params.tripo3dConvertTextureSize ?? 0)
	const tripo3dPartNames = Array.isArray(params.tripo3dPartNames) ? params.tripo3dPartNames : []
	const tripo3dHint = String(params.tripo3dHint || '').trim()
	const tripo3dTextureModelVersion = String(params.tripo3dTextureModelVersion || 'v3.0-20250812').trim()
	const tripo3dTextureForceSingleImage = Boolean(params.tripo3dTextureForceSingleImage)
	const tripo3dTextureSelectedImages = Array.isArray(params.tripo3dTextureSelectedImages) ? params.tripo3dTextureSelectedImages : []
	const tripo3dTextureBake = Boolean(params.tripo3dTextureBake ?? true)

	updateTask(deps, task.id, {
		status: 'running',
		statusText: t('aiworkflow.runtime.creatingTripo3DTask', { mode: 'detecting' }),
		progress: 10
	})
	if (tripo3dModelVersion) appendDetail(deps, task.id, t('aiworkflow.runtime.detailAiModel', { model: tripo3dModelVersion }))
	if (payload.prompt) appendDetail(deps, task.id, t('aiworkflow.runtime.detailPrompt', { prompt: payload.prompt.slice(0, 120) }))

	try {
		let refImages: Array<{ name: string; blob: Blob }> = []
		let imageDataUris: string[] = []

		const allRefImages = await collectReferenceImages(deps, payload.nodeId, 4)
		const imageCount = allRefImages.length

		const postProcessModes = ['texture', 'refine', 'mesh_segment', 'mesh_smartsegment', 'mesh_complete', 'mesh_decimate', 'models_convert']
		const isPostProcessMode = postProcessModes.includes(tripo3dTaskMode)

		let tripo3dMode: string
		if (isPostProcessMode) {
			tripo3dMode = tripo3dTaskMode
		} else if (imageCount === 0) {
			tripo3dMode = 'text_to_model'
		} else if (imageCount === 1 || tripo3dForceSingleImage) {
			tripo3dMode = 'image_to_model'
			refImages = allRefImages.slice(0, 1)
		} else {
			tripo3dMode = 'multiview_to_model'
			refImages = allRefImages
		}

		appendDetail(deps, task.id, t('aiworkflow.runtime.detailMode', { mode: tripo3dMode }))

		const tripo3dPayload: Record<string, unknown> = {
			mode: tripo3dMode
		}

		if (!isPostProcessMode && tripo3dModelVersion) {
			tripo3dPayload.model_version = tripo3dModelVersion
		}

		if (!isPostProcessMode) {
			if (payload.prompt) {
				tripo3dPayload.prompt = payload.prompt
			}

			if (tripo3dNegativePrompt) {
				tripo3dPayload.negative_prompt = tripo3dNegativePrompt
			}

			if (tripo3dFaceLimit > 0) tripo3dPayload.face_limit = tripo3dFaceLimit
			tripo3dPayload.texture = tripo3dTexture
			tripo3dPayload.enable_image_autofix = tripo3dEnableImageAutofix
			if (tripo3dOrientation) tripo3dPayload.orientation = tripo3dOrientation
			if (tripo3dGeometryQuality) tripo3dPayload.geometry_quality = tripo3dGeometryQuality
			tripo3dPayload.quad = tripo3dQuad
			tripo3dPayload.smart_low_poly = tripo3dSmartLowPoly
			tripo3dPayload.generate_parts = tripo3dGenerateParts
			tripo3dPayload.auto_size = tripo3dAutoSize
			tripo3dPayload.export_uv = tripo3dExportUv

			if (tripo3dModelSeed > 0) tripo3dPayload.model_seed = tripo3dModelSeed
		}

		if (!isPostProcessMode) {
			tripo3dPayload.pbr = tripo3dPbr
			if (tripo3dTextureAlignment) tripo3dPayload.texture_alignment = tripo3dTextureAlignment
			if (tripo3dTextureQuality) tripo3dPayload.texture_quality = tripo3dTextureQuality
			if (tripo3dCompress) tripo3dPayload.compress = tripo3dCompress
		}

		if (tripo3dTextureSeed > 0) tripo3dPayload.texture_seed = tripo3dTextureSeed

		if (tripo3dMode === 'image_to_model') {
			if (refImages.length === 0) {
				throw new Error(t('aiworkflow.runtime.imageTo3dNeedImage'))
			}

			appendDetail(deps, task.id, t('aiworkflow.runtime.detailRefImageCount', { count: String(refImages.length) }))

			const dataUri = await blobToBase64DataUri(refImages[0].blob)
			if (!dataUri) {
				throw new Error(t('aiworkflow.runtime.refImageReadFailed'))
			}
			imageDataUris.push(dataUri)

			updateTask(deps, task.id, { statusText: t('aiworkflow.runtime.uploadingTripo3DImage'), progress: 12 })
			appendDetail(deps, task.id, t('aiworkflow.runtime.uploadingImage'))

			const uploadRes = await svc.tripo3dUploadFile({
				fileData: dataUri,
				fileName: `reference-${Date.now()}.png`,
				fileType: 'image/png'
			})

			if (!uploadRes.ok) {
				throw new Error(t('aiworkflow.runtime.tripo3dUploadFailed', { error: String(uploadRes.error || 'unknown') }))
			}

			const fileToken = String(uploadRes.fileToken || '').trim()
			if (!fileToken) {
				throw new Error(t('aiworkflow.runtime.tripo3dEmptyFileToken'))
			}

			appendDetail(deps, task.id, t('aiworkflow.runtime.detailFileToken', { token: fileToken }))
			tripo3dPayload.fileToken = fileToken
		} else if (tripo3dMode === 'multiview_to_model') {
			if (refImages.length < 2) {
				throw new Error(t('aiworkflow.runtime.multiImageTo3dNeedImages'))
			}

			appendDetail(deps, task.id, t('aiworkflow.runtime.detailRefImageCount', { count: String(refImages.length) }))

			const fileTokens: string[] = []
			for (let i = 0; i < refImages.length; i++) {
				const ref = refImages[i]
				try {
					const dataUri = await blobToBase64DataUri(ref.blob)
					if (dataUri) {
						imageDataUris.push(dataUri)

						updateTask(deps, task.id, {
							statusText: t('aiworkflow.runtime.uploadingTripo3DImageIndexed', { index: String(i + 1), total: String(refImages.length) }),
							progress: 8 + Math.floor((i + 1) / refImages.length * 10)
						})
						appendDetail(deps, task.id, t('aiworkflow.runtime.uploadingImageIndexed', { index: String(i + 1) }))

						const uploadRes = await svc.tripo3dUploadFile({
							fileData: dataUri,
							fileName: `multiview-${i + 1}-${Date.now()}.png`,
							fileType: 'image/png'
						})

						if (uploadRes.ok && uploadRes.fileToken) {
							fileTokens.push(uploadRes.fileToken)
							appendDetail(deps, task.id, t('aiworkflow.runtime.detailFileTokenIndexed', { index: String(i + 1), token: uploadRes.fileToken }))
						} else {
							const errMsg = !uploadRes.ok ? String(uploadRes.error || 'unknown') : 'no file token'
							appendDetail(deps, task.id, t('aiworkflow.runtime.uploadImageFailed', { index: String(i + 1), error: errMsg }))
						}
					}
				} catch {
					// skip failed images
				}
			}

			if (fileTokens.length < 2) {
				throw new Error(t('aiworkflow.runtime.refImageReadFailed'))
			}

			tripo3dPayload.fileTokens = fileTokens
		}

		if (isPostProcessMode) {
			console.log('[Tripo3D Chat]  开始处理后处理模式:', tripo3dMode)
			const modelInput = await resolveModel3DInput(deps, payload.nodeId)
			console.log('[Tripo3D Chat]  resolveModel3DInput返回结果:', modelInput)
			const hasTaskId = Boolean(modelInput?.inputTaskId)
			const hasModelUrl = Boolean(modelInput?.modelUrl)
			console.log('[Tripo3D Chat]  hasTaskId:', hasTaskId, 'hasModelUrl:', hasModelUrl)

			if (tripo3dMode === 'mesh_complete') {
				if (!modelInput?.inputTaskId) {
					throw new Error(t('tasks.tripo3d.meshCompleteRequiresSegment'))
				}
				tripo3dPayload.input = modelInput.inputTaskId
				appendDetail(deps, task.id, t('aiworkflow.runtime.detailUpstreamTaskId', { taskId: modelInput.inputTaskId }))
			} else if (tripo3dMode === 'mesh_smartsegment') {
				if (!hasTaskId && !hasModelUrl) {
					throw new Error(t('tasks.tripo3d.postProcessRequiresModel'))
				}
				tripo3dPayload.seg_type = tripo3dSegType
				tripo3dPayload.input = modelInput?.inputTaskId || modelInput?.modelUrl
				if (modelInput?.inputTaskId) {
					appendDetail(deps, task.id, t('aiworkflow.runtime.detailUpstreamTaskId', { taskId: modelInput.inputTaskId }))
				} else if (modelInput?.modelUrl) {
					appendDetail(deps, task.id, t('aiworkflow.runtime.inputModelUrlReady'))
				}
				if (tripo3dGranularity) tripo3dPayload.granularity = tripo3dGranularity
				if (tripo3dHint) tripo3dPayload.hint = tripo3dHint
				if (tripo3dSegType === 'model') {
					tripo3dPayload.transform = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
				}
			} else if (tripo3dMode === 'mesh_segment') {
				if (!hasTaskId && !hasModelUrl) {
					throw new Error(t('tasks.tripo3d.postProcessRequiresModel'))
				}
				tripo3dPayload.input = modelInput?.inputTaskId || modelInput?.modelUrl
				if (modelInput?.inputTaskId) {
					appendDetail(deps, task.id, t('aiworkflow.runtime.detailUpstreamTaskId', { taskId: modelInput.inputTaskId }))
				} else if (modelInput?.modelUrl) {
					appendDetail(deps, task.id, t('aiworkflow.runtime.inputModelUrlReady'))
				}
			} else if (tripo3dMode === 'mesh_decimate') {
				if (!hasTaskId && !hasModelUrl) {
					throw new Error(t('tasks.tripo3d.postProcessRequiresModel'))
				}
				tripo3dPayload.input = modelInput?.inputTaskId || modelInput?.modelUrl
				tripo3dPayload.model = tripo3dDecimateModel
				if (modelInput?.inputTaskId) {
					appendDetail(deps, task.id, t('aiworkflow.runtime.detailUpstreamTaskId', { taskId: modelInput.inputTaskId }))
				} else if (modelInput?.modelUrl) {
					appendDetail(deps, task.id, t('aiworkflow.runtime.inputModelUrlReady'))
				}
				if (tripo3dConvertFaceLimit > 0) tripo3dPayload.face_limit = Math.floor(tripo3dConvertFaceLimit)
				if (tripo3dConvertQuad) tripo3dPayload.quad = true
			} else if (tripo3dMode === 'models_convert') {
				if (!hasTaskId && !hasModelUrl) {
					throw new Error(t('tasks.tripo3d.postProcessRequiresModel'))
				}
				tripo3dPayload.input = modelInput?.inputTaskId || modelInput?.modelUrl
				if (modelInput?.inputTaskId) {
					appendDetail(deps, task.id, t('aiworkflow.runtime.detailUpstreamTaskId', { taskId: modelInput.inputTaskId }))
				} else if (modelInput?.modelUrl) {
					appendDetail(deps, task.id, t('aiworkflow.runtime.inputModelUrlReady'))
				}
				tripo3dPayload.format = tripo3dConvertQuad ? 'FBX' : tripo3dConvertFormat
				if (tripo3dConvertQuad) tripo3dPayload.quad = true
				if (tripo3dConvertFaceLimit > 0) tripo3dPayload.face_limit = Math.floor(tripo3dConvertFaceLimit)
				if (tripo3dConvertFlattenBottom) tripo3dPayload.flatten_bottom = true
				if (tripo3dConvertTextureSize > 0) tripo3dPayload.texture_size = Math.floor(tripo3dConvertTextureSize)
			} else if (tripo3dMode === 'texture') {
				if (!hasTaskId && !hasModelUrl) {
					throw new Error(t('tasks.tripo3d.postProcessRequiresModel'))
				}
				tripo3dPayload.input = modelInput?.inputTaskId || modelInput?.modelUrl
				tripo3dPayload.model = tripo3dTextureModelVersion
				if (modelInput?.inputTaskId) {
					appendDetail(deps, task.id, t('aiworkflow.runtime.detailUpstreamTaskId', { taskId: modelInput.inputTaskId }))
				} else if (modelInput?.modelUrl) {
					appendDetail(deps, task.id, t('aiworkflow.runtime.inputModelUrlReady'))
				}

				const textureRefs = await collectReferenceImagesWithUrl(deps, payload.nodeId, 4)
				const textureImageCount = textureRefs.length
				const textureForceSingle = tripo3dTextureForceSingleImage === true
				const promptText = payload.prompt || ''

				if (textureImageCount === 0) {
					if (promptText) {
						tripo3dPayload.texture_prompt = { text: promptText }
					}
				} else if (textureImageCount === 1 || textureForceSingle) {
					updateTask(deps, task.id, { statusText: t('aiworkflow.runtime.uploadingTripo3DImage'), progress: 12 })
					const ref = textureRefs[0]
					const dataUri = await blobToBase64DataUri(ref.blob)
					if (dataUri) {
						imageDataUris.push(dataUri)
						const uploadRes = await svc.tripo3dUploadFile({
							fileData: dataUri,
							fileName: `texture-ref-${Date.now()}.png`,
							fileType: 'image/png'
						})
						if (uploadRes.ok && uploadRes.fileToken) {
							const tp: Record<string, unknown> = { image: { file_token: uploadRes.fileToken } }
							if (promptText) tp.text = promptText
							tripo3dPayload.texture_prompt = tp
						}
					}
				} else {
					updateTask(deps, task.id, { statusText: t('aiworkflow.runtime.uploadingTripo3DImage'), progress: 12 })
					const viewOrder = ['front', 'left', 'back', 'right'] as const
					const selectedByView = new Map<string, { blob: Blob; nodeId: string }>()
					for (const sel of tripo3dTextureSelectedImages) {
						const found = textureRefs.find(r => r.fromNodeId === sel.nodeId)
						if (found) {
							selectedByView.set(sel.view, { blob: found.blob, nodeId: sel.nodeId })
						}
					}
					if (selectedByView.size === 0 && textureRefs.length >= 2) {
						for (let i = 0; i < Math.min(textureRefs.length, viewOrder.length); i++) {
							selectedByView.set(viewOrder[i], { blob: textureRefs[i].blob, nodeId: textureRefs[i].fromNodeId })
						}
					}
					const imagesObj: Record<string, { file_token: string }> = {}
					let idx = 0
					for (const [view, info] of selectedByView) {
						idx++
						const dataUri = await blobToBase64DataUri(info.blob)
						if (dataUri) {
							imageDataUris.push(dataUri)
							const uploadRes = await svc.tripo3dUploadFile({
								fileData: dataUri,
								fileName: `texture-${view}-${Date.now()}.png`,
								fileType: 'image/png'
							})
							if (uploadRes.ok && uploadRes.fileToken) {
								imagesObj[view] = { file_token: uploadRes.fileToken }
							}
						}
					}
					if (Object.keys(imagesObj).length > 0) {
						const tp: Record<string, unknown> = { images: imagesObj }
						if (promptText) tp.text = promptText
						tripo3dPayload.texture_prompt = tp
					} else if (promptText) {
						tripo3dPayload.texture_prompt = { text: promptText }
					}
				}

				if (tripo3dPbr !== undefined) tripo3dPayload.pbr = tripo3dPbr
				if (tripo3dTextureQuality) tripo3dPayload.texture_quality = tripo3dTextureQuality
				if (tripo3dTextureAlignment) tripo3dPayload.texture_alignment = tripo3dTextureAlignment
				if (tripo3dCompress) tripo3dPayload.compress = tripo3dCompress
				if (tripo3dTextureBake) tripo3dPayload.bake = true
				if (tripo3dTextureSeed > 0) tripo3dPayload.texture_seed = tripo3dTextureSeed
			} else if (tripo3dMode === 'refine') {
				if (!hasTaskId && !hasModelUrl) {
					throw new Error(t('aiworkflow.runtime.postProcessNeedInput', { mode: t('aiworkflow.runtime.modeRefine') }))
				}
				tripo3dPayload.input = modelInput?.inputTaskId || modelInput?.modelUrl
				if (modelInput?.inputTaskId) {
					appendDetail(deps, task.id, t('aiworkflow.runtime.detailUpstreamTaskId', { taskId: modelInput.inputTaskId }))
				} else if (modelInput?.modelUrl) {
					appendDetail(deps, task.id, t('aiworkflow.runtime.inputModelUrlReady'))
				}
				if (tripo3dHint) {
					tripo3dPayload.prompt = tripo3dHint
				}
			}
			if (tripo3dPartNames.length > 0) {
				tripo3dPayload.part_names = tripo3dPartNames.map(String)
			}
		}

		const projectIdVal = deps.getProjectId?.() ?? null
		tripo3dPayload.nodeId = payload.nodeId
		if (projectIdVal != null) tripo3dPayload.projectId = projectIdVal
		if (task.clientRequestId) tripo3dPayload.clientRequestId = task.clientRequestId
		if (task.globalTaskId) tripo3dPayload.globalTaskId = task.globalTaskId

		updateTask(deps, task.id, { statusText: t('aiworkflow.runtime.submittingTripo3DTask'), progress: 15 })

		console.log('[Tripo3D Chat]  最终提交payload (mode=' + tripo3dMode + '):', JSON.stringify(tripo3dPayload, null, 2))
		const createRes = await svc.tripo3dGenerate(tripo3dPayload)

		if (!createRes.ok) {
			throw new Error(String(createRes.error || t('aiworkflow.runtime.tripo3dTaskCreateFailed')))
		}

		const tripo3dTaskId = String(createRes.taskId || '').trim()
		if (!tripo3dTaskId) throw new Error(t('aiworkflow.runtime.tripo3dEmptyTaskId'))

		appendDetail(deps, task.id, t('aiworkflow.runtime.detailTaskCreated', { taskId: tripo3dTaskId }))

		const currentNodeState = deps.store.state.nodesById[payload.nodeId] as Record<string, unknown> | undefined
		const currentM3d = currentNodeState?.model3dSettings && typeof currentNodeState.model3dSettings === 'object'
			? currentNodeState.model3dSettings as Record<string, unknown>
			: {}
		const existingTripo = currentM3d.tripo3dModelSettings && typeof currentM3d.tripo3dModelSettings === 'object'
			? currentM3d.tripo3dModelSettings as Record<string, unknown>
			: {}

		deps.store.commit('setNodeModel3DSettings', {
			nodeId: payload.nodeId,
			model3dSettings: {
				modelGenerationSource: 'tripo3d',
				tripo3dModelSettings: {
					...existingTripo,
					tripo3dTaskId: tripo3dTaskId,
					tripo3dTaskStatus: 'pending',
					tripo3dTaskFamily: tripo3dMode,
					tripo3dProgress: 15,
					tripo3dStatusText: t('aiworkflow.runtime.tripo3dTaskCreatedStatus', { mode: tripo3dMode }),
					tripo3dImageCount: refImages.length,
					tripo3dImageUrls: imageDataUris,
					tripo3dPrompt: payload.prompt
				}
			}
		})

		updateTask(deps, task.id, {
			status: 'running',
			statusText: t('aiworkflow.runtime.tripo3dTaskSubmitted'),
			progress: 15
		})

		void pollTripo3DTaskStatus(
			deps,
			svc,
			tripo3dTaskId,
			task.id,
			payload.nodeId,
			tripo3dMode
		)

		return { ok: true, taskId: tripo3dTaskId, mode: tripo3dMode }
	} catch (err: unknown) {
		const errMsg = getErrorMessage(err)
		pushToast(deps, t('aiworkflow.runtime.tripo3dGenerateFailed', { error: errMsg }), 'error')
		updateTask(deps, task.id, {
			status: 'error',
			statusText: t('aiworkflow.runtime.failedStatus', { message: errMsg }),
			progress: 0,
			finishedAt: Date.now()
		})
		return { ok: false, error: errMsg }
	}
}

const pollTripo3DTaskStatus = async (
	deps: NodeGenerationApiDeps,
	svc: ComfyUIBridgeService,
	taskId: string,
	generationTaskId: string,
	nodeId: string,
	taskMode: string
) => {
	const maxPolls = 180
	const pollInterval = 3000
	let consecutiveErrors = 0

	for (let i = 0; i < maxPolls; i++) {
		await new Promise((r) => setTimeout(r, pollInterval))

		try {
			const taskRes = await svc.tripo3dTask(taskId)

			consecutiveErrors = 0

			if (!taskRes.ok) {
				appendDetail(
					deps,
					generationTaskId,
					t('aiworkflow.runtime.pollFailed', { status: String(taskRes.status), error: String(taskRes.error) })
				)
				console.warn('[Tripo3D Poll] 轮询失败:', {
					status: taskRes.status,
					error: taskRes.error,
					taskId,
					taskMode
				})
				continue
			}

			const status = String(taskRes.status || '')
				.trim()
				.toLowerCase()
			const progress = Number(taskRes.progress ?? 0)
			const progressPct = status === 'success' || status === 'succeeded' || status === 'completed'
				? 100
				: Math.min(99, Math.max(10, progress))

			const statusText = t('aiworkflow.runtime.tripo3dTaskStatus', { taskMode, status, progress: String(progress) })

			updateTask(deps, generationTaskId, {
				statusText,
				progress: progressPct
			})

			const tripo3dStatus = (() => {
				const s = status.toLowerCase()
				if (s === 'succeeded' || s === 'success' || s === 'completed') return 'succeeded' as const
				if (s === 'failed' || s === 'error') return 'failed' as const
				if (s === 'cancelled' || s === 'canceled') return 'canceled' as const
				if (s === 'pending' || s === 'queued') return 'pending' as const
				return 'running' as const
			})()

			const pollNodeState = deps.store.state.nodesById[nodeId] as Record<string, unknown> | undefined
			const pollM3d = pollNodeState?.model3dSettings && typeof pollNodeState.model3dSettings === 'object'
				? pollNodeState.model3dSettings as Record<string, unknown>
				: {}
			const pollExistingTripo = pollM3d.tripo3dModelSettings && typeof pollM3d.tripo3dModelSettings === 'object'
				? pollM3d.tripo3dModelSettings as Record<string, unknown>
				: {}

			deps.store.commit('setNodeModel3DSettings', {
				nodeId,
				model3dSettings: {
					tripo3dModelSettings: {
						...pollExistingTripo,
						tripo3dTaskId: taskId,
						tripo3dTaskStatus: tripo3dStatus,
						tripo3dTaskFamily: taskMode,
						tripo3dProgress: progressPct,
						tripo3dStatusText: statusText
					}
				}
			})

			if (status === 'success' || status === 'succeeded' || status === 'completed') {
				const modelUrl = String(taskRes.modelUrl || '').trim()
				const thumbnailUrl = String(taskRes.thumbnailUrl || '').trim()

				let finalModelUrl = modelUrl
				let finalFormat = 'glb'

				if (!finalModelUrl) {
					return throwFatal(t('aiworkflow.runtime.tripo3dNoModelUrl'))
				}

				const resolvedUrl = deps.resolveBackendUrl(finalModelUrl)

				let persistedUrl = resolvedUrl
				let persistedAssetPath = ''
				let persistFailed = false

				if (typeof deps.persistExternalAssetToProject === 'function') {
					try {
						const urlObj = finalModelUrl.split('?')[0]
						const extMatch = urlObj.match(/\.[^.]+$/)
						const ext = extMatch ? extMatch[0] : '.glb'
						const fileName = `tripo3d-${taskId}${ext}`
						const persisted = await deps.persistExternalAssetToProject({
							kind: 'file',
							name: fileName,
							sourceUrl: resolvedUrl
						})
						if (persisted) {
							persistedUrl = String(persisted.url || resolvedUrl)
							persistedAssetPath = persisted.projectRelativePath || persisted.absolutePath || ''
							console.log('[Tripo3D Poll] 资产已持久化:', { taskId, persistedUrl })
						} else {
							persistFailed = true
						}
					} catch (e) {
						persistFailed = true
						console.warn('[Tripo3D Poll] 资产持久化失败:', e)
					}
				}

				let bound = true
				if (typeof deps.bindModel3dResultToNode === 'function') {
					try {
						const bindRet = await deps.bindModel3dResultToNode(nodeId, persistedUrl, finalFormat)
						bound = bindRet !== false
					} catch (e) {
						bound = false
						console.warn('[Tripo3D Poll] 绑定模型到节点失败:', e)
					}
				}
				if (bound) {
					appendResult(deps, generationTaskId, {
						kind: 'model3d',
						url: persistedUrl,
						label: t('aiworkflow.runtime.tripo3dModelLabel', { format: finalFormat })
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

				const successNodeState = deps.store.state.nodesById[nodeId] as Record<string, unknown> | undefined
				const successM3d = successNodeState?.model3dSettings && typeof successNodeState.model3dSettings === 'object'
					? successNodeState.model3dSettings as Record<string, unknown>
					: {}
				const successExistingTripo = successM3d.tripo3dModelSettings && typeof successM3d.tripo3dModelSettings === 'object'
					? successM3d.tripo3dModelSettings as Record<string, unknown>
					: {}

				deps.store.commit('setNodeModel3DSettings', {
					nodeId,
					model3dSettings: {
						modelGenerationSource: 'tripo3d',
						modelUrl: fetchSucceeded ? persistedUrl : '',
						modelAssetUrl: fetchSucceeded ? persistedUrl : '',
						modelAssetPath: fetchSucceeded ? persistedAssetPath : '',
						modelFormat: finalFormat,
						tripo3dModelSettings: {
							...successExistingTripo,
							tripo3dTaskId: taskId,
							tripo3dTaskStatus: fetchSucceeded ? 'succeeded' : 'fetch-failed',
							tripo3dTaskFamily: taskMode,
							tripo3dProgress: 100,
							tripo3dStatusText: fetchSucceeded
								? t('aiworkflow.runtime.tripo3dComplete')
								: t('aiworkflow.runtime.tripo3dCompleteFetchFailed'),
							tripo3dErrorMessage: fetchSucceeded
								? ''
								: t('aiworkflow.runtime.tripo3dFetchFailedMessage'),
							tripo3dOutputSummary: {
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
						? t('aiworkflow.runtime.tripo3dComplete')
						: t('aiworkflow.runtime.tripo3dCompleteFetchFailed'),
					progress: 100,
					finishedAt: Date.now()
				})
				return
			}

			if (status === 'failed' || status === 'error') {
				const errorMsg = String(taskRes.errorMessage || taskRes.statusText || t('aiworkflow.runtime.unknownError'))
				return throwFatal(t('aiworkflow.runtime.tripo3dTaskFailed', { error: errorMsg }))
			}

			if (status === 'cancelled' || status === 'canceled') {
				return throwFatal(t('aiworkflow.runtime.tripo3dTaskCanceled'))
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
				taskMode,
				attempt: i + 1,
				consecutiveErrors,
				timestamp: Date.now()
			}

			appendDetail(
				deps,
				generationTaskId,
				t('aiworkflow.runtime.pollException', { attempt: String(i + 1), consecutive: String(consecutiveErrors), error: errMsg })
			)
			console.error('[Tripo3D Poll] 轮询异常:', errorDetails)

			if (consecutiveErrors >= 10) {
				throw err
			}
		}
	}

	throwFatal(t('aiworkflow.runtime.tripo3dTaskTimeout'))
}

const runModel3dStub = (
	deps: NodeGenerationApiDeps,
	task: WorkflowNodeGenerationTask,
	payload: WorkflowNodeChatSubmitPayload,
	_syncHelpers?: GlobalTaskSyncHelpers
) => {
	appendDetail(
		deps,
		task.id,
		t('aiworkflow.runtime.model3dStubDetail')
	)
	updateTask(deps, task.id, {
		status: 'error',
		statusText: t('aiworkflow.runtime.model3dStubStatus'),
		errorMessage: t('aiworkflow.runtime.model3dStubError'),
		finishedAt: Date.now()
	})
	pushToast(deps, t('aiworkflow.runtime.nodeNotAvailable', { type: labelForType(payload.nodeType) }), 'warn')
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
