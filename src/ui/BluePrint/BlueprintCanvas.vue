<template>
	<div
		ref="wrapEl"
		class="bp-wrap"
		:class="{ 'bp-wrap--move-cursor': isOverMoveHandle }"
		@pointerdown="onWrapPointerDown"
		@pointermove="onWrapPointerMove"
		@pointerleave="onWrapPointerLeave"
		@wheel="onWheel"
		@dblclick="onDblClick"
		@contextmenu.prevent="onContextMenu"
	>
		<canvas ref="canvasEl" class="bp-grid-canvas" />
		<div v-if="boxSel" class="bp-boxsel" :style="boxSelStyle" />

		<!-- 多选框选框交互覆盖层 -->
		<SelectionFrameOverlay
			v-if="selectionFrameOverlayProps"
			:visible="selectionFrameOverlayProps.visible"
			:worldRect="selectionFrameOverlayProps.worldRect"
			:label="selectionFrameOverlayProps.label"
			:nodeCount="selectionFrameOverlayProps.nodeCount"
			:zoom="viewportZoom"
			:panX="viewportPanPx.x"
			:panY="viewportPanPx.y"
			:canvasWidth="canvasSize.w"
			:canvasHeight="canvasSize.h"
			@tag-save="(label: string) => emit('selection-frame-tag-save', label)"
			@delete="emit('selection-frame-delete')"
			@delete-nodes="emit('selection-frame-delete-selected')"
			@drag-move="onOverlayDragMove"
		/>

		<slot
			:worldToScreen="worldToScreen"
			:screenToWorld="screenToWorld"
			:zoom="viewportZoom"
			:panPx="viewportPanPx"
		/>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SelectionFrameOverlay from '../WorkFlow/selection/SelectionFrameOverlay.vue'

export type BlueprintViewport = {
	zoom: number
	panX: number
	panY: number
}

type BlueprintCanvasNode = {
	worldX?: number
	worldY?: number
	width?: number
	height?: number
	[key: string]: unknown
}

const props = withDefaults(
	defineProps<{
		viewport?: BlueprintViewport
		selectionFrame?: {
			visible: boolean
			worldRect: { x0: number; y0: number; x1: number; y1: number } | null
			label?: string
			nodeCount: number
			nodeIds?: string[]
		} | null
		savedFrames?: Array<{
			id: string
			label: string
			nodeIds: string[]
		}>
		nodesById?: Record<string, BlueprintCanvasNode>
	}>(),
	{
		viewport: () => ({ zoom: 1, panX: 0, panY: 0 })
	}
)

const emit = defineEmits<{
	(e: 'update:viewport', v: BlueprintViewport): void
	(
		e: 'canvas-contextmenu',
		payload: { clientX: number; clientY: number; worldX: number; worldY: number }
	): void
	(
		e: 'canvas-dblclick',
		payload: { clientX: number; clientY: number; worldX: number; worldY: number }
	): void
	(
		e: 'box-select',
		payload: { worldRect: { x0: number; y0: number; x1: number; y1: number } }
	): void
	(e: 'canvas-panning-start'): void
	(e: 'canvas-panning-end'): void
	(e: 'selection-frame-tag-save', label: string): void
	(e: 'selection-frame-delete', payload?: { frameId?: string }): void
	(e: 'selection-frame-drag', payload: { dx: number; dy: number; nodeIds: string[] }): void
	(e: 'selection-frame-delete-selected'): void
}>()

const wrapEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

// 多选框移动手柄区域（用于交互检测）
const selectionFrameMoveHandle = ref<{
	x: number
	y: number
	width: number
	height: number
} | null>(null)

// 多选框删除按钮区域（用于交互检测）
const selectionFrameDeleteButton = ref<{
	x: number
	y: number
	width: number
	height: number
} | null>(null)

type SavedFrameHandle = {
	x: number
	y: number
	width: number
	height: number
	frameId: string
	nodeIds: string[]
	deleteBtn?: { x: number; y: number; width: number; height: number }
}

const savedFrameMoveHandles = ref<SavedFrameHandle[]>([])

// 拖拽状态
const draggingSelectionFrame = ref(false)
const dragLastWorld = ref({ x: 0, y: 0 })
const dragStartNodes = ref<Record<string, { x: number; y: number }>>({})

// 是否悬停在移动手柄上
const isOverMoveHandle = ref(false)

let pendingViewport: BlueprintViewport | null = null
let viewportRafId = 0
const flushPendingViewport = () => {
	viewportRafId = 0
	const v = pendingViewport
	if (!v) return
	pendingViewport = null
	emit('update:viewport', v)
}
const scheduleViewportEmit = (v: BlueprintViewport) => {
	pendingViewport = v
	if (viewportRafId) return
	viewportRafId = requestAnimationFrame(flushPendingViewport)
}
const flushViewportEmitNow = () => {
	if (viewportRafId) {
		cancelAnimationFrame(viewportRafId)
	}
	flushPendingViewport()
}

const viewportZoom = computed(() => {
	const z = Number(props.viewport?.zoom ?? 1)
	return Number.isFinite(z) ? clamp(z, 0.2, 6) : 1
})

const viewportPanPx = computed(() => ({
	x: Number(props.viewport?.panX ?? 0) || 0,
	y: Number(props.viewport?.panY ?? 0) || 0
}))

// Canvas 尺寸（用于选框 overlay 定位）
const canvasSize = computed(() => {
	const r = wrapRect()
	return { w: r ? r.width : 0, h: r ? r.height : 0 }
})

// 选框 overlay 数据（仅当有数据时返回对象，否则返回 null）
const selectionFrameOverlayProps = computed(() => {
	const sf = props.selectionFrame
	if (!sf?.visible || !sf.worldRect) return null
	return {
		visible: sf.visible,
		worldRect: sf.worldRect,
		label: sf.label,
		nodeCount: sf.nodeCount
	}
})

const wrapRect = () => wrapEl.value?.getBoundingClientRect() ?? null
const screenCenter = () => {
	const r = wrapRect()
	return r ? { x: r.width / 2, y: r.height / 2 } : { x: 0, y: 0 }
}

const worldToScreen = (p: { x: number; y: number }) => {
	const c = screenCenter()
	const z = viewportZoom.value
	return {
		x: c.x + viewportPanPx.value.x + p.x * z,
		y: c.y + viewportPanPx.value.y + p.y * z
	}
}

const screenToWorld = (p: { x: number; y: number }) => {
	const c = screenCenter()
	const z = viewportZoom.value
	return {
		x: (p.x - c.x - viewportPanPx.value.x) / z,
		y: (p.y - c.y - viewportPanPx.value.y) / z
	}
}

// 处理来自 DOM overlay 的拖拽移动
const onOverlayDragMove = (payload: { dx: number; dy: number }) => {
	const z = viewportZoom.value
	const nodeIds = props.selectionFrame?.nodeIds || []
	emit('selection-frame-drag', {
		dx: payload.dx / z,
		dy: payload.dy / z,
		nodeIds
	})
}

let raf = 0
const GRID_DPR = 1

let gridPatternCache: HTMLCanvasElement | null = null
let gridPatternZoom = -1
let gridPatternStepPx = 0
let gridPatternMajorStepPx = 0
let gridPatternTileSize = 0
let gridCacheColors: { bg: string; border: string; accent: string; muted: string } | null = null

const getGridColors = () => {
	const style = getComputedStyle(document.documentElement)
	return {
		bg: style.getPropertyValue('--wf-page-bg').trim() ||
			style.getPropertyValue('--dweb-defualt').trim() ||
			'#1e1e1e',
		border: style.getPropertyValue('--wf-border').trim() ||
			style.getPropertyValue('--vscode-border').trim() ||
			'rgba(0, 0, 0, 0.12)',
		accent: style.getPropertyValue('--wf-primary').trim() ||
			style.getPropertyValue('--vscode-border-accent').trim() ||
			'#1f9d84',
		muted: style.getPropertyValue('--wf-text-muted').trim() ||
			style.getPropertyValue('--vscode-fg-muted').trim() ||
			'#aeb8bd'
	}
}

const buildGridPattern = (stepPx: number, majorStepPx: number, colors: { bg: string; border: string }) => {
	const tileSize = majorStepPx
	const patternCanvas = document.createElement('canvas')
	const dpr = GRID_DPR
	patternCanvas.width = Math.ceil(tileSize * dpr)
	patternCanvas.height = Math.ceil(tileSize * dpr)
	const pctx = patternCanvas.getContext('2d')!
	pctx.scale(dpr, dpr)

	pctx.fillStyle = 'transparent'
	pctx.clearRect(0, 0, tileSize, tileSize)

	pctx.strokeStyle = colors.border
	pctx.globalAlpha = 0.25
	pctx.lineWidth = 1
	pctx.beginPath()
	for (let i = 0; i <= tileSize; i += stepPx) {
		if (i === tileSize) continue
		pctx.moveTo(i + 0.5, 0)
		pctx.lineTo(i + 0.5, tileSize)
		pctx.moveTo(0, i + 0.5)
		pctx.lineTo(tileSize, i + 0.5)
	}
	pctx.stroke()

	pctx.strokeStyle = colors.border
	pctx.globalAlpha = 0.45
	pctx.lineWidth = 1
	pctx.beginPath()
	pctx.moveTo(0.5, 0)
	pctx.lineTo(0.5, tileSize)
	pctx.moveTo(0, 0.5)
	pctx.lineTo(tileSize, 0.5)
	pctx.stroke()
	pctx.globalAlpha = 1

	return { pattern: patternCanvas, tileSize }
}

const requestDraw = () => {
	if (raf) return
	raf = requestAnimationFrame(() => {
		raf = 0
		drawGrid()
	})
}

const resizeCanvasToWrap = () => {
	const canvas = canvasEl.value
	const wrap = wrapEl.value
	if (!canvas || !wrap) return
	const dpr = GRID_DPR
	const r = wrap.getBoundingClientRect()
	const w = Math.max(1, Math.floor(r.width))
	const h = Math.max(1, Math.floor(r.height))
	const nextW = Math.max(1, Math.floor(w * dpr))
	const nextH = Math.max(1, Math.floor(h * dpr))
	if (canvas.width !== nextW) canvas.width = nextW
	if (canvas.height !== nextH) canvas.height = nextH
	canvas.style.width = `${w}px`
	canvas.style.height = `${h}px`
	requestDraw()
}

const drawGrid = () => {
	const canvas = canvasEl.value
	const wrap = wrapEl.value
	if (!canvas || !wrap) return
	const ctx = canvas.getContext('2d')
	if (!ctx) return

	savedFrameMoveHandles.value = []

	const dpr = GRID_DPR
	const r = wrap.getBoundingClientRect()
	const w = Math.max(1, Math.floor(r.width))
	const h = Math.max(1, Math.floor(r.height))

	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	ctx.clearRect(0, 0, w, h)

	const colors = getGridColors()
	ctx.fillStyle = colors.bg
	ctx.fillRect(0, 0, w, h)

	const z = viewportZoom.value
	const stepWorld = 80
	let stepPx = Math.max(16, stepWorld * z)
	let majorStepPx = stepPx * 5

	const needRebuildPattern = !gridPatternCache ||
		gridPatternZoom !== z ||
		!gridCacheColors ||
		gridCacheColors.border !== colors.border ||
		Math.abs(gridPatternStepPx - stepPx) > 0.5

	if (stepPx < 24) {
		stepPx = Math.max(32, majorStepPx)
		majorStepPx = stepPx * 5
	}

	if (needRebuildPattern || stepPx !== gridPatternStepPx) {
		const result = buildGridPattern(stepPx, majorStepPx, colors)
		gridPatternCache = result.pattern
		gridPatternTileSize = result.tileSize
		gridPatternZoom = z
		gridPatternStepPx = stepPx
		gridPatternMajorStepPx = majorStepPx
		gridCacheColors = colors
	}

	if (gridPatternCache) {
		const c = { x: w / 2 + viewportPanPx.value.x, y: h / 2 + viewportPanPx.value.y }
		const tileSize = gridPatternTileSize
		const offsetX = ((c.x % tileSize) + tileSize) % tileSize
		const offsetY = ((c.y % tileSize) + tileSize) % tileSize

		ctx.save()
		for (let y = -tileSize + offsetY; y < h + tileSize; y += tileSize) {
			for (let x = -tileSize + offsetX; x < w + tileSize; x += tileSize) {
				ctx.drawImage(gridPatternCache, x, y, tileSize, tileSize)
			}
		}
		ctx.restore()
	}

	const origin = worldToScreen({ x: 0, y: 0 })
	ctx.strokeStyle = colors.accent
	ctx.globalAlpha = 0.75
	ctx.lineWidth = 1
	ctx.beginPath()
	ctx.moveTo(origin.x + 0.5, 0)
	ctx.lineTo(origin.x + 0.5, h)
	ctx.moveTo(0, origin.y + 0.5)
	ctx.lineTo(w, origin.y + 0.5)
	ctx.stroke()
	ctx.globalAlpha = 1

	if (z >= 0.35) {
		ctx.fillStyle = colors.muted
		ctx.font = '12px sans-serif'
		ctx.fillText('0,0', origin.x + 6, origin.y - 6)
	}

	// --- 绘制多选框选框 ---
	const selFrame = props.selectionFrame
	if (selFrame?.visible && selFrame.worldRect) {
		const { x0, y0, x1, y1 } = selFrame.worldRect
		const screenTopLeft = worldToScreen({ x: x0, y: y0 })
		const screenBottomRight = worldToScreen({ x: x1, y: y1 })

		const left = Math.min(screenTopLeft.x, screenBottomRight.x)
		const top = Math.min(screenTopLeft.y, screenBottomRight.y)
		const width = Math.abs(screenBottomRight.x - screenTopLeft.x)
		const height = Math.abs(screenBottomRight.y - screenTopLeft.y)

		// 绘制背景半透明填充
		ctx.fillStyle = 'rgba(59, 130, 246, 0.06)'
		ctx.globalAlpha = 1
		ctx.fillRect(left, top, width, height)

		// 绘制虚线边框
		ctx.strokeStyle = '#3b82f6'
		ctx.globalAlpha = 0.8
		ctx.lineWidth = 1.5
		ctx.setLineDash([6, 4])
		ctx.strokeRect(left, top, width, height)
		ctx.setLineDash([])

		// 绘制四角装饰
		const cornerSize = 8
		ctx.strokeStyle = '#3b82f6'
		ctx.lineWidth = 2
		ctx.globalAlpha = 1

		// 左上角
		ctx.beginPath()
		ctx.moveTo(left, top + cornerSize)
		ctx.lineTo(left, top)
		ctx.lineTo(left + cornerSize, top)
		ctx.stroke()

		// 右上角
		ctx.beginPath()
		ctx.moveTo(left + width - cornerSize, top)
		ctx.lineTo(left + width, top)
		ctx.lineTo(left + width, top + cornerSize)
		ctx.stroke()

		// 左下角
		ctx.beginPath()
		ctx.moveTo(left, top + height - cornerSize)
		ctx.lineTo(left, top + height)
		ctx.lineTo(left + cornerSize, top + height)
		ctx.stroke()

		// 右下角
		ctx.beginPath()
		ctx.moveTo(left + width - cornerSize, top + height)
		ctx.lineTo(left + width, top + height)
		ctx.lineTo(left + width, top + height - cornerSize)
		ctx.stroke()

		// 标签栏由 DOM 组件 SelectionFrameOverlay 负责绘制和交互
		// Canvas 中不再绘制临时选区的标签栏，避免重复
		// 移动拖拽由 DOM 组件处理
		selectionFrameMoveHandle.value = null
		selectionFrameDeleteButton.value = null
	} else {
		selectionFrameMoveHandle.value = null
		selectionFrameDeleteButton.value = null
	}

	// --- 绘制已保存的选区框（持久化实体） ---
	if (props.savedFrames?.length && props.nodesById) {
		for (const frame of props.savedFrames) {
			if (!frame.nodeIds || frame.nodeIds.length < 2) continue

			// 计算已保存选区的包围盒
			let sfX0 = Infinity,
				sfY0 = Infinity,
				sfX1 = -Infinity,
				sfY1 = -Infinity
			let validNodes = 0
			for (const nid of frame.nodeIds) {
				const node = props.nodesById[nid]
				if (!node) continue
				const nx = node.worldX ?? 0,
					ny = node.worldY ?? 0
				const nw = node.width ?? 200,
					nh = node.height ?? 160
				const left = nx - nw / 2,
					top = ny - nh / 2
				const right = nx + nw / 2,
					bottom = ny + nh / 2
				sfX0 = Math.min(sfX0, left)
				sfY0 = Math.min(sfY0, top)
				sfX1 = Math.max(sfX1, right)
				sfY1 = Math.max(sfY1, bottom)
				validNodes++
			}
			if (validNodes < 2 || !isFinite(sfX0)) continue

			// 添加 padding
			const pad = 12
			sfX0 -= pad
			sfY0 -= pad
			sfX1 += pad
			sfY1 += pad

			const sTopLeft = worldToScreen({ x: sfX0, y: sfY0 })
			const sBottomRight = worldToScreen({ x: sfX1, y: sfY1 })
			const sLeft = Math.min(sTopLeft.x, sBottomRight.x)
			const sTop = Math.min(sTopLeft.y, sBottomRight.y)
			const sWidth = Math.abs(sBottomRight.x - sTopLeft.x)
			const sHeight = Math.abs(sBottomRight.y - sTopLeft.y)

			// 半透明填充
			ctx.fillStyle = 'rgba(16, 185, 129, 0.04)'
			ctx.fillRect(sLeft, sTop, sWidth, sHeight)

			// 已保存选区：实线边框（与临时虚线区分）
			ctx.strokeStyle = '#10b981' // 绿色表示已保存
			ctx.globalAlpha = 0.7
			ctx.lineWidth = 1.5
			ctx.setLineDash([])
			ctx.strokeRect(sLeft, sTop, sWidth, sHeight)

			// 四角装饰
			const cSize = 6
			ctx.strokeStyle = '#10b981'
			ctx.lineWidth = 2
			ctx.globalAlpha = 1
			// 左上
			ctx.beginPath()
			ctx.moveTo(sLeft, sTop + cSize)
			ctx.lineTo(sLeft, sTop)
			ctx.lineTo(sLeft + cSize, sTop)
			ctx.stroke()
			// 右上
			ctx.beginPath()
			ctx.moveTo(sLeft + sWidth - cSize, sTop)
			ctx.lineTo(sLeft + sWidth, sTop)
			ctx.lineTo(sLeft + sWidth, sTop + cSize)
			ctx.stroke()
			// 左下
			ctx.beginPath()
			ctx.moveTo(sLeft, sTop + sHeight - cSize)
			ctx.lineTo(sLeft, sTop + sHeight)
			ctx.lineTo(sLeft + cSize, sTop + sHeight)
			ctx.stroke()
			// 右下
			ctx.beginPath()
			ctx.moveTo(sLeft + sWidth - cSize, sTop + sHeight)
			ctx.lineTo(sLeft + sWidth, sTop + sHeight)
			ctx.lineTo(sLeft + sWidth, sTop + sHeight - cSize)
			ctx.stroke()

			// 标签栏（移到移动图标之前）
			const sTagLabel = frame.label || '已保存'
			const sTagH = 20
			const sTagT = sTop - sTagH - 4
			const sTagText = `${sTagLabel} (${frame.nodeIds.length}个节点)`
			ctx.font = '11px sans-serif'
			const sTagW = Math.max(80, ctx.measureText(sTagText).width + 16 + 20) // +20 for move icon
			ctx.fillStyle = 'rgba(6, 78, 59, 0.92)'
			ctx.fillRect(sLeft, sTagT, sTagW, sTagH)
			ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)'
			ctx.lineWidth = 1
			ctx.strokeRect(sLeft, sTagT, sTagW, sTagH)

			// 绘制移动图标（位于标题框左侧内部）
			const sMoveHandleSize = 14
			const sMoveHandleX = sLeft + 3
			const sMoveHandleY = sTagT + (sTagH - sMoveHandleSize) / 2

			// 保存标题框区域用于交互检测（整个标题框都可拖拽）
			const savedFrameHandle = {
				x: sLeft,
				y: sTagT,
				width: sTagW,
				height: sTagH,
				frameId: frame.id,
				nodeIds: frame.nodeIds,
				deleteBtn: {
					x: sLeft + sWidth - 20,
					y: sTop - 20,
					width: 20,
					height: 20
				}
			}
			savedFrameMoveHandles.value.push(savedFrameHandle)

			// 绘制移动图标（十字箭头样式）
			ctx.strokeStyle = '#6ee7b7'
			ctx.lineWidth = 2
			ctx.lineCap = 'round'
			ctx.lineJoin = 'round'

			const sArrowSize = 4
			const sCenterX = sMoveHandleX + sMoveHandleSize / 2
			const sCenterY = sMoveHandleY + sMoveHandleSize / 2

			// 绘制十字箭头（中心十字 + 四个箭头）
			// 水平线
			ctx.beginPath()
			ctx.moveTo(sCenterX - sArrowSize, sCenterY)
			ctx.lineTo(sCenterX + sArrowSize, sCenterY)
			ctx.stroke()

			// 垂直线
			ctx.beginPath()
			ctx.moveTo(sCenterX, sCenterY - sArrowSize)
			ctx.lineTo(sCenterX, sCenterY + sArrowSize)
			ctx.stroke()

			// 上箭头
			ctx.beginPath()
			ctx.moveTo(sCenterX, sCenterY - sArrowSize - 2.5)
			ctx.lineTo(sCenterX - 3, sCenterY - sArrowSize)
			ctx.moveTo(sCenterX, sCenterY - sArrowSize - 2.5)
			ctx.lineTo(sCenterX + 3, sCenterY - sArrowSize)
			ctx.stroke()

			// 下箭头
			ctx.beginPath()
			ctx.moveTo(sCenterX, sCenterY + sArrowSize + 2.5)
			ctx.lineTo(sCenterX - 3, sCenterY + sArrowSize)
			ctx.moveTo(sCenterX, sCenterY + sArrowSize + 2.5)
			ctx.lineTo(sCenterX + 3, sCenterY + sArrowSize)
			ctx.stroke()

			// 左箭头
			ctx.beginPath()
			ctx.moveTo(sCenterX - sArrowSize - 2.5, sCenterY)
			ctx.lineTo(sCenterX - sArrowSize, sCenterY - 3)
			ctx.moveTo(sCenterX - sArrowSize - 2.5, sCenterY)
			ctx.lineTo(sCenterX - sArrowSize, sCenterY + 3)
			ctx.stroke()

			// 右箭头
			ctx.beginPath()
			ctx.moveTo(sCenterX + sArrowSize + 2.5, sCenterY)
			ctx.lineTo(sCenterX + sArrowSize, sCenterY - 3)
			ctx.moveTo(sCenterX + sArrowSize + 2.5, sCenterY)
			ctx.lineTo(sCenterX + sArrowSize, sCenterY + 3)
			ctx.stroke()

			// 标签文字（右移以避开图标）
			ctx.fillStyle = '#6ee7b7'
			ctx.globalAlpha = 1
			ctx.textAlign = 'center'
			ctx.textBaseline = 'middle'
			ctx.fillText(sTagText, sLeft + sTagW / 2, sTagT + sTagH / 2)

			// 绘制删除按钮（位于绿框顶部最右侧，右上角）
			const sDeleteBtnSize = 20
			const sDeleteBtnX = sLeft + sWidth - sDeleteBtnSize
			const sDeleteBtnY = sTop - sDeleteBtnSize

			// 删除按钮背景
			ctx.fillStyle = 'rgba(239, 68, 68, 0.2)'
			ctx.fillRect(sDeleteBtnX, sDeleteBtnY, sDeleteBtnSize, sDeleteBtnSize)

			// 删除按钮边框
			ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)'
			ctx.lineWidth = 1
			ctx.strokeRect(sDeleteBtnX, sDeleteBtnY, sDeleteBtnSize, sDeleteBtnSize)

			// 绘制 × 图标
			ctx.strokeStyle = '#ef4444'
			ctx.lineWidth = 1.8
			ctx.lineCap = 'round'

			const sCrossSize = 8
			const sCrossX = sDeleteBtnX + sDeleteBtnSize / 2
			const sCrossY = sDeleteBtnY + sDeleteBtnSize / 2

			ctx.beginPath()
			ctx.moveTo(sCrossX - sCrossSize / 2, sCrossY - sCrossSize / 2)
			ctx.lineTo(sCrossX + sCrossSize / 2, sCrossY + sCrossSize / 2)
			ctx.moveTo(sCrossX + sCrossSize / 2, sCrossY - sCrossSize / 2)
			ctx.lineTo(sCrossX - sCrossSize / 2, sCrossY + sCrossSize / 2)
			ctx.stroke()
		}
	} else {
		savedFrameMoveHandles.value = []
	}

	ctx.globalAlpha = 1
}

let ro: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null

onMounted(() => {
	resizeCanvasToWrap()
	requestDraw()
	if ('ResizeObserver' in window) {
		ro = new ResizeObserver(() => resizeCanvasToWrap())
		if (wrapEl.value) ro.observe(wrapEl.value)
	}
	themeObserver = new MutationObserver(() => requestDraw())
	themeObserver.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['data-theme']
	})
})

// 监听节点位置变化以实时更新多选框
const nodePositionsHash = computed(() => {
	const nodesById = props.nodesById
	if (!nodesById) return ''
	return JSON.stringify(
		Object.keys(nodesById)
			.map((id) => ({
				id,
				x: nodesById[id]?.worldX,
				y: nodesById[id]?.worldY
			}))
			.sort((a, b) => a.id.localeCompare(b.id))
	)
})

watch(
	() => [
		props.viewport?.zoom,
		props.viewport?.panX,
		props.viewport?.panY,
		props.selectionFrame?.visible,
		props.selectionFrame?.worldRect?.x0,
		props.selectionFrame?.worldRect?.y0,
		props.selectionFrame?.worldRect?.x1,
		props.selectionFrame?.worldRect?.y1,
		props.selectionFrame?.nodeCount,
		props.savedFrames?.length,
		nodePositionsHash.value
	],
	() => requestDraw()
)

onBeforeUnmount(() => {
	if (raf) cancelAnimationFrame(raf)
	raf = 0
	if (viewportRafId) cancelAnimationFrame(viewportRafId)
	viewportRafId = 0
	pendingViewport = null
	ro?.disconnect()
	ro = null
	themeObserver?.disconnect()
	themeObserver = null
})

let bgDrag: null | {
	start: { x: number; y: number }
	startPan: { x: number; y: number }
} = null

// Touch/pen panning state (single finger/stylus on blank area)
let touchDrag: null | {
	start: { x: number; y: number }
	startPan: { x: number; y: number }
	pointerId: number
} = null

const DRAG_THRESHOLD_PX = 4
let suppressContextMenuOnce = false

const boxSel = ref<null | {
	start: { x: number; y: number }
	cur: { x: number; y: number }
}>(null)

const boxSelStyle = computed(() => {
	if (!boxSel.value) return {}
	const a = boxSel.value.start
	const b = boxSel.value.cur
	const left = Math.min(a.x, b.x)
	const top = Math.min(a.y, b.y)
	const width = Math.abs(a.x - b.x)
	const height = Math.abs(a.y - b.y)
	return {
		left: `${left}px`,
		top: `${top}px`,
		width: `${width}px`,
		height: `${height}px`
	} as Record<string, string>
})

const toLocal = (wrap: HTMLElement, client: { x: number; y: number }) => {
	const r = wrap.getBoundingClientRect()
	return { x: client.x - r.left, y: client.y - r.top }
}

const onWrapPointerDown = (e: PointerEvent) => {
	const wrap = wrapEl.value
	if (!wrap) return

	const target = e.target as HTMLElement | null
	if (target?.closest('[data-bp-ui-overlay="true"]')) return

	// Right button: pan viewport
	if (e.button === 2) {
		e.preventDefault()
		emit('canvas-panning-start')
		bgDrag = {
			start: { x: e.clientX, y: e.clientY },
			startPan: { ...viewportPanPx.value }
		}
		let moved = false
		wrap.setPointerCapture(e.pointerId)
		const onMove = (ev: PointerEvent) => {
			if (!bgDrag) return
			ev.preventDefault()
			const dx = ev.clientX - bgDrag.start.x
			const dy = ev.clientY - bgDrag.start.y
			if (!moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) moved = true
			const next = {
				x: bgDrag.startPan.x + dx,
				y: bgDrag.startPan.y + dy
			}
			scheduleViewportEmit({ zoom: viewportZoom.value, panX: next.x, panY: next.y })
		}
		const onUp = (ev: PointerEvent) => {
			bgDrag = null
			wrap.removeEventListener('pointermove', onMove)
			wrap.removeEventListener('pointerup', onUp)
			wrap.removeEventListener('pointercancel', onUp)
			try {
				wrap.releasePointerCapture(ev.pointerId)
			} catch {
				// ignore
			}
			flushViewportEmitNow()
			if (moved) suppressContextMenuOnce = true
			emit('canvas-panning-end')
		}
		wrap.addEventListener('pointermove', onMove, { passive: false })
		wrap.addEventListener('pointerup', onUp, { once: true })
		wrap.addEventListener('pointercancel', onUp, { once: true })
		return
	}

	// Touch or pen: pan viewport (single finger/stylus drag on blank area)
	const isTouchOrPen = e.pointerType === 'touch' || e.pointerType === 'pen'
	if (isTouchOrPen && e.button === 0) {
		e.preventDefault()
		emit('canvas-panning-start')
		touchDrag = {
			start: { x: e.clientX, y: e.clientY },
			startPan: { ...viewportPanPx.value },
			pointerId: e.pointerId
		}
		wrap.setPointerCapture(e.pointerId)
		const onMove = (ev: PointerEvent) => {
			if (!touchDrag || ev.pointerId !== touchDrag.pointerId) return
			ev.preventDefault()
			const dx = ev.clientX - touchDrag.start.x
			const dy = ev.clientY - touchDrag.start.y
			const next = {
				x: touchDrag.startPan.x + dx,
				y: touchDrag.startPan.y + dy
			}
			scheduleViewportEmit({ zoom: viewportZoom.value, panX: next.x, panY: next.y })
		}
		const onUp = (ev: PointerEvent) => {
			if (touchDrag && ev.pointerId !== touchDrag.pointerId) return
			touchDrag = null
			wrap.removeEventListener('pointermove', onMove)
			wrap.removeEventListener('pointerup', onUp)
			wrap.removeEventListener('pointercancel', onUp)
			try {
				wrap.releasePointerCapture(ev.pointerId)
			} catch {
				// ignore
			}
			flushViewportEmitNow()
			emit('canvas-panning-end')
		}
		wrap.addEventListener('pointermove', onMove, { passive: false })
		wrap.addEventListener('pointerup', onUp, { once: true })
		wrap.addEventListener('pointercancel', onUp, { once: true })
		return
	}

	// Left button: check for selection frame drag or box select (mouse only)
	if (e.button === 0) {
		const start = toLocal(wrap, { x: e.clientX, y: e.clientY })

		// 检查是否点击在已保存选区的删除按钮上（优先于移动手柄检测）
		let clickedSavedDeleteFrame: SavedFrameHandle | null = null
		for (const h of savedFrameMoveHandles.value) {
			if (
				h.deleteBtn &&
				start.x >= h.deleteBtn.x &&
				start.x <= h.deleteBtn.x + h.deleteBtn.width &&
				start.y >= h.deleteBtn.y &&
				start.y <= h.deleteBtn.y + h.deleteBtn.height
			) {
				clickedSavedDeleteFrame = h
				break
			}
		}

		if (clickedSavedDeleteFrame) {
			e.preventDefault()
			emit('selection-frame-delete', { frameId: clickedSavedDeleteFrame.frameId })
			return
		}

		// 检查是否点击在已保存选区的移动手柄上
		const savedHandle = savedFrameMoveHandles.value.find(
			(h) =>
				start.x >= h.x && start.x <= h.x + h.width && start.y >= h.y && start.y <= h.y + h.height
		)

		if (savedHandle) {
			// 开始拖拽已保存选区
			e.preventDefault()
			draggingSelectionFrame.value = true
			dragLastWorld.value = screenToWorld(start)

			// 记录当前选区节点的位置
			const startNodes: Record<string, { x: number; y: number }> = {}
			if (props.nodesById) {
				for (const id of savedHandle.nodeIds) {
					const node = props.nodesById[id]
					if (node) {
						startNodes[id] = { x: node.worldX ?? 0, y: node.worldY ?? 0 }
					}
				}
			}
			dragStartNodes.value = startNodes

			wrap.setPointerCapture(e.pointerId)

			const onMove = (ev: PointerEvent) => {
				if (!draggingSelectionFrame.value) return
				const cur = toLocal(wrap, { x: ev.clientX, y: ev.clientY })
				const curWorld = screenToWorld(cur)
				const dx = curWorld.x - dragLastWorld.value.x
				const dy = curWorld.y - dragLastWorld.value.y
				dragLastWorld.value = curWorld

				emit('selection-frame-drag', {
					dx,
					dy,
					nodeIds: Object.keys(dragStartNodes.value)
				})
			}

			const onUp = (ev: PointerEvent) => {
				draggingSelectionFrame.value = false
				dragStartNodes.value = {}
				wrap.removeEventListener('pointermove', onMove)
				wrap.removeEventListener('pointerup', onUp)
				wrap.removeEventListener('pointercancel', onUp)
				try {
					wrap.releasePointerCapture(ev.pointerId)
				} catch {
					// ignore
				}
			}

			wrap.addEventListener('pointermove', onMove)
			wrap.addEventListener('pointerup', onUp, { once: true })
			wrap.addEventListener('pointercancel', onUp, { once: true })
			return
		}

		// 普通框选
		let moved = false
		wrap.setPointerCapture(e.pointerId)
		const onMove = (ev: PointerEvent) => {
			const cur = toLocal(wrap, { x: ev.clientX, y: ev.clientY })
			if (!moved && Math.hypot(cur.x - start.x, cur.y - start.y) >= DRAG_THRESHOLD_PX) {
				moved = true
				boxSel.value = { start, cur }
			}
			if (boxSel.value) boxSel.value.cur = cur
		}
		const onUp = (ev: PointerEvent) => {
			wrap.removeEventListener('pointermove', onMove)
			wrap.removeEventListener('pointerup', onUp)
			wrap.removeEventListener('pointercancel', onUp)
			try {
				wrap.releasePointerCapture(ev.pointerId)
			} catch {
				// ignore
			}
			if (boxSel.value) {
				const end = boxSel.value.cur
				const w0 = screenToWorld({ x: boxSel.value.start.x, y: boxSel.value.start.y })
				const w1 = screenToWorld({ x: end.x, y: end.y })
				emit('box-select', { worldRect: { x0: w0.x, y0: w0.y, x1: w1.x, y1: w1.y } })
				boxSel.value = null
			}
		}
		wrap.addEventListener('pointermove', onMove)
		wrap.addEventListener('pointerup', onUp, { once: true })
		wrap.addEventListener('pointercancel', onUp, { once: true })
	}
}

const onWrapPointerMove = (e: PointerEvent) => {
	const wrap = wrapEl.value
	if (!wrap) return

	const pos = toLocal(wrap, { x: e.clientX, y: e.clientY })

	// 检查是否悬停在临时选区的标题框上
	const handle = selectionFrameMoveHandle.value
	const isOnTempFrame =
		handle &&
		pos.x >= handle.x &&
		pos.x <= handle.x + handle.width &&
		pos.y >= handle.y &&
		pos.y <= handle.y + handle.height

	// 检查是否悬停在已保存选区的标题框上
	const isOnSavedFrame = savedFrameMoveHandles.value.some(
		(h) => pos.x >= h.x && pos.x <= h.x + h.width && pos.y >= h.y && pos.y <= h.y + h.height
	)

	isOverMoveHandle.value = isOnTempFrame || isOnSavedFrame
}

const onWrapPointerLeave = () => {
	isOverMoveHandle.value = false
}

const onWheel = (e: WheelEvent) => {
	const wrap = wrapEl.value
	if (!wrap) return
	e.preventDefault()

	const r = wrap.getBoundingClientRect()
	const p = { x: e.clientX - r.left, y: e.clientY - r.top }
	const w0 = screenToWorld(p)
	const z0 = viewportZoom.value
	const z1 = clamp(z0 * (e.deltaY > 0 ? 0.92 : 1.08), 0.2, 6)
	if (Math.abs(z1 - z0) < 1e-6) return
	const c = screenCenter()
	const panX1 = p.x - c.x - w0.x * z1
	const panY1 = p.y - c.y - w0.y * z1
	emit('update:viewport', { zoom: z1, panX: panX1, panY: panY1 })
}

const onDblClick = (e: MouseEvent) => {
	const target = e.target as HTMLElement
	const path = e.composedPath()
	const isOnNode = path.some((el) => {
		if (el instanceof HTMLElement) {
			return el.classList.contains('wf-node') || el.hasAttribute('data-wf-node-id')
		}
		return false
	})
	if (isOnNode) return
	const world = screenToWorld({ x: e.clientX, y: e.clientY })
	emit('canvas-dblclick', {
		clientX: e.clientX,
		clientY: e.clientY,
		worldX: world.x,
		worldY: world.y
	})
}

const onContextMenu = (e: MouseEvent) => {
	// 只在节点上触发右键菜单，空白区域不触发
	const target = e.target as HTMLElement
	const path = e.composedPath()
	const isOnNode = path.some((el) => {
		if (el instanceof HTMLElement) {
			return el.classList.contains('wf-node') || el.hasAttribute('data-wf-node-id')
		}
		return false
	})
	if (!isOnNode) return
	const world = screenToWorld({ x: e.clientX, y: e.clientY })
	emit('canvas-contextmenu', {
		clientX: e.clientX,
		clientY: e.clientY,
		worldX: world.x,
		worldY: world.y
	})
}
</script>

<style scoped>
.bp-wrap {
	position: relative;
	width: 100%;
	height: 100%;
	overflow: hidden;
	user-select: none;
	touch-action: none;
	-webkit-user-select: none;
	-webkit-touch-callout: none;
}

.bp-boxsel {
	position: absolute;
	z-index: 999;
	border: 1px dashed var(--wf-primary, #1f9d84);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 18%, transparent);
	pointer-events: none;
}

.bp-grid-canvas {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
}

.bp-wrap--move-cursor {
	cursor: move;
	cursor: grab;
}

.bp-wrap--move-cursor:active {
	cursor: grabbing;
}
</style>
