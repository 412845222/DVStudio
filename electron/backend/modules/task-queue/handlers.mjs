let _taskQueueService = null

export function setTaskQueueService(svc) {
	_taskQueueService = svc
}

export function getTaskQueueService() {
	return _taskQueueService
}

export async function listTasks(ctx, payload) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	const projectId = payload?.projectId != null ? Number(payload.projectId) : null
	if (projectId != null) {
		const tasks = _taskQueueService.listTasksByProject(projectId, payload || {})
		return { ok: true, tasks }
	}
	const tasks = _taskQueueService.listTasks(payload || {})
	return { ok: true, tasks }
}

export async function listByProject(ctx, payload) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	const projectId = payload?.projectId != null ? Number(payload.projectId) : null
	if (projectId == null) return { ok: false, error: 'projectId is required' }
	const tasks = _taskQueueService.listTasksByProject(projectId, payload || {})
	return { ok: true, tasks }
}

export async function listUnbackfilledCompleted(ctx, payload) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	const projectId = payload?.projectId != null ? Number(payload.projectId) : null
	if (projectId == null) return { ok: false, error: 'projectId is required' }
	const tasks = _taskQueueService.listUnbackfilledCompleted(projectId)
	return { ok: true, tasks }
}

export async function getSummary(ctx) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	return { ok: true, summary: _taskQueueService.getSummary() }
}

export async function getTask(ctx, payload) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	const taskId = String(payload?.id || payload?.taskId || '').trim()
	if (!taskId) return { ok: false, error: 'Task ID is required' }
	const task = _taskQueueService.getTask(taskId)
	if (!task) return { ok: false, error: 'Task not found' }
	return { ok: true, task }
}

export async function findByUniqueKey(ctx, payload) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	const projectId = payload?.projectId != null ? Number(payload.projectId) : null
	const provider = String(payload?.provider || '').trim()
	const remoteTaskId = String(payload?.remoteTaskId || '').trim()
	if (!provider || !remoteTaskId) return { ok: false, error: 'provider and remoteTaskId are required' }
	const task = _taskQueueService.findTaskByUniqueKey(projectId, provider, remoteTaskId)
	return { ok: true, task: task || null }
}

export async function findActiveByNodeId(ctx, payload) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	const nodeId = String(payload?.nodeId || '').trim()
	if (!nodeId) return { ok: false, error: 'nodeId is required' }
	const task = _taskQueueService.findActiveTaskByNodeId(nodeId)
	return { ok: true, task: task || null }
}

export async function cancelTask(ctx, payload) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	const taskId = String(payload?.id || payload?.taskId || '').trim()
	if (!taskId) return { ok: false, error: 'Task ID is required' }
	return _taskQueueService.cancelTask(taskId)
}

export async function dismissTask(ctx, payload) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	const taskId = String(payload?.id || payload?.taskId || '').trim()
	if (!taskId) return { ok: false, error: 'Task ID is required' }
	return _taskQueueService.dismissTask(taskId)
}

export async function deleteTask(ctx, payload) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	const taskId = String(payload?.id || payload?.taskId || '').trim()
	if (!taskId) return { ok: false, error: 'Task ID is required' }
	return _taskQueueService.deleteTask(taskId)
}

export async function clearCompleted(ctx) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	return _taskQueueService.clearCompleted()
}

export async function markBackfilled(ctx, payload) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	const taskId = String(payload?.id || payload?.taskId || '').trim()
	if (!taskId) return { ok: false, error: 'Task ID is required' }
	return _taskQueueService.markBackfilled(taskId)
}

export async function submitTask(ctx, payload) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	const provider = String(payload?.provider || '').trim()
	if (!provider) return { ok: false, error: 'Provider is required' }
	return _taskQueueService.submitTask(provider, payload || {})
}

export async function registerTask(ctx, payload) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	return _taskQueueService.registerTask(payload || {})
}

export async function createTask(ctx, payload) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	return _taskQueueService.registerTask(payload || {})
}

export async function failTask(ctx, payload) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	const taskId = String(payload?.id || payload?.taskId || '').trim()
	if (!taskId) return { ok: false, error: 'Task ID is required' }
	const errorMessage = String(payload?.errorMessage || payload?.error || 'Unknown error')
	return _taskQueueService.failTask(taskId, errorMessage)
}

export async function bindRemoteTask(ctx, payload) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	const taskId = String(payload?.id || payload?.taskId || '').trim()
	const remoteTaskId = String(payload?.remoteTaskId || payload?.remote_id || '').trim()
	if (!taskId) return { ok: false, error: 'Task ID is required' }
	if (!remoteTaskId) return { ok: false, error: 'remoteTaskId is required' }
	return _taskQueueService.bindRemoteTask(taskId, remoteTaskId)
}

export async function completeTask(ctx, payload) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	const taskId = String(payload?.id || payload?.taskId || '').trim()
	if (!taskId) return { ok: false, error: 'Task ID is required' }
	const result = payload?.result || {}
	if (payload.resultUrl) result.resultUrl = payload.resultUrl
	if (payload.coverUrl) result.coverUrl = payload.coverUrl
	return _taskQueueService.completeTask(taskId, result)
}

export async function reconcile(ctx, payload) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	const projectId = payload?.projectId != null ? Number(payload.projectId) : null
	if (projectId == null) return { ok: false, error: 'projectId is required' }
	const tasks = _taskQueueService.listUnbackfilledCompleted(projectId)
	return { ok: true, tasks }
}

export async function updateTask(ctx, payload) {
	if (!_taskQueueService) return { ok: false, error: 'Task queue service not initialized' }
	const taskId = String(payload?.id || '').trim()
	if (!taskId) return { ok: false, error: 'Task ID is required' }
	const { id, ...patch } = payload || {}
	return _taskQueueService.updateTask(taskId, patch)
}
