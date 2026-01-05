import { DwebCanvasGL, DwebVideoScene } from '../engine/webgl'
import { computeSceneStateAtFrame } from '../core/export/computeSceneStateAtFrame'
import type { VideoSceneState } from '../core/scene'

type InitMsg = {
	type: 'init'
	jobId: string
	width: number
	height: number
	frameCount: number
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

type InMsg = InitMsg | RenderUploadMsg

type OutMsg =
	| { type: 'ready' }
	| { type: 'uploaded'; frameIndex: number }
	| { type: 'error'; frameIndex: number; message: string }

let jobId = ''
let width = 0
let height = 0
let frameCount = 0
let stageBackground: any = null
let ignoreStageBackground = false
let baseSceneState: VideoSceneState | null = null
let timelineState: any = null

let canvas: DwebCanvasGL | null = null
let scene: DwebVideoScene | null = null

const ensureInit = () => {
	if (!canvas || !scene || !baseSceneState || !timelineState || !jobId) throw new Error('worker 未初始化')
}

const uploadFrame = async (jobId0: string, frameIndex: number, blob: Blob) => {
	const fd = new FormData()
	fd.set('frameIndex', String(Math.floor(frameIndex)))
	fd.set('file', blob, `frame_${String(Math.floor(frameIndex)).padStart(6, '0')}.png`)
	const res = await fetch(`/api/export/jobs/${encodeURIComponent(jobId0)}/frames`, { method: 'POST', body: fd })
	if (!res.ok) {
		const text = await res.text().catch(() => '')
		throw new Error(`上传帧失败：${res.status} ${res.statusText} ${(text || '').slice(0, 200)}`)
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
			ignoreStageBackground = !!msg.ignoreStageBackground
			stageBackground = msg.stageBackground
			baseSceneState = msg.baseSceneState
			timelineState = msg.timelineState

			if (typeof OffscreenCanvas === 'undefined') throw new Error('当前环境不支持 OffscreenCanvas，无法在 worker 内渲染')
			const off = new OffscreenCanvas(width, height)
			canvas = new DwebCanvasGL(off)
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
			canvas!.render()
			const cap = await canvas!.capturePngBlobFromScreenRect({ x: 0, y: 0, width, height })
			if (!cap) throw new Error('抓帧失败（capture 返回空）')
			await uploadFrame(jobId, fi, cap.blob)
			;(self as any).postMessage({ type: 'uploaded', frameIndex: fi } satisfies OutMsg)
			return
		}
	} catch (e) {
		const fi = (msg as any)?.frameIndex
		;(self as any).postMessage({ type: 'error', frameIndex: typeof fi === 'number' ? fi : -1, message: String((e as any)?.message ?? e) } satisfies OutMsg)
	}
}

export {}
