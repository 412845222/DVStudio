import { ref, computed, type Ref } from 'vue'
import type AIWorkflowBlueprintHost from '../components/AIWorkflowBlueprintHost.vue'
import type { LegacyBlueprintData } from '../../../engine/blueprint/types'

export interface Viewport {
	zoom: number
	panX: number
	panY: number
}

export interface NodeScreenRect {
	left: number
	top: number
	width: number
	height: number
	nodeType?: string
}

let singletonInstance: ReturnType<typeof createHostComposable> | null = null

function createHostComposable() {
	const hostRef = ref<InstanceType<typeof AIWorkflowBlueprintHost> | null>(null)
	const viewport = ref<Viewport>({ zoom: 1, panX: 0, panY: 0 })
	const canvasSize = ref({ width: 0, height: 0 })

	function getHost() {
		return hostRef.value
	}

	function getEditor() {
		return hostRef.value?.getInstance?.() ?? null
	}

	function screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
		const editor = getEditor()
		if (editor?.screenToWorld) {
			return editor.screenToWorld(screenX, screenY)
		}
		const vp = viewport.value
		const canvas = canvasSize.value
		return {
			x: (screenX - canvas.width / 2 - vp.panX) / vp.zoom,
			y: (screenY - canvas.height / 2 - vp.panY) / vp.zoom
		}
	}

	function worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
		const vp = viewport.value
		const canvas = canvasSize.value
		return {
			x: worldX * vp.zoom + canvas.width / 2 + vp.panX,
			y: worldY * vp.zoom + canvas.height / 2 + vp.panY
		}
	}

	function resetView() {
		hostRef.value?.resetView?.()
	}

	function fitToView() {
		hostRef.value?.fitToView?.()
	}

	function setViewport(vp: Viewport) {
		hostRef.value?.setViewport?.(vp)
	}

	function getViewport(): Viewport | undefined {
		return hostRef.value?.getViewport?.()
	}

	function animateToViewport(target: Partial<Viewport>, duration: number = 300): Promise<void> {
		return new Promise((resolve) => {
			const startVp = getViewport() ?? viewport.value
			const startTime = performance.now()
			const startZoom = startVp.zoom
			const startPanX = startVp.panX
			const startPanY = startVp.panY
			const endZoom = target.zoom ?? startZoom
			const endPanX = target.panX ?? startPanX
			const endPanY = target.panY ?? startPanY

			function easeOutCubic(t: number): number {
				return 1 - Math.pow(1 - t, 3)
			}

			function step(now: number) {
				const elapsed = now - startTime
				const t = Math.min(1, elapsed / duration)
				const ease = easeOutCubic(t)
				const currentZoom = startZoom + (endZoom - startZoom) * ease
				const currentPanX = startPanX + (endPanX - startPanX) * ease
				const currentPanY = startPanY + (endPanY - startPanY) * ease

				setViewport({ zoom: currentZoom, panX: currentPanX, panY: currentPanY })

				if (t < 1) {
					requestAnimationFrame(step)
				} else {
					resolve()
				}
			}

			requestAnimationFrame(step)
		})
	}

	function loadBlueprint(data: LegacyBlueprintData) {
		hostRef.value?.loadBlueprint?.(data)
	}

	function getNodeScreenRect(nodeId: string): NodeScreenRect | null {
		return hostRef.value?.getNodeScreenRect?.(nodeId) ?? null
	}

	function saveSelectionFrame(label?: string, nodeIds?: string[]): string | null {
		return hostRef.value?.saveSelectionFrame?.(label, nodeIds) ?? null
	}

	function deleteSavedSelectionFrame(frameId: string): boolean {
		return hostRef.value?.deleteSavedSelectionFrame?.(frameId) ?? false
	}

	function getSavedSelectionFrames(): any[] {
		return hostRef.value?.getSavedSelectionFrames?.() ?? []
	}

	function onHostReady(_editor: any) {}

	function onViewportChange(zoom: number, panX: number, panY: number) {
		viewport.value = { zoom, panX, panY }
	}

	function updateCanvasSize() {
		const hostEl = (hostRef.value as any)?.$el as HTMLElement | null
		if (hostEl) {
			const rect = hostEl.getBoundingClientRect()
			canvasSize.value = { width: rect.width, height: rect.height }
		}
	}

	function bindHostEvents() {
		updateCanvasSize()
		window.addEventListener('resize', updateCanvasSize)
	}

	function unbindHostEvents() {
		window.removeEventListener('resize', updateCanvasSize)
	}

	return {
		hostRef,
		viewport: computed(() => viewport.value),
		canvasSize: computed(() => canvasSize.value),
		getHost,
		getEditor,
		screenToWorld,
		worldToScreen,
		resetView,
		fitToView,
		setViewport,
		getViewport,
		animateToViewport,
		loadBlueprint,
		getNodeScreenRect,
		saveSelectionFrame,
		deleteSavedSelectionFrame,
		getSavedSelectionFrames,
		onHostReady,
		onViewportChange,
		bindHostEvents,
		unbindHostEvents,
		updateCanvasSize
	}
}

export function useAIWorkflowBlueprintHost() {
	if (!singletonInstance) {
		singletonInstance = createHostComposable()
	}
	return singletonInstance
}

export function resetAIWorkflowBlueprintHost() {
	if (singletonInstance) {
		singletonInstance.unbindHostEvents()
		singletonInstance = null
	}
}
