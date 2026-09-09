/**
 * DSHAgent Chat Service — 将独立的 DshStreamClient 适配为 IChatService，
 * 供蓝图页底部 Agent 对话框使用。
 *
 * 真正的流式对话逻辑（会话创建、prompt、mux 事件映射）已下沉到
 * dshStreamClient.ts，可在任意需要 DSH 流式对话的场景复用。
 */

import type {
	IChatService,
	ChatSession,
	ChatStreamEvent,
	CreateSessionOptions,
	SendMessageOptions,
	ChatModelInfo
} from './types'
import { DshStreamClient, type DshStreamEvent } from './dshStreamClient'
import { DshIpcTransport } from './dshIpcTransport'
import { hasDeepSeekHarness } from '../../electronBridge'

const LOG_PREFIX = '[DSH-Link][service]'

function log(...args: unknown[]): void {
	// eslint-disable-next-line no-console
	console.log(LOG_PREFIX, ...args)
}
function logError(...args: unknown[]): void {
	// eslint-disable-next-line no-console
	console.error(LOG_PREFIX, ...args)
}

export class DSHAgentChatService implements IChatService {
	readonly backend = 'dshagent' as const

	private client: DshStreamClient | null = null
	private sessions = new Map<string, ChatSession>()

	/**
	 * 设置运行中的 Harness 服务地址。
	 * 在 Electron 中优先使用 IPC 代理传输层（绕过 CORS），
	 * 非 Electron 环境则直连 HTTP+WebSocket。
	 */
	setBaseUrl(baseUrl: string) {
		const inElectron = hasDeepSeekHarness()
		log('setBaseUrl baseUrl=', baseUrl, 'inElectron=', inElectron)
		if (inElectron) {
			this.client = new DshStreamClient(new DshIpcTransport())
		} else {
			this.client = new DshStreamClient(baseUrl)
		}
	}

	private assertClient(): DshStreamClient {
		if (!this.client) {
			logError('assertClient failed: client is null (setBaseUrl 未调用)')
			throw new Error('DSHAgent 未连接，请先启动 DeepSeek-Harness 服务')
		}
		return this.client
	}

	async isAvailable(): Promise<boolean> {
		if (!this.client) return false
		return this.client.isAvailable()
	}

	async createSession(options?: CreateSessionOptions): Promise<ChatSession> {
		log('createSession options=', options)
		const client = this.assertClient()
		try {
			const { sessionId } = await client.createSession({ cwd: options?.cwd })
			const session: ChatSession = {
				id: sessionId,
				title: options?.title || 'DSH Agent 对话',
				backend: 'dshagent',
				model: options?.model,
				status: 'active',
				createdAt: new Date().toISOString(),
				projectId: options?.projectId ?? null
			}
			this.sessions.set(sessionId, session)
			log('createSession success sessionId=', sessionId)
			return session
		} catch (err) {
			logError('createSession exception:', err)
			throw err
		}
	}

	async listSessions(_projectId?: number | null): Promise<ChatSession[]> {
		// 会话列表管理由 Harness 自身承担；这里返回本地缓存的会话。
		return Array.from(this.sessions.values())
	}

	async getSession(sessionId: string): Promise<ChatSession | null> {
		return this.sessions.get(sessionId) || null
	}

	async deleteSession(sessionId: string): Promise<{ ok: boolean }> {
		this.sessions.delete(sessionId)
		return { ok: true }
	}

	async *sendMessage(
		sessionId: string,
		options: SendMessageOptions,
		signal?: AbortSignal
	): AsyncGenerator<ChatStreamEvent, void, void> {
		const client = this.assertClient()

		// DSHAgent 的模型在 Harness WebUI 中配置，这里忽略 options.model。
		// 把 systemPrompt 和 history 传给 streamPrompt，避免每次把 system prompt
		// 当作用户输入拼到 content 里导致模型重复输出介绍文本。
		for await (const ev of client.streamPrompt(sessionId, options.content, signal, {
			history: options.history,
			systemPrompt: options.systemPrompt
		})) {
			yield mapStreamEvent(ev)
		}
	}

	async listModels(): Promise<{ models: ChatModelInfo[] }> {
		const client = this.assertClient()
		const models = await client.listModels()
		return { models }
	}

	async abort(sessionId?: string): Promise<void> {
		if (!sessionId || !this.client) return
		await this.client.cancelSession(sessionId)
	}
}

/** 将独立客户端的归一化事件映射为 Agent 对话框使用的 ChatStreamEvent。 */
function mapStreamEvent(ev: DshStreamEvent): ChatStreamEvent {
	switch (ev.type) {
		case 'text':
			return { type: 'text_delta', content: ev.content }
		case 'thinking':
			return { type: 'thinking_delta', content: ev.content }
		case 'tool_call_start':
			return { type: 'tool_call_start', toolCallId: ev.toolCallId, tool: ev.tool, input: ev.input }
		case 'tool_call_end':
			return { type: 'tool_call_end', toolCallId: ev.toolCallId, tool: ev.tool, output: ev.output }
		case 'tool_call_error':
			return { type: 'tool_call_error', toolCallId: ev.toolCallId, tool: ev.tool, error: ev.error }
		case 'done':
			return { type: 'done' }
		case 'error':
			return { type: 'error', message: ev.message }
	}
}
