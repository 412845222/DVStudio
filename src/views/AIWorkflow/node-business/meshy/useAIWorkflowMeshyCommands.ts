import { ref } from 'vue'

export const useAIWorkflowMeshyCommands = (options: {
  store: any
  getComfyService: () => {
    meshyGenerate: (payload: Record<string, any>) => Promise<any>
  }
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
  stopMeshyPoll: (nodeId: string) => void
  startMeshyPoll: (nodeId: string, taskId: string, mode: string) => void
  buildMeshyRequestPayload: (node: any) => Promise<any>
  hasIncomingEdge: (nodeId: string, anchorId: string) => boolean
  connectedMeshyImageUrls: (nodeId: string) => string[]
  normalizeMeshyTaskStatus: (status: unknown) => string
  refreshMeshyTaskItems: (opts?: { silent?: boolean }) => Promise<any> | void
  shouldRefreshMeshyTaskItems: () => boolean
}) => {
  const meshyTextureConfirm = ref<{ nodeId: string; currentTaskId: string; rootTaskId: string } | null>(null)

  const onNodeGenerateMeshy = async (nodeId: string) => {
    const node = options.store.state.nodesById[nodeId]
    if (!node || node.type !== 'meshy') return

    const prepared = await options.buildMeshyRequestPayload(node)
    if (!prepared.ok) {
      options.pushToast(prepared.error, 'warn')
      options.store.commit('setNodeMeshySettings', {
        nodeId,
        meshySettings: {
          meshyTaskStatus: 'failed',
          meshyErrorMessage: prepared.error,
          meshyStatusText: prepared.error,
        },
      })
      return
    }

    options.stopMeshyPoll(nodeId)
    options.store.commit('setNodeMeshySettings', {
      nodeId,
      meshySettings: {
        meshyTaskStatus: 'pending',
        meshyProgress: 0,
        meshyErrorMessage: '',
        meshyStatusText: 'Meshy：正在创建任务…',
        meshyInputSummary: {
          promptSource: prepared.promptSource,
          promptText: prepared.promptText || undefined,
          imageCount: prepared.imageCount,
          modelInputConnected: options.hasIncomingEdge(node.id, 'in-model'),
          lastValidatedAt: Date.now(),
        },
      },
    })

    try {
      const res = await options.getComfyService().meshyGenerate(prepared.payload)
      if (!res.ok) {
        const msg = String(res.error ?? 'Meshy 创建任务失败')
        options.store.commit('setNodeMeshySettings', {
          nodeId,
          meshySettings: {
            meshyTaskStatus: 'failed',
            meshyErrorMessage: msg,
            meshyStatusText: msg,
          },
        })
        options.pushToast(msg, 'warn')
        return
      }

      const taskStatus = options.normalizeMeshyTaskStatus((res as any).status)
      const taskId = String((res as any).taskId ?? '').trim()
      const mode = String((res as any).mode ?? prepared.payload.mode ?? 'text-to-3d').trim()
      options.store.commit('setNodeMeshySettings', {
        nodeId,
        meshySettings: {
          meshyTaskId: taskId,
          meshyTaskStatus: taskStatus === 'idle' ? 'pending' : taskStatus,
          meshyProgress: taskStatus === 'running' ? 5 : 0,
          meshyStatusText: 'Meshy：任务已创建，开始轮询状态…',
        },
      })
      if (options.shouldRefreshMeshyTaskItems()) {
        void options.refreshMeshyTaskItems({ silent: true })
      }
      if (!taskId) {
        options.pushToast('Meshy 返回缺少任务 ID。', 'warn')
        return
      }
      options.startMeshyPoll(nodeId, taskId, mode)
    } catch (err: any) {
      const msg = 'Meshy 创建任务异常：' + String(err?.message ?? err ?? 'unknown')
      options.store.commit('setNodeMeshySettings', {
        nodeId,
        meshySettings: {
          meshyTaskStatus: 'failed',
          meshyErrorMessage: msg,
          meshyStatusText: msg,
        },
      })
      options.pushToast(msg, 'warn')
    }
  }

  const submitMeshyTextureFollowup = async (nodeId: string, currentTaskId: string, rootTaskId: string) => {
    const node = options.store.state.nodesById[nodeId]
    if (!node || node.type !== 'meshy') return
    const settings = node.meshySettings ?? {}
    const relationSummary = settings.meshyRelationSummary ?? {}

    options.store.commit('setNodeMeshySettings', {
      nodeId,
      meshySettings: {
        meshyTaskTarget: '3d',
        meshyTaskFamily: 'retexture',
        meshyRelationKind: 'texture',
        meshyRootTaskId: rootTaskId || currentTaskId,
        meshyParentTaskId: currentTaskId,
        meshyPreviewTaskId: currentTaskId,
        meshyHelpTopic: 'retexture',
        meshyTexturePrompt: String(settings.meshyTexturePrompt ?? '').trim() || undefined,
        meshyRelationSummary: {
          ...(relationSummary ?? {}),
          relationKind: 'texture',
          rootTaskId: rootTaskId || currentTaskId,
          parentTaskId: currentTaskId,
        },
      },
    })
    await onNodeGenerateMeshy(nodeId)
  }

  const onNodeRunMeshyFollowup = async (nodeId: string, kind: 'texture' | 'rigging' | 'animation') => {
    const node = options.store.state.nodesById[nodeId]
    if (!node || node.type !== 'meshy') return
    const settings = node.meshySettings ?? {}
    const relationSummary = settings.meshyRelationSummary ?? {}
    const currentTaskId = String(relationSummary.effectiveTaskId ?? settings.meshyTaskId ?? '').trim()
    const rootTaskId = String(settings.meshyRootTaskId ?? relationSummary.rootTaskId ?? currentTaskId).trim()
    const taskStatus = String(settings.meshyTaskStatus ?? '').trim()

    if (taskStatus === 'pending' || taskStatus === 'running') {
      options.pushToast('当前 Meshy 任务仍在进行中，请等待结束后再发起下一步。', 'warn')
      return
    }
    if (!currentTaskId) {
      options.pushToast('当前节点还没有可复用的 Meshy 任务结果。', 'warn')
      return
    }
    if (kind !== 'texture') {
      options.pushToast('绑骨与动作接口的真实后端任务尚未接入，当前版本先打通贴图闭环。', 'warn')
      return
    }

    const hasNewTextureInput =
      !!String(settings.meshyTexturePrompt ?? '').trim() ||
      !!String(settings.meshyTextureImageUrl ?? '').trim() ||
      options.connectedMeshyImageUrls(nodeId).length > 0
    if (!hasNewTextureInput) {
      meshyTextureConfirm.value = { nodeId, currentTaskId, rootTaskId: rootTaskId || currentTaskId }
      return
    }

    await submitMeshyTextureFollowup(nodeId, currentTaskId, rootTaskId || currentTaskId)
  }

  const onNodeRestartMeshyTask = async (nodeId: string) => {
    const node = options.store.state.nodesById[nodeId]
    if (!node || node.type !== 'meshy') return

    const status = String(node.meshySettings?.meshyTaskStatus ?? '').trim()
    if (status === 'pending' || status === 'running') {
      options.pushToast('当前任务进行中，无法重开新任务。', 'warn')
      return
    }

    options.stopMeshyPoll(nodeId)
    const hasImageRefs = options.connectedMeshyImageUrls(nodeId).length > 0
    const nextFamily = hasImageRefs ? 'image-to-3d' : 'text-to-3d'

    options.store.commit('setNodeMeshySettings', {
      nodeId,
      meshySettings: {
        meshyTaskTarget: '3d',
        meshyTaskFamily: nextFamily,
        meshyRelationKind: 'model',
        meshyTaskId: '',
        meshyTaskStatus: 'idle',
        meshyProgress: 0,
        meshyErrorMessage: '',
        meshyStatusText: '已重置为新任务模式，准备创建新任务…',
        meshyPreviewTaskId: '',
        meshyRootTaskId: '',
        meshyParentTaskId: '',
        meshyRelationSummary: {
          relationKind: 'model',
          rootTaskId: undefined,
          parentTaskId: undefined,
          effectiveTaskId: undefined,
          effectiveRelationKind: 'model',
          effectiveStatus: 'idle',
          effectiveProgress: 0,
          effectivePreferredModelUrl: undefined,
          effectivePreferredImageUrl: undefined,
          effectiveLocalAssetUrl: undefined,
          effectiveLocalAssetPath: undefined,
          effectiveThumbnailUrl: undefined,
        },
      },
    })

    await onNodeGenerateMeshy(nodeId)
  }

  const cancelMeshyTextureConfirm = () => {
    meshyTextureConfirm.value = null
  }

  const confirmMeshyTextureFollowup = async () => {
    const pending = meshyTextureConfirm.value
    if (!pending) return
    meshyTextureConfirm.value = null
    await submitMeshyTextureFollowup(pending.nodeId, pending.currentTaskId, pending.rootTaskId)
  }

  return {
    meshyTextureConfirm,
    cancelMeshyTextureConfirm,
    confirmMeshyTextureFollowup,
    onNodeGenerateMeshy,
    onNodeRunMeshyFollowup,
    onNodeRestartMeshyTask,
  }
}
