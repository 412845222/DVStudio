<template>
	<button
		class="user-button"
		:class="{
			'is-collapsed': collapsed,
			'is-logged-in': isLoggedIn,
			'is-connecting': isConnecting,
			'is-mock': !isRealPlatform,
			'is-active': menuOpen,
		}"
		type="button"
		@click="handleClick"
		:title="buttonTitle"
	>
		<UserAvatar
			:src="user?.avatarUrl"
			:size="collapsed ? 'sm' : 'md'"
			:status="avatarStatus"
			:no-border="collapsed"
		/>
		<span v-if="!collapsed" class="user-label">
			<span class="user-name">{{ displayName }}</span>
			<span class="user-status-text">{{ statusText }}</span>
		</span>
		<span v-if="!collapsed" class="user-menu-indicator">
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</span>
	</button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DwebPlatformUser } from '../../platformBridge/types'
import UserAvatar from './UserAvatar.vue'
import { useI18n } from '../../i18n'

const { t } = useI18n()

interface Props {
	collapsed?: boolean
	isLoggedIn: boolean
	isRealPlatform: boolean
	isConnecting?: boolean
	user: DwebPlatformUser | null
	menuOpen?: boolean
}

const props = withDefaults(defineProps<Props>(), {
	collapsed: false,
	isConnecting: false,
	menuOpen: false,
})

const emit = defineEmits<{
	(e: 'click'): void
}>()

const avatarStatus = computed<'online' | 'offline' | 'connecting' | undefined>(() => {
	if (!props.isRealPlatform) return undefined
	if (props.isConnecting) return 'connecting'
	if (props.isLoggedIn) return 'online'
	return 'offline'
})

const displayName = computed(() => {
	if (!props.isRealPlatform) return t('steam.userButton.notConnected')
	if (props.isConnecting) return t('steam.userButton.connecting')
	if (props.isLoggedIn && props.user) return props.user.displayName
	return t('steam.userButton.notLoggedIn')
})

const statusText = computed(() => {
	if (!props.isRealPlatform) return t('steam.userButton.mockMode')
	if (props.isConnecting) return 'Steam'
	if (props.isLoggedIn) return t('steam.userButton.online')
	return t('steam.userButton.offline')
})

const buttonTitle = computed(() => {
	if (!props.isRealPlatform) return t('steam.userButton.titleNotConnected')
	if (props.isConnecting) return t('steam.userButton.titleConnecting')
	if (props.isLoggedIn && props.user) return t('steam.userButton.titleLoggedIn', { name: props.user.displayName })
	return t('steam.userButton.titleOpenMenu')
})

function handleClick(e: MouseEvent) {
	e.stopPropagation()
	emit('click')
}
</script>

<style scoped>
.user-button {
	position: relative;
	z-index: 1;
	box-sizing: border-box;
	appearance: none;
	-webkit-appearance: none;
	width: 100%;
	min-height: 48px;
	flex: 0 0 auto;
	border: 1px solid transparent;
	background: transparent;
	color: var(--theme-text-secondary, #a0a0a0);
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0;
	padding: 6px;
	margin: 0;
	cursor: pointer;
	overflow: hidden;
	transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, color 160ms ease;
	border-radius: 0;
}

.user-button:not(.is-collapsed) {
	justify-content: flex-start;
	padding: 8px 10px;
	gap: 10px;
	margin-top: 4px;
}

.user-button:not(.is-collapsed):hover {
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 10%, transparent);
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 35%, transparent);
	color: var(--theme-accent, #1f9d84);
}

.user-button:not(.is-collapsed).is-active,
.user-button:not(.is-collapsed).is-logged-in {
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 25%, transparent);
}

.user-button:not(.is-collapsed).is-active:hover,
.user-button:not(.is-collapsed).is-logged-in:hover {
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 55%, transparent);
	box-shadow: 0 0 14px color-mix(in srgb, var(--theme-accent, #1f9d84) 25%, transparent);
}

.user-button.is-mock {
	opacity: 0.5;
	cursor: pointer;
}

.user-button:not(.is-collapsed).is-mock:hover {
	background: color-mix(in srgb, var(--theme-text-muted, #6e6e6e) 8%, transparent);
	border-color: color-mix(in srgb, var(--theme-text-muted, #6e6e6e) 25%, transparent);
	color: var(--theme-text-muted, #6e6e6e);
	box-shadow: none;
}

.user-button.is-connecting {
	border-color: color-mix(in srgb, var(--theme-warning, #cca700) 30%, transparent);
}

.user-button:not(.is-collapsed).is-connecting:hover {
	border-color: color-mix(in srgb, var(--theme-warning, #cca700) 45%, transparent);
	box-shadow: 0 0 10px color-mix(in srgb, var(--theme-warning, #cca700) 20%, transparent);
	color: var(--theme-warning, #cca700);
}

.user-label {
	display: flex;
	flex-direction: column;
	min-width: 0;
	flex: 1;
	gap: 2px;
}

.user-name {
	font-size: 12px;
	font-weight: 600;
	color: inherit;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	line-height: 1.3;
}

.user-status-text {
	font-size: 10px;
	color: var(--theme-text-muted, #6e6e6e);
	text-transform: uppercase;
	letter-spacing: 0.04em;
	line-height: 1.2;
}

.user-button.is-logged-in .user-status-text {
	color: var(--theme-accent, #1f9d84);
}

.user-button.is-connecting .user-status-text {
	color: var(--theme-warning, #cca700);
}

.user-button.is-mock .user-status-text {
	color: var(--theme-text-muted, #6e6e6e);
}

.user-menu-indicator {
	width: 14px;
	height: 14px;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	opacity: 0.5;
	transition: transform 160ms ease, opacity 160ms ease;
}

.user-button.is-active .user-menu-indicator {
	transform: rotate(180deg);
	opacity: 1;
}

.user-menu-indicator svg {
	width: 12px;
	height: 12px;
}

.user-button.is-collapsed {
	display: flex;
	justify-content: center;
	align-items: center;
	padding: 8px 0;
	min-height: unset;
	height: auto;
	width: 100%;
	border: none !important;
	background: transparent !important;
	box-shadow: none !important;
}

.user-button.is-collapsed:hover,
.user-button.is-collapsed:active,
.user-button.is-collapsed.is-logged-in,
.user-button.is-collapsed.is-active,
.user-button.is-collapsed.is-connecting,
.user-button.is-collapsed.is-mock {
	border: none !important;
	background: transparent !important;
	box-shadow: none !important;
	color: inherit;
}
</style>
