import { getBackendBaseUrl } from './backendConfig'

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

	async listComponents(params?: {
		q?: string
		limit?: number
		offset?: number
	}): Promise<ListComponentsResponse> {
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

	async upsertComponent(payload: {
		templateId: string
		name: string
		template: ComponentTemplate
		thumbAssetId?: string
		thumbDataUrl?: string
		clientId?: string
		createdAt?: string
	}): Promise<UpsertComponentResponse> {
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

	async deleteComponent(id: string): Promise<{ ok: boolean }> {
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

	async importComponents(items: ImportComponentItem[]): Promise<ImportComponentsResponse> {
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
