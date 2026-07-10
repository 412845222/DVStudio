import type { ExternalAssetProgress } from '../../assets/useAIWorkflowAssetPersistence'
import { isArray, isNumber, isRecord, isString } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type {
	Tripo3DComfyService,
	Tripo3DStoreLike,
	PersistExternalAssetPayload,
	PersistExternalAssetResult,
	Tripo3DPersistArtifactsResult,
	Tripo3DImportArtifactsPayload
} from './types'
import { extractTripo3DTaskResultFields, isTripo3DImageMode } from './types'

type WorkflowNodeLike = {
	id: string
	type: string
	alias?: string
	title?: string
	imageSettings?: Record<string, unknown>
	model3dSettings?: Record<string, unknown>
	tripo3dSettings?: Record<string, unknown>
	resourceId?: string | null
	createdAt?: number
	[key: string]: unknown
}

export const useAIWorkflowTripo3DRuntime = (options: {
	store: Tripo3DStoreLike
	getComfyService: () => Tripo3DComfyService
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	normalizeTripo3DTaskStatus: (raw: unknown) => string
	pickTripo3DPreferredModelUrl: (urls: Record<string, string> | null | undefined) => string
	fileExtensionFromUrl: (url: string, fallbackExt: string) => string
	persistExternalAssetToProject: (
		payload: PersistExternalAssetPayload
	) => Promise<PersistExternalAssetResult>
	syncConnectedModel3DTargets: (nodeId: string) => Promise<unknown>
	refreshTripo3DTaskItems: (opts?: { silent?: boolean }) => Promise<unknown> | void
	shouldRefreshTripo3DTaskItems: () => boolean
}) => {
	const normalizeText = (value: unknown) => String(value ?? '').trim()

	const tripo3dPollTimers = new Map<string, number>()
	const tripo3dPollErrorCounts = new Map<string, number>()
	const tripo3dTerminalNotified = new Set<string>()

	const stopTripo3DPoll = (nodeId: string) => {
		const timer = tripo3dPollTimers.get(nodeId)
		if (timer != null) {
			window.clearInterval(timer)
			tripo3dPollTimers.delete(nodeId)
		}
		tripo3dPollErrorCounts.delete(nodeId)
	}

	const getNodeFromStore = (nodeId: string): WorkflowNodeLike | null => {
		const node = options.store.state.nodesById[nodeId]
		return (node as unknown as WorkflowNodeLike) ?? null
	}

	const getTripo3DSettings = (n: WorkflowNodeLike | null | undefined): Record<string, unknown> => {
	if (!n) return {}
	if (n.type === 'model3d') {
		const m3dSettings = isRecord(n.model3dSettings) ? n.model3dSettings : {}
		return isRecord(m3dSettings.tripo3dModelSettings) ? m3dSettings.tripo3dModelSettings as Record<string, unknown> : {}
	}
	if (n.type === 'image') {
		const imgSettings = isRecord(n.imageSettings) ? n.imageSettings : {}
		return isRecord(imgSettings.tripo3dImageSettings) ? imgSettings.tripo3dImageSettings as Record<string, unknown> : {}
	}
	return isRecord(n.tripo3dSettings) ? n.tripo3dSettings as Record<string, unknown> : {}
}

	const commitTripo3DDownloadProgress = (
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
			tripo3dDownloadStage: info.stage
		}
		if (info.progress != null) patch.tripo3dDownloadProgress = info.progress
		if (info.loaded != null) patch.tripo3dDownloadLoadedBytes = info.loaded
		if (info.total != null) patch.tripo3dDownloadTotalBytes = info.total
		if (info.speed != null) patch.tripo3dDownloadSpeedBytesPerSec = info.speed
		if (info.error != null) patch.tripo3dDownloadError = info.error

		if (node.type === 'model3d') {
			options.store.commit('setNodeModel3DSettings', {
				nodeId,
				model3dSettings: { tripo3dModelSettings: patch }
			})
		} else if (node.type === 'image') {
			const imgPatch: Record<string, unknown> = {}
			for (const [key, value] of Object.entries(patch)) {
				if (key.startsWith('tripo3d')) {
					const newKey = key.replace(/^tripo3d/, '')
					imgPatch[newKey.charAt(0).toLowerCase() + newKey.slice(1)] = value
				}
			}
			options.store.commit('setNodeImageSettings', {
				nodeId,
				imageSettings: { tripo3dImageSettings: imgPatch }
			})
		} else {
			options.store.commit('setNodeTripo3DSettings', { nodeId, tripo3dSettings: patch })
		}
	}

	const persistTripo3DArtifactsToProject = async (
		payload: Tripo3DImportArtifactsPayload & {
			onProgress?: (info: ExternalAssetProgress) => void
		}
	): Promise<Tripo3DPersistArtifactsResult> => {
		const taskId = String(payload.taskId ?? '').trim()
		const modelUrl = String(payload.modelUrl ?? '').trim()
		const thumbnailUrl = String(payload.thumbnailUrl ?? '').trim()
		const mode = String(payload.mode ?? 'text_to_model').trim()
		const isImageTask = isTripo3DImageMode(mode)

		if (isImageTask) {
			const imageUrls = isArray(payload.imageUrls) && payload.imageUrls.length > 0
				? payload.imageUrls.filter((u): u is string => isString(u) && !!u.trim()).map(u => u.trim())
				: (modelUrl ? [modelUrl] : [])

			if (imageUrls.length === 0) {
				return { ok: false, error: 'no image urls available' }
			}

			try {
				const primaryImageUrl = imageUrls[0]
				const ext = options.fileExtensionFromUrl(primaryImageUrl, 'png')
				const fileName = `tripo3d_image_${taskId || Date.now()}.${ext}`
				const persisted = await options.persistExternalAssetToProject({
					kind: 'image',
					name: fileName,
					sourceUrl: primaryImageUrl,
					onProgress: payload.onProgress
				})

				let localImageUrl = primaryImageUrl
				let localImagePath = ''
				let projectRelativePath: string | undefined
				if (persisted?.url) {
					localImageUrl = String(persisted.url)
					localImagePath = String(persisted.absolutePath || '').trim()
					projectRelativePath = String(persisted.projectRelativePath || '').trim() || undefined
				}

				let localThumbUrl = thumbnailUrl
				if (thumbnailUrl && thumbnailUrl !== primaryImageUrl) {
					try {
						const thumbExt = options.fileExtensionFromUrl(thumbnailUrl, 'png')
						const thumbName = `tripo3d_image_${taskId || Date.now()}_preview.${thumbExt}`
						const persistedThumb = await options.persistExternalAssetToProject({
							kind: 'image',
							name: thumbName,
							sourceUrl: thumbnailUrl
						})
						if (persistedThumb?.url) {
							localThumbUrl = String(persistedThumb.url)
						}
					} catch {
					}
				} else {
					localThumbUrl = localImageUrl
				}

				const resourceId = `tripo3d-image-${taskId || Date.now()}-${Date.now()}`
				const resourceName = `Tripo3D_Image_${mode}_${taskId.slice(-8) || Date.now()}`

				const resourceBase = {
					id: resourceId,
					kind: 'image',
					name: resourceName,
					url: localImageUrl,
					sourcePath: localImagePath || undefined,
					projectRelativePath,
					thumbnailUrl: localThumbUrl || undefined,
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

				return {
					ok: true,
					assetUrl: localImageUrl,
					assetPath: localImagePath || undefined,
					projectRelativePath,
					resourceId,
					thumbnailUrl: localThumbUrl || undefined
				}
			} catch (e: unknown) {
				console.error('[Tripo3D Runtime] 图片产物持久化失败:', e)
				return {
					ok: false,
					error: e instanceof Error ? e.message : String(e)
				}
			}
		}

		if (!modelUrl) {
			return { ok: false, error: 'modelUrl is required' }
		}

		try {
			const fileName = `tripo3d_${taskId || Date.now()}.glb`
			const persisted = await options.persistExternalAssetToProject({
				kind: 'file',
				name: fileName,
				sourceUrl: modelUrl,
				onProgress: payload.onProgress
			})

			let localAssetUrl = modelUrl
			let localAssetPath = ''
			let projectRelativePath: string | undefined
			if (persisted?.url) {
				localAssetUrl = String(persisted.url)
				localAssetPath = String(persisted.absolutePath || '').trim()
				projectRelativePath = String(persisted.projectRelativePath || '').trim() || undefined
			}

			let localThumbUrl = thumbnailUrl
			if (thumbnailUrl) {
				try {
					const thumbName = `tripo3d_${taskId || Date.now()}_preview.png`
					const persistedThumb = await options.persistExternalAssetToProject({
						kind: 'image',
						name: thumbName,
						sourceUrl: thumbnailUrl
					})
					if (persistedThumb?.url) {
						localThumbUrl = String(persistedThumb.url)
					}
				} catch {
				}
			}

			const resourceId = `tripo3d-model-${taskId || Date.now()}-${Date.now()}`
			const resourceName = `Tripo3D_${mode}_${taskId.slice(-8) || Date.now()}`

			const resourceBase = {
				id: resourceId,
				kind: 'model3d',
				name: resourceName,
				url: localAssetUrl,
				sourcePath: localAssetPath || undefined,
				projectRelativePath,
				posterUrl: localThumbUrl || undefined,
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

			return {
				ok: true,
				assetUrl: localAssetUrl,
				assetPath: localAssetPath || undefined,
				projectRelativePath,
				resourceId,
				thumbnailUrl: localThumbUrl || undefined
			}
		} catch (e: unknown) {
			console.error('[Tripo3D Runtime] 产物持久化失败:', e)
			return {
				ok: false,
				error: e instanceof Error ? e.message : String(e)
			}
		}
	}

	const applyTripo3DTaskResult = async (nodeId: string, taskRaw: unknown) => {
		const task = extractTripo3DTaskResultFields(taskRaw)
		const normalized = options.normalizeTripo3DTaskStatus(task.status)
		const node = getNodeFromStore(nodeId)
		if (!node) return normalized

		const existingSettings = getTripo3DSettings(node)
		const modelUrl = task.modelUrl
		const thumbnailUrl = task.thumbnailUrl
		const statusText = task.statusText
		const errorMessage = task.errorMessage
		const imageUrls = task.imageUrls
		const rawProgress = task.progress
		const finalProgress = normalized === 'succeeded' ? 100 : Math.max(0, Math.min(100, rawProgress))

		const isImageMode = isTripo3DImageMode(task.mode)
		const isImageNode = node.type === 'image'

		const primaryImageUrl = (isImageMode && imageUrls.length > 0) ? imageUrls[0] : undefined

		const patch: Record<string, unknown> = {
			tripo3dTaskId: task.taskId,
			tripo3dTaskFamily: task.mode || undefined,
			tripo3dTaskMode: task.mode || undefined,
			tripo3dRelationKind: String(existingSettings.tripo3dRelationKind ?? (isImageMode ? 'image' : 'model')).trim() || (isImageMode ? 'image' : 'model'),
			tripo3dRootTaskId: String(existingSettings.tripo3dRootTaskId ?? task.taskId ?? '').trim() || undefined,
			tripo3dParentTaskId: String(existingSettings.tripo3dParentTaskId ?? '').trim() || undefined,
			tripo3dTaskStatus: normalized,
			tripo3dProgress: finalProgress,
			tripo3dStatusText: statusText,
			tripo3dThumbnailUrl: thumbnailUrl || primaryImageUrl || undefined,
			tripo3dModelUrl: isImageMode ? (primaryImageUrl || modelUrl || undefined) : modelUrl || undefined,
			tripo3dOutputImageUrl: isImageMode ? (primaryImageUrl || undefined) : undefined,
			tripo3dOutputImages: isImageMode && imageUrls.length > 0 ? imageUrls : undefined,
			tripo3dErrorMessage: errorMessage,
			tripo3dOutputSummary: {
				outputKind: isImageMode ? 'image' : '3d-model',
				preferredUrl: isImageMode ? (primaryImageUrl || thumbnailUrl) : modelUrl || undefined,
				thumbnailUrl: thumbnailUrl || primaryImageUrl || undefined,
				format: isImageMode ? 'png' : 'glb',
				assetUrl: isImageMode ? (primaryImageUrl || undefined) : modelUrl || undefined,
				imageUrls: isImageMode ? imageUrls : undefined
			},
			tripo3dRelationSummary: {
				...(isRecord(existingSettings.tripo3dRelationSummary) ? existingSettings.tripo3dRelationSummary as Record<string, unknown> : {}),
				relationKind: String(existingSettings.tripo3dRelationKind ?? (isImageMode ? 'image' : 'model')).trim() || (isImageMode ? 'image' : 'model'),
				rootTaskId: String(existingSettings.tripo3dRootTaskId ?? task.taskId ?? '').trim() || undefined,
				parentTaskId: String(existingSettings.tripo3dParentTaskId ?? '').trim() || undefined,
				effectiveTaskId: task.taskId || undefined,
				effectiveRelationKind: String(existingSettings.tripo3dRelationKind ?? (isImageMode ? 'image' : 'model')).trim() || (isImageMode ? 'image' : 'model'),
				effectiveStatus: normalized,
				effectiveProgress: task.progress,
				effectiveModelUrl: isImageMode ? (primaryImageUrl || modelUrl || undefined) : modelUrl || undefined,
				effectiveLocalAssetUrl: String(existingSettings.tripo3dOutputAssetUrl ?? '').trim() || undefined,
				effectiveLocalAssetPath: String(existingSettings.tripo3dOutputAssetPath ?? '').trim() || undefined,
				effectiveThumbnailUrl: thumbnailUrl || primaryImageUrl || undefined
			}
		}

		const artifactUrl = isImageMode ? (primaryImageUrl || modelUrl) : modelUrl
		if (normalized === 'succeeded' && artifactUrl) {
			commitTripo3DDownloadProgress(nodeId, node, {
				stage: 'downloading',
				progress: 0,
				loaded: 0,
				total: 0,
				speed: 0,
				error: ''
			})
			try {
				const persisted = await persistTripo3DArtifactsToProject({
					taskId: task.taskId,
					mode: task.mode,
					modelUrl: artifactUrl,
					imageUrls: isImageMode ? imageUrls : undefined,
					thumbnailUrl: thumbnailUrl || primaryImageUrl,
					onProgress: (info) => {
						commitTripo3DDownloadProgress(nodeId, node, {
							stage: 'downloading',
							progress: info.percentage,
							loaded: info.loaded,
							total: info.total,
							speed: info.speed
						})
					}
				})

				if (persisted.ok && persisted.assetUrl) {
					patch.tripo3dOutputAssetUrl = persisted.assetUrl
					patch.tripo3dOutputAssetPath = persisted.assetPath
					patch.tripo3dThumbnailUrl = persisted.thumbnailUrl || thumbnailUrl || primaryImageUrl || undefined

					patch.tripo3dOutputSummary = {
						...(isRecord(patch.tripo3dOutputSummary) ? patch.tripo3dOutputSummary as Record<string, unknown> : {}),
						outputKind: isImageMode ? 'image' : '3d-model',
						preferredUrl: persisted.assetUrl,
						assetUrl: persisted.assetUrl,
						assetPath: persisted.assetPath,
						thumbnailUrl: patch.tripo3dThumbnailUrl,
						format: isImageMode ? 'png' : 'glb',
						imageUrls: isImageMode ? imageUrls : undefined
					}
					patch.tripo3dRelationSummary = {
						...(isRecord(patch.tripo3dRelationSummary) ? patch.tripo3dRelationSummary as Record<string, unknown> : {}),
						effectiveLocalAssetUrl: persisted.assetUrl,
						effectiveLocalAssetPath: persisted.assetPath,
						effectiveThumbnailUrl: patch.tripo3dThumbnailUrl,
						effectiveModelUrl: persisted.assetUrl
					}

					if (isImageNode && persisted.resourceId) {
						options.store.commit('setNodeResource', { nodeId, resourceId: persisted.resourceId })
					} else if (!isImageNode && node.type === 'model3d' && persisted.resourceId) {
						options.store.commit('setNodeResource', { nodeId, resourceId: persisted.resourceId })
					}

					if (isImageNode) {
						patch.imageUrl = persisted.assetUrl
						patch.thumbnailUrl = persisted.thumbnailUrl || thumbnailUrl || primaryImageUrl || undefined
					} else if (node.type === 'model3d') {
						const fileName = `tripo3d_${task.taskId || nodeId}.glb`
						patch.modelUrl = persisted.assetUrl
						patch.modelFormat = 'glb'
						patch.modelSourceName = fileName
						patch.modelSourcePath = persisted.assetPath || undefined
						patch.modelProjectRelativePath = persisted.projectRelativePath || undefined
						patch.modelAssetUrl = persisted.assetUrl
						patch.modelAssetPath = persisted.assetPath || undefined
						patch.modelAssetProjectRelativePath = persisted.projectRelativePath || undefined
						patch.lastInputSignature = `tripo3d:${String(task.taskId || nodeId)}:${artifactUrl}`
						patch.lastInputNodeId = nodeId
						patch.lastInputSourceUrl = artifactUrl
						patch.lastInputSourcePath = persisted.assetPath || undefined
						patch.lastInputSourceName = fileName
					}
				} else {
					patch.tripo3dOutputAssetUrl = artifactUrl
					patch.tripo3dOutputSummary = {
						...(isRecord(patch.tripo3dOutputSummary) ? patch.tripo3dOutputSummary as Record<string, unknown> : {}),
						outputKind: isImageMode ? 'image' : '3d-model',
						preferredUrl: artifactUrl,
						assetUrl: artifactUrl,
						thumbnailUrl: patch.tripo3dThumbnailUrl || undefined,
						format: isImageMode ? 'png' : 'glb',
						imageUrls: isImageMode ? imageUrls : undefined
					}
					patch.tripo3dRelationSummary = {
						...(isRecord(patch.tripo3dRelationSummary) ? patch.tripo3dRelationSummary as Record<string, unknown> : {}),
						effectiveLocalAssetUrl: artifactUrl,
						effectiveThumbnailUrl: patch.tripo3dThumbnailUrl || undefined,
						effectiveModelUrl: artifactUrl
					}

					if (isImageNode) {
						patch.imageUrl = artifactUrl
					} else if (node.type === 'model3d') {
						const fileName = `tripo3d_${task.taskId || nodeId}.glb`
						patch.modelUrl = artifactUrl
						patch.modelFormat = 'glb'
						patch.modelSourceName = fileName
						patch.lastInputSignature = `tripo3d:${String(task.taskId || nodeId)}:${artifactUrl}`
						patch.lastInputNodeId = nodeId
						patch.lastInputSourceUrl = artifactUrl
						patch.lastInputSourceName = fileName
					}
				}
				commitTripo3DDownloadProgress(nodeId, node, { stage: 'done', progress: 100 })
			} catch (e: unknown) {
				const errMsg = e instanceof Error ? e.message : String(e)
				console.error('[Tripo3D Runtime] 产物下载/绑定失败，状态仍标记为成功:', e)
				commitTripo3DDownloadProgress(nodeId, node, { stage: 'failed', error: errMsg })
				if (!patch.tripo3dOutputAssetUrl) {
					patch.tripo3dOutputAssetUrl = artifactUrl
					patch.tripo3dOutputSummary = {
						...(isRecord(patch.tripo3dOutputSummary) ? patch.tripo3dOutputSummary as Record<string, unknown> : {}),
						outputKind: isImageMode ? 'image' : '3d-model',
						preferredUrl: artifactUrl,
						assetUrl: artifactUrl,
						thumbnailUrl: patch.tripo3dThumbnailUrl || undefined,
						format: isImageMode ? 'png' : 'glb',
						imageUrls: isImageMode ? imageUrls : undefined
					}
					patch.tripo3dRelationSummary = {
						...(isRecord(patch.tripo3dRelationSummary) ? patch.tripo3dRelationSummary as Record<string, unknown> : {}),
						effectiveLocalAssetUrl: artifactUrl,
						effectiveThumbnailUrl: patch.tripo3dThumbnailUrl || undefined,
						effectiveModelUrl: artifactUrl
					}
					if (isImageNode) {
						patch.imageUrl = artifactUrl
					}
				}
			}
		}

		const targetNode = getNodeFromStore(nodeId)
		if (targetNode?.type === 'model3d') {
			const existingM3d = isRecord(targetNode.model3dSettings) ? targetNode.model3dSettings as Record<string, unknown> : {}
			const existingTripo = isRecord(existingM3d.tripo3dModelSettings) ? existingM3d.tripo3dModelSettings as Record<string, unknown> : {}
			options.store.commit('setNodeModel3DSettings', {
				nodeId,
				model3dSettings: {
					modelGenerationSource: 'tripo3d',
					...Object.fromEntries(
						Object.entries(patch).filter(([key]) => !key.startsWith('tripo3d'))
					),
					tripo3dModelSettings: {
						...existingTripo,
						...Object.fromEntries(
							Object.entries(patch).filter(([key]) => key.startsWith('tripo3d'))
						)
					}
				}
			})
		} else if (targetNode?.type === 'image') {
			const tripo3dImagePatch: Record<string, unknown> = {}
			const nonTripo3dPatch: Record<string, unknown> = {}
			for (const [key, value] of Object.entries(patch)) {
				if (key.startsWith('tripo3d')) {
					const newKey = key.replace(/^tripo3d/, '')
					tripo3dImagePatch[newKey.charAt(0).toLowerCase() + newKey.slice(1)] = value
				} else {
					nonTripo3dPatch[key] = value
				}
			}
			tripo3dImagePatch.taskId = patch.tripo3dTaskId
			tripo3dImagePatch.taskStatus = patch.tripo3dTaskStatus
			tripo3dImagePatch.statusText = patch.tripo3dStatusText
			tripo3dImagePatch.errorMessage = patch.tripo3dErrorMessage
			tripo3dImagePatch.progress = patch.tripo3dProgress
			tripo3dImagePatch.taskFamily = patch.tripo3dTaskFamily ?? task.mode
			tripo3dImagePatch.taskMode = patch.tripo3dTaskMode
			tripo3dImagePatch.outputImageUrl = patch.tripo3dOutputImageUrl
			tripo3dImagePatch.outputImages = patch.tripo3dOutputImages
			tripo3dImagePatch.thumbnailUrl = patch.tripo3dThumbnailUrl
			options.store.commit('setNodeImageSettings', {
				nodeId,
				imageSettings: {
					...nonTripo3dPatch,
					tripo3dImageSettings: tripo3dImagePatch
				}
			})
		} else {
			options.store.commit('setNodeTripo3DSettings', { nodeId, tripo3dSettings: patch })
		}
		if (options.shouldRefreshTripo3DTaskItems()) {
			try {
				void options.refreshTripo3DTaskItems({ silent: true })
			} catch (e: unknown) {
				console.warn('[Tripo3D Runtime] 刷新任务列表失败:', e)
			}
		}
		if (normalized === 'succeeded') {
			try {
				if (modelUrl && !isImageNode) {
					await options.syncConnectedModel3DTargets(nodeId)
				}
			} catch (e: unknown) {
				console.warn('[Tripo3D Runtime] 同步下游节点失败，不影响任务状态:', e)
			}
		}
		return normalized
	}

	const getNodeTripo3DTaskStatus = (node: WorkflowNodeLike | null): string => {
	if (!node) return 'idle'
	if (node.type === 'model3d') {
		const m3dSettings = isRecord(node.model3dSettings) ? node.model3dSettings : {}
		const tripo3dM3d = isRecord(m3dSettings.tripo3dModelSettings)
			? m3dSettings.tripo3dModelSettings as Record<string, unknown>
			: {}
		return String(tripo3dM3d.tripo3dTaskStatus ?? 'idle').trim()
	}
	if (node.type === 'image') {
		const imgSettings = isRecord(node.imageSettings) ? node.imageSettings : {}
		const tripo3dImg = isRecord(imgSettings.tripo3dImageSettings)
			? imgSettings.tripo3dImageSettings as Record<string, unknown>
			: {}
		return String(tripo3dImg.taskStatus ?? tripo3dImg.tripo3dTaskStatus ?? 'idle').trim()
	}
	const tripo3dSettings = isRecord(node.tripo3dSettings) ? node.tripo3dSettings : {}
	return String(tripo3dSettings.tripo3dTaskStatus ?? 'idle').trim()
}

const commitTripo3DTaskFailed = (nid: string, node: WorkflowNodeLike | null, msg: string) => {
	const patch: Record<string, unknown> = {
		tripo3dTaskStatus: 'failed',
		tripo3dStatusText: msg,
		tripo3dErrorMessage: ''
	}
	if (node?.type === 'model3d') {
		options.store.commit('setNodeModel3DSettings', {
			nodeId: nid,
			model3dSettings: { tripo3dModelSettings: patch }
		})
	} else if (node?.type === 'image') {
		const imgPatch: Record<string, unknown> = {}
		for (const [key, value] of Object.entries(patch)) {
			if (key.startsWith('tripo3d')) {
				const newKey = key.replace(/^tripo3d/, '')
				imgPatch[newKey.charAt(0).toLowerCase() + newKey.slice(1)] = value
			}
		}
		imgPatch.taskStatus = 'failed'
		imgPatch.statusText = msg
		imgPatch.errorMessage = ''
		options.store.commit('setNodeImageSettings', {
			nodeId: nid,
			imageSettings: {
				tripo3dImageSettings: imgPatch
			}
		})
	} else {
		options.store.commit('setNodeTripo3DSettings', {
			nodeId: nid,
			tripo3dSettings: { tripo3dTaskStatus: 'failed', tripo3dStatusText: msg, tripo3dErrorMessage: '' }
		})
	}
}

const getNodeTripo3DTaskId = (node: WorkflowNodeLike | null): string => {
	if (!node) return ''
	if (node.type === 'model3d') {
		const m3dSettings = isRecord(node.model3dSettings) ? node.model3dSettings : {}
		const tripo3dM3d = isRecord(m3dSettings.tripo3dModelSettings)
			? m3dSettings.tripo3dModelSettings as Record<string, unknown>
			: {}
		return String(tripo3dM3d.tripo3dTaskId ?? '').trim()
	}
	if (node.type === 'image') {
		const imgSettings = isRecord(node.imageSettings) ? node.imageSettings : {}
		const tripo3dImg = isRecord(imgSettings.tripo3dImageSettings)
			? imgSettings.tripo3dImageSettings as Record<string, unknown>
			: {}
		return String(tripo3dImg.taskId ?? tripo3dImg.tripo3dTaskId ?? '').trim()
	}
	const tripo3dSettings = isRecord(node.tripo3dSettings) ? node.tripo3dSettings : {}
	return String(tripo3dSettings.tripo3dTaskId ?? '').trim()
}

const getNodeTripo3DTaskFamily = (node: WorkflowNodeLike | null): string => {
	if (!node) return ''
	if (node.type === 'model3d') {
		const m3dSettings = isRecord(node.model3dSettings) ? node.model3dSettings : {}
		const tripo3dM3d = isRecord(m3dSettings.tripo3dModelSettings)
			? m3dSettings.tripo3dModelSettings as Record<string, unknown>
			: {}
		return String(tripo3dM3d.tripo3dTaskFamily ?? 'text_to_model').trim()
	}
	if (node.type === 'image') {
		const imgSettings = isRecord(node.imageSettings) ? node.imageSettings : {}
		const tripo3dImg = isRecord(imgSettings.tripo3dImageSettings)
			? imgSettings.tripo3dImageSettings as Record<string, unknown>
			: {}
		return String(tripo3dImg.taskFamily ?? tripo3dImg.tripo3dTaskFamily ?? 'text_to_image').trim()
	}
	const tripo3dSettings = isRecord(node.tripo3dSettings) ? node.tripo3dSettings : {}
	return String(tripo3dSettings.tripo3dTaskFamily ?? '').trim()
}

	const startTripo3DPoll = (nodeId: string, taskId: string) => {
		stopTripo3DPoll(nodeId)
		tripo3dTerminalNotified.delete(nodeId)
		tripo3dPollErrorCounts.delete(nodeId)

		const tick = async () => {
			const currentNode = getNodeFromStore(nodeId)
			if (!currentNode) {
				stopTripo3DPoll(nodeId)
				return
			}
			const currentStatus = getNodeTripo3DTaskStatus(currentNode)
			if (
				currentStatus === 'succeeded' ||
				currentStatus === 'success' ||
				currentStatus === 'failed' ||
				currentStatus === 'cancelled' ||
				currentStatus === 'canceled'
			) {
				stopTripo3DPoll(nodeId)
				return
			}

			try {
				const res = await options.getComfyService().tripo3dTask(taskId)
				if (!res.ok) {
					const nextCount = Number(tripo3dPollErrorCounts.get(nodeId) ?? 0) + 1
					tripo3dPollErrorCounts.set(nodeId, nextCount)
					if (nextCount >= 4) {
						stopTripo3DPoll(nodeId)
						commitTripo3DTaskFailed(nodeId, currentNode, t('tasks.tripo3d.pollStatusFailedConsecutive'))
						options.pushToast(t('tasks.tripo3d.pollStatusFailedConsecutiveToast'), 'warn')
					}
					return
				}

				tripo3dPollErrorCounts.delete(nodeId)
				const finalStatus = await applyTripo3DTaskResult(nodeId, res)
				if (finalStatus === 'succeeded' || finalStatus === 'success' || finalStatus === 'failed' || finalStatus === 'cancelled' || finalStatus === 'canceled') {
					if (!tripo3dTerminalNotified.has(nodeId)) {
						tripo3dTerminalNotified.add(nodeId)
						const isImageNode = currentNode?.type === 'image'
						if (finalStatus === 'succeeded' || finalStatus === 'success') {
							options.pushToast(
								isImageNode
									? t('tasks.tripo3d.imageTaskCompleted')
									: t('tasks.tripo3d.model3dTaskCompleted'),
								'info'
							)
						} else if (finalStatus === 'failed') {
							options.pushToast(
								isImageNode
									? t('tasks.tripo3d.imageTaskFailed')
									: t('tasks.tripo3d.model3dTaskFailed'),
								'warn'
							)
						} else {
							options.pushToast(t('tasks.tripo3d.taskCanceled'), 'warn')
						}
					}
					stopTripo3DPoll(nodeId)
				}
			} catch (err: unknown) {
				const nextCount = Number(tripo3dPollErrorCounts.get(nodeId) ?? 0) + 1
				tripo3dPollErrorCounts.set(nodeId, nextCount)
				if (nextCount >= 4) {
					stopTripo3DPoll(nodeId)
					const currentNodeForFail = getNodeFromStore(nodeId)
					commitTripo3DTaskFailed(nodeId, currentNodeForFail, t('tasks.tripo3d.pollStatusException'))
					options.pushToast(t('tasks.tripo3d.pollStatusExceptionToast'), 'warn')
				}
			}
		}

		void tick()
		const timer = window.setInterval(() => void tick(), 2000)
		tripo3dPollTimers.set(nodeId, timer)
	}

	const recoverTripo3DTaskStates = async (opts?: { silent?: boolean }) => {
		const tripo3dNodes: WorkflowNodeLike[] = []
		for (const id of options.store.state.nodeOrder) {
			const n = options.store.state.nodesById[id] as WorkflowNodeLike | undefined
			if (n && (n.type === 'model3d' || n.type === 'image')) {
				const status = getNodeTripo3DTaskStatus(n)
				if (status === 'pending' || status === 'running' || status === 'queued') {
					tripo3dNodes.push(n)
				}
			}
		}

		for (const node of tripo3dNodes) {
			const nodeId = node.id as string
			const taskId = getNodeTripo3DTaskId(node)
			if (!taskId) {
				commitTripo3DTaskFailed(nodeId, node, t('tasks.tripo3d.taskIdLostCannotRecover'))
				continue
			}

			try {
				const res = await options.getComfyService().tripo3dTask(taskId)
				if (!res.ok) {
					if (!opts?.silent) {
						options.pushToast(t('aiworkflow.toast.tripo3dQueryFailed', { name: node.alias || node.title || nodeId }), 'warn')
					}
					continue
				}

				const finalStatus = await applyTripo3DTaskResult(nodeId, res)
				if (finalStatus === 'pending' || finalStatus === 'running' || finalStatus === 'queued') {
					startTripo3DPoll(nodeId, taskId)
				}
			} catch {
				if (!opts?.silent) {
					options.pushToast(t('aiworkflow.toast.tripo3dResumeFailed', { name: node.alias || node.title || nodeId }), 'warn')
				}
			}
		}
	}

	const clearTripo3DRuntime = () => {
		for (const timer of tripo3dPollTimers.values()) window.clearInterval(timer)
		tripo3dPollTimers.clear()
		tripo3dPollErrorCounts.clear()
		tripo3dTerminalNotified.clear()
	}

	return {
		stopTripo3DPoll,
		applyTripo3DTaskResult,
		persistTripo3DArtifactsToProject,
		startTripo3DPoll,
		recoverTripo3DTaskStates,
		clearTripo3DRuntime
	}
}
