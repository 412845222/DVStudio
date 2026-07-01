import { describe, it, expect } from 'vitest'
import { isMeshyRemoteUrl, getMeshyEffectiveModelSource } from '@/views/AIWorkflow/node-business/meshy/useAIWorkflowMeshyAssets'

describe('meshyUrlUtils', () => {
	describe('isMeshyRemoteUrl', () => {
		it('should return false for empty input', () => {
			expect(isMeshyRemoteUrl('')).toBe(false)
			expect(isMeshyRemoteUrl(null)).toBe(false)
			expect(isMeshyRemoteUrl(undefined)).toBe(false)
			expect(isMeshyRemoteUrl(0)).toBe(false)
			expect(isMeshyRemoteUrl({})).toBe(false)
		})

		it('should return true for meshy.ai domain URLs', () => {
			expect(isMeshyRemoteUrl('https://api.meshy.ai/v1/models/123')).toBe(true)
			expect(isMeshyRemoteUrl('https://www.meshy.ai/model/abc')).toBe(true)
			expect(isMeshyRemoteUrl('http://meshy.ai/download')).toBe(true)
			expect(isMeshyRemoteUrl('https://cdn.meshy.ai/assets/model.glb')).toBe(true)
		})

		it('should return true for meshy.ai URLs with query parameters', () => {
			expect(isMeshyRemoteUrl('https://api.meshy.ai/v1/models/123?format=glb')).toBe(true)
			expect(isMeshyRemoteUrl('https://meshy.ai/download?token=abc123')).toBe(true)
		})

		it('should return false for non-meshy URLs', () => {
			expect(isMeshyRemoteUrl('https://example.com/model.glb')).toBe(false)
			expect(isMeshyRemoteUrl('https://google.com')).toBe(false)
			expect(isMeshyRemoteUrl('http://localhost:5173/model.glb')).toBe(false)
			expect(isMeshyRemoteUrl('file:///C:/models/model.glb')).toBe(false)
			expect(isMeshyRemoteUrl('dweb://project-assets?path=models/chair.glb')).toBe(false)
		})

		it('should handle malformed URLs gracefully', () => {
			expect(isMeshyRemoteUrl('not-a-url')).toBe(false)
			expect(isMeshyRemoteUrl('https://')).toBe(false)
			expect(isMeshyRemoteUrl('meshy.ai')).toBe(false)
		})

		it('should be case insensitive', () => {
			expect(isMeshyRemoteUrl('https://MESHY.AI/model')).toBe(true)
			expect(isMeshyRemoteUrl('https://api.MeshY.AI/v1')).toBe(true)
		})
	})

	describe('getMeshyEffectiveModelSource', () => {
		it('should return empty values for null/undefined settings', () => {
			const result = getMeshyEffectiveModelSource(null)
			expect(result.preferredUrl).toBe('')
			expect(result.assetUrl).toBe('')
			expect(result.assetPath).toBe('')
			expect(result.format).toBe('glb')
		})

		it('should extract model source from relationSummary', () => {
			const settings = {
				meshyRelationSummary: {
					effectiveLocalAssetUrl: 'dweb://project-assets/model.glb',
					effectiveLocalAssetPath: '/models/model.glb',
					effectivePreferredModelUrl: 'dweb://project-assets/model.glb'
				}
			}
			const result = getMeshyEffectiveModelSource(settings)
			expect(result.preferredUrl).toBe('dweb://project-assets/model.glb')
			expect(result.assetUrl).toBe('dweb://project-assets/model.glb')
			expect(result.assetPath).toBe('/models/model.glb')
		})

		it('should extract model source from meshyOutputSummary', () => {
			const settings = {
				meshyOutputSummary: {
					assetUrl: 'https://api.meshy.ai/v1/model/123',
					assetPath: '/downloads/model.glb',
					preferredUrl: 'https://api.meshy.ai/v1/model/123',
					format: 'gltf'
				}
			}
			const result = getMeshyEffectiveModelSource(settings)
			expect(result.preferredUrl).toBe('https://api.meshy.ai/v1/model/123')
			expect(result.assetUrl).toBe('https://api.meshy.ai/v1/model/123')
			expect(result.assetPath).toBe('/downloads/model.glb')
			expect(result.format).toBe('gltf')
		})

		it('should extract model source from meshyModelUrls', () => {
			const settings = {
				meshyModelUrls: {
					glb: 'dweb://project-assets/model.glb'
				}
			}
			const result = getMeshyEffectiveModelSource(settings)
			expect(result.preferredUrl).toBe('dweb://project-assets/model.glb')
			expect(result.format).toBe('glb')
		})

		it('should prefer glb format when available', () => {
			const settings = {
				meshyModelUrls: {
					glb: 'model.glb',
					gltf: 'model.gltf'
				}
			}
			const result = getMeshyEffectiveModelSource(settings)
			expect(result.preferredUrl).toBe('model.glb')
			expect(result.format).toBe('glb')
		})

		it('should fall back to gltf format when no glb available', () => {
			const settings = {
				meshyModelUrls: {
					gltf: 'model.gltf'
				}
			}
			const result = getMeshyEffectiveModelSource(settings)
			expect(result.preferredUrl).toBe('model.gltf')
			expect(result.format).toBe('gltf')
		})
	})
})