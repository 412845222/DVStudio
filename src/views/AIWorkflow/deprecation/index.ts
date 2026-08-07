/**
 * AI工作流蓝图 - 废弃特性统一入口
 *
 * 管理所有 Feature Flag 的读取与默认值。
 * 集中管理已降级/即将移除的旧模块（如截图预热系统）。
 *
 * @deprecated 本目录下所有模块均为过渡方案，将在后续版本移除。
 */

// Feature Flag 键名
export const FLAG_ENABLE_LEGACY_SCREENSHOT_WARMUP = 'DVS_ENABLE_LEGACY_SCREENSHOT_WARMUP'

let flagsCache: DeprecationFlags | null = null

export interface DeprecationFlags {
	/** 是否启用旧的截图预热系统。'1'=启用, 未设置/其他=禁用 */
	enableLegacyScreenshotWarmup: boolean
}

/**
 * 读取全部废弃特性开关（带缓存）
 * 只在首次调用时读取 localStorage，后续返回缓存值
 */
export const getDeprecationFlags = (): DeprecationFlags => {
	if (flagsCache) return flagsCache

	let enableLegacy = false
	try {
		if (typeof window !== 'undefined' && window.localStorage) {
			const raw = window.localStorage.getItem(FLAG_ENABLE_LEGACY_SCREENSHOT_WARMUP)
			enableLegacy = raw === '1'
		}
	} catch {
		// SSR / 隐私模式下 localStorage 不可用，默认禁用旧系统
		enableLegacy = false
	}

	flagsCache = { enableLegacyScreenshotWarmup: enableLegacy }
	return flagsCache
}

/** 便捷判断：是否启用旧截图预热系统（未设置默认禁用） */
export const isLegacyScreenshotWarmupEnabled = (): boolean => {
	return getDeprecationFlags().enableLegacyScreenshotWarmup
}

/** 单元测试/调试用：清空缓存，强制重新读取 localStorage */
export const _resetDeprecationFlagsCache = (): void => {
	flagsCache = null
}
