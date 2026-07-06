<template>
	<div class="steam-user-card" v-if="user">
		<div class="user-avatar-wrapper">
			<div v-if="user.avatarUrl" class="user-avatar" :style="{ backgroundImage: `url(${user.avatarUrl})` }"></div>
			<div v-else class="user-avatar user-avatar-placeholder">
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8" />
					<path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
				</svg>
			</div>
			<SteamStatusBadge v-if="status" class="avatar-status" :status="status" />
		</div>
		<div class="user-info">
			<div class="user-name">{{ user.displayName }}</div>
			<div class="user-id" v-if="user.steamId">{{ t('steam.steamId', { id: user.steamId }) }}</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { DwebPlatformUser } from '../../platformBridge/types'
import { useI18n } from '../../i18n'
import SteamStatusBadge from './SteamStatusBadge.vue'

interface Props {
	user: DwebPlatformUser | null
	status?: 'online' | 'away' | 'busy' | 'snooze' | 'looking-to-trade' | 'looking-to-play' | 'offline' | 'in-game'
}

withDefaults(defineProps<Props>(), {
	status: 'online',
})

const { t } = useI18n()
</script>

<style scoped>
.steam-user-card {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 16px;
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 8%, transparent);
	border: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 22%, transparent);
}

.user-avatar-wrapper {
	position: relative;
	width: 52px;
	height: 52px;
	flex-shrink: 0;
}

.user-avatar {
	width: 52px;
	height: 52px;
	border-radius: 2px;
	background-size: cover;
	background-position: center;
	background-color: var(--theme-bg-tertiary, #23272e);
	border: 2px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 50%, transparent);
	box-shadow: 0 0 12px color-mix(in srgb, var(--theme-accent, #1f9d84) 20%, transparent);
}

.user-avatar-placeholder {
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--theme-accent, #1f9d84);
}

.user-avatar-placeholder svg {
	width: 26px;
	height: 26px;
}

.avatar-status {
	position: absolute;
	bottom: 1px;
	right: 1px;
}

.avatar-status .badge-dot {
	width: 12px;
	height: 12px;
	border-width: 2px;
	border-color: var(--theme-bg-primary, #181818);
}

.user-info {
	flex: 1;
	min-width: 0;
}

.user-name {
	font-size: 15px;
	font-weight: 600;
	color: var(--theme-text-primary, #d4d4d4);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	letter-spacing: 0.01em;
}

.user-id {
	font-size: 11px;
	color: var(--theme-text-muted, #6e6e6e);
	font-family: monospace;
	margin-top: 3px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
</style>
