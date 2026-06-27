import { isAgentToUiMessage } from '../core/agentToUI'
import type { AgentToUiMessage } from '../core/agentToUI'
import { isRecord as isRecordGuard, isString as isStringGuard } from '../types/utils'
import { getBackendBaseUrl } from './backendConfig'
import { isMigrationMode, hasIpcApi, ipcOrHttp, unwrapIpcResult, normalizeTimestamp, normalizeId, type IpcResult } from './ipcClient'

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

export type Conversation = {
	id: string
	title?: string
	createdAt?: string
	updatedAt?: string
	model?: string
	systemPrompt?: string
}

export type ChatMessage = {
	id: string
	role: 'user' | 'assistant' | 'system'
	content: string
	createdAt?: string
	model?: string
	tokensUsed?: number
}

export type GetConversationResponse = {
	conversation: Conversation
	messages: ChatMessage[]
}

export type SendMessageResponse = {
	userMessage?: unknown
	assistantMessage?: unknown
	usage?: AIChatUsage
}

type ChatIpcBridge = {
	dweb?: {
		chat?: {
			conversations?: {
				list?: () => Promise<unknown>
				create?: (payload: unknown) => Promise<unknown>
				get?: (payload: { id: string }) => Promise<unknown>
				delete?: (payload: { id: string }) => Promise<unknown>
				updateTitle?: (payload: { id: string; title: string }) => Promise<unknown>
			}
			messages?: {
				send?: (payload: unknown) => Promise<unknown>
				stream?: (payload: unknown) => AsyncGenerator<unknown>
			}
		}
	}
}

function getIpcBridge(): ChatIpcBridge {
	return window as unknown as ChatIpcBridge
}

function generateId(): string {
	try {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return crypto.randomUUID()
		}
	} catch {
		// ignore
	}
	return `m-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createAssistantTextMessage(content: string): AgentToUiMessage {
	const now = new Date().toISOString()
	return {
		schemaVersion: 1,
		id: generateId(),
		createdAt: now,
		type: 'agentToUi/assistantText',
		payload: { text: content },
	}
}

function normalizeConversation(raw: unknown): Conversation | null {
	if (!raw || typeof raw !== 'object') return null
	const r = raw as Record<string, unknown>
	const id = normalizeId(r.id as number | string | undefined)
	if (!id) return null
	return {
		id,
		title: r.title ? String(r.title) : undefined,
		createdAt: normalizeTimestamp(r.createdAt as number | string | undefined),
		updatedAt: normalizeTimestamp(r.updatedAt as number | string | undefined),
		model: r.model ? String(r.model) : undefined,
		systemPrompt: r.systemPrompt ? String(r.systemPrompt) : undefined,
	}
}

function normalizeMessage(raw: unknown): ChatMessage | null {
	if (!raw || typeof raw !== 'object') return null
	const r = raw as Record<string, unknown>
	const id = normalizeId(r.id as number | string | undefined)
	if (!id) return null
	const role = String(r.role || 'user')
	return {
		id,
		role: (role === 'assistant' || role === 'system') ? role : 'user',
		content: String(r.content || ''),
		createdAt: normalizeTimestamp(r.createdAt as number | string | undefined),
		model: r.model ? String(r.model) : undefined,
		tokensUsed: r.tokensUsed !== undefined ? Number(r.tokensUsed) : undefined,
	}
}

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
		return { ok: true as const, value: JSON.parse(text) }
	} catch {
		return { ok: false as const, text }
	}
}

async function httpCreateConversation(baseUrlFn: () => string, title?: string, devToken?: string): Promise<CreateConversationResponse> {
	const base = baseUrlFn()
	const res = await fetch(`${base}/api/chat/conversations`, {
		method: 'POST',
		headers: jsonHeaders(devToken),
		body: JSON.stringify({ title })
	})
	if (!res.ok) {
		const body = await safeJson(res)
		throw new Error(
			`createConversation failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
		)
	}
	return (await res.json()) as CreateConversationResponse
}

async function httpSendMessage(
	params: {
		conversationId: string
		content: string
		contextPack?: unknown
		provider?: string
		model?: string
		promptPreset?: string
		promptInput?: unknown
	},
	baseUrlFn: () => string,
	devToken?: string
): Promise<SendMessageResponse> {
	const base = baseUrlFn()
	const res = await fetch(
		`${base}/api/chat/conversations/${encodeURIComponent(params.conversationId)}/messages`,
		{
			method: 'POST',
			headers: jsonHeaders(devToken),
			body: JSON.stringify({
				content: params.content,
				contextPack: params.contextPack,
				provider: params.provider,
				model: params.model,
				promptPreset: params.promptPreset,
				promptInput: params.promptInput,
			})
		}
	)
	if (!res.ok) {
		const body = await safeJson(res)
		throw new Error(
			`sendMessage failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
		)
	}
	return (await res.json()) as SendMessageResponse
}

async function* httpStreamMessage(
	params: {
		conversationId: string
		content: string
		contextPack?: unknown
		provider?: string
		model?: string
		promptPreset?: string
		promptInput?: unknown
	},
	baseUrlFn: () => string,
	devToken?: string
): AsyncGenerator<AIChatStreamEvent> {
	const base = baseUrlFn()
	const response = await fetch(
		`${base}/api/chat/conversations/${encodeURIComponent(params.conversationId)}/messages:stream`,
		{
			method: 'POST',
			headers: { ...jsonHeaders(devToken), Accept: 'text/event-stream' },
			body: JSON.stringify({
				content: params.content,
				contextPack: params.contextPack,
				provider: params.provider,
				model: params.model,
				promptPreset: params.promptPreset,
				promptInput: params.promptInput,
			})
		}
	)
	if (!response.ok || !response.body) {
		yield { type: 'error', error: { message: `Stream failed: ${response.status}` } }
		return
	}
	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let buffer = ''
	let assistantContent = ''
	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			buffer += decoder.decode(value, { stream: true })
			const lines = buffer.split('\n')
			buffer = lines.pop() || ''
			for (const line of lines) {
				const trimmed = line.trim()
				if (!trimmed || !trimmed.startsWith('data:')) continue
				const data = trimmed.slice(5).trim()
				if (!data || data === '[DONE]') continue
				try {
					const parsed = JSON.parse(data)
					if (parsed && typeof parsed === 'object') {
						const r = parsed as Record<string, unknown>
						if (r.type === 'delta' && isStringGuard(r.content)) {
							assistantContent += r.content
							yield { type: 'msg', message: createAssistantTextMessage(assistantContent) }
						} else if (r.type === 'msg' && isRecordGuard(r.message) && isAgentToUiMessage(r.message)) {
							yield { type: 'msg', message: r.message as AgentToUiMessage }
						} else if (r.type === 'usage' && isRecordGuard(r.usage)) {
							yield { type: 'usage', usage: r.usage as AIChatUsage }
						} else if (r.type === 'error') {
							yield { type: 'error', error: { message: String(r.error || 'Stream error') } }
							return
						} else if (r.type === 'done') {
							yield { type: 'done' }
							return
						} else if (r.delta && isRecordGuard(r.delta) && isStringGuard(r.delta.content)) {
							assistantContent += r.delta.content
							yield { type: 'msg', message: createAssistantTextMessage(assistantContent) }
						} else if (r.choices && Array.isArray(r.choices)) {
							const delta = r.choices[0]?.delta
							if (delta && isStringGuard(delta.content)) {
								assistantContent += delta.content
								yield { type: 'msg', message: createAssistantTextMessage(assistantContent) }
							}
						}
					}
				} catch {
					// ignore parse errors
				}
			}
		}
		yield { type: 'done' }
	} finally {
		reader.releaseLock()
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
		return ipcOrHttp(
			async () => {
				const bridge = getIpcBridge()
				const createFn = bridge.dweb?.chat?.conversations?.create
				if (typeof createFn !== 'function') throw new Error('IPC chat.conversations.create not available')
				const result = await createFn({ title })
				const unwrapped = unwrapIpcResult<{ conversation?: { id?: string; title?: string; createdAt?: number | string } }>(result as IpcResult<{ conversation?: { id?: string; title?: string; createdAt?: number | string } }>)
				const rawConv = unwrapped?.conversation || unwrapped
				const conv = rawConv as { id?: string; title?: string; createdAt?: number | string }
				return {
					id: String(conv?.id || ''),
					title: conv?.title ? String(conv.title) : title,
					createdAt: normalizeTimestamp(conv?.createdAt),
				}
			},
			() => httpCreateConversation(this.getBaseUrl, title, this.devToken)
		)
	}

	async listConversations(limit = 50): Promise<{ items: Conversation[] }> {
		return ipcOrHttp(
			async () => {
				const bridge = getIpcBridge()
				const listFn = bridge.dweb?.chat?.conversations?.list
				if (typeof listFn !== 'function') throw new Error('IPC chat.conversations.list not available')
				const result = await listFn()
				const unwrapped = unwrapIpcResult<{ items?: unknown[] }>(result as IpcResult<{ items?: unknown[] }>)
				const items = Array.isArray(unwrapped?.items) ? unwrapped.items : (Array.isArray(unwrapped) ? unwrapped : [])
				return { items: items.map(normalizeConversation).filter(Boolean) as Conversation[] }
			},
			async () => {
				const res = await fetch(`${this.url('/api/chat/conversations')}?limit=${limit}`, {
					headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined,
				})
				if (!res.ok) throw new Error(`listConversations failed: ${res.status}`)
				const data = await res.json()
				const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : [])
				return { items: items.map(normalizeConversation).filter(Boolean) as Conversation[] }
			}
		)
	}

	async getConversation(conversationId: string): Promise<GetConversationResponse> {
		return ipcOrHttp(
			async () => {
				const bridge = getIpcBridge()
				const getFn = bridge.dweb?.chat?.conversations?.get
				if (typeof getFn !== 'function') throw new Error('IPC chat.conversations.get not available')
				const result = await getFn({ id: conversationId })
				const unwrapped = unwrapIpcResult<{ conversation?: unknown; messages?: unknown[] }>(result as IpcResult<{ conversation?: unknown; messages?: unknown[] }>)
				const conv = normalizeConversation(unwrapped?.conversation || unwrapped)
				const msgs = Array.isArray(unwrapped?.messages) ? unwrapped.messages : []
				if (!conv) throw new Error('conversation not found')
				return {
					conversation: conv,
					messages: msgs.map(normalizeMessage).filter(Boolean) as ChatMessage[],
				}
			},
			async () => {
				const res = await fetch(`${this.url('/api/chat/conversations')}/${encodeURIComponent(conversationId)}`, {
					headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined,
				})
				if (!res.ok) throw new Error(`getConversation failed: ${res.status}`)
				const data = await res.json()
				const conv = normalizeConversation(data?.conversation || data)
				const msgs = Array.isArray(data?.messages) ? data.messages : []
				if (!conv) throw new Error('conversation not found')
				return {
					conversation: conv,
					messages: msgs.map(normalizeMessage).filter(Boolean) as ChatMessage[],
				}
			}
		)
	}

	async deleteConversation(conversationId: string): Promise<{ ok: boolean; id: string }> {
		return ipcOrHttp(
			async () => {
				const bridge = getIpcBridge()
				const deleteFn = bridge.dweb?.chat?.conversations?.delete
				if (typeof deleteFn !== 'function') throw new Error('IPC chat.conversations.delete not available')
				const result = await deleteFn({ id: conversationId })
				const unwrapped = unwrapIpcResult<{ ok?: boolean; id?: string }>(result as IpcResult<{ ok?: boolean; id?: string }>)
				return { ok: Boolean(unwrapped?.ok !== false), id: String(unwrapped?.id || conversationId) }
			},
			async () => {
				const res = await fetch(`${this.url('/api/chat/conversations')}/${encodeURIComponent(conversationId)}`, {
					method: 'DELETE',
					headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined,
				})
				if (!res.ok) throw new Error(`deleteConversation failed: ${res.status}`)
				return { ok: true, id: conversationId }
			}
		)
	}

	async updateConversationTitle(conversationId: string, title: string): Promise<{ ok: boolean; conversation?: Conversation }> {
		return ipcOrHttp(
			async () => {
				const bridge = getIpcBridge()
				const updateFn = bridge.dweb?.chat?.conversations?.updateTitle
				if (typeof updateFn !== 'function') throw new Error('IPC chat.conversations.updateTitle not available')
				const result = await updateFn({ id: conversationId, title })
				const unwrapped = unwrapIpcResult<{ ok?: boolean; conversation?: unknown }>(result as IpcResult<{ ok?: boolean; conversation?: unknown }>)
				const conv = normalizeConversation(unwrapped?.conversation)
				return { ok: Boolean(unwrapped?.ok !== false), conversation: conv || undefined }
			},
			async () => {
				const res = await fetch(`${this.url('/api/chat/conversations')}/${encodeURIComponent(conversationId)}/title`, {
					method: 'PATCH',
					headers: { ...jsonHeaders(this.devToken) },
					body: JSON.stringify({ title }),
				})
				if (!res.ok) throw new Error(`updateTitle failed: ${res.status}`)
				const data = await res.json()
				const conv = normalizeConversation(data?.conversation)
				return { ok: true, conversation: conv || undefined }
			}
		)
	}

	async sendMessage(params: {
		conversationId: string
		content: string
		contextPack?: unknown
		provider?: string
		model?: string
		promptPreset?: string
		promptInput?: unknown
	}): Promise<SendMessageResponse> {
		return ipcOrHttp<SendMessageResponse>(
			async () => {
				const bridge = getIpcBridge()
				const sendFn = bridge.dweb?.chat?.messages?.send
				if (typeof sendFn !== 'function') throw new Error('IPC chat.messages.send not available')
				const result = await sendFn(params)
				const unwrapped = unwrapIpcResult<{ message?: unknown; usage?: AIChatUsage }>(result as IpcResult<{ message?: unknown; usage?: AIChatUsage }>)
				return {
					userMessage: undefined,
					assistantMessage: unwrapped?.message,
					usage: unwrapped?.usage,
				} as SendMessageResponse
			},
			() => httpSendMessage(params, this.getBaseUrl, this.devToken)
		)
	}

	async *streamMessage(params: {
		conversationId: string
		content: string
		contextPack?: unknown
		provider?: string
		model?: string
		promptPreset?: string
		promptInput?: unknown
		responseMode?: string
		viewport?: unknown
		signal?: AbortSignal
	}): AsyncGenerator<AIChatStreamEvent> {
		if (isMigrationMode() && hasIpcApi()) {
			const bridge = getIpcBridge()
			const streamFn = bridge.dweb?.chat?.messages?.stream
			if (typeof streamFn === 'function') {
				try {
					let assistantContent = ''
					const generator = streamFn(params)
					for await (const chunk of generator) {
						let parsed = chunk
						if (typeof chunk === 'string') {
							try { parsed = JSON.parse(chunk) } catch { parsed = chunk }
						}
						if (parsed && typeof parsed === 'object') {
							const r = parsed as Record<string, unknown>
							if (r.type === 'delta' && isStringGuard(r.content)) {
								assistantContent += r.content
								yield { type: 'msg', message: createAssistantTextMessage(assistantContent) }
							} else if (r.type === 'msg' && isRecordGuard(r.message) && isAgentToUiMessage(r.message)) {
								yield { type: 'msg', message: r.message as AgentToUiMessage }
							} else if (r.type === 'usage' && isRecordGuard(r.usage)) {
								yield { type: 'usage', usage: r.usage as AIChatUsage }
							} else if (r.type === 'done') {
								yield { type: 'done' }
								return
							} else if (r.type === 'error') {
								yield { type: 'error', error: { message: String(r.error || 'Stream error') } }
								return
							} else if (r.content && isStringGuard(r.content) && !r.type) {
								assistantContent += r.content
								yield { type: 'msg', message: createAssistantTextMessage(assistantContent) }
							}
						}
					}
					yield { type: 'done' }
					return
				} catch (err) {
					console.warn('[AIChatService] IPC stream failed, falling back to HTTP:', err)
				}
			}
		}
		yield* httpStreamMessage(params, this.getBaseUrl, this.devToken)
	}
}

export const aiChatService = new AIChatService()
