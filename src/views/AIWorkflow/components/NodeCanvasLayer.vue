<template>
	<canvas
		ref="canvasEl"
		class="aiwf-node-canvas-layer"
		:style="canvasStyle"
		@pointermove="onPointerMove"
		@pointerdown="onPointerDown"
		@click="onClick"
		@pointerenter="onPointerEnter"
		@pointerleave="onPointerLeave"
	/>
</template>

<script setup lang="ts">
/**
 * NodeCanvasLayer - Canvas2D节点渲染层
 * 
 * 功能:
 * 1. 管理Canvas2D渲染循环
 * 2. 处理节点碰撞检测
 * 3. 与DOM截图系统协同
 * 4. 事件分发
 */

import { ref, computed, onMounted, onBeforeUnmount, watch, shallowRef } from 'vue'
import type { CanvasScreenshotPool } from '../node-screenshot'
import { CanvasNodeRenderer, CanvasHitTestManager } from '../node-screenshot'
import type { VisibleNodeEntry, ViewportState } from '../node-screenshot'

interface Props {
	/** 节点数据 */
	nodes: VisibleNodeEntry[]
	/** 视口状态 */
	viewport: ViewportState
	/** Canvas截图池 */
	screenshotPool: CanvasScreenshotPool
	/** 是否启用碰撞检测，默认true */
	enableHitTest?: boolean
	/** 是否启用鼠标交互，默认true */
	enableMouseInteraction?: boolean
	/** z-index */
	zIndex?: number
	/** 是否可见，默认true */
	visible?: boolean
}

const props = withDefaults(defineProps<Props>(), {
	enableHitTest: true,
	enableMouseInteraction: true,
	zIndex: 20,
	visible: true
})

const emit = defineEmits<{
	/** 悬停变化 */
	(e: 'hover', nodeId: string | null): void
	/** 点击节点 */
	(e: 'click', nodeId: string, event: MouseEvent): void
	/** 指针按下 */
	(e: 'pointer-down', nodeId: string | null, event: PointerEvent): void
	/** 指针释放 */
	(e: 'pointer-up', nodeId: string | null, event: PointerEvent): void
	/** 可见节点变化 */
	(e: 'visible-nodes-change', nodeIds: string[]): void
}>()

// Canvas元素
const canvasEl = ref<HTMLCanvasElement | null>(null)

// 渲染器
let renderer: CanvasNodeRenderer | null = null

// 碰撞检测管理器
let hitTestManager: CanvasHitTestManager | null = null

// ResizeObserver
let resizeObserver: ResizeObserver | null = null

// 渲染循环
let rafId: number | null = null

// 指针状态
const isPointerDown = ref(false)
const isPointerOver = ref(false)

// Canvas样式
const canvasStyle = computed(() => ({
	position: 'absolute' as const,
	left: '0',
	top: '0',
	width: '100%',
	height: '100%',
	pointerEvents: props.enableMouseInteraction ? 'auto' as const : 'none' as const,
	zIndex: props.zIndex,
	opacity: props.visible ? 1 : 0
}))

// 初始化
onMounted(() => {
	if (!canvasEl.value) return

	// 初始化渲染器
	renderer = new CanvasNodeRenderer(canvasEl.value, props.screenshotPool, {
		drawSelectionBorder: true,
		drawHoverBorder: true,
		selectionBorderColor: '#3b82f6',
		hoverBorderColor: '#94a3b8',
		borderWidth: 2
	})

	// 初始化碰撞检测
	hitTestManager = new CanvasHitTestManager({
		throttleMs: 16,
		preciseRoundedRect: false
	})

	hitTestManager.setCallbacks({
		onHoverChange: (nodeId) => {
			emit('hover', nodeId)
		},
		onNodeClick: (nodeId) => {
			// 由onClick处理
		}
	})

	// 设置初始视口
	renderer.setViewport(props.viewport)

	// 监听画布尺寸变化
	resizeObserver = new ResizeObserver((entries) => {
		for (const entry of entries) {
			const { width, height } = entry.contentRect
			renderer?.resize(width, height)
		}
	})

	if (canvasEl.value?.parentElement) {
		resizeObserver.observe(canvasEl.value.parentElement)
	}

	// 初始尺寸
	if (canvasEl.value?.parentElement) {
		const { width, height } = canvasEl.value.parentElement.getBoundingClientRect()
		renderer.resize(width, height)
	}

	// 开始渲染循环
	startRenderLoop()
})

onBeforeUnmount(() => {
	stopRenderLoop()
	resizeObserver?.disconnect()
	renderer = null
	hitTestManager = null
})

// 监听视口变化
watch(
	() => props.viewport,
	(viewport) => {
		renderer?.setViewport(viewport)
	},
	{ deep: true }
)

// 监听节点变化
watch(
	() => props.nodes,
	(nodes) => {
		// 更新渲染器
		renderer?.markDirty()

		// 更新碰撞检测边界
		if (hitTestManager) {
			hitTestManager.clear()
			hitTestManager.updateBoundsBatch(
				nodes.map((n) => ({
					nodeId: n.id,
					worldX: n.worldX,
					worldY: n.worldY,
					width: n.width,
					height: n.height,
					radius: n.radius
				}))
			)
		}

		// 计算可见节点
		if (renderer) {
			const visibleNodeIds = renderer.getVisibleNodeIds(nodes)
			emit('visible-nodes-change', visibleNodeIds)
		}
	},
	{ deep: true }
)

// 监听选中节点
watch(
	() => props.nodes.filter((n) => {
		// 从父组件传入的选中节点
		return false
	}),
	() => {
		renderer?.markDirty()
	}
)

// 设置选中节点
const setSelectedNodes = (nodeIds: string[]) => {
	renderer?.setSelectedNodes(nodeIds)
}

// 设置悬停节点
const setHoveredNode = (nodeId: string | null) => {
	renderer?.setHoveredNode(nodeId)
	hitTestManager?.handleMouseMove(0, 0) // 触发回调
}

// 渲染循环
const startRenderLoop = () => {
	const render = () => {
		if (!renderer) return

		// 只渲染有截图缓存的节点
		const nodesWithScreenshots = props.nodes.filter((n) =>
			props.screenshotPool.hasBitmap(n.id)
		)

		renderer.render(nodesWithScreenshots)

		rafId = requestAnimationFrame(render)
	}

	rafId = requestAnimationFrame(render)
}

const stopRenderLoop = () => {
	if (rafId !== null) {
		cancelAnimationFrame(rafId)
		rafId = null
	}
}

// 坐标转换
const screenToWorld = (screen: { x: number; y: number }): { x: number; y: number } => {
	const canvas = canvasEl.value
	if (!canvas) return { x: 0, y: 0 }

	const rect = canvas.getBoundingClientRect()
	const x = screen.x - rect.left
	const y = screen.y - rect.top

	const viewport = props.viewport
	const dpr = Math.min(window.devicePixelRatio || 1, 2)
	const canvasW = rect.width
	const canvasH = rect.height

	return {
		x: (x - canvasW / 2 - viewport.panX) / viewport.zoom,
		y: (y - canvasH / 2 - viewport.panY) / viewport.zoom
	}
}

// 事件处理
const onPointerMove = (event: PointerEvent) => {
	if (!props.enableMouseInteraction || !hitTestManager) return

	const worldPoint = screenToWorld({ x: event.clientX, y: event.clientY })
	hitTestManager.handleMouseMove(worldPoint.x, worldPoint.y)
}

const onPointerDown = (event: PointerEvent) => {
	if (!props.enableMouseInteraction || !hitTestManager) return

	isPointerDown.value = true

	const worldPoint = screenToWorld({ x: event.clientX, y: event.clientY })
	const hitNodeId = hitTestManager.handlePointerDown(worldPoint.x, worldPoint.y)

	emit('pointer-down', hitNodeId, event)
}

const onClick = (event: MouseEvent) => {
	if (!props.enableMouseInteraction || !hitTestManager) return

	const worldPoint = screenToWorld({ x: event.clientX, y: event.clientY })
	const hitNodeId = hitTestManager.hitTest(worldPoint.x, worldPoint.y)

	if (hitNodeId) {
		emit('click', hitNodeId, event)
	}
}

const onPointerUp = (event: PointerEvent) => {
	if (!props.enableMouseInteraction || !hitTestManager) return

	isPointerDown.value = false

	const worldPoint = screenToWorld({ x: event.clientX, y: event.clientY })
	const hitNodeId = hitTestManager.hitTest(worldPoint.x, worldPoint.y)

	emit('pointer-up', hitNodeId, event)
}

const onPointerEnter = () => {
	isPointerOver.value = true
}

const onPointerLeave = () => {
	isPointerOver.value = false

	// 离开时清除悬停状态
	if (hitTestManager && isPointerOver.value === false) {
		const lastHovered = hitTestManager['lastHoveredNodeId']
		if (lastHovered) {
			hitTestManager['lastHoveredNodeId'] = null
			emit('hover', null)
		}
	}
}

// 获取可见节点
const getVisibleNodeIds = (): string[] => {
	if (!renderer) return []
	return renderer.getVisibleNodeIds(props.nodes)
}

// 获取视口世界矩形
const getViewportWorldRect = () => {
	return renderer?.getViewportWorldRect() ?? { x0: 0, y0: 0, x1: 0, y1: 0 }
}

// 手动触发重绘
const invalidate = () => {
	renderer?.markDirty()
}

// 获取碰撞检测统计
const getHitTestStats = () => {
	return hitTestManager?.getStats() ?? { boundCount: 0, throttleMs: 16, preciseRoundedRect: false }
}

// 公开方法
defineExpose({
	setSelectedNodes,
	setHoveredNode,
	getVisibleNodeIds,
	getViewportWorldRect,
	invalidate,
	getHitTestStats
})
</script>

<style scoped>
.aiwf-node-canvas-layer {
	touch-action: none;
	user-select: none;
	-webkit-user-select: none;
}
</style>
