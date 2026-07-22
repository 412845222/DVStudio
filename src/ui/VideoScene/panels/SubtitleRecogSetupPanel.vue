<template>
  <div class="subtitle-recog-setup">
    <div class="setup-header">
      <div class="setup-title">字幕识别环境配置</div>
      <div class="setup-subtitle">本地语音识别（Whisper.cpp）完全离线运行</div>
    </div>

    <div class="setup-steps">
      <div
        v-for="(step, idx) in steps"
        :key="step.id"
        class="setup-step-indicator"
        :class="{
          active: idx === currentStepIndex,
          completed: step.status === 'completed',
          error: step.status === 'error',
        }"
      >
        <div class="step-number">{{ idx + 1 }}</div>
        <div class="step-label">{{ step.title }}</div>
      </div>
    </div>

    <div class="setup-content">
      <div v-if="currentStep?.id === 'overview'" class="step-panel">
        <div class="step-title">{{ currentStep.title }}</div>
        <div class="step-desc">字幕识别功能需要安装以下组件才能使用：</div>
        <div class="env-check-list">
          <div class="env-check-item" :class="{ ok: envStatus?.ffmpeg?.ok, error: !envStatus?.ffmpeg?.ok }">
            <span class="env-icon">{{ envStatus?.ffmpeg?.ok ? '✓' : '✗' }}</span>
            <div class="env-info">
              <div class="env-name">FFmpeg</div>
              <div class="env-detail">{{ envStatus?.ffmpeg?.detail || '检查中...' }}</div>
            </div>
          </div>
          <div class="env-check-item" :class="{ ok: envStatus?.binary?.ok, error: !envStatus?.binary?.ok }">
            <span class="env-icon">{{ envStatus?.binary?.ok ? '✓' : '✗' }}</span>
            <div class="env-info">
              <div class="env-name">Whisper 引擎</div>
              <div class="env-detail">{{ envStatus?.binary?.detail || '检查中...' }}</div>
            </div>
          </div>
          <div class="env-check-item" :class="{ ok: envStatus?.defaultModel, error: !envStatus?.defaultModel }">
            <span class="env-icon">{{ envStatus?.defaultModel ? '✓' : '✗' }}</span>
            <div class="env-info">
              <div class="env-name">识别模型</div>
              <div class="env-detail">
                {{ envStatus?.defaultModel ? `已安装: ${envStatus.defaultModel}` : '未安装' }}
              </div>
            </div>
          </div>
        </div>
        <div class="step-note">
          所有组件将下载到本地用户数据目录，不会随安装包分发。
        </div>
      </div>

      <div v-else-if="currentStep?.id === 'ffmpeg'" class="step-panel">
        <div class="step-title">{{ currentStep.title }}</div>
        <div class="step-desc">FFmpeg 是音视频处理工具，用于从视频中提取音频。</div>
        <div v-if="envStatus?.ffmpeg?.ok" class="status-ok">
          <span class="status-icon">✓</span>
          FFmpeg 已安装：{{ envStatus.ffmpeg.detail }}
        </div>
        <div v-else class="status-error">
          <span class="status-icon">✗</span>
          FFmpeg 未检测到
          <div class="install-hint">
            <p>请按照以下方式安装 FFmpeg：</p>
            <ol>
              <li>Windows: 从 <a href="#" @click.prevent="openFfmpegGuide">ffmpeg.org</a> 下载，或使用 winget: <code>winget install ffmpeg</code></li>
              <li>macOS: 使用 Homebrew: <code>brew install ffmpeg</code></li>
              <li>Linux: 使用包管理器: <code>sudo apt install ffmpeg</code></li>
            </ol>
            <button class="vs-btn primary" @click="runBootstrap">运行引导安装程序</button>
            <button class="vs-btn" @click="recheckEnv">重新检查</button>
          </div>
        </div>
      </div>

      <div v-else-if="currentStep?.id === 'binary'" class="step-panel">
        <div class="step-title">{{ currentStep.title }}</div>
        <div class="step-desc">下载 Whisper.cpp 语音识别引擎（约 8MB）。</div>

        <div v-if="envStatus?.binary?.ok" class="status-ok">
          <span class="status-icon">✓</span>
          {{ envStatus.binary.detail }}
        </div>

        <div v-else-if="!binaryConfig?.supported" class="status-error">
          <span class="status-icon">✗</span>
          {{ binaryConfig?.message || '当前平台暂不支持自动下载' }}
        </div>

        <template v-else>
          <div class="download-section">
            <div class="mirror-toggle">
              <label>
                <input type="checkbox" v-model="useMirror" />
                使用国内镜像加速（hf-mirror.com）
              </label>
            </div>

            <div v-if="binaryDownloadError" class="error-message">{{ binaryDownloadError }}</div>

            <div v-if="downloadingBinary || binaryDownloadProgress > 0" class="progress-section">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: `${binaryDownloadProgress}%` }"></div>
              </div>
              <div class="progress-text">{{ binaryDownloadMessage || `${binaryDownloadProgress}%` }}</div>
            </div>

            <button
              v-if="!downloadingBinary"
              class="vs-btn primary"
              :disabled="!envStatus?.ffmpeg?.ok"
              @click="startDownloadBinary"
            >
              下载 Whisper 引擎
            </button>
          </div>
        </template>
      </div>

      <div v-else-if="currentStep?.id === 'model'" class="step-panel">
        <div class="step-title">{{ currentStep.title }}</div>
        <div class="step-desc">选择并下载语音识别模型。推荐首次使用 Base 模型。</div>

        <div class="model-select">
          <div
            v-for="model in availableModels"
            :key="model.size"
            class="model-option"
            :class="{ selected: selectedModelSize === model.size }"
            @click="selectedModelSize = model.size"
          >
            <div class="model-radio">
              <input type="radio" :value="model.size" v-model="selectedModelSize" />
            </div>
            <div class="model-info">
              <div class="model-name">{{ model.name }} ({{ model.diskSize }})</div>
              <div class="model-desc">{{ model.description }}</div>
              <div class="model-meta">{{ model.recommendedFor }}</div>
            </div>
          </div>
        </div>

        <div v-if="envStatus?.defaultModel" class="status-ok">
          <span class="status-icon">✓</span>
          已安装模型：{{ envStatus.defaultModel }}
        </div>

        <div v-if="modelDownloadError" class="error-message">{{ modelDownloadError }}</div>

        <div v-if="downloadingModel || modelDownloadProgress > 0" class="progress-section">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${modelDownloadProgress}%` }"></div>
          </div>
          <div class="progress-text">{{ modelDownloadMessage || `${modelDownloadProgress}%` }}</div>
        </div>

        <button
          v-if="!downloadingModel"
          class="vs-btn primary"
          :disabled="!envStatus?.binary?.ok"
          @click="startDownloadModel"
        >
          {{ envStatus?.defaultModel === selectedModelSize ? '重新下载' : '下载模型' }}
        </button>
      </div>

      <div v-else-if="currentStep?.id === 'verify'" class="step-panel">
        <div class="step-title">{{ currentStep.title }}</div>
        <div class="step-desc">验证所有组件是否正确安装。</div>
        <div v-if="checking" class="loading">正在验证环境...</div>
        <button v-else class="vs-btn primary" @click="runVerify">开始验证</button>
      </div>

      <div v-else-if="currentStep?.id === 'done'" class="step-panel done-panel">
        <div class="done-icon">✓</div>
        <div class="done-title">环境配置完成！</div>
        <div class="done-desc">现在可以使用字幕识别功能了。</div>
      </div>
    </div>

    <div class="setup-footer">
      <button
        v-if="currentStepIndex > 0 && currentStep?.id !== 'done'"
        class="vs-btn"
        @click="prevStep"
      >
        上一步
      </button>
      <button
        v-if="currentStep?.id === 'overview'"
        class="vs-btn primary"
        @click="startSetup"
      >
        开始配置
      </button>
      <button
        v-if="currentStep?.id === 'ffmpeg' && envStatus?.ffmpeg?.ok"
        class="vs-btn primary"
        @click="nextStep"
      >
        下一步
      </button>
      <button
        v-if="currentStep?.id === 'binary' && envStatus?.binary?.ok"
        class="vs-btn primary"
        @click="nextStep"
      >
        下一步
      </button>
      <button
        v-if="currentStep?.id === 'model' && envStatus?.defaultModel"
        class="vs-btn primary"
        @click="nextStep"
      >
        下一步
      </button>
      <button
        v-if="currentStep?.id === 'verify' && envStatus?.ok"
        class="vs-btn primary"
        @click="nextStep"
      >
        完成
      </button>
      <button
        v-if="currentStep?.id === 'done'"
        class="vs-btn primary"
        @click="$emit('close')"
      >
        关闭
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useSubtitleRecogSetup } from '../../../composables/useSubtitleRecogSetup'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'ready'): void
}>()

const {
  checking,
  envStatus,
  binaryConfig,
  downloadingBinary,
  binaryDownloadProgress,
  binaryDownloadMessage,
  binaryDownloadError,
  availableModels,
  selectedModelSize,
  downloadingModel,
  modelDownloadProgress,
  modelDownloadMessage,
  modelDownloadError,
  useMirror,
  steps,
  currentStepIndex,
  currentStep,
  isReady,
  checkEnv,
  loadBinaryConfig,
  downloadBinary,
  loadAvailableModels,
  loadModelConfig,
  downloadModel,
  verify,
  nextStep,
  prevStep,
  openFfmpegInstallGuide: openFfmpegGuide,
  runBootstrapInstaller: runBootstrap,
} = useSubtitleRecogSetup()

onMounted(async () => {
  await checkEnv()
  await loadBinaryConfig()
  await loadAvailableModels()
  await loadModelConfig()
})

watch(isReady, (ready) => {
  if (ready) {
    emit('ready')
  }
})

watch(selectedModelSize, async (size) => {
  await loadModelConfig(size)
})

async function recheckEnv() {
  await checkEnv()
}

async function startSetup() {
  await checkEnv()
  if (envStatus.value?.ok) {
    nextStep()
    nextStep()
    nextStep()
    nextStep()
    nextStep()
  } else if (!envStatus.value?.ffmpeg?.ok) {
    nextStep()
  } else if (!envStatus.value?.binary?.ok) {
    nextStep()
    nextStep()
  } else if (!envStatus.value?.defaultModel) {
    nextStep()
    nextStep()
    nextStep()
  }
}

async function startDownloadBinary() {
  try {
    for await (const _ of downloadBinary()) {
    }
    await checkEnv()
    if (envStatus.value?.binary?.ok) {
      nextStep()
    }
  } catch (err) {
    console.error('Binary download failed:', err)
  }
}

async function startDownloadModel() {
  try {
    for await (const _ of downloadModel()) {
    }
    await checkEnv()
    if (envStatus.value?.defaultModel) {
      nextStep()
    }
  } catch (err) {
    console.error('Model download failed:', err)
  }
}

async function runVerify() {
  await verify()
  if (envStatus.value?.ok) {
    nextStep()
  }
}
</script>

<style scoped>
.subtitle-recog-setup {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px;
  background: #1a1a2e;
  color: #e0e0e0;
  font-size: 14px;
}

.setup-header {
  text-align: center;
  margin-bottom: 24px;
}

.setup-title {
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 4px;
}

.setup-subtitle {
  font-size: 13px;
  color: #888;
}

.setup-steps {
  display: flex;
  justify-content: space-between;
  margin-bottom: 24px;
  padding: 0 8px;
}

.setup-step-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  position: relative;
}

.setup-step-indicator:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 14px;
  left: 50%;
  width: 100%;
  height: 2px;
  background: #333;
}

.setup-step-indicator.completed:not(:last-child)::after {
  background: #4caf50;
}

.step-number {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #333;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  margin-bottom: 8px;
  z-index: 1;
  position: relative;
}

.setup-step-indicator.active .step-number {
  background: #2196f3;
  color: #fff;
}

.setup-step-indicator.completed .step-number {
  background: #4caf50;
  color: #fff;
}

.setup-step-indicator.error .step-number {
  background: #f44336;
  color: #fff;
}

.step-label {
  font-size: 12px;
  color: #888;
  text-align: center;
}

.setup-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: #16162a;
  border-radius: 8px;
}

.step-panel {
  min-height: 200px;
}

.step-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 8px;
}

.step-desc {
  font-size: 13px;
  color: #aaa;
  margin-bottom: 20px;
}

.step-note {
  margin-top: 16px;
  padding: 12px;
  background: rgba(33, 150, 243, 0.1);
  border-radius: 4px;
  font-size: 12px;
  color: #64b5f6;
}

.env-check-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.env-check-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: #1a1a2e;
  border-radius: 6px;
  border-left: 3px solid #666;
}

.env-check-item.ok {
  border-left-color: #4caf50;
}

.env-check-item.error {
  border-left-color: #f44336;
}

.env-icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
}

.env-check-item.ok .env-icon {
  color: #4caf50;
}

.env-check-item.error .env-icon {
  color: #f44336;
}

.env-name {
  font-weight: 500;
  color: #fff;
  margin-bottom: 4px;
}

.env-detail {
  font-size: 12px;
  color: #888;
}

.status-ok {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(76, 175, 80, 0.1);
  border-radius: 6px;
  color: #4caf50;
  margin-bottom: 16px;
}

.status-error {
  padding: 12px;
  background: rgba(244, 67, 54, 0.1);
  border-radius: 6px;
  color: #f44336;
  margin-bottom: 16px;
}

.status-icon {
  margin-right: 8px;
}

.install-hint {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(244, 67, 54, 0.2);
  color: #ccc;
  font-size: 13px;
}

.install-hint p {
  margin: 0 0 8px 0;
}

.install-hint ol {
  margin: 0 0 12px 20px;
  padding: 0;
}

.install-hint li {
  margin-bottom: 4px;
}

.install-hint code {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
}

.install-hint a {
  color: #64b5f6;
  text-decoration: underline;
}

.download-section {
  margin-top: 16px;
}

.mirror-toggle {
  margin-bottom: 16px;
  font-size: 13px;
  color: #aaa;
}

.mirror-toggle label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.error-message {
  padding: 12px;
  background: rgba(244, 67, 54, 0.1);
  border-radius: 6px;
  color: #f44336;
  margin-bottom: 16px;
  font-size: 13px;
}

.progress-section {
  margin-bottom: 16px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #333;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #2196f3, #64b5f6);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 12px;
  color: #888;
  text-align: center;
}

.model-select {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.model-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: #1a1a2e;
  border-radius: 6px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.model-option:hover {
  background: #1f1f3a;
}

.model-option.selected {
  border-color: #2196f3;
  background: rgba(33, 150, 243, 0.1);
}

.model-radio {
  padding-top: 2px;
}

.model-name {
  font-weight: 500;
  color: #fff;
  margin-bottom: 4px;
}

.model-desc {
  font-size: 12px;
  color: #aaa;
  margin-bottom: 4px;
}

.model-meta {
  font-size: 11px;
  color: #666;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #888;
}

.done-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.done-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #4caf50;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  color: #fff;
  margin-bottom: 16px;
}

.done-title {
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 8px;
}

.done-desc {
  color: #888;
}

.setup-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #333;
}

.vs-btn {
  padding: 8px 20px;
  border-radius: 6px;
  border: 1px solid #444;
  background: #2a2a4a;
  color: #e0e0e0;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.vs-btn:hover:not(:disabled) {
  background: #3a3a5a;
  border-color: #666;
}

.vs-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.vs-btn.primary {
  background: #2196f3;
  border-color: #2196f3;
  color: #fff;
}

.vs-btn.primary:hover:not(:disabled) {
  background: #1976d2;
  border-color: #1976d2;
}
</style>
