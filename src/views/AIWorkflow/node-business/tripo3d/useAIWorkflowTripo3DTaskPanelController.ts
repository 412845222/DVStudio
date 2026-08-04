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
	Tripo3DTaskKind,
	CreateModel3DNodeAtCenterFn,
	CreateImageNodeAtCenterFn
} from './types'
import {
	isTripo3DImageMode as isTripo3DImageModeFn,
	getTripo3DTaskKind,
	isTripo3DImageMode
} from './types'
import { getErrorMessage, isRecord, isArray } from '../../../../types/utils'
import { t } from '../../../../i18n'

type Tripo3DNodeSettingsLike = Record<string, unknown>

const modeLabelMap: Record<string, string> = {
	text_to_model: t('tasks.tripo3d.modeTextToModel'),
	image_to_model: t('tasks.tripo3d.modeImageToModel'),
	multiview_to_model: t('tasks.tripo3d.modeMultiviewToModel'),
	texture: t('tasks.tripo3d.modeTexture'),
	refine: t('tasks.tripo3d.modeRefine'),
	text_to_image: t('aiConfig.tripo3dImageMode.textToImage'),
	image_to_image: t('aiConfig.tripo3dImageMode.imageToImage'),
	image_to_multiview: t('aiConfig.tripo3dImageMode.imageToMultiview')
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
	const status = String(raw ?? '')
		.trim()
		.toLowerCase()
	if (status === 'success' || status === 'succeeded' || status === 'completed') return 'succeeded'
	if (status === 'queued' || status === 'pending') return 'queued'
	if (status === 'running' || status === 'in_progress' || status === 'processing') return 'running'
	if (status === 'failed' || status === 'error') return 'failed'
	if (status === 'cancelled' || status === 'canceled') return 'cancelled'
	return 'idle'
}

const extractImageUrlsFromSettings = (settings: Record<string, unknown>): string[] => {
	const outputImages = settings.tripo3dOutputImages ?? settings.outputImages
	if (isArray(outputImages)) {
		const urls = outputImages.filter((u): u is string => typeof u === 'string' && !!u.trim())
		if (urls.length > 0) return urls.map((u) => u.trim())
	}
	const outputSummary = isRecord(settings.tripo3dOutputSummary)
		? settings.tripo3dOutputSummary
		: isRecord(settings.outputSummary)
			? settings.outputSummary
			: {}
	const summaryImageUrls = outputSummary.imageUrls
	if (isArray(summaryImageUrls)) {
		const urls = summaryImageUrls.filter((u): u is string => typeof u === 'string' && !!u.trim())
		if (urls.length > 0) return urls.map((u) => u.trim())
	}
	const singleImage = String(
		settings.tripo3dOutputImageUrl ??
			settings.outputImageUrl ??
			outputSummary.preferredUrl ??
			settings.imageUrl ??
			''
	).trim()
	return singleImage ? [singleImage] : []
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
	createImageNodeAtCenter?: CreateImageNodeAtCenterFn
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
		if (node.type === 'image' && isRecord(node.imageSettings)) {
			const tripo3dImageSettings = node.imageSettings.tripo3dImageSettings
			const imgSettingsRec = tripo3dImageSettings as Record<string, unknown> | undefined
			if (
				isRecord(tripo3dImageSettings) &&
				(tripo3dImageSettings.taskId || (imgSettingsRec && imgSettingsRec.tripo3dTaskId))
			) {
				const normalized: Record<string, unknown> = {}
				for (const [key, value] of Object.entries(tripo3dImageSettings)) {
					if (key.startsWith('tripo3d')) {
						normalized[key] = value
					} else {
						normalized[`tripo3d${key.charAt(0).toUpperCase()}${key.slice(1)}`] = value
					}
				}
				return normalized
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
		if (node.type === 'image' && isRecord(node.imageSettings)) {
			const imageSource = node.imageSettings.imageGenerationSource
			if (imageSource === 'tripo3d') return true
			const tripo3dImageSettings = node.imageSettings.tripo3dImageSettings
			const imgSettingsRec = tripo3dImageSettings as Record<string, unknown> | undefined
			if (
				isRecord(tripo3dImageSettings) &&
				(tripo3dImageSettings.taskId || (imgSettingsRec && imgSettingsRec.tripo3dTaskId))
			)
				return true
		}
		return false
	}

	const getNodeTaskType = (
		node: WorkflowNode,
		settings: Record<string, unknown>
	): Tripo3DTaskKind => {
		if (node.type === 'image') return 'image'
		const mode = String(settings.tripo3dTaskFamily ?? settings.tripo3dMode ?? '').trim()
		return getTripo3DTaskKind(mode)
	}

	const mapModeLabel = (mode: string) => modeLabelMap[mode] || mode
	const mapStatusLabel = (status: string) => statusLabelMap[status] || status

	const localTripo3DTaskItems = computed<Tripo3DTaskPanelItem[]>(() => {
		return options.renderNodes.value
			.filter((node) => isTripo3DNode(node))
			.map((node) => {
				const settings = getTripo3DSettingsForNode(node) ?? {}
				const isImageNode = node.type === 'image'
				const defaultMode = isImageNode ? 'text_to_image' : 'text_to_model'
				const mode = String(
					settings.tripo3dTaskFamily ?? settings.tripo3dMode ?? defaultMode
				).trim()
				const taskType = getNodeTaskType(node, settings)
				const typeLabel =
					taskType === 'image' ? t('tasks.tripo3d.typeImage') : t('tasks.tripo3d.type3d')
				const taskStatusRaw = String(settings.tripo3dTaskStatus ?? 'idle').trim()
				const taskStatus = normalizeStatusForPanel(taskStatusRaw)
				const prompt = String(settings.tripo3dPrompt ?? '').trim()
				const progress = Math.max(0, Math.min(100, Number(settings.tripo3dProgress ?? 0)))
				const statusFallback =
					String(settings.tripo3dStatusText ?? settings.tripo3dErrorMessage ?? '').trim() ||
					t('tasks.tripo3d.pendingExecution')
				const output = options.pickTripo3DEffectiveOutput(settings)
				const imageUrls = taskType === 'image' ? extractImageUrlsFromSettings(settings) : []
				return {
					id: `${node.id}:${String(settings.tripo3dTaskId ?? mode)}`,
					nodeId: node.id,
					title:
						String(node.alias ?? node.title ?? t('tasks.tripo3d.taskNodeTitle')).trim() ||
						t('tasks.tripo3d.taskNodeTitle'),
					taskId: String(settings.tripo3dTaskId ?? '').trim() || undefined,
					mode,
					modeLabel: mapModeLabel(mode),
					taskType,
					typeLabel,
					status: taskStatus,
					statusLabel: mapStatusLabel(taskStatus),
					progress,
					promptPreview: prompt || t('tasks.tripo3d.promptNotFilled'),
					metaText: `${typeLabel} · ${statusFallback}`,
					footnote: statusFallback,
					thumbnailUrl:
						options.getTripo3DDisplayThumbnailUrl(settings) || output.thumbnailUrl || undefined,
					modelUrl: output.modelUrl || undefined,
					imageUrls,
					localAssetUrl: output.localAssetUrl || undefined,
					localAssetPath: output.localAssetPath || undefined,
					createdAt: Number(node.createdAt ?? Date.now()),
					modelVersion: String(settings.tripo3dModelVersion ?? '').trim() || undefined,
					texture:
						typeof settings.tripo3dTexture === 'boolean' ? settings.tripo3dTexture : undefined,
					pbr: typeof settings.tripo3dPbr === 'boolean' ? settings.tripo3dPbr : undefined,
					faceLimit: Number(settings.tripo3dFaceLimit ?? 0) || undefined,
					negativePrompt: String(settings.tripo3dNegativePrompt ?? '').trim() || undefined,
					statusText: String(settings.tripo3dStatusText ?? '').trim() || undefined,
					errorMessage: String(settings.tripo3dErrorMessage ?? '').trim() || undefined,
					requestPayload: isRecord(settings.tripo3dRequestPayload)
						? (settings.tripo3dRequestPayload as Record<string, unknown>)
						: undefined,
					responsePayload: isRecord(settings.tripo3dResponsePayload)
						? (settings.tripo3dResponsePayload as Record<string, unknown>)
						: undefined
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
			return t('tasks.tripo3d.backendLoadFailedFallback', {
				reason: tripo3dTaskRemoteFallbackReason.value
			})
		}
		return t('tasks.tripo3d.localStateDisplayed')
	})

	const extractImageUrlsFromRemoteItem = (item: Record<string, unknown>): string[] => {
		if (isArray(item.imageUrls)) {
			return item.imageUrls
				.filter((u): u is string => typeof u === 'string' && !!u.trim())
				.map((u) => u.trim())
		}
		const output = item.output ?? item.result ?? item.data
		if (isRecord(output)) {
			const outputObj = output as Record<string, unknown>
			const imageUrls: string[] = []
			const collectUrl = (val: unknown) => {
				if (!val) return
				if (typeof val === 'string') {
					const s = val.trim()
					if (s && s.startsWith('http')) imageUrls.push(s)
				} else if (typeof val === 'object' && val !== null) {
					const obj = val as Record<string, unknown>
					const u = String(obj.url ?? obj.image_url ?? obj.src ?? '').trim()
					if (u && u.startsWith('http')) imageUrls.push(u)
				}
			}
			if (isArray(outputObj.images)) {
				for (const img of outputObj.images) collectUrl(img)
			}
			if (isArray(outputObj.image_urls)) {
				for (const u of outputObj.image_urls) collectUrl(u)
			}
			if (isArray(outputObj.results)) {
				for (const r of outputObj.results) collectUrl(r)
			}
			if (outputObj.image) collectUrl(outputObj.image)
			if (outputObj.image_url) collectUrl(outputObj.image_url)
			if (imageUrls.length > 0) return imageUrls
		}
		return []
	}

	const refreshTripo3DTaskItems = async (opts?: { silent?: boolean }) => {
		if (tripo3dTaskRemoteLoading.value) return
		tripo3dTaskRemoteLoading.value = true
		try {
			const res = await options.comfyService.tripo3dTasks({ limit: 120 })
			if (!res.ok) {
				tripo3dTaskRemoteFallbackReason.value = String(res.error || 'unknown')
				if (!opts?.silent)
					options.pushToast(
						t('tasks.tripo3d.taskCenterLoadFailed', { error: String(res.error || 'unknown') }),
						'warn'
					)
				return
			}
			tripo3dTaskRemoteItems.value = Array.isArray(res.items)
				? res.items.map((item: any) => {
						const settings = isRecord(item) ? item : {}
						const mode = String(settings.mode ?? 'text_to_model').trim()
						const taskType = getTripo3DTaskKind(mode)
						const typeLabel =
							taskType === 'image' ? t('tasks.tripo3d.typeImage') : t('tasks.tripo3d.type3d')
						const taskStatus = normalizeStatusForPanel(settings.status)
						const prompt = String(settings.prompt ?? '').trim()
						const progress = Math.max(0, Math.min(100, Number(settings.progress ?? 0)))
						const output = options.pickTripo3DEffectiveOutput(settings)
						const imageUrls = taskType === 'image' ? extractImageUrlsFromRemoteItem(settings) : []
						return {
							id: String(settings.id ?? settings.taskId ?? Math.random().toString()),
							nodeId: String(settings.nodeId ?? '').trim() || undefined,
							title:
								String(settings.title ?? t('tasks.tripo3d.taskNodeTitle')).trim() ||
								t('tasks.tripo3d.taskNodeTitle'),
							taskId: String(settings.taskId ?? '').trim() || undefined,
							mode,
							modeLabel: mapModeLabel(mode),
							taskType,
							typeLabel,
							status: taskStatus,
							statusLabel: mapStatusLabel(taskStatus),
							progress,
							promptPreview: prompt || t('tasks.tripo3d.promptNotFilled'),
							metaText: `${typeLabel} · ${String(settings.statusText ?? settings.status_text ?? '').trim() || mapStatusLabel(taskStatus)}`,
							footnote: String(settings.statusText ?? settings.status_text ?? '').trim(),
							thumbnailUrl:
								output.thumbnailUrl || (imageUrls.length > 0 ? imageUrls[0] : undefined),
							modelUrl: output.modelUrl || undefined,
							imageUrls,
							localAssetUrl: output.localAssetUrl || undefined,
							localAssetPath: output.localAssetPath || undefined,
							createdAt: Number(settings.createdAt ?? Date.now()),
							modelVersion:
								String(settings.modelVersion ?? settings.model_version ?? '').trim() || undefined,
							texture: typeof settings.texture === 'boolean' ? settings.texture : undefined,
							pbr: typeof settings.pbr === 'boolean' ? settings.pbr : undefined,
							faceLimit: Number(settings.faceLimit ?? settings.face_limit ?? 0) || undefined,
							negativePrompt:
								String(settings.negativePrompt ?? settings.negative_prompt ?? '').trim() ||
								undefined,
							statusText:
								String(settings.statusText ?? settings.status_text ?? '').trim() || undefined,
							errorMessage:
								String(settings.errorMessage ?? settings.error_message ?? '').trim() || undefined,
							requestPayload: isRecord(settings.requestPayload)
								? (settings.requestPayload as Record<string, unknown>)
								: undefined,
							responsePayload: isRecord(settings.responsePayload)
								? (settings.responsePayload as Record<string, unknown>)
								: undefined
						}
					})
				: []
			tripo3dTaskRemoteLoaded.value = true
			tripo3dTaskRemoteFallbackReason.value = ''
		} catch (err: unknown) {
			tripo3dTaskRemoteFallbackReason.value = getErrorMessage(err)
			if (!opts?.silent)
				options.pushToast(
					t('tasks.tripo3d.taskCenterLoadFailed', { error: getErrorMessage(err) }),
					'warn'
				)
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
					options.pushToast(
						t('tasks.tripo3d.balanceLoadFailedToast', { error: String(res.error || 'unknown') }),
						'warn'
					)
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
				options.pushToast(
					t('tasks.tripo3d.balanceLoadFailedToast', { error: getErrorMessage(err) }),
					'warn'
				)
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
			const knownIds = [settings.tripo3dTaskId].map((x) => String(x ?? '').trim()).filter(Boolean)
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
			taskType: item.taskType,
			typeLabel: item.typeLabel,
			statusLabel: item.statusLabel,
			progress: item.progress,
			prompt: item.promptPreview,
			negativePrompt: item.negativePrompt,
			statusText: item.statusText,
			errorMessage: item.errorMessage,
			modelUrl: item.modelUrl,
			imageUrls: item.imageUrls,
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
		const taskType = getTripo3DTaskKind(mode)
		const typeLabel =
			taskType === 'image' ? t('tasks.tripo3d.typeImage') : t('tasks.tripo3d.type3d')
		const taskStatus = normalizeStatusForPanel(settings.status)
		const output = options.pickTripo3DEffectiveOutput(settings)
		const imageUrls = taskType === 'image' ? extractImageUrlsFromRemoteItem(settings) : []
		return {
			id: String(settings.id ?? settings.taskId ?? ''),
			title: String(settings.title ?? t('tasks.tripo3d.taskNodeTitle')),
			taskId: String(settings.taskId ?? '').trim() || undefined,
			nodeId: String(settings.nodeId ?? '').trim() || undefined,
			modeLabel: mapModeLabel(mode),
			taskType,
			typeLabel,
			statusLabel: mapStatusLabel(taskStatus),
			progress: Math.max(0, Math.min(100, Number(settings.progress ?? 0))),
			prompt: String(settings.prompt ?? '').trim(),
			negativePrompt:
				String(settings.negativePrompt ?? settings.negative_prompt ?? '').trim() || undefined,
			statusText: String(settings.statusText ?? settings.status_text ?? '').trim() || undefined,
			errorMessage:
				String(settings.errorMessage ?? settings.error_message ?? '').trim() || undefined,
			modelUrl: output.modelUrl || undefined,
			imageUrls,
			assetUrl: output.localAssetUrl || undefined,
			assetPath: output.localAssetPath || undefined,
			thumbnailUrl: output.thumbnailUrl || (imageUrls.length > 0 ? imageUrls[0] : undefined),
			createdAtLabel: settings.createdAt
				? new Date(Number(settings.createdAt)).toLocaleString()
				: undefined,
			updatedAtLabel: settings.updatedAt
				? new Date(Number(settings.updatedAt)).toLocaleString()
				: undefined,
			sourceLabel: t('tasks.tripo3d.remoteTask'),
			modelVersion:
				String(settings.modelVersion ?? settings.model_version ?? '').trim() || undefined,
			texture: typeof settings.texture === 'boolean' ? settings.texture : undefined,
			pbr: typeof settings.pbr === 'boolean' ? settings.pbr : undefined,
			faceLimit: Number(settings.faceLimit ?? settings.face_limit ?? 0) || undefined,
			requestPayload: isRecord(settings.requestPayload)
				? (settings.requestPayload as Record<string, unknown>)
				: undefined,
			responsePayload: isRecord(settings.responsePayload)
				? (settings.responsePayload as Record<string, unknown>)
				: undefined
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
				options.pushToast(
					t('tasks.tripo3d.taskDetailLoadFailed', { error: String(res.error || 'unknown') }),
					'warn'
				)
				return
			}
			tripo3dTaskDetail.value = mapRemoteTaskToDetail(
				isRecord(res.item) ? (res.item as Record<string, unknown>) : {}
			)
		} catch (err: unknown) {
			options.pushToast(
				t('tasks.tripo3d.taskDetailLoadFailed', { error: getErrorMessage(err) }),
				'warn'
			)
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
		const isImageNode =
			node.type === 'image' || isTripo3DImageMode(String(settings.tripo3dTaskFamily ?? ''))
		options.pushToast(
			isImageNode
				? t('tasks.tripo3d.imageDownloadedBound')
				: t('tasks.tripo3d.model3dDownloadedBound'),
			'info'
		)
	}

	const commitTaskStopToNode = (nodeId: string, nodeType: string) => {
		options.stopTripo3DPoll(nodeId)
		if (nodeType === 'model3d') {
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
		} else if (nodeType === 'image') {
			options.store.commit('setNodeImageSettings', {
				nodeId,
				imageSettings: {
					tripo3dImageSettings: {
						taskStatus: 'cancelled',
						statusText: t('tasks.tripo3d.taskStopped'),
						errorMessage: ''
					}
				}
			})
		} else {
			options.store.commit('setNodeTripo3DSettings', {
				nodeId,
				tripo3dSettings: {
					tripo3dTaskStatus: 'cancelled' as const,
					tripo3dStatusText: t('tasks.tripo3d.taskStopped'),
					tripo3dErrorMessage: ''
				}
			})
		}
	}

	const commitTaskDeleteToNode = (nodeId: string, nodeType: string) => {
		options.stopTripo3DPoll(nodeId)
		if (nodeType === 'model3d') {
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
		} else if (nodeType === 'image') {
			options.store.commit('setNodeImageSettings', {
				nodeId,
				imageSettings: {
					tripo3dImageSettings: {
						taskId: undefined,
						taskStatus: 'idle',
						progress: 0,
						statusText: t('tasks.tripo3d.taskDeleted'),
						errorMessage: ''
					}
				}
			})
		} else {
			options.store.commit('setNodeTripo3DSettings', {
				nodeId,
				tripo3dSettings: {
					tripo3dTaskId: undefined,
					tripo3dTaskStatus: 'idle' as const,
					tripo3dProgress: 0,
					tripo3dStatusText: t('tasks.tripo3d.taskDeleted'),
					tripo3dErrorMessage: ''
				}
			})
		}
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
			options.pushToast(
				t('tasks.tripo3d.stopTaskFailed', { error: String(res.error || 'unknown') }),
				'warn'
			)
			return
		}
		commitTaskStopToNode(nodeId, node.type)
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
			options.pushToast(
				t('tasks.tripo3d.deleteTaskFailed', { error: String(res.error || 'unknown') }),
				'warn'
			)
			return
		}
		commitTaskDeleteToNode(nodeId, node.type)
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
		const mode = String(payload?.mode ?? 'text_to_model').trim()
		const taskType = getTripo3DTaskKind(mode)
		tripo3dTaskActionBusyTaskId.value = taskId
		tripo3dTaskActionBusyType.value = payload.action
		try {
			if (payload.action === 'refresh') {
				if (nodeId) {
					const refreshed = await refreshTripo3DTaskToNode(nodeId, taskId)
					if (!refreshed.ok) {
						options.pushToast(
							t('tasks.tripo3d.taskStatusRefreshFailed', { error: refreshed.error }),
							'warn'
						)
					} else {
						options.pushToast(t('tasks.tripo3d.taskStatusRefreshed'), 'info')
					}
				} else {
					const res = await options.comfyService.tripo3dTask(taskId)
					if (!res.ok)
						options.pushToast(
							t('tasks.tripo3d.taskStatusRefreshFailed', { error: String(res.error || 'unknown') }),
							'warn'
						)
				}
			} else if (payload.action === 'import-output') {
				let targetNodeId = nodeId
				let isNewNode = false

				const res = await options.comfyService.tripo3dTask(taskId)
				if (!res.ok) {
					options.pushToast(
						t('tasks.tripo3d.pullArtifactsFailed', { error: String(res.error || 'unknown') }),
						'warn'
					)
					return
				}

				const taskData = isRecord(res) ? (res as Record<string, unknown>) : {}
				const taskStatus = normalizeStatusForPanel(taskData.status)
				if (taskStatus !== 'succeeded') {
					options.pushToast(t('tasks.tripo3d.taskNotCompletedCannotPull'), 'warn')
					return
				}

				const remoteImageUrls = (() => {
					if (isArray(res.imageUrls) && res.imageUrls.length > 0) {
						return res.imageUrls
							.filter((u): u is string => typeof u === 'string' && !!u.trim())
							.map((u) => u.trim())
					}
					return []
				})()

				if (!targetNodeId) {
					if (taskType === 'image') {
						if (typeof options.createImageNodeAtCenter === 'function') {
							const primaryImageUrl =
								remoteImageUrls.length > 0
									? remoteImageUrls[0]
									: String(res.thumbnailUrl ?? '').trim()
							const newNodeId = options.createImageNodeAtCenter(
								primaryImageUrl,
								t('tasks.tripo3d.imageTaskNodeName'),
								{
									taskId,
									mode,
									imageGenerationSource: 'tripo3d',
									imageUrls: remoteImageUrls
								}
							)
							if (newNodeId) {
								targetNodeId = newNodeId
								isNewNode = true
								options.store.commit('setNodeImageSettings', {
									nodeId: newNodeId,
									imageSettings: {
										imageGenerationSource: 'tripo3d',
										tripo3dImageSettings: {
											taskId,
											taskFamily: mode,
											taskStatus: 'pending',
											progress: 0,
											statusText: t('tasks.tripo3d.pullingImageArtifacts')
										}
									}
								})
								options.pushToast(t('tasks.tripo3d.nodeCreatedPullingArtifacts'), 'info')
							}
						}
					} else {
						if (typeof options.createModel3DNodeAtCenter === 'function') {
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
					}
				}

				if (!targetNodeId) {
					options.pushToast(t('tasks.tripo3d.noReceivingNodeFound'), 'warn')
				} else {
					const refreshed = await refreshTripo3DTaskToNode(targetNodeId, taskId)
					if (!refreshed.ok) {
						options.pushToast(
							t('tasks.tripo3d.pullArtifactsFailedGeneric', { error: refreshed.error }),
							'warn'
						)
					} else if (refreshed.finalStatus !== 'success' && refreshed.finalStatus !== 'succeeded') {
						options.pushToast(t('tasks.tripo3d.taskNotCompletedCannotPull'), 'warn')
					} else {
						if (taskType === 'image') {
							options.pushToast(
								isNewNode
									? t('tasks.tripo3d.imagePulledBoundToNewNode')
									: t('tasks.tripo3d.imageDownloadedBound'),
								'info'
							)
						} else {
							options.pushToast(
								isNewNode
									? t('tasks.tripo3d.model3dPulledBoundToNewNode')
									: t('tasks.tripo3d.model3dDownloadedBoundGeneric'),
								'info'
							)
						}
					}
				}
			} else if (payload.action === 'stop') {
				const res = await options.comfyService.tripo3dStop(taskId)
				if (!res.ok) {
					options.pushToast(
						t('tasks.tripo3d.taskActionFailed', {
							action: t('tasks.tripo3d.stop'),
							error: String(res.error || 'unknown')
						}),
						'warn'
					)
				} else {
					if (nodeId) {
						const node = options.store.state.nodesById[nodeId]
						commitTaskStopToNode(nodeId, node?.type || 'model3d')
					}
					options.pushToast(
						t('tasks.tripo3d.taskActionPerformed', { action: t('tasks.tripo3d.stop') }),
						'info'
					)
				}
			} else if (payload.action === 'delete') {
				const res = await options.comfyService.tripo3dDelete(taskId)
				if (!res.ok) {
					options.pushToast(
						t('tasks.tripo3d.taskActionFailed', {
							action: t('tasks.tripo3d.delete'),
							error: String(res.error || 'unknown')
						}),
						'warn'
					)
				} else {
					if (nodeId) {
						const node = options.store.state.nodesById[nodeId]
						commitTaskDeleteToNode(nodeId, node?.type || 'model3d')
					}
					options.pushToast(
						t('tasks.tripo3d.taskActionPerformed', { action: t('tasks.tripo3d.delete') }),
						'info'
					)
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
