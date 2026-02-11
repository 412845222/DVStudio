<template>
  <Teleport to="body">
    <div class="wf-toast-stack" aria-live="polite" aria-atomic="false">
      <div v-for="item in items" :key="item.id" class="wf-toast" :class="item.tone">
        <div class="wf-toast-body">{{ item.message }}</div>
        <button class="wf-toast-close" type="button" @click="emit('close', item.id)">
          关闭
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
export type ToastItem = {
  id: string
  message: string
  tone?: 'info' | 'warn' | 'error'
}

defineProps<{
  items: ToastItem[]
}>()

const emit = defineEmits<{
  (e: 'close', id: string): void
}>()
</script>

<style scoped>
.wf-toast-stack {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 80;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: min(320px, 60vw);
}

.wf-toast {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  color: var(--vscode-fg);
  padding: 10px 12px;
  border-radius: 8px;
  box-shadow: var(--vscode-shadow);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  animation: wf-toast-in 160ms ease-out both;
}

.wf-toast.warn {
  border-color: rgba(242, 157, 56, 0.7);
  background: rgba(242, 157, 56, 0.12);
}

.wf-toast.error {
  border-color: rgba(220, 86, 86, 0.75);
  background: rgba(220, 86, 86, 0.12);
}

.wf-toast-body {
  flex: 1;
}

.wf-toast-close {
  border: 1px solid var(--vscode-border);
  background: transparent;
  color: var(--vscode-fg);
  padding: 4px 8px;
  cursor: pointer;
  font-size: 11px;
}

.wf-toast-close:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

@keyframes wf-toast-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
