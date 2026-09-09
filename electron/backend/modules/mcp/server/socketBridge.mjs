/**
 * MCP Socket桥接服务器
 *
 * 在Electron主进程中创建一个命名管道/TCP socket服务器，
 * 接收来自stdioBridge.mjs的工具调用请求，通过ToolExecutor执行，然后返回结果。
 */

import net from 'net'
import path from 'path'
import os from 'os'
import { getToolExecutor } from '../toolExecutor.mjs'
import logger from '../../../core/logger.mjs'

const SOCKET_PATH =
	process.platform === 'win32'
		? '\\\\.\\pipe\\dvstudio-mcp-bridge'
		: path.join(os.tmpdir(), 'dvstudio-mcp-bridge.sock')

export class MCPBridgeServer {
	constructor() {
		this.server = null
		this.isRunning = false
		this.isStarting = false
		this.toolRequestCounter = 0
	}

	start() {
		// 已启动或正在启动中，避免重复 listen 导致 EADDRINUSE
		if (this.isRunning || this.isStarting) {
			return
		}

		this.isStarting = true

		try {
			this.server = net.createServer((socket) => {
				logger.debug('[MCP Bridge] Client connected')

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
					logger.debug(`[MCP Bridge] Socket error: ${err.message}`)
				})

				socket.on('close', () => {
					logger.debug('[MCP Bridge] Client disconnected')
				})
			})

			this.server.on('error', (err) => {
				// EADDRINUSE 表示管道已被占用，说明已有实例在运行
				if (err.code === 'EADDRINUSE') {
					logger.warn(
						`[MCP Bridge] Pipe already in use (${SOCKET_PATH}), assuming bridge is already running`
					)
					// 管道已被占用，视为已在运行
					this.isRunning = true
					this.isStarting = false
					// 清理当前 server 实例（无法复用已占用的管道）
					try {
						this.server.close()
					} catch {
						/* 忽略关闭错误 */
					}
					this.server = null
					return
				}
				logger.error(`[MCP Bridge] Server error: ${err.message}`)
				this.isStarting = false
			})

			this.server.listen(SOCKET_PATH, () => {
				this.isRunning = true
				this.isStarting = false
				logger.info(`[MCP Bridge] Server listening on: ${SOCKET_PATH}`)
			})
		} catch (err) {
			logger.error(`[MCP Bridge] Failed to start: ${err.message}`)
			this.isStarting = false
		}
	}

	async handleRequest(socket, line) {
		const executor = getToolExecutor()
		try {
			const request = JSON.parse(line)
			const { requestId, action, toolName, args } = request

			if (action === 'ping') {
				socket.write(JSON.stringify({ requestId, result: { pong: true } }) + '\n')
				return
			}

			if (action === 'tools/list') {
				const tools = executor.getMCPTools()
				logger.info(
					`[MCP Bridge] tools/list requested, returning ${tools.length} tools: ${tools
						.map((t) => t.name)
						.join(', ')}`
				)
				const response = JSON.stringify({
					requestId,
					result: tools
				})
				socket.write(response + '\n')
				return
			}

			this.toolRequestCounter++
			logger.debug(
				`[MCP Bridge] Tool request #${this.toolRequestCounter}: ${toolName} (${requestId})`
			)

			try {
				const result = await executor.callTool(toolName, args || {}, { requestId })
				const response = JSON.stringify({
					requestId,
					result
				})
				socket.write(response + '\n')
			} catch (err) {
				const response = JSON.stringify({
					requestId,
					error: err.message
				})
				socket.write(response + '\n')
			}
		} catch (err) {
			logger.error(`[MCP Bridge] Invalid request: ${err.message}`)
		}
	}

	stop() {
		if (!this.isRunning && !this.isStarting) {
			return
		}

		try {
			if (this.server) {
				this.server.close()
			}
		} catch (err) {
			logger.warn(`[MCP Bridge] Error stopping: ${err.message}`)
		}

		this.isRunning = false
		this.isStarting = false
		this.server = null
		logger.info('[MCP Bridge] Server stopped')
	}

	getStatus() {
		return {
			isRunning: this.isRunning,
			socketPath: SOCKET_PATH,
			toolCount: getToolExecutor().listTools().length
		}
	}
}

let bridgeInstance = null

export function getMCPBridgeServer() {
	if (!bridgeInstance) {
		bridgeInstance = new MCPBridgeServer()
	}
	return bridgeInstance
}
