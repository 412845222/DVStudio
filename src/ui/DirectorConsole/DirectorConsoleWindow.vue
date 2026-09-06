<template>
	<div class="dc-window">
		<DirectorTitleBar :title="title" />
		<div class="dc-window-body">
			<aside class="dc-sidebar">
				<div class="dc-sidebar-section">
					<div class="dc-section-header">
						<span class="dc-section-title">{{ t('nodes.directorConsole.cameraTrackTitle') }}</span>
					</div>
					<div class="dc-sidebar-empty">
						{{ t('nodes.directorConsole.cameraTrackEmpty') }}
					</div>
				</div>
				<div class="dc-sidebar-divider" />
				<div class="dc-sidebar-section">
					<div class="dc-section-header">
						<span class="dc-section-title">{{ t('nodes.directorConsole.lightRigTitle') }}</span>
					</div>
					<div class="dc-sidebar-empty">
						{{ t('nodes.directorConsole.lightRigEmpty') }}
					</div>
				</div>
			</aside>
			<div class="dc-viewport">
				<div class="dc-viewport-corner dc-viewport-corner-tl" />
				<div class="dc-viewport-corner dc-viewport-corner-tr" />
				<div class="dc-viewport-corner dc-viewport-corner-bl" />
				<div class="dc-viewport-corner dc-viewport-corner-br" />
				<canvas ref="canvasRef" class="dc-viewport-canvas"></canvas>
				<div v-if="loading" class="dc-viewport-loading">
					<div class="dc-loading-text">{{ loadingText }}</div>
				</div>
				<div v-else-if="error" class="dc-viewport-error">
					<div class="dc-error-text">{{ error }}</div>
				</div>
				<div v-else-if="!hasData" class="dc-viewport-empty">
					<div class="dc-empty-text">{{ t('nodes.directorConsole.viewportEmpty') }}</div>
				</div>
			</div>
		</div>
		<footer class="dc-timeline-bar">
			<div class="dc-timeline-corner dc-timeline-corner-tl" />
			<div class="dc-timeline-corner dc-timeline-corner-br" />
			<div class="dc-timeline-placeholder">
				{{ t('nodes.directorConsole.timelinePlaceholder') }}
			</div>
		</footer>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from '../../i18n'
import DirectorTitleBar from './DirectorTitleBar.vue'
import { DirectorSceneViewer } from './viewers/DirectorSceneViewer'
import type { DirectorConsoleScenePayload } from '../../electronBridge'

defineProps<{
	title: string
}>()

const emit = defineEmits<{
	(e: 'data-loaded', payload: DirectorConsoleScenePayload): void
}>()

const { t } = useI18n()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const loading = ref(true)
const loadingText = ref('')
const error = ref('')
const hasData = ref(false)
let sceneViewer: DirectorSceneViewer | null = null
let currentPayload: DirectorConsoleScenePayload | null = null

onMounted(() => {
	if (canvasRef.value) {
		sceneViewer = new DirectorSceneViewer(canvasRef.value, {
			onError: (msg) => {
				set_error(msg)
			},
			onReady: () => {
				loading.value = false
			}
		})
	}
})

function applyScenePayload(payload: DirectorConsoleScenePayload) {
	currentPayload = payload
	const layoutCount = Array.isArray(payload?.layoutItems) ? payload.layoutItems.length : 0
	if (layoutCount === 0) {
		loading.value = false
		hasData.value = false
		return
	}
	loading.value = true
	loadingText.value = t('nodes.directorConsole.viewportLoading')
	hasData.value = true
	sceneViewer
		?.loadScene(payload)
		.then(() => {
			loading.value = false
		})
		.catch((err) => {
			set_error(t('nodes.directorConsole.viewportLoadFailed') + ': ' + String(err))
		})
	emit('data-loaded', payload)
}

function set_loading(msg: string) {
	loading.value = true
	loadingText.value = msg
}

function set_error(msg: string) {
	loading.value = false
	error.value = msg
}

onBeforeUnmount(() => {
	sceneViewer?.dispose()
	sceneViewer = null
	currentPayload = null
})

defineExpose({
	canvasRef,
	applyScenePayload,
	set_loading,
	set_error
})
</script>

<style scoped>
.dc-window {
	display: flex;
	flex-direction: column;
	width: 100vw;
	height: 100vh;
	overflow: hidden;
	background: var(--dc-bg, #0a0f18);
	color: var(--dc-text, #c8d4e0);
	font-family: var(--dc-font, 'Segoe UI', sans-serif);
}
.dc-window-body {
	flex: 1;
	display: flex;
	overflow: hidden;
}
.dc-sidebar {
	width: 300px;
	flex-shrink: 0;
	display: flex;
	flex-direction: column;
	border-right: 1px solid var(--dc-border, #1f3a2e);
	background: var(--dc-sidebar-bg, #0d1420);
	overflow-y: auto;
}
.dc-sidebar-section {
	padding: 12px;
}
.dc-sidebar-divider {
	height: 1px;
	background: var(--dc-border, #1f3a2e);
	margin: 0 12px;
}
.dc-section-header {
	margin-bottom: 8px;
}
.dc-section-title {
	font-size: 12px;
	color: var(--dc-accent, #00ff88);
	letter-spacing: 1px;
	text-transform: uppercase;
}
.dc-sidebar-empty {
	font-size: 12px;
	color: var(--dc-text-dim, #5a6878);
	padding: 8px;
	border: 1px dashed var(--dc-border, #1f3a2e);
	text-align: center;
}
.dc-viewport {
	flex: 1;
	position: relative;
	overflow: hidden;
	background: #484848;
}
.dc-viewport-corner {
	position: absolute;
	width: 12px;
	height: 12px;
	border-color: var(--dc-accent, #00ff88);
	pointer-events: none;
	z-index: 2;
}
.dc-viewport-corner-tl {
	top: 4px;
	left: 4px;
	border-top: 2px solid var(--dc-accent, #00ff88);
	border-left: 2px solid var(--dc-accent, #00ff88);
}
.dc-viewport-corner-tr {
	top: 4px;
	right: 4px;
	border-top: 2px solid var(--dc-accent, #00ff88);
	border-right: 2px solid var(--dc-accent, #00ff88);
}
.dc-viewport-corner-bl {
	bottom: 4px;
	left: 4px;
	border-bottom: 2px solid var(--dc-accent, #00ff88);
	border-left: 2px solid var(--dc-accent, #00ff88);
}
.dc-viewport-corner-br {
	bottom: 4px;
	right: 4px;
	border-bottom: 2px solid var(--dc-accent, #00ff88);
	border-right: 2px solid var(--dc-accent, #00ff88);
}
.dc-viewport-canvas {
	width: 100%;
	height: 100%;
	display: block;
}
.dc-viewport-loading,
.dc-viewport-error,
.dc-viewport-empty {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 3;
}
.dc-loading-text,
.dc-error-text,
.dc-empty-text {
	font-size: 14px;
	color: var(--dc-text, #c8d4e0);
	letter-spacing: 0.5px;
}
.dc-error-text {
	color: #ff6b6b;
}
.dc-timeline-bar {
	height: 40px;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	padding: 0 12px;
	background: var(--dc-sidebar-bg, #0d1420);
	border-top: 1px solid var(--dc-border, #1f3a2e);
	position: relative;
}
.dc-timeline-corner {
	position: absolute;
	width: 8px;
	height: 8px;
	border-color: var(--dc-accent, #00ff88);
	pointer-events: none;
}
.dc-timeline-corner-tl {
	top: 0;
	left: 0;
	border-top: 1px solid var(--dc-accent, #00ff88);
	border-left: 1px solid var(--dc-accent, #00ff88);
}
.dc-timeline-corner-br {
	bottom: 0;
	right: 0;
	border-bottom: 1px solid var(--dc-accent, #00ff88);
	border-right: 1px solid var(--dc-accent, #00ff88);
}
.dc-timeline-placeholder {
	font-size: 11px;
	color: var(--dc-text-dim, #5a6878);
	letter-spacing: 0.5px;
}
</style>
