// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import {
	createServiceEvents,
	redact
} from '../../../../electron/backend/modules/deepseek-harness/serviceEvents.mjs'

describe('Harness events', () => {
	it('redacts process tokens before broadcast and keeps a bounded snapshot', () => {
		const send = vi.fn()
		const events = createServiceEvents(send)
		for (let i = 0; i < 2100; i++)
			events.log('stdout', `dsh web: http://127.0.0.1:3080/#token=private-${i}`)
		events.flush()
		expect(events.snapshot().logs).toHaveLength(2000)
		expect(JSON.stringify(send.mock.calls)).not.toContain('private-')
		expect(redact('api_key=secret sk-123secret')).not.toContain('secret')
		expect(
			redact('https://user:secret@example.com/repo.git Authorization: Bearer private-token')
		).not.toMatch(/secret|private-token/)
	})
	it('clears with a new epoch and monotonic cursor', () => {
		const events = createServiceEvents()
		events.log('system', 'old')
		const old = events.snapshot()
		events.clear()
		events.log('system', 'new')
		events.flush()
		const next = events.snapshot()
		expect(next.logs.map((e) => e.message)).toEqual(['new'])
		expect(next.epoch).toBe(old.epoch + 1)
		expect(next.seq).toBeGreaterThan(old.seq)
	})
})
