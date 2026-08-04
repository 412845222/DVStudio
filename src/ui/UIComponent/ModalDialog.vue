<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from '../../i18n'

const { t } = useI18n()

const props = withDefaults(
	defineProps<{
		open?: boolean
		show?: boolean
		title?: string
		confirmText?: string
		cancelText?: string
		closeText?: string
		showCancel?: boolean
		showConfirm?: boolean
		showClose?: boolean
		showTitle?: boolean
		showFooter?: boolean
		showDontShow?: boolean
		size?: 'small' | 'normal' | 'wide'
		closeOnBackdrop?: boolean
		zIndex?: number
		disableConfirm?: boolean
		disableCancel?: boolean
	}>(),
	{
		title: '',
		confirmText: () => '',
		closeText: () => '',
		showCancel: true,
		showConfirm: true,
		showClose: true,
		showTitle: true,
		showFooter: true,
		showDontShow: false,
		closeOnBackdrop: true,
		zIndex: undefined,
		disableConfirm: false,
		disableCancel: false,
		size: 'normal'
	}
)

const emit = defineEmits<{
	(e: 'confirm', dontShowAgain?: boolean): void
	(e: 'cancel'): void
	(e: 'close'): void
	(e: 'update:show', value: boolean): void
	(e: 'update:open', value: boolean): void
}>()

const visible = computed(() => {
	if (props.open !== undefined) return props.open
	return props.show ?? false
})

const overlayStyle = computed(() => {
	const s: Record<string, string | number> = { pointerEvents: 'auto' }
	if (props.zIndex != null) s.zIndex = props.zIndex
	return s
})

const closeBtnText = computed(() => props.closeText || props.cancelText || t('dialog.cancel'))
const confirmBtnText = computed(() => props.confirmText || t('dialog.confirm'))

function handleConfirm() {
	emit('confirm')
	emit('update:show', false)
	emit('update:open', false)
}

function handleClose() {
	emit('cancel')
	emit('close')
	emit('update:show', false)
	emit('update:open', false)
}

function onBackdropClick() {
	if (props.closeOnBackdrop) {
		handleClose()
	}
}

function onKeydown(e: KeyboardEvent) {
	if (e.key === 'Escape' && visible.value) {
		handleClose()
	}
}

onMounted(() => {
	window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
	window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
	<div v-if="visible" class="dvs-modal-overlay" :style="overlayStyle" @click.self="onBackdropClick">
		<div class="dvs-modal" :class="[`dvs-modal--${size}`]" role="dialog" aria-modal="true">
			<div v-if="showTitle" class="dvs-modal-head">
				<slot name="title">
					<div class="dvs-modal-title">{{ title || t('dialog.defaultTitle') }}</div>
				</slot>
				<button
					v-if="showClose"
					class="dvs-modal-x"
					type="button"
					:aria-label="t('dialog.close')"
					@click="handleClose"
				>
					×
				</button>
			</div>

			<div class="dvs-modal-body">
				<slot />
			</div>

			<div v-if="showFooter" class="dvs-modal-actions">
				<label v-if="showDontShow" class="dvs-modal-dontshow">
					<input type="checkbox" />
					<span>{{ t('dialog.dontShowAgain') }}</span>
				</label>
				<span class="dvs-modal-actions-spacer"></span>
				<button
					v-if="showCancel"
					class="btn"
					type="button"
					:disabled="disableCancel"
					@click="handleClose"
				>
					{{ closeBtnText }}
				</button>
				<button
					v-if="showConfirm"
					class="btn"
					type="button"
					:disabled="disableConfirm"
					@click="handleConfirm"
				>
					{{ confirmBtnText }}
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
	max-width: var(--aiwf-dialog-max-width, 560px);
	max-height: calc(100vh - var(--aiwf-safe-top, 0px) - var(--aiwf-dialog-max-height-gap, 36px));
	border: 1px solid var(--aiwf-dialog-border, var(--wf-panel-border, var(--theme-border)));
	border-radius: var(--aiwf-dialog-radius, var(--wf-panel-radius, 10px));
	background: var(--aiwf-dialog-bg, var(--wf-panel-bg-solid, var(--theme-bg-tertiary)));
	box-shadow: var(--aiwf-dialog-shadow, var(--wf-panel-shadow, 0 16px 40px rgba(0, 0, 0, 0.25)));
	backdrop-filter: var(--aiwf-dialog-backdrop, blur(16px) saturate(1.4));
	-webkit-backdrop-filter: var(--aiwf-dialog-backdrop, blur(16px) saturate(1.4));
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.dvs-modal--small {
	max-width: var(--aiwf-dialog-max-width, 360px);
}

.dvs-modal--wide {
	max-width: var(--aiwf-dialog-max-width, 860px);
}

.dvs-modal-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: var(--aiwf-dialog-head-padding, 14px 18px);
	border-bottom: 1px solid var(--vscode-border, var(--theme-border));
	flex-shrink: 0;
}

.dvs-modal-title {
	font-size: var(--aiwf-dialog-title-size, 14px);
	font-weight: var(--aiwf-dialog-title-weight, 600);
	color: var(--vscode-fg, var(--theme-text-primary));
}

.dvs-modal-x {
	appearance: none;
	-webkit-appearance: none;
	border: none;
	background: transparent;
	color: var(--vscode-fg, var(--theme-text-muted));
	font-size: 18px;
	line-height: 1;
	cursor: pointer;
	padding: 0 6px;
	border-radius: 4px;
	transition:
		background 120ms ease,
		color 120ms ease;
}

.dvs-modal-x:hover {
	background: var(--theme-hover-bg, rgba(255, 255, 255, 0.08));
	color: var(--theme-text-primary);
}

.dvs-modal-body {
	padding: var(--aiwf-dialog-body-padding, 18px);
	overflow: auto;
	min-height: 0;
	flex: 1;
}

.dvs-modal-actions {
	padding: var(--aiwf-dialog-actions-padding, 12px 18px);
	border-top: 1px solid var(--vscode-border, var(--theme-border));
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: var(--aiwf-dialog-actions-gap, 10px);
	flex-shrink: 0;
}

.dvs-modal-actions-spacer {
	flex: 1;
}

.dvs-modal-dontshow {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
	color: var(--theme-text-muted);
	cursor: pointer;
	user-select: none;
	margin-right: auto;
}

.dvs-modal-dontshow input[type='checkbox'] {
	accent-color: var(--theme-accent);
}

.btn {
	appearance: none;
	-webkit-appearance: none;
	border: none;
	border-radius: var(--aiwf-dialog-button-radius, var(--aiwf-radius-md, 6px));
	min-height: var(--aiwf-dialog-button-height, 32px);
	padding: var(--aiwf-dialog-button-padding, 0 12px);
	background: var(--dweb-defualt-dark, var(--theme-bg-secondary));
	color: var(--vscode-fg, var(--theme-text-primary));
	cursor: pointer;
	font-size: var(--aiwf-dialog-button-font-size, 13px);
	transition:
		box-shadow 120ms ease,
		background 120ms ease;
}

.btn:hover {
	box-shadow: var(--dweb-shadow, 0 2px 6px rgba(0, 0, 0, 0.2));
}

.btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}
</style>
