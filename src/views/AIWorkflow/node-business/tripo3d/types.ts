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
	| 'text_to_image'
	| 'image_to_image'
	| 'image_to_multiview'
	| 'mesh_segment'
	| 'mesh_smartsegment'
	| 'mesh_complete'
	| 'mesh_decimate'
	| 'models_convert'

export type Tripo3DTaskKind = 'model' | 'image'

export function isTripo3DImageMode(mode: string | undefined | null): boolean {
	const m = String(mode || '').trim()
	return m === 'text_to_image' || m === 'image_to_image' || m === 'image_to_multiview'
}

export function getTripo3DTaskKind(mode: string | undefined | null): Tripo3DTaskKind {
	return isTripo3DImageMode(mode) ? 'image' : 'model'
}

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
			imageUrls?: string[]
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
	imageUrls?: string[]
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
	texture_prompt?:
		| string
		| {
				text?: string
				image?: { file_token: string }
				images?: Record<string, { file_token: string }>
		  }
	seg_type?: 'image' | 'model'
	granularity?: 'coarse' | 'medium' | 'fine'
	hint?: string
	transform?: number[]
	part_names?: string[]
	format?: 'GLTF' | 'FBX' | 'USDZ' | 'OBJ' | 'STL' | '3MF'
	bake?: boolean
	flatten_bottom?: boolean
	flatten_bottom_threshold?: number
	texture_size?: number
	texture_format?: string
	pack_uv?: boolean
	export_vertex_colors?: boolean
	pivot_to_center_bottom?: boolean
	scale_factor?: number
	with_animation?: boolean
	animate_in_place?: boolean
	export_orientation?: '+x' | '-x' | '-y' | '+y'
	fbx_preset?: 'blender' | '3dsmax' | 'mixamo'
	force_symmetry?: boolean
	size?: string
	aspect_ratio?: string
	output_format?: 'png' | 'jpeg'
	watermark?: boolean
	template?: string
	num_outputs?: number
	seed?: number
	strength?: number
	projectId?: number | string
	nodeId?: string
	submittedParams?: Record<string, unknown>
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
	tripo3dGenerateTextToImage: (payload: Record<string, unknown>) => Promise<Tripo3DGenerateResponse>
	tripo3dGenerateImageToImage: (
		payload: Record<string, unknown>
	) => Promise<Tripo3DGenerateResponse>
	tripo3dGenerateImageToMultiview: (
		payload: Record<string, unknown>
	) => Promise<Tripo3DGenerateResponse>
	tripo3dTask: (taskId: string) => Promise<Tripo3DTaskResponse>
	tripo3dTasks: (query?: { status?: string; limit?: number }) => Promise<Tripo3DTasksListResponse>
	tripo3dTaskDetail: (taskId: string) => Promise<Tripo3DTaskDetailResponse>
	tripo3dStop: (taskId: string) => Promise<Tripo3DTaskActionResponse>
	tripo3dDelete: (taskId: string) => Promise<Tripo3DTaskActionResponse>
	tripo3dBalance: () => Promise<Tripo3DBalanceResponse>
}

export type Tripo3DEffectiveOutput = {
	thumbnailUrl: string
	modelUrl: string
	imageUrls: string[]
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
	modelUrl?: string
	imageUrls?: string[]
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

export type CreateImageNodeAtCenterFn = (
	url: string,
	name?: string,
	opts?: {
		taskId?: string
		mode?: string
		imageGenerationSource?: string
		imageUrls?: string[]
	}
) => string | null

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

export type BuildTripo3DRequestPayloadFn = (
	node: WorkflowNode,
	meta?: { nodeId?: string; projectId?: number | string }
) => Promise<BuildTripo3DRequestResult>

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
	taskType: Tripo3DTaskKind
	typeLabel: string
	status: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
	statusLabel: string
	progress: number
	promptPreview: string
	metaText: string
	footnote: string
	thumbnailUrl?: string
	modelUrl?: string
	imageUrls?: string[]
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
	taskType: Tripo3DTaskKind
	typeLabel: string
	statusLabel: string
	progress: number
	prompt?: string
	negativePrompt?: string
	statusText?: string
	errorMessage?: string
	modelUrl?: string
	imageUrls?: string[]
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
	imageUrls: string[]
	statusText: string
	errorMessage: string
} {
	const record: Record<string, unknown> = isRecord(raw) ? raw : {}
	const inputObj = isRecord(record.input) ? record.input : {}
	const outputObj = isRecord(record.output) ? record.output : {}

	const getStr = (...keys: string[]): string => {
		for (const key of keys) {
			const val = record[key] ?? inputObj[key] ?? outputObj[key]
			if (isString(val) && val.trim()) return val.trim()
		}
		return ''
	}

	const getNum = (key: string, defaultValue = 0): number => {
		const val = Number(record[key] ?? defaultValue)
		return Number.isFinite(val) ? val : defaultValue
	}

	let thumbnailUrl = getStr(
		'thumbnailUrl',
		'thumbnail_url',
		'thumbnail',
		'rendered_image_url',
		'preview_url'
	)
	if (!thumbnailUrl && isRecord(outputObj.thumbnail)) {
		thumbnailUrl = String(outputObj.thumbnail.url ?? '').trim()
	}

	let modelUrl = ''
	if (isRecord(outputObj.model)) {
		modelUrl = String(outputObj.model.url ?? outputObj.model.glb ?? '').trim()
	}
	if (!modelUrl) {
		modelUrl = getStr('modelUrl', 'model_url', 'pbr_model_url')
	}
	if (!modelUrl && isArray(outputObj.model_urls) && outputObj.model_urls.length > 0) {
		const firstUrl = outputObj.model_urls[0]
		if (isString(firstUrl)) modelUrl = firstUrl.trim()
	}

	const isImageUrl = (s: unknown): boolean => {
		if (!isString(s)) return false
		const str = s.trim().toLowerCase()
		if (!str) return false
		if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:image/')) {
			if (/\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(str)) return true
			if (str.includes('/generation/') || str.includes('/image/') || str.includes('tripo'))
				return true
		}
		return false
	}

	const imageUrls: string[] = []
	const collectImageUrl = (val: unknown) => {
		if (!val) return
		if (isString(val)) {
			if (isImageUrl(val)) imageUrls.push(val.trim())
		} else if (isRecord(val)) {
			const u = String(val.url ?? val.image_url ?? val.src ?? val.image ?? val.uri ?? '').trim()
			if (u && isImageUrl(u)) imageUrls.push(u)
		}
	}

	const collectFromObject = (target: unknown, depth = 0) => {
		if (!target || typeof target !== 'object' || depth > 5) return
		if (isArray(target)) {
			for (const item of target) collectFromObject(item, depth + 1)
			return
		}
		const obj = target as Record<string, unknown>
		for (const [key, value] of Object.entries(obj)) {
			const keyLower = key.toLowerCase()
			if (
				[
					'images',
					'image_urls',
					'results',
					'image',
					'image_url',
					'output_images',
					'generated_images',
					'result'
				].includes(keyLower)
			) {
				if (isArray(value)) {
					for (const item of value) collectImageUrl(item)
				} else {
					collectImageUrl(value)
				}
			}
			if (isString(value) && isImageUrl(value)) {
				imageUrls.push(value.trim())
			} else if (typeof value === 'object' && value !== null) {
				collectFromObject(value, depth + 1)
			}
		}
	}

	collectFromObject(outputObj)

	const mode = getStr('mode', 'type')
	const isImageMode =
		mode === 'text_to_image' || mode === 'image_to_image' || mode === 'image_to_multiview'
	if (isImageMode) {
		collectFromObject(record)
	}

	return {
		taskId: getStr('taskId', 'task_id', 'id'),
		mode,
		status: getStr('status'),
		progress: getNum('progress'),
		thumbnailUrl,
		modelUrl,
		imageUrls: [...new Set(imageUrls)],
		statusText: getStr('statusText', 'status_text'),
		errorMessage: getStr('errorMessage', 'error_message', 'error')
	}
}

export function normalizeTripo3DTaskStatus(status: unknown): Tripo3DTaskStatus {
	const raw = String(status ?? '')
		.trim()
		.toLowerCase()
	if (raw === 'success' || raw === 'succeeded' || raw === 'completed') return 'succeeded'
	if (raw === 'queued') return 'queued'
	if (raw === 'pending') return 'pending'
	if (raw === 'running' || raw === 'in_progress' || raw === 'processing') return 'running'
	if (raw === 'failed' || raw === 'error') return 'failed'
	if (raw === 'cancelled' || raw === 'canceled') return 'cancelled'
	return 'idle'
}
