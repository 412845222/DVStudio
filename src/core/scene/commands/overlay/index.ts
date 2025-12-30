import { lineControlPointsWorld, rotatedRectCorners } from '../../geometry'
import type { VideoSceneNodeProps } from '../../types'
import type { NodeOverlayGeometry } from './types'

export type { NodeOverlayCorners, NodeOverlayGeometry } from './types'

export const buildNodeOverlayGeometry = (args: {
	worldCenter: { x: number; y: number }
	width: number
	height: number
	rotation: number
	userType?: string
	props?: VideoSceneNodeProps
}): NodeOverlayGeometry => {
	const w = Number(args.width ?? 0)
	const h = Number(args.height ?? 0)
	const rotation = Number(args.rotation ?? 0)
	const corners = rotatedRectCorners({ x: args.worldCenter.x, y: args.worldCenter.y }, { width: w, height: h }, rotation)
	const sizeText = `${Math.round(w)}×${Math.round(h)}`

	if (args.userType === 'line') {
		const p = args.props ?? {}
		const startX = Number(p.startX ?? -w / 2)
		const startY = Number(p.startY ?? 0)
		const endX = Number(p.endX ?? w / 2)
		const endY = Number(p.endY ?? 0)
		const anchorX = Number(p.anchorX ?? 0)
		const anchorY = Number(p.anchorY ?? -h / 4)
		const linePoints = lineControlPointsWorld(
			{ x: args.worldCenter.x, y: args.worldCenter.y },
			rotation,
			{ startX, startY, endX, endY, anchorX, anchorY }
		)
		return { corners, sizeText, linePoints }
	}

	return { corners, sizeText }
}
