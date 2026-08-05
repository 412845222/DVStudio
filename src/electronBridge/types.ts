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

export type CheckStatus = 'pending' | 'pass' | 'fail' | 'warn' | 'skipped'

export type EnvironmentCheckItem = {
	key: string
	label: string
	status: CheckStatus
	message?: string
	helpUrl?: string
	action?: {
		label: string
		command?: string
	}
}

export type CliModelInfo = {
	id: string
	label: string
	vendor?: string
	description?: string
	capabilities?: string[]
	recommended?: boolean
}

export type EnvironmentCheckResult = {
	adapter: string
	checkedAt: string
	allPassed: boolean
	checks: EnvironmentCheckItem[]
	models?: CliModelInfo[]
	version?: string
	error?: string
}

export type CliAdapterSavedConfig = {
	enabled: boolean
	configuredAt?: string
	lastCheckedAt?: string
	version?: string
	models?: CliModelInfo[]
}

export type CliFixResult = {
	ok: boolean
	adapter: string
	checkKey: string
	output?: string
	interactive?: boolean
	message: string
	command?: string
}

export type Tripo3DMode =
	| 'text_to_model'
	| 'image_to_model'
	| 'multiview_to_model'
	| 'texture'
	| 'refine'

export type Tripo3DTaskStatus =
	| 'queued'
	| 'running'
	| 'success'
	| 'failed'
	| 'cancelled'
	| 'canceled'

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
	selectedImages?: Array<{
		nodeId: string
		view: 'front' | 'left' | 'back' | 'right'
		order: number
	}>
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

export type AgentThinkingEffort = 'disabled' | 'low' | 'medium' | 'high'

export type AgentSettings = {
	maxToolCalls: number
	defaultThinkingEffort: AgentThinkingEffort
	enableToolCallWarning: boolean
	autoScrollToBottom: boolean
	showThoughtProcess: boolean
}

export type ClientSettings = {
	defaultResolution: string
	geminiApiKey: string
	geminiModel: string
	geminiBaseUrl?: string
	httpProxy?: string
	bytedanceApiKey: string
	meshyApiKey: string
	tripo3dApiKey?: string
	githubToken?: string
	ui?: {
		locale?: string
	}
	apiKeySecurityAgreement?: {
		accepted: boolean
		acceptedAt?: number
		acceptedVersion?: string
	}
	cliAdapters?: {
		[adapterName: string]: CliAdapterSavedConfig
	}
	agent?: AgentSettings
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

export type EditorModelInfo = {
	id: string
	name: string
	url: string
	assetUrl?: string
}

export type Open3DEditorPayload = {
	nodeId: string
	projectId?: number
	models: EditorModelInfo[]
}

export type Open3DEditorResult = {
	ok: boolean
	error?: string
	focused?: boolean
}

export type OpenVideoEditorPayload = {
	nodeId: string
	projectId?: number
	videoUrl: string
	videoName?: string
	title?: string
}

export type OpenVideoEditorResult = {
	ok: boolean
	error?: string
	focused?: boolean
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

export interface WorkshopTemplateItem {
	publishedFileId: string
	title: string
	description?: string
	tags?: string[]
	fileSize?: number
	createdAt: number
	updatedAt: number
	previewUrl?: string
	author?: string
	isOfficial: boolean
}

export type WorkshopTemplatesPlatformResult = {
	ok: boolean
	platformAvailable: boolean
	platformId?: string
	platformName?: string
	errMsg?: string
}

export type WorkshopTemplatesQueryResult = {
	ok: boolean
	items?: WorkshopTemplateItem[]
	totalResults?: number
	errMsg?: string
}

export type WorkshopTemplatesDownloadPayload = {
	publishedFileId: string
}

export type WorkshopTemplatesDownloadResult = {
	ok: boolean
	publishedFileId: string
	metadata?: Record<string, unknown>
	zipData?: ArrayBuffer
	coverData?: ArrayBuffer | null
	errMsg?: string
}

export type WorkshopTemplatesProgressResult = {
	ok: boolean
	publishedFileId: string
	progress?: { progress: number; state: string } | null
	errMsg?: string
}

export type WorkshopTemplatesInstallInfoResult = {
	ok: boolean
	installed?: boolean
	installPath?: string
	errMsg?: string
}

export interface CloudStorageProviderRegion {
	id: string
	name: string
	endpoint?: string
}

export interface CloudStorageCredentialField {
	key: string
	label: string
	type: 'text' | 'password' | 'select' | 'textarea'
	required: boolean
	placeholder?: string
	options?: Array<{ value: string; label: string }>
}

export interface CloudStorageProviderMeta {
	id: string
	name: string
	description?: string
	icon?: string
	website?: string
	docsUrl?: string
	keyApplyUrl?: string
	keyApplyTip?: string
	regions: CloudStorageProviderRegion[]
	credentialFields: CloudStorageCredentialField[]
}

// ==================== ComfyUI Setup Types ====================

export type ComfyInstallMode = 'new' | 'existing'

export type ComfyInstallType = 'standard' | 'portable' | 'venv' | 'unknown'

export type ComfyCheckItemStatus = 'ok' | 'warn' | 'error' | 'checking' | 'unknown'

export interface ComfyCheckItem {
	key: string
	label: string
	status: ComfyCheckItemStatus
	detail?: string
	version?: string
	canFix?: boolean
	fixAction?: string
	downloadUrl?: string
	downloadLabel?: string
}

export interface ComfyPathValidation {
	ok: boolean
	error?: string
	warning?: string
	exists?: boolean
	isComfyUI?: boolean
}

export type ComfyPythonCandidateType =
	| 'managed_venv'
	| 'venv'
	| 'portable'
	| 'desktop_bundled'
	| 'system'
	| 'py_launcher'
	| 'none'

export interface ComfyPythonCandidate {
	path: string
	type: ComfyPythonCandidateType
	available: boolean
	version?: string
	hasTorch: boolean
	torchVersion?: string
	torchCuda: boolean
	canImportComfy: boolean
	canStartComfy?: boolean
	importError?: string
	error?: string
}

export interface ComfyModelSource {
	path: string
	count: number
}

export interface ComfyModelTypeInfo {
	total: number
	sources: ComfyModelSource[]
}

export interface ComfyInstallProbeResult {
	ok: boolean
	error?: string
	isComfyUI: boolean
	isDesktop: boolean
	version?: string
	commitHash?: string
	installType: ComfyInstallType
	pythonInfo?: {
		type: ComfyPythonCandidateType
		path?: string
		version?: string
		hasTorch: boolean
		torchVersion?: string
		torchCuda: boolean
		canImportComfy: boolean
		canStartComfy?: boolean
		importError?: string
		candidates?: ComfyPythonCandidate[]
	}
	launchCompatibility: {
		status: 'full' | 'partial' | 'none'
		method?: 'main_py' | 'portable_bat' | 'desktop_app' | 'custom_script'
		canStart: boolean
		warnings?: string[]
		needsFix?: string[]
	}
	hasExtraModelConfig: boolean
	extraModelPaths?: Record<string, string[]>
	customModelPaths?: string[]
	models?: Record<string, ComfyModelTypeInfo>
	totalModelCount?: number
	customNodeCount?: number
}

export interface ComfyEnvCheckResult {
	ok: boolean
	items: ComfyCheckItem[]
	installPath?: string
	installMode?: ComfyInstallMode
	installType?: ComfyInstallType
	comfyUIFound?: boolean
	serviceRunning?: boolean
	serviceUrl?: string
	pythonPath?: string
	pythonVersion?: string
	gitAvailable?: boolean
	cudaAvailable?: boolean
	cudaVersion?: string
	torchVersion?: string
	modelCount?: number
}

export interface ComfySetupConfig {
	installMode: ComfyInstallMode
	installPath: string
	venvPath?: string
	installType?: ComfyInstallType
	port: number
	autoStart: boolean
	mirror: 'github' | 'gitee' | 'custom'
	customMirrorUrl?: string
	pythonPath?: string
	extraArgs: string[]
	proxy?: string
	customModelPaths?: string[]
	pypiMirror?: string
	torchMirror?: string
	customPypiMirrorUrl?: string
	customTorchMirrorUrl?: string
	probeResult?: ComfyInstallProbeResult
}

export interface ComfyMirrorSource {
	key: string
	name: string
	url: string
	kind: 'pypi' | 'torch'
	builtin: boolean
	country?: string
}

export interface ComfyMirrorPingResult {
	key: string
	name: string
	url: string
	kind: 'pypi' | 'torch'
	reachable: boolean
	latency: number | null
	country?: string
}

export interface ComfyMirrorListResult {
	ok: boolean
	pypiMirrors: ComfyMirrorSource[]
	torchMirrors: ComfyMirrorSource[]
}

export type PythonEnvSetupStep =
	| 'preparing'
	| 'venv_exists'
	| 'creating_venv'
	| 'upgrading_pip'
	| 'installing_torch'
	| 'installing_requirements'
	| 'verifying'
	| 'done'
	| 'error'

export interface PythonEnvSetupEvent {
	type: 'step' | 'log' | 'done' | 'error' | 'progress'
	step?: PythonEnvSetupStep
	message?: string
	stream?: 'stdout' | 'stderr'
	progress?: number
	overwrite?: boolean
	pythonPath?: string
	venvRoot?: string
	error?: string
	needsManualInstall?: boolean
	autoInstallAvailable?: boolean
	cudaVersion?: string
	pythonVersion?: string
	platformTag?: string
	abiTag?: string
	torchVersion?: string
	torchWheel?: string
	torchvisionWheel?: string
	torchaudioWheel?: string
	aliyunTorchUrl?: string
	aliyunTorchvisionUrl?: string
	aliyunTorchaudioUrl?: string
	officialTorchUrl?: string
	officialTorchvisionUrl?: string
	officialTorchaudioUrl?: string
	venvPythonPath?: string
	oneClickInstallCmd?: string
	manualInstallCmd?: string
	installDepsCmd?: string
	aliyunDirUrl?: string
	officialDirUrl?: string
	manualDownloadUrl?: string
	officialDownloadUrl?: string
}

export type InstallStep =
	| 'idle'
	| 'cloning'
	| 'creating-venv'
	| 'installing-torch'
	| 'installing-requirements'
	| 'downloading-models'
	| 'done'
	| 'error'

export interface ComfyInstallState {
	running: boolean
	step: InstallStep
	progress: number
	message?: string
	error?: string
}

export interface OpenComfySetupPayload {
	source?: 'node' | 'settings' | 'service-center'
}

export interface OpenComfySetupResult {
	ok: boolean
	error?: string
	focused?: boolean
}

export type ComfyServiceLogStream = 'stdout' | 'stderr' | 'system'

export interface ComfyServiceLogEntry {
	ts: number
	stream: ComfyServiceLogStream
	message: string
}

export type ComfyServiceLifecycle = 'stopped' | 'starting' | 'running' | 'stopping'

export interface ComfyServiceRuntimeStatus {
	running: boolean
	pid: number | null
	port: number
	startTime: number | null
	exitCode: number | string | null
}

export interface ComfyServiceInfo {
	key: string
	name: string
	description: string
	status: ComfyServiceLifecycle
	running?: boolean
	pid?: number | null
	port?: number
	startTime?: number | null
	exitCode?: number | string | null
	errorMsg?: string
}
