import { describe, it, expect, vi } from 'vitest'
import { componentTemplateApi } from '@/core/components/api'

describe('componentTemplateApi', () => {
	describe('api structure', () => {
		it('has validateTemplate function', () => {
			expect(typeof componentTemplateApi.validateTemplate).toBe('function')
		})

		it('has instantiateTemplate function', () => {
			expect(typeof componentTemplateApi.instantiateTemplate).toBe('function')
		})

		it('has instantiateValidatedTemplate function', () => {
			expect(typeof componentTemplateApi.instantiateValidatedTemplate).toBe('function')
		})

		it('has exportTemplateFromSelection function', () => {
			expect(typeof componentTemplateApi.exportTemplateFromSelection).toBe('function')
		})
	})

	describe('validateTemplate', () => {
		it('validates a valid template', () => {
			const template = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}

			const result = componentTemplateApi.validateTemplate(template)
			expect(result.ok).toBe(true)
		})

		it('rejects an invalid template', () => {
			const result = componentTemplateApi.validateTemplate(null)
			expect(result.ok).toBe(false)
		})
	})

	describe('instantiateTemplate', () => {
		it('instantiates a valid template', () => {
			const template = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}

			const result = componentTemplateApi.instantiateTemplate(template)

			expect(result.root).toBeDefined()
			expect(result.rootNodeId).toBeDefined()
			expect(result.root.name).toBeDefined()
		})

		it('passes params to instantiation', () => {
			const template = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [{ key: 'text', type: 'string', default: 'Default' }],
				nodes: [{ localId: 'root', type: 'text', props: { text: '{{text}}' } }]
			}

			const result = componentTemplateApi.instantiateTemplate(template, { text: 'Hello' })

			expect(result.root.props.text).toBe('Hello')
		})

		it('throws on invalid template', () => {
			const invalidTemplate = {
				schemaVersion: 1,
				templateId: '',
				name: '',
				rootLocalId: 'nonexistent',
				params: [],
				nodes: []
			}

			expect(() => componentTemplateApi.instantiateTemplate(invalidTemplate)).toThrow()
		})
	})

	describe('instantiateValidatedTemplate', () => {
		it('instantiates a validated template', () => {
			const template = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}

			const result = componentTemplateApi.instantiateValidatedTemplate(template)

			expect(result.root).toBeDefined()
		})
	})

	describe('exportTemplateFromSelection', () => {
		it('exports selected nodes to template', () => {
			const layerTree = [
				{
					id: 'node-1',
					createdAt: Date.now(),
					name: 'Test Node',
					category: 'user',
					userType: 'rect' as const,
					transform: {
						x: 0,
						y: 0,
						width: 100,
						height: 50,
						scaleX: 1,
						scaleY: 1,
						scale: 1,
						rotation: 0,
						opacity: 1
					},
					props: {}
				}
			]

			const result = componentTemplateApi.exportTemplateFromSelection({
				layerNodeTree: layerTree,
				selectedNodeIds: ['node-1']
			})

			expect(result.schemaVersion).toBe(1)
			expect(result.nodes.length).toBe(1)
			expect(result.nodes[0].name).toBe('Test Node')
		})

		it('uses custom template options', () => {
			const layerTree = [
				{
					id: 'node-1',
					createdAt: Date.now(),
					name: 'Test',
					category: 'user',
					userType: 'rect' as const,
					transform: {
						x: 0,
						y: 0,
						width: 100,
						height: 50,
						scaleX: 1,
						scaleY: 1,
						scale: 1,
						rotation: 0,
						opacity: 1
					},
					props: {}
				}
			]

			const result = componentTemplateApi.exportTemplateFromSelection({
				layerNodeTree: layerTree,
				selectedNodeIds: ['node-1'],
				templateId: 'custom-id',
				name: 'Custom Name',
				description: 'Custom description'
			})

			expect(result.templateId).toBe('custom-id')
			expect(result.name).toBe('Custom Name')
			expect(result.description).toBe('Custom description')
		})
	})
})
