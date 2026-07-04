<template>
	<Transition name="twp-fade">
		<div v-if="visible" class="theme-warmup-progress">
			<div class="twp-icon">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
					<circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2" class="twp-spin" />
				</svg>
			</div>
			<div class="twp-body">
				<div class="twp-title">{{ displayTitle }}</div>
				<div class="twp-bar">
					<div class="twp-bar-fill" :style="{ width: `${Math.round(progress * 100)}%` }"></div>
				</div>
				<div class="twp-detail">{{ detail }}</div>
			</div>
		</div>
	</Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../../../i18n'

interface Props {
	visible: boolean
	title?: string
	detail?: string
	progress?: number
}

const props = withDefaults(defineProps<Props>(), {
	title: '',
	detail: '',
	progress: 0
})

const { t } = useI18n()

const displayTitle = computed(() => props.title || t('aiworkflow.page.themeWarmup.title', { theme: t('aiworkflow.page.themeWarmup.darkLabel') }))
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
	background: var(--bg-overlay, rgba(30, 34, 42, 0.92));
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	border: 1px solid var(--border-secondary, rgba(120, 130, 150, 0.25));
	border-radius: 10px;
	box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
	min-width: 220px;
	max-width: 320px;
	pointer-events: none;
	color: var(--text-primary, #e4e7ed);
	font-size: 12px;
}

.twp-icon {
	flex-shrink: 0;
	width: 16px;
	height: 16px;
	margin-top: 2px;
	color: var(--accent, #1f9d84);
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
	color: var(--text-primary, #e4e7ed);
	font-size: 12px;
}

.twp-bar {
	width: 100%;
	height: 3px;
	background: var(--bg-tertiary, rgba(255, 255, 255, 0.08));
	border-radius: 2px;
	overflow: hidden;
	margin-bottom: 4px;
}

.twp-bar-fill {
	height: 100%;
	background: linear-gradient(90deg, var(--accent, #1f9d84), var(--accent-light, #2fc9aa));
	border-radius: 2px;
	transition: width 150ms ease-out;
}

.twp-detail {
	font-size: 11px;
	color: var(--text-secondary, #8892a6);
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

:global([data-theme="light"]) .theme-warmup-progress {
	background: var(--bg-overlay, rgba(255, 255, 255, 0.94));
	border-color: var(--border-secondary, rgba(0, 0, 0, 0.08));
	color: var(--text-primary, #1d2129);
	box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

:global([data-theme="light"]) .twp-title {
	color: var(--text-primary, #1d2129);
}

:global([data-theme="light"]) .twp-detail {
	color: var(--text-secondary, #6b7785);
}

:global([data-theme="light"]) .twp-bar {
	background: var(--bg-tertiary, rgba(0, 0, 0, 0.06));
}
</style>
