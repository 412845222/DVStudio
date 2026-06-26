import { isRecord, isString, getErrorMessage } from '../types/utils'
import { isMigrationMode, hasIpcApi, ipcOrHttp, ipcStreamOrHttp, unwrapIpcResult } from './ipcClient'
import { getBackendBaseUrl } from './backendConfig'

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
	projectId?: number
}

export type ExportErrorResponse = {
	error?: string
}

type ExportIpcBridge = {
	dweb?: {
		export?: {
			jobs?: {
				create?: (payload: unknown) => Promise<unknown>
				get?: (payload: { id: string }) => Promise<unknown>
				listByProject?: (payload: { projectId: number }) => Promise<unknown>
				stream?: (payload: { id: string }) => AsyncGenerator<unknown>
				finalize?: (payload: unknown) => Promise<unknown>
				file?: (payload: { id: string }) => Promise<unknown>
			}
			frames?: {
				upload?: (payload: unknown) => Promise<unknown>
				uploadRaw?: (payload: unknown) => Promise<unknown>
				uploadBatch?: (payload: unknown) => Promise<unknown>
			}
		}
	}
}

function getIpcBridge(): ExportIpcBridge {
	return window as unknown as ExportIpcBridge
}

function normalizeJob(raw: unknown): ExportJobInfo {
	if (!raw || typeof raw !== 'object') {
		throw new Error('Invalid job response')
	}
	const r = raw as Record<string, unknown>
	return {
		jobId: String(r.jobId || r.id || ''),
		status: (r.status as ExportJobStatus) || 'queued',
		progress: Number(r.progress) || 0,
		format: (r.format as ExportFormat) || 'mp4',
		width: r.width !== undefined ? Number(r.width) : undefined,
		height: r.height !== undefined ? Number(r.height) : undefined,
		fps: r.fps !== undefined ? Number(r.fps) : undefined,
		frameCount: r.frameCount !== undefined ? Number(r.frameCount) : undefined,
		receivedFrames: r.receivedFrames !== undefined ? Number(r.receivedFrames) : undefined,
		fileName: r.fileName ? String(r.fileName) : undefined,
		downloadUrl: r.downloadUrl ? String(r.downloadUrl) : undefined,
		serverPath: r.serverPath || r.outputPath ? String(r.serverPath || r.outputPath) : undefined,
		error: r.error ? String(r.error) : undefined,
	}
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onloadend = () => {
			const result = reader.result as string
			const base64 = result.split(',')[1] || ''
			resolve(base64)
		}
		reader.onerror = () => reject(new Error('Failed to read blob'))
		reader.readAsDataURL(blob)
	})
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

async function httpCreateJob(req: CreateExportJobRequest): Promise<ExportJobInfo> {
	const base = getBackendBaseUrl()
	const res = await fetch(`${base}/api/export/jobs`, {
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
}

async function httpUploadFrame(jobId: string, frameIndex: number, blob: Blob): Promise<ExportJobInfo> {
	const base = getBackendBaseUrl()
	const fd = new FormData()
	fd.set('frameIndex', String(Math.floor(frameIndex)))
	fd.set('file', blob, `frame_${String(Math.floor(frameIndex)).padStart(6, '0')}.png`)
	const res = await fetch(`${base}/api/export/jobs/${encodeURIComponent(jobId)}/frames`, {
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
}

async function httpFinalize(
	jobId: string,
	opts?: {
		format?: ExportFormat
		quality?: ExportQuality
		ignoreStageBackground?: boolean
		outputPath?: string
	}
): Promise<ExportJobInfo> {
	const base = getBackendBaseUrl()
	const res = await fetch(`${base}/api/export/jobs/${encodeURIComponent(jobId)}/finalize`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			format: opts?.format,
			quality: opts?.quality,
			ignoreStageBackground: opts?.ignoreStageBackground,
			outputPath: opts?.outputPath,
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
}

async function* httpOpenJobStream(jobId: string): AsyncGenerator<ExportJobInfo> {
	const base = getBackendBaseUrl()
	const url = `${base}/api/export/jobs/${encodeURIComponent(jobId)}:stream`
	const response = await fetch(url, {
		method: 'GET',
		headers: { Accept: 'text/event-stream' },
		cache: 'no-store',
	})
	if (!response.ok || !response.body) {
		throw new Error(`SSE stream failed: ${response.status}`)
	}
	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let buffer = ''
	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			buffer += decoder.decode(value, { stream: true })
			const lines = buffer.split('\n')
			buffer = lines.pop() || ''
			for (const line of lines) {
				const trimmed = line.trim()
				if (!trimmed || !trimmed.startsWith('data:')) continue
				const data = trimmed.slice(5).trim()
				if (!data || data === '[DONE]') continue
				try {
					const parsed = JSON.parse(data)
					if (parsed && typeof parsed === 'object') {
						if (parsed.job) {
							yield normalizeJob(parsed.job)
						} else {
							yield normalizeJob(parsed)
						}
					}
				} catch {
					// ignore parse errors
				}
			}
		}
	} finally {
		reader.releaseLock()
	}
}

async function httpGetJob(jobId: string): Promise<ExportJobInfo> {
	const base = getBackendBaseUrl()
	const res = await fetch(`${base}/api/export/jobs/${encodeURIComponent(jobId)}`)
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

export const ExportService = {
	async createJob(req: CreateExportJobRequest): Promise<ExportJobInfo> {
		return ipcOrHttp(
			async () => {
				const bridge = getIpcBridge()
				const createFn = bridge.dweb?.export?.jobs?.create
				if (typeof createFn !== 'function') throw new Error('IPC export.jobs.create not available')
				const result = await createFn(req)
				return normalizeJob(unwrapIpcResult(result))
			},
			() => httpCreateJob(req)
		)
	},

	async uploadFrame(jobId: string, frameIndex: number, blob: Blob): Promise<ExportJobInfo> {
		return ipcOrHttp(
			async () => {
				const bridge = getIpcBridge()
				const uploadFn = bridge.dweb?.export?.frames?.upload
				if (typeof uploadFn !== 'function') throw new Error('IPC export.frames.upload not available')
				const base64 = await blobToBase64(blob)
				const result = await uploadFn({
					jobId,
					frameIndex: Math.floor(frameIndex),
					data: base64,
					filename: `frame_${String(Math.floor(frameIndex)).padStart(6, '0')}.png`,
				})
				const unwrapped = unwrapIpcResult<{ job?: ExportJobInfo }>(result)
				if (unwrapped?.job) return normalizeJob(unwrapped.job)
				return normalizeJob(unwrapped)
			},
			() => httpUploadFrame(jobId, frameIndex, blob)
		)
	},

	async uploadFrameRaw(jobId: string, frameIndex: number, filePath: string): Promise<ExportJobInfo> {
		return ipcOrHttp(
			async () => {
				const bridge = getIpcBridge()
				const uploadFn = bridge.dweb?.export?.frames?.uploadRaw
				if (typeof uploadFn !== 'function') throw new Error('IPC export.frames.uploadRaw not available')
				const result = await uploadFn({ jobId, frameIndex: Math.floor(frameIndex), filePath })
				const unwrapped = unwrapIpcResult<{ job?: ExportJobInfo }>(result)
				if (unwrapped?.job) return normalizeJob(unwrapped.job)
				return normalizeJob(unwrapped)
			},
			async () => {
				const response = await fetch(`file://${filePath}`)
				const blob = await response.blob()
				return httpUploadFrame(jobId, frameIndex, blob)
			}
		)
	},

	async uploadFramesRawBatch(
		jobId: string,
		startIndex: number,
		count: number,
		bytes: Uint8Array
	): Promise<ExportJobInfo> {
		if (isMigrationMode() && hasIpcApi()) {
			const bridge = getIpcBridge()
			const uploadBatchFn = bridge.dweb?.export?.frames?.upload
			if (typeof uploadBatchFn === 'function') {
				let lastJob: ExportJobInfo | null = null
				const blob = new Blob([bytes], { type: 'application/octet-stream' })
				const base64 = await blobToBase64(blob)
				for (let i = 0; i < count; i++) {
					const idx = Math.floor(startIndex) + i
					const result = await uploadBatchFn({
						jobId,
						frameIndex: idx,
						data: base64,
						filename: `frame_${String(idx).padStart(6, '0')}.png`,
					})
					const unwrapped = unwrapIpcResult<{ job?: ExportJobInfo }>(result)
					if (unwrapped?.job) lastJob = normalizeJob(unwrapped.job)
					else lastJob = normalizeJob(unwrapped)
				}
				if (lastJob) return lastJob
			}
		}
		const base = getBackendBaseUrl()
		const si = Math.floor(Number(startIndex) || 0)
		const c = Math.floor(Number(count) || 0)
		const url = `${base}/api/export/jobs/${encodeURIComponent(jobId)}/frames:raw-batch?startIndex=${encodeURIComponent(String(si))}&count=${encodeURIComponent(String(c))}`
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
			outputPath?: string
		}
	): Promise<ExportJobInfo> {
		return ipcOrHttp(
			async () => {
				const bridge = getIpcBridge()
				const finalizeFn = bridge.dweb?.export?.jobs?.finalize
				if (typeof finalizeFn !== 'function') throw new Error('IPC export.jobs.finalize not available')
				const result = await finalizeFn({
					id: jobId,
					jobId,
					outputPath: opts?.outputPath,
					...opts,
				})
				return normalizeJob(unwrapIpcResult(result))
			},
			() => httpFinalize(jobId, opts)
		)
	},

	openJobStream(jobId: string, onProgress: (info: ExportJobInfo) => void): { close: () => void } {
		let closed = false
		let generator: AsyncGenerator<unknown> | null = null
		let stop = false

		const runIpc = async () => {
			try {
				const bridge = getIpcBridge()
				const streamFn = bridge.dweb?.export?.jobs?.stream
				if (typeof streamFn !== 'function') throw new Error('IPC stream not available')
				generator = streamFn({ id: jobId })
				for await (const chunk of generator) {
					if (stop || closed) break
					let parsed = chunk
					if (typeof chunk === 'string') {
						try { parsed = JSON.parse(chunk) } catch { parsed = chunk }
					}
					if (parsed && typeof parsed === 'object') {
						const r = parsed as Record<string, unknown>
						if (r.type === 'error') {
							throw new Error(String(r.error || 'Export stream error'))
						}
						if (r.job) {
							onProgress(normalizeJob(r.job))
						} else if (r.type === 'progress' || r.type === 'status' || r.type === 'done') {
							onProgress(normalizeJob(r.job || r))
						}
					}
				}
			} catch (err) {
				if (!closed && !stop) {
					console.warn('[ExportService] IPC stream failed, falling back to HTTP SSE:', err)
					runHttp()
				}
			}
		}

		const runHttp = async () => {
			try {
				for await (const info of httpOpenJobStream(jobId)) {
					if (stop || closed) break
					onProgress(info)
				}
			} catch (err) {
				console.error('[ExportService] HTTP stream failed:', err)
			}
		}

		if (isMigrationMode() && hasIpcApi()) {
			runIpc()
		} else {
			runHttp()
		}

		return {
			close: () => {
				closed = true
				stop = true
				if (generator && typeof generator.return === 'function') {
					generator.return(undefined).catch(() => {})
				}
			}
		}
	},

	async getJob(jobId: string): Promise<ExportJobInfo> {
		return ipcOrHttp(
			async () => {
				const bridge = getIpcBridge()
				const getFn = bridge.dweb?.export?.jobs?.get
				if (typeof getFn !== 'function') throw new Error('IPC export.jobs.get not available')
				const result = await getFn({ id: jobId })
				return normalizeJob(unwrapIpcResult(result))
			},
			() => httpGetJob(jobId)
		)
	},

	async getJobFile(jobId: string): Promise<{ filePath: string; fileName: string }> {
		return ipcOrHttp(
			async () => {
				const bridge = getIpcBridge()
				const fileFn = bridge.dweb?.export?.jobs?.file
				if (typeof fileFn !== 'function') throw new Error('IPC export.jobs.file not available')
				const result = await fileFn({ id: jobId })
				const unwrapped = unwrapIpcResult<{ filePath?: string; fileName?: string }>(result)
				return {
					filePath: String(unwrapped?.filePath || ''),
					fileName: String(unwrapped?.fileName || ''),
				}
			},
			async () => {
				const job = await httpGetJob(jobId)
				return {
					filePath: job.serverPath || '',
					fileName: job.fileName || '',
				}
			}
		)
	},
}
