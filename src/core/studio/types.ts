export type VideoStudioStageBackground = {
	type: 'color' | 'image'
	color: string
	opacity: number
	imageSrc: string
	imageFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
	repeat: boolean
}

export type VideoStudioStageViewport = {
	panX: number
	panY: number
	zoom: number
}

export type VideoStudioState = {
	stage: {
		width: number
		height: number
		background: VideoStudioStageBackground
		fitRequestedAt: number
		viewport: VideoStudioStageViewport
		showGuides: boolean
		snapEnabled: boolean
	}
	timeline: {
		frameCount: number
		currentFrame: number
		frameWidth: number
		layers: Array<{ id: string; name: string }>
		selected: { layerId: string | null; frameIndex: number | null }
	}
}
