import { getLayerNodeTree } from '../../tree'
import type { VideoSceneState, VideoSceneTreeNode } from '../../types'
import type { SnapTarget } from './internalTypes'
import type { BeginSnapContextArgs, SnapContext, StageBounds } from './types'

export const getStageBounds = (stageWidth: number, stageHeight: number): StageBounds => {
	const w = Number(stageWidth)
	const h = Number(stageHeight)
	return {
		left: -w / 2,
		right: w / 2,
		top: -h / 2,
		bottom: h / 2,
	}
}

export const computeSnapThreshold = (zoom: number, basePx: number = 6) => {
	const z = Math.max(0.0001, Number(zoom))
	const b = Number(basePx)
	return b / z
}

export const buildEmptySnapContext = (args: BeginSnapContextArgs): SnapContext => {
	return {
		nodeLinesX: [],
		nodeLinesY: [],
		stage: getStageBounds(args.stageWidth, args.stageHeight),
		threshold: computeSnapThreshold(args.zoom, args.basePx ?? 6),
	}
}

export const buildSnapContextForLayer = (args: {
	state: Pick<VideoSceneState, 'layers'>
	layerId: string
	excludeNodeId: string
	stageWidth: number
	stageHeight: number
	zoom: number
	basePx?: number
}): SnapContext => {
	const layerId = String(args.layerId || '')
	const layerTree = getLayerNodeTree(args.state, layerId)
	const targets = collectSnapTargets(layerTree, args.excludeNodeId)
	const { xs, ys } = buildSnapLines(targets)
	return {
		nodeLinesX: xs,
		nodeLinesY: ys,
		stage: getStageBounds(args.stageWidth, args.stageHeight),
		threshold: computeSnapThreshold(args.zoom, args.basePx ?? 6),
	}
}

const collectSnapTargets = (layerNodeTree: VideoSceneTreeNode[], excludeNodeId: string): SnapTarget[] => {
	const exclude = String(excludeNodeId || '').trim()
	const out: SnapTarget[] = []

	const walk = (nodes: VideoSceneTreeNode[], parentWorld: { x: number; y: number }) => {
		for (const n of nodes) {
			const hasT = !!n.transform
			const world = hasT
				? { x: parentWorld.x + (n.transform?.x ?? 0), y: parentWorld.y + (n.transform?.y ?? 0) }
				: parentWorld
			const nextParentWorld = hasT ? world : parentWorld

			if (n.category === 'user' && n.transform && n.id !== exclude) {
				out.push({
					cx: world.x,
					cy: world.y,
					w: Math.max(1, Number(n.transform.width ?? 1)),
					h: Math.max(1, Number(n.transform.height ?? 1)),
				})
			}

			if (n.children?.length) walk(n.children, nextParentWorld)
		}
	}

	walk(layerNodeTree, { x: 0, y: 0 })
	return out
}

const buildSnapLines = (targets: SnapTarget[]) => {
	const xs: number[] = []
	const ys: number[] = []
	for (const t of targets) {
		xs.push(t.cx - t.w / 2, t.cx, t.cx + t.w / 2)
		ys.push(t.cy - t.h / 2, t.cy, t.cy + t.h / 2)
	}
	return { xs, ys }
}

