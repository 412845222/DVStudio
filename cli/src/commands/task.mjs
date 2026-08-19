import { printJson, printText } from '../core/output.mjs'
import { EXIT_CODES } from '../core/exitCodes.mjs'
import { get, post, mapResponseToExitCode } from '../core/httpClient.mjs'

export async function runTaskQueryCommand(ctx, taskId) {
    const { instance, isJson, clientRunning } = ctx
    if (!taskId) {
        if (isJson) printJson({ ok: false, error: 'INVALID_PARAMS', message: 'taskId is required' })
        else printText('错误: taskId 不能为空')
        return EXIT_CODES.INVALID_PARAMS
    }
    if (!clientRunning) {
        if (isJson) printJson({ ok: false, error: 'CLIENT_NOT_RUNNING' })
        else printText('错误: DVStudio 客户端未运行')
        return EXIT_CODES.CLIENT_NOT_RUNNING
    }
    const resp = await get(instance, `/v1/tasks/${encodeURIComponent(taskId)}`, 10000)
    if (isJson) {
        printJson(resp.data || { ok: false, raw: resp.raw })
    } else {
        if (resp.status === 200 && resp.data?.ok) {
            const t = resp.data.task
            const lines = [
                `任务ID: ${t.taskId}`,
                `命令: ${t.command}`,
                `状态: ${t.status}`,
                `创建时间: ${new Date(t.createdAt).toLocaleString()}`,
            ]
            if (t.updatedAt) lines.push(`更新时间: ${new Date(t.updatedAt).toLocaleString()}`)
            if (t.completedAt) lines.push(`完成时间: ${new Date(t.completedAt).toLocaleString()}`)
            if (t.nodeId) lines.push(`节点ID: ${t.nodeId}`)
            if (t.outputFiles?.length) lines.push(`输出文件: ${t.outputFiles.join(', ')}`)
            if (t.exportedFiles?.length) lines.push(`导出文件: ${t.exportedFiles.join(', ')}`)
            if (t.error) lines.push(`错误: ${t.error.message || t.error}`)
            printText(lines)
        } else {
            printText(`查询失败: HTTP ${resp.status} - ${resp.data?.error || resp.message || 'unknown'}`)
        }
    }
    return mapResponseToExitCode(resp, EXIT_CODES.OK)
}

export async function runTaskCancelCommand(ctx, taskId) {
    const { instance, isJson, clientRunning } = ctx
    if (!taskId) {
        if (isJson) printJson({ ok: false, error: 'INVALID_PARAMS', message: 'taskId is required' })
        else printText('错误: taskId 不能为空')
        return EXIT_CODES.INVALID_PARAMS
    }
    if (!clientRunning) {
        if (isJson) printJson({ ok: false, error: 'CLIENT_NOT_RUNNING' })
        else printText('错误: DVStudio 客户端未运行')
        return EXIT_CODES.CLIENT_NOT_RUNNING
    }
    const resp = await post(instance, `/v1/tasks/${encodeURIComponent(taskId)}/cancel`, {}, 10000)
    if (isJson) {
        printJson(resp.data || { ok: false, raw: resp.raw })
    } else {
        if (resp.status === 200 && resp.data?.ok) {
            printText(`✓ 任务 ${taskId} 已取消`)
        } else {
            printText(`取消失败: HTTP ${resp.status} - ${resp.data?.error || resp.message || 'unknown'}`)
        }
    }
    return mapResponseToExitCode(resp, EXIT_CODES.OK)
}
