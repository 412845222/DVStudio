import { describe, it, expect } from 'vitest'
import { buildSubgraphPlan } from '@/views/AIWorkflow/automation/subgraphTopology'
import type { SubgraphEdge } from '@/views/AIWorkflow/automation/subgraphTopology'

/**
 * 多选组合自动化：组内子图拓扑排序（Kahn）纯函数测试。
 * 组内执行顺序必须：上游先于下游、跨框边不参与、成环显式上报、顺序稳定可复现。
 */
describe('buildSubgraphPlan', () => {
	it('空成员集合返回空顺序且无环', () => {
		const plan = buildSubgraphPlan([], [])
		expect(plan.order).toEqual([])
		expect(plan.cyclicNodeIds).toEqual([])
	})

	it('无连线时按节点 ID 字典序稳定输出', () => {
		const plan = buildSubgraphPlan(['n3', 'n1', 'n2'], [])
		expect(plan.order).toEqual(['n1', 'n2', 'n3'])
		expect(plan.cyclicNodeIds).toEqual([])
	})

	it('线性链路按依赖方向排序：a→b→c', () => {
		const edges: SubgraphEdge[] = [
			{ fromNodeId: 'a', toNodeId: 'b' },
			{ fromNodeId: 'b', toNodeId: 'c' }
		]
		const plan = buildSubgraphPlan(['c', 'b', 'a'], edges)
		expect(plan.order).toEqual(['a', 'b', 'c'])
		expect(plan.cyclicNodeIds).toEqual([])
	})

	it('菱形依赖保证两个上游先于汇聚节点', () => {
		// root → left/right → merge
		const edges: SubgraphEdge[] = [
			{ fromNodeId: 'root', toNodeId: 'left' },
			{ fromNodeId: 'root', toNodeId: 'right' },
			{ fromNodeId: 'left', toNodeId: 'merge' },
			{ fromNodeId: 'right', toNodeId: 'merge' }
		]
		const plan = buildSubgraphPlan(['merge', 'right', 'left', 'root'], edges)
		expect(plan.cyclicNodeIds).toEqual([])
		expect(plan.order[0]).toBe('root')
		expect(plan.order.slice(1, 3).sort()).toEqual(['left', 'right'])
		expect(plan.order[3]).toBe('merge')
	})

	it('忽略任一端不在组内的跨框边', () => {
		const edges: SubgraphEdge[] = [
			{ fromNodeId: 'outside', toNodeId: 'b' },
			{ fromNodeId: 'b', toNodeId: 'outside2' },
			{ fromNodeId: 'a', toNodeId: 'b' }
		]
		const plan = buildSubgraphPlan(['a', 'b'], edges)
		expect(plan.order).toEqual(['a', 'b'])
		expect(plan.cyclicNodeIds).toEqual([])
	})

	it('平行边去重，不重复计入入度', () => {
		const edges: SubgraphEdge[] = [
			{ fromNodeId: 'a', toNodeId: 'b' },
			{ fromNodeId: 'a', toNodeId: 'b' },
			{ fromNodeId: 'a', toNodeId: 'b' }
		]
		const plan = buildSubgraphPlan(['a', 'b'], edges)
		expect(plan.order).toEqual(['a', 'b'])
	})

	it('忽略节点自环，不将其误判为成环', () => {
		const edges: SubgraphEdge[] = [{ fromNodeId: 'a', toNodeId: 'a' }]
		const plan = buildSubgraphPlan(['a'], edges)
		expect(plan.order).toEqual(['a'])
		expect(plan.cyclicNodeIds).toEqual([])
	})

	it('检测有环子图并上报无法排序的环内节点', () => {
		// a→b→c→a 构成环；独立节点 d 仍可正常排序
		const edges: SubgraphEdge[] = [
			{ fromNodeId: 'a', toNodeId: 'b' },
			{ fromNodeId: 'b', toNodeId: 'c' },
			{ fromNodeId: 'c', toNodeId: 'a' }
		]
		const plan = buildSubgraphPlan(['a', 'b', 'c', 'd'], edges)
		expect(plan.order).toEqual(['d'])
		expect(plan.cyclicNodeIds).toEqual(['a', 'b', 'c'])
	})

	it('同层节点始终按字典序输出，保证多次运行结果一致', () => {
		const edges: SubgraphEdge[] = [
			{ fromNodeId: 'zeta', toNodeId: 'n1' },
			{ fromNodeId: 'alpha', toNodeId: 'n2' }
		]
		const first = buildSubgraphPlan(['n1', 'n2', 'zeta', 'alpha'], edges)
		const second = buildSubgraphPlan(['n2', 'n1', 'alpha', 'zeta'], edges)
		expect(first.order).toEqual(second.order)
		// alpha 释放 n2 后，n2 按字典序插入到 zeta 之前
		expect(first.order).toEqual(['alpha', 'n2', 'zeta', 'n1'])
	})
})
