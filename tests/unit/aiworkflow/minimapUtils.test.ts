import { describe, it, expect } from 'vitest'
import {
	computeWorldBounds,
	computeMinimapScale,
	computeMinimapOffset,
	worldToMinimap,
	minimapToWorld,
	computeViewportInMinimap,
	computePanForWorldPoint,
	computeFitAllViewport,
	computeWheelZoomViewport,
	screenToWorld,
	worldToScreen,
	DEFAULT_WORLD_BOUNDS,
	MINIMAP_WIDTH,
	MINIMAP_HEIGHT,
	MINIMAP_PADDING
} from '@/views/AIWorkflow/blueprint-core/minimapUtils'

describe('minimapUtils', () => {
	describe('computeWorldBounds', () => {
		it('should return default bounds for empty nodes', () => {
			const bounds = computeWorldBounds([])
			expect(bounds).toEqual(DEFAULT_WORLD_BOUNDS)
		})

		it('should compute bounds for a single node centered at origin', () => {
			const nodes = [{ worldX: 0, worldY: 0, width: 200, height: 160 }]
			const bounds = computeWorldBounds(nodes)
			const padding = 120
			expect(bounds.x).toBe(-100 - padding)
			expect(bounds.y).toBe(-80 - padding)
			expect(bounds.width).toBe(200 + padding * 2)
			expect(bounds.height).toBe(160 + padding * 2)
		})

		it('should compute bounds for multiple nodes spread out', () => {
			const nodes = [
				{ worldX: 0, worldY: 0, width: 200, height: 160 },
				{ worldX: 500, worldY: 300, width: 200, height: 160 }
			]
			const bounds = computeWorldBounds(nodes)
			expect(bounds.x).toBeLessThanOrEqual(-100)
			expect(bounds.y).toBeLessThanOrEqual(-80)
			expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(600)
			expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(380)
		})

		it('should handle nodes with undefined position/size using defaults', () => {
			const nodes = [{}]
			const bounds = computeWorldBounds(nodes)
			const padding = 120
			expect(bounds.x).toBe(-100 - padding)
			expect(bounds.y).toBe(-80 - padding)
		})
	})

	describe('worldToMinimap / minimapToWorld round-trip', () => {
		const testBounds = { x: -500, y: -500, width: 1000, height: 1000 }
		const scale = computeMinimapScale(testBounds)
		const offset = computeMinimapOffset(testBounds, scale)

		it('should convert world origin to minimap position and back', () => {
			const mm = worldToMinimap(0, 0, testBounds, scale, offset)
			expect(mm.x).toBeGreaterThan(MINIMAP_PADDING)
			expect(mm.x).toBeLessThan(MINIMAP_WIDTH - MINIMAP_PADDING)
			expect(mm.y).toBeGreaterThan(MINIMAP_PADDING)
			expect(mm.y).toBeLessThan(MINIMAP_HEIGHT - MINIMAP_PADDING)

			const back = minimapToWorld(mm.x, mm.y, testBounds, scale, offset)
			expect(back.x).toBeCloseTo(0)
			expect(back.y).toBeCloseTo(0)
		})

		it('should round-trip arbitrary world coordinates', () => {
			const testPoints = [
				{ x: -200, y: -200 },
				{ x: 100, y: 300 },
				{ x: 400, y: -100 },
				{ x: -400, y: 400 }
			]
			for (const p of testPoints) {
				const mm = worldToMinimap(p.x, p.y, testBounds, scale, offset)
				const back = minimapToWorld(mm.x, mm.y, testBounds, scale, offset)
				expect(back.x).toBeCloseTo(p.x, 5)
				expect(back.y).toBeCloseTo(p.y, 5)
			}
		})

		it('should place world bounds origin at top-left of content area (with padding)', () => {
			const tl = worldToMinimap(testBounds.x, testBounds.y, testBounds, scale, offset)
			expect(tl.x).toBeCloseTo(offset.x)
			expect(tl.y).toBeCloseTo(offset.y)
		})

		it('should place world bounds bottom-right at bottom-right of content area', () => {
			const br = worldToMinimap(
				testBounds.x + testBounds.width,
				testBounds.y + testBounds.height,
				testBounds, scale, offset
			)
			expect(br.x).toBeCloseTo(offset.x + testBounds.width * scale)
			expect(br.y).toBeCloseTo(offset.y + testBounds.height * scale)
		})
	})

	describe('computePanForWorldPoint', () => {
		it('should produce pan values that center the world point on screen', () => {
			const canvasSize = { width: 800, height: 600 }
			const worldPoint = { x: 300, y: 200 }
			const zoom = 1.5
			const { panX, panY } = computePanForWorldPoint(worldPoint.x, worldPoint.y, zoom)

			const screen = worldToScreen(worldPoint.x, worldPoint.y, canvasSize, { zoom, panX, panY })
			expect(screen.x).toBeCloseTo(canvasSize.width / 2)
			expect(screen.y).toBeCloseTo(canvasSize.height / 2)
		})

		it('should produce panX = -worldX * zoom, panY = -worldY * zoom', () => {
			const result = computePanForWorldPoint(100, 200, 2)
			expect(result.panX).toBe(-200)
			expect(result.panY).toBe(-400)
		})

		it('should handle origin (0,0) with zero pan', () => {
			const result = computePanForWorldPoint(0, 0, 1)
			expect(result.panX).toBeCloseTo(0)
			expect(result.panY).toBeCloseTo(0)
		})
	})

	describe('computeFitAllViewport', () => {
		const canvasSize = { width: 1920, height: 1080 }

		it('should return default viewport for empty nodes', () => {
			const result = computeFitAllViewport([], canvasSize)
			expect(result.zoom).toBe(1)
			expect(result.panX).toBe(0)
			expect(result.panY).toBe(0)
		})

		it('should center a single node at origin with zoom in range', () => {
			const nodes = [{ worldX: 0, worldY: 0, width: 400, height: 300 }]
			const result = computeFitAllViewport(nodes, canvasSize)
			expect(result.zoom).toBeGreaterThan(0.2)
			expect(result.zoom).toBeLessThanOrEqual(6)

			const centerScreen = worldToScreen(0, 0, canvasSize, result)
			expect(centerScreen.x).toBeCloseTo(canvasSize.width / 2, 0)
			expect(centerScreen.y).toBeCloseTo(canvasSize.height / 2, 0)
		})

		it('should center nodes at non-zero world position', () => {
			const nodes = [{ worldX: 500, worldY: -300, width: 200, height: 200 }]
			const result = computeFitAllViewport(nodes, canvasSize)

			const centerScreen = worldToScreen(500, -300, canvasSize, result)
			expect(centerScreen.x).toBeCloseTo(canvasSize.width / 2, 0)
			expect(centerScreen.y).toBeCloseTo(canvasSize.height / 2, 0)
		})
	})

	describe('computeWheelZoomViewport', () => {
		const canvasSize = { width: 1920, height: 1080 }
		const testBounds = { x: -1000, y: -1000, width: 2000, height: 2000 }
		const scale = computeMinimapScale(testBounds)
		const offset = computeMinimapOffset(testBounds, scale)

		it('should zoom in (deltaY < 0) and move anchor world point to screen center', () => {
			const initialViewport = { zoom: 1, panX: 0, panY: 0 }
			const anchorWorld = { x: 0, y: 0 }
			const anchorMinimap = worldToMinimap(anchorWorld.x, anchorWorld.y, testBounds, scale, offset)

			const result = computeWheelZoomViewport(
				initialViewport, canvasSize,
				anchorMinimap.x, anchorMinimap.y,
				testBounds, scale, offset,
				-100
			)

			expect(result.zoom).toBeGreaterThan(1)

			const anchorAfterScreen = worldToScreen(anchorWorld.x, anchorWorld.y, canvasSize, result)
			expect(anchorAfterScreen.x).toBeCloseTo(canvasSize.width / 2, 0)
			expect(anchorAfterScreen.y).toBeCloseTo(canvasSize.height / 2, 0)
		})

		it('should zoom out (deltaY > 0) and move anchor world point to screen center', () => {
			const initialViewport = { zoom: 2, panX: -600, panY: 400 }
			const anchorWorld = { x: 300, y: -200 }
			const anchorMinimap = worldToMinimap(anchorWorld.x, anchorWorld.y, testBounds, scale, offset)

			const result = computeWheelZoomViewport(
				initialViewport, canvasSize,
				anchorMinimap.x, anchorMinimap.y,
				testBounds, scale, offset,
				100
			)

			expect(result.zoom).toBeLessThan(2)
			expect(result.zoom).toBeGreaterThanOrEqual(0.2)

			const anchorAfterScreen = worldToScreen(anchorWorld.x, anchorWorld.y, canvasSize, result)
			expect(anchorAfterScreen.x).toBeCloseTo(canvasSize.width / 2, 0)
			expect(anchorAfterScreen.y).toBeCloseTo(canvasSize.height / 2, 0)
		})

		it('should clamp zoom to [0.2, 6] range', () => {
			const farInViewport = { zoom: 5.8, panX: 0, panY: 0 }
			const anchorMinimap = worldToMinimap(0, 0, testBounds, scale, offset)
			const resultIn = computeWheelZoomViewport(
				farInViewport, canvasSize, anchorMinimap.x, anchorMinimap.y,
				testBounds, scale, offset, -1000
			)
			expect(resultIn.zoom).toBeLessThanOrEqual(6)

			const farOutViewport = { zoom: 0.25, panX: 0, panY: 0 }
			const resultOut = computeWheelZoomViewport(
				farOutViewport, canvasSize, anchorMinimap.x, anchorMinimap.y,
				testBounds, scale, offset, 1000
			)
			expect(resultOut.zoom).toBeGreaterThanOrEqual(0.2)
		})

		it('should NOT drift viewport to top-left when zooming from center (the reported bug)', () => {
			const canvasSize2 = { width: 800, height: 600 }
			const initialViewport = { zoom: 1, panX: 0, panY: 0 }

			const centerMM = worldToMinimap(0, 0, testBounds, scale, offset)

			let viewport = { ...initialViewport }
			for (let i = 0; i < 5; i++) {
				viewport = computeWheelZoomViewport(
					viewport, canvasSize2,
					centerMM.x, centerMM.y,
					testBounds, scale, offset,
					-100
				)
			}

			const originOnScreen = worldToScreen(0, 0, canvasSize2, viewport)
			expect(originOnScreen.x).toBeCloseTo(canvasSize2.width / 2, 0)
			expect(originOnScreen.y).toBeCloseTo(canvasSize2.height / 2, 0)
		})
	})

	describe('screenToWorld / worldToScreen consistency', () => {
		const canvasSize = { width: 800, height: 600 }

		it('should round-trip screen coordinates through world', () => {
			const viewport = { zoom: 1.5, panX: -150, panY: 75 }
			const screenPoints = [
				{ x: 400, y: 300 },
				{ x: 100, y: 100 },
				{ x: 700, y: 500 },
				{ x: 0, y: 0 }
			]
			for (const sp of screenPoints) {
				const wp = screenToWorld(sp.x, sp.y, canvasSize, viewport)
				const back = worldToScreen(wp.x, wp.y, canvasSize, viewport)
				expect(back.x).toBeCloseTo(sp.x, 5)
				expect(back.y).toBeCloseTo(sp.y, 5)
			}
		})

		it('should place world center at screen center when pan is zero and zoom is 1', () => {
			const viewport = { zoom: 1, panX: 0, panY: 0 }
			const screen = worldToScreen(0, 0, canvasSize, viewport)
			expect(screen.x).toBe(canvasSize.width / 2)
			expect(screen.y).toBe(canvasSize.height / 2)
		})
	})

	describe('computeViewportInMinimap', () => {
		const testBounds = { x: -1000, y: -1000, width: 2000, height: 2000 }
		const scale = computeMinimapScale(testBounds)
		const offset = computeMinimapOffset(testBounds, scale)
		const canvasSize = { width: 800, height: 600 }

		it('should center viewport rect on world origin when pan=0, zoom=1', () => {
			const viewport = { zoom: 1, panX: 0, panY: 0 }
			const rect = computeViewportInMinimap(viewport, canvasSize, testBounds, scale, offset)
			const centerMM = worldToMinimap(0, 0, testBounds, scale, offset)
			expect(rect.x + rect.width / 2).toBeCloseTo(centerMM.x, 5)
			expect(rect.y + rect.height / 2).toBeCloseTo(centerMM.y, 5)
		})

		it('should produce positive width/height', () => {
			const viewport = { zoom: 0.5, panX: 200, panY: -100 }
			const rect = computeViewportInMinimap(viewport, canvasSize, testBounds, scale, offset)
			expect(rect.width).toBeGreaterThan(0)
			expect(rect.height).toBeGreaterThan(0)
		})
	})
})
