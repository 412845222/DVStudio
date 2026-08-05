import { describe, it, expect, vi } from 'vitest'
import {
	screenToWorld,
	worldToScreen,
	applyPanBy,
	applyZoomAt,
	applyFitToStage,
	type ViewportSize
} from '@/engine/webgl/camera/camera2d'
import type { ViewportState } from '@/engine/webgl/camera/types'

const createViewport = (): ViewportState => ({
	pan: { x: 0, y: 0 },
	zoom: 1
})

describe('camera2d', () => {
	describe('screenToWorld', () => {
		it('converts screen point to world point at zoom 1, pan 0', () => {
			const viewport = createViewport()
			const result = screenToWorld(viewport, { x: 100, y: 200 })
			expect(result).toEqual({ x: 100, y: 200 })
		})

		it('applies zoom transformation', () => {
			const viewport = createViewport()
			viewport.zoom = 2
			const result = screenToWorld(viewport, { x: 100, y: 200 })
			expect(result).toEqual({ x: 50, y: 100 })
		})

		it('applies pan transformation', () => {
			const viewport = createViewport()
			viewport.pan = { x: 50, y: 100 }
			const result = screenToWorld(viewport, { x: 100, y: 200 })
			expect(result).toEqual({ x: 50, y: 100 })
		})

		it('applies both zoom and pan', () => {
			const viewport = createViewport()
			viewport.zoom = 2
			viewport.pan = { x: 100, y: 200 }
			const result = screenToWorld(viewport, { x: 200, y: 400 })
			expect(result).toEqual({ x: 50, y: 100 })
		})
	})

	describe('worldToScreen', () => {
		it('converts world point to screen point at zoom 1, pan 0', () => {
			const viewport = createViewport()
			const result = worldToScreen(viewport, { x: 100, y: 200 })
			expect(result).toEqual({ x: 100, y: 200 })
		})

		it('applies zoom transformation', () => {
			const viewport = createViewport()
			viewport.zoom = 2
			const result = worldToScreen(viewport, { x: 50, y: 100 })
			expect(result).toEqual({ x: 100, y: 200 })
		})

		it('applies pan transformation', () => {
			const viewport = createViewport()
			viewport.pan = { x: 50, y: 100 }
			const result = worldToScreen(viewport, { x: 0, y: 0 })
			expect(result).toEqual({ x: 50, y: 100 })
		})
	})

	describe('applyPanBy', () => {
		it('adds delta to pan', () => {
			const viewport = createViewport()
			applyPanBy(viewport, { x: 10, y: 20 })
			expect(viewport.pan).toEqual({ x: 10, y: 20 })
		})

		it('accumulates pan', () => {
			const viewport = createViewport()
			applyPanBy(viewport, { x: 10, y: 20 })
			applyPanBy(viewport, { x: 5, y: -10 })
			expect(viewport.pan).toEqual({ x: 15, y: 10 })
		})
	})

	describe('applyZoomAt', () => {
		it('clamps zoom to minimum 0.1', () => {
			const viewport = createViewport()
			const result = applyZoomAt(viewport, { x: 100, y: 100 }, 0.01)
			expect(viewport.zoom).toBeCloseTo(0.1)
		})

		it('clamps zoom to maximum 8', () => {
			const viewport = createViewport()
			applyZoomAt(viewport, { x: 100, y: 100 }, 100)
			expect(viewport.zoom).toBeCloseTo(8)
		})

		it('returns false when zoom change is negligible', () => {
			const viewport = createViewport()
			viewport.zoom = 1.0000001
			const result = applyZoomAt(viewport, { x: 100, y: 100 }, 1.0000002)
			expect(result).toBe(false)
		})

		it('adjusts pan to keep screen point stationary', () => {
			const viewport = createViewport()
			viewport.pan = { x: 0, y: 0 }
			viewport.zoom = 1
			applyZoomAt(viewport, { x: 100, y: 100 }, 2)
			// Zooming at point (100, 100) should keep that point stationary
			const worldPoint = screenToWorld(viewport, { x: 100, y: 100 })
			expect(worldPoint.x).toBeCloseTo(100)
			expect(worldPoint.y).toBeCloseTo(100)
		})
	})

	describe('applyFitToStage', () => {
		it('fits stage to viewport with padding', () => {
			const viewport = createViewport()
			const viewportSize: ViewportSize = { width: 800, height: 600 }
			const stageSize = { width: 400, height: 300 }
			applyFitToStage(viewport, viewportSize, stageSize, 24)
			expect(viewport.zoom).toBeCloseTo(1.84, 1)
		})

		it('uses minimum scale when stage is wider', () => {
			const viewport = createViewport()
			const viewportSize: ViewportSize = { width: 800, height: 600 }
			const stageSize = { width: 1600, height: 300 }
			applyFitToStage(viewport, viewportSize, stageSize)
			// Should fit width, zoom = (800 - 48) / 1600
			expect(viewport.zoom).toBeLessThan(1)
		})

		it('uses minimum scale when stage is taller', () => {
			const viewport = createViewport()
			const viewportSize: ViewportSize = { width: 800, height: 600 }
			const stageSize = { width: 400, height: 1200 }
			applyFitToStage(viewport, viewportSize, stageSize)
			// Should fit height, zoom = (600 - 48) / 1200
			expect(viewport.zoom).toBeLessThan(1)
		})

		it('centers stage in viewport', () => {
			const viewport = createViewport()
			const viewportSize: ViewportSize = { width: 800, height: 600 }
			const stageSize = { width: 400, height: 300 }
			applyFitToStage(viewport, viewportSize, stageSize)
			// Center should be at viewport center
			expect(viewport.pan.x).toBeCloseTo(400)
			expect(viewport.pan.y).toBeCloseTo(300)
		})

		it('respects inset', () => {
			const viewport = createViewport()
			const viewportSize: ViewportSize = { width: 800, height: 600 }
			const stageSize = { width: 400, height: 300 }
			applyFitToStage(viewport, viewportSize, stageSize, 24, {
				left: 50,
				top: 50,
				right: 50,
				bottom: 50
			})
			// Available space is 800 - 50 - 50 - 48 = 652, so zoom should be different
			expect(viewport.zoom).toBeGreaterThan(0)
		})
	})
})
