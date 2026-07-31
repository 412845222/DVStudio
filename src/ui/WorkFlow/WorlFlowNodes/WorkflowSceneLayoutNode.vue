<template>
	<WorkflowNodeBase
		ref="baseRef"
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
		:sizeCustomized="sizeCustomized"
		:autoHeight="autoHeight"
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
		@auto-resize="(h: number) => emit('auto-resize', h)"
	>
		<template #body>
			<div
				class="wf-scene-layout"
				data-wf-three-preview="true"
				@pointerdown="onRootPointerDown"
				@pointermove="onRootPointerMove"
				@pointerup="onRootPointerUp"
				@wheel.stop="onRootWheel"
				@click.stop="onNodeBodyClick"
			>
				<div class="wf-scene-layout-toolbar" @pointerdown.stop @pointermove.stop @pointerup.stop>
					<div class="wf-scene-layout-status" :class="`is-${status}`">
						{{ statusLabel }}
					</div>
					<div class="wf-scene-layout-actions">
						<button
							class="wf-scene-layout-btn ghost"
							type="button"
							:disabled="running || !hasRunnableJson"
							@click.stop="(onClickDebug('refresh-btn'), emit('refresh'))"
						>
							{{ t('common.refresh') }}
						</button>
						<button
							class="wf-scene-layout-btn ghost"
							type="button"
							@click.stop="
								(onClickDebug('preview-mode-btn'), emit('update-preview-mode', !previewMode))
							"
						>
							{{
								previewMode
									? t('nodes.sceneLayout.closePreview')
									: t('nodes.sceneLayout.openPreview')
							}}
						</button>
						<button
							class="wf-scene-layout-btn ghost"
							type="button"
							@click.stop="(onClickDebug('cube-mode-btn'), toggleCubeMode())"
						>
							{{ cubeModeLabel }}
						</button>
						<button
							class="wf-scene-layout-btn ghost"
							type="button"
							:disabled="!canToggleSelectedScaleMode"
							@click.stop="(onClickDebug('scale-mode-btn'), toggleSelectedScaleMode())"
						>
							{{ selectedScaleModeLabel }}
						</button>
						<button
							class="wf-scene-layout-btn"
							type="button"
							:disabled="running || !hasRunnableJson"
							@click.stop="handleRunLayoutClick"
						>
							{{ running ? t('nodes.sceneLayout.processing') : t('nodes.sceneLayout.runLayout') }}
						</button>
					</div>
				</div>

				<!-- 参考Model3D：独立的viewer-shell，绑定完整pointer事件链和详细日志 -->
				<div
					class="wf-scene-layout-viewer-shell"
					data-wf-node-drag-ignore="true"
					@pointerdown.stop
					@wheel.stop="onStageWheel"
					@contextmenu.prevent.stop
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
						@start="handlePreviewStart"
					>
						<canvas
							ref="canvasRef"
							class="wf-scene-layout-canvas"
							:class="{ live: previewActive }"
							tabindex="0"
							data-wf-scene-layout-canvas="true"
							data-wf-node-drag-ignore="true"
							@contextmenu.prevent.stop
						/>
						<template #overlay>
							<!-- ========= 覆盖层容器：默认pointer-events:none，仅内部交互按钮恢复 ========= -->
							<!-- 这是关键：防止覆盖层自身拦截canvas事件 -->
							<!-- 【BUGFIX 2026-07】加 @contextmenu.prevent.stop，避免在覆盖层容器内右键冒泡到 WorkflowNodeWrapper 触发节点菜单 -->
							<div
								v-if="previewMode && previewInteractive && layoutItems.length"
								class="wf-scene-layout-overlay-tools"
								@pointerdown="onOverlayToolsPointerDown"
								@contextmenu.prevent.stop
							>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									@click.stop="togglePlaceholderVisibility"
								>
									{{
										hidePlaceholderCubes
											? t('nodes.sceneLayout.showCubes')
											: t('nodes.sceneLayout.hideCubes')
									}}
								</button>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									@click.stop="toggleLightingPreview"
								>
									{{
										lightingPreviewEnabled
											? t('nodes.sceneLayout.lightingPreviewOn')
											: t('nodes.sceneLayout.lightingPreview')
									}}
								</button>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									:disabled="!lightingPreviewEnabled"
									@click.stop="toggleLightingDebug"
								>
									{{
										lightingDebugEnabled
											? t('nodes.sceneLayout.lightingDebugOn')
											: t('nodes.sceneLayout.lightingDebug')
									}}
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
								@pointerdown="onOverlayLightingDockPointerDown"
								@contextmenu.prevent.stop
							>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									@click.stop="lightingPanelCollapsed = !lightingPanelCollapsed"
								>
									{{
										lightingPanelCollapsed
											? t('nodes.sceneLayout.lightControlPanel')
											: t('nodes.sceneLayout.collapseLightControl')
									}}
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
								@pointerdown="onOverlayLightingControlsPointerDown"
								@contextmenu.prevent.stop
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
								@pointerdown.stop="onOverlayPerfPanelPointerDown"
								@contextmenu.prevent.stop
							>
								<button
									class="wf-scene-layout-btn ghost wf-scene-layout-overlay-btn"
									type="button"
									@click.stop="perfPanelCollapsed = !perfPanelCollapsed"
								>
									{{
										perfPanelCollapsed
											? t('nodes.sceneLayout.perfPanel')
											: t('nodes.sceneLayout.collapsePerf')
									}}
								</button>
								<div v-if="!perfPanelCollapsed" class="wf-scene-layout-perf-card">
									<div class="wf-scene-layout-perf-title">
										{{ t('nodes.sceneLayout.threePerf') }}
									</div>
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
							<div
								v-if="previewInteractive && viewer"
								class="wf-scene-layout-gesture-tip"
								@pointerdown="onOverlayGestureTipPointerDown"
								@contextmenu.prevent.stop
							>
								{{ t('nodes.sceneLayout.interactionHint') }}
							</div>
						</template>
					</WorkflowThreePreviewShell>
					<!-- 闭合：wf-scene-layout-viewer-shell 开始于第84行 -->
				</div>
				<!-- 闭合：wf-scene-layout -->
			</div>
		</template>

		<template #footer>
			<div class="wf-scene-layout-footer" @pointerdown.stop>
				<div class="wf-scene-layout-kv">
					<div>{{ t('nodes.sceneLayout.previewMode') }}</div>
					<div>{{ previewMode ? t('common.enabled') : t('common.disabled') }}</div>
					<div>{{ t('nodes.sceneLayout.inputJson') }}</div>
					<div>
						{{
							hasInputJson ? t('nodes.sceneLayout.connected') : t('nodes.sceneLayout.notConnected')
						}}
					</div>
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
	WorkflowThreePreviewPhase,
	WorkflowThreePreviewProgressPayload,
	WorkflowThreePreviewState
} from './three-preview/types'
import { isObject, isString } from '../../../types/utils'
import { diagnoseDwebAsset } from '../../../electronBridge'

const { t } = useI18n()

const SCENE3D_DEBUG = true
const sceneLog = (...args: any[]) => {
	if (SCENE3D_DEBUG) console.log('[SceneLayout3D]', ...args)
}

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
	sizeCustomized?: boolean
	autoHeight?: boolean
}>()

const baseRef = ref<InstanceType<typeof WorkflowNodeBase> | null>(null)
const requestResize = () => {
	nextTick(() => {
		baseRef.value?.requestAutoResize()
		setTimeout(() => baseRef.value?.requestAutoResize(), 50)
	})
}

const onStartLink = (payload: {
	nodeId: string
	anchorId: string
	anchorIndex: number
	event: PointerEvent
}) => {
	emit('start-link', payload)
}
const onEndLink = (payload: { nodeId: string; anchorId: string; anchorIndex: number }) => {
	emit('end-link', payload)
}
const onSetType = (
	type:
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
) => {
	emit('set-type', type)
}
const onResize = (payload: { width: number; height: number; worldX: number; worldY: number }) => {
	emit('resize', payload)
}

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
	(e: 'auto-resize', height: number): void
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

const internalPreviewRequestId = ref(0)
const internalPreviewPhase = ref<WorkflowThreePreviewPhase>('masked')
const internalPreviewProgress = ref(0)
const internalPreviewLabel = ref('')
const autoStartTriggered = ref(false)
const internalPreviewState = computed<WorkflowThreePreviewState>(() => ({
	phase: internalPreviewPhase.value,
	canStart: true,
	progress: internalPreviewProgress.value,
	label: internalPreviewLabel.value,
	requestId: internalPreviewRequestId.value
}))

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
const threePreviewState = computed(() => {
	const internal = internalPreviewState.value
	const external = props.threePreviewState
	// 内部loading/interactive优先级更高：如果内部已经启动预览，就使用内部状态
	// 防止外部useAIWorkflowThreejsLifecycleManager（可能因activeNodeId）返回masked，
	// 导致OrbitControls被禁用或遮罩层遮挡
	if (internal && (internal.phase === 'loading' || internal.phase === 'interactive')) {
		return internal
	}
	return external ?? internal
})
const previewPhase = computed(() => threePreviewState.value?.phase ?? 'masked')
const previewRequestId = computed(() => Number(threePreviewState.value?.requestId ?? 0))
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
const messageText = computed(() =>
	String(settings.value?.message ?? t('nodes.sceneLayout.waitingJson'))
)
const cubeModeLabel = computed(() =>
	renderTransparent.value ? t('nodes.sceneLayout.translucent') : t('nodes.sceneLayout.opaque')
)
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
	return selectedScaleMode.value === 'model'
		? t('nodes.sceneLayout.modelScale')
		: t('nodes.sceneLayout.placeholderScale')
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
		selectedPreviewItem.value?.name ||
		selectedPreviewItem.value?.id ||
		t('nodes.sceneLayout.noPlaceholderSelected')
	const output =
		selectedPlaceholderOutputItem.value?.name ||
		selectedPlaceholderOutputItem.value?.id ||
		t('nodes.sceneLayout.notSpecified')
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
	const modeText =
		fix.mode === 'manual'
			? t('nodes.sceneLayout.orientationManual')
			: t('nodes.sceneLayout.orientationAuto')
	const confidenceText =
		fix.confidence === 'high'
			? t('nodes.sceneLayout.confidenceHigh')
			: t('nodes.sceneLayout.confidenceLow')
	const yaw = Number.isFinite(Number(fix.yaw)) ? Number(fix.yaw).toFixed(1) : '0.0'
	const pitch = Number.isFinite(Number(fix.pitch)) ? Number(fix.pitch).toFixed(1) : '0.0'
	const roll = Number.isFinite(Number(fix.roll)) ? Number(fix.roll).toFixed(1) : '0.0'
	return t('nodes.sceneLayout.orientationStatus', {
		mode: modeText,
		confidence: confidenceText,
		yaw,
		pitch,
		roll
	})
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
	return String(selectedPreviewItem.value.fillMode ?? '').trim()
		? t('nodes.sceneLayout.cancelCycle')
		: t('nodes.sceneLayout.cycleFill')
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
	return t('nodes.sceneLayout.fitStatus', {
		mode: fitModeLabel,
		message: fitMessage || t('nodes.sceneLayout.fitUpdated')
	})
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
		meta.lightsCount > 0
			? t('nodes.sceneLayout.lightingLocalLights', { count: meta.lightsCount })
			: t('nodes.sceneLayout.lightingGlobalOnly'),
		meta.preset || meta.style || t('nodes.sceneLayout.lightingNoStyle')
	].filter(Boolean)
	const summaryText = meta.summary ? ` · ${meta.summary}` : ''
	return t('nodes.sceneLayout.lightingConnected', {
		details: detailParts.join(' · '),
		summary: summaryText
	})
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
		// 【BUGFIX 2026-07】始终优先恢复"用户上次设置的视角"：
		// - 之前：只有 cameraUserControlled=false 且 signature 未变化时才走缓存 → 用户每次生成布局（signature 必变）
		//   或手动调过镜头（cameraUserControlled=true）后就再也恢复不到自己的视角，每次都从头拖
		// - 现在：只要缓存里有就一定恢复（setLayout 内部已经会在 cachedView!=null 时 allowAutoFit=false，
		//   不会再去自动 fit 把用户视角冲掉；只有 cache 没值时才从 settings.camera 或默认视角初始化）
		const cachedViewForWatch = SCENE_LAYOUT_VIEWSTATE_CACHE.get(snapshotCacheKey) ?? null
		viewer?.setLayout(
			layoutItems.value,
			cachedViewForWatch ? null : settings.value?.camera,
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
			cachedViewForWatch
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
	console.log('[SceneLayout:transfer] outputSelectedPlaceholder called')
	const selectedId = String(selectedPreviewItemId.value ?? '').trim()
	console.log('[SceneLayout:transfer] selectedId:', selectedId, 'canOutputSelectedPlaceholder:', canOutputSelectedPlaceholder.value)
	if (!selectedId || !canOutputSelectedPlaceholder.value) {
		console.warn('[SceneLayout:transfer] outputSelectedPlaceholder early return', { selectedId, canOutput: canOutputSelectedPlaceholder.value })
		return
	}
	console.log('[SceneLayout:transfer] emitting set-selected-placeholder-output with id:', selectedId)
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
	if (previewInteractive.value !== undefined) {
		sceneLog('syncViewerState: setInteractive', {
			nodeId: props.nodeId,
			interactive: previewInteractive.value,
			suspended: previewSuspended.value,
			phase: previewPhase.value
		})
	}
	viewer.setInteractive(previewInteractive.value)
	viewer.setSelectedItem(effectiveHidePlaceholderCubes ? '' : selectedPreviewItemId.value)
	const currentSignature = layoutItemsSignature.value
	const signatureChanged = currentSignature !== cachedLayoutSignature
	// 【BUGFIX 2026-07】syncViewerState 时也始终用缓存视角恢复（不再受 signatureChanged/cameraUserControlled 限制）：
	// - 原先只有"签名没变化且用户没手动动过"才走缓存 → 每次生成布局（签名必变）、或者用户拖过镜头之后，
	//   后续的重新渲染都会把视角重置为默认。
	// - 现在只要缓存里有就恢复，与签名无关、与 cameraUserControlled 无关。
	//   只有缓存为空（首次进入 / 从没拖过镜头）时才从 settings.camera 初始化。
	const cachedView = SCENE_LAYOUT_VIEWSTATE_CACHE.get(snapshotCacheKey) ?? null
	if (signatureChanged) {
		// 仍保留 cameraUserControlled 的 reset 语义用于"从外部 settings.camera 注入新视角"的历史兼容路径：
		// 只有当用户从来没手动保存过任何视角（cache 为空），且签名真的发生变化时，才把 cameraUserControlled 复位。
		if (!cachedView) {
			cameraUserControlled = false
		}
	}
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

const setPreviewPhase = (phase: WorkflowThreePreviewPhase) => {
	internalPreviewPhase.value = phase
	if (phase === 'masked') {
		internalPreviewProgress.value = 0
		internalPreviewLabel.value = ''
	}
}
const setPreviewProgress = (progress: number, label?: string) => {
	internalPreviewProgress.value = Math.max(0, Math.min(1, progress))
	if (label !== undefined) internalPreviewLabel.value = label
}
const startPreview = () => {
	internalPreviewRequestId.value += 1
	const newRequestId = internalPreviewRequestId.value
	activePreviewRequestId = newRequestId
	lastActionMessage.value = ''
	setPreviewPhase('loading')
	setPreviewProgress(0.12, t('nodes.sceneLayout.progressInitRenderer'))
	void startPreviewLoad(newRequestId)
}
const handlePreviewStart = () => {
	emit('start-three-preview')
	startPreview()
}
const handlePreviewReady = () => {
	setPreviewPhase('interactive')
	emit('three-preview-ready')
}
const handlePreviewError = () => {
	setPreviewPhase('masked')
	emit('three-preview-error')
}

const emitPreviewProgress = (progress: number, label: string) => {
	emit('three-preview-progress', { progress, label })
	setPreviewProgress(progress, label)
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

/* ============================================================
 * 【场景布局节点 鼠标事件诊断日志系统】
 *  包含多层级DOM的事件监听：
 *   - L1: .wf-scene-layout（根节点）
 *   - L2: .wf-scene-layout-viewer-shell（viewer外壳，参考Model3D）
 *   - L3: .wf-scene-layout-stage（stage层）
 *   - L4: <canvas> 元素自身
 *   - L5: .wf-three-shell-* 内部覆盖层
 *   - L6: overlay slot中的工具条容器（overlay-tools/lighting-dock等）
 *   - Extra: document级命中测试 elementFromPoint
 *  所有日志前缀统一为【SceneLayoutEvent】方便过滤
 * ============================================================ */

// ---------- 通用：打印事件关键信息 ----------
function _buildEventSnippet(e: PointerEvent | WheelEvent | MouseEvent) {
	const tgt = e.target as HTMLElement | null
	const cur = e.currentTarget as HTMLElement | null
	const phaseMap = ['NONE', 'CAPTURE(1)', 'AT_TARGET(2)', 'BUBBLE(3)']
	return {
		eventPhase: phaseMap[e.eventPhase] ?? `UNKNOWN(${e.eventPhase})`,
		type: e.type,
		'clientX/Y': 'clientX' in e ? `${e.clientX},${e.clientY}` : null,
		'offsetX/Y':
			'offsetX' in e ? `${(e as PointerEvent).offsetX},${(e as PointerEvent).offsetY}` : null,
		button: 'button' in e ? (e as PointerEvent).button : null,
		buttons: 'buttons' in e ? (e as PointerEvent).buttons : null,
		pointerId: 'pointerId' in e ? (e as PointerEvent).pointerId : null,
		pointerType: 'pointerType' in e ? (e as PointerEvent).pointerType : null,
		targetClass: tgt?.className?.toString()?.slice(0, 160) ?? null,
		targetTag: tgt?.tagName ?? null,
		targetData: tgt
			? {
					role: tgt.getAttribute('data-wf-three-preview'),
					canvas: tgt.getAttribute('data-wf-scene-layout-canvas'),
					dragIgnore: tgt.getAttribute('data-wf-node-drag-ignore')
				}
			: null,
		currentTargetClass: cur?.className?.toString()?.slice(0, 160) ?? null,
		currentTargetTag: cur?.tagName ?? null,
		bubbles: e.bubbles,
		cancelable: e.cancelable,
		defaultPrevented: e.defaultPrevented,
		propagationStopped: (e as any).cancelBubble ?? false,
		'[STATE] previewInteractive': previewInteractive.value,
		'[STATE] previewActive': previewActive.value,
		'[STATE] viewer.exists': !!viewer,
		'[STATE] viewer.controls.enabled': viewer?.['controls']?.['enabled'] ?? null,
		'[STATE] threePreviewState.phase': threePreviewState.value?.phase ?? null,
		'[STATE] threePreviewState.canStart': threePreviewState.value?.canStart ?? null,
		'[STATE] threePreviewState.progress': threePreviewState.value?.progress ?? null,
		'[STATE] threePreviewState.label': threePreviewState.value?.label ?? null
	}
}

// 带节流的日志打印，避免鼠标移动时刷屏
const _THROTTLE_MS = 400
const _lastMoveLogAt = { root: 0, stage: 0, canvas: 0, doc: 0 }

// ---------- L1根节点日志 ----------
const onRootPointerDown = (e: PointerEvent) => {
	console.log(
		'%c【SceneLayoutEvent#L1-ROOT】pointerdown',
		'color:#d97706;font-weight:bold',
		_buildEventSnippet(e)
	)
	console.log(
		'  → root层 @pointerdown 没有 .stop，事件会继续冒泡。如果日志只到这里就停，说明冒泡到WorkflowNodeBase被stop了，需要在canvas/viewer-shell层加.stop'
	)
}
const onRootPointerMove = (e: PointerEvent) => {
	const now = Date.now()
	if (now - _lastMoveLogAt.root < _THROTTLE_MS) return
	_lastMoveLogAt.root = now
	console.log('%c【SceneLayoutEvent#L1-ROOT】pointermove (节流)', 'color:#d97706', {
		type: e.type,
		target: (e.target as HTMLElement)?.className,
		previewInteractive: previewInteractive.value
	})
}
const onRootPointerUp = (e: PointerEvent) => {
	console.log('%c【SceneLayoutEvent#L1-ROOT】pointerup', 'color:#d97706', _buildEventSnippet(e))
}
const onRootWheel = (e: WheelEvent) => {
	console.log(
		'%c【SceneLayoutEvent#L1-ROOT】wheel (.stop已生效)',
		'color:#d97706',
		_buildEventSnippet(e)
	)
}

// ---------- L2 Viewer-Shell层日志（独立shell，参考Model3D结构） ----------
const onStagePointerDown = (e: PointerEvent) => {
	// 带.stop的handler - 核心作用是阻止事件冒泡到WorkflowNodeBase拖拽系统
	console.log(
		'%c【SceneLayoutEvent#L2-VIEWERSHELL】pointerdown (.stop已触发) ✅',
		'color:#059669;font-weight:bold',
		_buildEventSnippet(e)
	)
	_hitTestAtEvent(e)
}
const onStagePointerDownLog = (e: PointerEvent) => {
	console.log(
		'%c【SceneLayoutEvent#L2-VIEWERSHELL】pointerdown 捕获记录',
		'color:#059669',
		_buildEventSnippet(e)
	)
}
const onStagePointerMoveLog = (e: PointerEvent) => {
	const now = Date.now()
	if (now - _lastMoveLogAt.stage < _THROTTLE_MS) return
	_lastMoveLogAt.stage = now
	console.log('%c【SceneLayoutEvent#L2-VIEWERSHELL】pointermove (节流)', 'color:#059669', {
		type: e.type,
		target: (e.target as HTMLElement)?.className,
		controlsEnabled: viewer?.['controls']?.['enabled'] ?? null
	})
}
const onStagePointerUpLog = (e: PointerEvent) => {
	console.log(
		'%c【SceneLayoutEvent#L2-VIEWERSHELL】pointerup',
		'color:#059669',
		_buildEventSnippet(e)
	)
}
const onStagePointerCancelLog = (e: PointerEvent) => {
	console.warn(
		'%c【SceneLayoutEvent#L2-VIEWERSHELL】pointercancel ❗',
		'color:#dc2626',
		_buildEventSnippet(e)
	)
}
const onStageWheel = (e: WheelEvent) => {
	console.log(
		'%c【SceneLayoutEvent#L2-VIEWERSHELL】wheel (.stop已触发)',
		'color:#059669',
		_buildEventSnippet(e)
	)
}

// ---------- L4 Canvas自身日志（捕获 + 冒泡双重记录） ----------
const onCanvasPointerDownCapture = (e: PointerEvent) => {
	console.log(
		'%c【SceneLayoutEvent#L4-CANVAS】pointerdown CAPTURE ✨✨✨',
		'color:#2563eb;background:#dbeafe;font-weight:bold;padding:2px 6px;border-radius:4px',
		_buildEventSnippet(e)
	)
	// 关键：如果这里被触发了，说明事件真正到达了canvas！如果没看到，说明在上层被遮挡
}
const onCanvasPointerDown = (e: PointerEvent) => {
	console.log(
		'%c【SceneLayoutEvent#L4-CANVAS】pointerdown BUBBLE(.stop已阻止冒泡) ✅✅✅',
		'color:#1d4ed8;background:#bfdbfe;font-weight:bold;padding:2px 6px;border-radius:4px',
		_buildEventSnippet(e)
	)
	console.log(
		'  → 🎯 如果您看到这条日志，意味着pointer事件已经成功到达<canvas>！OrbitControls此时应该能收到mousedown/poinerdown事件（它监听canvas的pointerdown）'
	)
}
const onCanvasPointerMoveCapture = (e: PointerEvent) => {
	const now = Date.now()
	if (now - _lastMoveLogAt.canvas < _THROTTLE_MS) return
	_lastMoveLogAt.canvas = now
	console.log(
		'%c【SceneLayoutEvent#L4-CANVAS】pointermove CAPTURE (节流)',
		'color:#2563eb',
		_buildEventSnippet(e)
	)
}
const onCanvasPointerMove = (e: PointerEvent) => {
	// 注意：此处仅 .stop（冒泡），不再 .prevent —— 避免 OrbitControls 内部 setPointerCapture 被误伤
	console.log(
		'%c【SceneLayoutEvent#L4-CANVAS】pointermove BUBBLE (.stop已触发, prevent已移除 → 避免OrbitControls状态残留)',
		'color:#2563eb',
		_buildEventSnippet(e)
	)
}
const onCanvasPointerUpCapture = (e: PointerEvent) => {
	console.log(
		'%c【SceneLayoutEvent#L4-CANVAS】pointerup CAPTURE',
		'color:#2563eb',
		_buildEventSnippet(e)
	)
}
const onCanvasPointerUp = (e: PointerEvent) => {
	console.log(
		'%c【SceneLayoutEvent#L4-CANVAS】pointerup BUBBLE (.stop已触发)',
		'color:#2563eb',
		_buildEventSnippet(e)
	)
}
const onCanvasPointerCancelCapture = (e: PointerEvent) => {
	console.warn(
		'%c【SceneLayoutEvent#L4-CANVAS】pointercancel CAPTURE ❗',
		'color:#dc2626',
		_buildEventSnippet(e)
	)
}
const onCanvasPointerCancel = (e: PointerEvent) => {
	console.warn(
		'%c【SceneLayoutEvent#L4-CANVAS】pointercancel BUBBLE (.stop已触发) ❗ → safeEndOrbit 会被触发',
		'color:#dc2626',
		_buildEventSnippet(e)
	)
}
const onCanvasWheel = (e: WheelEvent) => {
	console.log(
		'%c【SceneLayoutEvent#L4-CANVAS】wheel (.stop.prevent已触发)',
		'color:#2563eb',
		_buildEventSnippet(e)
	)
}

// ---------- L6 覆盖层容器日志（用于诊断"是否被这些层遮挡"） ----------
const onOverlayToolsPointerDown = (e: PointerEvent) => {
	console.warn(
		'%c【SceneLayoutEvent#L6-OVERLAY】overlay-tools pointerdown （如果不是点按钮说明这个容器拦截了事件！）',
		'color:#ea580c;background:#fff7ed;font-weight:bold',
		_buildEventSnippet(e)
	)
	console.warn('  → 建议：这个容器应该设置 pointer-events: none，内部按钮设置 pointer-events: auto')
}
const onOverlayLightingDockPointerDown = (e: PointerEvent) => {
	console.warn(
		'%c【SceneLayoutEvent#L6-OVERLAY】lighting-dock pointerdown （如果不是点按钮说明拦截！）',
		'color:#ea580c;background:#fff7ed',
		_buildEventSnippet(e)
	)
}
const onOverlayLightingControlsPointerDown = (e: PointerEvent) => {
	console.warn(
		'%c【SceneLayoutEvent#L6-OVERLAY】lighting-controls pointerdown （如果不是点内部控件说明拦截！）',
		'color:#ea580c;background:#fff7ed',
		_buildEventSnippet(e)
	)
}
const onOverlayPerfPanelPointerDown = (e: PointerEvent) => {
	console.warn(
		'%c【SceneLayoutEvent#L6-OVERLAY】perf-panel pointerdown (.stop已触发)',
		'color:#ea580c;background:#fff7ed',
		_buildEventSnippet(e)
	)
}
const onOverlayGestureTipPointerDown = (e: PointerEvent) => {
	console.warn(
		'%c【SceneLayoutEvent#L6-OVERLAY】gesture-tip pointerdown ❗（这个元素本应pointer-events:none！）',
		'color:#dc2626;background:#fee2e2;font-weight:bold',
		_buildEventSnippet(e)
	)
}

// ---------- 按钮点击调试 ----------
const onClickDebug = (btnName: string) => {
	console.log(`%c【SceneLayoutEvent#BTN】按钮点击: ${btnName}`, 'color:#4f46e5;font-weight:bold')
}

const handleRunLayoutClick = () => {
	onClickDebug('run-layout-btn')
	console.info('【SCENE-LAYOUT-CHAIN】⓪ WorkflowSceneLayoutNode about to emit run-scene-layout')
	emit('run-scene-layout')
	console.info('【SCENE-LAYOUT-CHAIN】⓪ WorkflowSceneLayoutNode emit run-scene-layout DONE')
}

// ---------- 命中测试：在点击发生时，用document.elementFromPoint逐层查看z-index顺序 ----------
function _hitTestAtEvent(e: PointerEvent | WheelEvent | MouseEvent) {
	const cx = 'clientX' in e ? e.clientX : 0
	const cy = 'clientY' in e ? e.clientY : 0
	if (cx === 0 && cy === 0) return

	const stack: Array<{
		tag: string
		cls: string
		zIndex: string
		pointerEvents: string
		topLayer: boolean
	}> = []
	let el = document.elementFromPoint(cx, cy) as HTMLElement | null
	let safety = 0
	while (el && safety < 30) {
		const cs = getComputedStyle(el)
		stack.push({
			tag: el.tagName,
			cls: (el.className || '').toString().slice(0, 140),
			zIndex: cs.zIndex,
			pointerEvents: cs.pointerEvents,
			topLayer:
				el.classList.contains('wf-three-shell-overlay') ||
				el.classList.contains('wf-three-shell-snapshot')
		})
		// 检查是否有覆盖层，继续找元素下面的被遮挡元素无法用elementFromPoint，但找父链有用
		el = el.parentElement
		safety++
	}
	console.log(
		`%c【SceneLayoutEvent#HitTest】点击位置(${cx},${cy})的元素链 (${stack.length}层)：`,
		'color:#7c3aed;font-weight:bold;background:#f5f3ff;padding:2px 6px;border-radius:4px'
	)
	stack.forEach((s, i) => {
		const pad = '  '.repeat(i)
		const mark = s.pointerEvents === 'none' ? '🔵' : s.pointerEvents === 'auto' ? '🔴(拦截!)' : '⚪'
		console.log(
			`   ${pad}[${i}] ${mark} <${s.tag}> class=${s.cls || '(无)'}  z=${s.zIndex || 'auto'}  pointer-events=${s.pointerEvents}  ${s.topLayer ? '⚠️THREE-INTERNAL-OVERLAY' : ''}`
		)
	})

	// 额外判断：如果最顶层的指针事件不是auto且不是canvas，给出诊断提示
	const tipEls = stack
		.filter(
			(s) =>
				s.pointerEvents === 'auto' &&
				!s.cls.includes('canvas') &&
				!s.cls.includes('WorkflowThreePreviewShell-btn')
		)
		.filter(
			(s) => s.cls.includes('wf-three-shell-overlay') || s.cls.includes('wf-three-shell-snapshot')
		)
	if (tipEls.length) {
		console.error(
			'%c【SceneLayoutEvent#诊断 ❗】找到 pointer-events:auto 且非canvas/btn 的覆盖层！这就是"完全遮挡"的根因，请禁用它们的pointer-events',
			'color:#dc2626;background:#fee2e2;font-weight:bold;padding:4px 8px;border-radius:4px',
			tipEls
		)
	}
}

// ---------- onMounted中：直接给canvas绑原生原生监听器（绕过Vue的事件系统），并在document监听捕获阶段 ----------
const _nativeCanvasListenersCleanupFns: Array<() => void> = []
function _installNativeDiagnosticListeners() {
	const canvas = canvasRef.value as HTMLCanvasElement | null
	if (!canvas) {
		console.warn('%c【SceneLayoutEvent#Native】canvasRef 尚不可用，稍后重试', 'color:#9333ea')
		return
	}
	const handlers: Record<string, (ev: any) => void> = {
		pointerdown: (ev) => {
			console.log(
				'%c【SceneLayoutEvent#Native@canvas】pointerdown (原生addEventListener) 🌟',
				'color:#be185d;background:#fce7f3;font-weight:bold;padding:2px 6px;border-radius:4px',
				_buildEventSnippet(ev)
			)
		},
		pointermove: (ev) => {
			const now = Date.now()
			if (now - _lastMoveLogAt.doc < 1200) return
			_lastMoveLogAt.doc = now
			console.log('%c【SceneLayoutEvent#Native@canvas】pointermove (原生节流)', 'color:#be185d', {
				buttons: ev.buttons,
				ctrl: ev.ctrlKey
			})
		},
		pointerup: (ev) =>
			console.log(
				'%c【SceneLayoutEvent#Native@canvas】pointerup (原生)',
				'color:#be185d',
				_buildEventSnippet(ev)
			),
		wheel: (ev) =>
			console.log(
				'%c【SceneLayoutEvent#Native@canvas】wheel (原生)',
				'color:#be185d',
				_buildEventSnippet(ev)
			),
		mousedown: (ev) =>
			console.log(
				'%c【SceneLayoutEvent#Native@canvas】mousedown (原生，OrbitControls也会监听这个!) ⭐',
				'color:#be185d;font-weight:bold',
				_buildEventSnippet(ev)
			)
	}
	Object.entries(handlers).forEach(([type, fn]) => {
		canvas.addEventListener(type, fn, true) // true = 捕获阶段，最优先
		_nativeCanvasListenersCleanupFns.push(() => canvas.removeEventListener(type, fn, true))
	})

	// ---------- Document级捕获监听：诊断事件在何时被何人stopPropagation ----------
	// 如果到达document的捕获阶段说明没有在上层DOM树被stop
	;['pointerdown', 'pointerup', 'mousedown'].forEach((type) => {
		const docFn = (ev: Event) => {
			const pe = ev as PointerEvent
			const tgt = pe.target as HTMLElement | null
			// 只过滤跟本节点相关的事件（canvas属于本节点或在本节点DOM范围内）
			if (!tgt) return
			const within = tgt.closest('.wf-scene-layout')
			if (!within) return
			console.log(
				`%c【SceneLayoutEvent#DocCapture】document ${type} (捕获阶段)`,
				'color:#334155;background:#f1f5f9;padding:2px 6px;border-radius:4px',
				{
					targetTag: tgt.tagName,
					targetClass: tgt.className?.toString()?.slice(0, 120) || null,
					'defaultPrevented?': pe.defaultPrevented,
					'eventPhase=CAPTURE(1)?': pe.eventPhase === 1
				}
			)
		}
		document.addEventListener(type, docFn, true)
		_nativeCanvasListenersCleanupFns.push(() => document.removeEventListener(type, docFn, true))
	})

	console.log(
		'%c【SceneLayoutEvent#Init】✅ 原生诊断监听器已安装到canvas & document',
		'color:#16a34a;font-weight:bold'
	)
}
function _uninstallNativeDiagnosticListeners() {
	while (_nativeCanvasListenersCleanupFns.length) {
		const fn = _nativeCanvasListenersCleanupFns.pop()
		if (typeof fn === 'function') fn()
	}
}

const createViewerNow = () => {
	const canvas = canvasRef.value
	if (viewer || !canvas) return false
	if (!canvas.isConnected) return false
	const rect = canvas.getBoundingClientRect()
	if (rect.width <= 0 || rect.height <= 0) {
		// eslint-disable-next-line no-console
		console.info('[SCENE-LAYOUT-PREVIEW] createViewerNow: canvas size invalid', {
			nodeId: props.nodeId,
			width: rect.width,
			height: rect.height,
			isConnected: canvas.isConnected
		})
		return false
	}
	// eslint-disable-next-line no-console
	console.info('[SCENE-LAYOUT-PREVIEW] createViewerNow: creating viewer...', {
		nodeId: props.nodeId,
		canvasSize: { width: rect.width, height: rect.height }
	})
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
			/**
			 * 【BUGFIX 2026-07】
			 * - onCameraInteractionEnd：用户松开鼠标/停止滚轮时（节流尾部）仍调用 saveViewState，保留原有兜底
			 * - 新增 onViewStateChange：在用户拖拽镜头过程中每 ~120ms 节流通知一次，
			 *   保证"用户正在调视角，中途立刻点生成布局"这种极端操作也能把刚调的视角写进缓存，
			 *   下次渲染时不用再从默认位置从头拖一遍。
			 */
			onCameraInteractionEnd: () => {
				saveViewState()
			},
			onViewStateChange: (state) => {
				if (!snapshotCacheKey) return
				SCENE_LAYOUT_VIEWSTATE_CACHE.set(snapshotCacheKey, state)
			}
		})
		viewer.setHolePunchStateChangeCallback((state) => {
			holePunchMode.value = state.mode
			holePunchStep.value = state.step
			holePunchTargetId.value = state.targetId
			holePunchToolId.value = state.toolId
		})
		viewerInitCooldownUntil = 0
		viewer.setRenderSuspended(previewSuspended.value)
		viewer.setInteractive(false)
		syncViewerState()
		return true
	} catch (err) {
		viewer = null
		viewerInitCooldownUntil = Date.now() + 400
		const errMessage =
			isObject(err) && isString(err.message) ? err.message : String(err ?? 'unknown')
		lastActionMessage.value = t('nodes.sceneLayout.msgViewerInitFailed', { error: errMessage })
		return false
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
			if (!viewer && canvasRef.value && canvasRef.value.isConnected) {
				const rect = canvasRef.value.getBoundingClientRect()
				if (rect.width <= 0 || rect.height <= 0) {
					viewerInitCooldownUntil = Date.now() + 80
					ensureViewer()
				}
			}
		})
	})
}

const disposeViewer = (reason?: string) => {
	clearViewerInitSchedule()
	viewerInitCooldownUntil = 0
	stopPerfPolling()
	if (!viewer) return
	sceneLog('disposeViewer:', { nodeId: props.nodeId, reason: reason || 'explicit' })
	saveViewState()
	captureSnapshot()
	viewer.dispose()
	viewer = null
	cachedLayoutSignature = '' // 重置缓存签名，下次需要重新setLayout
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
			modelSourcePath:
				diag.repairedAsset.sourcePath || updatedBindings[bindingIndex].modelSourcePath
		}
		emit('update-model-bindings', updatedBindings)
	} catch {
		// ignore
	}
}

const startPreviewLoad = async (requestId: number) => {
	activePreviewRequestId = requestId
	// eslint-disable-next-line no-console
	console.info('[SCENE-LAYOUT-PREVIEW] startPreviewLoad begin', {
		nodeId: props.nodeId,
		requestId,
		layoutItemsLen: layoutItems.value.length,
		previewMode: previewMode.value,
		canvasConnected: !!canvasRef.value?.isConnected
	})
	emitPreviewProgress(0.12, t('nodes.sceneLayout.progressInitRenderer'))
	const ready = await waitForViewerReady()
	if (activePreviewRequestId !== requestId) return
	if (!ready || !viewer) {
		// eslint-disable-next-line no-console
		console.error('[SCENE-LAYOUT-PREVIEW] startPreviewLoad: viewer not ready after wait', {
			ready,
			hasViewer: !!viewer
		})
		handlePreviewError()
		return
	}
	// eslint-disable-next-line no-console
	console.info('[SCENE-LAYOUT-PREVIEW] startPreviewLoad: viewer ready, applying layout...', {
		nodeId: props.nodeId,
		layoutItemsLen: layoutItems.value.length,
		modelBindings: sceneLayoutModelBindings.value.length
	})
	emitPreviewProgress(0.46, t('nodes.sceneLayout.progressApplyLayout'))
	syncViewerState()
	emitPreviewProgress(
		0.78,
		previewMode.value
			? t('nodes.sceneLayout.progressSyncModels')
			: t('nodes.sceneLayout.progressGenerateFrame')
	)
	await viewer.awaitPendingBindingSync(previewMode.value ? 4000 : 800)
	if (activePreviewRequestId !== requestId || !viewer) return
	viewer.requestStaticFrames()
	await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
	if (activePreviewRequestId !== requestId || !viewer) return
	captureSnapshot()
	emitPreviewProgress(0.98, t('nodes.sceneLayout.progressReady'))
	handlePreviewReady()
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
		sceneLog('watch previewInteractive:', {
			nodeId: props.nodeId,
			active,
			previewPhase: previewPhase.value,
			previewSuspended: previewSuspended.value,
			hasViewer: !!viewer,
			viewerInteractiveBefore: !!(viewer as any)?.interactiveActive,
			controlsEnabledBefore: !!(viewer as any)?.controls?.enabled,
			renderSuspendedBefore: !!(viewer as any)?.renderSuspended
		})
		if (active) {
			startPerfPolling()
		} else {
			stopPerfPolling()
		}
		viewer?.setInteractive(active)
		// setInteractive之后记录controls状态
		if (viewer) {
			sceneLog('watch previewInteractive: after setInteractive:', {
				nodeId: props.nodeId,
				viewerInteractiveAfter: !!(viewer as any).interactiveActive,
				controlsEnabledAfter: !!(viewer as any).controls?.enabled
			})
		}
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
	([phase, requestId], oldValue) => {
		const oldPhase = oldValue?.[0]
		sceneLog('watch previewPhase:', {
			nodeId: props.nodeId,
			from: oldPhase,
			to: phase,
			requestId,
			hasViewer: !!viewer
		})
		if (phase === 'masked') {
			activePreviewRequestId = 0
			// 按照用户要求：移除延迟销毁，立即卸载，通过按钮重启
			disposeViewer('masked-direct-dispose')
			return
		}
		ensureViewer()
		viewer?.setRenderSuspended(previewSuspended.value)
		if (phase === 'loading') {
			if (requestId === activePreviewRequestId) return
			void startPreviewLoad(requestId)
			return
		}
		// phase变为interactive，显式重置状态确保overlay隐藏、交互恢复
		if (phase === 'interactive') {
			lastActionMessage.value = ''
			void nextTick(() => {
				if (viewer) {
					viewer.setInteractive(true)
					viewer.setRenderSuspended(previewSuspended.value)
					if (!previewSuspended.value) {
						viewer.requestStaticFrames()
					}
				}
			})
		}
		syncViewerState()
	},
	{ immediate: true, flush: 'post' }
)

// [SCENE-LAYOUT-PREVIEW] 自动启动3D预览：当 previewMode + completed + layoutItems 非空 且预览尚未启动时自动触发
watch(
	() =>
		[
			previewMode.value,
			status.value,
			layoutItems.value.length,
			internalPreviewPhase.value,
			!!canvasRef.value,
			canvasRef.value?.isConnected ?? false
		] as const,
	([mode, st, itemsLen, phase, hasCanvas, canvasConnected]) => {
		const shouldAutoStart =
			mode === true &&
			st === 'completed' &&
			itemsLen > 0 &&
			phase === 'masked' &&
			hasCanvas &&
			canvasConnected &&
			!autoStartTriggered.value
		// eslint-disable-next-line no-console
		console.info('[SCENE-LAYOUT-PREVIEW] autoStart check:', {
			nodeId: props.nodeId,
			mode,
			status: st,
			itemsLen,
			phase,
			hasCanvas,
			canvasConnected,
			autoStartTriggered: autoStartTriggered.value,
			shouldAutoStart
		})
		if (!shouldAutoStart) return
		autoStartTriggered.value = true
		// 使用 rAF + setTimeout 延迟启动，确保 canvas 尺寸就绪、当前渲染帧完成
		requestAnimationFrame(() => {
			setTimeout(() => {
				if (internalPreviewPhase.value !== 'masked') return
				// eslint-disable-next-line no-console
				console.info('[SCENE-LAYOUT-PREVIEW] 🚀 auto-starting preview for node:', props.nodeId)
				emit('start-three-preview')
				startPreview()
			}, 80)
		})
	},
	{ immediate: true, flush: 'post' }
)

// 重置 autoStart 标记：当 previewMode 关闭或 status 变回非 completed 时重置，允许下次再次自动启动
watch(
	() => [previewMode.value, status.value] as const,
	([mode, st]) => {
		if (mode !== true || st !== 'completed') {
			autoStartTriggered.value = false
		}
	}
)

onMounted(() => {
	const ljt = String(props.linkedJsonText ?? '')
	const sls = props.sceneLayoutSettings as Record<string, unknown> | null | undefined
	// eslint-disable-next-line no-console
	console.info('[SCENE-LAYOUT NODE] onMounted RECEIVED PROPS ==========')
	// eslint-disable-next-line no-console
	console.info('[SCENE-LAYOUT NODE] nodeId:', props.nodeId)
	// eslint-disable-next-line no-console
	console.info('[SCENE-LAYOUT NODE] linkedJsonText:', {
		len: ljt.length,
		emptyString: ljt === '',
		allSpaces: ljt.trim() === '' && ljt.length > 0,
		type: typeof props.linkedJsonText,
		preview: ljt ? `${ljt.slice(0, 150)}...` : '(empty/falsy)'
	})
	// eslint-disable-next-line no-console
	console.info('[SCENE-LAYOUT NODE] JSON availability breakdown:', {
		hasLinkedJson: hasLinkedJson.value,
		hasCachedJson: hasCachedJson.value,
		hasInputJson: hasInputJson.value,
		hasRunnableJson: hasRunnableJson.value,
		settingsInputJsonPreview: sls?.inputJson
			? `${String(sls.inputJson).slice(0, 100)}...`
			: '(null/empty)',
		running: running.value
	})
	// eslint-disable-next-line no-console
	console.info('[SCENE-LAYOUT NODE] threePreviewState:', {
		phase: props.threePreviewState?.phase,
		canStart: props.threePreviewState?.canStart
	})
	// eslint-disable-next-line no-console
	console.info('[SCENE-LAYOUT NODE] =========================================')
	sceneLog('onMounted:', {
		nodeId: props.nodeId,
		hasCanvas: !!canvasRef.value,
		canvasConnected: canvasRef.value?.isConnected,
		canvasSize: canvasRef.value
			? {
					width: canvasRef.value.getBoundingClientRect().width,
					height: canvasRef.value.getBoundingClientRect().height,
					offsetWidth: canvasRef.value.offsetWidth,
					offsetHeight: canvasRef.value.offsetHeight
				}
			: null,
		previewPhase: previewPhase.value,
		previewSuspended: previewSuspended.value,
		threePreviewStatePhase: threePreviewState.value?.phase
	})

	const canvas = canvasRef.value
	if (canvas) {
		const handlePointerDown = (e: PointerEvent) => {
			sceneLog('CANVAS pointerdown:', {
				nodeId: props.nodeId,
				pointerId: e.pointerId,
				button: e.button,
				hasViewer: !!viewer,
				viewerInteractive: !!(viewer as any)?.interactiveActive,
				controlsEnabled: !!(viewer as any)?.controls?.enabled,
				previewPhase: previewPhase.value,
				previewSuspended: previewSuspended.value
			})
		}
		const handlePointerMove = (e: PointerEvent) => {
			// 避免大量日志，只在首次移动或有viewer时记录
			if (!viewer || (viewer as any).orbiting) {
				sceneLog('CANVAS pointermove:', {
					nodeId: props.nodeId,
					hasViewer: !!viewer,
					orbiting: !!(viewer as any)?.orbiting,
					controlsEnabled: !!(viewer as any)?.controls?.enabled
				})
			}
		}
		const handleWheel = (e: WheelEvent) => {
			sceneLog('CANVAS wheel:', {
				nodeId: props.nodeId,
				deltaY: e.deltaY,
				hasViewer: !!viewer,
				controlsEnabled: !!(viewer as any)?.controls?.enabled,
				previewPhase: previewPhase.value
			})
		}
		const handlePointerUp = (e: PointerEvent) => {
			sceneLog('CANVAS pointerup:', {
				nodeId: props.nodeId,
				pointerId: e.pointerId,
				hasViewer: !!viewer,
				orbiting: !!(viewer as any)?.orbiting
			})
		}

		canvas.addEventListener('pointerdown', handlePointerDown)
		canvas.addEventListener('pointerup', handlePointerUp)
		canvas.addEventListener('wheel', handleWheel, { passive: false })

		// 检查canvas的CSS pointer-events
		const computedStyle = window.getComputedStyle(canvas)
		sceneLog('CANVAS computed style:', {
			nodeId: props.nodeId,
			pointerEvents: computedStyle.pointerEvents,
			touchAction: computedStyle.touchAction,
			display: computedStyle.display,
			visibility: computedStyle.visibility,
			zIndex: computedStyle.zIndex
		})
	}

	// 开发环境：添加全局事件诊断，帮助定位事件被哪个元素拦截
	if (import.meta.env.DEV) {
		const diagnosePointerDown = (e: PointerEvent) => {
			const canvas = canvasRef.value
			if (!canvas) return
			const target = e.target as HTMLElement | null
			if (!target) return
			const hitNode = target.closest('[data-wf-node-id]')
			const hitThisNode = hitNode?.getAttribute('data-wf-node-id') === props.nodeId
			const hitCanvas = e.composedPath().includes(canvas)
			if (hitThisNode && !hitCanvas) {
				sceneLog('DIAG: pointerdown on node but NOT on canvas (event intercepted)', {
					nodeId: props.nodeId,
					targetTag: target.tagName,
					targetClass: target.className,
					targetDnwIgnore: !!target.closest('[data-wf-node-drag-ignore]'),
					targetPointerEvents: window.getComputedStyle(target).pointerEvents,
					targetZIndex: window.getComputedStyle(target).zIndex
				})
			}
		}
		window.addEventListener('pointerdown', diagnosePointerDown, true)
		onBeforeUnmount(() => {
			window.removeEventListener('pointerdown', diagnosePointerDown, true)
		})
	}

	// ============================================
	// 安装额外的【用户定制版】多层级事件诊断监听器
	// 带彩色标记、document级捕获监听、elementFromPoint命中测试
	// ============================================
	_installNativeDiagnosticListeners()

	console.log(
		'%c【SceneLayoutEvent#Init】===========================================================',
		'color:#16a34a;font-weight:bold'
	)
	console.log(
		'%c【SceneLayoutEvent#Init】✅ 场景布局节点事件诊断系统已就绪',
		'color:#16a34a;font-weight:bold'
	)
	console.log('%c【SceneLayoutEvent#Init】📋 使用方法：', 'color:#16a34a;font-weight:bold')
	console.log('%c   1. 打开浏览器DevTools → Console 面板', 'color:#16a34a')
	console.log(
		'%c   2. 用鼠标在【场景布局节点3D预览区】内：点击 → 拖动 → 松开 → 滚轮',
		'color:#16a34a'
	)
	console.log('%c   3. 观察控制台输出中【SceneLayoutEvent】前缀的日志', 'color:#16a34a')
	console.log('%c   4. 关键日志标记：', 'color:#16a34a')
	console.log('%c      🟠 L1-ROOT  = 根节点层事件', 'color:#d97706')
	console.log('%c      🟢 L2-VIEWERSHELL = viewer外壳层（事件.stop在这里）', 'color:#059669')
	console.log(
		'%c      🔵 L4-CANVAS CAPTURE/BUBBLE = canvas自身收到事件（最关键！⭐）',
		'color:#2563eb'
	)
	console.log(
		'%c      🟣 HitTest = elementFromPoint命中测试，🔴(拦截!) = 找到遮挡元素',
		'color:#7c3aed'
	)
	console.log('%c      💗 Native@canvas = 绕过Vue直接绑原生的事件', 'color:#be185d')
	console.log(
		'%c【SceneLayoutEvent#Init】===========================================================',
		'color:#16a34a;font-weight:bold'
	)
	requestResize()
})

// Watch for layoutItems and settings changes to debug rendering pipeline
watch(
	() => [
		layoutItems.value.length,
		status.value,
		previewPhase.value,
		settings.value ? Object.keys(settings.value) : []
	],
	([itemsLen, st, phase, keys]) => {
		console.info('【SCENE-LAYOUT-CHAIN】🔵 Component reactive state changed:', {
			layoutItemsLen: itemsLen,
			status: st,
			previewPhase: phase,
			empty: !itemsLen,
			settingsKeys: keys,
			hasSettings: !!settings.value,
			settingsStatus: settings.value?.status,
			settingsLayoutItemsIsArray: Array.isArray(settings.value?.layoutItems)
		})
	},
	{ immediate: false }
)

watch(
	() => [
		status.value,
		previewMode.value,
		previewPhase.value,
		layoutItems.value.length,
		hidePlaceholderCubes.value,
		props.linkedJsonText,
		settings.value?.status,
		settings.value?.inputJson,
		settings.value?.message,
		settings.value?.previewMode,
		settings.value?.hidePlaceholderCubes,
		settings.value?.selectedLayoutItemId,
		settings.value?.selectedPlaceholderOutput,
		settings.value?.lightingPreviewEnabled,
		settings.value?.lightingDebugEnabled,
		settings.value?.layoutItems?.length
	],
	() => {
		requestResize()
	},
	{ flush: 'post' }
)

onBeforeUnmount(() => {
	_uninstallNativeDiagnosticListeners()
	stopPerfPolling()
	saveViewState()
	cacheSnapshot(snapshotUrl.value)
	disposeViewer('unmount')
})

const getResolvedLayoutForUnreal = async (): Promise<
	{ ok: true; exportData: WorkflowUnrealResolvedLayoutExport } | { ok: false; error: string }
> => {
	console.info('[SceneLayoutNode] getResolvedLayoutForUnreal called')
	if (!canvasRef.value) {
		console.warn('[SceneLayoutNode] canvasRef not mounted')
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
		console.warn('[SceneLayoutNode] viewer not ready after retries')
		return { ok: false, error: t('nodes.sceneLayout.errorViewerNotReady') }
	}
	console.info('[SceneLayoutNode] viewer ready')
	viewer.setRenderSuspended(false)
	viewer.setInteractive(true)
	viewer.setSelectedItem(selectedPreviewItemId.value)
	const currentSignature = layoutItemsSignature.value
	const signatureChanged = currentSignature !== cachedLayoutSignature
	const cachedViewForExport = SCENE_LAYOUT_VIEWSTATE_CACHE.get(snapshotCacheKey) ?? null
	
	// 只有当签名变化时才重新调用setLayout，避免重置模型加载过程
	if (signatureChanged) {
		console.info(`[SceneLayoutNode] Layout signature changed (old: ${cachedLayoutSignature}, new: ${currentSignature}), calling setLayout...`)
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
		
		// 等待模型绑定同步完成，给足够长的时间（8秒）
		console.info('[SceneLayoutNode] Waiting for model bindings to sync (up to 8 seconds)...')
		await viewer.awaitPendingBindingSync(8000)
		console.info('[SceneLayoutNode] Model binding sync wait completed')
	} else {
		console.info('[SceneLayoutNode] Layout signature unchanged, reusing existing scene')
		// 即使签名不变，也确保渲染没有暂停
		viewer.setRenderSuspended(false)
		await new Promise(r => setTimeout(r, 100))
	}
	
	try {
		console.info('[SceneLayoutNode] Calling viewer.exportResolvedLayoutForUnreal...')
		const exportData = await viewer.exportResolvedLayoutForUnreal()
		console.info(`[SceneLayoutNode] exportResolvedLayoutForUnreal returned, slotCount: ${exportData.slots.length}, warnings: ${exportData.warnings.length}`)
		if (exportData.warnings.length > 0) {
			console.warn('[SceneLayoutNode] Export warnings:', exportData.warnings)
		}
		if (!exportData.slots.length) {
			const warningText = exportData.warnings[0] ?? t('nodes.sceneLayout.errorNoModelsToExport')
			console.warn('[SceneLayoutNode] No slots to export:', warningText)
			return { ok: false, error: warningText }
		}
		return { ok: true, exportData }
	} catch (err) {
		const errMessage =
			isObject(err) && isString(err.message) ? err.message : String(err ?? 'unknown')
		console.error('[SceneLayoutNode] exportResolvedLayoutForUnreal threw error:', errMessage)
		return { ok: false, error: t('nodes.sceneLayout.errorExportFailed', { error: errMessage }) }
	} finally {
		// 不要在这里销毁viewer - 导出重试过程中需要保持viewer存活
		// 只有当组件真正卸载时才应该销毁viewer
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

	const setViewerLog = (
		viewer as unknown as { setExportLogCallback?: (cb: ((msg: string) => void) | null) => void }
	).setExportLogCallback
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
		const setViewerLogCleanup = (
			viewer as unknown as { setExportLogCallback?: (cb: ((msg: string) => void) | null) => void }
		).setExportLogCallback
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
	height: 100%;
	display: flex;
	flex-direction: column;
	gap: 10px;
	box-sizing: border-box;
	pointer-events: auto;
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

/* ====== 参考WorkflowModel3DNode：viewer-shell 直接包 WorkflowThreePreviewShell ====== */
/* 【BUGFIX 2026-07】不再套多余的 stage 中间层（之前4层结构：viewer-shell→stage→WorkflowThreePreviewShell→canvas），
 * 现在和3D模型节点完全一致（3层结构：viewer-shell→WorkflowThreePreviewShell→canvas）。
 * 多层结构在 flex:1 / min-height / overflow:hidden / border-radius 叠加下会导致
 * canvas 实际命中矩形比视觉预览外壳小，出现"上半部分点不到、下半部分才能控镜头"的反常bug。
 *
 * 视觉样式（border / border-radius / overflow / background / min-height）直接放到 viewer-shell 上，
 * 和之前 stage 的视觉效果完全一致。
 */
.wf-scene-layout-viewer-shell {
	position: relative;
	width: 100%;
	flex: 1 1 auto;
	min-height: 220px;
	border: 1px solid var(--vscode-border);
	border-radius: 12px;
	overflow: hidden;
	background: var(--dweb-defualt);
	display: block;
	pointer-events: auto;
}

/* ======================================================================
 * 【关键修复】所有 overlay 工具容器（z-index=3，覆盖在canvas上方）
 *   必须设置 pointer-events: none，否则它们的矩形区域会拦截canvas事件！
 *   只在内部具体可交互元素（button、input、label）上恢复 pointer-events: auto
 * ====================================================================== */
.wf-scene-layout-overlay-tools {
	position: absolute;
	top: 10px;
	left: 10px;
	display: flex;
	gap: 8px;
	z-index: 3;
	pointer-events: none; /* ← 容器不拦截鼠标，事件穿透到下面的canvas */
}
/* 容器内部的按钮/控件恢复事件响应 */
.wf-scene-layout-overlay-tools > button,
.wf-scene-layout-overlay-tools .wf-scene-layout-orientation-group,
.wf-scene-layout-overlay-tools .wf-scene-layout-orientation-dropdown {
	pointer-events: auto;
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
	pointer-events: none; /* ← 容器透明穿透 */
}
.wf-scene-layout-lighting-dock > button {
	pointer-events: auto; /* ← 只有按钮响应 */
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
	/* 注意：这个面板较大，内部有slider和button需要交互，
	   因此面板本身保留 pointer-events:auto（它是显式打开的控制面板） */
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
	pointer-events: none; /* ← 容器透明穿透（perf面板一般只看） */
}
.wf-scene-layout-perf-panel > button,
.wf-scene-layout-perf-panel .wf-scene-layout-perf-card {
	pointer-events: auto; /* 折叠按钮/展开卡片恢复响应（perf-card里只展示文本也保留auto以确保不影响） */
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

.wf-scene-layout-gesture-tip {
	position: absolute;
	left: 10px;
	bottom: 10px;
	z-index: 1;
	padding: 4px 8px;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.72);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.58);
	color: var(--vscode-fg-muted);
	font-size: 11px;
	pointer-events: none;
}

.wf-scene-layout-canvas {
	width: 100%;
	height: 100%;
	display: block;
	opacity: 0;
	transition: opacity 120ms ease;
	pointer-events: auto;
	touch-action: none;
	outline: none;
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

:deep(.wf-node-body) {
	flex: 1 1 auto !important;
	flex-direction: column;
	align-items: stretch;
	min-height: 0;
	overflow: hidden;
}
</style>
