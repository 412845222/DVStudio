<template>
	<div ref="edgeLayerWrapRef" class="wf-edge-layer-wrap">
		<canvas ref="edgeCanvasRef" class="wf-edge-canvas" />
	</div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

export type EdgePoint = { x: number; y: number }
export type EdgeRender = {
	id: string
	start: EdgePoint
	end: EdgePoint
	path: string
	stroke?: string
	strokeWidth?: number
}

export type AnchorRender = {
	nodeId: string
	anchorId: string
	anchorIndex: number
	direction: 'in' | 'out'
	x: number
	y: number
	mediaType?: string
	phase?: 'idle' | 'armed' | 'snapped' | 'dragging' | 'release'
	magnetX?: number
	magnetY?: number
	compatible?: boolean | null
}

const props = withDefaults(
	defineProps<{
		edges: EdgeRender[]
		selectedEdgeId: string | null
		draft?: { path: string; stroke?: string; strokeWidth?: number } | null
		motionActive?: boolean
		zoom?: number
		anchors?: AnchorRender[]
	}>(),
	{
		anchors: () => []
	}
)

const emit = defineEmits<{
	(e: 'select-edge', id: string): void
	(e: 'anchor-pointerdown', payload: { nodeId: string; anchorId: string; anchorIndex: number; direction: 'in' | 'out'; event: PointerEvent }): void
}>()

const ANCHOR_COLORS: Record<string, string> = {
	default: '#1f9d84',
	image: '#9b59b6',
	video: '#27ae60',
	text: '#f1c40f',
	model3d: '#3498db',
	flow: '#e67e22',
	audio: '#e91e63',
	meta: '#7f8c8d',
	resource: '#3498db'
}

const ANCHOR_HIT_RADIUS = 22
const ANCHOR_DOT_SIZE = 10
const ANCHOR_RING_SIZE = 24

const displayedEdges = shallowRef<EdgeRender[]>([])
const displayedDraft = shallowRef<{
	path: string
	stroke?: string
	strokeWidth?: number
} | null>(null)
const displayedAnchors = shallowRef<AnchorRender[]>([])
type EdgeHitEntry = {
	id: string
	path: Path2D
	strokeWidth: number
}

const edgeCanvasRef = ref<HTMLCanvasElement | null>(null)
const edgeLayerWrapRef = ref<HTMLDivElement | null>(null)
const hitEntries = shallowRef<EdgeHitEntry[]>([])
const hoveredEdgeId = ref<string | null>(null)
const hoveredAnchorKey = ref<string | null>(null)
const pointerDownAnchorKey = ref<string | null>(null)
let presentRaf = 0
let canvasDrawRaf = 0
let hoverHitRaf = 0
let canvasResizeObserver: ResizeObserver | null = null
let parentPointerHost: HTMLElement | null = null
let hitCanvas: HTMLCanvasElement | null = null
let hitCtx: CanvasRenderingContext2D | null = null
let pendingHoverPoint: { x: number; y: number } | null = null

const anchorKey = (a: { nodeId: string; direction: string; anchorId: string }) =>
	`${a.nodeId}-${a.direction}-${a.anchorId}`

const setParentCursor = (cursor: string | null) => {
	if (!parentPointerHost) return
	if (!cursor) {
		parentPointerHost.style.removeProperty('cursor')
		return
	}
	parentPointerHost.style.cursor = cursor
}

const setHoveredEdge = (edgeId: string | null) => {
	const next = typeof edgeId === 'string' && edgeId.trim() ? edgeId : null
	if (hoveredEdgeId.value === next) return
	hoveredEdgeId.value = next
	setParentCursor(next ? 'pointer' : hoveredAnchorKey.value ? 'crosshair' : null)
	scheduleCanvasDraw()
}

const setHoveredAnchor = (key: string | null) => {
	const next = typeof key === 'string' && key.trim() ? key : null
	if (hoveredAnchorKey.value === next) return
	hoveredAnchorKey.value = next
	setParentCursor(next ? 'crosshair' : hoveredEdgeId.value ? 'pointer' : null)
	scheduleCanvasDraw()
}

const clearHoveredEdge = () => {
	if (hoverHitRaf) {
		cancelAnimationFrame(hoverHitRaf)
		hoverHitRaf = 0
	}
	pendingHoverPoint = null
	setHoveredEdge(null)
	setHoveredAnchor(null)
}

const updateHitCanvasSize = (width: number, height: number) => {
	if (!hitCanvas) hitCanvas = document.createElement('canvas')
	if (hitCanvas.width !== width) hitCanvas.width = width
	if (hitCanvas.height !== height) hitCanvas.height = height
	hitCtx = hitCanvas.getContext('2d')
}

const resolveZoomScale = () => {
	const zoom = Number(props.zoom)
	if (!Number.isFinite(zoom)) return 1
	return Math.max(0.45, Math.min(2.2, zoom))
}

const resolveStrokeWidth = (baseWidth: number) => {
	return Math.max(0.7, baseWidth * resolveZoomScale())
}

const shouldReduceHoverHitTest = () => {
	const zoom = Number(props.zoom)
	const lowZoom = Number.isFinite(zoom) ? zoom <= 0.42 : false
	const heavyEdgeCount = displayedEdges.value.length >= 320
	return Boolean(props.motionActive) || lowZoom || heavyEdgeCount
}

const rebuildHitEntries = () => {
	hitEntries.value = displayedEdges.value.map((edge) => ({
		id: edge.id,
		path: new Path2D(edge.path),
		strokeWidth: Math.max(6, resolveStrokeWidth(edge.strokeWidth ?? 2) + 5)
	}))
}

const flushDisplay = () => {
	presentRaf = 0
	displayedEdges.value = Array.isArray(props.edges) ? props.edges.slice() : []
	displayedDraft.value = props.draft ?? null
	displayedAnchors.value = Array.isArray(props.anchors) ? props.anchors.slice() : []
	rebuildHitEntries()
	if (
		hoveredEdgeId.value &&
		!displayedEdges.value.some((edge) => edge.id === hoveredEdgeId.value)
	) {
		setHoveredEdge(null)
	}
	if (hoveredAnchorKey.value) {
		const exists = displayedAnchors.value.some((a) => anchorKey(a) === hoveredAnchorKey.value)
		if (!exists) setHoveredAnchor(null)
	}
	scheduleCanvasDraw()
}

const scheduleDisplay = () => {
	if (props.motionActive) {
		if (presentRaf) {
			cancelAnimationFrame(presentRaf)
			presentRaf = 0
		}
		flushDisplay()
		return
	}
	if (presentRaf) return
	presentRaf = requestAnimationFrame(flushDisplay)
}

const drawRoundedRect = (
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
) => {
	const radius = Math.max(0, Math.min(r, w / 2, h / 2))
	ctx.beginPath()
	ctx.moveTo(x + radius, y)
	ctx.lineTo(x + w - radius, y)
	ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
	ctx.lineTo(x + w, y + h - radius)
	ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
	ctx.lineTo(x + radius, y + h)
	ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
	ctx.lineTo(x, y + radius)
	ctx.quadraticCurveTo(x, y, x + radius, y)
	ctx.closePath()
}

const hexToRgba = (hex: string, alpha: number) => {
	const h = hex.replace('#', '')
	const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
	const r = parseInt(full.substring(0, 2), 16)
	const g = parseInt(full.substring(2, 4), 16)
	const b = parseInt(full.substring(4, 6), 16)
	return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const drawAnchor = (
	ctx: CanvasRenderingContext2D,
	anchor: AnchorRender,
	isHovered: boolean,
	isDragging: boolean,
	lowDetail: boolean
) => {
	const mx = anchor.magnetX ?? 0
	const my = anchor.magnetY ?? 0
	const cx = anchor.x + mx
	const cy = anchor.y + my
	const mediaType = anchor.mediaType && ANCHOR_COLORS[anchor.mediaType] ? anchor.mediaType : 'default'
	const color = ANCHOR_COLORS[mediaType] ?? ANCHOR_COLORS.default

	let dotSize = ANCHOR_DOT_SIZE
	let ringSize = ANCHOR_RING_SIZE
	let dotRotateDeg = 0
	let ringBorderAlpha = 0.45
	let ringBorderWidth = 1
	let glowSize = 0
	let glowAlpha = 0

	const phase = anchor.phase ?? 'idle'

	if (isDragging || phase === 'dragging') {
		dotSize = ANCHOR_DOT_SIZE * 1.14
		ringSize = ANCHOR_RING_SIZE * 1.12
		dotRotateDeg = 45
		ringBorderAlpha = 0.72
		glowSize = 14
		glowAlpha = 0.4
	} else if (phase === 'snapped') {
		dotSize = ANCHOR_DOT_SIZE * 1.2
		ringSize = ANCHOR_RING_SIZE * 1.18
		dotRotateDeg = 90
		ringBorderAlpha = 1
		ringBorderWidth = 1.5
		glowSize = 14
		glowAlpha = 0.4
	} else if (isHovered || phase === 'armed') {
		dotSize = ANCHOR_DOT_SIZE * 1.08
		ringSize = ANCHOR_RING_SIZE * 1.08
		dotRotateDeg = 15
		ringBorderAlpha = 0.72
		glowSize = 14
		glowAlpha = 0.4
	}

	const alpha = anchor.compatible === false ? 0.5 : 1
	ctx.save()
	ctx.globalAlpha = alpha

	if (!lowDetail && glowSize > 0 && glowAlpha > 0) {
		const glowR = ringSize / 2 + 4
		const grad = ctx.createRadialGradient(cx, cy, ringSize / 2, cx, cy, glowR)
		grad.addColorStop(0, hexToRgba(color, glowAlpha))
		grad.addColorStop(1, hexToRgba(color, 0))
		ctx.fillStyle = grad
		ctx.beginPath()
		ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
		ctx.fill()
	}

	const rx = cx - ringSize / 2
	const ry = cy - ringSize / 2

	ctx.save()
	if (!lowDetail) {
		ctx.shadowColor = 'rgba(0, 0, 0, 0.18)'
		ctx.shadowBlur = 8
		ctx.shadowOffsetY = 2
	}
	drawRoundedRect(ctx, rx, ry, ringSize, ringSize, 2)
	ctx.fillStyle = hexToRgba('#15181c', 0.7)
	ctx.fill()
	ctx.strokeStyle = hexToRgba(color, ringBorderAlpha)
	ctx.lineWidth = ringBorderWidth
	ctx.stroke()
	ctx.restore()

	if (!lowDetail && ringBorderAlpha >= 0.7) {
		drawRoundedRect(ctx, rx - 1, ry - 1, ringSize + 2, ringSize + 2, 3)
		ctx.strokeStyle = hexToRgba(color, 0.12)
		ctx.lineWidth = 1
		ctx.stroke()
	}

	ctx.save()
	if (!lowDetail) {
		ctx.shadowColor = hexToRgba(color, 0.55)
		ctx.shadowBlur = 6
	}
	const dx = cx - dotSize / 2
	const dy = cy - dotSize / 2
	if (dotRotateDeg !== 0) {
		ctx.translate(cx, cy)
		ctx.rotate((dotRotateDeg * Math.PI) / 180)
		drawRoundedRect(ctx, -dotSize / 2, -dotSize / 2, dotSize, dotSize, 3)
	} else {
		drawRoundedRect(ctx, dx, dy, dotSize, dotSize, 3)
	}
	ctx.fillStyle = color
	ctx.fill()
	ctx.restore()

	ctx.restore()
}

const drawCanvas = () => {
	canvasDrawRaf = 0
	const canvas = edgeCanvasRef.value
	if (!canvas) return
	const parent = canvas.parentElement as HTMLElement | null
	if (!parent) return
	const rect = parent.getBoundingClientRect()
	const width = Math.max(1, Math.floor(rect.width))
	const height = Math.max(1, Math.floor(rect.height))
	const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))
	const pixelW = Math.max(1, Math.floor(width * dpr))
	const pixelH = Math.max(1, Math.floor(height * dpr))
	if (canvas.width !== pixelW) canvas.width = pixelW
	if (canvas.height !== pixelH) canvas.height = pixelH
	canvas.style.width = `${width}px`
	canvas.style.height = `${height}px`
	updateHitCanvasSize(width, height)

	const ctx = canvas.getContext('2d')
	if (!ctx) return
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	ctx.clearRect(0, 0, width, height)
	ctx.lineCap = 'round'
	ctx.lineJoin = 'round'
	const zoom = Number(props.zoom) || 1
	const lowDetail = Boolean(props.motionActive) || zoom <= 0.35
	const veryLowDetail = zoom <= 0.25
	const heavyEdgeCount = displayedEdges.value.length >= 400
	const suppressEffects = lowDetail || heavyEdgeCount
	const skipAnchors = veryLowDetail || (lowDetail && heavyEdgeCount)

	const drawPath = (
		path: Path2D,
		stroke: string,
		strokeWidth: number,
		opts?: { dashed?: boolean; selected?: boolean; hovered?: boolean; alpha?: number }
	) => {
		ctx.strokeStyle = stroke
		ctx.globalAlpha = opts?.alpha ?? 0.9
		const effectiveWidth = opts?.hovered && !opts?.selected ? strokeWidth + 0.8 : strokeWidth
		ctx.lineWidth = effectiveWidth
		ctx.setLineDash(opts?.dashed ? [6, 6] : [])
		if (opts?.hovered && !opts?.selected && !suppressEffects) {
			ctx.save()
			ctx.strokeStyle = stroke
			ctx.shadowColor = 'rgba(58, 168, 180, 0.45)'
			ctx.shadowBlur = 5
			ctx.stroke(path)
			ctx.restore()
			ctx.globalAlpha = 1
			ctx.lineWidth = effectiveWidth
			ctx.setLineDash(opts?.dashed ? [6, 6] : [])
		}
		if (opts?.selected && !suppressEffects) {
			ctx.save()
			ctx.strokeStyle = stroke
			ctx.shadowColor = 'rgba(58, 168, 180, 0.85)'
			ctx.shadowBlur = 8
			ctx.stroke(path)
			ctx.restore()
			ctx.globalAlpha = 1
			ctx.lineWidth = strokeWidth
			ctx.setLineDash(opts?.dashed ? [6, 6] : [])
		}
		ctx.strokeStyle = stroke
		ctx.stroke(path)
		ctx.setLineDash([])
		ctx.globalAlpha = 1
	}

	const hitEntriesRef = hitEntries.value
	const edgesLen = displayedEdges.value.length
	for (let i = 0; i < edgesLen; i++) {
		const edge = displayedEdges.value[i]
		const hitEntry = i < hitEntriesRef.length ? hitEntriesRef[i] : null
		const path = hitEntry?.path ?? new Path2D(edge.path)
		const selected = edge.id === props.selectedEdgeId
		const hovered = edge.id === hoveredEdgeId.value
		drawPath(path, edge.stroke || '#3aa0ff', resolveStrokeWidth(edge.strokeWidth ?? 2), {
			selected,
			hovered,
			alpha: hovered && !selected ? 1 : 0.92
		})
	}

	const draft = displayedDraft.value
	if (draft && draft.path) {
		const p = new Path2D(draft.path)
		drawPath(p, draft.stroke || '#3aa8b4', resolveStrokeWidth(draft.strokeWidth ?? 2.5), {
			dashed: true,
			alpha: 0.8
		})
	}

	if (!skipAnchors) {
		for (const anchor of displayedAnchors.value) {
			const isHovered = anchorKey(anchor) === hoveredAnchorKey.value
			const isDragging = (anchor.phase ?? 'idle') === 'dragging'
			drawAnchor(ctx, anchor, isHovered, isDragging, lowDetail)
		}
	}
}

const hitTestEdge = (canvasX: number, canvasY: number) => {
	const ctx = hitCtx
	if (!ctx) return null as string | null
	if (canvasX < 0 || canvasY < 0) return null
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	ctx.lineCap = 'round'
	ctx.lineJoin = 'round'
	for (let index = hitEntries.value.length - 1; index >= 0; index -= 1) {
		const entry = hitEntries.value[index]
		ctx.lineWidth = entry.strokeWidth
		if (ctx.isPointInStroke(entry.path, canvasX, canvasY)) return entry.id
	}
	return null
}

const hitTestAnchor = (canvasX: number, canvasY: number) => {
	let best: { key: string; dist: number; anchor: AnchorRender } | null = null
	for (const a of displayedAnchors.value) {
		const dx = canvasX - a.x
		const dy = canvasY - a.y
		const dist = Math.hypot(dx, dy)
		if (dist > ANCHOR_HIT_RADIUS) continue
		if (!best || dist < best.dist) {
			best = { key: anchorKey(a), dist, anchor: a }
		}
	}
	return best
}

const getCanvasPoint = (clientX: number, clientY: number) => {
	const wrap = edgeLayerWrapRef.value
	if (!wrap) return null
	const rect = wrap.getBoundingClientRect()
	return { x: clientX - rect.left, y: clientY - rect.top }
}

const shouldHandlePointerEvent = (target: EventTarget | null) => {
	const targetEl = target instanceof HTMLElement ? target : null
	if (!targetEl) return false
	if (targetEl.closest('.wf-node')) return false
	return Boolean(targetEl.closest('.bp-wrap'))
}

const onParentPointerDownCapture = (event: PointerEvent) => {
	if (event.button !== 0) return
	if (!shouldHandlePointerEvent(event.target)) return
	const pt = getCanvasPoint(event.clientX, event.clientY)
	if (!pt) return

	const anchorHit = hitTestAnchor(pt.x, pt.y)
	if (anchorHit) {
		event.preventDefault()
		event.stopPropagation()
		pointerDownAnchorKey.value = anchorHit.key
		const a = anchorHit.anchor
		if (a.direction === 'out') {
			emit('anchor-pointerdown', {
				nodeId: a.nodeId,
				anchorId: a.anchorId,
				anchorIndex: a.anchorIndex,
				direction: a.direction,
				event
			})
		}
		return
	}

	const edgeId = hitTestEdge(pt.x, pt.y)
	if (!edgeId) return
	event.preventDefault()
	event.stopPropagation()
	emit('select-edge', edgeId)
}

const onParentPointerUpCapture = (event: PointerEvent) => {
	if (event.button !== 0) return
	pointerDownAnchorKey.value = null
}

const flushHoverHit = () => {
	hoverHitRaf = 0
	const point = pendingHoverPoint
	pendingHoverPoint = null
	if (!point) return
	const anchorHit = hitTestAnchor(point.x, point.y)
	if (anchorHit) {
		setHoveredAnchor(anchorHit.key)
		setHoveredEdge(null)
		return
	}
	setHoveredAnchor(null)
	setHoveredEdge(hitTestEdge(point.x, point.y))
}

const scheduleHoverHit = (clientX: number, clientY: number) => {
	const pt = getCanvasPoint(clientX, clientY)
	if (!pt) return
	pendingHoverPoint = pt
	if (hoverHitRaf) return
	hoverHitRaf = requestAnimationFrame(flushHoverHit)
}

const onParentPointerMoveCapture = (event: PointerEvent) => {
	if (!shouldHandlePointerEvent(event.target)) {
		clearHoveredEdge()
		return
	}
	if (shouldReduceHoverHitTest()) {
		clearHoveredEdge()
		return
	}
	if ((event.buttons ?? 0) !== 0 && !pointerDownAnchorKey.value) {
		clearHoveredEdge()
		return
	}
	scheduleHoverHit(event.clientX, event.clientY)
}

const onParentPointerLeaveCapture = () => {
	clearHoveredEdge()
	pointerDownAnchorKey.value = null
}

const scheduleCanvasDraw = () => {
	if (props.motionActive) {
		if (canvasDrawRaf) {
			cancelAnimationFrame(canvasDrawRaf)
			canvasDrawRaf = 0
		}
		drawCanvas()
		return
	}
	if (canvasDrawRaf) return
	canvasDrawRaf = requestAnimationFrame(drawCanvas)
}

watch(
	() => props.edges,
	() => {
		scheduleDisplay()
	},
	{ immediate: true, flush: 'post' }
)

watch(
	() => props.draft,
	() => {
		scheduleDisplay()
	},
	{ immediate: true, flush: 'post' }
)

watch(
	() => props.anchors,
	() => {
		scheduleDisplay()
	},
	{ deep: true, immediate: true, flush: 'post' }
)

watch(
	() => [props.selectedEdgeId, props.motionActive],
	() => {
		scheduleCanvasDraw()
	},
	{ immediate: true }
)

watch(
	() => props.zoom,
	() => {
		rebuildHitEntries()
		scheduleCanvasDraw()
	},
	{ immediate: true }
)

onMounted(() => {
	const canvas = edgeCanvasRef.value
	if (!canvas) return
	parentPointerHost = edgeLayerWrapRef.value?.parentElement as HTMLElement | null
	parentPointerHost?.addEventListener('pointerdown', onParentPointerDownCapture, true)
	parentPointerHost?.addEventListener('pointermove', onParentPointerMoveCapture, true)
	parentPointerHost?.addEventListener('pointerup', onParentPointerUpCapture, true)
	parentPointerHost?.addEventListener('pointerleave', onParentPointerLeaveCapture, true)
	window.addEventListener('blur', onParentPointerLeaveCapture)
	if (typeof ResizeObserver !== 'undefined') {
		canvasResizeObserver = new ResizeObserver(() => scheduleCanvasDraw())
		canvasResizeObserver.observe(canvas)
	}
})

onBeforeUnmount(() => {
	if (presentRaf) cancelAnimationFrame(presentRaf)
	presentRaf = 0
	if (canvasDrawRaf) cancelAnimationFrame(canvasDrawRaf)
	canvasDrawRaf = 0
	if (hoverHitRaf) cancelAnimationFrame(hoverHitRaf)
	hoverHitRaf = 0
	pendingHoverPoint = null
	parentPointerHost?.removeEventListener('pointerdown', onParentPointerDownCapture, true)
	parentPointerHost?.removeEventListener('pointermove', onParentPointerMoveCapture, true)
	parentPointerHost?.removeEventListener('pointerup', onParentPointerUpCapture, true)
	parentPointerHost?.removeEventListener('pointerleave', onParentPointerLeaveCapture, true)
	setParentCursor(null)
	window.removeEventListener('blur', onParentPointerLeaveCapture)
	parentPointerHost = null
	canvasResizeObserver?.disconnect()
	canvasResizeObserver = null
	hitCtx = null
	hitCanvas = null
})
</script>

<style scoped>
.wf-edge-layer-wrap {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
}

.wf-edge-canvas {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
}
</style>
