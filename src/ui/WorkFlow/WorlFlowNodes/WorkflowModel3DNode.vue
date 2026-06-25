<template>
  <WorkflowNodeBase
    :nodeId="nodeId"
    :title="title"
    :alias="alias"
    :nodeType="nodeType"
    :subtitle="subtitle"
    :style="style"
    :width="width"
    :height="height"
    :zoom="zoom"
    :worldX="worldX"
    :worldY="worldY"
    :inputs="inputs"
    :outputs="outputs"
    :selected="selected"
    :hoverInputAnchorId="hoverInputAnchorId"
    :hoverOutputAnchorId="hoverOutputAnchorId"
    @update:worldX="(v) => emit('update:worldX', v)"
    @update:worldY="(v) => emit('update:worldY', v)"
    @select="(id) => emit('select', id)"
    @start-link="(payload: any) => emit('start-link', payload)"
    @end-link="(payload: any) => emit('end-link', payload)"
    @copy="() => emit('copy')"
    @refresh="() => emit('refresh')"
    @delete="() => emit('delete')"
    @set-type="(type: any) => emit('set-type', type)"
    @resize="(payload: any) => emit('resize', payload)"
  >
    <template #body>
      <div class="wf-model3d-body">
        <div v-if="meshyFetchFailed" class="wf-model3d-fetch-error" @pointerdown.stop>
          <div class="wf-model3d-fetch-error-icon">!</div>
          <div class="wf-model3d-fetch-error-body">
            <div class="wf-model3d-fetch-error-title">模型文件拉取失败</div>
            <div class="wf-model3d-fetch-error-text">{{ meshyFetchErrorText }}</div>
            <div class="wf-model3d-fetch-error-actions">
              <button class="wf-model3d-fetch-error-btn primary" type="button" @click.stop="emit('retry-meshy-fetch')">
                重试拉取
              </button>
              <button class="wf-model3d-fetch-error-btn" type="button" @click.stop="emit('open-meshy-task-panel')">
                打开任务面板
              </button>
            </div>
          </div>
        </div>

        <div
          class="wf-model3d-viewer-shell"
          data-wf-node-drag-ignore="true"
          @pointerdown.stop
          @wheel.stop="onPreviewWheel"
          @contextmenu.stop.prevent="onPreviewContextMenu"
        >
          <WorkflowThreePreviewShell
            :state="threePreviewState"
            :snapshotUrl="snapshotUrl"
            :empty="!modelUrl"
            emptyTitle="3D 模型预览"
            emptyText="可上传本地 GLB / GLTF，也可以从 Meshy 节点输入模型结果。"
            maskedTitle="实时渲染已卸载"
            maskedText="重新选中当前节点后，点击按钮再进入实时 Three.js 预览。"
            @start="emit('start-three-preview')"
          >
            <canvas
              ref="canvasRef"
              class="wf-model3d-canvas"
              :class="{ live: viewerLive }"
              :data-wf-model3d-canvas-node-id="nodeId"
            />
            <template #overlay>
              <div v-if="modelUrl && viewerLive && !errorMessage" class="wf-model3d-gesture-tip">
                拖拽旋转 · 滚轮拉近/拉远
              </div>
              <div v-if="errorMessage" class="wf-model3d-overlay error">{{ errorMessage }}</div>
            </template>
          </WorkflowThreePreviewShell>
        </div>

        <div class="wf-model3d-actions" @pointerdown.stop>
          <div class="wf-model3d-filemeta">
            <div class="wf-model3d-filename">{{ sourceNameDisplay }}</div>
            <div class="wf-model3d-filehint">{{ sourceHintDisplay }}</div>
          </div>
          <div class="wf-model3d-action-buttons">
            <button class="wf-model3d-btn" type="button" @click.stop="onUploadClick">
              {{ modelUrl ? '更换模型' : '上传模型' }}
            </button>
            <button v-if="modelUrl" class="wf-model3d-btn ghost" type="button" @click.stop="emit('clear-resource')">
              清空
            </button>
          </div>
          <input
            ref="fileInputRef"
            class="wf-file-input"
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            @change="onFileChange"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="wf-model3d-footer" @pointerdown.stop>
        <div class="wf-model3d-grid">
          <div class="wf-model3d-info-card wf-model3d-field-wide">
            <div class="wf-model3d-info-row">
              <span class="wf-model3d-label">项目资产</span>
              <span class="wf-model3d-info-value">{{ assetStatusDisplay }}</span>
            </div>
            <div class="wf-model3d-info-row">
              <span class="wf-model3d-label">上游输入</span>
              <span class="wf-model3d-info-value">{{ upstreamStatusDisplay }}</span>
            </div>
          </div>

          <label class="wf-model3d-field">
            <span class="wf-model3d-label">背景色</span>
            <input class="wf-model3d-input wf-model3d-input-color" type="color" :value="backgroundColor" @input="onBackgroundInput" />
          </label>

          <label class="wf-model3d-field">
            <span class="wf-model3d-label">灯光强度</span>
            <input class="wf-model3d-input" type="number" min="0" max="10" step="0.1" :value="lightIntensity" @change="onLightIntensityChange" />
          </label>

          <label class="wf-model3d-field">
            <span class="wf-model3d-label">渲染宽度</span>
            <input class="wf-model3d-input" type="number" min="1" :value="renderWidth" @change="onRenderWidthChange" />
          </label>

          <label class="wf-model3d-field">
            <span class="wf-model3d-label">渲染高度</span>
            <input class="wf-model3d-input" type="number" min="1" :value="renderHeight" @change="onRenderHeightChange" />
          </label>

          <label class="wf-model3d-check">
            <input type="checkbox" :checked="gridVisible" @change="onGridToggle" />
            <span>显示地面网格</span>
          </label>
          <label class="wf-model3d-check">
            <input type="checkbox" :checked="axesVisible" @change="onAxesToggle" />
            <span>显示 XYZ 轴</span>
          </label>
          <label class="wf-model3d-check wf-model3d-field-wide">
            <input type="checkbox" :checked="autoRotate" @change="onAutoRotateToggle" />
            <span>自动旋转</span>
          </label>
        </div>
      </div>
    </template>
  </WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getErrorMessage } from '../../../types/utils'
import WorkflowNodeBase from '../WorkflowNodeBase.vue'
import { Model3DPreviewViewer } from './model3d/Model3DPreviewViewer'
import type { WorkflowModel3DNodeSettings } from '../../../aiworkflow/types'
import WorkflowThreePreviewShell from './three-preview/WorkflowThreePreviewShell.vue'
import type {
  WorkflowThreePreviewProgressPayload,
  WorkflowThreePreviewState,
} from './three-preview/types'

type AnchorSpec = {
  id: string
  label?: string
  offsetY?: number
  mediaType?: 'generic' | 'image' | 'video' | 'text' | 'flow'
}

const props = defineProps<{
  nodeId: string
  title: string
  alias?: string
  nodeType: string
  subtitle?: string
  style?: Record<string, string>
  model3dSettings?: WorkflowModel3DNodeSettings | null
  threePreviewState?: WorkflowThreePreviewState | null
  previewSuspended?: boolean
  width: number
  height: number
  zoom: number
  worldX: number
  worldY: number
  inputs?: AnchorSpec[]
  outputs?: AnchorSpec[]
  selected?: boolean
  hoverInputAnchorId?: string | null
  hoverOutputAnchorId?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:worldX', v: number): void
  (e: 'update:worldY', v: number): void
  (e: 'select', nodeId: string): void
  (e: 'preview-contextmenu', payload: { clientX: number; clientY: number }): void
  (e: 'start-link', payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }): void
  (e: 'end-link', payload: { nodeId: string; anchorId: string; anchorIndex: number }): void
  (e: 'copy'): void
  (e: 'refresh'): void
  (e: 'delete'): void
  (e: 'set-type', v: 'base' | 'text' | 'text-merge' | 'image' | 'rotate-image' | 'video' | 'scene-understanding' | 'scene-decompose' | 'scene-layout' | 'unreal-export' | 'story' | 'comfyui' | 'model3d' | 'meshy'): void
  (e: 'resize', payload: { width: number; height: number; worldX: number; worldY: number }): void
  (e: 'update-model3d-settings', payload: Partial<WorkflowModel3DNodeSettings>): void
  (e: 'upload-model-file', payload: { file: File }): void
  (e: 'clear-resource'): void
  (e: 'start-three-preview'): void
  (e: 'three-preview-progress', payload?: WorkflowThreePreviewProgressPayload): void
  (e: 'three-preview-ready'): void
  (e: 'three-preview-error'): void
  (e: 'retry-meshy-fetch'): void
  (e: 'open-meshy-task-panel'): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const snapshotUrl = ref('')
const errorMessage = ref('')
let viewer: Model3DPreviewViewer | null = null
let loadRunId = 0
let activePreviewRequestId = 0

const settings = computed(() => props.model3dSettings ?? null)
const rawThreePreviewState = computed(() => props.threePreviewState ?? null)
const previewSuspended = computed(() => props.previewSuspended === true)
const modelUrl = computed(() => String(settings.value?.modelUrl ?? '').trim())
const backgroundColor = computed(() => String(settings.value?.backgroundColor ?? '#0f1720'))
const lightIntensity = computed(() => Number(settings.value?.lightIntensity ?? 1.25))
const gridVisible = computed(() => settings.value?.gridVisible !== false)
const axesVisible = computed(() => settings.value?.axesVisible !== false)
const autoRotate = computed(() => settings.value?.autoRotate === true)
const renderWidth = computed(() => Number(settings.value?.renderWidth ?? 1024))
const renderHeight = computed(() => Number(settings.value?.renderHeight ?? 1024))
const sourceNameDisplay = computed(() => String(settings.value?.modelSourceName ?? '').trim() || '未绑定模型')
const sourceHintDisplay = computed(() => {
  const format = String(settings.value?.modelFormat ?? '').trim().toUpperCase()
  if (settings.value?.lastInputNodeId) return `来自上游节点 ${settings.value.lastInputNodeId}${format ? ` · ${format}` : ''}`
  if (settings.value?.modelSourcePath) return settings.value.modelSourcePath
  return format ? `${format} 预览` : '支持 GLB / GLTF'
})
const assetStatusDisplay = computed(() => {
  const assetPath = String(settings.value?.modelAssetPath ?? '').trim()
  if (assetPath) return '已写入项目资产'
  return '未持久化'
})
const upstreamStatusDisplay = computed(() => {
  const source = String(settings.value?.lastInputSourceName ?? '').trim()
  if (source) return source
  return '当前未连接上游模型输出'
})

const meshySettings = computed(() => settings.value?.meshyModelSettings ?? null)
const meshyFetchFailed = computed(() => {
  const status = String(meshySettings.value?.taskStatus ?? '').trim()
  return status === 'fetch-failed'
})
const meshyFetchErrorText = computed(() => {
  return String(meshySettings.value?.errorMessage ?? meshySettings.value?.statusText ?? '拉取失败').trim()
})

const threePreviewState = computed(() => rawThreePreviewState.value)
const previewPhase = computed(() => threePreviewState.value?.phase ?? 'masked')
const viewerLive = computed(() => previewPhase.value === 'loading' || previewPhase.value === 'interactive')

const updateSettings = (patch: Partial<WorkflowModel3DNodeSettings>) => emit('update-model3d-settings', patch)
const emitPreviewProgress = (progress: number, label: string) => {
  emit('three-preview-progress', { progress, label })
}

const ensureViewer = () => {
  if (viewer || !canvasRef.value) {
    return
  }
  viewer = new Model3DPreviewViewer(canvasRef.value, {
    backgroundColor: backgroundColor.value,
    lightIntensity: lightIntensity.value,
    gridVisible: gridVisible.value,
    axesVisible: axesVisible.value,
    autoRotate: autoRotate.value,
  })
  viewer.setRenderSuspended(false)
  viewer.setInteractive(false)
}

const disposeViewer = () => {
  if (!viewer) {
    return
  }
  viewer.dispose()
  viewer = null
}

const captureSnapshot = () => {
  const next = viewer?.captureSnapshotDataUrl() ?? ''
  if (next) snapshotUrl.value = next
}

const teardownViewer = () => {
  captureSnapshot()
  disposeViewer()
}

const applyViewerOptions = () => {
  viewer?.setOptions({
    backgroundColor: backgroundColor.value,
    lightIntensity: lightIntensity.value,
    gridVisible: gridVisible.value,
    axesVisible: axesVisible.value,
    autoRotate: autoRotate.value,
  })
}

const loadModel = async (requestId?: number) => {
  const current = ++loadRunId
  errorMessage.value = ''
  if (!viewerLive.value) {
    return
  }
  ensureViewer()
  applyViewerOptions()
  if (!viewer) return
  if (!modelUrl.value) {
    viewer.clearModel()
    return
  }
  if (requestId != null) emitPreviewProgress(0.14, '初始化渲染器')
  try {
    await viewer.loadModel(modelUrl.value, (payload) => {
      if (requestId == null) return
      const ratio = Number(payload?.ratio ?? 0)
      emitPreviewProgress(0.2 + Math.max(0, Math.min(1, ratio)) * 0.72, '加载模型资源')
    })
    if (current !== loadRunId) return
    if (requestId != null && requestId === activePreviewRequestId) {
      emitPreviewProgress(0.98, '同步交互状态')
      emit('three-preview-ready')
    }
  } catch (err: unknown) {
    if (current !== loadRunId) return
    errorMessage.value = getErrorMessage(err) || '模型加载失败'
    viewer.clearModel()
    emit('three-preview-error')
  }
}

const onUploadClick = () => fileInputRef.value?.click()
const onFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) return
  emit('upload-model-file', { file })
  if (input) input.value = ''
}
const onPreviewWheel = (e: WheelEvent) => {
  e.stopPropagation()
}
const onPreviewContextMenu = (e: MouseEvent) => emit('preview-contextmenu', { clientX: e.clientX, clientY: e.clientY })
const onModelUrlInput = (e: Event) => {
  const next = String((e.target as HTMLInputElement).value ?? '').trim()
  updateSettings({ modelUrl: next, modelFormat: next.toLowerCase().endsWith('.gltf') ? 'gltf' : next ? 'glb' : undefined })
}
const onBackgroundInput = (e: Event) => updateSettings({ backgroundColor: String((e.target as HTMLInputElement).value || '#0f1720') })
const onLightIntensityChange = (e: Event) => updateSettings({ lightIntensity: Number((e.target as HTMLInputElement).value || 0) })
const onRenderWidthChange = (e: Event) => updateSettings({ renderWidth: Number((e.target as HTMLInputElement).value || 1) })
const onRenderHeightChange = (e: Event) => updateSettings({ renderHeight: Number((e.target as HTMLInputElement).value || 1) })
const onGridToggle = (e: Event) => updateSettings({ gridVisible: (e.target as HTMLInputElement).checked })
const onAxesToggle = (e: Event) => updateSettings({ axesVisible: (e.target as HTMLInputElement).checked })
const onAutoRotateToggle = (e: Event) => updateSettings({ autoRotate: (e.target as HTMLInputElement).checked })

watch(
  () => [previewPhase.value, threePreviewState.value?.requestId ?? 0] as const,
  ([phase, requestId]) => {
    if (phase === 'masked') {
      activePreviewRequestId = 0
      teardownViewer()
      return
    }
    ensureViewer()
    viewer?.setRenderSuspended(previewSuspended.value)
    if (phase === 'loading') {
      if (!modelUrl.value) return
      if (requestId === activePreviewRequestId) return
      activePreviewRequestId = requestId
      void loadModel(requestId)
      return
    }
    viewer?.setInteractive(true)
  },
  { immediate: true, flush: 'post' }
)

watch(previewSuspended, (suspended) => {
  if (!viewer || previewPhase.value === 'masked') return
  viewer.setRenderSuspended(suspended)
})

watch([backgroundColor, lightIntensity, gridVisible, axesVisible, autoRotate], () => {
  applyViewerOptions()
})

watch(modelUrl, () => {
  errorMessage.value = ''
  if (!modelUrl.value) {
    snapshotUrl.value = ''
    viewer?.clearModel()
    return
  }
  if (previewPhase.value === 'masked') return
  void loadModel()
})

onBeforeUnmount(() => {
  disposeViewer()
})
</script>

<style scoped>
.wf-model3d-body {
  width: 100%;
  display: grid;
  gap: 10px;
}

.wf-model3d-fetch-error {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgb(239 68 68 / 0.45);
  background: rgb(239 68 68 / 0.08);
  border-radius: 6px;
}

.wf-model3d-fetch-error-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgb(239 68 68 / 0.85);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.wf-model3d-fetch-error-body {
  display: grid;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.wf-model3d-fetch-error-title {
  font-size: 13px;
  font-weight: 600;
  color: rgb(248 113 113);
}

.wf-model3d-fetch-error-text {
  font-size: 12px;
  color: rgb(252 165 165 / 0.9);
  line-height: 1.4;
}

.wf-model3d-fetch-error-actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.wf-model3d-fetch-error-btn {
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid rgb(255 255 255 / 0.15);
  background: rgb(255 255 255 / 0.06);
  color: #e5e7eb;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.wf-model3d-fetch-error-btn:hover {
  background: rgb(255 255 255 / 0.12);
  border-color: rgb(255 255 255 / 0.25);
}

.wf-model3d-fetch-error-btn.primary {
  background: rgb(239 68 68 / 0.6);
  border-color: rgb(239 68 68 / 0.7);
  color: #fff;
}

.wf-model3d-fetch-error-btn.primary:hover {
  background: rgb(239 68 68 / 0.8);
  border-color: rgb(239 68 68 / 0.9);
}

.wf-model3d-meshy-status {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
  background: rgb(from var(--dweb-defualt-dark) r g b / 0.72);
}

.wf-model3d-meshy-status.is-pending {
  border-color: rgb(90 180 255 / 0.45);
}

.wf-model3d-meshy-status.is-running {
  border-color: rgb(250 204 21 / 0.55);
}

.wf-model3d-meshy-status.is-success {
  border-color: rgb(34 197 94 / 0.55);
}

.wf-model3d-meshy-status.is-error {
  border-color: rgb(239 68 68 / 0.55);
}

.wf-model3d-meshy-status-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.wf-model3d-meshy-status-label {
  font-weight: 600;
  color: var(--vscode-fg);
  white-space: nowrap;
}

.wf-model3d-meshy-status.is-running .wf-model3d-meshy-status-label {
  color: rgb(250 204 21);
}

.wf-model3d-meshy-status.is-pending .wf-model3d-meshy-status-label {
  color: rgb(96 165 250);
}

.wf-model3d-meshy-status.is-success .wf-model3d-meshy-status-label {
  color: rgb(34 197 94);
}

.wf-model3d-meshy-status.is-error .wf-model3d-meshy-status-label {
  color: rgb(248 113 113);
}

.wf-model3d-meshy-status-text {
  color: var(--vscode-fg-muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wf-model3d-meshy-progress {
  width: 100%;
  height: 4px;
  background: rgb(from var(--vscode-border) r g b / 0.45);
  overflow: hidden;
}

.wf-model3d-meshy-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, rgb(96 165 250 / 0.85), rgb(52 211 153 / 0.85));
  transition: width 400ms ease;
}

.wf-model3d-meshy-status.is-running .wf-model3d-meshy-progress-fill {
  background: linear-gradient(90deg, rgb(250 204 21 / 0.85), rgb(251 146 60 / 0.85));
}

.wf-model3d-meshy-status.is-success .wf-model3d-meshy-progress-fill {
  background: rgb(34 197 94 / 0.85);
}

.wf-model3d-meshy-status.is-error .wf-model3d-meshy-progress-fill {
  background: rgb(239 68 68 / 0.75);
}

.wf-model3d-viewer-shell {
  position: relative;
  min-height: 220px;
  border: 1px solid var(--vscode-border);
  border-radius: 0;
  background: #0f1720;
  overflow: hidden;
}

.wf-model3d-gesture-tip {
  position: absolute;
  left: 10px;
  bottom: 10px;
  z-index: 1;
  padding: 4px 8px;
  border: 1px solid rgb(from var(--vscode-border) r g b / 0.72);
  background: rgb(from var(--dweb-defualt-dark) r g b / 0.58);
  color: var(--vscode-fg-muted);
  font-size: 11px;
  pointer-events: none;
}

.wf-model3d-canvas {
  width: 100%;
  height: 100%;
  display: block;
  opacity: 0;
  transition: opacity 120ms ease;
}

.wf-model3d-canvas.live {
  opacity: 1;
}

.wf-model3d-overlay {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: grid;
  place-items: center;
  padding: 16px;
  text-align: center;
  color: var(--vscode-fg);
  background: rgb(from var(--dweb-defualt-dark) r g b / 0.45);
  backdrop-filter: blur(4px);
}

.wf-model3d-overlay.empty {
  align-content: center;
  gap: 6px;
}

.wf-model3d-overlay.error {
  color: #fecaca;
}

.wf-model3d-overlay-title {
  font-size: 14px;
  font-weight: 600;
}

.wf-model3d-overlay-text {
  font-size: 12px;
  color: var(--vscode-fg-muted);
}

.wf-model3d-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.wf-model3d-filemeta {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.wf-model3d-filename {
  font-size: 12px;
  color: var(--vscode-fg);
  word-break: break-all;
}

.wf-model3d-filehint {
  font-size: 11px;
  color: var(--vscode-fg-muted);
  word-break: break-all;
}

.wf-model3d-action-buttons {
  display: flex;
  gap: 8px;
}

.wf-model3d-btn {
  border: 1px solid rgb(from var(--vscode-border) r g b / 0.88);
  background: linear-gradient(180deg, rgb(from var(--dweb-defualt-dark) r g b / 0.78), rgb(from var(--dweb-defualt) r g b / 0.72));
  color: var(--vscode-fg);
  padding: 7px 10px;
  font-size: 12px;
  cursor: pointer;
  backdrop-filter: blur(8px);
  box-shadow: 0 0 0 1px rgb(90 180 255 / 0.08), 0 0 14px rgb(90 180 255 / 0.08);
}

.wf-model3d-btn:hover {
  border-color: var(--vscode-hover-border);
}

.wf-model3d-btn.ghost {
  color: var(--vscode-fg-muted);
}

.wf-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.wf-model3d-footer {
  display: grid;
  gap: 10px;
}

.wf-model3d-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.wf-model3d-field,
.wf-model3d-check {
  display: grid;
  gap: 6px;
}

.wf-model3d-field-wide {
  grid-column: 1 / -1;
}

.wf-model3d-label {
  font-size: 11px;
  color: #9ec2dd;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.wf-model3d-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
  background: rgb(from var(--dweb-defualt-dark) r g b / 0.72);
  color: var(--vscode-fg);
  padding: 8px 10px;
  font-size: 12px;
}

.wf-model3d-input-color {
  padding: 4px;
  min-height: 34px;
}

.wf-model3d-check {
  grid-auto-flow: column;
  justify-content: start;
  align-items: center;
  gap: 8px;
  color: var(--vscode-fg);
  font-size: 12px;
}

.wf-model3d-info-card {
  display: grid;
  gap: 8px;
  border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
  background: rgb(from var(--dweb-defualt-dark) r g b / 0.54);
  padding: 10px;
}

.wf-model3d-info-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.wf-model3d-info-value {
  font-size: 12px;
  color: var(--vscode-fg);
  word-break: break-all;
  text-align: right;
}

@media (max-width: 720px) {
  .wf-model3d-grid {
    grid-template-columns: 1fr;
  }
}
</style>
