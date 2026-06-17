import { computed, type Ref } from 'vue'
import type { WorkflowNode } from '../../../aiworkflow/types'

export const useAIWorkflowNodeVisibility = (payload: {
  nodes: Ref<WorkflowNode[]>
  viewport: Ref<{ zoom: number; panX: number; panY: number }>
  canvasViewportSize: Ref<{ width: number; height: number }>
  selectedNodeIds: Ref<string[]>
  hiddenNodeIds?: string[]
  compactZoomThreshold?: number | Ref<number>
  screenMargin?: number
  viewportMotionActive?: Ref<boolean>
  motionRecomputeMinIntervalMs?: number
}) => {
  const hiddenNodeIdSet = new Set((payload.hiddenNodeIds ?? []).map((id) => String(id || '').trim()).filter(Boolean))
  const compactRenderStateByNodeId = new Map<string, boolean>()

  const resolveCompactZoomThreshold = () => {
    const raw = typeof payload.compactZoomThreshold === 'object'
      ? payload.compactZoomThreshold?.value
      : payload.compactZoomThreshold
    return Number.isFinite(Number(raw)) ? Number(raw) : 0.36
  }
  const screenMargin = Number.isFinite(Number(payload.screenMargin))
    ? Number(payload.screenMargin)
    : 360
  const MAX_WORLD_MARGIN = 1800
  const motionRecomputeMinIntervalMs = Number.isFinite(Number(payload.motionRecomputeMinIntervalMs))
    ? Math.max(16, Number(payload.motionRecomputeMinIntervalMs))
    : 90

  let lastVisibleIds = new Set<string>()
  let lastViewportSignature = ''
  let lastNodeSignature = ''
  let lastSelectedSignature = ''
  let lastComputeAt = 0

  const renderNodes = computed(() => payload.nodes.value.filter((node) => !hiddenNodeIdSet.has(node.id)))

  const compactNodeTypeLabel = (nodeType: string) => {
    if (nodeType === 'text') return '文本'
    if (nodeType === 'text-merge') return '拼接'
    if (nodeType === 'image') return '图片'
    if (nodeType === 'rotate-image') return '旋图'
    if (nodeType === 'video') return '视频'
    if (nodeType === 'scene-understanding') return '理解'
    if (nodeType === 'scene-decompose') return '分解'
    if (nodeType === 'scene-layout') return '布局'
    if (nodeType === 'story') return '剧情'
    if (nodeType === 'comfyui') return 'Comfy'
    if (nodeType === 'model3d') return '3D'
    if (nodeType === 'meshy') return 'Meshy'
    return '节点'
  }

  const compactNodeDisplayName = (node: WorkflowNode) => String(node.alias ?? node.title ?? '').trim() || compactNodeTypeLabel(node.type)
  const compactNodeBadge = (node: WorkflowNode) => compactNodeTypeLabel(node.type)

  const compactNodeMeta = (node: WorkflowNode) => {
    const inputCount = Array.isArray(node.inputs) ? node.inputs.length : 0
    const outputCount = Array.isArray(node.outputs) ? node.outputs.length : 0
    if (node.type === 'model3d' || node.type === 'scene-layout') return '重预览已折叠'
    if (node.type === 'image' || node.type === 'video') return `${inputCount} 入 / ${outputCount} 出`
    if (node.type === 'scene-understanding' || node.type === 'scene-decompose') return `${outputCount} 输出锚点`
    return `${inputCount} 入 / ${outputCount} 出`
  }

  const compactNodeTooltip = (node: WorkflowNode) => {
    const name = compactNodeDisplayName(node)
    const meta = compactNodeMeta(node)
    return `${name} · ${meta} · 当前缩放过小，已切换为轻量占位`
  }

  const compactNodeClass = (node: WorkflowNode) => ({
    'is-selected': payload.selectedNodeIds.value.includes(node.id),
    'is-media': node.type === 'image' || node.type === 'video' || node.type === 'rotate-image',
    'is-scene': node.type === 'scene-understanding' || node.type === 'scene-decompose' || node.type === 'scene-layout',
    'is-3d': node.type === 'model3d' || node.type === 'meshy',
    'is-story': node.type === 'story',
  })

  const shouldRenderCompactNode = (zoom: number, node: WorkflowNode) => {
    const nodeId = String(node?.id ?? '').trim()
    if (!nodeId) return false
    const safeZoom = Math.max(0.01, Number(zoom) || 1)
    const threshold = resolveCompactZoomThreshold()
    const exitThreshold = threshold + Math.max(0.03, threshold * 0.08)
    const isSelected = payload.selectedNodeIds.value.includes(node.id)
    if (isSelected) {
      compactRenderStateByNodeId.set(nodeId, false)
      return false
    }
    const previous = compactRenderStateByNodeId.get(nodeId) === true
    const next = previous ? safeZoom <= exitThreshold : safeZoom <= threshold
    compactRenderStateByNodeId.set(nodeId, next)
    return next
  }

  const buildNodeSignature = (nodes: WorkflowNode[]) => {
    const count = nodes.length
    if (!count) return '0'
    const sampleStep = Math.max(1, Math.floor(count / 24))
    let hash = count * 131
    for (let i = 0; i < count; i += sampleStep) {
      const node = nodes[i]
      const id = String(node.id ?? '')
      for (let j = 0; j < id.length; j += 1) hash = (hash * 33 + id.charCodeAt(j)) % 2147483647
      hash = (hash + Math.round((Number(node.worldX) || 0) * 10)) % 2147483647
      hash = (hash + Math.round((Number(node.worldY) || 0) * 10)) % 2147483647
      hash = (hash + Math.round((Number(node.width) || 0) * 10)) % 2147483647
      hash = (hash + Math.round((Number(node.height) || 0) * 10)) % 2147483647
    }
    const firstId = String(nodes[0]?.id ?? '')
    const lastId = String(nodes[count - 1]?.id ?? '')
    return `${count}:${hash}:${firstId}:${lastId}`
  }

  const buildSelectedSignature = (selectedIds: string[]) => {
    if (!selectedIds.length) return '0'
    return selectedIds.join('|')
  }

  const visibleRenderNodeIds = computed(() => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const viewportWidth = payload.canvasViewportSize.value.width
    const viewportHeight = payload.canvasViewportSize.value.height
    const nodesForRender = renderNodes.value
    const selectedIdsRaw = payload.selectedNodeIds.value ?? []
    const selectedSignature = buildSelectedSignature(selectedIdsRaw)
    const nodeSignature = buildNodeSignature(nodesForRender)

    if (viewportWidth <= 0 || viewportHeight <= 0) {
      const next = new Set(nodesForRender.map((node) => node.id))
      lastVisibleIds = next
      lastViewportSignature = `zero:${viewportWidth}:${viewportHeight}`
      lastNodeSignature = nodeSignature
      lastSelectedSignature = selectedSignature
      lastComputeAt = now
      return next
    }

    const zoom = Math.max(0.01, Number(payload.viewport.value.zoom) || 1)
    const worldMargin = Math.min(MAX_WORLD_MARGIN, screenMargin / zoom)
    const centerX = viewportWidth / 2
    const centerY = viewportHeight / 2
    const viewLeft = (-centerX - payload.viewport.value.panX) / zoom - worldMargin
    const viewRight = (viewportWidth - centerX - payload.viewport.value.panX) / zoom + worldMargin
    const viewTop = (-centerY - payload.viewport.value.panY) / zoom - worldMargin
    const viewBottom = (viewportHeight - centerY - payload.viewport.value.panY) / zoom + worldMargin
    const selectedIds = new Set(selectedIdsRaw)
    const viewportSignature = `${zoom.toFixed(4)}:${viewLeft.toFixed(1)}:${viewTop.toFixed(1)}:${viewRight.toFixed(1)}:${viewBottom.toFixed(1)}`
    const motionActive = payload.viewportMotionActive?.value === true

    if (
      lastVisibleIds.size > 0
      && lastNodeSignature === nodeSignature
      && lastSelectedSignature === selectedSignature
      && viewportSignature === lastViewportSignature
    ) {
      return lastVisibleIds
    }

    if (
      motionActive
      && lastVisibleIds.size > 0
      && lastNodeSignature === nodeSignature
      && lastSelectedSignature === selectedSignature
      && now - lastComputeAt < motionRecomputeMinIntervalMs
    ) {
      return lastVisibleIds
    }

    const next = new Set<string>()

    for (const node of nodesForRender) {
      if (selectedIds.has(node.id)) {
        next.add(node.id)
        continue
      }
      const halfWidth = Math.max(0, Number(node.width) || 0) / 2
      const halfHeight = Math.max(0, Number(node.height) || 0) / 2
      const left = node.worldX - halfWidth
      const right = node.worldX + halfWidth
      const top = node.worldY - halfHeight
      const bottom = node.worldY + halfHeight
      const visible = right >= viewLeft && left <= viewRight && bottom >= viewTop && top <= viewBottom
      if (visible) next.add(node.id)
    }

    lastVisibleIds = next
    lastViewportSignature = viewportSignature
    lastNodeSignature = nodeSignature
    lastSelectedSignature = selectedSignature
    lastComputeAt = now
    return next
  })

  const visibleRenderNodes = computed(() => renderNodes.value.filter((node) => visibleRenderNodeIds.value.has(node.id)))

  const renderNodeIdSet = computed(() => new Set(renderNodes.value.map((node) => String(node.id ?? '').trim()).filter(Boolean)))

  const pruneCompactRenderState = () => {
    if (!compactRenderStateByNodeId.size) return
    const validIds = renderNodeIdSet.value
    for (const nodeId of compactRenderStateByNodeId.keys()) {
      if (!validIds.has(nodeId)) compactRenderStateByNodeId.delete(nodeId)
    }
  }

  const compactVisibleNodeCount = computed(() => {
    pruneCompactRenderState()
    return visibleRenderNodes.value.filter((node) => shouldRenderCompactNode(payload.viewport.value.zoom, node)).length
  })
  const fullVisibleNodeCount = computed(() => Math.max(0, visibleRenderNodes.value.length - compactVisibleNodeCount.value))

  return {
    renderNodes,
    visibleRenderNodeIds,
    visibleRenderNodes,
    compactNodeDisplayName,
    compactNodeBadge,
    compactNodeMeta,
    compactNodeTooltip,
    compactNodeClass,
    shouldRenderCompactNode,
    compactVisibleNodeCount,
    fullVisibleNodeCount,
  }
}
