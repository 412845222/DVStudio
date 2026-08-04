import { getRepos } from '../../../localdb/index.mjs'
import logger from '../../core/logger.mjs'

const POLL_INTERVAL_MS = 2000
const MAX_CONCURRENT_POLLS = 5

function generateTaskId(prefix = 'gtask') {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createTaskQueueService(deps = {}) {
	const getWindows = deps.getWindows || (() => [])
	const mainWindow = deps.mainWindow
	let providers = new Map()
	let pollTimer = null
	let isPolling = false
	let activePolls = 0
	const taskCompleteListeners = new Set()

	function getAllWindows() {
		const windows = []
		if (mainWindow && !mainWindow.isDestroyed()) windows.push(mainWindow)
		try {
			const extra = getWindows()
			if (Array.isArray(extra)) {
				for (const w of extra) {
					if (w && !w.isDestroyed() && w !== mainWindow) windows.push(w)
				}
			}
		} catch (_) {}
		return windows
	}

	function broadcast(channel, payload) {
		const windows = getAllWindows()
		for (const win of windows) {
			try {
				if (win.webContents && typeof win.webContents.send === 'function') {
					win.webContents.send(channel, payload)
				}
			} catch (err) {
				logger.warn(`[TaskQueue] Failed to broadcast to ${channel}: ${err.message}`)
			}
		}
	}

	function broadcastUpdate(task) {
		broadcast('dweb:task-queue:update', task)
		broadcastSummary()
	}

	function broadcastSummary() {
		const summary = getSummary()
		broadcast('dweb:task-queue:summary', summary)
	}

	function onTaskCompleted(listener) {
		taskCompleteListeners.add(listener)
		return () => taskCompleteListeners.delete(listener)
	}

	function notifyTaskCompleted(task) {
		for (const listener of taskCompleteListeners) {
			try {
				listener(task)
			} catch (err) {
				logger.warn(`[TaskQueue] Task complete listener error: ${err.message}`)
			}
		}
		broadcast('dweb:task-queue:task-completed', task)
	}

	function registerProvider(provider) {
		if (!provider || !provider.name) {
			logger.warn('[TaskQueue] Attempted to register invalid provider')
			return
		}
		providers.set(provider.name, provider)
		logger.info(`[TaskQueue] Registered provider: ${provider.name}`)
	}

	function getRepo() {
		const repos = getRepos()
		return repos.globalTasks
	}

	function registerTask(input) {
		const repo = getRepo()
		const taskId = input.id || generateTaskId(input.provider || 'gtask')

		if (input.remoteTaskId && input.provider) {
			const existing = repo.findByUniqueKey(input.projectId, input.provider, input.remoteTaskId)
			if (existing) {
				const patch = { ...input }
				delete patch.id
				if (input.nodeId && !existing.nodeId) patch.nodeId = input.nodeId
				if (input.clientRequestId && !existing.clientRequestId)
					patch.clientRequestId = input.clientRequestId
				const result = repo.update(existing.id, patch)
				if (result.ok) {
					broadcastUpdate(result.task)
					startPollingIfNeeded()
				}
				return { ok: true, task: result.task, created: false }
			}
		}

		if (input.clientRequestId) {
			const existingByClient = repo.findByClientRequestId(input.projectId, input.clientRequestId)
			if (existingByClient) {
				const patch = { ...input }
				delete patch.id
				if (input.remoteTaskId && !existingByClient.remoteTaskId)
					patch.remoteTaskId = input.remoteTaskId
				const result = repo.update(existingByClient.id, patch)
				if (result.ok) {
					broadcastUpdate(result.task)
					startPollingIfNeeded()
				}
				return { ok: true, task: result.task, created: false }
			}
		}

		const activeByNode = input.nodeId ? repo.findActiveByNodeId(input.nodeId) : null
		if (activeByNode && !input.remoteTaskId && !input.clientRequestId) {
			const result = repo.update(activeByNode.id, { ...input, id: activeByNode.id })
			if (result.ok) {
				broadcastUpdate(result.task)
				return { ok: true, task: result.task, created: false }
			}
		}

		const taskData = {
			...input,
			id: taskId,
			status: input.status || 'submitting',
			progress: input.progress || 0,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			backfilled: false
		}

		const result = repo.upsert(taskData)
		if (!result.ok) {
			logger.error(`[TaskQueue] Failed to register task: ${result.error}`)
			return result
		}

		logger.info(
			`[TaskQueue] Registered task ${result.task.id} (provider=${input.provider}, project=${input.projectId}, node=${input.nodeId}, clientReq=${input.clientRequestId || 'none'})`
		)
		broadcastUpdate(result.task)
		startPollingIfNeeded()
		return result
	}

	async function createTask(input) {
		return registerTask(input)
	}

	async function submitTask(providerName, input) {
		const provider = providers.get(providerName)
		if (!provider || typeof provider.submit !== 'function') {
			return { ok: false, error: `Provider ${providerName} not found or does not support submit` }
		}

		const createResult = registerTask({
			provider: providerName,
			taskType: input.taskType || 'generation',
			projectId: input.projectId || null,
			nodeId: input.nodeId || '',
			title: input.title || `${providerName} task`,
			prompt: input.prompt || '',
			extraData: input.extraData || {},
			status: 'submitting',
			category: input.category
		})

		if (!createResult.ok) return createResult

		try {
			const submitResult = await provider.submit(createResult.task, input)
			if (!submitResult.ok) {
				await updateTask(createResult.task.id, {
					status: 'failed',
					errorMessage: submitResult.error || 'Submit failed'
				})
				return submitResult
			}

			const patch = {
				status: 'running',
				remoteTaskId: submitResult.remoteTaskId || '',
				statusText: submitResult.statusText || 'Running',
				extraData: { ...createResult.task.extraData, submitResult: submitResult.data }
			}
			const updateResult = await updateTask(createResult.task.id, patch)
			return { ok: true, task: updateResult.task }
		} catch (err) {
			logger.error(`[TaskQueue] Submit error for ${createResult.task.id}: ${err.message}`)
			await updateTask(createResult.task.id, {
				status: 'failed',
				errorMessage: err.message || String(err)
			})
			return { ok: false, error: err.message || String(err) }
		}
	}

	async function updateTask(taskId, patch) {
		const repo = getRepo()
		const before = repo.getById(taskId)
		const result = repo.update(taskId, patch)
		if (result.ok) {
			const wasCompleted = before && before.status === 'completed'
			const isNowCompleted = result.task.status === 'completed'
			const isNowFailed = result.task.status === 'failed'
			broadcastUpdate(result.task)
			if (isNowCompleted && !wasCompleted) {
				notifyTaskCompleted(result.task)
			}
			startPollingIfNeeded()
		}
		return result
	}

	async function failTask(taskId, errorMessage) {
		return updateTask(taskId, {
			status: 'failed',
			errorMessage: errorMessage || 'Unknown error',
			statusText: errorMessage || 'Failed'
		})
	}

	async function bindRemoteTask(taskId, remoteTaskId) {
		if (!taskId || !remoteTaskId)
			return { ok: false, error: 'taskId and remoteTaskId are required' }
		const repo = getRepo()
		const existing = repo.getById(taskId)
		if (!existing) return { ok: false, error: 'Task not found' }

		if (existing.provider) {
			const duplicate = repo.findByUniqueKey(existing.projectId, existing.provider, remoteTaskId)
			if (duplicate && duplicate.id !== taskId) {
				await dismissTask(duplicate.id)
			}
		}

		return updateTask(taskId, {
			remoteTaskId: String(remoteTaskId),
			status: existing.status === 'submitting' ? 'running' : existing.status,
			statusText: existing.status === 'submitting' ? '运行中...' : existing.statusText,
			startedAt: existing.startedAt || Date.now()
		})
	}

	async function completeTask(taskId, result = {}) {
		if (!taskId) return { ok: false, error: 'taskId is required' }
		const repo = getRepo()
		const existing = repo.getById(taskId)
		if (!existing) return { ok: false, error: 'Task not found' }

		const patch = {
			status: 'completed',
			progress: 100,
			statusText: result.statusText || '已完成',
			completedAt: Date.now()
		}

		if (result.resultUrl) patch.resultUrl = result.resultUrl
		if (result.coverUrl) patch.coverUrl = result.coverUrl
		if (result.resultAssets) patch.resultAssets = result.resultAssets
		if (result.extraData) patch.extraData = { ...existing.extraData, ...result.extraData }

		return updateTask(taskId, patch)
	}

	async function cancelTask(taskId) {
		const repo = getRepo()
		const task = repo.getById(taskId)
		if (!task) return { ok: false, error: 'Task not found' }

		const provider = providers.get(task.provider)
		if (provider && typeof provider.cancel === 'function' && task.remoteTaskId) {
			try {
				await provider.cancel(task)
			} catch (err) {
				logger.warn(`[TaskQueue] Provider cancel failed for ${taskId}: ${err.message}`)
			}
		}

		return updateTask(taskId, { status: 'cancelled', statusText: 'Cancelled' })
	}

	async function dismissTask(taskId) {
		const repo = getRepo()
		const result = repo.dismiss(taskId)
		if (result.ok) {
			broadcast('dweb:task-queue:deleted', { id: taskId })
			broadcastSummary()
		}
		return result
	}

	async function deleteTask(taskId) {
		const repo = getRepo()
		const task = repo.getById(taskId)
		if (task && task.status === 'running') {
			await cancelTask(taskId)
		}
		const result = repo.delete(taskId)
		if (result.ok) {
			broadcast('dweb:task-queue:deleted', { id: taskId })
			broadcastSummary()
		}
		return result
	}

	async function clearCompleted() {
		const repo = getRepo()
		const tasks = repo.list()
		let deleted = 0
		for (const task of tasks) {
			if (
				task.status === 'completed' ||
				task.status === 'failed' ||
				task.status === 'cancelled' ||
				task.status === 'dismissed'
			) {
				repo.delete(task.id)
				deleted++
			}
		}
		broadcast('dweb:task-queue:cleared', { deleted })
		broadcastSummary()
		return { ok: true, deleted }
	}

	async function markBackfilled(taskId) {
		const repo = getRepo()
		return repo.markBackfilled(taskId)
	}

	function getTask(taskId) {
		const repo = getRepo()
		return repo.getById(taskId)
	}

	function findTaskByUniqueKey(projectId, provider, remoteTaskId) {
		const repo = getRepo()
		return repo.findByUniqueKey(projectId, provider, remoteTaskId)
	}

	function findActiveTaskByNodeId(nodeId) {
		const repo = getRepo()
		return repo.findActiveByNodeId(nodeId)
	}

	function listTasks(options = {}) {
		const repo = getRepo()
		return repo.list(options)
	}

	function listTasksByProject(projectId, options = {}) {
		const repo = getRepo()
		return repo.listByProject(projectId, options)
	}

	function listUnbackfilledCompleted(projectId) {
		const repo = getRepo()
		return repo.listUnbackfilledCompleted(projectId)
	}

	function getActiveTasks() {
		const repo = getRepo()
		return repo.listActive()
	}

	function getSummary() {
		const repo = getRepo()
		const tasks = repo.list({ limit: 500 })
		const activeStatuses = ['pending', 'submitting', 'queued', 'running']
		const active = tasks.filter((t) => activeStatuses.includes(t.status))
		const running = tasks.filter((t) => t.status === 'running')
		const submitting = tasks.filter((t) => t.status === 'submitting')
		const completed = tasks.filter((t) => t.status === 'completed')
		const failed = tasks.filter((t) => t.status === 'failed')
		const cancelled = tasks.filter((t) => t.status === 'cancelled' || t.status === 'dismissed')

		let overallProgress = 0
		if (active.length > 0) {
			const totalProgress = active.reduce((sum, t) => sum + (t.progress || 0), 0)
			overallProgress = Math.round(totalProgress / active.length)
		}

		return {
			total: tasks.length,
			activeCount: active.length,
			runningCount: running.length,
			submittingCount: submitting.length,
			completedCount: completed.length,
			failedCount: failed.length,
			cancelledCount: cancelled.length,
			overallProgress,
			tasks: tasks.slice(0, 100)
		}
	}

	async function pollTask(task) {
		const provider = providers.get(task.provider)
		if (!provider || typeof provider.poll !== 'function') return null

		if (!task.remoteTaskId) {
			return null
		}

		try {
			const result = await provider.poll(task)
			if (!result || !result.ok) {
				if (result && result.error) {
					logger.warn(`[TaskQueue] Poll failed for ${task.id}: ${result.error}`)
				}
				return null
			}

			const patch = {}
			if (result.status) patch.status = result.status
			if (typeof result.progress === 'number') patch.progress = result.progress
			if (result.statusText) patch.statusText = result.statusText
			if (result.errorMessage) patch.errorMessage = result.errorMessage
			if (result.resultAssets) patch.resultAssets = result.resultAssets
			if (result.remoteTaskId && !task.remoteTaskId) patch.remoteTaskId = result.remoteTaskId
			if (result.extraData) patch.extraData = { ...task.extraData, ...result.extraData }

			if (Object.keys(patch).length > 0) {
				return updateTask(task.id, patch)
			}
			return { ok: true, task }
		} catch (err) {
			logger.error(`[TaskQueue] Poll error for ${task.id}: ${err.message}`)
			return null
		}
	}

	function taskNeedsPolling(task) {
		const provider = providers.get(task.provider)
		if (!provider || typeof provider.poll !== 'function') return false
		if (!task.remoteTaskId) return false
		if (
			task.status === 'completed' ||
			task.status === 'failed' ||
			task.status === 'cancelled' ||
			task.status === 'dismissed'
		)
			return false
		return true
	}

	async function pollTick() {
		if (isPolling) return
		isPolling = true

		try {
			const repo = getRepo()
			const activeTasks = repo.listActive()
			if (activeTasks.length === 0) {
				stopPolling()
				return
			}

			const pollable = activeTasks.filter(taskNeedsPolling)
			if (pollable.length === 0) {
				return
			}

			const toPoll = pollable.slice(0, MAX_CONCURRENT_POLLS)
			activePolls = toPoll.length
			await Promise.allSettled(toPoll.map((t) => pollTask(t)))
		} catch (err) {
			logger.error(`[TaskQueue] Poll tick error: ${err.message}`)
		} finally {
			isPolling = false
			activePolls = 0
		}
	}

	function startPollingIfNeeded() {
		if (pollTimer) return
		const repo = getRepo()
		const activeTasks = repo.listActive()
		const pollable = activeTasks.filter(taskNeedsPolling)
		if (pollable.length === 0) return
		logger.info('[TaskQueue] Starting poll timer')
		void pollTick()
		pollTimer = setInterval(() => {
			void pollTick()
		}, POLL_INTERVAL_MS)
	}

	function stopPolling() {
		if (pollTimer) {
			clearInterval(pollTimer)
			pollTimer = null
			logger.info('[TaskQueue] Stopped poll timer')
		}
	}

	function restoreTasks() {
		try {
			const repo = getRepo()
			const activeTasks = repo.listActive()
			logger.info(`[TaskQueue] Restored ${activeTasks.length} active tasks`)
			if (activeTasks.length > 0) {
				broadcastSummary()
				startPollingIfNeeded()
			}
		} catch (err) {
			logger.warn(`[TaskQueue] Failed to restore tasks: ${err.message}`)
		}
	}

	function shutdown() {
		stopPolling()
		providers.clear()
		taskCompleteListeners.clear()
	}

	return {
		registerProvider,
		registerTask,
		createTask,
		submitTask,
		updateTask,
		failTask,
		bindRemoteTask,
		completeTask,
		cancelTask,
		dismissTask,
		deleteTask,
		clearCompleted,
		markBackfilled,
		getTask,
		findTaskByUniqueKey,
		findActiveTaskByNodeId,
		listTasks,
		listTasksByProject,
		listUnbackfilledCompleted,
		getActiveTasks,
		getSummary,
		startPollingIfNeeded,
		stopPolling,
		restoreTasks,
		shutdown,
		onTaskCompleted,
		getProviders: () => Array.from(providers.keys())
	}
}
