import { Tool } from '../graphbase/tools/Tool'
import type {
	GraphPointerEvent,
	GraphKeyboardEvent,
	GraphWheelEvent
} from '../graphbase/input/events'
import type { HitTestResult } from '../graphbase/scene/interfaces'
import type { RenderContext } from '../graphbase/renderer/RenderContext'
import { Vector2 } from '../graphbase/core/Vector2'
import { Rect } from '../graphbase/core/Rect'
import { Port } from './Port'
import { BlueprintNode } from './BlueprintNode'
import { Connection } from './Connection'
import type { BlueprintScene } from './BlueprintScene'
import { MoveNodeCommand } from '../graphbase/commands/CompositeCommand'
import { ResizeNodeCommand } from './commands/ResizeNodeCommand'
import { CreateConnectionCommand } from './commands/CreateConnectionCommand'
import { DeleteSelectionCommand } from './commands/DeleteSelectionCommand'
import {
	computeSelectionBounds,
	drawSelectionFrame,
	getEditingFrameLabelWorldRect,
	pointInFrameDragArea,
	pointInSavedFrameTagBar,
	pointInSavedFrameDeleteBtn,
	pointInTempFrameInput,
	pointInTempFrameSaveBtn,
	type EditingFrameLabelWorldRectResult,
	type FrameEditState,
	SELECTION_FRAME_CONSTANTS,
	type SavedSelectionFrame
} from './SelectionFrame'
import { MIN_NODE_WIDTH, MIN_NODE_HEIGHT, type ResizeCorner } from './types'
import {
	computeAutomationOuterRect,
	getAutomationBarWorldRect,
	getFrameBodyWorldRect,
	layoutPortalAnchors,
	toggleBinding,
	clampLoopCount,
	AUTOMATION_BAR_HEIGHT as AUTOMATION_BAR_VISUAL_HEIGHT,
	type AutomationBarHit,
	type PortalAnchorGeometry,
	type PortalDirection,
	type PortalLayoutInput
} from './frame-automation'
import {
	drawAutomationToggle,
	drawAutomationBar,
	drawPortalAnchors,
	drawBindingCandidates,
	hitTestAutomationToggle,
	hitTestAutomationBar,
	hitTestPortalAnchor,
	hitTestPortalRemove,
	computeBarLayout,
	type BindingMode
} from './frame-automation/FrameAutomationToolbar'

enum DragMode {
	NONE,
	NODES,
	SELECTION_FRAME,
	SAVED_FRAME,
	RESIZE
}

const ANCHOR_MAGNET_DISTANCE = 15
const DRAG_BOUNDARY = 100000
const DOUBLE_CLICK_MS = 300
const CLICK_DRAG_THRESHOLD = 4
const RIGHT_PAN_THRESHOLD_DIST = 4

export class BlueprintEditorTool extends Tool {
	private dragging: boolean = false
	private dragMoved: boolean = false
	private connecting: boolean = false
	private spacePanning: boolean = false
	private rightPanning: boolean = false
	private rightDownPos: Vector2 = new Vector2()
	private rightPanStarted: boolean = false
	private suppressContextMenu: boolean = false
	private lastPanPos: Vector2 = new Vector2()
	private pendingFromPort: Port | null = null
	private pendingFromNode: BlueprintNode | null = null
	private magnetedPort: Port | null = null
	private dragMode: DragMode = DragMode.NONE
	private dragStartScreen: Vector2 = new Vector2()
	private dragLastScreen: Vector2 = new Vector2()
	private dragSavedFrameId: string | null = null
	private tempSelectionBounds: Rect | null = null
	private savedFrameLabelWidths: Map<string, number> = new Map()
	private resizeNode: BlueprintNode | null = null
	private resizeCorner: ResizeCorner | null = null
	private resizeStartWidth: number = 0
	private resizeStartHeight: number = 0
	private resizeStartX: number = 0
	private resizeStartY: number = 0
	private resizeAspectRatio: number | null = null
	private moveStartPositions: Map<string, Vector2> = new Map()

	private editingTempInput: boolean = false
	private editingSavedFrameId: string | null = null
	private editText: string = ''
	/** IME 组合中：compositionstart=true，compositionend=false；为 true 期间 keydown 不处理字符输入/退格，避免打断输入法候选字 */
	private isComposing: boolean = false

	// —— 多选组合自动化 ——
	/** 绑定模式：none / 正在设定输入锚点 / 正在设定输出锚点 */
	private automationMode: BindingMode = 'none'
	private activeAutomationFrameId: string | null = null
	/** 正在编辑循环次数的绿框 ID（透明 DOM 数字输入语境） */
	private editingLoopFrameId: string | null = null
	private loopEditText: string = ''
	private hoveredPortalKey: string | null = null
	private lastClickTime: number = 0
	private lastClickScreen: Vector2 = new Vector2()
	private pendingClickNode: BlueprintNode | null = null
	private clickDownScreen: Vector2 = new Vector2()

	constructor() {
		super('blueprint_editor', 'default')
	}

	// 供外部（BlueprintScene / Host 层业务快捷键）查询当前 Canvas 虚拟输入框是否处于编辑中。
	// 编辑中时，Backspace/Delete 应只修改输入框文字，不触发删除节点动作。
	get isEditingFrameLabel(): boolean {
		return this.editingTempInput || this.editingSavedFrameId !== null
	}

	/** 供 Vue 层 DOM input 查询当前编辑文本（初始化为 input.value，避免一进入编辑就丢失已输入字符） */
	getEditingFrameText(): string {
		return this.editText
	}

	/**
	 * Vue 层 DOM <input> 产生 @input / @compositionend 事件时，直接把 value 同步到 Tool.editText。
	 * 直接修改 editText 并请求重绘；不做 commit，不做 keydown 分支校验，不进入命令栈。
	 */
	setEditTextDirectly(newText: string): void {
		if (typeof newText !== 'string') return
		if (newText === this.editText) return
		this.editText = newText
		this.bpScene.requestRedraw()
	}

	/**
	 * 设置 IME 组合态。compositionstart → setComposing(true)；compositionend → setComposing(false)。
	 * 组合态期间：keydown 分支内 退格/字符输入 全部跳过（退化为 DOM <input> 原生处理，然后 setEditTextDirectly 回传）。
	 */
	setComposing(val: boolean): void {
		this.isComposing = !!val
	}
	get isComposingFrameLabel(): boolean {
		return this.isComposing
	}

	/**
	 * 提交当前编辑（Blur/Enter）。
	 * - 蓝框：保存为绿色分组
	 * - 绿框：修改标签
	 * - 若当前未编辑，直接 NOP（防 onPointerDown 外部 commit 后 blur 再次 commit 重复执行）
	 */
	commitEditByBlurOrEnter(): void {
		if (!this.editingTempInput && !this.editingSavedFrameId) return
		if (this.editingTempInput) {
			this.commitTempEdit()
		} else if (this.editingSavedFrameId) {
			this.commitSavedFrameEdit()
		}
	}

	/** Esc 取消当前编辑，不保存任何修改；未编辑则 NOP。 */
	cancelEditByEsc(): void {
		if (!this.editingTempInput && !this.editingSavedFrameId) return
		this.cancelEdit()
	}

	/**
	 * 计算当前编辑态下（蓝/绿）标签输入框的 world 坐标矩形。
	 * 返回 null 表示当前没有编辑。
	 * Vue 层会把该 worldRect 通过 camera.worldToScreen 转成 DOM <input> 的 left/top/width/height（像素单位）。
	 */
	getEditingFrameLabelWorldRect(): EditingFrameLabelWorldRectResult | null {
		const scene = this.bpScene
		if (!this.editingTempInput && !this.editingSavedFrameId) return null
		const ctx = scene.canvas.getContext('2d')
		if (!ctx) return null
		const camera = scene.camera

		if (this.editingSavedFrameId) {
			const frame = scene.getSavedSelectionFrame(this.editingSavedFrameId)
			if (!frame) return null
			const nodes = scene.getNodesByIds(frame.nodeIds)
			if (nodes.length < 2) return null
			const worldRect = computeSelectionBounds(nodes)
			if (!worldRect) return null
			const savedTextWidth = this.savedFrameLabelWidths.get(frame.id) ?? 0
			return getEditingFrameLabelWorldRect(
				ctx,
				worldRect,
				camera.zoom,
				true,
				{ savedLabelTextWidth: savedTextWidth },
				frame.id,
				false,
				this.editingSavedFrameId
			)
		}

		if (this.editingTempInput) {
			if (!this.tempSelectionBounds) return null
			if (this.isSelectionMatchingAnySavedFrame()) return null
			const sel = this.manager!.selection
			const count = sel.getSelection().filter((n) => n instanceof BlueprintNode).length
			if (count < 2) return null
			return getEditingFrameLabelWorldRect(
				ctx,
				this.tempSelectionBounds,
				camera.zoom,
				false,
				count,
				null,
				true,
				null
			)
		}
		return null
	}

	private get bpScene(): BlueprintScene {
		return this.manager!.scene as BlueprintScene
	}

	private getEditState(cameraZoom: number): FrameEditState {
		const time = performance.now()
		return {
			editingTempInput: this.editingTempInput,
			editingFrameId: this.editingSavedFrameId,
			editText: this.editText,
			cursorBlink: Math.floor(time / 500) % 2 === 0
		}
	}

	private startEditTempInput(defaultText: string = ''): void {
		this.editingTempInput = true
		this.editingSavedFrameId = null
		this.editText = defaultText
	}

	private startEditSavedFrame(frameId: string, currentLabel: string): void {
		this.editingSavedFrameId = frameId
		this.editingTempInput = false
		this.editText = currentLabel
	}

	private cancelEdit(): void {
		this.editingTempInput = false
		this.editingSavedFrameId = null
		this.editText = ''
	}

	private commitTempEdit(): void {
		const scene = this.bpScene
		const sel = this.manager!.selection
		const selectedNodes = sel
			.getSelection()
			.filter((n) => n instanceof BlueprintNode) as BlueprintNode[]

		if (selectedNodes.length >= 2) {
			const label = this.editText.trim() || `分组 ${scene.getSavedSelectionFrames().length + 1}`
			scene.saveSelectionFrame(
				selectedNodes.map((n) => n.id),
				label
			)
		}
		this.cancelEdit()
	}

	private commitSavedFrameEdit(): void {
		if (this.editingSavedFrameId) {
			const newLabel = this.editText.trim()
			if (newLabel) {
				this.bpScene.renameSavedSelectionFrame(this.editingSavedFrameId, newLabel)
			}
		}
		this.cancelEdit()
	}

	private findParentNode(node: any): BlueprintNode | null {
		let p = node
		while (p) {
			if (p instanceof BlueprintNode) return p
			p = p.parent
		}
		return null
	}

	private updateTempSelectionBounds(): void {
		const sel = this.manager!.selection
		const nodes = sel.getSelection().filter((n) => n instanceof BlueprintNode) as BlueprintNode[]
		this.tempSelectionBounds = computeSelectionBounds(nodes)
	}

	/**
	 * 判断当前选中的节点集合是否正好匹配任意一个已保存的绿色多选框。
	 * 用于：当用户移动绿色多选框后，隐藏蓝色临时框（因为绿色框已覆盖），
	 * 避免用户再次保存产生重叠的重复框。
	 */
	private isSelectionMatchingAnySavedFrame(): boolean {
		const sel = this.manager!.selection
		const selectedNodes = sel
			.getSelection()
			.filter((n) => n instanceof BlueprintNode) as BlueprintNode[]
		const selectedIds = selectedNodes.map((n) => n.id)
		if (selectedIds.length < 2) return false

		const scene = this.bpScene
		const savedFrames = scene.getSavedSelectionFrames()
		if (savedFrames.length === 0) return false

		const sortedSelected = [...selectedIds].sort().join('|')
		for (const frame of savedFrames) {
			if (frame.nodeIds.length !== selectedIds.length) continue
			const sortedFrameIds = [...frame.nodeIds].sort().join('|')
			if (sortedFrameIds === sortedSelected) {
				return true
			}
		}
		return false
	}

	private clampSelectionToBoundary(): void {
		const sel = this.manager!.selection
		const nodes = sel.getSelection().filter((n) => n instanceof BlueprintNode) as BlueprintNode[]
		if (nodes.length === 0) return

		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity
		for (const node of nodes) {
			const b = node.getWorldBounds()
			if (b.x < minX) minX = b.x
			if (b.y < minY) minY = b.y
			if (b.x + b.width > maxX) maxX = b.x + b.width
			if (b.y + b.height > maxY) maxY = b.y + b.height
		}

		let adjustX = 0,
			adjustY = 0
		if (minX < -DRAG_BOUNDARY) adjustX = -DRAG_BOUNDARY - minX
		if (maxX > DRAG_BOUNDARY) adjustX = DRAG_BOUNDARY - maxX
		if (minY < -DRAG_BOUNDARY) adjustY = -DRAG_BOUNDARY - minY
		if (maxY > DRAG_BOUNDARY) adjustY = DRAG_BOUNDARY - maxY

		if (adjustX !== 0 || adjustY !== 0) {
			for (const node of nodes) {
				node.translate(adjustX, adjustY)
			}
		}
	}

	private measureSavedFrameLabels(): void {
		const scene = this.bpScene
		const frames = scene.getSavedSelectionFrames()
		const ctx = scene.canvas.getContext('2d')
		if (!ctx) return
		const zoom = scene.camera.zoom

		this.savedFrameLabelWidths.clear()
		for (const frame of frames) {
			ctx.save()
			ctx.font = `500 ${11 / zoom}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
			const metrics = ctx.measureText(frame.label)
			// Store world-space text width (matching drawSelectionFrame calculation)
			// labelWidth in drawSelectionFrame = max(textMetrics.width + padding/zoom, 36/zoom)
			const worldTextWidth = metrics.width
			this.savedFrameLabelWidths.set(frame.id, worldTextWidth)
			ctx.restore()
		}
	}

	private hitTestSavedFrame(
		screenPoint: Vector2
	): { frameId: string; hitDelete: boolean; hitTagBar: boolean } | null {
		const scene = this.bpScene
		const camera = scene.camera
		const frames = scene.getSavedSelectionFrames()

		for (let i = frames.length - 1; i >= 0; i--) {
			const frame = frames[i]
			const nodes = scene.getNodesByIds(frame.nodeIds)
			if (nodes.length < 2) continue
			const bounds = computeSelectionBounds(nodes)
			if (!bounds) continue

			const labelWidth = this.savedFrameLabelWidths.get(frame.id) ?? 0
			if (pointInSavedFrameDeleteBtn(screenPoint, bounds, labelWidth, camera)) {
				return { frameId: frame.id, hitDelete: true, hitTagBar: true }
			}
			if (pointInSavedFrameTagBar(screenPoint, bounds, labelWidth, camera)) {
				return { frameId: frame.id, hitDelete: false, hitTagBar: true }
			}
		}
		return null
	}

	private hitTestTempFrameDragArea(screenPoint: Vector2): boolean {
		if (!this.tempSelectionBounds) return false
		if (this.isSelectionMatchingAnySavedFrame()) return false
		const camera = this.bpScene.camera
		return pointInFrameDragArea(screenPoint, this.tempSelectionBounds, camera)
	}

	private hitTestTempFrameInput(screenPoint: Vector2): boolean {
		if (!this.tempSelectionBounds) return false
		if (this.isSelectionMatchingAnySavedFrame()) return false
		const camera = this.bpScene.camera
		const sel = this.manager!.selection
		const count = sel.getSelection().filter((n) => n instanceof BlueprintNode).length
		if (count < 2) return false
		return pointInTempFrameInput(screenPoint, this.tempSelectionBounds, count, camera)
	}

	private hitTestTempFrameSaveBtn(screenPoint: Vector2): boolean {
		if (!this.tempSelectionBounds) return false
		if (this.isSelectionMatchingAnySavedFrame()) return false
		const camera = this.bpScene.camera
		const sel = this.manager!.selection
		const count = sel.getSelection().filter((n) => n instanceof BlueprintNode).length
		if (count < 2) return false
		return pointInTempFrameSaveBtn(screenPoint, this.tempSelectionBounds, count, camera)
	}

	// ================= 多选组合自动化（frame-automation） =================

	/** 绑定模式 / 循环次数输入中（Host 删除快捷键守卫用） */
	get isFrameAutomationInteracting(): boolean {
		return this.automationMode !== 'none' || this.editingLoopFrameId !== null
	}

	get isEditingAutomationLoop(): boolean {
		return this.editingLoopFrameId !== null
	}

	getAutomationLoopText(): string {
		return this.loopEditText
	}

	getActiveAutomationFrameId(): string | null {
		return this.activeAutomationFrameId
	}

	getAutomationMode(): BindingMode {
		return this.automationMode
	}

	private getAutomationCtx(): CanvasRenderingContext2D | null {
		return this.bpScene.canvas.getContext('2d')
	}

	/** 绿框外框（开启自动化时含按钮条扩展行） */
	getFrameOuterRect(frame: SavedSelectionFrame): Rect | null {
		const nodes = this.bpScene.getNodesByIds(frame.nodeIds)
		const base = computeSelectionBounds(nodes)
		if (!base) return null
		return computeAutomationOuterRect(base, !!frame.automation?.enabled)
	}

	/** 计算某绿框两侧门户锚点的当前几何（派生，随节点移动/视口变化） */
	buildFramePortals(frame: SavedSelectionFrame): {
		in: PortalAnchorGeometry[]
		out: PortalAnchorGeometry[]
	} {
		const scene = this.bpScene
		const zoom = scene.camera.zoom
		const empty = { in: [] as PortalAnchorGeometry[], out: [] as PortalAnchorGeometry[] }
		if (!frame.automation?.enabled) return empty
		const outer = this.getFrameOuterRect(frame)
		if (!outer) return empty
		const bodyRect = getFrameBodyWorldRect(outer, true, zoom)

		const build = (direction: PortalDirection): PortalAnchorGeometry[] => {
			const bindings =
				direction === 'in' ? frame.automation!.inputBindings : frame.automation!.outputBindings
			const items: PortalLayoutInput[] = bindings.map((b) => {
				const node = scene.getBlueprintNode(b.nodeId)
				const port = node
					? direction === 'in'
						? node.getInputPort(b.anchorId)
						: node.getOutputPort(b.anchorId)
					: null
				return {
					binding: b,
					worldY: port ? port.getWorldPosition().y : null
				}
			})
			return layoutPortalAnchors(items, bodyRect, direction, zoom)
		}

		return { in: build('in'), out: build('out') }
	}

	/** 门户锚点是否已有外部连线（端点指向组内真实锚点） */
	private isPortalConnected(p: PortalAnchorGeometry): boolean {
		const scene = this.bpScene
		for (const conn of scene.getAllConnections()) {
			if (p.direction === 'in') {
				if (conn.data.toNodeId === p.nodeId && conn.data.toAnchorId === p.anchorId) return true
			} else {
				if (conn.data.fromNodeId === p.nodeId && conn.data.fromAnchorId === p.anchorId) return true
			}
		}
		return false
	}

	private setAutomationMode(frameId: string, mode: BindingMode): void {
		if (this.automationMode === mode && this.activeAutomationFrameId === frameId) {
			this.automationMode = 'none'
			this.activeAutomationFrameId = null
		} else {
			this.automationMode = mode
			this.activeAutomationFrameId = frameId
		}
		this.bpScene.requestRedraw()
	}

	private exitAutomationMode(): void {
		this.automationMode = 'none'
		this.activeAutomationFrameId = null
		this.bpScene.requestRedraw()
	}

	private startLoopEdit(frameId: string): void {
		const cfg = this.bpScene.getFrameAutomation(frameId)
		if (!cfg?.enabled) return
		this.editingLoopFrameId = frameId
		this.loopEditText = String(cfg.loopCount)
		this.bpScene.requestRedraw()
	}

	setLoopEditTextDirectly(v: string): void {
		if (typeof v !== 'string' || v === this.loopEditText) return
		this.loopEditText = v
		this.bpScene.requestRedraw()
	}

	private commitLoopEdit(): void {
		if (!this.editingLoopFrameId) return
		const frameId = this.editingLoopFrameId
		const n = clampLoopCount(parseInt(this.loopEditText, 10))
		this.bpScene.configureFrameAutomation(frameId, { loopCount: n })
		this.editingLoopFrameId = null
		this.loopEditText = ''
		this.bpScene.requestRedraw()
	}

	private cancelLoopEdit(): void {
		this.editingLoopFrameId = null
		this.loopEditText = ''
		this.bpScene.requestRedraw()
	}

	commitAutomationLoopEdit(): void {
		this.commitLoopEdit()
	}

	cancelAutomationLoopEdit(): void {
		this.cancelLoopEdit()
	}

	getAutomationLoopEditWorldRect(): EditingFrameLabelWorldRectResult | null {
		if (!this.editingLoopFrameId) return null
		const scene = this.bpScene
		const frame = scene.getSavedSelectionFrame(this.editingLoopFrameId)
		if (!frame?.automation?.enabled) return null
		const outer = this.getFrameOuterRect(frame)
		if (!outer) return null
		const ctx = this.getAutomationCtx()
		if (!ctx) return null
		const barRect = getAutomationBarWorldRect(outer, scene.camera.zoom)
		const runState = scene.getFrameAutomationRunState(frame.id)
		const layout = computeBarLayout(
			ctx,
			barRect,
			scene.camera.zoom,
			frame.automation,
			this.automationMode,
			runState
		)
		const r = layout.loopInput
		return {
			inputWorldRect: r,
			textOriginWorldX: r.x + 6 / scene.camera.zoom,
			textBaselineCenterWorldY: r.y + r.height / 2,
			fontSizeWorld: 11 / scene.camera.zoom
		}
	}

	/** 绑定模式下点击成员锚点：增删门户绑定 */
	private toggleMemberPortBinding(
		frameId: string,
		direction: PortalDirection,
		node: BlueprintNode,
		port: Port
	): void {
		const scene = this.bpScene
		const cfg = scene.getFrameAutomation(frameId)
		if (!cfg?.enabled) return
		const nodeName =
			String(node.alias ?? node.title ?? node.data.title ?? node.id).trim() || node.id
		const label = `${nodeName} · ${port.spec.label ?? port.spec.id}`
		const next = toggleBinding(cfg, direction, node.id, port.spec.id, label, port.mediaType)
		scene.configureFrameAutomation(
			frameId,
			direction === 'in' ? { inputBindings: next.bindings } : { outputBindings: next.bindings }
		)
	}

	private handleAutomationBarHit(frameId: string, hit: AutomationBarHit): void {
		const scene = this.bpScene
		const cfg = scene.getFrameAutomation(frameId)
		if (!cfg) return
		switch (hit) {
			case 'loop-minus':
				scene.configureFrameAutomation(frameId, { loopCount: cfg.loopCount - 1 })
				return
			case 'loop-plus':
				scene.configureFrameAutomation(frameId, { loopCount: cfg.loopCount + 1 })
				return
			case 'loop-input':
				this.startLoopEdit(frameId)
				return
			case 'set-inputs':
				this.setAutomationMode(frameId, 'binding-input')
				return
			case 'set-outputs':
				this.setAutomationMode(frameId, 'binding-output')
				return
			case 'exit':
				this.exitAutomationMode()
				return
			case 'run':
				if (scene.getFrameAutomationRunState(frameId)?.status === 'running') return
				scene.setFrameAutomationRunState(frameId, {
					status: 'running',
					currentIteration: 0,
					totalIterations: cfg.loopCount
				})
				scene.requestFrameAutomationRun(frameId)
				return
		}
	}

	/**
	 * 命中绿框自动化 UI（开关 / 按钮条 / 门户锚点 / 门户解绑×）。
	 * 从顶层层叠顺序逆序遍历（后保存的框在上）。
	 */
	private hitTestAutomationControls(
		screenPoint: Vector2
	):
		| { kind: 'toggle'; frameId: string }
		| { kind: 'bar'; frameId: string; hit: AutomationBarHit }
		| { kind: 'portal'; frameId: string; portal: PortalAnchorGeometry }
		| { kind: 'portal-remove'; frameId: string; portal: PortalAnchorGeometry }
		| null {
		const scene = this.bpScene
		const camera = scene.camera
		const ctx = this.getAutomationCtx()
		const frames = scene.getSavedSelectionFrames()
		for (let i = frames.length - 1; i >= 0; i--) {
			const frame = frames[i]
			const nodes = scene.getNodesByIds(frame.nodeIds)
			if (nodes.length < 2) continue
			const outer = this.getFrameOuterRect(frame)
			if (!outer) continue

			if (frame.automation?.enabled) {
				const portals = this.buildFramePortals(frame)
				const allPortals = [...portals.in, ...portals.out]
				const removed = hitTestPortalRemove(screenPoint, allPortals, camera)
				if (removed) return { kind: 'portal-remove', frameId: frame.id, portal: removed }
				// 绑定模式下，门户与最左/最右成员节点的真实锚点在框边线上几何重合，
				// 点击必须让位给绑定模式（toggle 成员锚点 / 吞掉），不能从门户发起连线——
				// 否则原地松手即触发 link-drop-on-canvas 弹出节点库面板。
				// 门户右上角的「×」解绑仍由上方 hitTestPortalRemove 优先处理。
				if (this.automationMode === 'none') {
					const portal = hitTestPortalAnchor(screenPoint, allPortals, camera)
					if (portal) return { kind: 'portal', frameId: frame.id, portal }
				}

				if (ctx) {
					const barRect = getAutomationBarWorldRect(outer, camera.zoom)
					const runState = scene.getFrameAutomationRunState(frame.id)
					const barHit = hitTestAutomationBar(
						screenPoint,
						ctx,
						barRect,
						camera,
						frame.automation,
						this.activeAutomationFrameId === frame.id ? this.automationMode : 'none',
						runState
					)
					if (barHit) return { kind: 'bar', frameId: frame.id, hit: barHit }
				}
			}

			if (hitTestAutomationToggle(screenPoint, outer, camera)) {
				return { kind: 'toggle', frameId: frame.id }
			}
		}
		return null
	}

	/** 绑定模式下命中原版内部锚点（返回锚点+方向），用于候选高亮与点击绑定 */
	private hitTestBindingCandidate(
		screenPoint: Vector2
	): { node: BlueprintNode; port: Port; direction: PortalDirection } | null {
		if (this.automationMode === 'none' || !this.activeAutomationFrameId) return null
		const scene = this.bpScene
		const frame = scene.getSavedSelectionFrame(this.activeAutomationFrameId)
		if (!frame) return null
		const memberSet = new Set(frame.nodeIds)
		const wantInput = this.automationMode === 'binding-input'
		// 复用场景命中：沿成员节点端口做屏幕距离命中
		const z = scene.camera.zoom
		let best: { node: BlueprintNode; port: Port; direction: PortalDirection; d: number } | null =
			null
		for (const node of scene.getAllBlueprintNodes()) {
			if (!memberSet.has(node.id)) continue
			const ports = wantInput ? node.inputPorts : node.outputPorts
			for (const port of ports) {
				const sp = scene.camera.worldToScreen(port.getWorldPosition())
				const d = Math.hypot(sp.x - screenPoint.x, sp.y - screenPoint.y)
				if (d <= 22 * z && (!best || d < best.d)) {
					best = { node, port, direction: wantInput ? 'in' : 'out', d }
				}
			}
		}
		return best ? { node: best.node, port: best.port, direction: best.direction } : null
	}

	private hitTestResizeHandle(
		screenPoint: Vector2
	): { node: BlueprintNode; corner: ResizeCorner } | null {
		const scene = this.bpScene
		const camera = scene.camera
		const invZoom = 1 / camera.zoom
		const worldPoint = camera.screenToWorld(screenPoint)

		const allNodes = scene.getAllBlueprintNodes()
		for (let i = allNodes.length - 1; i >= 0; i--) {
			const node = allNodes[i]
			if (!node.selected && !node.hoveredResizeCorner) continue
			const localPoint = node.worldToLocal(worldPoint)
			const corner = node.getResizeCornerAtPoint(localPoint, invZoom)
			if (corner) {
				return { node, corner }
			}
		}
		return null
	}

	private isDoubleClick(screenPoint: Vector2): boolean {
		const now = performance.now()
		const dt = now - this.lastClickTime
		const dist = Math.hypot(
			screenPoint.x - this.lastClickScreen.x,
			screenPoint.y - this.lastClickScreen.y
		)
		this.lastClickTime = now
		this.lastClickScreen.copy(screenPoint)
		return dt < DOUBLE_CLICK_MS && dist < 5
	}

	onPointerDown(event: GraphPointerEvent, hit: HitTestResult | null): void {
		const scene = this.bpScene
		const sel = this.manager!.selection
		const drag = this.manager!.drag

		if (scene.isDomInteractionLocked) {
			return
		}

		this.pendingClickNode = null
		this.dragging = false
		this.dragMoved = false
		this.dragMode = DragMode.NONE
		this.resizeNode = null
		this.resizeCorner = null
		this.connecting = false
		this.dragSavedFrameId = null
		this.pendingFromPort = null
		this.pendingFromNode = null
		this.magnetedPort = null
		this.hoveredPortalKey = null
		this.rightPanning = false
		this.rightPanStarted = false
		this.suppressContextMenu = false
		this.moveStartPositions.clear()
		drag.cancelDrag()

		if (this.editingTempInput || this.editingSavedFrameId) {
			const inTempInput = this.hitTestTempFrameInput(event.screenPosition)
			const inTempSave = this.hitTestTempFrameSaveBtn(event.screenPosition)
			const savedHit = this.hitTestSavedFrame(event.screenPosition)
			const inEditingSavedTag =
				savedHit && savedHit.hitTagBar && savedHit.frameId === this.editingSavedFrameId

			if (inTempSave) {
				this.commitTempEdit()
				scene.requestRedraw()
				return
			}
			if (inEditingSavedTag && !savedHit!.hitDelete) {
			} else if (!inTempInput && !inEditingSavedTag) {
				if (this.editingTempInput) {
					this.commitTempEdit()
				} else if (this.editingSavedFrameId) {
					this.commitSavedFrameEdit()
				}
				scene.requestRedraw()
			}
		}

		this.updateTempSelectionBounds()
		this.measureSavedFrameLabels()

		if (event.button === 2) {
			this.rightPanning = true
			this.rightPanStarted = false
			this.suppressContextMenu = false
			this.rightDownPos.copy(event.screenPosition)
			this.lastPanPos.copy(event.screenPosition)
			this.setCursor('grab')
			scene.isViewportPanning = false
			scene.requestRedraw()
			return
		}

		if (event.button === 0) {
			const resizeHit = this.hitTestResizeHandle(event.screenPosition)
			if (resizeHit) {
				this.resizeNode = resizeHit.node
				this.resizeCorner = resizeHit.corner
				this.resizeStartWidth = resizeHit.node.data.width
				this.resizeStartHeight = resizeHit.node.data.height
				this.resizeStartX = resizeHit.node.transform.position.x
				this.resizeStartY = resizeHit.node.transform.position.y
				this.resizeAspectRatio = resizeHit.node.getResizeAspectRatio()
				this.dragMode = DragMode.RESIZE
				this.dragging = true
				this.dragMoved = false
				this.dragStartScreen.copy(event.screenPosition)
				this.dragLastScreen.copy(event.screenPosition)
				this.setCursor(resizeHit.node.getResizeCursor(resizeHit.corner))
				scene.requestRedraw()
				return
			}

			// —— 多选组合自动化：开关 / 按钮条 / 门户锚点 ——
			const autoHit = this.hitTestAutomationControls(event.screenPosition)
			if (autoHit) {
				if (autoHit.kind === 'toggle') {
					const cfg = scene.getFrameAutomation(autoHit.frameId)
					scene.configureFrameAutomation(autoHit.frameId, {
						enabled: !(cfg?.enabled === true)
					})
					if (this.activeAutomationFrameId !== autoHit.frameId) {
						this.automationMode = 'none'
						this.activeAutomationFrameId = null
					}
					scene.requestRedraw()
					return
				}
				if (autoHit.kind === 'bar') {
					this.handleAutomationBarHit(autoHit.frameId, autoHit.hit)
					return
				}
				if (autoHit.kind === 'portal-remove') {
					const acfg = scene.getFrameAutomation(autoHit.frameId)
					if (acfg) {
						const kept =
							autoHit.portal.direction === 'in'
								? acfg.inputBindings.filter((b) => b.id !== autoHit.portal.bindingId)
								: acfg.outputBindings.filter((b) => b.id !== autoHit.portal.bindingId)
						scene.configureFrameAutomation(
							autoHit.frameId,
							autoHit.portal.direction === 'in' ? { inputBindings: kept } : { outputBindings: kept }
						)
					}
					return
				}
				// portal：从门户发起连线，代理到组内真实锚点（连线存储仍指向真实锚点）
				const resolved = scene.resolveFramePortal(
					autoHit.frameId,
					autoHit.portal.direction,
					autoHit.portal.bindingId
				)
				if (resolved) {
					this.connecting = true
					this.pendingFromPort = resolved.port
					this.pendingFromNode = resolved.node
					resolved.port.setArmed(true)
					const worldPos = scene.screenToWorld(event.screenPosition)
					scene.startPendingConnection(resolved.node, resolved.port, worldPos)
					this.setCursor('crosshair')
					scene.requestRedraw()
					return
				}
			}

			// 绑定模式：点击成员锚点 → toggle 绑定；点击其他位置 → 吞掉（不改选择、不框选）
			if (this.automationMode !== 'none' && this.activeAutomationFrameId) {
				const candidate = this.hitTestBindingCandidate(event.screenPosition)
				if (candidate) {
					this.toggleMemberPortBinding(
						this.activeAutomationFrameId,
						candidate.direction,
						candidate.node,
						candidate.port
					)
					return
				}
				return
			}

			const tempSaveHit = this.hitTestTempFrameSaveBtn(event.screenPosition)
			if (tempSaveHit) {
				this.commitTempEdit()
				scene.requestRedraw()
				return
			}

			const tempInputHit = this.hitTestTempFrameInput(event.screenPosition)
			if (tempInputHit) {
				this.startEditTempInput(this.editText)
				scene.requestRedraw()
				return
			}

			const savedFrameHit = this.hitTestSavedFrame(event.screenPosition)
			if (savedFrameHit) {
				if (savedFrameHit.hitDelete) {
					scene.deleteSavedSelectionFrame(savedFrameHit.frameId)
					return
				}
				if (savedFrameHit.hitTagBar) {
					const isDblClick = this.isDoubleClick(event.screenPosition)
					if (isDblClick) {
						const frame = scene.getSavedSelectionFrame(savedFrameHit.frameId)
						if (frame) {
							this.startEditSavedFrame(savedFrameHit.frameId, frame.label)
							scene.requestRedraw()
							return
						}
					}

					this.dragMode = DragMode.SAVED_FRAME
					this.dragSavedFrameId = savedFrameHit.frameId
					this.dragging = true
					this.dragMoved = false
					this.dragStartScreen.copy(event.screenPosition)
					this.dragLastScreen.copy(event.screenPosition)
					const frame = scene.getSavedSelectionFrame(savedFrameHit.frameId)
					if (frame) {
						const nodeIds = frame.nodeIds
						if (!event.shiftKey && !event.ctrlKey) {
							sel.clearSelection()
						}
						for (const id of nodeIds) {
							sel.selectById(id, true)
						}
					}
					this.moveStartPositions.clear()
					for (const n of sel.getSelection()) {
						if (n instanceof BlueprintNode) {
							this.moveStartPositions.set(
								n.id,
								new Vector2(n.transform.position.x, n.transform.position.y)
							)
						}
					}
					this.setCursor('grabbing')
					scene.requestRedraw()
					return
				}
			}

			const isDblClickOnTempCount =
				this.tempSelectionBounds &&
				!this.isSelectionMatchingAnySavedFrame() &&
				(() => {
					const screenTopLeft = scene.camera.worldToScreen(
						new Vector2(this.tempSelectionBounds!.x, this.tempSelectionBounds!.y)
					)
					const tagBarH = SELECTION_FRAME_CONSTANTS.TAG_BAR_HEIGHT * scene.camera.zoom
					const countRect = new Rect(screenTopLeft.x, screenTopLeft.y, 100, tagBarH)
					return countRect.containsPoint(event.screenPosition)
				})()
			if (isDblClickOnTempCount && this.tempSelectionBounds) {
				const selectedNodes = sel
					.getSelection()
					.filter((n) => n instanceof BlueprintNode) as BlueprintNode[]
				if (selectedNodes.length >= 2) {
					this.startEditTempInput(`分组 ${scene.getSavedSelectionFrames().length + 1}`)
					scene.requestRedraw()
					return
				}
			}
		}

		if (hit && hit.node instanceof Port) {
			const port = hit.node
			const parentNode = this.findParentNode(port)
			if (parentNode && !port.isInput) {
				this.connecting = true
				this.pendingFromPort = port
				this.pendingFromNode = parentNode
				port.setArmed(true)
				const worldPos = scene.screenToWorld(event.screenPosition)
				scene.startPendingConnection(parentNode, port, worldPos)
				this.setCursor('crosshair')
				scene.requestRedraw()
				return
			}
			return
		}

		if (this.spacePanning || event.button === 1) {
			this.spacePanning = true
			scene.isViewportPanning = true
			this.lastPanPos.copy(event.screenPosition)
			this.setCursor('grabbing')
			return
		}

		if (hit) {
			const node = hit.node
			if (node instanceof BlueprintNode) {
				this.pendingClickNode = node
				this.clickDownScreen.copy(event.screenPosition)
			} else {
				this.pendingClickNode = null
			}
			if (node.selectable) {
				if (event.shiftKey || event.ctrlKey) {
					sel.toggleSelect(node)
				} else if (!sel.isSelected(node)) {
					sel.select(node, false)
				}

				this.updateTempSelectionBounds()

				if (node.draggable && node instanceof BlueprintNode && !event.shiftKey && !event.ctrlKey) {
					const targetIsSelected = sel.isSelected(node)
					this.dragMode = DragMode.NODES
					this.dragging = true
					this.dragMoved = false
					this.moveStartPositions.clear()
					const nodesToRecord = targetIsSelected
						? sel.getSelection().filter((n) => n instanceof BlueprintNode && n.draggable)
						: [node]
					for (const n of nodesToRecord) {
						this.moveStartPositions.set(
							n.id,
							new Vector2(n.transform.position.x, n.transform.position.y)
						)
					}
					const actualNodesToDrag =
						targetIsSelected && nodesToRecord.length > 0 ? nodesToRecord : [node]
					drag.startDragWithNodes(actualNodesToDrag, event, node)
					scene.isEngineDragging = true
				}
			}
		} else {
			this.pendingClickNode = null
			if (this.hitTestTempFrameDragArea(event.screenPosition)) {
				this.dragMode = DragMode.SELECTION_FRAME
				this.dragging = true
				this.dragMoved = false
				this.dragStartScreen.copy(event.screenPosition)
				this.dragLastScreen.copy(event.screenPosition)
				this.moveStartPositions.clear()
				for (const n of sel.getSelection()) {
					if (n instanceof BlueprintNode) {
						this.moveStartPositions.set(
							n.id,
							new Vector2(n.transform.position.x, n.transform.position.y)
						)
					}
				}
				scene.isEngineDragging = true
				this.setCursor('grabbing')
			} else {
				if (!event.shiftKey && !event.ctrlKey) {
					sel.clearSelection()
				}
				sel.startMarquee(event.screenPosition)
				this.dragMode = DragMode.NONE
				this.dragging = true
				this.dragMoved = false
			}
		}
		scene.requestRedraw()
	}

	onPointerMove(event: GraphPointerEvent, hit: HitTestResult | null): void {
		const scene = this.bpScene
		const sel = this.manager!.selection
		const drag = this.manager!.drag

		const wp = scene.screenToWorld(event.screenPosition)
		scene.setLastMouseWorldPos(wp.x, wp.y)

		if (this.connecting) {
			const worldPos = scene.screenToWorld(event.screenPosition)
			let hoveredPort: Port | null = null
			let hoveredNode: BlueprintNode | null = null
			let compatible: boolean | null = null
			let hoveredPortal: PortalAnchorGeometry | null = null

			const fromIsInput = !!this.pendingFromPort?.isInput

			if (hit && hit.node instanceof Port) {
				hoveredPort = hit.node
				hoveredNode = this.findParentNode(hoveredPort)
				if (
					hoveredPort.isInput !== fromIsInput &&
					hoveredNode !== this.pendingFromNode &&
					this.pendingFromPort
				) {
					compatible = scene.isPortCompatible(this.pendingFromPort, hoveredPort)
				} else {
					compatible = false
				}
			}

			let nearestPort: Port | null = null
			let nearestDist = ANCHOR_MAGNET_DISTANCE
			for (const node of scene.getAllBlueprintNodes()) {
				if (node === this.pendingFromNode) continue
				const candidates = fromIsInput ? node.outputPorts : node.inputPorts
				for (const candidatePort of candidates) {
					const portWorldPos = candidatePort.getWorldPosition()
					const dist = Math.hypot(worldPos.x - portWorldPos.x, worldPos.y - portWorldPos.y)
					if (dist < nearestDist && this.pendingFromPort) {
						if (scene.isPortCompatible(this.pendingFromPort, candidatePort)) {
							nearestDist = dist
							nearestPort = candidatePort
						}
					}
				}
			}

			// 门户锚点磁吸：落点为框边线门户时，代理到组内对侧真实锚点
			let portalDist = ANCHOR_MAGNET_DISTANCE
			for (const frame of scene.getSavedSelectionFrames()) {
				if (!frame.automation?.enabled) continue
				const portalsGeom = this.buildFramePortals(frame)
				const candidates = fromIsInput ? portalsGeom.out : portalsGeom.in
				for (const gp of candidates) {
					const dist = Math.hypot(worldPos.x - gp.x, worldPos.y - gp.y)
					if (dist >= portalDist || !this.pendingFromPort) continue
					const resolved = scene.resolveFramePortal(frame.id, gp.direction, gp.bindingId)
					if (!resolved || resolved.node === this.pendingFromNode) continue
					if (!scene.isPortCompatible(this.pendingFromPort, resolved.port)) continue
					portalDist = dist
					hoveredPortal = gp
					nearestPort = resolved.port
				}
			}

			if (nearestPort) {
				hoveredPort = nearestPort
				compatible = true
			}

			this.magnetedPort = hoveredPort
			this.hoveredPortalKey = hoveredPortal
				? `${hoveredPortal.direction}:${hoveredPortal.bindingId}`
				: null

			for (const node of scene.getAllBlueprintNodes()) {
				for (const p of [...node.inputPorts, ...node.outputPorts]) {
					p.setSnapped(p === hoveredPort, compatible)
				}
			}

			if (hoveredPortal && compatible) {
				// 视觉上吸附到框边线门户（连线实体仍指向组内真实锚点）
				scene.updatePendingConnection(
					new Vector2(hoveredPortal.x, hoveredPortal.y),
					hoveredPort,
					compatible
				)
			} else if (hoveredPort && compatible) {
				const snappedWorldPos = hoveredPort.getWorldPosition()
				scene.updatePendingConnection(snappedWorldPos, hoveredPort, compatible)
			} else {
				scene.updatePendingConnection(worldPos, hoveredPort, compatible)
			}
			scene.requestRedraw()
			return
		}

		if (this.spacePanning) {
			const dx = event.screenPosition.x - this.lastPanPos.x
			const dy = event.screenPosition.y - this.lastPanPos.y
			scene.panBy(dx, dy)
			this.lastPanPos.copy(event.screenPosition)
			return
		}

		if (this.rightPanning) {
			if (!this.rightPanStarted) {
				const dx = event.screenPosition.x - this.rightDownPos.x
				const dy = event.screenPosition.y - this.rightDownPos.y
				const distSq = dx * dx + dy * dy
				if (distSq < RIGHT_PAN_THRESHOLD_DIST * RIGHT_PAN_THRESHOLD_DIST) {
					return
				}
				this.rightPanStarted = true
				scene.isViewportPanning = true
				this.setCursor('grabbing')
			}
			const dx = event.screenPosition.x - this.lastPanPos.x
			const dy = event.screenPosition.y - this.lastPanPos.y
			scene.panBy(dx, dy)
			this.lastPanPos.copy(event.screenPosition)
			return
		}

		if (this.editingTempInput || this.editingSavedFrameId) {
			scene.requestRedraw()
			return
		}

		if (this.dragMode === DragMode.NODES) {
			if (drag.isDragging()) {
				const dx = event.screenPosition.x - this.clickDownScreen.x
				const dy = event.screenPosition.y - this.clickDownScreen.y
				const distSq = dx * dx + dy * dy
				if (distSq >= CLICK_DRAG_THRESHOLD * CLICK_DRAG_THRESHOLD) {
					if (!this.dragMoved) {
						this.dragMoved = true
						this.setCursor('grabbing')
					}
				}
				if (this.dragMoved) {
					const firstDraggedNode = drag.getDraggedNodes()[0]
					const posBefore = firstDraggedNode
						? { x: firstDraggedNode.transform.position.x, y: firstDraggedNode.transform.position.y }
						: null
					drag.updateDrag(event)
					const posAfter = firstDraggedNode
						? { x: firstDraggedNode.transform.position.x, y: firstDraggedNode.transform.position.y }
						: null
					this.clampSelectionToBoundary()
					this.updateTempSelectionBounds()
					scene.updateAllConnectionEndpoints()
					if (posBefore && posAfter && (posBefore.x !== posAfter.x || posBefore.y !== posAfter.y)) {
						// 仅在第一次有位移时输出，避免日志过多
					}
				}
				scene.requestRedraw()
			}
		} else if (this.dragMode === DragMode.RESIZE && this.resizeNode && this.resizeCorner) {
			const mouseWorld = scene.camera.screenToWorld(event.screenPosition)

			let newWidth: number
			let newHeight: number
			let newX: number
			let newY: number

			const ratio = this.resizeAspectRatio

			switch (this.resizeCorner) {
				case 'bottom-right': {
					newX = this.resizeStartX
					newY = this.resizeStartY
					newWidth = Math.max(MIN_NODE_WIDTH, mouseWorld.x - this.resizeStartX)
					newHeight = Math.max(MIN_NODE_HEIGHT, mouseWorld.y - this.resizeStartY)
					if (ratio) {
						const currentRatio = newWidth / newHeight
						if (currentRatio > ratio) {
							newHeight = newWidth / ratio
							newHeight = Math.max(MIN_NODE_HEIGHT, newHeight)
						} else {
							newWidth = newHeight * ratio
							newWidth = Math.max(MIN_NODE_WIDTH, newWidth)
						}
					}
					break
				}
				case 'bottom-left': {
					newY = this.resizeStartY
					const rightEdge = this.resizeStartX + this.resizeStartWidth
					newWidth = Math.max(MIN_NODE_WIDTH, rightEdge - mouseWorld.x)
					newHeight = Math.max(MIN_NODE_HEIGHT, mouseWorld.y - this.resizeStartY)
					if (ratio) {
						const currentRatio = newWidth / newHeight
						if (currentRatio > ratio) {
							newHeight = newWidth / ratio
							newHeight = Math.max(MIN_NODE_HEIGHT, newHeight)
						} else {
							newWidth = newHeight * ratio
							newWidth = Math.max(MIN_NODE_WIDTH, newWidth)
						}
					}
					newX = rightEdge - newWidth
					break
				}
				case 'top-right': {
					newX = this.resizeStartX
					const bottomEdge = this.resizeStartY + this.resizeStartHeight
					newWidth = Math.max(MIN_NODE_WIDTH, mouseWorld.x - this.resizeStartX)
					newHeight = Math.max(MIN_NODE_HEIGHT, bottomEdge - mouseWorld.y)
					if (ratio) {
						const currentRatio = newWidth / newHeight
						if (currentRatio > ratio) {
							newHeight = newWidth / ratio
							newHeight = Math.max(MIN_NODE_HEIGHT, newHeight)
						} else {
							newWidth = newHeight * ratio
							newWidth = Math.max(MIN_NODE_WIDTH, newWidth)
						}
					}
					newY = bottomEdge - newHeight
					break
				}
				case 'top-left': {
					const rightEdge = this.resizeStartX + this.resizeStartWidth
					const bottomEdge = this.resizeStartY + this.resizeStartHeight
					newWidth = Math.max(MIN_NODE_WIDTH, rightEdge - mouseWorld.x)
					newHeight = Math.max(MIN_NODE_HEIGHT, bottomEdge - mouseWorld.y)
					if (ratio) {
						const currentRatio = newWidth / newHeight
						if (currentRatio > ratio) {
							newHeight = newWidth / ratio
							newHeight = Math.max(MIN_NODE_HEIGHT, newHeight)
						} else {
							newWidth = newHeight * ratio
							newWidth = Math.max(MIN_NODE_WIDTH, newWidth)
						}
					}
					newX = rightEdge - newWidth
					newY = bottomEdge - newHeight
					break
				}
			}

			this.resizeNode.setPosition(newX, newY)
			this.resizeNode.updateSize(newWidth, newHeight)
			this.resizeNode.data.sizeCustomized = true
			this.resizeNode.hoveredResizeCorner = this.resizeCorner

			this.dragMoved = true
			this.setCursor(this.resizeNode.getResizeCursor(this.resizeCorner))
			scene.updateAllConnectionEndpoints()
			scene.requestRedraw()
		} else if (this.dragMode === DragMode.SELECTION_FRAME) {
			const dx = event.screenPosition.x - this.dragLastScreen.x
			const dy = event.screenPosition.y - this.dragLastScreen.y
			const worldDelta = scene.camera.screenDeltaToWorld(new Vector2(dx, dy))
			sel.moveSelection(worldDelta)
			this.clampSelectionToBoundary()
			this.dragLastScreen.copy(event.screenPosition)
			this.dragMoved = true
			this.updateTempSelectionBounds()
			scene.updateAllConnectionEndpoints()
			scene.requestRedraw()
		} else if (this.dragMode === DragMode.SAVED_FRAME && this.dragSavedFrameId) {
			const dx = event.screenPosition.x - this.dragLastScreen.x
			const dy = event.screenPosition.y - this.dragLastScreen.y
			const worldDelta = scene.camera.screenDeltaToWorld(new Vector2(dx, dy))
			sel.moveSelection(worldDelta)
			this.clampSelectionToBoundary()
			this.dragLastScreen.copy(event.screenPosition)
			this.dragMoved = true
			this.updateTempSelectionBounds()
			scene.updateAllConnectionEndpoints()
			scene.requestRedraw()
		} else if (sel.isMarqueeing()) {
			sel.updateMarquee(event.screenPosition)
			this.dragMoved = true
			scene.requestRedraw()
		} else {
			this.updateTempSelectionBounds()
			this.measureSavedFrameLabels()

			for (const node of scene.getAllBlueprintNodes()) {
				node.hoveredResizeCorner = null
			}

			const resizeHit = this.hitTestResizeHandle(event.screenPosition)
			if (resizeHit) {
				resizeHit.node.hoveredResizeCorner = resizeHit.corner
				this.setCursor(resizeHit.node.getResizeCursor(resizeHit.corner))
			} else {
				const tempSaveHit = this.hitTestTempFrameSaveBtn(event.screenPosition)
				const tempInputHit = this.hitTestTempFrameInput(event.screenPosition)
				const savedFrameHit = this.hitTestSavedFrame(event.screenPosition)
				if (tempSaveHit || tempInputHit) {
					this.setCursor(tempSaveHit ? 'pointer' : 'text')
				} else if (savedFrameHit && savedFrameHit.hitDelete) {
					this.setCursor('pointer')
				} else if (savedFrameHit && savedFrameHit.hitTagBar) {
					this.setCursor('grab')
				} else if (this.hitTestTempFrameDragArea(event.screenPosition)) {
					this.setCursor('grab')
				} else if (hit && hit.node instanceof Port) {
					this.setCursor('crosshair')
				} else if (hit && hit.node instanceof BlueprintNode) {
					this.setCursor('grab')
				} else if (hit && hit.node instanceof Connection) {
					this.setCursor('pointer')
				} else {
					this.setCursor('default')
				}
			}
			scene.requestRedraw()
		}
	}

	onPointerUp(event: GraphPointerEvent, hit: HitTestResult | null): void {
		const scene = this.bpScene
		const sel = this.manager!.selection
		const drag = this.manager!.drag

		if (scene.isDomInteractionLocked) {
			this.dragging = false
			this.dragMoved = false
			this.dragMode = DragMode.NONE
			this.pendingClickNode = null
			scene.isEngineDragging = false
			return
		}

		if (this.connecting) {
			this.connecting = false
			scene.isEngineDragging = false
			if (this.pendingFromPort) {
				this.pendingFromPort.setArmed(false)
			}
			for (const node of scene.getAllBlueprintNodes()) {
				for (const p of [...node.inputPorts, ...node.outputPorts]) {
					p.setSnapped(false)
				}
			}

			let completed = false
			let targetPort: Port | null = this.magnetedPort
			if (!targetPort && hit && hit.node instanceof Port) {
				targetPort = hit.node
			}

			if (targetPort) {
				const targetNode = this.findParentNode(targetPort)
				if (
					targetNode &&
					this.pendingFromNode &&
					this.pendingFromPort &&
					targetPort.isInput !== this.pendingFromPort.isInput &&
					targetNode !== this.pendingFromNode
				) {
					const connData = scene.completePendingConnection(targetNode, targetPort)
					if (connData) {
						scene.executeCommand(new CreateConnectionCommand(scene, connData))
					}
					completed = true
				}
			}
			if (!completed) {
				const clientX = event.originalEvent.clientX
				const clientY = event.originalEvent.clientY
				scene.on.emit('link-drop-on-canvas', {
					clientX,
					clientY,
					worldX: event.worldPosition.x,
					worldY: event.worldPosition.y,
					fromNodeId: this.pendingFromNode?.id ?? '',
					fromAnchorId: this.pendingFromPort?.spec.id ?? ''
				})
				scene.cancelPendingConnection()
			}
			this.pendingFromPort = null
			this.pendingFromNode = null
			this.magnetedPort = null
			this.hoveredPortalKey = null
			this.dragging = false
			this.dragMoved = false
			this.dragMode = DragMode.NONE
			this.pendingClickNode = null
			this.moveStartPositions.clear()
			scene.isEngineDragging = false
			drag.cancelDrag()
			this.setCursor('default')
			scene.requestRedraw()
			return
		}

		if (this.spacePanning) {
			this.spacePanning = false
			this.dragging = false
			this.dragMoved = false
			this.dragMode = DragMode.NONE
			this.pendingClickNode = null
			this.moveStartPositions.clear()
			scene.isEngineDragging = false
			scene.isViewportPanning = false
			drag.cancelDrag()
			this.setCursor('default')
			return
		}

		if (this.rightPanning) {
			if (this.rightPanStarted) {
				this.suppressContextMenu = true
			}
			this.rightPanning = false
			this.rightPanStarted = false
			this.dragging = false
			this.dragMoved = false
			this.dragMode = DragMode.NONE
			this.pendingClickNode = null
			this.moveStartPositions.clear()
			scene.isEngineDragging = false
			scene.isViewportPanning = false
			drag.cancelDrag()
			this.setCursor('default')
			return
		}

		if (this.dragMode === DragMode.NODES) {
			const totalDist = this.pendingClickNode
				? Math.hypot(
						event.screenPosition.x - this.clickDownScreen.x,
						event.screenPosition.y - this.clickDownScreen.y
					)
				: 0
			const isClick = totalDist < CLICK_DRAG_THRESHOLD

			if (drag.isDragging()) {
				if (isClick) {
					drag.cancelDrag()
					scene.isEngineDragging = false
				} else {
					const draggedNodes = drag
						.getDraggedNodes()
						.filter((n) => n instanceof BlueprintNode) as BlueprintNode[]
					drag.endDrag(event)
					if (draggedNodes.length > 0 && this.moveStartPositions.size > 0) {
						const endPositions = new Map<string, Vector2>()
						for (const n of draggedNodes) {
							endPositions.set(n.id, new Vector2(n.transform.position.x, n.transform.position.y))
							const start = this.moveStartPositions.get(n.id)
						}
						const moveFn = (id: string, pos: Vector2) => {
							const node = scene.getBlueprintNode(id)
							if (node) {
								node.setPosition(pos.x, pos.y)
							}
						}
						scene.isEngineDragging = false
						scene.executeCommand(new MoveNodeCommand(this.moveStartPositions, endPositions, moveFn))
						scene.updateAllConnectionEndpoints()
					}
				}
			}
			this.moveStartPositions.clear()
			this.dragMoved = !isClick
		} else if (this.dragMode === DragMode.RESIZE) {
			if (this.resizeNode && this.dragMoved) {
				const node = this.resizeNode
				scene.isEngineDragging = false
				scene.executeCommand(
					new ResizeNodeCommand(
						scene,
						node,
						this.resizeStartX,
						this.resizeStartY,
						this.resizeStartWidth,
						this.resizeStartHeight,
						node.transform.position.x,
						node.transform.position.y,
						node.data.width,
						node.data.height
					)
				)
			}
			this.resizeNode = null
			this.resizeCorner = null
		} else if (this.dragMode === DragMode.SELECTION_FRAME) {
			if (this.dragMoved && this.moveStartPositions.size > 0) {
				const selectedNodes = sel
					.getSelection()
					.filter((n) => n instanceof BlueprintNode) as BlueprintNode[]
				const endPositions = new Map<string, Vector2>()
				for (const n of selectedNodes) {
					endPositions.set(n.id, new Vector2(n.transform.position.x, n.transform.position.y))
				}
				const moveFn = (id: string, pos: Vector2) => {
					const node = scene.getBlueprintNode(id)
					if (node) {
						node.setPosition(pos.x, pos.y)
					}
				}
				scene.isEngineDragging = false
				scene.executeCommand(new MoveNodeCommand(this.moveStartPositions, endPositions, moveFn))
				scene.updateAllConnectionEndpoints()
			} else if (!this.dragMoved && this.tempSelectionBounds) {
				sel.clearSelection()
			}
			this.moveStartPositions.clear()
		} else if (this.dragMode === DragMode.SAVED_FRAME) {
			if (this.dragMoved && this.moveStartPositions.size > 0) {
				const selectedNodes = sel
					.getSelection()
					.filter((n) => n instanceof BlueprintNode) as BlueprintNode[]
				const endPositions = new Map<string, Vector2>()
				for (const n of selectedNodes) {
					endPositions.set(n.id, new Vector2(n.transform.position.x, n.transform.position.y))
				}
				const moveFn = (id: string, pos: Vector2) => {
					const node = scene.getBlueprintNode(id)
					if (node) {
						node.setPosition(pos.x, pos.y)
					}
				}
				scene.isEngineDragging = false
				scene.executeCommand(new MoveNodeCommand(this.moveStartPositions, endPositions, moveFn))
				scene.updateAllConnectionEndpoints()
			}
			this.dragSavedFrameId = null
			this.moveStartPositions.clear()
		} else if (sel.isMarqueeing()) {
			const additive = event.shiftKey || event.ctrlKey
			const direction = sel.getMarqueeDirection()
			const mode = direction === 'left-to-right' ? 'contain' : 'intersect'
			sel.endMarquee(additive, mode)
		}

		if (!this.dragMoved && this.pendingClickNode) {
			scene.on.emit('node-click', this.pendingClickNode)
		}

		this.dragging = false
		this.dragMoved = false
		this.dragMode = DragMode.NONE
		scene.isEngineDragging = false
		this.pendingClickNode = null
		this.resizeNode = null
		this.resizeCorner = null
		this.dragSavedFrameId = null
		this.moveStartPositions.clear()
		drag.cancelDrag()
		this.updateTempSelectionBounds()
		scene.updateAllConnectionEndpoints()
		scene.requestRedraw()
	}

	onContextMenu(_event: GraphPointerEvent, _hit: HitTestResult | null): boolean {
		if (this.suppressContextMenu) {
			this.suppressContextMenu = false
			return true
		}
		return false
	}

	onWheel(event: GraphWheelEvent): void {
		const scene = this.bpScene
		event.preventDefault()
		scene.zoomAt(event.screenPosition, event.deltaY)
	}

	onKeyDown(event: GraphKeyboardEvent): void {
		const scene = this.bpScene
		const sel = this.manager!.selection
		const key = event.key.toLowerCase()

		const activeEl = document.activeElement as HTMLElement | null
		const isInputFocused = !!(
			activeEl &&
			(activeEl.tagName === 'INPUT' ||
				activeEl.tagName === 'TEXTAREA' ||
				activeEl.tagName === 'SELECT' ||
				activeEl.isContentEditable ||
				activeEl.closest('.bp-node-chat-dialog'))
		)

		if (isInputFocused && !this.editingTempInput && !this.editingSavedFrameId) {
			if (key === 'escape' && !event.repeat) {
				;(activeEl as HTMLElement).blur()
			}
			return
		}

		if (this.editingTempInput || this.editingSavedFrameId) {
			// Ctrl+A：DOM <input> 原生全选（选中后后续 Backspace 一次全部删除）。
			// 这里直接放行 return，不拦截，不阻止 document 其他副作用，交给透明 input 的 onSelect 或原生 select()。
			const mod = event.ctrlKey || event.metaKey
			if (mod && key === 'a') {
				return
			}
			if (key === 'enter' && !event.repeat) {
				event.preventDefault()
				if (this.editingTempInput) {
					this.commitTempEdit()
				} else {
					this.commitSavedFrameEdit()
				}
				scene.requestRedraw()
				return
			}
			if (key === 'escape' && !event.repeat) {
				event.preventDefault()
				this.cancelEdit()
				scene.requestRedraw()
				return
			}
			// 组合中 (IME 候选) 不处理退格/字符，由 DOM <input> 原生走 composition -> setEditTextDirectly 回传。
			// 同时允许 Backspace repeat=true 触发长按连删（非组合时）。
			if (key === 'backspace' && !this.isComposing) {
				event.preventDefault()
				this.editText = this.editText.slice(0, -1)
				scene.requestRedraw()
				return
			}
			if (key === 'delete') {
				return
			}
			if (
				!this.isComposing &&
				event.key.length === 1 &&
				!event.ctrlKey &&
				!event.metaKey &&
				!event.altKey
			) {
				this.editText += event.key
				scene.requestRedraw()
				return
			}
			return
		}

		// When multiple nodes are selected, pressing Enter directly also triggers save (even without clicking input area)
		if (key === 'enter' && !event.repeat && !this.editingTempInput && !this.editingSavedFrameId) {
			const selectedNodes = sel
				.getSelection()
				.filter((n) => n instanceof BlueprintNode) as BlueprintNode[]
			if (selectedNodes.length >= 2 && this.tempSelectionBounds) {
				event.preventDefault()
				this.commitTempEdit()
				scene.requestRedraw()
				return
			}
		}

		if (key === ' ' && !event.repeat && !this.connecting) {
			this.spacePanning = true
			this.setCursor('grab')
			return
		}

		if ((key === 'delete' || key === 'backspace') && !event.repeat) {
			const selected = sel.getSelection()
			const nodeIdsToRemove: string[] = []
			const connIdsToRemove: string[] = []
			for (const node of selected) {
				if (node instanceof BlueprintNode) {
					nodeIdsToRemove.push(node.id)
				} else if (node instanceof Connection) {
					connIdsToRemove.push(node.id)
				}
			}
			if (nodeIdsToRemove.length > 0 || connIdsToRemove.length > 0) {
				event.preventDefault()
				scene.executeCommand(new DeleteSelectionCommand(scene, nodeIdsToRemove, connIdsToRemove))
				sel.clearSelection()
				scene.updateAllConnectionEndpoints()
				scene.requestRedraw()
			}
			return
		}
		if (key === 'z' && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.repeat) {
			event.preventDefault()
			scene.undo()
			scene.updateAllConnectionEndpoints()
			scene.requestRedraw()
			return
		}
		if (key === 'z' && (event.ctrlKey || event.metaKey) && event.shiftKey && !event.repeat) {
			event.preventDefault()
			scene.redo()
			scene.updateAllConnectionEndpoints()
			scene.requestRedraw()
			return
		}
		if (key === 'y' && (event.ctrlKey || event.metaKey) && !event.repeat) {
			event.preventDefault()
			scene.redo()
			scene.updateAllConnectionEndpoints()
			scene.requestRedraw()
			return
		}
		if (key === 'a' && (event.ctrlKey || event.metaKey)) {
			event.preventDefault()
			sel.selectAll()
		}
		if (key === 'c' && (event.ctrlKey || event.metaKey)) {
			event.preventDefault()
			const selectedNodes = sel
				.getSelection()
				.filter((n) => n instanceof BlueprintNode) as BlueprintNode[]
			scene.copySelection(selectedNodes)
		}
		if (key === 'v' && (event.ctrlKey || event.metaKey)) {
			event.preventDefault()
			if (scene.hasClipboardData()) {
				const newIds = scene.pasteFromMouse()
				if (newIds.length > 0) {
					scene.selection.setSelection(newIds)
					scene.updateAllConnectionEndpoints()
				}
			}
			return
		}
		if (key === 'g' && (event.ctrlKey || event.metaKey)) {
			event.preventDefault()
			const selectedNodes = sel
				.getSelection()
				.filter((n) => n instanceof BlueprintNode) as BlueprintNode[]
			if (selectedNodes.length >= 2) {
				const defaultLabel = `分组 ${scene.getSavedSelectionFrames().length + 1}`
				scene.saveSelectionFrame(
					selectedNodes.map((n) => n.id),
					defaultLabel
				)
			}
		}
		if (key === 'escape') {
			if (this.connecting) {
				scene.cancelPendingConnection()
				this.connecting = false
				if (this.pendingFromPort) this.pendingFromPort.setArmed(false)
				this.pendingFromPort = null
				this.pendingFromNode = null
				for (const node of scene.getAllBlueprintNodes()) {
					for (const p of [...node.inputPorts, ...node.outputPorts]) {
						p.setSnapped(false)
					}
				}
				this.setCursor('default')
			}
			// 自动化：Esc 先退出绑定模式/循环次数编辑，不影响节点选择
			if (this.automationMode !== 'none') {
				this.exitAutomationMode()
				return
			}
			if (this.editingLoopFrameId) {
				this.cancelLoopEdit()
				return
			}
			sel.clearSelection()
			sel.cancelMarquee()
			this.manager!.drag.cancelDrag()
			this.dragMode = DragMode.NONE
		}
		if ((key === '=' || key === '+' || key === 'numpadadd') && !event.ctrlKey && !event.metaKey) {
			event.preventDefault()
			const camera = scene.camera
			const center = new Vector2(camera.viewport.width / 2, camera.viewport.height / 2)
			scene.setZoom(camera.zoom * 1.1, center)
		}
		if (
			(key === '-' || key === '_' || key === 'numpadsubtract') &&
			!event.ctrlKey &&
			!event.metaKey
		) {
			event.preventDefault()
			const camera = scene.camera
			const center = new Vector2(camera.viewport.width / 2, camera.viewport.height / 2)
			scene.setZoom(camera.zoom / 1.1, center)
		}
		this.updateTempSelectionBounds()
		scene.requestRedraw()
	}

	onKeyUp(event: GraphKeyboardEvent): void {
		const key = event.key.toLowerCase()
		if (key === ' ') {
			this.spacePanning = false
			this.setCursor('default')
		}
	}

	onPreRender(ctx: RenderContext): void {
		this.measureSavedFrameLabels()
	}

	onRender(ctx: RenderContext): void {
		const sel = this.manager!.selection
		const scene = this.bpScene
		const camera = scene.camera
		const marqueeRect = sel.getMarqueeRect()

		const editState = this.getEditState(camera.zoom)

		// Draw saved (green) selection frames on top of nodes (dashed border only, no fill - won't obscure content)
		// Note: Must draw in onRender because nodes have shadowBlur glow that extends beyond bounds
		const savedFrames = scene.getSavedSelectionFrames()
		const autoCtx = this.getAutomationCtx()
		for (const frame of savedFrames) {
			const nodes = scene.getNodesByIds(frame.nodeIds)
			if (nodes.length < 2) {
				continue
			}
			const baseBounds = computeSelectionBounds(nodes)
			if (!baseBounds) continue
			const enabled = !!frame.automation?.enabled
			const outer = enabled ? computeAutomationOuterRect(baseBounds, true) : baseBounds
			drawSelectionFrame(
				ctx.ctx,
				outer,
				camera.zoom,
				true,
				frame.label,
				undefined,
				editState,
				enabled ? AUTOMATION_BAR_VISUAL_HEIGHT / camera.zoom : 0
			)

			// 自动化开关（所有绿框均显示；开启态高亮）
			drawAutomationToggle(ctx.ctx, outer, camera.zoom, enabled)

			if (enabled && frame.automation) {
				const barRect = getAutomationBarWorldRect(outer, camera.zoom)
				const runState = scene.getFrameAutomationRunState(frame.id)
				const mode = this.activeAutomationFrameId === frame.id ? this.automationMode : 'none'
				if (autoCtx) {
					drawAutomationBar(ctx.ctx, barRect, camera.zoom, frame.automation, mode, runState)
				}

				// 门户锚点
				const portalsGeom = this.buildFramePortals(frame)
				const allPortals = [...portalsGeom.in, ...portalsGeom.out]
				const connected = new Set(
					allPortals.filter((p) => this.isPortalConnected(p)).map((p) => p.bindingId)
				)
				drawPortalAnchors(ctx.ctx, allPortals, camera.zoom, {
					hoveredBindingId: this.hoveredPortalKey
						? (allPortals.find((p) => `${p.direction}:${p.bindingId}` === this.hoveredPortalKey)
								?.bindingId ?? null)
						: null,
					connectedBindingIds: connected,
					bindingMode: mode
				})

				// 绑定模式：成员候选锚点脉冲环
				if (mode !== 'none' && this.activeAutomationFrameId === frame.id) {
					const wantInput = mode === 'binding-input'
					const candidates = nodes.flatMap((n) => {
						const ports = wantInput ? n.inputPorts : n.outputPorts
						return ports.map((p) => {
							const wp = p.getWorldPosition()
							return { x: wp.x, y: wp.y, mediaType: p.mediaType }
						})
					})
					drawBindingCandidates(ctx.ctx, candidates, camera.zoom, wantInput ? 'in' : 'out')
				}
			}
		}

		// Draw temp (blue) selection frame on top of saved frames
		this.updateTempSelectionBounds()
		if (
			this.tempSelectionBounds &&
			!sel.isMarqueeing() &&
			!this.isSelectionMatchingAnySavedFrame()
		) {
			const selectedNodes = sel.getSelection().filter((n) => n instanceof BlueprintNode)
			if (selectedNodes.length >= 2) {
				drawSelectionFrame(
					ctx.ctx,
					this.tempSelectionBounds,
					camera.zoom,
					false,
					undefined,
					selectedNodes.length,
					editState
				)
			}
		}

		if (marqueeRect) {
			ctx.save()
			const lineWidth = 1 / camera.zoom
			ctx.ctx.lineWidth = lineWidth
			const direction = sel.getMarqueeDirection()
			if (direction === 'left-to-right') {
				ctx.ctx.setLineDash([])
				ctx.ctx.fillStyle = 'rgba(91, 155, 213, 0.08)'
				ctx.ctx.strokeStyle = 'rgba(91, 155, 213, 0.8)'
			} else {
				ctx.ctx.setLineDash([4 / camera.zoom, 4 / camera.zoom])
				ctx.ctx.fillStyle = 'rgba(46, 204, 113, 0.08)'
				ctx.ctx.strokeStyle = 'rgba(46, 204, 113, 0.8)'
			}
			ctx.ctx.fillRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height)
			ctx.ctx.strokeRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height)
			ctx.ctx.setLineDash([])
			ctx.restore()
		}
	}
}
