export {}

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
} from '../electronBridge/types'

declare global {
	interface Window {
		/** Electron preload 注入：后端 baseUrl（优先级最高） */
		__DWEB_BACKEND_BASE_URL?: string
		/** 运行环境标记：Electron preload 注入；Web 模式在 main.ts 注入 */
		__DWEB_RUNTIME__?: { platform: 'electron' | 'web'; isElectron: boolean }
		__DWEB_CLIENT_SETTINGS?: ClientSettings | null
		dweb?: {
			common: {
				getBackendBaseUrl(): Promise<string>
				getBackendRuntimeState(): Promise<BackendRuntimeState>
				onBackendRuntimeStateChanged(handler: (state: BackendRuntimeState) => void): number
				offBackendRuntimeStateChanged(listenerId: number): Promise<{ ok: boolean }>
				getClientSettings(): Promise<ClientSettingsResult>
				saveClientSettings(payload: ClientSettings): Promise<ClientSettingsResult>
				getSetupState(): Promise<SetupState>
				runSetupWorkflow(payload?: {
					reason?: string
					retryKey?: string
				}): Promise<SetupRunResult>
				cleanupOldProject(): Promise<CleanupOldProjectResult>
				getBackendStatus(): Promise<BackendStatus>
				startBackend(): Promise<BackendStartResult>
				pingBackend(): Promise<BackendPingResult>
				restartBackend(): Promise<BackendRestartResult>
				getBackendLogs(options?: { since?: number }): Promise<BackendLogsResult>
				clearBackendLogs(): Promise<{ ok: boolean }>
				collectDiagnostics(): Promise<DiagnosticsResult>
				revealUserDataDir(): Promise<{ ok: boolean }>
				openFolderForPath(payload: { path: string }): Promise<OpenFolderResult>
				runBootstrapInstaller(): Promise<BootstrapInstallResult>
				openExternalUrl(payload: { url: string }): Promise<{ ok: boolean; error?: string }> | undefined
			}
			window: {
				minimize(): Promise<{ ok: boolean; error?: string }>
				toggleMaximize(): Promise<{ ok: boolean; maximized?: boolean; error?: string }>
				isMaximized(): Promise<{ ok: boolean; maximized?: boolean; error?: string }>
				reload(): Promise<{ ok: boolean; error?: string }>
				openDevTools(): Promise<{ ok: boolean; opened?: boolean; error?: string }>
				close(): Promise<{ ok: boolean; error?: string }>
			}
			aiworkflow: {
				pingBackend(): Promise<BackendPingResult>
				selectMediaFiles(options?: {
					filters?: Array<{ name: string; extensions: string[] }>
				}): Promise<DirectoryPickResult>
				selectProjectFolder(): Promise<DirectoryPickResult>
				registerProjectRoot(payload: {
					projectId: number
					rootPath: string
				}): Promise<{ ok: boolean; cleared?: boolean; created?: boolean; root?: string; error?: string }>
				clearProjectRoot(payload: { projectId: number }): Promise<{ ok: boolean; error?: string }>
				getProjectRootSnapshot(): Promise<Record<string, string>>
				getProjectRootById(payload: { projectId: number }): Promise<string | null>
				downloadUrlToProjectRoot(payload: {
					projectId: number
					url: string
					desiredFilename?: string
				}): Promise<{
					ok: boolean
					absolutePath?: string
					relativePath?: string
					size?: number
					error?: string
				}>
				copyFileToProjectRoot(payload: {
					projectId: number
					sourcePath: string
					desiredFilename?: string
				}): Promise<{
					ok: boolean
					absolutePath?: string
					relativePath?: string
					size?: number
					reused?: boolean
					error?: string
				}>
				fetchAsArrayBuffer(payload: { url: string }): Promise<{
					ok: boolean
					buffer?: Uint8Array
					mime?: string
					error?: string
				}>
				uploadProjectAsset(payload: {
					projectId: number
					kind?: string
					name?: string
					arrayBuffer: ArrayBuffer
					contentType?: string
					bucket?: string
				}): Promise<{ ok: boolean; asset?: UploadedProjectAsset; error?: string }>
				importProjectAsset(payload: {
					projectId: number
					kind?: string
					name?: string
					sourcePath?: string
					sourceUrl?: string
					bucket?: string
				}): Promise<{ ok: boolean; asset?: UploadedProjectAsset; error?: string }>
				projectAssets: {
					repairAll(payload: {
						projectId: number
						resourcesById: Record<string, unknown>
					}): Promise<{
						ok: boolean
						patches?: Record<string, unknown>
						failed?: string[]
						changed?: number
						error?: string
					}>
				}
				diagnoseAsset(payload: {
					projectId?: number
					relPath?: string
					url?: string
				}): Promise<{
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
					diagnostics: Array<{
						check: string
						status: 'OK' | 'FAIL' | 'INFO'
						message: string
						detail?: unknown
					}>
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
				}>
				validateProjectRoot(payload: {
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
				}>
				getAssetAccessLogs(payload: { maxEntries: number }): Promise<{
					ok: boolean
					logs?: unknown[]
					error?: string
				}>
				getCacheStats(payload: { projectId: number }): Promise<{
					ok: boolean
					fileCount?: number
					totalBytes?: number
					cacheDir?: string
					error?: string
				}>
				clearCache(payload: { projectId: number }): Promise<{
					ok: boolean
					deletedCount?: number
					freedBytes?: number
					error?: string
				}>
			}
			videostudio: {
				pingBackend(): Promise<BackendPingResult>
				selectExportDir(options?: unknown): Promise<DirectoryPickResult>
			}
		}
	}
}
