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
			@update:renderMode="onSetRenderMode"
			@update:lighting="onSetLighting"
			@update:transformMode="onSetTransformMode"
			@update:shadowsEnabled="onToggleShadows"
			@update:gridVisible="onToggleGrid"
			@update:axesVisible="onToggleAxes"
			@update:bloomEnabled="onToggleBloom"
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

				<div class="viewport-scanline" />

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

const currentRenderMode = ref<RenderMode>('pbr')
const currentLighting = ref<LightingPreset>('studio')
const currentTransformMode = ref<TransformMode>('translate')
const shadowsEnabled = ref(true)
const gridVisible = ref(true)
const axesVisible = ref(true)
const bloomEnabled = ref(false)

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
const selectedObject3D = ref<THREE.Object3D | null>(null)
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
	selectedNodeId.value = nodeId
	selectedOutlinerNode.value = findOutlinerNodeById(nodeId)
	if (!selectedOutlinerNode.value) {
		selectedObject3D.value = null
		return
	}
	const obj = selectedOutlinerNode.value.object3D
	selectedObject3D.value = obj
	if (viewer) {
		viewer.selectObject(obj)
	}
}

function onToggleNodeVisibility(nodeId: string) {
	const node = findOutlinerNodeById(nodeId)
	if (!node) return
	const newVisible = !node.visible
	node.object3D.visible = newVisible
	node.visible = newVisible
	refreshOutliner()
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
	if (!canvasRef.value || !viewportRef.value) {
		console.error('[Model3DEditor] Canvas or viewport not found')
		return
	}
	isLoading.value = true
	loadingProgress.value = 0
	loadingMessage.value = '初始化渲染器...'
	viewer = new EditorViewer(canvasRef.value, {
		initialRenderMode: currentRenderMode.value,
		shadowsEnabled: shadowsEnabled.value,
		bloomEnabled: bloomEnabled.value,
		gridVisible: gridVisible.value,
		axesVisible: axesVisible.value,
		transformVisible: true,
		onLoadProgress,
		onSelectionChange: (objects) => {
			if (objects.length > 0) {
				selectedObject3D.value = objects[0]
				const findNodeByObject = (nodes: OutlinerNode[], obj: THREE.Object3D): OutlinerNode | null => {
					for (const node of nodes) {
						if (node.object3D === obj) return node
						if (node.children) {
							const found = findNodeByObject(node.children, obj)
							if (found) return found
						}
					}
					return null
				}
				const foundNode = findNodeByObject(outlinerNodes.value, objects[0])
				if (foundNode) {
					selectedNodeId.value = foundNode.id
					selectedOutlinerNode.value = foundNode
					const ids = new Set(expandedIds.value)
					let parent: OutlinerNode | null = null
					const findParent = (nodes: OutlinerNode[], targetId: string, p: OutlinerNode | null = null): OutlinerNode | null => {
						for (const n of nodes) {
							if (n.id === targetId) return p
							if (n.children) {
								const r = findParent(n.children, targetId, n)
								if (r !== undefined) return r
							}
						}
						return null
					}
					parent = findParent(outlinerNodes.value, foundNode.id)
					if (parent) ids.add(parent.id)
					expandedIds.value = ids
				}
			} else {
				selectedObject3D.value = null
				selectedNodeId.value = null
				selectedOutlinerNode.value = null
			}
		},
		onSelectionTransform: () => {
			selectedOutlinerNode.value = findOutlinerNodeById(selectedNodeId.value)
		}
	})
	viewer.setTransformMode(currentTransformMode.value)
	const models = parseModelsFromQuery()
	if (models.length === 0) {
		isLoading.value = false
		errorMessage.value = '未找到模型'
		return
	}
	try {
		for (let i = 0; i < models.length; i++) {
			const m = models[i]
			await viewer.loadModel(m.url, m.id, m.name)
		}
		refreshOutliner()
		updateStats()
		fpsInterval = setInterval(updateFPS, 1000)
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
	height: 100vh;
	overflow: hidden;
	background: #0a0f14;
	color: var(--wf-text, #c5d4e3);
	font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;
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

.viewport-scanline {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	background: linear-gradient(
		90deg,
		transparent,
		color-mix(in srgb, var(--wf-primary, #27b99c) 30%, transparent) 20%,
		color-mix(in srgb, var(--wf-primary, #27b99c) 20%, transparent) 80%,
		transparent
	);
	pointer-events: none;
	z-index: 2;
	animation: vp-scanline 6s ease-in-out infinite;
}

@keyframes vp-scanline {
	0%, 100% { opacity: 0; transform: translateY(0); }
	10% { opacity: 0.6; }
	90% { opacity: 0.6; }
	100% { opacity: 0; transform: translateY(100vh); }
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
