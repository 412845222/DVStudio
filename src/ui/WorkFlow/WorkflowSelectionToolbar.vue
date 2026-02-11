<template>
	<div v-if="visible" class="wf-toolbar">
		<button class="wf-toolbar-btn" type="button" @click="emit('copy')">复制</button>
		<button class="wf-toolbar-btn" type="button" @click="emit('paste')">粘贴</button>
		<button class="wf-toolbar-btn" type="button" @click="emit('delete')">删除</button>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{ visible: boolean }>()

const emit = defineEmits<{
	(e: 'copy'): void
	(e: 'paste'): void
	(e: 'delete'): void
}>()
</script>

<style scoped>
.wf-toolbar {
	position: absolute;
	top: 16px;
	left: 50%;
	transform: translateX(-50%);
	display: flex;
	gap: 8px;
	padding: 6px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	box-shadow: var(--vscode-shadow);
}

.wf-toolbar-btn {
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	padding: 6px 10px;
	cursor: pointer;
}

.wf-toolbar-btn:hover {
	border-color: var(--vscode-hover-border);
	background: var(--vscode-hover-bg);
}
</style>
