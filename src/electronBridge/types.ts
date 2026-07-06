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

export type Tripo3DMode = 'text_to_model' | 'image_to_model' | 'multiview_to_model' | 'texture' | 'refine'

export type Tripo3DTaskStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled' | 'canceled'

export interface Tripo3DGenerateParams {
	mode: Tripo3DMode
	prompt?: string
	negativePrompt?: string
	negative_prompt?: string
	imageUrl?: string
	image_url?: string
	modelSeries?: 'h' | 'p'
	modelVersion?: string
	model_version?: string
	forceSingleImage?: boolean
	selectedImages?: Array<{ nodeId: string; view: 'front' | 'left' | 'back' | 'right'; order: number }>
	enableImageAutofix?: boolean
	textureAlignment?: 'original_image' | 'geometry'
	orientation?: 'default' | 'align_image'
	textureQuality?: 'standard' | 'detailed' | 'extreme'
	geometryQuality?: 'standard' | 'detailed'
	autoSize?: boolean
	quad?: boolean
	smartLowPoly?: boolean
	generateParts?: boolean
	compress?: boolean
	exportUv?: boolean
	faceLimit?: number
	face_limit?: number
	texture?: boolean
	pbr?: boolean
	modelSeed?: number
	model_seed?: number
	textureSeed?: number
	texture_seed?: number
	file?: { type: string; data: string; url?: string }
	files?: Array<{ type: string; data: string }>
	projectId?: number | string
	project_id?: number | string
	nodeId?: string
	node_id?: string
}

export interface Tripo3DTask {
	id: number
	taskId: string
	task_id: string
	mode: Tripo3DMode
	status: Tripo3DTaskStatus
	progress: number
	prompt: string
	negativePrompt: string
	negative_prompt: string
	modelVersion: string
	model_version: string
	faceLimit: number
	face_limit: number
	texture: boolean
	pbr: boolean
	thumbnailUrl: string
	thumbnail_url: string
	modelUrl: string
	model_url: string
	localAssetUrl: string
	localAssetPath: string
	errorMessage: string
	error_message: string
	statusText: string
	status_text: string
	nodeId: string
	node_id: string
	projectId: number | null
	project_id: number | null
	createdAt: string
	updatedAt: string
	startedAt: string
	completedAt: string
	requestPayload?: Record<string, any>
	responsePayload?: Record<string, any>
}

export interface Tripo3DBalance {
	balance?: number
	credits?: number
}

export interface Tripo3DBalanceResult {
	ok: boolean
	available: boolean
	configured: boolean
	displayText: string
	detail?: Tripo3DBalance | any
}

export interface Tripo3DGenerateResult {
	ok: boolean
	mode: Tripo3DMode
	taskId: string
	task_id: string
	status: string
	raw?: any
	error?: string
}

export interface Tripo3DTaskResult {
	ok: boolean
	taskId: string
	task_id: string
	mode: Tripo3DMode
	status: Tripo3DTaskStatus
	progress: number
	prompt: string
	negativePrompt: string
	modelVersion: string
	thumbnailUrl: string
	modelUrl: string
	statusText: string
	errorMessage: string
	raw?: any
	error?: string
}

export interface Tripo3DListTasksResult {
	ok: boolean
	items: Tripo3DTask[]
	error?: string
}

export interface Tripo3DTaskDetailResult {
	ok: boolean
	item: Tripo3DTask & { selectedTaskId?: string }
	error?: string
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
	tripo3dApiKey?: string
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
