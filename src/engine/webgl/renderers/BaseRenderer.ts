import type { DwebCanvasGL } from '../canvas/DwebCanvasGL'
import { NodeRenderer } from './NodeRenderer'
import type { LocalTargetSize, RenderContext, RenderNode } from './types'

export class BaseRenderer extends NodeRenderer {
	readonly type = 'base' as const

	renderWorld(canvas: DwebCanvasGL, node: RenderNode, ctx: RenderContext): void {
		// Base node is a pure structural container.
		// Keep it invisible by default; selection/handles are rendered by the UI overlay.
		void canvas
		void node
		void ctx
	}

	renderLocal(canvas: DwebCanvasGL, target: LocalTargetSize, node: RenderNode, ctx: RenderContext): void {
		// Keep base node invisible in offscreen targets as well.
		void canvas
		void target
		void node
		void ctx
	}
}
