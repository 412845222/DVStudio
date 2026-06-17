export type AIWorkflowDraggedMeshyTaskItem = Record<string, any>

export const useAIWorkflowMeshyDrop = (options: {
  store: any
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}) => {
  const createNodeFromDraggedMeshyTask = (payload: {
    item: AIWorkflowDraggedMeshyTaskItem
    worldX: number
    worldY: number
  }) => {
    options.store.commit('addNodeAt', {
      worldX: payload.worldX,
      worldY: payload.worldY,
      title: 'Meshy 任务',
    })
    const nodeId = options.store.state.selectedNodeId
    if (!nodeId) return true

    options.store.commit('setNodeType', { nodeId, type: 'meshy' })
    options.store.commit('setNodeMeshySettings', {
      nodeId,
      meshySettings: {
        ...(payload.item.meshySettings ?? {}),
        meshyTaskStatus: String(payload.item.meshySettings?.meshyTaskStatus ?? 'idle') as any,
        meshyTaskId:
          String(payload.item.taskId ?? payload.item.meshySettings?.meshyTaskId ?? '').trim() || undefined,
        meshyStatusText:
          String(payload.item.meshySettings?.meshyStatusText ?? '').trim() || undefined,
        meshyInputSummary: payload.item.meshySettings?.meshyInputSummary ?? undefined,
        meshyOutputSummary: payload.item.meshySettings?.meshyOutputSummary ?? undefined,
      },
    })
    options.store.commit('setNodeAlias', {
      nodeId,
      alias:
        String(payload.item.alias ?? payload.item.title ?? 'Meshy任务节点').trim() || 'Meshy任务节点',
    })
    options.pushToast('已从 Meshy 任务中心创建节点。', 'info')
    return true
  }

  return {
    createNodeFromDraggedMeshyTask,
  }
}
