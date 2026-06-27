<template>
	<Transition name="steam-panel">
		<div v-if="visible" class="steam-panel-overlay" @click.self="handleBackdropClick">
			<div class="steam-panel" :class="{ 'is-real-platform': isRealPlatform }" ref="panelEl">
				<div class="panel-particles" aria-hidden="true">
					<span
						v-for="p in particles"
						:key="p.id"
						class="sq-particle"
						:style="p.style"
					></span>
				</div>

				<div class="panel-corner-decoration top-left" aria-hidden="true"></div>
				<div class="panel-corner-decoration bottom-left" aria-hidden="true"></div>

				<div class="panel-header">
					<div class="panel-title-section">
						<div class="panel-logo">
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
								<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8" />
								<circle cx="12" cy="12" r="1.5" fill="currentColor" />
							</svg>
						</div>
						<div class="panel-title-group">
							<div class="panel-title">Steam</div>
							<div class="panel-subtitle">{{ statusText }}</div>
						</div>
					</div>
					<button class="panel-close-btn" type="button" @click="emit('close')" title="关闭 (Esc)">
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
						</svg>
					</button>
				</div>

				<div class="panel-content" ref="contentEl">
					<div v-if="isRealPlatform &amp;&amp; user" class="panel-section user-section">
						<SteamUserCard :user="user" status="online" />
					</div>

					<div v-else-if="!isRealPlatform" class="panel-section mock-notice">
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M12 9v4M12 17h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
							<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8" />
						</svg>
						<span>当前为开发模式（Mock），Steam功能不可用</span>
					</div>

					<div v-if="isRealPlatform" class="panel-section">
						<SteamQuickActions @action="handleQuickAction" />
					</div>

					<div v-if="isRealPlatform" class="panel-section friends-section" ref="friendsSectionEl">
						<div class="section-title">
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
								<circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/>
							</svg>
							<span>好友列表</span>
						</div>
						<SteamFriendsList />
					</div>
				</div>

				<div class="panel-footer">
					<span class="footer-hint">按 Shift+Tab 或 Esc 关闭面板</span>
				</div>
			</div>
		</div>
	</Transition>
</template>

<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { useSquareParticles } from '../../composables/useSquareParticles'
import type { DwebPlatformUser } from '../../platformBridge/types'
import SteamUserCard from './SteamUserCard.vue'
import SteamQuickActions from './SteamQuickActions.vue'
import SteamFriendsList from './SteamFriendsList.vue'

interface Props {
	visible: boolean
	isRealPlatform: boolean
	user: DwebPlatformUser | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
	(e: 'close'): void
	(e: 'action', actionId: string): void
}>()

const panelEl = ref<HTMLElement | null>(null)
const contentEl = ref<HTMLElement | null>(null)
const friendsSectionEl = ref<HTMLElement | null>(null)
const { particles } = useSquareParticles({ count: 12, seed: 88, baseOpacity: 0.45 })

const statusText = computed(() => {
	if (!props.isRealPlatform) return '未连接'
	if (props.user) return '已连接'
	return '连接中...'
})

function handleBackdropClick() {
	emit('close')
}

function handleQuickAction(actionId: string) {
	if (actionId === 'friends') {
		nextTick(() => {
			friendsSectionEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
		})
	}
	emit('action', actionId)
}
</script>

<style scoped>
@import "../../styles/square-particles.css";

.steam-panel-overlay {
	position: fixed;
	inset: 0;
	z-index: 9500;
	display: flex;
	justify-content: flex-end;
	pointer-events: auto;
}

.steam-panel {
	position: relative;
	width: 380px;
	max-width: 90vw;
	height: 100%;
	display: flex;
	flex-direction: column;
	background: color-mix(in srgb, var(--theme-bg-secondary, #1e1e1e) 92%, transparent);
	backdrop-filter: blur(20px) saturate(140%);
	-webkit-backdrop-filter: blur(20px) saturate(140%);
	border-left: 2px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent);
	box-shadow:
		-12px 0 48px rgba(0, 0, 0, 0.5),
		-4px 0 16px rgba(0, 0, 0, 0.3),
		inset 1px 0 0 color-mix(in srgb, var(--theme-accent, #1f9d84) 15%, transparent),
		0 0 60px color-mix(in srgb, var(--theme-accent, #1f9d84) 8%, transparent);
	overflow: hidden;
	border-radius: 0;
}

.panel-corner-decoration {
	position: absolute;
	width: 14px;
	height: 14px;
	border: 2px solid var(--theme-accent, #1f9d84);
	opacity: 0.5;
	z-index: 2;
}

.panel-corner-decoration.top-left {
	top: 8px;
	left: 8px;
	border-right: none;
	border-bottom: none;
}

.panel-corner-decoration.bottom-left {
	bottom: 8px;
	left: 8px;
	border-right: none;
	border-top: none;
}

.panel-particles {
	position: absolute;
	inset: 0;
	pointer-events: none;
	overflow: hidden;
	opacity: 0.7;
	z-index: 0;
	border-radius: 0;
}

.panel-header {
	position: relative;
	z-index: 1;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16px 16px 14px;
	border-bottom: 2px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 20%, transparent);
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 6%, transparent);
	flex-shrink: 0;
}

.panel-title-section {
	display: flex;
	align-items: center;
	gap: 12px;
}

.panel-logo {
	width: 40px;
	height: 40px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(135deg, var(--theme-accent, #1f9d84) 0%, var(--pl-cold, #3aa8b4) 100%);
	color: white;
	flex-shrink: 0;
	border: 2px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 60%, transparent);
	box-shadow:
		0 0 14px color-mix(in srgb, var(--theme-accent, #1f9d84) 35%, transparent),
		inset 0 0 8px color-mix(in srgb, white 20%, transparent);
	border-radius: 0;
}

.panel-logo svg {
	width: 22px;
	height: 22px;
}

.panel-title-group {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.panel-title {
	font-size: 16px;
	font-weight: 700;
	color: var(--theme-text-primary, #d4d4d4);
	letter-spacing: 0.02em;
}

.panel-subtitle {
	font-size: 11px;
	color: var(--theme-text-muted, #6e6e6e);
	text-transform: uppercase;
	letter-spacing: 0.06em;
}

.steam-panel.is-real-platform .panel-subtitle {
	color: var(--theme-accent, #1f9d84);
}

.panel-close-btn {
	width: 32px;
	height: 32px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: transparent;
	border: 1px solid transparent;
	color: var(--theme-text-secondary, #a0a0a0);
	cursor: pointer;
	transition: all 140ms ease;
	appearance: none;
	-webkit-appearance: none;
	border-radius: 0;
}

.panel-close-btn:hover {
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 12%, transparent);
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 35%, transparent);
	color: var(--theme-accent, #1f9d84);
	box-shadow: 0 0 10px color-mix(in srgb, var(--theme-accent, #1f9d84) 20%, transparent);
}

.panel-close-btn svg {
	width: 18px;
	height: 18px;
}

.panel-content {
	position: relative;
	z-index: 1;
	flex: 1;
	overflow-y: auto;
	padding: 16px;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.panel-section {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.section-title {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: var(--theme-text-muted, #6e6e6e);
	padding: 0 2px;
}

.section-title svg {
	width: 14px;
	height: 14px;
}

.user-section {
	padding-bottom: 8px;
	border-bottom: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 15%, transparent);
}

.mock-notice {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 14px;
	background: color-mix(in srgb, var(--theme-warning, #cca700) 8%, transparent);
	border: 1px solid color-mix(in srgb, var(--theme-warning, #cca700) 25%, transparent);
	color: var(--theme-warning, #cca700);
	font-size: 12px;
	border-radius: 0;
}

.mock-notice svg {
	width: 20px;
	height: 20px;
	flex-shrink: 0;
}

.friends-section {
	flex: 1;
	min-height: 0;
}

.panel-footer {
	position: relative;
	z-index: 1;
	padding: 10px 16px;
	border-top: 2px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 15%, transparent);
	background: color-mix(in srgb, var(--theme-bg-tertiary, #23272e) 50%, transparent);
	flex-shrink: 0;
}

.footer-hint {
	font-size: 11px;
	color: var(--theme-text-muted, #6e6e6e);
	text-align: center;
	display: block;
}

/* Transitions */
.steam-panel-enter-active {
	transition: all 280ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.steam-panel-leave-active {
	transition: all 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.steam-panel-enter-from .steam-panel,
.steam-panel-leave-to .steam-panel {
	transform: translateX(100%);
}

.steam-panel-enter-from,
.steam-panel-leave-to {
	background: transparent;
}

.steam-panel-enter-active,
.steam-panel-leave-active {
	background: rgba(0, 0, 0, 0.4);
	backdrop-filter: blur(4px);
	-webkit-backdrop-filter: blur(4px);
}

/* Scrollbar */
.panel-content::-webkit-scrollbar {
	width: 6px;
}

.panel-content::-webkit-scrollbar-track {
	background: transparent;
}

.panel-content::-webkit-scrollbar-thumb {
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 30%, transparent);
	border-radius: 0;
}

.panel-content::-webkit-scrollbar-thumb:hover {
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 50%, transparent);
}
</style>
