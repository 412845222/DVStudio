import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CanvasNodeRenderer } from '@/views/AIWorkflow/node-screenshot/canvasNodeRenderer'
import type { VisibleNodeEntry, ScreenshotPoolProvider } from '@/views/AIWorkflow/node-screenshot/canvasNodeRenderer'

const createMockCtx = () => ({
	clearRect: vi.fn(),
	drawImage: vi.fn(),
	fillRect: vi.fn(),
	strokeRect: vi.fn(),
	beginPath: vi.fn(),
	moveTo: vi.fn(),
	lineTo: vi.fn(),
	quadraticCurveTo: vi.fn(),
	closePath: vi.fn(),
	fill: vi.fn(),
	stroke: vi.fn(),
	save: vi.fn(),
	restore: vi.fn(),
	setTransform: vi.fn(),
	clip: vi.fn(),
	rect: vi.fn(),
	fillStyle: '',
	strokeStyle: '',
	lineWidth: 0,
	globalAlpha: 1,
	canvas: { width: 800, height: 600 }
})

const createMockCanvas = (ctx: ReturnType<typeof createMockCtx>) => {
	const canvas = document.createElement('canvas')
	canvas.width = 800
	canvas.height = 600
	vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
		width: 800,
		height: 600,
		left: 0,
		top: 0,
		right: 800,
		bottom: 600,
		x: 0,
		y: 0,
		toJSON: () => ({})
	} as DOMRect)
	vi.spyOn(canvas, 'getContext').mockImplementation((type: string) => {
		if (type === '2d') return ctx as unknown as CanvasRenderingContext2D
		return null
	})
	return canvas
}

const createMockPoolProvider = (entries: Map<string, { bitmap: any; width: number; height: number }> = new Map()): ScreenshotPoolProvider => {
	return () => ({
		getEntry: (nodeId: string) => entries.get(nodeId) || null
	})
}

const createMockNode = (id: string, worldX: number, worldY: number, width = 200, height = 160): VisibleNodeEntry => ({
	id,
	worldX,
	worldY,
	width,
	height
})

describe('CanvasNodeRenderer', () => {
	let ctx: ReturnType<typeof createMockCtx>

	beforeEach(() => {
		ctx = createMockCtx()
		vi.clearAllMocks()
	})

	describe('constructor', () => {
		it('should initialize with default DPR', () => {
			const canvas = createMockCanvas(ctx)
			const poolProvider = createMockPoolProvider()
			const renderer = new CanvasNodeRenderer(canvas, poolProvider)
			expect(renderer).toBeDefined()
		})
	})

	describe('setLowQualityMode', () => {
		it('should set low quality mode to true when enabled', () => {
			const canvas = createMockCanvas(ctx)
			const poolProvider = createMockPoolProvider()
			const renderer = new CanvasNodeRenderer(canvas, poolProvider)

			renderer.setLowQualityMode(true)

			renderer.setViewport({ panX: 0, panY: 0, zoom: 0.3 })
			renderer.setNodes([createMockNode('node1', 0, 0)])
			renderer.render({ panX: 0, panY: 0, zoom: 0.3 })

			expect(ctx.clearRect).toHaveBeenCalled()
		})

		it('should set low quality mode to false when disabled', () => {
			const canvas = createMockCanvas(ctx)
			const poolProvider = createMockPoolProvider()
			const renderer = new CanvasNodeRenderer(canvas, poolProvider)

			renderer.setLowQualityMode(true)
			renderer.setLowQualityMode(false)

			renderer.setViewport({ panX: 0, panY: 0, zoom: 1 })
			renderer.setNodes([createMockNode('node1', 0, 0)])
			renderer.render({ panX: 0, panY: 0, zoom: 1 })

			expect(ctx.clearRect).toHaveBeenCalled()
		})

		it('should not trigger unnecessary updates when mode does not change', () => {
			const canvas = createMockCanvas(ctx)
			const poolProvider = createMockPoolProvider()
			const renderer = new CanvasNodeRenderer(canvas, poolProvider)
			const resizeSpy = vi.spyOn(renderer, 'resize' as any)

			renderer.setLowQualityMode(false)
			expect(resizeSpy).not.toHaveBeenCalled()

			renderer.setLowQualityMode(true)
			expect(resizeSpy).toHaveBeenCalledTimes(1)

			renderer.setLowQualityMode(true)
			expect(resizeSpy).toHaveBeenCalledTimes(1)
		})
	})

	describe('render with different zoom levels and quality modes', () => {
		it('should render full nodes at zoom >= 0.5 in normal mode', () => {
			const mockBitmap = document.createElement('canvas')
			mockBitmap.width = 200
			mockBitmap.height = 160
			const poolProvider = createMockPoolProvider(
				new Map([['node1', { bitmap: mockBitmap, width: 200, height: 160 }]])
			)
			const canvas = createMockCanvas(ctx)
			const renderer = new CanvasNodeRenderer(canvas, poolProvider)

			renderer.setLowQualityMode(false)
			renderer.setViewport({ panX: 0, panY: 0, zoom: 0.5 })
			renderer.setNodes([createMockNode('node1', 0, 0)])
			renderer.render({ panX: 0, panY: 0, zoom: 0.5 })

			expect(ctx.drawImage).toHaveBeenCalled()
		})

		it('should use placeholder rendering at zoom < 0.5 in low quality mode', () => {
			const mockBitmap = document.createElement('canvas')
			mockBitmap.width = 200
			mockBitmap.height = 160
			const poolProvider = createMockPoolProvider(
				new Map([['node1', { bitmap: mockBitmap, width: 200, height: 160 }]])
			)
			const canvas = createMockCanvas(ctx)
			const renderer = new CanvasNodeRenderer(canvas, poolProvider)

			renderer.setLowQualityMode(true)
			renderer.setViewport({ panX: 0, panY: 0, zoom: 0.3 })
			renderer.setNodes([createMockNode('node1', 0, 0)])
			renderer.render({ panX: 0, panY: 0, zoom: 0.3 })

			expect(ctx.fill).toHaveBeenCalled()
			expect(ctx.stroke).toHaveBeenCalled()
		})

		it('should render full nodes at zoom >= 0.5 even in low quality mode', () => {
			const mockBitmap = document.createElement('canvas')
			mockBitmap.width = 200
			mockBitmap.height = 160
			const poolProvider = createMockPoolProvider(
				new Map([['node1', { bitmap: mockBitmap, width: 200, height: 160 }]])
			)
			const canvas = createMockCanvas(ctx)
			const renderer = new CanvasNodeRenderer(canvas, poolProvider)

			renderer.setLowQualityMode(true)
			renderer.setViewport({ panX: 0, panY: 0, zoom: 0.5 })
			renderer.setNodes([createMockNode('node1', 0, 0)])
			renderer.render({ panX: 0, panY: 0, zoom: 0.5 })

			expect(ctx.drawImage).toHaveBeenCalled()
		})

		it('should draw placeholder for nodes without bitmap entry', () => {
			const poolProvider = createMockPoolProvider()
			const canvas = createMockCanvas(ctx)
			const renderer = new CanvasNodeRenderer(canvas, poolProvider)

			renderer.setLowQualityMode(false)
			renderer.setViewport({ panX: 0, panY: 0, zoom: 1 })
			renderer.setNodes([createMockNode('node1', 0, 0)])
			renderer.render({ panX: 0, panY: 0, zoom: 1 })

			expect(ctx.fill).toHaveBeenCalled()
			expect(ctx.stroke).toHaveBeenCalled()
		})
	})

	describe('viewport culling', () => {
		it('should skip nodes outside viewport bounds', () => {
			const mockBitmap = document.createElement('canvas')
			mockBitmap.width = 200
			mockBitmap.height = 160
			const poolProvider = createMockPoolProvider(
				new Map([
					['visible', { bitmap: mockBitmap, width: 200, height: 160 }],
					['outside', { bitmap: mockBitmap, width: 200, height: 160 }]
				])
			)
			const canvas = createMockCanvas(ctx)
			const renderer = new CanvasNodeRenderer(canvas, poolProvider)

			renderer.setLowQualityMode(false)
			renderer.setViewport({ panX: 0, panY: 0, zoom: 1 })
			renderer.setNodes([
				createMockNode('visible', 0, 0),
				createMockNode('outside', 5000, 5000)
			])

			const beforeCount = ctx.drawImage.mock.calls.length

			renderer.render({ panX: 0, panY: 0, zoom: 1 })

			const afterCount = ctx.drawImage.mock.calls.length
			expect(afterCount - beforeCount).toBeGreaterThanOrEqual(1)
		})
	})

	describe('setNodes', () => {
		it('should update current nodes', () => {
			const poolProvider = createMockPoolProvider()
			const canvas = createMockCanvas(ctx)
			const renderer = new CanvasNodeRenderer(canvas, poolProvider)

			renderer.setNodes([createMockNode('node1', 0, 0)])
			renderer.render({ panX: 0, panY: 0, zoom: 1 })

			expect(ctx.clearRect).toHaveBeenCalled()
		})
	})

	describe('setViewport', () => {
		it('should update current viewport', () => {
			const poolProvider = createMockPoolProvider()
			const canvas = createMockCanvas(ctx)
			const renderer = new CanvasNodeRenderer(canvas, poolProvider)

			renderer.setViewport({ panX: 100, panY: 200, zoom: 0.5 })
			renderer.setNodes([createMockNode('node1', 0, 0)])
			renderer.render({ panX: 100, panY: 200, zoom: 0.5 })

			expect(ctx.clearRect).toHaveBeenCalled()
		})
	})

	describe('hitTest', () => {
		it('should return null when no node is hit', () => {
			const poolProvider = createMockPoolProvider()
			const canvas = createMockCanvas(ctx)
			const renderer = new CanvasNodeRenderer(canvas, poolProvider)

			renderer.setViewport({ panX: 0, panY: 0, zoom: 1 })
			renderer.setNodes([createMockNode('node1', 100, 100, 200, 160)])
			renderer.render({ panX: 0, panY: 0, zoom: 1 })

			const result = renderer.hitTest(10, 10)
			expect(result.nodeId).toBeNull()
		})

		it('should return node id when node center is hit', () => {
			const poolProvider = createMockPoolProvider()
			const canvas = createMockCanvas(ctx)
			const renderer = new CanvasNodeRenderer(canvas, poolProvider)

			renderer.setViewport({ panX: 0, panY: 0, zoom: 1 })
			renderer.setNodes([createMockNode('node1', 0, 0, 200, 160)])
			renderer.render({ panX: 0, panY: 0, zoom: 1 })

			const result = renderer.hitTest(400, 300)
			expect(result.nodeId).toBe('node1')
		})
	})

	describe('markDirty', () => {
		it('should force a full render on next render call', () => {
			const poolProvider = createMockPoolProvider()
			const canvas = createMockCanvas(ctx)
			const renderer = new CanvasNodeRenderer(canvas, poolProvider)

			renderer.setViewport({ panX: 0, panY: 0, zoom: 1 })
			renderer.setNodes([createMockNode('node1', 0, 0)])
			renderer.render({ panX: 0, panY: 0, zoom: 1 })

			const clearRectCallsBefore = ctx.clearRect.mock.calls.length

			renderer.markDirty()

			const clearRectCallsAfter = ctx.clearRect.mock.calls.length
			expect(clearRectCallsAfter).toBeGreaterThan(clearRectCallsBefore)
		})
	})
})
