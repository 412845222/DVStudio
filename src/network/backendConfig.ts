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
	const isElectronRuntime =
		w?.__DWEB_RUNTIME__?.platform === 'electron' || typeof w?.dweb?.common?.getBackendBaseUrl === 'function'

	// Electron 下必须优先使用 preload 注入的实时后端地址，
	// 避免 localStorage 里的历史值（例如 5800 的旧服务）导致请求打到错误后端。
	const fromWindow = typeof w?.__DWEB_BACKEND_BASE_URL === 'string' ? w.__DWEB_BACKEND_BASE_URL : ''
	const fromEnv = (import.meta as any)?.env?.VITE_BACKEND_BASE_URL ?? ''
	const fromStorage = localStorage.getItem(STORAGE_KEY) ?? ''
	if (isElectronRuntime) {
		return normalizeBaseUrl(fromWindow || fromStorage || fromEnv || DEFAULT_BACKEND_BASE_URL)
	}
	return normalizeBaseUrl(fromWindow || fromEnv || fromStorage || DEFAULT_BACKEND_BASE_URL)
}

export const setBackendBaseUrl = (baseUrl: string) => {
	const v = normalizeBaseUrl(baseUrl)
	if (!v) localStorage.removeItem(STORAGE_KEY)
	else localStorage.setItem(STORAGE_KEY, v)
	window.dispatchEvent(new CustomEvent('dweb:backendBaseUrlChanged', { detail: { baseUrl: v } }))
}

const ABSOLUTE_URL_RE = /^https?:\/\//i
const SUSPICIOUS_RELATIVE_INPUT_RE = /[\s;]|^(?:ak|code|requestid|message|action|credential|http)=/i

const DWEB_PROJECT_ASSET_PREFIX = 'dweb://project-assets'

export const parseDwebProjectAssetUrl = (raw: string): { projectId: number; path: string } | null => {
	const text = String(raw || '').trim()
	if (!text.toLowerCase().startsWith(DWEB_PROJECT_ASSET_PREFIX)) return null
	try {
		const u = new URL(text)
		if (String(u.hostname || '').toLowerCase() !== 'project-assets') return null
		const projectId = Number(String(u.searchParams.get('projectId') || '').trim())
		const relPath = String(u.searchParams.get('path') || '').trim()
		if (!Number.isFinite(projectId) || projectId <= 0 || !relPath) return null
		return { projectId: Math.floor(projectId), path: relPath }
	} catch {
		return null
	}
}

export const resolveBackendFetchUrl = (pathOrUrl: string): string => {
	const text = String(pathOrUrl || '').trim()
	if (!text) return ''
	if (text.toLowerCase().startsWith(DWEB_PROJECT_ASSET_PREFIX)) return text
	return resolveBackendUrl(text)
}

export const isWorkflowLocalAssetUrl = (pathOrUrl: string): boolean => {
	const text = String(pathOrUrl || '').trim()
	if (!text) return false
	if (/^(?:blob:|data:)/i.test(text)) return true
	if (text.toLowerCase().startsWith(DWEB_PROJECT_ASSET_PREFIX)) return true
	if (/^file:\/\//i.test(text)) return true
	if (/^\/media\//i.test(text)) return true
	if (/^https?:\/\//i.test(text)) {
		try {
			const u = new URL(text)
			const host = String(u.hostname || '').toLowerCase()
			const pathname = String(u.pathname || '').toLowerCase()
			const isLocalHost = host === '127.0.0.1' || host === 'localhost'
			if (isLocalHost && pathname.startsWith('/media/')) {
				return true
			}
		} catch {
			return false
		}
	}
	return false
}

const resolveDwebProjectAssetUrl = (raw: string): string => {
	const text = String(raw || '').trim()
	if (!text.toLowerCase().startsWith(DWEB_PROJECT_ASSET_PREFIX)) return text
	if (!parseDwebProjectAssetUrl(text)) return text
	return text
}

export const resolveBackendUrl = (pathOrUrl: string): string => {
	const raw = String(pathOrUrl ?? '').trim()
	if (!raw) return ''
	if (raw.startsWith('blob:') || raw.startsWith('data:')) return raw
	if (raw.toLowerCase().startsWith(DWEB_PROJECT_ASSET_PREFIX)) {
		return resolveDwebProjectAssetUrl(raw)
	}
	if (ABSOLUTE_URL_RE.test(raw)) return raw
	// Do not convert diagnostic/error fragments into backend URLs.
	if (SUSPICIOUS_RELATIVE_INPUT_RE.test(raw)) return ''

	const base = getBackendBaseUrl()

	// Web / 浏览器环境下，优先走 Vite 开发代理(或生产部署的同源 API)，
	// 直接使用相对路径，避免跨域或 IP 可达性问题。
	const w = window as any
	const isElectronRuntime =
		w?.__DWEB_RUNTIME__?.platform === 'electron' ||
		typeof w?.dweb?.common?.getBackendBaseUrl === 'function'
	if (!isElectronRuntime) {
		return raw.startsWith('/') ? raw : `/${raw}`
	}

	if (!base) return raw

	if (raw.startsWith('/')) return `${base}${raw}`
	return `${base}/${raw}`
}
