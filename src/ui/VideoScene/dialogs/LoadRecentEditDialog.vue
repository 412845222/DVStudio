<template>
	<div v-if="open" class="dvs-recent-overlay">
		<div class="dvs-recent-dialog" role="dialog" aria-modal="true">
			<div class="dvs-recent-title">加载最近编辑历史</div>
			<div class="dvs-recent-desc">查询到有最近的编辑历史，是否加载？</div>
			<div v-if="savedAt" class="dvs-recent-meta">保存时间：{{ savedAtText }}</div>

			<div class="dvs-recent-actions">
				<button class="vs-btn" type="button" @click="$emit('load')">是，加载</button>
				<button class="vs-btn" type="button" @click="$emit('discard')">否，清空</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ open: boolean; savedAt: number | null }>()

defineEmits<{
	(e: 'load'): void
	(e: 'discard'): void
}>()

const savedAtText = computed(() => {
	const ts = Number(props.savedAt ?? 0)
	if (!(ts > 0)) return ''
	try {
		return new Date(ts).toLocaleString()
	} catch {
		return String(ts)
	}
})
</script>

<style scoped>
.dvs-recent-overlay {
	position: absolute;
	inset: 0;
	background: color-mix(in srgb, var(--pl-bg-0) 75%, rgba(0, 0, 0, 0.6));
	backdrop-filter: blur(4px);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 50;
}

.dvs-recent-dialog {
	width: 420px;
	max-width: calc(100% - 32px);
	background: color-mix(in srgb, var(--pl-bg-1) 96%, rgba(0, 0, 0, 0.4));
	border: 1px solid color-mix(in srgb, var(--pl-accent) 32%, transparent);
	border-radius: 4px;
	padding: 16px 18px;
	box-shadow:
		0 16px 48px rgba(0, 0, 0, 0.6),
		0 0 28px color-mix(in srgb, var(--pl-accent) 14%, transparent);
	position: relative;
	overflow: hidden;
}

.dvs-recent-dialog::before,
.dvs-recent-dialog::after {
	content: '';
	position: absolute;
	width: 14px;
	height: 14px;
	border: 1px solid var(--pl-accent);
	pointer-events: none;
}

.dvs-recent-dialog::before {
	top: -1px;
	left: -1px;
	border-right: none;
	border-bottom: none;
}

.dvs-recent-dialog::after {
	bottom: -1px;
	right: -1px;
	border-left: none;
	border-top: none;
}

.dvs-recent-title {
	font-size: 14px;
	font-weight: 500;
	color: var(--pl-fg);
	letter-spacing: 0.5px;
	text-shadow: 0 0 10px color-mix(in srgb, var(--pl-accent) 40%, transparent);
}

.dvs-recent-desc {
	margin-top: 10px;
	font-size: 13px;
	color: var(--pl-fg);
	line-height: 1.5;
	letter-spacing: 0.3px;
}

.dvs-recent-meta {
	margin-top: 8px;
	font-size: 12px;
	color: color-mix(in srgb, var(--pl-fg) 60%, transparent);
	font-family: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace;
}

.dvs-recent-actions {
	margin-top: 16px;
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}

.dvs-recent-actions .vs-btn {
	border-radius: 2px;
	border: 1px solid var(--pl-accent);
	background: color-mix(in srgb, var(--pl-accent) 12%, transparent);
	color: var(--pl-fg);
	padding: 6px 14px;
	font-size: 12px;
	letter-spacing: 0.3px;
	cursor: pointer;
	transition:
		border-color 0.15s ease,
		background 0.15s ease,
		box-shadow 0.15s ease;
}

.dvs-recent-actions .vs-btn:hover {
	background: color-mix(in srgb, var(--pl-accent) 22%, transparent);
	box-shadow:
		0 0 12px color-mix(in srgb, var(--pl-accent) 35%, transparent),
		inset 0 0 8px color-mix(in srgb, var(--pl-accent) 8%, transparent);
}
</style>
