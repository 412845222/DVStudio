/**
 * Canvas Warmup Coordinator - Canvas2D预热协调器
 *
 * 职责:
 * 1. 协调DOM截图 → Canvas2D ImageBitmap 流水线
 * 2. 控制批量预加载并发
 * 3. 同步预热进度
 * 4. 与现有截图系统无缝集成
 * 5. 支持双主题(dark/light)独立预热，使用 nodeId::theme 作为任务键
 */

import type { CanvasScreenshotPool } from './canvasScreenshotPool'
import type { ScreenshotCacheEntry } from './useNodeScreenshotPool'
import { t } from '../../../i18n'

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
	taskKey: string
	nodeId: string
	theme: 'dark' | 'light'
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

const makeTaskKey = (nodeId: string, theme: 'dark' | 'light'): string => `${nodeId}::${theme}`

const extractThemeFromEntry = (entry: ScreenshotCacheEntry): 'dark' | 'light' => {
	if (entry.theme) return entry.theme
	const m = entry.version.match(/^theme:(dark|light)/)
	return m ? (m[1] as 'dark' | 'light') : 'dark'
}

/**
 * 智能并发控制
 */
const getOptimalConcurrency = (): number => {
	try {
		const cores = navigator.hardwareConcurrency || 4
		const memory = (performance as any).memory?.jsHeapSizeLimit || 0
		const memoryGB = memory / 1024 / 1024 / 1024

		if (memoryGB > 4) {
			return Math.min(8, cores)
		}

		return Math.min(4, Math.max(2, cores - 1))
	} catch {
		return DEFAULT_CONCURRENCY
	}
}

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
	 * 临时包装回调（用于在不替换初始回调的情况下追加外层进度反馈）
	 * 返回一个restore函数，调用后恢复原始回调
	 */
	wrapCallbacks(
		onProgress?: (progress: number, detail: string) => void,
		onComplete?: () => void,
		onError?: (error: Error, nodeId: string) => void
	): () => void {
		const origProgress = this.options.onProgress
		const origComplete = this.options.onComplete
		const origError = this.options.onError
		if (onProgress) {
			this.options.onProgress = (p, d) => {
				onProgress(p, d)
				origProgress?.(p, d)
			}
		}
		if (onComplete) {
			this.options.onComplete = () => {
				onComplete()
				origComplete?.()
			}
		}
		if (onError) {
			this.options.onError = (e, id) => {
				onError(e, id)
				origError?.(e, id)
			}
		}
		return () => {
			this.options.onProgress = origProgress
			this.options.onComplete = origComplete
			this.options.onError = origError
		}
	}

	/**
	 * 设置并发数
	 */
	setConcurrency(n: number): void {
		this.options.concurrency = Math.max(1, Math.min(16, n))
	}

	/**
	 * 清理已完成/错误的任务记录，使下一次warmup可以重新添加这些节点
	 */
	reset(): void {
		for (const [taskKey, task] of this.tasks) {
			if (task.status === 'ready' || task.status === 'error') {
				this.tasks.delete(taskKey)
			}
		}
	}

	/**
	 * 取消指定主题的待处理预热任务
	 */
	cancelTheme(theme: 'dark' | 'light'): void {
		for (const [taskKey, task] of this.tasks) {
			if (task.theme === theme && task.status === 'pending') {
				this.tasks.delete(taskKey)
			}
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

		const theme = extractThemeFromEntry(screenshotEntry)
		const taskKey = makeTaskKey(nodeId, theme)

		if (this.tasks.has(taskKey)) {
			return
		}

		if (this.canvasPool.hasBitmap(nodeId, theme)) {
			return
		}

		this.tasks.set(taskKey, {
			taskKey,
			nodeId,
			theme,
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

			let priority: 'high' | 'normal' | 'low'
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
	 * 开始预热（滑动窗口并发，一个完成立即启动下一个）
	 */
	async warmup(): Promise<void> {
		if (this.disposed) return

		const pendingTasks = Array.from(this.tasks.values()).filter((task) => task.status === 'pending')
		const total = pendingTasks.length

		if (total === 0) {
			this.phase = 'complete'
			this.options.onProgress?.(1, t('aiworkflow.runtime.noNodesToWarmup'))
			this.options.onComplete?.()
			return
		}

		this.phase = 'running'
		this.options.onProgress?.(0, t('aiworkflow.runtime.preparingWarmup', { count: String(total) }))

		let completed = 0
		let nextIndex = 0
		const concurrency = Math.max(1, this.options.concurrency)

		const runNext = async (): Promise<void> => {
			while (!this.disposed) {
				const idx = nextIndex++
				if (idx >= pendingTasks.length) return
				const task = pendingTasks[idx]
				if (!task || task.status !== 'pending') continue
				await this.loadTask(task)
				completed++
				const progress = total > 0 ? completed / total : 1
				this.options.onProgress?.(
					progress,
					t('aiworkflow.runtime.warmingUp', { completed: String(completed), total: String(total) })
				)
			}
		}

		const workers: Promise<void>[] = []
		const workerCount = Math.min(concurrency, total)
		for (let w = 0; w < workerCount; w++) {
			workers.push(runNext())
		}
		await Promise.allSettled(workers)

		const status = this.getStatus()
		this.phase = status.error > 0 ? 'error' : 'complete'

		if (status.error > 0) {
			this.options.onProgress?.(
				1,
				t('aiworkflow.runtime.warmupCompleteWithErrors', {
					ready: String(status.ready),
					error: String(status.error)
				})
			)
		} else {
			this.options.onProgress?.(1, t('aiworkflow.runtime.warmupComplete', { count: String(total) }))
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

		const pendingTasks = Array.from(this.tasks.values()).filter((t) => t.status === 'pending')
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
		const pending = tasks.filter((t) => t.status === 'pending').length
		const loading = tasks.filter((t) => t.status === 'loading').length
		const ready = tasks.filter((t) => t.status === 'ready').length
		const error = tasks.filter((t) => t.status === 'error').length
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
	 * 获取指定主题的预热状态
	 */
	getThemeStatus(theme: 'dark' | 'light'): {
		total: number
		ready: number
		pending: number
		progress: number
	} {
		const themeTasks = Array.from(this.tasks.values()).filter((t) => t.theme === theme)
		const total = themeTasks.length
		const ready = themeTasks.filter((t) => t.status === 'ready').length
		const pending = themeTasks.filter(
			(t) => t.status === 'pending' || t.status === 'loading'
		).length
		return {
			total,
			ready,
			pending,
			progress: total > 0 ? ready / total : 1
		}
	}

	/**
	 * 获取失败的任务节点ID
	 */
	getFailedNodeIds(): string[] {
		return Array.from(this.tasks.values())
			.filter((t) => t.status === 'error')
			.map((t) => t.nodeId)
	}

	/**
	 * 取消指定节点的预热（两个主题都取消）
	 */
	cancelTask(nodeId: string): void {
		for (const theme of ['dark', 'light'] as const) {
			const taskKey = makeTaskKey(nodeId, theme)
			const task = this.tasks.get(taskKey)
			if (task && task.status === 'pending') {
				this.tasks.delete(taskKey)
			}
		}
	}

	/**
	 * 取消所有待处理的预热
	 */
	cancelAllPending(): void {
		for (const [taskKey, task] of this.tasks) {
			if (task.status === 'pending') {
				this.tasks.delete(taskKey)
			}
		}
	}

	/**
	 * 重试失败的任务
	 */
	async retryFailed(): Promise<void> {
		const failedTasks = Array.from(this.tasks.values()).filter((t) => t.status === 'error')

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
		return Array.from(this.tasks.values()).some(
			(t) => t.status === 'pending' || t.status === 'loading'
		)
	}

	/**
	 * 获取指定主题是否有待处理任务
	 */
	hasPendingTasksForTheme(theme: 'dark' | 'light'): boolean {
		return Array.from(this.tasks.values()).some(
			(t) => t.theme === theme && (t.status === 'pending' || t.status === 'loading')
		)
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
			return t('aiworkflow.runtime.domScreenshotProgress', {
				completed: String(domCompleted),
				total: String(domTotal)
			})
		case 'canvas-texture':
			return t('aiworkflow.runtime.canvasTextureProgress', {
				completed: String(canvasCompleted),
				total: String(canvasTotal)
			})
		case 'complete':
			return t('aiworkflow.runtime.warmupFinalProgress', {
				domTotal: String(domTotal),
				canvasTotal: String(canvasTotal)
			})
	}
}
