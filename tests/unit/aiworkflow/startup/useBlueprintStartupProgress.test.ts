import { describe, it, expect, beforeEach } from 'vitest'
import {
	useBlueprintStartupProgress,
	STARTUP_STEP_KEYS
} from '@/views/AIWorkflow/startup/useBlueprintStartupProgress'

describe('useBlueprintStartupProgress', () => {
	let progress: ReturnType<typeof useBlueprintStartupProgress>

	beforeEach(() => {
		progress = useBlueprintStartupProgress()
	})

	describe('initial state', () => {
		it('should start in idle phase with 0 progress', () => {
			expect(progress.phase).toBe('idle')
			expect(progress.overallProgress).toBe(0)
			expect(progress.isVisible).toBe(false)
		})

		it('should have all steps in idle status initially', () => {
			for (const step of progress.steps) {
				expect(step.status).toBe('idle')
			}
		})

		it('should have null error and currentStepKey initially', () => {
			expect(progress.error).toBeNull()
			expect(progress.currentStepKey).toBeNull()
		})
	})

	describe('start()', () => {
		it('should transition to loading phase and show overlay', () => {
			progress.start()
			expect(progress.phase).toBe('loading')
			expect(progress.isVisible).toBe(true)
			expect(progress.error).toBeNull()
		})

		it('should set custom title when provided', () => {
			progress.start('自定义加载标题')
			expect(progress.title).toBe('自定义加载标题')
		})

		it('should use default title when no argument', () => {
			progress.start()
			expect(progress.title).toBeTruthy()
		})
	})

	describe('beginStep / completeStep lifecycle', () => {
		beforeEach(() => {
			progress.start()
		})

		it('beginStep should mark step as running and set as current', () => {
			progress.beginStep(STARTUP_STEP_KEYS.INIT)
			const step = progress.steps.find((s) => s.key === STARTUP_STEP_KEYS.INIT)
			expect(step?.status).toBe('running')
			expect(progress.currentStepKey).toBe(STARTUP_STEP_KEYS.INIT)
		})

		it('completeStep should mark step as ok and add to completed set', () => {
			progress.beginStep(STARTUP_STEP_KEYS.INIT)
			progress.completeStep(STARTUP_STEP_KEYS.INIT)
			const step = progress.steps.find((s) => s.key === STARTUP_STEP_KEYS.INIT)
			expect(step?.status).toBe('ok')
			expect(progress.currentStepKey).toBeNull()
		})

		it('overallProgress should increase after completing steps', () => {
			progress.beginStep(STARTUP_STEP_KEYS.INIT)
			const before = progress.overallProgress
			progress.completeStep(STARTUP_STEP_KEYS.INIT)
			const after = progress.overallProgress
			expect(after).toBeGreaterThanOrEqual(before)
		})

		it('progress should never exceed 99 before finish()', () => {
			const keys = Object.values(STARTUP_STEP_KEYS)
			for (const key of keys) {
				progress.beginStep(key as (typeof STARTUP_STEP_KEYS)[keyof typeof STARTUP_STEP_KEYS])
				progress.completeStep(key as (typeof STARTUP_STEP_KEYS)[keyof typeof STARTUP_STEP_KEYS])
			}
			expect(progress.overallProgress).toBeLessThanOrEqual(99)
		})
	})

	describe('updateSubProgress', () => {
		beforeEach(() => {
			progress.start()
			progress.beginStep(STARTUP_STEP_KEYS.RESOLVE_RESOURCES)
		})

		it('should set subProgress on the step', () => {
			progress.updateSubProgress(STARTUP_STEP_KEYS.RESOLVE_RESOURCES, 5, 20)
			const step = progress.steps.find((s) => s.key === STARTUP_STEP_KEYS.RESOLVE_RESOURCES)
			expect(step?.subProgress).toEqual({ current: 5, total: 20 })
		})

		it('should update detail when provided', () => {
			progress.updateSubProgress(STARTUP_STEP_KEYS.RESOLVE_RESOURCES, 1, 10, '正在下载图片')
			const step = progress.steps.find((s) => s.key === STARTUP_STEP_KEYS.RESOLVE_RESOURCES)
			expect(step?.detail).toBe('正在下载图片')
		})

		it('overallProgress should reflect partial sub-progress', () => {
			progress.completeStep(STARTUP_STEP_KEYS.INIT)
			progress.completeStep(STARTUP_STEP_KEYS.FETCH_PROJECT)
			progress.completeStep(STARTUP_STEP_KEYS.VALIDATE_SNAPSHOT)
			progress.completeStep(STARTUP_STEP_KEYS.REPAIR_ASSETS)
			progress.completeStep(STARTUP_STEP_KEYS.HYDRATE_STATE)
			progress.beginStep(STARTUP_STEP_KEYS.RESOLVE_RESOURCES)
			const at0 = progress.overallProgress
			progress.updateSubProgress(STARTUP_STEP_KEYS.RESOLVE_RESOURCES, 10, 10)
			const at100 = progress.overallProgress
			expect(at100).toBeGreaterThan(at0)
		})
	})

	describe('fail()', () => {
		it('should transition to error phase with message', () => {
			progress.start()
			progress.fail('加载失败: 网络错误')
			expect(progress.phase).toBe('error')
			expect(progress.error).toBe('加载失败: 网络错误')
			expect(progress.isVisible).toBe(true)
		})

		it('should set canSkipError when skippable=true', () => {
			progress.start()
			progress.fail('部分资源缺失', true)
			expect(progress.canSkipError).toBe(true)
		})
	})

	describe('finish()', () => {
		it('should transition to ready phase with 100% progress', () => {
			progress.start()
			progress.beginStep(STARTUP_STEP_KEYS.INIT)
			progress.finish()
			expect(progress.phase).toBe('ready')
			expect(progress.overallProgress).toBe(100)
		})
	})

	describe('reset()', () => {
		it('should reset back to idle state', () => {
			progress.start()
			progress.beginStep(STARTUP_STEP_KEYS.INIT)
			progress.fail('some error')
			progress.reset()
			expect(progress.phase).toBe('idle')
			expect(progress.overallProgress).toBe(0)
			expect(progress.error).toBeNull()
			expect(progress.currentStepKey).toBeNull()
		})
	})
})
