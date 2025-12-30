import { findLayerIdByNodeIdInLayers } from '../../tree'
import type { VideoSceneState } from '../../types'
import { applyResizeSnapAxis } from './axis'
import { buildEmptySnapContext, buildSnapContextForLayer } from './context'
import { SnapSessionBase } from './baseSession'
import type { SnapCandidateX, SnapCandidateY, SnapModeX, SnapModeY } from './internalTypes'
import type { ResizeSnapResolveResult, ResizeSnapSession, SnapLock, StageBounds } from './types'

class ResizeSnapSessionImpl extends SnapSessionBase<
	ResizeSnapSession,
	{
		corner: 'tl' | 'tr' | 'bl' | 'br'
		anchorWorld: { x: number; y: number }
		movingX: number
		movingY: number
		cx: number
		cy: number
		minSize: number
	},
	ResizeSnapResolveResult
> {
	public constructor(session: ResizeSnapSession) {
		super(session)
	}

	public static beginForNode(args: {
		state: Pick<VideoSceneState, 'layers'>
		nodeId: string
		stageWidth: number
		stageHeight: number
		zoom: number
		basePx?: number
	}): ResizeSnapSession {
		const nodeId = String(args.nodeId || '')
		const layerId = findLayerIdByNodeIdInLayers(args.state.layers, nodeId)
		if (!layerId) return { ctx: buildEmptySnapContext(args), lock: null }
		return {
			ctx: buildSnapContextForLayer({
				state: args.state,
				layerId,
				excludeNodeId: nodeId,
				stageWidth: args.stageWidth,
				stageHeight: args.stageHeight,
				zoom: args.zoom,
				basePx: args.basePx,
			}),
			lock: null,
		}
	}

	protected compute(args: {
		corner: 'tl' | 'tr' | 'bl' | 'br'
		anchorWorld: { x: number; y: number }
		movingX: number
		movingY: number
		cx: number
		cy: number
		minSize: number
	}): ResizeSnapResolveResult {
		return ResizeSnapSessionImpl.computeResizeSnap({
			corner: args.corner,
			anchorWorld: args.anchorWorld,
			movingX: args.movingX,
			movingY: args.movingY,
			cx: args.cx,
			cy: args.cy,
			minSize: args.minSize,
			nodeLinesX: this.ctx.nodeLinesX,
			nodeLinesY: this.ctx.nodeLinesY,
			stage: this.ctx.stage,
			threshold: this.ctx.threshold,
			lock: this.lock,
		})
	}

	private static computeResizeSnap(args: {
		corner: 'tl' | 'tr' | 'bl' | 'br'
		anchorWorld: { x: number; y: number }
		movingX: number
		movingY: number
		cx: number
		cy: number
		minSize: number
		nodeLinesX: number[]
		nodeLinesY: number[]
		stage: StageBounds
		threshold: number
		lock: SnapLock | null
	}): ResizeSnapResolveResult {
		const corner = args.corner
		const minSize = Number(args.minSize)
		const threshold = Number(args.threshold)
		const lock = args.lock
		const stage = args.stage

		let movingX = Number(args.movingX)
		let movingY = Number(args.movingY)
		let cx = Number(args.cx)
		let cy = Number(args.cy)

		const movingModeX: SnapModeX = corner === 'tl' || corner === 'bl' ? 'l' : 'r'
		const movingModeY: SnapModeY = corner === 'tl' || corner === 'tr' ? 't' : 'b'
		const candNodesX: SnapCandidateX[] = [
			{ mode: movingModeX, v: movingX },
			{ mode: 'c', v: cx },
		]
		const candNodesY: SnapCandidateY[] = [
			{ mode: movingModeY, v: movingY },
			{ mode: 'c', v: cy },
		]
		const candStageX: SnapCandidateX[] = [{ mode: movingModeX, v: movingX }]
		const candStageY: SnapCandidateY[] = [{ mode: movingModeY, v: movingY }]

		const sxNodes = applyResizeSnapAxis('x', args.anchorWorld.x, movingX, args.nodeLinesX, candNodesX, threshold, minSize, lock)
		const syNodes = applyResizeSnapAxis('y', args.anchorWorld.y, movingY, args.nodeLinesY, candNodesY, threshold, minSize, lock)
		const sxStage = applyResizeSnapAxis('x', args.anchorWorld.x, movingX, [stage.left, stage.right], candStageX, threshold, minSize, lock)
		const syStage = applyResizeSnapAxis('y', args.anchorWorld.y, movingY, [stage.top, stage.bottom], candStageY, threshold, minSize, lock)

		const sx = (sxStage.dist ?? Infinity) < (sxNodes.dist ?? Infinity) ? sxStage : sxNodes
		const sy = (syStage.dist ?? Infinity) < (syNodes.dist ?? Infinity) ? syStage : syNodes

		movingX = sx.moving
		movingY = sy.moving
		const width = sx.size
		const height = sy.size
		cx = sx.center
		cy = sy.center

		const nextLock: SnapLock = { ...(lock ?? {}) }
		if (sx.lock) nextLock.x = sx.lock
		else delete nextLock.x
		if (sy.lock) nextLock.y = sy.lock
		else delete nextLock.y

		return {
			movingX,
			movingY,
			width,
			height,
			cx,
			cy,
			snappedLineX: sx.snappedLine,
			snappedLineY: sy.snappedLine,
			lock: Object.keys(nextLock).length ? nextLock : null,
		}
	}
}

export const beginResizeSnapSessionForNode = (args: {
	state: Pick<VideoSceneState, 'layers'>
	nodeId: string
	stageWidth: number
	stageHeight: number
	zoom: number
	basePx?: number
}): ResizeSnapSession => {
	return ResizeSnapSessionImpl.beginForNode(args)
}

export const stepResizeSnapSession = (args: {
	session: ResizeSnapSession
	corner: 'tl' | 'tr' | 'bl' | 'br'
	anchorWorld: { x: number; y: number }
	movingX: number
	movingY: number
	cx: number
	cy: number
	minSize: number
}): { session: ResizeSnapSession; result: ResizeSnapResolveResult } => {
	return new ResizeSnapSessionImpl(args.session).step({
		corner: args.corner,
		anchorWorld: args.anchorWorld,
		movingX: args.movingX,
		movingY: args.movingY,
		cx: args.cx,
		cy: args.cy,
		minSize: args.minSize,
	})
}
