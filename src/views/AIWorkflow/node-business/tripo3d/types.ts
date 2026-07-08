import type {
	WorkflowNode,
	WorkflowTripo3DModelSettings,
	WorkflowTripo3DTaskStatus,
	WorkflowTripo3DMode,
	WorkflowTripo3DRelationKind,
	WorkflowTripo3DInputSummary,
	WorkflowTripo3DOutputSummary,
	WorkflowTripo3DRelationSummary
} from '../../../../aiworkflow/types'
import { isArray, isBoolean, isNumber, isRecord, isString } from '../../../../types/utils'
import type { ExternalAssetProgress } from '../../assets/useAIWorkflowAssetPersistence'

export type Tripo3DTaskStatus = WorkflowTripo3DTaskStatus
export type Tripo3DMode = WorkflowTripo3DMode
export type Tripo3DRelationKind = WorkflowTripo3DRelationKind
export type Tripo3DInputSummary = WorkflowTripo3DInputSummary
export type Tripo3DOutputSummary = WorkflowTripo3DOutputSummary
export type Tripo3DRelationSummary = WorkflowTripo3DRelationSummary
export type Tripo3DModel3DSettings = WorkflowTripo3DModelSettings

export type Tripo3DTaskFamily =
	| 'text_to_model'
	| 'image_to_model'
	| 'multiview_to_model'
	| 'texture'
	| 'refine'

export type Tripo3DGenerateResponse =
	| { ok: true; mode: string; taskId: string; status: string; raw?: unknown }
	| { ok: false; error: string; status?: number }

export type Tripo3DTaskResponse =
	| {
			ok: true
			mode: string
			taskId: string
			status: string
			progress: number
			thumbnailUrl: string
			modelUrl: string
			statusText?: string
			errorMessage?: string
			raw?: unknown
	  }
	| { ok: false; error: string; status?: number }

export type Tripo3DTasksListResponse =
	| { ok: true; items: Tripo3DTaskMirrorItem[] }
	| { ok: false; error: string; status?: number }

export type Tripo3DTaskDetailResponse =
	| { ok: true; item: Tripo3DTaskMirrorItem }
	| { ok: false; error: string; status?: number }

export type Tripo3DTaskActionResponse =
	| { ok: true; taskId: string; status?: string; deleted?: boolean }
	| { ok: false; error: string; status?: number }

export type Tripo3DBalanceResponse =
	| { ok: true; available: boolean; configured: boolean; displayText: string; detail?: unknown }
	| { ok: false; error: string; status?: number }

export type Tripo3DTaskMirrorItem = {
	id: number
	taskId: string
	mode: string
	status: string
	progress: number
	prompt: string
	negativePrompt: string
	modelVersion: string
	faceLimit: number
	texture: boolean
	pbr: boolean
	thumbnailUrl?: string
	modelUrl?: string
	localAssetUrl?: string
	localAssetPath?: string
	errorMessage?: string
	statusText?: string
	nodeId?: string
	projectId?: number | null
	createdAt: string
	updatedAt: string
	startedAt?: string
	completedAt?: string
	requestPayload?: Record<string, unknown>
	responsePayload?: Record<string, unknown>
	selectedTaskId?: string
}

export type Tripo3DGenerateFile = {
	type: string
	data?: string
	url?: string
	view?: string
}

export type Tripo3DGeneratePayload = {
	mode: Tripo3DMode | string
	model?: string
	prompt?: string
	negative_prompt?: string
	input?: string
	inputs?: Array<Record<string, string> | string>
	image_url?: string
	file?: Tripo3DGenerateFile
	files?: Tripo3DGenerateFile[]
	model_version?: string
	face_limit?: number
	texture?: boolean
	pbr?: boolean
	enable_image_autofix?: boolean
	texture_alignment?: 'original_image' | 'geometry'
	orientation?: 'default' | 'align_image'
	texture_quality?: 'standard' | 'detailed' | 'extreme'
	geometry_quality?: 'standard' | 'detailed'
	auto_size?: boolean
	quad?: boolean
	smart_low_poly?: boolean
	generate_parts?: boolean
	compress?: 'geometry'
	export_uv?: boolean
	model_seed?: number
	texture_seed?: number
	model_task_id?: string
	original_model_task_id?: string
	model_url?: string
	texture_prompt?: string
	projectId?: number | string
	nodeId?: string
	[key: string]: unknown
}

export type BuildTripo3DRequestResult =
	| {
			ok: true
			payload: Tripo3DGeneratePayload
			promptText: string
			promptSource: 'linked' | 'manual' | 'none'
			imageCount: number
	  }
	| { ok: false; error: string }

export type Tripo3DTaskResultLike = {
	taskId?: string
	mode?: string
	status?: unknown
	progress?: unknown
	thumbnailUrl?: unknown
	modelUrl?: unknown
	statusText?: unknown
	errorMessage?: unknown
	[key: string]: unknown
}

export type Tripo3DComfyService = {
	tripo3dGenerate: (
		payload: Tripo3DGeneratePayload | Record<string, unknown>
	) => Promise<Tripo3DGenerateResponse>
	tripo3dTask: (taskId: string) => Promise<Tripo3DTaskResponse>
	tripo3dTasks: (query?: {
		status?: string
		limit?: number
	}) => Promise<Tripo3DTasksListResponse>
	tripo3dTaskDetail: (taskId: string) => Promise<Tripo3DTaskDetailResponse>
	tripo3dStop: (taskId: string) => Promise<Tripo3DTaskActionResponse>
	tripo3dDelete: (taskId: string) => Promise<Tripo3DTaskActionResponse>
	tripo3dBalance: () => Promise<Tripo3DBalanceResponse>
}

export type Tripo3DEffectiveOutput = {
	thumbnailUrl: string
	modelUrl: string
	localAssetUrl: string
	localAssetPath: string
}

export type WorkflowResourceLike = {
	id: string
	kind: string
	name: string
	url: string
	sourcePath?: string
	projectRelativePath?: string
	[key: string]: unknown
}

export type Tripo3DStoreLike = {
	state: {
		nodesById: Record<string, WorkflowNode>
		nodeOrder: string[]
		resourcesById?: Record<string, unknown>
		resources?: Array<{ id: string }>
		selectedNodeId?: string | null
	}
	commit: (mutation: string, payload?: Record<string, unknown>) => void
}

export type Tripo3DPersistArtifactsResult = {
	ok: boolean
	assetUrl?: string
	assetPath?: string
	projectRelativePath?: string
	resourceId?: string
	thumbnailUrl?: string
	error?: string
}

export type Tripo3DImportArtifactsPayload = {
	taskId: string
	mode: string
	modelUrl: string
	thumbnailUrl?: string
	prompt?: string
	modelVersion?: string
}

export type CreateModel3DNodeAtCenterFn = (opts?: {
	modelUrl?: string
	name?: string
	taskId?: string
	mode?: string
}) => string | null

export type PersistExternalAssetPayload = {
	kind: 'image' | 'file'
	name: string
	sourceUrl?: string
	sourcePath?: string
	onProgress?: (info: ExternalAssetProgress) => void
}

export type PersistExternalAssetResult = {
	url: string
	absolutePath: string
	projectRelativePath?: string
	size?: number
} | null

export type ConnectedTripo3DImageInput = {
	fromNode: WorkflowNode
	fromAnchorId: string
	url: string
}

export type BuildTripo3DRequestPayloadFn = (node: WorkflowNode, meta?: { nodeId?: string; projectId?: number | string }) => Promise<BuildTripo3DRequestResult>

export type Tripo3DNodeSettingsLike =
	| WorkflowTripo3DModelSettings
	| Record<string, unknown>
	| null
	| undefined

function toTripo3DRecord(settings: Tripo3DNodeSettingsLike): Record<string, unknown> {
	return isRecord(settings) ? settings : {}
}

export function getTripo3DSettingString(settings: Tripo3DNodeSettingsLike, key: string): string {
	const record = toTripo3DRecord(settings)
	const val = record[key]
	return isString(val) ? val.trim() : ''
}

export function getTripo3DSettingNumber(
	settings: Tripo3DNodeSettingsLike,
	key: string,
	fallback = 0
): number {
	const record = toTripo3DRecord(settings)
	const val = record[key]
	return isNumber(val) ? val : fallback
}

export function getTripo3DSettingBoolean(
	settings: Tripo3DNodeSettingsLike,
	key: string,
	fallback = false
): boolean {
	const record = toTripo3DRecord(settings)
	const val = record[key]
	return isBoolean(val) ? val : fallback
}

export type Tripo3DTaskPanelItem = {
	id: string
	nodeId?: string
	title: string
	taskId?: string
	mode: string
	modeLabel: string
	status: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
	statusLabel: string
	progress: number
	promptPreview: string
	metaText: string
	footnote: string
	thumbnailUrl?: string
	modelUrl?: string
	localAssetUrl?: string
	localAssetPath?: string
	createdAt: number
	modelVersion?: string
	texture?: boolean
	pbr?: boolean
	faceLimit?: number
	negativePrompt?: string
	statusText?: string
	errorMessage?: string
	requestPayload?: Record<string, unknown>
	responsePayload?: Record<string, unknown>
}

export type Tripo3DTaskPanelDetail = {
	id: string
	title: string
	taskId?: string
	nodeId?: string
	modeLabel: string
	statusLabel: string
	progress: number
	prompt?: string
	negativePrompt?: string
	statusText?: string
	errorMessage?: string
	modelUrl?: string
	assetUrl?: string
	assetPath?: string
	thumbnailUrl?: string
	createdAtLabel?: string
	updatedAtLabel?: string
	sourceLabel?: string
	modelVersion?: string
	texture?: boolean
	pbr?: boolean
	faceLimit?: number
	requestPayload?: Record<string, unknown>
	responsePayload?: Record<string, unknown>
}

export type Tripo3DTaskPanelAction = 'refresh' | 'stop' | 'delete' | 'import-output'

export function isTripo3DTaskResultLike(value: unknown): value is Tripo3DTaskResultLike {
	if (!isRecord(value)) return false
	return true
}

export function extractTripo3DTaskResultFields(raw: unknown): {
	taskId: string
	mode: string
	status: string
	progress: number
	thumbnailUrl: string
	modelUrl: string
	statusText: string
	errorMessage: string
} {
	const record: Record<string, unknown> = isRecord(raw) ? raw : {}

	return {
		taskId: isString(record.taskId) ? record.taskId.trim() : '',
		mode: isString(record.mode) ? record.mode.trim() : '',
		status: isString(record.status) ? record.status.trim() : '',
		progress: isNumber(record.progress) ? record.progress : 0,
		thumbnailUrl: isString(record.thumbnailUrl) ? record.thumbnailUrl.trim() : '',
		modelUrl: isString(record.modelUrl) ? record.modelUrl.trim() : '',
		statusText: isString(record.statusText) ? record.statusText.trim() : '',
		errorMessage: isString(record.errorMessage) ? record.errorMessage.trim() : ''
	}
}

export function normalizeTripo3DTaskStatus(status: unknown): Tripo3DTaskStatus {
	const raw = String(status ?? '').trim().toLowerCase()
	if (raw === 'success' || raw === 'succeeded' || raw === 'completed') return 'succeeded'
	if (raw === 'queued') return 'queued'
	if (raw === 'pending') return 'pending'
	if (raw === 'running' || raw === 'in_progress' || raw === 'processing') return 'running'
	if (raw === 'failed' || raw === 'error') return 'failed'
	if (raw === 'cancelled' || raw === 'canceled') return 'cancelled'
	return 'idle'
}
