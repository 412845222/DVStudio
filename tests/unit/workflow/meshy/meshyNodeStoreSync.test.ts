import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitForNodeInStore } from '@/views/AIWorkflow/node-business/chat/useAIWorkflowNodeGeneration'

describe('waitForNodeInStore', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	describe('节点已在 store 中', () => {
		it('节点已存在时应立即返回 true，不等待轮询', async () => {
			const nodesById = { 'node-1': { id: 'node-1' } }
			const result = await waitForNodeInStore(nodesById, 'node-1', 2000, 50)

			expect(result).toBe(true)
		})

		it('节点在第一次轮询前出现时应返回 true', async () => {
			const nodesById: Record<string, unknown> = {}
			const promise = waitForNodeInStore(nodesById, 'node-1', 2000, 50)

			// 在第一个 50ms 定时器触发前添加节点
			nodesById['node-1'] = { id: 'node-1' }
			vi.advanceTimersByTimeAsync(50)
			const result = await promise

			expect(result).toBe(true)
		})
	})

	describe('节点不在 store 中', () => {
		it('超时后应返回 false', async () => {
			const nodesById: Record<string, unknown> = {}
			const promise = waitForNodeInStore(nodesById, 'node-missing', 100, 20)

			// 快进超过超时时间
			await vi.advanceTimersByTimeAsync(150)
			const result = await promise

			expect(result).toBe(false)
		})

		it('超时前节点出现应返回 true', async () => {
			const nodesById: Record<string, unknown> = {}
			const promise = waitForNodeInStore(nodesById, 'node-late', 200, 50)

			// 快进 100ms（节点还未出现）
			await vi.advanceTimersByTimeAsync(100)
			expect(nodesById['node-late']).toBeUndefined()

			// 节点在第 100-150ms 之间出现
			nodesById['node-late'] = { id: 'node-late' }
			await vi.advanceTimersByTimeAsync(50)
			const result = await promise

			expect(result).toBe(true)
		})

		it('应使用自定义轮询间隔', async () => {
			const nodesById: Record<string, unknown> = {}
			const promise = waitForNodeInStore(nodesById, 'node-x', 200, 100)

			// 快进 50ms（不应触发第一次轮询检查）
			await vi.advanceTimersByTimeAsync(50)
			// 节点在 50ms 时出现，但第一次轮询在 100ms
			nodesById['node-x'] = { id: 'node-x' }

			await vi.advanceTimersByTimeAsync(50)
			const result = await promise

			expect(result).toBe(true)
		})
	})

	describe('默认参数', () => {
		it('不传 timeout/pollInterval 时应使用默认值', async () => {
			const nodesById: Record<string, unknown> = {}
			// 只传两个必需参数，使用默认 2000ms / 50ms
			const promise = waitForNodeInStore(nodesById, 'node-default')

			// 快进 2000ms 以上触发超时
			await vi.advanceTimersByTimeAsync(2100)
			const result = await promise

			expect(result).toBe(false)
		})
	})

	describe('边界情况', () => {
		it('nodeId 为空字符串时应返回 false', async () => {
			const nodesById = { '': { id: '' } }
			// 空字符串作为 key，如果 nodesById[''] 存在则返回 true
			const result = await waitForNodeInStore(nodesById, '', 100, 50)
			expect(result).toBe(true)
		})

		it('nodesById 为空对象时超时应返回 false', async () => {
			const nodesById: Record<string, unknown> = {}
			const promise = waitForNodeInStore(nodesById, 'nonexistent', 100, 50)

			await vi.advanceTimersByTimeAsync(150)
			const result = await promise

			expect(result).toBe(false)
		})

		it('节点值为 falsy（如 null）时应继续轮询', async () => {
			const nodesById: Record<string, unknown> = { 'node-null': null }
			// null 值意味着节点尚未完全同步
			const promise = waitForNodeInStore(nodesById, 'node-null', 100, 50)

			await vi.advanceTimersByTimeAsync(150)
			const result = await promise

			// null 是 falsy，Boolean(null) === false，应返回 false
			expect(result).toBe(false)
		})

		it('节点值为 truthy 对象时应返回 true', async () => {
			const nodesById = { 'node-obj': { id: 'node-obj', type: 'image' } }
			const result = await waitForNodeInStore(nodesById, 'node-obj', 100, 50)

			expect(result).toBe(true)
		})
	})
})
