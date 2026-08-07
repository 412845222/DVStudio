import { describe, it, expect, vi } from 'vitest'
import { useAIWorkflowMeshyRequest } from '@/views/AIWorkflow/node-business/meshy/useAIWorkflowMeshyRequest'
import type { WorkflowNode, WorkflowEdge } from '@/aiworkflow/types'

/**
 * 创建最小化的 mock WorkflowNode
 */
const makeMeshyNode = (overrides: Record<string, unknown> = {}): WorkflowNode => {
	const settings = {
		meshyTaskTarget: 'image',
		meshyTaskFamily: 'text-to-image',
		meshyPrompt: 'a cute cat',
		...overrides
	}
	return {
		id: 'node-1',
		type: 'meshy',
		title: 'Meshy Node',
		worldX: 0,
		worldY: 0,
		width: 200,
		height: 200,
		inputs: [],
		outputs: [],
		createdAt: Date.now(),
		meshySettings: settings as any
	} as WorkflowNode
}

/**
 * 创建 mock options，只提供 buildMeshyRequestPayload 所需的依赖
 */
const makeMockOptions = (overrides: Record<string, unknown> = {}) => ({
	connectedMeshyPrompt: vi.fn(() => 'a cute cat'),
	connectedMeshyImageInputs: vi.fn(() => [] as { edge: WorkflowEdge; fromNode: WorkflowNode; fromAnchorId: string; url: string }[]),
	connectedMeshyModelInput: vi.fn(async () => null),
	buildMeshyImageInputFromNode: vi.fn(async () => ''),
	normalizeMeshyImageInputValue: vi.fn(async (raw: string) => raw),
	hasConnectedMeshyConsumer: vi.fn(() => false),
	missingMeshyImageOutputAnchors: vi.fn(() => [] as string[]),
	meshyImageOutputCount: vi.fn(() => 1),
	...overrides
})

describe('meshyMultiViewValidation', () => {
	describe('多视图模式（generateMultiView=true, target=image）校验跳过', () => {
		it('多视图模式下不应因无连线消费者而返回 ok:false', async () => {
			const node = makeMeshyNode({
				meshyTaskTarget: 'image',
				meshyGenerateMultiView: true,
				meshyTaskFamily: 'text-to-image',
				meshyPrompt: 'a cute cat'
			})
			const opts = makeMockOptions({
				hasConnectedMeshyConsumer: vi.fn(() => false) // 无连线
			})
			const { buildMeshyRequestPayload } = useAIWorkflowMeshyRequest(opts)
			const result = await buildMeshyRequestPayload(node)

			// 多视图模式跳过了 hasConnectedMeshyConsumer 校验，不会返回 false
			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.payload).toBeDefined()
			}
		})

		it('多视图模式下不应因缺少输出锚点而返回 ok:false', async () => {
			const node = makeMeshyNode({
				meshyTaskTarget: 'image',
				meshyGenerateMultiView: true,
				meshyTaskFamily: 'text-to-image',
				meshyPrompt: 'a cute cat'
			})
			const opts = makeMockOptions({
				hasConnectedMeshyConsumer: vi.fn(() => false),
				missingMeshyImageOutputAnchors: vi.fn(() => ['out-image-2', 'out-image-3']) // 有缺失
			})
			const { buildMeshyRequestPayload } = useAIWorkflowMeshyRequest(opts)
			const result = await buildMeshyRequestPayload(node)

			// 多视图模式跳过了 missingMeshyImageOutputAnchors 校验
			expect(result.ok).toBe(true)
		})

		it('多视图模式下 hasConnectedMeshyConsumer 不应被调用', async () => {
			const node = makeMeshyNode({
				meshyTaskTarget: 'image',
				meshyGenerateMultiView: true,
				meshyTaskFamily: 'text-to-image',
				meshyPrompt: 'a cute cat'
			})
			const hasConnected = vi.fn(() => false)
			const opts = makeMockOptions({
				hasConnectedMeshyConsumer: hasConnected
			})
			const { buildMeshyRequestPayload } = useAIWorkflowMeshyRequest(opts)
			await buildMeshyRequestPayload(node)

			expect(hasConnected).not.toHaveBeenCalled()
		})

		it('多视图模式下 missingMeshyImageOutputAnchors 不应被调用', async () => {
			const node = makeMeshyNode({
				meshyTaskTarget: 'image',
				meshyGenerateMultiView: true,
				meshyTaskFamily: 'text-to-image',
				meshyPrompt: 'a cute cat'
			})
			const missingAnchors = vi.fn(() => [])
			const opts = makeMockOptions({
				missingMeshyImageOutputAnchors: missingAnchors
			})
			const { buildMeshyRequestPayload } = useAIWorkflowMeshyRequest(opts)
			await buildMeshyRequestPayload(node)

			expect(missingAnchors).not.toHaveBeenCalled()
		})
	})

	describe('非多视图模式（generateMultiView=false 或 target=3d）保留原有校验', () => {
		it('target=image 且 generateMultiView=false 时无连线应返回 ok:false', async () => {
			const node = makeMeshyNode({
				meshyTaskTarget: 'image',
				meshyGenerateMultiView: false,
				meshyTaskFamily: 'text-to-image',
				meshyPrompt: 'a cute cat'
			})
			const opts = makeMockOptions({
				hasConnectedMeshyConsumer: vi.fn(() => false)
			})
			const { buildMeshyRequestPayload } = useAIWorkflowMeshyRequest(opts)
			const result = await buildMeshyRequestPayload(node)

			expect(result.ok).toBe(false)
			if (!result.ok) {
				expect(result.error).toBeTruthy()
			}
		})

		it('target=3d 时无连线应返回 ok:false（不受多视图影响）', async () => {
			const node = makeMeshyNode({
				meshyTaskTarget: '3d',
				meshyGenerateMultiView: true, // 即使开启多视图，target=3d 也不跳过
				meshyTaskFamily: 'text-to-3d',
				meshyPrompt: 'a cute cat'
			})
			const opts = makeMockOptions({
				hasConnectedMeshyConsumer: vi.fn(() => false)
			})
			const { buildMeshyRequestPayload } = useAIWorkflowMeshyRequest(opts)
			const result = await buildMeshyRequestPayload(node)

			expect(result.ok).toBe(false)
		})

		it('target=image 且 generateMultiView=false 时缺少锚点应返回 ok:false', async () => {
			const node = makeMeshyNode({
				meshyTaskTarget: 'image',
				meshyGenerateMultiView: false,
				meshyTaskFamily: 'text-to-image',
				meshyPrompt: 'a cute cat'
			})
			const opts = makeMockOptions({
				hasConnectedMeshyConsumer: vi.fn(() => true),
				missingMeshyImageOutputAnchors: vi.fn(() => ['out-image-2', 'out-image-3'])
			})
			const { buildMeshyRequestPayload } = useAIWorkflowMeshyRequest(opts)
			const result = await buildMeshyRequestPayload(node)

			expect(result.ok).toBe(false)
		})
	})

	describe('多视图模式 aspectRatio 清空', () => {
		it('generateMultiView=true 时 aspect_ratio 不应被设置，generate_multi_view 应为 true', async () => {
			const node = makeMeshyNode({
				meshyTaskTarget: 'image',
				meshyGenerateMultiView: true,
				meshyTaskFamily: 'text-to-image',
				meshyPrompt: 'a cute cat',
				meshyAspectRatio: '16:9' // 用户设置了比例，但多视图应清空
			})
			const opts = makeMockOptions()
			const { buildMeshyRequestPayload } = useAIWorkflowMeshyRequest(opts)
			const result = await buildMeshyRequestPayload(node)

			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.payload.generate_multi_view).toBe(true)
				expect(result.payload.aspect_ratio).toBeUndefined()
			}
		})

		it('generateMultiView=false 时 aspect_ratio 应保留用户设置', async () => {
			const node = makeMeshyNode({
				meshyTaskTarget: 'image',
				meshyGenerateMultiView: false,
				meshyTaskFamily: 'text-to-image',
				meshyPrompt: 'a cute cat',
				meshyAspectRatio: '16:9'
			})
			const opts = makeMockOptions({
				hasConnectedMeshyConsumer: vi.fn(() => true),
				missingMeshyImageOutputAnchors: vi.fn(() => [])
			})
			const { buildMeshyRequestPayload } = useAIWorkflowMeshyRequest(opts)
			const result = await buildMeshyRequestPayload(node)

			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.payload.aspect_ratio).toBe('16:9')
				expect(result.payload.generate_multi_view).toBeUndefined()
			}
		})
	})
})
