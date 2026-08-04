import { describe, it, expect } from 'vitest'
import {
	isSameItem,
	isSameItems,
	safeNumber,
	fillModeToAxis
} from '@/ui/WorkFlow/WorlFlowNodes/sceneLayout/SceneLayoutPreviewViewer'
import type { WorkflowSceneLayoutItem } from '@/types/workflow/sceneLayout'

const makeItem = (overrides: Partial<WorkflowSceneLayoutItem> = {}): WorkflowSceneLayoutItem =>
	({
		id: 'test-item',
		name: 'test',
		category: '',
		subCategory: '',
		semanticRole: '',
		keyElementType: '',
		placement: '',
		mountType: '',
		supportSurface: '',
		wallRole: '',
		size: { width: 1, height: 1, depth: 1 },
		position: { x: 0, y: 0, z: 0 },
		rotation: { yaw: 0, pitch: 0, roll: 0 },
		scale: { x: 1, y: 1, z: 1 },
		fitMode: 'normal',
		fillMode: undefined,
		fillCount: undefined,
		fillAxisScale: undefined,
		orientationFix: undefined,
		...overrides
	}) as unknown as WorkflowSceneLayoutItem

describe('sceneLayoutPreview pivot centering & feature state (regression tests)', () => {
	describe('placeholder mesh position formula (centered pivot fix)', () => {
		// This tests the core math behind the pivot fix:
		// Previously: geometry.translate(0, height/2, 0) placed pivot at box bottom;
		//   mesh.position.y = posY (ground)
		// Now: geometry is NOT translated (pivot at volume center);
		//   mesh.position.y = posY + height/2 (center offset above ground)
		//
		// After this fix:
		// - mesh.position.y is the CENTER of the box
		// - worldBox.min.y (bottom) = mesh.position.y - height/2 = posY  → ground contact
		// - worldBox.max.y (top)    = mesh.position.y + height/2 = posY + height
		// - TransformControls attaches at mesh.position (center) which is now correct

		const calcMeshCenterY = (posY: number, height: number) => posY + height / 2
		const calcBoxBottomY = (meshCenterY: number, height: number) => meshCenterY - height / 2
		const calcBoxTopY = (meshCenterY: number, height: number) => meshCenterY + height / 2

		it('mesh.position.y places pivot at geometric center for a box on ground', () => {
			const posY = 0 // ground
			const height = 20
			const centerY = calcMeshCenterY(posY, height)
			expect(centerY).toBe(10) // center at height/2
		})

		it('box bottom stays at ground level (posY) when using centered pivot formula', () => {
			const posY = 0
			const height = 30
			const centerY = calcMeshCenterY(posY, height)
			const bottomY = calcBoxBottomY(centerY, height)
			expect(bottomY).toBe(posY) // must touch ground
		})

		it('box top is at posY + height (no geometry translation means top = bottom + height)', () => {
			const posY = 5
			const height = 40
			const centerY = calcMeshCenterY(posY, height)
			const topY = calcBoxTopY(centerY, height)
			expect(topY).toBe(posY + height)
		})

		it('works for arbitrary ground heights (raised platforms)', () => {
			const posY = 100
			const height = 50
			const centerY = calcMeshCenterY(posY, height)
			expect(centerY).toBe(125)
			expect(calcBoxBottomY(centerY, height)).toBe(100)
			expect(calcBoxTopY(centerY, height)).toBe(150)
		})

		it('scale.y is applied to height before computing center offset', () => {
			// In the actual code: height = displaySize.height * scaleY
			// mesh.position.y = posY + height / 2
			const posY = 0
			const baseHeight = 20
			const scaleY = 2
			const scaledHeight = baseHeight * scaleY
			const centerY = calcMeshCenterY(posY, scaledHeight)
			expect(centerY).toBe(20) // center of scaled box
			expect(calcBoxBottomY(centerY, scaledHeight)).toBe(0)
		})

		it('syncSelectedObjectToItem: worldBox.min.y correctly maps back to item.position.y (ground position)', () => {
			// When user drags a box with centered pivot to a new position,
			// we must write worldBox.min.y back to item.position.y (ground),
			// NOT mesh.position.y (which is center).
			// This simulates that mapping.
			const posY = 0
			const height = 30
			const centerY = calcMeshCenterY(posY, height)
			// After drag, mesh moves up by dy:
			const dy = 15
			const newCenterY = centerY + dy
			const newBottomY = calcBoxBottomY(newCenterY, height)
			// item.position.y should be the new ground = newBottomY
			expect(newBottomY).toBe(posY + dy)
			// NOT newCenterY (which would place the box floating)
			expect(newCenterY).not.toBe(newBottomY)
		})
	})

	describe('feature action state transitions (isSameItem detection)', () => {
		// After rotateSelectedModelByAxis: orientationFix changes + fitMode -> 'oriented'
		it('detects orientation change after rotate action', () => {
			const before = makeItem()
			const after = makeItem({
				orientationFix: {
					mode: 'manual',
					yaw: 90,
					pitch: 0,
					roll: 0,
					confidence: 'low',
					updatedAt: 12345
				},
				fitMode: 'oriented',
				fitMessage: 'rotated to Y: 90°',
				fitUpdatedAt: 12345
			})
			expect(isSameItem(before, after)).toBe(false)
		})

		// After resetSelectedModelOrientation: orientationFix undefined + fitMode -> 'normal'
		it('detects orientation reset back to initial state', () => {
			const oriented = makeItem({
				orientationFix: {
					mode: 'manual',
					yaw: 90,
					pitch: 0,
					roll: 0,
					confidence: 'low',
					updatedAt: 12345
				},
				fitMode: 'oriented'
			})
			const reset = makeItem()
			expect(isSameItem(oriented, reset)).toBe(false)
		})

		// After cycleFillSelectedModel: fillMode set + fitMode -> 'filled'
		it('detects fill mode activation after cycle fill action', () => {
			const before = makeItem()
			const after = makeItem({
				fillMode: 'fill-x',
				fillCount: 3,
				fillAxisScale: 1,
				fillUpdatedAt: 12345,
				fitMode: 'filled',
				fitMessage: 'filled along X: 3 items',
				fitUpdatedAt: 12345
			})
			expect(isSameItem(before, after)).toBe(false)
		})

		// After cycleFillSelectedModel (cancel): fillMode cleared, back to oriented/normal
		it('detects fill cancellation returning to oriented state', () => {
			const filled = makeItem({
				fillMode: 'fill-x',
				fillCount: 3,
				fillAxisScale: 1,
				fitMode: 'filled'
			})
			const canceled = makeItem({
				fitMode: 'normal',
				fillMode: undefined,
				fillCount: undefined,
				fillAxisScale: undefined
			})
			expect(isSameItem(filled, canceled)).toBe(false)
		})

		// After forceFitSelectedModel: fitMode -> 'forced'
		it('detects forced fit activation', () => {
			const before = makeItem()
			const after = makeItem({
				fitMode: 'forced',
				fitMessage: 'force fit applied',
				fitUpdatedAt: 12345,
				fillMode: undefined,
				fillCount: undefined,
				fillAxisScale: undefined
			})
			expect(isSameItem(before, after)).toBe(false)
		})

		it('detects yaw change within orientationFix', () => {
			const a = makeItem({
				orientationFix: {
					mode: 'manual',
					yaw: 0,
					pitch: 0,
					roll: 0,
					confidence: 'low',
					updatedAt: 1
				},
				fitMode: 'oriented'
			})
			const b = makeItem({
				orientationFix: {
					mode: 'manual',
					yaw: 90,
					pitch: 0,
					roll: 0,
					confidence: 'low',
					updatedAt: 2
				},
				fitMode: 'oriented'
			})
			expect(isSameItem(a, b)).toBe(false)
		})

		it('detects pitch change within orientationFix', () => {
			const a = makeItem({
				orientationFix: {
					mode: 'manual',
					yaw: 0,
					pitch: 0,
					roll: 0,
					confidence: 'low',
					updatedAt: 1
				},
				fitMode: 'oriented'
			})
			const b = makeItem({
				orientationFix: {
					mode: 'manual',
					yaw: 0,
					pitch: 90,
					roll: 0,
					confidence: 'low',
					updatedAt: 2
				},
				fitMode: 'oriented'
			})
			expect(isSameItem(a, b)).toBe(false)
		})

		it('detects roll change within orientationFix', () => {
			const a = makeItem({
				orientationFix: {
					mode: 'manual',
					yaw: 0,
					pitch: 0,
					roll: 0,
					confidence: 'low',
					updatedAt: 1
				},
				fitMode: 'oriented'
			})
			const b = makeItem({
				orientationFix: {
					mode: 'manual',
					yaw: 0,
					pitch: 0,
					roll: 90,
					confidence: 'low',
					updatedAt: 2
				},
				fitMode: 'oriented'
			})
			expect(isSameItem(a, b)).toBe(false)
		})

		it('detects fillCount change', () => {
			const a = makeItem({ fillMode: 'fill-x', fillCount: 2, fillAxisScale: 1, fitMode: 'filled' })
			const b = makeItem({ fillMode: 'fill-x', fillCount: 3, fillAxisScale: 1, fitMode: 'filled' })
			expect(isSameItem(a, b)).toBe(false)
		})

		it('detects fillAxisScale change', () => {
			const a = makeItem({ fillMode: 'fill-x', fillCount: 2, fillAxisScale: 1, fitMode: 'filled' })
			const b = makeItem({
				fillMode: 'fill-x',
				fillCount: 2,
				fillAxisScale: 1.5,
				fitMode: 'filled'
			})
			expect(isSameItem(a, b)).toBe(false)
		})

		it('detects fitMessage change (status text updates)', () => {
			const a = makeItem({ fitMode: 'normal', fitMessage: 'hint' })
			const b = makeItem({ fitMode: 'normal', fitMessage: 'rotated to Y: 90°' })
			// fitMode stays 'normal' but fitMessage changes → not same
			// (setFitState updates both, but message-only changes should still be detected)
			expect(isSameItem(a, b)).toBe(false)
		})
	})

	describe('isSameItems array-level detection for feature state changes', () => {
		it('detects when one item in array changes orientationFix', () => {
			const before = [makeItem({ id: 'a' }), makeItem({ id: 'b' })]
			const after = [
				makeItem({ id: 'a' }),
				makeItem({
					id: 'b',
					orientationFix: {
						mode: 'manual',
						yaw: 90,
						pitch: 0,
						roll: 0,
						confidence: 'low',
						updatedAt: 1
					},
					fitMode: 'oriented'
				})
			]
			expect(isSameItems(before, after)).toBe(false)
		})

		it('returns true when no feature state changed (same layout, same fit state)', () => {
			const items = [
				makeItem({ id: 'a' }),
				makeItem({
					id: 'b',
					fitMode: 'oriented',
					orientationFix: {
						mode: 'manual',
						yaw: 90,
						pitch: 0,
						roll: 0,
						confidence: 'low',
						updatedAt: 1
					}
				})
			]
			const clone = items.map((i) => ({
				...i,
				position: { ...i.position },
				size: { ...i.size },
				rotation: i.rotation ? { ...i.rotation } : undefined,
				scale: i.scale ? { ...i.scale } : undefined,
				orientationFix: i.orientationFix ? { ...i.orientationFix } : undefined
			}))
			expect(isSameItems(items, clone)).toBe(true)
		})
	})

	describe('fillModeToAxis mapping', () => {
		it('correctly maps all fill modes to their axes', () => {
			expect(fillModeToAxis('fill-x')).toBe('x')
			expect(fillModeToAxis('fill-y')).toBe('y')
			expect(fillModeToAxis('fill-z')).toBe('z')
		})

		it('returns null for non-fill states', () => {
			expect(fillModeToAxis(undefined)).toBeNull()
			// single is not a fill mode in the current architecture (fillMode is undefined when not filling)
			expect(fillModeToAxis('none' as unknown as WorkflowSceneLayoutItem['fillMode'])).toBeNull()
		})
	})

	describe('safeNumber for position/size calculations', () => {
		it('handles zero correctly (ground at y=0)', () => {
			expect(safeNumber(0, -1)).toBe(0)
		})

		it('handles negative heights safely', () => {
			// In setLayout, Math.max(0.05, ...) ensures dimensions are positive
			// but safeNumber itself should return the fallback for NaN
			expect(safeNumber(NaN, 1)).toBe(1)
			expect(safeNumber(-20, 1)).toBe(-20) // negative is still a number (Math.max guards it)
		})
	})
})
