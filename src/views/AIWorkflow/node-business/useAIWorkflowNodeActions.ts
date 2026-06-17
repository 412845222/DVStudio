type WorkflowNodeType =
  | 'base'
  | 'text'
  | 'text-merge'
  | 'image'
  | 'rotate-image'
  | 'video'
  | 'scene-understanding'
  | 'scene-decompose'
  | 'scene-layout'
  | 'unreal-export'
  | 'story'
  | 'comfyui'
  | 'model3d'
  | 'meshy'

export const useAIWorkflowNodeActions = (payload: {
  store: {
    state: {
      nodesById: Record<string, any>
    }
    commit: (type: string, value: any) => void
  }
  selectedNodeIds: { value: string[] }
  pasteNodesWithResourceDedupe: (position?: { worldX?: number; worldY?: number }) => void
  removeSelectedNodesWithResourceCleanup: (nodeIds: string[]) => Promise<void>
}) => {
  const onNodeCopy = (nodeId: string) => {
    payload.store.commit('copyNode', { nodeId })
  }

  const onNodePaste = (nodeId: string) => {
    const node = payload.store.state.nodesById[nodeId]
    if (!node) return
    payload.pasteNodesWithResourceDedupe({ worldX: node.worldX + 20, worldY: node.worldY + 20 })
  }

  const onNodeDelete = (nodeId: string) => {
    if (payload.selectedNodeIds.value.length > 1 && payload.selectedNodeIds.value.includes(nodeId)) {
      void payload.removeSelectedNodesWithResourceCleanup(payload.selectedNodeIds.value)
      return
    }
    payload.store.commit('setSelectedNode', { nodeId })
    void payload.removeSelectedNodesWithResourceCleanup([nodeId])
  }

  const onNodeSetType = (nodeId: string, type: WorkflowNodeType) => {
    payload.store.commit('setNodeType', { nodeId, type })
  }

  return {
    onNodeCopy,
    onNodePaste,
    onNodeDelete,
    onNodeSetType,
  }
}