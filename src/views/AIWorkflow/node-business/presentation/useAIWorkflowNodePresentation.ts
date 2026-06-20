import type { Component } from 'vue'
import type { Store } from 'vuex'
import type { WorkflowNode, WorkflowState } from '../../../../aiworkflow/types'
import WorkflowNodeBase from '../../../../ui/WorkFlow/WorkflowNodeBase.vue'
import WorkflowTextNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowTextNode.vue'
import WorkflowTextMergeNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowTextMergeNode.vue'
import WorkflowImageNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowImageNode.vue'
import WorkflowRotateImageNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowRotateImageNode.vue'
import WorkflowVideoNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowVideoNode.vue'
import WorkflowStoryNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowStoryNode.vue'
import WorkflowComfyUINode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowComfyUINode.vue'
import WorkflowModel3DNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowModel3DNode.vue'
import WorkflowMeshyModelNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowMeshyModelNode.vue'
import WorkflowSceneUnderstandingNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowSceneUnderstandingNode.vue'
import WorkflowSceneDecomposeNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowSceneDecomposeNode.vue'
import WorkflowSceneLayoutNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowSceneLayoutNode.vue'
import WorkflowUnrealExportNode from '../../../../ui/WorkFlow/WorlFlowNodes/WorkflowUnrealExportNode.vue'
import { sanitizeWorkflowMediaUrl } from '../../../../aiworkflow/domain/resource/safeWorkflowUrl'
import { isWorkflowLocalAssetUrl, resolveBackendUrl } from '../../../../network/backendConfig'

export const useAIWorkflowNodePresentation = (store: Store<WorkflowState>) => {
  const clampNodeScale = (zoom: number) => Math.max(0.2, Math.min(6, Number(zoom) || 1))

  const resolveNodeShellStyle = (
    worldToScreen: (point: { x: number; y: number }) => { x: number; y: number },
    worldX: number,
    worldY: number,
    zoom: number,
    width: number,
    height: number,
  ) => {
    const point = worldToScreen({ x: worldX, y: worldY })
    return {
      left: `${point.x}px`,
      top: `${point.y}px`,
      width: `${Math.max(80, width || 240)}px`,
      height: `${Math.max(80, height || 160)}px`,
      transform: `translate(-50%, -50%) scale(${clampNodeScale(zoom)})`,
    } as Record<string, string>
  }

  const nodeStyle = (
    worldToScreen: (point: { x: number; y: number }) => { x: number; y: number },
    worldX: number,
    worldY: number,
    zoom: number,
    width: number,
    height: number,
  ) => resolveNodeShellStyle(worldToScreen, worldX, worldY, zoom, width, height)

  const compactNodeStyle = (
    worldToScreen: (point: { x: number; y: number }) => { x: number; y: number },
    worldX: number,
    worldY: number,
    zoom: number,
    width: number,
    height: number,
  ) => resolveNodeShellStyle(worldToScreen, worldX, worldY, zoom, width, height)

  const nodeComponent = (node: WorkflowNode): Component => {
    if (node.type === 'story') return WorkflowStoryNode
    if (node.type === 'text') return WorkflowTextNode
    if (node.type === 'text-merge') return WorkflowTextMergeNode
    if (node.type === 'image') return WorkflowImageNode
    if (node.type === 'rotate-image') return WorkflowRotateImageNode
    if (node.type === 'video') return WorkflowVideoNode
    if (node.type === 'scene-understanding') return WorkflowSceneUnderstandingNode
    if (node.type === 'scene-decompose') return WorkflowSceneDecomposeNode
    if (node.type === 'scene-layout') return WorkflowSceneLayoutNode
    if (node.type === 'unreal-export') return WorkflowUnrealExportNode
    if (node.type === 'comfyui') return WorkflowComfyUINode
    if (node.type === 'model3d') return WorkflowModel3DNode
    if (node.type === 'meshy') return WorkflowMeshyModelNode
    return WorkflowNodeBase
  }

  const parseProjectAssetUrl = (raw: unknown) => {
    const text = String(raw ?? '').trim()
    if (!text) return null
    try {
      const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
      const u = new URL(text, base)
      const protocol = String(u.protocol || '').toLowerCase()
      const host = String(u.hostname || '').toLowerCase()
      const path = String(u.pathname || '').toLowerCase()
      const isDwebAsset = protocol === 'dweb:' && host === 'project-assets'
      const isApiAsset = /\/api\/workflow\/projects\/assets\/file\/?$/.test(path)
      if (!isDwebAsset && !isApiAsset) return null
      const projectId = String(u.searchParams.get('projectId') || '').trim()
      const relPath = String(u.searchParams.get('path') || '').trim()
      if (!projectId || !relPath) return null
      return u
    } catch {
      return null
    }
  }

  const nodeImagePreviewVersion = (node: WorkflowNode) => {
    if (!['image', 'video', 'rotate-image'].includes(node.type) || !node.resourceId) return null
    const resource = store.state.resourcesById[node.resourceId] as any
    if (!resource || typeof resource !== 'object') return null

    const explicit = String(resource.previewVersion ?? '').trim()
    if (explicit) return explicit

    const seedParts: string[] = []
    const fingerprint = String(resource.sourceFingerprint ?? '').trim()
    const sourceSize = Number(resource.sourceSize)
    const sourceMtime = Number(resource.sourceLastModified)
    const previewPath = String(resource.previewProjectRelativePath ?? '').trim()
    const mediaPath = String(resource.projectRelativePath ?? '').trim()

    if (fingerprint) seedParts.push(`f:${fingerprint}`)
    if (previewPath) seedParts.push(`p:${previewPath}`)
    if (mediaPath) seedParts.push(`m:${mediaPath}`)
    if (Number.isFinite(sourceSize) && sourceSize > 0) seedParts.push(`s:${Math.floor(sourceSize)}`)
    if (Number.isFinite(sourceMtime) && sourceMtime > 0) seedParts.push(`t:${Math.floor(sourceMtime)}`)

    if (!seedParts.length) return null
    return seedParts.join('|')
  }

  const buildProjectAssetPreviewUrl = (raw: unknown, maxSize: number, version?: string | null) => {
    const safeUrl = sanitizeWorkflowMediaUrl(raw)
    if (!safeUrl) return ''

    if (/^(?:blob:|data:)/i.test(safeUrl)) return safeUrl
    if (/^https?:\/\//i.test(safeUrl)) return ''

    const parsed = parseProjectAssetUrl(raw)
    if (parsed) {
      const safeSize = Number.isFinite(Number(maxSize)) ? Math.max(128, Math.min(4096, Math.floor(Number(maxSize)))) : 640
      parsed.searchParams.set('variant', 'preview')
      parsed.searchParams.set('maxSize', String(safeSize))
      const v = String(version ?? '').trim()
      if (v) parsed.searchParams.set('v', v)
      return parsed.toString()
    }

    if (safeUrl.startsWith('/api/') || safeUrl.startsWith('/media/')) {
      return resolveBackendUrl(safeUrl) || safeUrl
    }

    return ''
  }

  const nodeImagePreviewUrl = (node: WorkflowNode, maxSize: number) => {
    if (!['image', 'video', 'rotate-image'].includes(node.type) || !node.resourceId) return null
    const resource = store.state.resourcesById[node.resourceId] as any
    if (!resource || typeof resource !== 'object') return null

    const previewVersion = nodeImagePreviewVersion(node)
    const explicitPreviewUrl = sanitizeWorkflowMediaUrl(resource.previewUrl)
    const mediaUrl = sanitizeWorkflowMediaUrl(resource.url)

    const builtFromExplicit = buildProjectAssetPreviewUrl(explicitPreviewUrl, maxSize, previewVersion)
    if (builtFromExplicit) return sanitizeWorkflowMediaUrl(builtFromExplicit) || null

    const builtFromMedia = buildProjectAssetPreviewUrl(mediaUrl, maxSize, previewVersion)
    if (builtFromMedia) return sanitizeWorkflowMediaUrl(builtFromMedia) || null

    return explicitPreviewUrl || null
  }

  const nodeResourceUrl = (node: WorkflowNode) => {
    if (!node.resourceId) return null
    const raw = store.state.resourcesById[node.resourceId]?.url
    const safe = sanitizeWorkflowMediaUrl(raw)
    if (safe && (node.type === 'image' || node.type === 'video' || node.type === 'rotate-image')) {
      if (!isWorkflowLocalAssetUrl(safe)) return null
    }
    return safe || null
  }

  const nodeResourceName = (node: WorkflowNode) => {
    if (!node.resourceId) return null
    return store.state.resourcesById[node.resourceId]?.name ?? null
  }

  const compactNodeImageUrl = (node: WorkflowNode) => {
    if (node.type !== 'image' && node.type !== 'video' && node.type !== 'rotate-image') return null
    return nodeImagePreviewUrl(node, 320)
  }

  return {
    nodeStyle,
    compactNodeStyle,
    nodeComponent,
    nodeImagePreviewUrl,
    nodeImagePreviewVersion,
    nodeResourceUrl,
    nodeResourceName,
    compactNodeImageUrl,
  }
}
