import { computed, onBeforeUnmount, ref, type Ref } from 'vue'
import type { ArkTaskPanelDetail, ArkTaskPanelItem } from '../../../../ui/WorkFlow/ArkTaskPanel.vue'
import { getErrorMessage, isRecord } from '../../../../types/utils'

interface ArkRawTask {
	id: string
	taskId: string
	apiType: string
	apiAction: string
	model: string
	status: string
	statusLabel: string
	prompt: string
	negativePrompt: string
	resultUrls: string | string[]
	resultText: string
	thumbnailUrl: string
	errorMessage: string
	statusText: string
	projectId: number | null
	nodeId: string
	remoteTaskId: string
	requestPayload: string | null
	responsePayload: string | null
	createdAt: number | string
	updatedAt: number | string
}

interface ArkApi {
	listTasks(payload?: { projectId?: number | null }): Promise<{ ok: boolean; tasks?: ArkRawTask[]; error?: string }>
	getTaskDetail(payload: { taskId: string }): Promise<{ ok: boolean; task?: ArkRawTask; error?: string }>
	deleteTask(payload: { taskId: string }): Promise<{ ok: boolean; error?: string }>
}

const STATUS_LABEL_MAP: Record<string, string> = {
	queued: '排队中',
	running: '运行中',
	succeeded: '已完成',
	failed: '失败',
	canceled: '已取消'
}

const normalizeStatus = (raw: string): ArkTaskPanelItem['status'] => {
	const value = String(raw ?? '').trim().toLowerCase()
	if (value === 'queued') return 'queued'
	if (value === 'running' || value === 'processing') return 'running'
	if (value === 'succeeded' || value === 'success' || value === 'completed') return 'succeeded'
	if (value === 'failed' || value === 'error') return 'failed'
	if (value === 'canceled' || value === 'cancelled') return 'canceled'
	return 'queued'
}

const normalizeStatusLabel = (status: string, rawLabel: string): string => {
	const label = String(rawLabel ?? '').trim()
	if (label) return label
	return STATUS_LABEL_MAP[normalizeStatus(status)] ?? '未知'
}

const parseJsonField = (value: unknown): Record<string, unknown> | null => {
	if (isRecord(value)) return value
	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value)
			return isRecord(parsed) ? parsed : null
		} catch {
			return null
		}
	}
	return null
}

const parseStringArray = (value: unknown): string[] => {
	if (Array.isArray(value)) return value.map((v) => String(v ?? '').trim()).filter(Boolean)
	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value)
			if (Array.isArray(parsed)) return parsed.map((v: unknown) => String(v ?? '').trim()).filter(Boolean)
		} catch {
			return value.trim() ? [value.trim()] : []
		}
	}
	return []
}

const mapRawTaskToPanelItem = (raw: ArkRawTask): ArkTaskPanelItem => {
	const status = normalizeStatus(raw.status)
	const resultUrls = parseStringArray(raw.resultUrls)
	const thumbnailUrl = String(raw.thumbnailUrl ?? '').trim() || (resultUrls.length > 0 ? resultUrls[0] : '')
	return {
		id: String(raw.id ?? raw.taskId ?? '').trim(),
		taskId: String(raw.taskId ?? raw.id ?? '').trim(),
		apiType: String(raw.apiType ?? '').trim(),
		apiAction: String(raw.apiAction ?? '').trim(),
		model: String(raw.model ?? '').trim(),
		status,
		statusLabel: normalizeStatusLabel(raw.status, raw.statusLabel),
		prompt: String(raw.prompt ?? '').trim(),
		resultUrls,
		resultText: String(raw.resultText ?? '').trim(),
		thumbnailUrl,
		errorMessage: String(raw.errorMessage ?? '').trim(),
		statusText: String(raw.statusText ?? '').trim(),
		projectId: raw.projectId != null ? Number(raw.projectId) : null,
		nodeId: String(raw.nodeId ?? '').trim(),
		createdAt: Number(raw.createdAt) || Date.now(),
		updatedAt: Number(raw.updatedAt) || Date.now()
	}
}

const mapRawTaskToDetail = (raw: ArkRawTask): ArkTaskPanelDetail => {
	const resultUrls = parseStringArray(raw.resultUrls)
	const thumbnailUrl = String(raw.thumbnailUrl ?? '').trim() || (resultUrls.length > 0 ? resultUrls[0] : '')
	return {
		id: String(raw.id ?? raw.taskId ?? '').trim(),
		taskId: String(raw.taskId ?? raw.id ?? '').trim(),
		apiType: String(raw.apiType ?? '').trim(),
		apiAction: String(raw.apiAction ?? '').trim(),
		model: String(raw.model ?? '').trim(),
		status: normalizeStatus(raw.status),
		statusLabel: normalizeStatusLabel(raw.status, raw.statusLabel),
		prompt: String(raw.prompt ?? '').trim(),
		negativePrompt: String(raw.negativePrompt ?? '').trim(),
		resultUrls,
		resultText: String(raw.resultText ?? '').trim(),
		thumbnailUrl,
		errorMessage: String(raw.errorMessage ?? '').trim(),
		statusText: String(raw.statusText ?? '').trim(),
		projectId: raw.projectId != null ? Number(raw.projectId) : null,
		nodeId: String(raw.nodeId ?? '').trim(),
		remoteTaskId: String(raw.remoteTaskId ?? '').trim(),
		createdAt: Number(raw.createdAt) || Date.now(),
		updatedAt: Number(raw.updatedAt) || Date.now(),
		requestPayload: parseJsonField(raw.requestPayload),
		responsePayload: parseJsonField(raw.responsePayload)
	}
}

const getArkApi = (): ArkApi | null => {
	const dweb = (window as unknown as Record<string, unknown>).dweb
	if (!isRecord(dweb)) return null
	if (!isRecord(dweb.ark)) return null
	return dweb.ark as unknown as ArkApi
}

export const useAIWorkflowArkTaskPanel = (projectId: Ref<number | null>) => {
	const arkTaskDialogOpen = ref(false)
	const arkTaskItems = ref<ArkTaskPanelItem[]>([])
	const arkTaskRefreshBusy = ref(false)
	const arkTaskDetail = ref<ArkTaskPanelDetail | null>(null)
	const arkTaskDetailTaskId = ref('')
	const arkTaskDetailLoading = ref(false)
	const arkTaskLoaded = ref(false)
	const arkTaskFallbackReason = ref('')

	let refreshTimer: ReturnType<typeof setInterval> | null = null

	const refreshArkTaskItems = async (opts?: { silent?: boolean }) => {
		if (arkTaskRefreshBusy.value) return
		arkTaskRefreshBusy.value = true
		try {
			const api = getArkApi()
			if (!api) {
				arkTaskFallbackReason.value = 'ARK API 不可用'
				if (!opts?.silent) {
					console.warn('[ARK Task Panel] ARK API 不可用')
				}
				return
			}
			const result = await api.listTasks({ projectId: projectId.value })
			if (result.ok && Array.isArray(result.tasks)) {
				arkTaskItems.value = result.tasks.map((raw) => mapRawTaskToPanelItem(raw))
			} else {
				arkTaskItems.value = []
				if (result.error) {
					arkTaskFallbackReason.value = result.error
				}
			}
			arkTaskLoaded.value = true
			arkTaskFallbackReason.value = ''
		} catch (err: unknown) {
			arkTaskFallbackReason.value = getErrorMessage(err)
			if (!opts?.silent) {
				console.warn('[ARK Task Panel] 刷新任务列表失败：' + getErrorMessage(err))
			}
		} finally {
			arkTaskRefreshBusy.value = false
		}
	}

	const getArkTaskDetail = async (taskId: string) => {
		const id = String(taskId ?? '').trim()
		if (!id) return
		arkTaskDetailTaskId.value = id
		arkTaskDetailLoading.value = true
		try {
			const api = getArkApi()
			if (!api) {
				console.warn('[ARK Task Panel] ARK API 不可用')
				return
			}
			const result = await api.getTaskDetail({ taskId: id })
			if (result.ok && result.task) {
				arkTaskDetail.value = mapRawTaskToDetail(result.task)
			}
		} catch (err: unknown) {
			console.warn('[ARK Task Panel] 获取任务详情失败：' + getErrorMessage(err))
		} finally {
			arkTaskDetailLoading.value = false
		}
	}

	const deleteArkTask = async (taskId: string) => {
		const id = String(taskId ?? '').trim()
		if (!id) return
		try {
			const api = getArkApi()
			if (!api) {
				console.warn('[ARK Task Panel] ARK API 不可用')
				return
			}
			const result = await api.deleteTask({ taskId: id })
			if (!result.ok) {
				throw new Error(result.error || '删除失败')
			}
			await refreshArkTaskItems({ silent: true })
		} catch (err: unknown) {
			console.warn('[ARK Task Panel] 删除任务失败：' + getErrorMessage(err))
			throw err
		}
	}

	const openArkTaskDialog = () => {
		arkTaskDialogOpen.value = true
		void refreshArkTaskItems({ silent: true })
		startAutoRefresh()
	}

	const closeArkTaskDialog = () => {
		arkTaskDialogOpen.value = false
		arkTaskDetail.value = null
		arkTaskDetailTaskId.value = ''
		arkTaskDetailLoading.value = false
		stopAutoRefresh()
	}

	const onRefreshArkTaskPanel = async () => {
		await refreshArkTaskItems({ silent: false })
	}

	const onPreviewArkTask = async (taskId: string) => {
		await getArkTaskDetail(taskId)
	}

	const onArkTaskPanelAction = async (payload: {
		taskId: string
		action: 'delete' | 'view-detail'
	}) => {
		const taskId = String(payload?.taskId ?? '').trim()
		if (!taskId) return

		if (payload.action === 'delete') {
			try {
				await deleteArkTask(taskId)
			} catch {
				// error already logged in deleteArkTask
			}
		} else if (payload.action === 'view-detail') {
			await getArkTaskDetail(taskId)
		}
	}

	const startAutoRefresh = () => {
		stopAutoRefresh()
		refreshTimer = setInterval(() => {
			if (arkTaskDialogOpen.value) {
				void refreshArkTaskItems({ silent: true })
			}
		}, 15_000)
	}

	const stopAutoRefresh = () => {
		if (refreshTimer !== null) {
			clearInterval(refreshTimer)
			refreshTimer = null
		}
	}

	onBeforeUnmount(() => {
		stopAutoRefresh()
	})

	const dataStatusText = computed(() => {
		if (arkTaskRefreshBusy.value && !arkTaskLoaded.value) {
			return '正在加载 ARK 任务列表...'
		}
		if (arkTaskLoaded.value) {
			return '当前展示 ARK 任务列表，可直接拖拽到蓝图复用。'
		}
		if (arkTaskFallbackReason.value) {
			return `加载失败：${arkTaskFallbackReason.value}`
		}
		return '打开面板后会自动加载 ARK 任务列表。'
	})

	return {
		arkTaskDialogOpen,
		arkTaskItems,
		arkTaskRefreshBusy,
		arkTaskDetail,
		arkTaskDetailTaskId,
		arkTaskDetailLoading,
		arkTaskDataStatusText: dataStatusText,
		openArkTaskDialog,
		closeArkTaskDialog,
		onRefreshArkTaskPanel,
		onPreviewArkTask,
		onArkTaskPanelAction,
		refreshArkTaskItems,
		getArkTaskDetail,
		deleteArkTask
	}
}