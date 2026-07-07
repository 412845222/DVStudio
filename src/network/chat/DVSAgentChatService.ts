import { isRecord, isString } from '../../types/utils'
import { hasIpcApi } from '../ipcClient'
import { getChatModelCatalog } from '../../ai/models/chatModels'
import type {
	IChatService,
	ChatSession,
	ChatStreamEvent,
	CreateSessionOptions,
	SendMessageOptions,
	ChatModelInfo
} from './types'

type DVSAgentIpcBridge = {
	dweb?: {
		agent?: {
			stream?: (payload: unknown) => AsyncGenerator<unknown>
			abort?: (payload: unknown) => Promise<unknown>
		}
	}
}

function getIpcBridge(): DVSAgentIpcBridge {
	return window as unknown as DVSAgentIpcBridge
}

function toPlain<T>(value: T): T {
	if (value === null || value === undefined) return value
	return JSON.parse(JSON.stringify(value)) as T
}

export class DVSAgentChatService implements IChatService {
	readonly backend = 'dvsagent' as const
	private activeSessions = new Map<string, ChatSession>()

	async isAvailable(): Promise<boolean> {
		return true
	}

	async createSession(options?: CreateSessionOptions): Promise<ChatSession> {
		const sessionId = `dvsagent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
		const session: ChatSession = {
			id: sessionId,
			title: options?.title || 'DVS Agent 对话',
			backend: 'dvsagent',
			model: options?.model,
			status: 'active',
			createdAt: new Date().toISOString(),
			projectId: options?.projectId,
		}
		this.activeSessions.set(sessionId, session)
		return session
	}

	async listSessions(_projectId?: number | null): Promise<ChatSession[]> {
		return Array.from(this.activeSessions.values())
	}

	async getSession(sessionId: string): Promise<ChatSession | null> {
		return this.activeSessions.get(sessionId) || null
	}

	async deleteSession(sessionId: string, _projectId?: number | null): Promise<{ ok: boolean }> {
		this.activeSessions.delete(sessionId)
		return { ok: true }
	}

	async *sendMessage(
		sessionId: string,
		options: SendMessageOptions,
		signal?: AbortSignal
	): AsyncGenerator<ChatStreamEvent, void, void> {
		const session = this.activeSessions.get(sessionId)
		const bridge = getIpcBridge()

		if (!hasIpcApi() || !bridge.dweb?.agent?.stream) {
			yield { type: 'error', message: 'Agent IPC 通道不可用' }
			return
		}

		const payload = toPlain({
			backend: 'dvsagent',
			prompt: options.content,
			content: options.content,
			model: options.model || session?.model || 'doubao-seed-evolving',
			context: options.context,
			history: options.history,
			apiKeys: options.apiKeys || {},
			apiSource: options.apiSource || 'bytedance',
			thinkingEffort: options.thinkingEffort || 'medium',
			sessionId,
		})

		const onAbort = () => {
			if (bridge.dweb?.agent?.abort) {
				bridge.dweb.agent.abort({ sessionId }).catch(() => {})
			}
		}
		signal?.addEventListener('abort', onAbort)

		try {
			const gen = bridge.dweb.agent.stream(payload)
			if (!gen || typeof gen[Symbol.asyncIterator] !== 'function') {
				yield { type: 'error', message: 'Agent 流式通道不可用' }
				return
			}

			for await (const raw of gen) {
				if (signal?.aborted) {
					yield { type: 'error', message: '请求已取消' }
					return
				}
				const ev = normalizeToChatEvent(raw)
				if (ev) {
					yield ev
					if (ev.type === 'done') return
				}
			}
			yield { type: 'done' }
		} catch (err: unknown) {
			if (signal?.aborted) {
				yield { type: 'error', message: '请求已取消' }
			} else {
				const msg = err && typeof err === 'object' && 'message' in err
					? String((err as { message: unknown }).message)
					: String(err)
				yield { type: 'error', message: `Agent 调用失败: ${msg}` }
			}
		} finally {
			signal?.removeEventListener('abort', onAbort)
		}
	}

	async listModels(_forceRefresh?: boolean): Promise<{ models: ChatModelInfo[] }> {
		const models = getChatModelCatalog()
			.filter((m) => m.needType === 'text' && m.apiSource !== 'local-exec' && m.apiSource !== 'copilot')
			.map((m) => ({
				id: m.id,
				name: m.label,
				vendor: m.vendor,
				recommended: m.recommended,
			}))
		return { models }
	}

	async abort(sessionId?: string): Promise<void> {
		const bridge = getIpcBridge()
		if (!sessionId) return
		try {
			if (bridge.dweb?.agent?.abort) {
				await bridge.dweb.agent.abort({ sessionId })
			}
		} catch {
		}
	}
}

function normalizeToChatEvent(raw: unknown): ChatStreamEvent | null {
	if (!raw || !isRecord(raw)) return null
	const type = String(raw.type || raw.event || '')

	if (type === 'text' || type === 'content' || type === 'text_delta') {
		const content = String(raw.content || raw.text || raw.delta || '')
		return content ? { type: 'text_delta', content } : null
	}
	if (type === 'thinking_delta' || type === 'reasoning_delta') {
		const content = String(raw.content || raw.text || raw.delta || '')
		return content ? { type: 'thinking_delta', content } : null
	}
	if (type === 'thought' || type === 'reasoning') {
		return { type: 'thought', content: String(raw.content || raw.text || '') }
	}
	if (type === 'tool_call_start') {
		return {
			type: 'tool_call_start',
			toolCallId: String(raw.toolCallId || raw.id || ''),
			tool: String(raw.tool || raw.name || ''),
			input: raw.input || raw.arguments,
		}
	}
	if (type === 'tool_call_end') {
		return {
			type: 'tool_call_end',
			toolCallId: String(raw.toolCallId || raw.id || ''),
			tool: String(raw.tool || raw.name || ''),
			output: raw.output || raw.result,
		}
	}
	if (type === 'tool_call_error') {
		return {
			type: 'tool_call_error',
			toolCallId: String(raw.toolCallId || raw.id || ''),
			tool: String(raw.tool || raw.name || ''),
			error: String(raw.error || raw.message || ''),
		}
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
			truncated: Boolean(raw.truncated),
		}
	}
	if (isString(raw)) {
		return { type: 'text_delta', content: raw }
	}
	return null
}
