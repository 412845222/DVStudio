<template>
	<div class="model3d-editor-page">
		<EditorToolbar
			:currentRenderMode="currentRenderMode"
			:currentLighting="currentLighting"
			:currentTransformMode="currentTransformMode"
			:shadowsEnabled="shadowsEnabled"
			:gridVisible="gridVisible"
			:axesVisible="axesVisible"
			:bloomEnabled="bloomEnabled"
			:wireframeOverlay="wireframeOverlay"
			@update:renderMode="onSetRenderMode"
			@update:lighting="onSetLighting"
			@update:transformMode="onSetTransformMode"
			@update:shadowsEnabled="onToggleShadows"
			@update:gridVisible="onToggleGrid"
			@update:axesVisible="onToggleAxes"
			@update:bloomEnabled="onToggleBloom"
			@update:wireframeOverlay="onToggleWireframeOverlay"
			@resetCamera="onResetCamera"
			@screenshot="onTakeScreenshot"
		/>

		<div class="editor-main">
			<div class="editor-viewport" ref="viewportRef">
				<div class="sq-container viewport-particles">
					<span
						v-for="p in viewportParticles"
						:key="p.id"
						class="sq-particle"
						:style="p.style"
					/>
				</div>

				<div class="viewport-corner viewport-corner-tl" />
				<div class="viewport-corner viewport-corner-tr" />
				<div class="viewport-corner viewport-corner-bl" />
				<div class="viewport-corner viewport-corner-br" />

				<canvas ref="canvasRef" class="editor-canvas"></canvas>

				<div class="lighting-panel-float" :class="{ expanded: showLightingPanel }">
				<div class="sq-container lighting-panel-particles">
					<span
						v-for="p in lightingPanelParticles"
						:key="p.id"
						class="sq-particle"
						:style="p.style"
					/>
				</div>
				<div class="lighting-btn-corner lighting-btn-corner-tl" />
				<div class="lighting-btn-corner lighting-btn-corner-br" />
				<div class="lighting-panel-collapsed-btn" @click="showLightingPanel = !showLightingPanel">
					<div class="lighting-btn-scanline" />
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
						<circle cx="12" cy="12" r="4" />
						<path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42m12.72-12.72l1.42-1.42" />
					</svg>
					<span>{{ t('nodes.model3d.lighting') }}</span>
				</div>
				<div class="lighting-panel-expanded">
					<div class="lighting-panel-corner lighting-panel-corner-tl" />
					<div class="lighting-panel-corner lighting-panel-corner-br" />
					<div class="lighting-panel-scanline" />
					<div class="lighting-panel-header" @click="showLightingPanel = !showLightingPanel">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
							<circle cx="12" cy="12" r="4" />
							<path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42m12.72-12.72l1.42-1.42" />
						</svg>
						<span>{{ t('nodes.model3d.lightAdjust') }}</span>
						<svg class="lighting-panel-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
							<polyline points="6 9 12 15 18 9" />
						</svg>
					</div>
					<div class="lighting-panel-body">
						<div class="lighting-slider-row">
							<span class="lighting-slider-label">{{ t('nodes.model3d.ambientLight') }}</span>
							<input type="range" min="0" max="4" step="0.05" :value="lightingParams.ambientIntensity"
								@input="onUpdateLightingParam('ambientIntensity', parseFloat(($event.target as HTMLInputElement).value))" />
							<span class="lighting-slider-value">{{ lightingParams.ambientIntensity.toFixed(2) }}</span>
						</div>
						<div class="lighting-slider-row">
							<span class="lighting-slider-label">{{ t('nodes.model3d.mainLight') }}</span>
							<input type="range" min="0" max="6" step="0.1" :value="lightingParams.mainLightIntensity"
								@input="onUpdateLightingParam('mainLightIntensity', parseFloat(($event.target as HTMLInputElement).value))" />
							<span class="lighting-slider-value">{{ lightingParams.mainLightIntensity.toFixed(2) }}</span>
						</div>
						<div class="lighting-slider-row">
							<span class="lighting-slider-label">{{ t('nodes.model3d.fillLight') }}</span>
							<input type="range" min="0" max="3" step="0.05" :value="lightingParams.fillLightIntensity"
								@input="onUpdateLightingParam('fillLightIntensity', parseFloat(($event.target as HTMLInputElement).value))" />
							<span class="lighting-slider-value">{{ lightingParams.fillLightIntensity.toFixed(2) }}</span>
						</div>
						<div class="lighting-slider-row">
							<span class="lighting-slider-label">{{ t('nodes.model3d.rimLight') }}</span>
							<input type="range" min="0" max="4" step="0.05" :value="lightingParams.rimLightIntensity"
								@input="onUpdateLightingParam('rimLightIntensity', parseFloat(($event.target as HTMLInputElement).value))" />
							<span class="lighting-slider-value">{{ lightingParams.rimLightIntensity.toFixed(2) }}</span>
						</div>
						<div class="lighting-slider-row">
							<span class="lighting-slider-label">{{ t('nodes.model3d.exposure') }}</span>
							<input type="range" min="0.5" max="3" step="0.05" :value="lightingParams.exposure"
								@input="onUpdateLightingParam('exposure', parseFloat(($event.target as HTMLInputElement).value))" />
							<span class="lighting-slider-value">{{ lightingParams.exposure.toFixed(2) }}</span>
						</div>
						<div class="lighting-slider-divider" />
						<div class="lighting-slider-row">
							<span class="lighting-slider-label">{{ t('nodes.model3d.lightAzimuth') }}</span>
							<input type="range" min="-180" max="180" step="5" :value="lightingParams.lightAzimuth"
								@input="onUpdateLightingParam('lightAzimuth', parseFloat(($event.target as HTMLInputElement).value))" />
							<span class="lighting-slider-value">{{ Math.round(lightingParams.lightAzimuth) }}°</span>
						</div>
						<div class="lighting-slider-row">
							<span class="lighting-slider-label">{{ t('nodes.model3d.lightElevation') }}</span>
							<input type="range" min="0" max="90" step="5" :value="lightingParams.lightElevation"
								@input="onUpdateLightingParam('lightElevation', parseFloat(($event.target as HTMLInputElement).value))" />
							<span class="lighting-slider-value">{{ Math.round(lightingParams.lightElevation) }}°</span>
						</div>
						<div class="lighting-slider-divider" />
						<div class="lighting-slider-row">
							<span class="lighting-slider-label" style="display: flex; align-items: center; gap: 6px;">
								<input type="checkbox" :checked="bloomEnabled" @change="onToggleBloom(($event.target as HTMLInputElement).checked)" style="width: auto; margin: 0;" />
								{{ t('nodes.model3d.bloom') }}
							</span>
						</div>
						<div class="lighting-slider-row" v-if="bloomEnabled">
							<span class="lighting-slider-label">{{ t('nodes.model3d.bloomStrength') }}</span>
							<input type="range" min="0" max="3" step="0.05" :value="bloomParams.strength"
								@input="onUpdateBloomParam('strength', parseFloat(($event.target as HTMLInputElement).value))" />
							<span class="lighting-slider-value">{{ bloomParams.strength.toFixed(2) }}</span>
						</div>
						<div class="lighting-slider-row" v-if="bloomEnabled">
							<span class="lighting-slider-label">{{ t('nodes.model3d.bloomRadius') }}</span>
							<input type="range" min="0" max="1.5" step="0.05" :value="bloomParams.radius"
								@input="onUpdateBloomParam('radius', parseFloat(($event.target as HTMLInputElement).value))" />
							<span class="lighting-slider-value">{{ bloomParams.radius.toFixed(2) }}</span>
						</div>
						<div class="lighting-slider-row" v-if="bloomEnabled">
							<span class="lighting-slider-label">{{ t('nodes.model3d.bloomThreshold') }}</span>
							<input type="range" min="0" max="1" step="0.05" :value="bloomParams.threshold"
								@input="onUpdateBloomParam('threshold', parseFloat(($event.target as HTMLInputElement).value))" />
							<span class="lighting-slider-value">{{ bloomParams.threshold.toFixed(2) }}</span>
						</div>
						<button class="lighting-reset-btn" @click="onResetLighting">{{ t('nodes.model3d.resetPreset') }}</button>
					</div>
				</div>
			</div>

				<div class="viewport-hud">
					<div class="hud-axis-indicator">
						<span class="hud-axis-x">X</span>
						<span class="hud-axis-y">Y</span>
						<span class="hud-axis-z">Z</span>
					</div>
					<div class="hud-transform-hint" v-if="selectedNodeId">
						<kbd>W</kbd><kbd>E</kbd><kbd>R</kbd>
						<span>{{ transformHint }}</span>
					</div>
				</div>

				<ProgressOverlay
					:visible="isLoading"
					:title="loadingTitle"
					:message="loadingMessage"
					:progress="loadingProgress / 100"
				/>
			</div>

			<div class="editor-right-panel">
				<OutlinerPanel
					:nodes="outlinerNodes"
					:selectedIds="selectedIds"
					:expandedIds="expandedIds"
					@select="onSelectNode"
					@toggleVisibility="onToggleNodeVisibility"
					@toggleLock="onToggleNodeLock"
					@toggleExpand="onToggleNodeExpand"
				/>

				<PropertiesPanel
					:selectedObject="selectedOutlinerNode"
					@toggleVisibility="onToggleNodeVisibility"
					@transform="onNodeTransform"
				/>
			</div>
		</div>

		<EditorStatusBar
			:loading="isLoading"
			:loadProgress="loadingProgress"
			:vertexCount="vertexCount"
			:triangleCount="triangleCount"
			:fps="fps"
			:selectedName="selectedName"
			:errorMessage="errorMessage"
		/>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import { EditorViewer } from '../ui/WorkFlow/WorlFlowNodes/model3d/editor/EditorViewer'
import type { RenderMode, LightingPreset, OutlinerNode, EditorLoadProgress, TransformMode } from '../ui/WorkFlow/WorlFlowNodes/model3d/editor/types'
import EditorToolbar from '../ui/UIComponent/Model3DEditor/EditorToolbar.vue'
import OutlinerPanel from '../ui/UIComponent/Model3DEditor/OutlinerPanel.vue'
import PropertiesPanel from '../ui/UIComponent/Model3DEditor/PropertiesPanel.vue'
import EditorStatusBar from '../ui/UIComponent/Model3DEditor/EditorStatusBar.vue'
import ProgressOverlay from '../ui/UIComponent/Model3DEditor/ProgressOverlay.vue'
import { useSquareParticles } from '../composables/useSquareParticles'
import { useI18n } from '../i18n'

const { t } = useI18n()

const viewportRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let viewer: EditorViewer | null = null
let fpsInterval: ReturnType<typeof setInterval> | null = null
let selectionSyncInterval: ReturnType<typeof setInterval> | null = null
let lastSelectedUuid: string | null = null

const currentRenderMode = ref<RenderMode>('pbr')
const currentLighting = ref<LightingPreset>('studio')
const currentTransformMode = ref<TransformMode>('translate')
const shadowsEnabled = ref(true)
const gridVisible = ref(true)
const axesVisible = ref(true)
const bloomEnabled = ref(true)
const wireframeOverlay = ref(false)
const showLightingPanel = ref(true)

const lightingParams = ref({
	ambientIntensity: 0.5,
	mainLightIntensity: 1.2,
	fillLightIntensity: 0.4,
	rimLightIntensity: 0.5,
	exposure: 1.0,
	lightAzimuth: 45,
	lightElevation: 55
})

const bloomParams = ref({
	strength: 1.0,
	radius: 0.7,
	threshold: 0.5
})

const isLoading = ref(false)
const loadingTitle = ref(t('nodes.model3d.loading'))
const loadingMessage = ref('')
const loadingProgress = ref(0)
const errorMessage = ref('')

const outlinerNodes = ref<OutlinerNode[]>([])
const selectedNodeId = ref<string | null>(null)
const selectedIds = computed(() => {
	const s = new Set<string>()
	if (selectedNodeId.value) s.add(selectedNodeId.value)
	return s
})
const expandedIds = ref<Set<string>>(new Set())
const selectedOutlinerNode = ref<OutlinerNode | null>(null)
const selectedName = computed(() => selectedOutlinerNode.value?.name || '')

const vertexCount = ref(0)
const triangleCount = ref(0)
const fps = ref(0)

const { particles: viewportParticles } = useSquareParticles({
	count: 8,
	baseOpacity: 0.15,
	minSize: 1,
	maxSize: 3,
	seed: 77777,
	minDuration: 12,
	maxDuration: 20
})

const { particles: lightingPanelParticles } = useSquareParticles({
	count: 4,
	baseOpacity: 0.3,
	minSize: 1,
	maxSize: 2,
	seed: 55555,
	minDuration: 8,
	maxDuration: 14
})

const transformHint = computed(() => {
	switch (currentTransformMode.value) {
		case 'translate': return t('nodes.model3d.transformMove')
		case 'rotate': return t('nodes.model3d.transformRotate')
		case 'scale': return t('nodes.model3d.transformScale')
	}
	return ''
})

interface ParsedModel {
	id: string
	name: string
	url: string
}

function parseModelsFromQuery(): ParsedModel[] {
	try {
		const raw = window.location.hash || ''
		const qStart = raw.indexOf('?')
		const queryStr = qStart >= 0 ? raw.slice(qStart + 1) : ''
		const params = new URLSearchParams(queryStr)
		const modelsParam = decodeURIComponent(params.get('models') || '')
		if (!modelsParam) return []
		const parsed = JSON.parse(modelsParam)
		if (Array.isArray(parsed)) {
			return parsed.map((m, i) => ({
				id: String(m.id || `model-${i}`),
				name: String(m.name || `Model ${i + 1}`),
				url: String(m.url || '')
			})).filter(m => m.url)
		}
	} catch (e) {
		console.warn('[Model3DEditor] Failed to parse models from query:', e)
	}
	return []
}

function onLoadProgress(progress: EditorLoadProgress) {
	loadingProgress.value = progress.progress
	switch (progress.stage) {
		case 'initializing':
			loadingTitle.value = t('nodes.model3d.progressInitRenderer')
			break
		case 'loading':
			loadingTitle.value = t('nodes.model3d.progressLoadModel')
			break
		case 'processing':
			loadingTitle.value = t('nodes.model3d.progressPrepareModel')
			break
		case 'textures':
			loadingTitle.value = t('nodes.model3d.progressLoadTextures')
			break
		case 'building':
			loadingTitle.value = t('nodes.model3d.progressSyncInteraction')
			break
		case 'complete':
			loadingTitle.value = t('nodes.model3d.ready')
			break
	}
	loadingMessage.value = progress.message
	if (progress.stage === 'complete') {
		setTimeout(() => {
			isLoading.value = false
			updateStats()
			refreshOutliner()
		}, 300)
	}
}

function refreshOutliner() {
	if (!viewer) return
	const tree = viewer.buildOutlinerTree()
	outlinerNodes.value = tree
	if (tree.length > 0) {
		const ids = new Set(expandedIds.value)
		ids.add(tree[0].id)
		expandedIds.value = ids
	}
}

function syncSelectionFromViewer() {
	if (!viewer) return
	const selected = viewer.getSelectedObjects()
	
	if (selected.length > 0) {
		const obj = selected[0]
		const currentUuid = obj?.uuid || null
		if (currentUuid && lastSelectedUuid === currentUuid && selectedOutlinerNode.value?.objectUuid === currentUuid) {
			return
		}
		lastSelectedUuid = currentUuid
		
		let foundNode = findOutlinerNodeByObject(obj)
		if (!foundNode) {
			let searchObj: any | null = obj
			let depth = 0
			while (searchObj && !foundNode && depth < 20) {
				foundNode = findOutlinerNodeByObject(searchObj)
				if (!foundNode) searchObj = searchObj.parent
				depth++
			}
		}
		if (foundNode) {
			if (selectedNodeId.value !== foundNode.id) {
				selectedNodeId.value = foundNode.id
			}
			selectedOutlinerNode.value = foundNode
			expandToNode(foundNode)
		} else {
			console.warn('[Model3DEditor] Could not find outliner node for selected object:', obj?.name, obj?.uuid, 'type:', obj?.type)
		}
	} else {
		if (lastSelectedUuid !== null || selectedNodeId.value !== null) {
			lastSelectedUuid = null
			selectedNodeId.value = null
			selectedOutlinerNode.value = null
		}
	}
}

function expandToNode(node: OutlinerNode) {
	const ids = new Set(expandedIds.value)
	const findAndExpandParent = (nodes: OutlinerNode[], target: OutlinerNode): boolean => {
		for (const n of nodes) {
			if (n === target) return true
			if (n.children && n.children.length > 0) {
				if (findAndExpandParent(n.children, target)) {
					ids.add(n.id)
					return true
				}
			}
		}
		return false
	}
	findAndExpandParent(outlinerNodes.value, node)
	expandedIds.value = ids
}

function updateStats() {
	if (!viewer) return
	vertexCount.value = viewer.getVertexCount()
	triangleCount.value = viewer.getTriangleCount()
}

function updateFPS() {
	if (viewer) {
		fps.value = viewer.getFPS()
	}
}

function findOutlinerNodeById(id: string | null): OutlinerNode | null {
	if (!id) return null
	const search = (nodes: OutlinerNode[]): OutlinerNode | null => {
		for (const node of nodes) {
			if (node.id === id) return node
			if (node.children) {
				const found = search(node.children)
				if (found) return found
			}
		}
		return null
	}
	return search(outlinerNodes.value)
}

function findOutlinerNodeByObject(obj: any | null): OutlinerNode | null {
	if (!obj) return null
	const targetUuid = obj.uuid
	if (!targetUuid) return null
	const search = (nodes: OutlinerNode[]): OutlinerNode | null => {
		for (const node of nodes) {
			if (node.objectUuid === targetUuid) return node
			if (node.children) {
				const found = search(node.children)
				if (found) return found
			}
		}
		return null
	}
	return search(outlinerNodes.value)
}

function onSetRenderMode(mode: RenderMode) {
	currentRenderMode.value = mode
	viewer?.setRenderMode(mode)
}

function onSetLighting(preset: LightingPreset) {
	currentLighting.value = preset
	viewer?.setLightingPreset(preset)
	syncLightingParamsFromViewer()
}

function syncLightingParamsFromViewer() {
	if (!viewer) return
	const values = viewer.getCurrentLightingValues()
	lightingParams.value = { ...values }
}

function onUpdateLightingParam(key: string, value: number) {
	if (!viewer) return
	(lightingParams.value as any)[key] = value
	viewer.setManualLighting({ [key]: value })
}

function onResetLighting() {
	if (!viewer) return
	const preset = currentLighting.value === 'custom' ? 'studio' : currentLighting.value
	viewer.setLightingPreset(preset)
	currentLighting.value = preset
	syncLightingParamsFromViewer()
	const defaultStrength = 1.0
	const defaultRadius = 0.7
	const defaultThreshold = 0.5
	bloomParams.value = { strength: defaultStrength, radius: defaultRadius, threshold: defaultThreshold }
	viewer.setBloomStrength(defaultStrength)
	viewer.setBloomRadius(defaultRadius)
	viewer.setBloomThreshold(defaultThreshold)
}

function syncBloomParamsFromViewer() {
	if (!viewer) return
	const params = viewer.getBloomParams()
	bloomParams.value = {
		strength: params.strength,
		radius: params.radius,
		threshold: params.threshold
	}
	bloomEnabled.value = params.enabled
}

function onUpdateBloomParam(key: 'strength' | 'radius' | 'threshold', value: number) {
	if (!viewer) return
	bloomParams.value[key] = value
	if (key === 'strength') viewer.setBloomStrength(value)
	else if (key === 'radius') viewer.setBloomRadius(value)
	else if (key === 'threshold') viewer.setBloomThreshold(value)
}

function onSetTransformMode(mode: TransformMode) {
	currentTransformMode.value = mode
	viewer?.setTransformMode(mode)
}

function onToggleShadows(enabled: boolean) {
	shadowsEnabled.value = enabled
	viewer?.setShadowsEnabled(enabled)
}

function onToggleGrid(visible: boolean) {
	gridVisible.value = visible
	viewer?.setGridVisible(visible)
}

function onToggleAxes(visible: boolean) {
	axesVisible.value = visible
	viewer?.setAxesVisible(visible)
}

function onToggleBloom(enabled: boolean) {
	bloomEnabled.value = enabled
	viewer?.setBloomEnabled(enabled)
}

function onToggleWireframeOverlay(enabled: boolean) {
	wireframeOverlay.value = enabled
	viewer?.setWireframeOverlay(enabled)
}

function onResetCamera() {
	viewer?.resetCamera()
}

function onTakeScreenshot() {
	if (!viewer) return
	const dataUrl = viewer.getScreenshot()
	if (!dataUrl) return
	const link = document.createElement('a')
	link.download = `3d-editor-screenshot-${Date.now()}.png`
	link.href = dataUrl
	link.click()
}

function onSelectNode(nodeId: string) {
	if (!viewer) return
	if (nodeId) {
		const node = findOutlinerNodeById(nodeId)
		if (node) {
			selectedNodeId.value = nodeId
			selectedOutlinerNode.value = node
			lastSelectedUuid = node.objectUuid
			viewer.selectObject(node.object3D)
			return
		}
	}
	selectedNodeId.value = null
	selectedOutlinerNode.value = null
	lastSelectedUuid = null
	viewer.clearSelection()
}

function onToggleNodeVisibility(nodeId: string) {
	const node = findOutlinerNodeById(nodeId)
	if (!node) return
	const newVisible = !node.visible
	node.visible = newVisible
	node.object3D.visible = newVisible
	viewer?.setNodeVisibility(nodeId, newVisible)
}

function onToggleNodeLock(nodeId: string) {
	const node = findOutlinerNodeById(nodeId)
	if (!node) return
	node.locked = !node.locked
}

function onToggleNodeExpand(nodeId: string) {
	const ids = new Set(expandedIds.value)
	if (ids.has(nodeId)) {
		ids.delete(nodeId)
	} else {
		ids.add(nodeId)
	}
	expandedIds.value = ids
}

function onNodeTransform() {
	updateStats()
}

async function initEditor() {
	await nextTick()
	await new Promise(resolve => requestAnimationFrame(resolve))
	if (!canvasRef.value || !viewportRef.value) {
		console.error('[Model3DEditor] Canvas or viewport not found')
		return
	}
	const canvasW = canvasRef.value.clientWidth
	const canvasH = canvasRef.value.clientHeight
	const viewportW = viewportRef.value.clientWidth
	const viewportH = viewportRef.value.clientHeight

	isLoading.value = true
	loadingProgress.value = 0
	loadingMessage.value = t('nodes.model3d.progressInitRenderer')

	try {
		viewer = new EditorViewer(canvasRef.value, {
			initialRenderMode: currentRenderMode.value,
			shadowsEnabled: shadowsEnabled.value,
			bloomEnabled: bloomEnabled.value,
			bloomStrength: bloomParams.value.strength,
			bloomRadius: bloomParams.value.radius,
			bloomThreshold: bloomParams.value.threshold,
			gridVisible: gridVisible.value,
			axesVisible: axesVisible.value,
			transformVisible: true,
			wireframeOverlay: wireframeOverlay.value,
			onLoadProgress,
			onSelectionChange: () => {
				syncSelectionFromViewer()
			},
			onSelectionTransform: () => {
				updateStats()
			}
		})
		viewer.setTransformMode(currentTransformMode.value)
		syncLightingParamsFromViewer()
		syncBloomParamsFromViewer()
	} catch (err) {
		console.error('[Model3DEditor] Failed to create viewer:', err)
		isLoading.value = false
		errorMessage.value = String(err)
		return
	}

	fpsInterval = setInterval(updateFPS, 1000)
	refreshOutliner()
	updateStats()

	const models = parseModelsFromQuery()
	if (models.length === 0) {
		isLoading.value = false
		errorMessage.value = 'No model data found'
		return
	}
	try {
		for (let i = 0; i < models.length; i++) {
			const m = models[i]
			await viewer.loadModel(m.url, m.id, m.name)
		}
		refreshOutliner()
		updateStats()
		
		if (selectionSyncInterval) clearInterval(selectionSyncInterval)
		selectionSyncInterval = setInterval(() => {
			if (!viewer) return
			syncSelectionFromViewer()
		}, 200)
	} catch (err) {
		console.error('[Model3DEditor] Failed to load model:', err)
		isLoading.value = false
		errorMessage.value = String(err)
	}
}

onMounted(() => {
	initEditor()
})

onBeforeUnmount(() => {
	if (fpsInterval) {
		clearInterval(fpsInterval)
		fpsInterval = null
	}
	if (selectionSyncInterval) {
		clearInterval(selectionSyncInterval)
		selectionSyncInterval = null
	}
	if (viewer) {
		viewer.dispose()
		viewer = null
	}
})
</script>

<style scoped>
.model3d-editor-page {
	display: flex;
	flex-direction: column;
	width: 100%;
	height: 100%;
	overflow: hidden;
	background: var(--wf-page-bg, #0a0f14);
	color: var(--wf-text, #c5d4e3);
	font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;
	position: absolute;
	inset: 0;
}

.editor-main {
	flex: 1;
	display: flex;
	overflow: hidden;
	min-height: 0;
}

.editor-viewport {
	flex: 1;
	position: relative;
	overflow: hidden;
	background: #484848;
	min-width: 0;
}

.editor-canvas {
	display: block;
	width: 100%;
	height: 100%;
	position: absolute;
	inset: 0;
	z-index: 1;
}

.viewport-particles {
	position: absolute;
	inset: 0;
	pointer-events: none;
	z-index: 1;
}

.viewport-corner {
	position: absolute;
	width: 20px;
	height: 20px;
	border: 2px solid color-mix(in srgb, var(--wf-primary, #27b99c) 40%, transparent);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #27b99c) 15%, transparent);
	pointer-events: none;
	z-index: 2;
}

.viewport-corner-tl {
	top: 12px;
	left: 12px;
	border-right: none;
	border-bottom: none;
}

.viewport-corner-tr {
	top: 12px;
	right: 12px;
	border-left: none;
	border-bottom: none;
}

.viewport-corner-bl {
	bottom: 12px;
	left: 12px;
	border-right: none;
	border-top: none;
}

.viewport-corner-br {
	bottom: 12px;
	right: 12px;
	border-left: none;
	border-top: none;
}

.viewport-hud {
	position: absolute;
	bottom: 16px;
	left: 16px;
	display: flex;
	flex-direction: column;
	gap: 8px;
	pointer-events: none;
	z-index: 3;
}

.hud-axis-indicator {
	display: flex;
	gap: 6px;
	padding: 4px 8px;
	background: var(--wf-surface-glass, rgba(21, 24, 28, 0.82));
	backdrop-filter: blur(8px) saturate(140%);
	-webkit-backdrop-filter: blur(8px) saturate(140%);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 20%, var(--wf-border-subtle, transparent));
}

.hud-axis-indicator span {
	font-size: 10px;
	font-weight: 700;
	font-family: 'Consolas', monospace;
	padding: 1px 4px;
}

.hud-axis-x { color: #ff5555; text-shadow: 0 0 4px #ff555566; }
.hud-axis-y { color: #55ff55; text-shadow: 0 0 4px #55ff5566; }
.hud-axis-z { color: #5588ff; text-shadow: 0 0 4px #5588ff66; }

.hud-transform-hint {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 4px 8px;
	background: var(--wf-surface-glass, rgba(21, 24, 28, 0.82));
	backdrop-filter: blur(8px) saturate(140%);
	-webkit-backdrop-filter: blur(8px) saturate(140%);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 20%, var(--wf-border-subtle, transparent));
	font-size: 10px;
	color: var(--wf-text-muted, #8899aa);
}

.hud-transform-hint kbd {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 16px;
	height: 16px;
	padding: 0 3px;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 15%, var(--wf-control-bg, rgba(0,0,0,0.4)));
	border: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 30%, transparent);
	color: var(--wf-primary, #27b99c);
	font-size: 9px;
	font-family: 'Consolas', monospace;
	font-weight: 700;
}

.editor-right-panel {
	width: 280px;
	flex-shrink: 0;
	display: flex;
	flex-direction: column;
	gap: 1px;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 6%, var(--wf-page-bg-muted, rgba(0,0,0,0.3)));
	border-left: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 20%, var(--wf-border-subtle, rgba(255,255,255,0.04)));
}

.lighting-panel-float {
	position: absolute;
	top: 40px;
	left: 16px;
	z-index: 50;
	user-select: none;
	pointer-events: auto;
}

.lighting-panel-particles {
	position: absolute;
	inset: -8px;
	pointer-events: none;
	z-index: 0;
	opacity: 0;
	transition: opacity 300ms ease;
}

.lighting-panel-float.expanded .lighting-panel-particles {
	opacity: 1;
}

.lighting-btn-corner {
	position: absolute;
	width: 5px;
	height: 5px;
	border: 1.5px solid var(--wf-primary, #27b99c);
	box-shadow: 0 0 4px color-mix(in srgb, var(--wf-primary, #27b99c) 40%, transparent);
	pointer-events: none;
	z-index: 2;
	transition: all 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.lighting-btn-corner-tl {
	top: 2px;
	left: 2px;
	border-right: none;
	border-bottom: none;
}

.lighting-btn-corner-br {
	bottom: 2px;
	right: 2px;
	border-left: none;
	border-top: none;
}

.lighting-panel-float.expanded .lighting-btn-corner {
	opacity: 0;
	transform: scale(0.5);
}

.lighting-panel-collapsed-btn {
	position: relative;
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 6px 10px;
	background: var(--wf-surface-glass, rgba(21, 24, 28, 0.82));
	backdrop-filter: blur(10px) saturate(140%);
	-webkit-backdrop-filter: blur(10px) saturate(140%);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 40%, var(--wf-border-subtle, transparent));
	color: var(--wf-primary, #27b99c);
	font-size: 10px;
	font-weight: 600;
	letter-spacing: 0.8px;
	text-transform: uppercase;
	cursor: pointer;
	overflow: hidden;
	transition: all 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
	box-shadow: 0 2px 12px color-mix(in srgb, var(--wf-primary, #27b99c) 10%, transparent),
				inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent);
}

.lighting-panel-collapsed-btn:hover {
	border-color: color-mix(in srgb, var(--wf-primary, #27b99c) 65%, transparent);
	box-shadow: 0 4px 16px color-mix(in srgb, var(--wf-primary, #27b99c) 20%, transparent),
				inset 0 1px 0 color-mix(in srgb, #fff 12%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 6%, var(--wf-surface-glass, rgba(21, 24, 28, 0.82)));
}

.lighting-btn-scanline {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--wf-primary, #27b99c) 60%, transparent) 50%, transparent);
	opacity: 0;
	transition: opacity 220ms ease;
}

.lighting-panel-collapsed-btn:hover .lighting-btn-scanline {
	opacity: 1;
	animation: lighting-scanline 2s ease-in-out infinite;
}

@keyframes lighting-scanline {
	0%, 100% { opacity: 0.4; }
	50% { opacity: 1; }
}

.lighting-panel-expanded {
	opacity: 0;
	transform: scale(0.92) translateY(-6px);
	transform-origin: top left;
	pointer-events: none;
	background: var(--wf-surface-glass, rgba(21, 24, 28, 0.82));
	backdrop-filter: blur(16px) saturate(150%);
	-webkit-backdrop-filter: blur(16px) saturate(150%);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 35%, var(--wf-border-subtle, transparent));
	box-shadow: 0 8px 32px color-mix(in srgb, var(--wf-shadow, rgba(0,0,0,0.5)) 60%, transparent),
				0 0 24px color-mix(in srgb, var(--wf-primary, #27b99c) 12%, transparent),
				inset 0 1px 0 color-mix(in srgb, #fff 6%, transparent);
	min-width: 280px;
	overflow: hidden;
	transition: all 280ms cubic-bezier(0.22, 0.61, 0.36, 1);
	position: relative;
	margin-top: 6px;
}

.lighting-panel-corner {
	position: absolute;
	width: 7px;
	height: 7px;
	border: 1.5px solid var(--wf-primary, #27b99c);
	box-shadow: 0 0 5px color-mix(in srgb, var(--wf-primary, #27b99c) 35%, transparent);
	pointer-events: none;
	z-index: 2;
	opacity: 0;
	transform: scale(0.5);
	transition: all 280ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.lighting-panel-corner-tl {
	top: 3px;
	left: 3px;
	border-right: none;
	border-bottom: none;
}

.lighting-panel-corner-br {
	bottom: 3px;
	right: 3px;
	border-left: none;
	border-top: none;
}

.lighting-panel-float.expanded .lighting-panel-collapsed-btn {
	opacity: 0;
	transform: scale(0.7) translateY(-4px);
	pointer-events: none;
	margin-bottom: -28px;
}

.lighting-panel-float.expanded .lighting-panel-expanded {
	opacity: 1;
	transform: scale(1) translateY(0);
	pointer-events: auto;
}

.lighting-panel-float.expanded .lighting-panel-corner {
	opacity: 1;
	transform: scale(1);
}

.lighting-panel-scanline {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	background: linear-gradient(
		90deg,
		transparent 0%,
		color-mix(in srgb, var(--wf-primary, #27b99c) 0%, transparent) 5%,
		color-mix(in srgb, var(--wf-primary, #27b99c) 60%, transparent) 50%,
		color-mix(in srgb, var(--wf-primary, #27b99c) 0%, transparent) 95%,
		transparent 100%
	);
	box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #27b99c) 40%, transparent);
	animation: lighting-panel-scan 4s ease-in-out infinite;
	pointer-events: none;
	z-index: 1;
}

@keyframes lighting-panel-scan {
	0%, 100% { opacity: 0.5; }
	50% { opacity: 1; }
}

.lighting-panel-header {
	display: flex;
	align-items: center;
	gap: 7px;
	padding: 9px 12px;
	cursor: pointer;
	border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 18%, var(--wf-border-subtle, transparent));
	color: var(--wf-primary, #27b99c);
	font-size: 11px;
	font-weight: 600;
	letter-spacing: 0.6px;
	text-transform: uppercase;
	transition: background 160ms ease;
	position: relative;
	z-index: 1;
}

.lighting-panel-header:hover {
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 8%, transparent);
}

.lighting-panel-toggle {
	margin-left: auto;
	transition: transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.lighting-panel-float.expanded .lighting-panel-toggle {
	transform: rotate(180deg);
}

.lighting-panel-body {
	padding: 12px;
	display: flex;
	flex-direction: column;
	gap: 9px;
	position: relative;
	z-index: 1;
}

.lighting-slider-row {
	display: flex;
	align-items: center;
	gap: 8px;
}

.lighting-slider-label {
	font-size: 10px;
	color: var(--wf-text, #c5d4e3);
	min-width: 44px;
	flex-shrink: 0;
	letter-spacing: 0.3px;
}

.lighting-slider-row input[type="range"] {
	flex: 1;
	height: 3px;
	-webkit-appearance: none;
	appearance: none;
	background: linear-gradient(90deg, 
		color-mix(in srgb, var(--wf-primary, #27b99c) 25%, var(--wf-border-subtle, rgba(255,255,255,0.08))) 0%,
		color-mix(in srgb, var(--wf-primary, #27b99c) 25%, var(--wf-border-subtle, rgba(255,255,255,0.08))) 100%
	);
	border-radius: 0;
	outline: none;
	cursor: pointer;
	box-shadow: inset 0 1px 2px rgba(0,0,0,0.3);
}

.lighting-slider-row input[type="range"]::-webkit-slider-thumb {
	-webkit-appearance: none;
	appearance: none;
	width: 12px;
	height: 12px;
	border-radius: 0;
	background: var(--wf-primary, #27b99c);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #27b99c) 60%, transparent),
				0 0 2px #fff;
	cursor: pointer;
	transition: transform 120ms ease, box-shadow 120ms ease;
}

.lighting-slider-row input[type="range"]::-webkit-slider-thumb:hover {
	transform: scale(1.25);
	box-shadow: 0 0 12px color-mix(in srgb, var(--wf-primary, #27b99c) 80%, transparent),
				0 0 3px #fff;
}

.lighting-slider-value {
	font-size: 10px;
	color: var(--wf-text-muted, #8899aa);
	min-width: 38px;
	text-align: right;
	font-family: 'Consolas', 'Monaco', monospace;
	flex-shrink: 0;
}

.lighting-slider-divider {
	height: 1px;
	background: linear-gradient(90deg, 
		transparent,
		color-mix(in srgb, var(--wf-primary, #27b99c) 20%, var(--wf-border-subtle, transparent)),
		transparent
	);
	margin: 3px 0;
}

.lighting-reset-btn {
	margin-top: 2px;
	padding: 6px 10px;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 10%, transparent);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 25%, var(--wf-border, transparent));
	color: var(--wf-primary, #27b99c);
	font-size: 10px;
	font-weight: 500;
	cursor: pointer;
	transition: all 160ms ease;
	font-family: inherit;
	letter-spacing: 0.5px;
	text-transform: uppercase;
}

.lighting-reset-btn:hover {
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 18%, transparent);
	border-color: color-mix(in srgb, var(--wf-primary, #27b99c) 45%, transparent);
	box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #27b99c) 15%, transparent);
}
</style>
