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
  }) => Promise<{ url: string; absolutePath: string } | null>
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
    const target =
      String(node?.meshySettings?.meshyTaskTarget ?? '').trim() ||
      (String(task.mode ?? '').includes('image') ? 'image' : '3d')
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
      node?.meshySettings?.meshyRelationSummary?.effectiveThumbnailUrl,
      node?.meshySettings?.meshyOutputSummary?.thumbnailUrl,
      node?.meshySettings?.meshyThumbnailUrl,
    )
    let resolvedThumbnailUrl = isImageTarget
      ? (thumbnailUrl || existingLocalThumbnailUrl)
      : existingLocalThumbnailUrl

    const patch: Record<string, any> = {
      meshyTaskId: String(task.taskId ?? '').trim(),
      meshyRelationKind:
        String(options.store.state.nodesById[nodeId]?.meshySettings?.meshyRelationKind ?? 'model').trim() ||
        'model',
      meshyRootTaskId:
        String(options.store.state.nodesById[nodeId]?.meshySettings?.meshyRootTaskId ?? task.taskId ?? '').trim() ||
        undefined,
      meshyParentTaskId:
        String(options.store.state.nodesById[nodeId]?.meshySettings?.meshyParentTaskId ?? '').trim() ||
        undefined,
      meshyCapabilities: options.store.state.nodesById[nodeId]?.meshySettings?.meshyCapabilities ?? undefined,
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
        ...(options.store.state.nodesById[nodeId]?.meshySettings?.meshyRelationSummary ?? {}),
        relationKind:
          String(options.store.state.nodesById[nodeId]?.meshySettings?.meshyRelationKind ?? 'model').trim() ||
          'model',
        rootTaskId:
          String(options.store.state.nodesById[nodeId]?.meshySettings?.meshyRootTaskId ?? task.taskId ?? '').trim() ||
          undefined,
        parentTaskId:
          String(options.store.state.nodesById[nodeId]?.meshySettings?.meshyParentTaskId ?? '').trim() ||
          undefined,
        effectiveTaskId: String(task.taskId ?? '').trim() || undefined,
        effectiveRelationKind:
          String(options.store.state.nodesById[nodeId]?.meshySettings?.meshyRelationKind ?? 'model').trim() ||
          'model',
        effectiveStatus: normalized,
        effectiveProgress: Number(task.progress ?? 0),
        effectivePreferredModelUrl: preferredModelUrl || undefined,
        effectivePreferredImageUrl: preferredImageUrl || undefined,
        effectiveLocalAssetUrl:
          String(options.store.state.nodesById[nodeId]?.meshySettings?.meshyOutputAssetUrl ?? '').trim() ||
          undefined,
        effectiveLocalAssetPath:
          String(options.store.state.nodesById[nodeId]?.meshySettings?.meshyOutputAssetPath ?? '').trim() ||
          undefined,
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
          patch.meshyOutputAssetUrl = String(persisted?.url || imageSource)
          patch.meshyOutputAssetPath = String(persisted?.absolutePath || '').trim() || undefined
          patch.meshyOutputSummary = {
            ...(patch.meshyOutputSummary ?? {}),
            outputKind: 'image',
            preferredUrl: imageSource,
            imageUrls: imageUrls.length ? imageUrls.slice(0, 4) : [imageSource],
            assetUrl: String(persisted?.url || imageSource),
            assetPath: String(persisted?.absolutePath || '').trim() || undefined,
            thumbnailUrl: thumbnailUrl || undefined,
            format: undefined,
          }
          patch.meshyRelationSummary = {
            ...(patch.meshyRelationSummary ?? {}),
            effectivePreferredImageUrl: imageSource,
            effectiveLocalAssetUrl: String(persisted?.url || imageSource),
            effectiveLocalAssetPath: String(persisted?.absolutePath || '').trim() || undefined,
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

    options.store.commit('setNodeMeshySettings', { nodeId, meshySettings: patch })
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

    const tick = async () => {
      const node = options.store.state.nodesById[nodeId]
      if (!node || node.type !== 'meshy') {
        stopMeshyPoll(nodeId)
        return
      }
      const currentStatus = String(node.meshySettings?.meshyTaskStatus ?? 'idle')
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
            options.store.commit('setNodeMeshySettings', {
              nodeId,
              meshySettings: {
                meshyTaskStatus: 'failed',
                meshyStatusText: 'Meshy 状态连续获取失败',
                meshyErrorMessage: String(res.error ?? 'unknown'),
              },
            })
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
              String(node.meshySettings?.meshyTaskTarget ?? '').trim() ||
              (String(mode).includes('image') ? 'image' : '3d')
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
          options.store.commit('setNodeMeshySettings', {
            nodeId,
            meshySettings: {
              meshyTaskStatus: 'failed',
              meshyStatusText: 'Meshy 状态获取异常',
              meshyErrorMessage: String(err?.message ?? err ?? 'unknown'),
            },
          })
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
