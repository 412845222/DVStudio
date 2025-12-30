import { themeRgba, type DwebCanvasGL } from '../canvas/DwebCanvasGL'
import { NodeRenderer } from './NodeRenderer'
import type { LocalTargetSize, RenderContext, RenderNode } from './types'

export class BaseRenderer extends NodeRenderer {
	readonly type = 'base' as const

	renderWorld(canvas: DwebCanvasGL, node: RenderNode, ctx: RenderContext): void {
		const borderW = 1 / canvas.viewport.zoom
		canvas.drawRect(node.transform.x, node.transform.y, node.transform.width, node.transform.height, themeRgba.border(0.25 * ctx.opacity), ctx.rotation)
		canvas.drawRect(
			node.transform.x,
			node.transform.y,
			node.transform.width,
			Math.max(borderW, 1 / canvas.viewport.zoom),
			themeRgba.border(0.7 * ctx.opacity),
			ctx.rotation
		)
	}

	renderLocal(canvas: DwebCanvasGL, target: LocalTargetSize, node: RenderNode, ctx: RenderContext): void {
		// local space: use target content size
		canvas.drawLocalRect(
			target,
			node.transform.x,
			node.transform.y,
			Math.max(1, Number(node.transform.width ?? 1)),
			Math.max(1, Number(node.transform.height ?? 1)),
			themeRgba.border(0.25 * ctx.opacity),
			ctx.rotation
		)
	}
}
