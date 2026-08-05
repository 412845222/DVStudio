<template>
	<ModalDialog
		:show="warmupPromptState.visible"
		:title="t('aiworkflow.warmup.title')"
		:confirm-text="t('aiworkflow.warmup.confirm')"
		:cancel-text="t('aiworkflow.warmup.cancel')"
		size="normal"
		@confirm="onConfirm"
		@cancel="onDismiss(false)"
		@close="onDismiss(false)"
	>
		<div class="warmup-prompt-content">
			<div class="warmup-prompt-icon">
				<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
					<rect
						x="8"
						y="8"
						width="48"
						height="48"
						rx="4"
						stroke="currentColor"
						stroke-width="2"
						fill="none"
					/>
					<circle cx="24" cy="28" r="6" stroke="currentColor" stroke-width="2" fill="none" />
					<path
						d="M14 48 L24 38 L32 44 L44 32 L52 40"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<circle cx="48" cy="20" r="4" fill="currentColor" opacity="0.3" />
				</svg>
			</div>
			<div class="warmup-prompt-text">
				<p class="warmup-prompt-main">
					{{
						t('aiworkflow.warmup.message', {
							count: warmupPromptState.unwarmedNodeIds.length,
							total: warmupPromptState.totalNodeCount
						})
					}}
				</p>
				<p class="warmup-prompt-sub">
					{{ t('aiworkflow.warmup.description') }}
				</p>
				<label class="warmup-prompt-dontshow">
					<input type="checkbox" v-model="dontShowAgain" />
					<span>{{ t('aiworkflow.warmup.dontShowAgain') }}</span>
				</label>
			</div>
		</div>
	</ModalDialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from '../../i18n'
import ModalDialog from '../UIComponent/ModalDialog.vue'
import {
	warmupPromptState,
	useWarmupPrompt
} from '../../views/AIWorkflow/node-screenshot/warmupPromptManager'

const { t } = useI18n()
const { confirmWarmup, dismissPrompt } = useWarmupPrompt()

const dontShowAgain = ref(false)

const onConfirm = () => {
	confirmWarmup()
}

const onDismiss = (_remember?: boolean) => {
	dismissPrompt(dontShowAgain.value)
}
</script>

<style scoped>
.warmup-prompt-content {
	display: flex;
	gap: 16px;
	padding: 8px 0;
	align-items: flex-start;
}

.warmup-prompt-icon {
	flex-shrink: 0;
	width: 48px;
	height: 48px;
	color: var(--dweb-green-main, #3aa8b4);
}

.warmup-prompt-icon svg {
	width: 100%;
	height: 100%;
}

.warmup-prompt-text {
	flex: 1;
}

.warmup-prompt-main {
	margin: 0 0 8px 0;
	font-size: 14px;
	line-height: 1.5;
	color: var(--vscode-fg);
}

.warmup-prompt-sub {
	margin: 0 0 12px 0;
	font-size: 12px;
	line-height: 1.5;
	color: var(--vscode-fg-muted);
}

.warmup-prompt-dontshow {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
	color: var(--vscode-fg-muted);
	cursor: pointer;
	user-select: none;
}

.warmup-prompt-dontshow input[type='checkbox'] {
	margin: 0;
	cursor: pointer;
}
</style>
