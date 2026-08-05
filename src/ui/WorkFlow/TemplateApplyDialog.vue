<template>
	<Transition name="tad-dialog">
		<div
			v-if="open"
			class="tad-mask"
			data-bp-ui-overlay="true"
			@pointerdown.stop
			@mousedown.stop
			@contextmenu.prevent.stop
			@click.self="$emit('update:open', false)"
		>
			<div
				class="tad-dialog"
				data-bp-ui-overlay="true"
				@pointerdown.stop
				@mousedown.stop
				@click.stop
				@contextmenu.prevent.stop
			>
				<div class="tad-bg-layer" aria-hidden="true">
					<div class="tad-bg-gradient"></div>
					<div class="tad-bg-grid"></div>
				</div>
				<div class="tad-scanline" aria-hidden="true"></div>
				<div class="sq-container tad-particles" aria-hidden="true">
					<span v-for="p in particles" :key="p.id" class="sq-particle" :style="p.style"></span>
				</div>
				<span class="tad-corner tad-corner-tl" aria-hidden="true"></span>
				<span class="tad-corner tad-corner-tr" aria-hidden="true"></span>
				<span class="tad-corner tad-corner-bl" aria-hidden="true"></span>
				<span class="tad-corner tad-corner-br" aria-hidden="true"></span>

				<div class="tad-header">
					<div class="tad-title-wrap">
						<div class="tad-title">{{ t('aiworkflow.templateCenter.applyDialogTitle') }}</div>
						<div class="tad-title-sub">
							<template v-if="template">{{ template.name }}</template>
						</div>
					</div>
					<button
						class="tad-btn tad-btn-icon tad-btn-close"
						type="button"
						@click="$emit('update:open', false)"
					>
						<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
							<path
								d="M4 4l8 8M12 4l-8 8"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
					</button>
				</div>

				<div class="tad-body">
					<div v-if="template?.description" class="tad-desc">{{ template.description }}</div>

					<div class="tad-section-label">{{ t('aiworkflow.templateCenter.selectTargetHint') }}</div>

					<div class="tad-target-options">
						<button
							class="tad-target-option"
							:class="{ active: applyTarget === 'current' }"
							type="button"
							@click="applyTarget = 'current'"
						>
							<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
								<rect
									x="3"
									y="3"
									width="18"
									height="18"
									rx="2"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
								/>
								<path d="M3 9h18M9 21V9" stroke="currentColor" stroke-width="1.5" />
							</svg>
							<div class="tad-target-label">
								{{ t('aiworkflow.templateCenter.applyToCurrent') }}
							</div>
						</button>
						<button
							class="tad-target-option"
							:class="{ active: applyTarget === 'new-project' }"
							type="button"
							@click="applyTarget = 'new-project'"
						>
							<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
								<path
									d="M12 5v14M5 12h14"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
								/>
								<rect
									x="3"
									y="3"
									width="18"
									height="18"
									rx="2"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
								/>
							</svg>
							<div class="tad-target-label">{{ t('aiworkflow.templateCenter.applyToNew') }}</div>
						</button>
					</div>

					<div v-if="applyTarget === 'current'" class="tad-info-tip">
						<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
							<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.2" />
							<path
								d="M8 7v4M8 5h0"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
						{{ t('aiworkflow.templateCenter.currentProjectInfo') }}
					</div>

					<div v-if="applyTarget === 'new-project'" class="tad-form">
						<div class="tad-form-row">
							<label class="tad-label" for="tad-name">
								{{ t('aiworkflow.templateCenter.newProjectName') }}
							</label>
							<input
								id="tad-name"
								v-model="newProjectName"
								class="tad-input"
								type="text"
								:placeholder="t('aiworkflow.templateCenter.newProjectNamePlaceholder')"
								@keydown.enter.prevent="handleConfirm"
							/>
							<div v-if="nameError" class="tad-form-error">{{ nameError }}</div>
						</div>

						<div class="tad-form-row">
							<label class="tad-label" for="tad-path">
								{{ t('aiworkflow.templateCenter.newProjectPath') }}
							</label>
							<div class="tad-path-row">
								<input
									id="tad-path"
									v-model="newProjectPath"
									class="tad-input tad-path-input"
									type="text"
									readonly
									:placeholder="pathPlaceholder"
								/>
								<button class="tad-btn tad-btn-sm" type="button" @click="selectFolder">
									<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
										<path
											d="M1.5 4.5l2-2h3l2 2h6v8h-11v-8z"
											fill="none"
											stroke="currentColor"
											stroke-width="1.3"
											stroke-linejoin="round"
										/>
									</svg>
									{{ t('aiworkflow.templateCenter.selectPath') }}
								</button>
							</div>
							<div v-if="pathError" class="tad-form-error">{{ pathError }}</div>
						</div>
					</div>
				</div>

				<div class="tad-footer">
					<div class="tad-footer-info"></div>
					<div class="tad-footer-actions">
						<button
							class="tad-btn tad-btn-ghost"
							type="button"
							@click="$emit('update:open', false)"
						>
							{{ t('common.cancel') }}
						</button>
						<button class="tad-btn tad-btn-primary" type="button" @click="handleConfirm">
							<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
								<path
									d="M3 8.5l3 3L13 5"
									fill="none"
									stroke="currentColor"
									stroke-width="1.6"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							{{ t('aiworkflow.templateCenter.apply') }}
						</button>
					</div>
				</div>
			</div>
		</div>
	</Transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { buildSquareParticles } from '../../composables/useSquareParticles'
import { useI18n } from '../../i18n'
import { isElectron, selectProjectFolder } from '../../electronBridge'
import type {
	TemplateItem,
	ApplyTarget,
	TemplateApplyOptions
} from '../../aiworkflow/template/types'

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
const newProjectPath = ref('')
const nameError = ref('')
const pathError = ref('')

const particles = buildSquareParticles({ count: 12, seed: 555, baseOpacity: 0.3 })

const pathPlaceholder = computed(() => {
	return isElectron() ? '' : t('aiworkflow.templateCenter.pathRequired')
})

watch(
	() => props.open,
	(val) => {
		if (val) {
			applyTarget.value = 'current'
			newProjectName.value = props.template?.name || ''
			newProjectPath.value = ''
			nameError.value = ''
			pathError.value = ''
		}
	},
	{ immediate: true }
)

async function selectFolder() {
	if (!isElectron()) {
		pathError.value = t('aiworkflow.templateCenter.pathRequired')
		return
	}
	try {
		const picked = await selectProjectFolder()
		if (!picked || picked.canceled || !Array.isArray(picked.filePaths) || !picked.filePaths[0]) {
			return
		}
		const rootPath = String(picked.filePaths[0] || '').trim()
		if (rootPath) {
			newProjectPath.value = rootPath
			pathError.value = ''
		}
	} catch {
		pathError.value = t('aiworkflow.templateCenter.pathRequired')
	}
}

function validate(): boolean {
	nameError.value = ''
	pathError.value = ''

	if (applyTarget.value === 'new-project') {
		if (!newProjectName.value.trim()) {
			nameError.value = t('aiworkflow.templateCenter.nameRequired')
			return false
		}
		if (isElectron() && !newProjectPath.value.trim()) {
			pathError.value = t('aiworkflow.templateCenter.pathRequired')
			return false
		}
	}

	return true
}

function handleConfirm() {
	console.log(
		'[TemplateApplyDialog] handleConfirm called, template:',
		props.template?.id,
		props.template?.name,
		'target:',
		applyTarget.value
	)
	if (!props.template) {
		console.warn('[TemplateApplyDialog] handleConfirm: no template, returning')
		return
	}
	if (!validate()) {
		console.warn('[TemplateApplyDialog] handleConfirm: validation failed')
		return
	}

	const options = {
		template: props.template,
		target: applyTarget.value,
		newProjectName: applyTarget.value === 'new-project' ? newProjectName.value.trim() : undefined,
		newProjectPath:
			applyTarget.value === 'new-project' ? newProjectPath.value.trim() || undefined : undefined
	}
	console.log('[TemplateApplyDialog] emitting confirm with options:', {
		...options,
		template: { id: options.template.id, name: options.template.name }
	})
	emit('confirm', options)
	emit('update:open', false)
}
</script>

<style scoped>
@import '../../styles/square-particles.css';

.tad-mask {
	position: fixed;
	inset: 0;
	z-index: 2100;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.55);
	backdrop-filter: blur(6px);
	padding: 24px;
	box-sizing: border-box;
	pointer-events: auto;
}

.tad-dialog {
	--tad-accent: var(--theme-accent, #1f9d84);
	--tad-accent-hover: var(--theme-accent-hover, #27b99c);
	--tad-cold: #3aa8b4;
	--tad-fg: var(--theme-text-primary, #eaf2f5);
	--tad-fg-soft: var(--theme-text-secondary, #9aa0a6);
	--tad-bg-0: #07090d;
	--tad-bg-1: #111a22;
	--tad-input-border: color-mix(in srgb, var(--tad-accent) 28%, transparent);
	position: relative;
	width: 100%;
	max-width: 520px;
	max-height: 90vh;
	display: flex;
	flex-direction: column;
	border: 1px solid color-mix(in srgb, var(--tad-accent) 35%, transparent);
	border-radius: 2px;
	overflow: hidden;
	box-shadow:
		0 24px 80px rgba(0, 0, 0, 0.55),
		0 0 0 1px color-mix(in srgb, var(--tad-accent) 15%, transparent),
		0 0 60px color-mix(in srgb, var(--tad-accent) 10%, transparent);
	user-select: text;
}

/* Background layers */
.tad-bg-layer {
	position: absolute;
	inset: 0;
	z-index: 0;
	pointer-events: none;
	overflow: hidden;
}

.tad-bg-gradient {
	position: absolute;
	inset: 0;
	background:
		radial-gradient(
			ellipse 70% 50% at 80% 10%,
			color-mix(in srgb, var(--tad-accent) 10%, transparent),
			transparent 60%
		),
		radial-gradient(
			ellipse 60% 50% at 10% 90%,
			color-mix(in srgb, var(--tad-cold) 8%, transparent),
			transparent 55%
		),
		linear-gradient(180deg, var(--tad-bg-0) 0%, var(--tad-bg-1) 100%);
}

.tad-bg-grid {
	position: absolute;
	inset: 0;
	background-image:
		linear-gradient(
			to right,
			color-mix(in srgb, var(--tad-accent) 4%, transparent) 1px,
			transparent 1px
		),
		linear-gradient(
			to bottom,
			color-mix(in srgb, var(--tad-accent) 4%, transparent) 1px,
			transparent 1px
		);
	background-size: 32px 32px;
	opacity: 0.35;
	mask-image: radial-gradient(ellipse at 50% 30%, #000 40%, transparent 100%);
	-webkit-mask-image: radial-gradient(ellipse at 50% 30%, #000 40%, transparent 100%);
}

.tad-scanline {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	z-index: 1;
	background: linear-gradient(
		90deg,
		transparent 0%,
		color-mix(in srgb, var(--tad-accent) 50%, transparent) 50%,
		transparent 100%
	);
	box-shadow: 0 0 10px color-mix(in srgb, var(--tad-accent) 35%, transparent);
	pointer-events: none;
}

.tad-particles {
	z-index: 2;
}

.tad-corner {
	position: absolute;
	width: 14px;
	height: 14px;
	z-index: 10;
	pointer-events: none;
	border-color: var(--tad-accent);
	border-style: solid;
	border-width: 0;
	opacity: 0.8;
}

.tad-corner-tl {
	top: 6px;
	left: 6px;
	border-top-width: 2px;
	border-left-width: 2px;
}
.tad-corner-tr {
	top: 6px;
	right: 6px;
	border-top-width: 2px;
	border-right-width: 2px;
}
.tad-corner-bl {
	bottom: 6px;
	left: 6px;
	border-bottom-width: 2px;
	border-left-width: 2px;
}
.tad-corner-br {
	bottom: 6px;
	right: 6px;
	border-bottom-width: 2px;
	border-right-width: 2px;
}

/* Header */
.tad-header {
	position: relative;
	z-index: 5;
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	padding: 18px 24px 14px;
	border-bottom: 1px solid color-mix(in srgb, var(--tad-accent) 20%, transparent);
	flex-shrink: 0;
}

.tad-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.tad-title {
	font-size: 18px;
	font-weight: 700;
	color: var(--tad-fg);
	text-shadow: 0 0 12px color-mix(in srgb, var(--tad-accent) 25%, transparent);
	letter-spacing: 0.02em;
}

.tad-title-sub {
	font-size: 11px;
	color: var(--tad-fg-soft);
	display: flex;
	align-items: center;
	gap: 6px;
}
.tad-title-sub::before {
	content: '';
	display: inline-block;
	width: 5px;
	height: 5px;
	background: var(--tad-accent);
	box-shadow: 0 0 6px var(--tad-accent);
}

/* Body */
.tad-body {
	position: relative;
	z-index: 5;
	flex: 1;
	overflow-y: auto;
	padding: 18px 24px;
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.tad-desc {
	font-size: 12px;
	color: var(--tad-fg-soft);
	line-height: 1.5;
	padding: 10px 12px;
	background: color-mix(in srgb, var(--tad-accent) 8%, transparent);
	border: 1px solid color-mix(in srgb, var(--tad-accent) 20%, transparent);
	border-radius: 2px;
}

.tad-section-label {
	font-size: 12px;
	font-weight: 500;
	color: var(--tad-fg);
	letter-spacing: 0.02em;
}

.tad-target-options {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 10px;
}

.tad-target-option {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	padding: 18px 14px;
	border: 1px solid color-mix(in srgb, var(--tad-accent) 25%, transparent);
	border-radius: 2px;
	background: color-mix(in srgb, var(--tad-fg) 2%, transparent);
	color: var(--tad-fg-soft);
	cursor: pointer;
	transition:
		border-color 200ms ease,
		background 200ms ease,
		color 200ms ease,
		box-shadow 200ms ease;
	font-family: inherit;
}

.tad-target-option:hover {
	border-color: color-mix(in srgb, var(--tad-accent) 50%, transparent);
	background: color-mix(in srgb, var(--tad-accent) 6%, transparent);
	color: var(--tad-fg);
}

.tad-target-option.active {
	border-color: var(--tad-accent);
	background: color-mix(in srgb, var(--tad-accent) 12%, transparent);
	color: var(--tad-fg);
	box-shadow:
		0 0 14px color-mix(in srgb, var(--tad-accent) 18%, transparent),
		inset 0 0 20px color-mix(in srgb, var(--tad-accent) 5%, transparent);
}

.tad-target-label {
	font-size: 12px;
	font-weight: 500;
	letter-spacing: 0.02em;
}

.tad-info-tip {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding: 10px 12px;
	background: color-mix(in srgb, var(--tad-accent) 8%, transparent);
	border: 1px solid color-mix(in srgb, var(--tad-accent) 25%, transparent);
	border-radius: 2px;
	color: var(--tad-accent);
	font-size: 11px;
	line-height: 1.5;
}

.tad-info-tip svg {
	flex-shrink: 0;
	margin-top: 1px;
}

/* Form */
.tad-form {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.tad-form-row {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.tad-label {
	font-size: 12px;
	font-weight: 500;
	color: var(--tad-fg);
	letter-spacing: 0.02em;
	display: flex;
	align-items: center;
	gap: 4px;
}

.tad-input {
	width: 100%;
	padding: 8px 12px;
	border: 1px solid var(--tad-input-border);
	border-radius: 2px;
	background: color-mix(in srgb, var(--tad-fg) 3%, transparent);
	color: var(--tad-fg);
	font-size: 13px;
	outline: none;
	box-sizing: border-box;
	transition:
		border-color 200ms ease,
		background 200ms ease,
		box-shadow 200ms ease;
	font-family: inherit;
	line-height: 1.5;
}

.tad-input::placeholder {
	color: color-mix(in srgb, var(--tad-fg-soft) 60%, transparent);
}

.tad-input:focus {
	border-color: color-mix(in srgb, var(--tad-accent) 65%, transparent);
	background: color-mix(in srgb, var(--tad-fg) 5%, transparent);
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--tad-accent) 25%, transparent),
		0 0 14px color-mix(in srgb, var(--tad-accent) 10%, transparent);
}

.tad-input[readonly] {
	cursor: default;
	opacity: 0.85;
}

.tad-path-row {
	display: flex;
	gap: 8px;
}

.tad-path-input {
	flex: 1;
	min-width: 0;
}

.tad-form-error {
	font-size: 11px;
	color: #ff6b6b;
}

/* Footer */
.tad-footer {
	position: relative;
	z-index: 5;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 14px 24px 18px;
	border-top: 1px solid color-mix(in srgb, var(--tad-accent) 20%, transparent);
	flex-shrink: 0;
	gap: 12px;
}

.tad-footer-info {
	font-size: 11px;
	color: var(--tad-fg-soft);
}

.tad-footer-actions {
	display: flex;
	gap: 8px;
}

/* Buttons */
.tad-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	padding: 7px 16px;
	border: 1px solid color-mix(in srgb, var(--tad-accent) 30%, transparent);
	border-radius: 2px;
	background: transparent;
	color: var(--tad-fg-soft);
	font-size: 12px;
	font-family: inherit;
	cursor: pointer;
	transition: all 200ms ease;
	white-space: nowrap;
}

.tad-btn:hover {
	border-color: var(--tad-accent);
	color: var(--tad-fg);
	background: color-mix(in srgb, var(--tad-accent) 8%, transparent);
}

.tad-btn-primary {
	background: var(--tad-accent);
	border-color: var(--tad-accent);
	color: #fff;
	font-weight: 500;
	text-shadow: 0 0 8px color-mix(in srgb, var(--tad-accent) 40%, transparent);
}

.tad-btn-primary:hover {
	background: var(--tad-accent-hover);
	border-color: var(--tad-accent-hover);
	color: #fff;
	box-shadow: 0 0 16px color-mix(in srgb, var(--tad-accent) 30%, transparent);
}

.tad-btn-ghost {
	background: transparent;
}

.tad-btn-sm {
	padding: 6px 12px;
	font-size: 11px;
	flex-shrink: 0;
}

.tad-btn-icon {
	width: 30px;
	height: 30px;
	padding: 0;
	border-radius: 2px;
}

.tad-btn-close:hover {
	border-color: color-mix(in srgb, #ff6b6b 50%, transparent);
	color: #ff6b6b;
	background: color-mix(in srgb, #ff6b6b 8%, transparent);
}

/* Transition */
.tad-dialog-enter-active,
.tad-dialog-leave-active {
	transition:
		opacity 220ms ease,
		transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.tad-dialog-enter-from,
.tad-dialog-leave-to {
	opacity: 0;
	transform: scale(0.97) translateY(8px);
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
	.tad-dialog-enter-active,
	.tad-dialog-leave-active {
		transition: opacity 150ms ease;
	}
	.tad-dialog-enter-from,
	.tad-dialog-leave-to {
		transform: none;
	}
	.tad-btn,
	.tad-input,
	.tad-target-option {
		transition: none !important;
	}
}
</style>

<style>
/* Light theme — global (unscoped) to guarantee cascade works */
[data-theme='light'] .tad-mask {
	background: rgba(180, 190, 200, 0.45) !important;
	backdrop-filter: blur(8px);
}
[data-theme='light'] .tad-dialog {
	--tad-bg-0: #eef2f5 !important;
	--tad-bg-1: #dfe5eb !important;
	--tad-fg: #1a1d21 !important;
	--tad-fg-soft: #4a5058 !important;
	--tad-input-border: rgba(31, 157, 132, 0.25) !important;
	background: transparent;
	border-color: rgba(31, 157, 132, 0.3) !important;
	box-shadow:
		0 24px 80px rgba(0, 0, 0, 0.15),
		0 0 0 1px rgba(31, 157, 132, 0.12),
		0 0 40px rgba(31, 157, 132, 0.08) !important;
}
[data-theme='light'] .tad-bg-gradient {
	background:
		radial-gradient(ellipse 70% 50% at 80% 10%, rgba(31, 157, 132, 0.07), transparent 60%),
		radial-gradient(ellipse 60% 50% at 10% 90%, rgba(58, 168, 180, 0.05), transparent 55%),
		linear-gradient(180deg, #f0f3f6 0%, #dde3ea 100%) !important;
}
[data-theme='light'] .tad-bg-grid {
	opacity: 0.22 !important;
	background-image:
		linear-gradient(to right, rgba(31, 157, 132, 0.05) 1px, transparent 1px),
		linear-gradient(to bottom, rgba(31, 157, 132, 0.05) 1px, transparent 1px) !important;
}
[data-theme='light'] .tad-scanline {
	background: linear-gradient(
		90deg,
		transparent 0%,
		rgba(31, 157, 132, 0.35) 50%,
		transparent 100%
	) !important;
	box-shadow: 0 0 8px rgba(31, 157, 132, 0.2) !important;
	opacity: 0.6 !important;
}
[data-theme='light'] .tad-corner {
	border-color: #1f9d84 !important;
	opacity: 0.6 !important;
}
[data-theme='light'] .tad-header {
	border-bottom-color: rgba(31, 157, 132, 0.18) !important;
}
[data-theme='light'] .tad-title {
	color: #1a1d21 !important;
	text-shadow: none !important;
}
[data-theme='light'] .tad-title-sub {
	color: #4a5058 !important;
}
[data-theme='light'] .tad-title-sub::before {
	box-shadow: 0 0 4px rgba(31, 157, 132, 0.4) !important;
}
[data-theme='light'] .tad-desc {
	background: rgba(31, 157, 132, 0.06) !important;
	border-color: rgba(31, 157, 132, 0.2) !important;
	color: #4a5058 !important;
}
[data-theme='light'] .tad-section-label {
	color: #1a1d21 !important;
}
[data-theme='light'] .tad-target-option {
	background: rgba(255, 255, 255, 0.5) !important;
	border-color: rgba(31, 157, 132, 0.25) !important;
	color: #6b7280 !important;
}
[data-theme='light'] .tad-target-option:hover {
	border-color: rgba(31, 157, 132, 0.5) !important;
	background: rgba(31, 157, 132, 0.06) !important;
	color: #1a1d21 !important;
}
[data-theme='light'] .tad-target-option.active {
	border-color: #1f9d84 !important;
	background: rgba(31, 157, 132, 0.1) !important;
	color: #1a1d21 !important;
	box-shadow:
		0 0 12px rgba(31, 157, 132, 0.12),
		inset 0 0 16px rgba(31, 157, 132, 0.04) !important;
}
[data-theme='light'] .tad-info-tip {
	background: rgba(31, 157, 132, 0.06) !important;
	border-color: rgba(31, 157, 132, 0.25) !important;
	color: #17806d !important;
}
[data-theme='light'] .tad-label {
	color: #1a1d21 !important;
}
[data-theme='light'] .tad-input {
	background: rgba(255, 255, 255, 0.8) !important;
	border-color: rgba(31, 157, 132, 0.25) !important;
	color: #1a1d21 !important;
}
[data-theme='light'] .tad-input::placeholder {
	color: #8a9099 !important;
}
[data-theme='light'] .tad-input:focus {
	border-color: rgba(31, 157, 132, 0.55) !important;
	background: #fff !important;
	box-shadow:
		0 0 0 1px rgba(31, 157, 132, 0.2),
		0 0 12px rgba(31, 157, 132, 0.08) !important;
}
[data-theme='light'] .tad-form-error {
	color: #d63030 !important;
}
[data-theme='light'] .tad-footer {
	border-top-color: rgba(31, 157, 132, 0.18) !important;
}
[data-theme='light'] .tad-footer-info {
	color: #6b7280 !important;
}
[data-theme='light'] .tad-btn {
	background: rgba(255, 255, 255, 0.5) !important;
	border-color: rgba(31, 157, 132, 0.3) !important;
	color: #4a5058 !important;
}
[data-theme='light'] .tad-btn:hover {
	border-color: #1f9d84 !important;
	color: #1a1d21 !important;
	background: rgba(31, 157, 132, 0.08) !important;
}
[data-theme='light'] .tad-btn-primary {
	background: #1f9d84 !important;
	border-color: #1f9d84 !important;
	color: #fff !important;
	text-shadow: none !important;
}
[data-theme='light'] .tad-btn-primary:hover {
	background: #17806d !important;
	border-color: #17806d !important;
	box-shadow: 0 0 12px rgba(31, 157, 132, 0.25) !important;
}
[data-theme='light'] .tad-btn-ghost {
	background: transparent !important;
}
[data-theme='light'] .tad-btn-close:hover {
	border-color: rgba(214, 48, 48, 0.5) !important;
	color: #d63030 !important;
	background: rgba(214, 48, 48, 0.06) !important;
}
</style>
