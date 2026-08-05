import { describe, it, expect, vi } from 'vitest'
import {
	instantiateTemplate,
	instantiateValidatedTemplate,
	instantiateTemplateFromTemplate
} from '@/core/components/instantiate'
import type { ComponentTemplate, InstantiateTemplateOptions } from '@/core/components/types'

describe('instantiateTemplate', () => {
	describe('basic instantiation', () => {
		it('instantiates a simple template', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'simple-template',
				name: 'Simple Template',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}

			const result = instantiateTemplate(template)

			expect(result.rootNodeId).toBeDefined()
			expect(result.root).toBeDefined()
			expect(result.root.name).toBeDefined()
			expect(result.root.category).toBe('user')
			expect(result.root.userType).toBe('rect')
		})

		it('uses provided genId function', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}

			const genId = vi.fn((prefix: string) => `custom-${prefix}-id`)
			const result = instantiateValidatedTemplate(template, {}, { genId })

			expect(genId).toHaveBeenCalled()
			expect(result.rootNodeId).toBe('custom-rect-id')
		})

		it('handles all user types', () => {
			const types: Array<{ type: string; expectedUserType: string }> = [
				{ type: 'rect', expectedUserType: 'rect' },
				{ type: 'text', expectedUserType: 'text' },
				{ type: 'image', expectedUserType: 'image' },
				{ type: 'line', expectedUserType: 'line' },
				{ type: 'base', expectedUserType: 'base' },
				{ type: 'group', expectedUserType: 'base' } // group maps to base
			]

			for (const { type, expectedUserType } of types) {
				const template: ComponentTemplate = {
					schemaVersion: 1,
					templateId: `template-${type}`,
					name: `${type} Template`,
					rootLocalId: 'root',
					params: [],
					nodes: [{ localId: 'root', type, props: {} }]
				}

				const result = instantiateValidatedTemplate(template)
				expect(result.root.userType).toBe(expectedUserType)
			}
		})
	})

	describe('parameter substitution', () => {
		it('substitutes string parameters', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'param-template',
				name: 'Param Template',
				rootLocalId: 'root',
				params: [{ key: 'text', type: 'string', default: 'Default' }],
				nodes: [{ localId: 'root', type: 'text', props: { text: '{{text}}' } }]
			}

			const result = instantiateValidatedTemplate(template, { text: 'Hello World' })

			expect(result.root.props).toHaveProperty('text')
			expect(String(result.root.props.text)).toBe('Hello World')
		})

		it('substitutes number parameters', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'num-template',
				name: 'Number Template',
				rootLocalId: 'root',
				params: [{ key: 'width', type: 'number', default: 100 }],
				nodes: [{ localId: 'root', type: 'rect', props: { width: '{{width}}' } }]
			}

			const result = instantiateValidatedTemplate(template, { width: 200 })
			expect(result.root.props.width).toBe(200)
		})

		it('substitutes boolean parameters', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'bool-template',
				name: 'Bool Template',
				rootLocalId: 'root',
				params: [{ key: 'visible', type: 'boolean', default: true }],
				nodes: [{ localId: 'root', type: 'rect', props: { visible: '{{visible}}' } }]
			}

			const result = instantiateValidatedTemplate(template, { visible: false })
			expect(result.root.props.visible).toBe(false)
		})

		it('uses default values when params not provided', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'default-template',
				name: 'Default Template',
				rootLocalId: 'root',
				params: [{ key: 'width', type: 'number', default: 100 }],
				nodes: [{ localId: 'root', type: 'rect', props: { width: '{{width}}' } }]
			}

			const result = instantiateValidatedTemplate(template, {})
			expect(result.root.props.width).toBe(100)
		})

		it('keeps placeholder when param not provided and no default', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'placeholder-template',
				name: 'Placeholder Template',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'text', props: { text: '{{missing}}' } }]
			}

			const result = instantiateValidatedTemplate(template, {})
			expect(result.root.props.text).toBe('{{missing}}')
		})

		it('substitutes in nested objects', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'nested-template',
				name: 'Nested Template',
				rootLocalId: 'root',
				params: [{ key: 'color', type: 'color', default: '#fff' }],
				nodes: [{ localId: 'root', type: 'rect', props: { style: { fill: '{{color}}' } } }]
			}

			const result = instantiateValidatedTemplate(template, { color: '#ff0000' })
			expect(result.root.props).toHaveProperty('style')
			expect((result.root.props.style as any).fill).toBe('#ff0000')
		})

		it('substitutes multiple placeholders in same string', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'multi-template',
				name: 'Multi Template',
				rootLocalId: 'root',
				params: [
					{ key: 'x', type: 'number', default: 0 },
					{ key: 'y', type: 'number', default: 0 }
				],
				nodes: [{ localId: 'root', type: 'rect', props: { pos: '{{x}}, {{y}}' } }]
			}

			const result = instantiateValidatedTemplate(template, { x: 100, y: 200 })
			expect(result.root.props.pos).toBe('100, 200')
		})

		it('handles pure placeholder (no surrounding text)', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'pure-template',
				name: 'Pure Template',
				rootLocalId: 'root',
				params: [{ key: 'numValue', type: 'number', default: 42 }],
				nodes: [{ localId: 'root', type: 'rect', props: { width: '{{numValue}}' } }]
			}

			const result = instantiateValidatedTemplate(template, { numValue: 100 })
			expect(result.root.props.width).toBe(100)
		})
	})

	describe('nested node tree', () => {
		it('builds correct parent-child relationships', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'tree-template',
				name: 'Tree Template',
				rootLocalId: 'root',
				params: [],
				nodes: [
					{ localId: 'root', type: 'rect', props: {} },
					{ localId: 'child1', type: 'rect', parentLocalId: 'root', props: {} },
					{ localId: 'child2', type: 'rect', parentLocalId: 'root', props: {} },
					{ localId: 'grandchild', type: 'rect', parentLocalId: 'child1', props: {} }
				]
			}

			const result = instantiateValidatedTemplate(template)

			expect(result.root.children).toBeDefined()
			expect(result.root.children?.length).toBeGreaterThanOrEqual(1)

			// Find child1 by checking localIdToNodeId mapping
			const child1NodeId = result.localIdToNodeId.child1
			const child1 = result.root.children?.find((c) => c.id === child1NodeId)
			expect(child1).toBeDefined()
			expect(child1?.children?.length).toBeGreaterThanOrEqual(1)
		})

		it('maps localIds to nodeIds correctly', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'mapping-template',
				name: 'Mapping Template',
				rootLocalId: 'root',
				params: [],
				nodes: [
					{ localId: 'root', type: 'rect', props: {} },
					{ localId: 'child', type: 'rect', parentLocalId: 'root', props: {} }
				]
			}

			const result = instantiateValidatedTemplate(template)

			expect(result.localIdToNodeId.root).toBe(result.rootNodeId)
			expect(result.localIdToNodeId.child).toBeDefined()
			expect(result.localIdToNodeId.child).not.toBe(result.localIdToNodeId.root)
		})
	})

	describe('transform patch', () => {
		it('applies transform patch to base transform', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'transform-template',
				name: 'Transform Template',
				rootLocalId: 'root',
				params: [],
				nodes: [
					{
						localId: 'root',
						type: 'rect',
						props: {},
						transform: { x: 100, y: 200, width: 50, height: 30 }
					}
				]
			}

			const result = instantiateValidatedTemplate(template)

			expect(result.root.transform.x).toBe(100)
			expect(result.root.transform.y).toBe(200)
			expect(result.root.transform.width).toBe(50)
			expect(result.root.transform.height).toBe(30)
		})

		it('applies partial transform patch', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'partial-transform-template',
				name: 'Partial Transform Template',
				rootLocalId: 'root',
				params: [],
				nodes: [
					{
						localId: 'root',
						type: 'rect',
						props: {},
						transform: { x: 100 }
					}
				]
			}

			const result = instantiateValidatedTemplate(template)

			expect(result.root.transform.x).toBe(100)
			expect(result.root.transform.y).toBeDefined()
		})

		it('accepts string parameter in transform (converts to number)', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'string-transform-template',
				name: 'String Transform Template',
				rootLocalId: 'root',
				params: [{ key: 'posX', type: 'number', default: 0 }],
				nodes: [
					{
						localId: 'root',
						type: 'rect',
						props: {},
						transform: { x: '{{posX}}' }
					}
				]
			}

			const result = instantiateValidatedTemplate(template, { posX: 150 })
			expect(result.root.transform.x).toBe(150)
		})

		it('clamps scale values', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'scale-template',
				name: 'Scale Template',
				rootLocalId: 'root',
				params: [],
				nodes: [
					{
						localId: 'root',
						type: 'rect',
						props: {},
						transform: { scaleX: 200 } // should be clamped to 100
					}
				]
			}

			const result = instantiateValidatedTemplate(template)
			expect(result.root.transform.scaleX).toBeLessThanOrEqual(100)
		})

		it('clamps opacity to 0-1 range', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'opacity-template',
				name: 'Opacity Template',
				rootLocalId: 'root',
				params: [],
				nodes: [
					{
						localId: 'root',
						type: 'rect',
						props: {},
						transform: { opacity: 1.5 } // should be clamped to 1
					}
				]
			}

			const result = instantiateValidatedTemplate(template)
			expect(result.root.transform.opacity).toBeLessThanOrEqual(1)
		})
	})

	describe('fallback user type', () => {
		it('uses fallbackUserType for unknown types', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'unknown-template',
				name: 'Unknown Template',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'unknown-type', props: {} }]
			}

			const result = instantiateValidatedTemplate(template, {}, { fallbackUserType: 'base' })
			expect(result.root.userType).toBe('base')
		})

		it('uses provided fallbackUserType option', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'fallback-template',
				name: 'Fallback Template',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'custom', props: {} }]
			}

			const result = instantiateValidatedTemplate(template, {}, { fallbackUserType: 'rect' })
			expect(result.root.userType).toBe('rect')
		})
	})

	describe('getNodeId option', () => {
		it('uses getNodeId for deterministic IDs', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'deterministic-template',
				name: 'Deterministic Template',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}

			const getNodeId = vi.fn(
				(args: { templateId: string; localId: string; userType: string }) =>
					`node-${args.templateId}-${args.localId}`
			)

			const result = instantiateValidatedTemplate(template, {}, { getNodeId })

			expect(getNodeId).toHaveBeenCalledWith({
				templateId: 'deterministic-template',
				localId: 'root',
				userType: 'rect'
			})
			expect(result.rootNodeId).toBe('node-deterministic-template-root')
		})
	})

	describe('instantiateTemplateFromTemplate', () => {
		it('is an alias for instantiateValidatedTemplate', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'alias-template',
				name: 'Alias Template',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}

			const result1 = instantiateValidatedTemplate(template, {})
			const result2 = instantiateTemplateFromTemplate(template, {})

			// Both should have same structure, just different IDs
			expect(result1.root).toBeDefined()
			expect(result2.root).toBeDefined()
			expect(result1.root.category).toBe(result2.root.category)
			expect(result1.root.userType).toBe(result2.root.userType)
		})
	})

	describe('error handling', () => {
		it('throws on invalid template', () => {
			const invalidTemplate = {
				schemaVersion: 1,
				templateId: 'invalid',
				name: 'Invalid',
				rootLocalId: 'nonexistent',
				params: [],
				nodes: []
			}

			expect(() => instantiateTemplate(invalidTemplate)).toThrow()
		})

		it('creates nodes with unique IDs', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'unique-template',
				name: 'Unique Template',
				rootLocalId: 'root',
				params: [],
				nodes: [
					{ localId: 'root', type: 'rect', props: {} },
					{ localId: 'child', type: 'rect', parentLocalId: 'root', props: {} }
				]
			}

			const result = instantiateValidatedTemplate(template)

			expect(result.root.id).not.toBe(result.root.children?.[0].id)
		})

		it('sets createdAt timestamp', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'timestamp-template',
				name: 'Timestamp Template',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}

			const before = Date.now()
			const result = instantiateValidatedTemplate(template)
			const after = Date.now()

			expect(result.root.createdAt).toBeGreaterThanOrEqual(before)
			expect(result.root.createdAt).toBeLessThanOrEqual(after)
		})
	})
})
