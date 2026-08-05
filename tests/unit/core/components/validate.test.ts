import { describe, it, expect } from 'vitest'
import { validateComponentTemplate, type ValidateResult } from '@/core/components/validate'
import type { ComponentTemplate } from '@/core/components/types'

describe('validateComponentTemplate', () => {
	describe('valid templates', () => {
		it('accepts a valid minimal template', () => {
			const template = {
				schemaVersion: 1,
				templateId: 'test-template',
				name: 'Test Template',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.value).toEqual(template)
			}
		})

		it('accepts template with params', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'param-template',
				name: 'Template With Params',
				rootLocalId: 'root',
				params: [
					{ key: 'width', type: 'number', default: 100 },
					{ key: 'height', type: 'number', default: 50 },
					{ key: 'color', type: 'color', default: '#ffffff' }
				],
				nodes: [
					{
						localId: 'root',
						type: 'rect',
						props: { width: '{{width}}', height: '{{height}}', fill: '{{color}}' }
					}
				]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(true)
		})

		it('accepts template with nested nodes', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'nested-template',
				name: 'Nested Template',
				rootLocalId: 'root',
				params: [],
				nodes: [
					{ localId: 'root', type: 'rect', props: {} },
					{ localId: 'child', type: 'text', parentLocalId: 'root', props: { text: 'Hello' } }
				]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(true)
		})

		it('accepts template with transform', () => {
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
						transform: { x: 100, y: 200, width: 50, height: 30, rotation: 45 }
					}
				]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(true)
		})

		it('accepts template with all param types', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'all-types-template',
				name: 'All Types Template',
				rootLocalId: 'root',
				params: [
					{ key: 'strParam', type: 'string', default: 'hello' },
					{ key: 'numParam', type: 'number', default: 42 },
					{ key: 'boolParam', type: 'boolean', default: true },
					{ key: 'colorParam', type: 'color', default: '#ff0000' },
					{ key: 'assetParam', type: 'asset:image', default: 'image.png' }
				],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(true)
		})
	})

	describe('invalid schemaVersion', () => {
		it('rejects missing schemaVersion', () => {
			const template = {
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
			if (!result.ok) {
				expect(result.errors.some((e) => e.includes('schemaVersion'))).toBe(true)
			}
		})

		it('rejects wrong schemaVersion', () => {
			const template = {
				schemaVersion: 2,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
			if (!result.ok) {
				expect(result.errors.some((e) => e.includes('schemaVersion'))).toBe(true)
			}
		})
	})

	describe('missing required fields', () => {
		it('rejects missing templateId', () => {
			const template = {
				schemaVersion: 1,
				name: 'Test',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
			if (!result.ok) {
				expect(result.errors.some((e) => e.includes('templateId'))).toBe(true)
			}
		})

		it('rejects empty templateId', () => {
			const template = {
				schemaVersion: 1,
				templateId: '',
				name: 'Test',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
		})

		it('rejects whitespace-only templateId', () => {
			const template = {
				schemaVersion: 1,
				templateId: '   ',
				name: 'Test',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
		})

		it('rejects missing name', () => {
			const template = {
				schemaVersion: 1,
				templateId: 'test',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
			if (!result.ok) {
				expect(result.errors.some((e) => e.includes('name'))).toBe(true)
			}
		})

		it('rejects missing rootLocalId', () => {
			const template = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
			if (!result.ok) {
				expect(result.errors.some((e) => e.includes('rootLocalId'))).toBe(true)
			}
		})

		it('rejects rootLocalId not in nodes', () => {
			const template = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'nonexistent',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
			if (!result.ok) {
				expect(result.errors.some((e) => e.includes('rootLocalId must exist'))).toBe(true)
			}
		})
	})

	describe('duplicate localId', () => {
		it('rejects duplicate node localIds', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [],
				nodes: [
					{ localId: 'root', type: 'rect', props: {} },
					{ localId: 'root', type: 'text', props: {} }
				]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
			if (!result.ok) {
				expect(result.errors.some((e) => e.includes('duplicated'))).toBe(true)
			}
		})

		it('rejects duplicate param keys', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [
					{ key: 'width', type: 'number' },
					{ key: 'width', type: 'number' }
				],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
			if (!result.ok) {
				expect(result.errors.some((e) => e.includes('duplicated'))).toBe(true)
			}
		})
	})

	describe('invalid nodes', () => {
		it('rejects non-object node', () => {
			const template = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [],
				nodes: ['not an object']
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
		})

		it('rejects node without localId', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [],
				nodes: [{ type: 'rect', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
		})

		it('rejects node without type', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
		})

		it('rejects node with non-object props', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: 'not an object' }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
		})
	})

	describe('invalid params', () => {
		it('rejects non-array params', () => {
			const template = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: 'not an array',
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
		})

		it('rejects non-object param', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: ['not an object'],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
		})

		it('rejects param with invalid type', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [{ key: 'invalid', type: 'invalid-type' }],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
			if (!result.ok) {
				expect(result.errors.some((e) => e.includes('type invalid'))).toBe(true)
			}
		})

		it('rejects param without key', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [{ type: 'string' }],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
		})
	})

	describe('parentLocalId validation', () => {
		it('rejects self-referencing parentLocalId', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', parentLocalId: 'root', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
			if (!result.ok) {
				expect(result.errors.some((e) => e.includes('cannot reference itself'))).toBe(true)
			}
		})

		it('rejects parentLocalId pointing to nonexistent node', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'child', type: 'rect', parentLocalId: 'nonexistent', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
			if (!result.ok) {
				expect(result.errors.some((e) => e.includes('not found'))).toBe(true)
			}
		})
	})

	describe('transform validation', () => {
		it('rejects non-object transform', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {}, transform: 'invalid' }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(false)
		})

		it('accepts transform with valid numeric values', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [],
				nodes: [
					{
						localId: 'root',
						type: 'rect',
						props: {},
						transform: {
							x: 100,
							y: 200,
							scaleX: 1.5,
							scaleY: 2,
							scale: 1,
							width: 100,
							height: 50,
							rotation: 45,
							opacity: 0.8
						}
					}
				]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(true)
		})

		it('accepts transform with string values (for parameter substitution)', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [{ key: 'posX', type: 'number', default: 100 }],
				nodes: [
					{
						localId: 'root',
						type: 'rect',
						props: {},
						transform: { x: '{{posX}}', y: 200 }
					}
				]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(true)
		})
	})

	describe('edge cases', () => {
		it('accepts template with description', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				description: 'A test template',
				rootLocalId: 'root',
				params: [],
				nodes: [{ localId: 'root', type: 'rect', props: {} }]
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(true)
		})

		it('accepts template with bindings', () => {
			const template: ComponentTemplate = {
				schemaVersion: 1,
				templateId: 'test',
				name: 'Test',
				rootLocalId: 'root',
				params: [{ key: 'color', type: 'color', default: '#fff' }],
				nodes: [{ localId: 'root', type: 'rect', props: { fill: '{{color}}' } }],
				bindings: { 'nodes.0.props.fill': 'params.color' }
			}
			const result = validateComponentTemplate(template)
			expect(result.ok).toBe(true)
		})

		it('rejects non-object input', () => {
			expect(validateComponentTemplate(null).ok).toBe(false)
			expect(validateComponentTemplate(undefined).ok).toBe(false)
			expect(validateComponentTemplate('string').ok).toBe(false)
			expect(validateComponentTemplate(123).ok).toBe(false)
			expect(validateComponentTemplate([]).ok).toBe(false)
		})
	})
})
