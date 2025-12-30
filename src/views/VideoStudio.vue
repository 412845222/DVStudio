<template>
	<div ref="rootEl" class="videostudio-page bg-vscode">
		<div class="videostudio-stage" :style="{ height: `${stageHeightPx}px` }">
			<VideoScene />
		</div>
		<div
			class="videostudio-splitter"
			:class="{ dragging: isDragging }"
			role="separator"
			aria-orientation="horizontal"
			aria-label="调整舞台与时间轴高度"
			@pointerdown.stop.prevent="onSplitterPointerDown"
		/>
		<div class="videostudio-timeline" :style="{ height: `${timelineHeight}px` }">
			<TimeLine />
		</div>
	</div>
</template>

<script setup lang="ts">
import VideoScene from '../ui/VideoScene/VideoScene.vue'
import TimeLine from '../ui/TimeLine/TimeLine.vue'

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const rootEl = ref<HTMLElement | null>(null)

const SPLITTER_HEIGHT = 6
const MIN_STAGE = 200
const MIN_TIMELINE = 220

const timelineHeight = ref(320)
const isDragging = ref(false)

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

const stageHeightPx = computed(() => {
	const el = rootEl.value
	if (!el) return 0
	const total = el.clientHeight
	return Math.max(0, total - timelineHeight.value - SPLITTER_HEIGHT)
})

let cleanupMoveUp: (() => void) | null = null
const onSplitterPointerDown = (e: PointerEvent) => {
	const el = rootEl.value
	if (!el) return

	isDragging.value = true
	const startY = e.clientY
	const startTimeline = timelineHeight.value

	const onMove = (ev: PointerEvent) => {
		const total = el.clientHeight
		const delta = ev.clientY - startY
		const next = startTimeline - delta
		const maxTimeline = Math.max(MIN_TIMELINE, total - MIN_STAGE - SPLITTER_HEIGHT)
		timelineHeight.value = clamp(next, MIN_TIMELINE, maxTimeline)
	}

	const onUp = () => {
		isDragging.value = false
		if (cleanupMoveUp) {
			cleanupMoveUp()
			cleanupMoveUp = null
		}
	}

	window.addEventListener('pointermove', onMove, { passive: true })
	window.addEventListener('pointerup', onUp, { passive: true, once: true })
	cleanupMoveUp = () => {
		window.removeEventListener('pointermove', onMove)
		window.removeEventListener('pointerup', onUp)
	}
}

let ro: ResizeObserver | null = null
const clampToViewport = () => {
	const el = rootEl.value
	if (!el) return
	const total = el.clientHeight
	const maxTimeline = Math.max(MIN_TIMELINE, total - MIN_STAGE - SPLITTER_HEIGHT)
	timelineHeight.value = clamp(timelineHeight.value, MIN_TIMELINE, maxTimeline)
}

onMounted(() => {
	clampToViewport()
	if ('ResizeObserver' in window) {
		ro = new ResizeObserver(() => clampToViewport())
		if (rootEl.value) ro.observe(rootEl.value)
	}
})

onBeforeUnmount(() => {
	if (cleanupMoveUp) cleanupMoveUp()
	ro?.disconnect()
	ro = null
})
</script>

<style scoped>
.videostudio-page {
	height: 100vh;
	display: flex;
	flex-direction: column;
	min-height: 0;
}

.videostudio-stage {
	flex: 0 0 auto;
	min-height: 0;
	overflow: hidden;
}

.videostudio-splitter {
	flex: 0 0 auto;
	height: 6px;
	cursor: row-resize;
	background: var(--dweb-defualt);
	border-top: 1px solid var(--vscode-border);
	border-bottom: 1px solid var(--vscode-border);
	position: relative;
	user-select: none;
}

.videostudio-splitter::after {
	content: '';
	position: absolute;
	left: 50%;
	top: 50%;
	width: 28px;
	height: 2px;
	transform: translate(-50%, -50%);
	background: var(--vscode-fg-muted);
	opacity: 0.6;
	border-radius: 2px;
}

.videostudio-splitter:hover::after,
.videostudio-splitter.dragging::after {
	opacity: 1;
}

.videostudio-timeline {
	flex: 0 0 auto;
	min-height: 0;
}
</style>