import type { DwebCanvasGL } from '../canvas/DwebCanvasGL'
import { NodeRenderer } from './NodeRenderer'
import type { LocalTargetSize, RenderContext, RenderNode } from './types'
import type { VideoSceneNodeTransform } from '../../../core/scene'
import { videoTexturePool } from './VideoTexturePool'

export class VideoRenderer extends NodeRenderer {
	readonly type = 'video' as const

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
		const props = node.props as Record<string, unknown> ?? {}
		const videoId = String(props.videoId ?? node.id ?? '').trim()
		if (!videoId) return

		const entry = videoTexturePool.getEntry(videoId)
		if (!entry || entry.status !== 'ready' || !entry.texture) return

		const tex = entry.texture
		const vidW = Math.max(1, entry.width || 1)
		const vidH = Math.max(1, entry.height || 1)

		const imageFitRaw = String(props.imageFit ?? props.fit ?? 'contain')
		const fit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down' =
			imageFitRaw === 'contain' || imageFitRaw === 'cover' || imageFitRaw === 'fill' || imageFitRaw === 'none' || imageFitRaw === 'scale-down'
				? imageFitRaw
				: 'contain'

		const w = Math.max(1, Number(node.transform.width ?? vidW))
		const h = Math.max(1, Number(node.transform.height ?? vidH))
		const t = node.transform as VideoSceneNodeTransform
		const px =
			typeof t.pivotX === 'number'
				? Math.max(0, Math.min(1, Number(t.pivotX)))
				: 0.5
		const py =
			typeof t.pivotY === 'number'
				? Math.max(0, Math.min(1, Number(t.pivotY)))
				: 0.5
		const cx = node.transform.x + (0.5 - px) * w
		const cy = node.transform.y + (0.5 - py) * h
		const rotation = ctx.rotation

		const drawTex = (dw: number, dh: number) => {
			if (space === 'world') canvas.drawTexturedRect(cx, cy, dw, dh, tex, ctx.opacity, rotation)
			else canvas.drawLocalTexturedRect(target!, cx, cy, dw, dh, tex, ctx.opacity, rotation)
		}

		const drawTexUv = (uv: { u0: number; v0: number; u1: number; v1: number }) => {
			if (space === 'world')
				canvas.drawTexturedRectUv(cx, cy, w, h, tex, ctx.opacity, rotation, uv)
			else canvas.drawLocalTexturedRectUv(target!, cx, cy, w, h, tex, ctx.opacity, rotation, uv)
		}

		if (fit === 'fill') {
			drawTex(w, h)
			return
		}

		if (fit === 'cover') {
			const scale = Math.max(w / vidW, h / vidH)
			const scaledW = vidW * scale
			const scaledH = vidH * scale
			const visU = Math.min(1, w / scaledW)
			const visV = Math.min(1, h / scaledH)
			const u0 = (1 - visU) / 2
			const v0 = (1 - visV) / 2
			drawTexUv({ u0, v0, u1: u0 + visU, v1: v0 + visV })
			return
		}

		if (fit === 'none') {
			if (vidW <= w && vidH <= h) {
				drawTex(vidW, vidH)
				return
			}
			const visU = Math.min(1, w / vidW)
			const visV = Math.min(1, h / vidH)
			const u0 = (1 - visU) / 2
			const v0 = (1 - visV) / 2
			drawTexUv({ u0, v0, u1: u0 + visU, v1: v0 + visV })
			return
		}

		let scale = Math.min(w / vidW, h / vidH)
		if (fit === 'scale-down') scale = Math.min(1, scale)
		drawTex(vidW * scale, vidH * scale)
	}
}
