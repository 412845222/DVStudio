// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import {
	normalizeHistoryEntry,
	scanHistory,
	workflowHash,
	unwrapPrompt
} from '../../../../electron/backend/modules/comfyui/runtime/historyCatalog.mjs'

const graph = { '1': { class_type: 'CustomOutput', inputs: { text: 'original' } } }
const entry = (id = 'p') => ({
	prompt: [0, id, graph, {}, ['1']],
	status: {
		status_str: 'success',
		completed: true,
		messages: [['execution_success', { timestamp: 1789237753942 }]]
	}
})

describe('ComfyUI history catalog', () => {
	it('accepts a single custom API node and reads modern timestamps', () => {
		expect(unwrapPrompt({ prompt: graph })).toEqual(graph)
		expect(normalizeHistoryEntry('p', entry()).timestamp).toBe(1789237753942)
		expect(
			normalizeHistoryEntry('p', { ...entry(), status: { status_str: 'error', completed: true } })
		).toBeNull()
		expect(unwrapPrompt({ '1': { class_type: 'X', inputs: { value: ['missing', 0] } } })).toBeNull()
	})
	it('scans past 200 entries and includes archived history', async () => {
		const rows = Object.fromEntries(
			Array.from({ length: 230 }, (_, i) => ['p' + i, entry('p' + i)])
		)
		const get = vi.fn(async (url: string) => {
			const u = new URL(url),
				offset = Number(u.searchParams.get('offset') ?? 30)
			return {
				ok: true,
				body: Object.fromEntries(Object.entries(rows).slice(offset, offset + 200))
			}
		})
		const save = vi.fn()
		const result = await scanHistory({ get }, 'http://comfy', {
			list: () => [normalizeHistoryEntry('archived', entry())],
			save
		})
		expect(result.complete).toBe(true)
		expect(result.entries).toHaveLength(231)
		expect(result.entries.some((e: { promptId: string }) => e.promptId === 'p0')).toBe(true)
		expect(save).toHaveBeenCalled()
	})
	it('does not loop on servers ignoring offset and preserves errors', async () => {
		const body = Object.fromEntries(Array.from({ length: 200 }, (_, i) => ['p' + i, entry()]))
		const result = await scanHistory({ get: async () => ({ ok: true, body }) }, 'http://old')
		expect(result.complete).toBe(false)
		const failed = await scanHistory(
			{
				get: async () => {
					throw new Error('timeout')
				}
			},
			'http://offline'
		)
		expect(failed.failure.error).toBe('HISTORY_UNREACHABLE')
	})
	it('ignores layout/notes but distinguishes execution revisions', () => {
		const w = {
			id: 'same-id',
			nodes: [{ id: 1, type: 'X', widgets_values: ['a'], pos: [0, 0] }],
			links: []
		}
		expect(workflowHash(w)).toBe(
			workflowHash({
				...w,
				nodes: [
					{ ...w.nodes[0], pos: [9, 9] },
					{ id: 2, type: 'MarkdownNote' }
				]
			})
		)
		expect(workflowHash(w)).not.toBe(
			workflowHash({ ...w, nodes: [{ ...w.nodes[0], widgets_values: ['b'] }] })
		)
	})
})
