export const useAIWorkflowUnrealExportActions = (payload: {
  store: {
    state: {
      nodesById: Record<string, any>
    }
    commit: (type: string, value: any) => void
  }
  unrealExportService: {
    createJob: (input: {
      targetSessionId: string
      sourceNodeId: string
      sceneName: string
      exportPayload: any
    }) => Promise<any>
  }
  connectedTextInputValue: (nodeId: string, inputId: string) => string
  getUnrealExportSourceSceneLayoutNode: (nodeId: string) => any
  getResolvedLayoutForUnreal: (sceneLayoutNodeId: string) => Promise<
    | { ok: true; exportData: any }
    | { ok: false; error: string }
  >
  connectedSceneLayoutModelBindings: (nodeId: string) => any[]
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}) => {
  const normalizeResolvedLayoutSlots = (slots: any[]) => {
    return slots
      .filter((slot) => {
        if (!slot || typeof slot !== 'object') return false
        const slotId = String(slot.slotId ?? '').trim()
        const sourceObjectId = String(slot.sourceObjectId ?? '').trim()
        if (!slotId || !sourceObjectId) return false
        if (!slot.previewInstanceTransform || typeof slot.previewInstanceTransform !== 'object') return false
        if (!slot.modelBinding || typeof slot.modelBinding !== 'object') return false
        return true
      })
      .map((slot) => ({ ...slot }))
      .sort((a, b) => String(a.slotId ?? '').localeCompare(String(b.slotId ?? '')))
  }

  const buildUnrealExportPayload = async (nodeId: string, exportMode: 'scene-layout' | 'lighting-only' = 'scene-layout') => {
    const node = payload.store.state.nodesById[nodeId] as any
    if (!node || node.type !== 'unreal-export') return { ok: false as const, error: '节点不存在' }
    const layoutJson = String(payload.connectedTextInputValue(nodeId, 'in-layout-json') ?? '').trim()
    if (exportMode === 'scene-layout' && !layoutJson) return { ok: false as const, error: '当前节点缺少布局 JSON 输入。' }
    const lightingJson = String(payload.connectedTextInputValue(nodeId, 'in-lighting-json') ?? '').trim()
    if (exportMode === 'lighting-only' && !lightingJson) return { ok: false as const, error: '当前节点缺少灯光 JSON 输入。' }
    const sourceNode = payload.getUnrealExportSourceSceneLayoutNode(nodeId)
    const sourceSceneLayoutSettings = sourceNode?.sceneLayoutSettings ?? null
    const modelBindings = sourceNode ? payload.connectedSceneLayoutModelBindings(sourceNode.id) : []
    const layoutItems = Array.isArray(sourceSceneLayoutSettings?.layoutItems)
      ? sourceSceneLayoutSettings?.layoutItems ?? []
      : []
    const manualModelBindings = Array.isArray(sourceSceneLayoutSettings?.manualModelBindings)
      ? sourceSceneLayoutSettings?.manualModelBindings ?? []
      : []
    const sourceSceneLayoutNodeId = sourceNode?.type === 'scene-layout' ? String(sourceNode.id ?? '').trim() : ''
    if (exportMode === 'scene-layout' && !sourceSceneLayoutNodeId) {
      return { ok: false as const, error: '当前 Unreal 导出节点未连接场景布局节点。' }
    }
    const connectedModelBindings = Array.isArray(modelBindings) ? modelBindings.filter((item: any) => item?.connected) : []
    if (exportMode === 'scene-layout' && connectedModelBindings.length <= 0) {
      return { ok: false as const, error: '当前场景没有可导入的真实模型绑定（glb/gltf）。请先连接模型资源后再导出。' }
    }

    let resolvedLayoutSlots: any[] = []
    let resolvedLayoutWarnings: string[] = []
    let resolvedActorOrigin: Record<string, any> | null = null
    let resolvedSourceItemCount = 0
    if (exportMode === 'scene-layout') {
      const resolvedResult = await payload.getResolvedLayoutForUnreal(sourceSceneLayoutNodeId)
      if (!resolvedResult.ok) {
        return { ok: false as const, error: `获取场景布局 resolved slots 失败：${resolvedResult.error || 'unknown'}` }
      }
      const exportData = resolvedResult.exportData && typeof resolvedResult.exportData === 'object'
        ? resolvedResult.exportData
        : null
      const rawSlots = Array.isArray(exportData?.slots) ? exportData.slots : []
      resolvedLayoutSlots = normalizeResolvedLayoutSlots(rawSlots)
      resolvedLayoutWarnings = Array.isArray(exportData?.warnings)
        ? exportData.warnings.map((item: any) => String(item ?? '').trim()).filter(Boolean)
        : []
      resolvedActorOrigin = exportData?.actorOrigin && typeof exportData.actorOrigin === 'object'
        ? { ...exportData.actorOrigin }
        : null
      resolvedSourceItemCount = Number.isFinite(Number(exportData?.sourceItemCount))
        ? Number(exportData.sourceItemCount)
        : 0
      if (resolvedLayoutSlots.length <= 0) {
        return { ok: false as const, error: 'resolved slots 为空，无法执行场景导出。请先确保场景布局预览完成并且模型绑定可用。' }
      }
    }

    return {
      ok: true as const,
      payload: {
        exportVersion: 5,
        layoutProtocolVersion: 4,
        exportMode,
        sceneName: String(sourceNode?.alias ?? sourceNode?.title ?? node.alias ?? node.title ?? 'DwebSceneExport').trim() || 'DwebSceneExport',
        generatedAt: Date.now(),
        sourceNodeId: String(sourceNode?.id ?? nodeId),
        sourceSceneLayoutNodeId,
        sourceNodeType: String(sourceNode?.type ?? 'unreal-export'),
        layoutJson,
        lightingJson,
        resolvedLayoutSlots,
        resolvedSlotCount: resolvedLayoutSlots.length,
        resolvedLayoutWarnings,
        resolvedActorOrigin,
        resolvedSourceItemCount,
        layoutItems,
        modelBindings: connectedModelBindings,
        manualModelBindings,
        layoutItemCount: layoutItems.length,
        modelBindingCount: connectedModelBindings.length,
        manualModelBindingCount: manualModelBindings.length,
      },
    }
  }

  const onNodeExportUnrealScene = async (nodeId: string) => {
    const node = payload.store.state.nodesById[nodeId] as any
    if (!node || node.type !== 'unreal-export') return
    const settings = node.unrealExportSettings ?? {}
    const targetSessionId = String(settings.targetSessionId ?? settings.connectedSession?.sessionId ?? '').trim()
    if (!targetSessionId) {
      payload.pushToast('当前 Unreal 导出节点尚未连接虚幻插件。', 'warn')
      return
    }
    const built = await buildUnrealExportPayload(nodeId, 'scene-layout')
    if (!built.ok) {
      payload.pushToast(built.error, 'warn')
      return
    }
    payload.store.commit('setNodeUnrealExportSettings', {
      nodeId,
      unrealExportSettings: {
        connectionStatus: 'exporting',
        statusText: '正在创建导出任务',
        message: '正在把场景布局数据发送给 Django 后端。',
        lastExportMode: 'scene-layout',
        lastSlotCount: Number.isFinite(Number(built.payload.resolvedSlotCount))
          ? Number(built.payload.resolvedSlotCount)
          : undefined,
      },
    })
    const res = await payload.unrealExportService.createJob({
      targetSessionId,
      sourceNodeId: built.payload.sourceNodeId,
      sceneName: built.payload.sceneName,
      exportPayload: built.payload,
    })
    if (!res.ok) {
      payload.store.commit('setNodeUnrealExportSettings', {
        nodeId,
        unrealExportSettings: {
          connectionStatus: 'error',
          statusText: '导出任务创建失败',
          message: res.error || 'unknown',
        },
      })
      payload.pushToast(`创建 Unreal 导出任务失败：${res.error || 'unknown'}`, 'warn')
      return
    }
    payload.store.commit('setNodeUnrealExportSettings', {
      nodeId,
      unrealExportSettings: {
        connectionStatus: 'connected',
        statusText: '已连接，导出任务已入队',
        message: '请在虚幻插件中点击“接收布局数据”。',
        lastExportMode: 'scene-layout',
        lastExportJobId: res.job.jobId,
        lastExportStatus: 'queued',
        lastExportStage: '导出任务已入队',
        lastExportProgress: 5,
        lastExportMessage: String(res.job.message ?? '').trim() || '等待插件拉取',
        lastLayoutProtocolVersion: 4,
        lastSlotCount: Number.isFinite(Number(built.payload.resolvedSlotCount))
          ? Number(built.payload.resolvedSlotCount)
          : undefined,
        lastExportAt: Number(res.job.createdAt ?? Date.now()) || Date.now(),
      },
    })
    payload.pushToast(`Unreal 导出任务已创建：${res.job.jobId}`, 'info')
  }

  const onNodeExportUnrealLighting = async (nodeId: string) => {
    const node = payload.store.state.nodesById[nodeId] as any
    if (!node || node.type !== 'unreal-export') return
    const settings = node.unrealExportSettings ?? {}
    const targetSessionId = String(settings.targetSessionId ?? settings.connectedSession?.sessionId ?? '').trim()
    if (!targetSessionId) {
      payload.pushToast('当前 Unreal 导出节点尚未连接虚幻插件。', 'warn')
      return
    }
    const built = await buildUnrealExportPayload(nodeId, 'lighting-only')
    if (!built.ok) {
      payload.pushToast(built.error, 'warn')
      return
    }
    payload.store.commit('setNodeUnrealExportSettings', {
      nodeId,
      unrealExportSettings: {
        connectionStatus: 'exporting',
        statusText: '正在创建灯光任务',
        message: '正在把灯光布局信息发送给 Django 后端。',
        lastExportMode: 'lighting-only',
      },
    })
    const res = await payload.unrealExportService.createJob({
      targetSessionId,
      sourceNodeId: built.payload.sourceNodeId,
      sceneName: built.payload.sceneName,
      exportPayload: built.payload,
    })
    if (!res.ok) {
      payload.store.commit('setNodeUnrealExportSettings', {
        nodeId,
        unrealExportSettings: {
          connectionStatus: 'error',
          statusText: '灯光任务创建失败',
          message: res.error || 'unknown',
        },
      })
      payload.pushToast(`创建 Unreal 灯光任务失败：${res.error || 'unknown'}`, 'warn')
      return
    }
    payload.store.commit('setNodeUnrealExportSettings', {
      nodeId,
      unrealExportSettings: {
        connectionStatus: 'connected',
        statusText: '已连接，灯光任务已入队',
        message: '请在虚幻插件中选择场景Actor并点击“接收灯光数据”。',
        lastExportMode: 'lighting-only',
        lastExportJobId: res.job.jobId,
        lastExportStatus: 'queued',
        lastExportStage: '灯光任务已入队',
        lastExportProgress: 5,
        lastExportMessage: String(res.job.message ?? '').trim() || '等待插件拉取',
        lastExportAt: Number(res.job.createdAt ?? Date.now()) || Date.now(),
      },
    })
    payload.pushToast(`Unreal 灯光任务已创建：${res.job.jobId}`, 'info')
  }

  return {
    buildUnrealExportPayload,
    onNodeExportUnrealScene,
    onNodeExportUnrealLighting,
  }
}