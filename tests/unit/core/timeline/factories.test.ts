import { describe, it, expect } from 'vitest'
import { createDefaultTimelineState } from '@/core/timeline/factories'

describe('timeline/factories', () => {
	describe('createDefaultTimelineState', () => {
		it('creates timeline state with default values', () => {
			const state = createDefaultTimelineState()
			expect(state.fps).toBe(60)
			expect(state.frameCount).toBe(120)
			expect(state.currentFrame).toBe(0)
			expect(state.frameWidth).toBe(14)
		})

		it('creates state with default layer', () => {
			const state = createDefaultTimelineState()
			expect(state.layers).toHaveLength(1)
			expect(state.layers[0].id).toBe('layer-1')
			expect(state.layers[0].name).toBe('图层1')
		})

		it('creates state with empty selections', () => {
			const state = createDefaultTimelineState()
			expect(state.selectedLayerIds).toEqual(['layer-1'])
			expect(state.selectedSpansByLayer).toEqual({})
			expect(state.uiFocus).toBeNull()
			expect(state.uiJumpToFrame).toBeNull()
		})

		it('creates state with subtitle fields', () => {
			const state = createDefaultTimelineState()
			expect(state.subtitleCuesByLayer).toEqual({})
			expect(state.subtitleCueRangesByLayer).toEqual({})
			expect(state.subtitleSpansByLayer).toEqual({})
			expect(state.subtitleFpsByLayer).toEqual({})
			expect(state.subtitleTextNodeIdByLayer).toEqual({})
			expect(state.subtitleDefaultStyleByLayer).toEqual({})
			expect(state.subtitleOverrideStyleByLayer).toEqual({})
			expect(state.subtitleVersion).toBe(0)
		})

		it('creates state with keyframe fields', () => {
			const state = createDefaultTimelineState()
			expect(state.keyframeSpansByLayer).toEqual({})
			expect(state.keyframeVersion).toBe(0)
			expect(state.easingSegmentKeys).toEqual([])
			expect(state.easingCurves).toEqual({})
			expect(state.nodeKeyframesByLayer).toEqual({})
			expect(state.nodeKeyframeVersion).toBe(0)
			expect(state.stageKeyframesByFrame).toEqual({})
			expect(state.stageKeyframeVersion).toBe(0)
		})

		it('creates state with progress and audio fields', () => {
			const state = createDefaultTimelineState()
			expect(state.progressBarByLayerId).toEqual({})
			expect(state.progressVersion).toBe(0)
			expect(state.audioByLayerId).toEqual({})
			expect(state.audioVersion).toBe(0)
		})

		it('creates state with selectionVersion', () => {
			const state = createDefaultTimelineState()
			expect(state.selectionVersion).toBe(0)
			expect(state.lastSelectedCellKey).toBeNull()
		})
	})
})
