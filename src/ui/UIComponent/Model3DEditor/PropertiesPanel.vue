<template>
  <div class="m3de-panel m3de-properties">
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

    <div class="m3de-panel-header">
      <div class="m3de-tabs">
        <button
          class="m3de-tab"
          :class="{ active: activeTab === 'properties' }"
          @click="activeTab = 'properties'"
        >
          <span class="m3de-tab-indicator" />
          {{ propertiesLabel }}
        </button>
        <button
          class="m3de-tab"
          :class="{ active: activeTab === 'materials' }"
          @click="activeTab = 'materials'"
        >
          <span class="m3de-tab-indicator" />
          {{ materialsLabel }}
        </button>
      </div>
    </div>

    <div class="m3de-properties-content">
      <template v-if="activeTab === 'properties'">
        <div v-if="selectedObject" class="m3de-prop-sections">
          <div class="m3de-prop-section">
            <span class="m3de-prop-section-title">
              <span class="m3de-prop-section-dot" />
              {{ transformLabel }}
            </span>

            <div class="m3de-prop-row">
              <label class="m3de-prop-label">X</label>
              <div class="m3de-vector-input">
                <input
                  type="number"
                  step="0.1"
                  :value="positionX"
                  @input="onPositionXChange"
                />
              </div>
              <label class="m3de-prop-label">Y</label>
              <div class="m3de-vector-input">
                <input
                  type="number"
                  step="0.1"
                  :value="positionY"
                  @input="onPositionYChange"
                />
              </div>
              <label class="m3de-prop-label">Z</label>
              <div class="m3de-vector-input">
                <input
                  type="number"
                  step="0.1"
                  :value="positionZ"
                  @input="onPositionZChange"
                />
              </div>
            </div>

            <div class="m3de-prop-row">
              <span class="m3de-vector-label">{{ positionLabel }}</span>
            </div>

            <div class="m3de-prop-row">
              <label class="m3de-prop-label">X</label>
              <div class="m3de-vector-input">
                <input
                  type="number"
                  step="1"
                  :value="rotationX"
                  @input="onRotationXChange"
                />
              </div>
              <label class="m3de-prop-label">Y</label>
              <div class="m3de-vector-input">
                <input
                  type="number"
                  step="1"
                  :value="rotationY"
                  @input="onRotationYChange"
                />
              </div>
              <label class="m3de-prop-label">Z</label>
              <div class="m3de-vector-input">
                <input
                  type="number"
                  step="1"
                  :value="rotationZ"
                  @input="onRotationZChange"
                />
              </div>
            </div>

            <div class="m3de-prop-row">
              <span class="m3de-vector-label">{{ rotationLabel }}</span>
            </div>

            <div class="m3de-prop-row">
              <label class="m3de-prop-label">X</label>
              <div class="m3de-vector-input">
                <input
                  type="number"
                  step="0.1"
                  :value="scaleX"
                  @input="onScaleXChange"
                />
              </div>
              <label class="m3de-prop-label">Y</label>
              <div class="m3de-vector-input">
                <input
                  type="number"
                  step="0.1"
                  :value="scaleY"
                  @input="onScaleYChange"
                />
              </div>
              <label class="m3de-prop-label">Z</label>
              <div class="m3de-vector-input">
                <input
                  type="number"
                  step="0.1"
                  :value="scaleZ"
                  @input="onScaleZChange"
                />
              </div>
            </div>

            <div class="m3de-prop-row">
              <span class="m3de-vector-label">{{ scaleLabel }}</span>
            </div>
          </div>

          <div class="m3de-prop-section">
            <span class="m3de-prop-section-title">
              <span class="m3de-prop-section-dot" />
              {{ visibilityLabel }}
            </span>
            <div class="m3de-prop-row">
              <label class="m3de-prop-row-label">{{ visibleLabel }}</label>
              <button
                class="m3de-toggle-btn"
                :class="{ active: isVisible }"
                @click="$emit('toggleVisibility', selectedObject.id)"
              >
                <span class="m3de-toggle-track">
                  <span class="m3de-toggle-thumb" />
                </span>
              </button>
            </div>
          </div>
        </div>

        <div v-else class="m3de-no-selection">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1">
            <circle cx="12" cy="12" r="10" stroke-dasharray="3 3"/>
            <path d="M8 12h8M12 8v8"/>
          </svg>
          <p>{{ noSelectionLabel }}</p>
        </div>
      </template>

      <template v-else>
        <div v-if="selectedMaterial" class="m3de-prop-sections">
          <div class="m3de-prop-section">
            <span class="m3de-prop-section-title">
              <span class="m3de-prop-section-dot" />
              {{ materialLabel }}
            </span>
            <div class="m3de-prop-row">
              <span class="m3de-material-name">{{ selectedMaterial.name || materialLabel }}</span>
            </div>

            <div v-if="'color' in selectedMaterial" class="m3de-prop-row">
              <label class="m3de-prop-row-label">{{ colorLabel }}</label>
              <input type="color" :value="materialColor" @input="onColorChange" class="m3de-color-input" />
            </div>

            <div v-if="'metalness' in selectedMaterial" class="m3de-prop-row">
              <label class="m3de-prop-row-label">{{ metalnessLabel }}</label>
              <input type="range" min="0" max="1" step="0.01" :value="materialMetalness" @input="onMetalnessChange" class="m3de-slider" />
              <span class="m3de-slider-value">{{ materialMetalness.toFixed(2) }}</span>
            </div>

            <div v-if="'roughness' in selectedMaterial" class="m3de-prop-row">
              <label class="m3de-prop-row-label">{{ roughnessLabel }}</label>
              <input type="range" min="0" max="1" step="0.01" :value="materialRoughness" @input="onRoughnessChange" class="m3de-slider" />
              <span class="m3de-slider-value">{{ materialRoughness.toFixed(2) }}</span>
            </div>

            <div v-if="'opacity' in selectedMaterial" class="m3de-prop-row">
              <label class="m3de-prop-row-label">{{ opacityLabel }}</label>
              <input type="range" min="0" max="1" step="0.01" :value="materialOpacity" @input="onOpacityChange" class="m3de-slider" />
              <span class="m3de-slider-value">{{ materialOpacity.toFixed(2) }}</span>
            </div>

            <div v-if="'wireframe' in selectedMaterial" class="m3de-prop-row">
              <label class="m3de-prop-row-label">{{ wireframeLabel }}</label>
              <button
                class="m3de-toggle-btn"
                :class="{ active: materialWireframe }"
                @click="onWireframeToggle"
              >
                <span class="m3de-toggle-track">
                  <span class="m3de-toggle-thumb" />
                </span>
              </button>
            </div>
          </div>
        </div>

        <div v-else class="m3de-no-selection">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1">
            <path d="M12 2l9 5v10l-9 5-9-5V7l9-5z"/>
            <path d="M12 2v10M3 7l9 5 9-5"/>
          </svg>
          <p>{{ noMaterialLabel }}</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import * as THREE from 'three'
import { useI18n } from '../../../i18n'
import { useSquareParticles } from '../../../composables/useSquareParticles'
import type { OutlinerNode } from '../../WorkFlow/WorlFlowNodes/model3d/editor/types'

const { t } = useI18n()

const { particles } = useSquareParticles({
  count: 3,
  baseOpacity: 0.25,
  minSize: 2,
  maxSize: 3,
  seed: 42069
})

interface Props {
  selectedObject: OutlinerNode | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  toggleVisibility: [id: string]
  transform: [object: OutlinerNode | null]
}>()

const activeTab = ref<'properties' | 'materials'>('properties')

const propertiesLabel = computed(() => t('nodes.model3d.properties'))
const materialsLabel = computed(() => t('nodes.model3d.materials'))
const transformLabel = computed(() => t('nodes.model3d.transform'))
const positionLabel = computed(() => t('nodes.model3d.position'))
const rotationLabel = computed(() => t('nodes.model3d.rotation'))
const scaleLabel = computed(() => t('nodes.model3d.scale'))
const visibilityLabel = computed(() => t('nodes.model3d.visibility'))
const visibleLabel = computed(() => t('nodes.model3d.visible'))
const materialLabel = computed(() => t('nodes.model3d.material'))
const colorLabel = computed(() => t('nodes.model3d.color'))
const metalnessLabel = computed(() => t('nodes.model3d.metalness'))
const roughnessLabel = computed(() => t('nodes.model3d.roughness'))
const opacityLabel = computed(() => t('nodes.model3d.opacity'))
const wireframeLabel = computed(() => t('nodes.model3d.wireframeMat'))
const noSelectionLabel = computed(() => t('nodes.model3d.noSelection'))
const noMaterialLabel = computed(() => t('nodes.model3d.noMaterial'))

const obj = computed(() => props.selectedObject?.object3D as THREE.Object3D | undefined)
const positionX = ref(0)
const positionY = ref(0)
const positionZ = ref(0)
const rotationX = ref(0)
const rotationY = ref(0)
const rotationZ = ref(0)
const scaleX = ref(1)
const scaleY = ref(1)
const scaleZ = ref(1)
const isVisible = ref(true)

const selectedMaterial = computed<THREE.MeshStandardMaterial | null>(() => {
  if (!obj.value) return null
  if (obj.value instanceof THREE.Mesh && obj.value.material instanceof THREE.MeshStandardMaterial) {
    return obj.value.material
  }
  return null
})

const materialColor = ref('#ffffff')
const materialMetalness = ref(0)
const materialRoughness = ref(1)
const materialOpacity = ref(1)
const materialWireframe = ref(false)

watch(() => props.selectedObject, () => {
  if (!obj.value) return
  positionX.value = round(obj.value.position.x)
  positionY.value = round(obj.value.position.y)
  positionZ.value = round(obj.value.position.z)
  rotationX.value = round(THREE.MathUtils.radToDeg(obj.value.rotation.x))
  rotationY.value = round(THREE.MathUtils.radToDeg(obj.value.rotation.y))
  rotationZ.value = round(THREE.MathUtils.radToDeg(obj.value.rotation.z))
  scaleX.value = round(obj.value.scale.x)
  scaleY.value = round(obj.value.scale.y)
  scaleZ.value = round(obj.value.scale.z)
  isVisible.value = obj.value.visible

  if (selectedMaterial.value) {
    const mat = selectedMaterial.value
    materialColor.value = '#' + mat.color.getHexString()
    materialMetalness.value = mat.metalness ?? 0
    materialRoughness.value = mat.roughness ?? 1
    materialOpacity.value = mat.opacity ?? 1
    materialWireframe.value = mat.wireframe ?? false
  }
}, { immediate: true })

function round(n: number) { return Math.round(n * 1000) / 1000 }

function applyTransform() {
  if (!obj.value) return
  obj.value.position.set(positionX.value, positionY.value, positionZ.value)
  obj.value.rotation.set(
    THREE.MathUtils.degToRad(rotationX.value),
    THREE.MathUtils.degToRad(rotationY.value),
    THREE.MathUtils.degToRad(rotationZ.value)
  )
  obj.value.scale.set(scaleX.value, scaleY.value, scaleZ.value)
  emit('transform', props.selectedObject)
}

const onPositionXChange = (e: Event) => { positionX.value = parseFloat((e.target as HTMLInputElement).value); applyTransform() }
const onPositionYChange = (e: Event) => { positionY.value = parseFloat((e.target as HTMLInputElement).value); applyTransform() }
const onPositionZChange = (e: Event) => { positionZ.value = parseFloat((e.target as HTMLInputElement).value); applyTransform() }
const onRotationXChange = (e: Event) => { rotationX.value = parseFloat((e.target as HTMLInputElement).value); applyTransform() }
const onRotationYChange = (e: Event) => { rotationY.value = parseFloat((e.target as HTMLInputElement).value); applyTransform() }
const onRotationZChange = (e: Event) => { rotationZ.value = parseFloat((e.target as HTMLInputElement).value); applyTransform() }
const onScaleXChange = (e: Event) => { scaleX.value = parseFloat((e.target as HTMLInputElement).value); applyTransform() }
const onScaleYChange = (e: Event) => { scaleY.value = parseFloat((e.target as HTMLInputElement).value); applyTransform() }
const onScaleZChange = (e: Event) => { scaleZ.value = parseFloat((e.target as HTMLInputElement).value); applyTransform() }

const onColorChange = (e: Event) => {
  const val = (e.target as HTMLInputElement).value
  materialColor.value = val
  if (selectedMaterial.value) {
    selectedMaterial.value.color.set(val)
    selectedMaterial.value.needsUpdate = true
  }
}
const onMetalnessChange = (e: Event) => {
  materialMetalness.value = parseFloat((e.target as HTMLInputElement).value)
  if (selectedMaterial.value) {
    selectedMaterial.value.metalness = materialMetalness.value
    selectedMaterial.value.needsUpdate = true
  }
}
const onRoughnessChange = (e: Event) => {
  materialRoughness.value = parseFloat((e.target as HTMLInputElement).value)
  if (selectedMaterial.value) {
    selectedMaterial.value.roughness = materialRoughness.value
    selectedMaterial.value.needsUpdate = true
  }
}
const onOpacityChange = (e: Event) => {
  materialOpacity.value = parseFloat((e.target as HTMLInputElement).value)
  if (selectedMaterial.value) {
    selectedMaterial.value.opacity = materialOpacity.value
    selectedMaterial.value.transparent = materialOpacity.value < 1
    selectedMaterial.value.needsUpdate = true
  }
}
const onWireframeToggle = () => {
  materialWireframe.value = !materialWireframe.value
  if (selectedMaterial.value) {
    selectedMaterial.value.wireframe = materialWireframe.value
    selectedMaterial.value.needsUpdate = true
  }
}
</script>

<style scoped>
.m3de-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--wf-primary) 3%, rgba(21, 24, 28, 0.92)) 0%,
    rgba(18, 21, 25, 0.96) 100%
  );
  backdrop-filter: blur(10px) saturate(130%);
  -webkit-backdrop-filter: blur(10px) saturate(130%);
  border: 1px solid color-mix(in srgb, var(--wf-primary) 20%, rgba(255, 255, 255, 0.04));
  overflow: hidden;
}

.m3de-corner {
  position: absolute;
  width: 8px;
  height: 8px;
  border: 2px solid color-mix(in srgb, var(--wf-primary) 55%, transparent);
  box-shadow: 0 0 5px color-mix(in srgb, var(--wf-primary) 25%, transparent);
  pointer-events: none;
  z-index: 2;
}

.m3de-corner-tl { top: 3px; left: 3px; border-right: none; border-bottom: none; }
.m3de-corner-br { bottom: 3px; right: 3px; border-left: none; border-top: none; }

.m3de-panel-header {
  display: flex;
  align-items: center;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--wf-primary) 8%, rgba(0, 0, 0, 0.3)),
    color-mix(in srgb, var(--wf-primary) 2%, transparent)
  );
  border-bottom: 1px solid color-mix(in srgb, var(--wf-primary) 18%, rgba(255, 255, 255, 0.04));
}

.m3de-tabs {
  display: flex;
  width: 100%;
}

.m3de-tab {
  position: relative;
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--wf-text-muted);
  font-size: 11px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: all 160ms ease;
  letter-spacing: 0.04em;
}

.m3de-tab:hover {
  color: var(--wf-text);
  background: color-mix(in srgb, var(--wf-primary) 4%, transparent);
}

.m3de-tab.active {
  color: var(--wf-primary);
  background: color-mix(in srgb, var(--wf-primary) 8%, transparent);
  text-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary) 35%, transparent);
}

.m3de-tab-indicator {
  width: 5px;
  height: 5px;
  background: var(--wf-primary);
  box-shadow: 0 0 6px var(--wf-primary);
  opacity: 0;
  transition: opacity 160ms ease;
}

.m3de-tab.active .m3de-tab-indicator {
  opacity: 1;
}

.m3de-properties {
  flex: 1 1 0;
  min-height: 0;
}

.m3de-properties-content {
  flex: 1 1 0;
  overflow-y: auto;
  padding: 10px;
}

.m3de-properties-content::-webkit-scrollbar { width: 5px; }
.m3de-properties-content::-webkit-scrollbar-track { background: transparent; }
.m3de-properties-content::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--wf-primary) 25%, transparent); }
.m3de-properties-content::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--wf-primary) 40%, transparent); }

.m3de-prop-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.m3de-prop-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.m3de-prop-section-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 600;
  color: var(--wf-primary);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary) 35%, transparent);
  padding-bottom: 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--wf-primary) 15%, rgba(255, 255, 255, 0.04));
  margin-bottom: 2px;
}

.m3de-prop-section-dot {
  width: 4px;
  height: 4px;
  background: var(--wf-primary);
  box-shadow: 0 0 5px var(--wf-primary);
}

.m3de-prop-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.m3de-prop-label {
  font-size: 10px;
  color: var(--wf-text-muted);
  width: 10px;
  text-align: center;
  font-weight: 600;
}

.m3de-vector-label {
  font-size: 9px;
  color: var(--wf-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding-left: 2px;
}

.m3de-vector-input {
  flex: 1;
  min-width: 0;
}

.m3de-vector-input input {
  width: 100%;
  padding: 4px 6px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid color-mix(in srgb, var(--wf-primary) 20%, rgba(255, 255, 255, 0.08));
  color: var(--wf-text);
  font-size: 11px;
  font-family: 'Consolas', 'Monaco', monospace;
  outline: none;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.m3de-vector-input input:focus {
  border-color: color-mix(in srgb, var(--wf-primary) 50%, transparent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary) 15%, transparent);
}

.m3de-prop-row-label {
  font-size: 11px;
  color: var(--wf-text-muted);
  flex: 1;
}

.m3de-material-name {
  font-size: 11px;
  color: var(--wf-text);
  font-family: 'Consolas', 'Monaco', monospace;
}

.m3de-color-input {
  width: 30px;
  height: 24px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--wf-primary) 25%, transparent);
  background: transparent;
  cursor: pointer;
}

.m3de-slider {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 3px;
  background: color-mix(in srgb, var(--wf-primary) 15%, rgba(255, 255, 255, 0.08));
  outline: none;
  cursor: pointer;
}

.m3de-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: var(--wf-primary);
  border: none;
  box-shadow: 0 0 6px var(--wf-primary);
  cursor: pointer;
}

.m3de-slider-value {
  font-size: 10px;
  color: var(--wf-text-muted);
  width: 36px;
  text-align: right;
  font-family: 'Consolas', 'Monaco', monospace;
}

.m3de-toggle-btn {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.m3de-toggle-track {
  display: inline-block;
  width: 32px;
  height: 16px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid color-mix(in srgb, var(--wf-primary) 25%, rgba(255, 255, 255, 0.1));
  position: relative;
  transition: all 160ms ease;
}

.m3de-toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  background: var(--wf-text-muted);
  transition: all 160ms ease;
}

.m3de-toggle-btn.active .m3de-toggle-track {
  background: color-mix(in srgb, var(--wf-primary) 20%, transparent);
  border-color: color-mix(in srgb, var(--wf-primary) 50%, transparent);
  box-shadow: inset 0 0 8px color-mix(in srgb, var(--wf-primary) 10%, transparent);
}

.m3de-toggle-btn.active .m3de-toggle-thumb {
  left: 18px;
  background: var(--wf-primary);
  box-shadow: 0 0 6px var(--wf-primary);
}

.m3de-no-selection {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 20px;
  color: var(--wf-text-secondary);
}

.m3de-no-selection svg {
  opacity: 0.3;
}

.m3de-no-selection p {
  font-size: 11px;
  color: var(--wf-text-secondary);
  text-align: center;
  margin: 0;
}
</style>
