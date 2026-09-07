import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DirectorVideoExportService } from '@/ui/DirectorConsole/services/DirectorVideoExportService'

// Fake DirectorSceneViewer with controlled capture behavior
class FakeSceneViewer {
	currentFrame = 0
	previewSize = { width: 240, height: 160 }
	calls: string[] = []
	frameCount = 0

	getCurrentFrame() {
		return this.currentFrame
	}
	setCurrentFrame(f: number) {
		this.calls.push(`setCurrentFrame:${f}`)
		this.currentFrame = f
	}
	getPreviewSize() {
		return this.previewSize
	}
	setPreviewSize(w: number, h: number) {
		this.calls.push(`setPreviewSize:${w}x${h}`)
		this.previewSize = { width: w, height: h }
	}
	async capturePreviewFrame(): Promise<Blob | null> {
		this.calls.push(`capture:${this.currentFrame}`)
		this.frameCount++
		// Minimal valid PNG blob
		return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })
	}
}

const makeDweb = (overrides: Record<string, any> = {}) => ({
	window: {
		directorConsoleCreateTempDir: vi
			.fn()
			.mockResolvedValue({ ok: true, jobId: 'job-123', tempDir: '/tmp/dc' }),
		directorConsoleWriteFrame: vi.fn().mockResolvedValue({ ok: true }),
		directorConsoleExportVideo: vi
			.fn()
			.mockResolvedValue({ ok: true, outputPath: '/tmp/dc/out.mp4' }),
		directorConsoleCleanupTempDir: vi.fn().mockResolvedValue({ ok: true }),
		directorConsoleNotifyExportDone: vi.fn().mockResolvedValue(undefined),
		...overrides
	}
})

describe('DirectorVideoExportService', () => {
	let originalDweb: any

	beforeEach(() => {
		originalDweb = (window as any).dweb
	})

	afterEach(() => {
		;(window as any).dweb = originalDweb
		vi.restoreAllMocks()
	})

	describe('resolution scaling (360p minimum)', () => {
		it('should upscale preview to height >= 360 while keeping aspect ratio', async () => {
			const viewer = new FakeSceneViewer()
			;(window as any).dweb = makeDweb()
			const service = new DirectorVideoExportService(viewer as any)
			// Mock BlueprintProjectService importAsset
			vi.spyOn((service as any).projectService, 'importAsset').mockResolvedValue({
				ok: true,
				asset: { url: 'dweb://asset/x.mp4', name: 'x.mp4' }
			})

			await service.exportVideo({
				fps: 24,
				totalFrames: 2,
				nodeId: 'n1',
				projectId: 1
			})

			// 240x160 → scale = 360/160 = 2.25 → 540x360
			const resizeCall = viewer.calls.find((c) => c.startsWith('setPreviewSize:'))
			expect(resizeCall).toBe('setPreviewSize:540x360')
		})

		it('should not upscale when preview already taller than 360', async () => {
			const viewer = new FakeSceneViewer()
			viewer.previewSize = { width: 1280, height: 720 }
			;(window as any).dweb = makeDweb()
			const service = new DirectorVideoExportService(viewer as any)
			vi.spyOn((service as any).projectService, 'importAsset').mockResolvedValue({
				ok: true,
				asset: { url: 'dweb://asset/x.mp4', name: 'x.mp4' }
			})

			await service.exportVideo({ fps: 24, totalFrames: 1, nodeId: 'n1', projectId: 1 })

			const resizeCall = viewer.calls.find((c) => c.startsWith('setPreviewSize:'))
			// scale = max(1, 360/720) = 1 → 1280x720
			expect(resizeCall).toBe('setPreviewSize:1280x720')
		})
	})

	describe('frame capture loop', () => {
		it('should seek to each frame and capture in order', async () => {
			const viewer = new FakeSceneViewer()
			;(window as any).dweb = makeDweb()
			const service = new DirectorVideoExportService(viewer as any)
			vi.spyOn((service as any).projectService, 'importAsset').mockResolvedValue({
				ok: true,
				asset: { url: 'dweb://asset/x.mp4', name: 'x.mp4' }
			})

			await service.exportVideo({ fps: 24, totalFrames: 3, nodeId: 'n1', projectId: 1 })

			const seeks = viewer.calls.filter((c) => c.startsWith('setCurrentFrame:'))
			// 3 frames captured + 1 restore to original frame (0) in finally
			expect(seeks.slice(0, 3)).toEqual([
				'setCurrentFrame:0',
				'setCurrentFrame:1',
				'setCurrentFrame:2'
			])
			expect(viewer.frameCount).toBe(3)
		})

		it('should write each captured frame to temp dir', async () => {
			const viewer = new FakeSceneViewer()
			const writeFrame = vi.fn().mockResolvedValue({ ok: true })
			;(window as any).dweb = makeDweb({ directorConsoleWriteFrame: writeFrame })
			const service = new DirectorVideoExportService(viewer as any)
			vi.spyOn((service as any).projectService, 'importAsset').mockResolvedValue({
				ok: true,
				asset: { url: 'dweb://asset/x.mp4', name: 'x.mp4' }
			})

			await service.exportVideo({ fps: 24, totalFrames: 3, nodeId: 'n1', projectId: 1 })

			expect(writeFrame).toHaveBeenCalledTimes(3)
			expect(writeFrame.mock.calls[0][0]).toMatchObject({ jobId: 'job-123', frameIndex: 0 })
			expect(writeFrame.mock.calls[2][0]).toMatchObject({ jobId: 'job-123', frameIndex: 2 })
		})
	})

	describe('error handling', () => {
		it('should return error when temp dir creation fails', async () => {
			const viewer = new FakeSceneViewer()
			;(window as any).dweb = makeDweb({
				directorConsoleCreateTempDir: vi.fn().mockResolvedValue({ ok: false, error: 'no space' })
			})
			const service = new DirectorVideoExportService(viewer as any)

			const result = await service.exportVideo({
				fps: 24,
				totalFrames: 1,
				nodeId: 'n1',
				projectId: 1
			})
			expect(result.ok).toBe(false)
			expect(result.error).toBe('no space')
		})

		it('should return error when frame capture returns null', async () => {
			const viewer = new FakeSceneViewer()
			viewer.capturePreviewFrame = async () => null
			;(window as any).dweb = makeDweb()
			const service = new DirectorVideoExportService(viewer as any)

			const result = await service.exportVideo({
				fps: 24,
				totalFrames: 1,
				nodeId: 'n1',
				projectId: 1
			})
			expect(result.ok).toBe(false)
			expect(result.error).toContain('捕获失败')
		})

		it('should return error when ffmpeg encoding fails', async () => {
			const viewer = new FakeSceneViewer()
			;(window as any).dweb = makeDweb({
				directorConsoleExportVideo: vi
					.fn()
					.mockResolvedValue({ ok: false, error: 'ffmpeg not found' })
			})
			const service = new DirectorVideoExportService(viewer as any)

			const result = await service.exportVideo({
				fps: 24,
				totalFrames: 1,
				nodeId: 'n1',
				projectId: 1
			})
			expect(result.ok).toBe(false)
			expect(result.error).toBe('ffmpeg not found')
		})

		it('should return error when asset import fails', async () => {
			const viewer = new FakeSceneViewer()
			;(window as any).dweb = makeDweb()
			const service = new DirectorVideoExportService(viewer as any)
			vi.spyOn((service as any).projectService, 'importAsset').mockResolvedValue({
				ok: false,
				error: 'projectId invalid'
			})

			const result = await service.exportVideo({
				fps: 24,
				totalFrames: 1,
				nodeId: 'n1',
				projectId: 1
			})
			expect(result.ok).toBe(false)
			expect(result.error).toBe('projectId invalid')
		})
	})

	describe('cleanup & restore', () => {
		it('should restore original frame after export', async () => {
			const viewer = new FakeSceneViewer()
			viewer.currentFrame = 5
			;(window as any).dweb = makeDweb()
			const service = new DirectorVideoExportService(viewer as any)
			vi.spyOn((service as any).projectService, 'importAsset').mockResolvedValue({
				ok: true,
				asset: { url: 'dweb://asset/x.mp4', name: 'x.mp4' }
			})

			await service.exportVideo({ fps: 24, totalFrames: 2, nodeId: 'n1', projectId: 1 })

			expect(viewer.currentFrame).toBe(5)
		})

		it('should restore original preview size after export', async () => {
			const viewer = new FakeSceneViewer()
			viewer.previewSize = { width: 240, height: 160 }
			;(window as any).dweb = makeDweb()
			const service = new DirectorVideoExportService(viewer as any)
			vi.spyOn((service as any).projectService, 'importAsset').mockResolvedValue({
				ok: true,
				asset: { url: 'dweb://asset/x.mp4', name: 'x.mp4' }
			})

			await service.exportVideo({ fps: 24, totalFrames: 1, nodeId: 'n1', projectId: 1 })

			// Last setPreviewSize call should restore original 240x160
			const resizeCalls = viewer.calls.filter((c) => c.startsWith('setPreviewSize:'))
			expect(resizeCalls[resizeCalls.length - 1]).toBe('setPreviewSize:240x160')
		})

		it('should cleanup temp dir even when export fails', async () => {
			const viewer = new FakeSceneViewer()
			const cleanup = vi.fn().mockResolvedValue({ ok: true })
			;(window as any).dweb = makeDweb({
				directorConsoleExportVideo: vi.fn().mockResolvedValue({ ok: false, error: 'fail' }),
				directorConsoleCleanupTempDir: cleanup
			})
			const service = new DirectorVideoExportService(viewer as any)

			await service.exportVideo({ fps: 24, totalFrames: 1, nodeId: 'n1', projectId: 1 })

			expect(cleanup).toHaveBeenCalledWith({ jobId: 'job-123' })
		})
	})

	describe('success flow', () => {
		it('should notify export done with asset info on success', async () => {
			const viewer = new FakeSceneViewer()
			const notifyDone = vi.fn().mockResolvedValue(undefined)
			;(window as any).dweb = makeDweb({ directorConsoleNotifyExportDone: notifyDone })
			const service = new DirectorVideoExportService(viewer as any)
			vi.spyOn((service as any).projectService, 'importAsset').mockResolvedValue({
				ok: true,
				asset: { url: 'dweb://proj/asset.mp4', name: 'director_export.mp4' }
			})

			const result = await service.exportVideo({
				fps: 24,
				totalFrames: 1,
				nodeId: 'n1',
				projectId: 42
			})

			expect(result.ok).toBe(true)
			expect(result.assetUrl).toBe('dweb://proj/asset.mp4')
			expect(notifyDone).toHaveBeenCalledWith({
				nodeId: 'n1',
				assetUrl: 'dweb://proj/asset.mp4',
				assetName: 'director_export.mp4'
			})
		})

		it('should report progress through stages', async () => {
			const viewer = new FakeSceneViewer()
			;(window as any).dweb = makeDweb()
			const service = new DirectorVideoExportService(viewer as any)
			vi.spyOn((service as any).projectService, 'importAsset').mockResolvedValue({
				ok: true,
				asset: { url: 'dweb://x.mp4', name: 'x.mp4' }
			})

			const stages: string[] = []
			await service.exportVideo({
				fps: 24,
				totalFrames: 2,
				nodeId: 'n1',
				projectId: 1,
				onProgress: (p) => stages.push(p.stage)
			})

			expect(stages).toContain('capturing')
			expect(stages).toContain('encoding')
			expect(stages).toContain('importing')
			expect(stages).toContain('done')
		})
	})
})
