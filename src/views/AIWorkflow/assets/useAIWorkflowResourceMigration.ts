import type { WorkflowSceneLayoutManualModelBinding } from '../../../aiworkflow/types'
import type { BlueprintAssetKind } from '../../../network/BlueprintProjectService'

type ImportAssetIntoProjectScopePayload = {
  kind: BlueprintAssetKind
  name: string
  projectId: number
  sourcePath?: string
  sourceUrl?: string
  bucket?: 'assets' | 'thumbnails'
}

type DeleteAssetPayload = {
  projectId: number | null
  resourceId?: string
  url?: string
  sourcePath?: string
  relativePath?: string
}

type UseAIWorkflowResourceMigrationOptions = {
  store: {
    state: {
      resourceOrder: string[]
      resourcesById: Record<string, any>
      nodeOrder: string[]
      nodesById: Record<string, any>
    }
    commit: (type: string, payload: any) => void
  }
  resolveBackendUrl: (value: string) => string
  normalizeSourcePathKey: (raw: unknown) => string
  isDjangoManagedResource: (resource: any) => boolean
  importAssetIntoProjectScope: (payload: ImportAssetIntoProjectScopePayload) => Promise<any>
  deleteAsset: (payload: DeleteAssetPayload) => Promise<{ ok: boolean; error?: unknown }>
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
}

export const useAIWorkflowResourceMigration = (
  options: UseAIWorkflowResourceMigrationOptions
) => {
  const mediaRelativePathFromUrl = (rawUrl: string) => {
    const v = String(rawUrl || '').trim()
    if (!v) return ''
    try {
      const u = new URL(v, window.location.origin)
      const m = u.pathname.match(/\/media\/(.+)$/)
      if (!m) return ''
      return decodeURIComponent(String(m[1] || '').trim())
    } catch {
      const m = v.match(/\/media\/(.+)$/)
      return m ? decodeURIComponent(String(m[1] || '').trim()) : ''
    }
  }

  const isProjectScopedMediaRef = (
    projectId: number,
    input: { url?: unknown; sourcePath?: unknown }
  ) => {
    const pid = Number(projectId)
    if (!Number.isFinite(pid) || pid <= 0) return false
    const marker = `/blueprint_projects/${Math.floor(pid)}/`

    const sourcePathKey = options.normalizeSourcePathKey(input?.sourcePath)
    if (sourcePathKey && sourcePathKey.includes(marker)) return true

    const url = String(input?.url ?? '').trim()
    if (!url) return false
    try {
      const u = new URL(url, window.location.origin)
      return `${u.pathname}${u.search}`.toLowerCase().includes(marker)
    } catch {
      return url.toLowerCase().includes(marker)
    }
  }

  const isTemporaryThumbnailRef = (input: { url?: unknown; sourcePath?: unknown }) => {
    const marker = '/aiworkflow_projects/thumbnails/'
    const sourcePathKey = options.normalizeSourcePathKey(input?.sourcePath)
    if (sourcePathKey && sourcePathKey.includes(marker)) return true

    const url = String(input?.url ?? '').trim()
    if (!url) return false
    try {
      const u = new URL(url, window.location.origin)
      return `${u.pathname}${u.search}`.toLowerCase().includes(marker)
    } catch {
      return url.toLowerCase().includes(marker)
    }
  }

  const makePosterMigrationFileName = (resourceName: string, resourceId: string) => {
    const base = String(resourceName || '').trim().replace(/[\\/:*?"<>|]+/g, '_')
    const noExt = base.replace(/\.[^.]+$/, '')
    const stem = (noExt || `resource_${resourceId}`).slice(0, 80)
    return `poster_${stem}.jpg`
  }

  const migrateCurrentResourcesToProjectScope = async (
    projectId: number,
    opts?: { silent?: boolean }
  ): Promise<{ changed: number; failed: number }> => {
    const pid = Number(projectId)
    if (!Number.isFinite(pid) || pid <= 0) return { changed: 0, failed: 0 }

    let changed = 0
    let failed = 0

    const migrateModelAssetRef = async (payload: {
      sourcePath?: string
      sourceUrl?: string
      currentUrl?: string
      name: string
      projectId: number
    }) => {
      const sourcePath = String(payload.sourcePath || '').trim()
      const sourceUrl = String(payload.sourceUrl || '').trim()
      const currentUrl = String(payload.currentUrl || '').trim()
      const ref = { url: currentUrl, sourcePath }
      const needsMigration =
        !isProjectScopedMediaRef(payload.projectId, ref) &&
        (Boolean(sourcePath)
          || currentUrl.startsWith('blob:')
          || currentUrl.startsWith('data:')
          || options.isDjangoManagedResource(ref))
      if (!needsMigration) return null
      return options.importAssetIntoProjectScope({
        kind: 'file',
        name: payload.name,
        projectId: payload.projectId,
        sourcePath: sourcePath || undefined,
        sourceUrl: sourceUrl || undefined,
        bucket: 'assets',
      })
    }

    const ids = options.store.state.resourceOrder.slice()
    for (const rid of ids) {
      const r = options.store.state.resourcesById?.[rid] as any
      if (!r) continue
      const kind = (String(r.kind || '').toLowerCase() === 'video' ? 'video' : 'image') as 'image' | 'video'
      const name = String(r.name || `${kind}_${rid}`).trim() || `${kind}_${rid}`

      const rawUrl = String(r?.url || '').trim()
      const rawSourcePath = String(r?.sourcePath || '').trim()
      const mediaRef = { url: rawUrl, sourcePath: rawSourcePath }
      const mediaIsProjectScoped = isProjectScopedMediaRef(pid, mediaRef)
      const urlLooksLocal = rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')
      const sourceUrlForImport = rawUrl && !rawUrl.startsWith('file:') ? rawUrl : ''
      const mediaNeedsMigration =
        !mediaIsProjectScoped
        && (Boolean(rawSourcePath) || urlLooksLocal || options.isDjangoManagedResource(mediaRef))
      if (mediaNeedsMigration) {
        const imported = await options.importAssetIntoProjectScope({
          kind,
          name,
          projectId: pid,
          sourcePath: rawSourcePath || undefined,
          sourceUrl: sourceUrlForImport || undefined,
          bucket: 'assets',
        })

        if (!imported) {
          failed += 1
        } else {
          const nextUrl = options.resolveBackendUrl(String((imported as any).url || ''))
          const nextSourcePath = String((imported as any).sourcePath || (imported as any).absolutePath || '').trim()
          if (nextUrl || nextSourcePath) {
            options.store.commit('patchResource', {
              resourceId: rid,
              patch: {
                url: nextUrl || rawUrl,
                sourcePath: nextSourcePath || rawSourcePath || undefined,
                localFileKey: undefined,
              } as any,
            })

            if (options.isDjangoManagedResource(mediaRef) && (rawUrl || rawSourcePath)) {
              await options.deleteAsset({
                projectId: pid,
                url: rawUrl || undefined,
                sourcePath: rawSourcePath || undefined,
                relativePath: mediaRelativePathFromUrl(rawUrl) || undefined,
              })
            }

            changed += 1
          } else {
            failed += 1
          }
        }
      }

      const latest = options.store.state.resourcesById?.[rid] as any
      const posterUrl = String((latest as any)?.posterUrl || '').trim()
      const posterSourcePath = String((latest as any)?.posterSourcePath || '').trim()
      if (!(posterUrl || posterSourcePath)) continue

      const posterRef = { url: posterUrl, sourcePath: posterSourcePath }
      const posterRefDjangoManaged = options.isDjangoManagedResource(posterRef)
      const posterIsTemporary = isTemporaryThumbnailRef(posterRef)
      const posterNeedsMigration =
        posterIsTemporary
        && !isProjectScopedMediaRef(pid, posterRef)
        && Boolean(posterSourcePath || posterRefDjangoManaged)
      if (!posterNeedsMigration) continue

      const importedPoster = await options.importAssetIntoProjectScope({
        kind: 'image',
        name: makePosterMigrationFileName(name, rid),
        projectId: pid,
        sourcePath: posterSourcePath || undefined,
        sourceUrl: posterUrl || undefined,
        bucket: 'thumbnails',
      })

      if (!importedPoster) {
        failed += 1
        continue
      }

      const nextPosterUrl = options.resolveBackendUrl(String((importedPoster as any).url || ''))
      const nextPosterSourcePath = String((importedPoster as any).sourcePath || (importedPoster as any).absolutePath || '').trim()
      if (!nextPosterUrl && !nextPosterSourcePath) {
        failed += 1
        continue
      }

      options.store.commit('patchResource', {
        resourceId: rid,
        patch: {
          posterUrl: nextPosterUrl || posterUrl,
          posterSourcePath: nextPosterSourcePath || posterSourcePath || undefined,
        } as any,
      })

      if (posterRefDjangoManaged && (posterUrl || posterSourcePath)) {
        await options.deleteAsset({
          projectId: pid,
          url: posterUrl || undefined,
          sourcePath: posterSourcePath || undefined,
          relativePath: mediaRelativePathFromUrl(posterUrl) || undefined,
        })
      }

      changed += 1
    }

    for (const nodeId of options.store.state.nodeOrder.slice()) {
      const node = options.store.state.nodesById?.[nodeId] as any
      if (!node) continue

      if (node.type === 'model3d') {
        const settings = node.model3dSettings ?? {}
        const currentUrl = String(settings.modelAssetUrl ?? settings.modelUrl ?? '').trim()
        const sourcePath = String(settings.modelAssetPath ?? settings.modelSourcePath ?? '').trim()
        const sourceUrl = currentUrl && !currentUrl.startsWith('file:') ? currentUrl : ''
        const name = String(settings.modelSourceName || `model_${nodeId}.${settings.modelFormat === 'gltf' ? 'gltf' : 'glb'}`).trim()
        const imported = await migrateModelAssetRef({ sourcePath, sourceUrl, currentUrl, name, projectId: pid })
        if (!imported) continue
        const nextUrl = options.resolveBackendUrl(String((imported as any).url || ''))
        const nextSourcePath = String((imported as any).sourcePath || (imported as any).absolutePath || '').trim()
        if (!nextUrl && !nextSourcePath) {
          failed += 1
          continue
        }
        options.store.commit('setNodeModel3DSettings', {
          nodeId,
          model3dSettings: {
            ...(settings as any),
            modelUrl: nextUrl || currentUrl,
            modelAssetUrl: nextUrl || currentUrl,
            modelSourcePath: nextSourcePath || sourcePath || undefined,
            modelAssetPath: nextSourcePath || sourcePath || undefined,
          },
        })
        changed += 1
        continue
      }

      if (node.type !== 'scene-layout') continue
      const settings = node.sceneLayoutSettings ?? {}
      const manualBindings = Array.isArray(settings.manualModelBindings) ? settings.manualModelBindings : []
      if (!manualBindings.length) continue

      let bindingChanged = false
      let bindingFailed = false
      const nextBindings = [] as WorkflowSceneLayoutManualModelBinding[]
      for (const binding of manualBindings) {
        const currentUrl = String((binding as any).modelAssetUrl ?? binding?.modelUrl ?? '').trim()
        const sourcePath = String((binding as any).modelAssetPath ?? binding?.modelSourcePath ?? '').trim()
        const sourceUrl = currentUrl && !currentUrl.startsWith('file:') ? currentUrl : ''
        const name = String(binding?.modelSourceName || `scene_layout_${nodeId}_${String(binding?.objectId || 'object').trim()}.${binding?.modelFormat === 'gltf' ? 'gltf' : 'glb'}`).trim()
        const imported = await migrateModelAssetRef({ sourcePath, sourceUrl, currentUrl, name, projectId: pid })
        if (!imported) {
          nextBindings.push(binding)
          continue
        }
        const nextUrl = options.resolveBackendUrl(String((imported as any).url || ''))
        const nextSourcePath = String((imported as any).sourcePath || (imported as any).absolutePath || '').trim()
        if (!nextUrl && !nextSourcePath) {
          bindingFailed = true
          nextBindings.push(binding)
          continue
        }
        bindingChanged = true
        nextBindings.push({
          ...binding,
          modelUrl: nextUrl || currentUrl,
          modelAssetUrl: nextUrl || currentUrl,
          modelSourcePath: nextSourcePath || sourcePath || undefined,
          modelAssetPath: nextSourcePath || sourcePath || undefined,
        })
      }

      if (bindingFailed) failed += 1
      if (!bindingChanged) continue
      options.store.commit('setNodeSceneLayoutSettings', {
        nodeId,
        sceneLayoutSettings: {
          ...(settings as any),
          manualModelBindings: nextBindings,
        },
      })
      changed += 1
    }

    if (!opts?.silent && changed > 0) {
      options.pushToast(`已迁移 ${changed} 条资源到项目专属目录。`, 'info')
    }
    if (!opts?.silent && failed > 0) {
      options.pushToast(`有 ${failed} 条资源迁移失败，已保留原路径。`, 'warn')
    }
    return { changed, failed }
  }

  return {
    mediaRelativePathFromUrl,
    migrateCurrentResourcesToProjectScope,
  }
}
