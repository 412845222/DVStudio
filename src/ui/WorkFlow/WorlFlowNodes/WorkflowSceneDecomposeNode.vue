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
			<div class="wf-scene-decompose" @pointerdown.stop>
				<div class="wf-scene-decompose-hero">
					<div class="wf-scene-decompose-status" :class="`is-${status}`">
						{{ statusLabel }}
					</div>
					<button
						class="wf-scene-decompose-btn"
						type="button"
						:disabled="running || !canRun"
						@click.stop="emit('run-scene-decompose')"
					>
						{{ running ? t('nodes.sceneDecompose.processing') : t('nodes.sceneDecompose.runDecompose') }}
					</button>
				</div>

				<div class="wf-scene-decompose-grid">
					<div class="wf-scene-decompose-card">
						<div class="wf-scene-decompose-card-title">{{ t('nodes.sceneDecompose.inputImage') }}</div>
						<div class="wf-scene-decompose-card-value">
							{{ linkedImageCount > 0 ? t('nodes.sceneDecompose.connected') : t('nodes.sceneDecompose.notConnected') }}
						</div>
						<div class="wf-scene-decompose-card-copy">{{ linkedImageHint }}</div>
					</div>
					<div class="wf-scene-decompose-card">
						<div class="wf-scene-decompose-card-title">{{ t('nodes.sceneDecompose.inputLayoutJson') }}</div>
						<div class="wf-scene-decompose-card-value">
							{{ hasJsonInput ? t('nodes.sceneDecompose.connected') : t('nodes.sceneDecompose.notConnected') }}
						</div>
						<div class="wf-scene-decompose-card-copy">{{ jsonHint }}</div>
					</div>
					<div class="wf-scene-decompose-card accent">
						<div class="wf-scene-decompose-card-title">{{ t('nodes.sceneDecompose.outputItems') }}</div>
						<div class="wf-scene-decompose-card-value">{{ t('nodes.sceneDecompose.itemCount', { count: outputCount }) }}</div>
						<div class="wf-scene-decompose-card-copy">
							{{ t('nodes.sceneDecompose.cropCount', { cropped: croppedCount, fallback: fallbackCount }) }}
						</div>
					</div>
				</div>

				<div class="wf-scene-decompose-progress-shell">
					<div class="wf-scene-decompose-output-head">
						<div class="wf-scene-decompose-label">{{ t('nodes.sceneDecompose.autoCropProgress') }}</div>
						<div class="wf-scene-decompose-meta">{{ progressText }}</div>
					</div>
					<div class="wf-scene-decompose-progress-bar">
						<div class="wf-scene-decompose-progress-fill" :style="{ width: `${progressValue}%` }" />
					</div>
					<div class="wf-scene-decompose-progress-step">{{ currentStepText }}</div>
				</div>

				<div class="wf-scene-decompose-output-shell">
					<div class="wf-scene-decompose-output-head">
						<div class="wf-scene-decompose-label">{{ t('nodes.sceneDecompose.outputPreview') }}</div>
						<div class="wf-scene-decompose-meta">{{ outputMeta }}</div>
					</div>
					<div
						v-if="previewItems.length"
						ref="previewListRef"
						class="wf-scene-decompose-preview-list"
						@wheel.capture="onPreviewListWheel"
					>
						<div
							v-for="item in previewItems"
							:key="item.id"
							class="wf-scene-decompose-preview-item"
						>
							<div class="wf-scene-decompose-preview-top">
								<span class="wf-scene-decompose-preview-name">{{ item.name || t('nodes.sceneDecompose.defaultObject') }}</span>
								<span class="wf-scene-decompose-preview-tag">
									{{ t('nodes.sceneDecompose.imageNum', { index: item.sourceImageIndex }) }} ·
									{{ item.cropMode === 'fallback' ? t('nodes.sceneDecompose.fullImage') : t('nodes.sceneDecompose.crop') }}
								</span>
							</div>
							<div class="wf-scene-decompose-preview-copy">
								{{ item.description || t('nodes.sceneDecompose.noDescription') }}
							</div>
						</div>
					</div>
					<div v-else class="wf-scene-decompose-empty">
						{{ t('nodes.sceneDecompose.noItems') }}
					</div>
				</div>
			</div>
		</template>

		<template #footer>
			<div class="wf-scene-decompose-footer" @pointerdown.stop>
				<div class="wf-scene-decompose-footer-title">{{ t('nodes.sceneDecompose.runSummary') }}</div>
				<div class="wf-scene-decompose-footer-copy">{{ messageText }}</div>
			</div>
		</template>
	</WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import WorkflowNodeBase from '../WorkflowNodeBase.vue'
import { useI18n } from '../../../i18n'
import type {
	WorkflowSceneDecomposeNodeSettings,
	WorkflowSceneDecomposeOutput
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
	sceneDecomposeSettings?: WorkflowSceneDecomposeNodeSettings | null
	linkedImageUrls?: string[] | null
	linkedJsonText?: string | null
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
	(e: 'run-scene-decompose'): void
}>()

const settings = computed(() => props.sceneDecomposeSettings ?? null)
const previewListRef = ref<HTMLDivElement | null>(null)
const status = computed(() => String(settings.value?.status ?? 'idle'))
const running = computed(() => status.value === 'running')
const sceneOutputs = computed(
	() =>
		(Array.isArray(settings.value?.outputs)
			? settings.value?.outputs
			: []) as WorkflowSceneDecomposeOutput[]
)
const outputCount = computed(() => sceneOutputs.value.length)
const previewItems = computed(() => sceneOutputs.value)
const linkedImageCount = computed(() =>
	Array.isArray(props.linkedImageUrls)
		? props.linkedImageUrls.filter((item) => !!String(item ?? '').trim()).length
		: 0
)
const hasJsonInput = computed(() => !!String(props.linkedJsonText ?? '').trim())
const canRun = computed(() => linkedImageCount.value > 0 && hasJsonInput.value)
const linkedImageHint = computed(() => {
	if (!linkedImageCount.value) return t('nodes.sceneDecompose.errorNeedImages')
	return linkedImageCount.value >= 4
		? t('nodes.sceneDecompose.hintByJson')
		: t('nodes.sceneDecompose.hintFewImages')
})
const jsonHint = computed(() => {
	if (!hasJsonInput.value) return t('nodes.sceneDecompose.errorNeedJson')
	return t('nodes.sceneDecompose.hintJsonFields')
})
const statusLabel = computed(() => {
	if (status.value === 'running') return t('nodes.sceneDecompose.statusRunning')
	if (status.value === 'completed') return t('nodes.sceneDecompose.statusCompleted')
	if (status.value === 'error') return t('nodes.sceneDecompose.statusError')
	return t('nodes.sceneDecompose.statusIdle')
})
const outputMeta = computed(() => {
	if (!outputCount.value) return t('nodes.sceneDecompose.noOutputYet')
	return t('nodes.sceneDecompose.outputGenerated', { count: outputCount.value })
})
const messageText = computed(() => String(settings.value?.message ?? t('nodes.sceneDecompose.waiting')))
const progressValue = computed(() =>
	Math.max(0, Math.min(100, Number(settings.value?.progress ?? 0)))
)
const currentStepText = computed(() =>
	String(settings.value?.currentStep ?? t('nodes.sceneDecompose.waitingAutoCrop'))
)
const totalTasks = computed(() => Math.max(0, Number(settings.value?.totalTasks ?? 0)))
const completedTasks = computed(() => Math.max(0, Number(settings.value?.completedTasks ?? 0)))
const croppedCount = computed(() =>
	Math.max(
		0,
		Number(
			settings.value?.croppedCount ??
				sceneOutputs.value.filter((item) => item.cropMode !== 'fallback').length
		)
	)
)
const fallbackCount = computed(() =>
	Math.max(
		0,
		Number(
			settings.value?.fallbackCount ??
				sceneOutputs.value.filter((item) => item.cropMode === 'fallback').length
		)
	)
)
const progressText = computed(() => {
	if (!totalTasks.value) return `${Math.round(progressValue.value)}%`
	return `${completedTasks.value} / ${totalTasks.value} · ${Math.round(progressValue.value)}%`
})

const onPreviewListWheel = (event: WheelEvent) => {
	const el = previewListRef.value
	if (!el) return
	if (el.scrollHeight <= el.clientHeight + 1) {
		event.preventDefault()
		event.stopPropagation()
		return
	}
	el.scrollTop += event.deltaY
	if (event.deltaX) el.scrollLeft += event.deltaX
	event.preventDefault()
	event.stopPropagation()
}
</script>

<style scoped>
.wf-scene-decompose {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.wf-scene-decompose-hero,
.wf-scene-decompose-output-head,
.wf-scene-decompose-preview-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.wf-scene-decompose-status,
.wf-scene-decompose-preview-tag {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-height: 26px;
	padding: 0 10px;
	border-radius: 999px;
	font-size: 12px;
	border: 1px solid rgba(255, 255, 255, 0.12);
	background: rgba(255, 255, 255, 0.06);
}

.wf-scene-decompose-status.is-completed {
	color: #9af6c3;
	border-color: rgba(74, 222, 128, 0.3);
	background: rgba(22, 101, 52, 0.22);
}

.wf-scene-decompose-status.is-error {
	color: #ffb4b4;
	border-color: rgba(239, 68, 68, 0.32);
	background: rgba(127, 29, 29, 0.24);
}

.wf-scene-decompose-status.is-running {
	color: #ffe39f;
	border-color: rgba(250, 204, 21, 0.28);
	background: rgba(133, 77, 14, 0.24);
}

.wf-scene-decompose-btn {
	border: 1px solid var(--vscode-border);
	background: linear-gradient(180deg, rgba(255, 185, 56, 0.24), rgba(255, 126, 48, 0.18));
	color: var(--vscode-foreground);
	border-radius: 8px;
	padding: 6px 12px;
	cursor: pointer;
}

.wf-scene-decompose-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.wf-scene-decompose-grid {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 10px;
}

.wf-scene-decompose-card,
.wf-scene-decompose-progress-shell,
.wf-scene-decompose-output-shell,
.wf-scene-decompose-preview-item,
.wf-scene-decompose-footer {
	border: 1px solid var(--vscode-border);
	border-radius: 0;
	background: var(--dweb-defualt);
}

.wf-scene-decompose-card {
	padding: 10px;
	min-height: 88px;
}

.wf-scene-decompose-card.accent {
	background: rgba(255, 165, 0, 0.14);
}

.wf-scene-decompose-card-title,
.wf-scene-decompose-label,
.wf-scene-decompose-footer-title {
	font-size: 12px;
	opacity: 0.72;
}

.wf-scene-decompose-card-value {
	margin-top: 6px;
	font-size: 20px;
	font-weight: 600;
}

.wf-scene-decompose-card-copy,
.wf-scene-decompose-meta,
.wf-scene-decompose-preview-copy,
.wf-scene-decompose-empty,
.wf-scene-decompose-footer-copy {
	margin-top: 6px;
	font-size: 12px;
	line-height: 1.45;
	opacity: 0.78;
	white-space: pre-wrap;
}

.wf-scene-decompose-output-shell,
.wf-scene-decompose-progress-shell,
.wf-scene-decompose-footer {
	padding: 12px;
}

.wf-scene-decompose-output-shell {
	display: flex;
	flex-direction: column;
	min-height: 0;
}

.wf-scene-decompose-progress-bar {
	position: relative;
	width: 100%;
	height: 10px;
	margin-top: 10px;
	border-radius: 999px;
	overflow: hidden;
	background: rgba(255, 255, 255, 0.08);
}

.wf-scene-decompose-progress-fill {
	position: absolute;
	inset: 0 auto 0 0;
	border-radius: inherit;
	background: linear-gradient(90deg, rgba(255, 193, 7, 0.9), rgba(255, 126, 48, 0.95));
}

.wf-scene-decompose-progress-step {
	margin-top: 8px;
	font-size: 12px;
	line-height: 1.45;
	color: rgba(255, 255, 255, 0.8);
	white-space: pre-wrap;
}

.wf-scene-decompose-preview-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-top: 10px;
	max-height: 320px;
	min-height: 0;
	overflow-y: auto;
	overscroll-behavior: contain;
	padding-right: 4px;
}

.wf-scene-decompose-preview-list::-webkit-scrollbar {
	width: 8px;
}

.wf-scene-decompose-preview-list::-webkit-scrollbar-thumb {
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.18);
}

.wf-scene-decompose-preview-list::-webkit-scrollbar-track {
	background: transparent;
}

.wf-scene-decompose-preview-item {
	padding: 10px;
}

.wf-scene-decompose-preview-name {
	font-size: 13px;
	font-weight: 600;
}

@media (max-width: 900px) {
	.wf-scene-decompose-grid {
		grid-template-columns: 1fr;
	}
}
</style>
