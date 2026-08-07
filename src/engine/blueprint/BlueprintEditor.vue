<template>
	<div class="blueprint-editor" :class="{ 'bp-readonly': readonly }">
		<div class="bp-canvas-container" ref="containerRef">
			<canvas ref="canvasRef" tabindex="0" data-wf-scene-layout-canvas="true"></canvas>
			<input
				ref="frameLabelInputRef"
				v-show="isFrameLabelEditing"
				v-model="frameLabelInputValue"
				type="text"
				class="bp-frame-label-input"
				tabindex="0"
				autocomplete="off"
				autocorrect="off"
				autocapitalize="off"
				spellcheck="false"
				:style="frameLabelInputStyle"
				@keydown.enter.prevent="onFrameLabelInputEnter"
				@keydown.esc.prevent="onFrameLabelInputEsc"
				@compositionstart="onFrameLabelCompositionStart"
				@compositionupdate="onFrameLabelCompositionUpdate"
				@compositionend="onFrameLabelCompositionEnd"
				@blur="onFrameLabelInputBlur"
				@select="onFrameLabelInputSelect"
			/>
			<BlueprintDomOverlay
				:scene="scene"
				:chat-state="chatState"
				:node-generation-tasks="nodeGenerationTasks"
				:node-generation-task-ids-by-node-id="nodeGenerationTaskIdsByNodeId"
				:legacy-resources="legacyResources"
				:input-param-preview-refs-by-node-id="inputParamPreviewRefsByNodeId"
				:editing-node-id="editingNodeId"
				:extra-props-resolver="extraPropsResolver"
				:force-dom-node-ids="forceDomNodeIds"
				@node-click="handleNodeClick"
				@node-contextmenu="handleNodeContextMenu"
				@node-copy="handleNodeCopy"
				@node-delete="handleNodeDelete"
				@node-refresh="(id: string) => emit('nodeRefresh', id)"
				@node-chat-submit="(p: any) => emit('nodeChatSubmit', p)"
				@node-chat-close="(id: string) => emit('nodeChatClose', id)"
				@node-chat-update-draft="(p: any) => emit('nodeChatUpdateDraft', p)"
				@node-chat-update-params="(p: any) => emit('nodeChatUpdateParams', p)"
				@node-chat-update-selected-refs="(p: any) => emit('nodeChatUpdateSelectedRefs', p)"
				@node-chat-remove-param-ref="(p: any) => emit('nodeChatRemoveParamRef', p)"
				@node-chat-stop="(id: string) => emit('nodeChatStop', id)"
				@node-start-link="(p: any) => emit('nodeStartLink', p)"
				@node-end-link="(p: any) => emit('nodeEndLink', p)"
				@node-preview-request="(p: any) => emit('nodePreviewRequest', p)"
				@node-clear-resource="(id: string) => emit('nodeClearResource', id)"
				@node-upload-resource="(p: any) => emit('nodeUploadResource', p)"
				@node-upload-model3d-file="
					(p: any) => {
						console.log('[BlueprintEditor] node-upload-model3d-file received, forwarding:', {
							nodeId: p?.nodeId,
							fileName: p?.file?.name
						})
						emit('nodeUploadModel3dFile', { nodeId: p?.nodeId, file: p?.file })
					}
				"
				@node-update-image-settings="(p: any) => emit('nodeUpdateImageSettings', p)"
				@node-media-ready="(id: string) => emit('nodeMediaReady', id)"
				@node-invalidate-screenshot="(id: string) => emit('nodeInvalidateScreenshot', id)"
				@node-preview-contextmenu="(p: any) => emit('nodePreviewContextMenu', p)"
				@node-screenshot="(p: any) => emit('nodeScreenshot', p)"
				@node-set-type="(p: any) => emit('nodeSetType', p)"
				@node-update-scene-understanding-settings="
					(p: any) => emit('nodeUpdateSceneUnderstandingSettings', p)
				"
				@node-request-scene-models="(id: string) => emit('nodeRequestSceneModels', id)"
				@node-run-scene-understanding="(id: string) => emit('nodeRunSceneUnderstanding', id)"
				@node-cancel-scene-understanding="(id: string) => emit('nodeCancelSceneUnderstanding', id)"
				@node-run-scene-decompose="(id: string) => emit('nodeRunSceneDecompose', id)"
				@node-run-scene-layout="(id: string) => emit('nodeRunSceneLayout', id)"
				@node-update-preview-mode="(p: any) => emit('nodeUpdatePreviewMode', p)"
				@node-update-layout-items="(p: any) => emit('nodeUpdateLayoutItems', p)"
				@node-update-selected-layout-item="(p: any) => emit('nodeUpdateSelectedLayoutItem', p)"
				@node-update-hide-placeholder-cubes="(p: any) => emit('nodeUpdateHidePlaceholderCubes', p)"
				@node-update-lighting-preview="(p: any) => emit('nodeUpdateLightingPreview', p)"
				@node-update-lighting-debug="(p: any) => emit('nodeUpdateLightingDebug', p)"
				@node-update-lighting-controls="(p: any) => emit('nodeUpdateLightingControls', p)"
				@node-set-selected-placeholder-output="
					(p: any) => emit('nodeSetSelectedPlaceholderOutput', p)
				"
				@node-clear-scene-layout-model-binding="
					(p: any) => emit('nodeClearSceneLayoutModelBinding', p)
				"
				@node-start-three-preview="(id: string) => emit('nodeStartThreePreview', id)"
				@node-three-preview-ready="(id: string) => emit('nodeThreePreviewReady', id)"
				@node-three-preview-error="(id: string) => emit('nodeThreePreviewError', id)"
				@node-three-preview-progress="(p: any) => emit('nodeThreePreviewProgress', p)"
				@node-upload-scene-layout-model-file="(p: any) => emit('nodeUploadSceneLayoutModelFile', p)"
				@node-update-model-bindings="(p: any) => emit('nodeUpdateModelBindings', p)"
				@node-export-unreal-scene="(id: string) => emit('nodeExportUnrealScene', id)"
			@node-export-unreal-lighting="(id: string) => emit('nodeExportUnrealLighting', id)"
			@node-disconnect-unreal="(id: string) => emit('nodeDisconnectUnreal', id)"
			@node-set-asset-root-path="(p: any) => emit('nodeSetAssetRootPath', p)"
			@node-update-poster="(p: any) => emit('nodeUpdatePoster', p)"
			@node-connect-comfyui="(p: any) => emit('nodeConnectComfyui', p)"
			@node-select-workflow="(p: any) => emit('nodeSelectWorkflow', p)"
			@node-run-comfyui="(id: string) => emit('nodeRunComfyui', id)"
			@node-cancel-comfyui="(id: string) => emit('nodeCancelComfyui', id)"
			@node-refresh-history-check="(id: string) => emit('nodeRefreshHistoryCheck', id)"
			@node-clear-history-cache="(id: string) => emit('nodeClearHistoryCache', id)"
			@node-update-comfyui-settings="(p: any) => emit('nodeUpdateComfyuiSettings', p)"
			@node-manage-local-workflows="(id: string) => emit('nodeManageLocalWorkflows', id)"
			@interaction-end="emitChange"
			/>
			<slot></slot>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, shallowRef, onMounted, onUnmounted, watch, nextTick, reactive, computed } from 'vue'
import { BlueprintScene, BlueprintNode } from './index'
import type { EditingFrameLabelWorldRectResult } from './SelectionFrame'
import type { GraphPointerEvent } from '../graphbase/input/events'
import type { LegacyBlueprintData, NodeStatus, BlueprintNodeData, BlueprintData } from './types'
import { DEFAULT_NODE_SIZES, getDefaultNodeData } from './types'
import BlueprintDomOverlay from './dom/BlueprintDomOverlay.vue'
import type { NodeChatState } from './dom/NodeComponentResolver'
import { DeleteSelectionCommand } from './commands/DeleteSelectionCommand'
import { MoveNodeCommand } from '../graphbase/commands/CompositeCommand'
import { Vector2 } from '../graphbase/core/Vector2'
import type {
	WorkflowNodeChatSubmitPayload,
	WorkflowNodeGenerationTask
} from '../../aiworkflow/types'
import type { LegacyResourceData } from './types'
import { getI18nManager } from './i18n'

// BlueprintEditor 内部调试开关。
// 日常开发保持 false，避免任务轮询/节点交互期间控制台刷屏；
// 需要排查 bulkUpdate/enterEditMode/按键 等细节时临时改为 true。
const BLUEPRINT_EDITOR_DEBUG = false as boolean

// 通用的输入参数预览引用类型（引擎层不依赖业务层类型）
type InputParamPreviewRefItem = {
	edgeId?: string
	fromNodeId?: string
	fromAnchorId?: string
	toAnchorId?: string
	kind: 'text' | 'image' | 'video' | 'model3d' | 'audio'
	name?: string
	label?: string
	text?: string
	previewUrl?: string
	meta?: string
}

interface Props {
	initialData?: LegacyBlueprintData
	projectPath?: string
	readonly?: boolean
	theme?: 'light' | 'dark'
	chatState?: NodeChatState | null
	nodeGenerationTasks?: Record<string, WorkflowNodeGenerationTask>
	nodeGenerationTaskIdsByNodeId?: Record<string, string[]>
	legacyResources?: Record<string, LegacyResourceData>
	inputParamPreviewRefsByNodeId?: Record<string, InputParamPreviewRefItem[]>
	extraPropsResolver?: (nodeData: any) => Record<string, unknown>
	forceDomNodeIds?: string[]
}

const props = withDefaults(defineProps<Props>(), {
	readonly: false,
	theme: 'dark',
	inputParamPreviewRefsByNodeId: () => ({})
})

interface Emits {
	(e: 'change', data: LegacyBlueprintData): void
	(e: 'save', data: LegacyBlueprintData): void
	(e: 'selectionChange', nodeIds: string[]): void
	(e: 'nodeClick', nodeId: string, event: MouseEvent): void
	(
		e: 'nodeContextMenu',
		nodeId: string,
		event: MouseEvent,
		worldPos: { x: number; y: number }
	): void
	(e: 'canvasContextMenu', event: MouseEvent, worldPos: { x: number; y: number }): void
	(e: 'canvasDoubleClick', event: MouseEvent, worldPos: { x: number; y: number }): void
	(e: 'canvasDrop', event: DragEvent, worldPos: { x: number; y: number }): void
	(e: 'viewportChange', zoom: number, panX: number, panY: number): void
	(e: 'nodeRefresh', nodeId: string): void
	(e: 'nodeChatSubmit', payload: WorkflowNodeChatSubmitPayload): void
	(e: 'nodeChatClose', nodeId: string): void
	(e: 'nodeChatUpdateDraft', payload: { nodeId: string; draft: string }): void
	(e: 'nodeChatUpdateParams', payload: { nodeId: string; params: Record<string, any> }): void
	(e: 'nodeChatUpdateSelectedRefs', payload: { nodeId: string; selectedRefs: any[] }): void
	(e: 'nodeChatRemoveParamRef', payload: { nodeId: string; refItem: any }): void
	(e: 'nodeChatStop', nodeId: string): void
	(
		e: 'linkDropOnCanvas',
		payload: {
			clientX: number
			clientY: number
			worldX: number
			worldY: number
			fromNodeId: string
			fromAnchorId: string
		}
	): void
	(
		e: 'nodeStartLink',
		payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }
	): void
	(e: 'nodeEndLink', payload: { nodeId: string; anchorId: string; anchorIndex: number }): void
	(e: 'nodePreviewRequest', payload: { nodeId: string; imageUrl: string }): void
	(e: 'nodeClearResource', nodeId: string): void
	(e: 'nodeUploadResource', payload: { nodeId: string; file: File; kind: string }): void
	(e: 'nodeUploadModel3dFile', payload: { nodeId: string; file: File }): void
	(e: 'nodeUpdateImageSettings', payload: { nodeId: string; patch: Record<string, any> }): void
	(e: 'nodeMediaReady', nodeId: string): void
	(e: 'nodeInvalidateScreenshot', nodeId: string): void
	(e: 'nodePreviewContextMenu', payload: { nodeId: string; clientX: number; clientY: number }): void
	(
		e: 'nodeScreenshot',
		payload: { nodeId: string; dataUrl: string; width: number; height: number; time: number }
	): void
	(e: 'nodeSetType', payload: { nodeId: string; type: string }): void
	(
		e: 'nodeUpdateSceneUnderstandingSettings',
		payload: { nodeId: string; patch: Record<string, any> }
	): void
	(e: 'nodeRequestSceneModels', nodeId: string): void
	(e: 'nodeRunSceneUnderstanding', nodeId: string): void
	(e: 'nodeCancelSceneUnderstanding', nodeId: string): void
	(e: 'nodeRunSceneDecompose', nodeId: string): void
	(e: 'nodeRunSceneLayout', nodeId: string): void
	(e: 'nodeUpdatePreviewMode', payload: { nodeId: string; previewMode: boolean }): void
	(e: 'nodeUpdateLayoutItems', payload: { nodeId: string; items: any[] }): void
	(e: 'nodeUpdateSelectedLayoutItem', payload: { nodeId: string; itemId: string }): void
	(e: 'nodeUpdateHidePlaceholderCubes', payload: { nodeId: string; hide: boolean }): void
	(e: 'nodeUpdateLightingPreview', payload: { nodeId: string; enabled: boolean }): void
	(e: 'nodeUpdateLightingDebug', payload: { nodeId: string; enabled: boolean }): void
	(
		e: 'nodeUpdateLightingControls',
		payload: { nodeId: string; controls: Record<string, any> }
	): void
	(e: 'nodeSetSelectedPlaceholderOutput', payload: { nodeId: string; selectedId: string }): void
	(e: 'nodeClearSceneLayoutModelBinding', payload: { nodeId: string; objectId: string }): void
	(e: 'nodeStartThreePreview', nodeId: string): void
	(e: 'nodeThreePreviewReady', nodeId: string): void
	(e: 'nodeThreePreviewError', nodeId: string): void
	(
		e: 'nodeThreePreviewProgress',
		payload: { nodeId: string; progress?: number; label?: string }
	): void
	(
		e: 'nodeUploadSceneLayoutModelFile',
		payload: { nodeId: string; file: File; objectId?: string }
	): void
	(e: 'nodeUpdateModelBindings', payload: { nodeId: string; bindings: any[] }): void
	(e: 'nodeExportUnrealScene', nodeId: string): void
	(e: 'nodeExportUnrealLighting', nodeId: string): void
	(e: 'nodeDisconnectUnreal', nodeId: string): void
	(e: 'nodeSetAssetRootPath', payload: { nodeId: string; path: string }): void
	(e: 'nodeUpdatePoster', payload: { nodeId: string; posterDataUrl: string }): void
	(e: 'nodeConnectComfyui', payload: { nodeId: string; baseUrl: string }): void
	(e: 'nodeSelectWorkflow', payload: { nodeId: string; workflowPath: string }): void
	(e: 'nodeRunComfyui', nodeId: string): void
	(e: 'nodeCancelComfyui', nodeId: string): void
	(e: 'nodeRefreshHistoryCheck', nodeId: string): void
	(e: 'nodeClearHistoryCache', nodeId: string): void
	(
		e: 'nodeUpdateComfyuiSettings',
		payload: { nodeId: string; patch: Record<string, any> }
	): void
	(e: 'nodeManageLocalWorkflows', nodeId: string): void
}

const emit = defineEmits<Emits>()

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const scene = shallowRef<BlueprintScene | null>(null)
const editingNodeId = ref<string | null>(null)

// ============================================================
// 多选框（蓝色临时框 / 绿色已保存分组框）顶部标签：透明 DOM 输入框同步层
//
// 设计动机：Canvas 绘制的「伪输入框」无法获得 OS 级焦点 → 导致 4 个缺陷：
//   1) 切换输入法后无法正常上屏汉字（无 compositionstart/update/end）
//   2) 长按 Backspace 只会触发一次（InputManager 合成事件时可能把 repeat 吞了）
//   3) Ctrl+A 全选对 canvas 的伪编辑态不生效
//   4) 画布/业务层大量 keydown 监听会在编辑中途抢先拦截，打断输入
// 方案：在 canvas 上层叠一个「几乎透明」的真实 <input type=text> DOM，
//   编辑开始时强制 focus，所有键盘/IME 走原生 input 语义，再把最终 value
//   通过 scene.setFrameLabelEditText 同步回引擎 editText，仍由 Canvas 负责渲染。
// ============================================================
const frameLabelInputRef = ref<HTMLInputElement | null>(null)
const frameLabelInputValue = ref('')
// 当前 input 是否处于 IME 组合态（拼音/五笔候选中，尚未上屏）
const frameLabelIsComposing = ref(false)
// 上一次进入编辑态时用的 worldRect 指纹（x,y,w,h 拼接），用于避免重复同步位置
let _frameLabelLastRectKey = ''
// 是否处于编辑态。用 watch(scene) + 每帧轮询双重兜底。
const isFrameLabelEditing = ref(false)
// input 的绝对定位样式（每帧根据 worldRect 重新计算）
const frameLabelPos = reactive<{
	left: number
	top: number
	width: number
	height: number
	fontSize: number
}>({ left: 0, top: 0, width: 0, height: 0, fontSize: 12 })
const frameLabelInputStyle = computed(() => ({
	position: 'absolute' as const,
	left: `${frameLabelPos.left}px`,
	top: `${frameLabelPos.top}px`,
	width: `${frameLabelPos.width}px`,
	height: `${frameLabelPos.height}px`,
	fontSize: `${frameLabelPos.fontSize}px`,
	// 近乎透明，只保留极淡的 caret 与原生 focus outline 的可见性
	opacity: '0.02',
	background: 'transparent',
	color: '#000',
	// 不做任何边框装饰，避免挡住 canvas 绘制的框
	border: 'none',
	outline: 'none',
	padding: 0,
	margin: 0,
	boxSizing: 'border-box' as const,
	// caret 用原生，用户能看到它一直在输入框里跳
	caretColor: 'transparent',
	// 防止被 canvas 或其它层挡
	zIndex: 50,
	// 防止拖拽选中文本时触发意外行为
	userSelect: 'text' as const,
	lineHeight: `${frameLabelPos.fontSize}px`,
	fontFamily:
		'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
}))

function _updateFrameLabelInputFromScene(force = false): void {
	const s = scene.value
	if (!s) {
		isFrameLabelEditing.value = false
		return
	}
	const editing = s.isSelectionFrameEditing()
	isFrameLabelEditing.value = editing
	if (!editing) {
		_frameLabelLastRectKey = ''
		return
	}
	const rect: EditingFrameLabelWorldRectResult | null = s.getEditingFrameLabelWorldRect()
	if (!rect || !containerRef.value) return
	const cam = s.camera
	const c = containerRef.value
	const rectLeft = c.clientLeft ?? 0
	const rectTop = c.clientTop ?? 0
	// world 左上 → screen 左上
	const topLeft = cam.worldToScreen(new Vector2(rect.inputWorldRect.x, rect.inputWorldRect.y))
	// world 右下 → screen 右下
	const bottomRight = cam.worldToScreen(
		new Vector2(
			rect.inputWorldRect.x + rect.inputWorldRect.width,
			rect.inputWorldRect.y + rect.inputWorldRect.height
		)
	)
	const w = Math.max(4, bottomRight.x - topLeft.x)
	const h = Math.max(4, bottomRight.y - topLeft.y)
	// 相对 bp-canvas-container 定位，不需要再加 scrollLeft（overflow:hidden）
	const left = topLeft.x - rectLeft
	const top = topLeft.y - rectTop
	// 字号按 zoom 缩放（canvas 那一层用 world→screen，这里用同一值保证 caret 对齐）
	const fontSize = Math.max(8, rect.fontSizeWorld * cam.zoom)
	// 指纹对比，完全一致就跳过 setter，省掉响应式触发
	const key = `${left.toFixed(3)}|${top.toFixed(3)}|${w.toFixed(3)}|${h.toFixed(3)}|${fontSize.toFixed(3)}`
	if (!force && key === _frameLabelLastRectKey) return
	_frameLabelLastRectKey = key
	frameLabelPos.left = left
	frameLabelPos.top = top
	frameLabelPos.width = w
	frameLabelPos.height = h
	frameLabelPos.fontSize = fontSize
}

/**
 * 把 DOM input 最新 value 推送到 Tool.editText。
 * 注意：即使处于 composing（候选未上屏）也同步一份到 engine，
 * 这样 canvas 层绘制的文本能跟随候选变化闪烁（与真实 input 视觉同步）。
 */
function _syncFrameLabelTextToEngine(forceFullText = false): void {
	const s = scene.value
	if (!s) return
	const v = frameLabelInputValue.value
	const cur = s.getEditingFrameText()
	if (!forceFullText && v === cur) return
	s.setFrameLabelEditText(v)
}

let _frameLabelRafId: number | null = null
function _frameLabelRafLoop(): void {
	_updateFrameLabelInputFromScene(false)
	_frameLabelRafId = window.requestAnimationFrame(_frameLabelRafLoop)
}

// 进入编辑态：同步一次 value + 强制 focus input
function _enterFrameLabelEditing(): void {
	const s = scene.value
	if (!s) return
	// 先拉一次初始文本，避免 input 里是空字符串
	frameLabelInputValue.value = s.getEditingFrameText()
	frameLabelIsComposing.value = false
	s.setFrameLabelComposing(false)
	// 同步一次位置（nextTick 后再 focus，确保 v-show=显示）
	nextTick(() => {
		_updateFrameLabelInputFromScene(true)
		const el = frameLabelInputRef.value
		if (!el) return
		try {
			// 防止在 focus 前 input 里选中状态不对
			el.focus({ preventScroll: true } as FocusOptions)
			// 默认光标置于末尾（与「双击进入编辑态」习惯一致）
			const len = frameLabelInputValue.value.length
			try {
				el.setSelectionRange(len, len)
			} catch {
				// 某些浏览器对不可见元素 setSelectionRange 会抛错，忽略即可
			}
		} catch {
			// focus 失败不影响后续逻辑
		}
	})
}

function _exitFrameLabelEditing(): void {
	frameLabelIsComposing.value = false
	// 通知 engine 退出 IME 组合态（兜底）
	scene.value?.setFrameLabelComposing(false)
}

// 只在编辑态切换（false→true）时执行进入/退出逻辑
watch(
	isFrameLabelEditing,
	(editing, wasEditing) => {
		if (editing && !wasEditing) {
			_enterFrameLabelEditing()
		} else if (!editing && wasEditing) {
			_exitFrameLabelEditing()
		}
	},
	{ flush: 'post' }
)

// 每次 scene.value 切换（初始化、重载）时重绑：确保 isFrameLabelEditing 跟 scene 一致
watch(
	scene,
	() => {
		_updateFrameLabelInputFromScene(true)
	},
	{ flush: 'post' }
)

// 当用户通过原生 input 输入/删除/粘贴（input 事件），同步到 engine 侧 editText。
// IME 候选更新时 input 事件也会触发，这时 engine 侧能看到「半上屏」文本变化（可选）。
watch(frameLabelInputValue, () => {
	if (!isFrameLabelEditing.value) return
	_syncFrameLabelTextToEngine(false)
})

function onFrameLabelInputEnter(e: KeyboardEvent): void {
	// Enter 提交；如果处于 IME 组合态，浏览器会先上屏候选再触发 Enter，一般不会到这里
	const s = scene.value
	if (!s) return
	e.preventDefault()
	e.stopPropagation()
	s.commitFrameLabelEdit()
}

function onFrameLabelInputEsc(e: KeyboardEvent): void {
	const s = scene.value
	if (!s) return
	e.preventDefault()
	e.stopPropagation()
	s.cancelFrameLabelEdit()
	// Esc 后把焦点还给 canvas，避免后续键盘事件都走 input（此时 v-show=false 也不再响应）
	nextTick(() => {
		canvasRef.value?.focus({ preventScroll: true } as FocusOptions)
	})
}

function onFrameLabelCompositionStart(): void {
	frameLabelIsComposing.value = true
	scene.value?.setFrameLabelComposing(true)
}

function onFrameLabelCompositionUpdate(): void {
	// 候选变化也同步到 engine，让 canvas 层绘制跟随「半上屏」文本
	_syncFrameLabelTextToEngine(false)
}

function onFrameLabelCompositionEnd(): void {
	frameLabelIsComposing.value = false
	scene.value?.setFrameLabelComposing(false)
	// 最终上屏文本最后强制同步一次，避免某些 IME 没有触发 input 事件
	_syncFrameLabelTextToEngine(true)
}

function onFrameLabelInputBlur(): void {
	// blur 提交：用户在编辑中点击画布其它区域 / 点击 DOM overlay / 点击外部
	// 唯一例外：若此时 engine 已经自己退出编辑态（比如 Tool 内部 commit/cancel 过），则不必重复
	const s = scene.value
	if (!s) return
	if (!s.isSelectionFrameEditing()) return
	s.commitFrameLabelEdit()
}

function onFrameLabelInputSelect(): void {
	// 留作后续扩展（如在 canvas 层同步绘制选区）；当前空实现即可
}
// ============================================================
// END 多选框顶部透明输入框同步层
// ============================================================

let rafId: number | null = null
let resizeObserver: ResizeObserver | null = null
let isUpdatingFromProps = false
let changeDebounceTimer: number | null = null
let lastStructureHash: string | null = null
let hasInitiallyLoaded = false
let isEnteringEditMode = false
let _bulkUpdateDepth = 0

function clearPendingChanges() {
	if (changeDebounceTimer) {
		clearTimeout(changeDebounceTimer)
		changeDebounceTimer = null
	}
}

function beginBulkUpdate() {
	_bulkUpdateDepth++
	if (BLUEPRINT_EDITOR_DEBUG) {
		console.log('[BlueprintEditor] beginBulkUpdate: depth=' + _bulkUpdateDepth)
	}
	if (_bulkUpdateDepth === 1) {
		// 第一次进入bulk update模式，清除所有pending changes
		clearPendingChanges()
	}
}

function endBulkUpdate() {
	if (_bulkUpdateDepth > 0) {
		_bulkUpdateDepth--
	}
	if (BLUEPRINT_EDITOR_DEBUG) {
		console.log('[BlueprintEditor] endBulkUpdate: depth=' + _bulkUpdateDepth)
	}
}

function isBulkUpdating(): boolean {
	return _bulkUpdateDepth > 0
}

function applyInitialData(newData: LegacyBlueprintData) {
	if (!scene.value) return
	const s = scene.value

	if (s.isEngineDragging || s.isDomInteractionLocked || s.isViewportPanning) return

	if (editingNodeId.value) return

	const newHash = computeStructureHash(newData)
	const structureChanged = newHash !== lastStructureHash

	isUpdatingFromProps = true

	let needsRedraw = false

	if (structureChanged || !hasInitiallyLoaded) {
		s.loadBlueprint(newData)
		lastStructureHash = newHash
		hasInitiallyLoaded = true
		needsRedraw = true
	} else {
		if (newData.viewport) {
			const curVp = s.getViewport()
			if (!viewportEquals(curVp, newData.viewport)) {
				s.setViewport(newData.viewport)
				needsRedraw = true
			}
		}
	}

	if (needsRedraw) {
		s.requestRedraw()
	}
	nextTick(() => {
		isUpdatingFromProps = false
	})
}

function enterEditMode(nodeId: string) {
	if (!scene.value) return
	if (isBulkUpdating()) {
		if (BLUEPRINT_EDITOR_DEBUG) {
			console.log(
				'[BlueprintEditor] enterEditMode: bulk update active, skipping enterEditMode for',
				nodeId
			)
		}
		return
	}
	const node = scene.value.getBlueprintNode(nodeId)
	if (!node) {
		console.warn('[BlueprintEditor] enterEditMode: node not found', nodeId)
		return
	}

	if (editingNodeId.value === nodeId) {
		return
	}

	const nodeData = node.data as any
	if (BLUEPRINT_EDITOR_DEBUG) {
		console.log('[BlueprintEditor] enterEditMode', {
			nodeId,
			prevEditingId: editingNodeId.value,
			nodeChatVisible: nodeData.nodeChatVisible,
			hasChatDraft: !!nodeData.nodeChatDraft,
			chatDraftPreview:
				typeof nodeData.nodeChatDraft === 'string'
					? nodeData.nodeChatDraft.length > 40
						? nodeData.nodeChatDraft.slice(0, 40) + '...'
						: nodeData.nodeChatDraft || '(empty string)'
					: String(nodeData.nodeChatDraft),
			nodeChatParamsKeys: nodeData.nodeChatParams ? Object.keys(nodeData.nodeChatParams) : null,
			nodeChatSelectedRefsLen: Array.isArray(nodeData.nodeChatSelectedRefs)
				? nodeData.nodeChatSelectedRefs.length
				: null
		})
	}

	if (editingNodeId.value && editingNodeId.value !== nodeId) {
		const prevNode = scene.value.getBlueprintNode(editingNodeId.value)
		if (BLUEPRINT_EDITOR_DEBUG) {
			console.log('[BlueprintEditor] enterEditMode switch: setting prev node DOM mode false', {
				prevNodeId: editingNodeId.value,
				prevChatDraft: prevNode ? (prevNode.data as any).nodeChatDraft : 'PREV_NODE_NOT_FOUND'
			})
		}
		if (prevNode) prevNode.setDomMode(false)
		editingNodeId.value = null
	}

	isEnteringEditMode = true
	scene.value.selection.setSelection([nodeId])
	isEnteringEditMode = false

	editingNodeId.value = nodeId
	node.setDomMode(true)
	scene.value.isEngineDragging = false
	scene.value.isDomInteractionLocked = false
	scene.value.requestRedraw()
}

function exitEditMode() {
	if (editingNodeId.value) {
		const exitingId = editingNodeId.value
		const exitingNode = scene.value?.getBlueprintNode(exitingId)
		const exitingDraft = exitingNode ? (exitingNode.data as any).nodeChatDraft : 'NODE_NOT_FOUND'
		if (BLUEPRINT_EDITOR_DEBUG) {
			console.log('[BlueprintEditor] exitEditMode START', {
				editingNodeId: exitingId,
				engineDraftBeforeSetDomFalse:
					typeof exitingDraft === 'string'
						? exitingDraft.length > 40
							? exitingDraft.slice(0, 40) + '...'
							: exitingDraft || '(empty string)'
						: String(exitingDraft)
			})
		}
		if (scene.value) {
			const node = scene.value.getBlueprintNode(exitingId)
			if (node) node.setDomMode(false)
			scene.value.isEngineDragging = false
			scene.value.isDomInteractionLocked = false
			scene.value.tools.drag?.cancelDrag?.()
			scene.value.requestRedraw()
			nextTick(() => {
				if (!isUpdatingFromProps && scene.value) {
					// 检查是否在bulk update模式下，如果是则跳过emitChange
					if (isBulkUpdating()) {
						if (BLUEPRINT_EDITOR_DEBUG) {
							console.log(
								'[BlueprintEditor] exitEditMode nextTick: bulk update active, skipping emitChange'
							)
						}
						return
					}
					const node2 = scene.value.getBlueprintNode(exitingId)
					const draftAfterTick = node2 ? (node2.data as any).nodeChatDraft : '(missing)'
					if (BLUEPRINT_EDITOR_DEBUG) {
						console.log('[BlueprintEditor] exitEditMode nextTick emitChange:', {
							nodeId: exitingId,
							engineDraftAfterTick:
								typeof draftAfterTick === 'string'
									? draftAfterTick.length > 40
										? draftAfterTick.slice(0, 40) + '...'
										: draftAfterTick || '(empty string)'
									: String(draftAfterTick),
							changeDebounceTimer
						})
					}
					emitChange()
				}
			})
		}
		editingNodeId.value = null
		canvasRef.value?.focus({ preventScroll: true })
	}
}

function handleSceneNodeClick(node: BlueprintNode) {
	enterEditMode(node.id)
}

function computeStructureHash(data: LegacyBlueprintData): string {
	const nodeIds = (data.nodeOrder || Object.keys(data.nodesById || {})).slice().sort()
	const edgeIds = (data.edgeOrder || Object.keys(data.edgesById || {})).slice().sort()
	const resIds = (data.resourceOrder || Object.keys(data.resourcesById || {})).slice().sort()
	const nodeSignatures = nodeIds.map((id) => {
		const node = data.nodesById[id] || ({} as any)
		return `${id}=${node.worldX ?? node.x ?? 0},${node.worldY ?? node.y ?? 0},${node.width ?? 0},${node.height ?? 0},${node.sizeCustomized ? 1 : 0}`
	})
	return `nodes:${nodeSignatures.join('|')}||edges:${edgeIds.join(',')}||res:${resIds.join(',')}`
}

function viewportEquals(
	a: { zoom: number; panX: number; panY: number },
	b: { zoom: number; panX: number; panY: number }
): boolean {
	return (
		Math.abs(a.zoom - b.zoom) < 0.001 &&
		Math.abs(a.panX - b.panX) < 0.5 &&
		Math.abs(a.panY - b.panY) < 0.5
	)
}

function handleNodeContextMenu(nodeId: string, event: MouseEvent) {
	event.preventDefault()
	event.stopPropagation()
	const worldPos = getWorldPosFromClient(event.clientX, event.clientY)
	emit('nodeContextMenu', nodeId, event, worldPos)
}

function handleNodeClick(nodeId: string, event: MouseEvent) {
	enterEditMode(nodeId)
	emit('nodeClick', nodeId, event)
}

function handleNodeCopy(nodeId: string) {
	if (!scene.value) return
	const s = scene.value
	const node = s.getBlueprintNode(nodeId)
	if (node) {
		s.copySelection([node])
	}
}

function handleNodeDelete(nodeId: string) {
	if (!scene.value || props.readonly) return
	const s = scene.value
	s.executeCommand(new DeleteSelectionCommand(s as any, [nodeId], []))
	s.selection.clearSelection()
	s.updateAllConnectionEndpoints()
	s.requestRedraw()
}

function getWorldPosFromClient(clientX: number, clientY: number): { x: number; y: number } {
	if (!containerRef.value || !scene.value) return { x: 0, y: 0 }
	const rect = containerRef.value.getBoundingClientRect()
	const sx = clientX - rect.left
	const sy = clientY - rect.top
	const worldPos = scene.value.camera.screenToWorld(new Vector2(sx, sy))
	return { x: worldPos.x, y: worldPos.y }
}

function onToolContextMenu(event: GraphPointerEvent) {
	if (!scene.value) return
	const s = scene.value
	const originalEvent = event.originalEvent as MouseEvent
	const clientX = originalEvent.clientX
	const clientY = originalEvent.clientY
	const worldPos = getWorldPosFromClient(clientX, clientY)

	const hitNode = event.hitResult?.node
	if (hitNode && hitNode instanceof BlueprintNode) {
		const targetId = hitNode.id
		const selectedNodes = s.selection
			.getSelection()
			.filter((n) => n instanceof BlueprintNode) as BlueprintNode[]
		if (!selectedNodes.find((n) => n.id === targetId)) {
			s.selection.setSelection([targetId])
			s.requestRedraw()
		}
		emit('nodeContextMenu', targetId, originalEvent, worldPos)
	} else {
		s.selection.clearSelection()
		s.requestRedraw()
		emit('canvasContextMenu', originalEvent, worldPos)
	}
}

function deleteSelection() {
	if (!scene.value || props.readonly) return
	const s = scene.value
	const hadSelection = s.selection.getSelection().length > 0
	s.deleteSelection()
	if (editingNodeId.value) {
		const stillExists = s.getBlueprintNode(editingNodeId.value)
		if (!stillExists) exitEditMode()
	}
	if (hadSelection) {
		s.updateAllConnectionEndpoints()
		s.requestRedraw()
	}
}

function getSelectedNodeIds(): string[] {
	if (!scene.value) return []
	return scene.value.selection
		.getSelection()
		.filter((n) => n instanceof BlueprintNode)
		.map((n) => (n as BlueprintNode).id)
}

function emitChange() {
	if (!scene.value) return
	if (scene.value.isEngineDragging || scene.value.isDomInteractionLocked) return
	if (isBulkUpdating()) {
		clearPendingChanges()
		return
	}
	if (changeDebounceTimer) {
		clearTimeout(changeDebounceTimer)
	}
	changeDebounceTimer = window.setTimeout(() => {
		changeDebounceTimer = null
		if (!scene.value) return
		if (scene.value.isEngineDragging || scene.value.isDomInteractionLocked) return
		if (isBulkUpdating()) return
		const data = scene.value.serializeLegacy()
		emit('change', data)
	}, 0)
}

function handleResize() {
	if (!containerRef.value || !canvasRef.value || !scene.value) return
	const rect = containerRef.value.getBoundingClientRect()
	scene.value.resize(rect.width, rect.height)
	scene.value.onResize(rect.width, rect.height)
}

let ctxCaptureKeyDown: ((e: KeyboardEvent) => void) | null = null
let unsubToolContextMenu: (() => void) | null = null
let unsubNodeClick: (() => void) | null = null
let unsubSelect: (() => void) | null = null
let unsubDeselect: (() => void) | null = null
let unsubViewport: (() => void) | null = null
let unsubAfterCommand: (() => void) | null = null
let unsubLinkDropOnCanvas: (() => void) | null = null
let onContainerDragOver: ((e: DragEvent) => void) | null = null
let onContainerDrop: ((e: DragEvent) => void) | null = null
let onContainerMouseMove: ((e: MouseEvent) => void) | null = null
let onCanvasPointerDownFocus: ((e: PointerEvent) => void) | null = null
const lastMouseWorldPos = ref<{ x: number; y: number } | null>(null)

function setupKeyboardShortcuts(s: BlueprintScene) {
	ctxCaptureKeyDown = (e: KeyboardEvent) => {
		if (props.readonly) return
		const target = e.target as HTMLElement | null
		const tag = (target?.tagName || '').toLowerCase()
		const isEditable =
			tag === 'input' ||
			tag === 'textarea' ||
			tag === 'select' ||
			(target as any)?.isContentEditable === true ||
			!!(target && target.closest('.bp-node-chat-dialog'))
		const key = e.key.toLowerCase()
		const ctrl = e.ctrlKey || e.metaKey

		if (isEditable) {
			if (e.key === 'Escape' && !e.repeat && target) {
				;(target as HTMLElement).blur()
			}
			return
		}

		// Enter键：仅当编辑单个节点时拦截，其他情况（如多选框编辑）让事件传播到工具层
		if (key === 'enter' && !ctrl && !e.shiftKey && !e.altKey && !e.repeat) {
			const selectedNodes = s.selection
				.getSelection()
				.filter((n) => n instanceof BlueprintNode) as BlueprintNode[]
			if (BLUEPRINT_EDITOR_DEBUG) {
				console.log('[BlueprintEditor.ctxCaptureKeyDown.ENTER] Received:', {
					isEditable,
					targetTag: tag,
					editingNodeId: editingNodeId.value,
					selectedCount: selectedNodes.length
				})
			}
			if (isEditable) {
				// 如果是真实的DOM input（例如 Vue DOM 层的标签编辑器），不拦截
				if (BLUEPRINT_EDITOR_DEBUG) {
					console.log('[BlueprintEditor.ctxCaptureKeyDown.ENTER] isEditable=true, skipping.')
				}
				return
			}
			if (editingNodeId.value) {
				e.preventDefault()
				e.stopImmediatePropagation()
				if (BLUEPRINT_EDITOR_DEBUG) {
					console.log('[BlueprintEditor.ctxCaptureKeyDown.ENTER] Blocked: editing single node.')
				}
				return
			}
			if (selectedNodes.length === 1) {
				e.preventDefault()
				e.stopImmediatePropagation()
				enterEditMode(selectedNodes[0].id)
				if (BLUEPRINT_EDITOR_DEBUG) {
					console.log(
						'[BlueprintEditor.ctxCaptureKeyDown.ENTER] Blocked: single node edit mode activated.'
					)
				}
				return
			}
			// 选中多个节点或未选中节点时，让事件传播到工具层处理多选框保存等操作
			if (BLUEPRINT_EDITOR_DEBUG) {
				console.log('[BlueprintEditor.ctxCaptureKeyDown.ENTER] Propagating to tool layer.')
			}
			return
		}
		if (key === 'escape' && !e.repeat) {
			if (editingNodeId.value) {
				e.preventDefault()
				e.stopImmediatePropagation()
				exitEditMode()
				return
			}
			return
		}
	}
	window.addEventListener('keydown', ctxCaptureKeyDown, true)
}

watch(
	() => props.initialData,
	(newData) => {
		if (!newData || !scene.value) return
		applyInitialData(newData)
	},
	{ deep: false }
)

watch(
	() => props.nodeGenerationTasks,
	(tasks) => {
		if (!scene.value || !tasks) return
		const s = scene.value
		const nodes = s.getAllBlueprintNodes()
		let needsRedraw = false
		for (const node of nodes) {
			const nodeId = node.id
			const nodeTasks = Object.values(tasks).filter((t) => t.nodeId === nodeId)
			const activeTask =
				nodeTasks.find((t) => t.status === 'submitting' || t.status === 'running') ||
				nodeTasks.find((t) => t.status === 'error') ||
				nodeTasks.find((t) => t.status === 'completed') ||
				null
			let nextStatus: 'idle' | 'running' | 'success' | 'error' = 'idle'
			if (activeTask) {
				if (activeTask.status === 'submitting' || activeTask.status === 'running')
					nextStatus = 'running'
				else if (activeTask.status === 'error') nextStatus = 'error'
				else if (activeTask.status === 'completed') nextStatus = 'success'
			}
			if ((node.data as any).status !== nextStatus) {
				;(node.data as any).status = nextStatus
				needsRedraw = true
			}
		}
		if (needsRedraw) {
			s.requestRedraw()
		}
	},
	{ deep: true }
)

watch(
	() => props.legacyResources,
	(res) => {
		if (!scene.value || !res) return
		;(scene.value as any)._legacyResources = res
	},
	{ deep: false }
)

// 🔑 引用稳定化：上游（AIWorkflowPage）已保证内容未变时返回相同引用；
// 此处再加一道防线，即使引用变化也先判断「内容无差异就不写 scene」，避免轮询期的频繁副作用。
let _lastInputParamPreviewRefsByNodeId: Record<string, InputParamPreviewRefItem[]> | null = null
watch(
	() => props.inputParamPreviewRefsByNodeId,
	(refs) => {
		if (!scene.value || !refs) return
		// 引用相同 → 内容没变（上游缓存保证），直接跳过
		if (_lastInputParamPreviewRefsByNodeId === refs) return
		_lastInputParamPreviewRefsByNodeId = refs
		;(scene.value as any)._inputParamPreviewRefsByNodeId = refs
		if (BLUEPRINT_EDITOR_DEBUG) {
			const nodesWithRefs = Object.entries(refs).filter(([, r]) => r && r.length > 0)
			console.log(
				`[BlueprintEditor][inputParamPreviewRefsByNodeId] updated: ${nodesWithRefs.length} nodes with refs`,
				nodesWithRefs.map(([id]) => id)
			)
		}
	},
	{ deep: false, immediate: true }
)

onMounted(() => {
	if (!canvasRef.value || !containerRef.value) return

	const s = new BlueprintScene(canvasRef.value)
	scene.value = s

	isUpdatingFromProps = true

	handleResize()

	if (props.initialData) {
		s.loadBlueprint(props.initialData)
		lastStructureHash = computeStructureHash(props.initialData)
		hasInitiallyLoaded = true
	}

	s.start()

	const canvas = canvasRef.value
	onCanvasPointerDownFocus = (e: PointerEvent) => {
		const tgt = e.target as HTMLElement | null
		const tag = (tgt?.tagName || '').toLowerCase()
		if (tag === 'input' || tag === 'textarea' || tag === 'select') return
		if (tgt?.isContentEditable) return
		canvas?.focus({ preventScroll: true })
	}
	containerRef.value.addEventListener('pointerdown', onCanvasPointerDownFocus, true)

	unsubViewport = s.on.on('viewport-change', (vp: { zoom: number; panX: number; panY: number }) => {
		if (isUpdatingFromProps) return
		emit('viewportChange', vp.zoom, vp.panX, vp.panY)
		s.onViewportChanged()
	})

	unsubSelect = s.selection.on.on('select', () => {
		if (isUpdatingFromProps) return
		if (isBulkUpdating()) return
		const selectedNodes = s.selection
			.getSelection()
			.filter((n) => n instanceof BlueprintNode) as BlueprintNode[]
		if (editingNodeId.value && selectedNodes.length > 1 && !isEnteringEditMode) {
			exitEditMode()
		}
		emit('selectionChange', getSelectedNodeIds())
	})
	unsubDeselect = s.selection.on.on('deselect', () => {
		if (isUpdatingFromProps) return
		if (isBulkUpdating()) return
		const selectedNodes = s.selection
			.getSelection()
			.filter((n) => n instanceof BlueprintNode) as BlueprintNode[]
		if (editingNodeId.value && selectedNodes.length === 0 && !isEnteringEditMode) {
			exitEditMode()
		}
		emit('selectionChange', getSelectedNodeIds())
	})

	const handleToolContextMenu = (e: unknown) => onToolContextMenu(e as GraphPointerEvent)
	unsubToolContextMenu = s.tools.on.on('context-menu', handleToolContextMenu)

	unsubNodeClick = s.on.on('node-click', (node: unknown) => {
		if (isBulkUpdating()) return
		if (node instanceof BlueprintNode) {
			handleSceneNodeClick(node)
		}
	})

	unsubAfterCommand = s.on.on('after-command', () => {
		if (isBulkUpdating()) {
			clearPendingChanges()
			return
		}
		emitChange()
	})

	unsubLinkDropOnCanvas = s.on.on('link-drop-on-canvas', (payload: unknown) => {
		emit(
			'linkDropOnCanvas',
			payload as {
				clientX: number
				clientY: number
				worldX: number
				worldY: number
				fromNodeId: string
				fromAnchorId: string
			}
		)
	})

	if (containerRef.value) {
		onContainerDragOver = (e: DragEvent) => {
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'copy'
			}
			e.preventDefault()
		}
		onContainerDrop = (e: DragEvent) => {
			e.preventDefault()
			const worldPos = getWorldPosFromClient(e.clientX, e.clientY)
			emit('canvasDrop', e, worldPos)
		}
		onContainerMouseMove = (e: MouseEvent) => {
			const worldPos = getWorldPosFromClient(e.clientX, e.clientY)
			lastMouseWorldPos.value = worldPos
			if (scene.value) {
				scene.value.setLastMouseWorldPos(worldPos.x, worldPos.y)
			}
		}
		containerRef.value.addEventListener('dragover', onContainerDragOver)
		containerRef.value.addEventListener('drop', onContainerDrop)
		containerRef.value.addEventListener('mousemove', onContainerMouseMove)
	}

	resizeObserver = new ResizeObserver(handleResize)
	resizeObserver.observe(containerRef.value)
	window.addEventListener('resize', handleResize)

	setupKeyboardShortcuts(s)

	// 开启多选框透明 DOM 输入框的位置轮询（每帧同步 world→screen）
	_frameLabelRafId = window.requestAnimationFrame(_frameLabelRafLoop)

	nextTick(() => {
		if (props.initialData?.viewport) {
			s.setViewport(props.initialData.viewport)
		} else {
			s.fitToContent(100)
		}
		s.onViewportChanged()
		s.requestRedraw()
		nextTick(() => {
			isUpdatingFromProps = false
			const curVp = s.getViewport()
			emit('viewportChange', curVp.zoom, curVp.panX, curVp.panY)
		})
	})
})

onUnmounted(() => {
	if (rafId) cancelAnimationFrame(rafId)
	if (_frameLabelRafId) cancelAnimationFrame(_frameLabelRafId)
	if (resizeObserver) resizeObserver.disconnect()
	window.removeEventListener('resize', handleResize)
	if (ctxCaptureKeyDown) window.removeEventListener('keydown', ctxCaptureKeyDown, true)
	if (onCanvasPointerDownFocus && containerRef.value) {
		containerRef.value.removeEventListener('pointerdown', onCanvasPointerDownFocus, true)
	}
	if (unsubToolContextMenu) unsubToolContextMenu()
	if (unsubNodeClick) unsubNodeClick()
	if (unsubSelect) unsubSelect()
	if (unsubDeselect) unsubDeselect()
	if (unsubViewport) unsubViewport()
	if (unsubAfterCommand) unsubAfterCommand()
	if (unsubLinkDropOnCanvas) unsubLinkDropOnCanvas()
	if (containerRef.value) {
		if (onContainerDragOver) containerRef.value.removeEventListener('dragover', onContainerDragOver)
		if (onContainerDrop) containerRef.value.removeEventListener('drop', onContainerDrop)
		if (onContainerMouseMove)
			containerRef.value.removeEventListener('mousemove', onContainerMouseMove)
	}
	if (changeDebounceTimer) clearTimeout(changeDebounceTimer)
	if (scene.value) {
		scene.value.dispose()
	}
})

defineExpose({
	getViewport() {
		if (!scene.value) return { zoom: 1, panX: 0, panY: 0 }
		return scene.value.getViewport()
	},

	loadBlueprint(data: LegacyBlueprintData, options?: { fitToContent?: boolean }) {
		if (!scene.value) return
		isUpdatingFromProps = true
		scene.value.loadBlueprint(data)
		lastStructureHash = computeStructureHash(data)
		hasInitiallyLoaded = true
		if (options?.fitToContent || !data.viewport) {
			scene.value.fitToContent(100)
		} else if (data.viewport) {
			scene.value.setViewport(data.viewport)
		}
		scene.value.onViewportChanged()
		scene.value.requestRedraw()
		nextTick(() => {
			isUpdatingFromProps = false
			if (scene.value) {
				const curVp = scene.value.getViewport()
				emit('viewportChange', curVp.zoom, curVp.panX, curVp.panY)
			}
		})
	},

	setViewport(viewport: { zoom: number; panX: number; panY: number }) {
		if (!scene.value) return
		isUpdatingFromProps = true
		scene.value.setViewport(viewport)
		scene.value.onViewportChanged()
		scene.value.requestRedraw()
		nextTick(() => {
			isUpdatingFromProps = false
			if (scene.value) {
				const curVp = scene.value.getViewport()
				emit('viewportChange', curVp.zoom, curVp.panX, curVp.panY)
			}
		})
	},

	saveBlueprint(): LegacyBlueprintData | null {
		if (!scene.value) return null
		return scene.value.serializeLegacy()
	},

	fitToView() {
		if (!scene.value) return
		scene.value.fitToContent(100)
		scene.value.onViewportChanged()
	},

	resetView() {
		if (!scene.value) return
		scene.value.setViewport({ zoom: 1, panX: 0, panY: 0 })
		scene.value.onViewportChanged()
	},

	zoomIn() {
		if (!scene.value) return
		scene.value.setZoom(scene.value.camera.zoom * 1.2)
		scene.value.onViewportChanged()
	},

	zoomOut() {
		if (!scene.value) return
		scene.value.setZoom(scene.value.camera.zoom / 1.2)
		scene.value.onViewportChanged()
	},

	undo() {
		scene.value?.undo()
	},

	redo() {
		scene.value?.redo()
	},

	canUndo(): boolean {
		return scene.value?.canUndo() ?? false
	},

	canRedo(): boolean {
		return scene.value?.canRedo() ?? false
	},

	hasClipboardData(): boolean {
		return scene.value?.hasClipboardData() ?? false
	},

	addNode(
		type: string,
		x: number,
		y: number,
		data?: Record<string, any>,
		opts?: { silent?: boolean; skipEditMode?: boolean }
	): string | null {
		if (!scene.value || props.readonly) return null
		const s = scene.value
		const nodeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
		const silent = opts?.silent === true
		const skipEditMode = opts?.skipEditMode === true || silent

		const baseNodeData = getDefaultNodeData(type, nodeId, x, y, data?.title)
		const nodeData: BlueprintNodeData = {
			...baseNodeData,
			...data,
			id: nodeId,
			type,
			worldX: x,
			worldY: y,
			inputs: data?.inputs ?? baseNodeData.inputs,
			outputs: data?.outputs ?? baseNodeData.outputs
		}

		s.createWorkflowNode(nodeData)
		if (!silent) {
			s.selection.setSelection([nodeId])
		}
		if (!skipEditMode) {
			enterEditMode(nodeId)
		}
		s.updateAllConnectionEndpoints()
		s.requestRedraw()
		if (!silent) {
			emitChange()
		}
		return nodeId
	},

	deleteSelection() {
		deleteSelection()
	},

	copySelection() {
		if (!scene.value) return
		const selectedNodes = scene.value.selection
			.getSelection()
			.filter((n) => n instanceof BlueprintNode) as BlueprintNode[]
		if (selectedNodes.length > 0) {
			scene.value.copySelection(selectedNodes)
		}
	},

	paste() {
		if (!scene.value || props.readonly) return
		const newNodeIds = scene.value.pasteFromMouse()
		if (newNodeIds.length > 0) {
			scene.value.selection.setSelection(newNodeIds)
			scene.value.updateAllConnectionEndpoints()
			scene.value.requestRedraw()
		}
	},

	pasteAt(worldX: number, worldY: number) {
		if (!scene.value || props.readonly) return []
		const newNodeIds = scene.value.pasteAt(worldX, worldY)
		if (newNodeIds.length > 0) {
			scene.value.selection.setSelection(newNodeIds)
			scene.value.updateAllConnectionEndpoints()
			scene.value.requestRedraw()
		}
		return newNodeIds
	},

	duplicate() {
		if (!scene.value || props.readonly) return
		const newNodeIds = scene.value.duplicateSelection(30, 30)
		if (newNodeIds.length > 0) {
			scene.value.selection.setSelection(newNodeIds)
			scene.value.updateAllConnectionEndpoints()
			scene.value.requestRedraw()
		}
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
	}): { nodeId: string | null; connected: boolean } {
		if (!scene.value || props.readonly) return { nodeId: null, connected: false }
		const s = scene.value
		const nodeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

		const baseNodeData = getDefaultNodeData(params.type, nodeId, params.x, params.y, params.title)
		const nodeData: BlueprintNodeData = {
			...baseNodeData,
			...(params.additionalData || {}),
			id: nodeId,
			type: params.type,
			worldX: params.x,
			worldY: params.y,
			inputs: params.additionalData?.inputs ?? baseNodeData.inputs,
			outputs: params.additionalData?.outputs ?? baseNodeData.outputs
		}

		s.createWorkflowNode(nodeData)

		let connected = false
		if (params.findBestInputAnchor) {
			const currentData = s.serializeLegacy()
			const toAnchorId = params.findBestInputAnchor(
				currentData.nodesById,
				params.fromNodeId,
				params.fromAnchorId,
				nodeId
			)
			if (toAnchorId) {
				const conn = s.connectNodes(params.fromNodeId, params.fromAnchorId, nodeId, toAnchorId)
				connected = !!conn
			}
		}

		s.selection.setSelection([nodeId])
		s.updateAllConnectionEndpoints()
		s.requestRedraw()
		return { nodeId, connected }
	},

	selectAll() {
		if (!scene.value) return
		scene.value.selection.setSelection(scene.value.getAllBlueprintNodes().map((n) => n.id))
		scene.value.requestRedraw()
	},

	clearSelection() {
		if (!scene.value) return
		scene.value.selection.clearSelection()
		scene.value.requestRedraw()
	},

	setSelection(nodeIds: string[]) {
		if (!scene.value) return
		const validIds = nodeIds.filter((id) => scene.value!.getBlueprintNode(id))
		scene.value.selection.setSelection(validIds)
		scene.value.requestRedraw()
	},

	setNodeStatus(nodeId: string, status: NodeStatus) {
		if (!scene.value) return
		const node = scene.value.getBlueprintNode(nodeId)
		if (node) {
			;(node.data as any).status = status
			scene.value.requestRedraw()
		}
	},

	getSelectedNodeIds(): string[] {
		return getSelectedNodeIds()
	},

	getZoom(): number {
		return scene.value?.camera.zoom ?? 1
	},

	screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
		return getWorldPosFromClient(clientX, clientY)
	},

	getScene(): BlueprintScene | null {
		return scene.value
	},

	clear() {
		if (!scene.value || props.readonly) return
		scene.value.loadBlueprint({ viewport: { zoom: 1, panX: 0, panY: 0 }, nodes: [], edges: [] })
		scene.value.selection.clearSelection()
		lastStructureHash = computeStructureHash({
			schemaVersion: 1,
			viewport: { zoom: 1, panX: 0, panY: 0 },
			nodesById: {},
			nodeOrder: [],
			edgesById: {},
			edgeOrder: [],
			resourcesById: {},
			resourceOrder: [],
			selectionTagsByKey: {}
		})
		scene.value.requestRedraw()
		emitChange()
	},

	saveSelectionFrame(label?: string): string | null {
		if (!scene.value || props.readonly) return null
		const s = scene.value
		const selectedNodes = s.selection
			.getSelection()
			.filter((n) => n instanceof BlueprintNode) as BlueprintNode[]
		if (selectedNodes.length < 2) return null
		const i18n = getI18nManager()
		const frameLabel =
			label ||
			i18n.t('aiworkflow.canvas.defaultGroupName', {
				index: s.getSavedSelectionFrames().length + 1
			})
		const frame = s.saveSelectionFrame(
			selectedNodes.map((n) => n.id),
			frameLabel
		)
		return frame.id
	},

	getSavedSelectionFrames() {
		return scene.value?.getSavedSelectionFrames() ?? []
	},

	// 查询当前蓝色临时多选框 / 绿色已保存分组框是否处于标签编辑态。
	// 编辑态下，Host 层业务快捷键（Backspace / Delete）不得删除节点，需让事件继续沿
	// Window 冒泡 → InputManager → BlueprintEditorTool.onKeyDown，由 Tool 内部处理文本编辑。
	isSelectionFrameEditing(): boolean {
		return !!(scene.value && scene.value.isSelectionFrameEditing())
	},

	deleteSavedSelectionFrame(frameId: string): boolean {
		if (!scene.value || props.readonly) return false
		return scene.value.deleteSavedSelectionFrame(frameId)
	},

	renameSavedSelectionFrame(frameId: string, newLabel: string): boolean {
		if (!scene.value || props.readonly) return false
		return scene.value.renameSavedSelectionFrame(frameId, newLabel)
	},

	getNodeCount(): number {
		return scene.value?.getAllBlueprintNodes().length ?? 0
	},

	getEdgeCount(): number {
		return scene.value?.getAllConnections().length ?? 0
	},

	getNodeScreenRect(
		nodeId: string
	): { left: number; top: number; width: number; height: number; nodeType?: string } | null {
		if (!scene.value || !containerRef.value) return null
		const s = scene.value
		const node = s.getBlueprintNode(nodeId)
		if (!node) return null
		const nw = node.data.width || DEFAULT_NODE_SIZES.base.width
		const nh = node.data.height || DEFAULT_NODE_SIZES.base.height
		const topLeft = s.camera.worldToScreen(new Vector2(node.data.worldX, node.data.worldY))
		return {
			left: topLeft.x,
			top: topLeft.y,
			width: nw * s.camera.zoom,
			height: nh * s.camera.zoom,
			nodeType: node.nodeType || node.data.type
		}
	},

	updateNodeData(nodeId: string, patch: Record<string, any>, opts?: { silent?: boolean }): boolean {
		if (!scene.value || props.readonly) return false
		const s = scene.value
		const node = s.getBlueprintNode(nodeId)
		if (!node) return false
		node.setData(patch)
		if (patch.inputs || patch.outputs) {
			s.updateAllConnectionEndpoints()
		}
		s.requestRedraw()
		if (!opts?.silent && !isBulkUpdating()) {
			emitChange()
		}
		return true
	},

	setLegacyResource(resourceId: string, resourceData: Partial<LegacyResourceData>): void {
		if (!scene.value) return
		const s = scene.value
		const existing = (s as any)._legacyResources[resourceId] || {}
		;(s as any)._legacyResources[resourceId] = { ...existing, ...resourceData }
		s.requestRedraw()
	},

	moveNode(nodeId: string, x: number, y: number): boolean {
		if (!scene.value || props.readonly) return false
		const s = scene.value
		const node = s.getBlueprintNode(nodeId)
		if (!node) return false
		const startPositions = new Map<string, Vector2>()
		const endPositions = new Map<string, Vector2>()
		startPositions.set(nodeId, new Vector2(node.data.worldX, node.data.worldY))
		endPositions.set(nodeId, new Vector2(x, y))
		const moveFn = (id: string, pos: Vector2) => {
			const n = s.getBlueprintNode(id)
			if (n) n.setPosition(pos.x, pos.y)
		}
		s.executeCommand(new MoveNodeCommand(startPositions, endPositions, moveFn))
		s.updateAllConnectionEndpoints()
		s.requestRedraw()
		return true
	},

	moveNodesByDelta(nodeIds: string[], dx: number, dy: number): boolean {
		if (!scene.value || props.readonly) return false
		const s = scene.value
		const startPositions = new Map<string, Vector2>()
		const endPositions = new Map<string, Vector2>()
		for (const nodeId of nodeIds) {
			const node = s.getBlueprintNode(nodeId)
			if (node) {
				startPositions.set(nodeId, new Vector2(node.data.worldX, node.data.worldY))
				endPositions.set(nodeId, new Vector2(node.data.worldX + dx, node.data.worldY + dy))
			}
		}
		if (startPositions.size === 0) return false
		const moveFn = (id: string, pos: Vector2) => {
			const n = s.getBlueprintNode(id)
			if (n) n.setPosition(pos.x, pos.y)
		}
		s.executeCommand(new MoveNodeCommand(startPositions, endPositions, moveFn))
		s.updateAllConnectionEndpoints()
		s.requestRedraw()
		return true
	},

	connectPorts(
		fromNodeId: string,
		fromAnchorId: string,
		toNodeId: string,
		toAnchorId: string,
		opts?: { silent?: boolean }
	): boolean {
		if (!scene.value || props.readonly) return false
		const conn = scene.value.connectNodes(fromNodeId, fromAnchorId, toNodeId, toAnchorId)
		if (conn) {
			scene.value.updateAllConnectionEndpoints()
			scene.value.requestRedraw()
			if (!opts?.silent && !isBulkUpdating()) {
				emitChange()
			}
			return true
		}
		return false
	},

	clearPendingChanges(): void {
		clearPendingChanges()
	},

	beginBulkUpdate(): void {
		beginBulkUpdate()
	},

	endBulkUpdate(): void {
		const wasAtDepth1 = _bulkUpdateDepth === 1
		endBulkUpdate()
		// 只有当完全退出bulk update模式时才触发一次emitChange
		// 使用防抖的emitChange而非直接emit('change')，这样与其他emitChange调用一致
		// 且isUpdatingFromStore保护机制可以正确阻止过早的同步
		if (wasAtDepth1 && _bulkUpdateDepth === 0) {
			console.log('[BlueprintEditor] endBulkUpdate: fully exited bulk mode, scheduling emitChange')
			emitChange()
		}
	},

	isBulkUpdating(): boolean {
		return isBulkUpdating()
	},

	removeNode(nodeId: string): boolean {
		if (!scene.value || props.readonly) return false
		const node = scene.value.getBlueprintNode(nodeId)
		if (!node) return false
		scene.value.executeCommand(new DeleteSelectionCommand(scene.value, [nodeId], []))
		scene.value.selection.clearSelection()
		scene.value.updateAllConnectionEndpoints()
		scene.value.requestRedraw()
		return true
	},

	removeEdge(edgeId: string): boolean {
		if (!scene.value || props.readonly) return false
		const conn = scene.value.getConnection(edgeId)
		if (!conn) return false
		scene.value.executeCommand(new DeleteSelectionCommand(scene.value, [], [edgeId]))
		scene.value.updateAllConnectionEndpoints()
		scene.value.requestRedraw()
		return true
	},

	// FX2: Vuex→Engine 边同步 — 添加连接到引擎场景
	addEdge(edge: {
		id: string
		fromNodeId: string
		fromAnchorId: string
		toNodeId: string
		toAnchorId: string
		createdAt?: number
	}): boolean {
		if (!scene.value || props.readonly) return false
		// 幂等检查：如果连接已存在则跳过
		if (scene.value.getConnection(edge.id)) return true
		const conn = scene.value.addConnection({
			id: edge.id,
			fromNodeId: edge.fromNodeId,
			fromAnchorId: edge.fromAnchorId,
			toNodeId: edge.toNodeId,
			toAnchorId: edge.toAnchorId,
			createdAt: edge.createdAt ?? Date.now()
		})
		if (conn) {
			scene.value.updateAllConnectionEndpoints()
			scene.value.requestRedraw()
			return true
		}
		return false
	},

	setNodeSize(nodeId: string, width?: number, height?: number): boolean {
		if (!scene.value || props.readonly) return false
		scene.value.setNodeSize(nodeId, width, height)
		return true
	},

	setNodePosition(nodeId: string, worldX: number, worldY: number): boolean {
		if (!scene.value || props.readonly) return false
		scene.value.setNodePosition(nodeId, worldX, worldY)
		return true
	},

	updateNodePositionDirect(nodeId: string, worldX: number, worldY: number): void {
		if (!scene.value) return
		scene.value.updateNodePositionDirect(nodeId, worldX, worldY)
	},

	updateNodesPositionDirect(nodePositions: Map<string, { x: number; y: number }>): void {
		if (!scene.value) return
		scene.value.updateNodesPositionDirect(nodePositions)
	},

	commitNodeMovement(
		startPositions: Map<string, { x: number; y: number }>,
		endPositions: Map<string, { x: number; y: number }>
	): void {
		if (!scene.value) return
		scene.value.commitNodeMovement(startPositions, endPositions)
	},

	setSelectedNode(nodeId: string | null): void {
		if (!scene.value) return
		scene.value.setSelectedNode(nodeId)
	},

	setSelectedNodes(nodeIds: string[], primaryNodeId?: string | null): void {
		if (!scene.value) return
		scene.value.setSelectedNodes(nodeIds, primaryNodeId)
	},

	setEngineViewport(zoom: number, panX: number, panY: number): void {
		if (!scene.value) return
		scene.value.setEngineViewport(zoom, panX, panY)
	},

	focusNode(nodeId: string): boolean {
		if (!scene.value) return false
		return scene.value.focusNode(nodeId)
	},

	getNode(nodeId: string): BlueprintNode | null {
		return scene.value?.getBlueprintNode(nodeId) ?? null
	}
})
</script>

<style scoped>
.blueprint-editor {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	background: var(--wf-page-bg, #15181c);
	position: relative;
	overflow: hidden;
}

.bp-readonly {
	pointer-events: none;
}

.bp-canvas-container {
	flex: 1;
	position: relative;
	overflow: hidden;
}

.bp-canvas-container canvas {
	display: block;
	cursor: default;
	outline: none;
}
</style>
