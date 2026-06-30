import { describe, it, expect } from 'vitest'
import { slugSceneLayoutPlaceholderModelName } from '@/views/AIWorkflow/node-business/scene/sceneLayoutPlaceholderModelUtils'

describe('sceneLayoutPlaceholderModelUtils', () => {
	describe('slugSceneLayoutPlaceholderModelName', () => {
		it('converts simple names to lowercase slugs', () => {
			expect(slugSceneLayoutPlaceholderModelName('Table')).toBe('table')
			expect(slugSceneLayoutPlaceholderModelName('Chair')).toBe('chair')
			expect(slugSceneLayoutPlaceholderModelName('WALL')).toBe('wall')
		})

		it('replaces spaces and special characters with hyphens', () => {
			expect(slugSceneLayoutPlaceholderModelName('Coffee Table')).toBe('coffee-table')
			expect(slugSceneLayoutPlaceholderModelName('Wall-Mounted Shelf')).toBe('wall-mounted-shelf')
			expect(slugSceneLayoutPlaceholderModelName('Kitchen_Cabinet')).toBe('kitchen_cabinet')
		})

		it('handles Chinese characters by replacing them with hyphens', () => {
			expect(slugSceneLayoutPlaceholderModelName('桌子')).toBe('placeholder-model')
			expect(slugSceneLayoutPlaceholderModelName('Table 桌子')).toBe('table')
		})

		it('trims leading and trailing hyphens', () => {
			expect(slugSceneLayoutPlaceholderModelName('---test---')).toBe('test')
			expect(slugSceneLayoutPlaceholderModelName('  Hello World  ')).toBe('hello-world')
		})

		it('returns fallback for empty or invalid input', () => {
			expect(slugSceneLayoutPlaceholderModelName('')).toBe('placeholder-model')
			expect(slugSceneLayoutPlaceholderModelName(null)).toBe('placeholder-model')
			expect(slugSceneLayoutPlaceholderModelName(undefined)).toBe('placeholder-model')
			expect(slugSceneLayoutPlaceholderModelName('   ')).toBe('placeholder-model')
			expect(slugSceneLayoutPlaceholderModelName('!!!')).toBe('placeholder-model')
		})

		it('supports custom fallback', () => {
			expect(slugSceneLayoutPlaceholderModelName('', 'custom-fallback')).toBe('custom-fallback')
			expect(slugSceneLayoutPlaceholderModelName(null, 'my-model')).toBe('my-model')
		})

		it('handles mixed alphanumeric correctly', () => {
			expect(slugSceneLayoutPlaceholderModelName('Model123')).toBe('model123')
			expect(slugSceneLayoutPlaceholderModelName('3D-Model v2')).toBe('3d-model-v2')
		})
	})
})
