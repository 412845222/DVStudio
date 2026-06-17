<template>
  <div class="bp-node-chat-param-panel" :class="{ 'is-collapsed': collapsed }">
    <div class="bp-node-chat-param-header" @click="toggleCollapse">
      <span class="bp-node-chat-param-title">参数设置</span>
      <span class="bp-node-chat-param-toggle">
        <svg
          class="bp-node-chat-chevron"
          :class="{ 'is-collapsed': collapsed }"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
    </div>
    <div v-show="!collapsed" class="bp-node-chat-param-body">
      <template v-if="nodeType === 'text'">
        <div class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">生成速度</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in textSpeedOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.speed === opt.value }"
              :disabled="disabled"
              @click="updateParam('speed', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="nodeType === 'image'">
        <div class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">尺寸</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in resolutionOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.resolution === opt.value }"
              :disabled="disabled"
              @click="updateParam('resolution', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">宽高比</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in aspectRatioOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.aspectRatio === opt.value }"
              :disabled="disabled"
              @click="updateParam('aspectRatio', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">生成数量</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="n in quantityOptions"
              :key="n"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.quantity === n }"
              :disabled="disabled"
              @click="updateParam('quantity', n)"
            >
              {{ n }}x
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="nodeType === 'video'">
        <div class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">视频模式</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in videoModeOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.mode === opt.value }"
              :disabled="disabled"
              @click="updateParam('mode', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">宽高比</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in videoRatioOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.ratio === opt.value }"
              :disabled="disabled"
              @click="updateParam('ratio', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">时长</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in videoDurationOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.duration === opt.value }"
              :disabled="disabled"
              @click="updateParam('duration', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">高级设置</span>
          <div class="bp-node-chat-param-advanced">
            <label class="bp-node-chat-param-toggle">
              <input
                type="checkbox"
                :checked="params.generateAudio"
                :disabled="disabled"
                @change="updateParam('generateAudio', ($event.target as HTMLInputElement).checked)"
              />
              <span>生成音频</span>
            </label>
            <label class="bp-node-chat-param-toggle">
              <input
                type="checkbox"
                :checked="params.watermark"
                :disabled="disabled"
                @change="updateParam('watermark', ($event.target as HTMLInputElement).checked)"
              />
              <span>添加水印</span>
            </label>
            <div class="bp-node-chat-param-seed">
              <label>种子</label>
              <input
                type="number"
                :value="params.seed"
                :disabled="disabled"
                placeholder="-1 随机"
                @input="updateParam('seed', parseInt(($event.target as HTMLInputElement).value) || -1)"
              />
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="nodeType === 'model3d'">
        <div class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">3D引擎</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in model3dProviderOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.provider === opt.value }"
              :disabled="disabled"
              @click="updateProvider(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <template v-if="params.provider === 'tripo3d'">
          <div class="bp-node-chat-param-row">
            <span class="bp-node-chat-param-label">Tripo模式</span>
            <div class="bp-node-chat-param-options">
              <button
                v-for="opt in tripoModeOptions"
                :key="opt.value"
                type="button"
                class="bp-node-chat-param-btn"
                :class="{ 'is-active': params.tripoMode === opt.value }"
                :disabled="disabled"
                @click="updateParam('tripoMode', opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
          <div class="bp-node-chat-param-row">
            <span class="bp-node-chat-param-label">输出格式</span>
            <div class="bp-node-chat-param-options">
              <button
                v-for="opt in tripoOutputFormatOptions"
                :key="opt.value"
                type="button"
                class="bp-node-chat-param-btn"
                :class="{ 'is-active': params.tripoOutputFormat === opt.value }"
                :disabled="disabled"
                @click="updateParam('tripoOutputFormat', opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
          <div class="bp-node-chat-param-row">
            <span class="bp-node-chat-param-label">贴图质量</span>
            <div class="bp-node-chat-param-options">
              <button
                v-for="opt in tripoTextureQualityOptions"
                :key="opt.value"
                type="button"
                class="bp-node-chat-param-btn"
                :class="{ 'is-active': params.tripoTextureQuality === opt.value }"
                :disabled="disabled"
                @click="updateParam('tripoTextureQuality', opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
        </template>

        <template v-else-if="params.provider === 'hunyuan3d'">
          <div class="bp-node-chat-param-row">
            <span class="bp-node-chat-param-label">Hunyuan模式</span>
            <div class="bp-node-chat-param-options">
              <button
                v-for="opt in hunyuanModeOptions"
                :key="opt.value"
                type="button"
                class="bp-node-chat-param-btn"
                :class="{ 'is-active': params.hunyuanMode === opt.value }"
                :disabled="disabled"
                @click="updateParam('hunyuanMode', opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
          <div class="bp-node-chat-param-row">
            <span class="bp-node-chat-param-label">精度</span>
            <div class="bp-node-chat-param-options">
              <button
                v-for="opt in hunyuanFaceLevelOptions"
                :key="opt.value"
                type="button"
                class="bp-node-chat-param-btn"
                :class="{ 'is-active': params.hunyuanFaceLevel === opt.value }"
                :disabled="disabled"
                @click="updateParam('hunyuanFaceLevel', opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
          <div class="bp-node-chat-param-row">
            <span class="bp-node-chat-param-label">面类型</span>
            <div class="bp-node-chat-param-options">
              <button
                v-for="opt in hunyuanPolygonTypeOptions"
                :key="opt.value"
                type="button"
                class="bp-node-chat-param-btn"
                :class="{ 'is-active': params.hunyuanPolygonType === opt.value }"
                :disabled="disabled"
                @click="updateParam('hunyuanPolygonType', opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
          <div class="bp-node-chat-param-row">
            <span class="bp-node-chat-param-label">输出格式</span>
            <div class="bp-node-chat-param-options">
              <button
                v-for="opt in hunyuanOutputFormatOptions"
                :key="opt.value"
                type="button"
                class="bp-node-chat-param-btn"
                :class="{ 'is-active': params.hunyuanOutputFormat === opt.value }"
                :disabled="disabled"
                @click="updateParam('hunyuanOutputFormat', opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
        </template>

        <template v-else-if="params.provider === 'rodin3d'">
          <div class="bp-node-chat-param-row">
            <span class="bp-node-chat-param-label">质量等级</span>
            <div class="bp-node-chat-param-options">
              <button
                v-for="opt in rodinTierOptions"
                :key="opt.value"
                type="button"
                class="bp-node-chat-param-btn"
                :class="{ 'is-active': params.rodinTier === opt.value }"
                :disabled="disabled"
                @click="updateParam('rodinTier', opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
          <div class="bp-node-chat-param-row">
            <span class="bp-node-chat-param-label">质量</span>
            <div class="bp-node-chat-param-options">
              <button
                v-for="opt in rodinQualityOptions"
                :key="opt.value"
                type="button"
                class="bp-node-chat-param-btn"
                :class="{ 'is-active': params.rodinQuality === opt.value }"
                :disabled="disabled"
                @click="updateParam('rodinQuality', opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
          <div class="bp-node-chat-param-row">
            <span class="bp-node-chat-param-label">输出格式</span>
            <div class="bp-node-chat-param-options">
              <button
                v-for="opt in rodinOutputFormatOptions"
                :key="opt.value"
                type="button"
                class="bp-node-chat-param-btn"
                :class="{ 'is-active': params.rodinOutputFormat === opt.value }"
                :disabled="disabled"
                @click="updateParam('rodinOutputFormat', opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { WorkflowNodeChatType } from '../../../aiworkflow/types'
import {
  NODE_CHAT_ASPECT_RATIO_OPTIONS,
  NODE_CHAT_RESOLUTION_OPTIONS,
  NODE_CHAT_QUANTITY_OPTIONS,
  NODE_CHAT_VIDEO_MODE_OPTIONS,
  NODE_CHAT_VIDEO_DURATION_OPTIONS,
  NODE_CHAT_VIDEO_RATIO_OPTIONS,
  NODE_CHAT_MODEL3D_PROVIDER_OPTIONS,
  NODE_CHAT_TRIPO_MODE_OPTIONS,
  NODE_CHAT_TRIPO_OUTPUT_FORMAT_OPTIONS,
  NODE_CHAT_TRIPO_TEXTURE_QUALITY_OPTIONS,
  NODE_CHAT_HUNYUAN_MODE_OPTIONS,
  NODE_CHAT_HUNYUAN_FACE_LEVEL_OPTIONS,
  NODE_CHAT_HUNYUAN_POLYGON_TYPE_OPTIONS,
  NODE_CHAT_HUNYUAN_OUTPUT_FORMAT_OPTIONS,
  NODE_CHAT_RODIN_TIER_OPTIONS,
  NODE_CHAT_RODIN_QUALITY_OPTIONS,
  NODE_CHAT_RODIN_OUTPUT_FORMAT_OPTIONS,
  NODE_CHAT_TEXT_SPEED_OPTIONS,
} from './nodeChatConfig'

const props = defineProps<{
  nodeType: WorkflowNodeChatType
  params: Record<string, any>
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:params', params: Record<string, any>): void
}>()

const collapsed = ref(false)

const toggleCollapse = () => {
  collapsed.value = !collapsed.value
}

const updateParam = (key: string, value: any) => {
  const next = { ...props.params, [key]: value }
  emit('update:params', next)
}

const updateProvider = (provider: string) => {
  const next = { ...props.params, provider }
  emit('update:params', next)
}

const textSpeedOptions = NODE_CHAT_TEXT_SPEED_OPTIONS
const resolutionOptions = NODE_CHAT_RESOLUTION_OPTIONS
const aspectRatioOptions = NODE_CHAT_ASPECT_RATIO_OPTIONS
const quantityOptions = NODE_CHAT_QUANTITY_OPTIONS
const videoModeOptions = NODE_CHAT_VIDEO_MODE_OPTIONS
const videoDurationOptions = NODE_CHAT_VIDEO_DURATION_OPTIONS
const videoRatioOptions = NODE_CHAT_VIDEO_RATIO_OPTIONS
const model3dProviderOptions = NODE_CHAT_MODEL3D_PROVIDER_OPTIONS
const tripoModeOptions = NODE_CHAT_TRIPO_MODE_OPTIONS
const tripoOutputFormatOptions = NODE_CHAT_TRIPO_OUTPUT_FORMAT_OPTIONS
const tripoTextureQualityOptions = NODE_CHAT_TRIPO_TEXTURE_QUALITY_OPTIONS
const hunyuanModeOptions = NODE_CHAT_HUNYUAN_MODE_OPTIONS
const hunyuanFaceLevelOptions = NODE_CHAT_HUNYUAN_FACE_LEVEL_OPTIONS
const hunyuanPolygonTypeOptions = NODE_CHAT_HUNYUAN_POLYGON_TYPE_OPTIONS
const hunyuanOutputFormatOptions = NODE_CHAT_HUNYUAN_OUTPUT_FORMAT_OPTIONS
const rodinTierOptions = NODE_CHAT_RODIN_TIER_OPTIONS
const rodinQualityOptions = NODE_CHAT_RODIN_QUALITY_OPTIONS
const rodinOutputFormatOptions = NODE_CHAT_RODIN_OUTPUT_FORMAT_OPTIONS
</script>

<style scoped>
.bp-node-chat-param-panel {
  border-top: 1px solid color-mix(in srgb, var(--vscode-border) 50%, transparent);
  padding: 4px 0;
}

.bp-node-chat-param-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;
}

.bp-node-chat-param-header:hover {
  background: color-mix(in srgb, var(--vscode-list-hoverBackground) 30%, transparent);
}

.bp-node-chat-param-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--vscode-fg, #e0e0e0);
}

.bp-node-chat-param-toggle {
  display: flex;
  align-items: center;
}

.bp-node-chat-chevron {
  transition: transform 0.2s ease;
  color: var(--vscode-fg-muted, #888);
}

.bp-node-chat-chevron.is-collapsed {
  transform: rotate(-90deg);
}

.bp-node-chat-param-body {
  padding: 4px 14px 12px 14px;
}

.bp-node-chat-param-row {
  margin-bottom: 10px;
}

.bp-node-chat-param-label {
  display: block;
  font-size: 11px;
  color: var(--vscode-fg-muted, #888);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.bp-node-chat-param-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bp-node-chat-param-btn {
  padding: 5px 10px;
  font-size: 12px;
  border: 1px solid var(--vscode-border, #444);
  border-radius: 6px;
  background: transparent;
  color: var(--vscode-fg, #ccc);
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.bp-node-chat-param-btn:hover:not(:disabled) {
  border-color: var(--vscode-border-accent, #3aa8b4);
  color: var(--vscode-border-accent, #3aa8b4);
}

.bp-node-chat-param-btn.is-active {
  background: color-mix(in srgb, var(--vscode-border-accent) 20%, transparent);
  border-color: var(--vscode-border-accent, #3aa8b4);
  color: var(--vscode-border-accent, #3aa8b4);
}

.bp-node-chat-param-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bp-node-chat-param-advanced {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.bp-node-chat-param-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--vscode-fg, #ccc);
  cursor: pointer;
}

.bp-node-chat-param-toggle input[type='checkbox'] {
  width: 14px;
  height: 14px;
  accent-color: var(--vscode-border-accent, #3aa8b4);
}

.bp-node-chat-param-seed {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--vscode-fg, #ccc);
}

.bp-node-chat-param-seed input {
  width: 80px;
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid var(--vscode-border, #444);
  border-radius: 0;
  background: var(--vscode-input-background, #3c3c3c);
  color: var(--vscode-input-foreground, #fff);
  font-family: monospace;
}

.bp-node-chat-param-seed input:focus {
  outline: none;
  border-color: var(--vscode-border-accent, #3aa8b4);
}
</style>
