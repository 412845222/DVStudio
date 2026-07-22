/**
 * Node Screenshot 模块统一导出
 */

// DOM截图池
export {
	createNodeScreenshotPool,
	invalidateDocumentStyleCache,
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
	type ScreenshotPoolProvider
} from './canvasNodeRenderer'

// Canvas2D碰撞检测
export {
	CanvasHitTestManager,
	type NodeBounds,
	type HitTestOptions,
	type HitTestResult
} from './canvasHitTestManager'

// 版本号计算器
export {
	calculateNodeScreenshotVersion,
	nodeContentChanged,
	type ThemeMode,
	type ResourceLoadState,
	type NodeVersionContext
} from './nodeVersionCalculator'

// 图片截图处理增强
export {
	enhancedWaitForAllImages,
	enhancedConvertImagesToDataUrls,
	prepareClonedImages,
	getImageLoadState
} from './imageScreenshotHelper'

// 统一截图失效钩子
export {
	registerNodeScreenshotInvalidator,
	invalidateNodeScreenshot,
	scheduleInvalidateNodeScreenshot,
	cancelPendingInvalidate,
	invalidateAllNodeScreenshots,
	useNodeScreenshotInvalidation
} from './nodeScreenshotHooks'

// 未预热节点提示
export {
	useWarmupPrompt,
	warmupPromptState,
	type WarmupPromptState
} from './warmupPromptManager'
