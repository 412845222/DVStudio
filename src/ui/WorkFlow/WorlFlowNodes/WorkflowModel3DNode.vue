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
    @start-link="(payload) => emit('start-link', payload)"
    @end-link="(payload) => emit('end-link', payload)"
    @copy="() => emit('copy')"
    @refresh="() => emit('refresh')"
    @delete="() => emit('delete')"
    @set-type="(type) => emit('set-type', type)"
    @resize="(payload) => emit('resize', payload)"
  >
    <template #body>
      <div class="wf-model3d-body">
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
          <label class="wf-model3d-field wf-model3d-field-wide">
            <span class="wf-model3d-label">模型来源</span>
            <select class="wf-model3d-input" :value="modelGenerationSource" @change="onModelGenerationSourceChange">
              <option value="upload">本地上传</option>
              <option value="comfyui">ComfyUI</option>
              <option value="meshy">Meshy</option>
            </select>
          </label>

          <template v-if="modelGenerationSource === 'meshy'">
            <!-- Meshy 参数面板 -->
            <div class="wf-model3d-meshy-panel wf-model3d-field-wide">
              <div class="wf-model3d-meshy-section">
                <div class="wf-model3d-meshy-section-title">基础参数</div>

                <label class="wf-model3d-field">
                  <span class="wf-model3d-label">任务类型</span>
                  <select class="wf-model3d-input" :value="meshyTaskFamily" @change="onMeshyTaskFamilyChange">
                    <option value="text-to-3d">Text to 3D</option>
                    <option value="image-to-3d">Image to 3D</option>
                    <option value="multi-image-to-3d">Multi-Image to 3D</option>
                  </select>
                </label>

                <label class="wf-model3d-field wf-model3d-field-wide">
                  <span class="wf-model3d-label">提示词</span>
                  <textarea
                    class="wf-model3d-textarea"
                    rows="2"
                    :value="meshyPrompt"
                    placeholder="输入描述想要生成的 3D 模型"
                    @input="onMeshyPromptInput"
                  />
                </label>

                <label class="wf-model3d-field wf-model3d-field-wide">
                  <span class="wf-model3d-label">负向提示词</span>
                  <textarea
                    class="wf-model3d-textarea compact"
                    rows="2"
                    :value="meshyNegativePrompt"
                    placeholder="例如：low quality, low poly, ugly"
                    @input="onMeshyNegativePromptInput"
                  />
                </label>

                <label v-if="meshyTaskFamily === 'image-to-3d'" class="wf-model3d-field wf-model3d-field-wide">
                  <span class="wf-model3d-label">参考图 URL</span>
                  <input class="wf-model3d-input" type="text" :value="meshyImageUrl" placeholder="https://.../image.png" @input="onMeshyImageUrlInput" />
                </label>

                <label v-if="meshyTaskFamily === 'multi-image-to-3d'" class="wf-model3d-field wf-model3d-field-wide">
                  <span class="wf-model3d-label">多图 URL（每行一个）</span>
                  <textarea
                    class="wf-model3d-textarea compact"
                    rows="3"
                    :value="meshyMultiImageText"
                    placeholder="每行一个 URL，最多 4 张"
                    @input="onMeshyMultiImageInput"
                  />
                </label>
              </div>

              <div class="wf-model3d-meshy-section">
                <div class="wf-model3d-meshy-section-title">高级参数</div>

                <label class="wf-model3d-field">
                  <span class="wf-model3d-label">模型版本</span>
                  <select class="wf-model3d-input" :value="meshyAiModel" @change="onMeshyAiModelChange">
                    <option value="latest">latest</option>
                    <option value="meshy-6">meshy-6</option>
                    <option value="meshy-5">meshy-5</option>
                  </select>
                </label>

                <label class="wf-model3d-field">
                  <span class="wf-model3d-label">网格模式</span>
                  <select class="wf-model3d-input" :value="meshyModelType" :disabled="isLowpolyModelType" @change="onMeshyModelTypeChange">
                    <option value="standard">standard</option>
                    <option value="lowpoly">lowpoly</option>
                  </select>
                </label>

                <label class="wf-model3d-field">
                  <span class="wf-model3d-label">拓扑</span>
                  <select class="wf-model3d-input" :value="meshyTopology" :disabled="isLowpolyModelType" @change="onMeshyTopologyChange">
                    <option value="triangle">triangle</option>
                    <option value="quad">quad</option>
                  </select>
                </label>

                <label class="wf-model3d-field">
                  <span class="wf-model3d-label">目标面数</span>
                  <input
                    class="wf-model3d-input"
                    type="number"
                    min="100"
                    max="300000"
                    step="100"
                    :value="meshyTargetPolycount"
                    :disabled="isLowpolyModelType"
                    @change="onMeshyTargetPolycountChange"
                  />
                </label>

                <label class="wf-model3d-field">
                  <span class="wf-model3d-label">对称模式</span>
                  <select class="wf-model3d-input" :value="meshySymmetryMode" :disabled="isLowpolyModelType" @change="onMeshySymmetryModeChange">
                    <option value="auto">auto</option>
                    <option value="on">on</option>
                    <option value="off">off</option>
                  </select>
                </label>

                <label class="wf-model3d-check">
                  <input type="checkbox" :checked="meshyShouldRemesh" :disabled="isLowpolyModelType" @change="onMeshyShouldRemeshToggle" />
                  <span>重建网格</span>
                </label>

                <label class="wf-model3d-check">
                  <input type="checkbox" :checked="meshySavePreRemeshedModel" :disabled="isLowpolyModelType || !meshyShouldRemesh" @change="onMeshySavePreRemeshedToggle" />
                  <span>保留重建前模型</span>
                </label>

                <label class="wf-model3d-check">
                  <input type="checkbox" :checked="meshyShouldTexture" @change="onMeshyShouldTextureToggle" />
                  <span>生成贴图</span>
                </label>

                <label class="wf-model3d-check">
                  <input type="checkbox" :checked="meshyEnablePbr" :disabled="!meshyShouldTexture" @change="onMeshyEnablePbrToggle" />
                  <span>PBR 材质</span>
                </label>

                <label class="wf-model3d-field wf-model3d-field-wide">
                  <span class="wf-model3d-label">贴图提示词</span>
                  <textarea
                    class="wf-model3d-textarea compact"
                    rows="2"
                    :value="meshyTexturePrompt"
                    :disabled="!meshyShouldTexture"
                    placeholder="可选"
                    @input="onMeshyTexturePromptInput"
                  />
                </label>

                <label class="wf-model3d-field wf-model3d-field-wide">
                  <span class="wf-model3d-label">贴图参考图 URL</span>
                  <input
                    class="wf-model3d-input"
                    type="text"
                    :value="meshyTextureImageUrl"
                    :disabled="!meshyShouldTexture"
                    placeholder="可选"
                    @input="onMeshyTextureImageUrlInput"
                  />
                </label>

                <label class="wf-model3d-field">
                  <span class="wf-model3d-label">姿势模式</span>
                  <select class="wf-model3d-input" :value="meshyPoseMode" @change="onMeshyPoseModeChange">
                    <option value="">无</option>
                    <option value="a-pose">A Pose</option>
                    <option value="t-pose">T Pose</option>
                  </select>
                </label>

                <label class="wf-model3d-check">
                  <input type="checkbox" :checked="meshyAutoSize" @change="onMeshyAutoSizeToggle" />
                  <span>自动尺寸</span>
                </label>

                <label class="wf-model3d-field">
                  <span class="wf-model3d-label">原点位置</span>
                  <select class="wf-model3d-input" :value="meshyOriginAt" :disabled="!meshyAutoSize" @change="onMeshyOriginAtChange">
                    <option value="bottom">bottom</option>
                    <option value="center">center</option>
                  </select>
                </label>

                <label class="wf-model3d-check">
                  <input type="checkbox" :checked="meshyModeration" @change="onMeshyModerationToggle" />
                  <span>内容审核</span>
                </label>

                <label class="wf-model3d-check">
                  <input type="checkbox" :checked="meshyImageEnhancement" @change="onMeshyImageEnhancementToggle" />
                  <span>图像增强</span>
                </label>

                <label class="wf-model3d-check">
                  <input type="checkbox" :checked="meshyRemoveLighting" @change="onMeshyRemoveLightingToggle" />
                  <span>去除光照烘焙</span>
                </label>

                <div class="wf-model3d-field wf-model3d-field-wide">
                  <span class="wf-model3d-label">输出格式</span>
                  <div class="wf-model3d-format-grid">
                    <label v-for="fmt in targetFormatOptions" :key="fmt" class="wf-model3d-check">
                      <input type="checkbox" :checked="meshyTargetFormats.includes(fmt)" @change="onMeshyTargetFormatToggle(fmt, $event)" />
                      <span>{{ fmt }}</span>
                    </label>
                  </div>
                </div>

                <label class="wf-model3d-field">
                  <span class="wf-model3d-label">Seed</span>
                  <input class="wf-model3d-input" type="number" min="0" step="1" :value="meshySeed" placeholder="0 表示自动随机" @change="onMeshySeedChange" />
                </label>
              </div>

              <!-- 任务状态区域 -->
              <div v-if="meshyTaskId || meshyTaskStatus !== 'idle'" class="wf-model3d-meshy-section">
                <div class="wf-model3d-meshy-section-title">任务状态</div>
                <div class="wf-model3d-meshy-status-card" :class="`is-${meshyTaskStatus}`">
                  <div class="wf-model3d-meshy-status-row">
                    <span class="wf-model3d-label">状态</span>
                    <span class="wf-model3d-status-value">{{ meshyStatusLabel }}</span>
                  </div>
                  <div v-if="meshyTaskStatus === 'running' || meshyTaskStatus === 'pending'" class="wf-model3d-meshy-progress">
                    <div class="wf-model3d-meshy-progress-bar" :style="{ width: `${meshyProgress}%` }"></div>
                  </div>
                  <div v-if="meshyTaskId" class="wf-model3d-meshy-status-row">
                    <span class="wf-model3d-label">任务ID</span>
                    <span class="wf-model3d-status-value wf-model3d-status-id">{{ meshyTaskId }}</span>
                  </div>
                  <div class="wf-model3d-meshy-status-row">
                    <span class="wf-model3d-label">阶段</span>
                    <span class="wf-model3d-status-value">{{ meshyStatusText || '-' }}</span>
                  </div>
                  <div v-if="meshyErrorMessage" class="wf-model3d-meshy-error">{{ meshyErrorMessage }}</div>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="wf-model3d-meshy-actions">
                <button
                  class="wf-model3d-btn"
                  type="button"
                  :disabled="!canMeshyGenerate"
                  :title="meshyGenerateDisabledReason"
                  @click.stop="emit('start-meshy-generation')"
                >
                  {{ meshyGenerateButtonText }}
                </button>
                <button
                  v-if="meshyTaskStatus === 'succeeded' && meshyRelationKind === 'model'"
                  class="wf-model3d-btn secondary"
                  type="button"
                  @click.stop="emit('start-meshy-retexture')"
                >
                  生成贴图
                </button>
                <button
                  class="wf-model3d-btn secondary"
                  type="button"
                  :disabled="!meshyTaskId"
                  @click.stop="emit('refresh-meshy-status')"
                >
                  刷新状态
                </button>
                <button
                  class="wf-model3d-btn secondary"
                  type="button"
                  :disabled="!canMeshyStopTask"
                  @click.stop="emit('stop-meshy-task')"
                >
                  停止任务
                </button>
                <button
                  class="wf-model3d-btn secondary"
                  type="button"
                  :disabled="!meshyTaskId"
                  @click.stop="emit('delete-meshy-task')"
                >
                  删除任务
                </button>
              </div>
            </div>
          </template>

          <template v-else>
            <!-- 原有参数 -->
            <label class="wf-model3d-field wf-model3d-field-wide">
              <span class="wf-model3d-label">模型 URL</span>
              <input class="wf-model3d-input" type="text" :value="modelUrl" placeholder="https://.../model.glb" @input="onModelUrlInput" />
            </label>

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
          </template>
        </div>
      </div>
    </template>
  </WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import WorkflowNodeBase from '../WorkflowNodeBase.vue'
import { Model3DPreviewViewer } from './model3d/Model3DPreviewViewer'
import type { WorkflowModel3DNodeSettings, WorkflowMeshyModelSettings } from '../../../aiworkflow/types'
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
  (e: 'start-meshy-generation'): void
  (e: 'start-meshy-retexture'): void
  (e: 'refresh-meshy-status'): void
  (e: 'stop-meshy-task'): void
  (e: 'delete-meshy-task'): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const snapshotUrl = ref('')
const errorMessage = ref('')
let viewer: Model3DPreviewViewer | null = null
let loadRunId = 0
let activePreviewRequestId = 0

const settings = computed(() => props.model3dSettings ?? null)
const threePreviewState = computed(() => props.threePreviewState ?? null)
const previewPhase = computed(() => threePreviewState.value?.phase ?? 'masked')
const previewSuspended = computed(() => props.previewSuspended === true)
const viewerLive = computed(() => previewPhase.value === 'loading' || previewPhase.value === 'interactive')
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

// Meshy 相关配置
const modelGenerationSource = computed(() => String(settings.value?.modelGenerationSource ?? 'upload') as 'upload' | 'comfyui' | 'meshy')
const meshySettings = computed(() => settings.value?.meshyModelSettings ?? null)

const meshyTaskFamily = computed(() => String(meshySettings.value?.taskFamily ?? 'text-to-3d') as 'text-to-3d' | 'image-to-3d' | 'multi-image-to-3d')
const meshyPrompt = computed(() => String(meshySettings.value?.prompt ?? ''))
const meshyNegativePrompt = computed(() => String(meshySettings.value?.negativePrompt ?? ''))
const meshyImageUrl = computed(() => String(meshySettings.value?.imageUrl ?? ''))
const meshyMultiImageText = computed(() => (meshySettings.value?.imageUrls ?? []).join('\n'))
const meshyAiModel = computed(() => String(meshySettings.value?.aiModel ?? 'latest') as 'latest' | 'meshy-6' | 'meshy-5')
const meshyModelType = computed(() => String(meshySettings.value?.modelType ?? 'standard') as 'standard' | 'lowpoly')
const meshyTopology = computed(() => String(meshySettings.value?.topology ?? 'triangle') as 'triangle' | 'quad')
const meshyTargetPolycount = computed(() => Number(meshySettings.value?.targetPolycount ?? 30000))
const meshySymmetryMode = computed(() => String(meshySettings.value?.symmetryMode ?? 'auto') as 'auto' | 'on' | 'off')
const meshyShouldRemesh = computed(() => meshySettings.value?.shouldRemesh === true)
const meshySavePreRemeshedModel = computed(() => meshySettings.value?.savePreRemeshedModel === true)
const meshyShouldTexture = computed(() => meshySettings.value?.shouldTexture !== false)
const meshyEnablePbr = computed(() => meshySettings.value?.enablePbr === true)
const meshyTexturePrompt = computed(() => String(meshySettings.value?.texturePrompt ?? ''))
const meshyTextureImageUrl = computed(() => String(meshySettings.value?.textureImageUrl ?? ''))
const meshyPoseMode = computed(() => String(meshySettings.value?.poseMode ?? ''))
const meshyAutoSize = computed(() => meshySettings.value?.autoSize === true)
const meshyOriginAt = computed(() => String(meshySettings.value?.originAt ?? 'bottom') as 'bottom' | 'center')
const meshyModeration = computed(() => meshySettings.value?.moderation === true)
const meshyImageEnhancement = computed(() => meshySettings.value?.imageEnhancement === true)
const meshyRemoveLighting = computed(() => meshySettings.value?.removeLighting === true)
const meshySeed = computed(() => Math.max(0, Number(meshySettings.value?.seed ?? 0) || 0))
const meshyTaskId = computed(() => String(meshySettings.value?.taskId ?? '').trim())
const meshyTaskStatus = computed(() => String(meshySettings.value?.taskStatus ?? 'idle') as 'idle' | 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled')
const meshyProgress = computed(() => Number(meshySettings.value?.progress ?? 0))
const meshyStatusText = computed(() => String(meshySettings.value?.statusText ?? ''))
const meshyErrorMessage = computed(() => String(meshySettings.value?.errorMessage ?? ''))

const targetFormatOptions = ['glb', 'obj', 'fbx', 'stl', 'usdz'] as const
const meshyTargetFormats = computed(() => {
  const list = Array.isArray(meshySettings.value?.targetFormats)
    ? meshySettings.value!.targetFormats!
    : ['glb']
  const normalized = list.map(x => String(x ?? '').trim().toLowerCase()).filter(x => targetFormatOptions.includes(x as any))
  return normalized.length ? (normalized as Array<typeof targetFormatOptions[number]>) : ['glb']
})

const meshyRelationKind = computed(() =>
  String(meshySettings.value?.relationKind ?? 'model').trim() || 'model'
)

const isLowpolyModelType = computed(() => meshyModelType.value === 'lowpoly')

const meshyStatusLabel = computed(() => {
  if (meshyTaskStatus.value === 'running') return '任务执行中'
  if (meshyTaskStatus.value === 'pending') return '任务排队中'
  if (meshyTaskStatus.value === 'succeeded') return '任务已完成'
  if (meshyTaskStatus.value === 'failed') return '任务失败'
  if (meshyTaskStatus.value === 'canceled') return '任务已取消'
  return '待发起任务'
})

const canMeshyGenerate = computed(() => {
  if (meshyTaskStatus.value === 'pending' || meshyTaskStatus.value === 'running') return false
  if (!meshyPrompt.value.trim() && meshyTaskFamily.value === 'text-to-3d') return false
  if (meshyTaskFamily.value === 'image-to-3d' && !meshyImageUrl.value.trim()) return false
  if (meshyTaskFamily.value === 'multi-image-to-3d' && !meshyMultiImageText.value.trim()) return false
  return true
})

const meshyGenerateDisabledReason = computed(() => {
  if (meshyTaskStatus.value === 'pending' || meshyTaskStatus.value === 'running') return 'Meshy 任务进行中'
  if (!meshyPrompt.value.trim() && meshyTaskFamily.value === 'text-to-3d') return '请填写提示词'
  if (meshyTaskFamily.value === 'image-to-3d' && !meshyImageUrl.value.trim()) return '请填写参考图 URL'
  if (meshyTaskFamily.value === 'multi-image-to-3d' && !meshyMultiImageText.value.trim()) return '请填写多图 URL'
  return ''
})

const meshyGenerateButtonText = computed(() => {
  if (meshyTaskStatus.value === 'pending') return '排队中…'
  if (meshyTaskStatus.value === 'running') return '执行中…'
  if (meshyTaskStatus.value === 'succeeded') return '重新执行'
  return '启动任务'
})

const canMeshyStopTask = computed(() =>
  !!meshyTaskId.value && (meshyTaskStatus.value === 'pending' || meshyTaskStatus.value === 'running')
)

const updateMeshySettings = (patch: Partial<WorkflowMeshyModelSettings>) => {
  updateSettings({ meshyModelSettings: { ...meshySettings.value, ...patch } } as Partial<WorkflowModel3DNodeSettings>)
}

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
  } catch (err: any) {
    if (current !== loadRunId) return
    errorMessage.value = String(err?.message ?? err ?? '模型加载失败')
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

// Meshy 事件处理
const onModelGenerationSourceChange = (e: Event) => {
  const value = String((e.target as HTMLSelectElement).value ?? 'upload') as 'upload' | 'comfyui' | 'meshy'
  updateSettings({ modelGenerationSource: value })
}

const onMeshyTaskFamilyChange = (e: Event) => {
  const value = String((e.target as HTMLSelectElement).value ?? 'text-to-3d') as 'text-to-3d' | 'image-to-3d' | 'multi-image-to-3d'
  updateMeshySettings({ taskFamily: value as any })
}

const onMeshyPromptInput = (e: Event) => {
  updateMeshySettings({ prompt: String((e.target as HTMLTextAreaElement).value ?? '') })
}

const onMeshyNegativePromptInput = (e: Event) => {
  updateMeshySettings({ negativePrompt: String((e.target as HTMLTextAreaElement).value ?? '') })
}

const onMeshyImageUrlInput = (e: Event) => {
  updateMeshySettings({ imageUrl: String((e.target as HTMLInputElement).value ?? '') })
}

const onMeshyMultiImageInput = (e: Event) => {
  const value = String((e.target as HTMLTextAreaElement).value ?? '')
  const urls = value.split(/\r?\n/).map(x => x.trim()).filter(x => !!x).slice(0, 4)
  updateMeshySettings({ imageUrls: urls })
}

const onMeshyAiModelChange = (e: Event) => {
  const value = String((e.target as HTMLSelectElement).value ?? 'latest') as 'latest' | 'meshy-6' | 'meshy-5'
  updateMeshySettings({ aiModel: value as any })
}

const onMeshyModelTypeChange = (e: Event) => {
  const value = String((e.target as HTMLSelectElement).value ?? 'standard') as 'standard' | 'lowpoly'
  updateMeshySettings({ modelType: value as any })
}

const onMeshyTopologyChange = (e: Event) => {
  const value = String((e.target as HTMLSelectElement).value ?? 'triangle') as 'triangle' | 'quad'
  updateMeshySettings({ topology: value as any })
}

const onMeshyTargetPolycountChange = (e: Event) => {
  const raw = Number((e.target as HTMLInputElement).value ?? 30000)
  const value = Number.isFinite(raw) ? Math.max(100, Math.min(300000, Math.floor(raw))) : 30000
  updateMeshySettings({ targetPolycount: value })
}

const onMeshySymmetryModeChange = (e: Event) => {
  const value = String((e.target as HTMLSelectElement).value ?? 'auto') as 'auto' | 'on' | 'off'
  updateMeshySettings({ symmetryMode: value as any })
}

const onMeshyShouldRemeshToggle = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true
  updateMeshySettings({
    shouldRemesh: checked,
    ...(checked ? {} : { savePreRemeshedModel: false }),
  })
}

const onMeshySavePreRemeshedToggle = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true
  updateMeshySettings({ savePreRemeshedModel: checked })
}

const onMeshyShouldTextureToggle = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true
  updateMeshySettings({
    shouldTexture: checked,
    ...(checked ? {} : { enablePbr: false }),
  })
}

const onMeshyEnablePbrToggle = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true
  updateMeshySettings({ enablePbr: checked })
}

const onMeshyTexturePromptInput = (e: Event) => {
  updateMeshySettings({ texturePrompt: String((e.target as HTMLTextAreaElement).value ?? '') })
}

const onMeshyTextureImageUrlInput = (e: Event) => {
  updateMeshySettings({ textureImageUrl: String((e.target as HTMLInputElement).value ?? '') })
}

const onMeshyPoseModeChange = (e: Event) => {
  const value = String((e.target as HTMLSelectElement).value ?? '') as '' | 'a-pose' | 't-pose'
  updateMeshySettings({ poseMode: value as any })
}

const onMeshyAutoSizeToggle = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true
  updateMeshySettings({
    autoSize: checked,
    ...(checked ? {} : { originAt: 'bottom' }),
  })
}

const onMeshyOriginAtChange = (e: Event) => {
  const value = String((e.target as HTMLSelectElement).value ?? 'bottom') as 'bottom' | 'center'
  updateMeshySettings({ originAt: value as any })
}

const onMeshyModerationToggle = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true
  updateMeshySettings({ moderation: checked })
}

const onMeshyImageEnhancementToggle = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true
  updateMeshySettings({ imageEnhancement: checked })
}

const onMeshyRemoveLightingToggle = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true
  updateMeshySettings({ removeLighting: checked })
}

const onMeshyTargetFormatToggle = (format: typeof targetFormatOptions[number], e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true
  const current = [...meshyTargetFormats.value]
  const next = checked
    ? Array.from(new Set([...current, format]))
    : current.filter(x => x !== format)
  updateMeshySettings({ targetFormats: (next.length ? next : ['glb']) as any })
}

const onMeshySeedChange = (e: Event) => {
  const raw = Number((e.target as HTMLInputElement).value ?? 0)
  updateMeshySettings({ seed: Math.max(0, Number.isFinite(raw) ? Math.floor(raw) : 0) })
}

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

/* Meshy 参数面板样式 */
.wf-model3d-meshy-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
  background: rgb(from var(--dweb-defualt-dark) r g b / 0.54);
  padding: 12px;
}

.wf-model3d-meshy-section {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.wf-model3d-meshy-section-title {
  grid-column: 1 / -1;
  font-size: 11px;
  color: #9ec2dd;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding-bottom: 6px;
  border-bottom: 1px solid rgb(from var(--vscode-border) r g b / 0.5);
}

.wf-model3d-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
  background: rgb(from var(--dweb-defualt-dark) r g b / 0.72);
  color: var(--vscode-fg);
  padding: 8px 10px;
  font-size: 12px;
  resize: vertical;
  min-height: 60px;
}

.wf-model3d-textarea.compact {
  min-height: 50px;
}

.wf-model3d-format-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

/* Meshy 状态卡片样式 */
.wf-model3d-meshy-status-card {
  grid-column: 1 / -1;
  display: grid;
  gap: 8px;
  border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
  background: rgb(from var(--dweb-defualt-dark) r g b / 0.54);
  padding: 10px;
}

.wf-model3d-meshy-status-card.is-running,
.wf-model3d-meshy-status-card.is-pending {
  box-shadow: 0 0 0 1px rgb(90 180 255 / 0.24), 0 0 18px rgb(90 180 255 / 0.18);
}

.wf-model3d-meshy-status-card.is-succeeded {
  box-shadow: 0 0 0 1px rgb(56 189 140 / 0.24), 0 0 18px rgb(56 189 140 / 0.16);
}

.wf-model3d-meshy-status-card.is-failed {
  box-shadow: 0 0 0 1px rgb(248 113 113 / 0.24), 0 0 18px rgb(248 113 113 / 0.16);
}

.wf-model3d-meshy-status-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.wf-model3d-status-value {
  font-size: 12px;
  color: var(--vscode-fg);
  word-break: break-all;
  text-align: right;
}

.wf-model3d-status-id {
  font-size: 11px;
  color: var(--vscode-fg-muted);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wf-model3d-meshy-progress {
  height: 4px;
  background: rgb(from var(--vscode-border) r g b / 0.5);
  border-radius: 2px;
  overflow: hidden;
}

.wf-model3d-meshy-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, rgb(90 180 255), rgb(56 189 140));
  transition: width 200ms ease;
}

.wf-model3d-meshy-error {
  font-size: 11px;
  color: #fecaca;
  padding: 6px 8px;
  background: rgb(248 113 113 / 0.1);
  border: 1px solid rgb(248 113 113 / 0.3);
}

/* Meshy 操作按钮 */
.wf-model3d-meshy-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-start;
}

.wf-model3d-btn.secondary {
  padding: 6px 8px;
  font-size: 11px;
  border-color: rgb(from var(--vscode-border) r g b / 0.72);
}

.wf-model3d-btn:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .wf-model3d-grid {
    grid-template-columns: 1fr;
  }
  .wf-model3d-meshy-section {
    grid-template-columns: 1fr;
  }
  .wf-model3d-format-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
