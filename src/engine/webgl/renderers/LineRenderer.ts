import type { DwebCanvasGL } from '../canvas/DwebCanvasGL'
import { NodeRenderer } from './NodeRenderer'
import type { LocalTargetSize, RenderContext, RenderNode } from './types'
import { normalizeLineLocalPoints, scaleLineLocalPoints } from '../../../core/scene/geometry'

export class LineRenderer extends NodeRenderer {
	readonly type = 'line' as const

	renderWorld(canvas: DwebCanvasGL, node: RenderNode, ctx: RenderContext): void {
		this.draw(canvas, node, ctx, 'world')
	}

	renderLocal(
		canvas: DwebCanvasGL,
		target: LocalTargetSize,
		node: RenderNode,
		ctx: RenderContext
	): void {
		this.draw(canvas, node, ctx, 'local', target)
	}

	private draw(
		canvas: DwebCanvasGL,
		node: RenderNode,
		ctx: RenderContext,
		space: 'world' | 'local',
		target?: LocalTargetSize
	) {
		const w = Math.max(1, Number(node.transform.width ?? 1))
		const h = Math.max(1, Number(node.transform.height ?? 1))
		const sx0 = Number((node.transform as any)?.scaleX ?? 1)
		const sy0 = Number((node.transform as any)?.scaleY ?? 1)
		const sx = Number.isFinite(sx0) ? Math.max(0, Math.min(100, sx0)) : 1
		const sy = Number.isFinite(sy0) ? Math.max(0, Math.min(100, sy0)) : 1
		const sAvg = Math.max(0, (sx + sy) / 2)
		const px =
			typeof (node.transform as any).pivotX === 'number'
				? Math.max(0, Math.min(1, Number((node.transform as any).pivotX)))
				: 0.5
		const py =
			typeof (node.transform as any).pivotY === 'number'
				? Math.max(0, Math.min(1, Number((node.transform as any).pivotY)))
				: 0.5
		const cx = node.transform.x + (0.5 - px) * w
		const cy = node.transform.y + (0.5 - py) * h
		const pObj = (node.props as any) ?? {}
		const local = normalizeLineLocalPoints({ props: pObj, width: w, height: h })
		const scaled = scaleLineLocalPoints(local, sx, sy)
		const startX = scaled.startX
		const startY = scaled.startY
		const endX = scaled.endX
		const endY = scaled.endY
		const anchorX = scaled.anchorX
		const anchorY = scaled.anchorY
		const lineWidthPx = Math.max(1, Number((node.props as any)?.lineWidth ?? 4))
		const lineStyle = String((node.props as any)?.lineStyle ?? 'solid')
		const color = canvas.parseHexColor(
			String((node.props as any)?.lineColor ?? '#ffffff'),
			ctx.opacity
		)
		// For offscreen filter rendering, the effective pixels-per-world-unit may be clamped.
		// Using viewport.zoom directly can make dash segments explode in count under extreme zoom,
		// which is a common crash vector when combined with glow/blur.
		const zoomWorldToCssPx = Math.max(1e-3, canvas.viewport.zoom)
		const zoomForStyle =
			space === 'local'
				? Math.max(
						1e-3,
						Number(
							((target as any)?.scale ?? canvas.getFilterScale()) ||
								zoomWorldToCssPx * canvas.getPixelRatio()
						) / Math.max(1, canvas.getPixelRatio())
					)
				: zoomWorldToCssPx
		const thickness = (lineWidthPx / zoomForStyle) * sAvg

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
		const toSpace = (lx: number, ly: number) => ({
			x: cx + lx * cosR - ly * sinR,
			y: cy + lx * sinR + ly * cosR
		})

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
			let dashLen = (14 / zoomForStyle) * sAvg
			let gapLen = (10 / zoomForStyle) * sAvg
			let period = Math.max(1e-4, dashLen + gapLen)

			// Cap dash draw calls: under high zoom, dashLen/gapLen shrink in world units,
			// which can produce thousands of tiny segments and crash the browser.
			// Keep the pattern but scale it up in world units when needed.
			let totalLen = 0
			for (let i = 0; i < pts.length - 1; i++)
				totalLen += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
			const maxDashes = space === 'local' ? 180 : 320
			const estDashes = period > 1e-6 ? totalLen / period : Number.POSITIVE_INFINITY
			if (estDashes > maxDashes && Number.isFinite(estDashes)) {
				const k = Math.max(1, estDashes / maxDashes)
				dashLen *= k
				gapLen *= k
				period = Math.max(0.001, dashLen + gapLen)
			}

			// Robust dash rendering:
			// Avoid incremental stepping with tiny "step" (can stall at extreme zoom and freeze/crash).
			// Instead, intersect the segment distance range with dash ranges per period.
			let s = 0
			const minDashWorld = 1e-4
			dashLen = Math.max(0, dashLen)
			gapLen = Math.max(0, gapLen)
			period = Math.max(1e-4, dashLen + gapLen)
			if (dashLen < minDashWorld) {
				// Too small to be meaningful; draw as solid for stability.
				for (let i = 0; i < pts.length - 1; i++) drawSegment(pts[i], pts[i + 1])
				return
			}

			for (let i = 0; i < pts.length - 1; i++) {
				const a = pts[i]
				const b = pts[i + 1]
				const segLen = Math.hypot(b.x - a.x, b.y - a.y)
				if (segLen < 1e-6) continue

				const startPos = s
				const endPos = s + segLen
				// Iterate periods overlapping this segment.
				const k0 = Math.floor(startPos / period)
				const k1 = Math.floor(endPos / period) + 1
				for (let k = k0; k <= k1; k++) {
					const dashStart = k * period
					const dashEnd = dashStart + dashLen
					const i0 = Math.max(startPos, dashStart)
					const i1 = Math.min(endPos, dashEnd)
					if (i1 <= i0 + 1e-4) continue
					const t0 = (i0 - startPos) / segLen
					const t1 = (i1 - startPos) / segLen
					if (t1 <= t0) continue
					const pA = { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 }
					const pB = { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 }
					drawSegment(pA, pB)
				}

				s += segLen
			}
		} else {
			for (let i = 0; i < pts.length - 1; i++) drawSegment(pts[i], pts[i + 1])
		}
	}
}
