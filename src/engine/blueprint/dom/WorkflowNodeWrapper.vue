<template>
	<div
		class="workflow-node-wrapper"
		:style="wrapperStyle"
		@dblclick.stop="onDblClick"
		@contextmenu.prevent.stop="onContextMenu"
	>
		<component
			:is="businessComponent"
			:ref="onBusinessComponentRef"
			v-bind="resolvedProps"
			@update:world-position="onWorldPositionUpdate"
			@start-link="onStartLink"
			@end-link="onEndLink"
			@resize="onResize"
			@auto-resize="onAutoResize"
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
			@screenshot="onScreenshot"
			@set-type="onSetType"
			@update-scene-understanding-settings="onUpdateSceneUnderstandingSettings"
			@request-scene-models="onRequestSceneModels"
			@run-scene-understanding="onRunSceneUnderstanding"
			@cancel-scene-understanding="onCancelSceneUnderstanding"
			@run-scene-decompose="onRunSceneDecompose"
			@run-scene-layout="onRunSceneLayout"
			@update-preview-mode="onUpdatePreviewMode"
			@update-layout-items="onUpdateLayoutItems"
			@update-selected-layout-item="onUpdateSelectedLayoutItem"
			@update-hide-placeholder-cubes="onUpdateHidePlaceholderCubes"
			@update-lighting-preview="onUpdateLightingPreview"
			@update-lighting-debug="onUpdateLightingDebug"
			@update-lighting-controls="onUpdateLightingControls"
			@set-selected-placeholder-output="onSetSelectedPlaceholderOutput"
			@clear-scene-layout-model-binding="onClearSceneLayoutModelBinding"
			@start-three-preview="onStartThreePreview"
			@three-preview-ready="onThreePreviewReady"
			@three-preview-error="onThreePreviewError"
			@three-preview-progress="onThreePreviewProgress"
			@upload-scene-layout-model-file="onUploadSceneLayoutModelFile"
			@update-model-bindings="onUpdateModelBindings"
		/>
	</div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount } from 'vue'
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
	generationTaskIdsByNodeId?: Record<string, string[]>
	extraPropsResolver?: (nodeData: any) => Record<string, unknown>
}>()

const emit = defineEmits<{
	(e: 'edit', nodeId: string): void
	(e: 'contextmenu', payload: { nodeId: string; x: number; y: number }): void
	(e: 'update-text', payload: { nodeId: string; textValue: string }): void
	(
		e: 'node-resize',
		payload: { nodeId: string; width: number; height: number; worldX: number; worldY: number }
	): void
	(e: 'node-auto-resize', payload: { nodeId: string; height: number }): void
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
	(
		e: 'screenshot',
		payload: { nodeId: string; dataUrl: string; width: number; height: number; time: number }
	): void
	(e: 'set-type', payload: { nodeId: string; type: string }): void
	(
		e: 'update-scene-understanding-settings',
		payload: { nodeId: string; patch: Record<string, any> }
	): void
	(e: 'request-scene-models', nodeId: string): void
	(e: 'run-scene-understanding', nodeId: string): void
	(e: 'cancel-scene-understanding', nodeId: string): void
	(e: 'run-scene-decompose', nodeId: string): void
	(e: 'run-scene-layout', nodeId: string): void
	(e: 'update-preview-mode', payload: { nodeId: string; previewMode: boolean }): void
	(e: 'update-layout-items', payload: { nodeId: string; items: any[] }): void
	(e: 'update-selected-layout-item', payload: { nodeId: string; itemId: string }): void
	(e: 'update-hide-placeholder-cubes', payload: { nodeId: string; hide: boolean }): void
	(e: 'update-lighting-preview', payload: { nodeId: string; enabled: boolean }): void
	(e: 'update-lighting-debug', payload: { nodeId: string; enabled: boolean }): void
	(e: 'update-lighting-controls', payload: { nodeId: string; controls: Record<string, any> }): void
	(e: 'set-selected-placeholder-output', payload: { nodeId: string; selectedId: string }): void
	(e: 'clear-scene-layout-model-binding', payload: { nodeId: string; objectId: string }): void
	(e: 'start-three-preview', nodeId: string): void
	(e: 'three-preview-ready', nodeId: string): void
	(e: 'three-preview-error', nodeId: string): void
	(
		e: 'three-preview-progress',
		payload: { nodeId: string; progress?: number; label?: string }
	): void
	(
		e: 'upload-scene-layout-model-file',
		payload: { nodeId: string; file: File; objectId?: string }
	): void
	(e: 'update-model-bindings', payload: { nodeId: string; bindings: any[] }): void
}>()

const businessComponent = computed(() => {
	return NodeComponentResolver.getComponent(props.node.nodeType)
})

const registerSceneLayoutNode = inject<(nodeId: string, instance: unknown | null) => void>(
	'sceneLayoutNodeRegister',
	() => {}
)

const onBusinessComponentRef = (instance: unknown | null) => {
	if (props.node.nodeType === 'scene-layout') {
		registerSceneLayoutNode(props.node.id, instance)
	}
}

onBeforeUnmount(() => {
	if (props.node.nodeType === 'scene-layout') {
		registerSceneLayoutNode(props.node.id, null)
	}
})

const resolvedProps = computed(() => {
	const nodeId = props.node.id
	const nodeRefs = props.inputParamPreviewRefsByNodeId?.[nodeId] || []
	const baseProps = NodeComponentResolver.resolveNodeProps(
		props.node,
		props.zoom,
		props.legacyResources,
		props.selected,
		props.chatState,
		props.generationTasks,
		nodeRefs,
		props.generationTaskIdsByNodeId
	)
	let extraResolved: Record<string, unknown> = {}
	if (props.extraPropsResolver) {
		try {
			const businessNode = new Proxy(
				{},
				{
					get: (_target, prop) => {
						if (prop === 'id') return props.node.id
						if (prop === 'type') return (props.node as any).nodeType
						const data = (props.node as any).data
						if (data && prop in data) return data[prop]
						return (props.node as any)[prop]
					},
					has: (_target, prop) => {
						if (prop === 'id' || prop === 'type') return true
						const data = (props.node as any).data
						if (data && prop in data) return true
						return prop in (props.node as any)
					}
				}
			)
			extraResolved = props.extraPropsResolver(businessNode as any)
			if ((props.node as any).nodeType === 'scene-layout') {
				// eslint-disable-next-line no-console
				console.info(
					'[WORKFLOW-NODE-WRAPPER] scene-layout extraResolved keys:',
					Object.keys(extraResolved)
				)
				// eslint-disable-next-line no-console
				console.info('[WORKFLOW-NODE-WRAPPER] scene-layout extraResolved.linkedJsonText:', {
					type: typeof (extraResolved as Record<string, unknown>).linkedJsonText,
					len: String((extraResolved as Record<string, unknown>).linkedJsonText ?? '').length,
					preview: (extraResolved as Record<string, unknown>).linkedJsonText
						? `${String((extraResolved as Record<string, unknown>).linkedJsonText).slice(0, 150)}...`
						: '(empty)'
				})
				const ers = (extraResolved as Record<string, unknown>).sceneLayoutSettings as Record<
					string,
					unknown
				> | null
				// eslint-disable-next-line no-console
				console.info('[WORKFLOW-NODE-WRAPPER] extraResolved.sceneLayoutSettings:', {
					exists: !!ers,
					status: ers?.status ?? '(none)',
					layoutItemsLen: Array.isArray(ers?.layoutItems)
						? (ers!.layoutItems as unknown[]).length
						: 'N/A',
					inputJsonLen: String(ers?.inputJson ?? '').length,
					keys: ers ? Object.keys(ers) : []
				})
				const bps = baseProps.sceneLayoutSettings as Record<string, unknown> | undefined
				// eslint-disable-next-line no-console
				console.info('[WORKFLOW-NODE-WRAPPER] baseProps.sceneLayoutSettings:', {
					exists: !!bps,
					status: bps?.status ?? '(none)',
					layoutItemsLen: Array.isArray(bps?.layoutItems)
						? (bps!.layoutItems as unknown[]).length
						: 'N/A',
					inputJsonLen: String(bps?.inputJson ?? '').length,
					keys: bps ? Object.keys(bps) : []
				})
				// Also check node.data.sceneLayoutSettings directly
				const nodeData = (props.node as any).data as Record<string, unknown> | undefined
				const nds = nodeData?.sceneLayoutSettings as Record<string, unknown> | undefined
				// eslint-disable-next-line no-console
				console.info('[WORKFLOW-NODE-WRAPPER] node.data.sceneLayoutSettings:', {
					exists: !!nds,
					status: nds?.status ?? '(none)',
					layoutItemsLen: Array.isArray(nds?.layoutItems)
						? (nds!.layoutItems as unknown[]).length
						: 'N/A',
					inputJsonLen: String(nds?.inputJson ?? '').length,
					keys: nds ? Object.keys(nds) : []
				})
			}
		} catch (err) {
			console.error('[WorkflowNodeWrapper] extraPropsResolver error:', err)
		}
	}
	return { ...baseProps, ...extraResolved }
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

const onAutoResize = (height: number) => {
	emit('node-auto-resize', {
		nodeId: props.node.id,
		height
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

const onScreenshot = (payload: {
	dataUrl: string
	width: number
	height: number
	time: number
}) => {
	emit('screenshot', {
		nodeId: props.node.id,
		dataUrl: payload.dataUrl,
		width: payload.width,
		height: payload.height,
		time: payload.time
	})
}

const onSetType = (type: string) => {
	emit('set-type', { nodeId: props.node.id, type })
}

const onUpdateSceneUnderstandingSettings = (patch: Record<string, any>) => {
	emit('update-scene-understanding-settings', { nodeId: props.node.id, patch })
}

const onRequestSceneModels = () => {
	emit('request-scene-models', props.node.id)
}

const onRunSceneUnderstanding = () => {
	emit('run-scene-understanding', props.node.id)
}

const onCancelSceneUnderstanding = () => {
	emit('cancel-scene-understanding', props.node.id)
}

const onRunSceneDecompose = () => {
	emit('run-scene-decompose', props.node.id)
}

const onRunSceneLayout = () => {
	console.info(
		'【SCENE-LAYOUT-CHAIN】① WorkflowNodeWrapper.onRunSceneLayout called, nodeId:',
		props.node.id
	)
	emit('run-scene-layout', props.node.id)
	console.info(
		'【SCENE-LAYOUT-CHAIN】① WorkflowNodeWrapper emitted run-scene-layout with nodeId:',
		props.node.id
	)
}

const onUpdatePreviewMode = (previewMode: boolean) => {
	emit('update-preview-mode', { nodeId: props.node.id, previewMode })
}

const onUpdateLayoutItems = (items: any[]) => {
	emit('update-layout-items', { nodeId: props.node.id, items })
}

const onUpdateSelectedLayoutItem = (itemId: string) => {
	emit('update-selected-layout-item', { nodeId: props.node.id, itemId })
}

const onUpdateHidePlaceholderCubes = (hide: boolean) => {
	emit('update-hide-placeholder-cubes', { nodeId: props.node.id, hide })
}

const onUpdateLightingPreview = (enabled: boolean) => {
	emit('update-lighting-preview', { nodeId: props.node.id, enabled })
}

const onUpdateLightingDebug = (enabled: boolean) => {
	emit('update-lighting-debug', { nodeId: props.node.id, enabled })
}

const onUpdateLightingControls = (controls: Record<string, any>) => {
	emit('update-lighting-controls', { nodeId: props.node.id, controls })
}

const onSetSelectedPlaceholderOutput = (selectedId: string) => {
	emit('set-selected-placeholder-output', { nodeId: props.node.id, selectedId })
}

const onClearSceneLayoutModelBinding = (payload: { objectId: string }) => {
	emit('clear-scene-layout-model-binding', { nodeId: props.node.id, objectId: payload.objectId })
}

const onStartThreePreview = () => {
	emit('start-three-preview', props.node.id)
}

const onThreePreviewReady = () => {
	emit('three-preview-ready', props.node.id)
}

const onThreePreviewError = () => {
	emit('three-preview-error', props.node.id)
}

const onThreePreviewProgress = (payload?: { progress?: number; label?: string }) => {
	emit('three-preview-progress', { nodeId: props.node.id, ...payload })
}

const onUploadSceneLayoutModelFile = (payload: { file: File; objectId?: string }) => {
	emit('upload-scene-layout-model-file', { nodeId: props.node.id, ...payload })
}

const onUpdateModelBindings = (bindings: any[]) => {
	emit('update-model-bindings', { nodeId: props.node.id, bindings })
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
.workflow-node-wrapper :deep(.wf-node-status-dot),
.workflow-node-wrapper :deep(.wf-scene-understand),
.workflow-node-wrapper :deep(.wf-scene-layout),
.workflow-node-wrapper :deep(.wf-scene-layout-viewer-shell),
.workflow-node-wrapper :deep(.wf-scene-layout-canvas),
.workflow-node-wrapper :deep(.wf-three-shell),
.workflow-node-wrapper :deep(.wf-three-shell-overlay),
.workflow-node-wrapper :deep(.wf-three-shell-dock),
.workflow-node-wrapper :deep(.wf-three-shell-start) {
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
