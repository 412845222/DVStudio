import { ref, computed } from 'vue'
import type {
	SubtitleRecogCue,
	SubtitleRecogModelSize,
	SubtitleRecogProgressChunk,
	SubtitleRecogEnvStatus
} from '../types/electron-bridge'

const dweb = (window as any).dweb

export type RecognitionPhase =
	| 'idle'
	| 'checking'
	| 'extracting-audio'
	| 'recognizing'
	| 'parsing'
	| 'done'
	| 'error'

export interface RecognitionProgress {
	phase: RecognitionPhase
	percent: number
	message: string
	cueCount: number
}

export function useSubtitleRecognition() {
	const envReady = ref(false)
	const checkingEnv = ref(false)
	const envStatus = ref<SubtitleRecogEnvStatus | null>(null)

	const recognizing = ref(false)
	const progress = ref<RecognitionProgress>({
		phase: 'idle',
		percent: 0,
		message: '',
		cueCount: 0
	})
	const cues = ref<SubtitleRecogCue[]>([])
	const error = ref('')
	const selectedModel = ref<SubtitleRecogModelSize>('base')
	const language = ref('auto')
	const useMirror = ref(true)

	const hasResult = computed(() => cues.value.length > 0)

	async function checkEnv() {
		checkingEnv.value = true
		error.value = ''
		try {
			const status = await dweb.subtitleRecog.checkEnv()
			envStatus.value = status
			envReady.value = status.ok
			if (status.defaultModel) {
				selectedModel.value = status.defaultModel
			}
			return status
		} finally {
			checkingEnv.value = false
		}
	}

	function reset() {
		recognizing.value = false
		progress.value = {
			phase: 'idle',
			percent: 0,
			message: '',
			cueCount: 0
		}
		cues.value = []
		error.value = ''
	}

	async function* recognizeVideo(
		videoPath: string
	): AsyncGenerator<SubtitleRecogProgressChunk, SubtitleRecogCue[] | null, void> {
		if (!envReady.value) {
			await checkEnv()
			if (!envReady.value) {
				error.value = '环境未配置，请先完成环境配置'
				return null
			}
		}

		recognizing.value = true
		error.value = ''
		cues.value = []
		progress.value = {
			phase: 'checking',
			percent: 0,
			message: '准备识别...',
			cueCount: 0
		}

		try {
			const generator = dweb.subtitleRecog.recognize({
				videoPath,
				modelSize: selectedModel.value,
				language: language.value,
				useMirror: useMirror.value
			})

			for await (const chunk of generator) {
				if (chunk.type === 'phase') {
					progress.value = {
						phase: (chunk.phase as RecognitionPhase) || 'recognizing',
						percent: chunk.percent || 0,
						message: chunk.message || '',
						cueCount: 0
					}
				} else if (chunk.type === 'progress') {
					progress.value.percent = chunk.percent || 0
					progress.value.message = chunk.message || ''
				} else if (chunk.type === 'error') {
					error.value = chunk.message || '识别失败'
					progress.value.phase = 'error'
				} else if (chunk.type === 'done') {
					cues.value = chunk.cues || []
					progress.value.phase = 'done'
					progress.value.percent = 100
					progress.value.cueCount = cues.value.length
					progress.value.message = `识别完成，共 ${cues.value.length} 条字幕`
				}
				yield chunk
			}

			return cues.value
		} catch (err: any) {
			error.value = err.message || String(err)
			progress.value.phase = 'error'
			throw err
		} finally {
			recognizing.value = false
		}
	}

	function formatTime(seconds: number): string {
		const h = Math.floor(seconds / 3600)
		const m = Math.floor((seconds % 3600) / 60)
		const s = Math.floor(seconds % 60)
		const ms = Math.floor((seconds % 1) * 1000)
		return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
	}

	function cuesToSrt(): string {
		return cues.value
			.map((cue, i) => {
				return `${i + 1}\n${formatTime(cue.startTime)} --> ${formatTime(cue.endTime)}\n${cue.text}\n`
			})
			.join('\n')
	}

	return {
		envReady,
		checkingEnv,
		envStatus,
		recognizing,
		progress,
		cues,
		error,
		selectedModel,
		language,
		useMirror,
		hasResult,
		checkEnv,
		reset,
		recognizeVideo,
		formatTime,
		cuesToSrt
	}
}
