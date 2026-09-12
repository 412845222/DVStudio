// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { DshStreamClient } from '@/network/chat/dshStreamClient'
import type {
	DshTransportLike,
	DshHistoryEvent,
	RpcResult,
	DshPromptContentPart
} from '@/network/chat/dshAgentProtocol'

/**
 * 构造一个最小化的 mock transport，streamTurn 按顺序 yield 预设事件。
 * call 方法返回可配置的 RpcResult。
 */
function createMockTransport(
	events: DshHistoryEvent[],
	callResults: Record<string, RpcResult<unknown>> = {}
): DshTransportLike {
	return {
		call: vi.fn(async (method: string) => {
			if (callResults[method]) return callResults[method] as never
			return { ok: true, value: {} } as never
		}),
		async *streamTurn(_sessionId: string, _content: DshPromptContentPart[], _signal: AbortSignal) {
			for (const ev of events) yield ev
		}
	}
}

describe('DshStreamClient 事件流解析', () => {
	describe('assistant-stream (session/follow 实时流式帧)', () => {
		it('chunk 帧的 text-delta 应映射为 text 事件', async () => {
			const transport = createMockTransport([
				{ seq: 1, type: 'assistant-stream', data: { type: 'start' } },
				{
					seq: 2,
					type: 'assistant-stream',
					data: { type: 'chunk', chunk: { type: 'text-delta', text: '你好' } }
				},
				{
					seq: 3,
					type: 'assistant-stream',
					data: { type: 'chunk', chunk: { type: 'text-delta', text: '，世界' } }
				},
				{ seq: 4, type: 'assistant-stream', data: { type: 'end' } },
				{ seq: 5, type: 'turn/end' }
			])
			const client = new DshStreamClient(transport)

			const events = []
			for await (const ev of client.streamPrompt('sess-1', 'hi')) events.push(ev)

			expect(events).toEqual([
				{ type: 'text', content: '你好' },
				{ type: 'text', content: '，世界' },
				{ type: 'done' }
			])
		})

		it('chunk 帧的 reasoning-delta 应映射为 thinking 事件', async () => {
			const transport = createMockTransport([
				{
					seq: 1,
					type: 'assistant-stream',
					data: { type: 'chunk', chunk: { type: 'reasoning-delta', text: '让我想想' } }
				},
				{ seq: 2, type: 'turn/end' }
			])
			const client = new DshStreamClient(transport)

			const events = []
			for await (const ev of client.streamPrompt('sess-1', 'hi')) events.push(ev)

			expect(events).toContainEqual({ type: 'thinking', content: '让我想想' })
			expect(events).toContainEqual({ type: 'done' })
		})

		it('start/end 帧不应产生输出', async () => {
			const transport = createMockTransport([
				{ seq: 1, type: 'assistant-stream', data: { type: 'start' } },
				{ seq: 2, type: 'assistant-stream', data: { type: 'end' } },
				{ seq: 3, type: 'turn/end' }
			])
			const client = new DshStreamClient(transport)

			const events = []
			for await (const ev of client.streamPrompt('sess-1', 'hi')) events.push(ev)

			expect(events).toEqual([{ type: 'done' }])
		})
	})

	describe('assistant/chunk 与 assistant/message (session.history 轮询格式)', () => {
		it('assistant/chunk 的 text-delta 应映射为 text 事件', async () => {
			const transport = createMockTransport([
				{ seq: 1, type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: 'hello' } } },
				{ seq: 2, type: 'turn/end' }
			])
			const client = new DshStreamClient(transport)

			const events = []
			for await (const ev of client.streamPrompt('sess-1', 'hi')) events.push(ev)

			expect(events).toContainEqual({ type: 'text', content: 'hello' })
		})

		it('assistant/message 的 text content 应映射为 text 事件', async () => {
			const transport = createMockTransport([
				{
					seq: 1,
					type: 'assistant/message',
					data: { message: { content: [{ type: 'text', text: '完整回复' }] } }
				},
				{ seq: 2, type: 'turn/end' }
			])
			const client = new DshStreamClient(transport)

			const events = []
			for await (const ev of client.streamPrompt('sess-1', 'hi')) events.push(ev)

			expect(events).toContainEqual({ type: 'text', content: '完整回复' })
		})
	})

	describe('turn/end 与 done', () => {
		it('收到 turn/end 应产出 done 并终止', async () => {
			const transport = createMockTransport([{ seq: 1, type: 'turn/end' }])
			const client = new DshStreamClient(transport)

			const events = []
			for await (const ev of client.streamPrompt('sess-1', 'hi')) events.push(ev)

			expect(events).toEqual([{ type: 'done' }])
		})

		it('未收到 turn/end 时流结束也应产出 done', async () => {
			const transport = createMockTransport([
				{
					seq: 1,
					type: 'assistant-stream',
					data: { type: 'chunk', chunk: { type: 'text-delta', text: 'no end' } }
				}
			])
			const client = new DshStreamClient(transport)

			const events = []
			for await (const ev of client.streamPrompt('sess-1', 'hi')) events.push(ev)

			expect(events).toEqual([{ type: 'text', content: 'no end' }, { type: 'done' }])
		})
	})

	describe('tool 调用映射', () => {
		it('tool/call 应映射为 tool_call_start', async () => {
			const transport = createMockTransport([
				{
					seq: 1,
					type: 'tool/call',
					data: { callId: 'c1', name: 'search', arguments: '{"q":"test"}' }
				},
				{ seq: 2, type: 'turn/end' }
			])
			const client = new DshStreamClient(transport)

			const events = []
			for await (const ev of client.streamPrompt('sess-1', 'hi')) events.push(ev)

			expect(events).toContainEqual({
				type: 'tool_call_start',
				toolCallId: 'c1',
				tool: 'search',
				input: '{"q":"test"}'
			})
		})

		it('tool/result 成功应映射为 tool_call_end', async () => {
			const transport = createMockTransport([
				{
					seq: 1,
					type: 'tool/result',
					data: { callId: 'c1', message: { content: [{ type: 'text', text: 'result' }] } }
				},
				{ seq: 2, type: 'turn/end' }
			])
			const client = new DshStreamClient(transport)

			const events = []
			for await (const ev of client.streamPrompt('sess-1', 'hi')) events.push(ev)

			expect(events).toContainEqual({
				type: 'tool_call_end',
				toolCallId: 'c1',
				tool: '',
				output: 'result'
			})
		})

		it('tool/result 含 error 应映射为 tool_call_error', async () => {
			const transport = createMockTransport([
				{
					seq: 1,
					type: 'tool/result',
					data: { callId: 'c1', error: { name: 'NotFound', code: '404' } }
				},
				{ seq: 2, type: 'turn/end' }
			])
			const client = new DshStreamClient(transport)

			const events = []
			for await (const ev of client.streamPrompt('sess-1', 'hi')) events.push(ev)

			expect(events).toContainEqual({
				type: 'tool_call_error',
				toolCallId: 'c1',
				tool: '',
				error: 'NotFound'
			})
		})
	})

	describe('错误处理', () => {
		it('__error__ 事件应产出 error 并终止', async () => {
			const transport = createMockTransport([
				{
					seq: 1,
					type: '__error__',
					data: { error: { message: 'DSH internal error', code: 'E1' } }
				}
			])
			const client = new DshStreamClient(transport)

			const events = []
			for await (const ev of client.streamPrompt('sess-1', 'hi')) events.push(ev)

			expect(events).toEqual([{ type: 'error', message: 'DSH internal error' }])
		})

		it('transport 抛异常应产出 error 事件', async () => {
			const transport: DshTransportLike = {
				call: vi.fn(async () => ({ ok: true, value: {} }) as never),
				async *streamTurn() {
					throw new Error('network broken')
				}
			}
			const client = new DshStreamClient(transport)

			const events = []
			for await (const ev of client.streamPrompt('sess-1', 'hi')) events.push(ev)

			expect(events).toHaveLength(1)
			expect(events[0].type).toBe('error')
			expect((events[0] as { message: string }).message).toContain('network broken')
		})
	})

	describe('createSession', () => {
		it('成功时返回 sessionId', async () => {
			const transport = createMockTransport([], {
				'session/create': { ok: true, value: { sessionId: 'new-sess-1', agentPreset: 'default' } }
			})
			const client = new DshStreamClient(transport)

			const result = await client.createSession()
			expect(result).toEqual({ sessionId: 'new-sess-1', agentPreset: 'default' })
		})

		it('失败时抛出错误', async () => {
			const transport = createMockTransport([], {
				'session/create': {
					ok: false,
					error: { code: 'E1', message: 'create failed', details: {} }
				}
			})
			const client = new DshStreamClient(transport)

			await expect(client.createSession()).rejects.toThrow('create failed')
		})

		it('响应缺少 sessionId 时抛出错误', async () => {
			const transport = createMockTransport([], {
				'session/create': { ok: true, value: {} }
			})
			const client = new DshStreamClient(transport)

			await expect(client.createSession()).rejects.toThrow('未返回 sessionId')
		})
	})

	describe('isAvailable', () => {
		it('session/list 返回 ok 时为 true', async () => {
			const transport = createMockTransport([], {
				'session/list': { ok: true, value: [] }
			})
			const client = new DshStreamClient(transport)
			expect(await client.isAvailable()).toBe(true)
		})

		it('session/list 失败时为 false', async () => {
			const transport = createMockTransport([], {
				'session/list': { ok: false, error: { code: 'E1', message: 'down', details: {} } }
			})
			const client = new DshStreamClient(transport)
			expect(await client.isAvailable()).toBe(false)
		})
	})
})
