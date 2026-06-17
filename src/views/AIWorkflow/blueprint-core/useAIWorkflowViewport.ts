import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Store } from 'vuex'
import type { WorkflowState } from '../../../aiworkflow/types'

type ViewportValue = {
  zoom: number
  panX: number
  panY: number
}

export const useAIWorkflowViewport = (
  store: Store<WorkflowState>,
  options?: {
    canvasSelector?: string
    motionResetMs?: number
  },
) => {
  const viewport = computed(() => store.state.viewport)

  const onViewportUpdate = (nextViewport: ViewportValue) => {
    store.commit('setViewport', nextViewport)
  }

  const viewportMotionActive = ref(false)
  const canvasViewportSize = ref({ width: 0, height: 0 })

  const canvasSelector = String(options?.canvasSelector ?? '.aiwf-canvas').trim() || '.aiwf-canvas'
  const motionResetMs = Number.isFinite(Number(options?.motionResetMs))
    ? Math.max(0, Number(options?.motionResetMs))
    : 140

  let viewportMotionTimer: number | null = null
  let canvasViewportObserver: ResizeObserver | null = null

  const markViewportMotion = () => {
    viewportMotionActive.value = true
    if (viewportMotionTimer != null) window.clearTimeout(viewportMotionTimer)
    viewportMotionTimer = window.setTimeout(() => {
      viewportMotionTimer = null
      viewportMotionActive.value = false
    }, motionResetMs)
  }

  const updateCanvasViewportSize = () => {
    const canvasHost = document.querySelector(canvasSelector) as HTMLElement | null
    if (!canvasHost) return
    canvasViewportSize.value = {
      width: Math.max(0, Math.floor(canvasHost.clientWidth || 0)),
      height: Math.max(0, Math.floor(canvasHost.clientHeight || 0)),
    }
  }

  watch(
    () => [viewport.value.zoom, viewport.value.panX, viewport.value.panY],
    () => {
      markViewportMotion()
    },
    { flush: 'post' },
  )

  onMounted(() => {
    updateCanvasViewportSize()
    const canvasHost = document.querySelector(canvasSelector) as HTMLElement | null
    if (!canvasHost || typeof ResizeObserver === 'undefined') return
    canvasViewportObserver = new ResizeObserver(() => updateCanvasViewportSize())
    canvasViewportObserver.observe(canvasHost)
  })

  onBeforeUnmount(() => {
    if (viewportMotionTimer != null) window.clearTimeout(viewportMotionTimer)
    viewportMotionTimer = null
    canvasViewportObserver?.disconnect()
    canvasViewportObserver = null
  })

  return {
    viewport,
    onViewportUpdate,
    viewportMotionActive,
    markViewportMotion,
    canvasViewportSize,
    updateCanvasViewportSize,
  }
}
