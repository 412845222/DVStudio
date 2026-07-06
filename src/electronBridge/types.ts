export type BackendPingResult = { ok: boolean; status?: number; error?: string }

export type BackendStartResult = { ok: boolean; baseUrl?: string; port?: number; error?: string }

export type BackendRestartResult = { ok: boolean; baseUrl?: string; port?: number; error?: string }

export type BackendStatus = {
	running: boolean
	baseUrl: string
	port: number
	lastError: string
	logLineCount: number
}

export type BackendRuntimeState = {
	running: boolean
	healthy: boolean
	baseUrl: string
	port: number
	lastError: string
	setupRunning: boolean
	updatedAt: number
	mode?: 'normal' | 'migration'
}

export type BackendLogsResult = {
	ok: boolean
	lines: string[]
	total: number
	baseUrl: string
	port: number
	running: boolean
	lastError: string
}

export type DiagnosticsPayload = {
	python: { ok: boolean; detail?: string; command?: string; argsPrefix?: string[] }
	pythonBridge: { ok: boolean; detail?: string }
	ffmpeg: { ok: boolean; detail?: string }
}

export type DiagnosticsResult = { ok: boolean; data?: DiagnosticsPayload; error?: string }

export type OpenFolderResult = { ok: boolean; error?: string }
export type DirectoryPickResult = { canceled: boolean; filePaths: string[] }

export type BootstrapInstallResult = {
	ok: boolean
	started?: boolean
	running?: boolean
	error?: string
}

export type SetupStepStatus = 'unknown' | 'running' | 'ok' | 'warn' | 'error'

export type SetupStep = {
	key: string
	label: string
	status: SetupStepStatus
	detail?: string
	progress: number
}

export type SetupState = {
	running: boolean
	updatedAt: number
	steps: SetupStep[]
}

export type SetupRunResult = {
	ok: boolean
	error?: string
	running?: boolean
	baseUrl?: string
	port?: number
	state: SetupState
}

export type CleanupOldProjectResult = {
	ok: boolean
	resourceDir?: string
	error?: string
	results?: Array<{
		target: string
		path: string
		status: 'removed' | 'missing' | 'error'
		error?: string
	}>
}

export type ClientSettings = {
	defaultResolution: string
	deepseekApiKey: string
	deepseekBaseUrl: string
	deepseekModel: string
	geminiApiKey: string
	geminiModel: string
	geminiBaseUrl?: string
	httpProxy?: string
	bytedanceApiKey: string
	meshyApiKey: string
	githubToken: string
	ui?: {
		locale?: string
	}
	apiKeySecurityAgreement?: {
		accepted: boolean
		acceptedAt?: number
		acceptedVersion?: string
	}
}

export type ClientSettingsResult = {
	ok: boolean
	data?: ClientSettings
	path?: string
	error?: string
}

export type UploadedProjectAsset = {
	kind: string
	name: string
	contentType: string
	size: number
	relativePath: string
	projectRelativePath: string
	absolutePath: string
	url: string
	sourcePath?: string
}

export type CloudQuotaInfo = {
	totalBytes: number
	availableBytes: number
}

export type CloudTemplateMeta = {
	id: string
	name: string
	description: string
	category: string
	tags: string[]
	createdAt: number
	updatedAt: number
	nodeCount: number
	packageFileName: string
	coverFileName: string
}

export type CloudTemplatesPlatformResult = {
	ok: boolean
	platformId?: string
	platformName?: string
	errMsg?: string
}

export type CloudTemplatesQuotaResult = {
	ok: boolean
	quota?: CloudQuotaInfo
	errMsg?: string
}

export type CloudTemplatesListResult = {
	ok: boolean
	items?: CloudTemplateMeta[]
	lastSyncedAt?: number
	quota?: CloudQuotaInfo | null
	errMsg?: string
}

export type CloudTemplatesUploadPayload = {
	id: string
	name: string
	description?: string
	category?: string
	tags?: string[]
	nodeCount?: number
	zipData: ArrayBuffer
	coverData?: ArrayBuffer | null
}

export type CloudTemplatesUploadResult = {
	ok: boolean
	errMsg?: string
}

export type CloudTemplatesDownloadPayload = {
	id: string
}

export type CloudTemplatesDownloadResult = {
	ok: boolean
	meta?: CloudTemplateMeta
	zipData?: ArrayBuffer
	coverData?: ArrayBuffer | null
	errMsg?: string
}

export type CloudTemplatesDeletePayload = {
	id: string
}

export type CloudTemplatesDeleteResult = {
	ok: boolean
	errMsg?: string
}
