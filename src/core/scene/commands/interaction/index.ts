import { findNode, walkTree } from '../../tree'
import type { VideoSceneTreeNode } from '../../types'

import type { HitTestResult, MarqueeSelectionResolution } from './types'

export type { HitTestResult, MarqueeSelectionResolution } from './types'

export const computeMovableSelectionIds = (layerNodeTree: VideoSceneTreeNode[], nodeIds: string[]) => {
	const uniq = Array.from(new Set((Array.isArray(nodeIds) ? nodeIds : []).map((s) => String(s || '').trim()).filter(Boolean)))
	const selected = new Set(uniq)

	const parent = new Map<string, string | null>()
	walkTree(layerNodeTree, (node, parentNode) => {
		parent.set(node.id, parentNode?.id ?? null)
	})

	return uniq.filter((id) => {
		let p = parent.get(id) ?? null
		while (p) {
			if (selected.has(p)) return false
			p = parent.get(p) ?? null
		}
		return true
	})
}

export const getNodeLocalXY = (layerNodeTree: VideoSceneTreeNode[], nodeId: string): { x: number; y: number } | null => {
	const id = String(nodeId || '').trim()
	if (!id) return null
	const n = findNode(layerNodeTree, id)
	if (!n || n.category !== 'user' || !n.transform) return null
	return { x: Number(n.transform.x ?? 0), y: Number(n.transform.y ?? 0) }
}

export const buildStartXYByIdForMove = (layerNodeTree: VideoSceneTreeNode[], nodeIds: string[]) => {
	const out: Record<string, { x: number; y: number }> = {}
	for (const rawId of nodeIds) {
		const id = String(rawId || '').trim()
		if (!id) continue
		const xy = getNodeLocalXY(layerNodeTree, id)
		if (!xy) continue
		out[id] = xy
	}
	return out
}

export const resolveMarqueeSelection = (args: {
	activeLayerId: string
	isClick: boolean
	hit: HitTestResult | null
	hits: HitTestResult[]
}): MarqueeSelectionResolution => {
	const activeLayerId = String(args.activeLayerId || '')
	const isClick = !!args.isClick
	const hit = args.hit

	if (isClick) {
		if (hit?.nodeId) return { type: 'single', nodeId: hit.nodeId, layerId: hit.layerId }
		return { type: 'clear' }
	}

	const nodeIds: string[] = []
	const seen = new Set<string>()
	for (const h of Array.isArray(args.hits) ? args.hits : []) {
		if (!h || h.layerId !== activeLayerId) continue
		const id = String(h.nodeId || '').trim()
		if (!id || seen.has(id)) continue
		seen.add(id)
		nodeIds.push(id)
	}
	return { type: 'multi', nodeIds }
}

export const shouldCollapseMultiSelectionOnPointerUp = (args: { movedPx: number; thresholdPx?: number }): boolean => {
	const threshold = typeof args.thresholdPx === 'number' && Number.isFinite(args.thresholdPx) ? args.thresholdPx : 3
	const movedPx = Number(args.movedPx)
	if (!Number.isFinite(movedPx)) return false
	return movedPx < threshold
}
