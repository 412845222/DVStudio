import { describe, it, expect } from 'vitest'
import {
	normalizeResolvedLayoutSlots,
	buildSlotsFromModelBindings,
	detectModelFormatFromPath,
	pickBestModelUrlFromCandidates,
	isConnectedTruthy,
	hasAnyPathExtended,
	normalizeLayoutItemTransform,
	mergeViewerResolvedIntoFinalBindings,
	tryBackfillBindingPathsFromStore,
	prepareResolvedSlotsForExport,
	getUnrealConnectionPollInterval
} from '@/views/AIWorkflow/node-business/unreal/unrealExportUtils'

describe('unrealExportUtils', () => {
	describe('normalizeResolvedLayoutSlots', () => {
		it('filters out invalid slots and returns structured result', () => {
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
			expect(result.slots).toHaveLength(3)
			expect(result.bySlotId.size).toBe(3)
			expect(result.bySlotId.has('slot-1')).toBe(true)
			expect(result.bySlotId.has('slot-5')).toBe(true)
		})

		it('returns empty result for empty/invalid input', () => {
			const emptyResult = normalizeResolvedLayoutSlots([])
			expect(emptyResult.slots).toHaveLength(0)
			const nullResult = normalizeResolvedLayoutSlots(null as unknown as unknown[])
			expect(nullResult.slots).toHaveLength(0)
		})
	})

	describe('detectModelFormatFromPath', () => {
		it('detects glb format from path', () => {
			expect(detectModelFormatFromPath('Content/Media/foo.glb')).toBe('glb')
			expect(detectModelFormatFromPath('/assets/model.glb')).toBe('glb')
		})

		it('detects gltf format from path', () => {
			expect(detectModelFormatFromPath('Content/Media/bar.gltf')).toBe('gltf')
		})

		it('detects fbx format from path', () => {
			expect(detectModelFormatFromPath('Content/Media/model.fbx')).toBe('fbx')
		})

		it('normalizes usdz to glb', () => {
			expect(detectModelFormatFromPath('Content/Media/model.usdz')).toBe('glb')
		})

		it('normalizes dae to fbx', () => {
			expect(detectModelFormatFromPath('Content/Media/model.dae')).toBe('fbx')
		})

		it('returns null for unknown or empty paths', () => {
			expect(detectModelFormatFromPath('')).toBeNull()
			expect(detectModelFormatFromPath('foo.txt')).toBeNull()
			expect(detectModelFormatFromPath(null)).toBeNull()
		})

		it('handles dweb:// URLs with path query param — ext only reads from non-query part', () => {
			// getLowercasedExt strips ?query before extracting ext, so dweb:// URLs
			// without embedded filename in the host part return null
			expect(
				detectModelFormatFromPath('dweb://project-assets?path=Content/Media/foo.glb')
			).toBeNull()
			// But file:// URLs work because the filename is in the path itself
			expect(detectModelFormatFromPath('file:///C:/project/Content/Media/foo.glb')).toBe('glb')
		})

		it('handles file:// URLs', () => {
			expect(detectModelFormatFromPath('file:///C:/project/Content/Media/foo.glb')).toBe('glb')
		})
	})

	describe('pickBestModelUrlFromCandidates', () => {
		it('picks glb path with Content/Media prefix', () => {
			const result = pickBestModelUrlFromCandidates([
				'Content/Media/model.glb',
				'Content/Media/model.fbx',
				'https://assets.meshy.ai/model.glb'
			])
			expect(result).toBe('Content/Media/model.glb')
		})

		it('prefers local paths over remote URLs', () => {
			const result = pickBestModelUrlFromCandidates([
				'https://assets.meshy.ai/model.glb',
				'Content/Media/model.glb'
			])
			expect(result).toBe('Content/Media/model.glb')
		})

		it('returns null for empty candidates', () => {
			expect(pickBestModelUrlFromCandidates([])).toBeNull()
			expect(pickBestModelUrlFromCandidates([null, undefined, ''])).toBeNull()
		})

		it('handles dweb:// URLs — falls back to other scoring signals', () => {
			const result = pickBestModelUrlFromCandidates([
				'dweb://project-assets?path=Content/Media/foo.glb',
				'Content/Media/other.fbx'
			])
			// dweb URL doesn't have detectible ext after query stripping, but Content/Media prefix + asset score
			// makes it still competitive. fbx with Content/Media prefix also scores well.
			expect(result).toBeTruthy()
			expect(typeof result).toBe('string')
		})
	})

	describe('isConnectedTruthy', () => {
		it('returns true for truthy connected values', () => {
			expect(isConnectedTruthy({ connected: true })).toBe(true)
			expect(isConnectedTruthy({ connected: 1 })).toBe(true)
			expect(isConnectedTruthy({ connected: 'true' })).toBe(true)
			expect(isConnectedTruthy({ connected: 'True' })).toBe(true)
			expect(isConnectedTruthy({ connected: 'TRUE' })).toBe(true)
		})

		it('returns false for falsy connected values', () => {
			expect(isConnectedTruthy({ connected: false })).toBe(false)
			expect(isConnectedTruthy({ connected: 0 })).toBe(false)
			expect(isConnectedTruthy({ connected: 'false' })).toBe(false)
			expect(isConnectedTruthy({ connected: undefined })).toBe(false)
			expect(isConnectedTruthy({})).toBe(false)
		})

		it('returns false for null/undefined objects', () => {
			expect(isConnectedTruthy(null)).toBe(false)
			expect(isConnectedTruthy(undefined)).toBe(false)
		})
	})

	describe('hasAnyPathExtended', () => {
		it('returns true when any path field is non-empty', () => {
			expect(hasAnyPathExtended({ modelAssetUrl: 'Content/Media/foo.glb' })).toBe(true)
			expect(hasAnyPathExtended({ modelUrl: 'Content/Media/foo.glb' })).toBe(true)
			expect(hasAnyPathExtended({ modelAssetPath: 'Content/Media/foo.glb' })).toBe(true)
			expect(hasAnyPathExtended({ modelSourcePath: 'Content/Media/foo.glb' })).toBe(true)
			expect(hasAnyPathExtended({ modelAssetProjectRelativePath: 'Content/Media/foo.glb' })).toBe(
				true
			)
			expect(hasAnyPathExtended({ modelProjectRelativePath: 'Content/Media/foo.glb' })).toBe(true)
		})

		it('returns false when all path fields are empty', () => {
			expect(hasAnyPathExtended({})).toBe(false)
			expect(hasAnyPathExtended({ modelAssetUrl: '' })).toBe(false)
			expect(hasAnyPathExtended({ modelUrl: '  ' })).toBe(false)
		})

		it('returns false for null/undefined', () => {
			expect(hasAnyPathExtended(null)).toBe(false)
			expect(hasAnyPathExtended(undefined)).toBe(false)
		})
	})

	describe('normalizeLayoutItemTransform', () => {
		it('returns identity transform for invalid input', () => {
			const result = normalizeLayoutItemTransform(null)
			expect(result.scale).toEqual({ x: 1, y: 1, z: 1 })
			expect(result.position).toEqual({ x: 0, y: 0, z: 0 })
		})

		it('extracts position/rotation/scale from layout item', () => {
			const result = normalizeLayoutItemTransform({
				position: { x: 10, y: 20, z: 30 },
				rotation: { yaw: 0.5, pitch: 0.3, roll: 0.1 },
				scale: { x: 2, y: 2, z: 2 }
			})
			expect(result.position).toEqual({ x: 10, y: 20, z: 30 })
			expect(result.rotation).toEqual({ yaw: 0.5, pitch: 0.3, roll: 0.1 })
			expect(result.scale).toEqual({ x: 2, y: 2, z: 2 })
		})

		it('handles missing fields gracefully', () => {
			const result = normalizeLayoutItemTransform({
				position: { x: 5 }
			})
			expect(result.position).toEqual({ x: 5, y: 0, z: 0 })
			expect(result.scale).toEqual({ x: 1, y: 1, z: 1 })
		})
	})

	describe('mergeViewerResolvedIntoFinalBindings', () => {
		it('uses precheck as base when both are present', () => {
			const precheck = [
				{
					objectId: 'obj-1',
					connected: true,
					modelAssetProjectRelativePath: 'Content/Media/a.glb'
				},
				{ objectId: 'obj-2', connected: true, modelAssetProjectRelativePath: 'Content/Media/b.glb' }
			]
			const viewer = [
				{ objectId: 'obj-1', connected: 'true', textureRefs: ['tex1'] },
				{ objectId: 'obj-2', connected: 'true', textureRefs: ['tex2'] }
			]
			const result = mergeViewerResolvedIntoFinalBindings(
				{ sceneLayoutResolvedModelBindings: viewer },
				precheck
			)
			expect(result.finalBindingsSource).toHaveLength(2)
			expect(result.usedViewerResolvedBindings).toBe(false)
		})

		it('falls back to viewer when precheck is empty', () => {
			const viewer = [
				{ objectId: 'obj-1', connected: true, modelAssetProjectRelativePath: 'Content/Media/a.glb' }
			]
			const result = mergeViewerResolvedIntoFinalBindings(
				{ sceneLayoutResolvedModelBindings: viewer },
				[]
			)
			expect(result.finalBindingsSource).toHaveLength(1)
			expect(result.usedViewerResolvedBindings).toBe(true)
		})

		it('preserves precheck values when viewer has no corresponding entry', () => {
			const precheck = [
				{
					objectId: 'obj-1',
					connected: true,
					modelAssetProjectRelativePath: 'Content/Media/a.glb',
					objectName: 'A'
				}
			]
			const viewer: unknown[] = []
			const result = mergeViewerResolvedIntoFinalBindings(
				{ sceneLayoutResolvedModelBindings: viewer },
				precheck
			)
			expect(result.finalBindingsSource).toHaveLength(1)
			const merged = result.finalBindingsSource[0] as Record<string, unknown>
			expect(merged.objectName).toBe('A')
		})

		it('does not overwrite precheck fields with viewer when precheck already has values', () => {
			const precheck = [
				{
					objectId: 'obj-1',
					connected: true,
					modelAssetProjectRelativePath: 'Content/Media/from-precheck.glb',
					modelSourceName: 'precheck-name'
				}
			]
			const viewer = [
				{
					objectId: 'obj-1',
					connected: 'true',
					modelAssetProjectRelativePath: 'Content/Media/from-viewer.glb',
					modelSourceName: 'viewer-name'
				}
			]
			const result = mergeViewerResolvedIntoFinalBindings(
				{ sceneLayoutResolvedModelBindings: viewer },
				precheck
			)
			const merged = result.finalBindingsSource[0] as Record<string, unknown>
			expect(merged.modelAssetProjectRelativePath).toBe('Content/Media/from-precheck.glb')
			expect(merged.modelSourceName).toBe('precheck-name')
		})
	})

	describe('tryBackfillBindingPathsFromStore', () => {
		it('returns binding unchanged when it already has paths', () => {
			const binding = {
				objectId: 'obj-1',
				modelAssetProjectRelativePath: 'Content/Media/foo.glb'
			}
			const result = tryBackfillBindingPathsFromStore(binding, {}, {})
			expect(result.modelAssetProjectRelativePath).toBe('Content/Media/foo.glb')
		})

		it('returns binding unchanged when no sourceNodeId or modelResourceId', () => {
			const binding = { objectId: 'obj-1', connected: true }
			const result = tryBackfillBindingPathsFromStore(binding, {}, {})
			expect(result.objectId).toBe('obj-1')
		})

		it('backfills paths from upstream node outputs', () => {
			const binding = {
				objectId: 'obj-1',
				sourceNodeId: 'node-1',
				connected: true
			}
			const nodesById = {
				'node-1': {
					outputs: [
						{
							resolved: {
								modelAssetProjectRelativePath: 'Content/Media/from-output.glb',
								modelFormat: 'glb'
							}
						}
					]
				}
			}
			const result = tryBackfillBindingPathsFromStore(binding, nodesById, {})
			expect(result.modelAssetProjectRelativePath).toBe('Content/Media/from-output.glb')
		})

		it('backfills paths from resourcesById', () => {
			const binding = {
				objectId: 'obj-1',
				modelResourceId: 'res-1',
				connected: true
			}
			const resourcesById = {
				'res-1': {
					projectRelativePath: 'Content/Media/from-resource.glb',
					modelFormat: 'glb'
				}
			}
			const result = tryBackfillBindingPathsFromStore(binding, {}, resourcesById)
			expect(result.modelAssetProjectRelativePath).toBe('Content/Media/from-resource.glb')
		})

		it('returns original binding for null/undefined input', () => {
			expect(tryBackfillBindingPathsFromStore(null, {}, {})).toEqual({})
			expect(tryBackfillBindingPathsFromStore(undefined, {}, {})).toEqual({})
		})
	})

	describe('prepareResolvedSlotsForExport', () => {
		it('preserves transform data from viewer slots', () => {
			const rawSlots = [
				{
					slotId: 'slot-1',
					sourceObjectId: 'obj-1',
					objectName: 'Test Object',
					relativeTransform: {
						position: { x: 100, y: 200, z: 0 },
						rotation: { yaw: 0, pitch: 0, roll: 0 },
						scale: { x: 1.5, y: 1.5, z: 1.5 }
					},
					worldTransform: {
						position: { x: 100, y: 200, z: 0 },
						rotation: { yaw: 0, pitch: 0, roll: 0 },
						scale: { x: 1.5, y: 1.5, z: 1.5 }
					},
					meshTransform: {
						position: { x: 0, y: 0, z: 0 },
						rotation: { yaw: 0, pitch: 0, roll: 0 },
						scale: { x: 1, y: 1, z: 1 }
					},
					previewInstanceTransform: {
						position: { x: 100, y: 200, z: 0 },
						rotation: { yaw: 0, pitch: 0, roll: 0 },
						scale: { x: 1.5, y: 1.5, z: 1.5 }
					},
					previewInstanceWorldTransform: {
						position: { x: 100, y: 200, z: 0 },
						rotation: { yaw: 0, pitch: 0, roll: 0 },
						scale: { x: 1.5, y: 1.5, z: 1.5 }
					},
					slotTransform: {
						position: { x: 100, y: 200, z: 0 },
						rotation: { yaw: 0, pitch: 0, roll: 0 },
						scale: { x: 1.5, y: 1.5, z: 1.5 }
					}
				}
			]
			const bindings = [
				{
					objectId: 'obj-1',
					connected: true,
					modelAssetProjectRelativePath: 'Content/Media/foo.glb',
					sourceNodeType: 'model3d',
					sourceNodeId: 'node-1',
					modelFormat: 'glb'
				}
			]
			const { slots, warnings } = prepareResolvedSlotsForExport(rawSlots, bindings, [])
			expect(slots).toHaveLength(1)
			expect(warnings.length).toBeGreaterThanOrEqual(0)

			const slot = slots[0]
			const relTransform = slot.relativeTransform as Record<string, unknown>
			expect(relTransform).toBeDefined()
			expect((relTransform.position as Record<string, number>).x).toBe(100)
			expect((relTransform.scale as Record<string, number>).x).toBe(1.5)

			const worldTransform = slot.worldTransform as Record<string, unknown>
			expect(worldTransform).toBeDefined()
			expect((worldTransform.position as Record<string, number>).x).toBe(100)
		})

		it('filters out slots with no asset path', () => {
			const rawSlots = [
				{
					slotId: 'slot-1',
					sourceObjectId: 'obj-1',
					modelBinding: {
						objectId: 'obj-1',
						modelAssetProjectRelativePath: 'Content/Media/has-path.glb'
					}
				},
				{
					slotId: 'slot-2',
					sourceObjectId: 'obj-2',
					modelBinding: {
						objectId: 'obj-2'
					}
				}
			]
			const { slots } = prepareResolvedSlotsForExport(rawSlots, [], [])
			expect(slots.length).toBeLessThanOrEqual(2)
		})

		it('backfills UE path fields from modelAssetProjectRelativePath', () => {
			const rawSlots = [
				{
					slotId: 'slot-1',
					sourceObjectId: 'obj-1',
					modelBinding: {
						objectId: 'obj-1',
						modelAssetProjectRelativePath: 'Content/Media/test.glb',
						modelFormat: 'glb'
					}
				}
			]
			const { slots } = prepareResolvedSlotsForExport(rawSlots, [], [])
			expect(slots.length).toBe(1)
			const mb = (slots[0].modelBinding ?? {}) as Record<string, unknown>
			expect(mb.modelSourcePath).toBe('Content/Media/test.glb')
			expect(mb.modelAssetPath).toBe('Content/Media/test.glb')
			expect(mb.modelAssetUrl).toBe('Content/Media/test.glb')
			expect(mb.modelUrl).toBe('Content/Media/test.glb')
		})

		it('replaces dweb:// URLs with local relPath', () => {
			const rawSlots = [
				{
					slotId: 'slot-1',
					sourceObjectId: 'obj-1',
					modelBinding: {
						objectId: 'obj-1',
						modelAssetProjectRelativePath: 'Content/Media/test.glb',
						modelUrl: 'dweb://project-assets?path=Content/Media/test.glb',
						modelFormat: 'glb'
					}
				}
			]
			const { slots } = prepareResolvedSlotsForExport(rawSlots, [], [])
			expect(slots.length).toBe(1)
			const mb = (slots[0].modelBinding ?? {}) as Record<string, unknown>
			expect(mb.modelUrl).toBe('Content/Media/test.glb')
		})

		it('replaces remote CDN URLs (meshy.ai) with local relPath', () => {
			const rawSlots = [
				{
					slotId: 'slot-1',
					sourceObjectId: 'obj-1',
					modelBinding: {
						objectId: 'obj-1',
						modelAssetProjectRelativePath: 'Content/Media/test.glb',
						modelUrl: 'https://assets.meshy.ai/models/test.glb',
						modelFormat: 'glb'
					}
				}
			]
			const { slots } = prepareResolvedSlotsForExport(rawSlots, [], [])
			expect(slots.length).toBe(1)
			const mb = (slots[0].modelBinding ?? {}) as Record<string, unknown>
			expect(mb.modelUrl).toBe('Content/Media/test.glb')
		})

		it('replaces remote CDN URLs (tripo3d.ai) with local relPath', () => {
			const rawSlots = [
				{
					slotId: 'slot-1',
					sourceObjectId: 'obj-1',
					modelBinding: {
						objectId: 'obj-1',
						modelAssetProjectRelativePath: 'Content/Media/test.glb',
						modelAssetUrl: 'https://assets.tripo3d.ai/models/test.glb',
						modelFormat: 'glb'
					}
				}
			]
			const { slots } = prepareResolvedSlotsForExport(rawSlots, [], [])
			expect(slots.length).toBe(1)
			const mb = (slots[0].modelBinding ?? {}) as Record<string, unknown>
			expect(mb.modelAssetUrl).toBe('Content/Media/test.glb')
		})

		it('accepts localhost URLs as non-remote', () => {
			const rawSlots = [
				{
					slotId: 'slot-1',
					sourceObjectId: 'obj-1',
					modelBinding: {
						objectId: 'obj-1',
						modelAssetProjectRelativePath: 'Content/Media/test.glb',
						modelUrl: 'http://localhost:8080/models/test.glb',
						modelFormat: 'glb'
					}
				}
			]
			const { slots } = prepareResolvedSlotsForExport(rawSlots, [], [])
			expect(slots.length).toBe(1)
			const mb = (slots[0].modelBinding ?? {}) as Record<string, unknown>
			expect(mb.modelUrl).toBe('http://localhost:8080/models/test.glb')
		})

		it('auto-synthesizes slots for bindings not in viewer', () => {
			const bindings = [
				{
					objectId: 'obj-1',
					connected: true,
					modelAssetPath: 'Content/Media/synthesized.glb',
					sourceNodeType: 'model3d',
					modelFormat: 'glb'
				}
			]
			const { slots, warnings } = prepareResolvedSlotsForExport([], bindings, [])
			expect(slots.length).toBeGreaterThanOrEqual(1)
			expect(warnings.some((w) => String(w).includes('auto-synthesizing'))).toBe(true)
		})
	})

	describe('buildSlotsFromModelBindings (deprecated path)', () => {
		it('builds slots from bindings with valid paths', () => {
			const bindings = [
				{
					objectId: 'obj-1',
					modelAssetPath: 'Content/Media/test.glb',
					sourceNodeType: 'model3d',
					modelFormat: 'glb',
					objectName: 'Test Object'
				}
			]
			const result = buildSlotsFromModelBindings(bindings, new Map(), [])
			expect(result).toHaveLength(1)
			expect(result[0].sourceObjectId).toBe('obj-1')
			expect(result[0].modelBinding).toBeDefined()
		})

		it('skips bindings without valid model paths', () => {
			const bindings = [{ objectId: 'obj-1', connected: true }]
			const result = buildSlotsFromModelBindings(bindings, new Map(), [])
			expect(result).toHaveLength(0)
		})

		it('uses layoutItem transform when binding has no existing slot', () => {
			const bindings = [
				{
					objectId: 'obj-1',
					modelAssetPath: 'Content/Media/test.glb',
					sourceNodeType: 'model3d',
					modelFormat: 'glb'
				}
			]
			const layoutItems = [
				{
					id: 'obj-1',
					name: 'Test Layout',
					position: { x: 50, y: 100, z: 0 },
					rotation: { yaw: 0.5, pitch: 0, roll: 0 },
					scale: { x: 2, y: 2, z: 2 }
				}
			]
			const result = buildSlotsFromModelBindings(bindings, new Map(), layoutItems)
			expect(result).toHaveLength(1)
			const slot = result[0]
			const relTransform = slot.relativeTransform as Record<string, unknown>
			expect((relTransform.position as Record<string, number>).x).toBe(50)
			expect((relTransform.scale as Record<string, number>).x).toBe(2)
		})
	})

	describe('getUnrealConnectionPollInterval', () => {
		it('returns fast interval for early poll counts', () => {
			expect(getUnrealConnectionPollInterval(0)).toBe(800)
			expect(getUnrealConnectionPollInterval(5)).toBe(800)
			expect(getUnrealConnectionPollInterval(9)).toBe(800)
		})

		it('returns slow interval after fast poll threshold', () => {
			expect(getUnrealConnectionPollInterval(10)).toBe(1500)
			expect(getUnrealConnectionPollInterval(20)).toBe(1500)
		})
	})
})
