<template>
	<div
		v-if="visible"
		ref="menuEl"
		class="ctx-menu"
		:style="style"
		role="menu"
		@pointerdown.stop
	>
		<div v-for="(section, idx) in sections" :key="idx" class="ctx-section">
			<div v-if="section.title" class="ctx-section-title">{{ section.title }}</div>
			<div v-for="item in section.items" :key="item.id" class="ctx-item" :class="itemClass(item)">
				<button class="ctx-button" type="button" :disabled="item.disabled" @click="onClick(item)" @mouseenter="item.children?.length && getSubmenuStyle(item.id, $event)">
					<span class="ctx-label">{{ item.label }}</span>
					<span v-if="item.children?.length" class="ctx-arrow">▶</span>
				</button>
				<div v-if="item.children?.length" class="ctx-submenu" :style="submenuPositions[item.id] ? { left: `${submenuPositions[item.id].x}px`, top: `${submenuPositions[item.id].y}px` } : {}">
					<button
						v-for="child in item.children"
						:key="child.id"
						class="ctx-button"
						:disabled="child.disabled"
						@click="onClick(child)"
					>
						<span class="ctx-label">{{ child.label }}</span>
					</button>
				</div>
			</div>
			<div v-if="idx < sections.length - 1" class="ctx-divider" />
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
export type ContextMenuItem = {
	id: string
	label: string
	disabled?: boolean
	children?: ContextMenuItem[]
}

export type ContextMenuSection = {
	title?: string
	items: ContextMenuItem[]
}

const props = defineProps<{
	visible: boolean
	x: number
	y: number
	sections: ContextMenuSection[]
}>()

const emit = defineEmits<{
	(e: 'select', itemId: string): void
}>()

const menuEl = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })
const submenuPositions = ref<Record<string, { x: number; y: number }>>({})

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
const safeTopInset = () => {
	const raw = getComputedStyle(document.documentElement).getPropertyValue('--aiwf-safe-top')
	const parsed = Number.parseFloat(String(raw || '').trim())
	if (!Number.isFinite(parsed)) return 0
	return Math.max(0, parsed)
}

const updatePosition = async () => {
	if (!props.visible) return
	pos.value = { x: props.x, y: props.y }
	await nextTick()
	const el = menuEl.value
	if (!el) return
	const rect = el.getBoundingClientRect()
	const pad = 8
	const minY = Math.max(pad, Math.round(safeTopInset()) + 4)
	const maxX = Math.max(pad, window.innerWidth - rect.width - pad)
	const maxY = Math.max(minY, window.innerHeight - rect.height - pad)
	pos.value = {
		x: clamp(props.x, pad, maxX),
		y: clamp(props.y, minY, maxY),
	}
}

watch(() => [props.visible, props.x, props.y, props.sections], updatePosition, { deep: true })

const style = computed(() => ({
	left: `${pos.value.x}px`,
	top: `${pos.value.y}px`,
}))

const getSubmenuStyle = (itemId: string, event: MouseEvent) => {
	const target = event.currentTarget as HTMLElement
	if (!target) return {}
	const itemRect = target.getBoundingClientRect()
	const submenuWidth = 180
	const submenuHeight = 280
	const pad = 8
	const safeTop = safeTopInset()

	let x = itemRect.right + pad
	if (x + submenuWidth > window.innerWidth) {
		x = itemRect.left - submenuWidth - pad
	}

	let y = itemRect.top
	if (y + submenuHeight > window.innerHeight) {
		y = Math.max(safeTop + pad, window.innerHeight - submenuHeight - pad)
	}

	submenuPositions.value[itemId] = { x, y }
	return {
		left: `${x}px`,
		top: `${y}px`,
	}
}

onBeforeUnmount(() => {
	menuEl.value = null
})

const itemClass = (item: ContextMenuItem) => ({
	hasChildren: !!item.children?.length,
	disabled: !!item.disabled,
})

const onClick = (item: ContextMenuItem) => {
	if (item.disabled) return
	emit('select', item.id)
}
</script>

<style scoped>
.ctx-menu {
	position: fixed;
	z-index: 99999;
	min-width: 220px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	box-shadow: var(--vscode-shadow);
	color: var(--vscode-fg);
	padding: 6px;
}

.ctx-section {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.ctx-section-title {
	font-size: 11px;
	color: var(--vscode-fg-muted);
	padding: 2px 6px;
}

.ctx-item {
	position: relative;
}

.ctx-button {
	width: 100%;
	text-align: left;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	padding: 6px 8px;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.ctx-button:disabled {
	cursor: not-allowed;
	color: var(--vscode-fg-muted);
	background: var(--vscode-disabled-bg);
}

.ctx-item:hover > .ctx-button:not(:disabled) {
	border-color: var(--vscode-hover-border);
	background: var(--vscode-hover-bg);
}

.ctx-divider {
	height: 1px;
	background: var(--vscode-border);
	margin: 4px 0;
}

.ctx-submenu {
	position: fixed;
	min-width: 180px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	box-shadow: var(--vscode-shadow);
	padding: 6px;
	display: none;
}

.ctx-item.hasChildren:hover .ctx-submenu {
	display: block;
}

.ctx-arrow {
	color: var(--vscode-fg-muted);
}
</style>
