<template>
	<div ref="rootEl" class="videostudio-page bg-vscode">
		<div
			class="videostudio-stage"
			@pointerdown.capture="onStagePointerDown"
		>
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
		<div
			class="videostudio-timeline"
			:style="{ height: `${timelineHeight}px` }"
			@pointerdown.capture="onTimelinePointerDown"
		>
			<TimeLine />
		</div>
	</div>
</template>

<script setup lang="ts">
import VideoScene from '../ui/VideoScene/VideoScene.vue'
import TimeLine from '../ui/TimeLine/TimeLine.vue'

import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { TimelineStore } from '../store/timeline'
import { VideoSceneStore } from '../store/videoscene'

const props = defineProps<{
	initialVideoUrl?: string
	initialVideoName?: string
	initialNodeId?: string
}>()

const rootEl = ref<HTMLElement | null>(null)
const videoLoaded = ref(false)
let isUnmounted = false

const SPLITTER_HEIGHT = 6
const MIN_STAGE = 200
const MIN_TIMELINE = 220
const DEFAULT_TIMELINE_RATIO = 0.42

const calcInitialTimelineHeight = () => {
	const el = rootEl.value
	if (!el) return 320
	const total = el.clientHeight
	const target = Math.floor(total * DEFAULT_TIMELINE_RATIO)
	const maxTimeline = Math.max(MIN_TIMELINE, total - MIN_STAGE - SPLITTER_HEIGHT)
	return clamp(target, MIN_TIMELINE, maxTimeline)
}

const timelineHeight = ref(320)
const isDragging = ref(false)

const onStagePointerDown = () => {
	TimelineStore.dispatch('setUiFocus', { focus: 'stage' })
}

const onTimelinePointerDown = () => {
	TimelineStore.dispatch('setUiFocus', { focus: 'timeline' })
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

function waitForSceneReady(maxWaitMs = 8000): Promise<boolean> {
	return new Promise(resolve => {
		if (isUnmounted) {
			resolve(false)
			return
		}
		const start = Date.now()
		const check = () => {
			if (isUnmounted) {
				resolve(false)
				return
			}
			const state = VideoSceneStore.state
			if (state?.layers?.length > 0 && (state.activeLayerId || state.layers[0]?.id)) {
				console.log('[VideoStudio] scene ready, layers:', state.layers.length, 'activeLayer:', state.activeLayerId || state.layers[0]?.id)
				resolve(true)
				return
			}
			if (Date.now() - start > maxWaitMs) {
				console.warn('[VideoStudio] waitForSceneReady timed out after', maxWaitMs, 'ms')
				resolve(false)
				return
			}
			setTimeout(check, 200)
		}
		check()
	})
}

function loadVideoMetadata(url: string): Promise<{ width: number; height: number; duration: number }> {
	return new Promise(resolve => {
		console.log('[VideoStudio] loadVideoMetadata, url:', url)
		const video = document.createElement('video')
		video.preload = 'metadata'
		video.muted = true
		video.playsInline = true

		const isHttp = url.startsWith('http://') || url.startsWith('https://')
		if (isHttp) {
			video.crossOrigin = 'anonymous'
		}

		let done = false
		const finish = (w = 1920, h = 1080, d = 0) => {
			if (done) return
			done = true
			console.log('[VideoStudio] loadVideoMetadata finish:', { w, h, d })
			video.pause()
			video.src = ''
			video.removeAttribute('src')
			video.load()
			resolve({ width: w, height: h, duration: d })
		}

		const timeoutId = setTimeout(() => {
			console.warn('[VideoStudio] loadVideoMetadata timeout for url:', url)
			finish()
		}, 5000)

		video.addEventListener('loadedmetadata', () => {
			clearTimeout(timeoutId)
			console.log('[VideoStudio] loadedmetadata:', video.videoWidth, video.videoHeight, video.duration)
			finish(video.videoWidth || 1920, video.videoHeight || 1080, Number.isFinite(video.duration) ? video.duration : 0)
		}, { once: true })

		video.addEventListener('error', (e) => {
			clearTimeout(timeoutId)
			console.error('[VideoStudio] video error event:', video.error, e)
			finish()
		}, { once: true })

		video.src = url
	})
}

function addVideoNode(width: number, height: number, duration: number) {
	if (videoLoaded.value || isUnmounted) return
	const videoUrl = props.initialVideoUrl
	if (!videoUrl) {
		console.warn('[VideoStudio] addVideoNode: no videoUrl')
		return
	}

	const state = VideoSceneStore.state
	const activeLayerId = state?.activeLayerId || state?.layers?.[0]?.id
	if (!activeLayerId) {
		console.warn('[VideoStudio] addVideoNode: no activeLayerId')
		return
	}

	console.log('[VideoStudio] addVideoNode:', { width, height, duration, videoUrl, nodeId: props.initialNodeId })

	const videoId = props.initialNodeId || `video-${Date.now()}`
	const videoName = props.initialVideoName || 'Video'

	const fps = TimelineStore.state.fps || 30
	const frameCount = duration > 0
		? Math.max(1, Math.ceil(duration * fps))
		: Math.max(1, Math.ceil(30 * fps))
	TimelineStore.dispatch('setFrameCount', { frameCount })

	VideoSceneStore.dispatch('upsertVideoAsset', {
		id: videoId,
		url: videoUrl,
		name: videoName,
		videoWidth: width,
		videoHeight: height,
		duration
	})

	VideoSceneStore.dispatch('addRenderableNode', {
		type: 'video',
		layerId: activeLayerId
	})

	const newState = VideoSceneStore.state
	const newNodeId = newState.selectedNodeId
	console.log('[VideoStudio] newNodeId from selectedNodeId:', newNodeId)

	if (newNodeId) {
		const stageW = 1920
		const stageH = 1080
		const scale = Math.min(stageW / width, stageH / height)
		const nodeW = width * scale
		const nodeH = height * scale

		console.log('[VideoStudio] updating props/transform/name for node:', newNodeId, 'videoId:', videoId, 'videoPath:', videoUrl)

		VideoSceneStore.dispatch('updateNodeProps', {
			nodeId: newNodeId,
			layerId: activeLayerId,
			patch: {
				videoId,
				videoPath: videoUrl,
				videoFit: 'contain'
			}
		})

		VideoSceneStore.dispatch('updateNodeTransform', {
			nodeId: newNodeId,
			layerId: activeLayerId,
			patch: {
				x: 0,
				y: 0,
				width: nodeW,
				height: nodeH,
				pivotX: 0.5,
				pivotY: 0.5,
				scaleX: 1,
				scaleY: 1,
				opacity: 1,
				rotation: 0
			}
		})

		VideoSceneStore.dispatch('updateNodeName', {
			nodeId: newNodeId,
			layerId: activeLayerId,
			name: videoName
		})
	} else {
		console.error('[VideoStudio] could not get newNodeId after addRenderableNode')
	}

	videoLoaded.value = true
}

async function initVideo() {
	if (!props.initialVideoUrl || videoLoaded.value || isUnmounted) return

	const ready = await waitForSceneReady()
	if (!ready || isUnmounted) return

	const meta = await loadVideoMetadata(props.initialVideoUrl)
	if (isUnmounted) return
	addVideoNode(meta.width, meta.height, meta.duration)
}

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

onMounted(async () => {
	// 首次挂载时按窗口高度比例设置初始时间轴高度（避免首次打开底部空白或太挤）
	await nextTick()
	timelineHeight.value = calcInitialTimelineHeight()
	clampToViewport()
	window.addEventListener('dweb:content/resize', clampToViewport, true)
	window.addEventListener('resize', clampToViewport)
	if ('ResizeObserver' in window) {
		ro = new ResizeObserver(() => clampToViewport())
		if (rootEl.value) ro.observe(rootEl.value)
	}
	TimelineStore.dispatch('setUiFocus', { focus: 'timeline' })
	await new Promise(r => setTimeout(r, 300))
	if (!isUnmounted) {
		initVideo()
	}
})

onBeforeUnmount(() => {
	isUnmounted = true
	window.removeEventListener('dweb:content/resize', clampToViewport, true)
	window.removeEventListener('resize', clampToViewport)
	if (cleanupMoveUp) cleanupMoveUp()
	ro?.disconnect()
	ro = null
})
</script>

<style scoped>
.videostudio-page {
	height: 100%;
	display: flex;
	flex-direction: column;
	min-height: 0;
	box-sizing: border-box;
	background: linear-gradient(180deg, var(--pl-bg-0) 0%, var(--pl-bg-1) 100%);
}

.videostudio-stage {
	flex: 1 1 auto;
	min-height: 0;
	min-width: 0;
	overflow: hidden;
}

.videostudio-splitter {
	flex: 0 0 auto;
	height: 6px;
	cursor: row-resize;
	background: color-mix(in srgb, var(--pl-accent) 6%, var(--pl-bg-1));
	border-top: 1px solid color-mix(in srgb, var(--pl-accent) 22%, transparent);
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 22%, transparent);
	position: relative;
	user-select: none;
	transition: background 0.2s ease, box-shadow 0.2s ease;
}

.videostudio-splitter::after {
	content: '';
	position: absolute;
	left: 50%;
	top: 50%;
	width: 28px;
	height: 2px;
	transform: translate(-50%, -50%);
	background: var(--pl-accent);
	opacity: 0.6;
	border-radius: 1px;
	box-shadow: 0 0 6px color-mix(in srgb, var(--pl-accent) 60%, transparent);
}

.videostudio-splitter:hover::after,
.videostudio-splitter.dragging::after {
	opacity: 1;
	box-shadow: 0 0 10px color-mix(in srgb, var(--pl-accent) 80%, transparent);
}

.videostudio-splitter:hover,
.videostudio-splitter.dragging {
	background: color-mix(in srgb, var(--pl-accent) 12%, var(--pl-bg-1));
	box-shadow: inset 0 0 12px color-mix(in srgb, var(--pl-accent) 20%, transparent);
}

.videostudio-timeline {
	flex: 0 0 auto;
	min-height: 0;
	min-width: 0;
	overflow: hidden;
	position: relative;
}
</style>
