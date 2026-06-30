/**
 * Canvas Screenshot Pool - Canvas2D截图纹理池
 * 
 * 功能:
 * 1. 管理截图的Canvas/ImageBitmap对象
 * 2. 提供纹理的生命周期管理
 * 3. 支持动态加载和卸载
 * 4. 与IndexedDB缓存协同工作
 * 
 * 性能优化:
 * - ImageBitmap比HTMLCanvasElement性能更好
 * - 支持OffscreenCanvas (可选)
 * - 内存管理: 限制Bitmap数量和内存占用
 */

import type { ScreenshotCacheEntry } from './useNodeScreenshotPool'

export interface CanvasScreenshotEntry {
	nodeId: string
	version: string
	bitmap: ImageBitmap | HTMLCanvasElement
	width: number
	height: number
	worldX: number
	worldY: number
	radius: number
	status: 'pending' | 'loading' | 'ready' | 'error'
	capturedAt: number
}

export interface CanvasScreenshotPoolOptions {
	/** 最大Bitmap数量，默认500 */
	maxBitmapCount?: number
	/** 最大内存占用(MB)，默认200 */
	maxMemoryMB?: number
	/** 是否使用ImageBitmap，默认true，回退到Canvas */
	preferImageBitmap?: boolean
}

const DEFAULT_MAX_BITMAP_COUNT = 500
const DEFAULT_MAX_MEMORY_MB = 200

export class CanvasScreenshotPool {
	private entries = new Map<string, CanvasScreenshotEntry>()
	private loadingPromises = new Map<string, Promise<CanvasScreenshotEntry | null>>()
	private options: Required<CanvasScreenshotPoolOptions>
	private disposed = false

	constructor(options: CanvasScreenshotPoolOptions = {}) {
		this.options = {
			maxBitmapCount: options.maxBitmapCount ?? DEFAULT_MAX_BITMAP_COUNT,
			maxMemoryMB: options.maxMemoryMB ?? DEFAULT_MAX_MEMORY_MB,
			preferImageBitmap: options.preferImageBitmap ?? true
		}
	}

	/**
	 * 从截图缓存异步加载ImageBitmap
	 */
	async loadFromCache(entry: ScreenshotCacheEntry): Promise<CanvasScreenshotEntry | null> {
		if (this.disposed) return null

		const existing = this.entries.get(entry.nodeId)
		if (existing && existing.version === entry.version && existing.status === 'ready') {
			return existing
		}

		// 检查是否正在加载
		const loading = this.loadingPromises.get(entry.nodeId)
		if (loading) {
			return loading
		}

		// 创建加载Promise
		const loadPromise = this.doLoad(entry)
		this.loadingPromises.set(entry.nodeId, loadPromise)

		try {
			const result = await loadPromise
			return result
		} finally {
			this.loadingPromises.delete(entry.nodeId)
		}
	}

	private async doLoad(entry: ScreenshotCacheEntry): Promise<CanvasScreenshotEntry | null> {
		try {
			// 尝试使用ImageBitmap (推荐，性能更好)
			if (this.options.preferImageBitmap) {
				try {
					return await this.loadWithImageBitmap(entry)
				} catch (error) {
					console.warn(`[CanvasScreenshotPool] createImageBitmap failed, fallback to canvas:`, error)
					return this.loadWithCanvas(entry)
				}
			} else {
				return this.loadWithCanvas(entry)
			}
		} catch (error) {
			console.warn(`[CanvasScreenshotPool] Failed to load bitmap for node: ${entry.nodeId}`, error)
			return null
		}
	}

	/**
	 * 使用createImageBitmap加载
	 */
	private async loadWithImageBitmap(entry: ScreenshotCacheEntry): Promise<CanvasScreenshotEntry> {
		if (typeof createImageBitmap !== 'function') {
			throw new Error('createImageBitmap not supported')
		}

		const img = new Image()
		img.decoding = 'async'

		const loaded = new Promise<void>((resolve, reject) => {
			img.onload = () => resolve()
			img.onerror = () => reject(new Error(`Failed to load image for node ${entry.nodeId}`))
		})
		img.src = entry.dataUrl
		if (!img.complete) {
			await loaded
		}

		const bitmap = await createImageBitmap(img, {
			imageOrientation: 'none',
			premultiplyAlpha: 'none',
			colorSpaceConversion: 'none'
		})

		this.pruneIfNeeded()

		const canvasEntry: CanvasScreenshotEntry = {
			nodeId: entry.nodeId,
			version: entry.version,
			bitmap,
			width: entry.width || img.naturalWidth,
			height: entry.height || img.naturalHeight,
			worldX: 0,
			worldY: 0,
			radius: 8,
			status: 'ready',
			capturedAt: Date.now()
		}

		this.entries.set(entry.nodeId, canvasEntry)
		return canvasEntry
	}

	/**
	 * 回退方案: 使用HTMLCanvasElement加载
	 */
	private loadWithCanvas(entry: ScreenshotCacheEntry): CanvasScreenshotEntry | null {
		const img = new Image()
		img.src = entry.dataUrl

		const canvas = document.createElement('canvas')
		canvas.width = entry.width
		canvas.height = entry.height
		const ctx = canvas.getContext('2d')

		if (!ctx) return null

		// 同步绘制 (Image需要等待onload，这里使用阻塞方式)
		// 注意: 这可能会阻塞主线程，但Canvas通常很小，影响有限
		if (img.complete && img.naturalWidth > 0) {
			ctx.drawImage(img, 0, 0, entry.width, entry.height)
		} else {
			// 返回占位符，等待异步加载
			const canvasEntry: CanvasScreenshotEntry = {
				nodeId: entry.nodeId,
				version: entry.version,
				bitmap: canvas,
				width: entry.width,
				height: entry.height,
				worldX: 0,
				worldY: 0,
				radius: 8,
				status: 'loading',
				capturedAt: Date.now()
			}
			this.entries.set(entry.nodeId, canvasEntry)

			img.onload = () => {
				ctx.drawImage(img, 0, 0, entry.width, entry.height)
				canvasEntry.status = 'ready'
			}
			img.onerror = () => {
				canvasEntry.status = 'error'
			}

			// 内存管理
			this.pruneIfNeeded()
			return canvasEntry
		}

		// 内存管理
		this.pruneIfNeeded()

		const canvasEntry: CanvasScreenshotEntry = {
			nodeId: entry.nodeId,
			version: entry.version,
			bitmap: canvas,
			width: entry.width,
			height: entry.height,
			worldX: 0,
			worldY: 0,
			radius: 8,
			status: 'ready',
			capturedAt: Date.now()
		}

		this.entries.set(entry.nodeId, canvasEntry)
		return canvasEntry
	}

	/**
	 * 批量异步加载
	 */
	async loadBatch(
		entries: ScreenshotCacheEntry[],
		options?: {
			concurrency?: number
			onProgress?: (loaded: number, total: number) => void
		}
	): Promise<CanvasScreenshotEntry[]> {
		const total = entries.length
		const results: CanvasScreenshotEntry[] = []
		const concurrency = options?.concurrency ?? 4
		let loaded = 0

		// 分批处理
		for (let i = 0; i < total; i += concurrency) {
			if (this.disposed) break

			const batch = entries.slice(i, i + concurrency)
			const batchResults = await Promise.all(
				batch.map(entry => this.loadFromCache(entry))
			)

			for (const result of batchResults) {
				if (result) {
					results.push(result)
				}
			}

			loaded += batch.length
			options?.onProgress?.(loaded, total)
		}

		return results
	}

	/**
	 * 获取Bitmap
	 */
	getBitmap(nodeId: string): ImageBitmap | HTMLCanvasElement | null {
		const entry = this.entries.get(nodeId)
		return entry?.status === 'ready' ? entry.bitmap : null
	}

	/**
	 * 获取缓存条目
	 */
	getEntry(nodeId: string): CanvasScreenshotEntry | null {
		const entry = this.entries.get(nodeId)
		return entry?.status === 'ready' ? entry : null
	}

	/**
	 * 检查是否有Bitmap
	 */
	hasBitmap(nodeId: string): boolean {
		const entry = this.entries.get(nodeId)
		return entry?.status === 'ready' || entry?.status === 'loading'
	}

	/**
	 * 检查Bitmap是否完全就绪
	 */
	isBitmapReady(nodeId: string): boolean {
		const entry = this.entries.get(nodeId)
		return entry?.status === 'ready'
	}

	/**
	 * 更新节点位置
	 */
	updatePosition(nodeId: string, worldX: number, worldY: number): void {
		const entry = this.entries.get(nodeId)
		if (entry) {
			entry.worldX = worldX
			entry.worldY = worldY
		}
	}

	/**
	 * 批量更新节点位置
	 */
	updatePositions(positions: Array<{ nodeId: string; worldX: number; worldY: number }>): void {
		for (const pos of positions) {
			this.updatePosition(pos.nodeId, pos.worldX, pos.worldY)
		}
	}

	/**
	 * 更新节点尺寸
	 */
	updateSize(nodeId: string, width: number, height: number): void {
		const entry = this.entries.get(nodeId)
		if (entry) {
			entry.width = width
			entry.height = height
		}
	}

	/**
	 * 更新圆角半径
	 */
	updateRadius(nodeId: string, radius: number): void {
		const entry = this.entries.get(nodeId)
		if (entry) {
			entry.radius = radius
		}
	}

	/**
	 * 使缓存失效
	 */
	invalidate(nodeId: string): void {
		const entry = this.entries.get(nodeId)
		if (entry) {
			this.disposeBitmap(entry.bitmap)
			this.entries.delete(nodeId)
		}
	}

	/**
	 * 使多个缓存失效
	 */
	invalidateMany(nodeIds: string[]): void {
		for (const nodeId of nodeIds) {
			this.invalidate(nodeId)
		}
	}

	/**
	 * 裁剪到有效节点
	 */
	pruneToValidNodes(validNodeIds: Set<string>): void {
		for (const nodeId of Array.from(this.entries.keys())) {
			if (!validNodeIds.has(nodeId)) {
				this.invalidate(nodeId)
			}
		}
	}

	/**
	 * 内存管理: 卸载最旧的条目
	 */
	private pruneIfNeeded(): void {
		// 检查Bitmap数量
		if (this.entries.size > this.options.maxBitmapCount) {
			this.pruneOldest(this.entries.size - this.options.maxBitmapCount)
		}

		// 检查内存占用 (粗略估算)
		const estimatedMB = this.estimateMemoryUsage()
		if (estimatedMB > this.options.maxMemoryMB) {
			this.pruneToFit(this.options.maxMemoryMB * 0.8) // 清理到80%
		}
	}

	/**
	 * 估算内存占用(MB)
	 */
	private estimateMemoryUsage(): number {
		let bytes = 0
		for (const entry of this.entries.values()) {
			// RGBA: 4 bytes per pixel
			bytes += entry.width * entry.height * 4
		}
		return bytes / 1024 / 1024
	}

	/**
	 * 卸载最旧的N个条目
	 */
	private pruneOldest(count: number): void {
		const entries = Array.from(this.entries.values())
			.sort((a, b) => a.capturedAt - b.capturedAt)

		const toRemove = entries.slice(0, count)
		for (const entry of toRemove) {
			this.disposeBitmap(entry.bitmap)
			this.entries.delete(entry.nodeId)
		}
	}

	/**
	 * 清理到指定内存大小
	 */
	private pruneToFit(targetMemoryMB: number): void {
		const entries = Array.from(this.entries.values())
			.sort((a, b) => a.capturedAt - b.capturedAt)

		let currentMB = this.estimateMemoryUsage()
		for (const entry of entries) {
			if (currentMB <= targetMemoryMB) break

			const entryMB = (entry.width * entry.height * 4) / 1024 / 1024
			this.disposeBitmap(entry.bitmap)
			this.entries.delete(entry.nodeId)
			currentMB -= entryMB
		}
	}

	/**
	 * 释放Bitmap资源
	 */
	private disposeBitmap(bitmap: ImageBitmap | HTMLCanvasElement): void {
		try {
			if (bitmap instanceof ImageBitmap) {
				bitmap.close()
			}
			// HTMLCanvasElement会被垃圾回收，不需要手动释放
		} catch (error) {
			console.warn(`[CanvasScreenshotPool] Failed to dispose bitmap:`, error)
		}
	}

	/**
	 * 获取所有可视节点
	 */
	getAllVisibleEntries(): CanvasScreenshotEntry[] {
		return Array.from(this.entries.values()).filter(e => e.status === 'ready')
	}

	/**
	 * 获取指定视口内的节点
	 */
	getEntriesInViewport(
		viewportRect: { x0: number; y0: number; x1: number; y1: number },
		padding = 100
	): CanvasScreenshotEntry[] {
		const rect = {
			x0: viewportRect.x0 - padding,
			y0: viewportRect.y0 - padding,
			x1: viewportRect.x1 + padding,
			y1: viewportRect.y1 + padding
		}

		return this.getAllVisibleEntries().filter(entry => {
			const halfW = entry.width / 2
			const halfH = entry.height / 2

			// 节点矩形
			const nodeRect = {
				x0: entry.worldX - halfW,
				y0: entry.worldY - halfH,
				x1: entry.worldX + halfW,
				y1: entry.worldY + halfH
			}

			// 检测相交
			return !(
				nodeRect.x1 < rect.x0 ||
				nodeRect.x0 > rect.x1 ||
				nodeRect.y1 < rect.y0 ||
				nodeRect.y0 > rect.y1
			)
		})
	}

	/**
	 * 获取统计信息
	 */
	getStats(): {
		bitmapCount: number
		maxBitmapCount: number
		memoryEstimateMB: string
		loadingCount: number
		readyCount: number
		errorCount: number
	} {
		let memoryEstimate = 0
		let loadingCount = 0
		let readyCount = 0
		let errorCount = 0

		for (const entry of this.entries.values()) {
			memoryEstimate += entry.width * entry.height * 4 // RGBA

			switch (entry.status) {
				case 'loading':
					loadingCount++
					break
				case 'ready':
					readyCount++
					break
				case 'error':
					errorCount++
					break
			}
		}

		return {
			bitmapCount: this.entries.size,
			maxBitmapCount: this.options.maxBitmapCount,
			memoryEstimateMB: (memoryEstimate / 1024 / 1024).toFixed(2),
			loadingCount,
			readyCount,
			errorCount
		}
	}

	/**
	 * 设置最大Bitmap数量
	 */
	setMaxBitmapCount(count: number): void {
		this.options.maxBitmapCount = Math.max(1, count)
		this.pruneIfNeeded()
	}

	/**
	 * 设置最大内存占用
	 */
	setMaxMemoryMB(mb: number): void {
		this.options.maxMemoryMB = Math.max(1, mb)
		this.pruneIfNeeded()
	}

	/**
	 * 清理所有
	 */
	dispose(): void {
		this.disposed = true

		for (const entry of this.entries.values()) {
			this.disposeBitmap(entry.bitmap)
		}
		this.entries.clear()
		this.loadingPromises.clear()
	}
}
