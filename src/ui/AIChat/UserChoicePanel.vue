<template>
	<div class="user-choice-panel" :class="{ 'is-disabled': disabled }">
		<div v-if="title" class="user-choice-panel__title">{{ title }}</div>
		<div class="user-choice-panel__options">
			<button
				v-for="(option, index) in options"
				:key="index"
				type="button"
				class="user-choice-panel__option-btn"
				:class="{ 'is-selected': selectedIndex === index }"
				:disabled="disabled"
				@click="onSelect(index)"
			>
				<span class="user-choice-panel__option-index">{{ index + 1 }}</span>
				<span class="user-choice-panel__option-text">{{ option }}</span>
			</button>
		</div>
		<div v-if="selectedIndex !== null && selectedText" class="user-choice-panel__selected">
			<span class="user-choice-panel__selected-label">已选择：</span>
			<span class="user-choice-panel__selected-text">{{ selectedText }}</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(
	defineProps<{
		title?: string
		options: string[]
		disabled?: boolean
	}>(),
	{
		title: '',
		disabled: false,
	}
)

const emit = defineEmits<{
	(e: 'select', index: number, text: string): void
}>()

const selectedIndex = ref<number | null>(null)

const selectedText = computed(() => {
	if (selectedIndex.value === null) return ''
	return props.options[selectedIndex.value] || ''
})

const onSelect = (index: number) => {
	if (props.disabled) return
	selectedIndex.value = index
	const text = props.options[index] || ''
	emit('select', index, text)
}
</script>

<style scoped>
.user-choice-panel {
	margin: 8px 0;
	padding: 10px 12px;
	border: 1px solid rgba(148, 163, 184, 0.2);
	border-radius: 6px;
	background: rgba(30, 41, 59, 0.3);
}

.user-choice-panel.is-disabled {
	opacity: 0.6;
	pointer-events: none;
}

.user-choice-panel__title {
	font-size: 12px;
	font-weight: 500;
	color: var(--wf-text-primary, #e5e7eb);
	margin-bottom: 8px;
}

.user-choice-panel__options {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.user-choice-panel__option-btn {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 12px;
	border: 1px solid rgba(148, 163, 184, 0.25);
	border-radius: 4px;
	background: rgba(15, 23, 42, 0.5);
	color: var(--wf-text-secondary, #d1d5db);
	font-size: 13px;
	text-align: left;
	cursor: pointer;
	transition: all 150ms ease;
}

.user-choice-panel__option-btn:hover:not(:disabled) {
	border-color: var(--wf-primary, #1f9d84);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 8%, transparent);
	color: var(--wf-text-primary, #e5e7eb);
}

.user-choice-panel__option-btn.is-selected {
	border-color: var(--wf-primary, #1f9d84);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 15%, transparent);
	color: var(--wf-text-primary, #e5e7eb);
}

.user-choice-panel__option-btn:disabled {
	cursor: not-allowed;
}

.user-choice-panel__option-index {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 20px;
	height: 20px;
	border-radius: 50%;
	background: rgba(148, 163, 184, 0.15);
	color: var(--wf-text-muted, #9ca3af);
	font-size: 11px;
	font-weight: 600;
	flex-shrink: 0;
}

.user-choice-panel__option-btn:hover:not(:disabled) .user-choice-panel__option-index,
.user-choice-panel__option-btn.is-selected .user-choice-panel__option-index {
	background: var(--wf-primary, #1f9d84);
	color: #fff;
}

.user-choice-panel__option-text {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.user-choice-panel__selected {
	margin-top: 8px;
	padding-top: 8px;
	border-top: 1px solid rgba(148, 163, 184, 0.1);
	font-size: 12px;
	color: var(--wf-text-muted, #9ca3af);
}

.user-choice-panel__selected-label {
	color: var(--wf-text-muted, #9ca3af);
}

.user-choice-panel__selected-text {
	color: var(--wf-primary, #1f9d84);
	font-weight: 500;
}
</style>
