import type { WorkflowNode, WorkflowEdge } from './types'

export const NODE_WIDTH = 240
export const NODE_HEIGHT = 160
export const NODE_SPACING_X = 320
export const NODE_SPACING_Y = 200

/**
 * 计算从源节点出发的新节点位置，避免与下游已有节点重叠
 * 策略：找到源节点下游的最右侧节点，在其右侧放置；如果没有下游节点，在源节点右侧放置
 * 垂直方向：根据下游节点数量，自动向下偏移避免重叠
 */
export const findNextNodePositionFromSource = (
	fromNodeId: string,
	state: { nodesById: Record<string, WorkflowNode>; edgesById: Record<string, WorkflowEdge> }
): { worldX: number; worldY: number } => {
	const fromNode = state.nodesById[fromNodeId]
	if (!fromNode) {
		return { worldX: 100, worldY: 100 }
	}

	const baseX = Number(fromNode.worldX || 0)
	const baseY = Number(fromNode.worldY || 0)

	const downstreamNodes: WorkflowNode[] = []
	for (const edge of Object.values(state.edgesById)) {
		if (String(edge.fromNodeId || '').trim() === fromNodeId) {
			const toNodeId = String(edge.toNodeId || '').trim()
			const toNode = state.nodesById[toNodeId]
			if (toNode) {
				downstreamNodes.push(toNode)
			}
		}
	}

	if (downstreamNodes.length === 0) {
		return { worldX: baseX + NODE_SPACING_X, worldY: baseY }
	}

	let maxX = -Infinity
	let maxY = -Infinity
	for (const node of downstreamNodes) {
		const x = Number(node.worldX || 0)
		const y = Number(node.worldY || 0)
		if (x > maxX) maxX = x
		if (y > maxY) maxY = y
	}

	const ySpread = maxY - baseY
	const shouldOffsetY = Math.abs(ySpread) < NODE_HEIGHT && downstreamNodes.length >= 3

	return {
		worldX: maxX + NODE_SPACING_X,
		worldY: shouldOffsetY ? baseY + NODE_SPACING_Y * Math.ceil(downstreamNodes.length / 3) : baseY
	}
}
