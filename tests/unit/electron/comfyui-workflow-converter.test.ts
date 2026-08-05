// @vitest-environment node
import { describe, it, expect } from 'vitest'

describe('comfyui workflow-converter: core utilities', () => {
	let flattenWorkflow: (w: any) => { nodes: any[]; links: any[] }
	let buildPromptFromFlat: (
		nodes: any[],
		links: any[],
		objectInfo: any
	) => { prompt: Record<string, any>; error: string | null; warnings?: string[] }
	let workflowToPrompt: (
		w: any,
		objectInfo: any
	) => { prompt: Record<string, any>; error: string | null; warnings?: string[] }

	beforeAll(async () => {
		const mod = await import('../../../electron/backend/modules/comfyui/workflow-converter.mjs')
		flattenWorkflow = mod.flattenWorkflow
		buildPromptFromFlat = mod.buildPromptFromFlat
		workflowToPrompt = mod.workflowToPrompt
	})

	describe('flattenWorkflow', () => {
		it('returns empty for empty workflow', () => {
			const result = flattenWorkflow({})
			expect(result.nodes).toEqual([])
			expect(result.links).toEqual([])
		})

		it('passes through simple workflow without UUID nodes', () => {
			const workflow = {
				nodes: [
					{ id: '1', type: 'CheckpointLoaderSimple' },
					{ id: '2', type: 'SaveImage' }
				],
				links: [[0, '1', 0, '2', 0, 'IMAGE']]
			}
			const result = flattenWorkflow(workflow)
			expect(result.nodes).toHaveLength(2)
			expect(result.links).toHaveLength(1)
		})

		it('keeps Reroute nodes during flatten (they are skipped during prompt build)', () => {
			const workflow = {
				nodes: [
					{ id: '1', type: 'CheckpointLoaderSimple' },
					{ id: '2', type: 'Reroute' },
					{ id: '3', type: 'SaveImage' }
				],
				links: [
					[0, '1', 0, '2', 0, '*'],
					[1, '2', 0, '3', 0, '*']
				]
			}
			const result = flattenWorkflow(workflow)
			const nodeTypes = result.nodes.map((n: any) => n.type)
			expect(nodeTypes).toContain('CheckpointLoaderSimple')
			expect(nodeTypes).toContain('SaveImage')
			expect(nodeTypes).toContain('Reroute')
		})

		it('expands nested subgraph with UUID type and removes virtual I/O nodes', () => {
			const subgraphId = '0f47377a-2933-4dba-9791-a9c54b078226'
			const workflow = {
				nodes: [
					{ id: '5', type: 'CheckpointLoaderSimple' },
					{ id: '6', type: subgraphId },
					{ id: '7', type: 'SaveImage' }
				],
				links: [
					[10, '5', 0, '6', 0, 'MODEL'],
					[11, '6', 0, '7', 0, 'IMAGE']
				],
				definitions: {
					subgraphs: [
						{
							id: subgraphId,
							name: 'TestSubgraph',
							inputNode: { id: '100' },
							outputNode: { id: '101' },
							nodes: [
								{ id: '100', type: 'SubgraphInput' },
								{ id: '101', type: 'SubgraphOutput' },
								{ id: '102', type: 'KSampler' },
								{ id: '103', type: 'VAEDecode' }
							],
							links: [
								[200, '100', 0, '102', 0, 'MODEL'],
								[201, '102', 0, '103', 0, 'LATENT'],
								[202, '103', 0, '101', 0, 'IMAGE']
							]
						}
					]
				}
			}
			const result = flattenWorkflow(workflow)
			const nodeTypes = result.nodes.map((n: any) => n.type)
			expect(nodeTypes).toContain('CheckpointLoaderSimple')
			expect(nodeTypes).toContain('KSampler')
			expect(nodeTypes).toContain('VAEDecode')
			expect(nodeTypes).toContain('SaveImage')
			expect(nodeTypes).not.toContain(subgraphId)
			expect(nodeTypes).not.toContain('SubgraphInput')
			expect(nodeTypes).not.toContain('SubgraphOutput')
		})

		it('expands deeply nested subgraphs recursively', () => {
			const innerId = 'aaaaaaaa-2933-4dba-9791-a9c54b078001'
			const outerId = 'bbbbbbbb-2933-4dba-9791-a9c54b078002'
			const workflow = {
				nodes: [
					{ id: '1', type: outerId },
					{ id: '2', type: 'SaveImage' }
				],
				links: [[10, '1', 0, '2', 0, 'IMAGE']],
				definitions: {
					subgraphs: [
						{
							id: outerId,
							inputNode: { id: '10' },
							outputNode: { id: '11' },
							nodes: [
								{ id: '10', type: 'SubgraphInput' },
								{ id: '11', type: 'SubgraphOutput' },
								{ id: '12', type: innerId },
								{ id: '13', type: 'VAEDecode' }
							],
							links: [
								[20, '10', 0, '12', 0, '*'],
								[21, '12', 0, '13', 0, 'LATENT'],
								[22, '13', 0, '11', 0, 'IMAGE']
							],
							definitions: {
								subgraphs: [
									{
										id: innerId,
										inputNode: { id: '20' },
										outputNode: { id: '21' },
										nodes: [
											{ id: '20', type: 'ComponentInput' },
											{ id: '21', type: 'ComponentOutput' },
											{ id: '22', type: 'KSampler' }
										],
										links: [
											[30, '20', 0, '22', 0, '*'],
											[31, '22', 0, '21', 0, '*']
										]
									}
								]
							}
						}
					]
				}
			}
			const result = flattenWorkflow(workflow)
			const nodeTypes = result.nodes.map((n: any) => n.type)
			expect(nodeTypes).toContain('KSampler')
			expect(nodeTypes).toContain('VAEDecode')
			expect(nodeTypes).not.toContain(outerId)
			expect(nodeTypes).not.toContain(innerId)
		})
	})

	describe('buildPromptFromFlat', () => {
		const ckptInput = { required: { ckpt_name: ['STRING', { default: 'model.safetensors' }] } }
		const clipTextInput = { required: { text: ['STRING', { default: '' }], clip: ['CLIP'] } }
		const ksamplerInput = {
			required: {
				model: ['MODEL'],
				positive: ['CONDITIONING'],
				negative: ['CONDITIONING'],
				latent_image: ['LATENT'],
				seed: ['INT', { default: 0 }],
				steps: ['INT', { default: 20 }],
				cfg: ['FLOAT', { default: 8.0 }],
				sampler_name: [['euler', 'dpmpp_2m'], { default: 'euler' }],
				scheduler: [['normal', 'karras'], { default: 'normal' }],
				denoise: ['FLOAT', { default: 1.0 }]
			}
		}
		const vaeDecodeInput = { required: { samples: ['LATENT'], vae: ['VAE'] } }
		const saveImageInput = {
			required: { images: ['IMAGE'], filename_prefix: ['STRING', { default: 'ComfyUI' }] }
		}
		const emptyLatentInput = {
			required: {
				width: ['INT', { default: 512 }],
				height: ['INT', { default: 512 }],
				batch_size: ['INT', { default: 1 }]
			}
		}

		const objectInfo: Record<string, any> = {
			CheckpointLoaderSimple: { input: ckptInput, output: ['MODEL', 'CLIP', 'VAE'] },
			CLIPTextEncode: { input: clipTextInput, output: ['CONDITIONING'] },
			KSampler: { input: ksamplerInput, output: ['LATENT'] },
			VAEDecode: { input: vaeDecodeInput, output: ['IMAGE'] },
			SaveImage: { input: saveImageInput },
			EmptyLatentImage: { input: emptyLatentInput, output: ['LATENT'] },
			Reroute: { input: { required: { '': ['*'] } }, output: ['*'] },
			PrimitiveNode: { input: {}, output: ['*'] }
		}

		it('builds correct prompt for simple linear workflow with widget inputs', () => {
			const w = (name: string) => ({ name, widget: { name } })
			const nodes = [
				{
					id: '1',
					type: 'CheckpointLoaderSimple',
					widgets_values: ['sd_xl.safetensors'],
					inputs: [w('ckpt_name')]
				},
				{
					id: '2',
					type: 'CLIPTextEncode',
					widgets_values: ['a beautiful landscape'],
					inputs: [w('text'), { name: 'clip' }]
				},
				{
					id: '3',
					type: 'CLIPTextEncode',
					widgets_values: ['blurry, low quality'],
					inputs: [w('text'), { name: 'clip' }]
				},
				{
					id: '4',
					type: 'EmptyLatentImage',
					widgets_values: [1024, 1024, 1],
					inputs: [w('width'), w('height'), w('batch_size')]
				},
				{
					id: '5',
					type: 'KSampler',
					widgets_values: [42, 20, 8.0, 'euler', 'normal', 1.0],
					inputs: [
						{ name: 'model' },
						{ name: 'positive' },
						{ name: 'negative' },
						{ name: 'latent_image' },
						w('seed'),
						w('steps'),
						w('cfg'),
						w('sampler_name'),
						w('scheduler'),
						w('denoise')
					]
				},
				{ id: '6', type: 'VAEDecode', inputs: [{ name: 'samples' }, { name: 'vae' }] },
				{
					id: '7',
					type: 'SaveImage',
					widgets_values: ['ComfyUI'],
					inputs: [{ name: 'images' }, w('filename_prefix')]
				}
			]
			const links = [
				['l0', '1', 0, '5', 0, 'MODEL'],
				['l1', '1', 1, '2', 1, 'CLIP'],
				['l2', '1', 1, '3', 1, 'CLIP'],
				['l3', '2', 0, '5', 1, 'CONDITIONING'],
				['l4', '3', 0, '5', 2, 'CONDITIONING'],
				['l5', '4', 0, '5', 3, 'LATENT'],
				['l6', '5', 0, '6', 0, 'LATENT'],
				['l7', '1', 2, '6', 1, 'VAE'],
				['l8', '6', 0, '7', 0, 'IMAGE']
			]
			const { prompt, error } = buildPromptFromFlat(nodes, links, objectInfo)
			expect(error).toBeNull()
			expect(prompt['1'].class_type).toBe('CheckpointLoaderSimple')
			expect(prompt['1'].inputs.ckpt_name).toBe('sd_xl.safetensors')
			expect(prompt['2'].inputs.text).toBe('a beautiful landscape')
			expect(prompt['2'].inputs.clip).toEqual(['1', 1])
			expect(prompt['5'].inputs.model).toEqual(['1', 0])
			expect(prompt['5'].inputs.seed).toBe(42)
			expect(prompt['5'].inputs.steps).toBe(20)
			expect(prompt['7'].inputs.images).toEqual(['6', 0])
		})

		it('resolves PrimitiveNode widget values for connected inputs via Reroute', () => {
			const w = (name: string) => ({ name, widget: { name } })
			const nodes = [
				{
					id: '1',
					type: 'PrimitiveNode',
					widgets_values: [42],
					inputs: [],
					outputs: [{ name: 'INT' }]
				},
				{
					id: '2',
					type: 'KSampler',
					widgets_values: [20, 8.0, 'euler', 'normal', 1.0],
					inputs: [
						{ name: 'model' },
						{ name: 'positive' },
						{ name: 'negative' },
						{ name: 'latent_image' },
						w('seed'),
						w('steps'),
						w('cfg'),
						w('sampler_name'),
						w('scheduler'),
						w('denoise')
					]
				}
			]
			const links = [['l0', '1', 0, '2', 4, 'INT']]
			const { prompt } = buildPromptFromFlat(nodes, links, objectInfo)
			expect(prompt['2'].inputs.seed).toBe(42)
		})

		it('skips Reroute and Primitive nodes in final prompt, resolves through them', () => {
			const w = (name: string) => ({ name, widget: { name } })
			const nodes = [
				{ id: '1', type: 'PrimitiveNode', widgets_values: [42], inputs: [], outputs: [] },
				{ id: '2', type: 'Reroute', inputs: [{ name: '0' }], outputs: [] },
				{
					id: '3',
					type: 'KSampler',
					widgets_values: [20, 8.0, 'euler', 'normal', 1.0],
					inputs: [
						{ name: 'model' },
						{ name: 'positive' },
						{ name: 'negative' },
						{ name: 'latent_image' },
						w('seed'),
						w('steps'),
						w('cfg'),
						w('sampler_name'),
						w('scheduler'),
						w('denoise')
					]
				}
			]
			const links = [
				['l0', '1', 0, '2', 0, '*'],
				['l1', '2', 0, '3', 4, '*']
			]
			const { prompt } = buildPromptFromFlat(nodes, links, objectInfo)
			expect(prompt['1']).toBeUndefined()
			expect(prompt['2']).toBeUndefined()
			expect(prompt['3'].class_type).toBe('KSampler')
			expect(prompt['3'].inputs.seed).toBe(42)
		})

		it('coerces enum values and provides defaults for invalid values', () => {
			const w = (name: string) => ({ name, widget: { name } })
			const nodes = [
				{
					id: '1',
					type: 'KSampler',
					widgets_values: [0, 20, 8.0, 'invalid_sampler', 'normal', 1.0],
					inputs: [
						{ name: 'model' },
						{ name: 'positive' },
						{ name: 'negative' },
						{ name: 'latent_image' },
						w('seed'),
						w('steps'),
						w('cfg'),
						w('sampler_name'),
						w('scheduler'),
						w('denoise')
					]
				}
			]
			const { prompt } = buildPromptFromFlat(nodes, [], objectInfo)
			expect(prompt['1'].inputs.sampler_name).toBe('euler')
		})

		it('preserves unknown/custom node types in prompt instead of erroring (ComfyUI validates)', () => {
			const w = (name: string) => ({ name, widget: { name } })
			const nodes = [
				{ id: '1', type: 'CustomLoadImage', widgets_values: ['test.png'], inputs: [w('image')] },
				{
					id: '2',
					type: 'CustomVideoProcessor',
					inputs: [{ name: 'image' }],
					widgets_values: [24, 1024]
				},
				{
					id: '3',
					type: 'SaveVideo',
					widgets_values: ['ComfyUI'],
					inputs: [{ name: 'images' }, w('filename_prefix')]
				}
			]
			const links = [
				['l0', '1', 0, '2', 0, 'IMAGE'],
				['l1', '2', 0, '3', 0, 'IMAGE']
			]
			const { prompt, error } = buildPromptFromFlat(nodes, links, objectInfo)
			expect(error).toBeNull()
			expect(prompt['1']).toBeDefined()
			expect(prompt['1'].class_type).toBe('CustomLoadImage')
			expect(prompt['1'].inputs.image).toBe('test.png')
			expect(prompt['2']).toBeDefined()
			expect(prompt['2'].class_type).toBe('CustomVideoProcessor')
			expect(prompt['2'].inputs.image).toEqual(['1', 0])
			expect(prompt['3']).toBeDefined()
			expect(prompt['3'].class_type).toBe('SaveVideo')
			expect(prompt['3'].inputs.images).toEqual(['2', 0])
		})

		it('resolves SaveVideo video input through Reroute and custom video generator nodes', () => {
			const nodes = [
				{
					id: '1',
					type: 'WanVideoModelLoader',
					widgets_values: ['wan2_1_t2v_14B_fp8_e4m3fn.safetensors'],
					inputs: [{ name: 'unet_name', widget: { name: 'unet_name' } }]
				},
				{
					id: '2',
					type: 'WanVideoSampler',
					inputs: [
						{ name: 'model' },
						{ name: 'positive' },
						{ name: 'negative' },
						{ name: 'latent_image' }
					],
					outputs: [{ name: 'video', type: 'VIDEO' }],
					widgets_values: [10]
				},
				{
					id: '3',
					type: 'Reroute',
					inputs: [{ name: 'video', type: 'VIDEO' }],
					outputs: [{ name: 'video', type: 'VIDEO' }]
				},
				{
					id: '108',
					type: 'SaveVideo',
					inputs: [
						{ name: 'video', type: 'VIDEO' },
						{ name: 'filename_prefix', widget: { name: 'filename_prefix' } }
					],
					widgets_values: ['ComfyUI']
				}
			]
			const links = [
				['l0', '1', 0, '2', 0, 'MODEL'],
				['l1', '2', 0, '3', 0, 'VIDEO'],
				['l2', '3', 0, '108', 0, 'VIDEO']
			]
			const { prompt, error, warnings } = buildPromptFromFlat(nodes, links, objectInfo)
			expect(error).toBeNull()
			expect(warnings).toBeUndefined()
			expect(prompt['108']).toBeDefined()
			expect(prompt['108'].inputs.video).toEqual(['2', 0])
			expect(prompt['108'].inputs.filename_prefix).toBe('ComfyUI')
		})

		it('reports unresolved connections as warnings when source is missing', () => {
			const nodes = [
				{
					id: '108',
					type: 'SaveVideo',
					inputs: [{ name: 'video', type: 'VIDEO' }],
					widgets_values: ['ComfyUI']
				}
			]
			const links = [['l0', '999', 0, '108', 0, 'VIDEO']]
			const { prompt, error, warnings } = buildPromptFromFlat(nodes, links, objectInfo)
			expect(error).toBeNull()
			expect(prompt['108'].inputs.video).toBeUndefined()
			expect(warnings).toBeDefined()
			expect(warnings!.length).toBeGreaterThan(0)
			expect(warnings![0]).toContain('unresolved link l0')
		})

		it('resolves connection from connsByTo when inp.links references a stale/deleted link ID (post-subgraph-expansion)', () => {
			const nodes = [
				{
					id: '170',
					type: 'CreateVideo',
					inputs: [{ name: 'fps', widget: { name: 'fps' } }],
					outputs: [{ name: 'video', type: 'VIDEO' }],
					widgets_values: [16]
				},
				{
					id: '108',
					type: 'SaveVideo',
					widgets_values: ['ComfyUI', 'auto', 'auto'],
					inputs: [
						{ name: 'video', type: 'VIDEO', links: [239] },
						{ name: 'filename_prefix', widget: { name: 'filename_prefix' } },
						{ name: 'format', widget: { name: 'format' } },
						{ name: 'codec', widget: { name: 'codec' } }
					]
				}
			]
			const links = [['new-link-2', '170', 0, '108', 0, 'VIDEO']]
			const { prompt, error, warnings } = buildPromptFromFlat(nodes, links, objectInfo)
			expect(error).toBeNull()
			expect(warnings).toBeUndefined()
			expect(prompt['108'].inputs.video).toEqual(['170', 0])
			expect(prompt['108'].inputs.filename_prefix).toBe('ComfyUI')
		})

		it('coerces INT and FLOAT widget values from strings to numbers', () => {
			const w = (name: string) => ({ name, widget: { name } })
			const nodes = [
				{
					id: '1',
					type: 'EmptyLatentImage',
					widgets_values: ['512', '768', '2'],
					inputs: [w('width'), w('height'), w('batch_size')]
				}
			]
			const { prompt } = buildPromptFromFlat(nodes, [], objectInfo)
			expect(prompt['1'].inputs.width).toBe(512)
			expect(prompt['1'].inputs.height).toBe(768)
			expect(prompt['1'].inputs.batch_size).toBe(2)
		})
	})

	describe('workflowToPrompt (integration)', () => {
		it('converts a simple checkpoint-only workflow end-to-end', () => {
			const w = (name: string) => ({ name, widget: { name } })
			const objectInfo = {
				CheckpointLoaderSimple: {
					input: { required: { ckpt_name: ['STRING', { default: 'model.safetensors' }] } },
					output: ['MODEL', 'CLIP', 'VAE']
				}
			}
			const workflow = {
				nodes: [
					{
						id: '1',
						type: 'CheckpointLoaderSimple',
						widgets_values: ['test.safetensors'],
						inputs: [w('ckpt_name')]
					}
				],
				links: []
			}
			const { prompt, error } = workflowToPrompt(workflow, objectInfo)
			expect(error).toBeNull()
			expect(Object.keys(prompt)).toHaveLength(1)
			expect(prompt['1'].class_type).toBe('CheckpointLoaderSimple')
			expect(prompt['1'].inputs.ckpt_name).toBe('test.safetensors')
		})

		it('expands subgraph UUID node with internal Reroute and PrimitiveNode and resolves connections', () => {
			const w = (name: string) => ({ name, widget: { name } })
			const wi = (name: string, type: string) => ({ name, type })
			const objectInfo = {
				LoadImage: { input: { required: { image: ['STRING'] } }, output: ['IMAGE'] },
				SaveVideo: {
					input: { required: { video: ['VIDEO'], filename_prefix: ['STRING'] } },
					output: []
				},
				TestSwitch: {
					input: { required: { on_true: ['*'], on_false: ['*'], switch: ['BOOLEAN'] } },
					output: ['*']
				},
				TestMath: {
					input: { required: { a: ['FLOAT'], b: ['FLOAT'], expression: ['STRING'] } },
					output: ['*']
				},
				InternalProcessor: { input: { required: { image: ['IMAGE'] } }, output: ['VIDEO'] }
			}
			const subgraphUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
			const workflow = {
				nodes: [
					{
						id: '10',
						type: 'LoadImage',
						widgets_values: ['test.png'],
						inputs: [w('image')],
						outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [200] }]
					},
					{
						id: '20',
						type: subgraphUuid,
						inputs: [{ name: 'image', type: 'IMAGE', link: 200 }],
						outputs: [{ name: 'VIDEO', type: 'VIDEO', links: [300] }],
						widgets_values: []
					},
					{
						id: '30',
						type: 'SaveVideo',
						widgets_values: ['output'],
						inputs: [wi('video', 'VIDEO'), w('filename_prefix')],
						outputs: []
					}
				],
				links: [
					[200, '10', 0, '20', 0, 'IMAGE'],
					[300, '20', 0, '30', 0, 'VIDEO']
				],
				definitions: {
					subgraphs: [
						{
							id: subgraphUuid,
							nodes: [
								{
									id: '1',
									type: 'SubgraphInput',
									outputs: [{ name: 'image', type: 'IMAGE', links: [] }]
								},
								{
									id: '2',
									type: 'InternalProcessor',
									inputs: [wi('image', 'IMAGE')],
									outputs: [{ name: 'VIDEO', type: 'VIDEO', links: [] }],
									widgets_values: []
								},
								{
									id: '3',
									type: 'Reroute',
									inputs: [wi('video', 'VIDEO')],
									outputs: [{ name: 'video', type: 'VIDEO', links: [] }]
								},
								{
									id: '4',
									type: 'PrimitiveBoolean',
									widgets_values: [false],
									outputs: [{ name: 'BOOLEAN', type: 'BOOLEAN', links: [] }]
								},
								{
									id: '5',
									type: 'TestSwitch',
									inputs: [wi('on_true', '*'), wi('on_false', '*'), wi('switch', 'BOOLEAN')],
									outputs: [{ name: '*', type: '*', links: [] }],
									widgets_values: [true, false]
								},
								{ id: '6', type: 'SubgraphOutput', inputs: [wi('video', 'VIDEO')] }
							],
							links: [
								['s1', '1', 0, '2', 0, 'IMAGE'],
								['s2', '2', 0, '3', 0, 'VIDEO'],
								['s3', '3', 0, '6', 0, 'VIDEO'],
								['s4', '4', 0, '5', 2, 'BOOLEAN']
							],
							inputNode: { id: '1' },
							outputNode: { id: '6' }
						}
					]
				}
			}
			const { prompt, error, warnings } = workflowToPrompt(workflow, objectInfo)
			expect(error).toBeNull()
			expect(warnings).toBeUndefined()
			const saveVideoNode = Object.values(prompt).find((n: any) => n.class_type === 'SaveVideo')
			expect(saveVideoNode).toBeDefined()
			const videoInput = saveVideoNode.inputs.video
			expect(Array.isArray(videoInput)).toBe(true)
			const processorId = videoInput[0]
			expect(prompt[processorId].class_type).toBe('InternalProcessor')
		})
	})
})
