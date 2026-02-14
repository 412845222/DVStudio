<template>
  <div v-if="open" class="fsprog-mask" @pointerdown.stop>
    <div class="fsprog-panel" @pointerdown.stop>
      <div class="fsprog-title">{{ title }}</div>
      <div v-if="detail" class="fsprog-detail">{{ detail }}</div>

      <div class="fsprog-bar-wrap" role="progressbar" :aria-valuenow="Math.round(clampedProgress * 100)">
        <div class="fsprog-bar" :style="{ width: Math.round(clampedProgress * 100) + '%' }" />
      </div>
      <div class="fsprog-percent">{{ Math.round(clampedProgress * 100) }}%</div>

      <div class="fsprog-actions">
        <button v-if="cancellable" class="fsprog-cancel" type="button" @click.stop="emit('cancel')">
          取消
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
  progress: number
  detail?: string
  cancellable?: boolean
}>()

const emit = defineEmits<{ (e: 'cancel'): void }>()

const clampedProgress = computed(() => {
  const p = Number(props.progress)
  if (!Number.isFinite(p)) return 0
  return Math.max(0, Math.min(1, p))
})
</script>

<style scoped>
.fsprog-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}

.fsprog-panel {
  width: min(520px, calc(100vw - 48px));
  border: 1px solid var(--vscode-border);
  border-radius: 10px;
  background: var(--dweb-defualt);
  padding: 14px 14px 12px;
}

.fsprog-title {
  font-size: 13px;
  font-weight: 600;
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
  box-shadow: 0 0 10px var(--vscode-border-accent), 0 0 18px var(--vscode-border-accent);
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
  margin-top: 10px;
}

.fsprog-cancel {
  border: 1px solid var(--vscode-border);
  border-radius: 8px;
  background: transparent;
  color: var(--vscode-fg);
  padding: 6px 10px;
  cursor: pointer;
}

.fsprog-cancel:hover {
  border-color: var(--vscode-border-accent);
}
</style>
