import { describe, it, expect, vi, afterEach } from 'vitest'
import { deepseekHarness, hasDeepSeekHarness } from '../../../src/electronBridge/deepseekHarness'

afterEach(() => vi.unstubAllGlobals())
describe('Harness typed bridge', () => {
	it('fails gracefully without the desktop namespace', async () => {
		vi.stubGlobal('dweb', undefined)
		expect(hasDeepSeekHarness()).toBe(false)
		await expect(deepseekHarness.listProfiles()).rejects.toThrow('桌面客户端')
	})
	it('unwraps responses and unsubscribes all named events', async () => {
		const off = vi.fn()
		const on = vi.fn(() => off)
		vi.stubGlobal('dweb', {
			deepseekHarness: {
				setup: {
					listProfiles: vi.fn(async () => ({
						ok: true,
						value: { records: [], revision: 0, activeProfileId: null }
					})),
					onServiceLog: on,
					onServiceStatusChange: on,
					onServiceExit: on,
					onServiceLogsCleared: on,
					onConfigChange: on
				}
			}
		})
		expect(await deepseekHarness.listProfiles()).toEqual({
			records: [],
			revision: 0,
			activeProfileId: null
		})
		const unsubscribe = deepseekHarness.subscribe({ logs: vi.fn(), changed: vi.fn() })
		unsubscribe()
		expect(off).toHaveBeenCalledTimes(5)
	})
	it('propagates backend validation failures', async () => {
		vi.stubGlobal('dweb', {
			deepseekHarness: {
				setup: { listProfiles: vi.fn(async () => ({ ok: false, error: '数据库尚未就绪' })) }
			}
		})
		await expect(deepseekHarness.listProfiles()).rejects.toThrow('数据库尚未就绪')
	})
})
