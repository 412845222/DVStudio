import { computed, ref } from 'vue'
import type { WorkflowNode } from '../../../../aiworkflow/types'
import type {
	MeshyTaskPanelAction,
	MeshyTaskPanelDetail,
	MeshyTaskPanelItem
} from '../../../../ui/WorkFlow/MeshyTaskPanel.vue'
import { getErrorMessage, isRecord } from '../../../../types/utils'
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
	const meshyBalanceText = ref('读取中...')
	const meshyBalanceDetail = ref('正在读取 Meshy 余额状态。')
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
					options.pushToast('读取 Meshy 任务中心失败：' + String(res.error || 'unknown'), 'warn')
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
				options.pushToast('读取 Meshy 任务中心失败：' + getErrorMessage(err), 'warn')
		} finally {
			meshyTaskRemoteLoading.value = false
		}
	}

	const refreshMeshyBalance = async (opts?: { silent?: boolean }) => {
		try {
			const res: MeshyBalanceResponse = await options.comfyService.meshyBalance()
			if (!res.ok) {
				meshyBalanceText.value = '读取失败'
				meshyBalanceDetail.value = String(res.error || 'unknown')
				meshyBalanceTone.value = 'warn'
				if (!opts?.silent)
					options.pushToast('读取 Meshy 余额状态失败：' + String(res.error || 'unknown'), 'warn')
				return
			}
			meshyBalanceText.value = String(res.displayText || '暂不可读')
			meshyBalanceDetail.value = String(res.detail || '')
			meshyBalanceTone.value = res.available ? 'ok' : res.configured ? 'muted' : 'warn'
		} catch (err: unknown) {
			meshyBalanceText.value = '读取失败'
			meshyBalanceDetail.value = getErrorMessage(err)
			meshyBalanceTone.value = 'warn'
			if (!opts?.silent)
				options.pushToast('读取 Meshy 余额状态失败：' + getErrorMessage(err), 'warn')
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
				return {
					id: `${node.id}:${String(settings.taskId ?? family)}`,
					nodeId: node.id,
					title: String(node.alias ?? node.title ?? 'Meshy 任务').trim() || 'Meshy 任务',
					taskId: String(settings.taskId ?? '').trim() || undefined,
					target,
					family,
					familyLabel: familyLabelForMeshy(family),
					status: taskStatus,
					statusLabel: statusLabelForMeshy(taskStatus),
					progress,
					promptPreview: prompt || '未填写提示词',
					metaText: `${target === 'image' ? '图像链路' : '3D链路'} · ${imageCount} 张图片输入 · ${String(settings.statusText ?? settings.errorMessage ?? '').trim() || '待执行'}`,
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
						title: String(node.title ?? '').trim() || 'Meshy 任务',
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
			return '正在从后端镜像同步 Meshy 任务中心...'
		}
		if (meshyTaskRemoteLoaded.value) {
			return '当前展示后端镜像任务，可直接拖拽到蓝图复用。'
		}
		if (meshyTaskRemoteFallbackReason.value) {
			return `后端镜像读取失败，当前已回退显示本地节点状态。原因：${meshyTaskRemoteFallbackReason.value}`
		}
		return '当前先展示本地节点状态；打开面板后会自动尝试同步后端镜像。'
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
			options.pushToast('当前节点没有可刷新的 Meshy 任务 ID。', 'warn')
			return
		}
		const mode = String(settings.taskFamily ?? 'text-to-3d')
		const refreshed = await refreshMeshyTaskToNode(nodeId, taskId, mode)
		if (!refreshed.ok) {
			options.pushToast('刷新 Meshy 状态失败：' + refreshed.error, 'warn')
			return
		}
		options.pushToast('Meshy 任务状态已刷新。', 'info')
	}

	const onNodePullMeshyOutput = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || !isMeshyNode(node)) return
		const settings = getMeshySettingsForNode(node) ?? {}
		const taskId = String(settings.taskId ?? '').trim()
		if (!taskId) {
			options.pushToast('当前节点没有可拉取的 Meshy 任务 ID。', 'warn')
			return
		}
		const mode = String(settings.taskFamily ?? 'text-to-3d')
		const refreshed = await refreshMeshyTaskToNode(nodeId, taskId, mode)
		if (!refreshed.ok) {
			options.pushToast('拉取 Meshy 产物失败：' + refreshed.error, 'warn')
			return
		}
		if (refreshed.finalStatus !== 'succeeded') {
			options.pushToast('任务尚未完成，暂无法拉取最终产物。', 'warn')
			return
		}

		if (node.type === 'image') {
			options.pushToast('Meshy 图片已下载并绑定到当前图片节点。', 'info')
		} else if (node.type === 'model3d') {
			options.pushToast('Meshy 3D 模型已下载并绑定到当前模型节点。', 'info')
		} else {
			options.pushToast('Meshy 产物已同步到当前节点并尝试下发到下游。', 'info')
		}
	}

	const onNodeStopMeshyTask = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || !isMeshyNode(node)) return
		const settings = getMeshySettingsForNode(node) ?? {}
		const taskId = String(settings.taskId ?? '').trim()
		if (!taskId) {
			options.pushToast('当前节点没有运行中的 Meshy 任务。', 'warn')
			return
		}
		const mode = normalizeMeshyModeForTaskAction(String(settings.taskFamily ?? 'text-to-3d'))
		const res: MeshyTaskActionResponse = await options.comfyService.meshyStop(taskId, mode)
		if (!res.ok) {
			options.pushToast('停止 Meshy 任务失败：' + String(res.error || 'unknown'), 'warn')
			return
		}
		options.stopMeshyPoll(nodeId)
		const patch = {
			taskStatus: 'canceled' as const,
			statusText: 'Meshy：任务已停止',
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
		options.pushToast('已停止 Meshy 任务。', 'info')
		if (meshyTaskDialogOpen.value || meshyTaskRemoteLoaded.value)
			void refreshMeshyTaskItems({ silent: true })
	}

	const onNodeDeleteMeshyTask = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || !isMeshyNode(node)) return
		const settings = getMeshySettingsForNode(node) ?? {}
		const taskId = String(settings.taskId ?? '').trim()
		if (!taskId) {
			options.pushToast('当前节点没有可删除的 Meshy 任务。', 'warn')
			return
		}
		const mode = normalizeMeshyModeForTaskAction(String(settings.taskFamily ?? 'text-to-3d'))
		const res: MeshyTaskActionResponse = await options.comfyService.meshyDelete(taskId, mode)
		if (!res.ok) {
			options.pushToast('删除 Meshy 任务失败：' + String(res.error || 'unknown'), 'warn')
			return
		}
		options.stopMeshyPoll(nodeId)
		const patch = {
			taskId: undefined,
			taskStatus: 'idle' as const,
			progress: 0,
			statusText: 'Meshy：任务已删除',
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
		options.pushToast('已删除 Meshy 任务。', 'info')
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
		const nodeId = String(payload?.nodeId ?? '').trim() || findMeshyNodeIdByTaskId(taskId)
		meshyTaskActionBusyTaskId.value = taskId
		meshyTaskActionBusyType.value = payload.action
		try {
			if (payload.action === 'refresh') {
				if (nodeId) {
					const refreshed = await refreshMeshyTaskToNode(nodeId, taskId, mode)
					if (!refreshed.ok) {
						options.pushToast('刷新任务状态失败：' + refreshed.error, 'warn')
					} else {
						options.pushToast('任务状态已刷新。', 'info')
					}
				} else {
					const res: MeshyTaskResponse = await options.comfyService.meshyTask(taskId, mode)
					if (!res.ok)
						options.pushToast('刷新任务状态失败：' + String(res.error || 'unknown'), 'warn')
				}
			} else if (payload.action === 'import-output') {
				if (!nodeId) {
					options.pushToast('未找到可接收产物的 Meshy 节点，请先将任务拖回蓝图或绑定节点。', 'warn')
				} else {
					const refreshed = await refreshMeshyTaskToNode(nodeId, taskId, mode)
					if (!refreshed.ok) {
						options.pushToast('拉取产物失败：' + refreshed.error, 'warn')
					} else if (refreshed.finalStatus !== 'succeeded') {
						options.pushToast('任务尚未完成，暂无法拉取最终产物。', 'warn')
					} else {
						const node = options.store.state.nodesById[nodeId]
						if (node?.type === 'image') {
							options.pushToast('Meshy 图片已下载并绑定到图片节点。', 'info')
						} else if (node?.type === 'model3d') {
							options.pushToast('Meshy 3D 模型已下载并绑定到模型节点。', 'info')
						} else {
							options.pushToast('产物已同步到节点并尝试分发到下游。', 'info')
						}
					}
				}
			} else if (payload.action === 'stop') {
				const res: MeshyTaskActionResponse = await options.comfyService.meshyStop(taskId, mode)
				if (!res.ok) {
					options.pushToast('停止任务失败：' + String(res.error || 'unknown'), 'warn')
				} else {
					if (nodeId) {
						options.stopMeshyPoll(nodeId)
						const node = options.store.state.nodesById[nodeId]
						const patch = {
							taskStatus: 'canceled' as const,
							statusText: 'Meshy：任务已停止',
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
					options.pushToast('任务已停止。', 'info')
				}
			} else if (payload.action === 'delete') {
				const res: MeshyTaskActionResponse = await options.comfyService.meshyDelete(taskId, mode)
				if (!res.ok) {
					options.pushToast('删除任务失败：' + String(res.error || 'unknown'), 'warn')
				} else {
					if (nodeId) {
						options.stopMeshyPoll(nodeId)
						const node = options.store.state.nodesById[nodeId]
						const patch = {
							taskId: undefined,
							taskStatus: 'idle' as const,
							progress: 0,
							statusText: 'Meshy：任务已删除',
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
					options.pushToast('任务已删除。', 'info')
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
				options.pushToast('读取 Meshy 任务详情失败：' + String(res.error || 'unknown'), 'warn')
				return
			}
			meshyTaskDetail.value = mapMeshyMirrorItemToDetail(
				res.item as unknown as Record<string, unknown>
			)
		} catch (err: unknown) {
			options.pushToast('读取 Meshy 任务详情失败：' + getErrorMessage(err), 'warn')
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
