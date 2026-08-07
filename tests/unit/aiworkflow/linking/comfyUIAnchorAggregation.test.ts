import { describe, it, expect } from 'vitest'
import { canLinkAnchors, anchorKind } from '../../../../src/aiworkflow/domain/link/anchorKinds'
import type { WorkflowNode } from '../../../../src/aiworkflow/types'

/**
 * 测试：ComfyUI 输入锚点的资源类型聚合能力（文本 / 图片 / 视频）
 * 对应：FX6 修复 + 方案 10 的锚点兼容性
 */
describe('ComfyUI Input Anchor Resource Aggregation (FX6 + anchorKinds)', () => {
	const comfyInputAnchor = {
		id: 'in',
		label: '输入',
		mediaType: 'generic' as const,
		acceptedMediaTypes: ['text', 'image', 'video', 'model3d'],
		multiInput: true
	}
	const makeImageOutputAnchor = () => ({ id: 'out', label: 'Out', mediaType: 'image' as const })
	const makeVideoOutputAnchor = () => ({ id: 'out', label: 'Out', mediaType: 'video' as const })
	const makeTextOutputAnchor = () => ({ id: 'out', label: 'Out', mediaType: 'text' as const })

	const createComfyNode = (): WorkflowNode =>
		({
			id: 'comfy-1',
			type: 'comfyui',
			title: 'ComfyUI',
			worldX: 0,
			worldY: 0,
			width: 280,
			height: 220,
			inputs: [comfyInputAnchor],
			outputs: [],
			createdAt: Date.now()
		}) as WorkflowNode

	const createUpstreamNode = (type: string, outputs: any[]): WorkflowNode =>
		({
			id: `upstream-${type}-1`,
			type,
			title: type,
			worldX: -300,
			worldY: 0,
			width: 280,
			height: 180,
			inputs: [],
			outputs,
			createdAt: Date.now()
		}) as WorkflowNode

	it('image → ComfyUI.in 应该可以连接（图片聚合）', () => {
		const nodesById: Record<string, WorkflowNode> = {}
		const from = createUpstreamNode('image', [makeImageOutputAnchor()])
		const to = createComfyNode()
		nodesById[from.id] = from
		nodesById[to.id] = to
		expect(anchorKind(from, 'out', 'out')).toBe('image')
		expect(canLinkAnchors(nodesById, from.id, 'out', to.id, 'in')).toBe(true)
	})

	it('video → ComfyUI.in 应该可以连接（视频聚合）', () => {
		const nodesById: Record<string, WorkflowNode> = {}
		const from = createUpstreamNode('video', [makeVideoOutputAnchor()])
		const to = createComfyNode()
		nodesById[from.id] = from
		nodesById[to.id] = to
		expect(anchorKind(from, 'out', 'out')).toBe('video')
		expect(canLinkAnchors(nodesById, from.id, 'out', to.id, 'in')).toBe(true)
	})

	it('text → ComfyUI.in 应该可以连接（文本聚合）', () => {
		const nodesById: Record<string, WorkflowNode> = {}
		const from = createUpstreamNode('text', [makeTextOutputAnchor()])
		const to = createComfyNode()
		nodesById[from.id] = from
		nodesById[to.id] = to
		expect(anchorKind(from, 'out', 'out')).toBe('text')
		expect(canLinkAnchors(nodesById, from.id, 'out', to.id, 'in')).toBe(true)
	})

	it('blender(model3d) → ComfyUI.in 应该可以连接（3D资源聚合）', () => {
		const nodesById: Record<string, WorkflowNode> = {}
		const blenderOut = { id: 'out', label: 'Out', mediaType: 'model3d' as const }
		const from = createUpstreamNode('blender', [blenderOut])
		const to = createComfyNode()
		nodesById[from.id] = from
		nodesById[to.id] = to
		expect(canLinkAnchors(nodesById, from.id, 'out', to.id, 'in')).toBe(true)
	})

	it('meshy → ComfyUI.in 应该可以连接（通过 acceptedMediaTypes model3d）', () => {
		const nodesById: Record<string, WorkflowNode> = {}
		const meshyOut = { id: 'out', label: 'Out', mediaType: 'model3d' as const }
		const from = createUpstreamNode('meshy', [meshyOut])
		const to = createComfyNode()
		nodesById[from.id] = from
		nodesById[to.id] = to
		expect(canLinkAnchors(nodesById, from.id, 'out', to.id, 'in')).toBe(true)
	})
})
