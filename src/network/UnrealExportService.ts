import { getBackendBaseUrl } from './backendConfig'

type ServiceOptions = {
	baseUrl?: string | (() => string)
}

type UnrealExportSessionStatus = 'connected' | 'stale'

export type UnrealExportSessionInfo = {
	sessionId: string
	displayName?: string
	projectName?: string
	projectPath?: string
	saveDirectory?: string
	assetRootPath?: string
	pluginVersion?: string
	engineVersion?: string
	hostName?: string
	connectedAt?: number
	lastSeenAt?: number
	activeJobId?: string
	status?: UnrealExportSessionStatus
}

export type UnrealExportSessionsResponse =
	| { ok: true; sessions: UnrealExportSessionInfo[] }
	| { ok: false; error: string; status?: number }

export type UnrealExportCreateJobResponse =
	| { ok: true; job: { jobId: string; status: string; message?: string; createdAt?: number } }
	| { ok: false; error: string; status?: number }

export type UnrealExportJobInfo = {
	jobId: string
	targetSessionId?: string
	sourceNodeId?: string
	sceneName?: string
	status: 'queued' | 'picked' | 'downloading' | 'importing' | 'assembling-actor' | 'completed' | 'failed' | string
	message?: string
	createdAt?: number
	updatedAt?: number
	resultData?: {
		progress?: number
		stage?: string
		assetRootPath?: string
		modelsAssetPath?: string
		blueprintAssetPath?: string
		importedAssetCount?: number
		pendingModelImportCount?: number
		[k: string]: any
	}
	exportPayload?: Record<string, any>
}

export type UnrealExportJobResponse =
	| { ok: true; job: UnrealExportJobInfo | null }
	| { ok: false; error: string; status?: number }

const jsonHeaders = {
	'Content-Type': 'application/json',
}

const safeJson = async (res: Response) => {
	const text = await res.text()
	try {
		return { ok: true as const, value: JSON.parse(text) }
	} catch {
		return { ok: false as const, text }
	}
}

export class UnrealExportService {
	private readonly getBaseUrl: () => string

	constructor(opts: ServiceOptions = {}) {
		if (typeof opts.baseUrl === 'function') this.getBaseUrl = opts.baseUrl
		else if (typeof opts.baseUrl === 'string') {
			const fixed = opts.baseUrl
			this.getBaseUrl = () => fixed
		} else {
			this.getBaseUrl = getBackendBaseUrl
		}
	}

	private url(path: string) {
		const base = (this.getBaseUrl?.() ?? '').trim().replace(/\/$/, '')
		if (!base) return path
		if (path.startsWith('/')) return `${base}${path}`
		return `${base}/${path}`
	}

	async listSessions(): Promise<UnrealExportSessionsResponse> {
		const res = await fetch(this.url('/api/agent-skills/unreal-export/sessions'), { method: 'GET' })
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `unreal-export/sessions failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
			}
		}
		return (await res.json()) as UnrealExportSessionsResponse
	}

	async createJob(payload: {
		targetSessionId: string
		sourceNodeId: string
		sceneName: string
		exportPayload: Record<string, any>
	}): Promise<UnrealExportCreateJobResponse> {
		const res = await fetch(this.url('/api/agent-skills/unreal-export/jobs/create'), {
			method: 'POST',
			headers: jsonHeaders,
			body: JSON.stringify(payload ?? {}),
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `unreal-export/jobs/create failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
			}
		}
		return (await res.json()) as UnrealExportCreateJobResponse
	}

	async getJob(jobId: string): Promise<UnrealExportJobResponse> {
		const normalizedJobId = String(jobId ?? '').trim()
		if (!normalizedJobId) return { ok: false, error: 'jobId is required', status: 400 }
		const res = await fetch(this.url(`/api/agent-skills/unreal-export/jobs/${encodeURIComponent(normalizedJobId)}`), { method: 'GET' })
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `unreal-export/jobs/${normalizedJobId} failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`,
			}
		}
		return (await res.json()) as UnrealExportJobResponse
	}
}