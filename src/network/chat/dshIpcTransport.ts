/**
 * DshIpcTransport — 通过 Electron IPC 代理访问 Harness 的传输层实现。
 *
 * 为什么需要它：
 *  - 渲染进程受浏览器同源策略/CORS 限制，无法直接 fetch
 *    本地 Harness 服务（127.0.0.1:xxxx）。
 *  - 走 IPC 让主进程代为发起 HTTP 请求，天然绕过 CORS。
 *
 * streamTurn 通过 IPC 流式通道（dshAgentStream）获取轮询事件，
 * 主进程负责 session.prompt + session.history 轮询，
 * 渲染端只需消费归一化的 DshHistoryEvent。
 *
 * 与 DshTransport（直连 HTTP+轮询）实现相同的 DshTransportLike 接口，
 * 可直接注入 DshStreamClient。
 */

import { deepseekHarness as bridge } from '../../electronBridge'
import type {
	DshTransportLike,
	RpcResult,
	DshHistoryEvent,
	DshPromptContentPart
} from './dshAgentProtocol'

const LOG_PREFIX = '[DSH-Link][ipc-transport]'

function log(...args: unknown[]): void {
	// eslint-disable-next-line no-console
	console.log(LOG_PREFIX, ...args)
}
function logError(...args: unknown[]): void {
	// eslint-disable-next-line no-console
	console.error(LOG_PREFIX, ...args)
}

export class DshIpcTransport implements DshTransportLike {
	async call<P, T>(method: string, payload: P): Promise<RpcResult<T>> {
		log('call method=', method, 'payload=', payload)
		try {
			const result = (await bridge.proxyCall({ method, payload })) as RpcResult<T>
			log(
				'call method=',
				method,
				'→ ok=',
				result.ok,
				'value=',
				(result as { value?: unknown }).value,
				'error=',
				(result as { error?: unknown }).error
			)
			return result
		} catch (err) {
			logError('call method=', method, 'exception:', err)
			return {
				ok: false,
				error: {
					code: 'ipc',
					message: err instanceof Error ? err.message : String(err),
					details: {}
				}
			}
		}
	}

	async *streamTurn(
		sessionId: string,
		content: DshPromptContentPart[],
		signal: AbortSignal
	): AsyncGenerator<DshHistoryEvent> {
		log('streamTurn sessionId=', sessionId, 'contentParts=', content.length)
		const iterable = bridge.dshAgentStream({
			sessionId,
			content: content as unknown as string | Array<{ type: string; text?: string }>
		})
		const iterator = iterable[Symbol.asyncIterator]()

		const onAbort = () => {
			log('streamTurn abort signal received')
			void iterator.return?.()
		}
		signal.addEventListener('abort', onAbort, { once: true })

		let eventCount = 0
		let progressCount = 0
		try {
			while (true) {
				const { done, value } = await iterator.next()
				if (done) {
					log('streamTurn IPC stream ended, total events=', eventCount, 'progress=', progressCount)
					break
				}
				if (!value || typeof value !== 'object') {
					log('streamTurn skipping non-object value:', value)
					continue
				}
				const type = (value as { type?: string }).type
				if (type === '__progress__') {
					progressCount++
					log('streamTurn progress:', (value as { data?: unknown }).data)
					continue // 诊断事件不转发到下游
				}
				eventCount++
				if (eventCount === 1) log('streamTurn first real event type=', type)
				yield value as DshHistoryEvent
			}
		} catch (err) {
			logError('streamTurn IPC stream exception:', err)
			throw err
		} finally {
			signal.removeEventListener('abort', onAbort)
		}
	}
}
