<template>
	<Transition name="steam-overlay">
		<div v-if="visible" class="steam-entry-overlay">
			<div class="steam-entry-backdrop" @click="handleBackdropClick"></div>
			<div class="steam-entry-card" :class="{ 'is-connected': isConnected }">
				<div class="card-particles" aria-hidden="true">
					<span v-for="p in particles" :key="p.id" class="sq-particle" :style="p.style"></span>
				</div>

				<div class="steam-entry-header">
					<div class="steam-logo">
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
							<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8" />
							<circle cx="12" cy="12" r="1.5" fill="currentColor" />
						</svg>
					</div>
					<div class="steam-title">
						<div class="steam-title-main">
							{{ isConnected ? '已连接 Steam' : '正在连接 Steam' }}
						</div>
						<div class="steam-title-sub">{{ statusText }}</div>
					</div>
				</div>

				<div v-if="isConnected && user" class="steam-user-info">
					<div class="steam-avatar-wrapper">
						<UserAvatar :src="user.avatarUrl" size="lg" status="online" />
					</div>
					<div class="steam-user-details">
						<div class="steam-user-name">{{ user.displayName }}</div>
						<div class="steam-user-id">
							{{ user.platformId ? `SteamID: ${user.platformId}` : '' }}
						</div>
					</div>
				</div>

				<div v-else-if="!isConnected" class="steam-loading">
					<div class="steam-spinner">
						<div class="steam-spinner-ring"></div>
					</div>
					<div class="steam-loading-text">正在与 Steam 客户端建立连接...</div>
				</div>

				<div v-if="isConnected" class="steam-actions">
					<button class="steam-btn steam-btn-primary" @click="closeOverlay">开始使用</button>
				</div>

				<div v-if="error" class="steam-error">
					<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8" />
						<path
							d="M12 8v4M12 16h.01"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
						/>
					</svg>
					<span>{{ error }}</span>
				</div>

				<div class="steam-footer">
					<span class="steam-hint">按 Shift+Tab 可随时打开 Steam 面板</span>
				</div>

				<div class="card-corner-decoration top-left" aria-hidden="true"></div>
				<div class="card-corner-decoration top-right" aria-hidden="true"></div>
				<div class="card-corner-decoration bottom-left" aria-hidden="true"></div>
				<div class="card-corner-decoration bottom-right" aria-hidden="true"></div>
			</div>
		</div>
	</Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSquareParticles } from '../../composables/useSquareParticles'
import { UserAvatar } from '../User'

interface Props {
	visible: boolean
	isConnecting: boolean
	isConnected: boolean
	user: {
		displayName: string
		platformId?: string
		steamId?: string
		avatarUrl?: string | null
	} | null
	error?: string | null
	autoDismiss?: boolean
}

const props = withDefaults(defineProps<Props>(), {
	autoDismiss: true,
	error: null,
	user: null
})

const emit = defineEmits<{
	(e: 'close'): void
}>()

const { particles } = useSquareParticles({ count: 14, seed: 123, baseOpacity: 0.35 })

const statusText = computed(() => {
	if (props.error) return '连接失败'
	if (props.isConnected) return '欢迎回来！'
	if (props.isConnecting) return '请稍候...'
	return ''
})

function handleBackdropClick() {
	if (props.isConnected) {
		emit('close')
	}
}

function closeOverlay() {
	emit('close')
}
</script>

<style scoped>
@import '../../styles/square-particles.css';

.steam-entry-overlay {
	position: fixed;
	inset: 0;
	z-index: 10000;
	display: flex;
	align-items: center;
	justify-content: center;
}

.steam-entry-backdrop {
	position: absolute;
	inset: 0;
	background: rgba(0, 0, 0, 0.75);
	backdrop-filter: blur(6px);
	-webkit-backdrop-filter: blur(6px);
}

.steam-entry-card {
	position: relative;
	width: 440px;
	max-width: 90vw;
	background: color-mix(in srgb, var(--theme-bg-secondary, #1e1e1e) 96%, transparent);
	border: 2px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 30%, transparent);
	padding: 32px;
	box-shadow:
		0 24px 80px rgba(0, 0, 0, 0.7),
		0 0 100px color-mix(in srgb, var(--theme-accent, #1f9d84) 10%, transparent),
		inset 0 0 0 1px color-mix(in srgb, var(--theme-accent, #1f9d84) 5%, transparent);
	animation: steam-card-pulse 2.5s ease-in-out infinite;
	overflow: hidden;
	border-radius: 0;
}

.steam-entry-card.is-connected {
	animation: none;
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 60%, transparent);
	box-shadow:
		0 24px 80px rgba(0, 0, 0, 0.7),
		0 0 120px color-mix(in srgb, var(--theme-accent, #1f9d84) 18%, transparent),
		0 0 40px color-mix(in srgb, var(--theme-accent, #1f9d84) 8%, transparent),
		inset 0 0 0 1px color-mix(in srgb, var(--theme-accent, #1f9d84) 12%, transparent);
}

.card-particles {
	position: absolute;
	inset: 0;
	pointer-events: none;
	overflow: hidden;
	opacity: 0.5;
	z-index: 0;
}

.card-corner-decoration {
	position: absolute;
	width: 16px;
	height: 16px;
	border: 2px solid var(--theme-accent, #1f9d84);
	opacity: 0.6;
}

.card-corner-decoration.top-left {
	top: 6px;
	left: 6px;
	border-right: none;
	border-bottom: none;
}

.card-corner-decoration.top-right {
	top: 6px;
	right: 6px;
	border-left: none;
	border-bottom: none;
}

.card-corner-decoration.bottom-left {
	bottom: 6px;
	left: 6px;
	border-right: none;
	border-top: none;
}

.card-corner-decoration.bottom-right {
	bottom: 6px;
	right: 6px;
	border-left: none;
	border-top: none;
}

@keyframes steam-card-pulse {
	0%,
	100% {
		border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 25%, transparent);
		box-shadow:
			0 24px 80px rgba(0, 0, 0, 0.7),
			0 0 100px color-mix(in srgb, var(--theme-accent, #1f9d84) 8%, transparent);
	}
	50% {
		border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 50%, transparent);
		box-shadow:
			0 24px 80px rgba(0, 0, 0, 0.7),
			0 0 130px color-mix(in srgb, var(--theme-accent, #1f9d84) 20%, transparent),
			0 0 50px color-mix(in srgb, var(--theme-accent, #1f9d84) 10%, transparent);
	}
}

.steam-entry-header {
	position: relative;
	z-index: 1;
	display: flex;
	align-items: center;
	gap: 16px;
	margin-bottom: 24px;
}

.steam-logo {
	width: 56px;
	height: 56px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(
		135deg,
		var(--theme-accent, #1f9d84) 0%,
		var(--pl-cold, #3aa8b4) 100%
	);
	color: white;
	flex-shrink: 0;
	border: 2px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 60%, transparent);
	box-shadow:
		0 0 20px color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent),
		inset 0 0 12px color-mix(in srgb, white 15%, transparent);
	border-radius: 0;
}

.steam-logo svg {
	width: 30px;
	height: 30px;
}

.steam-title {
	flex: 1;
}

.steam-title-main {
	font-size: 20px;
	font-weight: 700;
	color: var(--theme-text-primary, #d4d4d4);
	letter-spacing: 0.5px;
	margin-bottom: 4px;
}

.steam-title-sub {
	font-size: 12px;
	color: var(--theme-text-muted, #6e6e6e);
	text-transform: uppercase;
	letter-spacing: 0.08em;
}

.steam-entry-card.is-connected .steam-title-sub {
	color: var(--theme-accent, #1f9d84);
}

.steam-loading {
	position: relative;
	z-index: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 32px 0;
	gap: 20px;
}

.steam-spinner {
	width: 56px;
	height: 56px;
	position: relative;
}

.steam-spinner-ring {
	width: 56px;
	height: 56px;
	border: 3px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 12%, transparent);
	border-top-color: var(--theme-accent, #1f9d84);
	border-right-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent);
	animation: steam-spin 0.9s linear infinite;
	border-radius: 0;
}

@keyframes steam-spin {
	to {
		transform: rotate(360deg);
	}
}

.steam-loading-text {
	font-size: 13px;
	color: var(--theme-accent, #1f9d84);
	letter-spacing: 0.03em;
}

.steam-user-info {
	position: relative;
	z-index: 1;
	display: flex;
	align-items: center;
	gap: 16px;
	padding: 20px;
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 5%, transparent);
	border: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 25%, transparent);
	margin-bottom: 24px;
	border-radius: 0;
}

.steam-avatar-wrapper {
	position: relative;
	flex-shrink: 0;
}

.steam-user-details {
	flex: 1;
	min-width: 0;
}

.steam-user-name {
	font-size: 18px;
	font-weight: 600;
	color: var(--theme-text-primary, #d4d4d4);
	margin-bottom: 6px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	letter-spacing: 0.02em;
}

.steam-user-id {
	font-size: 11px;
	color: var(--theme-text-muted, #6e6e6e);
	font-family: monospace;
	letter-spacing: 0.04em;
}

.steam-actions {
	position: relative;
	z-index: 1;
	display: flex;
	flex-direction: column;
	gap: 10px;
	margin-bottom: 20px;
}

.steam-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 10px;
	padding: 14px 24px;
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
	border: 2px solid transparent;
	transition: all 180ms ease;
	appearance: none;
	-webkit-appearance: none;
	letter-spacing: 0.03em;
	border-radius: 0;
}

.steam-btn svg {
	width: 18px;
	height: 18px;
}

.steam-btn-primary {
	background: linear-gradient(
		135deg,
		var(--theme-accent, #1f9d84) 0%,
		var(--pl-cold, #3aa8b4) 100%
	);
	color: white;
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 70%, transparent);
	box-shadow: 0 0 20px color-mix(in srgb, var(--theme-accent, #1f9d84) 25%, transparent);
}

.steam-btn-primary:hover {
	background: linear-gradient(135deg, var(--theme-accent-hover, #27b99c) 0%, #4fb7c5 100%);
	transform: translateY(-2px);
	box-shadow:
		0 8px 28px color-mix(in srgb, var(--theme-accent, #1f9d84) 35%, transparent),
		0 0 30px color-mix(in srgb, var(--theme-accent, #1f9d84) 20%, transparent);
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 90%, transparent);
}

.steam-btn-primary:active {
	transform: translateY(0);
}

.steam-btn-secondary {
	background: color-mix(in srgb, var(--theme-text-primary, #d4d4d4) 4%, transparent);
	color: var(--theme-text-secondary, #a0a0a0);
	border-color: color-mix(in srgb, var(--theme-text-primary, #d4d4d4) 12%, transparent);
}

.steam-btn-secondary:hover {
	background: color-mix(in srgb, var(--theme-text-primary, #d4d4d4) 8%, transparent);
	color: var(--theme-text-primary, #d4d4d4);
	border-color: color-mix(in srgb, var(--theme-text-primary, #d4d4d4) 25%, transparent);
}

.steam-error {
	position: relative;
	z-index: 1;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 14px 16px;
	background: var(--theme-error-bg, rgba(241, 76, 76, 0.1));
	border: 1px solid color-mix(in srgb, var(--theme-error, #f14c4c) 35%, transparent);
	color: var(--theme-error, #f14c4c);
	font-size: 13px;
	margin-bottom: 16px;
	border-radius: 0;
}

.steam-error svg {
	width: 20px;
	height: 20px;
	flex-shrink: 0;
}

.steam-footer {
	position: relative;
	z-index: 1;
	text-align: center;
	padding-top: 4px;
	border-top: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 12%, transparent);
	padding-top: 14px;
}

.steam-hint {
	font-size: 11px;
	color: var(--theme-text-muted, #6e6e6e);
	letter-spacing: 0.04em;
}

/* Transitions */
.steam-overlay-enter-active,
.steam-overlay-leave-active {
	transition: all 320ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.steam-overlay-enter-from .steam-entry-backdrop,
.steam-overlay-leave-to .steam-entry-backdrop {
	opacity: 0;
}

.steam-overlay-enter-from .steam-entry-card,
.steam-overlay-leave-to .steam-entry-card {
	opacity: 0;
	transform: scale(0.9) translateY(20px);
}

.steam-overlay-enter-active .steam-entry-card {
	transition-delay: 80ms;
}
</style>
