<template>
  <button
    class="task-queue-btn"
    type="button"
    :class="{ active: hasActive, 'panel-open': panelVisible }"
    :aria-label="t('taskQueue.title')"
    :title="buttonTitle"
    @click="onClick"
  >
    <div class="sq-container" aria-hidden="true">
      <span
        v-for="p in btnParticles"
        :key="p.id"
        class="sq-particle"
        :class="{ 'sq-running': hasActive }"
        :style="p.style"
      ></span>
    </div>
    <span class="btn-frame" aria-hidden="true">
      <span class="corner tl"></span>
      <span class="corner tr"></span>
      <span class="corner bl"></span>
      <span class="corner br"></span>
    </span>
    <svg class="task-queue-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="1"/>
      <path d="M9 9h6M9 13h6M9 17h4"/>
    </svg>
    <span v-if="activeCount > 0" class="task-count-badge">{{ activeCount > 99 ? '99+' : activeCount }}</span>
    <div class="task-progress-mini" v-if="hasActive">
      <div class="task-progress-mini-bar" :style="{ width: overallProgress + '%' }">
        <div class="progress-mini-glow" />
      </div>
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { TaskQueueStore } from '../../store/taskqueue'
import { useI18n } from '../../i18n'

const { t } = useI18n()

const activeCount = computed(() => TaskQueueStore.state.summary.activeCount || 0)
const hasActive = computed(() => activeCount.value > 0)
const overallProgress = computed(() => Math.round(TaskQueueStore.state.summary.overallProgress || 0))
const panelVisible = computed(() => TaskQueueStore.state.panelVisible)

const buttonTitle = computed(() => {
  if (activeCount.value > 0) {
    return t('taskQueue.runningCount', { count: activeCount.value, progress: overallProgress.value })
  }
  return t('taskQueue.title')
})

const btnParticles = computed(() => {
  if (!hasActive.value) return []
  return Array.from({ length: 3 }, (_, i) => ({
    id: `bp-${i}`,
    style: {
      width: '2px',
      height: '2px',
      left: `${15 + i * 25}%`,
      bottom: '0',
      '--sq-color': 'var(--pl-accent)',
      '--sq-duration': '4s',
      '--sq-delay': `${i * -1.2}s`,
      '--sq-opacity': '0.6',
      '--sq-sway': '4px',
    } as Record<string, string>,
  }))
})

function onClick() {
  TaskQueueStore.dispatch('togglePanel')
}
</script>

<style scoped>
.task-queue-btn {
  position: relative;
  appearance: none;
  -webkit-appearance: none;
  border: 1px solid color-mix(in srgb, var(--pl-accent, #1f9d84) 25%, var(--theme-border, #3c3c3c));
  border-radius: 2px;
  background: color-mix(in srgb, var(--pl-fg, #eaf2f5) 4%, transparent);
  color: var(--pl-fg-soft, #9aa0a6);
  height: 26px;
  min-width: 36px;
  padding: 0 8px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  overflow: hidden;
  -webkit-app-region: no-drag;
  transition: background 200ms ease, border-color 200ms ease, color 200ms ease, box-shadow 200ms ease;
}

.task-queue-btn:hover {
  background: color-mix(in srgb, var(--pl-accent, #1f9d84) 10%, transparent);
  border-color: color-mix(in srgb, var(--pl-accent, #1f9d84) 50%, transparent);
  color: var(--pl-fg, #eaf2f5);
  box-shadow: 0 0 12px color-mix(in srgb, var(--pl-accent, #1f9d84) 18%, transparent);
}

.task-queue-btn.active {
  border-color: color-mix(in srgb, var(--pl-accent, #1f9d84) 55%, transparent);
  color: var(--pl-glow-1, #27b99c);
}

.task-queue-btn.panel-open {
  background: color-mix(in srgb, var(--pl-accent, #1f9d84) 12%, transparent);
  border-color: color-mix(in srgb, var(--pl-accent, #1f9d84) 60%, transparent);
  box-shadow: 0 0 14px color-mix(in srgb, var(--pl-accent, #1f9d84) 22%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--pl-accent, #1f9d84) 20%, transparent);
}

.sq-container {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.btn-frame {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.btn-frame .corner {
  position: absolute;
  width: 5px;
  height: 5px;
}

.btn-frame .corner.tl { top: 2px; left: 2px; border-top: 1px solid currentColor; border-left: 1px solid currentColor; color: color-mix(in srgb, var(--pl-accent, #1f9d84) 50%, transparent); }
.btn-frame .corner.tr { top: 2px; right: 2px; border-top: 1px solid currentColor; border-right: 1px solid currentColor; color: color-mix(in srgb, var(--pl-accent, #1f9d84) 50%, transparent); }
.btn-frame .corner.bl { bottom: 2px; left: 2px; border-bottom: 1px solid currentColor; border-left: 1px solid currentColor; color: color-mix(in srgb, var(--pl-accent, #1f9d84) 50%, transparent); }
.btn-frame .corner.br { bottom: 2px; right: 2px; border-bottom: 1px solid currentColor; border-right: 1px solid currentColor; color: color-mix(in srgb, var(--pl-accent, #1f9d84) 50%, transparent); }

.task-queue-icon {
  width: 14px;
  height: 14px;
  position: relative;
  z-index: 1;
}

.task-count-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 1px;
  background: var(--pl-accent, #1f9d84);
  color: var(--pl-fg, #eaf2f5);
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 9px;
  line-height: 14px;
  text-align: center;
  font-weight: 700;
  letter-spacing: 0.04em;
  z-index: 2;
  box-shadow: 0 0 8px color-mix(in srgb, var(--pl-accent, #1f9d84) 50%, transparent);
}

.task-progress-mini {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: color-mix(in srgb, var(--pl-accent, #1f9d84) 10%, transparent);
  overflow: hidden;
}

.task-progress-mini-bar {
  position: relative;
  height: 100%;
  background: linear-gradient(90deg, var(--pl-accent, #1f9d84), var(--pl-glow-1, #27b99c));
  transition: width 0.3s ease;
}

.progress-mini-glow {
  position: absolute;
  right: 0;
  top: -1px;
  width: 4px;
  height: 4px;
  background: var(--pl-glow-1, #27b99c);
  border-radius: 1px;
  filter: blur(2px);
}
</style>
