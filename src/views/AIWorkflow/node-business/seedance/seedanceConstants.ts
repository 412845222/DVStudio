export const SEEDANCE_MODELS = {
	SD10T2V: 'Seedance-T2V',
	SD20T2V: 'Seedance-T2V-2.0',
	SD20T2V2X: 'Seedance-T2V-2.0-2x',
	SD20I2V: 'Seedance-I2V-2.0',
	SD20V2V: 'Seedance-V2V-2.0',
	SD20T2VAUDIO: 'Seedance-T2V-Audio-2.0'
} as const

export const SEEDANCE_MODEL_LIST: { value: string; label: string }[] = [
	{ value: SEEDANCE_MODELS.SD10T2V, label: 'Seedance 1.0' },
	{ value: SEEDANCE_MODELS.SD20T2V, label: 'Seedance 2.0' },
	{ value: SEEDANCE_MODELS.SD20T2V2X, label: 'Seedance 2.0 2x' },
	{ value: SEEDANCE_MODELS.SD20I2V, label: 'Seedance 2.0 I2V' },
	{ value: SEEDANCE_MODELS.SD20V2V, label: 'Seedance 2.0 V2V' },
	{ value: SEEDANCE_MODELS.SD20T2VAUDIO, label: 'Seedance 2.0 Audio' }
]

export const SEEDANCE_20_MODELS = [
	SEEDANCE_MODELS.SD20T2V,
	SEEDANCE_MODELS.SD20T2V2X,
	SEEDANCE_MODELS.SD20I2V,
	SEEDANCE_MODELS.SD20V2V,
	SEEDANCE_MODELS.SD20T2VAUDIO
]

export const SEEDANCE_VIDEO_EDIT_MODELS = [SEEDANCE_MODELS.SD20V2V]

export const SEEDANCE_AUDIO_MODELS = [SEEDANCE_MODELS.SD20T2VAUDIO]

export const SEEDANCE_RATIOS = [
	{ value: '9:16', label: '9:16 (竖屏)' },
	{ value: '16:9', label: '16:9 (横屏)' },
	{ value: '1:1', label: '1:1 (正方形)' },
	{ value: '4:3', label: '4:3' },
	{ value: '3:4', label: '3:4' }
]

export const SEEDANCE_RESOLUTIONS = [
	{ value: '480p', label: '480p', width: 854, height: 480 },
	{ value: '720p', label: '720p', width: 1280, height: 720 },
	{ value: '1080p', label: '1080p', width: 1920, height: 1080 }
]

export const SEEDANCE_DURATIONS = [3, 5, 10, 15, 20, 30]

export const SEEDANCE_REF_MODES = [
	{ value: 'reference', label: '多模态参考' },
	{ value: 'video_edit', label: '视频编辑' }
]

export const SEEDANCE_STATUS_MAP: Record<string, { text: string; color: string }> = {
	pending: { text: '等待中', color: 'var(--vscode-fg-muted)' },
	running: { text: '运行中', color: '#4CAF50' },
	succeeded: { text: '成功', color: '#2196F3' },
	failed: { text: '失败', color: '#f44336' },
	cancelled: { text: '已取消', color: '#9E9E9E' }
}

export const SEEDANCE_MAX_REF_IMAGES = 9
export const SEEDANCE_MAX_REF_VIDEOS = 3
export const SEEDANCE_MAX_REF_AUDIOS = 1

export const isSeedance20Model = (model: string): boolean => {
	return SEEDANCE_20_MODELS.includes(model as (typeof SEEDANCE_20_MODELS)[number])
}

export const isSeedanceVideoEditModel = (model: string): boolean => {
	return SEEDANCE_VIDEO_EDIT_MODELS.includes(model as (typeof SEEDANCE_VIDEO_EDIT_MODELS)[number])
}

export const isSeedanceAudioModel = (model: string): boolean => {
	return SEEDANCE_AUDIO_MODELS.includes(model as (typeof SEEDANCE_AUDIO_MODELS)[number])
}
