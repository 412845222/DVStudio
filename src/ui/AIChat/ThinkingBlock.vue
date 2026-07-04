<template>
	<div class="thinking-block" :class="{ 'is-thinking': isThinking, 'is-collapsed': collapsed }">
		<button
			class="thinking-block__header"
			type="button"
			@click="toggleCollapsed"
		>
			<span class="thinking-block__icon">
				<svg v-if="isThinking" class="thinking-block__spinner" viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="30 70" stroke-linecap="round" />
				</svg>
				<span v-else class="thinking-block__icon-text">💭</span>
			</span>
			<span class="thinking-block__title">
				{{ isThinking ? t('aichat.thinking.thinking') : t('aichat.thinking.process') }}
			</span>
			<span class="thinking-block__toggle">
				<svg viewBox="0 0 24 24" aria-hidden="true" :class="{ 'expanded': !collapsed }">
					<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</span>
		</button>
		<div v-show="!collapsed" class="thinking-block__content">
			<div v-if="!content && isThinking" class="thinking-block__empty">
				<span class="thinking-block__typing">
					<span class="thinking-block__typing-dot" />
					<span class="thinking-block__typing-dot" />
					<span class="thinking-block__typing-dot" />
				</span>
			</div>
			<pre v-else class="thinking-block__text">{{ content }}</pre>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from '../../i18n'

const { t } = useI18n()

interface Props {
	content?: string
	isThinking?: boolean
	defaultCollapsed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
	content: '',
	isThinking: false,
	defaultCollapsed: true,
})

const collapsed = ref(props.defaultCollapsed)

const toggleCollapsed = () => {
	collapsed.value = !collapsed.value
}

watch(() => props.isThinking, (val) => {
	if (val) {
		collapsed.value = false
	}
})

watch(() => props.defaultCollapsed, (val) => {
	if (!props.isThinking) {
		collapsed.value = val
	}
}, { immediate: true })
</script>

<style scoped>
.thinking-block {
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent);
	border-radius: 4px;
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 40%, transparent);
	overflow: hidden;
	transition: opacity 200ms ease;
}

.thinking-block.is-thinking {
	opacity: 1;
}

.thinking-block.is-collapsed {
	opacity: 0.85;
}

.thinking-block__header {
	width: 100%;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 10px;
	border: none;
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 8%, transparent);
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 90%, var(--wf-text, #edf2f4));
	font-size: 11px;
	cursor: pointer;
	transition: background-color 150ms ease;
	text-align: left;
}

.thinking-block__header:hover {
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 14%, transparent);
}

.thinking-block__icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 14px;
	height: 14px;
	flex-shrink: 0;
}

.thinking-block__icon-text {
	font-size: 11px;
	line-height: 1;
}

.thinking-block__spinner {
	width: 12px;
	height: 12px;
	animation: thinking-spin 1s linear infinite;
	opacity: 0.8;
}

@keyframes thinking-spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}

.thinking-block__title {
	flex: 1;
	font-weight: 500;
}

.thinking-block__toggle {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 14px;
	height: 14px;
	color: currentColor;
	opacity: 0.7;
	transition: transform 200ms ease;
	flex-shrink: 0;
}

.thinking-block__toggle svg {
	width: 12px;
	height: 12px;
	transition: transform 200ms ease;
}

.thinking-block__toggle svg.expanded {
	transform: rotate(180deg);
}

.thinking-block__content {
	padding: 8px 10px;
	max-height: 200px;
	overflow-y: auto;
	border-top: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 12%, transparent);
}

.thinking-block__empty {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 4px 0;
}

.thinking-block__typing {
	display: inline-flex;
	gap: 3px;
}

.thinking-block__typing-dot {
	width: 5px;
	height: 5px;
	border-radius: 50%;
	background: var(--wf-primary, #1f9d84);
	opacity: 0.4;
	animation: thinking-typing 1.4s ease-in-out infinite;
}

.thinking-block__typing-dot:nth-child(2) {
	animation-delay: 0.2s;
}

.thinking-block__typing-dot:nth-child(3) {
	animation-delay: 0.4s;
}

@keyframes thinking-typing {
	0%, 60%, 100% {
		opacity: 0.3;
		transform: translateY(0);
	}
	30% {
		opacity: 1;
		transform: translateY(-2px);
	}
}

.thinking-block__text {
	margin: 0;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 11px;
	line-height: 1.6;
	color: color-mix(in srgb, var(--wf-text-muted, #9ca3af) 90%, var(--wf-primary, #1f9d84));
	white-space: pre-wrap;
	word-break: break-word;
}
</style>
