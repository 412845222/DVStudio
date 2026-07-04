type TImageBitmap = ImageBitmap | HTMLCanvasElement

interface ScreenshotEntry {
	bitmap: TImageBitmap
	width: number
	height: number
}

interface SimpleScreenshotPool {
	getEntry(nodeId: string, theme?: 'dark' | 'light'): ScreenshotEntry | null
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

interface ThemeTransitionState {
	fromTheme: 'dark' | 'light'
	toTheme: 'dark' | 'light'
	progress: number
	duration: number
	startTime: number
}

const TRANSITION_DURATION = 280

export class CanvasNodeRenderer {
	private canvas: HTMLCanvasElement
	private ctx: CanvasRenderingContext2D
	private poolProvider: ScreenshotPoolProvider
	private dpr: number = 1
	private renderDpr: number = 1
	private lowQualityMode: boolean = false
	private theme: 'dark' | 'light' = 'dark'
	private transition: ThemeTransitionState | null = null
	private animationFrameId: number | null = null

	private currentViewport: ViewportState = { panX: 0, panY: 0, zoom: 1 }
	private lastRenderedViewport: ViewportState | null = null
	private forceFullRender: boolean = true
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
		this.theme = this.detectCurrentTheme()
	}

	private detectCurrentTheme(): 'dark' | 'light' {
		try {
			const theme = document.documentElement.getAttribute('data-theme')
			return theme === 'light' ? 'light' : 'dark'
		} catch {
			return 'dark'
		}
	}

	setTheme(theme: 'dark' | 'light'): void {
		if (this.theme === theme) {
			this.transition = null
			this.stopTransitionAnimation()
			return
		}

		const fromTheme = this.theme
		this.theme = theme

		this.transition = {
			fromTheme,
			toTheme: theme,
			progress: 0,
			duration: TRANSITION_DURATION,
			startTime: performance.now()
		}

		this.forceFullRender = true
		this.startTransitionAnimation()
	}

	getTheme(): 'dark' | 'light' {
		return this.theme
	}

	isTransitioning(): boolean {
		return this.transition !== null && this.transition.progress < 1
	}

	private startTransitionAnimation(): void {
		this.stopTransitionAnimation()

		const animate = () => {
			if (!this.transition) return

			const elapsed = performance.now() - this.transition.startTime
			const rawProgress = Math.min(elapsed / this.transition.duration, 1)
			this.transition.progress = this.easeInOutCubic(rawProgress)

			this.forceFullRender = true
			this.render(this.currentViewport)

			if (rawProgress < 1) {
				this.animationFrameId = requestAnimationFrame(animate)
			} else {
				this.transition = null
				this.animationFrameId = null
				this.forceFullRender = true
				this.render(this.currentViewport)
			}
		}

		this.animationFrameId = requestAnimationFrame(animate)
	}

	private stopTransitionAnimation(): void {
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId)
			this.animationFrameId = null
		}
	}

	private easeInOutCubic(t: number): number {
		return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
	}

	setLowQualityMode(enabled: boolean): void {
		if (this.lowQualityMode === enabled) return
		this.lowQualityMode = enabled
		this.renderDpr = enabled ? Math.min(1, this.dpr) : this.dpr
		this.forceFullRender = true
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
		this.forceFullRender = true
		this.render(this.currentViewport)
	}

	setViewport(viewport: ViewportState): void {
		this.currentViewport = viewport
	}

	setNodes(nodes: VisibleNodeEntry[]): void {
		this.currentNodes = nodes
		this.forceFullRender = true
	}

	markDirty(): void {
		this.forceFullRender = true
		this.render(this.currentViewport)
	}

	private canUsePanReuse(newVp: ViewportState): boolean {
		if (this.forceFullRender) return false
		if (this.transition && this.transition.progress < 1) return false
		const last = this.lastRenderedViewport
		if (!last) return false
		if (Math.abs(newVp.zoom - last.zoom) > 0.0001) return false
		if (newVp.zoom < 0.2) return false
		const expectedDpr = this.lowQualityMode ? Math.min(1, this.dpr) : this.dpr
		if (Math.abs(this.renderDpr - expectedDpr) > 0.001) return false
		return true
	}

	private getExposedRegions(
		lastBounds: ViewportBounds,
		newBounds: ViewportBounds
	): Array<{ bounds: ViewportBounds; isNewlyExposed: boolean }> {
		const regions: Array<{ bounds: ViewportBounds; isNewlyExposed: boolean }> = []
		const eps = 0.5

		if (newBounds.left < lastBounds.left - eps) {
			regions.push({
				bounds: {
					left: newBounds.left,
					right: lastBounds.left,
					top: newBounds.top,
					bottom: newBounds.bottom
				},
				isNewlyExposed: true
			})
		}
		if (newBounds.right > lastBounds.right + eps) {
			regions.push({
				bounds: {
					left: lastBounds.right,
					right: newBounds.right,
					top: newBounds.top,
					bottom: newBounds.bottom
				},
				isNewlyExposed: true
			})
		}
		if (newBounds.top < lastBounds.top - eps) {
			regions.push({
				bounds: {
					left: Math.max(newBounds.left, lastBounds.left),
					right: Math.min(newBounds.right, lastBounds.right),
					top: newBounds.top,
					bottom: lastBounds.top
				},
				isNewlyExposed: true
			})
		}
		if (newBounds.bottom > lastBounds.bottom + eps) {
			regions.push({
				bounds: {
					left: Math.max(newBounds.left, lastBounds.left),
					right: Math.min(newBounds.right, lastBounds.right),
					top: lastBounds.bottom,
					bottom: newBounds.bottom
				},
				isNewlyExposed: true
			})
		}

		if (regions.length === 0) {
			regions.push({ bounds: newBounds, isNewlyExposed: false })
		}

		return regions
	}

	private rectIntersects(
		nodeLeft: number, nodeRight: number, nodeTop: number, nodeBottom: number,
		b: ViewportBounds
	): boolean {
		return !(nodeRight < b.left || nodeLeft > b.right ||
			nodeBottom < b.top || nodeTop > b.bottom)
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

	private getPlaceholderColors(forTheme: 'dark' | 'light') {
		if (forTheme === 'light') {
			return {
				bg: 'rgba(255, 255, 255, 0.88)',
				border: 'rgba(0, 0, 0, 0.12)',
				accent: 'rgba(31, 157, 132, 0.45)',
				compactBorder: 'rgba(31, 157, 132, 0.3)'
			}
		}
		return {
			bg: 'rgba(30, 34, 42, 0.72)',
			border: 'rgba(120, 130, 150, 0.45)',
			accent: 'rgba(31, 157, 132, 0.5)',
			compactBorder: 'rgba(31, 157, 132, 0.35)'
		}
	}

	private drawNodePlaceholder(ctx: CanvasRenderingContext2D, node: VisibleNodeEntry, forTheme: 'dark' | 'light', alpha = 1) {
		const w = node.width
		const h = node.height
		const x = node.worldX - w / 2
		const y = node.worldY - h / 2
		const borderRadius = 4
		const borderWidth = 1.5
		const colors = this.getPlaceholderColors(forTheme)

		ctx.save()
		ctx.globalAlpha = alpha

		ctx.fillStyle = colors.bg
		this.drawRoundedRect(ctx, x, y, w, h, borderRadius)
		ctx.fill()

		ctx.strokeStyle = colors.border
		ctx.lineWidth = borderWidth
		this.drawRoundedRect(ctx, x, y, w, h, borderRadius)
		ctx.stroke()

		const accentColor = colors.accent
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

	private drawSingleBitmap(
		ctx: CanvasRenderingContext2D,
		node: VisibleNodeEntry,
		entry: ScreenshotEntry,
		alpha: number,
		mode: 'full' | 'compact',
		forTheme: 'dark' | 'light'
	) {
		const bmp = entry.bitmap as CanvasImageSource
		const drawX = node.worldX - entry.width / 2
		const drawY = node.worldY - entry.height / 2

		ctx.save()
		ctx.globalAlpha = alpha

		try {
			ctx.drawImage(bmp, drawX, drawY, entry.width, entry.height)
		} catch {
		}

		if (mode === 'compact') {
			ctx.globalAlpha = alpha
			const colors = this.getPlaceholderColors(forTheme)
			ctx.strokeStyle = colors.compactBorder
			ctx.lineWidth = 1.5
			const borderRadius = 4
			this.drawRoundedRect(ctx, drawX, drawY, entry.width, entry.height, borderRadius)
			ctx.stroke()
		}

		ctx.restore()
	}

	private drawNode(
		ctx: CanvasRenderingContext2D,
		node: VisibleNodeEntry,
		pool: SimpleScreenshotPool,
		zoom: number,
		placeholderZoomThreshold: number,
		compactZoomThreshold: number
	) {
		if (this.transition && this.transition.progress < 1) {
			this.drawNodeWithTransition(ctx, node, pool, zoom, placeholderZoomThreshold, compactZoomThreshold)
		} else {
			this.drawNodeSingleTheme(ctx, node, pool, zoom, placeholderZoomThreshold, compactZoomThreshold, this.theme)
		}
	}

	private drawNodeSingleTheme(
		ctx: CanvasRenderingContext2D,
		node: VisibleNodeEntry,
		pool: SimpleScreenshotPool,
		zoom: number,
		placeholderZoomThreshold: number,
		compactZoomThreshold: number,
		forTheme: 'dark' | 'light',
		alpha = 1
	) {
		const entry = pool.getEntry(node.id, forTheme)

		if (!entry) {
			this.drawNodePlaceholder(ctx, node, forTheme, alpha)
			return
		}

		if (zoom < placeholderZoomThreshold) {
			this.drawNodePlaceholder(ctx, node, forTheme, alpha)
		} else if (zoom < compactZoomThreshold) {
			this.drawSingleBitmap(ctx, node, entry, alpha * 0.7, 'compact', forTheme)
		} else {
			this.drawSingleBitmap(ctx, node, entry, alpha, 'full', forTheme)
		}
	}

	private drawNodeWithTransition(
		ctx: CanvasRenderingContext2D,
		node: VisibleNodeEntry,
		pool: SimpleScreenshotPool,
		zoom: number,
		placeholderZoomThreshold: number,
		compactZoomThreshold: number
	) {
		if (!this.transition) return

		const { fromTheme, toTheme, progress } = this.transition
		const fromAlpha = 1 - progress
		const toAlpha = progress

		if (fromAlpha > 0.01) {
			this.drawNodeSingleTheme(ctx, node, pool, zoom, placeholderZoomThreshold, compactZoomThreshold, fromTheme, fromAlpha)
		}
		if (toAlpha > 0.01) {
			this.drawNodeSingleTheme(ctx, node, pool, zoom, placeholderZoomThreshold, compactZoomThreshold, toTheme, toAlpha)
		}
	}

	render(viewport: ViewportState): void {
		this.currentViewport = viewport
		const { width, height } = this.canvas
		const pool = this.poolProvider()
		if (!pool) {
			this.ctx.clearRect(0, 0, width, height)
			this.lastRenderedViewport = { ...viewport }
			this.forceFullRender = false
			return
		}

		const canvasW = width / this.renderDpr
		const canvasH = height / this.renderDpr
		const zoom = viewport.zoom

		const placeholderZoomThreshold = this.lowQualityMode ? 0.5 : 0.15
		const compactZoomThreshold = this.lowQualityMode ? 0.5 : 0

		const usePanReuse = this.canUsePanReuse(viewport)
		const newBounds = this.getViewportBounds(viewport, canvasW, canvasH)

		if (usePanReuse && this.lastRenderedViewport) {
			const lastVp = this.lastRenderedViewport
			const dPanX = viewport.panX - lastVp.panX
			const dPanY = viewport.panY - lastVp.panY
			const offsetX = dPanX * this.renderDpr
			const offsetY = dPanY * this.renderDpr

			if (Math.abs(offsetX) > 0.5 || Math.abs(offsetY) > 0.5) {
				this.ctx.save()
				this.ctx.setTransform(1, 0, 0, 1, 0, 0)
				this.ctx.drawImage(this.canvas, offsetX, offsetY)
				this.ctx.restore()
			}

			const lastBounds = this.getViewportBounds(lastVp, canvasW, canvasH)
			const exposedRegions = this.getExposedRegions(lastBounds, newBounds)

			this.ctx.save()
			this.ctx.setTransform(
				zoom * this.renderDpr,
				0,
				0,
				zoom * this.renderDpr,
				(canvasW / 2 + viewport.panX) * this.renderDpr,
				(canvasH / 2 + viewport.panY) * this.renderDpr
			)

			for (const region of exposedRegions) {
				if (!region.isNewlyExposed) continue

				const worldClipX = region.bounds.left
				const worldClipY = region.bounds.top
				const worldClipW = region.bounds.right - region.bounds.left
				const worldClipH = region.bounds.bottom - region.bounds.top
				const screenClipX = (canvasW / 2 + viewport.panX + worldClipX * zoom) * this.renderDpr
				const screenClipY = (canvasH / 2 + viewport.panY + worldClipY * zoom) * this.renderDpr
				const screenClipW = worldClipW * zoom * this.renderDpr + 2
				const screenClipH = worldClipH * zoom * this.renderDpr + 2

				this.ctx.save()
				this.ctx.setTransform(1, 0, 0, 1, 0, 0)
				this.ctx.clearRect(screenClipX - 1, screenClipY - 1, screenClipW + 2, screenClipH + 2)
				this.ctx.restore()

				this.ctx.save()
				this.ctx.beginPath()
				this.ctx.rect(worldClipX, worldClipY, worldClipW, worldClipH)
				this.ctx.clip()

				for (const node of this.currentNodes) {
					const halfW = node.width / 2
					const halfH = node.height / 2
					const nl = node.worldX - halfW
					const nr = node.worldX + halfW
					const nt = node.worldY - halfH
					const nb = node.worldY + halfH

					if (!this.rectIntersects(nl, nr, nt, nb, region.bounds)) continue

					this.drawNode(this.ctx, node, pool, zoom, placeholderZoomThreshold, compactZoomThreshold)
				}

				this.ctx.restore()
			}

			this.ctx.restore()
		} else {
			this.ctx.clearRect(0, 0, width, height)

			this.ctx.save()
			this.ctx.setTransform(
				zoom * this.renderDpr,
				0,
				0,
				zoom * this.renderDpr,
				(canvasW / 2 + viewport.panX) * this.renderDpr,
				(canvasH / 2 + viewport.panY) * this.renderDpr
			)

			for (const node of this.currentNodes) {
				if (!this.isNodeVisible(node, newBounds)) continue

				this.drawNode(this.ctx, node, pool, zoom, placeholderZoomThreshold, compactZoomThreshold)
			}

			this.ctx.restore()
		}

		this.lastRenderedViewport = { ...viewport }
		this.forceFullRender = false
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

			const entry = pool?.getEntry(node.id, this.theme)
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
		this.stopTransitionAnimation()
		this.transition = null
	}
}
