<template>
	<div class="vc-bar" @pointerdown.stop>
		<button
			class="vc-btn"
			type="button"
			:disabled="disabled"
			:title="playing ? '暂停' : '播放'"
			@click.stop="emit('toggle-play')"
		>
			{{ playing ? '暂停' : '播放' }}
		</button>

		<button
			class="vc-btn vc-btn-loop"
			type="button"
			:disabled="disabled"
			:class="{ active: loopEnabled }"
			:title="loopEnabled ? '循环播放：开' : '循环播放：关'"
			@click.stop="emit('toggle-loop')"
		>
			循环
		</button>

		<canvas
			ref="timelineCanvas"
			class="vc-timeline"
			:class="{ disabled }"
			@pointerdown.stop="onPointerDown"
			:title="timelineTitle"
		/>

		<input
			class="vc-volume"
			type="range"
			min="0"
			max="100"
			step="1"
			:value="volumeDisplay"
			:disabled="disabled"
			@pointerdown.stop
			@input="onVolumeInput"
			title="音量"
		/>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
	disabled?: boolean
	playing?: boolean
	duration?: number
	currentTime?: number
	volume?: number
	loop?: boolean
}>()

const emit = defineEmits<{
	(e: 'toggle-play'): void
	(e: 'toggle-loop'): void
	(e: 'seek', time: number): void
	(e: 'update-volume', volume: number): void
}>()

const timelineCanvas = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let ro: ResizeObserver | null = null
let pointerActive = false

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

const disabled = computed(() => Boolean(props.disabled))
const loopEnabled = computed(() => Boolean(props.loop))
const duration = computed(() => Math.max(0, Number(props.duration) || 0))
const currentTime = computed(() => clamp(Number(props.currentTime) || 0, 0, duration.value || 0))
const timelineTitle = computed(() => {
	if (!duration.value) return '整体时间轴'
	return `整体时间轴：${currentTime.value.toFixed(2)}s / ${duration.value.toFixed(2)}s`
})

const volumeDisplay = computed(() => {
	const v = Number(props.volume)
	const vv = Number.isFinite(v) ? clamp(v, 0, 1) : 1
	return String(Math.round(vv * 100))
})

const draw = () => {
	const el = timelineCanvas.value
	if (!el || !ctx) return
	const w = Math.max(1, Math.floor(el.clientWidth || 1))
	const h = Math.max(1, Math.floor(el.clientHeight || 1))
	ctx.clearRect(0, 0, w, h)

	const border =
		getComputedStyle(document.documentElement).getPropertyValue('--vscode-border').trim() ||
		'#2b2b2b'
	const bg =
		getComputedStyle(document.documentElement).getPropertyValue('--dweb-defualt').trim() ||
		'#111111'
	const muted =
		getComputedStyle(document.documentElement).getPropertyValue('--vscode-fg-muted').trim() ||
		'rgba(255,255,255,0.6)'
	const accent =
		getComputedStyle(document.documentElement).getPropertyValue('--vscode-border-accent').trim() ||
		'#3aa8b4'

	ctx.fillStyle = bg
	ctx.fillRect(0.5, 0.5, w - 1, h - 1)
	ctx.strokeStyle = border
	ctx.lineWidth = 1
	ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

	if (!duration.value || disabled.value) {
		ctx.fillStyle = muted
		ctx.font = '11px sans-serif'
		ctx.fillText('整体', 8, Math.floor(h / 2) + 4)
		return
	}

	const progress = clamp(currentTime.value / Math.max(1e-6, duration.value), 0, 1)
	const x = progress * w

	ctx.fillStyle = accent
	ctx.globalAlpha = 0.18
	ctx.fillRect(1, 1, Math.max(1, x - 1), h - 2)
	ctx.globalAlpha = 1

	ctx.strokeStyle = accent
	ctx.lineWidth = 2
	ctx.beginPath()
	ctx.moveTo(Math.round(x) + 0.5, 0)
	ctx.lineTo(Math.round(x) + 0.5, h)
	ctx.stroke()
}

const resizeCanvas = () => {
	const el = timelineCanvas.value
	if (!el) return
	const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1
	const w = Math.max(1, Math.floor(el.clientWidth || 1))
	const h = Math.max(1, Math.floor(el.clientHeight || 1))
	el.width = Math.max(1, Math.floor(w * dpr))
	el.height = Math.max(1, Math.floor(h * dpr))
	const next = el.getContext('2d')
	if (!next) return
	next.setTransform(dpr, 0, 0, dpr, 0, 0)
	ctx = next
	draw()
}

const seekByClientX = (clientX: number) => {
	const el = timelineCanvas.value
	if (!el || disabled.value || !duration.value) return
	const rect = el.getBoundingClientRect()
	const x = clamp(clientX - rect.left, 0, rect.width)
	const t = clamp((x / Math.max(1, rect.width)) * duration.value, 0, duration.value)
	emit('seek', t)
}

const onPointerDown = (e: PointerEvent) => {
	if (disabled.value || !duration.value) return
	const el = timelineCanvas.value
	if (!el) return
	pointerActive = true
	el.setPointerCapture(e.pointerId)
	seekByClientX(e.clientX)
	const onMove = (ev: PointerEvent) => {
		if (!pointerActive) return
		seekByClientX(ev.clientX)
	}
	const onUp = () => {
		pointerActive = false
		window.removeEventListener('pointermove', onMove)
		window.removeEventListener('pointerup', onUp)
		window.removeEventListener('pointercancel', onUp)
	}
	window.addEventListener('pointermove', onMove)
	window.addEventListener('pointerup', onUp)
	window.addEventListener('pointercancel', onUp)
}

const onVolumeInput = (e: Event) => {
	const input = e.target as HTMLInputElement
	const vv = clamp((Number(input.value) || 0) / 100, 0, 1)
	emit('update-volume', vv)
}

watch(
	() => [disabled.value, duration.value, currentTime.value],
	() => draw()
)

onMounted(() => {
	resizeCanvas()
	if (timelineCanvas.value) {
		ro = new ResizeObserver(() => resizeCanvas())
		ro.observe(timelineCanvas.value)
	}
})

onBeforeUnmount(() => {
	try {
		ro?.disconnect()
	} catch {}
	ro = null
	ctx = null
})
</script>

<style scoped>
.vc-bar {
	display: flex;
	gap: 8px;
	align-items: center;
}

.vc-btn {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	padding: 6px 8px;
	cursor: pointer;
	font-size: 12px;
}

.vc-btn:hover {
	border-color: var(--vscode-hover-border);
	background: var(--vscode-hover-bg);
}

.vc-btn-loop.active {
	border-color: var(--vscode-border-accent);
}

.vc-btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.vc-timeline {
	flex: 1;
	min-width: 180px;
	height: 26px;
	border-radius: 4px;
	overflow: hidden;
	cursor: pointer;
}

.vc-timeline.disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.vc-volume {
	width: 96px;
}
</style>
