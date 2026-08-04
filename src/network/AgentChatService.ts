import { isRecord, isString } from '../types/utils'
import { getBackendBaseUrl } from './backendConfig'
import { hasIpcApi, ipcOrHttp, unwrapIpcResult, type IpcResult } from './ipcClient'

export type AgentStreamChunk =
	| { type: 'text'; content: string }
	| { type: 'thinking_delta'; content: string }
	| { type: 'tool_call_start'; toolCallId: string; tool: string; input?: unknown }
	| {
			type: 'tool_call_end'
			toolCallId: string
			tool: string
			output?: unknown
			images?: Array<{ mimeType: string; dataUrl: string; fileName?: string }>
	  }
	| { type: 'tool_call_error'; toolCallId: string; tool: string; error: string }
	| { type: 'tool_call'; tool: string; input?: unknown }
	| { type: 'tool_result'; tool: string; output?: unknown }
	| { type: 'thought'; content: string }
	| { type: 'error'; message: string }
	| { type: 'done' }
	| {
			type: 'context_usage'
			tokenCount: number
			budget: number
			usage: number
			truncated?: boolean
	  }

export type AgentContextItem = {
	name: string
	type: string
	content: string
}

export type AgentConversation = {
	id: string
	title: string
	model: string
	systemPrompt: string
	projectPath: string
	createdAt: number
	updatedAt: number
}

export type AgentConversationMessage = {
	id: string
	conversationId: string
	role: string
	content: string
	model: string
	tokensUsed: number
	createdAt: number
}

export type AgentStreamOptions = {
	prompt: string
	model?: string
	context?: unknown
	tools?: string[]
	systemPrompt?: string
	sessionId?: string
	apiSource?: string
	apiKeys?: Record<string, string>
	thinkingEffort?: 'disabled' | 'low' | 'medium' | 'high'
	history?: Array<{ role: string; content: string }>
}

type AgentIpcBridge = {
	dweb?: {
		agent?: {
			stream?: (payload: unknown) => AsyncGenerator<unknown>
			getContext?: (payload: unknown) => Promise<unknown>
			abort?: (payload: unknown) => Promise<unknown>
			listConversations?: (payload: unknown) => Promise<unknown>
			createConversation?: (payload: unknown) => Promise<unknown>
			deleteConversation?: (payload: unknown) => Promise<unknown>
			renameConversation?: (payload: unknown) => Promise<unknown>
			getConversationMessages?: (payload: unknown) => Promise<unknown>
			addConversationMessage?: (payload: unknown) => Promise<unknown>
		}
	}
}

function getIpcBridge(): AgentIpcBridge {
	return window as unknown as AgentIpcBridge
}

export async function agentGetContext(
	projectPath?: string
): Promise<IpcResult<{ items: AgentContextItem[] }>> {
	return ipcOrHttp(
		() =>
			getIpcBridge().dweb?.agent?.getContext?.({ projectPath }) as Promise<
				IpcResult<{ items: AgentContextItem[] }>
			>,
		async () => {
			const res = await fetch(`${getBackendBaseUrl()}/api/agent/context`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ projectPath })
			})
			return res.json()
		}
	)
}

export async function agentAbort(sessionId?: string): Promise<IpcResult<{ aborted: boolean }>> {
	return ipcOrHttp(
		() =>
			getIpcBridge().dweb?.agent?.abort?.({ sessionId }) as Promise<
				IpcResult<{ aborted: boolean }>
			>,
		async () => {
			const res = await fetch(`${getBackendBaseUrl()}/api/agent/abort`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sessionId })
			})
			return res.json()
		}
	)
}

export async function agentListConversations(
	projectPath?: string
): Promise<IpcResult<{ conversations: AgentConversation[] }>> {
	return ipcOrHttp(
		() =>
			getIpcBridge().dweb?.agent?.listConversations?.({ projectPath }) as Promise<
				IpcResult<{ conversations: AgentConversation[] }>
			>,
		async () => {
			const res = await fetch(`${getBackendBaseUrl()}/api/agent/conversations`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ projectPath })
			})
			return res.json()
		}
	)
}

export async function agentCreateConversation(
	title?: string,
	model?: string,
	projectPath?: string
): Promise<IpcResult<{ conversation: AgentConversation }>> {
	return ipcOrHttp(
		() =>
			getIpcBridge().dweb?.agent?.createConversation?.({ title, model, projectPath }) as Promise<
				IpcResult<{ conversation: AgentConversation }>
			>,
		async () => {
			const res = await fetch(`${getBackendBaseUrl()}/api/agent/conversations/create`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title, model, projectPath })
			})
			return res.json()
		}
	)
}

export async function agentDeleteConversation(id: string): Promise<IpcResult<{ ok: boolean }>> {
	return ipcOrHttp(
		() =>
			getIpcBridge().dweb?.agent?.deleteConversation?.({ id }) as Promise<
				IpcResult<{ ok: boolean }>
			>,
		async () => {
			const res = await fetch(`${getBackendBaseUrl()}/api/agent/conversations/${id}`, {
				method: 'DELETE'
			})
			return res.json()
		}
	)
}

export async function agentRenameConversation(
	id: string,
	title: string
): Promise<IpcResult<{ ok: boolean }>> {
	return ipcOrHttp(
		() =>
			getIpcBridge().dweb?.agent?.renameConversation?.({ id, title }) as Promise<
				IpcResult<{ ok: boolean }>
			>,
		async () => {
			const res = await fetch(`${getBackendBaseUrl()}/api/agent/conversations/${id}/rename`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title })
			})
			return res.json()
		}
	)
}

export async function agentGetConversationMessages(
	conversationId: string
): Promise<IpcResult<{ messages: AgentConversationMessage[] }>> {
	return ipcOrHttp(
		() =>
			getIpcBridge().dweb?.agent?.getConversationMessages?.({ conversationId }) as Promise<
				IpcResult<{ messages: AgentConversationMessage[] }>
			>,
		async () => {
			const res = await fetch(
				`${getBackendBaseUrl()}/api/agent/conversations/${conversationId}/messages`,
				{
					method: 'GET'
				}
			)
			return res.json()
		}
	)
}

export async function agentAddConversationMessage(
	conversationId: string,
	role: string,
	content: string,
	model?: string
): Promise<IpcResult<{ ok: boolean }>> {
	return ipcOrHttp(
		() =>
			getIpcBridge().dweb?.agent?.addConversationMessage?.({
				conversationId,
				role,
				content,
				model
			}) as Promise<IpcResult<{ ok: boolean }>>,
		async () => {
			const res = await fetch(
				`${getBackendBaseUrl()}/api/agent/conversations/${conversationId}/messages`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ conversationId, role, content, model })
				}
			)
			return res.json()
		}
	)
}

export async function* agentStream(options: AgentStreamOptions): AsyncGenerator<AgentStreamChunk> {
	const bridge = getIpcBridge()
	const hasIpc = hasIpcApi()
	const hasAgentStream = !!bridge.dweb?.agent?.stream

	if (hasIpc && hasAgentStream) {
		try {
			const streamFn = bridge.dweb?.agent?.stream
			if (!streamFn) {
				console.warn('[AgentChatService] Agent stream function not found, falling back to HTTP')
			} else {
				const gen = streamFn(options)
				if (!gen || typeof gen[Symbol.asyncIterator] !== 'function') {
					console.warn('[AgentChatService] Agent stream not iterable via IPC, falling back to HTTP')
				} else {
					let ipcSucceeded = false
					try {
						for await (const raw of gen) {
							const chunk = normalizeAgentChunk(raw)
							if (chunk) {
								yield chunk
								ipcSucceeded = true
							}
						}
					} catch (ipcErr: unknown) {
						const ipcMsg =
							ipcErr && typeof ipcErr === 'object' && 'message' in ipcErr
								? String((ipcErr as { message: unknown }).message)
								: String(ipcErr)
						console.warn('[AgentChatService] IPC stream failed, falling back to HTTP:', ipcMsg)
						if (ipcSucceeded) {
							yield { type: 'error', message: ipcMsg }
							return
						}
					}
					if (ipcSucceeded) {
						return
					}
				}
			}
		} catch (err: unknown) {
			const msg =
				err && typeof err === 'object' && 'message' in err
					? String((err as { message: unknown }).message)
					: String(err)
			console.warn('[AgentChatService] IPC stream init failed, falling back to HTTP:', msg)
		}
	} else if (hasIpc && !hasAgentStream) {
		console.warn(
			'[AgentChatService] IPC available but dweb.agent.stream not found, falling back to HTTP'
		)
	}

	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), 30000)

	try {
		const res = await fetch(`${getBackendBaseUrl()}/api/agent/stream`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(options),
			signal: controller.signal
		})
		if (!res.ok || !res.body) {
			const errText = res.ok ? 'No response body' : `HTTP ${res.status}`
			yield { type: 'error', message: errText }
			return
		}
		const reader = res.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ''
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			buffer += decoder.decode(value, { stream: true })
			const lines = buffer.split('\n')
			buffer = lines.pop() || ''
			for (const line of lines) {
				const trimmed = line.trim()
				if (!trimmed || trimmed.startsWith('data: [DONE]')) continue
				const dataStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed
				try {
					const raw = JSON.parse(dataStr)
					const chunk = normalizeAgentChunk(raw)
					if (chunk) yield chunk
				} catch {
					yield { type: 'text', content: dataStr }
				}
			}
		}
		yield { type: 'done' }
	} catch (err: unknown) {
		const msg =
			err && typeof err === 'object' && 'message' in err
				? String((err as { message: unknown }).message)
				: String(err)
		if (msg === 'The operation was aborted.') {
			yield { type: 'error', message: '请求超时' }
		} else {
			yield { type: 'error', message: `Agent 调用失败: ${msg}` }
		}
	} finally {
		clearTimeout(timeoutId)
	}
}

function normalizeAgentChunk(raw: unknown): AgentStreamChunk | null {
	if (!raw || !isRecord(raw)) return null
	const type = String(raw.type || raw.event || '')
	if (type === 'text' || type === 'content' || type === 'text_delta') {
		const content = String(raw.content || raw.text || raw.delta || '')
		return content ? { type: 'text', content } : null
	}
	if (type === 'thinking_delta' || type === 'reasoning_delta') {
		const content = String(raw.content || raw.text || raw.delta || '')
		return content ? { type: 'thinking_delta', content } : null
	}
	if (type === 'tool_call_start') {
		return {
			type: 'tool_call_start',
			toolCallId: String(raw.toolCallId || raw.id || ''),
			tool: String(raw.tool || raw.name || ''),
			input: raw.input || raw.arguments
		}
	}
	if (type === 'tool_call_end') {
		return {
			type: 'tool_call_end',
			toolCallId: String(raw.toolCallId || raw.id || ''),
			tool: String(raw.tool || raw.name || ''),
			output: raw.output || raw.result,
			images: Array.isArray(raw.images) ? raw.images : undefined
		}
	}
	if (type === 'tool_call_error') {
		return {
			type: 'tool_call_error',
			toolCallId: String(raw.toolCallId || raw.id || ''),
			tool: String(raw.tool || raw.name || ''),
			error: String(raw.error || raw.message || '')
		}
	}
	if (type === 'tool_call' || type === 'tool-call') {
		return {
			type: 'tool_call',
			tool: String(raw.tool || raw.name || ''),
			input: raw.input || raw.arguments
		}
	}
	if (type === 'tool_result' || type === 'tool-result') {
		return {
			type: 'tool_result',
			tool: String(raw.tool || raw.name || ''),
			output: raw.output || raw.result
		}
	}
	if (type === 'thought' || type === 'reasoning') {
		return { type: 'thought', content: String(raw.content || raw.text || '') }
	}
	if (type === 'error') {
		return { type: 'error', message: String(raw.message || raw.error || 'Unknown error') }
	}
	if (type === 'done' || type === 'end') {
		return { type: 'done' }
	}
	if (type === 'context_usage') {
		return {
			type: 'context_usage',
			tokenCount: Number(raw.tokenCount || 0),
			budget: Number(raw.budget || 0),
			usage: Number(raw.usage || 0),
			truncated: Boolean(raw.truncated)
		}
	}
	if (isString(raw)) {
		return { type: 'text', content: raw }
	}
	return null
}
