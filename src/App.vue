<template>
	<div
		class="app-shell"
		:class="{ electron: isElectronRuntime, 'is-preview-window': isPreviewWindow, 'is-resource-manager-window': isResourceManagerWindow }"
	>
		<GlobalPageBackground v-if="!isPreviewWindow" :variant="currentPageVariant" />
		<GlobalTitleBar v-if="isElectronRuntime && !isPreviewWindow" class="app-titlebar" />
		<GlobalSideNav
			v-if="!isPreviewWindow"
			class="app-side-nav"
			:expanded="navExpanded"
			:collapsed="navCollapsed"
			@expand-change="onNavExpandChange"
			@collapsed-change="onNavCollapsedChange"
		/>
		<main ref="contentEl" class="app-content">
			<router-view v-slot="{ Component }">
				<transition name="page-fade" mode="out-in">
					<component :is="Component" />
				</transition>
			</router-view>
		</main>
		<StartupProgressBar v-if="!isResourceManagerWindow" :state="startupProgressState" @dismiss="hideStartupProgress" />
		<PageTransitionOverlay v-if="!isPreviewWindow" />
		<SteamEntryOverlay
			v-if="!isPreviewWindow && !isResourceManagerWindow"
			:visible="steamEntryVisible"
			:is-connecting="steamEntryConnecting"
			:is-connected="steamEntryConnected"
			:user="steamEntryUser"
			:error="steamEntryError"
			@close="hideSteamEntry"
			@open-overlay="openSteamOverlayFromEntry"
		/>
		<Transition name="overlay-indicator">
			<div v-if="showOverlayIndicator" class="platform-overlay-indicator">
				<div class="overlay-indicator-inner">
					<div class="overlay-icon">
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2" />
							<circle cx="9" cy="9" r="1.5" fill="currentColor" />
							<path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
					</div>
					<div class="overlay-text">
						<div class="overlay-title">Steam Overlay 已激活</div>
						<div class="overlay-subtitle">按 Shift+Tab 返回应用</div>
					</div>
				</div>
			</div>
		</Transition>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import { useRoute } from 'vue-router'
import { VideoStudioKey, VideoStudioStore } from './store/videostudio'
import { TimelineKey, TimelineStore } from './store/timeline'
import { AIWorkflowKey, AIWorkflowStore } from './store/aiworkflow'
import { ThemeKey, ThemeStore } from './store/theme'
import GlobalSideNav from './ui/UIComponent/GlobalSideNav.vue'
import GlobalTitleBar from './ui/UIComponent/GlobalTitleBar.vue'
import StartupProgressBar from './ui/UIComponent/StartupProgressBar.vue'
import PageTransitionOverlay from './ui/UIComponent/PageTransitionOverlay.vue'
import GlobalPageBackground from './ui/UIComponent/GlobalPageBackground.vue'
import SteamEntryOverlay from './ui/UIComponent/SteamEntryOverlay.vue'
import { useStartupProgress } from './composables/useStartupProgress'
import { usePlatform, useSteamEntry } from './platformBridge'

provide(VideoStudioKey, VideoStudioStore)
provide(TimelineKey, TimelineStore)
provide(AIWorkflowKey, AIWorkflowStore)
provide(ThemeKey, ThemeStore)

const route = useRoute()
const contentEl = ref<HTMLElement | null>(null)
const navExpanded = ref(false)
const navCollapsed = ref(false)
const isElectronRuntime = (window as any)?.__DWEB_RUNTIME__?.isElectron === true

const isPreviewWindow = computed(() => {
	const path = String(route.path || '')
	return path.startsWith('/image-markup-preview') || path.startsWith('/resource-manager')
})

const isResourceManagerWindow = computed(() => {
	return String(route.path || '').startsWith('/resource-manager')
})

const currentPageVariant = computed<'default' | 'workflow' | 'project-list'>(() => {
	const path = String(route.path || '')
	const name = String((route.name as string) || '')
	if (name === 'ProjectList' || path.startsWith('/projects')) return 'project-list'
	if (name === 'AIWorkflow' || path.startsWith('/aiworkflow') || path.startsWith('/blueprint')) return 'workflow'
	if (name === 'VideoStudio' || path.startsWith('/video-studio') || path.startsWith('/studio')) return 'default'
	return 'default'
})

const { state: startupProgressState, hide: hideStartupProgress } = useStartupProgress()

const { isSteam, overlayEnabled, overlayActive } = usePlatform()
const showOverlayIndicator = computed(() => isSteam.value && overlayEnabled.value && overlayActive.value)

const {
	showOverlay: steamEntryVisible,
	isConnecting: steamEntryConnecting,
	isConnected: steamEntryConnected,
	user: steamEntryUser,
	error: steamEntryError,
	hideOverlay: hideSteamEntry,
	openSteamOverlay: openSteamOverlayFromEntry,
} = useSteamEntry()

function onNavExpandChange(expanded: boolean) {
	navExpanded.value = expanded
}

function onNavCollapsedChange(collapsed: boolean) {
	navCollapsed.value = collapsed
}

onMounted(() => {
	ThemeStore.dispatch('initTheme')
})
</script>

<style scoped>
.app-shell {
	--titlebar-height: 36px;
	width: 100vw;
	height: 100vh;
	display: block;
	position: relative;
	overflow: hidden;
	background: var(--theme-bg-primary);
}

.app-shell.is-preview-window {
	--titlebar-height: 0px;
}

.app-titlebar {
	position: relative;
	z-index: 30;
	height: var(--titlebar-height);
}

.app-content {
	position: absolute;
	left: 0;
	right: 0;
	top: var(--titlebar-height);
	bottom: 0;
	min-width: 0;
	min-height: 0;
	width: 100%;
	z-index: 10;
	overflow: hidden;
	background: transparent;
}

.app-shell.is-preview-window .app-content {
	top: 0;
	bottom: 0;
	width: 100vw;
	height: 100vh;
	background: #1a1a1a;
}

.app-shell.is-resource-manager-window .app-content {
	top: 0;
	bottom: 0;
	width: 100vw;
	height: 100vh;
	background: #1a1a1a;
}

.page-fade-enter-active,
.page-fade-leave-active {
	transition: opacity 260ms ease, transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.page-fade-enter-from {
	opacity: 0;
	transform: translateY(8px);
}

.page-fade-leave-to {
	opacity: 0;
	transform: translateY(-4px);
}

.platform-overlay-indicator {
	position: fixed;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	z-index: 9999;
	pointer-events: none;
}

.overlay-indicator-inner {
	display: flex;
	align-items: center;
	gap: 16px;
	padding: 20px 32px;
	background: rgba(27, 40, 56, 0.95);
	border: 2px solid rgba(102, 192, 244, 0.6);
	border-radius: 12px;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 60px rgba(102, 192, 244, 0.2);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
}

.overlay-icon {
	width: 48px;
	height: 48px;
	display: flex;
	align-items: center;
	justify-content: center;
	color: #66c0f4;
	flex-shrink: 0;
}

.overlay-icon svg {
	width: 48px;
	height: 48px;
}

.overlay-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.overlay-title {
	font-size: 18px;
	font-weight: 600;
	color: #ffffff;
	letter-spacing: 0.5px;
}

.overlay-subtitle {
	font-size: 13px;
	color: #8f98a0;
}

.overlay-indicator-enter-active,
.overlay-indicator-leave-active {
	transition: all 300ms ease;
}

.overlay-indicator-enter-from,
.overlay-indicator-leave-to {
	opacity: 0;
	transform: translate(-50%, -50%) scale(0.9);
}
</style>
