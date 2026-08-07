import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
	AIWorkflowStore,
	createDefaultAIWorkflowState,
	setEngineSyncHooks
} from '@/store/aiworkflow/store'
import type { WorkflowEdge, WorkflowNode } from '@/aiworkflow/types'

/**
 * 测试：FX1/3/7 + F1
 *  - FX1: setEngineSyncHooks 边同步钩子注册 + addEdge/removeEdge 调用
 *  - FX3: hydrateDraft 边处理基于 nextNodesById（不依赖 state.nodesById 旧值）
 *  - FX7: hydrateDraft 边处理非破坏性（"Save → Hydrate" 往返后边保留）
 *  - F1: setNodeComfyUISettings / setNodeResource sync hook 调用
 *
 * 关键设计：
 *  - 不要在 snapshot 中直接构造带 inputs 的 nodesById，因为 Workflow hydrateDraft 有
 *    normalizeWorkflowNode 规范化步骤，最好用 store 规范化后的状态回读 → snapshot 循环
 *  - 因此 FX3/FX7 测试采用 "hydrateDraft → commit(addEdge) → serialize(store.state deep copy)
 *    → cleanState → hydrateDraft(snapshot) → verify edges" 模拟 Save→Refresh→Load
 */
describe('Store Engine Sync Hooks + HydrateDraft Edge Preservation (FX1 FX3 FX7)', () => {
	const COMFY_SNAPSHOT_DEFAULTS = () => ({
		baseUrl: '', positivePrompt: '', negativePrompt: '', autoWireEnabled: true,
		imageInputCount: 0, videoInputCount: 0, hasTextPromptInput: false,
		historyChecked: false, hasHistory: false,
		workflowPath: undefined,
		historyInputMappings: {} as Record<string, string>,
		historyOutputNodes: [] as any[]
	})

	const mkComfySnapshot = (id: string) => ({
		id, type: 'comfyui', title: 'ComfyUI Node',
		worldX: 0, worldY: 0, width: 280, height: 220,
		inputs: [{ id: 'in', label: '输入', mediaType: 'generic', acceptedMediaTypes: ['text', 'image', 'video', 'model3d'], multiInput: true }],
		outputs: [],
		comfyuiSettings: COMFY_SNAPSHOT_DEFAULTS(),
		createdAt: Date.now()
	})

	const mkImageSnapshot = (id: string) => ({
		id, type: 'image', title: 'Image Node',
		worldX: -300, worldY: 0, width: 280, height: 180,
		inputs: [],
		// 注意：singleIOAnchorsForNodeType('image') 规定 outputs 的 id 是 'out-image'（不是 'out'）
		// 并且 addEdge mutation 内部 canLinkAnchors 也用这个 id
		outputs: [{ id: 'out-image', label: '图片输出', mediaType: 'image' }],
		createdAt: Date.now()
	})

	const mkTextSnapshot = (id: string) => ({
		id, type: 'text', title: 'Text Node',
		worldX: -300, worldY: 200, width: 280, height: 140,
		inputs: [],
		// singleIOAnchorsForNodeType('text') 规定 outputs 的 id 是 'out-0'
		outputs: [{ id: 'out-0', label: '文本输出', mediaType: 'text' }],
		textValue: '',
		createdAt: Date.now()
	})

	const mkVideoSnapshot = (id: string) => ({
		id, type: 'video', title: 'Video Node',
		worldX: -300, worldY: -200, width: 280, height: 200,
		inputs: [],
		// singleIOAnchorsForNodeType('video') 规定 outputs 的 id 是 'out-video'
		outputs: [{ id: 'out-video', label: '视频输出', mediaType: 'video' }],
		createdAt: Date.now()
	})

	const resetStore = () => {
		setEngineSyncHooks({
			syncComfyUISettings: undefined as any,
			syncNodeResource: undefined as any,
			syncAddEdge: undefined as any,
			syncRemoveEdge: undefined as any
		})
		const cleanState = createDefaultAIWorkflowState()
		const st = AIWorkflowStore.state as any
		for (const k of Object.keys(cleanState) as (keyof ReturnType<typeof createDefaultAIWorkflowState>)[]) {
			st[k] = (cleanState as any)[k]
		}
	}

	beforeEach(() => resetStore())

	// 便捷：构造一个 2节点 + 1边 的快照（先 hydrate 规范化，再 addEdge，然后 deep copy 出快照）
	const buildSaveSnapshotWithEdges = (
		nodeSpecs: Array<{ id: string; mk: (id: string) => any }>,
		edgeSpecs: Array<{ id?: string; from: [string, string]; to: [string, string] }>
	) => {
		resetStore()
		const nodesById: Record<string, any> = {}
		for (const s of nodeSpecs) nodesById[s.id] = s.mk(s.id)
		const nodeOrder = nodeSpecs.map((s) => s.id)
		const snap = {
			nodesById, nodeOrder,
			edgesById: {}, edgeOrder: [],
			viewport: { zoom: 1, panX: 0, panY: 0 },
			resourcesById: {}, resourceOrder: []
		}
		AIWorkflowStore.commit('hydrateDraft', { snapshot: snap })
		// 第二步：通过 addEdge mutation 加边（经过 canLinkAnchors 校验保证合法）
		const addedIds: string[] = []
		for (const e of edgeSpecs) {
			const fromId = e.from[0]
			const fromAnchor = e.from[1]
			const toId = e.to[0]
			const toAnchor = e.to[1]
			AIWorkflowStore.commit('addEdge', { fromNodeId: fromId, fromAnchorId: fromAnchor, toNodeId: toId, toAnchorId: toAnchor })
			// 查最后加入的边（因为 addEdge 内部生成 id 或用 edgeOrder 最后一个）
			const lastId = AIWorkflowStore.state.edgeOrder[AIWorkflowStore.state.edgeOrder.length - 1]
			addedIds.push(lastId)
		}
		// 深拷贝 store.state 作为"Save 后的快照数据"
		const savedSnapshot = {
			nodesById: JSON.parse(JSON.stringify(AIWorkflowStore.state.nodesById)),
			nodeOrder: [...AIWorkflowStore.state.nodeOrder],
			edgesById: JSON.parse(JSON.stringify(AIWorkflowStore.state.edgesById)),
			edgeOrder: [...AIWorkflowStore.state.edgeOrder],
			viewport: { ...AIWorkflowStore.state.viewport },
			resourcesById: JSON.parse(JSON.stringify(AIWorkflowStore.state.resourcesById)),
			resourceOrder: [...AIWorkflowStore.state.resourceOrder],
			selectedNodeId: AIWorkflowStore.state.selectedNodeId,
			selectedNodeIds: [...AIWorkflowStore.state.selectedNodeIds],
			selectedEdgeId: AIWorkflowStore.state.selectedEdgeId
		}
		return { savedSnapshot, edgeIds: addedIds }
	}

	describe('FX1 - Engine sync hooks registration and invocation', () => {
		it('setNodeComfyUISettings should trigger syncComfyUISettings hook', async () => {
			const store = AIWorkflowStore
			const nodes = [{ id: 'c1', mk: mkComfySnapshot }]
			const { savedSnapshot } = buildSaveSnapshotWithEdges(nodes, [])
			store.commit('hydrateDraft', { snapshot: savedSnapshot })
			const mockFn = vi.fn()
			setEngineSyncHooks({ syncComfyUISettings: mockFn })
			store.commit('setNodeComfyUISettings', { nodeId: 'c1', comfyuiSettings: { positivePrompt: 'new prompt' } })
			await new Promise((r) => setTimeout(r, 10))
			expect(mockFn).toHaveBeenCalledWith('c1')
		})

		it('setNodeResource should trigger syncNodeResource hook', async () => {
			const store = AIWorkflowStore
			const nodes = [{ id: 'img-1', mk: mkImageSnapshot }]
			const { savedSnapshot } = buildSaveSnapshotWithEdges(nodes, [])
			store.commit('hydrateDraft', { snapshot: savedSnapshot })
			const mockFn = vi.fn()
			setEngineSyncHooks({ syncNodeResource: mockFn })
			store.commit('setNodeResource', { nodeId: 'img-1', resourceId: 'res-001' })
			await new Promise((r) => setTimeout(r, 10))
			expect(mockFn).toHaveBeenCalledWith('img-1')
		})

		it('addEdge mutation should trigger syncAddEdge hook with edge object', async () => {
			const store = AIWorkflowStore
			const mockAdd = vi.fn()
			setEngineSyncHooks({ syncAddEdge: mockAdd })
			const nodes = [
				{ id: 'from-1', mk: mkImageSnapshot },
				{ id: 'to-1', mk: mkComfySnapshot }
			]
			buildSaveSnapshotWithEdges(nodes, [{ from: ['from-1', 'out-image'], to: ['to-1', 'in'] }])
			await new Promise((r) => setTimeout(r, 10))
			expect(mockAdd).toHaveBeenCalledTimes(1)
			const edgeArg = mockAdd.mock.calls[0][0] as WorkflowEdge
			expect(edgeArg).toMatchObject({
				fromNodeId: 'from-1', fromAnchorId: 'out-image',
				toNodeId: 'to-1', toAnchorId: 'in'
			})
		})

		it('removeEdge mutation should trigger syncRemoveEdge hook with edge id', async () => {
			const store = AIWorkflowStore
			// 先加边
			const nodes = [
				{ id: 'from-x', mk: mkImageSnapshot },
				{ id: 'to-x', mk: mkComfySnapshot }
			]
			const { savedSnapshot, edgeIds } = buildSaveSnapshotWithEdges(
				nodes,
				[{ from: ['from-x', 'out-image'], to: ['to-x', 'in'] }]
			)
			const edgeId = edgeIds[0]
			expect(edgeId).toBeDefined()
			// 用快照重置 store，因为 buildSaveSnapshotWithEdges 已经建了边
			resetStore()
			store.commit('hydrateDraft', { snapshot: savedSnapshot })
			expect(store.state.edgeOrder).toContain(edgeId)
			const mockRemove = vi.fn()
			setEngineSyncHooks({ syncRemoveEdge: mockRemove })
			store.commit('removeEdge', { edgeId })
			await new Promise((r) => setTimeout(r, 10))
			expect(mockRemove).toHaveBeenCalledWith(edgeId)
		})
	})

	describe('FX3 + FX7 - Save → Refresh → Hydrate round-trip edge preservation', () => {
		it('image→comfyui edge survives a "Save → Refresh → Reload" workflow cycle', () => {
			const store = AIWorkflowStore
			const nodes = [
				{ id: 'img-a', mk: mkImageSnapshot },
				{ id: 'comfy-a', mk: mkComfySnapshot }
			]
			const { savedSnapshot, edgeIds } = buildSaveSnapshotWithEdges(
				nodes,
				[{ from: ['img-a', 'out-image'], to: ['comfy-a', 'in'] }]
			)
			const singleEdgeId = edgeIds[0]
			expect(singleEdgeId).toBeDefined()
			// 模拟 Refresh → 清空 state
			resetStore()
			expect(store.state.edgeOrder).toHaveLength(0)
			// 模拟加载保存的快照
			store.commit('hydrateDraft', { snapshot: savedSnapshot })
			expect(store.state.edgeOrder).toContain(singleEdgeId)
			expect(store.state.edgesById[singleEdgeId]).toBeDefined()
			expect(store.state.edgesById[singleEdgeId]?.toNodeId).toBe('comfy-a')
			expect(store.state.edgesById[singleEdgeId]?.fromNodeId).toBe('img-a')
		})

		it('multi-modal edges (text, image, video → comfyui) all survive Save→Refresh→Reload cycle', () => {
			const store = AIWorkflowStore
			const nodes = [
				{ id: 'img-multi',  mk: mkImageSnapshot },
				{ id: 'txt-multi',  mk: mkTextSnapshot },
				{ id: 'vid-multi',  mk: mkVideoSnapshot },
				{ id: 'comfy-multi', mk: mkComfySnapshot }
			]
			const edgeSpecs = [
				{ from: ['img-multi',  'out-image'], to: ['comfy-multi', 'in'] },
				{ from: ['txt-multi',  'out-0'],    to: ['comfy-multi', 'in'] },
				{ from: ['vid-multi',  'out-video'], to: ['comfy-multi', 'in'] }
			]
			const { savedSnapshot, edgeIds } = buildSaveSnapshotWithEdges(nodes, edgeSpecs)
			expect(edgeIds).toHaveLength(3)
			resetStore()
			store.commit('hydrateDraft', { snapshot: savedSnapshot })
			expect(store.state.edgeOrder).toHaveLength(3)
			for (const id of edgeIds) {
				expect(store.state.edgesById[id]).toBeDefined()
			}
		})
	})
})
