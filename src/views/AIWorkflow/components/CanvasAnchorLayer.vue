<template>
	<div ref="layerRef" class="aiwf-canvas-anchor-layer">
		<div
			v-for="node in nodes"
			:key="node.id"
			class="wf-node-shell"
			:style="nodeShellStyle(node)"
		>
			<div class="wf-anchors wf-anchors-in" aria-label="入口锚点">
				<div
					v-for="a in getInputAnchors(node)"
					:key="'in-' + a.id"
					class="wf-anchor-hit"
					:class="anchorClass(a.mediaType)"
					:style="anchorStyle(a.offsetY)"
					:title="a.label || '入口'"
					:data-wf-node-id="node.id"
					:data-wf-anchor-id="a.id"
					data-wf-dir="in"
					data-anchor-direction="in"
					data-anchor-side="left"
					:data-wf-anchor-index="a.index"
					@pointerup.stop="onInputAnchorPointerUp(node.id, a.id, a.index)"
				/>
			</div>

			<div class="wf-anchors wf-anchors-out" aria-label="出口锚点">
				<div
					v-for="a in getOutputAnchors(node)"
					:key="'out-' + a.id"
					class="wf-anchor-hit"
					:class="anchorClass(a.mediaType)"
					:style="anchorStyle(a.offsetY)"
					:title="a.label || '出口'"
					:data-wf-node-id="node.id"
					:data-wf-anchor-id="a.id"
					data-wf-dir="out"
					data-anchor-direction="out"
					data-anchor-side="right"
					:data-wf-anchor-index="a.index"
					@pointerdown.stop.prevent="onStartLink(node.id, a.id, a.index, $event)"
				/>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, shallowRef } from 'vue'
import type { WorkflowAnchorSpec } from '../../../aiworkflow/types'
import type { ViewportState } from '../node-screenshot'

interface CanvasAnchorNode {
	id: string
	worldX: number
	worldY: number
	width: number
	height: number
	inputs?: WorkflowAnchorSpec[]
	outputs?: WorkflowAnchorSpec[]
}

interface Props {
	nodes: CanvasAnchorNode[]
	viewport: ViewportState
	selectedNodeIds?: string[]
}

const props = withDefaults(defineProps<Props>(), {
	selectedNodeIds: () => []
})

const emit = defineEmits<{
	(
		e: 'start-link',
		payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }
	): void
	(
		e: 'end-link',
		payload: { nodeId: string; anchorId: string; anchorIndex: number }
	): void
}>()

const layerRef = ref<HTMLDivElement | null>(null)
const canvasSize = shallowRef({ width: 0, height: 0 })
let ro: ResizeObserver | null = null

const updateSize = () => {
	const parent = layerRef.value?.parentElement
	if (!parent) return
	const rect = parent.getBoundingClientRect()
	canvasSize.value = { width: rect.width, height: rect.height }
}

onMounted(() => {
	updateSize()
	const parent = layerRef.value?.parentElement
	if (parent) {
		ro = new ResizeObserver(updateSize)
		ro.observe(parent)
	}
})

onBeforeUnmount(() => {
	if (ro) {
		ro.disconnect()
		ro = null
	}
})

const clampNodeScale = (zoom: number) => Math.max(0.2, Math.min(6, Number(zoom) || 1))

const worldToScreen = (world: { x: number; y: number }): { x: number; y: number } => {
	const vp = props.viewport
	const cw = canvasSize.value.width
	const ch = canvasSize.value.height
	return {
		x: cw / 2 + vp.panX + world.x * vp.zoom,
		y: ch / 2 + vp.panY + world.y * vp.zoom
	}
}

const nodeShellStyle = (node: CanvasAnchorNode): Record<string, string> => {
	const screen = worldToScreen({ x: node.worldX, y: node.worldY })
	const zoom = props.viewport.zoom
	const w = Math.max(80, node.width || 240)
	const h = Math.max(80, node.height || 160)

	return {
		position: 'absolute',
		left: `${screen.x}px`,
		top: `${screen.y}px`,
		width: `${w}px`,
		height: `${h}px`,
		transform: `translate(-50%, -50%) scale(${clampNodeScale(zoom)})`,
		pointerEvents: 'none'
	}
}

const defaultAnchorOffset = (idx: number, count: number): number => {
	const gap = 24
	const start = -((count - 1) * gap) / 2
	return start + idx * gap
}

const normalizeAnchors = (
	anchors: WorkflowAnchorSpec[] | undefined,
	fallbackId: string
) => {
	if (Array.isArray(anchors) && anchors.length > 0) {
		return anchors.map((a, index) => ({
			id: String(a.id ?? `${fallbackId}-${index}`),
			index,
			offsetY: typeof a.offsetY === 'number' ? a.offsetY : defaultAnchorOffset(index, anchors.length),
			mediaType: (a.mediaType ?? 'resource') as string,
			label: String(a.label ?? (fallbackId === 'in' ? '入口' : '出口'))
		}))
	}
	return [{
		id: fallbackId,
		index: 0,
		offsetY: 0,
		mediaType: 'resource' as string,
		label: fallbackId === 'in' ? '入口' : '出口'
	}]
}

const getInputAnchors = (node: CanvasAnchorNode) => normalizeAnchors(node.inputs, 'in')
const getOutputAnchors = (node: CanvasAnchorNode) => normalizeAnchors(node.outputs, 'out')

const anchorStyle = (offsetY: number): Record<string, string> => ({
	top: `calc(50% + ${offsetY}px)`
})

const anchorClass = (mediaType: string | undefined) => {
	if (mediaType === 'image') return 'wf-anchor-image'
	if (mediaType === 'video') return 'wf-anchor-video'
	if (mediaType === 'text') return 'wf-anchor-text'
	if (mediaType === 'model3d') return 'wf-anchor-model3d'
	if (mediaType === 'flow') return 'wf-anchor-flow'
	if (mediaType === 'audio') return 'wf-anchor-audio'
	if (mediaType === 'meta') return 'wf-anchor-meta'
	return 'wf-anchor-resource'
}

const onStartLink = (nodeId: string, anchorId: string, anchorIndex: number, event: PointerEvent) => {
	emit('start-link', { nodeId, anchorId, anchorIndex, event })
}

const onInputAnchorPointerUp = (
	nodeId: string,
	anchorId: string,
	anchorIndex: number
) => {
	emit('end-link', { nodeId, anchorId, anchorIndex })
}
</script>

<style scoped>
.aiwf-canvas-anchor-layer {
	position: absolute;
	left: 0;
	top: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
	touch-action: none;
	user-select: none;
	-webkit-user-select: none;
	z-index: 2;
}

.wf-node-shell {
	transform-origin: center center;
}

.wf-anchors {
	position: absolute;
	top: 0;
	bottom: 0;
	width: 0;
	pointer-events: none;
	z-index: 3;
}

.wf-anchors-in {
	left: 0;
}

.wf-anchors-out {
	right: 0;
}

.wf-anchor-hit {
	--wf-anchor-side-offset: 0px;
	--wf-anchor-base-x: 0px;
	--wf-anchor-hit-size: 44px;
	--wf-anchor-magnet-x: 0px;
	--wf-anchor-magnet-y: 0px;
	width: var(--wf-anchor-hit-size);
	height: var(--wf-anchor-hit-size);
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-radius: 0;
	cursor: crosshair;
	position: absolute;
	background: transparent;
	border: 0;
	padding: 0;
	margin: 0;
	touch-action: none;
	-webkit-user-select: none;
	-webkit-touch-callout: none;
	pointer-events: auto;
	z-index: 4;
	transform: translate(
		calc(var(--wf-anchor-base-x, 0px) + var(--wf-anchor-magnet-x, 0px)),
		calc(-50% + var(--wf-anchor-magnet-y, 0px))
	);
	transition:
		transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
		filter 160ms ease,
		opacity 160ms ease;
}

.wf-anchors-in .wf-anchor-hit {
	left: 0;
	right: auto;
	--wf-anchor-base-x: calc(-50% - var(--wf-anchor-side-offset, 0px));
}

.wf-anchors-out .wf-anchor-hit {
	right: 0;
	left: auto;
	--wf-anchor-base-x: calc(50% + var(--wf-anchor-side-offset, 0px));
}

.wf-anchor-hit::before {
	content: '';
	position: absolute;
	left: 50%;
	top: 50%;
	z-index: 1;
	width: 10px;
	height: 10px;
	border-radius: 3px;
	background: var(--dweb-blue, #3498db);
	box-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
	transform: translate(-50%, -50%);
	transition:
		box-shadow 180ms ease,
		transform 180ms ease,
		background 180ms ease;
}

.wf-anchor-hit::after {
	content: '';
	position: absolute;
	left: 50%;
	top: 50%;
	z-index: 0;
	width: 24px;
	height: 24px;
	border-radius: 2px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.78)) 90%, transparent);
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--wf-primary, #1f9d84) 12%, transparent),
		0 2px 8px rgba(0, 0, 0, 0.18);
	opacity: 0.92;
	transform: translate(-50%, -50%);
	transition:
		border-color 180ms ease,
		box-shadow 180ms ease,
		opacity 180ms ease,
		transform 180ms ease;
}

.wf-anchor-hit:hover::before {
	transform: translate(-50%, -50%) scale(1.08) rotate(3deg);
	box-shadow:
		0 0 0 1px rgba(255, 255, 255, 0.66),
		0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
}

.wf-anchor-hit:hover::after {
	transform: translate(-50%, -50%) scale(1.08) rotate(-2deg);
	border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 54%, transparent);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent);
}

.wf-anchor-image::before {
	background: var(--dweb-purple, #9b59b6) !important;
}

.wf-anchor-image:hover::before {
	box-shadow:
		0 0 0 2px var(--dweb-purple, #9b59b6),
		0 0 14px var(--dweb-purple, #9b59b6) !important;
}

.wf-anchor-video::before {
	background: var(--dweb-green-main, #27ae60) !important;
}

.wf-anchor-video:hover::before {
	box-shadow:
		0 0 0 2px var(--dweb-green-main, #27ae60),
		0 0 14px var(--dweb-green-main, #27ae60) !important;
}

.wf-anchor-text::before {
	background: var(--dweb-yellow, #f1c40f) !important;
}

.wf-anchor-text:hover::before {
	box-shadow:
		0 0 0 2px var(--dweb-yellow, #f1c40f),
		0 0 14px var(--dweb-yellow, #f1c40f) !important;
}

.wf-anchor-model3d::before {
	background: var(--dweb-blue, #3498db) !important;
}

.wf-anchor-model3d:hover::before {
	box-shadow:
		0 0 0 2px var(--dweb-blue, #3498db),
		0 0 14px var(--dweb-blue, #3498db) !important;
}

.wf-anchor-flow::before {
	background: var(--dweb-orange, #e67e22) !important;
}

.wf-anchor-flow:hover::before {
	box-shadow:
		0 0 0 2px var(--dweb-orange, #e67e22),
		0 0 14px var(--dweb-orange, #e67e22) !important;
}

.wf-anchor-audio::before {
	background: var(--dweb-pink, #e91e63) !important;
}

.wf-anchor-audio:hover::before {
	box-shadow:
		0 0 0 2px var(--dweb-pink, #e91e63),
		0 0 14px var(--dweb-pink, #e91e63) !important;
}

.wf-anchor-meta::before {
	background: var(--dweb-gray, #7f8c8d) !important;
}

.wf-anchor-meta:hover::before {
	box-shadow:
		0 0 0 2px var(--dweb-gray, #7f8c8d),
		0 0 14px var(--dweb-gray, #7f8c8d) !important;
}

.wf-anchor-resource::before {
	background: var(--dweb-blue, #3498db) !important;
}

.wf-anchor-resource:hover::before {
	box-shadow:
		0 0 0 2px var(--dweb-blue, #3498db),
		0 0 14px var(--dweb-blue, #3498db) !important;
}
</style>
