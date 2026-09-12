// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
vi.mock('electron', () => ({ app: { getPath: () => 'unused-test-cache' } }))
import { getHttpClient } from '../../../../electron/backend/core/http-client.mjs'
import {
	runtimeResolveHistoryPrompt,
	runtimeRunWorkflow,
	runtimeGetJobStatus,
	runtimeGetOutputs,
	runtimeListWorkflowFiles
} from '../../../../electron/backend/modules/comfyui/service.mjs'

// Explicit opt-in: creates two tiny PNG outputs on the selected local ComfyUI server.
describe.skipIf(!process.env.DVS_TEST_COMFY_URL)(
	'live ComfyUI upload → execution → history replay',
	() => {
		it('reads each currently available successful history independently of saved templates', async () => {
			const baseUrl = process.env.DVS_TEST_COMFY_URL!
			const ctx = { httpClient: getHttpClient() }
			const list = await runtimeListWorkflowFiles(ctx, { baseUrl })
			expect(list.ok).toBe(true)
			const histories = list.workflows.filter((w: { source: string }) => w.source === 'history')
			expect(histories.length).toBeGreaterThan(0)
			for (const workflow of histories) {
				const resolved = await runtimeResolveHistoryPrompt(ctx, {
					baseUrl,
					workflowPath: workflow.path
				})
				expect(resolved.ok, workflow.path).toBe(true)
				expect(resolved.hasHistory).toBe(true)
				expect(resolved.nodeCount).toBeGreaterThan(0)
			}
			console.info(
				'LIVE_COMFY_DISCOVERY',
				JSON.stringify({
					successes: histories.length,
					saved: list.workflows.length - histories.length,
					complete: list.scanComplete
				})
			)
		}, 60000)
		it('submits a bound image, retrieves output, discovers and replays its successful snapshot', async () => {
			const baseUrl = process.env.DVS_TEST_COMFY_URL!
			const stamp = Date.now().toString()
			const graph = {
				'1': { class_type: 'LoadImage', inputs: { image: 'must-be-replaced.png' } },
				'2': {
					class_type: 'SaveImage',
					inputs: { images: ['1', 0], filename_prefix: 'DVStudio_Comfy_smoke/' + stamp }
				}
			}
			const snapshots = new Map()
			const ctx = {
				httpClient: getHttpClient(),
				localdb: {
					comfyuiWorkflows: { get: () => ({ data: graph }), list: () => [] },
					comfyuiHistorySnapshots: {
						list: () => [...snapshots.values()],
						get: (_: string, id: string) => snapshots.get(id),
						save: (_: string, e: { promptId: string }) => snapshots.set(e.promptId, e)
					}
				}
			}
			// Use the production HTTP client and production service; only the workflow repository is isolated.
			const workflowPath = 'local://smoke'
			const resolved = await runtimeResolveHistoryPrompt(ctx, { baseUrl, workflowPath })
			expect(resolved.ok, JSON.stringify(resolved)).toBe(true)
			const dataUrl =
				'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAI0lEQVR4nGN067nEQApgIkk1w6gG4gATkergYFQDMYDkUAIANscBxEKl3ckAAAAASUVORK5CYII='
			const first = await runtimeRunWorkflow(ctx, {
				baseUrl,
				workflowPath,
				...resolved.resolution,
				files: [
					{
						name: 'dvstudio-smoke-' + stamp + '.png',
						mediaType: 'image',
						bindingId: '1:image',
						dataUrl
					}
				]
			})
			expect(first.ok, JSON.stringify(first)).toBe(true)
			async function waitForOutput(promptId: string) {
				for (let i = 0; i < 40; i++) {
					const job = await runtimeGetJobStatus(ctx, { baseUrl, promptId })
					expect(job.ok, JSON.stringify(job)).toBe(true)
					if (job.result.status === 'completed') {
						const outputs = await runtimeGetOutputs(ctx, { baseUrl, promptId })
						expect(outputs.media).toHaveLength(1)
						return outputs.media[0]
					}
					expect(['failed', 'cancelled', 'not_found']).not.toContain(job.result.status)
					await new Promise((r) => setTimeout(r, 500))
				}
				throw new Error('ComfyUI smoke timed out')
			}
			const output = await waitForOutput(first.promptId)
			const list = await runtimeListWorkflowFiles(ctx, { baseUrl })
			expect(
				list.workflows.some((w: { path: string }) => w.path === 'history://' + first.promptId)
			).toBe(true)
			const replay = await runtimeRunWorkflow(ctx, {
				baseUrl,
				workflowPath: 'history://' + first.promptId
			})
			expect(replay.ok, JSON.stringify(replay)).toBe(true)
			await waitForOutput(replay.promptId)
			console.info(
				'LIVE_COMFY_RECEIPT',
				JSON.stringify({
					first: first.promptId,
					replay: replay.promptId,
					output,
					archived: snapshots.size
				})
			)
		}, 60000)
	}
)
