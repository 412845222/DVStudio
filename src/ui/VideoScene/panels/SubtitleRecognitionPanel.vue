<template>
	<div class="subtitle-recog-panel">
		<div class="panel-header">
			<div class="panel-title">自动字幕识别</div>
			<div class="panel-subtitle">本地离线语音识别</div>
		</div>

		<div v-if="!envReady" class="env-warning">
			<div class="warning-icon">!</div>
			<div class="warning-content">
				<div class="warning-title">需要配置环境</div>
				<div class="warning-desc">字幕识别功能需要先下载 Whisper 引擎和模型文件</div>
			</div>
			<button class="vs-btn primary" @click="openSetup">配置环境</button>
		</div>

		<template v-else>
			<div class="config-section">
				<div class="form-row">
					<label class="form-label">识别模型</label>
					<select v-model="selectedModel" class="form-input">
						<option v-for="model in installedModels" :key="model.size" :value="model.size">
							{{ model.size }} ({{ formatFileSize(model.fileSize) }})
						</option>
					</select>
				</div>
				<div class="form-row">
					<label class="form-label">语言</label>
					<select v-model="language" class="form-input">
						<option value="auto">自动检测</option>
						<option value="zh">中文</option>
						<option value="en">英文</option>
						<option value="ja">日文</option>
						<option value="ko">韩文</option>
					</select>
				</div>
			</div>

			<div class="action-section">
				<button
					class="vs-btn primary large"
					:disabled="recognizing || !videoPath"
					@click="startRecognition"
				>
					<span v-if="recognizing" class="spinner" />
					{{ recognizing ? '识别中...' : '开始识别' }}
				</button>
				<div v-if="!videoPath" class="hint-text">请先选择或加载视频</div>
			</div>

			<div v-if="recognizing || progress.phase !== 'idle'" class="progress-section">
				<div class="progress-phase">{{ phaseText }}</div>
				<div class="progress-bar">
					<div class="progress-fill" :style="{ width: `${progress.percent}%` }"></div>
				</div>
				<div class="progress-message">{{ progress.message }}</div>
			</div>

			<div v-if="error" class="error-section">
				<div class="error-icon">✗</div>
				<div class="error-text">{{ error }}</div>
			</div>

			<div v-if="hasResult" class="result-section">
				<div class="result-header">
					<div class="result-title">识别结果 ({{ cues.length }} 条)</div>
					<div class="result-actions">
						<button class="vs-btn" @click="reset">重新识别</button>
						<button class="vs-btn primary" @click="$emit('import-cues', cues)">
							导入到字幕编辑器
						</button>
					</div>
				</div>
				<div class="cue-list">
					<div v-for="(cue, i) in cues" :key="i" class="cue-item">
						<div class="cue-time">
							{{ formatTimeShort(cue.startTime) }} - {{ formatTimeShort(cue.endTime) }}
						</div>
						<div class="cue-text">{{ cue.text }}</div>
					</div>
				</div>
			</div>
		</template>

		<SubtitleRecogSetupPanel v-if="showSetup" @close="closeSetup" @ready="onSetupReady" />
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useSubtitleRecognition } from '../../../composables/useSubtitleRecognition'
import SubtitleRecogSetupPanel from './SubtitleRecogSetupPanel.vue'
import type { SubtitleRecogCue, SubtitleRecogInstalledModel } from '../../../types/electron-bridge'

const props = defineProps<{
	videoPath?: string
}>()

const emit = defineEmits<{
	(e: 'import-cues', cues: SubtitleRecogCue[]): void
}>()

const {
	envReady,
	checkingEnv,
	envStatus,
	recognizing,
	progress,
	cues,
	error,
	selectedModel,
	language,
	hasResult,
	checkEnv,
	reset,
	recognizeVideo
} = useSubtitleRecognition()

const showSetup = ref(false)

const installedModels = computed<SubtitleRecogInstalledModel[]>(() => {
	return envStatus.value?.models || []
})

const phaseText = computed(() => {
	const phaseMap: Record<string, string> = {
		idle: '就绪',
		checking: '检查环境',
		'extracting-audio': '提取音频',
		recognizing: '语音识别中',
		parsing: '解析结果',
		done: '完成',
		error: '出错'
	}
	return phaseMap[progress.value.phase] || progress.value.phase
})

onMounted(async () => {
	await checkEnv()
})

watch(
	() => props.videoPath,
	() => {
		if (!recognizing.value) {
			reset()
		}
	}
)

function openSetup() {
	showSetup.value = true
}

function closeSetup() {
	showSetup.value = false
}

async function onSetupReady() {
	await checkEnv()
	showSetup.value = false
}

async function startRecognition() {
	if (!props.videoPath) return
	try {
		for await (const _ of recognizeVideo(props.videoPath)) {
		}
	} catch (err) {
		console.error('Recognition failed:', err)
	}
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return bytes + ' B'
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
	return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatTimeShort(seconds: number): string {
	const m = Math.floor(seconds / 60)
	const s = Math.floor(seconds % 60)
	const ms = Math.floor((seconds % 1) * 100)
	return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}
</script>

<style scoped>
.subtitle-recog-panel {
	display: flex;
	flex-direction: column;
	height: 100%;
	padding: 16px;
	background: #1a1a2e;
	color: #e0e0e0;
	font-size: 13px;
}

.panel-header {
	margin-bottom: 16px;
}

.panel-title {
	font-size: 16px;
	font-weight: 600;
	color: #fff;
	margin-bottom: 2px;
}

.panel-subtitle {
	font-size: 12px;
	color: #888;
}

.env-warning {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 16px;
	background: rgba(255, 152, 0, 0.1);
	border: 1px solid rgba(255, 152, 0, 0.3);
	border-radius: 8px;
	margin-bottom: 16px;
}

.warning-icon {
	width: 32px;
	height: 32px;
	border-radius: 50%;
	background: #ff9800;
	color: #fff;
	display: flex;
	align-items: center;
	justify-content: center;
	font-weight: bold;
	font-size: 18px;
	flex-shrink: 0;
}

.warning-content {
	flex: 1;
}

.warning-title {
	font-weight: 500;
	color: #ff9800;
	margin-bottom: 2px;
}

.warning-desc {
	font-size: 12px;
	color: #aaa;
}

.config-section {
	margin-bottom: 16px;
}

.form-row {
	margin-bottom: 12px;
}

.form-label {
	display: block;
	font-size: 12px;
	color: #aaa;
	margin-bottom: 6px;
}

.form-input {
	width: 100%;
	padding: 8px 12px;
	background: #16162a;
	border: 1px solid #333;
	border-radius: 6px;
	color: #e0e0e0;
	font-size: 13px;
}

.form-input:focus {
	outline: none;
	border-color: #2196f3;
}

.action-section {
	margin-bottom: 16px;
}

.vs-btn {
	padding: 8px 16px;
	border-radius: 6px;
	border: 1px solid #444;
	background: #2a2a4a;
	color: #e0e0e0;
	font-size: 13px;
	cursor: pointer;
	transition: all 0.2s;
	display: inline-flex;
	align-items: center;
	gap: 6px;
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

.vs-btn.large {
	width: 100%;
	padding: 12px;
	font-size: 14px;
	justify-content: center;
}

.hint-text {
	margin-top: 8px;
	font-size: 12px;
	color: #666;
	text-align: center;
}

.spinner {
	width: 14px;
	height: 14px;
	border: 2px solid rgba(255, 255, 255, 0.3);
	border-top-color: #fff;
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.progress-section {
	margin-bottom: 16px;
	padding: 12px;
	background: #16162a;
	border-radius: 6px;
}

.progress-phase {
	font-size: 13px;
	font-weight: 500;
	color: #64b5f6;
	margin-bottom: 8px;
}

.progress-bar {
	width: 100%;
	height: 6px;
	background: #333;
	border-radius: 3px;
	overflow: hidden;
	margin-bottom: 6px;
}

.progress-fill {
	height: 100%;
	background: linear-gradient(90deg, #2196f3, #64b5f6);
	transition: width 0.3s ease;
}

.progress-message {
	font-size: 11px;
	color: #888;
}

.error-section {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding: 12px;
	background: rgba(244, 67, 54, 0.1);
	border-radius: 6px;
	margin-bottom: 16px;
}

.error-icon {
	color: #f44336;
	font-weight: bold;
}

.error-text {
	color: #f44336;
	font-size: 12px;
}

.result-section {
	flex: 1;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.result-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 12px;
}

.result-title {
	font-weight: 500;
	color: #fff;
}

.result-actions {
	display: flex;
	gap: 8px;
}

.cue-list {
	flex: 1;
	overflow-y: auto;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.cue-item {
	padding: 10px;
	background: #16162a;
	border-radius: 6px;
	border-left: 3px solid #2196f3;
}

.cue-time {
	font-size: 11px;
	color: #64b5f6;
	font-family: monospace;
	margin-bottom: 4px;
}

.cue-text {
	font-size: 13px;
	color: #e0e0e0;
	line-height: 1.4;
}
</style>
