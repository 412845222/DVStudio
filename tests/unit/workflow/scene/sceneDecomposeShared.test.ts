import { describe, it, expect } from 'vitest'
import {
	slugSceneDecomposeId,
	extractSceneDecomposeItems,
	inferSceneDecomposeSourceImageIndex,
	shouldSkipSceneDecomposeItem,
	hasAnySceneDecomposeCrop,
	hasValidSceneDecomposeImageRect,
	hasValidSceneDecomposePixelRect,
	normalizeSceneDecomposeCrop,
	type SceneDecomposeInputItem
} from '../../../../src/views/AIWorkflow/node-business/scene/sceneDecomposeShared'

describe('sceneDecomposeShared', () => {
	describe('slugSceneDecomposeId', () => {
		it('should slugify normal strings', () => {
			expect(slugSceneDecomposeId('Wooden Table', 0)).toBe('wooden-table')
			expect(slugSceneDecomposeId('Window_Front', 1)).toBe('window_front')
			expect(slugSceneDecomposeId('  Chair 123  ', 2)).toBe('chair-123')
		})

		it('should fallback to object-N for empty input', () => {
			expect(slugSceneDecomposeId('', 0)).toBe('object-1')
			expect(slugSceneDecomposeId(null, 1)).toBe('object-2')
			expect(slugSceneDecomposeId(undefined, 2)).toBe('object-3')
			expect(slugSceneDecomposeId('   ', 3)).toBe('object-4')
		})

		it('should handle special characters', () => {
			expect(slugSceneDecomposeId('Shelf/Bookcase@2x', 0)).toBe('shelf-bookcase-2x')
		})
	})

	describe('extractSceneDecomposeItems', () => {
		it('should extract from objects array', () => {
			const items = [{ id: 'a' }, { id: 'b' }]
			expect(extractSceneDecomposeItems({ objects: items })).toEqual(items)
		})

		it('should extract from layoutItems array', () => {
			const items = [{ id: 'a' }, { id: 'b' }]
			expect(extractSceneDecomposeItems({ layoutItems: items })).toEqual(items)
		})

		it('should extract direct array', () => {
			const items = [{ id: 'a' }, { id: 'b' }]
			expect(extractSceneDecomposeItems(items)).toEqual(items)
		})

		it('should return empty array for invalid input', () => {
			expect(extractSceneDecomposeItems(null)).toEqual([])
			expect(extractSceneDecomposeItems({})).toEqual([])
			expect(extractSceneDecomposeItems('invalid')).toEqual([])
		})
	})

	describe('inferSceneDecomposeSourceImageIndex', () => {
		it('should use direct sourceImageIndex', () => {
			expect(inferSceneDecomposeSourceImageIndex({ sourceImageIndex: 2 })).toBe(2)
			expect(inferSceneDecomposeSourceImageIndex({ sourceImageIndex: 1 })).toBe(1)
		})

		it('should fallback to first observedImageIndices', () => {
			expect(inferSceneDecomposeSourceImageIndex({ observedImageIndices: [3, 1, 2] })).toBe(3)
		})

		it('should default to 1', () => {
			expect(inferSceneDecomposeSourceImageIndex({})).toBe(1)
			expect(inferSceneDecomposeSourceImageIndex({ sourceImageIndex: 0 })).toBe(1)
			expect(inferSceneDecomposeSourceImageIndex({ sourceImageIndex: -1 })).toBe(1)
		})

		it('should floor decimal values', () => {
			expect(inferSceneDecomposeSourceImageIndex({ sourceImageIndex: 2.7 })).toBe(2)
		})
	})

	describe('shouldSkipSceneDecomposeItem', () => {
		it('should skip null/non-object items', () => {
			expect(shouldSkipSceneDecomposeItem(null as any)).toBe(true)
			expect(shouldSkipSceneDecomposeItem(undefined as any)).toBe(true)
			expect(shouldSkipSceneDecomposeItem('string' as any)).toBe(true)
		})

		it('should skip structure-shell semanticRole', () => {
			expect(shouldSkipSceneDecomposeItem({ semanticRole: 'structure-shell' })).toBe(true)
		})

		it('should skip structural-shell relationTags', () => {
			expect(shouldSkipSceneDecomposeItem({ relationTags: ['structural-shell'] })).toBe(true)
		})

		it('should skip floor/ceiling/wall by id pattern', () => {
			expect(shouldSkipSceneDecomposeItem({ id: 'floor1' })).toBe(true)
			expect(shouldSkipSceneDecomposeItem({ id: 'ceiling1' })).toBe(true)
			expect(shouldSkipSceneDecomposeItem({ id: 'wall1' })).toBe(true)
			expect(shouldSkipSceneDecomposeItem({ id: 'wall2' })).toBe(true)
		})

		it('should skip floor/wall/ceiling keyElementType without crop or observed images', () => {
			expect(shouldSkipSceneDecomposeItem({ keyElementType: 'floor' })).toBe(true)
			expect(shouldSkipSceneDecomposeItem({ keyElementType: 'wall' })).toBe(true)
			expect(shouldSkipSceneDecomposeItem({ keyElementType: 'ceiling' })).toBe(true)
		})

		it('should NOT skip floor/wall/ceiling if they have crop info', () => {
			expect(shouldSkipSceneDecomposeItem({ keyElementType: 'floor', bbox: [0, 0, 100, 100] })).toBe(false)
		})

		it('should NOT skip normal objects', () => {
			expect(shouldSkipSceneDecomposeItem({ id: 'chair1', semanticRole: 'furniture' })).toBe(false)
			expect(shouldSkipSceneDecomposeItem({ id: 'lamp1' })).toBe(false)
		})
	})

	describe('bbox rect validation', () => {
		describe('hasValidSceneDecomposeImageRect', () => {
			it('should accept valid object rect {x,y,width,height}', () => {
				expect(hasValidSceneDecomposeImageRect({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 })).toBe(true)
			})

			it('should accept valid array rect [x,y,w,h]', () => {
				expect(hasValidSceneDecomposeImageRect([0.1, 0.2, 0.3, 0.4])).toBe(true)
			})

			it('should accept valid XYXY array [x1,y1,x2,y2]', () => {
				expect(hasValidSceneDecomposeImageRect([0.1, 0.2, 0.4, 0.6])).toBe(true)
			})

			it('should reject invalid values', () => {
				expect(hasValidSceneDecomposeImageRect(null)).toBe(false)
				expect(hasValidSceneDecomposeImageRect(undefined)).toBe(false)
				expect(hasValidSceneDecomposeImageRect({})).toBe(false)
				expect(hasValidSceneDecomposeImageRect([1, 2])).toBe(false)
				expect(hasValidSceneDecomposeImageRect({ x: 0, y: 0, width: 0, height: 0 })).toBe(false)
			})
		})

		describe('hasValidSceneDecomposePixelRect', () => {
			it('should accept valid pixel rect', () => {
				expect(hasValidSceneDecomposePixelRect({ x: 10, y: 20, width: 100, height: 200 })).toBe(true)
				expect(hasValidSceneDecomposePixelRect([10, 20, 100, 200])).toBe(true)
			})
		})
	})

	describe('hasAnySceneDecomposeCrop', () => {
		it('should detect imageRect', () => {
			expect(hasAnySceneDecomposeCrop({ imageRect: { x: 0, y: 0, width: 0.5, height: 0.5 } })).toBe(true)
		})

		it('should detect imageRectPixels', () => {
			expect(hasAnySceneDecomposeCrop({ imageRectPixels: { x: 0, y: 0, width: 100, height: 100 } })).toBe(true)
		})

		it('should detect bbox field', () => {
			expect(hasAnySceneDecomposeCrop({ bbox: [0, 0, 100, 100] })).toBe(true)
			expect(hasAnySceneDecomposeCrop({ bbox: { x: 0, y: 0, width: 100, height: 100 } })).toBe(true)
		})

		it('should detect bbox_2d field', () => {
			expect(hasAnySceneDecomposeCrop({ bbox_2d: [0, 0, 100, 100] })).toBe(true)
		})

		it('should detect box field', () => {
			expect(hasAnySceneDecomposeCrop({ box: [0, 0, 100, 100] })).toBe(true)
		})

		it('should detect rect field', () => {
			expect(hasAnySceneDecomposeCrop({ rect: { x: 0, y: 0, w: 100, h: 100 } })).toBe(true)
		})

		it('should detect bounds field', () => {
			expect(hasAnySceneDecomposeCrop({ bounds: { x1: 0, y1: 0, x2: 100, y2: 100 } })).toBe(true)
		})

		it('should detect root-level x/y/w/h', () => {
			expect(hasAnySceneDecomposeCrop({ x: 0, y: 0, w: 100, h: 100 })).toBe(true)
		})

		it('should detect root-level x1/y1/x2/y2', () => {
			expect(hasAnySceneDecomposeCrop({ x1: 0, y1: 0, x2: 100, y2: 100 })).toBe(true)
		})

		it('should return false for item without any crop info', () => {
			expect(hasAnySceneDecomposeCrop({ id: 'chair1', name: 'Chair' })).toBe(false)
			expect(hasAnySceneDecomposeCrop({})).toBe(false)
		})
	})

	describe('normalizeSceneDecomposeCrop - bbox array format parsing (critical bug fix)', () => {
		const SOURCE_1024 = { width: 1024, height: 1024 }

		it('should parse XYXY UV array format [x1,y1,x2,y2] (the bug case from logs)', () => {
			// This was the bug: array [0, 0.69, 0.27, 0.86] was not being parsed correctly
			// All 9 objects fell back to full image because arrays were not supported
			const item: SceneDecomposeInputItem = { bbox: [0, 0.69, 0.27, 0.86] }
			const result = normalizeSceneDecomposeCrop(undefined, undefined, SOURCE_1024, { item })
			expect(result).not.toBeNull()
			// KEY FIX: cropMode should be 'cropped', NOT 'fallback'
			// Before the fix, all array formats fell back to full image
			expect(result?.cropMode).toBe('cropped')
			// Verify crop dimensions are reasonable (not full image)
			expect(result?.crop.width).toBeLessThan(1)
			expect(result?.crop.height).toBeGreaterThan(0)
		})

		it('should parse XYWH UV array format [x,y,w,h]', () => {
			const item: SceneDecomposeInputItem = { bbox: [0.1, 0.2, 0.3, 0.4] }
			const result = normalizeSceneDecomposeCrop(undefined, undefined, SOURCE_1024, { item })
			expect(result).not.toBeNull()
			expect(result?.cropMode).toBe('cropped')
			expect(result?.crop.width).toBeLessThanOrEqual(1)
			expect(result?.crop.height).toBeGreaterThan(0)
		})

		it('should parse pixel array format [x,y,w,h] with large values', () => {
			const item: SceneDecomposeInputItem = { bbox: [100, 200, 400, 500] }
			const result = normalizeSceneDecomposeCrop(undefined, undefined, SOURCE_1024, { item })
			expect(result).not.toBeNull()
			expect(result?.cropMode).toBe('cropped')
			// Should produce valid pixelRect
			expect(result?.pixelRect).toBeDefined()
			expect(result?.pixelRect?.width).toBeGreaterThanOrEqual(350) // Min width enforced
			expect(result?.pixelRect?.height).toBeGreaterThan(0)
		})

		it('should parse object format {x,y,width,height}', () => {
			const item: SceneDecomposeInputItem = { bbox: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 } }
			const result = normalizeSceneDecomposeCrop(undefined, undefined, SOURCE_1024, { item })
			expect(result).not.toBeNull()
			expect(result?.cropMode).toBe('cropped')
			expect(result?.crop.width).toBeLessThanOrEqual(1)
		})

		it('should parse object format {x1,y1,x2,y2}', () => {
			const item: SceneDecomposeInputItem = { bbox: { x1: 100, y1: 200, x2: 500, y2: 600 } }
			const result = normalizeSceneDecomposeCrop(undefined, undefined, SOURCE_1024, { item })
			expect(result).not.toBeNull()
			expect(result?.cropMode).toBe('cropped')
			expect(result?.pixelRect).toBeDefined()
			expect(result?.pixelRect?.width).toBeGreaterThanOrEqual(350)
		})

		it('should parse bbox_2d field', () => {
			const item: SceneDecomposeInputItem = { bbox_2d: [0.1, 0.2, 0.6, 0.7] }
			const result = normalizeSceneDecomposeCrop(undefined, undefined, SOURCE_1024, { item })
			expect(result).not.toBeNull()
			expect(result?.cropMode).toBe('cropped')
		})

		it('should parse boundingBox field', () => {
			const item: SceneDecomposeInputItem = { boundingBox: { x: 100, y: 100, w: 400, h: 400 } }
			const result = normalizeSceneDecomposeCrop(undefined, undefined, SOURCE_1024, { item })
			expect(result).not.toBeNull()
			expect(result?.cropMode).toBe('cropped')
		})

		it('should parse box2d field', () => {
			const item: SceneDecomposeInputItem = { box2d: [0, 0, 0.5, 0.5] }
			const result = normalizeSceneDecomposeCrop(undefined, undefined, SOURCE_1024, { item })
			expect(result).not.toBeNull()
			expect(result?.cropMode).toBe('cropped')
		})

		it('should parse box field with left/top/right/bottom', () => {
			const item: SceneDecomposeInputItem = { box: { left: 50, top: 50, right: 250, bottom: 250 } }
			const result = normalizeSceneDecomposeCrop(undefined, undefined, SOURCE_1024, { item })
			expect(result).not.toBeNull()
			expect(result?.cropMode).toBe('cropped')
			expect(result?.pixelRect).toBeDefined()
		})

		it('should parse rect field', () => {
			const item: SceneDecomposeInputItem = { rect: [0, 0, 0.5, 0.5] }
			const result = normalizeSceneDecomposeCrop(undefined, undefined, SOURCE_1024, { item })
			expect(result).not.toBeNull()
			expect(result?.cropMode).toBe('cropped')
		})

		it('should parse bounds field', () => {
			const item: SceneDecomposeInputItem = { bounds: { x: 0, y: 0, width: 512, height: 512 } }
			const result = normalizeSceneDecomposeCrop(undefined, undefined, SOURCE_1024, { item })
			expect(result).not.toBeNull()
			expect(result?.cropMode).toBe('cropped')
		})

		it('should fallback to full image when allowFullImageFallback is true and no bbox', () => {
			const item: SceneDecomposeInputItem = { id: 'obj1', name: 'Object' }
			const result = normalizeSceneDecomposeCrop(undefined, undefined, SOURCE_1024, {
				item,
				allowFullImageFallback: true
			})
			expect(result).not.toBeNull()
			expect(result?.cropMode).toBe('fallback')
			expect(result?.crop.x).toBe(0)
			expect(result?.crop.y).toBe(0)
			expect(result?.crop.width).toBe(1)
			expect(result?.crop.height).toBe(1)
		})

		it('should return null when no valid bbox and fallback disabled', () => {
			const item: SceneDecomposeInputItem = { id: 'obj1', name: 'Object' }
			const result = normalizeSceneDecomposeCrop(undefined, undefined, SOURCE_1024, { item })
			expect(result).toBeNull()
		})

		it('should use provided imageRect directly when valid', () => {
			const imageRect = { x: 0.2, y: 0.3, width: 0.6, height: 0.6 }
			const result = normalizeSceneDecomposeCrop(imageRect, undefined, SOURCE_1024)
			expect(result).not.toBeNull()
			expect(result?.cropMode).toBe('cropped')
		})

		it('should convert pixelRect to UV coordinates', () => {
			const pixelRect = { x: 256, y: 256, width: 512, height: 512 }
			const result = normalizeSceneDecomposeCrop(undefined, pixelRect, SOURCE_1024)
			expect(result).not.toBeNull()
			expect(result?.cropMode).toBe('cropped')
			// Center should be around 0.5, 0.5
			expect(result?.crop.x + result?.crop.width / 2).toBeCloseTo(0.5, 1)
			expect(result?.crop.y + result?.crop.height / 2).toBeCloseTo(0.5, 1)
		})
	})
})
