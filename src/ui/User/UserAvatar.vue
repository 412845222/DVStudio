<template>
	<div
		class="user-avatar"
		:class="[
			`size-${size}`,
			{ 'has-status': !!status, 'is-placeholder': !src }
		]"
	>
		<div
			v-if="src"
			class="avatar-image"
			:style="{ backgroundImage: `url(${src})` }"
		></div>
		<div v-else class="avatar-placeholder">
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8" />
				<path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
			</svg>
		</div>
		<span v-if="status" class="status-indicator" :class="`status-${status}`"></span>
	</div>
</template>

<script setup lang="ts">
interface Props {
	src?: string | null
	size?: 'sm' | 'md' | 'lg'
	status?: 'online' | 'offline' | 'connecting'
	platform?: 'steam' | 'mock' | 'epic'
}

withDefaults(defineProps<Props>(), {
	size: 'md',
	status: undefined,
	platform: 'steam',
})
</script>

<style scoped>
.user-avatar {
	position: relative;
	display: inline-flex;
	flex-shrink: 0;
}

.avatar-image,
.avatar-placeholder {
	width: 100%;
	height: 100%;
	background-size: cover;
	background-position: center;
	background-color: var(--theme-bg-tertiary, #23272e);
	border: 2px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent);
	box-sizing: border-box;
	border-radius: 0;
}

.avatar-placeholder {
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--theme-text-muted, #6e6e6e);
	border-color: color-mix(in srgb, var(--theme-border, #3c3c3c) 60%, transparent);
}

.user-avatar:not(.is-placeholder) .avatar-image {
	box-shadow: 0 0 10px color-mix(in srgb, var(--theme-accent, #1f9d84) 18%, transparent);
}

.size-sm {
	width: 28px;
	height: 28px;
}

.size-sm .avatar-placeholder svg {
	width: 16px;
	height: 16px;
}

.size-md {
	width: 36px;
	height: 36px;
}

.size-md .avatar-placeholder svg {
	width: 20px;
	height: 20px;
}

.size-lg {
	width: 60px;
	height: 60px;
}

.size-lg .avatar-placeholder svg {
	width: 32px;
	height: 32px;
}

.status-indicator {
	position: absolute;
	bottom: 0;
	right: 0;
	width: 10px;
	height: 10px;
	border: 2px solid var(--theme-bg-primary, #181818);
	box-sizing: border-box;
	border-radius: 0;
}

.status-online {
	background: var(--theme-accent, #1f9d84);
	box-shadow: 0 0 6px color-mix(in srgb, var(--theme-accent, #1f9d84) 60%, transparent);
}

.status-offline {
	background: var(--theme-text-muted, #6e6e6e);
}

.status-connecting {
	background: var(--theme-warning, #cca700);
	box-shadow: 0 0 6px color-mix(in srgb, var(--theme-warning, #cca700) 60%, transparent);
	animation: status-pulse 1s ease-in-out infinite;
}

@keyframes status-pulse {
	0%, 100% { opacity: 1; }
	50% { opacity: 0.5; }
}
</style>
