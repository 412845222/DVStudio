// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
	executionGraph,
	validatePromptInputs
} from '../../../../electron/backend/modules/comfyui/runtime/executionGraph.mjs'

describe('ComfyUI execution graph pruning', () => {
	const info = {
		Root: { output_node: true },
		Mid: {},
		Dead: {}
	}
	it('keeps only nodes reachable backwards from output nodes', () => {
		const graph = {
			root: { class_type: 'Root', inputs: { image: ['mid', 0] } },
			mid: { class_type: 'Mid', inputs: {} },
			dead: { class_type: 'Dead', inputs: {} }
		}
		expect(Object.keys(executionGraph(graph, info))).toEqual(['root', 'mid'])
	})
	it('returns the graph untouched when no output node is known', () => {
		const graph = { a: { class_type: 'Mid', inputs: {} } }
		expect(executionGraph(graph, { Mid: {} })).toBe(graph)
	})
})

describe('ComfyUI prompt input validation', () => {
	const info = {
		Load: {
			input: {
				required: {
					image: ['STRING'],
					count: ['INT', { min: 1, max: 4 }],
					ratio: ['FLOAT'],
					enabled: ['BOOLEAN'],
					sampler: [['euler', 'heun']]
				}
			}
		},
		Dyn: {
			input: {
				required: { ref_images: ['COMFY_AUTOGROW_V3', { template: { min: 1 } }] }
			}
		}
	}
	const validGraph = {
		a: {
			class_type: 'Load',
			inputs: { image: 'x.png', count: 2, ratio: 1.5, enabled: true, sampler: 'euler' }
		}
	}
	it('accepts a graph matching the server schema', () => {
		expect(validatePromptInputs(validGraph, info)).toEqual([])
	})
	it('flags unknown node types before posting', () => {
		const errors = validatePromptInputs({ x: { class_type: 'Missing', inputs: {} } }, info)
		expect(errors.join('；')).toContain('当前服务未安装该节点')
	})
	it('flags missing required fields', () => {
		const errors = validatePromptInputs(
			{
				a: { class_type: 'Load', inputs: { count: 2, ratio: 1.5, enabled: true, sampler: 'euler' } }
			},
			info
		)
		expect(errors.join('；')).toContain('缺少必填参数')
	})
	it('rejects enum, type and range mismatches', () => {
		const errors = validatePromptInputs(
			{
				a: {
					class_type: 'Load',
					inputs: {
						image: 7,
						count: 9,
						ratio: 'fast',
						enabled: 'yes',
						sampler: 'ddim'
					}
				}
			},
			info
		)
		const message = errors.join('；')
		expect(message).toContain('image')
		expect(message).toContain('count')
		expect(message).toContain('ratio')
		expect(message).toContain('enabled')
		expect(message).toContain('sampler')
	})
	it('requires the minimum number of dynamic (autogrow) inputs', () => {
		const errors = validatePromptInputs({ d: { class_type: 'Dyn', inputs: {} } }, info)
		expect(errors.join('；')).toContain('动态输入数量不足')
		expect(
			validatePromptInputs(
				{ d: { class_type: 'Dyn', inputs: { 'ref_images.ref_image_0': ['9', 0] } } },
				info
			)
		).toEqual([])
	})
	it('skips validation when schema info is unavailable', () => {
		expect(validatePromptInputs(validGraph, {})).toEqual([])
	})
})
