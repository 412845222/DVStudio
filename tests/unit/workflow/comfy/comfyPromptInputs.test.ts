import { describe, it, expect } from 'vitest'
import {
	collectComfyPromptInputs,
	comfyPromptOverride
} from '../../../../src/views/AIWorkflow/node-business/comfy/comfyPromptInputs'

describe('ComfyUI prompt input semantics', () => {
	it('keeps positive and negative connections separate and uses stable edge order', () => {
		const result = collectComfyPromptInputs({
			nodeId: 'c',
			nodesById: {
				c: {
					type: 'comfyui',
					inputs: [
						{ id: 'in', mediaType: 'generic' },
						{ id: 'in-negative', mediaType: 'text' }
					]
				},
				a: { type: 'text', textValue: 'A' },
				b: { type: 'text', textValue: 'B' },
				n: { type: 'text', textValue: 'avoid' }
			},
			edgesById: {
				a: { fromNodeId: 'a', toNodeId: 'c', toAnchorId: 'in' },
				b: { fromNodeId: 'b', toNodeId: 'c', toAnchorId: 'in' },
				n: { fromNodeId: 'n', toNodeId: 'c', toAnchorId: 'in-negative' }
			},
			edgeOrder: ['b', 'n', 'a']
		})
		expect(comfyPromptOverride(result.positiveConnected, result.positive, 'old')).toBe('B\n\nA')
		expect(comfyPromptOverride(result.negativeConnected, result.negative, 'old negative')).toBe(
			'avoid'
		)
	})
	it('does not treat a media node draft as a prompt or accept text on an image-only port', () => {
		const result = collectComfyPromptInputs({
			nodeId: 'c',
			nodesById: {
				c: {
					type: 'comfyui',
					inputs: [
						{ id: 'in', mediaType: 'generic' },
						{ id: 'image', mediaType: 'image' }
					]
				},
				i: { type: 'image', textValue: 'image description' },
				t: { type: 'text', textValue: 'not a prompt input' }
			},
			edgesById: {
				i: { fromNodeId: 'i', toNodeId: 'c', toAnchorId: 'in' },
				t: { fromNodeId: 't', toNodeId: 'c', toAnchorId: 'image' }
			},
			edgeOrder: ['i', 't'],
			resolveText: () => 'must not be used'
		})
		expect(result.positiveConnected).toBe(false)
		expect(comfyPromptOverride(false, result.positive, '')).toBeUndefined()
	})
})
