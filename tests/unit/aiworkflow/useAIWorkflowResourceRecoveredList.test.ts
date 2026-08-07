import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
	loadPersistedRecoveredUrls,
	markUrlRecovered,
	isUrlRecovered
} from '@/views/AIWorkflow/assets/useAIWorkflowResourceRecoveredList'

const FLAG_KEY = 'DVS_MISSING_ASSET_RECOVERED_PERSIST'
const KEY_PREFIX = 'DVS_RECOVERED_ASSETS_'

const normUrl = (u: string) => {
	// 简化的规格化逻辑，与 normalizeForBindingMatch 对齐
	let s = u.trim()
	s = s.replace(/^https?:\/\//i, '')
	s = s.replace(/^dweb:\/\//i, '')
	s = s.split('?')[0].split('#')[0]
	s = s.replace(/\\/g, '/')
	try {
		s = decodeURIComponent(s)
	} catch {
		/* ignore */
	}
	return s.toLowerCase()
}

describe('useAIWorkflowResourceRecoveredList', () => {
	beforeEach(() => {
		localStorage.clear()
	})

	afterEach(() => {
		localStorage.clear()
	})

	describe('loadPersistedRecoveredUrls', () => {
		it('should return empty Set when no data exists', () => {
			const snap = loadPersistedRecoveredUrls(123, null)
			expect(snap).toBeInstanceOf(Set)
			expect(snap.size).toBe(0)
		})

		it('should load URLs written by markUrlRecovered', () => {
			const url = 'dweb://project-assets?projectId=123&path=Content/Media/test.glb'
			markUrlRecovered(123, url, url)

			const snap = loadPersistedRecoveredUrls(123, url)
			expect(snap.size).toBeGreaterThan(0)
			expect(snap.has(normUrl(url))).toBe(true)
		})

		it('should read from global bucket when projectId is null', () => {
			const url = 'dweb://project-assets?projectId=999&path=test.jpg'
			markUrlRecovered(null, url, url)

			const snap = loadPersistedRecoveredUrls(null, url)
			expect(snap.size).toBeGreaterThan(0)
		})

		it('should read from fallback URL parsed projectId', () => {
			const url = 'dweb://project-assets?projectId=456&path=Content/Media/model.glb'
			markUrlRecovered(456, url, url)

			// 使用 null projectId 但传 fallbackFromUrl
			const snap = loadPersistedRecoveredUrls(null, url)
			expect(snap.size).toBeGreaterThan(0)
		})
	})

	describe('isUrlRecovered', () => {
		it('should return false for null/undefined snap', () => {
			expect(isUrlRecovered(null, 'some-url')).toBe(false)
			expect(isUrlRecovered(undefined, 'some-url')).toBe(false)
		})

		it('should return false for empty Set', () => {
			expect(isUrlRecovered(new Set(), 'some-url')).toBe(false)
		})

		it('should return true when URL matches exactly (normalized)', () => {
			const url = 'dweb://project-assets?projectId=1&path=Content/Media/test.glb'
			markUrlRecovered(1, url, url)
			const snap = loadPersistedRecoveredUrls(1, url)
			expect(isUrlRecovered(snap, url)).toBe(true)
		})

		it('should return true when URL has different case (normalized lower)', () => {
			const url = 'dweb://project-assets?projectId=1&path=Content/Media/Test.GLB'
			markUrlRecovered(1, url, url)
			const snap = loadPersistedRecoveredUrls(1, url)
			// 大小写差异应被规格化匹配
			expect(isUrlRecovered(snap, url.toUpperCase())).toBe(true)
		})

		it('should return false for null/undefined url', () => {
			const snap = new Set(['some-norm-url'])
			expect(isUrlRecovered(snap, null)).toBe(false)
			expect(isUrlRecovered(snap, undefined)).toBe(false)
			expect(isUrlRecovered(snap, '')).toBe(false)
		})
	})

	describe('markUrlRecovered', () => {
		it('should write to multiple buckets (projectId + global)', () => {
			const url = 'dweb://project-assets?projectId=100&path=test.png'
			markUrlRecovered(100, url, url)

			// projectId 桶可读
			const snap1 = loadPersistedRecoveredUrls(100, url)
			expect(snap1.size).toBeGreaterThan(0)

			// 全局桶也可读
			const snap2 = loadPersistedRecoveredUrls(null, null)
			expect(snap2.size).toBeGreaterThan(0)
		})

		it('should handle missing fallbackFromUrl gracefully', () => {
			const url = 'dweb://project-assets?projectId=200&path=model.glb'
			expect(() => markUrlRecovered(200, url, undefined)).not.toThrow()
			expect(() => markUrlRecovered(200, url, null)).not.toThrow()
		})

		it('should overwrite previous entry for same URL', () => {
			const url = 'dweb://project-assets?projectId=300&path=asset.jpg'
			markUrlRecovered(300, url, url)
			// 再次写入不应报错
			markUrlRecovered(300, url, url)

			const snap = loadPersistedRecoveredUrls(300, url)
			expect(snap.has(normUrl(url))).toBe(true)
		})
	})

	describe('persistence across "sessions"', () => {
		it('should persist data in localStorage (simulating page refresh)', () => {
			const url = 'dweb://project-assets?projectId=500&path=Content/Media/persist.glb'
			markUrlRecovered(500, url, url)

			// 检查 localStorage 中确实有数据
			const keys = Object.keys(localStorage).filter((k) => k.startsWith(KEY_PREFIX))
			expect(keys.length).toBeGreaterThan(0)

			// 重新加载（模拟刷新后重新构造 Set）
			const snap = loadPersistedRecoveredUrls(500, url)
			expect(isUrlRecovered(snap, url)).toBe(true)
		})

		it('should survive when projectId changes (global bucket fallback)', () => {
			const url = 'dweb://project-assets?projectId=600&path=fallback.glb'
			markUrlRecovered(600, url, url)

			// 使用不同的 projectId 读取 —— 全局桶应该仍能命中
			const snap = loadPersistedRecoveredUrls(999, null)
			expect(snap.size).toBeGreaterThan(0)
		})
	})
})
