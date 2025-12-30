<template>
	<div class="vs-handle line start" :style="handleStyles.start" @pointerdown.stop.prevent="(e) => emit('pointDown', 'start', e)" />
	<div class="vs-handle line anchor" :style="handleStyles.anchor" @pointerdown.stop.prevent="(e) => emit('pointDown', 'anchor', e)" />
	<div class="vs-handle line end" :style="handleStyles.end" @pointerdown.stop.prevent="(e) => emit('pointDown', 'end', e)" />
</template>

<script setup lang="ts">
export type LinePointKind = 'start' | 'end' | 'anchor'

defineProps<{
	handleStyles: {
		start: Record<string, string>
		end: Record<string, string>
		anchor: Record<string, string>
	}
}>()

const emit = defineEmits<{ (e: 'pointDown', kind: LinePointKind, ev: PointerEvent): void }>()
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
}

.vs-handle.line {
	cursor: grab;
}

.vs-handle.line:active {
	cursor: grabbing;
}
</style>
