import { describe, it, expect } from 'vitest'
import {
	SUPPORTED_MODEL_EXTENSIONS,
	detectModelFormatFromPath
} from '@/views/AIWorkflow/node-business/scene/useAIWorkflowSceneLayoutModelBindings'

describe('modelFormatDetection', () => {
	describe('SUPPORTED_MODEL_EXTENSIONS', () => {
		it('includes all six supported 3D model formats', () => {
			expect(SUPPORTED_MODEL_EXTENSIONS).toContain('.glb')
			expect(SUPPORTED_MODEL_EXTENSIONS).toContain('.gltf')
			expect(SUPPORTED_MODEL_EXTENSIONS).toContain('.fbx')
			expect(SUPPORTED_MODEL_EXTENSIONS).toContain('.obj')
			expect(SUPPORTED_MODEL_EXTENSIONS).toContain('.stl')
			expect(SUPPORTED_MODEL_EXTENSIONS).toContain('.dae')
			expect(SUPPORTED_MODEL_EXTENSIONS).toHaveLength(6)
		})
	})

	describe('detectModelFormatFromPath', () => {
		it('detects glb format from various paths', () => {
			expect(detectModelFormatFromPath('model.glb')).toBe('glb')
			expect(detectModelFormatFromPath('/path/to/model.glb')).toBe('glb')
			expect(detectModelFormatFromPath('C:\\Models\\chair.glb')).toBe('glb')
			expect(detectModelFormatFromPath('MODEL.GLB')).toBe('glb')
		})

		it('detects gltf format', () => {
			expect(detectModelFormatFromPath('scene.gltf')).toBe('gltf')
			expect(detectModelFormatFromPath('/assets/room.gltf')).toBe('gltf')
			expect(detectModelFormatFromPath('SCENE.GLTF')).toBe('gltf')
		})

		it('detects fbx format', () => {
			expect(detectModelFormatFromPath('character.fbx')).toBe('fbx')
			expect(detectModelFormatFromPath('D:/Exports/vehicle.fbx')).toBe('fbx')
		})

		it('detects obj format', () => {
			expect(detectModelFormatFromPath('mesh.obj')).toBe('obj')
			expect(detectModelFormatFromPath('/models/table.obj')).toBe('obj')
		})

		it('detects stl format', () => {
			expect(detectModelFormatFromPath('print.stl')).toBe('stl')
			expect(detectModelFormatFromPath('C:/3D Prints/gear.stl')).toBe('stl')
		})

		it('detects dae format', () => {
			expect(detectModelFormatFromPath('animation.dae')).toBe('dae')
			expect(detectModelFormatFromPath('/collada/character.dae')).toBe('dae')
		})

		it('handles URLs with query parameters', () => {
			expect(detectModelFormatFromPath('https://example.com/model.glb?v=123')).toBe('glb')
			expect(
				detectModelFormatFromPath('dweb://project-assets?path=models/chair.fbx&t=123456')
			).toBe('fbx')
		})

		it('returns undefined for empty or invalid input', () => {
			expect(detectModelFormatFromPath('')).toBeUndefined()
			expect(detectModelFormatFromPath(null as unknown as string)).toBeUndefined()
			expect(detectModelFormatFromPath(undefined as unknown as string)).toBeUndefined()
		})

		it('returns undefined for unsupported file extensions', () => {
			expect(detectModelFormatFromPath('model.bin')).toBeUndefined()
			expect(detectModelFormatFromPath('texture.png')).toBeUndefined()
			expect(detectModelFormatFromPath('readme.txt')).toBeUndefined()
			expect(detectModelFormatFromPath('file.unknown')).toBeUndefined()
		})

		it('handles paths with trailing spaces', () => {
			expect(detectModelFormatFromPath('  model.glb  ')).toBe('glb')
		})
	})
})
