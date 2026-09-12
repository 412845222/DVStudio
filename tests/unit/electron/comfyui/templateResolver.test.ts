// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
vi.mock('electron', () => ({ app: { getPath: () => 'unused-test-cache' } }))
import {
	runtimeListWorkflowFiles,
	runtimeResolveHistoryPrompt,
	runtimeRunWorkflow
} from '../../../../electron/backend/modules/comfyui/service.mjs'
import { runtimeGetJobStatus } from '../../../../electron/backend/modules/comfyui/service.mjs'

const baseUrl = 'http://comfy'
const workflow = {
	id: 'same',
	nodes: [{ id: 1, type: 'PrimitiveStringMultiline', widgets_values: ['old'] }],
	links: []
}
const graph = {
	'1': { class_type: 'PrimitiveStringMultiline', inputs: { value: 'old' } },
	'2': { class_type: 'CustomOutput', inputs: { text: ['1', 0] } }
}
const history = {
	p: {
		prompt: [0, 'p', graph, { extra_pnginfo: { workflow } }, ['2']],
		status: { status_str: 'success', completed: true }
	}
}
function context(file: unknown = workflow) {
	const snapshots = new Map<string, unknown>()
	const post = vi.fn(async () => ({ ok: true, body: { prompt_id: 'submitted' } }))
	const get = vi.fn(async (url: string) => ({
		ok: true,
		body: url.includes('/userdata?')
			? ['saved.json']
			: url.includes('/userdata/')
				? file
				: url.includes('/object_info')
					? {}
					: history
	}))
	return {
		httpClient: { get, post },
		localdb: {
			comfyuiHistorySnapshots: {
				list: () => [...snapshots.values()],
				get: (_base: string, id: string) => snapshots.get(id),
				save: (_base: string, e: { promptId: string }) => snapshots.set(e.promptId, e)
			}
		}
	}
}

describe('ComfyUI template to task contract', () => {
	it('keeps positive and negative fields separate on the same custom node', async () => {
		const ctx = context({
			'1': { class_type: 'CustomPrompt', inputs: { positive_prompt: 'p', negative_prompt: 'n' } }
		})
		const run = await runtimeRunWorkflow(ctx, {
			baseUrl,
			workflowPath: 'workflows/api.json',
			positivePrompt: 'new-positive',
			negativePrompt: 'new-negative'
		})
		expect(run.ok).toBe(true)
		const calls = ctx.httpClient.post.mock.calls as any
		expect(calls[0][1].prompt['1'].inputs).toEqual({
			positive_prompt: 'new-positive',
			negative_prompt: 'new-negative'
		})
	})
	it('traces a negative text source through an encoder without breaking the socket', async () => {
		const g = {
			'1': { class_type: 'PrimitiveStringMultiline', inputs: { value: 'original' } },
			'2': { class_type: 'CLIPTextEncode', inputs: { text: ['1', 0] } },
			'3': { class_type: 'CustomSampler', inputs: { negative: ['2', 0] } }
		}
		const ctx = context(g)
		const resolved = await runtimeResolveHistoryPrompt(ctx, {
			baseUrl,
			workflowPath: 'workflows/api.json'
		})
		expect(resolved.negativeTextCount).toBe(1)
		await runtimeRunWorkflow(ctx, {
			baseUrl,
			workflowPath: 'workflows/api.json',
			negativePrompt: 'negative anchor'
		})
		const calls = ctx.httpClient.post.mock.calls as any
		expect(calls[0][1].prompt['1'].inputs.value).toBe('negative anchor')
		expect(calls[0][1].prompt['2'].inputs.text).toEqual(['1', 0])
	})
	it('normalizes old-server history and queue status when /api/jobs is unavailable', async () => {
		const get = vi.fn(async (url: string) =>
			url.includes('/api/jobs')
				? { ok: false, status: 404 }
				: { ok: true, body: url.endsWith('/queue') ? { queue_pending: [[1, 'waiting']] } : history }
		)
		const ctx = { httpClient: { get } }
		expect((await runtimeGetJobStatus(ctx, { baseUrl, promptId: 'p' })).result.status).toBe(
			'completed'
		)
		expect((await runtimeGetJobStatus(ctx, { baseUrl, promptId: 'waiting' })).result.status).toBe(
			'pending'
		)
	})
	it('lists successful history even when saved files exist', async () => {
		const r = await runtimeListWorkflowFiles(context(), { baseUrl })
		expect(r.workflows.map((w: { path: string }) => w.path)).toEqual([
			'workflows/saved.json',
			'history://p'
		])
	})
	it('reads API files without requiring a previous history match', async () => {
		const r = await runtimeResolveHistoryPrompt(context(graph), {
			baseUrl,
			workflowPath: 'workflows/api.json'
		})
		expect(r.ok).toBe(true)
		expect(r.hasHistory).toBe(false)
		expect(r.resolution.source).toBe('userdata-api')
	})
	it('runs the resolved snapshot, overrides the source, and preserves sockets', async () => {
		const ctx = context()
		const r = await runtimeResolveHistoryPrompt(ctx, {
			baseUrl,
			workflowPath: 'workflows/saved.json'
		})
		expect(r.ok).toBe(true)
		const run = await runtimeRunWorkflow(ctx, {
			baseUrl,
			workflowPath: 'workflows/saved.json',
			...r.resolution,
			positivePrompt: 'from DVStudio anchor'
		})
		expect(run.ok).toBe(true)
		const submitted = ctx.httpClient.post.mock.calls[0] as unknown as [
			string,
			{ prompt: typeof graph }
		]
		expect(submitted[0]).toBe(baseUrl + '/prompt')
		expect(submitted[1].prompt['1'].inputs.value).toBe('from DVStudio anchor')
		expect(submitted[1].prompt['2'].inputs.text).toEqual(['1', 0])
		expect(graph['1'].inputs.value).toBe('old')
	})
	it('rejects changed revisions before submitting', async () => {
		const ctx = context(graph)
		const run = await runtimeRunWorkflow(ctx, {
			baseUrl,
			workflowPath: 'workflows/api.json',
			contentHash: 'old-version'
		})
		expect(run.error).toBe('STALE_TEMPLATE')
		expect(ctx.httpClient.post).not.toHaveBeenCalled()
	})
	it('keeps default text when omitted and clears it only when explicitly supplied', async () => {
		const ctx = context(graph)
		await runtimeRunWorkflow(ctx, { baseUrl, workflowPath: 'workflows/api.json' })
		await runtimeRunWorkflow(ctx, {
			baseUrl,
			workflowPath: 'workflows/api.json',
			positivePrompt: ''
		})
		const calls = ctx.httpClient.post.mock.calls as unknown as Array<
			[string, { prompt: typeof graph }]
		>
		expect(calls[0][1].prompt['1'].inputs.value).toBe('old')
		expect(calls[1][1].prompt['1'].inputs.value).toBe('')
	})
	it('does not misclassify audio in an MP4 container as video', async () => {
		const ctx = context({
			'1': { class_type: 'LoadAudio', inputs: { audio: 'sound.mp4' } },
			'2': { class_type: 'VHS_LoadVideo', inputs: { video: 'clip.mp4' } }
		})
		const r = await runtimeResolveHistoryPrompt(ctx, {
			baseUrl,
			workflowPath: 'workflows/api.json'
		})
		expect(r.videoInputs.map((m: { nodeId: string }) => m.nodeId)).toEqual(['2'])
	})
	it('reads an archived successful snapshot after server history is cleared', async () => {
		const ctx = context()
		await runtimeListWorkflowFiles(ctx, { baseUrl })
		ctx.httpClient.get.mockImplementation(async () => ({ ok: true, body: {} }))
		const r = await runtimeResolveHistoryPrompt(ctx, { baseUrl, workflowPath: 'history://p' })
		expect(r.ok).toBe(true)
		expect(r.resolution.source).toBe('history-archive')
	})
})
