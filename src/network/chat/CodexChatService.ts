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
			cliStartSession?: (payload: unknown) => Promise<unknown>
			cliSendMessageStream?: (payload: unknown) => AsyncGenerator<unknown>
			cliStopSession?: (payload: unknown) => Promise<unknown>
		}
	}
}

function getIpcBridge(): CLIIpcBridge {
	return window as unknown as CLIIpcBridge
}

const ADAPTER_NAME = 'codex'
const DEFAULT_MODEL = 'codex-mini'

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
	private cliSessionMap = new Map<string, string>()

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
		const model = options?.model || DEFAULT_MODEL
		const bridge = getIpcBridge()

		let cliSessionId: string | null = null
		if (hasIpcApi() && bridge.dweb?.cli?.cliStartSession) {
			try {
				const result = await ipcCall(
					() => bridge.dweb!.cli!.cliStartSession!({ adapter: ADAPTER_NAME }) as Promise<IpcResult>
				)
				const resultData = isRecord(result) ? result as Record<string, unknown> : {}
				cliSessionId = String(resultData.sessionId || '') || null
			} catch (err) {
				console.warn('Failed to start Codex CLI session:', err)
			}
		}

		const session: ChatSession = {
			id: sessionId,
			title: options?.title || 'Codex 对话',
			backend: 'codex',
			model,
			status: 'active',
			createdAt: new Date().toISOString(),
			projectId: options?.projectId,
			source: 'codex-cli'
		}
		this.activeSessions.set(sessionId, session)
		if (cliSessionId) {
			this.cliSessionMap.set(sessionId, cliSessionId)
		}
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
		const cliSessionId = this.cliSessionMap.get(sessionId)
		const bridge = getIpcBridge()
		if (cliSessionId) {
			if (hasIpcApi() && bridge.dweb?.cli?.cliStopSession) {
				try {
					await bridge.dweb.cli.cliStopSession({ sessionId: cliSessionId })
				} catch {}
			}
			this.cliSessionMap.delete(sessionId)
		}
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
		const model = options.model || session?.model || DEFAULT_MODEL
		const bridge = getIpcBridge()
		let cliSessionId: string | null = this.cliSessionMap.get(sessionId) || null

		if (!cliSessionId && hasIpcApi() && bridge.dweb?.cli?.cliStartSession) {
			try {
				const result = await ipcCall(
					() => bridge.dweb!.cli!.cliStartSession!({ adapter: ADAPTER_NAME }) as Promise<IpcResult>
				)
				const resultData = isRecord(result) ? result as Record<string, unknown> : {}
				cliSessionId = String(resultData.sessionId || '') || null
				if (cliSessionId) {
					this.cliSessionMap.set(sessionId, cliSessionId)
				}
			} catch (err: unknown) {
				yield { type: 'error', message: `Codex CLI 会话启动失败: ${err instanceof Error ? err.message : String(err)}` }
				return
			}
		}

		if (!hasIpcApi() || !bridge.dweb?.cli?.cliSendMessageStream) {
			yield { type: 'error', message: 'Codex CLI IPC 通道不可用' }
			return
		}

		if (!cliSessionId) {
			yield { type: 'error', message: 'Codex CLI 会话不可用' }
			return
		}

		const payload = {
			sessionId: cliSessionId,
			content: options.content,
			message: options.content,
			model,
		}

		const onAbort = () => {
			this.abort(sessionId).catch(() => {})
		}
		signal?.addEventListener('abort', onAbort)

		try {
			const gen = bridge.dweb.cli.cliSendMessageStream(payload)
			if (!gen || typeof gen[Symbol.asyncIterator] !== 'function') {
				yield { type: 'error', message: 'Codex CLI 流式通道不可用' }
				return
			}

			for await (const raw of gen) {
				if (signal?.aborted) {
					yield { type: 'error', message: '请求已取消' }
					return
				}

				if (raw && typeof raw === 'object' && 'type' in raw) {
					const chunkType = (raw as { type: string }).type
					if (chunkType === 'text' || chunkType === 'text_delta') {
						const content = String((raw as { content?: string; delta?: string; text?: string }).content
							|| (raw as { delta?: string }).delta
							|| (raw as { text?: string }).text
							|| '')
						if (content) {
							yield { type: 'text_delta', content }
						}
						continue
					}
					if (chunkType === 'thinking_delta' || chunkType === 'reasoning_delta') {
						const content = String((raw as { content?: string; delta?: string; text?: string }).content
							|| (raw as { delta?: string }).delta
							|| (raw as { text?: string }).text
							|| '')
						if (content) {
							yield { type: 'thinking_delta', content }
						}
						continue
					}
					if (chunkType === 'error') {
						yield { type: 'error', message: String((raw as { message?: string; error?: string }).message
							|| (raw as { error?: string }).error
							|| 'Unknown error') }
						return
					}
					if (chunkType === 'done' || chunkType === 'end') {
						yield { type: 'done' }
						return
					}
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
						if (!isRecord(m)) return { id: DEFAULT_MODEL, name: 'Codex Mini' }
						return {
							id: String((m as Record<string, unknown>).id || DEFAULT_MODEL),
							name: String((m as Record<string, unknown>).label || (m as Record<string, unknown>).id || 'Codex Mini'),
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
		if (!sessionId) return
		const cliSessionId = this.cliSessionMap.get(sessionId)
		const bridge = getIpcBridge()
		if (cliSessionId && hasIpcApi() && bridge.dweb?.cli?.cliStopSession) {
			try {
				await bridge.dweb.cli.cliStopSession({ sessionId: cliSessionId })
			} catch {
			}
		}
		if (hasIpcApi() && bridge.dweb?.cli?.cancel) {
			try {
				await bridge.dweb.cli.cancel({ sessionId })
			} catch {
			}
		}
	}

	private getFallbackModels(): ChatModelInfo[] {
		return [
			{ id: 'codex-mini', name: 'Codex Mini', vendor: 'OpenAI Codex', recommended: true, capabilities: ['chat', 'code'] },
		]
	}
}
