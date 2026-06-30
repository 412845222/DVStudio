/**
 * Canvas Node Renderer - Canvas2D节点渲染器
 * 
 * 功能:
 * 1. 使用Canvas2D绘制截图节点
 * 2. 视口裁剪减少绘制量
 * 3. 圆角裁剪
 * 4. 批量绘制优化
 */

import type { CanvasScreenshotPool, CanvasScreenshotEntry } from './canvasScreenshotPool'

export interface VisibleNodeEntry {
	id: string
	worldX: number
	worldY: number
	width: number
	height: number
	radius: number
	opacity?: number
}

export interface ViewportState {
	zoom: number
	panX: number
	panY: number
}

export interface RenderOptions {
	/** 是否绘制选中边框 */
	drawSelectionBorder?: boolean
	/** 是否绘制hover边框 */
	drawHoverBorder?: boolean
	/** 选中边框颜色 */
	selectionBorderColor?: string
	/** hover边框颜色 */
	hoverBorderColor?: string
	/** 边框宽度 */
	borderWidth?: number
}

const DEFAULT_RENDER_OPTIONS: Required<RenderOptions> = {
	drawSelectionBorder: true,
	drawHoverBorder: true,
	selectionBorderColor: '#3b82f6',
	hoverBorderColor: '#94a3b8',
	borderWidth: 2
}

export class CanvasNodeRenderer {
	private canvas: HTMLCanvasElement
	private ctx: CanvasRenderingContext2D
	private pool: CanvasScreenshotPool
	private dpr: number
	private viewport: ViewportState = { zoom: 1, panX: 0, panY: 0 }
	private dirty = false
	private options: Required<RenderOptions>
	private selectedNodeIds = new Set<string>()
	private hoveredNodeId: string | null = null

	constructor(
		canvas: HTMLCanvasElement,
		pool: CanvasScreenshotPool,
		options: RenderOptions = {}
	) {
		this.canvas = canvas
		this.pool = pool

		const ctx = canvas.getContext('2d')
		if (!ctx) {
			throw new Error('Failed to get 2d context')
		}
		this.ctx = ctx

		// 限制DPR，减少内存占用
		this.dpr = Math.min(window.devicePixelRatio || 1, 2)

		this.options = { ...DEFAULT_RENDER_OPTIONS, ...options }
	}

	/**
	 * 设置视口状态
	 */
	setViewport(viewport: ViewportState): void {
		const changed =
			this.viewport.zoom !== viewport.zoom ||
			this.viewport.panX !== viewport.panX ||
			this.viewport.panY !== viewport.panY

		this.viewport = viewport

		if (changed) {
			this.markDirty()
		}
	}

	/**
	 * 设置选中节点
	 */
	setSelectedNodes(nodeIds: string[]): void {
		this.selectedNodeIds = new Set(nodeIds)
		this.markDirty()
	}

	/**
	 * 设置悬停节点
	 */
	setHoveredNode(nodeId: string | null): void {
		if (this.hoveredNodeId !== nodeId) {
			this.hoveredNodeId = nodeId
			this.markDirty()
		}
	}

	/**
	 * 标记需要重绘
	 */
	markDirty(): void {
		this.dirty = true
	}

	/**
	 * 渲染
	 */
	render(allNodes: VisibleNodeEntry[]): void {
		if (!this.dirty) {
			return
		}
		this.dirty = false

		const { width, height } = this.canvas
		const canvasW = width / this.dpr
		const canvasH = height / this.dpr

		// 清空画布 (透明背景)
		this.ctx.clearRect(0, 0, canvasW, canvasH)

		// 视口裁剪
		const viewportNodes = this.cullNodesOutsideViewport(allNodes)

		if (viewportNodes.length === 0) {
			return
		}

		// 按Y坐标排序 (简单的Painter's Algorithm)
		viewportNodes.sort((a, b) => a.worldY - b.worldY)

		// 批量绘制
		this.ctx.save()
		this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)

		for (const node of viewportNodes) {
			this.drawScreenshotNode(node)
		}

		this.ctx.restore()
	}

	/**
	 * 绘制单个截图节点
	 */
	private drawScreenshotNode(node: VisibleNodeEntry): void {
		const entry = this.pool.getEntry(node.id)
		if (!entry) return

		const { x, y } = this.worldToScreen(node.worldX, node.worldY)
		const zoom = this.viewport.zoom

		// 计算屏幕尺寸
		const screenW = entry.width * zoom
		const screenH = entry.height * zoom
		const screenRadius = node.radius * zoom

		// 裁剪区域
		const left = x - screenW / 2
		const top = y - screenH / 2

		this.ctx.save()

		// 透明度
		if (node.opacity !== undefined && node.opacity < 1) {
			this.ctx.globalAlpha = node.opacity
		}

		// 圆角裁剪
		this.roundRect(left, top, screenW, screenH, screenRadius)
		this.ctx.clip()

		// 绘制图片
		this.ctx.drawImage(entry.bitmap, left, top, screenW, screenH)

		this.ctx.restore()

		// 绘制选中/悬停边框
		this.drawNodeBorder(node, x, y, screenW, screenH, screenRadius)
	}

	/**
	 * 绘制节点边框
	 */
	private drawNodeBorder(
		node: VisibleNodeEntry,
		x: number,
		y: number,
		screenW: number,
		screenH: number,
		screenRadius: number
	): void {
		const isSelected = this.selectedNodeIds.has(node.id)
		const isHovered = this.hoveredNodeId === node.id

		if (!isSelected && !isHovered) return

		this.ctx.save()

		// 边框样式
		this.ctx.lineWidth = this.options.borderWidth * this.dpr
		this.ctx.lineJoin = 'round'

		if (isSelected) {
			this.ctx.strokeStyle = this.options.selectionBorderColor
		} else if (isHovered) {
			this.ctx.strokeStyle = this.options.hoverBorderColor
		}

		// 绘制圆角边框
		this.roundRect(
			x - screenW / 2,
			y - screenH / 2,
			screenW,
			screenH,
			screenRadius
		)
		this.ctx.stroke()

		this.ctx.restore()
	}

	/**
	 * 圆角矩形路径
	 */
	private roundRect(x: number, y: number, w: number, h: number, r: number): void {
		const maxR = Math.min(w, h) / 2
		r = Math.min(r, maxR)

		if (r <= 0) {
			// 无圆角，使用普通矩形
			this.ctx.beginPath()
			this.ctx.rect(x, y, w, h)
			this.ctx.closePath()
			return
		}

		this.ctx.beginPath()
		this.ctx.moveTo(x + r, y)
		this.ctx.lineTo(x + w - r, y)
		this.ctx.quadraticCurveTo(x + w, y, x + w, y + r)
		this.ctx.lineTo(x + w, y + h - r)
		this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
		this.ctx.lineTo(x + r, y + h)
		this.ctx.quadraticCurveTo(x, y + h, x, y + h - r)
		this.ctx.lineTo(x, y + r)
		this.ctx.quadraticCurveTo(x, y, x + r, y)
		this.ctx.closePath()
	}

	/**
	 * 世界坐标转屏幕坐标
	 */
	private worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
		const { width, height } = this.canvas
		const canvasW = width / this.dpr
		const canvasH = height / this.dpr

		return {
			x: canvasW / 2 + this.viewport.panX + worldX * this.viewport.zoom,
			y: canvasH / 2 + this.viewport.panY + worldY * this.viewport.zoom
		}
	}

	/**
	 * 屏幕坐标转世界坐标
	 */
	screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
		const { width, height } = this.canvas
		const canvasW = width / this.dpr
		const canvasH = height / this.dpr

		return {
			x: (screenX - canvasW / 2 - this.viewport.panX) / this.viewport.zoom,
			y: (screenY - canvasH / 2 - this.viewport.panY) / this.viewport.zoom
		}
	}

	/**
	 * 视口裁剪: 只渲染视口内的节点
	 */
	private cullNodesOutsideViewport(allNodes: VisibleNodeEntry[]): VisibleNodeEntry[] {
		const { width, height } = this.canvas
		const canvasW = width / this.dpr
		const canvasH = height / this.dpr
		const zoom = this.viewport.zoom

		// 计算视口在世界坐标系中的矩形
		const viewportRect = this.getViewportWorldRect(canvasW, canvasH)

		// 添加边距
		const padding = 100 / zoom
		viewportRect.x0 -= padding
		viewportRect.y0 -= padding
		viewportRect.x1 += padding
		viewportRect.y1 += padding

		return allNodes.filter(node => {
			const nodeW = node.width || 240
			const nodeH = node.height || 160

			const nodeRect = {
				x0: node.worldX - nodeW / 2,
				y0: node.worldY - nodeH / 2,
				x1: node.worldX + nodeW / 2,
				y1: node.worldY + nodeH / 2
			}

			// 矩形相交检测
			return !(
				nodeRect.x1 < viewportRect.x0 ||
				nodeRect.x0 > viewportRect.x1 ||
				nodeRect.y1 < viewportRect.y0 ||
				nodeRect.y0 > viewportRect.y1
			)
		})
	}

	/**
	 * 获取视口在世界坐标系中的矩形
	 */
	getViewportWorldRect(canvasW?: number, canvasH?: number): {
		x0: number
		y0: number
		x1: number
		y1: number
	} {
		const width = canvasW ?? this.canvas.width / this.dpr
		const height = canvasH ?? this.canvas.height / this.dpr
		const zoom = this.viewport.zoom

		return {
			x0: -width / 2 / zoom - this.viewport.panX / zoom,
			y0: -height / 2 / zoom - this.viewport.panY / zoom,
			x1: width / 2 / zoom - this.viewport.panX / zoom,
			y1: height / 2 / zoom - this.viewport.panY / zoom
		}
	}

	/**
	 * 获取视口内的节点ID
	 */
	getVisibleNodeIds(allNodes: VisibleNodeEntry[]): string[] {
		return this.cullNodesOutsideViewport(allNodes).map(n => n.id)
	}

	/**
	 * 调整画布尺寸
	 */
	resize(width: number, height: number): void {
		this.canvas.width = Math.floor(width * this.dpr)
		this.canvas.height = Math.floor(height * this.dpr)
		this.canvas.style.width = `${width}px`
		this.canvas.style.height = `${height}px`
		this.markDirty()
	}

	/**
	 * 获取画布尺寸
	 */
	getSize(): { width: number; height: number } {
		return {
			width: this.canvas.width / this.dpr,
			height: this.canvas.height / this.dpr
		}
	}

	/**
	 * 清空画布
	 */
	clear(): void {
		const { width, height } = this.canvas
		this.ctx.clearRect(0, 0, width, height)
	}

	/**
	 * 设置渲染选项
	 */
	setOptions(options: Partial<RenderOptions>): void {
		this.options = { ...this.options, ...options }
		this.markDirty()
	}

	/**
	 * 获取视口状态
	 */
	getViewport(): ViewportState {
		return { ...this.viewport }
	}
}
