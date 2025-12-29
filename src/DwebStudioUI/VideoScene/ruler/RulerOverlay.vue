<template>
	<div class="ruler-overlay" :style="{ '--ruler-size': rulerSize + 'px' }">
		<div class="corner" />
		<canvas ref="topCanvasRef" class="ruler top" />
		<canvas ref="leftCanvasRef" class="ruler left" />
	</div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { floorToStep, pickRulerStep } from './rulerMath'

const props = defineProps<{
	width: number
	height: number
	panX: number
	panY: number
	zoom: number
	originX?: number
	originY?: number
	rulerSize?: number
}>()

const rulerSize = props.rulerSize ?? 24

const topCanvasRef = ref<HTMLCanvasElement | null>(null)
const leftCanvasRef = ref<HTMLCanvasElement | null>(null)

let raf: number | null = null

const requestDraw = () => {
	if (raf != null) return
	raf = requestAnimationFrame(() => {
		raf = null
		draw()
	})
}

const draw = () => {
	const top = topCanvasRef.value
	const left = leftCanvasRef.value
	if (!top || !left) return

	const dpr = window.devicePixelRatio || 1

	const topW = Math.max(1, props.width - rulerSize)
	const topH = rulerSize
	const leftW = rulerSize
	const leftH = Math.max(1, props.height - rulerSize)

	// top
	{
		top.width = Math.floor(topW * dpr)
		top.height = Math.floor(topH * dpr)
		top.style.width = `${topW}px`
		top.style.height = `${topH}px`
		const ctx = top.getContext('2d')
		if (ctx) {
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
			ctx.clearRect(0, 0, topW, topH)
			drawTopRuler(ctx, topW, topH)
		}
	}

	// left
	{
		left.width = Math.floor(leftW * dpr)
		left.height = Math.floor(leftH * dpr)
		left.style.width = `${leftW}px`
		left.style.height = `${leftH}px`
		const ctx = left.getContext('2d')
		if (ctx) {
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
			ctx.clearRect(0, 0, leftW, leftH)
			drawLeftRuler(ctx, leftW, leftH)
		}
	}
}

const css = () => getComputedStyle(document.documentElement)

const drawTopRuler = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
	const fg = (css().getPropertyValue('--vscode-fg') || '#d4d4d4').trim()
	const muted = (css().getPropertyValue('--vscode-fg-muted') || '#a0a0a0').trim()
	const border = (css().getPropertyValue('--vscode-border') || '#3c3c3c').trim()
	const bg = (css().getPropertyValue('--dweb-defualt-dark') || '#181818').trim()

	ctx.fillStyle = bg
	ctx.fillRect(0, 0, w, h)
	ctx.strokeStyle = border
	ctx.beginPath()
	ctx.moveTo(0, h - 0.5)
	ctx.lineTo(w, h - 0.5)
	ctx.stroke()

	const zoom = props.zoom
	const panX = props.panX
	const worldMin = (0 - panX) / zoom
	const worldMax = (w - panX) / zoom
	const originX = props.originX ?? 0

	const major = pickRulerStep(zoom)
	const minor = major / 10

	ctx.font = '10px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
	ctx.textBaseline = 'top'
	ctx.textAlign = 'left'

	const localMin = worldMin - originX
	const localMax = worldMax - originX
	const startMajor = floorToStep(localMin, major)
	for (let lx = startMajor; lx <= localMax; lx += major) {
		const wx = originX + lx
		const sx = wx * zoom + panX
		if (sx < 0 || sx > w) continue
		ctx.strokeStyle = border
		ctx.globalAlpha = 0.8
		ctx.beginPath()
		ctx.moveTo(sx + 0.5, h)
		ctx.lineTo(sx + 0.5, h - 12)
		ctx.stroke()

		ctx.globalAlpha = 1
		ctx.fillStyle = fg
		ctx.fillText(String(Math.round(lx)), sx + 2, 2)
	}

	ctx.strokeStyle = muted
	ctx.globalAlpha = 0.4
	const startMinor = floorToStep(localMin, minor)
	for (let lx = startMinor; lx <= localMax; lx += minor) {
		const wx = originX + lx
		const sx = wx * zoom + panX
		if (sx < 0 || sx > w) continue
		ctx.beginPath()
		ctx.moveTo(sx + 0.5, h)
		ctx.lineTo(sx + 0.5, h - 6)
		ctx.stroke()
	}
	ctx.globalAlpha = 1
}

const drawLeftRuler = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
	const fg = (css().getPropertyValue('--vscode-fg') || '#d4d4d4').trim()
	const muted = (css().getPropertyValue('--vscode-fg-muted') || '#a0a0a0').trim()
	const border = (css().getPropertyValue('--vscode-border') || '#3c3c3c').trim()
	const bg = (css().getPropertyValue('--dweb-defualt-dark') || '#181818').trim()

	ctx.fillStyle = bg
	ctx.fillRect(0, 0, w, h)
	ctx.strokeStyle = border
	ctx.beginPath()
	ctx.moveTo(w - 0.5, 0)
	ctx.lineTo(w - 0.5, h)
	ctx.stroke()

	const zoom = props.zoom
	const panY = props.panY
	const worldMin = (0 - panY) / zoom
	const worldMax = (h - panY) / zoom
	const originY = props.originY ?? 0

	const major = pickRulerStep(zoom)
	const minor = major / 10

	ctx.font = '10px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
	ctx.textBaseline = 'middle'
	ctx.textAlign = 'left'

	const localMin = worldMin - originY
	const localMax = worldMax - originY
	const startMajor = floorToStep(localMin, major)
	for (let ly = startMajor; ly <= localMax; ly += major) {
		const wy = originY + ly
		const sy = wy * zoom + panY
		if (sy < 0 || sy > h) continue
		ctx.strokeStyle = border
		ctx.globalAlpha = 0.8
		ctx.beginPath()
		ctx.moveTo(w, sy + 0.5)
		ctx.lineTo(w - 12, sy + 0.5)
		ctx.stroke()

		ctx.globalAlpha = 1
		ctx.fillStyle = fg
		ctx.fillText(String(Math.round(ly)), 2, sy)
	}

	ctx.strokeStyle = muted
	ctx.globalAlpha = 0.4
	const startMinor = floorToStep(localMin, minor)
	for (let ly = startMinor; ly <= localMax; ly += minor) {
		const wy = originY + ly
		const sy = wy * zoom + panY
		if (sy < 0 || sy > h) continue
		ctx.beginPath()
		ctx.moveTo(w, sy + 0.5)
		ctx.lineTo(w - 6, sy + 0.5)
		ctx.stroke()
	}
	ctx.globalAlpha = 1
}

onMounted(() => requestDraw())

watch(
	() => [props.width, props.height, props.panX, props.panY, props.zoom] as const,
	() => requestDraw()
)

onBeforeUnmount(() => {
	if (raf != null) cancelAnimationFrame(raf)
	raf = null
})
</script>

<style scoped>
.ruler-overlay {
	position: absolute;
	inset: 0;
	pointer-events: none;
	--ruler-size: 24px;
}

.corner {
	position: absolute;
	left: 0;
	top: 0;
	width: var(--ruler-size);
	height: var(--ruler-size);
	background: var(--dweb-defualt-dark);
	border-right: 1px solid var(--vscode-border);
	border-bottom: 1px solid var(--vscode-border);
	box-sizing: border-box;
}

.ruler {
	position: absolute;
	background: transparent;
}

.ruler.top {
	left: var(--ruler-size);
	top: 0;
	height: var(--ruler-size);
	width: calc(100% - var(--ruler-size));
}

.ruler.left {
	left: 0;
	top: var(--ruler-size);
	width: var(--ruler-size);
	height: calc(100% - var(--ruler-size));
}
</style>
