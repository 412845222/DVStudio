import type {
	BackendLogsResult,
	BackendRuntimeState,
	BackendPingResult,
	BackendRestartResult,
	BackendStartResult,
	BackendStatus,
	BootstrapInstallResult,
	ClientSettings,
	ClientSettingsResult,
	DiagnosticsResult,
	OpenFolderResult,
	SetupRunResult,
	SetupState,
	CleanupOldProjectResult,
	DirectoryPickResult,
} from './types'

import { setBackendBaseUrl } from '../network/backendConfig'

const w = window as any

let clientSettingsCache: ClientSettings | null = null

export const isElectron = (): boolean => {
	return w?.__DWEB_RUNTIME__?.platform === 'electron' || !!w?.dweb?.common
}

/**
 * 从 preload 暴露的 `__DWEB_BACKEND_BASE_URL__` 读取字符串值。
 * 支持：
 *   1) 字符串: window.__DWEB_BACKEND_BASE_URL__ = 'http://127.0.0.1:5800'
 *   2) 带 getter 的对象: { get: () => 'http://...', toString: () => '...' }
 */
const readWindowBackendBaseUrl = (): string => {
	const raw = w?.__DWEB_BACKEND_BASE_URL__
	if (typeof raw === 'string') return raw
	if (raw && typeof raw === 'object') {
		if (typeof raw.get === 'function') {
			try {
				const g = raw.get()
				if (typeof g === 'string') return g
			} catch {}
		}
		if (typeof raw.toString === 'function') {
			try {
				const s = raw.toString()
				if (typeof s === 'string' && s !== '[object Object]') return s
			} catch {}
		}
	}
	return ''
}

export async function getBackendBaseUrl(): Promise<string> {
	if (w?.dweb?.common?.getBackendBaseUrl) {
		const baseUrl = await w.dweb.common.getBackendBaseUrl()
		if (typeof baseUrl === 'string' && baseUrl.trim()) setBackendBaseUrl(baseUrl)
		return baseUrl
	}
	// Web 模式: 从 window.__DWEB_BACKEND_BASE_URL__ 或 Vite 环境变量读取
	const fromWindow = readWindowBackendBaseUrl()
	const fromEnv = (import.meta as any)?.env?.VITE_BACKEND_BASE_URL ?? ''
	return fromWindow || fromEnv || 'http://127.0.0.1:5800'
}

export async function pingBackend(): Promise<BackendPingResult> {
	if (w?.dweb?.common?.pingBackend) return w.dweb.common.pingBackend()
	try {
		const baseUrl = await getBackendBaseUrl()
		const res = await fetch(`${baseUrl}/api/ai/ping`)
		return { ok: res.ok, status: res.status }
	} catch (e: any) {
		return { ok: false, error: String(e?.message || e) }
	}
}

export async function startBackend(): Promise<BackendStartResult> {
	if (w?.dweb?.common?.startBackend) {
		const r: BackendStartResult = await w.dweb.common.startBackend()
		if (r?.ok && r.baseUrl) setBackendBaseUrl(r.baseUrl)
		return r
	}
	return { ok: false, error: 'Not running in Electron.' }
}

export async function restartBackend(): Promise<BackendRestartResult> {
	if (w?.dweb?.common?.restartBackend) {
		const r: BackendRestartResult = await w.dweb.common.restartBackend()
		if (r?.ok && r.baseUrl) setBackendBaseUrl(r.baseUrl)
		return r
	}
	return { ok: false, error: 'Not running in Electron.' }
}

export async function getBackendStatus(): Promise<BackendStatus | null> {
	if (!w?.dweb?.common?.getBackendStatus) return null
	return w.dweb.common.getBackendStatus()
}

export async function getBackendRuntimeState(): Promise<BackendRuntimeState | null> {
	if (!w?.dweb?.common?.getBackendRuntimeState) return null
	return w.dweb.common.getBackendRuntimeState()
}

export function onBackendRuntimeStateChanged(handler: (state: BackendRuntimeState) => void): () => void {
	if (!w?.dweb?.common?.onBackendRuntimeStateChanged) return () => {}
	const listenerId = Number(w.dweb.common.onBackendRuntimeStateChanged(handler) || 0)
	if (!Number.isFinite(listenerId) || listenerId <= 0) return () => {}
	const offFn = w?.dweb?.common?.offBackendRuntimeStateChanged
	if (typeof offFn === 'function') {
		return () => {
			void offFn(listenerId)
		}
	}
	return () => {}
}

export async function getBackendLogs(options?: { since?: number }): Promise<BackendLogsResult | null> {
	if (!w?.dweb?.common?.getBackendLogs) return null
	return w.dweb.common.getBackendLogs(options)
}

export async function clearBackendLogs(): Promise<{ ok: boolean } | null> {
	if (!w?.dweb?.common?.clearBackendLogs) return null
	return w.dweb.common.clearBackendLogs()
}

export async function collectDiagnostics(): Promise<DiagnosticsResult | null> {
	if (!w?.dweb?.common?.collectDiagnostics) return null
	return w.dweb.common.collectDiagnostics()
}

export async function revealUserDataDir(): Promise<{ ok: boolean } | null> {
	if (!w?.dweb?.common?.revealUserDataDir) return null
	return w.dweb.common.revealUserDataDir()
}

export async function openFolderForPath(path: string): Promise<OpenFolderResult | null> {
	if (!w?.dweb?.common?.openFolderForPath) return null
	return w.dweb.common.openFolderForPath({ path: String(path || '') })
}

export async function selectProjectFolder(): Promise<DirectoryPickResult | null> {
	if (!w?.dweb?.aiworkflow?.selectProjectFolder) return null
	return w.dweb.aiworkflow.selectProjectFolder()
}

export async function runBootstrapInstaller(): Promise<BootstrapInstallResult | null> {
	if (!w?.dweb?.common?.runBootstrapInstaller) return null
	return w.dweb.common.runBootstrapInstaller()
}

export async function getSetupState(): Promise<SetupState | null> {
	if (!w?.dweb?.common?.getSetupState) return null
	return w.dweb.common.getSetupState()
}

export async function runSetupWorkflow(payload?: {
	reason?: string
	retryKey?: string
}): Promise<SetupRunResult | null> {
	if (!w?.dweb?.common?.runSetupWorkflow) return null
	const r: SetupRunResult = await w.dweb.common.runSetupWorkflow(payload)
	if (r?.ok && r.baseUrl) setBackendBaseUrl(r.baseUrl)
	return r
}

export async function cleanupOldProject(): Promise<CleanupOldProjectResult | null> {
	if (!w?.dweb?.common?.cleanupOldProject) return null
	return w.dweb.common.cleanupOldProject()
}

const readWindowClientSettings = (): ClientSettings | null => {
	const raw = w?.__DWEB_CLIENT_SETTINGS__
	if (raw && typeof raw === 'object') {
		// 尝试通过 getter 获取
		if (typeof raw.get === 'function') {
			try {
				const g = raw.get()
				if (g && typeof g === 'object') return g as ClientSettings
			} catch {}
		}
		return raw as ClientSettings
	}
	return null
}

const writeWindowClientSettings = (data: ClientSettings): void => {
	const raw = w?.__DWEB_CLIENT_SETTINGS__
	if (raw && typeof raw === 'object' && typeof raw.set === 'function') {
		try { raw.set(data) } catch {}
	} else if (typeof raw !== 'object') {
		// 非对象，可能是普通值，直接赋值
		try {
			w.__DWEB_CLIENT_SETTINGS__ = data
		} catch {}
	}
}

export async function getClientSettings(): Promise<ClientSettingsResult | null> {
	if (w?.dweb?.common?.getClientSettings) return w.dweb.common.getClientSettings()
	if (clientSettingsCache) return { ok: true, data: clientSettingsCache }
	const local = readWindowClientSettings()
	if (local) return { ok: true, data: local }
	// Web 模式: 从 localStorage 读一份默认值
	try {
		const saved = localStorage.getItem('dweb.clientSettings')
		if (saved) {
			const parsed = JSON.parse(saved)
			if (parsed && typeof parsed === 'object') return { ok: true, data: parsed as ClientSettings }
		}
	} catch {}
	return { ok: false, error: 'Not running in Electron.' }
}

export async function saveClientSettings(payload: ClientSettings): Promise<ClientSettingsResult | null> {
	if (w?.dweb?.common?.saveClientSettings) {
		const r: ClientSettingsResult = await w.dweb.common.saveClientSettings(payload)
		if (r?.ok && r.data) {
			clientSettingsCache = r.data
			writeWindowClientSettings(r.data)
		}
		return r
	}
	// Web 模式 fallback: 存到 localStorage，并返回成功
	try {
		localStorage.setItem('dweb.clientSettings', JSON.stringify(payload))
		clientSettingsCache = payload
		writeWindowClientSettings(payload)
		return { ok: true, data: payload }
	} catch (e: any) {
		return { ok: false, error: String(e?.message || '保存设置失败。') }
	}
}
