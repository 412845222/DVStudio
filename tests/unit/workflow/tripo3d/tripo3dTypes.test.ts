import { describe, it, expect } from 'vitest'
import {
	isTripo3DImageMode,
	getTripo3DTaskKind,
	getTripo3DSettingString,
	getTripo3DSettingNumber,
	getTripo3DSettingBoolean,
	extractTripo3DTaskResultFields,
	normalizeTripo3DTaskStatus
} from '@/views/AIWorkflow/node-business/tripo3d/types'

describe('tripo3dTypes', () => {
	describe('isTripo3DImageMode', () => {
		it('should return true for image generation modes', () => {
			expect(isTripo3DImageMode('text_to_image')).toBe(true)
			expect(isTripo3DImageMode('image_to_image')).toBe(true)
			expect(isTripo3DImageMode('image_to_multiview')).toBe(true)
		})

		it('should return false for model generation modes', () => {
			expect(isTripo3DImageMode('text_to_model')).toBe(false)
			expect(isTripo3DImageMode('image_to_model')).toBe(false)
			expect(isTripo3DImageMode('multiview_to_model')).toBe(false)
			expect(isTripo3DImageMode('texture')).toBe(false)
			expect(isTripo3DImageMode('refine')).toBe(false)
			expect(isTripo3DImageMode('mesh_segment')).toBe(false)
			expect(isTripo3DImageMode('mesh_smartsegment')).toBe(false)
			expect(isTripo3DImageMode('mesh_complete')).toBe(false)
			expect(isTripo3DImageMode('mesh_decimate')).toBe(false)
			expect(isTripo3DImageMode('models_convert')).toBe(false)
		})

		it('should handle null/undefined/empty values', () => {
			expect(isTripo3DImageMode(null)).toBe(false)
			expect(isTripo3DImageMode(undefined)).toBe(false)
			expect(isTripo3DImageMode('')).toBe(false)
		})
	})

	describe('getTripo3DTaskKind', () => {
		it('should return "image" for image modes', () => {
			expect(getTripo3DTaskKind('text_to_image')).toBe('image')
			expect(getTripo3DTaskKind('image_to_image')).toBe('image')
		})

		it('should return "model" for model modes and post-process modes', () => {
			expect(getTripo3DTaskKind('text_to_model')).toBe('model')
			expect(getTripo3DTaskKind('image_to_model')).toBe('model')
			expect(getTripo3DTaskKind('texture')).toBe('model')
			expect(getTripo3DTaskKind('refine')).toBe('model')
			expect(getTripo3DTaskKind('mesh_segment')).toBe('model')
			expect(getTripo3DTaskKind('mesh_decimate')).toBe('model')
			expect(getTripo3DTaskKind('models_convert')).toBe('model')
		})
	})

	describe('getTripo3DSettingString', () => {
		it('should return trimmed string value', () => {
			const settings = { tripo3dTaskId: '  task-123  ' }
			expect(getTripo3DSettingString(settings, 'tripo3dTaskId')).toBe('task-123')
		})

		it('should return empty string for non-string values', () => {
			expect(getTripo3DSettingString({ val: 123 }, 'val')).toBe('')
			expect(getTripo3DSettingString({ val: true }, 'val')).toBe('')
			expect(getTripo3DSettingString({ val: null }, 'val')).toBe('')
		})

		it('should return empty string for null/undefined settings', () => {
			expect(getTripo3DSettingString(null, 'key')).toBe('')
			expect(getTripo3DSettingString(undefined, 'key')).toBe('')
			expect(getTripo3DSettingString({}, 'key')).toBe('')
		})
	})

	describe('getTripo3DSettingNumber', () => {
		it('should return number value', () => {
			expect(getTripo3DSettingNumber({ val: 42 }, 'val')).toBe(42)
			expect(getTripo3DSettingNumber({ val: 0 }, 'val')).toBe(0)
		})

		it('should return fallback for non-number values', () => {
			expect(getTripo3DSettingNumber({ val: 'abc' }, 'val')).toBe(0)
			expect(getTripo3DSettingNumber({ val: null }, 'val')).toBe(0)
			expect(getTripo3DSettingNumber(null, 'val', 100)).toBe(100)
		})
	})

	describe('getTripo3DSettingBoolean', () => {
		it('should return boolean value', () => {
			expect(getTripo3DSettingBoolean({ val: true }, 'val')).toBe(true)
			expect(getTripo3DSettingBoolean({ val: false }, 'val')).toBe(false)
		})

		it('should return fallback for non-boolean values', () => {
			expect(getTripo3DSettingBoolean({ val: 'true' }, 'val')).toBe(false)
			expect(getTripo3DSettingBoolean(null, 'val', true)).toBe(true)
		})
	})

	describe('normalizeTripo3DTaskStatus', () => {
		it('should normalize success statuses to "succeeded"', () => {
			expect(normalizeTripo3DTaskStatus('success')).toBe('succeeded')
			expect(normalizeTripo3DTaskStatus('succeeded')).toBe('succeeded')
			expect(normalizeTripo3DTaskStatus('completed')).toBe('succeeded')
			expect(normalizeTripo3DTaskStatus('SUCCESS')).toBe('succeeded')
		})

		it('should normalize running statuses to "running"', () => {
			expect(normalizeTripo3DTaskStatus('running')).toBe('running')
			expect(normalizeTripo3DTaskStatus('in_progress')).toBe('running')
			expect(normalizeTripo3DTaskStatus('processing')).toBe('running')
		})

		it('should normalize failure statuses to "failed"', () => {
			expect(normalizeTripo3DTaskStatus('failed')).toBe('failed')
			expect(normalizeTripo3DTaskStatus('error')).toBe('failed')
		})

		it('should normalize cancelled statuses to "cancelled"', () => {
			expect(normalizeTripo3DTaskStatus('cancelled')).toBe('cancelled')
			expect(normalizeTripo3DTaskStatus('canceled')).toBe('cancelled')
		})

		it('should handle other statuses', () => {
			expect(normalizeTripo3DTaskStatus('queued')).toBe('queued')
			expect(normalizeTripo3DTaskStatus('pending')).toBe('pending')
		})

		it('should return "idle" for unknown/invalid statuses', () => {
			expect(normalizeTripo3DTaskStatus(null)).toBe('idle')
			expect(normalizeTripo3DTaskStatus(undefined)).toBe('idle')
			expect(normalizeTripo3DTaskStatus('')).toBe('idle')
			expect(normalizeTripo3DTaskStatus('unknown')).toBe('idle')
		})
	})

	describe('extractTripo3DTaskResultFields', () => {
		it('should extract fields from top-level response', () => {
			const raw = {
				taskId: 'task-001',
				mode: 'text_to_model',
				status: 'success',
				progress: 100,
				thumbnailUrl: 'https://example.com/thumb.jpg',
				modelUrl: 'https://example.com/model.glb',
				statusText: 'Done',
				errorMessage: ''
			}
			const result = extractTripo3DTaskResultFields(raw)
			expect(result.taskId).toBe('task-001')
			expect(result.mode).toBe('text_to_model')
			expect(result.status).toBe('success')
			expect(result.progress).toBe(100)
			expect(result.thumbnailUrl).toBe('https://example.com/thumb.jpg')
			expect(result.modelUrl).toBe('https://example.com/model.glb')
		})

		it('should extract fields from nested output object (Tripo3D API format)', () => {
			const raw = {
				input: { task_id: 'task-002' },
				output: {
					id: 'task-002',
					type: 'texture',
					status: 'succeeded',
					progress: 100,
					thumbnail: { url: 'https://example.com/tex-thumb.png' },
					model: { url: 'https://example.com/textured.glb', glb: 'https://example.com/tex.glb' }
				}
			}
			const result = extractTripo3DTaskResultFields(raw)
			expect(result.taskId).toBe('task-002')
			expect(result.mode).toBe('texture')
			expect(result.status).toBe('succeeded')
			expect(result.thumbnailUrl).toBe('https://example.com/tex-thumb.png')
			expect(result.modelUrl).toContain('textured.glb')
		})

		it('should handle null/undefined input gracefully', () => {
			const result = extractTripo3DTaskResultFields(null)
			expect(result.taskId).toBe('')
			expect(result.mode).toBe('')
			expect(result.progress).toBe(0)
			expect(Array.isArray(result.imageUrls)).toBe(true)
		})

		it('should collect image URLs from output', () => {
			const raw = {
				taskId: 'img-001',
				mode: 'text_to_image',
				status: 'success',
				progress: 100,
				output: {
					images: [{ url: 'https://example.com/img1.png' }, { url: 'https://example.com/img2.jpg' }]
				}
			}
			const result = extractTripo3DTaskResultFields(raw)
			expect(result.taskId).toBe('img-001')
			expect(result.mode).toBe('text_to_image')
			expect(result.imageUrls.length).toBeGreaterThanOrEqual(2)
			expect(result.imageUrls).toContain('https://example.com/img1.png')
		})

		it('should deduplicate image URLs', () => {
			const raw = {
				taskId: 'img-002',
				mode: 'text_to_image',
				status: 'success',
				progress: 100,
				output: {
					image_urls: ['https://example.com/dup.png', 'https://example.com/dup.png']
				}
			}
			const result = extractTripo3DTaskResultFields(raw)
			const dupCount = result.imageUrls.filter((u) => u === 'https://example.com/dup.png').length
			expect(dupCount).toBe(1)
		})
	})
})
