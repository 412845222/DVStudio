import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
	isWindowMaximized,
	minimizeWindow,
	toggleMaximizeWindow,
	closeWindow,
	reloadWindow,
	openDevTools
} from '@/electronBridge'

describe('electronBridge window controls', () => {
	const originalDweb = window.dweb

	beforeEach(() => {
		window.dweb = {
			...originalDweb,
			window: {
				minimize: vi.fn().mockResolvedValue({ ok: true }),
				toggleMaximize: vi.fn().mockResolvedValue({ ok: true, maximized: true }),
				isMaximized: vi.fn().mockResolvedValue({ ok: true, maximized: false }),
				close: vi.fn().mockResolvedValue({ ok: true }),
				reload: vi.fn().mockResolvedValue({ ok: true }),
				openDevTools: vi.fn().mockResolvedValue({ ok: true, opened: true })
			}
		} as any
	})

	afterEach(() => {
		window.dweb = originalDweb
	})

	describe('isWindowMaximized', () => {
		it('returns maximized state when Electron API is available', async () => {
			;(window.dweb.window.isMaximized as any).mockResolvedValue({ ok: true, maximized: true })
			const result = await isWindowMaximized()
			expect(result.ok).toBe(true)
			expect(result.maximized).toBe(true)
		})

		it('returns not maximized state when window is normal', async () => {
			;(window.dweb.window.isMaximized as any).mockResolvedValue({ ok: true, maximized: false })
			const result = await isWindowMaximized()
			expect(result.ok).toBe(true)
			expect(result.maximized).toBe(false)
		})

		it('returns error when not running in Electron', async () => {
			window.dweb = undefined as any
			const result = await isWindowMaximized()
			expect(result.ok).toBe(false)
			expect(result.error).toBe('Not running in Electron.')
		})

		it('returns ok: true when API returns undefined', async () => {
			;(window.dweb.window.isMaximized as any).mockResolvedValue(undefined)
			const result = await isWindowMaximized()
			expect(result.ok).toBe(true)
		})

		it('handles API exceptions gracefully', async () => {
			;(window.dweb.window.isMaximized as any).mockRejectedValue(new Error('Test error'))
			const result = await isWindowMaximized()
			expect(result.ok).toBe(false)
			expect(result.error).toBe('Test error')
		})
	})

	describe('minimizeWindow', () => {
		it('calls minimize API successfully', async () => {
			const result = await minimizeWindow()
			expect(result.ok).toBe(true)
			expect(window.dweb.window.minimize).toHaveBeenCalled()
		})

		it('returns error when not running in Electron', async () => {
			window.dweb = undefined as any
			const result = await minimizeWindow()
			expect(result.ok).toBe(false)
			expect(result.error).toBe('Not running in Electron.')
		})

		it('handles exceptions gracefully', async () => {
			;(window.dweb.window.minimize as any).mockRejectedValue(new Error('Minimize failed'))
			const result = await minimizeWindow()
			expect(result.ok).toBe(false)
			expect(result.error).toBe('Minimize failed')
		})
	})

	describe('toggleMaximizeWindow', () => {
		it('toggles maximize and returns new state', async () => {
			;(window.dweb.window.toggleMaximize as any).mockResolvedValue({ ok: true, maximized: true })
			const result = await toggleMaximizeWindow()
			expect(result.ok).toBe(true)
			expect(result.maximized).toBe(true)
		})

		it('returns error when not running in Electron', async () => {
			window.dweb = undefined as any
			const result = await toggleMaximizeWindow()
			expect(result.ok).toBe(false)
			expect(result.error).toBe('Not running in Electron.')
		})

		it('handles exceptions gracefully', async () => {
			;(window.dweb.window.toggleMaximize as any).mockRejectedValue(new Error('Toggle failed'))
			const result = await toggleMaximizeWindow()
			expect(result.ok).toBe(false)
			expect(result.error).toBe('Toggle failed')
		})
	})

	describe('closeWindow', () => {
		it('calls close API successfully', async () => {
			const result = await closeWindow()
			expect(result.ok).toBe(true)
			expect(window.dweb.window.close).toHaveBeenCalled()
		})

		it('returns error when not running in Electron', async () => {
			window.dweb = undefined as any
			const result = await closeWindow()
			expect(result.ok).toBe(false)
			expect(result.error).toBe('Not running in Electron.')
		})
	})

	describe('reloadWindow', () => {
		it('calls reload API successfully', async () => {
			const result = await reloadWindow()
			expect(result.ok).toBe(true)
			expect(window.dweb.window.reload).toHaveBeenCalled()
		})

		it('returns error when not running in Electron', async () => {
			window.dweb = undefined as any
			const result = await reloadWindow()
			expect(result.ok).toBe(false)
			expect(result.error).toBe('Not running in Electron.')
		})
	})

	describe('openDevTools', () => {
		it('calls openDevTools API and returns opened state', async () => {
			const result = await openDevTools()
			expect(result.ok).toBe(true)
			expect(result.opened).toBe(true)
			expect(window.dweb.window.openDevTools).toHaveBeenCalled()
		})

		it('returns error when not running in Electron', async () => {
			window.dweb = undefined as any
			const result = await openDevTools()
			expect(result.ok).toBe(false)
			expect(result.error).toBe('Not running in Electron.')
		})
	})
})
