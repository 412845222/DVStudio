import { describe, it, expect } from 'vitest'
import {
	getUnrealConnectionPollInterval,
	UNREAL_CONNECTION_FAST_POLL_INTERVAL_MS,
	UNREAL_CONNECTION_SLOW_POLL_INTERVAL_MS,
	UNREAL_CONNECTION_FAST_POLL_COUNT
} from '@/views/AIWorkflow/node-business/unreal/unrealExportUtils'

describe('unrealConnectionPolling', () => {
	describe('getUnrealConnectionPollInterval', () => {
		it('returns fast interval for first N polls (pollCount < threshold)', () => {
			for (let i = 0; i < UNREAL_CONNECTION_FAST_POLL_COUNT; i++) {
				expect(getUnrealConnectionPollInterval(i)).toBe(UNREAL_CONNECTION_FAST_POLL_INTERVAL_MS)
			}
		})

		it('returns slow interval when pollCount reaches threshold', () => {
			expect(getUnrealConnectionPollInterval(UNREAL_CONNECTION_FAST_POLL_COUNT)).toBe(
				UNREAL_CONNECTION_SLOW_POLL_INTERVAL_MS
			)
		})

		it('returns slow interval for pollCount beyond threshold', () => {
			expect(getUnrealConnectionPollInterval(UNREAL_CONNECTION_FAST_POLL_COUNT + 1)).toBe(
				UNREAL_CONNECTION_SLOW_POLL_INTERVAL_MS
			)
			expect(getUnrealConnectionPollInterval(UNREAL_CONNECTION_FAST_POLL_COUNT + 50)).toBe(
				UNREAL_CONNECTION_SLOW_POLL_INTERVAL_MS
			)
			expect(getUnrealConnectionPollInterval(100)).toBe(UNREAL_CONNECTION_SLOW_POLL_INTERVAL_MS)
		})

		it('fast interval is shorter than slow interval for responsive UX', () => {
			expect(UNREAL_CONNECTION_FAST_POLL_INTERVAL_MS).toBeLessThan(
				UNREAL_CONNECTION_SLOW_POLL_INTERVAL_MS
			)
		})

		it('threshold is a positive integer', () => {
			expect(Number.isInteger(UNREAL_CONNECTION_FAST_POLL_COUNT)).toBe(true)
			expect(UNREAL_CONNECTION_FAST_POLL_COUNT).toBeGreaterThan(0)
		})

		it('poll intervals are positive numbers', () => {
			expect(UNREAL_CONNECTION_FAST_POLL_INTERVAL_MS).toBeGreaterThan(0)
			expect(UNREAL_CONNECTION_SLOW_POLL_INTERVAL_MS).toBeGreaterThan(0)
		})
	})
})
