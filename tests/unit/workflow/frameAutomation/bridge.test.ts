import { afterEach, describe, expect, it, vi } from 'vitest'
import { frameAutomationRequest } from '../../../../src/electronBridge/frameAutomation'

afterEach(() => vi.unstubAllGlobals())
describe('frame automation IPC boundary', () => {
	it('passes a serializable copy and unwraps the shared IPC envelope', async () => {
		const create = vi.fn(async () => ({ ok: true, value: { id: 'run' } }))
		vi.stubGlobal('window', { dweb: { frameAutomation: { create } } })
		const payload = { projectId: 1, recipe: { nodes: ['a'] } }
		expect(await frameAutomationRequest('create', payload)).toEqual({ id: 'run' })
		expect(create.mock.calls[0][0]).toEqual(payload)
		expect(create.mock.calls[0][0]).not.toBe(payload)
	})
	it('surfaces backend errors and unavailable Electron bridges', async () => {
		vi.stubGlobal('window', {
			dweb: {
				frameAutomation: { create: async () => ({ ok: false, error: 'LOCALDB_UNAVAILABLE' }) }
			}
		})
		await expect(frameAutomationRequest('create', {})).rejects.toThrow('LOCALDB_UNAVAILABLE')
		vi.stubGlobal('window', {})
		await expect(frameAutomationRequest('create', {})).rejects.toThrow('自动化记录不可用')
	})
})
