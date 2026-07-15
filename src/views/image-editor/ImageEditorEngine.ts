import type {
	IEditorEngine,
	ToolType,
	TransformState,
	BrushSettings,
	EraserSettings,
	EraserMode,
	Point,
	Rect
} from './types'

const MAX_HISTORY_SIZE = 30

interface DetectedSubject {
	minX: number
	minY: number
	maxX: number
	maxY: number
	pixelCount: number
	edgePixels: Array<[number, number]>
	fillMask: Uint8Array
	fillMaskW: number
	fillMaskH: number
}

class EditHistory {
	private undoStack: ImageData[] = []
	private redoStack: ImageData[] = []
	private maxSize = MAX_HISTORY_SIZE

	pushState(ctx: CanvasRenderingContext2D) {
		const canvas = ctx.canvas
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
		this.undoStack.push(imageData)
		if (this.undoStack.length > this.maxSize) {
			this.undoStack.shift()
		}
		this.redoStack = []
	}

	undo(ctx: CanvasRenderingContext2D): boolean {
		if (this.undoStack.length === 0) return false
		const canvas = ctx.canvas
		const current = ctx.getImageData(0, 0, canvas.width, canvas.height)
		this.redoStack.push(current)
		const prev = this.undoStack.pop()!
		ctx.putImageData(prev, 0, 0)
		return true
	}

	redo(ctx: CanvasRenderingContext2D): boolean {
		if (this.redoStack.length === 0) return false
		const canvas = ctx.canvas
		const current = ctx.getImageData(0, 0, canvas.width, canvas.height)
		this.undoStack.push(current)
		const next = this.redoStack.pop()!
		ctx.putImageData(next, 0, 0)
		return true
	}

	canUndo(): boolean {
		return this.undoStack.length > 0
	}

	canRedo(): boolean {
		return this.redoStack.length > 0
	}

	clear() {
		this.undoStack = []
		this.redoStack = []
	}
}

export class ImageEditorEngine implements IEditorEngine {
	private baseCanvas: HTMLCanvasElement
	private overlayCanvas: HTMLCanvasElement
	private baseCtx: CanvasRenderingContext2D
	private overlayCtx: CanvasRenderingContext2D
	private sourceImage: HTMLImageElement | null = null
	private naturalWidth = 0
	private naturalHeight = 0
	private imageLoaded = false

	private tool: ToolType = 'view'
	private zoom = 1
	private offsetX = 0
	private offsetY = 0

	private transform: TransformState = {
		flipH: false,
		flipV: false,
		rotation: 0
	}

	private brush: BrushSettings = {
		size: 6,
		color: '#ff2d2d',
		hardness: 0.8
	}

	private eraser: EraserSettings = {
		mode: 'rect-bg-remove',
		size: 20,
		feather: 2,
		tolerance: 32,
		contiguous: true,
		sampleCorners: true
	}

	private subjectSelect = {
		tightFit: false,
		margin: 5
	}

	private detectedSubjects: DetectedSubject[] = []
	private selectedSubjectIdx: number = -1
	private hoverSubjectIdx: number = -1
	private subjectSelectRect: Rect | null = null
	private subjectOverlayCache: HTMLCanvasElement | null = null

	private history: EditHistory = new EditHistory()
	private currentStroke: Point[] = []
	private isDrawing = false
	private lastPoint: Point | null = null

	private screenshotRect: Rect | null = null
	private eraseRect: Rect | null = null
	private isDrawingEraseRect = false
	private eraseRectStart: Point | null = null

	private clickEraseStart: Point | null = null
	private clickErasePreviewMask: Uint8Array | null = null
	private clickErasePreviewData: Uint8ClampedArray | null = null
	private clickErasePreviewW = 0
	private clickErasePreviewH = 0
	private clickErasePreviewOffsetX = 0
	private clickErasePreviewOffsetY = 0
	private clickEraseBBox: { minX: number; minY: number; maxX: number; maxY: number } | null = null
	private marchingAntsOffset = 0
	private marchingAntsRAF: number | null = null
	private clickEraseApplyTimer: number | null = null

	private stateChangeListeners: Set<() => void> = new Set()
	private dragState: { startX: number; startY: number; origOffsetX: number; origOffsetY: number } | null = null

	constructor(baseCanvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement) {
		this.baseCanvas = baseCanvas
		this.overlayCanvas = overlayCanvas
		const baseCtx = baseCanvas.getContext('2d')
		const overlayCtx = overlayCanvas.getContext('2d')
		if (!baseCtx || !overlayCtx) {
			throw new Error('Failed to get 2d context')
		}
		this.baseCtx = baseCtx
		this.overlayCtx = overlayCtx
	}

	on(_event: 'stateChange', callback: () => void): void {
		this.stateChangeListeners.add(callback)
	}

	off(_event: 'stateChange', callback: () => void): void {
		this.stateChangeListeners.delete(callback)
	}

	private emitStateChange() {
		this.stateChangeListeners.forEach((cb) => {
			try {
				cb()
			} catch {
				// ignore listener errors
			}
		})
	}

	async loadImage(url: string): Promise<void> {
		this.imageLoaded = false
		this.naturalWidth = 0
		this.naturalHeight = 0
		this.history.clear()
		this.resetTransformInternal()
		this.screenshotRect = null
		this.eraseRect = null
		this.isDrawingEraseRect = false
		this.eraseRectStart = null
		this.detectedSubjects = []
		this.selectedSubjectIdx = -1
		this.subjectSelectRect = null
		this.clearClickErasePreview()

		const img = new Image()
		if (url.startsWith('http://') || url.startsWith('https://')) {
			img.crossOrigin = 'anonymous'
		}
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve()
			img.onerror = () => reject(new Error('image load failed'))
			img.src = url
		})
		this.sourceImage = img
		this.naturalWidth = img.naturalWidth
		this.naturalHeight = img.naturalHeight

		this.baseCanvas.width = this.naturalWidth
		this.baseCanvas.height = this.naturalHeight
		this.overlayCanvas.width = this.naturalWidth
		this.overlayCanvas.height = this.naturalHeight

		this.baseCtx.clearRect(0, 0, this.naturalWidth, this.naturalHeight)
		this.baseCtx.drawImage(img, 0, 0)

		this.history.pushState(this.baseCtx)
		this.imageLoaded = true
		this.render()
	}

	private resetTransformInternal() {
		this.zoom = 1
		this.offsetX = 0
		this.offsetY = 0
	}

	getNaturalSize(): { width: number; height: number } {
		return { width: this.naturalWidth, height: this.naturalHeight }
	}

	isImageLoaded(): boolean {
		return this.imageLoaded
	}

	setTool(tool: ToolType): void {
		if (this.tool === tool) return
		this.endStrokeInternal()
		this.isDrawingEraseRect = false
		this.eraseRectStart = null
		this.eraseRect = null
		this.clearClickErasePreview()
		this.tool = tool
		if (tool === 'screenshot' || tool === 'crop') {
			this.initDefaultScreenshotRect()
			this.detectedSubjects = []
			this.selectedSubjectIdx = -1
			this.subjectSelectRect = null
		} else if (tool === 'subject-select') {
			this.screenshotRect = null
			this.detectAllSubjects()
		} else {
			this.screenshotRect = null
			this.detectedSubjects = []
			this.selectedSubjectIdx = -1
			this.subjectSelectRect = null
		}
		this.clearOverlay()
		this.render()
		this.emitStateChange()
	}

	getTool(): ToolType {
		return this.tool
	}

	setZoom(factor: number): void {
		this.zoom = Math.max(0.05, Math.min(20, factor))
		this.emitStateChange()
	}

	getZoom(): number {
		return this.zoom
	}

	zoomBy(factor: number): void {
		this.setZoom(this.zoom * factor)
	}

	resetView(): void {
		this.resetTransformInternal()
		this.render()
		this.emitStateChange()
	}

	fitToView(viewportWidth: number, viewportHeight: number): void {
		if (!this.imageLoaded) return
		const padX = 40
		const padY = 80
		const availableW = Math.max(1, viewportWidth - padX)
		const availableH = Math.max(1, viewportHeight - padY)
		const scale = Math.min(availableW / this.naturalWidth, availableH / this.naturalHeight, 1)
		this.zoom = scale
		this.offsetX = 0
		this.offsetY = 0
		this.emitStateChange()
	}

	rotateBy(deg: -90 | 90): void {
		this.endStrokeInternal()
		this.applyTransformToCanvas({ rotation: deg, flipH: false, flipV: false })
		this.clearOverlay()
		this.render()
		this.emitStateChange()
	}

	flipHorizontal(): void {
		this.endStrokeInternal()
		this.applyTransformToCanvas({ rotation: 0, flipH: true, flipV: false })
		this.clearOverlay()
		this.render()
		this.emitStateChange()
	}

	flipVertical(): void {
		this.endStrokeInternal()
		this.applyTransformToCanvas({ rotation: 0, flipH: false, flipV: true })
		this.clearOverlay()
		this.render()
		this.emitStateChange()
	}

	private applyTransformToCanvas(op: { rotation: -90 | 90 | 0; flipH: boolean; flipV: boolean }) {
		if (!this.imageLoaded) return

		const srcCanvas = this.baseCanvas
		const tmpCanvas = document.createElement('canvas')
		const tmpCtx = tmpCanvas.getContext('2d')
		if (!tmpCtx) return

		const oldW = srcCanvas.width
		const oldH = srcCanvas.height

		if (op.rotation === 90 || op.rotation === -90) {
			tmpCanvas.width = oldH
			tmpCanvas.height = oldW
		} else {
			tmpCanvas.width = oldW
			tmpCanvas.height = oldH
		}

		tmpCtx.save()
		tmpCtx.translate(tmpCanvas.width / 2, tmpCanvas.height / 2)
		if (op.rotation === 90) tmpCtx.rotate(Math.PI / 2)
		if (op.rotation === -90) tmpCtx.rotate(-Math.PI / 2)
		if (op.flipH) tmpCtx.scale(-1, 1)
		if (op.flipV) tmpCtx.scale(1, -1)
		tmpCtx.drawImage(srcCanvas, -oldW / 2, -oldH / 2)
		tmpCtx.restore()

		this.baseCanvas.width = tmpCanvas.width
		this.baseCanvas.height = tmpCanvas.height
		this.overlayCanvas.width = tmpCanvas.width
		this.overlayCanvas.height = tmpCanvas.height
		this.naturalWidth = tmpCanvas.width
		this.naturalHeight = tmpCanvas.height
		this.baseCtx.clearRect(0, 0, this.naturalWidth, this.naturalHeight)
		this.baseCtx.drawImage(tmpCanvas, 0, 0)

		if (this.screenshotRect) {
			this.screenshotRect = null
		}
		if (this.subjectSelectRect || this.detectedSubjects.length > 0) {
			this.detectedSubjects = []
			this.selectedSubjectIdx = -1
			this.hoverSubjectIdx = -1
			this.subjectSelectRect = null
		}

		this.history.pushState(this.baseCtx)

		if (this.tool === 'subject-select') {
			this.detectAllSubjects()
		}
	}

	pointerToImageCoords(clientX: number, clientY: number, viewport: HTMLElement): Point | null {
		const rect = this.baseCanvas.getBoundingClientRect()
		const localX = clientX - rect.left
		const localY = clientY - rect.top
		const displayedW = rect.width
		const displayedH = rect.height
		const scaleX = this.naturalWidth / displayedW
		const scaleY = this.naturalHeight / displayedH
		let x = localX * scaleX
		let y = localY * scaleY

		x = Math.max(0, Math.min(this.naturalWidth, x))
		y = Math.max(0, Math.min(this.naturalHeight, y))
		return { x, y }
	}

	viewportToImageDelta(dx: number, dy: number): Point {
		const rect = this.baseCanvas.getBoundingClientRect()
		const scaleX = this.naturalWidth / rect.width
		const scaleY = this.naturalHeight / rect.height
		return { x: dx * scaleX, y: dy * scaleY }
	}

	pointerDown(clientX: number, clientY: number, viewport: HTMLElement): void {
		this.handlePointerDown({ clientX, clientY, button: 0 } as PointerEvent, viewport)
	}

	pointerMove(clientX: number, clientY: number, viewport: HTMLElement): void {
		this.handlePointerMove({ clientX, clientY } as PointerEvent, viewport)
	}

	pointerUp(clientX: number, clientY: number, viewport: HTMLElement): void {
		this.handlePointerUp({ clientX, clientY } as PointerEvent, viewport)
	}

	pointerLeave(): void {
		if (this.tool === 'subject-select') {
			this.clearHoverSubject()
		}
	}

	handlePointerDown(e: PointerEvent, viewport: HTMLElement): void {
		if (e.button !== 0) return
		if (this.tool === 'view') {
			this.dragState = {
				startX: e.clientX,
				startY: e.clientY,
				origOffsetX: this.offsetX,
				origOffsetY: this.offsetY
			}
			return
		}

		const pt = this.pointerToImageCoords(e.clientX, e.clientY, viewport)
		if (!pt) return

		if (this.tool === 'eraser' && this.eraser.mode === 'rect-bg-remove') {
			this.isDrawingEraseRect = true
			this.eraseRectStart = pt
			this.eraseRect = { x: pt.x, y: pt.y, w: 0, h: 0 }
			this.renderOverlay()
			return
		}

		if (this.tool === 'eraser' && this.eraser.mode === 'click-bg-remove') {
			this.clickEraseStart = pt
			return
		}

		if (this.tool === 'brush' || (this.tool === 'eraser' && this.eraser.mode === 'brush')) {
			this.isDrawing = true
			this.currentStroke = [pt]
			this.lastPoint = pt
			this.applyBrushAt(pt)
			this.renderOverlay()
		} else if (this.tool === 'screenshot' || this.tool === 'crop') {
			this.handleScreenshotPointerDown(pt)
		} else if (this.tool === 'subject-select') {
			this.selectSubjectAt(pt.x, pt.y)
		}
	}

	handlePointerMove(e: PointerEvent, viewport: HTMLElement): void {
		if (this.tool === 'view' && this.dragState) {
			this.offsetX = this.dragState.origOffsetX + (e.clientX - this.dragState.startX)
			this.offsetY = this.dragState.origOffsetY + (e.clientY - this.dragState.startY)
			this.emitStateChange()
			return
		}

		if (this.tool === 'eraser' && this.eraser.mode === 'rect-bg-remove' && this.isDrawingEraseRect && this.eraseRectStart) {
			const pt = this.pointerToImageCoords(e.clientX, e.clientY, viewport)
			if (!pt) return
			const x = Math.min(pt.x, this.eraseRectStart.x)
			const y = Math.min(pt.y, this.eraseRectStart.y)
			const w = Math.abs(pt.x - this.eraseRectStart.x)
			const h = Math.abs(pt.y - this.eraseRectStart.y)
			this.eraseRect = {
				x: Math.max(0, Math.min(this.naturalWidth, x)),
				y: Math.max(0, Math.min(this.naturalHeight, y)),
				w: Math.max(0, Math.min(w, this.naturalWidth)),
				h: Math.max(0, Math.min(h, this.naturalHeight))
			}
			this.renderOverlay()
			return
		}

		if (this.tool === 'eraser' && this.eraser.mode === 'click-bg-remove' && this.clickEraseStart) {
			return
		}

		if (this.tool === 'subject-select') {
			const pt = this.pointerToImageCoords(e.clientX, e.clientY, viewport)
			if (pt) {
				this.hoverSubjectAt(pt.x, pt.y)
			}
			return
		}

		if (!this.isDrawing && !this.dragState && (this.tool !== 'screenshot' && this.tool !== 'crop')) {
			return
		}

		const pt = this.pointerToImageCoords(e.clientX, e.clientY, viewport)
		if (!pt) return

		if ((this.tool === 'brush' || (this.tool === 'eraser' && this.eraser.mode === 'brush')) && this.isDrawing && this.lastPoint) {
			this.drawLineTo(this.lastPoint, pt)
			this.currentStroke.push(pt)
			this.lastPoint = pt
			this.renderOverlay()
		} else if (this.tool === 'screenshot' || this.tool === 'crop') {
			this.handleScreenshotPointerMove(pt)
		}
	}

	handlePointerUp(e: PointerEvent, viewport?: HTMLElement): void {
		if (this.dragState) {
			this.dragState = null
		}

		if (this.tool === 'eraser' && this.eraser.mode === 'rect-bg-remove' && this.isDrawingEraseRect) {
			this.isDrawingEraseRect = false
			this.eraseRectStart = null
			if (this.eraseRect && this.eraseRect.w > 5 && this.eraseRect.h > 5) {
				this.executeRectBgRemove(this.eraseRect)
			}
			this.eraseRect = null
			this.clearOverlay()
			this.render()
			this.emitStateChange()
			return
		}

		if (this.tool === 'eraser' && this.eraser.mode === 'click-bg-remove' && this.clickEraseStart && viewport) {
			const pt = this.pointerToImageCoords(e.clientX, e.clientY, viewport)
			if (pt) {
				const dx = pt.x - this.clickEraseStart.x
				const dy = pt.y - this.clickEraseStart.y
				if (dx * dx + dy * dy < 25) {
					this.executeClickBgRemove(Math.round(this.clickEraseStart.x), Math.round(this.clickEraseStart.y))
				}
			}
			this.clickEraseStart = null
			return
		}

		this.endStrokeInternal()
		if (this.tool === 'screenshot' || this.tool === 'crop') {
			this.handleScreenshotPointerUp()
		}
	}

	private endStrokeInternal() {
		if (this.isDrawing && this.currentStroke.length > 0) {
			this.history.pushState(this.baseCtx)
			this.emitStateChange()
		}
		this.isDrawing = false
		this.currentStroke = []
		this.lastPoint = null
		this.clearOverlay()
		this.renderOverlay()
	}

	startStroke(_x: number, _y: number): void {
		// handled via handlePointerDown
	}

	continueStroke(_x: number, _y: number): void {
		// handled via handlePointerMove
	}

	endStroke(): void {
		this.endStrokeInternal()
	}

	private applyBrushAt(pt: Point) {
		if (this.tool === 'brush') {
			this.drawSoftCircle(this.baseCtx, pt.x, pt.y, this.brush.size, this.brush.color, this.brush.hardness, 'source-over')
		} else if (this.tool === 'eraser' && this.eraser.mode === 'brush') {
			this.drawSoftCircle(this.baseCtx, pt.x, pt.y, this.eraser.size, '#000000', 0.5, 'destination-out')
		}
	}

	private drawLineTo(from: Point, to: Point) {
		if (this.tool === 'brush') {
			this.drawSoftLine(this.baseCtx, from, to, this.brush.size, this.brush.color, this.brush.hardness, 'source-over')
		} else if (this.tool === 'eraser' && this.eraser.mode === 'brush') {
			this.drawSoftLine(this.baseCtx, from, to, this.eraser.size, '#000000', 0.5, 'destination-out')
		}
	}

	private drawSoftCircle(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		size: number,
		color: string,
		hardness: number,
		compositeOp: GlobalCompositeOperation
	) {
		ctx.save()
		ctx.globalCompositeOperation = compositeOp
		const radius = size / 2
		const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
		gradient.addColorStop(0, color)
		gradient.addColorStop(Math.max(0, Math.min(1, hardness)), color)
		gradient.addColorStop(1, 'rgba(0,0,0,0)')
		ctx.fillStyle = gradient
		ctx.beginPath()
		ctx.arc(x, y, radius, 0, Math.PI * 2)
		ctx.fill()
		ctx.restore()
	}

	private drawSoftLine(
		ctx: CanvasRenderingContext2D,
		from: Point,
		to: Point,
		size: number,
		color: string,
		hardness: number,
		compositeOp: GlobalCompositeOperation
	) {
		ctx.save()
		ctx.globalCompositeOperation = compositeOp
		ctx.strokeStyle = color
		ctx.lineWidth = size
		ctx.lineCap = 'round'
		ctx.lineJoin = 'round'
		ctx.globalAlpha = 1
		ctx.beginPath()
		ctx.moveTo(from.x, from.y)
		ctx.lineTo(to.x, to.y)
		ctx.stroke()
		ctx.restore()

		// Fill gaps with circles for softness
		const dist = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2)
		const steps = Math.max(1, Math.ceil(dist / (size * 0.25)))
		for (let i = 0; i <= steps; i++) {
			const t = i / steps
			const px = from.x + (to.x - from.x) * t
			const py = from.y + (to.y - from.y) * t
			this.drawSoftCircle(ctx, px, py, size, color, hardness, compositeOp)
		}
	}

	private colorMatch(
		data: Uint8ClampedArray,
		w: number,
		px: number,
		py: number,
		br: number,
		bg: number,
		bb: number,
		threshold: number,
		alphaAware: boolean = true
	): boolean {
		const idx = (py * w + px) * 4
		const r = data[idx]
		const g = data[idx + 1]
		const b = data[idx + 2]
		const a = data[idx + 3]

		if (alphaAware && a < 20) return true
		const dr = r - br
		const dg = g - bg
		const db = b - bb
		const rw = 0.30
		const gw = 0.59
		const bw = 0.11
		let distSq = rw * dr * dr + gw * dg * dg + bw * db * db
		if (alphaAware && a < 128) {
			const alphaFactor = a / 255
			distSq *= (0.2 + 0.8 * alphaFactor)
		}
		const normalizedThreshold = threshold / 3
		return distSq <= normalizedThreshold
	}

	private median(nums: number[]): number {
		const sorted = [...nums].sort((a, b) => a - b)
		const mid = Math.floor(sorted.length / 2)
		return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid]
	}

	private sampleBackgroundColor(
		data: Uint8ClampedArray,
		w: number,
		h: number,
		samplePoints: Array<[number, number]>
	): { r: number; g: number; b: number } | null {
		const rs: number[] = []
		const gs: number[] = []
		const bs: number[] = []
		for (const [sx, sy] of samplePoints) {
			if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue
			const idx = (sy * w + sx) * 4
			if (data[idx + 3] > 20) {
				rs.push(data[idx])
				gs.push(data[idx + 1])
				bs.push(data[idx + 2])
			}
		}
		if (rs.length === 0) return null
		return { r: this.median(rs), g: this.median(gs), b: this.median(bs) }
	}

	private performFloodFill(
		data: Uint8ClampedArray,
		w: number,
		h: number,
		seeds: Array<[number, number]>,
		bgR: number,
		bgG: number,
		bgB: number,
		threshold: number,
		mask: Uint8Array,
		bounds?: { x: number; y: number; w: number; h: number }
	): Set<number> {
		const VISITED = 2
		const QUEUED = 1
		const toErase = new Set<number>()
		const queue: Array<[number, number]> = []

		const minX = bounds ? bounds.x : 0
		const minY = bounds ? bounds.y : 0
		const maxX = bounds ? bounds.x + bounds.w : w
		const maxY = bounds ? bounds.y + bounds.h : h

		for (const [sx, sy] of seeds) {
			if (sx < minX || sx >= maxX || sy < minY || sy >= maxY) continue
			const idx = (sy - minY) * w + (sx - minX)
			if (mask[idx] !== 0) continue
			if (!this.colorMatch(data, w, sx, sy, bgR, bgG, bgB, threshold)) continue
			mask[idx] = QUEUED
			queue.push([sx, sy])
		}

		const D4: Array<[number, number]> = [
			[1, 0], [-1, 0], [0, 1], [0, -1]
		]

		let head = 0
		while (head < queue.length) {
			const [x, y] = queue[head++]
			const localX = x - minX
			const localY = y - minY
			const idx = localY * w + localX
			if (mask[idx] === VISITED) continue
			mask[idx] = VISITED
			toErase.add(idx)

			for (const [dx, dy] of D4) {
				const nx = x + dx
				const ny = y + dy
				if (nx < minX || nx >= maxX || ny < minY || ny >= maxY) continue
				const nlx = nx - minX
				const nly = ny - minY
				const nidx = nly * w + nlx
				if (mask[nidx] !== 0) continue
				if (!this.colorMatch(data, w, nx, ny, bgR, bgG, bgB, threshold)) continue
				mask[nidx] = QUEUED
				queue.push([nx, ny])
			}
		}

		return toErase
	}

	private performGlobalColorMatch(
		data: Uint8ClampedArray,
		w: number,
		h: number,
		bgR: number,
		bgG: number,
		bgB: number,
		threshold: number,
		mask: Uint8Array,
		bounds?: { x: number; y: number; w: number; h: number }
	): Set<number> {
		const VISITED = 2
		const toErase = new Set<number>()
		const minX = bounds ? bounds.x : 0
		const minY = bounds ? bounds.y : 0
		const maxX = bounds ? bounds.x + bounds.w : w
		const maxY = bounds ? bounds.y + bounds.h : h

		for (let y = minY; y < maxY; y++) {
			for (let x = minX; x < maxX; x++) {
				if (this.colorMatch(data, w, x, y, bgR, bgG, bgB, threshold)) {
					const lx = x - minX
					const ly = y - minY
					const idx = ly * w + lx
					mask[idx] = VISITED
					toErase.add(idx)
				}
			}
		}
		return toErase
	}

	private colorDist(
		data: Uint8ClampedArray,
		w: number,
		px: number,
		py: number,
		br: number,
		bg: number,
		bb: number
	): number {
		const idx = (py * w + px) * 4
		const r = data[idx]
		const g = data[idx + 1]
		const b = data[idx + 2]
		const rw = 0.30, gw = 0.59, bw = 0.11
		const dr = r - br, dg = g - bg, db = b - bb
		return Math.sqrt(rw * dr * dr + gw * dg * dg + bw * db * db)
	}

	private softEdgeProcess(
		data: Uint8ClampedArray,
		mask: Uint8Array,
		toErase: Set<number>,
		w: number,
		h: number,
		bgR: number,
		bgG: number,
		bgB: number,
		normStrict: number,
		feather: number,
		bounds?: { x: number; y: number; w: number; h: number }
	): void {
		const ERASED = 2
		const SOFT = 3
		const I = (lx: number, ly: number) => ly * w + lx
		const inB = (lx: number, ly: number) => lx >= 0 && lx < w && ly >= 0 && ly < h
		const RW=0.30, GW=0.59, BW=0.11

		for (const i of toErase) {
			mask[i] = ERASED
			data[i*4+3] = 0
		}

		const m = (lx:number, ly:number) => inB(lx,ly) ? mask[I(lx,ly)] : -1
		const isE = (lx:number, ly:number) => m(lx,ly) === ERASED
		const isS = (lx:number, ly:number) => m(lx,ly) === SOFT
		const isGone = (lx:number, ly:number) => m(lx,ly) === ERASED || m(lx,ly) === SOFT
		const isFg = (lx:number, ly:number) => m(lx,ly) === 0

		const distToBg = (lx:number, ly:number): number => {
			const i = I(lx,ly)
			const dr=data[i*4]-bgR, dg=data[i*4+1]-bgG, db=data[i*4+2]-bgB
			return Math.sqrt(RW*dr*dr + GW*dg*dg + BW*db*db)
		}

		const sampleLocalFg = (lx:number, ly:number): {r:number;g:number;b:number;valid:boolean} => {
			let sr=0, sg=0, sb=0, cnt=0
			const D4: Array<[number,number]> = [[1,0],[-1,0],[0,1],[0,-1]]
			let goneDx=0, goneDy=0
			for (const [dx,dy] of D4) {
				if (isGone(lx+dx,ly+dy)) { goneDx-=dx; goneDy-=dy }
			}
			const tryAdd = (nx:number, ny:number) => {
				if (isFg(nx,ny)) {
					const ni = I(nx,ny)
					sr+=data[ni*4]; sg+=data[ni*4+1]; sb+=data[ni*4+2]; cnt++
				}
			}
			if (goneDx !== 0 || goneDy !== 0) {
				const ax = goneDx>0?1:-1, ay = goneDy>0?1:-1
				tryAdd(lx+ax,ly)
				tryAdd(lx,ly+ay)
				tryAdd(lx+ax,ly+ay)
			}
			for (const [dx,dy] of D4) tryAdd(lx+dx,ly+dy)
			for (let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
				if(dx===0&&dy===0)continue; tryAdd(lx+dx,ly+dy)
			}
			if (cnt === 0) return {r:0,g:0,b:0,valid:false}
			return {r:sr/cnt, g:sg/cnt, b:sb/cnt, valid:true}
		}

		const distToLocalFg = (lx:number, ly:number, fg:{r:number;g:number;b:number}): number => {
			const i = I(lx,ly)
			const dr=data[i*4]-fg.r, dg=data[i*4+1]-fg.g, db=data[i*4+2]-fg.b
			return Math.sqrt(RW*dr*dr + GW*dg*dg + BW*db*db)
		}

		const MAX_ITER = Math.max(4, Math.round(feather) + 4)
		for (let iter = 0; iter < MAX_ITER; iter++) {
			const updates: Array<{i:number; a:number}> = []
			const iterStrict = normStrict * Math.pow(0.85, iter)

			for (let ly = 0; ly < h; ly++) {
				for (let lx = 0; lx < w; lx++) {
					const i = I(lx,ly)
					if (isE(lx,ly) || isS(lx,ly)) continue
					const origA = data[i*4+3]
					if (origA < 5) { updates.push({i, a:0}); continue }

					let d4E=0, d4G=0, d8E=0, d8G=0
					for (let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
						if(dx===0&&dy===0)continue
						const g = isGone(lx+dx,ly+dy)
						const e = isE(lx+dx,ly+dy)
						if(g){
							d8G++
							if(dx===0||dy===0) d4G++
						}
						if(e){
							d8E++
							if(dx===0||dy===0) d4E++
						}
					}
					if (d8G === 0) continue

					const convexCorner =
						(isE(lx-1,ly)&&isE(lx,ly-1))||(isE(lx+1,ly)&&isE(lx,ly-1))||
						(isE(lx-1,ly)&&isE(lx,ly+1))||(isE(lx+1,ly)&&isE(lx,ly+1))

					const touchErased = d8E > 0
					if (!convexCorner && !touchErased && d4G === 0) {
						if (d8G < 3) continue
					}

					const dBg = distToBg(lx,ly)
					const fg = sampleLocalFg(lx,ly)
					if (!fg.valid) continue
					const dFg = distToLocalFg(lx,ly,fg)

					const totalD = dBg + dFg
					if (totalD < 1) continue
					const bgRatio = dBg / totalD

					let alpha: number
					const opaque = origA >= 240

					if (convexCorner) {
						if (bgRatio > 0.72) { continue }
						const fgFrac = Math.max(0.15, bgRatio)
						alpha = Math.round(220 * fgFrac * fgFrac)
						alpha = Math.max(2, alpha)
					} else {
						if (bgRatio > 0.68) { continue }

						if (!touchErased && d4G === 0) {
							if (d8G < 2) continue
							if (bgRatio > 0.4) { continue }
						}

						const fgFrac = bgRatio
						alpha = Math.round(255 * fgFrac * fgFrac)

						if (opaque && d4E === 0 && bgRatio > 0.45) {
							alpha = Math.max(alpha, 180)
						}
						alpha = Math.max(1, alpha)
					}

					if (dBg < iterStrict * 0.2) alpha = 0
					if (alpha < origA) {
						updates.push({i, a: alpha})
					}
				}
			}

			if (updates.length === 0) break
			for (const {i, a} of updates) {
				if (a <= 2) {
					mask[i] = ERASED
					toErase.add(i)
					data[i*4+3] = 0
				} else {
					mask[i] = SOFT
					data[i*4+3] = a
				}
			}
		}

		if (feather > 0) {
			const D4: Array<[number, number]> = [[1,0],[-1,0],[0,1],[0,-1]]
			const fr = Math.max(1, Math.round(feather))
			const vD = new Float32Array(w*h).fill(Infinity)
			const vQ: number[] = []
			for (let ly = 0; ly < h; ly++) {
				for (let lx = 0; lx < w; lx++) {
					const i = I(lx, ly)
					if (mask[i] !== ERASED) continue
					let bd = false
					for (const [dx,dy] of D4) {
						const nx=lx+dx,ny=ly+dy
						if(!inB(nx,ny)){bd=true;break}
						if(mask[I(nx,ny)]!==ERASED){bd=true;break}
					}
					if(bd){vD[i]=0;vQ.push(i)}
				}
			}
			let vh = 0
			while(vh<vQ.length){
				const i=vQ[vh++], d=vD[i]
				const lx=i%w, ly=Math.floor(i/w)
				for(const [dx,dy] of D4){
					const nx=lx+dx,ny=ly+dy
					if(!inB(nx,ny))continue
					const ni=I(nx,ny)
					if(mask[ni]!==ERASED)continue
					const nd=d+1
					if(nd<vD[ni]){vD[ni]=nd;vQ.push(ni)}
				}
			}
			for(let i=0;i<w*h;i++){
				if(mask[i]!==ERASED)continue
				const d=vD[i]
				if(d<fr&&isFinite(d)){
					const t=d/fr
					const fa=Math.round(18*(1-t)*(1-t))
					if(fa>data[i*4+3])data[i*4+3]=fa
				}else{
					data[i*4+3]=0
				}
			}
		}
	}

	private applyErasePipeline(
		imgData: ImageData,
		ox: number,
		oy: number,
		w: number,
		h: number,
		seeds: Array<[number, number]>,
		bgColor: { r: number; g: number; b: number } | null,
		samplePoints: Array<[number, number]>,
		tolerance: number,
		contiguous: boolean,
		feather: number,
		bounds?: { x: number; y: number; w: number; h: number }
	): Uint8Array {
		const data = imgData.data
		const tolFactor = tolerance / 100
		const threshold = tolFactor * tolFactor * 3 * 255 * 255
		const normStrict = Math.sqrt(threshold / 3)

		let bg = bgColor
		if (!bg) {
			bg = this.sampleBackgroundColor(data, w, h, samplePoints)
			if (!bg) {
				const cx = Math.floor(w / 2)
				const cy = Math.floor(h / 2)
				const idx = (cy * w + cx) * 4
				bg = { r: data[idx], g: data[idx + 1], b: data[idx + 2] }
			}
		}
		const bgR = bg.r, bgG = bg.g, bgB = bg.b

		const mask = new Uint8Array(w * h)
		let toErase: Set<number>

		if (contiguous) {
			toErase = this.performFloodFill(data, w, h, seeds, bgR, bgG, bgB, threshold, mask, bounds)
		} else {
			toErase = this.performGlobalColorMatch(data, w, h, bgR, bgG, bgB, threshold, mask, bounds)
		}

		this.softEdgeProcess(data, mask, toErase, w, h, bgR, bgG, bgB, normStrict, feather, bounds)

		return mask
	}

	private executeRectBgRemove(rect: Rect) {
		const origRx = Math.floor(rect.x)
		const origRy = Math.floor(rect.y)
		const origRw = Math.floor(rect.w)
		const origRh = Math.floor(rect.h)
		if (origRw < 3 || origRh < 3) return

		const PADDING = 6
		const rx = Math.max(0, origRx - PADDING)
		const ry = Math.max(0, origRy - PADDING)
		const rw = Math.min(this.naturalWidth - rx, origRw + PADDING * 2)
		const rh = Math.min(this.naturalHeight - ry, origRh + PADDING * 2)
		if (rw < 3 || rh < 3) return

		const offsetX = origRx - rx
		const offsetY = origRy - ry

		const imgData = this.baseCtx.getImageData(rx, ry, rw, rh)

		const edgeSeeds: Array<[number, number]> = []
		const samplePoints: Array<[number, number]> = []
		for (let x = 0; x < rw; x++) {
			edgeSeeds.push([x, 0])
			edgeSeeds.push([x, rh - 1])
			samplePoints.push([x, 0])
			samplePoints.push([x, rh - 1])
		}
		for (let y = 1; y < rh - 1; y++) {
			edgeSeeds.push([0, y])
			edgeSeeds.push([rw - 1, y])
			samplePoints.push([0, y])
			samplePoints.push([rw - 1, y])
		}
		const corners: Array<[number, number]> = [
			[offsetX + 1, offsetY + 1],
			[offsetX + origRw - 2, offsetY + 1],
			[offsetX + 1, offsetY + origRh - 2],
			[offsetX + origRw - 2, offsetY + origRh - 2]
		]
		for (const [cx, cy] of corners) {
			samplePoints.push([cx, cy])
		}

		const bg = this.sampleBackgroundColor(imgData.data, rw, rh, samplePoints)

		const seeds = edgeSeeds
		this.applyErasePipeline(
			imgData, 0, 0, rw, rh,
			seeds, bg, samplePoints,
			this.eraser.tolerance, this.eraser.contiguous, this.eraser.feather,
			{ x: 0, y: 0, w: rw, h: rh }
		)

		const resultImgData = this.baseCtx.createImageData(origRw, origRh)
		const srcData = imgData.data
		const dstData = resultImgData.data
		for (let y = 0; y < origRh; y++) {
			for (let x = 0; x < origRw; x++) {
				const srcIdx = ((y + offsetY) * rw + (x + offsetX)) * 4
				const dstIdx = (y * origRw + x) * 4
				dstData[dstIdx] = srcData[srcIdx]
				dstData[dstIdx + 1] = srcData[srcIdx + 1]
				dstData[dstIdx + 2] = srcData[srcIdx + 2]
				dstData[dstIdx + 3] = srcData[srcIdx + 3]
			}
		}

		this.baseCtx.putImageData(resultImgData, origRx, origRy)
		this.history.pushState(this.baseCtx)
	}

	private executeClickBgRemove(cx: number, cy: number) {
		if (!this.imageLoaded) return
		if (cx < 0 || cx >= this.naturalWidth || cy < 0 || cy >= this.naturalHeight) return

		this.clearClickErasePreview()

		const w = this.naturalWidth
		const h = this.naturalHeight
		const imgData = this.baseCtx.getImageData(0, 0, w, h)
		const data = imgData.data

		const clickIdx = (cy * w + cx) * 4
		if (data[clickIdx + 3] < 10) return

		const seeds: Array<[number, number]> = [[cx, cy]]
		const samplePts: Array<[number, number]> = [[cx, cy]]

		const mask = this.applyErasePipeline(
			imgData, 0, 0, w, h,
			seeds, null, samplePts,
			this.eraser.tolerance, this.eraser.contiguous, this.eraser.feather
		)

		const VISITED = 2
		const EDGE_SOFT = 3
		let minX = w, minY = h, maxX = 0, maxY = 0
		let found = false
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const m = mask[y * w + x]
				if (m === VISITED || m === EDGE_SOFT) {
					found = true
					if (x < minX) minX = x
					if (y < minY) minY = y
					if (x > maxX) maxX = x
					if (y > maxY) maxY = y
				}
			}
		}

		this.clickErasePreviewMask = null
		this.clickErasePreviewData = new Uint8ClampedArray(data)
		this.clickErasePreviewW = w
		this.clickErasePreviewH = h
		this.clickErasePreviewOffsetX = 0
		this.clickErasePreviewOffsetY = 0
		if (found) {
			this.clickEraseBBox = { minX, minY, maxX, maxY }
		} else {
			this.clickEraseBBox = null
		}
		this.startMarchingAnts()

		const self = this
		this.clickEraseApplyTimer = window.setTimeout(() => {
			self.applyClickEraseResult()
		}, 400)
	}

	private applyClickEraseResult() {
		if (!this.clickErasePreviewData) {
			this.clearClickErasePreview()
			return
		}
		const w = this.clickErasePreviewW
		const h = this.clickErasePreviewH
		const resultData = this.clickErasePreviewData

		const resultImgData = this.baseCtx.createImageData(w, h)
		resultImgData.data.set(resultData)
		this.baseCtx.putImageData(resultImgData, 0, 0)
		this.history.pushState(this.baseCtx)
		this.clearClickErasePreview()
		this.clearOverlay()
		this.render()
		this.emitStateChange()
	}

	private clearClickErasePreview() {
		if (this.marchingAntsRAF !== null) {
			cancelAnimationFrame(this.marchingAntsRAF)
			this.marchingAntsRAF = null
		}
		if (this.clickEraseApplyTimer !== null) {
			clearTimeout(this.clickEraseApplyTimer)
			this.clickEraseApplyTimer = null
		}
		this.clickErasePreviewMask = null
		this.clickErasePreviewData = null
		this.clickErasePreviewW = 0
		this.clickErasePreviewH = 0
		this.clickEraseBBox = null
		this.marchingAntsOffset = 0
	}

	private startMarchingAnts() {
		const animate = () => {
			this.marchingAntsOffset = (this.marchingAntsOffset + 1) % 8
			this.renderOverlay()
			if (this.clickErasePreviewMask) {
				this.marchingAntsRAF = requestAnimationFrame(animate)
			}
		}
		this.marchingAntsRAF = requestAnimationFrame(animate)
	}

	private initDefaultScreenshotRect() {
		const w = this.naturalWidth
		const h = this.naturalHeight
		if (w > 0 && h > 0) {
			this.screenshotRect = {
				x: Math.round(w * 0.1),
				y: Math.round(h * 0.1),
				w: Math.round(w * 0.8),
				h: Math.round(h * 0.8)
			}
		} else {
			this.screenshotRect = null
		}
	}

	private screenshotDragMode: 'new' | 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | null = null
	private screenshotDragStart: { clientX: number; clientY: number; startRect: { x: number; y: number; w: number; h: number } } | null = null
	private readonly HANDLE_SIZE = 14

	private getScreenshotHandleAt(px: number, py: number): typeof this.screenshotDragMode {
		const rect = this.screenshotRect
		if (!rect) return null
		const half = this.HANDLE_SIZE / 2 / this.zoom
		const { x, y, w, h } = rect
		const right = x + w
		const bottom = y + h

		const near = (v: number, target: number) => Math.abs(v - target) <= half

		if (near(px, x) && near(py, y)) return 'nw'
		if (near(px, right) && near(py, y)) return 'ne'
		if (near(px, right) && near(py, bottom)) return 'se'
		if (near(px, x) && near(py, bottom)) return 'sw'
		if (near(py, y) && px > x && px < right) return 'n'
		if (near(px, right) && py > y && py < bottom) return 'e'
		if (near(py, bottom) && px > x && px < right) return 's'
		if (near(px, x) && py > y && py < bottom) return 'w'
		if (px >= x && px <= right && py >= y && py <= bottom) return 'move'
		return null
	}

	private handleScreenshotPointerDown(pt: Point) {
		const handle = this.getScreenshotHandleAt(pt.x, pt.y)
		if (handle && this.screenshotRect) {
			this.screenshotDragMode = handle
			this.screenshotDragStart = {
				clientX: pt.x,
				clientY: pt.y,
				startRect: { ...this.screenshotRect }
			}
		} else {
			this.screenshotDragMode = 'new'
			this.screenshotDragStart = {
				clientX: pt.x,
				clientY: pt.y,
				startRect: { x: pt.x, y: pt.y, w: 0, h: 0 }
			}
			this.screenshotRect = { x: pt.x, y: pt.y, w: 0, h: 0 }
		}
	}

	private handleScreenshotPointerMove(pt: Point) {
		if (!this.screenshotDragMode || !this.screenshotDragStart || !this.screenshotRect) return
		const imgW = this.naturalWidth
		const imgH = this.naturalHeight
		const sr = this.screenshotDragStart.startRect
		const minSize = 10

		if (this.screenshotDragMode === 'new') {
			const x = Math.min(pt.x, sr.x)
			const y = Math.min(pt.y, sr.y)
			const w = Math.abs(pt.x - sr.x)
			const h = Math.abs(pt.y - sr.y)
			this.screenshotRect = {
				x: Math.max(0, Math.min(imgW, x)),
				y: Math.max(0, Math.min(imgH, y)),
				w: Math.max(0, Math.min(w, imgW, imgH)),
				h: Math.max(0, Math.min(h, imgW, imgH))
			}
		} else if (this.screenshotDragMode === 'move') {
			const dx = pt.x - this.screenshotDragStart.clientX
			const dy = pt.y - this.screenshotDragStart.clientY
			let nx = sr.x + dx
			let ny = sr.y + dy
			nx = Math.max(0, Math.min(imgW - sr.w, nx))
			ny = Math.max(0, Math.min(imgH - sr.h, ny))
			this.screenshotRect = { x: nx, y: ny, w: sr.w, h: sr.h }
		} else {
			let { x, y, w, h } = sr
			const right = sr.x + sr.w
			const bottom = sr.y + sr.h
			const dx = pt.x - this.screenshotDragStart.clientX
			const dy = pt.y - this.screenshotDragStart.clientY

			switch (this.screenshotDragMode) {
				case 'n':
					y = Math.min(sr.y + dy, bottom - minSize)
					h = bottom - y
					break
				case 's':
					h = Math.max(minSize, sr.y + dy - sr.y + h - sr.h)
					h = Math.max(minSize, sr.h + dy)
					break
				case 'w':
					x = Math.min(sr.x + dx, right - minSize)
					w = right - x
					break
				case 'e':
					w = Math.max(minSize, sr.w + dx)
					break
				case 'nw':
					x = Math.min(sr.x + dx, right - minSize)
					y = Math.min(sr.y + dy, bottom - minSize)
					w = right - x
					h = bottom - y
					break
				case 'ne':
					y = Math.min(sr.y + dy, bottom - minSize)
					w = Math.max(minSize, sr.w + dx)
					h = bottom - y
					break
				case 'sw':
					x = Math.min(sr.x + dx, right - minSize)
					w = right - x
					h = Math.max(minSize, sr.h + dy)
					break
				case 'se':
					w = Math.max(minSize, sr.w + dx)
					h = Math.max(minSize, sr.h + dy)
					break
			}

			x = Math.max(0, x)
			y = Math.max(0, y)
			w = Math.max(minSize, Math.min(w, imgW - x))
			h = Math.max(minSize, Math.min(h, imgH - y))

			this.screenshotRect = { x, y, w, h }
		}
		this.renderOverlay()
	}

	private handleScreenshotPointerUp() {
		this.screenshotDragMode = null
		this.screenshotDragStart = null
		if (this.screenshotRect && (this.screenshotRect.w < 10 || this.screenshotRect.h < 10)) {
			this.screenshotRect = null
		}
		this.renderOverlay()
	}

	clearAnnotations(): void {
		if (!this.imageLoaded) return
		this.baseCtx.clearRect(0, 0, this.naturalWidth, this.naturalHeight)
		if (this.sourceImage) {
			this.baseCtx.drawImage(this.sourceImage, 0, 0)
		}
		this.history.clear()
		this.history.pushState(this.baseCtx)
		this.screenshotRect = null
		this.detectedSubjects = []
		this.selectedSubjectIdx = -1
		this.hoverSubjectIdx = -1
		this.subjectSelectRect = null
		this.clearOverlay()
		this.render()
		if (this.tool === 'subject-select') {
			this.detectAllSubjects()
		} else {
			this.emitStateChange()
		}
	}

	undo(): boolean {
		const result = this.history.undo(this.baseCtx)
		if (result) {
			this.detectedSubjects = []
			this.selectedSubjectIdx = -1
			this.hoverSubjectIdx = -1
			this.subjectSelectRect = null
			this.clearOverlay()
			this.render()
			if (this.tool === 'subject-select') {
				this.detectAllSubjects()
			} else {
				this.emitStateChange()
			}
		}
		return result
	}

	redo(): boolean {
		const result = this.history.redo(this.baseCtx)
		if (result) {
			this.detectedSubjects = []
			this.selectedSubjectIdx = -1
			this.hoverSubjectIdx = -1
			this.subjectSelectRect = null
			this.clearOverlay()
			this.render()
			if (this.tool === 'subject-select') {
				this.detectAllSubjects()
			} else {
				this.emitStateChange()
			}
		}
		return result
	}

	canUndo(): boolean {
		return this.history.canUndo()
	}

	canRedo(): boolean {
		return this.history.canRedo()
	}

	getBrushSettings(): BrushSettings {
		return { ...this.brush }
	}

	setBrushSize(size: number): void {
		this.brush.size = Math.max(1, Math.min(100, size))
		this.emitStateChange()
	}

	getEraserSettings(): EraserSettings {
		return { ...this.eraser }
	}

	setEraserSize(size: number): void {
		this.eraser.size = Math.max(1, Math.min(200, size))
		this.emitStateChange()
	}

	setEraserMode(mode: EraserMode): void {
		this.eraser.mode = mode
		this.isDrawingEraseRect = false
		this.eraseRectStart = null
		this.eraseRect = null
		this.clearClickErasePreview()
		this.clearOverlay()
		this.render()
		this.emitStateChange()
	}

	setEraserFeather(feather: number): void {
		this.eraser.feather = Math.max(0, Math.min(20, feather))
		this.emitStateChange()
	}

	setEraserTolerance(tolerance: number): void {
		this.eraser.tolerance = Math.max(1, Math.min(100, tolerance))
		this.emitStateChange()
	}

	setEraserContiguous(contiguous: boolean): void {
		this.eraser.contiguous = contiguous
		this.emitStateChange()
	}

	setEraserSampleCorners(sampleCorners: boolean): void {
		this.eraser.sampleCorners = sampleCorners
		this.emitStateChange()
	}

	getEraseRect(): Rect | null {
		return this.eraseRect ? { ...this.eraseRect } : null
	}

	setScreenshotRect(rect: { x: number; y: number; w: number; h: number } | null): void {
		this.screenshotRect = rect ? { ...rect } : null
		this.renderOverlay()
	}

	getScreenshotRect(): { x: number; y: number; w: number; h: number } | null {
		return this.screenshotRect ? { ...this.screenshotRect } : null
	}

	getTransform(): TransformState {
		return { ...this.transform }
	}

	getOffset(): { x: number; y: number } {
		return { x: this.offsetX, y: this.offsetY }
	}

	setOffset(x: number, y: number): void {
		this.offsetX = x
		this.offsetY = y
	}

	private clearOverlay() {
		this.overlayCtx.clearRect(0, 0, this.naturalWidth, this.naturalHeight)
	}

	private renderOverlay() {
		this.clearOverlay()
		if (!this.imageLoaded) return

		if (this.currentStroke.length > 0 && (this.tool === 'brush' || (this.tool === 'eraser' && this.eraser.mode === 'brush'))) {
			for (const pt of this.currentStroke) {
				if (this.tool === 'brush') {
					this.drawSoftCircle(this.overlayCtx, pt.x, pt.y, this.brush.size, this.brush.color, this.brush.hardness, 'source-over')
				} else {
					this.drawSoftCircle(this.overlayCtx, pt.x, pt.y, this.eraser.size, 'rgba(255,255,255,0.5)', 0.5, 'source-over')
				}
			}
		}

		if (this.tool === 'eraser' && this.eraser.mode === 'rect-bg-remove' && this.eraseRect && this.eraseRect.w > 0 && this.eraseRect.h > 0) {
			const ctx = this.overlayCtx
			ctx.save()
			ctx.strokeStyle = '#f97316'
			ctx.lineWidth = 2 / Math.max(this.zoom, 0.1)
			ctx.setLineDash([6 / Math.max(this.zoom, 0.1), 4 / Math.max(this.zoom, 0.1)])
			ctx.strokeRect(this.eraseRect.x, this.eraseRect.y, this.eraseRect.w, this.eraseRect.h)
			ctx.setLineDash([])
			ctx.restore()
		}

		if (this.clickEraseBBox && this.clickErasePreviewData) {
			const ctx = this.overlayCtx
			const { minX, minY, maxX, maxY } = this.clickEraseBBox
			ctx.save()
			ctx.strokeStyle = '#f97316'
			ctx.lineWidth = 2 / Math.max(this.zoom, 0.1)
			ctx.setLineDash([6 / Math.max(this.zoom, 0.1), 4 / Math.max(this.zoom, 0.1)])
			ctx.lineDashOffset = -this.marchingAntsOffset
			ctx.strokeRect(minX, minY, maxX - minX + 1, maxY - minY + 1)
			ctx.setLineDash([])
			ctx.restore()
		}

		if ((this.tool === 'screenshot' || this.tool === 'crop') && this.screenshotRect) {
			this.drawScreenshotOverlay(this.overlayCtx)
		}

		if (this.tool === 'subject-select' && this.detectedSubjects.length > 0) {
			this.drawSubjectSelectOverlay(this.overlayCtx)
		}
	}

	private drawSubjectSelectOverlay(ctx: CanvasRenderingContext2D) {
		if (this.subjectOverlayCache) {
			ctx.drawImage(this.subjectOverlayCache, 0, 0)
		}

		const drawSubjectHighlight = (s: DetectedSubject, fillAlpha: number, edgeAlpha: number, outsetPx: number) => {
			const bw = s.fillMaskW, bh = s.fillMaskH
			const pen = Math.max(0, Math.floor(outsetPx))
			const pad = pen + 1
			const cw = bw + pad * 2
			const ch = bh + pad * 2

			const tmp = document.createElement('canvas')
			tmp.width = cw
			tmp.height = ch
			const tctx = tmp.getContext('2d')
			if (!tctx) return

			const imgData = tctx.createImageData(cw, ch)
			const d = imgData.data

			for (let py = 0; py < bh; py++) {
				for (let px = 0; px < bw; px++) {
					if (!s.fillMask[py * bw + px]) continue
					const di = ((py + pad) * cw + (px + pad)) * 4
					d[di] = 167
					d[di + 1] = 139
					d[di + 2] = 250
					d[di + 3] = Math.round(fillAlpha)
				}
			}

			for (const [ex, ey] of s.edgePixels) {
				const cx = ex - s.minX + pad
				const cy = ey - s.minY + pad
				for (let dy = -pen; dy <= pen; dy++) {
					for (let dx = -pen; dx <= pen; dx++) {
						const lx = cx + dx
						const ly = cy + dy
						if (lx < 0 || lx >= cw || ly < 0 || ly >= ch) continue
						const di = (ly * cw + lx) * 4
						if (d[di + 3] < edgeAlpha) {
							d[di] = 167
							d[di + 1] = 139
							d[di + 2] = 250
							d[di + 3] = Math.round(edgeAlpha)
						}
					}
				}
			}

			tctx.putImageData(imgData, 0, 0)
			ctx.drawImage(tmp, s.minX - pad, s.minY - pad)
		}

		ctx.save()

		const margin = this.subjectSelect.tightFit ? 0 : this.subjectSelect.margin
		const outset = margin

		if (this.hoverSubjectIdx >= 0 && this.hoverSubjectIdx !== this.selectedSubjectIdx
			&& this.hoverSubjectIdx < this.detectedSubjects.length) {
			drawSubjectHighlight(this.detectedSubjects[this.hoverSubjectIdx], 25, 140, Math.max(1, Math.round(outset * 0.6)))
		}

		if (this.selectedSubjectIdx >= 0 && this.selectedSubjectIdx < this.detectedSubjects.length) {
			drawSubjectHighlight(this.detectedSubjects[this.selectedSubjectIdx], 50, 240, outset)
		}

		ctx.restore()
	}

	private drawScreenshotOverlay(ctx: CanvasRenderingContext2D) {
		const rect = this.screenshotRect
		if (!rect) return
		const w = this.naturalWidth
		const h = this.naturalHeight

		ctx.save()
		ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
		ctx.fillRect(0, 0, w, rect.y)
		ctx.fillRect(0, rect.y + rect.h, w, h - rect.y - rect.h)
		ctx.fillRect(0, rect.y, rect.x, rect.h)
		ctx.fillRect(rect.x + rect.w, rect.y, w - rect.x - rect.w, rect.h)

		ctx.strokeStyle = '#22d3ee'
		ctx.lineWidth = 2 / Math.max(this.zoom, 0.1)
		ctx.setLineDash([8 / Math.max(this.zoom, 0.1), 4 / Math.max(this.zoom, 0.1)])
		ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
		ctx.setLineDash([])

		ctx.fillStyle = '#22d3ee'
		ctx.strokeStyle = '#ffffff'
		ctx.lineWidth = 1
		const handleSize = this.HANDLE_SIZE / Math.max(this.zoom, 0.1)
		const handles: Array<[number, number]> = [
			[rect.x, rect.y],
			[rect.x + rect.w / 2, rect.y],
			[rect.x + rect.w, rect.y],
			[rect.x + rect.w, rect.y + rect.h / 2],
			[rect.x + rect.w, rect.y + rect.h],
			[rect.x + rect.w / 2, rect.y + rect.h],
			[rect.x, rect.y + rect.h],
			[rect.x, rect.y + rect.h / 2]
		]
		for (const [hx, hy] of handles) {
			ctx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize)
			ctx.strokeRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize)
		}
		ctx.restore()
	}

	render(): void {
		this.renderOverlay()
	}

	private recomputeSubjectRectFromSelection() {
		if (this.selectedSubjectIdx < 0 || this.selectedSubjectIdx >= this.detectedSubjects.length) {
			this.subjectSelectRect = null
			return
		}
		const subj = this.detectedSubjects[this.selectedSubjectIdx]
		const w = this.naturalWidth, h = this.naturalHeight
		const margin = this.subjectSelect.tightFit ? 0 : this.subjectSelect.margin
		const rx = Math.max(0, subj.minX - margin)
		const ry = Math.max(0, subj.minY - margin)
		const rw = Math.min(w - rx, subj.maxX - subj.minX + 1 + margin * 2)
		const rh = Math.min(h - ry, subj.maxY - subj.minY + 1 + margin * 2)
		if (rw < 3 || rh < 3) {
			this.subjectSelectRect = null
		} else {
			this.subjectSelectRect = { x: rx, y: ry, w: rw, h: rh }
		}
	}

	private detectAllSubjects() {
		if (!this.imageLoaded) return
		const w = this.naturalWidth
		const h = this.naturalHeight
		this.detectedSubjects = []
		this.selectedSubjectIdx = -1
		this.hoverSubjectIdx = -1
		this.subjectSelectRect = null

		const imgData = this.baseCtx.getImageData(0, 0, w, h)
		const data = imgData.data

		const edgeSamplePts: Array<[number, number]> = []
		for (let x = 0; x < w; x++) {
			edgeSamplePts.push([x, 0])
			edgeSamplePts.push([x, h - 1])
		}
		for (let y = 1; y < h - 1; y++) {
			edgeSamplePts.push([0, y])
			edgeSamplePts.push([w - 1, y])
		}
		const bg = this.sampleBackgroundColor(data, w, h, edgeSamplePts)
		if (!bg) {
			this.renderOverlay()
			this.emitStateChange()
			return
		}
		const bgR = bg.r, bgG = bg.g, bgB = bg.b

		const RW = 0.30, GW = 0.59, BW = 0.11
		const strictTolFactor = 0.22
		const strictThreshSq = strictTolFactor * strictTolFactor * 255 * 255

		const isBgColor = (px: number, py: number): boolean => {
			if (px < 0 || px >= w || py < 0 || py >= h) return true
			const idx = (py * w + px) * 4
			const a = data[idx + 3]
			if (a < 20) return true
			const r = data[idx], g = data[idx + 1], b = data[idx + 2]
			const dr = r - bgR, dg = g - bgG, db = b - bgB
			const distSq = RW * dr * dr + GW * dg * dg + BW * db * db
			return distSq <= strictThreshSq
		}

		const BG_MASK = 1
		const bgMask = new Uint8Array(w * h)
		const queue: Array<number> = []
		const D4: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]

		for (let x = 0; x < w; x++) {
			for (const y of [0, h - 1]) {
				if (isBgColor(x, y) && bgMask[y * w + x] === 0) {
					bgMask[y * w + x] = BG_MASK
					queue.push(y * w + x)
				}
			}
		}
		for (let y = 1; y < h - 1; y++) {
			for (const x of [0, w - 1]) {
				if (isBgColor(x, y) && bgMask[y * w + x] === 0) {
					bgMask[y * w + x] = BG_MASK
					queue.push(y * w + x)
				}
			}
		}

		let head = 0
		while (head < queue.length) {
			const midx = queue[head++]
			const mx = midx % w
			const my = (midx - mx) / w
			for (const [dx, dy] of D4) {
				const nx = mx + dx, ny = my + dy
				if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
				const nidx = ny * w + nx
				if (bgMask[nidx] !== 0) continue
				if (!isBgColor(nx, ny)) continue
				bgMask[nidx] = BG_MASK
				queue.push(nidx)
			}
		}

		const FG_VISITED = 2
		const fgVisited = new Uint8Array(w * h)
		const subjects: DetectedSubject[] = []
		const D8: Array<[number, number]> = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]

		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const idx = y * w + x
				if (bgMask[idx] === BG_MASK) continue
				if (fgVisited[idx] === FG_VISITED) continue
				const pxIdx = idx * 4
				if (data[pxIdx + 3] < 20) continue

				const fgPixels: Array<number> = [idx]
				fgVisited[idx] = FG_VISITED
				let minX = x, minY = y, maxX = x, maxY = y
				let pixelCount = 0
				let fhead = 0

				while (fhead < fgPixels.length) {
					const midx = fgPixels[fhead++]
					const mx = midx % w
					const my = (midx - mx) / w
					pixelCount++
					if (mx < minX) minX = mx
					if (my < minY) minY = my
					if (mx > maxX) maxX = mx
					if (my > maxY) maxY = my

					for (const [dx, dy] of D4) {
						const nx = mx + dx, ny = my + dy
						if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
						const nidx = ny * w + nx
						if (fgVisited[nidx] === FG_VISITED) continue
						if (bgMask[nidx] === BG_MASK) continue
						const npxIdx = nidx * 4
						if (data[npxIdx + 3] < 20) continue
						fgVisited[nidx] = FG_VISITED
						fgPixels.push(nidx)
					}
				}

				const bw = maxX - minX + 1
				const bh = maxY - minY + 1
				if (bw < 8 || bh < 8 || pixelCount < 64) continue

				const fillMask = new Uint8Array(bw * bh)
				for (const midx of fgPixels) {
					const mx = midx % w
					const my = (midx - mx) / w
					const lx = mx - minX
					const ly = my - minY
					fillMask[ly * bw + lx] = 1
				}

				const edgePixels: Array<[number, number]> = []
				for (const midx of fgPixels) {
					const mx = midx % w
					const my = (midx - mx) / w
					let isEdge = false
					for (const [dx, dy] of D8) {
						const nx = mx + dx, ny = my + dy
						if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
							isEdge = true
							break
						}
						const nidx = ny * w + nx
						if (bgMask[nidx] === BG_MASK) {
							isEdge = true
							break
						}
						if (data[nidx * 4 + 3] < 20) {
							isEdge = true
							break
						}
					}
					if (isEdge) {
						edgePixels.push([mx, my])
					}
				}

				subjects.push({ minX, minY, maxX, maxY, pixelCount, edgePixels, fillMask, fillMaskW: bw, fillMaskH: bh })
			}
		}

		subjects.sort((a, b) => b.pixelCount - a.pixelCount)
		this.detectedSubjects = subjects

		if (subjects.length > 0) {
			this.selectedSubjectIdx = 0
			this.recomputeSubjectRectFromSelection()
		} else {
			this.subjectSelectRect = null
		}

		this.buildSubjectOverlayCache()
		this.renderOverlay()
		this.emitStateChange()
	}

	private buildSubjectOverlayCache() {
		const w = this.naturalWidth, h = this.naturalHeight
		if (w === 0 || h === 0) {
			this.subjectOverlayCache = null
			return
		}
		if (!this.subjectOverlayCache
			|| this.subjectOverlayCache.width !== w
			|| this.subjectOverlayCache.height !== h) {
			this.subjectOverlayCache = document.createElement('canvas')
			this.subjectOverlayCache.width = w
			this.subjectOverlayCache.height = h
		}
		const cacheCtx = this.subjectOverlayCache.getContext('2d')
		if (!cacheCtx) return
		cacheCtx.clearRect(0, 0, w, h)

		for (let i = 0; i < this.detectedSubjects.length; i++) {
			const s = this.detectedSubjects[i]
			const bw = s.fillMaskW, bh = s.fillMaskH

			const tmp = document.createElement('canvas')
			tmp.width = bw
			tmp.height = bh
			const tctx = tmp.getContext('2d')
			if (!tctx) continue
			const imgData = tctx.createImageData(bw, bh)
			const d = imgData.data
			for (let py = 0; py < bh; py++) {
				for (let px = 0; px < bw; px++) {
					const di = (py * bw + px) * 4
					if (s.fillMask[py * bw + px]) {
						d[di] = 167
						d[di + 1] = 139
						d[di + 2] = 250
						d[di + 3] = 22
					}
				}
			}
			for (const [ex, ey] of s.edgePixels) {
				const lx = ex - s.minX
				const ly = ey - s.minY
				if (lx >= 0 && lx < bw && ly >= 0 && ly < bh) {
					const di = (ly * bw + lx) * 4
					d[di + 3] = 110
				}
			}
			tctx.putImageData(imgData, 0, 0)
			cacheCtx.drawImage(tmp, s.minX, s.minY)
		}
	}

	private findSubjectAt(nx: number, ny: number): number {
		for (let i = 0; i < this.detectedSubjects.length; i++) {
			const s = this.detectedSubjects[i]
			if (nx < s.minX || nx > s.maxX || ny < s.minY || ny > s.maxY) continue
			const lx = nx - s.minX
			const ly = ny - s.minY
			if (s.fillMask[ly * s.fillMaskW + lx]) {
				return i
			}
		}
		return -1
	}

	selectSubjectAt(nx: number, ny: number): void {
		if (!this.imageLoaded) return
		const idx = this.findSubjectAt(Math.round(nx), Math.round(ny))
		this.selectedSubjectIdx = idx
		this.hoverSubjectIdx = -1
		this.recomputeSubjectRectFromSelection()
		this.renderOverlay()
		this.emitStateChange()
	}

	hoverSubjectAt(nx: number, ny: number): void {
		if (!this.imageLoaded || this.detectedSubjects.length === 0) return
		const idx = this.findSubjectAt(Math.round(nx), Math.round(ny))
		if (idx !== this.hoverSubjectIdx) {
			this.hoverSubjectIdx = idx
			this.renderOverlay()
		}
	}

	clearHoverSubject(): void {
		if (this.hoverSubjectIdx !== -1) {
			this.hoverSubjectIdx = -1
			this.renderOverlay()
		}
	}

	getDetectedSubjectsCount(): number {
		return this.detectedSubjects.length
	}

	getSelectedSubjectIdx(): number {
		return this.selectedSubjectIdx
	}

	selectSubjectByIndex(idx: number): void {
		if (!this.imageLoaded) return
		if (idx < 0 || idx >= this.detectedSubjects.length) {
			this.selectedSubjectIdx = -1
			this.subjectSelectRect = null
		} else {
			this.selectedSubjectIdx = idx
			this.hoverSubjectIdx = -1
			this.recomputeSubjectRectFromSelection()
		}
		this.renderOverlay()
		this.emitStateChange()
	}

	getSubjectSelectRect(): Rect | null {
		return this.subjectSelectRect ? { ...this.subjectSelectRect } : null
	}

	setSubjectTightFit(tight: boolean): void {
		if (this.subjectSelect.tightFit === tight) return
		this.subjectSelect.tightFit = tight
		this.recomputeSubjectRectFromSelection()
		this.renderOverlay()
		this.emitStateChange()
	}

	getSubjectTightFit(): boolean {
		return this.subjectSelect.tightFit
	}

	setSubjectMargin(margin: number): void {
		const clamped = Math.max(0, Math.min(50, Math.round(margin)))
		if (this.subjectSelect.margin === clamped) return
		this.subjectSelect.margin = clamped
		if (this.selectedSubjectIdx >= 0 && !this.subjectSelect.tightFit) {
			this.recomputeSubjectRectFromSelection()
		}
		this.renderOverlay()
		this.emitStateChange()
	}

	getSubjectMargin(): number {
		return this.subjectSelect.margin
	}

	composeSubjectCropDataUrl(subjectIdx?: number): { dataUrl: string; width: number; height: number } | null {
		if (!this.imageLoaded || !this.sourceImage) return null
		const idx = subjectIdx != null ? subjectIdx : this.selectedSubjectIdx
		if (idx < 0 || idx >= this.detectedSubjects.length) return null
		const subj = this.detectedSubjects[idx]
		const w = this.naturalWidth, h = this.naturalHeight

		const exportPad = 3
		const sx = Math.max(0, subj.minX - exportPad)
		const sy = Math.max(0, subj.minY - exportPad)
		const sw = Math.min(w - sx, subj.maxX - subj.minX + 1 + exportPad * 2)
		const sh = Math.min(h - sy, subj.maxY - subj.minY + 1 + exportPad * 2)
		if (sw < 1 || sh < 1) return null

		const size = Math.max(sw, sh)
		const exportCanvas = document.createElement('canvas')
		exportCanvas.width = size
		exportCanvas.height = size
		const ctx = exportCanvas.getContext('2d')
		if (!ctx) return null

		ctx.fillStyle = '#ffffff'
		ctx.fillRect(0, 0, size, size)

		const tmp = document.createElement('canvas')
		tmp.width = sw
		tmp.height = sh
		const tctx = tmp.getContext('2d')
		if (!tctx) return null
		tctx.drawImage(this.baseCanvas, sx, sy, sw, sh, 0, 0, sw, sh)

		const regionData = tctx.getImageData(0, 0, sw, sh)
		const rd = regionData.data
		for (let py = 0; py < sh; py++) {
			for (let px = 0; px < sw; px++) {
				const di = (py * sw + px) * 4
				const mx = sx + px - subj.minX
				const my = sy + py - subj.minY
				const inMask = mx >= 0 && mx < subj.fillMaskW && my >= 0 && my < subj.fillMaskH
					&& subj.fillMask[my * subj.fillMaskW + mx]
				if (!inMask) {
					rd[di] = 255
					rd[di + 1] = 255
					rd[di + 2] = 255
					rd[di + 3] = 255
				}
			}
		}
		tctx.putImageData(regionData, 0, 0)

		const dx = Math.round((size - sw) / 2)
		const dy = Math.round((size - sh) / 2)
		ctx.drawImage(tmp, dx, dy)

		const dataUrl = exportCanvas.toDataURL('image/png')
		return { dataUrl, width: size, height: size }
	}

	composeExportDataUrl(): { dataUrl: string; width: number; height: number } | null {
		if (!this.imageLoaded) return null
		const dataUrl = this.baseCanvas.toDataURL('image/png')
		return { dataUrl, width: this.naturalWidth, height: this.naturalHeight }
	}

	composeScreenshotDataUrl(): { dataUrl: string; width: number; height: number } | null {
		if (!this.imageLoaded || !this.sourceImage) return null
		const rect = this.screenshotRect
		if (!rect || rect.w < 10 || rect.h < 10) return null

		const sx = Math.max(0, Math.floor(rect.x))
		const sy = Math.max(0, Math.floor(rect.y))
		const sw = Math.min(this.naturalWidth - sx, Math.floor(rect.w))
		const sh = Math.min(this.naturalHeight - sy, Math.floor(rect.h))
		if (sw < 1 || sh < 1) return null

		const exportCanvas = document.createElement('canvas')
		exportCanvas.width = sw
		exportCanvas.height = sh
		const ctx = exportCanvas.getContext('2d')
		if (!ctx) return null

		ctx.drawImage(this.baseCanvas, sx, sy, sw, sh, 0, 0, sw, sh)
		const dataUrl = exportCanvas.toDataURL('image/png')
		return { dataUrl, width: sw, height: sh }
	}

	getCanvasStyle(): Record<string, string> {
		return {
			width: `${this.naturalWidth}px`,
			height: `${this.naturalHeight}px`,
			transform: `translate(-50%, -50%) translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.zoom})`,
			transformOrigin: '50% 50%'
		}
	}

	destroy(): void {
		this.stateChangeListeners.clear()
		this.history.clear()
		this.sourceImage = null
	}
}