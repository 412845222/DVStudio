const STORAGE_KEY = 'dweb.backendBaseUrl'
const DEFAULT_BACKEND_BASE_URL = 'http://127.0.0.1:5800'

const normalizeBaseUrl = (url: string) => {
	const v = (url ?? '').trim()
	if (!v) return ''
	return v.endsWith('/') ? v.slice(0, -1) : v
}

/**
 * Backend base URL resolution priority:
 * 1) window.__DWEB_BACKEND_BASE_URL (runtime override)
 * 2) import.meta.env.VITE_BACKEND_BASE_URL (build-time env)
 * 3) localStorage (runtime persisted)
 * 4) default Django dev server: http://127.0.0.1:5800
 */
export const getBackendBaseUrl = (): string => {
	const w = window as any
	const fromWindow = typeof w?.__DWEB_BACKEND_BASE_URL === 'string' ? w.__DWEB_BACKEND_BASE_URL : ''
	const fromEnv = (import.meta as any)?.env?.VITE_BACKEND_BASE_URL ?? ''
	const fromStorage = localStorage.getItem(STORAGE_KEY) ?? ''
	return normalizeBaseUrl(fromWindow || fromEnv || fromStorage || DEFAULT_BACKEND_BASE_URL)
}

export const setBackendBaseUrl = (baseUrl: string) => {
	const v = normalizeBaseUrl(baseUrl)
	if (!v) localStorage.removeItem(STORAGE_KEY)
	else localStorage.setItem(STORAGE_KEY, v)
	window.dispatchEvent(new CustomEvent('dweb:backendBaseUrlChanged', { detail: { baseUrl: v } }))
}

const ABSOLUTE_URL_RE = /^https?:\/\//i

export const resolveBackendUrl = (pathOrUrl: string): string => {
	const raw = String(pathOrUrl ?? '').trim()
	if (!raw) return ''
	if (raw.startsWith('blob:') || raw.startsWith('data:')) return raw
	if (ABSOLUTE_URL_RE.test(raw)) return raw

	const base = getBackendBaseUrl()
	if (!base) return raw

	if (raw.startsWith('/')) return `${base}${raw}`
	return `${base}/${raw}`
}
