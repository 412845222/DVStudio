import logger from '../../core/logger.mjs'
import * as taskStore from './taskStore.mjs'
import {
    startCliControlServer as httpStart,
    stopCliControlServer as httpStop,
    getCliControlServerPort
} from './httpServer.mjs'

const log = logger.child('cli-control-server:service')

// 外部依赖缓存（由 initBackend 调用时注入）
let _deps = null
let _started = false

function buildDeps(injected = {}) {
    return {
        appVersion: injected.appVersion || process.env.npm_package_version || '0.2.4',
        isAgentReady: () => {
            if (injected.isAgentReady) return injected.isAgentReady()
            return false
        },
        getBuiltinToolsCount: () => injected.getBuiltinToolsCount ? injected.getBuiltinToolsCount() : 13,
        getCurrentProjectInfo: () => {
            if (injected.getCurrentProjectInfo) return injected.getCurrentProjectInfo()
            return null
        },
        submitGenerateImageTask: async (payload) => {
            // P1 桩：创建任务记录 → 立即标记为 running → 写回 PENDING_FOR_DISPATCH，
            // 由前端 useCLIAgentTrigger 轮询并分发（P2 桥接到 Agent Runtime）
            const task = taskStore.createTask('generate-image', payload)
            log.info(`[P1 Stub] submitGenerateImageTask: taskId=${task.taskId}, prompt length=${String(payload.prompt || '').length}`)
            taskStore.markTaskRunning(task.taskId, null)
            return {
                ok: true,
                taskId: task.taskId,
                status: taskStore.getTask(task.taskId)?.status || 'running',
                note: 'Task queued for dispatch (P1: execute path in P2 phase)'
            }
        },
        getTask: (taskId) => taskStore.getTask(taskId),
        cancelTask: (taskId) => {
            const task = taskStore.markTaskCancelled(taskId)
            return task ? { ok: true, task } : { ok: false, error: 'TASK_NOT_FOUND' }
        }
    }
}

export async function initCliControlService(injected = {}) {
    if (_started) {
        return { ok: true, port: getCliControlServerPort(), alreadyStarted: true }
    }
    try {
        _deps = buildDeps(injected)
        const result = await httpStart(_deps)
        _started = result.ok
        return result
    } catch (err) {
        log.error(`initCliControlService failed: ${err.message}`)
        return { ok: false, error: err.message }
    }
}

export function shutdownCliControlService() {
    try {
        _started = false
        return httpStop()
    } catch (err) {
        log.warn(`shutdownCliControlService error: ${err.message}`)
        return { ok: false, error: err.message }
    }
}

// ===== IPC Handler 可调用的公开方法 =====

export function getServerStatus() {
    const port = getCliControlServerPort()
    const appVersion = (_deps?.appVersion) || process.env.npm_package_version || '0.2.4'
    const currentProject = _deps?.getCurrentProjectInfo ? _deps.getCurrentProjectInfo() : null
    const agentReady = _deps?.isAgentReady ? _deps.isAgentReady() : false
    const builtinToolsCount = _deps?.getBuiltinToolsCount ? _deps.getBuiltinToolsCount() : 13
    const allTasks = taskStore.listTasks({ limit: 500, offset: 0 })
    return {
        ok: true,
        running: !!_started,
        port,
        host: '127.0.0.1',
        started: _started,
        app: {
            name: 'DVStudio',
            version: appVersion,
            currentProject: currentProject || null
        },
        agent: {
            ready: agentReady,
            runtime: 'dvsagent'
        },
        mcp: {
            builtinToolsCount
        },
        stats: {
            totalTasks: allTasks.total
        }
    }
}

export function getTask(taskId) {
    const task = taskStore.getTask(taskId)
    return { ok: !!task, task }
}

export function listTasks(payload = {}) {
    const result = taskStore.listTasks(payload || {})
    return {
        ok: true,
        tasks: result.tasks,
        total: result.total,
        limit: result.limit,
        offset: result.offset
    }
}

// P2: 前端桥接完成/失败回调（通过 IPC handlers 调用）
export function markTaskCompleted(taskId, outputFiles, exportedFiles) {
    const updated = taskStore.markTaskCompleted(taskId, outputFiles, exportedFiles)
    if (!updated) return null
    return { ok: true, task: updated }
}

export function markTaskFailed(taskId, error) {
    const updated = taskStore.markTaskFailed(taskId, error)
    if (!updated) return null
    return { ok: true, task: updated }
}
