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
import { ref, reactive, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import * as THREE from 'three'
import { EditorViewer } from '../ui/WorkFlow/WorlFlowNodes/model3d/editor/EditorViewer'
import type { RenderMode, LightingPreset, OutlinerNode, EditorLoadProgress, TransformMode } from '../ui/WorkFlow/WorlFlowNodes/model3d/editor/types'
import EditorToolbar from '../ui/UIComponent/Model3DEditor/EditorToolbar.vue'
import OutlinerPanel from '../ui/UIComponent/Model3DEditor/OutlinerPanel.vue'
import PropertiesPanel from '../ui/UIComponent/Model3DEditor/PropertiesPanel.vue'
import EditorStatusBar from '../ui/UIComponent/Model3DEditor/EditorStatusBar.vue'
import ProgressOverlay from '../ui/UIComponent/Model3DEditor/ProgressOverlay.vue'
import { useSquareParticles } from '../composables/useSquareParticles'

const viewportRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let viewer: EditorViewer | null = null
let fpsInterval: ReturnType<typeof setInterval> | null = null
let syncRafId: number | null = null

const currentRenderMode = ref<RenderMode>('pbr')
const currentLighting = ref<LightingPreset>('studio')
const currentTransformMode = ref<TransformMode>('translate')
const shadowsEnabled = ref(true)
const gridVisible = ref(true)
const axesVisible = ref(true)
const bloomEnabled = ref(false)
const wireframeOverlay = ref(false)

const isLoading = ref(false)
const loadingTitle = ref('加载中')
const loadingMessage = ref('初始化...')
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

const transformHint = computed(() => {
	switch (currentTransformMode.value) {
		case 'translate': return '移动'
		case 'rotate': return '旋转'
		case 'scale': return '缩放'
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
			loadingTitle.value = '初始化'
			break
		case 'loading':
			loadingTitle.value = '加载模型'
			break
		case 'processing':
			loadingTitle.value = '处理几何体'
			break
		case 'textures':
			loadingTitle.value = '加载纹理'
			break
		case 'building':
			loadingTitle.value = '构建场景'
			break
		case 'complete':
			loadingTitle.value = '完成'
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
		outlinerNodes.value = viewer.buildOutlinerTree()
		if (outlinerNodes.value.length > 0 && !expandedIds.value.has(outlinerNodes.value[0].id)) {
			const ids = new Set(expandedIds.value)
			ids.add(outlinerNodes.value[0].id)
			expandedIds.value = ids
		}
	}

	function syncSelectionFromViewer() {
		if (!viewer) return
		if (outlinerNodes.value.length === 0) {
			refreshOutliner()
		}
		const selected = viewer.getSelectedObjects()
		if (selected.length > 0) {
			const obj = selected[0]
			let targetObj = obj
			const foundNode = findOutlinerNodeByObject(targetObj)
			if (foundNode) {
				if (selectedNodeId.value !== foundNode.id) {
					selectedNodeId.value = foundNode.id
				}
				if (selectedOutlinerNode.value !== foundNode) {
					selectedOutlinerNode.value = foundNode
				}
				const parentId = foundNode.id.split('-').slice(0, 2).join('-')
				if (parentId && !expandedIds.value.has(parentId)) {
					const ids = new Set(expandedIds.value)
					ids.add(parentId)
					expandedIds.value = ids
				}
			} else {
				let parentNode: OutlinerNode | null = null
				let searchObj: any | null = obj
				while (searchObj && !parentNode) {
					parentNode = findOutlinerNodeByObject(searchObj)
					if (!parentNode) searchObj = searchObj.parent
				}
				if (parentNode) {
					if (selectedNodeId.value !== parentNode.id) {
						selectedNodeId.value = parentNode.id
					}
					if (selectedOutlinerNode.value !== parentNode) {
						selectedOutlinerNode.value = parentNode
					}
					const parentId = parentNode.id.split('-').slice(0, 2).join('-')
					if (parentId && !expandedIds.value.has(parentId)) {
						const ids = new Set(expandedIds.value)
						ids.add(parentId)
						expandedIds.value = ids
					}
				}
			}
		} else {
			if (selectedNodeId.value !== null) selectedNodeId.value = null
			if (selectedOutlinerNode.value !== null) selectedOutlinerNode.value = null
		}
	}

function startSyncLoop() {
	if (syncRafId !== null) return
	const tick = () => {
		syncSelectionFromViewer()
		syncRafId = requestAnimationFrame(tick)
	}
	syncRafId = requestAnimationFrame(tick)
}

function stopSyncLoop() {
	if (syncRafId !== null) {
		cancelAnimationFrame(syncRafId)
		syncRafId = null
	}
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
	const search = (nodes: OutlinerNode[]): OutlinerNode | null => {
		for (const node of nodes) {
			if (node.object3D === obj) return node
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
			viewer.selectObject(node.object3D)
			return
		}
	}
	selectedNodeId.value = null
	selectedOutlinerNode.value = null
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
	console.log('[Model3DEditor] Initial sizes:', { canvasW, canvasH, viewportW, viewportH })

	isLoading.value = true
	loadingProgress.value = 0
	loadingMessage.value = '初始化渲染器...'

	try {
		viewer = new EditorViewer(canvasRef.value, {
			initialRenderMode: currentRenderMode.value,
			shadowsEnabled: shadowsEnabled.value,
			bloomEnabled: bloomEnabled.value,
			gridVisible: gridVisible.value,
			axesVisible: axesVisible.value,
			transformVisible: true,
			wireframeOverlay: wireframeOverlay.value,
			onLoadProgress,
			onSelectionChange: (selected) => {
				refreshOutliner()
				syncSelectionFromViewer()
			},
			onSelectionTransform: () => {
				updateStats()
			}
		})
		viewer.setTransformMode(currentTransformMode.value)
	} catch (err) {
		console.error('[Model3DEditor] Failed to create viewer:', err)
		isLoading.value = false
		errorMessage.value = '渲染器初始化失败: ' + String(err)
		return
	}

	fpsInterval = setInterval(updateFPS, 1000)
	startSyncLoop()
	refreshOutliner()
	updateStats()

	const models = parseModelsFromQuery()
	if (models.length === 0) {
		isLoading.value = false
		errorMessage.value = '未找到模型数据，请从工作流中打开模型'
		return
	}
	try {
		for (let i = 0; i < models.length; i++) {
			const m = models[i]
			await viewer.loadModel(m.url, m.id, m.name)
		}
		refreshOutliner()
		updateStats()
	} catch (err) {
		console.error('[Model3DEditor] Failed to load model:', err)
		isLoading.value = false
		errorMessage.value = '加载失败: ' + String(err)
	}
}

onMounted(() => {
	initEditor()
})

onBeforeUnmount(() => {
	stopSyncLoop()
	if (fpsInterval) {
		clearInterval(fpsInterval)
		fpsInterval = null
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
	background: #0a0f14;
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
	background: #0a0f14;
	min-width: 0;
}

.editor-canvas {
	display: block;
	width: 100%;
	height: 100%;
	position: absolute;
	inset: 0;
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
	background: rgba(10, 15, 20, 0.7);
	backdrop-filter: blur(6px);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 20%, transparent);
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
	background: rgba(10, 15, 20, 0.7);
	backdrop-filter: blur(6px);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 20%, transparent);
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
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 15%, rgba(0,0,0,0.4));
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
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 8%, rgba(0,0,0,0.3));
	border-left: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 20%, rgba(255,255,255,0.04));
}
</style>
