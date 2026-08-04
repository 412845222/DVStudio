import { ref, computed } from 'vue'
import type {
	SubtitleRecogEnvStatus,
	SubtitleRecogBinaryConfig,
	SubtitleRecogModelInfo,
	SubtitleRecogModelDownloadConfig,
	SubtitleRecogInstalledModel,
	SubtitleRecogProgressChunk,
	SubtitleRecogModelSize
} from '../types/electron-bridge'

const dweb = (window as any).dweb

export type SetupStepId = 'overview' | 'ffmpeg' | 'binary' | 'model' | 'verify' | 'done'
export type SetupStepStatus = 'pending' | 'in-progress' | 'completed' | 'error' | 'skipped'

export interface SetupStep {
	id: SetupStepId
	title: string
	description: string
	status: SetupStepStatus
	error?: string
}

export function useSubtitleRecogSetup() {
	const checking = ref(false)
	const envStatus = ref<SubtitleRecogEnvStatus | null>(null)

	const binaryConfig = ref<SubtitleRecogBinaryConfig | null>(null)
	const downloadingBinary = ref(false)
	const binaryDownloadProgress = ref(0)
	const binaryDownloadMessage = ref('')
	const binaryDownloadError = ref('')

	const availableModels = ref<SubtitleRecogModelInfo[]>([])
	const selectedModelSize = ref<SubtitleRecogModelSize>('base')
	const modelConfig = ref<SubtitleRecogModelDownloadConfig | null>(null)
	const downloadingModel = ref(false)
	const modelDownloadProgress = ref(0)
	const modelDownloadMessage = ref('')
	const modelDownloadError = ref('')

	const useMirror = ref(true)

	const steps = ref<SetupStep[]>([
		{ id: 'overview', title: '环境总览', description: '检查字幕识别所需环境', status: 'pending' },
		{ id: 'ffmpeg', title: '安装 FFmpeg', description: 'FFmpeg 用于音频提取', status: 'pending' },
		{
			id: 'binary',
			title: '安装 Whisper 引擎',
			description: '下载 Whisper.cpp 二进制',
			status: 'pending'
		},
		{ id: 'model', title: '下载识别模型', description: '下载 Whisper 语言模型', status: 'pending' },
		{ id: 'verify', title: '验证环境', description: '验证所有组件正常工作', status: 'pending' },
		{ id: 'done', title: '完成', description: '环境配置完成', status: 'pending' }
	])

	const currentStepIndex = ref(0)
	const currentStep = computed(() => steps.value[currentStepIndex.value])

	const isReady = computed(() => envStatus.value?.ok === true)

	async function checkEnv() {
		checking.value = true
		try {
			envStatus.value = await dweb.subtitleRecog.checkEnv()
			updateStepsBasedOnEnv()
			return envStatus.value
		} finally {
			checking.value = false
		}
	}

	function updateStepsBasedOnEnv() {
		if (!envStatus.value) return

		const { ffmpeg, binary, defaultModel } = envStatus.value

		steps.value[0].status = 'completed'

		if (ffmpeg.ok) {
			steps.value[1].status = 'completed'
		} else {
			steps.value[1].status = 'pending'
			steps.value[1].error = ffmpeg.detail
		}

		if (binary.ok) {
			steps.value[2].status = 'completed'
		} else {
			steps.value[2].status = ffmpeg.ok ? 'pending' : 'pending'
		}

		if (defaultModel) {
			steps.value[3].status = 'completed'
		} else {
			steps.value[3].status = binary.ok ? 'pending' : 'pending'
		}

		if (ffmpeg.ok && binary.ok && defaultModel) {
			steps.value[4].status = 'completed'
			steps.value[5].status = 'completed'
			currentStepIndex.value = 5
		} else if (!ffmpeg.ok) {
			currentStepIndex.value = 1
		} else if (!binary.ok) {
			currentStepIndex.value = 2
		} else if (!defaultModel) {
			currentStepIndex.value = 3
		}
	}

	async function loadBinaryConfig() {
		binaryConfig.value = await dweb.subtitleRecog.getBinaryConfig({ useMirror: useMirror.value })
		return binaryConfig.value
	}

	async function* downloadBinary(): AsyncGenerator<SubtitleRecogProgressChunk, void, void> {
		if (!binaryConfig.value) {
			await loadBinaryConfig()
		}

		downloadingBinary.value = true
		binaryDownloadProgress.value = 0
		binaryDownloadMessage.value = ''
		binaryDownloadError.value = ''

		try {
			const generator = dweb.subtitleRecog.downloadBinary({ useMirror: useMirror.value })
			for await (const chunk of generator) {
				if (chunk.type === 'progress') {
					binaryDownloadProgress.value = chunk.percent || 0
					binaryDownloadMessage.value = chunk.message || ''
				} else if (chunk.type === 'error') {
					binaryDownloadError.value = chunk.message || 'Download failed'
				} else if (chunk.type === 'done') {
					binaryDownloadProgress.value = 100
					binaryDownloadMessage.value = '安装完成'
				}
				yield chunk
			}
		} catch (err: any) {
			binaryDownloadError.value = err.message || String(err)
			throw err
		} finally {
			downloadingBinary.value = false
		}
	}

	async function loadAvailableModels() {
		availableModels.value = await dweb.subtitleRecog.getAvailableModels()
		return availableModels.value
	}

	async function loadModelConfig(size?: SubtitleRecogModelSize) {
		const modelSize = size || selectedModelSize.value
		modelConfig.value = await dweb.subtitleRecog.getModelConfig({
			size: modelSize,
			useMirror: useMirror.value
		})
		return modelConfig.value
	}

	async function* downloadModel(
		size?: SubtitleRecogModelSize
	): AsyncGenerator<SubtitleRecogProgressChunk, void, void> {
		const modelSize = size || selectedModelSize.value
		if (!modelConfig.value || modelConfig.value.size !== modelSize) {
			await loadModelConfig(modelSize)
		}

		downloadingModel.value = true
		modelDownloadProgress.value = 0
		modelDownloadMessage.value = ''
		modelDownloadError.value = ''

		try {
			const generator = dweb.subtitleRecog.downloadModel({
				size: modelSize,
				useMirror: useMirror.value
			})
			for await (const chunk of generator) {
				if (chunk.type === 'progress') {
					modelDownloadProgress.value = chunk.percent || 0
					modelDownloadMessage.value = chunk.message || ''
				} else if (chunk.type === 'error') {
					modelDownloadError.value = chunk.message || 'Download failed'
				} else if (chunk.type === 'done') {
					modelDownloadProgress.value = 100
					modelDownloadMessage.value = '下载完成'
				}
				yield chunk
			}
		} catch (err: any) {
			modelDownloadError.value = err.message || String(err)
			throw err
		} finally {
			downloadingModel.value = false
		}
	}

	async function verify() {
		steps.value[4].status = 'in-progress'
		await checkEnv()
		if (envStatus.value?.ok) {
			steps.value[4].status = 'completed'
			steps.value[5].status = 'completed'
			currentStepIndex.value = 5
		} else {
			steps.value[4].status = 'error'
			steps.value[4].error = '环境验证失败，请检查各组件安装状态'
		}
		return envStatus.value
	}

	function goToStep(stepId: SetupStepId) {
		const index = steps.value.findIndex((s) => s.id === stepId)
		if (index >= 0) {
			currentStepIndex.value = index
		}
	}

	function nextStep() {
		if (currentStepIndex.value < steps.value.length - 1) {
			currentStepIndex.value++
		}
	}

	function prevStep() {
		if (currentStepIndex.value > 0) {
			currentStepIndex.value--
		}
	}

	async function openFfmpegInstallGuide() {
		await dweb.common.openExternalUrl({ url: 'https://ffmpeg.org/download.html' })
	}

	async function runBootstrapInstaller() {
		try {
			await dweb.common.runBootstrapInstaller()
		} catch (err) {
			console.error('Failed to run bootstrap installer:', err)
		}
	}

	return {
		checking,
		envStatus,
		binaryConfig,
		downloadingBinary,
		binaryDownloadProgress,
		binaryDownloadMessage,
		binaryDownloadError,
		availableModels,
		selectedModelSize,
		modelConfig,
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
		goToStep,
		nextStep,
		prevStep,
		openFfmpegInstallGuide,
		runBootstrapInstaller
	}
}
