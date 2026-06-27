import type { WorkflowState } from '../../types'

export type WorldRect = { x0: number; y0: number; x1: number; y1: number }

export const hitTestNodesInWorldRect = (
	state: Pick<WorkflowState, 'nodeOrder' | 'nodesById'>,
	worldRect: WorldRect,
	defaults?: { nodeWidth?: number; nodeHeight?: number }
): string[] => {
	const r = worldRect
	const xMin = Math.min(r.x0, r.x1)
	const xMax = Math.max(r.x0, r.x1)
	const yMin = Math.min(r.y0, r.y1)
	const yMax = Math.max(r.y0, r.y1)

	const fallbackWidth = Number(defaults?.nodeWidth ?? 240)
	const fallbackHeight = Number(defaults?.nodeHeight ?? 160)

	const hits: string[] = []
	for (const id of state.nodeOrder) {
		const n = state.nodesById[id]
		if (!n) continue
		const w = Number.isFinite(n.width) ? n.width : fallbackWidth
		const h = Number.isFinite(n.height) ? n.height : fallbackHeight
		const left = n.worldX - w / 2
		const right = n.worldX + w / 2
		const top = n.worldY - h / 2
		const bottom = n.worldY + h / 2
		const intersects = !(right < xMin || left > xMax || bottom < yMin || top > yMax)
		if (intersects) hits.push(id)
	}
	return hits
}
