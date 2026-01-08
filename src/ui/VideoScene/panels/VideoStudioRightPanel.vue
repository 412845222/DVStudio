<template>
  <aside
    ref="rootEl"
    class="vs-right"
    :style="{ bottom: `${bottomToolbarHeight}px`, width: `${panelWidth}px` }"
    @pointerdown.stop
  >
    <div
      class="vs-vsplitter"
      :class="{ dragging: isDraggingWidth }"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整右侧面板宽度"
      @pointerdown.stop.prevent="onVSplitterPointerDown"
    />
    <div class="vs-right-top" :style="{ height: `${topHeightPx}px` }">
      <VideoSceneNodeTree />
    </div>
    <div
      class="vs-splitter"
      :class="{ dragging: isDragging }"
      role="separator"
      aria-orientation="horizontal"
      aria-label="调整节点树与属性面板高度"
      @pointerdown.stop.prevent="onSplitterPointerDown"
    />
    <div class="vs-right-bottom" :style="{ height: `${bottomHeight}px` }">
      <VideoNodeDetailForm />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useStore } from 'vuex'
import { VideoSceneKey, type VideoSceneState } from '../../../store/videoscene'
import VideoSceneNodeTree from '../parts/nodeTree/VideoSceneNodeTree.vue'
import VideoNodeDetailForm from '../parts/nodeDetail/VideoNodeDetailForm.vue'

defineOptions({ name: 'VideoStudioRightPanel' })

const store = useStore<VideoSceneState>(VideoSceneKey)
const bottomToolbarHeight = computed(() => store.state.layoutInsets.bottomToolbarHeight)

const rootEl = ref<HTMLElement | null>(null)
defineExpose({ rootEl })

const SPLITTER_HEIGHT = 6
const SPLITTER_WIDTH = 6
const MIN_TOP = 120
const MIN_BOTTOM = 160

const MIN_WIDTH = 220
const MIN_STAGE_SPACE = 240

const panelWidth = ref(240)
const isDraggingWidth = ref(false)
const hasUserResizedWidth = ref(false)

const bottomHeight = ref(240)
const isDragging = ref(false)
const hasUserResized = ref(false)

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

const topHeightPx = computed(() => {
	const el = rootEl.value
	if (!el) return 0
	const total = el.clientHeight
	return Math.max(0, total - bottomHeight.value - SPLITTER_HEIGHT)
})

let cleanupMoveUp: (() => void) | null = null
const onSplitterPointerDown = (e: PointerEvent) => {
	const el = rootEl.value
	if (!el) return

	isDragging.value = true
	hasUserResized.value = true
	const startY = e.clientY
	const startBottom = bottomHeight.value

	const onMove = (ev: PointerEvent) => {
		const total = el.clientHeight
		const delta = ev.clientY - startY
		const next = startBottom - delta
		const maxBottom = Math.max(MIN_BOTTOM, total - MIN_TOP - SPLITTER_HEIGHT)
		bottomHeight.value = clamp(next, MIN_BOTTOM, maxBottom)
	}

	const onUp = () => {
		isDragging.value = false
		if (cleanupMoveUp) {
			cleanupMoveUp()
			cleanupMoveUp = null
		}
	}

	window.addEventListener('pointermove', onMove, { passive: true })
	window.addEventListener('pointerup', onUp, { passive: true, once: true })
	cleanupMoveUp = () => {
		window.removeEventListener('pointermove', onMove)
		window.removeEventListener('pointerup', onUp)
	}
}

let cleanupMoveUpW: (() => void) | null = null
const onVSplitterPointerDown = (e: PointerEvent) => {
	const el = rootEl.value
	if (!el) return

	isDraggingWidth.value = true
	hasUserResizedWidth.value = true
	const startX = e.clientX
	const startW = panelWidth.value

	const getMaxWidth = () => {
		const parentW = el.parentElement?.clientWidth ?? window.innerWidth
		return Math.max(MIN_WIDTH, parentW - MIN_STAGE_SPACE)
	}

	const onMove = (ev: PointerEvent) => {
		// moving left increases width, moving right decreases width
		const delta = ev.clientX - startX
		const next = startW - delta
		panelWidth.value = clamp(next, MIN_WIDTH, getMaxWidth())
	}

	const onUp = () => {
		isDraggingWidth.value = false
		if (cleanupMoveUpW) {
			cleanupMoveUpW()
			cleanupMoveUpW = null
		}
	}

	window.addEventListener('pointermove', onMove, { passive: true })
	window.addEventListener('pointerup', onUp, { passive: true, once: true })
	cleanupMoveUpW = () => {
		window.removeEventListener('pointermove', onMove)
		window.removeEventListener('pointerup', onUp)
	}
}

let ro: ResizeObserver | null = null
const applyDefaultHalf = () => {
	const el = rootEl.value
	if (!el) return
	const total = el.clientHeight
	const half = (total - SPLITTER_HEIGHT) / 2
	const maxBottom = Math.max(MIN_BOTTOM, total - MIN_TOP - SPLITTER_HEIGHT)
	bottomHeight.value = clamp(half, MIN_BOTTOM, maxBottom)
}

const clampWidthToViewport = () => {
	const el = rootEl.value
	if (!el) return
	const parentW = el.parentElement?.clientWidth ?? window.innerWidth
	const maxW = Math.max(MIN_WIDTH, parentW - MIN_STAGE_SPACE)
	panelWidth.value = clamp(panelWidth.value, MIN_WIDTH, maxW)
}

onMounted(() => {
	applyDefaultHalf()
	ro = new ResizeObserver(() => {
		if (hasUserResized.value) return
		applyDefaultHalf()
	})
	if (rootEl.value) ro.observe(rootEl.value)
	window.addEventListener('resize', clampWidthToViewport, { passive: true })
})

onBeforeUnmount(() => {
	if (cleanupMoveUp) cleanupMoveUp()
	if (cleanupMoveUpW) cleanupMoveUpW()
	window.removeEventListener('resize', clampWidthToViewport as any)
	ro?.disconnect()
	ro = null
})
</script>

<style scoped>
.vs-right {
  position: absolute;
  top: 0;
  right: 0;
  width: 240px;
  border-left: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  z-index: 3;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.vs-vsplitter {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  background: var(--dweb-defualt);
  border-right: 1px solid var(--vscode-border);
  user-select: none;
  z-index: 2;
}

.vs-vsplitter::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 2px;
  height: 28px;
  transform: translate(-50%, -50%);
  background: var(--vscode-fg-muted);
  opacity: 0.6;
  border-radius: 2px;
}

.vs-vsplitter:hover::after,
.vs-vsplitter.dragging::after {
  opacity: 1;
}

.vs-right-top {
  flex: 0 0 auto;
  min-height: 0;
  overflow: hidden;
}

.vs-splitter {
  flex: 0 0 auto;
  height: 6px;
  cursor: row-resize;
  background: var(--dweb-defualt);
  border-top: 1px solid var(--vscode-border);
  border-bottom: 1px solid var(--vscode-border);
  position: relative;
  user-select: none;
}

.vs-splitter::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 28px;
  height: 2px;
  transform: translate(-50%, -50%);
  background: var(--vscode-fg-muted);
  opacity: 0.6;
  border-radius: 2px;
}

.vs-splitter:hover::after,
.vs-splitter.dragging::after {
  opacity: 1;
}

.vs-right-bottom {
  flex: 0 0 auto;
  border-top: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  min-height: 0;
  overflow: auto;
}
</style>
