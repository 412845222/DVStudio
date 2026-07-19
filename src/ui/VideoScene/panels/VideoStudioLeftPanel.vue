<template>
	<aside
		ref="rootEl"
		class="vs-left"
		:class="{ open }"
		:style="{ width: widthPx + 'px' }"
		v-show="open"
		@pointerdown.stop
	>
		<div class="vs-left-header">
			<span class="vs-left-title">{{ title }}</span>
			<button class="vs-left-close" type="button" @click="close">关闭</button>
		</div>
		<SubtitleEditorPanel v-if="mode === 'subtitle'" :layer-id="layerId" />
		<AiSubtitleUnderstandingPanel v-else-if="mode === 'subtitle-ai'" :layer-id="layerId" />
		<ComponentLibraryPanel
			v-else-if="mode === 'component-library'"
			:key="refreshToken"
			:layer-id="layerId"
		/>
		<div
			class="vs-left-splitter"
			:class="{ dragging: isDragging }"
			role="separator"
			aria-orientation="vertical"
			aria-label="调整左侧面板宽度"
			@pointerdown.stop.prevent="onSplitterPointerDown"
		/>
	</aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { VideoSceneKey, type VideoSceneState } from '../../../store/videoscene'
import { TimelineStore } from '../../../store/timeline'
import SubtitleEditorPanel from './SubtitleEditorPanel.vue'
import AiSubtitleUnderstandingPanel from './AiSubtitleUnderstandingPanel.vue'
import ComponentLibraryPanel from './ComponentLibraryPanel.vue'

defineOptions({ name: 'VideoStudioLeftPanel' })

const store = useStore<VideoSceneState>(VideoSceneKey)

const rootEl = ref<HTMLElement | null>(null)
defineExpose({ rootEl })

const open = computed(() => !!store.state.leftPanel?.open)
const mode = computed(() => store.state.leftPanel?.mode ?? null)
const layerId = computed(() => store.state.leftPanel?.layerId ?? null)
const videoPath = computed(() => store.state.leftPanel?.videoPath ?? null)
const refreshToken = computed(() => store.state.leftPanel?.refreshToken ?? 0)

const title = computed(() => {
	if (mode.value === 'subtitle') return '字幕'
	if (mode.value === 'subtitle-ai') return 'AI总结'
	if (mode.value === 'component-library') return '组件库'
	return '面板'
})

const SPLITTER_WIDTH = 6
const MIN_WIDTH = 280
const SUBTITLE_MIN_WIDTH = 500
const AI_PREFERRED_RATIO = 0.35

const widthPx = ref<number>(Math.max(MIN_WIDTH, Math.round(window.innerWidth * 0.4)))
const isDragging = ref(false)
const hasUserResized = ref(false)

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

const applyDefaultWidth = () => {
	const vw = Math.max(1, document.documentElement.clientWidth || window.innerWidth || 1)
	const isSubtitle = mode.value === 'subtitle'
	const isSubtitleAi = mode.value === 'subtitle-ai'
	// 字幕：默认 25% 宽；若屏幕较窄导致 25% 过小，则尽量保证至少 500px（受限于视口宽度）
	// 其他：默认占 40% 宽
	const preferred = Math.round(vw * (isSubtitleAi ? AI_PREFERRED_RATIO : isSubtitle ? 0.25 : 0.4))
	const minW = Math.min(vw, isSubtitle || isSubtitleAi ? SUBTITLE_MIN_WIDTH : MIN_WIDTH)
	// 允许拖拽扩展到更大；字幕模式允许更宽以确保编辑区可用
	const maxW = Math.max(minW, Math.floor(vw * (isSubtitle || isSubtitleAi ? 0.95 : 0.8)))
	widthPx.value = clamp(preferred, minW, maxW)
}

const ensureAiMinWidth = () => {
	if (mode.value !== 'subtitle-ai') return
	const vw = Math.max(1, document.documentElement.clientWidth || window.innerWidth || 1)
	const preferred = Math.round(vw * AI_PREFERRED_RATIO)
	const minW = Math.min(vw, SUBTITLE_MIN_WIDTH)
	const maxW = Math.max(minW, Math.floor(vw * 0.95))
	const target = clamp(preferred, minW, maxW)
	// 只增不减：进入 AI 界面时保证至少 35% 宽，不会压缩用户手动加宽
	if (widthPx.value < target) widthPx.value = target
}

let cleanupMoveUp: (() => void) | null = null
const onSplitterPointerDown = (e: PointerEvent) => {
	if (e.button !== 0) return
	const vw = Math.max(1, document.documentElement.clientWidth || window.innerWidth || 1)
	const startX = e.clientX
	const startW = widthPx.value
	const maxW = Math.max(MIN_WIDTH, Math.floor(vw * 0.8))

	isDragging.value = true
	hasUserResized.value = true

	const onMove = (ev: PointerEvent) => {
		const dx = ev.clientX - startX
		widthPx.value = clamp(startW + dx, MIN_WIDTH, maxW)
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

const onWindowResize = () => {
	if (hasUserResized.value) return
	applyDefaultWidth()
}

onMounted(() => {
	applyDefaultWidth()
	window.addEventListener('resize', onWindowResize, { passive: true })
})

onBeforeUnmount(() => {
	window.removeEventListener('resize', onWindowResize)
	if (cleanupMoveUp) cleanupMoveUp()
})

watch(
	() => [open.value, mode.value] as const,
	([isOpen]) => {
		if (!isOpen) return
		if (!hasUserResized.value) applyDefaultWidth()
		ensureAiMinWidth()
	}
)

const close = () => {
	void store.dispatch('closeLeftPanel')
}
</script>

<style scoped>
.vs-left {
	position: absolute;
	top: 0;
	left: 0;
	bottom: 0;
	width: 40vw;
	border-right: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
	background: linear-gradient(180deg, color-mix(in srgb, var(--pl-bg-1) 95%, rgba(0,0,0,0.2)) 0%, color-mix(in srgb, var(--pl-bg-0) 90%, rgba(0,0,0,0.3)) 100%);
	backdrop-filter: blur(12px);
	z-index: 3;
	display: flex;
	flex-direction: column;
	min-width: 0;
	padding-right: 6px;
	box-shadow: 4px 0 20px rgba(0,0,0,0.4), inset -1px 0 0 color-mix(in srgb, var(--pl-accent) 12%, transparent);
}

.vs-left-splitter {
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	width: 6px;
	cursor: col-resize;
	background: color-mix(in srgb, var(--pl-accent) 6%, var(--pl-bg-1));
	border-left: 1px solid color-mix(in srgb, var(--pl-accent) 22%, transparent);
	user-select: none;
	transition: background 0.2s ease, box-shadow 0.2s ease;
}

.vs-left-splitter::after {
	content: '';
	position: absolute;
	left: 50%;
	top: 50%;
	width: 2px;
	height: 28px;
	transform: translate(-50%, -50%);
	background: var(--pl-accent);
	opacity: 0.6;
	border-radius: 1px;
	box-shadow: 0 0 6px color-mix(in srgb, var(--pl-accent) 60%, transparent);
}

.vs-left-splitter:hover::after,
.vs-left-splitter.dragging::after {
	opacity: 1;
	box-shadow: 0 0 10px color-mix(in srgb, var(--pl-accent) 80%, transparent);
}

.vs-left-splitter:hover,
.vs-left-splitter.dragging {
	background: color-mix(in srgb, var(--pl-accent) 12%, var(--pl-bg-1));
	box-shadow: inset 0 0 12px color-mix(in srgb, var(--pl-accent) 20%, transparent);
}

.vs-left-header {
	flex: 0 0 auto;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
	background: color-mix(in srgb, var(--pl-accent) 4%, transparent);
	position: relative;
}

.vs-left-header::after {
	content: '';
	position: absolute;
	left: 0;
	right: 0;
	bottom: -1px;
	height: 1px;
	background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--pl-accent) 60%, transparent), transparent);
}

.vs-left-title {
	font-size: 12px;
	color: var(--pl-fg);
	letter-spacing: 0.5px;
	text-shadow: 0 0 8px color-mix(in srgb, var(--pl-accent) 40%, transparent);
	font-weight: 500;
}

.vs-left-close {
	margin-left: auto;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 30%, transparent);
	background: color-mix(in srgb, var(--pl-bg-1) 60%, rgba(0,0,0,0.3));
	color: var(--pl-fg);
	font-size: 12px;
	height: 24px;
	padding: 0 12px;
	cursor: pointer;
	border-radius: 2px;
	letter-spacing: 0.3px;
	transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.vs-left-close:hover {
	border-color: color-mix(in srgb, var(--pl-accent) 70%, transparent);
	background: color-mix(in srgb, var(--pl-accent) 10%, var(--pl-bg-1));
	box-shadow: 0 0 8px color-mix(in srgb, var(--pl-accent) 25%, transparent);
}
</style>
