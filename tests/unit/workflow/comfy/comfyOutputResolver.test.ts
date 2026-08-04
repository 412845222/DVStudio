import { describe, it, expect } from 'vitest'
import {
	inferMediaKind,
	comfyAnchorNodeIdFromAnchorId,
	comfyOutputForAnchor,
} from '@/views/AIWorkflow/node-business/comfy/comfyOutputResolver'
import type { ComfyLocalizedOutput } from '@/views/AIWorkflow/node-business/comfy/comfyOutputResolver'

describe('comfyOutputResolver', () => {
	describe('inferMediaKind', () => {
		it('returns null for null/undefined input', () => {
			expect(inferMediaKind(null)).toBeNull()
			expect(inferMediaKind(undefined)).toBeNull()
		})

		it('returns explicit kind when set to image/video/model3d', () => {
			expect(inferMediaKind({ kind: 'image' })).toBe('image')
			expect(inferMediaKind({ kind: 'video' })).toBe('video')
			expect(inferMediaKind({ kind: 'model3d' })).toBe('model3d')
		})

		it('is case-insensitive for explicit kind', () => {
			expect(inferMediaKind({ kind: 'IMAGE' })).toBe('image')
			expect(inferMediaKind({ kind: 'Video' })).toBe('video')
			expect(inferMediaKind({ kind: 'Model3D' })).toBe('model3d')
		})

		it('infers image from URL with image extension', () => {
			expect(inferMediaKind({ url: 'http://localhost:8188/view?filename=result.png&subfolder=' })).toBe('image')
			expect(inferMediaKind({ url: 'http://localhost:8188/view?filename=output.jpg' })).toBe('image')
			expect(inferMediaKind({ url: 'http://example.com/path/frame.jpeg' })).toBe('image')
			expect(inferMediaKind({ url: 'http://example.com/preview.webp' })).toBe('image')
		})

		it('infers video from URL with video extension', () => {
			expect(inferMediaKind({ url: 'http://localhost:8188/view?filename=result.mp4&subfolder=' })).toBe('video')
			expect(inferMediaKind({ url: 'http://localhost:8188/view?filename=anim.webm' })).toBe('video')
			expect(inferMediaKind({ url: 'http://example.com/clip.mov' })).toBe('video')
			expect(inferMediaKind({ url: 'http://example.com/video.mkv' })).toBe('video')
			expect(inferMediaKind({ url: 'http://example.com/anim.gif' })).toBe('video')
		})

		it('infers model3d from URL with 3d extension', () => {
			expect(inferMediaKind({ url: 'http://localhost:8188/view?filename=model.glb' })).toBe('model3d')
			expect(inferMediaKind({ url: 'http://example.com/mesh.gltf' })).toBe('model3d')
			expect(inferMediaKind({ url: 'http://example.com/object.fbx' })).toBe('model3d')
			expect(inferMediaKind({ url: 'http://example.com/mesh.obj' })).toBe('model3d')
			expect(inferMediaKind({ url: 'http://example.com/print.stl' })).toBe('model3d')
		})

		it('extracts filename from URL query parameter and infers kind', () => {
			expect(inferMediaKind({ url: 'http://localhost:8188/view?filename=VHS_00001.mp4&type=output&subfolder=' })).toBe('video')
			expect(inferMediaKind({ url: 'http://localhost:8188/view?filename=ComfyUI_00001.png&type=output' })).toBe('image')
		})

		it('handles URL query parameters after extension', () => {
			expect(inferMediaKind({ url: 'http://example.com/file.mp4?t=123' })).toBe('video')
			expect(inferMediaKind({ url: 'http://example.com/image.png?v=1&t=2' })).toBe('image')
		})

		it('returns null for unknown extensions', () => {
			expect(inferMediaKind({ url: 'http://example.com/file.txt' })).toBeNull()
			expect(inferMediaKind({ url: 'http://example.com/data.json' })).toBeNull()
			expect(inferMediaKind({ url: 'http://example.com/endpoint' })).toBeNull()
			expect(inferMediaKind({})).toBeNull()
		})

		it('prefers explicit kind over URL inference', () => {
			expect(inferMediaKind({ kind: 'video', url: 'http://example.com/file.png' })).toBe('video')
			expect(inferMediaKind({ kind: 'image', url: 'http://example.com/file.mp4' })).toBe('image')
		})
	})

	describe('comfyAnchorNodeIdFromAnchorId', () => {
		it('extracts nodeId from out-{nodeId} format', () => {
			expect(comfyAnchorNodeIdFromAnchorId('out-5')).toBe('5')
			expect(comfyAnchorNodeIdFromAnchorId('out-123')).toBe('123')
			expect(comfyAnchorNodeIdFromAnchorId('out-save_image_websafe_001')).toBe('save_image_websafe_001')
		})

		it('returns empty string for generic "out" anchor', () => {
			expect(comfyAnchorNodeIdFromAnchorId('out')).toBe('')
		})

		it('returns empty string for non-matching anchor IDs', () => {
			expect(comfyAnchorNodeIdFromAnchorId('images')).toBe('')
			expect(comfyAnchorNodeIdFromAnchorId('videos')).toBe('')
			expect(comfyAnchorNodeIdFromAnchorId('in-image')).toBe('')
			expect(comfyAnchorNodeIdFromAnchorId('')).toBe('')
		})

		it('trims whitespace from anchorId', () => {
			expect(comfyAnchorNodeIdFromAnchorId('  out-7  ')).toBe('7')
		})
	})

	describe('comfyOutputForAnchor', () => {
		const makeImage = (overrides: Partial<ComfyLocalizedOutput> = {}): ComfyLocalizedOutput => ({
			kind: 'image',
			url: 'http://localhost:8188/view?filename=img.png',
			filename: 'img.png',
			anchorId: 'out-5',
			nodeId: '5',
			...overrides,
		})

		const makeVideo = (overrides: Partial<ComfyLocalizedOutput> = {}): ComfyLocalizedOutput => ({
			kind: 'video',
			url: 'http://localhost:8188/view?filename=vid.mp4',
			filename: 'vid.mp4',
			anchorId: 'out-9',
			nodeId: '9',
			...overrides,
		})

		it('returns media matching anchorId and expected kind', () => {
			const image = makeImage()
			const video = makeVideo()
			const result = comfyOutputForAnchor([image, video], 'out-5', 'image')
			expect(result).toBe(image)
		})

		it('returns media for video anchor when expectedKind is video', () => {
			const image = makeImage()
			const video = makeVideo()
			const result = comfyOutputForAnchor([image, video], 'out-9', 'video')
			expect(result).toBe(video)
		})

		it('falls back to any media matching expected kind when anchorId has no exact match', () => {
			const image = makeImage({ anchorId: 'out-5' })
			const result = comfyOutputForAnchor([image], 'out-99', 'image')
			expect(result).toBe(image)
		})

		it('returns undefined when no outputs match expected kind', () => {
			const image = makeImage()
			const result = comfyOutputForAnchor([image], 'out-5', 'video')
			expect(result).toBeUndefined()
		})

		it('returns undefined for empty outputs array', () => {
			expect(comfyOutputForAnchor([], 'out-5', 'image')).toBeUndefined()
		})

		it('skips media with empty url', () => {
			const emptyUrl = makeImage({ url: '' })
			const validImage = makeImage({ anchorId: 'out-7', nodeId: '7', filename: 'ok.png', url: 'http://localhost/ok.png' })
			const result = comfyOutputForAnchor([emptyUrl, validImage], 'out-5', 'image')
			expect(result).toBe(validImage)
		})
	})
})
