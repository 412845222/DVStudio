import JSZip from 'jszip'
import type { AIWorkflowDraftSnapshot } from '../../../../aiworkflow/persistence/blueprintSnapshot'
import type {
  AIWorkflowProjectPackageAssetTarget,
  AIWorkflowProjectPackageV1,
} from './projectPackage'

export const useAIWorkflowProjectTransfer = (payload: {
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
  buildPersistableSnapshotWithOptions: (opts: { uploadLocalResources: boolean }) => Promise<AIWorkflowDraftSnapshot>
  currentProjectName: { value: string }
  AIWF_PROJECT_PACKAGE_ENTRY: string
  isValidBlueprintSnapshot: (snapshot: unknown) => boolean
  store: {
    state: {
      resourceOrder: string[]
    }
  }
  revokeTrackedObjectUrlsForResource: (resourceId: string) => void
  getTrackedObjectUrlEntries: () => Array<[string, string]>
  revokeObjectUrl: (key: string) => void
  stripUnrealExportRuntimeFromSnapshot: (snapshot: any) => any
  getObjectUrl: (key: string) => string | undefined
  setObjectUrl: (key: string, url: string) => void
  setValueByJsonPointer: (root: any, pointer: string, value: unknown) => boolean
  sanitizeBlueprintSnapshotForRuntime: (snapshot: any) => AIWorkflowDraftSnapshot
  hydrateBlueprintSnapshotSafely: (snapshot: AIWorkflowDraftSnapshot, sourceLabel: string) => boolean
  resetCurrentUnrealExportNodeRuntimeState: () => void
  setUnsavedProject: (name?: string) => void
  sanitizeFileNamePart: (value: string) => string
  recoverComfyUIRunStates: (opts?: { silent?: boolean }) => Promise<void>
}) => {
  const onRequestImportProjectPackage = async (request: { file: File }) => {
    const file = request?.file
    if (!file) return

    try {
      const zip = await JSZip.loadAsync(await file.arrayBuffer())
      const packageFile = zip.file(payload.AIWF_PROJECT_PACKAGE_ENTRY)
      if (!packageFile) {
        payload.pushToast('导入失败：ZIP 内未找到 aiwf-project-package.json。', 'error')
        return
      }

      const raw = await packageFile.async('text')
      const parsed = JSON.parse(raw) as AIWorkflowProjectPackageV1
      if (!parsed || parsed.schemaVersion !== 1 || parsed.kind !== 'aiwf-project-package') {
        payload.pushToast('导入失败：项目包格式不兼容。', 'error')
        return
      }
      if (!payload.isValidBlueprintSnapshot(parsed.snapshot)) {
        payload.pushToast('导入失败：项目包中的蓝图数据无效。', 'error')
        return
      }

      for (const rid of payload.store.state.resourceOrder) {
        payload.revokeTrackedObjectUrlsForResource(rid)
      }
      for (const [key, value] of payload.getTrackedObjectUrlEntries()) {
        if (!String(key || '').startsWith('wf-pkg:')) continue
        try {
          URL.revokeObjectURL(value)
        } catch {
          // ignore
        }
        payload.revokeObjectUrl(key)
      }

      const nextSnapshot = payload.stripUnrealExportRuntimeFromSnapshot(parsed.snapshot)
      const missingAssets: string[] = []
      const assetList = Array.isArray(parsed.assets) ? parsed.assets : []

      for (const asset of assetList) {
        const rid = String(asset?.resourceId || '').trim()
        const target = String(asset?.target || '').trim() as AIWorkflowProjectPackageAssetTarget
        const filePath = String(asset?.filePath || '').trim()
        const snapshotPointer = String((asset as any)?.snapshotPointer || '').trim()
        if (!filePath || (target !== 'url' && target !== 'posterUrl' && target !== 'snapshotField')) continue

        const resource = rid ? (nextSnapshot.resourcesById as any)?.[rid] : null
        if (target !== 'snapshotField' && !resource) continue

        const zf = zip.file(filePath)
        if (!zf) {
          missingAssets.push(filePath)
          continue
        }

        const blob = await zf.async('blob')
        const objectUrl = URL.createObjectURL(blob)
        if (target === 'snapshotField') {
          const objectKey = `wf-pkg:${snapshotPointer || filePath}`
          const previous = payload.getObjectUrl(objectKey)
          if (previous) {
            try {
              URL.revokeObjectURL(previous)
            } catch {
              // ignore
            }
          }
          if (!snapshotPointer || !payload.setValueByJsonPointer(nextSnapshot as any, snapshotPointer, objectUrl)) {
            try {
              URL.revokeObjectURL(objectUrl)
            } catch {
              // ignore
            }
            missingAssets.push(`${filePath}#${snapshotPointer || 'pointer-missing'}`)
            continue
          }
          payload.setObjectUrl(objectKey, objectUrl)
        } else {
          const objectKey = target === 'posterUrl' ? `wf-poster:${rid}` : rid
          const previous = payload.getObjectUrl(objectKey)
          if (previous) {
            try {
              URL.revokeObjectURL(previous)
            } catch {
              // ignore
            }
          }
          payload.setObjectUrl(objectKey, objectUrl)
          resource[target] = objectUrl
          resource.sourcePath = undefined
          resource.posterSourcePath = undefined
          resource.localFileKey = undefined
        }
      }

      const runtimeSafeSnapshot = payload.sanitizeBlueprintSnapshotForRuntime(nextSnapshot)
      if (!payload.hydrateBlueprintSnapshotSafely(runtimeSafeSnapshot, '导入项目包')) return
      payload.resetCurrentUnrealExportNodeRuntimeState()
      payload.setUnsavedProject(
        payload.sanitizeFileNamePart(String(parsed.projectName || file.name || 'blueprint_project').replace(/\.zip$/i, ''))
      )
      await payload.recoverComfyUIRunStates({ silent: true })

      if (missingAssets.length > 0) {
        payload.pushToast(`项目包导入完成，但缺少 ${missingAssets.length} 个资源文件。`, 'warn')
      } else {
        payload.pushToast('项目包导入成功。', 'info')
      }
    } catch (err: any) {
      payload.pushToast('导入项目包失败：' + String(err?.message ?? err ?? 'unknown'), 'error')
    }
  }

  const onRequestExportProject = async () => {
    try {
      const snapshot = await payload.buildPersistableSnapshotWithOptions({ uploadLocalResources: true })
      const content = JSON.stringify(snapshot, null, 2)
      const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const name = String(payload.currentProjectName.value || 'blueprint_project')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '_')
      const a = document.createElement('a')
      a.href = url
      a.download = `${name || 'blueprint_project'}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      payload.pushToast('已导出蓝图 JSON 文件。', 'info')
    } catch (err: any) {
      payload.pushToast('导出失败：' + String(err?.message ?? err ?? 'unknown'), 'error')
    }
  }

  return {
    onRequestImportProjectPackage,
    onRequestExportProject,
  }
}
