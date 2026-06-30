/**
 * Node Screenshot 模块统一导出
 * 
 * 导出:
 * - useNodeScreenshotPool.ts: DOM截图池
 * - nodeScreenshotPersistentCache.ts: IndexedDB持久化
 * - canvasScreenshotPool.ts: Canvas2D纹理池 (新增)
 * - canvasWarmupCoordinator.ts: 预热协调器 (新增)
 */

// DOM截图池
export {
	createNodeScreenshotPool,
	type NodeScreenshotPool,
	type ScreenshotCacheEntry,
	type ScreenshotPriority,
	SCREENSHOT_PADDING
} from './useNodeScreenshotPool'

// IndexedDB持久化
export {
	saveScreenshotToDisk,
	loadScreenshotFromDisk,
	loadAllScreenshotsForBlueprint,
	cleanupOldScreenshots
} from './nodeScreenshotPersistentCache'

// Canvas2D纹理池
export {
	CanvasScreenshotPool,
	type CanvasScreenshotEntry,
	type CanvasScreenshotPoolOptions
} from './canvasScreenshotPool'

// 预热协调器
export {
	CanvasWarmupCoordinator,
	type WarmupOptions,
	type WarmupTask,
	type WarmupStatus,
	calculateWarmupProgress,
	formatWarmupDetail
} from './canvasWarmupCoordinator'

// Canvas2D节点渲染器
export {
	CanvasNodeRenderer,
	type VisibleNodeEntry,
	type ViewportState,
	type RenderOptions
} from './canvasNodeRenderer'

// Canvas2D碰撞检测
export {
	CanvasHitTestManager,
	type NodeBounds,
	type HitTestOptions,
	type HitTestResult
} from './canvasHitTestManager'
