import { worldToLocalRotated } from '../../geometry'
import type { ComputeLinePointPatchArgs } from './types'

export type { ComputeLinePointPatchArgs, LinePointKind } from './types'

export const computeLinePointPatchFromWorld = (args: ComputeLinePointPatchArgs) => {
	const local = worldToLocalRotated(args.worldPoint, args.worldCenter, args.rotation)
	if (args.kind === 'start') return { startX: local.x, startY: local.y }
	if (args.kind === 'end') return { endX: local.x, endY: local.y }
	return { anchorX: local.x, anchorY: local.y }
}
