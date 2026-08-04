import { describe, it, expect } from 'vitest'
import { Vector2 } from '@/engine/graphbase/core/Vector2'
import { Rect } from '@/engine/graphbase/core/Rect'
import {
	pointInSavedFrameTagBar,
	pointInSavedFrameDeleteBtn,
	pointInFrameDragArea,
	SELECTION_FRAME_CONSTANTS
} from '@/engine/blueprint/SelectionFrame'

// Constants matching SelectionFrame.ts internal values
const TAG_BAR_HEIGHT = 28
const DELETE_BTN_SIZE = 18
const DELETE_BTN_MARGIN = 6
const LABEL_EDIT_PADDING = 6
const MIN_LABEL_WIDTH = 36
const TAG_EXTRA_GAP = 4

// Mock camera for testing: configurable zoom and pan
function createCamera(zoom = 1, panX = 0, panY = 0) {
	return {
		zoom,
		worldToScreen(p: Vector2): Vector2 {
			return new Vector2(p.x * zoom + panX, p.y * zoom + panY)
		}
	}
}

describe('SelectionFrame hit tests', () => {
	// Frame bounds in world space: x=100, y=200, w=400, h=300
	const worldRect = new Rect(100, 200, 400, 300)
	// worldTextWidth: measured text width in world space (at font size 11/zoom px)
	// At zoom=1, font is 11px; a short label ~6 chars ≈ 42px at 11px
	const worldTextWidth = 42

	describe('pointInSavedFrameDeleteBtn', () => {
		it('hits delete button at zoom=1 when clicking on the X button area', () => {
			const zoom = 1
			const camera = createCamera(zoom)
			const invZ = 1 / zoom

			// Replicate drawSelectionFrame calculation:
			const labelWidth = Math.max(
				worldTextWidth + LABEL_EDIT_PADDING * 2 * invZ,
				MIN_LABEL_WIDTH * invZ
			)
			const btnSize = DELETE_BTN_SIZE * invZ
			const btnMargin = DELETE_BTN_MARGIN * invZ
			const tagW = Math.max(
				worldRect.width,
				labelWidth + btnSize + btnMargin * 2 + TAG_EXTRA_GAP * invZ
			)
			const tagWClamped = Math.min(tagW, worldRect.width)
			const deleteBtnX = worldRect.x + tagWClamped - btnMargin - btnSize
			const deleteBtnY = worldRect.y + (TAG_BAR_HEIGHT * invZ - btnSize) / 2

			// Center of delete button (world space)
			const btnCenterWorld = new Vector2(deleteBtnX + btnSize / 2, deleteBtnY + btnSize / 2)
			const screenPos = camera.worldToScreen(btnCenterWorld)

			const hit = pointInSavedFrameDeleteBtn(screenPos, worldRect, worldTextWidth, camera)
			expect(hit).toBe(true)
		})

		it('does not hit delete button when clicking on label area (left side of tag bar)', () => {
			const camera = createCamera(1)
			// Left side of tag bar should be label region, not delete button
			const hit = pointInSavedFrameDeleteBtn(
				new Vector2(130, 200 + TAG_BAR_HEIGHT / 2),
				worldRect,
				worldTextWidth,
				camera
			)
			expect(hit).toBe(false)
		})

		it('does not hit delete button when clicking below tag bar (frame body)', () => {
			const camera = createCamera(1)
			// Point well below tag bar in frame body
			const hit = pointInSavedFrameDeleteBtn(
				new Vector2(worldRect.x + worldRect.width - 20, worldRect.y + 200),
				worldRect,
				worldTextWidth,
				camera
			)
			expect(hit).toBe(false)
		})

		it('hits delete button correctly at zoom=0.5', () => {
			const zoom = 0.5
			const camera = createCamera(zoom)
			const invZ = 1 / zoom

			const labelWidth = Math.max(
				worldTextWidth + LABEL_EDIT_PADDING * 2 * invZ,
				MIN_LABEL_WIDTH * invZ
			)
			const btnSize = DELETE_BTN_SIZE * invZ
			const btnMargin = DELETE_BTN_MARGIN * invZ
			const tagW = Math.max(
				worldRect.width,
				labelWidth + btnSize + btnMargin * 2 + TAG_EXTRA_GAP * invZ
			)
			const tagWClamped = Math.min(tagW, worldRect.width)
			const deleteBtnX = worldRect.x + tagWClamped - btnMargin - btnSize
			const deleteBtnY = worldRect.y + (TAG_BAR_HEIGHT * invZ - btnSize) / 2

			const btnCenterWorld = new Vector2(deleteBtnX + btnSize / 2, deleteBtnY + btnSize / 2)
			const screenPos = camera.worldToScreen(btnCenterWorld)

			const hit = pointInSavedFrameDeleteBtn(screenPos, worldRect, worldTextWidth, camera)
			expect(hit).toBe(true)
		})

		it('hits delete button with 2px padding (hit slop) around button', () => {
			const zoom = 1
			const camera = createCamera(zoom)
			const invZ = 1 / zoom

			const labelWidth = Math.max(
				worldTextWidth + LABEL_EDIT_PADDING * 2 * invZ,
				MIN_LABEL_WIDTH * invZ
			)
			const btnSize = DELETE_BTN_SIZE * invZ
			const btnMargin = DELETE_BTN_MARGIN * invZ
			const tagW = Math.max(
				worldRect.width,
				labelWidth + btnSize + btnMargin * 2 + TAG_EXTRA_GAP * invZ
			)
			const tagWClamped = Math.min(tagW, worldRect.width)
			const deleteBtnX = worldRect.x + tagWClamped - btnMargin - btnSize
			const deleteBtnY = worldRect.y + (TAG_BAR_HEIGHT * invZ - btnSize) / 2

			// 1 pixel outside button edge (should still hit due to 2px padding)
			const slightlyOutside = new Vector2(deleteBtnX - 1, deleteBtnY + btnSize / 2)
			const screenPos = camera.worldToScreen(slightlyOutside)
			const hit = pointInSavedFrameDeleteBtn(screenPos, worldRect, worldTextWidth, camera)
			expect(hit).toBe(true)
		})
	})

	describe('pointInSavedFrameTagBar', () => {
		it('hits tag bar when clicking on label area at zoom=1', () => {
			const camera = createCamera(1)
			const hit = pointInSavedFrameTagBar(
				new Vector2(130, 200 + TAG_BAR_HEIGHT / 2),
				worldRect,
				worldTextWidth,
				camera
			)
			expect(hit).toBe(true)
		})

		it('hits tag bar across full width of tag bar area', () => {
			const camera = createCamera(1)
			// Near the right side (but not in delete button)
			const hit = pointInSavedFrameTagBar(
				new Vector2(worldRect.x + worldRect.width - 40, 200 + TAG_BAR_HEIGHT / 2),
				worldRect,
				worldTextWidth,
				camera
			)
			expect(hit).toBe(true)
		})

		it('does not hit tag bar when clicking in frame body (below tag bar)', () => {
			const camera = createCamera(1)
			const hit = pointInSavedFrameTagBar(
				new Vector2(250, worldRect.y + 200),
				worldRect,
				worldTextWidth,
				camera
			)
			expect(hit).toBe(false)
		})

		it('does not hit tag bar when clicking outside frame (left of frame)', () => {
			const camera = createCamera(1)
			const hit = pointInSavedFrameTagBar(
				new Vector2(worldRect.x - 50, 200 + TAG_BAR_HEIGHT / 2),
				worldRect,
				worldTextWidth,
				camera
			)
			expect(hit).toBe(false)
		})

		it('hits tag bar correctly at zoom=0.5 with pan offset', () => {
			const zoom = 0.5
			const panX = 100
			const panY = 200
			const camera = createCamera(zoom, panX, panY)
			const invZ = 1 / zoom
			// Point in the middle of tag bar (world space)
			const worldPoint = new Vector2(worldRect.x + 50, worldRect.y + (TAG_BAR_HEIGHT * invZ) / 2)
			const screenPos = camera.worldToScreen(worldPoint)
			const hit = pointInSavedFrameTagBar(screenPos, worldRect, worldTextWidth, camera)
			expect(hit).toBe(true)
		})
	})

	describe('pointInFrameDragArea (temp blue frame body)', () => {
		it('hits drag area in frame body below tag bar at zoom=1', () => {
			const camera = createCamera(1)
			// Drag area is the frame body below the tag bar (TAG_BAR_HEIGHT from top)
			const tagBarH = TAG_BAR_HEIGHT // screen pixels at zoom=1
			const hit = pointInFrameDragArea(
				new Vector2(worldRect.x + 50, worldRect.y + tagBarH + 20),
				worldRect,
				camera
			)
			expect(hit).toBe(true)
		})

		it('does not hit drag area in tag bar region (top strip)', () => {
			const camera = createCamera(1)
			// Tag bar area itself is NOT the drag area (it has input/save controls)
			const hit = pointInFrameDragArea(
				new Vector2(worldRect.x + 200, worldRect.y + TAG_BAR_HEIGHT / 2),
				worldRect,
				camera
			)
			expect(hit).toBe(false)
		})
	})

	describe('SELECTION_FRAME_CONSTANTS', () => {
		it('exports TAG_BAR_HEIGHT matching internal constant', () => {
			expect(SELECTION_FRAME_CONSTANTS.TAG_BAR_HEIGHT).toBe(TAG_BAR_HEIGHT)
		})

		it('exports PADDING', () => {
			expect(typeof SELECTION_FRAME_CONSTANTS.PADDING).toBe('number')
			expect(SELECTION_FRAME_CONSTANTS.PADDING).toBeGreaterThan(0)
		})
	})
})
