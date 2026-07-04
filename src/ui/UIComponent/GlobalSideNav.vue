<template>
	<nav
		class="global-side-nav"
		:class="{ expanded: expandedState, collapsed: isCollapsed }"
		:aria-label="t('menu.navAriaLabel')"
		@mouseenter="onHover(true)"
		@mouseleave="onHover(false)"
	>
		<div class="gsn-particles" aria-hidden="true">
			<span
				v-for="p in sideNavParticles.particles"
				:key="p.id"
				class="sq-particle"
				:class="sideNavParticles.buildHoverStateClass(false)"
				:style="p.style"
			></span>
		</div>

		<template v-if="isCollapsed">
			<button
				class="gsn-toggle gsn-toggle-expand"
				type="button"
				@click="toggleCollapsed"
				:aria-label="t('menu.expand')"
				:title="t('menu.expand')"
			>
				<svg viewBox="0 0 24 24" fill="none">
					<path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8"
						stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>
			<UserButton
				v-if="isRealPlatform"
				:collapsed="true"
				:is-logged-in="isLoggedIn"
				:is-real-platform="isRealPlatform"
				:user="user"
				:menu-open="userMenuOpen"
				@click="toggleUserMenu"
			/>
		</template>

		<template v-else>
			<button
				class="gsn-toggle gsn-toggle-collapse"
				type="button"
				@click="toggleCollapsed"
				:aria-label="t('menu.collapse')"
				:title="t('menu.collapse')"
			>
				<svg viewBox="0 0 24 24" fill="none">
					<path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" stroke-width="1.8"
						stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>

			<button
				v-for="item in items"
				:key="item.key"
				class="gsn-item"
				:class="{ active: item.active }"
				type="button"
				@click="onSelect(item.key)"
				:title="item.label"
			>
				<span class="gsn-icon" aria-hidden="true">
					<svg v-if="item.key === 'projects'" viewBox="0 0 24 24" fill="none">
						<path
							d="M4 5h7l2 2h7v12H4z"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linejoin="round"
						/>
					</svg>
					<svg v-else-if="item.key === 'workflow'" viewBox="0 0 24 24" fill="none">
						<circle cx="6" cy="6" r="2" stroke="currentColor" stroke-width="1.8" />
						<circle cx="18" cy="6" r="2" stroke="currentColor" stroke-width="1.8" />
						<circle cx="12" cy="18" r="2" stroke="currentColor" stroke-width="1.8" />
						<path d="M8 7.2L10.6 16.8M16 7.2L13.4 16.8M8 6h8"
							stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
					</svg>
					<svg v-else-if="item.key === 'studio'" viewBox="0 0 24 24" fill="none">
						<rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.8" />
						<path d="M8 20h8M10 18v2M14 18v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
						<path d="M7.5 9.5h9M7.5 13h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
					</svg>
					<svg v-else viewBox="0 0 24 24" fill="none">
						<path
							d="M12 3.5l2 1.2 2.3-.3.9 2.1 2.1.9-.3 2.3 1.2 2-1.2 2 .3 2.3-2.1.9-.9 2.1-2.3-.3-2 1.2-2-1.2-2.3.3-.9-2.1-2.1-.9.3-2.3-1.2-2 1.2-2-.3-2.3 2.1-.9.9-2.1 2.3.3 2-1.2z"
							stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
						<circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.6" />
					</svg>
				</span>
				<span class="gsn-label">{{ item.label }}</span>
			</button>

			<div v-if="isRealPlatform && !isCollapsed" class="nav-divider"></div>

			<UserButton
				v-if="isRealPlatform"
				:collapsed="false"
				:is-logged-in="isLoggedIn"
				:is-real-platform="isRealPlatform"
				:user="user"
				:menu-open="userMenuOpen"
				@click="toggleUserMenu"
			/>
		</template>

		<UserMenu
			v-if="isRealPlatform"
			:visible="userMenuOpen"
			:is-real-platform="isRealPlatform"
			:user="user"
			:collapsed="isCollapsed"
			@close="closeUserMenu"
			@action="handleUserMenuAction"
		/>
	</nav>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSquareParticles } from '../../composables/useSquareParticles'
import { usePlatform } from '../../platformBridge/usePlatform'
import { UserButton, UserMenu } from '../User'
import { useI18n } from '../../i18n'

const { t } = useI18n()

const props = defineProps<{
	expanded: boolean
	collapsed: boolean
}>()

const emit = defineEmits<{
	(e: 'expand-change', expanded: boolean): void
	(e: 'collapsed-change', collapsed: boolean): void
	(e: 'toggle-steam-panel'): void
}>()

const route = useRoute()
const router = useRouter()

const { isLoggedIn, isRealPlatform, user } = usePlatform()

const userMenuOpen = ref(false)

const expandedState = ref(props.expanded)
const isCollapsed = ref(props.collapsed)

watch(() => props.expanded, v => { expandedState.value = v })
watch(() => props.collapsed, v => { isCollapsed.value = v })

const sideNavParticles = useSquareParticles({ count: 10, seed: 42, baseOpacity: 0.6 })

const items = computed(() => [
	{ key: 'projects', label: t('menu.projects'), active: route.name === 'ProjectList' },
	{ key: 'workflow', label: t('menu.workflow'), active: route.name === 'AIWorkflow' },
	{ key: 'settings', label: t('menu.settings'), active: route.name === 'Settings' },
])

function onHover(v: boolean) {
	if (isCollapsed.value) return
	if (expandedState.value === v) return
	emit('expand-change', v)
}

const LAST_PROJECT_KEY = 'dweb.aiworkflow.lastProjectId.v1'

function getLastProjectId(): number | null {
	const raw = localStorage.getItem(LAST_PROJECT_KEY)
	const id = Number(raw)
	return Number.isFinite(id) && id > 0 ? id : null
}

function onSelect(key: string) {
	if (key === 'projects') void router.push({ name: 'ProjectList' })
	if (key === 'workflow') {
		const lastId = getLastProjectId()
		if (lastId) {
			void router.push({ name: 'AIWorkflow', query: { projectId: String(lastId) } })
		} else {
			void router.push({ name: 'AIWorkflow' })
		}
	}
	if (key === 'studio') void router.push({ name: 'VideoStudio' })
	if (key === 'settings') void router.push({ name: 'Settings' })
}

function toggleCollapsed() {
	const next = !isCollapsed.value
	isCollapsed.value = next
	userMenuOpen.value = false
	emit('collapsed-change', next)
}

function toggleUserMenu() {
	userMenuOpen.value = !userMenuOpen.value
}

function closeUserMenu() {
	userMenuOpen.value = false
}

function handleUserMenuAction(actionId: string) {
	if (actionId === 'open-panel' || actionId === 'friends') {
		emit('toggle-steam-panel')
	}
}
</script>

<style scoped>
@import "../../styles/square-particles.css";

.global-side-nav {
	position: fixed;
	left: 16px;
	top: 50%;
	transform: translateY(-25%);
	width: 56px;
	box-sizing: border-box;
	padding: 12px 6px;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: flex-start;
	gap: 8px;
	border: 1px solid color-mix(in srgb, var(--theme-accent, #3aa8b4) 35%, transparent);
	background: color-mix(in srgb, var(--theme-bg-primary, #181818) 60%, transparent);
	backdrop-filter: blur(16px) saturate(140%);
	-webkit-backdrop-filter: blur(16px) saturate(140%);
	box-shadow:
		0 10px 32px rgba(0, 0, 0, 0.45),
		0 2px 6px rgba(0, 0, 0, 0.25),
		inset 0 0 0 1px color-mix(in srgb, var(--theme-accent, #3aa8b4) 8%, transparent);
	transition:
		width 280ms cubic-bezier(0.22, 0.61, 0.36, 1),
		left 380ms cubic-bezier(0.22, 0.61, 0.36, 1),
		transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1),
		padding 220ms ease,
		border-color 220ms ease,
		background 220ms ease,
		box-shadow 220ms ease,
		opacity 280ms ease;
	z-index: 70;
	overflow: visible;
}

.global-side-nav.expanded {
	width: 184px;
	padding: 12px 10px;
	align-items: stretch;
	box-shadow:
		0 14px 42px rgba(0, 0, 0, 0.5),
		0 2px 6px rgba(0, 0, 0, 0.28),
		inset 0 0 0 1px color-mix(in srgb, var(--theme-accent, #3aa8b4) 14%, transparent);
	border-color: color-mix(in srgb, var(--theme-accent, #3aa8b4) 45%, transparent);
}

.global-side-nav.collapsed {
	width: 52px;
	padding: 8px 6px;
	gap: 8px;
	justify-content: flex-start;
	align-items: center;
}

.nav-spacer {
	flex: 1;
}

.gsn-particles {
	position: absolute;
	inset: 0;
	pointer-events: none;
	overflow: hidden;
	opacity: 0.85;
	z-index: 0;
	border-radius: 0;
}

.global-side-nav.collapsed .gsn-particles {
	opacity: 1;
}

.global-side-nav.collapsed .gsn-particles .sq-particle {
	--sq-duration: 4.5s;
}

.gsn-toggle {
	position: relative;
	z-index: 1;
	width: 100%;
	height: 36px;
	box-sizing: border-box;
	appearance: none;
	-webkit-appearance: none;
	border: 1px solid color-mix(in srgb, var(--theme-accent, #3aa8b4) 30%, transparent);
	background: color-mix(in srgb, var(--theme-accent, #3aa8b4) 12%, transparent);
	color: var(--theme-accent, #3aa8b4);
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: background 160ms ease, border-color 160ms ease, transform 140ms ease;
	border-radius: 0;
}

.gsn-toggle:hover {
	background: color-mix(in srgb, var(--theme-accent, #3aa8b4) 22%, transparent);
	border-color: color-mix(in srgb, var(--theme-accent, #3aa8b4) 60%, transparent);
}

.gsn-toggle:active {
	transform: scale(0.96);
}

.gsn-toggle svg {
	width: 18px;
	height: 18px;
}

.global-side-nav.collapsed .gsn-toggle-expand {
	height: 36px;
	width: 100%;
	border: 1px solid color-mix(in srgb, var(--theme-accent, #3aa8b4) 45%, transparent);
	background: color-mix(in srgb, var(--theme-accent, #3aa8b4) 16%, transparent);
	box-shadow: 0 0 14px color-mix(in srgb, var(--theme-accent, #3aa8b4) 35%, transparent);
}

.gsn-item {
	position: relative;
	z-index: 1;
	box-sizing: border-box;
	appearance: none;
	-webkit-appearance: none;
	width: 100%;
	height: 40px;
	flex: 0 0 40px;
	border: 1px solid transparent;
	background: transparent;
	color: var(--theme-text-primary, #d4d4d4);
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0;
	padding: 0;
	margin: 0;
	cursor: pointer;
	overflow: hidden;
	transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, color 160ms ease;
	border-radius: 0;
}

.global-side-nav.expanded .gsn-item {
	justify-content: flex-start;
	padding: 0 12px;
	gap: 12px;
}

.gsn-item:hover {
	background: color-mix(in srgb, var(--theme-accent, #3aa8b4) 10%, transparent);
	border-color: color-mix(in srgb, var(--theme-accent, #3aa8b4) 35%, transparent);
	color: var(--theme-accent, #3aa8b4);
}

.gsn-item.active {
	border-color: color-mix(in srgb, var(--theme-accent, #3aa8b4) 65%, transparent);
	background: color-mix(in srgb, var(--theme-accent, #3aa8b4) 20%, transparent);
	color: var(--theme-accent, #3aa8b4);
	box-shadow:
		inset 0 0 0 1px color-mix(in srgb, var(--theme-accent, #3aa8b4) 25%, transparent),
		0 0 14px color-mix(in srgb, var(--theme-accent, #3aa8b4) 22%, transparent);
}

.gsn-icon {
	width: 22px;
	height: 22px;
	flex: 0 0 22px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
}

.gsn-icon svg {
	width: 20px;
	height: 20px;
	display: block;
}

.gsn-label {
	max-width: 0;
	opacity: 0;
	white-space: nowrap;
	transition: max-width 180ms ease, opacity 140ms ease;
	font-size: 12.5px;
	color: inherit;
	flex: 0 0 auto;
	min-width: 0;
	letter-spacing: 0.02em;
}

.global-side-nav.expanded .gsn-label {
	max-width: 160px;
	opacity: 1;
}

.nav-divider {
	width: 100%;
	height: 1px;
	background: color-mix(in srgb, var(--theme-accent, #3aa8b4) 20%, transparent);
	margin: 4px 0;
	flex-shrink: 0;
}
</style>
