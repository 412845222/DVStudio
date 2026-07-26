<template>
	<div class="wf-minimap" :class="{ 'wf-minimap--light': isLight }">
		<Transition name="wf-minimap-toggle-anim" appear>
			<button
				v-if="collapsed"
				key="toggle"
				class="wf-minimap-toggle"
				type="button"
				@click="onExpand"
				:title="t('aiworkflow.canvas.minimapExpand')"
			>
				<div class="wf-minimap-toggle-glow" />
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
					<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
					<line x1="8" y1="2" x2="8" y2="18" />
					<line x1="16" y1="6" x2="16" y2="22" />
					<circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
				</svg>
			</button>
		</Transition>
		<Transition name="wf-minimap-panel-anim" appear @after-enter="onPanelAfterEnter">
			<div v-if="!collapsed" key="panel" class="wf-minimap-panel" @wheel.stop.prevent>
				<div class="wf-minimap-scanline" />
				<div class="wf-minimap-header">
					<span class="wf-minimap-title">{{ t('aiworkflow.canvas.minimap') }}</span>
					<div class="wf-minimap-actions">
						<button
							class="wf-minimap-fit-btn"
							type="button"
							@click="fitToAllNodes"
							:title="t('aiworkflow.canvas.minimapFitAll')"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
							</svg>
						</button>
						<button
							class="wf-minimap-collapse-btn"
							type="button"
							@click="collapsed = true"
							:title="t('aiworkflow.canvas.minimapCollapse')"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M19 12H5M12 19l-7-7 7-7" />
							</svg>
						</button>
					</div>
				</div>
				<canvas
					ref="canvasRef"
					class="wf-minimap-canvas"
					@pointerdown="onCanvasPointerDown"
					@pointermove="onCanvasPointerMove"
					@pointerup="onCanvasPointerUp"
					@pointerleave="onCanvasPointerUp"
					@wheel.stop.prevent="onCanvasWheel"
				/>
				<div class="wf-minimap-corner wf-minimap-corner--tl" />
				<div class="wf-minimap-corner wf-minimap-corner--tr" />
				<div class="wf-minimap-corner wf-minimap-corner--bl" />
				<div class="wf-minimap-corner wf-minimap-corner--br" />
				<div class="wf-minimap-border-glow" />
			</div>
		</Transition>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useStore } from 'vuex'
import { ThemeKey } from '../../../store/theme'
import type { ThemeMode } from '../../../store/theme'
import { useI18n } from '../../../i18n'
import type { WorkflowNode, WorkflowViewport } from '../../../aiworkflow/types'
import {
	MINIMAP_WIDTH,
	MINIMAP_HEIGHT,
	computeWorldBounds,
	computeMinimapScale,
	computeMinimapOffset,
	worldToMinimap as _worldToMinimap,
	minimapToWorld as _minimapToWorld,
	computeViewportInMinimap,
	computePanForWorldPoint,
	computeFitAllViewport,
	computeWheelZoomViewport
} from '../blueprint-core/minimapUtils'

interface Props {
	nodesById: Record<string, WorkflowNode>
	viewport: WorkflowViewport
	canvasSize?: { width: number; height: number }
}

const props = withDefaults(defineProps<Props>(), {
	canvasSize: () => ({ width: 800, height: 600 })
})

const emit = defineEmits<{
	(e: 'update:viewport', viewport: WorkflowViewport): void
}>()

const { t } = useI18n()
const themeStore = useStore<{ mode: ThemeMode }>(ThemeKey)

const isLight = computed(() => themeStore.state.mode === 'light')

const NODE_TYPE_COLORS: Record<string, { dark: string; light: string }> = {
	text: { dark: '#3f8cfc', light: '#2563eb' },
	'text-merge': { dark: '#3f8cfc', light: '#2563eb' },
	image: { dark: '#ec4899', light: '#db2777' },
	'rotate-image': { dark: '#ec4899', light: '#db2777' },
	video: { dark: '#34d399', light: '#059669' },
	'scene-understanding': { dark: '#a855f7', light: '#7c3aed' },
	'scene-decompose': { dark: '#a855f7', light: '#7c3aed' },
	'scene-layout': { dark: '#f97322', light: '#ea580c' },
	'unreal-export': { dark: '#f97322', light: '#ea580c' },
	story: { dark: '#f59e0b', light: '#d97706' },
	comfyui: { dark: '#0ea5e9', light: '#0284c7' },
	model3d: { dark: '#3b82f6', light: '#2563eb' },
	meshy: { dark: '#0ea5e9', light: '#0284c7' },
	base: { dark: '#1f9d84', light: '#0f766e' }
}

const collapsed = ref(false)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let rafId: number | null = null
let isDraggingViewport = false
let dragStartMinimap = { x: 0, y: 0 }
let dragStartPan = { x: 0, y: 0 }
let themeObserver: MutationObserver | null = null
let isUpdatingFromMinimap = false

const getNodeColor = (type: string): string => {
	const colors = NODE_TYPE_COLORS[type] || { dark: '#1f9d84', light: '#0f766e' }
	return isLight.value ? colors.light : colors.dark
}

const themeColors = computed(() => {
	if (isLight.value) {
		return {
			bg: 'rgba(255, 255, 255, 0.22)',
			border: 'rgba(15, 118, 110, 0.25)',
			borderHover: 'rgba(15, 118, 110, 0.7)',
			corner: 'rgba(15, 118, 110, 0.8)',
			headerBorder: 'rgba(15, 118, 110, 0.15)',
			title: '#0f766e',
			text: '#4b5563',
			textHover: '#0f766e',
			btnBgHover: 'rgba(15, 118, 110, 0.1)',
			vpFill: 'rgba(0, 0, 0, 0.05)',
			vpStroke: 'rgba(0, 0, 0, 0.3)',
			nodeStroke: 'rgba(0, 0, 0, 0.12)'
		}
	}
	return {
		bg: 'rgba(8, 11, 16, 0.18)',
		border: 'rgba(31, 157, 132, 0.22)',
		borderHover: 'rgba(31, 157, 132, 0.8)',
		corner: 'rgba(31, 157, 132, 0.8)',
		headerBorder: 'rgba(31, 157, 132, 0.12)',
		title: '#6ee7b7',
		text: '#aeb8bd',
		textHover: '#6ee7b7',
		btnBgHover: 'rgba(31, 157, 132, 0.15)',
		vpFill: 'rgba(255, 255, 255, 0.06)',
		vpStroke: 'rgba(255, 255, 255, 0.4)',
		nodeStroke: 'rgba(255, 255, 255, 0.15)'
	}
})

const nodesList = computed(() => Object.values(props.nodesById || {}))

const nodesHash = computed(() => {
	const nodes = nodesList.value
	return nodes.map(n => `${n.id}:${n.worldX},${n.worldY},${n.width},${n.height}`).join('|')
})

const worldBounds = computed(() => computeWorldBounds(nodesList.value))

const minimapScale = computed(() => computeMinimapScale(worldBounds.value))

const minimapOffset = computed(() => computeMinimapOffset(worldBounds.value, minimapScale.value))

const worldToMinimap = (wx: number, wy: number) =>
	_worldToMinimap(wx, wy, worldBounds.value, minimapScale.value, minimapOffset.value)

const minimapToWorld = (mx: number, my: number) =>
	_minimapToWorld(mx, my, worldBounds.value, minimapScale.value, minimapOffset.value)

const viewportInMinimap = computed(() =>
	computeViewportInMinimap(props.viewport, props.canvasSize, worldBounds.value, minimapScale.value, minimapOffset.value)
)

const scheduleRender = () => {
	if (rafId !== null) return
	rafId = requestAnimationFrame(() => {
		rafId = null
		render()
	})
}

const render = () => {
	const canvas = canvasRef.value
	if (!canvas) return
	const ctx = canvas.getContext('2d')
	if (!ctx) return

	const dpr = window.devicePixelRatio || 1
	const w = MINIMAP_WIDTH
	const h = MINIMAP_HEIGHT
	const colors = themeColors.value

	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	ctx.clearRect(0, 0, w, h)

	ctx.fillStyle = colors.bg
	ctx.fillRect(0, 0, w, h)

	const nodes = nodesList.value
	const scale = minimapScale.value
	if (scale > 0) {
		for (const node of nodes) {
			const wx = node.worldX ?? 0
			const wy = node.worldY ?? 0
			const nw = node.width ?? 200
			const nh = node.height ?? 160
			const tl = worldToMinimap(wx - nw / 2, wy - nh / 2)
			const nodeW = Math.max(2, nw * scale)
			const nodeH = Math.max(2, nh * scale)

			ctx.fillStyle = getNodeColor(node.type)
			ctx.globalAlpha = 0.45
			ctx.fillRect(tl.x, tl.y, nodeW, nodeH)
			ctx.strokeStyle = colors.nodeStroke
			ctx.globalAlpha = 0.25
			ctx.lineWidth = 0.5
			ctx.strokeRect(tl.x, tl.y, nodeW, nodeH)
		}
		ctx.globalAlpha = 1
	}

	const vpRect = viewportInMinimap.value
	ctx.fillStyle = colors.vpFill
	ctx.fillRect(vpRect.x, vpRect.y, vpRect.width, vpRect.height)
	ctx.strokeStyle = colors.vpStroke
	ctx.lineWidth = 1.5
	ctx.strokeRect(vpRect.x, vpRect.y, vpRect.width, vpRect.height)
}

const toCanvasLocal = (e: PointerEvent) => {
	const canvas = canvasRef.value
	if (!canvas) return { x: 0, y: 0 }
	const rect = canvas.getBoundingClientRect()
	return {
		x: e.clientX - rect.left,
		y: e.clientY - rect.top
	}
}

const onExpand = () => {
	collapsed.value = false
}

const onPanelAfterEnter = () => {
	nextTick(() => {
		scheduleRender()
	})
}

const onCanvasPointerDown = (e: PointerEvent) => {
	if (e.button !== 0) return
	const canvas = canvasRef.value
	if (!canvas) return

	const local = toCanvasLocal(e)
	canvas.setPointerCapture(e.pointerId)

	const zoom = props.viewport.zoom || 1
	const world = minimapToWorld(local.x, local.y)
	const { panX: targetPanX, panY: targetPanY } = computePanForWorldPoint(world.x, world.y, zoom)

	isUpdatingFromMinimap = true
	emit('update:viewport', { zoom, panX: targetPanX, panY: targetPanY })
	isDraggingViewport = true
	dragStartMinimap = local
	dragStartPan = { x: targetPanX, y: targetPanY }
}

const onCanvasPointerMove = (e: PointerEvent) => {
	if (!isDraggingViewport) return
	const canvas = canvasRef.value
	if (!canvas) return

	const local = toCanvasLocal(e)
	const scale = minimapScale.value
	const zoom = props.viewport.zoom || 1

	const dxMinimap = local.x - dragStartMinimap.x
	const dyMinimap = local.y - dragStartMinimap.y

	const dxWorld = dxMinimap / scale
	const dyWorld = dyMinimap / scale

	const panX = dragStartPan.x - dxWorld * zoom
	const panY = dragStartPan.y - dyWorld * zoom

	isUpdatingFromMinimap = true
	emit('update:viewport', { zoom, panX, panY })
}

const onCanvasPointerUp = (e: PointerEvent) => {
	if (isDraggingViewport) {
		isDraggingViewport = false
		const canvas = canvasRef.value
		if (canvas) {
			try {
				canvas.releasePointerCapture(e.pointerId)
			} catch {
				// ignore
			}
		}
	}
	requestAnimationFrame(() => {
		isUpdatingFromMinimap = false
	})
}

const onCanvasWheel = (e: WheelEvent) => {
	const canvas = canvasRef.value
	if (!canvas) return

	const rect = canvas.getBoundingClientRect()
	const mx = e.clientX - rect.left
	const my = e.clientY - rect.top

	const result = computeWheelZoomViewport(
		props.viewport,
		props.canvasSize,
		mx,
		my,
		worldBounds.value,
		minimapScale.value,
		minimapOffset.value,
		e.deltaY
	)
	isUpdatingFromMinimap = true
	emit('update:viewport', result)
	requestAnimationFrame(() => {
		isUpdatingFromMinimap = false
	})
}

const fitToAllNodes = () => {
	const result = computeFitAllViewport(nodesList.value, props.canvasSize)
	isUpdatingFromMinimap = true
	emit('update:viewport', result)
	requestAnimationFrame(() => {
		isUpdatingFromMinimap = false
	})
}

watch(
	() => [
		props.viewport.zoom,
		props.viewport.panX,
		props.viewport.panY,
		props.canvasSize.width,
		props.canvasSize.height,
		nodesHash.value,
		isLight.value
	],
	() => {
		if (!collapsed.value) {
			scheduleRender()
		}
	},
	{ flush: 'post' }
)

watch(collapsed, (newVal) => {
	if (!newVal) {
		nextTick(() => {
			scheduleRender()
		})
	}
})

onMounted(() => {
	const canvas = canvasRef.value
	if (canvas) {
		const dpr = window.devicePixelRatio || 1
		canvas.width = MINIMAP_WIDTH * dpr
		canvas.height = MINIMAP_HEIGHT * dpr
		canvas.style.width = `${MINIMAP_WIDTH}px`
		canvas.style.height = `${MINIMAP_HEIGHT}px`
	}

	scheduleRender()

	themeObserver = new MutationObserver(() => scheduleRender())
	themeObserver.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['data-theme']
	})
})

onBeforeUnmount(() => {
	if (rafId !== null) {
		cancelAnimationFrame(rafId)
		rafId = null
	}
	themeObserver?.disconnect()
	themeObserver = null
})
</script>

<style scoped>
.wf-minimap {
	position: relative;
	pointer-events: auto;
	user-select: none;
}

.wf-minimap-toggle {
	position: relative;
	width: 36px;
	height: 36px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(8, 11, 16, 0.18);
	backdrop-filter: blur(20px);
	-webkit-backdrop-filter: blur(20px);
	border: 1px solid rgba(31, 157, 132, 0.25);
	color: #aeb8bd;
	cursor: pointer;
	overflow: hidden;
	transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.wf-minimap-toggle:hover {
	border-color: rgba(31, 157, 132, 0.8);
	color: #6ee7b7;
	background: rgba(8, 11, 16, 0.35);
	box-shadow: 0 0 12px rgba(31, 157, 132, 0.3), inset 0 0 8px rgba(31, 157, 132, 0.1);
}

.wf-minimap-toggle-glow {
	position: absolute;
	inset: 0;
	background: linear-gradient(135deg, rgba(31, 157, 132, 0.15) 0%, transparent 50%, rgba(31, 157, 132, 0.08) 100%);
	pointer-events: none;
	animation: wf-minimap-pulse 2.5s ease-in-out infinite;
}

.wf-minimap--light .wf-minimap-toggle {
	background: rgba(255, 255, 255, 0.22);
	border-color: rgba(15, 118, 110, 0.25);
	color: #4b5563;
}

.wf-minimap--light .wf-minimap-toggle:hover {
	border-color: rgba(15, 118, 110, 0.7);
	color: #0f766e;
	background: rgba(255, 255, 255, 0.4);
	box-shadow: 0 0 12px rgba(15, 118, 110, 0.25), inset 0 0 8px rgba(15, 118, 110, 0.08);
}

.wf-minimap-panel {
	position: relative;
	width: 200px;
	background: rgba(8, 11, 16, 0.18);
	backdrop-filter: blur(20px);
	-webkit-backdrop-filter: blur(20px);
	border: 1px solid rgba(31, 157, 132, 0.22);
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
	overflow: hidden;
	transform-origin: bottom left;
}

.wf-minimap--light .wf-minimap-panel {
	background: rgba(255, 255, 255, 0.22);
	border-color: rgba(15, 118, 110, 0.25);
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06);
}

.wf-minimap-scanline {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 2px;
	background: linear-gradient(90deg, transparent, rgba(31, 157, 132, 0.6), transparent);
	pointer-events: none;
	z-index: 10;
	animation: wf-minimap-scan 3s linear infinite;
	opacity: 0.6;
}

.wf-minimap--light .wf-minimap-scanline {
	background: linear-gradient(90deg, transparent, rgba(15, 118, 110, 0.5), transparent);
}

.wf-minimap-border-glow {
	position: absolute;
	inset: -1px;
	border: 1px solid transparent;
	background: linear-gradient(135deg, rgba(31, 157, 132, 0.3) 0%, transparent 40%, transparent 60%, rgba(31, 157, 132, 0.2) 100%) border-box;
	-webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
	mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
	-webkit-mask-composite: xor;
	mask-composite: exclude;
	pointer-events: none;
	opacity: 0.8;
	animation: wf-minimap-border-pulse 3s ease-in-out infinite;
}

.wf-minimap--light .wf-minimap-border-glow {
	background: linear-gradient(135deg, rgba(15, 118, 110, 0.25) 0%, transparent 40%, transparent 60%, rgba(15, 118, 110, 0.2) 100%) border-box;
}

.wf-minimap-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 6px 8px;
	border-bottom: 1px solid rgba(31, 157, 132, 0.12);
	position: relative;
	z-index: 5;
}

.wf-minimap--light .wf-minimap-header {
	border-bottom-color: rgba(15, 118, 110, 0.15);
}

.wf-minimap-title {
	font-size: 11px;
	font-weight: 600;
	color: #6ee7b7;
	text-transform: uppercase;
	letter-spacing: 0.5px;
}

.wf-minimap--light .wf-minimap-title {
	color: #0f766e;
}

.wf-minimap-actions {
	display: flex;
	gap: 4px;
}

.wf-minimap-fit-btn,
.wf-minimap-collapse-btn {
	width: 20px;
	height: 20px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: transparent;
	border: none;
	color: #aeb8bd;
	cursor: pointer;
	padding: 0;
	border-radius: 2px;
	transition: all 0.15s ease;
}

.wf-minimap--light .wf-minimap-fit-btn,
.wf-minimap--light .wf-minimap-collapse-btn {
	color: #4b5563;
}

.wf-minimap-fit-btn:hover,
.wf-minimap-collapse-btn:hover {
	background: rgba(31, 157, 132, 0.15);
	color: #6ee7b7;
}

.wf-minimap--light .wf-minimap-fit-btn:hover,
.wf-minimap--light .wf-minimap-collapse-btn:hover {
	background: rgba(15, 118, 110, 0.1);
	color: #0f766e;
}

.wf-minimap-canvas {
	display: block;
	cursor: crosshair;
	touch-action: none;
}

.wf-minimap-corner {
	position: absolute;
	width: 8px;
	height: 8px;
	border-style: solid;
	border-width: 0;
	border-color: rgba(31, 157, 132, 0.8);
}

.wf-minimap-corner--tl {
	top: -1px;
	left: -1px;
	border-top-width: 2px;
	border-left-width: 2px;
}

.wf-minimap-corner--tr {
	top: -1px;
	right: -1px;
	border-top-width: 2px;
	border-right-width: 2px;
}

.wf-minimap-corner--bl {
	bottom: -1px;
	left: -1px;
	border-bottom-width: 2px;
	border-left-width: 2px;
}

.wf-minimap-corner--br {
	bottom: -1px;
	right: -1px;
	border-bottom-width: 2px;
	border-right-width: 2px;
}

.wf-minimap--light .wf-minimap-corner {
	border-color: rgba(15, 118, 110, 0.8);
}

/* Toggle button transition */
.wf-minimap-toggle-anim-enter-active {
	transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.wf-minimap-toggle-anim-leave-active {
	transition: all 0.2s cubic-bezier(0.4, 0, 1, 1);
}
.wf-minimap-toggle-anim-enter-from {
	opacity: 0;
	transform: scale(0.6) translateY(5px);
}
.wf-minimap-toggle-anim-leave-to {
	opacity: 0;
	transform: scale(0.8) translateY(3px);
}

/* Panel transition */
.wf-minimap-panel-anim-enter-active {
	transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.wf-minimap-panel-anim-leave-active {
	transition: all 0.2s cubic-bezier(0.4, 0, 1, 1);
}
.wf-minimap-panel-anim-enter-from {
	opacity: 0;
	transform: scale(0.7) translateY(10px);
	transform-origin: bottom left;
}
.wf-minimap-panel-anim-leave-to {
	opacity: 0;
	transform: scale(0.85) translateY(5px);
	transform-origin: bottom left;
}

@keyframes wf-minimap-pulse {
	0%, 100% { opacity: 0.5; }
	50% { opacity: 1; }
}

@keyframes wf-minimap-border-pulse {
	0%, 100% { opacity: 0.5; }
	50% { opacity: 0.9; }
}

@keyframes wf-minimap-scan {
	0% { transform: translateY(0); opacity: 0; }
	10% { opacity: 0.6; }
	90% { opacity: 0.6; }
	100% { transform: translateY(173px); opacity: 0; }
}
</style>
