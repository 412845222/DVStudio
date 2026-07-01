import { describe, it, expect } from 'vitest'
import {
	constrainManualOrientation,
	normalizeAngleDeg,
	type OrientationOffset
} from '@/ui/WorkFlow/WorlFlowNodes/sceneLayout/SceneLayoutPreviewViewer'

describe('constrainManualOrientation', () => {
	it('preserves non-zero yaw (regression: structure was force-zeroed)', () => {
		const input: OrientationOffset = { yaw: 90, pitch: 0, roll: 0 }
		const result = constrainManualOrientation(input)
		expect(result.yaw).toBe(90)
	})

	it('preserves non-zero pitch (regression: structure was force-zeroed)', () => {
		const input: OrientationOffset = { yaw: 0, pitch: 90, roll: 0 }
		const result = constrainManualOrientation(input)
		expect(result.pitch).toBe(90)
	})

	it('preserves non-zero roll (regression: structure was force-zeroed)', () => {
		const input: OrientationOffset = { yaw: 0, pitch: 0, roll: 90 }
		const result = constrainManualOrientation(input)
		expect(result.roll).toBe(90)
	})

	it('preserves full 3-axis rotation', () => {
		const input: OrientationOffset = { yaw: 90, pitch: -90, roll: 180 }
		const result = constrainManualOrientation(input)
		expect(result.yaw).toBe(90)
		expect(result.pitch).toBe(-90)
		expect(result.roll).toBe(180)
	})

	it('normalizes angles outside [-180, 180]', () => {
		const input: OrientationOffset = { yaw: 360, pitch: 270, roll: -270 }
		const result = constrainManualOrientation(input)
		expect(result.yaw).toBe(normalizeAngleDeg(360))
		expect(result.pitch).toBe(normalizeAngleDeg(270))
		expect(result.roll).toBe(normalizeAngleDeg(-270))
	})

	it('normalizes 360 yaw to 0', () => {
		const input: OrientationOffset = { yaw: 360, pitch: 0, roll: 0 }
		const result = constrainManualOrientation(input)
		expect(result.yaw).toBe(0)
	})

	it('normalizes -180 to 180 (boundary: <= -180 triggers +360)', () => {
		const input: OrientationOffset = { yaw: -180, pitch: 0, roll: 0 }
		const result = constrainManualOrientation(input)
		expect(result.yaw).toBe(180)
	})

	it('handles zero offset', () => {
		const input: OrientationOffset = { yaw: 0, pitch: 0, roll: 0 }
		const result = constrainManualOrientation(input)
		expect(result).toEqual({ yaw: 0, pitch: 0, roll: 0 })
	})

	it('preserves extra properties on the offset object', () => {
		const input = { yaw: 45, pitch: 30, roll: -60, extra: 'kept' } as OrientationOffset & { extra: string }
		const result = constrainManualOrientation(input) as OrientationOffset & { extra: string }
		expect(result.extra).toBe('kept')
		expect(result.yaw).toBe(45)
	})

	it('does not mutate the input offset', () => {
		const input: OrientationOffset = { yaw: 90, pitch: 45, roll: -30 }
		const snapshot = { ...input }
		constrainManualOrientation(input)
		expect(input).toEqual(snapshot)
	})

	it('returns a new object (not the same reference)', () => {
		const input: OrientationOffset = { yaw: 0, pitch: 0, roll: 0 }
		const result = constrainManualOrientation(input)
		expect(result).not.toBe(input)
	})

	it('normalizes NaN yaw to 0', () => {
		const input: OrientationOffset = { yaw: NaN, pitch: 0, roll: 0 }
		const result = constrainManualOrientation(input)
		expect(result.yaw).toBe(0)
	})
})
