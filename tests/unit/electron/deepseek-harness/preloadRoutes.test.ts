// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'

const mocks = vi.hoisted(() => ({
	expose: vi.fn(),
	invoke: vi.fn(async () => ({ ok: true, value: {} }))
}))
vi.mock('electron', async () => {
	const { EventEmitter } = await import('node:events')
	return {
		contextBridge: { exposeInMainWorld: mocks.expose },
		ipcRenderer: Object.assign(new EventEmitter(), { invoke: mocks.invoke }),
		BrowserWindow: { getAllWindows: () => [] },
		dialog: {},
		shell: {}
	}
})

describe('Harness preload and backend route agreement', () => {
	it('maps every non-stream action to a registered handler and disposes event wrappers', async () => {
		await import('../../../../electron/preload.mjs')
		const { routes } =
			await import('../../../../electron/backend/modules/deepseek-harness/routes.mjs')
		const { ipcRenderer } = await import('electron')
		const api = mocks.expose.mock.calls.find(([name]) => name === 'dweb')![1].deepseekHarness.setup
		mocks.invoke.mockClear()
		const methods = [
			'listProfiles',
			'saveProfile',
			'removeProfile',
			'activateProfile',
			'selectPath',
			'probe',
			'getServiceStatus',
			'getServiceLogs',
			'clearServiceLogs',
			'startService',
			'stopService',
			'restartService',
			'cancelPrepare',
			'openUi'
		]
		for (const method of methods) await api[method]({ test: true })
		const channels = new Set(routes.map((r) => r.channel))
		for (const [channel] of mocks.invoke.mock.calls) expect(channels.has(channel)).toBe(true)
		const listener = vi.fn()
		const off = api.onServiceLog(listener)
		const emitter = ipcRenderer as unknown as EventEmitter
		emitter.emit('dweb:deepseek-harness:setup:service-log', { sensitiveElectronEvent: true }, [
			{ message: 'safe' }
		])
		expect(listener).toHaveBeenCalledWith([{ message: 'safe' }])
		off()
		expect(emitter.listenerCount('dweb:deepseek-harness:setup:service-log')).toBe(0)
	})
})
