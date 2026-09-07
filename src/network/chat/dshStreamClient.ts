/**
 * DSHStreamClient — 独立的 DeepSeek-Harness 流式对话客户端。
 *
 * 设计目标：
 *  - 不依赖 AgentChatBridge / IChatService，可在任意需要 Agent 流式对话的场景复用
 *    （蓝图对话框、独立对话页、节点内对话等）
 *  - 提供会话管理 + 流式 prompt 的完整能力
 *  - 事件输出为归一化的 DshStreamEvent，消费方按需映射到自身的事件类型
 *
 * 用法：
 *   const client = new DshStreamClient('http://127.0.0.1:3080')
 *   const { sessionId } = await client.createSession()
 *   for await (const ev of client.streamPrompt(sessionId, '你好')) {
 *     if (ev.type === 'text') process.stdout.write(ev.content)
 *   }
 */

import {
	DshTransport,
	type DshTransportLike,
	type RpcResult,
	type DshPromptContentPart,
	type DshHistoryEvent,
	type DshModelCatalog
} from './dshAgentProtocol'

const LOG_PREFIX = '[DSH-Link][client]'

function log(...args: unknown[]): void {
	// eslint-disable-next-line no-console
	console.log(LOG_PREFIX, ...args)
}
function logError(...args: unknown[]): void {
	// eslint-disable-next-line no-console
	console.error(LOG_PREFIX, ...args)
}

/** 归一化的流式事件，与具体 UI 解耦。 */
export type DshStreamEvent =
	| { type: 'text'; content: string }
	| { type: 'thinking'; content: string }
	| { type: 'tool_call_start'; toolCallId: string; tool: string; input: string }
	| { type: 'tool_call_end'; toolCallId: string; tool: string; output: string }
	| { type: 'tool_call_error'; toolCallId: string; tool: string; error: string }
	| { type: 'done' }
	| { type: 'error'; message: string }

export interface DshCreateSessionOptions {
	cwd?: string
	agentPreset?: string
}

export interface DshModelInfo {
	id: string
	name: string
	vendor: string
	recommended?: boolean
}

function isOk<T>(result: RpcResult<T>): result is { ok: true; value: T } {
	return result.ok === true
}

export class DshStreamClient {
	private transport: DshTransportLike

	constructor(baseUrlOrTransport: string | DshTransportLike) {
		this.transport =
			typeof baseUrlOrTransport === 'string'
				? new DshTransport(baseUrlOrTransport.replace(/\/$/, ''))
				: baseUrlOrTransport
	}

	/** 重新设置服务地址（例如 Harness 重启后端口变化）。 */
	setBaseUrl(baseUrl: string) {
		this.transport = new DshTransport(baseUrl.replace(/\/$/, ''))
	}

	/** 注入自定义传输层（例如 Electron IPC 代理）。 */
	setTransport(transport: DshTransportLike) {
		this.transport = transport
	}

	/** 探测 Harness 服务是否可访问。 */
	async isAvailable(): Promise<boolean> {
		try {
			const result = await this.transport.call('session/list', {})
			log('isAvailable session/list → ok=', result.ok)
			return isOk(result)
		} catch (err) {
			logError('isAvailable exception:', err)
			return false
		}
	}

	/** 创建一个新会话。 */
	async createSession(
		options?: DshCreateSessionOptions
	): Promise<{ sessionId: string; agentPreset?: string }> {
		const payload: { cwd?: string; agentPreset?: string } = {}
		if (options?.cwd) payload.cwd = options.cwd
		log('createSession call session/create payload=', payload)
		const result = await this.transport.call<
			typeof payload,
			{ sessionId: string; agentPreset?: string }
		>('session/create', payload)
		log(
			'createSession result ok=',
			result.ok,
			'value=',
			(result as { value?: unknown }).value,
			'error=',
			(result as { error?: unknown }).error
		)
		if (!isOk(result)) {
			const errMsg = (result as { error?: { message?: string } }).error?.message || '未知错误'
			logError('createSession failed:', errMsg)
			throw new Error(`DSH 创建会话失败: ${errMsg}`)
		}
		// DSH session/create 返回 { sessionId, agentPreset? }
		const value = result.value as unknown
		const sessionId = (value as { sessionId?: string })?.sessionId
		if (!sessionId) {
			logError('createSession: 响应未包含 sessionId, value=', JSON.stringify(value))
			throw new Error(
				`DSH 创建会话失败: 未返回 sessionId (value=${JSON.stringify(value).slice(0, 200)})`
			)
		}
		log('createSession success sessionId=', sessionId)
		return { sessionId, agentPreset: (value as { agentPreset?: string })?.agentPreset }
	}

	/** 取消指定会话中正在进行的请求。 */
	async cancelSession(sessionId: string): Promise<void> {
		await this.transport.call('session/cancel', { sessionId }).catch(() => {})
	}

	/**
	 * 发送 prompt 并以归一化事件流返回。
	 *
	 * @param sessionId  会话 ID
	 * @param content    用户文本（也可扩展为多模态内容数组）
	 * @param signal     外部 AbortSignal，取消时会调用 session.cancel
	 */
	async *streamPrompt(
		sessionId: string,
		content: string | DshPromptContentPart[],
		signal?: AbortSignal
	): AsyncGenerator<DshStreamEvent> {
		const parts: DshPromptContentPart[] =
			typeof content === 'string' ? [{ type: 'text', text: content }] : content
		log('streamPrompt sessionId=', sessionId, 'parts=', parts.length)

		const abortController = new AbortController()
		const onExternalAbort = () => {
			log('streamPrompt external abort received, cancelling session', sessionId)
			void this.transport.call('session.cancel', { sessionId }).catch(() => {})
			abortController.abort()
		}
		signal?.addEventListener('abort', onExternalAbort)

		try {
			let turnEnded = false
			let eventCount = 0
			for await (const event of this.transport.streamTurn(
				sessionId,
				parts,
				abortController.signal
			)) {
				if (signal?.aborted) {
					log('streamPrompt signal aborted, stopping')
					yield { type: 'error', message: '请求已取消' }
					return
				}
				eventCount++
				if (eventCount === 1) log('streamPrompt first event type=', event.type)

				const evType = String(event.type)

				if (evType === '__error__') {
					const errData = event.data as { error?: { message?: string; code?: string } } | undefined
					logError('streamPrompt transport error:', errData?.error)
					yield { type: 'error', message: errData?.error?.message || 'DSH 调用失败' }
					return
				}

				// session.history 事件格式：data 字段携带负载
				const data = event.data as
					| {
							message?: { content: Array<{ type: string; text?: string }> }
							chunk?: { type: string; text?: string }
							callId?: string
							name?: string
							arguments?: string
							error?: { name: string; code: string }
					  }
					| undefined

				if (evType === 'assistant/message') {
					for (const block of data?.message?.content || []) {
						if (block.type === 'text' && typeof block.text === 'string' && block.text) {
							yield { type: 'text', content: block.text }
						}
					}
				} else if (evType === 'assistant/chunk') {
					const chunk = data?.chunk
					if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
						yield { type: 'text', content: chunk.text }
					} else if (chunk?.type === 'reasoning-delta' && typeof chunk.text === 'string') {
						yield { type: 'thinking', content: chunk.text }
					}
				} else if (evType === 'assistant-stream') {
					// session/follow 实时流式帧：data 是 SessionAssistantStreamFrame
					// { type: 'start'|'chunk'|'end', ... }
					// chunk 帧的 data.chunk 是 StreamChunk: { type: 'text-delta'|'reasoning-delta'|..., text }
					const frame = event.data as
						| {
								type: 'chunk'
								chunk?: { type: string; text?: string }
						  }
						| { type: 'start' | 'end' }
						| undefined
					if (frame?.type === 'chunk') {
						const chunk = frame.chunk
						if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
							yield { type: 'text', content: chunk.text }
						} else if (chunk?.type === 'reasoning-delta' && typeof chunk.text === 'string') {
							yield { type: 'thinking', content: chunk.text }
						}
					}
					// start/end 帧不产生输出，只是流控制
				} else if (evType === 'tool/call' || evType === 'tool_call') {
					yield {
						type: 'tool_call_start',
						toolCallId: String(data?.callId || ''),
						tool: String(data?.name || ''),
						input: data?.arguments || ''
					}
				} else if (evType === 'tool/result' || evType === 'tool_result') {
					const callId = String((data as { callId?: string })?.callId || '')
					if (data?.error) {
						yield {
							type: 'tool_call_error',
							toolCallId: callId,
							tool: '',
							error: data.error.name || data.error.code
						}
					} else {
						const text = data?.message?.content?.[0]?.text || ''
						yield { type: 'tool_call_end', toolCallId: callId, tool: '', output: text }
					}
				} else if (evType === 'turn/end') {
					turnEnded = true
					yield { type: 'done' }
					break
				}
			}
			if (!turnEnded) yield { type: 'done' }
		} catch (err) {
			logError('streamPrompt exception:', err)
			if (signal?.aborted) {
				yield { type: 'error', message: '请求已取消' }
			} else {
				const msg = err instanceof Error ? err.message : String(err)
				yield { type: 'error', message: `DSH 调用失败: ${msg}` }
			}
		} finally {
			signal?.removeEventListener('abort', onExternalAbort)
			abortController.abort()
		}
	}

	/** 拉取 Harness 侧可用的模型目录。 */
	async listModels(): Promise<DshModelInfo[]> {
		const result = await this.transport.call<{}, DshModelCatalog>('llm.providers', {})
		if (!isOk(result)) return []
		const models: DshModelInfo[] = []
		for (const group of result.value.groups) {
			for (const m of group.models) {
				models.push({
					id: `${group.id}:${m.id}`,
					name: m.name,
					vendor: group.name,
					recommended: group.id.includes('deepseek')
				})
			}
		}
		return models
	}
}
