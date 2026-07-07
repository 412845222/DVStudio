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
	UploadedProjectAsset,
	CloudTemplatesPlatformResult,
	CloudTemplatesQuotaResult,
	CloudTemplatesListResult,
	CloudTemplatesUploadPayload,
	CloudTemplatesUploadResult,
	CloudTemplatesDownloadPayload,
	CloudTemplatesDownloadResult,
	CloudTemplatesDeletePayload,
	CloudTemplatesDeleteResult
} from './types'

import { setBackendBaseUrl } from '../network/backendConfig'
import { getErrorMessage } from '../types/utils'

let clientSettingsCache: ClientSettings | null = null

export const isElectron = (): boolean => {
	return window?.__DWEB_RUNTIME__?.platform === 'electron' || !!window?.dweb?.common
}

export async function getBackendBaseUrl(): Promise<string> {
	if (window?.dweb?.common?.getBackendBaseUrl) {
		const baseUrl = await window.dweb.common.getBackendBaseUrl()
		if (typeof baseUrl === 'string' && baseUrl.trim()) setBackendBaseUrl(baseUrl)
		return baseUrl
	}
	return String(window?.__DWEB_BACKEND_BASE_URL || '')
}

export async function pingBackend(): Promise<BackendPingResult> {
	if (window?.dweb?.common?.pingBackend) return window.dweb.common.pingBackend()
	try {
		const baseUrl = await getBackendBaseUrl()
		const res = await fetch(`${baseUrl}/api/ai/ping`)
		return { ok: res.ok, status: res.status }
	} catch (e: unknown) {
		return { ok: false, error: getErrorMessage(e) }
	}
}

export async function startBackend(): Promise<BackendStartResult> {
	if (window?.dweb?.common?.startBackend) {
		const r: BackendStartResult = await window.dweb.common.startBackend()
		if (r?.ok && r.baseUrl) setBackendBaseUrl(r.baseUrl)
		return r
	}
	return { ok: false, error: 'Not running in Electron.' }
}

export async function restartBackend(): Promise<BackendRestartResult> {
	if (window?.dweb?.common?.restartBackend) {
		const r: BackendRestartResult = await window.dweb.common.restartBackend()
		if (r?.ok && r.baseUrl) setBackendBaseUrl(r.baseUrl)
		return r
	}
	return { ok: false, error: 'Not running in Electron.' }
}

export async function getBackendStatus(): Promise<BackendStatus | null> {
	if (!window?.dweb?.common?.getBackendStatus) return null
	return window.dweb.common.getBackendStatus()
}

export async function getBackendRuntimeState(): Promise<BackendRuntimeState | null> {
	if (!window?.dweb?.common?.getBackendRuntimeState) return null
	return window.dweb.common.getBackendRuntimeState()
}

export function onBackendRuntimeStateChanged(
	handler: (state: BackendRuntimeState) => void
): () => void {
	if (!window?.dweb?.common?.onBackendRuntimeStateChanged) return () => {}
	const listenerId = Number(window.dweb.common.onBackendRuntimeStateChanged(handler) || 0)
	if (!Number.isFinite(listenerId) || listenerId <= 0) return () => {}
	const offFn = window?.dweb?.common?.offBackendRuntimeStateChanged
	if (typeof offFn === 'function') {
		return () => {
			void offFn(listenerId)
		}
	}
	return () => {}
}

export async function getBackendLogs(options?: {
	since?: number
}): Promise<BackendLogsResult | null> {
	if (!window?.dweb?.common?.getBackendLogs) return null
	return window.dweb.common.getBackendLogs(options)
}

export async function clearBackendLogs(): Promise<{ ok: boolean } | null> {
	if (!window?.dweb?.common?.clearBackendLogs) return null
	return window.dweb.common.clearBackendLogs()
}

export async function collectDiagnostics(): Promise<DiagnosticsResult | null> {
	if (!window?.dweb?.common?.collectDiagnostics) return null
	return window.dweb.common.collectDiagnostics()
}

export async function revealUserDataDir(): Promise<{ ok: boolean } | null> {
	if (!window?.dweb?.common?.revealUserDataDir) return null
	return window.dweb.common.revealUserDataDir()
}

export async function openFolderForPath(path: string): Promise<OpenFolderResult | null> {
	if (!window?.dweb?.common?.openFolderForPath) return null
	return window.dweb.common.openFolderForPath({ path: String(path || '') })
}

export async function openExternalUrl(url: string): Promise<{ ok: boolean; error?: string }> {
	const trimmed = String(url || '').trim()
	if (!trimmed) return Promise.resolve({ ok: false, error: 'empty url' })
	if (window?.dweb?.common?.openExternalUrl) {
		try {
			const r = await window.dweb.common.openExternalUrl({ url: trimmed })
			if (r && r.ok) return { ok: true }
			return { ok: false, error: r?.error || 'failed' }
		} catch (e: unknown) {
			return { ok: false, error: getErrorMessage(e) }
		}
	}
	try {
		const win = window.open(trimmed, '_blank', 'noopener,noreferrer')
		if (!win) return { ok: false, error: 'blocked by browser' }
		return { ok: true }
	} catch (e: unknown) {
		return { ok: false, error: getErrorMessage(e) }
	}
}

export async function selectProjectFolder(): Promise<DirectoryPickResult | null> {
	if (!window?.dweb?.aiworkflow?.selectProjectFolder) return null
	return window.dweb.aiworkflow.selectProjectFolder()
}

export async function registerProjectRoot(
	projectId: number,
	rootPath: string
): Promise<{
	ok: boolean
	cleared?: boolean
	created?: boolean
	root?: string
	error?: string
} | null> {
	if (!window?.dweb?.aiworkflow?.registerProjectRoot) return null
	const pid = Number(projectId)
	if (!Number.isFinite(pid) || pid <= 0) return { ok: false, error: 'projectId invalid' }
	return window.dweb.aiworkflow.registerProjectRoot({
		projectId: pid,
		rootPath: String(rootPath || '')
	})
}

export async function clearProjectRoot(
	projectId: number
): Promise<{ ok: boolean; error?: string } | null> {
	if (!window?.dweb?.aiworkflow?.clearProjectRoot) return null
	const pid = Number(projectId)
	if (!Number.isFinite(pid) || pid <= 0) return { ok: false, error: 'projectId invalid' }
	return window.dweb.aiworkflow.clearProjectRoot({ projectId: pid })
}

export async function getProjectRootSnapshot(): Promise<Record<string, string> | null> {
	if (!window?.dweb?.aiworkflow?.getProjectRootSnapshot) return null
	return window.dweb.aiworkflow.getProjectRootSnapshot()
}

export async function getProjectRootById(projectId: number): Promise<string | null> {
	if (!window?.dweb?.aiworkflow?.getProjectRootById) return null
	const pid = Number(projectId)
	if (!Number.isFinite(pid) || pid <= 0) return null
	const result = await window.dweb.aiworkflow.getProjectRootById({ projectId: pid })
	return result ? String(result) : null
}

export async function downloadUrlToProjectRoot(
	projectId: number,
	url: string,
	desiredFilename?: string
): Promise<{
	ok: boolean
	absolutePath?: string
	relativePath?: string
	size?: number
	error?: string
} | null> {
	if (!window?.dweb?.aiworkflow?.downloadUrlToProjectRoot) return null
	const pid = Number(projectId)
	if (!Number.isFinite(pid) || pid <= 0) return { ok: false, error: 'projectId invalid' }
	const result = await window.dweb.aiworkflow.downloadUrlToProjectRoot({
		projectId: pid,
		url: String(url || ''),
		desiredFilename
	})
	return result
}

export async function copyFileToProjectRoot(
	projectId: number,
	sourcePath: string,
	desiredFilename?: string
): Promise<{
	ok: boolean
	absolutePath?: string
	relativePath?: string
	size?: number
	reused?: boolean
	error?: string
} | null> {
	if (!window?.dweb?.aiworkflow?.copyFileToProjectRoot) return null
	const pid = Number(projectId)
	if (!Number.isFinite(pid) || pid <= 0) return { ok: false, error: 'projectId invalid' }
	const result = await window.dweb.aiworkflow.copyFileToProjectRoot({
		projectId: pid,
		sourcePath: String(sourcePath || ''),
		desiredFilename
	})
	return result
}

export async function fetchAsArrayBuffer(
	url: string
): Promise<{ ok: boolean; buffer?: Uint8Array; mime?: string; error?: string } | null> {
	if (!window?.dweb?.aiworkflow?.fetchAsArrayBuffer) return null
	const result = await window.dweb.aiworkflow.fetchAsArrayBuffer({ url: String(url || '') })
	return result
}

export async function uploadProjectAsset(payload: {
	projectId: number
	kind?: string
	name?: string
	arrayBuffer: ArrayBuffer
	contentType?: string
	bucket?: string
	subPath?: string
}): Promise<{ ok: boolean; asset?: UploadedProjectAsset; error?: string } | null> {
	if (!window?.dweb?.aiworkflow?.uploadProjectAsset) return null
	const pid = Number(payload?.projectId)
	if (!Number.isFinite(pid) || pid <= 0) return { ok: false, error: 'projectId invalid' }
	const result = await window.dweb.aiworkflow.uploadProjectAsset({
		projectId: pid,
		kind: payload?.kind,
		name: payload?.name,
		arrayBuffer: payload?.arrayBuffer,
		contentType: payload?.contentType,
		bucket: payload?.bucket,
		subPath: payload?.subPath
	})
	return result
}

export async function importProjectAsset(payload: {
	projectId: number
	kind?: string
	name?: string
	sourcePath?: string
	sourceUrl?: string
	bucket?: string
	subPath?: string
}): Promise<{ ok: boolean; asset?: UploadedProjectAsset; error?: string } | null> {
	if (!window?.dweb?.aiworkflow?.importProjectAsset) return null
	const pid = Number(payload?.projectId)
	if (!Number.isFinite(pid) || pid <= 0) return { ok: false, error: 'projectId invalid' }
	const result = await window.dweb.aiworkflow.importProjectAsset({
		projectId: pid,
		kind: payload?.kind,
		name: payload?.name,
		sourcePath: payload?.sourcePath,
		sourceUrl: payload?.sourceUrl,
		bucket: payload?.bucket,
		subPath: payload?.subPath
	})
	return result
}

export async function repairAllProjectAssets(payload: {
	projectId: number
	resourcesById: Record<string, unknown>
}): Promise<{
	ok: boolean
	patches?: Record<string, unknown>
	failed?: string[]
	changed?: number
	error?: string
} | null> {
	if (!window?.dweb?.aiworkflow?.projectAssets?.repairAll) return null
	const pid = Number(payload?.projectId)
	if (!Number.isFinite(pid) || pid <= 0) return { ok: false, error: 'projectId invalid' }
	return window.dweb.aiworkflow.projectAssets.repairAll({
		projectId: pid,
		resourcesById: payload?.resourcesById || {}
	})
}

export type DwebAssetDiagnosticCheck = {
	check: string
	status: 'OK' | 'FAIL' | 'INFO'
	message: string
	detail?: unknown
}

export type DwebAssetDiagnoseResult = {
	ok: boolean
	projectId: number | null
	requestedPath: string
	registered: boolean
	root: string | null
	rootValid: boolean
	rootExists: boolean
	resolvedTo: string | null
	fileExists: boolean
	fileIsFile: boolean
	fileSize: number
	candidates: Array<{
		root: string
		candidate: string
		resolved: string | null
		reason: string
		exists: boolean
		isFile: boolean
		size: number
	}>
	similarFiles: Array<{ name: string; path: string }>
	diagnostics: DwebAssetDiagnosticCheck[]
	suggestion: 're_register_root' | 'repair_by_rename' | 'file_missing' | null
	repairedAsset: {
		kind: string
		name: string
		contentType: string
		size: number
		relativePath: string
		projectRelativePath: string
		absolutePath: string
		url: string
		sourcePath: string
	} | null
	error?: string
}

export async function diagnoseDwebAsset(payload: {
	projectId?: number
	relPath?: string
	url?: string
}): Promise<DwebAssetDiagnoseResult | null> {
	if (!window?.dweb?.aiworkflow?.diagnoseAsset) return null
	return window.dweb.aiworkflow.diagnoseAsset(payload || {})
}

export async function validateDwebProjectRoot(payload: {
	projectId: number
	expectedRootPath?: string
}): Promise<{
	ok: boolean
	reRegistered?: boolean
	registerResult?: unknown
	validation?: {
		valid: boolean
		projectId: number
		root?: string
		mediaDirExists?: boolean
		mediaDir?: string
		error?: string
	}
	error?: string
} | null> {
	if (!window?.dweb?.aiworkflow?.validateProjectRoot) return null
	const pid = Number(payload?.projectId)
	if (!Number.isFinite(pid) || pid <= 0) return { ok: false, error: 'projectId invalid' }
	return window.dweb.aiworkflow.validateProjectRoot({
		projectId: pid,
		expectedRootPath: payload?.expectedRootPath ? String(payload.expectedRootPath) : undefined
	})
}

export async function getDwebAssetAccessLogs(
	maxEntries: number = 100
): Promise<{ ok: boolean; logs?: unknown[]; error?: string } | null> {
	if (!window?.dweb?.aiworkflow?.getAssetAccessLogs) return null
	return window.dweb.aiworkflow.getAssetAccessLogs({ maxEntries: Number(maxEntries) || 100 })
}

export type ProjectCacheStatsResult = {
	ok: boolean
	fileCount?: number
	totalBytes?: number
	cacheDir?: string
	error?: string
}

export type ProjectCacheClearResult = {
	ok: boolean
	deletedCount?: number
	freedBytes?: number
	error?: string
}

export async function getProjectCacheStats(
	projectId: number
): Promise<ProjectCacheStatsResult | null> {
	if (!window?.dweb?.aiworkflow?.getCacheStats) return null
	const pid = Number(projectId)
	if (!Number.isFinite(pid) || pid <= 0) return { ok: false, error: 'projectId invalid' }
	return window.dweb.aiworkflow.getCacheStats({ projectId: pid })
}

export async function clearProjectCache(
	projectId: number
): Promise<ProjectCacheClearResult | null> {
	if (!window?.dweb?.aiworkflow?.clearCache) return null
	const pid = Number(projectId)
	if (!Number.isFinite(pid) || pid <= 0) return { ok: false, error: 'projectId invalid' }
	return window.dweb.aiworkflow.clearCache({ projectId: pid })
}

export async function runBootstrapInstaller(): Promise<BootstrapInstallResult | null> {
	if (!window?.dweb?.common?.runBootstrapInstaller) return null
	return window.dweb.common.runBootstrapInstaller()
}

export async function getSetupState(): Promise<SetupState | null> {
	if (!window?.dweb?.common?.getSetupState) return null
	return window.dweb.common.getSetupState()
}

export async function runSetupWorkflow(payload?: {
	reason?: string
	retryKey?: string
}): Promise<SetupRunResult | null> {
	if (!window?.dweb?.common?.runSetupWorkflow) return null
	const r: SetupRunResult = await window.dweb.common.runSetupWorkflow(payload)
	if (r?.ok && r.baseUrl) setBackendBaseUrl(r.baseUrl)
	return r
}

export async function cleanupOldProject(): Promise<CleanupOldProjectResult | null> {
	if (!window?.dweb?.common?.cleanupOldProject) return null
	return window.dweb.common.cleanupOldProject()
}

export async function getClientSettings(): Promise<ClientSettingsResult | null> {
	if (window?.dweb?.common?.getClientSettings) return window.dweb.common.getClientSettings()
	if (clientSettingsCache) return { ok: true, data: clientSettingsCache }
	const local = window?.__DWEB_CLIENT_SETTINGS
	if (local) return { ok: true, data: local as ClientSettings }
	return { ok: false, error: 'Not running in Electron.' }
}

export async function saveClientSettings(
	payload: ClientSettings
): Promise<ClientSettingsResult | null> {
	if (!window?.dweb?.common?.saveClientSettings) return null
	const plainPayload = JSON.parse(JSON.stringify(payload))
	const r: ClientSettingsResult = await window.dweb.common.saveClientSettings(plainPayload)
	if (r?.ok && r.data) {
		clientSettingsCache = r.data
		try {
			const desc = Object.getOwnPropertyDescriptor(window, '__DWEB_CLIENT_SETTINGS')
			const canAssign =
				!desc || ('writable' in desc ? Boolean(desc.writable) : typeof desc.set === 'function')
			if (canAssign) window.__DWEB_CLIENT_SETTINGS = r.data
		} catch {
			// ignore
		}
	}
	return r
}

export async function minimizeWindow(): Promise<{ ok: boolean; error?: string }> {
	if (!window?.dweb?.window?.minimize) return { ok: false, error: 'Not running in Electron.' }
	try {
		return (await window.dweb.window.minimize()) || { ok: true }
	} catch (e: unknown) {
		return { ok: false, error: getErrorMessage(e) }
	}
}

export async function toggleMaximizeWindow(): Promise<{
	ok: boolean
	maximized?: boolean
	error?: string
}> {
	if (!window?.dweb?.window?.toggleMaximize) return { ok: false, error: 'Not running in Electron.' }
	try {
		return (await window.dweb.window.toggleMaximize()) || { ok: true }
	} catch (e: unknown) {
		return { ok: false, error: getErrorMessage(e) }
	}
}

export async function isWindowMaximized(): Promise<{
	ok: boolean
	maximized?: boolean
	error?: string
}> {
	if (!window?.dweb?.window?.isMaximized) return { ok: false, error: 'Not running in Electron.' }
	try {
		return (await window.dweb.window.isMaximized()) || { ok: true }
	} catch (e: unknown) {
		return { ok: false, error: getErrorMessage(e) }
	}
}

export async function closeWindow(): Promise<{ ok: boolean; error?: string }> {
	if (!window?.dweb?.window?.close) return { ok: false, error: 'Not running in Electron.' }
	try {
		return (await window.dweb.window.close()) || { ok: true }
	} catch (e: unknown) {
		return { ok: false, error: getErrorMessage(e) }
	}
}

export async function reloadWindow(): Promise<{ ok: boolean; error?: string }> {
	if (!window?.dweb?.window?.reload) return { ok: false, error: 'Not running in Electron.' }
	try {
		return (await window.dweb.window.reload()) || { ok: true }
	} catch (e: unknown) {
		return { ok: false, error: getErrorMessage(e) }
	}
}

export async function openDevTools(): Promise<{ ok: boolean; opened?: boolean; error?: string }> {
	if (!window?.dweb?.window?.openDevTools) return { ok: false, error: 'Not running in Electron.' }
	try {
		return (await window.dweb.window.openDevTools()) || { ok: true }
	} catch (e: unknown) {
		return { ok: false, error: getErrorMessage(e) }
	}
}

export async function getCloudTemplatesPlatform(): Promise<CloudTemplatesPlatformResult | null> {
	if (!window?.dweb?.cloudTemplates?.getPlatform) return null
	try {
		return await window.dweb.cloudTemplates.getPlatform()
	} catch (e: unknown) {
		return { ok: false, errMsg: getErrorMessage(e) }
	}
}

export async function getCloudTemplatesQuota(): Promise<CloudTemplatesQuotaResult | null> {
	if (!window?.dweb?.cloudTemplates?.getQuota) return null
	try {
		return await window.dweb.cloudTemplates.getQuota()
	} catch (e: unknown) {
		return { ok: false, errMsg: getErrorMessage(e) }
	}
}

export async function listCloudTemplates(options: { forceRefresh?: boolean } = {}): Promise<CloudTemplatesListResult | null> {
	if (!window?.dweb?.cloudTemplates?.list) return null
	try {
		return await window.dweb.cloudTemplates.list(options)
	} catch (e: unknown) {
		return { ok: false, errMsg: getErrorMessage(e), items: [] }
	}
}

export async function uploadCloudTemplate(
	payload: CloudTemplatesUploadPayload
): Promise<CloudTemplatesUploadResult | null> {
	if (!window?.dweb?.cloudTemplates?.upload) return null
	try {
		return await window.dweb.cloudTemplates.upload(payload)
	} catch (e: unknown) {
		return { ok: false, errMsg: getErrorMessage(e) }
	}
}

export async function downloadCloudTemplate(
	payload: CloudTemplatesDownloadPayload
): Promise<CloudTemplatesDownloadResult | null> {
	if (!window?.dweb?.cloudTemplates?.download) return null
	try {
		return await window.dweb.cloudTemplates.download(payload)
	} catch (e: unknown) {
		return { ok: false, errMsg: getErrorMessage(e) }
	}
}

export async function deleteCloudTemplate(
	payload: CloudTemplatesDeletePayload
): Promise<CloudTemplatesDeleteResult | null> {
	if (!window?.dweb?.cloudTemplates?.delete) return null
	try {
		return await window.dweb.cloudTemplates.delete(payload)
	} catch (e: unknown) {
		return { ok: false, errMsg: getErrorMessage(e) }
	}
}
