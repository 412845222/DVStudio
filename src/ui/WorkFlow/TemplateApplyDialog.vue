<template>
	<Transition name="aiwf-rail-dialog">
		<div
			v-if="open"
			class="aiwf-rail-dialog-mask"
			data-bp-ui-overlay="true"
			@pointerdown.stop
			@mousedown.stop
			@contextmenu.prevent.stop
			@click.self="$emit('update:open', false)"
		>
			<div
				class="aiwf-rail-dialog"
				data-bp-ui-overlay="true"
				@pointerdown.stop
				@mousedown.stop
				@click.stop
				@contextmenu.prevent.stop
			>
				<span class="rail-bracket rail-bracket-tl" aria-hidden="true"></span>
				<span class="rail-bracket rail-bracket-tr" aria-hidden="true"></span>
				<span class="rail-bracket rail-bracket-bl" aria-hidden="true"></span>
				<span class="rail-bracket rail-bracket-br" aria-hidden="true"></span>

				<div class="aiwf-rail-dialog__title">{{ t('aiworkflow.templateCenter.applyDialogTitle') }}</div>

				<div v-if="template" class="template-apply-info">
					<div class="template-apply-name">{{ template.name }}</div>
					<div class="template-apply-desc">{{ template.description }}</div>
				</div>

				<div class="template-apply-hint">{{ t('aiworkflow.templateCenter.selectTargetHint') }}</div>

				<div class="template-target-options">
					<button
						class="template-target-option"
						:class="{ active: applyTarget === 'current' }"
						type="button"
						@click="applyTarget = 'current'"
					>
						<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
							<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" />
							<path d="M3 9h18M9 21V9" stroke="currentColor" stroke-width="1.5" />
						</svg>
						<div class="template-target-label">{{ t('aiworkflow.templateCenter.applyToCurrent') }}</div>
					</button>
					<button
						class="template-target-option"
						:class="{ active: applyTarget === 'new-project' }"
						type="button"
						@click="applyTarget = 'new-project'"
					>
						<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
							<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" />
						</svg>
						<div class="template-target-label">{{ t('aiworkflow.templateCenter.applyToNew') }}</div>
					</button>
				</div>

				<div v-if="applyTarget === 'current'" class="template-apply-info-tip">
					<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
						<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.2" />
						<path d="M8 7v4M8 5h0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
					</svg>
					{{ t('aiworkflow.templateCenter.currentProjectInfo') }}
				</div>

				<div v-if="applyTarget === 'new-project'" class="template-new-project-form">
					<div class="template-form-field">
						<label class="template-form-label">{{ t('aiworkflow.templateCenter.newProjectName') }}</label>
						<input
							v-model="newProjectName"
							class="template-form-input"
							type="text"
							:placeholder="t('aiworkflow.templateCenter.newProjectNamePlaceholder')"
							@keyup.enter="handleConfirm"
						/>
						<div v-if="nameError" class="template-form-error">{{ nameError }}</div>
					</div>
				</div>

				<div class="aiwf-rail-dialog__actions">
					<button class="aiwf-rail-dialog-btn" type="button" @click="$emit('update:open', false)">
						{{ t('common.cancel') }}
					</button>
					<button class="aiwf-rail-dialog-btn is-primary" type="button" @click="handleConfirm">
						{{ t('aiworkflow.templateCenter.apply') }}
					</button>
				</div>
			</div>
		</div>
	</Transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { TemplateItem, ApplyTarget, TemplateApplyOptions } from '../../aiworkflow/template/types'
import { useI18n } from '../../i18n'

const props = defineProps<{
	open: boolean
	template: TemplateItem | null
}>()

const emit = defineEmits<{
	(e: 'update:open', value: boolean): void
	(e: 'confirm', options: TemplateApplyOptions): void
}>()

const { t } = useI18n()

const applyTarget = ref<ApplyTarget>('current')
const newProjectName = ref('')
const nameError = ref('')

watch(
	() => props.open,
	(val) => {
		if (val) {
			applyTarget.value = 'current'
			newProjectName.value = props.template?.name || ''
			nameError.value = ''
		}
	}
)

function validate(): boolean {
	nameError.value = ''

	if (applyTarget.value === 'new-project') {
		if (!newProjectName.value.trim()) {
			nameError.value = t('aiworkflow.templateCenter.nameRequired')
			return false
		}
	}

	return true
}

function handleConfirm() {
	if (!props.template) return
	if (!validate()) return

	emit('confirm', {
		template: props.template,
		target: applyTarget.value,
		newProjectName: applyTarget.value === 'new-project' ? newProjectName.value.trim() : undefined,
	})
	emit('update:open', false)
}
</script>

<style scoped>
.aiwf-rail-dialog-mask {
	position: fixed;
	inset: 0;
	z-index: 2100;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.75);
	backdrop-filter: blur(4px);
}

.aiwf-rail-dialog {
	--tc-accent: var(--theme-accent, #1f9d84);
	--tc-accent-hover: var(--theme-accent-hover, #27b99c);
	position: relative;
	width: 90vw;
	max-width: 520px;
	max-height: 80vh;
	overflow-y: auto;
	padding: 24px;
	border: 1px solid color-mix(in srgb, var(--tc-accent) 30%, transparent);
	border-radius: 12px;
	background: rgba(15, 15, 15, 0.96);
	backdrop-filter: blur(20px);
	box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px color-mix(in srgb, var(--tc-accent) 10%, transparent);
}

.rail-bracket {
	position: absolute;
	width: 20px;
	height: 20px;
	border-color: var(--tc-accent);
	border-style: solid;
	border-width: 0;
	opacity: 0.7;
	pointer-events: none;
	z-index: 10;
}

.rail-bracket.tl {
	top: 8px;
	left: 8px;
	border-top-width: 2px;
	border-left-width: 2px;
}

.rail-bracket.tr {
	top: 8px;
	right: 8px;
	border-top-width: 2px;
	border-right-width: 2px;
}

.rail-bracket.bl {
	bottom: 8px;
	left: 8px;
	border-bottom-width: 2px;
	border-left-width: 2px;
}

.rail-bracket.br {
	bottom: 8px;
	right: 8px;
	border-bottom-width: 2px;
	border-right-width: 2px;
}

.aiwf-rail-dialog__title {
	font-size: 18px;
	font-weight: 600;
	color: var(--theme-text-primary, #edf2f4);
	margin-bottom: 16px;
}

.aiwf-rail-dialog__actions {
	display: flex;
	justify-content: flex-end;
	gap: 10px;
	margin-top: 20px;
	padding-top: 16px;
	border-top: 1px solid color-mix(in srgb, var(--tc-accent) 15%, transparent);
}

.aiwf-rail-dialog-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 8px 20px;
	border: 1px solid color-mix(in srgb, var(--tc-accent) 30%, transparent);
	border-radius: 6px;
	background: transparent;
	color: var(--theme-text-muted, #aeb8bd);
	font-size: 13px;
	cursor: pointer;
	transition: all 0.2s ease;
}

.aiwf-rail-dialog-btn:hover {
	border-color: var(--tc-accent);
	color: var(--theme-text-primary, #edf2f4);
}

.aiwf-rail-dialog-btn.is-primary {
	background: var(--tc-accent);
	border-color: var(--tc-accent);
	color: #fff;
}

.aiwf-rail-dialog-btn.is-primary:hover {
	background: var(--tc-accent-hover);
	border-color: var(--tc-accent-hover);
}

.template-apply-info {
	padding: 12px;
	margin-bottom: 12px;
	background: color-mix(in srgb, var(--tc-accent) 8%, transparent);
	border-radius: 6px;
	border: 1px solid color-mix(in srgb, var(--tc-accent) 20%, transparent);
}

.template-apply-name {
	font-size: 15px;
	font-weight: 600;
	color: var(--theme-text-primary, #edf2f4);
	margin-bottom: 4px;
}

.template-apply-desc {
	font-size: 12px;
	color: var(--theme-text-muted, #aeb8bd);
	line-height: 1.4;
}

.template-apply-hint {
	font-size: 13px;
	color: var(--theme-text-muted, #aeb8bd);
	margin-bottom: 16px;
}

.template-target-options {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 12px;
	margin-bottom: 16px;
}

.template-target-option {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	padding: 20px 16px;
	border: 1px solid color-mix(in srgb, var(--tc-accent) 30%, transparent);
	border-radius: 8px;
	background: rgba(15, 15, 15, 0.5);
	color: var(--theme-text-muted, #aeb8bd);
	cursor: pointer;
	transition: all 0.2s ease;
}

.template-target-option:hover {
	border-color: color-mix(in srgb, var(--tc-accent) 60%, transparent);
	background: color-mix(in srgb, var(--tc-accent) 8%, transparent);
}

.template-target-option.active {
	border-color: var(--tc-accent);
	background: color-mix(in srgb, var(--tc-accent) 15%, transparent);
	color: var(--theme-text-primary, #edf2f4);
	box-shadow: 0 0 15px color-mix(in srgb, var(--tc-accent) 20%, transparent);
}

.template-target-label {
	font-size: 13px;
	font-weight: 500;
}

.template-apply-info-tip {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
	margin-bottom: 16px;
	background: color-mix(in srgb, var(--tc-accent) 10%, transparent);
	border: 1px solid color-mix(in srgb, var(--tc-accent) 30%, transparent);
	border-radius: 6px;
	color: var(--tc-accent);
	font-size: 12px;
}

.template-new-project-form {
	display: flex;
	flex-direction: column;
	gap: 14px;
	margin-bottom: 8px;
}

.template-form-field {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.template-form-label {
	font-size: 12px;
	color: var(--theme-text-muted, #aeb8bd);
	font-weight: 500;
}

.template-form-input {
	width: 100%;
	padding: 8px 12px;
	border: 1px solid color-mix(in srgb, var(--tc-accent) 30%, transparent);
	border-radius: 4px;
	background: rgba(0, 0, 0, 0.3);
	color: var(--theme-text-primary, #edf2f4);
	font-size: 13px;
	outline: none;
	transition: border-color 0.2s ease;
	box-sizing: border-box;
}

.template-form-input:focus {
	border-color: var(--tc-accent);
}

.template-form-input::placeholder {
	color: rgba(174, 184, 189, 0.5);
}

.template-form-error {
	font-size: 11px;
	color: #ff6b6b;
}
</style>
