<template>
	<div class="vs-handle tl" :style="handleStyles.tl" @pointerdown.stop.prevent="(e) => emit('handleDown', 'tl', e)" />
	<div class="vs-handle tr" :style="handleStyles.tr" @pointerdown.stop.prevent="(e) => emit('handleDown', 'tr', e)" />
	<div class="vs-handle bl" :style="handleStyles.bl" @pointerdown.stop.prevent="(e) => emit('handleDown', 'bl', e)" />
	<div class="vs-handle br" :style="handleStyles.br" @pointerdown.stop.prevent="(e) => emit('handleDown', 'br', e)" />
	<div v-if="showSize" class="vs-size" :style="sizeStyle">{{ sizeText }}</div>
</template>

<script setup lang="ts">
export type Corner = 'tl' | 'tr' | 'bl' | 'br'

defineProps<{
	handleStyles: {
		tl: Record<string, string>
		tr: Record<string, string>
		bl: Record<string, string>
		br: Record<string, string>
	}
	showSize: boolean
	sizeText: string
	sizeStyle: Record<string, string>
}>()

const emit = defineEmits<{ (e: 'handleDown', corner: Corner, ev: PointerEvent): void }>()
</script>

<style scoped>
.vs-handle {
	position: absolute;
	width: 10px;
	height: 10px;
	border-radius: 50%;
	background: var(--dweb-defualt-dark);
	border: 2px solid var(--vscode-border-accent);
	transform: translate(-50%, -50%);
	pointer-events: auto;
	cursor: nwse-resize;
}

.vs-handle.tr,
.vs-handle.bl {
	cursor: nesw-resize;
}

.vs-size {
	position: absolute;
	padding: 2px 6px;
	border-radius: 8px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	font-size: 12px;
	line-height: 16px;
	pointer-events: none;
}
</style>
