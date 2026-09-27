// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
vi.mock('electron', () => ({ app: { getPath: () => 'unused-test-cache' } }))
import {
	runtimeResolveHistoryPrompt,
	runtimeRunWorkflow
} from '../../../../electron/backend/modules/comfyui/service.mjs'
import { refineMediaMappings } from '../../../../electron/backend/modules/comfyui/runtime/inputBindings.mjs'
import { nodeSchemaHash } from '../../../../electron/backend/modules/comfyui/runtime/capabilityProfile.mjs'

const baseUrl = 'http://comfy'
const workflowPath = 'local://fixture'
const graph = {
	'1': { class_type: 'LoadImage', inputs: { image: 'saved.png' } },
	'2': { class_type: 'SaveImage', inputs: { images: ['1', 0], filename_prefix: 'result.png' } },
	'3': { class_type: 'LoadImage', inputs: { image: 'disconnected.png' } }
}
const schema = {
	LoadImage: { input: { required: { image: [['saved.png'], { image_upload: true }] } } },
	SaveImage: {
		output_node: true,
		input: { required: { images: ['IMAGE'], filename_prefix: ['STRING'] } }
	}
}
function fixture() {
	const client = {
		get: vi.fn(async () => ({ ok: true, body: schema })),
		post: vi.fn(async () => ({ ok: true, body: { prompt_id: 'run' } }))
	}
	return { httpClient: client, localdb: { comfyuiWorkflows: { get: () => ({ data: graph }) } } }
}

describe('ComfyUI resolution/execution schema contract', () => {
	it('resolves and submits a saved ResolutionSelector workflow without successful history', async () => {
		const widgets = ['aspect_ratio', 'megapixels', 'multiple', 'preview']
		const workflow = {
			nodes: [
				{
					id: 313,
					type: 'ResolutionSelector',
					inputs: widgets.map((name) => ({ name, widget: { name }, link: null })),
					widgets_values: ['16:9', 0.1, 32]
				},
				{ id: 314, type: 'Output', inputs: [{ name: 'width', link: 1 }] }
			],
			links: [[1, 313, 0, 314, 0, 'INT']]
		}
		const info = {
			ResolutionSelector: {
				input: {
					required: { aspect_ratio: [['16:9']], megapixels: ['FLOAT'], multiple: ['INT'] },
					optional: { preview: ['RESOLUTION_PREVIEW', { socketless: true }] }
				}
			},
			Output: { output_node: true, input: { required: { width: ['INT'] } } }
		}
		const ctx = {
			localdb: { comfyuiWorkflows: { get: () => ({ data: workflow }) } },
			httpClient: {
				get: vi.fn(async (url: string) => ({
					ok: true,
					body: url.includes('/history')
						? {
								interrupted: {
									status: { status_str: 'error', messages: [['execution_interrupted', {}]] }
								}
							}
						: info
				})),
				post: vi.fn(async () => ({ ok: true, body: { prompt_id: 'run' } }))
			}
		}
		const resolved = await runtimeResolveHistoryPrompt(ctx, { baseUrl, workflowPath })
		expect(resolved.ok).toBe(true)
		expect(resolved.diagnostics.rejectedHistory).toEqual([
			{ promptId: 'interrupted', reason: 'interrupted' }
		])
		const run = await runtimeRunWorkflow(ctx, { baseUrl, workflowPath, ...resolved.resolution })
		expect(run.ok).toBe(true)
		const [, body] = ctx.httpClient.post.mock.calls[0] as unknown as [
			string,
			{ prompt: Record<string, { inputs: object }> }
		]
		expect(body.prompt['313'].inputs).toEqual({
			aspect_ratio: '16:9',
			megapixels: 0.1,
			multiple: 32
		})
		expect(run.diagnostics.resolverRevision).toContain('socketless')
	})
	it('uses the same reachable graph for anchors and submission, excluding output filenames', async () => {
		const ctx = fixture()
		const resolved = await runtimeResolveHistoryPrompt(ctx, { baseUrl, workflowPath })
		expect(resolved.imageInputs.map((m: { nodeId: string }) => m.nodeId)).toEqual(['1'])
		const result = await runtimeRunWorkflow(ctx, { baseUrl, workflowPath, ...resolved.resolution })
		expect(result.ok).toBe(true)
		const [, body] = ctx.httpClient.post.mock.calls[0] as unknown as [
			string,
			{ prompt: object; partial_execution_targets: string[] }
		]
		expect(Object.keys(body.prompt)).toEqual(['1', '2'])
		expect(body.partial_execution_targets).toEqual(['2'])
		expect(graph['3']).toBeDefined()
	})
	it('blocks changed node definitions before any upload/submission', async () => {
		const ctx = fixture()
		const resolved = await runtimeResolveHistoryPrompt(ctx, { baseUrl, workflowPath })
		ctx.httpClient.get.mockResolvedValue({
			ok: true,
			body: {
				...schema,
				LoadImage: {
					input: {
						required: { image: [['new.png'], { image_upload: true }] },
						optional: { newInput: ['STRING'] }
					}
				}
			}
		})
		const result = await runtimeRunWorkflow(ctx, { baseUrl, workflowPath, ...resolved.resolution })
		expect(result.error).toBe('DEPENDENCY_CHANGED')
		expect(ctx.httpClient.post).not.toHaveBeenCalled()
	})
	it('recognizes schema upload fields in custom nodes without guessing from string suffixes', () => {
		const custom = {
			'1': { class_type: 'Custom', inputs: { reference: '', label: 'caption.png' } }
		}
		const info = { images: [{ nodeId: '1', classType: 'Custom', inputKey: 'label' }], videos: [] }
		const result = refineMediaMappings(custom, info, {
			Custom: {
				input: { required: { reference: ['STRING', { image_upload: true }], label: ['STRING'] } }
			}
		})
		expect(result.images.map((m: { inputKey: string }) => m.inputKey)).toEqual(['reference'])
	})
	it('ignores unrelated installed nodes when fingerprinting the execution dependencies', () => {
		expect(nodeSchemaHash(graph, schema)).toBe(
			nodeSchemaHash(graph, { ...schema, Unrelated: { input: { required: { new: ['STRING'] } } } })
		)
	})
	it('does not invalidate a template when an upload adds a filename to the server inventory', () => {
		expect(nodeSchemaHash(graph, schema)).toBe(
			nodeSchemaHash(graph, {
				...schema,
				LoadImage: {
					input: { required: { image: [['saved.png', 'new.png'], { image_upload: true }] } }
				}
			})
		)
	})
	it('guards a POST timeout against accidental duplicate submission', async () => {
		const ctx = fixture()
		ctx.httpClient.post.mockRejectedValue(new Error('timeout'))
		const first = await runtimeRunWorkflow(ctx, { baseUrl, workflowPath })
		expect(first.error).toBe('SUBMISSION_UNKNOWN')
		const second = await runtimeRunWorkflow(ctx, { baseUrl, workflowPath })
		expect(second.error).toBe('SUBMISSION_UNKNOWN')
		expect(ctx.httpClient.post).toHaveBeenCalledTimes(1)
	})
})
