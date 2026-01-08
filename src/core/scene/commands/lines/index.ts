import { worldToLocalRotated } from '../../geometry'
import type { ComputeLinePointPatchArgs } from './types'

export type { ComputeLinePointPatchArgs, LinePointKind } from './types'

export const computeLinePointPatchFromWorld = (args: ComputeLinePointPatchArgs) => {
	const rotated = worldToLocalRotated(args.worldPoint, args.worldCenter, args.rotation)
	const sx = Math.max(1e-6, Number(args.scaleX ?? 1))
	const sy = Math.max(1e-6, Number(args.scaleY ?? 1))
	const local = { x: rotated.x / sx, y: rotated.y / sy }
	if (args.kind === 'start') return { startX: local.x, startY: local.y }
	if (args.kind === 'end') return { endX: local.x, endY: local.y }
	return { anchorX: local.x, anchorY: local.y }
}
