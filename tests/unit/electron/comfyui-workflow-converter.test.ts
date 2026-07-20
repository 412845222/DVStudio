// @vitest-environment node
import { describe, it, expect } from 'vitest'

describe('comfyui workflow-converter: core utilities', () => {
  let flattenWorkflow: (w: any) => { nodes: any[]; links: any[] }
  let buildPromptFromFlat: (nodes: any[], links: any[], objectInfo: any) => { prompt: Record<string, any>; error: string | null }
  let workflowToPrompt: (w: any, objectInfo: any) => { prompt: Record<string, any>; error: string | null }

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
        links: [
          [0, '1', 0, '2', 0, 'IMAGE']
        ]
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
    const saveImageInput = { required: { images: ['IMAGE'], filename_prefix: ['STRING', { default: 'ComfyUI' }] } }
    const emptyLatentInput = { required: { width: ['INT', { default: 512 }], height: ['INT', { default: 512 }], batch_size: ['INT', { default: 1 }] } }

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
        { id: '1', type: 'CheckpointLoaderSimple', widgets_values: ['sd_xl.safetensors'], inputs: [w('ckpt_name')] },
        { id: '2', type: 'CLIPTextEncode', widgets_values: ['a beautiful landscape'], inputs: [w('text'), { name: 'clip' }] },
        { id: '3', type: 'CLIPTextEncode', widgets_values: ['blurry, low quality'], inputs: [w('text'), { name: 'clip' }] },
        { id: '4', type: 'EmptyLatentImage', widgets_values: [1024, 1024, 1], inputs: [w('width'), w('height'), w('batch_size')] },
        { id: '5', type: 'KSampler', widgets_values: [42, 20, 8.0, 'euler', 'normal', 1.0], inputs: [
          { name: 'model' }, { name: 'positive' }, { name: 'negative' }, { name: 'latent_image' },
          w('seed'), w('steps'), w('cfg'), w('sampler_name'), w('scheduler'), w('denoise')
        ] },
        { id: '6', type: 'VAEDecode', inputs: [{ name: 'samples' }, { name: 'vae' }] },
        { id: '7', type: 'SaveImage', widgets_values: ['ComfyUI'], inputs: [{ name: 'images' }, w('filename_prefix')] }
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
        { id: '1', type: 'PrimitiveNode', widgets_values: [42], inputs: [], outputs: [{ name: 'INT' }] },
        { id: '2', type: 'KSampler', widgets_values: [20, 8.0, 'euler', 'normal', 1.0], inputs: [
          { name: 'model' }, { name: 'positive' }, { name: 'negative' }, { name: 'latent_image' }, w('seed'),
          w('steps'), w('cfg'), w('sampler_name'), w('scheduler'), w('denoise')
        ] }
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
        { id: '3', type: 'KSampler', widgets_values: [20, 8.0, 'euler', 'normal', 1.0], inputs: [
          { name: 'model' }, { name: 'positive' }, { name: 'negative' }, { name: 'latent_image' }, w('seed'),
          w('steps'), w('cfg'), w('sampler_name'), w('scheduler'), w('denoise')
        ] }
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
        { id: '1', type: 'KSampler', widgets_values: [0, 20, 8.0, 'invalid_sampler', 'normal', 1.0], inputs: [
          { name: 'model' }, { name: 'positive' }, { name: 'negative' }, { name: 'latent_image' },
          w('seed'), w('steps'), w('cfg'), w('sampler_name'), w('scheduler'), w('denoise')
        ] }
      ]
      const { prompt } = buildPromptFromFlat(nodes, [], objectInfo)
      expect(prompt['1'].inputs.sampler_name).toBe('euler')
    })

    it('returns error for unknown node types', () => {
      const nodes = [{ id: '1', type: 'UnknownCustomNode', inputs: [] }]
      const { error } = buildPromptFromFlat(nodes, [], objectInfo)
      expect(error).toContain('UnknownCustomNode')
    })

    it('coerces INT and FLOAT widget values from strings to numbers', () => {
      const w = (name: string) => ({ name, widget: { name } })
      const nodes = [
        { id: '1', type: 'EmptyLatentImage', widgets_values: ['512', '768', '2'], inputs: [w('width'), w('height'), w('batch_size')] }
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
          { id: '1', type: 'CheckpointLoaderSimple', widgets_values: ['test.safetensors'], inputs: [w('ckpt_name')] }
        ],
        links: []
      }
      const { prompt, error } = workflowToPrompt(workflow, objectInfo)
      expect(error).toBeNull()
      expect(prompt['1'].class_type).toBe('CheckpointLoaderSimple')
      expect(prompt['1'].inputs.ckpt_name).toBe('test.safetensors')
    })
  })
})
