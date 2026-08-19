export type SubtitleRecogModelSize = 'tiny' | 'base' | 'small'

export interface SubtitleRecogCue {
	startTime: number
	endTime: number
	text: string
}

export interface SubtitleRecogProgressChunk {
	type: 'progress' | 'phase' | 'done' | 'error'
	percent?: number
	phase?: string
	message?: string
	downloadedBytes?: number
	totalBytes?: number
	path?: string
	size?: number
	cues?: SubtitleRecogCue[]
	cueCount?: number
	modelSize?: SubtitleRecogModelSize
	version?: string
	error?: string
}

export interface SubtitleRecogBinaryStatus {
	ok: boolean
	installed: boolean
	path: string
	size?: number
	detail: string
}

export interface SubtitleRecogFfmpegStatus {
	ok: boolean
	detail: string
}

export interface SubtitleRecogInstalledModel {
	size: SubtitleRecogModelSize
	path: string
	fileSize: number
	ok: boolean
}

export interface SubtitleRecogEnvStatus {
	ok: boolean
	ffmpeg: SubtitleRecogFfmpegStatus
	binary: SubtitleRecogBinaryStatus
	models: SubtitleRecogInstalledModel[]
	defaultModel: SubtitleRecogModelSize | null
	paths: {
		binaryDir: string
		modelDir: string
	}
}

export interface SubtitleRecogBinaryConfig {
	supported: boolean
	platform: string
	version?: string
	url?: string
	fileName?: string
	estimatedSize?: number
	message?: string
}

export interface SubtitleRecogFfmpegConfig {
	supported: boolean
	platform: string
	version?: string
	url?: string
	fileName?: string
	estimatedSize?: number
	message?: string
}

export interface SubtitleRecogModelInfo {
	size: SubtitleRecogModelSize
	name: string
	description: string
	diskSize: string
	language: string
	recommendedFor: string
}

export interface SubtitleRecogModelDownloadConfig {
	supported: boolean
	size: SubtitleRecogModelSize
	name?: string
	description?: string
	url?: string
	fileName?: string
	estimatedSize?: number
	diskSize?: string
	message?: string
}

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
	CloudTemplatesDeleteResult,
	CloudStorageProviderRegion,
	CloudStorageCredentialField,
	CloudStorageProviderMeta,
	Open3DEditorPayload,
	Open3DEditorResult,
	WorkshopTemplatesPlatformResult,
	WorkshopTemplatesQueryResult,
	WorkshopTemplatesDownloadPayload,
	WorkshopTemplatesDownloadResult,
	WorkshopTemplatesProgressResult,
	WorkshopTemplatesInstallInfoResult,
	OpenVideoEditorPayload,
	OpenVideoEditorResult,
	OpenComfySetupPayload,
	OpenComfySetupResult,
} from '../electronBridge/types'
import type { WorkflowResource, WorkflowNode } from '../aiworkflow/types'

export type ResourceManagerDataPayload = {
	resources?: WorkflowResource[]
	nodesById?: Record<string, WorkflowNode>
	nodeOrder?: string[]
}

export type ResourceManagerEventPayload = {
	event: string
	data?: unknown
}

export type TemplateCenterEventPayload = {
	event: string
	data?: unknown
}

declare global {
	const __DWEB_REPO_URL__: string
	const __DWEB_APP_VERSION__: string
	const __DWEB_APP_NAME__: string
	const __DWEB_APP_COPYRIGHT__: string
	const __DWEB_HOMEPAGE_URL__: string
	const __DWEB_BILIBILI_URL__: string
	const __DWEB_ISSUES_URL__: string

	type DwebUpdateCheckResult = {
		ok: boolean
		skipped?: boolean
		reason?: string
		hasUpdate?: boolean
		currentVersion: string
		latestVersion?: string
		releaseUrl?: string
		releaseNotes?: string
		publishedAt?: string
		isPrerelease?: boolean
		isDraft?: boolean
		error?: string
	}

	type DwebAppInfo = {
		appName: string
		appId?: string
		appVersion: string
		copyright: string
		license: string
		homepage: string
		repoUrl: string
		bilibiliUrl: string
		issuesUrl: string
	}

	type PlatformEventName = 'disconnected' | 'user-changed' | 'overlay-activated' | 'overlay-deactivated' | 'status-changed'

	interface PlatformEventPayload {
		event: PlatformEventName
		data: unknown
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
		__DWEB_REPO_URL__?: string
		__DWEB_APP_VERSION__?: string
		__DWEB_APP_NAME__?: string
		__DWEB_APP_COPYRIGHT__?: string
		__DWEB_HOMEPAGE_URL__?: string
		__DWEB_BILIBILI_URL__?: string
		__DWEB_ISSUES_URL__?: string
		__DWEB_BACKEND_BASE_URL?: string
		__DWEB_BACKEND_BASE_URL__?: string
		__DWEB_BACKEND_MODE__?: 'normal' | 'migration'
		__DWEB_RUNTIME__?: {
			platform?: 'electron' | 'web'
			isElectron?: boolean
			appName?: string
			appVersion?: string
		}
		__DWEB_CLIENT_SETTINGS?: ClientSettings | null
		__DWEB_AIWF_AUTO_HELLO?: string
		__DWEB_AIWF_AUTO_HELLO_TEXT?: string
		__DWEB_LOCAL_EXEC_BASE_PATH?: string
		__DWEB_LOCAL_EXEC_STREAM_MODE?: string
		process?: { versions?: { electron?: string } }
		dweb?: {
			common: {
				getAppInfo?(): DwebAppInfo
				checkForUpdate?(): Promise<DwebUpdateCheckResult>
				isSteamVersion?(): Promise<{ ok: boolean; isSteam: boolean }>
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
				health?(): Promise<{ ok: boolean; value?: { status: string; timestamp: number; localdb: boolean; db: boolean }; error?: string }>
				echo?(payload: unknown): Promise<{ ok: boolean; value?: { echo: unknown; timestamp: number }; error?: string }>
				getUserAgreement?(): Promise<{ ok: boolean; value?: { content: string }; error?: string }>
				getMigrationStatus?(): Promise<unknown>
				invokeStream?<T = unknown>(baseChannel: string, payload?: Record<string, unknown>): AsyncGenerator<T, void, void>
			}
			window: {
				minimize(): Promise<{ ok: boolean; error?: string }>
				toggleMaximize(): Promise<{ ok: boolean; maximized?: boolean; error?: string }>
				isMaximized(): Promise<{ ok: boolean; maximized?: boolean; error?: string }>
				reload(): Promise<{ ok: boolean; error?: string }>
				openDevTools(): Promise<{ ok: boolean; opened?: boolean; error?: string }>
				close(): Promise<{ ok: boolean; error?: string }>
				open3dEditor(payload: Open3DEditorPayload): Promise<Open3DEditorResult>
				openVideoEditor(payload: OpenVideoEditorPayload): Promise<OpenVideoEditorResult>
				openComfySetup(payload?: OpenComfySetupPayload): Promise<OpenComfySetupResult>
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
					subPath?: string
				}): Promise<{ ok: boolean; asset?: UploadedProjectAsset; error?: string }>
				importProjectAsset(payload: {
					projectId: number
					kind?: string
					name?: string
					sourcePath?: string
					sourceUrl?: string
					bucket?: string
					subPath?: string
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
				db?: {
					_initState?(): Promise<{ ok?: boolean; error?: string; dbFilePath?: string }>
					_ensureInitialized?(payload?: Record<string, unknown>): Promise<{ ok?: boolean; error?: string }>
					projects?: {
						list?(): Promise<unknown>
						openFolder?(payload: { rootPath: string; name: string; create: boolean }): Promise<{
							ok?: boolean
							project?: { id: number }
							error?: string
						}>
						delete?(payload: { id: number }): Promise<unknown>
					}
					templates?: {
						list?(): Promise<{ ok?: boolean; value?: Array<{
							id: string
							name: string
							description: string
							category: string
							tags: string[]
							nodeCount: number
							source: string
							filePath: string
							coverPath: string
							createdAt: number
							updatedAt: number
						}>; error?: string }>
						getBlob?(payload: { id: string }): Promise<{ ok?: boolean; buffer?: ArrayBuffer; error?: string }>
						getCover?(payload: { id: string }): Promise<{ ok?: boolean; buffer?: ArrayBuffer; mimeType?: string; error?: string }>
						save?(payload: {
							id?: string
							name: string
							description?: string
							category?: string
							tags?: string[]
							nodeCount?: number
							zipBuffer: ArrayBuffer | Uint8Array
							coverBuffer?: ArrayBuffer | Uint8Array | null
						}): Promise<{ ok?: boolean; template?: unknown; error?: string }>
						remove?(payload: { id: string }): Promise<{ ok?: boolean; error?: string }>
					}
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
				openResourceManager(payload: { projectId: number; title: string }): Promise<{ ok: boolean; error?: string }>
				closeResourceManager(): Promise<{ ok: boolean; error?: string }>
				focusResourceManager(): Promise<{ ok: boolean; error?: string }>
				sendResourceManagerData(payload: ResourceManagerDataPayload): Promise<{ ok: boolean; error?: string }>
				broadcastResourceEvent(payload: ResourceManagerEventPayload): Promise<{ ok: boolean; error?: string }>
				notifyResourceEvent(payload: ResourceManagerEventPayload): Promise<{ ok: boolean; error?: string }>
				getResourceManagerData(): ResourceManagerDataPayload | null
				requestResourceManagerData(): Promise<{ ok: boolean; data?: ResourceManagerDataPayload; error?: string }>
				onResourceManagerEvent(handler: (payload: ResourceManagerEventPayload) => void): number
				offResourceManagerEvent(listenerId: number): Promise<{ ok: boolean; error?: string }>
				onResourceManagerNotify(handler: (payload: ResourceManagerEventPayload) => void): number
				offResourceManagerNotify(listenerId: number): Promise<{ ok: boolean; error?: string }>
				onResourceManagerData(handler: (payload: ResourceManagerDataPayload) => void): number
				offResourceManagerData(listenerId: number): Promise<{ ok: boolean; error?: string }>

				openTemplateCenter(payload: { projectId?: number; title?: string }): Promise<{ ok: boolean; error?: string }>
				closeTemplateCenter(): Promise<{ ok: boolean; error?: string }>
				focusTemplateCenter(): Promise<{ ok: boolean; error?: string }>
				sendTemplateCenterData(payload: unknown): Promise<{ ok: boolean; error?: string }>
				broadcastTemplateCenterEvent(payload: TemplateCenterEventPayload): Promise<{ ok: boolean; error?: string }>
				notifyTemplateCenterEvent(payload: TemplateCenterEventPayload): Promise<{ ok: boolean; error?: string }>
				getTemplateCenterData(): unknown
				requestTemplateCenterData(): Promise<{ ok: boolean; data?: unknown; error?: string }>
				onTemplateCenterEvent(handler: (payload: TemplateCenterEventPayload) => void): number
				offTemplateCenterEvent(listenerId: number): Promise<{ ok: boolean; error?: string }>
				onTemplateCenterNotify(handler: (payload: TemplateCenterEventPayload) => void): number
				offTemplateCenterNotify(listenerId: number): Promise<{ ok: boolean; error?: string }>
				onTemplateCenterData(handler: (payload: unknown) => void): number
				offTemplateCenterData(listenerId: number): Promise<{ ok: boolean; error?: string }>

				getImageMarkupInitialData(): Promise<{ imageDataUrl?: string; sourceNodeId?: string; sourceProjectId?: number } | null>
				exportImageMarkup(payload: {
					imageDataUrl: string
					dataUrl: string
					width: number
					height: number
					exportType?: 'markup' | 'screenshot' | 'subject-crop'
				}): Promise<{ ok: boolean; error?: string }>
			}
			videostudio: {
				pingBackend(): Promise<BackendPingResult>
				selectExportDir(options?: unknown): Promise<DirectoryPickResult>
			}
			subtitleRecog: {
				checkEnv(): Promise<SubtitleRecogEnvStatus>
				getBinaryConfig(payload?: { useMirror?: boolean }): Promise<SubtitleRecogBinaryConfig>
				downloadBinary(payload?: { useMirror?: boolean; overwrite?: boolean }): AsyncGenerator<SubtitleRecogProgressChunk, void, void>
				getFfmpegConfig(payload?: { useMirror?: boolean }): Promise<SubtitleRecogFfmpegConfig>
				downloadFfmpeg(payload?: { useMirror?: boolean; overwrite?: boolean }): AsyncGenerator<SubtitleRecogProgressChunk, void, void>
				getAvailableModels(): Promise<SubtitleRecogModelInfo[]>
				getModelConfig(payload?: { size?: SubtitleRecogModelSize; useMirror?: boolean }): Promise<SubtitleRecogModelDownloadConfig>
				downloadModel(payload?: { size?: SubtitleRecogModelSize; useMirror?: boolean; overwrite?: boolean }): AsyncGenerator<SubtitleRecogProgressChunk, void, void>
				getInstalledModels(): Promise<SubtitleRecogInstalledModel[]>
				recognize(payload: { videoPath: string; modelSize?: SubtitleRecogModelSize; language?: string }): AsyncGenerator<SubtitleRecogProgressChunk, void, void>
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
			cloudTemplates: {
				getPlatform(): Promise<CloudTemplatesPlatformResult>
				getQuota(): Promise<CloudTemplatesQuotaResult>
				list(options?: { forceRefresh?: boolean }): Promise<CloudTemplatesListResult>
				upload(payload: CloudTemplatesUploadPayload): Promise<CloudTemplatesUploadResult>
				download(payload: CloudTemplatesDownloadPayload): Promise<CloudTemplatesDownloadResult>
				delete(payload: CloudTemplatesDeletePayload): Promise<CloudTemplatesDeleteResult>
			}
			workshopTemplates?: {
				getPlatform(): Promise<WorkshopTemplatesPlatformResult>
				query(options?: { tag?: string; limit?: number; offset?: number }): Promise<WorkshopTemplatesQueryResult>
				download(payload: WorkshopTemplatesDownloadPayload): Promise<WorkshopTemplatesDownloadResult>
				progress(payload: { publishedFileId: string }): Promise<WorkshopTemplatesProgressResult>
				installInfo(payload: { publishedFileId: string }): Promise<WorkshopTemplatesInstallInfoResult>
			}
			cloudfs: {
				listProviders(): Promise<{ ok: boolean; providers?: CloudStorageProviderMeta[]; error?: string }>
				getActiveConfig(): Promise<{ configured: boolean; providerId?: string; providerMeta?: CloudStorageProviderMeta; config?: Record<string, unknown>; lastTestedAt?: string; lastTestOk?: boolean; error?: string }>
				getConfigStatus(): Promise<{ ok: boolean; configured: boolean; hasActiveBucket: boolean; providerId: string; providerName: string; activeBucketName: string; lastTestedAt?: string; lastTestOk?: boolean; error: string | null }>
				saveConfig(payload: { providerId: string; config: Record<string, unknown>; lastTestOk?: number }): Promise<{ ok: boolean; error?: string }>
				clearConfig(): Promise<{ ok: boolean; error?: string }>
				testConfig(payload: { providerId: string; config: Record<string, unknown> }): Promise<{ ok: boolean; error?: string; message?: string }>
				validateCredentials(payload: { providerId: string; credentials?: Record<string, unknown>; region?: string; endpoint?: string }): Promise<{ ok: boolean; error?: string; buckets?: Array<{ name: string; creationDate?: string; region?: string }> }>
				setupBucket(payload: { providerId: string; credentials?: Record<string, unknown>; region?: string; bucketName?: string; options?: Record<string, unknown> }): Promise<{ ok: boolean; error?: string; bucketName?: string; endpoint?: string; publicUrlBase?: string }>
				listBuckets(payload?: { providerId?: string; credentials?: Record<string, unknown>; region?: string; endpoint?: string }): Promise<{ ok: boolean; error?: string; buckets?: Array<{ name: string; creationDate?: string; region?: string }> }>
				createBucket(payload: { bucketName: string; options?: Record<string, unknown> }): Promise<{ ok: boolean; error?: string; bucketName?: string }>
				createFolder(payload: { folderPath: string; currentPrefix?: string }): Promise<{ ok: boolean; error?: string; key?: string }>
				updateBucket(payload: { bucketName?: string; bucketId?: string }): Promise<{ ok: boolean; error?: string; bucket?: any }>
				listFiles(payload?: { prefix?: string; options?: Record<string, unknown> }): Promise<{ ok: boolean; items?: Array<{ key: string; name: string; isFolder: boolean; size: number; contentType: string; lastModified: number; etag: string; publicUrl: string; thumbnailUrl: string }>; prefixes?: string[]; nextMarker?: string; isTruncated?: boolean; error?: string }>
				uploadFile(payload: { key?: string; data: ArrayBuffer | Uint8Array; options?: Record<string, unknown> }): Promise<{ ok: boolean; error?: string; key?: string; publicUrl?: string; size?: number; etag?: string }>
				deleteFile(payload: { key: string }): Promise<{ ok: boolean; error?: string }>
				getPublicUrl(payload: { key: string; expires?: number }): Promise<{ ok: boolean; error?: string; url?: string }>
				uploadToPublicUrl(payload: { data: ArrayBuffer | Uint8Array; name: string; mimeType: string; prefix?: string }): Promise<{ ok: boolean; error?: string; key?: string; publicUrl?: string; size?: number; etag?: string }>
				listConfiguredBuckets(): Promise<{ ok: boolean; buckets: any[]; error?: string }>
				addBucketFromCloud(payload: { bucketName: string; providerId?: string; credentials?: Record<string, unknown>; region?: string; endpoint?: string }): Promise<{ ok: boolean; bucket?: any; alreadyExists?: boolean; error?: string }>
				removeConfiguredBucket(payload: { bucketId: string }): Promise<{ ok: boolean; error?: string }>
				switchActiveBucket(payload: { bucketId: string }): Promise<{ ok: boolean; error?: string; bucket?: any }>
				fixBucketAcl(payload: { bucketId: string }): Promise<{ ok: boolean; error?: string; acl?: string }>
			}
			meshy?: any
			seedance?: any
			chat?: any
			export?: any
			editor?: any
			comfyui?: any
			thirdParty?: any
			agentSkills?: any
			codex?: any
			projects?: any
			projectAssets?: any
			blender?: {
				checkStatus(payload?: any): Promise<any>
				mcpConnect(payload?: any): Promise<any>
				mcpDisconnect(payload?: any): Promise<any>
				mcpStatus(payload?: any): Promise<any>
				mcpCallTool(payload?: any): Promise<any>
				importModel(payload?: any): Promise<any>
				checkToolsReady(payload?: any): Promise<any>
				mountTools(payload?: any): Promise<any>
				workspaceInit(payload?: { nodeId: string; projectId?: number; references?: Array<{ base64: string; mimeType: string; fileName: string; sourceAlias?: string }> }): Promise<{ ok: boolean; workspacePath?: string; relativePath?: string; screenshotsDir?: string; referencesDir?: string; references?: Array<{ fileName: string; absolutePath: string; relativePath: string; sourceAlias?: string }>; error?: string }>
				workspaceSaveScript(payload?: { nodeId: string; projectId?: number; code: string; summary?: string }): Promise<{ ok: boolean; fileName?: string; relativePath?: string; absolutePath?: string; error?: string }>
				workspaceSaveScreenshot(payload?: { nodeId: string; projectId?: number; base64Data: string; mimeType?: string }): Promise<{ ok: boolean; fileName?: string; relativePath?: string; absolutePath?: string; url?: string; error?: string }>
				workspaceClear(payload?: { nodeId: string; projectId?: number }): Promise<{ ok: boolean; cleared?: boolean; error?: string }>
				workspaceListScripts(payload?: { nodeId: string; projectId?: number }): Promise<{ ok: boolean; scripts?: Array<{ fileName: string; relativePath: string; timestamp: number; summary: string; size: number }>; error?: string }>
				workspaceGetStats(payload?: { nodeId: string; projectId?: number }): Promise<{ ok: boolean; scriptCount?: number; screenshotCount?: number; sessionCount?: number; error?: string }>
				workspaceOpenFolder(payload?: { nodeId: string; projectId?: number }): Promise<{ ok: boolean; path?: string; error?: string }>
				workspaceGetPath(payload?: { nodeId: string; projectId?: number }): Promise<{ ok: boolean; path?: string; exists?: boolean; error?: string }>
				mcpListTools(payload?: any): Promise<any>
				onMcpStatusChanged?(callback: (payload: any) => void): () => void
			}
			gemini?: {
				chat?(payload: any): Promise<any>
			}
			/**
			 * CLI 跨进程控制服务器命名空间（dweb:cli-control:* IPC）
			 */
			cliControlServer: {
				getStatus(): Promise<{
					ok: boolean
					running: boolean
					port?: number
					host?: string
					error?: string
					app?: { name: string; version: string; currentProject?: { id: number; name: string } | null }
					agent?: { ready: boolean; runtime: string }
					mcp?: { builtinToolsCount: number }
				}>
				getTask(payload: { taskId: string }): Promise<{
					ok: boolean
					task?: {
						taskId: string
						command: string
						status: string
						payload?: Record<string, unknown>
						source?: string
						createdAt: number
						updatedAt?: number
						completedAt?: number
						nodeId?: string
						outputFiles?: string[]
						exportedFiles?: string[]
						error?: string | { code: string; message: string }
						progress?: { percent: number; phase?: string }
					}
					error?: string
				}>
				listTasks(payload?: {
					limit?: number
					offset?: number
					status?: string
					filterSource?: string
				}): Promise<{
					ok: boolean
					tasks: Array<{
						taskId: string
						command: string
						status: string
						source?: string
						createdAt: number
						updatedAt?: number
					}>
					total: number
					limit?: number
					offset?: number
					error?: string
				}>
				markTaskCompleted(payload: {
					taskId: string
					outputFiles?: string[]
					exportedFiles?: string[]
				}): Promise<{ ok: boolean; error?: string }>
				markTaskFailed(payload: {
					taskId: string
					error?: string | { code?: string; message: string }
				}): Promise<{ ok: boolean; error?: string }>
			}
		}
	}
}
