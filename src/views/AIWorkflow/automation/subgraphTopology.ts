import type { FrameAutomationPlan } from './frameAutomationTypes'

export interface SubgraphEdge {
	fromNodeId: string
	toNodeId: string
}

/**
 * 对组内节点按「组内边」做 Kahn 拓扑排序。
 * - 只统计两端都在 memberIds 内的边（跨框边不参与排序）；
 * - 同层节点按 ID 字典序输出，保证执行顺序稳定可复现；
 * - 成环节点进入 cyclicNodeIds（运行器据此报错终止）。
 */
export function buildSubgraphPlan(memberIds: string[], edges: SubgraphEdge[]): FrameAutomationPlan {
	const memberSet = new Set(memberIds)
	const indegree = new Map<string, number>()
	const adjacency = new Map<string, string[]>()
	for (const id of memberIds) {
		indegree.set(id, 0)
		adjacency.set(id, [])
	}

	// 去重边，避免平行边重复计数
	const seen = new Set<string>()
	for (const e of edges) {
		if (!memberSet.has(e.fromNodeId) || !memberSet.has(e.toNodeId)) continue
		if (e.fromNodeId === e.toNodeId) continue
		const key = `${e.fromNodeId}=>${e.toNodeId}`
		if (seen.has(key)) continue
		seen.add(key)
		adjacency.get(e.fromNodeId)!.push(e.toNodeId)
		indegree.set(e.toNodeId, (indegree.get(e.toNodeId) ?? 0) + 1)
	}

	// 初始零入度层（字典序）
	let frontier = memberIds.filter((id) => (indegree.get(id) ?? 0) === 0).sort()
	const order: string[] = []

	while (frontier.length > 0) {
		const node = frontier.shift()!
		order.push(node)
		// 释放后继时按字典序插入，维持稳定顺序
		for (const next of adjacency.get(node) ?? []) {
			const d = (indegree.get(next) ?? 0) - 1
			indegree.set(next, d)
			if (d === 0) {
				frontier.push(next)
				frontier.sort()
			}
		}
	}

	const cyclicNodeIds = memberIds.filter((id) => !order.includes(id)).sort()
	return { order, cyclicNodeIds }
}
