import type { DwebCanvasGL } from '../canvas/DwebCanvasGL'
import type { RenderContext, RenderNode, LocalTargetSize } from './types'

export abstract class NodeRenderer {
	abstract readonly type: RenderNode['type']

	abstract renderWorld(canvas: DwebCanvasGL, node: RenderNode, ctx: RenderContext): void

	/**
	 * 绘制到离屏 target（local space）：
	 * - 坐标原点在 target 中心
	 * - 不受 viewport pan/zoom 影响
	 */
	abstract renderLocal(canvas: DwebCanvasGL, target: LocalTargetSize, node: RenderNode, ctx: RenderContext): void
}
