<template>
	<div
		class="vs-handle tl"
		:style="handleStyles.tl"
		@pointerdown.stop.prevent="(ev) => onHandleDown('tl', ev)"
	/>
	<div
		class="vs-handle tr"
		:style="handleStyles.tr"
		@pointerdown.stop.prevent="(ev) => onHandleDown('tr', ev)"
	/>
	<div
		class="vs-handle bl"
		:style="handleStyles.bl"
		@pointerdown.stop.prevent="(ev) => onHandleDown('bl', ev)"
	/>
	<div
		class="vs-handle br"
		:style="handleStyles.br"
		@pointerdown.stop.prevent="(ev) => onHandleDown('br', ev)"
	/>
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

const onHandleDown = (corner: Corner, ev: PointerEvent) => {
	emit('handleDown', corner, ev)
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
	cursor: nwse-resize;
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

.vs-handle.tr,
.vs-handle.bl {
	cursor: nesw-resize;
}

.vs-size {
	position: absolute;
	padding: 2px 8px;
	border-radius: 2px;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 40%, transparent);
	background: color-mix(in srgb, var(--pl-bg-1) 85%, rgba(0, 0, 0, 0.6));
	color: var(--pl-accent);
	font-size: 11px;
	line-height: 16px;
	pointer-events: none;
	font-family: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace;
	text-shadow: 0 0 6px color-mix(in srgb, var(--pl-accent) 50%, transparent);
	box-shadow: 0 0 8px color-mix(in srgb, var(--pl-accent) 20%, transparent);
}
</style>
