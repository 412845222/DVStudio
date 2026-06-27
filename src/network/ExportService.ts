import { isRecord, isString, getErrorMessage } from '../types/utils'

export type ExportFormat = 'mp4' | 'mov'

export type ExportQuality = 'high' | 'medium' | 'low'

export type ExportJobStatus = 'queued' | 'running' | 'done' | 'error'

export type ExportJobInfo = {
	jobId: string
	status: ExportJobStatus
	progress: number
	format: ExportFormat
	width?: number
	height?: number
	fps?: number
	frameCount?: number
	receivedFrames?: number
	fileName?: string
	downloadUrl?: string
	serverPath?: string
	error?: string
}

export type CreateExportJobRequest = {
	format: ExportFormat
	width: number
	height: number
	fps: number
	frameCount: number
	quality?: ExportQuality
	uploadMode?: 'disk' | 'pipe'
	ignoreStageBackground?: boolean
	snapshot?: unknown
}

export type ExportErrorResponse = {
	error?: string
}

const safeJsonParse = (text: string): unknown => {
	try {
		return JSON.parse(text)
	} catch {
		return null
	}
}

const safeJson = async (res: Response): Promise<unknown> => {
	const text = await res.text()
	const parsed = safeJsonParse(text)
	if (parsed === null) {
		const preview = text.slice(0, 200)
		throw new Error(
			`Export API 返回非 JSON：${res.status} ${res.statusText}，body 预览：${preview}`
		)
	}
	return parsed
}

const getErrorFromResponse = (payload: unknown, fallback: string): string => {
	if (isRecord(payload) && isString(payload.error)) {
		return payload.error
	}
	return fallback
}

export const ExportService = {
	async createJob(req: CreateExportJobRequest): Promise<ExportJobInfo> {
		const res = await fetch('/api/export/jobs', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(req)
		})
		if (!res.ok) {
			let errorMessage = `导出失败：${res.status} ${res.statusText}`
			try {
				const payload = await safeJson(res)
				errorMessage = getErrorFromResponse(payload, errorMessage)
			} catch (e: unknown) {
				errorMessage = getErrorMessage(e)
			}
			throw new Error(errorMessage)
		}
		return (await safeJson(res)) as ExportJobInfo
	},

	async uploadFrame(jobId: string, frameIndex: number, blob: Blob): Promise<ExportJobInfo> {
		const fd = new FormData()
		fd.set('frameIndex', String(Math.floor(frameIndex)))
		fd.set('file', blob, `frame_${String(Math.floor(frameIndex)).padStart(6, '0')}.png`)
		const res = await fetch(`/api/export/jobs/${encodeURIComponent(jobId)}/frames`, {
			method: 'POST',
			body: fd
		})
		if (!res.ok) {
			let errorMessage = `上传帧失败：${res.status} ${res.statusText}`
			try {
				const payload = await safeJson(res)
				errorMessage = getErrorFromResponse(payload, errorMessage)
			} catch (e: unknown) {
				errorMessage = getErrorMessage(e)
			}
			throw new Error(errorMessage)
		}
		return (await safeJson(res)) as ExportJobInfo
	},

	async uploadFramesRawBatch(
		jobId: string,
		startIndex: number,
		count: number,
		bytes: Uint8Array
	): Promise<ExportJobInfo> {
		const si = Math.floor(Number(startIndex) || 0)
		const c = Math.floor(Number(count) || 0)
		const url = `/api/export/jobs/${encodeURIComponent(jobId)}/frames:raw-batch?startIndex=${encodeURIComponent(String(si))}&count=${encodeURIComponent(String(c))}`
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
			let errorMessage = `上传 raw batch 失败：${res.status} ${res.statusText}`
			try {
				const payload = await safeJson(res)
				errorMessage = getErrorFromResponse(payload, errorMessage)
			} catch (e: unknown) {
				errorMessage = getErrorMessage(e)
			}
			throw new Error(errorMessage)
		}
		return (await safeJson(res)) as ExportJobInfo
	},

	async finalize(
		jobId: string,
		opts?: {
			format?: ExportFormat
			quality?: ExportQuality
			ignoreStageBackground?: boolean
		}
	): Promise<ExportJobInfo> {
		const res = await fetch(`/api/export/jobs/${encodeURIComponent(jobId)}/finalize`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				format: opts?.format,
				quality: opts?.quality,
				ignoreStageBackground: opts?.ignoreStageBackground
			})
		})
		if (!res.ok) {
			let errorMessage = `触发编码失败：${res.status} ${res.statusText}`
			try {
				const payload = await safeJson(res)
				errorMessage = getErrorFromResponse(payload, errorMessage)
			} catch (e: unknown) {
				errorMessage = getErrorMessage(e)
			}
			throw new Error(errorMessage)
		}
		return (await safeJson(res)) as ExportJobInfo
	},

	openJobStream(jobId: string, onProgress: (info: ExportJobInfo) => void): { close: () => void } {
		const url = `/api/export/jobs/${encodeURIComponent(jobId)}:stream`
		const es = new EventSource(url)
		let didProbe = false
		const probe = async () => {
			if (didProbe) return
			didProbe = true
			try {
				const ac = new AbortController()
				const t = window.setTimeout(() => ac.abort(), 2000)
				const res = await fetch(url, {
					method: 'GET',
					headers: { Accept: 'text/event-stream' },
					cache: 'no-store',
					signal: ac.signal
				})
				window.clearTimeout(t)
				const ct = res.headers.get('content-type')
				let preview = ''
				try {
					preview = (await res.text()).slice(0, 500)
				} catch (e: unknown) {
					preview = `<<body read failed: ${getErrorMessage(e)}>>`
				}
				console.error('[Export SSE probe]', {
					url,
					status: res.status,
					statusText: res.statusText,
					contentType: ct,
					preview
				})
			} catch (e: unknown) {
				console.error('[Export SSE probe] request failed', { url, error: getErrorMessage(e) })
			}
		}
		const handler = (ev: MessageEvent) => {
			try {
				const parsed = safeJsonParse(String(ev.data || '{}'))
				if (isRecord(parsed)) {
					onProgress(parsed as ExportJobInfo)
				}
			} catch {
				// ignore
			}
		}
		es.addEventListener('progress', handler as EventListener)
		es.onmessage = handler
		es.onopen = () => {
			console.log('[Export SSE] connected', { url })
		}
		es.onerror = () => {
			void probe()
		}
		return { close: () => es.close() }
	},

	async getJob(jobId: string): Promise<ExportJobInfo> {
		const res = await fetch(`/api/export/jobs/${encodeURIComponent(jobId)}`)
		if (!res.ok) {
			let errorMessage = `查询导出进度失败：${res.status} ${res.statusText}`
			try {
				const payload = await safeJson(res)
				errorMessage = getErrorFromResponse(payload, errorMessage)
			} catch (e: unknown) {
				errorMessage = getErrorMessage(e)
			}
			throw new Error(errorMessage)
		}
		return (await safeJson(res)) as ExportJobInfo
	}
}
