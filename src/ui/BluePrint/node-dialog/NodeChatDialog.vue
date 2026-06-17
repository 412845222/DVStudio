<template>
  <Transition name="bp-dialog-fade">
    <div
      v-if="visible && nodeId && nodeType"
      class="bp-node-chat-dialog"
      :class="[`bp-node-chat-${nodeType}`, { 'is-submitting': submitting }]"
      :style="dialogPositionStyle"
      data-wf-node-drag-ignore="true"
      @pointerdown.stop
      @mousedown.stop
      @click.stop
      @contextmenu.stop
    >
      <div class="bp-node-chat-surface glass-surface">
        <div class="bp-node-chat-header">
          <div class="bp-node-chat-title-wrap">
            <span class="bp-node-chat-icon">{{ typeIcon }}</span>
            <span class="bp-node-chat-title">{{ typeLabel }}</span>
          </div>
          <button
            class="bp-node-chat-close"
            type="button"
            :disabled="submitting"
            @click="handleClose"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="bp-node-chat-body">
          <div
            v-if="showInputParamRefs && inputParamPreviewRefsResolved.length > 0"
            class="bp-node-chat-input-param-refs"
          >
            <div
              v-for="(item, index) in inputParamPreviewRefsResolved"
              :key="`param-ref-${item.edgeId || `${item.fromNodeId}:${item.fromAnchorId}:${item.kind}` || index}`"
              class="bp-node-chat-param-ref-item"
              :class="`is-${item.kind}`"
              :title="paramRefTitle(item, index)"
            >
              <img
                v-if="item.previewUrl"
                class="bp-node-chat-param-ref-thumb"
                :src="item.previewUrl"
                :alt="item.label || item.name || item.kind"
                loading="lazy"
                decoding="async"
              />
              <span v-else class="bp-node-chat-param-ref-icon">{{ paramRefIcon(item) }}</span>
              <span class="bp-node-chat-param-ref-main">
                <span class="bp-node-chat-param-ref-label">{{ item.label || item.name || fallbackParamLabel(item, index) }}</span>
                <span
                  v-if="paramRefSubline(item)"
                  class="bp-node-chat-param-ref-sub"
                >
                  {{ paramRefSubline(item) }}
                </span>
              </span>
              <button
                class="bp-node-chat-param-ref-remove"
                type="button"
                title="断开上游参数"
                @click.stop="handleRemoveParamRef(item)"
              >
                ×
              </button>
            </div>
          </div>
          <NodeChatInput
            ref="inputRef"
            :modelValue="draft"
            :placeholder="placeholder"
            :disabled="submitting"
            @update:modelValue="onDraftUpdate"
            @submit="handleSubmit"
          />
        </div>

        <div class="bp-node-chat-footer">
          <div class="bp-node-chat-footer-left">
            <button
              class="bp-node-chat-btn bp-node-chat-btn-secondary"
              type="button"
              disabled
              title="提示词库"
            >
              提示词库
            </button>
            <button
              class="bp-node-chat-btn bp-node-chat-btn-secondary"
              type="button"
              disabled
              title="增强提示词"
            >
              增强提示词
            </button>
          </div>
          <div class="bp-node-chat-actions">
            <button
              class="bp-node-chat-btn bp-node-chat-btn-secondary"
              type="button"
              :disabled="submitting"
              @click="toggleParams"
            >
              {{ showParams ? '收起参数' : '参数设置' }}
            </button>
            <button
              class="bp-node-chat-btn bp-node-chat-btn-primary"
              type="button"
              :disabled="submitDisabled"
              @click="handleSubmit"
            >
              <span v-if="submitting" class="bp-node-chat-loading"></span>
              {{ submitting ? '生成中...' : '发送' }}
            </button>
          </div>
        </div>
      </div>

      <NodeChatParamPanel
        v-if="showParams"
        class="bp-node-chat-param-popover"
        :node-type="nodeType"
        :params="currentParams"
        :disabled="submitting"
        @update:params="onParamsUpdate"
      />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { WorkflowNodeChatType, WorkflowNodeChatSubmitPayload } from '../../../aiworkflow/types'
import {
  NODE_CHAT_TYPE_LABELS,
  NODE_CHAT_TYPE_ICONS,
  NODE_CHAT_PLACEHOLDERS,
  NODE_CHAT_TYPE_DESCRIPTIONS,
  getDefaultParamsForType,
} from './nodeChatConfig'
import NodeChatInput from './NodeChatInput.vue'
import NodeChatParamPanel from './NodeChatParamPanel.vue'
import type { InputParamPreviewRef } from './index'

const props = defineProps<{
  visible: boolean
  nodeId: string | null
  nodeType: WorkflowNodeChatType | null
  draft: string
  submitting: boolean
  params: Record<string, any>
  nodeWidth?: number
  inputParamPreviewRefs?: InputParamPreviewRef[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update:draft', value: string): void
  (e: 'update:params', params: Record<string, any>): void
  (e: 'submit', payload: WorkflowNodeChatSubmitPayload): void
  (e: 'remove-param-ref', item: InputParamPreviewRef): void
}>()

const inputRef = ref<InstanceType<typeof NodeChatInput> | null>(null)
const showParams = ref(false)

const typeLabel = computed(() => {
  if (!props.nodeType) return ''
  return NODE_CHAT_TYPE_LABELS[props.nodeType]
})

const typeIcon = computed(() => {
  if (!props.nodeType) return ''
  return NODE_CHAT_TYPE_ICONS[props.nodeType]
})

const placeholder = computed(() => {
  if (!props.nodeType) return '输入提示词...'
  return NODE_CHAT_PLACEHOLDERS[props.nodeType]
})

const typeDescription = computed(() => {
  if (!props.nodeType) return ''
  return NODE_CHAT_TYPE_DESCRIPTIONS[props.nodeType]
})

const currentParams = computed(() => {
  if (props.nodeType && props.params[props.nodeType]) {
    return props.params[props.nodeType]
  }
  return {}
})

const showInputParamRefs = computed(() => {
  const type = props.nodeType
  return type === 'image' || type === 'text' || type === 'video' || type === 'model3d'
})

const inputParamPreviewRefsResolved = computed(() => {
  return props.inputParamPreviewRefs ?? []
})

const submitDisabled = computed(() => {
  const hasConnectedParams = inputParamPreviewRefsResolved.value.length > 0
  return props.submitting || (!props.draft.trim() && !hasConnectedParams)
})

const fallbackParamLabel = (item: InputParamPreviewRef, index: number) => {
  if (item.kind === 'text') return `文本 ${index + 1}`
  if (item.kind === 'image') return `图片 ${index + 1}`
  if (item.kind === 'video') return `视频 ${index + 1}`
  return `3D 模型 ${index + 1}`
}

const paramRefIcon = (item: InputParamPreviewRef) => {
  if (item.kind === 'image') return '图'
  if (item.kind === 'video') return '视'
  if (item.kind === 'model3d') return '3D'
  return 'T'
}

const paramRefSubline = (item: InputParamPreviewRef) => {
  if (item.kind === 'text') return item.text || ''
  return item.meta || ''
}

const paramRefTitle = (item: InputParamPreviewRef, index: number) => {
  const header = item.label || item.name || fallbackParamLabel(item, index)
  const subline = item.kind === 'text' ? (item.text || '') : (item.meta || '')
  return subline ? `${header}\n\n${subline}` : header
}

const handleRemoveParamRef = (item: InputParamPreviewRef) => {
  emit('remove-param-ref', item)
}

const dialogPositionStyle = computed(() => {
  const width = props.nodeWidth || 280
  return {
    width: `${Math.max(width, 320)}px`,
  }
})

const handleClose = () => {
  if (props.submitting) return
  emit('close')
}

const onDraftUpdate = (value: string) => {
  emit('update:draft', value)
}

const handleSubmit = () => {
  if (submitDisabled.value || !props.nodeId || !props.nodeType) return
  const payload: WorkflowNodeChatSubmitPayload = {
    nodeId: props.nodeId,
    nodeType: props.nodeType,
    prompt: props.draft.trim(),
    params: currentParams.value,
  }
  emit('submit', payload)
}

const onParamsUpdate = (nextParams: Record<string, any>) => {
  if (!props.nodeType) return
  const merged = { ...props.params, [props.nodeType]: nextParams }
  emit('update:params', merged)
}

const toggleParams = () => {
  showParams.value = !showParams.value
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.visible) {
    handleClose()
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      showParams.value = false
      nextTick(() => {
        inputRef.value?.focus()
      })
    }
  }
)

watch(
  () => props.nodeType,
  (type) => {
    if (type && !props.params[type]) {
      const defaults = getDefaultParamsForType(type)
      const merged = { ...props.params, [type]: defaults }
      emit('update:params', merged)
    }
  },
  { immediate: true }
)

watch(
  () => props.visible,
  (visible, previous) => {
    if (visible && !previous) window.addEventListener('keydown', onKeydown)
    if (!visible && previous) window.removeEventListener('keydown', onKeydown)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.bp-node-chat-dialog {
  position: absolute;
  left: 50%;
  top: 100%;
  z-index: 100;
  margin-top: 16px;
  max-width: min(420px, calc(100vw - 40px));
  min-width: 320px;
  transform: translateX(-50%);
  pointer-events: auto;
  animation: bp-dialog-slide-in 0.2s ease-out;
}

.bp-node-chat-surface {
  border-radius: 0;
  box-shadow:
    0 8px 32px color-mix(in srgb, black 40%, transparent),
    0 2px 8px color-mix(in srgb, black 20%, transparent);
  border: 1px solid var(--vscode-border, #444);
  width: 100%;
}

.bp-node-chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--vscode-border) 30%, transparent);
}

.bp-node-chat-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bp-node-chat-icon {
  font-size: 14px;
}

.bp-node-chat-title {
  font-size: 13px;
  font-weight: 600;
}

.bp-node-chat-text .bp-node-chat-title {
  color: #f59e0b;
}

.bp-node-chat-image .bp-node-chat-title {
  color: #3b82f6;
}

.bp-node-chat-video .bp-node-chat-title {
  color: #22c55e;
}

.bp-node-chat-model3d .bp-node-chat-title {
  color: #a855f7;
}

.bp-node-chat-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--vscode-fg-muted, #888);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.bp-node-chat-close:hover:not(:disabled) {
  background: color-mix(in srgb, var(--vscode-errorForeground) 20%, transparent);
  color: var(--vscode-errorForeground, #f48771);
}

.bp-node-chat-close:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.bp-node-chat-body {
  padding: 4px 0;
}

.bp-node-chat-input-param-refs {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 10px 6px;
}

.bp-node-chat-param-ref-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--vscode-border) 40%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--vscode-editorWidget-background, #252526) 80%, transparent);
}

.bp-node-chat-param-ref-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--vscode-editorWidget-background, #252526) 55%, transparent);
  color: var(--vscode-fg, #ccc);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.bp-node-chat-param-ref-thumb {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--vscode-editorWidget-background, #252526) 92%, transparent);
}

.bp-node-chat-param-ref-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.bp-node-chat-param-ref-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--vscode-fg, #ddd);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bp-node-chat-param-ref-sub {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--vscode-fg-muted, #aaa);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bp-node-chat-param-ref-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--vscode-fg-muted, #888);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.bp-node-chat-param-ref-remove:hover {
  background: color-mix(in srgb, var(--vscode-errorForeground) 20%, transparent);
  color: var(--vscode-errorForeground, #f48771);
}

.bp-node-chat-param-ref-item.is-text .bp-node-chat-param-ref-icon {
  background: color-mix(in srgb, #f59e0b 20%, transparent);
  color: #f59e0b;
}

.bp-node-chat-param-ref-item.is-image .bp-node-chat-param-ref-icon,
.bp-node-chat-param-ref-item.is-image .bp-node-chat-param-ref-label {
  color: #60a5fa;
}

.bp-node-chat-param-ref-item.is-video .bp-node-chat-param-ref-icon,
.bp-node-chat-param-ref-item.is-video .bp-node-chat-param-ref-label {
  color: #4ade80;
}

.bp-node-chat-param-ref-item.is-model3d .bp-node-chat-param-ref-icon,
.bp-node-chat-param-ref-item.is-model3d .bp-node-chat-param-ref-label {
  color: #c084fc;
}

.bp-node-chat-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-top: 1px solid color-mix(in srgb, var(--vscode-border) 30%, transparent);
  gap: 10px;
}

.bp-node-chat-footer-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.bp-node-chat-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.bp-node-chat-param-popover {
  position: absolute;
  left: 50%;
  top: calc(100% + 8px);
  transform: translateX(-50%);
  width: min(360px, calc(100vw - 48px));
  max-height: 360px;
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--vscode-border) 70%, transparent);
  border-radius: 0;
  background: color-mix(in srgb, var(--vscode-editorWidget-background, #252526) 96%, transparent);
  box-shadow: 0 18px 40px color-mix(in srgb, black 42%, transparent);
}

.bp-node-chat-btn {
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 0;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.bp-node-chat-btn-secondary {
  background: transparent;
  color: var(--vscode-fg, #ccc);
  border: 1px solid var(--vscode-border, #444);
}

.bp-node-chat-btn-secondary:hover:not(:disabled) {
  border-color: var(--vscode-border-accent, #3aa8b4);
  color: var(--vscode-border-accent, #3aa8b4);
}

.bp-node-chat-btn-primary {
  background: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #fff);
}

.bp-node-chat-btn-primary:hover:not(:disabled) {
  background: var(--vscode-button-hoverBackground, #1177bb);
}

.bp-node-chat-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bp-node-chat-text .bp-node-chat-btn-primary {
  background: color-mix(in srgb, #f59e0b 80%, transparent);
}

.bp-node-chat-image .bp-node-chat-btn-primary {
  background: color-mix(in srgb, #3b82f6 80%, transparent);
}

.bp-node-chat-video .bp-node-chat-btn-primary {
  background: color-mix(in srgb, #22c55e 80%, transparent);
}

.bp-node-chat-model3d .bp-node-chat-btn-primary {
  background: color-mix(in srgb, #a855f7 80%, transparent);
}

.bp-node-chat-loading {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid color-mix(in srgb, currentColor 30%, transparent);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: bp-spin 0.6s linear infinite;
}

@keyframes bp-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes bp-dialog-slide-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.bp-dialog-fade-enter-active,
.bp-dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}

.bp-dialog-fade-enter-from,
.bp-dialog-fade-leave-to {
  opacity: 0;
}
</style>
