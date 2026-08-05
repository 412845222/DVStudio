<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from '../../i18n'

const { t } = useI18n()

const props = defineProps<{
	title?: string
	statusText?: string
	lines: string[]
}>()

const emit = defineEmits<{
	(e: 'copy'): void
	(e: 'clear'): void
}>()

const preRef = ref<HTMLElement | null>(null)
const text = computed(() => props.lines.join('\n'))

watch(
	() => props.lines.length,
	async () => {
		await nextTick()
		const el = preRef.value
		if (!el) return
		el.scrollTop = el.scrollHeight
	}
)
</script>

<template>
	<div class="panel">
		<div class="header">
			<div class="title-wrap">
				<div class="title">{{ title || t('console.defaultTitle') }}</div>
				<div v-if="props.statusText" class="status">{{ props.statusText }}</div>
			</div>
			<div class="actions">
				<button class="btn" type="button" @click="emit('copy')">{{ t('common.copy') }}</button>
				<button class="btn" type="button" @click="emit('clear')">{{ t('common.clear') }}</button>
			</div>
		</div>
		<pre ref="preRef" class="console">{{ text }}</pre>
	</div>
</template>

<style scoped>
.panel {
	height: 100%;
	display: flex;
	flex-direction: column;
	border: 1px solid var(--theme-border);
	border-radius: 8px;
	background: var(--theme-bg-secondary);
	overflow: hidden;
}

.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding: 10px 12px;
	border-bottom: 1px solid var(--theme-border);
}

.title {
	color: var(--theme-text-primary);
	font-size: 13px;
	font-weight: 600;
}

.title-wrap {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.status {
	margin-top: 2px;
	color: var(--theme-text-muted);
	font-size: 11px;
}

.actions {
	display: flex;
	gap: 8px;
}

.btn {
	appearance: none;
	-webkit-appearance: none;
	border: 1px solid var(--theme-border);
	background: var(--theme-bg-tertiary);
	color: var(--theme-text-primary);
	border-radius: 6px;
	padding: 5px 12px;
	font-size: 12px;
	cursor: pointer;
	transition:
		background 120ms ease,
		border-color 120ms ease;
}

.btn:hover {
	background: var(--theme-hover-bg);
	border-color: var(--theme-accent);
}

.btn:focus-visible {
	outline: none;
	box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-accent) 25%, transparent);
}

.console {
	flex: 1;
	min-height: 0;
	margin: 0;
	padding: 10px 12px;
	background: var(--theme-bg-tertiary);
	color: var(--theme-text-primary);
	overflow: auto;
	white-space: pre-wrap;
	word-break: break-word;
	font-size: 12px;
	line-height: 1.45;
	font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
}
</style>
