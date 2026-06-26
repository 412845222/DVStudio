import type { WorkflowEdge, WorkflowMeshyNodeSettings, WorkflowNode, WorkflowState } from '../../../../aiworkflow/types'
import { isArray, isBoolean, isNumber, isRecord, isString } from '../../../../types/utils'

export type MeshyTaskStatus = 'idle' | 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled'

export type MeshyTaskTarget = '3d' | 'image'

export type MeshyTaskFamily =
	| 'text-to-3d'
	| 'image-to-3d'
	| 'multi-image-to-3d'
	| 'refine'
	| 'retexture'
	| 'remesh'
	| 'rigging'
	| 'animation'
	| 'text-to-image'
	| 'image-to-image'

export type MeshyRequestMode =
	| 'text-to-3d'
	| 'image-to-3d'
	| 'multi-image-to-3d'
	| 'text-to-image'
	| 'image-to-image'
	| 'retexture'
	| 'remesh'
	| 'rigging'
	| 'animation'

export type MeshyRelationKind = 'model' | 'texture' | 'rigging' | 'animation' | 'remesh'

export type MeshyCapability = 'model' | 'textured' | 'rigged' | 'animated'

export type MeshyModelUrls = Partial<Record<'glb' | 'obj' | 'fbx' | 'stl' | 'usdz' | 'pre_remeshed_glb' | 'gltf', string>>

export type MeshyGenerateResponse =
	| { ok: true; mode: string; taskId: string; status: string; raw?: unknown }
	| { ok: false; error: string; status?: number; baseUrl?: string }

export type MeshyTaskResponse =
	| {
			ok: true
			mode: string
			taskId: string
			status: string
			progress: number
			thumbnailUrl: string
			modelUrls: Record<string, string>
			imageUrls?: string[]
			preferredImageUrl?: string
			sourceImageUrl?: string
			preferredModelUrl: string
			sourceModelUrl?: string
			statusText?: string
			errorMessage?: string
			raw?: unknown
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

export type MeshyTasksListResponse =
	| { ok: true; items: MeshyTaskMirrorItem[] }
	| { ok: false; error: string; status?: number; baseUrl?: string }

export type MeshyTaskDetailResponse =
	| { ok: true; item: MeshyTaskMirrorItem }
	| { ok: false; error: string; status?: number; baseUrl?: string }

export type MeshyTaskActionResponse =
	| { ok: true; taskId: string; status?: string; deleted?: boolean }
	| { ok: false; error: string; status?: number; baseUrl?: string }

export type MeshyBalanceResponse =
	| { ok: true; available: boolean; configured: boolean; displayText: string; detail?: string }
	| { ok: false; error: string; status?: number; baseUrl?: string }

export type MeshyTaskMirrorItem = {
	id: number
	taskId: string
	mode: string
	target: MeshyTaskTarget
	family: string
	relationKind?: MeshyRelationKind
	rootTaskId?: string
	parentTaskId?: string
	capabilities?: MeshyCapability[]
	status: string
	progress: number
	prompt: string
	negativePrompt: string
	imageCount: number
	thumbnailUrl?: string
	preferredModelUrl?: string
	localAssetUrl?: string
	localAssetPath?: string
	sourceModelUrl?: string
	preferredImageUrl?: string
	sourceImageUrl?: string
	imageUrls?: string[]
	errorMessage?: string
	statusText?: string
	lastNodeId?: string
	projectId?: number | null
	remoteCreatedAt?: string
	remoteFinishedAt?: string
	createdAt: string
	updatedAt: string
	syncedAt?: string
	children?: MeshyTaskMirrorItem[]
	hasTextureChild?: boolean
	hasRiggingChild?: boolean
	hasAnimationChild?: boolean
	effectiveTaskId?: string
	effectiveRelationKind?: MeshyRelationKind
	effectiveStatus?: string
	effectiveProgress?: number
	effectivePreferredModelUrl?: string
	effectivePreferredImageUrl?: string
	effectiveLocalAssetUrl?: string
	effectiveLocalAssetPath?: string
	effectiveThumbnailUrl?: string
	selectedTaskId?: string
	requestPayload?: Record<string, unknown>
	responsePayload?: Record<string, unknown>
}

export type MeshyOutputSummary = {
	outputKind?: 'image' | '3d-model'
	preferredUrl?: string
	imageUrls?: string[]
	thumbnailUrl?: string
	format?: string
	assetUrl?: string
	assetPath?: string
}

export type MeshyRelationSummary = {
	relationKind?: MeshyRelationKind
	rootTaskId?: string
	parentTaskId?: string
	effectiveTaskId?: string
	effectiveRelationKind?: MeshyRelationKind
	effectiveStatus?: string
	effectiveProgress?: number
	effectivePreferredModelUrl?: string
	effectivePreferredImageUrl?: string
	effectiveLocalAssetUrl?: string
	effectiveLocalAssetPath?: string
	effectiveThumbnailUrl?: string
	capabilities?: MeshyCapability[]
	hasTextureChild?: boolean
	hasRiggingChild?: boolean
	hasAnimationChild?: boolean
}

export type MeshyInputSummary = {
	promptSource?: 'linked' | 'manual' | 'none'
	promptText?: string
	imageCount?: number
	modelInputConnected?: boolean
	lastValidatedAt?: number
}

export type MeshyImageSettings = {
	prompt?: string
	negativePrompt?: string
	seed?: number
	aiModel?: 'nano-banana' | 'nano-banana-pro'
	generateMultiView?: boolean
	aspectRatio?: string
	outputImageCount?: number
	poseMode?: '' | 'a-pose' | 't-pose'
	taskId?: string
	taskFamily?: 'text-to-image' | 'image-to-image'
	mode?: 'text-to-image' | 'image-to-image'
	taskStatus?: MeshyTaskStatus
	progress?: number
	statusText?: string
	errorMessage?: string
	thumbnailUrl?: string
	outputAssetUrl?: string
	outputAssetPath?: string
	outputSummary?: MeshyOutputSummary
	relationSummary?: MeshyRelationSummary
}

export type MeshyModel3DSettings = {
	taskId?: string
	taskStatus?: MeshyTaskStatus
	taskFamily?: string
	progress?: number
	statusText?: string
	errorMessage?: string
	outputSummary?: MeshyOutputSummary
	imageCount?: number
	imageUrls?: string[]
	prompt?: string
}

export type MeshyGeneratePayload = {
	target: MeshyTaskTarget
	family: string
	mode: MeshyRequestMode
	stage: 'preview' | 'refine'
	prompt: string
	negative_prompt?: string
	preview_task_id?: string
	image_url?: string
	image_urls?: string[]
	reference_image_urls?: string[]
	output_image_count?: number
	model_url?: string
	texture_prompt?: string
	texture_image_url?: string
	ai_model?: string
	model_type?: string
	topology?: string
	target_polycount?: number
	symmetry_mode?: string
	should_remesh?: boolean
	save_pre_remeshed_model?: boolean
	should_texture?: boolean
	enable_pbr?: boolean
	pose_mode?: string
	aspect_ratio?: string
	generate_multi_view?: boolean
	auto_size?: boolean
	origin_at?: 'bottom' | 'center'
	seed?: number
	moderation?: boolean
	image_enhancement?: boolean
	remove_lighting?: boolean
	target_formats?: string[]
	relationKind?: string
	rootTaskId?: string
	parentTaskId?: string
	capabilities?: string[]
	[key: string]: unknown
}

export type BuildMeshyRequestResult =
	| {
			ok: true
			payload: MeshyGeneratePayload
			promptText: string
			promptSource: 'linked' | 'manual' | 'none'
			imageCount: number
	  }
	| { ok: false; error: string }

export type MeshyTaskResultLike = {
	taskId?: string
	mode?: string
	status?: unknown
	progress?: unknown
	thumbnailUrl?: unknown
	modelUrls?: unknown
	imageUrls?: unknown
	preferredImageUrl?: unknown
	sourceImageUrl?: unknown
	preferredModelUrl?: unknown
	sourceModelUrl?: unknown
	statusText?: unknown
	errorMessage?: unknown
	[key: string]: unknown
}

export function isMeshyTaskResultLike(value: unknown): value is MeshyTaskResultLike {
	if (!isRecord(value)) return false
	return true
}

export function extractMeshyTaskResultFields(raw: unknown): {
	taskId: string
	mode: string
	status: string
	progress: number
	thumbnailUrl: string
	modelUrls: Record<string, string>
	imageUrls: string[]
	preferredImageUrl: string
	sourceImageUrl: string
	preferredModelUrl: string
	sourceModelUrl: string
	statusText: string
	errorMessage: string
} {
	const record: Record<string, unknown> = isRecord(raw) ? raw : {}

	const modelUrls: Record<string, string> = {}
	const rawModelUrls = record.modelUrls
	if (isRecord(rawModelUrls)) {
		for (const [key, val] of Object.entries(rawModelUrls)) {
			if (isString(val)) modelUrls[key] = val
		}
	}

	const imageUrls: string[] = []
	const rawImageUrls = record.imageUrls
	if (isArray(rawImageUrls)) {
		for (const item of rawImageUrls) {
			if (isString(item)) {
				const trimmed = item.trim()
				if (trimmed) imageUrls.push(trimmed)
			}
		}
	}

	return {
		taskId: isString(record.taskId) ? record.taskId.trim() : '',
		mode: isString(record.mode) ? record.mode.trim() : '',
		status: isString(record.status) ? record.status.trim() : '',
		progress: isNumber(record.progress) ? record.progress : 0,
		thumbnailUrl: isString(record.thumbnailUrl) ? record.thumbnailUrl.trim() : '',
		modelUrls,
		imageUrls,
		preferredImageUrl: isString(record.preferredImageUrl) ? record.preferredImageUrl.trim() : '',
		sourceImageUrl: isString(record.sourceImageUrl) ? record.sourceImageUrl.trim() : '',
		preferredModelUrl: isString(record.preferredModelUrl) ? record.preferredModelUrl.trim() : '',
		sourceModelUrl: isString(record.sourceModelUrl) ? record.sourceModelUrl.trim() : '',
		statusText: isString(record.statusText) ? record.statusText.trim() : '',
		errorMessage: isString(record.errorMessage) ? record.errorMessage.trim() : '',
	}
}

export type MeshyDraggedTaskPayload = {
	taskId?: string
	title?: string
	alias?: string
	meshySettings?: unknown
}

export function isMeshyDraggedTaskPayload(value: unknown): value is MeshyDraggedTaskPayload {
	return isRecord(value)
}

export type MeshyComfyService = {
	meshyGenerate: (payload: MeshyGeneratePayload | Record<string, unknown>) => Promise<MeshyGenerateResponse>
	meshyTask: (taskId: string, mode: string) => Promise<MeshyTaskResponse>
	meshyTasks: (query?: { status?: string; target?: '3d' | 'image' | 'all'; family?: string; limit?: number }) => Promise<MeshyTasksListResponse>
	meshyTaskDetail: (taskId: string) => Promise<MeshyTaskDetailResponse>
	meshyStop: (taskId: string, mode: string) => Promise<MeshyTaskActionResponse>
	meshyDelete: (taskId: string, mode: string) => Promise<MeshyTaskActionResponse>
	meshyBalance: () => Promise<MeshyBalanceResponse>
}

export function isMeshySettingsRecord(value: unknown): value is Record<string, unknown> {
	return isRecord(value)
}

export type MeshyNodeSettingsLike = WorkflowMeshyNodeSettings | Record<string, unknown> | null | undefined

function toRecord(settings: MeshyNodeSettingsLike): Record<string, unknown> {
	return isRecord(settings) ? settings : {}
}

export function getMeshySettingString(settings: MeshyNodeSettingsLike, key: string): string {
	const record = toRecord(settings)
	const val = record[key]
	return isString(val) ? val.trim() : ''
}

export function getMeshySettingNumber(settings: MeshyNodeSettingsLike, key: string, fallback = 0): number {
	const record = toRecord(settings)
	const val = record[key]
	return isNumber(val) ? val : fallback
}

export function getMeshySettingBoolean(settings: MeshyNodeSettingsLike, key: string, fallback = false): boolean {
	const record = toRecord(settings)
	const val = record[key]
	return isBoolean(val) ? val : fallback
}

export function getMeshySettingArray<T>(
	settings: MeshyNodeSettingsLike,
	key: string,
	itemGuard?: (v: unknown) => v is T
): T[] {
	const record = toRecord(settings)
	const val = record[key]
	if (!isArray(val)) return []
	if (itemGuard) return val.filter(itemGuard)
	return val as T[]
}

export function getMeshySettingRecord(settings: MeshyNodeSettingsLike, key: string): Record<string, unknown> {
	const record = toRecord(settings)
	const val = record[key]
	return isRecord(val) ? val : {}
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

export type MeshyStoreLike = {
	state: WorkflowState & {
		resources?: WorkflowResourceLike[]
	}
	commit: (mutation: string, payload?: unknown) => void
}

export type MeshyEffectiveOutput = {
	preferredImageUrl: string
	preferredModelUrl: string
	preferredUrl: string
	imageUrls: string[]
	localAssetUrl: string
	localAssetPath: string
	thumbnailUrl: string
	effectiveTaskId: string
	effectiveRelationKind: MeshyRelationKind
	effectiveStatus: MeshyTaskStatus
	effectiveProgress: number
}

export type PersistExternalAssetPayload = {
	kind: 'image' | 'file'
	name: string
	sourceUrl?: string
	sourcePath?: string
}

export type PersistExternalAssetResult = {
	url: string
	absolutePath: string
	projectRelativePath?: string
} | null

export type ConnectedMeshyImageInput = {
	edge: WorkflowEdge
	fromNode: WorkflowNode
	fromAnchorId: string
	url: string
}

export type ConnectedMeshyModelInput = {
	inputTaskId?: string
	modelUrl: string
	sourceName?: string
} | null

export type BuildMeshyRequestPayloadFn = (node: WorkflowNode) => Promise<BuildMeshyRequestResult>
