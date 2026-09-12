// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
	bindText,
	bindUploadedFiles,
	refineTextMappings
} from '../../../../electron/backend/modules/comfyui/runtime/inputBindings.mjs'

describe('ComfyUI exact input bindings', () => {
	it('routes files by stable target, not array order', () => {
		const graph = { a: { inputs: { image: 'a.png' } }, b: { inputs: { image: 'b.png' } } }
		const mappings = {
			imageInputs: [
				{ nodeId: 'a', inputKey: 'image' },
				{ nodeId: 'b', inputKey: 'image' }
			]
		}
		bindUploadedFiles(graph, mappings, [
			{ mediaType: 'image', bindingId: 'b:image', path: 'new-b.png' }
		])
		expect(graph.a.inputs.image).toBe('a.png')
		expect(graph.b.inputs.image).toBe('new-b.png')
		expect(() =>
			bindUploadedFiles(graph, mappings, [{ mediaType: 'image', bindingId: 'missing', path: 'x' }])
		).toThrow('INVALID_INPUT_BINDING')
	})
	it('does not silently replace a socket or unsupported media binding', () => {
		const graph = { a: { inputs: { text: ['b', 0] } } }
		expect(() =>
			bindText(
				graph,
				{ textNodes: { positive: [{ nodeId: 'a', inputKey: 'text' }] } },
				{ positivePrompt: 'new' }
			)
		).toThrow()
		expect(() => bindUploadedFiles(graph, {}, [{ mediaType: 'model3d', path: 'x' }])).toThrow(
			'UNSUPPORTED_INPUT_BINDING'
		)
	})
})

describe('ComfyUI text role refinement', () => {
	const info = (nodeId: string) => ({
		textNodes: {
			positive: [{ nodeId, inputKey: 'text', allTextKeys: ['text'], title: 'Prompt' }],
			negative: []
		}
	})
	it('inherits the negative role through a neutral encoder chain', () => {
		const graph = {
			'9': { class_type: 'Text', inputs: { text: 'source' } },
			'8': { class_type: 'Mid', inputs: { cond: ['9', 0] } },
			'7': { class_type: 'Encode', inputs: { negative: ['8', 0] } }
		}
		const refined = refineTextMappings(graph, info('9'))
		expect(refined.textNodes.negative.map((n) => n.nodeId)).toEqual(['9'])
		expect(refined.textNodes.positive).toEqual([])
	})
	it('flags one text source feeding both positive and negative branches as ambiguous', () => {
		const graph = {
			'9': { class_type: 'Text', inputs: { text: 'source' } },
			'7': {
				class_type: 'Encode',
				inputs: { positive: ['9', 0], negative: ['9', 0] }
			}
		}
		const refined = refineTextMappings(graph, info('9'))
		const target = refined.textNodes.positive[0]
		expect(target.ambiguous).toBe(true)
		expect(() => bindText(graph, refined, { positivePrompt: 'new text' })).toThrow(
			/同时连接正向与负向分支/
		)
	})
})
