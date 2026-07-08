import { describe, it, expect } from 'vitest'
import type { WorkflowNode } from '@/aiworkflow/types'
import {
	normalizeText,
	isImageInputAnchor,
	getEffectiveImageUrl,
} from '@/views/AIWorkflow/node-business/tripo3d/useAIWorkflowImageNodeTripo3D'
import type { Tripo3DStoreLike } from '@/views/AIWorkflow/node-business/tripo3d/types'

describe('useAIWorkflowImageNodeTripo3D pure functions', () => {
	describe('normalizeText', () => {
		it('should trim whitespace from strings', () => {
			expect(normalizeText('  hello  ')).toBe('hello')
			expect(normalizeText('hello world')).toBe('hello world')
		})

		it('should handle null/undefined/empty values', () => {
			expect(normalizeText(null)).toBe('')
			expect(normalizeText(undefined)).toBe('')
			expect(normalizeText('')).toBe('')
		})

		it('should convert non-string values to strings', () => {
			expect(normalizeText(123)).toBe('123')
			expect(normalizeText(true)).toBe('true')
		})
	})

	describe('isImageInputAnchor', () => {
		it('should return true for standard image anchor IDs', () => {
			expect(isImageInputAnchor('in-image')).toBe(true)
			expect(isImageInputAnchor('in-resource')).toBe(true)
			expect(isImageInputAnchor('in-0')).toBe(true)
		})

		it('should return true for numbered image anchors', () => {
			expect(isImageInputAnchor('in-image-0')).toBe(true)
			expect(isImageInputAnchor('in-image-1')).toBe(true)
			expect(isImageInputAnchor('in-image-2')).toBe(true)
			expect(isImageInputAnchor('in-image-10')).toBe(true)
		})

		it('should return false for non-image anchors', () => {
			expect(isImageInputAnchor('in-prompt')).toBe(false)
			expect(isImageInputAnchor('in-text')).toBe(false)
			expect(isImageInputAnchor('out-image')).toBe(false)
			expect(isImageInputAnchor('')).toBe(false)
		})

		it('should handle whitespace-padded anchor IDs', () => {
			expect(isImageInputAnchor('  in-image  ')).toBe(true)
		})
	})

	describe('getEffectiveImageUrl', () => {
		const createMockStore = (resourcesById: Record<string, Record<string, unknown>> = {}): Tripo3DStoreLike => ({
			state: {
				nodesById: {},
				resourcesById,
			},
		} as unknown as Tripo3DStoreLike)

		it('should return resource URL when resourceId is present', () => {
			const node = { resourceId: 'res-123' } as unknown as WorkflowNode
			const store = createMockStore({
				'res-123': { url: 'https://example.com/resource.png' },
			})
			expect(getEffectiveImageUrl(node, store)).toBe('https://example.com/resource.png')
		})

		it('should return lastGeneratedImageUrl when no resourceId', () => {
			const node = {
				imageSettings: {
					lastGeneratedImageUrl: 'https://example.com/last-gen.png',
				},
			} as unknown as WorkflowNode
			const store = createMockStore()
			expect(getEffectiveImageUrl(node, store)).toBe('https://example.com/last-gen.png')
		})

		it('should return tripo3d preferredUrl when no higher-priority URL', () => {
			const node = {
				imageSettings: {
					tripo3dImageSettings: {
						outputSummary: {
							preferredUrl: 'https://example.com/tripo3d.png',
						},
					},
				},
			} as unknown as WorkflowNode
			const store = createMockStore()
			expect(getEffectiveImageUrl(node, store)).toBe('https://example.com/tripo3d.png')
		})

		it('should fall back to nodeResourceUrl function when provided', () => {
			const node = {} as WorkflowNode
			const store = createMockStore()
			const nodeResourceUrl = (n: WorkflowNode) => 'https://example.com/fallback.png'
			expect(getEffectiveImageUrl(node, store, nodeResourceUrl)).toBe('https://example.com/fallback.png')
		})

		it('should return null when no URL is available', () => {
			const node = {} as WorkflowNode
			const store = createMockStore()
			expect(getEffectiveImageUrl(node, store)).toBeNull()
		})

		it('should prioritize resource URL over lastGeneratedImageUrl', () => {
			const node = {
				resourceId: 'res-123',
				imageSettings: {
					lastGeneratedImageUrl: 'https://example.com/last-gen.png',
				},
			} as unknown as WorkflowNode
			const store = createMockStore({
				'res-123': { url: 'https://example.com/resource.png' },
			})
			expect(getEffectiveImageUrl(node, store)).toBe('https://example.com/resource.png')
		})

		it('should prioritize lastGeneratedImageUrl over tripo3d preferredUrl', () => {
			const node = {
				imageSettings: {
					lastGeneratedImageUrl: 'https://example.com/last-gen.png',
					tripo3dImageSettings: {
						outputSummary: {
							preferredUrl: 'https://example.com/tripo3d.png',
						},
					},
				},
			} as unknown as WorkflowNode
			const store = createMockStore()
			expect(getEffectiveImageUrl(node, store)).toBe('https://example.com/last-gen.png')
		})
	})
})
