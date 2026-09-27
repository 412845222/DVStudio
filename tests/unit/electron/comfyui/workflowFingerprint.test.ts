// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { semanticWorkflowHash } from '../../../../electron/backend/modules/comfyui/runtime/workflowFingerprint.mjs'
import { resolveTemplate } from '../../../../electron/backend/modules/comfyui/runtime/templateResolver.mjs'

const workflow = {
	id: 'family',
	nodes: [
		{
			id: 1,
			type: 'Custom',
			widgets_values: ['original'],
			properties: { ver: '1', custom: 'keep' },
			pos: [0, 0]
		},
		{ id: 2, type: 'Output' },
		{ id: 3, type: 'Output' }
	],
	links: [
		[1, 1, 0, 2, 0, 'STRING'],
		[2, 1, 0, 3, 0, 'STRING']
	]
}
const graph = { '1': { class_type: 'Custom', inputs: { text: 'original' } } }
const entry = {
	prompt: [0, 'p', graph, { extra_pnginfo: { workflow } }, ['1']],
	status: { status_str: 'success' }
}
const client = {
	get: async (url: string) =>
		url.includes('/history') ? { ok: true, body: { p: entry } } : { ok: false, status: 503 }
}

describe('semantic workflow matching', () => {
	it.each([false, true])(
		'compares every executed input before matching frontend serialization changes (changed=%s)',
		async (changed) => {
			const saved = {
				nodes: [
					{
						id: 1,
						type: 'Output',
						inputs: [{ name: 'text', widget: { name: 'text' }, localized_name: 'Text' }],
						widgets_values: ['private-text']
					}
				],
				links: []
			}
			const previous = structuredClone(saved)
			previous.nodes[0].inputs = []
			const prompt = {
				'1': { class_type: 'Output', inputs: { text: changed ? 'different' : 'private-text' } }
			}
			const history = {
				p: {
					status: { status_str: 'success' },
					prompt: [0, 'p', prompt, { extra_pnginfo: { workflow: previous } }]
				}
			}
			const params = {
				client: {
					get: async (url: string) => ({
						ok: true,
						body: url.includes('/history')
							? history
							: { Output: { output_node: true, input: { required: { text: ['STRING'] } } } }
					})
				},
				base: 'http://comfy',
				workflowPath: 'file.json',
				readWorkflow: async () => ({ ok: true, workflow: saved })
			}
			const result = await resolveTemplate(params)
			expect(result.ok).toBe(true)
			expect(result.hasHistory).toBe(!changed)
			expect(result.diagnostics.associationState).toBe(changed ? 'direct' : 'executable')
			expect(JSON.stringify(result.diagnostics)).not.toContain('private-text')
			const pinned = await resolveTemplate({ ...params, snapshotId: 'p' })
			expect(pinned.ok).toBe(!changed)
			if (changed) expect(pinned.error).toBe('STALE_TEMPLATE')
		}
	)
	it('matches registry metadata and layout changes with reordered links', async () => {
		const changed = structuredClone(workflow)
		changed.nodes[0].properties!.ver = '2'
		changed.nodes[0].pos = [90, 90]
		changed.links.reverse()
		expect(semanticWorkflowHash(changed)).toBe(semanticWorkflowHash(workflow))
		const result = await resolveTemplate({
			client,
			base: 'http://comfy',
			workflowPath: 'file.json',
			readWorkflow: async () => ({ ok: true, workflow: changed })
		})
		expect(result.ok).toBe(true)
		expect(result.diagnostics.associationState).toBe('semantic')
	})
	it('does not erase unknown extension semantics, seeds or text changes', () => {
		for (const mutate of [
			(w: typeof workflow) => {
				w.nodes[0].properties!.custom = 'different'
			},
			(w: typeof workflow) => {
				w.nodes[0].widgets_values = ['different']
			},
			(w: typeof workflow) => {
				w.links[0][2] = 1
			}
		]) {
			const changed = structuredClone(workflow)
			mutate(changed)
			expect(semanticWorkflowHash(changed)).not.toBe(semanticWorkflowHash(workflow))
		}
	})
	it('normalizes subgraph geometry but retains its executable values', () => {
		const original = { ...workflow, definitions: { subgraphs: [structuredClone(workflow)] } }
		const changed = structuredClone(original)
		changed.definitions.subgraphs[0].nodes[0].pos = [45, 45]
		expect(semanticWorkflowHash(changed)).toBe(semanticWorkflowHash(original))
		changed.definitions.subgraphs[0].nodes[0].widgets_values = ['new']
		expect(semanticWorkflowHash(changed)).not.toBe(semanticWorkflowHash(original))
	})
	it('offers successful candidates when the selected file is empty', async () => {
		const result = await resolveTemplate({
			client,
			base: 'http://comfy',
			workflowPath: 'empty.json',
			readWorkflow: async () => ({ ok: false, code: 'WORKFLOW_EMPTY_FILE', error: 'empty' })
		})
		expect(result.error).toBe('WORKFLOW_EMPTY_FILE')
		expect(result.candidates[0].path).toBe('history://p')
	})
	it('never substitutes another history when a selected snapshot has disappeared', async () => {
		const result = await resolveTemplate({
			client,
			base: 'http://comfy',
			workflowPath: 'file.json',
			snapshotId: 'missing',
			readWorkflow: async () => ({ ok: true, workflow })
		})
		expect(result.error).toBe('STALE_TEMPLATE')
	})
	it('exposes archive failures even when online execution remains possible', async () => {
		const result = await resolveTemplate({
			client,
			base: 'http://comfy',
			workflowPath: 'history://p',
			repo: {
				get: () => null,
				save: () => {
					throw new Error('disk full')
				}
			}
		})
		expect(result.ok).toBe(true)
		expect(result.diagnostics.archiveState).toBe('failed')
		expect(result.warnings.length).toBeGreaterThan(0)
	})
})
