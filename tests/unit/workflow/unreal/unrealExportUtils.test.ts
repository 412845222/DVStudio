import { describe, it, expect } from 'vitest'
import {
	normalizeResolvedLayoutSlots,
	buildSlotsFromModelBindings
} from '@/views/AIWorkflow/node-business/unreal/unrealExportUtils'

describe('unrealExportUtils', () => {
	describe('normalizeResolvedLayoutSlots', () => {
		it('filters out invalid slots and returns structured result with bySlotId map', () => {
			const slots = [
				{ slotId: 'slot-1', sourceObjectId: 'obj-1', other: 'data' },
				{ slotId: 'slot-2', sourceObjectId: 'obj-2' },
				{ slotId: '', sourceObjectId: 'obj-3' },
				{ slotId: 'slot-4', sourceObjectId: '' },
				null,
				undefined,
				'not-an-object',
				{ slotId: '  slot-5  ', sourceObjectId: '  obj-5  ' }
			]

			const result = normalizeResolvedLayoutSlots(slots)
			expect(result.slots).toBeInstanceOf(Array)
			expect(result.bySlotId).toBeInstanceOf(Map)
			expect(result.bySourceObjectId).toBeInstanceOf(Map)
			expect(result.slots).toHaveLength(3)
			expect(result.bySlotId.size).toBe(3)
			expect(result.bySlotId.has('slot-1')).toBe(true)
			expect(result.bySlotId.has('slot-2')).toBe(true)
			expect(result.bySlotId.has('slot-5')).toBe(true)
			expect(result.bySlotId.get('slot-1')?.other).toBe('data')
		})

		it('clones slot objects to avoid mutation', () => {
			const original = { slotId: 's1', sourceObjectId: 'o1', value: 42 }
			const slots = [original]
			const result = normalizeResolvedLayoutSlots(slots)
			const cloned = result.bySlotId.get('s1')
			expect(cloned).not.toBe(original)
			expect(cloned?.value).toBe(42)
		})

		it('trims slotId and sourceObjectId whitespace', () => {
			const slots = [{ slotId: '  my-slot  ', sourceObjectId: '  my-obj  ' }]
			const result = normalizeResolvedLayoutSlots(slots)
			expect(result.bySlotId.has('my-slot')).toBe(true)
			expect(result.bySourceObjectId.has('my-obj')).toBe(true)
		})

		it('returns empty result for empty/invalid input', () => {
			const emptyResult = normalizeResolvedLayoutSlots([])
			expect(emptyResult.slots).toHaveLength(0)
			expect(emptyResult.bySlotId.size).toBe(0)
			expect(emptyResult.bySourceObjectId.size).toBe(0)

			const nullResult = normalizeResolvedLayoutSlots(null as unknown as unknown[])
			expect(nullResult.slots).toHaveLength(0)
			expect(nullResult.bySlotId.size).toBe(0)
		})
	})

	describe('buildSlotsFromModelBindings', () => {
		const identityTransform = {
			position: { x: 0, y: 0, z: 0 },
			rotation: { yaw: 0, pitch: 0, roll: 0 },
			quaternion: { x: 0, y: 0, z: 0, w: 1 },
			scale: { x: 1, y: 1, z: 1 }
		}

		it('returns empty array for no bindings', () => {
			const result = buildSlotsFromModelBindings([], new Map(), [])
			expect(result).toEqual([])
		})

		it('skips bindings without objectId', () => {
			const bindings = [
				{ modelUrl: 'test.glb' },
				{ objectId: '', modelUrl: 'test2.glb' },
				{ objectId: '  ', modelUrl: 'test3.glb' }
			]
			const result = buildSlotsFromModelBindings(bindings, new Map(), [])
			expect(result).toEqual([])
		})

		it('skips bindings without any model path', () => {
			const bindings = [
				{ objectId: 'obj-1' },
				{ objectId: 'obj-2', modelUrl: '' },
				{ objectId: 'obj-3', modelSourcePath: '   ' }
			]
			const result = buildSlotsFromModelBindings(bindings, new Map(), [])
			expect(result).toEqual([])
		})

		it('creates slots from valid model bindings', () => {
			const bindings = [
				{
					objectId: 'table-1',
					objectName: 'Coffee Table',
					modelUrl: '/models/table.glb',
					sourceNodeId: 'node-1',
					sourceNodeType: 'model3d'
				}
			]
			const layoutItems = []
			const result = buildSlotsFromModelBindings(bindings, new Map(), layoutItems)

			expect(result).toHaveLength(1)
			expect(result[0].slotId).toBe('table-1')
			expect(result[0].sourceObjectId).toBe('table-1')
			expect(result[0].objectName).toBe('Coffee Table')
			expect(result[0].previewInstanceTransform).toEqual(identityTransform)
			expect(result[0].generatedFromBinding).toBe(true)
			expect((result[0].modelBinding as Record<string, unknown>).modelUrl).toBe('/models/table.glb')
		})

		it('uses previewInstanceTransform from existing resolved slot', () => {
			const existingTransform = {
				position: { x: 100, y: 0, z: 200 },
				rotation: { yaw: 90, pitch: 0, roll: 0 },
				quaternion: { x: 0, y: 0.707, z: 0, w: 0.707 },
				scale: { x: 2, y: 2, z: 2 }
			}
			const resolvedMap = new Map([
				['chair-1', { slotId: 'chair-1', previewInstanceTransform: existingTransform }]
			])
			const bindings = [{ objectId: 'chair-1', modelSourcePath: 'C:/models/chair.fbx' }]
			const result = buildSlotsFromModelBindings(bindings, resolvedMap, [])
			expect(result[0].previewInstanceTransform).toEqual(existingTransform)
			expect(result[0].generatedFromBinding).toBe(false)
		})

		it('uses transform from layoutItem when no resolved slot exists', () => {
			const layoutTransform = {
				position: { x: 50, y: 0, z: 50 },
				rotation: { yaw: 45, pitch: 0, roll: 0 },
				quaternion: { x: 0, y: 0.383, z: 0, w: 0.924 },
				scale: { x: 1, y: 1, z: 1 }
			}
			const layoutItems = [{ id: 'lamp-1', name: 'Floor Lamp', transform: layoutTransform }]
			const bindings = [{ objectId: 'lamp-1', modelAssetPath: '/assets/lamp.obj' }]
			const result = buildSlotsFromModelBindings(bindings, new Map(), layoutItems)
			expect(result[0].previewInstanceTransform).toEqual(layoutTransform)
			expect(result[0].objectName).toBe('Floor Lamp')
			expect(result[0].generatedFromBinding).toBe(true)
		})

		it('supports all model path fields', () => {
			const testCases = [
				{ field: 'modelUrl', value: 'http://example.com/model.glb' },
				{ field: 'modelAssetUrl', value: 'dweb://asset/model.glb' },
				{ field: 'modelSourcePath', value: 'C:/path/to/model.glb' },
				{ field: 'modelAssetPath', value: '/Game/Models/model.glb' }
			]

			for (const tc of testCases) {
				const binding = { objectId: `test-${tc.field}`, [tc.field]: tc.value }
				const result = buildSlotsFromModelBindings([binding], new Map(), [])
				expect(result).toHaveLength(1)
			}
		})

		it('sorts slots by slotId alphabetically', () => {
			const bindings = [
				{ objectId: 'zebra', modelUrl: 'z.glb' },
				{ objectId: 'apple', modelUrl: 'a.glb' },
				{ objectId: 'banana', modelUrl: 'b.glb' }
			]
			const result = buildSlotsFromModelBindings(bindings, new Map(), [])
			expect(result.map((s) => s.slotId)).toEqual(['apple', 'banana', 'zebra'])
		})

		it('defaults sourceNodeType to model3d when not specified', () => {
			const bindings = [{ objectId: 'obj-1', modelUrl: 'test.glb' }]
			const result = buildSlotsFromModelBindings(bindings, new Map(), [])
			const modelBinding = result[0].modelBinding as Record<string, unknown>
			expect(modelBinding.sourceNodeType).toBe('model3d')
		})

		it('handles null/undefined bindings gracefully', () => {
			const bindings = [
				null,
				undefined,
				'not-an-object',
				{ objectId: 'valid', modelUrl: 'valid.glb' }
			]
			const result = buildSlotsFromModelBindings(bindings, new Map(), [])
			expect(result).toHaveLength(1)
			expect(result[0].slotId).toBe('valid')
		})
	})
})
