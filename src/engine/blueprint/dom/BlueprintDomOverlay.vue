<template>
	<div v-if="scene" ref="overlayRef" class="bp-dom-overlay" :style="overlayStyle">
		<div ref="transformLayerRef" class="bp-dom-transform-layer" :style="transformLayerStyle">
			<TransitionGroup name="dnw">
				<DomNodeWrapper
					v-for="node in domNodeRenders"
					:key="node.nodeId"
					:node-id="node.nodeId"
					:node-type="node.nodeType"
					:title="node.title"
					:x="node.x"
					:y="node.y"
					:width="node.width"
					:height="node.height"
					:selected="node.selected"
					:accent-color="node.accentColor"
					:status="node.status"
					:input-port-renders="node.inputPorts"
					:output-port-renders="node.outputPorts"
					@contextmenu="(ev) => emit('node-contextmenu', node.nodeId, ev)"
					@dragstart="(ev) => onDomNodeDragStart(node.nodeId, ev)"
					@port-pointerdown="(p) => onPortPointerDown(node.nodeId, p.portId, p.isInput, p.event)"
					@resize-start="(p) => onDomNodeResizeStart(node.nodeId, p.corner, p.event)"
					@select="(ev) => onDomNodeSelect(node.nodeId, ev)"
				>
					<WorkflowNodeWrapper
						v-if="canUseBusinessComponent(node.nodeType)"
						:node="node.node as any"
						:zoom="cameraState.zoom"
						:width="node.width"
						:height="node.height"
						:status="node.status"
						:selected="node.selected"
						:accent-color="node.accentColor"
						:legacy-resources="legacyResourcesResolved"
						:input-param-preview-refs-by-node-id="inputParamPreviewRefsResolved"
						:chat-state="chatState"
						:generation-tasks="nodeGenerationTasks"
						:generation-task-ids-by-node-id="nodeGenerationTaskIdsByNodeId"
						:extra-props-resolver="extraPropsResolver"
						@edit="(id: string) => handleBusinessEdit(id)"
						@contextmenu="handleBusinessContextMenu"
						@update-text="onBusinessUpdateText"
						@node-resize="onBusinessResize"
						@node-auto-resize="onBusinessAutoResize"
						@start-link="onBusinessStartLink"
						@end-link="onBusinessEndLink"
						@select="onBusinessSelect"
						@copy="onBusinessCopy"
						@delete="onBusinessDelete"
						@refresh="onBusinessRefresh"
						@preview-request="onBusinessPreviewRequest"
						@clear-resource="onBusinessClearResource"
						@upload-resource="onBusinessUploadResource"
						@update-image-settings="onBusinessUpdateImageSettings"
						@media-ready="onBusinessMediaReady"
						@invalidate-screenshot="onBusinessInvalidateScreenshot"
						@preview-contextmenu="onBusinessPreviewContextMenu"
						@screenshot="onBusinessScreenshot"
						@set-type="onBusinessSetType"
						@update-scene-understanding-settings="onBusinessUpdateSceneUnderstandingSettings"
						@request-scene-models="onBusinessRequestSceneModels"
						@run-scene-understanding="onBusinessRunSceneUnderstanding"
						@cancel-scene-understanding="onBusinessCancelSceneUnderstanding"
						@run-scene-decompose="onBusinessRunSceneDecompose"
						@run-scene-layout="onBusinessRunSceneLayout"
						@update-preview-mode="onBusinessUpdatePreviewMode"
						@update-layout-items="onBusinessUpdateLayoutItems"
						@update-selected-layout-item="onBusinessUpdateSelectedLayoutItem"
						@update-hide-placeholder-cubes="onBusinessUpdateHidePlaceholderCubes"
						@update-lighting-preview="onBusinessUpdateLightingPreview"
						@update-lighting-debug="onBusinessUpdateLightingDebug"
						@update-lighting-controls="onBusinessUpdateLightingControls"
						@set-selected-placeholder-output="onBusinessSetSelectedPlaceholderOutput"
						@clear-scene-layout-model-binding="onBusinessClearSceneLayoutModelBinding"
						@start-three-preview="onBusinessStartThreePreview"
						@three-preview-ready="onBusinessThreePreviewReady"
						@three-preview-error="onBusinessThreePreviewError"
						@three-preview-progress="onBusinessThreePreviewProgress"
						@upload-scene-layout-model-file="onBusinessUploadSceneLayoutModelFile"
						@update-model-bindings="onBusinessUpdateModelBindings"
						@export-unreal-scene="onBusinessExportUnrealScene"
						@export-unreal-lighting="onBusinessExportUnrealLighting"
						@disconnect-unreal="onBusinessDisconnectUnreal"
						@set-asset-root-path="onBusinessSetAssetRootPath"
						@update-poster="onBusinessUpdatePoster"
					/>
				</DomNodeWrapper>
			</TransitionGroup>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import DomNodeWrapper, { type NodeStatus } from './DomNodeWrapper.vue'
import WorkflowNodeWrapper from './WorkflowNodeWrapper.vue'
import { BlueprintNode, Port } from '../index'
import { Rect } from '../../graphbase/core/Rect'
import { Vector2 } from '../../graphbase/core/Vector2'
import { MEDIA_TYPE_COLORS } from '../types'
import type { LegacyResourceData } from '../types'
import { NodeComponentResolver, type NodeChatState } from './NodeComponentResolver'
import { UpdateNodeTextCommand } from '../commands/UpdateNodeTextCommand'
import { MoveNodeCommand } from '../../graphbase/commands/CompositeCommand'
import { CreateConnectionCommand } from '../commands/CreateConnectionCommand'
import { ResizeNodeCommand } from '../commands/ResizeNodeCommand'
import { SetNodeChatVisibleCommand } from '../commands/SetNodeChatVisibleCommand'
import { UpdateNodeChatDataCommand } from '../commands/UpdateNodeChatDataCommand'
import type {
	WorkflowNodeChatSubmitPayload,
	WorkflowNodeGenerationTask,
	WorkflowNodeChatSelectedRef,
	WorkflowNodeChatType,
	WorkflowNodeChatParams
} from '../../../aiworkflow/types'
import {
	provideNodeChatApi,
	type NodeChatApi
} from '../../../ui/BluePrint/node-dialog/useNodeChatApi'
import {
	areParamsEqual,
	areSelectedRefsEqual,
	normalizeRefsForStorage,
	type StoredNodeChatRef
} from '../../../ui/BluePrint/node-dialog/chatStateUtils'

interface PortRenderData {
	id: string
	label?: string
	offsetY: number
	mediaType: string
}

interface DomNodeRenderData {
	nodeId: string
	nodeType: string
	title: string
	x: number
	y: number
	width: number
	height: number
	selected: boolean
	accentColor: string
	status: NodeStatus
	inputPorts: PortRenderData[]
	outputPorts: PortRenderData[]
	node: BlueprintNode
}

const emit = defineEmits<{
	(e: 'node-click', nodeId: string, event: MouseEvent): void
	(e: 'node-contextmenu', nodeId: string, event: MouseEvent): void
	(e: 'node-update-text', payload: { nodeId: string; textValue: string }): void
	(
		e: 'node-start-link',
		payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }
	): void
	(e: 'node-end-link', payload: { nodeId: string; anchorId: string; anchorIndex: number }): void
	(e: 'node-select', nodeId: string): void
	(e: 'node-copy', nodeId: string): void
	(e: 'node-delete', nodeId: string): void
	(e: 'node-refresh', nodeId: string): void
	(e: 'interaction-end'): void
	(e: 'node-chat-submit', payload: WorkflowNodeChatSubmitPayload): void
	(e: 'node-chat-close', nodeId: string): void
	(e: 'node-chat-update-draft', payload: { nodeId: string; draft: string }): void
	(e: 'node-chat-update-params', payload: { nodeId: string; params: Record<string, any> }): void
	(e: 'node-chat-update-selected-refs', payload: { nodeId: string; selectedRefs: any[] }): void
	(e: 'node-chat-remove-param-ref', payload: { nodeId: string; refItem: any }): void
	(e: 'node-chat-stop', nodeId: string): void
	(e: 'node-preview-request', payload: { nodeId: string; imageUrl: string }): void
	(e: 'node-clear-resource', nodeId: string): void
	(e: 'node-upload-resource', payload: { nodeId: string; file: File; kind: string }): void
	(e: 'node-update-image-settings', payload: { nodeId: string; patch: Record<string, any> }): void
	(e: 'node-media-ready', nodeId: string): void
	(e: 'node-invalidate-screenshot', nodeId: string): void
	(
		e: 'node-preview-contextmenu',
		payload: { nodeId: string; clientX: number; clientY: number }
	): void
	(
		e: 'node-screenshot',
		payload: { nodeId: string; dataUrl: string; width: number; height: number; time: number }
	): void
	(e: 'node-set-type', payload: { nodeId: string; type: string }): void
	(
		e: 'node-update-scene-understanding-settings',
		payload: { nodeId: string; patch: Record<string, any> }
	): void
	(e: 'node-request-scene-models', nodeId: string): void
	(e: 'node-run-scene-understanding', nodeId: string): void
	(e: 'node-cancel-scene-understanding', nodeId: string): void
	(e: 'node-run-scene-decompose', nodeId: string): void
	(e: 'node-run-scene-layout', nodeId: string): void
	(e: 'node-update-preview-mode', payload: { nodeId: string; previewMode: boolean }): void
	(e: 'node-update-layout-items', payload: { nodeId: string; items: any[] }): void
	(e: 'node-update-selected-layout-item', payload: { nodeId: string; itemId: string }): void
	(e: 'node-update-hide-placeholder-cubes', payload: { nodeId: string; hide: boolean }): void
	(e: 'node-update-lighting-preview', payload: { nodeId: string; enabled: boolean }): void
	(e: 'node-update-lighting-debug', payload: { nodeId: string; enabled: boolean }): void
	(
		e: 'node-update-lighting-controls',
		payload: { nodeId: string; controls: Record<string, any> }
	): void
	(e: 'node-set-selected-placeholder-output', payload: { nodeId: string; selectedId: string }): void
	(e: 'node-clear-scene-layout-model-binding', payload: { nodeId: string; objectId: string }): void
	(e: 'node-start-three-preview', nodeId: string): void
	(e: 'node-three-preview-ready', nodeId: string): void
	(e: 'node-three-preview-error', nodeId: string): void
	(
		e: 'node-three-preview-progress',
		payload: { nodeId: string; progress?: number; label?: string }
	): void
	(
		e: 'node-upload-scene-layout-model-file',
		payload: { nodeId: string; file: File; objectId?: string }
	): void
	(e: 'node-update-model-bindings', payload: { nodeId: string; bindings: any[] }): void
	(e: 'node-export-unreal-scene', nodeId: string): void
	(e: 'node-export-unreal-lighting', nodeId: string): void
	(e: 'node-disconnect-unreal', nodeId: string): void
	(e: 'node-set-asset-root-path', payload: { nodeId: string; path: string }): void
	(e: 'node-update-poster', payload: { nodeId: string; posterDataUrl: string }): void
}>()

const props = defineProps<{
	scene: any
	showDebug?: boolean
	chatState?: NodeChatState | null
	nodeGenerationTasks?: Record<string, WorkflowNodeGenerationTask>
	nodeGenerationTaskIdsByNodeId?: Record<string, string[]>
	legacyResources?: Record<string, LegacyResourceData>
	inputParamPreviewRefsByNodeId?: Record<string, any[]>
	editingNodeId?: string | null
	extraPropsResolver?: (nodeData: any) => Record<string, unknown>
	forceDomNodeIds?: string[]
}>()

const overlayRef = ref<HTMLDivElement | null>(null)
const transformLayerRef = ref<HTMLDivElement | null>(null)

const legacyResourcesResolved = computed<Record<string, LegacyResourceData>>(() => {
	if (props.legacyResources) return props.legacyResources
	if (!props.scene) return {}
	return props.scene.legacyResources || {}
})

const inputParamPreviewRefsResolved = computed<Record<string, any[]>>(() => {
	if (props.inputParamPreviewRefsByNodeId) return props.inputParamPreviewRefsByNodeId
	if (!props.scene) return {}
	return (props.scene as any)._inputParamPreviewRefsByNodeId || {}
})

function canUseBusinessComponent(nodeType: string): boolean {
	return NodeComponentResolver.hasComponent(nodeType)
}

function onBusinessUpdateText(payload: { nodeId: string; textValue: string }) {
	if (!props.scene) return
	const node = prevDomMap.get(payload.nodeId)
	if (!node) return

	const oldText = lastKnownText.get(payload.nodeId) ?? (node.data as any).textValue ?? ''
	const newText = payload.textValue

	if (oldText === newText) return

	lastKnownText.set(payload.nodeId, newText)

	const cmd = new UpdateNodeTextCommand(props.scene, payload.nodeId, oldText, newText)
	props.scene.executeCommand(cmd)
	props.scene.updateAllConnectionEndpoints()
	props.scene.requestRedraw()
	emit('node-update-text', payload)
}

function onBusinessResize(payload: {
	nodeId: string
	width: number
	height: number
	worldX: number
	worldY: number
}) {
	if (!props.scene) return
	const node = prevDomMap.get(payload.nodeId)
	if (!node) return
	const s = props.scene
	const startX = node.data.worldX
	const startY = node.data.worldY
	const startWidth = node.data.width
	const startHeight = node.data.height
	const endX = payload.worldX
	const endY = payload.worldY
	const endWidth = payload.width
	const endHeight = payload.height
	if (startX === endX && startY === endY && startWidth === endWidth && startHeight === endHeight)
		return
	s.executeCommand(
		new ResizeNodeCommand(
			s,
			node,
			startX,
			startY,
			startWidth,
			startHeight,
			endX,
			endY,
			endWidth,
			endHeight
		)
	)
	s.updateAllConnectionEndpoints()
	s.requestRedraw()
}

function onBusinessAutoResize(payload: { nodeId: string; height: number }) {
	if (!props.scene) return
	const node = prevDomMap.get(payload.nodeId)
	if (!node) return
	if (node.data.sizeCustomized) return
	const s = props.scene
	const newHeight = payload.height
	if (Math.abs(newHeight - node.data.height) < 2) return
	node.updateSize(node.data.width, newHeight)
	s.updateAllConnectionEndpoints()
	s.requestRedraw()
}

function onBusinessStartLink(payload: {
	nodeId: string
	anchorId: string
	anchorIndex: number
	event: PointerEvent
}) {
	emit('node-start-link', payload)
}

function onBusinessEndLink(payload: { nodeId: string; anchorId: string; anchorIndex: number }) {
	emit('node-end-link', payload)
}

function handleBusinessEdit(nodeId: string) {
	emit('node-click', nodeId, new MouseEvent('click'))
}

function handleBusinessContextMenu(payload: { nodeId: string; x: number; y: number }) {
	emit(
		'node-contextmenu',
		payload.nodeId,
		new MouseEvent('contextmenu', { clientX: payload.x, clientY: payload.y })
	)
}

function onBusinessSelect(nodeId: string) {
	emit('node-select', nodeId)
}

function onDomNodeSelect(nodeId: string, event: PointerEvent) {
	const s = props.scene
	if (!s) return
	if (event.shiftKey || event.ctrlKey || event.metaKey) {
		s.selection.toggleSelect(s.getBlueprintNode(nodeId)!)
	} else if (!s.selection.isSelected(s.getBlueprintNode(nodeId)!)) {
		s.selection.setSelection([nodeId])
	}
	s.requestRedraw()
}

function onBusinessCopy(nodeId: string) {
	emit('node-copy', nodeId)
}

function onBusinessDelete(nodeId: string) {
	emit('node-delete', nodeId)
}

function onBusinessRefresh(nodeId: string) {
	emit('node-refresh', nodeId)
}

function saveChatStateForNode(nodeId: string) {
	if (!props.scene || !props.chatState) return
	if (props.chatState.nodeId !== nodeId) return
	saveChatStateToNode(
		nodeId,
		props.chatState.draft ?? '',
		props.chatState.params ?? {},
		normalizeRefsForStorage(props.chatState.selectedRefs ?? []) as unknown as any[]
	)
}

function onBusinessChatSubmit(payload: WorkflowNodeChatSubmitPayload) {
	if (props.chatState && props.chatState.nodeId) {
		saveChatStateToNode(
			props.chatState.nodeId,
			props.chatState.draft ?? '',
			props.chatState.params ?? {},
			normalizeRefsForStorage(props.chatState.selectedRefs ?? []) as unknown as any[]
		)
	}
	emit('node-chat-submit', payload)
}

function onBusinessChatClose(nodeId: string) {
	saveChatStateForNode(nodeId)

	if (props.scene) {
		const node = props.scene.getBlueprintNode?.(nodeId)
		if (node) {
			const oldVisible = !!(node.data as any).nodeChatVisible
			if (oldVisible) {
				const cmd = new SetNodeChatVisibleCommand(props.scene, nodeId, oldVisible, false)
				props.scene.executeCommand(cmd)
			}
		}
	}

	emit('node-chat-close', nodeId)
}

function onBusinessChatUpdateDraft(payload: { nodeId: string; draft: string }) {
	emit('node-chat-update-draft', payload)
}

function onBusinessChatUpdateParams(payload: { nodeId: string; params: Record<string, any> }) {
	emit('node-chat-update-params', payload)
}

function onBusinessChatUpdateSelectedRefs(payload: { nodeId: string; selectedRefs: any[] }) {
	emit('node-chat-update-selected-refs', payload)
}

function onBusinessChatRemoveParamRef(payload: { nodeId: string; refItem: any }) {
	emit('node-chat-remove-param-ref', payload)
}

function onBusinessChatStop(nodeId: string) {
	emit('node-chat-stop', nodeId)
}

function onBusinessPreviewRequest(payload: { nodeId: string; imageUrl: string }) {
	emit('node-preview-request', payload)
}

function onBusinessClearResource(nodeId: string) {
	emit('node-clear-resource', nodeId)
}

function onBusinessUploadResource(payload: { nodeId: string; file: File; kind: string }) {
	emit('node-upload-resource', payload)
}

function onBusinessUpdateImageSettings(payload: { nodeId: string; patch: Record<string, any> }) {
	emit('node-update-image-settings', payload)
}

function onBusinessMediaReady(nodeId: string) {
	emit('node-media-ready', nodeId)
}

function onBusinessInvalidateScreenshot(nodeId: string) {
	emit('node-invalidate-screenshot', nodeId)
}

function onBusinessUpdatePoster(payload: { nodeId: string; posterDataUrl: string }) {
	emit('node-update-poster', payload)
}

function onBusinessPreviewContextMenu(payload: {
	nodeId: string
	clientX: number
	clientY: number
}) {
	emit('node-preview-contextmenu', payload)
}

function onBusinessScreenshot(payload: {
	nodeId: string
	dataUrl: string
	width: number
	height: number
	time: number
}) {
	emit('node-screenshot', payload)
}

function onBusinessSetType(payload: { nodeId: string; type: string }) {
	emit('node-set-type', payload)
}

function onBusinessUpdateSceneUnderstandingSettings(payload: {
	nodeId: string
	patch: Record<string, any>
}) {
	emit('node-update-scene-understanding-settings', payload)
}

function onBusinessRequestSceneModels(nodeId: string) {
	emit('node-request-scene-models', nodeId)
}

function onBusinessRunSceneUnderstanding(nodeId: string) {
	emit('node-run-scene-understanding', nodeId)
}

function onBusinessCancelSceneUnderstanding(nodeId: string) {
	emit('node-cancel-scene-understanding', nodeId)
}

function onBusinessRunSceneDecompose(nodeId: string) {
	emit('node-run-scene-decompose', nodeId)
}

function onBusinessRunSceneLayout(nodeId: string) {
	console.info(
		'【SCENE-LAYOUT-CHAIN】② BlueprintDomOverlay.onBusinessRunSceneLayout called, nodeId:',
		nodeId
	)
	emit('node-run-scene-layout', nodeId)
	console.info(
		'【SCENE-LAYOUT-CHAIN】② BlueprintDomOverlay emitted node-run-scene-layout with nodeId:',
		nodeId
	)
}

function onBusinessUpdatePreviewMode(payload: { nodeId: string; previewMode: boolean }) {
	emit('node-update-preview-mode', payload)
}

function onBusinessUpdateLayoutItems(payload: { nodeId: string; items: any[] }) {
	emit('node-update-layout-items', payload)
}

function onBusinessUpdateSelectedLayoutItem(payload: { nodeId: string; itemId: string }) {
	emit('node-update-selected-layout-item', payload)
}

function onBusinessUpdateHidePlaceholderCubes(payload: { nodeId: string; hide: boolean }) {
	emit('node-update-hide-placeholder-cubes', payload)
}

function onBusinessUpdateLightingPreview(payload: { nodeId: string; enabled: boolean }) {
	emit('node-update-lighting-preview', payload)
}

function onBusinessUpdateLightingDebug(payload: { nodeId: string; enabled: boolean }) {
	emit('node-update-lighting-debug', payload)
}

function onBusinessUpdateLightingControls(payload: {
	nodeId: string
	controls: Record<string, any>
}) {
	emit('node-update-lighting-controls', payload)
}

function onBusinessSetSelectedPlaceholderOutput(payload: { nodeId: string; selectedId: string }) {
	emit('node-set-selected-placeholder-output', payload)
}

function onBusinessClearSceneLayoutModelBinding(payload: { nodeId: string; objectId: string }) {
	emit('node-clear-scene-layout-model-binding', payload)
}

function onBusinessStartThreePreview(nodeId: string) {
	emit('node-start-three-preview', nodeId)
}

function onBusinessThreePreviewReady(nodeId: string) {
	emit('node-three-preview-ready', nodeId)
}

function onBusinessThreePreviewError(nodeId: string) {
	emit('node-three-preview-error', nodeId)
}

function onBusinessThreePreviewProgress(payload: {
	nodeId: string
	progress?: number
	label?: string
}) {
	emit('node-three-preview-progress', payload)
}

function onBusinessUploadSceneLayoutModelFile(payload: {
	nodeId: string
	file: File
	objectId?: string
}) {
	emit('node-upload-scene-layout-model-file', payload)
}

function onBusinessUpdateModelBindings(payload: { nodeId: string; bindings: any[] }) {
	emit('node-update-model-bindings', payload)
}

function onBusinessExportUnrealScene(nodeId: string) {
	emit('node-export-unreal-scene', nodeId)
}

function onBusinessExportUnrealLighting(nodeId: string) {
	emit('node-export-unreal-lighting', nodeId)
}

function onBusinessDisconnectUnreal(nodeId: string) {
	emit('node-disconnect-unreal', nodeId)
}

function onBusinessSetAssetRootPath(payload: { nodeId: string; path: string }) {
	emit('node-set-asset-root-path', payload)
}

const viewportSize = ref({ width: 800, height: 600 })
const cameraState = ref({ x: 0, y: 0, zoom: 1 })
const domNodeRenders = ref<DomNodeRenderData[]>([])

let rafId: number | null = null
let resizeObserver: ResizeObserver | null = null
const prevDomMap = new Map<string, BlueprintNode>()
const lastKnownText = new Map<string, string>()
const lastValidChatStatePerNode = new Map<
	string,
	{
		draft: string
		params: Record<string, any>
		selectedRefs: any[]
	}
>()

watch(
	() => [props.chatState?.visible, props.chatState?.nodeId, props.chatState?.draft] as const,
	() => {
		if (props.chatState?.visible && props.chatState?.nodeId) {
			lastValidChatStatePerNode.set(props.chatState.nodeId, {
				draft: props.chatState.draft ?? '',
				params: { ...(props.chatState.params ?? {}) },
				selectedRefs: normalizeRefsForStorage(props.chatState.selectedRefs ?? []) as unknown as any[]
			})
		}
	},
	{ immediate: true, deep: true }
)

const isDragging = ref(false)
const isConnecting = ref(false)
const isInteractionLocked = ref(false)
let interactionLockedNodeIds: Set<string> = new Set()
let dragNodeId: string | null = null
let dragStartClientX = 0
let dragStartClientY = 0
let dragStartWorldX = 0
let dragStartWorldY = 0
let dragStartPositions = new Map<string, Vector2>()
let dragCurrentPositions = new Map<string, Vector2>()

let connectFromNode: BlueprintNode | null = null
let connectFromPort: Port | null = null

let isResizing = false
let resizeNodeId: string | null = null
let resizeCorner: string | null = null
let resizeStartClientX = 0
let resizeStartClientY = 0
let resizeStartWorldX = 0
let resizeStartWorldY = 0
let resizeStartWidth = 0
let resizeStartHeight = 0
let resizeStartNodeX = 0
let resizeStartNodeY = 0
let resizeAspectRatio: number | null = null
const MIN_NODE_WIDTH_LOCAL = 120
const MIN_NODE_HEIGHT_LOCAL = 80

function findPortUnderPointer(
	clientX: number,
	clientY: number
): { node: BlueprintNode; port: Port; isInput: boolean } | null {
	const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
	if (!el) return null
	const portEl = el.closest('.dnw-port') as HTMLElement | null
	if (!portEl) return null
	const nodeWrapperEl = portEl.closest('.dom-node-wrapper') as HTMLElement | null
	if (!nodeWrapperEl) return null
	const nodeId = nodeWrapperEl.getAttribute('data-node-id')
	const portId = portEl.getAttribute('data-port-id')
	const isInput = portEl.classList.contains('dnw-port-input')
	if (!nodeId || !portId) return null
	const node = props.scene?.getBlueprintNode?.(nodeId)
	if (!node) return null
	const port = isInput ? node.getInputPort(portId) : node.getOutputPort(portId)
	if (!port) return null
	return { node, port, isInput }
}

function onPortPointerDown(nodeId: string, portId: string, isInput: boolean, event: PointerEvent) {
	if (!props.scene || event.button !== 0) return
	const s = props.scene
	const node = s.getBlueprintNode?.(nodeId)
	if (!node) return
	const port = isInput ? node.getInputPort(portId) : node.getOutputPort(portId)
	if (!port) return

	if (isInput) {
		return
	}

	connectFromNode = node
	connectFromPort = port
	isConnecting.value = true
	isInteractionLocked.value = true
	interactionLockedNodeIds.add(node.id)
	const worldPos = getWorldPosFromClient(event.clientX, event.clientY)
	s.startPendingConnection(node, port, new Vector2(worldPos.x, worldPos.y))
	event.stopPropagation()
	event.preventDefault()
	window.addEventListener('pointermove', onPortPointerMove)
	window.addEventListener('pointerup', onPortPointerUp)
	window.addEventListener('pointercancel', onPortPointerUp)
	s.requestRedraw()
}

function onPortPointerMove(event: PointerEvent) {
	if (!props.scene || !isConnecting.value || !connectFromPort) return
	const s = props.scene
	const worldPos = getWorldPosFromClient(event.clientX, event.clientY)
	const hit = findPortUnderPointer(event.clientX, event.clientY)
	let compatible: boolean | null = null
	if (hit && hit.isInput && hit.node !== connectFromNode && connectFromPort) {
		compatible = s.isPortCompatible(connectFromPort, hit.port)
	} else if (hit) {
		compatible = false
	}
	s.updatePendingConnection(new Vector2(worldPos.x, worldPos.y), null, compatible)

	for (const node of s.getAllBlueprintNodes()) {
		for (const p of [...node.inputPorts, ...node.outputPorts]) {
			if (hit && p === hit.port) {
				p.setSnapped(true, compatible)
			} else {
				p.setSnapped(false, null)
			}
		}
	}
	s.requestRedraw()
}

function onPortPointerUp(event: PointerEvent) {
	if (!props.scene || !isConnecting.value) return
	const s = props.scene

	window.removeEventListener('pointermove', onPortPointerMove)
	window.removeEventListener('pointerup', onPortPointerUp)
	window.removeEventListener('pointercancel', onPortPointerUp)

	isConnecting.value = false
	isInteractionLocked.value = false
	interactionLockedNodeIds.clear()
	s.isDomInteractionLocked = false

	let completed = false
	const hit = findPortUnderPointer(event.clientX, event.clientY)

	if (hit && connectFromPort && connectFromNode) {
		const connData = s.completePendingConnection(hit.node, hit.port)
		if (connData) {
			s.executeCommand(new CreateConnectionCommand(s, connData))
			completed = true
		}
	}

	if (!completed && connectFromNode && connectFromPort) {
		const worldPos = getWorldPosFromClient(event.clientX, event.clientY)
		s.on.emit('link-drop-on-canvas', {
			clientX: event.clientX,
			clientY: event.clientY,
			worldX: worldPos.x,
			worldY: worldPos.y,
			fromNodeId: connectFromNode.id,
			fromAnchorId: connectFromPort.spec.id
		})
		s.cancelPendingConnection()
	} else if (!completed) {
		s.cancelPendingConnection()
	}

	connectFromNode = null
	connectFromPort = null
	s.requestRedraw()
}

function getWorldPosFromClient(clientX: number, clientY: number): { x: number; y: number } {
	if (!props.scene || !overlayRef.value) return { x: 0, y: 0 }
	const rect = overlayRef.value.getBoundingClientRect()
	const cam = props.scene.camera
	const screenX = clientX - rect.left
	const screenY = clientY - rect.top
	const worldX = (screenX - rect.width / 2) / cam.zoom + cam.position.x
	const worldY = (screenY - rect.height / 2) / cam.zoom + cam.position.y
	return { x: worldX, y: worldY }
}

function cleanupInteractionStates() {
	window.removeEventListener('pointermove', onDomNodeDragMove)
	window.removeEventListener('pointerup', onDomNodeDragEnd)
	window.removeEventListener('pointercancel', onDomNodeDragEnd)
	window.removeEventListener('pointermove', onPortPointerMove)
	window.removeEventListener('pointerup', onPortPointerUp)
	window.removeEventListener('pointercancel', onPortPointerUp)
	window.removeEventListener('pointermove', onDomNodeResizeMove)
	window.removeEventListener('pointerup', onDomNodeResizeEnd)
	window.removeEventListener('pointercancel', onDomNodeResizeEnd)

	isDragging.value = false
	isConnecting.value = false
	isResizing = false
	isInteractionLocked.value = false
	interactionLockedNodeIds.clear()
	if (props.scene) props.scene.isDomInteractionLocked = false
	dragNodeId = null
	dragStartPositions.clear()
	dragCurrentPositions.clear()
	connectFromNode = null
	connectFromPort = null
	resizeNodeId = null
	resizeCorner = null
	resizeAspectRatio = null
}

function onDomNodeResizeStart(nodeId: string, corner: string, event: PointerEvent) {
	if (!props.scene) return
	event.stopPropagation()
	event.preventDefault()

	console.log('[BlueprintDomOverlay] onDomNodeResizeStart', { nodeId, corner })

	saveChatStateForNode(nodeId)

	const s = props.scene
	const node = prevDomMap.get(nodeId)
	if (!node) {
		console.warn('[BlueprintDomOverlay] resize start: node not found in prevDomMap', nodeId)
		return
	}

	resizeNodeId = nodeId
	resizeCorner = corner
	resizeStartClientX = event.clientX
	resizeStartClientY = event.clientY
	const worldPos = getWorldPosFromClient(event.clientX, event.clientY)
	resizeStartWorldX = worldPos.x
	resizeStartWorldY = worldPos.y
	resizeStartWidth = node.data.width
	resizeStartHeight = node.data.height
	resizeStartNodeX = node.transform.position.x
	resizeStartNodeY = node.transform.position.y
	resizeAspectRatio = node.getResizeAspectRatio()

	isResizing = true
	isInteractionLocked.value = true
	interactionLockedNodeIds.clear()
	interactionLockedNodeIds.add(nodeId)

	window.addEventListener('pointermove', onDomNodeResizeMove)
	window.addEventListener('pointerup', onDomNodeResizeEnd)
	window.addEventListener('pointercancel', onDomNodeResizeEnd)
}

function onDomNodeResizeMove(event: PointerEvent) {
	if (!props.scene || !isResizing || !resizeNodeId || !resizeCorner) return
	const s = props.scene
	const node = s.getBlueprintNode(resizeNodeId)
	if (!node) return

	const worldPos = getWorldPosFromClient(event.clientX, event.clientY)
	const dx = worldPos.x - resizeStartWorldX
	const dy = worldPos.y - resizeStartWorldY

	let newX = resizeStartNodeX
	let newY = resizeStartNodeY
	let newWidth = resizeStartWidth
	let newHeight = resizeStartHeight

	const ratio = resizeAspectRatio

	switch (resizeCorner) {
		case 'se': {
			newWidth = Math.max(MIN_NODE_WIDTH_LOCAL, resizeStartWidth + dx)
			newHeight = Math.max(MIN_NODE_HEIGHT_LOCAL, resizeStartHeight + dy)
			if (ratio) {
				const currentRatio = newWidth / newHeight
				if (currentRatio > ratio) {
					newHeight = newWidth / ratio
					newHeight = Math.max(MIN_NODE_HEIGHT_LOCAL, newHeight)
				} else {
					newWidth = newHeight * ratio
					newWidth = Math.max(MIN_NODE_WIDTH_LOCAL, newWidth)
				}
			}
			break
		}
		case 'sw': {
			newWidth = Math.max(MIN_NODE_WIDTH_LOCAL, resizeStartWidth - dx)
			newHeight = Math.max(MIN_NODE_HEIGHT_LOCAL, resizeStartHeight + dy)
			if (ratio) {
				const currentRatio = newWidth / newHeight
				if (currentRatio > ratio) {
					newHeight = newWidth / ratio
					newHeight = Math.max(MIN_NODE_HEIGHT_LOCAL, newHeight)
				} else {
					newWidth = newHeight * ratio
					newWidth = Math.max(MIN_NODE_WIDTH_LOCAL, newWidth)
				}
			}
			newX = resizeStartNodeX + (resizeStartWidth - newWidth)
			break
		}
		case 'ne': {
			newWidth = Math.max(MIN_NODE_WIDTH_LOCAL, resizeStartWidth + dx)
			newHeight = Math.max(MIN_NODE_HEIGHT_LOCAL, resizeStartHeight - dy)
			if (ratio) {
				const currentRatio = newWidth / newHeight
				if (currentRatio > ratio) {
					newHeight = newWidth / ratio
					newHeight = Math.max(MIN_NODE_HEIGHT_LOCAL, newHeight)
				} else {
					newWidth = newHeight * ratio
					newWidth = Math.max(MIN_NODE_WIDTH_LOCAL, newWidth)
				}
			}
			newY = resizeStartNodeY + (resizeStartHeight - newHeight)
			break
		}
		case 'nw': {
			newWidth = Math.max(MIN_NODE_WIDTH_LOCAL, resizeStartWidth - dx)
			newHeight = Math.max(MIN_NODE_HEIGHT_LOCAL, resizeStartHeight - dy)
			if (ratio) {
				const currentRatio = newWidth / newHeight
				if (currentRatio > ratio) {
					newHeight = newWidth / ratio
					newHeight = Math.max(MIN_NODE_HEIGHT_LOCAL, newHeight)
				} else {
					newWidth = newHeight * ratio
					newWidth = Math.max(MIN_NODE_WIDTH_LOCAL, newWidth)
				}
			}
			newX = resizeStartNodeX + (resizeStartWidth - newWidth)
			newY = resizeStartNodeY + (resizeStartHeight - newHeight)
			break
		}
	}

	node.setPosition(newX, newY)
	node.updateSize(newWidth, newHeight)
	node.data.sizeCustomized = true

	s.updateAllConnectionEndpoints()
	s.requestRedraw()
}

function onDomNodeResizeEnd() {
	if (!props.scene) return
	const s = props.scene

	console.log('[BlueprintDomOverlay] onDomNodeResizeEnd', { isResizing, resizeNodeId })

	window.removeEventListener('pointermove', onDomNodeResizeMove)
	window.removeEventListener('pointerup', onDomNodeResizeEnd)
	window.removeEventListener('pointercancel', onDomNodeResizeEnd)

	if (isResizing && resizeNodeId) {
		const node = s.getBlueprintNode(resizeNodeId)
		if (node) {
			const endX = node.transform.position.x
			const endY = node.transform.position.y
			const endWidth = node.data.width
			const endHeight = node.data.height
			const moved =
				Math.abs(endX - resizeStartNodeX) > 0.5 ||
				Math.abs(endY - resizeStartNodeY) > 0.5 ||
				Math.abs(endWidth - resizeStartWidth) > 0.5 ||
				Math.abs(endHeight - resizeStartHeight) > 0.5
			isInteractionLocked.value = false
			interactionLockedNodeIds.clear()
			s.isDomInteractionLocked = false
			if (moved) {
				s.executeCommand(
					new ResizeNodeCommand(
						s,
						node,
						resizeStartNodeX,
						resizeStartNodeY,
						resizeStartWidth,
						resizeStartHeight,
						endX,
						endY,
						endWidth,
						endHeight
					)
				)
				s.updateAllConnectionEndpoints()
			}
			console.log('[BlueprintDomOverlay] resize completed', {
				nodeId: resizeNodeId,
				moved,
				endSize: { width: endWidth, height: endHeight },
				nodeChatVisible: (node.data as any).nodeChatVisible
			})
		}
	} else {
		isInteractionLocked.value = false
		interactionLockedNodeIds.clear()
		if (s) s.isDomInteractionLocked = false
	}

	isResizing = false
	resizeNodeId = null
	resizeCorner = null
	s.requestRedraw()
}

function onDomNodeDragStart(nodeId: string, event: PointerEvent) {
	if (!props.scene) return
	if (event.button !== 0) return
	const s = props.scene
	const node = prevDomMap.get(nodeId)
	if (!node) return

	event.stopPropagation()
	event.preventDefault()

	const selectedNodes =
		(s.selection
			?.getSelection?.()
			?.filter((n: any) => n instanceof BlueprintNode) as BlueprintNode[]) || []
	const isNodeSelected = selectedNodes.some((n) => n.id === nodeId)

	if (!isNodeSelected) {
		s.selection.setSelection([nodeId])
		s.requestRedraw()
	}

	dragNodeId = nodeId
	dragStartClientX = event.clientX
	dragStartClientY = event.clientY
	const worldPos = getWorldPosFromClient(event.clientX, event.clientY)
	dragStartWorldX = worldPos.x
	dragStartWorldY = worldPos.y

	dragStartPositions.clear()
	dragCurrentPositions.clear()
	const nodesToDrag = isNodeSelected ? selectedNodes : [node]
	interactionLockedNodeIds.clear()
	for (const n of nodesToDrag) {
		dragStartPositions.set(n.id, new Vector2(n.transform.position.x, n.transform.position.y))
		dragCurrentPositions.set(n.id, new Vector2(n.transform.position.x, n.transform.position.y))
		interactionLockedNodeIds.add(n.id)
	}

	isDragging.value = true
	isInteractionLocked.value = true

	window.addEventListener('pointermove', onDomNodeDragMove)
	window.addEventListener('pointerup', onDomNodeDragEnd)
	window.addEventListener('pointercancel', onDomNodeDragEnd)
}

function onDomNodeDragMove(event: PointerEvent) {
	if (!props.scene || !isDragging.value) return
	const s = props.scene

	const worldPos = getWorldPosFromClient(event.clientX, event.clientY)
	const dx = worldPos.x - dragStartWorldX
	const dy = worldPos.y - dragStartWorldY

	for (const [nodeId, startPos] of dragStartPositions) {
		const node = s.getBlueprintNode(nodeId)
		if (node) {
			const newX = startPos.x + dx
			const newY = startPos.y + dy
			node.setPosition(newX, newY)
			dragCurrentPositions.set(nodeId, new Vector2(newX, newY))
		}
	}

	s.updateAllConnectionEndpoints()
	s.requestRedraw()
}

function onDomNodeDragEnd() {
	if (!props.scene) return
	const s = props.scene

	window.removeEventListener('pointermove', onDomNodeDragMove)
	window.removeEventListener('pointerup', onDomNodeDragEnd)
	window.removeEventListener('pointercancel', onDomNodeDragEnd)

	if (dragStartPositions.size > 0 && dragCurrentPositions.size > 0) {
		let moved = false
		for (const [nodeId, startPos] of dragStartPositions) {
			const curPos = dragCurrentPositions.get(nodeId)
			if (
				curPos &&
				(Math.abs(curPos.x - startPos.x) > 0.5 || Math.abs(curPos.y - startPos.y) > 0.5)
			) {
				moved = true
				break
			}
		}

		isDragging.value = false
		isInteractionLocked.value = false
		interactionLockedNodeIds.clear()
		s.isDomInteractionLocked = false

		if (moved) {
			const moveFn = (id: string, pos: Vector2) => {
				const node = s.getBlueprintNode(id)
				if (node) {
					node.setPosition(pos.x, pos.y)
				}
			}
			s.executeCommand(new MoveNodeCommand(dragStartPositions, dragCurrentPositions, moveFn))
			s.updateAllConnectionEndpoints()
			s.requestRedraw()
		}
	} else {
		isDragging.value = false
		isInteractionLocked.value = false
		interactionLockedNodeIds.clear()
		s.isDomInteractionLocked = false
	}

	dragNodeId = null
	dragStartPositions.clear()
	dragCurrentPositions.clear()
	s.requestRedraw()
}

const overlayStyle = computed(() => ({
	position: 'absolute' as const,
	left: '0',
	top: '0',
	width: '100%',
	height: '100%',
	pointerEvents: 'none' as const,
	zIndex: 10,
	overflow: 'visible' as const
}))

const transformLayerStyle = computed(() => {
	const { width, height } = viewportSize.value
	const { x, y, zoom } = cameraState.value
	return {
		position: 'absolute' as const,
		left: '0',
		top: '0',
		width: '0',
		height: '0',
		transformOrigin: '0 0',
		transform: `translate(${width / 2}px, ${height / 2}px) scale(${zoom}) translate(${-x}px, ${-y}px)`,
		willChange: 'transform',
		overflow: 'visible' as const
	}
})

function getNodeStatus(node: BlueprintNode): NodeStatus {
	const dataStatus = (node.data as any)?.status
	if (dataStatus === 'running' || dataStatus === 'success' || dataStatus === 'error') {
		return dataStatus
	}
	if (props.nodeGenerationTasks) {
		const nodeId = node.id
		const tasks = Object.values(props.nodeGenerationTasks).filter((t) => t.nodeId === nodeId)
		if (tasks.length > 0) {
			// 优先检查活跃任务
			const activeTask = tasks.find((t) => t.status === 'submitting' || t.status === 'running')
			if (activeTask) return 'running'
			// 没有活跃任务，取最新已结束任务
			const taskIds = props.nodeGenerationTaskIdsByNodeId?.[nodeId]
			let latestFinishedTask: WorkflowNodeGenerationTask | undefined
			if (taskIds && taskIds.length > 0) {
				for (const tid of taskIds) {
					const t = props.nodeGenerationTasks[tid]
					if (t && (t.status === 'error' || t.status === 'completed')) {
						latestFinishedTask = t
						break
					}
				}
			}
			if (!latestFinishedTask) {
				latestFinishedTask = [...tasks]
					.filter((t) => t.status === 'error' || t.status === 'completed')
					.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0]
			}
			if (latestFinishedTask) {
				if (latestFinishedTask.status === 'error') return 'error'
				if (latestFinishedTask.status === 'completed') return 'success'
			}
		}
	}
	return 'idle'
}

function isNodeTaskSubmitting(nodeId: string): boolean {
	if (!props.nodeGenerationTasks) return false
	const tasks = Object.values(props.nodeGenerationTasks).filter((t) => t.nodeId === nodeId)
	return tasks.some((t) => t.status === 'submitting' || t.status === 'running')
}

function getNodeAccentColor(node: BlueprintNode): string {
	const type = node.nodeType
	const mediaColors: Record<string, string> = {
		image: '#9b59b6',
		'rotate-image': '#9b59b6',
		video: '#27ae60',
		text: '#f1c40f',
		'text-merge': '#f1c40f',
		model3d: '#3498db',
		'meshy-model': '#3498db',
		'scene-understanding': '#1f9d84',
		'scene-layout': '#1f9d84',
		'scene-decompose': '#1f9d84',
		story: '#e67e22',
		comfyui: '#9b59b6',
		blender: '#e67e22',
		'unreal-export': '#3498db'
	}
	return mediaColors[type] || '#1f9d84'
}

function syncCamera() {
	if (!props.scene) return
	const cam = props.scene.camera
	cameraState.value = {
		x: cam.position.x,
		y: cam.position.y,
		zoom: cam.zoom
	}
	viewportSize.value = {
		width: cam.viewport.width,
		height: cam.viewport.height
	}
}

function extractPortData(ports: any[], nodeWorldX: number, nodeWorldY: number): PortRenderData[] {
	return ports.map((p: any) => {
		const wp = p.getWorldPosition()
		return {
			id: p.spec.id,
			label: p.spec?.label,
			offsetY: wp.y - nodeWorldY,
			mediaType: p.spec?.mediaType || 'generic'
		}
	})
}

function syncDomNodes() {
	if (!props.scene) return
	const s = props.scene
	const currentLegacyResources = s.legacyResources || {}
	const editingId = props.editingNodeId

	const newRenders: DomNodeRenderData[] = []
	const currentMap = new Map<string, BlueprintNode>()

	const isEngineDragging = s.isEngineDragging
	const isDomInteracting = isInteractionLocked.value

	let nodesToRender: BlueprintNode[]
	if (isEngineDragging) {
		nodesToRender = []
	} else if (isDomInteracting) {
		nodesToRender = []
		for (const nodeId of interactionLockedNodeIds) {
			const node = s.getBlueprintNode(nodeId)
			if (node) {
				nodesToRender.push(node)
			}
		}
	} else {
		nodesToRender = []
		if (editingId) {
			const editingNode = s.getBlueprintNode(editingId)
			if (editingNode) nodesToRender.push(editingNode)
		}
		if (props.chatState?.visible && props.chatState?.nodeId) {
			const chatNode = s.getBlueprintNode(props.chatState.nodeId)
			if (chatNode && !nodesToRender.some((n) => n.id === chatNode.id)) {
				nodesToRender.push(chatNode)
			}
		}
		// 强制渲染指定节点（用于需要节点DOM存在的场景，如Unreal导出需要Three.js预览）
		if (Array.isArray(props.forceDomNodeIds) && props.forceDomNodeIds.length > 0) {
			for (const forceId of props.forceDomNodeIds) {
				const normalizedId = String(forceId ?? '').trim()
				if (!normalizedId) continue
				if (nodesToRender.some((n) => n.id === normalizedId)) continue
				const forceNode = s.getBlueprintNode(normalizedId)
				if (forceNode) {
					nodesToRender.push(forceNode)
				}
			}
		}
	}

	if (isDomInteracting) {
		console.log('[BlueprintDomOverlay] syncDomNodes during interaction', {
			isResizing,
			resizeNodeId,
			isConnecting: isConnecting.value,
			isDragging: isDragging.value,
			nodesToRender: nodesToRender.map((n) => n.id),
			chatStateNodeId: props.chatState?.nodeId,
			chatStateVisible: props.chatState?.visible,
			editingId,
			interactionLockedNodeIds: Array.from(interactionLockedNodeIds)
		})
	}

	const selectedNodeIds = new Set((s.selection?.getSelection?.() || []).map((n: any) => n.id))

	for (const node of nodesToRender) {
		currentMap.set(node.id, node)
		const wb = node.getWorldBounds()
		newRenders.push({
			nodeId: node.id,
			nodeType: node.nodeType,
			title: node.alias || node.title,
			x: wb.x,
			y: wb.y,
			width: wb.width,
			height: wb.height,
			// 关键修复：根据实际选中状态设置，而不是全部设为true
			selected: selectedNodeIds.has(node.id),
			accentColor: getNodeAccentColor(node),
			status: getNodeStatus(node),
			inputPorts: extractPortData(node.inputPorts, wb.x, wb.y),
			outputPorts: extractPortData(node.outputPorts, wb.x, wb.y),
			node: node
		})
		if (!lastKnownText.has(node.id)) {
			lastKnownText.set(node.id, (node.data as any).textValue ?? '')
		}
	}

	for (const [id, node] of prevDomMap) {
		if (!currentMap.has(id)) {
			node.setDomMode(false)
			lastKnownText.delete(id)
		}
	}
	for (const [id, node] of currentMap) {
		if (!prevDomMap.has(id)) {
			node.setDomMode(true)
		}
	}

	prevDomMap.clear()
	currentMap.forEach((node, id) => prevDomMap.set(id, node))
	domNodeRenders.value = newRenders
}

function tick() {
	syncCamera()
	syncDomNodes()
	rafId = requestAnimationFrame(tick)
}

function handleResize() {
	if (!overlayRef.value || !props.scene) return
	const rect = overlayRef.value.getBoundingClientRect()
	if (rect.width > 0 && rect.height > 0) {
		props.scene.camera.setViewport(new Rect(0, 0, rect.width, rect.height))
	}
}

onMounted(() => {
	if (props.scene) {
		handleResize()
		syncCamera()
		syncDomNodes()
	}
	rafId = requestAnimationFrame(tick)

	if (overlayRef.value) {
		resizeObserver = new ResizeObserver(() => {
			handleResize()
		})
		resizeObserver.observe(overlayRef.value)
	}
})

onUnmounted(() => {
	if (rafId !== null) {
		cancelAnimationFrame(rafId)
		rafId = null
	}
	if (resizeObserver) {
		resizeObserver.disconnect()
		resizeObserver = null
	}
	cleanupInteractionStates()
	if (props.scene) {
		for (const [, node] of prevDomMap) {
			node.setDomMode(false)
		}
		prevDomMap.clear()
	}
})

watch(
	() => props.scene,
	(newScene) => {
		if (newScene) {
			handleResize()
			syncCamera()
			syncDomNodes()
		}
	},
	{ immediate: true }
)

watch(isInteractionLocked, (locked, wasLocked) => {
	if (props.scene) {
		props.scene.isDomInteractionLocked = locked
	}
	if (wasLocked && !locked) {
		nextTick(() => emit('interaction-end'))
	}
})

watch(
	() => props.editingNodeId,
	(newId, oldId) => {
		if (oldId && !newId) {
			cleanupInteractionStates()
			if (props.scene) {
				for (const [id, node] of prevDomMap) {
					node.setDomMode(false)
				}
			}
			prevDomMap.clear()
			lastKnownText.clear()
			domNodeRenders.value = []
		}
	}
)

function saveChatStateToNode(
	nodeId: string,
	draft: string,
	params: Record<string, any>,
	selectedRefs: any[]
) {
	if (!props.scene) return
	const node = props.scene.getBlueprintNode?.(nodeId)
	if (!node) return

	const oldData = {
		draft: (node.data as any).nodeChatDraft ?? '',
		params: (node.data as any).nodeChatParams ?? {},
		selectedRefs: (node.data as any).nodeChatSelectedRefs ?? []
	}

	const newData = {
		draft: draft ?? '',
		params: params ?? {},
		selectedRefs: selectedRefs ?? []
	}

	// ========== 幂等深比较：内容一致就跳过，避免引擎命令栈膨胀 ==========
	const hasChanges =
		oldData.draft !== newData.draft ||
		!areParamsEqual(oldData.params, newData.params) ||
		!areSelectedRefsEqual(oldData.selectedRefs, newData.selectedRefs)

	if (!hasChanges) {
		return
	}

	const cmd = new UpdateNodeChatDataCommand(props.scene, nodeId, oldData, newData)
	props.scene.executeCommand(cmd)
}

const lastChatStateSnapshot = ref<{
	nodeId: string | null
	visible: boolean
	draft: string
	params: Record<string, any>
	selectedRefs: any[]
} | null>(null)

// ========== 关键修复：移除了之前每次输入都触发引擎保存的 deep watch
// 之前的实现：每次输入都触发 saveChatStateToNode → 引擎命令栈 → 重绘 → 卡顿失焦
// 新的架构：输入时只打脏标记，保存时机统一由上层（Dialog/useNodeChatDraftSave）决定
// 保存时机：Ctrl+S / blur / 关闭对话框 / 切换节点 / 提交 / 页面卸载
// chatState 的 draft/params/refs 变化时，仅同步到 lastValidChatStatePerNode 供读取，不立即写入引擎

// ========== 轻量同步：chatState 变化时只更新缓存，不立即写入引擎 ==========
// 这是之前卡顿 watch 的替代方案：把同步和写入解耦
watch(
	() => [props.chatState?.nodeId, props.chatState?.draft, props.chatState?.params, props.chatState?.selectedRefs] as const,
	([nodeId, draft, params, selectedRefs]) => {
		if (typeof nodeId !== 'string') return
		const cached = lastValidChatStatePerNode.get(nodeId) ?? {
			draft: '',
			params: {} as Record<string, any>,
			selectedRefs: [] as any[]
		}
		// 内容一致就跳过，避免引用变化触发多余更新
		if (
			cached.draft === draft &&
			areParamsEqual(cached.params, params ?? {}) &&
			areSelectedRefsEqual(cached.selectedRefs, selectedRefs ?? [])
		) {
			return
		}
		cached.draft = draft ?? ''
		cached.params = { ...(params ?? {}) }
		cached.selectedRefs = normalizeRefsForStorage(selectedRefs ?? []) as unknown as any[]
		lastValidChatStatePerNode.set(nodeId, cached)
	},
	{ deep: true }
)

watch(
	() => [props.chatState?.visible, props.chatState?.nodeId] as const,
	(current, previous) => {
		if (!props.scene) return

		const [visible, nodeId] = current
		const [prevVisible, prevNodeId] = previous ?? [false, null]

		const nodeIdsNeedSave: { id: string; reason: string }[] = []
		if (prevVisible && prevNodeId && prevNodeId !== nodeId) {
			nodeIdsNeedSave.push({ id: prevNodeId, reason: 'switch_to_other_node' })
		}
		if (prevVisible && !visible && prevNodeId && prevNodeId === nodeId) {
			nodeIdsNeedSave.push({ id: prevNodeId, reason: 'close_same_node_dialog' })
		}
		if (prevVisible && !visible && prevNodeId && nodeId === null) {
			nodeIdsNeedSave.push({ id: prevNodeId, reason: 'close_and_nodeId_cleared' })
		}
		for (const { id: saveNodeId, reason } of nodeIdsNeedSave) {
			const cached = lastValidChatStatePerNode.get(saveNodeId)
			const fallback = (() => {
				const n = props.scene?.getBlueprintNode?.(saveNodeId)
				return n
					? {
							draft: (n.data as any).nodeChatDraft ?? '',
							params: (n.data as any).nodeChatParams ?? {},
							selectedRefs: (n.data as any).nodeChatSelectedRefs ?? []
						}
					: null
			})()
			const snapshotFallback =
				lastChatStateSnapshot.value?.nodeId === saveNodeId
					? {
							draft: lastChatStateSnapshot.value.draft,
							params: lastChatStateSnapshot.value.params,
							selectedRefs: lastChatStateSnapshot.value.selectedRefs
						}
					: null
			const toSave = cached ??
				snapshotFallback ??
				fallback ?? { draft: '', params: {}, selectedRefs: [] }

			console.log('[DraftFlow#DomOverlay visible|nodeId watch] SAVING LAST STATE', {
				saveNodeId,
				reason,
				source: cached
					? 'lastValidChatStatePerNode'
					: snapshotFallback
						? 'lastChatStateSnapshot'
						: fallback
							? 'engineFallback'
							: 'empty',
				draftLen: toSave.draft.length,
				draftPreview:
					toSave.draft.length > 40 ? toSave.draft.slice(0, 40) + '...' : toSave.draft || '(empty)'
			})
			saveChatStateToNode(
				saveNodeId,
				toSave.draft,
				toSave.params as Record<string, any>,
				normalizeRefsForStorage(toSave.selectedRefs as any) as unknown as any[]
			)
		}

		lastChatStateSnapshot.value = {
			nodeId: typeof nodeId === 'string' ? nodeId : (prevNodeId ?? null),
			visible: !!visible,
			draft: props.chatState?.draft ?? '',
			params: { ...(props.chatState?.params ?? {}) },
			selectedRefs: normalizeRefsForStorage(props.chatState?.selectedRefs ?? []) as unknown as any[]
		}

		if (visible && typeof nodeId === 'string') {
			const node = props.scene.getBlueprintNode?.(nodeId)
			if (node) {
				const currentVisible = !!(node.data as any).nodeChatVisible
				if (!currentVisible) {
					const cmd = new SetNodeChatVisibleCommand(props.scene, nodeId, false, true)
					props.scene.executeCommand(cmd)
				}
			}
		}
	},
	{ immediate: true }
)

const chatApi: NodeChatApi = {
	getState(nodeId) {
		if (!props.scene) {
			return { visible: false, draft: '', params: {}, selectedRefs: [], submitting: false }
		}
		const node = props.scene.getBlueprintNode?.(nodeId)
		if (!node) {
			return { visible: false, draft: '', params: {}, selectedRefs: [], submitting: false }
		}
		const data = node.data as any
		const cached = lastValidChatStatePerNode.get(nodeId)
		// 统一：getState 返回的 refs 一律走 normalizeRefsForStorage，保证 key/冗余字段一致
		const rawRefs = cached?.selectedRefs ?? data.nodeChatSelectedRefs ?? []
		return {
			visible: !!data.nodeChatVisible,
			draft: cached?.draft ?? data.nodeChatDraft ?? '',
			params: cached?.params ?? data.nodeChatParams ?? {},
			selectedRefs: normalizeRefsForStorage(rawRefs) as unknown as any[],
			submitting: isNodeTaskSubmitting(nodeId)
		}
	},

	open(nodeId, nodeType) {
		if (!props.scene) return
		const node = props.scene.getBlueprintNode?.(nodeId)
		if (!node) return

		if (props.chatState?.nodeId && props.chatState.nodeId !== nodeId) {
			const prevCached = lastValidChatStatePerNode.get(props.chatState.nodeId)
			if (prevCached) {
				saveChatStateToNode(
					props.chatState.nodeId,
					prevCached.draft,
					prevCached.params,
					prevCached.selectedRefs
				)
			}
		}

		const oldVisible = !!(node.data as any).nodeChatVisible
		if (!oldVisible) {
			const cmd = new SetNodeChatVisibleCommand(props.scene, nodeId, false, true)
			props.scene.executeCommand(cmd)
		}
	},

	close(nodeId) {
		onBusinessChatClose(nodeId)
	},

	saveDraft(nodeId, draft) {
		const cached = lastValidChatStatePerNode.get(nodeId) ?? {
			draft: '',
			params: {} as Record<string, any>,
			selectedRefs: [] as any[]
		}
		// 幂等：内容一致就不更新缓存和触发emit
		if (cached.draft === draft) return
		cached.draft = draft
		lastValidChatStatePerNode.set(nodeId, cached)
		onBusinessChatUpdateDraft({ nodeId, draft })
	},

	saveParams(nodeId, params) {
		const cached = lastValidChatStatePerNode.get(nodeId) ?? {
			draft: '',
			params: {} as Record<string, any>,
			selectedRefs: [] as any[]
		}
		// 幂等：参数内容一致就不更新
		if (areParamsEqual(cached.params, params)) return
		cached.params = { ...params }
		lastValidChatStatePerNode.set(nodeId, cached)
		onBusinessChatUpdateParams({ nodeId, params: cached.params })
	},

	saveSelectedRefs(nodeId, selectedRefs) {
		const cached = lastValidChatStatePerNode.get(nodeId) ?? {
			draft: '',
			params: {} as Record<string, any>,
			selectedRefs: [] as any[]
		}
		// 先归一化：去除 id/name/type/fromContent 等不一致字段 + 补齐 refKey
		const normalized = normalizeRefsForStorage(selectedRefs) as unknown as any[]
		// 幂等：引用内容一致就不更新
		if (areSelectedRefsEqual(cached.selectedRefs, normalized)) return
		cached.selectedRefs = [...normalized]
		lastValidChatStatePerNode.set(nodeId, cached)
		onBusinessChatUpdateSelectedRefs({ nodeId, selectedRefs: cached.selectedRefs })
	},

	flush(nodeId, state) {
		if (!props.scene) return
		const node = props.scene.getBlueprintNode?.(nodeId)
		if (!node) return

		const cached = lastValidChatStatePerNode.get(nodeId)
		const finalDraft = state.draft ?? cached?.draft ?? ''
		const finalParams = state.params ?? cached?.params ?? {}
		const rawFinalRefs = state.selectedRefs ?? cached?.selectedRefs ?? []
		// 关键修复：normalize 后再进 saveChatStateToNode，保证写进引擎的 refs 与回读的 refs 同构
		const finalRefs = normalizeRefsForStorage(rawFinalRefs) as unknown as any[]

		// saveChatStateToNode 内部已做深比较幂等
		saveChatStateToNode(nodeId, finalDraft, finalParams, finalRefs)
		// 不删除 cache：后续 getState 仍可读取；被覆盖或切换节点时自然更新

		// ===== 补齐：同步 Vuex store（与 saveDraft/saveParams/saveSelectedRefs 保持完全一致的幂等策略）=====
		// 只有当 state 中显式传入了该字段（!== undefined）时，才视为「这一次 flush 的意图包含此字段」
		// 避免切换节点 / 部分 flush 时用空值误覆盖 store 中的有效值。
		const prevCached = lastValidChatStatePerNode.get(nodeId)
		const nextCached = {
			draft: prevCached?.draft ?? '',
			params: prevCached?.params ?? ({} as Record<string, any>),
			selectedRefs: prevCached?.selectedRefs ?? ([] as any[])
		}

		const hasDraft = state.draft !== undefined
		const hasParams = state.params !== undefined
		const hasRefs = state.selectedRefs !== undefined

		// 1) draft
		let shouldEmitDraft = false
		if (hasDraft) {
			if (nextCached.draft !== finalDraft) {
				shouldEmitDraft = true
				nextCached.draft = finalDraft
			}
		}

		// 2) params
		let shouldEmitParams = false
		if (hasParams) {
			if (!areParamsEqual(nextCached.params, finalParams)) {
				shouldEmitParams = true
				nextCached.params = { ...finalParams }
			}
		}

		// 3) refs
		let shouldEmitRefs = false
		if (hasRefs) {
			if (!areSelectedRefsEqual(nextCached.selectedRefs, finalRefs)) {
				shouldEmitRefs = true
				nextCached.selectedRefs = [...finalRefs]
			}
		}

		// 只有发生任一变更才回写 cache（避免对未变化的字段做无意义的引用替换）
		if (hasDraft || hasParams || hasRefs) {
			// 额外：把 nextCached 中的 selectedRefs 再次 normalize，
			// 避免 hasRefs=false 时从 prevCached 继承的旧 selectedRefs 仍含冗余字段
			nextCached.selectedRefs = normalizeRefsForStorage(nextCached.selectedRefs) as unknown as StoredNodeChatRef[] as any[]
			lastValidChatStatePerNode.set(nodeId, nextCached)
		}

		if (shouldEmitDraft) onBusinessChatUpdateDraft({ nodeId, draft: nextCached.draft })
		if (shouldEmitParams) onBusinessChatUpdateParams({ nodeId, params: nextCached.params })
		if (shouldEmitRefs) onBusinessChatUpdateSelectedRefs({ nodeId, selectedRefs: nextCached.selectedRefs })
	},

	submit(nodeId, payload) {
		onBusinessChatSubmit(payload)
	},

	stop(nodeId) {
		onBusinessChatStop(nodeId)
	},

	removeParamRef(nodeId, refItem) {
		onBusinessChatRemoveParamRef({ nodeId, refItem })
	}
}

provideNodeChatApi(chatApi)
</script>

<style scoped>
.bp-dom-overlay {
	contain: layout style size;
}

.bp-dom-transform-layer {
	contain: layout style;
}
</style>
