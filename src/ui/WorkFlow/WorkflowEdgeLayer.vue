<template>
	<div ref="edgeLayerWrapRef" class="wf-edge-layer-wrap" aria-hidden="true">
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

const props = defineProps<{
	edges: EdgeRender[]
	selectedEdgeId: string | null
	draft?: { path: string; stroke?: string; strokeWidth?: number } | null
	motionActive?: boolean
	zoom?: number
}>()

const emit = defineEmits<{
	(e: 'select-edge', id: string): void
}>()

const displayedEdges = shallowRef<EdgeRender[]>([])
const displayedDraft = shallowRef<{
	path: string
	stroke?: string
	strokeWidth?: number
} | null>(null)
type EdgeHitEntry = {
	id: string
	path: Path2D
	strokeWidth: number
}

const edgeCanvasRef = ref<HTMLCanvasElement | null>(null)
const edgeLayerWrapRef = ref<HTMLDivElement | null>(null)
const hitEntries = shallowRef<EdgeHitEntry[]>([])
const hoveredEdgeId = ref<string | null>(null)
let presentRaf = 0
let canvasDrawRaf = 0
let hoverHitRaf = 0
let canvasResizeObserver: ResizeObserver | null = null
let parentPointerHost: HTMLElement | null = null
let hitCanvas: HTMLCanvasElement | null = null
let hitCtx: CanvasRenderingContext2D | null = null
let pendingHoverPoint: { x: number; y: number } | null = null

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
	setParentCursor(next ? 'pointer' : null)
	scheduleCanvasDraw()
}

const clearHoveredEdge = () => {
	if (hoverHitRaf) {
		cancelAnimationFrame(hoverHitRaf)
		hoverHitRaf = 0
	}
	pendingHoverPoint = null
	setHoveredEdge(null)
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
	rebuildHitEntries()
	if (
		hoveredEdgeId.value &&
		!displayedEdges.value.some((edge) => edge.id === hoveredEdgeId.value)
	) {
		setHoveredEdge(null)
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
	const lowDetail = Boolean(props.motionActive) || resolveZoomScale() <= 0.32
	const heavyEdgeCount = displayedEdges.value.length >= 520
	const suppressEffects = lowDetail || heavyEdgeCount

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

	for (const edge of displayedEdges.value) {
		const path = new Path2D(edge.path)
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
}

const hitTestEdge = (clientX: number, clientY: number) => {
	const wrap = edgeLayerWrapRef.value
	const ctx = hitCtx
	if (!wrap || !ctx) return null as string | null
	const rect = wrap.getBoundingClientRect()
	if (!rect.width || !rect.height) return null
	const x = clientX - rect.left
	const y = clientY - rect.top
	if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	ctx.lineCap = 'round'
	ctx.lineJoin = 'round'
	for (let index = hitEntries.value.length - 1; index >= 0; index -= 1) {
		const entry = hitEntries.value[index]
		ctx.lineWidth = entry.strokeWidth
		if (ctx.isPointInStroke(entry.path, x, y)) return entry.id
	}
	return null
}

const shouldHandlePointerEvent = (target: EventTarget | null) => {
	const targetEl = target instanceof HTMLElement ? target : null
	if (!targetEl) return false
	return (
		targetEl.classList.contains('bp-wrap') ||
		targetEl.classList.contains('bp-grid-canvas') ||
		targetEl.classList.contains('wf-edge-layer-wrap') ||
		targetEl.classList.contains('wf-edge-canvas')
	)
}

const onParentPointerDownCapture = (event: PointerEvent) => {
	if (event.button !== 0) return
	if (!shouldHandlePointerEvent(event.target)) return
	const edgeId = hitTestEdge(event.clientX, event.clientY)
	if (!edgeId) return
	event.preventDefault()
	event.stopPropagation()
	emit('select-edge', edgeId)
}

const flushHoverHit = () => {
	hoverHitRaf = 0
	const point = pendingHoverPoint
	pendingHoverPoint = null
	if (!point) return
	setHoveredEdge(hitTestEdge(point.x, point.y))
}

const scheduleHoverHit = (clientX: number, clientY: number) => {
	pendingHoverPoint = { x: clientX, y: clientY }
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
	if ((event.buttons ?? 0) !== 0) {
		clearHoveredEdge()
		return
	}
	scheduleHoverHit(event.clientX, event.clientY)
}

const onParentPointerLeaveCapture = () => {
	clearHoveredEdge()
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
