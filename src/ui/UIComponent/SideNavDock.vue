<template>
	<nav class="side-dock" aria-label="左侧导航" @pointerdown.stop>
		<button
			v-for="it in items"
			:key="it.key"
			class="side-dock-item"
			:class="{ active: it.active }"
			type="button"
			@click="emit('select', it.key)"
		>
			<span class="side-dock-icon" aria-hidden="true">{{ it.icon }}</span>
			<span class="side-dock-label">{{ it.label }}</span>
		</button>
	</nav>
</template>

<script setup lang="ts">
export type SideNavItem = {
	key: string
	label: string
	icon: string
	active?: boolean
}

defineProps<{ items: SideNavItem[] }>()

const emit = defineEmits<{
	(e: 'select', key: string): void
}>()
</script>

<style scoped>
.side-dock {
	position: absolute;
	left: 12px;
	top: 50%;
	transform: translateY(-50%);
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt-dark);
	box-shadow: var(--vscode-shadow);
	width: fit-content;
	height: fit-content;
	z-index: 22;
}

.side-dock-item {
	display: flex;
	align-items: center;
	gap: 10px;
	border: 1px solid var(--vscode-border);
	background: var(--dweb-defualt);
	color: var(--vscode-fg);
	padding: 8px 10px;
	cursor: pointer;
}

.side-dock-item:hover {
	border-color: var(--vscode-hover-border);
	background: var(--vscode-hover-bg);
}

.side-dock-item.active {
	border-color: var(--vscode-border-accent);
}

.side-dock-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 18px;
	height: 18px;
	font-size: 12px;
	line-height: 1;
	color: var(--vscode-fg);
}

.side-dock-label {
	max-width: 0;
	opacity: 0;
	overflow: hidden;
	white-space: nowrap;
	transition: max-width 160ms ease, opacity 120ms ease;
	color: var(--vscode-fg);
}

.side-dock:hover .side-dock-label {
	max-width: 160px;
	opacity: 1;
}
</style>
