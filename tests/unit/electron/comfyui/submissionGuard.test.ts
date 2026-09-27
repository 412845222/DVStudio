// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { submissionGuard } from '../../../../electron/backend/modules/comfyui/runtime/submissionGuard.mjs'

describe('ComfyUI uncertain submission recovery', () => {
	it('does not resubmit a lost response, and recovers old servers by request metadata', async () => {
		let history = {}
		const ctx = {
			httpClient: {
				get: async (url: string) => ({
					ok: true,
					body: url.includes('history') ? history : { queue_running: [], queue_pending: [] }
				})
			}
		}
		const guard = submissionGuard(ctx, 'http://comfy', 'file')
		const id = guard.begin()
		guard.finish(id, 'submission_unknown')
		expect((await guard.reconcile()).error).toBe('SUBMISSION_UNKNOWN')
		history = { remote: { prompt: [0, 'remote', {}, { dvstudio_request_id: id }] } }
		expect((await guard.reconcile()).promptId).toBe('remote')
		expect(await guard.reconcile()).toBeNull()
	})
	it('only permits an explicitly confirmed retry after successful queue and history reads', async () => {
		let online = false
		const ctx = {
			httpClient: {
				get: async () => (online ? { ok: true, body: {} } : { ok: false, status: 503 })
			}
		}
		const guard = submissionGuard(ctx, 'http://comfy', 'file')
		guard.begin()
		expect((await guard.reconcile(true)).error).toBe('SUBMISSION_UNKNOWN')
		online = true
		expect(await guard.reconcile(true)).toBeNull()
	})
	it('persists unresolved request identity across client restart using the job repository', async () => {
		const rows = new Map()
		const repo = {
			get: (id: string) => rows.get(id),
			create: ({ id }: { id: string }) => {
				rows.set(id, {})
				return { ok: true }
			},
			updateStatus: (id: string, value: unknown) => {
				rows.set(id, value)
				return { ok: true }
			}
		}
		const context = () => ({
			localdb: { comfyuiJobs: repo },
			httpClient: { get: async () => ({ ok: true, body: {} }) }
		})
		const first = submissionGuard(context(), 'http://comfy', 'file')
		first.begin()
		expect((await submissionGuard(context(), 'http://comfy', 'file').reconcile()).error).toBe(
			'SUBMISSION_UNKNOWN'
		)
	})
})

it('isolates explicit frame triggers from unfinished earlier sessions and ordinary node submissions', async () => {
	const ctx = { httpClient: { get: async () => ({ ok: true, body: {} }) } }
	const original = submissionGuard(ctx, 'http://comfy', 'file')
	original.begin()
	const first = submissionGuard(ctx, 'http://comfy', 'file', 'frame:first')
	expect(await first.reconcile()).toBeNull()
	first.begin()
	const second = submissionGuard(ctx, 'http://comfy', 'file', 'frame:second')
	expect(await second.reconcile()).toBeNull()
	expect((await first.reconcile()).error).toBe('SUBMISSION_UNKNOWN')
	expect((await original.reconcile()).error).toBe('SUBMISSION_UNKNOWN')
})
