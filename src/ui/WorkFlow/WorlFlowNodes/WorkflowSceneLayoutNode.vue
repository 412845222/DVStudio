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
		@update:world-position="(p) => emit('update:worldPosition', p)"
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
							{{ t('common.refresh') }}
						</button>
						<button
							class="wf-scene-layout-btn ghost"
							type="button"
							@click.stop="emit('update-preview-mode', !previewMode)"
						>
							{{ previewMode ? t('nodes.sceneLayout.closePreview') : t('nodes.sceneLayout.openPreview') }}
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
							{{ running ? t('nodes.sceneLayout.processing') : t('nodes.sceneLayout.runLayout') }}
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
						accept=".glb,.gltf,.fbx,.obj,.stl,.dae,model/gltf-binary,model/gltf+json,application/octet-stream"
						@change="onSceneLayoutModelFileChange"
					/>
					<WorkflowThreePreviewShell
						:state="threePreviewState"
						:snapshotUrl="snapshotUrl"
						:empty="!layoutItems.length"
						:emptyTitle="t('nodes.sceneLayout.previewTitle')"
						:emptyText="t('nodes.sceneLayout.previewEmptyText')"
						:maskedTitle="t('nodes.sceneLayout.previewMaskedTitle')"
						:maskedText="t('nodes.sceneLayout.previewMaskedText')"
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
									{{ hidePlaceholderCubes ? t('nodes.sceneLayout.showCubes') : t('nodes.sceneLayout.hideCubes') }}
								</button>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									@click.stop="toggleLightingPreview"
								>
									{{ lightingPreviewEnabled ? t('nodes.sceneLayout.lightingPreviewOn') : t('nodes.sceneLayout.lightingPreview') }}
								</button>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									:disabled="!lightingPreviewEnabled"
									@click.stop="toggleLightingDebug"
								>
									{{ lightingDebugEnabled ? t('nodes.sceneLayout.lightingDebugOn') : t('nodes.sceneLayout.lightingDebug') }}
								</button>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									:disabled="!canOutputSelectedPlaceholder"
									@click.stop="outputSelectedPlaceholder"
								>
									{{ t('nodes.sceneLayout.passCubes') }}
								</button>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									:disabled="!canImportSelectedPlaceholder"
									@click.stop="openSceneLayoutModelPicker"
								>
									{{ t('nodes.sceneLayout.importModel') }}
								</button>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									:disabled="!canClearSelectedManualModel"
									@click.stop="clearSelectedManualModel"
								>
									{{ t('nodes.sceneLayout.clearModel') }}
								</button>
								<div class="wf-scene-layout-orientation-group">
									<button
										class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn wf-scene-layout-orientation-main"
										type="button"
										@click.stop="adjustSelectedOrientation"
									>
										{{ t('nodes.sceneLayout.adjustRotation') }}
									</button>
									<button
										class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn wf-scene-layout-orientation-caret"
										type="button"
										@click.stop="toggleOrientationDropdown"
									>
										<span class="wf-scene-layout-caret-icon">▾</span>
									</button>
									<div
										v-if="orientationDropdownOpen"
										class="wf-scene-layout-orientation-dropdown"
										@pointerdown.stop
									>
										<div
											class="wf-scene-layout-dropdown-item"
											:class="{ active: currentRotationAxis === 'x' }"
											@click.stop="rotateByAxis('x')"
										>
											<span class="wf-scene-layout-dropdown-check">
												{{ currentRotationAxis === 'x' ? '✓' : '' }}
											</span>
											<span>{{ t('nodes.sceneLayout.rotateX') }}</span>
										</div>
										<div
											class="wf-scene-layout-dropdown-item"
											:class="{ active: currentRotationAxis === 'y' }"
											@click.stop="rotateByAxis('y')"
										>
											<span class="wf-scene-layout-dropdown-check">
												{{ currentRotationAxis === 'y' ? '✓' : '' }}
											</span>
											<span>{{ t('nodes.sceneLayout.rotateY') }}</span>
										</div>
										<div
											class="wf-scene-layout-dropdown-item"
											:class="{ active: currentRotationAxis === 'z' }"
											@click.stop="rotateByAxis('z')"
										>
											<span class="wf-scene-layout-dropdown-check">
												{{ currentRotationAxis === 'z' ? '✓' : '' }}
											</span>
											<span>{{ t('nodes.sceneLayout.rotateZ') }}</span>
										</div>
										<div class="wf-scene-layout-dropdown-divider"></div>
										<div
											class="wf-scene-layout-dropdown-item wf-scene-layout-dropdown-reset"
											@click.stop="resetOrientation"
										>
											<span class="wf-scene-layout-dropdown-check"></span>
											<span>{{ t('nodes.sceneLayout.undoRotation') }}</span>
										</div>
									</div>
								</div>
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
									{{ t('nodes.sceneLayout.forceFit') }}
								</button>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									:class="{ 'wf-scene-layout-btn-active': holePunchMode }"
									@click.stop="toggleHolePunchMode"
								>
									{{ holePunchButtonLabel }}
								</button>
								<button
									v-if="holePunchMode && holePunchCanConfirm"
									class="wf-scene-layout-btn primary wf-scene-layout-overlay-btn"
									type="button"
									@click.stop="confirmHolePunch"
								>
									{{ t('nodes.sceneLayout.confirmHolePunch') }}
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
									{{ lightingPanelCollapsed ? t('nodes.sceneLayout.lightControlPanel') : t('nodes.sceneLayout.collapseLightControl') }}
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
									<div>{{ t('nodes.sceneLayout.lightGlobalControl') }}</div>
									<button
										class="wf-scene-layout-btn ghost wf-scene-layout-lighting-reset"
										type="button"
										@click.stop="resetLightingControls"
									>
										{{ t('common.reset') }}
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
									{{ perfPanelCollapsed ? t('nodes.sceneLayout.perfPanel') : t('nodes.sceneLayout.collapsePerf') }}
								</button>
								<div v-if="!perfPanelCollapsed" class="wf-scene-layout-perf-card">
									<div class="wf-scene-layout-perf-title">{{ t('nodes.sceneLayout.threePerf') }}</div>
									<div class="wf-scene-layout-perf-grid">
										<div>FPS</div>
										<div>{{ perfFpsText }}</div>
										<div>{{ t('nodes.sceneLayout.frameTime') }}</div>
										<div>{{ perfFrameText }}</div>
										<div>{{ t('nodes.sceneLayout.avgFps') }}</div>
										<div>{{ perfAvgFrameText }}</div>
										<div>{{ t('nodes.sceneLayout.render') }}</div>
										<div>{{ perfRenderText }}</div>
										<div>{{ t('nodes.sceneLayout.avgRender') }}</div>
										<div>{{ perfAvgRenderText }}</div>
										<div>Draw Calls</div>
										<div>{{ perfDrawCallsText }}</div>
										<div>Triangles</div>
										<div>{{ perfTrianglesText }}</div>
										<div>{{ t('nodes.sceneLayout.geometry') }}</div>
										<div>{{ perfGeometriesText }}</div>
										<div>{{ t('nodes.sceneLayout.textures') }}</div>
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
					<div>{{ t('nodes.sceneLayout.previewMode') }}</div>
					<div>{{ previewMode ? t('common.enabled') : t('common.disabled') }}</div>
					<div>{{ t('nodes.sceneLayout.inputJson') }}</div>
					<div>{{ hasInputJson ? t('nodes.sceneLayout.connected') : t('nodes.sceneLayout.notConnected') }}</div>
					<div>{{ t('nodes.sceneLayout.placeholderElements') }}</div>
					<div>{{ layoutItems.length }}</div>
					<div>{{ t('nodes.sceneLayout.realModels') }}</div>
					<div>{{ connectedModelCount }}</div>
					<div>{{ t('nodes.sceneLayout.pendingModels') }}</div>
					<div>{{ pendingModelCount }}</div>
					<div>{{ t('nodes.sceneLayout.relationLines') }}</div>
					<div>{{ relationCount }}</div>
					<div>{{ t('nodes.sceneLayout.inferredSupport') }}</div>
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
import { useI18n } from '../../../i18n'
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

const { t } = useI18n()

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
const onSetType = (type: 'base' | 'text' | 'text-merge' | 'image' | 'rotate-image' | 'video' | 'scene-understanding' | 'scene-decompose' | 'scene-layout' | 'unreal-export' | 'story' | 'comfyui' | 'model3d' | 'meshy' | 'blender') => { emit('set-type', type) }
const onResize = (payload: { width: number; height: number; worldX: number; worldY: number }) => { emit('resize', payload) }



const emit = defineEmits<{
	(e: 'update:worldX', v: number): void
	(e: 'update:worldY', v: number): void
	(e: 'update:worldPosition', p: { worldX: number; worldY: number }): void
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
			| 'blender'
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
const orientationDropdownOpen = ref(false)
const currentRotationAxis = ref<'x' | 'y' | 'z'>('y')
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
let cameraUserControlled = false

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
const holePunchMode = ref(false)
const holePunchStep = ref<'select-target' | 'select-tool'>('select-target')
const holePunchTargetId = ref('')
const holePunchToolId = ref('')
const holePunchCanConfirm = computed(() => !!holePunchTargetId.value && !!holePunchToolId.value)
const holePunchButtonLabel = computed(() => {
	if (!holePunchMode.value) return t('nodes.sceneLayout.holePunch')
	if (holePunchStep.value === 'select-target') return t('nodes.sceneLayout.holePunchSelectTarget')
	if (holePunchStep.value === 'select-tool') return t('nodes.sceneLayout.holePunchSelectTool')
	return t('nodes.sceneLayout.holePunch')
})
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
const messageText = computed(() => String(settings.value?.message ?? t('nodes.sceneLayout.waitingJson')))
const cubeModeLabel = computed(() => (renderTransparent.value ? t('nodes.sceneLayout.translucent') : t('nodes.sceneLayout.opaque')))
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
	if (!selectedPreviewItem.value) return t('nodes.sceneLayout.placeholderScale')
	return selectedScaleMode.value === 'model' ? t('nodes.sceneLayout.modelScale') : t('nodes.sceneLayout.placeholderScale')
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
		selectedPreviewItem.value?.name || selectedPreviewItem.value?.id || t('nodes.sceneLayout.noPlaceholderSelected')
	const output =
		selectedPlaceholderOutputItem.value?.name || selectedPlaceholderOutputItem.value?.id || t('nodes.sceneLayout.notSpecified')
	return t('nodes.sceneLayout.currentSelected', { selected, output })
})
const selectedPlaceholderModelStatusText = computed(() => {
	const binding = selectedPreviewBinding.value
	if (!selectedPreviewItem.value) return t('nodes.sceneLayout.modelNoPlaceholder')
	if (!binding || !binding.connected) return t('nodes.sceneLayout.modelNotBound')
	if (binding.sourceNodeType === 'manual') return t('nodes.sceneLayout.modelManualImport')
	if (binding.sourceNodeType === 'model3d') return t('nodes.sceneLayout.modelFromModel3D')
	if (binding.sourceNodeType === 'meshy') return t('nodes.sceneLayout.modelFromMeshy')
	return t('nodes.sceneLayout.modelBound')
})
const selectedPlaceholderOrientationText = computed(() => {
	if (!selectedPreviewItem.value) return t('nodes.sceneLayout.orientationNoPlaceholder')
	const fix = selectedPreviewItem.value.orientationFix
	if (!fix) return t('nodes.sceneLayout.orientationPending')
	const modeText = fix.mode === 'manual' ? t('nodes.sceneLayout.orientationManual') : t('nodes.sceneLayout.orientationAuto')
	const confidenceText = fix.confidence === 'high' ? t('nodes.sceneLayout.confidenceHigh') : t('nodes.sceneLayout.confidenceLow')
	const yaw = Number.isFinite(Number(fix.yaw)) ? Number(fix.yaw).toFixed(1) : '0.0'
	const pitch = Number.isFinite(Number(fix.pitch)) ? Number(fix.pitch).toFixed(1) : '0.0'
	const roll = Number.isFinite(Number(fix.roll)) ? Number(fix.roll).toFixed(1) : '0.0'
	return t('nodes.sceneLayout.orientationStatus', { mode: modeText, confidence: confidenceText, yaw, pitch, roll })
})
const selectedPlaceholderFillText = computed(() => {
	if (!selectedPreviewItem.value) return t('nodes.sceneLayout.fillNoPlaceholder')
	const mode = String(selectedPreviewItem.value.fillMode ?? '').trim()
	if (!mode) return t('nodes.sceneLayout.fillNotEnabled')
	const axis = mode === 'fill-x' ? 'X' : mode === 'fill-y' ? 'Y' : 'Z'
	const count = Number.isFinite(Number(selectedPreviewItem.value.fillCount))
		? Math.max(1, Math.floor(Number(selectedPreviewItem.value.fillCount)))
		: 1
	const axisScale = Number.isFinite(Number(selectedPreviewItem.value.fillAxisScale))
		? Number(selectedPreviewItem.value.fillAxisScale).toFixed(2)
		: '1.00'
	return t('nodes.sceneLayout.fillStatus', { axis, count, scale: axisScale })
})
const cycleFillButtonLabel = computed(() => {
	if (!selectedPreviewItem.value) return t('nodes.sceneLayout.cycleFill')
	return String(selectedPreviewItem.value.fillMode ?? '').trim() ? t('nodes.sceneLayout.cancelCycle') : t('nodes.sceneLayout.cycleFill')
})
const selectedPlaceholderFitText = computed(() => {
	if (!selectedPreviewItem.value) return t('nodes.sceneLayout.fitNoPlaceholder')
	const fitMode = String(selectedPreviewItem.value.fitMode ?? '').trim()
	const fitMessage = String(selectedPreviewItem.value.fitMessage ?? '').trim()
	if (!fitMode && !fitMessage) {
		return t('nodes.sceneLayout.fitTryHint')
	}
	const fitModeLabel =
		fitMode === 'forced'
			? t('nodes.sceneLayout.fitForced')
			: fitMode === 'filled'
				? t('nodes.sceneLayout.fitFilled')
				: fitMode === 'oriented'
					? t('nodes.sceneLayout.fitOriented')
					: t('nodes.sceneLayout.fitNormal')
	return t('nodes.sceneLayout.fitStatus', { mode: fitModeLabel, message: fitMessage || t('nodes.sceneLayout.fitUpdated') })
})
const actionFeedbackText = computed(() => {
	const text = String(lastActionMessage.value ?? '').trim()
	return text
		? t('nodes.sceneLayout.actionFeedback', { text })
		: t('nodes.sceneLayout.actionFeedbackHint')
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
	if (!previewMode.value) return t('nodes.sceneLayout.lightingPreviewOff')
	if (!lightingPreviewEnabled.value) return t('nodes.sceneLayout.lightingNotEnabled')
	const raw = String(props.linkedLightingJsonText ?? '').trim()
	if (!raw) return t('nodes.sceneLayout.lightingWaitingJson')
	const meta = lightingPreviewMeta.value
	if (!meta?.valid) return t('nodes.sceneLayout.lightingJsonInvalid')
	const detailParts = [
		meta.lightsCount > 0 ? t('nodes.sceneLayout.lightingLocalLights', { count: meta.lightsCount }) : t('nodes.sceneLayout.lightingGlobalOnly'),
		meta.preset || meta.style || t('nodes.sceneLayout.lightingNoStyle')
	].filter(Boolean)
	const summaryText = meta.summary ? ` · ${meta.summary}` : ''
	return t('nodes.sceneLayout.lightingConnected', { details: detailParts.join(' · '), summary: summaryText })
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
		buildItem('masterIntensity', t('nodes.sceneLayout.lightMaster')),
		buildItem('exposure', t('nodes.sceneLayout.lightExposure')),
		buildItem('ambient', t('nodes.sceneLayout.lightAmbient')),
		buildItem('hemisphere', t('nodes.sceneLayout.lightHemisphere')),
		buildItem('directional', t('nodes.sceneLayout.lightDirectional')),
		buildItem('rectArea', t('nodes.sceneLayout.lightRectArea')),
		buildItem('spot', t('nodes.sceneLayout.lightSpot')),
		buildItem('point', t('nodes.sceneLayout.lightPoint'))
	]
})
const recommendedFlowText = computed(() => {
	if (!selectedPreviewItem.value) {
		return t('nodes.sceneLayout.suggestionSelect')
	}
	const fitMode = String(selectedPreviewItem.value.fitMode ?? '').trim()
	if (fitMode === 'forced') {
		return t('nodes.sceneLayout.suggestionForced')
	}
	if (fitMode === 'filled') {
		return t('nodes.sceneLayout.suggestionFilled')
	}
	if (fitMode === 'oriented') {
		return t('nodes.sceneLayout.suggestionOriented')
	}
	return t('nodes.sceneLayout.suggestionDefault')
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
	if (status.value === 'running') return t('nodes.sceneLayout.statusRunning')
	if (status.value === 'completed') return t('nodes.sceneLayout.statusCompleted')
	if (status.value === 'error') return t('nodes.sceneLayout.statusError')
	return t('nodes.sceneLayout.statusIdle')
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
		viewer?.setLayout(
			layoutItems.value,
			cameraUserControlled ? null : undefined,
			{
				transparent: renderTransparent.value,
				previewMode: previewMode.value,
				lightingPreviewEnabled: lightingPreviewEnabled.value,
				lightingDebugEnabled: lightingDebugEnabled.value,
				lightingControls: lightingControls.value,
				lightingJson: String(props.linkedLightingJsonText ?? ''),
				modelBindings: sceneLayoutModelBindings.value,
				hidePlaceholderCubes: hidePlaceholderCubes.value
			},
			cameraUserControlled ? null : undefined
		)
	},
	{ immediate: false }
)

watch(
	() => cameraSignature.value,
	() => {
		if (cameraUserControlled) return
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
	lastActionMessage.value = t('nodes.sceneLayout.msgScaleSwitched')
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
	lastActionMessage.value = t('nodes.sceneLayout.msgModelCleared')
}

const adjustSelectedOrientation = async () => {
	if (!viewer) {
		lastActionMessage.value = t('nodes.sceneLayout.msgViewerNotReady')
		return
	}
	const result = await viewer.rotateSelectedModelByAxis(currentRotationAxis.value)
	lastActionMessage.value = result.message
}

const toggleOrientationDropdown = () => {
	orientationDropdownOpen.value = !orientationDropdownOpen.value
	if (orientationDropdownOpen.value) {
		requestAnimationFrame(() => {
			document.addEventListener('click', closeOrientationDropdown, { once: true })
		})
	}
}

const closeOrientationDropdown = () => {
	orientationDropdownOpen.value = false
}

const rotateByAxis = async (axis: 'x' | 'y' | 'z') => {
	currentRotationAxis.value = axis
	orientationDropdownOpen.value = false
	if (!viewer) {
		lastActionMessage.value = t('nodes.sceneLayout.msgViewerNotReady')
		return
	}
	const result = await viewer.rotateSelectedModelByAxis(axis)
	lastActionMessage.value = result.message
}

const resetOrientation = async () => {
	orientationDropdownOpen.value = false
	if (!viewer) {
		lastActionMessage.value = t('nodes.sceneLayout.msgViewerNotReady')
		return
	}
	const result = await viewer.resetSelectedModelOrientation()
	lastActionMessage.value = result.message
}

const cycleFillSelectedModel = async () => {
	if (!viewer) {
		lastActionMessage.value = t('nodes.sceneLayout.msgViewerNotReady')
		return
	}
	const result = await viewer.cycleFillSelectedModel()
	lastActionMessage.value = result.message
}

const forceFitSelectedModel = async () => {
	if (!viewer) {
		lastActionMessage.value = t('nodes.sceneLayout.msgViewerNotReady')
		return
	}
	const result = await viewer.forceFitSelectedModel()
	lastActionMessage.value = result.message
}

const toggleHolePunchMode = () => {
	if (!viewer) {
		lastActionMessage.value = t('nodes.sceneLayout.msgViewerNotReady')
		return
	}
	if (holePunchMode.value) {
		viewer.cancelHolePunchMode()
	} else {
		viewer.startHolePunchMode()
	}
}

const confirmHolePunch = async () => {
	if (!viewer) {
		lastActionMessage.value = t('nodes.sceneLayout.msgViewerNotReady')
		return
	}
	const result = await viewer.confirmHolePunch()
	lastActionMessage.value = result.message
}

const syncViewerState = () => {
	if (!viewer) return
	const effectiveHidePlaceholderCubes = previewMode.value ? hidePlaceholderCubes.value : false
	viewer.setRenderSuspended(previewSuspended.value)
	viewer.setInteractive(previewInteractive.value)
	viewer.setSelectedItem(effectiveHidePlaceholderCubes ? '' : selectedPreviewItemId.value)
	const currentSignature = layoutItemsSignature.value
	const signatureChanged = currentSignature !== cachedLayoutSignature
	if (signatureChanged) {
		cameraUserControlled = false
	}
	const cachedView =
		!signatureChanged && !cameraUserControlled
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
		cameraUserControlled ? null : cachedView
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
	lastActionMessage.value = t('nodes.sceneLayout.msgModelSelected', { name: file.name })
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
			},
			onCameraInteractionStart: () => {
				cameraUserControlled = true
			},
			onCameraInteractionEnd: () => {
				saveViewState()
			}
		})
		viewer.setHolePunchStateChangeCallback((state) => {
			holePunchMode.value = state.mode
			holePunchStep.value = state.step
			holePunchTargetId.value = state.targetId
			holePunchToolId.value = state.toolId
		})
		viewerInitCooldownUntil = 0
		syncViewerState()
	} catch (err) {
		viewer = null
		viewerInitCooldownUntil = Date.now() + 400
		const errMessage =
			isObject(err) && isString(err.message) ? err.message : String(err ?? 'unknown')
		lastActionMessage.value = t('nodes.sceneLayout.msgViewerInitFailed', { error: errMessage })
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
	emitPreviewProgress(0.12, t('nodes.sceneLayout.progressInitRenderer'))
	const ready = await waitForViewerReady()
	if (activePreviewRequestId !== requestId) return
	if (!ready || !viewer) {
		emit('three-preview-error')
		return
	}
	emitPreviewProgress(0.46, t('nodes.sceneLayout.progressApplyLayout'))
	syncViewerState()
	emitPreviewProgress(0.78, previewMode.value ? t('nodes.sceneLayout.progressSyncModels') : t('nodes.sceneLayout.progressGenerateFrame'))
	await viewer.awaitPendingBindingSync(previewMode.value ? 4000 : 800)
	if (activePreviewRequestId !== requestId || !viewer) return
	viewer.requestStaticFrames()
	await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
	if (activePreviewRequestId !== requestId || !viewer) return
	captureSnapshot()
	emitPreviewProgress(0.98, t('nodes.sceneLayout.progressReady'))
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
		return { ok: false, error: t('nodes.sceneLayout.errorCanvasNotMounted') }
	}
	ensureViewer()
	if (!viewer) {
		await nextTick()
	}
	if (!viewer) {
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
	}
	if (!viewer) {
		return { ok: false, error: t('nodes.sceneLayout.errorViewerNotReady') }
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
			const warningText = exportData.warnings[0] ?? t('nodes.sceneLayout.errorNoModelsToExport')
			return { ok: false, error: warningText }
		}
		return { ok: true, exportData }
	} catch (err) {
		const errMessage =
			isObject(err) && isString(err.message) ? err.message : String(err ?? 'unknown')
		return { ok: false, error: t('nodes.sceneLayout.errorExportFailed', { error: errMessage }) }
	} finally {
		if (!previewActive.value) {
			disposeViewer()
		}
	}
}

const exportSelectedPlaceholderGLB = async (): Promise<
	{ ok: true; glbData: ArrayBuffer; name: string } | { ok: false; error: string }
> => {
	lastActionMessage.value = t('nodes.sceneLayout.exportPreparing')
	if (!canvasRef.value) {
		lastActionMessage.value = t('nodes.sceneLayout.exportCanvasError')
		return { ok: false, error: t('nodes.sceneLayout.errorCanvasNotMounted') }
	}
	if (!previewActive.value) {
		lastActionMessage.value = t('nodes.sceneLayout.exportPreviewError')
		return { ok: false, error: t('nodes.sceneLayout.errorNeedPreviewMode') }
	}
	ensureViewer()
	if (!viewer) {
		await nextTick()
	}
	if (!viewer) {
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
	}
	if (!viewer) {
		lastActionMessage.value = t('nodes.sceneLayout.exportViewerError')
		return { ok: false, error: t('nodes.sceneLayout.errorViewerNotReady') }
	}
	viewer.setRenderSuspended(false)
	viewer.setInteractive(true)
	const itemId = selectedPreviewItemId.value
	if (!itemId) {
		lastActionMessage.value = t('nodes.sceneLayout.exportSelectError')
		return { ok: false, error: t('nodes.sceneLayout.errorSelectPlaceholder') }
	}
	viewer.setSelectedItem(itemId)

	const setViewerLog = (viewer as unknown as { setExportLogCallback?: (cb: ((msg: string) => void) | null) => void }).setExportLogCallback
	if (setViewerLog) {
		setViewerLog.call(viewer, (msg: string) => {
			lastActionMessage.value = t('nodes.sceneLayout.exportLog', { msg })
		})
	}

	lastActionMessage.value = t('nodes.sceneLayout.exportingGLB')
	try {
		const selectedItem = layoutItems.value.find((item) => item.id === itemId)
		const itemName = selectedItem?.name || selectedItem?.id || itemId
		const glbData = await viewer.exportPlaceholderGLB(itemId, itemName)
		if (setViewerLog) setViewerLog.call(viewer, null)
		if (!glbData) {
			lastActionMessage.value = t('nodes.sceneLayout.exportNoData')
			return { ok: false, error: t('nodes.sceneLayout.errorNoGeometry') }
		}
		lastActionMessage.value = t('nodes.sceneLayout.exportSuccess', { name: itemName })
		return { ok: true, glbData, name: itemName }
	} catch (err) {
		const setViewerLogCleanup = (viewer as unknown as { setExportLogCallback?: (cb: ((msg: string) => void) | null) => void }).setExportLogCallback
		if (setViewerLogCleanup) setViewerLogCleanup.call(viewer, null)
		const errMessage =
			isObject(err) && isString(err.message) ? err.message : String(err ?? 'unknown')
		lastActionMessage.value = t('nodes.sceneLayout.exportFailed', { error: errMessage })
		return { ok: false, error: t('nodes.sceneLayout.errorGLBExportFailed', { error: errMessage }) }
	}
}

defineExpose({
	getResolvedLayoutForUnreal,
	exportSelectedPlaceholderGLB
})
</script>

<style scoped>
.wf-scene-layout {
	width: 100%;
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

.wf-scene-layout-btn-active {
	background: rgba(59, 130, 246, 0.7) !important;
	color: #fff !important;
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

.wf-scene-layout-orientation-group {
	position: relative;
	display: flex;
	align-items: stretch;
}

.wf-scene-layout-orientation-main {
	border-top-right-radius: 0;
	border-bottom-right-radius: 0;
	border-right: none;
}

.wf-scene-layout-orientation-caret {
	border-top-left-radius: 0;
	border-bottom-left-radius: 0;
	padding-left: 6px;
	padding-right: 6px;
	display: flex;
	align-items: center;
	justify-content: center;
}

.wf-scene-layout-caret-icon {
	font-size: 10px;
	line-height: 1;
}

.wf-scene-layout-orientation-dropdown {
	position: absolute;
	top: 100%;
	left: 0;
	margin-top: 4px;
	min-width: 160px;
	border: 1px solid rgba(148, 163, 184, 0.22);
	border-radius: 8px;
	background: rgba(15, 23, 42, 0.95);
	backdrop-filter: blur(10px);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
	z-index: 10;
	overflow: hidden;
}

.wf-scene-layout-dropdown-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	font-size: 12px;
	color: rgba(226, 232, 240, 0.9);
	cursor: pointer;
	transition: background 120ms ease;
}

.wf-scene-layout-dropdown-item:hover {
	background: rgba(59, 130, 246, 0.18);
	color: #fff;
}

.wf-scene-layout-dropdown-item.active {
	color: #60a5fa;
}

.wf-scene-layout-dropdown-item.wf-scene-layout-dropdown-reset {
	color: rgba(248, 113, 113, 0.9);
}

.wf-scene-layout-dropdown-item.wf-scene-layout-dropdown-reset:hover {
	background: rgba(239, 68, 68, 0.15);
	color: #fca5a5;
}

.wf-scene-layout-dropdown-check {
	width: 14px;
	text-align: center;
	font-size: 11px;
}

.wf-scene-layout-dropdown-divider {
	height: 1px;
	margin: 4px 0;
	background: rgba(148, 163, 184, 0.18);
}
</style>
