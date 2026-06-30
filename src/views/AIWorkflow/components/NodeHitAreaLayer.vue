<template>
	<div class="aiwf-node-hit-area-layer" :style="layerStyle">
		<div
			v-for="node in nodes"
			:key="node.id"
			class="aiwf-node-hit-area"
			:style="hitAreaStyle(node)"
			:data-node-id="node.id"
			@pointerdown="onNodePointerDown(node.id, $event)"
			@pointerenter="onNodePointerEnter(node.id)"
			@pointerleave="onNodePointerLeave"
		/>
	</div>
</template>

<script setup lang="ts">
/**
 * NodeHitAreaLayer - 节点点击区域DOM层
 *
 * 功能:
 * 1. 为Canvas渲染的节点提供透明的点击区域
 * 2. 复用现有的节点交互逻辑 (拖拽、多选等)
 * 3. 比完整节点DOM轻量很多 (每个节点只需1个div)
 *
 * 为什么需要这个层:
 * - Canvas层如果pointer-events:auto，会拦截整个画布的事件
 * - 导致下层的连线层无法接收点击事件
 * - 所以Canvas只负责绘制 (pointer-events:none)
 * - 节点点击由透明DOM hit area处理
 */

import { computed } from 'vue'
import type { ViewportState } from '../node-screenshot'

interface HitAreaNode {
	id: string
	worldX: number
	worldY: number
	width: number
	height: number
}

interface Props {
	/** 节点数据 */
	nodes: HitAreaNode[]
	/** 视口状态 */
	viewport: ViewportState
	/** 画布尺寸 */
	canvasSize: { width: number; height: number }
	/** z-index */
	zIndex?: number
}

const props = withDefaults(defineProps<Props>(), {
	zIndex: 25
})

const emit = defineEmits<{
	/** 节点pointerdown */
	(e: 'node-pointer-down', nodeId: string, event: PointerEvent): void
	/** 节点悬停变化 */
	(e: 'node-hover-change', nodeId: string | null): void
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

// 单个节点点击区域样式
const hitAreaStyle = (node: HitAreaNode): Record<string, string> => {
	const screen = worldToScreen({ x: node.worldX, y: node.worldY })
	const zoom = props.viewport.zoom
	const w = node.width * zoom
	const h = node.height * zoom
	const anchorInset = 24

	return {
		position: 'absolute' as const,
		left: `${screen.x - w / 2 + anchorInset}px`,
		top: `${screen.y - h / 2}px`,
		width: `${w - anchorInset * 2}px`,
		height: `${h}px`,
		pointerEvents: 'auto',
		cursor: 'pointer',
		background: 'transparent',
		borderRadius: '8px'
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

// 事件处理
const onNodePointerDown = (nodeId: string, event: PointerEvent) => {
	emit('node-pointer-down', nodeId, event)
}

let hoveredNodeId: string | null = null

const onNodePointerEnter = (nodeId: string) => {
	if (hoveredNodeId !== nodeId) {
		hoveredNodeId = nodeId
		emit('node-hover-change', nodeId)
	}
}

const onNodePointerLeave = () => {
	if (hoveredNodeId !== null) {
		hoveredNodeId = null
		emit('node-hover-change', null)
	}
}
</script>

<style scoped>
.aiwf-node-hit-area-layer {
	touch-action: none;
	user-select: none;
	-webkit-user-select: none;
}

.aiwf-node-hit-area {
	touch-action: none;
}
</style>
