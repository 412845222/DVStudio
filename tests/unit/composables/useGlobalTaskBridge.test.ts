import { describe, it, expect } from 'vitest'
import {
	makeClientRequestId,
	detectCategoryFromNodeType,
	getLabelForCategory,
	safeStr,
	getErrorMessage,
	TERMINAL_TASK_STATUSES
} from '../../../src/composables/useGlobalTaskBridge'

describe('useGlobalTaskBridge pure functions', () => {
	describe('makeClientRequestId', () => {
		it('generates unique ids for consecutive calls', () => {
			const ids = new Set<string>()
			for (let i = 0; i < 100; i++) {
				const id = makeClientRequestId('node-abc', 'seedance')
				expect(ids.has(id)).toBe(false)
				ids.add(id)
			}
			expect(ids.size).toBe(100)
		})

		it('includes provider prefix truncated to 8 chars', () => {
			const id = makeClientRequestId('n1', 'seedance')
			expect(id.startsWith('seedance-')).toBe(true)
		})

		it('truncates long provider to 8 chars', () => {
			const id = makeClientRequestId('n1', 'alongprovidername')
			expect(id.startsWith('alongpro-')).toBe(true)
		})

		it('uses "nonode" and "noprov" fallback for empty inputs', () => {
			const id = makeClientRequestId('', '')
			expect(id.startsWith('noprov-nonode-')).toBe(true)
		})

		it('truncates nodeId to 12 chars', () => {
			const longNode = 'node-abcdefghijklmnop'
			const id = makeClientRequestId(longNode, 'p')
			const parts = id.split('-')
			expect(parts[1].length).toBeLessThanOrEqual(12)
		})

		it('format is pid-nid-ts-rand (4 segments)', () => {
			const id = makeClientRequestId('n1', 'p')
			const parts = id.split('-')
			expect(parts.length).toBe(4)
		})
	})

	describe('detectCategoryFromNodeType', () => {
		it('detects 3d category', () => {
			expect(detectCategoryFromNodeType('model3d')).toBe('3d')
			expect(detectCategoryFromNodeType('Model3D')).toBe('3d')
			expect(detectCategoryFromNodeType('3d-model')).toBe('3d')
			expect(detectCategoryFromNodeType('meshy-3d')).toBe('3d')
		})

		it('detects video category', () => {
			expect(detectCategoryFromNodeType('video')).toBe('video')
			expect(detectCategoryFromNodeType('VideoNode')).toBe('video')
			expect(detectCategoryFromNodeType('seedance-video')).toBe('video')
		})

		it('detects custom/text category', () => {
			expect(detectCategoryFromNodeType('text')).toBe('custom')
			expect(detectCategoryFromNodeType('TextMerge')).toBe('custom')
			expect(detectCategoryFromNodeType('bytedance-text')).toBe('custom')
		})

		it('defaults to image', () => {
			expect(detectCategoryFromNodeType('image')).toBe('image')
			expect(detectCategoryFromNodeType('')).toBe('image')
			expect(detectCategoryFromNodeType('unknown-type')).toBe('image')
		})
	})

	describe('getLabelForCategory', () => {
		it('returns known provider+category labels', () => {
			expect(getLabelForCategory('video', 'seedance')).toBe('Seedance视频')
			expect(getLabelForCategory('3d', 'meshy')).toBe('Meshy 3D')
			expect(getLabelForCategory('image', 'jimeng')).toBe('Jimeng图片')
			expect(getLabelForCategory('3d', 'tripo3d')).toBe('Tripo3D')
		})

		it('falls back to provider + catLabel when unknown', () => {
			expect(getLabelForCategory('video', 'acme')).toBe('acme视频')
			expect(getLabelForCategory('3d', 'acme')).toBe('acme3D模型')
		})

		it('returns category-only label when provider is empty', () => {
			expect(getLabelForCategory('image', '')).toBe('图片')
			expect(getLabelForCategory('video', '')).toBe('视频')
			expect(getLabelForCategory('3d', '')).toBe('3D模型')
			expect(getLabelForCategory('custom', '')).toBe('文本')
		})
	})

	describe('safeStr', () => {
		it('returns default for null/undefined/empty', () => {
			expect(safeStr(null)).toBe('')
			expect(safeStr(undefined)).toBe('')
			expect(safeStr('')).toBe('')
			expect(safeStr('   ')).toBe('')
			expect(safeStr(null, 'def')).toBe('def')
		})

		it('trims whitespace', () => {
			expect(safeStr('  hello  ')).toBe('hello')
		})

		it('converts numbers to string', () => {
			expect(safeStr(123)).toBe('123')
		})
	})

	describe('getErrorMessage', () => {
		it('extracts message from Error', () => {
			expect(getErrorMessage(new Error('boom'))).toBe('boom')
		})

		it('returns string as-is', () => {
			expect(getErrorMessage('plain text')).toBe('plain text')
		})

		it('extracts message from object with message property', () => {
			expect(getErrorMessage({ message: 'obj msg' })).toBe('obj msg')
		})

		it('stringifies other values', () => {
			expect(getErrorMessage(42)).toBe('42')
			expect(getErrorMessage(null)).toBe('null')
		})
	})

	describe('TERMINAL_TASK_STATUSES', () => {
		it('contains terminal statuses only', () => {
			expect(TERMINAL_TASK_STATUSES.has('completed')).toBe(true)
			expect(TERMINAL_TASK_STATUSES.has('failed')).toBe(true)
			expect(TERMINAL_TASK_STATUSES.has('cancelled')).toBe(true)
			expect(TERMINAL_TASK_STATUSES.has('dismissed')).toBe(true)
			expect(TERMINAL_TASK_STATUSES.has('running')).toBe(false)
			expect(TERMINAL_TASK_STATUSES.has('submitting')).toBe(false)
			expect(TERMINAL_TASK_STATUSES.has('pending')).toBe(false)
		})
	})
})
