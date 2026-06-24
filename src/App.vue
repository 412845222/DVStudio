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
import { useStartupProgress } from './composables/useStartupProgress'

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
</style>
