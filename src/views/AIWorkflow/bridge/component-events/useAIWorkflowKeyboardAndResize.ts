const isEditableEventTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null
  if (!element) return false
  if (element.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) return true
  if (element.closest('[data-aiwf-text-selectable="true"]')) return true
  return false
}

export const useAIWorkflowKeyboardAndResize = (payload: {
  isRouteActive: () => boolean
  getSelectedNodeIds: () => string[]
  getSelectedEdgeId: () => string | null
  selectAllNodes: () => void
  pasteNodesAtCanvasCenter: () => void
  copySelectedNodes: (primaryNodeId: string) => void
  undo: () => void
  redo: () => void
  removeSelectedNodes: (nodeIds: string[]) => void
  removeSelectedEdge: (edgeId: string) => void
  scheduleAsyncEdgeRender: () => void
}) => {
  const onWorkflowKeyDown = (ev: KeyboardEvent) => {
    if (!payload.isRouteActive()) return
    if (isEditableEventTarget(ev.target ?? null)) return

    const activeEl = document.activeElement as HTMLElement | null
    if (activeEl?.dataset?.wfSceneLayoutCanvas === 'true') return

    const key = String(ev.key || '').toLowerCase()
    const mod = ev.ctrlKey || ev.metaKey

    if (mod && key === 'a') {
      ev.preventDefault()
      payload.selectAllNodes()
      return
    }

    if (mod && key === 'c') {
      ev.preventDefault()
      const selected = payload.getSelectedNodeIds()
      if (selected.length > 0) {
        payload.copySelectedNodes(selected[0])
      }
      return
    }

    if (mod && key === 'v') {
      ev.preventDefault()
      payload.pasteNodesAtCanvasCenter()
      return
    }

    if (mod && key === 'z') {
      ev.preventDefault()
      if (ev.shiftKey) {
        payload.redo()
      } else {
        payload.undo()
      }
      return
    }

    if (mod && key === 'y') {
      ev.preventDefault()
      payload.redo()
      return
    }

    if (key === 'backspace' || key === 'delete') {
      const selected = payload.getSelectedNodeIds()
      if (!selected.length) {
        const selectedEdgeId = String(payload.getSelectedEdgeId() ?? '').trim()
        if (!selectedEdgeId) return
        ev.preventDefault()
        payload.removeSelectedEdge(selectedEdgeId)
        return
      }
      ev.preventDefault()
      payload.removeSelectedNodes(selected)
    }
  }

  const onContentResize = () => {
    payload.scheduleAsyncEdgeRender()
  }

  const mountWindowEvents = () => {
    window.addEventListener('keydown', onWorkflowKeyDown, true)
    window.addEventListener('dweb:content/resize', onContentResize as EventListener, true)
  }

  const unmountWindowEvents = () => {
    window.removeEventListener('keydown', onWorkflowKeyDown, true)
    window.removeEventListener('dweb:content/resize', onContentResize as EventListener, true)
  }

  return {
    onWorkflowKeyDown,
    onContentResize,
    mountWindowEvents,
    unmountWindowEvents,
  }
}
