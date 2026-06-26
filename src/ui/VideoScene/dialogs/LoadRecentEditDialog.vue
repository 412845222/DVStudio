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
	background: rgba(0, 0, 0, 0.35);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 50;
}

.dvs-recent-dialog {
	width: 420px;
	max-width: calc(100% - 32px);
	background: var(--dweb-defualt);
	border: 1px solid var(--vscode-border);
	border-radius: 12px;
	padding: 14px;
}

.dvs-recent-title {
	font-size: 14px;
	font-weight: 600;
	color: var(--vscode-fg);
}

.dvs-recent-desc {
	margin-top: 10px;
	font-size: 13px;
	color: var(--vscode-fg);
}

.dvs-recent-meta {
	margin-top: 8px;
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.dvs-recent-actions {
	margin-top: 14px;
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}
</style>
