export const useAIWorkflowNodeRefresh = (payload: {
  store: {
    state: {
      nodesById: Record<string, any>
      resourcesById: Record<string, any>
    }
    commit: (type: string, value: any) => void
  }
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
  resetSceneUnderstandingNodeState: (nodeId: string) => void
  getIncomingEdges: (nodeId: string) => Array<any>
  syncModel3DInputFromUpstream: (nodeId: string, opts?: { warn?: boolean }) => Promise<boolean>
  refreshMeshyTaskToNode: (nodeId: string, taskId: string, mode: string) => Promise<any>
  connectedTextInputValue: (nodeId: string, inputId: string) => string | undefined | null
  onNodeRunSceneLayout: (nodeId: string) => Promise<void>
  syncUnrealExportNodes: (opts?: { silent?: boolean; nodeId?: string }) => Promise<void>
  setNodeResourceWithCleanup: (payload: { nodeId: string; resourceId: string | null; resourcePath?: string }) => void
  autoSizeMediaNode: (nodeId: string, url: string, kind: 'image' | 'video') => void
  buildCroppedImageTransferFile: (fromNode: any, sourceUrl: string, sourceName: string) => Promise<File | null>
  onNodeUploadResource: (nodeId: string, file: File, kind: 'image' | 'video', opts?: { autoDistribute?: boolean }) => void
  fileFromUrl: (url: string, fileNameBase: string) => Promise<File>
  forceRefreshCurrentMediaNode: (nodeId: string) => void
  bindMediaResourceToNode: (
    nodeId: string,
    kind: 'image' | 'video',
    url: string,
    name: string,
    opts?: { posterUrl?: string; sourcePath?: string }
  ) => void
  comfyOutputForAnchor: (outputs: any[], fromAnchorId: string, expectedKind: 'image' | 'video') => any
  connectedImageOutputUrl: (node: any, fromAnchorId: string) => string | null
}) => {
  const onNodeRefresh = async (nodeId: string) => {
    const node = payload.store.state.nodesById[nodeId]
    if (!node) return
    if (node.type === 'video' && String(node.resourceId ?? '').trim()) {
      payload.forceRefreshCurrentMediaNode(nodeId)
      payload.pushToast('已重置当前视频节点并重新装载资源。', 'info')
      return
    }
    if (node.type === 'scene-understanding') {
      payload.resetSceneUnderstandingNodeState(nodeId)
      payload.pushToast('场景理解节点状态已重置。', 'info')
      return
    }
    if (node.type === 'scene-layout') {
      const incoming = payload.getIncomingEdges(nodeId)
      const upstreamModelNodeIds = new Set<string>()
      for (const edge of incoming) {
        const fromNodeId = String((edge as any)?.fromNodeId ?? '').trim()
        const fromNode = payload.store.state.nodesById[fromNodeId]
        if (!fromNode) continue
        const toAnchorId = String((edge as any)?.toAnchorId ?? '').trim()
        if (!toAnchorId.startsWith('in-model-')) continue
        upstreamModelNodeIds.add(fromNodeId)
      }

      for (const upstreamNodeId of upstreamModelNodeIds) {
        const upstreamNode = payload.store.state.nodesById[upstreamNodeId]
        if (!upstreamNode) continue
        if (upstreamNode.type === 'model3d') {
          await payload.syncModel3DInputFromUpstream(upstreamNodeId, { warn: false })
          continue
        }
        if (upstreamNode.type === 'meshy') {
          const taskId = String(upstreamNode.meshySettings?.meshyTaskId ?? upstreamNode.meshySettings?.meshyRelationSummary?.effectiveTaskId ?? '').trim()
          if (!taskId) continue
          const mode = String(upstreamNode.meshySettings?.meshyTaskFamily ?? 'text-to-3d')
          await payload.refreshMeshyTaskToNode(upstreamNodeId, taskId, mode)
        }
      }

      const linkedJson = String(payload.connectedTextInputValue(nodeId, 'in-json') ?? '').trim()
      const fallbackJson = String(node.sceneLayoutSettings?.inputJson ?? '').trim()
      if (linkedJson || fallbackJson) {
        if (!linkedJson && fallbackJson) {
          payload.store.commit('setNodeSceneLayoutSettings', {
            nodeId,
            sceneLayoutSettings: {
              inputJson: fallbackJson,
            },
          })
        }
        await payload.onNodeRunSceneLayout(nodeId)
        payload.pushToast('场景布局已从上游输入刷新并重绘。', 'info')
        return
      }

      payload.pushToast('场景布局刷新失败：缺少上游 JSON 输入。', 'warn')
      return
    }
    if (node.type === 'unreal-export') {
      await payload.syncUnrealExportNodes({ silent: false, nodeId })
      payload.pushToast('已刷新 Unreal 插件连接状态。', 'info')
      return
    }
    if (node.type === 'model3d') {
      const synced = await payload.syncModel3DInputFromUpstream(nodeId, { warn: true })
      if (synced) payload.pushToast('已从上游模型输出刷新 3D 节点。', 'info')
      return
    }
    if (node.type !== 'image' && node.type !== 'video') {
      payload.pushToast('手动刷新仅支持场景理解、图片/视频/3D模型节点。', 'warn')
      return
    }

    const expectedKind = node.type === 'image' ? 'image' : 'video'
    const incoming = payload.getIncomingEdges(nodeId)
    if (!incoming.length) {
      payload.pushToast('未找到输入连线，无法刷新资源。', 'warn')
      return
    }

    const reasons: string[] = []
    for (const e of incoming) {
      const fromNode = payload.store.state.nodesById[e.fromNodeId]
      if (!fromNode) continue

      const rid = String(fromNode.resourceId ?? '').trim()
      if (rid) {
        const r = payload.store.state.resourcesById[rid]
        if (r && r.kind === expectedKind) {
          const url = String((r as any).url ?? '').trim()
          const sourcePath = String((r as any).sourcePath ?? '').trim()
          const sourceName = String((r as any).name ?? `${expectedKind}`)
          if (expectedKind === 'image') {
            if (fromNode.type === 'image' && url) {
              payload.bindMediaResourceToNode(nodeId, 'image', url, sourceName, { sourcePath: sourcePath || undefined })
              payload.autoSizeMediaNode(nodeId, url, 'image')
              payload.pushToast('已从输入锚点引用图片资源。', 'info')
              return
            }

            if (url) {
              try {
                const cloned = await payload.fileFromUrl(url, sourceName.replace(/\.[^.]+$/, '') || 'image')
                payload.onNodeUploadResource(nodeId, cloned, 'image', { autoDistribute: false })
                payload.pushToast('已从输入锚点刷新图片资源。', 'info')
                return
              } catch {
                // fallback below
              }
            }

            if (url) {
              payload.bindMediaResourceToNode(nodeId, 'image', url, sourceName, { sourcePath: sourcePath || undefined })
              payload.autoSizeMediaNode(nodeId, url, 'image')
              payload.pushToast('已从输入锚点引用图片资源。', 'info')
              return
            }
          }

          payload.setNodeResourceWithCleanup({ nodeId, resourceId: rid, resourcePath: sourcePath || undefined })
          if (url) payload.autoSizeMediaNode(nodeId, url, expectedKind)
          payload.pushToast(`已从输入锚点刷新${expectedKind === 'image' ? '图片' : '视频'}资源。`, 'info')
          return
        }
        if (r && r.kind !== expectedKind) {
          reasons.push(`上游资源类型为 ${r.kind}，与目标 ${expectedKind} 不匹配`)
        }
      }

      if (fromNode.type === 'comfyui') {
        const outputs = Array.isArray(fromNode.comfyuiSettings?.outputs) ? fromNode.comfyuiSettings.outputs as any[] : []
        const media = payload.comfyOutputForAnchor(outputs, String((e as any).fromAnchorId ?? ''), expectedKind)

        if (media && String((media as any).url || '').trim()) {
          payload.bindMediaResourceToNode(
            nodeId,
            expectedKind,
            String((media as any).url),
            String((media as any).filename || `comfy_${expectedKind}_${Date.now()}`),
            {
              sourcePath: String((media as any).sourcePath || '').trim() || undefined,
            }
          )
          const anchorLabel = String((e as any).fromAnchorId || '输出锚点')
          payload.pushToast(`已从 ComfyUI 锚点 ${anchorLabel} 刷新${expectedKind === 'image' ? '图片' : '视频'}资源。`, 'info')
          return
        }
        reasons.push(`ComfyUI 上游暂无可用${expectedKind === 'image' ? '图片' : '视频'}产出`)
      }

      if (expectedKind === 'image' && fromNode.type === 'scene-decompose') {
        const outputUrl = String(payload.connectedImageOutputUrl(fromNode, String((e as any).fromAnchorId ?? '')) ?? '').trim()
        if (!outputUrl) {
          reasons.push('场景分解上游暂无可用图片输出')
          continue
        }
        try {
          const cloned = await payload.fileFromUrl(outputUrl, String(fromNode.alias ?? fromNode.title ?? 'decompose').replace(/\s+/g, '_') || 'decompose')
          payload.onNodeUploadResource(nodeId, cloned, 'image', { autoDistribute: false })
          payload.pushToast('已从场景分解输出刷新图片资源。', 'info')
          return
        } catch {
          reasons.push('场景分解输出图片无法克隆到当前节点')
          continue
        }
      }
    }

    payload.pushToast(
      reasons.length
        ? `刷新失败：${reasons[0]}`
        : '刷新失败：未找到匹配的输入资源来源。',
      'warn'
    )
  }

  return {
    onNodeRefresh,
  }
}
