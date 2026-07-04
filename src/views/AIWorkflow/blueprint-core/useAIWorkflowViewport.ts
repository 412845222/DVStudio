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
	}
) => {
	const viewport = computed(() => store.state.viewport)

	const onViewportUpdate = (nextViewport: ViewportValue) => {
		store.commit('setViewport', nextViewport)
	}

	const viewportMotionActive = ref(false)
	const canvasViewportSize = ref({ width: 0, height: 0 })
	const isDevToolsOpen = ref(false)

	const canvasSelector = String(options?.canvasSelector ?? '.aiwf-canvas').trim() || '.aiwf-canvas'
	const motionResetMs = Number.isFinite(Number(options?.motionResetMs))
		? Math.max(0, Number(options?.motionResetMs))
		: 140

	let viewportMotionTimer: number | null = null
	let viewportMotionHardResetTimer: number | null = null
	let canvasViewportObserver: ResizeObserver | null = null

	const checkDevToolsState = () => {
		try {
			if (typeof window !== 'undefined') {
				const w = window as unknown as Record<string, unknown>
				const electronAPI = w.ElectronAPI as {
					onDevToolsStateChange?: (callback: (open: boolean) => void) => void
					getDevToolsState?: (callback: (open: boolean) => void) => void
				} | undefined
				if (electronAPI) {
					electronAPI.onDevToolsStateChange?.((open: boolean) => {
						isDevToolsOpen.value = open
					})
					electronAPI.getDevToolsState?.((open: boolean) => {
						isDevToolsOpen.value = open
					})
				}
			}
		} catch {
			isDevToolsOpen.value = false
		}
	}

	const getMotionResetMs = () => {
		const baseMs = motionResetMs
		if (isDevToolsOpen.value) {
			return baseMs * 3
		}
		return baseMs
	}

	const MOTION_HARD_TIMEOUT_MS = 1000

	const forceEndViewportMotion = () => {
		if (viewportMotionTimer != null) {
			window.clearTimeout(viewportMotionTimer)
			viewportMotionTimer = null
		}
		if (viewportMotionHardResetTimer != null) {
			window.clearTimeout(viewportMotionHardResetTimer)
			viewportMotionHardResetTimer = null
		}
		viewportMotionActive.value = false
	}

	const markViewportMotion = () => {
		viewportMotionActive.value = true
		const resetMs = getMotionResetMs()
		if (viewportMotionTimer != null) window.clearTimeout(viewportMotionTimer)
		viewportMotionTimer = window.setTimeout(() => {
			viewportMotionTimer = null
			viewportMotionActive.value = false
		}, resetMs)
		if (viewportMotionHardResetTimer != null) window.clearTimeout(viewportMotionHardResetTimer)
		viewportMotionHardResetTimer = window.setTimeout(() => {
			viewportMotionHardResetTimer = null
			if (viewportMotionActive.value) {
				viewportMotionActive.value = false
			}
		}, MOTION_HARD_TIMEOUT_MS)
	}

	const updateCanvasViewportSize = () => {
		const canvasHost = document.querySelector(canvasSelector) as HTMLElement | null
		if (!canvasHost) return
		canvasViewportSize.value = {
			width: Math.max(0, Math.floor(canvasHost.clientWidth || 0)),
			height: Math.max(0, Math.floor(canvasHost.clientHeight || 0))
		}
	}

	watch(
		() => [viewport.value.zoom, viewport.value.panX, viewport.value.panY],
		() => {
			markViewportMotion()
		},
		{ flush: 'post' }
	)

	onMounted(() => {
		updateCanvasViewportSize()
		checkDevToolsState()
		const canvasHost = document.querySelector(canvasSelector) as HTMLElement | null
		if (!canvasHost || typeof ResizeObserver === 'undefined') return
		canvasViewportObserver = new ResizeObserver(() => updateCanvasViewportSize())
		canvasViewportObserver.observe(canvasHost)
	})

	onBeforeUnmount(() => {
		forceEndViewportMotion()
		canvasViewportObserver?.disconnect()
		canvasViewportObserver = null
	})

	return {
		viewport,
		onViewportUpdate,
		viewportMotionActive,
		markViewportMotion,
		forceEndViewportMotion,
		canvasViewportSize,
		updateCanvasViewportSize,
		isDevToolsOpen
	}
}
