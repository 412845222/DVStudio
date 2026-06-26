<template>
	<div class="steam-friends-list">
		<div class="friends-section" v-if="onlineFriends.length > 0">
			<div class="section-header">
				<span class="section-dot online"></span>
				<span class="section-label">在线好友 ({{ onlineFriends.length }})</span>
			</div>
			<div class="friends-items">
				<div
					v-for="friend in onlineFriends"
					:key="friend.id"
					class="friend-item"
					:class="`status-${friend.status}`"
				>
					<div class="friend-avatar-wrapper">
						<UserAvatar
							:src="friend.avatarUrl"
							size="sm"
							:status="friend.status === 'in-game' || friend.status === 'online' ? 'online' : friend.status === 'offline' ? 'offline' : undefined"
						/>
						<SteamStatusBadge v-if="friend.status === 'in-game'" :status="friend.status" class="friend-status-badge" />
					</div>
					<div class="friend-info">
						<div class="friend-name">{{ friend.name }}</div>
						<div class="friend-status-text">
							{{ friend.gameName || getStatusText(friend.status) }}
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="friends-section" v-if="offlineFriends.length > 0">
			<div class="section-header">
				<span class="section-dot offline"></span>
				<span class="section-label">离线好友 ({{ offlineFriends.length }})</span>
			</div>
			<div class="friends-items">
				<div
					v-for="friend in offlineFriends"
					:key="friend.id"
					class="friend-item status-offline"
				>
					<div class="friend-avatar-wrapper">
						<UserAvatar :src="friend.avatarUrl" size="sm" status="offline" />
					</div>
					<div class="friend-info">
						<div class="friend-name">{{ friend.name }}</div>
						<div class="friend-status-text">离线</div>
					</div>
				</div>
			</div>
		</div>

		<div v-if="onlineFriends.length === 0 && offlineFriends.length === 0" class="friends-empty">
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
				<circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/>
				<path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
				<path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			<span>暂无好友数据</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { UserAvatar } from '../User'
import SteamStatusBadge from './SteamStatusBadge.vue'

type FriendStatus = 'online' | 'away' | 'busy' | 'snooze' | 'looking-to-trade' | 'looking-to-play' | 'offline' | 'in-game'

interface Friend {
	id: string
	name: string
	status: FriendStatus
	avatarUrl?: string
	gameName?: string
}

interface Props {
	friends?: Friend[]
}

const props = withDefaults(defineProps<Props>(), {
	friends: () => [
		{ id: '1', name: 'Gaben', status: 'in-game' as FriendStatus, gameName: 'SpaceWar' },
		{ id: '2', name: 'Steam用户_A7x3K', status: 'online' as FriendStatus },
		{ id: '3', name: 'DwebStudio', status: 'away' as FriendStatus },
		{ id: '4', name: 'Player_8821', status: 'offline' as FriendStatus },
		{ id: '5', name: 'GamerPro99', status: 'offline' as FriendStatus },
	],
})

const onlineFriends = computed(() => props.friends.filter(f => f.status !== 'offline'))
const offlineFriends = computed(() => props.friends.filter(f => f.status === 'offline'))

function getStatusText(status: FriendStatus): string {
	const labels: Record<FriendStatus, string> = {
		'online': '在线',
		'away': '离开',
		'busy': '忙碌',
		'snooze': '打盹',
		'looking-to-trade': '想交易',
		'looking-to-play': '想玩游戏',
		'offline': '离线',
		'in-game': '游戏中',
	}
	return labels[status] || '未知'
}
</script>

<style scoped>
.steam-friends-list {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.friends-section {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.section-header {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 0 4px;
}

.section-dot {
	width: 8px;
	height: 8px;
	flex-shrink: 0;
	border-radius: 0;
}

.section-dot.online {
	background: var(--theme-accent, #1f9d84);
	box-shadow: 0 0 8px color-mix(in srgb, var(--theme-accent, #1f9d84) 60%, transparent);
}

.section-dot.offline {
	background: var(--theme-text-muted, #6e6e6e);
}

.section-label {
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: var(--theme-text-muted, #6e6e6e);
}

.friends-items {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.friend-item {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 10px;
	background: transparent;
	border: 1px solid transparent;
	transition: all 160ms ease;
	cursor: pointer;
	border-radius: 0;
}

.friend-item:hover {
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 8%, transparent);
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 30%, transparent);
}

.friend-item.status-offline {
	opacity: 0.45;
}

.friend-item.status-offline:hover {
	opacity: 0.75;
}

.friend-avatar-wrapper {
	position: relative;
	flex-shrink: 0;
}

.friend-status-badge {
	position: absolute;
	bottom: -3px;
	right: -3px;
	z-index: 1;
}

.friend-info {
	flex: 1;
	min-width: 0;
}

.friend-name {
	font-size: 12.5px;
	font-weight: 500;
	color: var(--theme-text-primary, #d4d4d4);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.friend-item.status-offline .friend-name {
	color: var(--theme-text-muted, #6e6e6e);
}

.friend-status-text {
	font-size: 11px;
	color: var(--theme-text-muted, #6e6e6e);
	margin-top: 1px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.friend-item.status-in-game .friend-status-text {
	color: var(--pl-cold, #3aa8b4);
}

.friend-item.status-online .friend-status-text {
	color: var(--theme-accent, #1f9d84);
}

.friends-empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 28px;
	color: var(--theme-text-muted, #6e6e6e);
}

.friends-empty svg {
	width: 40px;
	height: 40px;
	opacity: 0.5;
}

.friends-empty span {
	font-size: 12px;
	letter-spacing: 0.02em;
}
</style>
