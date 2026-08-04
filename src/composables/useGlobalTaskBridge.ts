import { watch } from 'vue'
import type { Store } from 'vuex'
import type { TaskCategory } from '../store/taskqueue/types'

export type RegisterTaskInput = {
	provider: string
	category: TaskCategory
	title?: string
	prompt?: string
	nodeId?: string
	nodeType?: string
	coverUrl?: string
}

export type RegisteredTask = {
	taskId: string
	clientRequestId: string
	nodeId: string
	provider: string
	category: TaskCategory
}

export const TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'cancelled', 'dismissed'])

export function makeClientRequestId(nodeId: string, provider: string): string {
	const ts = Date.now().toString(36)
	const rand = Math.random().toString(36).slice(2, 10)
	const nid = (nodeId || 'nonode').slice(0, 12)
	const pid = (provider || 'noprov').slice(0, 8)
	return `${pid}-${nid}-${ts}-${rand}`
}

export type TranslateFunction = (key: string, params?: Record<string, any>) => string

export function detectCategoryFromNodeType(nodeType: string): TaskCategory {
	const nt = String(nodeType || '').toLowerCase()
	if (nt.includes('3d') || nt === 'model3d') return '3d'
	if (nt.includes('video')) return 'video'
	if (nt.includes('text')) return 'custom'
	return 'image'
}

export function getLabelForCategory(category: TaskCategory, provider: string, t?: TranslateFunction): string {
	const providerKey = provider ? `taskQueue.provider.${provider}` : ''
	const categoryKey = `taskQueue.category.${category}`
	
	const providerNames: Record<string, string> = {
		meshy: t?.('taskQueue.provider.meshy') || 'Meshy',
		gemini: t?.('taskQueue.provider.gemini') || 'Gemini',
		seedream: t?.('taskQueue.provider.seedream') || 'Seedream',
		jimeng: t?.('taskQueue.provider.jimeng') || 'Jimeng',
		tripo3d: t?.('taskQueue.provider.tripo3d') || 'Tripo3D',
		nanobanana: t?.('taskQueue.provider.nanobanana') || 'NanoBanana',
		seedance: t?.('taskQueue.provider.seedance') || 'Seedance',
		kling: t?.('taskQueue.provider.kling') || 'Kling',
		luma: t?.('taskQueue.provider.luma') || 'Luma',
		bytedance: t?.('taskQueue.provider.bytedance') || 'Doubao',
	}
	
	const categoryLabels: Record<string, string> = {
		image: t?.('taskQueue.category.image') || '图片',
		'3d': t?.('taskQueue.category.model3d') || '3D模型',
		video: t?.('taskQueue.category.video') || '视频',
		custom: t?.('taskQueue.category.custom') || '文本',
	}
	
	const providerName = providerNames[provider] || provider
	const categoryLabel = categoryLabels[category] || 'Task'
	
	if (category === '3d' && (provider === 'meshy' || provider === 'tripo3d')) {
		if (provider === 'tripo3d') return providerName
		return `${providerName} 3D`
	}
	
	if (providerName) return `${providerName}${categoryLabel}`
	return categoryLabel
}

export function safeStr(v: unknown, def = ''): string {
	if (v == null) return def
	const s = String(v).trim()
	return s || def
}

export function getErrorMessage(err: unknown): string {
	if (err instanceof Error) return err.message
	if (typeof err === 'string') return err
	if (err && typeof err === 'object' && 'message' in err) return String((err as any).message)
	return String(err)
}

export function useGlobalTaskBridge(store: Store<any>, t?: TranslateFunction) {
	const bridge = (window as any)?.dweb?.taskQueue
	if (!bridge) {
		console.warn('[GlobalTaskBridge] window.dweb.taskQueue not available, task sync disabled')
		return {
			destroy: () => {},
			registerTask: async () => ({ ok: false, error: 'taskQueue not available' }),
			updateTask: async () => ({ ok: false }),
			bindRemoteTask: async () => ({ ok: false }),
			failTask: async () => ({ ok: false }),
			completeTask: async () => ({ ok: false }),
			dismissTask: async () => ({ ok: false }),
		}
	}

	const registeredTasks = new Map<string, RegisteredTask>()
	const nodeTaskMap = new Map<string, string>()
	let destroyed = false
	let currentProjectId: number | null = null
	let projectWatchStop: (() => void) | null = null
	let nodeWatchStop: (() => void) | null = null
	let syncScheduled = false
	const pendingSyncNodes = new Set<string>()

	async function registerTask(input: RegisterTaskInput): Promise<{ ok: boolean; taskId?: string; clientRequestId?: string; error?: string }> {
		try {
			const state = store.state
			const projectId = state?.projectId != null ? Number(state.projectId) : null
			currentProjectId = projectId
			const nodeId = safeStr(input.nodeId, '')
			const provider = safeStr(input.provider, '')
			const category = input.category || detectCategoryFromNodeType(input.nodeType || '')
			const label = getLabelForCategory(category, provider, t)
			const node = nodeId ? state?.nodesById?.[nodeId] : null
			const nodeName = safeStr(node?.title || node?.label || node?.name, '')
			const clientRequestId = makeClientRequestId(nodeId, provider)

			const result = await bridge.register({
				projectId,
				nodeId,
				provider,
				category,
				title: input.title || (label + (nodeName ? ` · ${nodeName}` : '')),
				label,
				prompt: input.prompt || '',
				coverUrl: input.coverUrl || '',
				clientRequestId,
				status: 'submitting',
				progress: 0,
				statusText: t?.('taskQueue.statusPreparing') || '准备中...',
				canCancel: true,
			})

			if (result?.ok && result.task) {
				const taskId = result.task.id
				const rt: RegisteredTask = { taskId, clientRequestId, nodeId, provider, category }
				registeredTasks.set(taskId, rt)
				if (nodeId) {
					nodeTaskMap.set(nodeId, taskId)
				}
				return { ok: true, taskId, clientRequestId }
			}
			return { ok: false, error: result?.error || 'Register failed' }
		} catch (err) {
			return { ok: false, error: getErrorMessage(err) }
		}
	}

	async function updateTask(taskId: string, patch: Record<string, any>) {
		if (!taskId || !registeredTasks.has(taskId)) {
			return { ok: false, error: 'Unknown task' }
		}
		try {
			return await bridge.update({ id: taskId, ...patch })
		} catch (err) {
			console.warn(`[GlobalTaskBridge] Failed to update task ${taskId}:`, err)
			return { ok: false, error: getErrorMessage(err) }
		}
	}

	async function bindRemoteTask(taskId: string, remoteTaskId: string) {
		if (!taskId || !registeredTasks.has(taskId)) {
			return { ok: false, error: 'Unknown task' }
		}
		try {
			return await bridge.bindRemoteTask({ id: taskId, remoteTaskId })
		} catch (err) {
			console.warn(`[GlobalTaskBridge] Failed to bind remote task ${taskId}:`, err)
			return { ok: false, error: getErrorMessage(err) }
		}
	}

	async function failTask(taskId: string, errorMessage: string) {
		if (!taskId || !registeredTasks.has(taskId)) {
			return { ok: false, error: 'Unknown task' }
		}
		try {
			return await bridge.fail({ id: taskId, errorMessage })
		} catch (err) {
			console.warn(`[GlobalTaskBridge] Failed to fail task ${taskId}:`, err)
			return { ok: false, error: getErrorMessage(err) }
		}
	}

	async function completeTask(taskId: string, result: { resultUrl?: string; coverUrl?: string; statusText?: string } = {}) {
		if (!taskId || !registeredTasks.has(taskId)) {
			return { ok: false, error: 'Unknown task' }
		}
		try {
			return await bridge.complete({ id: taskId, ...result })
		} catch (err) {
			console.warn(`[GlobalTaskBridge] Failed to complete task ${taskId}:`, err)
			return { ok: false, error: getErrorMessage(err) }
		}
	}

	async function dismissTask(taskId: string) {
		if (!taskId) return { ok: false, error: 'taskId required' }
		try {
			const result = await bridge.dismiss({ id: taskId })
			registeredTasks.delete(taskId)
			for (const [nid, tid] of nodeTaskMap.entries()) {
				if (tid === taskId) nodeTaskMap.delete(nid)
			}
			return result
		} catch (err) {
			return { ok: false, error: getErrorMessage(err) }
		}
	}

	function extractProviderSettings(node: any): { settings: any; provider: string } | null {
		if (!node) return null

		const videoSettings = node.videoSettings
		if (videoSettings?.seedanceSettings && (videoSettings.seedanceSettings.taskId || videoSettings.seedanceSettings.taskStatus || videoSettings.seedanceSettings.progress !== undefined)) {
			return { settings: videoSettings.seedanceSettings, provider: 'seedance' }
		}

		const imageSettings = node.imageSettings
		if (imageSettings) {
			if (imageSettings.meshyImageSettings && (imageSettings.meshyImageSettings.taskId || imageSettings.meshyImageSettings.taskStatus)) {
				return { settings: imageSettings.meshyImageSettings, provider: 'meshy' }
			}
			if (imageSettings.geminiImageSettings && (imageSettings.geminiImageSettings.taskStatus || imageSettings.geminiImageSettings.progress !== undefined)) {
				return { settings: imageSettings.geminiImageSettings, provider: 'gemini' }
			}
			if (imageSettings.seedreamImageSettings && (imageSettings.seedreamImageSettings.taskStatus || imageSettings.seedreamImageSettings.progress !== undefined)) {
				return { settings: imageSettings.seedreamImageSettings, provider: 'seedream' }
			}
			if (imageSettings.jimengImageSettings && (imageSettings.jimengImageSettings.taskStatus || imageSettings.jimengImageSettings.progress !== undefined)) {
				return { settings: imageSettings.jimengImageSettings, provider: 'jimeng' }
			}
			if (imageSettings.tripo3dImageSettings && (imageSettings.tripo3dImageSettings.taskId || imageSettings.tripo3dImageSettings.taskStatus)) {
				return { settings: imageSettings.tripo3dImageSettings, provider: 'tripo3d' }
			}
		}

		if (node.meshyImageSettings && (node.meshyImageSettings.taskId || node.meshyImageSettings.taskStatus)) {
			return { settings: node.meshyImageSettings, provider: 'meshy' }
		}
		if (node.tripo3dImageSettings && (node.tripo3dImageSettings.taskId || node.tripo3dImageSettings.taskStatus)) {
			return { settings: node.tripo3dImageSettings, provider: 'tripo3d' }
		}

		const model3dSettings = node.model3dSettings
		if (model3dSettings) {
			if (model3dSettings.meshyModelSettings && (model3dSettings.meshyModelSettings.taskId || model3dSettings.meshyModelSettings.taskStatus)) {
				return { settings: model3dSettings.meshyModelSettings, provider: 'meshy' }
			}
			if (model3dSettings.tripo3dModelSettings && (model3dSettings.tripo3dModelSettings.taskId || model3dSettings.tripo3dModelSettings.taskStatus)) {
				return { settings: model3dSettings.tripo3dModelSettings, provider: 'tripo3d' }
			}
		}

		if (node.meshyModelSettings && (node.meshyModelSettings.taskId || node.meshyModelSettings.taskStatus)) {
			return { settings: node.meshyModelSettings, provider: 'meshy' }
		}
		if (node.tripo3dModelSettings && (node.tripo3dModelSettings.taskId || node.tripo3dModelSettings.taskStatus)) {
			return { settings: node.tripo3dModelSettings, provider: 'tripo3d' }
		}

		return null
	}

	function mapStatus(raw: string): string {
		const s = String(raw || '').toLowerCase().trim()
		if (['succeeded', 'completed', 'success'].includes(s)) return 'completed'
		if (['failed', 'canceled', 'cancelled', 'error'].includes(s)) return 'failed'
		if (['cancelling', 'canceling', 'aborting'].includes(s)) return 'cancelled'
		if (['submitting'].includes(s)) return 'submitting'
		if (['queued', 'in_progress', 'in-progress', 'running', 'polling', 'pending'].includes(s)) return 'running'
		return ''
	}

	function scheduleSync(nodeId: string) {
		if (!nodeId) return
		pendingSyncNodes.add(nodeId)
		if (syncScheduled) return
		syncScheduled = true
		queueMicrotask(() => {
			syncScheduled = false
			const nodes = Array.from(pendingSyncNodes)
			pendingSyncNodes.clear()
			for (const nid of nodes) {
				void syncSingleNode(nid)
			}
		})
	}

	async function syncSingleNode(nodeId: string) {
		if (destroyed) return
		const taskId = nodeTaskMap.get(nodeId)
		if (!taskId || !registeredTasks.has(taskId)) return

		try {
			const state = store.state
			const node = state?.nodesById?.[nodeId]
			if (!node) return

			const gtasks: Record<string, any> = state?.nodeGenerationTasksById || {}
			const gtask = Object.values(gtasks).find((g: any) => g?.nodeId === nodeId && g?.id)

			let progress = 0
			let statusText = ''
			let errorMessage = ''
			let status = ''
			let coverUrl = ''
			let resultUrl = ''
			let remoteTaskId = ''

			const providerInfo = extractProviderSettings(node)
			const settings = providerInfo?.settings

			if (gtask) {
				progress = Number(gtask.progress ?? 0)
				statusText = safeStr(gtask.statusText, '')
				errorMessage = safeStr(gtask.errorMessage || gtask.error, '')
				status = safeStr(gtask.status, '')
				if (gtask.results?.length > 0) {
					const vidResult = gtask.results.find((r: any) => r.kind === 'video' && r.url)
					const imgResult = gtask.results.find((r: any) => r.kind === 'image' && r.url)
					if (vidResult) {
						resultUrl = safeStr(vidResult.url, '')
						coverUrl = safeStr(gtask.coverUrl || '', '')
					} else if (imgResult) {
						resultUrl = safeStr(imgResult.url, '')
						coverUrl = resultUrl
					}
				}
			}

			if (settings) {
				remoteTaskId = safeStr(settings.taskId || settings.remoteTaskId, '')
				if (!progress) progress = Number(settings.progress ?? 0)
				if (!statusText) statusText = safeStr(settings.statusText, '')
				if (!errorMessage) errorMessage = safeStr(settings.errorMessage || settings.error, '')
				if (!status) status = safeStr(settings.taskStatus, '')
				if (!resultUrl) resultUrl = safeStr(settings.resultUrl || settings.videoUrl || settings.modelUrl || settings.preferredUrl, '')
				if (!coverUrl) coverUrl = safeStr(settings.coverUrl || settings.thumbnailUrl || settings.posterUrl, '')
				if (settings.outputSummary) {
					if (!resultUrl) resultUrl = safeStr(settings.outputSummary.preferredUrl, '')
					if (!coverUrl) coverUrl = safeStr(settings.outputSummary.thumbnailUrl, '')
				}
			}

			const rt = registeredTasks.get(taskId)
			if (remoteTaskId && rt) {
				await bindRemoteTask(taskId, remoteTaskId)
			}

			const mappedStatus = mapStatus(status)
			if (mappedStatus && TERMINAL_TASK_STATUSES.has(mappedStatus)) {
				if (mappedStatus === 'completed' && resultUrl) {
					await completeTask(taskId, { resultUrl, coverUrl: coverUrl || resultUrl, statusText: statusText || (t?.('taskQueue.statusCompletedDefault') || '已完成') })
				} else if (mappedStatus === 'failed' && errorMessage) {
					await failTask(taskId, errorMessage)
				} else if (mappedStatus === 'cancelled') {
					await updateTask(taskId, { status: 'cancelled', statusText: statusText || (t?.('taskQueue.statusCancelledDefault') || '已取消') })
				}
			} else if (progress > 0 || statusText || mappedStatus) {
				await updateTask(taskId, {
					progress: Math.max(0, Math.min(100, progress)),
					statusText: statusText || undefined,
					status: mappedStatus || undefined,
					errorMessage: errorMessage || undefined,
					coverUrl: coverUrl || undefined,
					resultUrl: resultUrl || undefined,
				})
			}
		} catch (err) {
			console.warn(`[GlobalTaskBridge] syncSingleNode error for ${nodeId}:`, err)
		}
	}

	function setupStateSync() {
		if (nodeWatchStop) nodeWatchStop()

		nodeWatchStop = watch(
			() => {
				const state = store.state
				return {
					nodesById: state?.nodesById,
					nodeGenerationTasksById: state?.nodeGenerationTasksById,
				}
			},
			() => {
				for (const nodeId of nodeTaskMap.keys()) {
					scheduleSync(nodeId)
				}
			},
			{ deep: true }
		)

		projectWatchStop = watch(
			() => store.state?.projectId,
			(newPid) => {
				currentProjectId = newPid != null ? Number(newPid) : null
			}
		)
	}

	setupStateSync()

	function destroy() {
		if (destroyed) return
		destroyed = true
		if (projectWatchStop) projectWatchStop()
		if (nodeWatchStop) nodeWatchStop()
		nodeTaskMap.clear()
		registeredTasks.clear()
		pendingSyncNodes.clear()
	}

	return {
		destroy,
		registerTask,
		updateTask,
		bindRemoteTask,
		failTask,
		completeTask,
		dismissTask,
		syncSingleNode,
	}
}
