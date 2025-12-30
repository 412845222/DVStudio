import { findLayerIdByNodeIdInLayers } from '../../tree'
import type { VideoSceneState } from '../../types'
import { applySnapAxis } from './axis'
import { buildEmptySnapContext, buildSnapContextForLayer } from './context'
import { SnapSessionBase } from './baseSession'
import type { MoveSnapResult, MoveSnapSession, SnapLock, StageBounds } from './types'

class MoveSnapSessionImpl extends SnapSessionBase<
	MoveSnapSession,
	{ rawWorldCx: number; rawWorldCy: number; width: number; height: number },
	MoveSnapResult
> {
	public constructor(session: MoveSnapSession) {
		super(session)
	}

	public static beginForNode(args: {
		state: Pick<VideoSceneState, 'layers'>
		nodeId: string
		stageWidth: number
		stageHeight: number
		zoom: number
		basePx?: number
	}): MoveSnapSession {
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

	protected compute(args: { rawWorldCx: number; rawWorldCy: number; width: number; height: number }): MoveSnapResult {
		return MoveSnapSessionImpl.computeMoveSnap({
			rawWorldCx: args.rawWorldCx,
			rawWorldCy: args.rawWorldCy,
			width: args.width,
			height: args.height,
			nodeLinesX: this.ctx.nodeLinesX,
			nodeLinesY: this.ctx.nodeLinesY,
			stage: this.ctx.stage,
			threshold: this.ctx.threshold,
			lock: this.lock,
		})
	}

	private static computeMoveSnap(args: {
		rawWorldCx: number
		rawWorldCy: number
		width: number
		height: number
		nodeLinesX: number[]
		nodeLinesY: number[]
		stage: StageBounds
		threshold: number
		lock: SnapLock | null
	}): MoveSnapResult {
		const rawWorldCx = Number(args.rawWorldCx)
		const rawWorldCy = Number(args.rawWorldCy)
		const w = Math.max(1, Number(args.width))
		const h = Math.max(1, Number(args.height))
		const threshold = Number(args.threshold)
		const lock = args.lock
		const stage = args.stage

		const sxNodes = applySnapAxis('x', rawWorldCx, w, args.nodeLinesX, threshold, lock)
		const syNodes = applySnapAxis('y', rawWorldCy, h, args.nodeLinesY, threshold, lock)
		const sxStage = applySnapAxis('x', rawWorldCx, w, [stage.left, stage.right], threshold, lock, {
			candidates: [
				{ mode: 'l', v: rawWorldCx - w / 2 },
				{ mode: 'r', v: rawWorldCx + w / 2 },
			],
		})
		const syStage = applySnapAxis('y', rawWorldCy, h, [stage.top, stage.bottom], threshold, lock, {
			candidates: [
				{ mode: 't', v: rawWorldCy - h / 2 },
				{ mode: 'b', v: rawWorldCy + h / 2 },
			],
		})

		const sx = (sxStage.dist ?? Infinity) < (sxNodes.dist ?? Infinity) ? sxStage : sxNodes
		const sy = (syStage.dist ?? Infinity) < (syNodes.dist ?? Infinity) ? syStage : syNodes

		const nextLock: SnapLock = { ...(lock ?? {}) }
		if (sx.lock) nextLock.x = sx.lock
		else delete nextLock.x
		if (sy.lock) nextLock.y = sy.lock
		else delete nextLock.y

		return {
			worldCx: sx.center,
			worldCy: sy.center,
			snappedLineX: sx.snappedLine,
			snappedLineY: sy.snappedLine,
			lock: Object.keys(nextLock).length ? nextLock : null,
		}
	}
}

export const beginMoveSnapSessionForNode = (args: {
	state: Pick<VideoSceneState, 'layers'>
	nodeId: string
	stageWidth: number
	stageHeight: number
	zoom: number
	basePx?: number
}): MoveSnapSession => {
	return MoveSnapSessionImpl.beginForNode(args)
}

export const stepMoveSnapSession = (args: {
	session: MoveSnapSession
	rawWorldCx: number
	rawWorldCy: number
	width: number
	height: number
}): { session: MoveSnapSession; result: MoveSnapResult } => {
	return new MoveSnapSessionImpl(args.session).step({
		rawWorldCx: args.rawWorldCx,
		rawWorldCy: args.rawWorldCy,
		width: args.width,
		height: args.height,
	})
}
