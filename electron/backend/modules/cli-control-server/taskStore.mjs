import logger from '../../core/logger.mjs'

const log = logger.child('cli-control-server:taskStore')

/** @type {Map<string, import('./types.mjs').CliTask>} */
const _tasks = new Map()

/** @type {Map<number, (event: import('./types.mjs').TaskChangeEvent) => void>} */
const _listeners = new Map()
let _nextListenerId = 1

function genTaskId() {
	return 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

function emitChange(event) {
	if (!event || !event.taskId) return
	for (const fn of _listeners.values()) {
		try {
			fn(event)
		} catch (err) {
			log.warn(`taskStore listener error (swallowed): ${err.message}`)
		}
	}
}

export function addTaskChangeListener(fn) {
	if (typeof fn !== 'function') return () => {}
	const id = _nextListenerId++
	_listeners.set(id, fn)
	return () => _listeners.delete(id)
}

export function createTask(command, payload) {
	/** @type {import('./types.mjs').CliTask} */
	const task = {
		taskId: genTaskId(),
		command,
		status: 'submitted',
		payload: { ...payload },
		createdAt: Date.now(),
		updatedAt: Date.now(),
		source: 'cli'
	}
	_tasks.set(task.taskId, task)
	log.info(`Task created: ${task.taskId} (${command})`)
	emitChange({ type: 'created', taskId: task.taskId, task })
	return task
}

export function getTask(taskId) {
	return _tasks.get(taskId) || null
}

export function listTasks(opts = 50) {
	let limit = 50
	let offset = 0
	let statusFilter = null
	let sourceFilter = null
	if (typeof opts === 'number') {
		limit = opts
	} else if (opts && typeof opts === 'object') {
		if (typeof opts.limit === 'number') limit = Math.max(0, Math.min(500, opts.limit))
		if (typeof opts.offset === 'number') offset = Math.max(0, opts.offset)
		if (typeof opts.status === 'string' && opts.status) statusFilter = opts.status
		if (typeof opts.filterSource === 'string' && opts.filterSource) sourceFilter = opts.filterSource
	}
	let arr = Array.from(_tasks.values())
	if (statusFilter) arr = arr.filter((t) => t.status === statusFilter)
	if (sourceFilter) arr = arr.filter((t) => t.source === sourceFilter)
	arr.sort((a, b) => b.createdAt - a.createdAt)
	const total = arr.length
	const tasks = arr.slice(offset, offset + limit)
	return { tasks, total, limit, offset }
}

export function updateTask(taskId, patch) {
	const existing = _tasks.get(taskId)
	if (!existing) return null
	const updated = {
		...existing,
		...patch,
		updatedAt: Date.now()
	}
	_tasks.set(taskId, updated)
	emitChange({ type: 'updated', taskId, task: updated, patch })
	return updated
}

export function markTaskRunning(taskId, nodeId) {
	const patch = { status: 'running' }
	if (nodeId) patch.nodeId = nodeId
	return updateTask(taskId, patch)
}

export function markTaskCompleted(taskId, outputFiles, exportedFiles) {
	return updateTask(taskId, {
		status: 'completed',
		outputFiles: outputFiles || [],
		exportedFiles: exportedFiles || [],
		completedAt: Date.now()
	})
}

export function markTaskFailed(taskId, error) {
	return updateTask(taskId, {
		status: 'failed',
		error:
			error && typeof error === 'object'
				? { message: String(error.message || ''), code: error.code || 'UNKNOWN' }
				: { message: String(error || '') },
		completedAt: Date.now()
	})
}

export function markTaskCancelled(taskId) {
	return updateTask(taskId, {
		status: 'cancelled',
		completedAt: Date.now()
	})
}
