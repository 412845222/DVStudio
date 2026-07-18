import type { TimelineState } from './types'

export const createDefaultTimelineState = (): TimelineState => ({
	fps: 60,
	frameCount: 120,
	currentFrame: 0,
	frameWidth: 14,
	isScrubbing: false,
	isPlaying: false,
	uiFocus: null,
	uiJumpToFrame: null,
	uiJumpVersion: 0,
	layers: [{ id: 'layer-1', name: '图层1' }],
	layerKindById: { 'layer-1': 'normal' },
	selectedLayerIds: ['layer-1'],
	selectedSpansByLayer: {},
	selectionVersion: 0,
	lastSelectedCellKey: null,

	subtitleCuesByLayer: {},
	subtitleCueRangesByLayer: {},
	subtitleSpansByLayer: {},
	subtitleFpsByLayer: {},
	subtitleTextNodeIdByLayer: {},
	subtitleDefaultStyleByLayer: {},
	subtitleOverrideStyleByLayer: {},
	subtitleVersion: 0,

	keyframeSpansByLayer: {},
	keyframeVersion: 0,
	easingSegmentKeys: [],
	easingCurves: {},

	nodeKeyframesByLayer: {},
	nodeKeyframeVersion: 0,

	stageKeyframesByFrame: {},
	stageKeyframeVersion: 0,

	progressBarByLayerId: {},
	progressVersion: 0,

	audioByLayerId: {},
	audioVersion: 0
})
