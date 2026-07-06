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
