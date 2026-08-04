import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
	getBackendBaseUrl,
	setBackendBaseUrl,
	parseDwebProjectAssetUrl,
	resolveBackendFetchUrl,
	isWorkflowLocalAssetUrl,
	resolveBackendUrl
} from '@/network/backendConfig'

describe('backendConfig', () => {
	describe('getBackendBaseUrl', () => {
		it('returns default URL in jsdom environment', () => {
			const url = getBackendBaseUrl()
			expect(url).toBe('http://127.0.0.1:5800')
		})

		it('prefers window.__DWEB_BACKEND_BASE_URL over localStorage', () => {
			vi.stubGlobal('__DWEB_BACKEND_BASE_URL__', 'http://localhost:8080')
			const url = getBackendBaseUrl()
			expect(url).toBe('http://localhost:8080')
			vi.stubGlobal('__DWEB_BACKEND_BASE_URL__', 'http://127.0.0.1:5800')
		})

		it('prefers localStorage over default', () => {
			vi.stubGlobal('__DWEB_BACKEND_BASE_URL__', '')
			localStorage.setItem('dweb.backendBaseUrl', 'http://custom:9000')
			const url = getBackendBaseUrl()
			expect(url).toBe('http://custom:9000')
			localStorage.removeItem('dweb.backendBaseUrl')
			vi.stubGlobal('__DWEB_BACKEND_BASE_URL__', 'http://127.0.0.1:5800')
		})

		it('normalizes URL by removing trailing slash', () => {
			vi.stubGlobal('__DWEB_BACKEND_BASE_URL__', 'http://localhost:8080/')
			const url = getBackendBaseUrl()
			expect(url).toBe('http://localhost:8080')
			vi.stubGlobal('__DWEB_BACKEND_BASE_URL__', 'http://127.0.0.1:5800')
		})

		it('returns empty string for empty input', () => {
			vi.stubGlobal('__DWEB_BACKEND_BASE_URL__', '')
			localStorage.removeItem('dweb.backendBaseUrl')
			const url = getBackendBaseUrl()
			expect(url).toBe('http://127.0.0.1:5800') // falls back to default
			vi.stubGlobal('__DWEB_BACKEND_BASE_URL__', 'http://127.0.0.1:5800')
		})
	})

	describe('setBackendBaseUrl', () => {
		beforeEach(() => {
			localStorage.removeItem('dweb.backendBaseUrl')
		})

		afterEach(() => {
			localStorage.removeItem('dweb.backendBaseUrl')
		})

		it('sets URL in localStorage', () => {
			setBackendBaseUrl('http://newbackend:8000')
			expect(localStorage.getItem('dweb.backendBaseUrl')).toBe('http://newbackend:8000')
		})

		it('removes trailing slash when storing', () => {
			setBackendBaseUrl('http://newbackend:8000/')
			expect(localStorage.getItem('dweb.backendBaseUrl')).toBe('http://newbackend:8000')
		})

		it('removes item when URL is empty', () => {
			localStorage.setItem('dweb.backendBaseUrl', 'http://old')
			setBackendBaseUrl('')
			expect(localStorage.getItem('dweb.backendBaseUrl')).toBeNull()
		})

		it('dispatches custom event', () => {
			const listener = vi.fn()
			window.addEventListener('dweb:backendBaseUrlChanged', listener)
			setBackendBaseUrl('http://newbackend:8000')
			expect(listener).toHaveBeenCalled()
			window.removeEventListener('dweb:backendBaseUrlChanged', listener)
		})
	})

	describe('parseDwebProjectAssetUrl', () => {
		it('parses valid dweb:// URL', () => {
			const result = parseDwebProjectAssetUrl(
				'dweb://project-assets?projectId=123&path=images%2Ftest.png'
			)
			expect(result).toEqual({ projectId: 123, path: 'images/test.png' })
		})

		it('returns null for non-dweb URL', () => {
			expect(parseDwebProjectAssetUrl('http://example.com/image.png')).toBeNull()
		})

		it('returns null for missing projectId', () => {
			expect(parseDwebProjectAssetUrl('dweb://project-assets?path=test.png')).toBeNull()
		})

		it('returns null for invalid projectId', () => {
			expect(
				parseDwebProjectAssetUrl('dweb://project-assets?projectId=abc&path=test.png')
			).toBeNull()
		})

		it('returns null for negative projectId', () => {
			expect(
				parseDwebProjectAssetUrl('dweb://project-assets?projectId=-1&path=test.png')
			).toBeNull()
		})

		it('returns null for missing path', () => {
			expect(parseDwebProjectAssetUrl('dweb://project-assets?projectId=123')).toBeNull()
		})

		it('returns null for empty input', () => {
			expect(parseDwebProjectAssetUrl('')).toBeNull()
			expect(parseDwebProjectAssetUrl(null as any)).toBeNull()
		})
	})

	describe('isWorkflowLocalAssetUrl', () => {
		it('returns true for blob URLs', () => {
			expect(isWorkflowLocalAssetUrl('blob:http://localhost:1234/abc')).toBe(true)
		})

		it('returns true for data URLs', () => {
			expect(isWorkflowLocalAssetUrl('data:image/png;base64,abc')).toBe(true)
		})

		it('returns true for dweb:// URLs', () => {
			expect(isWorkflowLocalAssetUrl('dweb://project-assets?projectId=1&path=test.png')).toBe(true)
		})

		it('returns true for file:// URLs', () => {
			expect(isWorkflowLocalAssetUrl('file:///path/to/file.png')).toBe(true)
		})

		it('returns true for /media/ paths', () => {
			expect(isWorkflowLocalAssetUrl('/media/uploads/image.png')).toBe(true)
		})

		it('returns true for localhost /media/', () => {
			expect(isWorkflowLocalAssetUrl('http://127.0.0.1/media/file.png')).toBe(true)
			expect(isWorkflowLocalAssetUrl('http://localhost/media/file.png')).toBe(true)
		})

		it('returns false for external URLs', () => {
			expect(isWorkflowLocalAssetUrl('https://example.com/image.png')).toBe(false)
		})

		it('returns false for non-media localhost paths', () => {
			expect(isWorkflowLocalAssetUrl('http://localhost/api/data')).toBe(false)
		})
	})

	describe('resolveBackendUrl', () => {
		it('returns blob/data URLs unchanged', () => {
			expect(resolveBackendUrl('blob:http://localhost/abc')).toBe('blob:http://localhost/abc')
			expect(resolveBackendUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
		})

		it('returns dweb URLs unchanged', () => {
			const url = 'dweb://project-assets?projectId=1&path=test.png'
			expect(resolveBackendUrl(url)).toBe(url)
		})

		it('returns absolute URLs unchanged', () => {
			expect(resolveBackendUrl('http://example.com/path')).toBe('http://example.com/path')
			expect(resolveBackendUrl('https://example.com/path')).toBe('https://example.com/path')
		})

		it('returns empty string for suspicious input', () => {
			expect(resolveBackendUrl(';malicious')).toBe('')
			expect(resolveBackendUrl('code=alert')).toBe('')
		})

		it('prepends backend base URL to relative paths in Electron', () => {
			vi.stubGlobal('__DWEB_RUNTIME__', { platform: 'electron' })
			vi.stubGlobal('__DWEB_BACKEND_BASE_URL__', 'http://backend:5800')
			vi.stubGlobal('dweb', { common: { getBackendBaseUrl: () => 'http://backend:5800' } })
			const url = resolveBackendUrl('/api/test')
			expect(url).toBe('http://backend:5800/api/test')
			vi.stubGlobal('__DWEB_RUNTIME__', { platform: 'web', isElectron: false })
			vi.stubGlobal('__DWEB_BACKEND_BASE_URL__', 'http://127.0.0.1:5800')
			vi.stubGlobal('dweb', { common: { getBackendBaseUrl: () => 'http://127.0.0.1:5800' } })
		})
	})
})
