import type { WorkflowState, SavedSelectionFrame, WorkflowNode } from '../../../aiworkflow/types'
import { buildSubgraphPlan } from './subgraphTopology'

export const clone = <T>(value: T): T =>
	value === undefined ? value : JSON.parse(JSON.stringify(value))
export type FrameStepChoice = { action: 'source' | 'generate'; prompt: string }
export type FrameRecipe = {
	version: 1
	frame: SavedSelectionFrame
	nodes: WorkflowNode[]
	edges: WorkflowState['edgesById']
	resources: WorkflowState['resourcesById']
	order: string[]
	sources: string[]
	replacements: Record<string, string>
}

export function captureFrameRecipe(
	state: WorkflowState,
	frame: SavedSelectionFrame,
	replacements: Record<string, string> = {},
	steps: Record<string, FrameStepChoice> = {}
): FrameRecipe {
	replacements = { ...replacements }
	if (!frame.automation?.enabled || !frame.automation.outputBindings.length)
		throw new Error('请先设置组合输出')
	const ids = new Set(frame.nodeIds)
	for (const other of state.savedSelectionFrames) {
		if (
			other.id !== frame.id &&
			other.automation?.enabled &&
			other.nodeIds.some((id) => ids.has(id))
		)
			throw new Error('自动化组合不能交叉或嵌套，请先关闭重叠组合的自动化')
	}
	const edges = clone(state.edgesById)
	for (const edge of Object.values(edges)) {
		if (!ids.has(edge.fromNodeId) && !ids.has(edge.toNodeId)) continue
		for (const side of ['from', 'to'] as const) {
			const ref = side === 'from' ? edge.fromFrame : edge.toFrame
			if (!ref) continue
			const owner = state.savedSelectionFrames.find((f) => f.id === ref.frameId)
			const binding = (
				side === 'from' ? owner?.automation?.outputBindings : owner?.automation?.inputBindings
			)?.find((b) => b.id === ref.portId)
			if (!owner || !binding || !owner.nodeIds.includes(binding.nodeId))
				throw new Error('组合连线接口已失效，请重新绑定')
			if (side === 'from') {
				edge.fromNodeId = binding.nodeId
				edge.fromAnchorId = binding.anchorId
			} else {
				edge.toNodeId = binding.nodeId
				edge.toAnchorId = binding.anchorId
			}
		}
	}
	for (const binding of frame.automation.inputBindings) {
		const incoming = Object.values(edges).filter(
			(e) =>
				e.toNodeId === binding.nodeId && e.toAnchorId === binding.anchorId && !ids.has(e.fromNodeId)
		)
		const member = state.nodesById[binding.nodeId]
		const port = member?.inputs.find((a) => a.id === binding.anchorId)
		const aggregateComfyInput =
			member?.type === 'comfyui' &&
			(['in', 'in-0', 'in-resource'].includes(binding.anchorId) ||
				(port?.mediaType === 'generic' && port.multiInput))
		if (aggregateComfyInput) continue // Preserve image/video edges while adding text to the same input.
		if (incoming.length > 1) throw new Error(`输入 ${binding.label || binding.id} 有多个外部来源`)
		if (incoming.length === 1) {
			const target = state.nodesById[binding.nodeId]
			const passiveAsset =
				target &&
				['text', 'image', 'video', 'model3d'].includes(target.type) &&
				target.outputs.length === 1 &&
				(steps[target.id]?.action === 'source' ||
					(!steps[target.id] && !target.nodeChatDraft?.trim()))
			if (binding.bindingMode === 'source-output' || passiveAsset)
				replacements[binding.nodeId] = incoming[0].fromNodeId
			for (const edge of Object.values(edges))
				if (
					edge.id !== incoming[0].id &&
					edge.toNodeId === binding.nodeId &&
					edge.toAnchorId === binding.anchorId
				)
					delete edges[edge.id]
		}
	}
	for (const [nodeId, sourceId] of Object.entries(replacements)) {
		if (!ids.has(nodeId) || ids.has(sourceId)) throw new Error('替换来源必须是组外节点')
		const target = state.nodesById[nodeId],
			source = state.nodesById[sourceId]
		if (!target || !source || source.type !== target.type || target.outputs.length > 1)
			throw new Error('替换素材类型不一致或目标具有多个输出；请使用单输出素材节点')
		for (const edge of Object.values(edges)) if (edge.toNodeId === nodeId) delete edges[edge.id]
	}
	for (const binding of [...frame.automation.inputBindings, ...frame.automation.outputBindings]) {
		if (!ids.has(binding.nodeId) || !state.nodesById[binding.nodeId])
			throw new Error('组合接口绑定已失效')
		const ports = frame.automation.inputBindings.includes(binding)
			? state.nodesById[binding.nodeId].inputs
			: state.nodesById[binding.nodeId].outputs
		if (!ports.some((p) => p.id === binding.anchorId)) throw new Error('组合接口锚点已失效')
	}
	const plan = buildSubgraphPlan(frame.nodeIds, Object.values(edges))
	if (plan.cyclicNodeIds.length)
		throw new Error('组合存在循环依赖：' + plan.cyclicNodeIds.join(', '))
	const needed = new Set<string>()
	const visit = (id: string) => {
		if (needed.has(id)) return
		needed.add(id)
		if (
			replacements[id] ||
			steps[id]?.action === 'source' ||
			(!steps[id] &&
				state.nodesById[id]?.type !== 'comfyui' &&
				!state.nodesById[id]?.nodeChatDraft?.trim())
		)
			return
		for (const e of Object.values(edges))
			if (e.toNodeId === id && ids.has(e.fromNodeId)) visit(e.fromNodeId)
	}
	frame.automation.outputBindings.forEach((b) => visit(b.nodeId))
	const sources: string[] = []
	for (const id of needed) {
		const node = state.nodesById[id]
		if (!node) throw new Error('成员节点已删除')
		const source = state.nodesById[replacements[id] || id]
		if (
			replacements[id] ||
			steps[id]?.action === 'source' ||
			(!steps[id] && node.type !== 'comfyui' && !node.nodeChatDraft?.trim())
		) {
			if (
				!source ||
				(source.type === 'text' ? typeof source.textValue !== 'string' : !source.resourceId)
			)
				throw new Error(`节点 ${id} 没有已保存素材或可执行提示词；请恢复参数后重试`)
			sources.push(id)
		} else if (node.type === 'comfyui') {
			const settings = node.comfyuiSettings
			if (!settings?.baseUrl || !settings.workflowPath || !settings.templateResolution?.snapshotId)
				throw new Error('ComfyUI 模板尚未就绪，请在节点面板刷新检查或选择成功历史后重试')
		} else if (!['text', 'image', 'video', 'model3d'].includes(node.type))
			throw new Error(`节点 ${node.type} 暂无完成回执适配器，不能自动跳过`)
	}
	for (const edge of Object.values(edges))
		if (sources.includes(edge.toNodeId)) delete edges[edge.id]
	const include = new Set([...needed, ...Object.values(replacements)])
	for (const e of Object.values(edges)) if (needed.has(e.toNodeId)) include.add(e.fromNodeId)
	const nodes = [...include].map((id) => {
		const n = clone(state.nodesById[id])
		if (!n) throw new Error('输入来源已删除')
		if (steps[id]?.action === 'generate') n.nodeChatDraft = steps[id].prompt
		// Chat transcripts, transient previews and task state are not recipes.
		delete (n as unknown as { chatMessages?: unknown }).chatMessages
		return n
	})
	const resources: WorkflowState['resourcesById'] = {}
	for (const node of nodes)
		if (node.resourceId && state.resourcesById[node.resourceId])
			resources[node.resourceId] = clone(state.resourcesById[node.resourceId])
	return {
		version: 1,
		frame: clone(frame),
		nodes,
		edges: Object.fromEntries(Object.entries(edges).filter(([, e]) => needed.has(e.toNodeId))),
		resources,
		order: plan.order.filter((id) => needed.has(id)),
		sources,
		replacements: clone(replacements)
	}
}

export function createFrameExecutionState(live: WorkflowState, recipe: FrameRecipe): WorkflowState {
	const nodesById = Object.fromEntries(recipe.nodes.map((n) => [n.id, clone(n)]))
	for (const [id, sourceId] of Object.entries(recipe.replacements)) {
		const original = nodesById[id],
			source = nodesById[sourceId]
		nodesById[id] = {
			...source,
			id,
			type: original.type,
			inputs: original.inputs,
			outputs: original.outputs
		}
	}
	return {
		...live,
		nodesById,
		edgesById: clone(recipe.edges),
		edgeOrder: Object.keys(recipe.edges),
		resourcesById: clone(recipe.resources)
	}
}
