import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useDeepSeekHarnessServiceManager } from '../../../src/composables/useDeepSeekHarnessServiceManager'

const mock = vi.hoisted(() => ({
	snapshot: vi.fn(),
	listProfiles: vi.fn(),
	subscribe: vi.fn(),
	prepare: vi.fn()
}))
vi.mock('../../../src/electronBridge', () => ({
	hasDeepSeekHarness: () => true,
	deepseekHarness: mock
}))
afterEach(() => {
	vi.useRealTimers()
	vi.clearAllMocks()
})

describe('Harness frontend synchronization', () => {
	it('recovers events received during the initial snapshot and releases listeners', async () => {
		vi.useFakeTimers()
		const off = vi.fn()
		let listeners: { logs: (rows: unknown[]) => void; changed: (e: unknown) => void }
		mock.subscribe.mockImplementation((value) => {
			listeners = value
			return off
		})
		mock.listProfiles.mockResolvedValue({ records: [], activeProfileId: null, revision: 0 })
		const status = { lifecycle: 'running', ready: true, lastError: '' }
		let resolve!: (value: unknown) => void
		mock.snapshot
			.mockImplementationOnce(
				() =>
					new Promise((r) => {
						resolve = r
					})
			)
			.mockResolvedValue({
				status,
				seq: 11,
				epoch: 0,
				logs: [{ seq: 11, epoch: 0, message: 'new' }],
				preparing: null
			})
		let manager!: ReturnType<typeof useDeepSeekHarnessServiceManager>
		const wrapper = mount(
			defineComponent({
				setup() {
					manager = useDeepSeekHarnessServiceManager()
					return () => null
				}
			})
		)
		listeners!.logs([{ seq: 11, epoch: 0, message: 'new' }])
		resolve({ status, seq: 10, epoch: 0, logs: [], preparing: null })
		await flushPromises()
		await vi.advanceTimersByTimeAsync(160)
		expect(manager.logs.value.map((row) => row.message)).toEqual(['new'])
		expect(manager.status.value.lifecycle).toBe('running')
		wrapper.unmount()
		expect(off).toHaveBeenCalledOnce()
	})
	it('detaches the stream on unmount without stopping the global preparation', async () => {
		mock.subscribe.mockReturnValue(vi.fn())
		mock.listProfiles.mockResolvedValue({ records: [], activeProfileId: null, revision: 0 })
		mock.snapshot.mockResolvedValue({
			status: { lifecycle: 'stopped', lastError: '' },
			logs: [],
			seq: 0,
			epoch: 0,
			preparing: null
		})
		const release = vi.fn(async () => ({ done: true }))
		mock.prepare.mockReturnValue({
			[Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}), return: release })
		})
		let manager!: ReturnType<typeof useDeepSeekHarnessServiceManager>
		const wrapper = mount(
			defineComponent({
				setup() {
					manager = useDeepSeekHarnessServiceManager()
					return () => null
				}
			})
		)
		await flushPromises()
		const pending = manager.prepare({
			id: 'a',
			revision: 1,
			name: 'source',
			localPath: '/source',
			sourceKind: 'existing',
			repoUrl: '',
			requestedRef: '',
			nodePath: '',
			pnpmPath: '',
			port: 3080
		})
		wrapper.unmount()
		await pending
		expect(release).toHaveBeenCalled()
	})
})
