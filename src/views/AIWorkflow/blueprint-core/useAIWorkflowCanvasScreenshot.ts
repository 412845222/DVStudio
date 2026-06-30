/**
 * useAIWorkflowCanvasScreenshot - AI工作流Canvas2D截图预热集成
 * 
 * 职责:
 * 1. 封装CanvasScreenshotPool和CanvasWarmupCoordinator
 * 2. 与DOM截图系统协同工作
 * 3. 提供响应式的预热状态
 * 4. 内存管理和性能优化
 */

import { ref, shallowRef, computed, watch, onBeforeUnmount } from 'vue'
import type { ScreenshotCacheEntry } from '../node-screenshot'
import { CanvasScreenshotPool, CanvasWarmupCoordinator } from '../node-screenshot'

export interface UseAIWorkflowCanvasScreenshotOptions {
	/** 最大Bitmap数量，默认500 */
	maxBitmapCount?: number
	/** 最大内存占用(MB)，默认200 */
	maxMemoryMB?: number
	/** 默认并发数，默认4 */
	concurrency?: number
	/** 是否在截图更新时自动预热，默认true */
	autoWarmup?: boolean
}

export interface CanvasScreenshotState {
	/** 池中Bitmap数量 */
	bitmapCount: number
	/** 最大Bitmap数量 */
	maxBitmapCount: number
	/** 估算内存占用(MB) */
	memoryEstimateMB: string
	/** 加载中的数量 */
	loadingCount: number
	/** 就绪的数量 */
	readyCount: number
	/** 错误数量 */
	errorCount: number
	/** 是否正在预热 */
	isWarmingUp: boolean
	/** 待处理任务数 */
	pendingTasks: number
	/** 预热进度 (0-1) */
	warmupProgress: number
	/** 预热详情 */
	warmupDetail: string
}

/**
 * AI工作流Canvas2D截图预热Composable
 */
export const useAIWorkflowCanvasScreenshot = (options: UseAIWorkflowCanvasScreenshotOptions = {}) => {
	// Canvas截图池
	const canvasPool = shallowRef<CanvasScreenshotPool | null>(null)

	// 预热协调器
	let warmupCoordinator: CanvasWarmupCoordinator | null = null

	// 预热状态
	const isWarmingUp = ref(false)
	const warmupProgress = ref(0)
	const warmupDetail = ref('')
	const warmupErrors = ref<Array<{ nodeId: string; error: string }>>([])

	// 初始化
	const init = () => {
		if (canvasPool.value) return

		canvasPool.value = new CanvasScreenshotPool({
			maxBitmapCount: options.maxBitmapCount ?? 500,
			maxMemoryMB: options.maxMemoryMB ?? 200,
			preferImageBitmap: true
		})

		warmupCoordinator = new CanvasWarmupCoordinator(canvasPool.value, {
			concurrency: options.concurrency ?? 4,
			onProgress: (progress, detail) => {
				warmupProgress.value = progress
				warmupDetail.value = detail
			},
			onComplete: () => {
				isWarmingUp.value = false
				warmupProgress.value = 1
				warmupDetail.value = '预热完成'
			},
			onError: (error, nodeId) => {
				warmupErrors.value.push({ nodeId, error: error.message })
				console.warn(`[CanvasScreenshot] Failed to warmup node ${nodeId}:`, error)
			}
		})
	}

	// 销毁
	const dispose = () => {
		warmupCoordinator?.dispose()
		warmupCoordinator = null

		canvasPool.value?.dispose()
		canvasPool.value = null

		isWarmingUp.value = false
		warmupProgress.value = 0
		warmupDetail.value = ''
		warmupErrors.value = []
	}

	// 预热所有截图
	const warmupAll = async (
		screenshotMap: Map<string, ScreenshotCacheEntry>,
		viewportRect?: { x0: number; y0: number; x1: number; y1: number }
	) => {
		console.log('[CanvasScreenshot] warmupAll called, map size:', screenshotMap.size)
		console.log('[CanvasScreenshot] map entries:', Array.from(screenshotMap.entries()).map(([k, v]) => ({ nodeId: k, hasDataUrl: !!v?.dataUrl, dataUrlLength: v?.dataUrl?.length })))

		if (!canvasPool.value || !warmupCoordinator) {
			console.log('[CanvasScreenshot] Initializing canvasPool and warmupCoordinator')
			init()
			console.log('[CanvasScreenshot] After init, canvasPool:', canvasPool.value, 'warmupCoordinator:', warmupCoordinator)
		}

		if (!warmupCoordinator) {
			console.warn('[CanvasScreenshot] warmupCoordinator still null after init')
			return
		}

		// 清空之前的错误
		warmupErrors.value = []

		const entries = Array.from(screenshotMap.values())
		console.log('[CanvasScreenshot] entries to warmup:', entries.length, entries.map(e => ({ nodeId: e.nodeId, hasDataUrl: !!e.dataUrl })))

		if (entries.length === 0) {
			console.log('[CanvasScreenshot] No entries to warmup, returning')
			warmupProgress.value = 1
			warmupDetail.value = '没有需要预热的截图'
			return
		}

		isWarmingUp.value = true
		warmupProgress.value = 0
		warmupDetail.value = `准备预热 ${entries.length} 个截图...`

		// 如果有视口信息，使用视口感知批量添加
		if (viewportRect) {
			// TODO: 需要传入节点位置信息
			// warmupCoordinator.addViewportAwareBatch(...)
		} else {
			console.log('[CanvasScreenshot] Adding batch to warmupCoordinator, tasks before:', warmupCoordinator.getStatus())
			warmupCoordinator.addBatch(
				entries.map(entry => ({
					nodeId: entry.nodeId,
					entry
				}))
			)
			console.log('[CanvasScreenshot] tasks after addBatch:', warmupCoordinator.getStatus())
		}

		console.log('[CanvasScreenshot] Starting warmup')
		await warmupCoordinator.warmup()
		console.log('[CanvasScreenshot] Warmup completed')
	}

	// 预热新截图
	const warmupNew = async (
		screenshotMap: Map<string, ScreenshotCacheEntry>,
		existingNodeIds: Set<string>
	) => {
		if (!canvasPool.value || !warmupCoordinator) {
			init()
		}

		if (!warmupCoordinator) return

		// 找出新的截图
		const newEntries: ScreenshotCacheEntry[] = []
		for (const [nodeId, entry] of screenshotMap) {
			if (!existingNodeIds.has(nodeId)) {
				newEntries.push(entry)
			}
		}

		if (newEntries.length === 0) return

		isWarmingUp.value = true
		warmupDetail.value = `预热 ${newEntries.length} 个新截图...`

		warmupCoordinator.addBatch(
			newEntries.map(entry => ({
				nodeId: entry.nodeId,
				entry,
				priority: 'high' as const // 新节点高优先级
			}))
		)

		await warmupCoordinator.warmup()
	}

	// 加载单个截图
	const loadScreenshot = async (entry: ScreenshotCacheEntry) => {
		if (!canvasPool.value) {
			init()
		}

		return canvasPool.value?.loadFromCache(entry) ?? null
	}

	// 批量加载
	const loadBatch = async (
		entries: ScreenshotCacheEntry[],
		onProgress?: (loaded: number, total: number) => void
	) => {
		if (!canvasPool.value) {
			init()
		}

		return canvasPool.value?.loadBatch(entries, { concurrency: 4, onProgress }) ?? []
	}

	// 获取状态
	const getState = (): CanvasScreenshotState => {
		const stats = canvasPool.value?.getStats() ?? {
			bitmapCount: 0,
			maxBitmapCount: options.maxBitmapCount ?? 500,
			memoryEstimateMB: '0',
			loadingCount: 0,
			readyCount: 0,
			errorCount: 0
		}

		const warmupStatus = warmupCoordinator?.getStatus()

		return {
			...stats,
			isWarmingUp: isWarmingUp.value,
			pendingTasks: warmupStatus?.pending ?? 0,
			warmupProgress: warmupProgress.value,
			warmupDetail: warmupDetail.value
		}
	}

	// 响应式状态
	const state = computed(() => getState())

	// 检查是否有Bitmap
	const hasBitmap = (nodeId: string): boolean => {
		const result = canvasPool.value?.hasBitmap(nodeId) ?? false
		if (!result && import.meta.env.DEV) {
			console.log('[CanvasScreenshot] hasBitmap(' + nodeId + ') = false, canvasPool:', canvasPool.value)
		}
		return result
	}

	// 获取Bitmap
	const getBitmap = (nodeId: string) => {
		const result = canvasPool.value?.getBitmap(nodeId) ?? null
		if (!result && import.meta.env.DEV) {
			console.log('[CanvasScreenshot] getBitmap(' + nodeId + ') = null, canvasPool:', canvasPool.value)
		}
		return result
	}

	// 获取完整Entry (含bitmap实际尺寸)
	const getEntry = (nodeId: string) => {
		return canvasPool.value?.getEntry(nodeId) ?? null
	}

	// 获取视口内的节点
	const getEntriesInViewport = (
		viewportRect: { x0: number; y0: number; x1: number; y1: number }
	) => {
		return canvasPool.value?.getEntriesInViewport(viewportRect) ?? []
	}

	// 更新节点位置
	const updatePosition = (nodeId: string, worldX: number, worldY: number) => {
		canvasPool.value?.updatePosition(nodeId, worldX, worldY)
	}

	// 使缓存失效
	const invalidate = (nodeId: string) => {
		canvasPool.value?.invalidate(nodeId)
	}

	// 裁剪到有效节点
	const pruneToValidNodes = (validNodeIds: Set<string>) => {
		canvasPool.value?.pruneToValidNodes(validNodeIds)
	}

	// 设置最大Bitmap数量
	const setMaxBitmapCount = (count: number) => {
		canvasPool.value?.setMaxBitmapCount(count)
	}

	// 设置最大内存占用
	const setMaxMemoryMB = (mb: number) => {
		canvasPool.value?.setMaxMemoryMB(mb)
	}

	// 取消所有待处理的预热
	const cancelPending = () => {
		warmupCoordinator?.cancelAllPending()
		isWarmingUp.value = false
		warmupDetail.value = '已取消预热'
	}

	// 重试失败的预热
	const retryFailed = async () => {
		await warmupCoordinator?.retryFailed()
	}

	// 生命周期
	onBeforeUnmount(() => {
		dispose()
	})

	return {
		// 初始化/销毁
		init,
		dispose,

		// 预热
		warmupAll,
		warmupNew,

		// 加载
		loadScreenshot,
		loadBatch,

		// 查询
		hasBitmap,
		getBitmap,
		getEntry,
		getEntriesInViewport,
		getState,

		// 更新
		updatePosition,
		invalidate,
		pruneToValidNodes,

		// 配置
		setMaxBitmapCount,
		setMaxMemoryMB,

		// 控制
		cancelPending,
		retryFailed,

		// 状态
		state,
		isWarmingUp,
		warmupProgress,
		warmupDetail,
		warmupErrors
	}
}

// 单例模式 - 全局共享的Canvas截图池
let globalCanvasScreenshot: ReturnType<typeof useAIWorkflowCanvasScreenshot> | null = null

export const useGlobalCanvasScreenshot = (
	options?: UseAIWorkflowCanvasScreenshotOptions
): ReturnType<typeof useAIWorkflowCanvasScreenshot> => {
	if (!globalCanvasScreenshot) {
		globalCanvasScreenshot = useAIWorkflowCanvasScreenshot(options)
	}

	return globalCanvasScreenshot
}
