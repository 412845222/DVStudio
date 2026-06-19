import { getBackendBaseUrl } from './backendConfig'
import { isAgentToUiMessage } from '../core/agentToUI'
import type { AgentToUiMessage } from '../core/agentToUI'

type ServiceOptions = {
	baseUrl?: string | (() => string)
	devToken?: string
	localExecBasePath?: string
}

const normalizeLocalExecBasePath = (raw: unknown) => {
	const text = String(raw ?? '').trim()
	if (!text) return '/api/workflow/codex'
	if (text === 'codex') return '/api/workflow/codex'
	if (text === 'copilot') return '/api/workflow/copilot'
	const withLeadingSlash = text.startsWith('/') ? text : `/${text}`
	return withLeadingSlash.replace(/\/+$/, '') || '/api/workflow/codex'
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

export type CodexSessionDto = {
	id: string
	title: string
	status?: string
	model_name?: string
	provider_thread_id?: string
	cwd?: string
}

export type CodexListSessionsResponse = { items: CodexSessionDto[] } | { error: string }

export type CodexCreateSessionResponse = CodexSessionDto | { error: string }

export type CodexApprovalResponse = { message?: any; error?: string }

export type CodexStreamEvent =
	| { type: 'event'; event: string; data: any }
	| { type: 'error'; error: { message: string; details?: unknown } }
	| { type: 'done' }

type NanoBananaGenerateResponse =
	| { ok: true; imageUrl: string; baseUrl?: string }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type NanoBananaCacheRefsResponse =
	| { ok: true; cacheIds: string[]; baseUrl?: string }
	| { ok: false; error: string; status?: number; baseUrl?: string }

export type NanoBananaGenerateStreamEvent = BlueprintChatStreamEvent
export type SeedanceGenerateStreamEvent = BlueprintChatStreamEvent
export type JimengGenerateStreamEvent = BlueprintChatStreamEvent

export type SeedanceTaskMirrorItem = {
	id: number
	taskId: string
	provider: string
	model: string
	taskType?: string
	source?: string
	status: string
	prompt: string
	ratio?: string
	resolution?: string
	duration?: number
	seed?: number | null
	generateAudio?: boolean
	watermark?: boolean
	cameraFixed?: boolean
	serviceTier?: string
	tools?: any[]
	usage?: Record<string, any>
	videoUrlRemote?: string
	videoUrlLocal?: string
	videoSourcePathLocal?: string
	lastFrameUrlRemote?: string
	lastFrameUrlLocal?: string
	lastFrameSourcePathLocal?: string
	downloadStatus?: string
	downloadProgress?: number
	downloadError?: string
	errorMessage?: string
	statusText?: string
	projectId?: number | null
	remoteCreatedAt?: number | null
	remoteUpdatedAt?: number | null
	requestPayload?: Record<string, any>
	responsePayload?: Record<string, any>
	createdAt: string
	updatedAt: string
	syncedAt: string
}

type SeedanceTasksListResponse =
	| {
			ok: true
			items: SeedanceTaskMirrorItem[]
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type SeedanceTaskDetailResponse =
	| {
			ok: true
			item: SeedanceTaskMirrorItem
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type SeedanceSyncTasksResponse =
	| {
			ok: true
			item?: SeedanceTaskMirrorItem
			items?: SeedanceTaskMirrorItem[]
			total?: number
			remote?: Record<string, any>
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type MeshyGenerateResponse =
	| { ok: true; mode: string; taskId: string; status: string; raw?: any }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type MeshyTaskResponse =
	| {
			ok: true
			mode: string
			taskId: string
			status: string
			progress: number
			thumbnailUrl: string
			modelUrls: Record<string, string>
			imageUrls?: string[]
			preferredImageUrl?: string
			sourceImageUrl?: string
			preferredModelUrl: string
			sourceModelUrl?: string
			statusText?: string
			errorMessage?: string
			raw?: any
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

export type MeshyTaskRelationKind = 'model' | 'texture' | 'rigging' | 'animation' | 'remesh'

export type MeshyTaskCapability = 'model' | 'textured' | 'rigged' | 'animated'

export type MeshyTaskMirrorItem = {
	id: number
	taskId: string
	mode: string
	target: '3d' | 'image'
	family: string
	relationKind?: MeshyTaskRelationKind
	rootTaskId?: string
	parentTaskId?: string
	capabilities?: MeshyTaskCapability[]
	status: string
	progress: number
	prompt: string
	negativePrompt: string
	imageCount: number
	thumbnailUrl?: string
	preferredModelUrl?: string
	localAssetUrl?: string
	localAssetPath?: string
	sourceModelUrl?: string
	errorMessage?: string
	statusText?: string
	lastNodeId?: string
	projectId?: number | null
	remoteCreatedAt?: string
	remoteFinishedAt?: string
	createdAt: string
	updatedAt: string
	children?: MeshyTaskMirrorItem[]
	hasTextureChild?: boolean
	hasRiggingChild?: boolean
	hasAnimationChild?: boolean
	effectiveTaskId?: string
	effectiveRelationKind?: MeshyTaskRelationKind
	effectiveStatus?: string
	effectiveProgress?: number
	effectivePreferredModelUrl?: string
	effectiveLocalAssetUrl?: string
	effectiveLocalAssetPath?: string
	effectiveThumbnailUrl?: string
	selectedTaskId?: string
	requestPayload?: Record<string, any>
	responsePayload?: Record<string, any>
}

type MeshyTasksListResponse =
	| {
			ok: true
			items: MeshyTaskMirrorItem[]
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type MeshyTaskDetailResponse =
	| {
			ok: true
			item: MeshyTaskMirrorItem
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type MeshyTaskActionResponse =
	| {
			ok: true
			taskId: string
			status?: string
			deleted?: boolean
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

export type MeshyBalanceResponse =
	| {
			ok: true
			available: boolean
			configured: boolean
			displayText: string
			detail?: string
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

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
	private readonly localExecBasePath: string

	constructor(opts: ServiceOptions = {}) {
		if (typeof opts.baseUrl === 'function') this.getBaseUrl = opts.baseUrl
		else if (typeof opts.baseUrl === 'string') {
			const fixed = opts.baseUrl
			this.getBaseUrl = () => fixed
		} else {
			this.getBaseUrl = getBackendBaseUrl
		}
		this.devToken = opts.devToken
		this.localExecBasePath = normalizeLocalExecBasePath(opts.localExecBasePath)
	}

	private url(path: string) {
		const base = (this.getBaseUrl?.() ?? '').trim().replace(/\/$/, '')
		if (!base) return path
		if (path.startsWith('/')) return `${base}${path}`
		return `${base}/${path}`
	}

	private localExecUrl(path: string) {
		const normalized = path.startsWith('/') ? path : `/${path}`
		return this.url(`${this.localExecBasePath}${normalized}`)
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

	async codexHealth(): Promise<any> {
		const res = await fetch(this.localExecUrl('/health'), {
			method: 'GET',
			headers: jsonHeaders(this.devToken),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return { ok: false, error: `codex/health failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}` }
		}
		return await res.json()
	}

	async codexListSessions(projectId: number | null): Promise<CodexListSessionsResponse> {
		const pid = Number.isFinite(projectId as number) ? Number(projectId) : NaN
		const query = Number.isFinite(pid) ? `?projectId=${encodeURIComponent(String(pid))}` : ''
		const res = await fetch(this.localExecUrl(`/sessions${query}`), {
			method: 'GET',
			headers: jsonHeaders(this.devToken),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return { error: `codex/sessions failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}` }
		}
		return (await res.json()) as CodexListSessionsResponse
	}

	async codexCreateSession(payload: { title?: string; cwd?: string; model?: string; projectId?: number | null } = {}): Promise<CodexCreateSessionResponse> {
		const res = await fetch(this.localExecUrl('/sessions'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify(payload ?? {}),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return { error: `codex/create-session failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}` }
		}
		return (await res.json()) as CodexCreateSessionResponse
	}

	async codexListMessages(sessionId: string, projectId: number | null): Promise<{ items?: any[]; error?: string }> {
		const sid = String(sessionId || '').trim()
		if (!sid) return { error: 'sessionId is required' }
		const pid = Number.isFinite(projectId as number) ? Number(projectId) : NaN
		const query = Number.isFinite(pid) ? `?projectId=${encodeURIComponent(String(pid))}` : ''
		const res = await fetch(this.localExecUrl(`/sessions/${encodeURIComponent(sid)}/messages${query}`), {
			method: 'GET',
			headers: jsonHeaders(this.devToken),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return { error: `codex/messages failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}` }
		}
		return await res.json()
	}

	async codexUpdateSession(payload: { sessionId: string; projectId: number | null; title: string }): Promise<{ error?: string; [k: string]: any }> {
		const sid = String(payload.sessionId || '').trim()
		if (!sid) return { error: 'sessionId is required' }
		const res = await fetch(this.localExecUrl(`/sessions/${encodeURIComponent(sid)}`), {
			method: 'PATCH',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify({ title: payload.title, projectId: payload.projectId }),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return { error: `codex/session patch failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}` }
		}
		return await res.json()
	}

	async codexDeleteSession(payload: { sessionId: string; projectId: number | null }): Promise<{ ok?: boolean; error?: string }> {
		const sid = String(payload.sessionId || '').trim()
		if (!sid) return { error: 'sessionId is required' }
		const pid = Number.isFinite(payload.projectId as number) ? Number(payload.projectId) : NaN
		const query = Number.isFinite(pid) ? `?projectId=${encodeURIComponent(String(pid))}` : ''
		const res = await fetch(this.localExecUrl(`/sessions/${encodeURIComponent(sid)}${query}`), {
			method: 'DELETE',
			headers: jsonHeaders(this.devToken),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return { error: `codex/session delete failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}` }
		}
		return { ok: true }
	}

	async codexSubmitApproval(payload: { sessionId: string; messageId: string; decision: 'accept' | 'decline'; projectId?: number | null }): Promise<CodexApprovalResponse> {
		const sid = String(payload.sessionId || '').trim()
		if (!sid) return { error: 'sessionId is required' }
		const res = await fetch(this.localExecUrl(`/sessions/${encodeURIComponent(sid)}/approvals`), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify({ message_id: payload.messageId, decision: payload.decision, projectId: (payload as any).projectId ?? null }),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return { error: `codex/approvals failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}` }
		}
		return (await res.json()) as CodexApprovalResponse
	}

	async *codexStreamMessage(
		sessionId: string,
		payload: {
			content: string
			references?: Array<{ path: string; kind?: string; name?: string }>
			projectId?: number | null
			skillHints?: string[]
			executionHints?: string[]
			agentMode?: 'agent' | 'ask' | 'plan'
			permissionProfile?: string
		},
		signal?: AbortSignal,
		useTestStream = false
	): AsyncGenerator<CodexStreamEvent, void, void> {
		const sid = String(sessionId || '').trim()
		if (!sid) {
			yield { type: 'error', error: { message: 'sessionId is required' } }
			return
		}
		const streamPath = useTestStream
			? `/sessions/${encodeURIComponent(sid)}/messages:stream-test`
			: `/sessions/${encodeURIComponent(sid)}/messages:stream`
		const res = await fetch(this.localExecUrl(streamPath), {
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
			yield {
				type: 'error',
				error: { message: `local-exec/messages:stream failed: ${res.status}`, details: body.ok ? body.value : body.text },
			}
			return
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder('utf-8')

		let buffer = ''
		let eventName: string | undefined
		let dataLines: string[] = []

		const flush = (): CodexStreamEvent[] => {
			if (dataLines.length === 0 && !eventName) return []
			const dataText = dataLines.join('\n')
			const ev = eventName || 'message'
			eventName = undefined
			dataLines = []
			if (ev === 'done') return [{ type: 'done' }]
			let parsed: any = dataText
			try {
				parsed = dataText ? JSON.parse(dataText) : {}
			} catch {
				parsed = { raw: dataText }
			}
			return [{ type: 'event', event: ev, data: parsed }]
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
		yield { type: 'done' }
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
	 * Cache Seedream ref images on Django backend before generation.
	 * Backend: POST /api/workflow/seedream/ref-cache
	 */
	async seedreamCacheRefImages(formData: FormData): Promise<NanoBananaCacheRefsResponse> {
		const headers: Record<string, string> = {
			Accept: 'application/json',
		}
		if (this.devToken) headers['X-DEV-TOKEN'] = this.devToken
		const res = await fetch(this.url('/api/third-party/seedream/ref-cache'), {
			method: 'POST',
			headers,
			body: formData,
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `seedream/ref-cache failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
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

	/**
	 * Seedream image generation (SSE stream).
	 * Backend: POST /api/workflow/seedream/generate:stream
	 */
	async *seedreamGenerateStream(
		form: FormData,
		signal?: AbortSignal
	): AsyncGenerator<NanoBananaGenerateStreamEvent, void, void> {
		const headers: Record<string, string> = {
			Accept: 'text/event-stream',
		}
		if (this.devToken) headers['X-DEV-TOKEN'] = this.devToken

		const res = await fetch(this.url('/api/third-party/seedream/generate:stream'), {
			method: 'POST',
			headers,
			body: form,
			signal,
		})

		if (!res.ok || !res.body) {
			const body = await safeJson(res)
			throw new Error(`seedream/generate:stream failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`)
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

	/**
	 * Seedance video generation (SSE stream).
	 * Backend: POST /api/workflow/seedance/generate:stream
	 */
	async *seedanceGenerateStream(
		form: FormData,
		signal?: AbortSignal
	): AsyncGenerator<SeedanceGenerateStreamEvent, void, void> {
		const headers: Record<string, string> = {
			Accept: 'text/event-stream',
		}
		if (this.devToken) headers['X-DEV-TOKEN'] = this.devToken

		const res = await fetch(this.url('/api/third-party/seedance/generate:stream'), {
			method: 'POST',
			headers,
			body: form,
			signal,
		})

		if (!res.ok || !res.body) {
			const body = await safeJson(res)
			throw new Error(
				`seedance/generate:stream failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			)
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder('utf-8')

		let buffer = ''
		let eventName: string | undefined
		let dataLines: string[] = []

		const flush = (): SeedanceGenerateStreamEvent[] => {
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

	/**
	 * Jimeng image generation (SSE stream).
	 * Backend: POST /api/workflow/jimeng/image/generate:stream
	 */
	async *jimengImageGenerateStream(
		form: FormData,
		signal?: AbortSignal
	): AsyncGenerator<JimengGenerateStreamEvent, void, void> {
		const headers: Record<string, string> = {
			Accept: 'text/event-stream',
		}
		if (this.devToken) headers['X-DEV-TOKEN'] = this.devToken

		const res = await fetch(this.url('/api/third-party/jimeng/image/generate:stream'), {
			method: 'POST',
			headers,
			body: form,
			signal,
		})

		if (!res.ok || !res.body) {
			const body = await safeJson(res)
			throw new Error(
				`jimeng/image/generate:stream failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			)
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder('utf-8')

		let buffer = ''
		let eventName: string | undefined
		let dataLines: string[] = []

		const flush = (): JimengGenerateStreamEvent[] => {
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

	/**
	 * Jimeng video generation (SSE stream).
	 * Backend: POST /api/workflow/jimeng/video/generate:stream
	 */
	async *jimengVideoGenerateStream(
		form: FormData,
		signal?: AbortSignal
	): AsyncGenerator<JimengGenerateStreamEvent, void, void> {
		const headers: Record<string, string> = {
			Accept: 'text/event-stream',
		}
		if (this.devToken) headers['X-DEV-TOKEN'] = this.devToken

		const res = await fetch(this.url('/api/workflow/jimeng/video/generate:stream'), {
			method: 'POST',
			headers,
			body: form,
			signal,
		})

		if (!res.ok || !res.body) {
			const body = await safeJson(res)
			throw new Error(
				`jimeng/video/generate:stream failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			)
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder('utf-8')

		let buffer = ''
		let eventName: string | undefined
		let dataLines: string[] = []

		const flush = (): JimengGenerateStreamEvent[] => {
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

	async meshyGenerate(payload: Record<string, any>): Promise<MeshyGenerateResponse> {
		const res = await fetch(this.url('/api/workflow/meshy/generate'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify(payload || {}),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: body.ok ? String((body.value as any)?.error || `meshy/generate failed: ${res.status}`) : `meshy/generate failed: ${res.status} ${body.text}`,
			}
		}
		return (await res.json()) as MeshyGenerateResponse
	}

	async meshyTask(taskId: string, mode: string): Promise<MeshyTaskResponse> {
		const res = await fetch(this.url('/api/workflow/meshy/task'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify({ taskId, mode }),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: body.ok ? String((body.value as any)?.error || `meshy/task failed: ${res.status}`) : `meshy/task failed: ${res.status} ${body.text}`,
			}
		}
		return (await res.json()) as MeshyTaskResponse
	}

	async meshyTasks(query?: {
		status?: string
		target?: '3d' | 'image' | 'all'
		family?: string
		limit?: number
	}): Promise<MeshyTasksListResponse> {
		const search = new URLSearchParams()
		if (query?.status) search.set('status', String(query.status).trim())
		if (query?.target && query.target !== 'all') search.set('target', query.target)
		if (query?.family) search.set('family', String(query.family).trim())
		if (Number.isFinite(query?.limit)) search.set('limit', String(query?.limit))
		const suffix = search.size ? `?${search.toString()}` : ''
		const res = await fetch(this.url(`/api/workflow/meshy/tasks${suffix}`), {
			method: 'GET',
			headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined,
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: body.ok ? String((body.value as any)?.error || `meshy/tasks failed: ${res.status}`) : `meshy/tasks failed: ${res.status} ${body.text}`,
			}
		}
		return (await res.json()) as MeshyTasksListResponse
	}

	async meshyTaskDetail(taskId: string): Promise<MeshyTaskDetailResponse> {
		const search = new URLSearchParams({ taskId })
		const res = await fetch(this.url(`/api/workflow/meshy/task-detail?${search.toString()}`), {
			method: 'GET',
			headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined,
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: body.ok ? String((body.value as any)?.error || `meshy/task-detail failed: ${res.status}`) : `meshy/task-detail failed: ${res.status} ${body.text}`,
			}
		}
		return (await res.json()) as MeshyTaskDetailResponse
	}

	async seedanceTasks(query?: {
		status?: string
		model?: string
		limit?: number
	}): Promise<SeedanceTasksListResponse> {
		const search = new URLSearchParams()
		if (query?.status) search.set('status', String(query.status).trim())
		if (query?.model) search.set('model', String(query.model).trim())
		if (Number.isFinite(query?.limit)) search.set('limit', String(query?.limit))
		const suffix = search.size ? `?${search.toString()}` : ''
		const res = await fetch(this.url(`/api/workflow/seedance/tasks${suffix}`), {
			method: 'GET',
			headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined,
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: body.ok ? String((body.value as any)?.error || `seedance/tasks failed: ${res.status}`) : `seedance/tasks failed: ${res.status} ${body.text}`,
			}
		}
		return (await res.json()) as SeedanceTasksListResponse
	}

	async seedanceTaskDetail(taskId: string): Promise<SeedanceTaskDetailResponse> {
		const search = new URLSearchParams({ taskId })
		const res = await fetch(this.url(`/api/workflow/seedance/task-detail?${search.toString()}`), {
			method: 'GET',
			headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined,
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: body.ok ? String((body.value as any)?.error || `seedance/task-detail failed: ${res.status}`) : `seedance/task-detail failed: ${res.status} ${body.text}`,
			}
		}
		return (await res.json()) as SeedanceTaskDetailResponse
	}

	async seedanceSyncTasks(payload?: {
		taskId?: string
		status?: string
		model?: string
		pageNum?: number
		pageSize?: number
		projectId?: number
		saveMedia?: boolean
	}): Promise<SeedanceSyncTasksResponse> {
		const res = await fetch(this.url('/api/workflow/seedance/tasks:sync'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify(payload || {}),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: body.ok ? String((body.value as any)?.error || `seedance/tasks:sync failed: ${res.status}`) : `seedance/tasks:sync failed: ${res.status} ${body.text}`,
			}
		}
		return (await res.json()) as SeedanceSyncTasksResponse
	}

	async meshyStop(taskId: string, mode: string): Promise<MeshyTaskActionResponse> {
		const res = await fetch(this.url('/api/workflow/meshy/stop'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify({ taskId, mode }),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: body.ok ? String((body.value as any)?.error || `meshy/stop failed: ${res.status}`) : `meshy/stop failed: ${res.status} ${body.text}`,
			}
		}
		return (await res.json()) as MeshyTaskActionResponse
	}

	async meshyDelete(taskId: string, mode: string): Promise<MeshyTaskActionResponse> {
		const res = await fetch(this.url('/api/workflow/meshy/delete'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify({ taskId, mode }),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: body.ok ? String((body.value as any)?.error || `meshy/delete failed: ${res.status}`) : `meshy/delete failed: ${res.status} ${body.text}`,
			}
		}
		return (await res.json()) as MeshyTaskActionResponse
	}

	async meshyBalance(): Promise<MeshyBalanceResponse> {
		const res = await fetch(this.url('/api/workflow/meshy/balance'), {
			method: 'GET',
			headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined,
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: body.ok ? String((body.value as any)?.error || `meshy/balance failed: ${res.status}`) : `meshy/balance failed: ${res.status} ${body.text}`,
			}
		}
		return (await res.json()) as MeshyBalanceResponse
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
