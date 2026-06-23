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
          <span class="bp-node-chat-param-label">模型接口</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in textModelOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.model === opt.value }"
              :disabled="disabled"
              @click="updateParam('model', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div v-if="params.model === 'bytedance'" class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">Seed 版本</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in seedModelVersionOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.textModelVersion === opt.value }"
              :disabled="disabled"
              @click="updateParam('textModelVersion', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
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
        <div v-if="params.model === 'bytedance'" class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">深度思考</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in textThinkingOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.thinking === opt.value }"
              :disabled="disabled"
              @click="updateParam('thinking', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div v-if="params.model === 'bytedance'" class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">输出格式</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in textResponseFormatOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.responseFormat === opt.value }"
              :disabled="disabled"
              @click="updateParam('responseFormat', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div v-if="params.model === 'bytedance'" class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">最大输出</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in textMaxTokensOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.maxTokens === opt.value }"
              :disabled="disabled"
              @click="updateParam('maxTokens', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="nodeType === 'image'">
        <div class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">模型接口</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in imageModelOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.model === opt.value }"
              :disabled="disabled"
              @click="updateParam('model', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div v-if="params.model === 'seedream'" class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">型号</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in seedreamModelVersionOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.seedreamModelVersion === opt.value }"
              :disabled="disabled"
              @click="updateParam('seedreamModelVersion', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div v-if="params.model === 'nanobanana'" class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">型号</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in nanobananaModelVersionOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.nanobananaModelVersion === opt.value }"
              :disabled="disabled"
              @click="updateParam('nanobananaModelVersion', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div v-if="params.model === 'meshy'" class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">型号</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in meshyImageAiModelOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.meshyImageAiModel === opt.value }"
              :disabled="disabled"
              @click="updateParam('meshyImageAiModel', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div v-if="params.model === 'meshy'" class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">姿态模式</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in meshyPoseModeOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.meshyPoseMode === opt.value }"
              :disabled="disabled"
              @click="updateParam('meshyPoseMode', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div v-if="params.model === 'meshy'" class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">多视图</span>
          <div class="bp-node-chat-param-options">
            <button
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': !params.meshyGenerateMultiView }"
              :disabled="disabled"
              @click="updateParam('meshyGenerateMultiView', false)"
            >
              关闭
            </button>
            <button
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.meshyGenerateMultiView === true }"
              :disabled="disabled"
              @click="updateParam('meshyGenerateMultiView', true)"
            >
              开启
            </button>
          </div>
        </div>
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
          <span class="bp-node-chat-param-label">模型接口</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in videoModelOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.model === opt.value }"
              :disabled="disabled"
              @click="updateParam('model', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div v-if="params.model === 'seedance'" class="bp-node-chat-param-row">
          <span class="bp-node-chat-param-label">型号</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in seedanceModelVersionOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.seedanceModelVersion === opt.value }"
              :disabled="disabled"
              @click="updateParam('seedanceModelVersion', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
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
          <span class="bp-node-chat-param-label">模型接口</span>
          <div class="bp-node-chat-param-options">
            <button
              v-for="opt in model3dProviderOptions"
              :key="opt.value"
              type="button"
              class="bp-node-chat-param-btn"
              :class="{ 'is-active': params.provider === opt.value }"
              :disabled="disabled"
              @click="updateParam('provider', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <template v-if="params.provider === 'meshy'">
          <div class="bp-node-chat-param-row">
            <span class="bp-node-chat-param-label">生成模式</span>
            <div class="bp-node-chat-param-options">
              <button
                v-for="opt in meshyModeOptions"
                :key="opt.value"
                type="button"
                class="bp-node-chat-param-btn"
                :class="{ 'is-active': params.meshyMode === opt.value }"
                :disabled="disabled"
                @click="updateParam('meshyMode', opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
          <div class="bp-node-chat-param-row">
            <span class="bp-node-chat-param-label">AI模型</span>
            <div class="bp-node-chat-param-options">
              <button
                v-for="opt in meshyAiModelOptions"
                :key="opt.value"
                type="button"
                class="bp-node-chat-param-btn"
                :class="{ 'is-active': params.meshyAiModel === opt.value }"
                :disabled="disabled"
                @click="updateParam('meshyAiModel', opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
          <div class="bp-node-chat-param-row">
            <span class="bp-node-chat-param-label">模型类型</span>
            <div class="bp-node-chat-param-options">
              <button
                v-for="opt in meshyModelTypeOptions"
                :key="opt.value"
                type="button"
                class="bp-node-chat-param-btn"
                :class="{ 'is-active': params.meshyModelType === opt.value }"
                :disabled="disabled"
                @click="updateParam('meshyModelType', opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
          <div class="bp-node-chat-param-row">
            <span class="bp-node-chat-param-label">拓扑结构</span>
            <div class="bp-node-chat-param-options">
              <button
                v-for="opt in meshyTopologyOptions"
                :key="opt.value"
                type="button"
                class="bp-node-chat-param-btn"
                :class="{ 'is-active': params.meshyTopology === opt.value }"
                :disabled="disabled"
                @click="updateParam('meshyTopology', opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
          <div class="bp-node-chat-param-row">
            <span class="bp-node-chat-param-label">对称模式</span>
            <div class="bp-node-chat-param-options">
              <button
                v-for="opt in meshySymmetryModeOptions"
                :key="opt.value"
                type="button"
                class="bp-node-chat-param-btn"
                :class="{ 'is-active': params.meshySymmetryMode === opt.value }"
                :disabled="disabled"
                @click="updateParam('meshySymmetryMode', opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
          <div class="bp-node-chat-param-row">
            <span class="bp-node-chat-param-label">原点位置</span>
            <div class="bp-node-chat-param-options">
              <button
                v-for="opt in meshyOriginAtOptions"
                :key="opt.value"
                type="button"
                class="bp-node-chat-param-btn"
                :class="{ 'is-active': params.meshyOriginAt === opt.value }"
                :disabled="disabled"
                @click="updateParam('meshyOriginAt', opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
          <div class="bp-node-chat-param-row">
            <span class="bp-node-chat-param-label">姿态模式</span>
            <div class="bp-node-chat-param-options">
              <button
                v-for="opt in meshyPoseModeOptions"
                :key="opt.value"
                type="button"
                class="bp-node-chat-param-btn"
                :class="{ 'is-active': params.meshyPoseMode === opt.value }"
                :disabled="disabled"
                @click="updateParam('meshyPoseMode', opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
          <div class="bp-node-chat-param-row">
            <span class="bp-node-chat-param-label">输出格式</span>
            <div class="bp-node-chat-param-options">
              <button
                v-for="opt in meshyOutputFormatOptions"
                :key="opt.value"
                type="button"
                class="bp-node-chat-param-btn"
                :class="{ 'is-active': params.meshyOutputFormat === opt.value }"
                :disabled="disabled"
                @click="updateParam('meshyOutputFormat', opt.value)"
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
                  :checked="params.meshyMultiView"
                  :disabled="disabled"
                  @change="updateParam('meshyMultiView', ($event.target as HTMLInputElement).checked)"
                />
                <span>多视图</span>
              </label>
              <div class="bp-node-chat-param-seed">
                <label>种子</label>
                <input
                  type="number"
                  :value="params.meshySeed"
                  :disabled="disabled"
                  placeholder="-1 随机"
                  @input="updateParam('meshySeed', parseInt(($event.target as HTMLInputElement).value) || -1)"
                />
              </div>
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
  NODE_CHAT_TEXT_SPEED_OPTIONS,
  NODE_CHAT_TEXT_MODEL_OPTIONS,
  NODE_CHAT_TEXT_THINKING_OPTIONS,
  NODE_CHAT_TEXT_RESPONSE_FORMAT_OPTIONS,
  NODE_CHAT_TEXT_MAX_TOKENS_OPTIONS,
  NODE_CHAT_IMAGE_MODEL_OPTIONS,
  NODE_CHAT_VIDEO_MODEL_OPTIONS,
  NODE_CHAT_MODEL3D_PROVIDER_OPTIONS,
  NODE_CHAT_SEEDREAM_MODEL_VERSION_OPTIONS,
  NODE_CHAT_NANOBANANA_MODEL_VERSION_OPTIONS,
  NODE_CHAT_SEEDANCE_MODEL_VERSION_OPTIONS,
  NODE_CHAT_SEED_MODEL_VERSION_OPTIONS,
  NODE_CHAT_MESHY_MODE_OPTIONS,
  NODE_CHAT_MESHY_AI_MODEL_OPTIONS,
  NODE_CHAT_MESHY_IMAGE_OPTIONS,
  NODE_CHAT_MESHY_MODEL_TYPE_OPTIONS,
  NODE_CHAT_MESHY_TOPOLOGY_OPTIONS,
  NODE_CHAT_MESHY_SYMMETRY_MODE_OPTIONS,
  NODE_CHAT_MESHY_ORIGIN_AT_OPTIONS,
  NODE_CHAT_MESHY_POSE_MODE_OPTIONS,
  NODE_CHAT_MESHY_OUTPUT_FORMAT_OPTIONS,
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

const textSpeedOptions = NODE_CHAT_TEXT_SPEED_OPTIONS
const textModelOptions = NODE_CHAT_TEXT_MODEL_OPTIONS
const textThinkingOptions = NODE_CHAT_TEXT_THINKING_OPTIONS
const textResponseFormatOptions = NODE_CHAT_TEXT_RESPONSE_FORMAT_OPTIONS
const textMaxTokensOptions = NODE_CHAT_TEXT_MAX_TOKENS_OPTIONS
const seedModelVersionOptions = NODE_CHAT_SEED_MODEL_VERSION_OPTIONS
const imageModelOptions = NODE_CHAT_IMAGE_MODEL_OPTIONS
const videoModelOptions = NODE_CHAT_VIDEO_MODEL_OPTIONS
const model3dProviderOptions = NODE_CHAT_MODEL3D_PROVIDER_OPTIONS
const resolutionOptions = NODE_CHAT_RESOLUTION_OPTIONS
const aspectRatioOptions = NODE_CHAT_ASPECT_RATIO_OPTIONS
const quantityOptions = NODE_CHAT_QUANTITY_OPTIONS
const videoModeOptions = NODE_CHAT_VIDEO_MODE_OPTIONS
const videoDurationOptions = NODE_CHAT_VIDEO_DURATION_OPTIONS
const videoRatioOptions = NODE_CHAT_VIDEO_RATIO_OPTIONS
const meshyModeOptions = NODE_CHAT_MESHY_MODE_OPTIONS
const meshyAiModelOptions = NODE_CHAT_MESHY_AI_MODEL_OPTIONS
const meshyModelTypeOptions = NODE_CHAT_MESHY_MODEL_TYPE_OPTIONS
const meshyTopologyOptions = NODE_CHAT_MESHY_TOPOLOGY_OPTIONS
const meshySymmetryModeOptions = NODE_CHAT_MESHY_SYMMETRY_MODE_OPTIONS
const meshyOriginAtOptions = NODE_CHAT_MESHY_ORIGIN_AT_OPTIONS
const meshyPoseModeOptions = NODE_CHAT_MESHY_POSE_MODE_OPTIONS
const meshyOutputFormatOptions = NODE_CHAT_MESHY_OUTPUT_FORMAT_OPTIONS
const seedreamModelVersionOptions = NODE_CHAT_SEEDREAM_MODEL_VERSION_OPTIONS
const nanobananaModelVersionOptions = NODE_CHAT_NANOBANANA_MODEL_VERSION_OPTIONS
const meshyImageAiModelOptions = NODE_CHAT_MESHY_IMAGE_OPTIONS.aiModel
const seedanceModelVersionOptions = NODE_CHAT_SEEDREAM_MODEL_VERSION_OPTIONS
</script>

<style scoped>
.bp-node-chat-param-panel {
  border-top: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
  padding: 4px 0;
}

.bp-node-chat-param-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  cursor: pointer;
  user-select: none;
  transition: background 0.22s ease;
}

.bp-node-chat-param-header:hover {
  background: color-mix(in srgb, var(--wf-primary, #1f9d84) 8%, transparent);
}

.bp-node-chat-param-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--wf-primary, #1f9d84);
  text-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
  letter-spacing: 0.5px;
}

.bp-node-chat-param-toggle {
  display: flex;
  align-items: center;
}

.bp-node-chat-chevron {
  transition: transform 0.22s ease;
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
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
  color: color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  font-weight: 500;
}

.bp-node-chat-param-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bp-node-chat-param-btn {
  padding: 5px 10px;
  font-size: 12px;
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
  border-radius: 2px;
  background: transparent;
  color: var(--wf-text, #edf2f4);
  cursor: pointer;
  transition: all 0.22s ease;
  font-family: inherit;
}

.bp-node-chat-param-btn:hover:not(:disabled) {
  border-color: var(--wf-primary, #1f9d84);
  color: var(--wf-primary, #1f9d84);
  box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
  background: color-mix(in srgb, var(--wf-primary, #1f9d84) 8%, transparent);
}

.bp-node-chat-param-btn.is-active {
  background: color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent);
  border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 65%, transparent);
  color: var(--wf-primary, #1f9d84);
  box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
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
  color: var(--wf-text, #edf2f4);
  cursor: pointer;
}

.bp-node-chat-param-toggle input[type='checkbox'] {
  width: 14px;
  height: 14px;
  accent-color: var(--wf-primary, #1f9d84);
}

.bp-node-chat-param-seed {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--wf-text, #edf2f4);
}

.bp-node-chat-param-seed input {
  width: 80px;
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
  border-radius: 2px;
  background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 92%, transparent);
  color: var(--wf-text, #edf2f4);
  font-family: monospace;
  transition: border-color 0.22s ease, box-shadow 0.22s ease;
}

.bp-node-chat-param-seed input:focus {
  outline: none;
  border-color: var(--wf-primary, #1f9d84);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent), 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
}
</style>
