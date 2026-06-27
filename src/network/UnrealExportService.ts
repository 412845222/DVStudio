import { getBackendBaseUrl } from './backendConfig'
import { logBlueprintRequest } from './blueprintRequestLog'
import { getErrorMessage } from '../types/utils'
import { isMigrationMode, hasIpcModule } from './ipcClient'

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

export type UnrealExportResultData = {
	progress?: number
	stage?: string
	assetRootPath?: string
	modelsAssetPath?: string
	blueprintAssetPath?: string
	importedAssetCount?: number
	pendingModelImportCount?: number
	[k: string]: unknown
}

export type UnrealExportJobInfo = {
	jobId: string
	targetSessionId?: string
	sourceNodeId?: string
	sceneName?: string
	status:
		| 'queued'
		| 'picked'
		| 'downloading'
		| 'importing'
		| 'assembling-actor'
		| 'completed'
		| 'failed'
		| string
	message?: string
	createdAt?: number
	updatedAt?: number
	resultData?: UnrealExportResultData
	exportPayload?: Record<string, unknown>
}

export type UnrealExportJobResponse =
	| { ok: true; job: UnrealExportJobInfo | null }
	| { ok: false; error: string; status?: number }

export type UnrealExportRequest = {
	targetSessionId: string
	sourceNodeId: string
	sceneName: string
	exportPayload: Record<string, unknown>
}

const jsonHeaders = {
	'Content-Type': 'application/json'
}

const safeJson = async (res: Response) => {
	const text = await res.text()
	try {
		return { ok: true as const, value: JSON.parse(text) as unknown }
	} catch {
		return { ok: false as const, text }
	}
}

function isAgentSkillsIpcAvailable(): boolean {
	return isMigrationMode() && hasIpcModule('agentSkills') && typeof window.dweb?.agentSkills === 'object'
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

	private async fetchWithLog(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
		const url = typeof input === 'string' ? input : (input as Request).url || String(input)
		const method = String(init?.method || 'GET').toUpperCase()
		const start =
			typeof performance !== 'undefined' && typeof performance.now === 'function'
				? performance.now()
				: Date.now()
		try {
			const res = await fetch(input, init)
			const end =
				typeof performance !== 'undefined' && typeof performance.now === 'function'
					? performance.now()
					: Date.now()
			logBlueprintRequest({
				url,
				method,
				status: res.status,
				durationMs: Math.max(0, Math.round(end - start)),
				tag: 'unreal'
			})
			return res
		} catch (err: unknown) {
			const end =
				typeof performance !== 'undefined' && typeof performance.now === 'function'
					? performance.now()
					: Date.now()
			logBlueprintRequest({
				url,
				method,
				durationMs: Math.max(0, Math.round(end - start)),
				errorMessage: getErrorMessage(err),
				tag: 'unreal'
			})
			throw err
		}
	}

	async listSessions(): Promise<UnrealExportSessionsResponse> {
		if (isAgentSkillsIpcAvailable()) {
			try {
				const result = await window.dweb?.agentSkills?.unreal?.sessions?.()
				if (result) {
					const r = result as any
					const sessions = Array.isArray(r.sessions) ? r.sessions.map((s: any) => ({
						sessionId: s.id || s.sessionId,
						displayName: s.clientInfo?.displayName || s.displayName,
						projectName: s.clientInfo?.projectName || s.projectName,
						projectPath: s.clientInfo?.projectPath || s.projectPath,
						saveDirectory: s.clientInfo?.saveDirectory || s.saveDirectory,
						assetRootPath: s.clientInfo?.assetRootPath || s.assetRootPath,
						pluginVersion: s.clientInfo?.pluginVersion || s.pluginVersion,
						engineVersion: s.clientInfo?.engineVersion || s.engineVersion,
						hostName: s.clientInfo?.hostName || s.hostName,
						connectedAt: s.createdAt || s.connectedAt,
						lastSeenAt: s.lastHeartbeat || s.lastSeenAt,
						activeJobId: s.jobs?.[s.jobs.length - 1] || s.activeJobId,
						status: Date.now() - (s.lastHeartbeat || 0) > 30000 ? 'stale' : 'connected'
					})) : []
					return { ok: true, sessions }
				}
			} catch (err) {
				console.warn('[UnrealExportService] unreal.sessions IPC failed:', err)
			}
		}
		const res = await this.fetchWithLog(this.url('/api/agent-skills/unreal-export/sessions'), {
			method: 'GET'
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `unreal-export/sessions failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as UnrealExportSessionsResponse
	}

	async createJob(payload: UnrealExportRequest): Promise<UnrealExportCreateJobResponse> {
		if (isAgentSkillsIpcAvailable()) {
			try {
				const result = await window.dweb?.agentSkills?.unreal?.createJob?.({
					sessionId: payload.targetSessionId,
					type: 'export',
					payload: {
						sourceNodeId: payload.sourceNodeId,
						sceneName: payload.sceneName,
						...payload.exportPayload
					}
				})
				if (result) {
					const r = result as any
					if (r.ok === false) {
						return { ok: false, error: r.error || 'createJob failed', status: r.status }
					}
					return {
						ok: true,
						job: {
							jobId: r.jobId || r.job?.id,
							status: r.job?.status || 'pending',
							message: r.job?.message,
							createdAt: r.job?.createdAt
						}
					}
				}
			} catch (err) {
				console.warn('[UnrealExportService] unreal.createJob IPC failed:', err)
			}
		}
		const res = await this.fetchWithLog(this.url('/api/agent-skills/unreal-export/jobs/create'), {
			method: 'POST',
			headers: jsonHeaders,
			body: JSON.stringify(payload ?? {})
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `unreal-export/jobs/create failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as UnrealExportCreateJobResponse
	}

	async getJob(jobId: string): Promise<UnrealExportJobResponse> {
		const normalizedJobId = String(jobId ?? '').trim()
		if (!normalizedJobId) return { ok: false, error: 'jobId is required', status: 400 }

		if (isAgentSkillsIpcAvailable()) {
			try {
				const result = await window.dweb?.agentSkills?.unreal?.jobDetail?.({ jobId: normalizedJobId })
				if (result) {
					const r = result as any
					if (r.ok === false) {
						return { ok: false, error: r.error || 'job not found', status: r.status || 404 }
					}
					if (r.job) {
						const j = r.job
						return {
							ok: true,
							job: {
								jobId: j.id || normalizedJobId,
								targetSessionId: j.sessionId,
								sourceNodeId: j.payload?.sourceNodeId,
								sceneName: j.payload?.sceneName,
								status: j.status || 'unknown',
								message: j.error || j.result?.message,
								createdAt: j.createdAt,
								updatedAt: j.updatedAt,
								resultData: j.result,
								exportPayload: j.payload
							}
						}
					}
				}
			} catch (err) {
				console.warn('[UnrealExportService] unreal.jobDetail IPC failed:', err)
			}
		}

		const res = await this.fetchWithLog(
			this.url(`/api/agent-skills/unreal-export/jobs/${encodeURIComponent(normalizedJobId)}`),
			{ method: 'GET' }
		)
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `unreal-export/jobs/${normalizedJobId} failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as UnrealExportJobResponse
	}

	async getHttpPort(): Promise<{ ok: boolean; port?: number; error?: string }> {
		if (isAgentSkillsIpcAvailable()) {
			try {
				const result = await window.dweb?.agentSkills?.unreal?.getHttpPort?.()
				if (result) return result as { ok: boolean; port?: number; error?: string }
			} catch (err) {
				console.warn('[UnrealExportService] unreal.getHttpPort IPC failed:', err)
			}
		}
		return { ok: false, error: 'IPC not available' }
	}
}
