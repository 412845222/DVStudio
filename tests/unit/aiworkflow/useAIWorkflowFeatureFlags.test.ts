import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
	isAutoRecoverPersistEnabled,
	isAutoRecoverNoopSuppressEnabled,
	isResourceManagerThumbSkipGlobalEnabled,
	isRecoverToastBatchEnabled,
	isRecoveredPersistEnabled,
	isStrictMissingSourceBindingEnabled,
	isNodeSelectionDebounceEnabled,
	isUnknownCleanupEnabled
} from '@/views/AIWorkflow/assets/useAIWorkflowResourceUrlClassifier'

const FLAGS = {
	DVS_MISSING_ASSET_AUTORECOVER_PERSIST: isAutoRecoverPersistEnabled,
	DVS_MISSING_ASSET_AUTORECOVER_NOOP_SUPPRESS: isAutoRecoverNoopSuppressEnabled,
	DVS_MISSING_ASSET_RM_THUMB_SKIP_GLOBAL: isResourceManagerThumbSkipGlobalEnabled,
	DVS_MISSING_ASSET_RECOVER_TOAST_BATCH: isRecoverToastBatchEnabled,
	DVS_MISSING_ASSET_RECOVERED_PERSIST: isRecoveredPersistEnabled,
	DVS_MISSING_ASSET_STRICT_SOURCES: isStrictMissingSourceBindingEnabled,
	DVS_MISSING_ASSET_NODE_SELECTION_DEBOUNCE: isNodeSelectionDebounceEnabled,
	DVS_MISSING_ASSET_UNKNOWN_CLEANUP: isUnknownCleanupEnabled
}

describe('Feature Flags - useAIWorkflowResourceUrlClassifier', () => {
	const savedValues: Record<string, string | null> = {}

	beforeEach(() => {
		// 保存原始 localStorage 状态
		for (const key of Object.keys(FLAGS)) {
			savedValues[key] = localStorage.getItem(key)
			localStorage.removeItem(key)
		}
	})

	afterEach(() => {
		// 恢复原始 localStorage 状态
		for (const [key, val] of Object.entries(savedValues)) {
			if (val === null) localStorage.removeItem(key)
			else localStorage.setItem(key, val)
		}
	})

	describe('default values (all flags default to true)', () => {
		for (const [key, getter] of Object.entries(FLAGS)) {
			it(`${key} should default to true when not set`, () => {
				localStorage.removeItem(key)
				expect(getter()).toBe(true)
			})
		}
	})

	describe('disable via localStorage = "0"', () => {
		for (const [key, getter] of Object.entries(FLAGS)) {
			it(`${key} should return false when set to "0"`, () => {
				localStorage.setItem(key, '0')
				expect(getter()).toBe(false)
			})
		}
	})

	describe('disable via localStorage = "false"', () => {
		for (const [key, getter] of Object.entries(FLAGS)) {
			it(`${key} should return false when set to "false"`, () => {
				localStorage.setItem(key, 'false')
				expect(getter()).toBe(false)
			})
		}
	})

	describe('disable via case-insensitive values', () => {
		it('should accept "OFF" (uppercase)', () => {
			localStorage.setItem('DVS_MISSING_ASSET_AUTORECOVER_PERSIST', 'OFF')
			expect(isAutoRecoverPersistEnabled()).toBe(false)
		})

		it('should accept "No" (mixed case)', () => {
			localStorage.setItem('DVS_MISSING_ASSET_RECOVER_TOAST_BATCH', 'No')
			expect(isRecoverToastBatchEnabled()).toBe(false)
		})
	})

	describe('keep enabled for truthy values', () => {
		it('should return true when set to "1"', () => {
			localStorage.setItem('DVS_MISSING_ASSET_RECOVERED_PERSIST', '1')
			expect(isRecoveredPersistEnabled()).toBe(true)
		})

		it('should return true when set to "true"', () => {
			localStorage.setItem('DVS_MISSING_ASSET_RM_THUMB_SKIP_GLOBAL', 'true')
			expect(isResourceManagerThumbSkipGlobalEnabled()).toBe(true)
		})
	})
})
