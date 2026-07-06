<template>
	<canvas
		ref="canvasRef"
		class="node-canvas-layer"
	/>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { CanvasNodeRenderer } from '../node-screenshot/canvasNodeRenderer'
import type { VisibleNodeEntry, ScreenshotPoolProvider, ViewportState } from '../node-screenshot'

interface Props {
	viewport: ViewportState
	nodes: VisibleNodeEntry[]
	screenshotPoolProvider: ScreenshotPoolProvider
	motionActive?: boolean
	theme?: 'dark' | 'light'
}

const props = withDefaults(defineProps<Props>(), {
	motionActive: false,
	theme: 'dark'
})

const emit = defineEmits<{
	(e: 'node-click', nodeId: string, event: PointerEvent): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let renderer: CanvasNodeRenderer | null = null
let resizeObserver: ResizeObserver | null = null
let rafId: number | null = null
let parentEl: HTMLElement | null = null
let dirty = false

const scheduleRender = () => {
	if (rafId !== null) return
	dirty = true
	rafId = requestAnimationFrame(() => {
		rafId = null
		if (!dirty || !renderer) return
		dirty = false
		renderer.setViewport(props.viewport)
		renderer.setNodes(props.nodes)
		renderer.render(props.viewport)
	})
}

const markDirty = () => {
	dirty = true
	scheduleRender()
}

const setTheme = (theme: 'dark' | 'light') => {
	if (renderer) {
		renderer.setTheme(theme)
		markDirty()
	}
}

const handleResize = () => {
	if (renderer) {
		renderer.resize()
	}
}

const isInteractiveUiTarget = (target: EventTarget | null): boolean => {
	let el: HTMLElement | null = null
	if (target instanceof HTMLElement) {
		el = target
	} else if (target instanceof SVGElement) {
		el = target.closest('.wf-node') || target.parentElement?.closest('.wf-node') || null
		if (!el) {
			const parent = target.parentElement
			if (parent instanceof HTMLElement) el = parent
			else return true
		}
	} else if (target instanceof Node) {
		const parent = target.parentElement
		if (parent instanceof HTMLElement) el = parent
		else return true
	} else {
		return true
	}
	if (!el) return true
	if (el.closest('.wf-node')) return true
	if (el.closest('.wf-node-shell')) return true
	if (el.closest('.wf-anchor-hit')) return true
	if (el.closest('.wf-corner-decoration')) return true
	if (el.closest('.wf-resource-panel')) return true
	if (el.closest('.wf-inspector')) return true
	if (el.closest('.ctx-menu')) return true
	if (el.closest('.aiwf-toolbar')) return true
	if (el.closest('.aiwf-inspector-toggle')) return true
	if (el.closest('.wf-sel-frame-tag-bar')) return true
	if (el.closest('[data-bp-ui-overlay="true"]')) return true
	if (el.closest('.bp-boxsel')) return true
	if (el.closest('.wf-three-shell')) return true
	return false
}

const onParentPointerDownCapture = (event: PointerEvent) => {
	if (event.button !== 0) return
	if (isInteractiveUiTarget(event.target)) return
	if (!renderer) return

	const hit = renderer.hitTest(event.clientX, event.clientY)
	if (hit.nodeId) {
		event.preventDefault()
		event.stopPropagation()
		emit('node-click', hit.nodeId, event)
	}
}

watch(
	() => [props.viewport.zoom, props.viewport.panX, props.viewport.panY],
	() => { markDirty() }
)
watch(() => props.nodes, () => { markDirty() }, { deep: false })
watch(
	() => props.motionActive,
	(active) => {
		if (renderer) {
			renderer.setLowQualityMode(active === true)
		}
	}
)
watch(
	() => props.theme,
	(newTheme) => {
		if (newTheme === 'dark' || newTheme === 'light') {
			setTheme(newTheme)
		}
	}
)

onMounted(() => {
	if (!canvasRef.value) return

	renderer = new CanvasNodeRenderer(
		canvasRef.value,
		props.screenshotPoolProvider
	)

	const initialTheme = props.theme
	renderer.setTheme(initialTheme)

	resizeObserver = new ResizeObserver(handleResize)
	resizeObserver.observe(canvasRef.value)

	if (props.motionActive) {
		renderer.setLowQualityMode(true)
	} else {
		renderer.resize()
	}

	markDirty()

	parentEl = canvasRef.value.parentElement as HTMLElement | null
	parentEl?.addEventListener('pointerdown', onParentPointerDownCapture, true)
})

onBeforeUnmount(() => {
	if (rafId !== null) {
		cancelAnimationFrame(rafId)
		rafId = null
	}
	if (resizeObserver && canvasRef.value) {
		resizeObserver.unobserve(canvasRef.value)
	}
	if (parentEl) {
		parentEl.removeEventListener('pointerdown', onParentPointerDownCapture, true)
		parentEl = null
	}
	resizeObserver = null
	if (renderer) {
		renderer.dispose()
		renderer = null
	}
})

defineExpose({
	markDirty,
	setTheme
})
</script>

<style scoped>
.node-canvas-layer {
	position: absolute;
	left: 0;
	top: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
	z-index: 1;
}
</style>
