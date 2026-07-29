<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import BlueprintEditor from '../../../engine/blueprint/BlueprintEditor.vue'
import type { LegacyBlueprintData, LegacyResourceData } from '../../../engine/blueprint/types'
import type { NodeChatState } from '../../../engine/blueprint/dom/NodeComponentResolver'
import type {
	WorkflowNodeChatSubmitPayload,
	WorkflowNodeGenerationTask
} from '../../../aiworkflow/types'
import type { InputParamPreviewRef } from '../node-business/presentation/useAIWorkflowTextOutputResolver'

interface Props {
	initialData: LegacyBlueprintData
	readonly?: boolean
	theme?: 'light' | 'dark'
	chatState?: NodeChatState | null
	nodeGenerationTasks?: Record<string, WorkflowNodeGenerationTask>
	legacyResources?: Record<string, LegacyResourceData>
	inputParamPreviewRefsByNodeId?: Record<string, InputParamPreviewRef[]>
}

const props = withDefaults(defineProps<Props>(), {
	readonly: false,
	theme: 'dark',
	chatState: null,
	inputParamPreviewRefsByNodeId: () => ({})
})

const emit = defineEmits<{
	change: [data: LegacyBlueprintData]
	'selection-change': [nodeIds: string[]]
	'viewport-change': [zoom: number, panX: number, panY: number]
	'node-double-click': [nodeId: string, event: MouseEvent]
	'node-context-menu': [nodeId: string, event: MouseEvent, worldPos: { x: number; y: number }]
	'canvas-context-menu': [event: MouseEvent, worldPos: { x: number; y: number }]
	'canvas-double-click': [event: MouseEvent, worldPos: { x: number; y: number }]
	'canvas-drop': [event: DragEvent, worldPos: { x: number; y: number }]
	'editor-ready': [editor: any]
	'node-refresh': [nodeId: string]
	'node-chat-submit': [payload: WorkflowNodeChatSubmitPayload]
	'node-chat-close': [nodeId: string]
	'node-chat-update-draft': [payload: { nodeId: string; draft: string }]
	'node-chat-update-params': [payload: { nodeId: string; params: Record<string, any> }]
	'node-chat-update-selected-refs': [payload: { nodeId: string; selectedRefs: any[] }]
	'node-chat-remove-param-ref': [payload: { nodeId: string; refItem: any }]
	'node-chat-stop': [nodeId: string]
	'link-drop-on-canvas': [
		payload: {
			clientX: number
			clientY: number
			worldX: number
			worldY: number
			fromNodeId: string
			fromAnchorId: string
		}
	]
	'node-start-link': [
		payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }
	]
	'node-end-link': [payload: { nodeId: string; anchorId: string; anchorIndex: number }]
	'node-preview-request': [payload: { nodeId: string; imageUrl: string }]
	'node-clear-resource': [nodeId: string]
	'node-upload-resource': [payload: { nodeId: string; file: File; kind: string }]
	'node-update-image-settings': [payload: { nodeId: string; patch: Record<string, any> }]
	'node-media-ready': [nodeId: string]
	'node-invalidate-screenshot': [nodeId: string]
	'node-preview-contextmenu': [payload: { nodeId: string; clientX: number; clientY: number }]
	'node-screenshot': [
		payload: { nodeId: string; dataUrl: string; width: number; height: number; time: number }
	]
}>()

const blueprintEditorRef = ref<InstanceType<typeof BlueprintEditor> | null>(null)
const hostRootRef = ref<HTMLDivElement | null>(null)
let hasRestoredViewport = false
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null

defineExpose({
	resetView() {
		blueprintEditorRef.value?.resetView()
	},
	fitToView() {
		blueprintEditorRef.value?.fitToView()
	},
	setViewport(viewport: { zoom: number; panX: number; panY: number }) {
		blueprintEditorRef.value?.setViewport(viewport)
	},
	getViewport() {
		return blueprintEditorRef.value?.getViewport?.()
	},
	loadBlueprint(data: LegacyBlueprintData) {
		blueprintEditorRef.value?.loadBlueprint(data)
	},
	getInstance() {
		return blueprintEditorRef.value
	},
	getScene() {
		return blueprintEditorRef.value?.getScene?.() ?? null
	},
	getContainerEl() {
		return hostRootRef.value
	},
	getNodeScreenRect(nodeId: string) {
		return blueprintEditorRef.value?.getNodeScreenRect?.(nodeId) ?? null
	},
	addNode(
		type: string,
		x: number,
		y: number,
		data?: Record<string, any>,
		opts?: { silent?: boolean; skipEditMode?: boolean }
	): string | null {
		return blueprintEditorRef.value?.addNode?.(type, x, y, data, opts) ?? null
	},
	deleteSelection() {
		blueprintEditorRef.value?.deleteSelection?.()
	},
	copySelection() {
		blueprintEditorRef.value?.copySelection?.()
	},
	paste() {
		blueprintEditorRef.value?.paste?.()
	},
	pasteAt(worldX: number, worldY: number) {
		return blueprintEditorRef.value?.pasteAt?.(worldX, worldY) ?? []
	},
	duplicate() {
		blueprintEditorRef.value?.duplicate?.()
	},
	undo() {
		blueprintEditorRef.value?.undo?.()
	},
	redo() {
		blueprintEditorRef.value?.redo?.()
	},
	canUndo(): boolean {
		return blueprintEditorRef.value?.canUndo?.() ?? false
	},
	canRedo(): boolean {
		return blueprintEditorRef.value?.canRedo?.() ?? false
	},
	getSelectedNodeIds(): string[] {
		return blueprintEditorRef.value?.getSelectedNodeIds?.() ?? []
	},
	createNodeWithConnection(params: {
		type: string
		x: number
		y: number
		title?: string
		fromNodeId: string
		fromAnchorId: string
		findBestInputAnchor?: (
			nodesById: Record<string, any>,
			fromNodeId: string,
			fromAnchorId: string,
			newNodeId: string
		) => string | null
		additionalData?: Record<string, any>
	}) {
		return (
			blueprintEditorRef.value?.createNodeWithConnection?.(params) ?? {
				nodeId: null,
				connected: false
			}
		)
	},
	updateNodeData(nodeId: string, patch: Record<string, any>, opts?: { silent?: boolean }): boolean {
		return blueprintEditorRef.value?.updateNodeData?.(nodeId, patch, opts) ?? false
	},
	setLegacyResource(resourceId: string, resourceData: Partial<LegacyResourceData>): void {
		blueprintEditorRef.value?.setLegacyResource?.(resourceId, resourceData)
	},
	connectPorts(
		fromNodeId: string,
		fromAnchorId: string,
		toNodeId: string,
		toAnchorId: string,
		opts?: { silent?: boolean }
	): boolean {
		return (
			blueprintEditorRef.value?.connectPorts?.(
				fromNodeId,
				fromAnchorId,
				toNodeId,
				toAnchorId,
				opts
			) ?? false
		)
	},
	clearPendingChanges(): void {
		blueprintEditorRef.value?.clearPendingChanges?.()
	},
	beginBulkUpdate(): void {
		blueprintEditorRef.value?.beginBulkUpdate?.()
	},
	endBulkUpdate(): void {
		blueprintEditorRef.value?.endBulkUpdate?.()
	},
	setSelection(nodeIds: string[]) {
		blueprintEditorRef.value?.setSelection?.(nodeIds)
	},
	selectAll() {
		blueprintEditorRef.value?.selectAll?.()
	},
	clearSelection() {
		blueprintEditorRef.value?.clearSelection?.()
	},
	hasClipboardData(): boolean {
		return blueprintEditorRef.value?.hasClipboardData?.() ?? false
	},
	removeNode(nodeId: string): boolean {
		return blueprintEditorRef.value?.removeNode?.(nodeId) ?? false
	},
	removeEdge(edgeId: string): boolean {
		return blueprintEditorRef.value?.removeEdge?.(edgeId) ?? false
	},
	updateNodePositionDirect(nodeId: string, worldX: number, worldY: number) {
		blueprintEditorRef.value?.updateNodePositionDirect?.(nodeId, worldX, worldY)
	},
	updateNodesPositionDirect(nodePositions: Map<string, { x: number; y: number }>) {
		blueprintEditorRef.value?.updateNodesPositionDirect?.(nodePositions)
	},
	commitNodeMovement(
		startPositions: Map<string, { x: number; y: number }>,
		endPositions: Map<string, { x: number; y: number }>
	) {
		blueprintEditorRef.value?.commitNodeMovement?.(startPositions, endPositions)
	}
})

let isEmittingFromEditor = false

function onBlueprintEditorChange(data: LegacyBlueprintData) {
	if (isEmittingFromEditor) return
	isEmittingFromEditor = true
	if (syncDebounceTimer) {
		clearTimeout(syncDebounceTimer)
		syncDebounceTimer = null
	}
	emit('change', data)
	isEmittingFromEditor = false
}

function onBlueprintEditorSelectionChange(nodeIds: string[]) {
	emit('selection-change', nodeIds)
}

function onBlueprintEditorViewportChange(zoom: number, panX: number, panY: number) {
	emit('viewport-change', zoom, panX, panY)
}

function onBlueprintEditorNodeDblClick(nodeId: string, event: MouseEvent) {
	emit('node-double-click', nodeId, event)
}

function onBlueprintEditorNodeContextMenu(
	nodeId: string,
	event: MouseEvent,
	worldPos: { x: number; y: number }
) {
	emit('node-context-menu', nodeId, event, worldPos)
}

function onBlueprintEditorCanvasContextMenu(event: MouseEvent, worldPos: { x: number; y: number }) {
	emit('canvas-context-menu', event, worldPos)
}

function onBlueprintEditorCanvasDblClick(event: MouseEvent, worldPos: { x: number; y: number }) {
	emit('canvas-double-click', event, worldPos)
}

function onBlueprintEditorDrop(event: DragEvent, worldPos: { x: number; y: number }) {
	emit('canvas-drop', event, worldPos)
}

function onBlueprintEditorNodeRefresh(nodeId: string) {
	emit('node-refresh', nodeId)
}

function onLinkDropOnCanvas(payload: {
	clientX: number
	clientY: number
	worldX: number
	worldY: number
	fromNodeId: string
	fromAnchorId: string
}) {
	emit('link-drop-on-canvas', payload)
}

function onNodeStartLink(payload: {
	nodeId: string
	anchorId: string
	anchorIndex: number
	event: PointerEvent
}) {
	emit('node-start-link', payload)
}

function onNodeEndLink(payload: { nodeId: string; anchorId: string; anchorIndex: number }) {
	emit('node-end-link', payload)
}

watch(
	blueprintEditorRef,
	(editor) => {
		if (editor && !hasRestoredViewport) {
			nextTick(() => {
				const storedVp = props.initialData.viewport
				if (
					storedVp &&
					(Math.abs(storedVp.zoom - 1) > 0.001 ||
						Math.abs(storedVp.panX) > 0.5 ||
						Math.abs(storedVp.panY) > 0.5)
				) {
					editor.setViewport(storedVp)
				} else {
					editor.fitToView()
				}
				hasRestoredViewport = true
				emit('editor-ready', editor)
			})
		}
	},
	{ immediate: true }
)
</script>

<template>
	<div ref="hostRootRef" class="bp-editor-root">
		<BlueprintEditor
			ref="blueprintEditorRef"
			class="aiwf-canvas"
			:initial-data="initialData"
			:readonly="readonly"
			:theme="theme"
			:chat-state="chatState"
			:node-generation-tasks="nodeGenerationTasks"
			:legacy-resources="legacyResources"
			:input-param-preview-refs-by-node-id="inputParamPreviewRefsByNodeId"
			@change="onBlueprintEditorChange"
			@selection-change="onBlueprintEditorSelectionChange"
			@viewport-change="onBlueprintEditorViewportChange"
			@node-double-click="onBlueprintEditorNodeDblClick"
			@node-context-menu="onBlueprintEditorNodeContextMenu"
			@canvas-context-menu="onBlueprintEditorCanvasContextMenu"
			@canvas-double-click="onBlueprintEditorCanvasDblClick"
			@canvas-drop="onBlueprintEditorDrop"
			@node-refresh="onBlueprintEditorNodeRefresh"
			@node-chat-submit="(p: WorkflowNodeChatSubmitPayload) => emit('node-chat-submit', p)"
			@node-chat-close="(id: string) => emit('node-chat-close', id)"
			@node-chat-update-draft="(p: any) => emit('node-chat-update-draft', p)"
			@node-chat-update-params="(p: any) => emit('node-chat-update-params', p)"
			@node-chat-update-selected-refs="(p: any) => emit('node-chat-update-selected-refs', p)"
			@node-chat-remove-param-ref="(p: any) => emit('node-chat-remove-param-ref', p)"
			@node-chat-stop="(id: string) => emit('node-chat-stop', id)"
			@link-drop-on-canvas="onLinkDropOnCanvas"
			@node-start-link="onNodeStartLink"
			@node-end-link="onNodeEndLink"
			@node-preview-request="(p: any) => emit('node-preview-request', p)"
			@node-clear-resource="(id: string) => emit('node-clear-resource', id)"
			@node-upload-resource="(p: any) => emit('node-upload-resource', p)"
			@node-update-image-settings="(p: any) => emit('node-update-image-settings', p)"
			@node-media-ready="(id: string) => emit('node-media-ready', id)"
			@node-invalidate-screenshot="(id: string) => emit('node-invalidate-screenshot', id)"
			@node-preview-contextmenu="(p: any) => emit('node-preview-contextmenu', p)"
			@node-screenshot="(p: any) => emit('node-screenshot', p)"
		/>
		<div class="bp-overlay-layer">
			<slot />
		</div>
	</div>
</template>

<style scoped>
.bp-editor-root {
	position: relative;
	width: 100%;
	height: 100%;
	overflow: hidden;
}

.bp-editor-root :deep(.aiwf-canvas) {
	width: 100%;
	height: 100%;
}

.bp-overlay-layer {
	position: absolute;
	inset: 0;
	z-index: 10;
	pointer-events: none;
}

.bp-overlay-layer :deep(> *) {
	pointer-events: auto;
}
</style>
