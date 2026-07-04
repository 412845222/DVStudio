import { computed, onBeforeUnmount, ref, type Ref } from 'vue'
import type { ArkTaskPanelDetail, ArkTaskPanelItem } from '../../../../ui/WorkFlow/ArkTaskPanel.vue'
import type {
	SeedanceDownloadAssetResponse,
	SeedanceListAllRemoteResponse,
	SeedanceTaskDetailRemoteResponse,
	SeedanceTaskMirrorItem
} from '../../../../network/ComfyUIBridgeService'
import { getErrorMessage, isRecord } from '../../../../types/utils'
import { openFolderForPath } from '../../../../electronBridge'

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
	resourceAvailable?: boolean
	resourceUnavailableReason?: string
}

interface ArkApi {
	listTasks(payload?: { projectId?: number | null }): Promise<{ ok: boolean; tasks?: ArkRawTask[]; error?: string }>
	getTaskDetail(payload: { taskId: string }): Promise<{ ok: boolean; task?: ArkRawTask; error?: string }>
	deleteTask(payload: { taskId: string }): Promise<{ ok: boolean; error?: string }>
}

interface SeedanceApi {
	taskDetailRemote(payload: { taskId: string; projectId?: number }): Promise<SeedanceTaskDetailRemoteResponse>
	downloadAsset(payload: {
		taskId: string
		projectId: number
		kind?: 'video' | 'lastFrame'
		name?: string
	}): Promise<SeedanceDownloadAssetResponse>
	listAllRemote(payload?: {
		pageNum?: number
		pageSize?: number
		status?: string
		model?: string
	}): Promise<SeedanceListAllRemoteResponse>
}

const STATUS_LABEL_MAP: Record<string, string> = {
	queued: '排队中',
	running: '运行中',
	succeeded: '已完成',
	failed: '失败',
	canceled: '已取消',
	not_found: '已删除'
}

const normalizeStatus = (raw: string): ArkTaskPanelItem['status'] => {
	const value = String(raw ?? '').trim().toLowerCase()
	if (value === 'queued') return 'queued'
	if (value === 'running' || value === 'processing') return 'running'
	if (value === 'succeeded' || value === 'success' || value === 'completed') return 'succeeded'
	if (value === 'failed' || value === 'error') return 'failed'
	if (value === 'canceled' || value === 'cancelled') return 'canceled'
	if (value === 'not_found') return 'canceled'
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

const seedanceItemToArkTask = (item: SeedanceTaskMirrorItem): ArkRawTask => {
	const status = String(item.status || 'queued').trim().toLowerCase()
	const resultUrls: string[] = []
	if (item.videoUrlRemote) resultUrls.push(item.videoUrlRemote)
	if (item.lastFrameUrlRemote) resultUrls.push(item.lastFrameUrlRemote)
	return {
		id: String(item.taskId || '').trim(),
		taskId: `seedance-${item.taskId}`,
		apiType: 'seedance',
		apiAction: 'video_generation',
		model: String(item.model || '').trim(),
		status,
		statusLabel: '',
		prompt: String(item.prompt || '').trim(),
		negativePrompt: '',
		resultUrls,
		resultText: '',
		thumbnailUrl: String(item.lastFrameUrlRemote || item.videoUrlRemote || '').trim(),
		errorMessage: String(item.errorMessage || '').trim(),
		statusText: String(item.statusText || '').trim(),
		projectId: item.projectId ?? null,
		nodeId: '',
		remoteTaskId: String(item.taskId || '').trim(),
		requestPayload: null,
		responsePayload: null,
		createdAt: new Date(item.createdAt || Date.now()).getTime(),
		updatedAt: new Date(item.updatedAt || Date.now()).getTime()
	}
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
		updatedAt: Number(raw.updatedAt) || Date.now(),
		resourceAvailable: raw.resourceAvailable,
		resourceUnavailableReason: raw.resourceUnavailableReason ?? ''
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
		responsePayload: parseJsonField(raw.responsePayload),
		resourceAvailable: raw.resourceAvailable,
		resourceUnavailableReason: raw.resourceUnavailableReason ?? ''
	}
}

const getArkApi = (): ArkApi | null => {
	const dweb = (window as unknown as Record<string, unknown>).dweb
	if (!isRecord(dweb)) return null
	if (!isRecord(dweb.ark)) return null
	return dweb.ark as unknown as ArkApi
}

const getSeedanceApi = (): SeedanceApi | null => {
	const dweb = (window as unknown as Record<string, unknown>).dweb
	if (!isRecord(dweb)) return null
	if (!isRecord(dweb.seedance)) return null
	return dweb.seedance as unknown as SeedanceApi
}

type DownloadResult = {
	ok: boolean
	url?: string
	sourcePath?: string
	projectRelativePath?: string
	error?: string
}

export type ArkTaskPanelPushToastOptions = {
	persistent?: boolean
	actions?: Array<{ label: string; onClick?: () => void }>
}

export const useAIWorkflowArkTaskPanel = (
	projectId: Ref<number | null>,
	options?: {
		comfyService?: {
			seedanceTaskDetailRemote: (payload: { taskId: string; projectId?: number }) => Promise<SeedanceTaskDetailRemoteResponse>
			seedanceDownloadAsset: (payload: {
				taskId: string
				projectId: number
				kind?: 'video' | 'lastFrame'
				name?: string
			}) => Promise<SeedanceDownloadAssetResponse>
			seedanceListAllRemote: (payload?: {
				pageNum?: number
				pageSize?: number
				status?: string
				model?: string
			}) => Promise<SeedanceListAllRemoteResponse>
		}
		pushToast?: (message: string, tone?: 'info' | 'warn' | 'error', opts?: ArkTaskPanelPushToastOptions) => void
		findVideoNodeByTaskId?: (remoteTaskId: string) => { nodeId: string } | null
		bindVideoResultToNode?: (nodeId: string, url: string) => boolean | void | Promise<boolean | void>
		createMediaNodeWithAsset?: (url: string, kind: 'image' | 'video', prompt?: string) => string | Promise<string>
	}
) => {
	const arkTaskDialogOpen = ref(false)
	const arkTaskItems = ref<ArkTaskPanelItem[]>([])
	const arkTaskRefreshBusy = ref(false)
	const arkTaskDetail = ref<ArkTaskPanelDetail | null>(null)
	const arkTaskDetailTaskId = ref('')
	const arkTaskDetailLoading = ref(false)
	const arkTaskLoaded = ref(false)
	const arkTaskFallbackReason = ref('')
	const arkTaskDownloading = ref<Set<string>>(new Set())

	let refreshTimer: ReturnType<typeof setInterval> | null = null

	const pushMsg = (
		msg: string,
		tone: 'info' | 'warn' | 'error' = 'info',
		opts?: ArkTaskPanelPushToastOptions
	) => {
		if (typeof options?.pushToast === 'function') {
			options.pushToast(msg, tone, opts)
		} else {
			console.log(`[ARK Task Panel] [${tone}] ${msg}`)
		}
	}

	const patchTaskItem = (taskId: string, patch: Partial<ArkTaskPanelItem>) => {
		const id = String(taskId || '').trim()
		if (!id) return
		arkTaskItems.value = arkTaskItems.value.map((item) =>
			item.taskId === id || item.id === id ? { ...item, ...patch } : item
		)
	}

	const refreshArkTaskItems = async (opts?: { silent?: boolean }) => {
		if (arkTaskRefreshBusy.value) return
		arkTaskRefreshBusy.value = true
		try {
			const seedanceApi = getSeedanceApi()
			const comfySvc = options?.comfyService

			let seedanceItems: SeedanceTaskMirrorItem[] = []

			if (comfySvc?.seedanceListAllRemote) {
				const res = await comfySvc.seedanceListAllRemote({ pageSize: 60 })
				if (res.ok && Array.isArray(res.items)) {
					seedanceItems = res.items
				} else if (!opts?.silent) {
					console.warn('[ARK Task Panel] seedance list remote failed:', (res as any)?.error)
				}
			} else if (seedanceApi?.listAllRemote) {
				const res = await seedanceApi.listAllRemote({ pageSize: 60 })
				if (res.ok && Array.isArray(res.items)) {
					seedanceItems = res.items as SeedanceTaskMirrorItem[]
				}
			}

			const arkApi = getArkApi()
			let arkTasks: ArkRawTask[] = []
			if (arkApi) {
				const result = await arkApi.listTasks({ projectId: null })
				if (result.ok && Array.isArray(result.tasks)) {
					arkTasks = result.tasks
				}
			}

			const seen = new Set<string>()
			const merged: ArkRawTask[] = []

			for (const item of seedanceItems) {
				const raw = seedanceItemToArkTask(item)
				const key = raw.taskId
				if (!seen.has(key)) {
					seen.add(key)
					merged.push(raw)
				}
			}

			for (const t of arkTasks) {
				const key = String(t.taskId || t.id || '').trim()
				if (!key) continue
				if (seen.has(key)) continue
				seen.add(key)
				merged.push(t)
			}

			merged.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
			arkTaskItems.value = merged.map((raw) => mapRawTaskToPanelItem(raw))

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
			const comfySvc = options?.comfyService
			const seedanceApi = getSeedanceApi()
			const arkApi = getArkApi()

			const isSeedance = id.startsWith('seedance-') || String((arkTaskItems.value.find((t) => t.taskId === id)?.apiType) || '').trim() === 'seedance'

			let rawDetail: ArkRawTask | null = null

			if (isSeedance) {
				const remoteTaskId = id.replace(/^seedance-/, '')
				const pid = projectId.value ?? undefined
				let res: SeedanceTaskDetailRemoteResponse | null = null

				if (comfySvc?.seedanceTaskDetailRemote) {
					res = await comfySvc.seedanceTaskDetailRemote({ taskId: remoteTaskId, projectId: pid })
				} else if (seedanceApi?.taskDetailRemote) {
					res = await seedanceApi.taskDetailRemote({ taskId: remoteTaskId, projectId: pid })
				}

				if (res && res.ok && res.item) {
					rawDetail = seedanceItemToArkTask(res.item)
					rawDetail.resourceAvailable = res.resourceAvailable
					rawDetail.resourceUnavailableReason = res.resourceUnavailableReason
				} else if (res && !res.ok) {
					rawDetail = {
						id: id,
						taskId: id,
						apiType: 'seedance',
						apiAction: 'video_generation',
						model: '',
						status: 'not_found',
						statusLabel: '',
						prompt: '',
						negativePrompt: '',
						resultUrls: [],
						resultText: '',
						thumbnailUrl: '',
						errorMessage: res.error || '查询失败',
						statusText: res.error || '查询失败',
						projectId: projectId.value ?? null,
						nodeId: '',
						remoteTaskId: remoteTaskId,
						requestPayload: null,
						responsePayload: null,
						createdAt: Date.now(),
						updatedAt: Date.now(),
						resourceAvailable: false,
						resourceUnavailableReason: res.error || '查询失败'
					}
				}
			}

			if (!rawDetail && arkApi) {
				const result = await arkApi.getTaskDetail({ taskId: id })
				if (result.ok && result.task) {
					rawDetail = result.task
				}
			}

			if (rawDetail) {
				const detail = mapRawTaskToDetail(rawDetail)
				arkTaskDetail.value = detail
				patchTaskItem(id, {
					status: normalizeStatus(detail.status),
					statusLabel: detail.statusLabel,
					statusText: detail.statusText,
					errorMessage: detail.errorMessage,
					resultUrls: detail.resultUrls,
					thumbnailUrl: detail.thumbnailUrl,
					resourceAvailable: detail.resourceAvailable,
					resourceUnavailableReason: detail.resourceUnavailableReason
				})
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
			const arkApi = getArkApi()
			if (!arkApi) {
				console.warn('[ARK Task Panel] ARK API 不可用')
				return
			}
			const result = await arkApi.deleteTask({ taskId: id })
			if (!result.ok) {
				throw new Error(result.error || '删除失败')
			}
			await refreshArkTaskItems({ silent: true })
		} catch (err: unknown) {
			console.warn('[ARK Task Panel] 删除任务失败：' + getErrorMessage(err))
			throw err
		}
	}

	const downloadArkTaskAsset = async (
		taskId: string,
		kind: 'video' | 'lastFrame' = 'video'
	): Promise<DownloadResult> => {
		const id = String(taskId || '').trim()
		if (!id) return { ok: false, error: 'taskId is required' }
		const pid = projectId.value
		if (!pid) {
			pushMsg('当前项目未激活，无法下载资产。', 'warn')
			return { ok: false, error: 'project not active' }
		}

		const downloading = new Set(arkTaskDownloading.value)
		downloading.add(id)
		arkTaskDownloading.value = downloading

		try {
			const comfySvc = options?.comfyService
			const seedanceApi = getSeedanceApi()

			const isSeedance = id.startsWith('seedance-')
			if (!isSeedance) {
				pushMsg('当前仅支持 Seedance 视频任务的产物下载。', 'warn')
				return { ok: false, error: 'unsupported api type' }
			}

			const remoteTaskId = id.replace(/^seedance-/, '')
			let res: SeedanceDownloadAssetResponse | null = null

			if (comfySvc?.seedanceDownloadAsset) {
				res = await comfySvc.seedanceDownloadAsset({
					taskId: remoteTaskId,
					projectId: pid,
					kind
				})
			} else if (seedanceApi?.downloadAsset) {
				res = await seedanceApi.downloadAsset({
					taskId: remoteTaskId,
					projectId: pid,
					kind
				})
			}

			if (!res) {
				pushMsg('下载功能不可用。', 'error')
				return { ok: false, error: 'download api not available' }
			}

			if (!res.ok) {
				pushMsg('下载失败：' + String(res.error || 'unknown'), 'error')
				return { ok: false, error: res.error }
			}

			const successMsg = kind === 'lastFrame' ? '首帧图片下载成功。' : '视频文件下载成功。'
			const folderPath = res.sourcePath || res.projectRelativePath
			if (folderPath) {
				pushMsg(successMsg, 'info', {
					persistent: true,
					actions: [
						{
							label: '打开文件夹',
							onClick: () => {
								try {
									openFolderForPath(folderPath)
								} catch (e) {
									console.error('[ARK Task Panel] open folder error:', e)
								}
							}
						}
					]
				})
			} else {
				pushMsg(successMsg, 'info')
			}
			return {
				ok: true,
				url: res.url,
				sourcePath: res.sourcePath,
				projectRelativePath: res.projectRelativePath
			}
		} catch (err: unknown) {
			const msg = getErrorMessage(err)
			pushMsg('下载异常：' + msg, 'error')
			return { ok: false, error: msg }
		} finally {
			const next = new Set(arkTaskDownloading.value)
			next.delete(id)
			arkTaskDownloading.value = next
		}
	}

	const importAssetToNode = async (taskId: string, kind: 'video' | 'lastFrame' = 'video') => {
		const id = String(taskId || '').trim()
		if (!id) return false
		const pid = projectId.value
		if (!pid) {
			pushMsg('当前项目未激活，无法导入。', 'warn')
			return false
		}

		const task = arkTaskItems.value.find((t) => t.taskId === id)
		const remoteTaskId = id.replace(/^seedance-/, '')

		const dl = await downloadArkTaskAsset(id, kind)
		if (!dl.ok || !dl.url) return false

		const findNode = options?.findVideoNodeByTaskId
		const bindNode = options?.bindVideoResultToNode
		const createNode = options?.createMediaNodeWithAsset

		const mediaKind: 'image' | 'video' = kind === 'lastFrame' ? 'image' : 'video'
		const mediaLabel = mediaKind === 'image' ? '图片' : '视频'

		let targetNodeId = ''
		let created = false

		if (mediaKind === 'video' && typeof findNode === 'function') {
			const found = findNode(remoteTaskId)
			if (found?.nodeId) targetNodeId = found.nodeId
		}

		if (!targetNodeId && task?.nodeId && mediaKind === 'video') {
			targetNodeId = task.nodeId
		}

		if (!targetNodeId && typeof createNode === 'function') {
			try {
				const nodeId = await createNode(dl.url, mediaKind, task?.prompt || '')
				if (nodeId) {
					targetNodeId = String(nodeId)
					created = true
				}
			} catch (e: unknown) {
				pushMsg(`新建${mediaLabel}节点失败：` + getErrorMessage(e), 'error')
				return false
			}
		}

		if (targetNodeId && typeof bindNode === 'function') {
			try {
				const ret = await bindNode(targetNodeId, dl.url)
				if (ret === false) {
					pushMsg('节点回填失败。', 'warn')
					return false
				}
			} catch (e: unknown) {
				pushMsg('节点回填失败：' + getErrorMessage(e), 'error')
				return false
			}
			pushMsg(created ? `已新建${mediaLabel}节点并填入产物。` : `已将产物填入${mediaLabel}节点。`, 'info')
			return true
		}

		pushMsg(`已下载到项目资产，但未能关联到${mediaLabel}节点。`, 'warn')
		return false
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
		action: 'delete' | 'view-detail' | 'download' | 'import'
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
		} else if (payload.action === 'download') {
			await downloadArkTaskAsset(taskId)
		} else if (payload.action === 'import') {
			await importAssetToNode(taskId)
		}
	}

	const startAutoRefresh = () => {
		stopAutoRefresh()
		refreshTimer = setInterval(() => {
			if (arkTaskDialogOpen.value) {
				void refreshArkTaskItems({ silent: true })
			}
		}, 30_000)
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
			return '正在从火山方舟远端拉取任务列表...'
		}
		if (arkTaskLoaded.value) {
			return `当前展示远端所有 Seedance/ARK 任务（共 ${arkTaskItems.value.length} 条），可下载产物并回填蓝图节点。`
		}
		if (arkTaskFallbackReason.value) {
			return `加载失败：${arkTaskFallbackReason.value}`
		}
		return '打开面板后会自动从远端拉取任务列表。'
	})

	return {
		arkTaskDialogOpen,
		arkTaskItems,
		arkTaskRefreshBusy,
		arkTaskDetail,
		arkTaskDetailTaskId,
		arkTaskDetailLoading,
		arkTaskDownloading,
		arkTaskDataStatusText: dataStatusText,
		openArkTaskDialog,
		closeArkTaskDialog,
		onRefreshArkTaskPanel,
		onPreviewArkTask,
		onArkTaskPanelAction,
		refreshArkTaskItems,
		getArkTaskDetail,
		deleteArkTask,
		downloadArkTaskAsset,
		importAssetToNode
	}
}
