import { onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
import type { WorkflowEdge } from '../../../aiworkflow/types'

export type AIWorkflowEdgeRender = {
  id: string
  start: { x: number; y: number }
  end: { x: number; y: number }
  path: string
  stroke?: string
  strokeWidth?: number
}

export type AIWorkflowDraftRender = {
  path: string
  stroke?: string
  strokeWidth?: number
} | null

export const useAIWorkflowEdgeRenderer = (payload: {
  viewport: Ref<{ zoom: number; panX: number; panY: number }>
  canvasViewportSize: Ref<{ width: number; height: number }>
  viewportMotionActive?: Ref<boolean>
  renderEdges: Ref<WorkflowEdge[]>
  edgeRenders: (worldToScreen: (point: { x: number; y: number }) => { x: number; y: number }) => AIWorkflowEdgeRender[]
  draftRender: (worldToScreen: (point: { x: number; y: number }) => { x: number; y: number }) => AIWorkflowDraftRender
  keepEdgeIds?: Ref<string[]>
  preferWorker?: Ref<boolean>
  workerMutationEpoch?: Ref<string>
  buildEdgeWorkerInput?: () => {
    nodes: Array<{
      id: string
      type: string
      worldX: number
      worldY: number
      width: number
      inputs: Array<{ id: string; offsetY?: number }>
      outputs: Array<{ id: string; offsetY?: number }>
    }>
    edges: Array<{
      id: string
      fromNodeId: string
      fromAnchorId: string
      toNodeId: string
      toAnchorId: string
    }>
    stats?: {
      inputCount: number
      renderedCount: number
      culledCount: number
    }
  }
}) => {
  const asyncEdgeRenders = shallowRef<AIWorkflowEdgeRender[]>([])
  const asyncDraftRender = shallowRef<AIWorkflowDraftRender>(null)
  const perfEdgeComputeMs = ref(0)
  const perfEdgeCulledCount = ref(0)
  const perfEdgeRenderedCount = ref(0)
  const perfEdgeInputCount = ref(0)
  let disposed = false
  let edgeRenderRaf = 0
  let edgeWorkerApplyRaf = 0
  let edgePathWorker: Worker | null = null
  let edgeWorkerReady = false
  let edgeWorkerVersion = 0
  let edgeWorkerLastAppliedVersion = 0
  let edgeWorkerMutationVersion = 0
  let edgeWorkerPausedUntil = 0
  const edgeWorkerStartedAt = new Map<number, number>()
  const edgeWorkerMutationByVersion = new Map<number, number>()
  let pendingWorkerVersion = 0
  let pendingWorkerEdges: AIWorkflowEdgeRender[] | null = null
  let lastAppliedEdgeSignature = ''

  const EDGE_WORKER_SETTLE_MS = 160

  const isViewportMotionActive = () => payload.viewportMotionActive?.value === true

  const edgeRenderSignature = (edges: AIWorkflowEdgeRender[]) => {
    if (!edges.length) return '0'
    let hash = edges.length * 131
    for (const edge of edges) {
      const id = String(edge.id ?? '')
      for (let i = 0; i < id.length; i += 1) hash = (hash * 33 + id.charCodeAt(i)) % 2147483647
      hash = (hash + Math.round((Number(edge.start?.x) || 0) * 10)) % 2147483647
      hash = (hash + Math.round((Number(edge.start?.y) || 0) * 10)) % 2147483647
      hash = (hash + Math.round((Number(edge.end?.x) || 0) * 10)) % 2147483647
      hash = (hash + Math.round((Number(edge.end?.y) || 0) * 10)) % 2147483647
    }
    return `${edges.length}:${hash}`
  }

  const flushWorkerResult = () => {
    edgeWorkerApplyRaf = 0
    if (disposed) return
    if (!pendingWorkerEdges) return
    if (isViewportMotionActive()) {
      pendingWorkerEdges = null
      return
    }
    const nextVersion = pendingWorkerVersion
    const nextMutationVersion = edgeWorkerMutationByVersion.get(nextVersion) ?? -1
    const nextEdges = pendingWorkerEdges
    pendingWorkerEdges = null
    if (nextMutationVersion !== edgeWorkerMutationVersion) {
      edgeWorkerStartedAt.delete(nextVersion)
      edgeWorkerMutationByVersion.delete(nextVersion)
      return
    }
    const signature = edgeRenderSignature(nextEdges)
    if (signature !== lastAppliedEdgeSignature) {
      lastAppliedEdgeSignature = signature
      asyncEdgeRenders.value = nextEdges
    }
    const startedAt = edgeWorkerStartedAt.get(nextVersion)
    if (typeof startedAt === 'number') {
      perfEdgeComputeMs.value = Math.max(0, performance.now() - startedAt)
      edgeWorkerStartedAt.delete(nextVersion)
    }
    edgeWorkerMutationByVersion.delete(nextVersion)
  }

  const scheduleWorkerResultApply = () => {
    if (disposed) return
    if (edgeWorkerApplyRaf) return
    edgeWorkerApplyRaf = requestAnimationFrame(flushWorkerResult)
  }

  const resetEdgeWorker = () => {
    if (edgeWorkerApplyRaf) cancelAnimationFrame(edgeWorkerApplyRaf)
    edgeWorkerApplyRaf = 0
    pendingWorkerEdges = null
    pendingWorkerVersion = 0
    edgeWorkerStartedAt.clear()
    edgeWorkerMutationByVersion.clear()
    if (edgePathWorker) {
      try {
        edgePathWorker.terminate()
      } catch {
        // ignore
      }
    }
    edgePathWorker = null
    edgeWorkerReady = false
  }

  const workflowWorldToCanvas = (point: { x: number; y: number }) => {
    const viewportWidth = payload.canvasViewportSize.value.width
    const viewportHeight = payload.canvasViewportSize.value.height
    const zoom = Math.max(0.01, Number(payload.viewport.value.zoom) || 1)
    return {
      x: viewportWidth / 2 + (Number(payload.viewport.value.panX) || 0) + point.x * zoom,
      y: viewportHeight / 2 + (Number(payload.viewport.value.panY) || 0) + point.y * zoom,
    }
  }

  const ensureEdgeWorker = () => {
    if (edgePathWorker) return edgePathWorker
    if (typeof Worker === 'undefined') return null
    try {
      edgePathWorker = new Worker(new URL('./workers/edgePathWorker.ts', import.meta.url), {
        type: 'module',
      })
      edgePathWorker.onmessage = (ev: MessageEvent<any>) => {
        if (disposed) return
        const msg = ev?.data
        if (!msg || msg.type !== 'result') return
        const version = Number(msg.version) || 0
        const mutationVersion = Number(msg.mutationVersion) || 0
        if (version < edgeWorkerLastAppliedVersion) return
        if (mutationVersion !== edgeWorkerMutationVersion) {
          edgeWorkerStartedAt.delete(version)
          edgeWorkerMutationByVersion.delete(version)
          return
        }
        edgeWorkerLastAppliedVersion = version
        edgeWorkerReady = true
        pendingWorkerVersion = version
        pendingWorkerEdges = Array.isArray(msg.edges) ? msg.edges : []
        const stats = msg?.stats && typeof msg.stats === 'object' ? msg.stats : null
        if (stats) {
          perfEdgeCulledCount.value = Math.max(0, Number(stats.culledCount) || 0)
          perfEdgeRenderedCount.value = Math.max(0, Number(stats.renderedCount) || 0)
          perfEdgeInputCount.value = Math.max(0, Number(stats.inputCount) || 0)
        }
        scheduleWorkerResultApply()
      }
      edgePathWorker.onerror = () => {
        edgeWorkerReady = false
      }
      return edgePathWorker
    } catch {
      edgePathWorker = null
      edgeWorkerReady = false
      return null
    }
  }

  const computeWithMainThread = () => {
    const startedAt = performance.now()
    const nextEdges = payload.edgeRenders(workflowWorldToCanvas)
    perfEdgeInputCount.value = nextEdges.length
    perfEdgeRenderedCount.value = nextEdges.length
    perfEdgeCulledCount.value = 0
    const signature = edgeRenderSignature(nextEdges)
    if (signature !== lastAppliedEdgeSignature) {
      lastAppliedEdgeSignature = signature
      asyncEdgeRenders.value = nextEdges
    }
    perfEdgeComputeMs.value = performance.now() - startedAt
  }

  const canUseWorkerPath = () => {
    if (!payload.buildEdgeWorkerInput) return false
    if (payload.preferWorker && payload.preferWorker.value !== true) return false
    if (performance.now() < edgeWorkerPausedUntil) return false
    return true
  }

  const computeWithWorker = () => {
    if (!canUseWorkerPath()) {
      computeWithMainThread()
      return
    }
    const worker = ensureEdgeWorker()
    if (!worker) {
      computeWithMainThread()
      return
    }
    const input = payload.buildEdgeWorkerInput?.()
    if (!input) {
      computeWithMainThread()
      return
    }
    const version = ++edgeWorkerVersion
    const mutationVersion = edgeWorkerMutationVersion
    const keepEdgeIds = Array.isArray(payload.keepEdgeIds?.value)
      ? payload.keepEdgeIds!.value.map((id) => String(id ?? '').trim()).filter(Boolean)
      : []
    edgeWorkerStartedAt.set(version, performance.now())
    edgeWorkerMutationByVersion.set(version, mutationVersion)
    try {
      worker.postMessage({
        type: 'compute',
        version,
        mutationVersion,
        viewport: {
          zoom: Number(payload.viewport.value.zoom) || 1,
          panX: Number(payload.viewport.value.panX) || 0,
          panY: Number(payload.viewport.value.panY) || 0,
        },
        canvasViewportSize: {
          width: Number(payload.canvasViewportSize.value.width) || 0,
          height: Number(payload.canvasViewportSize.value.height) || 0,
        },
        nodes: input.nodes,
        edges: input.edges,
        keepEdgeIds,
      })
    } catch {
      edgeWorkerReady = false
      computeWithMainThread()
    }
  }

  const rebuildAsyncEdgeRenders = () => {
    if (disposed) return
    edgeRenderRaf = 0
    computeWithWorker()
    asyncDraftRender.value = payload.draftRender(workflowWorldToCanvas)
  }

  const rebuildSyncEdgeRenders = () => {
    if (disposed) return
    if (edgeRenderRaf) {
      cancelAnimationFrame(edgeRenderRaf)
      edgeRenderRaf = 0
    }
    computeWithMainThread()
    asyncDraftRender.value = payload.draftRender(workflowWorldToCanvas)
  }

  const scheduleAsyncEdgeRender = () => {
    if (disposed) return
    if (isViewportMotionActive()) {
      rebuildSyncEdgeRenders()
      return
    }
    if (edgeRenderRaf) return
    edgeRenderRaf = requestAnimationFrame(rebuildAsyncEdgeRenders)
  }

  const edgeDependencySignature = () => {
    const edges = payload.renderEdges.value
    if (!edges.length) return '0'
    return edges
      .map((edge) => `${edge.id}:${edge.fromNodeId}:${edge.fromAnchorId}:${edge.toNodeId}:${edge.toAnchorId}`)
      .join('|')
  }

  watch(
    () => [
      payload.viewport.value.zoom,
      payload.viewport.value.panX,
      payload.viewport.value.panY,
      payload.canvasViewportSize.value.width,
      payload.canvasViewportSize.value.height,
      edgeDependencySignature(),
      Array.isArray(payload.keepEdgeIds?.value) ? payload.keepEdgeIds?.value.join('|') : '',
    ],
    () => {
      scheduleAsyncEdgeRender()
    },
    { flush: 'post', immediate: true },
  )

  watch(
    () => payload.workerMutationEpoch?.value,
    () => {
      edgeWorkerMutationVersion += 1
      edgeWorkerPausedUntil = performance.now() + EDGE_WORKER_SETTLE_MS
      resetEdgeWorker()
      scheduleAsyncEdgeRender()
    },
    { flush: 'post' },
  )

  watch(
    () => payload.preferWorker?.value,
    (enabled) => {
      if (enabled === true) return
      edgeWorkerPausedUntil = performance.now() + EDGE_WORKER_SETTLE_MS
      resetEdgeWorker()
      scheduleAsyncEdgeRender()
    },
    { flush: 'post' },
  )

  watch(
    () => payload.viewportMotionActive?.value,
    (active) => {
      if (active === true) {
        // Invalidate in-flight worker results so interactive pan/zoom stays visually locked.
        edgeWorkerMutationVersion += 1
        resetEdgeWorker()
        rebuildSyncEdgeRenders()
        return
      }
      scheduleAsyncEdgeRender()
    },
    { flush: 'post' },
  )

  onBeforeUnmount(() => {
    disposed = true
    if (edgeRenderRaf) cancelAnimationFrame(edgeRenderRaf)
    edgeRenderRaf = 0
    resetEdgeWorker()
  })

  return {
    asyncEdgeRenders,
    asyncDraftRender,
    perfEdgeComputeMs,
    perfEdgeCulledCount,
    perfEdgeRenderedCount,
    perfEdgeInputCount,
    workflowWorldToCanvas,
    scheduleAsyncEdgeRender,
  }
}
