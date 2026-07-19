<template>
	<div ref="shellRef" class="tl-shell">
		<div class="tl-toolbar">
			<div class="tl-play-controls">
				<button class="tl-mini-btn" type="button" :disabled="isPlaying" @click="onPlay">
					播放
				</button>
				<button class="tl-mini-btn" type="button" :disabled="!isPlaying" @click="onPause">
					暂停
				</button>
				<button class="tl-mini-btn" type="button" @click="onStop">停止</button>
				<button
					class="tl-mini-btn"
					type="button"
					:class="{ active: loopEnabled }"
					@click="toggleLoop"
				>
					循环
				</button>
				<div class="tl-time-jump">
					<button class="tl-mini-btn" type="button" @click="onJumpByTime">按时间跳转</button>
					<input
						v-model="jumpHH"
						class="tl-time-input"
						type="number"
						min="0"
						step="1"
						@change="normalizeJumpTime"
					/>
					<span class="tl-time-sep">:</span>
					<input
						v-model="jumpMM"
						class="tl-time-input"
						type="number"
						min="0"
						max="59"
						step="1"
						@change="normalizeJumpTime"
					/>
					<span class="tl-time-sep">:</span>
					<input
						v-model="jumpSS"
						class="tl-time-input"
						type="number"
						min="0"
						max="59"
						step="1"
						@change="normalizeJumpTime"
					/>
				</div>
			</div>
			<div class="tl-meta">
				<span class="tl-meta-label">FPS</span>
				<input
					v-model.number="inputFps"
					class="tl-input tl-input-fps"
					type="number"
					min="1"
					max="240"
					step="1"
					@change="applyFps"
				/>
				<span class="tl-meta-label">当前帧</span>
				<input
					v-model.number="inputCurrentFrame"
					class="tl-input"
					type="number"
					min="0"
					:max="Math.max(0, frameCount - 1)"
					step="1"
					@change="applyCurrentFrame"
				/>
				<span class="tl-meta-label">时间</span>
				<span class="tl-meta-time">{{ currentTimeText }}</span>
				<span class="tl-meta-sep">/</span>
				<span class="tl-meta-label">总帧数</span>
				<input
					v-model.number="inputFrameCount"
					class="tl-input"
					type="number"
					min="1"
					step="1"
					@change="applyFrameCount"
				/>
			</div>
		</div>

		<div class="tl-body">
			<div ref="tracksRef" class="tl-tracks">
				<TimeLineContextMenu
					:visible="menuVisible"
					:x="menuX"
					:y="menuY"
					:can-add-keyframe="menuCanAddKeyframe"
					:can-remove-keyframe="menuCanRemoveKeyframe"
					:can-copy="menuCanCopy"
					:can-paste="menuCanPaste"
					:can-enable-easing="menuCanEnableEasing"
					:can-disable-easing="menuCanDisableEasing"
					:can-edit-easing-curve="menuCanEditEasingCurve"
					@add-keyframe="onMenuAddKeyframe"
					@remove-keyframe="onMenuRemoveKeyframe"
					@copy="onMenuCopy"
					@paste="onMenuPaste"
					@enable-easing="onMenuEnableEasing"
					@disable-easing="onMenuDisableEasing"
					@edit-easing-curve="onMenuEditEasingCurve"
				/>
				<!-- 指针线：显示在所有图层之上 -->
				<div class="tl-playhead" :style="{ transform: `translateX(${playheadX}px)` }">
					<div class="tl-playhead-line" />
				</div>
				<!-- 指针线命中区：允许在播放过程中拖拽调整当前帧 -->
				<div
					class="tl-playhead-hit"
					:style="{ transform: `translateX(${playheadX}px)` }"
					@pointerdown.stop.prevent="onPlayheadPointerDown"
				/>

				<!-- 框选覆盖层（只覆盖图层矩阵区域） -->
				<div
					class="tl-select-overlay"
					:style="{ top: baseRowHeight + 'px' }"
					@pointerdown.prevent
				/>
				<div v-if="boxRect" class="tl-box" :style="boxRectStyle" />

				<!-- 图像管理行（不显示滚动条样式） -->
				<div class="tl-row tl-manage">
					<div class="tl-left tl-manage-left">
						<span class="tl-manage-title">图层</span>
						<button class="tl-mini-btn" type="button" @click="addLayer">新建</button>
						<button
							class="tl-mini-btn"
							type="button"
							:disabled="selectedLayerIds.length === 0"
							@click="removeSelectedLayers"
						>
							删除
						</button>
					</div>
					<div class="tl-right">
						<div
							ref="viewportRef"
							class="tl-viewport"
							@pointerdown="onTickPointerDown"
							@wheel.prevent="onZoomWheel"
						>
							<TimeLineTickCanvas
								:frame-count="frameCount"
								:frame-width="frameWidth"
								:scroll-left="scrollLeft"
							/>
							<div
								class="tl-track"
								:style="{
									width: timelineWidth + 'px',
									transform: `translateX(${-scrollLeft}px)`
								}"
							>
								<!-- 手柄只在第一行显示 -->
								<div class="tl-playhead-handle" :style="{ left: playheadWorldX + 'px' }" />
							</div>
						</div>
					</div>
				</div>

				<!-- 图层行（可垂直滚动） -->
				<div ref="layersScrollRef" class="tl-layers-scroll" @scroll="onLayersScroll">
					<div class="tl-layers" :style="{ height: totalLayersHeight + 'px' }">
						<div v-if="layers.length === 0" class="tl-empty">点击“新建”开始创建图层</div>
						<div v-if="layers.length > 0" :style="{ height: beforeLayersHeight + 'px' }" />
						<div
							v-for="layer in visibleLayers"
							:key="layer.id"
							class="tl-row"
							:style="{ height: layerRowHeight(layer.id) + 'px' }"
							@click="selectLayer(layer.id)"
						>
							<div class="tl-left tl-layer-left" :class="{ selected: isLayerSelected(layer.id) }">
								<span class="tl-layer-name">{{ layer.name }}</span>
								<button
									v-if="isSubtitleLayer(layer.id)"
									class="tl-subtitle"
									type="button"
									@click.stop="openSubtitlePanel(layer.id)"
								>
									字幕
								</button>
								<button
									v-if="isProgressLayer(layer.id)"
									class="tl-mini-btn"
									type="button"
									@click.stop="toggleProgressDialog(layer.id)"
								>
									编辑
								</button>
								<ProgressBarEditDialog
									:open="openProgressDialogLayerId === layer.id"
									:layer-id="layer.id"
									@close="closeProgressDialog"
								/>
								<button class="tl-del" type="button" @click.stop="removeLayer(layer.id)">
									删除
								</button>
							</div>
							<div class="tl-right">
								<div class="tl-viewport tl-frames-viewport" @wheel.prevent="onZoomWheel">
									<TimeLineAudioWaveRow
										v-if="isAudioLayer(layer.id)"
										:layer-id="layer.id"
										:frame-count="frameCount"
										:frame-width="frameWidth"
										:scroll-left="scrollLeft"
										:fps="fps"
										:audio-track="audioTrackFor(layer.id)"
										:audio-version="audioVersion"
									/>
									<TimeLineProgressCanvasRow
										v-else-if="isProgressLayer(layer.id)"
										:layer-id="layer.id"
										:frame-count="frameCount"
										:frame-width="frameWidth"
										:scroll-left="scrollLeft"
										:current-frame="currentFrame"
										:selection-version="selectionVersion"
										:keyframe-version="keyframeVersion"
										:easing-segment-keys="easingSegmentKeys"
										:progress-segments="progressSegmentsFor(layer.id)"
										:progress-version="progressVersion"
										:is-frame-selected="isFrameSelected"
										:is-keyframe="(lid, fi) => timelineData.isKeyframe(lid, fi)"
										:is-between="isBetweenKeyframes"
										:is-easing-enabled="(lid, fi) => timelineData.isEasingEnabled(lid, fi)"
										:is-easing-arrow="
											(lid, fi) =>
												timelineData.isEasingEnabled(lid, fi) &&
												isBetweenKeyframes(lid, fi) &&
												timelineData.isKeyframe(lid, fi + 1)
										"
										@pointerdown="
											({ layerId, frameIndex, ev }) => onFramePointerDown(layerId, frameIndex, ev)
										"
										@dblclick="onFrameDblClick"
										@contextmenu="onFrameContextMenu"
									/>
									<TimeLineFrameCanvasRow
										v-else
										:layer-id="layer.id"
										:frame-count="frameCount"
										:frame-width="frameWidth"
										:scroll-left="scrollLeft"
										:current-frame="currentFrame"
										:selection-version="selectionVersion"
										:keyframe-version="keyframeVersion"
										:easing-segment-keys="easingSegmentKeys"
										:is-subtitle-frame="isSubtitleFrame"
										:is-subtitle-cue-start="isSubtitleCueStart"
										:get-subtitle-text-at-frame="getSubtitleTextAtFrame"
										:is-frame-selected="isFrameSelected"
										:is-keyframe="(lid, fi) => timelineData.isKeyframe(lid, fi)"
										:is-between="isBetweenKeyframes"
										:is-easing-enabled="(lid, fi) => timelineData.isEasingEnabled(lid, fi)"
										:is-easing-arrow="
											(lid, fi) =>
												timelineData.isEasingEnabled(lid, fi) &&
												isBetweenKeyframes(lid, fi) &&
												timelineData.isKeyframe(lid, fi + 1)
										"
										@pointerdown="
											({ layerId, frameIndex, ev }) => onFramePointerDown(layerId, frameIndex, ev)
										"
										@dblclick="onFrameDblClick"
										@contextmenu="onFrameContextMenu"
									/>
								</div>
								<div
									v-if="(openEasingEditorsByLayer[layer.id] ?? []).length > 0"
									class="tl-viewport tl-easing-viewport"
									:style="{ height: easingEditorHeight + 'px' }"
								>
									<div
										class="tl-track"
										:style="{
											width: timelineWidth + 'px',
											transform: `translateX(${-scrollLeft}px)`
										}"
									>
										<TimeLineEasingCurveEditor
											v-for="segmentKey in openEasingEditorsByLayer[layer.id] ?? []"
											:key="segmentKey"
											:width="easingEditorWidth(segmentKey)"
											:curve="easingCurveFor(segmentKey)"
											:style="easingEditorStyle(segmentKey)"
											@change="(curve) => setEasingCurveFor(segmentKey, curve)"
											@close="() => closeEasingEditor(segmentKey)"
										/>
									</div>
								</div>
							</div>
						</div>
						<div v-if="layers.length > 0" :style="{ height: afterLayersHeight + 'px' }" />
					</div>
				</div>
			</div>

			<!-- 底部迷你总览条：显示完整时间轴 + 当前可视区域窗口，支持拖拽平移 -->
			<div class="tl-scrollbar">
				<canvas
					ref="overviewCanvasRef"
					class="tl-overview-canvas"
					@pointerdown="onOverviewPointerDown"
					@dblclick="onOverviewDblClick"
				/>
				<div class="tl-overview-hud">
					<span class="tl-overview-label">总览</span>
					<span class="tl-overview-zoom">{{ Math.round(frameWidth * 10) / 10 }}px/f</span>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import {
	DVS_EVENTS,
	type DvsSubtitleCueSelectDetail,
	type DvsTimelineNavDetail
} from '../../core/events/dvsEvents'
import {
	stripSubtitleTextContentFromNodeSnapshots,
	stripSubtitleTextContentFromStageLayers
} from '../../core/subtitle/sanitizeStageSnapshot'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { TimelineKey, type TimelineState, type AudioTrack } from '../../store/timeline'
import type { ProgressBarSpec } from '../../core/timeline'
import {
	VideoSceneStore,
	type VideoSceneNodeProps,
	type VideoSceneNodeTransform,
	type VideoSceneTreeNode
} from '../../store/videoscene'
import {
	containsFrame,
	getPrevNext,
	rangeFullyCovered,
	rangeIntersects,
	spanEnd,
	spanStart,
	type TimelineFrameSpan
} from '../../store/timeline/spans'
import { VuexTimelineDataManager } from './core/VuexTimelineDataManager'
import { TimelineTicker } from './core/TimelineTicker'
import TimeLineContextMenu from './components/TimeLineContextMenu.vue'
import TimeLineEasingCurveEditor from './components/TimeLineEasingCurveEditor.vue'
import TimeLineFrameCanvasRow from './components/TimeLineFrameCanvasRow.vue'
import TimeLineTickCanvas from './components/TimeLineTickCanvas.vue'
import TimeLineProgressCanvasRow from './progress/TimeLineProgressCanvasRow.vue'
import TimeLineAudioWaveRow from './audio/TimeLineAudioWaveRow.vue'
import ProgressBarEditDialog from '../VideoScene/dialogs/ProgressBarEditDialog.vue'

const store = useStore<TimelineState>(TimelineKey)

const timelineData = new VuexTimelineDataManager(store)

const layers = computed(() => store.state.layers)
const frameCount = computed(() => store.state.frameCount)
const currentFrame = computed(() => store.state.currentFrame)
const frameWidth = computed(() => store.state.frameWidth)
const fps = computed(() => store.state.fps)
const selectedLayerIds = computed(() => store.state.selectedLayerIds)
const selectedSpansByLayer = computed(() => store.state.selectedSpansByLayer)
const selectionVersion = computed(() => store.state.selectionVersion)
const keyframeSpansByLayer = computed(() => store.state.keyframeSpansByLayer)
const keyframeVersion = computed(() => store.state.keyframeVersion)
const easingSegmentKeys = computed(() => store.state.easingSegmentKeys)

const progressVersion = computed(() => store.state.progressVersion ?? 0)

const isSubtitleLayer = (layerId: string) =>
	(store.state.layerKindById?.[layerId] ?? 'normal') === 'subtitle'

const isProgressLayer = (layerId: string) =>
	(store.state.layerKindById?.[layerId] ?? 'normal') === 'progress'

const isAudioLayer = (layerId: string) =>
	(store.state.layerKindById?.[layerId] ?? 'normal') === 'audio'

const audioVersion = computed(() => store.state.audioVersion ?? 0)
const audioTrackFor = (layerId: string): AudioTrack | null =>
	store.state.audioByLayerId?.[layerId] ?? null

const progressSegmentsFor = (layerId: string) => {
	const spec = store.state.progressBarByLayerId?.[layerId]
	return Array.isArray(spec?.segments) ? spec.segments : []
}

const openProgressDialogLayerId = ref<string | null>(null)
const toggleProgressDialog = (layerId: string) => {
	openProgressDialogLayerId.value = openProgressDialogLayerId.value === layerId ? null : layerId
}
const closeProgressDialog = () => {
	openProgressDialogLayerId.value = null
}

const isSubtitleFrame = (layerId: string, frameIndex: number) => {
	const spans = store.state.subtitleSpansByLayer?.[layerId] ?? []
	return containsFrame(spans, frameIndex)
}

type SubtitleCueRange = { startFrame?: number; endFrame?: number; [key: string]: unknown }

const subtitleCueStartSetByLayer = computed(() => {
	const out: Record<string, Set<number>> = {}
	const map = store.state.subtitleCueRangesByLayer ?? {}
	for (const [layerId, ranges] of Object.entries(map)) {
		const set = new Set<number>()
		const list = Array.isArray(ranges) ? (ranges as SubtitleCueRange[]) : []
		for (const r of list) {
			const s = Math.floor(Number(r?.startFrame))
			if (Number.isFinite(s)) set.add(s)
		}
		out[layerId] = set
	}
	return out
})

const subtitleCueIndexByStartFrameByLayer = computed(() => {
	const out: Record<string, Record<number, number>> = {}
	const map = store.state.subtitleCueRangesByLayer ?? {}
	for (const [layerId, ranges] of Object.entries(map)) {
		const dict: Record<number, number> = {}
		const list = Array.isArray(ranges) ? (ranges as SubtitleCueRange[]) : []
		for (let i = 0; i < list.length; i++) {
			const s = Math.floor(Number(list[i]?.startFrame))
			if (!Number.isFinite(s)) continue
			dict[s] = i
		}
		out[layerId] = dict
	}
	return out
})

const isSubtitleCueStart = (layerId: string, frameIndex: number) => {
	if (!isSubtitleLayer(layerId)) return false
	const set = subtitleCueStartSetByLayer.value[layerId]
	return !!set && set.has(frameIndex)
}

const getSubtitleTextAtFrame = (layerId: string, frameIndex: number): string | null => {
	if (!isSubtitleLayer(layerId)) return null
	const cues = store.state.subtitleCuesByLayer?.[layerId] ?? []
	const ranges = store.state.subtitleCueRangesByLayer?.[layerId] ?? []
	if (!Array.isArray(cues) || !Array.isArray(ranges) || !ranges.length) return null

	// binary search: last range with startFrame <= frameIndex
	let lo = 0
	let hi = Math.min(ranges.length, cues.length) - 1
	let hit = -1
	while (lo <= hi) {
		const mid = (lo + hi) >> 1
		const s = Number(ranges[mid]?.startFrame ?? 0)
		if (s <= frameIndex) {
			hit = mid
			lo = mid + 1
		} else {
			hi = mid - 1
		}
	}
	if (hit < 0) return null
	const end = Number(ranges[hit]?.endFrame ?? -1)
	if (frameIndex > end) return null
	return typeof cues[hit]?.text === 'string' ? cues[hit].text : null
}

// 右侧预留空间：让最后一帧不贴边（避免被底部滚动条/操作区域影响点击）
// 注意：该宽度同时用于刻度行与各图层行的“世界宽度”，保证滚动/绘制同步。
const timelineRightPaddingPx = 160
const timelineWidth = computed(() => frameCount.value * frameWidth.value + timelineRightPaddingPx)

const inputCurrentFrame = ref<number>(0)
const inputFrameCount = ref<number>(120)
const inputFps = ref<number>(60)

const jumpHH = ref<string>('00')
const jumpMM = ref<string>('00')
const jumpSS = ref<string>('00')

const isPlaying = ref(false)
const loopEnabled = ref(false)
let ticker: TimelineTicker | null = null

const clampInt = (n: number, min: number, max: number) =>
	Math.max(min, Math.min(max, Math.floor(n)))

const pad2 = (n: number) => String(clampInt(n, 0, 99)).padStart(2, '0')

const formatTimeByFrame = (frameIndex: number, fps: number) => {
	const fi = Math.max(0, Math.floor(Number(frameIndex) || 0))
	const f = clampInt(Number(fps || 30), 1, 240)
	const totalMs = Math.floor((fi * 1000) / f)
	const hh = Math.floor(totalMs / 3600000)
	const mm = Math.floor((totalMs % 3600000) / 60000)
	const ss = Math.floor((totalMs % 60000) / 1000)
	const mmm = totalMs % 1000
	return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}.${String(mmm).padStart(3, '0')}`
}

const currentTimeText = computed(() => formatTimeByFrame(currentFrame.value, inputFps.value))

watch(
	() => store.state.fps,
	(v) => {
		const next = clampInt(Number(v ?? 60), 1, 240)
		if (inputFps.value !== next) {
			inputFps.value = next
			ticker?.setFps(next)
		}
	},
	{ immediate: true }
)

const normalizeJumpTime = () => {
	const hh = clampInt(Number(jumpHH.value || 0), 0, 99)
	const mm = clampInt(Number(jumpMM.value || 0), 0, 59)
	const ss = clampInt(Number(jumpSS.value || 0), 0, 59)
	jumpHH.value = pad2(hh)
	jumpMM.value = pad2(mm)
	jumpSS.value = pad2(ss)
}

const onJumpByTime = () => {
	normalizeJumpTime()
	const hh = clampInt(Number(jumpHH.value || 0), 0, 99)
	const mm = clampInt(Number(jumpMM.value || 0), 0, 59)
	const ss = clampInt(Number(jumpSS.value || 0), 0, 59)
	const totalSeconds = hh * 3600 + mm * 60 + ss
	const fps = clampInt(Number(inputFps.value || 30), 1, 240)
	const targetFrame = totalSeconds * fps
	setCurrentFrame(targetFrame)
}

watch(
	() => currentFrame.value,
	(v) => (inputCurrentFrame.value = v),
	{ immediate: true }
)
watch(
	() => frameCount.value,
	(v) => (inputFrameCount.value = v),
	{ immediate: true }
)

const addLayer = () => {
	store.dispatch('addLayer')
	const last = store.state.layers[store.state.layers.length - 1]
	if (last) VideoSceneStore.dispatch('addLayer', { layerId: last.id, name: last.name })
}

const removeSelectedLayers = () => {
	const ids = [...store.state.selectedLayerIds]
	const audioUrls: string[] = []
	for (const id of ids) {
		if (!isAudioLayer(id)) continue
		const url = store.state.audioByLayerId?.[id]?.objectUrl
		if (typeof url === 'string' && url.trim()) audioUrls.push(url)
	}
	store.dispatch('removeSelectedLayers')
	for (const url of audioUrls) {
		try {
			URL.revokeObjectURL(url)
		} catch {
			// ignore
		}
	}
	for (const id of ids) {
		if (isAudioLayer(id)) continue
		VideoSceneStore.dispatch('removeLayer', { layerId: id })
	}
}

const removeLayer = async (layerId: string) => {
	const url = await store.dispatch('removeLayer', { layerId })
	if (typeof url === 'string' && url.trim()) {
		try {
			URL.revokeObjectURL(url)
		} catch {
			// ignore
		}
	}
	if (!isAudioLayer(layerId)) VideoSceneStore.dispatch('removeLayer', { layerId })
}

const openSubtitlePanel = (layerId: string) => {
	void VideoSceneStore.dispatch('openLeftPanel', { mode: 'subtitle', layerId })
}

const applyFrameCount = () => {
	const next = Math.max(1, Math.floor(Number(inputFrameCount.value) || 1))
	store.dispatch('setFrameCount', { frameCount: next })
}

const applyFps = () => {
	const next = clampInt(Number(inputFps.value || 30), 1, 240)
	inputFps.value = next
	store.dispatch('setFps', { fps: next })
	ticker?.setFps(next)
}

const applyCurrentFrame = () => {
	store.dispatch('setCurrentFrame', { frameIndex: Number(inputCurrentFrame.value) || 0 })
}

const setCurrentFrame = (frameIndex: number) => {
	const fc = Math.max(0, frameCount.value)
	const next = fc > 0 ? Math.max(0, Math.min(fc - 1, Math.floor(frameIndex))) : 0
	store.dispatch('setCurrentFrame', { frameIndex: next })
}

const onPlay = () => {
	// 尽量在用户手势内触发音频播放，减少 autoplay 限制的概率
	void startTimelineAudio()
	ticker?.play()
}
const onPause = () => {
	ticker?.pause()
	pauseTimelineAudio()
}
const onStop = () => {
	ticker?.stop()
	pauseTimelineAudio()
}
const toggleLoop = () => {
	loopEnabled.value = !loopEnabled.value
	ticker?.setLoop(loopEnabled.value)
}

const ensurePlayheadVisibleWhilePlaying = (fi: number) => {
	if (!isPlaying.value) return
	const el = viewportRef.value
	if (!el) return
	const vw = Math.max(0, Math.floor(el.clientWidth))
	if (vw <= 0) return
	// 允许缩到 <1px；这里必须使用真实 frameWidth，否则会把 scrollLeft clamp 到 max 导致“瞬移到最右”。
	const fw = Math.max(0.0001, Number(frameWidth.value) || 0)
	const worldX = fi * fw
	// playheadX = worldX - scrollLeft
	const x = worldX - scrollLeft.value
	// 超出右侧：最小滚动让指针落在可视区右侧边缘附近
	if (x > vw - fw) {
		commitScrollLeft(worldX - (vw - fw))
		return
	}
	// 超出左侧：最小滚动让指针落在可视区左侧边缘
	if (x < 0) commitScrollLeft(worldX)
}

const isActiveFrame = (frameIndex: number) => currentFrame.value === frameIndex

const isLayerSelected = (layerId: string) => selectedLayerIds.value.includes(layerId)

const selectLayer = (layerId: string) => {
	store.dispatch('selectLayer', { layerId })
	if (!isAudioLayer(layerId)) VideoSceneStore.dispatch('setActiveLayer', { layerId })
}

// 时间轴选中变化 -> 同步舞台当前图层
watch(
	() => store.state.selectedLayerIds[0] ?? null,
	(layerId) => {
		if (!layerId) return
		if (isAudioLayer(layerId)) return
		if (VideoSceneStore.state.activeLayerId === layerId) return
		VideoSceneStore.dispatch('setActiveLayer', { layerId })
	},
	{ immediate: true }
)

const isFrameSelected = (layerId: string, frameIndex: number) => {
	const spans = selectedSpansByLayer.value[layerId] ?? []
	return containsFrame(spans, frameIndex)
}

const layersScrollRef = ref<HTMLDivElement | null>(null)
const layersScrollTop = ref(0)
const layersViewportHeight = ref(0)
const onLayersScroll = () => {
	const el = layersScrollRef.value
	layersScrollTop.value = el ? Math.max(0, Math.floor(el.scrollTop)) : 0
	layersViewportHeight.value = el ? Math.max(0, Math.floor(el.clientHeight)) : 0
}

const baseRowHeight = 34
const easingEditorHeight = 110

type SegmentKey = string // `${layerId}:${startKeyframe}:${endKeyframe}`
const makeSegmentKey = (layerId: string, startKeyframe: number, endKeyframe: number): SegmentKey =>
	`${layerId}:${startKeyframe}:${endKeyframe}`
const parseSegmentKey = (
	k: SegmentKey
): { layerId: string; startKeyframe: number; endKeyframe: number } | null => {
	const parts = k.split(':')
	if (parts.length !== 3) return null
	const layerId = parts[0]
	const startKeyframe = Math.floor(Number(parts[1]))
	const endKeyframe = Math.floor(Number(parts[2]))
	if (!Number.isFinite(startKeyframe) || !Number.isFinite(endKeyframe)) return null
	return { layerId, startKeyframe, endKeyframe }
}

const openEasingEditors = ref<SegmentKey[]>([])

const openEasingEditorsByLayer = computed<Record<string, SegmentKey[]>>(() => {
	const out: Record<string, SegmentKey[]> = {}
	for (const k of openEasingEditors.value) {
		const parsed = parseSegmentKey(k)
		if (!parsed) continue
		if (!out[parsed.layerId]) out[parsed.layerId] = []
		out[parsed.layerId].push(k)
	}
	return out
})

const layerRowHeight = (layerId: string) => {
	const count = openEasingEditorsByLayer.value[layerId]?.length ?? 0
	return baseRowHeight + (count > 0 ? easingEditorHeight : 0)
}

const totalLayersHeight = computed(() => {
	if (layers.value.length === 0) return 0
	const layout = layerLayout.value
	const last = layout[layout.length - 1]
	return last ? last.top + last.height : 0
})

const findFirstRowIndexByY = (y: number) => {
	const layout = layerLayout.value
	if (layout.length === 0) return 0
	let lo = 0
	let hi = layout.length - 1
	let ans = layout.length
	while (lo <= hi) {
		const mid = (lo + hi) >> 1
		const row = layout[mid]
		if (row.top + row.height > y) {
			ans = mid
			hi = mid - 1
		} else {
			lo = mid + 1
		}
	}
	return Math.max(0, Math.min(layout.length - 1, ans === layout.length ? layout.length - 1 : ans))
}

const findLastRowIndexByY = (y: number) => {
	const layout = layerLayout.value
	if (layout.length === 0) return 0
	let lo = 0
	let hi = layout.length - 1
	let ans = -1
	while (lo <= hi) {
		const mid = (lo + hi) >> 1
		const row = layout[mid]
		if (row.top < y) {
			ans = mid
			lo = mid + 1
		} else {
			hi = mid - 1
		}
	}
	return Math.max(0, Math.min(layout.length - 1, ans < 0 ? 0 : ans))
}

const visibleLayerRange = computed(() => {
	const count = layers.value.length
	if (count === 0) return { start: 0, end: -1 }
	const overscanPx = 240
	const top = Math.max(0, layersScrollTop.value - overscanPx)
	const bottom = layersScrollTop.value + layersViewportHeight.value + overscanPx
	const start = findFirstRowIndexByY(top)
	const end = findLastRowIndexByY(bottom)
	return { start, end: Math.max(start, end) }
})

const visibleLayers = computed(() => {
	const { start, end } = visibleLayerRange.value
	if (end < start) return []
	return layers.value.slice(start, end + 1)
})

const beforeLayersHeight = computed(() => {
	const { start } = visibleLayerRange.value
	const layout = layerLayout.value
	return layout[start]?.top ?? 0
})

const afterLayersHeight = computed(() => {
	const { end } = visibleLayerRange.value
	const layout = layerLayout.value
	if (layout.length === 0) return 0
	const afterTop = (layout[end]?.top ?? 0) + (layout[end]?.height ?? 0)
	return Math.max(0, totalLayersHeight.value - afterTop)
})

const easingCurveFor = (segmentKey: SegmentKey) => {
	return store.state.easingCurves?.[segmentKey] ?? { x1: 0, y1: 0, x2: 1, y2: 1, preset: 'linear' }
}

const setEasingCurveFor = (
	segmentKey: SegmentKey,
	curve: { x1: number; y1: number; x2: number; y2: number; preset?: string }
) => {
	store.dispatch('setEasingCurve', { segmentKey, curve })
}

const openEasingEditor = (segmentKey: SegmentKey) => {
	if (!openEasingEditors.value.includes(segmentKey))
		openEasingEditors.value = [...openEasingEditors.value, segmentKey]
}

const closeEasingEditor = (segmentKey: SegmentKey) => {
	openEasingEditors.value = openEasingEditors.value.filter((k) => k !== segmentKey)
}

const segmentRect = (segmentKey: SegmentKey): { left: number; width: number } | null => {
	const parsed = parseSegmentKey(segmentKey)
	if (!parsed) return null
	const startFrame = parsed.startKeyframe + 1
	const endFrame = parsed.endKeyframe - 1
	if (startFrame > endFrame) return null
	const left = Math.round(startFrame * frameWidth.value)
	const width = Math.round((endFrame - startFrame + 1) * frameWidth.value)
	return { left, width }
}

const isValidOpenEasingEditor = (segmentKey: SegmentKey) => {
	const parsed = parseSegmentKey(segmentKey)
	if (!parsed) return false
	if (!store.state.easingSegmentKeys.includes(segmentKey)) return false
	// 段两端必须仍是关键帧
	if (!timelineData.isKeyframe(parsed.layerId, parsed.startKeyframe)) return false
	if (!timelineData.isKeyframe(parsed.layerId, parsed.endKeyframe)) return false
	if (parsed.startKeyframe + 1 > parsed.endKeyframe - 1) return false
	return true
}

const easingEditorWidth = (segmentKey: SegmentKey) =>
	segmentRect(segmentKey)?.width ?? Math.max(1, frameWidth.value)

const easingEditorStyle = (segmentKey: SegmentKey) => {
	const r = segmentRect(segmentKey)
	if (!r) return { display: 'none' }
	return {
		position: 'absolute',
		left: r.left + 'px',
		top: '0px'
	}
}

const isBetweenKeyframes = (layerId: string, frameIndex: number) => {
	const fi = Math.floor(Number(frameIndex))
	if (!Number.isFinite(fi)) return false
	// 关键帧本身不算“中间帧”
	if (timelineData.isKeyframe(layerId, fi)) return false
	const spans = keyframeSpansByLayer.value[layerId] ?? []
	const { prev, next } = getPrevNext(spans, fi)
	return prev != null && next != null && prev < fi && fi < next
}

// 右键菜单
type MenuState = { layerId: string; frameIndex: number; x: number; y: number } | null
const menu = ref<MenuState>(null)
const menuVisible = computed(() => menu.value != null)
const menuX = computed(() => menu.value?.x ?? 0)
const menuY = computed(() => menu.value?.y ?? 0)

// Clipboard in VuexTimelineDataManager is not reactive; bump this to refresh menu enablement.
const clipboardVersion = ref(0)

const menuCanCopy = computed(() => {
	if (!menu.value) return false
	// Only support copying a SINGLE keyframe cell for now.
	if (!timelineData.isKeyframe(menu.value.layerId, menu.value.frameIndex)) return false
	const entries = Object.entries(store.state.selectedSpansByLayer).filter(
		([, spans]) => spans && spans.length
	)
	if (entries.length !== 1) return false
	const layerId = entries[0][0]
	const spans = entries[0][1]
	if (layerId !== menu.value.layerId) return false
	if (!spans || spans.length !== 1) return false
	const s = spans[0]
	if (typeof s !== 'number') return false
	return Math.floor(s) === Math.floor(menu.value.frameIndex)
})
const menuCanPaste = computed(() => {
	void clipboardVersion.value
	return timelineData.canPaste()
})
const menuSelectedSpansByLayer = computed<Record<string, TimelineFrameSpan[]>>(() => {
	const out: Record<string, TimelineFrameSpan[]> = {}
	for (const [layerId, spans] of Object.entries(store.state.selectedSpansByLayer)) {
		if (spans && spans.length) out[layerId] = spans
	}
	// 没有选中时，降级为菜单锚点单个
	if (Object.keys(out).length === 0 && menu.value) out[menu.value.layerId] = [menu.value.frameIndex]
	return out
})

const menuCanAddKeyframe = computed(() => {
	if (!menu.value) return false
	for (const [layerId, spans] of Object.entries(menuSelectedSpansByLayer.value)) {
		const kf = keyframeSpansByLayer.value[layerId] ?? []
		for (const s of spans) {
			const a = typeof s === 'number' ? s : s.start
			const b = typeof s === 'number' ? s : s.end
			if (!rangeFullyCovered(kf, a, b)) return true
		}
	}
	return false
})
const menuCanRemoveKeyframe = computed(() => {
	if (!menu.value) return false
	for (const [layerId, spans] of Object.entries(menuSelectedSpansByLayer.value)) {
		const kf = keyframeSpansByLayer.value[layerId] ?? []
		for (const s of spans) {
			if (typeof s === 'number') {
				if (containsFrame(kf, s)) return true
			} else {
				if (rangeIntersects(kf, s.start, s.end)) return true
			}
		}
	}
	return false
})
const menuCanEnableEasing = computed(() => {
	if (!menu.value) return false
	return timelineData.canEnableEasing(menu.value.layerId, menu.value.frameIndex)
})
const menuCanDisableEasing = computed(() => {
	if (!menu.value) return false
	return timelineData.isEasingEnabled(menu.value.layerId, menu.value.frameIndex)
})

const selectedSingleSegmentKey = computed<SegmentKey | null>(() => {
	const entries = Object.entries(store.state.selectedSpansByLayer).filter(
		([, spans]) => spans && spans.length
	)
	if (entries.length !== 1) return null
	const layerId = entries[0][0]
	const spans = entries[0][1]
	if (!spans || spans.length === 0) return null
	const anyFrame = typeof spans[0] === 'number' ? spans[0] : spans[0].start
	const seg = getKeyframeSegmentBounds(layerId, anyFrame)
	if (!seg) return null

	const expectedStart = seg.startKeyframe + 1
	const expectedEnd = seg.endKeyframe - 1
	if (expectedStart > expectedEnd) return null
	// selection 必须“恰好等于”该段：覆盖完整 expected 区间，且不包含区间外的帧
	if (!rangeFullyCovered(spans, expectedStart, expectedEnd)) return null
	if (expectedStart > 0 && rangeIntersects(spans, 0, expectedStart - 1)) return null
	if (
		expectedEnd < frameCount.value - 1 &&
		rangeIntersects(spans, expectedEnd + 1, frameCount.value - 1)
	)
		return null
	return makeSegmentKey(layerId, seg.startKeyframe, seg.endKeyframe)
})

const menuCanEditEasingCurve = computed(() => {
	const segKey = selectedSingleSegmentKey.value
	if (!menu.value) return false
	if (!segKey) return false
	// 仅当该段已开启缓动时允许编辑
	return store.state.easingSegmentKeys.includes(segKey)
})

const closeMenu = () => {
	menu.value = null
}

type NodeSnapshot = { transform?: VideoSceneNodeTransform; props?: VideoSceneNodeProps }

const deepCloneFallback = <T,>(value: T, seen = new WeakMap<object, unknown>()): T => {
	if (value == null) return value
	if (typeof value !== 'object') return value
	if (value instanceof Date) return new Date(value.getTime()) as unknown as T

	const obj = value as unknown as object
	const cached = seen.get(obj)
	if (cached) return cached as T

	if (Array.isArray(value)) {
		const out: unknown[] = []
		seen.set(obj, out)
		for (const item of value) out.push(deepCloneFallback(item, seen))
		return out as unknown as T
	}

	const proto = Object.getPrototypeOf(obj)
	const out: Record<string, unknown> =
		proto === null ? (Object.create(null) as Record<string, unknown>) : {}
	seen.set(obj, out)
	for (const k of Object.keys(obj))
		out[k] = deepCloneFallback((obj as Record<string, unknown>)[k], seen)
	return out as unknown as T
}

const cloneJsonSafe = <T,>(v: T): T => {
	try {
		return JSON.parse(JSON.stringify(v)) as T
	} catch {
		try {
			return (globalThis as { structuredClone?: <T>(v: T) => T }).structuredClone
				? ((globalThis as { structuredClone: <T>(v: T) => T }).structuredClone(v) as T)
				: deepCloneFallback(v)
		} catch {
			return deepCloneFallback(v)
		}
	}
}

const collectUserNodeSnapshots = (
	nodes: VideoSceneTreeNode[] | undefined,
	out: Record<string, NodeSnapshot>
) => {
	if (!nodes) return
	for (const n of nodes) {
		if (n.category === 'user') {
			out[n.id] = {
				transform: n.transform ? { ...n.transform } : undefined,
				props: n.props ? cloneJsonSafe(n.props) : undefined
			}
		}
		if (n.children?.length) collectUserNodeSnapshots(n.children, out)
	}
}

const captureLayerSnapshot = (layerId: string): Record<string, NodeSnapshot> => {
	const layer = VideoSceneStore.state.layers.find((l) => l.id === layerId)
	if (!layer) return {}
	const out: Record<string, NodeSnapshot> = {}
	collectUserNodeSnapshots(layer.nodeTree, out)
	return out
}

const parseCellKey = (key: string): { layerId: string; frameIndex: number } | null => {
	const parts = key.split(':')
	if (parts.length !== 2) return null
	const layerId = parts[0]
	const frameIndex = Number(parts[1])
	if (!Number.isFinite(frameIndex)) return null
	return { layerId, frameIndex: Math.floor(frameIndex) }
}

const getKeyframeSegmentBounds = (
	layerId: string,
	frameIndex: number
): { startKeyframe: number; endKeyframe: number } | null => {
	const fi = Math.floor(Number(frameIndex))
	if (!Number.isFinite(fi)) return null
	if (timelineData.isKeyframe(layerId, fi)) return null
	const spans = keyframeSpansByLayer.value[layerId] ?? []
	const { prev, next } = getPrevNext(spans, fi)
	if (prev == null || next == null) return null
	if (!(prev < fi && fi < next)) return null
	return { startKeyframe: prev, endKeyframe: next }
}

const onFrameContextMenu = (payload: {
	layerId: string
	frameIndex: number
	clientX: number
	clientY: number
}) => {
	// 右键：不取消多选；若右键点在未选中格子上，则切换为单选该格子
	if (!isFrameSelected(payload.layerId, payload.frameIndex)) {
		// 合并段内也允许“单帧右键单选”，便于对某一帧单独设置关键帧
		store.dispatch('toggleCellSelection', {
			layerId: payload.layerId,
			frameIndex: payload.frameIndex,
			additive: false
		})
	}
	// 右键不移动指针位置
	menu.value = {
		layerId: payload.layerId,
		frameIndex: payload.frameIndex,
		x: payload.clientX,
		y: payload.clientY
	}
}

const onFrameDblClick = (payload: { layerId: string; frameIndex: number; ev: MouseEvent }) => {
	closeMenu()
	const seg = getKeyframeSegmentBounds(payload.layerId, payload.frameIndex)
	if (!seg) return
	const startFrame = seg.startKeyframe + 1
	const endFrame = seg.endKeyframe - 1
	if (startFrame > endFrame) return
	store.dispatch('addRangeSelection', {
		layerIds: [payload.layerId],
		startFrame,
		endFrame,
		additive: false
	})

	// Subtitle linkage: dblclick easing segment -> select & scroll to matching cue in left subtitle editor
	if (isSubtitleLayer(payload.layerId)) {
		openSubtitlePanel(payload.layerId)
		const idx = subtitleCueIndexByStartFrameByLayer.value[payload.layerId]?.[seg.startKeyframe]
		if (Number.isFinite(idx)) {
			const detail: DvsSubtitleCueSelectDetail = {
				layerId: payload.layerId,
				cueIndex: Math.max(0, Math.floor(Number(idx))),
				reason: 'timeline'
			}
			window.dispatchEvent(new CustomEvent(DVS_EVENTS.SubtitleCueSelect, { detail }))
		}
	}
}

const onMenuAddKeyframe = () => {
	if (!menu.value) return
	// 关键帧遵循“全画布快照”规则：记录当时舞台的所有图层/节点树
	const stageLayers = cloneJsonSafe(VideoSceneStore.state.layers)
	for (const [layerId, spans] of Object.entries(menuSelectedSpansByLayer.value)) {
		for (const s of spans) {
			const a = typeof s === 'number' ? s : s.start
			const b = typeof s === 'number' ? s : s.end
			store.dispatch('addKeyframeRange', { layerId, startFrame: a, endFrame: b })
			const layersForSnapshot = isSubtitleLayer(layerId)
				? stripSubtitleTextContentFromStageLayers(cloneJsonSafe(stageLayers), layerId)
				: stageLayers
			store.dispatch('setStageKeyframeSnapshotRange', {
				startFrame: a,
				endFrame: b,
				layers: layersForSnapshot
			})

			if (isSubtitleLayer(layerId)) {
				const nodesById = stripSubtitleTextContentFromNodeSnapshots(captureLayerSnapshot(layerId))
				store.dispatch('setNodeKeyframeSnapshotRange', {
					layerId,
					startFrame: a,
					endFrame: b,
					nodesById
				})
			}
		}
	}
	closeMenu()
}

const onMenuRemoveKeyframe = () => {
	if (!menu.value) return
	for (const [layerId, spans] of Object.entries(menuSelectedSpansByLayer.value)) {
		for (const s of spans) {
			const a = typeof s === 'number' ? s : s.start
			const b = typeof s === 'number' ? s : s.end
			store.dispatch('removeKeyframeRange', { layerId, startFrame: a, endFrame: b })
		}
	}
	closeMenu()
}

const onMenuCopy = () => {
	if (!menu.value) return
	timelineData.copyFrame(menu.value.layerId, menu.value.frameIndex)
	clipboardVersion.value++
	closeMenu()
}

const onMenuPaste = () => {
	if (!menu.value) return
	const targets: { layerId: string; frameIndex: number }[] = []
	const maxTargets = 2000
	let truncated = false
	for (const [layerId, spans] of Object.entries(menuSelectedSpansByLayer.value)) {
		for (const s of spans) {
			if (typeof s === 'number') {
				targets.push({ layerId, frameIndex: s })
				if (targets.length >= maxTargets) {
					truncated = true
					break
				}
				continue
			}
			for (let f = s.start; f <= s.end; f++) {
				targets.push({ layerId, frameIndex: f })
				if (targets.length >= maxTargets) {
					truncated = true
					break
				}
			}
			if (truncated) break
		}
		if (truncated) break
	}
	for (const t of targets) timelineData.pasteFrame(t.layerId, t.frameIndex)
	clipboardVersion.value++
	closeMenu()
}

const onMenuEnableEasing = () => {
	if (!menu.value) return
	const targets: { layerId: string; frameIndex: number }[] = []
	const maxTargets = 2000
	let truncated = false
	for (const [layerId, spans] of Object.entries(menuSelectedSpansByLayer.value)) {
		for (const s of spans) {
			if (typeof s === 'number') {
				targets.push({ layerId, frameIndex: s })
				if (targets.length >= maxTargets) {
					truncated = true
					break
				}
				continue
			}
			for (let f = s.start; f <= s.end; f++) {
				targets.push({ layerId, frameIndex: f })
				if (targets.length >= maxTargets) {
					truncated = true
					break
				}
			}
			if (truncated) break
		}
		if (truncated) break
	}
	for (const t of targets) {
		if (!timelineData.canEnableEasing(t.layerId, t.frameIndex)) continue
		timelineData.enableEasing(t.layerId, t.frameIndex)
	}
	closeMenu()
}

const onMenuDisableEasing = () => {
	if (!menu.value) return
	const targets: { layerId: string; frameIndex: number }[] = []
	const maxTargets = 2000
	let truncated = false
	for (const [layerId, spans] of Object.entries(menuSelectedSpansByLayer.value)) {
		for (const s of spans) {
			if (typeof s === 'number') {
				targets.push({ layerId, frameIndex: s })
				if (targets.length >= maxTargets) {
					truncated = true
					break
				}
				continue
			}
			for (let f = s.start; f <= s.end; f++) {
				targets.push({ layerId, frameIndex: f })
				if (targets.length >= maxTargets) {
					truncated = true
					break
				}
			}
			if (truncated) break
		}
		if (truncated) break
	}
	for (const t of targets) timelineData.disableEasing(t.layerId, t.frameIndex)
	closeMenu()
}

const onMenuEditEasingCurve = () => {
	if (!menu.value) return
	const segKey = selectedSingleSegmentKey.value
	if (!segKey) {
		closeMenu()
		return
	}
	if (!store.state.easingSegmentKeys.includes(segKey)) {
		closeMenu()
		return
	}
	openEasingEditor(segKey)
	closeMenu()
}

const onFrameClick = (layerId: string, frameIndex: number, ev: MouseEvent) => {
	store.dispatch('toggleCellSelection', { layerId, frameIndex, additive: ev.ctrlKey })
	setCurrentFrame(frameIndex)
}

const tracksRef = ref<HTMLDivElement | null>(null)
const viewportRef = ref<HTMLDivElement | null>(null)
const shellRef = ref<HTMLDivElement | null>(null)
const overviewCanvasRef = ref<HTMLCanvasElement | null>(null)
const scrollLeft = ref(0)
const viewportWidth = ref(0)
const maxScrollLeft = computed(() => Math.max(0, timelineWidth.value - viewportWidth.value))

const scrollByHalfViewport = (dir: -1 | 1) => {
	// 步长固定为“可视区域的一半”，随缩放（frameWidth/viewportWidth）自动变化
	const step = Math.max(1, Math.floor(viewportWidth.value / 2))
	commitScrollLeft(scrollLeft.value + dir * step)
}

const playheadWorldX = computed(() => Math.round(currentFrame.value * frameWidth.value))
const playheadX = computed(() => Math.round(playheadWorldX.value - scrollLeft.value))

const syncViewportMetrics = () => {
	const el = viewportRef.value
	if (!el) return
	viewportWidth.value = el.clientWidth
	if (scrollLeft.value > maxScrollLeft.value) scrollLeft.value = maxScrollLeft.value
	scheduleOverviewDraw()
}

// ===== 迷你总览条（overview / minimap）=====
const overviewWidth = ref(0)
const OVERVIEW_HEIGHT = 20

const cssColor = (name: string, fallback: string): string => {
	if (typeof document === 'undefined') return fallback
	const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
	return v || fallback
}
const parseHex = (hex: string): { r: number; g: number; b: number } | null => {
	const h = hex.replace('#', '')
	if (h.length !== 6) return null
	const n = parseInt(h, 16)
	return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}
const rgba = (c: { r: number; g: number; b: number }, a: number) =>
	`rgba(${c.r}, ${c.g}, ${c.b}, ${a})`
const mixRgba = (hex: string, a: number, fallback = '#1f9d84') => {
	const parsed = parseHex(hex) || parseHex(fallback) || { r: 31, g: 157, b: 132 }
	return rgba(parsed, a)
}

let overviewRaf = 0
const scheduleOverviewDraw = () => {
	if (overviewRaf) return
	overviewRaf = requestAnimationFrame(() => {
		overviewRaf = 0
		drawOverview()
	})
}

const drawOverview = () => {
	const canvas = overviewCanvasRef.value
	if (!canvas) return
	const parent = canvas.parentElement
	if (!parent) return
	const dpr = window.devicePixelRatio || 1
	const w = parent.clientWidth
	const h = OVERVIEW_HEIGHT
	if (w <= 0) return
	if (overviewWidth.value !== w) {
		overviewWidth.value = w
		canvas.width = Math.floor(w * dpr)
		canvas.height = Math.floor(h * dpr)
		canvas.style.width = w + 'px'
		canvas.style.height = h + 'px'
	}
	const ctx = canvas.getContext('2d')
	if (!ctx) return
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	ctx.clearRect(0, 0, w, h)

	const accent = cssColor('--pl-accent', '#1f9d84')
	const bg0 = cssColor('--pl-bg-0', '#0d1518')
	const bg1 = cssColor('--pl-bg-1', '#111a22')
	const warm = cssColor('--pl-warm', '#e5b567')
	const cold = cssColor('--pl-cold', '#3aa8b4')

	// 背景
	ctx.fillStyle = mixRgba(bg0, 0.95)
	ctx.fillRect(0, 0, w, h)

	// 细扫描线
	ctx.fillStyle = mixRgba(accent, 0.06)
	for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1)

	// 绘制各图层关键帧段（密度条）
	const fc = Math.max(1, frameCount.value)
	const ls = layers.value
	const layerCount = ls.length
	const kfMap = store.state.keyframeSpansByLayer ?? {}
	if (layerCount > 0) {
		const rowH = Math.max(1, (h - 6) / layerCount)
		for (let i = 0; i < layerCount; i++) {
			const layer = ls[i]
			if (!layer) continue
			const y = 3 + i * rowH
			const kind = store.state.layerKindById?.[layer.id] ?? 'normal'
			// 行底色
			ctx.fillStyle = mixRgba(bg1, 0.5)
			ctx.fillRect(2, y, w - 4, Math.max(1, rowH - 1))

			// 关键帧段
			const spans: TimelineFrameSpan[] = kfMap[layer.id] ?? []
			if (spans.length > 0) {
				const segColor = kind === 'audio' ? cold : kind === 'progress' ? cold : warm
				ctx.fillStyle = mixRgba(segColor, 0.6)
				for (const s of spans) {
					const s0 = spanStart(s)
					const s1 = spanEnd(s)
					const x0 = (Math.max(0, s0) / fc) * w
					const x1 = ((Math.min(fc - 1, s1) + 1) / fc) * w
					ctx.fillRect(x0, y + 1, Math.max(1, x1 - x0), Math.max(1, rowH - 3))
				}
			}
		}
	}

	// 可视区域窗口
	const tw = Math.max(1, timelineWidth.value)
	const vw = Math.max(0, viewportWidth.value)
	const sl = Math.max(0, scrollLeft.value)
	const winX = (sl / tw) * w
	const winW = Math.max(8, (vw / tw) * w)

	// 窗口阴影背景（非可视区域暗化）
	ctx.fillStyle = 'rgba(0,0,0,0.35)'
	ctx.fillRect(0, 0, winX, h)
	ctx.fillRect(winX + winW, 0, Math.max(0, w - winX - winW), h)

	// 窗口边框
	ctx.strokeStyle = accent
	ctx.lineWidth = 1
	ctx.shadowColor = mixRgba(accent, 0.8)
	ctx.shadowBlur = 4
	ctx.strokeRect(winX + 0.5, 0.5, Math.max(1, winW - 1), h - 1)
	ctx.shadowBlur = 0

	// 窗口填充
	ctx.fillStyle = mixRgba(accent, 0.10)
	ctx.fillRect(winX, 0, winW, h)

	// 播放头
	const phX = (currentFrame.value / fc) * w
	ctx.strokeStyle = accent
	ctx.lineWidth = 1
	ctx.shadowColor = mixRgba(accent, 0.9)
	ctx.shadowBlur = 3
	ctx.beginPath()
	ctx.moveTo(phX, 0)
	ctx.lineTo(phX, h)
	ctx.stroke()
	ctx.shadowBlur = 0

	// 上下边细线
	ctx.fillStyle = mixRgba(accent, 0.4)
	ctx.fillRect(0, 0, w, 1)
	ctx.fillRect(0, h - 1, w, 1)
}

// overview 交互：拖拽窗口平移，点击跳转
type OverviewDragMode = null | 'window' | 'left' | 'right'
let overviewDrag: OverviewDragMode = null
let overviewDragStartX = 0
let overviewDragStartScroll = 0

const onOverviewPointerDown = (ev: PointerEvent) => {
	const canvas = overviewCanvasRef.value
	if (!canvas) return
	const rect = canvas.getBoundingClientRect()
	const x = ev.clientX - rect.left
	const tw = Math.max(1, timelineWidth.value)
	const w = rect.width
	const sl = Math.max(0, scrollLeft.value)
	const vw = Math.max(0, viewportWidth.value)
	const winX = (sl / tw) * w
	const winW = Math.max(8, (vw / tw) * w)
	const edge = 6

	// 判定交互类型
	if (x < winX - 1) {
		// 点击窗口左侧空白：直接以该点为中心跳转
		const worldX = (x / w) * tw
		commitScrollLeft(worldX - vw / 2)
		overviewDrag = 'window'
	} else if (x > winX + winW + 1) {
		const worldX = (x / w) * tw
		commitScrollLeft(worldX - vw / 2)
		overviewDrag = 'window'
	} else if (x <= winX + edge) {
		overviewDrag = 'left'
	} else if (x >= winX + winW - edge) {
		overviewDrag = 'right'
	} else {
		overviewDrag = 'window'
	}
	overviewDragStartX = ev.clientX
	overviewDragStartScroll = scrollLeft.value
	canvas.setPointerCapture(ev.pointerId)
	const onMove = (e: PointerEvent) => {
		const dx = e.clientX - overviewDragStartX
		const pixelsPerPxW = tw / w
		const worldDx = dx * pixelsPerPxW
		if (overviewDrag === 'window') {
			commitScrollLeft(overviewDragStartScroll + worldDx)
		} else if (overviewDrag === 'left') {
			// 拖拽左边缘 → 缩放：用左边缘新位置换算 frameWidth
			const newWinX = winX + dx
			const newWinW = Math.max(20, winX + winW - newWinX)
			const newFrameWidth = (vw / newWinW) * w / frameCount.value
			const clamped = Math.max(0.05, Math.min(30, newFrameWidth))
			store.dispatch('setFrameWidth', { frameWidth: clamped })
		} else if (overviewDrag === 'right') {
			const newWinW = Math.max(20, winW + dx)
			const newFrameWidth = (vw / newWinW) * w / frameCount.value
			const clamped = Math.max(0.05, Math.min(30, newFrameWidth))
			store.dispatch('setFrameWidth', { frameWidth: clamped })
		}
	}
	const onUp = () => {
		overviewDrag = null
		window.removeEventListener('pointermove', onMove)
		window.removeEventListener('pointerup', onUp)
	}
	window.addEventListener('pointermove', onMove)
	window.addEventListener('pointerup', onUp, { once: true })
}

const onOverviewDblClick = (ev: MouseEvent) => {
	// 双击总览条：自适应缩放（让整段时间轴刚好充满可视区域）
	const vw = Math.max(1, viewportWidth.value)
	const fc = Math.max(1, frameCount.value)
	const targetFw = (vw - 40) / fc
	store.dispatch('setFrameWidth', { frameWidth: Math.max(0.05, Math.min(15, targetFw)) })
	commitScrollLeft(0)
}

let tracksResizeObserver: ResizeObserver | null = null

// 统一的 resize 处理：双 RAF 确保 DOM 布局稳定后再重算尺寸并触发 canvas 重绘
const onAnyResize = () => {
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			syncViewportMetrics()
			onLayersScroll()
		})
	})
}

let scrollRaf = 0
let pendingScrollLeft: number | null = null
const commitScrollLeft = (v: number) => {
	scrollLeft.value = Math.max(0, Math.min(maxScrollLeft.value, Math.floor(v)))
}

const centerOnFrame = (frameIndex: number) => {
	const fw = Number(frameWidth.value) || 0
	if (!Number.isFinite(fw) || fw <= 0) return
	const vw = Math.max(1, Math.floor(viewportWidth.value) || 1)
	const worldX = frameIndex * fw
	commitScrollLeft(worldX - vw / 2)
}

// 滚轮缩放：改变每帧宽度（允许缩到 < 1px 以全览超长时间轴）
const onZoomWheel = (ev: WheelEvent) => {
	closeMenu()
	const zoomIn = ev.deltaY < 0
	const base = zoomIn ? 1.12 : 1 / 1.12
	const fast = ev.ctrlKey || ev.metaKey ? (zoomIn ? 1.25 : 1 / 1.25) : 1
	const nextFw = frameWidth.value * base * fast
	store.dispatch('setFrameWidth', { frameWidth: nextFw })
	// keep the visual center at playhead
	// note: we compute with nextFw so it feels immediate
	const clampedFw = Math.max(0.0001, Math.min(15, Number(nextFw) || 0))
	const vw = Math.max(1, Math.floor(viewportWidth.value) || 1)
	const worldX = currentFrame.value * clampedFw
	const nextTimelineWidth = frameCount.value * clampedFw + timelineRightPaddingPx
	const nextMaxScrollLeft = Math.max(0, nextTimelineWidth - vw)
	const nextScroll = Math.max(0, Math.min(nextMaxScrollLeft, worldX - vw / 2))
	scrollLeft.value = Math.floor(nextScroll)
}

// 指针线拖动（手柄在第一行）
const uiFocus = computed(() => store.state.uiFocus ?? null)

const activeAudioLayerId = computed(() => {
	const sel = store.state.selectedLayerIds?.[0]
	if (sel && isAudioLayer(sel)) return sel
	for (const l of store.state.layers) {
		if (isAudioLayer(l.id)) return l.id
	}
	return null
})

const activeAudioTrack = computed(() => {
	const id = activeAudioLayerId.value
	if (!id) return null
	return store.state.audioByLayerId?.[id] ?? null
})

const audioEl = ref<HTMLAudioElement | null>(null)

const syncAudioToFrame = (fi: number, force = false) => {
	const el = audioEl.value
	const track = activeAudioTrack.value
	if (!el || !track) return
	const f = Math.max(1, Math.floor(Number(fps.value) || 60))
	const dur = Math.max(0, Number(track.durationSec) || 0)
	if (!(dur > 0)) return
	const t = Math.max(0, fi) / f
	const next = Math.max(0, Math.min(dur, t))
	const threshold = force ? 0 : 0.06
	if (Math.abs((el.currentTime || 0) - next) > threshold) {
		try {
			el.currentTime = next
		} catch {
			// ignore
		}
	}
}

const startTimelineAudio = async () => {
	if (!activeAudioTrack.value) return
	const el = audioEl.value
	if (!el) return
	syncAudioToFrame(currentFrame.value, true)
	try {
		await el.play()
	} catch {
		// ignore autoplay restrictions
	}
}

const pauseTimelineAudio = () => {
	const el = audioEl.value
	if (!el) return
	try {
		el.pause()
	} catch {
		// ignore
	}
}

watch(
	() => activeAudioTrack.value?.objectUrl ?? null,
	(url) => {
		const prev = audioEl.value
		if (prev) {
			try {
				prev.pause()
			} catch {
				// ignore
			}
		}
		if (typeof url !== 'string' || !url.trim()) {
			audioEl.value = null
			return
		}
		const el = new Audio(url)
		el.preload = 'auto'
		audioEl.value = el
	},
	{ immediate: true }
)

watch(
	() => activeAudioTrack.value?.objectUrl ?? null,
	() => {
		// 资源切换时，若正在播放则尝试立即同步一次
		if (isPlaying.value) void startTimelineAudio()
	}
)

let playheadDragging = false

const onPlayheadPointerDown = (ev: PointerEvent) => {
	closeMenu()
	if (ev.button !== 0) return
	playheadDragging = true
	store.dispatch('setScrubbing', { isScrubbing: true })
	try {
		;(ev.currentTarget as HTMLElement)?.setPointerCapture?.(ev.pointerId)
	} catch {
		// ignore
	}
	setCurrentFrame(calcFrameFromClientX(ev.clientX))

	const onMove = (e: PointerEvent) => {
		if (!playheadDragging) return
		setCurrentFrame(calcFrameFromClientX(e.clientX))
	}
	const onUp = (e: PointerEvent) => {
		playheadDragging = false
		store.dispatch('setScrubbing', { isScrubbing: false })
		try {
			;(ev.currentTarget as HTMLElement)?.releasePointerCapture?.(ev.pointerId)
		} catch {
			// ignore
		}
		window.removeEventListener('pointermove', onMove)
		window.removeEventListener('pointerup', onUp)
		window.removeEventListener('pointercancel', onUp)
		// 没拖动：当作点击
		if (!Number.isNaN(e.clientX)) setCurrentFrame(calcFrameFromClientX(e.clientX))
	}
	window.addEventListener('pointermove', onMove)
	window.addEventListener('pointerup', onUp)
	window.addEventListener('pointercancel', onUp)
}

// 刻度区拖拽：选择“所有图层对应帧块”
let tickDragging = false
let tickStartFrame = 0
let tickMoved = false
let tickAdditive = false

const calcFrameFromClientX = (clientX: number) => {
	const el = viewportRef.value
	if (!el) return currentFrame.value
	const rect = el.getBoundingClientRect()
	const x = clientX - rect.left
	const worldX = x + scrollLeft.value
	const fi = Math.round(worldX / frameWidth.value)
	return Math.max(0, Math.min(frameCount.value - 1, fi))
}

const onTickPointerDown = (ev: PointerEvent) => {
	closeMenu()
	if (ev.button !== 0) return

	const el = viewportRef.value
	if (!el) return

	const startFrame = calcFrameFromClientX(ev.clientX)

	// 需要按下 Ctrl 才进入“指针多选模式”；否则为单指针拖动
	if (!ev.ctrlKey) {
		playheadDragging = true
		store.dispatch('setScrubbing', { isScrubbing: true })
		;(ev.currentTarget as HTMLElement)?.setPointerCapture?.(ev.pointerId)
		setCurrentFrame(startFrame)

		const onMove = (e: PointerEvent) => {
			if (!playheadDragging) return
			setCurrentFrame(calcFrameFromClientX(e.clientX))
		}
		const onUp = (e: PointerEvent) => {
			playheadDragging = false
			store.dispatch('setScrubbing', { isScrubbing: false })
			try {
				;(ev.currentTarget as HTMLElement)?.releasePointerCapture?.(ev.pointerId)
			} catch {
				// ignore
			}
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
			window.removeEventListener('pointercancel', onUp)
		}
		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
		window.addEventListener('pointercancel', onUp)
		return
	}

	tickDragging = true
	tickMoved = false
	tickAdditive = true
	tickStartFrame = startFrame
	;(ev.currentTarget as HTMLElement)?.setPointerCapture?.(ev.pointerId)

	const onMove = (e: PointerEvent) => {
		if (!tickDragging) return
		const dx = e.clientX - ev.clientX
		if (!tickMoved && dx * dx < 16) return
		tickMoved = true
		const endFrame = calcFrameFromClientX(e.clientX)
		const layerIds = layers.value.map((l) => l.id)
		if (layerIds.length) {
			store.dispatch('addRangeSelection', {
				layerIds,
				startFrame: tickStartFrame,
				endFrame,
				additive: tickAdditive
			})
		}
		setCurrentFrame(endFrame)
	}
	const onUp = (e: PointerEvent) => {
		tickDragging = false
		try {
			;(ev.currentTarget as HTMLElement)?.releasePointerCapture?.(ev.pointerId)
		} catch {
			// ignore
		}
		window.removeEventListener('pointermove', onMove)
		window.removeEventListener('pointerup', onUp)
		window.removeEventListener('pointercancel', onUp)
		// 没拖动：当作移动指针
		if (!tickMoved) setCurrentFrame(calcFrameFromClientX(e.clientX))
	}
	window.addEventListener('pointermove', onMove)
	window.addEventListener('pointerup', onUp)
	window.addEventListener('pointercancel', onUp)
}

// 框选逻辑（矩阵区域）：
const layerLayout = computed(() => {
	let y = 0
	return layers.value.map((l) => {
		const h = layerRowHeight(l.id)
		const top = y
		y += h
		return { layerId: l.id, top, height: h }
	})
})

type BoxWorldRect = { x0: number; y0: number; x1: number; y1: number }
const boxRect = ref<BoxWorldRect | null>(null)

const boxRectStyle = computed(() => {
	const r = boxRect.value
	const overlay = getOverlayRect()
	if (!r || !overlay) return { display: 'none' }

	const xMin = Math.min(r.x0, r.x1)
	const xMax = Math.max(r.x0, r.x1)
	const yMin = Math.min(r.y0, r.y1)
	const yMax = Math.max(r.y0, r.y1)

	// world -> view
	const vx0 = xMin - scrollLeft.value
	const vx1 = xMax - scrollLeft.value
	const vy0 = yMin - layersScrollTop.value
	const vy1 = yMax - layersScrollTop.value

	// intersect with viewport
	const ix0 = Math.max(0, Math.min(overlay.width, Math.min(vx0, vx1)))
	const ix1 = Math.max(0, Math.min(overlay.width, Math.max(vx0, vx1)))
	const iy0 = Math.max(0, Math.min(overlay.height, Math.min(vy0, vy1)))
	const iy1 = Math.max(0, Math.min(overlay.height, Math.max(vy0, vy1)))

	const w = ix1 - ix0
	const h = iy1 - iy0
	if (w <= 0 || h <= 0) return { display: 'none' }
	return {
		left: 180 + ix0 + 'px',
		top: baseRowHeight + iy0 + 'px',
		width: w + 'px',
		height: h + 'px'
	}
})

let boxDragging = false
let boxStartWorld: { x: number; y: number } | null = null
let boxMoved = false
let boxAdditive = false
let boxShiftMode = false

type FramePointerState = {
	layerId: string
	frameIndex: number
	startX: number
	startY: number
	pointerId: number
}

let framePointer: FramePointerState | null = null

const onGlobalPointerDown = (e: PointerEvent) => {
	// 右键弹出菜单时不立即关闭
	if (e.button === 2) return
	// 点击菜单内部：不要提前关闭（否则会导致菜单按钮 click 不触发）
	if (menu.value) {
		const path = (typeof e.composedPath === 'function' ? e.composedPath() : []) as EventTarget[]
		const inMenu = path.some((t) => t instanceof HTMLElement && t.classList.contains('tl-menu'))
		if (inMenu) return
	}
	closeMenu()
}

const onGlobalKeydown = (e: KeyboardEvent) => {
	if (e.key === 'Escape') closeMenu()

	const target = e.target
	const isTyping =
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		(target instanceof HTMLElement && target.isContentEditable)

	if (
		(e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') &&
		(uiFocus.value === 'timeline' || uiFocus.value === 'stage') &&
		!isTyping
	) {
		e.preventDefault()
		if (isPlaying.value) onPause()
		else onPlay()
	}
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

const getOverlayRect = () => {
	const el = tracksRef.value
	if (!el) return null
	const rect = el.getBoundingClientRect()
	// overlay 覆盖“图层矩阵区域”(排除第一行管理行)，并排除左侧列宽
	return {
		left: rect.left + 180,
		top: rect.top + baseRowHeight,
		width: rect.width - 180,
		height: rect.height - baseRowHeight
	}
}

const frameAtWorldX = (worldX: number) =>
	clamp(Math.floor(worldX / frameWidth.value), 0, frameCount.value - 1)

const layerIndexAtWorldY = (worldY: number) => {
	const yy = Math.max(0, worldY)
	return findFirstRowIndexByY(yy)
}

const hasAnySelectedCells = () => {
	for (const spans of Object.values(store.state.selectedSpansByLayer)) {
		if (spans && spans.length) return true
	}
	return false
}

const onFramePointerDown = (layerId: string, frameIndex: number, ev: PointerEvent) => {
	closeMenu()
	if (ev.button !== 0) return
	const overlay = getOverlayRect()
	if (!overlay) return

	// 禁用浏览器原生选中文本
	ev.preventDefault()

	framePointer = {
		layerId,
		frameIndex,
		startX: ev.clientX,
		startY: ev.clientY,
		pointerId: ev.pointerId
	}
	boxDragging = true
	boxMoved = false
	boxShiftMode = false
	boxAdditive = ev.ctrlKey

	// Shift：区域多选（默认包含最后选中帧块）
	if (ev.shiftKey && hasAnySelectedCells() && store.state.lastSelectedCellKey) {
		const parsed = parseCellKey(store.state.lastSelectedCellKey)
		if (parsed) {
			const li = layers.value.findIndex((l) => l.id === parsed.layerId)
			if (li >= 0) {
				boxShiftMode = true
				boxAdditive = false
				const anchorXWorld = parsed.frameIndex * frameWidth.value
				const anchorYWorld = layerLayout.value[li]?.top ?? 0
				boxStartWorld = { x: anchorXWorld, y: anchorYWorld }
				boxRect.value = {
					x0: anchorXWorld,
					y0: anchorYWorld,
					x1: anchorXWorld + frameWidth.value,
					y1: anchorYWorld + baseRowHeight
				}
				boxMoved = true
			}
		}
	}

	if (!boxStartWorld) {
		const x = clamp(ev.clientX - overlay.left, 0, overlay.width)
		const y = clamp(ev.clientY - overlay.top, 0, overlay.height)
		const worldX = x + scrollLeft.value
		const worldY = y + layersScrollTop.value
		boxStartWorld = { x: worldX, y: worldY }
		boxRect.value = null
	}
	;(ev.currentTarget as HTMLElement)?.setPointerCapture?.(ev.pointerId)

	const onMove = (e: PointerEvent) => {
		if (!boxDragging || !boxStartWorld) return
		const x2 = clamp(e.clientX - overlay.left, 0, overlay.width)
		const y2 = clamp(e.clientY - overlay.top, 0, overlay.height)
		const worldX2 = x2 + scrollLeft.value
		const worldY2 = y2 + layersScrollTop.value
		const dx = worldX2 - boxStartWorld.x
		const dy = worldY2 - boxStartWorld.y
		const threshold2 = 4 * 4
		if (!boxMoved && dx * dx + dy * dy < threshold2) return
		boxMoved = true

		boxRect.value = { x0: boxStartWorld.x, y0: boxStartWorld.y, x1: worldX2, y1: worldY2 }
		if (layers.value.length === 0) return

		const xMin = Math.min(boxStartWorld.x, worldX2)
		const xMax = Math.max(boxStartWorld.x, worldX2)
		const yMin = Math.min(boxStartWorld.y, worldY2)
		const yMax = Math.max(boxStartWorld.y, worldY2)

		const startFrame = frameAtWorldX(xMin)
		const endFrame = frameAtWorldX(xMax)
		const li0 = clamp(layerIndexAtWorldY(yMin), 0, Math.max(0, layers.value.length - 1))
		const li1 = clamp(layerIndexAtWorldY(yMax), 0, Math.max(0, layers.value.length - 1))
		const a = Math.min(li0, li1)
		const b = Math.max(li0, li1)
		const layerIds = layers.value.slice(a, b + 1).map((l) => l.id)
		if (layerIds.length) {
			// Shift 模式：区域选择替换当前选区；Ctrl 模式：叠加
			store.dispatch('addRangeSelection', {
				layerIds,
				startFrame,
				endFrame,
				additive: boxShiftMode ? false : boxAdditive
			})
		}
	}

	const onUp = (e: PointerEvent) => {
		// 没移动：点击选择（合并段作为整体；不移动指针）
		if (!boxMoved && framePointer) {
			// Shift 单击：矩形范围选择（从上次选中到当前，跨图层+跨帧）
			if (e.shiftKey && store.state.lastSelectedCellKey) {
				const anchor = parseCellKey(store.state.lastSelectedCellKey)
				if (anchor) {
					const li0 = layers.value.findIndex((l) => l.id === anchor.layerId)
					const li1 = layers.value.findIndex((l) => l.id === framePointer!.layerId)
					if (li0 >= 0 && li1 >= 0) {
						const a = Math.min(li0, li1)
						const b = Math.max(li0, li1)
						const layerIds = layers.value.slice(a, b + 1).map((l) => l.id)
						store.dispatch('addRangeSelection', {
							layerIds,
							startFrame: anchor.frameIndex,
							endFrame: framePointer.frameIndex,
							additive: false
						})
					} else {
						store.dispatch('toggleCellSelection', {
							layerId: framePointer.layerId,
							frameIndex: framePointer.frameIndex,
							additive: boxAdditive
						})
					}
				} else {
					store.dispatch('toggleCellSelection', {
						layerId: framePointer.layerId,
						frameIndex: framePointer.frameIndex,
						additive: boxAdditive
					})
				}
			} else {
				// 单击：始终允许单帧选择（便于段内设置关键帧）
				store.dispatch('toggleCellSelection', {
					layerId: framePointer.layerId,
					frameIndex: framePointer.frameIndex,
					additive: boxAdditive
				})
			}
		}

		boxDragging = false
		boxStartWorld = null
		boxRect.value = null
		boxMoved = false
		boxShiftMode = false
		framePointer = null
		window.removeEventListener('pointermove', onMove)
		window.removeEventListener('pointerup', onUp)
		window.removeEventListener('pointercancel', onUp)
	}
	window.addEventListener('pointermove', onMove)
	window.addEventListener('pointerup', onUp)
	window.addEventListener('pointercancel', onUp)
}

onMounted(() => {
	syncViewportMetrics()
	onLayersScroll()
	// 使用 ResizeObserver 监听容器自身尺寸变化（弹窗缩放/分隔条拖拽等不会触发 window.resize）
	if ('ResizeObserver' in window) {
		tracksResizeObserver = new ResizeObserver(onAnyResize)
		// 观察多个层级的容器：最外层 shell、tracks 容器、可视区域 viewport、图层滚动容器
		const observeTargets = [shellRef.value, tracksRef.value, viewportRef.value, layersScrollRef.value]
		for (const el of observeTargets) {
			if (el) tracksResizeObserver.observe(el)
		}
	}
	// 播放 tick 管理器（默认 30fps）
	ticker = new TimelineTicker({
		getFrameCount: () => frameCount.value,
		getCurrentFrame: () => currentFrame.value,
		setCurrentFrame: (fi) => setCurrentFrame(fi),
		fps: clampInt(Number(store.state.fps ?? inputFps.value ?? 60), 1, 240),
		loop: loopEnabled.value,
		onPlayingChange: (p) => {
			isPlaying.value = p
			store.dispatch('setPlaying', { isPlaying: p })
			if (p) void startTimelineAudio()
			else pauseTimelineAudio()
		},
		onTick: (fi) => {
			ensurePlayheadVisibleWhilePlaying(fi)
			if (isPlaying.value) syncAudioToFrame(fi)
		}
	})
	// 兜底：用户在播放中拖拽/跳帧时也要保持可视
	watch(
		() => currentFrame.value,
		(fi) => {
			ensurePlayheadVisibleWhilePlaying(fi)
			scheduleOverviewDraw()
		}
	)
	window.addEventListener('resize', onAnyResize)
	window.addEventListener('pointerdown', onGlobalPointerDown, { capture: true })
	window.addEventListener('keydown', onGlobalKeydown, { capture: true })
	window.addEventListener(DVS_EVENTS.TimelineNav, onTimelineNav)
	// DWeb 容器自身尺寸变化事件（独立弹窗 resize 时触发）
	window.addEventListener('dweb:content/resize', onAnyResize, true)
	// 触发一次初始总览绘制
	requestAnimationFrame(() => scheduleOverviewDraw())
	// 挂载后延迟再读一次尺寸（确保父组件完成 flex 布局）
	setTimeout(() => {
		syncViewportMetrics()
		onLayersScroll()
		scheduleOverviewDraw()
	}, 100)
})

watch(
	() => store.state.uiJumpVersion,
	() => {
		const target = store.state.uiJumpToFrame
		if (typeof target !== 'number' || !Number.isFinite(target)) return
		// ensure metrics are up-to-date
		syncViewportMetrics()
		centerOnFrame(Math.max(0, Math.min(frameCount.value - 1, Math.floor(target))))
	}
)

onBeforeUnmount(() => {
	if (scrollRaf) cancelAnimationFrame(scrollRaf)
	if (overviewRaf) cancelAnimationFrame(overviewRaf)
	ticker?.dispose()
	ticker = null
	tracksResizeObserver?.disconnect()
	tracksResizeObserver = null
	window.removeEventListener('resize', onAnyResize)
	window.removeEventListener('pointerdown', onGlobalPointerDown, { capture: true })
	window.removeEventListener('keydown', onGlobalKeydown, { capture: true })
	window.removeEventListener(DVS_EVENTS.TimelineNav, onTimelineNav)
	window.removeEventListener('dweb:content/resize', onAnyResize, true)
	closeMenu()
})

const onTimelineNav = (ev: Event) => {
	const ce = ev as CustomEvent<DvsTimelineNavDetail>
	const dir = ce?.detail?.dir
	if (dir !== -1 && dir !== 1) return
	closeMenu()
	scrollByHalfViewport(dir)
}

watch(
	() => [timelineWidth.value, frameWidth.value] as const,
	() => syncViewportMetrics()
)

watch(
	() =>
		[
			store.state.keyframeVersion,
			store.state.easingSegmentKeys.length,
			frameCount.value,
			layers.value.length,
			scrollLeft.value,
			viewportWidth.value,
			store.state.progressVersion ?? 0,
			store.state.audioVersion ?? 0
		] as const,
	() => scheduleOverviewDraw()
)

watch(
	() =>
		[store.state.keyframeVersion, store.state.easingSegmentKeys.length, frameCount.value] as const,
	() => {
		const next = openEasingEditors.value.filter((k) => isValidOpenEasingEditor(k))
		if (next.length !== openEasingEditors.value.length) openEasingEditors.value = next
	}
)
</script>

<style scoped>
.tl-shell {
	width: 100%;
	height: 100%;
	min-height: 0;
	min-width: 0;
	box-sizing: border-box;
	display: flex;
	flex-direction: column;
	background: linear-gradient(180deg, color-mix(in srgb, var(--pl-bg-1) 96%, rgba(0,0,0,0.3)) 0%, color-mix(in srgb, var(--pl-bg-0) 92%, rgba(0,0,0,0.4)) 100%);
	border-top: 1px solid color-mix(in srgb, var(--pl-accent) 28%, transparent);
	user-select: none;
	-webkit-user-select: none;
	-ms-user-select: none;
}

.tl-toolbar {
	height: 44px;
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 0 12px;
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 22%, transparent);
	background: color-mix(in srgb, var(--pl-bg-1) 90%, rgba(0,0,0,0.45));
	backdrop-filter: blur(8px);
	position: relative;
}

.tl-toolbar::before {
	content: '';
	position: absolute;
	left: 0;
	right: 0;
	bottom: -1px;
	height: 1px;
	background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--pl-accent) 55%, transparent), transparent);
	pointer-events: none;
}

.tl-btn {
	border: 1px solid color-mix(in srgb, var(--pl-accent) 35%, transparent);
	background: color-mix(in srgb, var(--pl-fg) 3%, transparent);
	color: var(--pl-fg);
	font-weight: 500;
	padding: 5px 12px;
	border-radius: 2px;
	cursor: pointer;
	font-size: 12px;
	transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.tl-btn:hover {
	border-color: color-mix(in srgb, var(--pl-accent) 70%, transparent);
	background: color-mix(in srgb, var(--pl-accent) 8%, var(--pl-bg-1));
	box-shadow: 0 0 10px color-mix(in srgb, var(--pl-accent) 22%, transparent);
}

.tl-play-controls {
	display: flex;
	align-items: center;
	gap: 6px;
}

.tl-time-jump {
	display: flex;
	align-items: center;
	gap: 4px;
	margin-left: 6px;
	padding-left: 10px;
	border-left: 1px solid color-mix(in srgb, var(--pl-accent) 20%, transparent);
}

.tl-time-input {
	width: 44px;
	height: 24px;
	padding: 0 5px;
	border-radius: 2px;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
	background: color-mix(in srgb, var(--pl-bg-0) 85%, rgba(0,0,0,0.5));
	color: var(--pl-fg);
	font-size: 12px;
	font-family: "JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace;
	outline: none;
	transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.tl-time-input:focus {
	border-color: color-mix(in srgb, var(--pl-accent) 75%, transparent);
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--pl-accent) 30%, transparent), 0 0 10px color-mix(in srgb, var(--pl-accent) 20%, transparent);
}

.tl-time-sep {
	color: color-mix(in srgb, var(--pl-accent) 70%, var(--pl-fg-soft));
	opacity: 0.8;
	font-size: 12px;
	font-weight: 600;
}

.tl-input-fps {
	width: 56px;
}

.tl-mini-btn.active {
	border-color: color-mix(in srgb, var(--pl-accent) 65%, transparent);
	background: color-mix(in srgb, var(--pl-accent) 12%, var(--pl-bg-1));
	box-shadow: 0 0 8px color-mix(in srgb, var(--pl-accent) 25%, transparent);
	color: var(--pl-fg);
}

.tl-meta {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-left: auto;
	color: var(--pl-fg-soft);
	font-size: 12px;
}

.tl-meta-label {
	color: color-mix(in srgb, var(--pl-fg-soft) 75%, transparent);
	font-size: 11px;
	letter-spacing: 0.5px;
	text-transform: uppercase;
}

.tl-meta-sep {
	opacity: 0.4;
	color: color-mix(in srgb, var(--pl-accent) 50%, transparent);
}

.tl-input {
	width: 78px;
	height: 26px;
	padding: 0 7px;
	border-radius: 2px;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
	background: color-mix(in srgb, var(--pl-bg-0) 85%, rgba(0,0,0,0.5));
	color: var(--pl-fg);
	font-size: 12px;
	font-family: "JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace;
	outline: none;
	transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.tl-input:focus {
	border-color: color-mix(in srgb, var(--pl-accent) 75%, transparent);
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--pl-accent) 30%, transparent), 0 0 10px color-mix(in srgb, var(--pl-accent) 20%, transparent);
}

.tl-body {
	flex: 1;
	min-height: 0;
	min-width: 0;
	width: 100%;
	box-sizing: border-box;
	display: flex;
	flex-direction: column;
}

.tl-tracks {
	position: relative;
	flex: 1;
	min-height: 0;
	min-width: 0;
	width: 100%;
	box-sizing: border-box;
	display: flex;
	flex-direction: column;
}

.tl-layers-scroll {
	flex: 1;
	min-height: 0;
	min-width: 0;
	width: 100%;
	box-sizing: border-box;
	overflow-y: auto;
	overflow-x: hidden;
	scrollbar-width: thin;
	scrollbar-color: color-mix(in srgb, var(--pl-accent) 40%, transparent) transparent;
}

.tl-layers {
	width: 100%;
	box-sizing: border-box;
	min-width: 0;
}

.tl-layers-scroll::-webkit-scrollbar {
	width: 8px;
}
.tl-layers-scroll::-webkit-scrollbar-track {
	background: transparent;
}
.tl-layers-scroll::-webkit-scrollbar-thumb {
	background: color-mix(in srgb, var(--pl-accent) 30%, transparent);
	border-radius: 2px;
}
.tl-layers-scroll::-webkit-scrollbar-thumb:hover {
	background: color-mix(in srgb, var(--pl-accent) 55%, transparent);
}

.tl-playhead {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 180px;
	pointer-events: none;
	z-index: 5;
}

.tl-playhead-hit {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 180px;
	width: 10px;
	transform: translateX(-5px);
	cursor: ew-resize;
	background: transparent;
	pointer-events: auto;
	z-index: 6;
}

.tl-select-overlay {
	position: absolute;
	left: 180px;
	right: 0;
	bottom: 0;
	background: transparent;
	z-index: 1;
	pointer-events: none;
}

.tl-box {
	position: absolute;
	left: 180px;
	top: 34px;
	border: 1px dashed var(--pl-accent);
	background: color-mix(in srgb, var(--pl-accent) 8%, transparent);
	pointer-events: none;
	z-index: 4;
}

.tl-playhead-line {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	width: 1px;
	background: var(--pl-accent);
	box-shadow: 0 0 6px color-mix(in srgb, var(--pl-accent) 60%, transparent), 0 0 2px var(--pl-accent);
}

.tl-row {
	min-height: 34px;
	width: 100%;
	box-sizing: border-box;
	display: flex;
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 12%, transparent);
}

.tl-manage {
	background: color-mix(in srgb, var(--pl-bg-1) 92%, rgba(0,0,0,0.35));
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 22%, transparent);
}

.tl-left {
	width: 180px;
	flex: 0 0 180px;
	display: flex;
	align-items: center;
	padding: 0 10px;
	color: var(--pl-fg-soft);
	border-right: 1px solid color-mix(in srgb, var(--pl-accent) 22%, transparent);
	box-sizing: border-box;
	background: color-mix(in srgb, var(--pl-bg-1) 94%, rgba(0,0,0,0.3));
}

.tl-left.selected {
	background: color-mix(in srgb, var(--pl-accent) 10%, var(--pl-bg-1));
	box-shadow: inset 3px 0 0 var(--pl-accent);
}

.tl-right {
	flex: 1;
	min-width: 0;
	width: 100%;
	box-sizing: border-box;
	display: flex;
	flex-direction: column;
}

.tl-viewport {
	flex: 1;
	min-width: 0;
	width: 100%;
	box-sizing: border-box;
	position: relative;
	overflow: hidden;
	background: color-mix(in srgb, var(--pl-bg-0) 95%, rgba(0,0,0,0.4));
}

.tl-frames-viewport {
	flex: 0 0 34px;
	height: 34px;
	width: 100%;
	box-sizing: border-box;
}

.tl-easing-viewport {
	flex: 0 0 auto;
	width: 100%;
	box-sizing: border-box;
	border-top: 1px dashed color-mix(in srgb, var(--pl-accent) 20%, transparent);
}

.tl-track {
	position: relative;
	height: 100%;
	z-index: 2;
}

.tl-playhead-handle {
	position: absolute;
	top: 0;
	width: 10px;
	height: 12px;
	transform: translateX(-5px);
	background: var(--pl-accent);
	border-radius: 0;
	box-shadow: 0 0 8px color-mix(in srgb, var(--pl-accent) 70%, transparent);
	clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 70%, 0 100%);
}

.tl-tick {
	position: absolute;
	top: 0;
	bottom: 0;
	width: 1px;
	background: color-mix(in srgb, var(--pl-accent) 20%, transparent);
	pointer-events: none;
}

.tl-tick.major {
	background: color-mix(in srgb, var(--pl-accent) 40%, transparent);
}

.tl-tick-label {
	position: absolute;
	top: 2px;
	left: 2px;
	font-size: 10px;
	font-family: "JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace;
	color: color-mix(in srgb, var(--pl-accent) 55%, var(--pl-fg-soft));
	white-space: nowrap;
	text-shadow: 0 0 4px color-mix(in srgb, var(--pl-accent) 30%, transparent);
}

.tl-layer-left {
	gap: 8px;
	position: relative;
}

.tl-layer-name {
	color: var(--pl-fg);
	font-size: 12px;
	font-weight: 500;
	text-shadow: 0 0 8px color-mix(in srgb, var(--pl-accent) 15%, transparent);
}

.tl-del {
	margin-left: auto;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
	background: transparent;
	color: var(--pl-fg-muted);
	font-size: 11px;
	height: 22px;
	padding: 0 8px;
	cursor: pointer;
	border-radius: 2px;
	transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.tl-subtitle {
	border: 1px solid color-mix(in srgb, var(--pl-accent) 30%, transparent);
	background: color-mix(in srgb, var(--pl-cold) 8%, transparent);
	color: var(--pl-fg);
	font-size: 11px;
	height: 22px;
	padding: 0 8px;
	cursor: pointer;
	border-radius: 2px;
	transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.tl-subtitle:hover {
	border-color: color-mix(in srgb, var(--pl-cold) 65%, transparent);
	background: color-mix(in srgb, var(--pl-cold) 14%, var(--pl-bg-1));
	box-shadow: 0 0 8px color-mix(in srgb, var(--pl-cold) 25%, transparent);
}

.tl-del:hover {
	color: #ff8a80;
	border-color: color-mix(in srgb, #ff6b6b 60%, transparent);
	background: color-mix(in srgb, #ff6b6b 10%, transparent);
}

.tl-manage-left {
	gap: 6px;
}

.tl-manage-title {
	color: var(--pl-fg);
	font-size: 12px;
	font-weight: 600;
	letter-spacing: 1px;
	text-shadow: 0 0 8px color-mix(in srgb, var(--pl-accent) 30%, transparent);
	margin-right: 4px;
}

.tl-mini-btn {
	border: 1px solid color-mix(in srgb, var(--pl-accent) 28%, transparent);
	background: color-mix(in srgb, var(--pl-fg) 3%, transparent);
	color: var(--pl-fg);
	font-size: 11px;
	height: 24px;
	padding: 0 10px;
	cursor: pointer;
	border-radius: 2px;
	transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.tl-mini-btn:hover {
	border-color: color-mix(in srgb, var(--pl-accent) 65%, transparent);
	background: color-mix(in srgb, var(--pl-accent) 8%, var(--pl-bg-1));
	box-shadow: 0 0 10px color-mix(in srgb, var(--pl-accent) 20%, transparent);
}

.tl-mini-btn:disabled {
	opacity: 0.35;
	cursor: not-allowed;
}

.tl-mini-btn:disabled:hover {
	border-color: color-mix(in srgb, var(--pl-accent) 28%, transparent);
	background: color-mix(in srgb, var(--pl-fg) 3%, transparent);
	box-shadow: none;
}

.tl-empty {
	padding: 16px;
	color: color-mix(in srgb, var(--pl-fg-soft) 50%, transparent);
	font-size: 12px;
	text-align: center;
	font-style: italic;
}
.tl-meta-time {
	min-width: 92px;
	font-size: 12px;
	color: var(--pl-fg);
	font-family: "JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace;
	white-space: nowrap;
	text-shadow: 0 0 6px color-mix(in srgb, var(--pl-accent) 25%, transparent);
}

.tl-scrollbar {
	height: 30px;
	display: flex;
	align-items: center;
	padding: 4px 10px;
	gap: 10px;
	border-top: 1px solid color-mix(in srgb, var(--pl-accent) 28%, transparent);
	background: linear-gradient(180deg, color-mix(in srgb, var(--pl-bg-1) 92%, rgba(0,0,0,0.45)) 0%, color-mix(in srgb, var(--pl-bg-0) 90%, rgba(0,0,0,0.55)) 100%);
	position: relative;
}

.tl-scrollbar::before {
	content: '';
	position: absolute;
	left: 0;
	right: 0;
	top: -1px;
	height: 1px;
	background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--pl-accent) 55%, transparent), transparent);
	pointer-events: none;
}

.tl-overview-canvas {
	flex: 1;
	min-width: 0;
	height: 20px;
	display: block;
	cursor: grab;
	border-radius: 2px;
	transition: box-shadow 0.2s ease;
}

.tl-overview-canvas:active {
	cursor: grabbing;
}

.tl-overview-canvas:hover {
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--pl-accent) 45%, transparent), 0 0 10px color-mix(in srgb, var(--pl-accent) 25%, transparent);
}

.tl-overview-hud {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 0 6px;
	height: 20px;
	border-left: 1px solid color-mix(in srgb, var(--pl-accent) 22%, transparent);
	font-family: "JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace;
	font-size: 10px;
	color: color-mix(in srgb, var(--pl-accent) 75%, var(--pl-fg-soft));
	text-shadow: 0 0 4px color-mix(in srgb, var(--pl-accent) 35%, transparent);
	white-space: nowrap;
	user-select: none;
	flex-shrink: 0;
}

.tl-overview-label {
	letter-spacing: 1px;
	opacity: 0.8;
}

.tl-overview-zoom {
	padding: 1px 5px;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 30%, transparent);
	border-radius: 2px;
	background: color-mix(in srgb, var(--pl-accent) 8%, transparent);
}
</style>
