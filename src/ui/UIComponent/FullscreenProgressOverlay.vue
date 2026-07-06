<template>
	<div v-if="open" class="fsprog-mask" @pointerdown.stop>
		<div class="fsprog-panel" @pointerdown.stop>
			<div class="fsprog-title">{{ title }}</div>
			<div v-if="detail" class="fsprog-detail">{{ detail }}</div>

			<div
				class="fsprog-bar-wrap"
				role="progressbar"
				:aria-valuenow="Math.round(clampedProgress * 100)"
			>
				<div class="fsprog-bar" :style="{ width: Math.round(clampedProgress * 100) + '%' }" />
			</div>
			<div class="fsprog-percent">{{ Math.round(clampedProgress * 100) }}%</div>

			<div class="fsprog-actions">
				<button v-if="cancellable" class="fsprog-cancel" type="button" @click.stop="emit('cancel')">
					{{ cancelButtonText }}
				</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../../i18n'

const props = withDefaults(defineProps<{
	open: boolean
	title: string
	progress: number
	detail?: string
	cancellable?: boolean
	cancelText?: string
}>(), {
	cancellable: false,
})

const emit = defineEmits<{ (e: 'cancel'): void }>()

const { t } = useI18n()

const cancelButtonText = computed(() => props.cancelText || t('dialog.cancel'))

const clampedProgress = computed(() => {
	const p = Number(props.progress)
	if (!Number.isFinite(p)) return 0
	return Math.max(0, Math.min(1, p))
})
</script>

<style scoped>
.fsprog-mask {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	top: var(--aiwf-safe-top, 0px);
	z-index: var(--aiwf-alert-z-index, 130);
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--aiwf-dialog-mask-bg, rgba(0, 0, 0, 0.55));
}

.fsprog-panel {
	width: min(520px, calc(100vw - 48px));
	border: 1px solid var(--aiwf-dialog-border, var(--wf-panel-border, var(--vscode-border)));
	border-radius: var(--aiwf-dialog-radius, var(--wf-panel-radius, 10px));
	background: var(--aiwf-dialog-bg, var(--wf-panel-bg-solid, var(--dweb-defualt)));
	box-shadow: var(--aiwf-dialog-shadow-strong, var(--wf-panel-shadow-strong, var(--vscode-shadow)));
	padding: var(--aiwf-dialog-body-padding, 12px 14px);
}

.fsprog-title {
	font-size: var(--aiwf-dialog-title-size, 14px);
	font-weight: var(--aiwf-dialog-title-weight, 600);
	color: var(--vscode-fg);
}

.fsprog-detail {
	margin-top: 6px;
	font-size: 12px;
	color: var(--vscode-fg-muted);
	line-height: 1.35;
	max-height: 64px;
	overflow: hidden;
	text-overflow: ellipsis;
}

.fsprog-bar-wrap {
	margin-top: 12px;
	height: 10px;
	border-radius: 999px;
	border: 1px solid var(--vscode-border);
	background: rgba(255, 255, 255, 0.06);
	overflow: hidden;
}

.fsprog-bar {
	height: 100%;
	border-radius: 999px;
	background: var(--vscode-border-accent);
	box-shadow:
		0 0 10px var(--vscode-border-accent),
		0 0 18px var(--vscode-border-accent);
	transition: width 120ms linear;
}

.fsprog-percent {
	margin-top: 6px;
	font-size: 11px;
	color: var(--vscode-fg-muted);
}

.fsprog-actions {
	display: flex;
	justify-content: flex-end;
	margin-top: var(--aiwf-dialog-actions-gap, 10px);
}

.fsprog-cancel {
	border: 1px solid var(--vscode-border);
	border-radius: var(--aiwf-dialog-button-radius, var(--aiwf-radius-md, 6px));
	background: transparent;
	color: var(--vscode-fg);
	min-height: var(--aiwf-dialog-button-height, 32px);
	padding: var(--aiwf-dialog-button-padding, 0 12px);
	cursor: pointer;
}

.fsprog-cancel:hover {
	border-color: var(--vscode-border-accent);
}
</style>
