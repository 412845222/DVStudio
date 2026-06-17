export const useAIWorkflowResourceRecordCleanup = (payload: {
  store: {
    state: {
      resourcesById: Record<string, any>
    }
  }
  currentProjectId: { value: number | null }
  blueprintProjectService: {
    deleteAsset: (input: {
      projectId: number | null
      resourceId?: string
      url?: string
      sourcePath?: string
      relativePath?: string
    }) => Promise<{ ok: boolean; error?: unknown }>
  }
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
  isComfyForwardResource: (resource: any) => boolean
  isDjangoManagedResource: (resource: any) => boolean
  mediaRelativePathFromUrl: (rawUrl: string) => string
  removeResourceRecordOnly: (resourceId: string) => void
}) => {
  const removeResourceByPolicy = async (
    resourceId: string,
    opts?: { silent?: boolean }
  ): Promise<{ removed: boolean; reason: 'record' | 'django-file' | 'skip' | 'error' }> => {
    const rid = String(resourceId || '').trim()
    if (!rid) return { removed: false, reason: 'skip' }
    const resource = payload.store.state.resourcesById?.[rid] as any
    if (!resource) return { removed: false, reason: 'skip' }

    const posterUrl = String((resource as any)?.posterUrl || '').trim()
    const posterSourcePath = String((resource as any)?.posterSourcePath || '').trim()

    const deletePosterAssetIfNeeded = async () => {
      if (!posterUrl && !posterSourcePath) return
      const posterRef = { url: posterUrl, sourcePath: posterSourcePath }
      if (!payload.isDjangoManagedResource(posterRef)) return

      const resp = await payload.blueprintProjectService.deleteAsset({
        projectId: payload.currentProjectId.value,
        url: posterUrl || undefined,
        sourcePath: posterSourcePath || undefined,
        relativePath: payload.mediaRelativePathFromUrl(posterUrl) || undefined,
      })

      if (!resp.ok && !opts?.silent) {
        payload.pushToast(`删除缩略图失败：${String(resp.error || 'unknown')}`, 'warn')
      }
    }

    if (payload.isComfyForwardResource(resource)) {
      await deletePosterAssetIfNeeded()
      payload.removeResourceRecordOnly(rid)
      return { removed: true, reason: 'record' }
    }

    if (!payload.isDjangoManagedResource(resource)) {
      await deletePosterAssetIfNeeded()
      payload.removeResourceRecordOnly(rid)
      return { removed: true, reason: 'record' }
    }

    const resp = await payload.blueprintProjectService.deleteAsset({
      projectId: payload.currentProjectId.value,
      resourceId: rid,
      url: String(resource?.url || '').trim() || undefined,
      sourcePath: String(resource?.sourcePath || '').trim() || undefined,
      relativePath: payload.mediaRelativePathFromUrl(String(resource?.url || '')) || undefined,
    })

    if (!resp.ok) {
      if (!opts?.silent) payload.pushToast(`删除资源失败：${String(resp.error || 'unknown')}`, 'error')
      return { removed: false, reason: 'error' }
    }

    await deletePosterAssetIfNeeded()
    payload.removeResourceRecordOnly(rid)
    return { removed: true, reason: 'django-file' }
  }

  const onRemoveResource = async (resourceId: string) => {
    await removeResourceByPolicy(resourceId)
  }

  const onRefreshMissingResourceRecords = async (resourceIds: string[]) => {
    const ids = Array.from(new Set((resourceIds ?? []).map((id) => String(id || '').trim()).filter((id) => !!id)))
    if (!ids.length) {
      payload.pushToast('没有检测到无缩略图资源。', 'info')
      return
    }

    let removed = 0
    for (const rid of ids) {
      const result = await removeResourceByPolicy(rid, { silent: true })
      if (result.removed) removed += 1
    }
    payload.pushToast(`已清理 ${removed} / ${ids.length} 条无缩略图资源记录。`, 'info')
  }

  return {
    removeResourceByPolicy,
    onRemoveResource,
    onRefreshMissingResourceRecords,
  }
}
