import { dialog, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'
import * as service from './service.mjs'
import { redact } from './serviceEvents.mjs'

const DSH_LOG = '[DSH-Link][main]'
function dlog(...args) {
	console.log(DSH_LOG, ...args)
}
function derr(...args) {
	console.error(DSH_LOG, ...args)
}

// Sanitize failures before the shared router logs them (source tools may echo URLs).
const safe =
	(fn) =>
	async (ctx, payload = {}) => {
		try {
			return { ok: true, value: await fn(ctx, payload) }
		} catch (error) {
			return { ok: false, error: redact(error.message || String(error)) }
		}
	}

/**
 * 将任意值转为纯 JSON 安全对象（剔除 function/Symbol/undefined/循环引用）。
 * 防止 Electron structured clone 报错——主进程返回给渲染进程的所有数据必须经过净化。
 */
function toPlain(value) {
	if (value == null) return value
	if (typeof value !== 'object') return value
	try {
		return JSON.parse(JSON.stringify(value))
	} catch {
		return null
	}
}

/**
 * 调用 DSH JSON-RPC 方法（主进程内使用）。
 * 返回归一化的 { ok, value | error }，与 harnessClient.mjs 一致。
 *
 * 关键：DSH baseUrl 可能含 ?token=xxx 查询参数（来自 announcedUrl），
 * 必须先解析出 origin 和 token，用 token 换取会话 cookie，
 * 然后请求 ${origin}/api/${method}（不含查询参数）并附带 cookie。
 * payload 需包装为 { args: { request: <实际payload> } }。
 */
async function callDsh(baseUrl, method, payload = {}, timeoutMs = 120000) {
	const rpcId = randomUUID()
	const { origin, token } = parseDshUrl(baseUrl)
	const apiUrl = `${origin}/api/${method}`
	// DSH 要求 payload 格式为 { args: { request: <实际payload> } }
	const wrappedPayload = { args: { request: payload || {} } }
	const body = JSON.stringify({ type: 'client-request', rpcId, method, payload: wrappedPayload })
	dlog('callDsh →', method, 'apiUrl=', apiUrl, 'payload=', JSON.stringify(payload).slice(0, 200))

	let cookie
	try {
		cookie = await ensureCookie(origin, token)
	} catch (err) {
		derr('callDsh ✗', method, 'cookie auth failed:', err?.message || err)
		return {
			ok: false,
			error: { code: 'AUTH', message: `DSH 鉴权失败: ${err?.message || err}`, details: {} }
		}
	}

	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	try {
		const res = await fetch(apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				Cookie: cookie
			},
			body,
			signal: controller.signal
		})
		clearTimeout(timer)
		const text = await res.text()
		let data = null
		try {
			data = text.length ? JSON.parse(text) : null
		} catch {
			/* non-JSON response */
		}
		dlog(
			'callDsh ←',
			method,
			'status=',
			res.status,
			'bodyLen=',
			text.length,
			'bodyPreview=',
			text.slice(0, 300)
		)

		// If cookie expired (401), clear cache and retry once
		if (res.status === 401) {
			dlog('callDsh: 401 received, clearing cookie cache and retrying')
			cookieCache.delete(origin)
			try {
				cookie = await ensureCookie(origin, token)
			} catch (err) {
				derr('callDsh ✗', method, 'retry cookie auth failed:', err?.message || err)
				return {
					ok: false,
					error: { code: 'AUTH', message: `DSH 鉴权失败: ${err?.message || err}`, details: {} }
				}
			}
			const retryRes = await fetch(apiUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
					Cookie: cookie
				},
				body,
				signal: AbortSignal.timeout(timeoutMs)
			})
			const retryText = await retryRes.text()
			try {
				data = retryText.length ? JSON.parse(retryText) : null
			} catch {
				/* non-JSON response */
			}
			dlog('callDsh retry ←', method, 'status=', retryRes.status, 'bodyLen=', retryText.length)
			if (!retryRes.ok) {
				const msg = (data && (data.error?.message || data.message)) || retryText.slice(0, 300)
				derr('callDsh ✗ retry', method, 'HTTP', retryRes.status, 'msg=', msg)
				return {
					ok: false,
					error: { code: 'HTTP_' + retryRes.status, message: String(msg), details: toPlain(data) }
				}
			}
		}

		if (!res.ok && res.status !== 401) {
			const msg = (data && (data.error?.message || data.message)) || text.slice(0, 300)
			derr('callDsh ✗', method, 'HTTP', res.status, 'msg=', msg)
			return {
				ok: false,
				error: { code: 'HTTP_' + res.status, message: String(msg), details: toPlain(data) }
			}
		}
		if (data && data.type === 'server-response' && data.result) {
			if (data.result.ok === false) {
				derr('callDsh ✗', method, 'server-response ok=false error=', data.result.error)
				return {
					ok: false,
					error: toPlain(data.result.error) || { code: 'UNKNOWN', message: 'unknown error' }
				}
			}
			dlog(
				'callDsh ✓',
				method,
				'server-response value=',
				JSON.stringify(data.result.value).slice(0, 200)
			)
			return { ok: true, value: toPlain(data.result.value) }
		}
		dlog('callDsh ✓', method, 'non-envelope response, value=', JSON.stringify(data).slice(0, 200))
		return { ok: true, value: toPlain(data) }
	} catch (err) {
		clearTimeout(timer)
		const msg = String(err?.message || err)
		const isAbort = msg.includes('aborted') || msg.includes('abort')
		derr('callDsh ✗', method, 'exception:', msg, 'isAbort=', isAbort)
		return {
			ok: false,
			error: {
				code: isAbort ? 'TIMEOUT' : 'NETWORK',
				message: isAbort ? `请求超时（${timeoutMs}ms）` : msg,
				details: {}
			}
		}
	}
}
export const listProfiles = safe(service.listProfiles)
export const saveProfile = safe(service.saveProfile)
export const removeProfile = safe(service.removeProfile)
export const activateProfile = safe(service.activateProfile)
export const probe = safe(service.probe)
export const diagnose = safe(service.diagnose)
export const getSnapshot = safe(service.getSnapshot)
export const clearLogs = safe(service.clearLogs)
export const startService = safe(service.startService)
export const stopService = safe(service.stopService)
export const restartService = safe(service.restartService)
export const cancelPrepare = safe(service.cancelPrepare)
export const prepare = service.prepare
export const autoSetup = service.autoSetup
export const selectPath = safe(async () => {
	const result = await dialog.showOpenDialog({
		title: '选择 DeepSeek-Harness 源码目录',
		properties: ['openDirectory', 'createDirectory']
	})
	return { cancelled: result.canceled, path: result.filePaths[0] || '' }
})
export const openUi = safe(async (_ctx, payload) => {
	await shell.openExternal(service.getOpenUrl(payload.runId))
	return true
})
export const getOpenUrl = safe(async (_ctx, payload) => {
	return service.getOpenUrl(payload.runId)
})

// Cookie cache per origin — DSH uses browser-session cookie auth.
// The launch token (from the announced URL) is exchanged once for a cookie,
// then the cookie is replayed on all subsequent /api requests.
const cookieCache = new Map() // origin → cookie string

async function ensureCookie(origin, token) {
	if (cookieCache.has(origin)) return cookieCache.get(origin)
	if (!token) {
		derr('ensureCookie: no token available for origin=', origin)
		throw new Error('DSH 启动 token 不可用')
	}
	const tokenUrl = `${origin}/?token=${encodeURIComponent(token)}`
	dlog('ensureCookie: exchanging token at', tokenUrl)
	const res = await fetch(tokenUrl, {
		method: 'GET',
		redirect: 'manual',
		signal: AbortSignal.timeout(15000)
	})
	// DSH responds with 303 + Set-Cookie; we read the cookie from headers.
	const setCookie = res.headers.get('set-cookie')
	if (!setCookie) {
		// Try reading from redirect response body or headers
		derr('ensureCookie: no Set-Cookie header, status=', res.status)
		throw new Error('DSH 鉴权失败：未返回会话 Cookie')
	}
	// Extract cookie name=value (before first semicolon)
	const cookie = setCookie.split(';')[0]
	dlog('ensureCookie: got cookie, length=', cookie.length)
	cookieCache.set(origin, cookie)
	return cookie
}

/** Parse baseUrl (may contain ?token=xxx) into { origin, token, apiUrl }. */
function parseDshUrl(baseUrl) {
	const parsed = new URL(baseUrl)
	const origin = `${parsed.protocol}//${parsed.host}`
	const token = parsed.searchParams.get('token') || ''
	return { origin, token }
}

/**
 * 代理一次 Harness JSON-RPC 调用，供渲染进程绕过浏览器 CORS 直接访问本地 Harness。
 * payload: { method: string, payload: unknown }
 * 返回值会被 safe() 包裹为 { ok: true, value: RpcResult }，
 * 渲染端 ipcCall 解包后拿到原始的 Harness RpcResult（{ ok, value | error }）。
 */
export const proxyCall = safe(async (_ctx, { method, payload }) => {
	dlog('proxyCall method=', method, 'payload=', JSON.stringify(payload || {}).slice(0, 200))
	const url = service.getCurrentUrl()
	dlog('proxyCall resolved baseUrl=', url)
	return callDsh(url, method, payload, 120000)
})

/**
 * DSH Agent 流式对话代理（WebSocket mux 版本）。
 *
 * 使用 /api/remote.mux WebSocket 调用 session/follow 流式 RPC，
 * 在主进程内获取实时流式事件，通过 IPC 流转发给渲染端。
 *
 * 流程：
 * 1. 发送 prompt（session/prompt HTTP RPC）
 * 2. 打开 WebSocket mux，发送 session/follow open 帧
 * 3. 接收 snapshot 帧（含历史事件）+ 后续实时事件帧
 * 4. yield 每个事件给 IPC 流
 * 5. 收到 turn/end 后发送 cancel 并关闭
 *
 * payload: { sessionId: string, content: string | Array<{type:'text',text:string}> }
 * yields: { seq, type, data } — 事件原样转发，由渲染端 DshStreamClient 解析。
 */
export async function* dshAgentStream(_ctx, { sessionId, content }) {
	dlog(
		'dshAgentStream start sessionId=',
		sessionId,
		'content=',
		JSON.stringify(content || {}).slice(0, 200)
	)
	const url = service.getCurrentUrl()
	dlog('dshAgentStream baseUrl=', url)
	const parts = Array.isArray(content) ? content : [{ type: 'text', text: String(content || '') }]
	const address = { kind: 'session', sessionId }

	yield { seq: -1, type: '__progress__', data: { step: 'start', baseUrl: url } }

	// 1. 发送 prompt
	const requestId = randomUUID()
	dlog('dshAgentStream sending prompt sessionId=', sessionId, 'requestId=', requestId)
	yield { seq: -1, type: '__progress__', data: { step: 'send-prompt', requestId } }
	const promptRes = await callDsh(
		url,
		'session/prompt',
		{ requestId, sessionId, mode: 'queue', content: parts },
		120000
	)
	if (!promptRes.ok) {
		derr('dshAgentStream prompt failed:', promptRes.error)
		yield { seq: -1, type: '__error__', data: { error: promptRes.error } }
		return
	}
	dlog('dshAgentStream prompt accepted=', promptRes.value)
	yield { seq: -1, type: '__progress__', data: { step: 'prompt-accepted', value: promptRes.value } }

	// 2. 打开 WebSocket mux 调用 session/follow
	const { origin, token } = parseDshUrl(url)
	let cookie
	try {
		cookie = await ensureCookie(origin, token)
	} catch (err) {
		derr('dshAgentStream cookie failed:', err?.message || err)
		yield {
			seq: -1,
			type: '__error__',
			data: { error: { code: 'AUTH', message: String(err?.message || err) } }
		}
		return
	}

	const wsUrl = origin.replace(/^http/, 'ws') + '/api/remote.mux'
	dlog('dshAgentStream opening WebSocket to', wsUrl)
	yield { seq: -1, type: '__progress__', data: { step: 'ws-connecting', wsUrl } }

	const streamId = randomUUID()
	const ws = new WebSocket(wsUrl, {
		headers: { Cookie: cookie }
	})

	const eventQueue = []
	let wsError = null
	let wsClosed = false
	let resolveWake = null
	const wake = () => {
		if (resolveWake) {
			const r = resolveWake
			resolveWake = null
			r()
		}
	}

	ws.on('open', () => {
		dlog('dshAgentStream WebSocket open, sending session/follow streamId=', streamId)
		// 关键：必须传 assistantStream: true 才能收到 assistant-stream 实时流式帧
		// 否则只会收到 snapshot + entry 事件帧，看不到 LLM 的 text-delta 实时输出
		const openMsg = {
			type: 'open',
			streamId,
			endpoint: 'session/follow',
			payload: { args: { request: { address, assistantStream: true } } }
		}
		ws.send(JSON.stringify(openMsg))
		eventQueue.push({ type: 'ws-opened' })
		wake()
	})

	ws.on('message', (data) => {
		try {
			const msg = JSON.parse(data.toString())
			if (msg.streamId !== streamId) return
			if (msg.type === 'item') {
				eventQueue.push({ type: 'item', value: msg.value })
				wake()
			} else if (msg.type === 'error') {
				wsError = msg.error
				wake()
			} else if (msg.type === 'end') {
				wsClosed = true
				wake()
			}
		} catch (err) {
			derr('dshAgentStream WebSocket parse error:', err?.message || err)
		}
	})

	ws.on('error', (err) => {
		derr('dshAgentStream WebSocket error:', err?.message || err)
		wsError = { code: 'WS_ERROR', message: String(err?.message || err) }
		wake()
	})

	ws.on('close', () => {
		dlog('dshAgentStream WebSocket closed')
		wsClosed = true
		wake()
	})

	// 3. 消费事件流
	let turnEnded = false
	let totalYielded = 0
	const TIMEOUT_MS = 300000 // 5 分钟总超时
	const startTime = Date.now()

	try {
		while (!turnEnded && !wsClosed && !wsError) {
			if (Date.now() - startTime > TIMEOUT_MS) {
				derr('dshAgentStream total timeout')
				yield {
					seq: -1,
					type: '__error__',
					data: { error: { code: 'TIMEOUT', message: '流式对话总超时' } }
				}
				break
			}

			// 从队列取事件
			while (eventQueue.length > 0) {
				const item = eventQueue.shift()
				if (item.type === 'ws-opened') {
					yield { seq: -1, type: '__progress__', data: { step: 'ws-opened', streamId } }
				} else if (item.type === 'item') {
					const value = item.value
					// session/follow 帧格式: { type: 'snapshot', records, cursor, ... } 或 { type: 'event', event: { seq, type, data } }
					if (value?.type === 'snapshot') {
						// 初始快照——可能包含历史事件
						const records = value.records || []
						dlog('dshAgentStream snapshot cursor=', value.cursor, 'records=', records.length)
						yield {
							seq: -1,
							type: '__progress__',
							data: { step: 'snapshot', cursor: value.cursor, recordCount: records.length }
						}
						for (const record of records) {
							const event = record?.event || record
							if (!event) continue
							totalYielded++
							yield toPlain(event)
							if (event.type === 'turn/end') turnEnded = true
						}
					} else if (value?.type === 'event' && value?.event) {
						// 实时事件
						const event = value.event
						totalYielded++
						dlog('dshAgentStream yield event seq=', event.seq, 'type=', event.type)
						yield toPlain(event)
						if (event.type === 'turn/end') turnEnded = true
					} else if (value?.type === 'assistant-stream' && value?.frame) {
						// 助手流式帧（start/chunk/end）
						// chunk 帧的 frame.chunk 是 { type: 'text-delta'|'reasoning-delta'|..., text }
						const frame = value.frame
						totalYielded++
						dlog(
							'dshAgentStream yield assistant-stream frame type=',
							frame?.type,
							'chunkType=',
							frame?.chunk?.type,
							'textLen=',
							frame?.chunk?.text?.length
						)
						yield { seq: -1, type: 'assistant-stream', data: toPlain(frame) }
					}
				} else if (item.type === 'error') {
					break
				}
			}

			if (turnEnded || wsClosed || wsError) break

			// 等待新事件
			await new Promise((resolve) => {
				resolveWake = resolve
			})
		}
	} finally {
		// 取消流并关闭 WebSocket
		try {
			if (ws.readyState === 1) {
				// OPEN
				ws.send(JSON.stringify({ type: 'cancel', streamId }))
				ws.close()
			}
		} catch {}
	}

	dlog('dshAgentStream end turnEnded=', turnEnded, 'totalYielded=', totalYielded)
	yield { seq: -1, type: '__progress__', data: { step: 'end', turnEnded, totalYielded } }

	if (wsError) {
		derr('dshAgentStream WebSocket error:', wsError)
		yield { seq: -1, type: '__error__', data: { error: wsError } }
	}
}
