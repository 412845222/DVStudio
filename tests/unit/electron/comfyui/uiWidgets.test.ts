// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readUiWidgets } from '../../../../electron/backend/modules/comfyui/runtime/uiWidgets.mjs'
import { workflowToPrompt } from '../../../../electron/backend/modules/comfyui/workflow-converter.mjs'

describe('ComfyUI widget serialization compatibility', () => {
	const info = {
		input: {
			required: {
				seed: ['INT', { control_after_generate: true }],
				steps: ['INT', { min: 1 }],
				sampler: [['euler', 'heun']]
			}
		}
	}
	it.each([
		[[123, 'randomize', 8, 'heun'], []],
		[[123, 'randomize', 8, 'heun'], ['steps']],
		[[123, 'randomize', 'heun'], ['steps']]
	])(
		'consumes seed controls and accepts both linked-widget serialization layouts',
		(values, linked) => {
			const decoded = readUiWidgets(
				{ type: 'Sampler', id: 1, widgets_values: values },
				info,
				new Set(linked)
			)
			expect(decoded.warnings).toEqual([])
			expect(decoded.inputs).toEqual({
				seed: 123,
				...(linked.length ? {} : { steps: 8 }),
				sampler: 'heun'
			})
		}
	)
	it('does not silently accept an invalid enum even when a default exists', () => {
		const decoded = readUiWidgets(
			{ type: 'Sampler', id: 1, widgets_values: ['obsolete'] },
			{ input: { required: { sampler: [['euler', 'heun'], { default: 'euler' }] } } },
			new Set()
		)
		expect(decoded.warnings.length).toBeGreaterThan(0)
	})
	it('distinguishes bypass from mute on a connected backend node', () => {
		const source = { id: 1, type: 'Source', inputs: [], outputs: [{ type: 'IMAGE' }] }
		const effect = {
			id: 2,
			type: 'Effect',
			mode: 4,
			inputs: [{ name: 'image', type: 'IMAGE', link: 1 }],
			outputs: [{ type: 'IMAGE' }]
		}
		const sink = { id: 3, type: 'Sink', inputs: [{ name: 'image', type: 'IMAGE', link: 2 }] }
		const schema = {
			Source: {},
			Effect: { input: { required: { image: ['IMAGE'] } } },
			Sink: { input: { required: { image: ['IMAGE'] } } }
		}
		const workflow = {
			nodes: [source, effect, sink],
			links: [
				[1, 1, 0, 2, 0, 'IMAGE'],
				[2, 2, 0, 3, 0, 'IMAGE']
			]
		}
		const bypass = workflowToPrompt(workflow, schema)
		expect(bypass.prompt['2']).toBeUndefined()
		expect(bypass.prompt['3'].inputs.image).toEqual(['1', 0])
		effect.mode = 2
		const muted = workflowToPrompt(workflow, schema)
		expect(muted.prompt['2']).toBeUndefined()
		expect(muted.prompt['3'].inputs.image).toBeUndefined()
		expect(muted.warnings?.length).toBeGreaterThan(0)
	})
})
