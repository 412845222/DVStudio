<template>
	<span class="steam-status-badge" :class="statusClass" :title="statusLabel">
		<span class="badge-dot"></span>
	</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type SteamStatus = 'online' | 'away' | 'busy' | 'snooze' | 'looking-to-trade' | 'looking-to-play' | 'offline' | 'in-game'

interface Props {
	status?: SteamStatus
}

const props = withDefaults(defineProps<Props>(), {
	status: 'offline',
})

const statusClass = computed(() => `status-${props.status}`)

const statusLabel = computed(() => {
	const labels: Record<SteamStatus, string> = {
		'online': '在线',
		'away': '离开',
		'busy': '忙碌',
		'snooze': '打盹',
		'looking-to-trade': '想交易',
		'looking-to-play': '想玩游戏',
		'offline': '离线',
		'in-game': '游戏中',
	}
	return labels[props.status] || '未知'
})
</script>

<style scoped>
.steam-status-badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}

.badge-dot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
	background: var(--theme-text-muted, #6e6e6e);
	border: 2px solid var(--theme-bg-primary, #181818);
	transition: background 200ms ease, box-shadow 200ms ease;
}

.status-online .badge-dot {
	background: var(--theme-accent, #1f9d84);
	box-shadow: 0 0 8px color-mix(in srgb, var(--theme-accent, #1f9d84) 60%, transparent);
}

.status-in-game .badge-dot {
	background: var(--pl-cold, #3aa8b4);
	box-shadow: 0 0 8px color-mix(in srgb, var(--pl-cold, #3aa8b4) 60%, transparent);
}

.status-away .badge-dot,
.status-snooze .badge-dot {
	background: var(--theme-warning, #cca700);
	box-shadow: 0 0 6px color-mix(in srgb, var(--theme-warning, #cca700) 50%, transparent);
}

.status-busy .badge-dot,
.status-looking-to-trade .badge-dot,
.status-looking-to-play .badge-dot {
	background: var(--theme-warning, #cca700);
}

.status-offline .badge-dot {
	background: var(--theme-text-muted, #6e6e6e);
	box-shadow: none;
}
</style>
