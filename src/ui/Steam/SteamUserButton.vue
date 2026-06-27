<template>
	<button
		class="steam-user-button"
		:class="{ 'is-collapsed': collapsed, 'is-logged-in': isLoggedIn, 'is-mock': !isRealPlatform }"
		type="button"
		@click="emit('click')"
		:title="isLoggedIn ? user?.displayName || 'Steam 用户' : (isRealPlatform ? 'Steam 未登录' : 'Steam 未连接')"
	>
		<span class="sub-icon" aria-hidden="true">
			<div v-if="isLoggedIn && user?.avatarUrl" class="sub-avatar" :style="{ backgroundImage: `url(${user.avatarUrl})` }"></div>
			<div v-else class="sub-avatar sub-avatar-placeholder">
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" fill="currentColor"/>
				</svg>
			</div>
			<span v-if="isLoggedIn && isRealPlatform" class="sub-status-dot online"></span>
		</span>
		<span v-if="!collapsed" class="sub-label">{{ displayLabel }}</span>
	</button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DwebPlatformUser } from '../../platformBridge/types'

interface Props {
	collapsed?: boolean
	isLoggedIn: boolean
	isRealPlatform: boolean
	user: DwebPlatformUser | null
}

const props = withDefaults(defineProps<Props>(), {
	collapsed: false,
})

const emit = defineEmits<{
	(e: 'click'): void
}>()

const displayLabel = computed(() => {
	if (!props.isRealPlatform) return '未连接'
	if (props.isLoggedIn && props.user) return props.user.displayName
	return '未登录'
})
</script>

<style scoped>
.steam-user-button {
	position: relative;
	z-index: 1;
	box-sizing: border-box;
	appearance: none;
	-webkit-appearance: none;
	width: 100%;
	height: 44px;
	flex: 0 0 44px;
	border: 1px solid transparent;
	background: transparent;
	color: var(--theme-text-secondary, #a0a0a0);
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0;
	padding: 0;
	margin: 0;
	cursor: pointer;
	overflow: hidden;
	transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, color 160ms ease;
	margin-top: auto;
}

.steam-user-button.is-collapsed {
	justify-content: center;
}

.steam-user-button:not(.is-collapsed) {
	justify-content: flex-start;
	padding: 0 10px;
	gap: 10px;
}

.steam-user-button:hover {
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 10%, transparent);
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 35%, transparent);
	color: var(--theme-accent, #1f9d84);
}

.steam-user-button.is-logged-in {
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 25%, transparent);
}

.steam-user-button.is-logged-in:hover {
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 55%, transparent);
	box-shadow: 0 0 10px color-mix(in srgb, var(--theme-accent, #1f9d84) 18%, transparent);
}

.steam-user-button.is-mock {
	opacity: 0.5;
	cursor: default;
}

.steam-user-button.is-mock:hover {
	background: transparent;
	border-color: transparent;
	color: var(--theme-text-muted, #6e6e6e);
	box-shadow: none;
}

.sub-icon {
	width: 32px;
	height: 32px;
	flex: 0 0 32px;
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
}

.sub-avatar {
	width: 32px;
	height: 32px;
	border-radius: 2px;
	background-size: cover;
	background-position: center;
	background-color: var(--theme-bg-tertiary, #23272e);
	border: 2px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent);
}

.sub-avatar-placeholder {
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--theme-text-muted, #6e6e6e);
	border-color: color-mix(in srgb, var(--theme-border, #3c3c3c) 60%, transparent);
}

.steam-user-button:not(.is-mock):hover .sub-avatar-placeholder {
	color: var(--theme-accent, #1f9d84);
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 50%, transparent);
}

.sub-avatar-placeholder svg {
	width: 18px;
	height: 18px;
}

.sub-status-dot {
	position: absolute;
	bottom: 0;
	right: 0;
	width: 10px;
	height: 10px;
	border-radius: 50%;
	border: 2px solid var(--theme-bg-primary, #181818);
}

.sub-status-dot.online {
	background: var(--theme-accent, #1f9d84);
	box-shadow: 0 0 6px color-mix(in srgb, var(--theme-accent, #1f9d84) 60%, transparent);
}

.sub-label {
	max-width: 0;
	opacity: 0;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	transition: max-width 180ms ease, opacity 140ms ease;
	font-size: 12px;
	color: inherit;
	flex: 0 0 auto;
	min-width: 0;
	letter-spacing: 0.02em;
}

.steam-user-button:not(.is-collapsed) .sub-label {
	max-width: 120px;
	opacity: 1;
}
</style>
