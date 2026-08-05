<template>
	<div
		class="vs-handle line start"
		:style="handleStyles.start"
		@pointerdown.stop.prevent="(ev) => onPointDown('start', ev)"
	/>
	<div
		class="vs-handle line anchor"
		:style="handleStyles.anchor"
		@pointerdown.stop.prevent="(ev) => onPointDown('anchor', ev)"
	/>
	<div
		class="vs-handle line end"
		:style="handleStyles.end"
		@pointerdown.stop.prevent="(ev) => onPointDown('end', ev)"
	/>
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

const onPointDown = (kind: LinePointKind, ev: PointerEvent) => {
	emit('pointDown', kind, ev)
}
</script>

<style scoped>
.vs-handle {
	position: absolute;
	width: 12px;
	height: 12px;
	border-radius: 50%;
	background: color-mix(in srgb, var(--pl-bg-1) 80%, rgba(0, 0, 0, 0.6));
	border: 2px solid var(--pl-accent);
	transform: translate(-50%, -50%);
	pointer-events: auto;
	touch-action: none;
	z-index: 10;
	box-shadow: 0 0 6px color-mix(in srgb, var(--pl-accent) 50%, transparent);
	transition:
		box-shadow 0.15s ease,
		transform 0.1s ease;
}

.vs-handle:hover {
	box-shadow:
		0 0 12px color-mix(in srgb, var(--pl-accent) 80%, transparent),
		0 0 4px color-mix(in srgb, var(--pl-accent) 100%, transparent);
	transform: translate(-50%, -50%) scale(1.2);
}

.vs-handle.line {
	cursor: grab;
}

.vs-handle.line:active {
	cursor: grabbing;
}
</style>
