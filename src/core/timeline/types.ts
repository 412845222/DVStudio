import type { VideoSceneLayer, VideoSceneNodeProps, VideoSceneNodeTransform } from '../scene'

export type TimelineLayer = { id: string; name: string }

export type TimelineLayerKind = 'normal' | 'subtitle'

export type SubtitleCue = { startMs: number; endMs: number; text: string }

export type SubtitleCueRange = { startFrame: number; endFrame: number }

export type SubtitleTextStyle = {
	fontSize: number
	fontColor: string
	fontStyle: string
	textAlign: 'left' | 'center' | 'right'
}

export type TimelineCellKey = string // `${layerId}:${frameIndex}`

export type TimelineEasingCurve = { x1: number; y1: number; x2: number; y2: number; preset?: string }

export type TimelineFrameSpan = number | { start: number; end: number } // inclusive

export type TimelineState = {
	frameCount: number
	currentFrame: number
	frameWidth: number
	/** UI: 请求时间轴视图跳转并居中到指定帧（由 TimeLine.vue 消费） */
	uiJumpToFrame: number | null
	uiJumpVersion: number
	layers: TimelineLayer[]
	layerKindById: Record<string, TimelineLayerKind>
	selectedLayerIds: string[]
	selectedSpansByLayer: Record<string, TimelineFrameSpan[]>
	selectionVersion: number
	lastSelectedCellKey: TimelineCellKey | null

	subtitleCuesByLayer: Record<string, SubtitleCue[]>
	subtitleCueRangesByLayer: Record<string, SubtitleCueRange[]>
	subtitleSpansByLayer: Record<string, TimelineFrameSpan[]>
	subtitleFpsByLayer: Record<string, number>
	subtitleTextNodeIdByLayer: Record<string, string>
	subtitleDefaultStyleByLayer: Record<string, SubtitleTextStyle>
	subtitleOverrideStyleByLayer: Record<string, Record<string, Partial<SubtitleTextStyle>>>
	subtitleVersion: number

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
