import type { WorkflowNode } from '../../../../aiworkflow/types'
import type { WorkflowThreePreviewState } from '../../../../ui/WorkFlow/WorlFlowNodes/three-preview/types'
import { sanitizeMeshyPreviewUrl } from '../meshy/useAIWorkflowMeshyAssets'
import { sanitizeWorkflowMediaUrl, sanitizeWorkflowUrlFieldsDeep } from '../../../../aiworkflow/domain/resource/safeWorkflowUrl'

import type { InputParamPreviewRef } from './useAIWorkflowTextOutputResolver'

export const useAIWorkflowNodeExtraProps = (payload: {
  store: {
    state: {
      resourcesById: Record<string, any>
    }
  }
  connectedTextInputValue: (nodeId: string, inputId: string) => string
  computeMergedText: (nodeId: string, visited?: Set<string>) => string
  getInputParamPreviewRefs: (nodeId: string) => InputParamPreviewRef[]
  storyPreview: (node: WorkflowNode) => {
    kind: 'image' | 'video' | null
    url: string | null
    cropEnabled: boolean
    crop: null | { x: number; y: number; width: number; height: number }
  }
  nodeImagePreviewUrl: (node: WorkflowNode, maxSize: number) => string | null
  nodeImagePreviewVersion: (node: WorkflowNode) => string | null
  nodeResourceUrl: (node: WorkflowNode) => string | null
  nodeResourceName: (node: WorkflowNode) => string | null
  connectedImageTargetsFromVideo: (videoNodeId: string) => string[]
  rotateImagePreviewUrl: (node: WorkflowNode) => string | null
  connectedSceneUnderstandImageInputs: (nodeId: string) => Array<{ url: string; width?: number; height?: number }>
  connectedImageInputUrl: (nodeId: string, inputId: string) => string | null
  connectedSceneDecomposeImageInputs: (nodeId: string) => Array<{ url: string; width?: number; height?: number }>
  connectedSceneLayoutModelBindings: (nodeId: string) => any[]
  viewportMotionActive: { value: boolean }
  active3DPreviewNodeId: { value: string }
  getThreePreviewState: (nodeId: string, nodeType: WorkflowNode['type']) => WorkflowThreePreviewState | null
  performancePriorityMode: { value: boolean }
  nodeCount: { value: number }
  connectedMeshySourcePreview: (nodeId: string) => { url: string; label: string }
  buildMeshyNodePresentationSettings: (settings: any) => any
  connectedMeshyPrompt: (nodeId: string) => string
  connectedMeshyImageUrls: (nodeId: string) => string[]
  nodeMediaReloadToken: (nodeId: string) => number
}) => {
  const extraPropsCache = new Map<string, Record<string, any>>()

  const withMotionSafeProps = (node: WorkflowNode, props: Record<string, any>) => {
    if (props.previewSuspended === true) return props
    if (node.type === 'scene-layout' || node.type === 'model3d') {
      return {
        ...props,
        previewSuspended: true,
      }
    }
    return props
  }

  const shouldShedHeavyMedia = () => {
    if (!payload.performancePriorityMode.value) return false
    const count = Number(payload.nodeCount.value) || 0
    return payload.viewportMotionActive.value || count >= 220
  }

  const buildMotionReducedProps = (node: WorkflowNode): Record<string, any> => {
    if (node.type === 'scene-layout') {
      return {
        sceneLayoutSettings: sanitizeWorkflowUrlFieldsDeep(node.sceneLayoutSettings ?? null),
        linkedJsonText: '',
        linkedLightingJsonText: '',
        sceneLayoutModelBindings: [],
        threePreviewState: null,
        previewSuspended: true,
      }
    }
    if (node.type === 'model3d') {
      return {
        model3dSettings: sanitizeWorkflowUrlFieldsDeep(node.model3dSettings ?? null),
        threePreviewState: null,
        inputParamPreviewRefs: [],
        previewSuspended: true,
      }
    }
    if (node.type === 'scene-understanding') {
      return {
        sceneUnderstandingSettings: node.sceneUnderstandingSettings ?? null,
        linkedImageUrl: '',
        linkedImageUrls: [],
        linkedLayoutJsonText: '',
        linkedPromptText: '',
      }
    }
    if (node.type === 'scene-decompose') {
      return {
        sceneDecomposeSettings: node.sceneDecomposeSettings ?? null,
        linkedImageUrls: [],
        linkedJsonText: '',
      }
    }
    if (node.type === 'meshy') {
      return {
        meshySettings: payload.buildMeshyNodePresentationSettings(node.meshySettings ?? null),
        connectedPrompt: '',
        connectedImageUrls: [],
        sourcePreviewUrl: '',
        sourcePreviewLabel: '',
      }
    }
    if (node.type === 'image' || node.type === 'video') {
      const rid = String(node.resourceId ?? '').trim()
      const resource = rid ? payload.store.state.resourcesById[rid] : null
      const resourceSourcePath =
        resource && typeof (resource as any).sourcePath === 'string'
          ? String((resource as any).sourcePath).trim()
          : ''
      const imagePreviewUrl320 = sanitizeWorkflowMediaUrl(payload.nodeImagePreviewUrl(node, 320))
      const imagePreviewUrl640 = sanitizeWorkflowMediaUrl(payload.nodeImagePreviewUrl(node, 640))
      const imagePreviewVersion = String(payload.nodeImagePreviewVersion(node) ?? '').trim()
      const resourcePosterUrl =
        node.type === 'video'
          ? (() => {
              if (!rid) return null
              const raw = typeof (resource as any)?.posterUrl === 'string' ? String((resource as any).posterUrl).trim() : ''
              const safe = sanitizeWorkflowMediaUrl(raw)
              return safe || null
            })()
          : null
      return {
        resourceUrl: sanitizeWorkflowMediaUrl(payload.nodeResourceUrl(node)),
        resourceSourcePath: resourceSourcePath || null,
        resourcePreviewUrl320: imagePreviewUrl320 || null,
        resourcePreviewUrl640: imagePreviewUrl640 || imagePreviewUrl320 || null,
        resourcePreviewVersion: imagePreviewVersion || null,
        resourceName: payload.nodeResourceName(node),
        inputParamPreviewRefs: [],
        ...(node.type === 'image' ? { imageSettings: node.imageSettings ?? null } : {}),
        ...(node.type === 'video'
          ? {
              posterUrl: resourcePosterUrl,
              videoSettings: node.videoSettings ?? null,
              screenshotEnabled: payload.connectedImageTargetsFromVideo(node.id).length > 0,
              reloadToken: payload.nodeMediaReloadToken(node.id),
            }
          : {}),
      }
    }
    if (node.type === 'rotate-image') {
      return {
        inputUrl: '',
        rotatePromptText: '',
      }
    }
    if (node.type === 'story') {
      const pw = node.storySettings?.previewWidth
      const ph = node.storySettings?.previewHeight
      return {
        branches: [],
        previewUrl: '',
        previewKind: null,
        previewCropEnabled: false,
        previewCrop: null,
        previewWidth: Number.isFinite(Number(pw)) ? Number(pw) : 1920,
        previewHeight: Number.isFinite(Number(ph)) ? Number(ph) : 1080,
      }
    }
    return buildNodeExtraProps(node)
  }

  const buildNodeExtraProps = (node: WorkflowNode): Record<string, any> => {
    if (node.type === 'text') {
      const linkedInput = Array.isArray(node.inputs) && node.inputs.length
        ? payload.connectedTextInputValue(node.id, String(node.inputs[0]?.id ?? ''))
        : ''
      return {
        textValue: String(linkedInput || node.textValue || ''),
        inputParamPreviewRefs: payload.getInputParamPreviewRefs(node.id),
      }
    }
    if (node.type === 'text-merge') {
      const items = Array.isArray((node as any).textMergeItems) ? (node as any).textMergeItems : []
      return {
        mergeItems: items,
        mergedText: payload.computeMergedText(node.id),
      }
    }
    if (node.type === 'story') {
      const preview = payload.storyPreview(node)
      const pw = node.storySettings?.previewWidth
      const ph = node.storySettings?.previewHeight
      return {
        branches: node.branches || [],
        previewUrl: sanitizeWorkflowMediaUrl(preview.url),
        previewKind: preview.kind,
        previewCropEnabled: preview.kind === 'image' ? preview.cropEnabled : false,
        previewCrop: preview.kind === 'image' ? preview.crop : null,
        previewWidth: Number.isFinite(Number(pw)) ? Number(pw) : 1920,
        previewHeight: Number.isFinite(Number(ph)) ? Number(ph) : 1080,
      }
    }
    if (node.type === 'image' || node.type === 'video') {
      const rid = String(node.resourceId ?? '').trim()
      const resource = rid ? payload.store.state.resourcesById[rid] : null
      const resourceSourcePath =
        resource && typeof (resource as any).sourcePath === 'string'
          ? String((resource as any).sourcePath).trim()
          : ''
      const imagePreviewUrl320 = sanitizeWorkflowMediaUrl(payload.nodeImagePreviewUrl(node, 320))
      const imagePreviewUrl640 = sanitizeWorkflowMediaUrl(payload.nodeImagePreviewUrl(node, 640))
      const imagePreviewVersion = String(payload.nodeImagePreviewVersion(node) ?? '').trim()
      const resourcePosterUrl =
        node.type === 'video'
          ? (() => {
              if (!rid) return null
              const raw = typeof (resource as any)?.posterUrl === 'string' ? String((resource as any).posterUrl).trim() : ''
              const safe = sanitizeWorkflowMediaUrl(raw)
              return safe || null
            })()
          : null
      return {
        resourceUrl: sanitizeWorkflowMediaUrl(payload.nodeResourceUrl(node)),
        resourceSourcePath: resourceSourcePath || null,
        resourcePreviewUrl320: imagePreviewUrl320 || null,
        resourcePreviewUrl640: imagePreviewUrl640 || imagePreviewUrl320 || null,
        resourcePreviewVersion: imagePreviewVersion || null,
        resourceName: payload.nodeResourceName(node),
        inputParamPreviewRefs: payload.getInputParamPreviewRefs(node.id),
        ...(node.type === 'image' ? { imageSettings: node.imageSettings ?? null } : {}),
        ...(node.type === 'video'
          ? {
              posterUrl: resourcePosterUrl,
              videoSettings: node.videoSettings ?? null,
              screenshotEnabled: payload.connectedImageTargetsFromVideo(node.id).length > 0,
              reloadToken: payload.nodeMediaReloadToken(node.id),
            }
          : {}),
      }
    }
    if (node.type === 'rotate-image') {
      return {
        inputUrl: sanitizeWorkflowMediaUrl(payload.rotateImagePreviewUrl(node)),
        rotatePromptText: String((node as any).rotatePromptText ?? ''),
      }
    }
    if (node.type === 'scene-understanding') {
      const linkedImages = payload.connectedSceneUnderstandImageInputs(node.id)
      const shedHeavyMedia = shouldShedHeavyMedia()
      return {
        sceneUnderstandingSettings: node.sceneUnderstandingSettings ?? null,
        linkedImageUrl: shedHeavyMedia
          ? ''
          : sanitizeWorkflowMediaUrl(linkedImages[0]?.url ?? payload.connectedImageInputUrl(node.id, 'in-image')),
        linkedImageUrls: shedHeavyMedia
          ? []
          : linkedImages.map((item) => sanitizeWorkflowMediaUrl(item.url)).filter(Boolean),
        linkedLayoutJsonText: payload.connectedTextInputValue(node.id, 'in-layout-json'),
        linkedPromptText: payload.connectedTextInputValue(node.id, 'in-text'),
      }
    }
    if (node.type === 'scene-decompose') {
      const linkedImages = payload.connectedSceneDecomposeImageInputs(node.id)
      const shedHeavyMedia = shouldShedHeavyMedia()
      return {
        sceneDecomposeSettings: node.sceneDecomposeSettings ?? null,
        linkedImageUrls: shedHeavyMedia
          ? []
          : linkedImages.map((item) => sanitizeWorkflowMediaUrl(item.url)).filter(Boolean),
        linkedJsonText: payload.connectedTextInputValue(node.id, 'in-json'),
      }
    }
    if (node.type === 'scene-layout') {
      return {
        sceneLayoutSettings: sanitizeWorkflowUrlFieldsDeep(node.sceneLayoutSettings ?? null),
        linkedJsonText: payload.connectedTextInputValue(node.id, 'in-json'),
        linkedLightingJsonText: payload.connectedTextInputValue(node.id, 'in-lighting-json'),
        sceneLayoutModelBindings: sanitizeWorkflowUrlFieldsDeep(payload.connectedSceneLayoutModelBindings(node.id)),
        threePreviewState: payload.getThreePreviewState(node.id, node.type),
      }
    }
    if (node.type === 'unreal-export') {
      return {
        unrealExportSettings: (node as any).unrealExportSettings ?? null,
        linkedLayoutJsonText: payload.connectedTextInputValue(node.id, 'in-layout-json'),
        linkedLightingJsonText: payload.connectedTextInputValue(node.id, 'in-lighting-json'),
      }
    }
    if (node.type === 'comfyui') {
      return {
        comfyuiSettings: node.comfyuiSettings ?? null,
      }
    }
    if (node.type === 'model3d') {
      return {
        model3dSettings: sanitizeWorkflowUrlFieldsDeep(node.model3dSettings ?? null),
        threePreviewState: payload.getThreePreviewState(node.id, node.type),
        inputParamPreviewRefs: payload.getInputParamPreviewRefs(node.id),
      }
    }
    if (node.type === 'meshy') {
      const sourcePreview = payload.connectedMeshySourcePreview(node.id)
      const shedHeavyMedia = shouldShedHeavyMedia()
      return {
        meshySettings: payload.buildMeshyNodePresentationSettings(node.meshySettings ?? null),
        connectedPrompt: payload.connectedMeshyPrompt(node.id),
        connectedImageUrls: shedHeavyMedia
          ? []
          : payload.connectedMeshyImageUrls(node.id).map((url) => sanitizeWorkflowMediaUrl(url)).filter(Boolean),
        sourcePreviewUrl: shedHeavyMedia
          ? ''
          : sanitizeWorkflowMediaUrl(sanitizeMeshyPreviewUrl(sourcePreview.url)),
        sourcePreviewLabel: sourcePreview.label,
      }
    }
    return {}
  }

  const nodeExtraProps = (node: WorkflowNode) => {
    const nodeId = String(node.id ?? '').trim()
    if (!nodeId) return buildNodeExtraProps(node)

    const isMotionActive = payload.viewportMotionActive.value

    if (isMotionActive) {
      const cached = extraPropsCache.get(nodeId)
      if (cached) return withMotionSafeProps(node, cached)
      const next = buildMotionReducedProps(node)
      extraPropsCache.set(nodeId, next)
      return withMotionSafeProps(node, next)
    }

    extraPropsCache.delete(nodeId)

    return buildNodeExtraProps(node)
  }

  return {
    nodeExtraProps,
  }
}