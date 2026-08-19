import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { URL } from 'node:url'
import logger from '../../core/logger.mjs'
import {
    CLI_CONTROL_RUNTIME_FILENAME,
    CLI_CONTROL_PORT_RANGE_START,
    CLI_CONTROL_PORT_RANGE_END,
    CLI_CONTROL_FEATURE_FLAG,
    CLI_TOKEN_HEADER
} from './types.mjs'
import {
    generateToken,
    verifyRequestToken,
    writeRestrictedJson,
    safeDeleteFile,
    readJsonIfExists
} from './auth.mjs'

const log = logger.child('cli-control-server:http')

/** @type {http.Server|null} */
let _server = null
let _port = 0
let _token = ''
let _runtimeFilePath = ''

function resolveRuntimeDir() {
    // 优先级 1：环境变量（与项目主流程统一使用 DWEB_RESOURCE_DIR）
    const envResourceDir = String(process.env.DWEB_RESOURCE_DIR || process.env.DVS_RESOURCE_DIR || '').trim()
    if (envResourceDir) {
        const dir = path.resolve(envResourceDir, 'Runtime')
        return { runtimeDir: dir, source: 'env' }
    }
    // 优先级 2：便携模式（工作目录下 DVSResource/Runtime）
    const portableDir = path.resolve(process.cwd(), 'DVSResource', 'Runtime')
    if (fs.existsSync(path.dirname(portableDir)) || process.env.ELECTRON_DEV) {
        return { runtimeDir: portableDir, source: 'portable' }
    }
    // 优先级 3：安装模式（%APPDATA%/DVStudio/DVSResource/Runtime）
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    const installDir = path.resolve(appData, 'DVStudio', 'DVSResource', 'Runtime')
    return { runtimeDir: installDir, source: 'install' }
}

function sendJson(res, statusCode, data) {
    const body = JSON.stringify(data)
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, ' + CLI_TOKEN_HEADER
    })
    res.end(body)
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = ''
        let size = 0
        const MAX_SIZE = 10 * 1024 * 1024 // 10MB（含参考图路径+buffer）
        req.on('data', (chunk) => {
            size += chunk.length
            if (size > MAX_SIZE) {
                reject(new Error('Request body too large (>10MB)'))
                req.destroy()
                return
            }
            data += chunk.toString('utf8')
        })
        req.on('end', () => {
            if (!data.trim()) return resolve({})
            try {
                resolve(JSON.parse(data))
            } catch (e) {
                reject(new Error('Invalid JSON body'))
            }
        })
        req.on('error', reject)
    })
}

/**
 * 处理 /health 端点（无 Token 也可访问，仅返回 running=true/false）
 */
function handleHealth(req, res, deps) {
    const appVersion = process.env.npm_package_version || deps?.appVersion || '0.0.0'
    const result = {
        ok: true,
        running: true,
        server: {
            host: '127.0.0.1',
            port: _port,
            url: `http://127.0.0.1:${_port}`
        },
        app: {
            name: 'DVStudio',
            version: appVersion
        },
        agent: { ready: deps?.isAgentReady ? deps.isAgentReady() : false, runtime: 'dvsagent' },
        mcp: { builtinToolsCount: deps?.getBuiltinToolsCount ? deps.getBuiltinToolsCount() : 13 }
    }
    // 补充当前项目信息
    if (deps?.getCurrentProjectInfo) {
        const proj = deps.getCurrentProjectInfo()
        if (proj) result.app.currentProject = proj
    }
    sendJson(res, 200, result)
}

/**
 * 处理工具定义查询（鉴权后）
 */
function handleToolsList(req, res) {
    const tools = [
        {
            name: 'generate_image',
            description: '在DVStudio AI工作流蓝图中创建图片节点并执行图片生成任务，完成后可复制结果到指定路径。',
            parameters: {
                type: 'object',
                required: ['prompt'],
                properties: {
                    prompt: { type: 'string', description: '图片生成提示词' },
                    width: { type: 'number', description: '图片宽度像素', default: 1024 },
                    height: { type: 'number', description: '图片高度像素', default: 1024 },
                    references: { type: 'array', items: { type: 'string' }, description: '参考图本地绝对路径列表' },
                    outputPath: { type: 'string', description: '生成完成后复制到该本地路径' },
                    model: { type: 'string', enum: ['gemini', 'seedream', 'meshy', 'tripo3d'], description: '图片生成模型', default: 'gemini' },
                    negativePrompt: { type: 'string', description: '负向提示词' },
                    imageCount: { type: 'number', description: '生成图片数量', default: 1 },
                    aspectRatio: { type: 'string', enum: ['1:1','16:9','9:16','4:3','3:4'], description: '宽高比' },
                    seed: { type: 'number', description: '随机种子', default: -1 },
                    projectId: { type: 'number', description: '目标项目ID（默认当前打开项目）' },
                    autoExport: { type: 'boolean', description: '自动复制到outputPath', default: true }
                }
            },
            returns: {
                type: 'object',
                properties: {
                    taskId: { type: 'string' },
                    nodeId: { type: 'string' },
                    status: { type: 'string', enum: ['completed','failed'] },
                    outputFiles: { type: 'array', items: { type: 'string' } },
                    exportedFiles: { type: 'array', items: { type: 'string' } }
                }
            },
            cliExample: 'dvscli generate-image --prompt "一只可爱的猫咪" --width 1024 --height 1024 --outputPath "C:/outputs/cat.png"'
        }
    ]
    sendJson(res, 200, { ok: true, tools })
}

async function handleGenerateImage(req, res, deps) {
    try {
        if (typeof deps?.submitGenerateImageTask !== 'function') {
            return sendJson(res, 501, { ok: false, error: 'NOT_IMPLEMENTED', message: 'submitGenerateImageTask dep missing (service layer not initialized)' })
        }
        const payload = await readBody(req)
        if (!payload || !payload.prompt || typeof payload.prompt !== 'string') {
            return sendJson(res, 400, { ok: false, error: 'INVALID_PARAMS', message: 'prompt is required (string)' })
        }
        const result = await deps.submitGenerateImageTask(payload)
        sendJson(res, 200, result)
    } catch (err) {
        log.error(`handleGenerateImage error: ${err.message}`)
        sendJson(res, 500, { ok: false, error: 'INTERNAL_ERROR', message: err.message })
    }
}

function handleTaskGet(req, res, deps, taskId) {
    if (typeof deps?.getTask !== 'function') {
        return sendJson(res, 501, { ok: false, error: 'NOT_IMPLEMENTED', message: 'getTask dep missing' })
    }
    const task = deps.getTask(taskId)
    if (!task) {
        return sendJson(res, 404, { ok: false, error: 'TASK_NOT_FOUND' })
    }
    sendJson(res, 200, { ok: true, task })
}

function handleTaskCancel(req, res, deps, taskId) {
    if (typeof deps?.cancelTask !== 'function') {
        return sendJson(res, 501, { ok: false, error: 'NOT_IMPLEMENTED', message: 'cancelTask dep missing' })
    }
    const result = deps.cancelTask(taskId)
    sendJson(res, result.ok ? 200 : 400, result)
}

/**
 * 创建 HTTP 请求处理器
 */
function createRequestHandler(deps) {
    return async (req, res) => {
        // CORS OPTIONS 预检
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, ' + CLI_TOKEN_HEADER
            })
            return res.end()
        }

        try {
            const url = new URL(req.url, `http://127.0.0.1:${_port}`)
            const pathname = url.pathname

            // /health 是公开端点
            if (pathname === '/health' && req.method === 'GET') {
                return handleHealth(req, res, deps)
            }

            // 其余端点需要 Token
            if (!verifyRequestToken(req, _token)) {
                return sendJson(res, 401, { ok: false, error: 'AUTH_FAILED', message: 'Invalid or missing token' })
            }

            if (pathname === '/tools' && req.method === 'GET') {
                return handleToolsList(req, res)
            }
            if (pathname === '/v1/generate-image' && req.method === 'POST') {
                return await handleGenerateImage(req, res, deps)
            }

            // /v1/tasks/:taskId
            const taskMatch = pathname.match(/^\/v1\/tasks\/([^/]+)$/)
            if (taskMatch) {
                const taskId = taskMatch[1]
                if (req.method === 'GET') return handleTaskGet(req, res, deps, taskId)
                if (req.method === 'POST') {
                    const cancelMatch = pathname.match(/^\/v1\/tasks\/[^/]+\/cancel/)
                    if (cancelMatch || url.pathname.endsWith('/cancel')) return handleTaskCancel(req, res, deps, taskId)
                }
            }
            // POST /v1/tasks/:taskId/cancel
            const cancelMatch = pathname.match(/^\/v1\/tasks\/([^/]+)\/cancel$/)
            if (cancelMatch && req.method === 'POST') {
                return handleTaskCancel(req, res, deps, cancelMatch[1])
            }

            sendJson(res, 404, { ok: false, error: 'NOT_FOUND', path: pathname })
        } catch (err) {
            log.error(`Request handler error: ${err.message}`)
            sendJson(res, 500, { ok: false, error: 'INTERNAL_ERROR', message: err.message })
        }
    }
}

/**
 * 启动控制服务器（与 startUnrealHttpServer 模式完全一致）
 * @param {Object} deps - { appVersion, isAgentReady, getBuiltinToolsCount, getCurrentProjectInfo, submitGenerateImageTask, getTask, cancelTask }
 */
export function startCliControlServer(deps = {}) {
    return new Promise((resolve) => {
        try {
            // Feature Flag 检查
            if (process.env[CLI_CONTROL_FEATURE_FLAG] === '1') {
                log.info(`CLI control server disabled via feature flag ${CLI_CONTROL_FEATURE_FLAG}`)
                return resolve({ ok: false, disabled: true })
            }
            if (_server) {
                return resolve({ ok: true, port: _port, alreadyRunning: true })
            }

            const { runtimeDir, source } = resolveRuntimeDir()
            _runtimeFilePath = path.resolve(runtimeDir, CLI_CONTROL_RUNTIME_FILENAME)

            _server = http.createServer(createRequestHandler(deps))
            _server.on('error', (err) => {
                log.error(`CLI control server error: ${err.message}`)
            })

            // 随机选择端口（在指定范围内）
            const tryStart = (attempt = 0) => {
                if (attempt > 100) {
                    log.error('Failed to bind CLI control server port after 100 attempts')
                    return resolve({ ok: false, error: 'PORT_BIND_FAILED' })
                }
                const range = CLI_CONTROL_PORT_RANGE_END - CLI_CONTROL_PORT_RANGE_START
                const tryPort = CLI_CONTROL_PORT_RANGE_START + Math.floor(Math.random() * range)
                _server.listen(tryPort, '127.0.0.1', () => {
                    _port = _server.address().port
                    _token = generateToken()
                    const appVersion = process.env.npm_package_version || deps?.appVersion || '0.0.0'
                    const config = {
                        pid: process.pid,
                        host: '127.0.0.1',
                        port: _port,
                        token: _token,
                        startedAt: new Date().toISOString(),
                        version: appVersion
                    }
                    const writeResult = writeRestrictedJson(_runtimeFilePath, config)
                    if (!writeResult.ok) {
                        log.warn(`Failed to write runtime config (CLI control discovery unavailable): ${writeResult.error}`)
                    }
                    log.info(`CLI control server started on port ${_port} (runtime dir: ${source} -> ${runtimeDir})`)
                    resolve({ ok: true, port: _port, token: _token, runtimeFilePath: _runtimeFilePath })
                })
                _server.once('error', (err) => {
                    if (err.code === 'EADDRINUSE') {
                        log.debug(`Port ${tryPort} in use, retrying (attempt ${attempt + 1})`)
                        setTimeout(() => tryStart(attempt + 1), 10)
                    } else {
                        resolve({ ok: false, error: err.message })
                    }
                })
            }
            tryStart()
        } catch (err) {
            log.error(`startCliControlServer unexpected error: ${err.message}`)
            resolve({ ok: false, error: err.message })
        }
    })
}

export function stopCliControlServer() {
    try {
        if (_runtimeFilePath) {
            safeDeleteFile(_runtimeFilePath)
            _runtimeFilePath = ''
        }
        if (_server) {
            _server.close()
            _server = null
            _port = 0
            _token = ''
            log.info('CLI control server stopped')
        }
        return { ok: true }
    } catch (err) {
        log.warn(`stopCliControlServer error: ${err.message}`)
        return { ok: false, error: err.message }
    }
}

export function getCliControlServerPort() {
    return _port
}

export function getCliControlServerToken() {
    return _token
}

export function getRuntimeFilePath() {
    return _runtimeFilePath
}
