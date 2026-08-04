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
			<div class="wf-text" @pointerdown.stop>
				<div class="wf-text-label">{{ t('nodes.text.contentLabel') }}</div>
				<textarea
					ref="textareaEl"
					class="wf-textarea"
					:value="textValue"
					:placeholder="t('nodes.text.placeholder')"
					@input="onTextInput"
					@focus="onFocus"
					@blur="onBlur"
				/>
			</div>
		</template>
	</WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import WorkflowNodeBase from '../WorkflowNodeBase.vue'
import { useI18n } from '../../../i18n'
import type { WorkflowNodeChatType } from '../../../aiworkflow/types'

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
	textValue?: string | null
	visualStatus?: 'idle' | 'running' | 'error'
	nodeChatVisible?: boolean
	nodeChatNodeType?: WorkflowNodeChatType | null
	nodeChatDraft?: string
	nodeChatSubmitting?: boolean
	nodeChatParams?: Record<string, any>
	nodeChatSelectedRefs?: any[]
	inputParamPreviewRefs?: any[]
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
	(e: 'update-text-value', payload: { textValue: string }): void
}>()

const textValue = computed(() => String(props.textValue ?? ''))

const inputs = computed(() => (Array.isArray(props.inputs) ? props.inputs : []))
const outputs = computed(() => (Array.isArray(props.outputs) ? props.outputs : []))

const hoverInputAnchorId = computed(() => props.hoverInputAnchorId ?? null)
const hoverOutputAnchorId = computed(() => props.hoverOutputAnchorId ?? null)

const onTextInput = (e: Event) => {
	const v = String((e.target as HTMLTextAreaElement).value ?? '')
	emit('update-text-value', { textValue: v })
}

const textareaEl = ref<HTMLTextAreaElement | null>(null)
const isUserEditing = ref(false)

const onFocus = () => {
	isUserEditing.value = true
}

const onBlur = () => {
	isUserEditing.value = false
}

const scrollToBottom = (el: HTMLElement | null) => {
	if (!el) return
	nextTick(() => {
		el.scrollTop = el.scrollHeight
	})
}

watch(textValue, (newVal, oldVal) => {
	if (isUserEditing.value) return
	if (!newVal) return
	if (newVal.length > (oldVal?.length ?? 0)) {
		scrollToBottom(textareaEl.value)
	}
})
</script>

<style scoped>
.wf-text-label {
	font-size: 12px;
	color: var(--vscode-foreground);
	opacity: 0.9;
	flex-shrink: 0;
}

.wf-textarea {
	padding: 6px 8px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-foreground);
	border-radius: 0;
	outline: none;
	resize: none;
	font-family: inherit;
	font-size: 12px;
	overflow: auto;
}

.wf-textarea:focus {
	border-color: var(--vscode-border-accent);
}
</style>
