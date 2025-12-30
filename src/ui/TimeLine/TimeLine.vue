<template>
	<div class="tl-shell">
		<div class="tl-toolbar">
			<div class="tl-play-controls">
				<button class="tl-mini-btn" type="button" :disabled="isPlaying" @click="onPlay">播放</button>
				<button class="tl-mini-btn" type="button" :disabled="!isPlaying" @click="onPause">暂停</button>
				<button class="tl-mini-btn" type="button" @click="onStop">停止</button>
				<button class="tl-mini-btn" type="button" :class="{ active: loopEnabled }" @click="toggleLoop">循环</button>
				<div class="tl-time-jump">
					<button class="tl-mini-btn" type="button" @click="onJumpByTime">按时间跳转</button>
					<input v-model="jumpHH" class="tl-time-input" type="number" min="0" step="1" @change="normalizeJumpTime" />
					<span class="tl-time-sep">:</span>
					<input v-model="jumpMM" class="tl-time-input" type="number" min="0" max="59" step="1" @change="normalizeJumpTime" />
					<span class="tl-time-sep">:</span>
					<input v-model="jumpSS" class="tl-time-input" type="number" min="0" max="59" step="1" @change="normalizeJumpTime" />
				</div>
			</div>
			<div class="tl-meta">
				<span class="tl-meta-label">FPS</span>
				<input v-model.number="inputFps" class="tl-input tl-input-fps" type="number" min="1" max="240" step="1" @change="applyFps" />
				<span class="tl-meta-label">当前帧</span>
				<input v-model.number="inputCurrentFrame" class="tl-input" type="number" min="0" :max="Math.max(0, frameCount - 1)" step="1" @change="applyCurrentFrame" />
				<span class="tl-meta-sep">/</span>
				<span class="tl-meta-label">总帧数</span>
				<input v-model.number="inputFrameCount" class="tl-input" type="number" min="1" step="1" @change="applyFrameCount" />
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
				<div class="tl-playhead-hit" :style="{ transform: `translateX(${playheadX}px)` }" @pointerdown.stop.prevent="onPlayheadPointerDown" />

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
						<button class="tl-mini-btn" type="button" :disabled="selectedLayerIds.length === 0" @click="removeSelectedLayers">删除</button>
					</div>
					<div class="tl-right">
						<div ref="viewportRef" class="tl-viewport" @pointerdown="onTickPointerDown" @wheel.prevent="onZoomWheel">
								<TimeLineTickCanvas :frame-count="frameCount" :frame-width="frameWidth" :scroll-left="scrollLeft" />
							<div class="tl-track" :style="{ width: timelineWidth + 'px', transform: `translateX(${-scrollLeft}px)` }">
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
						<div v-for="layer in visibleLayers" :key="layer.id" class="tl-row" :style="{ height: layerRowHeight(layer.id) + 'px' }" @click="selectLayer(layer.id)">
							<div class="tl-left tl-layer-left" :class="{ selected: isLayerSelected(layer.id) }">
								<span class="tl-layer-name">{{ layer.name }}</span>
								<button class="tl-del" type="button" @click.stop="removeLayer(layer.id)">删除</button>
							</div>
							<div class="tl-right">
								<div class="tl-viewport tl-frames-viewport" @wheel.prevent="onZoomWheel">
									<TimeLineFrameCanvasRow
										:layer-id="layer.id"
										:frame-count="frameCount"
										:frame-width="frameWidth"
										:scroll-left="scrollLeft"
										:current-frame="currentFrame"
										:selection-version="selectionVersion"
										:keyframe-version="keyframeVersion"
										:easing-segment-keys="easingSegmentKeys"
										:is-frame-selected="isFrameSelected"
										:is-keyframe="(lid, fi) => timelineData.isKeyframe(lid, fi)"
										:is-between="isBetweenKeyframes"
										:is-easing-enabled="(lid, fi) => timelineData.isEasingEnabled(lid, fi)"
										:is-easing-arrow="(lid, fi) => timelineData.isEasingEnabled(lid, fi) && isBetweenKeyframes(lid, fi) && timelineData.isKeyframe(lid, fi + 1)"
										@pointerdown="({ layerId, frameIndex, ev }) => onFramePointerDown(layerId, frameIndex, ev)"
										@dblclick="onFrameDblClick"
										@contextmenu="onFrameContextMenu"
									/>
								</div>
								<div
									v-if="(openEasingEditorsByLayer[layer.id] ?? []).length > 0"
									class="tl-viewport tl-easing-viewport"
									:style="{ height: easingEditorHeight + 'px' }"
								>
									<div class="tl-track" :style="{ width: timelineWidth + 'px', transform: `translateX(${-scrollLeft}px)` }">
										<TimeLineEasingCurveEditor
											v-for="segmentKey in (openEasingEditorsByLayer[layer.id] ?? [])"
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

			<!-- 底部水平滚动条：控制整体左右滚动 -->
			<div class="tl-scrollbar">
				<input
					class="tl-range"
					type="range"
					:min="0"
					:max="Math.max(0, maxScrollLeft)"
					:step="1"
					:value="scrollLeft"
					@input="onScrollBarInput"
				/>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { TimelineKey, type TimelineState } from '../../store/timeline'
import { VideoSceneStore, type VideoSceneNodeProps, type VideoSceneNodeTransform, type VideoSceneTreeNode } from '../../store/videoscene'
import { containsFrame, getPrevNext, rangeFullyCovered, rangeIntersects, type TimelineFrameSpan } from '../../store/timeline/spans'
import { VuexTimelineDataManager } from './core/VuexTimelineDataManager'
import { TimelineTicker } from './core/TimelineTicker'
import TimeLineContextMenu from './components/TimeLineContextMenu.vue'
import TimeLineEasingCurveEditor from './components/TimeLineEasingCurveEditor.vue'
import TimeLineFrameCanvasRow from './components/TimeLineFrameCanvasRow.vue'
import TimeLineTickCanvas from './components/TimeLineTickCanvas.vue'

const store = useStore<TimelineState>(TimelineKey)

const timelineData = new VuexTimelineDataManager(store)

const layers = computed(() => store.state.layers)
const frameCount = computed(() => store.state.frameCount)
const currentFrame = computed(() => store.state.currentFrame)
const frameWidth = computed(() => store.state.frameWidth)
const selectedLayerIds = computed(() => store.state.selectedLayerIds)
const selectedSpansByLayer = computed(() => store.state.selectedSpansByLayer)
const selectionVersion = computed(() => store.state.selectionVersion)
const keyframeSpansByLayer = computed(() => store.state.keyframeSpansByLayer)
const keyframeVersion = computed(() => store.state.keyframeVersion)
const easingSegmentKeys = computed(() => store.state.easingSegmentKeys)

// 右侧预留空间：让最后一帧不贴边（避免被底部滚动条/操作区域影响点击）
// 注意：该宽度同时用于刻度行与各图层行的“世界宽度”，保证滚动/绘制同步。
const timelineRightPaddingPx = 160
const timelineWidth = computed(() => frameCount.value * frameWidth.value + timelineRightPaddingPx)

const inputCurrentFrame = ref<number>(0)
const inputFrameCount = ref<number>(120)
const inputFps = ref<number>(30)

const jumpHH = ref<string>('00')
const jumpMM = ref<string>('00')
const jumpSS = ref<string>('00')

const isPlaying = ref(false)
const loopEnabled = ref(false)
let ticker: TimelineTicker | null = null

const clampInt = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(n)))

const pad2 = (n: number) => String(clampInt(n, 0, 99)).padStart(2, '0')

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
	store.dispatch('removeSelectedLayers')
	for (const id of ids) VideoSceneStore.dispatch('removeLayer', { layerId: id })
}

const removeLayer = (layerId: string) => {
	store.dispatch('removeLayer', { layerId })
	VideoSceneStore.dispatch('removeLayer', { layerId })
}

const applyFrameCount = () => {
	const next = Math.max(1, Math.floor(Number(inputFrameCount.value) || 1))
	store.dispatch('setFrameCount', { frameCount: next })
}

const applyFps = () => {
	const next = clampInt(Number(inputFps.value || 30), 1, 240)
	inputFps.value = next
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

const onPlay = () => ticker?.play()
const onPause = () => ticker?.pause()
const onStop = () => ticker?.stop()
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
	const fw = Math.max(1, frameWidth.value)
	const worldX = Math.round(fi * fw)
	// playheadX = worldX - scrollLeft
	const x = worldX - scrollLeft.value
	// 超出右侧：把 playhead 拉回可视区第一帧（x=0）
	if (x > vw - fw) {
		commitScrollLeft(worldX)
		return
	}
	// 超出左侧（例如用户拖拽/跳帧后）：也拉回到第一帧
	if (x < 0) {
		commitScrollLeft(worldX)
	}
}

const isActiveFrame = (frameIndex: number) => currentFrame.value === frameIndex

const isLayerSelected = (layerId: string) => selectedLayerIds.value.includes(layerId)

const selectLayer = (layerId: string) => {
	store.dispatch('selectLayer', { layerId })
	VideoSceneStore.dispatch('setActiveLayer', { layerId })
}

// 时间轴选中变化 -> 同步舞台当前图层
watch(
	() => store.state.selectedLayerIds[0] ?? null,
	(layerId) => {
		if (!layerId) return
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
const makeSegmentKey = (layerId: string, startKeyframe: number, endKeyframe: number): SegmentKey => `${layerId}:${startKeyframe}:${endKeyframe}`
const parseSegmentKey = (k: SegmentKey): { layerId: string; startKeyframe: number; endKeyframe: number } | null => {
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

const setEasingCurveFor = (segmentKey: SegmentKey, curve: { x1: number; y1: number; x2: number; y2: number; preset?: string }) => {
	store.dispatch('setEasingCurve', { segmentKey, curve })
}

const openEasingEditor = (segmentKey: SegmentKey) => {
	if (!openEasingEditors.value.includes(segmentKey)) openEasingEditors.value = [...openEasingEditors.value, segmentKey]
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

const easingEditorWidth = (segmentKey: SegmentKey) => segmentRect(segmentKey)?.width ?? Math.max(1, frameWidth.value)

const easingEditorStyle = (segmentKey: SegmentKey) => {
	const r = segmentRect(segmentKey)
	if (!r) return { display: 'none' }
	return {
		position: 'absolute',
		left: r.left + 'px',
		top: '0px',
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

const menuCanCopy = computed(() => menu.value != null)
const menuCanPaste = computed(() => timelineData.canPaste())
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
	const entries = Object.entries(store.state.selectedSpansByLayer).filter(([, spans]) => spans && spans.length)
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
	if (expectedEnd < frameCount.value - 1 && rangeIntersects(spans, expectedEnd + 1, frameCount.value - 1)) return null
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

const deepCloneFallback = <T,>(value: T, seen = new WeakMap<object, any>()): T => {
	if (value == null) return value
	if (typeof value !== 'object') return value
	if (value instanceof Date) return new Date(value.getTime()) as any

	const obj = value as unknown as object
	const cached = seen.get(obj)
	if (cached) return cached

	if (Array.isArray(value)) {
		const out: any[] = []
		seen.set(obj, out)
		for (const item of value as any[]) out.push(deepCloneFallback(item, seen))
		return out as any
	}

	const proto = Object.getPrototypeOf(obj)
	const out: any = proto === null ? Object.create(null) : {}
	seen.set(obj, out)
	for (const k of Object.keys(obj as any)) out[k] = deepCloneFallback((obj as any)[k], seen)
	return out
}

const cloneJsonSafe = <T,>(v: T): T => {
	try {
		return JSON.parse(JSON.stringify(v)) as T
	} catch {
		try {
			return (globalThis as any).structuredClone ? ((globalThis as any).structuredClone(v) as T) : deepCloneFallback(v)
		} catch {
			return deepCloneFallback(v)
		}
	}
}

const collectUserNodeSnapshots = (nodes: VideoSceneTreeNode[] | undefined, out: Record<string, NodeSnapshot>) => {
	if (!nodes) return
	for (const n of nodes) {
		if (n.category === 'user') {
			out[n.id] = {
				transform: n.transform ? { ...n.transform } : undefined,
				props: n.props ? cloneJsonSafe(n.props) : undefined,
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

const getKeyframeSegmentBounds = (layerId: string, frameIndex: number): { startKeyframe: number; endKeyframe: number } | null => {
	const fi = Math.floor(Number(frameIndex))
	if (!Number.isFinite(fi)) return null
	if (timelineData.isKeyframe(layerId, fi)) return null
	const spans = keyframeSpansByLayer.value[layerId] ?? []
	const { prev, next } = getPrevNext(spans, fi)
	if (prev == null || next == null) return null
	if (!(prev < fi && fi < next)) return null
	return { startKeyframe: prev, endKeyframe: next }
}

const onFrameContextMenu = (payload: { layerId: string; frameIndex: number; clientX: number; clientY: number }) => {
	// 右键：不取消多选；若右键点在未选中格子上，则切换为单选该格子
	if (!isFrameSelected(payload.layerId, payload.frameIndex)) {
		// 合并段内也允许“单帧右键单选”，便于对某一帧单独设置关键帧
		store.dispatch('toggleCellSelection', { layerId: payload.layerId, frameIndex: payload.frameIndex, additive: false })
	}
	// 右键不移动指针位置
	menu.value = { layerId: payload.layerId, frameIndex: payload.frameIndex, x: payload.clientX, y: payload.clientY }
}

const onFrameDblClick = (payload: { layerId: string; frameIndex: number; ev: MouseEvent }) => {
	closeMenu()
	const seg = getKeyframeSegmentBounds(payload.layerId, payload.frameIndex)
	if (!seg) return
	const startFrame = seg.startKeyframe + 1
	const endFrame = seg.endKeyframe - 1
	if (startFrame > endFrame) return
	store.dispatch('addRangeSelection', { layerIds: [payload.layerId], startFrame, endFrame, additive: false })
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
			store.dispatch('setStageKeyframeSnapshotRange', { startFrame: a, endFrame: b, layers: stageLayers })
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
}

let scrollRaf = 0
let pendingScrollLeft: number | null = null
const commitScrollLeft = (v: number) => {
	scrollLeft.value = Math.max(0, Math.min(maxScrollLeft.value, Math.floor(v)))
}

const onScrollBarInput = (evt: Event) => {
	const value = Number((evt.target as HTMLInputElement).value)
	pendingScrollLeft = value
	if (scrollRaf) return
	scrollRaf = requestAnimationFrame(() => {
		scrollRaf = 0
		if (pendingScrollLeft == null) return
		commitScrollLeft(pendingScrollLeft)
		pendingScrollLeft = null
	})
}

// 滚轮缩放：改变每帧宽度（5px~20px）
const onZoomWheel = (ev: WheelEvent) => {
	closeMenu()
	const delta = ev.deltaY
	const dir = delta > 0 ? -1 : 1
	const next = frameWidth.value + dir
	store.dispatch('setFrameWidth', { frameWidth: next })
}

// 指针线拖动（手柄在第一行）
let playheadDragging = false

const onPlayheadPointerDown = (ev: PointerEvent) => {
	closeMenu()
	if (ev.button !== 0) return
	playheadDragging = true
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
		;(ev.currentTarget as HTMLElement)?.setPointerCapture?.(ev.pointerId)
		setCurrentFrame(startFrame)

		const onMove = (e: PointerEvent) => {
			if (!playheadDragging) return
			setCurrentFrame(calcFrameFromClientX(e.clientX))
		}
		const onUp = (e: PointerEvent) => {
			playheadDragging = false
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
			store.dispatch('addRangeSelection', { layerIds, startFrame: tickStartFrame, endFrame, additive: tickAdditive })
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
		height: h + 'px',
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
		height: rect.height - baseRowHeight,
	}
}

const frameAtWorldX = (worldX: number) => clamp(Math.floor(worldX / frameWidth.value), 0, frameCount.value - 1)

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

	framePointer = { layerId, frameIndex, startX: ev.clientX, startY: ev.clientY, pointerId: ev.pointerId }
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
				boxRect.value = { x0: anchorXWorld, y0: anchorYWorld, x1: anchorXWorld + frameWidth.value, y1: anchorYWorld + baseRowHeight }
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
			store.dispatch('addRangeSelection', { layerIds, startFrame, endFrame, additive: boxShiftMode ? false : boxAdditive })
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
						store.dispatch('addRangeSelection', { layerIds, startFrame: anchor.frameIndex, endFrame: framePointer.frameIndex, additive: false })
					} else {
						store.dispatch('toggleCellSelection', { layerId: framePointer.layerId, frameIndex: framePointer.frameIndex, additive: boxAdditive })
					}
				} else {
					store.dispatch('toggleCellSelection', { layerId: framePointer.layerId, frameIndex: framePointer.frameIndex, additive: boxAdditive })
				}
			} else {
				// 单击：始终允许单帧选择（便于段内设置关键帧）
				store.dispatch('toggleCellSelection', { layerId: framePointer.layerId, frameIndex: framePointer.frameIndex, additive: boxAdditive })
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
	// 播放 tick 管理器（默认 30fps）
	ticker = new TimelineTicker({
		getFrameCount: () => frameCount.value,
		getCurrentFrame: () => currentFrame.value,
		setCurrentFrame: (fi) => setCurrentFrame(fi),
		fps: inputFps.value,
		loop: loopEnabled.value,
		onPlayingChange: (p) => (isPlaying.value = p),
		onTick: (fi) => ensurePlayheadVisibleWhilePlaying(fi),
	})
	// 兜底：用户在播放中拖拽/跳帧时也要保持可视
	watch(
		() => currentFrame.value,
		(fi) => ensurePlayheadVisibleWhilePlaying(fi)
	)
	window.addEventListener('resize', syncViewportMetrics)
	window.addEventListener('pointerdown', onGlobalPointerDown, { capture: true })
	window.addEventListener('keydown', onGlobalKeydown, { capture: true })
	window.addEventListener('resize', onLayersScroll)
	window.addEventListener('dweb:timeline-nav', onTimelineNav as any)
})

onBeforeUnmount(() => {
	if (scrollRaf) cancelAnimationFrame(scrollRaf)
	ticker?.dispose()
	ticker = null
	window.removeEventListener('resize', syncViewportMetrics)
	window.removeEventListener('resize', onLayersScroll)
	window.removeEventListener('pointerdown', onGlobalPointerDown, { capture: true } as any)
	window.removeEventListener('keydown', onGlobalKeydown, { capture: true } as any)
	window.removeEventListener('dweb:timeline-nav', onTimelineNav as any)
	closeMenu()
})

const onTimelineNav = (ev: Event) => {
	const ce = ev as CustomEvent<{ dir: number }>
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
	() => [store.state.keyframeVersion, store.state.easingSegmentKeys.length, frameCount.value] as const,
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
	display: flex;
	flex-direction: column;
	background: var(--dweb-defualt-dark);
	border-top: 1px solid var(--vscode-border);
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
	border-bottom: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
}

.tl-btn {
	border: 1px solid var(--vscode-border-accent);
	background: transparent;
	color: var(--vscode-fg);
	font-weight: 600;
	padding: 6px 12px;
	border-radius: 8px;
	cursor: pointer;
	font-size: 12px;
}

.tl-btn:hover {
	background: var(--vscode-hover-bg);
}

.tl-play-controls {
	display: flex;
	align-items: center;
	gap: 8px;
}

.tl-time-jump {
	display: flex;
	align-items: center;
	gap: 6px;
}

.tl-time-input {
	width: 46px;
	height: 24px;
	padding: 0 6px;
	border-radius: 6px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	font-size: 12px;
	outline: none;
}

.tl-time-input:focus {
	border-color: var(--vscode-border-accent);
}

.tl-time-sep {
	color: var(--vscode-fg-muted);
	opacity: 0.8;
	font-size: 12px;
}

.tl-input-fps {
	width: 60px;
}

.tl-mini-btn.active {
	border-color: var(--vscode-border-accent);
	background: var(--vscode-hover-bg);
}

.tl-meta {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-left: auto;
	color: var(--vscode-fg-muted);
	font-size: 12px;
}

.tl-meta-label {
	color: var(--vscode-fg-muted);
}

.tl-meta-sep {
	opacity: 0.7;
}

.tl-input {
	width: 84px;
	height: 28px;
	padding: 0 8px;
	border-radius: 6px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	font-size: 12px;
	outline: none;
}

.tl-input:focus {
	border-color: var(--vscode-border-accent);
}

.tl-body {
	flex: 1;
	min-height: 0;
	display: flex;
	flex-direction: column;
}

.tl-tracks {
	position: relative;
	flex: 1;
	min-height: 0;
	display: flex;
	flex-direction: column;
}

.tl-layers-scroll {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
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
	border: 1px dashed var(--dweb-accent);
	background: transparent;
	pointer-events: none;
	z-index: 4;
}

.tl-playhead-line {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	width: 1px;
	background: var(--dweb-accent);
}

.tl-row {
	min-height: 34px;
	display: flex;
	border-bottom: 1px solid var(--vscode-divider);
}

.tl-manage {
	background: var(--dweb-defualt);
}

.tl-left {
	width: 180px;
	flex: 0 0 180px;
	display: flex;
	align-items: center;
	padding: 0 10px;
	color: var(--vscode-fg-muted);
	border-right: 1px solid var(--vscode-border);
	box-sizing: border-box;
	background: var(--dweb-defualt);
}

.tl-left.selected {
	background: var(--vscode-selected-bg);
}

.tl-right {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
}

.tl-viewport {
	flex: 1;
	min-width: 0;
	position: relative;
	overflow: hidden; /* 不显示滚动条 */
	background: var(--dweb-defualt-dark);
}

.tl-frames-viewport {
	flex: 0 0 34px;
	height: 34px;
}

.tl-easing-viewport {
	flex: 0 0 auto;
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
	background: var(--dweb-accent);
	border-bottom-left-radius: 2px;
	border-bottom-right-radius: 2px;
}

.tl-tick {
	position: absolute;
	top: 0;
	bottom: 0;
	width: 1px;
	background: rgba(255, 255, 255, 0.08);
	pointer-events: none;
}

.tl-tick.major {
	background: rgba(255, 255, 255, 0.18);
}

.tl-tick-label {
	position: absolute;
	top: 2px;
	left: 2px;
	font-size: 11px;
	color: rgba(255, 255, 255, 0.55);
	white-space: nowrap;
}

.tl-layer-left {
	gap: 8px;
}

.tl-layer-name {
	color: var(--vscode-fg);
	font-size: 12px;
}

.tl-del {
	margin-left: auto;
	border: 1px solid var(--vscode-border);
	background: transparent;
	color: var(--vscode-fg-muted);
	font-size: 12px;
	height: 24px;
	padding: 0 10px;
	cursor: pointer;
}

.tl-del:hover {
	color: var(--vscode-fg);
	border-color: var(--vscode-border-accent);
}

.tl-manage-left {
	gap: 8px;
}

.tl-manage-title {
	color: var(--vscode-fg);
	font-size: 12px;
}

.tl-mini-btn {
	border: 1px solid var(--vscode-border);
	background: transparent;
	color: var(--vscode-fg);
	font-size: 12px;
	height: 24px;
	padding: 0 10px;
	cursor: pointer;
}

.tl-mini-btn:hover {
	border-color: var(--vscode-border-accent);
}

.tl-mini-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.tl-empty {
	padding: 12px;
	color: var(--vscode-fg-muted);
	font-size: 12px;
}

.tl-scrollbar {
	height: 24px;
	display: flex;
	align-items: center;
	padding: 0 12px;
	border-top: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
}

.tl-range {
	width: 100%;
}
</style>