// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createProcessManager } from '../../../../electron/backend/modules/deepseek-harness/processManager.mjs'

function fixture() {
	let close!: (value: { code: number }) => void
	let line!: (stream: string, line: string) => void
	const closed = new Promise((resolve) => {
		close = resolve
	})
	const proc = {
		child: { pid: 123 },
		ended: false,
		closed,
		stop: vi.fn(async () => {
			proc.ended = true
			close({ code: 0 })
		})
	}
	const spawn = vi.fn((_cmd, _args, opts) => {
		line = opts.onLine
		return proc
	})
	const events = { emit: vi.fn(), log: vi.fn() }
	const manager = createProcessManager(events, {
		spawn,
		probe: vi.fn(async () => ({ built: true, nodePath: '/node' })),
		portOpen: vi.fn(async () => false)
	})
	const profile = { id: 'a', revision: 1, localPath: '/source', port: 3080 }
	return {
		manager,
		profile,
		spawn,
		proc,
		ready: () => line('stdout', 'dsh web: http://127.0.0.1:3080/#token=private'),
		close
	}
}
describe('Harness lifecycle ownership', () => {
	it('coalesces repeated starts and waits for its own ready announcement', async () => {
		const f = fixture()
		f.manager.start(f.profile)
		f.manager.start(f.profile)
		await vi.waitFor(() => expect(f.spawn).toHaveBeenCalledTimes(1))
		expect(f.manager.snapshot().lifecycle).toBe('starting')
		f.ready()
		expect(f.manager.snapshot().lifecycle).toBe('running')
		expect(JSON.stringify(f.manager.snapshot())).not.toContain('private')
		await f.manager.stop()
		expect(f.proc.stop).toHaveBeenCalledTimes(1)
		expect(f.manager.snapshot().lifecycle).toBe('stopped')
	})
	it('stops during source validation without spawning later', async () => {
		let resolve!: (r: unknown) => void
		const spawn = vi.fn()
		const manager = createProcessManager(
			{ emit: vi.fn(), log: vi.fn() },
			{
				probe: () =>
					new Promise((r) => {
						resolve = r
					}),
				spawn,
				portOpen: async () => false
			}
		)
		manager.start({ id: 'a', revision: 1, port: 3080 })
		const stopping = manager.stop()
		resolve({ built: true, nodePath: '/node' })
		await stopping
		expect(spawn).not.toHaveBeenCalled()
		expect(manager.snapshot().lifecycle).toBe('stopped')
	})
	it('reports an occupied port without touching another process', async () => {
		const spawn = vi.fn()
		const manager = createProcessManager(
			{ emit: vi.fn(), log: vi.fn() },
			{ probe: async () => ({ built: true }), portOpen: async () => true, spawn }
		)
		manager.start({ id: 'a', revision: 1, port: 3080 })
		await vi.waitFor(() => expect(manager.snapshot().lifecycle).toBe('error'))
		expect(manager.snapshot().lastError).toContain('PORT_IN_USE')
		expect(spawn).not.toHaveBeenCalled()
	})
	it('does not report stopped when termination fails', async () => {
		const f = fixture()
		f.manager.start(f.profile)
		await vi.waitFor(() => expect(f.spawn).toHaveBeenCalled())
		f.proc.stop.mockRejectedValueOnce(new Error('stop timeout'))
		await expect(f.manager.stop()).rejects.toThrow('stop timeout')
		expect(f.manager.snapshot().pid).toBe(123)
		expect(f.manager.snapshot().lifecycle).toBe('error')
		await f.manager.stop()
	})
})
