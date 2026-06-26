<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

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
				<div class="title">{{ title || '命令行输出' }}</div>
				<div v-if="props.statusText" class="status">{{ props.statusText }}</div>
			</div>
			<div class="actions">
				<button class="btn" type="button" @click="emit('copy')">复制</button>
				<button class="btn" type="button" @click="emit('clear')">清空</button>
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
	border: 1px solid var(--vscode-border);
	border-radius: 8px;
	background: var(--dweb-defualt-light);
	overflow: hidden;
}

.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding: 10px 12px;
	border-bottom: 1px solid var(--vscode-border);
}

.title {
	color: var(--vscode-fg);
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
	color: var(--vscode-fg-muted);
	font-size: 11px;
}

.actions {
	display: flex;
	gap: 8px;
}

.btn {
	appearance: none;
	-webkit-appearance: none;
	border: none;
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	border-radius: 0;
	padding: 6px 10px;
	font-size: 12px;
	cursor: pointer;
	box-shadow: none;
}

.btn:hover {
	background: var(--dweb-defualt);
	box-shadow: var(--dweb-shadow);
}

.btn:focus-visible {
	outline: none;
	box-shadow: var(--dweb-shadow);
}

.console {
	flex: 1;
	min-height: 0;
	margin: 0;
	padding: 10px 12px;
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	overflow: auto;
	white-space: pre-wrap;
	word-break: break-word;
	font-size: 12px;
	line-height: 1.35;
}
</style>
