import { describe, it, expect, vi, afterEach } from 'vitest'
import { callComfyRuntime } from '../../../src/electronBridge/comfyuiRuntime'

afterEach(() => vi.unstubAllGlobals())
describe('ComfyUI flat IPC contract', () => {
	it('preserves success fields and structured failure details', async () => {
		const success = { ok: true, promptId: 'submitted', resolution: { contentHash: 'v1' } }
		const failure = { ok: false, error: 'STALE_TEMPLATE', message: 'refresh required' }
		vi.stubGlobal('window', {
			dweb: {
				comfyui: {
					runtime: { run: vi.fn().mockResolvedValueOnce(success).mockResolvedValueOnce(failure) }
				}
			}
		})
		expect(await callComfyRuntime('run', {})).toEqual(success)
		expect(await callComfyRuntime('run', {})).toEqual(failure)
	})
	it('degrades without making an HTTP request when IPC is unavailable', async () => {
		vi.stubGlobal('window', {})
		const fetch = vi.fn()
		vi.stubGlobal('fetch', fetch)
		expect((await callComfyRuntime('list', {})).ok).toBe(false)
		expect(fetch).not.toHaveBeenCalled()
	})
})
