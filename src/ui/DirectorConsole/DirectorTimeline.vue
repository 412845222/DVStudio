<template>
	<div class="dc-tl" :class="{ 'is-collapsed': collapsed }">
		<span class="dc-tl-corner dc-tl-corner-tl" />
		<span class="dc-tl-corner dc-tl-corner-br" />
		<!-- 传输控制条 -->
		<div class="dc-tl-toolbar">
			<div class="dc-tl-play-controls">
				<button
					class="dc-tl-btn"
					type="button"
					:disabled="isPlaying"
					:title="t('nodes.directorConsole.timelinePlay')"
					@click="emit('play')"
				>
					▶
				</button>
				<button
					class="dc-tl-btn"
					type="button"
					:disabled="!isPlaying"
					:title="t('nodes.directorConsole.timelinePause')"
					@click="emit('pause')"
				>
					‖
				</button>
				<button
					class="dc-tl-btn"
					type="button"
					:title="t('nodes.directorConsole.timelineStop')"
					@click="emit('stop')"
				>
					■
				</button>
				<button
					class="dc-tl-btn"
					type="button"
					:class="{ active: loop }"
					:title="t('nodes.directorConsole.timelineLoop')"
					@click="emit('update:loop', !loop)"
				>
					↻
				</button>
			</div>
			<span class="dc-tl-sep" />
			<label class="dc-tl-field">
				<span class="dc-tl-label">{{ t('nodes.directorConsole.timelineFps') }}</span>
				<input
					:value="fps"
					class="dc-tl-input"
					type="number"
					min="1"
					max="240"
					step="1"
					@change="onFpsChange"
				/>
			</label>
			<label class="dc-tl-field">
				<span class="dc-tl-label">{{ t('nodes.directorConsole.timelineTotalFrames') }}</span>
				<input
					:value="totalFrames"
					class="dc-tl-input"
					type="number"
					min="1"
					step="1"
					@change="onTotalFramesChange"
				/>
			</label>
			<span class="dc-tl-sep" />
			<div class="dc-tl-frame-display">
				<span class="dc-tl-frame-current">{{ currentFrame }}</span>
				<span class="dc-tl-frame-sep">/</span>
				<span class="dc-tl-frame-total">{{ Math.max(0, totalFrames - 1) }}</span>
			</div>
			<span class="dc-tl-sep" />
			<button
				class="dc-tl-btn dc-tl-keyframe-add"
				type="button"
				:disabled="!canAddKeyframe"
				@click="onAddKeyframe"
			>
				+ {{ t('nodes.directorConsole.addKeyframe') }}
			</button>
			<button
				class="dc-tl-btn dc-tl-export-video"
				type="button"
				:disabled="!canExport"
				@click="onExportVideo"
			>
				{{ t('nodes.directorConsole.exportVideo') }}
			</button>
			<div class="dc-tl-spacer" />
			<button
				class="dc-tl-btn dc-tl-collapse"
				type="button"
				:title="
					collapsed
						? t('nodes.directorConsole.timelineExpand')
						: t('nodes.directorConsole.timelineCollapse')
				"
				@click="collapsed = !collapsed"
			>
				{{ collapsed ? '▲' : '▼' }}
			</button>
		</div>
		<!-- 时间轴主体 -->
		<div v-show="!collapsed" class="dc-tl-body">
			<!-- 刻度尺 -->
			<div
				ref="viewportRef"
				class="dc-tl-viewport"
				@wheel.prevent="onWheel"
				@pointerdown="onRulerPointerDown"
				@pointermove="onRulerPointerMove"
				@pointerup="onRulerPointerUp"
				@mousedown="onViewportMouseDown"
			>
				<!-- 左侧标签列占位，与轨道行的 label 列对齐 -->
				<div class="dc-tl-ruler-spacer" :style="{ width: LABEL_WIDTH + 'px' }" />
				<canvas ref="tickCanvasRef" class="dc-tl-tick-canvas" />
				<div
					class="dc-tl-track-area"
					:style="{
						left: LABEL_WIDTH + 'px',
						width: timelineWidth + 'px',
						transform: `translateX(${-scrollLeft}px)`
					}"
				>
					<!-- 播放头 -->
					<div class="dc-tl-playhead" :style="{ transform: `translateX(${playheadWorldX}px)` }">
						<div class="dc-tl-playhead-handle" />
						<div class="dc-tl-playhead-line" />
					</div>
				</div>
			</div>
			<!-- 轨道列表 -->
			<div class="dc-tl-tracks" @wheel.prevent="onWheel" tabindex="0" @keydown="onTracksKeydown">
				<div v-if="tracks.length === 0" class="dc-tl-empty">
					{{ t('nodes.directorConsole.timelineEmpty') }}
				</div>
				<div
					v-for="tr in tracks"
					:key="tr.id"
					class="dc-tl-track-row"
					:class="{
						active:
							tr.id === selectedObjectId ||
							(tr.kind === 'camera' && selectedObjectId === cameraSelectionId)
					}"
					@click="onSelectTrack(tr)"
				>
					<div
						class="dc-tl-track-label"
						:style="{ 'padding-left': (tr.depth ?? 0) * 16 + 8 + 'px' }"
					>
						<span v-if="tr.depth && tr.depth > 0" class="dc-tl-track-indent-guide" />
						<span class="dc-tl-track-dot" :style="{ background: tr.color }" />
						<span class="dc-tl-track-name">{{ tr.name }}</span>
						<span class="dc-tl-track-kf-count">{{ tr.keyframes.length }}</span>
					</div>
					<div
						ref="trackCellsRef"
						class="dc-tl-track-cells"
						:style="{ transform: `translateX(${-scrollLeft}px)`, width: timelineWidth + 'px' }"
					>
						<div
							v-for="kf in tr.keyframes"
							:key="kf.id"
							class="dc-tl-keyframe"
							:class="{ selected: isKeyframeSelected(tr, kf) }"
							:style="{ left: keyframeX(tr, kf) + 'px', '--kf-color': tr.color }"
							@click.stop="onKeyframeClick(tr, kf)"
							@contextmenu.prevent="onKeyframeRightClick(tr, kf, $event)"
						/>
					</div>
				</div>
			</div>
		</div>
		<!-- 右键菜单 -->
		<div
			v-if="contextMenu.visible"
			class="dc-tl-context-menu"
			:style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
		>
			<button class="dc-tl-context-btn" @click="onContextMenuDelete">
				{{ t('nodes.directorConsole.removeKeyframe') }}
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from '../../i18n'
import type {
	WorkflowDirectorCameraTrack,
	WorkflowDirectorCharacter,
	WorkflowDirectorCameraKeyframe,
	WorkflowDirectorCharacterKeyframe
} from '../../aiworkflow/types'
import { SceneLayoutPreviewViewer } from '../WorkFlow/WorlFlowNodes/sceneLayout/SceneLayoutPreviewViewer'

const props = defineProps<{
	fps: number
	totalFrames: number
	currentFrame: number
	isPlaying: boolean
	loop: boolean
	cameraTrack: WorkflowDirectorCameraTrack | null
	characters: WorkflowDirectorCharacter[]
	selectedObjectId: string
}>()

const emit = defineEmits<{
	(e: 'update:currentFrame', frame: number): void
	(e: 'update:fps', fps: number): void
	(e: 'update:totalFrames', frames: number): void
	(e: 'update:loop', loop: boolean): void
	(e: 'play'): void
	(e: 'pause'): void
	(e: 'stop'): void
	(e: 'add-keyframe', target: { type: 'camera' | 'character'; id?: string }): void
	(
		e: 'remove-keyframe',
		target: { type: 'camera' | 'character'; id?: string; keyframeId: string }
	): void
	(e: 'export-video'): void
}>()

const { t } = useI18n()

const cameraSelectionId = SceneLayoutPreviewViewer.CAMERA_SELECTION_ID

// ===== 视口状态 =====
const viewportRef = ref<HTMLDivElement | null>(null)
const tickCanvasRef = ref<HTMLCanvasElement | null>(null)
const viewportWidth = ref(0)
const scrollLeft = ref(0)
const frameWidth = ref(8)
const MIN_FRAME_WIDTH = 0.5
const MAX_FRAME_WIDTH = 40
const TIMELINE_RIGHT_PADDING = 24
const collapsed = ref(false)

/** 轨道行左侧标签列宽度：刻度尺、播放头、关键帧单元格必须以该宽度左对齐 */
const LABEL_WIDTH = 120

const timelineWidth = computed(() => props.totalFrames * frameWidth.value + TIMELINE_RIGHT_PADDING)
// 可见刻度区域宽度 = 视口宽度 - 左侧标签列宽度
const visibleTrackWidth = computed(() => Math.max(0, viewportWidth.value - LABEL_WIDTH))
const maxScrollLeft = computed(() => Math.max(0, timelineWidth.value - visibleTrackWidth.value))
// 播放头位于 track-area 内部（track-area 已通过 left: LABEL_WIDTH 与标签列对齐）
const playheadWorldX = computed(() => props.currentFrame * frameWidth.value)

// ===== 刻度间隔（自适应） =====
const tickInterval = computed(() => {
	const fw = frameWidth.value
	if (fw >= 20) return 1
	if (fw >= 10) return 5
	if (fw >= 4) return 10
	if (fw >= 1) return 30
	return 60
})

// ===== 轨道列表（按场景层级树排序，depth 表示缩进层级） =====
type TrackInfo = {
	kind: 'camera' | 'character'
	id: string
	name: string
	color: string
	keyframes: { id: string; frame: number }[]
	/** 层级深度：0 为根级（摄像头 / 无父级角色），子级角色 depth 递增 */
	depth: number
}

const tracks = computed<TrackInfo[]>(() => {
	const list: TrackInfo[] = []
	// 摄像头始终在最顶层（depth 0）
	if (props.cameraTrack) {
		list.push({
			kind: 'camera',
			id: cameraSelectionId,
			name: t('nodes.directorConsole.cameraTrack'),
			color: '#60a5fa',
			depth: 0,
			keyframes: (props.cameraTrack.keyframes || []).map((k) => ({
				id: k.id,
				frame: k.frame ?? Math.round((k.time ?? 0) * props.fps)
			}))
		})
	}
	// 按 parentId 构建角色树，深度优先遍历输出（与右侧场景对象树一致）
	const charMap = new Map(props.characters.map((c) => [c.id, c]))
	const childrenMap = new Map<string | null, string[]>()
	for (const c of props.characters) {
		const pid = c.parentId && charMap.has(c.parentId) ? c.parentId : null
		const arr = childrenMap.get(pid) ?? []
		arr.push(c.id)
		childrenMap.set(pid, arr)
	}
	const walk = (parentId: string | null, depth: number) => {
		const ids = childrenMap.get(parentId) ?? []
		for (const id of ids) {
			const c = charMap.get(id)
			if (!c) continue
			list.push({
				kind: 'character',
				id: c.id,
				name: c.name,
				color: c.color,
				depth,
				keyframes: (c.keyframes || []).map((k) => ({ id: k.id, frame: k.frame }))
			})
			walk(id, depth + 1)
		}
	}
	walk(null, 0)
	return list
})

/** 当前被选中的关键帧，用于 Delete/Backspace 删除 */
const selectedKeyframe = ref<{ trackId: string; keyframeId: string } | null>(null)

function isKeyframeSelected(tr: TrackInfo, kf: { id: string }): boolean {
	return selectedKeyframe.value?.trackId === tr.id && selectedKeyframe.value?.keyframeId === kf.id
}

/** Delete / Backspace 删除选中的关键帧 */
function onTracksKeydown(ev: KeyboardEvent) {
	if (ev.key !== 'Delete' && ev.key !== 'Backspace') return
	const sel = selectedKeyframe.value
	if (!sel) return
	ev.preventDefault()
	const tr = tracks.value.find((t) => t.id === sel.trackId)
	if (!tr) return
	emit('remove-keyframe', {
		type: tr.kind,
		id: tr.kind === 'character' ? tr.id : undefined,
		keyframeId: sel.keyframeId
	})
	selectedKeyframe.value = null
}

const canAddKeyframe = computed(() => {
	// 摄像头选中或角色选中时可用
	return (
		props.selectedObjectId === cameraSelectionId ||
		props.characters.some((c) => c.id === props.selectedObjectId)
	)
})

// [v5.0] 导出视频：存在摄像头轨道且总帧数 > 1 时可用
const canExport = computed(() => {
	return !!props.cameraTrack && (props.totalFrames || 0) > 1
})

function keyframeX(_tr: TrackInfo, kf: { frame: number }): number {
	return kf.frame * frameWidth.value
}

// ===== 添加关键帧 =====
function onAddKeyframe() {
	if (props.selectedObjectId === cameraSelectionId) {
		emit('add-keyframe', { type: 'camera' })
	} else if (props.characters.some((c) => c.id === props.selectedObjectId)) {
		emit('add-keyframe', { type: 'character', id: props.selectedObjectId })
	}
}

// [v5.0] 导出视频
function onExportVideo() {
	emit('export-video')
}

function onSelectTrack(tr: TrackInfo) {
	// 点击轨道行时清除关键帧选中状态
	selectedKeyframe.value = null
	if (tr.kind === 'camera') {
		emit('update:currentFrame', props.currentFrame) // 选中不改变帧
	} else {
		emit('update:currentFrame', props.currentFrame)
	}
}

// ===== 关键帧点击/右键 =====
const contextMenu = ref({
	visible: false,
	x: 0,
	y: 0,
	target: null as null | { type: 'camera' | 'character'; id?: string; keyframeId: string }
})

function onKeyframeClick(tr: TrackInfo, kf: { id: string; frame: number }) {
	// 选中关键帧（支持 Delete/Backspace 删除）
	selectedKeyframe.value = { trackId: tr.id, keyframeId: kf.id }
	// 跳转到该关键帧
	emit('update:currentFrame', kf.frame)
	scrollIntoView(kf.frame)
}

function onKeyframeRightClick(tr: TrackInfo, kf: { id: string; frame: number }, ev: MouseEvent) {
	contextMenu.value = {
		visible: true,
		x: ev.clientX,
		y: ev.clientY,
		target: { type: tr.kind, id: tr.kind === 'character' ? tr.id : undefined, keyframeId: kf.id }
	}
}

function onContextMenuDelete() {
	if (contextMenu.value.target) {
		emit('remove-keyframe', contextMenu.value.target)
		// 若右键删除的正是当前选中的关键帧，清除选中状态
		if (
			selectedKeyframe.value?.keyframeId === contextMenu.value.target.keyframeId &&
			selectedKeyframe.value?.trackId === (contextMenu.value.target.id ?? cameraSelectionId)
		) {
			selectedKeyframe.value = null
		}
	}
	contextMenu.value.visible = false
}

function closeContextMenu() {
	contextMenu.value.visible = false
}

// ===== Blender 风格交互 =====
function calcFrameFromClientX(clientX: number): number {
	const el = viewportRef.value
	if (!el) return props.currentFrame
	const rect = el.getBoundingClientRect()
	// 刻度尺左侧有 LABEL_WIDTH 的标签列占位，需扣除后才是刻度区域的相对坐标
	const x = clientX - rect.left - LABEL_WIDTH
	const worldX = x + scrollLeft.value
	return Math.max(0, Math.min(props.totalFrames - 1, Math.round(worldX / frameWidth.value)))
}

function scrollIntoView(frame: number) {
	const x = frame * frameWidth.value
	if (x < scrollLeft.value) {
		scrollLeft.value = Math.max(0, x - 20)
	} else if (x > scrollLeft.value + visibleTrackWidth.value - 40) {
		scrollLeft.value = Math.min(maxScrollLeft.value, x - visibleTrackWidth.value + 40)
	}
}

// 滚轮缩放（以光标为中心）
function onWheel(ev: WheelEvent) {
	const el = viewportRef.value
	if (!el) return
	const rect = el.getBoundingClientRect()
	// 扣除左侧标签列占位，得到刻度区域内的光标坐标
	const cursorX = ev.clientX - rect.left - LABEL_WIDTH
	const worldX = cursorX + scrollLeft.value
	const frameAtCursor = worldX / frameWidth.value

	const zoomIn = ev.deltaY < 0
	const factor = zoomIn ? 1.12 : 1 / 1.12
	const nextFw = Math.max(MIN_FRAME_WIDTH, Math.min(MAX_FRAME_WIDTH, frameWidth.value * factor))
	frameWidth.value = nextFw

	// 保持光标下的帧不动
	const newWorldX = frameAtCursor * nextFw
	scrollLeft.value = Math.max(0, Math.min(maxScrollLeft.value, newWorldX - cursorX))
	drawTicks()
}

// 中键平移
const panState = { active: false, startX: 0, startScroll: 0 }

function onViewportMouseDown(ev: MouseEvent) {
	if (ev.button !== 1) return // 仅中键
	ev.preventDefault()
	panState.active = true
	panState.startX = ev.clientX
	panState.startScroll = scrollLeft.value
	window.addEventListener('mousemove', onPanMove)
	window.addEventListener('mouseup', onPanUp)
}

function onPanMove(ev: MouseEvent) {
	if (!panState.active) return
	const dx = ev.clientX - panState.startX
	scrollLeft.value = Math.max(0, Math.min(maxScrollLeft.value, panState.startScroll - dx))
	drawTicks()
}

function onPanUp() {
	panState.active = false
	window.removeEventListener('mousemove', onPanMove)
	window.removeEventListener('mouseup', onPanUp)
}

// 左键点击/拖拽播放头
const playheadDrag = { active: false }

function onRulerPointerDown(ev: PointerEvent) {
	if (ev.button !== 0) return
	playheadDrag.active = true
	try {
		;(ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId)
	} catch {
		// ignore
	}
	emit('update:currentFrame', calcFrameFromClientX(ev.clientX))
	window.addEventListener('pointermove', onPlayheadPointerMove)
	window.addEventListener('pointerup', onPlayheadPointerUp)
}

function onRulerPointerMove(_ev: PointerEvent) {
	/* handled by global listener */
}

function onRulerPointerUp(_ev: PointerEvent) {
	/* handled by global listener */
}

function onPlayheadPointerMove(ev: PointerEvent) {
	if (!playheadDrag.active) return
	emit('update:currentFrame', calcFrameFromClientX(ev.clientX))
}

function onPlayheadPointerUp() {
	playheadDrag.active = false
	window.removeEventListener('pointermove', onPlayheadPointerMove)
	window.removeEventListener('pointerup', onPlayheadPointerUp)
}

// ===== FPS / 总帧数变更 =====
function onFpsChange(ev: Event) {
	const v = Number((ev.target as HTMLInputElement).value)
	if (v > 0) emit('update:fps', Math.min(240, Math.floor(v)))
}

function onTotalFramesChange(ev: Event) {
	const v = Number((ev.target as HTMLInputElement).value)
	if (v > 0) emit('update:totalFrames', Math.floor(v))
}

// ===== Canvas 刻度绘制 =====
function drawTicks() {
	const canvas = tickCanvasRef.value
	if (!canvas) return
	const ctx = canvas.getContext('2d')
	if (!ctx) return
	const dpr = window.devicePixelRatio || 1
	// 画布宽度为可见刻度区域宽度（已扣除左侧标签列）
	const w = visibleTrackWidth.value
	const h = 22
	canvas.width = w * dpr
	canvas.height = h * dpr
	canvas.style.width = w + 'px'
	canvas.style.height = h + 'px'
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	ctx.clearRect(0, 0, w, h)
	const fw = frameWidth.value
	const interval = tickInterval.value
	const startFrame = Math.floor(scrollLeft.value / fw)
	const endFrame = Math.ceil((scrollLeft.value + w) / fw)
	ctx.font = '10px Consolas, monospace'
	ctx.fillStyle = 'rgba(31, 157, 132, 0.7)'
	ctx.strokeStyle = 'rgba(31, 157, 132, 0.35)'
	ctx.textAlign = 'center'
	ctx.textBaseline = 'top'
	for (let f = Math.floor(startFrame / interval) * interval; f <= endFrame; f += interval) {
		if (f < 0) continue
		const x = f * fw - scrollLeft.value
		ctx.beginPath()
		ctx.moveTo(x, h - 6)
		ctx.lineTo(x, h - 14)
		ctx.stroke()
		if (f % (interval * 5) === 0 || interval >= 10) {
			ctx.fillText(String(f), x, 2)
		}
	}
}

// ===== 生命周期 =====
let resizeObserver: ResizeObserver | null = null

function updateViewportWidth() {
	const el = viewportRef.value
	if (!el) return
	const rect = el.getBoundingClientRect()
	viewportWidth.value = rect.width
	scrollLeft.value = Math.min(scrollLeft.value, maxScrollLeft.value)
	drawTicks()
}

/** 全局键盘监听：Delete/Backspace 删除选中的关键帧 */
function onGlobalKeydown(ev: KeyboardEvent) {
	if (ev.key !== 'Delete' && ev.key !== 'Backspace') return
	// 输入框中不触发
	const tag = (ev.target as HTMLElement | null)?.tagName
	if (tag === 'INPUT' || tag === 'TEXTAREA' || (ev.target as HTMLElement)?.isContentEditable) return
	if (!selectedKeyframe.value) return
	ev.preventDefault()
	const sel = selectedKeyframe.value
	const tr = tracks.value.find((t) => t.id === sel.trackId)
	if (!tr) return
	emit('remove-keyframe', {
		type: tr.kind,
		id: tr.kind === 'character' ? tr.id : undefined,
		keyframeId: sel.keyframeId
	})
	selectedKeyframe.value = null
}

onMounted(() => {
	nextTick(() => {
		updateViewportWidth()
		drawTicks()
	})
	resizeObserver = new ResizeObserver(() => {
		updateViewportWidth()
	})
	if (viewportRef.value) {
		resizeObserver.observe(viewportRef.value)
	}
	window.addEventListener('click', closeContextMenu)
	window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
	resizeObserver?.disconnect()
	window.removeEventListener('mousemove', onPanMove)
	window.removeEventListener('mouseup', onPanUp)
	window.removeEventListener('keydown', onGlobalKeydown)
	window.removeEventListener('pointermove', onPlayheadPointerMove)
	window.removeEventListener('pointerup', onPlayheadPointerUp)
	window.removeEventListener('click', closeContextMenu)
})

watch(
	() => [props.currentFrame, props.totalFrames],
	() => {
		nextTick(() => drawTicks())
	}
)

watch(scrollLeft, () => {
	drawTicks()
})
</script>

<style scoped>
.dc-tl {
	position: relative;
	display: flex;
	flex-direction: column;
	width: 100%;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 4%, var(--wf-page-bg, #0a0f14));
	backdrop-filter: blur(10px) saturate(140%);
	-webkit-backdrop-filter: blur(10px) saturate(140%);
	border-top: 1px solid
		color-mix(in srgb, var(--wf-primary, #27b99c) 22%, var(--wf-border-subtle, transparent));
}

.dc-tl-corner {
	position: absolute;
	width: 8px;
	height: 8px;
	border-color: var(--wf-primary, #27b99c);
	pointer-events: none;
	z-index: 2;
}
.dc-tl-corner-tl {
	top: 0;
	left: 0;
	border-top: 1px solid var(--wf-primary, #27b99c);
	border-left: 1px solid var(--wf-primary, #27b99c);
}
.dc-tl-corner-br {
	bottom: 0;
	right: 0;
	border-bottom: 1px solid var(--wf-primary, #27b99c);
	border-right: 1px solid var(--wf-primary, #27b99c);
}

/* 工具条 */
.dc-tl-toolbar {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 4px 12px;
	height: 32px;
	flex-shrink: 0;
}
.dc-tl-play-controls {
	display: flex;
	gap: 2px;
}
.dc-tl-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 24px;
	height: 22px;
	padding: 0 6px;
	font-size: 11px;
	color: var(--wf-text, #c8d6e5);
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 8%, transparent);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 22%, transparent);
	cursor: pointer;
	transition:
		background 0.15s,
		border-color 0.15s;
}
.dc-tl-btn:hover:not(:disabled) {
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 20%, transparent);
}
.dc-tl-btn:disabled {
	opacity: 0.35;
	cursor: default;
}
.dc-tl-btn.active {
	border-color: color-mix(in srgb, var(--wf-primary, #27b99c) 70%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 22%, transparent);
}
.dc-tl-keyframe-add {
	color: var(--wf-primary, #27b99c);
	font-weight: 600;
}
.dc-tl-export-video {
	color: var(--wf-primary, #27b99c);
	font-weight: 600;
}
.dc-tl-export-video:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}
.dc-tl-sep {
	width: 1px;
	height: 16px;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 22%, transparent);
	flex-shrink: 0;
}
.dc-tl-field {
	display: flex;
	align-items: center;
	gap: 4px;
}
.dc-tl-label {
	font-size: 10px;
	color: var(--wf-text-muted, #8899aa);
	white-space: nowrap;
}
.dc-tl-input {
	width: 48px;
	height: 20px;
	padding: 0 4px;
	font-size: 11px;
	color: var(--wf-text, #c8d6e5);
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 6%, var(--wf-page-bg, #0a0f14));
	border: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 22%, transparent);
	outline: none;
}
.dc-tl-input:focus {
	border-color: var(--wf-primary, #27b99c);
}
.dc-tl-frame-display {
	display: flex;
	align-items: center;
	gap: 3px;
	font-size: 12px;
	font-family: Consolas, monospace;
}
.dc-tl-frame-current {
	color: var(--wf-primary, #27b99c);
	font-weight: 600;
	min-width: 24px;
	text-align: right;
}
.dc-tl-frame-sep {
	color: var(--wf-text-muted, #8899aa);
}
.dc-tl-frame-total {
	color: var(--wf-text-muted, #8899aa);
}
.dc-tl-spacer {
	flex: 1;
}
.dc-tl-collapse {
	font-size: 10px;
}

/* 时间轴主体 */
.dc-tl-body {
	display: flex;
	flex-direction: column;
	max-height: 120px;
	overflow: hidden;
}

/* 刻度尺视口 */
.dc-tl-viewport {
	position: relative;
	height: 22px;
	overflow: hidden;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 2%, var(--wf-page-bg, #0a0f14));
	border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 18%, transparent);
	cursor: pointer;
	user-select: none;
}
/* 刻度尺左侧标签列占位，与轨道行的 label 列对齐 */
.dc-tl-ruler-spacer {
	position: absolute;
	top: 0;
	left: 0;
	height: 100%;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 3%, var(--wf-page-bg, #0a0f14));
	border-right: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 18%, transparent);
	z-index: 1;
	pointer-events: none;
}
.dc-tl-tick-canvas {
	position: absolute;
	top: 0;
	left: 120px; /* 与 LABEL_WIDTH 一致 */
	pointer-events: none;
}
.dc-tl-track-area {
	position: absolute;
	top: 0;
	height: 100%;
	will-change: transform;
}

/* 播放头 */
.dc-tl-playhead {
	position: absolute;
	top: 0;
	left: 0;
	height: 100%;
	pointer-events: none;
	z-index: 3;
}
.dc-tl-playhead-handle {
	position: absolute;
	top: 0;
	left: -5px;
	width: 10px;
	height: 8px;
	background: var(--wf-primary, #27b99c);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 80%, #fff);
	box-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #27b99c) 60%, transparent);
}
.dc-tl-playhead-line {
	position: absolute;
	top: 8px;
	left: 0;
	width: 1px;
	height: calc(100% - 8px);
	background: var(--wf-primary, #27b99c);
	box-shadow: 0 0 4px color-mix(in srgb, var(--wf-primary, #27b99c) 60%, transparent);
}

/* 轨道列表 */
.dc-tl-tracks {
	flex: 1;
	overflow-y: auto;
	overflow-x: hidden;
}
.dc-tl-track-row {
	display: flex;
	align-items: stretch;
	height: 22px;
	border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 10%, transparent);
	cursor: pointer;
}
.dc-tl-track-row:hover {
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 6%, transparent);
}
.dc-tl-track-row.active {
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 12%, transparent);
}
.dc-tl-track-label {
	display: flex;
	align-items: center;
	gap: 4px;
	width: 120px;
	min-width: 120px;
	max-width: 120px;
	flex-shrink: 0;
	padding: 0 8px;
	border-right: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 18%, transparent);
	overflow: hidden;
	box-sizing: border-box;
}
/* 子级角色缩进引导线 */
.dc-tl-track-indent-guide {
	width: 1px;
	height: 100%;
	flex-shrink: 0;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 25%, transparent);
}
.dc-tl-track-dot {
	width: 8px;
	height: 8px;
	flex-shrink: 0;
}
.dc-tl-track-name {
	font-size: 11px;
	color: var(--wf-text, #c8d6e5);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.dc-tl-track-kf-count {
	margin-left: auto;
	font-size: 10px;
	color: var(--wf-text-muted, #8899aa);
	font-family: Consolas, monospace;
}
.dc-tl-track-cells {
	position: relative;
	flex: 1;
	overflow: hidden;
}

/* 关键帧标记 */
.dc-tl-keyframe {
	position: absolute;
	top: 50%;
	width: 8px;
	height: 8px;
	transform: translate(-50%, -50%) rotate(45deg);
	background: var(--kf-color, var(--wf-primary, #27b99c));
	border: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 50%, #fff);
	cursor: pointer;
	transition: transform 0.1s;
}
.dc-tl-keyframe:hover {
	transform: translate(-50%, -50%) rotate(45deg) scale(1.4);
}
.dc-tl-keyframe.selected {
	transform: translate(-50%, -50%) rotate(45deg) scale(1.5);
	box-shadow: 0 0 8px 2px var(--kf-color, var(--wf-primary, #27b99c));
	border-color: #fff;
}

/* 空状态 */
.dc-tl-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 44px;
	font-size: 11px;
	color: var(--wf-text-muted, #8899aa);
}

/* 右键菜单 */
.dc-tl-context-menu {
	position: fixed;
	z-index: 1000;
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 8%, var(--wf-page-bg, #0a0f14));
	border: 1px solid color-mix(in srgb, var(--wf-primary, #27b99c) 30%, transparent);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
	padding: 2px;
}
.dc-tl-context-btn {
	display: block;
	width: 100%;
	padding: 4px 12px;
	font-size: 11px;
	color: var(--wf-text, #c8d6e5);
	background: transparent;
	border: none;
	cursor: pointer;
	text-align: left;
	white-space: nowrap;
}
.dc-tl-context-btn:hover {
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 20%, transparent);
}

/* 滚动条 */
.dc-tl-tracks::-webkit-scrollbar {
	width: 4px;
}
.dc-tl-tracks::-webkit-scrollbar-track {
	background: transparent;
}
.dc-tl-tracks::-webkit-scrollbar-thumb {
	background: color-mix(in srgb, var(--wf-primary, #27b99c) 30%, transparent);
}
</style>
