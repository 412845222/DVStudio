import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Helper functions copied from the source (for testing purposes)
const blobToBase64DataUri = async (blob: Blob): Promise<string> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result || ''))
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(blob)
	})
}

const normalizeModelUrlForMeshy = async (
	deps: {
		resolveBackendUrl: (url: string) => string
		downloadUrlAsBlob?: (url: string) => Promise<Blob | null>
	},
	rawUrl: string,
	_label?: string
): Promise<string> => {
	const value = String(rawUrl ?? '').trim()
	if (!value) return ''
	if (value.startsWith('data:')) return value

	// Handle dweb:// URLs first before any resolution
	if (value.startsWith('dweb://')) {
		try {
			let blob: Blob | null = null
			if (typeof deps.downloadUrlAsBlob === 'function') {
				blob = await deps.downloadUrlAsBlob(value)
			}
			if (!blob) {
				const resp = await fetch(value)
				if (!resp.ok) return ''
				blob = await resp.blob()
			}
			if (!blob || blob.size === 0) return ''
			return await blobToBase64DataUri(blob)
		} catch (err) {
			console.warn(`[Meshy] failed to convert dweb model URL to data URL: ${value}`, err)
			return ''
		}
	}

	const resolved =
		value.startsWith('http://') || value.startsWith('https://') || value.startsWith('blob:')
			? value
			: deps.resolveBackendUrl(value)

	if (resolved.startsWith('blob:')) {
		try {
			const resp = await fetch(resolved)
			if (!resp.ok) return ''
			const blob = await resp.blob()
			if (!blob || blob.size === 0) return ''
			return await blobToBase64DataUri(blob)
		} catch {
			return ''
		}
	}

	if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
		try {
			const parsed = new URL(resolved)
			const hostname = parsed.hostname
			if (
				hostname === 'localhost' ||
				hostname === '127.0.0.1' ||
				hostname.startsWith('192.168.') ||
				hostname.startsWith('10.') ||
				hostname.endsWith('.local')
			) {
				let blob: Blob | null = null
				if (typeof deps.downloadUrlAsBlob === 'function') {
					blob = await deps.downloadUrlAsBlob(resolved)
				}
				if (!blob) {
					const resp = await fetch(resolved)
					if (!resp.ok) return resolved
					blob = await resp.blob()
				}
				if (!blob || blob.size === 0) return resolved
				return await blobToBase64DataUri(blob)
			}
		} catch {
			// keep resolved url
		}
		return resolved
	}

	return resolved
}

describe('normalizeModelUrlForMeshy', () => {
	beforeEach(() => {
		mockFetch.mockReset()
	})

	const createMockDeps = (overrides = {}) => ({
		resolveBackendUrl: vi.fn((url: string) => `http://backend.local/api/${url}`),
		downloadUrlAsBlob: undefined as any,
		...overrides
	})

	describe('empty or data URL input', () => {
		it('returns empty string for empty input', async () => {
			const deps = createMockDeps()
			const result = await normalizeModelUrlForMeshy(deps, '')
			expect(result).toBe('')
		})

		it('returns empty string for whitespace only input', async () => {
			const deps = createMockDeps()
			const result = await normalizeModelUrlForMeshy(deps, '   ')
			expect(result).toBe('')
		})

		it('returns data URL as-is', async () => {
			const deps = createMockDeps()
			const dataUrl = 'data:application/octet-stream;base64,SGVsbG8='
			const result = await normalizeModelUrlForMeshy(deps, dataUrl)
			expect(result).toBe(dataUrl)
		})
	})

	describe('public HTTP/HTTPS URLs', () => {
		it('returns public HTTPS URL as-is', async () => {
			const deps = createMockDeps()
			const url = 'https://example.com/models/test.glb'
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(result).toBe(url)
		})

		it('returns public HTTP URL as-is', async () => {
			const deps = createMockDeps()
			const url = 'http://example.com/models/test.glb'
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(result).toBe(url)
		})

		it('returns public IP URL (not private) as-is', async () => {
			const deps = createMockDeps()
			const url = 'http://8.8.8.8/models/test.glb'
			mockFetch.mockResolvedValue({ ok: false })
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(result).toBe(url)
		})
	})

	describe('private network URLs', () => {
		it('converts localhost URL to data URI via fetch', async () => {
			const deps = createMockDeps()
			const url = 'http://localhost:3000/models/test.glb'
			const testBlob = new Blob(['model data'], { type: 'application/octet-stream' })
			mockFetch.mockResolvedValue({
				ok: true,
				blob: () => Promise.resolve(testBlob)
			})
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(result).toMatch(/^data:application\/octet-stream;base64,/)
		})

		it('converts 127.0.0.1 URL to data URI via fetch', async () => {
			const deps = createMockDeps()
			const url = 'http://127.0.0.1:8080/models/test.glb'
			const testBlob = new Blob(['model data'], { type: 'application/octet-stream' })
			mockFetch.mockResolvedValue({
				ok: true,
				blob: () => Promise.resolve(testBlob)
			})
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(result).toMatch(/^data:application\/octet-stream;base64,/)
		})

		it('converts 192.168.x.x URL to data URI via fetch', async () => {
			const deps = createMockDeps()
			const url = 'http://192.168.1.100/models/test.glb'
			const testBlob = new Blob(['model data'], { type: 'application/octet-stream' })
			mockFetch.mockResolvedValue({
				ok: true,
				blob: () => Promise.resolve(testBlob)
			})
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(result).toMatch(/^data:application\/octet-stream;base64,/)
		})

		it('converts 10.x.x.x URL to data URI via fetch', async () => {
			const deps = createMockDeps()
			const url = 'http://10.0.0.50/models/test.glb'
			const testBlob = new Blob(['model data'], { type: 'application/octet-stream' })
			mockFetch.mockResolvedValue({
				ok: true,
				blob: () => Promise.resolve(testBlob)
			})
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(result).toMatch(/^data:application\/octet-stream;base64,/)
		})

		it('converts .local hostname URL to data URI via fetch', async () => {
			const deps = createMockDeps()
			const url = 'http://myserver.local/models/test.glb'
			const testBlob = new Blob(['model data'], { type: 'application/octet-stream' })
			mockFetch.mockResolvedValue({
				ok: true,
				blob: () => Promise.resolve(testBlob)
			})
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(result).toMatch(/^data:application\/octet-stream;base64,/)
		})

		it('returns localhost URL if fetch fails with non-ok response', async () => {
			const deps = createMockDeps()
			const url = 'http://localhost:3000/models/test.glb'
			mockFetch.mockResolvedValue({ ok: false })
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(result).toBe(url)
		})
	})

	describe('dweb:// URLs', () => {
		it('converts dweb:// URL to data URI via downloadUrlAsBlob', async () => {
			const testBlob = new Blob(['dweb model'], { type: 'application/octet-stream' })
			const deps = createMockDeps({
				downloadUrlAsBlob: vi.fn().mockResolvedValue(testBlob)
			})
			const url = 'dweb://models/test.glb'
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(result).toMatch(/^data:application\/octet-stream;base64,/)
			expect(deps.downloadUrlAsBlob).toHaveBeenCalledWith(url)
		})

		it('converts dweb:// URL to data URI via fetch when downloadUrlAsBlob not available', async () => {
			const deps = createMockDeps()
			const url = 'dweb://models/test.glb'
			const testBlob = new Blob(['dweb model'], { type: 'application/octet-stream' })
			mockFetch.mockResolvedValue({
				ok: true,
				blob: () => Promise.resolve(testBlob)
			})
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(result).toMatch(/^data:application\/octet-stream;base64,/)
		})

		it('returns empty string when dweb:// URL fetch fails', async () => {
			const deps = createMockDeps()
			const url = 'dweb://models/test.glb'
			mockFetch.mockRejectedValue(new Error('Network error'))
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(result).toBe('')
		})

		it('returns empty string when dweb:// URL returns empty blob', async () => {
			const deps = createMockDeps()
			const url = 'dweb://models/test.glb'
			mockFetch.mockResolvedValue({
				ok: true,
				blob: () => Promise.resolve(new Blob([], { type: 'application/octet-stream' }))
			})
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(result).toBe('')
		})
	})

	describe('blob:// URLs', () => {
		it('converts blob:// URL to data URI via fetch', async () => {
			const deps = createMockDeps()
			const url = 'blob:http://example.com/abc123'
			const testBlob = new Blob(['blob model'], { type: 'application/octet-stream' })
			mockFetch.mockResolvedValue({
				ok: true,
				blob: () => Promise.resolve(testBlob)
			})
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(result).toMatch(/^data:application\/octet-stream;base64,/)
		})

		it('returns empty string when blob:// URL fetch fails', async () => {
			const deps = createMockDeps()
			const url = 'blob:http://example.com/abc123'
			mockFetch.mockRejectedValue(new Error('Network error'))
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(result).toBe('')
		})

		it('returns empty string when blob:// URL returns empty blob', async () => {
			const deps = createMockDeps()
			const url = 'blob:http://example.com/abc123'
			mockFetch.mockResolvedValue({
				ok: true,
				blob: () => Promise.resolve(new Blob([], { type: 'application/octet-stream' }))
			})
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(result).toBe('')
		})
	})

	describe('relative URLs', () => {
		it('resolves relative URL via resolveBackendUrl and processes', async () => {
			const deps = createMockDeps({
				resolveBackendUrl: vi.fn((url: string) => `http://backend.local/api/${url}`)
			})
			const url = 'models/test.glb'
			const testBlob = new Blob(['relative model'], { type: 'application/octet-stream' })
			mockFetch.mockResolvedValue({
				ok: true,
				blob: () => Promise.resolve(testBlob)
			})
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(deps.resolveBackendUrl).toHaveBeenCalledWith(url)
			// resolved URL is a private network URL (backend.local), so should be converted
			expect(result).toMatch(/^data:application\/octet-stream;base64,/)
		})
	})

	describe('edge cases', () => {
		it('handles URL with query parameters', async () => {
			const deps = createMockDeps()
			const url = 'https://example.com/models/test.glb?token=abc123'
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(result).toBe(url)
		})

		it('handles URL with hash fragment', async () => {
			const deps = createMockDeps()
			const url = 'https://example.com/models/test.glb#section'
			const result = await normalizeModelUrlForMeshy(deps, url)
			expect(result).toBe(url)
		})

		it('handles null/undefined input gracefully', async () => {
			const deps = createMockDeps()
			const result1 = await normalizeModelUrlForMeshy(deps, null as any)
			expect(result1).toBe('')
			const result2 = await normalizeModelUrlForMeshy(deps, undefined as any)
			expect(result2).toBe('')
		})
	})
})

describe('blobToBase64DataUri', () => {
	it('converts blob to base64 data URI', async () => {
		const content = 'Hello World'
		const blob = new Blob([content], { type: 'text/plain' })
		const result = await blobToBase64DataUri(blob)
		expect(result).toMatch(/^data:text\/plain;base64,SGVsbG8gV29ybGQ=$/)
	})

	it('handles binary data', async () => {
		const bytes = new Uint8Array([0, 1, 2, 255])
		const blob = new Blob([bytes], { type: 'application/octet-stream' })
		const result = await blobToBase64DataUri(blob)
		expect(result).toMatch(/^data:application\/octet-stream;base64,/)
		expect(result).toContain('AAEC/w==')
	})
})
