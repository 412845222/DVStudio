// @vitest-environment node
import { it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
vi.mock('electron', () => ({ app: { getPath: () => 'unused-test-cache' } }))
import { getHttpClient } from '../../../../electron/backend/core/http-client.mjs'
import {
	runtimeResolveHistoryPrompt,
	runtimeRunWorkflow,
	runtimeGetJobStatus,
	runtimeGetOutputs
} from '../../../../electron/backend/modules/comfyui/service.mjs'

// Explicit opt-in; executes the selected MiniMax workflow with its saved generation settings.
it.skipIf(!process.env.DVS_TEST_MINIMAX_WORKFLOW)(
	'drives MiniMax generation with an uploaded image and replacement text',
	async () => {
		const file = process.env.DVS_TEST_MINIMAX_WORKFLOW!
		const baseUrl = process.env.DVS_TEST_COMFY_URL || 'http://127.0.0.1:8188'
		const workflow = JSON.parse(fs.readFileSync(file, 'utf8'))
		const client = getHttpClient()
		const ctx = {
			httpClient: client,
			localdb: { comfyuiWorkflows: { get: () => ({ data: workflow }) } }
		}
		const workflowPath = 'local://minimax-live-test'
		const resolved = await runtimeResolveHistoryPrompt(ctx, { baseUrl, workflowPath })
		console.info(
			'MINIMAX_RESOLVED',
			JSON.stringify({
				ok: resolved.ok,
				error: resolved.error,
				message: resolved.message,
				nodes: resolved.nodeCount,
				images: resolved.imageInputs?.map((m: any) => m.nodeId),
				texts: resolved.textNodes?.positive?.map((m: any) => m.nodeId)
			})
		)
		fs.mkdirSync('AIPlan/minimax-investigation', { recursive: true })
		fs.writeFileSync('AIPlan/minimax-investigation/resolved.json', JSON.stringify(resolved))
		if (!process.env.DVS_TEST_MINIMAX_EXECUTE) {
			expect(resolved.ok).toBe(true)
			return
		}
		// Refuse to add a long GPU test while another task is active.
		const queue = await client.get(baseUrl + '/queue')
		const q = typeof queue.body === 'string' ? JSON.parse(queue.body) : queue.body
		expect((q.queue_running?.length || 0) + (q.queue_pending?.length || 0)).toBe(0)
		expect(resolved.ok, JSON.stringify(resolved)).toBe(true)
		expect(resolved.imageInputs).toHaveLength(1)
		const target = resolved.imageInputs[0]
		const sourceName = resolved.promptGraph[target.nodeId].inputs[target.inputKey]
		const inputDir = path.resolve(path.dirname(file), '../../..', 'input')
		const sourcePath = path.resolve(inputDir, sourceName)
		expect(sourcePath.startsWith(inputDir + path.sep)).toBe(true)
		const text =
			'A cinematic shot matching the supplied reference image. Keep the people, clothing and environment consistent. Subtle natural motion, a slow camera move, realistic ambient sound. No music, no captions, no split screen.'
		const submitted = await runtimeRunWorkflow(ctx, {
			baseUrl,
			workflowPath,
			...resolved.resolution,
			positivePrompt: text,
			files: [
				{
					name: 'dvstudio-minimax-' + Date.now() + path.extname(sourcePath),
					mediaType: 'image',
					bindingId: target.nodeId + ':' + target.inputKey,
					dataUrl: 'data:image/png;base64,' + fs.readFileSync(sourcePath).toString('base64')
				}
			]
		})
		fs.writeFileSync('AIPlan/minimax-investigation/submission.json', JSON.stringify(submitted))
		console.info('MINIMAX_SUBMITTED', JSON.stringify(submitted))
		expect(submitted.ok, JSON.stringify(submitted)).toBe(true)
		for (let n = 0; n < 360; n++) {
			const job = await runtimeGetJobStatus(ctx, { baseUrl, promptId: submitted.promptId })
			fs.writeFileSync('AIPlan/minimax-investigation/job.json', JSON.stringify(job))
			if (job.result?.status === 'completed') {
				const outputs = await runtimeGetOutputs(ctx, { baseUrl, promptId: submitted.promptId })
				fs.writeFileSync('AIPlan/minimax-investigation/result.json', JSON.stringify(outputs))
				expect(outputs.media.some((m: any) => m.kind === 'video')).toBe(true)
				const graph = outputs.result[submitted.promptId].prompt[2]
				expect(graph[target.nodeId].inputs[target.inputKey]).not.toBe(sourceName)
				expect(graph['312'].inputs.value).toBe(text)
				expect(graph['333'].inputs.prompt).toEqual(['312', 0])
				expect(graph['333'].inputs.task_type).toBe('Ref2VA')
				console.info(
					'MINIMAX_COMPLETED',
					JSON.stringify({ promptId: submitted.promptId, media: outputs.media })
				)
				return
			}
			expect(['failed', 'cancelled', 'not_found'], JSON.stringify(job)).not.toContain(
				job.result?.status
			)
			await new Promise((r) => setTimeout(r, 5000))
		}
		throw new Error(
			'MiniMax generation did not finish within 30 minutes; inspect its prompt id on the server'
		)
	},
	1830000
)
