// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
vi.mock('../../../../src/i18n', () => ({ t: (key: string) => key }))
import { useAIWorkflowComfyRuntime } from '../../../../src/views/AIWorkflow/node-business/comfy/useAIWorkflowComfyRuntime'
import { useAIWorkflowComfyConnection } from '../../../../src/views/AIWorkflow/node-business/comfy/useAIWorkflowComfyConnection'

const resolved = {
	ok: true,
	hasHistory: true,
	promptId: 'snapshot',
	resolution: { contentHash: 'v1', source: 'history-live' },
	imageInputs: [
		{ nodeId: '10', inputKey: 'image' },
		{ nodeId: '20', inputKey: 'image' }
	],
	videoInputs: [],
	textNodes: { positive: [], negative: [] },
	outputs: [],
	seedNodes: []
}
function fixture() {
	const state: any = {
		nodesById: {
			c: {
				id: 'c',
				type: 'comfyui',
				inputs: [{ id: 'in' }],
				comfyuiSettings: {
					baseUrl: 'http://comfy',
					workflowPath: 'history://p',
					historyInputMappings: { imageInputs: resolved.imageInputs }
				}
			},
			a: { id: 'a', type: 'image', resourceId: 'ra' },
			b: { id: 'b', type: 'image', resourceId: 'rb' }
		},
		nodeOrder: ['c', 'a', 'b'],
		edgeOrder: ['ea', 'eb'],
		edgesById: {
			ea: { id: 'ea', fromNodeId: 'a', fromAnchorId: 'out', toNodeId: 'c', toAnchorId: 'in' },
			eb: { id: 'eb', fromNodeId: 'b', fromAnchorId: 'out', toNodeId: 'c', toAnchorId: 'in' }
		},
		resourcesById: {
			ra: { kind: 'image', name: 'a.png', url: 'data:image/png;base64,YQ==' },
			rb: { kind: 'image', name: 'b.png', url: 'data:image/png;base64,Yg==' }
		}
	}
	const store = {
		state,
		commit: vi.fn((type, p) => {
			if (type === 'setNodeComfyUISettings' && state.nodesById[p.nodeId])
				Object.assign(state.nodesById[p.nodeId].comfyuiSettings, p.comfyuiSettings)
		})
	}
	const service = {
		run: vi.fn(async () => ({ ok: false, error: 'test-stop-after-submission' })),
		resolveHistory: vi.fn(async () => resolved),
		listWorkflows: vi.fn(async () => ({ ok: true, workflows: [{ path: 'history://new' }] })),
		job: vi.fn(),
		outputs: vi.fn(),
		cancel: vi.fn()
	}
	const payload: any = {
		store,
		comfyService: service,
		pushToast: vi.fn(),
		clearComfyRouteCache: vi.fn(),
		getIncomingTextValue: () => '',
		routeComfyOutputsToConnectedNodes: vi.fn(),
		getSessionKey: () => 'project-a'
	}
	return { state, store, service, payload }
}
afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})
describe('ComfyUI blueprint connection and task boundary', () => {
	it('submits connected image and text together and displays actionable backend errors', async () => {
		vi.stubGlobal('window', { setInterval, clearInterval })
		vi.spyOn(console, 'log').mockImplementation(() => {})
		vi.spyOn(console, 'warn').mockImplementation(() => {})
		vi.spyOn(console, 'error').mockImplementation(() => {})
		const { state, service, payload } = fixture()
		state.nodesById.c.inputs = [
			{ id: 'in', mediaType: 'generic', acceptedMediaTypes: ['image', 'text'], multiInput: true }
		]
		state.nodesById.c.comfyuiSettings.historyInputMappings.imageInputs = [
			{ nodeId: '375', inputKey: 'image' }
		]
		state.nodesById.b = {
			id: 'b',
			type: 'text',
			textValue: 'A slow camera move following the reference image',
			outputs: [{ id: 'out-text', mediaType: 'text' }]
		}
		state.edgesById.eb.fromAnchorId = 'out-text'
		const message = 'VHS_VideoCombine[328].frame_rate: 缺少必填参数'
		service.run.mockResolvedValue({ ok: false, error: 'INVALID_TEMPLATE_INPUTS', message } as any)
		const runtime = useAIWorkflowComfyRuntime(payload)
		await runtime.onComfyUIRun('c')
		const call = (service.run.mock.calls as any)[0]
		expect(call[2]).toHaveLength(1)
		expect(call[2][0].bindingId).toBe('375:image')
		expect(call[3].positivePrompt).toBe(state.nodesById.b.textValue)
		expect(state.nodesById.c.comfyuiSettings.statusText).toBe(message)
		runtime.disposeComfyRuntime()
	})
	it('passes connected files with stable field ids across edge reorder and deletion', async () => {
		vi.stubGlobal('window', { setInterval, clearInterval })
		vi.spyOn(console, 'log').mockImplementation(() => {})
		vi.spyOn(console, 'warn').mockImplementation(() => {})
		vi.spyOn(console, 'error').mockImplementation(() => {})
		const { state, service, payload } = fixture()
		const runtime = useAIWorkflowComfyRuntime(payload)
		await runtime.onComfyUIRun('c')
		state.edgeOrder.reverse()
		await runtime.onComfyUIRun('c')
		const calls = service.run.mock.calls as any
		expect(calls[0][2].map((f: any) => [f.file.name, f.bindingId])).toEqual([
			['a.png', '10:image'],
			['b.png', '20:image']
		])
		expect(calls[1][2].map((f: any) => [f.file.name, f.bindingId])).toEqual([
			['b.png', '20:image'],
			['a.png', '10:image']
		])
		expect(calls[0][3].positivePrompt).toBeUndefined()
		delete state.edgesById.ea
		state.edgeOrder = ['eb']
		await runtime.onComfyUIRun('c')
		expect(state.nodesById.c.comfyuiSettings.inputBindings).toEqual({ eb: '20:image' })
		runtime.disposeComfyRuntime()
	})
	it('ignores a late refresh after the selected template changes', async () => {
		const { state, store, service, payload } = fixture()
		let finish!: (v: any) => void
		service.resolveHistory.mockImplementation(
			() =>
				new Promise((r) => {
					finish = r
				})
		)
		const connection = useAIWorkflowComfyConnection(payload)
		const old = connection.onComfyUISelectWorkflow('c', { workflowPath: 'history://old' })
		state.nodesById.c.comfyuiSettings.workflowPath = 'history://new'
		store.commit.mockClear()
		finish(resolved)
		await old
		expect(store.commit).not.toHaveBeenCalled()
	})
	it('refreshes discovery even when no template has been selected', async () => {
		const { state, service, payload } = fixture()
		state.nodesById.c.comfyuiSettings.workflowPath = ''
		await useAIWorkflowComfyConnection(payload).onRefreshHistoryCheck('c')
		expect(state.nodesById.c.comfyuiSettings.workflows).toEqual([{ path: 'history://new' }])
		expect(service.resolveHistory).not.toHaveBeenCalled()
	})
})
