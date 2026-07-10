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
      <div v-if="selectedObject" class="m3de-selected-name">
        <span class="m3de-selected-icon" :class="selectedObject.type">
          <svg v-if="selectedObject.type === 'model'" viewBox="0 0 16 16" width="12" height="12">
            <path d="M8 1L15 5v6l-7 4-7-4V5l7-4z" fill="none" stroke="currentColor" stroke-width="1.2"/>
            <path d="M8 1v7M1 5l7 3 7-3" fill="none" stroke="currentColor" stroke-width="1"/>
          </svg>
          <svg v-else-if="selectedObject.type === 'mesh'" viewBox="0 0 16 16" width="12" height="12">
            <polygon points="8,2 14,7 12,14 4,14 2,7" fill="none" stroke="currentColor" stroke-width="1.2"/>
          </svg>
          <svg v-else viewBox="0 0 16 16" width="12" height="12">
            <path d="M3 3h10v10H3z" fill="none" stroke="currentColor" stroke-width="1.2"/>
          </svg>
        </span>
        <span class="m3de-selected-name-text" :title="selectedObject.name">{{ selectedObject.name }}</span>
      </div>
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
        <div v-if="targetObject" class="m3de-prop-sections">
          <div class="m3de-prop-section">
            <span class="m3de-prop-section-title">
              <span class="m3de-prop-section-dot" />
              {{ transformLabel }}
            </span>

            <div class="m3de-prop-row">
              <span class="m3de-vector-label">{{ positionLabel }}</span>
            </div>
            <div class="m3de-prop-row">
              <label class="m3de-prop-label axis-x">X</label>
              <div class="m3de-vector-input">
                <input
                  type="number"
                  step="0.1"
                  :value="posX"
                  @input="onPosXInput"
                  @change="applyTransform"
                />
              </div>
              <label class="m3de-prop-label axis-y">Y</label>
              <div class="m3de-vector-input">
                <input
                  type="number"
                  step="0.1"
                  :value="posY"
                  @input="onPosYInput"
                  @change="applyTransform"
                />
              </div>
              <label class="m3de-prop-label axis-z">Z</label>
              <div class="m3de-vector-input">
                <input
                  type="number"
                  step="0.1"
                  :value="posZ"
                  @input="onPosZInput"
                  @change="applyTransform"
                />
              </div>
            </div>

            <div class="m3de-prop-row">
              <span class="m3de-vector-label">{{ rotationLabel }}</span>
            </div>
            <div class="m3de-prop-row">
              <label class="m3de-prop-label axis-x">X</label>
              <div class="m3de-vector-input">
                <input
                  type="number"
                  step="1"
                  :value="rotX"
                  @input="onRotXInput"
                  @change="applyTransform"
                />
              </div>
              <label class="m3de-prop-label axis-y">Y</label>
              <div class="m3de-vector-input">
                <input
                  type="number"
                  step="1"
                  :value="rotY"
                  @input="onRotYInput"
                  @change="applyTransform"
                />
              </div>
              <label class="m3de-prop-label axis-z">Z</label>
              <div class="m3de-vector-input">
                <input
                  type="number"
                  step="1"
                  :value="rotZ"
                  @input="onRotZInput"
                  @change="applyTransform"
                />
              </div>
            </div>

            <div class="m3de-prop-row">
              <span class="m3de-vector-label">{{ scaleLabel }}</span>
            </div>
            <div class="m3de-prop-row">
              <label class="m3de-prop-label axis-x">X</label>
              <div class="m3de-vector-input">
                <input
                  type="number"
                  step="0.1"
                  :value="sclX"
                  @input="onSclXInput"
                  @change="applyTransform"
                />
              </div>
              <label class="m3de-prop-label axis-y">Y</label>
              <div class="m3de-vector-input">
                <input
                  type="number"
                  step="0.1"
                  :value="sclY"
                  @input="onSclYInput"
                  @change="applyTransform"
                />
              </div>
              <label class="m3de-prop-label axis-z">Z</label>
              <div class="m3de-vector-input">
                <input
                  type="number"
                  step="0.1"
                  :value="sclZ"
                  @input="onSclZInput"
                  @change="applyTransform"
                />
              </div>
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
                @click="$emit('toggleVisibility', (selectedObject as any).id)"
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
        <div v-if="targetMaterial" class="m3de-prop-sections">
          <div class="m3de-prop-section">
            <span class="m3de-prop-section-title">
              <span class="m3de-prop-section-dot" />
              {{ materialLabel }}
            </span>
            <div class="m3de-prop-row">
              <span class="m3de-material-name">{{ materialNameText }}</span>
            </div>

            <div v-if="'color' in targetMaterial" class="m3de-prop-row">
              <label class="m3de-prop-row-label">{{ colorLabel }}</label>
              <input type="color" :value="matColor" @input="onColorChange" class="m3de-color-input" />
            </div>

            <div v-if="'metalness' in targetMaterial" class="m3de-prop-row">
              <label class="m3de-prop-row-label">{{ metalnessLabel }}</label>
              <input type="range" min="0" max="1" step="0.01" :value="matMetalness" @input="onMetalnessChange" class="m3de-slider" />
              <span class="m3de-slider-value">{{ matMetalness.toFixed(2) }}</span>
            </div>

            <div v-if="'roughness' in targetMaterial" class="m3de-prop-row">
              <label class="m3de-prop-row-label">{{ roughnessLabel }}</label>
              <input type="range" min="0" max="1" step="0.01" :value="matRoughness" @input="onRoughnessChange" class="m3de-slider" />
              <span class="m3de-slider-value">{{ matRoughness.toFixed(2) }}</span>
            </div>

            <div v-if="'opacity' in targetMaterial" class="m3de-prop-row">
              <label class="m3de-prop-row-label">{{ opacityLabel }}</label>
              <input type="range" min="0" max="1" step="0.01" :value="matOpacity" @input="onOpacityChange" class="m3de-slider" />
              <span class="m3de-slider-value">{{ matOpacity.toFixed(2) }}</span>
            </div>

            <div v-if="'wireframe' in targetMaterial" class="m3de-prop-row">
              <label class="m3de-prop-row-label">{{ wireframeLabel }}</label>
              <button
                class="m3de-toggle-btn"
                :class="{ active: matWireframe }"
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
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
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

const targetObject = computed<any | null>(() => {
  return props.selectedObject?.object3D ?? null
})

const safeNum = (v: number, fallback = 0): number => {
  return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : fallback
}

const posX = ref(0)
const posY = ref(0)
const posZ = ref(0)
const rotX = ref(0)
const rotY = ref(0)
const rotZ = ref(0)
const sclX = ref(1)
const sclY = ref(1)
const sclZ = ref(1)
const isVisible = ref(true)

let syncTimer: ReturnType<typeof requestAnimationFrame> | null = null

function readFromObject() {
  const obj = targetObject.value
  if (!obj) return
  posX.value = safeNum(obj.position.x, 0)
  posY.value = safeNum(obj.position.y, 0)
  posZ.value = safeNum(obj.position.z, 0)
  rotX.value = safeNum(THREE.MathUtils.radToDeg(obj.rotation.x), 0)
  rotY.value = safeNum(THREE.MathUtils.radToDeg(obj.rotation.y), 0)
  rotZ.value = safeNum(THREE.MathUtils.radToDeg(obj.rotation.z), 0)
  sclX.value = safeNum(obj.scale.x, 1)
  sclY.value = safeNum(obj.scale.y, 1)
  sclZ.value = safeNum(obj.scale.z, 1)
  isVisible.value = obj.visible
}

function startSyncLoop() {
  stopSyncLoop()
  const tick = () => {
    readFromObject()
    readMaterial()
    syncTimer = requestAnimationFrame(tick)
  }
  syncTimer = requestAnimationFrame(tick)
}

function stopSyncLoop() {
  if (syncTimer !== null) {
    cancelAnimationFrame(syncTimer)
    syncTimer = null
  }
}

const targetMaterial = computed<any | null>(() => {
  const obj = targetObject.value
  if (obj instanceof THREE.Mesh && obj.material) {
    return Array.isArray(obj.material) ? obj.material[0] : obj.material
  }
  return null
})

const materialNameText = computed(() => {
  const mat = targetMaterial.value
  if (!mat) return materialLabel.value
  return mat.name || mat.type || materialLabel.value
})

const matColor = ref('#ffffff')
const matMetalness = ref(0)
const matRoughness = ref(1)
const matOpacity = ref(1)
const matWireframe = ref(false)

function readMaterial() {
  const mat = targetMaterial.value
  if (!mat) return
  if ('color' in mat && (mat as any).color) {
    matColor.value = '#' + (mat as any).color.getHexString()
  }
  if ('metalness' in mat) {
    matMetalness.value = Number.isFinite((mat as any).metalness) ? (mat as any).metalness : 0
  }
  if ('roughness' in mat) {
    matRoughness.value = Number.isFinite((mat as any).roughness) ? (mat as any).roughness : 1
  }
  if ('opacity' in mat) {
    matOpacity.value = Number.isFinite((mat as any).opacity) ? (mat as any).opacity : 1
  }
  if ('wireframe' in mat) {
    matWireframe.value = (mat as any).wireframe ?? false
  }
}

watch(targetObject, () => {
  readFromObject()
  readMaterial()
}, { immediate: true })

watch(() => props.selectedObject, () => {
  readFromObject()
  readMaterial()
}, { immediate: true })

onMounted(() => {
  startSyncLoop()
})

onBeforeUnmount(() => {
  stopSyncLoop()
})

const onPosXInput = (e: Event) => { posX.value = parseFloat((e.target as HTMLInputElement).value) || 0 }
const onPosYInput = (e: Event) => { posY.value = parseFloat((e.target as HTMLInputElement).value) || 0 }
const onPosZInput = (e: Event) => { posZ.value = parseFloat((e.target as HTMLInputElement).value) || 0 }
const onRotXInput = (e: Event) => { rotX.value = parseFloat((e.target as HTMLInputElement).value) || 0 }
const onRotYInput = (e: Event) => { rotY.value = parseFloat((e.target as HTMLInputElement).value) || 0 }
const onRotZInput = (e: Event) => { rotZ.value = parseFloat((e.target as HTMLInputElement).value) || 0 }
const onSclXInput = (e: Event) => { sclX.value = parseFloat((e.target as HTMLInputElement).value) || 1 }
const onSclYInput = (e: Event) => { sclY.value = parseFloat((e.target as HTMLInputElement).value) || 1 }
const onSclZInput = (e: Event) => { sclZ.value = parseFloat((e.target as HTMLInputElement).value) || 1 }

function applyTransform() {
  const obj = targetObject.value
  if (!obj) return
  if (sclX.value === 0) sclX.value = 0.001
  if (sclY.value === 0) sclY.value = 0.001
  if (sclZ.value === 0) sclZ.value = 0.001
  obj.position.set(posX.value, posY.value, posZ.value)
  obj.rotation.set(
    THREE.MathUtils.degToRad(rotX.value),
    THREE.MathUtils.degToRad(rotY.value),
    THREE.MathUtils.degToRad(rotZ.value)
  )
  obj.scale.set(sclX.value, sclY.value, sclZ.value)
  obj.updateMatrixWorld(true)
  emit('transform', props.selectedObject)
}

const onColorChange = (e: Event) => {
  const val = (e.target as HTMLInputElement).value
  matColor.value = val
  const mat = targetMaterial.value
  if (mat && 'color' in mat && (mat as any).color) {
    ;(mat as any).color.set(val)
    mat.needsUpdate = true
  }
}
const onMetalnessChange = (e: Event) => {
  matMetalness.value = parseFloat((e.target as HTMLInputElement).value)
  const mat = targetMaterial.value
  if (mat && 'metalness' in mat) {
    ;(mat as any).metalness = matMetalness.value
    mat.needsUpdate = true
  }
}
const onRoughnessChange = (e: Event) => {
  matRoughness.value = parseFloat((e.target as HTMLInputElement).value)
  const mat = targetMaterial.value
  if (mat && 'roughness' in mat) {
    ;(mat as any).roughness = matRoughness.value
    mat.needsUpdate = true
  }
}
const onOpacityChange = (e: Event) => {
  matOpacity.value = parseFloat((e.target as HTMLInputElement).value)
  const mat = targetMaterial.value
  if (mat && 'opacity' in mat) {
    ;(mat as any).opacity = matOpacity.value
    ;(mat as any).transparent = matOpacity.value < 1
    mat.needsUpdate = true
  }
}
const onWireframeToggle = () => {
  matWireframe.value = !matWireframe.value
  const mat = targetMaterial.value
  if (mat && 'wireframe' in mat) {
    ;(mat as any).wireframe = matWireframe.value
    mat.needsUpdate = true
  }
}
</script>

<style scoped>
.m3de-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--wf-surface-glass, linear-gradient(180deg, color-mix(in srgb, var(--wf-primary) 3%, rgba(21, 24, 28, 0.92)) 0%, rgba(18, 21, 25, 0.96) 100%));
  backdrop-filter: blur(10px) saturate(130%);
  -webkit-backdrop-filter: blur(10px) saturate(130%);
  border: 1px solid color-mix(in srgb, var(--wf-primary) 20%, var(--wf-border-subtle, rgba(255, 255, 255, 0.04)));
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
  flex-direction: column;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--wf-primary) 8%, var(--wf-control-bg, rgba(0, 0, 0, 0.3))),
    color-mix(in srgb, var(--wf-primary) 2%, transparent)
  );
  border-bottom: 1px solid color-mix(in srgb, var(--wf-primary) 18%, var(--wf-border-subtle, rgba(255, 255, 255, 0.04)));
}

.m3de-selected-name {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--wf-primary) 10%, var(--wf-border-subtle, transparent));
}

.m3de-selected-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--wf-primary);
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--wf-primary) 40%, transparent));
}

.m3de-selected-icon.model { color: var(--wf-primary); }
.m3de-selected-icon.mesh { color: #6ea8d8; }
.m3de-selected-icon.group { color: var(--wf-text-muted); }

.m3de-selected-name-text {
  font-size: 11px;
  font-weight: 600;
  color: var(--wf-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary) 20%, transparent);
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
  width: 12px;
  text-align: center;
  font-weight: 700;
  font-family: 'Consolas', 'Monaco', monospace;
}

.m3de-prop-label.axis-x { color: #ff5555; text-shadow: 0 0 4px #ff555566; }
.m3de-prop-label.axis-y { color: #55ff55; text-shadow: 0 0 4px #55ff5566; }
.m3de-prop-label.axis-z { color: #5588ff; text-shadow: 0 0 4px #5588ff66; }

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
  background: var(--wf-input-bg, rgba(0, 0, 0, 0.35));
  border: 1px solid color-mix(in srgb, var(--wf-primary) 20%, var(--wf-input-border, rgba(255, 255, 255, 0.08)));
  color: var(--wf-text);
  font-size: 11px;
  font-family: 'Consolas', 'Monaco', monospace;
  outline: none;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.m3de-vector-input input:focus {
  border-color: color-mix(in srgb, var(--wf-primary) 50%, var(--wf-input-focus-border, transparent));
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
  background: color-mix(in srgb, var(--wf-primary) 15%, var(--wf-border-subtle, rgba(255, 255, 255, 0.08)));
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
  background: var(--wf-control-bg, rgba(0, 0, 0, 0.4));
  border: 1px solid color-mix(in srgb, var(--wf-primary) 25%, var(--wf-border-subtle, rgba(255, 255, 255, 0.1)));
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
