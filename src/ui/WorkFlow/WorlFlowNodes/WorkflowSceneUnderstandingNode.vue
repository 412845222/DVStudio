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
						{{
							running
								? t('nodes.sceneUnderstanding.analyzing')
								: t('nodes.sceneUnderstanding.generateJson')
						}}
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
					<div v-if="reasoningText" ref="reasoningEl" class="wf-scene-understand-reasoning">
						<div class="wf-scene-understand-reasoning-title">
							{{ t('nodes.sceneUnderstanding.modelThinking') }}
						</div>
						<pre class="wf-scene-understand-reasoning-content">{{ reasoningText }}</pre>
					</div>
				</div>

				<div class="wf-scene-understand-grid">
					<div class="wf-scene-understand-card">
						<div class="wf-scene-understand-card-title">
							{{ t('nodes.sceneUnderstanding.inputImage') }}
						</div>
						<div class="wf-scene-understand-card-value">
							{{
								linkedImageCount > 0
									? t('nodes.sceneUnderstanding.connectedCount', { count: linkedImageCount })
									: t('nodes.sceneUnderstanding.notConnected')
							}}
						</div>
						<div class="wf-scene-understand-card-copy">{{ linkedImageHint }}</div>
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
					</select>
					<div v-if="detectedSceneTypeLabel" class="wf-scene-understand-card-copy">
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
	(
		e: 'update-scene-understanding-settings',
		payload: Partial<WorkflowSceneUnderstandingNodeSettings>
	): void
	(e: 'request-scene-models'): void
	(e: 'run-scene-understanding'): void
	(e: 'cancel-scene-understanding'): void
}>()

const settings = computed(() => props.sceneUnderstandingSettings ?? null)
const currentMode = computed(() =>
	settings.value?.mode === 'scene-lighting' ? 'scene-lighting' : 'scene-layout'
)
const currentSceneType = computed<'auto' | 'indoor' | 'outdoor'>(() => {
	const st = settings.value?.sceneType
	return st === 'indoor' || st === 'outdoor' ? st : 'auto'
})
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
	if (!linkedImageCount.value || !selectedModel.value) return false
	if (currentMode.value === 'scene-lighting') return !!effectiveLayoutJson.value
	return true
})

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
	const sceneType = value === 'indoor' || value === 'outdoor' ? value : 'auto'
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
		resultSummary: ''
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
})
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
