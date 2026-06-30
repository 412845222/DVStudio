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

export class CanvasNodeRenderer {
	private canvas: HTMLCanvasElement
	private ctx: CanvasRenderingContext2D
	private poolProvider: ScreenshotPoolProvider
	private dpr: number = 1

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
	}

	resize(): void {
		this.dpr = window.devicePixelRatio || 1
		const rect = this.canvas.getBoundingClientRect()
		this.canvas.width = Math.ceil(rect.width * this.dpr)
		this.canvas.height = Math.ceil(rect.height * this.dpr)
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

	render(viewport: ViewportState): void {
		this.currentViewport = viewport
		const { width, height } = this.canvas
		this.ctx.clearRect(0, 0, width, height)

		const pool = this.poolProvider()
		if (!pool) return

		const canvasW = width / this.dpr
		const canvasH = height / this.dpr

		this.ctx.save()
		this.ctx.setTransform(
			viewport.zoom * this.dpr,
			0,
			0,
			viewport.zoom * this.dpr,
			(canvasW / 2 + viewport.panX) * this.dpr,
			(canvasH / 2 + viewport.panY) * this.dpr
		)

		for (const node of this.currentNodes) {
			const entry = pool.getEntry(node.id)
			if (!entry) continue

			const bmp = entry.bitmap as CanvasImageSource
			const bmpW = entry.width
			const bmpH = entry.height

			if (!bmpW || !bmpH) continue

			const drawX = node.worldX - bmpW / 2
			const drawY = node.worldY - bmpH / 2

			try {
				this.ctx.drawImage(bmp, drawX, drawY, bmpW, bmpH)
			} catch (err) {
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

		for (let i = this.currentNodes.length - 1; i >= 0; i--) {
			const node = this.currentNodes[i]
			const nodeLeft = node.worldX - node.width / 2
			const nodeRight = node.worldX + node.width / 2
			const nodeTop = node.worldY - node.height / 2
			const nodeBottom = node.worldY + node.height / 2

			if (worldX >= nodeLeft && worldX <= nodeRight && worldY >= nodeTop && worldY <= nodeBottom) {
				return { nodeId: node.id }
			}
		}

		return { nodeId: null }
	}

	dispose(): void {
	}
}
