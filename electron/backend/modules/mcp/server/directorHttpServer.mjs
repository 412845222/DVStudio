/**
 * DVStudio 导演控制台 HTTP Server
 *
 * 作为 Pipe Server 的 HTTP fallback，固定端口 51830（占用时递增）。
 * 提供健康检查和 op 转发接口，转发逻辑与 Pipe Server 一致。
 *
 * 路由：
 * - GET  /api/director/health  → { ok: true }
 * - POST /api/director/action  → 转发到渲染进程（与 Pipe Server 相同的转发逻辑）
 */

import http from 'http'
import logger from '../../../core/logger.mjs'

const DEFAULT_PORT = 51830
const MAX_PORT_ATTEMPTS = 100

/**
 * 启动 HTTP fallback server。
 *
 * @param {Electron.BrowserWindow} mainWindow - 主窗口引用（保留参数，转发逻辑通过 pipeServer 完成）
 * @param {DirectorPipeServer} pipeServer - Pipe Server 实例，提供 forwardOpToRenderer 方法
 * @returns {Promise<{ port: number, server: http.Server }>}
 */
export function startDirectorHttpServer(mainWindow, pipeServer) {
	let server = null

	const tryListen = (port) => {
		return new Promise((resolve, reject) => {
			const httpServer = http.createServer(async (req, res) => {
				handleHttpRequest(req, res, pipeServer)
			})

			httpServer.on('error', (err) => {
				if (err.code === 'EADDRINUSE') {
					resolve({ ok: false, port, server: httpServer })
				} else {
					reject(err)
				}
			})

			httpServer.listen(port, '127.0.0.1', () => {
				resolve({ ok: true, port, server: httpServer })
			})

			server = httpServer
		})
	}

	return (async () => {
		let port = DEFAULT_PORT
		let attempts = 0

		while (attempts < MAX_PORT_ATTEMPTS) {
			const result = await tryListen(port)
			if (result.ok) {
				logger.info(`[Director HTTP] Server listening on http://127.0.0.1:${port}`)
				return { port, server: result.server }
			}

			// EADDRINUSE，关闭当前实例并尝试下一个端口
			try {
				result.server.close()
			} catch {
				/* 忽略 */
			}
			port++
			attempts++
		}

		throw new Error(`[Director HTTP] Could not find available port starting from ${DEFAULT_PORT}`)
	})()
}

/**
 * 处理 HTTP 请求。
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {DirectorPipeServer} pipeServer
 */
async function handleHttpRequest(req, res, pipeServer) {
	try {
		const url = new URL(req.url, `http://127.0.0.1`)
		const pathname = url.pathname

		// CORS headers
		res.setHeader('Access-Control-Allow-Origin', '*')
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

		if (req.method === 'OPTIONS') {
			res.writeHead(204)
			res.end()
			return
		}

		// GET /api/director/health
		if (req.method === 'GET' && pathname === '/api/director/health') {
			res.writeHead(200, { 'Content-Type': 'application/json' })
			res.end(JSON.stringify({ ok: true }))
			return
		}

		// POST /api/director/action
		if (req.method === 'POST' && pathname === '/api/director/action') {
			const body = await readRequestBody(req)
			let request
			try {
				request = JSON.parse(body || '{}')
			} catch {
				res.writeHead(400, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }))
				return
			}

			const { op, payload } = request
			if (!op) {
				res.writeHead(400, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify({ ok: false, error: 'Missing op field' }))
				return
			}

			logger.debug(`[Director HTTP] op request: ${op}`)

			try {
				const result = await pipeServer.forwardOpToRenderer(op, payload || {})
				res.writeHead(200, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify({ ok: true, result }))
			} catch (err) {
				logger.error(`[Director HTTP] Action error: ${err.message}`)
				res.writeHead(500, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify({ ok: false, error: err.message }))
			}
			return
		}

		// 404
		res.writeHead(404, { 'Content-Type': 'application/json' })
		res.end(JSON.stringify({ ok: false, error: 'Not found' }))
	} catch (err) {
		logger.error(`[Director HTTP] Request error: ${err.message}`)
		try {
			res.writeHead(500, { 'Content-Type': 'application/json' })
			res.end(JSON.stringify({ ok: false, error: err.message }))
		} catch {
			/* 忽略 */
		}
	}
}

/**
 * 读取请求体。
 *
 * @param {http.IncomingMessage} req
 * @returns {Promise<string>}
 */
function readRequestBody(req) {
	return new Promise((resolve, reject) => {
		let body = ''
		req.on('data', (chunk) => {
			body += chunk.toString()
		})
		req.on('end', () => resolve(body))
		req.on('error', reject)
	})
}

export { DEFAULT_PORT as DIRECTOR_HTTP_DEFAULT_PORT }
