/**
 * 截图预热系统 - 降级策略封装
 *
 * 根据 Feature Flag (DVS_ENABLE_LEGACY_SCREENSHOT_WARMUP) 决定：
 *  - '1'  → 走完整实现（full 模式，紧急回退用）
 *  - 其他 → 走 noop 空实现（新架构，默认）
 *
 * 使用透明包装模式：createXxxWithDeprecation() 内部根据 flag 分发。
 * 调用方无需感知分支存在。
 *
 * @deprecated 本文件为过渡兼容层，后续版本物理删除截图预热系统时一并移除。
 */

import { isLegacyScreenshotWarmupEnabled } from './index'
import type { ScreenshotCacheEntry, ScreenshotPriority } from '../node-screenshot/useNodeScreenshotPool'

export type PoolMode = 'full' | 'noop'

/** 判断当前运行在哪个模式（读取一次后缓存） */
export const getPoolMode = (): PoolMode => (isLegacyScreenshotWarmupEnabled() ? 'full' : 'noop')

// ---------------------------------------------------------------------------
// Noop 版本的 NodeScreenshotPool
// ---------------------------------------------------------------------------

export const createNoopNodeScreenshotPool = () => {
	const emptyMap = new Map<string, ScreenshotCacheEntry>()
	return {
		// 查询类：全部返回"无缓存"，迫使系统走直接 DOM 渲染路径
		hasCachedScreenshot: (): boolean => false,
		getCachedScreenshot: (): ScreenshotCacheEntry | null => null,
		hasBitmap: (): boolean => false,

		// 操作类：全部空实现
		queueScreenshot: async (): Promise<ScreenshotCacheEntry | null> => null,
		invalidateScreenshot: (): void => {},
		invalidateAll: (): void => {},
		pause: (): void => {},
		resume: (): void => {},
		cleanup: (): void => {},
		burstCapture: async (): Promise<Map<string, ScreenshotCacheEntry>> => new Map(),

		// 主题 & 配置类：空实现
		setActiveTheme: (): void => {},
		getAllCachedForTheme: (): Map<string, ScreenshotCacheEntry> => emptyMap,
		setConcurrency: (): void => {},
		setBurstMode: (): void => {},
		getWarmupConcurrency: (): number => 1,
		isInteractionPaused: (): boolean => false,

		// 进度与状态
		getPendingCount: (): number => 0,
		getActiveCount: (): number => 0
	}
}

// ---------------------------------------------------------------------------
// Noop 版本的 PersistentCache（IndexedDB 层）
// ---------------------------------------------------------------------------

export const NoopPersistentCache = {
	saveScreenshotToDisk: async (): Promise<void> => Promise.resolve(),
	loadScreenshotFromDisk: async (): Promise<string | null> => Promise.resolve(null),
	loadAllScreenshotsForBlueprint: async (): Promise<
		Map<
			string,
			{
				dataUrl: string
				version: string
				width: number
				height: number
				theme: 'dark' | 'light'
				nodeId: string
				capturedAt: number
			}
		>
	> => Promise.resolve(new Map()),
	cleanupOldScreenshots: async (): Promise<void> => Promise.resolve()
}

// ---------------------------------------------------------------------------
// Noop 版本的 WarmupPromptManager
// ---------------------------------------------------------------------------

import { ref } from 'vue'
import type { WarmupPromptState } from '../node-screenshot/warmupPromptManager'

export const createNoopWarmupPrompt = () => {
	const emptyState = ref<WarmupPromptState>({
		visible: false,
		projectId: null,
		blueprintId: null,
		unwarmedNodeIds: [],
		totalNodeCount: 0
	})
	return {
		state: emptyState,
		checkUnwarmedNodes: (): string[] => [],
		showPrompt: (): void => {},
		confirmWarmup: (): void => {},
		dismissPrompt: (): void => {},
		hidePrompt: (): void => {},
		resetDismissedBlueprints: (): void => {}
	}
}
