import type { Ref } from 'vue'
import type { Store } from 'vuex'
import { hitTestNodesInWorldRect } from '../../../../aiworkflow/domain/selection/hitTestNodesInWorldRect'
import type { WorkflowState } from '../../../../aiworkflow/types'

export type ScreenToWorldFn = (point: { x: number; y: number }) => { x: number; y: number }

export const useAIWorkflowCanvasInteraction = (payload: {
  store: Store<WorkflowState>
  selectedNodeIds: Ref<string[]>
  inspectorOpen: Ref<boolean>
  chatModelKey: Ref<string>
  chatCollapsed: Ref<boolean>
  markViewportMotion: () => void
  scheduleAsyncEdgeRender: () => void
}) => {
  const onCanvasPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (!target) return
    const inUi = target.closest(
      '.wf-node, .wf-resource-panel, .wf-inspector, .ctx-menu, .aiwf-toolbar, .aiwf-inspector-toggle',
    )
    if (inUi) return
    payload.store.commit('clearSelection')
    payload.inspectorOpen.value = false
    if (payload.chatModelKey.value !== 'nanobanana' && payload.chatModelKey.value !== 'seedance') {
      payload.chatCollapsed.value = true
    }
  }

  const onNodeX = (nodeId: string, value: number) => {
    payload.markViewportMotion()
    const node = payload.store.state.nodesById[nodeId]
    if (!node) return
    const next = Number(value)
    if (!Number.isFinite(next)) return
    const dx = next - node.worldX
    if (payload.selectedNodeIds.value.length > 1 && payload.selectedNodeIds.value.includes(nodeId)) {
      payload.store.commit('moveSelectedNodesByDelta', { dx, dy: 0 })
      payload.scheduleAsyncEdgeRender()
      return
    }
    payload.store.commit('setNodePosition', { nodeId, worldX: next })
    payload.scheduleAsyncEdgeRender()
  }

  const onNodeY = (nodeId: string, value: number) => {
    payload.markViewportMotion()
    const node = payload.store.state.nodesById[nodeId]
    if (!node) return
    const next = Number(value)
    if (!Number.isFinite(next)) return
    const dy = next - node.worldY
    if (payload.selectedNodeIds.value.length > 1 && payload.selectedNodeIds.value.includes(nodeId)) {
      payload.store.commit('moveSelectedNodesByDelta', { dx: 0, dy })
      payload.scheduleAsyncEdgeRender()
      return
    }
    payload.store.commit('setNodePosition', { nodeId, worldY: next })
    payload.scheduleAsyncEdgeRender()
  }

  const onSelectNode = (nodeId: string) => {
    if (
      payload.selectedNodeIds.value.length === 1
      && payload.selectedNodeIds.value[0] === nodeId
      && payload.store.state.selectedNodeId === nodeId
    ) {
      const node = payload.store.state.nodesById[nodeId]
      if (node) {
        const nodeType = node.type
        if (nodeType === 'text' || nodeType === 'image' || nodeType === 'video' || nodeType === 'model3d') {
          if (!payload.store.state.nodeChatDialog.visible || payload.store.state.nodeChatDialog.nodeId !== nodeId) {
            payload.store.dispatch('openNodeChatDialog', { nodeId })
          }
        }
      }
      return
    }
    if (payload.selectedNodeIds.value.length > 1 && payload.selectedNodeIds.value.includes(nodeId)) {
      payload.store.commit('setSelectedNodes', { nodeIds: payload.selectedNodeIds.value, primaryNodeId: nodeId })
      payload.store.dispatch('closeNodeChatDialog')
      return
    }
    payload.store.commit('setSelectedNode', { nodeId })
    const node = payload.store.state.nodesById[nodeId]
    if (node) {
      const nodeType = node.type
      if (nodeType === 'text' || nodeType === 'image' || nodeType === 'video' || nodeType === 'model3d') {
        payload.store.dispatch('openNodeChatDialog', { nodeId })
      } else {
        payload.store.dispatch('closeNodeChatDialog')
      }
    }
  }

  const onSelectEdge = (edgeId: string) => {
    payload.store.commit('setSelectedEdge', { edgeId })
  }

  const onCompactNodePointerDown = (nodeId: string, event: PointerEvent, screenToWorld: ScreenToWorldFn) => {
    if (event.button !== 0) return
    const node = payload.store.state.nodesById[nodeId]
    if (!node) return

    event.preventDefault()
    event.stopPropagation()
    onSelectNode(nodeId)

    const target = event.currentTarget as HTMLElement | null
    if (target?.setPointerCapture && Number.isFinite(event.pointerId)) {
      try {
        target.setPointerCapture(event.pointerId)
      } catch {
        // ignore pointer capture failure
      }
    }

    const startClient = { x: event.clientX, y: event.clientY }
    const startWorld = { x: node.worldX, y: node.worldY }
    const moveGroup = payload.selectedNodeIds.value.length > 1 && payload.selectedNodeIds.value.includes(nodeId)
    let prevDx = 0
    let prevDy = 0

    const onMove = (moveEvent: PointerEvent) => {
      const fromWorld = screenToWorld(startClient)
      const toWorld = screenToWorld({ x: moveEvent.clientX, y: moveEvent.clientY })
      const dx = toWorld.x - fromWorld.x
      const dy = toWorld.y - fromWorld.y
      payload.markViewportMotion()
      if (moveGroup) {
        const stepDx = dx - prevDx
        const stepDy = dy - prevDy
        prevDx = dx
        prevDy = dy
        if (Math.abs(stepDx) > 0 || Math.abs(stepDy) > 0) {
          payload.store.commit('moveSelectedNodesByDelta', { dx: stepDx, dy: stepDy })
        }
      } else {
        payload.store.commit('setNodePosition', {
          nodeId,
          worldX: startWorld.x + dx,
          worldY: startWorld.y + dy,
        })
      }
      payload.scheduleAsyncEdgeRender()
    }

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
      if (target?.releasePointerCapture && Number.isFinite(event.pointerId)) {
        try {
          target.releasePointerCapture(event.pointerId)
        } catch {
          // ignore release failure
        }
      }
    }

    const onUp = () => {
      cleanup()
    }

    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
  }

  const onBoxSelect = (boxPayload: { worldRect: { x0: number; y0: number; x1: number; y1: number } }) => {
    const worldRect = boxPayload?.worldRect
    if (!worldRect) return
    const hits = hitTestNodesInWorldRect(payload.store.state, worldRect)
    payload.store.commit('setSelectedNodes', { nodeIds: hits, primaryNodeId: hits[0] ?? null })
  }

  const onNodeSizeChange = (nodeId: string, width?: number, height?: number) => {
    payload.store.commit('setNodeSize', { nodeId, width, height })
    payload.scheduleAsyncEdgeRender()
  }

  const onFocusNode = (nodeId: string) => {
    const node = payload.store.state.nodesById[nodeId]
    if (!node) return
    const zoom = payload.store.state.viewport.zoom
    payload.store.commit('setViewport', { zoom, panX: -node.worldX * zoom, panY: -node.worldY * zoom })
  }

  return {
    onCanvasPointerDown,
    onNodeX,
    onNodeY,
    onSelectNode,
    onSelectEdge,
    onCompactNodePointerDown,
    onBoxSelect,
    onNodeSizeChange,
    onFocusNode,
  }
}
