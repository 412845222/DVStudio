<template>
	<Transition name="bp-dialog-fade">
		<div
			v-if="visible && nodeId && nodeType"
			class="bp-node-chat-dialog"
			:class="[`bp-node-chat-${nodeType}`, { 'is-submitting': submitting }]"
			:style="dialogPositionStyle"
			data-wf-node-drag-ignore="true"
			@pointerdown.stop
			@mousedown.stop
			@click.stop
			@contextmenu.stop
		>
			<div class="bp-node-chat-surface glass-surface">
				<span class="bp-dialog-bracket bp-dialog-bracket-tl" aria-hidden="true"></span>
				<span class="bp-dialog-bracket bp-dialog-bracket-tr" aria-hidden="true"></span>
				<span class="bp-dialog-bracket bp-dialog-bracket-bl" aria-hidden="true"></span>
				<span class="bp-dialog-bracket bp-dialog-bracket-br" aria-hidden="true"></span>
				<div class="bp-node-chat-header">
					<div class="bp-node-chat-title-wrap">
						<span class="bp-node-chat-icon">{{ typeIcon }}</span>
						<span class="bp-node-chat-title">{{ typeLabel }}</span>
					</div>
					<button
						class="bp-node-chat-close"
						type="button"
						:disabled="submitting"
						@click="handleClose"
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>

				<div class="bp-node-chat-body">
					<div
						v-if="showInputParamRefs && inputParamPreviewRefsResolved.length > 0"
						class="bp-node-chat-input-param-refs"
					>
						<div
							v-for="(item, index) in inputParamPreviewRefsResolved"
							:key="`param-ref-${item.edgeId || `${item.fromNodeId}:${item.fromAnchorId}:${item.kind}` || index}`"
							class="bp-node-chat-param-ref-item"
							:class="`is-${item.kind}`"
							:title="paramRefTitle(item, index)"
						>
							<img
								v-if="item.previewUrl"
								class="bp-node-chat-param-ref-thumb"
								:src="item.previewUrl"
								:alt="item.label || item.name || item.kind"
								loading="lazy"
								decoding="async"
							/>
							<span v-else class="bp-node-chat-param-ref-icon">{{ paramRefIcon(item) }}</span>
							<span class="bp-node-chat-param-ref-main">
								<span class="bp-node-chat-param-ref-label">
									{{ item.label || item.name || fallbackParamLabel(item, index) }}
								</span>
								<span v-if="paramRefSubline(item)" class="bp-node-chat-param-ref-sub">
									{{ paramRefSubline(item) }}
								</span>
							</span>
							<button
								class="bp-node-chat-param-ref-remove"
								type="button"
								title="断开上游参数"
								@click.stop="handleRemoveParamRef(item)"
							>
								×
							</button>
						</div>
					</div>
					<NodeChatInput
						ref="inputRef"
						:modelValue="draft"
						:placeholder="placeholder"
						:disabled="submitting"
						@update:model-value="onDraftUpdate"
						@submit="handleSubmit"
					/>
				</div>

				<div class="bp-node-chat-footer">
					<div class="bp-node-chat-footer-left">
						<button
							class="bp-node-chat-btn bp-node-chat-btn-secondary"
							type="button"
							disabled
							title="提示词库"
						>
							提示词库
						</button>
						<button
							class="bp-node-chat-btn bp-node-chat-btn-secondary"
							type="button"
							disabled
							title="增强提示词"
						>
							增强提示词
						</button>
					</div>
					<div class="bp-node-chat-actions">
						<button
							class="bp-node-chat-btn bp-node-chat-btn-secondary"
							type="button"
							:disabled="submitting"
							@click="toggleParams"
						>
							{{ showParams ? '收起参数' : '参数设置' }}
						</button>
						<button
							class="bp-node-chat-btn bp-node-chat-btn-primary"
							type="button"
							:disabled="submitDisabled"
							@click="handleSubmit"
						>
							<span v-if="submitting" class="bp-node-chat-loading"></span>
							{{ submitting ? '生成中...' : '发送' }}
						</button>
					</div>
				</div>
			</div>

			<NodeChatParamPanel
				v-if="showParams"
				:key="`param-panel-${JSON.stringify(currentParams)}`"
				class="bp-node-chat-param-popover"
				:node-type="nodeType"
				:params="currentParams"
				:disabled="submitting"
				@update:params="onParamsUpdate"
			/>
		</div>
	</Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { WorkflowNodeChatType, WorkflowNodeChatSubmitPayload, WorkflowNodeChatParams, WorkflowNodeChatParamRecord } from '../../../aiworkflow/types'
import {
	NODE_CHAT_TYPE_LABELS,
	NODE_CHAT_TYPE_ICONS,
	NODE_CHAT_PLACEHOLDERS,
	NODE_CHAT_TYPE_DESCRIPTIONS,
	getDefaultParamsForType
} from './nodeChatConfig'
import NodeChatInput from './NodeChatInput.vue'
import NodeChatParamPanel from './NodeChatParamPanel.vue'
import type { InputParamPreviewRef } from './index'

const props = defineProps<{
	visible: boolean
	nodeId: string | null
	nodeType: WorkflowNodeChatType | null
	draft: string
	submitting: boolean
	params: WorkflowNodeChatParams
	nodeWidth?: number
	inputParamPreviewRefs?: InputParamPreviewRef[]
}>()

const emit = defineEmits<{
	(e: 'close'): void
	(e: 'update:draft', value: string): void
	(e: 'update:params', params: WorkflowNodeChatParams): void
	(e: 'submit', payload: WorkflowNodeChatSubmitPayload): void
	(e: 'remove-param-ref', item: InputParamPreviewRef): void
}>()

const inputRef = ref<InstanceType<typeof NodeChatInput> | null>(null)
const showParams = ref(false)

const typeLabel = computed(() => {
	if (!props.nodeType) return ''
	return NODE_CHAT_TYPE_LABELS[props.nodeType]
})

const typeIcon = computed(() => {
	if (!props.nodeType) return ''
	return NODE_CHAT_TYPE_ICONS[props.nodeType]
})

const placeholder = computed(() => {
	if (!props.nodeType) return '输入提示词...'
	return NODE_CHAT_PLACEHOLDERS[props.nodeType]
})

const typeDescription = computed(() => {
	if (!props.nodeType) return ''
	return NODE_CHAT_TYPE_DESCRIPTIONS[props.nodeType]
})

const currentParams = computed<WorkflowNodeChatParamRecord>(() => {
	if (props.nodeType && props.params[props.nodeType]) {
		return props.params[props.nodeType]!
	}
	return {}
})

const showInputParamRefs = computed(() => {
	const type = props.nodeType
	return type === 'image' || type === 'text' || type === 'video' || type === 'model3d'
})

const inputParamPreviewRefsResolved = computed(() => {
	return props.inputParamPreviewRefs ?? []
})

const submitDisabled = computed(() => {
	const hasConnectedParams = inputParamPreviewRefsResolved.value.length > 0
	return props.submitting || (!props.draft.trim() && !hasConnectedParams)
})

const fallbackParamLabel = (item: InputParamPreviewRef, index: number) => {
	if (item.kind === 'text') return `文本 ${index + 1}`
	if (item.kind === 'image') return `图片 ${index + 1}`
	if (item.kind === 'video') return `视频 ${index + 1}`
	return `3D 模型 ${index + 1}`
}

const paramRefIcon = (item: InputParamPreviewRef) => {
	if (item.kind === 'image') return '图'
	if (item.kind === 'video') return '视'
	if (item.kind === 'model3d') return '3D'
	return 'T'
}

const paramRefSubline = (item: InputParamPreviewRef) => {
	if (item.kind === 'text') return item.text || ''
	return item.meta || ''
}

const paramRefTitle = (item: InputParamPreviewRef, index: number) => {
	const header = item.label || item.name || fallbackParamLabel(item, index)
	const subline = item.kind === 'text' ? item.text || '' : item.meta || ''
	return subline ? `${header}\n\n${subline}` : header
}

const handleRemoveParamRef = (item: InputParamPreviewRef) => {
	emit('remove-param-ref', item)
}

const dialogPositionStyle = computed(() => {
	const width = props.nodeWidth || 280
	return {
		width: `${Math.max(width, 320)}px`
	}
})

const handleClose = () => {
	if (props.submitting) return
	emit('close')
}

const onDraftUpdate = (value: string) => {
	emit('update:draft', value)
}

const handleSubmit = () => {
	if (submitDisabled.value || !props.nodeId || !props.nodeType) return
	const payload: WorkflowNodeChatSubmitPayload = {
		nodeId: props.nodeId,
		nodeType: props.nodeType,
		prompt: props.draft.trim(),
		params: currentParams.value
	}
	emit('submit', payload)
}

const onParamsUpdate = (nextParams: WorkflowNodeChatParamRecord) => {
	if (!props.nodeType) return
	const merged: WorkflowNodeChatParams = { ...props.params, [props.nodeType]: nextParams }
	emit('update:params', merged)
}

const toggleParams = () => {
	showParams.value = !showParams.value
}

const onKeydown = (e: KeyboardEvent) => {
	if (e.key === 'Escape' && props.visible) {
		handleClose()
	}
}

watch(
	() => props.visible,
	(visible) => {
		if (visible) {
			showParams.value = false
			nextTick(() => {
				inputRef.value?.focus()
			})
		}
	}
)

watch(
	() => props.nodeType,
	(type) => {
		if (type && !props.params[type]) {
			const defaults = getDefaultParamsForType(type)
			const merged = { ...props.params, [type]: defaults }
			emit('update:params', merged)
		}
	},
	{ immediate: true }
)

watch(
	() => props.visible,
	(visible, previous) => {
		if (visible && !previous) window.addEventListener('keydown', onKeydown)
		if (!visible && previous) window.removeEventListener('keydown', onKeydown)
	},
	{ immediate: true }
)

onBeforeUnmount(() => {
	window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.bp-node-chat-dialog {
	position: absolute;
	left: 50%;
	top: 100%;
	z-index: 1000;
	margin-top: 16px;
	max-width: min(420px, calc(100vw - 40px));
	min-width: 320px;
	transform: translateX(-50%);
	pointer-events: auto;
	animation: bp-dialog-slide-in 0.2s ease-out;
}

.bp-node-chat-surface {
	position: relative;
	border-radius: 0;
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent),
		0 0 22px color-mix(in srgb, var(--wf-primary, #1f9d84) 28%, transparent),
		0 12px 32px rgba(0, 0, 0, 0.42);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 60%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(29, 34, 39, 0.94)) 96%, transparent);
	color: var(--wf-text, #edf2f4);
	width: 100%;
}

.bp-dialog-bracket {
	position: absolute;
	width: 10px;
	height: 10px;
	border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
	pointer-events: none;
	z-index: 2;
}

.bp-dialog-bracket-tl {
	top: -1px;
	left: -1px;
	border-top: 1.5px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
	border-left: 1.5px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
}

.bp-dialog-bracket-tr {
	top: -1px;
	right: -1px;
	border-top: 1.5px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
	border-right: 1.5px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
}

.bp-dialog-bracket-bl {
	bottom: -1px;
	left: -1px;
	border-bottom: 1.5px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
	border-left: 1.5px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
}

.bp-dialog-bracket-br {
	bottom: -1px;
	right: -1px;
	border-bottom: 1.5px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
	border-right: 1.5px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
}

.bp-node-chat-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 14px;
	border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.bp-node-chat-title-wrap {
	display: flex;
	align-items: center;
	gap: 8px;
}

.bp-node-chat-icon {
	font-size: 14px;
}

.bp-node-chat-title {
	font-size: 13px;
	font-weight: 700;
	color: var(--wf-primary, #1f9d84);
	text-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
}

.bp-node-chat-text .bp-node-chat-title {
	color: var(--wf-accent, #f59e0b);
	text-shadow: 0 0 8px color-mix(in srgb, #f59e0b 35%, transparent);
}

.bp-node-chat-image .bp-node-chat-title {
	color: #3b82f6;
	text-shadow: 0 0 8px color-mix(in srgb, #3b82f6 35%, transparent);
}

.bp-node-chat-video .bp-node-chat-title {
	color: var(--wf-primary, #22c55e);
	text-shadow: 0 0 8px color-mix(in srgb, #22c55e 35%, transparent);
}

.bp-node-chat-model3d .bp-node-chat-title {
	color: #a855f7;
	text-shadow: 0 0 8px color-mix(in srgb, #a855f7 35%, transparent);
}

.bp-node-chat-close {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	background: transparent;
	color: var(--wf-text-muted, #aeb8bd);
	border-radius: 2px;
	cursor: pointer;
	transition: all 0.22s ease;
}

.bp-node-chat-close:hover:not(:disabled) {
	border-color: var(--wf-primary, #1f9d84);
	color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 10%, transparent);
}

.bp-node-chat-close:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.bp-node-chat-body {
	padding: 4px 0;
}

.bp-node-chat-input-param-refs {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 0 10px 6px;
}

.bp-node-chat-param-ref-item {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 6px 8px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	border-radius: 2px;
	background: color-mix(in srgb, var(--wf-surface-muted, rgba(36, 42, 48, 0.9)) 72%, transparent);
	transition:
		border-color 0.22s ease,
		box-shadow 0.22s ease,
		background-color 0.22s ease;
}

.bp-node-chat-param-ref-item:hover {
	border-color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 28%, transparent);
}

.bp-node-chat-param-ref-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 2px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 92%, transparent);
	color: var(--wf-text, #edf2f4);
	font-size: 11px;
	font-weight: 600;
	flex-shrink: 0;
}

.bp-node-chat-param-ref-thumb {
	width: 28px;
	height: 28px;
	border-radius: 2px;
	object-fit: cover;
	flex-shrink: 0;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	background: color-mix(in srgb, var(--wf-surface-muted, rgba(36, 42, 48, 0.9)) 92%, transparent);
}

.bp-node-chat-param-ref-main {
	display: flex;
	flex: 1;
	min-width: 0;
	flex-direction: column;
	gap: 2px;
}

.bp-node-chat-param-ref-label {
	font-size: 12px;
	font-weight: 600;
	color: var(--wf-text, #edf2f4);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.bp-node-chat-param-ref-sub {
	flex: 1;
	min-width: 0;
	font-size: 11px;
	color: var(--wf-text-muted, #aeb8bd);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.bp-node-chat-param-ref-remove {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 18px;
	height: 18px;
	border: none;
	background: transparent;
	color: var(--wf-text-muted, #aeb8bd);
	border-radius: 4px;
	cursor: pointer;
	font-size: 14px;
	line-height: 1;
	flex-shrink: 0;
	transition: all 0.15s ease;
}

.bp-node-chat-param-ref-remove:hover {
	background: color-mix(in srgb, var(--wf-danger, #cf5a46) 20%, transparent);
	color: var(--wf-danger, #cf5a46);
}

.bp-node-chat-param-ref-item.is-text .bp-node-chat-param-ref-icon {
	background: color-mix(in srgb, #f59e0b 20%, transparent);
	color: #f59e0b;
}

.bp-node-chat-param-ref-item.is-image .bp-node-chat-param-ref-icon,
.bp-node-chat-param-ref-item.is-image .bp-node-chat-param-ref-label {
	color: #60a5fa;
}

.bp-node-chat-param-ref-item.is-video .bp-node-chat-param-ref-icon,
.bp-node-chat-param-ref-item.is-video .bp-node-chat-param-ref-label {
	color: #4ade80;
}

.bp-node-chat-param-ref-item.is-model3d .bp-node-chat-param-ref-icon,
.bp-node-chat-param-ref-item.is-model3d .bp-node-chat-param-ref-label {
	color: #c084fc;
}

.bp-node-chat-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 14px;
	border-top: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	gap: 10px;
}

.bp-node-chat-footer-left {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.bp-node-chat-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-shrink: 0;
}

.bp-node-chat-param-popover {
	position: absolute;
	left: 50%;
	top: calc(100% + 8px);
	transform: translateX(-50%);
	width: min(360px, calc(100vw - 48px));
	max-height: none;
	overflow: visible;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
	border-radius: 0;
	background: var(--wf-surface-base, rgba(29, 34, 39, 0.94));
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--wf-primary, #1f9d84) 18%, transparent),
		0 0 22px color-mix(in srgb, var(--wf-primary, #1f9d84) 28%, transparent),
		0 18px 40px rgba(0, 0, 0, 0.42);
}

.bp-node-chat-btn {
	padding: 7px 14px;
	font-size: 12px;
	font-weight: 500;
	border-radius: 2px;
	border: none;
	cursor: pointer;
	transition: all 0.22s ease;
	font-family: inherit;
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.bp-node-chat-btn-secondary {
	background: transparent;
	color: var(--wf-text, #edf2f4);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
}

.bp-node-chat-btn-secondary:hover:not(:disabled) {
	border-color: var(--wf-primary, #1f9d84);
	color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 32%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 10%, transparent);
}

.bp-node-chat-btn-primary {
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	color: var(--wf-primary, #1f9d84);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 65%, transparent);
	box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
}

.bp-node-chat-btn-primary:hover:not(:disabled) {
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 42%, transparent);
	box-shadow: 0 0 16px color-mix(in srgb, var(--wf-primary, #1f9d84) 50%, transparent);
	border-color: var(--wf-primary, #1f9d84);
}

.bp-node-chat-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.bp-node-chat-text .bp-node-chat-btn-primary {
	background: color-mix(in srgb, #f59e0b 18%, transparent);
	color: #f59e0b;
	border-color: color-mix(in srgb, #f59e0b 65%, transparent);
	box-shadow: 0 0 10px color-mix(in srgb, #f59e0b 28%, transparent);
}

.bp-node-chat-image .bp-node-chat-btn-primary {
	background: color-mix(in srgb, #3b82f6 18%, transparent);
	color: #60a5fa;
	border-color: color-mix(in srgb, #3b82f6 65%, transparent);
	box-shadow: 0 0 10px color-mix(in srgb, #3b82f6 28%, transparent);
}

.bp-node-chat-video .bp-node-chat-btn-primary {
	background: color-mix(in srgb, #22c55e 18%, transparent);
	color: #4ade80;
	border-color: color-mix(in srgb, #22c55e 65%, transparent);
	box-shadow: 0 0 10px color-mix(in srgb, #22c55e 28%, transparent);
}

.bp-node-chat-model3d .bp-node-chat-btn-primary {
	background: color-mix(in srgb, #a855f7 18%, transparent);
	color: #c084fc;
	border-color: color-mix(in srgb, #a855f7 65%, transparent);
	box-shadow: 0 0 10px color-mix(in srgb, #a855f7 28%, transparent);
}

.bp-node-chat-loading {
	display: inline-block;
	width: 12px;
	height: 12px;
	border: 2px solid color-mix(in srgb, currentColor 30%, transparent);
	border-top-color: currentColor;
	border-radius: 50%;
	animation: bp-spin 0.6s linear infinite;
}

@keyframes bp-spin {
	to {
		transform: rotate(360deg);
	}
}

@keyframes bp-dialog-slide-in {
	from {
		opacity: 0;
		transform: translateX(-50%) translateY(-8px);
	}
	to {
		opacity: 1;
		transform: translateX(-50%) translateY(0);
	}
}

.bp-dialog-fade-enter-active,
.bp-dialog-fade-leave-active {
	transition: opacity 0.2s ease;
}

.bp-dialog-fade-enter-from,
.bp-dialog-fade-leave-to {
	opacity: 0;
}
</style>
