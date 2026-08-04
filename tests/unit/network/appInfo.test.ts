import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
	getAppInfo,
	getAppName,
	getAppVersion,
	openHomepage,
	openRepoUrl,
	openBilibili,
	openIssues,
	openExternalUrl,
	checkForUpdate,
	isSteamVersion
} from '@/network/appInfo'

describe('appInfo', () => {
	const originalWindowOpen = window.open
	const originalDweb = (window as any).dweb
	const originalRuntime = (window as any).__DWEB_RUNTIME__

	beforeEach(() => {
		vi.stubGlobal('open', vi.fn())
		vi.stubGlobal('dweb', undefined)
		vi.stubGlobal('__DWEB_RUNTIME__', undefined)
	})

	afterEach(() => {
		vi.restoreAllMocks()
		vi.unstubAllGlobals()
	})

	describe('getAppInfo', () => {
		it('returns compile-time defaults in web environment', () => {
			const info = getAppInfo()
			expect(info).toHaveProperty('appName')
			expect(info).toHaveProperty('appVersion')
			expect(info).toHaveProperty('copyright')
			expect(info).toHaveProperty('license')
			expect(info).toHaveProperty('homepage')
			expect(info).toHaveProperty('repoUrl')
			expect(info).toHaveProperty('bilibiliUrl')
			expect(info).toHaveProperty('issuesUrl')
		})

		it('returns app name from compile-time constants', () => {
			const info = getAppInfo()
			expect(info.appName).toBeTruthy()
			expect(typeof info.appName).toBe('string')
		})

		it('returns app version from compile-time constants', () => {
			const info = getAppInfo()
			expect(info.appVersion).toBeTruthy()
			expect(typeof info.appVersion).toBe('string')
		})

		it('caches the result', () => {
			const info1 = getAppInfo()
			const info2 = getAppInfo()
			expect(info1).toBe(info2)
		})
	})

	describe('getAppName', () => {
		it('returns app name as string', () => {
			const name = getAppName()
			expect(typeof name).toBe('string')
			expect(name.length).toBeGreaterThan(0)
		})
	})

	describe('getAppVersion', () => {
		it('returns version as string', () => {
			const version = getAppVersion()
			expect(typeof version).toBe('string')
			expect(version.length).toBeGreaterThan(0)
		})

		it('version follows semver-like format', () => {
			const version = getAppVersion()
			const parts = version.split('.')
			expect(parts.length).toBeGreaterThanOrEqual(2)
		})
	})

	describe('openExternal functions', () => {
		beforeEach(() => {
			vi.stubGlobal('open', vi.fn())
		})

		it('openHomepage opens homepage URL', () => {
			openHomepage()
			expect(window.open).toHaveBeenCalled()
			const callArgs = (window.open as any).mock.calls[0]
			expect(callArgs[0]).toContain('http')
		})

		it('openRepoUrl opens repository URL', () => {
			openRepoUrl()
			expect(window.open).toHaveBeenCalled()
			const callArgs = (window.open as any).mock.calls[0]
			expect(callArgs[0]).toContain('github.com')
		})

		it('openBilibili opens Bilibili URL', () => {
			openBilibili()
			expect(window.open).toHaveBeenCalled()
			const callArgs = (window.open as any).mock.calls[0]
			expect(callArgs[0]).toContain('bilibili')
		})

		it('openIssues opens issues URL', () => {
			openIssues()
			expect(window.open).toHaveBeenCalled()
			const callArgs = (window.open as any).mock.calls[0]
			expect(callArgs[0]).toContain('github.com')
			expect(callArgs[0]).toContain('issues')
		})

		it('openExternalUrl opens the given URL', () => {
			const testUrl = 'https://example.com'
			openExternalUrl(testUrl)
			expect(window.open).toHaveBeenCalledWith(testUrl, '_blank', 'noopener')
		})

		it('uses Electron openExternalUrl when available', () => {
			const mockOpenExternal = vi.fn()
			vi.stubGlobal('dweb', {
				common: {
					getAppInfo: () => ({
						appName: 'Test',
						appVersion: '1.0.0',
						copyright: '',
						license: '',
						homepage: 'https://test.com',
						repoUrl: 'https://github.com/test/test',
						bilibiliUrl: 'https://bilibili.com',
						issuesUrl: 'https://github.com/test/test/issues'
					}),
					openExternalUrl: mockOpenExternal
				}
			})
			const testUrl = 'https://example.com'
			openExternalUrl(testUrl)
			expect(mockOpenExternal).toHaveBeenCalledWith({ url: testUrl })
			expect(window.open).not.toHaveBeenCalled()
		})
	})

	describe('isSteamVersion', () => {
		it('returns false in web environment', async () => {
			const result = await isSteamVersion()
			expect(result).toBe(false)
		})

		it('returns false when dweb common is not available', async () => {
			vi.stubGlobal('__DWEB_RUNTIME__', { platform: 'electron', isElectron: true })
			const result = await isSteamVersion()
			expect(result).toBe(false)
		})

		it('returns true when isSteamVersion returns isSteam=true', async () => {
			vi.stubGlobal('__DWEB_RUNTIME__', { platform: 'electron', isElectron: true })
			vi.stubGlobal('dweb', {
				common: {
					isSteamVersion: vi.fn().mockResolvedValue({ ok: true, isSteam: true })
				}
			})
			const result = await isSteamVersion()
			expect(result).toBe(true)
		})

		it('returns false when isSteamVersion returns isSteam=false', async () => {
			vi.stubGlobal('__DWEB_RUNTIME__', { platform: 'electron', isElectron: true })
			vi.stubGlobal('dweb', {
				common: {
					isSteamVersion: vi.fn().mockResolvedValue({ ok: true, isSteam: false })
				}
			})
			const result = await isSteamVersion()
			expect(result).toBe(false)
		})

		it('handles errors gracefully and returns false', async () => {
			vi.stubGlobal('__DWEB_RUNTIME__', { platform: 'electron', isElectron: true })
			vi.stubGlobal('dweb', {
				common: {
					isSteamVersion: vi.fn().mockRejectedValue(new Error('test error'))
				}
			})
			const result = await isSteamVersion()
			expect(result).toBe(false)
		})
	})

	describe('checkForUpdate', () => {
		it('returns error in web environment', async () => {
			const result = await checkForUpdate()
			expect(result.ok).toBe(false)
			expect(result.error).toBe('Not running in Electron')
			expect(result.currentVersion).toBeTruthy()
		})

		it('returns error when dweb common is not available', async () => {
			vi.stubGlobal('__DWEB_RUNTIME__', { platform: 'electron', isElectron: true })
			const result = await checkForUpdate()
			expect(result.ok).toBe(false)
			expect(result.error).toBe('Update check not available')
			expect(result.currentVersion).toBeTruthy()
		})

		it('returns update available when hasUpdate is true', async () => {
			vi.stubGlobal('__DWEB_RUNTIME__', { platform: 'electron', isElectron: true })
			const mockResult = {
				ok: true,
				hasUpdate: true,
				currentVersion: '0.1.0',
				latestVersion: '0.2.0',
				releaseUrl: 'https://github.com/test/test/releases/tag/v0.2.0'
			}
			vi.stubGlobal('dweb', {
				common: {
					checkForUpdate: vi.fn().mockResolvedValue(mockResult)
				}
			})
			const result = await checkForUpdate()
			expect(result.ok).toBe(true)
			expect(result.hasUpdate).toBe(true)
			expect(result.currentVersion).toBe('0.1.0')
			expect(result.latestVersion).toBe('0.2.0')
		})

		it('returns no update when hasUpdate is false', async () => {
			vi.stubGlobal('__DWEB_RUNTIME__', { platform: 'electron', isElectron: true })
			const mockResult = {
				ok: true,
				hasUpdate: false,
				currentVersion: '0.1.0',
				latestVersion: '0.1.0'
			}
			vi.stubGlobal('dweb', {
				common: {
					checkForUpdate: vi.fn().mockResolvedValue(mockResult)
				}
			})
			const result = await checkForUpdate()
			expect(result.ok).toBe(true)
			expect(result.hasUpdate).toBe(false)
		})

		it('returns skipped for steam version', async () => {
			vi.stubGlobal('__DWEB_RUNTIME__', { platform: 'electron', isElectron: true })
			const mockResult = {
				ok: true,
				skipped: true,
				reason: 'steam',
				currentVersion: '0.1.0'
			}
			vi.stubGlobal('dweb', {
				common: {
					checkForUpdate: vi.fn().mockResolvedValue(mockResult)
				}
			})
			const result = await checkForUpdate()
			expect(result.ok).toBe(true)
			expect(result.skipped).toBe(true)
			expect(result.reason).toBe('steam')
		})

		it('handles errors gracefully', async () => {
			vi.stubGlobal('__DWEB_RUNTIME__', { platform: 'electron', isElectron: true })
			vi.stubGlobal('dweb', {
				common: {
					checkForUpdate: vi.fn().mockRejectedValue(new Error('network error'))
				}
			})
			const result = await checkForUpdate()
			expect(result.ok).toBe(false)
			expect(result.error).toBe('network error')
			expect(result.currentVersion).toBeTruthy()
		})
	})
})
