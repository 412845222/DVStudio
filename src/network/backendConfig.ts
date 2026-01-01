const STORAGE_KEY = 'dweb.backendBaseUrl'

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
 * 4) '' (same-origin; in dev should be proxied by Vite)
 */
export const getBackendBaseUrl = (): string => {
	const w = window as any
	const fromWindow = typeof w?.__DWEB_BACKEND_BASE_URL === 'string' ? w.__DWEB_BACKEND_BASE_URL : ''
	const fromEnv = (import.meta as any)?.env?.VITE_BACKEND_BASE_URL ?? ''
	const fromStorage = localStorage.getItem(STORAGE_KEY) ?? ''
	return normalizeBaseUrl(fromWindow || fromEnv || fromStorage || '')
}

export const setBackendBaseUrl = (baseUrl: string) => {
	const v = normalizeBaseUrl(baseUrl)
	if (!v) localStorage.removeItem(STORAGE_KEY)
	else localStorage.setItem(STORAGE_KEY, v)
	window.dispatchEvent(new CustomEvent('dweb:backendBaseUrlChanged', { detail: { baseUrl: v } }))
}
