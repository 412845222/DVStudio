import { describe, it, expect } from 'vitest'
import {
	anchorKind,
	canLinkAnchors,
	normalizeAnchorMediaType,
	anchorKindLabel
} from '../../../../src/aiworkflow/domain/link/anchorKinds'
import type { WorkflowNode } from '../../../../src/aiworkflow/types'

describe('anchorKinds', () => {
	describe('normalizeAnchorMediaType', () => {
		it('should return canonical media types directly', () => {
			expect(normalizeAnchorMediaType('image')).toBe('image')
			expect(normalizeAnchorMediaType('video')).toBe('video')
			expect(normalizeAnchorMediaType('text')).toBe('text')
			expect(normalizeAnchorMediaType('model3d')).toBe('model3d')
			expect(normalizeAnchorMediaType('audio')).toBe('audio')
			expect(normalizeAnchorMediaType('flow')).toBe('flow')
			expect(normalizeAnchorMediaType('meta')).toBe('meta')
		})

		it('should handle case-insensitive input', () => {
			expect(normalizeAnchorMediaType('IMAGE')).toBe('image')
			expect(normalizeAnchorMediaType('Video')).toBe('video')
			expect(normalizeAnchorMediaType('  text  ')).toBe('text')
		})

		it('should detect model3d from anchor id', () => {
			expect(
				normalizeAnchorMediaType('generic', { anchorId: 'in-model' })
			).toBe('model3d')
			expect(
				normalizeAnchorMediaType('generic', { anchorId: 'model3d-input' })
			).toBe('model3d')
			expect(
				normalizeAnchorMediaType('generic', { anchorId: 'in-3d' })
			).toBe('model3d')
		})

		it('should detect model3d from node type', () => {
			expect(
				normalizeAnchorMediaType('generic', { nodeType: 'model3d' })
			).toBe('model3d')
			expect(
				normalizeAnchorMediaType('generic', { nodeType: 'meshy' })
			).toBe('model3d')
		})

		it('should return undefined for unknown types', () => {
			expect(normalizeAnchorMediaType('unknown')).toBeUndefined()
			expect(normalizeAnchorMediaType('')).toBeUndefined()
		})
	})

	describe('anchorKind', () => {
		const createNode = (type: string, inputs: any[] = [], outputs: any[] = []): WorkflowNode => ({
			id: 'test-node',
			type,
			worldX: 0,
			worldY: 0,
			width: 200,
			height: 100,
			inputs,
			outputs
		} as WorkflowNode)

		it('should return null for undefined node', () => {
			expect(anchorKind(undefined, 'out-1', 'out')).toBeNull()
		})

		it('should return correct kind for basic media nodes', () => {
			const imageNode = createNode('image')
			expect(anchorKind(imageNode, 'out-1', 'out')).toBe('image')

			const textNode = createNode('text')
			expect(anchorKind(textNode, 'out-1', 'out')).toBe('text')

			const videoNode = createNode('video')
			expect(anchorKind(videoNode, 'out-1', 'out')).toBe('video')

			const modelNode = createNode('model3d')
			expect(anchorKind(modelNode, 'out-1', 'out')).toBe('model3d')
		})

		it('should return resource for image/video input anchors', () => {
			const imageNode = createNode('image')
			expect(anchorKind(imageNode, 'in-resource', 'in')).toBe('resource')

			const videoNode = createNode('video')
			expect(anchorKind(videoNode, 'in-resource', 'in')).toBe('resource')
		})

		it('should detect anchor media type from anchor spec', () => {
			const node = createNode('custom', [
				{ id: 'in-1', mediaType: 'image' },
				{ id: 'in-2', mediaType: 'video' }
			], [
				{ id: 'out-1', mediaType: 'text' }
			])
			expect(anchorKind(node, 'in-1', 'in')).toBe('image')
			expect(anchorKind(node, 'in-2', 'in')).toBe('video')
			expect(anchorKind(node, 'out-1', 'out')).toBe('text')
		})

		it('should handle story node flow anchors', () => {
			const storyNode = createNode('story')
			expect(anchorKind(storyNode, 'in-flow', 'in')).toBe('flow')
			expect(anchorKind(storyNode, 'out-flow', 'out')).toBe('flow')
		})

		it('should return resource for story resource input', () => {
			const storyNode = createNode('story')
			expect(anchorKind(storyNode, 'in-resource', 'in')).toBe('resource')
		})
	})

	describe('canLinkAnchors', () => {
		const createNode = (
			id: string,
			type: string,
			inputs: any[] = [],
			outputs: any[] = []
		): WorkflowNode => ({
			id,
			type,
			worldX: 0,
			worldY: 0,
			width: 200,
			height: 100,
			inputs,
			outputs
		} as WorkflowNode)

		it('should allow linking same media types', () => {
			const nodesById: Record<string, WorkflowNode> = {
				'node-a': createNode('node-a', 'image', [], [{ id: 'out-1', mediaType: 'image' }]),
				'node-b': createNode('node-b', 'image', [{ id: 'in-1', mediaType: 'image' }], [])
			}
			expect(canLinkAnchors(nodesById, 'node-a', 'out-1', 'node-b', 'in-1')).toBe(true)
		})

		it('should allow media types to connect to resource inputs', () => {
			const nodesById: Record<string, WorkflowNode> = {
				'image-out': createNode('image-out', 'image', [], [{ id: 'out-1' }]),
				'resource-in': createNode('resource-in', 'image', [{ id: 'in-resource' }], [])
			}
			expect(canLinkAnchors(nodesById, 'image-out', 'out-1', 'resource-in', 'in-resource')).toBe(true)
		})

		it('should allow image/video/text to connect to video input', () => {
			const videoNode = createNode('video-in', 'video', [{ id: 'in-1' }], [])

			const imageNode = createNode('image-out', 'image', [], [{ id: 'out-1' }])
			const textNode = createNode('text-out', 'text', [], [{ id: 'out-1' }])
			const videoOutNode = createNode('video-out', 'video', [], [{ id: 'out-1' }])

			expect(canLinkAnchors(
				{ 'image-out': imageNode, 'video-in': videoNode },
				'image-out', 'out-1', 'video-in', 'in-1'
			)).toBe(true)

			expect(canLinkAnchors(
				{ 'text-out': textNode, 'video-in': videoNode },
				'text-out', 'out-1', 'video-in', 'in-1'
			)).toBe(true)

			expect(canLinkAnchors(
				{ 'video-out': videoOutNode, 'video-in': videoNode },
				'video-out', 'out-1', 'video-in', 'in-1'
			)).toBe(true)
		})

		it('should reject audio connecting to non-audio inputs', () => {
			const nodesById: Record<string, WorkflowNode> = {
				'audio-out': createNode('audio-out', 'audio', [], [{ id: 'out-1' }]),
				'image-in': createNode('image-in', 'image', [{ id: 'in-1' }], [])
			}
			expect(canLinkAnchors(nodesById, 'audio-out', 'out-1', 'image-in', 'in-1')).toBe(false)
		})

		it('should reject video connecting to non-video/image/text inputs', () => {
			const nodesById: Record<string, WorkflowNode> = {
				'video-out': createNode('video-out', 'video', [], [{ id: 'out-1' }]),
				'text-in': createNode('text-in', 'text', [{ id: 'in-1' }], [])
			}
			expect(canLinkAnchors(nodesById, 'video-out', 'out-1', 'text-in', 'in-1')).toBe(false)
		})

		it('should allow model3d to connect to resource inputs', () => {
			const nodesById: Record<string, WorkflowNode> = {
				'model-out': createNode('model-out', 'model3d', [], [{ id: 'out-1' }]),
				'resource-in': createNode('resource-in', 'model3d', [{ id: 'in-resource' }], [])
			}
			expect(canLinkAnchors(nodesById, 'model-out', 'out-1', 'resource-in', 'in-resource')).toBe(true)
		})

		it('should allow flow to connect to flow', () => {
			const nodesById: Record<string, WorkflowNode> = {
				'flow-out': createNode('flow-out', 'story', [], [{ id: 'out-flow', mediaType: 'flow' }]),
				'flow-in': createNode('flow-in', 'story', [{ id: 'in-flow', mediaType: 'flow' }], [])
			}
			expect(canLinkAnchors(nodesById, 'flow-out', 'out-flow', 'flow-in', 'in-flow')).toBe(true)
		})

		it('should return false when nodes do not exist', () => {
			const nodesById: Record<string, WorkflowNode> = {}
			expect(canLinkAnchors(nodesById, 'node-a', 'out-1', 'node-b', 'in-1')).toBe(false)
		})
	})

	describe('anchorKindLabel', () => {
		it('should return correct labels for all kinds', () => {
			expect(anchorKindLabel('flow')).toBe('flow')
			expect(anchorKindLabel('resource')).toBe('resource')
			expect(anchorKindLabel('image')).toBe('image')
			expect(anchorKindLabel('video')).toBe('video')
			expect(anchorKindLabel('model3d')).toBe('model3d')
			expect(anchorKindLabel('audio')).toBe('audio')
			expect(anchorKindLabel('text')).toBe('text')
			expect(anchorKindLabel('meta')).toBe('meta')
		})

		it('should return unknown for null', () => {
			expect(anchorKindLabel(null)).toBe('unknown')
		})
	})
})
