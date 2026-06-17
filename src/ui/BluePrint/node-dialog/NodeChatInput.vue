<template>
  <div class="bp-node-chat-input-wrap">
    <textarea
      ref="textareaRef"
      class="bp-node-chat-textarea"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :rows="minRows"
      @input="onInput"
      @keydown="onKeydown"
      @focus="onFocus"
      @blur="onBlur"
    />
    <div class="bp-node-chat-input-footer">
      <span class="bp-node-chat-char-count">{{ charCount }}{{ maxLength ? `/${maxLength}` : '' }}</span>
      <span v-if="focused" class="bp-node-chat-hint">
        <kbd>Enter</kbd> 发送 · <kbd>Shift</kbd>+<kbd>Enter</kbd> 换行
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    disabled?: boolean
    maxLength?: number
    minRows?: number
    maxRows?: number
    autoResize?: boolean
  }>(),
  {
    placeholder: '输入提示词...',
    disabled: false,
    maxLength: 2000,
    minRows: 2,
    maxRows: 8,
    autoResize: true,
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

const clampText = (text: string): string => {
  if (props.maxLength && text.length > props.maxLength) {
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
    if (props.modelValue.trim() && !props.disabled) {
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
  border: none;
  outline: none;
  background: transparent;
  color: var(--vscode-fg, #e0e0e0);
  font-size: 14px;
  line-height: 1.6;
  padding: 12px 14px 28px 14px;
  font-family: inherit;
  box-sizing: border-box;
  transition: height 0.15s ease;
}

.bp-node-chat-textarea::placeholder {
  color: var(--vscode-fg-muted, #666);
  opacity: 0.7;
}

.bp-node-chat-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bp-node-chat-input-footer {
  position: absolute;
  bottom: 6px;
  left: 14px;
  right: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  pointer-events: none;
  font-size: 11px;
  color: var(--vscode-fg-muted, #666);
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
  background: var(--vscode-editorWidget-background, #2d2d2d);
  border: 1px solid var(--vscode-border, #444);
  border-radius: 0;
  line-height: 1;
}
</style>
