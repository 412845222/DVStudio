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
		:isPrimarySelected="selected"
		:isSecondarySelected="false"
		:visualStatus="visualStatus"
		:hoverInputAnchorId="hoverInputAnchorId"
		:hoverOutputAnchorId="hoverOutputAnchorId"
		:nodeChatVisible="nodeChatVisible"
		:nodeChatNodeType="nodeChatNodeType"
		:nodeChatDraft="nodeChatDraft"
		:nodeChatSubmitting="nodeChatSubmitting"
		:nodeChatParams="nodeChatParams"
		:nodeChatSelectedRefs="nodeChatSelectedRefs"
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
		@node-chat-update-draft="(value) => emit('node-chat-update-draft', value)"
		@node-chat-update-params="(value) => emit('node-chat-update-params', value)"
		@node-chat-update-selected-refs="(value) => emit('node-chat-update-selected-refs', value)"
		@node-chat-close="emit('node-chat-close')"
		@node-chat-submit="(payload) => emit('node-chat-submit', payload)"
		@node-chat-stop="emit('node-chat-stop')"
		@node-chat-remove-param-ref="(item) => emit('node-chat-remove-param-ref', item)"
	>
		<template #body>
			<div class="wf-model3d-body">
				<div v-if="meshyFetchFailed" class="wf-model3d-fetch-error" @pointerdown.stop>
					<div class="wf-model3d-fetch-error-icon">!</div>
					<div class="wf-model3d-fetch-error-body">
						<div class="wf-model3d-fetch-error-title">{{ t('nodes.model3d.fetchErrorTitle') }}</div>
						<div class="wf-model3d-fetch-error-text">{{ meshyFetchErrorText }}</div>
						<div class="wf-model3d-fetch-error-actions">
							<button
								class="wf-model3d-fetch-error-btn primary"
								type="button"
								@click.stop="emit('retry-meshy-fetch')"
							>
								{{ t('nodes.model3d.retryFetch') }}
							</button>
							<button
								class="wf-model3d-fetch-error-btn"
								type="button"
								@click.stop="emit('open-meshy-task-panel')"
							>
								{{ t('nodes.model3d.openTaskPanel') }}
							</button>
						</div>
					</div>
				</div>

				<div
					class="wf-model3d-viewer-shell"
					data-wf-node-drag-ignore="true"
					@pointerdown.stop
					@wheel.stop="onPreviewWheel"
					@pointerdown="onPreviewPointerDown"
				@pointermove="onPreviewPointerMove"
				@pointerup="onPreviewPointerUp"
				@contextmenu.prevent
				>
					<WorkflowThreePreviewShell
						:state="threePreviewState"
						:snapshotUrl="snapshotUrl"
						:empty="!effectiveModelUrl"
						:emptyTitle="t('nodes.model3d.previewTitle')"
						:emptyText="t('nodes.model3d.previewEmptyText')"
						:maskedTitle="t('nodes.model3d.previewMaskedTitle')"
						:maskedText="t('nodes.model3d.previewMaskedText')"
						@start="handlePreviewStart"
					>
						<canvas
							ref="canvasRef"
							class="wf-model3d-canvas"
							:class="{ live: viewerLive }"
							:data-wf-model3d-canvas-node-id="nodeId"
						/>
						<template #overlay>
							<div v-if="effectiveModelUrl && viewerLive && !errorMessage" class="wf-model3d-gesture-tip">
								{{ t('nodes.model3d.interactionHint') }}
							</div>
							<div v-if="errorMessage" class="wf-model3d-overlay error">{{ errorMessage }}</div>
						</template>
					</WorkflowThreePreviewShell>
				</div>

				<div v-if="activeDownloadState" class="wf-model3d-download-progress" @pointerdown.stop>
					<div class="wf-model3d-download-header">
						<div class="wf-model3d-download-title">
							<span v-if="activeDownloadIsActive" class="wf-model3d-download-spinner"></span>
							<span v-else-if="activeDownloadIsDone" class="wf-model3d-download-icon done">✓</span>
							<span v-else-if="activeDownloadIsFailed" class="wf-model3d-download-icon failed">!</span>
							{{ activeDownloadIsFailed ? t('nodes.model3d.downloadFailed') : activeDownloadIsDone ? t('nodes.model3d.downloadComplete') : t('nodes.model3d.downloadingModel', { source: activeDownloadState.source }) }}
						</div>
						<div class="wf-model3d-download-speed" v-if="activeDownloadIsActive && activeDownloadState.speed > 0">
							{{ formatSpeed(activeDownloadState.speed) }}
						</div>
					</div>
					<div class="wf-model3d-download-bar-container">
						<div
							class="wf-model3d-download-bar-fill"
							:class="{
								active: activeDownloadIsActive,
								done: activeDownloadIsDone,
								failed: activeDownloadIsFailed
							}"
							:style="{ width: `${activeDownloadState.progress}%` }"
						></div>
					</div>
					<div class="wf-model3d-download-meta" v-if="activeDownloadState.total > 0">
						<span>{{ formatBytes(activeDownloadState.loaded) }} / {{ formatBytes(activeDownloadState.total) }}</span>
						<span>{{ activeDownloadState.progress }}%</span>
					</div>
					<div class="wf-model3d-download-meta" v-else-if="activeDownloadIsActive">
						<span>{{ formatBytes(activeDownloadState.loaded) }}</span>
						<span>{{ activeDownloadState.progress }}%</span>
					</div>
					<div class="wf-model3d-download-error" v-if="activeDownloadIsFailed && activeDownloadState.error">
						{{ activeDownloadState.error }}
					</div>
				</div>

				<div class="wf-model3d-actions" @pointerdown.stop>
					<div class="wf-model3d-filemeta">
						<div class="wf-model3d-filename">{{ sourceNameDisplay }}</div>
						<div class="wf-model3d-filehint">{{ sourceHintDisplay }}</div>
					</div>
					<div class="wf-model3d-action-buttons">
						<button class="wf-model3d-btn" type="button" @click.stop="onUploadClick">
							{{ effectiveModelUrl ? t('nodes.model3d.replaceResource') : t('nodes.model3d.uploadResource') }}
						</button>
						<button
							v-if="effectiveModelUrl"
							class="wf-model3d-btn ghost"
							type="button"
							@click.stop="emit('clear-resource')"
						>
							{{ t('nodes.model3d.clear') }}
						</button>
					</div>
					<input
						ref="fileInputRef"
						class="wf-file-input"
						type="file"
						accept=".glb,.gltf,.fbx,.obj,.stl,.dae,model/gltf-binary,model/gltf+json,application/octet-stream"
						@change="onFileChange"
					/>
				</div>
			</div>
		</template>

		<template #footer>
			<div class="wf-model3d-footer" @pointerdown.stop>
				<div class="wf-model3d-toolbar">
					<button
						class="wf-model3d-editor-btn"
						type="button"
						:disabled="!effectiveModelUrl"
						@click.stop="onOpenEditor"
						:title="t('nodes.model3d.open3DEditor')"
					>
						<svg class="wf-model3d-editor-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
							<polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
							<line x1="12" y1="22.08" x2="12" y2="12"/>
						</svg>
						<span>{{ t('nodes.model3d.open3DEditor') }}</span>
					</button>
					<div
						v-if="tripo3dPostProcessAvailable"
						class="wf-model3d-tripo3d-badge"
						:title="t('nodes.model3d.tripo3dPostProcessAvailable')"
					>
						<svg class="wf-model3d-tripo3d-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M12 2L2 7l10 5 10-5-10-5z"/>
							<path d="M2 17l10 5 10-5"/>
							<path d="M2 12l10 5 10-5"/>
						</svg>
						<span>{{ t('nodes.model3d.tripo3dPostProcessBadge') }}</span>
					</div>
				</div>
				<div class="wf-model3d-grid">
					<div class="wf-model3d-info-card wf-model3d-field-wide">
						<div class="wf-model3d-info-row">
							<span class="wf-model3d-label">{{ t('nodes.model3d.projectAsset') }}</span>
							<span class="wf-model3d-info-value">{{ assetStatusDisplay }}</span>
						</div>
						<div class="wf-model3d-info-row">
							<span class="wf-model3d-label">{{ t('nodes.model3d.upstreamInput') }}</span>
							<span class="wf-model3d-info-value">{{ upstreamStatusDisplay }}</span>
						</div>
					</div>

					<label class="wf-model3d-field">
						<span class="wf-model3d-label">{{ t('nodes.model3d.backgroundColor') }}</span>
						<input
							class="wf-model3d-input wf-model3d-input-color"
							type="color"
							:value="backgroundColor"
							@input="onBackgroundInput"
						/>
					</label>

					<label class="wf-model3d-field">
						<span class="wf-model3d-label">{{ t('nodes.model3d.lightIntensity') }}</span>
						<input
							class="wf-model3d-input"
							type="number"
							min="0"
							max="10"
							step="0.1"
							:value="lightIntensity"
							@change="onLightIntensityChange"
						/>
					</label>

					<label class="wf-model3d-field">
						<span class="wf-model3d-label">{{ t('nodes.model3d.renderWidth') }}</span>
						<input
							class="wf-model3d-input"
							type="number"
							min="1"
							:value="renderWidth"
							@change="onRenderWidthChange"
						/>
					</label>

					<label class="wf-model3d-field">
						<span class="wf-model3d-label">{{ t('nodes.model3d.renderHeight') }}</span>
						<input
							class="wf-model3d-input"
							type="number"
							min="1"
							:value="renderHeight"
							@change="onRenderHeightChange"
						/>
					</label>

					<label class="wf-model3d-check">
						<input type="checkbox" :checked="gridVisible" @change="onGridToggle" />
						<span>{{ t('nodes.model3d.showGroundGrid') }}</span>
					</label>
					<label class="wf-model3d-check">
						<input type="checkbox" :checked="axesVisible" @change="onAxesToggle" />
						<span>{{ t('nodes.model3d.showXYZAxes') }}</span>
					</label>
					<label class="wf-model3d-check wf-model3d-field-wide">
						<input type="checkbox" :checked="autoRotate" @change="onAutoRotateToggle" />
						<span>{{ t('nodes.model3d.autoRotate') }}</span>
					</label>
				</div>
			</div>
		</template>
	</WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { getErrorMessage } from '../../../types/utils'
import { diagnoseDwebAsset } from '../../../electronBridge'
import WorkflowNodeBase from '../WorkflowNodeBase.vue'
import { Model3DPreviewViewer } from './model3d/Model3DPreviewViewer'
import type { Model3DViewState } from './model3d/Model3DPreviewViewer'
import type { WorkflowModel3DNodeSettings } from '../../../aiworkflow/types'
import WorkflowThreePreviewShell from './three-preview/WorkflowThreePreviewShell.vue'
import type {
	WorkflowThreePreviewProgressPayload,
	WorkflowThreePreviewState,
	WorkflowThreePreviewPhase
} from './three-preview/types'
import { useI18n } from '../../../i18n'
import { useModel3DEditor } from '../../../composables/useModel3DEditor'
import { formatBytes, formatSpeed } from '../../../views/AIWorkflow/assets/useAIWorkflowAssetPersistence'
import type { WorkflowNodeChatSubmitPayload, WorkflowNodeChatType } from '../../../aiworkflow/types'

const { t } = useI18n()
const { open: open3DEditor } = useModel3DEditor()

type AnchorSpec = {
	id: string
	label?: string
	offsetY?: number
	mediaType?: 'generic' | 'image' | 'video' | 'text' | 'flow'
}

const MODEL3D_SNAPSHOT_CACHE_KEY = '__DWEB_MODEL3D_SNAPSHOT_CACHE__'
const MODEL3D_SNAPSHOT_CACHE = (() => {
	const root = globalThis as Record<string, unknown>
	const existing = root[MODEL3D_SNAPSHOT_CACHE_KEY]
	if (existing instanceof Map) return existing as Map<string, string>
	const created = new Map<string, string>()
	root[MODEL3D_SNAPSHOT_CACHE_KEY] = created
	return created
})()

const MODEL3D_VIEWSTATE_CACHE_KEY = '__DWEB_MODEL3D_VIEWSTATE_CACHE__'
const MODEL3D_VIEWSTATE_CACHE = (() => {
	const root = globalThis as Record<string, unknown>
	const existing = root[MODEL3D_VIEWSTATE_CACHE_KEY]
	if (existing instanceof Map) return existing as Map<string, Model3DViewState>
	const created = new Map<string, Model3DViewState>()
	root[MODEL3D_VIEWSTATE_CACHE_KEY] = created
	return created
})()

const props = defineProps<{
	nodeId: string
	title: string
	alias?: string
	nodeType: string
	subtitle?: string
	style?: Record<string, string>
	model3dSettings?: WorkflowModel3DNodeSettings | null
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
	visualStatus?: 'idle' | 'running' | 'error'
	nodeChatVisible?: boolean
	nodeChatNodeType?: WorkflowNodeChatType | null
	nodeChatDraft?: string
	nodeChatSubmitting?: boolean
	nodeChatParams?: Record<string, any>
	nodeChatSelectedRefs?: any[]
	inputParamPreviewRefs?: any[]
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
	(e: 'preview-contextmenu', payload: { clientX: number; clientY: number }): void
	(
		e: 'start-link',
		payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }
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
	(e: 'update-model3d-settings', payload: Partial<WorkflowModel3DNodeSettings>): void
	(e: 'upload-model-file', payload: { file: File }): void
	(e: 'clear-resource'): void
	(e: 'start-three-preview'): void
	(e: 'three-preview-progress', payload?: WorkflowThreePreviewProgressPayload): void
	(e: 'three-preview-ready'): void
	(e: 'three-preview-error'): void
	(e: 'retry-meshy-fetch'): void
	(e: 'open-meshy-task-panel'): void
	(e: 'node-chat-update-draft', value: string): void
	(e: 'node-chat-update-params', value: Record<string, any>): void
	(e: 'node-chat-update-selected-refs', value: any[]): void
	(e: 'node-chat-close'): void
	(e: 'node-chat-submit', payload: WorkflowNodeChatSubmitPayload): void
	(e: 'node-chat-stop'): void
	(e: 'node-chat-remove-param-ref', item: any): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const baseRef = ref<InstanceType<typeof WorkflowNodeBase> | null>(null)
const snapshotCacheKey = String(props.nodeId ?? '').trim()
const snapshotUrl = ref(
	snapshotCacheKey ? String(MODEL3D_SNAPSHOT_CACHE.get(snapshotCacheKey) ?? '') : ''
)
const errorMessage = ref('')
let viewer: Model3DPreviewViewer | null = null
let viewerInitRaf = 0
let viewerInitPending = false
let viewerInitCooldownUntil = 0
let activePreviewRequestId = 0
let cachedModelSignature = ''
let cameraUserControlled = false
let initialSyncDone = false

const internalPreviewRequestId = ref(0)
const internalPreviewPhase = ref<WorkflowThreePreviewPhase>('masked')
const internalPreviewProgress = ref(0)
const internalPreviewLabel = ref('')
const internalPreviewState = computed<WorkflowThreePreviewState>(() => ({
	phase: internalPreviewPhase.value,
	canStart: true,
	progress: internalPreviewProgress.value,
	label: internalPreviewLabel.value,
	requestId: internalPreviewRequestId.value,
}))

const cacheSnapshot = (value: string) => {
	if (!snapshotCacheKey) return
	const next = String(value ?? '').trim()
	if (!next) return
	MODEL3D_SNAPSHOT_CACHE.set(snapshotCacheKey, next)
}

const settings = computed(() => props.model3dSettings ?? null)
const previewSuspended = computed(() => props.previewSuspended === true)
const effectiveModelUrl = computed(() => {
	const assetUrl = String(settings.value?.modelAssetUrl ?? '').trim()
	const primaryUrl = String(settings.value?.modelUrl ?? '').trim()
	if (assetUrl && !isRemoteMeshyUrl(assetUrl)) return assetUrl
	if (primaryUrl && !isRemoteMeshyUrl(primaryUrl)) return primaryUrl
	return assetUrl || primaryUrl
})

const isRemoteMeshyUrl = (url: string): boolean => {
	if (!url) return false
	try {
		const parsed = new URL(url)
		return /(^|\.)meshy\.ai$/i.test(parsed.hostname)
	} catch {
		return /https?:\/\/[^\s]*meshy\.ai(?:\/|$)/i.test(url)
	}
}
const modelUrlSignature = computed(() => effectiveModelUrl.value)
const modelSignature = computed(() => {
	const parts = [
		effectiveModelUrl.value,
		String(settings.value?.backgroundColor ?? ''),
		String(settings.value?.lightIntensity ?? ''),
		String(settings.value?.gridVisible ?? ''),
		String(settings.value?.axesVisible ?? ''),
		String(settings.value?.autoRotate ?? '')
	]
	return parts.join('|')
})
const backgroundColor = computed(() => String(settings.value?.backgroundColor ?? '#0f1720'))
const lightIntensity = computed(() => Number(settings.value?.lightIntensity ?? 1.25))
const gridVisible = computed(() => settings.value?.gridVisible !== false)
const axesVisible = computed(() => settings.value?.axesVisible !== false)
const autoRotate = computed(() => settings.value?.autoRotate === true)
const renderWidth = computed(() => Number(settings.value?.renderWidth ?? 1024))
const renderHeight = computed(() => Number(settings.value?.renderHeight ?? 1024))
const sourceNameDisplay = computed(
	() => String(settings.value?.modelSourceName ?? '').trim() || t('nodes.model3d.noModelBound')
)
const sourceHintDisplay = computed(() => {
	const format = String(settings.value?.modelFormat ?? '')
		.trim()
		.toUpperCase()
	if (settings.value?.lastInputNodeId)
		return t('nodes.model3d.fromUpstreamNode', { nodeId: settings.value.lastInputNodeId }) + (format ? ` · ${format}` : '')
	if (settings.value?.modelSourcePath) return settings.value.modelSourcePath
	return format ? t('nodes.model3d.formatPreview', { format }) : t('nodes.model3d.supportedFormats')
})
const assetStatusDisplay = computed(() => {
	const assetPath = String(settings.value?.modelAssetPath ?? '').trim()
	if (assetPath) return t('nodes.model3d.writtenToAssets')
	return t('nodes.model3d.notPersisted')
})
const upstreamStatusDisplay = computed(() => {
	const source = String(settings.value?.lastInputSourceName ?? '').trim()
	if (source) return source
	return t('nodes.model3d.noUpstreamModel')
})

const meshySettings = computed(() => settings.value?.meshyModelSettings ?? null)
const tripo3dSettings = computed(() => settings.value?.tripo3dModelSettings ?? null)

const tripo3dPostProcessAvailable = computed(() => {
	const tripo = tripo3dSettings.value
	const modelSource = String(settings.value?.modelGenerationSource ?? '').trim()
	const taskId = String(tripo?.tripo3dTaskId ?? tripo?.tripo3dUpstreamTaskId ?? '').trim()
	const status = String(tripo?.tripo3dTaskStatus ?? tripo?.tripo3dUpstreamTaskStatus ?? '').trim()
	const family = String(tripo?.tripo3dTaskFamily ?? tripo?.tripo3dUpstreamTaskFamily ?? '').trim()
	const modelAssetUrl = String(settings.value?.modelAssetUrl ?? '').trim()
	const modelUrl = String(settings.value?.modelUrl ?? '').trim()
	const hasModel = !!(modelAssetUrl || modelUrl)
	const successStatuses = ['success', 'succeeded', 'done']
	const generationModes = ['text_to_model', 'image_to_model', 'multiview_to_model']
	const postProcessModes = ['texture', 'refine', 'mesh_segment', 'mesh_smartsegment', 'mesh_complete', 'mesh_decimate', 'models_convert']
	const validFamily = generationModes.includes(family) || postProcessModes.includes(family)
	// 条件1：标准条件 - 有任务ID、成功状态、有效任务类型
	if (taskId && successStatuses.includes(status) && validFamily) return true
	// 条件2：回退条件 - 模型来源是tripo3d，有任务ID，且已有模型文件（白模已下载）
	if (modelSource === 'tripo3d' && taskId && hasModel) return true
	// 条件3：回退条件 - 有任务ID且family字段表明是tripo3d任务（即使status缺失）
	if (taskId && validFamily) return true
	return false
})

const meshyFetchFailed = computed(() => {
	const status = String(meshySettings.value?.taskStatus ?? '').trim()
	return status === 'fetch-failed'
})
const meshyFetchErrorText = computed(() => {
	return String(
		meshySettings.value?.errorMessage ?? meshySettings.value?.statusText ?? t('nodes.model3d.fetchFailed')
	).trim()
})

const meshyDownloadState = computed(() => {
	const stage = meshySettings.value?.downloadStage
	if (!stage || stage === 'idle') return null
	return {
		stage,
		progress: meshySettings.value?.downloadProgress ?? 0,
		loaded: meshySettings.value?.downloadLoadedBytes ?? 0,
		total: meshySettings.value?.downloadTotalBytes ?? 0,
		speed: meshySettings.value?.downloadSpeedBytesPerSec ?? 0,
		error: meshySettings.value?.downloadError ?? ''
	}
})

const tripo3dDownloadState = computed(() => {
	const stage = tripo3dSettings.value?.tripo3dDownloadStage
	if (!stage || stage === 'idle') return null
	return {
		stage,
		progress: tripo3dSettings.value?.tripo3dDownloadProgress ?? 0,
		loaded: tripo3dSettings.value?.tripo3dDownloadLoadedBytes ?? 0,
		total: tripo3dSettings.value?.tripo3dDownloadTotalBytes ?? 0,
		speed: tripo3dSettings.value?.tripo3dDownloadSpeedBytesPerSec ?? 0,
		error: tripo3dSettings.value?.tripo3dDownloadError ?? ''
	}
})

const activeDownloadState = computed(() => {
	if (tripo3dDownloadState.value) return { ...tripo3dDownloadState.value, source: 'Tripo3D' }
	if (meshyDownloadState.value) return { ...meshyDownloadState.value, source: 'Meshy' }
	return null
})

const activeDownloadIsActive = computed(() => {
	const state = activeDownloadState.value
	return state?.stage === 'downloading'
})

const activeDownloadIsDone = computed(() => {
	const state = activeDownloadState.value
	return state?.stage === 'done'
})

const activeDownloadIsFailed = computed(() => {
	const state = activeDownloadState.value
	return state?.stage === 'failed'
})

const threePreviewState = computed(() => props.threePreviewState ?? internalPreviewState.value)
const previewPhase = computed(() => threePreviewState.value?.phase ?? 'masked')
const previewRequestId = computed(() => Number(threePreviewState.value?.requestId ?? 0))
const previewInteractive = computed(() => previewPhase.value === 'interactive')
const viewerLive = computed(
	() => previewPhase.value === 'loading' || previewPhase.value === 'interactive'
)

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
	const url = effectiveModelUrl.value
	if (!url) {
		errorMessage.value = t('nodes.model3d.noModelBound2')
		return
	}
	internalPreviewRequestId.value += 1
	activePreviewRequestId = internalPreviewRequestId.value
	errorMessage.value = ''
	setPreviewPhase('loading')
	setPreviewProgress(0.12, t('nodes.model3d.progressInitRenderer'))
}
const handlePreviewStart = () => {
	emit('start-three-preview')
	startPreview()
}
const handlePreviewProgress = (progress: number, label: string) => {
	emitPreviewProgress(progress, label)
	setPreviewProgress(progress, label)
}
const handlePreviewReady = () => {
	setPreviewPhase('interactive')
	emit('three-preview-ready')
}
const handlePreviewError = () => {
	setPreviewPhase('masked')
	emit('three-preview-error')
}

const updateSettings = (patch: Partial<WorkflowModel3DNodeSettings>) =>
	emit('update-model3d-settings', patch)
const emitPreviewProgress = (progress: number, label: string) => {
	emit('three-preview-progress', { progress, label })
	setPreviewProgress(progress, label)
}

const clearViewerInitSchedule = () => {
	if (viewerInitRaf) {
		cancelAnimationFrame(viewerInitRaf)
		viewerInitRaf = 0
	}
	viewerInitPending = false
}

const onCameraInteractionStart = () => {
	cameraUserControlled = true
}
const onCameraInteractionEnd = () => {
	saveViewState()
}
const applyViewerOptions = () => {
	viewer?.setOptions({
		backgroundColor: backgroundColor.value,
		lightIntensity: lightIntensity.value,
		gridVisible: gridVisible.value,
		axesVisible: axesVisible.value,
		autoRotate: autoRotate.value,
		onCameraInteractionStart,
		onCameraInteractionEnd
	})
}

const syncViewerState = () => {
	if (!viewer) return
	applyViewerOptions()
	const url = effectiveModelUrl.value
	if (!url) {
		viewer.clearModel()
		cachedModelSignature = ''
		cameraUserControlled = false
		initialSyncDone = false
		return
	}
	const currentSignature = modelSignature.value
	const currentUrlSignature = modelUrlSignature.value
	const prevUrlSignature = cachedModelSignature.split('|')[0]
	const urlChanged = currentUrlSignature !== prevUrlSignature
	if (urlChanged || !cachedModelSignature) {
		cameraUserControlled = false
		initialSyncDone = false
		viewer.clearModel()
		cachedModelSignature = currentSignature
		return
	}
	if (currentSignature !== cachedModelSignature) {
		cachedModelSignature = currentSignature
		if (!cameraUserControlled) {
			const cachedView = MODEL3D_VIEWSTATE_CACHE.get(snapshotCacheKey) ?? null
			if (cachedView) {
				viewer.restoreView(cachedView)
			}
		}
		return
	}
	if (!initialSyncDone && !cameraUserControlled) {
		const cachedView = MODEL3D_VIEWSTATE_CACHE.get(snapshotCacheKey) ?? null
		if (cachedView) {
			viewer.restoreView(cachedView)
		}
	}
	initialSyncDone = true
}

const createViewerNow = () => {
	const canvas = canvasRef.value
	if (viewer || !canvas) return
	if (!canvas.isConnected) return
	const rect = canvas.getBoundingClientRect()
	if (rect.width <= 0 || rect.height <= 0) return
	try {
		viewer = new Model3DPreviewViewer(canvas, {
			backgroundColor: backgroundColor.value,
			lightIntensity: lightIntensity.value,
			gridVisible: gridVisible.value,
			axesVisible: axesVisible.value,
			autoRotate: autoRotate.value
		})
		viewerInitCooldownUntil = 0
		viewer.setRenderSuspended(previewSuspended.value)
		viewer.setInteractive(false)
		syncViewerState()
	} catch (err) {
		viewer = null
		viewerInitCooldownUntil = Date.now() + 400
		errorMessage.value =
			(err instanceof Error ? err.message : String(err ?? 'unknown')) || t('nodes.model3d.modelLoadFailed')
	}
}

const ensureViewer = () => {
	if (viewer || viewerInitPending) return
	if (!canvasRef.value) return
	if (Date.now() < viewerInitCooldownUntil) return
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

const disposeViewer = () => {
	clearViewerInitSchedule()
	viewerInitCooldownUntil = 0
	if (!viewer) return
	saveViewState()
	captureSnapshot()
	viewer.dispose()
	viewer = null
	cameraUserControlled = false
	initialSyncDone = false
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
	return !!viewer
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
	MODEL3D_VIEWSTATE_CACHE.set(snapshotCacheKey, state)
}

const loadModelIntoViewer = async (requestId?: number) => {
	const url = effectiveModelUrl.value
	if (!viewer) return false
	if (!url) {
		viewer.clearModel()
		cachedModelSignature = ''
		cameraUserControlled = false
		initialSyncDone = false
		if (requestId != null && requestId === activePreviewRequestId) {
			errorMessage.value = t('nodes.model3d.noModelBound2')
			handlePreviewError()
		}
		return false
	}
	const currentSignature = modelSignature.value
	const currentUrlSignature = modelUrlSignature.value
	const prevUrlSignature = cachedModelSignature.split('|')[0]
	const urlChanged = currentUrlSignature !== prevUrlSignature
	const cachedView =
		!urlChanged && cachedModelSignature
			? MODEL3D_VIEWSTATE_CACHE.get(snapshotCacheKey) ?? null
			: null
	if (urlChanged) {
		cameraUserControlled = false
		initialSyncDone = false
	}
	applyViewerOptions()
	if (requestId != null) emitPreviewProgress(0.2, t('nodes.model3d.progressLoadResource'))
	try {
		await viewer.loadModel(url, (payload) => {
			if (requestId == null) return
			if (requestId !== activePreviewRequestId) return
			const ratio = Number(payload?.ratio ?? 0)
			emitPreviewProgress(0.2 + Math.max(0, Math.min(1, ratio)) * 0.72, t('nodes.model3d.progressLoadModel'))
		}, cachedView)
		cachedModelSignature = currentSignature
		initialSyncDone = true
		return true
	} catch (err: unknown) {
		errorMessage.value = getErrorMessage(err) || t('nodes.model3d.modelLoadFailed')
		viewer.clearModel()
		cachedModelSignature = ''
		cameraUserControlled = false
		initialSyncDone = false
		if (requestId != null) handlePreviewError()

		const repairResult = await attemptRepairModelUrl(url, requestId)
		if (repairResult.success && repairResult.newUrl) {
			errorMessage.value = ''
			if (requestId != null && requestId === activePreviewRequestId) {
				emitPreviewProgress(0.3, t('nodes.model3d.progressFixRefs'))
			}
			try {
				await viewer.loadModel(repairResult.newUrl, (payload) => {
					if (requestId == null) return
					if (requestId !== activePreviewRequestId) return
					const ratio = Number(payload?.ratio ?? 0)
					emitPreviewProgress(0.3 + Math.max(0, Math.min(1, ratio)) * 0.65, t('nodes.model3d.progressLoadTextures'))
				}, null)
				cachedModelSignature = modelSignature.value
				cameraUserControlled = false
				initialSyncDone = true
				return true
			} catch {
				errorMessage.value = t('nodes.model3d.modelLoadFailed')
				viewer.clearModel()
				cachedModelSignature = ''
				cameraUserControlled = false
				initialSyncDone = false
				if (requestId != null) handlePreviewError()
				return false
			}
		}

		return false
	}
}

const attemptRepairModelUrl = async (url: string, requestId?: number): Promise<{ success: boolean; newUrl?: string }> => {
	try {
		const parsed = new URL(url)
		if (parsed.protocol !== 'dweb:' || parsed.hostname !== 'project-assets') {
			return { success: false }
		}
		const projectId = Number(parsed.searchParams.get('projectId') || '0')
		const relPath = String(parsed.searchParams.get('path') || '').trim()
		if (!Number.isFinite(projectId) || projectId <= 0 || !relPath) {
			return { success: false }
		}
		const diag = await diagnoseDwebAsset({ projectId, relPath, url })
		if (!diag?.ok || !diag.repairedAsset?.url) {
			return { success: false }
		}
		updateSettings({
			modelUrl: diag.repairedAsset.url,
			modelAssetUrl: diag.repairedAsset.url,
			modelSourcePath: diag.repairedAsset.sourcePath || settings.value?.modelSourcePath
		})
		return { success: true, newUrl: diag.repairedAsset.url }
	} catch {
		return { success: false }
	}
}

const startPreviewLoad = async (requestId: number) => {
	activePreviewRequestId = requestId
	errorMessage.value = ''
	emitPreviewProgress(0.12, t('nodes.model3d.progressInitRenderer'))
	const ready = await waitForViewerReady()
	if (activePreviewRequestId !== requestId) return
	if (!ready || !viewer) {
		errorMessage.value = t('nodes.model3d.previewerInitTimeout')
		handlePreviewError()
		return
	}
	viewer.setRenderSuspended(false)
	applyViewerOptions()
	if (activePreviewRequestId !== requestId) return
	emitPreviewProgress(0.3, t('nodes.model3d.progressPrepareModel'))
	const url = effectiveModelUrl.value
	if (!url) {
		errorMessage.value = t('nodes.model3d.noModelBound2')
		viewer.clearModel()
		cachedModelSignature = ''
		handlePreviewError()
		return
	}
	const loaded = await loadModelIntoViewer(requestId)
	if (activePreviewRequestId !== requestId || !viewer) return
	if (loaded) {
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
		if (activePreviewRequestId !== requestId || !viewer) return
		saveViewState()
		captureSnapshot()
		emitPreviewProgress(0.98, t('nodes.model3d.progressSyncInteraction'))
		handlePreviewReady()
		nextTick(() => baseRef.value?.requestAutoResize())
	} else {
		if (!errorMessage.value) errorMessage.value = t('nodes.model3d.modelLoadFailed')
		handlePreviewError()
	}
}

const onUploadClick = () => fileInputRef.value?.click()
const onFileChange = (e: Event) => {
	const input = e.target as HTMLInputElement | null
	const file = input?.files?.[0]
	if (!file) return
	emit('upload-model-file', { file })
	if (input) input.value = ''
}
const onPreviewWheel = (e: WheelEvent) => {
	e.stopPropagation()
}
let contextMenuTimer: ReturnType<typeof setTimeout> | null = null
let contextMenuStartPos = { x: 0, y: 0 }
let isClickIntent = false
const CLICK_THRESHOLD = 200
const MOVE_THRESHOLD = 5
const onPreviewPointerDown = (e: PointerEvent) => {
	if (e.button !== 2) return
	isClickIntent = false
	contextMenuStartPos = { x: e.clientX, y: e.clientY }
	contextMenuTimer = setTimeout(() => {
		isClickIntent = true
	}, CLICK_THRESHOLD)
}
const onPreviewPointerMove = (e: PointerEvent) => {
	if (!contextMenuTimer) return
	const dx = e.clientX - contextMenuStartPos.x
	const dy = e.clientY - contextMenuStartPos.y
	const dist = Math.sqrt(dx * dx + dy * dy)
	if (dist >= MOVE_THRESHOLD) {
		isClickIntent = false
		if (contextMenuTimer) {
			clearTimeout(contextMenuTimer)
			contextMenuTimer = null
		}
	}
}
const onPreviewPointerUp = (e: PointerEvent) => {
	if (e.button !== 2) return
	if (contextMenuTimer) {
		clearTimeout(contextMenuTimer)
		contextMenuTimer = null
	}
	if (isClickIntent) {
		emit('preview-contextmenu', { clientX: e.clientX, clientY: e.clientY })
	}
	isClickIntent = false
}
const onBackgroundInput = (e: Event) =>
	updateSettings({ backgroundColor: String((e.target as HTMLInputElement).value || '#0f1720') })
const onLightIntensityChange = (e: Event) =>
	updateSettings({ lightIntensity: Number((e.target as HTMLInputElement).value || 0) })
const onRenderWidthChange = (e: Event) =>
	updateSettings({ renderWidth: Number((e.target as HTMLInputElement).value || 1) })
const onRenderHeightChange = (e: Event) =>
	updateSettings({ renderHeight: Number((e.target as HTMLInputElement).value || 1) })
const onGridToggle = (e: Event) =>
	updateSettings({ gridVisible: (e.target as HTMLInputElement).checked })
const onAxesToggle = (e: Event) =>
	updateSettings({ axesVisible: (e.target as HTMLInputElement).checked })
const onAutoRotateToggle = (e: Event) =>
	updateSettings({ autoRotate: (e.target as HTMLInputElement).checked })

const onOpenEditor = async () => {
	const url = effectiveModelUrl.value
	if (!url) return
	const modelName = String(settings.value?.modelSourceName ?? '').trim() 
		|| props.nodeId 
		|| t('nodes.model3d.defaultModelName')
	await open3DEditor({
		nodeId: props.nodeId,
		modelUrl: url,
		modelName,
	})
}

watch(modelSignature, () => {
	if (!viewer) return
	if (previewPhase.value === 'masked') return
	if (previewPhase.value === 'loading') return
	saveViewState()
	applyViewerOptions()
})

watch(
	() => previewInteractive.value,
	(active) => {
		viewer?.setInteractive(active)
		if (active) {
			viewer?.setRenderSuspended(previewSuspended.value)
		}
	},
	{ immediate: true, flush: 'post' }
)

watch(previewSuspended, (suspended) => {
	if (!viewer || previewPhase.value === 'masked') return
	if (suspended) {
		captureSnapshot()
	}
	viewer.setRenderSuspended(suspended)
})

watch(
	() => [previewPhase.value, previewRequestId.value] as const,
	([phase, requestId]) => {
		if (phase === 'masked') {
			activePreviewRequestId = 0
			cameraUserControlled = false
			initialSyncDone = false
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
		viewer?.setInteractive(true)
	},
	{ immediate: true, flush: 'post' }
)

onBeforeUnmount(() => {
	saveViewState()
	cacheSnapshot(snapshotUrl.value)
	disposeViewer()
})
</script>

<style scoped>
.wf-model3d-body {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	gap: 10px;
	flex-shrink: 0;
	align-self: stretch;
	box-sizing: border-box;
}

.wf-model3d-fetch-error {
	display: flex;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid rgb(239 68 68 / 0.45);
	background: rgb(239 68 68 / 0.08);
	border-radius: 6px;
	flex-shrink: 0;
}

.wf-model3d-fetch-error-icon {
	flex-shrink: 0;
	width: 20px;
	height: 20px;
	border-radius: 50%;
	background: rgb(239 68 68 / 0.85);
	color: #fff;
	font-size: 13px;
	font-weight: 700;
	display: flex;
	align-items: center;
	justify-content: center;
	line-height: 1;
}

.wf-model3d-fetch-error-body {
	display: grid;
	gap: 6px;
	flex: 1;
	min-width: 0;
}

.wf-model3d-fetch-error-title {
	font-size: 13px;
	font-weight: 600;
	color: rgb(248 113 113);
}

.wf-model3d-fetch-error-text {
	font-size: 12px;
	color: rgb(252 165 165 / 0.9);
	line-height: 1.4;
}

.wf-model3d-fetch-error-actions {
	display: flex;
	gap: 8px;
	margin-top: 2px;
}

.wf-model3d-fetch-error-btn {
	padding: 4px 10px;
	font-size: 12px;
	border: 1px solid rgb(255 255 255 / 0.15);
	background: rgb(255 255 255 / 0.06);
	color: #e5e7eb;
	border-radius: 4px;
	cursor: pointer;
	transition: all 0.15s;
}

.wf-model3d-fetch-error-btn:hover {
	background: rgb(255 255 255 / 0.12);
	border-color: rgb(255 255 255 / 0.25);
}

.wf-model3d-fetch-error-btn.primary {
	background: rgb(239 68 68 / 0.6);
	border-color: rgb(239 68 68 / 0.7);
	color: #fff;
}

.wf-model3d-fetch-error-btn.primary:hover {
	background: rgb(239 68 68 / 0.8);
	border-color: rgb(239 68 68 / 0.9);
}

.wf-model3d-viewer-shell {
	position: relative;
	width: 100%;
	flex: 1;
	min-height: 200px;
	border: 1px solid var(--vscode-border);
	border-radius: 6px;
	background: #0f1720;
	overflow: hidden;
}

.wf-model3d-download-progress {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px 12px;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.54);
	border-radius: 6px;
	flex-shrink: 0;
}

.wf-model3d-download-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 10px;
}

.wf-model3d-download-title {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 12px;
	color: var(--vscode-fg);
	font-weight: 500;
}

.wf-model3d-download-spinner {
	width: 14px;
	height: 14px;
	border: 2px solid rgb(59 130 246 / 0.3);
	border-top-color: #3b82f6;
	border-radius: 50%;
	animation: wf-model3d-spin 0.8s linear infinite;
	flex-shrink: 0;
}

@keyframes wf-model3d-spin {
	to {
		transform: rotate(360deg);
	}
}

.wf-model3d-download-icon {
	width: 16px;
	height: 16px;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 11px;
	font-weight: 700;
	flex-shrink: 0;
}

.wf-model3d-download-icon.done {
	background: rgb(34 197 94 / 0.85);
	color: #fff;
}

.wf-model3d-download-icon.failed {
	background: rgb(239 68 68 / 0.85);
	color: #fff;
}

.wf-model3d-download-speed {
	font-size: 11px;
	color: #60a5fa;
	font-variant-numeric: tabular-nums;
	flex-shrink: 0;
}

.wf-model3d-download-bar-container {
	width: 100%;
	height: 6px;
	background: rgb(255 255 255 / 0.08);
	border-radius: 3px;
	overflow: hidden;
}

.wf-model3d-download-bar-fill {
	height: 100%;
	width: 0%;
	border-radius: 3px;
	transition: width 0.2s ease;
}

.wf-model3d-download-bar-fill.active {
	background: linear-gradient(90deg, #2563eb, #3b82f6);
	box-shadow: 0 0 8px rgb(59 130 246 / 0.5);
}

.wf-model3d-download-bar-fill.done {
	background: linear-gradient(90deg, #16a34a, #22c55e);
	box-shadow: 0 0 8px rgb(34 197 94 / 0.5);
}

.wf-model3d-download-bar-fill.failed {
	background: linear-gradient(90deg, #dc2626, #ef4444);
	box-shadow: 0 0 8px rgb(239 68 68 / 0.5);
}

.wf-model3d-download-meta {
	display: flex;
	justify-content: space-between;
	font-size: 11px;
	color: var(--vscode-fg-muted);
	font-variant-numeric: tabular-nums;
}

.wf-model3d-download-error {
	font-size: 11px;
	color: #fca5a5;
	padding-top: 2px;
	word-break: break-all;
}

.wf-model3d-gesture-tip {
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

.wf-model3d-canvas {
	width: 100%;
	height: 100%;
	display: block;
	opacity: 0;
	transition: opacity 120ms ease;
}

.wf-model3d-canvas.live {
	opacity: 1;
}

.wf-model3d-overlay {
	position: absolute;
	inset: 0;
	z-index: 4;
	display: grid;
	place-items: center;
	padding: 16px;
	text-align: center;
	color: var(--vscode-fg);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.45);
	backdrop-filter: blur(4px);
}

.wf-model3d-overlay.error {
	color: #fecaca;
}

.wf-model3d-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	flex-shrink: 0;
}

.wf-model3d-filemeta {
	min-width: 0;
	display: grid;
	gap: 4px;
}

.wf-model3d-filename {
	font-size: 12px;
	color: var(--vscode-fg);
	word-break: break-all;
}

.wf-model3d-filehint {
	font-size: 11px;
	color: var(--vscode-fg-muted);
	word-break: break-all;
}

.wf-model3d-action-buttons {
	display: flex;
	gap: 8px;
}

.wf-model3d-btn {
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.88);
	background: linear-gradient(
		180deg,
		rgb(from var(--dweb-defualt-dark) r g b / 0.78),
		rgb(from var(--dweb-defualt) r g b / 0.72)
	);
	color: var(--vscode-fg);
	padding: 7px 10px;
	font-size: 12px;
	cursor: pointer;
	backdrop-filter: blur(8px);
	box-shadow:
		0 0 0 1px rgb(90 180 255 / 0.08),
		0 0 14px rgb(90 180 255 / 0.08);
}

.wf-model3d-btn:hover {
	border-color: var(--vscode-hover-border);
}

.wf-model3d-btn.ghost {
	color: var(--vscode-fg-muted);
}

.wf-file-input {
	position: absolute;
	width: 1px;
	height: 1px;
	opacity: 0;
	pointer-events: none;
}

.wf-model3d-footer {
	display: grid;
	gap: 10px;
}

.wf-model3d-toolbar {
	display: flex;
	align-items: center;
}

.wf-model3d-editor-btn {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 7px 12px;
	border: 1px solid rgb(34 197 94 / 0.5);
	background: linear-gradient(
		180deg,
		rgb(34 197 94 / 0.18),
		rgb(34 197 94 / 0.08)
	);
	color: rgb(134 239 172);
	font-size: 12px;
	cursor: pointer;
	transition: all 0.2s ease;
	backdrop-filter: blur(8px);
	box-shadow:
		0 0 0 1px rgb(34 197 94 / 0.1),
		0 0 16px rgb(34 197 94 / 0.12);
}

.wf-model3d-editor-btn:hover:not(:disabled) {
	border-color: rgb(34 197 94 / 0.8);
	background: linear-gradient(
		180deg,
		rgb(34 197 94 / 0.28),
		rgb(34 197 94 / 0.14)
	);
	box-shadow:
		0 0 0 1px rgb(34 197 94 / 0.2),
		0 0 24px rgb(34 197 94 / 0.2);
}

.wf-model3d-editor-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.wf-model3d-editor-icon {
	width: 16px;
	height: 16px;
	flex-shrink: 0;
}

.wf-model3d-tripo3d-badge {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin-left: 10px;
	padding: 6px 10px;
	border: 1px solid rgb(59 130 246 / 0.5);
	background: linear-gradient(
		180deg,
		rgb(59 130 246 / 0.15),
		rgb(59 130 246 / 0.06)
	);
	color: rgb(147 197 253);
	font-size: 11px;
	letter-spacing: 0.3px;
	backdrop-filter: blur(8px);
	box-shadow:
		0 0 0 1px rgb(59 130 246 / 0.08),
		0 0 12px rgb(59 130 246 / 0.1);
}

.wf-model3d-tripo3d-badge-icon {
	width: 14px;
	height: 14px;
	flex-shrink: 0;
}

.wf-model3d-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
}

.wf-model3d-field,
.wf-model3d-check {
	display: grid;
	gap: 6px;
}

.wf-model3d-field-wide {
	grid-column: 1 / -1;
}

.wf-model3d-label {
	font-size: 11px;
	color: #9ec2dd;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.wf-model3d-input {
	width: 100%;
	box-sizing: border-box;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.72);
	color: var(--vscode-fg);
	padding: 8px 10px;
	font-size: 12px;
}

.wf-model3d-input-color {
	padding: 4px;
	min-height: 34px;
}

.wf-model3d-check {
	grid-auto-flow: column;
	justify-content: start;
	align-items: center;
	gap: 8px;
	color: var(--vscode-fg);
	font-size: 12px;
}

.wf-model3d-info-card {
	display: grid;
	gap: 8px;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.54);
	padding: 10px;
}

.wf-model3d-info-row {
	display: flex;
	justify-content: space-between;
	gap: 12px;
}

.wf-model3d-info-value {
	font-size: 12px;
	color: var(--vscode-fg);
	word-break: break-all;
	text-align: right;
}

@media (max-width: 720px) {
	.wf-model3d-grid {
		grid-template-columns: 1fr;
	}
}

:deep(.wf-node-body) {
	flex: 1 1 auto !important;
	flex-direction: column;
	align-items: stretch;
	min-height: 0;
	overflow: hidden;
}
</style>
