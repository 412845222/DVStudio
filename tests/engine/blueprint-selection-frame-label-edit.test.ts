import { describe, it, expect, afterEach, vi, beforeAll, afterAll } from 'vitest'
import { BlueprintScene } from '@/engine/blueprint/BlueprintScene'
import { Rect } from '@/engine/graphbase/core/Rect'
import { getEditingFrameLabelWorldRect, SELECTION_FRAME_CONSTANTS } from '@/engine/blueprint/SelectionFrame'
import type { EditingFrameLabelWorldRectResult } from '@/engine/blueprint/SelectionFrame'
import { getI18nManager } from '@/engine/blueprint/i18n'

// Hard-coded constants must mirror the module-internal values in SelectionFrame.ts;
// they are intentionally not exported (encapsulation) — we assert their numeric values
// only inside this test file to validate coordinate behavior.
const TAG_BAR_HEIGHT = SELECTION_FRAME_CONSTANTS.TAG_BAR_HEIGHT // 28
const LABEL_EDIT_PADDING = 6
const DELETE_BTN_SIZE = 18
const DELETE_BTN_MARGIN = 6
const SAVE_BTN_SIZE = 24
const SAVE_BTN_MARGIN = 4
const TAG_BAR_PADDING_X = 8
const INPUT_MIN_WIDTH = 120
// 36 is the magic minimum world label width used inside SelectionFrame label input calc.
const MIN_LABEL_WORLD_WIDTH_DIV_Z = 36

function createScene(): BlueprintScene {
	const canvas = document.createElement('canvas')
	canvas.width = 1920
	canvas.height = 1080
	return new BlueprintScene(canvas)
}

// Ensure i18n is initialized so t() returns deterministic strings for measureText
let i18nInited = false
function ensureI18n() {
	if (i18nInited) return
	const mgr = getI18nManager()
	try {
		mgr.setLocale('zh-CN')
	} catch {
		/* noop */
	}
	i18nInited = true
}

describe('SelectionFrame.getEditingFrameLabelWorldRect', () => {
	// create a mock 2D context with a deterministic measureText implementation so that
	// countTagWidth/saveBtnWidth do not depend on host OS font metrics.
	function createCtx(): CanvasRenderingContext2D {
		const canvas = document.createElement('canvas')
		const ctx = canvas.getContext('2d')!
		// Make measureText deterministic: each char contributes 7px at font size 11 (zoom 1)
		vi.spyOn(ctx, 'measureText').mockImplementation((text: unknown) => {
			const s = String(text ?? '')
			// Detect current fontSize from ctx.font. Default is 10px sans-serif; SelectionFrame
			// uses 500 ${11*invZ}px. Compute width proportionally.
			const fontStr = ctx.font || '10px sans-serif'
			const match = /(?<size>\d+(?:\.\d+)?)px/.exec(fontStr)
			const px = match ? Number(match.groups!.size) : 10
			// 7px per char at 11px ≈ 0.636 ratio
			const widthPx = s.length * px * (7 / 11)
			return {
				width: widthPx,
				actualBoundingBoxLeft: 0,
				actualBoundingBoxRight: widthPx,
				actualBoundingBoxAscent: 0,
				actualBoundingBoxDescent: 0,
				alphabeticBaseline: 0,
				emHeightAscent: 0,
				emHeightDescent: 0,
				fontBoundingBoxAscent: 0,
				fontBoundingBoxDescent: 0,
				hangingBaseline: 0,
				ideographicBaseline: 0
			} as unknown as TextMetrics
		})
		return ctx
	}

	const worldRect = new Rect(100, 200, 500, 400)

	beforeAll(() => ensureI18n())
	afterAll(() => void 0)

	it('returns null when neither tempEditing nor editingSavedFrameId', () => {
		const ctx = createCtx()
		const got = getEditingFrameLabelWorldRect(
			ctx,
			worldRect,
			1,
			false,
			2,
			null,
			false,
			null
		)
		expect(got).toBeNull()
	})

	it('returns a world rect for temp blue editing (zoom=1)', () => {
		const ctx = createCtx()
		const zoom = 1
		const nodeCount = 2
		const invZ = 1 / zoom
		const rect: EditingFrameLabelWorldRectResult | null = getEditingFrameLabelWorldRect(
			ctx,
			worldRect,
			zoom,
			false,
			nodeCount,
			null,
			true,
			null
		)
		expect(rect).not.toBeNull()
		const r = rect!
		// Font size world unit = 11/zoom
		expect(r.fontSizeWorld).toBeCloseTo(11 * invZ, 3)
		// inputWorldRect should live inside the TAG_BAR_HEIGHT row (y ~ worldRect.y, height ~ tagBarH - 6)
		expect(r.inputWorldRect.y).toBeGreaterThanOrEqual(worldRect.y - 1)
		expect(r.inputWorldRect.y + r.inputWorldRect.height).toBeLessThanOrEqual(
			worldRect.y + TAG_BAR_HEIGHT * invZ + 1
		)
		// input must be wider than INPUT_MIN_WIDTH in world units (default 120/zoom)
		expect(r.inputWorldRect.width).toBeGreaterThanOrEqual(INPUT_MIN_WIDTH * invZ - 1e-3)
		// input must be <= 50% of worldRect width
		expect(r.inputWorldRect.width).toBeLessThanOrEqual(worldRect.width * 0.5 + 1e-3)
		// temp blue input must be to the right of count tag.
		// We only do loose assertion here (input starts right of worldRect.x) because the
		// actual count text depends on i18n string "x nodes" in the real i18nManager,
		// which we want to keep robust to locale updates.
		expect(r.inputWorldRect.x).toBeGreaterThan(worldRect.x)
	})

	it('scales tag bar height / input width correctly at zoom=0.5 (world units scale correctly)', () => {
		const ctx = createCtx()
		const zoom = 0.5
		const invZ = 1 / zoom
		const nodeCount = 3
		const r = getEditingFrameLabelWorldRect(
			ctx,
			worldRect,
			zoom,
			false,
			nodeCount,
			null,
			true,
			null
		)!
		expect(r).not.toBeNull()
		// input height should equal tag bar height minus 6/zoom in world units
		expect(r.inputWorldRect.height).toBeCloseTo(TAG_BAR_HEIGHT * invZ - 6 * invZ, 3)
		// Font scales with 1/zoom
		expect(r.fontSizeWorld).toBeCloseTo(11 * invZ, 3)
	})

	it('returns a world rect for a saved (green) frame label editing with minimum label width clamp', () => {
		const ctx = createCtx()
		const zoom = 1
		const invZ = 1 / zoom
		const savedLabelTextWidth = 42
		const frameId = 'g1'
		const r = getEditingFrameLabelWorldRect(
			ctx,
			worldRect,
			zoom,
			true,
			{ savedLabelTextWidth },
			frameId,
			false,
			frameId
		)!
		expect(r).not.toBeNull()
		// label width uses min(36/zoom, text + 2*LABEL_EDIT_PADDING/zoom) - here 42 + 12 = 54 wins
		const expectedMinLabelWorld = Math.max(
			savedLabelTextWidth + LABEL_EDIT_PADDING * 2 * invZ,
			MIN_LABEL_WORLD_WIDTH_DIV_Z * invZ
		)
		// final labelBoxW is tagWClamped - btnSize - 2*btnMargin
		const btnSize = DELETE_BTN_SIZE * invZ
		const btnMargin = DELETE_BTN_MARGIN * invZ
		const tagW = Math.max(
			worldRect.width,
			expectedMinLabelWorld + btnSize + btnMargin * 2 + 4 * invZ
		)
		const tagWClamped = Math.min(tagW, worldRect.width)
		const labelBoxW = Math.max(tagWClamped - btnSize - btnMargin * 2, 24 * invZ)
		expect(r.inputWorldRect.width).toBeCloseTo(labelBoxW - 6 * invZ, 3)
		// input left edge should be within frame bounds (x+3/zoom padding)
		expect(r.inputWorldRect.x).toBeCloseTo(worldRect.x + 3 * invZ, 3)
	})

	it('green frame edit rect stays to the left of delete button area', () => {
		const ctx = createCtx()
		const zoom = 1
		const invZ = 1 / zoom
		const savedLabelTextWidth = 42
		const frameId = 'g2'
		const r = getEditingFrameLabelWorldRect(
			ctx,
			worldRect,
			zoom,
			true,
			{ savedLabelTextWidth },
			frameId,
			false,
			frameId
		)!
		const btnSize = DELETE_BTN_SIZE * invZ
		const btnMargin = DELETE_BTN_MARGIN * invZ
		const deleteBtnStartX =
			worldRect.x + worldRect.width - btnMargin * 2 - btnSize
		expect(r.inputWorldRect.x + r.inputWorldRect.width).toBeLessThanOrEqual(
			deleteBtnStartX + 1e-3
		)
		// delete btn size/margin are only used to ensure no overlap — unused values voided
		void SAVE_BTN_SIZE
		void SAVE_BTN_MARGIN
	})
})

describe('BlueprintScene selection-frame label edit delegation (SSOT forwards to Tool)', () => {
	let scene: BlueprintScene
	afterEach(() => {
		if (scene) scene.dispose()
	})

	it('getEditingFrameText returns "" when nothing editing, setFrameLabelEditText does not throw when idle', () => {
		scene = createScene()
		expect(scene.getEditingFrameText()).toBe('')
		expect(() => scene.setFrameLabelEditText('abc')).not.toThrow()
		expect(() => scene.setFrameLabelComposing(true)).not.toThrow()
		expect(() => scene.commitFrameLabelEdit()).not.toThrow()
		expect(() => scene.cancelFrameLabelEdit()).not.toThrow()
	})

	it('getEditingFrameLabelWorldRect returns null when idle', () => {
		scene = createScene()
		expect(scene.getEditingFrameLabelWorldRect()).toBeNull()
	})

	it('isSelectionFrameEditing returns false on fresh scene', () => {
		scene = createScene()
		expect(scene.isSelectionFrameEditing()).toBe(false)
	})
})
