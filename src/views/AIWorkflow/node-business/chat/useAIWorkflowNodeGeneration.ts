import type { Store } from 'vuex'
import type {
	WorkflowNodeChatSubmitPayload,
	WorkflowNodeGenerationTask,
	WorkflowNode,
	WorkflowState
} from '../../../../aiworkflow/types'
import { ComfyUIBridgeService, type MeshyTaskResponse } from '../../../../network/ComfyUIBridgeService'
import { getErrorMessage } from '../../../../types/utils'

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
const isImageInputAnchor = (anchorId: string): boolean => {
	const id = String(anchorId || '').trim()
	return id === 'in-image' || id === 'in-resource' || id === 'in-0' || /^in-image-\d+$/.test(id)
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
	if (typeof nodeResourceUrl === 'function') {
		const standardUrl = nodeResourceUrl(node)
		if (standardUrl) {
			console.log('[collectReferenceImages] 从nodeResourceUrl获取URL:', standardUrl)
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
	const allUrls = imageUrls.length > 0 ? imageUrls : (preferredUrl ? [preferredUrl] : [])

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
		const newNodeId = deps.createImageNodeAtCenter(preferredUrl, 'Meshy 生成结果')
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
			statusText: 'Meshy 图片生成完成，但无法创建节点接收结果',
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
				const newNodeId = deps.createImageNodeAt(newX, newY, finalUrl, `Meshy 生成结果 ${i + 1}`)
				if (newNodeId) {
					bindNodeId = newNodeId
					isNewNode = true
					createdNodes.push(newNodeId)
					console.log('[Meshy Poll] 为额外图片创建新节点:', { index: i, nodeId: newNodeId, x: newX, y: newY })
				}
			} else if (typeof deps.createImageNodeAtCenter === 'function') {
				const newNodeId = deps.createImageNodeAtCenter(finalUrl, `Meshy 生成结果 ${i + 1}`)
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
					label: i === 0 ? 'Meshy 图片' : `Meshy 图片 ${i + 1}`
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
									statusText: 'Meshy 图片生成完成',
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
					? `Meshy 图片生成完成（共 ${allUrls.length} 张，${createdNodes.length} 个新节点已创建）`
					: `Meshy 图片生成完成（共 ${allUrls.length} 张）`,
				outputSummary
			}
		}
	})

	updateTask(deps, generationTaskId, {
		status: 'completed',
		statusText: nodeCreated || createdNodes.length > 0
			? `Meshy 图片生成完成（共 ${allUrls.length} 张，${createdNodes.length} 个新节点已创建）`
			: `Meshy 图片生成完成（共 ${allUrls.length} 张）`,
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
			? `后端不可达（${raw}）。Electron 环境下请使用 IPC 调用，无需 HTTP 后端。`
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
		appendDetail(deps, task.id, `参考图数量：${refImages.length}`)
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

		appendDetail(deps, task.id, `Seedream 型号：${seedreamModelVersion}`)
		appendDetail(deps, task.id, `分辨率：${seedreamSize}，宽高比：${seedreamAspectRatio}`)
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

		appendDetail(deps, task.id, `Meshy 模式：${taskType}`)
		appendDetail(deps, task.id, `AI 模型：${meshyAiModel}`)
		appendDetail(deps, task.id, `宽高比：${meshyGenerateMultiView ? '多视图(1:1)' : meshyAspectRatio}`)
		if (meshyPoseMode) appendDetail(deps, task.id, `姿态模式：${meshyPoseMode}`)
		if (meshyGenerateMultiView) appendDetail(deps, task.id, '多视图：开启')
		appendDetail(deps, task.id, `输出数量：${meshyOutputImageCount} 张`)
		if (meshyNegativePrompt) appendDetail(deps, task.id, `负向提示：${meshyNegativePrompt.slice(0, 80)}`)
		if (Number.isFinite(meshySeed) && meshySeed >= 0) appendDetail(deps, task.id, `随机种子：${meshySeed}`)
		if (hasRefImages) appendDetail(deps, task.id, `参考图数量：${refs.length}`)

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
				aspectRatio: meshyGenerateMultiView ? '1:1 (多视图)' : meshyAspectRatio,
				poseMode: meshyPoseMode || '无',
				generateMultiView: meshyGenerateMultiView,
				negativePrompt: meshyNegativePrompt || '无',
				outputCount: meshyGenerateMultiView ? 4 : (Number.isFinite(meshyOutputImageCount) && meshyOutputImageCount > 0 ? Math.floor(meshyOutputImageCount) : 1),
				seed: Number.isFinite(meshySeed) && meshySeed >= 0 ? Math.floor(meshySeed) : '随机',
				referenceImageCount: hasRefImages ? refs.length : 0,
				submittedAt: new Date().toISOString()
			}

			// 将submittedParams添加到请求payload中，确保后端能记录
			meshyPayload.submittedParams = submittedParams

			updateTask(deps, task.id, { statusText: `正在创建 Meshy ${taskType} 任务…`, progress: 20 })

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

			console.log('[Meshy Image - Node Chat] 发送请求（统一FormData路径），hasRefImages:', hasRefImages, 'refCount:', refs.length)
			const createRes = await svc.meshyGenerateImage(form)
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
						statusText: `Meshy ${taskType} 任务已创建`,
						submittedParams
					}
				}
			})

			// 轮询任务状态
			await pollMeshyTaskStatus(deps, svc, taskId, task.id, payload.nodeId, taskType)

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
