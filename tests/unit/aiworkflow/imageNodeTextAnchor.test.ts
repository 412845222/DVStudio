import { describe, it, expect } from 'vitest'
import { anchorKind, canLinkAnchors } from '../../../src/aiworkflow/domain/link/anchorKinds'
import type { WorkflowNode } from '../../../src/aiworkflow/types'
import { AIWorkflowStore } from '../../../src/store/aiworkflow/store'

describe('image node text input anchor', () => {
	const createNode = (
		id: string,
		type: string,
		inputs: any[] = [],
		outputs: any[] = []
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

	describe('default image node anchors', () => {
		it('should have in-0 multimodal input and out-image output after enforceSingleIOAnchors', () => {
			AIWorkflowStore.commit('hydrateDraft', {
				snapshot: {
					nodesById: {
						'img-1': {
							id: 'img-1',
							type: 'image',
							title: 'Image Node',
							worldX: 0,
							worldY: 0,
							width: 280,
							height: 180,
							inputs: [],
							outputs: [],
							createdAt: Date.now()
						}
					},
					nodeOrder: ['img-1'],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			const imgNode = AIWorkflowStore.state.nodesById['img-1']
			expect(imgNode).toBeDefined()
			expect(imgNode.type).toBe('image')

			// Image node uses single multimodal input (in-0) that accepts text/image/video/model3d/audio
			const multimodalInput = imgNode.inputs?.find((a: any) => a.id === 'in-0')
			expect(multimodalInput).toBeDefined()
			expect(multimodalInput?.label).toBe('多模态输入')
			expect(multimodalInput?.mediaType).toBe('generic')
			expect(multimodalInput?.multiInput).toBe(true)
			expect(multimodalInput?.acceptedMediaTypes).toContain('text')
			expect(multimodalInput?.acceptedMediaTypes).toContain('image')

			// Image node outputs image via out-image
			const outputAnchor = imgNode.outputs?.find((a: any) => a.id === 'out-image')
			expect(outputAnchor).toBeDefined()
			expect(outputAnchor?.label).toBe('图片输出')
			expect(outputAnchor?.mediaType).toBe('image')
		})
	})

	describe('anchorKind for in-text on image node', () => {
		it('should return "text" kind for in-text anchor on image node', () => {
			const imgNode = createNode(
				'img-1',
				'image',
				[
					{ id: 'in-text', label: '提示词输入', mediaType: 'text' },
					{ id: 'in-0', label: '图片输入', multiInput: true, mediaType: 'image' }
				],
				[{ id: 'out-0', label: '图片输出', mediaType: 'image' }]
			)

			expect(anchorKind(imgNode, 'in-text', 'in')).toBe('text')
			expect(anchorKind(imgNode, 'in-0', 'in')).toBe('image')
			expect(anchorKind(imgNode, 'out-0', 'out')).toBe('image')
		})
	})

	describe('canLinkAnchors between text node and image node in-text', () => {
		it('should allow text node output to connect to image node in-text anchor', () => {
			const textNode = createNode(
				'text-1',
				'text',
				[{ id: 'in-0', label: '输入', mediaType: 'text', multiInput: true }],
				[{ id: 'out-0', label: '文本输出', mediaType: 'text' }]
			)
			const imgNode = createNode(
				'img-1',
				'image',
				[
					{ id: 'in-text', label: '提示词输入', mediaType: 'text' },
					{ id: 'in-0', label: '图片输入', multiInput: true, mediaType: 'image' }
				],
				[{ id: 'out-0', label: '图片输出', mediaType: 'image' }]
			)

			const nodesById: Record<string, WorkflowNode> = {
				'text-1': textNode,
				'img-1': imgNode
			}

			expect(canLinkAnchors(nodesById, 'text-1', 'out-0', 'img-1', 'in-text')).toBe(true)
		})

		it('should allow text-merge node output to connect to image node in-text anchor', () => {
			const mergeNode = createNode(
				'merge-1',
				'text-merge',
				[
					{ id: 'in-a', mediaType: 'text' },
					{ id: 'in-b', mediaType: 'text' }
				],
				[{ id: 'out-0', mediaType: 'text' }]
			)
			const imgNode = createNode(
				'img-1',
				'image',
				[
					{ id: 'in-text', label: '提示词输入', mediaType: 'text' },
					{ id: 'in-0', label: '图片输入', multiInput: true, mediaType: 'image' }
				],
				[{ id: 'out-0', label: '图片输出', mediaType: 'image' }]
			)

			const nodesById: Record<string, WorkflowNode> = {
				'merge-1': mergeNode,
				'img-1': imgNode
			}

			expect(canLinkAnchors(nodesById, 'merge-1', 'out-0', 'img-1', 'in-text')).toBe(true)
		})

		it('should still allow image node output to connect to image node in-0', () => {
			const imgOutNode = createNode(
				'img-out',
				'image',
				[
					{ id: 'in-text', mediaType: 'text' },
					{ id: 'in-0', multiInput: true, mediaType: 'image' }
				],
				[{ id: 'out-0', mediaType: 'image' }]
			)
			const imgInNode = createNode(
				'img-in',
				'image',
				[
					{ id: 'in-text', mediaType: 'text' },
					{ id: 'in-0', multiInput: true, mediaType: 'image' }
				],
				[{ id: 'out-0', mediaType: 'image' }]
			)

			const nodesById: Record<string, WorkflowNode> = {
				'img-out': imgOutNode,
				'img-in': imgInNode
			}

			expect(canLinkAnchors(nodesById, 'img-out', 'out-0', 'img-in', 'in-0')).toBe(true)
		})
	})

	describe('setNodeImageSettings imageGenerationSource', () => {
		it('should accept "gemini" as valid imageGenerationSource', () => {
			AIWorkflowStore.commit('hydrateDraft', {
				snapshot: {
					nodesById: {
						'img-gemini': {
							id: 'img-gemini',
							type: 'image',
							title: 'Gemini Image',
							worldX: 0,
							worldY: 0,
							width: 280,
							height: 180,
							inputs: [],
							outputs: [],
							createdAt: Date.now()
						}
					},
					nodeOrder: ['img-gemini'],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			AIWorkflowStore.commit('setNodeImageSettings', {
				nodeId: 'img-gemini',
				imageSettings: {
					imageGenerationSource: 'gemini'
				}
			})

			const node = AIWorkflowStore.state.nodesById['img-gemini']
			expect(node.imageSettings?.imageGenerationSource).toBe('gemini')
		})

		it('should accept "tripo3d" as valid imageGenerationSource', () => {
			AIWorkflowStore.commit('hydrateDraft', {
				snapshot: {
					nodesById: {
						'img-tripo': {
							id: 'img-tripo',
							type: 'image',
							title: 'Tripo3D Image',
							worldX: 0,
							worldY: 0,
							width: 280,
							height: 180,
							inputs: [],
							outputs: [],
							createdAt: Date.now()
						}
					},
					nodeOrder: ['img-tripo'],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			AIWorkflowStore.commit('setNodeImageSettings', {
				nodeId: 'img-tripo',
				imageSettings: {
					imageGenerationSource: 'tripo3d'
				}
			})

			const node = AIWorkflowStore.state.nodesById['img-tripo']
			expect(node.imageSettings?.imageGenerationSource).toBe('tripo3d')
		})
	})
})
