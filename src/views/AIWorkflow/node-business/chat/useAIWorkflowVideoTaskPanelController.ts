import { computed, ref } from 'vue'
import type { VideoTaskPanelItem } from '../../../../ui/WorkFlow/VideoTaskPanel.vue'
import type { SeedanceTaskMirrorItem } from '../../../../network/ComfyUIBridgeService'
import { resolveBackendUrl } from '../../../../network/backendConfig'
import { getErrorMessage } from '../../../../types/utils'

const mapVideoTaskItem = (item: SeedanceTaskMirrorItem): VideoTaskPanelItem => ({
	taskId: String(item.taskId || '').trim(),
	model: String(item.model || '').trim(),
	status: String(item.status || '').trim(),
	prompt: String(item.prompt || '').trim(),
	ratio: String(item.ratio || '').trim(),
	resolution: String(item.resolution || '').trim(),
	duration: Number(item.duration || 0) || 0,
	generateAudio: !!item.generateAudio,
	cameraFixed: !!item.cameraFixed,
	statusText: String(item.statusText || '').trim(),
	errorMessage: String(item.errorMessage || '').trim(),
	videoUrlLocal: resolveBackendUrl(String(item.videoUrlLocal || '').trim()),
	videoUrlRemote: resolveBackendUrl(String(item.videoUrlRemote || '').trim()),
	lastFrameUrlLocal: resolveBackendUrl(String(item.lastFrameUrlLocal || '').trim()),
	lastFrameUrlRemote: resolveBackendUrl(String(item.lastFrameUrlRemote || '').trim()),
	updatedAt: String(item.updatedAt || '').trim(),
	syncedAt: String(item.syncedAt || '').trim()
})

const isSucceededVideoTask = (item: VideoTaskPanelItem | null | undefined) => {
	const status = String(item?.status || '')
		.trim()
		.toLowerCase()
	return status === 'succeeded' || status === 'success'
}

type SeedanceTaskListResult = { ok: boolean; error?: string; items?: SeedanceTaskMirrorItem[] }
type SeedanceTaskDetailResult = { ok: boolean; error?: string; item?: SeedanceTaskMirrorItem }
type SeedanceSyncResult = { ok: boolean; error?: string; item?: SeedanceTaskMirrorItem }

export const useAIWorkflowVideoTaskPanelController = (options: {
	comfyService: {
		seedanceTasks: (query?: { status?: string; model?: string; limit?: number }) => Promise<SeedanceTaskListResult>
		seedanceTaskDetail: (taskId: string) => Promise<SeedanceTaskDetailResult>
		seedanceSyncTasks: (payload?: {
			taskId?: string
			pageNum?: number
			pageSize?: number
			projectId?: number
			saveMedia?: boolean
		}) => Promise<SeedanceSyncResult>
	}
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	getCurrentProjectId: () => number | null
}) => {
	const videoTaskDialogOpen = ref(false)
	const videoTaskItems = ref<VideoTaskPanelItem[]>([])
	const videoTaskLoading = ref(false)
	const videoTaskSyncing = ref(false)
	const videoTaskLoaded = ref(false)
	const videoTaskFallbackReason = ref('')
	const videoTaskDetail = ref<VideoTaskPanelItem | null>(null)
	const videoTaskDetailTaskId = ref('')
	const videoTaskDetailLoading = ref(false)
	const videoTaskRecoveringIds = new Set<string>()

	const patchTaskItem = (nextItem: VideoTaskPanelItem | null | undefined) => {
		if (!nextItem?.taskId) return
		const taskId = String(nextItem.taskId || '').trim()
		if (!taskId) return
		videoTaskItems.value = videoTaskItems.value.map((item) =>
			item.taskId === taskId ? { ...item, ...nextItem } : item
		)
	}

	const ensureLocalMediaForTask = async (
		item: VideoTaskPanelItem | null | undefined,
		opts?: { silent?: boolean }
	) => {
		if (!item || !isSucceededVideoTask(item)) return item ?? null
		if (String(item.videoUrlLocal || '').trim()) return item
		if (!String(item.videoUrlRemote || '').trim()) return item
		const projectId = options.getCurrentProjectId()
		try {
			const res = await options.comfyService.seedanceSyncTasks({
				taskId: item.taskId,
				projectId: projectId ?? undefined,
				saveMedia: true
			})
			if (!res.ok || !res.item) {
				if (!opts?.silent)
					options.pushToast('视频任务本地补存失败：' + String(res.error || 'unknown'), 'warn')
				return item
			}
			const nextItem = mapVideoTaskItem(res.item as SeedanceTaskMirrorItem)
			patchTaskItem(nextItem)
			return nextItem
		} catch (err: unknown) {
			if (!opts?.silent) options.pushToast('视频任务本地补存失败：' + getErrorMessage(err), 'warn')
			return item
		}
	}

	const videoTaskPanelStatusText = computed(() => {
		if (videoTaskLoading.value && !videoTaskLoaded.value) return '正在读取本地 Django 视频任务镜像…'
		if (videoTaskSyncing.value) return '正在从火山远端补齐任务列表，并同步回本地数据库…'
		if (videoTaskFallbackReason.value) return `任务中心读取失败：${videoTaskFallbackReason.value}`
		return '当前展示本地 Seedance 任务镜像；点击“远端补齐”会拉取最近 7 天远端任务。'
	})

	const refreshVideoTaskItems = async (opts?: { silent?: boolean }) => {
		if (videoTaskLoading.value) return
		videoTaskLoading.value = true
		try {
			const res = await options.comfyService.seedanceTasks({ limit: 120 })
			if (!res.ok) {
				videoTaskFallbackReason.value = String(res.error || 'unknown')
				if (!opts?.silent)
					options.pushToast('读取视频任务列表失败：' + String(res.error || 'unknown'), 'warn')
				return
			}
			videoTaskItems.value = Array.isArray(res.items)
				? res.items.map((item: SeedanceTaskMirrorItem) => mapVideoTaskItem(item))
				: []
			videoTaskLoaded.value = true
			videoTaskFallbackReason.value = ''
			if (!videoTaskDetailTaskId.value && videoTaskItems.value.length) {
				void selectVideoTask(videoTaskItems.value[0].taskId, { silent: true })
			}
		} catch (err: unknown) {
			videoTaskFallbackReason.value = getErrorMessage(err)
			if (!opts?.silent) options.pushToast('读取视频任务列表失败：' + getErrorMessage(err), 'warn')
		} finally {
			videoTaskLoading.value = false
		}
	}

	const selectVideoTask = async (taskId: string, opts?: { silent?: boolean }) => {
		const nextTaskId = String(taskId || '').trim()
		if (!nextTaskId) return
		videoTaskDetailTaskId.value = nextTaskId
		videoTaskDetailLoading.value = true
		try {
			const res = await options.comfyService.seedanceTaskDetail(nextTaskId)
			if (!res.ok) {
				if (!opts?.silent)
					options.pushToast('读取视频任务详情失败：' + String(res.error || 'unknown'), 'warn')
				return
			}
			const mapped = res.item ? mapVideoTaskItem(res.item as SeedanceTaskMirrorItem) : null
			videoTaskDetail.value = await ensureLocalMediaForTask(mapped, opts)
			patchTaskItem(videoTaskDetail.value)
		} catch (err: unknown) {
			if (!opts?.silent) options.pushToast('读取视频任务详情失败：' + getErrorMessage(err), 'warn')
		} finally {
			videoTaskDetailLoading.value = false
		}
	}

	const syncRemoteVideoTasks = async () => {
		if (videoTaskSyncing.value) return
		videoTaskSyncing.value = true
		try {
			const projectId = options.getCurrentProjectId()
			const res = await options.comfyService.seedanceSyncTasks({
				pageNum: 1,
				pageSize: 60,
				projectId: projectId ?? undefined,
				saveMedia: false
			})
			if (!res.ok) {
				options.pushToast('远端补齐视频任务失败：' + String(res.error || 'unknown'), 'warn')
				return
			}
			await refreshVideoTaskItems({ silent: true })
			if (videoTaskDetailTaskId.value) {
				await selectVideoTask(videoTaskDetailTaskId.value, { silent: true })
			}
			options.pushToast('已从远端补齐视频任务列表。', 'info')
		} catch (err: unknown) {
			options.pushToast('远端补齐视频任务失败：' + getErrorMessage(err), 'warn')
		} finally {
			videoTaskSyncing.value = false
		}
	}

	const recoverVideoTaskMedia = async (taskId: string) => {
		const nextTaskId = String(taskId || '').trim()
		if (!nextTaskId || videoTaskRecoveringIds.has(nextTaskId)) return
		videoTaskRecoveringIds.add(nextTaskId)
		try {
			const projectId = options.getCurrentProjectId()
			const res = await options.comfyService.seedanceSyncTasks({
				taskId: nextTaskId,
				projectId: projectId ?? undefined,
				saveMedia: true
			})
			if (res.ok && res.item) {
				const nextItem = mapVideoTaskItem(res.item as SeedanceTaskMirrorItem)
				patchTaskItem(nextItem)
			}
			await selectVideoTask(nextTaskId, { silent: true })
		} catch {
			// ignore auto recovery failures; panel keeps current state
		} finally {
			videoTaskRecoveringIds.delete(nextTaskId)
		}
	}

	const openVideoTaskDialog = () => {
		videoTaskDialogOpen.value = true
		void refreshVideoTaskItems({ silent: true })
	}

	const closeVideoTaskDialog = () => {
		videoTaskDialogOpen.value = false
	}

	const onVideoTaskDialogOpenChanged = (open: boolean) => {
		if (!open) return
		void refreshVideoTaskItems({ silent: true })
	}

	return {
		videoTaskDialogOpen,
		videoTaskItems,
		videoTaskLoading,
		videoTaskSyncing,
		videoTaskDetail,
		videoTaskDetailTaskId,
		videoTaskDetailLoading,
		videoTaskPanelStatusText,
		openVideoTaskDialog,
		closeVideoTaskDialog,
		refreshVideoTaskItems,
		syncRemoteVideoTasks,
		recoverVideoTaskMedia,
		selectVideoTask,
		onVideoTaskDialogOpenChanged
	}
}
