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
 */

import { ref } from 'vue'

export interface ScreenshotCacheEntry {
	nodeId: string
	version: string
	dataUrl: string
	width: number
	height: number
	padding: number
	capturedAt: number
}

export type ScreenshotPriority = 'high' | 'normal' | 'low'

const BASE_CONCURRENT_CAPTURES = 1
const MAX_CONCURRENT_CAPTURES = 8
const HIGH_PRIORITY_FRAME_TIME_MS = 16
const NORMAL_PRIORITY_FRAME_TIME_MS = 8
const LOW_PRIORITY_FRAME_TIME_MS = 5
const IDLE_CALLBACK_TIMEOUT = 50

const getIdealConcurrency = () => {
	try {
		const cores = navigator.hardwareConcurrency || 4
		return Math.min(
			MAX_CONCURRENT_CAPTURES,
			Math.max(BASE_CONCURRENT_CAPTURES, Math.floor(cores / 4))
		)
	} catch {
		return 2
	}
}

const getWarmupConcurrency = () => {
	try {
		const cores = navigator.hardwareConcurrency || 4
		return Math.min(MAX_CONCURRENT_CAPTURES, Math.max(4, cores - 1))
	} catch {
		return 4
	}
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

const waitForAllImages = (root: HTMLElement): Promise<void> => {
	return new Promise((resolve) => {
		const imgs = Array.from(root.querySelectorAll('img'))
		if (imgs.length === 0) return resolve()
		let done = false
		let loaded = 0
		const finish = () => {
			if (!done) {
				done = true
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

const inlineAllStyles = (source: Element, clone: Element) => {
	const sw = document.createTreeWalker(source, NodeFilter.SHOW_ELEMENT)
	const cw = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT)
	let sn: Node | null = sw.currentNode
	let cn: Node | null = cw.currentNode

	// 需要跳过的属性（交互类、非视觉类）
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
		'outline-offset'
	])

	while (sn && cn) {
		const sEl = sn as HTMLElement | SVGElement
		const cEl = cn as HTMLElement | SVGElement

		if (
			(sEl instanceof HTMLElement || sEl instanceof SVGElement) &&
			(cEl instanceof HTMLElement || cEl instanceof SVGElement)
		) {
			const computed = window.getComputedStyle(sEl)
			const props: string[] = []

			// 遍历所有计算样式属性并内联（不使用预定义列表，保证完整性）
			for (let i = 0; i < computed.length; i++) {
				const prop = computed[i]
				if (skipProps.has(prop)) continue
				try {
					const val = computed.getPropertyValue(prop)
					if (val) {
						props.push(`${prop}: ${val}`)
					}
				} catch {}
			}

			cEl.setAttribute('style', props.join('; '))
			// 保留class和id，因为我们注入了完整的样式表
			// 不remove class/id，让选择器可以正常工作
		}

		if (cEl instanceof HTMLImageElement) {
			cEl.crossOrigin = 'anonymous'
		}

		sn = sw.nextNode()
		cn = cw.nextNode()
	}
}

const convertImagesToDataUrls = async (root: HTMLElement): Promise<void> => {
	const imgs = Array.from(root.querySelectorAll('img'))
	if (imgs.length === 0) return
	await Promise.all(
		imgs.map((img) => {
			return new Promise<void>((resolve) => {
				try {
					if (!img.src || img.src.startsWith('data:')) {
						resolve()
						return
					}
					const doConvert = () => {
						try {
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
						resolve()
					}
					if (img.complete && img.naturalWidth > 0) {
						doConvert()
					} else {
						img.addEventListener('load', doConvert, { once: true })
						img.addEventListener('error', () => resolve(), { once: true })
						setTimeout(() => resolve(), 1000)
					}
				} catch {
					resolve()
				}
			})
		})
	)
}

const renderSvgToCanvas = (
	svgDataUrl: string,
	width: number,
	height: number
): Promise<HTMLCanvasElement> => {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.crossOrigin = 'anonymous'
		img.onload = () => {
			const canvas = document.createElement('canvas')
			canvas.width = width
			canvas.height = height
			const ctx = canvas.getContext('2d')
			if (!ctx) {
				reject(new Error('Failed to get 2d context'))
				return
			}
			ctx.clearRect(0, 0, width, height)
			ctx.drawImage(img, 0, 0, width, height)
			resolve(canvas)
		}
		img.onerror = () => reject(new Error('Failed to load SVG image'))
		img.src = svgDataUrl
	})
}

const scheduleWork = (fn: () => void, priority: ScreenshotPriority) => {
	const timeout = priority === 'high' ? 0 : priority === 'normal' ? 16 : 50

	if (typeof window.requestIdleCallback === 'function' && priority !== 'high') {
		window.requestIdleCallback(() => fn(), { timeout: IDLE_CALLBACK_TIMEOUT })
	} else {
		setTimeout(fn, timeout)
	}
}

export const createNodeScreenshotPool = () => {
	const maxConcurrency = ref<number>(getIdealConcurrency())
	const cache = new Map<string, ScreenshotCacheEntry>()
	const highPriorityQueue: ScreenshotTask[] = []
	const normalPriorityQueue: ScreenshotTask[] = []
	const lowPriorityQueue: ScreenshotTask[] = []
	const inFlight = new Map<
		string,
		{ version: string; resolves: Array<(e: ScreenshotCacheEntry | null) => void> }
	>()

	let processing = false
	let active = 0
	let burstMode = false

	const getCached = (nodeId: string, version: string) => {
		const e = cache.get(nodeId)
		return e && e.version === version ? e : null
	}
	const hasCached = (nodeId: string, version: string) => !!getCached(nodeId, version)
	const invalidate = (nodeId: string) => cache.delete(nodeId)

	const pruneToValidNodes = (validNodeIds: Set<string>) => {
		for (const cachedId of Array.from(cache.keys())) {
			if (!validNodeIds.has(cachedId)) {
				cache.delete(cachedId)
			}
		}
	}

	const capture = async (
		slot: ScreenshotSlot,
		sourceEl: HTMLElement,
		width: number,
		height: number,
		padding: number
	): Promise<HTMLCanvasElement | null> => {
		const host = slot.host
		while (host.firstChild) {
			host.removeChild(host.firstChild)
		}

		const totalW = width + padding * 2
		const totalH = height + padding * 2

		const wrapper = document.createElement('div')
		wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
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

		await waitForAllImages(wrapper)

		await convertImagesToDataUrls(wrapper)

		inlineAllStyles(clone, clone)

		try {
			const serializedWrapper = document.createElement('div')
			serializedWrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
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

			// 注入完整CSS样式表，确保class选择器和组件样式正常工作
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
			const canvas = await renderSvgToCanvas(svgDataUrl, totalW, totalH)
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

	const processNext = () => {
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

		const inflightResolves: Array<(e: ScreenshotCacheEntry | null) => void> = []
		inFlight.set(task.nodeId, { version: task.version, resolves: inflightResolves })
		inflightResolves.push(task.resolve)
		;(async () => {
			const startTime = performance.now()
			try {
				const cached = getCached(task.nodeId, task.version)
				if (cached) {
					releaseSlot(slot)
					for (const r of inflightResolves) r(cached)
					return
				}

				const canvas = await capture(slot, task.element, task.width, task.height, task.padding)
				releaseSlot(slot)

				if (!canvas) {
					for (const r of inflightResolves) r(null)
					return
				}

				const entry: ScreenshotCacheEntry = {
					nodeId: task.nodeId,
					version: task.version,
					dataUrl: canvas.toDataURL('image/png'),
					width: canvas.width,
					height: canvas.height,
					padding: task.padding,
					capturedAt: Date.now()
				}
				cache.set(task.nodeId, entry)
				for (const r of inflightResolves) r(entry)
			} catch (err) {
				console.warn('[ScreenshotPool] capture failed for node:', task.nodeId, err)
				releaseSlot(slot)
				for (const r of inflightResolves) r(null)
			} finally {
				inFlight.delete(task.nodeId)
				active--
				if (burstMode) {
					processNext()
				} else {
					const elapsed = performance.now() - startTime
					const frameBudget =
						task.priority === 'high'
							? HIGH_PRIORITY_FRAME_TIME_MS
							: task.priority === 'normal'
								? NORMAL_PRIORITY_FRAME_TIME_MS
								: LOW_PRIORITY_FRAME_TIME_MS

					if (elapsed > frameBudget) {
						scheduleWork(processNext, task.priority)
					} else {
						processNext()
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
			const cached = getCached(nodeId, version)
			if (cached) {
				resolve(cached)
				return
			}

			const inflight = inFlight.get(nodeId)
			if (inflight && inflight.version === version) {
				inflight.resolves.push(resolve)
				return
			}

			const existingTask = [...highPriorityQueue, ...normalPriorityQueue, ...lowPriorityQueue].find(
				(x) => x.nodeId === nodeId
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
				if (burstMode) {
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

			if (burstMode) {
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
		const existing = cache.get(nodeId)
		if (existing && existing.version === version) return
		cache.set(nodeId, {
			nodeId,
			version,
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
			if (processing) {
				setTimeout(process, 0)
			}
		}
	}

	const resetConcurrency = () => {
		setConcurrency(getIdealConcurrency())
	}

	const setBurstMode = (enabled: boolean) => {
		burstMode = enabled
		if (enabled) {
			ensureSlots(maxConcurrency.value)
			const slotsAvailable = maxConcurrency.value - active
			if (slotsAvailable > 0 && getQueueLength() > 0) {
				const toStart = Math.min(slotsAvailable, getQueueLength())
				for (let i = 0; i < toStart; i++) processNext()
			}
		}
	}

	const cleanup = () => {
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
	}

	return {
		getCachedScreenshot: getCached,
		hasCachedScreenshot: hasCached,
		invalidateScreenshot: invalidate,
		pruneToValidNodes,
		prefillCache,
		queueScreenshot,
		awaitQueueDrained,
		setConcurrency,
		resetConcurrency,
		setBurstMode,
		getWarmupConcurrency,
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
