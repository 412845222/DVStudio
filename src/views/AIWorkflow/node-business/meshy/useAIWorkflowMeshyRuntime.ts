import type { ExternalAssetProgress } from '../../assets/useAIWorkflowAssetPersistence'
import { isRecord, isString } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type {
	MeshyComfyService,
	MeshyStoreLike,
	PersistExternalAssetPayload,
	PersistExternalAssetResult
} from './types'
import { extractMeshyTaskResultFields } from './types'
import type { PollTaskState } from '../shared/task-poll-scheduler/types'
import { TaskPollScheduler } from '../shared/task-poll-scheduler/TaskPollScheduler'
import { NODE_BINDING_DEBUG } from '../shared/debugFlags'

type WorkflowNodeLike = {
	id: string
	type: string
	alias?: string
	title?: string
	imageSettings?: Record<string, unknown>
	model3dSettings?: Record<string, unknown>
	meshySettings?: Record<string, unknown>
	resourceId?: string | null
	createdAt?: number
	[key: string]: unknown
}

const MESHY_RUNTIME_MODEL_EXT_WHITELIST = Object.freeze([
	'glb',
	'gltf',
	'fbx',
	'obj',
	'stl',
	'dae',
	'3ds',
	'ply',
	'x3d',
	'x'
])

const MESHY_RUNTIME_IMAGE_EXT_BLACKLIST = Object.freeze([
	'png',
	'jpg',
	'jpeg',
	'gif',
	'webp',
	'bmp',
	'tiff',
	'tif',
	'svg',
	'ico',
	'heic',
	'heif'
])

// 同时兼容：
//   1) 远端 URL https://xx/a.glb
//   2) dweb 协议 dweb://project-assets?projectId=xx&path=assets/meshy/a.glb  (从 ?path/?relativePath 参数解析)
//   3) 本地绝对路径  G:\xx\a.glb 或  /xx/a.glb
const extractMeshyRuntimeUrlOrPathExt = (input: string): string => {
	if (!input) return ''
	const text = String(input).trim()
	if (!text) return ''
	// 1. 尝试从 dweb 协议的 query path 参数提取
	const low = text.toLowerCase()
	if (low.startsWith('dweb://') || low.startsWith('dweb:')) {
		try {
			const qStart = text.indexOf('?')
			const queryStr = qStart >= 0 ? text.slice(qStart + 1) : ''
			const params = new URLSearchParams(queryStr)
			const p = decodeURIComponent(
				params.get('path') || params.get('relativePath') || params.get('assetPath') || ''
			)
			if (p) {
				const clean = p.split('?')[0].split('#')[0]
				const d = clean.lastIndexOf('.')
				if (d >= 0) return clean.slice(d + 1).toLowerCase()
			}
		} catch {
			/* ignore */
		}
	}
	// 2. 正常从末尾解析 (兼容 URL 和 Windows/Unix 路径)
	try {
		const withoutQuery = text.split('?')[0].split('#')[0]
		const lastSlash = Math.max(withoutQuery.lastIndexOf('/'), withoutQuery.lastIndexOf('\\'))
		const namePart = lastSlash >= 0 ? withoutQuery.slice(lastSlash + 1) : withoutQuery
		const lastDot = namePart.lastIndexOf('.')
		if (lastDot < 0) return ''
		return namePart.slice(lastDot + 1).toLowerCase()
	} catch {
		return ''
	}
}

// 兼容旧引用点
const extractMeshyRuntimeUrlExt = (url: string): string => extractMeshyRuntimeUrlOrPathExt(url)

const isMeshyRuntimeImageExt = (ext: string): boolean => {
	if (!ext) return false
	return MESHY_RUNTIME_IMAGE_EXT_BLACKLIST.includes(ext)
}
const isMeshyRuntimeModelExt = (ext: string): boolean => {
	if (!ext) return false
	return MESHY_RUNTIME_MODEL_EXT_WHITELIST.includes(ext)
}

// 检测一个 URL 或本地 Path 是否是图片：扩展名明确命中图片黑名单时返回 true；
// 扩展名命中模型白名单时返回 false；无扩展名时假定不是图片返回 false (让后续链路决定)
const isMeshyRuntimeImageUrlOrPath = (input: string): boolean => {
	const ext = extractMeshyRuntimeUrlOrPathExt(input)
	return isMeshyRuntimeImageExt(ext)
}
// 3D 模型 URL/Path 的硬判定：扩展名必须命中模型白名单，或者没有扩展名（如裸 API URL）。
// 一旦扩展名命中图片黑名单，明确拒绝。
const isMeshyRuntimeLikely3DModelUrl = (url: string): boolean => {
	if (!url) return false
	const ext = extractMeshyRuntimeUrlOrPathExt(url)
	if (isMeshyRuntimeImageExt(ext)) return false
	if (isMeshyRuntimeModelExt(ext)) return true
	// 无明确扩展名：如果是远端 URL (http(s):// / dweb://)，认为可能是裸 3D 资源接口，交由后续链路；
	// 本地绝对路径无扩展名不认为是模型
	try {
		const t = String(url).trim().toLowerCase()
		if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('dweb://') || t.startsWith('dweb:')) {
			return true
		}
	} catch {
		/* ignore */
	}
	return false
}

export const useAIWorkflowMeshyRuntime = (options: {
	store: MeshyStoreLike
	getComfyService: () => MeshyComfyService
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	normalizeMeshyTaskStatus: (raw: unknown) => string
	pickMeshyPreferredModelUrl: (urls: Record<string, string> | null | undefined) => string
	pickMeshyPreferredFormat: (urls: Record<string, string> | null | undefined) => 'glb' | 'gltf'
	fileExtensionFromUrl: (url: string, fallbackExt: string) => string
	persistExternalAssetToProject: (
		payload: PersistExternalAssetPayload
	) => Promise<PersistExternalAssetResult>
	syncConnectedImageTargetsFromMeshy: (nodeId: string) => Promise<unknown>
	syncConnectedModel3DTargets: (nodeId: string) => Promise<unknown>
	refreshMeshyTaskItems: (opts?: { silent?: boolean }) => Promise<unknown> | void
	shouldRefreshMeshyTaskItems: () => boolean
}) => {
	const normalizeText = (value: unknown) => String(value ?? '').trim()
	const sanitizePreferredModelUrlCandidate = (raw: string): string => {
		const candidate = normalizeText(raw)
		if (!candidate) return ''
		if (!isMeshyRuntimeLikely3DModelUrl(candidate)) return ''
		return candidate
	}
	const isMeshyRemoteUrl = (value: unknown) => {
		const text = normalizeText(value)
		if (!text) return false
		try {
			const url = new URL(text)
			return /(^|\.)meshy\.ai$/i.test(url.hostname)
		} catch {
			return /https?:\/\/[^\s]*meshy\.ai(?:\/|$)/i.test(text)
		}
	}

	const pickLocalThumbnailCandidate = (...values: unknown[]) => {
		for (const raw of values) {
			const text = normalizeText(raw)
			if (!text) continue
			if (isMeshyRemoteUrl(text)) continue
			return text
		}
		return ''
	}

	const meshyPollTimers = new Map<string, number>()
	const meshyPollErrorCounts = new Map<string, number>()
	const meshyTerminalNotified = new Set<string>()

	const stopMeshyPoll = (nodeId: string) => {
		const timer = meshyPollTimers.get(nodeId)
		if (timer != null) {
			window.clearInterval(timer)
			meshyPollTimers.delete(nodeId)
		}
		meshyPollErrorCounts.delete(nodeId)
		try {
			const s = TaskPollScheduler.shared
			if (s && s.taskCount() > 0) {
				s.unregister(nodeId)
			}
		} catch {
			// ignore
		}
	}

	const getNodeFromStore = (nodeId: string): WorkflowNodeLike | null => {
		const node = options.store.state.nodesById[nodeId]
		return (node as unknown as WorkflowNodeLike) ?? null
	}

	const getMeshySettings = (n: WorkflowNodeLike | null | undefined): Record<string, unknown> => {
		if (!n) return {}
		if (n.type === 'image') {
			const imgSettings = isRecord(n.imageSettings) ? n.imageSettings : {}
			return isRecord(imgSettings.meshyImageSettings) ? imgSettings.meshyImageSettings : {}
		}
		if (n.type === 'model3d') {
			const m3dSettings = isRecord(n.model3dSettings) ? n.model3dSettings : {}
			return isRecord(m3dSettings.meshyModelSettings) ? m3dSettings.meshyModelSettings : {}
		}
		return isRecord(n.meshySettings) ? n.meshySettings : {}
	}

	const commitMeshyDownloadProgress = (
		nodeId: string,
		node: WorkflowNodeLike,
		info: {
			stage: 'idle' | 'downloading' | 'done' | 'failed'
			progress?: number
			loaded?: number
			total?: number
			speed?: number
			error?: string
		}
	) => {
		const patch: Record<string, unknown> = {
			downloadStage: info.stage
		}
		if (info.progress != null) patch.downloadProgress = info.progress
		if (info.loaded != null) patch.downloadLoadedBytes = info.loaded
		if (info.total != null) patch.downloadTotalBytes = info.total
		if (info.speed != null) patch.downloadSpeedBytesPerSec = info.speed
		if (info.error != null) patch.downloadError = info.error

		if (node.type === 'image') {
			options.store.commit('setNodeImageSettings', {
				nodeId,
				imageSettings: { meshyImageSettings: patch }
			})
		} else if (node.type === 'model3d') {
			options.store.commit('setNodeModel3DSettings', {
				nodeId,
				model3dSettings: { meshyModelSettings: patch }
			})
		} else {
			options.store.commit('setNodeMeshySettings', { nodeId, meshySettings: patch })
		}
	}

	const applyMeshyTaskResult = async (nodeId: string, taskRaw: unknown) => {
		const task = extractMeshyTaskResultFields(taskRaw)
		const normalized = options.normalizeMeshyTaskStatus(task.status)
		const node = getNodeFromStore(nodeId)
		if (!node) return normalized

		const existingSettings = getMeshySettings(node)

		const target =
			String(existingSettings.taskFamily ?? '').includes('image') ||
			String(task.mode ?? '').includes('image')
				? 'image'
				: '3d'
		const isImageTarget = target === 'image'
		const modelUrls = task.modelUrls
		const imageUrls = task.imageUrls
		const preferredImageUrl = task.preferredImageUrl || (imageUrls[0] ?? '')
		const rawPreferredModelUrl =
			sanitizePreferredModelUrlCandidate(task.preferredModelUrl || '') ||
			sanitizePreferredModelUrlCandidate(options.pickMeshyPreferredModelUrl(modelUrls) || '')
		const preferredModelUrl = rawPreferredModelUrl
		const thumbnailUrl = task.thumbnailUrl
		const statusText = task.statusText
		const errorMessage = task.errorMessage
		const format = options.pickMeshyPreferredFormat(modelUrls)
		const existingLocalThumbnailUrl = pickLocalThumbnailCandidate(
			isRecord(existingSettings.outputSummary)
				? existingSettings.outputSummary.thumbnailUrl
				: undefined,
			existingSettings.thumbnailUrl
		)
		let resolvedThumbnailUrl = isImageTarget
			? thumbnailUrl || existingLocalThumbnailUrl
			: existingLocalThumbnailUrl

		const rawProgress = task.progress
		const finalProgress = normalized === 'succeeded' ? 100 : Math.max(0, Math.min(100, rawProgress))

		const patch: Record<string, unknown> = {
			meshyTaskId: task.taskId,
			meshyRelationKind: String(existingSettings.relationKind ?? 'model').trim() || 'model',
			meshyRootTaskId: String(existingSettings.rootTaskId ?? task.taskId ?? '').trim() || undefined,
			meshyParentTaskId: String(existingSettings.parentTaskId ?? '').trim() || undefined,
			meshyCapabilities: existingSettings.capabilities ?? undefined,
			meshyTaskStatus: normalized,
			meshyProgress: finalProgress,
			meshyStatusText: statusText,
			meshyThumbnailUrl: resolvedThumbnailUrl || undefined,
			meshyModelUrls: modelUrls,
			meshyErrorMessage: errorMessage,
			meshyOutputSummary: {
				outputKind: isImageTarget ? 'image' : '3d-model',
				preferredUrl:
					(isImageTarget ? preferredImageUrl || preferredModelUrl : preferredModelUrl) || undefined,
				imageUrls: isImageTarget ? imageUrls.slice(0, 4) : undefined,
				thumbnailUrl: resolvedThumbnailUrl || undefined,
				format: isImageTarget ? undefined : format
			},
			meshyRelationSummary: {
				...(isRecord(existingSettings.relationSummary) ? existingSettings.relationSummary : {}),
				relationKind: String(existingSettings.relationKind ?? 'model').trim() || 'model',
				rootTaskId: String(existingSettings.rootTaskId ?? task.taskId ?? '').trim() || undefined,
				parentTaskId: String(existingSettings.parentTaskId ?? '').trim() || undefined,
				effectiveTaskId: task.taskId || undefined,
				effectiveRelationKind: String(existingSettings.relationKind ?? 'model').trim() || 'model',
				effectiveStatus: normalized,
				effectiveProgress: task.progress,
				effectivePreferredModelUrl: preferredModelUrl || undefined,
				effectivePreferredImageUrl: preferredImageUrl || undefined,
				effectiveLocalAssetUrl: String(existingSettings.outputAssetUrl ?? '').trim() || undefined,
				effectiveLocalAssetPath: String(existingSettings.outputAssetPath ?? '').trim() || undefined,
				effectiveThumbnailUrl: resolvedThumbnailUrl || undefined
			}
		}

		if (normalized === 'succeeded') {
			try {
				if (isImageTarget) {
					const imageSource = preferredImageUrl || preferredModelUrl
					if (imageSource) {
						const ext = options.fileExtensionFromUrl(imageSource, '.png')
						const fileName = `meshy_${task.taskId || nodeId}${ext}`
						const persisted = await options.persistExternalAssetToProject({
							kind: 'image',
							name: fileName,
							sourceUrl: imageSource,
							sourcePath: task.sourceImageUrl || task.sourceModelUrl || undefined
						})
						const assetUrl = String(persisted?.url || imageSource)
						const assetPath = String(persisted?.absolutePath || '').trim() || undefined
						const projectRelativePath =
							String(persisted?.projectRelativePath || '').trim() || undefined

						patch.meshyOutputAssetUrl = assetUrl
						patch.meshyOutputAssetPath = assetPath
						patch.meshyOutputSummary = {
							...(isRecord(patch.meshyOutputSummary) ? patch.meshyOutputSummary : {}),
							outputKind: 'image',
							preferredUrl: imageSource,
							imageUrls: imageUrls.length ? imageUrls.slice(0, 4) : [imageSource],
							assetUrl,
							assetPath,
							thumbnailUrl: thumbnailUrl || undefined,
							format: undefined
						}
						patch.meshyRelationSummary = {
							...(isRecord(patch.meshyRelationSummary) ? patch.meshyRelationSummary : {}),
							effectivePreferredImageUrl: imageSource,
							effectiveLocalAssetUrl: assetUrl,
							effectiveLocalAssetPath: assetPath
						}

						if (node.type === 'image' && assetUrl) {
							const resourceId = `meshy-img-${task.taskId || nodeId}-${Date.now()}`
							const resourceName = `meshy_image_${resourceId.slice(-8)}`

							const resourceBase: Record<string, unknown> = {
								id: resourceId,
								kind: 'image',
								name: resourceName,
								url: assetUrl,
								sourcePath: assetPath,
								projectRelativePath,
								createdAt: Date.now()
							}

							const existingResource =
								(options.store.state as unknown as Record<string, unknown>).resources &&
								Array.isArray(
									(options.store.state as unknown as Record<string, unknown>).resources
								) &&
								(
									options.store.state as unknown as { resources: Array<{ id: string }> }
								).resources.find((r) => r.id === resourceId)
							if (existingResource) {
								if (NODE_BINDING_DEBUG) {
									console.log('[Meshy Runtime] 资源已存在，跳过添加:', resourceId)
								}
							} else {
								options.store.commit('addResource', resourceBase)
								if (NODE_BINDING_DEBUG) {
									console.log('[Meshy Runtime] 资源已添加:', resourceBase)
								}
							}

							const currentNode = getNodeFromStore(nodeId)
							const currentNodeResourceId = currentNode?.resourceId
							if (NODE_BINDING_DEBUG) {
								console.log(
									'[Meshy Runtime] 节点当前resourceId:',
									currentNodeResourceId,
									'新resourceId:',
									resourceId
								)
							}

							options.store.commit('setNodeResource', { nodeId, resourceId })

							const updatedNode = getNodeFromStore(nodeId)
							if (NODE_BINDING_DEBUG) {
								console.log('[Meshy Runtime] 绑定后节点resourceId:', updatedNode?.resourceId)
								console.log('[Meshy Runtime] 图片资源已绑定到节点:', { nodeId, resourceId, assetUrl })
							}
						}
					}
				} else if (preferredModelUrl) {
					const backendLocalAssetUrl = String(task.localAssetUrl ?? '').trim()
					const backendLocalAssetPath = String(task.localAssetPath ?? '').trim()
					// ========== 硬防护：后端 DB 的 localAsset* 可能被历史数据污染成 PNG 缩略图 ==========
					const backendAssetIsImage =
						isMeshyRuntimeImageUrlOrPath(backendLocalAssetUrl) ||
						isMeshyRuntimeImageUrlOrPath(backendLocalAssetPath)
					const hasBackendLocalAsset =
						!!backendLocalAssetUrl &&
						!isMeshyRemoteUrl(backendLocalAssetUrl) &&
						!backendAssetIsImage

					if (hasBackendLocalAsset) {
						patch.meshyOutputAssetUrl = backendLocalAssetUrl
						patch.meshyOutputAssetPath = backendLocalAssetPath || undefined
						commitMeshyDownloadProgress(nodeId, node, { stage: 'done', progress: 100 })

						if (!resolvedThumbnailUrl && thumbnailUrl) {
							if (!isMeshyRemoteUrl(thumbnailUrl)) {
								resolvedThumbnailUrl = thumbnailUrl
							} else {
								try {
									const thumbName = `meshy_${task.taskId || nodeId}_preview${options.fileExtensionFromUrl(thumbnailUrl, '.png')}`
									const persistedThumb = await options.persistExternalAssetToProject({
										kind: 'image',
										name: thumbName,
										sourceUrl: thumbnailUrl
									})
									const localThumb = String(persistedThumb?.url || '').trim()
									if (localThumb) {
										resolvedThumbnailUrl = localThumb
									}
								} catch {
									// Ignore thumbnail persistence errors
								}
							}
						}

						patch.meshyOutputSummary = {
							...(isRecord(patch.meshyOutputSummary) ? patch.meshyOutputSummary : {}),
							outputKind: '3d-model',
							preferredUrl: preferredModelUrl,
							imageUrls: undefined,
							assetUrl: backendLocalAssetUrl,
							assetPath: backendLocalAssetPath || undefined,
							thumbnailUrl: resolvedThumbnailUrl || undefined,
							format
						}
						patch.meshyRelationSummary = {
							...(isRecord(patch.meshyRelationSummary) ? patch.meshyRelationSummary : {}),
							effectiveLocalAssetUrl: backendLocalAssetUrl,
							effectiveLocalAssetPath: backendLocalAssetPath || undefined,
							effectiveThumbnailUrl: resolvedThumbnailUrl || undefined
						}
						patch.meshyThumbnailUrl = resolvedThumbnailUrl || undefined
					} else {
						commitMeshyDownloadProgress(nodeId, node, {
							stage: 'downloading',
							progress: 0,
							loaded: 0,
							total: 0,
							speed: 0,
							error: ''
						})
						const fileName = `meshy_${task.taskId || nodeId}.${format}`
						const persisted = await options.persistExternalAssetToProject({
							kind: 'file',
							name: fileName,
							sourceUrl: preferredModelUrl,
							sourcePath: task.sourceModelUrl || undefined,
							onProgress: (info: ExternalAssetProgress) => {
								commitMeshyDownloadProgress(nodeId, node, {
									stage: 'downloading',
									progress: info.percentage,
									loaded: info.loaded,
									total: info.total,
									speed: info.speed
								})
							}
						})
						patch.meshyOutputAssetUrl = String(persisted?.url || preferredModelUrl)
						patch.meshyOutputAssetPath = String(persisted?.absolutePath || '').trim() || undefined

						if (!resolvedThumbnailUrl && thumbnailUrl) {
							try {
								const thumbName = `meshy_${task.taskId || nodeId}_preview${options.fileExtensionFromUrl(thumbnailUrl, '.png')}`
								const persistedThumb = await options.persistExternalAssetToProject({
									kind: 'image',
									name: thumbName,
									sourceUrl: thumbnailUrl
								})
								const localThumb = String(persistedThumb?.url || '').trim()
								if (localThumb) {
									resolvedThumbnailUrl = localThumb
								}
							} catch {
								// Ignore thumbnail persistence errors
							}
						}

						patch.meshyOutputSummary = {
							...(isRecord(patch.meshyOutputSummary) ? patch.meshyOutputSummary : {}),
							outputKind: '3d-model',
							preferredUrl: preferredModelUrl,
							imageUrls: undefined,
							assetUrl: String(persisted?.url || preferredModelUrl),
							assetPath: String(persisted?.absolutePath || '').trim() || undefined,
							thumbnailUrl: resolvedThumbnailUrl || undefined,
							format
						}
						patch.meshyRelationSummary = {
							...(isRecord(patch.meshyRelationSummary) ? patch.meshyRelationSummary : {}),
							effectiveLocalAssetUrl: String(persisted?.url || preferredModelUrl),
							effectiveLocalAssetPath: String(persisted?.absolutePath || '').trim() || undefined,
							effectiveThumbnailUrl: resolvedThumbnailUrl || undefined
						}
						patch.meshyThumbnailUrl = resolvedThumbnailUrl || undefined

						if (node.type === 'model3d' && persisted?.url) {
							const resourceId = `meshy-model-${task.taskId || nodeId}-${Date.now()}`
							const resourceName = `meshy_model_${resourceId.slice(-8)}`

							const resourceBase = {
								id: resourceId,
								kind: 'model3d',
								name: resourceName,
								url: String(persisted.url || preferredModelUrl),
								sourcePath: String(persisted.absolutePath || '').trim() || undefined,
								projectRelativePath:
									String(persisted.projectRelativePath || '').trim() || undefined,
								posterUrl: resolvedThumbnailUrl || undefined,
								createdAt: Date.now()
							}

							const state = options.store.state as unknown as Record<string, unknown>
							const resourcesById = isRecord(state.resourcesById) ? state.resourcesById : {}
							const existingResource =
								resourcesById[resourceId] ||
								(Array.isArray(state.resources) &&
									(state.resources as Array<{ id: string }>).find((r) => r.id === resourceId))
							if (!existingResource) {
								options.store.commit('addResource', resourceBase)
							}

							options.store.commit('setNodeResource', { nodeId, resourceId })
						}
						commitMeshyDownloadProgress(nodeId, node, { stage: 'done', progress: 100 })
					}
				}
			} catch (e: unknown) {
				const errMsg = e instanceof Error ? e.message : String(e)
				console.error('[Meshy Runtime] 产物下载/绑定失败，状态仍标记为成功:', e)
				if (!isImageTarget && preferredModelUrl) {
					commitMeshyDownloadProgress(nodeId, node, { stage: 'failed', error: errMsg })
				}
				if (!patch.meshyOutputAssetUrl) {
					if (isImageTarget) {
						const imageSource = preferredImageUrl || preferredModelUrl
						if (imageSource) {
							patch.meshyOutputAssetUrl = imageSource
							patch.meshyOutputSummary = {
								...(isRecord(patch.meshyOutputSummary) ? patch.meshyOutputSummary : {}),
								outputKind: 'image',
								preferredUrl: imageSource,
								imageUrls: imageUrls.length ? imageUrls.slice(0, 4) : [imageSource],
								assetUrl: imageSource,
								thumbnailUrl: thumbnailUrl || undefined
							}
							patch.meshyRelationSummary = {
								...(isRecord(patch.meshyRelationSummary) ? patch.meshyRelationSummary : {}),
								effectivePreferredImageUrl: imageSource,
								effectiveLocalAssetUrl: imageSource
							}
						}
					} else if (preferredModelUrl) {
						patch.meshyOutputAssetUrl = preferredModelUrl
						patch.meshyOutputSummary = {
							...(isRecord(patch.meshyOutputSummary) ? patch.meshyOutputSummary : {}),
							outputKind: '3d-model',
							preferredUrl: preferredModelUrl,
							assetUrl: preferredModelUrl,
							thumbnailUrl: thumbnailUrl || undefined,
							format
						}
						patch.meshyRelationSummary = {
							...(isRecord(patch.meshyRelationSummary) ? patch.meshyRelationSummary : {}),
							effectiveLocalAssetUrl: preferredModelUrl,
							effectiveThumbnailUrl: thumbnailUrl || undefined
						}
						patch.meshyThumbnailUrl = thumbnailUrl || undefined
					}
				}
			}
		}

		const targetNode = getNodeFromStore(nodeId)
		if (targetNode?.type === 'image') {
			const imagePatch: Record<string, unknown> = {
				taskId: patch.meshyTaskId,
				taskStatus: normalized,
				taskFamily: String(task.mode || '').includes('image-to-image')
					? 'image-to-image'
					: 'text-to-image',
				progress: patch.meshyProgress,
				statusText: patch.meshyStatusText,
				errorMessage: patch.meshyErrorMessage,
				outputAssetUrl: patch.meshyOutputAssetUrl,
				outputAssetPath: patch.meshyOutputAssetPath,
				outputSummary: isRecord(patch.meshyOutputSummary)
					? {
							preferredUrl: patch.meshyOutputSummary.preferredUrl,
							imageUrls: patch.meshyOutputSummary.imageUrls,
							assetUrl: patch.meshyOutputSummary.assetUrl,
							assetPath: patch.meshyOutputSummary.assetPath,
							thumbnailUrl: patch.meshyOutputSummary.thumbnailUrl
						}
					: undefined,
				thumbnailUrl: resolvedThumbnailUrl || undefined
			}
			options.store.commit('setNodeImageSettings', {
				nodeId,
				imageSettings: { meshyImageSettings: imagePatch }
			})
		} else if (targetNode?.type === 'model3d') {
			const existingMeshy = existingSettings ?? {}
			const existingModel3d = isRecord(targetNode.model3dSettings) ? targetNode.model3dSettings : {}
			const model3dPatch: Record<string, unknown> = {
				meshyModelSettings: {
					taskId: patch.meshyTaskId,
					taskStatus: normalized,
					taskFamily: String(existingMeshy.taskFamily || task.mode || 'text-to-3d').trim(),
					progress: patch.meshyProgress,
					statusText: patch.meshyStatusText,
					errorMessage: patch.meshyErrorMessage,
					outputSummary: patch.meshyOutputSummary,
					outputAssetUrl: patch.meshyOutputAssetUrl,
					outputAssetPath: patch.meshyOutputAssetPath,
					thumbnailUrl: resolvedThumbnailUrl || undefined,
					relationSummary: patch.meshyRelationSummary,
					imageCount: Number(existingMeshy.imageCount ?? 0),
					imageUrls: Array.isArray(existingMeshy.imageUrls) ? existingMeshy.imageUrls : [],
					prompt: String(existingMeshy.prompt ?? '')
				}
			}

			// 解析 Meshy 侧的有效模型来源（与消费端 getMeshyEffectiveModelSource 对齐）
			const meshySource = (() => {
				const rs = isRecord(patch.meshyRelationSummary) ? patch.meshyRelationSummary : {}
				const os = isRecord(patch.meshyOutputSummary) ? patch.meshyOutputSummary : {}
				const mus = isRecord(patch.meshyModelUrls) ? (patch.meshyModelUrls as Record<string, unknown>) : {}
				const rawAssetUrl =
					normalizeText(rs.effectiveLocalAssetUrl ?? patch.meshyOutputAssetUrl ?? os.assetUrl)
				const rawAssetPath =
					normalizeText(rs.effectiveLocalAssetPath ?? patch.meshyOutputAssetPath ?? os.assetPath)
				// ===== 硬防护：asset 字段一旦为图片后缀 (如 png缩略图 污染)，直接丢弃 =====
				const assetUrl =
					rawAssetUrl && !isMeshyRuntimeImageUrlOrPath(rawAssetUrl) ? rawAssetUrl : ''
				const assetPath =
					rawAssetPath && !isMeshyRuntimeImageUrlOrPath(rawAssetPath) ? rawAssetPath : ''
				const preferredUrl =
					normalizeText(rs.effectivePreferredModelUrl ?? os.preferredUrl) ||
					assetUrl ||
					options.pickMeshyPreferredModelUrl(mus as any)
				const fmt =
					normalizeText(os.format).toLowerCase() === 'gltf'
						? 'gltf'
						: options.pickMeshyPreferredFormat(mus as any)
				return { assetUrl, assetPath, preferredUrl, format: fmt }
			})()

			const existingModelUrl = String(existingModel3d.modelUrl ?? '').trim()
			const existingModelAssetUrl = String(existingModel3d.modelAssetUrl ?? '').trim()
			const existingHasOuterUrl = !!(existingModelAssetUrl || existingModelUrl)

			// 计算候选模型 URL：优先使用已持久化的 assetUrl，其次 preferredUrl
			const candidateUrl =
				(meshySource.assetUrl && isMeshyRuntimeLikely3DModelUrl(meshySource.assetUrl)
					? meshySource.assetUrl
					: '') ||
				(meshySource.preferredUrl && isMeshyRuntimeLikely3DModelUrl(meshySource.preferredUrl)
					? meshySource.preferredUrl
					: '')

			let finalLocalAssetUrl = ''
			let finalLocalAssetPath = ''

			// 放宽同步条件：只要有候选URL 且 (状态成功 或 有 下载资产URL 或 外层尚未有URL)，就同步外层 model3dSettings
			// 去掉之前强制 "非远端才能同步 + 外层无本地URL才能同步远端" 的限制，消费端已兼容
			if (candidateUrl && (normalized === 'succeeded' || !existingHasOuterUrl || meshySource.assetUrl)) {
				const newIsRemote = isMeshyRemoteUrl(candidateUrl)
				model3dPatch.modelUrl = candidateUrl
				model3dPatch.modelAssetUrl = candidateUrl
				// ===== 硬防护：modelAssetPath/modelSourcePath 是图片后缀直接不写 =====
				if (meshySource.assetPath && !isMeshyRuntimeImageUrlOrPath(meshySource.assetPath)) {
					model3dPatch.modelAssetPath = meshySource.assetPath
				}
				model3dPatch.modelFormat = meshySource.format
				model3dPatch.modelGenerationSource = 'meshy'
				// 同步 modelSourceName：从 URL 解析文件名
				try {
					const withoutQuery = candidateUrl.split('?')[0].split('#')[0]
					const lastSlash = withoutQuery.lastIndexOf('/')
					const base = lastSlash >= 0 ? withoutQuery.slice(lastSlash + 1) : withoutQuery
					const sourceName = decodeURIComponent(base).trim()
					if (sourceName) model3dPatch.modelSourceName = sourceName
				} catch {
					// ignore
				}
				// ===== 硬防护：modelSourcePath 只接受模型后缀 =====
				const rawSourcePath = normalizeText(patch.meshyOutputAssetPath)
				if (rawSourcePath && !isMeshyRuntimeImageUrlOrPath(rawSourcePath)) {
					model3dPatch.modelSourcePath = rawSourcePath
				}
				if (!newIsRemote && meshySource.assetUrl) {
					finalLocalAssetUrl = candidateUrl
					finalLocalAssetPath = String(meshySource.assetPath || patch.meshyOutputAssetPath || '')
					// ===== 硬防护：finalLocalAssetPath 是图片后缀时禁止回写到 DB =====
					if (finalLocalAssetPath && isMeshyRuntimeImageUrlOrPath(finalLocalAssetPath)) {
						finalLocalAssetPath = ''
					}
				}
			}

			options.store.commit('setNodeModel3DSettings', { nodeId, model3dSettings: model3dPatch })

			if (finalLocalAssetUrl && task.taskId) {
				const comfySvc = options.getComfyService()
				void comfySvc
					.meshyUpdateLocalAsset({
						taskId: String(task.taskId),
						localAssetUrl: finalLocalAssetUrl,
						localAssetPath: finalLocalAssetPath || undefined,
						lastNodeId: nodeId
					})
					.then((res) => {
						if (!res.ok) {
							console.warn('[Meshy Runtime] 回写本地资源URL到后端失败:', res.error)
						} else if (NODE_BINDING_DEBUG) {
							console.log('[Meshy Runtime] 本地资源URL已回写到后端:', {
								taskId: task.taskId,
								localAssetUrl: finalLocalAssetUrl
							})
						}
					})
					.catch((err) => {
						console.warn('[Meshy Runtime] 回写本地资源URL异常:', err)
					})
			}
		} else {
			options.store.commit('setNodeMeshySettings', { nodeId, meshySettings: patch })
		}
		if (options.shouldRefreshMeshyTaskItems()) {
			try {
				void options.refreshMeshyTaskItems({ silent: true })
			} catch (e: unknown) {
				console.warn('[Meshy Runtime] 刷新任务列表失败:', e)
			}
		}
		if (normalized === 'succeeded') {
			try {
				if (
					isImageTarget &&
					(preferredImageUrl ||
						preferredModelUrl ||
						String(
							(isRecord(patch.meshyOutputSummary) ? patch.meshyOutputSummary.assetUrl : '') ?? ''
						).trim())
				) {
					await options.syncConnectedImageTargetsFromMeshy(nodeId)
				} else if (
					!isImageTarget &&
					(preferredModelUrl ||
						String(
							(isRecord(patch.meshyOutputSummary) ? patch.meshyOutputSummary.assetUrl : '') ?? ''
						).trim())
				) {
					await options.syncConnectedModel3DTargets(nodeId)
				}
			} catch (e: unknown) {
				console.warn('[Meshy Runtime] 同步下游节点失败，不影响任务状态:', e)
			}
		}
		return normalized
	}

	const getNodeMeshyTaskStatus = (node: WorkflowNodeLike | null): string => {
		if (!node) return 'idle'
		if (node.type === 'image') {
			const imgSettings = isRecord(node.imageSettings) ? node.imageSettings : {}
			const meshyImg = isRecord(imgSettings.meshyImageSettings)
				? imgSettings.meshyImageSettings
				: {}
			return String(meshyImg.taskStatus ?? 'idle').trim()
		}
		if (node.type === 'model3d') {
			const m3dSettings = isRecord(node.model3dSettings) ? node.model3dSettings : {}
			const meshyM3d = isRecord(m3dSettings.meshyModelSettings)
				? m3dSettings.meshyModelSettings
				: {}
			return String(meshyM3d.taskStatus ?? 'idle').trim()
		}
		const meshySettings = isRecord(node.meshySettings) ? node.meshySettings : {}
		return String(meshySettings.meshyTaskStatus ?? 'idle').trim()
	}

	const commitMeshyTaskFailed = (nid: string, node: WorkflowNodeLike | null, msg: string) => {
		const patch: Record<string, unknown> = {
			taskStatus: 'failed',
			statusText: msg,
			errorMessage: ''
		}
		if (node?.type === 'image') {
			options.store.commit('setNodeImageSettings', {
				nodeId: nid,
				imageSettings: { meshyImageSettings: patch }
			})
		} else if (node?.type === 'model3d') {
			options.store.commit('setNodeModel3DSettings', {
				nodeId: nid,
				model3dSettings: { meshyModelSettings: patch }
			})
		} else {
			options.store.commit('setNodeMeshySettings', {
				nodeId: nid,
				meshySettings: { meshyTaskStatus: 'failed', meshyStatusText: msg, meshyErrorMessage: '' }
			})
		}
	}

	const getNodeMeshyTaskId = (node: WorkflowNodeLike | null): string => {
		if (!node) return ''
		if (node.type === 'image') {
			const imgSettings = isRecord(node.imageSettings) ? node.imageSettings : {}
			const meshyImg = isRecord(imgSettings.meshyImageSettings)
				? imgSettings.meshyImageSettings
				: {}
			return String(meshyImg.taskId ?? '').trim()
		}
		if (node.type === 'model3d') {
			const m3dSettings = isRecord(node.model3dSettings) ? node.model3dSettings : {}
			const meshyM3d = isRecord(m3dSettings.meshyModelSettings)
				? m3dSettings.meshyModelSettings
				: {}
			return String(meshyM3d.taskId ?? '').trim()
		}
		const meshySettings = isRecord(node.meshySettings) ? node.meshySettings : {}
		return String(meshySettings.meshyTaskId ?? '').trim()
	}

	const getNodeMeshyTaskFamily = (node: WorkflowNodeLike | null): string => {
		if (!node) return ''
		if (node.type === 'image') {
			const imgSettings = isRecord(node.imageSettings) ? node.imageSettings : {}
			const meshyImg = isRecord(imgSettings.meshyImageSettings)
				? imgSettings.meshyImageSettings
				: {}
			return String(meshyImg.taskFamily ?? 'text-to-image').trim()
		}
		if (node.type === 'model3d') {
			const m3dSettings = isRecord(node.model3dSettings) ? node.model3dSettings : {}
			const meshyM3d = isRecord(m3dSettings.meshyModelSettings)
				? m3dSettings.meshyModelSettings
				: {}
			return String(meshyM3d.taskFamily ?? 'text-to-3d').trim()
		}
		const meshySettings = isRecord(node.meshySettings) ? node.meshySettings : {}
		return String(meshySettings.meshyTaskFamily ?? '').trim()
	}

	const startMeshyPollClassic = (nodeId: string, taskId: string, mode: string) => {
		stopMeshyPoll(nodeId)
		meshyTerminalNotified.delete(nodeId)
		meshyPollErrorCounts.delete(nodeId)

		const tick = async () => {
			const currentNode = getNodeFromStore(nodeId)
			if (!currentNode) {
				stopMeshyPoll(nodeId)
				return
			}
			const currentStatus = getNodeMeshyTaskStatus(currentNode)
			if (
				currentStatus === 'succeeded' ||
				currentStatus === 'failed' ||
				currentStatus === 'canceled'
			) {
				stopMeshyPoll(nodeId)
				return
			}

			try {
				const res = await options.getComfyService().meshyTask(taskId, mode)
				if (!res.ok) {
					const nextCount = Number(meshyPollErrorCounts.get(nodeId) ?? 0) + 1
					meshyPollErrorCounts.set(nodeId, nextCount)
					if (nextCount >= 4) {
						stopMeshyPoll(nodeId)
						commitMeshyTaskFailed(nodeId, currentNode, t('tasks.meshy.pollStatusFailedConsecutive'))
						options.pushToast(t('tasks.meshy.pollStatusFailedConsecutiveToast'), 'warn')
					}
					return
				}

				meshyPollErrorCounts.delete(nodeId)
				const finalStatus = await applyMeshyTaskResult(nodeId, res)
				if (finalStatus === 'succeeded' || finalStatus === 'failed' || finalStatus === 'canceled') {
					if (!meshyTerminalNotified.has(nodeId)) {
						meshyTerminalNotified.add(nodeId)
						const finalTarget = String(mode).includes('image') ? 'image' : '3d'
						if (finalStatus === 'succeeded') {
							options.pushToast(
								finalTarget === 'image'
									? t('tasks.meshy.imageTaskCompleted')
									: t('tasks.meshy.model3dTaskCompleted'),
								'info'
							)
						} else if (finalStatus === 'failed') {
							options.pushToast(
								finalTarget === 'image'
									? t('tasks.meshy.imageTaskFailed')
									: t('tasks.meshy.model3dTaskFailed'),
								'warn'
							)
						} else {
							options.pushToast(t('tasks.meshy.taskCanceled'), 'warn')
						}
					}
					stopMeshyPoll(nodeId)
				}
			} catch (err: unknown) {
				const nextCount = Number(meshyPollErrorCounts.get(nodeId) ?? 0) + 1
				meshyPollErrorCounts.set(nodeId, nextCount)
				if (nextCount >= 4) {
					stopMeshyPoll(nodeId)
					const currentNodeForFail = getNodeFromStore(nodeId)
					commitMeshyTaskFailed(nodeId, currentNodeForFail, t('tasks.meshy.pollStatusException'))
					options.pushToast(t('tasks.meshy.pollStatusExceptionToast'), 'warn')
				}
			}
		}

		void tick()
		const timer = window.setInterval(() => void tick(), 1600)
		meshyPollTimers.set(nodeId, timer)
	}

	const startMeshyPoll = (nodeId: string, taskId: string, mode: string) => {
		let scheduler: TaskPollScheduler | null = null
		try {
			scheduler = TaskPollScheduler.shared
			if (!scheduler.isEnabled()) {
				startMeshyPollClassic(nodeId, taskId, mode)
				return
			}
		} catch {
			startMeshyPollClassic(nodeId, taskId, mode)
			return
		}

		stopMeshyPoll(nodeId)
		meshyTerminalNotified.delete(nodeId)
		meshyPollErrorCounts.delete(nodeId)
		const modeCapture = String(mode || '')

		const handleTick = async (state: PollTaskState): Promise<PollTaskState | null> => {
			const currentNode = getNodeFromStore(nodeId)
			if (!currentNode) {
				stopMeshyPoll(nodeId)
				return { ...state, status: 'canceled', errorCount: 0 }
			}
			const currentStatus = getNodeMeshyTaskStatus(currentNode)
			if (
				currentStatus === 'succeeded' ||
				currentStatus === 'failed' ||
				currentStatus === 'canceled'
			) {
				stopMeshyPoll(nodeId)
				return {
					...state,
					status: (currentStatus as PollTaskState['status']) || 'completed',
					errorCount: state.errorCount
				}
			}

			try {
				const res = await options.getComfyService().meshyTask(taskId, modeCapture)
				if (!res.ok) {
					const nextCount = state.errorCount + 1
					if (nextCount >= 4) {
						stopMeshyPoll(nodeId)
						commitMeshyTaskFailed(nodeId, currentNode, t('tasks.meshy.pollStatusFailedConsecutive'))
						options.pushToast(t('tasks.meshy.pollStatusFailedConsecutiveToast'), 'warn')
						return { ...state, status: 'failed', errorCount: nextCount }
					}
					return { ...state, errorCount: nextCount }
				}

				const finalStatus = await applyMeshyTaskResult(nodeId, res)
				const normalized = extractMeshyTaskResultFields(res)
				const updatedProgress =
					typeof normalized.progress === 'number'
						? Math.max(0, Math.min(100, normalized.progress))
						: state.progress
				if (finalStatus === 'succeeded' || finalStatus === 'failed' || finalStatus === 'canceled') {
					if (!meshyTerminalNotified.has(nodeId)) {
						meshyTerminalNotified.add(nodeId)
						const finalTarget = modeCapture.includes('image') ? 'image' : '3d'
						if (finalStatus === 'succeeded') {
							options.pushToast(
								finalTarget === 'image'
									? t('tasks.meshy.imageTaskCompleted')
									: t('tasks.meshy.model3dTaskCompleted'),
								'info'
							)
						} else if (finalStatus === 'failed') {
							options.pushToast(
								finalTarget === 'image'
									? t('tasks.meshy.imageTaskFailed')
									: t('tasks.meshy.model3dTaskFailed'),
								'warn'
							)
						} else {
							options.pushToast(t('tasks.meshy.taskCanceled'), 'warn')
						}
					}
					stopMeshyPoll(nodeId)
					return {
						...state,
						status: (finalStatus as PollTaskState['status']) || 'completed',
						progress: finalStatus === 'succeeded' ? 100 : updatedProgress,
						errorCount: 0
					}
				}
				return {
					...state,
					progress: updatedProgress,
					errorCount: 0,
					lastErrorText: undefined
				}
			} catch (err: unknown) {
				const nextCount = state.errorCount + 1
				if (nextCount >= 4) {
					stopMeshyPoll(nodeId)
					const currentNodeForFail = getNodeFromStore(nodeId)
					commitMeshyTaskFailed(nodeId, currentNodeForFail, t('tasks.meshy.pollStatusException'))
					options.pushToast(t('tasks.meshy.pollStatusExceptionToast'), 'warn')
					return { ...state, status: 'failed', errorCount: nextCount }
				}
				return {
					...state,
					errorCount: nextCount,
					lastErrorText:
						err instanceof Error ? err.message : typeof err === 'string' ? err : String(err ?? '')
				}
			}
		}

		const currentNode = getNodeFromStore(nodeId)
		const initStatus = getNodeMeshyTaskStatus(currentNode) as PollTaskState['status']
		try {
			scheduler.register(
				nodeId,
				taskId,
				'meshy',
				{ onTick: handleTick },
				(initStatus || 'pending') as PollTaskState['status'],
				0
			)
		} catch {
			startMeshyPollClassic(nodeId, taskId, modeCapture)
		}
	}

	const recoverMeshyTaskStates = async (opts?: { silent?: boolean }) => {
		const meshyNodes: WorkflowNodeLike[] = []
		const state = options.store.state as unknown as Record<string, unknown>
		const resourcesById = isRecord(state.resourcesById) ? state.resourcesById : {}
		for (const id of options.store.state.nodeOrder) {
			const n = options.store.state.nodesById[id] as WorkflowNodeLike | undefined
			if (n && (n.type === 'image' || n.type === 'model3d')) {
				const status = getNodeMeshyTaskStatus(n)
				const taskId = getNodeMeshyTaskId(n)
				if (
					status === 'pending' ||
					status === 'running' ||
					status === 'queued' ||
					status === 'in_progress'
				) {
					meshyNodes.push(n)
					continue
				}
				if (n.type === 'model3d' && status === 'succeeded' && taskId) {
					const m3dSettings = isRecord(n.model3dSettings) ? n.model3dSettings : {}
					const innerMeshy = isRecord(m3dSettings.meshyModelSettings) ? m3dSettings.meshyModelSettings : {}
					const outputSummary = isRecord(innerMeshy.outputSummary) ? innerMeshy.outputSummary : {}
					const relationSummary = isRecord(innerMeshy.relationSummary) ? innerMeshy.relationSummary : {}

					const modelUrl = String(m3dSettings.modelUrl ?? '').trim()
					const modelAssetUrl = String(m3dSettings.modelAssetUrl ?? '').trim()
					const modelAssetPath = String(m3dSettings.modelAssetPath ?? '').trim()
					const modelSourcePath = String(m3dSettings.modelSourcePath ?? '').trim()
					const modelProjectRelativePath = String(m3dSettings.modelProjectRelativePath ?? '').trim()
					const modelAssetProjectRelativePath = String(
						m3dSettings.modelAssetProjectRelativePath ?? ''
					).trim()

					const innerAssetUrl = String(
						outputSummary.assetUrl ?? relationSummary.effectiveLocalAssetUrl ?? innerMeshy.outputAssetUrl ?? ''
					).trim()
					const innerAssetPath = String(
						outputSummary.assetPath ?? relationSummary.effectiveLocalAssetPath ?? innerMeshy.outputAssetPath ?? ''
					).trim()

					const nodeResourceId = String(n.resourceId ?? '').trim()
					let resourceHasLocal = false
					if (nodeResourceId && isRecord(resourcesById[nodeResourceId])) {
						const res = resourcesById[nodeResourceId] as Record<string, unknown>
						const resUrl = String(res.url ?? '').trim()
						const resRel = String(res.projectRelativePath ?? '').trim()
						const resAbs = String(res.sourcePath ?? res.absolutePath ?? '').trim()
						resourceHasLocal =
							(!!resUrl && !isMeshyRemoteUrl(resUrl) && isMeshyRuntimeLikely3DModelUrl(resUrl)) ||
							(!!resRel && isMeshyRuntimeLikely3DModelUrl(resRel)) ||
							(!!resAbs && isMeshyRuntimeLikely3DModelUrl(resAbs))
					}

					const candidateUrls = [
						modelUrl,
						modelAssetUrl,
						innerAssetUrl
					].filter(Boolean) as string[]
					const candidatePaths = [
						modelAssetPath,
						modelSourcePath,
						modelProjectRelativePath,
						modelAssetProjectRelativePath,
						innerAssetPath
					].filter(Boolean) as string[]

					const hasLocalUrl = candidateUrls.some(
						(u) => !isMeshyRemoteUrl(u) && isMeshyRuntimeLikely3DModelUrl(u)
					)
					const hasLocalPath =
						resourceHasLocal ||
						candidatePaths.some((p) => isMeshyRuntimeLikely3DModelUrl(p))

					if (!hasLocalUrl && !hasLocalPath) {
						meshyNodes.push(n)
					}
				}
			}
		}

		for (const node of meshyNodes) {
			const nodeId = node.id as string
			const taskId = getNodeMeshyTaskId(node)
			const taskFamily = getNodeMeshyTaskFamily(node)
			if (!taskId) {
				const status = getNodeMeshyTaskStatus(node)
				if (status !== 'succeeded') {
					commitMeshyTaskFailed(nodeId, node, t('tasks.meshy.taskIdLostCannotRecover'))
				}
				continue
			}

			try {
				const res = await options.getComfyService().meshyTask(taskId, taskFamily)
				if (!res.ok) {
					if (!opts?.silent) {
						options.pushToast(
							t('aiworkflow.toast.meshyQueryFailed', { name: node.alias || node.title || nodeId }),
							'warn'
						)
					}
					continue
				}

				const finalStatus = await applyMeshyTaskResult(nodeId, res)
				if (
					finalStatus === 'pending' ||
					finalStatus === 'running' ||
					finalStatus === 'queued' ||
					finalStatus === 'in_progress'
				) {
					startMeshyPoll(nodeId, taskId, taskFamily)
				}
			} catch {
				if (!opts?.silent) {
					options.pushToast(
						t('aiworkflow.toast.meshyResumeFailed', { name: node.alias || node.title || nodeId }),
						'warn'
					)
				}
			}
		}
	}

	const clearMeshyRuntime = () => {
		for (const timer of meshyPollTimers.values()) window.clearInterval(timer)
		meshyPollTimers.clear()
		meshyPollErrorCounts.clear()
		meshyTerminalNotified.clear()
	}

	return {
		stopMeshyPoll,
		applyMeshyTaskResult,
		startMeshyPoll,
		recoverMeshyTaskStates,
		clearMeshyRuntime
	}
}
