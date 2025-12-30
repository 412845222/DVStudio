import type { DwebCanvasGL } from '../canvas/DwebCanvasGL'
import { NodeRenderer } from './NodeRenderer'
import type { LocalTargetSize, RenderContext, RenderNode } from './types'

export class ImageRenderer extends NodeRenderer {
	readonly type = 'image' as const

	renderWorld(canvas: DwebCanvasGL, node: RenderNode, ctx: RenderContext): void {
		this.draw(canvas, node, ctx, 'world')
	}

	renderLocal(canvas: DwebCanvasGL, target: LocalTargetSize, node: RenderNode, ctx: RenderContext): void {
		this.draw(canvas, node, ctx, 'local', target)
	}

	private draw(canvas: DwebCanvasGL, node: RenderNode, ctx: RenderContext, space: 'world' | 'local', target?: LocalTargetSize) {
		const src = (node.imageSrc ?? '').trim()
		const wrap = ((node.props as any)?.repeat ? 'repeat' : 'clamp') as 'repeat' | 'clamp'
		const tex = canvas.getImageTexture(src, wrap)
		const size = src ? canvas.getImageSize(src) : null
		const imgW = Math.max(1, size?.width ?? 1)
		const imgH = Math.max(1, size?.height ?? 1)
		const fit = ((node.props as any)?.imageFit ?? 'contain') as 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'

		const cx = node.transform.x
		const cy = node.transform.y
		const w = Math.max(1, Number(node.transform.width ?? 1))
		const h = Math.max(1, Number(node.transform.height ?? 1))
		const rotation = ctx.rotation

		const drawTex = (dw: number, dh: number) => {
			if (space === 'world') canvas.drawTexturedRect(cx, cy, dw, dh, tex, ctx.opacity, rotation)
			else canvas.drawLocalTexturedRect(target!, cx, cy, dw, dh, tex, ctx.opacity, rotation)
		}
		const drawTexUv = (uv: { u0: number; v0: number; u1: number; v1: number }) => {
			if (space === 'world') canvas.drawTexturedRectUv(cx, cy, w, h, tex, ctx.opacity, rotation, uv)
			else canvas.drawLocalTexturedRectUv(target!, cx, cy, w, h, tex, ctx.opacity, rotation, uv)
		}

		if (fit === 'fill') {
			drawTex(w, h)
			return
		}

		if (fit === 'cover') {
			const scale = Math.max(w / imgW, h / imgH)
			const scaledW = imgW * scale
			const scaledH = imgH * scale
			const visU = Math.min(1, w / scaledW)
			const visV = Math.min(1, h / scaledH)
			const u0 = (1 - visU) / 2
			const v0 = (1 - visV) / 2
			drawTexUv({ u0, v0, u1: u0 + visU, v1: v0 + visV })
			return
		}

		if (fit === 'none') {
			if (imgW <= w && imgH <= h) {
				drawTex(imgW, imgH)
				return
			}
			const visU = Math.min(1, w / imgW)
			const visV = Math.min(1, h / imgH)
			const u0 = (1 - visU) / 2
			const v0 = (1 - visV) / 2
			drawTexUv({ u0, v0, u1: u0 + visU, v1: v0 + visV })
			return
		}

		let scale = Math.min(w / imgW, h / imgH)
		if (fit === 'scale-down') scale = Math.min(1, scale)
		drawTex(imgW * scale, imgH * scale)
	}
}
