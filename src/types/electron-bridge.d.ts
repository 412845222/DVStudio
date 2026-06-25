export {}

declare global {
	type PlatformEventName = 'disconnected' | 'user-changed' | 'overlay-activated' | 'overlay-deactivated' | 'status-changed'

	interface PlatformEventPayload {
		event: PlatformEventName
		data: any
	}

	interface DwebPlatformUser {
		platformId: string
		displayName: string
		avatarUrl?: string
	}

	interface DwebPlatformDlcInfo {
		appId: number
		name: string
		installed: boolean
	}

	interface DwebPlatformProviderInfo {
		id: string
		displayName: string
		available: boolean
		initialized: boolean
	}

	interface DwebPlatformStatus {
		activePlatform: string
		activeDisplayName: string
		available: boolean
		initialized: boolean
		loggedIn: boolean
		user: DwebPlatformUser | null
		overlayEnabled: boolean
		overlayActive: boolean
		installedDlcs: DwebPlatformDlcInfo[]
		allPlatforms: DwebPlatformProviderInfo[]
	}

	interface Window {
		/** Electron preload 注入：后端 baseUrl（优先级最高） */
		__DWEB_BACKEND_BASE_URL?: string
		/** 运行环境标记：Electron preload 注入；Web 模式在 main.ts 注入 */
		__DWEB_RUNTIME__?: { platform: 'electron' | 'web'; isElectron: boolean }
		__DWEB_CLIENT_SETTINGS?: {
			defaultResolution: string
			deepseekApiKey: string
			deepseekBaseUrl: string
			deepseekModel: string
			geminiApiKey: string
			geminiModel: string
			bytedanceApiKey: string
			jimengAccessKeyId: string
			jimengSecretKey: string
		} | null
		dweb?: {
			common: {
				getBackendBaseUrl(): Promise<string>
				getBackendRuntimeState(): Promise<{
					running: boolean
					healthy: boolean
					baseUrl: string
					port: number
					lastError: string
					setupRunning: boolean
					updatedAt: number
				}>
				onBackendRuntimeStateChanged(handler: (state: {
					running: boolean
					healthy: boolean
					baseUrl: string
					port: number
					lastError: string
					setupRunning: boolean
					updatedAt: number
				}) => void): number
				offBackendRuntimeStateChanged(listenerId: number): Promise<{ ok: boolean }>
				getClientSettings(): Promise<{ ok: boolean; data?: any; path?: string; error?: string }>
				saveClientSettings(payload: any): Promise<{ ok: boolean; data?: any; path?: string; error?: string }>
					getSetupState(): Promise<{
						running: boolean
						updatedAt: number
						steps: Array<{
							key: string
							label: string
							status: 'unknown' | 'running' | 'ok' | 'warn' | 'error'
							detail?: string
							progress: number
						}>
					}>
					runSetupWorkflow(payload?: {
						reason?: string
						retryKey?: string
					}): Promise<{
						ok: boolean
						error?: string
						running?: boolean
						baseUrl?: string
						port?: number
						state: {
							running: boolean
							updatedAt: number
							steps: Array<{
								key: string
								label: string
								status: 'unknown' | 'running' | 'ok' | 'warn' | 'error'
								detail?: string
								progress: number
							}>
						}
					}>
					cleanupOldProject(): Promise<{
						ok: boolean
						resourceDir?: string
						error?: string
						results?: Array<{
							target: string
							path: string
							status: 'removed' | 'missing' | 'error'
							error?: string
						}>
					}>
				getBackendStatus(): Promise<{
					running: boolean
					baseUrl: string
					port: number
					lastError: string
					logLineCount: number
				}>
				startBackend(): Promise<{ ok: boolean; baseUrl?: string; port?: number; error?: string }>
				pingBackend(): Promise<{ ok: boolean; status?: number; error?: string }>
				restartBackend(): Promise<{ ok: boolean; baseUrl?: string; port?: number; error?: string }>
				getBackendLogs(options?: { since?: number }): Promise<{
					ok: boolean
					lines: string[]
					total: number
					baseUrl: string
					port: number
					running: boolean
					lastError: string
				}>
				clearBackendLogs(): Promise<{ ok: boolean }>
				collectDiagnostics(): Promise<{ ok: boolean; data?: any; error?: string }>
				revealUserDataDir(): Promise<{ ok: true }>
				openFolderForPath(payload: { path: string }): Promise<{ ok: boolean; error?: string }>
					runBootstrapInstaller(): Promise<{ ok: boolean; started?: boolean; running?: boolean; error?: string }>
			}
			window?: {
				minimize(): Promise<{ ok: boolean; error?: string }>
				toggleMaximize(): Promise<{ ok: boolean; maximized?: boolean; error?: string }>
				isMaximized(): Promise<{ ok: boolean; maximized?: boolean; error?: string }>
				reload(): Promise<{ ok: boolean; error?: string }>
				openDevTools(): Promise<{ ok: boolean; opened?: boolean; error?: string }>
				close(): Promise<{ ok: boolean; error?: string }>
			}
			aiworkflow: {
				pingBackend(): Promise<{ ok: boolean; status?: number; error?: string }>
				selectMediaFiles(options?: { filters?: Array<{ name: string; extensions: string[] }> }): Promise<{
					canceled: boolean
					filePaths: string[]
				}>
				selectProjectFolder(): Promise<{ canceled: boolean; filePaths: string[] }>
			}
			videostudio: {
				pingBackend(): Promise<{ ok: boolean; status?: number; error?: string }>
				selectExportDir(options?: unknown): Promise<{ canceled: boolean; filePaths: string[] }>
			}
			platform: {
				getStatus(): Promise<DwebPlatformStatus>
				getActive(): Promise<{ id: string; displayName: string }>
				getUser(): Promise<DwebPlatformUser | null>
				isAvailable(): Promise<boolean>
				overlayIsEnabled(): Promise<boolean>
				overlayIsActive(): Promise<boolean>
				overlayOpenUrl(url: string): Promise<{ ok: boolean; errMsg?: string }>
				overlayActivate(dialog?: string): Promise<{ ok: boolean; errMsg?: string }>
				dlcIsInstalled(dlcAppId: number): Promise<boolean>
				dlcGetInstalled(): Promise<DwebPlatformDlcInfo[]>
				onEvent(handler: (payload: PlatformEventPayload) => void): number
				offEvent(listenerId: number): { ok: boolean }
			}
		}
	}
}
