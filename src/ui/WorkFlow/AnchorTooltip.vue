<template>
  <Transition name="wf-tooltip">
    <div
      v-if="visible"
      class="wf-anchor-tooltip"
      :class="[`wf-anchor-tooltip--${direction}`]"
      :style="tooltipStyle"
    >
      <div class="wf-anchor-tooltip__arrow" />
      <div class="wf-anchor-tooltip__content">
        <div class="wf-anchor-tooltip__header">
          <span class="wf-anchor-tooltip__icon">{{ typeIcon }}</span>
          <span class="wf-anchor-tooltip__type-name">{{ typeName }}</span>
        </div>
        <div v-if="label || hasAcceptedTypes || compatible !== undefined" class="wf-anchor-tooltip__body">
          <div v-if="label" class="wf-anchor-tooltip__label">{{ label }}</div>
          <div v-if="hasAcceptedTypes" class="wf-anchor-tooltip__accepted-types">
            <div class="wf-anchor-tooltip__accepted-title">接受类型:</div>
            <div class="wf-anchor-tooltip__accepted-list">
              <span
                v-for="t in acceptedTypes"
                :key="t"
                class="wf-anchor-tooltip__accepted-tag"
              >
                {{ t }}
              </span>
            </div>
          </div>
          <div
            v-if="compatible !== undefined"
            class="wf-anchor-tooltip__compatible"
            :class="{ 'is-compatible': compatible, 'is-incompatible': !compatible }"
          >
            <span class="wf-anchor-tooltip__compatible-icon">
              {{ compatible ? '✅' : '❌' }}
            </span>
            <span class="wf-anchor-tooltip__compatible-text">
              {{ compatible ? '兼容' : '不兼容' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  type: string
  direction: 'in' | 'out'
  label?: string
  acceptedTypes?: string[]
  compatible?: boolean
  position: { x: number; y: number }
}>()

const typeIconMap: Record<string, string> = {
  flow: '→',
  resource: '📁',
  image: '🖼️',
  video: '🎬',
  text: '📝',
  model3d: '📦',
  audio: '🔊',
  meta: '⚙️',
}

const typeNameMap: Record<string, string> = {
  flow: 'Flow',
  resource: 'Resource',
  image: 'Image',
  video: 'Video',
  text: 'Text',
  model3d: 'Model3D',
  audio: 'Audio',
  meta: 'Meta',
}

const typeIcon = computed(() => typeIconMap[props.type] || '📌')
const typeName = computed(() => typeNameMap[props.type] || props.type)
const hasAcceptedTypes = computed(() => props.acceptedTypes && props.acceptedTypes.length > 0)

const tooltipStyle = computed(() => {
  return {
    left: `${props.position.x}px`,
    top: `${props.position.y}px`,
  }
})
</script>

<style scoped>
.wf-anchor-tooltip {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  transform: translateY(-50%);
}

.wf-anchor-tooltip--in {
  transform: translate(calc(-100% - 12px), -50%);
}

.wf-anchor-tooltip--out {
  transform: translate(12px, -50%);
}

.wf-anchor-tooltip__content {
  min-width: 140px;
  max-width: 240px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--wf-primary) 55%, transparent);
  border-radius: 4px;
  background-color: color-mix(in srgb, var(--theme-bg-elevated) 85%, transparent);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 25%, transparent),
    0 0 0 1px color-mix(in srgb, var(--wf-primary) 15%, transparent),
    0 0 12px color-mix(in srgb, var(--wf-primary) 12%, transparent),
    0 4px 14px rgba(0, 0, 0, 0.35);
}

.wf-anchor-tooltip__arrow {
  position: absolute;
  top: 50%;
  width: 8px;
  height: 8px;
  transform: translateY(-50%) rotate(45deg);
  background-color: color-mix(in srgb, var(--theme-bg-elevated) 85%, transparent);
  border: 1px solid color-mix(in srgb, var(--wf-primary) 55%, transparent);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
}

.wf-anchor-tooltip--in .wf-anchor-tooltip__arrow {
  right: -4px;
  border-left: none;
  border-bottom: none;
}

.wf-anchor-tooltip--out .wf-anchor-tooltip__arrow {
  left: -4px;
  border-right: none;
  border-top: none;
}

.wf-anchor-tooltip__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid color-mix(in srgb, var(--wf-primary) 25%, transparent);
  margin-bottom: 6px;
}

.wf-anchor-tooltip__icon {
  font-size: 14px;
  line-height: 1;
  flex-shrink: 0;
}

.wf-anchor-tooltip__type-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--wf-text, #edf2f4);
  letter-spacing: 0.02em;
}

.wf-anchor-tooltip__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wf-anchor-tooltip__label {
  font-size: 11px;
  color: var(--wf-text, #edf2f4);
  font-weight: 500;
}

.wf-anchor-tooltip__accepted-types {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wf-anchor-tooltip__accepted-title {
  font-size: 10px;
  color: color-mix(in srgb, var(--wf-text-muted, #aeb8bd) 90%, transparent);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.wf-anchor-tooltip__accepted-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.wf-anchor-tooltip__accepted-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 2px;
  background-color: color-mix(in srgb, var(--wf-primary) 15%, transparent);
  color: color-mix(in srgb, var(--wf-primary) 90%, #fff);
  border: 1px solid color-mix(in srgb, var(--wf-primary) 30%, transparent);
}

.wf-anchor-tooltip__compatible {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  padding-top: 4px;
  border-top: 1px solid color-mix(in srgb, var(--wf-primary) 20%, transparent);
}

.wf-anchor-tooltip__compatible-icon {
  font-size: 12px;
  line-height: 1;
}

.wf-anchor-tooltip__compatible.is-compatible .wf-anchor-tooltip__compatible-text {
  color: var(--dweb-green-main, #27ae60);
}

.wf-anchor-tooltip__compatible.is-incompatible .wf-anchor-tooltip__compatible-text {
  color: var(--dweb-red, #e74c3c);
}

.wf-tooltip-enter-active,
.wf-tooltip-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}

.wf-tooltip-enter-from,
.wf-tooltip-leave-to {
  opacity: 0;
}

.wf-tooltip-enter-from.wf-anchor-tooltip--in,
.wf-tooltip-leave-to.wf-anchor-tooltip--in {
  transform: translate(calc(-100% - 6px), -50%);
}

.wf-tooltip-enter-from.wf-anchor-tooltip--out,
.wf-tooltip-leave-to.wf-anchor-tooltip--out {
  transform: translate(6px, -50%);
}
</style>
