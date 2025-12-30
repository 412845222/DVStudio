import type { VideoSceneLayer, VideoSceneNodeProps, VideoSceneNodeTransform } from '../scene'

export type TimelineLayer = { id: string; name: string }

export type TimelineCellKey = string // `${layerId}:${frameIndex}`

export type TimelineEasingCurve = { x1: number; y1: number; x2: number; y2: number; preset?: string }

export type TimelineFrameSpan = number | { start: number; end: number } // inclusive

export type TimelineState = {
	frameCount: number
	currentFrame: number
	frameWidth: number
	layers: TimelineLayer[]
	selectedLayerIds: string[]
	selectedSpansByLayer: Record<string, TimelineFrameSpan[]>
	selectionVersion: number
	lastSelectedCellKey: TimelineCellKey | null

	keyframeSpansByLayer: Record<string, TimelineFrameSpan[]>
	keyframeVersion: number

	easingSegmentKeys: string[]
	easingCurves: Record<string, TimelineEasingCurve>

	nodeKeyframesByLayer: Record<
		string,
		Record<string, Record<string, { transform?: VideoSceneNodeTransform; props?: VideoSceneNodeProps }>>
	>
	nodeKeyframeVersion: number

	stageKeyframesByFrame: Record<string, { layers: VideoSceneLayer[] }>
	stageKeyframeVersion: number
}
