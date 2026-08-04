<template>
	<Transition name="user-menu">
		<div v-if="visible" class="user-menu-container">
			<div class="user-menu-backdrop" @click="handleBackdropClick"></div>
			<div
				class="user-menu"
				:class="{ 'is-mock': !isRealPlatform, 'is-collapsed': collapsed }"
				ref="menuEl"
			>
				<div class="menu-particles" aria-hidden="true">
					<span v-for="p in particles" :key="p.id" class="sq-particle" :style="p.style"></span>
				</div>

				<div class="menu-corner-decoration top-left" aria-hidden="true"></div>
				<div class="menu-corner-decoration top-right" aria-hidden="true"></div>
				<div class="menu-corner-decoration bottom-left" aria-hidden="true"></div>
				<div class="menu-corner-decoration bottom-right" aria-hidden="true"></div>

				<div v-if="isRealPlatform && user" class="menu-header">
					<UserAvatar :src="user.avatarUrl" size="lg" status="online" />
					<div class="menu-user-info">
						<div class="menu-user-name">{{ user.displayName }}</div>
						<div v-if="user.platformId" class="menu-user-id">SteamID: {{ user.platformId }}</div>
					</div>
				</div>

				<div v-else class="menu-header mock-header">
					<UserAvatar size="lg" status="offline" />
					<div class="menu-user-info">
						<div class="menu-user-name">{{ t('userMenu.notConnected') }}</div>
						<div class="menu-user-id">{{ t('userMenu.developmentMode') }}</div>
					</div>
				</div>

				<div class="menu-divider"></div>

				<div class="menu-items">
					<button
						class="menu-item"
						type="button"
						:disabled="!isRealPlatform"
						@click="handleAction('open-panel')"
					>
						<span class="menu-item-icon">
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<rect x="3" y="3" width="18" height="18" stroke="currentColor" stroke-width="1.8" />
								<path d="M9 9h6v6H9z" stroke="currentColor" stroke-width="1.8" />
							</svg>
						</span>
						<span class="menu-item-label">{{ t('userMenu.openSteamPanel') }}</span>
						<span class="menu-item-hint">Shift+Tab</span>
					</button>

					<button
						class="menu-item"
						type="button"
						:disabled="!isRealPlatform"
						@click="handleAction('friends')"
					>
						<span class="menu-item-icon">
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
									stroke="currentColor"
									stroke-width="1.8"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
								<circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.8" />
								<path
									d="M23 21v-2a4 4 0 0 0-3-3.87"
									stroke="currentColor"
									stroke-width="1.8"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
								<path
									d="M16 3.13a4 4 0 0 1 0 7.75"
									stroke="currentColor"
									stroke-width="1.8"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						</span>
						<span class="menu-item-label">{{ t('userMenu.friendsList') }}</span>
					</button>

					<button class="menu-item is-disabled" type="button" disabled>
						<span class="menu-item-icon">
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<circle cx="12" cy="8" r="6" stroke="currentColor" stroke-width="1.8" />
								<path
									d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"
									stroke="currentColor"
									stroke-width="1.8"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						</span>
						<span class="menu-item-label">{{ t('userMenu.achievements') }}</span>
						<span class="menu-item-hint">{{ t('userMenu.comingSoon') }}</span>
					</button>

					<div class="menu-divider"></div>

					<button class="menu-item is-disabled" type="button" disabled>
						<span class="menu-item-icon">
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8" />
								<path
									d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
									stroke="currentColor"
									stroke-width="1.8"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						</span>
						<span class="menu-item-label">{{ t('userMenu.steamSettings') }}</span>
						<span class="menu-item-hint">{{ t('userMenu.comingSoon') }}</span>
					</button>
				</div>
			</div>
		</div>
	</Transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useSquareParticles } from '../../composables/useSquareParticles'
import type { DwebPlatformUser } from '../../platformBridge/types'
import { UserAvatar } from './index'
import { useI18n } from '../../i18n'

const { t } = useI18n()

interface Props {
	visible: boolean
	isRealPlatform: boolean
	user: DwebPlatformUser | null
	collapsed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
	collapsed: false
})

const emit = defineEmits<{
	(e: 'close'): void
	(e: 'action', actionId: string): void
}>()

const menuEl = ref<HTMLElement | null>(null)
const { particles } = useSquareParticles({ count: 6, seed: 77, baseOpacity: 0.3 })

function handleBackdropClick() {
	emit('close')
}

function handleAction(actionId: string) {
	if (!props.isRealPlatform) return
	emit('action', actionId)
	emit('close')
}

function handleKeydown(e: KeyboardEvent) {
	if (e.key === 'Escape' && props.visible) {
		e.preventDefault()
		emit('close')
	}
}

onMounted(() => {
	document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
	document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
@import '../../styles/square-particles.css';

.user-menu-container {
	position: absolute;
	inset: 0;
	z-index: 10001;
	pointer-events: none;
}

.user-menu-backdrop {
	position: fixed;
	inset: 0;
	background: transparent;
	pointer-events: auto;
}

.user-menu {
	position: absolute;
	left: calc(100% + 8px);
	bottom: 0;
	width: 240px;
	background: color-mix(in srgb, var(--theme-bg-secondary, #1e1e1e) 95%, transparent);
	border: 2px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent);
	box-shadow:
		0 12px 40px rgba(0, 0, 0, 0.6),
		0 0 30px color-mix(in srgb, var(--theme-accent, #1f9d84) 15%, transparent),
		inset 0 0 0 1px color-mix(in srgb, var(--theme-accent, #1f9d84) 10%, transparent);
	overflow: hidden;
	border-radius: 0;
	pointer-events: auto;
}

.user-menu.is-collapsed {
	bottom: 0;
}

.user-menu.is-mock {
	border-color: color-mix(in srgb, var(--theme-text-muted, #6e6e6e) 30%, transparent);
	box-shadow:
		0 12px 40px rgba(0, 0, 0, 0.5),
		inset 0 0 0 1px color-mix(in srgb, var(--theme-text-muted, #6e6e6e) 8%, transparent);
}

.menu-corner-decoration {
	position: absolute;
	width: 10px;
	height: 10px;
	border: 2px solid var(--theme-accent, #1f9d84);
	opacity: 0.6;
	z-index: 2;
}

.menu-corner-decoration.top-left {
	top: 4px;
	left: 4px;
	border-right: none;
	border-bottom: none;
}

.menu-corner-decoration.top-right {
	top: 4px;
	right: 4px;
	border-left: none;
	border-bottom: none;
}

.menu-corner-decoration.bottom-left {
	bottom: 4px;
	left: 4px;
	border-right: none;
	border-top: none;
}

.menu-corner-decoration.bottom-right {
	bottom: 4px;
	right: 4px;
	border-left: none;
	border-top: none;
}

.user-menu.is-mock .menu-corner-decoration {
	border-color: var(--theme-text-muted, #6e6e6e);
	opacity: 0.3;
}

.menu-particles {
	position: absolute;
	inset: 0;
	pointer-events: none;
	overflow: hidden;
	opacity: 0.5;
	z-index: 0;
}

.menu-header {
	position: relative;
	z-index: 1;
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 14px;
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 8%, transparent);
	border-bottom: 2px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 20%, transparent);
}

.user-menu.is-mock .menu-header {
	background: color-mix(in srgb, var(--theme-text-muted, #6e6e6e) 8%, transparent);
	border-bottom-color: color-mix(in srgb, var(--theme-text-muted, #6e6e6e) 20%, transparent);
}

.mock-header {
	opacity: 0.7;
}

.menu-user-info {
	flex: 1;
	min-width: 0;
}

.menu-user-name {
	font-size: 14px;
	font-weight: 600;
	color: var(--theme-text-primary, #d4d4d4);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.menu-user-id {
	font-size: 10px;
	color: var(--theme-text-muted, #6e6e6e);
	font-family: monospace;
	margin-top: 2px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.menu-divider {
	height: 1px;
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 15%, transparent);
	margin: 4px 0;
}

.user-menu.is-mock .menu-divider {
	background: color-mix(in srgb, var(--theme-text-muted, #6e6e6e) 12%, transparent);
}

.menu-items {
	position: relative;
	z-index: 1;
	padding: 6px;
}

.menu-item {
	box-sizing: border-box;
	appearance: none;
	-webkit-appearance: none;
	width: 100%;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
	background: transparent;
	border: 1px solid transparent;
	color: var(--theme-text-secondary, #a0a0a0);
	cursor: pointer;
	text-align: left;
	transition: all 140ms ease;
	border-radius: 0;
}

.menu-item:not(:disabled):hover {
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 10%, transparent);
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 35%, transparent);
	color: var(--theme-accent, #1f9d84);
	box-shadow: 0 0 10px color-mix(in srgb, var(--theme-accent, #1f9d84) 15%, transparent);
}

.menu-item:disabled,
.menu-item.is-disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.menu-item-icon {
	width: 18px;
	height: 18px;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}

.menu-item-icon svg {
	width: 16px;
	height: 16px;
}

.menu-item-label {
	flex: 1;
	font-size: 12px;
	font-weight: 500;
	letter-spacing: 0.01em;
}

.menu-item-hint {
	font-size: 10px;
	color: var(--theme-text-muted, #6e6e6e);
	font-family: monospace;
}

.menu-item:not(:disabled):hover .menu-item-hint {
	color: var(--theme-accent, #1f9d84);
	opacity: 0.7;
}

.user-menu-enter-active,
.user-menu-leave-active {
	transition: all 180ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.user-menu-enter-from .user-menu,
.user-menu-leave-to .user-menu {
	opacity: 0;
	transform: translateX(-8px) scale(0.96);
}

.user-menu-enter-from .user-menu-backdrop,
.user-menu-leave-to .user-menu-backdrop {
	opacity: 0;
}
</style>
