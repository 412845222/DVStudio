<template>
	<div ref="shellRef" class="vs-shell">
		<canvas ref="canvasRef" class="vs-canvas" :class="{ selecting: isCtrlDown }" />
		<RulerOverlay
			:width="shellSize.width"
			:height="shellSize.height"
			:pan-x="viewport.panX"
			:pan-y="viewport.panY"
			:zoom="viewport.zoom"
			:origin-x="stageOrigin.x"
			:origin-y="stageOrigin.y"
			:ruler-size="RULER_SIZE"
		/>

		<VideoStudioRightPanel ref="rightPanelRef" />
		<VideoSceneToolbar ref="toolbarRef" />

		<!-- HTML overlay for selection resize handles -->
		<div class="vs-overlay">
			<div v-if="marquee.active" class="vs-marquee" :style="marquee.style" />
			<template v-if="showGuides">
				<div v-if="snapGuides.x != null" class="vs-snap-line v" :style="{ left: snapGuides.x + 'px' }" />
				<div v-if="snapGuides.y != null" class="vs-snap-line h" :style="{ top: snapGuides.y + 'px' }" />
			</template>
			<template v-if="multiControlPoints.length">
				<div v-for="cp in multiControlPoints" :key="cp.nodeId" class="vs-cp-passive">
					<ResizeControlPoints
						:handle-styles="cp.handleStyles"
						:show-size="false"
						:size-text="''"
						:size-style="{ left: '0px', top: '0px' }"
						@handle-down="() => {}"
					/>
					<LineControlPoints
						v-if="cp.lineHandleStyles"
						:handle-styles="cp.lineHandleStyles"
						@point-down="() => {}"
					/>
				</div>
			</template>
			<ResizeControlPoints
				v-if="overlay.visible"
				:handle-styles="overlay.handleStyles"
				:show-size="overlay.showSize"
				:size-text="overlay.sizeText"
				:size-style="overlay.sizeStyle"
				@handle-down="onHandleDown"
			/>
			<LineControlPoints v-if="lineOverlay.visible" :handle-styles="lineOverlay.handleStyles" @point-down="onLinePointDown" />
		</div>

		<div class="vs-tools">
			<button class="vs-tool" type="button" :class="{ active: showGuides }" @click="toggleGuides">辅助线</button>
			<button class="vs-tool" type="button" :class="{ active: snapEnabled }" @click="toggleSnap">磁吸</button>
		</div>

		<form v-if="showSizePanel" class="vs-form" @submit.prevent>
			<label class="vs-label">
				<span>宽</span>
				<input v-model.number="inputWidth" class="vs-input" type="number" min="1" step="1" @change="applySize" />
			</label>
			<label class="vs-label">
				<span>高</span>
				<input v-model.number="inputHeight" class="vs-input" type="number" min="1" step="1" @change="applySize" />
			</label>
			<button class="vs-btn" type="button" @click="fitStage">屏幕适配</button>
		</form>

		<form v-if="showBackgroundPanel" class="vs-form vs-bg-form" @submit.prevent>
			<label class="vs-label">
				<span>类型</span>
				<select v-model="bgType" class="vs-select" @change="applyBackground">
					<option value="color">颜色</option>
					<option value="image">图片</option>
				</select>
			</label>

			<label class="vs-label">
				<span>透明</span>
				<input v-model.number="bgOpacity" class="vs-input" type="number" min="0" max="1" step="0.05" @input="applyBackground" />
			</label>

			<template v-if="bgType === 'color'">
				<label class="vs-label">
					<span>颜色</span>
					<input v-model="bgColor" class="vs-input" type="text" @input="scheduleApplyBackground" />
				</label>
				<input v-model="bgColor" class="vs-color" type="color" @input="applyBackground" />
			</template>

			<template v-else>
				<label class="vs-label" style="flex: 1; min-width: 0">
					<span>图片</span>
					<input
						v-model="bgImageSrc"
						class="vs-input"
						type="text"
						placeholder="https://... 或 blob:..."
						@input="scheduleApplyBackground"
					/>
				</label>
				<label class="vs-file">
					<input class="vs-file-input" type="file" accept="image/*" @change="onPickBgFile" />
					<span class="vs-file-btn">选择</span>
				</label>
				<label class="vs-label">
					<span>适配</span>
					<select v-model="bgFit" class="vs-select" @change="applyBackground">
						<option value="contain">contain</option>
						<option value="cover">cover</option>
						<option value="fill">fill</option>
						<option value="none">none</option>
						<option value="scale-down">scale-down</option>
					</select>
				</label>
				<label class="vs-label">
					<span>重复</span>
					<select v-model="bgRepeat" class="vs-select" @change="applyBackground">
						<option :value="false">不重复</option>
						<option :value="true">重复</option>
					</select>
				</label>
			</template>
		</form>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, reactive, shallowRef, ref, watch } from 'vue'
import { useStore } from 'vuex'
import RulerOverlay from './ruler/RulerOverlay.vue'
import { VideoStudioKey, type VideoStudioState } from '../../store/videostudio'
import { VideoSceneKey, VideoSceneStore } from '../../store/videoscene'
import VideoSceneToolbar from './parts/VideoSceneToolbar.vue'
import VideoStudioRightPanel from './panels/VideoStudioRightPanel.vue'
import { DwebCanvasGL } from '../../DwebGL/DwebCanvasGL'
import { DwebVideoScene } from '../../DwebGL/DwebVideoScene'
import { TimelineStore } from '../../store/timeline'
import { containsFrame, type TimelineFrameSpan } from '../../store/timeline/spans'
import { DwebCanvasGLKey } from './VideoSceneRuntime'
import { applyTimelineAnimationAtFrame } from './anim/timelineAnimation'
import ResizeControlPoints, { type Corner } from './parts/nodeControlPoints/ResizeControlPoints.vue'
import LineControlPoints, { type LinePointKind } from './parts/nodeControlPoints/LineControlPoints.vue'
import {
	buildStartXYByIdForMove,
	beginMoveSnapSessionForNode,
	beginResizeSnapSessionForNode,
 	computeLinePointPatchFromWorld,
	computeMovableSelectionIds,
	buildNodeOverlayGeometry,
	getLayerNodeTree,
	findLayerIdByNodeIdInLayers,
	findUserNodeTransformInLayers,
	findUserNodeWithWorldInLayers,
	getNodeLocalXY,
	resolveMarqueeSelection,
	stepMoveSnapSession,
	stepResizeSnapSession,
	shouldCollapseMultiSelectionOnPointerUp,
	type MoveSnapSession,
	type ResizeSnapSession,
	worldToLocalRotated,
} from '../../core/scene'

const isCtrlDown = ref(false)
const onKeyDown = (ev: KeyboardEvent) => {
	if (ev.key === 'Control') isCtrlDown.value = true
}
const onKeyUp = (ev: KeyboardEvent) => {
	if (ev.key === 'Control') isCtrlDown.value = false
}
const onBlur = () => {
	isCtrlDown.value = false
}

let applyAnimRaf: number | null = null
let isApplyingTimelineAnimation = false
const scheduleApplyTimelineAnimation = () => {
	if (applyAnimRaf != null) return
	applyAnimRaf = window.requestAnimationFrame(() => {
		applyAnimRaf = null
		isApplyingTimelineAnimation = true
		applyTimelineAnimationAtFrame(TimelineStore.state.currentFrame)
		isApplyingTimelineAnimation = false
	})
}

const getSingleSelectedKeyframeCell = (): { layerId: string; frameIndex: number } | null => {
	const entries = Object.entries(TimelineStore.state.selectedSpansByLayer).filter(([, spans]) => spans && spans.length)
	if (entries.length !== 1) return null
	const layerId = entries[0][0]
	const spans = entries[0][1] as TimelineFrameSpan[]
	if (!spans || spans.length !== 1) return null
	const s = spans[0]
	const frameIndex = typeof s === 'number' ? Math.floor(s) : s && typeof s === 'object' && s.start === s.end ? Math.floor(s.start) : null
	if (frameIndex == null || !Number.isFinite(frameIndex)) return null
	// 必须是该图层的关键帧格子
	const kfSpans = TimelineStore.state.keyframeSpansByLayer[layerId] ?? []
	if (!containsFrame(kfSpans, frameIndex)) return null
	return { layerId, frameIndex }
}

let keyframeWriteRaf: number | null = null
let pendingKeyframeWrite: { layerId: string; frameIndex: number } | null = null

// 高频交互（拖拽/缩放）期间不落盘快照：只标记 dirty，并在结束时写回一次
const keyframeDirtyLayerIds = new Set<string>()
const isHighFreqEditing = () => {
	return drag.value.mode === 'move' || resize.value.active || lineDrag.value.active
}

const flushDirtyKeyframeWriteBack = () => {
	if (isApplyingTimelineAnimation) return
	if (keyframeDirtyLayerIds.size === 0) return
	const selected = getSingleSelectedKeyframeCell()
	if (!selected) {
		keyframeDirtyLayerIds.clear()
		return
	}
	// 仅对“当前单选关键帧格子”的图层写回
	if (keyframeDirtyLayerIds.has(selected.layerId)) scheduleWriteBackSelectedKeyframe(selected.layerId)
	keyframeDirtyLayerIds.clear()
}

const scheduleWriteBackSelectedKeyframe = (layerId: string) => {
	if (isApplyingTimelineAnimation) return
	const selected = getSingleSelectedKeyframeCell()
	if (!selected) return
	if (selected.layerId !== layerId) return
	pendingKeyframeWrite = selected
	if (keyframeWriteRaf != null) return
	keyframeWriteRaf = window.requestAnimationFrame(() => {
		keyframeWriteRaf = null
		const p = pendingKeyframeWrite
		pendingKeyframeWrite = null
		if (!p) return
		// 写回“全画布快照”；TimelineStore 内部会做深拷贝，并只在该帧确实为关键帧时落盘
		TimelineStore.dispatch('setStageKeyframeSnapshotRange', {
			startFrame: p.frameIndex,
			endFrame: p.frameIndex,
			layers: VideoSceneStore.state.layers,
		})
	})
}

const store = useStore<VideoStudioState>(VideoStudioKey)

provide(VideoSceneKey, VideoSceneStore)

const dwebCanvasRef = shallowRef<DwebCanvasGL | null>(null)
provide(DwebCanvasGLKey, dwebCanvasRef)
const showSizePanel = computed(() => VideoSceneStore.state.showSizePanel)
const showBackgroundPanel = computed(() => VideoSceneStore.state.showBackgroundPanel)
const shellRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const toolbarRef = ref<InstanceType<typeof VideoSceneToolbar> | null>(null)
const rightPanelRef = ref<InstanceType<typeof VideoStudioRightPanel> | null>(null)

const stageWidth = computed(() => store.state.stage.width)
const stageHeight = computed(() => store.state.stage.height)
const fitRequestedAt = computed(() => store.state.stage.fitRequestedAt)
const showGuides = computed(() => store.state.stage.showGuides)
const snapEnabled = computed(() => store.state.stage.snapEnabled)
const viewport = computed(() => store.state.stage.viewport)

const RULER_SIZE = 24
const stageOrigin = computed(() => ({ x: -stageWidth.value / 2, y: -stageHeight.value / 2 }))

const inputWidth = ref<number>(1920)
const inputHeight = ref<number>(1080)

const stageBackground = computed(() => store.state.stage.background)
const bgType = ref<'color' | 'image'>('color')
const bgColor = ref<string>('#111111')
const bgImageSrc = ref<string>('')
const bgFit = ref<'contain' | 'cover' | 'fill' | 'none' | 'scale-down'>('contain')
const bgRepeat = ref<boolean>(false)
const bgOpacity = ref<number>(1)

let dwebCanvas: DwebCanvasGL | null = null
let scene: DwebVideoScene | null = null
let unsubscribeVideoScene: (() => void) | null = null
let onEditorRestored: (() => void) | null = null

let liveRenderRaf: number | null = null
const startLiveRender = () => {
	if (liveRenderRaf != null) return
	const tick = () => {
		liveRenderRaf = window.requestAnimationFrame(tick)
		// Continuous render when selected: reduces filter ghosting during edits.
		dwebCanvas?.render()
	}
	liveRenderRaf = window.requestAnimationFrame(tick)
}

const stopLiveRender = () => {
	if (liveRenderRaf == null) return
	window.cancelAnimationFrame(liveRenderRaf)
	liveRenderRaf = null
}

watch(
	() => VideoSceneStore.state.selectedNodeId,
	(id) => {
		if (id) startLiveRender()
		else stopLiveRender()
	},
	{ immediate: true }
)

watch(
	() => TimelineStore.state.currentFrame,
	() => {
		scheduleApplyTimelineAnimation()
	},
	{ immediate: true }
)

watch(
	() => (TimelineStore.state as any).nodeKeyframeVersion,
	() => {
		scheduleApplyTimelineAnimation()
	},
	{ immediate: true }
)

watch(
	() => (TimelineStore.state as any).stageKeyframeVersion,
	() => {
		scheduleApplyTimelineAnimation()
	},
	{ immediate: true }
)

watch(
	() => TimelineStore.state.keyframeVersion,
	() => {
		scheduleApplyTimelineAnimation()
	},
	{ immediate: true }
)

watch(
	() => TimelineStore.state.easingSegmentKeys,
	() => {
		scheduleApplyTimelineAnimation()
	},
	{ deep: true }
)

watch(
	() => TimelineStore.state.easingCurves,
	() => {
		scheduleApplyTimelineAnimation()
	},
	{ deep: true }
)

watch(
	() => [stageWidth.value, stageHeight.value] as const,
	([w, h]) => {
		inputWidth.value = w
		inputHeight.value = h
	},
	{ immediate: true }
)

watch(
	() => stageBackground.value,
	(bg) => {
		bgType.value = bg.type
		bgColor.value = bg.color
		bgOpacity.value = Number.isFinite(bg.opacity as any) ? Number(bg.opacity) : 1
		bgImageSrc.value = bg.imageSrc
		bgFit.value = bg.imageFit
		bgRepeat.value = bg.repeat
		scene?.setStageBackground?.({
			type: bg.type,
			color: bg.color,
			opacity: bg.opacity,
			imageSrc: bg.imageSrc,
			imageFit: bg.imageFit,
			repeat: bg.repeat,
		})
		dwebCanvas?.requestRender()
	},
	{ immediate: true, deep: true }
)

const shellSize = ref({ width: 0, height: 0 })
let resizeObserver: ResizeObserver | null = null

const ensureCanvas = () => {
	const canvasEl = canvasRef.value
	if (!canvasEl) return
	if (!dwebCanvas) {
		dwebCanvas = new DwebCanvasGL(canvasEl)
		dwebCanvasRef.value = dwebCanvas
	}
	return dwebCanvas
}

const applySize = () => {
	const w = Number(inputWidth.value)
	const h = Number(inputHeight.value)
	if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return
	store.dispatch('setStageSize', { width: Math.round(w), height: Math.round(h) })
}

const applyBackground = () => {
	store.dispatch('setStageBackground', {
		type: bgType.value,
		color: bgColor.value,
		opacity: bgOpacity.value,
		imageSrc: bgImageSrc.value,
		imageFit: bgFit.value,
		repeat: bgRepeat.value,
	})
}

let bgApplyTimer: number | null = null
const scheduleApplyBackground = () => {
	if (bgApplyTimer != null) window.clearTimeout(bgApplyTimer)
	bgApplyTimer = window.setTimeout(() => {
		bgApplyTimer = null
		applyBackground()
	}, 80)
}

const onPickBgFile = (ev: Event) => {
	const input = ev.target as HTMLInputElement | null
	const file = input?.files?.[0]
	if (!file) return
	const url = URL.createObjectURL(file)
	bgType.value = 'image'
	bgImageSrc.value = url
	applyBackground()
}

const measureInsets = () => {
	const rightPanelWidth = Math.round(rightPanelRef.value?.rootEl?.getBoundingClientRect().width ?? 0)
	const bottomToolbarHeight = Math.round(toolbarRef.value?.rootEl?.getBoundingClientRect().height ?? 0)
	VideoSceneStore.dispatch('setLayoutInsets', { rightPanelWidth, bottomToolbarHeight })
}

const getFitInsets = () => {
	const right = Math.max(0, VideoSceneStore.state.layoutInsets?.rightPanelWidth ?? 0)
	const bottom = Math.max(0, VideoSceneStore.state.layoutInsets?.bottomToolbarHeight ?? 0)
	return { left: RULER_SIZE, top: RULER_SIZE, right, bottom }
}

const fitStage = () => {
	store.dispatch('fitStage')
	const canvas = ensureCanvas()
	if (!canvas) return
	measureInsets()
	canvas.fitToStage({ width: stageWidth.value, height: stageHeight.value }, 24, getFitInsets())
}

const toggleGuides = () => {
	store.dispatch('toggleGuides')
	// WebGL 版本暂不绘制 guides，仅保留 UI 状态
}

const toggleSnap = () => {
	store.dispatch('toggleSnap')
}

const snapGuides = reactive<{ x: number | null; y: number | null }>({ x: null, y: null })
const moveSnapSession = shallowRef<MoveSnapSession | null>(null)
const resizeSnapSession = shallowRef<ResizeSnapSession | null>(null)

// 鼠标交互：命中节点则拖拽移动；空白处拖拽平移；滚轴缩放
type DragMode = 'none' | 'pan' | 'move'
const drag = ref<{
	mode: DragMode
	last?: { x: number; y: number }
	nodeId?: string
	nodeIds?: string[]
	startScreen?: { x: number; y: number }
	startWorld?: { x: number; y: number }
	startXY?: { x: number; y: number }
	startXYById?: Record<string, { x: number; y: number }>
}>({ mode: 'none' })

const marquee = reactive({
	active: false,
	start: { x: 0, y: 0 },
	end: { x: 0, y: 0 },
	style: { left: '0px', top: '0px', width: '0px', height: '0px' } as Record<string, string>,
})

const updateMarqueeStyle = () => {
	const x0 = Math.min(marquee.start.x, marquee.end.x)
	const y0 = Math.min(marquee.start.y, marquee.end.y)
	const x1 = Math.max(marquee.start.x, marquee.end.x)
	const y1 = Math.max(marquee.start.y, marquee.end.y)
	marquee.style = {
		left: `${Math.round(x0)}px`,
		top: `${Math.round(y0)}px`,
		width: `${Math.round(Math.max(0, x1 - x0))}px`,
		height: `${Math.round(Math.max(0, y1 - y0))}px`,
	}
}

const multiControlPoints = reactive(
	[] as Array<{
		nodeId: string
		handleStyles: {
			tl: Record<string, string>
			tr: Record<string, string>
			bl: Record<string, string>
			br: Record<string, string>
		}
		lineHandleStyles?: {
			start: Record<string, string>
			anchor: Record<string, string>
			end: Record<string, string>
		}
	}>
)

const resize = ref<{
	active: boolean
	corner?: Corner
	nodeId?: string
	layerId?: string
	anchorWorld?: { x: number; y: number }
	parentWorld?: { x: number; y: number }
}>({
	active: false,
})

const overlay = reactive({
	visible: false,
	showSize: false,
	sizeText: '',
	handleStyles: {
		tl: { left: '0px', top: '0px' } as Record<string, string>,
		tr: { left: '0px', top: '0px' } as Record<string, string>,
		bl: { left: '0px', top: '0px' } as Record<string, string>,
		br: { left: '0px', top: '0px' } as Record<string, string>,
	},
	sizeStyle: { left: '0px', top: '0px' } as Record<string, string>,
})

const lineOverlay = reactive({
	visible: false,
	handleStyles: {
		start: { left: '0px', top: '0px' } as Record<string, string>,
		anchor: { left: '0px', top: '0px' } as Record<string, string>,
		end: { left: '0px', top: '0px' } as Record<string, string>,
	},
})

const lineDrag = ref<{
	active: boolean
	kind?: LinePointKind
	nodeId?: string
	layerId?: string
	worldCenter?: { x: number; y: number }
	rotation?: number
}>(
	{ active: false }
)

const getLocalPoint = (ev: PointerEvent) => {
	const rect = (ev.currentTarget as HTMLCanvasElement).getBoundingClientRect()
	return { x: ev.clientX - rect.left, y: ev.clientY - rect.top }
}

const getLocalPointFromClient = (clientX: number, clientY: number) => {
	const el = canvasRef.value
	if (!el) return { x: 0, y: 0 }
	const rect = el.getBoundingClientRect()
	return { x: clientX - rect.left, y: clientY - rect.top }
}

const findUserNodeTransform = (nodeId: string) => findUserNodeTransformInLayers(VideoSceneStore.state.layers, nodeId)
const findUserNodeWithWorld = (nodeId: string) => findUserNodeWithWorldInLayers(VideoSceneStore.state.layers, nodeId)
const findLayerIdByNodeId = (nodeId: string) => findLayerIdByNodeIdInLayers(VideoSceneStore.state.layers, nodeId)

const updateOverlay = () => {
	const canvas = dwebCanvas
	const nodeId = VideoSceneStore.state.selectedNodeId
	const selectedIds = VideoSceneStore.state.selectedNodeIds ?? []

	// multi-select: show control points for all selected nodes (display-only)
	if (canvas && selectedIds.length > 1) {
		multiControlPoints.splice(0, multiControlPoints.length)
		for (const id of selectedIds) {
			const hit = findUserNodeWithWorld(id)
			if (!hit) continue
			const t = hit.node.transform as any
			const geom = buildNodeOverlayGeometry({
				worldCenter: hit.world,
				width: Number(t.width ?? 0),
				height: Number(t.height ?? 0),
				rotation: Number((t as any).rotation ?? 0),
				userType: (hit.node as any)?.userType,
				props: (hit.node as any)?.props,
			})
			const tl = canvas.worldToScreen(geom.corners.tl)
			const tr = canvas.worldToScreen(geom.corners.tr)
			const bl = canvas.worldToScreen(geom.corners.bl)
			const br = canvas.worldToScreen(geom.corners.br)
			const px = (v: number) => `${Math.round(v)}px`
			const entry: (typeof multiControlPoints)[number] = {
				nodeId: id,
				handleStyles: {
					tl: { left: px(tl.x), top: px(tl.y) },
					tr: { left: px(tr.x), top: px(tr.y) },
					bl: { left: px(bl.x), top: px(bl.y) },
					br: { left: px(br.x), top: px(br.y) },
				},
			}

			if (geom.linePoints) {
				const sS = canvas.worldToScreen(geom.linePoints.start)
				const aS = canvas.worldToScreen(geom.linePoints.anchor)
				const eS = canvas.worldToScreen(geom.linePoints.end)
				entry.lineHandleStyles = {
					start: { left: px(sS.x), top: px(sS.y) },
					anchor: { left: px(aS.x), top: px(aS.y) },
					end: { left: px(eS.x), top: px(eS.y) },
				}
			}

			multiControlPoints.push(entry)
		}
		overlay.visible = false
		overlay.showSize = false
		lineOverlay.visible = false
		return
	}

	multiControlPoints.splice(0, multiControlPoints.length)
	if (!canvas || !nodeId) {
		overlay.visible = false
		overlay.showSize = false
		lineOverlay.visible = false
		return
	}
	const hit = findUserNodeWithWorld(nodeId)
	if (!hit) {
		overlay.visible = false
		overlay.showSize = false
		lineOverlay.visible = false
		return
	}
	const t = hit.node.transform as any
	const geom = buildNodeOverlayGeometry({
		worldCenter: hit.world,
		width: Number(t.width ?? 0),
		height: Number(t.height ?? 0),
		rotation: Number((t as any).rotation ?? 0),
		userType: (hit.node as any)?.userType,
		props: (hit.node as any)?.props,
	})
	const tl = canvas.worldToScreen(geom.corners.tl)
	const tr = canvas.worldToScreen(geom.corners.tr)
	const bl = canvas.worldToScreen(geom.corners.bl)
	const br = canvas.worldToScreen(geom.corners.br)
	const px = (v: number) => `${Math.round(v)}px`
	overlay.visible = true
	overlay.handleStyles.tl = { left: px(tl.x), top: px(tl.y) }
	overlay.handleStyles.tr = { left: px(tr.x), top: px(tr.y) }
	overlay.handleStyles.bl = { left: px(bl.x), top: px(bl.y) }
	overlay.handleStyles.br = { left: px(br.x), top: px(br.y) }
	overlay.sizeText = geom.sizeText
	overlay.sizeStyle = { left: px(tl.x + 10), top: px(tl.y - 18) }

	// line control points (start/end/anchor)
	if (geom.linePoints) {
		const sS = canvas.worldToScreen(geom.linePoints.start)
		const aS = canvas.worldToScreen(geom.linePoints.anchor)
		const eS = canvas.worldToScreen(geom.linePoints.end)
		lineOverlay.visible = true
		lineOverlay.handleStyles.start = { left: px(sS.x), top: px(sS.y) }
		lineOverlay.handleStyles.anchor = { left: px(aS.x), top: px(aS.y) }
		lineOverlay.handleStyles.end = { left: px(eS.x), top: px(eS.y) }
	} else {
		lineOverlay.visible = false
	}
}

const onHandleDown = (corner: Corner, ev: PointerEvent) => {
	const canvas = ensureCanvas()
	if (!canvas) return
	const nodeId = VideoSceneStore.state.selectedNodeId
	if (!nodeId) return
	const hit = findUserNodeWithWorld(nodeId)
	if (!hit) return
	const t = hit.node.transform as any
	const layerId = hit.layerId
	const cx = hit.world.x
	const cy = hit.world.y
	const w = Number(t.width ?? 0)
	const h = Number(t.height ?? 0)
	const rotation = Number((t as any).rotation ?? 0)
	const geom = buildNodeOverlayGeometry({
		worldCenter: { x: cx, y: cy },
		width: w,
		height: h,
		rotation,
		userType: (hit.node as any)?.userType,
		props: (hit.node as any)?.props,
	})
	const tl = geom.corners.tl
	const tr = geom.corners.tr
	const bl = geom.corners.bl
	const br = geom.corners.br
	const anchorWorld = (() => {
		if (corner === 'tl') return br
		if (corner === 'tr') return bl
		if (corner === 'bl') return tr
		return tl
	})()
	resize.value = { active: true, corner, nodeId, layerId, anchorWorld, parentWorld: hit.parentWorld }
	overlay.showSize = true
	resizeSnapSession.value = snapEnabled.value
		? beginResizeSnapSessionForNode({
				state: VideoSceneStore.state,
				nodeId,
				stageWidth: stageWidth.value,
				stageHeight: stageHeight.value,
				zoom: canvas.viewport.zoom,
				basePx: 6,
			})
		: null
	try {
		;(ev.currentTarget as HTMLElement)?.setPointerCapture?.(ev.pointerId)
	} catch {
		// ignore
	}
}

const onLinePointDown = (kind: LinePointKind, ev: PointerEvent) => {
	const canvas = ensureCanvas()
	if (!canvas) return
	const nodeId = VideoSceneStore.state.selectedNodeId
	if (!nodeId) return
	const hit = findUserNodeWithWorld(nodeId)
	if (!hit) return
	if ((hit.node as any)?.userType !== 'line') return
	const rotation = Number(((hit.node.transform as any) ?? {}).rotation ?? 0)
	lineDrag.value = {
		active: true,
		kind,
		nodeId,
		layerId: hit.layerId,
		worldCenter: { x: hit.world.x, y: hit.world.y },
		rotation,
	}
	try {
		;(ev.currentTarget as HTMLElement)?.setPointerCapture?.(ev.pointerId)
	} catch {
		// ignore
	}
}

const onDocPointerMove = (ev: PointerEvent) => {
	if (lineDrag.value.active) {
		const canvas = ensureCanvas()
		if (!canvas) return
		const { nodeId, layerId, kind, worldCenter, rotation } = lineDrag.value
		if (!nodeId || !layerId || !kind || !worldCenter || rotation == null) return
		const p = getLocalPointFromClient(ev.clientX, ev.clientY)
		const w = canvas.screenToWorld(p)
		const patch = computeLinePointPatchFromWorld({ kind, worldPoint: w, worldCenter, rotation })
		VideoSceneStore.dispatch('updateNodeProps', { layerId, nodeId, patch })
		return
	}
	if (!resize.value.active) return
	const canvas = ensureCanvas()
	if (!canvas) return
	const { nodeId, layerId, anchorWorld, parentWorld, corner } = resize.value
	if (!nodeId || !layerId || !anchorWorld || !parentWorld) return
	const p = getLocalPointFromClient(ev.clientX, ev.clientY)
	const w = canvas.screenToWorld(p)

	// resize happens in world space (axis-aligned) and then written back to local = world - parentWorld
	const minSize = 1
	let movingX = w.x
	let movingY = w.y
	// prevent flipping across anchor: keep moving corner on its side
	if (corner === 'tl' || corner === 'bl') movingX = Math.min(movingX, anchorWorld.x - minSize)
	if (corner === 'tr' || corner === 'br') movingX = Math.max(movingX, anchorWorld.x + minSize)
	if (corner === 'tl' || corner === 'tr') movingY = Math.min(movingY, anchorWorld.y - minSize)
	if (corner === 'bl' || corner === 'br') movingY = Math.max(movingY, anchorWorld.y + minSize)

	let width = Math.max(minSize, Math.abs(anchorWorld.x - movingX))
	let height = Math.max(minSize, Math.abs(anchorWorld.y - movingY))
	let cx = (anchorWorld.x + movingX) / 2
	let cy = (anchorWorld.y + movingY) / 2

	// snap during resize: adjust moving edge (and center/size accordingly)
	const focusedId = VideoSceneStore.state.focusedNodeId
	if (snapEnabled.value && focusedId && focusedId === nodeId && corner) {
		const session =
			resizeSnapSession.value ??
			beginResizeSnapSessionForNode({
				state: VideoSceneStore.state,
				nodeId,
				stageWidth: stageWidth.value,
				stageHeight: stageHeight.value,
				zoom: canvas.viewport.zoom,
				basePx: 6,
			})
		const stepped = stepResizeSnapSession({
			session,
			corner,
			anchorWorld,
			movingX,
			movingY,
			cx,
			cy,
			minSize,
		})
		resizeSnapSession.value = stepped.session
		const snapped = stepped.result
		movingX = snapped.movingX
		movingY = snapped.movingY
		width = snapped.width
		height = snapped.height
		cx = snapped.cx
		cy = snapped.cy

		if (showGuides.value && snapped.snappedLineX != null) {
			const sp = canvas.worldToScreen({ x: snapped.snappedLineX, y: cy })
			snapGuides.x = Math.round(sp.x)
		} else {
			snapGuides.x = null
		}
		if (showGuides.value && snapped.snappedLineY != null) {
			const sp = canvas.worldToScreen({ x: cx, y: snapped.snappedLineY })
			snapGuides.y = Math.round(sp.y)
		} else {
			snapGuides.y = null
		}
	} else {
		// not snapping during resize
		snapGuides.x = null
		snapGuides.y = null
		resizeSnapSession.value = null
	}
	// 写回局部坐标：local = world - parentWorld
	VideoSceneStore.dispatch('updateNodeTransform', {
		layerId,
		nodeId,
		patch: { x: cx - parentWorld.x, y: cy - parentWorld.y, width, height },
	})
}

const onDocPointerUp = () => {
	if (lineDrag.value.active) {
		lineDrag.value = { active: false }
		flushDirtyKeyframeWriteBack()
		return
	}
	if (!resize.value.active) return
	resize.value = { active: false }
	overlay.showSize = false
	snapGuides.x = null
	snapGuides.y = null
	resizeSnapSession.value = null
	flushDirtyKeyframeWriteBack()
}

const onPointerDown = (ev: PointerEvent) => {
	if (ev.button !== 0) return
	const canvas = ensureCanvas()
	if (!canvas) return
	const p = getLocalPoint(ev)
	if (ev.ctrlKey) {
		marquee.active = true
		marquee.start = { x: p.x, y: p.y }
		marquee.end = { x: p.x, y: p.y }
		updateMarqueeStyle()
		;(ev.currentTarget as HTMLElement)?.setPointerCapture?.(ev.pointerId)
		return
	}
	const hit = scene?.hitTest(canvas, p) ?? null
	if (hit) {
		if (hit.layerId && hit.layerId !== VideoSceneStore.state.activeLayerId) {
			VideoSceneStore.dispatch('setActiveLayer', { layerId: hit.layerId })
			TimelineStore.dispatch('selectLayer', { layerId: hit.layerId })
		}
		const world = canvas.screenToWorld(p)
		const selectedIds = VideoSceneStore.state.selectedNodeIds ?? []
		const isMulti = selectedIds.length > 1
		const isHitSelected = isMulti && selectedIds.includes(hit.nodeId)
		if (isHitSelected) {
			const activeLayerId = VideoSceneStore.state.activeLayerId
			const activeLayerTree = getLayerNodeTree(VideoSceneStore.state, activeLayerId)
			const sameLayerIds = selectedIds.filter((id) => findLayerIdByNodeId(id) === activeLayerId)
			const movableIds = computeMovableSelectionIds(activeLayerTree, sameLayerIds)
			const startXYById = buildStartXYByIdForMove(activeLayerTree, movableIds)
			drag.value = { mode: 'move', nodeId: hit.nodeId, nodeIds: movableIds, startScreen: p, startWorld: world, startXYById }
		} else {
			// 点击任意节点：清空多选，单选该节点
			VideoSceneStore.dispatch('setSelectedNode', { nodeId: hit.nodeId })
			VideoSceneStore.dispatch('setFocusedNode', { nodeId: hit.nodeId })
			const hitLayerTree = getLayerNodeTree(VideoSceneStore.state, hit.layerId)
			const t = getNodeLocalXY(hitLayerTree, hit.nodeId)
			drag.value = {
				mode: 'move',
				nodeId: hit.nodeId,
				startScreen: p,
				startWorld: world,
				startXY: { x: t?.x ?? 0, y: t?.y ?? 0 },
			}
			moveSnapSession.value = snapEnabled.value
				? beginMoveSnapSessionForNode({
						state: VideoSceneStore.state,
						nodeId: hit.nodeId,
						stageWidth: stageWidth.value,
						stageHeight: stageHeight.value,
						zoom: canvas.viewport.zoom,
						basePx: 6,
					})
				: null
		}
	} else {
		VideoSceneStore.dispatch('setSelectedNode', { nodeId: null })
		drag.value = { mode: 'pan', last: { x: ev.clientX, y: ev.clientY } }
		moveSnapSession.value = null
		resizeSnapSession.value = null
	}
	;(ev.currentTarget as HTMLElement)?.setPointerCapture?.(ev.pointerId)
}

const onPointerMove = (ev: PointerEvent) => {
	if (marquee.active) {
		const p = getLocalPoint(ev)
		marquee.end = { x: p.x, y: p.y }
		updateMarqueeStyle()
		return
	}

	if (drag.value.mode === 'none') return
	const canvas = ensureCanvas()
	if (!canvas) return
	if (drag.value.mode === 'pan') {
		if (!drag.value.last) return
		const dx = ev.clientX - drag.value.last.x
		const dy = ev.clientY - drag.value.last.y
		drag.value.last = { x: ev.clientX, y: ev.clientY }
		canvas.panBy({ x: dx, y: dy })
		return
	}
	if (drag.value.mode === 'move') {
		if (!drag.value.nodeId || !drag.value.startWorld) return
		const p = getLocalPoint(ev)
		const world = canvas.screenToWorld(p)
		const dx = world.x - drag.value.startWorld.x
		const dy = world.y - drag.value.startWorld.y

		// 多选拖动：整体移动
		if (drag.value.nodeIds?.length && drag.value.startXYById) {
			for (const nodeId of drag.value.nodeIds) {
				const start = drag.value.startXYById[nodeId]
				if (!start) continue
				VideoSceneStore.dispatch('updateNodeTransform', {
					nodeId,
					patch: { x: start.x + dx, y: start.y + dy },
				})
			}
			return
		}

		if (!drag.value.startXY) return

		let localX = drag.value.startXY.x + dx
		let localY = drag.value.startXY.y + dy

		// snap: only when focused
		const focusedId = VideoSceneStore.state.focusedNodeId
		if (snapEnabled.value && focusedId && focusedId === drag.value.nodeId) {
			const hit = findUserNodeWithWorld(drag.value.nodeId)
			const parentWorld = hit?.parentWorld ?? { x: 0, y: 0 }
			const t = findUserNodeTransform(drag.value.nodeId) as any
			const w0 = Math.max(1, Number(t?.width ?? 1))
			const h0 = Math.max(1, Number(t?.height ?? 1))
			const w = w0
			const h = h0
			const rawWorldCx = parentWorld.x + localX
			const rawWorldCy = parentWorld.y + localY
			const session =
				moveSnapSession.value ??
				beginMoveSnapSessionForNode({
					state: VideoSceneStore.state,
					nodeId: drag.value.nodeId,
					stageWidth: stageWidth.value,
					stageHeight: stageHeight.value,
					zoom: canvas.viewport.zoom,
					basePx: 6,
				})
			const stepped = stepMoveSnapSession({
				session,
				rawWorldCx,
				rawWorldCy,
				width: w,
				height: h,
			})
			moveSnapSession.value = stepped.session
			const snapped = stepped.result

			// guides only when snapped and guides enabled
			if (showGuides.value && snapped.snappedLineX != null) {
				const sp = canvas.worldToScreen({ x: snapped.snappedLineX, y: rawWorldCy })
				snapGuides.x = Math.round(sp.x)
			} else {
				snapGuides.x = null
			}
			if (showGuides.value && snapped.snappedLineY != null) {
				const sp = canvas.worldToScreen({ x: rawWorldCx, y: snapped.snappedLineY })
				snapGuides.y = Math.round(sp.y)
			} else {
				snapGuides.y = null
			}

			localX = snapped.worldCx - parentWorld.x
			localY = snapped.worldCy - parentWorld.y
		}

		VideoSceneStore.dispatch('updateNodeTransform', {
			nodeId: drag.value.nodeId,
			patch: { x: localX, y: localY },
		})
		return
	}
}

const endPan = (ev: PointerEvent) => {
	if (marquee.active) {
		const canvas = ensureCanvas()
		if (!canvas) return
		marquee.active = false
		updateMarqueeStyle()
		try {
			;(ev.currentTarget as HTMLElement)?.releasePointerCapture?.(ev.pointerId)
		} catch {
			// ignore
		}

		const x0 = Math.min(marquee.start.x, marquee.end.x)
		const y0 = Math.min(marquee.start.y, marquee.end.y)
		const x1 = Math.max(marquee.start.x, marquee.end.x)
		const y1 = Math.max(marquee.start.y, marquee.end.y)
		const w = Math.abs(x1 - x0)
		const h = Math.abs(y1 - y0)

		const activeLayerId = VideoSceneStore.state.activeLayerId
		const isClick = w < 4 && h < 4
		const hit = isClick ? (scene?.hitTest(canvas, marquee.end) ?? null) : null
		const w0 = isClick ? null : canvas.screenToWorld({ x: x0, y: y0 })
		const w1 = isClick ? null : canvas.screenToWorld({ x: x1, y: y1 })
		const hits = isClick ? [] : scene?.queryNodesInWorldRect({ x0: w0!.x, y0: w0!.y, x1: w1!.x, y1: w1!.y }) ?? []
		const r = resolveMarqueeSelection({ activeLayerId, isClick, hit, hits })

		if (r.type === 'single') {
			if (r.layerId && r.layerId !== activeLayerId) {
				VideoSceneStore.dispatch('setActiveLayer', { layerId: r.layerId })
				TimelineStore.dispatch('selectLayer', { layerId: r.layerId })
			}
			VideoSceneStore.dispatch('setSelectedNode', { nodeId: r.nodeId })
			VideoSceneStore.dispatch('setFocusedNode', { nodeId: r.nodeId })
			return
		}
		if (r.type === 'multi') {
			VideoSceneStore.dispatch('setSelectedNodes', { nodeIds: r.nodeIds })
			return
		}
		VideoSceneStore.dispatch('setSelectedNode', { nodeId: null })
		return
	}

	if (drag.value.mode === 'none') return
	const prev = drag.value
	const wasMove = prev.mode === 'move'
	drag.value = { mode: 'none' }
	snapGuides.x = null
	snapGuides.y = null
	moveSnapSession.value = null
	resizeSnapSession.value = null
	try {
		;(ev.currentTarget as HTMLElement)?.releasePointerCapture?.(ev.pointerId)
	} catch {
		// ignore
	}
	// 多选状态下在已选节点上“点击”（无拖动）时：清空多选，收敛为单选该节点
	if (wasMove && prev.nodeIds?.length && prev.startWorld && prev.startScreen && prev.nodeId) {
		const canvas = ensureCanvas()
		if (canvas) {
			const p = getLocalPoint(ev)
			const movedPx = Math.hypot(p.x - prev.startScreen.x, p.y - prev.startScreen.y)
			if (shouldCollapseMultiSelectionOnPointerUp({ movedPx, thresholdPx: 3 })) {
				VideoSceneStore.dispatch('setSelectedNode', { nodeId: prev.nodeId })
				VideoSceneStore.dispatch('setFocusedNode', { nodeId: prev.nodeId })
			}
		}
	}
	if (wasMove) flushDirtyKeyframeWriteBack()
}
const onWheel = (ev: WheelEvent) => {
	const canvas = ensureCanvas()
	if (!canvas) return
	ev.preventDefault()
	const rect = (ev.currentTarget as HTMLCanvasElement).getBoundingClientRect()
	const x = ev.clientX - rect.left
	const y = ev.clientY - rect.top
	const factor = ev.deltaY < 0 ? 1.08 : 1 / 1.08
	canvas.zoomAt({ x, y }, canvas.viewport.zoom * factor)
}

onMounted(() => {
	const shell = shellRef.value
	const canvasEl = canvasRef.value
	if (!shell || !canvasEl) return

	const canvas = ensureCanvas()
	if (!canvas) return
	scene = new DwebVideoScene()
	scene.setStageSize({ width: stageWidth.value, height: stageHeight.value })
	scene.setStageBackground?.({
		type: stageBackground.value.type,
		color: stageBackground.value.color,
		opacity: stageBackground.value.opacity,
		imageSrc: stageBackground.value.imageSrc,
		imageFit: stageBackground.value.imageFit,
		repeat: stageBackground.value.repeat,
	})
	scene.setState(VideoSceneStore.state)
	canvas.setScene(scene)
	unsubscribeVideoScene = VideoSceneStore.subscribe((_m, state) => {
		const m: any = _m as any
		// 关键帧编辑：当且仅当“时间轴单选关键帧格子”且同图层时，把当前舞台写回该关键帧快照
		if (!isApplyingTimelineAnimation) {
			const type = String(m?.type ?? '')
			if (type === 'updateNodeTransform' || type === 'updateNodeProps' || type === 'updateNodeName' || type === 'setNodeType' || type === 'moveNode') {
				const lid = String(m?.payload?.layerId ?? '')
					if (lid) {
						if (isHighFreqEditing()) keyframeDirtyLayerIds.add(lid)
						else scheduleWriteBackSelectedKeyframe(lid)
					}
			}
		}
		scene?.setState(state)
		canvas.requestRender()
		updateOverlay()
	})

	// 撤销/重做使用 replaceState，不会触发 subscribe；这里补一条“外部恢复事件”强制同步舞台
	onEditorRestored = () => {
		if (!scene) return
		const c = ensureCanvas()
		if (!c) return
		scene.setState(VideoSceneStore.state)
		c.requestRender()
		updateOverlay()
	}
	window.addEventListener('dvs:editor/state-restored', onEditorRestored)
	canvas.onViewportChange = (vp) => {
		store.dispatch('setViewport', { panX: vp.pan.x, panY: vp.pan.y, zoom: vp.zoom })
		updateOverlay()
	}

	let didInitialFit = false
	const updateSize = async () => {
		await nextTick()
		measureInsets()
		shellSize.value = { width: shell.clientWidth, height: shell.clientHeight }
		canvas.setSize(shell.clientWidth, shell.clientHeight)
		if (!didInitialFit) {
			// 关键修复：必须在 setSize 之后 fit，否则会按默认 300x150 计算导致初始缩放过小
			didInitialFit = true
			canvas.fitToStage({ width: stageWidth.value, height: stageHeight.value }, 24, getFitInsets())
		}
	}

	resizeObserver = new ResizeObserver(() => {
		void updateSize()
	})
	resizeObserver.observe(shell)
	if (rightPanelRef.value?.rootEl) resizeObserver.observe(rightPanelRef.value.rootEl)
	if (toolbarRef.value?.rootEl) resizeObserver.observe(toolbarRef.value.rootEl)
	void updateSize()
	// 绑定交互事件（wheel 必须 passive:false 才能 preventDefault）
	canvasEl.style.touchAction = 'none'
	canvasEl.addEventListener('pointerdown', onPointerDown)
	canvasEl.addEventListener('pointermove', onPointerMove)
	canvasEl.addEventListener('pointerup', endPan)
	canvasEl.addEventListener('pointercancel', endPan)
	canvasEl.addEventListener('wheel', onWheel, { passive: false })
	document.addEventListener('pointermove', onDocPointerMove)
	document.addEventListener('pointerup', onDocPointerUp)
	window.addEventListener('keydown', onKeyDown)
	window.addEventListener('keyup', onKeyUp)
	window.addEventListener('blur', onBlur)
})

onBeforeUnmount(() => {
	stopLiveRender()
	if (bgApplyTimer != null) window.clearTimeout(bgApplyTimer)
	if (applyAnimRaf != null) {
		window.cancelAnimationFrame(applyAnimRaf)
		applyAnimRaf = null
	}
	if (keyframeWriteRaf != null) {
		window.cancelAnimationFrame(keyframeWriteRaf)
		keyframeWriteRaf = null
		pendingKeyframeWrite = null
	}
	const canvasEl = canvasRef.value
	if (canvasEl) {
		canvasEl.removeEventListener('pointerdown', onPointerDown)
		canvasEl.removeEventListener('pointermove', onPointerMove)
		canvasEl.removeEventListener('pointerup', endPan)
		canvasEl.removeEventListener('pointercancel', endPan)
		canvasEl.removeEventListener('wheel', onWheel as any)
	}
	document.removeEventListener('pointermove', onDocPointerMove)
	document.removeEventListener('pointerup', onDocPointerUp)
	window.removeEventListener('keydown', onKeyDown)
	window.removeEventListener('keyup', onKeyUp)
	window.removeEventListener('blur', onBlur)
	resizeObserver?.disconnect()
	resizeObserver = null
	unsubscribeVideoScene?.()
	unsubscribeVideoScene = null
	if (onEditorRestored) {
		window.removeEventListener('dvs:editor/state-restored', onEditorRestored)
		onEditorRestored = null
	}
	dwebCanvas?.dispose()
	dwebCanvas = null
	dwebCanvasRef.value = null
	scene = null
})

watch(
	() => [stageWidth.value, stageHeight.value, fitRequestedAt.value] as const,
	() => {
		const canvas = ensureCanvas()
		if (!canvas) return
		scene?.setStageSize({ width: stageWidth.value, height: stageHeight.value })
		canvas.requestRender()
		// 仅在显式请求 fit 时自动适配
		if (fitRequestedAt.value) {
			measureInsets()
			canvas.fitToStage({ width: stageWidth.value, height: stageHeight.value }, 24, getFitInsets())
		}
	}
)

watch(
	() => [VideoSceneStore.state.selectedNodeId, (VideoSceneStore.state.selectedNodeIds ?? []).join('|'), viewport.value.panX, viewport.value.panY, viewport.value.zoom, shellSize.value.width, shellSize.value.height] as const,
	() => {
		updateOverlay()
	}
)
</script>

<style scoped>
.vs-shell {
	position: relative;
	width: 100%;
	height: 100%;
	min-height: 0;
	overflow: hidden;
	background: var(--dweb-defualt);
}

.vs-canvas {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	cursor: grab;
}

.vs-canvas.selecting {
	cursor: default;
}

.vs-overlay {
	position: absolute;
	inset: 0;
	pointer-events: none;
	z-index: 4;
}

.vs-cp-passive {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

:deep(.vs-cp-passive .vs-handle) {
	pointer-events: none !important;
}

.vs-marquee {
	position: absolute;
	border: 1px solid var(--vscode-border-accent);
	background: var(--vscode-border-accent);
	opacity: 0.15;
	pointer-events: none;
}

.vs-snap-line {
	position: absolute;
	background: var(--vscode-border-accent);
	opacity: 0.9;
	pointer-events: none;
}

.vs-snap-line.v {
	top: 0;
	bottom: 0;
	width: 1px;
}

.vs-snap-line.h {
	left: 0;
	right: 0;
	height: 1px;
}

.vs-tools {
	position: absolute;
	top: calc(24px + 12px);
	left: calc(24px + 12px);
	display: flex;
	gap: 8px;
	z-index: 2;
}

.vs-tool {
	pointer-events: auto;
	padding: 6px 10px;
	border-radius: 8px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	cursor: pointer;
	font-size: 12px;
}

.vs-tool.active {
	border-color: var(--vscode-border-accent);
	background: var(--vscode-selected-bg);
}

.vs-tool:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.vs-form {
	position: absolute;
	left: 16px;
	bottom: 56px;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	border-radius: 10px;
}

.vs-bg-form {
	bottom: 56px;
}

.vs-label {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.vs-input {
	width: 96px;
	padding: 6px 8px;
	border-radius: 8px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	outline: none;
}

.vs-select {
	width: 120px;
	padding: 6px 8px;
	border-radius: 8px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	outline: none;
}

.vs-color {
	width: 28px;
	height: 28px;
	padding: 0;
	border-radius: 8px;
	border: 1px solid var(--vscode-border);
	background: transparent;
}

.vs-file {
	position: relative;
	display: inline-flex;
	align-items: center;
}

.vs-file-input {
	position: absolute;
	inset: 0;
	opacity: 0;
	cursor: pointer;
}

.vs-file-btn {
	height: 28px;
	padding: 0 10px;
	border-radius: 8px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	font-size: 12px;
	line-height: 28px;
}

.vs-btn {
	padding: 6px 10px;
	border-radius: 8px;
	border: 1px solid var(--vscode-border-accent);
	background: transparent;
	color: var(--vscode-fg);
	cursor: pointer;
}

.vs-btn:hover {
	background: var(--vscode-hover-bg);
}
</style>