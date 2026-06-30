<template>
	<div class="aiwf-canvas-anchor-layer" :style="layerStyle">
		<template v-for="node in nodes" :key="node.id">
			<!-- 输入锚点 -->
			<div
				class="wf-anchors wf-anchors-in"
				:style="anchorsInStyle(node)"
				:data-wf-node-id="node.id"
				data-wf-dir="in"
			>
				<div
					v-for="a in getInputAnchors(node)"
					:key="'in-' + a.id"
					class="wf-anchor-hit"
					:class="anchorClass(a.mediaType)"
					:style="anchorTopStyle(a.offsetY)"
					:title="a.label || '入口'"
					:data-wf-node-id="node.id"
					:data-wf-anchor-id="a.id"
					data-wf-dir="in"
					data-anchor-direction="in"
					data-anchor-side="left"
					:data-wf-anchor-index="a.index"
					@pointerup="onInputAnchorPointerUp(node.id, a.id, a.index, $event)"
				/>
			</div>

			<!-- 输出锚点 -->
			<div
				class="wf-anchors wf-anchors-out"
				:style="anchorsOutStyle(node)"
				:data-wf-node-id="node.id"
				data-wf-dir="out"
			>
				<div
					v-for="a in getOutputAnchors(node)"
					:key="'out-' + a.id"
					class="wf-anchor-hit"
					:class="anchorClass(a.mediaType)"
					:style="anchorTopStyle(a.offsetY)"
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
		</template>
	</div>
</template>

<script setup lang="ts">
/**
 * CanvasAnchorLayer - Canvas模式节点的独立锚点DOM层
 *
 * 功能:
 * 1. 为Canvas渲染的节点提供独立的锚点DOM
 * 2. 保持原有的连线交互逻辑
 * 3. 支持磁吸收集效果
 */

import { computed } from 'vue'
import type { WorkflowNode, WorkflowAnchorSpec } from '../../../aiworkflow/types'
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
	/** 节点数据 */
	nodes: CanvasAnchorNode[]
	/** 视口状态 */
	viewport: ViewportState
	/** 画布尺寸 */
	canvasSize: { width: number; height: number }
	/** z-index */
	zIndex?: number
}

const props = withDefaults(defineProps<Props>(), {
	zIndex: 30
})

const emit = defineEmits<{
	/** 开始连线 */
	(
		e: 'start-link',
		payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }
	): void
	/** 输入锚点释放 */
	(
		e: 'input-anchor-up',
		payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }
	): void
}>()

// 层样式
const layerStyle = computed(() => ({
	position: 'absolute' as const,
	left: '0',
	top: '0',
	width: '100%',
	height: '100%',
	pointerEvents: 'none' as const,
	zIndex: props.zIndex
}))

// 锚点位置计算
const anchorsInStyle = (node: CanvasAnchorNode): Record<string, string> => {
	const screen = worldToScreen({ x: node.worldX, y: node.worldY })
	const zoom = props.viewport.zoom
	const nodeW = node.width * zoom
	const nodeH = node.height * zoom

	return {
		position: 'absolute' as const,
		left: `${screen.x - nodeW / 2}px`,
		top: `${screen.y - nodeH / 2}px`,
		width: '0px',
		height: `${nodeH}px`,
		pointerEvents: 'auto'
	}
}

const anchorsOutStyle = (node: CanvasAnchorNode): Record<string, string> => {
	const screen = worldToScreen({ x: node.worldX, y: node.worldY })
	const zoom = props.viewport.zoom
	const nodeW = node.width * zoom
	const nodeH = node.height * zoom

	return {
		position: 'absolute' as const,
		left: `${screen.x + nodeW / 2}px`,
		top: `${screen.y - nodeH / 2}px`,
		width: '0px',
		height: `${nodeH}px`,
		pointerEvents: 'auto'
	}
}

// 世界坐标转屏幕坐标
const worldToScreen = (world: { x: number; y: number }): { x: number; y: number } => {
	const vp = props.viewport
	const canvasW = props.canvasSize.width
	const canvasH = props.canvasSize.height

	return {
		x: canvasW / 2 + vp.panX + world.x * vp.zoom,
		y: canvasH / 2 + vp.panY + world.y * vp.zoom
	}
}

// 锚点解析
const getInputAnchors = (node: CanvasAnchorNode) => {
	const raw = node.inputs
	const fallbackId = 'in-0'
	const fallbackLabel = '入口'
	const list =
		Array.isArray(raw) && raw.length > 0 ? raw : [{ id: fallbackId } as WorkflowAnchorSpec]
	return list.map((a, index) => ({
		id: String(a.id ?? `in-${index}`),
		index,
		offsetY: typeof a.offsetY === 'number' ? a.offsetY : defaultAnchorOffsets(index, list.length),
		mediaType: (a.mediaType ?? 'resource') as string,
		label: String(a.label ?? fallbackLabel)
	}))
}

const getOutputAnchors = (node: CanvasAnchorNode) => {
	const raw = node.outputs
	const fallbackId = 'out-0'
	const fallbackLabel = '出口'
	const list =
		Array.isArray(raw) && raw.length > 0 ? raw : [{ id: fallbackId } as WorkflowAnchorSpec]
	return list.map((a, index) => ({
		id: String(a.id ?? `out-${index}`),
		index,
		offsetY: typeof a.offsetY === 'number' ? a.offsetY : defaultAnchorOffsets(index, list.length),
		mediaType: (a.mediaType ?? 'resource') as string,
		label: String(a.label ?? fallbackLabel)
	}))
}

const defaultAnchorOffsets = (idx: number, count: number): number => {
	const first = 36
	const spacing = 28
	const centerIdx = (count - 1) / 2
	return Math.round((idx - centerIdx) * spacing + first - (count > 1 ? 0 : 0))
}

const anchorTopStyle = (offsetY: number): Record<string, string> => ({
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

// 事件处理
const onStartLink = (nodeId: string, anchorId: string, anchorIndex: number, event: PointerEvent) => {
	emit('start-link', { nodeId, anchorId, anchorIndex, event })
}

const onInputAnchorPointerUp = (
	nodeId: string,
	anchorId: string,
	anchorIndex: number,
	event: PointerEvent
) => {
	emit('input-anchor-up', { nodeId, anchorId, anchorIndex, event })
}
</script>

<style scoped>
.aiwf-canvas-anchor-layer {
	touch-action: none;
	user-select: none;
	-webkit-user-select: none;
}
</style>
