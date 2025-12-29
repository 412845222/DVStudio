<template>
	<div ref="shellRef" class="vs-shell">
		<canvas ref="canvasRef" class="vs-canvas" />
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
			<template v-if="showGuides">
				<div v-if="snapGuides.x != null" class="vs-snap-line v" :style="{ left: snapGuides.x + 'px' }" />
				<div v-if="snapGuides.y != null" class="vs-snap-line h" :style="{ top: snapGuides.y + 'px' }" />
			</template>
			<template v-if="overlay.visible">
				<div class="vs-handle tl" :style="overlay.handleStyles.tl" @pointerdown.stop.prevent="onHandleDown('tl', $event)" />
				<div class="vs-handle tr" :style="overlay.handleStyles.tr" @pointerdown.stop.prevent="onHandleDown('tr', $event)" />
				<div class="vs-handle bl" :style="overlay.handleStyles.bl" @pointerdown.stop.prevent="onHandleDown('bl', $event)" />
				<div class="vs-handle br" :style="overlay.handleStyles.br" @pointerdown.stop.prevent="onHandleDown('br', $event)" />
				<div v-if="overlay.showSize" class="vs-size" :style="overlay.sizeStyle">{{ overlay.sizeText }}</div>
			</template>
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
import { VideoSceneKey, VideoSceneStore, type VideoSceneTreeNode } from '../../store/videoscene'
import VideoSceneToolbar from './parts/VideoSceneToolbar.vue'
import VideoStudioRightPanel from './panels/VideoStudioRightPanel.vue'
import { DwebCanvasGL } from '../../DwebGL/DwebCanvasGL'
import { DwebVideoScene } from '../../DwebGL/DwebVideoScene'
import { TimelineStore } from '../../store/timeline'
import { containsFrame, type TimelineFrameSpan } from '../../store/timeline/spans'
import { DwebCanvasGLKey } from './VideoSceneRuntime'
import { applyTimelineAnimationAtFrame } from './anim/timelineAnimation'

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

type SnapLock = {
	x?: { target: number; mode: 'l' | 'c' | 'r' }
	y?: { target: number; mode: 't' | 'c' | 'b' }
}
const snapLock = ref<SnapLock | null>(null)

type SnapTarget = { cx: number; cy: number; w: number; h: number }
const collectSnapTargets = (layerId: string, excludeNodeId: string): SnapTarget[] => {
	const out: SnapTarget[] = []
	const layer = VideoSceneStore.state.layers.find((l) => l.id === layerId)
	if (!layer) return out
	const walk = (nodes: VideoSceneTreeNode[], parentWorld: { x: number; y: number }) => {
		for (const n of nodes) {
			const hasT = !!n.transform
			const world = hasT
				? { x: parentWorld.x + (n.transform?.x ?? 0), y: parentWorld.y + (n.transform?.y ?? 0) }
				: parentWorld
			const nextParentWorld = hasT ? world : parentWorld
			if (n.category === 'user' && n.transform && n.id !== excludeNodeId) {
				out.push({
					cx: world.x,
					cy: world.y,
					w: Math.max(1, Number(n.transform.width ?? 1)),
					h: Math.max(1, Number(n.transform.height ?? 1)),
				})
			}
			if (n.children?.length) walk(n.children, nextParentWorld)
		}
	}
	for (const root of layer.nodeTree) walk([root], { x: 0, y: 0 })
	return out
}

const buildSnapLines = (targets: SnapTarget[]) => {
	const xs: number[] = []
	const ys: number[] = []
	for (const t of targets) {
		xs.push(t.cx - t.w / 2, t.cx, t.cx + t.w / 2)
		ys.push(t.cy - t.h / 2, t.cy, t.cy + t.h / 2)
	}
	return { xs, ys }
}

const applySnapAxis = (
	axis: 'x' | 'y',
	center: number,
	size: number,
	lines: number[],
	threshold: number,
	lock: SnapLock | null,
	opt?: {
		candidates?: Array<
			| { mode: 'l' | 'c' | 'r'; v: number }
			| { mode: 't' | 'c' | 'b'; v: number }
		>
	}
) => {
	const sticky = threshold * 2
	if (axis === 'x' && lock?.x) {
		const line = lock.x.target
		const next = lock.x.mode === 'l' ? line + size / 2 : lock.x.mode === 'r' ? line - size / 2 : line
		const dist = Math.abs(next - center)
		if (dist <= sticky) return { center: next, snappedLine: line, lock: lock.x, dist }
	}
	if (axis === 'y' && lock?.y) {
		const line = lock.y.target
		const next = lock.y.mode === 't' ? line + size / 2 : lock.y.mode === 'b' ? line - size / 2 : line
		const dist = Math.abs(next - center)
		if (dist <= sticky) return { center: next, snappedLine: line, lock: lock.y, dist }
	}

	let best: { dist: number; line: number; mode: any } | null = null
	const candidates = (opt?.candidates ??
		(axis === 'x'
			? ([
				{ mode: 'l' as const, v: center - size / 2 },
				{ mode: 'c' as const, v: center },
				{ mode: 'r' as const, v: center + size / 2 },
			] as const)
			: ([
				{ mode: 't' as const, v: center - size / 2 },
				{ mode: 'c' as const, v: center },
				{ mode: 'b' as const, v: center + size / 2 },
			] as const))) as any

	for (const c of candidates) {
		for (const line of lines) {
			const dist = Math.abs(c.v - line)
			if (dist > threshold) continue
			if (!best || dist < best.dist) best = { dist, line, mode: c.mode }
		}
	}
	if (!best) return { center, snappedLine: null as number | null, lock: null as any, dist: Number.POSITIVE_INFINITY }
	const next =
		best.mode === 'l' || best.mode === 't'
			? best.line + size / 2
			: best.mode === 'r' || best.mode === 'b'
				? best.line - size / 2
				: best.line
	return { center: next, snappedLine: best.line, lock: { target: best.line, mode: best.mode }, dist: best.dist }
}

// 鼠标交互：命中节点则拖拽移动；空白处拖拽平移；滚轴缩放
type DragMode = 'none' | 'pan' | 'move'
const drag = ref<{ mode: DragMode; last?: { x: number; y: number }; nodeId?: string; startWorld?: { x: number; y: number }; startXY?: { x: number; y: number } }>(
	{ mode: 'none' }
)

type Corner = 'tl' | 'tr' | 'bl' | 'br'
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

const findUserNodeTransform = (nodeId: string) => {
	for (const layer of VideoSceneStore.state.layers) {
		const stack = [...layer.nodeTree]
		while (stack.length) {
			const n = stack.shift()!
			if (n.id === nodeId) return n.category === 'user' ? n.transform ?? null : null
			if (n.children?.length) stack.unshift(...n.children)
		}
	}
	return null
}

const findUserNodeWithWorld = (nodeId: string) => {
	type Hit = { layerId: string; node: VideoSceneTreeNode; parentWorld: { x: number; y: number }; world: { x: number; y: number } }
	const walk = (nodes: VideoSceneTreeNode[], parentWorld: { x: number; y: number }): Hit | null => {
		for (const n of nodes) {
			const hasT = !!n.transform
			const world = hasT
				? { x: parentWorld.x + (n.transform?.x ?? 0), y: parentWorld.y + (n.transform?.y ?? 0) }
				: parentWorld
			const nextParentWorld = hasT ? world : parentWorld
			if (n.id === nodeId) return { layerId: '', node: n, parentWorld, world }
			if (n.children?.length) {
				const hit = walk(n.children, nextParentWorld)
				if (hit) return hit
			}
		}
		return null
	}

	for (const layer of VideoSceneStore.state.layers) {
		const hit = walk(layer.nodeTree, { x: 0, y: 0 })
		if (hit && hit.node?.category === 'user' && hit.node?.transform) {
			return { ...hit, layerId: layer.id }
		}
	}
	return null
}

const findLayerIdByNodeId = (nodeId: string) => {
	for (const layer of VideoSceneStore.state.layers) {
		const stack = [...layer.nodeTree]
		while (stack.length) {
			const n = stack.shift()!
			if (n.id === nodeId) return layer.id
			if (n.children?.length) stack.unshift(...n.children)
		}
	}
	return null
}

const updateOverlay = () => {
	const canvas = dwebCanvas
	const nodeId = VideoSceneStore.state.selectedNodeId
	if (!canvas || !nodeId) {
		overlay.visible = false
		overlay.showSize = false
		return
	}
	const hit = findUserNodeWithWorld(nodeId)
	if (!hit) {
		overlay.visible = false
		overlay.showSize = false
		return
	}
	const t = hit.node.transform as any
	const cx = hit.world.x
	const cy = hit.world.y
	const w = Number(t.width ?? 0)
	const h = Number(t.height ?? 0)
	const rotation = Number((t as any).rotation ?? 0)
	const cos = Math.cos(rotation)
	const sin = Math.sin(rotation)
	const rot = (dx: number, dy: number) => ({ x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos })
	const tlw = rot(-w / 2, -h / 2)
	const trw = rot(w / 2, -h / 2)
	const blw = rot(-w / 2, h / 2)
	const brw = rot(w / 2, h / 2)
	const tl = canvas.worldToScreen(tlw)
	const tr = canvas.worldToScreen(trw)
	const bl = canvas.worldToScreen(blw)
	const br = canvas.worldToScreen(brw)
	const px = (v: number) => `${Math.round(v)}px`
	overlay.visible = true
	overlay.handleStyles.tl = { left: px(tl.x), top: px(tl.y) }
	overlay.handleStyles.tr = { left: px(tr.x), top: px(tr.y) }
	overlay.handleStyles.bl = { left: px(bl.x), top: px(bl.y) }
	overlay.handleStyles.br = { left: px(br.x), top: px(br.y) }
	overlay.sizeText = `${Math.round(w)}×${Math.round(h)}`
	overlay.sizeStyle = { left: px(tl.x + 10), top: px(tl.y - 18) }
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
	const cos = Math.cos(rotation)
	const sin = Math.sin(rotation)
	const rot = (dx: number, dy: number) => ({ x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos })
	const tl = rot(-w / 2, -h / 2)
	const tr = rot(w / 2, -h / 2)
	const bl = rot(-w / 2, h / 2)
	const br = rot(w / 2, h / 2)
	const anchorWorld = (() => {
		if (corner === 'tl') return br
		if (corner === 'tr') return bl
		if (corner === 'bl') return tr
		return tl
	})()
	resize.value = { active: true, corner, nodeId, layerId, anchorWorld, parentWorld: hit.parentWorld }
	overlay.showSize = true
	try {
		;(ev.currentTarget as HTMLElement)?.setPointerCapture?.(ev.pointerId)
	} catch {
		// ignore
	}
}

const onDocPointerMove = (ev: PointerEvent) => {
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
		const threshold = 6 / Math.max(0.0001, canvas.viewport.zoom)
		const sticky = threshold * 2
		const stageLeft = -stageWidth.value / 2
		const stageRight = stageWidth.value / 2
		const stageTop = -stageHeight.value / 2
		const stageBottom = stageHeight.value / 2

		const targets = collectSnapTargets(layerId, nodeId)
		const { xs, ys } = buildSnapLines(targets)
		const lock = snapLock.value

		type ResizeSnapResult = {
			center: number
			size: number
			moving: number
			snappedLine: number | null
			lock: any
			dist: number
		}

		const applyResizeSnapAxis = (
			axis: 'x' | 'y',
			fixed: number,
			moving: number,
			lines: number[],
			cand: Array<{ mode: any; v: number }>
		): ResizeSnapResult => {
			const axisLock = axis === 'x' ? lock?.x : lock?.y
			if (axisLock) {
				const line = axisLock.target
				const mode = axisLock.mode
				const current = cand.find((c) => c.mode === mode)
				if (current) {
					const dist0 = Math.abs(current.v - line)
					if (dist0 <= sticky) {
						const nextMoving = mode === 'c' ? 2 * line - fixed : line
						const nextSize = Math.max(minSize, Math.abs(fixed - nextMoving))
						const nextCenter = (fixed + nextMoving) / 2
						return { center: nextCenter, size: nextSize, moving: nextMoving, snappedLine: line, lock: axisLock, dist: dist0 }
					}
				}
			}

			let best: { dist: number; line: number; mode: any } | null = null
			for (const c of cand) {
				for (const line of lines) {
					const dist = Math.abs(c.v - line)
					if (dist > threshold) continue
					if (!best || dist < best.dist) best = { dist, line, mode: c.mode }
				}
			}
			if (!best) return { center: (fixed + moving) / 2, size: Math.max(minSize, Math.abs(fixed - moving)), moving, snappedLine: null, lock: null, dist: Number.POSITIVE_INFINITY }
			const nextMoving = best.mode === 'c' ? 2 * best.line - fixed : best.line
			const nextSize = Math.max(minSize, Math.abs(fixed - nextMoving))
			const nextCenter = (fixed + nextMoving) / 2
			return { center: nextCenter, size: nextSize, moving: nextMoving, snappedLine: best.line, lock: { target: best.line, mode: best.mode }, dist: best.dist }
		}

		// axis candidates: snap moving edge, and (for node lines) allow snapping center as well
		const movingModeX = (corner === 'tl' || corner === 'bl') ? 'l' : 'r'
		const movingModeY = (corner === 'tl' || corner === 'tr') ? 't' : 'b'
		const candNodesX = [{ mode: movingModeX, v: movingX }, { mode: 'c', v: cx }]
		const candNodesY = [{ mode: movingModeY, v: movingY }, { mode: 'c', v: cy }]
		const candStageX = [{ mode: movingModeX, v: movingX }]
		const candStageY = [{ mode: movingModeY, v: movingY }]

		const sxNodes = applyResizeSnapAxis('x', anchorWorld.x, movingX, xs, candNodesX)
		const syNodes = applyResizeSnapAxis('y', anchorWorld.y, movingY, ys, candNodesY)
		const sxStage = applyResizeSnapAxis('x', anchorWorld.x, movingX, [stageLeft, stageRight], candStageX)
		const syStage = applyResizeSnapAxis('y', anchorWorld.y, movingY, [stageTop, stageBottom], candStageY)

		const sx = (sxStage.dist ?? Infinity) < (sxNodes.dist ?? Infinity) ? sxStage : sxNodes
		const sy = (syStage.dist ?? Infinity) < (syNodes.dist ?? Infinity) ? syStage : syNodes

		movingX = sx.moving
		movingY = sy.moving
		width = sx.size
		height = sy.size
		cx = sx.center
		cy = sy.center

		const nextLock: SnapLock = { ...(lock ?? {}) }
		if (sx.lock) nextLock.x = sx.lock
		else delete nextLock.x
		if (sy.lock) nextLock.y = sy.lock
		else delete nextLock.y
		snapLock.value = nextLock

		if (showGuides.value && sx.snappedLine != null) {
			const sp = canvas.worldToScreen({ x: sx.snappedLine, y: cy })
			snapGuides.x = Math.round(sp.x)
		} else {
			snapGuides.x = null
		}
		if (showGuides.value && sy.snappedLine != null) {
			const sp = canvas.worldToScreen({ x: cx, y: sy.snappedLine })
			snapGuides.y = Math.round(sp.y)
		} else {
			snapGuides.y = null
		}
	} else {
		// not snapping during resize
		snapGuides.x = null
		snapGuides.y = null
		snapLock.value = null
	}
	// 写回局部坐标：local = world - parentWorld
	VideoSceneStore.dispatch('updateNodeTransform', {
		layerId,
		nodeId,
		patch: { x: cx - parentWorld.x, y: cy - parentWorld.y, width, height },
	})
}

const onDocPointerUp = () => {
	if (!resize.value.active) return
	resize.value = { active: false }
	overlay.showSize = false
	snapGuides.x = null
	snapGuides.y = null
	snapLock.value = null
}

const onPointerDown = (ev: PointerEvent) => {
	if (ev.button !== 0) return
	const canvas = ensureCanvas()
	if (!canvas) return
	const p = getLocalPoint(ev)
	const hit = scene?.hitTest(canvas, p) ?? null
	if (hit) {
		if (hit.layerId && hit.layerId !== VideoSceneStore.state.activeLayerId) {
			VideoSceneStore.dispatch('setActiveLayer', { layerId: hit.layerId })
			TimelineStore.dispatch('selectLayer', { layerId: hit.layerId })
		}
		VideoSceneStore.dispatch('setSelectedNode', { nodeId: hit.nodeId })
		VideoSceneStore.dispatch('setFocusedNode', { nodeId: hit.nodeId })
		const t = findUserNodeTransform(hit.nodeId)
		const world = canvas.screenToWorld(p)
		drag.value = {
			mode: 'move',
			nodeId: hit.nodeId,
			startWorld: world,
			startXY: { x: t?.x ?? 0, y: t?.y ?? 0 },
		}
	} else {
		VideoSceneStore.dispatch('setSelectedNode', { nodeId: null })
		drag.value = { mode: 'pan', last: { x: ev.clientX, y: ev.clientY } }
	}
	;(ev.currentTarget as HTMLElement)?.setPointerCapture?.(ev.pointerId)
}

const onPointerMove = (ev: PointerEvent) => {
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
		if (!drag.value.nodeId || !drag.value.startWorld || !drag.value.startXY) return
		const p = getLocalPoint(ev)
		const world = canvas.screenToWorld(p)
		const dx = world.x - drag.value.startWorld.x
		const dy = world.y - drag.value.startWorld.y

		let localX = drag.value.startXY.x + dx
		let localY = drag.value.startXY.y + dy

		// snap: only when focused
		const focusedId = VideoSceneStore.state.focusedNodeId
		if (snapEnabled.value && focusedId && focusedId === drag.value.nodeId) {
			const hit = findUserNodeWithWorld(drag.value.nodeId)
			const layerId = hit?.layerId ?? findLayerIdByNodeId(drag.value.nodeId)
			const parentWorld = hit?.parentWorld ?? { x: 0, y: 0 }
			const t = findUserNodeTransform(drag.value.nodeId) as any
			const w0 = Math.max(1, Number(t?.width ?? 1))
			const h0 = Math.max(1, Number(t?.height ?? 1))
			const w = w0
			const h = h0
			const rawWorldCx = parentWorld.x + localX
			const rawWorldCy = parentWorld.y + localY
			const threshold = 6 / Math.max(0.0001, canvas.viewport.zoom)

			if (layerId) {
				const targets = collectSnapTargets(layerId, drag.value.nodeId)
				const { xs, ys } = buildSnapLines(targets)
				const lock = snapLock.value
				const sxNodes = applySnapAxis('x', rawWorldCx, w, xs, threshold, lock)
				const syNodes = applySnapAxis('y', rawWorldCy, h, ys, threshold, lock)
				// stage edge snapping (world-space stage bounds)
				const stageLeft = -stageWidth.value / 2
				const stageRight = stageWidth.value / 2
				const stageTop = -stageHeight.value / 2
				const stageBottom = stageHeight.value / 2
				const sxStage = applySnapAxis('x', rawWorldCx, w, [stageLeft, stageRight], threshold, lock, {
					candidates: [
						{ mode: 'l', v: rawWorldCx - w / 2 },
						{ mode: 'r', v: rawWorldCx + w / 2 },
					],
				})
				const syStage = applySnapAxis('y', rawWorldCy, h, [stageTop, stageBottom], threshold, lock, {
					candidates: [
						{ mode: 't', v: rawWorldCy - h / 2 },
						{ mode: 'b', v: rawWorldCy + h / 2 },
					],
				})
				const sx = (sxStage.dist ?? Infinity) < (sxNodes.dist ?? Infinity) ? sxStage : sxNodes
				const sy = (syStage.dist ?? Infinity) < (syNodes.dist ?? Infinity) ? syStage : syNodes
				const nextLock: SnapLock = { ...(lock ?? {}) }
				if (sx.lock) nextLock.x = sx.lock
				else delete nextLock.x
				if (sy.lock) nextLock.y = sy.lock
				else delete nextLock.y
				snapLock.value = nextLock

				// guides only when snapped and guides enabled
				if (showGuides.value && sx.snappedLine != null) {
					const sp = canvas.worldToScreen({ x: sx.snappedLine, y: rawWorldCy })
					snapGuides.x = Math.round(sp.x)
				} else {
					snapGuides.x = null
				}
				if (showGuides.value && sy.snappedLine != null) {
					const sp = canvas.worldToScreen({ x: rawWorldCx, y: sy.snappedLine })
					snapGuides.y = Math.round(sp.y)
				} else {
					snapGuides.y = null
				}

				localX = sx.center - parentWorld.x
				localY = sy.center - parentWorld.y
			}
		}

		VideoSceneStore.dispatch('updateNodeTransform', {
			nodeId: drag.value.nodeId,
			patch: { x: localX, y: localY },
		})
		return
	}
}

const endPan = (ev: PointerEvent) => {
	if (drag.value.mode === 'none') return
	drag.value = { mode: 'none' }
	snapGuides.x = null
	snapGuides.y = null
	snapLock.value = null
	try {
		;(ev.currentTarget as HTMLElement)?.releasePointerCapture?.(ev.pointerId)
	} catch {
		// ignore
	}
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
				if (lid) scheduleWriteBackSelectedKeyframe(lid)
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
	window.addEventListener('dweb:editor-state-restored', onEditorRestored)
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
	resizeObserver?.disconnect()
	resizeObserver = null
	unsubscribeVideoScene?.()
	unsubscribeVideoScene = null
	if (onEditorRestored) {
		window.removeEventListener('dweb:editor-state-restored', onEditorRestored)
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
	() => [VideoSceneStore.state.selectedNodeId, viewport.value.panX, viewport.value.panY, viewport.value.zoom, shellSize.value.width, shellSize.value.height] as const,
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

.vs-overlay {
	position: absolute;
	inset: 0;
	pointer-events: none;
	z-index: 4;
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

.vs-handle {
	position: absolute;
	width: 10px;
	height: 10px;
	border-radius: 50%;
	background: var(--dweb-defualt-dark);
	border: 2px solid var(--vscode-border-accent);
	transform: translate(-50%, -50%);
	pointer-events: auto;
	cursor: nwse-resize;
}

.vs-handle.tr,
.vs-handle.bl {
	cursor: nesw-resize;
}

.vs-size {
	position: absolute;
	padding: 2px 6px;
	border-radius: 8px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	font-size: 12px;
	line-height: 16px;
	pointer-events: none;
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