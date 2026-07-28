<template>
	<WorkflowNodeBase
		ref="baseRef"
		:nodeId="nodeId"
		:title="title"
		:alias="alias"
		:nodeType="nodeType"
		:subtitle="subtitle"
		:style="style"
		:width="width"
		:height="height"
		:zoom="zoom"
		:worldX="worldX"
		:worldY="worldY"
		:inputs="inputs"
		:outputs="outputs"
		:selected="selected"
		:isPrimarySelected="selected"
		:isSecondarySelected="false"
		:visualStatus="visualStatus"
		:hoverInputAnchorId="hoverInputAnchorId"
		:hoverOutputAnchorId="hoverOutputAnchorId"
		:nodeChatVisible="nodeChatVisible"
		:nodeChatNodeType="nodeChatNodeType"
		:nodeChatDraft="nodeChatDraft"
		:nodeChatSubmitting="nodeChatSubmitting"
		:nodeChatParams="nodeChatParams"
		:nodeChatSelectedRefs="nodeChatSelectedRefs"
		@update:world-x="(v) => emit('update:worldX', v)"
		@update:world-y="(v) => emit('update:worldY', v)"
		@update:world-position="(p) => emit('update:worldPosition', p)"
		@select="(id) => emit('select', id)"
		@start-link="onStartLink"
		@end-link="onEndLink"
		@copy="() => emit('copy')"
		@refresh="() => emit('refresh')"
		@delete="() => emit('delete')"
		@set-type="onSetType"
		@resize="onResize"
	>
		<template #body>
			<div class="wf-media">
				<div
					v-if="resourceUrl"
					class="wf-media-preview"
					:style="previewWrapStyle"
					@contextmenu.stop.prevent="onPreviewContextMenu"
				>
					<img
						v-if="isWarmupRender || !selected"
						class="wf-media-poster-img"
						:src="localPosterUrl || props.posterUrl || undefined"
						alt=""
					/>
					<video
						v-else
						ref="videoEl"
						class="wf-media-video"
						playsinline
						preload="metadata"
						:poster="localPosterUrl || props.posterUrl || undefined"
					/>
				</div>
				<div v-else class="wf-media-empty">
					<div class="wf-media-hint">{{ t('nodes.video.emptyHint') }}</div>
					<div class="wf-media-sub">{{ t('nodes.video.emptySub') }}</div>
				</div>
				<div class="wf-media-actions" @pointerdown.stop>
					<button class="wf-media-btn" type="button" @click.stop="onUploadClick">
						{{ resourceUrl ? t('nodes.video.replaceResource') : t('nodes.video.uploadResource') }}
					</button>
					<button
						v-if="resourceUrl"
						class="wf-media-btn ghost"
						type="button"
						@click.stop="emit('clear-resource')"
					>
						{{ t('nodes.video.clear') }}
					</button>
				</div>
				<input
					ref="fileInput"
					class="wf-file-input"
					type="file"
					accept="video/*"
					@change="onFileChange"
				/>
			</div>
		</template>

		<template #footer>
			<div class="wf-media-footer" @pointerdown.stop>
				<div class="wf-video-toolbar">
					<div class="wf-video-row">
						<VideoController
							class="wf-video-controller"
							:disabled="!resourceUrl || !durationDisplay"
							:playing="playing"
							:duration="durationDisplay"
							:currentTime="seekValue"
							:volume="volume"
							:loop="loopEnabled"
							@toggle-play="togglePlay"
							@toggle-loop="toggleLoop"
							@seek="seekByOverviewTime"
							@update-volume="onControllerVolumeChange"
						/>
						<button
							class="wf-toolbar-btn"
							type="button"
							:disabled="!resourceUrl || !screenshotEnabled"
							@click.stop="onScreenshot"
							:title="
								screenshotEnabled
									? t('nodes.video.screenshot')
									: t('nodes.video.screenshotDisabled')
							"
						>
							{{ t('nodes.video.screenshot') }}
						</button>
						<button
							class="wf-toolbar-btn wf-video-editor-btn"
							type="button"
							:disabled="!resourceUrl"
							@click.stop="onOpenVideoEditor"
							:title="t('nodes.video.openVideoEditor')"
						>
							<svg
								class="wf-video-editor-icon"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<polygon points="23 7 16 12 23 17 23 7" />
								<rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
							</svg>
							<span>{{ t('nodes.video.openVideoEditor') }}</span>
						</button>
					</div>

					<div class="wf-video-row wf-video-row2">
						<canvas
							ref="timelineCanvas"
							class="wf-timeline-canvas"
							:class="{ disabled: !resourceUrl || !durationDisplay }"
							@pointerdown.stop="onTimelinePointerDown"
							@wheel.prevent.stop="onTimelineWheel"
						/>

						<div class="wf-res">
							<input
								class="wf-res-input"
								type="number"
								min="1"
								inputmode="numeric"
								:value="outputWidthDisplay"
								:disabled="!resourceUrl"
								@change="onOutputWidthChange"
							/>
							<span class="wf-res-x">×</span>
							<input
								class="wf-res-input"
								type="number"
								min="1"
								inputmode="numeric"
								:value="outputHeightDisplay"
								:disabled="!resourceUrl"
								@change="onOutputHeightChange"
							/>
						</div>
					</div>
				</div>
			</div>
		</template>
	</WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WorkflowNodeBase from '../WorkflowNodeBase.vue'
import VideoController from '../../UIComponent/VideoController.vue'
import { DwebCanvasGL } from '../../../engine/webgl/canvas/DwebCanvasGL'
import { useI18n } from '../../../i18n'
import { useVideoEditor } from '../../../composables/useVideoEditor'
import type { WorkflowNodeChatType } from '../../../aiworkflow/types'

const { t } = useI18n()
const { open: openVideoEditor } = useVideoEditor()

const videoNodeLastTime = new Map<string, number>()

type AnchorSpec = {
	id: string
	label?: string
	offsetY?: number
}

const props = defineProps<{
	nodeId: string
	title: string
	alias?: string
	nodeType: string
	subtitle?: string
	style?: Record<string, string>
	resourceUrl?: string | null
	resourceSourcePath?: string | null
	posterUrl?: string | null
	resourceName?: string | null
	videoSettings?: {
		outputWidth?: number
		outputHeight?: number
		naturalWidth?: number
		naturalHeight?: number
		currentTime?: number
	} | null
	screenshotEnabled?: boolean
	reloadToken?: number | null
	width: number
	height: number
	zoom: number
	worldX: number
	worldY: number
	inputs?: AnchorSpec[]
	outputs?: AnchorSpec[]
	selected?: boolean
	hoverInputAnchorId?: string | null
	hoverOutputAnchorId?: string | null
	isWarmupRender?: boolean
	visualStatus?: 'idle' | 'running' | 'error'
	nodeChatVisible?: boolean
	nodeChatNodeType?: WorkflowNodeChatType | null
	nodeChatDraft?: string
	nodeChatSubmitting?: boolean
	nodeChatParams?: Record<string, any>
	nodeChatSelectedRefs?: any[]
	inputParamPreviewRefs?: any[]
}>()

const onStartLink = (payload: {
	nodeId: string
	anchorId: string
	anchorIndex: number
	event: PointerEvent
}) => {
	emit('start-link', payload)
}
const onEndLink = (payload: { nodeId: string; anchorId: string; anchorIndex: number }) => {
	emit('end-link', payload)
}
const onSetType = (
	type:
		| 'base'
		| 'text'
		| 'text-merge'
		| 'image'
		| 'rotate-image'
		| 'video'
		| 'scene-understanding'
		| 'scene-decompose'
		| 'scene-layout'
		| 'unreal-export'
		| 'story'
		| 'comfyui'
		| 'model3d'
		| 'meshy'
		| 'blender'
) => {
	emit('set-type', type)
}
const onResize = (payload: { width: number; height: number; worldX: number; worldY: number }) => {
	emit('resize', payload)
}

const emit = defineEmits<{
	(e: 'update:worldX', v: number): void
	(e: 'update:worldY', v: number): void
	(e: 'update:worldPosition', p: { worldX: number; worldY: number }): void
	(e: 'select', nodeId: string): void
	(e: 'preview-contextmenu', payload: { clientX: number; clientY: number }): void
	(
		e: 'start-link',
		payload: {
			nodeId: string
			anchorId: string
			anchorIndex: number
			event: PointerEvent
		}
	): void
	(e: 'end-link', payload: { nodeId: string; anchorId: string; anchorIndex: number }): void
	(e: 'copy'): void
	(e: 'refresh'): void
	(e: 'delete'): void
	(
		e: 'set-type',
		v:
			| 'base'
			| 'text'
			| 'text-merge'
			| 'image'
			| 'rotate-image'
			| 'video'
			| 'scene-understanding'
			| 'scene-decompose'
			| 'scene-layout'
			| 'unreal-export'
			| 'story'
			| 'comfyui'
			| 'model3d'
			| 'meshy'
			| 'blender'
	): void
	(e: 'upload-resource', payload: { file: File; kind: 'image' | 'video' }): void
	(e: 'clear-resource'): void
	(e: 'resize', payload: { width: number; height: number; worldX: number; worldY: number }): void
	(
		e: 'update-video-settings',
		payload: {
			outputWidth?: number
			outputHeight?: number
			naturalWidth?: number
			naturalHeight?: number
			currentTime?: number
		}
	): void
	(e: 'screenshot', payload: { dataUrl: string; width: number; height: number; time: number }): void
	(e: 'media-ready'): void
	(e: 'invalidate-screenshot'): void
	(
		e: 'capture-preview',
		payload: { dataUrl: string; width: number; height: number; time: number }
	): void
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const baseRef = ref<InstanceType<typeof WorkflowNodeBase> | null>(null)

const onPreviewContextMenu = (e: MouseEvent) => {
	emit('select', props.nodeId)
	emit('preview-contextmenu', { clientX: e.clientX, clientY: e.clientY })
}

const videoEl = ref<HTMLVideoElement | null>(null)
const timelineCanvas = ref<HTMLCanvasElement | null>(null)

const playing = ref(false)
const duration = ref(0)
const seekTime = ref(0)
const timelineZoom = ref(6)
const volume = ref(1)
const loopEnabled = ref(false)
let rafId: number | null = null

let tlCtx: CanvasRenderingContext2D | null = null
let tlRo: ResizeObserver | null = null
let tlPointerActive = false
let pendingSeekTime: number | null = null
let pendingSeekRetryCount = 0
let pendingSeekRequestedAt = 0
let noCrossOriginFallbackSrc = ''
let localMediaRetryTimer: number | null = null
let localMediaRetryCount = 0
let hasActiveVideo = false
const resourceFallbackUrl = ref('')
const localPosterUrl = ref<string | null>(null)
const effectiveResourceUrl = computed(() =>
	String(resourceFallbackUrl.value || props.resourceUrl || '').trim()
)

let invalidateScreenshotTimer: number | null = null
const scheduleInvalidateScreenshot = () => {
	if (invalidateScreenshotTimer != null) {
		clearTimeout(invalidateScreenshotTimer)
	}
	invalidateScreenshotTimer = window.setTimeout(() => {
		invalidateScreenshotTimer = null
		emit('invalidate-screenshot')
	}, 150)
}

const screenshotEnabled = computed(() => Boolean(props.screenshotEnabled))
const normalizedResourceSourcePath = computed(() => String(props.resourceSourcePath ?? '').trim())

const toFileUrl = (_path?: string) => {
	return ''
}

const resetMediaRuntimeState = () => {
	playing.value = false
	stopRaf()
	duration.value = 0
	seekTime.value = pendingSeekTime ?? 0
	pendingSeekRetryCount = 0
	pendingSeekRequestedAt = 0
	clearLocalMediaRetry()
	noCrossOriginFallbackSrc = ''
	lastReadySrc = ''
	drawTimeline()
}

const isLikelyLocalMediaUrl = (src: string) => {
	const text = String(src || '').trim()
	if (!text) return false
	if (text.toLowerCase().startsWith('dweb://')) return true
	try {
		const parsed = new URL(text, window.location.href)
		return /\/media\//i.test(parsed.pathname)
	} catch {
		return /\/media\//i.test(text)
	}
}

const clearLocalMediaRetry = () => {
	if (localMediaRetryTimer != null) {
		try {
			window.clearTimeout(localMediaRetryTimer)
		} catch {
			// ignore
		}
	}
	localMediaRetryTimer = null
	localMediaRetryCount = 0
}

const scheduleLocalMediaRetry = (src: string) => {
	if (!isLikelyLocalMediaUrl(src)) return false
	if (localMediaRetryTimer != null) return true
	if (localMediaRetryCount >= 6) return false
	localMediaRetryCount += 1
	const delay = Math.min(3000, 250 * localMediaRetryCount)
	localMediaRetryTimer = window.setTimeout(() => {
		localMediaRetryTimer = null
		void applyVideoSrc({
			reload: true,
			forceNoCrossOrigin: noCrossOriginFallbackSrc === src
		})
	}, delay)
	return true
}

const naturalWidth = computed(() => {
	const v = props.videoSettings?.naturalWidth
	return Number.isFinite(Number(v)) ? Math.max(1, Math.floor(Number(v))) : null
})

const naturalHeight = computed(() => {
	const v = props.videoSettings?.naturalHeight
	return Number.isFinite(Number(v)) ? Math.max(1, Math.floor(Number(v))) : null
})

const outputWidth = computed(() => {
	const v = props.videoSettings?.outputWidth
	return Number.isFinite(Number(v)) ? Math.max(1, Math.floor(Number(v))) : null
})

const outputHeight = computed(() => {
	const v = props.videoSettings?.outputHeight
	return Number.isFinite(Number(v)) ? Math.max(1, Math.floor(Number(v))) : null
})

const previewWrapStyle = computed(() => {
	return {}
})

const outputWidthDisplay = computed(() =>
	outputWidth.value != null ? String(outputWidth.value) : ''
)
const outputHeightDisplay = computed(() =>
	outputHeight.value != null ? String(outputHeight.value) : ''
)

const durationDisplay = computed(() => Math.max(0, Number(duration.value) || 0))
const seekValue = computed(() => {
	const t = Math.max(0, Number(seekTime.value) || 0)
	return Math.min(t, durationDisplay.value || t)
})

const stopRaf = () => {
	if (rafId != null) {
		try {
			cancelAnimationFrame(rafId)
		} catch {
			// ignore
		}
	}
	rafId = null
}

const nowMs = () =>
	typeof performance !== 'undefined' && typeof performance.now === 'function'
		? performance.now()
		: Date.now()

const tick = () => {
	stopRaf()
	const v = videoEl.value
	if (!v || !playing.value) return
	const cur = Number(v.currentTime) || 0
	if (pendingSeekTime != null) {
		const target = pendingSeekTime
		if (Math.abs(cur - target) <= 0.08) {
			pendingSeekTime = null
			pendingSeekRetryCount = 0
			pendingSeekRequestedAt = 0
			seekTime.value = cur
		} else {
			drawTimeline()
			rafId = requestAnimationFrame(tick)
			return
		}
	} else {
		seekTime.value = cur
	}
	drawTimeline()
	rafId = requestAnimationFrame(tick)
}

const shouldUseAnonymousCrossOrigin = (src: string) => {
	const text = String(src || '').trim()
	if (!text) return false
	if (text.startsWith('blob:') || text.startsWith('data:')) return false
	if (text.toLowerCase().startsWith('dweb://')) return false
	if (noCrossOriginFallbackSrc === text) return false
	return true
}

const applyVideoCrossOriginMode = (
	v: HTMLVideoElement,
	src: string,
	opts?: { forceNoCrossOrigin?: boolean }
) => {
	const useAnonymous = !opts?.forceNoCrossOrigin && shouldUseAnonymousCrossOrigin(src)
	if (useAnonymous) {
		v.crossOrigin = 'anonymous'
		v.setAttribute('crossorigin', 'anonymous')
		return
	}
	try {
		v.removeAttribute('crossorigin')
	} catch {
		// ignore
	}
	try {
		v.crossOrigin = ''
	} catch {
		// ignore
	}
}

const applyVideoSrc = async (opts?: { forceNoCrossOrigin?: boolean; reload?: boolean }) => {
	const v = videoEl.value
	if (!v) return
	const src = effectiveResourceUrl.value
	if (!src) return
	applyVideoCrossOriginMode(v, src, opts)
	if (opts?.reload) {
		try {
			v.pause()
		} catch {
			// ignore
		}
		try {
			v.removeAttribute('src')
			v.load()
		} catch {
			// ignore
		}
	}
	if (v.src !== src || opts?.reload) v.src = src
	try {
		v.load()
	} catch {
		// ignore
	}
	applyLoop()
}

let lastReadySrc = ''
const tryEmitMediaReady = () => {
	const v = videoEl.value
	if (!v) return
	const src = effectiveResourceUrl.value
	if (!src) return
	if (src === lastReadySrc) return
	// HAVE_CURRENT_DATA (2) means the first frame is available for rendering.
	if ((v.readyState || 0) >= 2) {
		lastReadySrc = src
		emit('media-ready')
	}
}

const ensureMetadata = async () => {
	const v = videoEl.value
	if (!v) return
	// If metadata is already available (possible when src switches fast), sync immediately.
	if (
		v.readyState >= 1 &&
		Number.isFinite(Number(v.duration)) &&
		(v.videoWidth || 0) > 0 &&
		(v.videoHeight || 0) > 0
	) {
		onLoadedMetadata()
		return
	}
	await new Promise<void>((resolve) => {
		let done = false
		const finish = () => {
			if (done) return
			done = true
			v.removeEventListener('loadedmetadata', onMeta)
			clearTimeout(tid)
			resolve()
		}
		const onMeta = () => {
			finish()
		}
		const tid = setTimeout(() => finish(), 5000)
		v.addEventListener('loadedmetadata', onMeta)
	})
	onLoadedMetadata()
}

const onLoadedMetadata = () => {
	const v = videoEl.value
	if (!v) return
	duration.value = Math.max(0, Number(v.duration) || 0)
	const w = Math.max(1, Math.floor(v.videoWidth || 1))
	const h = Math.max(1, Math.floor(v.videoHeight || 1))

	// Avoid emitting redundant settings updates (can cause large update storms on project load).
	const nextOutputW = outputWidth.value ?? w
	const nextOutputH = outputHeight.value ?? h
	const prev = props.videoSettings ?? null
	const sameNatural = Number(prev?.naturalWidth) === w && Number(prev?.naturalHeight) === h
	const sameOutput =
		Number(prev?.outputWidth) === nextOutputW && Number(prev?.outputHeight) === nextOutputH
	if (!sameNatural || !sameOutput) {
		emit('update-video-settings', {
			naturalWidth: w,
			naturalHeight: h,
			outputWidth: nextOutputW,
			outputHeight: nextOutputH
		})
	}
	if (pendingSeekTime == null) {
		const savedTime = props.videoSettings?.currentTime
		if (savedTime != null && Number.isFinite(savedTime) && savedTime > 0.05) {
			pendingSeekTime = Number(savedTime)
			pendingSeekRetryCount = 0
			seekTime.value = pendingSeekTime
		}
	}
	console.log(
		'[WorkflowVideoNode] onLoadedMetadata: duration=',
		duration.value,
		'pendingSeekTime=',
		pendingSeekTime,
		'currentTime=',
		v.currentTime,
		'readyState=',
		v.readyState
	)
	if (pendingSeekTime != null) {
		const target = clamp(pendingSeekTime, 0, duration.value || 0)
		seekTime.value = target
		try {
			v.currentTime = target
			console.log(
				'[WorkflowVideoNode] onLoadedMetadata: seek to',
				target,
				'video.currentTime=',
				v.currentTime
			)
		} catch (e) {
			console.warn('[WorkflowVideoNode] onLoadedMetadata: seek failed', e)
		}
	}
	drawTimeline()
	nextTick(() => baseRef.value?.requestAutoResize())
	scheduleInvalidateScreenshot()
}

let srcWatchRunId = 0

const togglePlay = async () => {
	const v = videoEl.value
	if (!v) return
	if (!playing.value) {
		try {
			// default enable sound
			v.muted = false
			const vv = Number(volume.value)
			v.volume = Number.isFinite(vv) ? Math.max(0, Math.min(1, vv)) : 1
			await v.play()
			playing.value = true
			tick()
		} catch {
			playing.value = false
		}
		return
	}
	try {
		v.pause()
	} catch {
		// ignore
	}
	playing.value = false
	stopRaf()
	drawTimeline()
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

const requestVideoSeek = (targetTime: number) => {
	const d = durationDisplay.value
	if (!d) return
	const bounded = clamp(Number(targetTime) || 0, 0, d)
	seekTime.value = bounded
	pendingSeekTime = bounded
	pendingSeekRetryCount = 0
	pendingSeekRequestedAt = nowMs()
	const v = videoEl.value
	if (v && (v.readyState || 0) >= 1 && Number(v.duration) > 0) {
		try {
			if (typeof v.fastSeek === 'function') v.fastSeek(bounded)
			else v.currentTime = bounded
		} catch {
			try {
				v.currentTime = bounded
			} catch {
				// ignore
			}
		}
	}
	drawTimeline()
}

const retryPendingSeek = (v: HTMLVideoElement, opts?: { force?: boolean }) => {
	if (pendingSeekTime == null) return false
	if ((v.readyState || 0) < 1 || !(Number(v.duration) > 0)) return false
	const target = clamp(pendingSeekTime, 0, duration.value || 0)
	const cur = Number(v.currentTime) || 0
	console.log(
		'[WorkflowVideoNode] retryPendingSeek: target=',
		target,
		'cur=',
		cur,
		'readyState=',
		v.readyState,
		'force=',
		opts?.force,
		'retryCount=',
		pendingSeekRetryCount
	)
	if (Math.abs(cur - target) <= 0.08) {
		pendingSeekTime = null
		pendingSeekRetryCount = 0
		pendingSeekRequestedAt = 0
		seekTime.value = cur
		console.log('[WorkflowVideoNode] retryPendingSeek: already at target, done')
		return true
	}
	if (!opts?.force && cur <= 0.001 && target > 0.12) {
		console.log('[WorkflowVideoNode] retryPendingSeek: skip (cur=0 and not force)')
		return false
	}
	if (pendingSeekRetryCount >= 2) {
		console.log('[WorkflowVideoNode] retryPendingSeek: max retries reached, give up')
		return false
	}
	pendingSeekRetryCount += 1
	try {
		v.currentTime = target
		pendingSeekRequestedAt = nowMs()
		console.log(
			'[WorkflowVideoNode] retryPendingSeek: seek to',
			target,
			'video.currentTime=',
			v.currentTime
		)
		return true
	} catch (e) {
		console.warn('[WorkflowVideoNode] retryPendingSeek: seek failed', e)
		return false
	}
}

const applyVolume = () => {
	const v = videoEl.value
	if (!v) return
	v.muted = false
	const vv = Number(volume.value)
	v.volume = Number.isFinite(vv) ? clamp(vv, 0, 1) : 1
}

const applyLoop = () => {
	const v = videoEl.value
	if (!v) return
	v.loop = Boolean(loopEnabled.value)
}

const toggleLoop = () => {
	loopEnabled.value = !loopEnabled.value
	applyLoop()
}

const onControllerVolumeChange = (vv: number) => {
	volume.value = clamp(Number(vv) || 0, 0, 1)
	applyVolume()
}

const getTimelineWindow = () => {
	const d = durationDisplay.value
	const z = clamp(Math.floor(Number(timelineZoom.value) || 6), 1, 20)
	const windowLen = d > 0 ? d / z : 0
	const center = clamp(seekValue.value, 0, d || 0)
	let start = center - windowLen / 2
	let end = center + windowLen / 2
	if (d > 0) {
		if (start < 0) {
			end -= start
			start = 0
		}
		if (end > d) {
			start -= end - d
			end = d
			start = Math.max(0, start)
		}
	}
	return {
		start: Math.max(0, start),
		end: Math.max(0, end),
		len: Math.max(0, end - start)
	}
}

const resizeTimelineCanvas = () => {
	const el = timelineCanvas.value
	if (!el) return
	const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1
	const w = Math.max(1, Math.floor(el.clientWidth || 1))
	const h = Math.max(1, Math.floor(el.clientHeight || 1))
	el.width = Math.max(1, Math.floor(w * dpr))
	el.height = Math.max(1, Math.floor(h * dpr))
	const ctx = el.getContext('2d')
	if (!ctx) return
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	tlCtx = ctx
	drawTimeline()
}

const drawTimeline = () => {
	const el = timelineCanvas.value
	const ctx = tlCtx
	if (!el || !ctx) return
	const w = Math.max(1, Math.floor(el.clientWidth || 1))
	const h = Math.max(1, Math.floor(el.clientHeight || 1))
	ctx.clearRect(0, 0, w, h)

	// base rect
	const border =
		getComputedStyle(document.documentElement).getPropertyValue('--vscode-border').trim() ||
		'#2b2b2b'
	const bg =
		getComputedStyle(document.documentElement).getPropertyValue('--dweb-defualt').trim() ||
		'#111111'
	const fg =
		getComputedStyle(document.documentElement).getPropertyValue('--vscode-fg').trim() || '#ffffff'
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

	const d = durationDisplay.value
	if (!d || !effectiveResourceUrl.value) {
		ctx.fillStyle = muted
		ctx.font = '12px sans-serif'
		ctx.fillText(t('nodes.video.timeline'), 8, Math.floor(h / 2) + 4)
		return
	}

	const { start, end, len } = getTimelineWindow()
	const seekT = clamp(seekValue.value, 0, d)
	const x = len > 0 ? ((seekT - start) / len) * w : 0

	// pointer line
	ctx.strokeStyle = accent
	ctx.lineWidth = 2
	ctx.beginPath()
	ctx.moveTo(Math.round(x) + 0.5, 0)
	ctx.lineTo(Math.round(x) + 0.5, h)
	ctx.stroke()

	// labels
	ctx.fillStyle = fg
	ctx.font = '11px sans-serif'
	ctx.fillText(`${start.toFixed(2)}s`, 8, 14)
	const endLabel = `${end.toFixed(2)}s`
	const endW = ctx.measureText(endLabel).width
	ctx.fillText(endLabel, Math.max(8, w - 8 - endW), 14)

	// zoom range + precision
	const z = clamp(Math.floor(Number(timelineZoom.value) || 6), 1, 20)
	const secPerPx = len > 0 ? len / Math.max(1, w) : 0
	const precisionLabel =
		secPerPx >= 1 ? `${secPerPx.toFixed(2)}s/px` : `${Math.max(0, secPerPx * 1000).toFixed(0)}ms/px`
	const info = t('nodes.video.rangeInfo', {
		duration: len.toFixed(2),
		zoom: z,
		precision: precisionLabel
	})
	ctx.fillStyle = muted
	ctx.font = '11px sans-serif'
	ctx.fillText(info, 8, h - 8)
}

const seekByTimelineX = (clientX: number) => {
	const el = timelineCanvas.value
	if (!el) return
	const rect = el.getBoundingClientRect()
	const x = clamp(clientX - rect.left, 0, rect.width)
	const d = durationDisplay.value
	if (!d) return
	const { start, len } = getTimelineWindow()
	const t = clamp(start + (x / Math.max(1, rect.width)) * len, 0, d)
	requestVideoSeek(t)
}

const seekByOverviewTime = (t: number) => {
	const d = durationDisplay.value
	if (!d) return
	const next = clamp(Number(t) || 0, 0, d)
	requestVideoSeek(next)
}

const onTimelinePointerDown = (e: PointerEvent) => {
	if (!effectiveResourceUrl.value || !durationDisplay.value) return
	const el = timelineCanvas.value
	if (!el) return
	tlPointerActive = true
	el.setPointerCapture(e.pointerId)
	seekByTimelineX(e.clientX)
	const onMove = (ev: PointerEvent) => {
		if (!tlPointerActive) return
		seekByTimelineX(ev.clientX)
	}
	const onUp = () => {
		tlPointerActive = false
		window.removeEventListener('pointermove', onMove)
		window.removeEventListener('pointerup', onUp)
		window.removeEventListener('pointercancel', onUp)
	}
	window.addEventListener('pointermove', onMove)
	window.addEventListener('pointerup', onUp)
	window.addEventListener('pointercancel', onUp)
}

const onTimelineWheel = (e: WheelEvent) => {
	if (!effectiveResourceUrl.value || !durationDisplay.value) return
	const delta = e.deltaY
	const cur = clamp(Math.floor(Number(timelineZoom.value) || 6), 1, 20)
	const next = clamp(cur + (delta > 0 ? -1 : 1), 1, 20)
	if (next === cur) return
	timelineZoom.value = next
	drawTimeline()
}

const onOutputWidthChange = (e: Event) => {
	const input = e.target as HTMLInputElement
	const w = Math.max(1, Math.floor(Number(input.value) || 0))
	if (!Number.isFinite(w) || w <= 0) return
	emit('update-video-settings', { outputWidth: w })
	scheduleInvalidateScreenshot()
}

const onOutputHeightChange = (e: Event) => {
	const input = e.target as HTMLInputElement
	const h = Math.max(1, Math.floor(Number(input.value) || 0))
	if (!Number.isFinite(h) || h <= 0) return
	emit('update-video-settings', { outputHeight: h })
	scheduleInvalidateScreenshot()
}

const coverDrawParams = (srcW: number, srcH: number, dstW: number, dstH: number) => {
	const sW = Math.max(1, srcW)
	const sH = Math.max(1, srcH)
	const dW = Math.max(1, dstW)
	const dH = Math.max(1, dstH)
	const scale = Math.max(dW / sW, dH / sH)
	const drawW = dW / scale
	const drawH = dH / scale
	const sx = (sW - drawW) / 2
	const sy = (sH - drawH) / 2
	return { sx, sy, sw: drawW, sh: drawH }
}

const onOpenVideoEditor = async () => {
	const url = effectiveResourceUrl.value
	if (!url) return
	const videoName =
		String(props.resourceName ?? '').trim() || props.nodeId || t('nodes.video.editorTitle')
	await openVideoEditor({
		nodeId: props.nodeId,
		videoUrl: url,
		videoName
	})
}

const onScreenshot = () => {
	const v = videoEl.value
	if (!v) return
	if (!screenshotEnabled.value) return
	if (v.readyState < 2) return
	const capture = async () => {
		const ow = outputWidth.value ?? Math.max(1, Math.floor(v.videoWidth || 1))
		const oh = outputHeight.value ?? Math.max(1, Math.floor(v.videoHeight || 1))
		const canvas = document.createElement('canvas')
		canvas.width = Math.max(1, Math.floor(ow))
		canvas.height = Math.max(1, Math.floor(oh))

		let gl: DwebCanvasGL | null = null
		let tex: WebGLTexture | null = null
		try {
			gl = new DwebCanvasGL(canvas)
			gl.setSize(canvas.width, canvas.height, 1)
			tex = gl.createTexture({ wrap: 'clamp' })
			gl.updateTextureFromImage(tex, v, { wrap: 'clamp' })

			const srcW = Math.max(1, Math.floor(v.videoWidth || 1))
			const srcH = Math.max(1, Math.floor(v.videoHeight || 1))
			const { sx, sy, sw, sh } = coverDrawParams(srcW, srcH, canvas.width, canvas.height)
			const u0 = sx / srcW
			const v0 = sy / srcH
			const u1 = (sx + sw) / srcW
			const v1 = (sy + sh) / srcH
			const uv = { u0, v0, u1, v1 }

			gl.setScene({
				render: (c) => {
					const target = { w: canvas.width, h: canvas.height, scale: 1 }
					c.drawLocalTexturedRectUv(target, 0, 0, canvas.width, canvas.height, tex!, 1, 0, uv)
				}
			})
			gl.requestRender()
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
			const dataUrl = canvas.toDataURL('image/png')
			emit('screenshot', {
				dataUrl,
				width: canvas.width,
				height: canvas.height,
				time: v.currentTime || seekValue.value
			})
		} catch (err) {
			console.warn('[WorkflowVideoNode] screenshot capture failed', err)
		} finally {
			try {
				if (gl && tex) gl.deleteTexture(tex)
			} catch {
				// ignore
			}
			try {
				gl?.dispose()
			} catch {
				// ignore
			}
		}
	}

	// If paused and not yet on seek target, seek first then capture.
	if (!playing.value && Math.abs((v.currentTime || 0) - seekValue.value) > 1e-2) {
		const target = seekValue.value
		const onSeeked = () => {
			v.removeEventListener('seeked', onSeeked)
			void capture()
		}
		v.addEventListener('seeked', onSeeked)
		try {
			v.currentTime = target
		} catch {
			v.removeEventListener('seeked', onSeeked)
		}
		return
	}

	void capture()
}

const onUploadClick = () => {
	fileInput.value?.click()
}

const onFileChange = (e: Event) => {
	const input = e.target as HTMLInputElement
	const file = input.files?.[0]
	if (!file) return
	emit('upload-resource', { file, kind: 'video' })
	input.value = ''
}

watch(
	() => [props.resourceUrl, props.selected, props.isWarmupRender],
	async (current, previous) => {
		const nextUrl = current?.[0]
		const isSelected = current?.[1]
		const isWarmup = current?.[2]
		const prevUrl = previous?.[0]
		const next = String(nextUrl ?? '').trim()
		const prev = String(prevUrl ?? '').trim()
		if (next !== prev) resourceFallbackUrl.value = ''
		const runId = ++srcWatchRunId
		try {
			await nextTick()
			if (runId !== srcWatchRunId) return

			if (!effectiveResourceUrl.value) {
				resetMediaRuntimeState()
				hasActiveVideo = false
				return
			}

			if (isWarmup || !isSelected) {
				if (isWarmup) {
					console.log('[WorkflowVideoNode] resource watcher: warmup mode, skip video loading')
				} else if (!isSelected) {
					console.log('[WorkflowVideoNode] resource watcher: non-selected mode, skip video loading')
				}
				resetMediaRuntimeState()
				hasActiveVideo = false
				return
			}

			resetMediaRuntimeState()
			hasActiveVideo = true
			localPosterUrl.value = null

			let savedTime = videoNodeLastTime.get(props.nodeId)
			if (savedTime == null || !Number.isFinite(savedTime) || savedTime < 0) {
				savedTime = props.videoSettings?.currentTime
			}
			console.log(
				'[WorkflowVideoNode] resource watcher: videoSettings=',
				JSON.stringify(props.videoSettings),
				'savedTime=',
				savedTime,
				'fromMap=',
				videoNodeLastTime.get(props.nodeId),
				'isSelected=',
				isSelected
			)
			if (savedTime != null && Number.isFinite(savedTime) && savedTime > 0.05) {
				pendingSeekTime = Number(savedTime)
				pendingSeekRetryCount = 0
				seekTime.value = pendingSeekTime
				console.log('[WorkflowVideoNode] resource watcher: set pendingSeekTime=', pendingSeekTime)
			} else {
				console.log('[WorkflowVideoNode] resource watcher: no valid savedTime, skip')
			}

			await applyVideoSrc()
			if (runId !== srcWatchRunId) return

			await ensureMetadata()
			if (runId !== srcWatchRunId) return
			applyVolume()
			applyLoop()
			drawTimeline()
			tryEmitMediaReady()
		} catch (err) {
			console.warn('[WorkflowVideoNode] resource watcher failed', err)
		}
	},
	{ immediate: true }
)

watch(
	() => props.videoSettings?.currentTime,
	(newTime) => {
		// 预热渲染模式下不处理 seek
		if (props.isWarmupRender) return
		if (newTime == null || !Number.isFinite(newTime) || newTime <= 0) return
		const v = videoEl.value
		if (!v) {
			// 视频元素还没就绪，设置 pendingSeekTime 等待后续恢复
			if (pendingSeekTime !== newTime) {
				pendingSeekTime = Number(newTime)
				pendingSeekRetryCount = 0
				console.log(
					'[WorkflowVideoNode] currentTime watch (no videoEl): set pendingSeekTime=',
					pendingSeekTime
				)
			}
			return
		}
		const cur = Number(v.currentTime) || 0
		const target = Math.max(0, Number(newTime))
		if (Math.abs(cur - target) < 0.1) return
		console.log(
			'[WorkflowVideoNode] currentTime watch: seek from',
			cur,
			'to',
			target,
			'readyState=',
			v.readyState
		)
		if ((v.readyState || 0) >= 1 && Number(v.duration) > 0) {
			try {
				v.currentTime = target
				seekTime.value = clamp(target, 0, duration.value || target)
				drawTimeline()
			} catch (e) {
				console.warn('[WorkflowVideoNode] currentTime watch: seek failed', e)
				pendingSeekTime = target
				pendingSeekRetryCount = 0
			}
		} else {
			pendingSeekTime = target
			pendingSeekRetryCount = 0
		}
	}
)

watch(
	() => volume.value,
	() => {
		applyVolume()
	}
)

watch(
	() => props.posterUrl,
	(newPoster) => {
		if (newPoster && localPosterUrl.value) {
			localPosterUrl.value = null
		}
		scheduleInvalidateScreenshot()
	}
)

const captureCurrentFrame = (): {
	dataUrl: string
	width: number
	height: number
	time: number
} | null => {
	const v = videoEl.value
	if (!v || v.readyState < 2) return null
	const ow = outputWidth.value ?? Math.max(1, Math.floor(v.videoWidth || 1))
	const oh = outputHeight.value ?? Math.max(1, Math.floor(v.videoHeight || 1))
	const canvas = document.createElement('canvas')
	canvas.width = Math.max(1, Math.floor(ow))
	canvas.height = Math.max(1, Math.floor(oh))

	const ctx = canvas.getContext('2d')
	if (!ctx) return null

	const srcW = Math.max(1, Math.floor(v.videoWidth || 1))
	const srcH = Math.max(1, Math.floor(v.videoHeight || 1))
	const { sx, sy, sw, sh } = coverDrawParams(srcW, srcH, canvas.width, canvas.height)

	ctx.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
	const dataUrl = canvas.toDataURL('image/png')
	return {
		dataUrl,
		width: canvas.width,
		height: canvas.height,
		time: v.currentTime || 0
	}
}

watch(
	() => props.selected,
	async (isSelected, wasSelected) => {
		console.log(
			'[WorkflowVideoNode] selected watcher: isSelected=',
			isSelected,
			'wasSelected=',
			wasSelected,
			'nodeId=',
			props.nodeId
		)
		if (wasSelected && !isSelected) {
			const v = videoEl.value
			if (!v) return

			if (playing.value) {
				try {
					v.pause()
				} catch {
					// ignore
				}
			}

			const curTime = Number(v.currentTime) || 0
			if (curTime > 0.1) {
				videoNodeLastTime.set(props.nodeId, curTime)
				emit('update-video-settings', { currentTime: curTime })
			}
		}

		if (isSelected && !wasSelected) {
			localPosterUrl.value = null
		}
		scheduleInvalidateScreenshot()
	},
	{ flush: 'pre' }
)

watch(
	() => props.reloadToken,
	async (nextValue, prevValue) => {
		if (nextValue === prevValue) return
		if (!effectiveResourceUrl.value) return
		const runId = ++srcWatchRunId
		try {
			resetMediaRuntimeState()
			await nextTick()
			if (runId !== srcWatchRunId) return
			await applyVideoSrc({ reload: true })
			if (runId !== srcWatchRunId) return
			await ensureMetadata()
			if (runId !== srcWatchRunId) return
			applyVolume()
			applyLoop()
			drawTimeline()
			tryEmitMediaReady()
		} catch (err) {
			console.warn('[WorkflowVideoNode] reload token refresh failed', err)
		}
	}
)

onMounted(() => {
	console.log(
		'[WorkflowVideoNode] onMounted: nodeId=',
		props.nodeId,
		'isWarmupRender=',
		props.isWarmupRender,
		'selected=',
		props.selected,
		'videoSettings=',
		JSON.stringify(props.videoSettings)
	)

	hasActiveVideo = false

	if (timelineCanvas.value) {
		resizeTimelineCanvas()
		tlRo = new ResizeObserver(() => resizeTimelineCanvas())
		tlRo.observe(timelineCanvas.value)
	}

	if (props.isWarmupRender || !props.selected) {
		if (props.isWarmupRender) {
			console.log('[WorkflowVideoNode] onMounted: warmup mode, skip video initialization')
		} else if (!props.selected) {
			console.log('[WorkflowVideoNode] onMounted: non-selected mode, skip video initialization')
		}
		return
	}

	if (!videoEl.value) {
		console.log('[WorkflowVideoNode] onMounted: no videoEl (should not happen when selected)')
		return
	}

	hasActiveVideo = true
	localPosterUrl.value = null

	let savedTime = videoNodeLastTime.get(props.nodeId)
	if (savedTime == null || !Number.isFinite(savedTime) || savedTime < 0) {
		savedTime = props.videoSettings?.currentTime
	}
	console.log(
		'[WorkflowVideoNode] onMounted: initial savedTime=',
		savedTime,
		'fromMap=',
		videoNodeLastTime.get(props.nodeId)
	)
	if (savedTime != null && Number.isFinite(savedTime) && savedTime > 0.05) {
		pendingSeekTime = Number(savedTime)
		pendingSeekRetryCount = 0
		seekTime.value = pendingSeekTime
		console.log('[WorkflowVideoNode] onMounted: set pendingSeekTime=', pendingSeekTime)
	}

	applyLoop()
	applyVolume()
	videoEl.value.addEventListener('loadedmetadata', onLoadedMetadata)
	videoEl.value.addEventListener('loadeddata', () => {
		const v = videoEl.value
		console.log(
			'[WorkflowVideoNode] loadeddata event: readyState=',
			v?.readyState,
			'currentTime=',
			v?.currentTime,
			'pendingSeekTime=',
			pendingSeekTime
		)
		if (v) retryPendingSeek(v, { force: true })
		clearLocalMediaRetry()
		tryEmitMediaReady()
	})
	videoEl.value.addEventListener('canplay', () => {
		const v = videoEl.value
		console.log(
			'[WorkflowVideoNode] canplay event: readyState=',
			v?.readyState,
			'currentTime=',
			v?.currentTime,
			'pendingSeekTime=',
			pendingSeekTime
		)
		if (v) retryPendingSeek(v, { force: true })
		clearLocalMediaRetry()
		tryEmitMediaReady()
	})
	videoEl.value.addEventListener('error', () => {
		const v = videoEl.value
		const src = effectiveResourceUrl.value
		if (!v || !src) return
		if (!resourceFallbackUrl.value && normalizedResourceSourcePath.value) {
			const fileUrl = toFileUrl(normalizedResourceSourcePath.value)
			if (fileUrl) {
				resourceFallbackUrl.value = fileUrl
				resetMediaRuntimeState()
				void applyVideoSrc({ reload: true })
				return
			}
		}
		if (isLikelyLocalMediaUrl(src)) {
			if (shouldUseAnonymousCrossOrigin(src) && noCrossOriginFallbackSrc !== src) {
				noCrossOriginFallbackSrc = src
				void applyVideoSrc({ forceNoCrossOrigin: true, reload: true })
			}
			if (scheduleLocalMediaRetry(src)) return
		}
		if (!shouldUseAnonymousCrossOrigin(src)) return
		noCrossOriginFallbackSrc = src
		void applyVideoSrc({ forceNoCrossOrigin: true, reload: true })
	})
	let lastTimeSync = 0
	let lastStoreSync = 0
	videoEl.value.addEventListener('timeupdate', () => {
		const v = videoEl.value
		if (!v) return
		const cur = Number(v.currentTime) || 0
		const now = nowMs()
		if (now - lastTimeSync > 500) {
			lastTimeSync = now
			videoNodeLastTime.set(props.nodeId, cur)
		}
		if (now - lastStoreSync > 1000 && cur > 0.1) {
			lastStoreSync = now
			emit('update-video-settings', { currentTime: cur })
		}
		if (pendingSeekTime != null) {
			const target = pendingSeekTime
			if (Math.abs(cur - target) <= 0.08) {
				pendingSeekTime = null
				pendingSeekRetryCount = 0
				pendingSeekRequestedAt = 0
				seekTime.value = cur
				drawTimeline()
				return
			}
			if (cur <= 0.001 && target > 0.12) {
				retryPendingSeek(v, { force: true })
				drawTimeline()
				return
			}
			if (nowMs() - pendingSeekRequestedAt <= 1500) {
				if (pendingSeekRetryCount < 2) retryPendingSeek(v, { force: true })
				drawTimeline()
				return
			}
			pendingSeekTime = null
			pendingSeekRetryCount = 0
			pendingSeekRequestedAt = 0
		}
		seekTime.value = cur
		drawTimeline()
	})
	videoEl.value.addEventListener('seeked', () => {
		const v = videoEl.value
		if (!v) return
		const cur = Number(v.currentTime) || 0
		if (pendingSeekTime != null) {
			const target = pendingSeekTime
			if (Math.abs(cur - target) > 0.12) {
				if (retryPendingSeek(v, { force: true })) {
					return
				}
			}
			pendingSeekTime = null
			pendingSeekRetryCount = 0
			pendingSeekRequestedAt = 0
		}
		seekTime.value = cur
		drawTimeline()
		videoNodeLastTime.set(props.nodeId, cur)
		if (cur > 0.1) {
			emit('update-video-settings', { currentTime: cur })
		}
		scheduleInvalidateScreenshot()
	})
	videoEl.value.addEventListener('pause', () => {
		playing.value = false
		stopRaf()
		drawTimeline()
		const v = videoEl.value
		if (v) {
			const cur = Number(v.currentTime) || 0
			videoNodeLastTime.set(props.nodeId, cur)
			if (cur > 0.1) {
				emit('update-video-settings', { currentTime: cur })
			}
		}
	})
	videoEl.value.addEventListener('play', () => {
		playing.value = true
		tick()
	})
})

onBeforeUnmount(() => {
	stopRaf()
	clearLocalMediaRetry()
	if (invalidateScreenshotTimer != null) {
		clearTimeout(invalidateScreenshotTimer)
		invalidateScreenshotTimer = null
	}
	try {
		tlRo?.disconnect()
	} catch {
		// ignore
	}
	tlRo = null
	tlCtx = null

	if (!hasActiveVideo) {
		console.log('[WorkflowVideoNode] onBeforeUnmount: no active video, skip save')
		return
	}

	const v = videoEl.value
	if (v) {
		const curTime = Number(v.currentTime) || 0
		console.log(
			'[WorkflowVideoNode] onBeforeUnmount: curTime=',
			curTime,
			'readyState=',
			v.readyState
		)

		if (curTime > 0.1) {
			videoNodeLastTime.set(props.nodeId, curTime)
			emit('update-video-settings', { currentTime: curTime })
		}

		try {
			v.removeEventListener('loadedmetadata', onLoadedMetadata)
		} catch {
			// ignore
		}
	}
})
</script>

<style scoped>
.wf-media {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 8px;
	flex-shrink: 0;
	align-self: stretch;
}

.wf-media-preview {
	width: 100%;
	flex: 0 0 auto;
	aspect-ratio: 1 / 1;
	border-radius: 6px;
	overflow: hidden;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	position: relative;
}

.wf-media-video {
	width: 100%;
	height: 100%;
	object-fit: contain;
	display: block;
}

.wf-media-poster-img {
	width: 100%;
	height: 100%;
	object-fit: contain;
	display: block;
}

.wf-media-empty {
	width: 100%;
	aspect-ratio: 1 / 1;
	border: 1px dashed var(--vscode-border);
	border-radius: 6px;
	padding: 10px;
	text-align: center;
	color: var(--vscode-fg-muted);
	background: var(--dweb-defualt);
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
}

.wf-media-hint {
	font-size: 12px;
}

.wf-media-sub {
	font-size: 11px;
	margin-top: 4px;
}

.wf-media-actions {
	display: flex;
	gap: 8px;
}

.wf-media-btn {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	padding: 6px 8px;
	cursor: pointer;
	font-size: 12px;
}

.wf-media-btn:hover {
	border-color: var(--vscode-hover-border);
	background: var(--vscode-hover-bg);
}

.wf-media-btn.ghost {
	color: var(--vscode-fg-muted);
}

.wf-media-footer {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.wf-video-toolbar {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.wf-video-row {
	display: flex;
	gap: 8px;
	align-items: center;
}

.wf-video-controller {
	flex: 1;
	min-width: 320px;
}

.wf-video-row2 {
	flex-wrap: wrap;
}

.wf-toolbar-btn {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	padding: 6px 8px;
	cursor: pointer;
	font-size: 12px;
}

.wf-toolbar-btn:hover {
	border-color: var(--vscode-hover-border);
	background: var(--vscode-hover-bg);
}

.wf-toolbar-btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.wf-video-editor-btn {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.wf-video-editor-icon {
	width: 16px;
	height: 16px;
	flex-shrink: 0;
}

.wf-timeline-canvas {
	flex: 1;
	min-width: 220px;
	height: 28px;
	border-radius: 0;
	overflow: hidden;
	cursor: pointer;
}

.wf-timeline-canvas.disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.wf-res {
	display: flex;
	align-items: center;
	gap: 6px;
}

.wf-res-input {
	width: 86px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	padding: 4px 6px;
	font-size: 12px;
}

.wf-res-x {
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.wf-file-input {
	position: absolute;
	width: 1px;
	height: 1px;
	opacity: 0;
	pointer-events: none;
}
</style>
