<template>
	<Transition name="twp-fade">
		<div v-if="visible" class="theme-warmup-progress">
			<div class="twp-icon">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
					<circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2" class="twp-spin" />
				</svg>
			</div>
			<div class="twp-body">
				<div class="twp-title">{{ title }}</div>
				<div class="twp-bar">
					<div class="twp-bar-fill" :style="{ width: `${Math.round(progress * 100)}%` }"></div>
				</div>
				<div class="twp-detail">{{ detail }}</div>
			</div>
		</div>
	</Transition>
</template>

<script setup lang="ts">
interface Props {
	visible: boolean
	title?: string
	detail?: string
	progress?: number
}

withDefaults(defineProps<Props>(), {
	title: '主题预热中',
	detail: '',
	progress: 0
})
</script>

<style scoped>
.theme-warmup-progress {
	position: fixed;
	bottom: 20px;
	left: 20px;
	z-index: 9999;
	display: flex;
	align-items: flex-start;
	gap: 10px;
	padding: 12px 16px;
	background: var(--theme-bg-elevated);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	border: 1px solid var(--theme-border-subtle);
	border-radius: 10px;
	box-shadow: var(--theme-shadow-elevated);
	min-width: 220px;
	max-width: 320px;
	pointer-events: none;
	color: var(--theme-text-primary);
	font-size: 12px;
}

.twp-icon {
	flex-shrink: 0;
	width: 16px;
	height: 16px;
	margin-top: 2px;
	color: var(--theme-accent);
}

.twp-spin {
	animation: twp-spin-anim 1s linear infinite;
	transform-origin: center;
}

@keyframes twp-spin-anim {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}

.twp-body {
	flex: 1;
	min-width: 0;
}

.twp-title {
	font-weight: 500;
	margin-bottom: 6px;
	color: var(--theme-text-primary);
	font-size: 12px;
}

.twp-bar {
	width: 100%;
	height: 3px;
	background: var(--theme-bg-tertiary);
	border-radius: 2px;
	overflow: hidden;
	margin-bottom: 4px;
}

.twp-bar-fill {
	height: 100%;
	background: linear-gradient(90deg, var(--theme-accent), var(--theme-accent-hover));
	border-radius: 2px;
	transition: width 150ms ease-out;
}

.twp-detail {
	font-size: 11px;
	color: var(--theme-text-secondary);
	line-height: 1.4;
	word-break: break-word;
}

.twp-fade-enter-active,
.twp-fade-leave-active {
	transition: opacity 200ms ease, transform 200ms ease;
}

.twp-fade-enter-from,
.twp-fade-leave-to {
	opacity: 0;
	transform: translateY(8px);
}
</style>
