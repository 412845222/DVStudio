<template>
	<div v-if="open" class="dvs-subtitle-overlay">
		<div class="dvs-subtitle-dialog" role="dialog" aria-modal="true">
			<div class="dvs-subtitle-head">
				<div class="dvs-subtitle-title">自动字幕识别</div>
				<button
					class="dvs-subtitle-close vs-btn"
					type="button"
					aria-label="关闭"
					@click="$emit('close')"
				>
					×
				</button>
			</div>

			<div v-if="!envReady" class="dvs-subtitle-body">
				<div class="setup-section">
					<div class="setup-title">环境配置</div>
					<div class="setup-desc">本地语音识别（Whisper.cpp）需要先配置运行环境</div>
					<div class="env-status-list">
						<div class="env-item" :class="envStatus?.ffmpeg?.ok ? 'ok' : 'error'">
							<span class="env-icon">{{ envStatus?.ffmpeg?.ok ? '✓' : '○' }}</span>
							<span class="env-name">FFmpeg</span>
							<span class="env-detail">{{ envStatus?.ffmpeg?.detail || (checkingEnv ? '检查中...' : '未安装') }}</span>
						</div>
						<div class="env-item" :class="envStatus?.binary?.ok ? 'ok' : 'error'">
							<span class="env-icon">{{ envStatus?.binary?.ok ? '✓' : '○' }}</span>
							<span class="env-name">Whisper 引擎</span>
							<span class="env-detail">{{ envStatus?.binary?.detail || (checkingEnv ? '检查中...' : '未安装') }}</span>
						</div>
						<div class="env-item" :class="envStatus?.defaultModel ? 'ok' : 'error'">
							<span class="env-icon">{{ envStatus?.defaultModel ? '✓' : '○' }}</span>
							<span class="env-name">识别模型</span>
							<span class="env-detail">{{ envStatus?.defaultModel || (checkingEnv ? '检查中...' : '未安装') }}</span>
						</div>
					</div>

					<div v-if="setupError" class="setup-error">{{ setupError }}</div>

					<div v-if="!envStatus?.ffmpeg?.ok" class="install-card">
						<div class="install-title">安装 FFmpeg</div>
						<div class="install-desc">FFmpeg 用于从视频中提取音频（约120MB）</div>
						<div v-if="downloadingFfmpeg" class="download-progress">
							<div class="progress-bar">
								<div class="progress-fill" :class="{ indeterminate: ffmpegIndeterminate }" :style="{ width: ffmpegIndeterminate ? '100%' : ffmpegProgress + '%' }" />
							</div>
							<div class="progress-text">{{ ffmpegStatus || ffmpegMessage }} {{ !ffmpegIndeterminate ? ffmpegProgress + '%' : '' }}</div>
						</div>
						<div class="install-actions">
							<label class="mirror-label">
								<input type="checkbox" v-model="useMirror" />
								使用国内镜像加速
							</label>
							<button class="vs-btn primary" type="button" :disabled="downloadingFfmpeg || !ffmpegConfig?.supported" @click="startDownloadFfmpeg">
								{{ downloadingFfmpeg ? '下载中...' : '自动下载 FFmpeg' }}
							</button>
							<button class="vs-btn" type="button" @click="openFfmpegGuide">查看安装指南</button>
							<button class="vs-btn" type="button" @click="recheckEnv">重新检查</button>
						</div>
						<div v-if="!ffmpegConfig?.supported" class="setup-hint">{{ ffmpegConfig?.message || '当前平台暂不支持自动下载' }}</div>
						<div v-if="ffmpegConfig?.supported" class="setup-hint">提示：如下载失败，请检查网络或在设置中配置HTTP代理后重试</div>
					</div>

					<template v-else-if="!envStatus?.binary?.ok">
						<div class="install-card">
							<div class="install-title">下载 Whisper 引擎</div>
							<div class="install-desc">约 8MB，本地语音识别引擎</div>
							<div v-if="downloadingBinary" class="download-progress">
								<div class="progress-bar">
									<div class="progress-fill" :class="{ indeterminate: binaryIndeterminate }" :style="{ width: binaryIndeterminate ? '100%' : binaryProgress + '%' }" />
								</div>
								<div class="progress-text">{{ binaryStatus || binaryMessage }} {{ !binaryIndeterminate ? binaryProgress + '%' : '' }}</div>
							</div>
							<div class="install-actions">
								<label class="mirror-label">
									<input type="checkbox" v-model="useMirror" />
									使用国内镜像加速
								</label>
								<button class="vs-btn primary" type="button" :disabled="downloadingBinary" @click="startDownloadBinary">
									{{ downloadingBinary ? '下载中...' : '下载 Whisper 引擎' }}
								</button>
							</div>
							<div class="setup-hint">提示：如遇下载超时，可尝试取消国内镜像或配置HTTP代理</div>
						</div>
					</template>

					<template v-else-if="!envStatus?.defaultModel">
						<div class="install-card">
							<div class="install-title">下载识别模型</div>
							<div class="install-desc">选择模型规格（越大越准确但越慢）</div>
							<div class="model-select">
								<label v-for="m in availableModels" :key="m.size" class="model-option" :class="{ selected: selectedModelSize === m.size }">
									<input type="radio" :value="m.size" v-model="selectedModelSize" :disabled="downloadingModel" />
									<span class="model-name">{{ m.name }}</span>
									<span class="model-size">{{ m.diskSize }}</span>
									<span class="model-desc">{{ m.description }}</span>
								</label>
							</div>
							<div v-if="downloadingModel" class="download-progress">
								<div class="progress-bar">
									<div class="progress-fill" :class="{ indeterminate: modelIndeterminate }" :style="{ width: modelIndeterminate ? '100%' : modelProgress + '%' }" />
								</div>
								<div class="progress-text">{{ modelStatus || modelMessage }} {{ !modelIndeterminate ? modelProgress + '%' : '' }}</div>
							</div>
							<div class="install-actions">
								<label class="mirror-label">
									<input type="checkbox" v-model="useMirror" />
									使用国内镜像加速
								</label>
								<button class="vs-btn primary" type="button" :disabled="downloadingModel" @click="startDownloadModel">
									{{ downloadingModel ? '下载中...' : '下载模型' }}
								</button>
							</div>
							<div class="setup-hint">提示：模型较大，建议开启国内镜像；如遇问题可配置HTTP代理</div>
						</div>
					</template>
				</div>
			</div>

			<div v-else class="dvs-subtitle-body">
				<div v-if="!hasResult && !recognizing" class="recog-config">
					<div class="config-row">
						<label class="config-label">识别模型</label>
						<select v-model="selectedModel" class="vs-select" :disabled="recognizing">
							<option v-for="m in effectiveInstalledModels" :key="m.size" :value="m.size">{{ formatModelOption(m) }}</option>
						</select>
					</div>
					<div class="config-row">
						<label class="config-label">语言</label>
						<select v-model="language" class="vs-select" :disabled="recognizing">
							<option value="auto">自动检测</option>
							<option value="zh">中文</option>
							<option value="en">英文</option>
							<option value="ja">日文</option>
						</select>
					</div>
					<div v-if="!hasVideo" class="no-video-hint">请先在时间轴中添加视频</div>
					<div v-else class="video-info">
						<div class="video-name">{{ currentVideoName }}</div>
					</div>
				</div>

				<div v-if="recognizing" class="recog-progress">
					<div class="progress-phase">{{ phaseText }}</div>
					<div class="progress-bar">
						<div class="progress-fill" :style="{ width: progress.percent + '%' }" />
					</div>
					<div class="progress-text">{{ progress.message }} {{ Math.round(progress.percent) }}%</div>
				</div>

				<div v-if="recogError" class="recog-error">{{ recogError }}</div>

				<div v-if="hasResult" class="recog-result">
					<div class="result-header">识别完成，共 {{ cues.length }} 条字幕</div>
					<div class="result-list">
						<div v-for="(cue, i) in cues" :key="i" class="result-item">
							<span class="cue-time">{{ formatTime(cue.startTime) }}</span>
							<span class="cue-text">{{ cue.text }}</span>
						</div>
					</div>
				</div>
			</div>

			<div class="dvs-subtitle-foot">
				<button v-if="!envReady" class="vs-btn" type="button" @click="recheckEnv" :disabled="checkingEnv">
					{{ checkingEnv ? '检查中...' : '重新检查环境' }}
				</button>
				<template v-else>
					<button v-if="recogError" class="vs-btn" type="button" @click="resetRecog">重新识别</button>
					<button v-if="!recognizing && !hasResult && !recogError" class="vs-btn" type="button" @click="$emit('close')">取消</button>
					<button
						v-if="!recognizing"
						class="vs-btn primary"
						type="button"
						:disabled="!hasVideo || startingRecog"
						@click="startRecognize()"
					>
						{{ startingRecog ? '启动中...' : '开始识别' }}
					</button>
					<button v-else class="vs-btn" type="button" disabled>识别中...</button>
				</template>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useStore } from 'vuex'
import type { SubtitleRecogCue, SubtitleRecogModelSize, SubtitleRecogInstalledModel, SubtitleRecogModelInfo } from '../../../types/electron-bridge'
import { msToFrameRangeInclusive } from '../../../core/subtitle/srt'
import { convertRecognitionCuesToSubtitleCues } from '../../../core/subtitle/recognition'
import { buildSubtitleGeneratedKeyframes } from '../../../core/subtitle/subtitleKeyframes'
import { TimelineStore } from '../../../store/timeline'
import { VideoSceneStore, VideoSceneKey, type VideoSceneState } from '../../../store/videoscene'
import { VideoStudioKey, type VideoStudioState } from '../../../store/videostudio'
import type { SubtitleCue, SubtitleCueRange, SubtitleTextStyle, TimelineFrameSpan } from '../../../core/timeline/types'
import { parseDwebProjectAssetUrl } from '../../../network/backendConfig'

const dweb = (window as any).dweb

const props = defineProps<{
	open: boolean
}>()

const emit = defineEmits<{
	(e: 'close'): void
	(e: 'import-cues', cues: SubtitleRecogCue[]): void
}>()

const studioStore = useStore<VideoStudioState>(VideoStudioKey)

const checkingEnv = ref(false)
const envStatus = ref<any>(null)
const envReady = computed(() => envStatus.value?.ok === true)
const setupError = ref('')

const downloadingFfmpeg = ref(false)
const ffmpegProgress = ref(0)
const ffmpegMessage = ref('')
const ffmpegStatus = ref('')
const ffmpegIndeterminate = ref(false)
const ffmpegConfig = ref<any>(null)

const downloadingBinary = ref(false)
const binaryProgress = ref(0)
const binaryMessage = ref('')
const binaryStatus = ref('')
const binaryIndeterminate = ref(false)

const availableModels = ref<SubtitleRecogModelInfo[]>([
	{
		size: 'tiny',
		name: 'Tiny (极速)',
		description: '最快，质量较低，适合快速预览',
		diskSize: '~75 MB',
		language: 'Multilingual',
		recommendedFor: '快速测试、低资源设备'
	},
	{
		size: 'base',
		name: 'Base (快速)',
		description: '平衡速度和质量，推荐首次使用',
		diskSize: '~142 MB',
		language: 'Multilingual',
		recommendedFor: '日常使用（推荐）'
	},
	{
		size: 'small',
		name: 'Small (平衡)',
		description: '质量较好，速度较慢',
		diskSize: '~466 MB',
		language: 'Multilingual',
		recommendedFor: '高质量识别、长视频'
	}
])
const installedModels = ref<SubtitleRecogInstalledModel[]>([])
const effectiveInstalledModels = computed<SubtitleRecogInstalledModel[]>(() => {
	if (installedModels.value.length > 0) return installedModels.value
	if (envStatus.value?.models && Array.isArray(envStatus.value.models)) {
		return envStatus.value.models.filter((m: any) => m && m.installed !== false)
	}
	return []
})
const selectedModelSize = ref<SubtitleRecogModelSize>('base')
const selectedModel = ref<SubtitleRecogModelSize>('base')
const downloadingModel = ref(false)
const modelProgress = ref(0)
const modelMessage = ref('')
const modelStatus = ref('')
const modelIndeterminate = ref(false)
const useMirror = ref(true)

const language = ref('auto')
const recognizing = ref(false)
const startingRecog = ref(false)
const progress = ref({ phase: 'idle', percent: 0, message: '', cueCount: 0 })
const cues = ref<SubtitleRecogCue[]>([])
const recogError = ref('')
const hasResult = computed(() => cues.value.length > 0)
const recognizedAudioUrl = ref<string | null>(null)
const recognizedAudioPath = ref<string | null>(null)

const currentVideoPath = computed(() => {
	const videoAssets = (VideoSceneStore.state as any).videoAssets
	const entries = Object.values(videoAssets || {}) as Array<{ id: string; url: string; name: string }>
	console.log('[SubtitleRecog] videoAssets entries:', entries.map(e => ({ id: e.id, url: e.url, name: e.name })))
	if (entries.length > 0) return entries[0].url
	return ''
})

const currentVideoProjectId = computed(() => {
	const url = currentVideoPath.value
	if (!url) return null
	const parsed = parseDwebProjectAssetUrl(url)
	if (parsed && parsed.projectId > 0) {
		console.log('[SubtitleRecog] parsed projectId from video URL:', parsed.projectId)
		return parsed.projectId
	}
	console.warn('[SubtitleRecog] video URL is not a dweb project-assets URL, cannot get projectId:', url?.substring(0, 100))
	return null
})

const currentVideoName = computed(() => {
	const videoAssets = (VideoSceneStore.state as any).videoAssets
	const entries = Object.values(videoAssets || {}) as Array<{ id: string; url: string; name: string }>
	if (entries.length > 0) return entries[0].name
	return ''
})

const hasVideo = computed(() => !!currentVideoPath.value)

function getModelName(size: SubtitleRecogModelSize | string): string {
	const names: Record<string, string> = {
		tiny: 'Tiny',
		base: 'Base',
		small: 'Small'
	}
	return names[String(size)] || String(size || 'Model')
}

function getModelSizeText(size: SubtitleRecogModelSize | string): string {
	const sizes: Record<string, string> = {
		tiny: '~75 MB',
		base: '~142 MB',
		small: '~466 MB'
	}
	return sizes[String(size)] || ''
}

function formatModelOption(m: SubtitleRecogInstalledModel): string {
	const name = getModelName(m.size)
	const sizeText = getModelSizeText(m.size)
	const sizeMB = m.fileSize ? ` (${(m.fileSize / 1024 / 1024).toFixed(0)} MB)` : (sizeText ? ` (${sizeText})` : '')
	return `${name}${sizeMB}`
}

const phaseText = computed(() => {
	const phaseMap: Record<string, string> = {
		idle: '就绪',
		checking: '检查环境',
		'extracting-audio': '提取音频',
		recognizing: '语音识别中',
		parsing: '解析结果',
		done: '完成',
		error: '出错',
	}
	return phaseMap[progress.value.phase] || progress.value.phase
})

function normalizeVideoPath(p: string): string {
	if (!p) return ''
	const trimmed = p.trim()
	if (!trimmed) return ''

	console.log('[SubtitleRecog] normalizeVideoPath input:', trimmed)

	if (trimmed.startsWith('dweb://') || trimmed.startsWith('file://')) {
		console.log('[SubtitleRecog] passing through URL as-is:', trimmed)
		return trimmed
	}

	if (trimmed.startsWith('/') && /^\/[A-Za-z]:\//.test(trimmed)) {
		const windowsPath = trimmed.slice(1).replace(/\//g, '\\')
		console.log('[SubtitleRecog] converted /C:/... to Windows path:', windowsPath)
		return windowsPath
	}

	if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
		const normalized = trimmed.replace(/\//g, '\\')
		console.log('[SubtitleRecog] normalized Windows path:', normalized)
		return normalized
	}

	console.log('[SubtitleRecog] returning path as-is:', trimmed)
	return trimmed
}

async function checkEnv() {
	checkingEnv.value = true
	setupError.value = ''
	try {
		envStatus.value = await dweb.subtitleRecog.checkEnv()
		if (envStatus.value.defaultModel) {
			selectedModel.value = envStatus.value.defaultModel
		}
		if (!envStatus.value?.ffmpeg?.ok) {
			ffmpegConfig.value = await dweb.subtitleRecog.getFfmpegConfig({ useMirror: useMirror.value })
		}
		await loadInstalledModels()
	} catch (err: any) {
		setupError.value = err.message || String(err)
	} finally {
		checkingEnv.value = false
	}
}

function recheckEnv() {
	checkEnv()
}

async function loadInstalledModels() {
	try {
		installedModels.value = await dweb.subtitleRecog.getInstalledModels()
	} catch {}
}

async function loadAvailableModels() {
	try {
		const models = await dweb.subtitleRecog.getAvailableModels()
		if (models && Array.isArray(models) && models.length > 0) {
			availableModels.value = models
		}
	} catch {
		// 使用默认模型列表
	}
}

async function startDownloadFfmpeg() {
	downloadingFfmpeg.value = true
	ffmpegProgress.value = 0
	ffmpegMessage.value = ''
	ffmpegStatus.value = '正在连接...'
	ffmpegIndeterminate.value = true
	setupError.value = ''
	try {
		const generator = dweb.subtitleRecog.downloadFfmpeg({ useMirror: useMirror.value })
		for await (const chunk of generator) {
			if (chunk.type === 'progress') {
				ffmpegProgress.value = chunk.percent || 0
				ffmpegMessage.value = chunk.message || ''
				ffmpegIndeterminate.value = chunk.indeterminate === true
				ffmpegStatus.value = ''
			} else if (chunk.type === 'status') {
				ffmpegStatus.value = chunk.message || ''
			} else if (chunk.type === 'error') {
				setupError.value = chunk.message || '下载失败'
			} else if (chunk.type === 'done') {
				ffmpegProgress.value = 100
				ffmpegMessage.value = '安装完成'
				ffmpegStatus.value = ''
				ffmpegIndeterminate.value = false
				await checkEnv()
			}
		}
	} catch (err: any) {
		setupError.value = err.message || String(err)
	} finally {
		downloadingFfmpeg.value = false
		ffmpegIndeterminate.value = false
	}
}

async function startDownloadBinary() {
	downloadingBinary.value = true
	binaryProgress.value = 0
	binaryMessage.value = ''
	binaryStatus.value = '正在连接...'
	binaryIndeterminate.value = true
	setupError.value = ''
	try {
		const generator = dweb.subtitleRecog.downloadBinary({ useMirror: useMirror.value })
		for await (const chunk of generator) {
			if (chunk.type === 'progress') {
				binaryProgress.value = chunk.percent || 0
				binaryMessage.value = chunk.message || ''
				binaryIndeterminate.value = chunk.indeterminate === true
				binaryStatus.value = ''
			} else if (chunk.type === 'status') {
				binaryStatus.value = chunk.message || ''
			} else if (chunk.type === 'error') {
				setupError.value = chunk.message || '下载失败'
			} else if (chunk.type === 'done') {
				binaryProgress.value = 100
				binaryMessage.value = '安装完成'
				binaryStatus.value = ''
				binaryIndeterminate.value = false
				await checkEnv()
			}
		}
	} catch (err: any) {
		setupError.value = err.message || String(err)
	} finally {
		downloadingBinary.value = false
		binaryIndeterminate.value = false
	}
}

async function startDownloadModel() {
	downloadingModel.value = true
	modelProgress.value = 0
	modelMessage.value = ''
	modelStatus.value = '正在连接...'
	modelIndeterminate.value = true
	setupError.value = ''
	try {
		const generator = dweb.subtitleRecog.downloadModel({ size: selectedModelSize.value, useMirror: useMirror.value })
		for await (const chunk of generator) {
			if (chunk.type === 'progress') {
				modelProgress.value = chunk.percent || 0
				modelMessage.value = chunk.message || ''
				modelIndeterminate.value = chunk.indeterminate === true
				modelStatus.value = ''
			} else if (chunk.type === 'status') {
				modelStatus.value = chunk.message || ''
			} else if (chunk.type === 'error') {
				setupError.value = chunk.message || '下载失败'
			} else if (chunk.type === 'done') {
				modelProgress.value = 100
				modelMessage.value = '下载完成'
				modelStatus.value = ''
				modelIndeterminate.value = false
				await checkEnv()
			}
		}
	} catch (err: any) {
		setupError.value = err.message || String(err)
	} finally {
		downloadingModel.value = false
		modelIndeterminate.value = false
	}
}

async function openFfmpegGuide() {
	try {
		await dweb.common.openExternalUrl({ url: 'https://ffmpeg.org/download.html' })
	} catch {}
}

async function startRecognize() {
	if (recognizing.value || startingRecog.value) return
	const videoPath = normalizeVideoPath(currentVideoPath.value)
	if (!videoPath) return

	startingRecog.value = true
	recognizing.value = true
	recogError.value = ''
	cues.value = []
	recognizedAudioPath.value = null
	recognizedAudioUrl.value = null
	progress.value = { phase: 'checking', percent: 0, message: '准备识别...', cueCount: 0 }

	try {
		const generator = dweb.subtitleRecog.recognize({
			videoPath,
			modelSize: selectedModel.value,
			language: language.value,
			useMirror: useMirror.value,
			projectId: currentVideoProjectId.value,
		})

		for await (const chunk of generator) {
			if (chunk.type === 'phase') {
				progress.value = {
					phase: chunk.phase || 'recognizing',
					percent: chunk.percent || 0,
					message: chunk.message || '',
					cueCount: 0,
				}
			} else if (chunk.type === 'progress') {
				progress.value.percent = chunk.percent || 0
				progress.value.message = chunk.message || ''
			} else if (chunk.type === 'error') {
				recogError.value = chunk.message || '识别失败'
				progress.value.phase = 'error'
			} else if (chunk.type === 'done') {
				cues.value = chunk.cues || []
				recognizedAudioPath.value = chunk.audioPath || null
				recognizedAudioUrl.value = chunk.audioUrl || null
				progress.value.phase = 'done'
				progress.value.percent = 100
				progress.value.cueCount = cues.value.length
				progress.value.message = `识别完成，共 ${cues.value.length} 条字幕，正在导入时间轴...`
			}
		}

		if (cues.value.length > 0 && !recogError.value) {
			await new Promise(resolve => setTimeout(resolve, 300))
			await importCues()
			emit('close')
		}
	} catch (err: any) {
		recogError.value = err.message || String(err)
		progress.value.phase = 'error'
	} finally {
		recognizing.value = false
		startingRecog.value = false
	}
}

function resetRecog() {
	recognizing.value = false
	progress.value = { phase: 'idle', percent: 0, message: '', cueCount: 0 }
	cues.value = []
	recogError.value = ''
	recognizedAudioPath.value = null
	recognizedAudioUrl.value = null
}

function computeAudioPeaks(audioBuffer: AudioBuffer, pointsPerSecond: number) {
	const durationSec = Math.max(0, Number(audioBuffer.duration) || 0)
	const pps = Math.max(1, Math.floor(Number(pointsPerSecond) || 1))
	const pointCount = Math.max(1, Math.ceil(durationSec * pps))
	const channels = Math.max(1, audioBuffer.numberOfChannels)
	const channelData: Float32Array[] = []
	for (let ch = 0; ch < channels; ch++) {
		channelData.push(audioBuffer.getChannelData(ch))
	}

	const totalSamples = audioBuffer.length
	const samplesPerPoint = Math.max(1, Math.floor(totalSamples / pointCount))
	const peaks = new Array<number>(pointCount).fill(0)

	let maxPeak = 0
	for (let p = 0; p < pointCount; p++) {
		const start = p * samplesPerPoint
		const end = Math.min(totalSamples, start + samplesPerPoint)
		let peak = 0
		for (let i = start; i < end; i++) {
			let v = 0
			for (let ch = 0; ch < channels; ch++) v += Math.abs(channelData[ch][i] || 0)
			v /= channels
			if (v > peak) peak = v
		}
		peaks[p] = peak
		if (peak > maxPeak) maxPeak = peak
	}

	if (maxPeak > 0) {
		for (let i = 0; i < peaks.length; i++) peaks[i] = peaks[i] / maxPeak
	}
	return { durationSec, peaks }
}

async function importExtractedAudio() {
	const audioUrl = recognizedAudioUrl.value
	const tempAudioPath = recognizedAudioPath.value
	console.log('[SubtitleRecog] importExtractedAudio called, audioUrl:', audioUrl, 'tempAudioPath:', tempAudioPath)

	if (!audioUrl && !tempAudioPath) {
		console.warn('[SubtitleRecog] no audio URL or path to import')
		return false
	}

	let fetchUrl = audioUrl
	let fileName = 'subtitle_extracted_audio.wav'

	if (!fetchUrl && tempAudioPath) {
		console.log('[SubtitleRecog] audioUrl not available, falling back to readAudioFile IPC...')
		try {
			const result = await dweb.subtitleRecog.readAudioFile({ path: tempAudioPath })
			console.log('[SubtitleRecog] readAudioFile result:', result)
			if (!result || !result.url) {
				console.error('[SubtitleRecog] failed to get audio URL from IPC')
				window.alert('音频导入失败：无法获取音频文件访问地址')
				return false
			}
			fetchUrl = result.url
			fileName = result.fileName || fileName
		} catch (ipcErr) {
			console.error('[SubtitleRecog] readAudioFile IPC failed:', ipcErr)
			window.alert('音频导入失败：' + (ipcErr instanceof Error ? ipcErr.message : String(ipcErr)))
			return false
		}
	}

	try {
		console.log('[SubtitleRecog] step 1: fetching audio via dweb protocol...', fetchUrl)
		const response = await fetch(fetchUrl!)
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`)
		}
		const arrayBuffer = await response.arrayBuffer()
		console.log('[SubtitleRecog] step 1 done: fetched', arrayBuffer.byteLength, 'bytes')

		const uint8Array = new Uint8Array(arrayBuffer)
		const blob = new Blob([uint8Array], { type: 'audio/wav' })
		const file = new File([blob], fileName, { type: 'audio/wav' })

		console.log('[SubtitleRecog] step 2: decoding audio with WebAudio...')
		const AudioContextCtor: typeof AudioContext | undefined =
			window.AudioContext ||
			(window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
		if (!AudioContextCtor) {
			console.error('[SubtitleRecog] WebAudio not supported')
			window.alert('音频导入失败：当前浏览器不支持 WebAudio')
			return false
		}

		const ac: AudioContext = new AudioContextCtor()
		let audioBuffer: AudioBuffer
		try {
			audioBuffer = await ac.decodeAudioData(arrayBuffer.slice(0))
		} finally {
			try { await ac.close() } catch {}
		}
		console.log('[SubtitleRecog] step 2 done: audio decoded, duration:', audioBuffer.duration, 's')

		const durationSec = Math.max(0, Number(audioBuffer.duration) || 0)
		if (!(durationSec > 0)) {
			console.error('[SubtitleRecog] audio duration invalid')
			window.alert('音频导入失败：音频时长无效')
			return false
		}

		console.log('[SubtitleRecog] step 3: computing waveform peaks...')
		const fps = Math.max(1, Math.floor(Number(TimelineStore.state.fps) || 60))
		const maxPoints = 600000
		let pointsPerSecond = fps
		if (Math.ceil(durationSec * pointsPerSecond) > maxPoints) {
			pointsPerSecond = Math.max(10, Math.floor(maxPoints / durationSec))
		}

		const { peaks } = computeAudioPeaks(audioBuffer, pointsPerSecond)
		const objectUrl = URL.createObjectURL(blob)
		console.log('[SubtitleRecog] step 3 done: peaks generated, count:', peaks.length)

		const needFrames = Math.ceil(durationSec * fps) + 1
		if (needFrames > TimelineStore.state.frameCount) {
			console.log('[SubtitleRecog] step 4: extending frame count to', needFrames)
			await TimelineStore.dispatch('setFrameCount', { frameCount: needFrames })
		}

		const videoName = currentVideoName.value || 'video'
		const baseName = String(videoName || '').replace(/\.[^./\\]+$/, '') || 'extracted_audio'
		const audioLayerName = baseName + '_音频'
		console.log('[SubtitleRecog] step 5: adding audio layer:', audioLayerName)
		await TimelineStore.dispatch('addAudioLayer', { name: audioLayerName })
		const layer = TimelineStore.state.layers[TimelineStore.state.layers.length - 1]
		if (!layer) {
			console.error('[SubtitleRecog] failed to get newly created audio layer')
			window.alert('音频导入失败：无法创建音频图层')
			return false
		}
		console.log('[SubtitleRecog] step 5 done: audio layer created, id:', layer.id, 'name:', layer.name)

		console.log('[SubtitleRecog] step 6: setting audio track...')
		await TimelineStore.dispatch('setAudioTrack', {
			layerId: layer.id,
			track: {
				objectUrl,
				fileName: file.name,
				durationSec,
				pointsPerSecond,
				peaks
			}
		})
		console.log('[SubtitleRecog] step 6 done: audio track set')

		console.log('[SubtitleRecog] audio imported successfully! Layer:', layer.id, 'Name:', layer.name)

		if (tempAudioPath) {
			try {
				await dweb.subtitleRecog.cleanupAudioFile({ path: tempAudioPath })
				console.log('[SubtitleRecog] temp audio file cleaned up')
			} catch (cleanupErr) {
				console.warn('[SubtitleRecog] failed to cleanup temp audio file:', cleanupErr)
			}
		}
		recognizedAudioPath.value = null
		recognizedAudioUrl.value = null

		return true
	} catch (err) {
		console.error('[SubtitleRecog] import audio FAILED:', err)
		window.alert('音频导入失败：' + (err instanceof Error ? err.message : String(err)))
		return false
	}
}

function formatTime(seconds: number): string {
	const h = Math.floor(seconds / 3600)
	const m = Math.floor((seconds % 3600) / 60)
	const s = Math.floor(seconds % 60)
	const ms = Math.floor((seconds % 1) * 1000)
	return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
}

function buildTextNodeName(baseName: string, index: number, total: number): string {
	if (total <= 1) return baseName
	return `${baseName} ${index + 1}`
}

async function importCues() {
	const recogCues = cues.value
	if (!recogCues || !recogCues.length) return

	try {
		await importExtractedAudio()

		const cuesList: SubtitleCue[] = convertRecognitionCuesToSubtitleCues(recogCues)

		const importFps = Math.max(1, Math.floor(Number(TimelineStore.state.fps ?? 30) || 30))
		const spans: TimelineFrameSpan[] = []
		const cueRanges: SubtitleCueRange[] = []
		let maxEnd = 0
		for (const c of cuesList) {
			const r = msToFrameRangeInclusive(c.startMs, c.endMs, importFps)
			spans.push({ start: r.startFrame, end: r.endFrame })
			cueRanges.push({ startFrame: r.startFrame, endFrame: r.endFrame })
			maxEnd = Math.max(maxEnd, r.endFrame)
		}

		const needFrameCount = Math.max(TimelineStore.state.frameCount, maxEnd + 1)
		if (needFrameCount !== TimelineStore.state.frameCount) {
			await TimelineStore.dispatch('setFrameCount', { frameCount: needFrameCount })
		}

		const prevActiveLayerId = (VideoSceneStore.state as any).activeLayerId
		const prevSelectedNodeIds = [...((VideoSceneStore.state as any).selectedNodeIds ?? [])]
		const prevFocusedNodeId = (VideoSceneStore.state as any).focusedNodeId

		await TimelineStore.dispatch('addSubtitleLayer')
		const layer = TimelineStore.state.layers[TimelineStore.state.layers.length - 1]
		if (!layer) return
		await TimelineStore.dispatch('setSubtitleTrack', {
			layerId: layer.id,
			cues: cuesList,
			cueRanges,
			spans,
			fps: importFps
		})

		await VideoSceneStore.dispatch('addLayer', { layerId: layer.id, name: layer.name })

		await VideoSceneStore.dispatch('setActiveLayer', { layerId: layer.id })
		await VideoSceneStore.dispatch('addRenderableNode', { layerId: layer.id, type: 'text' })
		const subtitleNodeId = (VideoSceneStore.state as any).selectedNodeId
		if (subtitleNodeId) {
			await TimelineStore.dispatch('setSubtitleTextNodeId', {
				layerId: layer.id,
				nodeId: subtitleNodeId
			})

			const stageW = Math.max(1, Number(studioStore.state.stage?.width ?? 1920))
			const stageH = Math.max(1, Number(studioStore.state.stage?.height ?? 1080))
			const boxW = Math.max(240, Math.floor(stageW * 0.9))
			const boxH = Math.max(80, Math.floor(stageH * 0.18))
			const boxY = stageH / 2 - boxH / 2 - 24

			const rawDefaultStyle: SubtitleTextStyle = (TimelineStore.state as any).subtitleDefaultStyleByLayer?.[
				layer.id
			] ?? { fontSize: 36, fontColor: '#ffffff', fontStyle: 'normal', textAlign: 'center' }
			const defaultStyle: SubtitleTextStyle = {
				...rawDefaultStyle,
				fontSize: Math.max(6, Number(rawDefaultStyle.fontSize ?? 36) || 36)
			}

			const nodeTransform = {
				x: 0,
				y: boxY,
				scaleX: 1,
				scaleY: 1,
				scale: 1,
				pivotX: 0.5,
				pivotY: 0.5,
				width: boxW,
				height: boxH,
				rotation: 0,
				opacity: 1
			}

			await VideoSceneStore.dispatch('updateNodeTransform', {
				layerId: layer.id,
				nodeId: subtitleNodeId,
				patch: nodeTransform
			})
			await VideoSceneStore.dispatch('updateNodeProps', {
				layerId: layer.id,
				nodeId: subtitleNodeId,
				patch: {
					__dvsSubtitleTextNode: true,
					textContent: '',
					fontSize: defaultStyle.fontSize,
					fontColor: defaultStyle.fontColor,
					fontStyle: defaultStyle.fontStyle,
					textAlign: defaultStyle.textAlign
				}
			})

			const gen = buildSubtitleGeneratedKeyframes({
				layerId: layer.id,
				nodeId: subtitleNodeId,
				cues: cuesList,
				cueRanges,
				defaultStyle,
				overridesByCueIndex: (TimelineStore.state as any).subtitleOverrideStyleByLayer?.[layer.id] ?? {},
				nodeTransform
			})
			await TimelineStore.dispatch('setSubtitleGeneratedKeyframes', {
				layerId: layer.id,
				frames: gen.frames,
				nodeKeyframesByFrame: gen.nodeKeyframesByFrame
			})
		}

		if (prevActiveLayerId && prevActiveLayerId !== layer.id)
			await VideoSceneStore.dispatch('setActiveLayer', { layerId: prevActiveLayerId })
		if (prevSelectedNodeIds.length)
			await VideoSceneStore.dispatch('setSelectedNodes', { nodeIds: prevSelectedNodeIds })
		else await VideoSceneStore.dispatch('setSelectedNode', { nodeId: null })
		await VideoSceneStore.dispatch('setFocusedNode', { nodeId: prevFocusedNodeId ?? null })

		emit('close')
	} catch (err) {
		console.error('[SubtitleRecog] import cues failed', err)
		window.alert('导入字幕失败：' + (err instanceof Error ? err.message : String(err)))
	}
}

watch(() => props.open, (v) => {
	if (v) {
		checkEnv()
		loadAvailableModels()
		resetRecog()
	}
})

onMounted(() => {
	if (props.open) {
		checkEnv()
		loadAvailableModels()
	}
})
</script>

<style scoped>
.dvs-subtitle-overlay {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.5);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 1000;
}

.dvs-subtitle-dialog {
	background: var(--pl-bg-0, #1e1e1e);
	border: 1px solid var(--pl-border, #3c3c3c);
	border-radius: 8px;
	width: 640px;
	max-width: 90vw;
	max-height: 80vh;
	display: flex;
	flex-direction: column;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.dvs-subtitle-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16px 20px;
	border-bottom: 1px solid var(--pl-border, #3c3c3c);
}

.dvs-subtitle-title {
	font-size: 16px;
	font-weight: 600;
	color: var(--pl-fg, #ffffff);
}

.dvs-subtitle-close {
	width: 28px;
	height: 28px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 20px;
	padding: 0;
	background: transparent;
	border: none;
	color: var(--pl-fg-muted, #999);
	cursor: pointer;
	border-radius: 4px;
}

.dvs-subtitle-close:hover {
	background: var(--pl-bg-2, #3c3c3c);
	color: var(--pl-fg, #fff);
}

.dvs-subtitle-body {
	flex: 1;
	overflow-y: auto;
	padding: 20px;
	min-height: 200px;
}

.dvs-subtitle-foot {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	padding: 12px 20px;
	border-top: 1px solid var(--pl-border, #3c3c3c);
}

.setup-section {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.setup-title {
	font-size: 14px;
	font-weight: 600;
	color: var(--pl-fg, #fff);
}

.setup-desc {
	font-size: 12px;
	color: var(--pl-fg-muted, #999);
	margin-bottom: 8px;
}

.env-status-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.env-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	background: var(--pl-bg-1, #252525);
	border-radius: 4px;
	font-size: 12px;
}

.env-item.ok .env-icon { color: #5ec47f; }
.env-item.error .env-icon { color: #f0ad4e; }

.env-name {
	font-weight: 500;
	min-width: 80px;
}

.env-detail {
	color: var(--pl-fg-muted, #999);
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.setup-error {
	padding: 8px 12px;
	background: rgba(240, 173, 78, 0.1);
	border: 1px solid rgba(240, 173, 78, 0.3);
	border-radius: 4px;
	color: #f0ad4e;
	font-size: 12px;
}

.install-card {
	padding: 16px;
	background: var(--pl-bg-1, #252525);
	border-radius: 6px;
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.install-title {
	font-size: 13px;
	font-weight: 600;
	color: var(--pl-fg, #fff);
}

.install-desc {
	font-size: 12px;
	color: var(--pl-fg-muted, #999);
}

.install-actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.mirror-label {
	display: flex;
	align-items: center;
	gap: 4px;
	font-size: 12px;
	color: var(--pl-fg-muted, #999);
	cursor: pointer;
}

.download-progress {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.progress-bar {
	height: 6px;
	background: var(--pl-bg-2, #3c3c3c);
	border-radius: 3px;
	overflow: hidden;
}

.progress-fill {
	height: 100%;
	background: var(--pl-accent, #3c94ff);
	border-radius: 3px;
	transition: width 0.2s ease;
}

.progress-fill.indeterminate {
	background: linear-gradient(90deg, rgba(60,148,255,0.3) 0%, var(--pl-accent, #3c94ff) 50%, rgba(60,148,255,0.3) 100%);
	background-size: 200% 100%;
	animation: indeterminate 1.5s ease-in-out infinite;
}

@keyframes indeterminate {
	0% { background-position: 200% 0; }
	100% { background-position: -200% 0; }
}

.progress-text {
	font-size: 11px;
	color: var(--pl-fg-muted, #999);
}

.setup-hint {
	margin-top: 6px;
	font-size: 11px;
	color: var(--pl-warning, #f5a623);
}

.model-select {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.model-option {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 10px;
	padding: 12px 14px;
	background: rgba(255, 255, 255, 0.05);
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 4px;
	cursor: pointer;
	font-size: 13px;
	color: #e0e0e0;
	transition: all 0.15s ease;
}

.model-option:hover {
	background: rgba(255, 255, 255, 0.08);
	border-color: rgba(60, 148, 255, 0.3);
}

.model-option.selected {
	border-color: #3c94ff;
	background: rgba(60, 148, 255, 0.15);
}

.model-option input[type="radio"] {
	margin: 0;
	width: 16px;
	height: 16px;
	accent-color: #3c94ff;
	flex-shrink: 0;
}

.model-name {
	font-weight: 600;
	color: #ffffff;
	font-size: 13px;
	min-width: 60px;
}

.model-size {
	color: #888;
	font-size: 12px;
}

.model-desc {
	flex-basis: 100%;
	color: #999;
	font-size: 11px;
	margin-left: 26px;
	line-height: 1.4;
}

.recog-config {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.config-row {
	display: flex;
	align-items: center;
	gap: 12px;
}

.config-label {
	font-size: 12px;
	color: var(--pl-fg-muted, #999);
	min-width: 80px;
}

.no-video-hint {
	padding: 20px;
	text-align: center;
	color: #f0ad4e;
	background: rgba(240, 173, 78, 0.1);
	border-radius: 4px;
	font-size: 12px;
}

.video-info {
	padding: 12px;
	background: var(--pl-bg-1, #252525);
	border-radius: 4px;
}

.video-name {
	font-size: 13px;
	color: var(--pl-fg, #fff);
}

.recog-progress {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 16px 0;
}

.progress-phase {
	font-size: 13px;
	font-weight: 500;
	color: var(--pl-fg, #fff);
}

.recog-error {
	padding: 12px;
	background: rgba(255, 77, 79, 0.1);
	border: 1px solid rgba(255, 77, 79, 0.3);
	border-radius: 4px;
	color: #ff4d4f;
	font-size: 12px;
	margin-top: 12px;
}

.recog-result {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.result-header {
	font-size: 13px;
	font-weight: 500;
	color: var(--pl-fg, #fff);
}

.result-list {
	max-height: 240px;
	overflow-y: auto;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.result-item {
	display: flex;
	gap: 8px;
	padding: 8px 12px;
	background: var(--pl-bg-1, #252525);
	border-radius: 4px;
	font-size: 12px;
}

.cue-time {
	color: var(--pl-accent, #3c94ff);
	font-family: monospace;
	flex-shrink: 0;
}

.cue-text {
	color: var(--pl-fg, #fff);
	flex: 1;
}

.vs-btn {
	appearance: none;
	border: 1px solid var(--pl-border, #3c3c3c);
	background: var(--pl-bg-2, #3c3c3c);
	color: var(--pl-fg, #fff);
	padding: 6px 16px;
	border-radius: 4px;
	font-size: 12px;
	cursor: pointer;
}

.vs-btn:hover {
	background: var(--pl-bg-1, #4a4a4a);
}

.vs-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.vs-btn.primary {
	background: var(--pl-accent, #3c94ff);
	border-color: var(--pl-accent, #3c94ff);
	color: #fff;
}

.vs-btn.primary:hover {
	background: #5aa4ff;
}

.vs-select {
	background: rgba(255, 255, 255, 0.08);
	border: 1px solid rgba(255, 255, 255, 0.15);
	color: #ffffff;
	padding: 8px 12px;
	border-radius: 4px;
	font-size: 13px;
	min-width: 180px;
	cursor: pointer;
	outline: none;
}

.vs-select:hover {
	border-color: rgba(255, 255, 255, 0.25);
}

.vs-select:focus {
	border-color: #3c94ff;
}

.vs-select option {
	background: #2a2a2a;
	color: #ffffff;
	padding: 8px;
	font-size: 13px;
}

.vs-select:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}
</style>
