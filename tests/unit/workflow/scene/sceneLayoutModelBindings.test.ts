import { describe, it, expect } from 'vitest'
import { getTripo3DEffectiveModelSource } from '@/views/AIWorkflow/node-business/scene/useAIWorkflowSceneLayoutModelBindings'

describe('useAIWorkflowSceneLayoutModelBindings — getTripo3DEffectiveModelSource', () => {
	// 2026-08-04 第 0 层修复：model3d 节点嵌套 tripo3dModelSettings 兜底
	//   该函数是 tripo3d 嵌套提取的核心，负责从 tripo3dRelationSummary /
	//   tripo3dOutputSummary / 顶层 tripo3dOutputAssetUrl 三层结构中按优先级
	//   解析出真实本地资产路径。优先级：
	//     relation.effectiveLocalAssetUrl > value.tripo3dOutputAssetUrl > output.assetUrl
	describe('assetUrl priority chain', () => {
		it('prefers relation.effectiveLocalAssetUrl over other sources', () => {
			const result = getTripo3DEffectiveModelSource({
				tripo3dRelationSummary: {
					effectiveLocalAssetUrl: 'Content/Media/from-relation.glb',
					effectiveLocalAssetPath: 'C:\\Proj\\Content\\Media\\from-relation.glb'
				},
				tripo3dOutputAssetUrl: 'Content/Media/from-top.glb',
				tripo3dOutputSummary: { assetUrl: 'Content/Media/from-output.glb' }
			})
			expect(result.assetUrl).toBe('Content/Media/from-relation.glb')
			expect(result.assetPath).toBe('C:\\Proj\\Content\\Media\\from-relation.glb')
		})

		it('falls back to top-level tripo3dOutputAssetUrl when relation is absent', () => {
			const result = getTripo3DEffectiveModelSource({
				tripo3dOutputAssetUrl: 'Content/Media/from-top.glb',
				tripo3dOutputSummary: { assetUrl: 'Content/Media/from-output.glb' }
			})
			expect(result.assetUrl).toBe('Content/Media/from-top.glb')
		})

		it('falls back to tripo3dOutputSummary.assetUrl when relation and top-level are absent', () => {
			const result = getTripo3DEffectiveModelSource({
				tripo3dOutputSummary: { assetUrl: 'Content/Media/from-output.glb' }
			})
			expect(result.assetUrl).toBe('Content/Media/from-output.glb')
		})

		it('returns empty assetUrl when all sources are absent', () => {
			const result = getTripo3DEffectiveModelSource({})
			expect(result.assetUrl).toBe('')
			expect(result.assetPath).toBe('')
		})
	})

	describe('assetPath priority chain', () => {
		it('prefers relation.effectiveLocalAssetPath over output.assetPath', () => {
			const result = getTripo3DEffectiveModelSource({
				tripo3dRelationSummary: {
					effectiveLocalAssetPath: 'C:\\Proj\\Content\\Media\\rel.glb'
				},
				tripo3dOutputSummary: { assetPath: 'C:\\Proj\\Content\\Media\\out.glb' }
			})
			expect(result.assetPath).toBe('C:\\Proj\\Content\\Media\\rel.glb')
		})

		it('falls back to tripo3dOutputSummary.assetPath', () => {
			const result = getTripo3DEffectiveModelSource({
				tripo3dOutputSummary: { assetPath: 'C:\\Proj\\Content\\Media\\out.glb' }
			})
			expect(result.assetPath).toBe('C:\\Proj\\Content\\Media\\out.glb')
		})
	})

	describe('preferredUrl resolution', () => {
		it('uses relation.effectivePreferredModelUrl when present', () => {
			const result = getTripo3DEffectiveModelSource({
				tripo3dRelationSummary: {
					effectivePreferredModelUrl: 'dweb://project-assets?path=foo.glb'
				},
				tripo3dOutputSummary: { preferredUrl: 'should-not-win' }
			})
			expect(result.preferredUrl).toBe('dweb://project-assets?path=foo.glb')
		})

		it('falls back to tripo3dOutputSummary.preferredUrl', () => {
			const result = getTripo3DEffectiveModelSource({
				tripo3dOutputSummary: { preferredUrl: 'dweb://project-assets?path=bar.glb' }
			})
			expect(result.preferredUrl).toBe('dweb://project-assets?path=bar.glb')
		})

		it('falls back to assetUrl when no explicit preferredUrl is set', () => {
			const result = getTripo3DEffectiveModelSource({
				tripo3dOutputSummary: { assetUrl: 'Content/Media/baz.glb' }
			})
			expect(result.preferredUrl).toBe('Content/Media/baz.glb')
		})
	})

	describe('format detection', () => {
		it('returns gltf when tripo3dOutputSummary.format is gltf', () => {
			const result = getTripo3DEffectiveModelSource({
				tripo3dOutputSummary: { format: 'gltf' }
			})
			expect(result.format).toBe('gltf')
		})

		it('returns glb for any non-gltf format value', () => {
			expect(
				getTripo3DEffectiveModelSource({ tripo3dOutputSummary: { format: 'glb' } }).format
			).toBe('glb')
			expect(getTripo3DEffectiveModelSource({ tripo3dOutputSummary: { format: '' } }).format).toBe(
				'glb'
			)
			expect(
				getTripo3DEffectiveModelSource({ tripo3dOutputSummary: { format: 'fbx' } }).format
			).toBe('glb')
		})

		it('recognizes GLTF format case-insensitively', () => {
			// 代码先 toLowerCase() 再比较 'gltf'，所以 'GLTF' / 'Gltf' 都应识别为 gltf
			expect(
				getTripo3DEffectiveModelSource({ tripo3dOutputSummary: { format: 'GLTF' } }).format
			).toBe('gltf')
			expect(
				getTripo3DEffectiveModelSource({ tripo3dOutputSummary: { format: 'Gltf' } }).format
			).toBe('gltf')
		})

		it('defaults to glb when format is absent', () => {
			expect(getTripo3DEffectiveModelSource({}).format).toBe('glb')
			expect(getTripo3DEffectiveModelSource(null).format).toBe('glb')
			expect(getTripo3DEffectiveModelSource(undefined).format).toBe('glb')
		})
	})

	describe('null/undefined safety', () => {
		it('treats null settings as empty object', () => {
			const result = getTripo3DEffectiveModelSource(null)
			expect(result.assetUrl).toBe('')
			expect(result.assetPath).toBe('')
			expect(result.preferredUrl).toBe('')
			expect(result.format).toBe('glb')
		})

		it('treats undefined settings as empty object', () => {
			const result = getTripo3DEffectiveModelSource(undefined)
			expect(result.assetUrl).toBe('')
			expect(result.format).toBe('glb')
		})

		it('ignores non-object tripo3dRelationSummary / tripo3dOutputSummary', () => {
			const result = getTripo3DEffectiveModelSource({
				tripo3dRelationSummary: 'not-an-object',
				tripo3dOutputSummary: 42
			})
			expect(result.assetUrl).toBe('')
			expect(result.assetPath).toBe('')
			expect(result.format).toBe('glb')
		})

		it('trims whitespace from resolved values', () => {
			const result = getTripo3DEffectiveModelSource({
				tripo3dRelationSummary: {
					effectiveLocalAssetUrl: '  Content/Media/spaces.glb  ',
					effectiveLocalAssetPath: '  C:\\path\\spaces.glb  '
				}
			})
			expect(result.assetUrl).toBe('Content/Media/spaces.glb')
			expect(result.assetPath).toBe('C:\\path\\spaces.glb')
		})
	})
})
