import { getBackendBaseUrl } from './backendConfig'
import { isMigrationMode, hasIpcApi, normalizeTimestamp } from './ipcClient'

export type ComponentTemplate = unknown

export type ComponentLibraryItem = {
	id: string
	createdAt?: string
	savedAt?: string
	templateId: string
	name: string
	template: ComponentTemplate
	thumbAssetId?: string
	thumbUrl?: string
	category?: string
	tags?: string[]
}

export type ImportComponentItem = {
	id?: string
	createdAt?: string
	savedAt?: string
	templateId: string
	name: string
	template: ComponentTemplate
	thumbAssetId?: string
	thumbUrl?: string
	thumbDataUrl?: string
}

export type ListComponentsResponse = {
	items: ComponentLibraryItem[]
	total: number
	limit: number
	offset: number
}

export type UpsertComponentResponse = {
	item: ComponentLibraryItem
	upserted: boolean
}

export type ImportComponentsResponse = {
	ok: boolean
	imported: number
	failed: Array<{ index: number; error: string }>
}

type EditorIpcBridge = {
	dweb?: {
		editor?: {
			components?: {
				list?: (payload?: {
					q?: string
					limit?: number
					offset?: number
				}) => Promise<
					| ListComponentsResponse
					| { items?: ComponentLibraryItem[]; total?: number; limit?: number; offset?: number }
				>
				get?: (payload: { id: string }) => Promise<{ item: ComponentLibraryItem }>
				save?: (payload: unknown) => Promise<{
					ok?: boolean
					item?: ComponentLibraryItem
					upserted?: boolean
					error?: string
				}>
				delete?: (payload: { id: string }) => Promise<{ ok?: boolean; error?: string }>
				import?: (payload: { items: ImportComponentItem[] }) => Promise<ImportComponentsResponse>
			}
		}
	}
}

type ServiceOptions = {
	baseUrl?: string | (() => string)
	devToken?: string
}

const jsonHeaders = (devToken?: string) => {
	const h: Record<string, string> = {
		'Content-Type': 'application/json'
	}
	if (devToken) h['X-DEV-TOKEN'] = devToken
	return h
}

const safeJson = async (res: Response) => {
	const text = await res.text()
	try {
		return { ok: true as const, value: JSON.parse(text) as unknown }
	} catch {
		return { ok: false as const, text }
	}
}

function normalizeComponentItem(raw: unknown): ComponentLibraryItem | null {
	if (!raw || typeof raw !== 'object') return null
	const r = raw as Record<string, unknown>
	const id = String(r.id || '')
	const templateId = String(r.templateId || '')
	const name = String(r.name || '')
	if (!id || !templateId) return null
	return {
		id,
		templateId,
		name,
		template: r.template || {},
		createdAt: normalizeTimestamp(r.createdAt as number | string | undefined),
		savedAt:
			normalizeTimestamp(r.savedAt as number | string | undefined) ||
			normalizeTimestamp(r.updatedAt as number | string | undefined),
		thumbAssetId: r.thumbAssetId ? String(r.thumbAssetId) : undefined,
		thumbUrl: r.thumbUrl ? String(r.thumbUrl) : undefined,
		category: r.category ? String(r.category) : undefined,
		tags: Array.isArray(r.tags) ? r.tags.map(String) : undefined
	}
}

function getIpcBridge(): EditorIpcBridge {
	return window as unknown as EditorIpcBridge
}

export class ComponentLibraryService {
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

	private async listComponentsIpc(params?: {
		q?: string
		limit?: number
		offset?: number
	}): Promise<ListComponentsResponse> {
		const bridge = getIpcBridge()
		const listFn = bridge.dweb?.editor?.components?.list
		if (typeof listFn !== 'function') throw new Error('IPC editor.components.list not available')
		const result = await listFn(params)
		const items = Array.isArray(result?.items) ? result.items : []
		return {
			items: items.map(normalizeComponentItem).filter((i): i is ComponentLibraryItem => i !== null),
			total: Number(result?.total) || items.length,
			limit: Number(result?.limit) || items.length,
			offset: Number(result?.offset) || 0
		}
	}

	async listComponents(params?: {
		q?: string
		limit?: number
		offset?: number
	}): Promise<ListComponentsResponse> {
		if (isMigrationMode() && hasIpcApi()) {
			try {
				return await this.listComponentsIpc(params)
			} catch (e) {
				console.warn(
					'[ComponentLibraryService] IPC listComponents failed, falling back to HTTP:',
					e
				)
			}
		}
		const q = params?.q ? `q=${encodeURIComponent(params.q)}` : ''
		const limit = Number.isFinite(Number(params?.limit)) ? `limit=${Number(params?.limit)}` : ''
		const offset = Number.isFinite(Number(params?.offset)) ? `offset=${Number(params?.offset)}` : ''
		const query = [q, limit, offset].filter(Boolean).join('&')
		const res = await fetch(
			this.url(`/api/editor/component-library/components${query ? `?${query}` : ''}`),
			{
				method: 'GET',
				headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined
			}
		)
		if (!res.ok) {
			const body = await safeJson(res)
			throw new Error(
				`listComponents failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			)
		}
		return (await res.json()) as ListComponentsResponse
	}

	private async upsertComponentIpc(payload: {
		templateId: string
		name: string
		template: ComponentTemplate
		thumbAssetId?: string
		thumbDataUrl?: string
		clientId?: string
		createdAt?: string
	}): Promise<UpsertComponentResponse> {
		const bridge = getIpcBridge()
		const saveFn = bridge.dweb?.editor?.components?.save
		if (typeof saveFn !== 'function') throw new Error('IPC editor.components.save not available')
		const result = await saveFn(payload)
		if (result?.ok === false) throw new Error(result.error || 'save failed')
		const item = normalizeComponentItem(result?.item)
		if (!item) throw new Error('save returned invalid item')
		return { item, upserted: Boolean(result?.upserted) }
	}

	async upsertComponent(payload: {
		templateId: string
		name: string
		template: ComponentTemplate
		thumbAssetId?: string
		thumbDataUrl?: string
		clientId?: string
		createdAt?: string
	}): Promise<UpsertComponentResponse> {
		if (isMigrationMode() && hasIpcApi()) {
			try {
				return await this.upsertComponentIpc(payload)
			} catch (e) {
				console.warn(
					'[ComponentLibraryService] IPC upsertComponent failed, falling back to HTTP:',
					e
				)
			}
		}
		const res = await fetch(this.url('/api/editor/component-library/components'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify(payload)
		})
		if (!res.ok) {
			const body = await safeJson(res)
			throw new Error(
				`upsertComponent failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			)
		}
		return (await res.json()) as UpsertComponentResponse
	}

	private async deleteComponentIpc(id: string): Promise<{ ok: boolean }> {
		const bridge = getIpcBridge()
		const deleteFn = bridge.dweb?.editor?.components?.delete
		if (typeof deleteFn !== 'function')
			throw new Error('IPC editor.components.delete not available')
		const result = await deleteFn({ id })
		if (result?.ok === false) throw new Error(result.error || 'delete failed')
		return { ok: true }
	}

	async deleteComponent(id: string): Promise<{ ok: boolean }> {
		if (isMigrationMode() && hasIpcApi()) {
			try {
				return await this.deleteComponentIpc(id)
			} catch (e) {
				console.warn(
					'[ComponentLibraryService] IPC deleteComponent failed, falling back to HTTP:',
					e
				)
			}
		}
		const res = await fetch(
			this.url(`/api/editor/component-library/components/${encodeURIComponent(id)}`),
			{
				method: 'DELETE',
				headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined
			}
		)
		if (!res.ok) {
			const body = await safeJson(res)
			throw new Error(
				`deleteComponent failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			)
		}
		return (await res.json()) as { ok: boolean }
	}

	private async importComponentsIpc(
		items: ImportComponentItem[]
	): Promise<ImportComponentsResponse> {
		const bridge = getIpcBridge()
		const importFn = bridge.dweb?.editor?.components?.import
		if (typeof importFn !== 'function')
			throw new Error('IPC editor.components.import not available')
		return await importFn({ items })
	}

	async importComponents(items: ImportComponentItem[]): Promise<ImportComponentsResponse> {
		if (isMigrationMode() && hasIpcApi()) {
			try {
				return await this.importComponentsIpc(items)
			} catch (e) {
				console.warn(
					'[ComponentLibraryService] IPC importComponents failed, falling back to HTTP:',
					e
				)
			}
		}
		const res = await fetch(this.url('/api/editor/component-library/import'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify({ items })
		})
		if (!res.ok) {
			const body = await safeJson(res)
			throw new Error(
				`importComponents failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			)
		}
		return (await res.json()) as ImportComponentsResponse
	}
}
