import { describe, it, expect } from 'vitest'
import {
	safeNumber,
	normalizeAngleDeg,
	roundOrientation,
	canonicalWallRole,
	canonicalWallRoleYaw,
	isWallMountedSupportSurface,
	isDeskLikeSurface,
	isWallSurfaceLike,
	fillModeToAxis,
	orientationOffsetEquals,
	type OrientationOffset,
	type FillAxis,
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
		fillMode: 'none',
		fillCount: 1,
		fitMode: 'normal',
		...overrides,
	}) as unknown as WorkflowSceneLayoutItem

describe('sceneLayoutPreviewUtils', () => {
	describe('safeNumber', () => {
		it('returns the number for valid numeric input', () => {
			expect(safeNumber(42, 0)).toBe(42)
			expect(safeNumber(0, 1)).toBe(0)
			expect(safeNumber(-3.14, 0)).toBe(-3.14)
		})

		it('returns fallback for NaN', () => {
			expect(safeNumber(NaN, 10)).toBe(10)
		})

		it('returns fallback for Infinity', () => {
			expect(safeNumber(Infinity, 5)).toBe(5)
			expect(safeNumber(-Infinity, 5)).toBe(5)
		})

		it('returns fallback for undefined/null', () => {
			expect(safeNumber(undefined, 7)).toBe(7)
			expect(safeNumber(null, 7)).toBe(0)
		})

		it('converts string numbers', () => {
			expect(safeNumber('123', 0)).toBe(123)
			expect(safeNumber('-45.6', 0)).toBe(-45.6)
		})

		it('returns fallback for non-numeric strings', () => {
			expect(safeNumber('abc', 99)).toBe(99)
		})
	})

	describe('normalizeAngleDeg', () => {
		it('returns the same angle for values within (-180, 180]', () => {
			expect(normalizeAngleDeg(0)).toBe(0)
			expect(normalizeAngleDeg(90)).toBe(90)
			expect(normalizeAngleDeg(-90)).toBe(-90)
			expect(normalizeAngleDeg(180)).toBe(180)
			expect(normalizeAngleDeg(-179)).toBe(-179)
			expect(normalizeAngleDeg(-180)).toBe(180)
		})

		it('normalizes angles greater than 180', () => {
			expect(normalizeAngleDeg(270)).toBe(-90)
			expect(normalizeAngleDeg(360)).toBe(0)
			expect(normalizeAngleDeg(450)).toBe(90)
			expect(normalizeAngleDeg(540)).toBe(180)
		})

		it('normalizes angles less than -180', () => {
			expect(normalizeAngleDeg(-270)).toBe(90)
			expect(normalizeAngleDeg(-360)).toBe(0)
			expect(normalizeAngleDeg(-450)).toBe(-90)
		})

		it('handles full rotations', () => {
			expect(normalizeAngleDeg(720)).toBe(0)
			expect(normalizeAngleDeg(-720)).toBe(0)
		})

		it('returns 0 for NaN or non-finite', () => {
			expect(normalizeAngleDeg(NaN)).toBe(0)
			expect(normalizeAngleDeg(Infinity)).toBe(0)
		})

		it('supports 4-state rotation cycle (0 -> 90 -> 180 -> 270 -> 0)', () => {
			let angle = 0
			angle = normalizeAngleDeg(angle + 90)
			expect(angle).toBe(90)
			angle = normalizeAngleDeg(angle + 90)
			expect(angle).toBe(180)
			angle = normalizeAngleDeg(angle + 90)
			expect(angle).toBe(-90)
			angle = normalizeAngleDeg(angle + 90)
			expect(angle).toBe(0)
		})
	})

	describe('roundOrientation', () => {
		it('rounds to 2 decimal places', () => {
			expect(roundOrientation(0.1234)).toBeCloseTo(0.12, 5)
			expect(roundOrientation(0.5678)).toBeCloseTo(0.57, 5)
		})

		it('normalizes before rounding', () => {
			expect(roundOrientation(270)).toBeCloseTo(-90, 5)
			expect(roundOrientation(360)).toBeCloseTo(0, 5)
		})
	})

	describe('canonicalWallRole', () => {
		it('returns empty string for empty/undefined input', () => {
			expect(canonicalWallRole('')).toBe('')
			expect(canonicalWallRole(undefined)).toBe('')
			expect(canonicalWallRole(null)).toBe('')
		})

		it('normalizes left', () => {
			expect(canonicalWallRole('left')).toBe('left')
			expect(canonicalWallRole('Left')).toBe('left')
			expect(canonicalWallRole('LEFT')).toBe('left')
			expect(canonicalWallRole('左')).toBe('left')
		})

		it('normalizes right', () => {
			expect(canonicalWallRole('right')).toBe('right')
			expect(canonicalWallRole('Right')).toBe('right')
			expect(canonicalWallRole('右')).toBe('right')
		})

		it('normalizes back/rear', () => {
			expect(canonicalWallRole('back')).toBe('back')
			expect(canonicalWallRole('rear')).toBe('back')
			expect(canonicalWallRole('Back')).toBe('back')
			expect(canonicalWallRole('后')).toBe('back')
		})

		it('normalizes front', () => {
			expect(canonicalWallRole('front')).toBe('front')
			expect(canonicalWallRole('Front')).toBe('front')
			expect(canonicalWallRole('前')).toBe('front')
		})

		it('returns raw value for unknown roles', () => {
			expect(canonicalWallRole('custom-role')).toBe('custom-role')
		})
	})

	describe('canonicalWallRoleYaw', () => {
		it('returns 0 for front (default)', () => {
			expect(canonicalWallRoleYaw('front')).toBe(0)
			expect(canonicalWallRoleYaw('')).toBe(0)
			expect(canonicalWallRoleYaw('unknown')).toBe(0)
		})

		it('returns 90 for left', () => {
			expect(canonicalWallRoleYaw('left')).toBe(90)
		})

		it('returns 270 for right', () => {
			expect(canonicalWallRoleYaw('right')).toBe(270)
		})

		it('returns 180 for back', () => {
			expect(canonicalWallRoleYaw('back')).toBe(180)
		})
	})

	describe('fillModeToAxis', () => {
		it('returns null for none/undefined', () => {
			expect(fillModeToAxis('none' as unknown as WorkflowSceneLayoutItem['fillMode'])).toBeNull()
			expect(fillModeToAxis(undefined as unknown as WorkflowSceneLayoutItem['fillMode'])).toBeNull()
		})

		it('maps fill-x to x', () => {
			expect(fillModeToAxis('fill-x')).toBe('x')
		})

		it('maps fill-y to y', () => {
			expect(fillModeToAxis('fill-y')).toBe('y')
		})

		it('maps fill-z to z', () => {
			expect(fillModeToAxis('fill-z')).toBe('z')
		})
	})

	describe('orientationOffsetEquals', () => {
		const makeOffset = (yaw = 0, pitch = 0, roll = 0): OrientationOffset => ({ yaw, pitch, roll })

		it('returns true for identical offsets', () => {
			expect(orientationOffsetEquals(makeOffset(0, 0, 0), makeOffset(0, 0, 0))).toBe(true)
			expect(orientationOffsetEquals(makeOffset(90, 0, 0), makeOffset(90, 0, 0))).toBe(true)
		})

		it('returns false for different yaw', () => {
			expect(orientationOffsetEquals(makeOffset(0, 0, 0), makeOffset(90, 0, 0))).toBe(false)
		})

		it('considers 180 and -180 equal (normalized)', () => {
			expect(orientationOffsetEquals(makeOffset(180, 0, 0), makeOffset(-180, 0, 0))).toBe(true)
		})

		it('considers 360 and 0 equal (normalized)', () => {
			expect(orientationOffsetEquals(makeOffset(360, 0, 0), makeOffset(0, 0, 0))).toBe(true)
		})

		it('respects epsilon', () => {
			expect(orientationOffsetEquals(makeOffset(0.001, 0, 0), makeOffset(0, 0, 0))).toBe(true)
			expect(orientationOffsetEquals(makeOffset(1, 0, 0), makeOffset(0, 0, 0))).toBe(false)
			expect(orientationOffsetEquals(makeOffset(1, 0, 0), makeOffset(0, 0, 0), 2)).toBe(true)
		})

		it('compares pitch and roll too', () => {
			expect(orientationOffsetEquals(makeOffset(0, 10, 0), makeOffset(0, 0, 0))).toBe(false)
			expect(orientationOffsetEquals(makeOffset(0, 0, 10), makeOffset(0, 0, 0))).toBe(false)
		})
	})

	describe('isWallSurfaceLike', () => {
		it('returns false for wall-mounted support surfaces', () => {
			const item = makeItem({
				name: '壁挂桌',
				placement: 'attached-to-wall',
				wallRole: 'back',
			})
			expect(isWallMountedSupportSurface(item)).toBe(true)
			expect(isWallSurfaceLike(item)).toBe(false)
		})

		it('returns true for wall key element type', () => {
			expect(isWallSurfaceLike(makeItem({ keyElementType: 'wall' }))).toBe(true)
		})

		it('returns true for wall-fixture semantic role', () => {
			expect(isWallSurfaceLike(makeItem({ semanticRole: 'wall-fixture-shelf' }))).toBe(true)
		})

		it('returns true for wall placement', () => {
			expect(isWallSurfaceLike(makeItem({ placement: 'attached-to-wall' }))).toBe(true)
		})

		it('returns true for wall support surface', () => {
			expect(isWallSurfaceLike(makeItem({ supportSurface: 'wall' }))).toBe(true)
		})

		it('returns true for wall mount type', () => {
			expect(isWallSurfaceLike(makeItem({ mountType: 'wall-mounted' }))).toBe(true)
		})

		it('returns true for wallRole set', () => {
			expect(isWallSurfaceLike(makeItem({ wallRole: 'back' }))).toBe(true)
		})

		it('returns false for normal floor items', () => {
			expect(isWallSurfaceLike(makeItem({ name: 'chair' }))).toBe(false)
		})
	})

	describe('isDeskLikeSurface', () => {
		it('returns true for wall-mounted support surfaces', () => {
			const item = makeItem({
				name: '壁挂桌',
				placement: 'attached-to-wall',
				wallRole: 'back',
			})
			expect(isDeskLikeSurface(item)).toBe(true)
		})

		it('returns true for desk-like tokens in name', () => {
			expect(isDeskLikeSurface(makeItem({ name: '书桌' }))).toBe(true)
			expect(isDeskLikeSurface(makeItem({ name: '办公桌' }))).toBe(true)
			expect(isDeskLikeSurface(makeItem({ name: 'desk' }))).toBe(true)
			expect(isDeskLikeSurface(makeItem({ name: 'table' }))).toBe(true)
		})

		it('returns true for desk-like categories', () => {
			expect(isDeskLikeSurface(makeItem({ category: 'desk' }))).toBe(true)
			expect(isDeskLikeSurface(makeItem({ category: 'table' }))).toBe(true)
		})

		it('returns false for non-desk items', () => {
			expect(isDeskLikeSurface(makeItem({ name: 'chair' }))).toBe(false)
			expect(isDeskLikeSurface(makeItem({ name: 'lamp' }))).toBe(false)
		})

		it('returns false for wall structural element', () => {
			expect(isDeskLikeSurface(makeItem({ keyElementType: 'wall' }))).toBe(false)
		})
	})

	describe('isWallMountedSupportSurface', () => {
		it('returns false for wall key element type', () => {
			expect(isWallMountedSupportSurface(makeItem({ keyElementType: 'wall' }))).toBe(false)
		})

		it('returns true for wall-mounted desk with wallRole', () => {
			const item = makeItem({
				name: '壁挂桌',
				placement: 'attached-to-wall',
				wallRole: 'back',
			})
			expect(isWallMountedSupportSurface(item)).toBe(true)
		})

		it('returns false for wall-fixture semantic role', () => {
			const item = makeItem({
				semanticRole: 'wall-fixture-shelf',
				placement: 'attached-to-wall',
				wallRole: 'back',
			})
			expect(isWallMountedSupportSurface(item)).toBe(false)
		})

		it('returns false for embedded fixtures', () => {
			const item = makeItem({
				name: '嵌入式搁板',
				placement: 'attached-to-wall',
				mountType: 'embedded',
				wallRole: 'back',
			})
			expect(isWallMountedSupportSurface(item)).toBe(false)
		})
	})

	describe('classification priority', () => {
		it('a floor-standing bookshelf with wallRole is still wall-surface-like (via wallRole)', () => {
			const item = makeItem({
				name: '书架',
				category: 'furniture',
				wallRole: 'back',
				placement: 'on-floor',
			})
			expect(isWallSurfaceLike(item)).toBe(true)
		})

		it('desk-like surface takes priority over wall-surface-like for wall desks', () => {
			const item = makeItem({
				name: '壁挂工作台',
				placement: 'attached-to-wall',
				wallRole: 'back',
			})
			expect(isWallMountedSupportSurface(item)).toBe(true)
			expect(isDeskLikeSurface(item)).toBe(true)
		})
	})
})
