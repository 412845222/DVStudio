/**
 * Canvas Warmup Coordinator - Canvas2D预热协调器
 * 
 * 职责:
 * 1. 协调DOM截图 → Canvas2D ImageBitmap 流水线
 * 2. 控制批量预加载并发
 * 3. 同步预热进度
 * 4. 与现有截图系统无缝集成
 */

import type { CanvasScreenshotPool } from './canvasScreenshotPool'
import type { ScreenshotCacheEntry } from './useNodeScreenshotPool'

export interface WarmupOptions {
	/** 并发数，默认4 */
	concurrency: number
	/** 进度回调 */
	onProgress?: (progress: number, detail: string) => void
	/** 完成回调 */
	onComplete?: () => void
	/** 错误回调 */
	onError?: (error: Error, nodeId: string) => void
}

export interface WarmupTask {
	nodeId: string
	screenshotEntry: ScreenshotCacheEntry
	priority: 'high' | 'normal' | 'low'
	status: 'pending' | 'loading' | 'ready' | 'error'
}

export interface WarmupStatus {
	total: number
	pending: number
	loading: number
	ready: number
	error: number
	progress: number
	phase: 'idle' | 'running' | 'complete' | 'error'
}

const DEFAULT_CONCURRENCY = 4
const HIGH_PRIORITY_FRAME_TIME_MS = 16
const NORMAL_PRIORITY_FRAME_TIME_MS = 8
const LOW_PRIORITY_FRAME_TIME_MS = 5

/**
 * 智能并发控制
 */
const getOptimalConcurrency = (): number => {
	try {
		const cores = navigator.hardwareConcurrency || 4
		const memory = (performance as any).memory?.jsHeapSizeLimit || 0
		const memoryGB = memory / 1024 / 1024 / 1024

		// 内存充足时增加并发
		if (memoryGB > 4) {
			return Math.min(8, cores)
		}

		// 内存紧张时减少并发
		return Math.min(4, Math.max(2, cores - 1))
	} catch {
		return DEFAULT_CONCURRENCY
	}
}

/**
 * 优先级调度策略
 */
const getPriorityRules = () => ({
	// 视口内节点 → 高优先级
	visible: 'high' as const,
	// 选中节点附近 → 高优先级
	nearSelected: 'high' as const,
	// 普通节点 → 普通优先级
	normal: 'normal' as const,
	// 视口外远处节点 → 低优先级
	farHidden: 'low' as const
})

/**
 * Canvas2D预热协调器
 */
export class CanvasWarmupCoordinator {
	private canvasPool: CanvasScreenshotPool
	private tasks = new Map<string, WarmupTask>()
	private active = 0
	private options: WarmupOptions
	private disposed = false
	private phase: WarmupStatus['phase'] = 'idle'

	constructor(canvasPool: CanvasScreenshotPool, options: Partial<WarmupOptions> = {}) {
		this.canvasPool = canvasPool
		this.options = {
			concurrency: options.concurrency ?? getOptimalConcurrency(),
			onProgress: options.onProgress,
			onComplete: options.onComplete,
			onError: options.onError
		}
	}

	/**
	 * 添加预热任务
	 */
	addTask(
		nodeId: string,
		screenshotEntry: ScreenshotCacheEntry,
		priority: 'high' | 'normal' | 'low' = 'normal'
	): void {
		if (this.disposed) return

		// 跳过已有任务
		if (this.tasks.has(nodeId)) {
			return
		}

		// 跳过已有Bitmap的任务
		if (this.canvasPool.hasBitmap(nodeId)) {
			return
		}

		this.tasks.set(nodeId, {
			nodeId,
			screenshotEntry,
			priority,
			status: 'pending'
		})
	}

	/**
	 * 添加批量预热任务
	 */
	addBatch(
		entries: Array<{
			nodeId: string
			entry: ScreenshotCacheEntry
			priority?: 'high' | 'normal' | 'low'
		}>
	): void {
		// 高优先级排序
		const priorityOrder = { high: 0, normal: 1, low: 2 }
		const sorted = entries.sort((a, b) => {
			return priorityOrder[a.priority ?? 'normal'] - priorityOrder[b.priority ?? 'normal']
		})

		for (const item of sorted) {
			this.addTask(item.nodeId, item.entry, item.priority)
		}
	}

	/**
	 * 添加视口感知批量预热任务
	 */
	addViewportAwareBatch(
		entries: Array<{
			nodeId: string
			entry: ScreenshotCacheEntry
			nodeWorldX: number
			nodeWorldY: number
			nodeWidth: number
			nodeHeight: number
		}>,
		viewportRect: { x0: number; y0: number; x1: number; y1: number },
		visibleThreshold = 500
	): void {
		for (const item of entries) {
			const isInViewport = this.isNodeInViewport(item, viewportRect)
			const isNearViewport = this.isNodeNearViewport(item, viewportRect, visibleThreshold)

			let priority: 'high' | 'normal' | 'low' = 'normal'
			if (isInViewport) {
				priority = 'high'
			} else if (isNearViewport) {
				priority = 'normal'
			} else {
				priority = 'low'
			}

			this.addTask(item.nodeId, item.entry, priority)
		}
	}

	private isNodeInViewport(
		item: { nodeWorldX: number; nodeWorldY: number; nodeWidth: number; nodeHeight: number },
		viewportRect: { x0: number; y0: number; x1: number; y1: number }
	): boolean {
		const halfW = item.nodeWidth / 2
		const halfH = item.nodeHeight / 2

		const nodeRect = {
			x0: item.nodeWorldX - halfW,
			y0: item.nodeWorldY - halfH,
			x1: item.nodeWorldX + halfW,
			y1: item.nodeWorldY + halfH
		}

		return !(
			nodeRect.x1 < viewportRect.x0 ||
			nodeRect.x0 > viewportRect.x1 ||
			nodeRect.y1 < viewportRect.y0 ||
			nodeRect.y0 > viewportRect.y1
		)
	}

	private isNodeNearViewport(
		item: { nodeWorldX: number; nodeWorldY: number; nodeWidth: number; nodeHeight: number },
		viewportRect: { x0: number; y0: number; x1: number; y1: number },
		threshold: number
	): boolean {
		const halfW = item.nodeWidth / 2 + threshold
		const halfH = item.nodeHeight / 2 + threshold

		const nearRect = {
			x0: item.nodeWorldX - halfW,
			y0: item.nodeWorldY - halfH,
			x1: item.nodeWorldX + halfW,
			y1: item.nodeWorldY + halfH
		}

		return !(
			nearRect.x1 < viewportRect.x0 ||
			nearRect.x0 > viewportRect.x1 ||
			nearRect.y1 < viewportRect.y0 ||
			nearRect.y0 > viewportRect.y1
		)
	}

	/**
	 * 开始预热
	 */
	async warmup(): Promise<void> {
		if (this.disposed) return

		const pendingTasks = Array.from(this.tasks.values()).filter(t => t.status === 'pending')
		const total = pendingTasks.length

		if (total === 0) {
			this.phase = 'complete'
			this.options.onProgress?.(1, '没有需要预热的节点')
			this.options.onComplete?.()
			return
		}

		this.phase = 'running'
		this.options.onProgress?.(0, `准备预热 ${total} 个节点...`)

		// 分批处理
		let processed = 0

		for (let i = 0; i < pendingTasks.length; i += this.options.concurrency) {
			if (this.disposed) break

			const batch = pendingTasks.slice(i, i + this.options.concurrency)

			// 并发加载
			const promises = batch.map(task => this.loadTask(task))
			await Promise.allSettled(promises)

			processed += batch.length
			const progress = processed / total
			this.options.onProgress?.(progress, `预热中 ${processed}/${total}...`)
		}

		const status = this.getStatus()
		this.phase = status.error > 0 ? 'error' : 'complete'

		if (status.error > 0) {
			this.options.onProgress?.(1, `预热完成，${status.ready} 成功，${status.error} 失败`)
		} else {
			this.options.onProgress?.(1, `预热完成，共 ${total} 个节点`)
		}

		this.options.onComplete?.()
	}

	private async loadTask(task: WarmupTask): Promise<void> {
		task.status = 'loading'
		this.active++

		try {
			const result = await this.canvasPool.loadFromCache(task.screenshotEntry)
			task.status = result ? 'ready' : 'error'
		} catch (error) {
			task.status = 'error'
			this.options.onError?.(error as Error, task.nodeId)
		} finally {
			this.active--
		}
	}

	/**
	 * 后台预热 (使用requestIdleCallback)
	 */
	scheduleBackgroundWarmup(deadlineMs = 50): void {
		if (this.disposed) return

		const pendingTasks = Array.from(this.tasks.values()).filter(t => t.status === 'pending')
		if (pendingTasks.length === 0) return

		const loadNext = () => {
			if (this.disposed) return

			const startTime = performance.now()

			while (pendingTasks.length > 0 && performance.now() - startTime < deadlineMs) {
				const task = pendingTasks.shift()
				if (task) {
					this.loadTask(task)
				}
			}

			if (pendingTasks.length > 0 && !this.disposed) {
				requestIdleCallback(loadNext, { timeout: 1000 })
			}
		}

		requestIdleCallback(loadNext, { timeout: 1000 })
	}

	/**
	 * 获取预热状态
	 */
	getStatus(): WarmupStatus {
		const tasks = Array.from(this.tasks.values())
		const total = tasks.length
		const pending = tasks.filter(t => t.status === 'pending').length
		const loading = tasks.filter(t => t.status === 'loading').length
		const ready = tasks.filter(t => t.status === 'ready').length
		const error = tasks.filter(t => t.status === 'error').length
		const completed = ready + error

		return {
			total,
			pending,
			loading,
			ready,
			error,
			progress: total > 0 ? completed / total : 1,
			phase: this.phase
		}
	}

	/**
	 * 获取失败的任务节点ID
	 */
	getFailedNodeIds(): string[] {
		return Array.from(this.tasks.values())
			.filter(t => t.status === 'error')
			.map(t => t.nodeId)
	}

	/**
	 * 取消指定节点的预热
	 */
	cancelTask(nodeId: string): void {
		const task = this.tasks.get(nodeId)
		if (task && task.status === 'pending') {
			this.tasks.delete(nodeId)
		}
	}

	/**
	 * 取消所有待处理的预热
	 */
	cancelAllPending(): void {
		for (const [nodeId, task] of this.tasks) {
			if (task.status === 'pending') {
				this.tasks.delete(nodeId)
			}
		}
	}

	/**
	 * 重试失败的任务
	 */
	async retryFailed(): Promise<void> {
		const failedTasks = Array.from(this.tasks.values()).filter(t => t.status === 'error')

		for (const task of failedTasks) {
			task.status = 'pending'
		}

		await this.warmup()
	}

	/**
	 * 是否正在预热
	 */
	isRunning(): boolean {
		return this.phase === 'running'
	}

	/**
	 * 是否有待处理的任务
	 */
	hasPendingTasks(): boolean {
		return Array.from(this.tasks.values()).some(t => t.status === 'pending' || t.status === 'loading')
	}

	/**
	 * 更新并发数
	 */
	setConcurrency(concurrency: number): void {
		this.options.concurrency = Math.max(1, Math.min(16, concurrency))
	}

	/**
	 * 获取推荐并发数
	 */
	getRecommendedConcurrency(): number {
		return getOptimalConcurrency()
	}

	/**
	 * 清理
	 */
	dispose(): void {
		this.disposed = true
		this.tasks.clear()
	}
}

/**
 * 预热进度计算工具
 */
export const calculateWarmupProgress = (
	domCompleted: number,
	domTotal: number,
	canvasCompleted: number,
	canvasTotal: number
): number => {
	if (domTotal === 0 && canvasTotal === 0) return 1

	const domWeight = 0.5
	const canvasWeight = 0.5

	const domProgress = domTotal > 0 ? domCompleted / domTotal : 1
	const canvasProgress = canvasTotal > 0 ? canvasCompleted / canvasTotal : 1

	return domWeight * domProgress + canvasWeight * canvasProgress
}

/**
 * 格式化预热进度详情
 */
export const formatWarmupDetail = (
	phase: 'dom-screenshot' | 'canvas-texture' | 'complete',
	domCompleted: number,
	domTotal: number,
	canvasCompleted: number,
	canvasTotal: number
): string => {
	switch (phase) {
		case 'dom-screenshot':
			return `生成截图 ${domCompleted}/${domTotal}...`
		case 'canvas-texture':
			return `加载纹理 ${canvasCompleted}/${canvasTotal}...`
		case 'complete':
			return `预热完成 (截图${domTotal} + 纹理${canvasTotal})`
	}
}
