import { isAgentToUiMessage } from '../core/agentToUI'
import type { AgentToUiMessage } from '../core/agentToUI'
import { getBackendBaseUrl } from './backendConfig'
import { isRecord, isString, isArray } from '../types/utils'

export type AiPingResponse = {
	ok: boolean
	provider?: string
	model?: string
	baseUrl?: string
	hasApiKey?: boolean
}

export type SubtitleAIStreamEvent =
	| { type: 'msg'; message: AgentToUiMessage }
	| { type: 'done' }
	| { type: 'error'; error: { message: string; details?: unknown } }

type ServiceOptions = {
	baseUrl?: string | (() => string)
	devToken?: string
}

const jsonHeaders = (devToken?: string) => {
	const h: Record<string, string> = {
		'Content-Type': 'application/json'
	}
	if (devToken) h['X-DEV-TOKEN'] = devToken
	return h
}

const safeJson = async (res: Response) => {
	const text = await res.text()
	try {
		return { ok: true as const, value: JSON.parse(text) as unknown }
	} catch {
		return { ok: false as const, text }
	}
}

const generateId = (): string => {
	try {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return crypto.randomUUID()
		}
	} catch {
		// ignore
	}
	return `m-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const coerceAgentToUiMessage = (v: unknown): AgentToUiMessage | null => {
	if (isAgentToUiMessage(v)) return v
	if (!isRecord(v)) return null

	const now = new Date().toISOString()
	const id = generateId()

	const asTemplate = (tpl: unknown): AgentToUiMessage | null => {
		if (!isRecord(tpl)) return null
		if (tpl.schemaVersion !== 1) return null
		const templateId = tpl.templateId
		const nodes = tpl.nodes
		if (!isString(templateId)) return null
		if (!isArray(nodes)) return null
		return {
			schemaVersion: 1,
			id,
			createdAt: now,
			type: 'agentToUi/componentTemplate',
			payload: { template: tpl }
		} as AgentToUiMessage
	}

	return asTemplate(v) || (isRecord(v.template) ? asTemplate(v.template) : null)
}

export class SubtitleAIService {
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

	async ping(): Promise<AiPingResponse> {
		const res = await fetch(this.url('/api/ai/ping'), {
			method: 'GET',
			headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined
		})
		if (!res.ok) {
			const body = await safeJson(res)
			throw new Error(
				`ping failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			)
		}
		return (await res.json()) as AiPingResponse
	}

	async *streamUnderstand(params: {
		layerId: string
		cues: unknown[]
		cueRanges: unknown[]
		scope?: string
		signal?: AbortSignal
	}): AsyncGenerator<SubtitleAIStreamEvent, void, void> {
		yield* this.streamSse(
			'/api/ai/subtitle/understand:stream',
			{
				layerId: params.layerId,
				cues: params.cues,
				cueRanges: params.cueRanges,
				scope:
					typeof params.scope === 'string' && params.scope.trim() ? params.scope.trim() : undefined
			},
			params.signal
		)
	}

	async *streamStyleAdvice(params: {
		layerId: string
		understanding: unknown
		signal?: AbortSignal
	}): AsyncGenerator<SubtitleAIStreamEvent, void, void> {
		yield* this.streamSse(
			'/api/ai/subtitle/style:stream',
			{
				layerId: params.layerId,
				understanding: params.understanding
			},
			params.signal
		)
	}

	async *streamTemplateSuggestions(params: {
		layerId: string
		understanding: unknown
		signal?: AbortSignal
	}): AsyncGenerator<SubtitleAIStreamEvent, void, void> {
		yield* this.streamSse(
			'/api/ai/subtitle/templates:stream',
			{
				layerId: params.layerId,
				understanding: params.understanding
			},
			params.signal
		)
	}

	async *streamChat(params: {
		layerId: string
		cues: unknown[]
		cueRanges: unknown[]
		deepMode?: boolean
		markdown?: string
		summary?: unknown
		messages: Array<{ role: 'user' | 'assistant'; content: string }>
		signal?: AbortSignal
	}): AsyncGenerator<SubtitleAIStreamEvent, void, void> {
		yield* this.streamSse(
			'/api/ai/subtitle/chat:stream',
			{
				layerId: params.layerId,
				cues: params.cues,
				cueRanges: params.cueRanges,
				deepMode: !!params.deepMode,
				markdown: params.markdown ?? '',
				summary: params.summary,
				messages: params.messages
			},
			params.signal
		)
	}

	async *streamPanelChat(params: {
		layerId: string
		summary?: unknown
		messages: Array<{ role: 'user' | 'assistant'; content: string }>
		deepMode?: boolean
		signal?: AbortSignal
	}): AsyncGenerator<SubtitleAIStreamEvent, void, void> {
		yield* this.streamSse(
			'/api/ai/subtitle/panel-chat:stream',
			{
				layerId: params.layerId,
				deepMode: !!params.deepMode,
				summary: params.summary,
				messages: params.messages
			},
			params.signal
		)
	}

	async *streamPalette(params: {
		layerId: string
		summary?: unknown
		text?: string
		signal?: AbortSignal
	}): AsyncGenerator<SubtitleAIStreamEvent, void, void> {
		yield* this.streamSse(
			'/api/ai/subtitle/palette:stream',
			{
				layerId: params.layerId,
				summary: params.summary,
				text: params.text
			},
			params.signal
		)
	}

	async *streamTemplate(params: {
		promptPreset: string
		promptInput: unknown
		contextPack?: unknown
		viewport?: unknown
		provider?: string
		model?: string
		debug?: boolean
		signal?: AbortSignal
	}): AsyncGenerator<SubtitleAIStreamEvent, void, void> {
		yield* this.streamSse(
			'/api/ai/subtitle/template:stream',
			{
				promptPreset: params.promptPreset,
				promptInput: params.promptInput,
				contextPack: params.contextPack,
				viewport: params.viewport,
				provider: params.provider,
				model: params.model,
				responseMode: 'agentToUi-jsonl'
			},
			params.signal,
			params.debug ? 'template:stream' : undefined
		)
	}

	private async *streamSse(
		path: string,
		body: unknown,
		signal?: AbortSignal,
		debugLabel?: string
	): AsyncGenerator<SubtitleAIStreamEvent, void, void> {
		const res = await fetch(this.url(path), {
			method: 'POST',
			headers: {
				...jsonHeaders(this.devToken),
				Accept: 'text/event-stream'
			},
			body: JSON.stringify(body ?? {}),
			signal
		})

		if (!res.ok || !res.body) {
			const b = await safeJson(res)
			throw new Error(`SSE failed: ${res.status} ${b.ok ? JSON.stringify(b.value) : b.text}`)
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder('utf-8')

		let buffer = ''
		let eventName: string | undefined
		let dataLines: string[] = []

		const flush = (): SubtitleAIStreamEvent[] => {
			if (dataLines.length === 0 && !eventName) return []
			const data = dataLines.join('\n')
			const name = eventName
			eventName = undefined
			dataLines = []

			if (debugLabel) {
				console.log(`[SSE ${debugLabel}]`, { event: name || 'msg', data })
			}

			if (!name || name === 'msg') {
				try {
					const v = JSON.parse(data) as unknown
					const msg = coerceAgentToUiMessage(v)
					if (msg) return [{ type: 'msg', message: msg }]
					return []
				} catch (e: unknown) {
					return [
						{
							type: 'error',
							error: {
								message: 'SSE msg JSON.parse failed',
								details: { raw: data, error: String(e) }
							}
						}
					]
				}
			}

			if (name === 'error') {
				try {
					const v = JSON.parse(data) as unknown
					if (isRecord(v) && isString(v.message)) {
						return [{ type: 'error', error: { message: v.message, details: v.details } }]
					}
				} catch {
					// ignore
				}
				return [{ type: 'error', error: { message: typeof data === 'string' ? data : 'error' } }]
			}

			if (name === 'done') return [{ type: 'done' }]
			return []
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
				if (!l) {
					for (const ev of flush()) yield ev
					continue
				}

				if (l.startsWith('event:')) {
					eventName = l.slice('event:'.length).trim()
					continue
				}
				if (l.startsWith('data:')) {
					dataLines.push(l.slice('data:'.length).trim())
					continue
				}
			}
		}

		for (const ev of flush()) yield ev
		yield { type: 'done' }
	}
}
