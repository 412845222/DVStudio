// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import fixture from '../../../fixtures/comfyui/minimax-h3.json'
vi.mock('electron', () => ({ app: { getPath: () => 'unused-test-cache' } }))
import { workflowToPrompt } from '../../../../electron/backend/modules/comfyui/workflow-converter.mjs'
import {
	executionGraph,
	validatePromptInputs
} from '../../../../electron/backend/modules/comfyui/runtime/executionGraph.mjs'
import {
	runtimeResolveHistoryPrompt,
	runtimeRunWorkflow
} from '../../../../electron/backend/modules/comfyui/service.mjs'

const { workflow, objectInfo } = fixture
const baseUrl = 'http://comfy'
const workflowPath = 'workflows/minimax.json'
function context(file: unknown = workflow, history = {}) {
	return {
		httpClient: {
			get: vi.fn(async (url: string) => ({
				ok: true,
				body: url.includes('/object_info')
					? objectInfo
					: url.includes('/userdata/')
						? file
						: history
			})),
			post: vi.fn(async () => ({ ok: true, body: { prompt_id: 'submitted', node_errors: {} } }))
		}
	}
}

describe('MiniMax H3 saved UI workflow regression', () => {
	it('preserves linked widget slots, V3 enums and named VHS widgets', () => {
		const converted = workflowToPrompt(workflow, objectInfo)
		expect(converted.error).toBeFalsy()
		expect(converted.warnings || []).toEqual([])
		const graph = executionGraph(converted.prompt, objectInfo)
		expect(Object.keys(graph)).toHaveLength(19)
		for (const id of ['360', '363', '362']) expect(graph[id]).toBeUndefined()
		expect(graph['333'].inputs).toMatchObject({
			prompt: ['312', 0],
			task_type: 'Ref2VA',
			audio_mode: 'native',
			audio_denoise_strength: 1,
			ref_image_size: 'match',
			reference_video_policy: 'model_minimum',
			'ref_images.ref_image_0': ['375', 0]
		})
		expect(graph['328'].inputs).toMatchObject({
			frame_rate: 24,
			save_output: true,
			format: 'video/h264-mp4',
			loop_count: 0,
			filename_prefix: 'MiniMaxH3/exp_4v10a',
			pingpong: false
		})
		expect(graph['328'].inputs).not.toHaveProperty('videopreview')
		expect(validatePromptInputs(graph, objectInfo)).toEqual([])
	})
	it('resolves only active anchors and replaces the upstream prompt while targeting video', async () => {
		const ctx = context()
		const resolved = await runtimeResolveHistoryPrompt(ctx, { baseUrl, workflowPath })
		expect(resolved.ok, JSON.stringify(resolved)).toBe(true)
		expect(resolved.imageInputs.map((i: any) => i.nodeId)).toEqual(['375'])
		expect(resolved.textNodes.positive.map((i: any) => i.nodeId)).toEqual(['312'])
		const run = await runtimeRunWorkflow(ctx, {
			baseUrl,
			workflowPath,
			...resolved.resolution,
			positivePrompt: 'Replacement from the DVStudio text anchor'
		})
		expect(run.ok, JSON.stringify(run)).toBe(true)
		const payload = (ctx.httpClient.post.mock.calls as any)[0][1]
		expect(payload.prompt['312'].inputs.value).toBe('Replacement from the DVStudio text anchor')
		expect(payload.prompt['333'].inputs.prompt).toEqual(['312', 0])
		expect(payload.prompt['333'].inputs.task_type).toBe('Ref2VA')
		expect(payload.partial_execution_targets).toEqual(['328'])
	})
	it('rejects a corrupt API prompt before POST instead of running only the VRAM output', async () => {
		const graph = executionGraph(workflowToPrompt(workflow, objectInfo).prompt, objectInfo)
		delete graph['328'].inputs.frame_rate
		graph['333'].inputs.audio_denoise_strength = 768
		const ctx = context(graph)
		const run = await runtimeRunWorkflow(ctx, { baseUrl, workflowPath })
		expect(run.ok).toBe(false)
		expect(run.error).toBe('INVALID_TEMPLATE_INPUTS')
		expect(run.message).toContain('frame_rate')
		expect(run.message).toContain('audio_denoise_strength')
		expect(ctx.httpClient.post).not.toHaveBeenCalled()
	})
})
