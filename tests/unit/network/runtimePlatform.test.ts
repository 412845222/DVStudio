import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
	getRuntimePlatform,
	isElectron,
	isWeb,
	runtimeDescription
} from '@/network/runtimePlatform'

describe('runtimePlatform', () => {
	describe('getRuntimePlatform', () => {
		it('returns web in jsdom environment by default', () => {
			const platform = getRuntimePlatform()
			expect(platform).toBe('web')
		})

		it('returns electron when __DWEB_RUNTIME__.platform is electron', () => {
			const original = (window as any).__DWEB_RUNTIME__
			;(window as any).__DWEB_RUNTIME__ = { platform: 'electron' }
			expect(getRuntimePlatform()).toBe('electron')
			;(window as any).__DWEB_RUNTIME__ = original
		})

		it('returns web when __DWEB_RUNTIME__.platform is web', () => {
			const original = (window as any).__DWEB_RUNTIME__
			;(window as any).__DWEB_RUNTIME__ = { platform: 'web' }
			expect(getRuntimePlatform()).toBe('web')
			;(window as any).__DWEB_RUNTIME__ = original
		})

		it('returns electron when dweb bridge is available', () => {
			vi.stubGlobal('__DWEB_RUNTIME__', null)
			vi.stubGlobal('dweb', { common: { getBackendBaseUrl: () => 'http://localhost' } })
			expect(getRuntimePlatform()).toBe('electron')
			vi.stubGlobal('__DWEB_RUNTIME__', { platform: 'web', isElectron: false })
			vi.stubGlobal('dweb', { common: { getBackendBaseUrl: () => 'http://127.0.0.1:5800' } })
		})
	})

	describe('isElectron', () => {
		it('returns false in jsdom environment', () => {
			expect(isElectron()).toBe(false)
		})
	})

	describe('isWeb', () => {
		it('returns true in jsdom environment', () => {
			expect(isWeb()).toBe(true)
		})
	})

	describe('runtimeDescription', () => {
		it('returns platform info object', () => {
			const desc = runtimeDescription()
			expect(desc).toHaveProperty('platform')
			expect(desc).toHaveProperty('userAgent')
			expect(desc).toHaveProperty('backendBaseUrl')
			expect(desc).toHaveProperty('vitePlatformOverride')
		})

		it('platform is web in jsdom', () => {
			const desc = runtimeDescription()
			expect(desc.platform).toBe('web')
		})
	})
})
