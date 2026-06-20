import { computed, type Ref } from 'vue'
import type { WorkflowNode } from '../../../../aiworkflow/types'
import { resolveBackendUrl } from '../../../../network/backendConfig'

const REMOTE_CDN_RE = /^https?:\/\//i

export const useAIWorkflowResourceActions = (payload: {
  store: {
    state: {
      nodesById: Record<string, any>
      resourcesById: Record<string, any>
    }
  }
  selectedNodeId: Ref<string | null>
  isElectron: () => boolean
  nodeResourceName: (node: WorkflowNode) => string | null
  /** 可选 getter：用于通过后端代理下载远程 CDN URL 的资产。 */
  getPersistExternalAssetToProject?: () => (payload: {
    kind: 'image' | 'video' | 'file' | 'model'
    name: string
    sourceUrl?: string
    sourcePath?: string
  }) => Promise<{ url: string; absolutePath: string; projectRelativePath?: string } | null>
}) => {
  const triggerDownloadObjectUrl = (objectUrl: string, filename: string) => {
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const downloadUrlAsBlob = async (url: string, filename: string) => {
    // 第一步：将 dweb:// 或其他协议 URL 转换为 HTTP URL
    let workingUrl = resolveBackendUrl(url)
    // 远程 CDN URL：由于 CORS，浏览器无法直接 fetch()。先通过后端代理下载到本地。
    let finalUrl = workingUrl
    const persistFn = typeof payload.getPersistExternalAssetToProject === 'function'
      ? payload.getPersistExternalAssetToProject()
      : null
    if (REMOTE_CDN_RE.test(workingUrl) && typeof persistFn === 'function') {
      const inferredKind: 'image' | 'video' | 'file' =
        /\.(png|jpg|jpeg|gif|webp|bmp|svg|tiff?)(?:\?|$)/i.test(url)
          ? 'image'
          : /\.(mp4|webm|mov|mkv|avi)(?:\?|$)/i.test(url)
            ? 'video'
            : 'file'
      try {
        const persisted = await persistFn({
          kind: inferredKind,
          name: filename.replace(/\.[^.]+$/, '') || `download-${Date.now()}`,
          sourceUrl: url,
        })
        if (persisted?.url) {
          finalUrl = persisted.url
        }
      } catch {
        // 回退到原始 URL
      }
    }

    const res = await fetch(finalUrl, { credentials: 'include' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      triggerDownloadObjectUrl(objectUrl, filename)
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    }
  }

  const inferSelectedResourceFilename = (node: WorkflowNode) => {
    const raw = node.type === 'model3d'
      ? String(node.model3dSettings?.modelSourceName ?? '').trim()
      : String(payload.nodeResourceName(node) ?? '').trim()
    const safe = raw.replace(/[\\/:*?"<>|]+/g, '_')
    if (safe) return safe
    if (node.type === 'model3d') {
      const fmt = String(node.model3dSettings?.modelFormat ?? 'glb').trim() || 'glb'
      return `model-${node.id}.${fmt}`
    }
    if (node.type === 'video') return `video-${node.id}.mp4`
    return `image-${node.id}.png`
  }

  const selectedNodeLocalResourcePath = computed(() => {
    if (!payload.selectedNodeId.value) return ''
    const node = payload.store.state.nodesById[payload.selectedNodeId.value]
    if (!node) return ''
    if (node.type === 'model3d') {
      const assetPath = String(node.model3dSettings?.modelAssetPath ?? '').trim()
      if (/^[a-zA-Z]:[\\/]/.test(assetPath) || assetPath.startsWith('/')) return assetPath
      const sourcePath = String(node.model3dSettings?.modelSourcePath ?? '').trim()
      if (/^[a-zA-Z]:[\\/]/.test(sourcePath) || sourcePath.startsWith('/')) return sourcePath
      return ''
    }
    if (node.type !== 'image' && node.type !== 'video') return ''
    const rid = String((node as any)?.resourceId ?? '').trim()
    if (!rid) return ''
    const resource = payload.store.state.resourcesById[rid] as any
    if (!resource) return ''

    const sourcePath = String(resource?.sourcePath ?? '').trim()
    if (/^[a-zA-Z]:[\\/]/.test(sourcePath) || sourcePath.startsWith('/')) return sourcePath

    const rawUrl = String(resource?.url ?? '').trim()
    if (/^file:\/\//i.test(rawUrl)) {
      const urlObj = new URL(rawUrl)
      return decodeURIComponent(urlObj.pathname).replace(/^\/+([a-zA-Z]:)/, '$1')
    }
    return ''
  })

  const canOpenSelectedNodeFolder = computed(() => {
    return Boolean(payload.isElectron() && selectedNodeLocalResourcePath.value)
  })

  return {
    downloadUrlAsBlob,
    inferSelectedResourceFilename,
    selectedNodeLocalResourcePath,
    canOpenSelectedNodeFolder,
  }
}