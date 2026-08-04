import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'
import type {
	RenderMode,
	LightingPreset,
	TransformMode
} from '../ui/WorkFlow/WorlFlowNodes/model3d/editor/types'
import { EditorViewer } from '../ui/WorkFlow/WorlFlowNodes/model3d/editor/EditorViewer'

export interface UseEnhancedModel3DEditorOptions {
	initialRenderMode?: RenderMode
	initialLighting?: LightingPreset
	initialTransformMode?: TransformMode
	shadowsEnabled?: boolean
	gridVisible?: boolean
	axesVisible?: boolean
	bloomEnabled?: boolean
	wireframeOverlay?: boolean
	onLoadProgress?: (progress: number, message: string) => void
	onLoadComplete?: () => void
	onLoadError?: (error: Error) => void
}

export function useEnhancedModel3DEditor(
	canvasRef: Ref<HTMLCanvasElement | null>,
	options: UseEnhancedModel3DEditorOptions = {}
) {
	const viewer = ref<EditorViewer | null>(null)

	const currentRenderMode = ref<RenderMode>(options.initialRenderMode || 'pbr')
	const currentLighting = ref<LightingPreset>(options.initialLighting || 'studio')
	const currentTransformMode = ref<TransformMode>(options.initialTransformMode || 'translate')
	const shadowsEnabled = ref(options.shadowsEnabled ?? true)
	const gridVisible = ref(options.gridVisible ?? true)
	const axesVisible = ref(options.axesVisible ?? true)
	const bloomEnabled = ref(options.bloomEnabled ?? false)
	const wireframeOverlay = ref(options.wireframeOverlay ?? false)

	const isLoading = ref(true)
	const loadProgress = ref(0)
	const loadMessage = ref('')
	const error = ref<string | null>(null)

	function initViewer() {
		if (!canvasRef.value) {
			error.value = 'Canvas element not found'
			return
		}

		try {
			viewer.value = new EditorViewer(canvasRef.value, {
				initialRenderMode: currentRenderMode.value,
				shadowsEnabled: shadowsEnabled.value,
				bloomEnabled: bloomEnabled.value,
				gridVisible: gridVisible.value,
				axesVisible: axesVisible.value,
				wireframeOverlay: wireframeOverlay.value,
				onLoadProgress: (progress) => {
					loadProgress.value = progress.progress
					loadMessage.value = progress.message
					options.onLoadProgress?.(progress.progress, progress.message)
				}
			})

			isLoading.value = false
			options.onLoadComplete?.()

			applyInitialSettings()
		} catch (err: any) {
			error.value = err.message || 'Failed to initialize viewer'
			isLoading.value = false
			options.onLoadError?.(err)
		}
	}

	function applyInitialSettings() {
		if (!viewer.value) return

		viewer.value.setRenderMode(currentRenderMode.value)
		viewer.value.setLightingPreset(currentLighting.value)
		viewer.value.setTransformMode(currentTransformMode.value)
	}

	function setRenderMode(mode: RenderMode) {
		currentRenderMode.value = mode
		viewer.value?.setRenderMode(mode)
	}

	function setLightingPreset(preset: LightingPreset) {
		currentLighting.value = preset
		viewer.value?.setLightingPreset(preset)
	}

	function setTransformMode(mode: TransformMode) {
		currentTransformMode.value = mode
		viewer.value?.setTransformMode(mode)
	}

	function setShadowsEnabled(enabled: boolean) {
		shadowsEnabled.value = enabled
		viewer.value?.setShadowsEnabled(enabled)
	}

	function setGridVisible(visible: boolean) {
		gridVisible.value = visible
		viewer.value?.setGridVisible(visible)
	}

	function setAxesVisible(visible: boolean) {
		axesVisible.value = visible
		viewer.value?.setAxesVisible(visible)
	}

	function setBloomEnabled(enabled: boolean) {
		bloomEnabled.value = enabled
		viewer.value?.setBloomEnabled(enabled)
	}

	function setWireframeOverlay(enabled: boolean) {
		wireframeOverlay.value = enabled
		viewer.value?.setWireframeOverlay(enabled)
	}

	function resetCamera() {
		viewer.value?.resetCamera?.()
	}

	function getScreenshot(): string | null {
		return viewer.value?.getScreenshot?.() || null
	}

	function dispose() {
		viewer.value?.dispose()
		viewer.value = null
	}

	onMounted(() => {
		initViewer()
	})

	onBeforeUnmount(() => {
		dispose()
	})

	return {
		viewer,
		currentRenderMode,
		currentLighting,
		currentTransformMode,
		shadowsEnabled,
		gridVisible,
		axesVisible,
		bloomEnabled,
		wireframeOverlay,
		isLoading,
		loadProgress,
		loadMessage,
		error,
		setRenderMode,
		setLightingPreset,
		setTransformMode,
		setShadowsEnabled,
		setGridVisible,
		setAxesVisible,
		setBloomEnabled,
		setWireframeOverlay,
		resetCamera,
		getScreenshot,
		dispose
	}
}
