/**
 * DVStudio 导演控制台 Pipe Server
 *
 * 在 Electron 主进程中创建一个命名管道/TCP socket 服务器，
 * 接收来自外部进程（如 DSH 插件）的 op 请求，
 * 通过 IPC 转发到渲染进程的 DirectorConsoleToolHandler，然后返回结果。
 *
 * 与 socketBridge.mjs 的区别：
 * - 不处理 tools/list 和 tool 调用（工具注册在 DSH 插件内，不经过 Electron）
 * - 只处理 type: 'op' 请求，将 op 和 payload 转发到渲染进程
 * - 启动时写入配置文件，停止时删除
 */

import net from 'net'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { ipcMain, BrowserWindow } from 'electron'
import logger from '../../../core/logger.mjs'

const PIPE_NAME =
	process.platform === 'win32'
		? '\\\\.\\pipe\\dvstudio-director'
		: path.join(os.tmpdir(), 'dvstudio-director.sock')

const CONFIG_PATH = path.join(os.tmpdir(), 'dvstudio-director-config.json')

const TOOL_CALL_CHANNEL = 'dweb:builtin-tool:call'
const TOOL_RESPONSE_CHANNEL_PREFIX = 'dweb:builtin-tool:'

const OP_TIMEOUT_MS = 60000

class DirectorPipeServer {
	constructor() {
		this.server = null
		this.isRunning = false
		this.isStarting = false
		this.mainWindow = null
		this.directorConsoleWindow = null
		this.requestCounter = 0
		this.httpPort = 0
		this.httpServer = null
	}

	setMainWindow(win) {
		this.mainWindow = win
	}

	/**
	 * 设置导演控制台窗口引用。
	 *
	 * dc_* 工具调用必须路由到导演控制台窗口（其渲染进程注册了
	 * DirectorConsoleToolHandler），而不是主窗口（主窗口的
	 * useAgentToolBridge 不识别 dc_* 工具，会返回 "Unknown tool"）。
	 */
	setDirectorConsoleWindow(win) {
		this.directorConsoleWindow = win
	}

	setHttpPort(port) {
		this.httpPort = port
	}

	setHttpServer(httpServer) {
		this.httpServer = httpServer
	}

	nextRequestId() {
		return `director-${Date.now()}-${++this.requestCounter}`
	}

	start(httpPort = 0) {
		// 已启动或正在启动中，避免重复 listen 导致 EADDRINUSE
		if (this.isRunning || this.isStarting) {
			return
		}

		this.isStarting = true
		this.httpPort = httpPort

		try {
			this.server = net.createServer((socket) => {
				logger.debug('[Director Pipe] Client connected')

				let buffer = ''

				socket.on('data', async (data) => {
					buffer += data.toString()

					const lines = buffer.split('\n')
					buffer = lines.pop() || ''

					for (const line of lines) {
						if (!line.trim()) continue
						await this.handleRequest(socket, line)
					}
				})

				socket.on('error', (err) => {
					logger.debug(`[Director Pipe] Socket error: ${err.message}`)
				})

				socket.on('close', () => {
					logger.debug('[Director Pipe] Client disconnected')
				})
			})

			this.server.on('error', (err) => {
				// EADDRINUSE 表示管道已被占用，说明已有实例在运行
				if (err.code === 'EADDRINUSE') {
					logger.warn(
						`[Director Pipe] Pipe already in use (${PIPE_NAME}), assuming bridge is already running`
					)
					this.isRunning = true
					this.isStarting = false
					try {
						this.server.close()
					} catch {
						/* 忽略关闭错误 */
					}
					this.server = null
					return
				}
				logger.error(`[Director Pipe] Server error: ${err.message}`)
				this.isStarting = false
			})

			// Unix 域套接字文件可能残留，先尝试删除
			if (process.platform !== 'win32') {
				try {
					fs.unlinkSync(PIPE_NAME)
				} catch {
					/* 忽略 */
				}
			}

			this.server.listen(PIPE_NAME, () => {
				this.isRunning = true
				this.isStarting = false
				logger.info(`[Director Pipe] Server listening on: ${PIPE_NAME}`)
				this.writeDirectorConfig(PIPE_NAME, this.httpPort)
			})
		} catch (err) {
			logger.error(`[Director Pipe] Failed to start: ${err.message}`)
			this.isStarting = false
		}
	}

	async handleRequest(socket, line) {
		try {
			const request = JSON.parse(line)
			const { type, op, payload } = request

			if (type === 'ping' || type === 'health') {
				socket.write(JSON.stringify({ ok: true, pong: true }) + '\n')
				return
			}

			if (type !== 'op') {
				socket.write(
					JSON.stringify({ ok: false, error: `Unsupported request type: ${type}` }) + '\n'
				)
				return
			}

			if (!op) {
				socket.write(JSON.stringify({ ok: false, error: 'Missing op field' }) + '\n')
				return
			}

			logger.debug(`[Director Pipe] op request: ${op}`)

			try {
				const result = await this.forwardOpToRenderer(op, payload || {})
				socket.write(JSON.stringify({ ok: true, result }) + '\n')
			} catch (err) {
				socket.write(JSON.stringify({ ok: false, error: err.message }) + '\n')
			}
		} catch (err) {
			logger.error(`[Director Pipe] Invalid request: ${err.message}`)
			try {
				socket.write(JSON.stringify({ ok: false, error: `Invalid request: ${err.message}` }) + '\n')
			} catch {
				/* 忽略 */
			}
		}
	}

	/**
	 * 将 op 请求转发到渲染进程的 DirectorConsoleToolHandler。
	 * 复用 dweb:builtin-tool:call IPC 通道（与 toolExecutor.mjs 一致）。
	 *
	 * 渲染进程的 DirectorConsoleToolHandler 监听 dweb:builtin-tool:call，
	 * 通过 respondBuiltinTool(requestId, result, error) 回传结果到
	 * dweb:builtin-tool:{requestId}:response 通道。
	 *
	 * 路由规则：
	 *   - dc_* 开头的 op → 优先发到导演控制台窗口（DirectorConsoleToolHandler）
	 *     避免 mainWindow 的 useAgentToolBridge 因不识别 dc_* 而抛 "Unknown tool"
	 *   - 其他 op → 发到 mainWindow
	 *   - 目标窗口不可用时 → 广播到所有窗口兜底
	 *
	 * @param {string} op - 操作名（如 dc_add_character）
	 * @param {object} payload - 操作参数
	 * @returns {Promise<unknown>} 渲染进程返回的结果
	 */
	forwardOpToRenderer(op, payload) {
		const requestId = this.nextRequestId()
		const responseChannel = `${TOOL_RESPONSE_CHANNEL_PREFIX}${requestId}:response`

		return new Promise((resolve, reject) => {
			let timeout = null
			let handlerRegistered = false

			const cleanup = () => {
				if (timeout) {
					clearTimeout(timeout)
					timeout = null
				}
				if (handlerRegistered) {
					ipcMain.removeHandler(responseChannel)
					ipcMain.removeAllListeners(responseChannel)
					handlerRegistered = false
				}
			}

			timeout = setTimeout(() => {
				cleanup()
				reject(new Error(`op ${op} timed out after ${OP_TIMEOUT_MS}ms`))
			}, OP_TIMEOUT_MS)

			const handler = (_event, response) => {
				cleanup()
				if (response && response.error) {
					reject(new Error(response.error))
				} else {
					resolve(response?.result ?? response)
				}
			}

			ipcMain.once(responseChannel, handler)
			handlerRegistered = true

			// 路由：dc_* 工具调用优先发到导演控制台窗口
			// 导演控制台窗口的渲染进程注册了 DirectorConsoleToolHandler，
			// 能正确处理 dc_* 工具；主窗口的 useAgentToolBridge 不识别 dc_*，
			// 会返回 "Unknown tool" 错误。
			const isDirectorTool = typeof op === 'string' && op.startsWith('dc_')
			let targetWin = null
			if (isDirectorTool) {
				const dcWin = this.directorConsoleWindow
				if (dcWin && !dcWin.isDestroyed()) {
					targetWin = dcWin
				}
			}
			if (!targetWin) {
				targetWin = this.mainWindow
			}

			if (!targetWin || targetWin.isDestroyed()) {
				// 回退：广播到所有窗口
				const windows = BrowserWindow.getAllWindows()
				if (windows.length === 0) {
					cleanup()
					reject(new Error('No renderer window available'))
					return
				}
				logger.debug(
					`[Director Pipe] op ${op} broadcasting to ${windows.length} windows (target unavailable)`
				)
				for (const w of windows) {
					try {
						w.webContents.send(TOOL_CALL_CHANNEL, {
							requestId,
							toolName: op,
							args: payload
						})
					} catch (err) {
						logger.debug(`[Director Pipe] Failed to send to window: ${err.message}`)
					}
				}
				return
			}

			try {
				targetWin.webContents.send(TOOL_CALL_CHANNEL, {
					requestId,
					toolName: op,
					args: payload
				})
			} catch (err) {
				cleanup()
				reject(new Error(`Failed to send IPC: ${err.message}`))
			}
		})
	}

	/**
	 * 写入配置文件，供外部进程（如 DSH 插件）发现 Pipe 和 HTTP 端口。
	 */
	writeDirectorConfig(pipeName, httpPort) {
		try {
			const config = {
				pipeName,
				httpPort,
				pid: process.pid,
				updatedAt: new Date().toISOString()
			}
			fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
			logger.info(`[Director Pipe] Config written to: ${CONFIG_PATH}`)
		} catch (err) {
			logger.error(`[Director Pipe] Failed to write config: ${err.message}`)
		}
	}

	/**
	 * 删除配置文件。
	 */
	removeDirectorConfig() {
		try {
			if (fs.existsSync(CONFIG_PATH)) {
				fs.unlinkSync(CONFIG_PATH)
				logger.info(`[Director Pipe] Config removed: ${CONFIG_PATH}`)
			}
		} catch (err) {
			logger.warn(`[Director Pipe] Failed to remove config: ${err.message}`)
		}
	}

	stop() {
		if (!this.isRunning && !this.isStarting && !this.httpServer) {
			return
		}

		try {
			if (this.server) {
				this.server.close()
			}
		} catch (err) {
			logger.warn(`[Director Pipe] Error stopping pipe: ${err.message}`)
		}

		// 关闭 HTTP fallback server，释放端口与底层 socket 资源
		// 避免应用退出后残留监听端口被外部进程（如 DSH 插件）误连，
		// 进而导致 node.exe 启动时加载到失效的句柄而报 0xc0000142。
		try {
			if (this.httpServer) {
				this.httpServer.close()
				this.httpServer.removeAllListeners()
			}
		} catch (err) {
			logger.warn(`[Director Pipe] Error stopping http: ${err.message}`)
		}

		// Unix 域套接字文件清理
		if (process.platform !== 'win32') {
			try {
				fs.unlinkSync(PIPE_NAME)
			} catch {
				/* 忽略 */
			}
		}

		this.removeDirectorConfig()

		this.isRunning = false
		this.isStarting = false
		this.server = null
		this.httpServer = null
		logger.info('[Director Pipe] Server stopped')
	}

	getStatus() {
		return {
			isRunning: this.isRunning,
			pipeName: PIPE_NAME,
			httpPort: this.httpPort
		}
	}
}

let directorInstance = null

export function getDirectorPipeServer() {
	if (!directorInstance) {
		directorInstance = new DirectorPipeServer()
	}
	return directorInstance
}

export { DirectorPipeServer, PIPE_NAME, CONFIG_PATH }
