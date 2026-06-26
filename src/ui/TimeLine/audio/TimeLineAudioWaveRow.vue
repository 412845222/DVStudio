<template>
	<canvas ref="canvasRef" class="tl-frame-canvas" />
</template>

<script setup lang="ts">
import type { AudioTrack } from '../../../core/timeline'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
	layerId: string
	frameCount: number
	frameWidth: number
	scrollLeft: number
	fps: number
	audioTrack: AudioTrack | null
	audioVersion?: number
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let ro: ResizeObserver | null = null
let raf = 0

const cssVar = (name: string) =>
	getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const parseHexColor = (s: string): { r: number; g: number; b: number } | null => {
	const t = s.trim()
	if (!t.startsWith('#')) return null
	const hex = t.slice(1)
	if (hex.length === 3) {
		const r = parseInt(hex[0] + hex[0], 16)
		const g = parseInt(hex[1] + hex[1], 16)
		const b = parseInt(hex[2] + hex[2], 16)
		if ([r, g, b].some((n) => Number.isNaN(n))) return null
		return { r, g, b }
	}
	if (hex.length === 6) {
		const r = parseInt(hex.slice(0, 2), 16)
		const g = parseInt(hex.slice(2, 4), 16)
		const b = parseInt(hex.slice(4, 6), 16)
		if ([r, g, b].some((n) => Number.isNaN(n))) return null
		return { r, g, b }
	}
	return null
}

const rgba = (c: { r: number; g: number; b: number }, a: number) => {
	const aa = Math.max(0, Math.min(1, a))
	return `rgba(${c.r}, ${c.g}, ${c.b}, ${aa})`
}

const getThemeColors = () => {
	const rowBg = cssVar('--dweb-defualt-dark') || '#181818'
	const fgMuted = cssVar('--vscode-fg-muted') || 'rgba(212,212,212,0.72)'
	// 需求：用明确颜色进行音频可视化
	const accent = parseHexColor('#3aa8b4') ?? { r: 58, g: 168, b: 180 }
	return {
		rowBg,
		wave: rgba(accent, 0.95),
		mid: rgba(accent, 0.35),
		empty: fgMuted
	}
}

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

	const colors = getThemeColors()

	ctx.save()
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	ctx.clearRect(0, 0, w, h)
	ctx.restore()

	ctx.save()
	ctx.scale(dpr, dpr)
	ctx.fillStyle = colors.rowBg
	ctx.fillRect(0, 0, cssW, cssH)

	const track = props.audioTrack
	const fw = Math.max(0.0001, Number(props.frameWidth) || 0)
	const fps = Math.max(1, Math.floor(Number(props.fps) || 60))
	if (!track || !Array.isArray(track.peaks) || track.peaks.length === 0) {
		ctx.fillStyle = colors.empty
		ctx.font = '12px sans-serif'
		ctx.textBaseline = 'middle'
		ctx.fillText('未导入音频', 10, cssH / 2)
		ctx.restore()
		return
	}

	const pps = Math.max(1, Math.floor(Number(track.pointsPerSecond) || fps))
	const durationSec = Math.max(0, Number(track.durationSec) || 0)
	if (!(durationSec > 0)) {
		ctx.restore()
		return
	}

	// Visible frames window based on scrollLeft/frameWidth.
	const startFrame = Math.max(0, Math.floor(props.scrollLeft / fw))
	const endFrame = Math.min(
		Math.max(startFrame, Math.ceil((props.scrollLeft + cssW) / fw) + 1),
		Math.max(0, Math.floor(props.frameCount) - 1)
	)

	const midY = cssH / 2
	const ampMax = Math.max(1, midY - 2)

	ctx.strokeStyle = colors.mid
	ctx.lineWidth = 1
	ctx.beginPath()
	ctx.moveTo(0, midY + 0.5)
	ctx.lineTo(cssW, midY + 0.5)
	ctx.stroke()

	ctx.fillStyle = colors.wave

	// 每帧一个可视化柱，跟随 frameWidth 缩放。
	// track.peaks 通常已按 fps 预采样（pointsPerSecond=fps），索引≈frameIndex。
	const barW = Math.max(0.5, Math.min(fw, 3))
	for (let fi = startFrame; fi <= endFrame; fi++) {
		const t = fi / fps
		if (t > durationSec) break
		const idx = pps === fps ? fi : Math.floor((fi / fps) * pps)
		if (idx < 0 || idx >= track.peaks.length) continue
		const a = Math.max(0, Math.min(1, Number(track.peaks[idx] || 0)))
		if (!(a > 0.001)) continue
		const x = fi * fw - props.scrollLeft
		if (x < -fw - 2 || x > cssW + 2) continue
		const hh = Math.max(1, a * ampMax)
		ctx.fillRect(x + (fw - barW) / 2, midY - hh, barW, hh * 2)
	}

	ctx.restore()
}

onMounted(() => {
	resizeToElement()
	ro = new ResizeObserver(() => resizeToElement())
	if (canvasRef.value) ro.observe(canvasRef.value)
})

onBeforeUnmount(() => {
	if (raf) cancelAnimationFrame(raf)
	if (ro) ro.disconnect()
	ro = null
})

watch(
	() =>
		[
			props.scrollLeft,
			props.frameWidth,
			props.fps,
			props.frameCount,
			props.audioVersion,
			props.audioTrack?.objectUrl
		] as const,
	() => scheduleDraw(),
	{ immediate: true }
)
</script>

<style scoped>
.tl-frame-canvas {
	width: 100%;
	height: 34px;
	display: block;
	background: transparent;
}
</style>
