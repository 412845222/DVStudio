import type { AIWorkflowDraftSnapshot } from '../../../../aiworkflow/persistence/blueprintSnapshot'
import type { WorkflowState } from '../../../../aiworkflow/types'

export const useAIWorkflowProjectUnrealSnapshot = (payload: {
  buildResetUnrealExportSettings: (settings?: Record<string, any> | null) => Record<string, any>
}) => {
  const stripUnrealExportRuntimeFromNodes = (nodesById: WorkflowState['nodesById']): WorkflowState['nodesById'] => {
    const nextNodesById: WorkflowState['nodesById'] = { ...nodesById }
    for (const [nodeId, node] of Object.entries(nodesById)) {
      if (!node || node.type !== 'unreal-export') continue
      nextNodesById[nodeId] = {
        ...(node as any),
        unrealExportSettings: payload.buildResetUnrealExportSettings((node as any).unrealExportSettings ?? null),
      } as any
    }
    return nextNodesById
  }

  const stripUnrealExportRuntimeFromSnapshot = (snapshot: AIWorkflowDraftSnapshot): AIWorkflowDraftSnapshot => ({
    ...snapshot,
    nodesById: stripUnrealExportRuntimeFromNodes(snapshot.nodesById),
  })

  return {
    stripUnrealExportRuntimeFromNodes,
    stripUnrealExportRuntimeFromSnapshot,
  }
}
