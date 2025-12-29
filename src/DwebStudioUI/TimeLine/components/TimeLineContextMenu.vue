<template>
	<div v-if="visible" ref="menuEl" class="tl-menu" :style="menuStyle" @contextmenu.prevent>
		<button class="tl-menu-item" type="button" :disabled="!canAddKeyframe" @click="emit('add-keyframe')">设置关键帧</button>
		<button class="tl-menu-item" type="button" :disabled="!canRemoveKeyframe" @click="emit('remove-keyframe')">取消关键帧</button>
		<div class="tl-menu-sep" />
		<button class="tl-menu-item" type="button" :disabled="!canCopy" @click="emit('copy')">复制帧</button>
		<button class="tl-menu-item" type="button" :disabled="!canPaste" @click="emit('paste')">粘贴帧</button>
		<div class="tl-menu-sep" />
		<button class="tl-menu-item" type="button" :disabled="!canEnableEasing" @click="emit('enable-easing')">开启缓动效果</button>
		<button class="tl-menu-item" type="button" :disabled="!canDisableEasing" @click="emit('disable-easing')">关闭缓动效果</button>
		<button class="tl-menu-item" type="button" :disabled="!canEditEasingCurve" @click="emit('edit-easing-curve')">编辑缓动曲线</button>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
	visible: boolean
	x: number
	y: number
	canAddKeyframe: boolean
	canRemoveKeyframe: boolean
	canCopy: boolean
	canPaste: boolean
	canEnableEasing: boolean
	canDisableEasing: boolean
	canEditEasingCurve: boolean
}>()

const emit = defineEmits<{
	(e: 'add-keyframe'): void
	(e: 'remove-keyframe'): void
	(e: 'copy'): void
	(e: 'paste'): void
	(e: 'enable-easing'): void
	(e: 'disable-easing'): void
	(e: 'edit-easing-curve'): void
}>()

const menuEl = ref<HTMLElement | null>(null)
const menuW = ref(0)
const menuH = ref(0)

const measureMenu = async () => {
	await nextTick()
	const el = menuEl.value
	if (!el) return
	menuW.value = Math.max(0, Math.ceil(el.offsetWidth))
	menuH.value = Math.max(0, Math.ceil(el.offsetHeight))
}

const menuStyle = computed(() => {
	const margin = 8
	const vw = typeof window !== 'undefined' ? window.innerWidth : 0
	const vh = typeof window !== 'undefined' ? window.innerHeight : 0

	let left = props.x
	let top = props.y

	// 右侧溢出：向左收敛
	if (menuW.value > 0 && vw > 0 && left + menuW.value + margin > vw) {
		left = Math.max(margin, vw - menuW.value - margin)
	}
	// 底部溢出：向上展开
	if (menuH.value > 0 && vh > 0 && top + menuH.value + margin > vh) {
		top = Math.max(margin, top - menuH.value)
	}
	// 兜底 clamp
	left = Math.max(margin, left)
	top = Math.max(margin, top)

	return {
		left: left + 'px',
		top: top + 'px',
	}
})

watch(
	() => [props.visible, props.x, props.y, props.canAddKeyframe, props.canRemoveKeyframe, props.canCopy, props.canPaste, props.canEnableEasing, props.canDisableEasing, props.canEditEasingCurve] as const,
	() => {
		if (!props.visible) return
		measureMenu()
	},
	{ immediate: true }
)

const onWindowResize = () => {
	if (!props.visible) return
	measureMenu()
}

onMounted(() => {
	window.addEventListener('resize', onWindowResize, { passive: true })
})

onBeforeUnmount(() => {
	window.removeEventListener('resize', onWindowResize as any)
})
</script>

<style scoped>
.tl-menu {
	position: fixed;
	z-index: 9999;
	min-width: 160px;
	padding: 6px;
	border: 1px solid var(--vscode-border);
	border-radius: 8px;
	background: var(--dweb-defualt);
	box-shadow: var(--vscode-shadow);
}

.tl-menu-item {
	width: 100%;
	height: 28px;
	padding: 0 10px;
	border: 0;
	border-radius: 6px;
	background: transparent;
	color: var(--vscode-fg);
	font-size: 12px;
	text-align: left;
	cursor: pointer;
}

.tl-menu-item:hover {
	background: var(--vscode-hover-bg);
}

.tl-menu-item:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.tl-menu-item:disabled:hover {
	background: transparent;
}

.tl-menu-sep {
	height: 1px;
	margin: 6px 4px;
	background: var(--vscode-divider);
}
</style>
