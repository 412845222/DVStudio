import { getBackendBaseUrl } from './backendConfig'
import { logBlueprintRequest } from './blueprintRequestLog'
import { isRecord, isString, isNumber, isArray, getErrorMessage } from '../types/utils'

type ServiceOptions = {
	baseUrl?: string | (() => string)
}

export type BlueprintProjectItem = {
	id: number
	name: string
	data?: string
	rootPath?: string
	createdAt?: number | null
	updatedAt?: number | null
}

export type BlueprintSnapshot = unknown

type ListProjectsResponse =
	| { ok: true; projects: BlueprintProjectItem[] }
	| { ok: false; error: string; status?: number }

type SaveProjectRequest = {
	name: string
	snapshot: BlueprintSnapshot
	projectId?: number | null
}

type SaveProjectResponse =
	| { ok: true; project: BlueprintProjectItem }
	| { ok: false; error: string; status?: number }

type LoadProjectResponse =
	| { ok: true; project: BlueprintProjectItem; snapshot: BlueprintSnapshot }
	| { ok: false; error: string; status?: number }

type DeleteProjectResponse =
	| { ok: true; id: number }
	| { ok: false; error: string; status?: number }

type OpenProjectFolderResponse =
	| { ok: true; project: BlueprintProjectItem }
	| { ok: false; error: string; status?: number }

export type BlueprintUploadedAsset = {
	kind: string
	name: string
	contentType?: string
	size?: number
	relativePath: string
	projectRelativePath?: string
	absolutePath: string
	url: string
	sourcePath?: string
}

export type BlueprintAssetKind = 'image' | 'video' | 'file' | 'model'

type UploadAssetResponse =
	| { ok: true; asset: BlueprintUploadedAsset }
	| { ok: false; error: string; status?: number }

type ImportAssetResponse =
	| { ok: true; asset: BlueprintUploadedAsset }
	| { ok: false; error: string; status?: number }

type DeleteAssetResponse =
	| { ok: true; fileDeleted: boolean; path?: string }
	| { ok: false; error: string; status?: number }

type ResolveAssetResponse =
	| { ok: true; resolved: boolean; asset?: BlueprintUploadedAsset; reason?: string }
	| { ok: false; error: string; status?: number }

type RepairAssetResponse =
	| { ok: true; repaired: boolean; asset?: BlueprintUploadedAsset; reason?: string }
	| { ok: false; error: string; status?: number }

type ElectronBridge = {
	dweb?: {
		aiworkflow?: {
			db?: {
				_initState?: () => Promise<{ ok?: boolean } | null>
				_ensureInitialized?: () => Promise<{ ok?: boolean } | null>
				projects?: {
					list?: () => Promise<unknown>
					save?: (payload: unknown) => Promise<unknown>
					load?: (payload: { id: number }) => Promise<unknown>
					delete?: (payload: { id: number }) => Promise<unknown>
					openFolder?: (payload: unknown) => Promise<unknown>
				}
			}
			uploadProjectAsset?: (payload: unknown) => Promise<unknown>
			importProjectAsset?: (payload: unknown) => Promise<unknown>
			deleteProjectAsset?: (payload: unknown) => Promise<unknown>
			resolveProjectAsset?: (payload: unknown) => Promise<unknown>
			repairProjectAsset?: (payload: unknown) => Promise<unknown>
		}
		common?: {
			getBackendBaseUrl?: () => string
		}
		__DWEB_RUNTIME__?: {
			platform?: string
		}
	}
}

const jsonHeaders = {
	'Content-Type': 'application/json'
}

const normalizeForIpc = (input: unknown): unknown => {
	const seen = new WeakSet<object>()
	const walk = (value: unknown): unknown => {
		if (value === null) return null
		const t = typeof value
		if (t === 'string' || t === 'number' || t === 'boolean') return value
		if (t === 'bigint') return Number(value)
		if (t === 'undefined' || t === 'function' || t === 'symbol') return null
		if (t !== 'object') return null

		const obj = value as object
		if (obj instanceof Date) return obj.toISOString()
		if (obj instanceof ArrayBuffer) return obj
		if (Array.isArray(obj)) return obj.map((item) => walk(item))

		if (seen.has(obj)) return null
		seen.add(obj)
		const out: Record<string, unknown> = {}
		for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
			out[k] = walk(v)
		}
		return out
	}
	return walk(input)
}

const safeJson = async (res: Response) => {
	const text = await res.text()
	try {
		return { ok: true as const, value: JSON.parse(text) as unknown }
	} catch {
		return { ok: false as const, text }
	}
}

const coerceProjectItem = (v: unknown): BlueprintProjectItem | null => {
	if (!isRecord(v)) return null
	const id = v.id
	const name = v.name
	if (!isNumber(id) || !isString(name)) return null
	const data = v.data
	return {
		id,
		name,
		data: isString(data) ? data : undefined,
		rootPath: isString(v.rootPath) ? v.rootPath : undefined,
		createdAt: isNumber(v.createdAt) ? v.createdAt : null,
		updatedAt: isNumber(v.updatedAt) ? v.updatedAt : null
	}
}

const coerceUploadedAsset = (v: unknown): BlueprintUploadedAsset | null => {
	if (!isRecord(v)) return null
	const kind = v.kind
	const name = v.name
	const relativePath = v.relativePath
	const absolutePath = v.absolutePath
	const url = v.url
	if (
		!isString(kind) ||
		!isString(name) ||
		!isString(relativePath) ||
		!isString(absolutePath) ||
		!isString(url)
	)
		return null
	return {
		kind,
		name,
		relativePath,
		absolutePath,
		url,
		contentType: isString(v.contentType) ? v.contentType : undefined,
		size: isNumber(v.size) ? v.size : undefined,
		projectRelativePath: isString(v.projectRelativePath) ? v.projectRelativePath : undefined,
		sourcePath: isString(v.sourcePath) ? v.sourcePath : undefined
	}
}

export class BlueprintProjectService {
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

	private getElectronBridge(): ElectronBridge {
		return window as unknown as ElectronBridge
	}

	private async _ensureElectronLocalDb(): Promise<boolean> {
		const bridge = this.getElectronBridge()
		const db = bridge.dweb?.aiworkflow?.db
		if (!db) return false
		try {
			const state = await db._initState?.()
			if (isRecord(state) && state.ok === true) return true
			const retry = await db._ensureInitialized?.()
			return isRecord(retry) && retry.ok === true
		} catch {
			return false
		}
	}

	private isElectronRuntime(): boolean {
		const bridge = this.getElectronBridge()
		return (
			bridge.dweb?.__DWEB_RUNTIME__?.platform === 'electron' ||
			typeof bridge.dweb?.common?.getBackendBaseUrl === 'function'
		)
	}

	private async electronDb<T>(
		fn: (projects: {
			list?: () => unknown
			save?: (p: unknown) => unknown
			load?: (p: unknown) => unknown
			delete?: (p: unknown) => unknown
			openFolder?: (p: unknown) => unknown
		}) => Promise<T> | T
	): Promise<T | null> {
		const bridge = this.getElectronBridge()
		const dweb = bridge.dweb
		const aiworkflow = dweb?.aiworkflow
		const db = aiworkflow?.db
		const projects = db?.projects as
			| {
					list?: () => unknown
					save?: (p: unknown) => unknown
					load?: (p: unknown) => unknown
					delete?: (p: unknown) => unknown
					openFolder?: (p: unknown) => unknown
			  }
			| undefined
		if (typeof projects !== 'object' || projects === null) return null
		const ready = await this._ensureElectronLocalDb()
		if (!ready) return null
		try {
			return await Promise.resolve(fn(projects))
		} catch {
			return null
		}
	}

	private async electronAsset<T>(
		opName:
			| 'uploadProjectAsset'
			| 'importProjectAsset'
			| 'deleteProjectAsset'
			| 'resolveProjectAsset'
			| 'repairProjectAsset',
		payload: unknown
	): Promise<T | null> {
		const bridge = this.getElectronBridge()
		const aiworkflow = bridge.dweb?.aiworkflow
		if (!aiworkflow || typeof aiworkflow[opName] !== 'function') return null
		try {
			const fn = aiworkflow[opName] as (p: unknown) => Promise<T>
			const r = await fn(normalizeForIpc(payload ?? {}))
			return r
		} catch {
			return null
		}
	}

	private url(path: string) {
		const base = (this.getBaseUrl?.() ?? '').trim().replace(/\/$/, '')
		if (!base) return path
		if (path.startsWith('/')) return `${base}${path}`
		return `${base}/${path}`
	}

	private async fetchWithLog(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
		const url =
			typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
		let method = 'GET'
		if (init?.method) {
			method = init.method
		} else if (typeof input !== 'string' && 'method' in input) {
			method = String((input as { method?: unknown }).method ?? 'GET')
		}
		method = method.toUpperCase()
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
				tag: 'project'
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
				tag: 'project'
			})
			throw err
		}
	}

	async listProjects(): Promise<ListProjectsResponse> {
		const electronResult = await this.electronDb((projects) => projects.list?.())
		if (electronResult !== null && electronResult !== undefined) {
			let rows: BlueprintProjectItem[] = []
			if (isArray(electronResult)) {
				rows = electronResult
					.map(coerceProjectItem)
					.filter((p): p is BlueprintProjectItem => p !== null)
			} else if (isRecord(electronResult) && isArray(electronResult.projects)) {
				rows = electronResult.projects
					.map(coerceProjectItem)
					.filter((p): p is BlueprintProjectItem => p !== null)
			}
			return { ok: true, projects: rows }
		}
		if (this.isElectronRuntime()) {
			return {
				ok: false,
				error: 'electron localdb unavailable: projects/list requires localdb in Electron runtime'
			}
		}
		const res = await this.fetchWithLog(this.url('/api/workflow/projects/list'), { method: 'GET' })
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `projects/list failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as ListProjectsResponse
	}

	async saveProject(payload: SaveProjectRequest): Promise<SaveProjectResponse> {
		const safeSnapshot = normalizeForIpc(payload.snapshot)
		const electronResult = await this.electronDb((projects) =>
			projects.save?.({
				projectId: payload.projectId,
				snapshot: safeSnapshot,
				name: payload.name
			})
		)
		if (electronResult !== null && electronResult !== undefined) {
			const resultRecord = isRecord(electronResult) ? electronResult : null
			const project =
				resultRecord && isRecord(resultRecord.project)
					? coerceProjectItem(resultRecord.project)
					: coerceProjectItem(electronResult)
			if (project) {
				return { ok: true, project }
			}
		}
		if (this.isElectronRuntime()) {
			return {
				ok: false,
				error: 'electron localdb unavailable: projects/save requires localdb in Electron runtime'
			}
		}
		const res = await this.fetchWithLog(this.url('/api/workflow/projects/save'), {
			method: 'POST',
			headers: jsonHeaders,
			body: JSON.stringify(payload)
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `projects/save failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as SaveProjectResponse
	}

	async loadProject(projectId: number): Promise<LoadProjectResponse> {
		const electronResult = await this.electronDb((projects) => projects.load?.({ id: projectId }))
		if (electronResult !== null && electronResult !== undefined) {
			const resultRecord = isRecord(electronResult) ? electronResult : null
			if (resultRecord && isRecord(resultRecord.project)) {
				const project = coerceProjectItem(resultRecord.project)
				const snapshot = resultRecord.snapshot
				if (project) {
					return {
						ok: true,
						project,
						snapshot
					}
				}
			} else {
				const project = coerceProjectItem(electronResult)
				if (project) {
					let snapshot: unknown = undefined
					if (project.data) {
						try {
							snapshot = JSON.parse(project.data)
						} catch {
							snapshot = undefined
						}
					}
					return {
						ok: true,
						project,
						snapshot
					}
				}
			}
		}
		if (this.isElectronRuntime()) {
			return {
				ok: false,
				error: 'electron localdb unavailable: projects/load requires localdb in Electron runtime'
			}
		}
		const res = await this.fetchWithLog(
			this.url(`/api/workflow/projects/load?id=${encodeURIComponent(String(projectId))}`),
			{
				method: 'GET'
			}
		)
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `projects/load failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as LoadProjectResponse
	}

	async deleteProject(projectId: number): Promise<DeleteProjectResponse> {
		const electronResult = await this.electronDb((projects) => projects.delete?.({ id: projectId }))
		if (electronResult !== null && electronResult !== undefined) {
			const resultRecord = isRecord(electronResult) ? electronResult : null
			if (resultRecord && resultRecord.ok === false) {
				return { ok: false, error: getErrorMessage(resultRecord.error) || 'delete failed' }
			}
			return { ok: true, id: projectId }
		}
		if (this.isElectronRuntime()) {
			return {
				ok: false,
				error: 'electron localdb unavailable: projects/delete requires localdb in Electron runtime'
			}
		}
		const res = await this.fetchWithLog(this.url('/api/workflow/projects/delete'), {
			method: 'POST',
			headers: jsonHeaders,
			body: JSON.stringify({ id: projectId })
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `projects/delete failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as DeleteProjectResponse
	}

	async openProjectFolder(payload: {
		rootPath: string
		name?: string
		create?: boolean
	}): Promise<OpenProjectFolderResponse> {
		const electronResult = await this.electronDb((projects) =>
			projects.openFolder?.({
				rootPath: payload.rootPath,
				name: payload.name,
				create: payload.create
			})
		)
		if (electronResult !== null && electronResult !== undefined) {
			const resultRecord = isRecord(electronResult) ? electronResult : null
			const project =
				resultRecord && isRecord(resultRecord.project)
					? coerceProjectItem(resultRecord.project)
					: coerceProjectItem(electronResult)
			if (project) {
				return { ok: true, project }
			}
		}
		if (this.isElectronRuntime()) {
			return {
				ok: false,
				error:
					'electron localdb unavailable: projects/folder/open requires localdb in Electron runtime'
			}
		}
		const res = await this.fetchWithLog(this.url('/api/workflow/projects/folder/open'), {
			method: 'POST',
			headers: jsonHeaders,
			body: JSON.stringify(payload ?? {})
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `projects/folder/open failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as OpenProjectFolderResponse
	}

	async uploadAsset(
		file: File,
		kind: BlueprintAssetKind,
		opts?: { projectId?: number | null; bucket?: 'assets' | 'thumbnails' }
	): Promise<UploadAssetResponse> {
		if (this.isElectronRuntime()) {
			try {
				const ab = await file.arrayBuffer()
				const electronResult = await this.electronAsset<unknown>('uploadProjectAsset', {
					name: file.name,
					kind,
					contentType: file.type || undefined,
					arrayBuffer: ab,
					projectId: opts?.projectId ? Number(opts.projectId) : null,
					bucket: opts?.bucket
				})
				const resultRecord = isRecord(electronResult) ? electronResult : null
				if (resultRecord && resultRecord.ok === true) {
					const asset = coerceUploadedAsset(resultRecord.asset)
					if (asset) {
						return { ok: true, asset }
					}
				}
				if (resultRecord && resultRecord.ok === false) {
					return {
						ok: false,
						error: `upload via electron failed: ${getErrorMessage(resultRecord.error) || 'unknown'}`
					}
				}
			} catch (err: unknown) {
				return { ok: false, error: `upload via electron failed: ${getErrorMessage(err)}` }
			}
		}
		const fd = new FormData()
		fd.append('file', file)
		fd.append('kind', kind)
		if (opts?.projectId && Number.isFinite(Number(opts.projectId)) && Number(opts.projectId) > 0) {
			fd.append('projectId', String(Number(opts.projectId)))
		}
		if (opts?.bucket === 'thumbnails') fd.append('bucket', 'thumbnails')
		const res = await this.fetchWithLog(this.url('/api/workflow/projects/assets/upload'), {
			method: 'POST',
			body: fd
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `projects/assets/upload failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as UploadAssetResponse
	}

	async importAsset(payload: {
		kind: BlueprintAssetKind
		name?: string
		sourcePath?: string
		sourceUrl?: string
		baseUrl?: string
		filename?: string
		subfolder?: string
		type?: string
		projectId?: number | null
		bucket?: 'assets' | 'thumbnails'
	}): Promise<ImportAssetResponse> {
		if (this.isElectronRuntime()) {
			const electronResult = await this.electronAsset<unknown>('importProjectAsset', {
				projectId: payload.projectId ? Number(payload.projectId) : null,
				kind: payload.kind,
				name: payload.name,
				sourcePath: payload.sourcePath,
				sourceUrl: payload.sourceUrl,
				bucket: payload.bucket
			})
			const resultRecord = isRecord(electronResult) ? electronResult : null
			if (resultRecord && resultRecord.ok === true) {
				const asset = coerceUploadedAsset(resultRecord.asset)
				if (asset) {
					return { ok: true, asset }
				}
			}
			if (resultRecord && resultRecord.ok === false) {
				return {
					ok: false,
					error: `import via electron failed: ${getErrorMessage(resultRecord.error) || 'unknown'}`
				}
			}
		}
		const res = await this.fetchWithLog(this.url('/api/workflow/projects/assets/import'), {
			method: 'POST',
			headers: jsonHeaders,
			body: JSON.stringify(payload ?? {})
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `projects/assets/import failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as ImportAssetResponse
	}

	async deleteAsset(payload: {
		projectId?: number | null
		resourceId?: string
		url?: string
		sourcePath?: string
		relativePath?: string
		projectRelativePath?: string
	}): Promise<DeleteAssetResponse> {
		if (this.isElectronRuntime()) {
			const electronResult = await this.electronAsset<unknown>('deleteProjectAsset', {
				projectId: payload.projectId ? Number(payload.projectId) : null,
				relativePath: payload.relativePath,
				url: payload.url,
				sourcePath: payload.sourcePath
			})
			const resultRecord = isRecord(electronResult) ? electronResult : null
			if (resultRecord && resultRecord.ok === true) {
				return {
					ok: true,
					fileDeleted: Boolean(resultRecord.fileDeleted),
					path: isString(resultRecord.path) ? resultRecord.path : undefined
				}
			}
			if (resultRecord && resultRecord.ok === false) {
				return {
					ok: false,
					error: `delete via electron failed: ${getErrorMessage(resultRecord.error) || 'unknown'}`
				}
			}
		}
		const res = await this.fetchWithLog(this.url('/api/workflow/projects/assets/delete'), {
			method: 'POST',
			headers: jsonHeaders,
			body: JSON.stringify(payload ?? {})
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `projects/assets/delete failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as DeleteAssetResponse
	}

	async resolveAsset(payload: {
		projectId?: number | null
		kind?: BlueprintAssetKind
		name?: string
		sourcePath?: string
		sourceUrl?: string
		projectRelativePath?: string
	}): Promise<ResolveAssetResponse> {
		if (this.isElectronRuntime()) {
			const electronResult = await this.electronAsset<unknown>('resolveProjectAsset', {
				projectId: payload.projectId ? Number(payload.projectId) : null,
				kind: payload.kind,
				name: payload.name,
				sourcePath: payload.sourcePath,
				sourceUrl: payload.sourceUrl,
				projectRelativePath: payload.projectRelativePath
			})
			const resultRecord = isRecord(electronResult) ? electronResult : null
			if (resultRecord && resultRecord.ok === true) {
				const asset = coerceUploadedAsset(resultRecord.asset)
				return {
					ok: true,
					resolved: Boolean(resultRecord.resolved),
					asset: asset ?? undefined,
					reason: isString(resultRecord.reason) ? resultRecord.reason : undefined
				}
			}
			if (resultRecord && resultRecord.ok === false) {
				return {
					ok: false,
					error: `resolve via electron failed: ${getErrorMessage(resultRecord.error) || 'unknown'}`
				}
			}
		}
		const res = await this.fetchWithLog(this.url('/api/workflow/projects/assets/resolve'), {
			method: 'POST',
			headers: jsonHeaders,
			body: JSON.stringify(payload ?? {})
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `projects/assets/resolve failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as ResolveAssetResponse
	}

	async repairAsset(payload: {
		projectId?: number | null
		kind?: BlueprintAssetKind
		name?: string
		projectRelativePath?: string
	}): Promise<RepairAssetResponse> {
		if (this.isElectronRuntime()) {
			const electronResult = await this.electronAsset<unknown>('repairProjectAsset', {
				projectId: payload.projectId ? Number(payload.projectId) : null,
				kind: payload.kind,
				name: payload.name,
				projectRelativePath: payload.projectRelativePath
			})
			const resultRecord = isRecord(electronResult) ? electronResult : null
			if (resultRecord && resultRecord.ok === true) {
				const asset = coerceUploadedAsset(resultRecord.asset)
				return {
					ok: true,
					repaired: Boolean(resultRecord.repaired),
					asset: asset ?? undefined,
					reason: isString(resultRecord.reason) ? resultRecord.reason : undefined
				}
			}
			if (resultRecord && resultRecord.ok === false) {
				return {
					ok: false,
					error: `repair via electron failed: ${getErrorMessage(resultRecord.error) || 'unknown'}`
				}
			}
		}
		const res = await this.fetchWithLog(this.url('/api/workflow/projects/assets/repair'), {
			method: 'POST',
			headers: jsonHeaders,
			body: JSON.stringify(payload ?? {})
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `projects/assets/repair failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as RepairAssetResponse
	}
}
