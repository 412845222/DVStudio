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
			<div class="wf-text" @pointerdown.stop>
				<div class="wf-text-label">{{ t('nodes.text.contentLabel') }}</div>
				<textarea
					ref="textareaEl"
					class="wf-textarea"
					:value="textValue"
					:placeholder="t('nodes.text.placeholder')"
					@input="onTextInput"
				/>
			</div>
		</template>
	</WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import WorkflowNodeBase from '../WorkflowNodeBase.vue'
import { useI18n } from '../../../i18n'
import type { WorkflowNodeChatSubmitPayload, WorkflowNodeChatType } from '../../../aiworkflow/types'

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
	(e: 'update-text-value', payload: { textValue: string }): void
	(e: 'node-chat-update-draft', value: string): void
	(e: 'node-chat-update-params', value: Record<string, any>): void
	(e: 'node-chat-update-selected-refs', value: any[]): void
	(e: 'node-chat-close'): void
	(e: 'node-chat-submit', payload: WorkflowNodeChatSubmitPayload): void
	(e: 'node-chat-stop'): void
	(e: 'node-chat-remove-param-ref', item: any): void
}>()

const textValue = computed(() => String(props.textValue ?? ''))

const inputs = computed(() => (Array.isArray(props.inputs) ? props.inputs : []))
const outputs = computed(() => (Array.isArray(props.outputs) ? props.outputs : []))

const hoverInputAnchorId = computed(() => props.hoverInputAnchorId ?? null)
const hoverOutputAnchorId = computed(() => props.hoverOutputAnchorId ?? null)

const textareaEl = ref<HTMLTextAreaElement | null>(null)

const onTextInput = (e: Event) => {
	const v = String((e.target as HTMLTextAreaElement).value ?? '')
	emit('update-text-value', { textValue: v })
}
</script>

<style scoped>
.wf-text {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	gap: 4px;
	flex: 1;
	min-height: 0;
}

.wf-text-label {
	font-size: 12px;
	color: var(--vscode-foreground);
	opacity: 0.9;
	flex-shrink: 0;
}

.wf-textarea {
	width: 100%;
	flex: 1;
	min-height: 0;
	padding: 6px 8px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-foreground);
	border-radius: 4px;
	outline: none;
	resize: none;
	font-family: inherit;
	font-size: 12px;
	line-height: 18px;
	box-sizing: border-box;
	overflow-y: auto;
}

.wf-textarea:focus {
	border-color: var(--vscode-border-accent);
}
</style>
