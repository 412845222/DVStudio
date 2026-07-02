type TImageBitmap = ImageBitmap | HTMLCanvasElement

interface ScreenshotEntry {
	bitmap: TImageBitmap
	width: number
	height: number
}

interface SimpleScreenshotPool {
	getEntry(nodeId: string): ScreenshotEntry | null
}

export type ScreenshotPoolProvider = () => SimpleScreenshotPool | null

export interface ViewportState {
	panX: number
	panY: number
	zoom: number
}

export interface VisibleNodeEntry {
	id: string
	worldX: number
	worldY: number
	width: number
	height: number
	radius?: number
}

interface HitTestResult {
	nodeId: string | null
}

interface ViewportBounds {
	left: number
	right: number
	top: number
	bottom: number
}

export class CanvasNodeRenderer {
	private canvas: HTMLCanvasElement
	private ctx: CanvasRenderingContext2D
	private poolProvider: ScreenshotPoolProvider
	private dpr: number = 1
	private renderDpr: number = 1
	private lowQualityMode: boolean = false

	private currentViewport: ViewportState = { panX: 0, panY: 0, zoom: 1 }
	private currentNodes: VisibleNodeEntry[] = []

	constructor(
		canvas: HTMLCanvasElement,
		poolProvider: ScreenshotPoolProvider
	) {
		this.canvas = canvas
		this.ctx = canvas.getContext('2d', { alpha: true })!
		this.poolProvider = poolProvider
		this.dpr = window.devicePixelRatio || 1
		this.renderDpr = this.dpr
	}

	setLowQualityMode(enabled: boolean): void {
		if (this.lowQualityMode === enabled) return
		this.lowQualityMode = enabled
		this.renderDpr = enabled ? Math.min(1, this.dpr) : this.dpr
		this.resize()
	}

	resize(): void {
		this.dpr = window.devicePixelRatio || 1
		if (!this.lowQualityMode) {
			this.renderDpr = this.dpr
		} else {
			this.renderDpr = Math.min(1, this.dpr)
		}
		const rect = this.canvas.getBoundingClientRect()
		this.canvas.width = Math.ceil(rect.width * this.renderDpr)
		this.canvas.height = Math.ceil(rect.height * this.renderDpr)
		this.render(this.currentViewport)
	}

	setViewport(viewport: ViewportState): void {
		this.currentViewport = viewport
	}

	setNodes(nodes: VisibleNodeEntry[]): void {
		this.currentNodes = nodes
	}

	markDirty(): void {
		this.render(this.currentViewport)
	}

	private getViewportBounds(viewport: ViewportState, canvasW: number, canvasH: number): ViewportBounds {
		const halfW = canvasW / 2
		const halfH = canvasH / 2
		const zoom = viewport.zoom
		const padding = 50 / zoom

		return {
			left: (-halfW - viewport.panX) / zoom - padding,
			right: (canvasW - halfW - viewport.panX) / zoom + padding,
			top: (-halfH - viewport.panY) / zoom - padding,
			bottom: (canvasH - halfH - viewport.panY) / zoom + padding
		}
	}

	private isNodeVisible(node: VisibleNodeEntry, bounds: ViewportBounds): boolean {
		const halfW = node.width / 2
		const halfH = node.height / 2
		const nodeLeft = node.worldX - halfW
		const nodeRight = node.worldX + halfW
		const nodeTop = node.worldY - halfH
		const nodeBottom = node.worldY + halfH

		return !(nodeRight < bounds.left || nodeLeft > bounds.right ||
			nodeBottom < bounds.top || nodeTop > bounds.bottom)
	}

	private drawRoundedRect(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		r: number
	) {
		const radius = Math.max(0, Math.min(r, w / 2, h / 2))
		ctx.beginPath()
		ctx.moveTo(x + radius, y)
		ctx.lineTo(x + w - radius, y)
		ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
		ctx.lineTo(x + w, y + h - radius)
		ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
		ctx.lineTo(x + radius, y + h)
		ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
		ctx.lineTo(x, y + radius)
		ctx.quadraticCurveTo(x, y, x + radius, y)
		ctx.closePath()
	}

	private drawNodePlaceholder(ctx: CanvasRenderingContext2D, node: VisibleNodeEntry) {
		const w = node.width
		const h = node.height
		const x = node.worldX - w / 2
		const y = node.worldY - h / 2
		const borderRadius = 4
		const borderWidth = 1.5

		ctx.save()

		ctx.fillStyle = 'rgba(30, 34, 42, 0.72)'
		this.drawRoundedRect(ctx, x, y, w, h, borderRadius)
		ctx.fill()

		ctx.strokeStyle = 'rgba(120, 130, 150, 0.45)'
		ctx.lineWidth = borderWidth
		this.drawRoundedRect(ctx, x, y, w, h, borderRadius)
		ctx.stroke()

		const accentColor = 'rgba(31, 157, 132, 0.5)'
		const bracketSize = Math.min(12, Math.min(w, h) * 0.1)
		const bracketWidth = 2
		ctx.strokeStyle = accentColor
		ctx.lineWidth = bracketWidth
		ctx.beginPath()
		ctx.moveTo(x, y + bracketSize)
		ctx.lineTo(x, y)
		ctx.lineTo(x + bracketSize, y)
		ctx.stroke()
		ctx.beginPath()
		ctx.moveTo(x + w, y + h - bracketSize)
		ctx.lineTo(x + w, y + h)
		ctx.lineTo(x + w - bracketSize, y + h)
		ctx.stroke()

		ctx.restore()
	}

	private drawNodeCompact(ctx: CanvasRenderingContext2D, node: VisibleNodeEntry, entry: ScreenshotEntry) {
		const bmp = entry.bitmap as CanvasImageSource
		const drawX = node.worldX - entry.width / 2
		const drawY = node.worldY - entry.height / 2

		ctx.save()
		ctx.globalAlpha = 0.7
		try {
			ctx.drawImage(bmp, drawX, drawY, entry.width, entry.height)
		} catch (err) {
		}
		ctx.globalAlpha = 1
		ctx.strokeStyle = 'rgba(31, 157, 132, 0.35)'
		ctx.lineWidth = 1.5
		const borderRadius = 4
		this.drawRoundedRect(ctx, drawX, drawY, entry.width, entry.height, borderRadius)
		ctx.stroke()
		ctx.restore()
	}

	private drawNodeFull(ctx: CanvasRenderingContext2D, node: VisibleNodeEntry, entry: ScreenshotEntry) {
		const bmp = entry.bitmap as CanvasImageSource
		const drawX = node.worldX - entry.width / 2
		const drawY = node.worldY - entry.height / 2

		try {
			ctx.drawImage(bmp, drawX, drawY, entry.width, entry.height)
		} catch (err) {
		}
	}

	render(viewport: ViewportState): void {
		this.currentViewport = viewport
		const { width, height } = this.canvas
		this.ctx.clearRect(0, 0, width, height)

		const pool = this.poolProvider()
		if (!pool) return

		const canvasW = width / this.renderDpr
		const canvasH = height / this.renderDpr
		const zoom = viewport.zoom

		const bounds = this.getViewportBounds(viewport, canvasW, canvasH)

		this.ctx.save()
		this.ctx.setTransform(
			zoom * this.renderDpr,
			0,
			0,
			zoom * this.renderDpr,
			(canvasW / 2 + viewport.panX) * this.renderDpr,
			(canvasH / 2 + viewport.panY) * this.renderDpr
		)

		const placeholderZoomThreshold = this.lowQualityMode ? 0.5 : 0.2
		const compactZoomThreshold = this.lowQualityMode ? 0.8 : 0.5

		for (const node of this.currentNodes) {
			if (!this.isNodeVisible(node, bounds)) continue

			const entry = pool.getEntry(node.id)

			if (!entry) {
				if (zoom < 0.4) {
					this.drawNodePlaceholder(this.ctx, node)
				}
				continue
			}

			if (zoom < placeholderZoomThreshold) {
				this.drawNodePlaceholder(this.ctx, node)
			} else if (zoom < compactZoomThreshold) {
				this.drawNodeCompact(this.ctx, node, entry)
			} else {
				this.drawNodeFull(this.ctx, node, entry)
			}
		}

		this.ctx.restore()
	}

	hitTest(clientX: number, clientY: number): HitTestResult {
		const rect = this.canvas.getBoundingClientRect()
		const screenX = clientX - rect.left
		const screenY = clientY - rect.top

		const vp = this.currentViewport
		const canvasW = rect.width
		const canvasH = rect.height

		const worldX = (screenX - canvasW / 2 - vp.panX) / vp.zoom
		const worldY = (screenY - canvasH / 2 - vp.panY) / vp.zoom

		const pool = this.poolProvider()
		const bounds = this.getViewportBounds(vp, canvasW, canvasH)

		for (let i = this.currentNodes.length - 1; i >= 0; i--) {
			const node = this.currentNodes[i]
			if (!this.isNodeVisible(node, bounds)) continue

			const entry = pool?.getEntry(node.id)
			const hitW = entry?.width ?? node.width
			const hitH = entry?.height ?? node.height
			const halfW = hitW / 2
			const halfH = hitH / 2

			const nodeLeft = node.worldX - halfW
			const nodeRight = node.worldX + halfW
			const nodeTop = node.worldY - halfH
			const nodeBottom = node.worldY + halfH

			if (worldX >= nodeLeft && worldX <= nodeRight && worldY >= nodeTop && worldY <= nodeBottom) {
				return { nodeId: node.id }
			}
		}

		return { nodeId: null }
	}

	dispose(): void {
	}
}
