<template>
	<Transition name="aiwf-rail-dialog">
		<div
			v-if="open"
			class="template-save-mask"
			data-bp-ui-overlay="true"
			@pointerdown.stop
			@mousedown.stop
			@contextmenu.prevent.stop
			@click.self="$emit('update:open', false)"
		>
			<div
				class="template-save-dialog"
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

				<div class="template-save-title">
					{{ scope === 'selection' ? t('aiworkflow.templateCenter.saveSelectionAsTemplate') : t('aiworkflow.templateCenter.saveFullAsTemplate') }}
				</div>

				<div class="template-save-form">
					<div class="template-form-field">
						<label class="template-form-label">{{ t('aiworkflow.templateCenter.templateName') }} *</label>
						<input
							v-model="form.name"
							class="template-form-input"
							type="text"
							:placeholder="t('aiworkflow.templateCenter.templateNamePlaceholder')"
							@keyup.enter="handleConfirm"
							ref="nameInputRef"
						/>
						<div v-if="nameError" class="template-form-error">{{ nameError }}</div>
					</div>

					<div class="template-form-field">
						<label class="template-form-label">{{ t('aiworkflow.templateCenter.templateDescription') }}</label>
						<textarea
							v-model="form.description"
							class="template-form-textarea"
							:placeholder="t('aiworkflow.templateCenter.templateDescriptionPlaceholder')"
							rows="3"
						></textarea>
					</div>

					<div class="template-form-field">
						<label class="template-form-label">{{ t('aiworkflow.templateCenter.templateCategory') }}</label>
						<select v-model="form.category" class="template-form-select">
							<option value="basic">{{ t('aiworkflow.templateCategory.basic') }}</option>
							<option value="video-generation">{{ t('aiworkflow.templateCategory.video-generation') }}</option>
							<option value="image-to-video">{{ t('aiworkflow.templateCategory.image-to-video') }}</option>
							<option value="text-to-image">{{ t('aiworkflow.templateCategory.text-to-image') }}</option>
							<option value="model3d">{{ t('aiworkflow.templateCategory.model3d') }}</option>
							<option value="comfyui">{{ t('aiworkflow.templateCategory.comfyui') }}</option>
							<option value="other">{{ t('aiworkflow.templateCategory.other') }}</option>
						</select>
					</div>

					<div class="template-form-field">
						<label class="template-form-label">{{ t('aiworkflow.templateCenter.templateTags') }}</label>
						<div class="template-tags-input-wrap">
							<div class="template-tags-list">
								<span v-for="(tag, index) in form.tags" :key="index" class="template-tag-item">
									{{ tag }}
									<button type="button" class="template-tag-remove" @click="removeTag(index)">×</button>
								</span>
							</div>
							<input
								v-model="tagInput"
								class="template-tag-input"
								type="text"
								:placeholder="t('aiworkflow.templateCenter.templateTagsPlaceholder')"
								@keyup.enter.prevent="addTag"
								@keydown.backspace="handleTagBackspace"
							/>
						</div>
					</div>
				</div>

				<div class="template-save-actions">
					<button class="template-save-btn" type="button" @click="$emit('update:open', false)">
						{{ t('common.cancel') }}
					</button>
					<button class="template-save-btn is-primary" type="button" @click="handleConfirm">
						{{ t('common.confirm') }}
					</button>
				</div>
			</div>
		</div>
	</Transition>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { SaveTemplateOptions, TemplateCategory, TemplateScope } from '../../aiworkflow/template/types'
import { useI18n } from '../../i18n'

const props = defineProps<{
	open: boolean
	scope: TemplateScope
	prefillName?: string
	nodeIds?: string[]
}>()

const emit = defineEmits<{
	(e: 'update:open', value: boolean): void
	(e: 'confirm', options: SaveTemplateOptions): void
}>()

const { t } = useI18n()

const nameInputRef = ref<HTMLInputElement | null>(null)
const nameError = ref('')
const tagInput = ref('')

const form = ref<{
	name: string
	description: string
	category: TemplateCategory
	tags: string[]
}>({
	name: '',
	description: '',
	category: 'other',
	tags: []
})

watch(
	() => props.open,
	async (val) => {
		if (val) {
			form.value = {
				name: props.prefillName || '',
				description: '',
				category: 'other',
				tags: []
			}
			nameError.value = ''
			tagInput.value = ''
			await nextTick()
			nameInputRef.value?.focus()
			nameInputRef.value?.select()
		}
	}
)

function addTag() {
	const tag = tagInput.value.trim()
	if (tag && !form.value.tags.includes(tag)) {
		form.value.tags.push(tag)
	}
	tagInput.value = ''
}

function removeTag(index: number) {
	form.value.tags.splice(index, 1)
}

function handleTagBackspace(e: KeyboardEvent) {
	if (!tagInput.value && form.value.tags.length > 0) {
		form.value.tags.pop()
	}
}

function validate(): boolean {
	nameError.value = ''
	if (!form.value.name.trim()) {
		nameError.value = t('aiworkflow.templateCenter.nameRequired')
		return false
	}
	return true
}

function handleConfirm() {
	if (tagInput.value.trim()) {
		addTag()
	}
	if (!validate()) return

	emit('confirm', {
		name: form.value.name.trim(),
		description: form.value.description.trim() || undefined,
		category: form.value.category,
		tags: form.value.tags.length > 0 ? [...form.value.tags] : undefined,
		scope: props.scope,
		nodeIds: props.scope === 'selection' ? props.nodeIds : undefined
	})
	emit('update:open', false)
}
</script>

<style scoped>
.template-save-mask {
	position: fixed;
	inset: 0;
	z-index: 2200;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.75);
	backdrop-filter: blur(4px);
}

.template-save-dialog {
	--tc-accent: var(--theme-accent, #1f9d84);
	--tc-accent-hover: var(--theme-accent-hover, #27b99c);
	position: relative;
	width: 90vw;
	max-width: 480px;
	max-height: 85vh;
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

.template-save-title {
	font-size: 18px;
	font-weight: 600;
	color: var(--theme-text-primary, #edf2f4);
	margin-bottom: 20px;
}

.template-save-form {
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

.template-form-input,
.template-form-textarea,
.template-form-select {
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
	font-family: inherit;
}

.template-form-textarea {
	resize: vertical;
	min-height: 60px;
}

.template-form-input:focus,
.template-form-textarea:focus,
.template-form-select:focus {
	border-color: var(--tc-accent);
}

.template-form-input::placeholder,
.template-form-textarea::placeholder {
	color: rgba(174, 184, 189, 0.5);
}

.template-form-select {
	appearance: none;
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%23aeb8bd' stroke-width='1.2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
	background-repeat: no-repeat;
	background-position: right 10px center;
	padding-right: 30px;
	cursor: pointer;
}

.template-form-select option {
	background: #1a1a1a;
	color: var(--theme-text-primary, #edf2f4);
}

.template-tags-input-wrap {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	padding: 6px 8px;
	border: 1px solid color-mix(in srgb, var(--tc-accent) 30%, transparent);
	border-radius: 4px;
	background: rgba(0, 0, 0, 0.3);
	min-height: 36px;
	align-items: center;
}

.template-tags-input-wrap:focus-within {
	border-color: var(--tc-accent);
}

.template-tags-list {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.template-tag-item {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 2px 6px;
	background: color-mix(in srgb, var(--tc-accent) 15%, transparent);
	color: var(--tc-accent);
	border-radius: 3px;
	font-size: 11px;
}

.template-tag-remove {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 14px;
	height: 14px;
	padding: 0;
	border: none;
	background: none;
	color: var(--tc-accent);
	cursor: pointer;
	font-size: 14px;
	line-height: 1;
	border-radius: 2px;
	opacity: 0.7;
	transition: opacity 0.15s ease;
}

.template-tag-remove:hover {
	opacity: 1;
	background: color-mix(in srgb, var(--tc-accent) 25%, transparent);
}

.template-tag-input {
	flex: 1;
	min-width: 80px;
	padding: 2px 4px;
	border: none;
	background: transparent;
	color: var(--theme-text-primary, #edf2f4);
	font-size: 12px;
	outline: none;
}

.template-tag-input::placeholder {
	color: rgba(174, 184, 189, 0.5);
}

.template-form-error {
	font-size: 11px;
	color: #ff6b6b;
}

.template-save-actions {
	display: flex;
	justify-content: flex-end;
	gap: 10px;
	margin-top: 20px;
	padding-top: 16px;
	border-top: 1px solid color-mix(in srgb, var(--tc-accent) 15%, transparent);
}

.template-save-btn {
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

.template-save-btn:hover {
	border-color: var(--tc-accent);
	color: var(--theme-text-primary, #edf2f4);
}

.template-save-btn.is-primary {
	background: var(--tc-accent);
	border-color: var(--tc-accent);
	color: #fff;
}

.template-save-btn.is-primary:hover {
	background: var(--tc-accent-hover);
	border-color: var(--tc-accent-hover);
}
</style>
