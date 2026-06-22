export const useAIWorkflowNodeSettings = (payload: {
  store: {
    state: {
      nodesById: Record<string, any>
    }
    commit: (type: string, value: any) => void
  }
  markViewportMotion: () => void
  scheduleAsyncEdgeRender: () => void
  queueImageDistributeOnPointerUp: (nodeId: string) => void
  autoDistributeImageOutputToConnectedNodes: (nodeId: string) => Promise<void>
}) => {
  const onNodeResize = (
    nodeId: string,
    input: { width: number; height: number; worldX: number; worldY: number }
  ) => {
    payload.markViewportMotion()
    payload.store.commit('setNodeSize', { nodeId, width: input.width, height: input.height })
    payload.store.commit('setNodePosition', { nodeId, worldX: input.worldX, worldY: input.worldY })
    payload.scheduleAsyncEdgeRender()
  }

  const onNodeTextValueUpdate = (nodeId: string, input: { textValue: string }) => {
    payload.store.commit('setNodeTextValue', { nodeId, textValue: String(input?.textValue ?? '') })
  }

  const onNodeImageSettingsUpdate = (
    nodeId: string,
    input: {
      outputWidth?: number
      outputHeight?: number
      naturalWidth?: number
      naturalHeight?: number
      cropEnabled?: boolean
      crop?: { x: number; y: number; width: number; height: number }
      imageGenerationSource?: 'upload' | 'comfyui' | 'meshy'
      meshyImageSettings?: Record<string, any>
    }
  ) => {
    payload.store.commit('setNodeImageSettings', { nodeId, imageSettings: input })
    const hasCropPayload = Object.prototype.hasOwnProperty.call(input, 'crop')
    if (hasCropPayload) {
      payload.queueImageDistributeOnPointerUp(nodeId)
      return
    }
    void payload.autoDistributeImageOutputToConnectedNodes(nodeId)
  }

  const onNodeVideoSettingsUpdate = (
    nodeId: string,
    input: { outputWidth?: number; outputHeight?: number; naturalWidth?: number; naturalHeight?: number }
  ) => {
    const node = payload.store.state.nodesById[nodeId] as any
    const prev = (node?.videoSettings ?? {}) as any
    const next = (input ?? {}) as any
    const keys: Array<'outputWidth' | 'outputHeight' | 'naturalWidth' | 'naturalHeight'> = [
      'outputWidth',
      'outputHeight',
      'naturalWidth',
      'naturalHeight',
    ]
    let changed = false
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(next, key)) continue
      const a = Number(prev?.[key])
      const b = Number(next?.[key])
      if (!Number.isFinite(a) || !Number.isFinite(b) || a !== b) {
        changed = true
        break
      }
    }
    if (!changed) return
    payload.store.commit('setNodeVideoSettings', { nodeId, videoSettings: input })
  }

  const onNodeModel3DSettingsUpdate = (nodeId: string, input: Record<string, any>) => {
    payload.store.commit('setNodeModel3DSettings', { nodeId, model3dSettings: input })
  }

  const onNodeMeshySettingsUpdate = (nodeId: string, input: Record<string, any>) => {
    payload.store.commit('setNodeMeshySettings', { nodeId, meshySettings: input })
  }

  return {
    onNodeResize,
    onNodeTextValueUpdate,
    onNodeImageSettingsUpdate,
    onNodeVideoSettingsUpdate,
    onNodeModel3DSettingsUpdate,
    onNodeMeshySettingsUpdate,
  }
}