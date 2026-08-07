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
	nodeGenerationTaskIdsByNodeId?: Record<string, string[]>
	legacyResources?: Record<string, LegacyResourceData>
	inputParamPreviewRefsByNodeId?: Record<string, InputParamPreviewRef[]>
	extraPropsResolver?: (nodeData: any) => Record<string, unknown>
	forceDomNodeIds?: string[]
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
	'node-upload-model3d-file': [payload: { nodeId: string; file: File }]
	'node-update-image-settings': [payload: { nodeId: string; patch: Record<string, any> }]
	'node-media-ready': [nodeId: string]
	'node-invalidate-screenshot': [nodeId: string]
	'node-preview-contextmenu': [payload: { nodeId: string; clientX: number; clientY: number }]
	'node-screenshot': [
		payload: { nodeId: string; dataUrl: string; width: number; height: number; time: number }
	]
	'node-set-type': [payload: { nodeId: string; type: string }]
	'node-update-scene-understanding-settings': [
		payload: { nodeId: string; patch: Record<string, any> }
	]
	'node-request-scene-models': [nodeId: string]
	'node-run-scene-understanding': [nodeId: string]
	'node-cancel-scene-understanding': [nodeId: string]
	'node-run-scene-decompose': [nodeId: string]
	'node-run-scene-layout': [nodeId: string]
	'node-update-preview-mode': [payload: { nodeId: string; previewMode: boolean }]
	'node-update-layout-items': [payload: { nodeId: string; items: any[] }]
	'node-update-selected-layout-item': [payload: { nodeId: string; itemId: string }]
	'node-update-hide-placeholder-cubes': [payload: { nodeId: string; hide: boolean }]
	'node-update-lighting-preview': [payload: { nodeId: string; enabled: boolean }]
	'node-update-lighting-debug': [payload: { nodeId: string; enabled: boolean }]
	'node-update-lighting-controls': [payload: { nodeId: string; controls: Record<string, any> }]
	'node-set-selected-placeholder-output': [payload: { nodeId: string; selectedId: string }]
	'node-clear-scene-layout-model-binding': [payload: { nodeId: string; objectId: string }]
	'node-start-three-preview': [nodeId: string]
	'node-three-preview-ready': [nodeId: string]
	'node-three-preview-error': [nodeId: string]
	'node-three-preview-progress': [payload: { nodeId: string; progress?: number; label?: string }]
	'node-upload-scene-layout-model-file': [
		payload: { nodeId: string; file: File; objectId?: string }
	]
	'node-update-model-bindings': [payload: { nodeId: string; bindings: any[] }]
	'node-export-unreal-scene': [nodeId: string]
	'node-export-unreal-lighting': [nodeId: string]
	'node-disconnect-unreal': [nodeId: string]
	'node-set-asset-root-path': [payload: { nodeId: string; path: string }]
	'node-update-poster': [payload: { nodeId: string; posterDataUrl: string }]
	'node-connect-comfyui': [payload: { nodeId: string; baseUrl: string }]
	'node-select-workflow': [payload: { nodeId: string; workflowPath: string }]
	'node-run-comfyui': [nodeId: string]
	'node-cancel-comfyui': [nodeId: string]
	'node-refresh-history-check': [nodeId: string]
	'node-clear-history-cache': [nodeId: string]
	'node-update-comfyui-settings': [payload: { nodeId: string; patch: Record<string, any> }]
	'node-manage-local-workflows': [nodeId: string]
	'node-blender-connect': [payload: { nodeId: string; host: string; port: number }]
	'node-blender-disconnect': [payload: { nodeId: string }]
	'node-blender-import': [payload: { nodeId: string }]
	'node-blender-mount-tools': [payload: { nodeId: string }]
	'node-blender-status-click': [payload: { nodeId: string; host: string; port: number }]
	'node-blender-clear-chat': [payload: { nodeId: string }]
	'node-blender-open-workspace': [payload: { nodeId: string }]
	'node-blender-init-workspace': [payload: { nodeId: string }]
	'node-update-blender-settings': [payload: { nodeId: string; patch: Record<string, any> }]
	'node-blender-compress-context': [payload: { nodeId: string }]
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
	},
	saveSelectionFrame(label?: string, nodeIds?: string[]): string | null {
		if (nodeIds && nodeIds.length >= 2) {
			const scene = blueprintEditorRef.value?.getScene?.()
			if (scene) {
				const frame = scene.saveSelectionFrame(nodeIds, label ?? '分组')
				return frame?.id ?? null
			}
			return null
		}
		return blueprintEditorRef.value?.saveSelectionFrame?.(label) ?? null
	},
	deleteSavedSelectionFrame(frameId: string): boolean {
		return blueprintEditorRef.value?.deleteSavedSelectionFrame?.(frameId) ?? false
	},
	getSavedSelectionFrames(): any[] {
		return blueprintEditorRef.value?.getSavedSelectionFrames?.() ?? []
	},
	// 查询蓝色临时多选框 / 绿色已保存分组框是否处于标签编辑态，
	// 用于业务层在处理 Backspace/Delete 快捷键前判断是否应跳过删除节点。
	isSelectionFrameEditing(): boolean {
		return !!blueprintEditorRef.value?.isSelectionFrameEditing?.()
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
			:node-generation-task-ids-by-node-id="nodeGenerationTaskIdsByNodeId"
			:legacy-resources="legacyResources"
			:input-param-preview-refs-by-node-id="inputParamPreviewRefsByNodeId"
			:extra-props-resolver="extraPropsResolver"
			:force-dom-node-ids="forceDomNodeIds"
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
			@node-upload-model3d-file="
				(p: any) => {
					console.log('[AIWorkflowBlueprintHost] node-upload-model3d-file received, forwarding:', {
						nodeId: p?.nodeId,
						fileName: p?.file?.name
					})
					emit('node-upload-model3d-file', p)
				}
			"
			@node-update-image-settings="(p: any) => emit('node-update-image-settings', p)"
			@node-media-ready="(id: string) => emit('node-media-ready', id)"
			@node-invalidate-screenshot="(id: string) => emit('node-invalidate-screenshot', id)"
			@node-preview-contextmenu="(p: any) => emit('node-preview-contextmenu', p)"
			@node-screenshot="(p: any) => emit('node-screenshot', p)"
			@node-set-type="(p: any) => emit('node-set-type', p)"
			@node-update-scene-understanding-settings="
				(p: any) => emit('node-update-scene-understanding-settings', p)
			"
			@node-request-scene-models="(id: string) => emit('node-request-scene-models', id)"
			@node-run-scene-understanding="(id: string) => emit('node-run-scene-understanding', id)"
			@node-cancel-scene-understanding="(id: string) => emit('node-cancel-scene-understanding', id)"
			@node-run-scene-decompose="(id: string) => emit('node-run-scene-decompose', id)"
			@node-run-scene-layout="(id: string) => emit('node-run-scene-layout', id)"
			@node-update-preview-mode="(p: any) => emit('node-update-preview-mode', p)"
			@node-update-layout-items="(p: any) => emit('node-update-layout-items', p)"
			@node-update-selected-layout-item="(p: any) => emit('node-update-selected-layout-item', p)"
			@node-update-hide-placeholder-cubes="
				(p: any) => emit('node-update-hide-placeholder-cubes', p)
			"
			@node-update-lighting-preview="(p: any) => emit('node-update-lighting-preview', p)"
			@node-update-lighting-debug="(p: any) => emit('node-update-lighting-debug', p)"
			@node-update-lighting-controls="(p: any) => emit('node-update-lighting-controls', p)"
			@node-set-selected-placeholder-output="
				(p: any) => emit('node-set-selected-placeholder-output', p)
			"
			@node-clear-scene-layout-model-binding="
				(p: any) => emit('node-clear-scene-layout-model-binding', p)
			"
			@node-start-three-preview="(id: string) => emit('node-start-three-preview', id)"
			@node-three-preview-ready="(id: string) => emit('node-three-preview-ready', id)"
			@node-three-preview-error="(id: string) => emit('node-three-preview-error', id)"
			@node-three-preview-progress="(p: any) => emit('node-three-preview-progress', p)"
			@node-upload-scene-layout-model-file="
				(p: any) => emit('node-upload-scene-layout-model-file', p)
			"
			@node-update-model-bindings="(p: any) => emit('node-update-model-bindings', p)"
			@node-export-unreal-scene="(id: string) => emit('node-export-unreal-scene', id)"
			@node-export-unreal-lighting="(id: string) => emit('node-export-unreal-lighting', id)"
			@node-disconnect-unreal="(id: string) => emit('node-disconnect-unreal', id)"
			@node-set-asset-root-path="(p: any) => emit('node-set-asset-root-path', p)"
			@node-update-poster="(p: any) => emit('node-update-poster', p)"
			@node-connect-comfyui="(p: any) => emit('node-connect-comfyui', p)"
			@node-select-workflow="(p: any) => emit('node-select-workflow', p)"
			@node-run-comfyui="(id: string) => emit('node-run-comfyui', id)"
			@node-cancel-comfyui="(id: string) => emit('node-cancel-comfyui', id)"
			@node-refresh-history-check="(id: string) => emit('node-refresh-history-check', id)"
			@node-clear-history-cache="(id: string) => emit('node-clear-history-cache', id)"
			@node-update-comfyui-settings="(p: any) => emit('node-update-comfyui-settings', p)"
			@node-manage-local-workflows="(id: string) => emit('node-manage-local-workflows', id)"
			@node-blender-connect="(p: any) => emit('node-blender-connect', p)"
			@node-blender-disconnect="(p: any) => emit('node-blender-disconnect', p)"
			@node-blender-import="(p: any) => emit('node-blender-import', p)"
			@node-blender-mount-tools="(p: any) => emit('node-blender-mount-tools', p)"
			@node-blender-status-click="(p: any) => emit('node-blender-status-click', p)"
			@node-blender-clear-chat="(p: any) => emit('node-blender-clear-chat', p)"
			@node-blender-open-workspace="(p: any) => emit('node-blender-open-workspace', p)"
			@node-blender-init-workspace="(p: any) => emit('node-blender-init-workspace', p)"
			@node-update-blender-settings="(p: any) => emit('node-update-blender-settings', p)"
			@node-blender-compress-context="(p: any) => emit('node-blender-compress-context', p)"
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
