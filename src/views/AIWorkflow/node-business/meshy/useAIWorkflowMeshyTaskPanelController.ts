import { computed, ref } from 'vue'
import type { WorkflowNode } from '../../../../aiworkflow/types'
import type {
	MeshyTaskPanelAction,
	MeshyTaskPanelDetail,
	MeshyTaskPanelItem
} from '../../../../ui/WorkFlow/MeshyTaskPanel.vue'
import { getErrorMessage, isRecord } from '../../../../types/utils'
import { t } from '../../../../i18n'
import type {
	MeshyBalanceResponse,
	MeshyComfyService,
	MeshyEffectiveOutput,
	MeshyStoreLike,
	MeshyTaskActionResponse,
	MeshyTaskDetailResponse,
	MeshyTaskResponse,
	MeshyTasksListResponse,
	MeshyTaskStatus
} from './types'
import { useAIWorkflowMeshyTaskPanelMapping } from './useAIWorkflowMeshyTaskPanelMapping'

type MeshyNodeSettingsLike = Record<string, unknown>

export const useAIWorkflowMeshyTaskPanelController = (options: {
	store: MeshyStoreLike
	renderNodes: { value: WorkflowNode[] }
	comfyService: MeshyComfyService
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	getMeshyDisplayThumbnailUrl: (settings: Record<string, unknown> | null | undefined) => string
	pickMeshyEffectiveOutput: (item: Record<string, unknown>) => MeshyEffectiveOutput
	applyMeshyTaskResult: (nodeId: string, task: unknown) => Promise<string>
	stopMeshyPoll: (nodeId: string) => void
	createImageNodeAtCenter?: (url: string, name?: string) => string | null
	createModel3DNodeAtCenter?: (url: string, name?: string, format?: string) => string | null
}) => {
	const meshyTaskDialogOpen = ref(false)
	const meshyTaskRemoteItems = ref<MeshyTaskPanelItem[]>([])
	const meshyTaskRemoteLoaded = ref(false)
	const meshyTaskRemoteLoading = ref(false)
	const meshyTaskRemoteFallbackReason = ref('')
	const meshyTaskDetail = ref<MeshyTaskPanelDetail | null>(null)
	const meshyTaskDetailTaskId = ref('')
	const meshyTaskDetailLoading = ref(false)
	const meshyTaskActionBusyTaskId = ref('')
	const meshyTaskActionBusyType = ref<MeshyTaskPanelAction | ''>('')
	const meshyBalanceText = ref(t('tasks.meshy.balanceLoading'))
	const meshyBalanceDetail = ref(t('tasks.meshy.balanceLoadingDetail'))
	const meshyBalanceTone = ref<'muted' | 'warn' | 'ok'>('muted')

	const {
		familyLabelForMeshy,
		statusLabelForMeshy,
		mapMeshyPanelItemToDetail,
		mapMeshyMirrorItemToDetail,
		mapMeshyRemoteTaskToPanelItem,
		findMeshyTaskPanelItemById
	} = useAIWorkflowMeshyTaskPanelMapping({
		getMeshyDisplayThumbnailUrl: options.getMeshyDisplayThumbnailUrl,
		pickMeshyEffectiveOutput: options.pickMeshyEffectiveOutput,
		isRemoteLoaded: () => meshyTaskRemoteLoaded.value
	})

	const refreshMeshyTaskItems = async (opts?: { silent?: boolean }) => {
		if (meshyTaskRemoteLoading.value) return
		meshyTaskRemoteLoading.value = true
		try {
			const res: MeshyTasksListResponse = await options.comfyService.meshyTasks({ limit: 120 })
			if (!res.ok) {
				meshyTaskRemoteFallbackReason.value = String(res.error || 'unknown')
				if (!opts?.silent)
					options.pushToast(t('tasks.meshy.taskCenterLoadFailed', { error: String(res.error || 'unknown') }), 'warn')
				return
			}
			meshyTaskRemoteItems.value = Array.isArray(res.items)
				? res.items.map((item) =>
						mapMeshyRemoteTaskToPanelItem(item as unknown as Record<string, unknown>)
					)
				: []
			meshyTaskRemoteLoaded.value = true
			meshyTaskRemoteFallbackReason.value = ''
		} catch (err: unknown) {
			meshyTaskRemoteFallbackReason.value = getErrorMessage(err)
			if (!opts?.silent)
				options.pushToast(t('tasks.meshy.taskCenterLoadFailed', { error: getErrorMessage(err) }), 'warn')
		} finally {
			meshyTaskRemoteLoading.value = false
		}
	}

	const refreshMeshyBalance = async (opts?: { silent?: boolean }) => {
		try {
			const res: MeshyBalanceResponse = await options.comfyService.meshyBalance()
			if (!res.ok) {
				meshyBalanceText.value = t('tasks.meshy.balanceLoadFailed')
				meshyBalanceDetail.value = String(res.error || 'unknown')
				meshyBalanceTone.value = 'warn'
				if (!opts?.silent)
					options.pushToast(t('tasks.meshy.balanceLoadFailedToast', { error: String(res.error || 'unknown') }), 'warn')
				return
			}
			meshyBalanceText.value = String(res.displayText || t('tasks.meshy.balanceUnavailable'))
			meshyBalanceDetail.value = String(res.detail || '')
			meshyBalanceTone.value = res.available ? 'ok' : res.configured ? 'muted' : 'warn'
		} catch (err: unknown) {
			meshyBalanceText.value = t('tasks.meshy.balanceLoadFailed')
			meshyBalanceDetail.value = getErrorMessage(err)
			meshyBalanceTone.value = 'warn'
			if (!opts?.silent)
				options.pushToast(t('tasks.meshy.balanceLoadFailedToast', { error: getErrorMessage(err) }), 'warn')
		}
	}

	const getMeshySettingsForNode = (node: WorkflowNode): MeshyNodeSettingsLike | undefined => {
		if (node.type === 'meshy') return isRecord(node.meshySettings) ? node.meshySettings : undefined
		if (
			node.type === 'image' &&
			isRecord(node.imageSettings) &&
			node.imageSettings.imageGenerationSource === 'meshy'
		) {
			return isRecord(node.imageSettings.meshyImageSettings)
				? node.imageSettings.meshyImageSettings
				: undefined
		}
		if (node.type === 'model3d' && isRecord(node.model3dSettings)) {
			const meshyModelSettings = node.model3dSettings.meshyModelSettings
			if (isRecord(meshyModelSettings) && meshyModelSettings.taskId) {
				return meshyModelSettings
			}
		}
		return undefined
	}

	const isMeshyNode = (node: WorkflowNode) => {
		if (node.type === 'meshy') return true
		if (
			node.type === 'image' &&
			isRecord(node.imageSettings) &&
			node.imageSettings.imageGenerationSource === 'meshy'
		)
			return true
		if (node.type === 'model3d' && isRecord(node.model3dSettings)) {
			const meshyModelSettings = node.model3dSettings.meshyModelSettings
			if (isRecord(meshyModelSettings) && meshyModelSettings.taskId) return true
		}
		return false
	}

	const localMeshyTaskItems = computed<MeshyTaskPanelItem[]>(() => {
		return options.renderNodes.value
			.filter((node) => isMeshyNode(node))
			.map((node) => {
				const settings = getMeshySettingsForNode(node) ?? {}
				const target = node.type === 'image' ? 'image' : '3d'
				const family =
					node.type === 'image'
						? String(settings.taskFamily ?? 'text-to-image').trim()
						: String(settings.taskFamily ?? 'text-to-3d').trim()
				const taskStatus = String(
					settings.taskStatus ?? 'idle'
				).trim() as MeshyTaskPanelItem['status']
				const prompt = String(settings.prompt ?? '').trim()
				const imageCount =
					node.type === 'image'
						? Number(settings.outputImageCount ?? 0)
						: Number(
								settings.imageCount ??
									(Array.isArray(settings.imageUrls) ? settings.imageUrls.length : 0)
							)
				const progress = Math.max(0, Math.min(100, Number(settings.progress ?? 0)))
				const chainLabel = target === 'image' ? t('tasks.meshy.imageChain') : t('tasks.meshy.model3dChain')
				const statusFallback = String(settings.statusText ?? settings.errorMessage ?? '').trim() || t('tasks.meshy.pendingExecution')
				return {
					id: `${node.id}:${String(settings.taskId ?? family)}`,
					nodeId: node.id,
					title: String(node.alias ?? node.title ?? t('tasks.meshy.taskNodeTitle')).trim() || t('tasks.meshy.taskNodeTitle'),
					taskId: String(settings.taskId ?? '').trim() || undefined,
					target,
					family,
					familyLabel: familyLabelForMeshy(family),
					status: taskStatus,
					statusLabel: statusLabelForMeshy(taskStatus),
					progress,
					promptPreview: prompt || t('tasks.meshy.promptNotFilled'),
					metaText: `${chainLabel} · ${t('tasks.meshy.imageInputsCount', { count: String(imageCount) })} · ${statusFallback}`,
					relationKind: String(settings.relationKind ?? 'model').trim() || 'model',
					rootTaskId: String(settings.rootTaskId ?? settings.taskId ?? '').trim() || undefined,
					parentTaskId: String(settings.parentTaskId ?? '').trim() || undefined,
					capabilities: undefined,
					thumbnailUrl: options.getMeshyDisplayThumbnailUrl(settings) || undefined,
					hasTextureChild: false,
					hasRiggingChild: false,
					hasAnimationChild: false,
					effectiveTaskId:
						String(
							(settings.outputSummary as Record<string, unknown>)?.preferredUrl ??
								settings.taskId ??
								''
						).trim() || undefined,
					effectiveRelationKind: String(settings.relationKind ?? 'model').trim() || 'model',
					effectivePreferredModelUrl:
						String(
							(settings.outputSummary as Record<string, unknown>)?.preferredUrl ?? ''
						).trim() || undefined,
					effectiveThumbnailUrl: options.getMeshyDisplayThumbnailUrl(settings) || undefined,
					children: [],
					createdAt: Number(node.createdAt ?? Date.now()),
					payload: {
						source: 'meshy-task-panel',
						nodeId: node.id,
						taskId: String(settings.taskId ?? '').trim() || undefined,
						title: String(node.title ?? '').trim() || t('tasks.meshy.taskNodeTitle'),
						alias: String(node.alias ?? '').trim() || undefined,
						meshySettings: JSON.parse(JSON.stringify(settings ?? {}))
					}
				}
			})
	})

	const meshyTaskItems = computed<MeshyTaskPanelItem[]>(() => {
		if (meshyTaskRemoteLoaded.value) return meshyTaskRemoteItems.value
		return localMeshyTaskItems.value
	})

	const meshyTaskPanelStatusText = computed(() => {
		if (meshyTaskRemoteLoading.value && !meshyTaskRemoteLoaded.value) {
			return t('tasks.meshy.syncingFromBackend')
		}
		if (meshyTaskRemoteLoaded.value) {
			return t('tasks.meshy.backendTasksDisplayed')
		}
		if (meshyTaskRemoteFallbackReason.value) {
			return t('tasks.meshy.backendLoadFailedFallback', { reason: meshyTaskRemoteFallbackReason.value })
		}
		return t('tasks.meshy.localStateDisplayed')
	})

	const openMeshyTaskDialog = () => {
		meshyTaskDialogOpen.value = true
		void refreshMeshyTaskItems({ silent: true })
		void refreshMeshyBalance({ silent: true })
	}

	const onRefreshMeshyTaskPanel = async () => {
		await Promise.all([
			refreshMeshyTaskItems({ silent: false }),
			refreshMeshyBalance({ silent: false })
		])
	}

	const closeMeshyTaskDialog = () => {
		meshyTaskDialogOpen.value = false
		meshyTaskDetail.value = null
		meshyTaskDetailTaskId.value = ''
		meshyTaskDetailLoading.value = false
		meshyTaskActionBusyTaskId.value = ''
		meshyTaskActionBusyType.value = ''
	}

	const normalizeMeshyModeForTaskAction = (raw: string) => {
		const value = String(raw ?? '').trim()
		if (value === 'text-to-image' || value === 'image-to-image') return value
		if (value === 'image-to-3d' || value === 'multi-image-to-3d') return value
		if (value === 'retexture' || value === 'remesh' || value === 'rigging' || value === 'animation')
			return value
		if (value === 'refine' || value === 'text-to-3d') return 'text-to-3d'
		return 'text-to-3d'
	}

	const findMeshyNodeIdByTaskId = (taskId: string) => {
		const targetTaskId = String(taskId ?? '').trim()
		if (!targetTaskId) return ''
		for (const node of options.renderNodes.value) {
			if (!node || !isMeshyNode(node)) continue
			const settings = getMeshySettingsForNode(node) ?? {}
			const outputSummary = isRecord(settings.outputSummary) ? settings.outputSummary : {}
			const knownIds = [
				settings.taskId,
				outputSummary.preferredUrl,
				settings.rootTaskId,
				settings.parentTaskId
			]
				.map((x) => String(x ?? '').trim())
				.filter(Boolean)
			if (knownIds.includes(targetTaskId)) return node.id
		}
		return ''
	}

	const refreshMeshyTaskToNode = async (nodeId: string, taskId: string, mode: string) => {
		const reqMode = normalizeMeshyModeForTaskAction(mode)
		const res: MeshyTaskResponse = await options.comfyService.meshyTask(taskId, reqMode)
		if (!res.ok) {
			return { ok: false as const, error: String(res.error || 'unknown') }
		}
		const finalStatus = await options.applyMeshyTaskResult(nodeId, res)
		return { ok: true as const, finalStatus }
	}

	const onNodeRefreshMeshyTask = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || !isMeshyNode(node)) return
		const settings = getMeshySettingsForNode(node) ?? {}
		const taskId = String(settings.taskId ?? '').trim()
		if (!taskId) {
			options.pushToast(t('tasks.meshy.noRefreshableTaskId'), 'warn')
			return
		}
		const mode = String(settings.taskFamily ?? 'text-to-3d')
		const refreshed = await refreshMeshyTaskToNode(nodeId, taskId, mode)
		if (!refreshed.ok) {
			options.pushToast(t('tasks.meshy.refreshStatusFailed', { error: refreshed.error }), 'warn')
			return
		}
		options.pushToast(t('tasks.meshy.statusRefreshed'), 'info')
	}

	const onNodePullMeshyOutput = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || !isMeshyNode(node)) return
		const settings = getMeshySettingsForNode(node) ?? {}
		const taskId = String(settings.taskId ?? '').trim()
		if (!taskId) {
			options.pushToast(t('tasks.meshy.noPullableTaskId'), 'warn')
			return
		}
		const mode = String(settings.taskFamily ?? 'text-to-3d')
		const refreshed = await refreshMeshyTaskToNode(nodeId, taskId, mode)
		if (!refreshed.ok) {
			options.pushToast(t('tasks.meshy.pullArtifactsFailed', { error: refreshed.error }), 'warn')
			return
		}
		if (refreshed.finalStatus !== 'succeeded') {
			options.pushToast(t('tasks.meshy.taskNotCompletedCannotPull'), 'warn')
			return
		}

		if (node.type === 'image') {
			options.pushToast(t('tasks.meshy.imageDownloadedBound'), 'info')
		} else if (node.type === 'model3d') {
			options.pushToast(t('tasks.meshy.model3dDownloadedBound'), 'info')
		} else {
			options.pushToast(t('tasks.meshy.artifactsSyncedToNode'), 'info')
		}
	}

	const onNodeStopMeshyTask = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || !isMeshyNode(node)) return
		const settings = getMeshySettingsForNode(node) ?? {}
		const taskId = String(settings.taskId ?? '').trim()
		if (!taskId) {
			options.pushToast(t('tasks.meshy.noRunningTask'), 'warn')
			return
		}
		const mode = normalizeMeshyModeForTaskAction(String(settings.taskFamily ?? 'text-to-3d'))
		const res: MeshyTaskActionResponse = await options.comfyService.meshyStop(taskId, mode)
		if (!res.ok) {
			options.pushToast(t('tasks.meshy.stopTaskFailed', { error: String(res.error || 'unknown') }), 'warn')
			return
		}
		options.stopMeshyPoll(nodeId)
		const patch = {
			taskStatus: 'canceled' as const,
			statusText: t('tasks.meshy.taskStopped'),
			errorMessage: ''
		}
		if (node.type === 'meshy') {
			options.store.commit('setNodeMeshySettings', { nodeId, meshySettings: patch })
		} else if (node.type === 'image') {
			options.store.commit('setNodeImageSettings', {
				nodeId,
				imageSettings: { meshyImageSettings: patch }
			})
		} else if (node.type === 'model3d') {
			options.store.commit('setNodeModel3DSettings', {
				nodeId,
				model3dSettings: { meshyModelSettings: patch }
			})
		}
		options.pushToast(t('tasks.meshy.taskStoppedToast'), 'info')
		if (meshyTaskDialogOpen.value || meshyTaskRemoteLoaded.value)
			void refreshMeshyTaskItems({ silent: true })
	}

	const onNodeDeleteMeshyTask = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || !isMeshyNode(node)) return
		const settings = getMeshySettingsForNode(node) ?? {}
		const taskId = String(settings.taskId ?? '').trim()
		if (!taskId) {
			options.pushToast(t('tasks.meshy.noDeletableTask'), 'warn')
			return
		}
		const mode = normalizeMeshyModeForTaskAction(String(settings.taskFamily ?? 'text-to-3d'))
		const res: MeshyTaskActionResponse = await options.comfyService.meshyDelete(taskId, mode)
		if (!res.ok) {
			options.pushToast(t('tasks.meshy.deleteTaskFailed', { error: String(res.error || 'unknown') }), 'warn')
			return
		}
		options.stopMeshyPoll(nodeId)
		const patch = {
			taskId: undefined,
			taskStatus: 'idle' as const,
			progress: 0,
			statusText: t('tasks.meshy.taskDeleted'),
			errorMessage: ''
		}
		if (node.type === 'meshy') {
			options.store.commit('setNodeMeshySettings', { nodeId, meshySettings: patch })
		} else if (node.type === 'image') {
			options.store.commit('setNodeImageSettings', {
				nodeId,
				imageSettings: { meshyImageSettings: patch }
			})
		} else if (node.type === 'model3d') {
			options.store.commit('setNodeModel3DSettings', {
				nodeId,
				model3dSettings: { meshyModelSettings: patch }
			})
		}
		options.pushToast(t('tasks.meshy.taskDeletedToast'), 'info')
		if (meshyTaskDialogOpen.value || meshyTaskRemoteLoaded.value)
			void refreshMeshyTaskItems({ silent: true })
	}

	const onMeshyTaskPanelAction = async (payload: {
		taskId: string
		mode?: string
		action: MeshyTaskPanelAction
		nodeId?: string
	}) => {
		const taskId = String(payload?.taskId ?? '').trim()
		if (!taskId) return
		const mode = normalizeMeshyModeForTaskAction(String(payload?.mode ?? 'text-to-3d'))

		// 优先使用payload中的nodeId，然后从后端远程任务列表查找lastNodeId，最后本地遍历查找
		let resolvedNodeId = String(payload?.nodeId ?? '').trim()
		if (!resolvedNodeId) {
			const remoteItem = findMeshyTaskPanelItemById(meshyTaskRemoteItems.value, `remote:${taskId}`)
			const remoteNodeId = String(remoteItem?.nodeId ?? '').trim()
			if (remoteNodeId && options.store.state.nodesById[remoteNodeId]) {
				resolvedNodeId = remoteNodeId
			}
		}
		if (!resolvedNodeId) {
			resolvedNodeId = findMeshyNodeIdByTaskId(taskId)
		}
		const nodeId = resolvedNodeId
		meshyTaskActionBusyTaskId.value = taskId
		meshyTaskActionBusyType.value = payload.action
		try {
			if (payload.action === 'refresh') {
				if (nodeId) {
					const refreshed = await refreshMeshyTaskToNode(nodeId, taskId, mode)
					if (!refreshed.ok) {
						options.pushToast(t('tasks.meshy.taskStatusRefreshFailed', { error: refreshed.error }), 'warn')
					} else {
						options.pushToast(t('tasks.meshy.taskStatusRefreshed'), 'info')
					}
				} else {
					const res: MeshyTaskResponse = await options.comfyService.meshyTask(taskId, mode)
					if (!res.ok)
						options.pushToast(t('tasks.meshy.taskStatusRefreshFailed', { error: String(res.error || 'unknown') }), 'warn')
				}
			} else if (payload.action === 'import-output') {
				let targetNodeId = nodeId
				let isNewNode = false

				if (!targetNodeId) {
					const isImageTask = mode === 'text-to-image' || mode === 'image-to-image'
					const is3DTask = !isImageTask
					if (isImageTask && typeof options.createImageNodeAtCenter === 'function') {
						try {
							const taskRes: MeshyTaskResponse = await options.comfyService.meshyTask(taskId, mode)
							if (taskRes.ok) {
								const imageUrls = (taskRes as unknown as { imageUrls?: string[] }).imageUrls || []
								const preferredUrl = String(
									(taskRes as unknown as { preferredImageUrl?: string }).preferredImageUrl || imageUrls[0] || ''
								).trim()
								const newNodeId = options.createImageNodeAtCenter(preferredUrl, t('tasks.meshy.imageTaskNodeName'))
								if (newNodeId) {
									targetNodeId = newNodeId
									isNewNode = true
									options.store.commit('setNodeImageSettings', {
										nodeId: newNodeId,
										imageSettings: {
											imageGenerationSource: 'meshy',
											meshyImageSettings: {
												taskId,
												taskStatus: 'pending',
												taskFamily: mode,
												progress: 0,
												statusText: t('tasks.meshy.pullingImageArtifacts')
											}
										}
									})
									options.pushToast(t('tasks.meshy.nodeCreatedPullingArtifacts'), 'info')
								}
							}
						} catch (e) {
							console.error('[Meshy Task Panel] 创建图片节点失败:', e)
						}
					} else if (is3DTask && typeof options.createModel3DNodeAtCenter === 'function') {
						try {
							const taskRes: MeshyTaskResponse = await options.comfyService.meshyTask(taskId, mode)
							if (taskRes.ok) {
								const modelUrls = (taskRes as unknown as { modelUrls?: Record<string, string> }).modelUrls || {}
								const preferredUrl = String(
									(taskRes as unknown as { preferredModelUrl?: string }).preferredModelUrl ||
										modelUrls.glb || modelUrls.gltf || ''
								).trim()
								const modelFormat = modelUrls.glb ? 'glb' : modelUrls.gltf ? 'gltf' : 'glb'
								const newNodeId = options.createModel3DNodeAtCenter(
									preferredUrl,
									t('tasks.meshy.model3dTaskNodeName'),
									modelFormat
								)
								if (newNodeId) {
									targetNodeId = newNodeId
									isNewNode = true
									options.store.commit('setNodeModel3DSettings', {
										nodeId: newNodeId,
										model3dSettings: {
											modelGenerationSource: 'meshy',
											meshyModelSettings: {
												taskId,
												taskStatus: 'pending',
												taskFamily: mode,
												progress: 0,
												statusText: t('tasks.meshy.pulling3dArtifacts')
											}
										}
									})
									options.pushToast(t('tasks.meshy.nodeCreatedPullingArtifacts'), 'info')
								}
							}
						} catch (e) {
							console.error('[Meshy Task Panel] 创建3D模型节点失败:', e)
						}
					}
				}

				if (!targetNodeId) {
					options.pushToast(t('tasks.meshy.noReceivingNodeFound'), 'warn')
				} else {
					const refreshed = await refreshMeshyTaskToNode(targetNodeId, taskId, mode)
					if (!refreshed.ok) {
						options.pushToast(t('tasks.meshy.pullArtifactsFailedGeneric', { error: refreshed.error }), 'warn')
					} else if (refreshed.finalStatus !== 'succeeded') {
						options.pushToast(t('tasks.meshy.taskNotCompletedCannotPull'), 'warn')
					} else {
						const node = options.store.state.nodesById[targetNodeId]
						if (node?.type === 'image') {
							options.pushToast(
								isNewNode ? t('tasks.meshy.imagePulledBoundToNewNode') : t('tasks.meshy.imageDownloadedBoundGeneric'),
								'info'
							)
						} else if (node?.type === 'model3d') {
							options.pushToast(
								isNewNode ? t('tasks.meshy.model3dPulledBoundToNewNode') : t('tasks.meshy.model3dDownloadedBoundGeneric'),
								'info'
							)
						} else {
							options.pushToast(t('tasks.meshy.artifactsSyncedToNodeGeneric'), 'info')
						}
					}
				}
			} else if (payload.action === 'stop') {
				const res: MeshyTaskActionResponse = await options.comfyService.meshyStop(taskId, mode)
				if (!res.ok) {
					options.pushToast(t('tasks.meshy.taskActionFailed', { action: t('tasks.meshy.stop'), error: String(res.error || 'unknown') }), 'warn')
				} else {
					if (nodeId) {
						options.stopMeshyPoll(nodeId)
						const node = options.store.state.nodesById[nodeId]
						const patch = {
							taskStatus: 'canceled' as const,
							statusText: t('tasks.meshy.taskStopped'),
							errorMessage: ''
						}
						if (node?.type === 'meshy') {
							options.store.commit('setNodeMeshySettings', { nodeId, meshySettings: patch })
						} else if (node?.type === 'image') {
							options.store.commit('setNodeImageSettings', {
								nodeId,
								imageSettings: { meshyImageSettings: patch }
							})
						} else if (node?.type === 'model3d') {
							options.store.commit('setNodeModel3DSettings', {
								nodeId,
								model3dSettings: { meshyModelSettings: patch }
							})
						}
					}
					options.pushToast(t('tasks.meshy.taskActionPerformed', { action: t('tasks.meshy.stop') }), 'info')
				}
			} else if (payload.action === 'delete') {
				const res: MeshyTaskActionResponse = await options.comfyService.meshyDelete(taskId, mode)
				if (!res.ok) {
					options.pushToast(t('tasks.meshy.taskActionFailed', { action: t('tasks.meshy.delete'), error: String(res.error || 'unknown') }), 'warn')
				} else {
					if (nodeId) {
						options.stopMeshyPoll(nodeId)
						const node = options.store.state.nodesById[nodeId]
						const patch = {
							taskId: undefined,
							taskStatus: 'idle' as const,
							progress: 0,
							statusText: t('tasks.meshy.taskDeleted'),
							errorMessage: ''
						}
						if (node?.type === 'meshy') {
							options.store.commit('setNodeMeshySettings', { nodeId, meshySettings: patch })
						} else if (node?.type === 'image') {
							options.store.commit('setNodeImageSettings', {
								nodeId,
								imageSettings: { meshyImageSettings: patch }
							})
						} else if (node?.type === 'model3d') {
							options.store.commit('setNodeModel3DSettings', {
								nodeId,
								model3dSettings: { meshyModelSettings: patch }
							})
						}
					}
					options.pushToast(t('tasks.meshy.taskActionPerformed', { action: t('tasks.meshy.delete') }), 'info')
				}
			}
			await refreshMeshyTaskItems({ silent: true })
			await refreshMeshyBalance({ silent: true })
			if (meshyTaskDetailTaskId.value) await onPreviewMeshyTask(meshyTaskDetailTaskId.value)
		} finally {
			meshyTaskActionBusyTaskId.value = ''
			meshyTaskActionBusyType.value = ''
		}
	}

	const onPreviewMeshyTask = async (taskItemId: string) => {
		const item = findMeshyTaskPanelItemById(meshyTaskItems.value, taskItemId)
		if (!item) return
		meshyTaskDetailTaskId.value = taskItemId
		meshyTaskDetail.value = mapMeshyPanelItemToDetail(item)
		if (!item.taskId || !meshyTaskRemoteLoaded.value) return
		meshyTaskDetailLoading.value = true
		try {
			const res: MeshyTaskDetailResponse = await options.comfyService.meshyTaskDetail(item.taskId)
			if (!res.ok) {
				options.pushToast(t('tasks.meshy.taskDetailLoadFailed', { error: String(res.error || 'unknown') }), 'warn')
				return
			}
			meshyTaskDetail.value = mapMeshyMirrorItemToDetail(
				res.item as unknown as Record<string, unknown>
			)
		} catch (err: unknown) {
			options.pushToast(t('tasks.meshy.taskDetailLoadFailed', { error: getErrorMessage(err) }), 'warn')
		} finally {
			meshyTaskDetailLoading.value = false
		}
	}

	const onMeshyTaskDialogOpenChanged = (open: boolean) => {
		if (!open) return
		void refreshMeshyTaskItems({ silent: true })
	}

	return {
		meshyTaskDialogOpen,
		meshyTaskItems,
		meshyTaskPanelStatusText,
		meshyBalanceText,
		meshyBalanceDetail,
		meshyBalanceTone,
		meshyTaskRemoteLoaded,
		meshyTaskRemoteLoading,
		meshyTaskDetail,
		meshyTaskDetailTaskId,
		meshyTaskDetailLoading,
		meshyTaskActionBusyTaskId,
		meshyTaskActionBusyType,
		openMeshyTaskDialog,
		closeMeshyTaskDialog,
		onRefreshMeshyTaskPanel,
		onMeshyTaskPanelAction,
		onPreviewMeshyTask,
		onNodeRefreshMeshyTask,
		onNodePullMeshyOutput,
		onNodeStopMeshyTask,
		onNodeDeleteMeshyTask,
		refreshMeshyTaskItems,
		refreshMeshyBalance,
		refreshMeshyTaskToNode,
		onMeshyTaskDialogOpenChanged
	}
}
