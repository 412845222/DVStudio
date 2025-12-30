import type { VideoStudioState } from './types'

export const createDefaultVideoStudioState = (): VideoStudioState => ({
	stage: {
		width: 1920,
		height: 1080,
		background: {
			type: 'color',
			color: '#111111',
			opacity: 1,
			imageSrc: '',
			imageFit: 'contain',
			repeat: false,
		},
		fitRequestedAt: 0,
		viewport: { panX: 0, panY: 0, zoom: 1 },
		showGuides: false,
		snapEnabled: false,
	},
	timeline: {
		frameCount: 120,
		currentFrame: 0,
		frameWidth: 14,
		layers: [],
		selected: { layerId: null, frameIndex: null },
	},
})
