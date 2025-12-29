<template>
	<canvas
		ref="canvasRef"
		class="tl-frame-canvas"
		@pointerdown.stop.prevent="onPointerDown"
		@dblclick.stop.prevent="onDblClick"
		@contextmenu.stop.prevent="onContextMenu"
	/>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
	layerId: string
	frameCount: number
	frameWidth: number
	scrollLeft: number
	currentFrame: number
	selectionVersion: number
	keyframeVersion: number
	easingSegmentKeys: string[]
	isFrameSelected: (layerId: string, frameIndex: number) => boolean
	isKeyframe: (layerId: string, frameIndex: number) => boolean
	isBetween: (layerId: string, frameIndex: number) => boolean
	isEasingEnabled: (layerId: string, frameIndex: number) => boolean
	isEasingArrow: (layerId: string, frameIndex: number) => boolean
}>()

const emit = defineEmits<{
	(e: 'pointerdown', payload: { layerId: string; frameIndex: number; ev: PointerEvent }): void
	(e: 'dblclick', payload: { layerId: string; frameIndex: number; ev: MouseEvent }): void
	(e: 'contextmenu', payload: { layerId: string; frameIndex: number; clientX: number; clientY: number }): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let ro: ResizeObserver | null = null
let raf = 0

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

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
	// All must be valid canvas CSS colors (no var()/color-mix())
	const rowBg = cssVar('--dweb-defualt-dark') || '#181818'
	const cellBg = cssVar('--dweb-defualt-light') || '#23272e'
	const border = cssVar('--vscode-border') || '#3c3c3c'
	const borderAccent = cssVar('--vscode-border-accent') || cssVar('--dweb-accent') || '#3aa8b4'
	const red = parseHexColor(cssVar('--dweb-red') || '#d74f4e') ?? { r: 215, g: 79, b: 78 }
	const orange = parseHexColor(cssVar('--dweb-orange') || '#d77f4f') ?? { r: 215, g: 127, b: 79 }

	return {
		rowBg,
		cellBg,
		border,
		borderAccent,
		betweenBg: rgba(red, 0.14),
		betweenBorder: rgba(red, 0.55),
		keyframeBg: rgba(red, 0.36),
		keyframeBorder: rgba(red, 1),
		activeBg: rgba(orange, 0.22),
		activeBorder: rgba(orange, 1),
		selectedBg: 'rgba(255, 255, 255, 0.06)',
		keyDotFill: 'rgba(255, 255, 255, 0.9)',
		keyDotStroke: 'rgba(0, 0, 0, 0.25)',
		easingLine: 'rgba(255, 255, 255, 0.65)',
	}
}

const getFrameAtClientX = (clientX: number) => {
	const el = canvasRef.value
	if (!el) return 0
	const rect = el.getBoundingClientRect()
	const x = clientX - rect.left
	const worldX = x + props.scrollLeft
	return Math.max(0, Math.min(props.frameCount - 1, Math.floor(worldX / Math.max(1, props.frameWidth))))
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

	const colors = getThemeColors()

	ctx.save()
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	ctx.clearRect(0, 0, w, h)
	ctx.restore()

	ctx.save()
	ctx.scale(dpr, dpr)
	const cssW = w / dpr
	const cssH = h / dpr

	ctx.fillStyle = colors.rowBg
	ctx.fillRect(0, 0, cssW, cssH)

	const fw = Math.max(1, props.frameWidth)
	const start = Math.max(0, Math.floor(props.scrollLeft / fw))
	const end = Math.min(props.frameCount - 1, Math.ceil((props.scrollLeft + cssW) / fw))

	const midY = Math.floor(cssH / 2) + 0.5

	// cells
	for (let fi = start; fi <= end; fi++) {
		const x0 = fi * fw - props.scrollLeft
		const x1 = x0 + fw
		if (x1 < 0 || x0 > cssW) continue

		const between = props.isBetween(props.layerId, fi)
		const joinLeft = between && props.isBetween(props.layerId, fi - 1)
		const joinRight = between && props.isBetween(props.layerId, fi + 1)

		const selected = props.isFrameSelected(props.layerId, fi)
		const active = props.currentFrame === fi
		const keyframe = props.isKeyframe(props.layerId, fi)

		// fill: keep consistent with DOM order
		let fill: string = colors.cellBg
		if (between) fill = colors.betweenBg
		if (keyframe) fill = colors.keyframeBg
		if (active) fill = colors.activeBg
		if (selected) fill = colors.selectedBg
		if (active && selected) fill = colors.activeBg

		ctx.fillStyle = fill
		ctx.fillRect(x0, 0, fw, cssH)

		// border color
		let stroke: string = colors.border
		if (between) stroke = colors.betweenBorder
		if (keyframe) stroke = colors.keyframeBorder
		if (active) stroke = colors.activeBorder
		if (selected) stroke = colors.borderAccent
		if (active && selected) stroke = colors.borderAccent

		// borders (suppress inner borders for merged segments)
		ctx.strokeStyle = stroke
		ctx.lineWidth = 1
		ctx.beginPath()
		// top
		ctx.moveTo(x0, 0.5)
		ctx.lineTo(x1, 0.5)
		// bottom
		ctx.moveTo(x0, cssH - 0.5)
		ctx.lineTo(x1, cssH - 0.5)
		// left
		if (!joinLeft) {
			ctx.moveTo(x0 + 0.5, 0)
			ctx.lineTo(x0 + 0.5, cssH)
		}
		// right
		if (!joinRight) {
			ctx.moveTo(x1 - 0.5, 0)
			ctx.lineTo(x1 - 0.5, cssH)
		}
		ctx.stroke()

		// keyframe dot (matches CSS: 6x6 with border)
		if (keyframe) {
			const r = 3
			const cx = x0 + fw / 2
			const cy = cssH / 2
			ctx.fillStyle = colors.keyDotFill
			ctx.beginPath()
			ctx.arc(cx, cy, r, 0, Math.PI * 2)
			ctx.fill()
			ctx.strokeStyle = colors.keyDotStroke
			ctx.lineWidth = 1
			ctx.stroke()
		}

		// easing line + arrow
		if (between && props.isEasingEnabled(props.layerId, fi)) {
			ctx.strokeStyle = colors.easingLine
			ctx.lineWidth = 1
			ctx.beginPath()
			ctx.moveTo(x0, midY)
			ctx.lineTo(x1, midY)
			ctx.stroke()

			if (props.isEasingArrow(props.layerId, fi)) {
				ctx.fillStyle = colors.easingLine
				const ax = x1 - 6
				ctx.beginPath()
				ctx.moveTo(ax, midY - 4)
				ctx.lineTo(ax + 6, midY)
				ctx.lineTo(ax, midY + 4)
				ctx.closePath()
				ctx.fill()
			}
		}
	}

	ctx.restore()
}

const onPointerDown = (ev: PointerEvent) => {
	if (ev.button !== 0) return
	const frameIndex = getFrameAtClientX(ev.clientX)
	emit('pointerdown', { layerId: props.layerId, frameIndex, ev })
}

const onDblClick = (ev: MouseEvent) => {
	const frameIndex = getFrameAtClientX(ev.clientX)
	emit('dblclick', { layerId: props.layerId, frameIndex, ev })
}

const onContextMenu = (ev: MouseEvent) => {
	const frameIndex = getFrameAtClientX(ev.clientX)
	emit('contextmenu', { layerId: props.layerId, frameIndex, clientX: ev.clientX, clientY: ev.clientY })
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
	() => [props.frameCount, props.frameWidth, props.scrollLeft, props.currentFrame, props.layerId] as const,
	() => scheduleDraw()
)

watch(
	() => [props.selectionVersion, props.keyframeVersion, props.easingSegmentKeys] as const,
	() => scheduleDraw(),
	{ deep: false }
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
