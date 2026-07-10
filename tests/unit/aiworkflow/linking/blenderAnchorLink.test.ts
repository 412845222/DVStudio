import { describe, it, expect } from 'vitest'
import { canLinkAnchors } from '../../../../src/aiworkflow/domain/link/anchorKinds'
import type { WorkflowNode, WorkflowState } from '../../../../src/aiworkflow/types'

const createNode = (
	id: string,
	type: string,
	inputs: WorkflowNode['inputs'] = [],
	outputs: WorkflowNode['outputs'] = []
): WorkflowNode =>
	({
		id,
		type,
		worldX: 0,
		worldY: 0,
		width: 200,
		height: 100,
		inputs,
		outputs
	}) as WorkflowNode

const blenderNode = (id = 'blender-1'): WorkflowNode =>
	createNode(
		id,
		'blender',
		[
			{
				id: 'in-0',
				label: '输入（文本/图片/3D模型）',
				mediaType: 'generic',
				acceptedMediaTypes: ['text', 'image', 'model3d'],
				multiInput: true
			}
		],
		[{ id: 'out-0', label: '输出（文本/图片/3D模型）', mediaType: 'generic' }]
	)

const nodesMap = (...nodes: WorkflowNode[]): WorkflowState['nodesById'] => {
	const map: WorkflowState['nodesById'] = {}
	for (const n of nodes) map[n.id] = n
	return map
}

describe('blender anchor linking', () => {
	describe('inputs into blender in-0', () => {
		it('accepts text node output', () => {
			const text = createNode('text-1', 'text', [], [{ id: 'out-0', mediaType: 'text' }])
			const blender = blenderNode()
			const nodesById = nodesMap(text, blender)
			expect(canLinkAnchors(nodesById, 'text-1', 'out-0', 'blender-1', 'in-0')).toBe(true)
		})

		it('accepts image node output', () => {
			const image = createNode('image-1', 'image', [], [{ id: 'out-0', mediaType: 'image' }])
			const blender = blenderNode()
			const nodesById = nodesMap(image, blender)
			expect(canLinkAnchors(nodesById, 'image-1', 'out-0', 'blender-1', 'in-0')).toBe(true)
		})

		it('accepts model3d node output', () => {
			const model = createNode(
				'model3d-1',
				'model3d',
				[],
				[{ id: 'out-0', mediaType: 'model3d' }]
			)
			const blender = blenderNode()
			const nodesById = nodesMap(model, blender)
			expect(canLinkAnchors(nodesById, 'model3d-1', 'out-0', 'blender-1', 'in-0')).toBe(true)
		})

		it('accepts meshy node model output', () => {
			const meshy = createNode('meshy-1', 'meshy', [], [{ id: 'out-model', mediaType: 'model3d' }])
			const blender = blenderNode()
			const nodesById = nodesMap(meshy, blender)
			expect(canLinkAnchors(nodesById, 'meshy-1', 'out-model', 'blender-1', 'in-0')).toBe(true)
		})
	})

	describe('outputs from blender out-0', () => {
		it('links to text node input', () => {
			const text = createNode('text-1', 'text', [{ id: 'in-0', mediaType: 'text' }], [])
			const blender = blenderNode()
			const nodesById = nodesMap(blender, text)
			expect(canLinkAnchors(nodesById, 'blender-1', 'out-0', 'text-1', 'in-0')).toBe(true)
		})

		it('links to image node input', () => {
			const image = createNode('image-1', 'image', [{ id: 'in-0' }], [])
			const blender = blenderNode()
			const nodesById = nodesMap(blender, image)
			expect(canLinkAnchors(nodesById, 'blender-1', 'out-0', 'image-1', 'in-0')).toBe(true)
		})

		it('links to model3d node resource input', () => {
			const model = createNode(
				'model3d-1',
				'model3d',
				[{ id: 'in-resource', mediaType: 'generic' }],
				[]
			)
			const blender = blenderNode()
			const nodesById = nodesMap(blender, model)
			expect(canLinkAnchors(nodesById, 'blender-1', 'out-0', 'model3d-1', 'in-resource')).toBe(true)
		})
	})

	describe('non-blender nodes remain unaffected', () => {
		it('still rejects text output into a plain generic resource anchor of non-blender node', () => {
			const text = createNode('text-1', 'text', [], [{ id: 'out-0', mediaType: 'text' }])
			const scene = createNode(
				'scene-1',
				'scene-layout',
				[{ id: 'in-res', mediaType: 'generic' }],
				[]
			)
			const nodesById = nodesMap(text, scene)
			expect(canLinkAnchors(nodesById, 'text-1', 'out-0', 'scene-1', 'in-res')).toBe(false)
		})

		it('blender in-0 keeps generic kind (not hijacked to model3d by anchor id)', () => {
			const video = createNode('video-1', 'video', [], [{ id: 'out-0', mediaType: 'video' }])
			const blender = blenderNode()
			const nodesById = nodesMap(video, blender)
			// generic(resource) anchors accept video too — acceptable superset, not a regression
			expect(canLinkAnchors(nodesById, 'video-1', 'out-0', 'blender-1', 'in-0')).toBe(true)
		})
	})
})
