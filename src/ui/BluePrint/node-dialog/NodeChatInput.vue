<template>
	<div class="bp-node-chat-input-wrap">
		<textarea
			ref="textareaRef"
			class="bp-node-chat-textarea"
			:value="modelValue"
			:placeholder="resolvedPlaceholder"
			:disabled="disabled"
			:rows="minRows"
			@wheel.stop
			@input="onInput"
			@keydown="onKeydown"
			@focus="onFocus"
			@blur="onBlur"
		/>
		<div class="bp-node-chat-input-footer">
			<span class="bp-node-chat-char-count">
				{{ charCount }}{{ maxLength ? `/${maxLength}` : '' }}
			</span>
			<span v-if="focused" class="bp-node-chat-hint">
				<kbd>Enter</kbd>
				{{ t('aichat.nodeChat.sendShortcut') }} ·
				<kbd>Shift</kbd>
				+
				<kbd>Enter</kbd>
				{{ t('aichat.nodeChat.newlineShortcut') }}
			</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from '../../../i18n'

const { t } = useI18n()

const props = withDefaults(
	defineProps<{
		modelValue: string
		placeholder?: string
		disabled?: boolean
		maxLength?: number
		minRows?: number
		maxRows?: number
		autoResize?: boolean
		canSubmitEmpty?: boolean
	}>(),
	{
		placeholder: undefined,
		disabled: false,
		maxLength: undefined,
		minRows: 2,
		maxRows: 16,
		autoResize: true,
		canSubmitEmpty: false
	}
)

const emit = defineEmits<{
	(e: 'update:modelValue', value: string): void
	(e: 'submit'): void
	(e: 'focus'): void
	(e: 'blur'): void
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const focused = ref(false)
const charCount = computed(() => props.modelValue.length)

const resolvedPlaceholder = computed(() => {
	return props.placeholder || t('aichat.nodeChat.placeholder')
})

const clampText = (text: string): string => {
	if (typeof props.maxLength === 'number' && props.maxLength > 0 && text.length > props.maxLength) {
		return text.slice(0, props.maxLength)
	}
	return text
}

const onInput = (e: Event) => {
	const target = e.target as HTMLTextAreaElement
	const value = clampText(target.value)
	emit('update:modelValue', value)
	if (props.autoResize) {
		adjustHeight()
	}
}

const adjustHeight = () => {
	const el = textareaRef.value
	if (!el) return
	nextTick(() => {
		el.style.height = 'auto'
		const lineHeight = 22
		const minHeight = props.minRows! * lineHeight + 16
		const maxHeight = props.maxRows! * lineHeight + 16
		const scrollHeight = Math.max(minHeight, Math.min(el.scrollHeight, maxHeight))
		el.style.height = `${scrollHeight}px`
	})
}

const onKeydown = (e: KeyboardEvent) => {
	if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
		e.preventDefault()
		const canSubmit = props.canSubmitEmpty ? !props.disabled : (props.modelValue.trim() && !props.disabled)
		if (canSubmit) {
			emit('submit')
		}
	}
}

const onFocus = () => {
	focused.value = true
	emit('focus')
}

const onBlur = () => {
	focused.value = false
	emit('blur')
}

watch(
	() => props.modelValue,
	() => {
		if (props.autoResize) {
			adjustHeight()
		}
	},
	{ immediate: true }
)

const focus = () => {
	nextTick(() => {
		textareaRef.value?.focus()
	})
}

const blur = () => {
	textareaRef.value?.blur()
}

defineExpose({ focus, blur })
</script>

<style scoped>
.bp-node-chat-input-wrap {
	position: relative;
	width: 100%;
}

.bp-node-chat-textarea {
	width: 100%;
	resize: none;
	border: 1px solid transparent;
	border-radius: 2px;
	outline: none;
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 88%, transparent);
	color: var(--wf-text, #edf2f4);
	font-size: 14px;
	line-height: 1.6;
	padding: 10px 12px 26px 12px;
	margin: 6px 10px 6px 10px;
	width: calc(100% - 20px);
	font-family: inherit;
	box-sizing: border-box;
	overflow-y: auto;
	transition:
		border-color 0.22s ease,
		box-shadow 0.22s ease,
		background-color 0.22s ease,
		height 0.15s ease;
}

.bp-node-chat-textarea:focus {
	border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 60%, transparent);
	box-shadow:
		0 0 0 2px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent),
		0 0 12px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 96%, transparent);
	outline: none;
}

.bp-node-chat-textarea::placeholder {
	color: color-mix(in srgb, var(--wf-text-muted, #aeb8bd) 60%, transparent);
	opacity: 0.7;
}

.bp-node-chat-textarea:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.bp-node-chat-input-footer {
	position: absolute;
	bottom: 12px;
	left: 22px;
	right: 22px;
	display: flex;
	justify-content: space-between;
	align-items: center;
	pointer-events: none;
	font-size: 11px;
	color: var(--wf-text-muted, #aeb8bd);
}

.bp-node-chat-char-count {
	opacity: 0.6;
}

.bp-node-chat-hint {
	opacity: 0.7;
}

.bp-node-chat-hint kbd {
	display: inline-block;
	padding: 1px 5px;
	margin: 0 1px;
	font-size: 10px;
	font-family: monospace;
	background: color-mix(in srgb, var(--wf-surface-muted, rgba(36, 42, 48, 0.9)) 80%, transparent);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
	border-radius: 2px;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 75%, transparent);
	line-height: 1;
}
</style>
