// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { SteamUgcAdapter } from '../../../../electron/backend/modules/workshop-templates/adapters/steam.mjs'

function createMockProvider(overrides = {}) {
	const userInfo = { displayName: 'TestUser', steamId: '12345' }
	return {
		isInitialized: () => true,
		isAvailable: () => true,
		isLoggedIn: () => true,
		getUserInfo: () => userInfo,
		ugc: {
			queryAll: vi.fn().mockResolvedValue({ ok: true, items: [], totalResults: 0 }),
			downloadItem: vi.fn().mockReturnValue({ ok: true }),
			getItemInstallInfo: vi.fn().mockReturnValue({ ok: true, installed: false }),
			getDownloadProgress: vi.fn().mockReturnValue(null),
			...overrides.ugc,
		},
		...overrides,
	}
}

describe('SteamUgcAdapter', () => {
	describe('getPlatformId / getPlatformName', () => {
		it('returns steam as platform id', () => {
			const adapter = new SteamUgcAdapter({ provider: createMockProvider() })
			expect(adapter.getPlatformId()).toBe('steam')
		})

		it('returns Steam Workshop as platform name', () => {
			const adapter = new SteamUgcAdapter({ provider: createMockProvider() })
			expect(adapter.getPlatformName()).toBe('Steam Workshop')
		})
	})

	describe('isAvailable', () => {
		it('returns false when no provider', () => {
			const adapter = new SteamUgcAdapter({})
			expect(adapter.isAvailable()).toBe(false)
		})

		it('returns false when provider isAvailable returns false', () => {
			const provider = createMockProvider({ isAvailable: () => false })
			const adapter = new SteamUgcAdapter({ provider })
			expect(adapter.isAvailable()).toBe(false)
		})

		it('returns false when provider has no ugc', () => {
			const provider = createMockProvider({ ugc: null })
			const adapter = new SteamUgcAdapter({ provider })
			expect(adapter.isAvailable()).toBe(false)
		})

		it('returns true when provider is available and has ugc.queryAll', () => {
			const adapter = new SteamUgcAdapter({ provider: createMockProvider() })
			expect(adapter.isAvailable()).toBe(true)
		})
	})

	describe('queryAll', () => {
		it('returns error when UGC not available (not initialized)', () => {
			const provider = createMockProvider({ isInitialized: () => false })
			const adapter = new SteamUgcAdapter({ provider })
			return adapter.queryAll({ tag: 'official' }).then(result => {
				expect(result.ok).toBe(false)
				expect(result.errMsg).toContain('not available')
			})
		})

		it('returns error when UGC not available (no user info and not logged in)', () => {
			const provider = createMockProvider({
				isLoggedIn: () => false,
				getUserInfo: () => null,
			})
			const adapter = new SteamUgcAdapter({ provider })
			return adapter.queryAll({ tag: 'official' }).then(result => {
				expect(result.ok).toBe(false)
			})
		})

		it('returns native result when no tag specified', async () => {
			const mockItems = [
				{ publishedFileId: '1', title: 'Item A', tags: [], isOfficial: false },
				{ publishedFileId: '2', title: 'Item B', tags: ['video'], isOfficial: false },
			]
			const provider = createMockProvider({
				ugc: {
					queryAll: vi.fn().mockResolvedValue({ ok: true, items: mockItems, totalResults: 2 }),
					downloadItem: vi.fn(),
					getItemInstallInfo: vi.fn(),
					getDownloadProgress: vi.fn(),
				},
			})
			const adapter = new SteamUgcAdapter({ provider })
			const result = await adapter.queryAll({})
			expect(result.ok).toBe(true)
			expect(result.items).toHaveLength(2)
			expect(result.totalResults).toBe(2)
		})

		it('marks all Steam items as official when tag=official (admin-publisher only channel)', async () => {
			const mockItems = [
				{ publishedFileId: '1', title: 'Example Template', tags: [], isOfficial: false },
				{ publishedFileId: '2', title: 'Video Template', tags: ['video'], isOfficial: false },
				{ publishedFileId: '3', title: 'Already Official', tags: ['official'], isOfficial: true },
			]
			const provider = createMockProvider({
				ugc: {
					queryAll: vi.fn().mockResolvedValue({ ok: true, items: mockItems, totalResults: 3 }),
					downloadItem: vi.fn(),
					getItemInstallInfo: vi.fn(),
					getDownloadProgress: vi.fn(),
				},
			})
			const adapter = new SteamUgcAdapter({ provider })
			const result = await adapter.queryAll({ tag: 'official' })
			expect(result.ok).toBe(true)
			expect(result.items).toHaveLength(3)
			expect(result.totalResults).toBe(3)
			for (const item of result.items) {
				expect(item.isOfficial).toBe(true)
			}
		})

		it('filters by non-official tag correctly', async () => {
			const mockItems = [
				{ publishedFileId: '1', title: 'Video', tags: ['video'], isOfficial: false },
				{ publishedFileId: '2', title: 'Image', tags: ['image'], isOfficial: false },
				{ publishedFileId: '3', title: 'Video 2', tags: ['video', 'official'], isOfficial: true },
			]
			const provider = createMockProvider({
				ugc: {
					queryAll: vi.fn().mockResolvedValue({ ok: true, items: mockItems, totalResults: 3 }),
					downloadItem: vi.fn(),
					getItemInstallInfo: vi.fn(),
					getDownloadProgress: vi.fn(),
				},
			})
			const adapter = new SteamUgcAdapter({ provider })
			const result = await adapter.queryAll({ tag: 'video' })
			expect(result.ok).toBe(true)
			expect(result.items).toHaveLength(2)
			expect(result.items.map(i => i.publishedFileId)).toEqual(['1', '3'])
		})

		it('returns empty result when native query returns ok but no items', async () => {
			const provider = createMockProvider({
				ugc: {
					queryAll: vi.fn().mockResolvedValue({ ok: true, items: [], totalResults: 0 }),
					downloadItem: vi.fn(),
					getItemInstallInfo: vi.fn(),
					getDownloadProgress: vi.fn(),
				},
			})
			const adapter = new SteamUgcAdapter({ provider })
			const result = await adapter.queryAll({ tag: 'official' })
			expect(result.ok).toBe(true)
			expect(result.items).toHaveLength(0)
		})

		it('returns error when native query fails', async () => {
			const provider = createMockProvider({
				ugc: {
					queryAll: vi.fn().mockResolvedValue({ ok: false, items: [], totalResults: 0, errMsg: 'Steam error' }),
					downloadItem: vi.fn(),
					getItemInstallInfo: vi.fn(),
					getDownloadProgress: vi.fn(),
				},
			})
			const adapter = new SteamUgcAdapter({ provider })
			const result = await adapter.queryAll({ tag: 'official' })
			expect(result.ok).toBe(false)
			expect(result.errMsg).toBe('Steam error')
		})
	})
})
