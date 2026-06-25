<template>
	<Transition name="steam-overlay">
		<div v-if="visible" class="steam-entry-overlay">
			<div class="steam-entry-backdrop" @click="handleBackdropClick"></div>
			<div class="steam-entry-card" :class="{ 'is-connected': isConnected }">
				<div class="steam-entry-header">
					<div class="steam-logo">
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" />
							<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2" />
							<circle cx="12" cy="12" r="1.5" fill="currentColor" />
							<path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
						</svg>
					</div>
					<div class="steam-title">
						<div class="steam-title-main">{{ isConnected ? '已连接 Steam' : '正在连接 Steam' }}</div>
						<div class="steam-title-sub">{{ statusText }}</div>
					</div>
				</div>

				<div v-if="isConnected && user" class="steam-user-info">
					<div class="steam-avatar-wrapper">
						<div v-if="user.avatarUrl" class="steam-avatar" :style="{ backgroundImage: `url(${user.avatarUrl})` }"></div>
						<div v-else class="steam-avatar steam-avatar-placeholder">
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2" />
								<path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</div>
						<div class="steam-avatar-status online"></div>
					</div>
					<div class="steam-user-details">
						<div class="steam-user-name">{{ user.displayName }}</div>
						<div class="steam-user-id">SteamID: {{ user.steamId || 'Unknown' }}</div>
					</div>
				</div>

				<div v-else-if="!isConnected" class="steam-loading">
					<div class="steam-spinner">
						<div class="steam-spinner-ring"></div>
					</div>
					<div class="steam-loading-text">正在与 Steam 客户端建立连接...</div>
				</div>

				<div v-if="isConnected" class="steam-actions">
					<button class="steam-btn steam-btn-primary" @click="openOverlay">
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2" />
							<path d="M9 9h6v6H9z" stroke="currentColor" stroke-width="2" />
						</svg>
						打开 Steam Overlay
					</button>
					<button class="steam-btn steam-btn-secondary" @click="closeOverlay">
						开始使用
					</button>
				</div>

				<div v-if="error" class="steam-error">
					<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" />
						<path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
					</svg>
					<span>{{ error }}</span>
				</div>

				<div class="steam-footer">
					<span class="steam-hint">按 Shift+Tab 可随时唤出 Steam Overlay</span>
				</div>
			</div>
		</div>
	</Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
	visible: boolean
	isConnecting: boolean
	isConnected: boolean
	user: {
		displayName: string
		steamId?: string
		avatarUrl?: string | null
	} | null
	error?: string | null
	autoDismiss?: boolean
}

const props = withDefaults(defineProps<Props>(), {
	autoDismiss: true,
	error: null,
	user: null,
})

const emit = defineEmits<{
	(e: 'close'): void
	(e: 'open-overlay'): void
}>()

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

function openOverlay() {
	emit('open-overlay')
}
</script>

<style scoped>
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
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
}

.steam-entry-card {
	position: relative;
	width: 420px;
	max-width: 90vw;
	background: linear-gradient(145deg, #1b2838 0%, #16202d 100%);
	border: 1px solid rgba(102, 192, 244, 0.3);
	border-radius: 16px;
	padding: 32px;
	box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 80px rgba(102, 192, 244, 0.15);
	animation: steam-card-pulse 2s ease-in-out infinite;
}

.steam-entry-card.is-connected {
	animation: none;
	border-color: rgba(102, 192, 244, 0.6);
	box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 100px rgba(102, 192, 244, 0.25);
}

@keyframes steam-card-pulse {
	0%, 100% {
		border-color: rgba(102, 192, 244, 0.3);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 80px rgba(102, 192, 244, 0.15);
	}
	50% {
		border-color: rgba(102, 192, 244, 0.5);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 100px rgba(102, 192, 244, 0.3);
	}
}

.steam-entry-header {
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
	background: linear-gradient(135deg, #66c0f4 0%, #417a9b 100%);
	border-radius: 14px;
	color: white;
	flex-shrink: 0;
}

.steam-logo svg {
	width: 32px;
	height: 32px;
}

.steam-title {
	flex: 1;
}

.steam-title-main {
	font-size: 22px;
	font-weight: 700;
	color: #ffffff;
	letter-spacing: 0.3px;
	margin-bottom: 4px;
}

.steam-title-sub {
	font-size: 14px;
	color: #8f98a0;
}

.steam-loading {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 32px 0;
	gap: 20px;
}

.steam-spinner {
	width: 64px;
	height: 64px;
	position: relative;
}

.steam-spinner-ring {
	width: 64px;
	height: 64px;
	border: 3px solid rgba(102, 192, 244, 0.2);
	border-top-color: #66c0f4;
	border-radius: 50%;
	animation: steam-spin 1s linear infinite;
}

@keyframes steam-spin {
	to {
		transform: rotate(360deg);
	}
}

.steam-loading-text {
	font-size: 14px;
	color: #66c0f4;
}

.steam-user-info {
	display: flex;
	align-items: center;
	gap: 16px;
	padding: 20px;
	background: rgba(102, 192, 244, 0.08);
	border-radius: 12px;
	margin-bottom: 24px;
	border: 1px solid rgba(102, 192, 244, 0.15);
}

.steam-avatar-wrapper {
	position: relative;
	width: 64px;
	height: 64px;
	flex-shrink: 0;
}

.steam-avatar {
	width: 64px;
	height: 64px;
	border-radius: 50%;
	background-size: cover;
	background-position: center;
	background-color: #2a475e;
	border: 3px solid #66c0f4;
}

.steam-avatar-placeholder {
	display: flex;
	align-items: center;
	justify-content: center;
	color: #66c0f4;
}

.steam-avatar-placeholder svg {
	width: 32px;
	height: 32px;
}

.steam-avatar-status {
	position: absolute;
	bottom: 2px;
	right: 2px;
	width: 16px;
	height: 16px;
	border-radius: 50%;
	border: 3px solid #1b2838;
}

.steam-avatar-status.online {
	background: #57cbde;
	box-shadow: 0 0 8px rgba(87, 203, 222, 0.6);
}

.steam-user-details {
	flex: 1;
	min-width: 0;
}

.steam-user-name {
	font-size: 18px;
	font-weight: 600;
	color: #ffffff;
	margin-bottom: 4px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.steam-user-id {
	font-size: 12px;
	color: #8f98a0;
	font-family: monospace;
}

.steam-actions {
	display: flex;
	flex-direction: column;
	gap: 12px;
	margin-bottom: 20px;
}

.steam-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 10px;
	padding: 14px 24px;
	border-radius: 10px;
	font-size: 15px;
	font-weight: 600;
	cursor: pointer;
	border: none;
	transition: all 0.2s ease;
}

.steam-btn svg {
	width: 20px;
	height: 20px;
}

.steam-btn-primary {
	background: linear-gradient(135deg, #66c0f4 0%, #417a9b 100%);
	color: white;
}

.steam-btn-primary:hover {
	background: linear-gradient(135deg, #7fcbf7 0%, #4d8fb5 100%);
	transform: translateY(-1px);
	box-shadow: 0 6px 20px rgba(102, 192, 244, 0.3);
}

.steam-btn-secondary {
	background: rgba(255, 255, 255, 0.08);
	color: #c7d5e0;
	border: 1px solid rgba(255, 255, 255, 0.1);
}

.steam-btn-secondary:hover {
	background: rgba(255, 255, 255, 0.12);
	color: #ffffff;
}

.steam-error {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 12px 16px;
	background: rgba(255, 82, 82, 0.1);
	border: 1px solid rgba(255, 82, 82, 0.3);
	border-radius: 8px;
	margin-bottom: 16px;
	color: #ff5252;
	font-size: 14px;
}

.steam-error svg {
	width: 20px;
	height: 20px;
	flex-shrink: 0;
}

.steam-footer {
	text-align: center;
}

.steam-hint {
	font-size: 12px;
	color: #5a6b7b;
}

/* Transitions */
.steam-overlay-enter-active,
.steam-overlay-leave-active {
	transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
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
</style>
