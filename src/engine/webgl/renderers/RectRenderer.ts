import type { DwebCanvasGL } from '../canvas/DwebCanvasGL'
import { NodeRenderer } from './NodeRenderer'
import type { LocalTargetSize, RenderContext, RenderNode } from './types'

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

export class RectRenderer extends NodeRenderer {
	readonly type = 'rect' as const

	renderWorld(canvas: DwebCanvasGL, node: RenderNode, ctx: RenderContext): void {
		const fillOpacity = clamp01(Number(node.props?.fillOpacity ?? 1))
		const borderOpacity = clamp01(Number(node.props?.borderOpacity ?? 1))
		const fillA = clamp01(ctx.opacity * fillOpacity)
		const borderA = clamp01(ctx.opacity * borderOpacity)
		const cornerRadius = Math.max(0, Number(node.props?.cornerRadius ?? 0))

		const cx = node.transform.x
		const cy = node.transform.y
		const w = node.transform.width
		const h = node.transform.height

		if (cornerRadius > 0.5) {
			const fillColor = canvas.parseHexColor(String(node.props?.fillColor ?? '#3aa1ff'), fillA)
			const borderColor = canvas.parseHexColor(String(node.props?.borderColor ?? '#9cdcfe'), borderA)
			const borderPx0 = Math.max(0, Number(node.props?.borderWidth ?? 1))
			let bw = borderPx0 / canvas.viewport.zoom
			bw = Math.max(0, Math.min(bw, Math.min(w, h) / 2))
			canvas.drawRoundedRect(cx, cy, w, h, cornerRadius, fillColor, borderColor, bw, ctx.rotation)
			return
		}

		if (fillA > 0) {
			const fillColor = canvas.parseHexColor(String(node.props?.fillColor ?? '#3aa1ff'), fillA)
			canvas.drawRect(cx, cy, w, h, fillColor, ctx.rotation)
		}

		const borderPx = Math.max(0, Number(node.props?.borderWidth ?? 1))
		let bw = borderPx / canvas.viewport.zoom
		bw = Math.max(0, Math.min(bw, Math.min(w, h) / 2))
		if (bw > 0 && borderA > 0) {
			const borderColor = canvas.parseHexColor(String(node.props?.borderColor ?? '#9cdcfe'), borderA)
			const cos = Math.cos(ctx.rotation)
			const sin = Math.sin(ctx.rotation)
			const ro = (ox: number, oy: number) => ({ x: cx + ox * cos - oy * sin, y: cy + ox * sin + oy * cos })

			const top = ro(0, -h / 2 + bw / 2)
			canvas.drawRect(top.x, top.y, w, bw, borderColor, ctx.rotation)
			const bottom = ro(0, h / 2 - bw / 2)
			canvas.drawRect(bottom.x, bottom.y, w, bw, borderColor, ctx.rotation)
			const left = ro(-w / 2 + bw / 2, 0)
			canvas.drawRect(left.x, left.y, bw, h, borderColor, ctx.rotation)
			const right = ro(w / 2 - bw / 2, 0)
			canvas.drawRect(right.x, right.y, bw, h, borderColor, ctx.rotation)
		}
	}

	renderLocal(canvas: DwebCanvasGL, target: LocalTargetSize, node: RenderNode, ctx: RenderContext): void {
		const fillOpacity = clamp01(Number(node.props?.fillOpacity ?? 1))
		const borderOpacity = clamp01(Number(node.props?.borderOpacity ?? 1))
		const fillA = clamp01(ctx.opacity * fillOpacity)
		const borderA = clamp01(ctx.opacity * borderOpacity)
		const cornerRadius = Math.max(0, Number(node.props?.cornerRadius ?? 0))

		const nodeW = Math.max(1, Number(node.transform.width ?? 1))
		const nodeH = Math.max(1, Number(node.transform.height ?? 1))
		const cx = node.transform.x
		const cy = node.transform.y

		if (cornerRadius > 0.5) {
			const fillColor = canvas.parseHexColor(String(node.props?.fillColor ?? '#3aa1ff'), fillA)
			const borderColor = canvas.parseHexColor(String(node.props?.borderColor ?? '#9cdcfe'), borderA)
			const borderPx0 = Math.max(0, Number(node.props?.borderWidth ?? 1))
			let bw = borderPx0 / canvas.viewport.zoom
			bw = Math.max(0, Math.min(bw, Math.min(nodeW, nodeH) / 2))
			canvas.drawLocalRoundedRect(target, cx, cy, nodeW, nodeH, cornerRadius, fillColor, borderColor, bw, ctx.rotation)
			return
		}

		if (fillA > 0) {
			const fillColor = canvas.parseHexColor(String(node.props?.fillColor ?? '#3aa1ff'), fillA)
			canvas.drawLocalRect(target, cx, cy, nodeW, nodeH, fillColor, ctx.rotation)
		}

		const borderPx = Math.max(0, Number(node.props?.borderWidth ?? 1))
		let bw = borderPx / canvas.viewport.zoom
		bw = Math.max(0, Math.min(bw, Math.min(nodeW, nodeH) / 2))
		if (bw > 0 && borderA > 0) {
			const borderColor = canvas.parseHexColor(String(node.props?.borderColor ?? '#9cdcfe'), borderA)
			const cos = Math.cos(ctx.rotation)
			const sin = Math.sin(ctx.rotation)
			const ro = (ox: number, oy: number) => ({ x: cx + ox * cos - oy * sin, y: cy + ox * sin + oy * cos })

			const top = ro(0, -nodeH / 2 + bw / 2)
			canvas.drawLocalRect(target, top.x, top.y, nodeW, bw, borderColor, ctx.rotation)
			const bottom = ro(0, nodeH / 2 - bw / 2)
			canvas.drawLocalRect(target, bottom.x, bottom.y, nodeW, bw, borderColor, ctx.rotation)
			const left = ro(-nodeW / 2 + bw / 2, 0)
			canvas.drawLocalRect(target, left.x, left.y, bw, nodeH, borderColor, ctx.rotation)
			const right = ro(nodeW / 2 - bw / 2, 0)
			canvas.drawLocalRect(target, right.x, right.y, bw, nodeH, borderColor, ctx.rotation)
		}
	}
}
