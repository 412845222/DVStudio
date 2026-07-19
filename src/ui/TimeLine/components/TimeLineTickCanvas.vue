<template>
	<canvas ref="canvasRef" class="tl-tick-canvas" />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
	frameCount: number
	frameWidth: number
	scrollLeft: number
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let ro: ResizeObserver | null = null
let raf = 0

const scheduleDraw = () => {
	if (raf) return
	raf = requestAnimationFrame(() => {
		raf = 0
		draw()
	})
}

const resizeToElement = () => {
	const el = canvasRef.value
	if (!el) return
	const dpr = Math.max(1, window.devicePixelRatio || 1)
	const w = Math.max(1, Math.floor(el.clientWidth * dpr))
	const h = Math.max(1, Math.floor(el.clientHeight * dpr))
	if (el.width !== w) el.width = w
	if (el.height !== h) el.height = h
	scheduleDraw()
}

const draw = () => {
	const el = canvasRef.value
	if (!el) return
	const ctx = el.getContext('2d')
	if (!ctx) return

	const dpr = Math.max(1, window.devicePixelRatio || 1)
	const w = el.width
	const h = el.height
	const cssW = w / dpr
	const cssH = h / dpr

	ctx.save()
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	ctx.clearRect(0, 0, w, h)
	ctx.restore()

	ctx.save()
	ctx.scale(dpr, dpr)

	const frameCount = Math.max(0, Math.floor(props.frameCount))
	if (frameCount <= 0) {
		ctx.restore()
		return
	}

	const fw = Math.max(0.0001, Number(props.frameWidth) || 0)
	const sl = Math.max(0, Number(props.scrollLeft) || 0)

	const start = Math.max(0, Math.floor(sl / fw))
	const end = Math.min(frameCount - 1, Math.ceil((sl + cssW) / fw))

	const css = () => getComputedStyle(document.documentElement)
	const plAccent = (css().getPropertyValue('--pl-accent') || '#1f9d84').trim() || '#1f9d84'
	const plBg0 = (css().getPropertyValue('--pl-bg-0') || '#0d1518').trim() || '#0d1518'

	const hexToRgba = (hex: string, alpha: number) => {
		const h = hex.replace('#', '')
		const r = parseInt(h.substring(0, 2), 16)
		const g = parseInt(h.substring(2, 4), 16)
		const b = parseInt(h.substring(4, 6), 16)
		return `rgba(${r}, ${g}, ${b}, ${alpha})`
	}

	const minor = hexToRgba(plAccent, 0.18)
	const major = hexToRgba(plAccent, 0.4)
	const label = hexToRgba(plAccent, 0.7)

	ctx.textBaseline = 'top'
	ctx.font = '10px "JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace'

	const niceStep = (minFrames: number) => {
		const m = Math.max(1, Math.floor(minFrames))
		let base = 1
		while (base * 10 <= m) base *= 10
		const cands = [base, base * 2, base * 5, base * 10]
		for (const c of cands) {
			if (c >= m) return c
		}
		return base * 10
	}

	// Estimate label width based on the largest frame index visible.
	const maxDigits = String(Math.max(0, end)).length
	const sample = '9'.repeat(Math.max(1, maxDigits))
	const labelW = Math.ceil(ctx.measureText(sample).width)
	const minPxSpacing = labelW + 12
	const minFramesForLabel = Math.ceil(minPxSpacing / fw)
	const labelStep = niceStep(minFramesForLabel)
	const minorStep = Math.max(1, Math.floor(labelStep / 10))

	// draw ticks by step (avoid huge per-frame loops when fw < 1)
	const first = Math.max(0, Math.floor(start / minorStep) * minorStep)
	for (let fi = first; fi <= end; fi += minorStep) {
		const x = fi * fw - sl
		if (x < -2 || x > cssW + 2) continue

		const isMajor = fi % labelStep === 0
		ctx.strokeStyle = isMajor ? major : minor
		ctx.lineWidth = 1
		ctx.beginPath()
		ctx.moveTo(Math.round(x) + 0.5, 0)
		ctx.lineTo(Math.round(x) + 0.5, cssH)
		ctx.stroke()

		if (isMajor) {
			ctx.fillStyle = label
			ctx.fillText(String(fi), Math.round(x) + 2, 2)
		}
	}

	ctx.restore()
}

onMounted(async () => {
	await nextTick()
	resizeToElement()
	if ('ResizeObserver' in window) {
		ro = new ResizeObserver(() => resizeToElement())
		if (canvasRef.value) ro.observe(canvasRef.value)
	}
	scheduleDraw()
})

onBeforeUnmount(() => {
	if (raf) cancelAnimationFrame(raf)
	if (ro) ro.disconnect()
	ro = null
})

watch(
	() => [props.frameCount, props.frameWidth, props.scrollLeft] as const,
	() => scheduleDraw()
)
</script>

<style scoped>
.tl-tick-canvas {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	display: block;
	pointer-events: none;
}
</style>
