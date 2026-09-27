import { describe, it, expect, vi, afterEach } from 'vitest'
import type { WorkflowState, SavedSelectionFrame } from '../../../../src/aiworkflow/types'
import {
	executeFrameComfy,
	applyFrameComfyResult,
	frameComfyOutputPatch
} from '../../../../src/views/AIWorkflow/automation/frameComfyExecutor'
import {
	captureFrameRecipe,
	createFrameExecutionState
} from '../../../../src/views/AIWorkflow/automation/frameExecutionContext'
import { createFrameRunCoordinator } from '../../../../src/views/AIWorkflow/automation/frameRunCoordinator'
const journal = vi.hoisted(() => ({ events: [] as any[] }))
vi.mock('../../../../src/electronBridge/frameAutomation', () => ({
	frameAutomationRequest: vi.fn(async (action, p) => {
		if (action === 'create') return { id: crypto.randomUUID() }
		if (action === 'append') journal.events.push(p)
		return {}
	})
}))
vi.mock('../../../../src/i18n', () => ({ t: (key: string) => key }))
function fixture() {
	const frame = {
		id: 'f',
		nodeIds: ['image', 'comfy'],
		automation: {
			enabled: true,
			loopCount: 1,
			inputBindings: [
				{ id: 'input', nodeId: 'image', anchorId: 'in-0', bindingMode: 'target-input' }
			],
			outputBindings: [{ id: 'output', nodeId: 'comfy', anchorId: 'out-328' }]
		}
	} as SavedSelectionFrame
	const state = {
		nodesById: {
			image: {
				id: 'image',
				type: 'image',
				resourceId: 'old',
				inputs: [{ id: 'in-0' }],
				outputs: [{ id: 'out-0', mediaType: 'image' }]
			},
			external: {
				id: 'external',
				type: 'image',
				resourceId: 'new',
				inputs: [],
				outputs: [{ id: 'out-0', mediaType: 'image' }]
			},
			comfy: {
				id: 'comfy',
				type: 'comfyui',
				inputs: [{ id: 'in-0', mediaType: 'image' }],
				outputs: [{ id: 'out-328', mediaType: 'video' }],
				comfyuiSettings: {
					baseUrl: 'http://127.0.0.1:8188',
					workflowPath: 'workflow.json',
					templateResolution: {
						snapshotId: 'snapshot',
						contentHash: 'hash',
						workflowHash: 'workflow'
					},
					inputBindings: { internal: '12:image' },
					historyInputMappings: {
						imageInputs: [{ nodeId: '12', inputKey: 'image', classType: 'LoadImage' }],
						videoInputs: []
					}
				}
			}
		},
		nodesOrder: ['image', 'comfy', 'external'],
		resourcesById: {
			old: {
				id: 'old',
				kind: 'image',
				name: 'old.png',
				url: 'data:image/png;base64,AA==',
				projectRelativePath: 'old.png'
			},
			new: {
				id: 'new',
				kind: 'image',
				name: 'new.png',
				url: 'data:image/png;base64,AA==',
				projectRelativePath: 'new.png'
			}
		},
		edgesById: {
			external: {
				id: 'external',
				fromNodeId: 'external',
				fromAnchorId: 'out-0',
				toNodeId: 'image',
				toAnchorId: 'in-0'
			},
			internal: {
				id: 'internal',
				fromNodeId: 'image',
				fromAnchorId: 'out-0',
				toNodeId: 'comfy',
				toAnchorId: 'in-0'
			}
		},
		edgeOrder: ['external', 'internal'],
		savedSelectionFrames: [frame],
		nodeGenerationTaskIdsByNodeId: {},
		nodeGenerationTasksById: {}
	} as unknown as WorkflowState
	const recipe = captureFrameRecipe(state, frame)
	const context = {
		state: createFrameExecutionState(state, recipe),
		anchors: ['out-328'],
		assertActive: vi.fn(),
		onSubmitting: vi.fn(),
		onRegistered: vi.fn(),
		onSettled: vi.fn()
	}
	const service = {
		run: vi.fn(async () => ({ ok: true as const, promptId: 'pid' })),
		job: vi.fn(async () => ({ ok: true, result: { status: 'completed', outputs_count: 1 } })),
		outputs: vi.fn(async () => ({
			ok: true,
			media: [
				{ kind: 'video' as const, url: 'http://comfy/video', filename: 'video.mp4', nodeId: '328' }
			]
		})),
		cancel: vi.fn()
	}
	const persist = vi.fn(async () => ({
		url: 'dweb://local/video.mp4',
		projectRelativePath: 'Content/video.mp4',
		absolutePath: 'G:/project/Content/video.mp4'
	}))
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({ ok: true, blob: async () => new Blob(['image'], { type: 'image/png' }) }))
	)
	return { state, frame, recipe, context, service, persist }
}
afterEach(() => {
	vi.unstubAllGlobals()
	journal.events = []
})
describe('ComfyUI frame execution', () => {
	it('replaces passive image inputs in the frozen graph and preserves original binding edge IDs', async () => {
		const f = fixture()
		expect(f.recipe.order).toEqual(['image', 'comfy'])
		expect(f.context.state.nodesById.image.resourceId).toBe('new')
		expect(f.state.nodesById.image.resourceId).toBe('old')
		const result = await executeFrameComfy('comfy', f.context, f)
		expect(f.service.run).toHaveBeenCalledOnce()
		const args = f.service.run.mock.calls[0] as any[]
		expect(args[2][0]).toMatchObject({ bindingId: '12:image', mediaType: 'image' })
		expect(args[2][0].file.name).toBe('new.png')
		expect(args[3]).toMatchObject({ snapshotId: 'snapshot', confirmRetry: false })
		expect(args[3].submissionScope).toMatch(/^frame:/)
		expect(f.context.onRegistered).toHaveBeenCalledWith('pid', 'http://127.0.0.1:8188')
		expect(result.outputs['out-328'].projectRelativePath).toBe('Content/video.mp4')
	})
	it('waits for actual completion, not outputs_count', async () => {
		const f = fixture()
		f.service.job.mockResolvedValueOnce({
			ok: true,
			result: { status: 'in_progress', outputs_count: 1 }
		})
		const wait = vi.fn(async () => {
			expect(f.persist).not.toHaveBeenCalled()
		})
		await executeFrameComfy('comfy', f.context, { ...f, wait })
		expect(wait).toHaveBeenCalledOnce()
	})
	it.each(['failed', 'cancelled'])(
		'rejects remote %s without declaring an unknown submission',
		async (status) => {
			const f = fixture()
			f.service.job.mockResolvedValue({ ok: true, result: { status, outputs_count: 1 } })
			await expect(executeFrameComfy('comfy', f.context, f)).rejects.toThrow(status)
			expect(f.context.onSettled).toHaveBeenCalledOnce()
			expect(f.persist).not.toHaveBeenCalled()
		}
	)
	it('does not use an unrelated output or a prior preview', async () => {
		const f = fixture()
		f.service.outputs.mockResolvedValue({
			ok: true,
			media: [{ kind: 'video', url: 'old', filename: 'old.mp4', nodeId: '999' }]
		})
		await expect(executeFrameComfy('comfy', f.context, f)).rejects.toThrow('out-328')
		expect(f.persist).not.toHaveBeenCalled()
	})
	it('fails when output persistence did not produce a project asset', async () => {
		const f = fixture()
		f.persist.mockResolvedValue(null as any)
		await expect(executeFrameComfy('comfy', f.context, f)).rejects.toThrow('尚未保存')
	})
	it('does not retry an uncertain submission', async () => {
		const f = fixture()
		f.service.run.mockResolvedValue({ ok: false, error: 'SUBMISSION_UNKNOWN' } as any)
		await expect(executeFrameComfy('comfy', f.context, f)).rejects.toThrow('SUBMISSION_UNKNOWN')
		expect(f.service.run).toHaveBeenCalledOnce()
		expect(f.context.onSettled).not.toHaveBeenCalled()
	})
	it('allows a new session despite a stale manual ComfyUI running status', () => {
		const f = fixture()
		f.state.nodesById.comfy.comfyuiSettings!.runStatus = 'running'
		expect(() => captureFrameRecipe(f.state, f.frame)).not.toThrow()
	})
	it('journals prompt ID and per-port assets; resume skips a completed ComfyUI step', async () => {
		const f = fixture()
		const publish = vi.fn()
		const executeComfy = vi.fn((id, ctx) => executeFrameComfy(id, ctx, f))
		const deps = {
			state: () => f.state,
			projectId: () => 1,
			changed: () => {},
			submit: vi.fn(),
			executeComfy,
			publish
		}
		await createFrameRunCoordinator(deps).run(f.recipe)
		expect(journal.events.find((e) => e.type === 'StepRegistered').payload.promptId).toBe('pid')
		expect(publish.mock.calls[0][0][0].resource.kind).toBe('video')
		const events = journal.events.map((e, seq) => ({ ...e, seq }))
		await createFrameRunCoordinator(deps).run(f.recipe, 'prior', {
			id: 'prior',
			status: 'failed',
			recipeHash: '',
			recipe: f.recipe,
			events
		})
		expect(executeComfy).toHaveBeenCalledOnce()
		expect(
			journal.events.some((e) => e.type === 'StepReused' && e.payload.comfyOutputs['out-328'])
		).toBe(true)
	})
	it('projects each output separately for downstream steps without mutating the live graph', async () => {
		const f = fixture()
		const result = await executeFrameComfy('comfy', f.context, f)
		f.context.state.edgesById.next = {
			id: 'next',
			fromNodeId: 'comfy',
			fromAnchorId: 'out-328',
			toNodeId: 'next',
			toAnchorId: 'in-0'
		} as any
		applyFrameComfyResult(f.context.state, 'comfy', result)
		const source = f.context.state.nodesById[f.context.state.edgesById.next.fromNodeId]
		expect(source.resourceId).toBe(result.outputs['out-328'].id)
		expect(f.state.nodesById.comfy.resourceId).toBeUndefined()
	})
})

it('ignores a late task response after switching projects while retaining the registered ID', async () => {
	const f = fixture()
	let active = true
	f.context.assertActive = () => {
		if (!active) throw new Error('SESSION_CHANGED')
	}
	f.service.run.mockImplementation(async () => {
		active = false
		return { ok: true, promptId: 'pid' }
	})
	await expect(executeFrameComfy('comfy', f.context, f)).rejects.toThrow('SESSION_CHANGED')
	expect(f.context.onRegistered).toHaveBeenCalledWith('pid', 'http://127.0.0.1:8188')
	expect(f.service.job).not.toHaveBeenCalled()
	expect(f.persist).not.toHaveBeenCalled()
})
it('publishes output fields without overwriting the live workflow configuration', async () => {
	const f = fixture()
	const result = await executeFrameComfy('comfy', f.context, f)
	const patch = frameComfyOutputPatch(result.node)
	expect(patch?.outputs?.[0].anchorId).toBe('out-328')
	expect(patch).not.toHaveProperty('workflowPath')
	expect(patch).not.toHaveProperty('inputBindings')
})

it('closes during a pending ComfyUI poll, starts a fresh trigger and ignores the old reply', async () => {
	const f = fixture()
	let release!: (v: any) => void
	let started!: () => void
	const entered = new Promise<void>((r) => {
		started = r
	})
	f.service.job.mockImplementationOnce(() => {
		started()
		return new Promise((r) => {
			release = r
		})
	})
	const publish = vi.fn()
	const runner = createFrameRunCoordinator({
		state: () => f.state,
		projectId: () => 1,
		changed: () => {},
		submit: vi.fn(),
		publish,
		executeComfy: (id, ctx) => executeFrameComfy(id, ctx, f)
	})
	const first = runner.run(f.recipe)
	await entered
	runner.stop()
	expect((await first).status).toBe('cancelled')
	expect((await runner.run(f.recipe)).status).toBe('succeeded')
	const calls = f.service.run.mock.calls as any[][]
	expect(calls).toHaveLength(2)
	expect(calls[0][3].submissionScope).not.toBe(calls[1][3].submissionScope)
	release({ ok: true, result: { status: 'completed' } })
	await Promise.resolve()
	await Promise.resolve()
	expect(publish).toHaveBeenCalledOnce()
	expect(f.persist).toHaveBeenCalledOnce()
})

it('accepts an external text parameter on the ComfyUI aggregate port without dropping internal image inputs', async () => {
	const f = fixture()
	f.state.nodesById.comfy.inputs = [{ id: 'in-0', mediaType: 'generic' }]
	f.state.nodesById.comfy.comfyuiSettings!.positivePrompt = 'old template/panel value'
	f.state.nodesById.text = {
		id: 'text',
		type: 'text',
		textValue: 'changed prompt',
		inputs: [],
		outputs: [{ id: 'out-0', mediaType: 'text' }]
	} as any
	f.state.edgesById.prompt = {
		id: 'prompt',
		fromNodeId: 'text',
		fromAnchorId: 'out-0',
		toNodeId: 'comfy',
		toAnchorId: 'in-0'
	} as any
	f.frame.automation!.inputBindings.push({ id: 'prompt-port', nodeId: 'comfy', anchorId: 'in-0' })
	const recipe = captureFrameRecipe(f.state, f.frame)
	expect(recipe.edges.internal).toBeDefined()
	expect(recipe.edges.prompt).toBeDefined()
	const state = createFrameExecutionState(f.state, recipe)
	await executeFrameComfy('comfy', { ...f.context, state }, f)
	const args = f.service.run.mock.calls[0] as any[]
	expect(args[3].positivePrompt).toBe('changed prompt')
	expect(args[2]).toHaveLength(1)
	expect(args[2][0].bindingId).toBe('12:image')
	// A saved recipe remains frozen while a new run captures current text.
	f.state.nodesById.text.textValue = 'next prompt'
	expect(createFrameExecutionState(f.state, recipe).nodesById.text.textValue).toBe('changed prompt')
	expect(captureFrameRecipe(f.state, f.frame).nodes.find((n) => n.id === 'text')?.textValue).toBe(
		'next prompt'
	)
})
it('replaces an internal static text parameter from the outer frame input, including an empty value', () => {
	const f = fixture()
	f.state.nodesById.text = {
		id: 'text',
		type: 'text',
		textValue: 'original',
		inputs: [{ id: 'in-0' }],
		outputs: [{ id: 'out-0', mediaType: 'text' }]
	} as any
	f.state.nodesById.outerText = { ...f.state.nodesById.text, id: 'outerText', textValue: '' }
	f.frame.nodeIds.push('text')
	f.frame.automation!.inputBindings.push({
		id: 'text-port',
		nodeId: 'text',
		anchorId: 'in-0',
		bindingMode: 'target-input'
	})
	f.state.edgesById.textSource = {
		id: 'textSource',
		fromNodeId: 'outerText',
		fromAnchorId: 'out-0',
		toNodeId: 'text',
		toAnchorId: 'in-0'
	} as any
	f.state.edgesById.textToComfy = {
		id: 'textToComfy',
		fromNodeId: 'text',
		fromAnchorId: 'out-0',
		toNodeId: 'comfy',
		toAnchorId: 'in-0'
	} as any
	const recipe = captureFrameRecipe(f.state, f.frame)
	expect(recipe.replacements.text).toBe('outerText')
	expect(createFrameExecutionState(f.state, recipe).nodesById.text.textValue).toBe('')
	expect(f.state.nodesById.text.textValue).toBe('original')
})
