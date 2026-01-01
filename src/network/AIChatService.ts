import { isAgentToUiMessage } from '../core/agentToUI'
import type { AgentToUiMessage } from '../core/agentToUI'
import { getBackendBaseUrl } from './backendConfig'

export type AIChatUsage = {
	prompt_tokens?: number
	completion_tokens?: number
	total_tokens?: number
	cost?: number
}

export type AIChatStreamEvent =
	| { type: 'msg'; message: AgentToUiMessage }
	| { type: 'usage'; usage: AIChatUsage }
	| { type: 'done' }
	| { type: 'error'; error: { message: string; details?: unknown } }

export type CreateConversationResponse = {
	id: string
	title?: string
	createdAt?: string
}

export type SendMessageResponse = {
	userMessage?: unknown
	assistantMessage?: unknown
	usage?: AIChatUsage
}

type ServiceOptions = {
	baseUrl?: string | (() => string)
	devToken?: string
}

const jsonHeaders = (devToken?: string) => {
	const h: Record<string, string> = {
		'Content-Type': 'application/json',
	}
	if (devToken) h['X-DEV-TOKEN'] = devToken
	return h
}

const safeJson = async (res: Response) => {
	const text = await res.text()
	try {
		return { ok: true as const, value: JSON.parse(text) }
	} catch {
		return { ok: false as const, text }
	}
}

export class AIChatService {
	private readonly getBaseUrl: () => string
	private readonly devToken?: string

	constructor(opts: ServiceOptions = {}) {
		if (typeof opts.baseUrl === 'function') this.getBaseUrl = opts.baseUrl
		else if (typeof opts.baseUrl === 'string') {
			const fixed = opts.baseUrl
			this.getBaseUrl = () => fixed
		} else {
			this.getBaseUrl = getBackendBaseUrl
		}
		this.devToken = opts.devToken
	}

	private url(path: string) {
		const base = (this.getBaseUrl?.() ?? '').trim().replace(/\/$/, '')
		if (!base) return path
		if (path.startsWith('/')) return `${base}${path}`
		return `${base}/${path}`
	}

	async createConversation(title?: string): Promise<CreateConversationResponse> {
		const res = await fetch(this.url('/api/chat/conversations'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify({ title }),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			throw new Error(`createConversation failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`)
		}
		return (await res.json()) as CreateConversationResponse
	}

	async sendMessage(params: {
		conversationId: string
		content: string
		contextPack?: unknown
		provider?: string
		model?: string
	}): Promise<SendMessageResponse> {
		const res = await fetch(
			this.url(`/api/chat/conversations/${encodeURIComponent(params.conversationId)}/messages`),
			{
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify({
				content: params.content,
				contextPack: params.contextPack,
				provider: params.provider,
				model: params.model,
			}),
			}
		)
		if (!res.ok) {
			const body = await safeJson(res)
			throw new Error(`sendMessage failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`)
		}
		return (await res.json()) as SendMessageResponse
	}

	/**
	 * Stream messages via SSE.
	 * Expected events (recommended):
	 * - event: msg,   data: <AgentToUI envelope JSON>
	 * - event: usage, data: {prompt_tokens, completion_tokens, total_tokens, cost}
	 * - event: done
	 * - event: error, data: {message,...}
	 */
	async *streamMessage(params: {
		conversationId: string
		content: string
		contextPack?: unknown
		viewport?: unknown
		provider?: string
		model?: string
		responseMode?: string
		signal?: AbortSignal
	}): AsyncGenerator<AIChatStreamEvent, void, void> {
		const res = await fetch(this.url(`/api/chat/conversations/${encodeURIComponent(params.conversationId)}/messages:stream`), {
			method: 'POST',
			headers: {
				...jsonHeaders(this.devToken),
				Accept: 'text/event-stream',
			},
			body: JSON.stringify({
				content: params.content,
				contextPack: params.contextPack,
				viewport: params.viewport,
				provider: params.provider,
				model: params.model,
				responseMode: params.responseMode ?? 'agentToUi-jsonl',
			}),
			signal: params.signal,
		})

		if (!res.ok || !res.body) {
			const body = await safeJson(res)
			throw new Error(`streamMessage failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`)
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder('utf-8')

		let buffer = ''
		let eventName: string | undefined
		let dataLines: string[] = []

		const isRecord = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v)
		const isString = (v: unknown): v is string => typeof v === 'string'

		const logMsg = (m: AgentToUiMessage) => {
			try {
				if (m.type === 'agentToUi/error') {
					console.error('[AIChatService][msg:error]', m)
				} else {
					console.debug('[AIChatService][msg]', m)
				}
			} catch {
				// ignore logging failures
			}
		}

		const coerceAgentToUiMessage = (v: unknown): AgentToUiMessage | null => {
			if (!isRecord(v)) return null
			if (v.schemaVersion !== 1) return null
			if (!isString(v.type) || !isString(v.id) || !isString(v.createdAt)) return null
			if (!('payload' in v)) return null
			const payload = (v as any).payload
			if (!isRecord(payload)) return null

			// Fix common model mistakes for taskStatus: missing payload.phase.
			if (v.type === 'agentToUi/taskStatus') {
				const phase = payload.phase
				const message = payload.message
				if (!isString(phase) && isString(message)) {
					const patched = {
						...(v as any),
						payload: { ...payload, phase: 'writing' },
					}
					return isAgentToUiMessage(patched) ? (patched as AgentToUiMessage) : null
				}
			}

			// Fix common model mistakes for applyFilter:
			// - payload.target mistakenly set to "nodeId:xxx" (should be target="nodeId" and nodeId="xxx").
			if (v.type === 'agentToUi/applyFilter') {
				const target = payload.target
				if (isString(target)) {
					const m = target.match(/^nodeId\s*:\s*(.+)$/)
					if (m && m[1] && !isString(payload.nodeId)) {
						const patched = {
							...(v as any),
							payload: {
								...payload,
								target: 'nodeId',
								nodeId: m[1].trim(),
							},
						}
						return isAgentToUiMessage(patched) ? (patched as AgentToUiMessage) : null
					}
				}
			}

			return null
		}

		const flush = (): AIChatStreamEvent[] => {
			if (dataLines.length === 0 && !eventName) return []
			const data = dataLines.join('\n')
			const name = eventName
			eventName = undefined
			dataLines = []

			if (!name || name === 'msg') {
				try {
					const v = JSON.parse(data)
					if (isAgentToUiMessage(v)) {
						logMsg(v)
						return [{ type: 'msg', message: v }]
					}

					const patched = coerceAgentToUiMessage(v)
					if (patched) {
						logMsg(patched)
						return [{ type: 'msg', message: patched }]
					}

					// Non-AgentToUI JSON: ignore silently to keep the stream stable.
					console.warn('[AIChatService] Invalid AgentToUI message ignored:', v)
					return []
				} catch (e) {
					// STRICT: do not turn parse failures into user-visible text (would leak JSON).
					console.error('[AIChatService] SSE msg JSON.parse failed:', { error: e, raw: data })
					return [
						{
							type: 'error',
							error: { message: 'SSE msg JSON.parse failed', details: { raw: data } },
						},
					]
				}
			}

			if (name === 'usage') {
				try {
					const usage = JSON.parse(data) as AIChatUsage
					console.debug('[AIChatService][usage]', usage)
					return [{ type: 'usage', usage }]
				} catch {
					return [{ type: 'usage', usage: {} }]
				}
			}
			if (name === 'done') return [{ type: 'done' }]
			if (name === 'error') {
				try {
					const err = JSON.parse(data) as any
					console.error('[AIChatService][sse:error]', err)
					return [{ type: 'error', error: err }]
				} catch {
					console.error('[AIChatService][sse:error]', data)
					return [{ type: 'error', error: { message: data } }]
				}
			}

			// unknown event
			return [{ type: 'error', error: { message: `Unknown SSE event: ${name}`, details: data } }]
		}

		while (true) {
			const { value, done } = await reader.read()
			if (done) break
			buffer += decoder.decode(value, { stream: true })

			let idx: number
			while ((idx = buffer.indexOf('\n')) >= 0) {
				const line = buffer.slice(0, idx)
				buffer = buffer.slice(idx + 1)

				const l = line.replace(/\r$/, '')
				if (l === '') {
					for (const ev of flush()) yield ev
					continue
				}

				if (l.startsWith('event:')) {
					eventName = l.slice('event:'.length).trim()
					continue
				}
				if (l.startsWith('data:')) {
					dataLines.push(l.slice('data:'.length).trimStart())
					continue
				}
				// ignore comments/other fields
			}
		}

		// flush tail
		for (const ev of flush()) yield ev
	}

	private toTextMessage(text: string): AgentToUiMessage {
		return {
			schemaVersion: 1,
			type: 'agentToUi/text',
			id: `local-${Date.now()}`,
			createdAt: new Date().toISOString(),
			payload: { text },
		}
	}
}

export const aiChatService = new AIChatService()
