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
			<div class="wf-scene-understand" @pointerdown.stop @click="onAnyClick">
				<div class="wf-scene-understand-hero">
					<div class="wf-scene-understand-status" :class="`is-${status}`">
						{{ statusLabel }}
					</div>
					<button
						class="wf-scene-understand-btn"
						type="button"
						:disabled="running || !canRun"
						@click.stop="emit('run-scene-understanding')"
					>
						{{ runButtonText }}
					</button>
					<button
						v-if="running"
						class="wf-scene-understand-btn ghost danger"
						type="button"
						@click.stop="emit('cancel-scene-understanding')"
					>
						{{ t('nodes.sceneUnderstanding.cancel') }}
					</button>
				</div>

				<div class="wf-scene-understand-progress-shell" v-if="running || progressValue > 0">
					<div class="wf-scene-understand-progress-track">
						<div class="wf-scene-understand-progress-bar" :style="{ width: `${progressValue}%` }" />
					</div>
					<div class="wf-scene-understand-progress-copy">
						<span>{{ statusText }}</span>
						<span>{{ progressValue }}%</span>
					</div>
					<div class="wf-scene-understand-reasoning" v-if="reasoningText" ref="reasoningEl">
						<div class="wf-scene-understand-reasoning-title">
							{{ t('nodes.sceneUnderstanding.modelThinking') }}
						</div>
						<pre class="wf-scene-understand-reasoning-content">{{ reasoningText }}</pre>
					</div>
				</div>

				<!-- 导演工作台：房间识别流水线（户型壳完成后显示） -->
				<div
					v-if="isDirectorMode && directorShellCompleted"
					class="wf-director-pipeline"
					@pointerdown.stop
				>
					<div class="wf-director-pipeline-header">
						<span class="wf-director-pipeline-title">
							{{ t('nodes.sceneUnderstanding.directorPipelineTitle') }}
						</span>
						<span class="wf-director-pipeline-progress">
							{{
								t('nodes.sceneUnderstanding.directorPipelineProgress', {
									done: directorDoneRoomCount,
									total: directorRoomList.length
								})
							}}
						</span>
					</div>
					<div class="wf-director-pipeline-rows">
						<div
							v-for="room in directorRoomList"
							:key="room.roomId"
							class="wf-director-pipeline-row"
							:class="`is-${room.state}`"
						>
							<span class="wf-director-pipeline-icon">
								<template v-if="room.state === 'done'">✅</template>
								<template v-else-if="room.state === 'running'">⏳</template>
								<template v-else-if="room.state === 'error'">⚠️</template>
								<template v-else>⬜</template>
							</span>
							<span class="wf-director-pipeline-label">
								{{ room.label }}
								<span class="wf-director-pipeline-sub">
									{{
										t('nodes.sceneUnderstanding.directorRoomScene', {
											scene: room.sourceSceneIndex
										})
									}}
									<template v-if="room.state === 'done' && room.objectCount != null">
										· {{ room.objectCount }} {{ t('nodes.sceneUnderstanding.directorObjectsUnit') }}
									</template>
								</span>
							</span>
							<button
								class="wf-director-pipeline-btn"
								type="button"
								:disabled="running"
								@click.stop="onRunDirectorRoom(room.roomId)"
							>
								{{
									room.state === 'done'
										? t('nodes.sceneUnderstanding.directorReidentify')
										: room.state === 'running'
											? t('nodes.sceneUnderstanding.directorRunning')
											: t('nodes.sceneUnderstanding.directorIdentify')
								}}
							</button>
						</div>
					</div>
					<div v-if="directorWorkspaceDir" class="wf-scene-understand-persist-path">
						<span class="wf-scene-understand-persist-path-icon">📂</span>
						<span class="wf-scene-understand-persist-path-text" :title="directorWorkspaceDir">
							{{ directorWorkspaceDir }}
						</span>
						<button
							class="wf-scene-understand-persist-path-btn"
							type="button"
							@click.stop="onOpenWorkspace"
						>
							{{ t('nodes.sceneUnderstanding.persistOpenFolder') }}
						</button>
					</div>
				</div>

				<div class="wf-scene-understand-grid">
					<div class="wf-scene-understand-card">
						<div class="wf-scene-understand-card-title">
							{{
								isDirectorMode
									? t('nodes.sceneUnderstanding.directorScenesInput')
									: t('nodes.sceneUnderstanding.inputImage')
							}}
						</div>
						<div class="wf-scene-understand-card-value">
							<template v-if="isDirectorMode">
								{{
									directorScenes.length > 0
										? t('nodes.sceneUnderstanding.directorScenesConnected', {
												scenes: directorScenes.length,
												images: directorImageCount
											})
										: t('nodes.sceneUnderstanding.notConnected')
								}}
							</template>
							<template v-else>
								{{
									linkedImageCount > 0
										? t('nodes.sceneUnderstanding.connectedCount', {
												count: linkedImageCount
											})
										: t('nodes.sceneUnderstanding.notConnected')
								}}
							</template>
						</div>
						<div class="wf-scene-understand-card-copy">
							{{
								isDirectorMode ? t('nodes.sceneUnderstanding.directorScenesHint') : linkedImageHint
							}}
						</div>
					</div>
					<div class="wf-scene-understand-card">
						<div class="wf-scene-understand-card-title">{{ secondaryInputTitle }}</div>
						<div class="wf-scene-understand-card-value">
							{{
								secondaryInputConnected
									? t('nodes.sceneUnderstanding.connected')
									: t('nodes.sceneUnderstanding.notConnected')
							}}
						</div>
						<div class="wf-scene-understand-card-copy">{{ secondaryInputPreview }}</div>
					</div>
					<div v-if="currentMode === 'scene-lighting'" class="wf-scene-understand-card">
						<div class="wf-scene-understand-card-title">
							{{ t('nodes.sceneUnderstanding.supplementHint') }}
						</div>
						<div class="wf-scene-understand-card-value">
							{{
								linkedPromptText
									? t('nodes.sceneUnderstanding.connected')
									: t('nodes.sceneUnderstanding.notConnected')
							}}
						</div>
						<div class="wf-scene-understand-card-copy">{{ linkedPromptPreview }}</div>
					</div>
				</div>

				<div v-if="isDirectorMode" class="wf-scene-understand-director-scenes">
					<div
						v-for="s in directorScenes"
						:key="s.anchorId"
						class="wf-scene-understand-director-scene"
					>
						<span class="wf-scene-understand-director-scene-name">
							{{ t('nodes.sceneUnderstanding.directorSceneN', { n: s.sceneIndex }) }}
						</span>
						<span class="wf-scene-understand-director-scene-count">
							{{ t('nodes.sceneUnderstanding.connectedCount', { count: s.imageCount }) }}
						</span>
					</div>
					<div v-if="!directorScenes.length" class="wf-scene-understand-card-copy">
						{{ t('nodes.sceneUnderstanding.directorScenesEmpty') }}
					</div>
					<div v-else-if="directorScenes.length < 2" class="wf-scene-understand-card-copy">
						{{ t('nodes.sceneUnderstanding.directorScenesNeedTwo') }}
					</div>
				</div>

				<label class="wf-scene-understand-field">
					<span class="wf-scene-understand-label">
						{{ t('nodes.sceneUnderstanding.understandMode') }}
					</span>
					<select
						class="wf-scene-understand-input"
						:value="currentMode"
						:disabled="running"
						@change="onModeChange"
					>
						<option value="scene-layout">
							{{ t('nodes.sceneUnderstanding.modeSceneLayout') }}
						</option>
						<option value="scene-lighting">
							{{ t('nodes.sceneUnderstanding.modeSceneLighting') }}
						</option>
					</select>
				</label>

				<label v-if="currentMode === 'scene-layout'" class="wf-scene-understand-field">
					<span class="wf-scene-understand-label">
						{{ t('nodes.sceneUnderstanding.sceneType') }}
					</span>
					<select
						class="wf-scene-understand-input"
						:value="currentSceneType"
						:disabled="running"
						@change="onSceneTypeChange"
					>
						<option value="auto">{{ t('nodes.sceneUnderstanding.sceneTypeAuto') }}</option>
						<option value="indoor">{{ t('nodes.sceneUnderstanding.sceneTypeIndoor') }}</option>
						<option value="outdoor">{{ t('nodes.sceneUnderstanding.sceneTypeOutdoor') }}</option>
						<option value="director-multi-scene">
							{{ t('nodes.sceneUnderstanding.sceneTypeDirectorWorkbench') }}
						</option>
					</select>
					<div
						v-if="detectedSceneTypeLabel && !isDirectorMode"
						class="wf-scene-understand-card-copy"
					>
						{{ detectedSceneTypeLabel }}
					</div>
				</label>

				<label class="wf-scene-understand-field">
					<span class="wf-scene-understand-label">
						{{ t('nodes.sceneUnderstanding.multimodalModel') }}
					</span>
					<div class="wf-scene-understand-model-row">
						<select
							ref="modelSelectRef"
							class="wf-scene-understand-input"
							:value="selectedModel"
							:disabled="running"
							@focus="onModelSelectFocus"
							@click.stop="onModelSelectFocus"
							@change="onModelChange"
						>
							<option v-if="!availableModels.length" value="" disabled>
								{{
									loadingModels
										? t('nodes.sceneUnderstanding.refreshingModels')
										: t('nodes.sceneUnderstanding.noModelsAvailable')
								}}
							</option>
							<option v-for="item in availableModels" :key="item.id" :value="item.id">
								{{ item.label }}
							</option>
						</select>
						<button
							class="wf-scene-understand-btn ghost"
							type="button"
							:disabled="loadingModels || running"
							@click.stop="requestModelsIfNeeded(true)"
						>
							{{
								loadingModels
									? t('nodes.sceneUnderstanding.refreshingModels')
									: t('nodes.sceneUnderstanding.refreshModels')
							}}
						</button>
					</div>
				</label>

				<div class="wf-scene-understand-output-shell">
					<div class="wf-scene-understand-output-head">
						<div class="wf-scene-understand-label">
							{{ t('nodes.sceneUnderstanding.jsonOutputPreview') }}
						</div>
						<div class="wf-scene-understand-meta">{{ resultMeta }}</div>
					</div>
					<textarea
						ref="outputEl"
						class="wf-scene-understand-output"
						:value="outputJson"
						readonly
						:placeholder="outputPlaceholder"
					/>
					<!-- 硬存盘路径指示器（默认开启，固定显示；导演模式改用工作区栏，这里隐藏） -->
					<div v-if="!isDirectorMode" class="wf-scene-understand-persist-path" @pointerdown.stop>
						<span class="wf-scene-understand-persist-path-icon">💾</span>
						<span class="wf-scene-understand-persist-status">
							{{ t('nodes.sceneUnderstanding.persistEnabled') }}
						</span>
						<span class="wf-scene-understand-persist-path-text" :title="persistFilePath || ''">
							{{ persistFilePath || t('nodes.sceneUnderstanding.persistPathPending') }}
						</span>
						<button
							v-if="persistFilePath"
							class="wf-scene-understand-persist-path-btn"
							type="button"
							@click.stop="onOpenPersistFolder"
						>
							{{ t('nodes.sceneUnderstanding.persistOpenFolder') }}
						</button>
						<button
							v-if="persistFilePath"
							class="wf-scene-understand-persist-path-btn"
							type="button"
							@click.stop="onCopyPersistPath"
						>
							{{ t('nodes.sceneUnderstanding.persistCopyPath') }}
						</button>
						<button
							class="wf-scene-understand-persist-path-btn wf-scene-understand-clear-btn"
							type="button"
							@click.stop="onClearPersistFile"
						>
							{{ t('nodes.sceneUnderstanding.persistClear') }}
						</button>
					</div>
				</div>
			</div>
		</template>

		<template #footer>
			<div class="wf-scene-understand-footer" @pointerdown.stop>
				<div class="wf-scene-understand-footer-title">
					{{ t('nodes.sceneUnderstanding.resultSummary') }}
				</div>
				<div class="wf-scene-understand-footer-copy" v-if="providerText">
					{{ providerText }}
				</div>
				<div class="wf-scene-understand-footer-copy">{{ messageText }}</div>
			</div>
		</template>
	</WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import WorkflowNodeBase from '../WorkflowNodeBase.vue'
import { useI18n } from '../../../i18n'
import { openFolderForPath } from '../../../electronBridge'
import type {
	WorkflowSceneUnderstandModelOption,
	WorkflowSceneUnderstandingNodeSettings
} from '../../../aiworkflow/types'

const { t } = useI18n()

type AnchorSpec = {
	id: string
	label?: string
	offsetY?: number
	mediaType?: 'generic' | 'image' | 'video' | 'text' | 'flow'
}

const props = defineProps<{
	nodeId: string
	title: string
	alias?: string
	nodeType: string
	subtitle?: string
	style?: Record<string, string>
	sceneUnderstandingSettings?: WorkflowSceneUnderstandingNodeSettings | null
	linkedImageUrl?: string | null
	linkedImageUrls?: string[] | null
	linkedPromptText?: string | null
	linkedLayoutJsonText?: string | null
	linkedDirectorScenes?: Array<{
		sceneIndex: number
		anchorId: string
		label?: string
		imageCount: number
	}> | null
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

const onAnyClick = (e: MouseEvent) => {
	console.log('[SceneUnderstanding:Component] ★ ANY CLICK on form area ★', {
		nodeId: props.nodeId,
		target: (e.target as HTMLElement)?.tagName,
		availableModels: availableModels.value.length,
		selectedModel: selectedModel.value
	})
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
	(
		e: 'update-scene-understanding-settings',
		payload: Partial<WorkflowSceneUnderstandingNodeSettings>
	): void
	(e: 'request-scene-models'): void
	(e: 'run-scene-understanding'): void
	(e: 'run-director-room', payload: { roomId: string }): void
	(e: 'cancel-scene-understanding'): void
}>()

const settings = computed(() => props.sceneUnderstandingSettings ?? null)
const currentMode = computed(() =>
	settings.value?.mode === 'scene-lighting' ? 'scene-lighting' : 'scene-layout'
)
const currentSceneType = computed<'auto' | 'indoor' | 'outdoor' | 'director-multi-scene'>(() => {
	const st = settings.value?.sceneType
	return st === 'indoor' || st === 'outdoor' || st === 'director-multi-scene' ? st : 'auto'
})
const isDirectorMode = computed(() => settings.value?.sceneType === 'director-multi-scene')
const directorScenes = computed(() =>
	Array.isArray(props.linkedDirectorScenes) ? props.linkedDirectorScenes : []
)
const directorImageCount = computed(() =>
	directorScenes.value.reduce((sum, s) => sum + (Number(s.imageCount) || 0), 0)
)
const detectedSceneType = computed(() => {
	const st = settings.value?.detectedSceneType
	return st === 'indoor' || st === 'outdoor' || st === 'semi-outdoor' ? st : null
})
const detectedSceneTypeLabel = computed(() => {
	if (!detectedSceneType.value) return ''
	const confidence = settings.value?.sceneTypeConfidence
	const confText =
		typeof confidence === 'number' && confidence > 0 ? ` (${Math.round(confidence * 100)}%)` : ''
	const typeLabel =
		detectedSceneType.value === 'indoor'
			? t('nodes.sceneUnderstanding.detectedIndoor')
			: detectedSceneType.value === 'outdoor'
				? t('nodes.sceneUnderstanding.detectedOutdoor')
				: t('nodes.sceneUnderstanding.detectedSemiOutdoor')
	return `${t('nodes.sceneUnderstanding.detectedAs')}${typeLabel}${confText}`
})
const availableModels = computed(
	() =>
		(Array.isArray(settings.value?.availableModels)
			? settings.value?.availableModels
			: []) as WorkflowSceneUnderstandModelOption[]
)
const selectedModel = computed(() => String(settings.value?.selectedModel ?? ''))
const status = computed(() => String(settings.value?.status ?? 'idle'))
const running = computed(() => status.value === 'running')
const loadingModels = computed(() => status.value === 'loading-models')
const outputJson = computed(() => String(settings.value?.outputJson ?? ''))
const onClearPersistFile = () => {
	emit('update-scene-understanding-settings', {
		_persistClear: true
	})
}
const persistFilePath = computed(() => {
	const path = settings.value?.persistedFilePath
	return typeof path === 'string' && path ? path : ''
})
const onOpenPersistFolder = async () => {
	const path = persistFilePath.value
	if (!path) return
	// 截取目录部分（去掉文件名）
	const dir = path.replace(/[\\/][^\\/]+$/, '')
	try {
		await openFolderForPath(dir)
	} catch (e) {
		console.warn('[SceneUnderstandingNode] openFolderForPath failed', e)
	}
}
const onCopyPersistPath = async () => {
	const path = persistFilePath.value
	if (!path) return
	try {
		await navigator.clipboard.writeText(path)
	} catch (e) {
		console.warn('[SceneUnderstandingNode] copy path failed', e)
	}
}
const messageText = computed(() =>
	String(
		settings.value?.message ??
			settings.value?.resultSummary ??
			t('nodes.sceneUnderstanding.waitingToRun')
	)
)
const statusText = computed(() =>
	String(settings.value?.statusText ?? settings.value?.providerStatusText ?? messageText.value)
)
const reasoningText = computed(() => String(settings.value?.reasoningText ?? ''))
const progressValue = computed(() => {
	const raw = Number(settings.value?.progress ?? 0)
	if (!Number.isFinite(raw)) return 0
	return Math.max(0, Math.min(100, Math.round(raw)))
})
const providerText = computed(() => {
	const providerStatusText = String(settings.value?.providerStatusText ?? '').trim()
	const code = Number(settings.value?.remoteStatusCode)
	const codeText = Number.isFinite(code) && code > 0 ? `HTTP ${Math.round(code)}` : ''
	return [providerStatusText, codeText].filter(Boolean).join(' · ')
})
const linkedImageCount = computed(() => {
	const urls = Array.isArray(props.linkedImageUrls)
		? props.linkedImageUrls.filter((x) => !!String(x ?? '').trim())
		: []
	if (urls.length) return urls.length
	return String(props.linkedImageUrl ?? '').trim() ? 1 : 0
})
const linkedLayoutJson = computed(() => String(props.linkedLayoutJsonText ?? '').trim())
const selfOutputJson = computed(() => String(settings.value?.outputJson ?? '').trim())
const effectiveLayoutJson = computed(() => linkedLayoutJson.value || selfOutputJson.value)
const canRun = computed(() => {
	if (running.value) return false
	if (isDirectorMode.value) return directorScenes.value.length >= 2 && !!selectedModel.value
	if (!linkedImageCount.value || !selectedModel.value) return false
	if (currentMode.value === 'scene-lighting') return !!effectiveLayoutJson.value
	return true
})

// 导演工作台：工作区分步流水线
const directorShellCompleted = computed(() => settings.value?.directorShellCompleted === true)
const directorRoomList = computed(() => {
	const statusMap = settings.value?.directorRoomStatus
	if (!statusMap || typeof statusMap !== 'object') return []
	return Object.values(
		statusMap as Record<
			string,
			{
				roomId: string
				label: string
				sourceSceneIndex: number
				state: string
				objectCount?: number
			}
		>
	)
		.filter((r) => r && r.roomId)
		.sort((a, b) => (a.sourceSceneIndex ?? 0) - (b.sourceSceneIndex ?? 0))
})
const directorDoneRoomCount = computed(
	() => directorRoomList.value.filter((r) => r.state === 'done').length
)
const runButtonText = computed(() => {
	if (running.value) return t('nodes.sceneUnderstanding.analyzing')
	if (isDirectorMode.value && directorShellCompleted.value)
		return t('nodes.sceneUnderstanding.directorRunRemaining')
	return t('nodes.sceneUnderstanding.generateJson')
})
const onRunDirectorRoom = (roomId: string) => {
	emit('run-director-room', { roomId })
}
const directorWorkspaceDir = computed(() => {
	const p = settings.value?.directorWorkspacePath
	return typeof p === 'string' && p ? p : ''
})
const onOpenWorkspace = async () => {
	const dir = directorWorkspaceDir.value
	if (!dir) return
	try {
		await openFolderForPath(dir)
	} catch (e) {
		console.warn('[SceneUnderstandingNode] openFolderForPath failed', e)
	}
}

const linkedPromptPreview = computed(() => {
	const text = String(props.linkedPromptText ?? '').trim()
	if (!text) return t('nodes.sceneUnderstanding.promptNotConnected')
	return text.length > 56 ? `${text.slice(0, 56)}…` : text
})

const linkedLayoutJsonPreview = computed(() => {
	const text = effectiveLayoutJson.value
	if (!text) return t('nodes.sceneUnderstanding.layoutJsonHint')
	return text.length > 56 ? `${text.slice(0, 56)}…` : text
})

const secondaryInputTitle = computed(() =>
	currentMode.value === 'scene-lighting'
		? t('nodes.sceneUnderstanding.layoutJson')
		: t('nodes.sceneUnderstanding.promptInput')
)

const secondaryInputConnected = computed(() =>
	currentMode.value === 'scene-lighting'
		? !!linkedLayoutJson.value
		: !!String(props.linkedPromptText ?? '').trim()
)

const secondaryInputPreview = computed(() =>
	currentMode.value === 'scene-lighting' ? linkedLayoutJsonPreview.value : linkedPromptPreview.value
)

const linkedImageHint = computed(() => {
	const urls = Array.isArray(props.linkedImageUrls)
		? props.linkedImageUrls.filter((x) => !!String(x ?? '').trim())
		: []
	const url = String(urls[0] ?? props.linkedImageUrl ?? '').trim()
	if (!url) return t('nodes.sceneUnderstanding.imageHintConnect')
	if (urls.length > 1)
		return t('nodes.sceneUnderstanding.imageHintMultiCount', { count: urls.length })
	if (url.startsWith('data:')) return t('nodes.sceneUnderstanding.imageHintEmbedded')
	return url.length > 44 ? `${url.slice(0, 44)}…` : url
})

const statusLabel = computed(() => {
	if (status.value === 'loading-models') return t('nodes.sceneUnderstanding.statusLoadingModels')
	if (status.value === 'running') return t('nodes.sceneUnderstanding.statusAnalyzing')
	if (status.value === 'canceled') return t('nodes.sceneUnderstanding.statusCanceled')
	if (status.value === 'completed')
		return settings.value?.mock
			? t('nodes.sceneUnderstanding.statusCompletedMock')
			: t('nodes.sceneUnderstanding.statusCompleted')
	if (status.value === 'error') return t('nodes.sceneUnderstanding.statusError')
	return t('nodes.sceneUnderstanding.statusIdle')
})

const outputPlaceholder = computed(() =>
	currentMode.value === 'scene-lighting'
		? t('nodes.sceneUnderstanding.outputPlaceholderLighting')
		: t('nodes.sceneUnderstanding.outputPlaceholderLayout')
)

const resultMeta = computed(() => {
	const raw = outputJson.value.trim()
	if (!raw) return t('nodes.sceneUnderstanding.noOutput')
	return `${raw.length} chars`
})

const onModelChange = (e: Event) => {
	const value = String((e.target as HTMLSelectElement).value ?? '').trim()
	console.log('[SceneUnderstanding:Component] onModelChange', {
		nodeId: props.nodeId,
		selectedModel: value
	})
	emit('update-scene-understanding-settings', { selectedModel: value })
}

const onModeChange = (e: Event) => {
	const value = String((e.target as HTMLSelectElement).value ?? '').trim()
	const newMode = value === 'scene-lighting' ? 'scene-lighting' : 'scene-layout'
	console.log('[SceneUnderstanding:Component] onModeChange', { nodeId: props.nodeId, newMode })
	emit('update-scene-understanding-settings', {
		mode: newMode,
		outputJson: '',
		rawOutput: '',
		resultSummary: '',
		detectedSceneType: undefined,
		sceneTypeConfidence: undefined,
		message:
			value === 'scene-lighting'
				? t('nodes.sceneUnderstanding.modeLightingMessage')
				: t('nodes.sceneUnderstanding.modeLayoutMessage')
	})
}

const onSceneTypeChange = (e: Event) => {
	const value = String((e.target as HTMLSelectElement).value ?? '').trim()
	const sceneType =
		value === 'indoor' || value === 'outdoor' || value === 'director-multi-scene'
			? (value as 'indoor' | 'outdoor' | 'director-multi-scene')
			: 'auto'
	console.log('[SceneUnderstanding:Component] onSceneTypeChange', {
		nodeId: props.nodeId,
		sceneType
	})
	emit('update-scene-understanding-settings', {
		sceneType,
		detectedSceneType: undefined,
		sceneTypeConfidence: undefined,
		outputJson: '',
		rawOutput: '',
		resultSummary: '',
		directorRooms: undefined,
		directorConnections: undefined,
		message:
			sceneType === 'director-multi-scene'
				? t('nodes.sceneUnderstanding.modeDirectorMessage')
				: t('nodes.sceneUnderstanding.modeLayoutMessage')
	})
}

const reasoningEl = ref<HTMLDivElement | null>(null)
const outputEl = ref<HTMLTextAreaElement | null>(null)
const modelSelectRef = ref<HTMLSelectElement | null>(null)
const hasRequestedModels = ref(false)

const requestModelsIfNeeded = (force = false) => {
	if (running.value) return
	if (!force && (loadingModels.value || hasRequestedModels.value)) return
	if (!force && availableModels.value.length > 0) return
	console.log('[SceneUnderstanding:Component] requestModelsIfNeeded', {
		nodeId: props.nodeId,
		force,
		hasRequested: hasRequestedModels.value,
		availableCount: availableModels.value.length,
		loading: loadingModels.value
	})
	hasRequestedModels.value = true
	emit('request-scene-models')
}

const onModelSelectFocus = () => {
	console.log('[SceneUnderstanding:Component] model select focused/clicked', {
		nodeId: props.nodeId,
		availableCount: availableModels.value.length,
		loading: loadingModels.value
	})
	requestModelsIfNeeded(false)
}

const scrollToBottom = (el: HTMLElement | null) => {
	if (!el) return
	nextTick(() => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				el.scrollTop = el.scrollHeight
			})
		})
	})
}

watch(reasoningText, () => {
	if (running.value) scrollToBottom(reasoningEl.value)
})

watch(outputJson, () => {
	if (running.value) scrollToBottom(outputEl.value)
})

watch(running, (isRunning) => {
	if (isRunning) {
		scrollToBottom(reasoningEl.value)
		scrollToBottom(outputEl.value)
	}
})

watch(currentMode, () => {
	// 模式切换时，重置模型请求状态，允许重新加载对应模式的模型
	hasRequestedModels.value = false
	console.log('[SceneUnderstanding:Component] mode changed, reset hasRequestedModels', {
		nodeId: props.nodeId,
		newMode: currentMode.value
	})
})

onMounted(() => {
	console.log('[SceneUnderstanding:Component] mounted', {
		nodeId: props.nodeId,
		availableModelsCount: availableModels.value.length,
		currentMode: currentMode.value,
		selectedModel: selectedModel.value,
		currentSceneType: currentSceneType.value
	})
	requestModelsIfNeeded(false)
	requestResize()
})

watch(
	() => [
		status.value,
		outputJson.value,
		props.linkedImageUrl,
		props.linkedImageUrls?.length,
		props.linkedPromptText,
		props.linkedLayoutJsonText,
		settings.value?.status,
		settings.value?.outputJson,
		settings.value?.message,
		settings.value?.resultSummary,
		settings.value?.mode,
		settings.value?.sceneType,
		settings.value?.selectedModel
	],
	() => {
		requestResize()
	},
	{ flush: 'post' }
)
</script>

<style scoped>
.wf-scene-understand {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.wf-scene-understand-hero,
.wf-scene-understand-model-row,
.wf-scene-understand-output-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.wf-scene-understand-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 8px;
}

.wf-scene-understand-director-scenes {
	display: flex;
	flex-direction: column;
	gap: 6px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	padding: 8px 10px;
}

.wf-scene-understand-director-scene {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 12px;
	padding: 3px 0;
	border-bottom: 1px dashed rgba(148, 163, 184, 0.2);
}

.wf-scene-understand-director-scene:last-child {
	border-bottom: none;
}

.wf-scene-understand-director-scene-name {
	font-weight: 600;
	color: #cfe0ff;
}

.wf-scene-understand-director-scene-count {
	opacity: 0.78;
}

.wf-scene-understand-progress-shell {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.wf-scene-understand-progress-track {
	height: 8px;
	border-radius: 0;
	overflow: hidden;
	background: rgba(148, 163, 184, 0.18);
	border: 1px solid rgba(148, 163, 184, 0.16);
}

.wf-scene-understand-progress-bar {
	height: 100%;
	border-radius: inherit;
	background: linear-gradient(90deg, rgba(37, 99, 235, 0.92), rgba(14, 165, 233, 0.92));
	transition: width 240ms ease;
}

.wf-scene-understand-progress-copy {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 12px;
	opacity: 0.78;
}

.wf-scene-understand-card,
.wf-scene-understand-footer,
.wf-scene-understand-output-shell {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	border-radius: 0;
	padding: 10px;
}

.wf-scene-understand-status {
	padding: 4px 10px;
	border-radius: 0;
	font-size: 12px;
	background: rgba(96, 165, 250, 0.18);
	color: #cfe0ff;
}

.wf-scene-understand-status.is-error {
	background: rgba(239, 68, 68, 0.2);
	color: #fecaca;
}

.wf-scene-understand-status.is-completed {
	background: rgba(16, 185, 129, 0.18);
	color: #bbf7d0;
}

.wf-scene-understand-label,
.wf-scene-understand-card-title,
.wf-scene-understand-footer-title {
	font-size: 12px;
	opacity: 0.88;
}

.wf-scene-understand-card-value {
	font-size: 14px;
	font-weight: 600;
	margin-top: 2px;
}

.wf-scene-understand-card-copy,
.wf-scene-understand-footer-copy,
.wf-scene-understand-meta {
	font-size: 12px;
	opacity: 0.75;
	line-height: 1.45;
}

.wf-scene-understand-head-actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.wf-scene-understand-persist-toggle {
	font-size: 11px;
	padding: 2px 8px;
	border-radius: 10px;
	border: 1px solid var(--vscode-border);
	background: transparent;
	color: var(--vscode-foreground);
	opacity: 0.7;
	cursor: pointer;
	transition: all 0.15s ease;
	white-space: nowrap;
}

.wf-scene-understand-persist-toggle:hover {
	opacity: 1;
}

.wf-scene-understand-persist-toggle.active {
	background: rgba(115, 186, 38, 0.2);
	border-color: #73ba26;
	color: #73ba26;
	opacity: 1;
}

.wf-director-pipeline {
	margin-top: 8px;
	padding: 8px;
	background: rgba(96, 165, 250, 0.06);
	border: 1px solid rgba(96, 165, 250, 0.28);
	border-radius: 6px;
}
.wf-director-pipeline-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 6px;
	font-size: 12px;
}
.wf-director-pipeline-title {
	font-weight: 600;
	color: #9ec3ff;
}
.wf-director-pipeline-progress {
	color: rgba(255, 255, 255, 0.55);
	font-size: 11px;
}
.wf-director-pipeline-rows {
	display: flex;
	flex-direction: column;
	gap: 4px;
}
.wf-director-pipeline-row {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 4px 6px;
	background: rgba(255, 255, 255, 0.03);
	border-radius: 4px;
}
.wf-director-pipeline-row.is-done {
	background: rgba(115, 186, 38, 0.08);
}
.wf-director-pipeline-row.is-running {
	background: rgba(240, 180, 60, 0.1);
}
.wf-director-pipeline-icon {
	flex-shrink: 0;
	width: 18px;
	text-align: center;
}
.wf-director-pipeline-label {
	flex: 1;
	min-width: 0;
	font-size: 12px;
	color: rgba(255, 255, 255, 0.85);
}
.wf-director-pipeline-sub {
	margin-left: 6px;
	color: rgba(255, 255, 255, 0.45);
	font-size: 11px;
}
.wf-director-pipeline-btn {
	flex-shrink: 0;
	padding: 3px 8px;
	font-size: 11px;
	border-radius: 4px;
	border: 1px solid rgba(96, 165, 250, 0.4);
	background: rgba(96, 165, 250, 0.12);
	color: #9ec3ff;
	cursor: pointer;
	white-space: nowrap;
}
.wf-director-pipeline-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.wf-scene-understand-persist-path {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-top: 6px;
	padding: 6px 8px;
	background: rgba(115, 186, 38, 0.08);
	border: 1px solid rgba(115, 186, 38, 0.3);
	border-radius: 6px;
	font-size: 11px;
}

.wf-scene-understand-persist-path-icon {
	flex-shrink: 0;
}

.wf-scene-understand-persist-path-text {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	opacity: 0.85;
	font-family: Consolas, Monaco, monospace;
}

.wf-scene-understand-persist-path-btn {
	flex-shrink: 0;
	font-size: 10px;
	padding: 2px 6px;
	border-radius: 4px;
	border: 1px solid var(--vscode-border);
	background: var(--vscode-button-background, transparent);
	color: var(--vscode-button-foreground, var(--vscode-foreground));
	cursor: pointer;
	white-space: nowrap;
}

.wf-scene-understand-persist-path-btn:hover {
	opacity: 0.85;
}

.wf-scene-understand-persist-status {
	flex-shrink: 0;
	color: #73ba26;
	font-weight: 600;
}

.wf-scene-understand-clear-btn {
	border-color: rgba(204, 102, 51, 0.5);
	color: #cc6600;
}

.wf-scene-understand-clear-btn:hover {
	background: rgba(204, 102, 51, 0.15);
}

.wf-scene-understand-field {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.wf-scene-understand-input,
.wf-scene-understand-output {
	width: 100%;
	box-sizing: border-box;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-foreground);
	border-radius: 8px;
	padding: 8px 10px;
	font-size: 12px;
}

.wf-scene-understand-output {
	min-height: 132px;
	resize: none;
	font-family: Consolas, Monaco, monospace;
}

.wf-scene-understand-btn {
	border: 1px solid var(--vscode-border);
	background: linear-gradient(135deg, rgba(37, 99, 235, 0.88), rgba(14, 165, 233, 0.82));
	color: #fff;
	border-radius: 8px;
	padding: 6px 12px;
	font-size: 12px;
	cursor: pointer;
}

.wf-scene-understand-btn.danger {
	border-color: rgba(239, 68, 68, 0.4);
	color: #fecaca;
}

.wf-scene-understand-btn.ghost {
	background: rgba(255, 255, 255, 0.06);
}

.wf-scene-understand-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.wf-scene-understand-reasoning {
	margin-top: 8px;
	padding: 8px;
	border: 1px solid rgba(148, 163, 184, 0.2);
	background: rgba(30, 41, 59, 0.5);
	border-radius: 6px;
	max-height: 160px;
	overflow-y: auto;
}

.wf-scene-understand-reasoning-title {
	font-size: 11px;
	font-weight: 600;
	opacity: 0.7;
	margin-bottom: 4px;
	color: #93c5fd;
}

.wf-scene-understand-reasoning-content {
	margin: 0;
	font-size: 11px;
	line-height: 1.5;
	white-space: pre-wrap;
	word-break: break-word;
	opacity: 0.75;
	font-family: Consolas, Monaco, monospace;
	color: #cbd5e1;
}
</style>
