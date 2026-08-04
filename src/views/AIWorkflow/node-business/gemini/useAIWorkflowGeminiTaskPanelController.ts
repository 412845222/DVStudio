import { computed, ref } from 'vue'
import type { WorkflowNode } from '../../../../aiworkflow/types'
import type {
	GeminiTaskPanelAction,
	GeminiTaskPanelDetail,
	GeminiTaskPanelItem
} from '../../../../ui/WorkFlow/GeminiTaskPanel.vue'
import { getErrorMessage, isRecord } from '../../../../types/utils'
import { t } from '../../../../i18n'

type GeminiNodeSettingsLike = Record<string, unknown>

type GeminiService = {
	health: () => Promise<{ ok: boolean; configured?: boolean }>
	getTask: (payload: {
		taskId: string
	}) => Promise<{ ok: boolean; task?: Record<string, unknown>; error?: string }>
	listTasks: (payload?: {
		limit?: number
		status?: string
	}) => Promise<{ ok: boolean; items?: Record<string, unknown>[]; error?: string }>
	cancel: (payload: { taskId: string }) => Promise<{ ok: boolean; error?: string }>
	deleteTask: (payload: { taskId: string }) => Promise<{ ok: boolean; error?: string }>
	clearCompleted: (
		payload?: Record<string, unknown>
	) => Promise<{ ok: boolean; deletedCount?: number; error?: string }>
	getImagePath: (payload: {
		taskId: string
		imageIndex?: number
	}) => Promise<{
		ok: boolean
		path?: string
		filename?: string
		mimeType?: string
		error?: string
	}>
}

export const useAIWorkflowGeminiTaskPanelController = (options: {
	store: {
		state: { nodesById: Record<string, WorkflowNode>; resources?: Array<{ id: string }> }
		commit: (mutation: string, payload: Record<string, unknown>) => void
	}
	renderNodes: { value: WorkflowNode[] }
	geminiService: GeminiService
	pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
	createImageNodeAtCenter?: (url: string, name?: string) => string | null
	createImageNodeAt?: (worldX: number, worldY: number, url: string, name?: string) => string | null
	getCanvasCenterWorld?: () => { worldX: number; worldY: number }
}) => {
	const geminiTaskDialogOpen = ref(false)
	const geminiTaskItems = ref<GeminiTaskPanelItem[]>([])
	const geminiTaskLoaded = ref(false)
	const geminiTaskLoading = ref(false)
	const geminiTaskFallbackReason = ref('')
	const geminiTaskDetail = ref<GeminiTaskPanelDetail | null>(null)
	const geminiTaskDetailTaskId = ref('')
	const geminiTaskDetailLoading = ref(false)
	const geminiTaskActionBusyTaskId = ref('')
	const geminiTaskActionBusyType = ref<GeminiTaskPanelAction | ''>('')
	const geminiConfigured = ref(false)

	const NODE_SPACING_X = 80
	const DEFAULT_NODE_WIDTH = 280

	const getImageNodePosition = (
		imageIndex: number,
		baseNode: { worldX: number; worldY: number; width?: number }
	) => {
		const nodeWidth = baseNode.width || DEFAULT_NODE_WIDTH
		const offsetX = imageIndex * (nodeWidth + NODE_SPACING_X)
		return {
			worldX: baseNode.worldX + offsetX,
			worldY: baseNode.worldY
		}
	}

	const getBatchNodeTitle = (baseTitle: string, totalCount: number, imageIndex: number): string => {
		if (totalCount <= 1) return baseTitle
		return `${baseTitle} - ${imageIndex + 1}`
	}

	const getImageUrlFromResult = (img: Record<string, unknown>): string => {
		const dwebUrl = String(img.dwebUrl || '').trim()
		const localPath = String(img.localPath || '').trim()
		if (dwebUrl) return dwebUrl
		if (localPath) return `file://${localPath.replace(/\\/g, '/')}`
		return ''
	}

	const statusLabelForGemini = (status: string): string => {
		const value = String(status || '').trim()
		if (value === 'submitting') return t('tasks.gemini.statusSubmitting')
		if (value === 'processing') return t('tasks.gemini.statusProcessing')
		if (value === 'completed') return t('tasks.gemini.statusCompleted')
		if (value === 'failed') return t('tasks.gemini.statusFailed')
		if (value === 'cancelled') return t('tasks.gemini.statusCancelled')
		return t('tasks.gemini.statusUnknown')
	}

	const formatDate = (dateStr: string | number | undefined): number => {
		if (!dateStr) return Date.now()
		if (typeof dateStr === 'number') return dateStr
		try {
			return new Date(dateStr).getTime()
		} catch {
			return Date.now()
		}
	}

	const formatDateLabel = (dateStr: string | number | undefined): string => {
		const ts = formatDate(dateStr)
		const d = new Date(ts)
		const mm = String(d.getMonth() + 1).padStart(2, '0')
		const dd = String(d.getDate()).padStart(2, '0')
		const hh = String(d.getHours()).padStart(2, '0')
		const mi = String(d.getMinutes()).padStart(2, '0')
		return `${mm}-${dd} ${hh}:${mi}`
	}

	const mapBackendTaskToPanelItem = (item: Record<string, unknown>): GeminiTaskPanelItem => {
		const taskId = String(item.taskId || '').trim()
		const model = String(item.model || '').trim()
		const modelLabel = String(item.modelLabel || model || '').trim()
		const status = String(item.status || 'submitting').trim() as GeminiTaskPanelItem['status']
		const progress = Math.max(0, Math.min(100, Number(item.progress) || 0))
		const prompt = String(item.prompt || '').trim()
		const negativePrompt = String(item.negativePrompt || '').trim()
		const aspectRatio = String(item.aspectRatio || '1:1').trim()
		const imageSize = String(item.imageSize || '2K').trim()
		const thinkingLevel = String(item.thinkingLevel || 'minimal').trim()
		const numImages = Number(item.numImages) || 1
		const resultImages = Array.isArray(item.resultImages) ? item.resultImages : []
		let thumbnailUrl = String(item.thumbnailUrl || '').trim()
		const errorMessage = String(item.errorMessage || '').trim()
		const statusText = String(item.statusText || '').trim()
		const nodeId = String(item.nodeId || '').trim()

		if (!thumbnailUrl && resultImages.length > 0) {
			const firstImg = resultImages[0] as Record<string, unknown>
			thumbnailUrl = getImageUrlFromResult(firstImg)
		}

		return {
			id: taskId,
			taskId,
			nodeId,
			title: `${modelLabel} · ${aspectRatio}`,
			model: modelLabel,
			modelId: model,
			status,
			statusLabel: statusLabelForGemini(status),
			progress,
			promptPreview: prompt || t('tasks.gemini.promptNotFilled'),
			metaText: `${imageSize} · ${aspectRatio} · ${numImages}张 · ${statusText || statusLabelForGemini(status)}`,
			thumbnailUrl: thumbnailUrl || undefined,
			aspectRatio,
			imageSize,
			thinkingLevel,
			numImages,
			negativePrompt,
			resultImages: resultImages as Array<Record<string, unknown>>,
			errorMessage,
			statusText,
			createdAt: formatDate(item.createdAt as string | number | undefined),
			createdAtLabel: formatDateLabel(item.createdAt as string | number | undefined),
			updatedAtLabel: formatDateLabel(
				(item.updatedAt || item.completedAt) as string | number | undefined
			),
			payload: item
		}
	}

	const findGeminiNodeIdByTaskId = (taskId: string): string => {
		const targetTaskId = String(taskId || '').trim()
		if (!targetTaskId) return ''
		for (const node of options.renderNodes.value) {
			if (!node || node.type !== 'image') continue
			if (!isRecord(node.imageSettings)) continue
			if (node.imageSettings.imageGenerationSource !== 'gemini') continue
			const geminiSettings = isRecord(node.imageSettings.geminiImageSettings)
				? node.imageSettings.geminiImageSettings
				: undefined
			if (!geminiSettings) continue
			if (String(geminiSettings.taskId || '').trim() === targetTaskId) return node.id
		}
		return ''
	}

	const getGeminiSettingsForNode = (node: WorkflowNode): GeminiNodeSettingsLike | undefined => {
		if (
			node.type === 'image' &&
			isRecord(node.imageSettings) &&
			node.imageSettings.imageGenerationSource === 'gemini'
		) {
			return isRecord(node.imageSettings.geminiImageSettings)
				? node.imageSettings.geminiImageSettings
				: undefined
		}
		return undefined
	}

	const localGeminiTaskItems = computed<GeminiTaskPanelItem[]>(() => {
		return options.renderNodes.value
			.filter((node) => {
				if (node.type !== 'image') return false
				if (!isRecord(node.imageSettings)) return false
				return node.imageSettings.imageGenerationSource === 'gemini'
			})
			.map((node) => {
				const settings = getGeminiSettingsForNode(node) ?? {}
				const submittedParams = isRecord(settings.submittedParams) ? settings.submittedParams : {}
				const modelId = String(submittedParams.model || settings.model || '').trim()
				const modelLabel = String(settings.modelLabel || modelId || 'Gemini').trim()
				const aspectRatio = String(
					submittedParams.aspectRatio || settings.aspectRatio || '1:1'
				).trim()
				const numImages = Number(submittedParams.outputCount || settings.numImages || 1)
				const taskStatus = String(
					settings.taskStatus || 'idle'
				).trim() as GeminiTaskPanelItem['status']
				const progress = Math.max(0, Math.min(100, Number(settings.progress || 0)))
				const prompt = String(settings.prompt || '').trim()
				const errorMessage = String(settings.errorMessage || '').trim()
				const statusText = String(settings.statusText || '').trim()
				const taskId = String(settings.taskId || '').trim()
				const imageUrls = Array.isArray(settings.imageUrls) ? settings.imageUrls : []
				const thumbnailUrl = imageUrls.length > 0 ? String(imageUrls[0] || '').trim() : ''

				let mappedStatus: GeminiTaskPanelItem['status'] = 'submitting'
				const taskStatusStr = String(taskStatus)
				if (taskStatusStr === 'completed' || taskStatusStr === 'succeeded')
					mappedStatus = 'completed'
				else if (taskStatusStr === 'failed' || taskStatusStr === 'error') mappedStatus = 'failed'
				else if (taskStatusStr === 'cancelled' || taskStatusStr === 'canceled')
					mappedStatus = 'cancelled'
				else if (taskStatusStr === 'processing' || taskStatusStr === 'running')
					mappedStatus = 'processing'
				else if (taskStatusStr === 'submitting' || taskStatusStr === 'pending')
					mappedStatus = 'submitting'

				return {
					id: taskId || `local-${node.id}`,
					taskId: taskId || undefined,
					nodeId: node.id,
					title:
						String(node.alias || node.title || t('tasks.gemini.taskNodeTitle')).trim() ||
						t('tasks.gemini.taskNodeTitle'),
					model: modelLabel,
					modelId,
					status: mappedStatus,
					statusLabel: statusLabelForGemini(mappedStatus),
					progress,
					promptPreview: prompt || t('tasks.gemini.promptNotFilled'),
					metaText: `${aspectRatio} · ${numImages}张 · ${statusText || statusLabelForGemini(mappedStatus)}`,
					thumbnailUrl: thumbnailUrl || undefined,
					aspectRatio,
					numImages,
					negativePrompt: String(
						submittedParams.negativePrompt || settings.negativePrompt || ''
					).trim(),
					resultImages: [],
					errorMessage,
					statusText,
					createdAt: Number(node.createdAt || Date.now()),
					createdAtLabel: formatDateLabel(node.createdAt),
					updatedAtLabel: formatDateLabel(Date.now()),
					payload: { nodeId: node.id, ...settings }
				}
			})
	})

	const mergedTaskItems = computed<GeminiTaskPanelItem[]>(() => {
		if (geminiTaskLoaded.value) {
			const remoteIds = new Set(geminiTaskItems.value.map((item) => item.taskId).filter(Boolean))
			const localOnly = localGeminiTaskItems.value.filter(
				(item) => !item.taskId || !remoteIds.has(item.taskId)
			)
			return [...geminiTaskItems.value, ...localOnly]
		}
		return localGeminiTaskItems.value
	})

	const geminiTaskPanelStatusText = computed(() => {
		if (geminiTaskLoading.value && !geminiTaskLoaded.value) {
			return t('tasks.gemini.syncingFromBackend')
		}
		if (geminiTaskLoaded.value) {
			return t('tasks.gemini.backendTasksDisplayed')
		}
		if (geminiTaskFallbackReason.value) {
			return t('tasks.gemini.backendLoadFailedFallback', { reason: geminiTaskFallbackReason.value })
		}
		return t('tasks.gemini.localStateDisplayed')
	})

	const refreshGeminiTasks = async (opts?: { silent?: boolean }) => {
		if (geminiTaskLoading.value) return
		geminiTaskLoading.value = true
		try {
			const res = await options.geminiService.listTasks({ limit: 100 })
			if (!res.ok) {
				geminiTaskFallbackReason.value = String(res.error || 'unknown')
				if (!opts?.silent)
					options.pushToast(
						t('tasks.gemini.taskCenterLoadFailed', { error: String(res.error || 'unknown') }),
						'warn'
					)
				return
			}
			geminiTaskItems.value = Array.isArray(res.items)
				? res.items.map((item) => mapBackendTaskToPanelItem(item))
				: []
			geminiTaskLoaded.value = true
			geminiTaskFallbackReason.value = ''
		} catch (err: unknown) {
			geminiTaskFallbackReason.value = getErrorMessage(err)
			if (!opts?.silent)
				options.pushToast(
					t('tasks.gemini.taskCenterLoadFailed', { error: getErrorMessage(err) }),
					'warn'
				)
		} finally {
			geminiTaskLoading.value = false
		}
	}

	const checkGeminiHealth = async (opts?: { silent?: boolean }) => {
		try {
			const res = await options.geminiService.health()
			geminiConfigured.value = !!(res.ok && res.configured)
		} catch {
			geminiConfigured.value = false
			if (!opts?.silent) {
				options.pushToast(t('tasks.gemini.healthCheckFailed'), 'warn')
			}
		}
	}

	const openGeminiTaskDialog = () => {
		geminiTaskDialogOpen.value = true
		void refreshGeminiTasks({ silent: true })
		void checkGeminiHealth({ silent: true })
	}

	const closeGeminiTaskDialog = () => {
		geminiTaskDialogOpen.value = false
		geminiTaskDetail.value = null
		geminiTaskDetailTaskId.value = ''
		geminiTaskDetailLoading.value = false
		geminiTaskActionBusyTaskId.value = ''
		geminiTaskActionBusyType.value = ''
	}

	const onRefreshGeminiTaskPanel = async () => {
		await Promise.all([refreshGeminiTasks({ silent: false }), checkGeminiHealth({ silent: false })])
	}

	const mapPanelItemToDetail = (item: GeminiTaskPanelItem): GeminiTaskPanelDetail => ({
		id: item.id,
		title: item.title,
		taskId: item.taskId,
		nodeId: item.nodeId,
		model: item.model,
		modelId: item.modelId,
		status: item.status,
		statusLabel: item.statusLabel,
		progress: item.progress,
		prompt: item.promptPreview,
		negativePrompt: item.negativePrompt,
		statusText: item.statusText,
		errorMessage: item.errorMessage,
		thumbnailUrl: item.thumbnailUrl,
		aspectRatio: item.aspectRatio,
		imageSize: item.imageSize,
		thinkingLevel: item.thinkingLevel,
		numImages: item.numImages,
		createdAtLabel: item.createdAtLabel,
		updatedAtLabel: item.updatedAtLabel,
		resultImages: item.resultImages,
		requestPayload: isRecord(item.payload?.requestPayload)
			? item.payload.requestPayload
			: undefined,
		responsePayload: isRecord(item.payload?.responsePayload)
			? item.payload.responsePayload
			: undefined
	})

	const onPreviewGeminiTask = async (taskItemId: string) => {
		const item = mergedTaskItems.value.find((t) => t.id === taskItemId)
		if (!item) return
		geminiTaskDetailTaskId.value = taskItemId
		geminiTaskDetail.value = mapPanelItemToDetail(item)
		if (!item.taskId || !geminiTaskLoaded.value) return
		geminiTaskDetailLoading.value = true
		try {
			const res = await options.geminiService.getTask({ taskId: item.taskId })
			if (!res.ok) {
				options.pushToast(
					t('tasks.gemini.taskDetailLoadFailed', { error: String(res.error || 'unknown') }),
					'warn'
				)
				return
			}
			if (res.task) {
				const updatedItem = mapBackendTaskToPanelItem(res.task)
				geminiTaskDetail.value = mapPanelItemToDetail(updatedItem)
				await refreshGeminiTasks({ silent: true })
			}
		} catch (err: unknown) {
			options.pushToast(
				t('tasks.gemini.taskDetailLoadFailed', { error: getErrorMessage(err) }),
				'warn'
			)
		} finally {
			geminiTaskDetailLoading.value = false
		}
	}

	const applyGeminiTaskResultToNode = async (
		nodeId: string,
		task: Record<string, unknown>
	): Promise<boolean> => {
		const node = options.store.state.nodesById[nodeId]
		if (!node || node.type !== 'image') return false

		const resultImages = Array.isArray(task.resultImages) ? task.resultImages : []
		const imageUrls: string[] = []
		const sourcePaths: string[] = []
		const fileNames: string[] = []
		let thumbnailUrl = ''
		for (const img of resultImages) {
			if (!isRecord(img)) continue
			const dwebUrl = String(img.dwebUrl || '').trim()
			const localPath = String(img.localPath || '').trim()
			const filename = String(img.filename || '').trim()
			const relativePath = String(img.relativePath || '').trim()
			let imgUrl = ''
			let sourcePath = ''
			if (dwebUrl) {
				imgUrl = dwebUrl
				sourcePath = relativePath || localPath
			} else if (localPath) {
				imgUrl = `file://${localPath.replace(/\\/g, '/')}`
				sourcePath = localPath
			}
			if (imgUrl) {
				imageUrls.push(imgUrl)
				sourcePaths.push(sourcePath)
				fileNames.push(filename)
				if (!thumbnailUrl) {
					thumbnailUrl = imgUrl
				}
			}
		}

		if (imageUrls.length === 0) return false

		const taskId = String(task.taskId || '').trim()
		const resourceId = `gemini-img-${taskId || nodeId}-${Date.now()}`
		const resourceName = fileNames[0] || `gemini_image_${resourceId.slice(-8)}`

		const resourceBase: Record<string, unknown> = {
			id: resourceId,
			kind: 'image',
			name: resourceName,
			url: imageUrls[0],
			sourcePath: sourcePaths[0] || '',
			createdAt: Date.now()
		}

		const existingResource = Array.isArray(options.store.state.resources)
			? options.store.state.resources.find((r) => r.id === resourceId)
			: undefined

		if (!existingResource) {
			options.store.commit('addResource', resourceBase)
		}

		options.store.commit('setNodeResource', { nodeId, resourceId })

		options.store.commit('setNodeImageSettings', {
			nodeId,
			imageSettings: {
				imageGenerationSource: 'gemini',
				geminiImageSettings: {
					taskId,
					taskStatus: 'completed',
					progress: 100,
					statusText: t('tasks.gemini.statusCompleted'),
					imageUrls,
					thumbnailUrl
				}
			}
		})
		return true
	}

	const applyBatchImagesToBlueprint = async (
		task: Record<string, unknown>,
		sourceNodeId?: string,
		baseTitle?: string
	): Promise<string[]> => {
		const resultImages = Array.isArray(task.resultImages) ? task.resultImages : []
		if (resultImages.length === 0) return []

		const createdNodeIds: string[] = []
		const modelLabel = String(task.modelLabel || task.model || 'Gemini').trim()
		const defaultTitle = baseTitle || `${modelLabel}生成结果`

		let baseNode: { worldX: number; worldY: number; width?: number } | null = null
		let baseWorldX = 0
		let baseWorldY = 0

		if (sourceNodeId && options.store.state.nodesById[sourceNodeId]) {
			baseNode = options.store.state.nodesById[sourceNodeId] as any
			baseWorldX = (baseNode as any).worldX
			baseWorldY = (baseNode as any).worldY
		} else {
			if (typeof options.getCanvasCenterWorld === 'function') {
				const center = options.getCanvasCenterWorld()
				baseWorldX = center.worldX
				baseWorldY = center.worldY
			}
			baseNode = { worldX: baseWorldX, worldY: baseWorldY, width: DEFAULT_NODE_WIDTH }
		}

		const totalCount = resultImages.length
		const singleImageTask = {
			...task,
			resultImages: [] as Array<Record<string, unknown>>
		}

		for (let i = 0; i < resultImages.length; i++) {
			const img = resultImages[i]
			if (!isRecord(img)) continue

			const imgUrl = getImageUrlFromResult(img)
			if (!imgUrl) continue

			const nodeTitle = getBatchNodeTitle(defaultTitle, totalCount, i)
			let nodeId: string | null = null

			singleImageTask.resultImages = [img]

			if (i === 0 && sourceNodeId && options.store.state.nodesById[sourceNodeId]) {
				nodeId = sourceNodeId
				await applyGeminiTaskResultToNode(sourceNodeId, singleImageTask)
			} else if (typeof options.createImageNodeAt === 'function' && baseNode) {
				const pos = getImageNodePosition(i, baseNode)
				nodeId = options.createImageNodeAt(pos.worldX, pos.worldY, imgUrl, nodeTitle)
				if (nodeId) {
					await applyGeminiTaskResultToNode(nodeId, singleImageTask)
				}
			} else if (i === 0 && typeof options.createImageNodeAtCenter === 'function') {
				nodeId = options.createImageNodeAtCenter(imgUrl, nodeTitle)
				if (nodeId) {
					await applyGeminiTaskResultToNode(nodeId, singleImageTask)
				}
			}

			if (nodeId) {
				createdNodeIds.push(nodeId)
			}
		}

		return createdNodeIds
	}

	const onGeminiTaskPanelAction = async (payload: {
		taskId: string
		action: GeminiTaskPanelAction
		nodeId?: string
	}) => {
		const taskId = String(payload?.taskId || '').trim()
		if (!taskId) return
		const nodeId = String(payload?.nodeId || '').trim() || findGeminiNodeIdByTaskId(taskId)
		geminiTaskActionBusyTaskId.value = taskId
		geminiTaskActionBusyType.value = payload.action
		try {
			if (payload.action === 'refresh') {
				if (nodeId) {
					try {
						const res = await options.geminiService.getTask({ taskId })
						if (res.ok && res.task) {
							await applyGeminiTaskResultToNode(nodeId, res.task)
							options.pushToast(t('tasks.gemini.taskStatusRefreshed'), 'info')
						} else {
							options.pushToast(
								t('tasks.gemini.taskStatusRefreshFailed', {
									error: String(res.error || 'unknown')
								}),
								'warn'
							)
						}
					} catch (err: unknown) {
						options.pushToast(
							t('tasks.gemini.taskStatusRefreshFailed', { error: getErrorMessage(err) }),
							'warn'
						)
					}
				} else {
					await refreshGeminiTasks({ silent: false })
				}
			} else if (payload.action === 'import-output') {
				let taskData: Record<string, unknown> | null = null

				try {
					const res = await options.geminiService.getTask({ taskId })
					if (res.ok && res.task) {
						taskData = res.task
					}
				} catch (e) {
					console.error('[Gemini Task Panel] 获取任务失败:', e)
				}

				if (!taskData) {
					options.pushToast(
						t('tasks.gemini.pullArtifactsFailed', { error: 'task not found' }),
						'warn'
					)
					return
				}

				const status = String(taskData.status || '').trim()
				if (status !== 'completed') {
					options.pushToast(t('tasks.gemini.taskNotCompletedCannotPull'), 'warn')
					return
				}

				const resultImages = Array.isArray(taskData.resultImages) ? taskData.resultImages : []
				if (resultImages.length === 0) {
					options.pushToast(t('tasks.gemini.noImagesToPull'), 'warn')
					return
				}

				const createdNodes = await applyBatchImagesToBlueprint(taskData, nodeId || undefined)

				if (createdNodes.length > 0) {
					if (createdNodes.length === 1) {
						options.pushToast(
							nodeId
								? t('tasks.gemini.imageDownloadedBound')
								: t('tasks.gemini.imageImportedToNewNode'),
							'info'
						)
					} else {
						options.pushToast(
							t('tasks.gemini.batchImagesImported', { count: createdNodes.length }),
							'info'
						)
					}
				} else {
					options.pushToast(t('tasks.gemini.noReceivingNodeFound'), 'warn')
				}
			} else if (payload.action === 'delete') {
				const res = await options.geminiService.deleteTask({ taskId })
				if (!res.ok) {
					options.pushToast(
						t('tasks.gemini.taskActionFailed', {
							action: t('tasks.gemini.delete'),
							error: String(res.error || 'unknown')
						}),
						'warn'
					)
				} else {
					if (nodeId) {
						options.store.commit('setNodeImageSettings', {
							nodeId,
							imageSettings: {
								geminiImageSettings: {
									taskId: undefined,
									taskStatus: 'idle',
									progress: 0,
									statusText: t('tasks.gemini.taskDeleted'),
									errorMessage: ''
								}
							}
						})
					}
					options.pushToast(
						t('tasks.gemini.taskActionPerformed', { action: t('tasks.gemini.delete') }),
						'info'
					)
				}
			} else if (payload.action === 'clear-completed') {
				const res = await options.geminiService.clearCompleted({})
				if (!res.ok) {
					options.pushToast(
						t('tasks.gemini.clearCompletedFailed', { error: String(res.error || 'unknown') }),
						'warn'
					)
				} else {
					options.pushToast(
						t('tasks.gemini.clearCompletedSuccess', { count: res.deletedCount || 0 }),
						'info'
					)
				}
			}
			await refreshGeminiTasks({ silent: true })
			if (geminiTaskDetailTaskId.value) await onPreviewGeminiTask(geminiTaskDetailTaskId.value)
		} finally {
			geminiTaskActionBusyTaskId.value = ''
			geminiTaskActionBusyType.value = ''
		}
	}

	const onGeminiTaskDialogOpenChanged = (open: boolean) => {
		if (!open) return
		void refreshGeminiTasks({ silent: true })
		void checkGeminiHealth({ silent: true })
	}

	return {
		geminiTaskDialogOpen,
		geminiTaskItems: mergedTaskItems,
		geminiTaskPanelStatusText,
		geminiConfigured,
		geminiTaskLoaded,
		geminiTaskLoading,
		geminiTaskDetail,
		geminiTaskDetailTaskId,
		geminiTaskDetailLoading,
		geminiTaskActionBusyTaskId,
		geminiTaskActionBusyType,
		openGeminiTaskDialog,
		closeGeminiTaskDialog,
		onRefreshGeminiTaskPanel,
		onGeminiTaskPanelAction,
		onPreviewGeminiTask,
		refreshGeminiTasks,
		checkGeminiHealth,
		onGeminiTaskDialogOpenChanged
	}
}
