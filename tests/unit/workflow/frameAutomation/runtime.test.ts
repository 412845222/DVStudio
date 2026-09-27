import { describe, it, expect, vi } from 'vitest'
import type { WorkflowState, SavedSelectionFrame } from '../../../../src/aiworkflow/types'
import {
	captureFrameRecipe,
	createFrameExecutionState
} from '../../../../src/views/AIWorkflow/automation/frameExecutionContext'
import { workflowStateToLegacyBlueprint } from '../../../../src/views/AIWorkflow/blueprint-bridge/workflowStateAdapter'
import { createFrameRunCoordinator } from '../../../../src/views/AIWorkflow/automation/frameRunCoordinator'
const journal = vi.hoisted(() => ({
	events: [] as { type: string; status?: string; payload?: unknown }[]
}))
vi.mock('../../../../src/electronBridge/frameAutomation', () => ({
	frameAutomationRequest: vi.fn(async (action: string, p: { type: string; status?: string }) => {
		if (action === 'create') return { id: 'run' }
		if (action === 'append') journal.events.push(p)
		return { seq: journal.events.length }
	})
}))
function fixture() {
	const frame = {
		id: 'f',
		label: 'flow',
		createdAt: 1,
		nodeIds: ['a', 'b'],
		automation: {
			enabled: true,
			loopCount: 1,
			inputBindings: [],
			outputBindings: [{ id: 'out', nodeId: 'b', anchorId: 'out-0' }]
		}
	} as SavedSelectionFrame
	const state = {
		nodesById: {
			a: {
				id: 'a',
				type: 'text',
				nodeChatDraft: 'step a',
				inputs: [{ id: 'in-0', mediaType: 'text' }],
				outputs: [{ id: 'out-0', mediaType: 'text' }]
			},
			b: {
				id: 'b',
				type: 'text',
				nodeChatDraft: 'step b',
				inputs: [{ id: 'in-0', mediaType: 'text' }],
				outputs: [{ id: 'out-0', mediaType: 'text' }]
			}
		},
		edgesById: {
			e: { id: 'e', fromNodeId: 'a', fromAnchorId: 'out-0', toNodeId: 'b', toAnchorId: 'in-0' }
		},
		edgeOrder: ['e'],
		resourcesById: {},
		savedSelectionFrames: [frame],
		nodeGenerationTaskIdsByNodeId: {},
		nodeGenerationTasksById: {}
	} as unknown as WorkflowState
	return { state, frame }
}
describe('frame execution boundary', () => {
	it('freezes the graph and replaces an external input only in the run context', () => {
		const { state, frame } = fixture()
		state.nodesById.x = { ...state.nodesById.a, id: 'x', nodeChatDraft: '', textValue: 'external' }
		state.edgesById.x = {
			id: 'x',
			createdAt: 1,
			fromNodeId: 'x',
			fromAnchorId: 'out-0',
			toNodeId: 'b',
			toAnchorId: 'in-0'
		}
		frame.automation!.inputBindings = [{ id: 'in', nodeId: 'b', anchorId: 'in-0' }]
		const recipe = captureFrameRecipe(state, frame)
		expect(recipe.order).toEqual(['b'])
		expect(recipe.edges.e).toBeUndefined()
		expect(state.edgesById.e).toBeDefined()
		state.nodesById.x.textValue = 'changed'
		expect(createFrameExecutionState(state, recipe).nodesById.x.textValue).toBe('external')
	})
	it('rejects busy/unsupported dependencies rather than calling them successful skips', () => {
		const { state, frame } = fixture()
		state.nodesById.a.type = 'audio' as never
		expect(() => captureFrameRecipe(state, frame)).toThrow('适配器')
	})
	it('waits for the exact task completion and passes its new output to the next step', async () => {
		vi.useFakeTimers()
		journal.events = []
		const { state, frame } = fixture()
		const calls: string[] = []
		const runner = createFrameRunCoordinator({
			state: () => state,
			projectId: () => 1,
			changed: () => {},
			submit: async (id, context) => {
				calls.push(id)
				if (id === 'b') expect(context.state.nodesById.a.textValue).toBe('new-result')
				const task = {
					id: 'task-' + id,
					nodeId: id,
					status: 'running',
					results: []
				} as unknown as WorkflowState['nodeGenerationTasksById'][string]
				state.nodeGenerationTasksById[task.id] = task
				await context.onTaskRegistered(task)
				context.onTextResult?.(id, id === 'a' ? 'new-result' : 'final')
				if (id === 'b') {
					task.status = 'completed'
					state.nodesById.b.textValue = 'final'
				}
				return true
			}
		})
		try {
			const pending = runner.run(captureFrameRecipe(state, frame))
			await vi.advanceTimersByTimeAsync(500)
			expect(calls).toEqual(['a'])
			state.nodesById.a.textValue = 'new-result'
			state.nodeGenerationTasksById['task-a'].status = 'completed'
			await vi.advanceTimersByTimeAsync(300)
			expect((await pending).status).toBe('succeeded')
			expect(calls).toEqual(['a', 'b'])
			expect(journal.events.at(-1)?.status).toBe('succeeded')
		} finally {
			vi.useRealTimers()
		}
	})
	it('stops after the active task instead of dispatching a downstream step', async () => {
		const { state, frame } = fixture()
		const calls: string[] = []
		const runner = createFrameRunCoordinator({
			state: () => state,
			projectId: () => 1,
			changed: () => {},
			submit: async (id, context) => {
				calls.push(id)
				const task = {
					id: 'task-' + id,
					nodeId: id,
					status: 'completed',
					results: []
				} as unknown as WorkflowState['nodeGenerationTasksById'][string]
				state.nodeGenerationTasksById[task.id] = task
				await context.onTaskRegistered(task)
				state.nodesById[id].textValue = 'result'
				context.onTextResult?.(id, 'result')
				runner.stop()
				return true
			}
		})
		expect((await runner.run(captureFrameRecipe(state, frame))).status).toBe('cancelled')
		expect(calls).toEqual(['a'])
	})
	it('never treats a previous preview as this task output, and accepts an explicit local receipt', async () => {
		const { state, frame } = fixture()
		frame.nodeIds = ['a']
		frame.automation!.outputBindings = [{ id: 'out', nodeId: 'a', anchorId: 'out-0' }]
		state.nodesById.a.type = 'video'
		state.nodesById.a.resourceId = 'old'
		let withReceipt = false
		const local = {
			id: 'fresh',
			kind: 'video' as const,
			name: 'fresh',
			url: 'dweb://project-assets?projectId=1&path=fresh.mp4',
			createdAt: 1
		}
		const runner = createFrameRunCoordinator({
			state: () => state,
			projectId: () => 1,
			changed: () => {},
			submit: async (id, context) => {
				const task = {
					id: 'task',
					nodeId: id,
					status: 'completed',
					results: [{ kind: 'video', url: 'https://signed.invalid/remote' }]
				} as WorkflowState['nodeGenerationTasksById'][string]
				state.nodeGenerationTasksById.task = task
				await context.onTaskRegistered(task)
				if (withReceipt) context.onResourceResult?.(local)
				return true
			}
		})
		await expect(runner.run(captureFrameRecipe(state, frame))).rejects.toThrow('本次任务产物')
		withReceipt = true
		expect((await runner.run(captureFrameRecipe(state, frame))).status).toBe('succeeded')
	})
	it('records an unknown submission and never dispatches a successor after session change', async () => {
		const { state, frame } = fixture()
		let projectId = 1
		const calls: string[] = []
		const runner = createFrameRunCoordinator({
			state: () => state,
			projectId: () => projectId,
			changed: () => {},
			submit: async (id, context) => {
				calls.push(id)
				const task = {
					id: 'task',
					nodeId: id,
					status: 'running',
					results: []
				} as unknown as WorkflowState['nodeGenerationTasksById'][string]
				state.nodeGenerationTasksById.task = task
				await context.onTaskRegistered(task)
				projectId = 2
				expect(() => context.assertActive()).toThrow('SESSION_CHANGED')
				return true
			}
		})
		await expect(runner.run(captureFrameRecipe(state, frame))).rejects.toThrow('SESSION_CHANGED')
		expect(calls).toEqual(['a'])
		expect(journal.events.at(-1)?.status).toBe('submission_unknown')
	})
	it('runs each iteration from frozen inputs and keeps original parameters after live edits', async () => {
		const { state, frame } = fixture()
		frame.automation!.loopCount = 2
		const calls: string[] = []
		const runner = createFrameRunCoordinator({
			state: () => state,
			projectId: () => 1,
			changed: () => {},
			submit: async (id, context) => {
				calls.push(id)
				expect(context.state.nodesById[id].nodeChatDraft).toBe('step ' + id)
				state.nodesById[id].nodeChatDraft = 'edited'
				const task = {
					id: 'task-' + calls.length,
					nodeId: id,
					status: 'completed',
					results: []
				} as unknown as WorkflowState['nodeGenerationTasksById'][string]
				state.nodeGenerationTasksById[task.id] = task
				await context.onTaskRegistered(task)
				context.onTextResult?.(id, 'result')
				return true
			}
		})
		expect((await runner.run(captureFrameRecipe(state, frame))).status).toBe('succeeded')
		expect(calls).toEqual(['a', 'b', 'a', 'b'])
	})

	it('uses a frame source-output input to replace the whole single-output source without changing the original graph', () => {
		const { state, frame } = fixture()
		state.nodesById.x = { ...state.nodesById.a, id: 'x', textValue: 'external' }
		frame.automation!.inputBindings = [
			{ id: 'source', nodeId: 'a', anchorId: 'in-0', bindingMode: 'source-output' }
		]
		state.edgesById.ext = {
			id: 'ext',
			createdAt: 1,
			fromNodeId: 'x',
			fromAnchorId: 'out-0',
			toNodeId: 'a',
			toAnchorId: 'in-0',
			toFrame: { frameId: 'f', portId: 'source' }
		}
		const recipe = captureFrameRecipe(state, frame)
		expect(recipe.sources).toContain('a')
		expect(recipe.replacements.a).toBe('x')
		expect(createFrameExecutionState(state, recipe).nodesById.a.textValue).toBe('external')
		expect(state.nodesById.a.textValue).toBeUndefined()
		expect(state.edgesById.ext).toBeDefined()
	})
	it('invalidates host projection cache when an existing port changes mode or target', () => {
		const { state, frame } = fixture()
		state.nodeOrder = ['a', 'b']
		state.resourceOrder = []
		frame.automation!.inputBindings = [
			{ id: 'in', nodeId: 'a', anchorId: 'in-0', bindingMode: 'target-input' }
		]
		workflowStateToLegacyBlueprint(state)
		frame.automation!.inputBindings[0].bindingMode = 'source-output'
		frame.automation!.inputBindings[0].nodeId = 'b'
		const projected = workflowStateToLegacyBlueprint(state)
		expect(projected.savedSelectionFrames?.[0].automation?.inputBindings[0]).toMatchObject({
			bindingMode: 'source-output',
			nodeId: 'b'
		})
	})
})

it('closes a pending submission immediately and isolates late callbacks from the next session', async () => {
	const { state, frame } = fixture()
	const recipe = captureFrameRecipe(state, frame)
	let oldContext: any
	let release!: (value: boolean) => void
	let started!: () => void
	const entered = new Promise<void>((r) => {
		started = r
	})
	const pending = new Promise<boolean>((r) => {
		release = r
	})
	const publish = vi.fn()
	const runner = createFrameRunCoordinator({
		state: () => state,
		projectId: () => 1,
		changed: () => {},
		publish,
		submit: async (id, context) => {
			if (!oldContext) {
				oldContext = context
				started()
				return pending
			}
			const task = { id: 'new-' + id, nodeId: id, status: 'completed', results: [] } as any
			state.nodeGenerationTasksById[task.id] = task
			await context.onTaskRegistered(task)
			context.onTextResult?.(id, 'new result')
			return true
		}
	})
	const first = runner.run(recipe)
	await entered
	runner.stop()
	expect((await first).status).toBe('cancelled')
	expect(journal.events.at(-1)?.status).toBe('cancelled')
	expect((await runner.run(recipe)).status).toBe('succeeded')
	expect(() => oldContext.assertActive()).toThrow('FRAME_SESSION_CLOSED')
	expect(() => oldContext.onTextResult('a', 'old result')).toThrow('FRAME_SESSION_CLOSED')
	release(true)
	await Promise.resolve()
	expect(publish).toHaveBeenCalledOnce()
})
