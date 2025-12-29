<template>
	<div class="tl-shell">
		<div class="tl-toolbar">
			<div class="tl-meta">
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
							<div class="tl-track" :style="{ width: timelineWidth + 'px', transform: `translateX(${-scrollLeft}px)` }">
								<!-- 帧数刻度（恢复显示） -->
								<div
									v-for="fi in visibleFrameIndices"
									:key="'tick-' + fi"
									class="tl-tick"
									:class="{ major: fi % 10 === 0 }"
									:style="{ left: fi * frameWidth + 'px' }"
								>
									<span v-if="fi % 10 === 0" class="tl-tick-label">{{ fi }}</span>
								</div>
								<!-- 手柄只在第一行显示 -->
									<div class="tl-playhead-handle" :style="{ left: playheadWorldX + 'px' }" />
							</div>
						</div>
					</div>
				</div>

				<!-- 图层行（可垂直滚动） -->
				<div ref="layersScrollRef" class="tl-layers-scroll" @scroll="onLayersScroll">
					<div class="tl-layers">
						<div v-if="layers.length === 0" class="tl-empty">点击“新建”开始创建图层</div>
						<div v-for="layer in layers" :key="layer.id" class="tl-row" :style="{ height: layerRowHeight(layer.id) + 'px' }" @click="selectLayer(layer.id)">
							<div class="tl-left tl-layer-left" :class="{ selected: isLayerSelected(layer.id) }">
								<span class="tl-layer-name">{{ layer.name }}</span>
								<button class="tl-del" type="button" @click.stop="removeLayer(layer.id)">删除</button>
							</div>
							<div class="tl-right">
								<div class="tl-viewport tl-frames-viewport" @wheel.prevent="onZoomWheel">
									<div class="tl-track" :style="{ width: timelineWidth + 'px', transform: `translateX(${-scrollLeft}px)` }">
										<TimeLineFrameCell
											v-for="frameIndex in visibleFrameIndices"
											:key="frameIndex"
											:layer-id="layer.id"
											:frame-index="frameIndex"
											:left="frameIndex * frameWidth"
											:width="frameWidth"
											:active="isActiveFrame(frameIndex)"
											:selected="isFrameSelected(layer.id, frameIndex)"
											:keyframe="timelineData.isKeyframe(layer.id, frameIndex)"
											:between="isBetweenKeyframes(layer.id, frameIndex)"
											:join-left="isBetweenKeyframes(layer.id, frameIndex) && isBetweenKeyframes(layer.id, frameIndex - 1)"
											:join-right="isBetweenKeyframes(layer.id, frameIndex) && isBetweenKeyframes(layer.id, frameIndex + 1)"
											:easing="timelineData.isEasingEnabled(layer.id, frameIndex)"
											:easing-arrow="timelineData.isEasingEnabled(layer.id, frameIndex) && isBetweenKeyframes(layer.id, frameIndex) && timelineData.isKeyframe(layer.id, frameIndex + 1)"
											@pointerdown="({ layerId, frameIndex, ev }) => onFramePointerDown(layerId, frameIndex, ev)"
											@dblclick="onFrameDblClick"
											@contextmenu="onFrameContextMenu"
										/>
									</div>
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
import { VideoSceneStore } from '../../store/videoscene'
import { VuexTimelineDataManager } from './core/VuexTimelineDataManager'
import TimeLineFrameCell from './components/TimeLineFrameCell.vue'
import TimeLineContextMenu from './components/TimeLineContextMenu.vue'
import TimeLineEasingCurveEditor from './components/TimeLineEasingCurveEditor.vue'

const store = useStore<TimelineState>(TimelineKey)

const timelineData = new VuexTimelineDataManager(store)

const layers = computed(() => store.state.layers)
const frameCount = computed(() => store.state.frameCount)
const currentFrame = computed(() => store.state.currentFrame)
const frameWidth = computed(() => store.state.frameWidth)
const selectedLayerIds = computed(() => store.state.selectedLayerIds)
const selectedCellKeys = computed(() => store.state.selectedCellKeys)

const timelineWidth = computed(() => frameCount.value * frameWidth.value)

const inputCurrentFrame = ref<number>(0)
const inputFrameCount = ref<number>(120)

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

const applyCurrentFrame = () => {
	store.dispatch('setCurrentFrame', { frameIndex: Number(inputCurrentFrame.value) || 0 })
}

const setCurrentFrame = (frameIndex: number) => {
	store.dispatch('setCurrentFrame', { frameIndex })
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
	return selectedCellKeys.value.includes(`${layerId}:${frameIndex}`)
}

const layersScrollRef = ref<HTMLDivElement | null>(null)
const layersScrollTop = ref(0)
const onLayersScroll = () => {
	const el = layersScrollRef.value
	layersScrollTop.value = el ? Math.max(0, Math.floor(el.scrollTop)) : 0
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
	const arr = keyframeIndexMap.value.get(parsed.layerId)
	if (!arr || arr.length < 2) return false
	if (!arr.includes(parsed.startKeyframe) || !arr.includes(parsed.endKeyframe)) return false
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

// 两个关键帧之间的普通帧：用于“合并样式”提示
const keyframeIndexMap = computed(() => {
	const map = new Map<string, number[]>()
	for (const k of store.state.keyframeKeys) {
		const parts = k.split(':')
		if (parts.length !== 2) continue
		const layerId = parts[0]
		const fi = Math.floor(Number(parts[1]))
		if (!Number.isFinite(fi)) continue
		const arr = map.get(layerId)
		if (arr) arr.push(fi)
		else map.set(layerId, [fi])
	}
	for (const [layerId, arr] of map) {
		arr.sort((a, b) => a - b)
		// 去重
		const uniq: number[] = []
		let last: number | null = null
		for (const n of arr) {
			if (last === n) continue
			uniq.push(n)
			last = n
		}
		map.set(layerId, uniq)
	}
	return map
})

const isBetweenKeyframes = (layerId: string, frameIndex: number) => {
	const fi = Math.floor(Number(frameIndex))
	if (!Number.isFinite(fi)) return false
	// 关键帧本身不算“中间帧”
	if (timelineData.isKeyframe(layerId, fi)) return false
	const arr = keyframeIndexMap.value.get(layerId)
	if (!arr || arr.length < 2) return false
	// lowerBound: 第一个 >= fi 的位置
	let lo = 0
	let hi = arr.length
	while (lo < hi) {
		const mid = (lo + hi) >> 1
		if (arr[mid] < fi) lo = mid + 1
		else hi = mid
	}
	const next = arr[lo]
	const prev = lo > 0 ? arr[lo - 1] : undefined
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
const menuCanAddKeyframe = computed(() => {
	if (!menu.value) return false
	// 批量：只要选区里存在“非关键帧”，就允许设置关键帧
	return menuSelectedTargets.value.some((t) => !timelineData.isKeyframe(t.layerId, t.frameIndex))
})
const menuCanRemoveKeyframe = computed(() => {
	if (!menu.value) return false
	// 批量：只要选区里存在“关键帧”，就允许取消关键帧
	return menuSelectedTargets.value.some((t) => timelineData.isKeyframe(t.layerId, t.frameIndex))
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
	const keys = store.state.selectedCellKeys
	if (keys.length === 0) return null

	const parsed0 = parseCellKey(keys[0])
	if (!parsed0) return null
	const seg = getKeyframeSegmentBounds(parsed0.layerId, parsed0.frameIndex)
	if (!seg) return null

	const expectedStart = seg.startKeyframe + 1
	const expectedEnd = seg.endKeyframe - 1
	if (expectedStart > expectedEnd) return null
	const expectedCount = expectedEnd - expectedStart + 1
	if (keys.length !== expectedCount) return null

	const set = new Set<number>()
	for (const k of keys) {
		const p = parseCellKey(k)
		if (!p) return null
		if (p.layerId !== parsed0.layerId) return null
		if (p.frameIndex < expectedStart || p.frameIndex > expectedEnd) return null
		set.add(p.frameIndex)
	}
	if (set.size !== expectedCount) return null
	for (let f = expectedStart; f <= expectedEnd; f++) if (!set.has(f)) return null
	return makeSegmentKey(parsed0.layerId, seg.startKeyframe, seg.endKeyframe)
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

const parseCellKey = (key: string): { layerId: string; frameIndex: number } | null => {
	const parts = key.split(':')
	if (parts.length !== 2) return null
	const layerId = parts[0]
	const frameIndex = Number(parts[1])
	if (!Number.isFinite(frameIndex)) return null
	return { layerId, frameIndex: Math.floor(frameIndex) }
}

const menuSelectedTargets = computed(() => {
	const keys = store.state.selectedCellKeys
	const out: { layerId: string; frameIndex: number }[] = []
	for (const k of keys) {
		const parsed = parseCellKey(k)
		if (parsed) out.push(parsed)
	}
	// 没有选中时，降级为菜单锚点单个
	if (out.length === 0 && menu.value) out.push({ layerId: menu.value.layerId, frameIndex: menu.value.frameIndex })
	return out
})

const getKeyframeSegmentBounds = (layerId: string, frameIndex: number): { startKeyframe: number; endKeyframe: number } | null => {
	const fi = Math.floor(Number(frameIndex))
	if (!Number.isFinite(fi)) return null
	if (timelineData.isKeyframe(layerId, fi)) return null
	const arr = keyframeIndexMap.value.get(layerId)
	if (!arr || arr.length < 2) return null
	// lowerBound: first >= fi
	let lo = 0
	let hi = arr.length
	while (lo < hi) {
		const mid = (lo + hi) >> 1
		if (arr[mid] < fi) lo = mid + 1
		else hi = mid
	}
	const endKeyframe = arr[lo]
	const startKeyframe = lo > 0 ? arr[lo - 1] : undefined
	if (startKeyframe == null || endKeyframe == null) return null
	if (!(startKeyframe < fi && fi < endKeyframe)) return null
	return { startKeyframe, endKeyframe }
}

const onFrameContextMenu = (payload: { layerId: string; frameIndex: number; clientX: number; clientY: number }) => {
	// 右键：不取消多选；若右键点在未选中格子上，则切换为单选该格子
	const key = `${payload.layerId}:${payload.frameIndex}`
	if (!selectedCellKeys.value.includes(key)) {
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
	for (const t of menuSelectedTargets.value) timelineData.addKeyframe(t.layerId, t.frameIndex)
	closeMenu()
}

const onMenuRemoveKeyframe = () => {
	if (!menu.value) return
	for (const t of menuSelectedTargets.value) timelineData.removeKeyframe(t.layerId, t.frameIndex)
	closeMenu()
}

const onMenuCopy = () => {
	if (!menu.value) return
	timelineData.copyFrame(menu.value.layerId, menu.value.frameIndex)
	closeMenu()
}

const onMenuPaste = () => {
	if (!menu.value) return
	for (const t of menuSelectedTargets.value) timelineData.pasteFrame(t.layerId, t.frameIndex)
	closeMenu()
}

const onMenuEnableEasing = () => {
	if (!menu.value) return
	for (const t of menuSelectedTargets.value) {
		if (!timelineData.canEnableEasing(t.layerId, t.frameIndex)) continue
		timelineData.enableEasing(t.layerId, t.frameIndex)
	}
	closeMenu()
}

const onMenuDisableEasing = () => {
	if (!menu.value) return
	for (const t of menuSelectedTargets.value) timelineData.disableEasing(t.layerId, t.frameIndex)
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

const playheadWorldX = computed(() => Math.round(currentFrame.value * frameWidth.value))
const playheadX = computed(() => Math.round(playheadWorldX.value - scrollLeft.value))

// 可视窗口：仅渲染当前可见帧范围（带缓冲），避免上万帧导致巨量 DOM
const visibleRange = computed(() => {
	const total = Math.max(0, frameCount.value)
	if (total <= 0) return { start: 0, end: -1 }
	const fw = Math.max(1, Number(frameWidth.value) || 1)
	const vw = Math.max(0, Number(viewportWidth.value) || 0)
	const sl = Math.max(0, Math.floor(Number(scrollLeft.value) || 0))
	const start0 = Math.floor(sl / fw)
	const end0 = Math.ceil((sl + vw) / fw)
	// 额外缓冲：快速拖动滚动条时减少频繁重建
	const buffer = Math.max(20, Math.ceil(vw / fw))
	const start = clamp(start0 - buffer, 0, Math.max(0, total - 1))
	const end = clamp(end0 + buffer, 0, Math.max(0, total - 1))
	return { start, end }
})

const visibleFrameIndices = computed<number[]>(() => {
	const { start, end } = visibleRange.value
	if (end < start) return []
	const out: number[] = []
	for (let i = start; i <= end; i++) out.push(i)
	return out
})

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
	return Math.round(worldX / frameWidth.value)
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

type BoxRect = { x: number; y: number; w: number; h: number }
const boxRect = ref<BoxRect | null>(null)

const boxRectStyle = computed(() => {
	const r = boxRect.value
	if (!r) return {}
	return {
		left: 180 + r.x + 'px',
		top: baseRowHeight + r.y + 'px',
		width: r.w + 'px',
		height: r.h + 'px',
	}
})

let boxDragging = false
let boxStart: { x: number; y: number } | null = null
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

const frameAt = (x: number) => clamp(Math.floor((x + scrollLeft.value) / frameWidth.value), 0, frameCount.value - 1)

const layerIndexAt = (y: number) => {
	// y 为 overlay 内相对坐标，从 0 开始
	const yy = Math.max(0, y) + layersScrollTop.value
	const layout = layerLayout.value
	for (let i = 0; i < layout.length; i++) {
		const row = layout[i]
		if (yy >= row.top && yy < row.top + row.height) return i
	}
	return Math.max(0, layout.length - 1)
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
	if (ev.shiftKey && store.state.selectedCellKeys.length > 0 && store.state.lastSelectedCellKey) {
		const parsed = parseCellKey(store.state.lastSelectedCellKey)
		if (parsed) {
			const li = layers.value.findIndex((l) => l.id === parsed.layerId)
			if (li >= 0) {
				boxShiftMode = true
				boxAdditive = false
				const anchorX = clamp(parsed.frameIndex * frameWidth.value - scrollLeft.value, 0, overlay.width)
				const anchorY = clamp((layerLayout.value[li]?.top ?? 0) - layersScrollTop.value, 0, overlay.height)
				boxStart = { x: anchorX, y: anchorY }
				boxRect.value = { x: anchorX, y: anchorY, w: frameWidth.value, h: baseRowHeight }
				boxMoved = true
			}
		}
	}

	if (!boxStart) {
		boxStart = {
			x: clamp(ev.clientX - overlay.left, 0, overlay.width),
			y: clamp(ev.clientY - overlay.top, 0, overlay.height),
		}
		boxRect.value = null
	}
	;(ev.currentTarget as HTMLElement)?.setPointerCapture?.(ev.pointerId)

	const onMove = (e: PointerEvent) => {
		if (!boxDragging || !boxStart) return
		const x2 = clamp(e.clientX - overlay.left, 0, overlay.width)
		const y2 = clamp(e.clientY - overlay.top, 0, overlay.height)
		const dx = x2 - boxStart.x
		const dy = y2 - boxStart.y
		const threshold2 = 4 * 4
		if (!boxMoved && dx * dx + dy * dy < threshold2) return
		boxMoved = true

		const x = Math.min(boxStart.x, x2)
		const y = Math.min(boxStart.y, y2)
		const w = Math.abs(x2 - boxStart.x)
		const h = Math.abs(y2 - boxStart.y)
		boxRect.value = { x, y, w, h }
		if (layers.value.length === 0) return

		const startFrame = frameAt(x)
		const endFrame = frameAt(x + w)
		const li0 = clamp(layerIndexAt(y), 0, Math.max(0, layers.value.length - 1))
		const li1 = clamp(layerIndexAt(y + h), 0, Math.max(0, layers.value.length - 1))
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
			// 单击：始终允许单帧选择（便于段内设置关键帧）
			store.dispatch('toggleCellSelection', { layerId: framePointer.layerId, frameIndex: framePointer.frameIndex, additive: boxAdditive })
		}

		boxDragging = false
		boxStart = null
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
	window.addEventListener('resize', syncViewportMetrics)
	window.addEventListener('pointerdown', onGlobalPointerDown, { capture: true })
	window.addEventListener('keydown', onGlobalKeydown, { capture: true })
})

onBeforeUnmount(() => {
	if (scrollRaf) cancelAnimationFrame(scrollRaf)
	window.removeEventListener('resize', syncViewportMetrics)
	window.removeEventListener('pointerdown', onGlobalPointerDown, { capture: true } as any)
	window.removeEventListener('keydown', onGlobalKeydown, { capture: true } as any)
	closeMenu()
})

watch(
	() => [timelineWidth.value, frameWidth.value] as const,
	() => syncViewportMetrics()
)

watch(
	() => [store.state.keyframeKeys.length, store.state.easingSegmentKeys.length, frameCount.value] as const,
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