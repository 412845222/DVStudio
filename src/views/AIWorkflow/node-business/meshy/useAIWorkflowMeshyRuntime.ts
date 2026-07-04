import { isRecord, isString } from '../../../../types/utils'
import type {
	MeshyComfyService,
	MeshyStoreLike,
	PersistExternalAssetPayload,
	PersistExternalAssetResult
} from './types'
import { extractMeshyTaskResultFields } from './types'

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
		const preferredModelUrl =
			task.preferredModelUrl || options.pickMeshyPreferredModelUrl(modelUrls)
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
								console.log('[Meshy Runtime] 资源已存在，跳过添加:', resourceId)
							} else {
								options.store.commit('addResource', resourceBase)
								console.log('[Meshy Runtime] 资源已添加:', resourceBase)
							}

							const currentNode = getNodeFromStore(nodeId)
							const currentNodeResourceId = currentNode?.resourceId
							console.log(
								'[Meshy Runtime] 节点当前resourceId:',
								currentNodeResourceId,
								'新resourceId:',
								resourceId
							)

							options.store.commit('setNodeResource', { nodeId, resourceId })

							const updatedNode = getNodeFromStore(nodeId)
							console.log('[Meshy Runtime] 绑定后节点resourceId:', updatedNode?.resourceId)
							console.log('[Meshy Runtime] 图片资源已绑定到节点:', { nodeId, resourceId, assetUrl })
						}
					}
				} else if (preferredModelUrl) {
					const fileName = `meshy_${task.taskId || nodeId}.${format}`
					const persisted = await options.persistExternalAssetToProject({
						kind: 'file',
						name: fileName,
						sourceUrl: preferredModelUrl,
						sourcePath: task.sourceModelUrl || undefined
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
							projectRelativePath: String(persisted.projectRelativePath || '').trim() || undefined,
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
				}
			} catch (e: unknown) {
				console.error('[Meshy Runtime] 产物下载/绑定失败，状态仍标记为成功:', e)
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
				taskFamily: String(task.mode ?? '').includes('image') ? 'text-to-image' : 'text-to-3d',
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
					imageCount: Number(existingMeshy.imageCount ?? 0),
					imageUrls: Array.isArray(existingMeshy.imageUrls) ? existingMeshy.imageUrls : [],
					prompt: String(existingMeshy.prompt ?? '')
				}
			}

			if (normalized === 'succeeded' && patch.meshyOutputAssetUrl) {
				const newAssetUrl = String(patch.meshyOutputAssetUrl)
				const newIsRemote = isMeshyRemoteUrl(newAssetUrl)
				const existingModelUrl = String(existingModel3d.modelUrl ?? '').trim()
				const existingModelAssetUrl = String(existingModel3d.modelAssetUrl ?? '').trim()
				const existingLocalUrl = !isMeshyRemoteUrl(existingModelAssetUrl)
					? existingModelAssetUrl
					: !isMeshyRemoteUrl(existingModelUrl)
					? existingModelUrl
					: ''

				if (!newIsRemote || !existingLocalUrl) {
					model3dPatch.modelUrl = newAssetUrl
					model3dPatch.modelAssetUrl = newAssetUrl
					model3dPatch.modelAssetPath = patch.meshyOutputAssetPath
					model3dPatch.modelFormat =
						isRecord(patch.meshyOutputSummary) && isString(patch.meshyOutputSummary.format)
							? patch.meshyOutputSummary.format
							: format
					model3dPatch.modelGenerationSource = 'meshy'
				}
			}

			options.store.commit('setNodeModel3DSettings', { nodeId, model3dSettings: model3dPatch })
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

	const startMeshyPoll = (nodeId: string, taskId: string, mode: string) => {
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
						commitMeshyTaskFailed(nodeId, currentNode, 'Meshy 状态连续获取失败')
						options.pushToast('Meshy 状态连续获取失败，请稍后重试。', 'warn')
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
								finalTarget === 'image' ? 'Meshy 图片任务完成。' : 'Meshy 3D 模型生成完成。',
								'info'
							)
						} else if (finalStatus === 'failed') {
							options.pushToast(
								finalTarget === 'image' ? 'Meshy 图片任务失败。' : 'Meshy 3D 模型生成失败。',
								'warn'
							)
						} else {
							options.pushToast('Meshy 任务已取消。', 'warn')
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
					commitMeshyTaskFailed(nodeId, currentNodeForFail, 'Meshy 状态获取异常')
					options.pushToast('Meshy 状态获取异常，已停止轮询。', 'warn')
				}
			}
		}

		void tick()
		const timer = window.setInterval(() => void tick(), 1600)
		meshyPollTimers.set(nodeId, timer)
	}

	const recoverMeshyTaskStates = async (opts?: { silent?: boolean }) => {
		const meshyNodes: WorkflowNodeLike[] = []
		for (const id of options.store.state.nodeOrder) {
			const n = options.store.state.nodesById[id] as WorkflowNodeLike | undefined
			if (n && (n.type === 'image' || n.type === 'model3d')) {
				const status = getNodeMeshyTaskStatus(n)
				if (status === 'pending' || status === 'running' || status === 'queued' || status === 'in_progress') {
					meshyNodes.push(n)
				}
			}
		}

		for (const node of meshyNodes) {
			const nodeId = node.id as string
			const taskId = getNodeMeshyTaskId(node)
			const taskFamily = getNodeMeshyTaskFamily(node)
			if (!taskId) {
				commitMeshyTaskFailed(nodeId, node, '任务ID丢失，无法恢复')
				continue
			}

			try {
				const res = await options.getComfyService().meshyTask(taskId, taskFamily)
				if (!res.ok) {
					if (!opts?.silent) {
						options.pushToast(`节点「${node.alias || node.title || nodeId}」Meshy任务查询失败`, 'warn')
					}
					continue
				}

				const finalStatus = await applyMeshyTaskResult(nodeId, res)
				if (finalStatus === 'pending' || finalStatus === 'running' || finalStatus === 'queued' || finalStatus === 'in_progress') {
					startMeshyPoll(nodeId, taskId, taskFamily)
				}
			} catch {
				if (!opts?.silent) {
					options.pushToast(`节点「${node.alias || node.title || nodeId}」Meshy任务恢复失败`, 'warn')
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
