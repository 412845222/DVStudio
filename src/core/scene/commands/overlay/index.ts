import { lineControlPointsWorld, normalizeLineLocalPoints, rotatedRectCorners, scaleLineLocalPoints } from '../../geometry'
import type { VideoSceneNodeProps } from '../../types'
import type { NodeOverlayGeometry } from './types'

export type { NodeOverlayCorners, NodeOverlayGeometry } from './types'

export const buildNodeOverlayGeometry = (args: {
	/**
	 * 世界坐标中的“锚点/枢轴点”（即 transform.x/y 累加后的世界坐标）。
	 * 注意：这不是几何中心；中心点需结合 pivotX/pivotY 与 rotation 计算。
	 */
	worldPivot: { x: number; y: number }
	width: number
	height: number
	scaleX?: number
	scaleY?: number
	rotation: number
	pivotX?: number
	pivotY?: number
	userType?: string
	props?: VideoSceneNodeProps
}): NodeOverlayGeometry => {
	const w0 = Number(args.width ?? 0)
	const h0 = Number(args.height ?? 0)
	const sx = Number.isFinite(Number(args.scaleX)) ? Number(args.scaleX) : 1
	const sy = Number.isFinite(Number(args.scaleY)) ? Number(args.scaleY) : 1
	const w = w0 * sx
	const h = h0 * sy
	const rotation = Number(args.rotation ?? 0)
	const pivotX = Number.isFinite(Number(args.pivotX)) ? Math.max(0, Math.min(1, Number(args.pivotX))) : 0.5
	const pivotY = Number.isFinite(Number(args.pivotY)) ? Math.max(0, Math.min(1, Number(args.pivotY))) : 0.5

	// transform.x/y 是 pivot 点；rotatedRectCorners 需要中心点。
	// centerLocal = (0.5 - pivot) * size，再按 rotation 旋转到世界。
	const dx = (0.5 - pivotX) * w
	const dy = (0.5 - pivotY) * h
	const cos = Math.cos(rotation)
	const sin = Math.sin(rotation)
	const center = {
		x: args.worldPivot.x + dx * cos - dy * sin,
		y: args.worldPivot.y + dx * sin + dy * cos,
	}

	const corners = rotatedRectCorners(center, { width: w, height: h }, rotation)
	const sizeText = `${Math.round(w)}×${Math.round(h)}`

	if (args.userType === 'line') {
		const lineProps: Partial<Record<'startX' | 'startY' | 'endX' | 'endY' | 'anchorX' | 'anchorY', unknown>> = args.props ?? {}
		const p = normalizeLineLocalPoints({ props: lineProps, width: w0, height: h0 })
		const scaled = scaleLineLocalPoints(p, sx, sy)
		const linePoints = lineControlPointsWorld(
			center,
			rotation,
			scaled
		)
		return { corners, sizeText, linePoints }
	}

	return { corners, sizeText }
}
