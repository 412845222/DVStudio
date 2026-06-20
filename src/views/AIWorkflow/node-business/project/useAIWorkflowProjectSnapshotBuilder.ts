import type { Ref } from 'vue'
import type { AIWorkflowDraftSnapshot } from '../../../../aiworkflow/persistence/blueprintSnapshot'
import type { WorkflowSceneLayoutManualModelBinding, WorkflowState } from '../../../../aiworkflow/types'

export const useAIWorkflowProjectSnapshotBuilder = (payload: {
  store: {
    state: {
      viewport: WorkflowState['viewport']
      nodesById: WorkflowState['nodesById']
      nodeOrder: WorkflowState['nodeOrder']
      edgesById: WorkflowState['edgesById']
      edgeOrder: WorkflowState['edgeOrder']
      resourcesById: WorkflowState['resourcesById']
      resourceOrder: WorkflowState['resourceOrder']
      selectedNodeId: WorkflowState['selectedNodeId']
      selectedNodeIds: WorkflowState['selectedNodeIds']
    }
  }
  currentProjectId: Ref<number | null>
  resolveBackendUrl: (value: string) => string
  uploadLocalResourceAndGetUrl: (
    localUrl: string,
    kind: 'image' | 'video' | 'file',
    resourceName: string,
    opts?: { projectId?: number | null },
  ) => Promise<{ url: string; absolutePath: string; projectRelativePath?: string }>
  toProjectAssetRuntimeUrl?: (projectId: number, projectRelativePath: string, fallbackUrl?: string) => string
  persistExternalAssetToProject: (payload: {
    kind: 'image' | 'file'
    name: string
    sourceUrl?: string
    sourcePath?: string
  }) => Promise<{ url: string; absolutePath: string; projectRelativePath?: string } | null>
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
  stripUnrealExportRuntimeFromNodes: (nodesById: WorkflowState['nodesById']) => WorkflowState['nodesById']
}) => {
  const buildDraftSnapshot = (): AIWorkflowDraftSnapshot => {
    // NOTE: 本地上传的图片/视频会生成 blob: URL，刷新后无法复用；这里不跨刷新保存这类资源。
    const resourcesById: WorkflowState['resourcesById'] = {}
    const resourceOrder: string[] = []
    for (const rid of payload.store.state.resourceOrder) {
      const resource = payload.store.state.resourcesById[rid]
      if (!resource) continue
      const url = typeof (resource as any).url === 'string' ? String((resource as any).url) : ''
      if (url.startsWith('blob:')) continue
      resourcesById[rid] = { ...(resource as any), url } as any
      resourceOrder.push(rid)
    }

    return {
      schemaVersion: 1,
      savedAt: Date.now(),
      viewport: payload.store.state.viewport,
      nodesById: payload.store.state.nodesById,
      nodeOrder: payload.store.state.nodeOrder,
      edgesById: payload.store.state.edgesById,
      edgeOrder: payload.store.state.edgeOrder,
      resourcesById,
      resourceOrder,
      selectedNodeId: payload.store.state.selectedNodeId,
      selectedNodeIds: payload.store.state.selectedNodeIds,
    }
  }

  const buildPersistableSnapshotWithOptions = async (opts?: { uploadLocalResources?: boolean }): Promise<AIWorkflowDraftSnapshot> => {
    const resourcesById: WorkflowState['resourcesById'] = {}
    const resourceOrder: string[] = []
    let uploadedCount = 0
    const uploadLocal = opts?.uploadLocalResources === true
    const omittedResourceIds = new Set<string>()

    const projectAssetRuntimeUrl = (projectRelativePath: string, fallbackUrl = '') => {
      const pid = Number(payload.currentProjectId.value || 0)
      const rel = String(projectRelativePath || '').trim()
      if (!Number.isFinite(pid) || pid <= 0 || !rel) return fallbackUrl
      return payload.toProjectAssetRuntimeUrl
        ? payload.toProjectAssetRuntimeUrl(pid, rel, fallbackUrl)
        : `dweb://project-assets?projectId=${encodeURIComponent(String(Math.floor(pid)))}&path=${encodeURIComponent(rel)}`
    }

    for (const rid of payload.store.state.resourceOrder) {
      const resource = payload.store.state.resourcesById[rid]
      if (!resource) continue
      const rawUrl = typeof (resource as any).url === 'string' ? String((resource as any).url) : ''
      const sourcePath = typeof (resource as any).sourcePath === 'string' ? String((resource as any).sourcePath).trim() : ''
      const projectRelativePath = typeof (resource as any).projectRelativePath === 'string'
        ? String((resource as any).projectRelativePath).trim()
        : ''
      const localFileKey = typeof (resource as any).localFileKey === 'string' ? String((resource as any).localFileKey).trim() : ''

      // Keep resource if it has a usable url, an absolute sourcePath, a project asset path, or an IndexedDB handle.
      if (!rawUrl && !sourcePath && !projectRelativePath && !localFileKey) continue

      const isLocal = rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')
      if (isLocal && !uploadLocal) {
        // Prefer persisting local resources by absolute path (backend recovery) or localFileKey (IndexedDB handle recovery).
        if (!sourcePath && !localFileKey) {
          // If we don't have an OS path, we can't recover after refresh, so keep previous lightweight behavior.
          omittedResourceIds.add(rid)
          continue
        }
      }

      let persistUrl = rawUrl ? payload.resolveBackendUrl(rawUrl) : ''
      let backendAbsolutePath = ''
      let backendProjectRelativePath = projectRelativePath
      const kind = ((resource as any).kind === 'video' ? 'video' : 'image') as 'image' | 'video'
      if (uploadLocal && isLocal) {
        if (backendProjectRelativePath) {
          persistUrl = projectAssetRuntimeUrl(backendProjectRelativePath, '')
        } else {
          try {
            const uploaded = await payload.uploadLocalResourceAndGetUrl(rawUrl, kind, String((resource as any).name || kind), {
              projectId: payload.currentProjectId.value,
            })
            persistUrl = uploaded.url
            backendAbsolutePath = uploaded.absolutePath
            backendProjectRelativePath = String(uploaded.projectRelativePath || '').trim() || backendProjectRelativePath
            uploadedCount += 1
          } catch {
            if (sourcePath || localFileKey) {
              persistUrl = ''
            } else if (rawUrl.startsWith('data:')) {
              persistUrl = rawUrl
            } else {
              omittedResourceIds.add(rid)
              continue
            }
          }
        }
      }

      // When not uploading local resources but sourcePath exists, do not persist blob/data urls.
      if (!uploadLocal && isLocal && (sourcePath || localFileKey)) {
        persistUrl = ''
      }

      resourcesById[rid] = {
        ...(resource as any),
        url: persistUrl,
        // Prefer backend absolute path when uploaded; otherwise keep existing (local) sourcePath.
        sourcePath: backendAbsolutePath || sourcePath || '',
        projectRelativePath: backendProjectRelativePath || undefined,
        localFileKey: localFileKey || undefined,
        // posterUrl is usually blob: and can't survive refresh; keep it only when we have a stable url.
        posterUrl: persistUrl ? (resource as any).posterUrl : undefined,
      } as any
      resourceOrder.push(rid)
    }

    if (uploadLocal && uploadedCount > 0) {
      payload.pushToast(`已上传 ${uploadedCount} 个本地资源到后端文件库，刷新后可恢复。`, 'info')
    }

    let nodesById: WorkflowState['nodesById'] = payload.store.state.nodesById
    if (!uploadLocal && omittedResourceIds.size) {
      const next: WorkflowState['nodesById'] = {}
      for (const id of payload.store.state.nodeOrder) {
        const node = payload.store.state.nodesById[id]
        if (!node) continue
        const rid = String((node as any).resourceId ?? '').trim()
        if (rid && omittedResourceIds.has(rid)) {
          next[id] = { ...(node as any), resourceId: null } as any
        } else {
          next[id] = node
        }
      }
      nodesById = next
    }

    if (uploadLocal) {
      const persistedNodes: WorkflowState['nodesById'] = { ...nodesById }
      for (const nodeId of payload.store.state.nodeOrder) {
        const node = persistedNodes[nodeId]
        if (!node) continue
        if (node.type === 'model3d') {
          const settings = node.model3dSettings ?? {}
          const modelUrl = String(settings.modelUrl ?? '').trim()
          const sourcePath = String(settings.modelSourcePath ?? '').trim()
          const projectRelativePath = String((settings as any).modelProjectRelativePath ?? '').trim()
          const modelName = String(settings.modelSourceName ?? '').trim() || `model_${nodeId}.${settings.modelFormat === 'gltf' ? 'gltf' : 'glb'}`
          const needsUpload = modelUrl.startsWith('blob:') || modelUrl.startsWith('data:')
          const needsImport = !needsUpload && !!sourcePath && !String(settings.modelAssetPath ?? '').trim()
          if (!needsUpload && !needsImport) continue

          try {
            const persisted = needsUpload
              ? await payload.uploadLocalResourceAndGetUrl(modelUrl, 'file', modelName, { projectId: payload.currentProjectId.value ?? undefined })
              : await payload.persistExternalAssetToProject({ kind: 'file', name: modelName, sourceUrl: modelUrl || undefined, sourcePath: sourcePath || undefined })
            if (!persisted) continue

            persistedNodes[nodeId] = {
              ...(node as any),
              model3dSettings: {
                ...(settings as any),
                modelUrl: persisted.url,
                modelSourcePath: persisted.absolutePath || sourcePath || undefined,
                modelProjectRelativePath: persisted.projectRelativePath || projectRelativePath || undefined,
                modelAssetUrl: persisted.url,
                modelAssetPath: persisted.absolutePath || undefined,
                modelAssetProjectRelativePath: persisted.projectRelativePath || projectRelativePath || undefined,
              },
            } as any
          } catch {
            // Keep existing values when persistence fails during save.
          }
          continue
        }

        if (node.type !== 'scene-layout') continue
        const settings = node.sceneLayoutSettings ?? {}
        const manualBindings = Array.isArray(settings.manualModelBindings) ? settings.manualModelBindings : []
        if (!manualBindings.length) continue

        let changed = false
        const nextBindings = [] as WorkflowSceneLayoutManualModelBinding[]
        for (const binding of manualBindings) {
          const modelUrl = String(binding?.modelUrl ?? '').trim()
          const sourcePath = String((binding as any)?.modelAssetPath ?? binding?.modelSourcePath ?? '').trim()
          const projectRelativePath = String((binding as any)?.modelAssetProjectRelativePath ?? (binding as any)?.modelProjectRelativePath ?? '').trim()
          const objectId = String(binding?.objectId ?? '').trim()
          const modelFormat = binding?.modelFormat === 'gltf' ? 'gltf' : 'glb'
          const modelName = String(binding?.modelSourceName ?? '').trim() || `scene_layout_${nodeId}_${objectId || 'object'}.${modelFormat}`
          const needsUpload = modelUrl.startsWith('blob:') || modelUrl.startsWith('data:')
          const needsImport = !needsUpload && !!sourcePath && !String((binding as any)?.modelAssetPath ?? '').trim()
          if (!needsUpload && !needsImport) {
            nextBindings.push(binding)
            continue
          }

          try {
            const persisted = needsUpload
              ? await payload.uploadLocalResourceAndGetUrl(modelUrl, 'file', modelName, { projectId: payload.currentProjectId.value ?? undefined })
              : await payload.persistExternalAssetToProject({ kind: 'file', name: modelName, sourceUrl: modelUrl || undefined, sourcePath: sourcePath || undefined })
            if (!persisted) {
              nextBindings.push(binding)
              continue
            }
            changed = true
            nextBindings.push({
              ...binding,
              modelUrl: persisted.url,
              modelAssetUrl: persisted.url,
              modelSourcePath: persisted.absolutePath || sourcePath || undefined,
              modelAssetPath: persisted.absolutePath || undefined,
              modelProjectRelativePath: persisted.projectRelativePath || projectRelativePath || undefined,
              modelAssetProjectRelativePath: persisted.projectRelativePath || projectRelativePath || undefined,
            })
          } catch {
            nextBindings.push(binding)
          }
        }

        if (!changed) continue
        persistedNodes[nodeId] = {
          ...(node as any),
          sceneLayoutSettings: {
            ...(settings as any),
            manualModelBindings: nextBindings,
          },
        } as any
      }
      nodesById = persistedNodes
    }

    nodesById = payload.stripUnrealExportRuntimeFromNodes(nodesById)

    return {
      schemaVersion: 1,
      savedAt: Date.now(),
      viewport: payload.store.state.viewport,
      nodesById,
      nodeOrder: payload.store.state.nodeOrder,
      edgesById: payload.store.state.edgesById,
      edgeOrder: payload.store.state.edgeOrder,
      resourcesById,
      resourceOrder,
      selectedNodeId: payload.store.state.selectedNodeId,
      selectedNodeIds: payload.store.state.selectedNodeIds,
    }
  }

  return {
    buildDraftSnapshot,
    buildPersistableSnapshotWithOptions,
  }
}
