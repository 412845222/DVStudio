import type { AIWorkflowDraftSnapshot } from '../../../../aiworkflow/persistence/blueprintSnapshot'
import { sanitizeWorkflowMediaUrl, sanitizeWorkflowUrlFieldsDeep } from '../../../../aiworkflow/domain/resource/safeWorkflowUrl'

export const useAIWorkflowProjectSnapshotRuntime = (payload: {
  store: {
    commit: (type: string, value: any) => void
  }
  currentProjectId: { value: number | null }
  isElectronRuntime: boolean
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}) => {
  const buildProjectAssetRuntimeUrl = (projectId: number, projectRelativePath: string, fallbackUrl?: string) => {
    const pid = Number(projectId)
    const rel = String(projectRelativePath || '').trim()
    if (payload.isElectronRuntime && Number.isFinite(pid) && pid > 0 && rel) {
      return `dweb://project-assets?projectId=${encodeURIComponent(String(Math.floor(pid)))}&path=${encodeURIComponent(rel)}`
    }
    return String(fallbackUrl || '').trim()
  }

  const sanitizeBlueprintSnapshotForRuntime = (snapshot: any): AIWorkflowDraftSnapshot => {
    let cloned: any = snapshot
    try {
      cloned = JSON.parse(JSON.stringify(snapshot))
    } catch {
      // keep original object when deep clone fails
    }

    if (!cloned || typeof cloned !== 'object') return snapshot as AIWorkflowDraftSnapshot

    const nodesById = cloned.nodesById && typeof cloned.nodesById === 'object' ? cloned.nodesById : {}
    const nodeOrder = Array.isArray(cloned.nodeOrder) ? cloned.nodeOrder : Object.keys(nodesById)
    for (const rawNodeId of nodeOrder) {
      const nodeId = String(rawNodeId ?? '').trim()
      if (!nodeId) continue
      const node = nodesById[nodeId]
      if (!node || typeof node !== 'object') continue
      const nodeType = String((node as any).type ?? '').trim().toLowerCase()

      if (nodeType === 'scene-decompose') {
        const settings = (node as any).sceneDecomposeSettings
        const outputs = Array.isArray(settings?.outputs) ? settings.outputs : []
        ;(node as any).sceneDecomposeSettings = {
          ...(settings && typeof settings === 'object' ? settings : {}),
          outputs: outputs
            .filter((item: any) => item && typeof item === 'object')
            .map((item: any, index: number) => {
              const fallbackId = `legacy-${index + 1}`
              const id = String(item.id ?? item.objectId ?? item.name ?? fallbackId).trim() || fallbackId
              return {
                ...item,
                id,
                objectId: String(item.objectId ?? id).trim() || id,
                name: String(item.name ?? item.objectName ?? `对象 ${index + 1}`).trim() || `对象 ${index + 1}`,
                imageAnchorId: String(item.imageAnchorId ?? `out-image-${id}`).trim() || `out-image-${id}`,
                textAnchorId: String(item.textAnchorId ?? `out-text-${id}`).trim() || `out-text-${id}`,
              }
            }),
        }
        continue
      }

      if (nodeType === 'scene-layout') {
        const settings = (node as any).sceneLayoutSettings
        const manualBindings = Array.isArray(settings?.manualModelBindings)
          ? settings.manualModelBindings.filter((item: any) => item && typeof item === 'object')
          : []
        const layoutItems = Array.isArray(settings?.layoutItems)
          ? settings.layoutItems.filter((item: any) => item && typeof item === 'object')
          : []
        ;(node as any).sceneLayoutSettings = {
          ...(settings && typeof settings === 'object' ? settings : {}),
          layoutItems,
          manualModelBindings: manualBindings,
        }
      }
    }

    const resourcesById = cloned.resourcesById && typeof cloned.resourcesById === 'object' ? cloned.resourcesById : {}
    const runtimeProjectId = Number(payload.currentProjectId?.value ?? 0)
    for (const [resourceId, resource] of Object.entries(resourcesById)) {
      if (!resource || typeof resource !== 'object') continue
      const projectRelativePath = String((resource as any).projectRelativePath ?? (resource as any).relativePath ?? '').trim()
      const posterProjectRelativePath = String((resource as any).posterProjectRelativePath ?? '').trim()
      const runtimeUrl = projectRelativePath
        ? buildProjectAssetRuntimeUrl(runtimeProjectId, projectRelativePath, sanitizeWorkflowMediaUrl((resource as any).url))
        : sanitizeWorkflowMediaUrl((resource as any).url)
      const runtimePosterUrl = posterProjectRelativePath
        ? buildProjectAssetRuntimeUrl(runtimeProjectId, posterProjectRelativePath, sanitizeWorkflowMediaUrl((resource as any).posterUrl))
        : sanitizeWorkflowMediaUrl((resource as any).posterUrl)
      ;(resourcesById as any)[resourceId] = {
        ...(resource as any),
        id: String((resource as any).id ?? resourceId),
        projectRelativePath: projectRelativePath || undefined,
        posterProjectRelativePath: posterProjectRelativePath || undefined,
        url: runtimeUrl,
        posterUrl: runtimePosterUrl,
      }
    }

    sanitizeWorkflowUrlFieldsDeep(cloned.nodesById)

    return cloned as AIWorkflowDraftSnapshot
  }

  const hydrateBlueprintSnapshotSafely = (snapshot: AIWorkflowDraftSnapshot, sourceLabel: string) => {
    try {
      payload.store.commit('hydrateDraft', { snapshot })
      return true
    } catch (err: any) {
      const message = String(err?.message ?? err ?? 'unknown')
      payload.pushToast(`${sourceLabel}失败：蓝图数据兼容失败（${message}）`, 'error')
      return false
    }
  }

  return {
    sanitizeBlueprintSnapshotForRuntime,
    hydrateBlueprintSnapshotSafely,
  }
}
