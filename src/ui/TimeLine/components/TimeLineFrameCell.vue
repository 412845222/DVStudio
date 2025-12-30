<template>
	<div
		class="tl-frame"
		:class="{ active, selected, keyframe, between, joinLeft, joinRight }"
		:style="{ left: left + 'px', width: width + 'px' }"
		@pointerdown.stop.prevent="onPointerDown"
		@dblclick.stop.prevent="onDblClick"
		@contextmenu.stop.prevent="onContextMenu"
	>
		<div v-if="keyframe" class="tl-keyframe-dot" />
		<div v-if="easing && between" class="tl-easing-line" />
		<div v-if="easingArrow && between" class="tl-easing-arrow" />
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	layerId: string
	frameIndex: number
	left: number
	width: number
	active: boolean
	selected: boolean
	keyframe: boolean
	between: boolean
	joinLeft: boolean
	joinRight: boolean
	easing: boolean
	easingArrow: boolean
}>()

const emit = defineEmits<{
	(e: 'pointerdown', payload: { layerId: string; frameIndex: number; ev: PointerEvent }): void
	(e: 'dblclick', payload: { layerId: string; frameIndex: number; ev: MouseEvent }): void
	(e: 'contextmenu', payload: { layerId: string; frameIndex: number; clientX: number; clientY: number }): void
}>()

const onPointerDown = (ev: PointerEvent) => {
	emit('pointerdown', { layerId: props.layerId, frameIndex: props.frameIndex, ev })
}

const onDblClick = (ev: MouseEvent) => {
	emit('dblclick', { layerId: props.layerId, frameIndex: props.frameIndex, ev })
}

const onContextMenu = (ev: MouseEvent) => {
	emit('contextmenu', { layerId: props.layerId, frameIndex: props.frameIndex, clientX: ev.clientX, clientY: ev.clientY })
}
</script>

<style scoped>
.tl-frame {
	position: absolute;
	top: 0;
	bottom: 0;
	z-index: 2;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-light);
	border-radius: 0; /* 不要圆角 */
	box-sizing: border-box;
	cursor: pointer;
}

/* 两个关键帧之间的普通帧：合并样式（连续段） */
.tl-frame.between {
	background: color-mix(in srgb, var(--dweb-red) 14%, transparent);
	border-color: color-mix(in srgb, var(--dweb-red) 55%, transparent);
}

/* 合并段内部不显示分隔线（但选中时仍保留选中边框提示） */
.tl-frame.between.joinLeft {
	border-left-color: transparent;
}

.tl-frame.between.joinRight {
	border-right-color: transparent;
}

.tl-frame:hover {
	background: var(--vscode-hover-bg);
}

.tl-frame:active {
	background: var(--vscode-hover-bg);
}

.tl-frame.active {
	/* 仅表示“指针线所在帧”，不代表选择 */
	background: color-mix(in srgb, var(--dweb-orange) 22%, transparent);
	border-color: var(--dweb-orange);
}

.tl-frame.selected {
	/* 选中态更淡，避免刺眼 */
	background: rgba(255, 255, 255, 0.06);
	border-color: var(--vscode-border-accent);
}

.tl-frame.active.selected {
	/* 指针位置仅影响“内部填充”，边框仍保持选中态 */
	background: color-mix(in srgb, var(--dweb-orange) 22%, transparent);
}

.tl-frame.keyframe {
	background: color-mix(in srgb, var(--dweb-red) 36%, transparent);
	border-color: var(--dweb-red);
}

.tl-frame.keyframe.selected {
	/* 关键帧也要体现“选中态”：边框跟普通选中一致 */
	border-color: var(--vscode-border-accent);
}

.tl-keyframe-dot {
	position: absolute;
	left: 50%;
	top: 50%;
	width: 6px;
	height: 6px;
	transform: translate(-50%, -50%);
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.9);
	border: 1px solid rgba(0, 0, 0, 0.25);
	box-sizing: border-box;
	pointer-events: none;
}

.tl-easing-line {
	position: absolute;
	left: 0;
	right: 0;
	top: 50%;
	height: 1px;
	transform: translateY(-50%);
	background: rgba(255, 255, 255, 0.65);
	pointer-events: none;
}

.tl-easing-arrow {
	position: absolute;
	right: 2px;
	top: 50%;
	width: 0;
	height: 0;
	transform: translateY(-50%);
	border-top: 4px solid transparent;
	border-bottom: 4px solid transparent;
	border-left: 6px solid rgba(255, 255, 255, 0.65);
	pointer-events: none;
}
</style>
