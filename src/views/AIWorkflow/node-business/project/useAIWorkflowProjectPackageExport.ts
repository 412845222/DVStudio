import JSZip from 'jszip'
import { onBeforeUnmount, ref } from 'vue'
import { getErrorMessage } from '../../../../types/utils'
import { resolveBackendUrl } from '../../../../network/backendConfig'
import {
  AIWF_PROJECT_PACKAGE_ENTRY,
  cleanupPackagedAssetUrl,
  cloneBlueprintSnapshotForPackaging,
  collectPackageNodeAssetCandidates,
  collectPackageReferencedResourceIds,
  fetchAssetBlobForPackage,
  guessAssetExtension,
  inferPackageAssetKind,
  sanitizeFileNamePart,
  setValueByJsonPointer,
  type AIWorkflowProjectPackageAssetEntry,
  type AIWorkflowProjectPackageAssetKind,
  type AIWorkflowProjectPackageAssetTarget,
  type AIWorkflowProjectPackageV1,
} from './projectPackage'

export const useAIWorkflowProjectPackageExport = (payload: {
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
  buildPersistableSnapshotWithOptions: (opts: { uploadLocalResources: boolean }) => Promise<any>
  stripUnrealExportRuntimeFromSnapshot: (snapshot: any) => any
  currentProjectName: { value: string }
}) => {
  const packageExportProgress = ref({ active: false, progress: 0, stage: '', detail: '' })
  let packageExportProgressHideTimer = 0

  const clearPackageExportProgressHideTimer = () => {
    if (!packageExportProgressHideTimer) return
    window.clearTimeout(packageExportProgressHideTimer)
    packageExportProgressHideTimer = 0
  }

  const setPackageExportProgress = (stage: string, progress: number, detail = '') => {
    clearPackageExportProgressHideTimer()
    packageExportProgress.value = {
      active: true,
      progress: Math.max(0, Math.min(100, Number(progress) || 0)),
      stage: String(stage || '').trim() || '处理中',
      detail: String(detail || '').trim(),
    }
  }

  const finishPackageExportProgress = (stage: string, detail = '') => {
    clearPackageExportProgressHideTimer()
    packageExportProgress.value = {
      active: true,
      progress: 100,
      stage: String(stage || '').trim() || '完成',
      detail: String(detail || '').trim(),
    }
    packageExportProgressHideTimer = window.setTimeout(() => {
      packageExportProgress.value = { active: false, progress: 0, stage: '', detail: '' }
      packageExportProgressHideTimer = 0
    }, 1400)
  }

  const resetPackageExportProgress = () => {
    clearPackageExportProgressHideTimer()
    packageExportProgress.value = { active: false, progress: 0, stage: '', detail: '' }
  }

  const onRequestExportProjectPackage = async () => {
    if (packageExportProgress.value.active) {
      payload.pushToast('项目包仍在导出中，请稍候。', 'warn')
      return
    }
    try {
      setPackageExportProgress('准备项目快照', 2, '正在整理当前蓝图状态')
      const baseSnapshot = await payload.buildPersistableSnapshotWithOptions({ uploadLocalResources: true })
      const snapshot = payload.stripUnrealExportRuntimeFromSnapshot(cloneBlueprintSnapshotForPackaging(baseSnapshot))
      const zip = new JSZip()
      const assets: AIWorkflowProjectPackageAssetEntry[] = []
      let skipped = 0
      const referencedResourceIds = Array.from(collectPackageReferencedResourceIds(snapshot))
      const deepSnapshotAssetCandidates = collectPackageNodeAssetCandidates(snapshot)
      const cachedByUrl = new Map<string, { filePath: string; blob: Blob; kind: AIWorkflowProjectPackageAssetKind }>()
      const totalResourceFetches = referencedResourceIds.reduce((count, rid) => {
        const resource = snapshot.resourcesById[rid] as any
        if (!resource) return count
        return count + (cleanupPackagedAssetUrl(resource?.url) ? 1 : 0) + (cleanupPackagedAssetUrl(resource?.posterUrl) ? 1 : 0)
      }, 0)
      const totalFetchSteps = Math.max(1, totalResourceFetches + deepSnapshotAssetCandidates.length)
      let processedFetchSteps = 0
      const updateFetchProgress = (stage: string, detail: string) => {
        const progress = 8 + (processedFetchSteps / totalFetchSteps) * 72
        setPackageExportProgress(stage, progress, detail)
      }

      for (const rid of referencedResourceIds) {
        const resource = snapshot.resourcesById[rid] as any
        if (!resource) continue
        const kind = resource?.kind === 'video' ? 'video' : resource?.kind === 'image' ? 'image' : null
        if (!kind) continue

        const targets: AIWorkflowProjectPackageAssetTarget[] = ['url', 'posterUrl']
        for (const target of targets) {
          const currentUrl = cleanupPackagedAssetUrl(resource?.[target])
          if (!currentUrl || currentUrl.startsWith('package://')) continue

          updateFetchProgress('收集资源池资产', `${processedFetchSteps + 1}/${totalFetchSteps} · ${String(resource?.name || rid)}`)

          const blob = await fetchAssetBlobForPackage(currentUrl, resolveBackendUrl)
          processedFetchSteps += 1
          if (!blob) {
            skipped += 1
            updateFetchProgress('收集资源池资产', `${processedFetchSteps}/${totalFetchSteps} · 跳过 ${String(resource?.name || rid)}`)
            continue
          }

          const ext = guessAssetExtension(currentUrl, blob.type, kind === 'image' ? 'png' : 'mp4')
          const filePath = `assets/${sanitizeFileNamePart(rid)}-${target}.${ext}`
          zip.file(filePath, blob)
          cachedByUrl.set(currentUrl, { filePath, blob, kind })

          assets.push({
            resourceId: rid,
            target,
            filePath,
            kind,
            name: String(resource?.name || rid),
            mimeType: String(blob.type || ''),
            size: Number(blob.size || 0),
          })
          resource[target] = `package://${filePath}`
          updateFetchProgress('收集资源池资产', `${processedFetchSteps}/${totalFetchSteps} · 已打包 ${String(resource?.name || rid)}`)
        }

        resource.sourcePath = undefined
        resource.posterSourcePath = undefined
        resource.localFileKey = undefined
      }

      let snapshotAssetIndex = 0
      for (const item of deepSnapshotAssetCandidates) {
        const cleanUrl = cleanupPackagedAssetUrl(item.url)
        if (!cleanUrl || cleanUrl.startsWith('package://')) continue

        updateFetchProgress('收集节点关联资产', `${processedFetchSteps + 1}/${totalFetchSteps} · ${item.name}`)

        let cached = cachedByUrl.get(cleanUrl)
        if (!cached) {
          const blob = await fetchAssetBlobForPackage(cleanUrl, resolveBackendUrl)
          processedFetchSteps += 1
          if (!blob) {
            skipped += 1
            updateFetchProgress('收集节点关联资产', `${processedFetchSteps}/${totalFetchSteps} · 跳过 ${item.name}`)
            continue
          }
          const guessedKind = item.kind || inferPackageAssetKind(cleanUrl, blob.type)
          const ext = guessAssetExtension(cleanUrl, blob.type, guessedKind === 'video' ? 'mp4' : guessedKind === 'image' ? 'png' : 'bin')
          const filePath = `assets/snapshot-${snapshotAssetIndex}.${ext}`
          snapshotAssetIndex += 1
          zip.file(filePath, blob)
          cached = { filePath, blob, kind: guessedKind }
          cachedByUrl.set(cleanUrl, cached)
          updateFetchProgress('收集节点关联资产', `${processedFetchSteps}/${totalFetchSteps} · 已打包 ${item.name}`)
        } else {
          processedFetchSteps += 1
          updateFetchProgress('收集节点关联资产', `${processedFetchSteps}/${totalFetchSteps} · 复用 ${item.name}`)
        }

        setValueByJsonPointer(snapshot as any, item.pointer, `package://${cached.filePath}`)
        assets.push({
          target: 'snapshotField',
          filePath: cached.filePath,
          kind: cached.kind,
          name: item.name,
          mimeType: String(cached.blob.type || ''),
          size: Number(cached.blob.size || 0),
          snapshotPointer: item.pointer,
        })
      }

      const pkg: AIWorkflowProjectPackageV1 = {
        schemaVersion: 1,
        kind: 'aiwf-project-package',
        exportedAt: Date.now(),
        projectName: String(payload.currentProjectName.value || 'blueprint_project').trim() || 'blueprint_project',
        snapshot,
        assets,
      }

      zip.file(AIWF_PROJECT_PACKAGE_ENTRY, JSON.stringify(pkg, null, 2))
      setPackageExportProgress('压缩项目包', 84, `共 ${assets.length} 个资产条目`)
      const blob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
        (metadata) => {
          const percent = 84 + Math.max(0, Math.min(14, Number(metadata.percent || 0) * 0.14))
          setPackageExportProgress('压缩项目包', percent, `${Math.round(Number(metadata.percent || 0))}% · ${assets.length} 个资产条目`)
        }
      )
      setPackageExportProgress('写出 ZIP 文件', 99, `${Math.round(blob.size / 1024 / 1024)} MB`)
      const url = URL.createObjectURL(blob)
      const name = sanitizeFileNamePart(pkg.projectName) || 'blueprint_project'
      const a = document.createElement('a')
      a.href = url
      a.download = `${name}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      if (skipped > 0) {
        finishPackageExportProgress('项目包导出完成', `已跳过 ${skipped} 个无法打包的资源`)
        payload.pushToast(`项目包导出完成，${skipped} 个资源未能打包（保留原始 URL）。`, 'warn')
      } else {
        finishPackageExportProgress('项目包导出完成', `${assets.length} 个资产条目已写入 ZIP`)
        payload.pushToast('项目包导出完成。', 'info')
      }
    } catch (err: unknown) {
      resetPackageExportProgress()
      payload.pushToast('导出项目包失败：' + getErrorMessage(err), 'error')
    }
  }

  onBeforeUnmount(() => {
    clearPackageExportProgressHideTimer()
  })

  return {
    packageExportProgress,
    onRequestExportProjectPackage,
  }
}
