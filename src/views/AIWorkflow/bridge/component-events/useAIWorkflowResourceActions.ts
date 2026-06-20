import { computed, type Ref } from 'vue'
import type { WorkflowNode } from '../../../../aiworkflow/types'

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
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      triggerDownloadObjectUrl(objectUrl, filename)
    } finally {
      // Give the browser a moment to start the download before revoking.
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