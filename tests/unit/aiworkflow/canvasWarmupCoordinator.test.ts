import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
	CanvasWarmupCoordinator,
	calculateWarmupProgress,
	formatWarmupDetail
} from '@/views/AIWorkflow/node-screenshot/canvasWarmupCoordinator'
import type { ScreenshotCacheEntry } from '@/views/AIWorkflow/node-screenshot/useNodeScreenshotPool'
import type { CanvasScreenshotPool } from '@/views/AIWorkflow/node-screenshot/canvasScreenshotPool'

const createMockEntry = (nodeId: string, width = 200, height = 100): ScreenshotCacheEntry => ({
	nodeId,
	version: 'v1',
	dataUrl: `data:image/png;base64,test-${nodeId}`,
	width,
	height,
	padding: 20,
	capturedAt: Date.now()
})

const createMockCanvasPool = (options: {
	hasBitmapSet?: Set<string>
	loadResult?: boolean
	loadDelay?: number
} = {}): CanvasScreenshotPool => {
	const { hasBitmapSet = new Set(), loadResult = true, loadDelay = 0 } = options
	return {
		hasBitmap: vi.fn((nodeId: string) => hasBitmapSet.has(nodeId)),
		loadFromCache: vi.fn(async (_entry: ScreenshotCacheEntry) => {
			if (loadDelay > 0) {
				await new Promise((resolve) => setTimeout(resolve, loadDelay))
			}
			return loadResult
		}),
		getBitmap: vi.fn(),
		setBitmap: vi.fn(),
		clearBitmap: vi.fn(),
		clearAll: vi.fn(),
		getStats: vi.fn()
	} as unknown as CanvasScreenshotPool
}

describe('CanvasWarmupCoordinator', () => {
	let mockPool: CanvasScreenshotPool

	beforeEach(() => {
		vi.clearAllMocks()
		mockPool = createMockCanvasPool()
	})

	describe('constructor', () => {
		it('should initialize with default concurrency', () => {
			const coordinator = new CanvasWarmupCoordinator(mockPool)
			const status = coordinator.getStatus()
			expect(status.phase).toBe('idle')
			expect(status.total).toBe(0)
		})

		it('should initialize with custom options', () => {
			const onProgress = vi.fn()
			const onComplete = vi.fn()
			const coordinator = new CanvasWarmupCoordinator(mockPool, {
				concurrency: 8,
				onProgress,
				onComplete
			})
			expect(coordinator).toBeDefined()
		})
	})

	describe('setConcurrency', () => {
		it('should set concurrency with minimum of 1', async () => {
			const coordinator = new CanvasWarmupCoordinator(mockPool)
			coordinator.setConcurrency(0)
			coordinator.addTask('node1', createMockEntry('node1'))
			await coordinator.warmup()
			expect((mockPool.loadFromCache as any)).toHaveBeenCalledTimes(1)
		})

		it('should cap concurrency at maximum of 16', async () => {
			const coordinator = new CanvasWarmupCoordinator(mockPool, { concurrency: 2 })
			coordinator.setConcurrency(100)
			for (let i = 0; i < 20; i++) {
				coordinator.addTask(`node${i}`, createMockEntry(`node${i}`))
			}
			await coordinator.warmup()
			expect((mockPool.loadFromCache as any)).toHaveBeenCalledTimes(20)
		})
	})

	describe('wrapCallbacks', () => {
		it('should wrap and compose callbacks', async () => {
			const origProgress = vi.fn()
			const origComplete = vi.fn()
			const origError = vi.fn()
			const coordinator = new CanvasWarmupCoordinator(mockPool, {
				onProgress: origProgress,
				onComplete: origComplete,
				onError: origError
			})

			const newProgress = vi.fn()
			const newComplete = vi.fn()
			const newError = vi.fn()

			const restore = coordinator.wrapCallbacks(newProgress, newComplete, newError)

			coordinator.addTask('node1', createMockEntry('node1'))
			await coordinator.warmup()

			expect(newProgress).toHaveBeenCalled()
			expect(origProgress).toHaveBeenCalled()
			expect(newComplete).toHaveBeenCalled()
			expect(origComplete).toHaveBeenCalled()

			restore()
		})

		it('should restore original callbacks after restore is called', async () => {
			const origProgress = vi.fn()
			const coordinator = new CanvasWarmupCoordinator(mockPool, {
				onProgress: origProgress
			})

			const newProgress = vi.fn()
			const restore = coordinator.wrapCallbacks(newProgress)
			restore()

			coordinator.addTask('node1', createMockEntry('node1'))
			await coordinator.warmup()

			expect(origProgress).toHaveBeenCalled()
		})
	})

	describe('addTask', () => {
		it('should add a new task', () => {
			const coordinator = new CanvasWarmupCoordinator(mockPool)
			coordinator.addTask('node1', createMockEntry('node1'))
			const status = coordinator.getStatus()
			expect(status.total).toBe(1)
			expect(status.pending).toBe(1)
		})

		it('should skip duplicate node IDs', () => {
			const coordinator = new CanvasWarmupCoordinator(mockPool)
			coordinator.addTask('node1', createMockEntry('node1'))
			coordinator.addTask('node1', createMockEntry('node1'))
			const status = coordinator.getStatus()
			expect(status.total).toBe(1)
		})

		it('should skip nodes that already have bitmaps', () => {
			const poolWithBitmap = createMockCanvasPool({
				hasBitmapSet: new Set(['node1'])
			})
			const coordinator = new CanvasWarmupCoordinator(poolWithBitmap)
			coordinator.addTask('node1', createMockEntry('node1'))
			const status = coordinator.getStatus()
			expect(status.total).toBe(0)
		})

		it('should not add tasks after dispose', () => {
			const coordinator = new CanvasWarmupCoordinator(mockPool)
			coordinator.dispose()
			coordinator.addTask('node1', createMockEntry('node1'))
			const status = coordinator.getStatus()
			expect(status.total).toBe(0)
		})
	})

	describe('addBatch', () => {
		it('should add multiple tasks', () => {
			const coordinator = new CanvasWarmupCoordinator(mockPool)
			const entries = [
				{ nodeId: 'node1', entry: createMockEntry('node1'), priority: 'high' as const },
				{ nodeId: 'node2', entry: createMockEntry('node2'), priority: 'normal' as const },
				{ nodeId: 'node3', entry: createMockEntry('node3'), priority: 'low' as const }
			]
			coordinator.addBatch(entries)
			const status = coordinator.getStatus()
			expect(status.total).toBe(3)
			expect(status.pending).toBe(3)
		})

		it('should sort by priority (high first)', async () => {
			const loadOrder: string[] = []
			const poolWithOrder = createMockCanvasPool({
				loadDelay: 10
			})
			poolWithOrder.loadFromCache = vi.fn(async (entry: ScreenshotCacheEntry) => {
				loadOrder.push(entry.nodeId)
				return true
			})

			const coordinator = new CanvasWarmupCoordinator(poolWithOrder, { concurrency: 1 })
			coordinator.addBatch([
				{ nodeId: 'low1', entry: createMockEntry('low1'), priority: 'low' },
				{ nodeId: 'high1', entry: createMockEntry('high1'), priority: 'high' },
				{ nodeId: 'normal1', entry: createMockEntry('normal1'), priority: 'normal' }
			])
			await coordinator.warmup()

			expect(loadOrder[0]).toBe('high1')
		})
	})

	describe('reset', () => {
		it('should clear completed and error tasks', async () => {
			const coordinator = new CanvasWarmupCoordinator(mockPool)
			coordinator.addTask('node1', createMockEntry('node1'))
			await coordinator.warmup()

			let status = coordinator.getStatus()
			expect(status.ready).toBe(1)

			coordinator.reset()
			coordinator.addTask('node1', createMockEntry('node1'))
			status = coordinator.getStatus()
			expect(status.total).toBe(1)
			expect(status.pending).toBe(1)
		})
	})

	describe('warmup', () => {
		it('should complete with zero tasks', async () => {
			const onComplete = vi.fn()
			const onProgress = vi.fn()
			const coordinator = new CanvasWarmupCoordinator(mockPool, {
				onProgress,
				onComplete
			})
			await coordinator.warmup()

			expect(onComplete).toHaveBeenCalled()
			expect(onProgress).toHaveBeenCalledWith(1, '没有需要预热的节点')
			const status = coordinator.getStatus()
			expect(status.phase).toBe('complete')
		})

		it('should warmup all tasks and call onComplete', async () => {
			const onProgress = vi.fn()
			const onComplete = vi.fn()
			const coordinator = new CanvasWarmupCoordinator(mockPool, {
				concurrency: 4,
				onProgress,
				onComplete
			})

			for (let i = 0; i < 10; i++) {
				coordinator.addTask(`node${i}`, createMockEntry(`node${i}`))
			}

			await coordinator.warmup()

			expect(onComplete).toHaveBeenCalled()
			expect((mockPool.loadFromCache as any)).toHaveBeenCalledTimes(10)
			const status = coordinator.getStatus()
			expect(status.ready).toBe(10)
			expect(status.error).toBe(0)
			expect(status.phase).toBe('complete')
		})

		it('should report progress correctly', async () => {
			const onProgress = vi.fn()
			const coordinator = new CanvasWarmupCoordinator(mockPool, {
				concurrency: 1,
				onProgress
			})

			coordinator.addTask('node1', createMockEntry('node1'))
			coordinator.addTask('node2', createMockEntry('node2'))

			await coordinator.warmup()

			expect(onProgress).toHaveBeenCalledWith(0, expect.stringContaining('准备预热'))
			expect(onProgress).toHaveBeenCalledWith(1, expect.stringContaining('预热完成'))
		})

		it('should handle errors gracefully', async () => {
			const errorPool = createMockCanvasPool()
			errorPool.loadFromCache = vi.fn(async () => {
				throw new Error('Load failed')
			})
			const onError = vi.fn()
			const coordinator = new CanvasWarmupCoordinator(errorPool, {
				onError
			})

			coordinator.addTask('node1', createMockEntry('node1'))
			await coordinator.warmup()

			const status = coordinator.getStatus()
			expect(status.error).toBe(1)
			expect(status.phase).toBe('error')
			expect(onError).toHaveBeenCalled()
		})

		it('should not run after dispose', async () => {
			const coordinator = new CanvasWarmupCoordinator(mockPool)
			coordinator.addTask('node1', createMockEntry('node1'))
			coordinator.dispose()
			await coordinator.warmup()

			expect((mockPool.loadFromCache as any)).not.toHaveBeenCalled()
		})
	})

	describe('cancelTask', () => {
		it('should cancel a pending task', () => {
			const coordinator = new CanvasWarmupCoordinator(mockPool)
			coordinator.addTask('node1', createMockEntry('node1'))
			coordinator.addTask('node2', createMockEntry('node2'))
			coordinator.cancelTask('node1')

			const status = coordinator.getStatus()
			expect(status.total).toBe(1)
			expect(status.pending).toBe(1)
		})

		it('should not cancel non-pending tasks', async () => {
			const coordinator = new CanvasWarmupCoordinator(mockPool)
			coordinator.addTask('node1', createMockEntry('node1'))
			await coordinator.warmup()
			coordinator.cancelTask('node1')

			const status = coordinator.getStatus()
			expect(status.ready).toBe(1)
		})
	})

	describe('cancelAllPending', () => {
		it('should cancel all pending tasks', () => {
			const coordinator = new CanvasWarmupCoordinator(mockPool)
			for (let i = 0; i < 5; i++) {
				coordinator.addTask(`node${i}`, createMockEntry(`node${i}`))
			}
			coordinator.cancelAllPending()

			const status = coordinator.getStatus()
			expect(status.pending).toBe(0)
			expect(status.total).toBe(0)
		})
	})

	describe('retryFailed', () => {
		it('should retry failed tasks', async () => {
			let callCount = 0
			const flakyPool = createMockCanvasPool()
			flakyPool.loadFromCache = vi.fn(async () => {
				callCount++
				return callCount > 1
			})

			const coordinator = new CanvasWarmupCoordinator(flakyPool)
			coordinator.addTask('node1', createMockEntry('node1'))
			await coordinator.warmup()

			let status = coordinator.getStatus()
			expect(status.error).toBe(1)

			await coordinator.retryFailed()
			status = coordinator.getStatus()
			expect(status.ready).toBe(1)
			expect(status.error).toBe(0)
		})
	})

	describe('getFailedNodeIds', () => {
		it('should return failed node IDs', async () => {
			const errorPool = createMockCanvasPool({ loadResult: false })
			const coordinator = new CanvasWarmupCoordinator(errorPool)
			coordinator.addTask('node1', createMockEntry('node1'))
			coordinator.addTask('node2', createMockEntry('node2'))
			await coordinator.warmup()

			const failed = coordinator.getFailedNodeIds()
			expect(failed).toContain('node1')
			expect(failed).toContain('node2')
			expect(failed).toHaveLength(2)
		})
	})

	describe('isRunning', () => {
		it('should return correct running state', async () => {
			const coordinator = new CanvasWarmupCoordinator(mockPool)
			expect(coordinator.isRunning()).toBe(false)

			coordinator.addTask('node1', createMockEntry('node1'))
			const warmupPromise = coordinator.warmup()
			expect(coordinator.isRunning()).toBe(true)
			await warmupPromise
			expect(coordinator.isRunning()).toBe(false)
		})
	})

	describe('hasPendingTasks', () => {
		it('should return true when there are pending tasks', () => {
			const coordinator = new CanvasWarmupCoordinator(mockPool)
			expect(coordinator.hasPendingTasks()).toBe(false)

			coordinator.addTask('node1', createMockEntry('node1'))
			expect(coordinator.hasPendingTasks()).toBe(true)
		})
	})

	describe('getRecommendedConcurrency', () => {
		it('should return a positive number', () => {
			const coordinator = new CanvasWarmupCoordinator(mockPool)
			const concurrency = coordinator.getRecommendedConcurrency()
			expect(concurrency).toBeGreaterThan(0)
			expect(concurrency).toBeLessThanOrEqual(16)
		})
	})

	describe('dispose', () => {
		it('should clear all tasks and prevent new operations', () => {
			const coordinator = new CanvasWarmupCoordinator(mockPool)
			coordinator.addTask('node1', createMockEntry('node1'))
			coordinator.dispose()

			const status = coordinator.getStatus()
			expect(status.total).toBe(0)
		})
	})
})

describe('calculateWarmupProgress', () => {
	it('should return 1 when both totals are 0', () => {
		expect(calculateWarmupProgress(0, 0, 0, 0)).toBe(1)
	})

	it('should calculate combined progress correctly', () => {
		expect(calculateWarmupProgress(5, 10, 5, 10)).toBe(0.5)
	})

	it('should handle dom complete', () => {
		expect(calculateWarmupProgress(10, 10, 0, 10)).toBe(0.5)
	})

	it('should handle canvas complete', () => {
		expect(calculateWarmupProgress(0, 10, 10, 10)).toBe(0.5)
	})

	it('should weight dom and canvas equally', () => {
		const full = calculateWarmupProgress(10, 10, 10, 10)
		expect(full).toBe(1)
	})
})

describe('formatWarmupDetail', () => {
	it('should format dom-screenshot phase', () => {
		const result = formatWarmupDetail('dom-screenshot', 3, 10, 0, 0)
		expect(result).toContain('3/10')
		expect(result).toContain('截图')
	})

	it('should format canvas-texture phase', () => {
		const result = formatWarmupDetail('canvas-texture', 0, 0, 5, 10)
		expect(result).toContain('5/10')
		expect(result).toContain('纹理')
	})

	it('should format complete phase', () => {
		const result = formatWarmupDetail('complete', 10, 10, 10, 10)
		expect(result).toContain('预热完成')
		expect(result).toContain('10')
	})
})
