import type { DwebCanvasGL } from '../canvas/DwebCanvasGL'
import { NodeRenderer } from './NodeRenderer'
import type { LocalTargetSize, RenderContext, RenderNode } from './types'

export class LineRenderer extends NodeRenderer {
	readonly type = 'line' as const

	renderWorld(canvas: DwebCanvasGL, node: RenderNode, ctx: RenderContext): void {
		this.draw(canvas, node, ctx, 'world')
	}

	renderLocal(canvas: DwebCanvasGL, target: LocalTargetSize, node: RenderNode, ctx: RenderContext): void {
		this.draw(canvas, node, ctx, 'local', target)
	}

	private draw(canvas: DwebCanvasGL, node: RenderNode, ctx: RenderContext, space: 'world' | 'local', target?: LocalTargetSize) {
		const cx = node.transform.x
		const cy = node.transform.y
		const w = Math.max(1, Number(node.transform.width ?? 1))
		const h = Math.max(1, Number(node.transform.height ?? 1))
		const startX = Number((node.props as any)?.startX ?? -w / 2)
		const startY = Number((node.props as any)?.startY ?? 0)
		const endX = Number((node.props as any)?.endX ?? w / 2)
		const endY = Number((node.props as any)?.endY ?? 0)
		const anchorX = Number((node.props as any)?.anchorX ?? 0)
		const anchorY = Number((node.props as any)?.anchorY ?? -h / 4)
		const lineWidthPx = Math.max(1, Number((node.props as any)?.lineWidth ?? 4))
		const lineStyle = String((node.props as any)?.lineStyle ?? 'solid')
		const color = canvas.parseHexColor(String((node.props as any)?.lineColor ?? '#ffffff'), ctx.opacity)
		const thickness = lineWidthPx / Math.max(0.0001, canvas.viewport.zoom)

		// approximate quadratic bezier by polyline
		const p0 = { x: startX, y: startY }
		const p1 = { x: anchorX, y: anchorY }
		const p2 = { x: endX, y: endY }
		const d01 = Math.hypot(p1.x - p0.x, p1.y - p0.y)
		const d12 = Math.hypot(p2.x - p1.x, p2.y - p1.y)
		const approxLen = d01 + d12
		const segCount = Math.max(8, Math.min(96, Math.floor(approxLen / 18) + 12))

		const cosR = Math.cos(ctx.rotation)
		const sinR = Math.sin(ctx.rotation)
		const toSpace = (lx: number, ly: number) => ({ x: cx + lx * cosR - ly * sinR, y: cy + lx * sinR + ly * cosR })

		const pts: { x: number; y: number }[] = []
		for (let i = 0; i <= segCount; i++) {
			const t = i / segCount
			const mt = 1 - t
			const lx = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x
			const ly = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
			pts.push(toSpace(lx, ly))
		}

		const drawRect = (mx: number, my: number, len: number, thick: number, ang: number) => {
			if (space === 'world') {
				canvas.drawRect(mx, my, len, thick, color, ang)
			} else {
				canvas.drawLocalRect(target!, mx, my, len, thick, color, ang)
			}
		}

		const drawSegment = (a: { x: number; y: number }, b: { x: number; y: number }) => {
			const dx = b.x - a.x
			const dy = b.y - a.y
			const len = Math.hypot(dx, dy)
			if (len < 0.001) return
			const mx = (a.x + b.x) / 2
			const my = (a.y + b.y) / 2
			const ang = Math.atan2(dy, dx)
			drawRect(mx, my, len, thickness, ang)
		}

		if (lineStyle === 'dashed') {
			const dashLen = 14 / Math.max(0.0001, canvas.viewport.zoom)
			const gapLen = 10 / Math.max(0.0001, canvas.viewport.zoom)
			const period = Math.max(0.001, dashLen + gapLen)

			let s = 0
			for (let i = 0; i < pts.length - 1; i++) {
				const a = pts[i]
				const b = pts[i + 1]
				const segLen = Math.hypot(b.x - a.x, b.y - a.y)
				if (segLen < 0.001) continue

				let localPos = 0
				while (localPos < segLen - 1e-6) {
					const globalPos = s + localPos
					const phase = globalPos % period
					const inDash = phase < dashLen
					const run = inDash ? dashLen - phase : period - phase
					const step = Math.min(run, segLen - localPos)
					if (inDash && step > 0.001) {
						const t0 = localPos / segLen
						const t1 = (localPos + step) / segLen
						const pA = { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 }
						const pB = { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 }
						drawSegment(pA, pB)
					}
					localPos += step
				}
				s += segLen
			}
		} else {
			for (let i = 0; i < pts.length - 1; i++) drawSegment(pts[i], pts[i + 1])
		}
	}
}
