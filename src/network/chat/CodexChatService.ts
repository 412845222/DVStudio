import { isRecord, isString } from '../../types/utils'
import { hasIpcApi, ipcCall, type IpcResult } from '../ipcClient'
import type {
	IChatService,
	ChatSession,
	ChatStreamEvent,
	CreateSessionOptions,
	SendMessageOptions,
	ChatModelInfo
} from './types'

type CLIIpcBridge = {
	dweb?: {
		cli?: {
			cancel?: (payload: unknown) => Promise<unknown>
			listModels?: (payload: unknown) => Promise<unknown>
			checkAvailability?: (payload: unknown) => Promise<unknown>
		}
		agent?: {
			stream?: (payload: unknown) => AsyncGenerator<unknown>
			abort?: (payload: unknown) => Promise<unknown>
		}
	}
}

function getIpcBridge(): CLIIpcBridge {
	return window as unknown as CLIIpcBridge
}

function toPlain<T>(value: T): T {
	if (value === null || value === undefined) return value
	return JSON.parse(JSON.stringify(value))
}

const ADAPTER_NAME = 'codex'

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

export class CodexChatService implements IChatService {
	readonly backend = 'codex' as const
	private activeSessions = new Map<string, ChatSession>()

	async isAvailable(): Promise<boolean> {
		try {
			const bridge = getIpcBridge()
			if (hasIpcApi() && bridge.dweb?.cli?.checkAvailability) {
				const result = await ipcCall(
					() => bridge.dweb!.cli!.checkAvailability!({ name: ADAPTER_NAME }) as Promise<IpcResult>
				)
				return Boolean(result && (result as Record<string, unknown>).available)
			}
			return false
		} catch {
			return false
		}
	}

	async createSession(options?: CreateSessionOptions): Promise<ChatSession> {
		const sessionId = `codex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
		const session: ChatSession = {
			id: sessionId,
			title: options?.title || 'Codex 对话',
			backend: 'codex',
			model: options?.model || 'gpt-4o',
			status: 'active',
			createdAt: new Date().toISOString(),
			projectId: options?.projectId,
			source: 'codex-cli'
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
		const bridge = getIpcBridge()
		if (hasIpcApi() && bridge.dweb?.cli?.cancel) {
			try {
				await bridge.dweb.cli.cancel({ sessionId })
			} catch {}
		}
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
			backend: 'codex',
			prompt: options.content,
			content: options.content,
			model: options.model || session?.model || 'gpt-4o',
			context: options.context,
			history: options.history,
			apiKeys: options.apiKeys || {},
			thinkingEffort: options.thinkingEffort || 'medium',
			sessionId,
		})

		const onAbort = () => {
			if (bridge.dweb?.agent?.abort) {
				bridge.dweb.agent.abort({ sessionId }).catch(() => {})
			}
			if (bridge.dweb?.cli?.cancel) {
				bridge.dweb.cli.cancel({ sessionId }).catch(() => {})
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
				yield { type: 'error', message: `Codex 调用失败: ${msg}` }
			}
		} finally {
			signal?.removeEventListener('abort', onAbort)
		}
	}

	async listModels(forceRefresh?: boolean): Promise<{ models: ChatModelInfo[] }> {
		const bridge = getIpcBridge()
		if (!hasIpcApi() || !bridge.dweb?.cli?.listModels) {
			return { models: this.getFallbackModels() }
		}
		try {
			const result = await ipcCall(
				() => bridge.dweb!.cli!.listModels!({ adapter: ADAPTER_NAME, forceRefresh: !!forceRefresh }) as Promise<IpcResult>
			)
			const models = isRecord(result) ? (result as Record<string, unknown>).models : null
			if (Array.isArray(models) && models.length > 0) {
				return {
					models: models.map((m: unknown) => {
						if (!isRecord(m)) return { id: 'gpt-4o', name: 'GPT-4o' }
						return {
							id: String((m as Record<string, unknown>).id || 'gpt-4o'),
							name: String((m as Record<string, unknown>).label || (m as Record<string, unknown>).id || 'GPT-4o'),
							vendor: String((m as Record<string, unknown>).vendor || 'OpenAI Codex'),
							capabilities: Array.isArray((m as Record<string, unknown>).capabilities)
								? (m as Record<string, unknown>).capabilities as string[]
								: undefined,
							recommended: Boolean((m as Record<string, unknown>).recommended)
						}
					})
				}
			}
		} catch {
		}
		return { models: this.getFallbackModels() }
	}

	async abort(sessionId?: string): Promise<void> {
		const bridge = getIpcBridge()
		if (!sessionId) return
		try {
			if (bridge.dweb?.agent?.abort) {
				await bridge.dweb.agent.abort({ sessionId })
			}
			if (bridge.dweb?.cli?.cancel) {
				await bridge.dweb.cli.cancel({ sessionId })
			}
		} catch {
		}
	}

	private getFallbackModels(): ChatModelInfo[] {
		return [
			{ id: 'gpt-4o', name: 'GPT-4o', vendor: 'OpenAI Codex', recommended: true, capabilities: ['chat', 'code'] },
			{ id: 'gpt-4o-mini', name: 'GPT-4o Mini', vendor: 'OpenAI Codex', capabilities: ['chat', 'code'] },
		]
	}
}
