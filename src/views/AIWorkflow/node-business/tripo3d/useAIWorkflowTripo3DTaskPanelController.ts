import { computed, ref } from 'vue'
import type { WorkflowNode } from '../../../../aiworkflow/types'
import type {
	Tripo3DTaskPanelAction,
	Tripo3DTaskPanelDetail,
	Tripo3DTaskPanelItem,
	Tripo3DComfyService,
	Tripo3DEffectiveOutput,
	Tripo3DStoreLike,
	Tripo3DTaskStatus,
	CreateModel3DNodeAtCenterFn
} from './types'
import { getErrorMessage, isRecord } from '../../../../types/utils'
import { t } from '../../../../i18n'

type Tripo3DNodeSettingsLike = Record<string, unknown>

const modeLabelMap: Record<string, string> = {
	'text_to_model': t('tasks.tripo3d.modeTextToModel'),
	'image_to_model': t('tasks.tripo3d.modeImageToModel'),
	'multiview_to_model': t('tasks.tripo3d.modeMultiviewToModel'),
	'texture': t('tasks.tripo3d.modeTexture'),
	'refine': t('tasks.tripo3d.modeRefine')
}

const statusLabelMap: Record<string, string> = {
	idle: t('tasks.tripo3d.statusIdle'),
	queued: t('tasks.tripo3d.statusQueued'),
	pending: t('tasks.tripo3d.statusQueued'),
	running: t('tasks.tripo3d.statusRunning'),
	success: t('tasks.tripo3d.statusSuccess'),
	succeeded: t('tasks.tripo3d.statusSuccess'),
	failed: t('tasks.tripo3d.statusFailed'),
	cancelled: t('tasks.tripo3d.statusCancelled'),
	canceled: t('tasks.tripo3d.statusCancelled')
}

const normalizeStatusForPanel = (raw: unknown): Tripo3DTaskPanelItem['status'] => {
	const status = String(raw ?? '').trim().toLowerCase()
	if (status === 'success' || status === 'succeeded' || status === 'completed') return 'succeeded'
	if (status === 'queued' || status === 'pending') return 'queued'
	if (status === 'running' || status === 'in_progress' || status === 'processing') return 'running'
	if (status === 'failed' || status === 'error') return 'failed'
	if (status === 'cancelled' || status === 'canceled') return 'cancelled'
	return 'idle'
}

export const useAIWorkflowTripo3DTaskPanelController = (options: {
	store: Tripo3DStoreLike
	renderNodes: { value: WorkflowNode[] }
	comfyService: Tripo3DComfyService
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	getTripo3DDisplayThumbnailUrl: (settings: Record<string, unknown> | null | undefined) => string
	pickTripo3DEffectiveOutput: (item: Record<string, unknown>) => Tripo3DEffectiveOutput
	applyTripo3DTaskResult: (nodeId: string, task: unknown) => Promise<string>
	stopTripo3DPoll: (nodeId: string) => void
	createImageNodeAtCenter?: (url: string, name?: string) => string | null
	createModel3DNodeAtCenter?: CreateModel3DNodeAtCenterFn
}) => {
	const tripo3dTaskDialogOpen = ref(false)
	const tripo3dTaskRemoteItems = ref<Tripo3DTaskPanelItem[]>([])
	const tripo3dTaskRemoteLoaded = ref(false)
	const tripo3dTaskRemoteLoading = ref(false)
	const tripo3dTaskRemoteFallbackReason = ref('')
	const tripo3dTaskDetail = ref<Tripo3DTaskPanelDetail | null>(null)
	const tripo3dTaskDetailTaskId = ref('')
	const tripo3dTaskDetailLoading = ref(false)
	const tripo3dTaskActionBusyTaskId = ref('')
	const tripo3dTaskActionBusyType = ref<Tripo3DTaskPanelAction | ''>('')
	const tripo3dBalanceText = ref(t('tasks.tripo3d.balanceLoading'))
	const tripo3dBalanceDetail = ref(t('tasks.tripo3d.balanceLoadingDetail'))
	const tripo3dBalanceTone = ref<'muted' | 'warn' | 'ok'>('muted')

	const getTripo3DSettingsForNode = (node: WorkflowNode): Tripo3DNodeSettingsLike | undefined => {
		if (node.type === 'model3d' && isRecord(node.model3dSettings)) {
			const tripo3dModelSettings = node.model3dSettings.tripo3dModelSettings
			if (isRecord(tripo3dModelSettings) && tripo3dModelSettings.tripo3dTaskId) {
				return tripo3dModelSettings
			}
		}
		return undefined
	}

	const isTripo3DNode = (node: WorkflowNode) => {
		if (node.type === 'model3d' && isRecord(node.model3dSettings)) {
			const modelSource = node.model3dSettings.modelGenerationSource
			if (modelSource === 'tripo3d') return true
			const tripo3dModelSettings = node.model3dSettings.tripo3dModelSettings
			if (isRecord(tripo3dModelSettings) && tripo3dModelSettings.tripo3dTaskId) return true
		}
		return false
	}

	const mapModeLabel = (mode: string) => modeLabelMap[mode] || mode
	const mapStatusLabel = (status: string) => statusLabelMap[status] || status

	const localTripo3DTaskItems = computed<Tripo3DTaskPanelItem[]>(() => {
		return options.renderNodes.value
			.filter((node) => isTripo3DNode(node))
			.map((node) => {
				const settings = getTripo3DSettingsForNode(node) ?? {}
				const mode = String(settings.tripo3dTaskFamily ?? settings.tripo3dMode ?? 'text_to_model').trim()
				const taskStatusRaw = String(settings.tripo3dTaskStatus ?? 'idle').trim()
				const taskStatus = normalizeStatusForPanel(taskStatusRaw)
				const prompt = String(settings.tripo3dPrompt ?? '').trim()
				const progress = Math.max(0, Math.min(100, Number(settings.tripo3dProgress ?? 0)))
				const statusFallback = String(settings.tripo3dStatusText ?? settings.tripo3dErrorMessage ?? '').trim() || t('tasks.tripo3d.pendingExecution')
				const output = options.pickTripo3DEffectiveOutput(settings)
				return {
					id: `${node.id}:${String(settings.tripo3dTaskId ?? mode)}`,
					nodeId: node.id,
					title: String(node.alias ?? node.title ?? t('tasks.tripo3d.taskNodeTitle')).trim() || t('tasks.tripo3d.taskNodeTitle'),
					taskId: String(settings.tripo3dTaskId ?? '').trim() || undefined,
					mode,
					modeLabel: mapModeLabel(mode),
					status: taskStatus,
					statusLabel: mapStatusLabel(taskStatus),
					progress,
					promptPreview: prompt || t('tasks.tripo3d.promptNotFilled'),
					metaText: `${t('tasks.tripo3d.type3d')} · ${statusFallback}`,
					footnote: statusFallback,
					thumbnailUrl: options.getTripo3DDisplayThumbnailUrl(settings) || undefined,
					modelUrl: output.modelUrl || undefined,
					localAssetUrl: output.localAssetUrl || undefined,
					localAssetPath: output.localAssetPath || undefined,
					createdAt: Number(node.createdAt ?? Date.now()),
					modelVersion: String(settings.tripo3dModelVersion ?? '').trim() || undefined,
					texture: typeof settings.tripo3dTexture === 'boolean' ? settings.tripo3dTexture : undefined,
					pbr: typeof settings.tripo3dPbr === 'boolean' ? settings.tripo3dPbr : undefined,
					faceLimit: Number(settings.tripo3dFaceLimit ?? 0) || undefined,
					negativePrompt: String(settings.tripo3dNegativePrompt ?? '').trim() || undefined,
					statusText: String(settings.tripo3dStatusText ?? '').trim() || undefined,
					errorMessage: String(settings.tripo3dErrorMessage ?? '').trim() || undefined,
					requestPayload: isRecord(settings.tripo3dRequestPayload) ? settings.tripo3dRequestPayload as Record<string, unknown> : undefined,
					responsePayload: isRecord(settings.tripo3dResponsePayload) ? settings.tripo3dResponsePayload as Record<string, unknown> : undefined
				}
			})
	})

	const tripo3dTaskItems = computed<Tripo3DTaskPanelItem[]>(() => {
		if (tripo3dTaskRemoteLoaded.value) return tripo3dTaskRemoteItems.value
		return localTripo3DTaskItems.value
	})

	const tripo3dTaskPanelStatusText = computed(() => {
		if (tripo3dTaskRemoteLoading.value && !tripo3dTaskRemoteLoaded.value) {
			return t('tasks.tripo3d.syncingFromBackend')
		}
		if (tripo3dTaskRemoteLoaded.value) {
			return t('tasks.tripo3d.backendTasksDisplayed')
		}
		if (tripo3dTaskRemoteFallbackReason.value) {
			return t('tasks.tripo3d.backendLoadFailedFallback', { reason: tripo3dTaskRemoteFallbackReason.value })
		}
		return t('tasks.tripo3d.localStateDisplayed')
	})

	const refreshTripo3DTaskItems = async (opts?: { silent?: boolean }) => {
		if (tripo3dTaskRemoteLoading.value) return
		tripo3dTaskRemoteLoading.value = true
		try {
			const res = await options.comfyService.tripo3dTasks({ limit: 120 })
			if (!res.ok) {
				tripo3dTaskRemoteFallbackReason.value = String(res.error || 'unknown')
				if (!opts?.silent)
					options.pushToast(t('tasks.tripo3d.taskCenterLoadFailed', { error: String(res.error || 'unknown') }), 'warn')
				return
			}
			tripo3dTaskRemoteItems.value = Array.isArray(res.items)
				? res.items.map((item: any) => {
					const settings = isRecord(item) ? item : {}
					const mode = String(settings.mode ?? 'text_to_model').trim()
					const taskStatus = normalizeStatusForPanel(settings.status)
					const prompt = String(settings.prompt ?? '').trim()
					const progress = Math.max(0, Math.min(100, Number(settings.progress ?? 0)))
					const output = options.pickTripo3DEffectiveOutput(settings)
					return {
						id: String(settings.id ?? settings.taskId ?? Math.random().toString()),
						nodeId: String(settings.nodeId ?? '').trim() || undefined,
						title: String(settings.title ?? t('tasks.tripo3d.taskNodeTitle')).trim() || t('tasks.tripo3d.taskNodeTitle'),
						taskId: String(settings.taskId ?? '').trim() || undefined,
						mode,
						modeLabel: mapModeLabel(mode),
						status: taskStatus,
						statusLabel: mapStatusLabel(taskStatus),
						progress,
						promptPreview: prompt || t('tasks.tripo3d.promptNotFilled'),
						metaText: `${t('tasks.tripo3d.type3d')}`,
						footnote: String(settings.statusText ?? settings.status_text ?? '').trim(),
						thumbnailUrl: output.thumbnailUrl || undefined,
						modelUrl: output.modelUrl || undefined,
						localAssetUrl: output.localAssetUrl || undefined,
						localAssetPath: output.localAssetPath || undefined,
						createdAt: Number(settings.createdAt ?? Date.now()),
						modelVersion: String(settings.modelVersion ?? settings.model_version ?? '').trim() || undefined,
						texture: typeof settings.texture === 'boolean' ? settings.texture : undefined,
						pbr: typeof settings.pbr === 'boolean' ? settings.pbr : undefined,
						faceLimit: Number(settings.faceLimit ?? settings.face_limit ?? 0) || undefined,
						negativePrompt: String(settings.negativePrompt ?? settings.negative_prompt ?? '').trim() || undefined,
						statusText: String(settings.statusText ?? settings.status_text ?? '').trim() || undefined,
						errorMessage: String(settings.errorMessage ?? settings.error_message ?? '').trim() || undefined,
						requestPayload: isRecord(settings.requestPayload) ? settings.requestPayload as Record<string, unknown> : undefined,
						responsePayload: isRecord(settings.responsePayload) ? settings.responsePayload as Record<string, unknown> : undefined
					}
				})
				: []
			tripo3dTaskRemoteLoaded.value = true
			tripo3dTaskRemoteFallbackReason.value = ''
		} catch (err: unknown) {
			tripo3dTaskRemoteFallbackReason.value = getErrorMessage(err)
			if (!opts?.silent)
				options.pushToast(t('tasks.tripo3d.taskCenterLoadFailed', { error: getErrorMessage(err) }), 'warn')
		} finally {
			tripo3dTaskRemoteLoading.value = false
		}
	}

	const refreshTripo3DBalance = async (opts?: { silent?: boolean }) => {
		try {
			const res = await options.comfyService.tripo3dBalance()
			if (!res.ok) {
				tripo3dBalanceText.value = t('tasks.tripo3d.balanceLoadFailed')
				tripo3dBalanceDetail.value = String(res.error || 'unknown')
				tripo3dBalanceTone.value = 'warn'
				if (!opts?.silent)
					options.pushToast(t('tasks.tripo3d.balanceLoadFailedToast', { error: String(res.error || 'unknown') }), 'warn')
				return
			}
			tripo3dBalanceText.value = String(res.displayText || t('tasks.tripo3d.balanceUnavailable'))
			tripo3dBalanceDetail.value = String(res.detail || '')
			tripo3dBalanceTone.value = res.available ? 'ok' : res.configured ? 'muted' : 'warn'
		} catch (err: unknown) {
			tripo3dBalanceText.value = t('tasks.tripo3d.balanceLoadFailed')
			tripo3dBalanceDetail.value = getErrorMessage(err)
			tripo3dBalanceTone.value = 'warn'
			if (!opts?.silent)
				options.pushToast(t('tasks.tripo3d.balanceLoadFailedToast', { error: getErrorMessage(err) }), 'warn')
		}
	}

	const openTripo3DTaskDialog = () => {
		tripo3dTaskDialogOpen.value = true
		void refreshTripo3DTaskItems({ silent: true })
		void refreshTripo3DBalance({ silent: true })
	}

	const onRefreshTripo3DTaskPanel = async () => {
		await Promise.all([
			refreshTripo3DTaskItems({ silent: false }),
			refreshTripo3DBalance({ silent: false })
		])
	}

	const closeTripo3DTaskDialog = () => {
		tripo3dTaskDialogOpen.value = false
		tripo3dTaskDetail.value = null
		tripo3dTaskDetailTaskId.value = ''
		tripo3dTaskDetailLoading.value = false
		tripo3dTaskActionBusyTaskId.value = ''
		tripo3dTaskActionBusyType.value = ''
	}

	const findTripo3DNodeIdByTaskId = (taskId: string) => {
		const targetTaskId = String(taskId ?? '').trim()
		if (!targetTaskId) return ''
		for (const node of options.renderNodes.value) {
			if (!node || !isTripo3DNode(node)) continue
			const settings = getTripo3DSettingsForNode(node) ?? {}
			const knownIds = [settings.tripo3dTaskId]
				.map((x) => String(x ?? '').trim())
				.filter(Boolean)
			if (knownIds.includes(targetTaskId)) return node.id
		}
		return ''
	}

	const refreshTripo3DTaskToNode = async (nodeId: string, taskId: string) => {
		const res = await options.comfyService.tripo3dTask(taskId)
		if (!res.ok) {
			return { ok: false as const, error: String(res.error || 'unknown') }
		}
		const finalStatus = await options.applyTripo3DTaskResult(nodeId, res)
		return { ok: true as const, finalStatus }
	}

	const mapTaskItemToDetail = (item: Tripo3DTaskPanelItem): Tripo3DTaskPanelDetail => {
		return {
			id: item.id,
			title: item.title,
			taskId: item.taskId,
			nodeId: item.nodeId,
			modeLabel: item.modeLabel,
			statusLabel: item.statusLabel,
			progress: item.progress,
			prompt: item.promptPreview,
			negativePrompt: item.negativePrompt,
			statusText: item.statusText,
			errorMessage: item.errorMessage,
			modelUrl: item.modelUrl,
			assetUrl: item.localAssetUrl,
			assetPath: item.localAssetPath,
			thumbnailUrl: item.thumbnailUrl,
			createdAtLabel: new Date(item.createdAt).toLocaleString(),
			sourceLabel: item.nodeId ? t('tasks.tripo3d.localNode') : t('tasks.tripo3d.remoteTask'),
			modelVersion: item.modelVersion,
			texture: item.texture,
			pbr: item.pbr,
			faceLimit: item.faceLimit,
			requestPayload: item.requestPayload,
			responsePayload: item.responsePayload
		}
	}

	const mapRemoteTaskToDetail = (item: Record<string, unknown>): Tripo3DTaskPanelDetail => {
		const settings = item
		const mode = String(settings.mode ?? 'text_to_model').trim()
		const taskStatus = normalizeStatusForPanel(settings.status)
		const output = options.pickTripo3DEffectiveOutput(settings)
		return {
			id: String(settings.id ?? settings.taskId ?? ''),
			title: String(settings.title ?? t('tasks.tripo3d.taskNodeTitle')),
			taskId: String(settings.taskId ?? '').trim() || undefined,
			nodeId: String(settings.nodeId ?? '').trim() || undefined,
			modeLabel: mapModeLabel(mode),
			statusLabel: mapStatusLabel(taskStatus),
			progress: Math.max(0, Math.min(100, Number(settings.progress ?? 0))),
			prompt: String(settings.prompt ?? '').trim(),
			negativePrompt: String(settings.negativePrompt ?? settings.negative_prompt ?? '').trim() || undefined,
			statusText: String(settings.statusText ?? settings.status_text ?? '').trim() || undefined,
			errorMessage: String(settings.errorMessage ?? settings.error_message ?? '').trim() || undefined,
			modelUrl: output.modelUrl || undefined,
			assetUrl: output.localAssetUrl || undefined,
			assetPath: output.localAssetPath || undefined,
			thumbnailUrl: output.thumbnailUrl || undefined,
			createdAtLabel: settings.createdAt ? new Date(Number(settings.createdAt)).toLocaleString() : undefined,
			updatedAtLabel: settings.updatedAt ? new Date(Number(settings.updatedAt)).toLocaleString() : undefined,
			sourceLabel: t('tasks.tripo3d.remoteTask'),
			modelVersion: String(settings.modelVersion ?? settings.model_version ?? '').trim() || undefined,
			texture: typeof settings.texture === 'boolean' ? settings.texture : undefined,
			pbr: typeof settings.pbr === 'boolean' ? settings.pbr : undefined,
			faceLimit: Number(settings.faceLimit ?? settings.face_limit ?? 0) || undefined,
			requestPayload: isRecord(settings.requestPayload) ? settings.requestPayload as Record<string, unknown> : undefined,
			responsePayload: isRecord(settings.responsePayload) ? settings.responsePayload as Record<string, unknown> : undefined
		}
	}

	const findTaskItemById = (items: Tripo3DTaskPanelItem[], id: string) => {
		return items.find((item) => item.id === id)
	}

	const onPreviewTripo3DTask = async (taskItemId: string) => {
		const item = findTaskItemById(tripo3dTaskItems.value, taskItemId)
		if (!item) return
		tripo3dTaskDetailTaskId.value = taskItemId
		tripo3dTaskDetail.value = mapTaskItemToDetail(item)
		if (!item.taskId || !tripo3dTaskRemoteLoaded.value) return
		tripo3dTaskDetailLoading.value = true
		try {
			const res = await options.comfyService.tripo3dTaskDetail(item.taskId)
			if (!res.ok) {
				options.pushToast(t('tasks.tripo3d.taskDetailLoadFailed', { error: String(res.error || 'unknown') }), 'warn')
				return
			}
			tripo3dTaskDetail.value = mapRemoteTaskToDetail(
				isRecord(res.item) ? res.item as Record<string, unknown> : {}
			)
		} catch (err: unknown) {
			options.pushToast(t('tasks.tripo3d.taskDetailLoadFailed', { error: getErrorMessage(err) }), 'warn')
		} finally {
			tripo3dTaskDetailLoading.value = false
		}
	}

	const onNodeRefreshTripo3DTask = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || !isTripo3DNode(node)) return
		const settings = getTripo3DSettingsForNode(node) ?? {}
		const taskId = String(settings.tripo3dTaskId ?? '').trim()
		if (!taskId) {
			options.pushToast(t('tasks.tripo3d.noRefreshableTaskId'), 'warn')
			return
		}
		const refreshed = await refreshTripo3DTaskToNode(nodeId, taskId)
		if (!refreshed.ok) {
			options.pushToast(t('tasks.tripo3d.refreshStatusFailed', { error: refreshed.error }), 'warn')
			return
		}
		options.pushToast(t('tasks.tripo3d.statusRefreshed'), 'info')
	}

	const onNodePullTripo3DOutput = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || !isTripo3DNode(node)) return
		const settings = getTripo3DSettingsForNode(node) ?? {}
		const taskId = String(settings.tripo3dTaskId ?? '').trim()
		if (!taskId) {
			options.pushToast(t('tasks.tripo3d.noPullableTaskId'), 'warn')
			return
		}
		const refreshed = await refreshTripo3DTaskToNode(nodeId, taskId)
		if (!refreshed.ok) {
			options.pushToast(t('tasks.tripo3d.pullArtifactsFailed', { error: refreshed.error }), 'warn')
			return
		}
		if (refreshed.finalStatus !== 'success' && refreshed.finalStatus !== 'succeeded') {
			options.pushToast(t('tasks.tripo3d.taskNotCompletedCannotPull'), 'warn')
			return
		}
		options.pushToast(t('tasks.tripo3d.model3dDownloadedBound'), 'info')
	}

	const onNodeStopTripo3DTask = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || !isTripo3DNode(node)) return
		const settings = getTripo3DSettingsForNode(node) ?? {}
		const taskId = String(settings.tripo3dTaskId ?? '').trim()
		if (!taskId) {
			options.pushToast(t('tasks.tripo3d.noRunningTask'), 'warn')
			return
		}
		const res = await options.comfyService.tripo3dStop(taskId)
		if (!res.ok) {
			options.pushToast(t('tasks.tripo3d.stopTaskFailed', { error: String(res.error || 'unknown') }), 'warn')
			return
		}
		options.stopTripo3DPoll(nodeId)
		const patch = {
			tripo3dTaskStatus: 'cancelled' as const,
			tripo3dStatusText: t('tasks.tripo3d.taskStopped'),
			tripo3dErrorMessage: ''
		}
		options.store.commit('setNodeModel3DSettings', {
			nodeId,
			model3dSettings: { tripo3dModelSettings: patch }
		})
		options.pushToast(t('tasks.tripo3d.taskStoppedToast'), 'info')
		if (tripo3dTaskDialogOpen.value || tripo3dTaskRemoteLoaded.value)
			void refreshTripo3DTaskItems({ silent: true })
	}

	const onNodeDeleteTripo3DTask = async (nodeId: string) => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || !isTripo3DNode(node)) return
		const settings = getTripo3DSettingsForNode(node) ?? {}
		const taskId = String(settings.tripo3dTaskId ?? '').trim()
		if (!taskId) {
			options.pushToast(t('tasks.tripo3d.noDeletableTask'), 'warn')
			return
		}
		const res = await options.comfyService.tripo3dDelete(taskId)
		if (!res.ok) {
			options.pushToast(t('tasks.tripo3d.deleteTaskFailed', { error: String(res.error || 'unknown') }), 'warn')
			return
		}
		options.stopTripo3DPoll(nodeId)
		const patch = {
			tripo3dTaskId: undefined,
			tripo3dTaskStatus: 'idle' as const,
			tripo3dProgress: 0,
			tripo3dStatusText: t('tasks.tripo3d.taskDeleted'),
			tripo3dErrorMessage: ''
		}
		options.store.commit('setNodeModel3DSettings', {
			nodeId,
			model3dSettings: { tripo3dModelSettings: patch }
		})
		options.pushToast(t('tasks.tripo3d.taskDeletedToast'), 'info')
		if (tripo3dTaskDialogOpen.value || tripo3dTaskRemoteLoaded.value)
			void refreshTripo3DTaskItems({ silent: true })
	}

	const onTripo3DTaskPanelAction = async (payload: {
		taskId: string
		mode?: string
		action: Tripo3DTaskPanelAction
		nodeId?: string
	}) => {
		const taskId = String(payload?.taskId ?? '').trim()
		if (!taskId) return
		let nodeId = String(payload?.nodeId ?? '').trim() || findTripo3DNodeIdByTaskId(taskId)
		tripo3dTaskActionBusyTaskId.value = taskId
		tripo3dTaskActionBusyType.value = payload.action
		try {
			if (payload.action === 'refresh') {
				if (nodeId) {
					const refreshed = await refreshTripo3DTaskToNode(nodeId, taskId)
					if (!refreshed.ok) {
						options.pushToast(t('tasks.tripo3d.taskStatusRefreshFailed', { error: refreshed.error }), 'warn')
					} else {
						options.pushToast(t('tasks.tripo3d.taskStatusRefreshed'), 'info')
					}
				} else {
					const res = await options.comfyService.tripo3dTask(taskId)
					if (!res.ok)
						options.pushToast(t('tasks.tripo3d.taskStatusRefreshFailed', { error: String(res.error || 'unknown') }), 'warn')
				}
			} else if (payload.action === 'import-output') {
				let targetNodeId = nodeId
				let isNewNode = false
				const mode = String(payload?.mode ?? 'text_to_model').trim()

				if (!targetNodeId && typeof options.createModel3DNodeAtCenter === 'function') {
					try {
						const res = await options.comfyService.tripo3dTask(taskId)
						if (res.ok) {
							const taskData = isRecord(res) ? res as Record<string, unknown> : {}
							const taskStatus = normalizeStatusForPanel(taskData.status)
							if (taskStatus !== 'succeeded') {
								options.pushToast(t('tasks.tripo3d.taskNotCompletedCannotPull'), 'warn')
								return
							}
							const newNodeId = options.createModel3DNodeAtCenter({
								name: t('tasks.tripo3d.model3dTaskNodeName'),
								taskId,
								mode
							})
							if (newNodeId) {
								targetNodeId = newNodeId
								isNewNode = true

								options.store.commit('setNodeModel3DSettings', {
									nodeId: newNodeId,
									model3dSettings: {
										modelGenerationSource: 'tripo3d',
										tripo3dModelSettings: {
											tripo3dTaskId: taskId,
											tripo3dTaskFamily: mode,
											tripo3dTaskStatus: 'pending',
											tripo3dProgress: 0,
											tripo3dStatusText: t('tasks.tripo3d.pullingModelArtifacts')
										}
									}
								})
								options.pushToast(t('tasks.tripo3d.nodeCreatedPullingArtifacts'), 'info')
							}
						}
					} catch (e) {
						console.error('[Tripo3D Task Panel] 创建节点失败:', e)
					}
				}

				if (!targetNodeId) {
					options.pushToast(t('tasks.tripo3d.noReceivingNodeFound'), 'warn')
				} else {
					const refreshed = await refreshTripo3DTaskToNode(targetNodeId, taskId)
					if (!refreshed.ok) {
						options.pushToast(t('tasks.tripo3d.pullArtifactsFailedGeneric', { error: refreshed.error }), 'warn')
					} else if (refreshed.finalStatus !== 'success' && refreshed.finalStatus !== 'succeeded') {
						options.pushToast(t('tasks.tripo3d.taskNotCompletedCannotPull'), 'warn')
					} else {
						options.pushToast(
							isNewNode ? t('tasks.tripo3d.model3dPulledBoundToNewNode') : t('tasks.tripo3d.model3dDownloadedBoundGeneric'),
							'info'
						)
					}
				}
			} else if (payload.action === 'stop') {
				const res = await options.comfyService.tripo3dStop(taskId)
				if (!res.ok) {
					options.pushToast(t('tasks.tripo3d.taskActionFailed', { action: t('tasks.tripo3d.stop'), error: String(res.error || 'unknown') }), 'warn')
				} else {
					if (nodeId) {
						options.stopTripo3DPoll(nodeId)
						options.store.commit('setNodeModel3DSettings', {
							nodeId,
							model3dSettings: {
								tripo3dModelSettings: {
									tripo3dTaskStatus: 'cancelled' as const,
									tripo3dStatusText: t('tasks.tripo3d.taskStopped'),
									tripo3dErrorMessage: ''
								}
							}
						})
					}
					options.pushToast(t('tasks.tripo3d.taskActionPerformed', { action: t('tasks.tripo3d.stop') }), 'info')
				}
			} else if (payload.action === 'delete') {
				const res = await options.comfyService.tripo3dDelete(taskId)
				if (!res.ok) {
					options.pushToast(t('tasks.tripo3d.taskActionFailed', { action: t('tasks.tripo3d.delete'), error: String(res.error || 'unknown') }), 'warn')
				} else {
					if (nodeId) {
						options.stopTripo3DPoll(nodeId)
						options.store.commit('setNodeModel3DSettings', {
							nodeId,
							model3dSettings: {
								tripo3dModelSettings: {
									tripo3dTaskId: undefined,
									tripo3dTaskStatus: 'idle' as const,
									tripo3dProgress: 0,
									tripo3dStatusText: t('tasks.tripo3d.taskDeleted'),
									tripo3dErrorMessage: ''
								}
							}
						})
					}
					options.pushToast(t('tasks.tripo3d.taskActionPerformed', { action: t('tasks.tripo3d.delete') }), 'info')
				}
			}
			await refreshTripo3DTaskItems({ silent: true })
			await refreshTripo3DBalance({ silent: true })
			if (tripo3dTaskDetailTaskId.value) await onPreviewTripo3DTask(tripo3dTaskDetailTaskId.value)
		} finally {
			tripo3dTaskActionBusyTaskId.value = ''
			tripo3dTaskActionBusyType.value = ''
		}
	}

	const onTripo3DTaskDialogOpenChanged = (open: boolean) => {
		if (open) {
			openTripo3DTaskDialog()
		} else {
			closeTripo3DTaskDialog()
		}
	}

	return {
		tripo3dTaskDialogOpen,
		tripo3dTaskItems,
		tripo3dTaskPanelStatusText,
		tripo3dTaskDetail,
		tripo3dTaskDetailTaskId,
		tripo3dTaskDetailLoading,
		tripo3dTaskActionBusyTaskId,
		tripo3dTaskActionBusyType,
		tripo3dBalanceText,
		tripo3dBalanceDetail,
		tripo3dBalanceTone,
		tripo3dTaskRemoteLoading,
		openTripo3DTaskDialog,
		closeTripo3DTaskDialog,
		onRefreshTripo3DTaskPanel,
		onPreviewTripo3DTask,
		onTripo3DTaskPanelAction,
		onNodeRefreshTripo3DTask,
		onNodePullTripo3DOutput,
		onNodeStopTripo3DTask,
		onNodeDeleteTripo3DTask,
		refreshTripo3DTaskItems,
		refreshTripo3DBalance,
		refreshTripo3DTaskToNode,
		getTripo3DSettingsForNode,
		isTripo3DNode,
		mapTaskItemToDetail,
		onTripo3DTaskDialogOpenChanged
	}
}
