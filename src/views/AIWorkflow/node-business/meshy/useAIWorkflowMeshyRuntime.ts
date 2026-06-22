export const useAIWorkflowMeshyRuntime = (options: {
  store: any
  getComfyService: () => {
    meshyTask: (taskId: string, mode: string) => Promise<any>
  }
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
  normalizeMeshyTaskStatus: (raw: any) => string
  pickMeshyPreferredModelUrl: (urls: Record<string, string> | null | undefined) => string
  pickMeshyPreferredFormat: (urls: Record<string, string> | null | undefined) => 'glb' | 'gltf'
  fileExtensionFromUrl: (url: string, fallbackExt: string) => string
  persistExternalAssetToProject: (payload: {
    kind: 'image' | 'file'
    name: string
    sourceUrl?: string
    sourcePath?: string
  }) => Promise<{ url: string; absolutePath: string; projectRelativePath?: string } | null>
  syncConnectedImageTargetsFromMeshy: (nodeId: string) => Promise<any>
  syncConnectedModel3DTargets: (nodeId: string) => Promise<any>
  refreshMeshyTaskItems: (opts?: { silent?: boolean }) => Promise<any> | void
  shouldRefreshMeshyTaskItems: () => boolean
}) => {
  const normalizeText = (value: unknown) => String(value ?? '').trim()
  const isMeshyRemoteUrl = (value: unknown) => {
    const text = normalizeText(value)
    if (!text) return false
    try {
      const url = new URL(text)
      return /(^|\.)meshy\.ai$/i.test(url.hostname)
    } catch {
      return /https?:\/\/[^\s]*meshy\.ai(?:\/|$)/i.test(text)
    }
  }

  const pickLocalThumbnailCandidate = (...values: unknown[]) => {
    for (const raw of values) {
      const text = normalizeText(raw)
      if (!text) continue
      if (isMeshyRemoteUrl(text)) continue
      return text
    }
    return ''
  }

  const meshyPollTimers = new Map<string, number>()
  const meshyPollErrorCounts = new Map<string, number>()
  const meshyTerminalNotified = new Set<string>()

  const stopMeshyPoll = (nodeId: string) => {
    const timer = meshyPollTimers.get(nodeId)
    if (timer != null) {
      window.clearInterval(timer)
      meshyPollTimers.delete(nodeId)
    }
    meshyPollErrorCounts.delete(nodeId)
  }

  const applyMeshyTaskResult = async (nodeId: string, task: Record<string, any>) => {
    const normalized = options.normalizeMeshyTaskStatus(task.status)
    const node = options.store.state.nodesById[nodeId]

    // 根据节点类型读取 meshy 设置
    const getMeshySettings = (n: any): Record<string, any> => {
      if (n?.type === 'image') return n.imageSettings?.meshyImageSettings ?? {}
      if (n?.type === 'model3d') return n.model3dSettings?.meshyModelSettings ?? {}
      return n?.meshySettings ?? {}
    }
    const existingSettings = getMeshySettings(node)

    const target =
      String(existingSettings.taskFamily ?? '').includes('image') ||
      String(task.mode ?? '').includes('image') ? 'image' : '3d'
    const isImageTarget = target === 'image'
    const modelUrls = task.modelUrls && typeof task.modelUrls === 'object' ? task.modelUrls : {}
    const imageUrls = Array.isArray((task as any).imageUrls)
      ? (task as any).imageUrls.map((x: any) => String(x ?? '').trim()).filter(Boolean)
      : []
    const preferredImageUrl = String((task as any).preferredImageUrl ?? imageUrls[0] ?? '').trim()
    const preferredModelUrl =
      String(task.preferredModelUrl ?? '').trim() || options.pickMeshyPreferredModelUrl(modelUrls)
    const thumbnailUrl = String(task.thumbnailUrl ?? '').trim()
    const statusText = String(task.statusText ?? '').trim()
    const errorMessage = String(task.errorMessage ?? '').trim()
    const format = options.pickMeshyPreferredFormat(modelUrls)
    const existingLocalThumbnailUrl = pickLocalThumbnailCandidate(
      existingSettings.outputSummary?.thumbnailUrl,
      existingSettings.thumbnailUrl,
    )
    let resolvedThumbnailUrl = isImageTarget
      ? (thumbnailUrl || existingLocalThumbnailUrl)
      : existingLocalThumbnailUrl

    const patch: Record<string, any> = {
      meshyTaskId: String(task.taskId ?? '').trim(),
      meshyRelationKind: String(existingSettings.relationKind ?? 'model').trim() || 'model',
      meshyRootTaskId: String(existingSettings.rootTaskId ?? task.taskId ?? '').trim() || undefined,
      meshyParentTaskId: String(existingSettings.parentTaskId ?? '').trim() || undefined,
      meshyCapabilities: existingSettings.capabilities ?? undefined,
      meshyTaskStatus: normalized,
      meshyProgress: Number(task.progress ?? 0),
      meshyStatusText: statusText,
      meshyThumbnailUrl: resolvedThumbnailUrl || undefined,
      meshyModelUrls: modelUrls,
      meshyErrorMessage: errorMessage,
      meshyOutputSummary: {
        outputKind: isImageTarget ? 'image' : '3d-model',
        preferredUrl: (isImageTarget ? preferredImageUrl || preferredModelUrl : preferredModelUrl) || undefined,
        imageUrls: isImageTarget ? imageUrls.slice(0, 4) : undefined,
        thumbnailUrl: resolvedThumbnailUrl || undefined,
        format: isImageTarget ? undefined : format,
      },
      meshyRelationSummary: {
        ...(existingSettings.relationSummary ?? {}),
        relationKind: String(existingSettings.relationKind ?? 'model').trim() || 'model',
        rootTaskId: String(existingSettings.rootTaskId ?? task.taskId ?? '').trim() || undefined,
        parentTaskId: String(existingSettings.parentTaskId ?? '').trim() || undefined,
        effectiveTaskId: String(task.taskId ?? '').trim() || undefined,
        effectiveRelationKind: String(existingSettings.relationKind ?? 'model').trim() || 'model',
        effectiveStatus: normalized,
        effectiveProgress: Number(task.progress ?? 0),
        effectivePreferredModelUrl: preferredModelUrl || undefined,
        effectivePreferredImageUrl: preferredImageUrl || undefined,
        effectiveLocalAssetUrl: String(existingSettings.outputAssetUrl ?? '').trim() || undefined,
        effectiveLocalAssetPath: String(existingSettings.outputAssetPath ?? '').trim() || undefined,
        effectiveThumbnailUrl: resolvedThumbnailUrl || undefined,
      },
    }

    if (normalized === 'succeeded') {
      if (isImageTarget) {
        const imageSource = preferredImageUrl || preferredModelUrl
        if (imageSource) {
          const ext = options.fileExtensionFromUrl(imageSource, '.png')
          const fileName = `meshy_${String(task.taskId ?? '').trim() || nodeId}${ext}`
          const persisted = await options.persistExternalAssetToProject({
            kind: 'image',
            name: fileName,
            sourceUrl: imageSource,
            sourcePath: String((task as any).sourceImageUrl ?? task.sourceModelUrl ?? '').trim() || undefined,
          })
          const assetUrl = String(persisted?.url || imageSource)
          const assetPath = String(persisted?.absolutePath || '').trim() || undefined
          const projectRelativePath = String(persisted?.projectRelativePath || '').trim() || undefined
          
          patch.meshyOutputAssetUrl = assetUrl
          patch.meshyOutputAssetPath = assetPath
          patch.meshyOutputSummary = {
            ...(patch.meshyOutputSummary ?? {}),
            outputKind: 'image',
            preferredUrl: imageSource,
            imageUrls: imageUrls.length ? imageUrls.slice(0, 4) : [imageSource],
            assetUrl,
            assetPath,
            thumbnailUrl: thumbnailUrl || undefined,
            format: undefined,
          }
          patch.meshyRelationSummary = {
            ...(patch.meshyRelationSummary ?? {}),
            effectivePreferredImageUrl: imageSource,
            effectiveLocalAssetUrl: assetUrl,
            effectiveLocalAssetPath: assetPath,
          }

          // 如果是图片节点，直接将生成的图片绑定为节点资源
          if (node?.type === 'image' && assetUrl) {
            const resourceId = `meshy-img-${task.taskId || nodeId}-${Date.now()}`
            const resourceName = `meshy_image_${resourceId.slice(-8)}`
            
            const resourceBase: Record<string, any> = {
              id: resourceId,
              kind: 'image',
              name: resourceName,
              url: assetUrl,
              sourcePath: assetPath,
              projectRelativePath,
              createdAt: Date.now(),
            }
            
            // 先检查是否已存在相同的资源
            const existingResource = options.store.state.resources.find(r => r.id === resourceId)
            if (existingResource) {
              console.log('[Meshy Runtime] 资源已存在，跳过添加:', resourceId)
            } else {
              options.store.commit('addResource', resourceBase)
              console.log('[Meshy Runtime] 资源已添加:', resourceBase)
            }
            
            // 检查节点当前绑定的资源
            const currentNodeResourceId = options.store.state.nodesById[nodeId]?.resourceId
            console.log('[Meshy Runtime] 节点当前resourceId:', currentNodeResourceId, '新resourceId:', resourceId)
            
            options.store.commit('setNodeResource', { nodeId, resourceId })
            
            // 验证绑定结果
            const updatedNode = options.store.state.nodesById[nodeId]
            console.log('[Meshy Runtime] 绑定后节点resourceId:', updatedNode?.resourceId)
            console.log('[Meshy Runtime] 图片资源已绑定到节点:', { nodeId, resourceId, assetUrl })
          }
        }
      } else if (preferredModelUrl) {
        const fileName = `meshy_${String(task.taskId ?? '').trim() || nodeId}.${format}`
        const persisted = await options.persistExternalAssetToProject({
          kind: 'file',
          name: fileName,
          sourceUrl: preferredModelUrl,
          sourcePath: String(task.sourceModelUrl ?? '').trim() || undefined,
        })
        patch.meshyOutputAssetUrl = String(persisted?.url || preferredModelUrl)
        patch.meshyOutputAssetPath = String(persisted?.absolutePath || '').trim() || undefined

        if (!resolvedThumbnailUrl && thumbnailUrl) {
          try {
            const thumbName = `meshy_${String(task.taskId ?? '').trim() || nodeId}_preview${options.fileExtensionFromUrl(thumbnailUrl, '.png')}`
            const persistedThumb = await options.persistExternalAssetToProject({
              kind: 'image',
              name: thumbName,
              sourceUrl: thumbnailUrl,
            })
            const localThumb = String(persistedThumb?.url || '').trim()
            if (localThumb) {
              resolvedThumbnailUrl = localThumb
            }
          } catch {
            // Ignore thumbnail persistence errors; do not fall back to remote thumbnail request.
          }
        }

        patch.meshyOutputSummary = {
          ...(patch.meshyOutputSummary ?? {}),
          outputKind: '3d-model',
          preferredUrl: preferredModelUrl,
          imageUrls: undefined,
          assetUrl: String(persisted?.url || preferredModelUrl),
          assetPath: String(persisted?.absolutePath || '').trim() || undefined,
          thumbnailUrl: resolvedThumbnailUrl || undefined,
          format,
        }
        patch.meshyRelationSummary = {
          ...(patch.meshyRelationSummary ?? {}),
          effectiveLocalAssetUrl: String(persisted?.url || preferredModelUrl),
          effectiveLocalAssetPath: String(persisted?.absolutePath || '').trim() || undefined,
          effectiveThumbnailUrl: resolvedThumbnailUrl || undefined,
        }
        patch.meshyThumbnailUrl = resolvedThumbnailUrl || undefined
      }
    }

    // 根据节点类型分发到正确的 store commit
    const targetNode = options.store.state.nodesById[nodeId]
    if (targetNode?.type === 'image') {
      // 图片节点：写入 imageSettings.meshyImageSettings，字段名不带 meshy 前缀
      const imagePatch = {
        taskId: patch.meshyTaskId,
        taskStatus: normalized,
        taskFamily: String(task.mode ?? '').includes('image') ? 'text-to-image' : 'text-to-3d',
        progress: patch.meshyProgress,
        statusText: patch.meshyStatusText,
        errorMessage: patch.meshyErrorMessage,
        outputAssetUrl: patch.meshyOutputAssetUrl,
        outputAssetPath: patch.meshyOutputAssetPath,
        outputSummary: {
          preferredUrl: patch.meshyOutputSummary?.preferredUrl,
          imageUrls: patch.meshyOutputSummary?.imageUrls,
          assetUrl: patch.meshyOutputSummary?.assetUrl,
          assetPath: patch.meshyOutputSummary?.assetPath,
          thumbnailUrl: patch.meshyOutputSummary?.thumbnailUrl,
        },
        thumbnailUrl: resolvedThumbnailUrl || undefined,
      }
      options.store.commit('setNodeImageSettings', { nodeId, imageSettings: { meshyImageSettings: imagePatch } })
    } else if (targetNode?.type === 'model3d') {
      // 3D模型节点：写入 model3dSettings.meshyModelSettings
      const model3dPatch = {
        taskId: patch.meshyTaskId,
        taskStatus: normalized,
        progress: patch.meshyProgress,
        statusText: patch.meshyStatusText,
        errorMessage: patch.meshyErrorMessage,
        outputSummary: patch.meshyOutputSummary,
      }
      options.store.commit('setNodeModel3DSettings', { nodeId, model3dSettings: { meshyModelSettings: model3dPatch } })
    } else {
      // Meshy 节点：保持原有逻辑
      options.store.commit('setNodeMeshySettings', { nodeId, meshySettings: patch })
    }
    if (options.shouldRefreshMeshyTaskItems()) {
      void options.refreshMeshyTaskItems({ silent: true })
    }
    if (normalized === 'succeeded') {
      if (isImageTarget && (preferredImageUrl || preferredModelUrl || String(patch.meshyOutputAssetUrl ?? '').trim())) {
        await options.syncConnectedImageTargetsFromMeshy(nodeId)
      } else if (!isImageTarget && (preferredModelUrl || String(patch.meshyOutputAssetUrl ?? '').trim())) {
        await options.syncConnectedModel3DTargets(nodeId)
      }
    }
    return normalized
  }

  const startMeshyPoll = (nodeId: string, taskId: string, mode: string) => {
    stopMeshyPoll(nodeId)
    meshyTerminalNotified.delete(nodeId)
    meshyPollErrorCounts.delete(nodeId)

    // 根据节点类型读取 meshy 任务状态的辅助函数
    const getNodeMeshyTaskStatus = (node: any): string => {
      if (!node) return 'idle'
      if (node.type === 'image') return String(node.imageSettings?.meshyImageSettings?.taskStatus ?? 'idle').trim()
      if (node.type === 'model3d') return String(node.model3dSettings?.meshyModelSettings?.taskStatus ?? 'idle').trim()
      return String(node.meshySettings?.meshyTaskStatus ?? 'idle').trim()
    }

    // 根据节点类型写入失败状态的辅助函数
    const commitMeshyTaskFailed = (nid: string, node: any, msg: string) => {
      const patch: Record<string, any> = {
        taskStatus: 'failed',
        statusText: msg,
        errorMessage: '',
      }
      if (node?.type === 'image') {
        options.store.commit('setNodeImageSettings', { nodeId: nid, imageSettings: { meshyImageSettings: patch } })
      } else if (node?.type === 'model3d') {
        options.store.commit('setNodeModel3DSettings', { nodeId: nid, model3dSettings: { meshyModelSettings: patch } })
      } else {
        options.store.commit('setNodeMeshySettings', { nodeId: nid, meshySettings: { meshyTaskStatus: 'failed', meshyStatusText: msg, meshyErrorMessage: '' } })
      }
    }

    const tick = async () => {
      const node = options.store.state.nodesById[nodeId]
      if (!node) {
        stopMeshyPoll(nodeId)
        return
      }
      // 支持所有可发起 meshy 任务的节点类型（image / model3d / meshy）
      const currentStatus = getNodeMeshyTaskStatus(node)
      if (currentStatus === 'succeeded' || currentStatus === 'failed' || currentStatus === 'canceled') {
        stopMeshyPoll(nodeId)
        return
      }

      try {
        const res = await options.getComfyService().meshyTask(taskId, mode)
        if (!res.ok) {
          const nextCount = Number(meshyPollErrorCounts.get(nodeId) ?? 0) + 1
          meshyPollErrorCounts.set(nodeId, nextCount)
          if (nextCount >= 4) {
            stopMeshyPoll(nodeId)
            commitMeshyTaskFailed(nodeId, node, 'Meshy 状态连续获取失败')
            options.pushToast('Meshy 状态连续获取失败，请稍后重试。', 'warn')
          }
          return
        }

        meshyPollErrorCounts.delete(nodeId)
        const finalStatus = await applyMeshyTaskResult(nodeId, res as any)
        if (finalStatus === 'succeeded' || finalStatus === 'failed' || finalStatus === 'canceled') {
          if (!meshyTerminalNotified.has(nodeId)) {
            meshyTerminalNotified.add(nodeId)
            const finalTarget =
              String(mode).includes('image') ? 'image' : '3d'
            if (finalStatus === 'succeeded') {
              options.pushToast(finalTarget === 'image' ? 'Meshy 图片任务完成。' : 'Meshy 3D 模型生成完成。', 'info')
            } else if (finalStatus === 'failed') {
              options.pushToast(finalTarget === 'image' ? 'Meshy 图片任务失败。' : 'Meshy 3D 模型生成失败。', 'warn')
            } else {
              options.pushToast('Meshy 任务已取消。', 'warn')
            }
          }
          stopMeshyPoll(nodeId)
        }
      } catch (err: any) {
        const nextCount = Number(meshyPollErrorCounts.get(nodeId) ?? 0) + 1
        meshyPollErrorCounts.set(nodeId, nextCount)
        if (nextCount >= 4) {
          stopMeshyPoll(nodeId)
          commitMeshyTaskFailed(nodeId, node, 'Meshy 状态获取异常')
          options.pushToast('Meshy 状态获取异常，已停止轮询。', 'warn')
        }
      }
    }

    void tick()
    const timer = window.setInterval(() => void tick(), 1600)
    meshyPollTimers.set(nodeId, timer)
  }

  const clearMeshyRuntime = () => {
    for (const timer of meshyPollTimers.values()) window.clearInterval(timer)
    meshyPollTimers.clear()
    meshyPollErrorCounts.clear()
    meshyTerminalNotified.clear()
  }

  return {
    stopMeshyPoll,
    applyMeshyTaskResult,
    startMeshyPoll,
    clearMeshyRuntime,
  }
}
