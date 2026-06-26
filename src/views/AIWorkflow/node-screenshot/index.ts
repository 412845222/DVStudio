/**
 * Node Screenshot Module
 *
 * 提供节点截图扁平化渲染功能
 *
 * 使用方式：
 * 1. 在 AIWorkflowPage.vue 中引入
 * 2. 调用 createNodeScreenshotPool 获取截图管理器
 * 3. 在节点渲染时判断是否使用截图覆盖
 */

export { createNodeScreenshotPool, SCREENSHOT_PADDING } from './useNodeScreenshotPool'
export type { ScreenshotCacheEntry, NodeScreenshotPool, ScreenshotPriority } from './useNodeScreenshotPool'
