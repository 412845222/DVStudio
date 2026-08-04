<template>
	<div class="tl-easing-editor" :style="{ width: width + 'px' }" @pointerdown.stop>
		<div class="tl-easing-editor-head">
			<select class="tl-easing-select" :value="preset" @change="onPresetChange">
				<option value="linear">线性</option>
				<option value="easeIn">缓入</option>
				<option value="easeOut">缓出</option>
				<option value="easeInOut">缓入缓出</option>
				<option value="custom">自定义</option>
			</select>
			<button class="tl-easing-close" type="button" @click="emit('close')">关闭</button>
		</div>
		<canvas ref="canvasRef" class="tl-easing-canvas" @pointerdown.prevent="onCanvasPointerDown" />
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EasingCurveCanvas, type CubicBezier } from './EasingCurveCanvas'

const props = defineProps<{
	width: number
	curve: { x1: number; y1: number; x2: number; y2: number; preset?: string }
}>()

const emit = defineEmits<{
	(e: 'change', curve: { x1: number; y1: number; x2: number; y2: number; preset?: string }): void
	(e: 'close'): void
}>()

const preset = computed(() => props.curve.preset ?? 'custom')

const presetCurves: Record<string, CubicBezier & { preset: string }> = {
	linear: { x1: 0, y1: 0, x2: 1, y2: 1, preset: 'linear' },
	easeIn: { x1: 0.42, y1: 0, x2: 1, y2: 1, preset: 'easeIn' },
	easeOut: { x1: 0, y1: 0, x2: 0.58, y2: 1, preset: 'easeOut' },
	easeInOut: { x1: 0.42, y1: 0, x2: 0.58, y2: 1, preset: 'easeInOut' }
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
let curveCanvas: EasingCurveCanvas | null = null
let ro: ResizeObserver | null = null

const activePoint = ref<'p1' | 'p2' | null>(null)

const redraw = () => {
	if (!curveCanvas) return
	curveCanvas.draw(
		{ x1: props.curve.x1, y1: props.curve.y1, x2: props.curve.x2, y2: props.curve.y2 },
		activePoint.value
	)
}

const resizeToElement = () => {
	const el = canvasRef.value
	if (!el || !curveCanvas) return
	const w = Math.max(1, Math.floor(el.clientWidth))
	const h = Math.max(1, Math.floor(el.clientHeight))
	curveCanvas.resize(w, h)
	redraw()
}

const onPresetChange = (e: Event) => {
	const v = String((e.target as HTMLSelectElement).value)
	if (v === 'custom') {
		emit('change', { ...props.curve, preset: 'custom' })
		return
	}
	const c = presetCurves[v]
	if (!c) return
	emit('change', { x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, preset: c.preset })
}

const onCanvasPointerDown = (ev: PointerEvent) => {
	const el = canvasRef.value
	if (!el || !curveCanvas) return
	activePoint.value = curveCanvas.hitTest(props.curve, ev.clientX, ev.clientY)
	if (!activePoint.value) return
	try {
		el.setPointerCapture(ev.pointerId)
	} catch {
		// ignore
	}

	const onMove = (e: PointerEvent) => {
		if (!activePoint.value || !curveCanvas) return
		const p = curveCanvas.clientToNormalized(e.clientX, e.clientY)
		if (activePoint.value === 'p1') {
			emit('change', { ...props.curve, x1: p.x, y1: p.y, preset: 'custom' })
		} else {
			emit('change', { ...props.curve, x2: p.x, y2: p.y, preset: 'custom' })
		}
	}
	const onUp = (e: PointerEvent) => {
		activePoint.value = null
		try {
			el.releasePointerCapture(e.pointerId)
		} catch {
			// ignore
		}
		window.removeEventListener('pointermove', onMove)
		window.removeEventListener('pointerup', onUp)
		window.removeEventListener('pointercancel', onUp)
		redraw()
	}
	window.addEventListener('pointermove', onMove)
	window.addEventListener('pointerup', onUp)
	window.addEventListener('pointercancel', onUp)
	redraw()
}

onMounted(async () => {
	await nextTick()
	const el = canvasRef.value
	if (!el) return
	const ctx = el.getContext('2d')
	if (!ctx) return
	curveCanvas = new EasingCurveCanvas(ctx)
	resizeToElement()
	if ('ResizeObserver' in window) {
		ro = new ResizeObserver(() => resizeToElement())
		ro.observe(el)
	}
})

onBeforeUnmount(() => {
	if (ro) ro.disconnect()
	ro = null
	curveCanvas = null
})

watch(
	() =>
		[
			props.width,
			props.curve.x1,
			props.curve.y1,
			props.curve.x2,
			props.curve.y2,
			props.curve.preset
		] as const,
	() => {
		resizeToElement()
		redraw()
	}
)
</script>

<style scoped>
.tl-easing-editor {
	height: 110px;
	box-sizing: border-box;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 28%, transparent);
	background: color-mix(in srgb, var(--pl-bg-1) 92%, rgba(0, 0, 0, 0.4));
	border-radius: 2px;
	overflow: hidden;
	box-shadow: 0 0 12px color-mix(in srgb, var(--pl-accent) 12%, transparent);
}

.tl-easing-editor-head {
	height: 28px;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 0 8px;
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 22%, transparent);
	background: color-mix(in srgb, var(--pl-bg-1) 95%, rgba(0, 0, 0, 0.3));
}

.tl-easing-select {
	height: 22px;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 28%, transparent);
	background: color-mix(in srgb, var(--pl-bg-0) 85%, rgba(0, 0, 0, 0.5));
	color: var(--pl-fg);
	border-radius: 2px;
	font-size: 11px;
	padding: 0 6px;
	outline: none;
	transition: border-color 0.15s ease;
}

.tl-easing-select:focus {
	border-color: color-mix(in srgb, var(--pl-accent) 70%, transparent);
}

.tl-easing-close {
	margin-left: auto;
	height: 22px;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
	background: transparent;
	color: var(--pl-fg);
	border-radius: 2px;
	font-size: 11px;
	padding: 0 8px;
	cursor: pointer;
	transition:
		border-color 0.15s ease,
		background 0.15s ease,
		color 0.15s ease;
}

.tl-easing-close:hover {
	border-color: color-mix(in srgb, #ff6b6b 60%, transparent);
	color: #ff8a80;
	background: color-mix(in srgb, #ff6b6b 10%, transparent);
}

.tl-easing-canvas {
	width: 100%;
	height: calc(110px - 28px);
	display: block;
	background: transparent;
}
</style>
