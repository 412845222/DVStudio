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
		:input-param-preview-refs="inputParamPreviewRefs"
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
							<div
								v-if="effectiveModelUrl && viewerLive && !errorMessage && !showRestartButton"
								class="wf-model3d-gesture-tip"
							>
								{{ t('nodes.model3d.interactionHint') }}
							</div>
							<div v-if="errorMessage" class="wf-model3d-overlay error">{{ errorMessage }}</div>
							<div v-if="showRestartButton" class="wf-model3d-restart-overlay">
								<div class="wf-model3d-restart-title">3D预览未运行</div>
								<div class="wf-model3d-restart-text">点击下方按钮重新启动3D渲染</div>
								<button
									class="wf-model3d-restart-btn"
									type="button"
									@click.stop="handleForceRestart"
								>
									{{ t('nodes.model3d.restartRender') || '重启渲染' }}
								</button>
							</div>
						</template>
					</WorkflowThreePreviewShell>
				</div>

				<div v-if="activeDownloadState" class="wf-model3d-download-progress" @pointerdown.stop>
					<div class="wf-model3d-download-header">
						<div class="wf-model3d-download-title">
							<span v-if="activeDownloadIsActive" class="wf-model3d-download-spinner"></span>
							<span v-else-if="activeDownloadIsDone" class="wf-model3d-download-icon done">✓</span>
							<span v-else-if="activeDownloadIsFailed" class="wf-model3d-download-icon failed">
								!
							</span>
							{{
								activeDownloadIsFailed
									? t('nodes.model3d.downloadFailed')
									: activeDownloadIsDone
										? t('nodes.model3d.downloadComplete')
										: t('nodes.model3d.downloadingModel', { source: activeDownloadState.source })
							}}
						</div>
						<div
							class="wf-model3d-download-speed"
							v-if="activeDownloadIsActive && activeDownloadState.speed > 0"
						>
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
						<span>
							{{ formatBytes(activeDownloadState.loaded) }} /
							{{ formatBytes(activeDownloadState.total) }}
						</span>
						<span>{{ activeDownloadState.progress }}%</span>
					</div>
					<div class="wf-model3d-download-meta" v-else-if="activeDownloadIsActive">
						<span>{{ formatBytes(activeDownloadState.loaded) }}</span>
						<span>{{ activeDownloadState.progress }}%</span>
					</div>
					<div
						class="wf-model3d-download-error"
						v-if="activeDownloadIsFailed && activeDownloadState.error"
					>
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
							{{
								effectiveModelUrl
									? t('nodes.model3d.replaceResource')
									: t('nodes.model3d.uploadResource')
							}}
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
						<svg
							class="wf-model3d-editor-icon"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path
								d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
							/>
							<polyline points="3.27 6.96 12 12.01 20.73 6.96" />
							<line x1="12" y1="22.08" x2="12" y2="12" />
						</svg>
						<span>{{ t('nodes.model3d.open3DEditor') }}</span>
					</button>
					<div
						v-if="tripo3dPostProcessAvailable"
						class="wf-model3d-tripo3d-badge"
						:title="t('nodes.model3d.tripo3dPostProcessAvailable')"
					>
						<svg
							class="wf-model3d-tripo3d-badge-icon"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M12 2L2 7l10 5 10-5-10-5z" />
							<path d="M2 17l10 5 10-5" />
							<path d="M2 12l10 5 10-5" />
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
import { diagnoseDwebAsset, fetchAsArrayBuffer } from '../../../electronBridge'
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
import {
	formatBytes,
	formatSpeed
} from '../../../views/AIWorkflow/assets/useAIWorkflowAssetPersistence'
import { resolveWorkflowResourceUrl } from '../../../aiworkflow/domain/resource/safeWorkflowUrl'
import type { WorkflowNodeChatType } from '../../../aiworkflow/types'
import {
	getMeshyEffectiveModelSource,
	isMeshyRemoteUrl
} from '../../../views/AIWorkflow/node-business/meshy/useAIWorkflowMeshyAssets'
import {
	getTripo3DEffectiveModelSource,
	isTripo3DRemoteUrl
} from '../../../views/AIWorkflow/node-business/tripo3d/useAIWorkflowTripo3DAssets'
import { getProjectRootById } from '../../../electronBridge'

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
	// ===== 2026-08-03 修复：NodeComponentResolver.resolveResourceProps 会从 resourcesById 解析资源并下发这些字段
	// 对于 node.resourceId 存在的节点，resourcesById 里保存的是 Runtime 持久化后的正确资产路径（无 CORS、无缩略图污染），应最高优先级使用
	resourceUrl?: string
	resourceSourcePath?: string
	resourceName?: string
	posterUrl?: string
	/** 蓝图项目相对路径：Content/Media/meshy-3d-xxx.glb，可直接拼接 projectRoot 得到绝对路径后转 file:/// */
	resourceProjectRelativePath?: string
	/** 本地绝对路径（若存在则直接转 file:///，无需再查询 projectRoot） */
	resourceAbsolutePath?: string
}>()

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
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const baseRef = ref<InstanceType<typeof WorkflowNodeBase> | null>(null)
const snapshotCacheKey = String(props.nodeId ?? '').trim()
const snapshotUrl = ref(
	snapshotCacheKey ? String(MODEL3D_SNAPSHOT_CACHE.get(snapshotCacheKey) ?? '') : ''
)
const errorMessage = ref('')
const viewerHasModel = ref(false)
let viewer: Model3DPreviewViewer | null = null
let viewerInitRaf = 0
let viewerInitPending = false
let viewerInitCooldownUntil = 0
let activePreviewRequestId = 0
let cachedModelSignature = ''
let cameraUserControlled = false
let initialSyncDone = false
let silentModelLoading = false

const internalPreviewRequestId = ref(0)
const internalPreviewPhase = ref<WorkflowThreePreviewPhase>('masked')
const internalPreviewProgress = ref(0)
const internalPreviewLabel = ref('')
const internalPreviewState = computed<WorkflowThreePreviewState>(() => ({
	phase: internalPreviewPhase.value,
	canStart: true,
	progress: internalPreviewProgress.value,
	label: internalPreviewLabel.value,
	requestId: internalPreviewRequestId.value
}))

// ===========================================================================
// 2026-08-03 彻底修复：强制把 dweb URL / projectRelativePath 提前解析成 file:/// 本地绝对路径
//   原因：Electron + Three.js FileLoader 无法原生处理 dweb:// 协议，
//        fetchAsArrayBuffer 代理又可能因时序/注册问题失败，最终 fallback 到远程 CDN 触发 CORS。
//   策略：只要任何来源能拿到蓝图项目文件夹内的真实 GLB 文件相对/绝对路径，
//        就立刻通过 getProjectRootById 拿到 projectRoot 拼接成本地绝对路径 → file:/// URL，
//        直接交给 Three.js FileLoader（FileLoader 原生支持 file:/// 协议在 Electron 中加载）
// ===========================================================================
const forceResolvedLocalFileUrl = ref('')
const resolvedLocalCacheKey = ref('') // 缓存键：避免重复异步查询 projectRoot

/**
 * 从任意候选 URL/路径中提取蓝图项目相对路径（Content/Media/xxx.glb）
 *  - dweb URL: 从 path 参数提取
 *  - 本地绝对路径: 不处理（交给上层）
 *  - 相对路径: 直接返回
 */
const extractProjectRelativePathFromAny = (input: string): string => {
	const t = String(input ?? '').trim()
	if (!t) return ''
	// dweb URL: 优先从 path 参数提取
	const low = t.toLowerCase()
	if (low.startsWith('dweb://') || low.startsWith('dweb:')) {
		try {
			const qStart = t.indexOf('?')
			if (qStart >= 0) {
				const params = new URLSearchParams(t.slice(qStart + 1))
				const rawPath =
					params.get('path') || params.get('relativePath') || params.get('assetPath') || ''
				if (rawPath) {
					const clean = decodeURIComponent(rawPath).split('?')[0].split('#')[0].replace(/\\/g, '/')
					if (clean && clean.toLowerCase().endsWith('.glb')) return clean
				}
			}
		} catch {
			/* ignore */
		}
	}
	// 形如 Content/Media/xxx.glb 的相对路径
	const normalized = t.replace(/\\/g, '/').split('?')[0].split('#')[0]
	if (/^Content\/Media\/.+\.(glb|gltf|fbx|obj|stl|usdz)$/i.test(normalized)) {
		return normalized
	}
	return ''
}

/**
 * 异步解析：把所有可用的资源信息（上层 props.resource* / dweb / taskId 推导）
 * 强制转换为 file:/// 开头的本地绝对路径 URL，彻底绕开 dweb 协议代理层与远程 CDN
 */
const ensureResolveToLocalFileUrl = async (): Promise<string> => {
	const s = settings.value
	const meshy = s?.meshyModelSettings ?? null
	const tripo = s?.tripo3dModelSettings ?? null

	// ===== 1. 候选池：所有可能推导出本地绝对路径的来源 =====
	const probes: Array<{ kind: string; value: string }> = []
	// 1.1 props 注入的绝对路径（最高优先级）
	if (props.resourceAbsolutePath && isLikely3DModelUrl(props.resourceAbsolutePath)) {
		probes.push({ kind: 'props.resourceAbsolutePath', value: props.resourceAbsolutePath })
	}
	// 1.2 props 注入的 projectRelativePath（次高）
	if (props.resourceProjectRelativePath) {
		probes.push({
			kind: 'props.resourceProjectRelativePath',
			value: props.resourceProjectRelativePath
		})
	}
	// 1.3 props.resourceUrl (dweb://...) → 从中提取 path 参数
	if (props.resourceUrl) {
		const rel = extractProjectRelativePathFromAny(props.resourceUrl)
		if (rel) probes.push({ kind: 'props.resourceUrl dweb path', value: rel })
	}
	// 1.4 内层 fallback 合成的 fallback.url（resolvedFallbackModelSource）
	const fbUrl = resolvedFallbackModelSource.value?.url || ''
	if (fbUrl) {
		const rel = extractProjectRelativePathFromAny(fbUrl)
		if (rel) probes.push({ kind: 'fallback.url dweb path', value: rel })
	}
	// 1.5 settings 外层 modelAssetPath / modelSourcePath
	for (const [k, v] of Object.entries({
		'settings.modelAssetPath': s?.modelAssetPath,
		'settings.modelSourcePath': s?.modelSourcePath,
		'settings.modelAssetUrl': s?.modelAssetUrl,
		'settings.modelUrl': s?.modelUrl
	})) {
		const str = String(v ?? '').trim()
		if (!str) continue
		if (isLikely3DModelUrl(str)) {
			if (isLocalAbsPath(str)) probes.push({ kind: k + '(abs)', value: str })
			const rel = extractProjectRelativePathFromAny(str)
			if (rel) probes.push({ kind: k + '(rel)', value: rel })
		}
	}
	// 1.6 meshy / tripo taskId 推导的标准相对路径（最后兜底）
	const meshyTaskId = extractMeshyTaskIdFromAny(s || {})
	if (meshyTaskId) {
		probes.push({
			kind: 'meshy taskId derive',
			value: `Content/Media/meshy-3d-${meshyTaskId}.glb`
		})
	}
	const tripoTaskId = (() => {
		const searchObjs = [tripo, s].filter(Boolean)
		const uuidRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i
		for (const obj of searchObjs) {
			if (!obj || typeof obj !== 'object') continue
			for (const val of Object.values(obj as Record<string, unknown>)) {
				if (typeof val !== 'string') continue
				const m = val.match(uuidRegex)
				if (m) return m[0]
			}
		}
		return ''
	})()
	if (tripoTaskId) {
		probes.push({
			kind: 'tripo3d taskId derive',
			value: `Content/Media/tripo3d-${tripoTaskId}.glb`
		})
	}

	// ===== 2. 分类：本地绝对路径 / 相对路径 =====
	let absPathHit = ''
	for (const p of probes) {
		if (isLocalAbsPath(p.value) && isLikely3DModelUrl(p.value)) {
			absPathHit = p.value
			break
		}
	}
	const relPathHits: string[] = []
	const seenRel = new Set<string>()
	for (const p of probes) {
		if (isLocalAbsPath(p.value)) continue
		const cleaned = String(p.value || '')
			.replace(/\\/g, '/')
			.trim()
		if (!cleaned || seenRel.has(cleaned.toLowerCase())) continue
		if (/\.glb$/i.test(cleaned) || /\.gltf$/i.test(cleaned)) {
			seenRel.add(cleaned.toLowerCase())
			relPathHits.push(cleaned)
		}
	}

	// ===== 3. 本地绝对路径：直接转 file:/// =====
	if (absPathHit) {
		const fileUrl = localAbsPathToFileUrl(absPathHit)
		if (fileUrl) {
			forceResolvedLocalFileUrl.value = fileUrl
			return fileUrl
		}
	}

	// ===== 4. 相对路径：查询 projectRoot (通过 getProjectRootById) =====
	if (relPathHits.length > 0) {
		let projectId = 0
		// 4.1 从 dweb URL 或 probes 中提取已有 projectId
		const allForPid = [props.resourceUrl, fbUrl, s?.modelAssetUrl, s?.modelUrl].filter(
			Boolean
		) as string[]
		for (const raw of allForPid) {
			const t = String(raw || '').trim()
			if (!t) continue
			if (t.toLowerCase().startsWith('dweb://') || t.toLowerCase().startsWith('dweb:')) {
				try {
					const q = t.indexOf('?')
					if (q >= 0) {
						const p = new URLSearchParams(t.slice(q + 1)).get('projectId')
						if (p) {
							const pid = Number(p)
							if (Number.isFinite(pid) && pid > 0) {
								projectId = pid
								break
							}
						}
					}
				} catch {
					/* ignore */
				}
			}
		}
		// 4.2 fallback: 取默认 projectId=1（当前项目只有一个蓝图）
		if (!projectId) projectId = 1

		// 4.3 查询 projectRoot
		let rootPath = ''
		const cacheKey = `pid=${projectId};rels=${relPathHits.join(',')}`
		if (resolvedLocalCacheKey.value === cacheKey && forceResolvedLocalFileUrl.value) {
			return forceResolvedLocalFileUrl.value
		}
		try {
			const root = await getProjectRootById(projectId)
			rootPath = root ? String(root).trim() : ''
		} catch {
			rootPath = ''
		}

		if (rootPath) {
			const sep = rootPath.endsWith('\\') || rootPath.endsWith('/') ? '' : '\\'
			for (const rel of relPathHits) {
				const abs = rootPath + sep + rel.replace(/\//g, '\\')
				const fileUrl = localAbsPathToFileUrl(abs)
				if (fileUrl) {
					resolvedLocalCacheKey.value = cacheKey
					forceResolvedLocalFileUrl.value = fileUrl
					return fileUrl
				}
			}
		}
	}

	// ===== 5. 所有路径都无法解析到 file:///，返回空（继续走原 effectiveModelUrl 流程）=====
	return forceResolvedLocalFileUrl.value || ''
}

const cacheSnapshot = (value: string) => {
	if (!snapshotCacheKey) return
	const next = String(value ?? '').trim()
	if (!next) return
	MODEL3D_SNAPSHOT_CACHE.set(snapshotCacheKey, next)
}

const settings = computed(() => props.model3dSettings ?? null)
const previewSuspended = computed(() => props.previewSuspended === true)

const MODEL_EXT_WHITELIST = Object.freeze([
	'glb',
	'gltf',
	'fbx',
	'obj',
	'stl',
	'usdz', // ===== 新增：project_memory 明确要求 usdz 在白名单中 =====
	'dae',
	'3ds',
	'ply',
	'x3d',
	'x',
	'json'
])

// ===========================================================================
// 场景布局节点同款修复函数（从 useAIWorkflowSceneLayoutModelBindings.ts 直接搬过来）：
//   fixDvcacheBinPath: 把错误的 .dvcache/bin/meshy_{taskId}.bin 路径修正为 Content/Media/meshy-3d-{taskId}.glb
//   fixDwebUrlPath:   修正 dweb://project-assets?path=... 中的 bin 路径参数
// 为什么需要这两个函数？
//   旧版本 Meshy Runtime 在同步资产时，曾错误地把 .dvcache/bin/meshy_{taskId}.bin 记录到 modelSourcePath 等字段，
//   而真实存储到磁盘的是 Content/Media/meshy-3d-{taskId}.glb。场景布局节点就是靠这两个函数把错误路径修复后才能成功渲染。
// ===========================================================================
const fixDvcacheBinPath = (p: string): string => {
	if (!p) return p
	let result = p
	const lower = result.toLowerCase().replace(/\//g, '\\')
	const dvcachePattern = /\.dvcache[\\/]bin[\\/](meshy(?:-3d)?)[_-]([a-f0-9-]+)\.bin$/i
	const match = lower.match(dvcachePattern)
	if (match) {
		const meshyId = match[2]
		const correctPath = `Content\\Media\\meshy-3d-${meshyId}.glb`
		result = result.replace(
			/\.dvcache[\\/]bin[\\/](meshy(?:-3d)?)[_-]([a-f0-9-]+)\.bin$/i,
			correctPath.replace(/\\/g, p.includes('/') ? '/' : '\\')
		)
	}
	return result
}

const fixDwebUrlPath = (url: string): string => {
	if (!url) return url
	if (!url.startsWith('dweb://project-assets')) return url
	try {
		const qIndex = url.indexOf('?')
		if (qIndex < 0) return url
		const base = url.substring(0, qIndex + 1)
		const query = url.substring(qIndex + 1)
		const params = new URLSearchParams(query)
		const pathParam = params.get('path')
		if (pathParam) {
			const decodedPath = decodeURIComponent(pathParam)
			const lower = decodedPath.toLowerCase().replace(/\//g, '\\')
			if (lower.includes('.dvcache\\bin\\') && lower.endsWith('.bin')) {
				const dvcachePattern = /\.dvcache\/bin\/(meshy(?:-3d)?)[_-]([a-f0-9-]+)\.bin$/i
				const m = decodedPath.replace(/\\/g, '/').match(dvcachePattern)
				if (m) {
					const meshyId = m[2]
					const correctPath = `Content/Media/meshy-3d-${meshyId}.glb`
					params.set('path', correctPath)
					return base + params.toString()
				}
			}
		}
	} catch {
		/* ignore */
	}
	return url
}

// ===========================================================================
// 基于 taskId 兜底推导磁盘上真实的 GLB 路径：
//   Meshy:   Content/Media/meshy-3d-{taskId}.glb
//   Tripo3D: Content/Media/tripo3d-{taskId}.glb
// Runtime 持久化模型文件时的命名规则是固定的，即使 DB 字段被污染，文件一定在那里。
// ===========================================================================
const extractMeshyTaskIdFromAny = (settings: any): string => {
	if (!settings) return ''
	const searchObjects = [
		settings.meshyModelSettings ?? null,
		settings.tripo3dModelSettings ?? null,
		settings,
		settings.modelGenerationSource ? settings : null
	].filter(Boolean)
	const uuidRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i
	for (const obj of searchObjects) {
		if (!obj || typeof obj !== 'object') continue
		for (const val of Object.values(obj)) {
			if (typeof val !== 'string') continue
			const m = val.match(uuidRegex)
			if (m) return m[0]
		}
	}
	return ''
}

const deriveProjectMediaModelCandidates = (
	projectId: number | string | undefined,
	taskId: string,
	source: 'meshy' | 'tripo3d' | 'unknown'
): string[] => {
	if (!taskId) return []
	const results: string[] = []
	const pid = projectId ? String(projectId) : '1'
	if (source === 'meshy') {
		// 真实项目中 Meshy 下载后的文件名是：meshy-3d-{taskId}.glb（中划线），严格匹配
		const relPath = `Content/Media/meshy-3d-${taskId}.glb`
		results.push(`dweb://project-assets?projectId=${pid}&path=${encodeURIComponent(relPath)}`)
		results.push(relPath)
	} else if (source === 'tripo3d') {
		// Tripo3D 实际有两种命名：tripo3d-{taskId}.glb / tripo3d_{taskId}.glb
		const variants = [`Content/Media/tripo3d-${taskId}.glb`, `Content/Media/tripo3d_${taskId}.glb`]
		for (const rel of variants) {
			results.push(`dweb://project-assets?projectId=${pid}&path=${encodeURIComponent(rel)}`)
		}
		for (const rel of variants) results.push(rel)
	} else {
		// unknown: 仍然按真实文件中存在的前缀枚举（与 audit 脚本一致）
		const candidates = [
			`Content/Media/meshy-3d-${taskId}.glb`,
			`Content/Media/tripo3d-${taskId}.glb`,
			`Content/Media/tripo3d_${taskId}.glb`
		]
		for (const cp of candidates) {
			results.push(`dweb://project-assets?projectId=${pid}&path=${encodeURIComponent(cp)}`)
		}
		for (const cp of candidates) results.push(cp)
	}
	return results
}

const IMAGE_EXT_BLACKLIST = Object.freeze([
	'png',
	'jpg',
	'jpeg',
	'gif',
	'webp',
	'bmp',
	'tiff',
	'tif',
	'svg',
	'ico',
	'heic',
	'heif'
])

const extractUrlExt = (url: string): string => {
	if (!url) return ''
	try {
		const text = String(url).trim()
		// 1. dweb://project-assets?projectId=xxx&path=assets/xxx.glb 场景：从 path 参数提取扩展名
		const low = text.toLowerCase()
		if (low.startsWith('dweb://') || low.startsWith('dweb:')) {
			try {
				const qStart = text.indexOf('?')
				const queryStr = qStart >= 0 ? text.slice(qStart + 1) : ''
				const params = new URLSearchParams(queryStr)
				const p = decodeURIComponent(
					params.get('path') || params.get('relativePath') || params.get('assetPath') || ''
				)
				if (p) {
					const clean = p.split('?')[0].split('#')[0]
					const lastSlash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
					const namePart = lastSlash >= 0 ? clean.slice(lastSlash + 1) : clean
					const d = namePart.lastIndexOf('.')
					if (d >= 0) return namePart.slice(d + 1).toLowerCase()
				}
			} catch {
				/* ignore */
			}
		}
		// 2. 标准 URL 或 本地绝对路径 (Windows G:\... 或 Unix /...)：文件名部分提取扩展名
		const withoutQuery = text.split('?')[0].split('#')[0]
		const lastSlash = Math.max(withoutQuery.lastIndexOf('/'), withoutQuery.lastIndexOf('\\'))
		const namePart = lastSlash >= 0 ? withoutQuery.slice(lastSlash + 1) : withoutQuery
		const lastDot = namePart.lastIndexOf('.')
		if (lastDot < 0) return ''
		return namePart.slice(lastDot + 1).toLowerCase()
	} catch {
		return ''
	}
}

const isImageExtension = (ext: string): boolean => {
	if (!ext) return false
	return IMAGE_EXT_BLACKLIST.includes(ext)
}
// 检测 URL 或本地 Path 是否为图片（扩展名命中图片黑名单）
// 用于在消费端显式过滤掉缩略图污染的错误记录
const isImageUrlOrPath = (input: string): boolean => {
	const ext = extractUrlExt(input)
	return isImageExtension(ext)
}

const isLikely3DModelUrl = (url: string): boolean => {
	if (!url) return false
	const ext = extractUrlExt(url)
	// ===== 消费端最严防线：只要有扩展名，必须命中 MODEL_EXT_WHITELIST，且不在 IMAGE_EXT_BLACKLIST 中 =====
	// 未知扩展名 / 图片扩展名 / 任何模糊匹配全部拒绝！只接受明确是 glb/gltf/fbx/obj/stl/usdz 等模型后缀的 URL
	// 原因：Meshy 任务节点 DB 中曾被缩略图 PNG 路径污染 modelAssetUrl/modelSourcePath
	// (例如 meshy_019fc37e-...png)，如果不严格拒绝，会错误地尝试解析 PNG 为 GLB
	if (!ext) return false
	if (IMAGE_EXT_BLACKLIST.includes(ext)) return false
	if (MODEL_EXT_WHITELIST.includes(ext)) return true
	return false
}

const isRemoteMeshyUrl = (url: string): boolean => {
	if (!url) return false
	try {
		const parsed = new URL(url)
		return /(^|\.)meshy\.ai$/i.test(parsed.hostname)
	} catch {
		return /https?:\/\/[^\s]*meshy\.ai(?:\/|$)/i.test(url)
	}
}

// ===========================================================================
// 本地路径优先的 URL 候选排序与解析：
//   1. dweb://project-assets?path=xxx （项目资产标准协议，无 CORS）
//   2. Windows / Unix 本地绝对路径 → 自动转成 file:/// 供 Three.js FileLoader 加载
//   3. 相对路径 / 其他非远程协议
//   4. 最后兜底：http / https 远程 CDN URL（有 CORS 风险）
// 每一层都会先过滤掉图片后缀（缩略图污染），只保留疑似 3D 模型的 URL。
// ===========================================================================
const isRemoteHttpUrl = (input: string): boolean => {
	if (!input) return false
	const t = String(input).trim().toLowerCase()
	return t.startsWith('http://') || t.startsWith('https://')
}
// 将本地绝对路径转换成标准 file:/// URL（跨盘符 Windows / Unix 均适用）。
// 只有确认是本地路径时才调用此函数。
const localAbsPathToFileUrl = (absPath: string): string => {
	if (!absPath) return ''
	const t = String(absPath).trim()
	if (!t) return ''
	if (/^[a-z]:[\\/]/i.test(t)) {
		// Windows: G:\foo\bar.glb → file:///G:/foo/bar.glb
		const forward = t.replace(/\\/g, '/')
		return 'file:///' + encodeURI(forward).replace(/#/g, '%23')
	}
	if (t.startsWith('/')) {
		// Unix: /foo/bar.glb → file:///foo/bar.glb
		return 'file://' + encodeURI(t).replace(/#/g, '%23')
	}
	return ''
}
const isLocalAbsPath = (input: string): boolean => {
	if (!input) return false
	const t = String(input).trim()
	return /^[a-z]:[\\/]/i.test(t) || /^\/[^\/]/i.test(t)
}
type CandidateQuality = 0 | 1 | 2 | 3 | 4 // 4 最高优先级
const candidateQuality = (input: string): CandidateQuality => {
	if (!input) return 0
	const t = String(input).trim()
	if (!t) return 0
	const low = t.toLowerCase()
	if (low.startsWith('dweb://') || low.startsWith('dweb:')) return 4
	if (isLocalAbsPath(t)) return 3
	if (!isRemoteHttpUrl(t)) return 2 // 其他非远程：blob/data/file/相对路径等
	return 1 // 远程 http/https
}
// 解析单个候选：必要时将本地绝对路径 → file:// URL
const normalizeCandidate = (input: string): string => {
	if (!input) return ''
	const t = String(input).trim()
	if (!t) return ''
	if (isLocalAbsPath(t)) {
		return localAbsPathToFileUrl(t) || t
	}
	// dweb / http / blob / data → 保留 resolveWorkflowResourceUrl 之后的原样
	return t
}
// 把误判为图片后缀的路径（实际可能是 DB 里记录错扩展名，但磁盘上真实文件是 GLB）恢复为 .glb 候选
// 例：G:\DVSTestProject\xxx\meshy-3d-xxx.png → G:\DVSTestProject\xxx\meshy-3d-xxx.glb
// dweb://project-assets?path=xxx.png → 把 path 参数改扩展名后重新拼接
const recoverImageExtToModel = (input: string, targetExt: string = 'glb'): Array<string> => {
	if (!input) return []
	const t = String(input).trim()
	if (!t) return []
	const ext = extractUrlExt(t)
	if (!ext || !IMAGE_EXT_BLACKLIST.includes(ext)) return []
	const low = t.toLowerCase()
	const results: string[] = []
	if (low.startsWith('dweb://') || low.startsWith('dweb:')) {
		try {
			const qStart = t.indexOf('?')
			const prefix = qStart >= 0 ? t.slice(0, qStart) : t
			const queryStr = qStart >= 0 ? t.slice(qStart + 1) : ''
			const params = new URLSearchParams(queryStr)
			for (const key of ['path', 'relativePath', 'assetPath']) {
				const raw = params.get(key)
				if (!raw) continue
				const p = decodeURIComponent(raw)
				const clean = p.split('?')[0].split('#')[0]
				const lastSlash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
				const namePart = lastSlash >= 0 ? clean.slice(lastSlash + 1) : clean
				const d = namePart.lastIndexOf('.')
				if (d < 0) continue
				const base = clean.slice(0, lastSlash + 1) + namePart.slice(0, d)
				const newClean = base + '.' + targetExt
				const newParams = new URLSearchParams(queryStr)
				newParams.set(key, encodeURIComponent(newClean))
				results.push(prefix + '?' + newParams.toString())
			}
		} catch {
			/* ignore */
		}
		return results
	}
	const withoutQuery = t.split('?')[0].split('#')[0]
	const lastDot = withoutQuery.lastIndexOf('.')
	if (lastDot < 0) return results
	const base = withoutQuery.slice(0, lastDot)
	const rest = t.slice(withoutQuery.length)
	for (const e of [targetExt, 'gltf']) {
		results.push(base + '.' + e + rest)
	}
	return results
}
// 从一组候选中挑出最好的模型 URL：先过滤后缀，再按质量排序，取最高优先级的第一个
// 还会对被误判为图片后缀的路径做扩展名恢复，加入候选池
const isRemoteVendorCdnUrl = (u: string): boolean => {
	if (!u) return false
	const t = String(u).trim()
	if (!t) return false
	if (isMeshyRemoteUrl(t)) return true
	if (isTripo3DRemoteUrl(t)) return true
	return false
}

const pickBestModelUrlFromCandidates = (
		rawCandidates: Array<string | null | undefined>
	): string => {
		const validList: Array<{ url: string; q: CandidateQuality }> = []
		const pushOne = (raw: string) => {
			const u0 = String(raw ?? '').trim()
			if (!u0) return
			// ===== 场景布局节点同款策略：直接丢弃 meshy.ai / tripo3d.ai 远程 CDN URL，避免 CORS + 过期 URL =====
			if (isRemoteVendorCdnUrl(u0)) return
			// ===== 2026-08-05 修复：blob: URL 来自用户通过 file input 选择的模型文件，始终允许通过 =====
			// 原因：blob URL 没有文件扩展名，isLikely3DModelUrl 会返回 false 导致被过滤，
			// 但这些 URL 是从 <input accept=".glb,.gltf,..."> 选择的真实模型文件创建的，
			// settings.modelFormat 也已确认是模型格式，可以安全加载
			if (u0.toLowerCase().startsWith('blob:')) {
				validList.push({ url: u0, q: 2 })
				return
			}
			// ===== 场景布局节点同款修复：进入候选池前先修正 dvcache bin 路径
			const u1 = fixDwebUrlPath(fixDvcacheBinPath(u0))
			const tryList = [u1]
			// 再尝试恢复被误判为图片后缀的路径为模型后缀（真实磁盘上是 GLB，数据库里扩展名被污染）
			for (const r of recoverImageExtToModel(u1)) tryList.push(r)
			for (const u of tryList) {
				if (!u) continue
				if (isRemoteVendorCdnUrl(u)) continue
				if (isImageUrlOrPath(u)) continue
				if (!isLikely3DModelUrl(u)) continue
				const norm = normalizeCandidate(u)
				if (!norm) continue
				validList.push({ url: norm, q: candidateQuality(norm) })
			}
		}
	for (const raw of rawCandidates) {
		const u = String(raw ?? '').trim()
		if (!u) continue
		pushOne(u)
	}
	if (validList.length === 0) return ''
	validList.sort((a, b) => Number(b.q) - Number(a.q))
	return validList[0].url
}

const resolvedFallbackModelSource = computed(() => {
	const s = settings.value
	const meshy = s?.meshyModelSettings ?? null
	const tripo = s?.tripo3dModelSettings ?? null

	// ===== 直接从节点 settings 的 projectAssetUrl/assetPath 中提取 projectId（比依赖 store 更直接且无需传 prop）=====
	const detectProjectIdFromCandidate = (): string | undefined => {
		const probes = [
			s?.modelAssetUrl,
			s?.modelUrl,
			s?.modelAssetPath,
			s?.modelSourcePath,
			meshy?.outputAssetUrl,
			meshy?.relationSummary?.effectiveLocalAssetUrl,
			tripo?.tripo3dImageUrl,
			tripo?.tripo3dRelationSummary?.effectiveLocalAssetUrl,
			props.resourceUrl,
			props.resourceSourcePath
		]
		for (const raw of probes) {
			const t = String(raw ?? '').trim()
			if (!t) continue
			if (t.startsWith('dweb://') || t.startsWith('dweb:')) {
				try {
					const q = t.indexOf('?')
					const qs = q >= 0 ? t.slice(q + 1) : ''
					const p = new URLSearchParams(qs).get('projectId')
					if (p) return p
				} catch {}
			}
		}
		return undefined
	}
	const inferredProjectId = detectProjectIdFromCandidate()

	if (meshy) {
		const eff = getMeshyEffectiveModelSource(meshy as any)
		const meshyRec = (meshy ?? {}) as Record<string, unknown>
		const meshyRel = (meshyRec.meshyRelationSummary ?? {}) as Record<string, unknown>
		// ===== 场景布局节点同款最高优先级：从 meshyTaskId 推导 Content/Media/meshy-3d-{taskId}.glb =====
		const meshyTaskId = String(
			meshyRel.effectiveTaskId ?? meshyRec.meshyTaskId ?? meshyRec.meshyUpstreamTaskId ?? ''
		).trim()
		const taskDerivedCandidates = meshyTaskId
			? deriveProjectMediaModelCandidates(inferredProjectId, meshyTaskId, 'meshy')
			: []
		const rawAssetUrl = eff.assetUrl ? resolveWorkflowResourceUrl(eff.assetUrl) : ''
		const rawPreferredUrl = eff.preferredUrl ? resolveWorkflowResourceUrl(eff.preferredUrl) : ''
		const assetPath = String(eff.assetPath ?? '').trim()
		const safeAssetPath = assetPath && !isImageUrlOrPath(assetPath) ? assetPath : ''
		// ===== 2026-08-03 修复：props.resourceUrl / props.resourceSourcePath 是上层
		// NodeComponentResolver.resolveResourceProps 从 resourcesById 解析好的正确资产路径（比任何推导更可信）
		// 必须最高优先级：它们对应蓝图项目 Content/Media 下真实存在的 glb 文件
		const resolvedResourceUrl = props.resourceUrl
			? resolveWorkflowResourceUrl(props.resourceUrl)
			: ''
		const resolvedResourceSourcePath = String(props.resourceSourcePath ?? '').trim()
		const safeResolvedSourcePath =
			resolvedResourceSourcePath && !isImageUrlOrPath(resolvedResourceSourcePath)
				? resolvedResourceSourcePath
				: ''
		const url = pickBestModelUrlFromCandidates([
			// ===== 0. 绝对最高优先级：上层从 resourcesById 解析注入的正确 resourceUrl / resourceSourcePath
			resolvedResourceUrl,
			safeResolvedSourcePath,
			// ===== 1. taskId 推导的蓝图项目 Content/Media 真实 GLB 文件（用户明确要求的链路）=====
			...taskDerivedCandidates,
			// 2. assetUrl 通常是 dweb://project-assets，本地优先最高
			rawAssetUrl,
			// 3. assetPath 是本地绝对路径（G:\...\xxx.glb），我们自动转成 file:/// 就能加载蓝图项目文件夹中真实 GLB
			safeAssetPath,
			// 4. 最后才是 preferredUrl（远程 Meshy CDN，有 CORS 风险）
			rawPreferredUrl
		])
		if (url) {
			return {
				url,
				assetPath: safeAssetPath,
				format: String(eff.format ?? 'glb').toLowerCase(),
				source: 'meshy' as const
			}
		}
	}
	if (tripo) {
		const eff = getTripo3DEffectiveModelSource(tripo as any)
		const tripoRec = (tripo ?? {}) as Record<string, unknown>
		const tripoRel = (tripoRec.tripo3dRelationSummary ?? {}) as Record<string, unknown>
		const tripoTaskId = String(
			tripoRel.effectiveTaskId ?? tripoRec.tripo3dTaskId ?? tripoRec.tripo3dUpstreamTaskId ?? ''
		).trim()
		const taskDerivedCandidates = tripoTaskId
			? deriveProjectMediaModelCandidates(inferredProjectId, tripoTaskId, 'tripo3d')
			: []
		const rawAssetUrl = eff.assetUrl ? resolveWorkflowResourceUrl(eff.assetUrl) : ''
		const rawPreferredUrl = eff.preferredUrl ? resolveWorkflowResourceUrl(eff.preferredUrl) : ''
		const assetPath = String((eff as any).assetPath ?? '').trim()
		const safeAssetPath = assetPath && !isImageUrlOrPath(assetPath) ? assetPath : ''
		const url = pickBestModelUrlFromCandidates([
			...taskDerivedCandidates,
			rawAssetUrl,
			safeAssetPath,
			rawPreferredUrl
		])
		if (url) {
			return {
				url,
				assetPath: safeAssetPath,
				format: String(eff.format ?? 'glb').toLowerCase(),
				source: 'tripo3d' as const
			}
		}
	}

	// ===== P3-1：纯手动上传（无 meshy / 无 tripo）的兜底分支 =====
	// 场景：空白新建 3D 模型节点，仅通过节点上传按钮直接选择 GLB/GLTF
	//      （不经过 Meshy/Tripo3D 生成链路）
	// 逻辑：与 meshy 分支保持一致，上层从 resourcesById 解析注入的 props.* 路径优先级最高
	{
		const s2 = settings.value
		const rawModelAssetUrl = String(s2?.modelAssetUrl ?? '').trim()
		const rawModelUrl = String(s2?.modelUrl ?? '').trim()
		const rawAssetPath = String(s2?.modelAssetPath ?? '').trim()
		const safeAssetPath2 = rawAssetPath && !isImageUrlOrPath(rawAssetPath) ? rawAssetPath : ''

		const resolvedResourceUrl = props.resourceUrl
			? resolveWorkflowResourceUrl(props.resourceUrl)
			: ''
		const resolvedResourceSourcePath = String(props.resourceSourcePath ?? '').trim()
		const safeResSourcePath =
			resolvedResourceSourcePath && !isImageUrlOrPath(resolvedResourceSourcePath)
				? resolvedResourceSourcePath
				: ''
		const resAbsPath = String(props.resourceAbsolutePath ?? '').trim()
		const safeResAbsPath = resAbsPath && !isImageUrlOrPath(resAbsPath) ? resAbsPath : ''

		// 若能推导 projectId，把 resourceProjectRelativePath 合成 dweb URL 候选
		const resRelPath = String(props.resourceProjectRelativePath ?? '').trim()
		const pid = inferredProjectId
		const resRelAsDweb =
			resRelPath && pid
				? `dweb://project-assets?projectId=${pid}&path=${encodeURIComponent(resRelPath)}`
				: ''

		const uploadCandidates: string[] = [
			// ===== 0. 绝对最高优先级：上层 NodeComponentResolver 从 resourcesById 解析好注入的真实路径 =====
			resolvedResourceUrl, // 已经是 resolveWorkflowResourceUrl 后的 dweb / http(s) / file URL
			safeResSourcePath,   // 本地绝对路径（例：G:\DVSTestProject\...\xxx.glb）→ 内部会转 file:///
			safeResAbsPath,      // resourceAbsolutePath（兜底本地绝对）
			resRelAsDweb,        // resourceProjectRelativePath 合成（兜底项目相对）
			// ===== 1. 其次才是节点 settings 的资产 URL/路径 =====
			rawModelAssetUrl ? resolveWorkflowResourceUrl(rawModelAssetUrl) : '',
			safeAssetPath2,
			rawModelUrl ? resolveWorkflowResourceUrl(rawModelUrl) : ''
		]

		const uploadUrl = pickBestModelUrlFromCandidates(uploadCandidates)
		if (uploadUrl) {
			// 从文件名/URL 后缀推导 format（与 bindMediaResourceToNode 保持一致）
			const lower = (uploadUrl.split('?')[0]).toLowerCase()
			let uploadFormat: 'glb' | 'gltf' | 'fbx' | 'obj' | 'stl' | 'dae' = 'glb'
			if (lower.endsWith('.gltf')) uploadFormat = 'gltf'
			else if (lower.endsWith('.fbx')) uploadFormat = 'fbx'
			else if (lower.endsWith('.obj')) uploadFormat = 'obj'
			else if (lower.endsWith('.stl')) uploadFormat = 'stl'
			else if (lower.endsWith('.dae')) uploadFormat = 'dae'

			return {
				url: uploadUrl,
				assetPath: safeAssetPath2 || safeResSourcePath || safeResAbsPath || resRelPath || '',
				format: uploadFormat,
				source: 'upload' as const
			}
		}
	}

	return null
})

const effectiveModelUrl = computed(() => {
	const s = settings.value
	const rawAssetUrl = String(s?.modelAssetUrl ?? '').trim()
	const rawPrimaryUrl = String(s?.modelUrl ?? '').trim()
	const outerSourcePath = String(s?.modelSourcePath ?? '').trim()
	const outerAssetPath = String(s?.modelAssetPath ?? '').trim()
	const assetUrl = rawAssetUrl ? resolveWorkflowResourceUrl(rawAssetUrl) : ''
	const primaryUrl = rawPrimaryUrl ? resolveWorkflowResourceUrl(rawPrimaryUrl) : ''

	// ===== 2026-08-05 修复：settings 中的 URL 字段是 REACTIVE 的（通过 extraPropsResolver 从 Store 注入），
	// 而 resolvedFallbackModelSource 中的 props.resourceUrl 等是 NON-REACTIVE 的（来自 NodeComponentResolver
	// 读取引擎端 BlueprintNode.data，Vue 检测不到变化）。
	//
	// 当更换/清空模型时，Store 中的 modelUrl/modelAssetUrl 会立即更新，但 props.resourceUrl 仍持有旧值，
	// 导致 effectiveModelUrl 返回过期的 URL，模型不重新加载。
	//
	// 修复策略：
	// 1. 清空场景：当 settings 中所有 URL 字段都为空且无 meshy/tripo 生成数据时，直接返回空
	// 2. 更换场景：当 settings 中有非空 URL 时，优先使用 REACTIVE 的 settings URL（绕过非响应式 fallback）
	const meshy = s?.meshyModelSettings as Record<string, unknown> | undefined
	const tripo = s?.tripo3dModelSettings as Record<string, unknown> | undefined
	const hasMeshyData = !!(meshy && (meshy.outputAssetUrl || meshy.meshyRelationSummary))
	const hasTripoData = !!(tripo && (tripo.tripo3dImageUrl || tripo.tripo3dRelationSummary))

	// ===== 清空场景：settings 中所有 URL 字段为空，且无 meshy/tripo 生成数据 → 模型已被显式清空 =====
	if (s && !rawPrimaryUrl && !rawAssetUrl && !outerSourcePath && !outerAssetPath && !hasMeshyData && !hasTripoData) {
		console.log('[Model3DNode] effectiveModelUrl: all settings URL fields empty, model cleared → returning empty')
		return ''
	}

	// ===== 更换场景：settings 中有非空 URL → 优先使用 REACTIVE 的 settings URL =====
	// （绕过非响应式的 resolvedFallbackModelSource，避免 props.resourceUrl 持有旧值导致选中过期 URL）
	if (primaryUrl || assetUrl || outerSourcePath || outerAssetPath) {
		const settingsUrl = pickBestModelUrlFromCandidates([primaryUrl, assetUrl, outerSourcePath, outerAssetPath])
		if (settingsUrl) {
			console.log('[Model3DNode] effectiveModelUrl: using reactive settings URL:', settingsUrl.slice(0, 80))
			return settingsUrl
		}
		// settings URL 被过滤掉了（例如不是有效的模型 URL），继续走 fallback
	}

	// ===== 兜底：使用 fallback（适用于 meshy/tripo 生成模型或 settings URL 无效的情况） =====
	const fallback = resolvedFallbackModelSource.value
	const fallbackLocalAbsPath =
		fallback?.assetPath && isLikely3DModelUrl(fallback.assetPath) ? fallback.assetPath : ''

	const url = pickBestModelUrlFromCandidates([
		fallbackLocalAbsPath,
		fallback?.url,
		assetUrl,
		primaryUrl,
		outerSourcePath,
		outerAssetPath
	])
	return url
})

const effectiveModelAssetPath = computed(() => {
	const outer = String(settings.value?.modelAssetPath ?? '').trim()
	// ===== 消费端硬防护：外层 modelAssetPath 是图片后缀的直接忽略，强制走 fallback =====
	const safeOuter = outer && !isImageUrlOrPath(outer) ? outer : ''
	if (safeOuter) return safeOuter
	const fallback = resolvedFallbackModelSource.value
	return fallback?.assetPath ?? ''
})

const effectiveModelFormat = computed(() => {
	const outer = String(settings.value?.modelFormat ?? '')
		.trim()
		.toLowerCase()
	if (outer) return outer
	const fallback = resolvedFallbackModelSource.value
	return fallback?.format ?? ''
})

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
const sourceNameDisplay = computed(() => {
	const outer = String(settings.value?.modelSourceName ?? '').trim()
	if (outer) return outer
	const fallback = resolvedFallbackModelSource.value
	if (fallback?.url) {
		try {
			const withoutQuery = fallback.url.split('?')[0].split('#')[0]
			const lastSlash = withoutQuery.lastIndexOf('/')
			const base = lastSlash >= 0 ? withoutQuery.slice(lastSlash + 1) : withoutQuery
			return decodeURIComponent(base) || t('nodes.model3d.noModelBound')
		} catch {
			return t('nodes.model3d.noModelBound')
		}
	}
	return t('nodes.model3d.noModelBound')
})
const sourceHintDisplay = computed(() => {
	const format = effectiveModelFormat.value.toUpperCase()
	if (settings.value?.lastInputNodeId)
		return (
			t('nodes.model3d.fromUpstreamNode', { nodeId: settings.value.lastInputNodeId }) +
			(format ? ` · ${format}` : '')
		)
	const sourcePath = String(settings.value?.modelSourcePath ?? '').trim()
	// ===== 消费端硬防护：sourcePath/modelSourcePath 是图片后缀（被缩略图污染）的直接丢弃，用 fallback =====
	const safeSourcePath = sourcePath && !isImageUrlOrPath(sourcePath) ? sourcePath : ''
	if (safeSourcePath) return safeSourcePath
	const fallbackPath = effectiveModelAssetPath.value
	if (fallbackPath) return fallbackPath
	return format ? t('nodes.model3d.formatPreview', { format }) : t('nodes.model3d.supportedFormats')
})
const assetStatusDisplay = computed(() => {
	const assetPath = effectiveModelAssetPath.value
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
	const postProcessModes = [
		'texture',
		'refine',
		'mesh_segment',
		'mesh_smartsegment',
		'mesh_complete',
		'mesh_decimate',
		'models_convert'
	]
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
		meshySettings.value?.errorMessage ??
			meshySettings.value?.statusText ??
			t('nodes.model3d.fetchFailed')
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
const showRestartButton = computed(() => {
	if (!effectiveModelUrl.value) return false
	if (previewPhase.value === 'loading') return false
	if (errorMessage.value) return true
	if (!viewer) return previewPhase.value !== 'masked'
	return !viewerHasModel.value
})
const handleForceRestart = () => {
	errorMessage.value = ''
	disposeViewer()
	// 先触发error重置生命周期状态到masked（startPreviewSession在interactive状态会直接return）
	emit('three-preview-error')
	// 再触发start开始新一轮加载（此时phase已为masked，kickoffAutoStart会执行）
	emit('start-three-preview')
	startPreview()
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
	const url = effectiveModelUrl.value
	internalPreviewRequestId.value += 1
	const newRequestId = internalPreviewRequestId.value
	activePreviewRequestId = newRequestId
	silentModelLoading = false
	errorMessage.value = ''
	setPreviewPhase('loading')
	setPreviewProgress(0.12, t('nodes.model3d.progressInitRenderer'))
	void startPreviewLoad(newRequestId)
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
		viewerHasModel.value = false
		cachedModelSignature = ''
		cameraUserControlled = false
		initialSyncDone = false
		return
	}
	const currentSignature = modelSignature.value
	const currentUrlSignature = modelUrlSignature.value
	const prevUrlSignature = cachedModelSignature.split('|')[0]
	const urlChanged = currentUrlSignature !== prevUrlSignature
	const hasNoModel = !viewer.hasModel()
	if (urlChanged || !cachedModelSignature || hasNoModel) {
		cameraUserControlled = false
		initialSyncDone = false
		viewer.clearModel()
		viewerHasModel.value = false
		cachedModelSignature = currentSignature
		// Viewer存在但没有模型（例如DOM重建后），需要重新加载模型
		if (!silentModelLoading) {
			silentModelLoading = true
			void loadModelIntoViewer()
				.then((loaded) => {
					if (!loaded) {
						handlePreviewError()
					}
				})
				.finally(() => {
					silentModelLoading = false
				})
		}
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
		const isInteractivePhase = previewPhase.value === 'interactive'
		viewer.setInteractive(isInteractivePhase)
		syncViewerState()
		if (isInteractivePhase) {
			viewer.setRenderSuspended(previewSuspended.value)
		}
	} catch (err) {
		viewer = null
		viewerInitCooldownUntil = Date.now() + 400
		errorMessage.value =
			(err instanceof Error ? err.message : String(err ?? 'unknown')) ||
			t('nodes.model3d.modelLoadFailed')
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
	silentModelLoading = false
	viewerHasModel.value = false
	if (!viewer) return
	saveViewState()
	captureSnapshot()
	viewer.dispose()
	viewer = null
	cachedModelSignature = ''
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

const isDwebProjectAssetUrl = (url: string): boolean => {
	const lower = String(url ?? '')
		.trim()
		.toLowerCase()
	return lower.startsWith('dweb://project-assets') || lower.startsWith('dweb:project-assets')
}

let progressTimer: number | null = null

const stopProgressSim = () => {
	if (progressTimer) {
		clearInterval(progressTimer)
		progressTimer = null
	}
}

const startProgressSim = (
	startFrom: number,
	endAt: number,
	step: number,
	intervalMs: number,
	labelKey: string,
	requestId?: number
) => {
	stopProgressSim()
	let simulated = startFrom
	progressTimer = window.setInterval(() => {
		if (requestId != null && requestId !== activePreviewRequestId) {
			stopProgressSim()
			return
		}
		simulated = Math.min(simulated + step, endAt)
		emitPreviewProgress(simulated, t(labelKey))
		if (simulated >= endAt) {
			stopProgressSim()
		}
	}, intervalMs)
}

const rAF = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

const loadModelIntoViewer = async (requestId?: number) => {
	const url = effectiveModelUrl.value
	if (!viewer) return false
	if (!url) {
		viewer.clearModel()
		viewerHasModel.value = false
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
			? (MODEL3D_VIEWSTATE_CACHE.get(snapshotCacheKey) ?? null)
			: null
	if (urlChanged) {
		cameraUserControlled = false
		initialSyncDone = false
	}
	applyViewerOptions()
	// 判断是否需要走 Electron 主进程 fetch 代理：
	//   1) dweb://project-assets 协议
	//   2) http(s):// 远程 CDN URL（Meshy/Tripo 等，浏览器端会CORS拦截）
	//   主进程 fetch 无 CORS 限制，拿到 ArrayBuffer 后再让 GLTFLoader 解析
	const needElectronFetchProxy = (() => {
		const u = String(url || '').trim()
		if (!u) return false
		if (isDwebProjectAssetUrl(u)) return true
		const low = u.toLowerCase()
		return low.startsWith('http://') || low.startsWith('https://')
	})()
	try {
		if (needElectronFetchProxy) {
			if (requestId != null) {
				startProgressSim(0.3, 0.55, 0.015, 150, 'nodes.model3d.progressDownloading', requestId)
			}
			const fetchResult = await fetchAsArrayBuffer(url)
			stopProgressSim()
			if (fetchResult?.ok && fetchResult.buffer) {
				if (requestId != null && requestId !== activePreviewRequestId) return false
				if (requestId != null) {
					emitPreviewProgress(0.55, t('nodes.model3d.progressParseModel'))
				}
				await rAF()
				const arrayBuffer = fetchResult.buffer.buffer.slice(
					fetchResult.buffer.byteOffset,
					fetchResult.buffer.byteOffset + fetchResult.buffer.byteLength
				) as ArrayBuffer
				if (requestId != null) {
					emitPreviewProgress(0.6, t('nodes.model3d.progressLoadModel'))
				}
				await viewer.loadModelFromArrayBuffer(arrayBuffer, url, cachedView)
				await rAF()
				if (requestId != null && requestId === activePreviewRequestId) {
					emitPreviewProgress(0.75, t('nodes.model3d.progressPrepareScene'))
				}
				await rAF()
				if (requestId != null && requestId === activePreviewRequestId) {
					emitPreviewProgress(0.88, t('nodes.model3d.progressLoadTextures'))
				}
				await rAF()
				if (requestId != null && requestId === activePreviewRequestId) {
					emitPreviewProgress(0.92, t('nodes.model3d.progressInitInteraction'))
				}
				cachedModelSignature = currentSignature
				initialSyncDone = true
				viewerHasModel.value = true
				return true
			}
			// ===== 主进程代理失败：降级为直接让 Three.js FileLoader 尝试加载（非远程CDN或file://环境可正常工作） =====
			if (fetchResult && !fetchResult.ok && !isRemoteHttpUrl(url)) {
				throw new Error(fetchResult.error || t('nodes.model3d.previewLoadFailed'))
			}
		}

		if (requestId != null) {
			emitPreviewProgress(0.3, t('nodes.model3d.progressLoadResource'))
		}
		await viewer.loadModel(
			url,
			(payload) => {
				if (requestId == null) return
				if (requestId !== activePreviewRequestId) return
				const ratio = Number(payload?.ratio ?? 0)
				emitPreviewProgress(
					0.3 + Math.max(0, Math.min(1, ratio)) * 0.62,
					t('nodes.model3d.progressLoadModel')
				)
			},
			cachedView
		)
		if (requestId != null && requestId === activePreviewRequestId) {
			emitPreviewProgress(0.92, t('nodes.model3d.progressInitInteraction'))
		}
		cachedModelSignature = currentSignature
		initialSyncDone = true
		viewerHasModel.value = true
		return true
	} catch (err: unknown) {
		stopProgressSim()
		errorMessage.value = getErrorMessage(err) || t('nodes.model3d.modelLoadFailed')
		viewer.clearModel()
		viewerHasModel.value = false
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
				if (isDwebProjectAssetUrl(repairResult.newUrl)) {
					if (requestId != null) {
						startProgressSim(0.3, 0.5, 0.015, 150, 'nodes.model3d.progressDownloading', requestId)
					}
					const fetchResult = await fetchAsArrayBuffer(repairResult.newUrl)
					stopProgressSim()
					if (fetchResult?.ok && fetchResult.buffer) {
						if (requestId != null && requestId === activePreviewRequestId) {
							emitPreviewProgress(0.5, t('nodes.model3d.progressParseModel'))
						}
						await rAF()
						const arrayBuffer = fetchResult.buffer.buffer.slice(
							fetchResult.buffer.byteOffset,
							fetchResult.buffer.byteOffset + fetchResult.buffer.byteLength
						) as ArrayBuffer
						if (requestId != null && requestId === activePreviewRequestId) {
							emitPreviewProgress(0.7, t('nodes.model3d.progressLoadTextures'))
						}
						await viewer.loadModelFromArrayBuffer(arrayBuffer, repairResult.newUrl, null)
						await rAF()
						if (requestId != null && requestId === activePreviewRequestId) {
							emitPreviewProgress(0.85, t('nodes.model3d.progressLoadTextures'))
						}
						await rAF()
						if (requestId != null && requestId === activePreviewRequestId) {
							emitPreviewProgress(0.95, t('nodes.model3d.progressInitInteraction'))
						}
						cachedModelSignature = modelSignature.value
						cameraUserControlled = false
						initialSyncDone = true
						viewerHasModel.value = true
						return true
					}
				}
				await viewer.loadModel(
					repairResult.newUrl,
					(payload) => {
						if (requestId == null) return
						if (requestId !== activePreviewRequestId) return
						const ratio = Number(payload?.ratio ?? 0)
						emitPreviewProgress(
							0.3 + Math.max(0, Math.min(1, ratio)) * 0.65,
							t('nodes.model3d.progressLoadTextures')
						)
					},
					null
				)
				if (requestId != null && requestId === activePreviewRequestId) {
					emitPreviewProgress(0.95, t('nodes.model3d.progressInitInteraction'))
				}
				cachedModelSignature = modelSignature.value
				cameraUserControlled = false
				initialSyncDone = true
				viewerHasModel.value = true
				return true
			} catch {
				stopProgressSim()
				errorMessage.value = t('nodes.model3d.modelLoadFailed')
				viewer.clearModel()
				viewerHasModel.value = false
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

const attemptRepairModelUrl = async (
	url: string,
	requestId?: number
): Promise<{ success: boolean; newUrl?: string }> => {
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
		viewer.clearModel()
		cachedModelSignature = ''
		errorMessage.value = ''
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
		if (activePreviewRequestId !== requestId || !viewer) return
		saveViewState()
		captureSnapshot()
		emitPreviewProgress(0.98, t('nodes.model3d.progressSyncInteraction'))
		handlePreviewReady()
		nextTick(() => baseRef.value?.requestAutoResize())
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

const onUploadClick = () => {
	console.log('[Model3DNode] onUploadClick: button clicked, fileInputRef exists:', !!fileInputRef.value)
	fileInputRef.value?.click()
}
const onFileChange = (e: Event) => {
	const input = e.target as HTMLInputElement | null
	const file = input?.files?.[0]
	console.log('[Model3DNode] onFileChange triggered:', {
		hasInput: !!input,
		fileCount: input?.files?.length ?? 0,
		hasFile: !!file,
		fileName: file?.name,
		fileSize: file?.size
	})
	if (!file) return
	console.log('[Model3DNode] Emitting upload-model-file with:', { fileName: file.name, fileSize: file.size })
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
	const modelName =
		String(settings.value?.modelSourceName ?? '').trim() ||
		props.nodeId ||
		t('nodes.model3d.defaultModelName')
	await open3DEditor({
		nodeId: props.nodeId,
		modelUrl: url,
		modelAssetPath: effectiveModelAssetPath.value,
		modelName
	})
}

watch(modelSignature, () => {
	if (!viewer) return
	if (previewPhase.value === 'masked') return
	if (previewPhase.value === 'loading') return
	console.log('[Model3DNode] modelSignature changed, calling syncViewerState:', {
		url: effectiveModelUrl.value ? effectiveModelUrl.value.slice(0, 80) : '(empty)',
		phase: previewPhase.value
	})
	saveViewState()
	// ===== 2026-08-05 修复：更换/清空操作时 effectiveModelUrl 会变化，
	// 但 previewPhase 不变（仍为 'interactive'），原 watcher 只保存视图状态不重新加载模型。
	// 调用 syncViewerState 会自动检测 URL 变化并重新加载模型，或当 URL 为空时清空模型。
	syncViewerState()
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
			silentModelLoading = false
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
	stopProgressSim()
	saveViewState()
	cacheSnapshot(snapshotUrl.value)
	disposeViewer()
})
</script>

<style scoped>
.wf-model3d-body {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 10px;
	flex: 1;
	min-height: 0;
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

.wf-model3d-restart-overlay {
	position: absolute;
	inset: 0;
	z-index: 5;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 12px;
	padding: 16px;
	text-align: center;
	background: linear-gradient(180deg, rgba(7, 12, 20, 0.5), rgba(7, 12, 20, 0.88));
	backdrop-filter: blur(6px);
}

.wf-model3d-restart-title {
	font-size: 13px;
	font-weight: 600;
	color: rgba(241, 245, 249, 0.96);
}

.wf-model3d-restart-text {
	font-size: 12px;
	line-height: 1.5;
	color: rgba(226, 232, 240, 0.72);
}

.wf-model3d-restart-btn {
	border: 1px solid rgba(20, 184, 166, 0.5);
	border-radius: 4px;
	padding: 8px 20px;
	font-size: 12px;
	font-weight: 500;
	color: #ecfeff;
	background: linear-gradient(135deg, rgba(13, 148, 136, 0.9), rgba(14, 116, 144, 0.88));
	cursor: pointer;
	transition:
		background 120ms ease,
		border-color 120ms ease;
}

.wf-model3d-restart-btn:hover {
	border-color: rgba(20, 184, 166, 0.8);
	background: linear-gradient(135deg, rgba(15, 170, 156, 0.95), rgba(16, 138, 170, 0.95));
}

.wf-model3d-restart-btn:active {
	transform: translateY(1px);
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
	background: linear-gradient(180deg, rgb(34 197 94 / 0.18), rgb(34 197 94 / 0.08));
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
	background: linear-gradient(180deg, rgb(34 197 94 / 0.28), rgb(34 197 94 / 0.14));
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
	background: linear-gradient(180deg, rgb(59 130 246 / 0.15), rgb(59 130 246 / 0.06));
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
