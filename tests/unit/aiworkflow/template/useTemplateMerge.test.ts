import { describe, it, expect } from 'vitest'
import type { WorkflowNode } from '@/aiworkflow/types'
import {
	calculateNodeBounds,
	getViewportCenterInWorld,
	calculateTemplatePlacement,
	type NodeBounds,
	type PlacementResult
} from '@/aiworkflow/template/useTemplateMerge'

const makeMockNode = (overrides: Partial<WorkflowNode> = {}): WorkflowNode =>
	({
		id: 'test-node',
		type: 'text',
		title: 'Test Node',
		subtitle: '',
		worldX: 0,
		worldY: 0,
		width: 240,
		height: 160,
		sizeCustomized: false,
		inputs: [],
		outputs: [],
		createdAt: Date.now(),
		...overrides
	}) as WorkflowNode

describe('calculateNodeBounds', () => {
	it('should return null for empty node list', () => {
		const result = calculateNodeBounds([], {})
		expect(result).toBeNull()
	})

	it('should correctly calculate bounds for a single node (worldX/worldY is center)', () => {
		const node = makeMockNode({ id: 'n1', worldX: 100, worldY: 200, width: 240, height: 160 })
		const result = calculateNodeBounds(['n1'], { n1: node })
		expect(result).not.toBeNull()
		expect(result!.minX).toBe(100 - 120)
		expect(result!.maxX).toBe(100 + 120)
		expect(result!.minY).toBe(200 - 80)
		expect(result!.maxY).toBe(200 + 80)
		expect(result!.width).toBe(240)
		expect(result!.height).toBe(160)
		expect(result!.centerX).toBe(100)
		expect(result!.centerY).toBe(200)
	})

	it('should correctly calculate bounds for multiple nodes', () => {
		const node1 = makeMockNode({ id: 'n1', worldX: 0, worldY: 0, width: 200, height: 100 })
		const node2 = makeMockNode({ id: 'n2', worldX: 500, worldY: 300, width: 300, height: 200 })
		const result = calculateNodeBounds(['n1', 'n2'], { n1: node1, n2: node2 })
		expect(result).not.toBeNull()
		expect(result!.minX).toBe(-100)
		expect(result!.maxX).toBe(650)
		expect(result!.minY).toBe(-50)
		expect(result!.maxY).toBe(400)
		expect(result!.width).toBe(750)
		expect(result!.height).toBe(450)
		expect(result!.centerX).toBe(275)
		expect(result!.centerY).toBe(175)
	})

	it('should handle nodes with default size (0/falsy values fallback to 240/160)', () => {
		const node = makeMockNode({
			id: 'n1',
			worldX: 50,
			worldY: 50,
			width: 0 as any,
			height: 0 as any
		})
		const result = calculateNodeBounds(['n1'], { n1: node })
		expect(result).not.toBeNull()
		expect(result!.minX).toBe(50 - 120)
		expect(result!.maxX).toBe(50 + 120)
		expect(result!.minY).toBe(50 - 80)
		expect(result!.maxY).toBe(50 + 80)
	})

	it('should ignore non-existent node IDs', () => {
		const node = makeMockNode({ id: 'n1', worldX: 100, worldY: 100, width: 200, height: 100 })
		const result = calculateNodeBounds(['n1', 'nonexistent'], { n1: node })
		expect(result).not.toBeNull()
		expect(result!.centerX).toBe(100)
		expect(result!.centerY).toBe(100)
	})
})

describe('getViewportCenterInWorld', () => {
	it('should return (0, 0) when pan is (0, 0) and zoom is 1', () => {
		const result = getViewportCenterInWorld({ zoom: 1, panX: 0, panY: 0 }, 1920, 1080)
		expect(result.x).toBeCloseTo(0)
		expect(result.y).toBeCloseTo(0)
	})

	it('should correctly calculate world center from pan and zoom (negative panX means positive world center)', () => {
		const result = getViewportCenterInWorld({ zoom: 1, panX: -100, panY: -200 }, 1920, 1080)
		expect(result.x).toBe(100)
		expect(result.y).toBe(200)
	})

	it('should scale with zoom level', () => {
		const result = getViewportCenterInWorld({ zoom: 2, panX: -200, panY: -400 }, 1920, 1080)
		expect(result.x).toBe(100)
		expect(result.y).toBe(200)
	})

	it('should NOT include canvas dimensions in the calculation', () => {
		const result1 = getViewportCenterInWorld({ zoom: 1, panX: -100, panY: -100 }, 1920, 1080)
		const result2 = getViewportCenterInWorld({ zoom: 1, panX: -100, panY: -100 }, 800, 600)
		expect(result1.x).toBe(result2.x)
		expect(result1.y).toBe(result2.y)
	})

	it('positive panX should give negative world center', () => {
		const result = getViewportCenterInWorld({ zoom: 1, panX: 50, panY: 75 }, 1000, 800)
		expect(result.x).toBe(-50)
		expect(result.y).toBe(-75)
	})
})

describe('calculateTemplatePlacement', () => {
	const canvasSize = { width: 1920, height: 1080 }
	const defaultViewport = { zoom: 1, panX: 0, panY: 0 }

	const makeTemplateBounds = (
		centerX: number,
		centerY: number,
		w: number,
		h: number
	): NodeBounds => ({
		minX: centerX - w / 2,
		minY: centerY - h / 2,
		maxX: centerX + w / 2,
		maxY: centerY + h / 2,
		width: w,
		height: h,
		centerX,
		centerY
	})

	it('should return pan values that center the template at viewport center when no overlap and template fits', () => {
		const templateBounds = makeTemplateBounds(0, 0, 400, 300)
		const result: PlacementResult = calculateTemplatePlacement(
			templateBounds,
			defaultViewport,
			canvasSize,
			[]
		)
		expect(result.needsZoomOut).toBe(false)
		expect(result.needsPan).toBe(false)
		expect(result.targetPanX).toBeCloseTo(0)
		expect(result.targetPanY).toBeCloseTo(0)
		expect(result.offsetX).toBeCloseTo(0)
		expect(result.offsetY).toBeCloseTo(0)
	})

	it('should correctly compute targetPanX = -centerX * targetZoom for centering', () => {
		const templateBounds = makeTemplateBounds(0, 0, 400, 300)
		const viewport = { zoom: 2, panX: -200, panY: -100 }
		const result = calculateTemplatePlacement(templateBounds, viewport, canvasSize, [])
		expect(result.targetPanX).toBeCloseTo(-result.boundsAfterPlacement.centerX * result.targetZoom)
		expect(result.targetPanY).toBeCloseTo(-result.boundsAfterPlacement.centerY * result.targetZoom)
	})

	it('should zoom out when template is larger than visible area', () => {
		const templateBounds = makeTemplateBounds(0, 0, 3000, 2000)
		const result = calculateTemplatePlacement(templateBounds, defaultViewport, canvasSize, [])
		expect(result.needsZoomOut).toBe(true)
		expect(result.targetZoom).toBeLessThan(1)
		expect(result.targetPanX).toBeCloseTo(-result.boundsAfterPlacement.centerX * result.targetZoom)
		expect(result.targetPanY).toBeCloseTo(-result.boundsAfterPlacement.centerY * result.targetZoom)
		expect(result.boundsAfterPlacement.width).toBe(3000)
		expect(result.boundsAfterPlacement.height).toBe(2000)
	})

	it('should place template at viewport center when viewport is panned', () => {
		const templateBounds = makeTemplateBounds(0, 0, 400, 300)
		const viewport = { zoom: 1, panX: -500, panY: -300 }
		const result = calculateTemplatePlacement(templateBounds, viewport, canvasSize, [])
		expect(result.boundsAfterPlacement.centerX).toBeCloseTo(500)
		expect(result.boundsAfterPlacement.centerY).toBeCloseTo(300)
		expect(result.targetPanX).toBeCloseTo(-500)
		expect(result.targetPanY).toBeCloseTo(-300)
	})

	it('should offset template to avoid overlap with existing nodes', () => {
		const existingNode = makeMockNode({
			id: 'existing',
			worldX: 0,
			worldY: 0,
			width: 400,
			height: 300
		})
		const templateBounds = makeTemplateBounds(0, 0, 200, 150)
		const result = calculateTemplatePlacement(templateBounds, defaultViewport, canvasSize, [
			existingNode
		])
		expect(result.boundsAfterPlacement.centerX).not.toBe(0)
		expect(result.needsPan).toBe(true)
	})

	it('should not need pan when template center is already at viewport center within threshold', () => {
		const templateBounds = makeTemplateBounds(5, 5, 200, 150)
		const viewport = { zoom: 1, panX: -5, panY: -5 }
		const result = calculateTemplatePlacement(templateBounds, viewport, canvasSize, [])
		expect(result.needsPan).toBe(false)
		expect(result.targetPanX).toBeCloseTo(-5)
		expect(result.targetPanY).toBeCloseTo(-5)
	})

	it('should place template at viewport center even when viewport is already panned (no pan needed)', () => {
		const templateBounds = makeTemplateBounds(0, 0, 200, 150)
		const viewport = { zoom: 1, panX: -500, panY: -300 }
		const result = calculateTemplatePlacement(templateBounds, viewport, canvasSize, [])
		expect(result.boundsAfterPlacement.centerX).toBe(500)
		expect(result.boundsAfterPlacement.centerY).toBe(300)
		expect(result.targetPanX).toBeCloseTo(-500)
		expect(result.targetPanY).toBeCloseTo(-300)
		expect(result.needsPan).toBe(false)
	})

	it('should trigger pan when zooming out changes the required pan offset', () => {
		const templateBounds = makeTemplateBounds(0, 0, 3000, 2000)
		const viewport = { zoom: 1, panX: -100, panY: -50 }
		const result = calculateTemplatePlacement(templateBounds, viewport, canvasSize, [])
		expect(result.needsZoomOut).toBe(true)
		expect(result.targetZoom).toBeLessThan(1)
		expect(result.needsPan).toBe(true)
		expect(result.targetPanX).toBeCloseTo(-result.boundsAfterPlacement.centerX * result.targetZoom)
	})
})
