<template>
	<div
		class="workflow-node-wrapper"
		:style="wrapperStyle"
		@dblclick.stop="onDblClick"
		@contextmenu.prevent.stop="onContextMenu"
	>
		<component
			:is="businessComponent"
			v-bind="resolvedProps"
			@update:world-position="onWorldPositionUpdate"
			@start-link="onStartLink"
			@end-link="onEndLink"
			@resize="onResize"
			@update-text-value="onUpdateTextValue"
			@select="onSelect"
			@copy="onCopy"
			@delete="onDelete"
			@refresh="onRefresh"
			@preview-request="onPreviewRequest"
			@clear-resource="onClearResource"
			@upload-resource="onUploadResource"
			@update-image-settings="onUpdateImageSettings"
			@media-ready="onMediaReady"
			@invalidate-screenshot="onInvalidateScreenshot"
			@preview-contextmenu="onPreviewContextMenu"
		/>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NodeComponentResolver, type NodeChatState } from './NodeComponentResolver'
import type { BlueprintNode } from '../BlueprintNode'
import type { LegacyResourceData } from '../types'
import type { NodeStatus } from './DomNodeWrapper.vue'
import type { WorkflowNodeGenerationTask } from '../../../aiworkflow/types'

const props = defineProps<{
	node: BlueprintNode
	zoom: number
	width: number
	height: number
	status: NodeStatus
	selected: boolean
	accentColor: string
	legacyResources: Record<string, LegacyResourceData>
	inputParamPreviewRefsByNodeId?: Record<string, any[]>
	chatState?: NodeChatState | null
	generationTasks?: Record<string, WorkflowNodeGenerationTask>
}>()

const emit = defineEmits<{
	(e: 'edit', nodeId: string): void
	(e: 'contextmenu', payload: { nodeId: string; x: number; y: number }): void
	(e: 'update-text', payload: { nodeId: string; textValue: string }): void
	(
		e: 'node-resize',
		payload: { nodeId: string; width: number; height: number; worldX: number; worldY: number }
	): void
	(
		e: 'start-link',
		payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }
	): void
	(e: 'end-link', payload: { nodeId: string; anchorId: string; anchorIndex: number }): void
	(e: 'select', nodeId: string): void
	(e: 'copy', nodeId: string): void
	(e: 'delete', nodeId: string): void
	(e: 'refresh', nodeId: string): void
	(e: 'preview-request', payload: { nodeId: string; imageUrl: string }): void
	(e: 'clear-resource', nodeId: string): void
	(e: 'upload-resource', payload: { nodeId: string; file: File; kind: string }): void
	(e: 'update-image-settings', payload: { nodeId: string; patch: Record<string, any> }): void
	(e: 'media-ready', nodeId: string): void
	(e: 'invalidate-screenshot', nodeId: string): void
	(e: 'preview-contextmenu', payload: { nodeId: string; clientX: number; clientY: number }): void
}>()

const businessComponent = computed(() => {
	return NodeComponentResolver.getComponent(props.node.nodeType)
})

const resolvedProps = computed(() => {
	const nodeId = props.node.id
	const nodeRefs = props.inputParamPreviewRefsByNodeId?.[nodeId] || []
	// 调试日志
	if (nodeRefs.length > 0) {
		console.log(
			`[WorkflowNodeWrapper] nodeId=${nodeId}, nodeType=${props.node.nodeType}, inputParamPreviewRefs=`,
			nodeRefs
		)
	}
	return NodeComponentResolver.resolveNodeProps(
		props.node,
		props.zoom,
		props.legacyResources,
		props.selected,
		props.chatState,
		props.generationTasks,
		nodeRefs
	)
})

const wrapperStyle = computed(() => ({
	'--wf-primary': props.accentColor,
	'--wf-node-border': `color-mix(in srgb, ${props.accentColor} 40%, transparent)`,
	'--wf-node-border-selected': props.accentColor,
	'--wf-node-shadow': `0 0 8px color-mix(in srgb, ${props.accentColor} 15%, transparent)`,
	'--wf-node-shadow-selected': `0 0 20px color-mix(in srgb, ${props.accentColor} 30%, transparent)`,
	'--vscode-border-accent': props.accentColor,
	width: '100%',
	height: '100%',
	position: 'relative' as const,
	overflow: 'visible',
	zIndex: 1
}))

const onDblClick = (e: MouseEvent) => {
	emit('edit', props.node.id)
}

const onContextMenu = (e: MouseEvent) => {
	emit('contextmenu', {
		nodeId: props.node.id,
		x: e.clientX,
		y: e.clientY
	})
}

const onWorldPositionUpdate = (_payload: { worldX: number; worldY: number }) => {}

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

const onResize = (payload: { width: number; height: number; worldX: number; worldY: number }) => {
	emit('node-resize', {
		nodeId: props.node.id,
		...payload
	})
}

const onUpdateTextValue = (payload: { textValue: string }) => {
	emit('update-text', {
		nodeId: props.node.id,
		textValue: payload.textValue
	})
}

const onSelect = (nodeId: string) => {
	emit('select', nodeId)
}

const onCopy = () => {
	emit('copy', props.node.id)
}

const onDelete = () => {
	emit('delete', props.node.id)
}

const onRefresh = () => {
	emit('refresh', props.node.id)
}

const onPreviewRequest = (payload: { imageUrl: string }) => {
	emit('preview-request', { nodeId: props.node.id, imageUrl: payload.imageUrl })
}

const onClearResource = () => {
	emit('clear-resource', props.node.id)
}

const onUploadResource = (payload: { file: File; kind: string }) => {
	emit('upload-resource', { nodeId: props.node.id, file: payload.file, kind: payload.kind })
}

const onUpdateImageSettings = (patch: Record<string, any>) => {
	emit('update-image-settings', { nodeId: props.node.id, patch })
}

const onMediaReady = () => {
	emit('media-ready', props.node.id)
}

const onInvalidateScreenshot = () => {
	emit('invalidate-screenshot', props.node.id)
}

const onPreviewContextMenu = (payload: { clientX: number; clientY: number }) => {
	emit('preview-contextmenu', {
		nodeId: props.node.id,
		clientX: payload.clientX,
		clientY: payload.clientY
	})
}
</script>

<style scoped>
.workflow-node-wrapper {
	width: 100%;
	height: 100%;
	position: absolute;
	top: 0;
	left: 0;
	pointer-events: none;
	z-index: 1;
}

.workflow-node-wrapper :deep(.wf-node) {
	position: absolute !important;
	left: 0 !important;
	top: 0 !important;
	width: 100% !important;
	height: 100% !important;
	transform: none !important;
	margin: 0 !important;
	pointer-events: none !important;
	cursor: default !important;
	overflow: visible !important;
	box-sizing: border-box !important;
}

.workflow-node-wrapper :deep(.wf-node-toolbar) {
	display: none !important;
}

.workflow-node-wrapper :deep(.wf-anchors),
.workflow-node-wrapper :deep(.wf-anchor-hit) {
	display: none !important;
}

.workflow-node-wrapper :deep(.wf-node-particles) {
	display: none !important;
}

.workflow-node-wrapper :deep(.wf-node-id-badge) {
	display: none !important;
}

.workflow-node-wrapper :deep(.wf-node-header) {
	pointer-events: none !important;
}

.workflow-node-wrapper :deep(.wf-node-body) {
	pointer-events: none !important;
}

.workflow-node-wrapper :deep(.wf-node-footer) {
	pointer-events: none !important;
}

.workflow-node-wrapper :deep(.wf-node-bg),
.workflow-node-wrapper :deep(.wf-node-border),
.workflow-node-wrapper :deep(.wf-node-glow),
.workflow-node-wrapper :deep(.wf-node-shine) {
	pointer-events: none !important;
}

.workflow-node-wrapper :deep(.wf-resize) {
	display: none !important;
}

.workflow-node-wrapper :deep(.wf-textarea),
.workflow-node-wrapper :deep(.wf-media-btn),
.workflow-node-wrapper :deep(.wf-file-input),
.workflow-node-wrapper :deep(.wf-model3d-viewer-shell),
.workflow-node-wrapper :deep(.wf-model3d-actions),
.workflow-node-wrapper :deep(.wf-model3d-footer),
.workflow-node-wrapper :deep(.wf-model3d-download-progress),
.workflow-node-wrapper :deep(.wf-model3d-fetch-error),
.workflow-node-wrapper :deep(textarea),
.workflow-node-wrapper :deep(input),
.workflow-node-wrapper :deep(button),
.workflow-node-wrapper :deep(select),
.workflow-node-wrapper :deep(.wf-inline-btn),
.workflow-node-wrapper :deep(.wf-quick-action),
.workflow-node-wrapper :deep(.wf-file-drop),
.workflow-node-wrapper :deep([role='button']),
.workflow-node-wrapper :deep(label),
.workflow-node-wrapper :deep(.wf-chat-input),
.workflow-node-wrapper :deep(.wf-chat-send-btn),
.workflow-node-wrapper :deep(.wf-param-item),
.workflow-node-wrapper :deep(.wf-slider),
.workflow-node-wrapper :deep(.wf-toggle),
.workflow-node-wrapper :deep(.wf-node-status-dot) {
	pointer-events: auto !important;
	cursor: pointer;
}

.workflow-node-wrapper :deep(button:hover),
.workflow-node-wrapper :deep(.wf-media-btn:hover),
.workflow-node-wrapper :deep(.wf-inline-btn:hover),
.workflow-node-wrapper :deep([role='button']:hover) {
	filter: brightness(1.15);
}

.workflow-node-wrapper :deep(.bp-node-chat-dialog) {
	pointer-events: auto !important;
}
</style>
