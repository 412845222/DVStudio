import type { AIWorkflowDraftSnapshot } from '../../../../aiworkflow/persistence/blueprintSnapshot'
import type { WorkflowState, WorkflowNode } from '../../../../aiworkflow/types'

export const useAIWorkflowProjectUnrealSnapshot = (payload: {
	buildResetUnrealExportSettings: (
		settings?: Record<string, unknown> | null
	) => Record<string, unknown>
}) => {
	const stripUnrealExportRuntimeFromNodes = (
		nodesById: WorkflowState['nodesById']
	): WorkflowState['nodesById'] => {
		const nextNodesById: WorkflowState['nodesById'] = { ...nodesById }
		for (const [nodeId, node] of Object.entries(nodesById)) {
			if (!node || node.type !== 'unreal-export') continue
			const nodeEx = node as WorkflowNode
			nextNodesById[nodeId] = {
				...nodeEx,
				unrealExportSettings: payload.buildResetUnrealExportSettings(
					nodeEx.unrealExportSettings ?? null
				)
			}
		}
		return nextNodesById
	}

	const stripUnrealExportRuntimeFromSnapshot = (
		snapshot: AIWorkflowDraftSnapshot
	): AIWorkflowDraftSnapshot => ({
		...snapshot,
		nodesById: stripUnrealExportRuntimeFromNodes(snapshot.nodesById)
	})

	return {
		stripUnrealExportRuntimeFromNodes,
		stripUnrealExportRuntimeFromSnapshot
	}
}
