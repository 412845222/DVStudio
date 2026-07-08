<template>
  <div class="m3de-statusbar">
    <div class="sq-container">
      <span
        v-for="p in particles"
        :key="p.id"
        class="sq-particle"
        :style="p.style"
      />
    </div>
    <div class="m3de-corner m3de-corner-tl" />
    <div class="m3de-corner m3de-corner-br" />

    <div class="m3de-statusbar-left">
      <span class="m3de-status-item">
        <span class="m3de-status-dot" :class="statusDotClass" />
        {{ statusText }}
      </span>
      <span class="m3de-statusbar-sep" />
      <span class="m3de-status-item">
        <span class="m3de-status-key">{{ verticesLabel }}:</span>
        <span class="m3de-status-val">{{ vertexCount.toLocaleString() }}</span>
      </span>
      <span class="m3de-status-item">
        <span class="m3de-status-key">{{ trianglesLabel }}:</span>
        <span class="m3de-status-val">{{ triangleCount.toLocaleString() }}</span>
      </span>
    </div>

    <div class="m3de-statusbar-right">
      <span v-if="fps > 0" class="m3de-status-item m3de-fps" :class="{ 'm3de-fps-ok': fps >= 50, 'm3de-fps-warn': fps < 50 && fps >= 30, 'm3de-fps-bad': fps < 30 }">
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.2">
          <circle cx="8" cy="8" r="6"/>
          <path d="M8 4v4l3 2"/>
        </svg>
        {{ fps }} FPS
      </span>
      <span class="m3de-statusbar-sep" />
      <span class="m3de-status-item" v-if="selectedName">
        <span class="m3de-status-key">{{ selectedLabel }}:</span>
        <span class="m3de-status-val m3de-status-selected">{{ selectedName }}</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../../../i18n'
import { useSquareParticles } from '../../../composables/useSquareParticles'

const { t } = useI18n()

const { particles } = useSquareParticles({
  count: 2,
  baseOpacity: 0.2,
  minSize: 1,
  maxSize: 3,
  seed: 99991
})

interface Props {
  loading: boolean
  loadProgress: number
  vertexCount: number
  triangleCount: number
  fps: number
  selectedName: string
  errorMessage?: string
}

const props = defineProps<Props>()

const statusDotClass = computed(() => {
  if (props.errorMessage) return 'error'
  if (props.loading) return 'loading'
  return 'ready'
})

const statusText = computed(() => {
  if (props.errorMessage) return props.errorMessage
  if (props.loading) return `${t('nodes.model3d.loading')} ${Math.round(props.loadProgress)}%`
  return t('nodes.model3d.ready')
})

const verticesLabel = computed(() => t('nodes.model3d.vertices'))
const trianglesLabel = computed(() => t('nodes.model3d.triangles'))
const selectedLabel = computed(() => t('nodes.model3d.selected'))
</script>

<style scoped>
.m3de-statusbar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  font-size: 10px;
  color: var(--wf-text-muted);
  background: var(--wf-surface-glass, linear-gradient(0deg, color-mix(in srgb, var(--wf-primary) 3%, rgba(18, 21, 25, 0.95)), rgba(15, 18, 22, 0.92)));
  border-top: 1px solid color-mix(in srgb, var(--wf-primary) 18%, var(--wf-border-subtle, rgba(255, 255, 255, 0.04)));
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  gap: 8px;
  overflow: hidden;
  font-family: 'Consolas', 'Monaco', monospace;
}

.m3de-corner {
  position: absolute;
  width: 7px;
  height: 7px;
  border: 1.5px solid color-mix(in srgb, var(--wf-primary) 45%, transparent);
  box-shadow: 0 0 4px color-mix(in srgb, var(--wf-primary) 20%, transparent);
  pointer-events: none;
  z-index: 2;
}

.m3de-corner-tl { top: 2px; left: 2px; border-right: none; border-bottom: none; }
.m3de-corner-br { bottom: 2px; right: 2px; border-left: none; border-top: none; }

.m3de-statusbar-left,
.m3de-statusbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.m3de-status-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.m3de-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 0;
  flex-shrink: 0;
}

.m3de-status-dot.ready {
  background: var(--wf-primary);
  box-shadow: 0 0 6px var(--wf-primary);
}

.m3de-status-dot.loading {
  background: #e8c858;
  box-shadow: 0 0 6px #e8c858;
  animation: m3de-pulse 1s ease-in-out infinite;
}

.m3de-status-dot.error {
  background: #e85858;
  box-shadow: 0 0 6px #e85858;
}

@keyframes m3de-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.m3de-statusbar-sep {
  width: 1px;
  height: 10px;
  background: color-mix(in srgb, var(--wf-primary) 20%, transparent);
}

.m3de-status-key {
  color: var(--wf-text-secondary);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.m3de-status-val {
  color: var(--wf-text);
}

.m3de-status-selected {
  color: var(--wf-primary);
  text-shadow: 0 0 4px color-mix(in srgb, var(--wf-primary) 30%, transparent);
}

.m3de-fps {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  background: var(--wf-control-bg, rgba(0, 0, 0, 0.3));
  border: 1px solid var(--wf-border-subtle, transparent);
}

.m3de-fps.m3de-fps-ok {
  color: #58e88a;
  border-color: color-mix(in srgb, #58e88a 25%, transparent);
}

.m3de-fps.m3de-fps-warn {
  color: #e8c858;
  border-color: color-mix(in srgb, #e8c858 25%, transparent);
}

.m3de-fps.m3de-fps-bad {
  color: #e85858;
  border-color: color-mix(in srgb, #e85858 25%, transparent);
}

.m3de-fps svg {
  opacity: 0.8;
}
</style>
