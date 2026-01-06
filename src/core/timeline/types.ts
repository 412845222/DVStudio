import type { VideoSceneLayer, VideoSceneNodeProps, VideoSceneNodeTransform } from '../scene'

export type TimelineLayer = { id: string; name: string }

export type TimelineLayerKind = 'normal' | 'subtitle' | 'progress'

export type SubtitleCue = { startMs: number; endMs: number; text: string }

export type SubtitleCueRange = { startFrame: number; endFrame: number }

export type SubtitleTextStyle = {
	fontSize: number
	fontColor: string
	fontStyle: string
	textAlign: 'left' | 'center' | 'right'
}

export type ProgressMarkerShape = 'circle' | 'square'

export type ProgressMarkerStyle = {
	shape: ProgressMarkerShape
	size: number
	color: string
	borderColor: string
}

export type NodeFilterSpec = Record<string, unknown>

export type ProgressBarStyle = {
	backgroundColor: string
	borderColor: string
	textColor: string
	marker: ProgressMarkerStyle
	playedOverlayColor: string
	playedOverlayBorderColor: string
	/** 背景（root rect）滤镜 */
	backgroundFilters?: NodeFilterSpec[]
	/** 段落矩形（segment rects）滤镜 */
	segmentFilters?: NodeFilterSpec[]
	/** 段落标题文字（title texts）滤镜 */
	titleFilters?: NodeFilterSpec[]
	/** 已播放矩形（played overlay rect）滤镜 */
	playedOverlayFilters?: NodeFilterSpec[]
}

export type ProgressBarSegment = {
	startFrame: number
	endFrame: number
	title: string
}

export type ProgressBarNodeIds = {
	rootId: string
	playedOverlayId: string
	segmentIds: string[]
	titleIds: string[]
	markerIds: string[]
}

export type ProgressBarSpec = {
	style: ProgressBarStyle
	segments: ProgressBarSegment[]
	nodeIds: ProgressBarNodeIds
}

export type TimelineCellKey = string // `${layerId}:${frameIndex}`

export type TimelineEasingCurve = { x1: number; y1: number; x2: number; y2: number; preset?: string }

export type TimelineFrameSpan = number | { start: number; end: number } // inclusive

export type TimelineState = {
	/** Project FPS (used by playback and export). */
	fps: number
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

	progressBarByLayerId: Record<string, ProgressBarSpec>
	progressVersion: number
}
