import type { DirectorSceneViewer } from '../viewers/DirectorSceneViewer'
import {
	directorConsoleCreateTempDir,
	directorConsoleWriteFrame,
	directorConsoleExportVideo,
	directorConsoleCleanupTempDir,
	directorConsoleNotifyExportDone
} from '../../../electronBridge'
import { BlueprintProjectService } from '../../../network/BlueprintProjectService'

export type ExportVideoStage = 'idle' | 'capturing' | 'encoding' | 'importing' | 'done' | 'error'

export interface ExportVideoProgress {
	stage: ExportVideoStage
	/** 0-100 */
	percent: number
	message?: string
}

export interface ExportVideoOptions {
	fps: number
	totalFrames: number
	nodeId: string
	projectId?: number
	onProgress?: (p: ExportVideoProgress) => void
}

export interface ExportVideoResult {
	ok: boolean
	error?: string
	assetUrl?: string
	assetName?: string
}

const LOG_TAG = '[DirectorVideoExport]'

/**
 * [v5.0] 导演控制台导出视频服务。
 *
 * 流程：逐帧 seek + 捕获预览画面 → 写入临时目录 → ffmpeg 编码 MP4 →
 *       导入项目资产库 → 通知主窗口自动布线下游视频节点。
 */
export class DirectorVideoExportService {
	private sceneViewer: DirectorSceneViewer
	private projectService = new BlueprintProjectService()

	constructor(sceneViewer: DirectorSceneViewer) {
		this.sceneViewer = sceneViewer
	}

	async exportVideo(options: ExportVideoOptions): Promise<ExportVideoResult> {
		const { fps, totalFrames, nodeId, projectId, onProgress } = options
		const report = (stage: ExportVideoStage, percent: number, message?: string) =>
			onProgress?.({ stage, percent, message })

		console.log(`${LOG_TAG} start`, { nodeId, projectId, fps, totalFrames })

		// 保存当前帧与预览尺寸，导出后恢复
		const originalFrame = this.sceneViewer.getCurrentFrame()
		const originalPreviewSize = this.sceneViewer.getPreviewSize()
		let jobId: string | null = null
		let previewResized = false

		try {
			// 1. 创建临时目录
			report('capturing', 0, '准备导出...')
			const tmp = await directorConsoleCreateTempDir()
			console.log(`${LOG_TAG} temp dir created`, tmp)
			if (!tmp.ok || !tmp.jobId) {
				return { ok: false, error: tmp.error || '无法创建临时目录' }
			}
			jobId = tmp.jobId

			// 1.5 提升预览渲染分辨率至至少 720P（高度 >= 720），保持原始宽高比
			// Seedance R2V 要求视频像素数 >= 407696（约 720x566 或 854x478），
			// 使用 720 高度可确保所有常见宽高比都满足像素数要求（如 3:2 → 1080x720=777600px）。
			const MIN_HEIGHT = 720
			const origW = originalPreviewSize.width || 240
			const origH = originalPreviewSize.height || 160
			const scale = Math.max(1, MIN_HEIGHT / origH)
			const exportW = Math.max(1, Math.floor(origW * scale))
			const exportH = Math.max(1, Math.floor(origH * scale))
			console.log(`${LOG_TAG} preview resize`, {
				original: { w: origW, h: origH },
				export: { w: exportW, h: exportH }
			})
			this.sceneViewer.setPreviewSize(exportW, exportH)
			previewResized = true

			// 2. 逐帧捕获
			console.log(`${LOG_TAG} capturing frames: ${totalFrames}`)
			for (let f = 0; f < totalFrames; f++) {
				this.sceneViewer.setCurrentFrame(f)
				const blob = await this.sceneViewer.capturePreviewFrame()
				if (!blob) {
					console.error(`${LOG_TAG} frame capture failed at frame ${f}`)
					return { ok: false, error: `第 ${f} 帧捕获失败` }
				}
				const dataUrl = await blobToBase64(blob)
				const wr = await directorConsoleWriteFrame({
					jobId: jobId!,
					frameIndex: f,
					data: dataUrl
				})
				if (!wr.ok) {
					console.error(`${LOG_TAG} frame write failed at frame ${f}`, wr.error)
					return { ok: false, error: wr.error || `第 ${f} 帧写入失败` }
				}
				const pct = Math.round(((f + 1) / totalFrames) * 100)
				report('capturing', pct, `捕获帧 ${f + 1}/${totalFrames}`)
			}
			console.log(`${LOG_TAG} all frames captured`)

			// 3. ffmpeg 编码
			report('encoding', 0, '正在编码视频...')
			const outputName = `director_export_${Date.now()}.mp4`
			console.log(`${LOG_TAG} encoding with ffmpeg`, { jobId, fps, outputName })
			const enc = await directorConsoleExportVideo({
				jobId: jobId!,
				fps,
				outputName
			})
			console.log(`${LOG_TAG} ffmpeg result`, enc)
			if (!enc.ok || !enc.outputPath) {
				return { ok: false, error: enc.error || '视频编码失败' }
			}
			report('encoding', 100, '编码完成')

			// 4. 导入项目资产库
			report('importing', 0, '正在导入资产...')
			console.log(`${LOG_TAG} importing asset`, {
				sourcePath: enc.outputPath,
				projectId,
				name: outputName
			})
			const imported = await this.projectService.importAsset({
				kind: 'video',
				name: outputName,
				sourcePath: enc.outputPath,
				projectId: projectId ?? null
			})
			console.log(`${LOG_TAG} import result`, imported)
			if (!imported.ok) {
				return { ok: false, error: imported.error || '资产导入失败' }
			}
			const asset = imported.asset
			report('importing', 100, '导入完成')

			// 5. 通知主窗口自动布线
			console.log(`${LOG_TAG} notifying export done`, {
				nodeId,
				assetUrl: asset.url,
				assetName: asset.name
			})
			directorConsoleNotifyExportDone({
				nodeId,
				assetUrl: asset.url,
				assetName: asset.name
			})

			report('done', 100, '导出完成')
			console.log(`${LOG_TAG} export completed successfully`)
			return {
				ok: true,
				assetUrl: asset.url,
				assetName: asset.name
			}
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e)
			console.error(`${LOG_TAG} unexpected error`, e)
			report('error', 0, msg)
			return { ok: false, error: msg }
		} finally {
			// 恢复预览渲染分辨率
			if (previewResized) {
				try {
					this.sceneViewer.setPreviewSize(originalPreviewSize.width, originalPreviewSize.height)
				} catch (e) {
					console.warn(`${LOG_TAG} restore preview size failed`, e)
				}
			}
			// 恢复原始帧
			this.sceneViewer.setCurrentFrame(originalFrame)
			// 清理临时目录
			if (jobId) {
				console.log(`${LOG_TAG} cleaning up temp dir`, jobId)
				void directorConsoleCleanupTempDir({ jobId })
			}
		}
	}
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => {
			const result = reader.result
			if (typeof result === 'string') {
				// data:image/png;base64,xxxx → 只取 base64 部分
				const commaIdx = result.indexOf(',')
				resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result)
			} else {
				reject(new Error('blobToBase64: invalid result type'))
			}
		}
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(blob)
	})
}
