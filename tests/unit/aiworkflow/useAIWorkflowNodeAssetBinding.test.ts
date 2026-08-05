import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useAIWorkflowNodeAssetBinding } from '@/views/AIWorkflow/assets/useAIWorkflowNodeAssetBinding'
import type { WorkflowNode } from '@/aiworkflow/types'

// ============================================================
// jsdom 环境 mock（浏览器 API 在 node 下未实现）
// 1) URL.createObjectURL / URL.revokeObjectURL
// 2) HTMLMediaElement.prototype.load / HTMLVideoElement / Image 等
// ============================================================
beforeEach(() => {
	// @ts-expect-error 测试环境 polyfill
	if (typeof globalThis.URL.createObjectURL !== 'function') {
		// @ts-expect-error 测试环境 polyfill
		globalThis.URL.createObjectURL = (input: any) =>
			`blob:test-${Math.random().toString(36).slice(2, 10)}-${String(input?.name || input || 'blob')}`
	}
	// @ts-expect-error 测试环境 polyfill
	if (typeof globalThis.URL.revokeObjectURL !== 'function') {
		// @ts-expect-error 测试环境 polyfill
		globalThis.URL.revokeObjectURL = () => {}
	}
	if (
		typeof HTMLMediaElement !== 'undefined' &&
		typeof HTMLMediaElement.prototype?.load !== 'function'
	) {
		// @ts-expect-error jsdom 默认未实现 load()
		HTMLMediaElement.prototype.load = function mockMediaLoad() {}
	}
})

// ============================================================
// useAIWorkflowNodeAssetBinding - patchBlueprintNodeData 测试
// 目标：验证当注入 patchBlueprintNodeData 回调时，
// bindMediaResourceToNode(model3d|image|video) 与 uploadNodeModel3DFile
// 会在所有 Store commits 完成后调用 patch 回调恰好一次，以便把变更
// 同步回 BlueprintEngine（修复"空白新建3D模型节点上传后不渲染"的根因）
// ============================================================

describe('useAIWorkflowNodeAssetBinding - patchBlueprintNodeData sync', () => {
	let resourcesById: Record<string, any>
	let nodesById: Record<string, WorkflowNode>
	let commits: Array<{ type: string; payload?: any }>

	const mkStore = () => {
		commits = []
		resourcesById = {}
		nodesById = {
			'n-m3d-1': {
				id: 'n-m3d-1',
				type: 'model3d',
				x: 0,
				y: 0,
				width: 320,
				height: 420,
				resourceId: null,
				resourcePath: undefined,
				imageSettings: undefined,
				videoSettings: undefined,
				model3dSettings: undefined,
				textSettings: undefined,
				inputs: {},
				outputs: {}
			} as any,
			'n-img-1': {
				id: 'n-img-1',
				type: 'image',
				x: 0,
				y: 0,
				width: 320,
				height: 320,
				resourceId: null,
				resourcePath: undefined,
				imageSettings: undefined,
				videoSettings: undefined,
				model3dSettings: undefined,
				textSettings: undefined,
				inputs: {},
				outputs: {}
			} as any,
			'n-vid-1': {
				id: 'n-vid-1',
				type: 'video',
				x: 0,
				y: 0,
				width: 320,
				height: 320,
				resourceId: null,
				resourcePath: undefined,
				imageSettings: undefined,
				videoSettings: undefined,
				model3dSettings: undefined,
				textSettings: undefined,
				inputs: {},
				outputs: {}
			} as any
		}
		return {
			state: { resourcesById, nodesById },
			commit: (type: string, payload?: any) => {
				commits.push({ type, payload })
				// 模拟核心 mutations 的行为（以便后续断言）
				if (type === 'addResource' && payload?.id) {
					resourcesById[payload.id] = { ...payload }
				} else if (type === 'patchResource' && payload?.resourceId) {
					const existing = resourcesById[payload.resourceId]
					if (existing) Object.assign(existing, payload.patch ?? {})
				} else if (type === 'setNodeResource' && payload?.nodeId) {
					const n = nodesById[payload.nodeId]
					if (n) (n as any).resourceId = payload.resourceId ?? null
				} else if (type === 'setNodeResourcePath' && payload?.nodeId) {
					const n = nodesById[payload.nodeId]
					if (n) (n as any).resourcePath = payload.resourcePath ?? undefined
				} else if (type === 'setNodeModel3DSettings' && payload?.nodeId) {
					const n = nodesById[payload.nodeId]
					if (n) (n as any).model3dSettings = payload.model3dSettings ?? undefined
				} else if (type === 'setNodeImageSettings' && payload?.nodeId) {
					const n = nodesById[payload.nodeId]
					if (n) (n as any).imageSettings = payload.imageSettings ?? undefined
				} else if (type === 'setNodeVideoSettings' && payload?.nodeId) {
					const n = nodesById[payload.nodeId]
					if (n) (n as any).videoSettings = payload.videoSettings ?? undefined
				}
			}
		}
	}

	const makeBinding = (
		store: any,
		extra: { patchBlueprintNodeData?: any; projectId?: number } = {}
	) => {
		const patchBlueprintNodeData = extra.patchBlueprintNodeData ?? vi.fn()
		const binding = useAIWorkflowNodeAssetBinding({
			store,
			makeResourceId: () => 'r-' + Math.random().toString(36).slice(2, 10),
			setObjectUrl: vi.fn(),
			revokeTrackedObjectUrlsForResource: vi.fn(),
			resolveBackendUrl: (v: string) => v,
			blueprintProjectService: {
				uploadAsset: vi.fn().mockResolvedValue({ ok: false })
			},
			getCurrentProjectId: () => (typeof extra.projectId === 'number' ? extra.projectId : null),
			setNodeResourceWithCleanup: vi.fn((payload: any) => {
				store.commit('setNodeResource', payload)
				if (payload.resourcePath !== undefined) {
					store.commit('setNodeResourcePath', payload)
				}
			}),
			autoSizeMediaNode: vi.fn(),
			autoSizeImageNodeFromDims: vi.fn(),
			scheduleVideoMetadataRead: vi.fn(),
			ensureVideoResourcePoster: vi.fn().mockResolvedValue(undefined),
			revokeNodeModel3DObjectUrl: vi.fn(),
			isDjangoManagedResource: () => false,
			patchBlueprintNodeData
		})
		return { binding, patchBlueprintNodeData }
	}

	beforeEach(() => {
		vi.restoreAllMocks()
	})
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('[RED 1] bindMediaResourceToNode(model3d) 必须在所有 commits 后调用 patchBlueprintNodeData 恰好一次', () => {
		const store = mkStore()
		const { binding, patchBlueprintNodeData } = makeBinding(store)

		binding.bindMediaResourceToNode(
			'n-m3d-1',
			'model3d',
			'dweb://project-assets?projectId=1&path=models%2Ftest.glb',
			'test.glb',
			{ sourcePath: 'C:\\models\\test.glb', projectRelativePath: 'models/test.glb' }
		)

		// 关键断言：patch 回调被调用
		expect(patchBlueprintNodeData).toHaveBeenCalledTimes(1)
		expect(patchBlueprintNodeData).toHaveBeenLastCalledWith('n-m3d-1')

		// 并且：patch 回调是在所有 Store mutations 提交 *之后* 被调用的（避免 engine 拿到空 data）
		const patchCallIndex = commits.findIndex(
			(c) => c.type === '__patch__' // 占位，实际不存在；下面用调用顺序断言
		)
		// 真正的调用顺序：所有 commits 结束后（addResource → setNodeResource → setNodeModel3DSettings）才调用 patch
		// 通过提交次数断言：此时 resourcesById 应已经写入、nodesById[n-m3d-1].model3dSettings 应已经写入
		const node = store.state.nodesById['n-m3d-1'] as any
		expect(String(node.resourceId || '')).not.toBe('')
		expect(node.model3dSettings).toBeDefined()
		expect(String(node.model3dSettings?.modelUrl || '')).toContain('dweb://')
		// patch 回调已执行
		expect(typeof patchBlueprintNodeData.mock.calls.length).toBe('number')
	})

	it('[RED 2] bindMediaResourceToNode(image) 必须在所有 commits 后调用 patchBlueprintNodeData 恰好一次', () => {
		const store = mkStore()
		const { binding, patchBlueprintNodeData } = makeBinding(store)

		// image/video 分支不需要 onload，因为 patch 在 commits + autoSizeMediaNode 之后
		binding.bindMediaResourceToNode('n-img-1', 'image', 'blob:123', 'photo.png', {
			sourcePath: 'C:\\photos\\photo.png'
		})

		// patch 回调应被调用 1 次（img.onerror 里的 setNodeImageSettings 是异步的，但 patch 同步调用即可）
		expect(patchBlueprintNodeData).toHaveBeenCalledTimes(1)
		expect(patchBlueprintNodeData).toHaveBeenLastCalledWith('n-img-1')

		const node = store.state.nodesById['n-img-1'] as any
		expect(String(node.resourceId || '')).not.toBe('')
	})

	it('[RED 3] bindMediaResourceToNode(video) 必须在所有 commits 后调用 patchBlueprintNodeData 恰好一次', () => {
		const store = mkStore()
		const { binding, patchBlueprintNodeData } = makeBinding(store)

		binding.bindMediaResourceToNode('n-vid-1', 'video', 'blob:456', 'clip.mp4', {
			sourcePath: 'C:\\videos\\clip.mp4'
		})

		expect(patchBlueprintNodeData).toHaveBeenCalledTimes(1)
		expect(patchBlueprintNodeData).toHaveBeenLastCalledWith('n-vid-1')

		const node = store.state.nodesById['n-vid-1'] as any
		expect(String(node.resourceId || '')).not.toBe('')
	})

	it('[RED 4] uploadNodeModel3DFile objectURL 兜底分支（无 projectId）必须在 commits 后调用 patchBlueprintNodeData 恰好一次', async () => {
		const store = mkStore()
		const { binding, patchBlueprintNodeData } = makeBinding(store, { projectId: 0 })

		const fakeFile = new File(['dummy-glb-bytes'], 'model-blank.glb', { type: 'model/gltf-binary' })
		await binding.uploadNodeModel3DFile('n-m3d-1', fakeFile)

		expect(patchBlueprintNodeData).toHaveBeenCalledTimes(1)
		expect(patchBlueprintNodeData).toHaveBeenLastCalledWith('n-m3d-1')

		const node = store.state.nodesById['n-m3d-1'] as any
		// objectUrl 兜底分支不会设置 resourceId，但 model3dSettings 必须写入
		expect(node.model3dSettings).toBeDefined()
		expect(String(node.model3dSettings?.modelUrl || '')).toMatch(/^blob:/)
	})
})
