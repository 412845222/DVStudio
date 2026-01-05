export type ExportFormat = 'mp4' | 'mov'

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

type CreateExportJobRequest = {
	format: ExportFormat
	width: number
	height: number
	fps: number
	frameCount: number
	ignoreStageBackground?: boolean
	snapshot?: unknown
}

const safeJson = async (res: Response) => {
	const text = await res.text()
	try {
		return JSON.parse(text)
	} catch {
		const preview = text.slice(0, 200)
		throw new Error(`Export API 返回非 JSON：${res.status} ${res.statusText}，body 预览：${preview}`)
	}
}

export const ExportService = {
	async createJob(req: CreateExportJobRequest): Promise<ExportJobInfo> {
		const res = await fetch('/api/export/jobs', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(req),
		})
		if (!res.ok) {
			const payload = await safeJson(res).catch((e) => ({ error: String(e?.message ?? e) }))
			throw new Error((payload as any)?.error ?? `导出失败：${res.status} ${res.statusText}`)
		}
		return (await safeJson(res)) as ExportJobInfo
	},

	async uploadFrame(jobId: string, frameIndex: number, blob: Blob): Promise<ExportJobInfo> {
		const fd = new FormData()
		fd.set('frameIndex', String(Math.floor(frameIndex)))
		fd.set('file', blob, `frame_${String(Math.floor(frameIndex)).padStart(6, '0')}.png`)
		const res = await fetch(`/api/export/jobs/${encodeURIComponent(jobId)}/frames`, {
			method: 'POST',
			body: fd,
		})
		if (!res.ok) {
			const payload = await safeJson(res).catch((e) => ({ error: String(e?.message ?? e) }))
			throw new Error((payload as any)?.error ?? `上传帧失败：${res.status} ${res.statusText}`)
		}
		return (await safeJson(res)) as ExportJobInfo
	},

	async finalize(jobId: string): Promise<ExportJobInfo> {
		const res = await fetch(`/api/export/jobs/${encodeURIComponent(jobId)}/finalize`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		})
		if (!res.ok) {
			const payload = await safeJson(res).catch((e) => ({ error: String(e?.message ?? e) }))
			throw new Error((payload as any)?.error ?? `触发编码失败：${res.status} ${res.statusText}`)
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
					signal: ac.signal,
				})
				window.clearTimeout(t)
				const ct = res.headers.get('content-type')
				let preview = ''
				try {
					// For 4xx it should finish quickly; for 200 streaming this may hang.
					preview = (await res.text()).slice(0, 500)
				} catch (e) {
					preview = `<<body read failed: ${String((e as any)?.message ?? e)}>>`
				}
				console.error('[Export SSE probe]', { url, status: res.status, statusText: res.statusText, contentType: ct, preview })
			} catch (e) {
				console.error('[Export SSE probe] request failed', { url, error: String((e as any)?.message ?? e) })
			}
		}
		const handler = (ev: MessageEvent) => {
			try {
				const data = JSON.parse(String(ev.data || '{}')) as ExportJobInfo
				onProgress(data)
			} catch {
				// ignore
			}
		}
		es.addEventListener('progress', handler as any)
		es.onmessage = handler
		es.onopen = () => {
			// eslint-disable-next-line no-console
			console.log('[Export SSE] connected', { url })
		}
		es.onerror = () => {
			void probe()
			// let caller decide UI; do not auto-throw here.
		}
		return { close: () => es.close() }
	},

	async getJob(jobId: string): Promise<ExportJobInfo> {
		const res = await fetch(`/api/export/jobs/${encodeURIComponent(jobId)}`)
		if (!res.ok) {
			const payload = await safeJson(res).catch((e) => ({ error: String(e?.message ?? e) }))
			throw new Error((payload as any)?.error ?? `查询导出进度失败：${res.status} ${res.statusText}`)
		}
		return (await safeJson(res)) as ExportJobInfo
	},
}
