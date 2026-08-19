import * as service from './service.mjs'

export function cliControlGetStatus(ctx) {
	return service.getServerStatus()
}

export function cliControlGetTask(ctx, payload) {
	return service.getTask(payload?.taskId)
}

export function cliControlListTasks(ctx, payload) {
	return service.listTasks(payload || {})
}

/**
 * 前端（useCLIAgentTrigger）调用：将一个 pending/running 的任务标记为 completed（含 outputFiles/exportedFiles）
 * 在 Agent Runtime/MCP generate_image 执行完成后调用
 */
export function cliControlMarkTaskCompleted(ctx, payload) {
	const taskId = payload?.taskId
	const outputFiles = Array.isArray(payload?.outputFiles) ? payload.outputFiles.filter(Boolean) : []
	const exportedFiles = Array.isArray(payload?.exportedFiles)
		? payload.exportedFiles.filter(Boolean)
		: []
	const result = service.markTaskCompleted(taskId, outputFiles, exportedFiles)
	return result || { ok: false, error: 'TASK_NOT_FOUND' }
}

/**
 * 前端调用：将任务标记为失败
 */
export function cliControlMarkTaskFailed(ctx, payload) {
	const taskId = payload?.taskId
	const error = payload?.error || 'UNKNOWN'
	const result = service.markTaskFailed(taskId, error)
	return result || { ok: false, error: 'TASK_NOT_FOUND' }
}

/**
 * 前端调用：写入任务 meta 的增量 patch（预览节点创建完成后的 ack / 聊天预览块 ack）
 */
export function cliControlAcknowledgeTaskMeta(ctx, payload) {
	const taskId = payload?.taskId
	const patch = payload?.patch || {}
	return service.acknowledgeTaskMeta(taskId, patch)
}

/**
 * 前端调用：取消 CLI 任务
 */
export function cliControlCancelTask(ctx, payload) {
	const taskId = payload?.taskId
	return service.cancelTaskById(taskId)
}
