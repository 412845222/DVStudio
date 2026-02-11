<template>
	<div class="chat-dock" :class="{ expanded: expanded }" @mouseenter="expanded = true" @mouseleave="onLeave">
		<div class="chat-dock-bar" aria-hidden="true">
			<div class="chat-dock-title">AI 对话</div>
			<div class="chat-dock-hint">悬停展开</div>
		</div>

		<div class="chat-dock-body">
			<textarea
				:value="modelValue"
				class="chat-dock-input"
				rows="3"
				placeholder="在这里输入需求，后续会驱动工作流生成…"
				@focus="expanded = true"
				@input="onInput"
			/>
			<button class="chat-dock-send" type="button" @click="emit('send')">发送</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ modelValue: string }>()

const emit = defineEmits<{
	(e: 'update:modelValue', v: string): void
	(e: 'send'): void
}>()

const expanded = ref(false)

const onLeave = (e: MouseEvent) => {
	const el = e.currentTarget as HTMLElement
	// 如果正在输入（focus 在内部），不收起
	if (el.contains(document.activeElement)) return
	expanded.value = false
}

const onInput = (e: Event) => {
	const v = (e.target as HTMLTextAreaElement).value
	emit('update:modelValue', v)
}
</script>

<style scoped>
.chat-dock {
	position: absolute;
	left: 50%;
	bottom: 16px;
	transform: translateX(-50%);
	width: min(920px, calc(100% - 48px));
	border: 1px solid var(--vscode-border-accent);
	background: var(--dweb-defualt);
	box-shadow: var(--dweb-shadow);
	border-radius: 0;
	overflow: hidden;
	transition: border-color 160ms ease;
}

.chat-dock:hover {
	border-color: var(--vscode-hover-border);
}

.chat-dock-bar {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 8px 10px;
	border-bottom: 1px solid var(--vscode-border);
}

.chat-dock-title {
	font-size: 12px;
	color: var(--vscode-fg);
}

.chat-dock-hint {
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.chat-dock-body {
	display: grid;
	grid-template-columns: 1fr 96px;
	gap: 10px;
	padding: 10px;
	max-height: 0;
	opacity: 0;
	overflow: hidden;
	transition: max-height 180ms ease, opacity 160ms ease;
}

.chat-dock.expanded .chat-dock-body,
.chat-dock:focus-within .chat-dock-body {
	max-height: 220px;
	opacity: 1;
}

.chat-dock-input {
	resize: none;
	width: 100%;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	padding: 10px 12px;
	outline: none;
	border-radius: 0;
}

.chat-dock-input:focus {
	border-color: var(--vscode-border-accent);
}

.chat-dock-send {
	border: 1px solid var(--vscode-border-accent);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	cursor: pointer;
	border-radius: 0;
}

.chat-dock-send:hover {
	background: var(--vscode-hover-bg);
}
</style>
