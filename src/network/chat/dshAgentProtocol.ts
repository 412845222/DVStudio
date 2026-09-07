/**
 * DeepSeek-Harness JSON-RPC over HTTP + WebSocket transport layer.
 *
 * Harness exposes:
 *  - POST /api/<method>        — client requests (JSON-RPC style)
 *  - WS   /api/events.mux      — per-session event stream (mux frames)
 *  - WS   /api/events.host     — host-level events
 *
 * Wire format for client requests:
 *   { type: 'client-request', rpcId, method, payload }
 * Wire format for server responses:
 *   { type: 'server-response', rpcId, result: { ok, value | error } }
 *
 * This module keeps all transport concerns here so DSHAgentChatService can
 * stay focused on IChatService semantics.
 */

export interface RpcError {
	code: string
	message: string
	details: unknown
}

export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: RpcError }

// ---- Session API payloads ----

export interface DshSessionSummary {
	sessionId: string
	updatedAt: number
	running: boolean
	blank: boolean
	parentSessionId?: string
	cwd?: string
	agentPreset?: string
	projections?: unknown
}

export interface DshContentBlockText {
	type: 'text'
	text: string
}
export interface DshContentBlockImage {
	type: 'image'
	mediaType: string
	data: string
	name?: string
}
export type DshPromptContentPart = DshContentBlockText | DshContentBlockImage

// ---- History event format (from session.history polling) ----

/**
 * DSH 会话历史事件。由 session.history API 返回，结构为
 * { seq, type, time, data } — 与 mux WebSocket 的内联格式不同，
 * data 字段携带事件实际负载。
 */
export interface DshHistoryEvent {
	seq: number
	type: string
	time?: number
	data?: unknown
	[key: string]: unknown
}

// ---- Model API ----

export interface DshModelProviderGroup {
	id: string
	name: string
	models: Array<{
		id: string
		name: string
		description?: string
		reasoning?: unknown
	}>
}

export interface DshModelCatalog {
	groups: DshModelProviderGroup[]
	failures: unknown[]
}

// ---- Transport ----

/**
 * Transport abstraction. `DshTransport` is the direct HTTP+polling
 * implementation; other implementations (e.g. IPC proxy for Electron) can
 * plug into `DshStreamClient` by satisfying this interface.
 *
 * `streamTurn` 在一次调用中完成「发送 prompt + 轮询事件」，
 * yield 归一化的 DshHistoryEvent，由 DshStreamClient 解析。
 */
export interface DshTransportLike {
	call<P, T>(method: string, payload: P): Promise<RpcResult<T>>
	streamTurn(
		sessionId: string,
		content: DshPromptContentPart[],
		signal: AbortSignal
	): AsyncGenerator<DshHistoryEvent>
}

/**
 * Low-level transport: issues JSON-RPC requests over HTTP and polls
 * session/page for streaming events. Callers provide a baseUrl like
 * `http://127.0.0.1:3080/?token=xxx` — the token is exchanged for a
 * session cookie on first use.
 *
 * DSH API method names use slash separator: session/create, session/prompt, session/page.
 * Payload is wrapped as { args: { request: <actual_payload> } } per DSH gateway contract.
 */
export class DshTransport implements DshTransportLike {
	private origin: string
	private token: string
	private cookie: string | null = null
	private cookiePromise: Promise<string> | null = null

	constructor(baseUrl: string) {
		const parsed = new URL(baseUrl)
		this.origin = `${parsed.protocol}//${parsed.host}`
		this.token = parsed.searchParams.get('token') || ''
	}

	private async ensureCookie(): Promise<string> {
		if (this.cookie) return this.cookie
		if (this.cookiePromise) return this.cookiePromise
		this.cookiePromise = (async () => {
			if (!this.token) throw new Error('DSH 启动 token 不可用')
			const res = await fetch(`${this.origin}/?token=${encodeURIComponent(this.token)}`, {
				method: 'GET',
				redirect: 'manual'
			})
			const setCookie = res.headers.get('set-cookie')
			if (!setCookie) throw new Error('DSH 鉴权失败：未返回会话 Cookie')
			this.cookie = setCookie.split(';')[0]
			return this.cookie
		})()
		try {
			return await this.cookiePromise
		} finally {
			this.cookiePromise = null
		}
	}

	/** Send a unary JSON-RPC request and return the business result. */
	async call<P, T>(method: string, payload: P): Promise<RpcResult<T>> {
		const rpcId = crypto.randomUUID()
		// DSH 要求 payload 格式为 { args: { request: <实际payload> } }
		const wrappedPayload = { args: { request: payload ?? {} } }
		const body = JSON.stringify({
			type: 'client-request',
			rpcId,
			method,
			payload: wrappedPayload
		})

		let cookie: string
		try {
			cookie = await this.ensureCookie()
		} catch (err) {
			return {
				ok: false,
				error: { code: 'AUTH', message: String(err), details: {} }
			}
		}

		const doFetch = (ck: string) =>
			fetch(`${this.origin}/api/${method}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
					Cookie: ck
				},
				body
			})

		let res: Response
		try {
			res = await doFetch(cookie)
		} catch (err) {
			return {
				ok: false,
				error: { code: 'network', message: String(err), details: {} }
			}
		}

		// If 401 (cookie expired), refresh cookie and retry once
		if (res.status === 401) {
			this.cookie = null
			try {
				cookie = await this.ensureCookie()
				res = await doFetch(cookie)
			} catch (err) {
				return {
					ok: false,
					error: { code: 'AUTH', message: String(err), details: {} }
				}
			}
		}

		const text = await res.text()
		let data: unknown = null
		try {
			data = text.length ? JSON.parse(text) : null
		} catch {
			/* non-JSON */
		}
		if (!res.ok) {
			const d = data as { error?: { message?: string }; message?: string } | null
			const msg = d?.error?.message || d?.message || text.slice(0, 300)
			return {
				ok: false,
				error: { code: 'HTTP_' + res.status, message: String(msg), details: data ?? {} }
			}
		}
		const envelope = data as { type?: string; result?: RpcResult<unknown> } | null
		if (envelope && envelope.type === 'server-response' && envelope.result) {
			return envelope.result as RpcResult<T>
		}
		return { ok: true, value: data as T }
	}

	/**
	 * 发送 prompt 并通过 WebSocket mux session/follow 获取实时流式事件。
	 * 在非 Electron 环境使用（Electron 环境通过 IPC 代理由主进程完成）。
	 */
	async *streamTurn(
		sessionId: string,
		content: DshPromptContentPart[],
		signal: AbortSignal
	): AsyncGenerator<DshHistoryEvent> {
		const address = { kind: 'session', sessionId }

		// 1. 发送 prompt
		const requestId = crypto.randomUUID()
		const promptRes = await this.call('session/prompt', {
			requestId,
			sessionId,
			mode: 'queue',
			content
		})
		if (!promptRes.ok) {
			yield { seq: -1, type: '__error__', data: { error: promptRes.error } }
			return
		}

		// 2. 打开 WebSocket mux 调用 session/follow
		let cookie: string
		try {
			cookie = await this.ensureCookie()
		} catch (err) {
			yield { seq: -1, type: '__error__', data: { error: { code: 'AUTH', message: String(err) } } }
			return
		}

		const wsUrl = this.origin.replace(/^http/, 'ws') + '/api/remote.mux'
		const streamId = crypto.randomUUID()
		const ws = new WebSocket(wsUrl)

		const eventQueue: Array<{ type: string; value?: unknown }> = []
		let wsError: unknown = null
		let wsClosed = false
		let resolveWake: (() => void) | null = null
		const wake = () => {
			if (resolveWake) {
				const r = resolveWake
				resolveWake = null
				r()
			}
		}

		ws.onopen = () => {
			// 关键：必须传 assistantStream: true 才能收到 assistant-stream 实时流式帧
			// 否则只会收到 snapshot + entry 事件帧，看不到 LLM 的 text-delta 实时输出
			ws.send(
				JSON.stringify({
					type: 'open',
					streamId,
					endpoint: 'session/follow',
					payload: { args: { request: { address, assistantStream: true } } }
				})
			)
		}

		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data as string)
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
			} catch {}
		}

		ws.onerror = (err) => {
			wsError = { code: 'WS_ERROR', message: String(err) }
			wake()
		}

		ws.onclose = () => {
			wsClosed = true
			wake()
		}

		// 3. 消费事件流
		let turnEnded = false
		const onAbort = () => {
			try {
				if (ws.readyState === WebSocket.OPEN) {
					ws.send(JSON.stringify({ type: 'cancel', streamId }))
					ws.close()
				}
			} catch {}
			wake()
		}
		signal.addEventListener('abort', onAbort, { once: true })

		try {
			while (!turnEnded && !wsClosed && !wsError) {
				while (eventQueue.length > 0) {
					const item = eventQueue.shift()!
					if (item.type === 'item' && item.value) {
						const value = item.value as {
							type?: string
							records?: unknown[]
							event?: DshHistoryEvent
							frame?: unknown
						}
						if (value.type === 'snapshot') {
							const records = value.records || []
							for (const record of records) {
								const event =
									(record as { event?: DshHistoryEvent })?.event || (record as DshHistoryEvent)
								if (!event) continue
								yield event
								if (event.type === 'turn/end') turnEnded = true
							}
						} else if (value.type === 'event' && value.event) {
							yield value.event
							if (value.event.type === 'turn/end') turnEnded = true
						} else if (value.type === 'assistant-stream' && value.frame) {
							yield { seq: -1, type: 'assistant-stream', data: value.frame } as DshHistoryEvent
						}
					}
				}

				if (turnEnded || wsClosed || wsError) break
				await new Promise<void>((resolve) => {
					resolveWake = resolve
				})
			}
		} finally {
			signal.removeEventListener('abort', onAbort)
			try {
				if (ws.readyState === WebSocket.OPEN) {
					ws.send(JSON.stringify({ type: 'cancel', streamId }))
					ws.close()
				}
			} catch {}
		}

		if (wsError) {
			yield { seq: -1, type: '__error__', data: { error: wsError } }
		}
	}
}
