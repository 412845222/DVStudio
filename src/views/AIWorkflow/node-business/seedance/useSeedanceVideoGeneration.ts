import { ref, computed } from 'vue'
import {
	buildSeedanceContent,
	type SeedanceGenerationRequest,
	type SeedanceTaskDetail
} from './seedanceApi'
import {
	SEEDANCE_MAX_REF_IMAGES,
	SEEDANCE_MAX_REF_VIDEOS,
	SEEDANCE_MAX_REF_AUDIOS,
	isSeedance20Model
} from './seedanceConstants'

export interface SeedanceVideoGenerationConfig {
	model: string
	prompt: string
	ratio: string
	resolution: string
	duration: number
	generateAudio: boolean
	cameraFixed: boolean
	enableWebSearch: boolean
	priority: number
	refMode: 'reference' | 'video_edit' | 'auto'
}

export interface SeedanceReferenceAssets {
	images: string[]
	videos: string[]
	audios: string[]
}

export const useSeedanceVideoGeneration = () => {
	const isGenerating = ref(false)
	const generateError = ref<string | null>(null)
	const lastTaskId = ref<string | null>(null)

	const config = ref<SeedanceVideoGenerationConfig>({
		model: 'Seedance-T2V',
		prompt: '',
		ratio: '16:9',
		resolution: '720p',
		duration: 10,
		generateAudio: false,
		cameraFixed: false,
		enableWebSearch: false,
		priority: 0,
		refMode: 'auto'
	})

	const references = ref<SeedanceReferenceAssets>({
		images: [],
		videos: [],
		audios: []
	})

	const isSeedance20 = computed(() => isSeedance20Model(config.value.model))

	const canUseVideoReference = computed(() => {
		return isSeedance20.value && references.value.videos.length > 0
	})

	const canUseAudioReference = computed(() => {
		return isSeedance20.value && references.value.audios.length > 0
	})

	const hasReferences = computed(() => {
		return (
			references.value.images.length > 0 ||
			references.value.videos.length > 0 ||
			references.value.audios.length > 0
		)
	})

	const effectiveRefMode = computed(() => {
		if (config.value.refMode === 'auto') {
			if (references.value.videos.length > 0 || references.value.images.length > 0) {
				return 'reference'
			}
			return 'auto'
		}
		return config.value.refMode
	})

	const addReferenceImage = (url: string) => {
		if (
			references.value.images.length < SEEDANCE_MAX_REF_IMAGES &&
			!references.value.images.includes(url)
		) {
			references.value.images.push(url)
		}
	}

	const removeReferenceImage = (url: string) => {
		references.value.images = references.value.images.filter((u) => u !== url)
	}

	const addReferenceVideo = (url: string) => {
		if (
			references.value.videos.length < SEEDANCE_MAX_REF_VIDEOS &&
			!references.value.videos.includes(url)
		) {
			references.value.videos.push(url)
		}
	}

	const removeReferenceVideo = (url: string) => {
		references.value.videos = references.value.videos.filter((u) => u !== url)
	}

	const addReferenceAudio = (url: string) => {
		if (
			references.value.audios.length < SEEDANCE_MAX_REF_AUDIOS &&
			!references.value.audios.includes(url)
		) {
			references.value.audios.push(url)
		}
	}

	const removeReferenceAudio = (url: string) => {
		references.value.audios = references.value.audios.filter((u) => u !== url)
	}

	const clearReferences = () => {
		references.value = { images: [], videos: [], audios: [] }
	}

	const buildGenerationRequest = (actionId: string): SeedanceGenerationRequest => {
		const content = buildSeedanceContent(
			config.value.prompt,
			references.value.images,
			references.value.videos,
			references.value.audios
		)

		return {
			actionId,
			model: config.value.model,
			content,
			ratio: config.value.ratio,
			resolution: config.value.resolution,
			duration: config.value.duration,
			generateAudio: config.value.generateAudio,
			cameraFixed: config.value.cameraFixed,
			enableWebSearch: isSeedance20.value ? config.value.enableWebSearch : undefined,
			priority: config.value.priority > 0 ? config.value.priority : undefined
		}
	}

	const generate = async (
		actionId: string,
		apiClient: {
			generateVideo: (
				request: SeedanceGenerationRequest
			) => Promise<{ ok: boolean; error?: string; taskId?: string }>
		}
	): Promise<string | null> => {
		isGenerating.value = true
		generateError.value = null

		try {
			const request = buildGenerationRequest(actionId)
			const response = await apiClient.generateVideo(request)

			if (!response.ok) {
				generateError.value = response.error || '生成失败'
				return null
			}

			lastTaskId.value = response.taskId || null
			return response.taskId || null
		} finally {
			isGenerating.value = false
		}
	}

	const reset = () => {
		config.value = {
			model: 'Seedance-T2V',
			prompt: '',
			ratio: '16:9',
			resolution: '720p',
			duration: 10,
			generateAudio: false,
			cameraFixed: false,
			enableWebSearch: false,
			priority: 0,
			refMode: 'auto'
		}
		references.value = { images: [], videos: [], audios: [] }
		generateError.value = null
		lastTaskId.value = null
	}

	return {
		isGenerating,
		generateError,
		lastTaskId,
		config,
		references,
		isSeedance20,
		canUseVideoReference,
		canUseAudioReference,
		hasReferences,
		effectiveRefMode,
		addReferenceImage,
		removeReferenceImage,
		addReferenceVideo,
		removeReferenceVideo,
		addReferenceAudio,
		removeReferenceAudio,
		clearReferences,
		buildGenerationRequest,
		generate,
		reset
	}
}

export type UseSeedanceVideoGenerationReturn = ReturnType<typeof useSeedanceVideoGeneration>
