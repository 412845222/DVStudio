import type { WorkflowState } from '../../../../aiworkflow/persistence/workflowState'
import type { AIWorkflowDraftSnapshot } from '../../../../aiworkflow/persistence/blueprintSnapshot'

type UseAIWorkflowProjectSnapshotBuilderOptions = {
  store: {
    state: WorkflowState
    commit: (type: string, payload: any) => void
  }
  currentProjectId: { value: number | null }
  resolveBackendUrl: (value: string) => string
  uploadLocalResourceAndGetUrl: (
    url: string,
    kind: 'image' | 'video' | 'file',
    name: string,
    opts?: { projectId?: number | null },
  ) => Promise<{ url: string; absolutePath: string; projectRelativePath?: string }>
  toProjectAssetRuntimeUrl?: (projectId: number, projectRelativePath: string, fallbackUrl?: string) => string
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}

export const useAIWorkflowProjectSnapshotBuilder = (payload: UseAIWorkflowProjectSnapshotBuilderOptions) => {
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
      const localFileKey = typeof (resource as any).localFileKey === 'string' ? 
String((resource as any).localFileKey).trim() : ''

      // Skip resources that have projectRelativePath but no sourcePath and no valid URL
      // This handles the case where the file was deleted or never existed on disk
      if (projectRelativePath && !sourcePath && !localFileKey) {
        const hasValidUrl = rawUrl && (rawUrl.toLowerCase().startsWith('dweb://project-assets') || 
rawUrl.toLowerCase().startsWith('http://') || rawUrl.toLowerCase().startsWith('https://'))
        if (!hasValidUrl) {
          omittedResourceIds.add(rid)
          continue
        }
      }

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

      if (!isLocal && backendProjectRelativePath && !rawUrl.toLowerCase().startsWith('dweb://project-assets')) {
        persistUrl = projectAssetRuntimeUrl(backendProjectRelativePath, persistUrl)
      }

      if (uploadLocal && isLocal) {
        if (backendProjectRelativePath) {
          persistUrl = projectAssetRuntimeUrl(backendProjectRelativePath, '')   
        } else {
          try {
            const uploaded = await payload.uploadLocalResourceAndGetUrl(rawUrl, 
kind, String((resource as any).name || kind), {
              projectId: payload.currentProjectId.value,
            })
            persistUrl = uploaded.url
            backendAbsolutePath = uploaded.absolutePath
            backendProjectRelativePath = String(uploaded.projectRelativePath || 
'').trim() || backendProjectRelativePath
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
        const resourceId = String((node as any).resourceId ?? '').trim()
        if (resourceId && omittedResourceIds.has(resourceId)) {
          next[id] = { ...(node as any), resourceId: undefined }
        } else {
          next[id] = node
        }
      }
      nodesById = next
    }

    return {
      nodesById,
      nodeOrder: payload.store.state.nodeOrder,
      resourcesById,
      resourceOrder,
      meta: {
        ...((payload.store.state.meta as any) || {}),
        resourceOmissions: omittedResourceIds.size > 0 ? Array.from(omittedResourceIds) : undefined,
      },
    } as AIWorkflowDraftSnapshot
  }

  return {
    buildPersistableSnapshotWithOptions,
  }
}
