/**
 * Node Screenshot Pool - 管理节点截图缓存与并发截图
 *
 * 优化方案：纯原生SVG foreignObject + Canvas 截图，彻底抛弃html2canvas
 * 浏览器原生渲染支持所有现代CSS颜色格式（oklab/oklch/color(srgb)/color-mix/lab/lch/hwb...）
 * 永远不会有"unsupported color function"错误。
 *
 * 支持弹性并发：使用多个独立的离屏渲染槽位(slots)并行截图
 * padding用于保留超出主体矩形的id badge和box-shadow等溢出内容。
 * 锚点通过真实DOM渲染在截图外侧，不需要包含在截图中。
 *
 * 新增：优先级队列 + 时间分片执行，避免阻塞主线程
 * 新增：双主题缓存(dark/light)，主题切换时保留两套截图，支持无缝过渡
 * 新增：交互感知暂停 - 用户交互时立即中断正在执行的截图任务
 */

import { ref } from 'vue'
import {
	enhancedWaitForAllImages,
	enhancedConvertImagesToDataUrls,
	prepareClonedImages
} from './imageScreenshotHelper'

export interface ScreenshotCacheEntry {
	nodeId: string
	version: string
	theme: 'dark' | 'light'
	dataUrl: string
	width: number
	height: number
	padding: number
	capturedAt: number
}

export type ScreenshotPriority = 'high' | 'normal' | 'low'

const BASE_CONCURRENT_CAPTURES = 1
const MAX_CONCURRENT_CAPTURES = 4
const WARMUP_MAX_CONCURRENCY = 1
const HIGH_PRIORITY_FRAME_TIME_MS = 16
const NORMAL_PRIORITY_FRAME_TIME_MS = 8
const LOW_PRIORITY_FRAME_TIME_MS = 5
const IDLE_CALLBACK_TIMEOUT = 100

class AbortError extends Error {
	constructor() {
		super('Screenshot aborted due to user interaction')
		this.name = 'AbortError'
	}
}

const yieldToMain = (signal?: AbortSignal): Promise<void> => {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new AbortError())
			return
		}
		const onAbort = () => {
			reject(new AbortError())
		}
		if (signal) {
			signal.addEventListener('abort', onAbort, { once: true })
		}
		const finish = () => {
			if (signal) {
				signal.removeEventListener('abort', onAbort)
			}
			resolve()
		}
		if (typeof window.requestIdleCallback === 'function') {
			window.requestIdleCallback(() => finish(), { timeout: 50 })
		} else {
			setTimeout(finish, 0)
		}
	})
}

const checkAbort = (signal?: AbortSignal) => {
	if (signal?.aborted) {
		throw new AbortError()
	}
}

const scheduleMicrotask = (fn: () => void) => {
	if (typeof window.queueMicrotask === 'function') {
		window.queueMicrotask(fn)
	} else {
		Promise.resolve().then(fn)
	}
}

const getIdealConcurrency = () => {
	try {
		const cores = navigator.hardwareConcurrency || 4
		return Math.min(
			MAX_CONCURRENT_CAPTURES,
			Math.max(BASE_CONCURRENT_CAPTURES, Math.floor(cores / 4))
		)
	} catch {
		return 1
	}
}

const getWarmupConcurrency = () => {
	return 1
}
const QUEUE_DELAY_MS = 10
const IMAGE_WAIT_TIMEOUT = 2500
export const SCREENSHOT_PADDING = 20

interface ScreenshotSlot {
	host: HTMLDivElement
	busy: boolean
}

interface ScreenshotTask {
	nodeId: string
	theme: 'dark' | 'light'
	element: HTMLElement
	version: string
	width: number
	height: number
	padding: number
	priority: ScreenshotPriority
	resolve: (e: ScreenshotCacheEntry | null) => void
}

const slots: ScreenshotSlot[] = []
let slotsInitialized = false

const ensureSlots = (count: number): ScreenshotSlot[] => {
	if (slotsInitialized && slots.length >= count) return slots
	const needed = Math.max(0, count - slots.length)
	for (let i = 0; i < needed; i++) {
		const host = document.createElement('div')
		host.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
		host.style.cssText = `
      position: fixed !important;
      left: -99999px !important;
      top: ${i * 10000}px !important;
      width: 8192px !important;
      height: 8192px !important;
      overflow: visible !important;
      pointer-events: none !important;
      z-index: -99999 !important;
      background: transparent !important;
      opacity: 0 !important;
    `
		document.body.appendChild(host)
		slots.push({ host, busy: false })
	}
	slotsInitialized = true
	return slots
}

const acquireSlot = (): ScreenshotSlot | null => {
	for (const slot of slots) {
		if (!slot.busy) {
			slot.busy = true
			return slot
		}
	}
	return null
}

const releaseSlot = (slot: ScreenshotSlot) => {
	slot.busy = false
	while (slot.host.firstChild) {
		slot.host.removeChild(slot.host.firstChild)
	}
}

const clearAllSlots = () => {
	for (const slot of slots) {
		while (slot.host.firstChild) {
			slot.host.removeChild(slot.host.firstChild)
		}
	}
}

const cleanupSlots = () => {
	for (const slot of slots) {
		if (slot.host.parentNode) slot.host.parentNode.removeChild(slot.host)
	}
	slots.length = 0
	slotsInitialized = false
}

const waitForAllImages = (root: HTMLElement, signal?: AbortSignal): Promise<void> => {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new AbortError())
			return
		}
		const imgs = Array.from(root.querySelectorAll('img'))
		if (imgs.length === 0) return resolve()
		let done = false
		let loaded = 0
		const onAbort = () => {
			if (!done) {
				done = true
				reject(new AbortError())
			}
		}
		if (signal) {
			signal.addEventListener('abort', onAbort, { once: true })
		}
		const finish = () => {
			if (!done) {
				done = true
				if (signal) signal.removeEventListener('abort', onAbort)
				resolve()
			}
		}
		const timer = setTimeout(finish, IMAGE_WAIT_TIMEOUT)
		const onOne = () => {
			if (++loaded >= imgs.length) {
				clearTimeout(timer)
				finish()
			}
		}
		imgs.forEach((img) => {
			if (img.complete && img.naturalWidth > 0) {
				onOne()
			} else {
				img.addEventListener('load', onOne, { once: true })
				img.addEventListener('error', onOne, { once: true })
			}
		})
	})
}

/**
 * 收集文档中所有可用的CSS规则文本（用于注入到SVG foreignObject中）
 * 处理内联<style>标签和外部样式表
 */
const collectDocumentStyles = (): string => {
	const styleTexts: string[] = []

	try {
		for (const sheet of Array.from(document.styleSheets)) {
			try {
				const rules = (sheet as CSSStyleSheet).cssRules
				if (!rules) continue
				for (const rule of Array.from(rules)) {
					styleTexts.push(rule.cssText)
				}
			} catch {
				// 跨域样式表无法访问，跳过
			}
		}
	} catch {}

	// 额外添加重置样式确保在SVG中正确渲染
	styleTexts.push(`
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: transparent !important; }
    .wf-node::before, .wf-node::after { display: none !important; content: none !important; }
    input, textarea, select, button { font: inherit; color: inherit; }
  `)

	return styleTexts.join('\n')
}

let cachedDocumentStyles: string | null = null
const getDocumentStyles = (): string => {
	if (cachedDocumentStyles === null) {
		cachedDocumentStyles = collectDocumentStyles()
	}
	return cachedDocumentStyles
}

export const invalidateDocumentStyleCache = (): void => {
	cachedDocumentStyles = null
}

const extractThemeFromVersion = (version: string): 'dark' | 'light' => {
	const m = version.match(/^theme:(dark|light)/)
	return m ? (m[1] as 'dark' | 'light') : 'dark'
}

const makeCacheKey = (nodeId: string, theme: 'dark' | 'light') => `${nodeId}::${theme}`

export const __test__inlineAllStyles = async (
	source: Element,
	clone: Element,
	signal?: AbortSignal,
	preserveProps?: Set<string>
) => {
	const skipProps = new Set([
		'cursor',
		'pointer-events',
		'user-select',
		'-webkit-user-drag',
		'user-modify',
		'caret-color',
		'resize',
		'nav-index',
		'outline',
		'outline-color',
		'outline-style',
		'outline-width',
		'outline-offset',
		...(preserveProps || [])
	])

	const allSourceElements: Element[] = []
	const allCloneElements: Element[] = []
	const sw = document.createTreeWalker(source, NodeFilter.SHOW_ELEMENT)
	const cw = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT)
	let sn: Node | null = sw.currentNode
	let cn: Node | null = cw.currentNode
	while (sn && cn) {
		allSourceElements.push(sn as Element)
		allCloneElements.push(cn as Element)
		sn = sw.nextNode()
		cn = cw.nextNode()
	}

	const batchSize = 20
	for (let i = 0; i < allSourceElements.length; i += batchSize) {
		checkAbort(signal)
		await yieldToMain(signal)
		const end = Math.min(i + batchSize, allSourceElements.length)
		for (let j = i; j < end; j++) {
			const sEl = allSourceElements[j] as HTMLElement | SVGElement
			const cEl = allCloneElements[j] as HTMLElement | SVGElement

			if (
				(sEl instanceof HTMLElement || sEl instanceof SVGElement) &&
				(cEl instanceof HTMLElement || cEl instanceof SVGElement)
			) {
				const computed = window.getComputedStyle(sEl)
				const isRoot = j === 0
				let preservedTransform: string | null = null
				let preservedTransformOrigin: string | null = null
				let preservedLeft: string | null = null
				let preservedTop: string | null = null
				let preservedRight: string | null = null
				let preservedBottom: string | null = null
				let preservedPosition: string | null = null
				let preservedMargin: string | null = null

				if (isRoot && cEl instanceof HTMLElement) {
					preservedTransform = cEl.style.transform
					preservedTransformOrigin = cEl.style.transformOrigin
					preservedLeft = cEl.style.left
					preservedTop = cEl.style.top
					preservedRight = cEl.style.right
					preservedBottom = cEl.style.bottom
					preservedPosition = cEl.style.position
					preservedMargin = cEl.style.margin
				}

				for (let k = 0; k < computed.length; k++) {
					const prop = computed[k]
					if (skipProps.has(prop)) continue
					try {
						const val = computed.getPropertyValue(prop)
						if (val) {
							cEl.style.setProperty(prop, val, computed.getPropertyPriority(prop))
						}
					} catch {}
				}

				if (isRoot && cEl instanceof HTMLElement) {
					cEl.style.transform = preservedTransform!
					cEl.style.transformOrigin = preservedTransformOrigin!
					cEl.style.left = preservedLeft!
					cEl.style.top = preservedTop!
					cEl.style.right = preservedRight!
					cEl.style.bottom = preservedBottom!
					cEl.style.position = preservedPosition!
					cEl.style.margin = preservedMargin!
				}
			}

			if (cEl instanceof HTMLImageElement) {
				cEl.crossOrigin = 'anonymous'
			}
		}
	}
}

const convertImagesToDataUrls = async (root: HTMLElement, signal?: AbortSignal): Promise<void> => {
	const imgs = Array.from(root.querySelectorAll('img'))
	if (imgs.length === 0) return
	await Promise.all(
		imgs.map((img) => {
			return new Promise<void>((resolve, reject) => {
				if (signal?.aborted) {
					reject(new AbortError())
					return
				}
				const onAbort = () => reject(new AbortError())
				if (signal) signal.addEventListener('abort', onAbort, { once: true })
				try {
					if (!img.src || img.src.startsWith('data:')) {
						if (signal) signal.removeEventListener('abort', onAbort)
						resolve()
						return
					}
					const doConvert = () => {
						try {
							if (signal?.aborted) {
								if (signal) signal.removeEventListener('abort', onAbort)
								reject(new AbortError())
								return
							}
							const canvas = document.createElement('canvas')
							const w = img.naturalWidth || img.width || 1
							const h = img.naturalHeight || img.height || 1
							canvas.width = w
							canvas.height = h
							const ctx = canvas.getContext('2d')
							if (ctx) {
								ctx.drawImage(img, 0, 0, w, h)
								img.src = canvas.toDataURL('image/png')
							}
						} catch {}
						if (signal) signal.removeEventListener('abort', onAbort)
						resolve()
					}
					if (img.complete && img.naturalWidth > 0) {
						doConvert()
					} else {
						img.addEventListener('load', doConvert, { once: true })
						img.addEventListener(
							'error',
							() => {
								if (signal) signal.removeEventListener('abort', onAbort)
								resolve()
							},
							{ once: true }
						)
						setTimeout(() => {
							if (signal) signal.removeEventListener('abort', onAbort)
							resolve()
						}, 1000)
					}
				} catch {
					if (signal) signal.removeEventListener('abort', onAbort)
					resolve()
				}
			})
		})
	)
}

const renderSvgToCanvas = (
	svgDataUrl: string,
	width: number,
	height: number,
	signal?: AbortSignal
): Promise<HTMLCanvasElement> => {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new AbortError())
			return
		}
		const img = new Image()
		img.crossOrigin = 'anonymous'
		const onAbort = () => reject(new AbortError())
		if (signal) signal.addEventListener('abort', onAbort, { once: true })
		img.onload = () => {
			if (signal?.aborted) {
				if (signal) signal.removeEventListener('abort', onAbort)
				reject(new AbortError())
				return
			}
			const canvas = document.createElement('canvas')
			canvas.width = width
			canvas.height = height
			const ctx = canvas.getContext('2d')
			if (!ctx) {
				if (signal) signal.removeEventListener('abort', onAbort)
				reject(new Error('Failed to get 2d context'))
				return
			}
			ctx.clearRect(0, 0, width, height)
			ctx.drawImage(img, 0, 0, width, height)
			if (signal) signal.removeEventListener('abort', onAbort)
			resolve(canvas)
		}
		img.onerror = () => {
			if (signal) signal.removeEventListener('abort', onAbort)
			reject(new Error('Failed to load SVG image'))
		}
		img.src = svgDataUrl
	})
}

const scheduleWork = (fn: () => void, priority: ScreenshotPriority) => {
	if (priority === 'high') {
		setTimeout(fn, 0)
		return
	}

	if (typeof window.requestIdleCallback === 'function') {
		const idleTimeout = priority === 'normal' ? 50 : IDLE_CALLBACK_TIMEOUT
		window.requestIdleCallback(
			(deadline) => {
				if (deadline.didTimeout || deadline.timeRemaining() > 5) {
					fn()
				} else {
					scheduleWork(fn, priority)
				}
			},
			{ timeout: idleTimeout }
		)
	} else {
		const timeout = priority === 'normal' ? 16 : 32
		setTimeout(fn, timeout)
	}
}

export interface WarmupProgressInfo {
	completed: number
	total: number
	theme: 'dark' | 'light'
}

export const createNodeScreenshotPool = () => {
	const maxConcurrency = ref<number>(1)
	const cache = new Map<string, ScreenshotCacheEntry>()
	const highPriorityQueue: ScreenshotTask[] = []
	const normalPriorityQueue: ScreenshotTask[] = []
	const lowPriorityQueue: ScreenshotTask[] = []
	const inFlight = new Map<
		string,
		{
			version: string
			resolves: Array<(e: ScreenshotCacheEntry | null) => void>
			abortController: AbortController
		}
	>()

	let processing = false
	let active = 0
	let burstMode = false
	let activeTheme: 'dark' | 'light' = 'dark'
	let onWarmupProgress: ((info: WarmupProgressInfo) => void) | null = null
	let isPaused = false
	let resumeTimer: ReturnType<typeof setTimeout> | null = null
	let globalAbortController: AbortController | null = null

	const getCacheKey = (nodeId: string, theme: 'dark' | 'light') => makeCacheKey(nodeId, theme)

	const getCached = (nodeId: string, version: string) => {
		const theme = extractThemeFromVersion(version)
		const key = getCacheKey(nodeId, theme)
		const e = cache.get(key)
		return e && e.version === version ? e : null
	}
	const hasCached = (nodeId: string, version: string) => !!getCached(nodeId, version)

	const hasCachedForTheme = (nodeId: string, theme: 'dark' | 'light'): boolean => {
		const key = getCacheKey(nodeId, theme)
		return cache.has(key)
	}

	const getCachedForTheme = (
		nodeId: string,
		theme: 'dark' | 'light'
	): ScreenshotCacheEntry | null => {
		const key = getCacheKey(nodeId, theme)
		return cache.get(key) || null
	}

	const getAllCachedForTheme = (theme: 'dark' | 'light'): Map<string, ScreenshotCacheEntry> => {
		const result = new Map<string, ScreenshotCacheEntry>()
		for (const [key, entry] of cache) {
			if (key.endsWith(`::${theme}`)) {
				result.set(entry.nodeId, entry)
			}
		}
		return result
	}

	const invalidate = (nodeId: string, theme?: 'dark' | 'light') => {
		if (theme) {
			cache.delete(getCacheKey(nodeId, theme))
		} else {
			cache.delete(getCacheKey(nodeId, 'dark'))
			cache.delete(getCacheKey(nodeId, 'light'))
		}
	}

	const invalidateTheme = (theme: 'dark' | 'light') => {
		for (const key of Array.from(cache.keys())) {
			if (key.endsWith(`::${theme}`)) {
				cache.delete(key)
			}
		}
	}

	const pruneToValidNodes = (validNodeIds: Set<string>) => {
		for (const key of Array.from(cache.keys())) {
			const nodeId = key.split('::')[0]
			if (!validNodeIds.has(nodeId)) {
				cache.delete(key)
			}
		}
	}

	const setActiveTheme = (theme: 'dark' | 'light') => {
		activeTheme = theme
	}

	const getActiveTheme = (): 'dark' | 'light' => activeTheme

	const setWarmupProgressCallback = (cb: ((info: WarmupProgressInfo) => void) | null) => {
		onWarmupProgress = cb
	}

	const countPendingForTheme = (theme: 'dark' | 'light'): number => {
		let count = 0
		for (const t of highPriorityQueue) if (t.theme === theme) count++
		for (const t of normalPriorityQueue) if (t.theme === theme) count++
		for (const t of lowPriorityQueue) if (t.theme === theme) count++
		for (const [, v] of inFlight) {
			if (extractThemeFromVersion(v.version) === theme) count++
		}
		return count
	}

	const abortAllInFlight = () => {
		if (globalAbortController) {
			globalAbortController.abort()
		}
		globalAbortController = new AbortController()
		for (const [, entry] of inFlight) {
			entry.abortController.abort()
		}
	}

	const capture = async (
		slot: ScreenshotSlot,
		sourceEl: HTMLElement,
		width: number,
		height: number,
		padding: number,
		captureTheme: 'dark' | 'light',
		isWarmup: boolean = false,
		signal?: AbortSignal
	): Promise<HTMLCanvasElement | null> => {
		checkAbort(signal)
		const host = slot.host
		host.setAttribute('data-theme', captureTheme)
		while (host.firstChild) {
			host.removeChild(host.firstChild)
		}

		await yieldToMain(signal)
		checkAbort(signal)

		const totalW = width + padding * 2
		const totalH = height + padding * 2

		const wrapper = document.createElement('div')
		wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
		wrapper.setAttribute('data-theme', captureTheme)
		wrapper.style.position = 'absolute'
		wrapper.style.left = '0'
		wrapper.style.top = '0'
		wrapper.style.width = `${totalW}px`
		wrapper.style.height = `${totalH}px`
		wrapper.style.overflow = 'visible'
		wrapper.style.margin = '0'
		wrapper.style.padding = '0'
		wrapper.style.transform = 'none'
		wrapper.style.background = 'transparent'
		wrapper.style.backgroundColor = 'transparent'

		const clone = sourceEl.cloneNode(true) as HTMLElement

		clone.style.position = 'absolute'
		clone.style.left = `${padding}px`
		clone.style.top = `${padding}px`
		clone.style.right = 'auto'
		clone.style.bottom = 'auto'
		clone.style.margin = '0'
		clone.style.transform = 'none'
		clone.style.transformOrigin = 'top left'
		clone.style.boxSizing = 'border-box'

		if (isWarmup) {
			await yieldToMain(signal)
			checkAbort(signal)
		}

		const stripSelectors = [
			'.wf-anchors',
			'.wf-anchors-in',
			'.wf-anchors-out',
			'.wf-resize',
			'.wf-node-toolbar',
			'.wf-node-inline-chat',
			'.wf-node-particles'
		]
		for (const sel of stripSelectors) {
			clone.querySelectorAll(sel).forEach((el) => el.remove())
		}

		const sourceTextareas = sourceEl.querySelectorAll('textarea')
		const cloneTextareas = clone.querySelectorAll('textarea')
		sourceTextareas.forEach((src, i) => {
			const dst = cloneTextareas[i]
			if (dst && src) {
				dst.textContent = src.value
				dst.value = src.value
				dst.setAttribute('value', src.value)
			}
		})

		const sourceInputs = sourceEl.querySelectorAll('input')
		const cloneInputs = clone.querySelectorAll('input')
		sourceInputs.forEach((src, i) => {
			const dst = cloneInputs[i]
			if (
				dst &&
				src &&
				(src.type === 'text' ||
					src.type === 'number' ||
					src.type === 'search' ||
					src.type === 'email' ||
					src.type === 'password' ||
					src.type === 'url' ||
					src.type === 'tel')
			) {
				dst.setAttribute('value', src.value)
			}
		})

		if (isWarmup) {
			await yieldToMain(signal)
			checkAbort(signal)
		}

		const sourceCanvases = sourceEl.querySelectorAll('canvas')
		const cloneCanvases = clone.querySelectorAll('canvas')
		sourceCanvases.forEach((src, i) => {
			const dst = cloneCanvases[i]
			if (dst && src) {
				try {
					const dataUrl = src.toDataURL('image/png')
					const img = document.createElement('img')
					img.src = dataUrl
					img.style.width = dst.style.width || `${src.width}px`
					img.style.height = dst.style.height || `${src.height}px`
					img.style.objectFit = 'contain'
					dst.replaceWith(img)
				} catch {}
			}
		})

		const sourceVideos = sourceEl.querySelectorAll('video')
		const cloneVideos = clone.querySelectorAll('video')
		sourceVideos.forEach((src, i) => {
			const dst = cloneVideos[i]
			if (dst && src && src.readyState >= 2 && src.videoWidth > 0 && src.videoHeight > 0) {
				try {
					const vw = src.videoWidth
					const vh = src.videoHeight
					const canvas = document.createElement('canvas')
					canvas.width = vw
					canvas.height = vh
					const ctx = canvas.getContext('2d')
					if (ctx) {
						ctx.drawImage(src, 0, 0, vw, vh)
						const dataUrl = canvas.toDataURL('image/png')
						const img = document.createElement('img')
						img.src = dataUrl
						img.style.width = '100%'
						img.style.height = '100%'
						img.style.objectFit = getComputedStyle(src).objectFit || 'cover'
						dst.replaceWith(img)
					}
				} catch {}
			}
		})

		wrapper.appendChild(clone)
		host.appendChild(wrapper)

		prepareClonedImages(sourceEl, wrapper)

		await enhancedWaitForAllImages(wrapper)
		checkAbort(signal)

		await enhancedConvertImagesToDataUrls(wrapper)
		checkAbort(signal)

		if (isWarmup) {
			await yieldToMain(signal)
			checkAbort(signal)
		}

		await __test__inlineAllStyles(clone, clone, signal)
		checkAbort(signal)

		if (isWarmup) {
			await yieldToMain(signal)
			checkAbort(signal)
		}

		try {
			const serializedWrapper = document.createElement('div')
			serializedWrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
			serializedWrapper.setAttribute('data-theme', captureTheme)
			serializedWrapper.style.width = `${totalW}px`
			serializedWrapper.style.height = `${totalH}px`
			serializedWrapper.style.overflow = 'visible'
			serializedWrapper.style.background = 'transparent'
			serializedWrapper.style.backgroundColor = 'transparent'
			serializedWrapper.style.margin = '0'
			serializedWrapper.style.padding = '0'
			serializedWrapper.style.position = 'absolute'
			serializedWrapper.style.left = '0'
			serializedWrapper.style.top = '0'

			const styleEl = document.createElement('style')
			styleEl.setAttribute('type', 'text/css')
			styleEl.textContent = getDocumentStyles()
			serializedWrapper.appendChild(styleEl)

			const clonedForSerialize = wrapper.cloneNode(true) as HTMLElement
			serializedWrapper.appendChild(clonedForSerialize)

			const xhtml = new XMLSerializer().serializeToString(serializedWrapper)

			const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">
          <foreignObject width="100%" height="100%">
            ${xhtml}
          </foreignObject>
        </svg>
      `
			const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
			checkAbort(signal)
			const canvas = await renderSvgToCanvas(svgDataUrl, totalW, totalH, signal)
			return canvas
		} finally {
			while (host.firstChild) {
				host.removeChild(host.firstChild)
			}
		}
	}

	const dequeueTask = (): ScreenshotTask | null => {
		if (highPriorityQueue.length > 0) return highPriorityQueue.shift()!
		if (normalPriorityQueue.length > 0) return normalPriorityQueue.shift()!
		if (lowPriorityQueue.length > 0) return lowPriorityQueue.shift()!
		return null
	}

	const getQueueLength = () =>
		highPriorityQueue.length + normalPriorityQueue.length + lowPriorityQueue.length

	let completedTaskCount = 0
	let totalWarmupTaskCount = 0
	let currentWarmupTheme: 'dark' | 'light' = 'dark'

	const reportWarmupProgress = () => {
		if (onWarmupProgress) {
			onWarmupProgress({
				completed: completedTaskCount,
				total: totalWarmupTaskCount,
				theme: currentWarmupTheme
			})
		}
	}

	const processNext = () => {
		if (isPaused) {
			return
		}
		if (getQueueLength() === 0 || active >= maxConcurrency.value) {
			return
		}

		const slot = acquireSlot()
		if (!slot) return

		const task = dequeueTask()
		if (!task) {
			releaseSlot(slot)
			return
		}

		active++

		const isWarmupTask = task.priority === 'low' || burstMode
		const taskAbortController = new AbortController()

		const inflightKey = `${task.nodeId}::${task.theme}`
		const inflightResolves: Array<(e: ScreenshotCacheEntry | null) => void> = []
		inFlight.set(inflightKey, {
			version: task.version,
			resolves: inflightResolves,
			abortController: taskAbortController
		})
		inflightResolves.push(task.resolve)
		;(async () => {
			const startTime = performance.now()
			try {
				const cached = getCached(task.nodeId, task.version)
				if (cached) {
					releaseSlot(slot)
					completedTaskCount++
					reportWarmupProgress()
					for (const r of inflightResolves) r(cached)
					return
				}

				const canvas = await capture(
					slot,
					task.element,
					task.width,
					task.height,
					task.padding,
					task.theme,
					isWarmupTask,
					taskAbortController.signal
				)
				releaseSlot(slot)

				if (!canvas) {
					completedTaskCount++
					reportWarmupProgress()
					for (const r of inflightResolves) r(null)
					return
				}

				if (isWarmupTask) {
					await yieldToMain()
				}

				const entry: ScreenshotCacheEntry = {
					nodeId: task.nodeId,
					version: task.version,
					theme: task.theme,
					dataUrl: canvas.toDataURL('image/png'),
					width: canvas.width,
					height: canvas.height,
					padding: task.padding,
					capturedAt: Date.now()
				}
				cache.set(getCacheKey(task.nodeId, task.theme), entry)
				completedTaskCount++
				reportWarmupProgress()
				for (const r of inflightResolves) r(entry)
			} catch (err) {
				releaseSlot(slot)
				if (err instanceof AbortError) {
					for (const r of inflightResolves) r(null)
				} else {
					console.warn('[ScreenshotPool] capture failed for node:', task.nodeId, err)
					completedTaskCount++
					reportWarmupProgress()
					for (const r of inflightResolves) r(null)
				}
			} finally {
				inFlight.delete(inflightKey)
				active--

				if (!isPaused) {
					if (task.priority === 'high') {
						scheduleMicrotask(processNext)
					} else {
						scheduleWork(processNext, task.priority)
					}
				}
			}
		})()
	}

	const process = async () => {
		ensureSlots(maxConcurrency.value)

		if (!processing) {
			processing = true
			const checkComplete = () => {
				if (active === 0 && getQueueLength() === 0) {
					processing = false
				} else {
					setTimeout(checkComplete, 16)
				}
			}
			setTimeout(checkComplete, 16)
		}

		if (isPaused) return

		const slotsAvailable = maxConcurrency.value - active
		const toStart = Math.min(slotsAvailable, getQueueLength())
		for (let i = 0; i < toStart; i++) {
			processNext()
		}
	}

	const queueScreenshot = (
		nodeId: string,
		element: HTMLElement,
		version: string,
		width: number,
		height: number,
		padding: number = SCREENSHOT_PADDING,
		priority: ScreenshotPriority = 'normal'
	): Promise<ScreenshotCacheEntry | null> => {
		return new Promise((resolve) => {
			const theme = extractThemeFromVersion(version)
			const cached = getCached(nodeId, version)
			if (cached) {
				resolve(cached)
				return
			}

			if (isPaused && priority !== 'high') {
				resolve(null)
				return
			}

			const inflightKey = `${nodeId}::${theme}`
			const inflight = inFlight.get(inflightKey)
			if (inflight && inflight.version === version) {
				inflight.resolves.push(resolve)
				return
			}

			const existingTask = [...highPriorityQueue, ...normalPriorityQueue, ...lowPriorityQueue].find(
				(x) => x.nodeId === nodeId && x.theme === theme
			)

			if (existingTask) {
				existingTask.element = element
				existingTask.version = version
				existingTask.width = width
				existingTask.height = height
				existingTask.padding = padding
				if (priority === 'high' || (priority === 'normal' && existingTask.priority === 'low')) {
					existingTask.priority = priority
				}
				const originalResolve = existingTask.resolve
				existingTask.resolve = (entry) => {
					originalResolve(entry)
					resolve(entry)
				}
				if (burstMode && !isPaused) {
					ensureSlots(maxConcurrency.value)
					const slotsAvailable = maxConcurrency.value - active
					if (slotsAvailable > 0) {
						const toStart = Math.min(slotsAvailable, getQueueLength())
						for (let i = 0; i < toStart; i++) processNext()
					}
				}
				return
			}

			const task: ScreenshotTask = {
				nodeId,
				theme,
				element,
				version,
				width,
				height,
				padding,
				priority,
				resolve
			}

			if (priority === 'high') {
				highPriorityQueue.push(task)
			} else if (priority === 'low') {
				lowPriorityQueue.push(task)
			} else {
				normalPriorityQueue.push(task)
			}

			if (burstMode && !isPaused) {
				ensureSlots(maxConcurrency.value)
				const slotsAvailable = maxConcurrency.value - active
				if (slotsAvailable > 0) {
					const toStart = Math.min(slotsAvailable, getQueueLength())
					for (let i = 0; i < toStart; i++) processNext()
				}
			} else {
				setTimeout(process, QUEUE_DELAY_MS)
			}
		})
	}

	const awaitQueueDrained = (): Promise<void> => {
		return new Promise((resolve) => {
			const check = () => {
				if (active === 0 && getQueueLength() === 0) {
					resolve()
				} else {
					setTimeout(check, 16)
				}
			}
			setTimeout(check, 16)
		})
	}

	const prefillCache = (
		nodeId: string,
		version: string,
		dataUrl: string,
		width: number = 0,
		height: number = 0,
		padding: number = SCREENSHOT_PADDING
	) => {
		const theme = extractThemeFromVersion(version)
		const key = getCacheKey(nodeId, theme)
		const existing = cache.get(key)
		if (existing && existing.version === version) return
		cache.set(key, {
			nodeId,
			version,
			theme,
			dataUrl,
			width,
			height,
			padding,
			capturedAt: Date.now()
		})
	}

	const setConcurrency = (n: number) => {
		const newVal = Math.max(1, Math.min(MAX_CONCURRENT_CAPTURES, Math.round(n)))
		if (newVal !== maxConcurrency.value) {
			maxConcurrency.value = newVal
			ensureSlots(newVal)
			if (processing && !isPaused) {
				setTimeout(process, 0)
			}
		}
	}

	const resetConcurrency = () => {
		setConcurrency(getIdealConcurrency())
	}

	const setBurstMode = (enabled: boolean) => {
		burstMode = enabled
		if (enabled && !isPaused) {
			ensureSlots(maxConcurrency.value)
			const slotsAvailable = maxConcurrency.value - active
			if (slotsAvailable > 0 && getQueueLength() > 0) {
				const toStart = Math.min(slotsAvailable, getQueueLength())
				for (let i = 0; i < toStart; i++) processNext()
			}
		}
	}

	const pause = () => {
		isPaused = true
		if (resumeTimer) {
			clearTimeout(resumeTimer)
			resumeTimer = null
		}
		abortAllInFlight()
		highPriorityQueue.length = 0
		normalPriorityQueue.length = 0
		lowPriorityQueue.length = 0
	}

	const resume = (delayMs: number = 200) => {
		if (resumeTimer) {
			clearTimeout(resumeTimer)
		}
		resumeTimer = setTimeout(() => {
			isPaused = false
			resumeTimer = null
			process()
		}, delayMs)
	}

	const isInteractionPaused = () => isPaused

	const beginWarmupTracking = (theme: 'dark' | 'light') => {
		currentWarmupTheme = theme
		completedTaskCount = 0
		totalWarmupTaskCount = countPendingForTheme(theme)
		reportWarmupProgress()
	}

	const invalidateAll = () => {
		cache.clear()
		highPriorityQueue.length = 0
		normalPriorityQueue.length = 0
		lowPriorityQueue.length = 0
		inFlight.clear()
	}

	const cancelPending = () => {
		highPriorityQueue.length = 0
		normalPriorityQueue.length = 0
		lowPriorityQueue.length = 0
		abortAllInFlight()
	}

	const cancelPendingForTheme = (theme: 'dark' | 'light') => {
		const filterByTheme = (arr: ScreenshotTask[]) => {
			for (let i = arr.length - 1; i >= 0; i--) {
				if (arr[i].theme === theme) arr.splice(i, 1)
			}
		}
		filterByTheme(highPriorityQueue)
		filterByTheme(normalPriorityQueue)
		filterByTheme(lowPriorityQueue)
		for (const [key, entry] of inFlight) {
			if (key.endsWith(`::${theme}`)) {
				entry.abortController.abort()
				inFlight.delete(key)
			}
		}
	}

	const cleanup = () => {
		abortAllInFlight()
		clearAllSlots()
		cleanupSlots()
		cache.clear()
		highPriorityQueue.length = 0
		normalPriorityQueue.length = 0
		lowPriorityQueue.length = 0
		inFlight.clear()
		processing = false
		active = 0
		burstMode = false
		onWarmupProgress = null
	}

	return {
		getCachedScreenshot: getCached,
		hasCachedScreenshot: hasCached,
		hasCachedForTheme,
		getCachedForTheme,
		getAllCachedForTheme,
		invalidateScreenshot: invalidate,
		invalidateTheme,
		invalidateAll,
		cancelPending,
		cancelPendingForTheme,
		pruneToValidNodes,
		prefillCache,
		queueScreenshot,
		awaitQueueDrained,
		setConcurrency,
		resetConcurrency,
		setBurstMode,
		pause,
		resume,
		isInteractionPaused,
		getWarmupConcurrency,
		setActiveTheme,
		getActiveTheme,
		setWarmupProgressCallback,
		beginWarmupTracking,
		getStats: () => ({
			cacheSize: cache.size,
			queueHigh: highPriorityQueue.length,
			queueNormal: normalPriorityQueue.length,
			queueLow: lowPriorityQueue.length,
			queueLength: getQueueLength(),
			activeCaptures: active,
			maxConcurrency: maxConcurrency.value
		}),
		cleanup
	}
}

export type NodeScreenshotPool = ReturnType<typeof createNodeScreenshotPool>
