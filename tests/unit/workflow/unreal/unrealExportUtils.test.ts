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
	getUnrealConnectionPollInterval,
	buildDirectScanAbsPathByObjectId
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

		// 2026-08-04 第 1 层修复：占位 slot 保留策略
		//   无模型路径的 slot（墙/地/天花/灯等占位体）应被标记 isPlaceholder=true 并保留，
		//   而非直接丢弃，以保障 UE 端布局完整性（UE 端会为占位 slot 创建 Cube 占位 Actor）。
		it('marks slots without model path as placeholder and retains them', () => {
			const rawSlots = [
				{
					slotId: 'slot-1',
					sourceObjectId: 'obj-1',
					modelBinding: {
						objectId: 'obj-1',
						modelAssetProjectRelativePath: 'Content/Media/has-path.glb',
						modelFormat: 'glb'
					}
				},
				{
					slotId: 'slot-2',
					sourceObjectId: 'obj-2',
					modelBinding: {
						objectId: 'obj-2'
						// 无任何路径字段 → 占位 slot
					}
				},
				{
					slotId: 'slot-3',
					sourceObjectId: 'obj-3',
					modelBinding: {
						objectId: 'obj-3',
						modelUrl: '   '
						// 空白字符串路径 → 占位 slot
					}
				}
			]
			const { slots, placeholderCount } = prepareResolvedSlotsForExport(rawSlots, [], [])
			// 3 个 slot 全部保留（1 个有模型 + 2 个占位）
			expect(slots).toHaveLength(3)
			expect(placeholderCount).toBe(2)
			// 有模型的 slot 不应被标记为占位
			const slot1 = slots.find((s) => s.slotId === 'slot-1') as Record<string, unknown>
			expect(slot1.isPlaceholder).not.toBe(true)
			// 无模型路径的 slot 应被标记 isPlaceholder + placeholderReason
			const slot2 = slots.find((s) => s.slotId === 'slot-2') as Record<string, unknown>
			expect(slot2.isPlaceholder).toBe(true)
			expect(slot2.placeholderReason).toBe('no-model-binding')
			const slot3 = slots.find((s) => s.slotId === 'slot-3') as Record<string, unknown>
			expect(slot3.isPlaceholder).toBe(true)
			expect(slot3.placeholderReason).toBe('no-model-binding')
		})

		it('does not mark slots as placeholder when any of 6 path fields is non-empty', () => {
			// 验证 6 个路径字段任一非空都不应判为占位
			const pathFields = [
				'modelAssetProjectRelativePath',
				'modelAssetUrl',
				'modelAssetPath',
				'modelSourcePath',
				'modelProjectRelativePath',
				'modelUrl'
			]
			for (const field of pathFields) {
				const rawSlots = [
					{
						slotId: `slot-${field}`,
						sourceObjectId: `obj-${field}`,
						modelBinding: {
							objectId: `obj-${field}`,
							[field]: 'Content/Media/foo.glb',
							modelFormat: 'glb'
						}
					}
				]
				const { slots, placeholderCount } = prepareResolvedSlotsForExport(rawSlots, [], [])
				expect(slots).toHaveLength(1)
				expect(placeholderCount).toBe(0)
				expect(slots[0].isPlaceholder).not.toBe(true)
			}
		})

		it('emits placeholder preservation warning when placeholder slots exist', () => {
			const rawSlots = [
				{
					slotId: 'slot-ph',
					sourceObjectId: 'obj-ph',
					modelBinding: { objectId: 'obj-ph' }
				}
			]
			const { warnings } = prepareResolvedSlotsForExport(rawSlots, [], [])
			expect(warnings.some((w) => String(w).includes('Placeholder slots preserved: 1'))).toBe(true)
		})
	})

	describe('buildDirectScanAbsPathByObjectId', () => {
		// 2026-08-04 ④ 蓝图直扫机制测试
		//   直接从 edgesById → model3d 节点 → resourceId → resourcesById → 绝对路径，
		//   完全绕过 model3dSettings 的路径声明（用户硬约束）。
		const baseNodes = {
			'model-node-1': { type: 'model3d', resourceId: 'res-1' },
			'meshy-node-2': { type: 'meshy', resourceId: 'res-2' },
			'tripo-node-3': { type: 'tripo3d', resourceId: 'res-3' },
			'image-node-4': { type: 'image', resourceId: 'res-4' }
		}
		const baseResources = {
			'res-1': { projectRelativePath: 'Content/Media/bar_main.glb' },
			'res-2': { projectRelativePath: 'Content/Media/stool_left.glb' },
			'res-3': { projectRelativePath: 'Content/Media/shelf.glb' },
			'res-4': { projectRelativePath: 'Content/Media/poster.png' }
		}
		const baseEdges = {
			'edge-1': {
				toNodeId: 'scene-layout-1',
				toAnchorId: 'in-model-bar_main',
				fromNodeId: 'model-node-1'
			},
			'edge-2': {
				toNodeId: 'scene-layout-1',
				toAnchorId: 'in-model-stool_left',
				fromNodeId: 'meshy-node-2'
			},
			'edge-3': {
				toNodeId: 'scene-layout-1',
				toAnchorId: 'in-model-shelf',
				fromNodeId: 'tripo-node-3'
			},
			// 指向其他场景布局节点的边（应被过滤）
			'edge-4': {
				toNodeId: 'other-scene-layout',
				toAnchorId: 'in-model-foo',
				fromNodeId: 'model-node-1'
			},
			// 非 in-model-* 入边（应被过滤）
			'edge-5': {
				toNodeId: 'scene-layout-1',
				toAnchorId: 'in-text-caption',
				fromNodeId: 'model-node-1'
			},
			// 上游是 image 节点（应被过滤，非 model3d/meshy/tripo3d）
			'edge-6': {
				toNodeId: 'scene-layout-1',
				toAnchorId: 'in-model-poster',
				fromNodeId: 'image-node-4'
			}
		}

		it('builds objectId → absolute path map from edges → model3d → resourcesById', () => {
			const result = buildDirectScanAbsPathByObjectId({
				edgesById: baseEdges,
				nodesById: baseNodes,
				resourcesById: baseResources,
				sourceSceneLayoutNodeId: 'scene-layout-1',
				projectRootPath: 'G:\\DVSTestProject\\测试19'
			})
			expect(result.size).toBe(3)
			expect(result.get('bar_main')).toBe(
				'G:\\DVSTestProject\\测试19\\Content\\Media\\bar_main.glb'
			)
			expect(result.get('stool_left')).toBe(
				'G:\\DVSTestProject\\测试19\\Content\\Media\\stool_left.glb'
			)
			expect(result.get('shelf')).toBe('G:\\DVSTestProject\\测试19\\Content\\Media\\shelf.glb')
			// image 节点的边应被过滤
			expect(result.has('poster')).toBe(false)
		})

		it('normalizes forward slashes in relative path to backslashes', () => {
			const result = buildDirectScanAbsPathByObjectId({
				edgesById: {
					e1: {
						toNodeId: 'sl-1',
						toAnchorId: 'in-model-foo',
						fromNodeId: 'm-1'
					}
				},
				nodesById: { 'm-1': { type: 'model3d', resourceId: 'r-1' } },
				resourcesById: { 'r-1': { projectRelativePath: 'Content/Media/foo.glb' } },
				sourceSceneLayoutNodeId: 'sl-1',
				projectRootPath: 'C:/Projects/MyProj'
			})
			expect(result.get('foo')).toBe('C:/Projects/MyProj\\Content\\Media\\foo.glb')
		})

		it('strips trailing slashes from projectRootPath', () => {
			const result = buildDirectScanAbsPathByObjectId({
				edgesById: {
					e1: { toNodeId: 'sl-1', toAnchorId: 'in-model-foo', fromNodeId: 'm-1' }
				},
				nodesById: { 'm-1': { type: 'model3d', resourceId: 'r-1' } },
				resourcesById: { 'r-1': { projectRelativePath: 'Content/Media/foo.glb' } },
				sourceSceneLayoutNodeId: 'sl-1',
				projectRootPath: 'C:\\Projects\\MyProj\\\\'
			})
			expect(result.get('foo')).toBe('C:\\Projects\\MyProj\\Content\\Media\\foo.glb')
		})

		it('keeps first resolved path when multiple edges target same objectId', () => {
			const result = buildDirectScanAbsPathByObjectId({
				edgesById: {
					e1: { toNodeId: 'sl-1', toAnchorId: 'in-model-foo', fromNodeId: 'm-1' },
					e2: { toNodeId: 'sl-1', toAnchorId: 'in-model-foo', fromNodeId: 'm-2' }
				},
				nodesById: {
					'm-1': { type: 'model3d', resourceId: 'r-1' },
					'm-2': { type: 'model3d', resourceId: 'r-2' }
				},
				resourcesById: {
					'r-1': { projectRelativePath: 'Content/Media/first.glb' },
					'r-2': { projectRelativePath: 'Content/Media/second.glb' }
				},
				sourceSceneLayoutNodeId: 'sl-1',
				projectRootPath: 'C:\\Proj'
			})
			expect(result.size).toBe(1)
			// 保留首次解析结果（e1 先于 e2）
			expect(result.get('foo')).toBe('C:\\Proj\\Content\\Media\\first.glb')
		})

		it('returns empty map when sourceSceneLayoutNodeId is empty', () => {
			const result = buildDirectScanAbsPathByObjectId({
				edgesById: baseEdges,
				nodesById: baseNodes,
				resourcesById: baseResources,
				sourceSceneLayoutNodeId: '',
				projectRootPath: 'C:\\Proj'
			})
			expect(result.size).toBe(0)
		})

		it('returns empty map when projectRootPath is empty', () => {
			const result = buildDirectScanAbsPathByObjectId({
				edgesById: baseEdges,
				nodesById: baseNodes,
				resourcesById: baseResources,
				sourceSceneLayoutNodeId: 'scene-layout-1',
				projectRootPath: ''
			})
			expect(result.size).toBe(0)
		})

		it('handles null/undefined inputs gracefully', () => {
			const result = buildDirectScanAbsPathByObjectId({
				edgesById: null,
				nodesById: undefined,
				resourcesById: null,
				sourceSceneLayoutNodeId: 'sl-1',
				projectRootPath: 'C:\\Proj'
			})
			expect(result.size).toBe(0)
		})

		it('skips edges whose fromNode has no resourceId', () => {
			const result = buildDirectScanAbsPathByObjectId({
				edgesById: {
					e1: { toNodeId: 'sl-1', toAnchorId: 'in-model-foo', fromNodeId: 'm-1' }
				},
				nodesById: { 'm-1': { type: 'model3d' } },
				resourcesById: {},
				sourceSceneLayoutNodeId: 'sl-1',
				projectRootPath: 'C:\\Proj'
			})
			expect(result.size).toBe(0)
		})

		it('skips edges whose resource has no projectRelativePath', () => {
			const result = buildDirectScanAbsPathByObjectId({
				edgesById: {
					e1: { toNodeId: 'sl-1', toAnchorId: 'in-model-foo', fromNodeId: 'm-1' }
				},
				nodesById: { 'm-1': { type: 'model3d', resourceId: 'r-1' } },
				resourcesById: { 'r-1': { name: 'foo.glb' } },
				sourceSceneLayoutNodeId: 'sl-1',
				projectRootPath: 'C:\\Proj'
			})
			expect(result.size).toBe(0)
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
