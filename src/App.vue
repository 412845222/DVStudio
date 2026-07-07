<template>
	<div
		class="app-shell"
		:class="{
			electron: isElectronRuntime,
			'is-preview-window': isPreviewWindow,
			'is-resource-manager-window': isResourceManagerWindow,
			'is-template-center-window': isTemplateCenterWindow
		}"
	>
		<GlobalPageBackground v-if="!isPreviewWindow" :variant="currentPageVariant" />
		<GlobalTitleBar v-if="isElectronRuntime && !isPreviewWindow" class="app-titlebar" />
		<DialogTitleBar v-if="isElectronRuntime && isPreviewWindow" class="app-titlebar" :title="dialogTitle" />
		<GlobalSideNav
			v-if="!isPreviewWindow"
			class="app-side-nav"
			:expanded="navExpanded"
			:collapsed="navCollapsed"
			@expand-change="onNavExpandChange"
			@collapsed-change="onNavCollapsedChange"
			@toggle-steam-panel="toggleSteamPanel()"
		/>
		<main ref="contentEl" class="app-content">
			<router-view v-slot="{ Component }">
				<transition name="page-fade" mode="out-in">
					<component :is="Component" />
				</transition>
			</router-view>
		</main>
		<StartupProgressBar
			v-if="!isResourceManagerWindow"
			:state="startupProgressState"
			@dismiss="hideStartupProgress"
		/>
		<PageTransitionOverlay v-if="!isPreviewWindow" />
		<SteamEntryOverlay
			v-if="!isPreviewWindow && !isResourceManagerWindow && isRealPlatform"
			:visible="steamEntryVisible"
			:is-connecting="steamEntryConnecting"
			:is-connected="steamEntryConnected"
			:user="steamEntryUser"
			:error="steamEntryError"
			@close="hideSteamEntry"
		/>
		<SteamPanel
			v-if="!isPreviewWindow && !isResourceManagerWindow && isRealPlatform"
			:visible="steamPanelOpen"
			:is-real-platform="isRealPlatform"
			:user="platformUser"
			@close="closeSteamPanel()"
			@action="handleSteamPanelAction"
		/>
		<AboutDialog />
		<SciFiFeedback />
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import { useRoute } from 'vue-router'
import { VideoStudioKey, VideoStudioStore } from './store/videostudio'
import { TimelineKey, TimelineStore } from './store/timeline'
import { AIWorkflowKey, AIWorkflowStore } from './store/aiworkflow'
import { ThemeKey, ThemeStore } from './store/theme'
import { I18nStoreKey, I18nStore } from './store/i18n'
import GlobalSideNav from './ui/UIComponent/GlobalSideNav.vue'
import GlobalTitleBar from './ui/UIComponent/GlobalTitleBar.vue'
import DialogTitleBar from './ui/UIComponent/DialogTitleBar.vue'
import StartupProgressBar from './ui/UIComponent/StartupProgressBar.vue'
import PageTransitionOverlay from './ui/UIComponent/PageTransitionOverlay.vue'
import GlobalPageBackground from './ui/UIComponent/GlobalPageBackground.vue'
import SteamEntryOverlay from './ui/UIComponent/SteamEntryOverlay.vue'
import SteamPanel from './ui/Steam/SteamPanel.vue'
import AboutDialog from './ui/UIComponent/AboutDialog.vue'
import SciFiFeedback from './ui/UIComponent/SciFiFeedback.vue'
import { useStartupProgress } from './composables/useStartupProgress'
import { usePlatform, useSteamEntry } from './platformBridge'
import { useSteamPanel } from './composables/useSteamPanel'

provide(VideoStudioKey, VideoStudioStore)
provide(TimelineKey, TimelineStore)
provide(AIWorkflowKey, AIWorkflowStore)
provide(ThemeKey, ThemeStore)
provide(I18nStoreKey, I18nStore)

const route = useRoute()
const contentEl = ref<HTMLElement | null>(null)
const navExpanded = ref(false)
const navCollapsed = ref(false)
const isElectronRuntime = ((window as unknown as Record<string, unknown>).__DWEB_RUNTIME__ as { isElectron?: boolean } | undefined)?.isElectron === true

const isPreviewWindow = computed(() => {
	const path = String(route.path || '')
	return path.startsWith('/image-markup-preview') || path.startsWith('/resource-manager') || path.startsWith('/template-center')
})

const isResourceManagerWindow = computed(() => {
	return String(route.path || '').startsWith('/resource-manager')
})

const isTemplateCenterWindow = computed(() => {
	return String(route.path || '').startsWith('/template-center')
})

const isImageMarkupWindow = computed(() => {
	return String(route.path || '').startsWith('/image-markup-preview')
})

const dialogTitle = computed(() => {
	const query = route.query as Record<string, string>
	if (isResourceManagerWindow.value) {
		return String(query.title || '资源管理器')
	}
	if (isImageMarkupWindow.value) {
		return String(query.name || '图片预览')
	}
	if (isTemplateCenterWindow.value) {
		return String(query.title || '模板中心')
	}
	return ''
})

const currentPageVariant = computed<'default' | 'workflow' | 'project-list'>(() => {
	const path = String(route.path || '')
	const name = String((route.name as string) || '')
	if (name === 'ProjectList' || path.startsWith('/projects')) return 'project-list'
	if (name === 'AIWorkflow' || path.startsWith('/aiworkflow') || path.startsWith('/blueprint'))
		return 'workflow'
	if (name === 'VideoStudio' || path.startsWith('/video-studio') || path.startsWith('/studio'))
		return 'default'
	return 'default'
})

const { state: startupProgressState, hide: hideStartupProgress } = useStartupProgress()

const { isRealPlatform, user: platformUser, overlayActivate } = usePlatform()
const { isOpen: steamPanelOpen, open: openSteamPanel, close: closeSteamPanel, toggle: toggleSteamPanel } = useSteamPanel(isRealPlatform)

const {
	showOverlay: steamEntryVisible,
	isConnecting: steamEntryConnecting,
	isConnected: steamEntryConnected,
	user: steamEntryUser,
	error: steamEntryError,
	hideOverlay: hideSteamEntry,
} = useSteamEntry()

function openExternalUrl(url: string) {
	const w = window as unknown as Record<string, unknown>
	const dweb = w.dweb as { common?: { openExternalUrl?: (url: string) => void } } | undefined
	if (dweb?.common?.openExternalUrl) {
		dweb.common.openExternalUrl(url)
	} else {
		window.open(url, '_blank', 'noopener,noreferrer')
	}
}

function handleSteamPanelAction(actionId: string) {
	switch (actionId) {
		case 'store':
			overlayActivate('Steam').catch(() => {
				openExternalUrl('https://store.steampowered.com/')
			})
			break
		case 'community':
			overlayActivate('Community').catch(() => {
				openExternalUrl('https://steamcommunity.com/')
			})
			break
		case 'friends':
			overlayActivate('Friends').catch(() => {
				openExternalUrl('steam://open/friends')
			})
			break
		case 'achievements':
			overlayActivate('Achievements').catch(() => {
				openExternalUrl('https://steamcommunity.com/my/')
			})
			break
		case 'open-panel':
		default:
			break
	}
}

function onNavExpandChange(expanded: boolean) {
	navExpanded.value = expanded
}

function onNavCollapsedChange(collapsed: boolean) {
	navCollapsed.value = collapsed
}

function onStorageChange(e: StorageEvent) {
	if (e.key === 'dweb-theme-mode' && e.newValue) {
		if (e.newValue === 'dark' || e.newValue === 'light') {
			if (ThemeStore.state.mode !== e.newValue) {
				ThemeStore.commit('SET_THEME_MODE', e.newValue)
			}
		}
	}
	if (e.key === 'dweb-locale' && e.newValue) {
		const supported = ['zh-CN', 'en-US']
		if (supported.includes(e.newValue) && I18nStore.state.locale !== e.newValue) {
			I18nStore.commit('SET_LOCALE', e.newValue as any)
		}
	}
}

onMounted(() => {
	ThemeStore.dispatch('initTheme')
	void I18nStore.dispatch('initLocale')
	window.addEventListener('storage', onStorageChange)
})

onBeforeUnmount(() => {
	window.removeEventListener('storage', onStorageChange)
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
	--titlebar-height: 36px;
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

.page-fade-enter-active,
.page-fade-leave-active {
	transition:
		opacity 260ms ease,
		transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.page-fade-enter-from {
	opacity: 0;
	transform: translateY(8px);
}

.page-fade-leave-to {
	opacity: 0;
	transform: translateY(-4px);
}
</style>
