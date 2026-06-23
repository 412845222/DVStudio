import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { Store } from 'vuex'
import { anchorKind, anchorKindLabel, canLinkAnchors } from '../../../../aiworkflow/domain/link/anchorKinds'
import type { WorkflowAnchorSpec, WorkflowNode, WorkflowState } from '../../../../aiworkflow/types'
import type { AIWorkflowDraftRender } from '../useAIWorkflowEdgeRenderer'
import { useWorkflowAnchorMagnet, type WorkflowAnchorMagnetCandidate, type WorkflowAnchorMagnetTarget } from './useWorkflowAnchorMagnet'

type LinkDraft = {
  fromNodeId: string
  fromAnchorId: string
  fromAnchorIndex: number
  startCanvas: { x: number; y: number }
  endCanvas: { x: number; y: number }
}

type DropTarget = {
  nodeId: string
  anchorId: string
  anchorIndex: number
  direction: 'in' | 'out'
  element?: HTMLElement | null
  centerClient?: { x: number; y: number }
  centerCanvas?: { x: number; y: number }
  distance?: number
  phase?: 'idle' | 'armed' | 'snapped' | 'dragging' | 'release'
  screenMagnetX?: number
  screenMagnetY?: number
  magnetX?: number
  magnetY?: number
}

type TooltipState = {
  visible: boolean
  type: string
  direction: 'in' | 'out'
  label?: string
  acceptedTypes?: string[]
  compatible?: boolean
  position: { x: number; y: number }
}

export type ScreenToWorldFn = (point: { x: number; y: number }) => { x: number; y: number }

export const useAIWorkflowLinking = (payload: {
  store: Store<WorkflowState>
  nodes: Ref<WorkflowNode[]>
  chatModelKey: Ref<string>
  nanoAnchorNodeId: string
  scheduleAsyncEdgeRender: () => void
  clientToCanvasPoint: (client: { x: number; y: number }) => { x: number; y: number } | null
  getWorkflowWorldToCanvas: () => (point: { x: number; y: number }) => { x: number; y: number }
  resolveInputAnchorCanvasPoint?: (args: {
    nodeId: string
    anchorId: string
    anchorIndex: number
  }) => { x: number; y: number } | null
  anchorWorld: (
    node: WorkflowNode,
    kind: 'in' | 'out',
    anchorIndex: number,
    anchorCount: number,
    anchor?: Pick<WorkflowAnchorSpec, 'offsetY'>,
  ) => { x: number; y: number }
  buildPath: (start: { x: number; y: number }, end: { x: number; y: number }) => string
  pushToast: (message: string, type?: 'info' | 'warn' | 'error') => void
  onLinkConnected?: (payload: {
    fromNodeId: string
    fromAnchorId: string
    toNodeId: string
    toAnchorId: string
  }) => void
  onLinkDropOnCanvas?: (payload: {
    fromNodeId: string
    fromAnchorId: string
    clientX: number
    clientY: number
    worldX: number
    worldY: number
  }) => void
}) => {
  const linkDraft = ref<LinkDraft | null>(null)
  const dropTarget = ref<DropTarget | null>(null)
  const tooltipState = ref<TooltipState | null>(null)
  const anchorCompatibility = ref<Record<string, boolean | null>>({})
  let cleanupLink: (() => void) | null = null
  const magnet = useWorkflowAnchorMagnet()
  let lastMagnetEl: HTMLElement | null = null
  let sourceMagnetEl: HTMLElement | null = null
  let sourceDragOriginClient: { x: number; y: number } | null = null
  let releaseTimers: Array<ReturnType<typeof setTimeout>> = []
  let hoverRafId: number | null = null
  let lastHoverPointer: { x: number; y: number } | null = null
  let activeScreenToWorld: ScreenToWorldFn | null = null
  const isPanning = ref(false)
  const HOVER_THROTTLE_MS = 50
  let lastHoverTime = 0

  watch(
    () => payload.store.state.viewport.zoom,
    (z) => {
      magnet.setZoom(Number(z) || 1)
    },
    { immediate: true },
  )

  const clearLinkInteraction = () => {
    if (cleanupLink) cleanupLink()
    cleanupLink = null
    magnet.setDragging(false)
    clearReleaseTimers()
    if (lastMagnetEl) {
      scheduleAnchorRelease(lastMagnetEl)
      lastMagnetEl = null
    }
    if (sourceMagnetEl) {
      scheduleAnchorRelease(sourceMagnetEl)
      sourceMagnetEl = null
    }
    sourceDragOriginClient = null
    activeScreenToWorld = null
    linkDraft.value = null
    dropTarget.value = null
    tooltipState.value = null
    anchorCompatibility.value = {}
  }

  const attrEscape = (value: string) => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')

  function clearReleaseTimers() {
    for (const timer of releaseTimers) clearTimeout(timer)
    releaseTimers = []
  }

  const clearMagnetOnElement = (el: HTMLElement | null) => {
    if (!el) return
    el.dataset.magnetPhase = 'idle'
    el.style.removeProperty('--wf-anchor-magnet-x')
    el.style.removeProperty('--wf-anchor-magnet-y')
    el.style.removeProperty('--wf-handle-magnet-x')
    el.style.removeProperty('--wf-handle-magnet-y')
  }

  const scheduleAnchorRelease = (el: HTMLElement | null) => {
    if (!el) return
    el.dataset.magnetPhase = 'release'
    el.style.setProperty('--wf-anchor-magnet-x', '0px')
    el.style.setProperty('--wf-anchor-magnet-y', '0px')
    el.style.setProperty('--wf-handle-magnet-x', '0px')
    el.style.setProperty('--wf-handle-magnet-y', '0px')
    const timer = setTimeout(() => {
      if (el.isConnected) clearMagnetOnElement(el)
      releaseTimers = releaseTimers.filter((item) => item !== timer)
    }, 160)
    releaseTimers.push(timer)
  }

  const anchorElement = (nodeId: string, anchorId: string, direction: 'in' | 'out'): HTMLElement | null => {
    if (typeof document === 'undefined') return null
    const selector = [
      `[data-wf-node-id="${attrEscape(String(nodeId ?? ''))}"]`,
      `[data-wf-anchor-id="${attrEscape(String(anchorId ?? ''))}"]`,
      `[data-wf-dir="${direction}"]`,
    ].join('')
    const el = document.querySelector(selector)
    return el instanceof HTMLElement ? el : null
  }

  const anchorCenterClient = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  const anchorCenterCanvas = (el: HTMLElement) => payload.clientToCanvasPoint(anchorCenterClient(el))

  const collectAnchorCandidates = (args: {
    directions?: Array<'in' | 'out'>
    legalOnly?: boolean
  } = {}): WorkflowAnchorMagnetCandidate[] => {
    if (typeof document === 'undefined') return []
    const directions = new Set(args.directions ?? ['in', 'out'])
    const candidates: WorkflowAnchorMagnetCandidate[] = []
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-wf-node-id][data-wf-anchor-id][data-wf-dir]'))
    for (const el of elements) {
      const direction = String(el.dataset.wfDir ?? '') === 'out' ? 'out' : 'in'
      if (!directions.has(direction)) continue
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      const nodeId = String(el.dataset.wfNodeId ?? '').trim()
      const anchorId = String(el.dataset.wfAnchorId ?? '').trim()
      if (!nodeId || !anchorId) continue
      if (args.legalOnly && linkDraft.value && direction === 'in') {
        if (!canLinkAnchors(
          payload.store.state.nodesById,
          linkDraft.value.fromNodeId,
          linkDraft.value.fromAnchorId,
          nodeId,
          anchorId,
        )) continue
      }
      const rawIndex = Number(el.dataset.wfAnchorIndex)
      candidates.push({
        nodeId,
        anchorId,
        anchorIndex: Number.isFinite(rawIndex) ? rawIndex : 0,
        direction,
        center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        element: el,
      })
    }
    return candidates
  }

  const toDropTarget = (target: WorkflowAnchorMagnetTarget): DropTarget => {
    const centerCanvas = target.element ? anchorCenterCanvas(target.element) : payload.clientToCanvasPoint(target.center)
    return {
      nodeId: target.nodeId,
      anchorId: target.anchorId,
      anchorIndex: target.anchorIndex,
      direction: target.direction,
      element: target.element,
      centerClient: target.center,
      centerCanvas: centerCanvas ?? undefined,
      distance: target.distance,
      phase: target.phase,
      screenMagnetX: target.screenMagnetX,
      screenMagnetY: target.screenMagnetY,
      magnetX: target.magnetX,
      magnetY: target.magnetY,
    }
  }

  const applyMagnetVisual = (target: DropTarget | null) => {
    clearReleaseTimers()
    if (!target) {
      if (lastMagnetEl) {
        scheduleAnchorRelease(lastMagnetEl)
        lastMagnetEl = null
      }
      return
    }

    const el = target.element ?? anchorElement(target.nodeId, target.anchorId, target.direction)
    if (!el) {
      if (lastMagnetEl) {
        scheduleAnchorRelease(lastMagnetEl)
        lastMagnetEl = null
      }
      return
    }

    if (lastMagnetEl && lastMagnetEl !== el) {
      scheduleAnchorRelease(lastMagnetEl)
    }

    el.dataset.magnetPhase = String(target.phase ?? 'idle')
    // During link drag, keep input anchors visually stable (highlight/phase only)
    // to avoid endpoint jitter caused by animated DOM center re-sampling.
    const suppressInputShift = Boolean(linkDraft.value) && target.direction === 'in'
    const magnetX = suppressInputShift ? 0 : (Number(target.magnetX ?? 0) || 0)
    const magnetY = suppressInputShift ? 0 : (Number(target.magnetY ?? 0) || 0)
    el.style.setProperty('--wf-anchor-magnet-x', `${magnetX}px`)
    el.style.setProperty('--wf-anchor-magnet-y', `${magnetY}px`)
    el.style.setProperty('--wf-handle-magnet-x', `${magnetX}px`)
    el.style.setProperty('--wf-handle-magnet-y', `${magnetY}px`)
    lastMagnetEl = el
  }

  const updateTooltipState = (target: DropTarget | null) => {
    if (!target || !linkDraft.value) {
      tooltipState.value = null
      anchorCompatibility.value = {}
      return
    }

    const targetNode = payload.store.state.nodesById[target.nodeId]
    if (!targetNode) {
      tooltipState.value = null
      anchorCompatibility.value = {}
      return
    }

    const anchors = target.direction === 'in' ? targetNode.inputs : targetNode.outputs
    const anchor = anchors.find((a) => a.id === target.anchorId)
    if (!anchor) {
      tooltipState.value = null
      anchorCompatibility.value = {}
      return
    }

    const el = target.element ?? anchorElement(target.nodeId, target.anchorId, target.direction)
    if (!el) {
      tooltipState.value = null
      anchorCompatibility.value = {}
      return
    }

    const rect = el.getBoundingClientRect()
    const compatible = canLinkAnchors(
      payload.store.state.nodesById,
      linkDraft.value.fromNodeId,
      linkDraft.value.fromAnchorId,
      target.nodeId,
      target.anchorId,
    )

    const targetKey = `${target.nodeId}-${target.direction}-${target.anchorId}`
    const sourceKey = `${linkDraft.value.fromNodeId}-out-${linkDraft.value.fromAnchorId}`
    anchorCompatibility.value = {
      [targetKey]: compatible,
      [sourceKey]: compatible,
    }

    tooltipState.value = {
      visible: true,
      type: anchor.mediaType ?? 'generic',
      direction: target.direction,
      label: anchor.label,
      acceptedTypes: anchor.acceptedMediaTypes,
      compatible,
      position: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      },
    }
  }

  const runHoverMagnet = () => {
    hoverRafId = null
    if (linkDraft.value || !lastHoverPointer) return
    const target = magnet.resolveTarget({
      candidates: collectAnchorCandidates({ directions: ['in', 'out'] }),
      pointer: lastHoverPointer,
      dragging: false,
    })
    applyMagnetVisual(target ? toDropTarget(target) : null)
  }

  const onHoverPointerMove = (event: PointerEvent) => {
    if (linkDraft.value || isPanning.value) return
    
    const canvasEl = document.querySelector('.bp-wrap')
    if (!canvasEl) return
    
    const rect = canvasEl.getBoundingClientRect()
    const padding = 20
    if (
      event.clientX < rect.left - padding ||
      event.clientX > rect.right + padding ||
      event.clientY < rect.top - padding ||
      event.clientY > rect.bottom + padding
    ) {
      return
    }
    
    const now = Date.now()
    if (now - lastHoverTime < HOVER_THROTTLE_MS) return
    lastHoverTime = now
    
    lastHoverPointer = { x: event.clientX, y: event.clientY }
    if (hoverRafId != null) return
    hoverRafId = requestAnimationFrame(runHoverMagnet)
  }

  const onHoverPointerLeave = () => {
    lastHoverPointer = null
    if (hoverRafId != null) {
      cancelAnimationFrame(hoverRafId)
      hoverRafId = null
    }
    if (!linkDraft.value) applyMagnetVisual(null)
  }

  watch(
    () => [linkDraft.value, dropTarget.value],
    () => {
      applyMagnetVisual(dropTarget.value)
      updateTooltipState(dropTarget.value)
      payload.scheduleAsyncEdgeRender()
    },
    { deep: true, flush: 'post' },
  )

  const nanoHoverAnchorId = computed(() => {
    if (payload.chatModelKey.value !== 'nanobanana' && payload.chatModelKey.value !== 'seedance') return null
    if (!dropTarget.value) return null
    if (dropTarget.value.nodeId !== payload.nanoAnchorNodeId) return null
    return dropTarget.value.anchorId
  })

  const hoverInputAnchorId = (nodeId: string) => {
    if (!dropTarget.value) return null
    return dropTarget.value.nodeId === nodeId ? dropTarget.value.anchorId : null
  }

  const hoverOutputAnchorId = (nodeId: string) => {
    if (!linkDraft.value) return null
    return linkDraft.value.fromNodeId === nodeId ? linkDraft.value.fromAnchorId : null
  }

  const findDropTarget = (clientPoint: { x: number; y: number }) => {
    const target = magnet.resolveTarget({
      candidates: collectAnchorCandidates({ directions: ['in'], legalOnly: false }),
      pointer: clientPoint,
      dragging: false,
    })
    return target ? toDropTarget(target) : null
  }

  const applySourceDragVisual = (_clientPoint: { x: number; y: number }) => {
    if (!sourceMagnetEl) return
    sourceMagnetEl.dataset.magnetPhase = 'dragging'
    sourceMagnetEl.style.setProperty('--wf-anchor-magnet-x', `0px`)
    sourceMagnetEl.style.setProperty('--wf-anchor-magnet-y', `0px`)
    sourceMagnetEl.style.setProperty('--wf-handle-magnet-x', `0px`)
    sourceMagnetEl.style.setProperty('--wf-handle-magnet-y', `0px`)
  }

  const onStartLink = (
    startPayload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent },
    screenToWorld: ScreenToWorldFn,
  ) => {
    const node = payload.store.state.nodesById[startPayload.nodeId]
    if (!node) return
    const endCanvas = payload.clientToCanvasPoint({
      x: startPayload.event.clientX,
      y: startPayload.event.clientY,
    })
    if (!endCanvas) return

    linkDraft.value = {
      fromNodeId: startPayload.nodeId,
      fromAnchorId: startPayload.anchorId,
      fromAnchorIndex: startPayload.anchorIndex,
      startCanvas: endCanvas,
      endCanvas,
    }
    activeScreenToWorld = screenToWorld
    magnet.setDragging(true)
    const nextSourceEl = anchorElement(startPayload.nodeId, startPayload.anchorId, 'out')
    if (lastMagnetEl && lastMagnetEl !== nextSourceEl) scheduleAnchorRelease(lastMagnetEl)
    lastMagnetEl = null
    sourceMagnetEl = nextSourceEl
    if (sourceMagnetEl) {
      sourceMagnetEl.dataset.magnetPhase = 'dragging'
      sourceMagnetEl.style.setProperty('--wf-anchor-magnet-x', '0px')
      sourceMagnetEl.style.setProperty('--wf-anchor-magnet-y', '0px')
      sourceMagnetEl.style.setProperty('--wf-handle-magnet-x', '0px')
      sourceMagnetEl.style.setProperty('--wf-handle-magnet-y', '0px')
      sourceDragOriginClient = anchorCenterClient(sourceMagnetEl)
    } else {
      sourceDragOriginClient = null
    }

    const sourceCenterCanvas = (() => {
      const worldToCanvas = payload.getWorkflowWorldToCanvas()
      const fromAnchor = node.outputs?.[Math.max(0, startPayload.anchorIndex)]
      return worldToCanvas(
        payload.anchorWorld(
          node,
          'out',
          Math.max(0, startPayload.anchorIndex),
          node.outputs.length,
          fromAnchor,
        ),
      )
    })()

    if (sourceCenterCanvas) {
      linkDraft.value.startCanvas = sourceCenterCanvas
    }

    const onMove = (event: PointerEvent) => {
      if (!linkDraft.value) return
      event.preventDefault()
      const next = payload.clientToCanvasPoint({ x: event.clientX, y: event.clientY })
      if (!next) return
      applySourceDragVisual({ x: event.clientX, y: event.clientY })
      const nextTarget = findDropTarget({ x: event.clientX, y: event.clientY })
      dropTarget.value = nextTarget
      const snappedCanvas = nextTarget && (nextTarget.phase === 'snapped' || nextTarget.distance === 0) && nextTarget.centerCanvas
        ? {
          x: nextTarget.centerCanvas.x,
          y: nextTarget.centerCanvas.y,
        }
        : null
      linkDraft.value.endCanvas = snappedCanvas ?? next
    }

    const onUp = (event: PointerEvent) => {
      if (linkDraft.value && dropTarget.value && dropTarget.value.direction === 'in') {
        connectDropTarget(dropTarget.value)
      } else if (linkDraft.value && !dropTarget.value) {
        const canvasPoint = payload.clientToCanvasPoint({ x: event.clientX, y: event.clientY })
        if (canvasPoint) {
          const worldPoint = activeScreenToWorld
            ? activeScreenToWorld({ x: canvasPoint.x, y: canvasPoint.y })
            : (() => {
              const zoom = Number(payload.store.state.viewport.zoom) || 1
              const panX = Number(payload.store.state.viewport.panX) || 0
              const panY = Number(payload.store.state.viewport.panY) || 0
              return {
                x: (canvasPoint.x - panX) / zoom,
                y: (canvasPoint.y - panY) / zoom,
              }
            })()
          payload.onLinkDropOnCanvas?.({
            fromNodeId: linkDraft.value.fromNodeId,
            fromAnchorId: linkDraft.value.fromAnchorId,
            clientX: event.clientX,
            clientY: event.clientY,
            worldX: worldPoint.x,
            worldY: worldPoint.y,
          })
        }
      }
      clearLinkInteraction()
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp, { once: true })
    window.addEventListener('pointercancel', onUp, { once: true })
    cleanupLink = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pointermove', onHoverPointerMove, { passive: true })
    window.addEventListener('blur', onHoverPointerLeave)
  }

  const connectDropTarget = (target: DropTarget) => {
    if (!linkDraft.value) return
    if (!canLinkAnchors(
      payload.store.state.nodesById,
      linkDraft.value.fromNodeId,
      linkDraft.value.fromAnchorId,
      target.nodeId,
      target.anchorId,
    )) {
      const fromNode = payload.store.state.nodesById[linkDraft.value.fromNodeId]
      const toNode = payload.store.state.nodesById[target.nodeId]
      const fromKind = anchorKind(fromNode, linkDraft.value.fromAnchorId, 'out')
      const toKind = anchorKind(toNode, target.anchorId, 'in')
      payload.pushToast(
        `锚点类型不匹配：${anchorKindLabel(fromKind)} → ${anchorKindLabel(toKind)}。resource 输入可接收 image/video/resource。`,
        'warn',
      )
      clearLinkInteraction()
      return
    }

    const fromNodeId = linkDraft.value.fromNodeId
    const fromAnchorId = linkDraft.value.fromAnchorId
    const toNodeId = target.nodeId
    const toAnchorId = target.anchorId

    payload.store.commit('addEdge', {
      fromNodeId,
      fromAnchorId,
      toNodeId,
      toAnchorId,
    })

    payload.onLinkConnected?.({
      fromNodeId,
      fromAnchorId,
      toNodeId,
      toAnchorId,
    })

    clearLinkInteraction()
  }

  const onEndLink = (endPayload: { nodeId: string; anchorId: string; anchorIndex: number }) => {
    if (!linkDraft.value) return
    if (
      !canLinkAnchors(
        payload.store.state.nodesById,
        linkDraft.value.fromNodeId,
        linkDraft.value.fromAnchorId,
        endPayload.nodeId,
        endPayload.anchorId,
      )
    ) {
      const fromNode = payload.store.state.nodesById[linkDraft.value.fromNodeId]
      const toNode = payload.store.state.nodesById[endPayload.nodeId]
      const fromKind = anchorKind(fromNode, linkDraft.value.fromAnchorId, 'out')
      const toKind = anchorKind(toNode, endPayload.anchorId, 'in')
      payload.pushToast(
        `锚点类型不匹配：${anchorKindLabel(fromKind)} → ${anchorKindLabel(toKind)}。resource 输入可接收 image/video/resource。`,
        'warn',
      )
      clearLinkInteraction()
      return
    }

    const fromNodeId = linkDraft.value.fromNodeId
    const fromAnchorId = linkDraft.value.fromAnchorId
    const toNodeId = endPayload.nodeId
    const toAnchorId = endPayload.anchorId

    payload.store.commit('addEdge', {
      fromNodeId,
      fromAnchorId,
      toNodeId,
      toAnchorId,
    })

    payload.onLinkConnected?.({
      fromNodeId,
      fromAnchorId,
      toNodeId,
      toAnchorId,
    })

    clearLinkInteraction()
  }

  const draftRender = (_worldToScreen: (point: { x: number; y: number }) => { x: number; y: number }): AIWorkflowDraftRender => {
    if (!linkDraft.value) return null
    const fromNode = payload.store.state.nodesById[linkDraft.value.fromNodeId]
    if (!fromNode) return null
    const kind = anchorKind(fromNode, linkDraft.value.fromAnchorId, 'out')
    const stroke =
      kind === 'flow'
        ? '#d77f4f'
        : kind === 'text'
          ? '#3aa8b4'
          : kind === 'video'
            ? '#3aa8b4'
            : kind === 'image'
              ? '#3aa8b4'
              : '#3aa8b4'
    const strokeWidth = kind === 'flow' ? 3.5 : 2.5
    const start = linkDraft.value.startCanvas
    const end = linkDraft.value.endCanvas
    return { path: payload.buildPath(start, end), stroke, strokeWidth }
  }

  onBeforeUnmount(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', onHoverPointerMove)
      window.removeEventListener('blur', onHoverPointerLeave)
    }
    if (hoverRafId != null) cancelAnimationFrame(hoverRafId)
    clearLinkInteraction()
    clearReleaseTimers()
  })

  const setPanning = (panning: boolean) => {
    isPanning.value = panning
  }

  return {
    nanoHoverAnchorId,
    hoverInputAnchorId,
    hoverOutputAnchorId,
    onStartLink,
    onEndLink,
    draftRender,
    tooltipState,
    anchorCompatibility,
    isLinking: computed(() => !!linkDraft.value),
    linkingFromNodeId: computed(() => linkDraft.value?.fromNodeId ?? null),
    linkingHoverNodeId: computed(() => dropTarget.value?.nodeId ?? null),
    setPanning,
  }
}