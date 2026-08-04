/**
 * DVStudio 统一工具执行器
 *
 * 提供统一的工具注册、调用和IPC桥接功能：
 * - 管理所有内置工具的注册
 * - 统一通过IPC与前端通信执行工具
 * - 支持进程内直接调用（用于MCP Server和内部Agent）
 * - 支持外部MCP客户端通过socket/stdio调用
 */

import { BrowserWindow, ipcMain } from 'electron'
import logger from '../../core/logger.mjs'

const TOOL_TIMEOUT_MS = 60000

const TOOL_CALL_CHANNEL = 'dweb:builtin-tool:call'
const TOOL_RESPONSE_CHANNEL_PREFIX = 'dweb:builtin-tool:'

function broadcastToWindows(channel, payload) {
	const windows = BrowserWindow.getAllWindows()
	for (const win of windows) {
		try {
			win.webContents.send(channel, payload)
		} catch (err) {
			logger.debug(`Failed to broadcast to window: ${err.message}`)
		}
	}
}

class ToolExecutor {
	constructor() {
		this.tools = new Map()
		this.requestCounter = 0
		this.ipcHandlerRegistered = false
		this.pendingRequests = new Map()
	}

	nextRequestId() {
		return `tool-${Date.now()}-${++this.requestCounter}`
	}

	/**
	 * 注册一个工具
	 * @param {string} name - 工具名称
	 * @param {string} description - 工具描述
	 * @param {object} inputSchema - 工具参数schema (JSON Schema格式)
	 * @param {Function} [handler] - 可选的进程内处理器，如果不提供则通过IPC转发到前端
	 */
	registerTool(name, description, inputSchema, handler) {
		if (this.tools.has(name)) {
			logger.warn(`[ToolExecutor] Tool ${name} already registered, overwriting`)
		}

		this.tools.set(name, {
			name,
			description,
			inputSchema: inputSchema || { type: 'object', properties: {} },
			handler: handler || null
		})

		logger.debug(`[ToolExecutor] Registered tool: ${name}`)
	}

	/**
	 * 检查工具是否存在
	 */
	hasTool(name) {
		return this.tools.has(name)
	}

	/**
	 * 获取工具定义
	 */
	getTool(name) {
		return this.tools.get(name) || null
	}

	/**
	 * 列出所有已注册工具
	 */
	listTools() {
		return Array.from(this.tools.values()).map((t) => ({
			name: t.name,
			description: t.description,
			inputSchema: t.inputSchema,
			hasHandler: !!t.handler
		}))
	}

	/**
	 * 获取MCP格式的工具列表（用于MCP Server响应）
	 */
	getMCPTools() {
		return Array.from(this.tools.values()).map((t) => ({
			name: t.name,
			description: t.description,
			inputSchema: t.inputSchema
		}))
	}

	/**
	 * 调用工具
	 * @param {string} name - 工具名称
	 * @param {object} args - 工具参数
	 * @param {object} options - 调用选项
	 * @param {string} options.requestId - 自定义请求ID
	 * @param {boolean} options.skipFrontend - 如果工具在进程内有handler，跳过前端IPC
	 * @returns {Promise<object>} 工具执行结果
	 */
	async callTool(name, args = {}, options = {}) {
		const tool = this.tools.get(name)
		if (!tool) {
			throw new Error(`Unknown tool: ${name}`)
		}

		const requestId = options.requestId || this.nextRequestId()

		if (tool.handler && options.skipFrontend !== false) {
			logger.debug(`[ToolExecutor] Calling tool ${name} via in-process handler (${requestId})`)
			try {
				const result = await tool.handler(args, { requestId })
				return result
			} catch (err) {
				logger.error(`[ToolExecutor] Tool ${name} handler error: ${err.message}`)
				throw err
			}
		}

		return this.callToolViaIPC(name, args, requestId)
	}

	/**
	 * 通过IPC调用前端工具
	 */
	callToolViaIPC(toolName, args, requestId) {
		return new Promise((resolve, reject) => {
			const responseChannel = `${TOOL_RESPONSE_CHANNEL_PREFIX}${requestId}:response`
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
				this.pendingRequests.delete(requestId)
			}

			timeout = setTimeout(() => {
				cleanup()
				reject(new Error(`Tool ${toolName} timed out after ${TOOL_TIMEOUT_MS}ms`))
			}, TOOL_TIMEOUT_MS)

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
			this.pendingRequests.set(requestId, { toolName, args, startTime: Date.now() })

			logger.debug(`[ToolExecutor] Calling tool ${toolName} via IPC (${requestId})`)

			broadcastToWindows(TOOL_CALL_CHANNEL, {
				requestId,
				toolName,
				args
			})
		})
	}

	/**
	 * 注册IPC处理器（用于前端响应）
	 * 这个方法在后端初始化时调用一次
	 */
	registerIPCBridge() {
		if (this.ipcHandlerRegistered) {
			return
		}

		logger.info('[ToolExecutor] IPC bridge registered')
		this.ipcHandlerRegistered = true
	}

	/**
	 * 获取待处理请求统计
	 */
	getPendingStats() {
		return {
			pendingCount: this.pendingRequests.size,
			toolsCount: this.tools.size,
			requests: Array.from(this.pendingRequests.entries()).map(([id, req]) => ({
				id,
				toolName: req.toolName,
				elapsed: Date.now() - req.startTime
			}))
		}
	}
}

const GLOBAL_KEY = Symbol.for('dvstudio.toolExecutor')

export function getToolExecutor() {
	if (!globalThis[GLOBAL_KEY]) {
		globalThis[GLOBAL_KEY] = new ToolExecutor()
	}
	return globalThis[GLOBAL_KEY]
}

export { TOOL_CALL_CHANNEL, TOOL_RESPONSE_CHANNEL_PREFIX }
