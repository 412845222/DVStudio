<template>
	<WorkflowNodeBase
		:nodeId="nodeId"
		:title="title"
		:alias="alias"
		:nodeType="nodeType"
		:subtitle="subtitle"
		:style="style"
		:width="width"
		:height="height"
		:zoom="zoom"
		:worldX="worldX"
		:worldY="worldY"
		:inputs="inputs"
		:outputs="outputs"
		:selected="selected"
		:hoverInputAnchorId="hoverInputAnchorId"
		:hoverOutputAnchorId="hoverOutputAnchorId"
		@update:world-x="(v) => emit('update:worldX', v)"
		@update:world-y="(v) => emit('update:worldY', v)"
		@select="(id) => emit('select', id)"
		@start-link="onStartLink"
		@end-link="onEndLink"
		@copy="() => emit('copy')"
		@refresh="() => emit('refresh')"
		@delete="() => emit('delete')"
		@set-type="onSetType"
		@resize="onResize"
	>
		<template #body>
			<div class="wf-scene-layout" @pointerdown.stop @click.stop="onNodeBodyClick">
				<div class="wf-scene-layout-toolbar">
					<div class="wf-scene-layout-status" :class="`is-${status}`">
						{{ statusLabel }}
					</div>
					<div class="wf-scene-layout-actions">
						<button
							class="wf-scene-layout-btn ghost"
							type="button"
							:disabled="running || !hasRunnableJson"
							@click.stop="emit('refresh')"
						>
							刷新
						</button>
						<button
							class="wf-scene-layout-btn ghost"
							type="button"
							@click.stop="emit('update-preview-mode', !previewMode)"
						>
							{{ previewMode ? '关闭预览模式' : '开启预览模式' }}
						</button>
						<button class="wf-scene-layout-btn ghost" type="button" @click.stop="toggleCubeMode">
							{{ cubeModeLabel }}
						</button>
						<button
							class="wf-scene-layout-btn ghost"
							type="button"
							:disabled="!canToggleSelectedScaleMode"
							@click.stop="toggleSelectedScaleMode"
						>
							{{ selectedScaleModeLabel }}
						</button>
						<button
							class="wf-scene-layout-btn"
							type="button"
							:disabled="running || !hasRunnableJson"
							@click.stop="emit('run-scene-layout')"
						>
							{{ running ? '生成中…' : '生成布局' }}
						</button>
					</div>
				</div>

				<div
					class="wf-scene-layout-stage"
					@pointerdown.stop
					@wheel.stop.prevent
					@contextmenu.stop.prevent
				>
					<input
						ref="modelFileInputRef"
						class="wf-scene-layout-model-file-input"
						type="file"
						accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
						@change="onSceneLayoutModelFileChange"
					/>
					<WorkflowThreePreviewShell
						:state="threePreviewState"
						:snapshotUrl="snapshotUrl"
						:empty="!layoutItems.length"
						emptyTitle="3D 占位预览"
						emptyText="连接 JSON 文本后点击“生成布局”，这里会显示彩色立方体占位。"
						maskedTitle="实时场景预览已卸载"
						maskedText="重新选中当前节点后，点击按钮再进入交互式 three.js 预览。"
						@start="emit('start-three-preview')"
					>
						<canvas
							ref="canvasRef"
							class="wf-scene-layout-canvas"
							:class="{ live: previewActive }"
							tabindex="0"
							data-wf-scene-layout-canvas="true"
							@contextmenu.stop.prevent
						/>
						<template #overlay>
							<div
								v-if="previewMode && previewInteractive && layoutItems.length"
								class="wf-scene-layout-overlay-tools"
							>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									@click.stop="togglePlaceholderVisibility"
								>
									{{ hidePlaceholderCubes ? '显示立方体' : '隐藏立方体' }}
								</button>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									@click.stop="toggleLightingPreview"
								>
									{{ lightingPreviewEnabled ? '灯光预览开启' : '灯光预览' }}
								</button>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									:disabled="!lightingPreviewEnabled"
									@click.stop="toggleLightingDebug"
								>
									{{ lightingDebugEnabled ? '灯光辅助开启' : '灯光辅助' }}
								</button>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									:disabled="!canOutputSelectedPlaceholder"
									@click.stop="outputSelectedPlaceholder"
								>
									传递立方体
								</button>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									:disabled="!canImportSelectedPlaceholder"
									@click.stop="openSceneLayoutModelPicker"
								>
									导入模型
								</button>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									:disabled="!canClearSelectedManualModel"
									@click.stop="clearSelectedManualModel"
								>
									清除模型
								</button>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									@click.stop="adjustSelectedOrientation"
								>
									调整朝向
								</button>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									@click.stop="cycleFillSelectedModel"
								>
									{{ cycleFillButtonLabel }}
								</button>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									@click.stop="forceFitSelectedModel"
								>
									强制适配
								</button>
							</div>
							<div
								v-if="previewMode && previewInteractive && lightingPreviewEnabled"
								class="wf-scene-layout-lighting-dock"
								@pointerdown.stop
							>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									@click.stop="lightingPanelCollapsed = !lightingPanelCollapsed"
								>
									{{ lightingPanelCollapsed ? '灯光总控' : '收起灯光总控' }}
								</button>
							</div>
							<div
								v-if="
									previewMode &&
									previewInteractive &&
									lightingPreviewEnabled &&
									!lightingPanelCollapsed
								"
								class="wf-scene-layout-lighting-controls"
								@pointerdown.stop
							>
								<div class="wf-scene-layout-lighting-controls-header">
									<div>灯光全局总控</div>
									<button
										class="wf-scene-layout-btn ghost wf-scene-layout-lighting-reset"
										type="button"
										@click.stop="resetLightingControls"
									>
										重置
									</button>
								</div>
								<div class="wf-scene-layout-lighting-grid">
									<label
										v-for="control in lightingControlItems"
										:key="control.key"
										class="wf-scene-layout-lighting-field"
									>
										<div class="wf-scene-layout-lighting-row">
											<span>{{ control.label }}</span>
											<strong>{{ control.displayValue }}</strong>
										</div>
										<input
											class="wf-scene-layout-lighting-slider"
											type="range"
											min="0"
											max="250"
											step="5"
											:value="control.sliderValue"
											@input="onLightingControlInput(control.key, $event)"
										/>
									</label>
								</div>
							</div>
							<div
								v-if="previewMode && previewInteractive"
								class="wf-scene-layout-perf-panel"
								:class="{ collapsed: perfPanelCollapsed }"
								@pointerdown.stop
							>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									@click.stop="perfPanelCollapsed = !perfPanelCollapsed"
								>
									{{ perfPanelCollapsed ? '性能面板' : '收起性能' }}
								</button>
								<div v-if="!perfPanelCollapsed" class="wf-scene-layout-perf-card">
									<div class="wf-scene-layout-perf-title">Three.js 性能</div>
									<div class="wf-scene-layout-perf-grid">
										<div>FPS</div>
										<div>{{ perfFpsText }}</div>
										<div>帧时</div>
										<div>{{ perfFrameText }}</div>
										<div>均帧</div>
										<div>{{ perfAvgFrameText }}</div>
										<div>渲染</div>
										<div>{{ perfRenderText }}</div>
										<div>均渲染</div>
										<div>{{ perfAvgRenderText }}</div>
										<div>Draw Calls</div>
										<div>{{ perfDrawCallsText }}</div>
										<div>Triangles</div>
										<div>{{ perfTrianglesText }}</div>
										<div>几何体</div>
										<div>{{ perfGeometriesText }}</div>
										<div>纹理</div>
										<div>{{ perfTexturesText }}</div>
									</div>
								</div>
							</div>
						</template>
					</WorkflowThreePreviewShell>
				</div>
			</div>
		</template>

		<template #footer>
			<div class="wf-scene-layout-footer" @pointerdown.stop>
				<div class="wf-scene-layout-kv">
					<div>预览模式</div>
					<div>{{ previewMode ? '已开启' : '未开启' }}</div>
					<div>输入 JSON</div>
					<div>{{ hasInputJson ? '已连接' : '未连接' }}</div>
					<div>占位元素</div>
					<div>{{ layoutItems.length }}</div>
					<div>真实模型</div>
					<div>{{ connectedModelCount }}</div>
					<div>待接模型</div>
					<div>{{ pendingModelCount }}</div>
					<div>关系连线</div>
					<div>{{ relationCount }}</div>
					<div>推断支撑</div>
					<div>{{ inferredCount }}</div>
				</div>
				<div class="wf-scene-layout-copy">{{ messageText }}</div>
				<div v-if="previewMode" class="wf-scene-layout-copy">
					{{ selectedPlaceholderStatusText }}
				</div>
				<div v-if="previewMode" class="wf-scene-layout-copy">
					{{ selectedPlaceholderModelStatusText }}
				</div>
				<div v-if="previewMode" class="wf-scene-layout-copy">
					{{ selectedPlaceholderOrientationText }}
				</div>
				<div v-if="previewMode" class="wf-scene-layout-copy">
					{{ selectedPlaceholderFillText }}
				</div>
				<div v-if="previewMode" class="wf-scene-layout-copy">
					{{ selectedPlaceholderFitText }}
				</div>
				<div v-if="previewMode" class="wf-scene-layout-copy">
					{{ lightingPreviewText }}
				</div>
				<div v-if="previewMode" class="wf-scene-layout-copy">
					{{ actionFeedbackText }}
				</div>
				<div v-if="previewMode" class="wf-scene-layout-copy">
					{{ recommendedFlowText }}
				</div>
			</div>
		</template>
	</WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import WorkflowNodeBase from '../WorkflowNodeBase.vue'
import {
	SceneLayoutPreviewViewer,
	type SceneLayoutPreviewPerfSnapshot,
	type SceneLayoutViewState
} from './sceneLayout/SceneLayoutPreviewViewer'
import WorkflowThreePreviewShell from './three-preview/WorkflowThreePreviewShell.vue'
import type {
	WorkflowSceneLayoutItem,
	WorkflowSceneLayoutLightingControls,
	WorkflowSceneLayoutModelBinding,
	WorkflowSceneLayoutNodeSettings,
	WorkflowUnrealResolvedLayoutExport
} from '../../../aiworkflow/types'
import type {
	WorkflowThreePreviewProgressPayload,
	WorkflowThreePreviewState
} from './three-preview/types'
import { isObject, isString } from '../../../types/utils'
import { diagnoseDwebAsset } from '../../../electronBridge'

type AnchorSpec = {
	id: string
	label?: string
	offsetY?: number
	mediaType?: 'generic' | 'image' | 'video' | 'text' | 'flow'
}

type LightingControlKey = keyof WorkflowSceneLayoutLightingControls

const DEFAULT_LIGHTING_CONTROLS: Required<WorkflowSceneLayoutLightingControls> = {
	masterIntensity: 1,
	exposure: 1,
	ambient: 1,
	hemisphere: 1,
	directional: 1,
	point: 1,
	spot: 1,
	rectArea: 1
}

const SCENE_LAYOUT_SNAPSHOT_CACHE_KEY = '__DWEB_SCENE_LAYOUT_SNAPSHOT_CACHE__'
const SCENE_LAYOUT_SNAPSHOT_CACHE = (() => {
	const root = globalThis as Record<string, unknown>
	const existing = root[SCENE_LAYOUT_SNAPSHOT_CACHE_KEY]
	if (existing instanceof Map) return existing as Map<string, string>
	const created = new Map<string, string>()
	root[SCENE_LAYOUT_SNAPSHOT_CACHE_KEY] = created
	return created
})()

const SCENE_LAYOUT_VIEWSTATE_CACHE_KEY = '__DWEB_SCENE_LAYOUT_VIEWSTATE_CACHE__'
const SCENE_LAYOUT_VIEWSTATE_CACHE = (() => {
	const root = globalThis as Record<string, unknown>
	const existing = root[SCENE_LAYOUT_VIEWSTATE_CACHE_KEY]
	if (existing instanceof Map) return existing as Map<string, SceneLayoutViewState>
	const created = new Map<string, SceneLayoutViewState>()
	root[SCENE_LAYOUT_VIEWSTATE_CACHE_KEY] = created
	return created
})()

const props = defineProps<{
	nodeId: string
	title: string
	alias?: string
	nodeType: string
	subtitle?: string
	style?: Record<string, string>
	sceneLayoutSettings?: WorkflowSceneLayoutNodeSettings | null
	sceneLayoutModelBindings?: WorkflowSceneLayoutModelBinding[]
	linkedJsonText?: string | null
	linkedLightingJsonText?: string | null
	threePreviewState?: WorkflowThreePreviewState | null
	previewSuspended?: boolean
	width: number
	height: number
	zoom: number
	worldX: number
	worldY: number
	inputs?: AnchorSpec[]
	outputs?: AnchorSpec[]
	selected?: boolean
	hoverInputAnchorId?: string | null
	hoverOutputAnchorId?: string | null
}>()

const onStartLink = (payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }) => { emit('start-link', payload) }
const onEndLink = (payload: { nodeId: string; anchorId: string; anchorIndex: number }) => { emit('end-link', payload) }
const onSetType = (type: 'base' | 'text' | 'text-merge' | 'image' | 'rotate-image' | 'video' | 'scene-understanding' | 'scene-decompose' | 'scene-layout' | 'unreal-export' | 'story' | 'comfyui' | 'model3d' | 'meshy') => { emit('set-type', type) }
const onResize = (payload: { width: number; height: number; worldX: number; worldY: number }) => { emit('resize', payload) }



const emit = defineEmits<{
	(e: 'update:worldX', v: number): void
	(e: 'update:worldY', v: number): void
	(e: 'select', nodeId: string): void
	(
		e: 'start-link',
		payload: {
			nodeId: string
			anchorId: string
			anchorIndex: number
			event: PointerEvent
		}
	): void
	(e: 'end-link', payload: { nodeId: string; anchorId: string; anchorIndex: number }): void
	(e: 'copy'): void
	(e: 'refresh'): void
	(e: 'delete'): void
	(
		e: 'set-type',
		v:
			| 'base'
			| 'text'
			| 'text-merge'
			| 'image'
			| 'rotate-image'
			| 'video'
			| 'scene-understanding'
			| 'scene-decompose'
			| 'scene-layout'
			| 'unreal-export'
			| 'story'
			| 'comfyui'
			| 'model3d'
			| 'meshy'
	): void
	(e: 'resize', payload: { width: number; height: number; worldX: number; worldY: number }): void
	(e: 'run-scene-layout'): void
	(e: 'update-layout-items', items: WorkflowSceneLayoutItem[]): void
	(e: 'update-preview-mode', enabled: boolean): void
	(e: 'update-selected-layout-item', itemId: string): void
	(e: 'update-hide-placeholder-cubes', hidden: boolean): void
	(e: 'update-lighting-preview', enabled: boolean): void
	(e: 'update-lighting-debug', enabled: boolean): void
	(e: 'update-lighting-controls', controls: WorkflowSceneLayoutLightingControls): void
	(e: 'set-selected-placeholder-output', itemId: string): void
	(e: 'upload-scene-layout-model-file', payload: { file: File; objectId?: string }): void
	(e: 'clear-scene-layout-model-binding', payload: { objectId: string }): void
	(e: 'update-model-bindings', bindings: WorkflowSceneLayoutModelBinding[]): void
	(e: 'start-three-preview'): void
	(e: 'three-preview-progress', payload?: WorkflowThreePreviewProgressPayload): void
	(e: 'three-preview-ready'): void
	(e: 'three-preview-error'): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const modelFileInputRef = ref<HTMLInputElement | null>(null)
const snapshotCacheKey = String(props.nodeId ?? '').trim()
const snapshotUrl = ref(
	snapshotCacheKey ? String(SCENE_LAYOUT_SNAPSHOT_CACHE.get(snapshotCacheKey) ?? '') : ''
)
const renderTransparent = ref(true)
const selectedPreviewItemId = ref('')
const lastActionMessage = ref('')
const lightingPanelCollapsed = ref(true)
const perfPanelCollapsed = ref(false)
const perfSnapshot = ref<SceneLayoutPreviewPerfSnapshot>({
	fps: 0,
	frameMs: 0,
	avgFrameMs: 0,
	renderMs: 0,
	avgRenderMs: 0,
	drawCalls: 0,
	triangles: 0,
	lines: 0,
	points: 0,
	geometries: 0,
	textures: 0
})
let viewer: SceneLayoutPreviewViewer | null = null
let viewerInitRaf = 0
let viewerInitPending = false
let viewerInitCooldownUntil = 0
let activePreviewRequestId = 0
let perfPollTimer: ReturnType<typeof setInterval> | null = null
let cachedLayoutSignature = ''

const cacheSnapshot = (value: string) => {
	if (!snapshotCacheKey) return
	const next = String(value ?? '').trim()
	if (!next) return
	SCENE_LAYOUT_SNAPSHOT_CACHE.set(snapshotCacheKey, next)
}

const refreshPerfSnapshot = () => {
	if (!viewer) return
	perfSnapshot.value = viewer.getPerformanceSnapshot()
}

const startPerfPolling = () => {
	if (perfPollTimer) return
	refreshPerfSnapshot()
	perfPollTimer = setInterval(() => {
		refreshPerfSnapshot()
	}, 240)
}

const stopPerfPolling = () => {
	if (!perfPollTimer) return
	clearInterval(perfPollTimer)
	perfPollTimer = null
}

const clearViewerInitSchedule = () => {
	if (viewerInitRaf) {
		cancelAnimationFrame(viewerInitRaf)
		viewerInitRaf = 0
	}
	viewerInitPending = false
}

const settings = computed(() => props.sceneLayoutSettings ?? null)
const threePreviewState = computed(() => props.threePreviewState ?? null)
const previewPhase = computed(() => threePreviewState.value?.phase ?? 'masked')
const previewSuspended = computed(() => props.previewSuspended === true)
const previewMode = computed(() => settings.value?.previewMode === true)
const lightingPreviewEnabled = computed(() => settings.value?.lightingPreviewEnabled === true)
const lightingDebugEnabled = computed(() => settings.value?.lightingDebugEnabled === true)
const lightingControls = computed<Required<WorkflowSceneLayoutLightingControls>>(() => ({
	...DEFAULT_LIGHTING_CONTROLS,
	...(settings.value?.lightingControls ?? {})
}))
const hidePlaceholderCubes = computed(() => settings.value?.hidePlaceholderCubes === true)
const layoutItems = computed(
	() =>
		(Array.isArray(settings.value?.layoutItems)
			? settings.value?.layoutItems
			: []) as WorkflowSceneLayoutItem[]
)
const status = computed(() => String(settings.value?.status ?? 'idle'))
const running = computed(() => status.value === 'running')
const hasLinkedJson = computed(() => !!String(props.linkedJsonText ?? '').trim())
const hasCachedJson = computed(() => !!String(settings.value?.inputJson ?? '').trim())
const hasInputJson = computed(() => hasLinkedJson.value || hasCachedJson.value)
const hasRunnableJson = computed(() => hasInputJson.value)
const sceneLayoutModelBindings = computed(
	() =>
		(Array.isArray(props.sceneLayoutModelBindings)
			? props.sceneLayoutModelBindings
			: []) as WorkflowSceneLayoutModelBinding[]
)
const messageText = computed(() => String(settings.value?.message ?? '等待 JSON 输入。'))
const cubeModeLabel = computed(() => (renderTransparent.value ? '半透明' : '不透明'))
const connectedModelCount = computed(
	() =>
		sceneLayoutModelBindings.value.filter(
			(item) => item.connected && !!String(item.modelUrl ?? item.modelAssetUrl ?? '').trim()
		).length
)
const pendingModelCount = computed(() =>
	Math.max(0, layoutItems.value.length - connectedModelCount.value)
)
const selectedPreviewItem = computed(
	() =>
		layoutItems.value.find((item) => String(item.id ?? '') === selectedPreviewItemId.value) ?? null
)
const selectedPlaceholderOutputId = computed(() =>
	String(settings.value?.selectedPlaceholderOutput ?? '').trim()
)
const selectedPlaceholderOutputItem = computed(
	() =>
		layoutItems.value.find((item) => String(item.id ?? '') === selectedPlaceholderOutputId.value) ??
		null
)
const selectedPreviewBinding = computed(
	() =>
		sceneLayoutModelBindings.value.find(
			(item) => item.connected && String(item.objectId ?? '') === selectedPreviewItemId.value
		) ?? null
)
const canToggleSelectedScaleMode = computed(
	() =>
		previewMode.value &&
		!hidePlaceholderCubes.value &&
		!!selectedPreviewItem.value &&
		!!selectedPreviewBinding.value
)
const selectedScaleMode = computed(() => {
	if (!selectedPreviewItem.value) return 'placeholder' as const
	return selectedPreviewItem.value.previewScaleMode === 'model' ? 'model' : 'placeholder'
})
const selectedScaleModeLabel = computed(() => {
	if (!selectedPreviewItem.value) return '占位比例'
	return selectedScaleMode.value === 'model' ? '模型比例' : '占位比例'
})
const canOutputSelectedPlaceholder = computed(
	() => previewMode.value && !hidePlaceholderCubes.value && !!selectedPreviewItem.value
)
const canImportSelectedPlaceholder = computed(
	() => previewMode.value && !hidePlaceholderCubes.value && !!selectedPreviewItem.value
)
const canClearSelectedManualModel = computed(
	() =>
		previewMode.value &&
		!hidePlaceholderCubes.value &&
		!!selectedPreviewItem.value &&
		selectedPreviewBinding.value?.sourceNodeType === 'manual'
)
const selectedPlaceholderStatusText = computed(() => {
	const selected =
		selectedPreviewItem.value?.name || selectedPreviewItem.value?.id || '未选中占位体'
	const output =
		selectedPlaceholderOutputItem.value?.name || selectedPlaceholderOutputItem.value?.id || '未指定'
	return `当前选中：${selected} · 当前输出：${output}`
})
const selectedPlaceholderModelStatusText = computed(() => {
	const binding = selectedPreviewBinding.value
	if (!selectedPreviewItem.value) return '当前模型：未选中占位体'
	if (!binding || !binding.connected) return '当前模型：未绑定'
	if (binding.sourceNodeType === 'manual') return '当前模型：手动导入'
	if (binding.sourceNodeType === 'model3d') return '当前模型：来自 3D 模型节点'
	if (binding.sourceNodeType === 'meshy') return '当前模型：来自 Meshy 节点'
	return '当前模型：已绑定'
})
const selectedPlaceholderOrientationText = computed(() => {
	if (!selectedPreviewItem.value) return '朝向状态：未选中占位体'
	const fix = selectedPreviewItem.value.orientationFix
	if (!fix) return '朝向状态：待校正'
	const modeText = fix.mode === 'manual' ? '人工修正' : '自动修正'
	const confidenceText = fix.confidence === 'high' ? '高置信' : '低置信'
	const yaw = Number.isFinite(Number(fix.yaw)) ? Number(fix.yaw).toFixed(1) : '0.0'
	const pitch = Number.isFinite(Number(fix.pitch)) ? Number(fix.pitch).toFixed(1) : '0.0'
	const roll = Number.isFinite(Number(fix.roll)) ? Number(fix.roll).toFixed(1) : '0.0'
	return `朝向状态：${modeText} · ${confidenceText} · offset(${yaw}, ${pitch}, ${roll})`
})
const selectedPlaceholderFillText = computed(() => {
	if (!selectedPreviewItem.value) return '循环填充：未选中占位体'
	const mode = String(selectedPreviewItem.value.fillMode ?? '').trim()
	if (!mode) return '循环填充：未启用'
	const axis = mode === 'fill-x' ? 'X' : mode === 'fill-y' ? 'Y' : 'Z'
	const count = Number.isFinite(Number(selectedPreviewItem.value.fillCount))
		? Math.max(1, Math.floor(Number(selectedPreviewItem.value.fillCount)))
		: 1
	const axisScale = Number.isFinite(Number(selectedPreviewItem.value.fillAxisScale))
		? Number(selectedPreviewItem.value.fillAxisScale).toFixed(2)
		: '1.00'
	return `循环填充：沿 ${axis} 轴 × ${count}，单轴微调 ${axisScale}`
})
const cycleFillButtonLabel = computed(() => {
	if (!selectedPreviewItem.value) return '循环填充'
	return String(selectedPreviewItem.value.fillMode ?? '').trim() ? '取消循环' : '循环填充'
})
const selectedPlaceholderFitText = computed(() => {
	if (!selectedPreviewItem.value) return '适配状态：未选中占位体'
	const fitMode = String(selectedPreviewItem.value.fitMode ?? '').trim()
	const fitMessage = String(selectedPreviewItem.value.fitMessage ?? '').trim()
	if (!fitMode && !fitMessage) {
		return '适配状态：可直接尝试调整朝向、循环填充或强制适配'
	}
	const fitModeLabel =
		fitMode === 'forced'
			? '强制适配'
			: fitMode === 'filled'
				? '循环填充'
				: fitMode === 'oriented'
					? '朝向修正'
					: '普通预览'
	return `适配状态：${fitModeLabel} · ${fitMessage || '已更新'}`
})
const actionFeedbackText = computed(() => {
	const text = String(lastActionMessage.value ?? '').trim()
	return text
		? `操作反馈：${text}`
		: '操作反馈：点击 调整朝向 -> 循环填充 -> 强制适配 可以逐步修正模型。'
})
const lightingPreviewMeta = computed(() => {
	const raw = String(props.linkedLightingJsonText ?? '').trim()
	if (!raw) return null
	try {
		const parsed = JSON.parse(raw) as unknown
		const parsedRecord = isObject(parsed) ? parsed : {}
		const lights = Array.isArray(parsedRecord.lights) ? parsedRecord.lights : []
		return {
			lightsCount: lights.length,
			style: isString(parsedRecord.lightingStyle) ? parsedRecord.lightingStyle.trim() : '',
			preset:
				isObject(parsedRecord.atmosphere) && isString(parsedRecord.atmosphere.preset)
					? parsedRecord.atmosphere.preset.trim()
					: '',
			summary: isString(parsedRecord.sceneSummary) ? parsedRecord.sceneSummary.trim() : '',
			valid: true
		}
	} catch {
		return {
			lightsCount: 0,
			style: '',
			preset: '',
			summary: '',
			valid: false
		}
	}
})
const lightingPreviewText = computed(() => {
	if (!previewMode.value) return '灯光预览：预览模式未开启'
	if (!lightingPreviewEnabled.value) return '灯光预览：未开启'
	const raw = String(props.linkedLightingJsonText ?? '').trim()
	if (!raw) return '灯光预览：已开启，等待灯光 JSON 输入'
	const meta = lightingPreviewMeta.value
	if (!meta?.valid) return '灯光预览：已接入灯光 JSON，但当前内容暂不可解析'
	const detailParts = [
		meta.lightsCount > 0 ? `${meta.lightsCount} 盏局部灯` : '仅全局灯',
		meta.preset || meta.style || '未标注风格'
	].filter(Boolean)
	const summaryText = meta.summary ? ` · ${meta.summary}` : ''
	return `灯光预览：已接入 ${detailParts.join(' · ')}${summaryText}`
})
const lightingControlItems = computed(() => {
	const controls = lightingControls.value
	const buildItem = (key: LightingControlKey, label: string) => ({
		key,
		label,
		sliderValue: Math.round((controls[key] ?? 1) * 100),
		displayValue: `${Math.round((controls[key] ?? 1) * 100)}%`
	})
	return [
		buildItem('masterIntensity', '整体亮度'),
		buildItem('exposure', '曝光'),
		buildItem('ambient', '环境光'),
		buildItem('hemisphere', '半球光'),
		buildItem('directional', '方向光'),
		buildItem('rectArea', '面光'),
		buildItem('spot', '聚光'),
		buildItem('point', '点光')
	]
})
const recommendedFlowText = computed(() => {
	if (!selectedPreviewItem.value) {
		return '建议流程：先选中占位体，再依次尝试 调整朝向 -> 循环填充 -> 强制适配。'
	}
	const fitMode = String(selectedPreviewItem.value.fitMode ?? '').trim()
	if (fitMode === 'forced') {
		return '建议流程：当前已强制适配；若想恢复观察差异，可切换 占位比例/模型比例 并重新尝试。'
	}
	if (fitMode === 'filled') {
		return '建议流程：当前已做循环填充；若仍不合适，可继续调整朝向或直接强制适配。'
	}
	if (fitMode === 'oriented') {
		return '建议流程：当前已调整朝向；若只剩单一尺寸方向不合适，优先尝试循环填充。'
	}
	return '建议流程：先切换 占位比例/模型比例 观察差异，再尝试 调整朝向 -> 循环填充 -> 强制适配。'
})
const relationCount = computed(
	() => layoutItems.value.filter((item) => !!String(item.parentId ?? '').trim()).length
)
const inferredCount = computed(
	() => layoutItems.value.filter((item) => item.inferred === true).length
)
const cameraSignature = computed(() => {
	const camera = settings.value?.camera
	const position = camera?.position
	const target = camera?.target
	return [
		position?.x ?? '',
		position?.y ?? '',
		position?.z ?? '',
		target?.x ?? '',
		target?.y ?? '',
		target?.z ?? ''
	].join('|')
})
const layoutItemsSignature = computed(() => {
	try {
		return JSON.stringify(layoutItems.value)
	} catch {
		return String(layoutItems.value.length)
	}
})
const modelBindingsSignature = computed(() => {
	try {
		return JSON.stringify(sceneLayoutModelBindings.value)
	} catch {
		return String(sceneLayoutModelBindings.value.length)
	}
})
const lightingControlsSignature = computed(() => {
	try {
		return JSON.stringify(lightingControls.value)
	} catch {
		return 'lighting-controls'
	}
})
const previewInteractive = computed(() => previewPhase.value === 'interactive')
const previewActive = computed(
	() => previewPhase.value === 'loading' || previewPhase.value === 'interactive'
)
const perfFpsText = computed(() => `${Math.max(0, Number(perfSnapshot.value.fps) || 0).toFixed(1)}`)
const perfFrameText = computed(
	() => `${Math.max(0, Number(perfSnapshot.value.frameMs) || 0).toFixed(2)}ms`
)
const perfAvgFrameText = computed(
	() => `${Math.max(0, Number(perfSnapshot.value.avgFrameMs) || 0).toFixed(2)}ms`
)
const perfRenderText = computed(
	() => `${Math.max(0, Number(perfSnapshot.value.renderMs) || 0).toFixed(2)}ms`
)
const perfAvgRenderText = computed(
	() => `${Math.max(0, Number(perfSnapshot.value.avgRenderMs) || 0).toFixed(2)}ms`
)
const perfDrawCallsText = computed(
	() => `${Math.max(0, Math.round(Number(perfSnapshot.value.drawCalls) || 0))}`
)
const perfTrianglesText = computed(
	() => `${Math.max(0, Math.round(Number(perfSnapshot.value.triangles) || 0))}`
)
const perfGeometriesText = computed(
	() => `${Math.max(0, Math.round(Number(perfSnapshot.value.geometries) || 0))}`
)
const perfTexturesText = computed(
	() => `${Math.max(0, Math.round(Number(perfSnapshot.value.textures) || 0))}`
)
const staticPreviewFrameCount = computed(() =>
	previewMode.value ? 12 : Math.max(28, layoutItems.value.length > 0 ? 36 : 28)
)
const staticPreviewFps = computed(() => (previewMode.value ? 18 : 14))

const statusLabel = computed(() => {
	if (status.value === 'running') return '正在布局'
	if (status.value === 'completed') return '布局已生成'
	if (status.value === 'error') return '布局失败'
	return '待生成'
})

watch(
	() =>
		[
			layoutItemsSignature.value,
			renderTransparent.value,
			previewMode.value,
			lightingPreviewEnabled.value,
			lightingDebugEnabled.value,
			lightingControlsSignature.value,
			hidePlaceholderCubes.value,
			modelBindingsSignature.value,
			String(props.linkedLightingJsonText ?? '')
		] as const,
	() => {
		viewer?.setLayout(layoutItems.value, undefined, {
			transparent: renderTransparent.value,
			previewMode: previewMode.value,
			lightingPreviewEnabled: lightingPreviewEnabled.value,
			lightingDebugEnabled: lightingDebugEnabled.value,
			lightingControls: lightingControls.value,
			lightingJson: String(props.linkedLightingJsonText ?? ''),
			modelBindings: sceneLayoutModelBindings.value,
			hidePlaceholderCubes: hidePlaceholderCubes.value
		})
	},
	{ immediate: false }
)

watch(
	() => cameraSignature.value,
	() => {
		viewer?.applyCamera(settings.value?.camera)
	},
	{ immediate: false }
)

const toggleCubeMode = () => {
	renderTransparent.value = !renderTransparent.value
}

const toggleSelectedScaleMode = () => {
	const selectedId = String(selectedPreviewItemId.value ?? '').trim()
	if (!selectedId) return
	if (!canToggleSelectedScaleMode.value) return
	const nextItems: WorkflowSceneLayoutItem[] = layoutItems.value.map((item) => {
		if (String(item.id ?? '') !== selectedId) return item
		const currentMode = item.previewScaleMode === 'model' ? 'model' : 'placeholder'
		const nextItem = {
			...item,
			previewScaleMode: currentMode === 'model' ? 'placeholder' : 'model'
		} as WorkflowSceneLayoutItem & Record<string, unknown>
		if (nextItem.fitMode === 'forced') {
			delete nextItem.fitMode
			delete nextItem.fitMessage
			delete nextItem.fitUpdatedAt
		}
		return nextItem
	})
	lastActionMessage.value = '已切换观察比例；如果之前启用了强制适配，当前已自动清除。'
	emit('update-layout-items', nextItems)
}

const togglePlaceholderVisibility = () => {
	emit('update-hide-placeholder-cubes', !hidePlaceholderCubes.value)
}

const toggleLightingPreview = () => {
	emit('update-lighting-preview', !lightingPreviewEnabled.value)
}

const toggleLightingDebug = () => {
	if (!lightingPreviewEnabled.value) return
	emit('update-lighting-debug', !lightingDebugEnabled.value)
}

const onLightingControlInput = (key: LightingControlKey, event: Event) => {
	const input = event.target as HTMLInputElement | null
	const rawValue = Number(input?.value ?? 100)
	const nextValue = Math.max(0, Math.min(2.5, rawValue / 100))
	emit('update-lighting-controls', {
		...lightingControls.value,
		[key]: nextValue
	})
}

const resetLightingControls = () => {
	emit('update-lighting-controls', { ...DEFAULT_LIGHTING_CONTROLS })
}

const outputSelectedPlaceholder = () => {
	const selectedId = String(selectedPreviewItemId.value ?? '').trim()
	if (!selectedId || !canOutputSelectedPlaceholder.value) return
	emit('set-selected-placeholder-output', selectedId)
}

const openSceneLayoutModelPicker = () => {
	if (!canImportSelectedPlaceholder.value) return
	if (!modelFileInputRef.value) return
	modelFileInputRef.value.value = ''
	modelFileInputRef.value.click()
}

const clearSelectedManualModel = () => {
	if (!canClearSelectedManualModel.value) return
	const objectId = String(selectedPreviewItemId.value ?? '').trim()
	if (!objectId) return
	emit('clear-scene-layout-model-binding', { objectId })
	lastActionMessage.value = '已清除当前手动导入模型。'
}

const adjustSelectedOrientation = async () => {
	if (!viewer) {
		lastActionMessage.value = '预览器尚未准备完成。'
		return
	}
	const result = await viewer.adjustSelectedModelOrientation()
	lastActionMessage.value = result.message
}

const cycleFillSelectedModel = async () => {
	if (!viewer) {
		lastActionMessage.value = '预览器尚未准备完成。'
		return
	}
	const result = await viewer.cycleFillSelectedModel()
	lastActionMessage.value = result.message
}

const forceFitSelectedModel = async () => {
	if (!viewer) {
		lastActionMessage.value = '预览器尚未准备完成。'
		return
	}
	const result = await viewer.forceFitSelectedModel()
	lastActionMessage.value = result.message
}

const syncViewerState = () => {
	if (!viewer) return
	const effectiveHidePlaceholderCubes = previewMode.value ? hidePlaceholderCubes.value : false
	viewer.setRenderSuspended(previewSuspended.value)
	viewer.setInteractive(previewInteractive.value)
	viewer.setSelectedItem(effectiveHidePlaceholderCubes ? '' : selectedPreviewItemId.value)
	const currentSignature = layoutItemsSignature.value
	const cachedView =
		currentSignature === cachedLayoutSignature
			? SCENE_LAYOUT_VIEWSTATE_CACHE.get(snapshotCacheKey) ?? null
			: null
	viewer.setLayout(
		layoutItems.value,
		cachedView ? null : settings.value?.camera,
		{
			transparent: renderTransparent.value,
			previewMode: previewMode.value,
			lightingPreviewEnabled: lightingPreviewEnabled.value,
			lightingDebugEnabled: lightingDebugEnabled.value,
			lightingControls: lightingControls.value,
			lightingJson: String(props.linkedLightingJsonText ?? ''),
			modelBindings: sceneLayoutModelBindings.value,
			hidePlaceholderCubes: effectiveHidePlaceholderCubes
		},
		cachedView
	)
	cachedLayoutSignature = currentSignature
	if (!previewMode.value) {
		viewer.requestStaticFrames()
	}
	refreshPerfSnapshot()
}

const emitPreviewProgress = (progress: number, label: string) => {
	emit('three-preview-progress', { progress, label })
}

const captureSnapshot = () => {
	const next = viewer?.captureSnapshotDataUrl() ?? ''
	if (!next) return
	snapshotUrl.value = next
	cacheSnapshot(next)
}

const saveViewState = () => {
	if (!viewer) return
	const state = viewer.getViewState()
	if (!state) return
	SCENE_LAYOUT_VIEWSTATE_CACHE.set(snapshotCacheKey, state)
}

const onSceneLayoutModelFileChange = (event: Event) => {
	if (!canImportSelectedPlaceholder.value) return
	const input = event.target as HTMLInputElement | null
	if (!input || !input.files || !input.files.length) return
	const file = input.files[0]
	if (!file) return
	const lowerName = String(file.name || '').toLowerCase()
	const isValid = lowerName.endsWith('.glb') || lowerName.endsWith('.gltf')
	if (!isValid) {
		input.value = ''
		return
	}
	emit('upload-scene-layout-model-file', {
		file,
		objectId: String(selectedPreviewItemId.value ?? '').trim() || undefined
	})
	lastActionMessage.value = `已选择模型文件 ${file.name}，正在导入。`
	input.value = ''
}

const onNodeBodyClick = () => {
	if (props.selected) return
	emit('select', props.nodeId)
}

const createViewerNow = () => {
	const canvas = canvasRef.value
	if (viewer || !canvas) return
	if (!canvas.isConnected) return
	const rect = canvas.getBoundingClientRect()
	if (rect.width <= 0 || rect.height <= 0) return
	try {
		viewer = new SceneLayoutPreviewViewer(canvas, {
			onLayoutChange: (items) => emit('update-layout-items', items),
			onSelectionChange: (itemId) => {
				const nextSelectedId = String(itemId ?? '').trim()
				if (nextSelectedId === selectedPreviewItemId.value) return
				selectedPreviewItemId.value = nextSelectedId
			},
			onModelLoadError: async (url, itemId) => {
				await attemptRepairSceneLayoutModelUrl(url, itemId)
			}
		})
		viewerInitCooldownUntil = 0
		syncViewerState()
	} catch (err) {
		viewer = null
		viewerInitCooldownUntil = Date.now() + 400
		const errMessage =
			isObject(err) && isString(err.message) ? err.message : String(err ?? 'unknown')
		lastActionMessage.value = `预览器初始化失败：${errMessage}`
	}
}

const ensureViewer = () => {
	if (viewer || viewerInitPending) {
		return
	}
	if (!canvasRef.value) return
	if (Date.now() < viewerInitCooldownUntil) {
		return
	}
	viewerInitPending = true
	nextTick(() => {
		if (!viewerInitPending) return
		viewerInitRaf = requestAnimationFrame(() => {
			viewerInitRaf = 0
			viewerInitPending = false
			createViewerNow()
		})
	})
}

const disposeViewer = () => {
	clearViewerInitSchedule()
	viewerInitCooldownUntil = 0
	stopPerfPolling()
	if (!viewer) return
	saveViewState()
	captureSnapshot()
	viewer.dispose()
	viewer = null
}

const waitForViewerReady = async () => {
	for (let attempt = 0; attempt < 8; attempt += 1) {
		ensureViewer()
		if (viewer) return true
		await nextTick()
		if (viewer) return true
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
		if (viewer) return true
	}
	return false
}

const attemptRepairSceneLayoutModelUrl = async (url: string, itemId: string): Promise<void> => {
	try {
		const parsed = new URL(url)
		if (parsed.protocol !== 'dweb:' || parsed.hostname !== 'project-assets') {
			return
		}
		const projectId = Number(parsed.searchParams.get('projectId') || '0')
		const relPath = String(parsed.searchParams.get('path') || '').trim()
		if (!Number.isFinite(projectId) || projectId <= 0 || !relPath) {
			return
		}
		const diag = await diagnoseDwebAsset({ projectId, relPath, url })
		if (!diag?.ok || !diag.repairedAsset?.url) {
			return
		}
		const currentBindings = Array.isArray(props.sceneLayoutModelBindings)
			? props.sceneLayoutModelBindings
			: []
		const bindingIndex = currentBindings.findIndex((b) => String(b.objectId ?? '') === itemId)
		if (bindingIndex === -1) return
		const updatedBindings = [...currentBindings]
		updatedBindings[bindingIndex] = {
			...updatedBindings[bindingIndex],
			modelUrl: diag.repairedAsset.url,
			modelAssetUrl: diag.repairedAsset.url,
			modelSourcePath: diag.repairedAsset.sourcePath || updatedBindings[bindingIndex].modelSourcePath
		}
		emit('update-model-bindings', updatedBindings)
	} catch {
		// ignore
	}
}

const startPreviewLoad = async (requestId: number) => {
	activePreviewRequestId = requestId
	emitPreviewProgress(0.12, '初始化渲染器')
	const ready = await waitForViewerReady()
	if (activePreviewRequestId !== requestId) return
	if (!ready || !viewer) {
		emit('three-preview-error')
		return
	}
	emitPreviewProgress(0.46, '应用布局与相机')
	syncViewerState()
	emitPreviewProgress(0.78, previewMode.value ? '同步模型绑定与灯光' : '生成静态预览帧')
	await viewer.awaitPendingBindingSync(previewMode.value ? 4000 : 800)
	if (activePreviewRequestId !== requestId || !viewer) return
	viewer.requestStaticFrames()
	await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
	if (activePreviewRequestId !== requestId || !viewer) return
	captureSnapshot()
	emitPreviewProgress(0.98, '进入交互前状态')
	emit('three-preview-ready')
}

watch(
	() => hidePlaceholderCubes.value,
	(hidden) => {
		viewer?.setPlaceholderVisibility(hidden !== true)
		if (hidden) {
			selectedPreviewItemId.value = ''
			return
		}
		viewer?.setSelectedItem(selectedPreviewItemId.value)
	},
	{ immediate: false }
)

watch(
	() => settings.value?.selectedLayoutItemId,
	(value) => {
		const nextSelectedId = hidePlaceholderCubes.value ? '' : String(value ?? '').trim()
		if (nextSelectedId === selectedPreviewItemId.value) return
		selectedPreviewItemId.value = nextSelectedId
		viewer?.setSelectedItem(nextSelectedId)
	},
	{ immediate: true }
)

watch(
	() => previewInteractive.value,
	(active) => {
		if (active) {
			startPerfPolling()
		} else {
			stopPerfPolling()
		}
		viewer?.setInteractive(active)
		if (active) {
			viewer?.setRenderSuspended(previewSuspended.value)
			if (!previewSuspended.value) viewer?.requestStaticFrames()
			refreshPerfSnapshot()
			return
		}
		if (!previewMode.value) {
			viewer?.requestStaticFrames()
		}
	},
	{ immediate: true, flush: 'post' }
)

watch(previewSuspended, (suspended) => {
	if (!viewer || previewPhase.value === 'masked') return
	if (suspended) {
		// 在暂停渲染前，捕获最后一帧作为快照
		captureSnapshot()
	}
	viewer.setRenderSuspended(suspended)
	if (!suspended) {
		viewer.requestStaticFrames()
	}
	refreshPerfSnapshot()
})

watch(
	() => [previewPhase.value, threePreviewState.value?.requestId ?? 0] as const,
	([phase, requestId]) => {
		if (phase === 'masked') {
			activePreviewRequestId = 0
			// 在进入masked前捕获快照，保持最后一帧显示
			if (viewer) captureSnapshot()
			disposeViewer()
			return
		}
		ensureViewer()
		viewer?.setRenderSuspended(previewSuspended.value)
		if (phase === 'loading') {
			if (requestId === activePreviewRequestId) return
			void startPreviewLoad(requestId)
			return
		}
		syncViewerState()
	},
	{ immediate: true, flush: 'post' }
)

onBeforeUnmount(() => {
	stopPerfPolling()
	saveViewState()
	cacheSnapshot(snapshotUrl.value)
	disposeViewer()
})

const getResolvedLayoutForUnreal = async (): Promise<
	{ ok: true; exportData: WorkflowUnrealResolvedLayoutExport } | { ok: false; error: string }
> => {
	if (!canvasRef.value) {
		return { ok: false, error: '场景布局预览画布尚未挂载。' }
	}
	ensureViewer()
	if (!viewer) {
		await nextTick()
	}
	if (!viewer) {
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
	}
	if (!viewer) {
		return { ok: false, error: '场景布局预览器尚未准备完成。' }
	}
	viewer.setRenderSuspended(false)
	viewer.setInteractive(true)
	viewer.setSelectedItem(selectedPreviewItemId.value)
	const currentSignature = layoutItemsSignature.value
	const cachedViewForExport = SCENE_LAYOUT_VIEWSTATE_CACHE.get(snapshotCacheKey) ?? null
	viewer.setLayout(
		layoutItems.value,
		cachedViewForExport ? null : settings.value?.camera,
		{
			transparent: renderTransparent.value,
			previewMode: true,
			lightingPreviewEnabled: lightingPreviewEnabled.value,
			lightingDebugEnabled: lightingDebugEnabled.value,
			lightingControls: lightingControls.value,
			lightingJson: String(props.linkedLightingJsonText ?? ''),
			modelBindings: sceneLayoutModelBindings.value,
			hidePlaceholderCubes: hidePlaceholderCubes.value
		},
		cachedViewForExport
	)
	cachedLayoutSignature = currentSignature
	try {
		const exportData = await viewer.exportResolvedLayoutForUnreal()
		if (!exportData.slots.length) {
			const warningText = exportData.warnings[0] ?? '当前没有可导出的真实模型结果。'
			return { ok: false, error: warningText }
		}
		return { ok: true, exportData }
	} catch (err) {
		const errMessage =
			isObject(err) && isString(err.message) ? err.message : String(err ?? 'unknown')
		return { ok: false, error: `场景布局导出失败：${errMessage}` }
	} finally {
		if (!previewActive.value) {
			disposeViewer()
		}
	}
}

defineExpose({
	getResolvedLayoutForUnreal
})
</script>

<style scoped>
.wf-scene-layout {
	width: 100%;
	min-height: 100%;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.wf-scene-layout-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.wf-scene-layout-actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.wf-scene-layout-stage {
	position: relative;
	flex: 1;
	min-height: 220px;
	border: 1px solid var(--vscode-border);
	border-radius: 12px;
	overflow: hidden;
	background: var(--dweb-defualt);
}

.wf-scene-layout-overlay-tools {
	position: absolute;
	top: 10px;
	left: 10px;
	display: flex;
	gap: 8px;
	z-index: 3;
}

.wf-scene-layout-overlay-btn {
	background: rgba(0, 0, 0, 0.5);
	backdrop-filter: blur(8px);
}

.wf-scene-layout-lighting-dock {
	position: absolute;
	top: 10px;
	right: 10px;
	display: flex;
	z-index: 3;
}

.wf-scene-layout-lighting-controls {
	position: absolute;
	top: 52px;
	right: 10px;
	width: 240px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid rgba(148, 163, 184, 0.22);
	border-radius: 12px;
	background: rgba(0, 0, 0, 0.6);
	backdrop-filter: blur(10px);
	z-index: 3;
}

.wf-scene-layout-perf-panel {
	position: absolute;
	right: 10px;
	bottom: 10px;
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 8px;
	z-index: 3;
}

.wf-scene-layout-perf-panel.collapsed {
	gap: 0;
}

.wf-scene-layout-perf-card {
	width: 240px;
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid rgba(148, 163, 184, 0.22);
	border-radius: 12px;
	background: rgba(0, 0, 0, 0.6);
	backdrop-filter: blur(10px);
}

.wf-scene-layout-perf-title {
	font-size: 12px;
	color: rgba(226, 232, 240, 0.96);
	font-weight: 600;
}

.wf-scene-layout-perf-grid {
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 4px 10px;
	font-size: 11px;
}

.wf-scene-layout-perf-grid > div:nth-child(2n-1) {
	color: rgba(148, 163, 184, 0.9);
}

.wf-scene-layout-perf-grid > div:nth-child(2n) {
	color: rgba(226, 232, 240, 0.95);
	text-align: right;
}

.wf-scene-layout-lighting-controls-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 12px;
	color: rgba(226, 232, 240, 0.96);
}

.wf-scene-layout-lighting-reset {
	padding: 4px 8px;
}

.wf-scene-layout-lighting-grid {
	display: grid;
	grid-template-columns: 1fr;
	gap: 8px;
}

.wf-scene-layout-lighting-field {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.wf-scene-layout-lighting-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 12px;
	color: rgba(226, 232, 240, 0.84);
}

.wf-scene-layout-lighting-slider {
	width: 100%;
}

.wf-scene-layout-canvas {
	width: 100%;
	height: 100%;
	display: block;
	opacity: 0;
	transition: opacity 120ms ease;
}

.wf-scene-layout-canvas.live {
	opacity: 1;
}

.wf-scene-layout-model-file-input {
	display: none;
}

.wf-scene-layout-empty {
	position: absolute;
	inset: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 6px;
	background: rgba(0, 0, 0, 0.4);
	text-align: center;
	padding: 16px;
}

.wf-scene-layout-empty-title,
.wf-scene-layout-status {
	font-size: 12px;
}

.wf-scene-layout-empty-copy,
.wf-scene-layout-copy {
	font-size: 12px;
	opacity: 0.76;
	line-height: 1.45;
}

.wf-scene-layout-status {
	padding: 4px 10px;
	border-radius: 999px;
	background: rgba(96, 165, 250, 0.18);
	color: #dbeafe;
}

.wf-scene-layout-status.is-completed {
	background: rgba(16, 185, 129, 0.18);
	color: #bbf7d0;
}

.wf-scene-layout-status.is-error {
	background: rgba(239, 68, 68, 0.2);
	color: #fecaca;
}

.wf-scene-layout-btn {
	border: 1px solid var(--vscode-border);
	background: linear-gradient(135deg, rgba(15, 118, 110, 0.88), rgba(8, 145, 178, 0.82));
	color: #fff;
	border-radius: 0;
	padding: 6px 12px;
	font-size: 12px;
	cursor: pointer;
}

.wf-scene-layout-btn.ghost {
	background: rgba(255, 255, 255, 0.06);
}

.wf-scene-layout-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.wf-scene-layout-footer {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	border-radius: 10px;
	padding: 10px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.wf-scene-layout-kv {
	display: grid;
	grid-template-columns: auto 1fr auto auto;
	gap: 6px 10px;
	font-size: 12px;
}
</style>
