import { describe, it, expect } from 'vitest'
import {
	rotatedRectCorners,
	normalizeLineLocalPoints,
	scaleLineLocalPoints,
	suggestLineAnchorLocal,
	lineControlPointsWorld,
	worldToLocalRotated,
	type Vec2
} from '@/core/scene/geometry'

describe('geometry', () => {
	describe('rotatedRectCorners', () => {
		it('returns corners for axis-aligned rectangle', () => {
			const center = { x: 0, y: 0 }
			const size = { width: 100, height: 50 }
			const corners = rotatedRectCorners(center, size, 0)
			expect(corners.tl).toEqual({ x: -50, y: -25 })
			expect(corners.tr).toEqual({ x: 50, y: -25 })
			expect(corners.bl).toEqual({ x: -50, y: 25 })
			expect(corners.br).toEqual({ x: 50, y: 25 })
		})

		it('handles zero rotation', () => {
			const center = { x: 100, y: 100 }
			const size = { width: 200, height: 100 }
			const corners = rotatedRectCorners(center, size, 0)
			expect(corners.tl.x).toBeCloseTo(0)
			expect(corners.tl.y).toBeCloseTo(50)
			expect(corners.br.x).toBeCloseTo(200)
			expect(corners.br.y).toBeCloseTo(150)
		})

		it('handles 90 degree rotation', () => {
			const center = { x: 0, y: 0 }
			const size = { width: 100, height: 50 }
			const corners = rotatedRectCorners(center, size, Math.PI / 2)
			expect(corners.tl.x).toBeCloseTo(25)
			expect(corners.tl.y).toBeCloseTo(-50)
		})

		it('handles invalid size with defaults', () => {
			const center = { x: 0, y: 0 }
			const corners = rotatedRectCorners(center, { width: 0, height: 0 }, 0)
			expect(corners.tl).toEqual({ x: 0, y: 0 })
		})

		it('handles non-finite values in size', () => {
			const center = { x: 0, y: 0 }
			const corners = rotatedRectCorners(center, { width: NaN, height: Infinity }, 0)
			expect(corners.tl).toEqual({ x: 0, y: 0 })
		})
	})

	describe('normalizeLineLocalPoints', () => {
		it('returns defaults when no props provided', () => {
			const local = normalizeLineLocalPoints({ width: 100, height: 50 })
			expect(local.startX).toBeDefined()
			expect(local.startY).toBe(0)
			expect(local.endX).toBeDefined()
			expect(local.endY).toBe(0)
		})

		it('uses provided values from props', () => {
			const local = normalizeLineLocalPoints({
				props: { startX: 10, startY: 20, endX: 30, endY: 40 },
				width: 100,
				height: 50
			})
			expect(local.startX).toBe(10)
			expect(local.startY).toBe(20)
			expect(local.endX).toBe(30)
			expect(local.endY).toBe(40)
		})

		it('clamps width/height to minimum 1', () => {
			const local = normalizeLineLocalPoints({ width: 0, height: -5 })
			expect(local.startX).not.toBeNaN()
			expect(local.endX).not.toBeNaN()
		})

		it('handles null props', () => {
			const local = normalizeLineLocalPoints({ props: null, width: 100, height: 50 })
			expect(local.startY).toBe(0)
		})
	})

	describe('scaleLineLocalPoints', () => {
		it('scales points uniformly', () => {
			const original = { startX: 10, startY: 20, endX: 30, endY: 40, anchorX: 20, anchorY: 30 }
			const scaled = scaleLineLocalPoints(original, 2, 2)
			expect(scaled.startX).toBe(20)
			expect(scaled.startY).toBe(40)
			expect(scaled.endX).toBe(60)
			expect(scaled.endY).toBe(80)
			expect(scaled.anchorX).toBe(40)
			expect(scaled.anchorY).toBe(60)
		})

		it('handles non-uniform scaling', () => {
			const original = { startX: 10, startY: 20, endX: 30, endY: 40, anchorX: 20, anchorY: 30 }
			const scaled = scaleLineLocalPoints(original, 2, 0.5)
			expect(scaled.startX).toBe(20)
			expect(scaled.startY).toBe(10)
			expect(scaled.endX).toBe(60)
			expect(scaled.endY).toBe(20)
		})

		it('handles non-finite scale values', () => {
			const original = { startX: 10, startY: 20, endX: 30, endY: 40, anchorX: 20, anchorY: 30 }
			const scaled = scaleLineLocalPoints(original, NaN, Infinity)
			expect(scaled.startX).toBe(10)
			expect(scaled.startY).toBe(20)
		})
	})

	describe('suggestLineAnchorLocal', () => {
		it('suggests anchor for horizontal line', () => {
			const result = suggestLineAnchorLocal({
				startX: -40,
				startY: 0,
				endX: 40,
				endY: 0,
				width: 100,
				height: 50
			})
			expect(result.anchorX).toBe(0)
			expect(result.anchorY).toBeDefined()
		})

		it('suggests anchor for vertical line', () => {
			const result = suggestLineAnchorLocal({
				startX: 0,
				startY: -25,
				endX: 0,
				endY: 25,
				width: 100,
				height: 50
			})
			expect(result.anchorX).toBeDefined()
			expect(result.anchorY).toBe(0)
		})

		it('handles zero-length line', () => {
			const result = suggestLineAnchorLocal({
				startX: 0,
				startY: 0,
				endX: 0,
				endY: 0,
				width: 100,
				height: 50
			})
			expect(result.anchorX).toBe(0)
			expect(result.anchorY).toBe(0)
		})
	})

	describe('lineControlPointsWorld', () => {
		it('transforms local points to world coordinates', () => {
			const center = { x: 100, y: 100 }
			const local = { startX: -50, startY: 0, endX: 50, endY: 0, anchorX: 0, anchorY: -30 }
			const world = lineControlPointsWorld(center, 0, local)
			expect(world.start).toEqual({ x: 50, y: 100 })
			expect(world.end).toEqual({ x: 150, y: 100 })
			expect(world.anchor).toEqual({ x: 100, y: 70 })
		})

		it('handles rotation', () => {
			const center = { x: 0, y: 0 }
			const local = { startX: 10, startY: 0, endX: 20, endY: 0, anchorX: 15, anchorY: 0 }
			const world = lineControlPointsWorld(center, Math.PI / 2, local)
			expect(world.start.x).toBeCloseTo(0)
			expect(world.start.y).toBeCloseTo(10)
		})
	})

	describe('worldToLocalRotated', () => {
		it('converts world point to local coordinates at origin', () => {
			const world = { x: 10, y: 10 }
			const center = { x: 0, y: 0 }
			const local = worldToLocalRotated(world, center, 0)
			expect(local).toEqual({ x: 10, y: 10 })
		})

		it('handles rotation', () => {
			const world = { x: 10, y: 0 }
			const center = { x: 0, y: 0 }
			const local = worldToLocalRotated(world, center, Math.PI / 2)
			expect(local.x).toBeCloseTo(0)
			expect(local.y).toBeCloseTo(-10)
		})

		it('handles offset center', () => {
			const world = { x: 110, y: 100 }
			const center = { x: 100, y: 100 }
			const local = worldToLocalRotated(world, center, 0)
			expect(local.x).toBeCloseTo(10)
			expect(local.y).toBeCloseTo(0)
		})
	})
})
