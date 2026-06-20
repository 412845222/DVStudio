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

export async function getBackendBaseUrl(): Promise<string> {
	if (w?.dweb?.common?.getBackendBaseUrl) {
		const baseUrl = await w.dweb.common.getBackendBaseUrl()
		if (typeof baseUrl === 'string' && baseUrl.trim()) setBackendBaseUrl(baseUrl)
		return baseUrl
	}
	return String(w?.__DWEB_BACKEND_BASE_URL || '')
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

export async function getClientSettings(): Promise<ClientSettingsResult | null> {
	if (w?.dweb?.common?.getClientSettings) return w.dweb.common.getClientSettings()
	if (clientSettingsCache) return { ok: true, data: clientSettingsCache }
	const local = w?.__DWEB_CLIENT_SETTINGS
	if (local) return { ok: true, data: local as ClientSettings }
	return { ok: false, error: 'Not running in Electron.' }
}

export async function saveClientSettings(payload: ClientSettings): Promise<ClientSettingsResult | null> {
	if (!w?.dweb?.common?.saveClientSettings) return null // Web 模式返回 null，由调用方判断
	const r: ClientSettingsResult = await w.dweb.common.saveClientSettings(payload)
	if (r?.ok && r.data) {
		clientSettingsCache = r.data
		// In Electron, preload may expose __DWEB_CLIENT_SETTINGS via contextBridge as a read-only getter.
		// Only update window when it's actually writable or has a setter.
		try {
			const desc = Object.getOwnPropertyDescriptor(w, '__DWEB_CLIENT_SETTINGS')
			const canAssign = !desc || ('writable' in desc ? Boolean((desc as any).writable) : typeof (desc as any).set === 'function')
			if (canAssign) w.__DWEB_CLIENT_SETTINGS = r.data
		} catch {
			// ignore
		}
	}
	return r
}
