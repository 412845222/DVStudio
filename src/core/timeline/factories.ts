import type { TimelineState } from './types'

export const createDefaultTimelineState = (): TimelineState => ({
	frameCount: 120,
	currentFrame: 0,
	frameWidth: 14,
	layers: [{ id: 'layer-1', name: '图层1' }],
	selectedLayerIds: ['layer-1'],
	selectedSpansByLayer: {},
	selectionVersion: 0,
	lastSelectedCellKey: null,

	keyframeSpansByLayer: {},
	keyframeVersion: 0,
	easingSegmentKeys: [],
	easingCurves: {},

	nodeKeyframesByLayer: {},
	nodeKeyframeVersion: 0,

	stageKeyframesByFrame: {},
	stageKeyframeVersion: 0,
})
