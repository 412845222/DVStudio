import { getBackendBaseUrl } from './backendConfig'
import { isAgentToUiMessage } from '../core/agentToUI'
import type { AgentToUiMessage } from '../core/agentToUI'

type ServiceOptions = {
	baseUrl?: string | (() => string)
	devToken?: string
}

type PingResponse =
	| {
			ok: true
			baseUrl: string
			comfyui?: { version?: string; os?: string; deviceName?: string }
	  }
	| {
			ok: false
			error: string
			status?: number
			baseUrl?: string
	  }

type WorkflowsListResponse =
	| {
			ok: true
			baseUrl: string
			workflows: { path: string; name: string }[]
	  }
	| {
			ok: false
			error: string
			status?: number
			baseUrl?: string
	  }

type WorkflowGetResponse =
	| {
			ok: true
			baseUrl: string
			workflowPath: string
			workflow: any
	  }
	| {
			ok: false
			error: string
			status?: number
			baseUrl?: string
	  }

type RunResponse =
	| {
			ok: true
			baseUrl: string
			promptId: string
			result: any
			snapshot?: any
	  }
	| {
			ok: false
			error: string
			status?: number
			baseUrl?: string
			requiresConfirm?: boolean
			fallbackRecord?: {
				workflowName?: string
				workflowPath?: string
				workflowId?: string
				savedAt?: number
				runDir?: string
			}
	  }

type OutputsResponse =
	| {
			ok: true
			baseUrl: string
			promptId: string
			media: Array<{
				nodeId: string
				kind: 'image' | 'video'
				filename: string
				subfolder?: string
				type?: string
				url: string
			}>
			result: any
	  }
	| {
			ok: false
			error: string
			status?: number
			baseUrl?: string
	  }

type CancelResponse =
	| {
			ok: true
			baseUrl: string
			result: any
	  }
	| {
			ok: false
			error: string
			status?: number
			baseUrl?: string
	  }

type BlueprintChatResponse =
	| {
			ok: true
			assistant: string
			model?: string
			baseUrl?: string
	  }
	| {
			ok: false
			error: string
			status?: number
			need?: string[]
			baseUrl?: string
	  }

export type BlueprintChatStreamEvent =
	| { type: 'msg'; message: AgentToUiMessage }
	| { type: 'done' }
	| { type: 'error'; error: { message: string; details?: unknown } }

type NanoBananaGenerateResponse =
	| { ok: true; imageUrl: string; baseUrl?: string }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type NanoBananaCacheRefsResponse =
	| { ok: true; cacheIds: string[]; baseUrl?: string }
	| { ok: false; error: string; status?: number; baseUrl?: string }

export type NanoBananaGenerateStreamEvent = BlueprintChatStreamEvent

type JobResponse =
	| {
			ok: true
			baseUrl: string
			fallback?: string
			result: any
	  }
	| {
			ok: false
			error: string
			status?: number
			baseUrl?: string
	  }

const jsonHeaders = (devToken?: string) => {
	const h: Record<string, string> = {
		'Content-Type': 'application/json',
	}
	if (devToken) h['X-DEV-TOKEN'] = devToken
	return h
}

const safeJson = async (res: Response) => {
	const text = await res.text()
	try {
		return { ok: true as const, value: JSON.parse(text) }
	} catch {
		return { ok: false as const, text }
	}
}

export class ComfyUIBridgeService {
	private readonly getBaseUrl: () => string
	private readonly devToken?: string

	constructor(opts: ServiceOptions = {}) {
		if (typeof opts.baseUrl === 'function') this.getBaseUrl = opts.baseUrl
		else if (typeof opts.baseUrl === 'string') {
			const fixed = opts.baseUrl
			this.getBaseUrl = () => fixed
		} else {
			this.getBaseUrl = getBackendBaseUrl
		}
		this.devToken = opts.devToken
	}

	private url(path: string) {
		const base = (this.getBaseUrl?.() ?? '').trim().replace(/\/$/, '')
		if (!base) return path
		if (path.startsWith('/')) return `${base}${path}`
		return `${base}/${path}`
	}

	async blueprintChat(payload: {
		content: string
		history?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
	}): Promise<BlueprintChatResponse> {
		const res = await fetch(this.url('/api/workflow/blueprint/chat'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify(payload ?? {}),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			if (body.ok && body.value && typeof body.value === 'object') {
				return {
					ok: false,
					status: res.status,
					error:
						typeof (body.value as any).error === 'string'
							? String((body.value as any).error)
							: `blueprint/chat failed: ${res.status}`,
					...(body.value as any),
				}
			}
			return {
				ok: false,
				status: res.status,
				error: `blueprint/chat failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
			}
		}
		return (await res.json()) as BlueprintChatResponse
	}

	/**
	 * Stream blueprint chat via SSE.
	 * Expected events:
	 * - event: msg, data: <AgentToUI envelope JSON>
	 * - event: error, data: {message,...}
	 * - event: done
	 */
	async *blueprintChatStream(
		payload: {
			content: string
			history?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
		},
		signal?: AbortSignal
	): AsyncGenerator<BlueprintChatStreamEvent, void, void> {
		const res = await fetch(this.url('/api/workflow/blueprint/chat:stream'), {
			method: 'POST',
			headers: {
				...jsonHeaders(this.devToken),
				Accept: 'text/event-stream',
			},
			body: JSON.stringify(payload ?? {}),
			signal,
		})

		if (!res.ok || !res.body) {
			const body = await safeJson(res)
			throw new Error(`blueprint/chat:stream failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`)
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder('utf-8')

		let buffer = ''
		let eventName: string | undefined
		let dataLines: string[] = []

		const flush = (): BlueprintChatStreamEvent[] => {
			if (dataLines.length === 0 && !eventName) return []
			const data = dataLines.join('\n')
			const name = eventName
			eventName = undefined
			dataLines = []

			if (name === 'done') return [{ type: 'done' }]

			if (name === 'error') {
				try {
					const v = JSON.parse(data)
					const msg = typeof (v as any)?.message === 'string' ? String((v as any).message) : 'SSE error'
					return [{ type: 'error', error: { message: msg, details: v } }]
				} catch {
					return [{ type: 'error', error: { message: data || 'SSE error' } }]
				}
			}

			// default / msg
			try {
				const v = JSON.parse(data)
				if (isAgentToUiMessage(v)) return [{ type: 'msg', message: v }]
				// ignore non AgentToUI payloads to keep stream stable
				return []
			} catch (e) {
				return [{ type: 'error', error: { message: 'SSE msg JSON.parse failed', details: { raw: data, error: String(e) } } }]
			}
		}

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })

				let idx = buffer.indexOf('\n')
				while (idx >= 0) {
					const line = buffer.slice(0, idx)
					buffer = buffer.slice(idx + 1)
					idx = buffer.indexOf('\n')

					const l = line.replace(/\r$/, '')
					if (!l.trim()) {
						for (const ev of flush()) yield ev
						continue
					}
					if (l.startsWith('event:')) {
						eventName = l.slice('event:'.length).trim()
						continue
					}
					if (l.startsWith('data:')) {
						dataLines.push(l.slice('data:'.length).trimStart())
						continue
					}
				}
			}
		} finally {
			try {
				reader.releaseLock()
			} catch {
				// ignore
			}
		}

		// flush tail
		for (const ev of flush()) yield ev
	}

	/**
	 * Cache NanoBanana ref images on Django backend before generation.
	 * Backend: POST /api/workflow/nanobanana/ref-cache
	 */
	async nanoBananaCacheRefImages(formData: FormData): Promise<NanoBananaCacheRefsResponse> {
		const headers: Record<string, string> = {
			Accept: 'application/json',
		}
		if (this.devToken) headers['X-DEV-TOKEN'] = this.devToken
		const res = await fetch(this.url('/api/workflow/nanobanana/ref-cache'), {
			method: 'POST',
			headers,
			body: formData,
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `nanobanana/ref-cache failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
			}
		}
		return (await res.json()) as NanoBananaCacheRefsResponse
	}

	/**
	 * NanoBanana image generation (non-stream for now).
	 * Backend: POST /api/workflow/nanobanana/generate
	 */
	async nanoBananaGenerate(payload: {
		prompt: string
		aspectRatio?: string
		imageSize?: string
		width?: number
		height?: number
	}): Promise<NanoBananaGenerateResponse> {
		const res = await fetch(this.url('/api/workflow/nanobanana/generate'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify(payload ?? {}),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `nanobanana/generate failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
			}
		}
		return (await res.json()) as NanoBananaGenerateResponse
	}

	/**
	 * NanoBanana image generation (SSE stream).
	 * Backend: POST /api/workflow/nanobanana/generate:stream
	 *
	 * Expected events:
	 * - event: msg, data: <AgentToUI envelope JSON>
	 * - event: error, data: {message,...}
	 * - event: done
	 */
	async *nanoBananaGenerateStream(
		form: FormData,
		signal?: AbortSignal
	): AsyncGenerator<NanoBananaGenerateStreamEvent, void, void> {
		const headers: Record<string, string> = {
			Accept: 'text/event-stream',
		}
		if (this.devToken) headers['X-DEV-TOKEN'] = this.devToken

		const res = await fetch(this.url('/api/workflow/nanobanana/generate:stream'), {
			method: 'POST',
			headers,
			body: form,
			signal,
		})

		if (!res.ok || !res.body) {
			const body = await safeJson(res)
			throw new Error(
				`nanobanana/generate:stream failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			)
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder('utf-8')

		let buffer = ''
		let eventName: string | undefined
		let dataLines: string[] = []

		const flush = (): NanoBananaGenerateStreamEvent[] => {
			if (dataLines.length === 0 && !eventName) return []
			const data = dataLines.join('\n')
			const name = eventName
			eventName = undefined
			dataLines = []

			if (name === 'done') return [{ type: 'done' }]
			if (name === 'error') {
				try {
					const obj = JSON.parse(data)
					return [{ type: 'error', error: { message: String(obj?.message ?? 'error'), details: obj } }]
				} catch {
					return [{ type: 'error', error: { message: data || 'error' } }]
				}
			}
			// default to msg
			try {
				const obj = JSON.parse(data)
				if (isAgentToUiMessage(obj)) return [{ type: 'msg', message: obj }]
				return [{ type: 'error', error: { message: 'invalid AgentToUI envelope', details: obj } }]
			} catch (e) {
				return [{ type: 'error', error: { message: 'invalid json in SSE message', details: String(e) } }]
			}
		}

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })

				let idx = buffer.indexOf('\n')
				while (idx >= 0) {
					const line = buffer.slice(0, idx)
					buffer = buffer.slice(idx + 1)
					idx = buffer.indexOf('\n')

					const l = line.replace(/\r$/, '')
					if (!l.trim()) {
						for (const ev of flush()) yield ev
						continue
					}
					if (l.startsWith('event:')) {
						eventName = l.slice('event:'.length).trim()
						continue
					}
					if (l.startsWith('data:')) {
						dataLines.push(l.slice('data:'.length).trimStart())
						continue
					}
				}
			}
		} finally {
			try {
				reader.releaseLock()
			} catch {
				// ignore
			}
		}

		for (const ev of flush()) yield ev
	}

	async ping(comfyBaseUrl: string): Promise<PingResponse> {
		const res = await fetch(this.url('/api/workflow/ping'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify({ baseUrl: comfyBaseUrl }),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `ping failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
				baseUrl: comfyBaseUrl,
			}
		}
		return (await res.json()) as PingResponse
	}

	async listWorkflows(comfyBaseUrl: string): Promise<WorkflowsListResponse> {
		const res = await fetch(this.url('/api/workflow/workflows/list'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify({ baseUrl: comfyBaseUrl }),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `workflows/list failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
				baseUrl: comfyBaseUrl,
			}
		}
		return (await res.json()) as WorkflowsListResponse
	}

	async getWorkflow(comfyBaseUrl: string, workflowPath: string): Promise<WorkflowGetResponse> {
		const res = await fetch(this.url('/api/workflow/workflows/get'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify({ baseUrl: comfyBaseUrl, workflowPath }),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `workflows/get failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
				baseUrl: comfyBaseUrl,
			}
		}
		return (await res.json()) as WorkflowGetResponse
	}

	async run(
		comfyBaseUrl: string,
		workflowPath: string,
		files: File[] = [],
		overrides?: { positivePrompt?: string; negativePrompt?: string; confirmReuseRecord?: boolean }
	): Promise<RunResponse> {
		const form = new FormData()
		form.set('baseUrl', comfyBaseUrl)
		form.set('workflowPath', workflowPath)
		if (typeof overrides?.positivePrompt === 'string') form.set('positivePrompt', overrides.positivePrompt)
		if (typeof overrides?.negativePrompt === 'string') form.set('negativePrompt', overrides.negativePrompt)
		if (typeof overrides?.confirmReuseRecord === 'boolean') form.set('confirmReuseRecord', overrides.confirmReuseRecord ? '1' : '0')
		files.forEach((f, idx) => {
			form.append(`file${idx}`, f, f.name || `input_${idx}.png`)
		})
		const res = await fetch(this.url('/api/workflow/run'), {
			method: 'POST',
			headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined,
			body: form,
		})
		if (!res.ok) {
			const body = await safeJson(res)
			if (body.ok && body.value && typeof body.value === 'object') {
				return {
					ok: false,
					status: res.status,
					baseUrl: comfyBaseUrl,
					error: typeof (body.value as any).error === 'string'
						? String((body.value as any).error)
						: `run failed: ${res.status}`,
					...(body.value as any),
				}
			}
			return {
				ok: false,
				status: res.status,
				error: `run failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
				baseUrl: comfyBaseUrl,
			}
		}
		return (await res.json()) as RunResponse
	}

	async outputs(comfyBaseUrl: string, promptId: string): Promise<OutputsResponse> {
		const res = await fetch(this.url('/api/workflow/outputs'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify({ baseUrl: comfyBaseUrl, promptId }),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `outputs failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
				baseUrl: comfyBaseUrl,
			}
		}
		return (await res.json()) as OutputsResponse
	}

	async cancel(comfyBaseUrl: string, promptId: string): Promise<CancelResponse> {
		const res = await fetch(this.url('/api/workflow/cancel'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify({ baseUrl: comfyBaseUrl, promptId }),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `cancel failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
				baseUrl: comfyBaseUrl,
			}
		}
		return (await res.json()) as CancelResponse
	}

	async job(comfyBaseUrl: string, id: string): Promise<JobResponse> {
		const res = await fetch(this.url('/api/workflow/job'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify({ baseUrl: comfyBaseUrl, id }),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `job failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
				baseUrl: comfyBaseUrl,
			}
		}
		return (await res.json()) as JobResponse
	}
}
