<template>
	<div class="steam-quick-actions">
		<button
			v-for="action in actions"
			:key="action.id"
			class="action-btn"
			:class="{ 'is-disabled': action.disabled }"
			type="button"
			:disabled="action.disabled"
			@click="handleAction(action.id)"
			:title="action.label"
		>
			<span class="action-icon">
				<svg v-if="action.id === 'friends'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
					<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
					<circle cx="9" cy="7" r="4"/>
					<path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
					<path d="M16 3.13a4 4 0 0 1 0 7.75"/>
				</svg>
				<svg v-else-if="action.id === 'store'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
					<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
					<line x1="3" y1="6" x2="21" y2="6"/>
					<path d="M16 10a4 4 0 0 1-8 0"/>
				</svg>
				<svg v-else-if="action.id === 'community'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="10"/>
					<line x1="2" y1="12" x2="22" y2="12"/>
					<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
				</svg>
				<svg v-else-if="action.id === 'achievements'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="8" r="6"/>
					<path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>
				</svg>
			</span>
			<span class="action-label">{{ action.label }}</span>
		</button>
	</div>
</template>

<script setup lang="ts">
const emit = defineEmits<{
	(e: 'action', actionId: string): void
}>()

const actions = [
	{ id: 'friends', label: '好友', disabled: false },
	{ id: 'store', label: '商店', disabled: false },
	{ id: 'community', label: '社区', disabled: false },
	{ id: 'achievements', label: '成就', disabled: true },
]

function handleAction(actionId: string) {
	const action = actions.find(a => a.id === actionId)
	if (action?.disabled) return
	emit('action', actionId)
}
</script>

<style scoped>
.steam-quick-actions {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 8px;
}

.action-btn {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 16px 12px;
	background: color-mix(in srgb, var(--theme-bg-tertiary, #23272e) 70%, transparent);
	border: 1px solid color-mix(in srgb, var(--theme-accent, #1f9d84) 20%, transparent);
	color: var(--theme-text-secondary, #a0a0a0);
	cursor: pointer;
	transition: all 160ms ease;
	appearance: none;
	-webkit-appearance: none;
	border-radius: 0;
}

.action-btn:not(:disabled):hover {
	background: color-mix(in srgb, var(--theme-accent, #1f9d84) 12%, transparent);
	border-color: color-mix(in srgb, var(--theme-accent, #1f9d84) 50%, transparent);
	color: var(--theme-accent, #1f9d84);
	box-shadow:
		0 0 16px color-mix(in srgb, var(--theme-accent, #1f9d84) 20%, transparent),
		inset 0 0 0 1px color-mix(in srgb, var(--theme-accent, #1f9d84) 10%, transparent);
}

.action-btn:not(:disabled):active {
	transform: scale(0.97);
}

.action-btn.is-disabled,
.action-btn:disabled {
	opacity: 0.35;
	cursor: not-allowed;
}

.action-icon {
	width: 26px;
	height: 26px;
	display: flex;
	align-items: center;
	justify-content: center;
}

.action-icon svg {
	width: 24px;
	height: 24px;
}

.action-label {
	font-size: 12px;
	font-weight: 500;
	letter-spacing: 0.03em;
}
</style>
