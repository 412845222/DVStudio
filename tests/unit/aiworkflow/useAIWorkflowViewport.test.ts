import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createStore } from 'vuex'
import { useAIWorkflowViewport } from '@/views/AIWorkflow/blueprint-core/useAIWorkflowViewport'
import type { WorkflowState } from '@/aiworkflow/types'

const createMockStore = () => {
	let viewportState = { zoom: 1, panX: 0, panY: 0 }
	return {
		state: {
			viewport: viewportState
		},
		commit: vi.fn((mutation: string, payload: any) => {
			if (mutation === 'setViewport') {
				viewportState = { ...viewportState, ...payload }
			}
		})
	} as unknown as ReturnType<typeof createStore<WorkflowState>>
}

describe('useAIWorkflowViewport', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	describe('viewportMotionActive state', () => {
		it('should be inactive by default', () => {
			const store = createMockStore()
			const { viewportMotionActive } = useAIWorkflowViewport(store, {
				canvasSelector: '.test-canvas',
				motionResetMs: 140
			})
			expect(viewportMotionActive.value).toBe(false)
		})

		it('should become active after markViewportMotion is called', () => {
			const store = createMockStore()
			const { viewportMotionActive, markViewportMotion } = useAIWorkflowViewport(store, {
				canvasSelector: '.test-canvas',
				motionResetMs: 140
			})

			markViewportMotion()
			expect(viewportMotionActive.value).toBe(true)
		})

		it('should reset to inactive after motionResetMs timeout', () => {
			const store = createMockStore()
			const { viewportMotionActive, markViewportMotion } = useAIWorkflowViewport(store, {
				canvasSelector: '.test-canvas',
				motionResetMs: 140
			})

			markViewportMotion()
			expect(viewportMotionActive.value).toBe(true)

			vi.advanceTimersByTime(139)
			expect(viewportMotionActive.value).toBe(true)

			vi.advanceTimersByTime(2)
			expect(viewportMotionActive.value).toBe(false)
		})

		it('should reset timer on repeated markViewportMotion calls', () => {
			const store = createMockStore()
			const { viewportMotionActive, markViewportMotion } = useAIWorkflowViewport(store, {
				canvasSelector: '.test-canvas',
				motionResetMs: 140
			})

			markViewportMotion()
			vi.advanceTimersByTime(100)
			expect(viewportMotionActive.value).toBe(true)

			markViewportMotion()
			vi.advanceTimersByTime(100)
			expect(viewportMotionActive.value).toBe(true)

			vi.advanceTimersByTime(45)
			expect(viewportMotionActive.value).toBe(false)
		})
	})

	describe('forceEndViewportMotion', () => {
		it('should immediately set viewportMotionActive to false', () => {
			const store = createMockStore()
			const { viewportMotionActive, markViewportMotion, forceEndViewportMotion } = useAIWorkflowViewport(store, {
				canvasSelector: '.test-canvas',
				motionResetMs: 140
			})

			markViewportMotion()
			expect(viewportMotionActive.value).toBe(true)

			forceEndViewportMotion()
			expect(viewportMotionActive.value).toBe(false)
		})

		it('should clear all pending timers', () => {
			const store = createMockStore()
			const { viewportMotionActive, markViewportMotion, forceEndViewportMotion } = useAIWorkflowViewport(store, {
				canvasSelector: '.test-canvas',
				motionResetMs: 140
			})

			markViewportMotion()
			forceEndViewportMotion()
			expect(viewportMotionActive.value).toBe(false)

			vi.advanceTimersByTime(500)
			expect(viewportMotionActive.value).toBe(false)
		})

		it('should be safe to call when already inactive', () => {
			const store = createMockStore()
			const { viewportMotionActive, forceEndViewportMotion } = useAIWorkflowViewport(store, {
				canvasSelector: '.test-canvas',
				motionResetMs: 140
			})

			expect(() => forceEndViewportMotion()).not.toThrow()
			expect(viewportMotionActive.value).toBe(false)
		})
	})

	describe('hard timeout protection', () => {
		it('should force reset after 1 second even if markViewportMotion is called repeatedly', () => {
			const store = createMockStore()
			const { viewportMotionActive, markViewportMotion } = useAIWorkflowViewport(store, {
				canvasSelector: '.test-canvas',
				motionResetMs: 140
			})

			for (let i = 0; i < 10; i++) {
				markViewportMotion()
				vi.advanceTimersByTime(100)
			}

			expect(viewportMotionActive.value).toBe(true)

			vi.advanceTimersByTime(900)
			expect(viewportMotionActive.value).toBe(false)
		})
	})

	describe('onViewportUpdate', () => {
		it('should commit setViewport mutation', () => {
			const store = createMockStore()
			const { onViewportUpdate } = useAIWorkflowViewport(store, {
				canvasSelector: '.test-canvas'
			})

			onViewportUpdate({ zoom: 0.5, panX: 100, panY: 200 })

			expect(store.commit).toHaveBeenCalledWith('setViewport', {
				zoom: 0.5,
				panX: 100,
				panY: 200
			})
		})
	})
})
