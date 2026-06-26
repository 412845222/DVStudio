import { DwebCanvasGL, DwebVideoScene } from '../engine/webgl'
import { computeSceneStateAtFrame } from '../core/export/computeSceneStateAtFrame'
import type { VideoSceneState } from '../core/scene'

type InitMsg = {
	type: 'init'
	jobId: string
	width: number
	height: number
	frameCount: number
	uploadMode: 'disk' | 'pipe'
	ignoreStageBackground: boolean
	stageBackground: {
		type: 'color' | 'image'
		color: string
		opacity: number
		imageSrc: string
		imageFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
		repeat: boolean
	}
	baseSceneState: VideoSceneState
	timelineState: any
}

type RenderUploadMsg = { type: 'renderUpload'; frameIndex: number }

type RenderUploadBatchMsg = { type: 'renderUploadBatch'; startIndex: number; count: number }

type InMsg = InitMsg | RenderUploadMsg | RenderUploadBatchMsg

type OutMsg =
	| { type: 'ready' }
	| { type: 'uploaded'; frameIndex: number }
	| { type: 'uploadedBatch'; startIndex: number; count: number }
	| { type: 'error'; frameIndex: number; message: string }

let jobId = ''
let width = 0
let height = 0
let frameCount = 0
let uploadMode: 'disk' | 'pipe' = 'disk'
let stageBackground: any = null
let ignoreStageBackground = false
let baseSceneState: VideoSceneState | null = null
let timelineState: any = null

let canvas: DwebCanvasGL | null = null
let scene: DwebVideoScene | null = null
let lastImageKey = ''

const ensureInit = () => {
	if (!canvas || !scene || !baseSceneState || !timelineState || !jobId)
		throw new Error('worker 未初始化')
}

const uploadFramePng = async (jobId0: string, frameIndex: number, blob: Blob) => {
	const fi = Math.floor(frameIndex)
	const fd = new FormData()
	fd.set('frameIndex', String(fi))
	fd.set('file', blob, `frame_${String(fi).padStart(6, '0')}.png`)
	const url = `/api/export/jobs/${encodeURIComponent(jobId0)}/frames`
	const res = await fetch(url, {
		method: 'POST',
		body: fd
	})
	if (!res.ok) {
		const text = await res.text().catch(() => '')
		throw new Error(
			`上传 PNG 帧失败：${res.status} ${res.statusText} ${(text || '').slice(0, 200)}`
		)
	}
}

const uploadFramesRawBatch = async (
	jobId0: string,
	startIndex: number,
	count: number,
	bytes: Uint8Array
) => {
	const si = Math.floor(Number(startIndex) || 0)
	const c = Math.floor(Number(count) || 0)
	const url = `/api/export/jobs/${encodeURIComponent(jobId0)}/frames:raw-batch?startIndex=${encodeURIComponent(String(si))}&count=${encodeURIComponent(String(c))}`
	const buf = bytes.buffer
	const body: ArrayBuffer =
		buf instanceof ArrayBuffer
			? buf.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
			: new Uint8Array(bytes).buffer
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/octet-stream' },
		body
	})
	if (!res.ok) {
		const text = await res.text().catch(() => '')
		throw new Error(
			`上传 raw batch 失败：${res.status} ${res.statusText} ${(text || '').slice(0, 200)}`
		)
	}
}

self.onmessage = async (ev: MessageEvent<InMsg>) => {
	const msg = ev.data
	try {
		if (msg.type === 'init') {
			jobId = msg.jobId
			width = Math.max(1, Math.round(msg.width))
			height = Math.max(1, Math.round(msg.height))
			frameCount = Math.max(1, Math.floor(msg.frameCount))
			uploadMode = msg.uploadMode
			ignoreStageBackground = !!msg.ignoreStageBackground
			stageBackground = msg.stageBackground
			baseSceneState = msg.baseSceneState
			timelineState = msg.timelineState

			if (typeof OffscreenCanvas === 'undefined')
				throw new Error('当前环境不支持 OffscreenCanvas，无法在 worker 内渲染')
			const offscreen = new OffscreenCanvas(width, height)
			canvas = new DwebCanvasGL(offscreen)
			scene = new DwebVideoScene()
			scene.setStageSize({ width, height })
			scene.setStageBackground(stageBackground)
			if (ignoreStageBackground) {
				scene.setExportTransparent(true)
			}
			canvas.setSize(width, height, 1)
			canvas.fitToStage({ width, height }, 0, { left: 0, top: 0, right: 0, bottom: 0 })
			canvas.setScene(scene)
			;(self as any).postMessage({ type: 'ready' } satisfies OutMsg)
			return
		}

		if (msg.type === 'renderUpload') {
			ensureInit()
			const fi = Math.floor(msg.frameIndex)
			if (!(fi >= 0 && fi < frameCount)) throw new Error('frameIndex 越界')

			const stateAt = computeSceneStateAtFrame(baseSceneState!, timelineState, fi)
			scene!.setState(stateAt)
			const images = scene!.collectImageSources()
			const imageKey = images
				.map((item) => `${item.wrap}|${item.src}`)
				.sort()
				.join('||')
			if (imageKey !== lastImageKey) {
				lastImageKey = imageKey
				await canvas!.preloadImages(images, { timeoutMs: 8000 })
			}
			if (uploadMode === 'pipe') {
				const cap = canvas!.captureRgbaBytesFromScreenRect({ x: 0, y: 0, width, height })
				if (!cap?.pixels) throw new Error('抓帧失败（capture rgba bytes 返回空）')
				await uploadFramesRawBatch(jobId, fi, 1, cap.pixels)
			} else {
				canvas!.render()
				const cap = await canvas!.capturePngBlobFromScreenRect({ x: 0, y: 0, width, height })
				if (!cap?.blob) throw new Error('抓帧失败（capture png blob 返回空）')
				await uploadFramePng(jobId, fi, cap.blob)
			}
			;(self as any).postMessage({ type: 'uploaded', frameIndex: fi } satisfies OutMsg)
			return
		}

		if (msg.type === 'renderUploadBatch') {
			ensureInit()
			if (uploadMode !== 'pipe') throw new Error('renderUploadBatch 仅支持 pipe 模式')
			const si = Math.floor(msg.startIndex)
			const c = Math.floor(msg.count)
			if (!(si >= 0 && si < frameCount)) throw new Error('startIndex 越界')
			if (!(c > 0 && si + c <= frameCount)) throw new Error('count 越界')

			const frameBytes = width * height * 4
			const out = new Uint8Array(frameBytes * c)
			for (let i = 0; i < c; i++) {
				const fi = si + i
				const stateAt = computeSceneStateAtFrame(baseSceneState!, timelineState, fi)
				scene!.setState(stateAt)
				const images = scene!.collectImageSources()
				const imageKey = images
					.map((item) => `${item.wrap}|${item.src}`)
					.sort()
					.join('||')
				if (imageKey !== lastImageKey) {
					lastImageKey = imageKey
					await canvas!.preloadImages(images, { timeoutMs: 8000 })
				}
				const cap = canvas!.captureRgbaBytesFromScreenRect({ x: 0, y: 0, width, height })
				if (!cap?.pixels) throw new Error('抓帧失败（capture rgba bytes 返回空）')
				if (cap.pixels.byteLength !== frameBytes) throw new Error('raw 帧长度异常')
				out.set(cap.pixels, i * frameBytes)
			}
			await uploadFramesRawBatch(jobId, si, c, out)
			;(self as any).postMessage({
				type: 'uploadedBatch',
				startIndex: si,
				count: c
			} satisfies OutMsg)
			return
		}
	} catch (e) {
		const fi = (msg as any)?.frameIndex
		;(self as any).postMessage({
			type: 'error',
			frameIndex: typeof fi === 'number' ? fi : -1,
			message: String((e as any)?.message ?? e)
		} satisfies OutMsg)
	}
}

export {}
