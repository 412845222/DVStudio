<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    confirmText?: string
    closeText?: string
    disableConfirm?: boolean
  }>(),
  {
    title: '',
    confirmText: '确认',
    closeText: '关闭',
    disableConfirm: false,
  },
)

const emit = defineEmits<{ (e: 'confirm'): void; (e: 'close'): void }>()
</script>

<template>
  <div v-if="props.open" class="dvs-modal-overlay" @click.self="emit('close')">
    <div class="dvs-modal" role="dialog" aria-modal="true">
      <div class="dvs-modal-head">
        <div class="dvs-modal-title">{{ props.title }}</div>
        <button class="dvs-modal-x" type="button" aria-label="关闭" @click="emit('close')">×</button>
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
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  box-sizing: border-box;
  z-index: 50;
}

.dvs-modal {
  width: 100%;
  max-width: 860px;
  max-height: calc(100vh - 36px);
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-light);
  box-shadow: var(--vscode-shadow);
  display: flex;
  flex-direction: column;
}

.dvs-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 12px;
  border-bottom: 1px solid var(--vscode-border);
}

.dvs-modal-title {
  font-size: 14px;
  font-weight: 600;
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
  padding: 12px;
  overflow: auto;
  min-height: 0;
}

.dvs-modal-actions {
  padding: 10px 12px;
  border-top: 1px solid var(--vscode-border);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn {
  appearance: none;
  -webkit-appearance: none;
  border: none;
  border-radius: 0;
  padding: 8px 12px;
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
