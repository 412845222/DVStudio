/**
 * 统一的截图失效钩子注册表
 * 为所有节点类型提供一致的invalidate-screenshot触发机制
 */

import { getCurrentInstance, onUnmounted, watch, type WatchSource, type WatchStopHandle } from 'vue'

type InvalidateCallback = (nodeId: string) => void

const invalidateCallbacks = new Set<InvalidateCallback>()
const nodeTimers = new Map<string, number>()

export const registerNodeScreenshotInvalidator = (callback: InvalidateCallback): (() => void) => {
	invalidateCallbacks.add(callback)
	return () => {
		invalidateCallbacks.delete(callback)
	}
}

export const invalidateNodeScreenshot = (nodeId: string): void => {
	for (const cb of invalidateCallbacks) {
		try {
			cb(nodeId)
		} catch {}
	}
}

export const scheduleInvalidateNodeScreenshot = (
	nodeId: string,
	debounceMs: number = 150
): void => {
	const existingTimer = nodeTimers.get(nodeId)
	if (existingTimer !== undefined) {
		clearTimeout(existingTimer)
	}
	const timer = window.setTimeout(() => {
		nodeTimers.delete(nodeId)
		invalidateNodeScreenshot(nodeId)
	}, debounceMs)
	nodeTimers.set(nodeId, timer)
}

export const cancelPendingInvalidate = (nodeId: string): void => {
	const timer = nodeTimers.get(nodeId)
	if (timer !== undefined) {
		clearTimeout(timer)
		nodeTimers.delete(nodeId)
	}
}

export const invalidateAllNodeScreenshots = (): void => {
	nodeTimers.forEach((timer) => clearTimeout(timer))
	nodeTimers.clear()
	for (const cb of invalidateCallbacks) {
		try {
			cb('*')
		} catch {}
	}
}

export interface UseNodeScreenshotInvalidationOptions {
	debounceMs?: number
}

export const useNodeScreenshotInvalidation = (
	nodeIdGetter: WatchSource<string> | (() => string) | string,
	options: UseNodeScreenshotInvalidationOptions = {}
) => {
	const { debounceMs = 150 } = options
	const instance = getCurrentInstance()
	const stopHandles: WatchStopHandle[] = []

	const getNodeId = (): string => {
		if (typeof nodeIdGetter === 'string') return nodeIdGetter
		if (typeof nodeIdGetter === 'function') {
			try {
				return nodeIdGetter()
			} catch {
				return ''
			}
		}
		return ''
	}

	const scheduleInvalidate = (customDebounce?: number) => {
		const nid = getNodeId()
		if (nid) {
			scheduleInvalidateNodeScreenshot(nid, customDebounce ?? debounceMs)
		}
	}

	const invalidateNow = () => {
		const nid = getNodeId()
		if (nid) {
			cancelPendingInvalidate(nid)
			invalidateNodeScreenshot(nid)
		}
	}

	const autoInvalidateOnChange = <T>(
		source: WatchSource<T> | (() => T),
		customDebounce?: number
	): WatchStopHandle => {
		const stop = watch(
			source,
			() => {
				scheduleInvalidate(customDebounce)
			},
			{ deep: true }
		)
		stopHandles.push(stop)
		return stop
	}

	const cleanup = () => {
		for (const stop of stopHandles) {
			stop()
		}
		stopHandles.length = 0
	}

	if (instance) {
		onUnmounted(() => {
			cleanup()
		})
	}

	return {
		scheduleInvalidate,
		invalidateNow,
		autoInvalidateOnChange,
		cleanup
	}
}
