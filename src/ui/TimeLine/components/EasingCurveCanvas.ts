export type CubicBezier = {
	x1: number
	y1: number
	x2: number
	y2: number
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

const cssColor = (name: string, fallback: string): string => {
	if (typeof document === 'undefined') return fallback
	const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
	return v || fallback
}

const hexToRgba = (hex: string, alpha: number): string => {
	const h = hex.replace('#', '')
	if (h.length !== 6) return `rgba(255,255,255,${alpha})`
	const r = parseInt(h.substring(0, 2), 16)
	const g = parseInt(h.substring(2, 4), 16)
	const b = parseInt(h.substring(4, 6), 16)
	if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(255,255,255,${alpha})`
	return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export class EasingCurveCanvas {
	private readonly padLeft = 14
	private readonly padRight = 14
	private readonly padTop = 10
	private readonly padBottom = 10

	constructor(private ctx: CanvasRenderingContext2D) {}

	private getPlotRect() {
		const w = this.ctx.canvas.width
		const h = this.ctx.canvas.height
		const left = Math.min(this.padLeft, Math.max(0, w - 1))
		const top = Math.min(this.padTop, Math.max(0, h - 1))
		const right = Math.max(left + 1, w - this.padRight)
		const bottom = Math.max(top + 1, h - this.padBottom)
		return {
			left,
			top,
			right,
			bottom,
			width: Math.max(1, right - left),
			height: Math.max(1, bottom - top)
		}
	}

	private normToCanvas(x01: number, y01: number) {
		const r = this.getPlotRect()
		return {
			x: r.left + clamp01(x01) * r.width,
			y: r.top + (1 - clamp01(y01)) * r.height
		}
	}

	resize(width: number, height: number) {
		const canvas = this.ctx.canvas
		canvas.width = Math.max(1, Math.floor(width))
		canvas.height = Math.max(1, Math.floor(height))
	}

	draw(curve: CubicBezier, activePoint: 'p1' | 'p2' | null = null) {
		const { ctx } = this
		const w = ctx.canvas.width
		const h = ctx.canvas.height
		const plot = this.getPlotRect()

		const accent = cssColor('--pl-accent', '#1f9d84')
		const bg0 = cssColor('--pl-bg-0', '#0d1518')
		const fg = cssColor('--pl-fg', '#eaf2f5')

		ctx.clearRect(0, 0, w, h)
		ctx.fillStyle = hexToRgba(bg0, 0.6)
		ctx.fillRect(0, 0, w, h)

		// 背景网格
		ctx.save()
		ctx.strokeStyle = hexToRgba(accent, 0.12)
		ctx.lineWidth = 1
		const step = Math.max(16, Math.floor(Math.min(plot.width, plot.height) / 5))
		for (let x = plot.left; x <= plot.right; x += step) {
			ctx.beginPath()
			ctx.moveTo(x + 0.5, plot.top)
			ctx.lineTo(x + 0.5, plot.bottom)
			ctx.stroke()
		}
		for (let y = plot.top; y <= plot.bottom; y += step) {
			ctx.beginPath()
			ctx.moveTo(plot.left, y + 0.5)
			ctx.lineTo(plot.right, y + 0.5)
			ctx.stroke()
		}
		ctx.restore()

		// 坐标轴（左侧 x/y） + 右侧边际线
		ctx.save()
		ctx.strokeStyle = hexToRgba(accent, 0.45)
		ctx.lineWidth = 1
		// y 轴
		ctx.beginPath()
		ctx.moveTo(plot.left + 0.5, plot.top)
		ctx.lineTo(plot.left + 0.5, plot.bottom)
		ctx.stroke()
		// x 轴
		ctx.beginPath()
		ctx.moveTo(plot.left, plot.bottom + 0.5)
		ctx.lineTo(plot.right, plot.bottom + 0.5)
		ctx.stroke()
		// 右侧边际线
		ctx.beginPath()
		ctx.moveTo(plot.right + 0.5, plot.top)
		ctx.lineTo(plot.right + 0.5, plot.bottom)
		ctx.stroke()
		ctx.restore()

		const p0 = { x: plot.left, y: plot.bottom }
		const p3 = { x: plot.right, y: plot.top }
		const p1 = this.normToCanvas(curve.x1, curve.y1)
		const p2 = this.normToCanvas(curve.x2, curve.y2)

		// 辅助线
		ctx.save()
		ctx.strokeStyle = hexToRgba(accent, 0.55)
		ctx.lineWidth = 1
		ctx.setLineDash([3, 3])
		ctx.beginPath()
		ctx.moveTo(p0.x, p0.y)
		ctx.lineTo(p1.x, p1.y)
		ctx.lineTo(p2.x, p2.y)
		ctx.lineTo(p3.x, p3.y)
		ctx.stroke()
		ctx.setLineDash([])
		ctx.restore()

		// 曲线
		ctx.save()
		ctx.strokeStyle = accent
		ctx.lineWidth = 2
		ctx.shadowColor = hexToRgba(accent, 0.6)
		ctx.shadowBlur = 6
		ctx.beginPath()
		ctx.moveTo(p0.x, p0.y)
		ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y)
		ctx.stroke()
		ctx.shadowBlur = 0
		ctx.restore()

		// 控制点
		this.drawHandle(p1.x, p1.y, activePoint === 'p1', accent, bg0)
		this.drawHandle(p2.x, p2.y, activePoint === 'p2', accent, bg0)
	}

	private drawHandle(x: number, y: number, active: boolean, accent: string, _bg: string) {
		const { ctx } = this
		ctx.save()
		ctx.fillStyle = active ? accent : hexToRgba(accent, 0.8)
		ctx.strokeStyle = hexToRgba('#000000', 0.4)
		ctx.lineWidth = 1
		if (active) {
			ctx.shadowColor = hexToRgba(accent, 0.8)
			ctx.shadowBlur = 8
		}
		ctx.beginPath()
		ctx.arc(x, y, active ? 8 : 6, 0, Math.PI * 2)
		ctx.fill()
		ctx.stroke()
		ctx.shadowBlur = 0
		ctx.restore()
	}

	hitTest(curve: CubicBezier, clientX: number, clientY: number): 'p1' | 'p2' | null {
		const { ctx } = this
		const rect = ctx.canvas.getBoundingClientRect()
		const x = clientX - rect.left
		const y = clientY - rect.top
		const p1 = this.normToCanvas(curve.x1, curve.y1)
		const p2 = this.normToCanvas(curve.x2, curve.y2)
		const r2 = 12 * 12
		const d1 = (x - p1.x) * (x - p1.x) + (y - p1.y) * (y - p1.y)
		if (d1 <= r2) return 'p1'
		const d2 = (x - p2.x) * (x - p2.x) + (y - p2.y) * (y - p2.y)
		if (d2 <= r2) return 'p2'
		return null
	}

	clientToNormalized(clientX: number, clientY: number): { x: number; y: number } {
		const rect = this.ctx.canvas.getBoundingClientRect()
		const x = clientX - rect.left
		const y = clientY - rect.top
		const plot = this.getPlotRect()
		return {
			x: clamp01((x - plot.left) / Math.max(1, plot.width)),
			y: clamp01(1 - (y - plot.top) / Math.max(1, plot.height))
		}
	}
}
