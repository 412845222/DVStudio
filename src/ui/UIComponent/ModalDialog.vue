<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(
	defineProps<{
		open: boolean
		title?: string
		confirmText?: string
		closeText?: string
		disableConfirm?: boolean
		zIndex?: number
	}>(),
	{
		title: '',
		confirmText: '确认',
		closeText: '关闭',
		disableConfirm: false,
		zIndex: undefined
	}
)

const emit = defineEmits<{ (e: 'confirm'): void; (e: 'close'): void }>()

const overlayStyle = computed(() => {
	const s: Record<string, string | number> = { pointerEvents: 'auto' }
	if (props.zIndex != null) s.zIndex = props.zIndex
	return s
})
</script>

<template>
	<div v-if="props.open" class="dvs-modal-overlay" :style="overlayStyle" @click.self="emit('close')">
		<div class="dvs-modal" role="dialog" aria-modal="true">
			<div class="dvs-modal-head">
				<div class="dvs-modal-title">{{ props.title }}</div>
				<button class="dvs-modal-x" type="button" aria-label="关闭" @click="emit('close')">
					×
				</button>
			</div>

			<div class="dvs-modal-body">
				<slot />
			</div>

			<div class="dvs-modal-actions">
				<button class="btn" type="button" @click="emit('close')">{{ props.closeText }}</button>
				<button class="btn" type="button" :disabled="props.disableConfirm" @click="emit('confirm')">
					{{ props.confirmText }}
				</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.dvs-modal-overlay {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	top: var(--aiwf-safe-top, 0px);
	background: var(--aiwf-dialog-mask-bg, rgba(0, 0, 0, 0.35));
	display: flex;
	align-items: center;
	justify-content: center;
	padding: var(--aiwf-dialog-padding, 18px);
	box-sizing: border-box;
	z-index: var(--aiwf-popover-z-index, 120);
}

.dvs-modal {
	width: 100%;
	max-width: 860px;
	max-height: calc(100vh - var(--aiwf-safe-top, 0px) - var(--aiwf-dialog-max-height-gap, 36px));
	border: 1px solid var(--aiwf-dialog-border, var(--wf-panel-border, var(--vscode-border)));
	border-radius: var(--aiwf-dialog-radius, var(--wf-panel-radius, 8px));
	background: var(--aiwf-dialog-bg, var(--wf-panel-bg-solid, var(--dweb-defualt-light)));
	box-shadow: var(--aiwf-dialog-shadow, var(--wf-panel-shadow, var(--vscode-shadow)));
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.dvs-modal-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: var(--aiwf-dialog-head-padding, 12px 14px);
	border-bottom: 1px solid var(--vscode-border);
}

.dvs-modal-title {
	font-size: var(--aiwf-dialog-title-size, 14px);
	font-weight: var(--aiwf-dialog-title-weight, 600);
	color: var(--vscode-fg);
}

.dvs-modal-x {
	appearance: none;
	-webkit-appearance: none;
	border: none;
	background: transparent;
	color: var(--vscode-fg);
	font-size: 18px;
	line-height: 1;
	cursor: pointer;
	padding: 0 6px;
}

.dvs-modal-body {
	padding: var(--aiwf-dialog-body-padding, 12px 14px);
	overflow: auto;
	min-height: 0;
}

.dvs-modal-actions {
	padding: var(--aiwf-dialog-actions-padding, 10px 14px);
	border-top: 1px solid var(--vscode-border);
	display: flex;
	justify-content: flex-end;
	gap: var(--aiwf-dialog-actions-gap, 10px);
}

.btn {
	appearance: none;
	-webkit-appearance: none;
	border: none;
	border-radius: var(--aiwf-dialog-button-radius, var(--aiwf-radius-md, 6px));
	min-height: var(--aiwf-dialog-button-height, 32px);
	padding: var(--aiwf-dialog-button-padding, 0 12px);
	background: var(--dweb-defualt-dark);
	color: var(--vscode-fg);
	cursor: pointer;
}

.btn:hover {
	box-shadow: var(--dweb-shadow);
}

.btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}
</style>
