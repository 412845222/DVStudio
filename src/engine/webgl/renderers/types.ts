import type { VideoSceneNodeTransform, VideoSceneUserNodeType } from '../../../core/scene'

export type RenderNode = {
	layerId: string
	id: string
	type: VideoSceneUserNodeType
	transform: VideoSceneNodeTransform
	props?: Record<string, unknown>
	text?: string
	fontSize?: number
	imageSrc?: string
}

export type RenderContext = {
	opacity: number
	rotation: number
}

export type LocalTargetSize = {
	w: number
	h: number
	contentW: number
	contentH: number
	/**
	 * Local render scale factor.
	 * When > 1, 1 world unit maps to `scale` pixels in the offscreen target.
	 */
	scale?: number
}
