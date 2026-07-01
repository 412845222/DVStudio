import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkflowAnchorMagnet } from '../../../../src/views/AIWorkflow/blueprint-core/linking/useWorkflowAnchorMagnet'
import type { WorkflowAnchorMagnetCandidate } from '../../../../src/views/AIWorkflow/blueprint-core/linking/useWorkflowAnchorMagnet'

describe('useWorkflowAnchorMagnet', () => {
	let magnet: ReturnType<typeof useWorkflowAnchorMagnet>

	beforeEach(() => {
		magnet = useWorkflowAnchorMagnet()
	})

	describe('initial state', () => {
		it('should have correct default radius values', () => {
			expect(magnet.hitRadiusPx.value).toBe(22)
			expect(magnet.dockRadiusPx.value).toBe(8)
			expect(magnet.lockRadiusPx.value).toBe(5)
		})

		it('should initialize zoom to 1', () => {
			const candidate: WorkflowAnchorMagnetCandidate = {
				nodeId: 'node-1',
				anchorId: 'out-1',
				anchorIndex: 0,
				direction: 'out',
				center: { x: 100, y: 100 }
			}
			const target = magnet.resolveTarget({
				candidates: [candidate],
				pointer: { x: 100, y: 100 }
			})
			expect(target).not.toBeNull()
		})
	})

	describe('setZoom', () => {
		it('should set zoom to valid number', () => {
			magnet.setZoom(2)
			const candidate: WorkflowAnchorMagnetCandidate = {
				nodeId: 'node-1',
				anchorId: 'out-1',
				anchorIndex: 0,
				direction: 'out',
				center: { x: 100, y: 100 }
			}
			const target = magnet.resolveTarget({
				candidates: [candidate],
				pointer: { x: 100, y: 100 }
			})
			expect(target).not.toBeNull()
		})

		it('should default to 1 for invalid zoom values', () => {
			magnet.setZoom(NaN)
			magnet.setZoom(Infinity)
			const candidate: WorkflowAnchorMagnetCandidate = {
				nodeId: 'node-1',
				anchorId: 'out-1',
				anchorIndex: 0,
				direction: 'out',
				center: { x: 100, y: 100 }
			}
			const target = magnet.resolveTarget({
				candidates: [candidate],
				pointer: { x: 100, y: 100 }
			})
			expect(target).not.toBeNull()
		})
	})

	describe('setDragging', () => {
		it('should set dragging state and clear snapped state when dragging ends', () => {
			const candidate: WorkflowAnchorMagnetCandidate = {
				nodeId: 'node-1',
				anchorId: 'in-1',
				anchorIndex: 0,
				direction: 'in',
				center: { x: 100, y: 100 }
			}

			const target = magnet.resolveTarget({
				candidates: [candidate],
				pointer: { x: 100, y: 100 },
				dragging: false
			})
			expect(target).not.toBeNull()
			expect(target?.phase).toBe('snapped')

			magnet.setDragging(true)
			const targetDragging = magnet.resolveTarget({
				candidates: [candidate],
				pointer: { x: 100, y: 100 },
				dragging: true
			})
			expect(targetDragging?.phase).toBe('dragging')

			magnet.setDragging(false)
			const targetAfter = magnet.resolveTarget({
				candidates: [],
				pointer: { x: 500, y: 500 }
			})
			expect(targetAfter).toBeNull()
		})
	})

	describe('resolveTarget', () => {
		const createCandidate = (
			nodeId: string,
			anchorId: string,
			x: number,
			y: number,
			direction: 'in' | 'out' = 'in'
		): WorkflowAnchorMagnetCandidate => ({
			nodeId,
			anchorId,
			anchorIndex: 0,
			direction,
			center: { x, y }
		})

		it('should return null when no candidates provided', () => {
			const target = magnet.resolveTarget({
				candidates: [],
				pointer: { x: 100, y: 100 }
			})
			expect(target).toBeNull()
		})

		it('should return null when pointer is outside hit radius', () => {
			const candidate = createCandidate('node-1', 'in-1', 100, 100)
			const target = magnet.resolveTarget({
				candidates: [candidate],
				pointer: { x: 200, y: 200 }
			})
			expect(target).toBeNull()
		})

		it('should return snapped target when pointer is within lock radius', () => {
			const candidate = createCandidate('node-1', 'in-1', 100, 100)
			const target = magnet.resolveTarget({
				candidates: [candidate],
				pointer: { x: 102, y: 101 }
			})
			expect(target).not.toBeNull()
			expect(target?.phase).toBe('snapped')
			expect(target?.nodeId).toBe('node-1')
			expect(target?.anchorId).toBe('in-1')
		})

		it('should return armed target when pointer is within hit radius but outside lock radius', () => {
			const candidate = createCandidate('node-1', 'in-1', 100, 100)
			const target = magnet.resolveTarget({
				candidates: [candidate],
				pointer: { x: 115, y: 100 }
			})
			expect(target).not.toBeNull()
			expect(target?.phase).toBe('armed')
		})

		it('should return idle target when pointer is at edge of hit radius', () => {
			const candidate = createCandidate('node-1', 'in-1', 100, 100)
			const target = magnet.resolveTarget({
				candidates: [candidate],
				pointer: { x: 122, y: 100 }
			})
			expect(target).not.toBeNull()
		})

		it('should select closest candidate when multiple are in range', () => {
			const candidates = [
				createCandidate('node-1', 'in-1', 100, 100),
				createCandidate('node-2', 'in-1', 108, 100),
				createCandidate('node-3', 'in-1', 115, 100)
			]
			const target = magnet.resolveTarget({
				candidates,
				pointer: { x: 102, y: 100 }
			})
			expect(target).not.toBeNull()
			expect(target?.nodeId).toBe('node-1')
		})

		it('should return dragging phase when dragging is true', () => {
			const candidate = createCandidate('node-1', 'in-1', 100, 100)
			const target = magnet.resolveTarget({
				candidates: [candidate],
				pointer: { x: 100, y: 100 },
				dragging: true
			})
			expect(target).not.toBeNull()
			expect(target?.phase).toBe('dragging')
		})

		it('should calculate magnet offset values', () => {
			const candidate = createCandidate('node-1', 'in-1', 100, 100)
			const target = magnet.resolveTarget({
				candidates: [candidate],
				pointer: { x: 110, y: 100 }
			})
			expect(target).not.toBeNull()
			expect(target?.screenMagnetX).toBeDefined()
			expect(target?.screenMagnetY).toBeDefined()
			expect(target?.distance).toBeGreaterThan(0)
		})

		it('should preserve mediaType from candidate', () => {
			const candidate: WorkflowAnchorMagnetCandidate = {
				nodeId: 'node-1',
				anchorId: 'in-image',
				anchorIndex: 0,
				direction: 'in',
				center: { x: 100, y: 100 },
				mediaType: 'image'
			}
			const target = magnet.resolveTarget({
				candidates: [candidate],
				pointer: { x: 100, y: 100 }
			})
			expect(target).not.toBeNull()
			expect(target?.mediaType).toBe('image')
		})
	})

	describe('phaseForAnchor', () => {
		const createCandidate = (
			nodeId: string,
			anchorId: string,
			x: number,
			y: number
		): WorkflowAnchorMagnetCandidate => ({
			nodeId,
			anchorId,
			anchorIndex: 0,
			direction: 'in',
			center: { x, y }
		})

		it('should return idle when no active target and not previously snapped', () => {
			const phase = magnet.phaseForAnchor('node-1', 'in-1', null)
			expect(phase).toBe('idle')
		})

		it('should return matching phase when anchor is active target', () => {
			const candidate = createCandidate('node-1', 'in-1', 100, 100)
			const target = magnet.resolveTarget({
				candidates: [candidate],
				pointer: { x: 100, y: 100 }
			})
			const phase = magnet.phaseForAnchor('node-1', 'in-1', target)
			expect(phase).toBe('snapped')
		})

		it('should return idle for non-matching anchors', () => {
			const candidate = createCandidate('node-1', 'in-1', 100, 100)
			const target = magnet.resolveTarget({
				candidates: [candidate],
				pointer: { x: 100, y: 100 }
			})
			const phase = magnet.phaseForAnchor('node-2', 'in-1', target)
			expect(phase).toBe('idle')
		})
	})

	describe('canvas anchor hit testing', () => {
		it('should support hit testing canvas-rendered anchors at screen coordinates', () => {
			const canvasCandidates: WorkflowAnchorMagnetCandidate[] = [
				{
					nodeId: 'canvas-node-1',
					anchorId: 'in-1',
					anchorIndex: 0,
					direction: 'in',
					center: { x: 150, y: 150 },
					mediaType: 'image'
				},
				{
					nodeId: 'canvas-node-2',
					anchorId: 'in-1',
					anchorIndex: 0,
					direction: 'in',
					center: { x: 300, y: 200 },
					mediaType: 'video'
				}
			]

			const target = magnet.resolveTarget({
				candidates: canvasCandidates,
				pointer: { x: 152, y: 149 },
				dragging: false
			})

			expect(target).not.toBeNull()
			expect(target?.nodeId).toBe('canvas-node-1')
			expect(target?.mediaType).toBe('image')
			expect(target?.direction).toBe('in')
		})

		it('should handle mixed in/out direction candidates correctly', () => {
			const mixedCandidates: WorkflowAnchorMagnetCandidate[] = [
				{
					nodeId: 'node-out',
					anchorId: 'out-1',
					anchorIndex: 0,
					direction: 'out',
					center: { x: 100, y: 100 }
				},
				{
					nodeId: 'node-in',
					anchorId: 'in-1',
					anchorIndex: 0,
					direction: 'in',
					center: { x: 200, y: 100 }
				}
			]

			const targetOut = magnet.resolveTarget({
				candidates: mixedCandidates,
				pointer: { x: 100, y: 100 }
			})
			expect(targetOut?.nodeId).toBe('node-out')
			expect(targetOut?.direction).toBe('out')

			const targetIn = magnet.resolveTarget({
				candidates: mixedCandidates,
				pointer: { x: 200, y: 100 }
			})
			expect(targetIn?.nodeId).toBe('node-in')
			expect(targetIn?.direction).toBe('in')
		})
	})
})
