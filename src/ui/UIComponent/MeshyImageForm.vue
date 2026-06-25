<template>
  <div class="meshy-image-form">
    <div class="meshy-field">
      <label class="meshy-label">提示词</label>
      <textarea
        class="meshy-textarea"
        rows="2"
        :value="config.prompt"
        placeholder="描述想要生成的图像内容"
        @input="updateConfig('prompt', ($event.target as HTMLTextAreaElement).value)"
      />
    </div>

    <div class="meshy-field">
      <label class="meshy-label">负向提示词</label>
      <textarea
        class="meshy-textarea"
        rows="2"
        :value="config.negativePrompt"
        placeholder="不希望出现的元素"
        @input="updateConfig('negativePrompt', ($event.target as HTMLTextAreaElement).value)"
      />
    </div>

    <div class="meshy-row">
      <div class="meshy-field">
        <label class="meshy-label">生成模型</label>
        <select
          class="meshy-input"
          :value="config.aiModel"
          @change="updateConfig('aiModel', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="opt in aiModelOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div class="meshy-field">
        <label class="meshy-label">输出图片数量</label>
        <select
          class="meshy-input"
          :value="config.outputImageCount"
          @change="updateConfig('outputImageCount', Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="count in [1, 2, 3, 4]" :key="count" :value="count">
            {{ count }} 张
          </option>
        </select>
      </div>
    </div>

    <div class="meshy-row">
      <div class="meshy-field">
        <label class="meshy-label">是否多视图</label>
        <label class="meshy-switch">
          <input
            type="checkbox"
            :checked="config.generateMultiView"
            @change="updateConfig('generateMultiView', ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ config.generateMultiView ? '开启' : '关闭' }}</span>
        </label>
      </div>

      <div class="meshy-field">
        <label class="meshy-label">比例</label>
        <select
          class="meshy-input"
          :value="config.aspectRatio"
          :disabled="config.generateMultiView"
          @change="updateConfig('aspectRatio', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="opt in aspectRatioOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
    </div>

    <div class="meshy-row">
      <div class="meshy-field">
        <label class="meshy-label">姿势</label>
        <select
          class="meshy-input"
          :value="config.poseMode"
          @change="updateConfig('poseMode', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="opt in poseModeOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div class="meshy-field">
        <label class="meshy-label">Seed</label>
        <input
          class="meshy-input"
          type="number"
          :value="config.seed"
          @change="updateConfig('seed', Number(($event.target as HTMLInputElement).value))"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NODE_CHAT_MESHY_IMAGE_OPTIONS } from '../BluePrint/node-dialog/nodeChatConfig'

export interface MeshyImageConfig {
  prompt?: string
  negativePrompt?: string
  aiModel?: string
  outputImageCount?: number
  generateMultiView?: boolean
  aspectRatio?: string
  poseMode?: string
  seed?: number
}

const props = defineProps<{
  config: MeshyImageConfig
}>()

const emit = defineEmits<{
  (e: 'update:config', v: MeshyImageConfig): void
}>()

const aiModelOptions = NODE_CHAT_MESHY_IMAGE_OPTIONS.aiModel
const aspectRatioOptions = NODE_CHAT_MESHY_IMAGE_OPTIONS.aspectRatio
const poseModeOptions = NODE_CHAT_MESHY_IMAGE_OPTIONS.poseMode

const updateConfig = (key: keyof MeshyImageConfig, value: unknown) => {
  emit('update:config', { ...props.config, [key]: value } as MeshyImageConfig)
}
</script>

<style scoped>
.meshy-image-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.meshy-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meshy-label {
  font-size: 12px;
  font-weight: 500;
  color: #666;
}

.meshy-textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 14px;
  resize: vertical;
}

.meshy-input {
  padding: 6px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 14px;
  background: white;
}

.meshy-row {
  display: flex;
  gap: 16px;
}

.meshy-row .meshy-field {
  flex: 1;
}

.meshy-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.meshy-switch input {
  width: 40px;
  height: 20px;
}
</style>