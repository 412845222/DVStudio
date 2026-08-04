<template>
	<div
		v-if="visible"
		ref="menuEl"
		class="bp-ctx-menu"
		:style="menuStyle"
		@contextmenu.prevent
		@pointerdown.stop
	>
		<button class="bp-ctx-item" type="button" :disabled="!canUndo" @click="emit('undo')">
			<span class="label">撤销</span>
			<span class="shortcut">Ctrl+Z</span>
		</button>
		<button class="bp-ctx-item" type="button" :disabled="!canRedo" @click="emit('redo')">
			<span class="label">重做</span>
			<span class="shortcut">Ctrl+Y</span>
		</button>
		<div class="bp-ctx-sep" />
		<button class="bp-ctx-item" type="button" :disabled="!canCut" @click="emit('cut')">
			<span class="label">剪切</span>
			<span class="shortcut">Ctrl+X</span>
		</button>
		<button class="bp-ctx-item" type="button" :disabled="!canCopy" @click="emit('copy')">
			<span class="label">复制</span>
			<span class="shortcut">Ctrl+C</span>
		</button>
		<button class="bp-ctx-item" type="button" :disabled="!canPaste" @click="emit('paste')">
			<span class="label">粘贴</span>
			<span class="shortcut">Ctrl+V</span>
		</button>
		<button class="bp-ctx-item" type="button" :disabled="!canDuplicate" @click="emit('duplicate')">
			<span class="label">克隆</span>
			<span class="shortcut">Ctrl+D</span>
		</button>
		<div class="bp-ctx-sep" />
		<button class="bp-ctx-item" type="button" :disabled="!canSelectAll" @click="emit('select-all')">
			<span class="label">全选</span>
			<span class="shortcut">Ctrl+A</span>
		</button>
		<div class="bp-ctx-sep" />
		<button class="bp-ctx-item danger" type="button" :disabled="!canDelete" @click="emit('delete')">
			<span class="label">删除</span>
			<span class="shortcut">Del</span>
		</button>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
	visible: boolean
	x: number
	y: number
	canUndo: boolean
	canRedo: boolean
	canCut: boolean
	canCopy: boolean
	canPaste: boolean
	canDuplicate: boolean
	canDelete: boolean
	canSelectAll: boolean
}>()

const emit = defineEmits<{
	(e: 'undo'): void
	(e: 'redo'): void
	(e: 'cut'): void
	(e: 'copy'): void
	(e: 'paste'): void
	(e: 'duplicate'): void
	(e: 'delete'): void
	(e: 'select-all'): void
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

	if (menuW.value > 0 && vw > 0 && left + menuW.value + margin > vw) {
		left = Math.max(margin, vw - menuW.value - margin)
	}
	if (menuH.value > 0 && vh > 0 && top + menuH.value + margin > vh) {
		top = Math.max(margin, top - menuH.value)
	}
	left = Math.max(margin, left)
	top = Math.max(margin, top)

	return {
		left: left + 'px',
		top: top + 'px'
	}
})

watch(
	() => [props.visible, props.x, props.y] as const,
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
	window.removeEventListener('resize', onWindowResize as (e: Event) => void)
})
</script>

<style scoped>
.bp-ctx-menu {
	position: fixed;
	z-index: 10000;
	min-width: 180px;
	padding: 4px;
	border: 1px solid rgba(31, 157, 132, 0.35);
	border-radius: 6px;
	background: rgba(26, 31, 37, 0.96);
	backdrop-filter: blur(12px);
	box-shadow:
		0 0 0 1px rgba(31, 157, 132, 0.12),
		0 8px 24px rgba(0, 0, 0, 0.5),
		0 0 16px rgba(31, 157, 132, 0.14);
	font-family:
		system-ui,
		-apple-system,
		sans-serif;
	user-select: none;
}

.bp-ctx-item {
	width: 100%;
	height: 30px;
	padding: 0 12px;
	border: 0;
	border-radius: 4px;
	background: transparent;
	color: #edf2f4;
	font-size: 12px;
	text-align: left;
	cursor: pointer;
	transition:
		background 0.12s ease,
		color 0.12s ease;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
}

.bp-ctx-item .label {
	flex: 1;
}

.bp-ctx-item .shortcut {
	font-size: 11px;
	color: #6b7a82;
}

.bp-ctx-item:hover {
	background: rgba(31, 157, 132, 0.15);
	color: #edf2f4;
}

.bp-ctx-item:hover .shortcut {
	color: #aeb8bd;
}

.bp-ctx-item.danger:hover {
	background: rgba(231, 76, 60, 0.25);
	color: #e74c3c;
}

.bp-ctx-item:disabled {
	opacity: 0.35;
	cursor: not-allowed;
}

.bp-ctx-item:disabled:hover {
	background: transparent;
	color: #edf2f4;
}

.bp-ctx-item:disabled:hover .shortcut {
	color: #6b7a82;
}

.bp-ctx-item.danger:disabled:hover {
	color: #edf2f4;
}

.bp-ctx-sep {
	height: 1px;
	margin: 4px 6px;
	background: rgba(31, 157, 132, 0.2);
}
</style>
