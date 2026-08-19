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
    const exportedFiles = Array.isArray(payload?.exportedFiles) ? payload.exportedFiles.filter(Boolean) : []
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
