import { getBackendBaseUrl } from './backendConfig'
import { isAgentToUiMessage } from '../core/agentToUI'
import type { AgentToUiMessage } from '../core/agentToUI'
import { logBlueprintRequest } from './blueprintRequestLog'
import { getErrorMessage, isRecord, isString, isArray } from '../types/utils'
import type {
	ComfyObjectInfo,
	ComfySystemStats
} from '../aiworkflow/domain/comfyui/objectInfoTypes'

type ServiceOptions = {
	baseUrl?: string | (() => string)
	devToken?: string
	localExecBasePath?: string
}

const normalizeLocalExecBasePath = (raw: unknown) => {
	const text = String(raw ?? '').trim()
	if (!text) return '/api/workflow/codex'
	if (text === 'codex') return '/api/workflow/codex'
	if (text === 'copilot') return '/api/workflow/copilot'
	const withLeadingSlash = text.startsWith('/') ? text : `/${text}`
	return withLeadingSlash.replace(/\/+$/, '') || '/api/workflow/codex'
}

export type ComfyNode = {
	class_type: string
	inputs: Record<string, unknown>
	[key: string]: unknown
}

export type ComfyWorkflow = {
	[key: string]: ComfyNode
}

export type ComfyPromptResponse = {
	prompt_id: string
	[key: string]: unknown
}

export type ComfyOutputMedia = {
	nodeId: string
	kind: 'image' | 'video'
	filename: string
	subfolder?: string
	type?: string
	url: string
}

type PingResponse =
	| {
			ok: true
			baseUrl: string
			comfyui?: {
				version?: string
				os?: string
				deviceName?: string
				devices?: Array<{ name?: string; type?: string }>
			}
			systemInfo?: ComfySystemStats & { nodeCount?: number }
			nodeCount?: number
	  }
	| {
			ok: false
			error: string
			status?: number
			baseUrl?: string
	  }

type ObjectInfoResponse =
	| {
			ok: true
			baseUrl: string
			objectInfo: ComfyObjectInfo
			nodeCount?: number
			cached?: boolean
	  }
	| {
			ok: false
			error: string
			status?: number
			baseUrl?: string
	  }

type WorkflowsListResponse =
	| {
			ok: true
			baseUrl: string
			workflows: { path: string; name: string; source?: 'userdata' | 'history' }[]
			source?: 'userdata' | 'history'
	  }
	| {
			ok: false
			error: string
			status?: number
			baseUrl?: string
			workflows?: { path: string; name: string; source?: 'userdata' | 'history' }[]
	  }

type WorkflowGetResponse =
	| {
			ok: true
			baseUrl: string
			workflowPath: string
			workflow: ComfyWorkflow
	  }
	| {
			ok: false
			error: string
			status?: number
			baseUrl?: string
	  }

type RunResponse =
	| {
			ok: true
			baseUrl: string
			promptId: string
			promptSource?: string
			result: Record<string, unknown>
			snapshot?: Record<string, unknown>
	  }
	| {
			ok: false
			error: string
			status?: number
			baseUrl?: string
			requiresHistorySetup?: boolean
			message?: string
			comfyuiError?: Record<string, unknown>
	  }

type OutputsResponse =
	| {
			ok: true
			baseUrl: string
			promptId: string
			media: ComfyOutputMedia[]
			result: Record<string, unknown>
	  }
	| {
			ok: false
			error: string
			status?: number
			baseUrl?: string
	  }

type CancelResponse =
	| {
			ok: true
			baseUrl: string
			result: Record<string, unknown>
	  }
	| {
			ok: false
			error: string
			status?: number
			baseUrl?: string
	  }

type BlueprintChatResponse =
	| {
			ok: true
			assistant: string
			model?: string
			baseUrl?: string
	  }
	| {
			ok: false
			error: string
			status?: number
			need?: string[]
			baseUrl?: string
	  }

export type BlueprintChatStreamEvent =
	| { type: 'msg'; message: AgentToUiMessage }
	| { type: 'done' }
	| { type: 'error'; error: { message: string; details?: unknown } }

export type CodexSessionDto = {
	id: string
	title: string
	status?: string
	model_name?: string
	provider_thread_id?: string
	cwd?: string
}

export type CodexMessageDto = {
	id: string
	role: string
	content: unknown
	createdAt?: string
	[key: string]: unknown
}

export type CodexListSessionsResponse = { items: CodexSessionDto[] } | { error: string }

export type CodexCreateSessionResponse = CodexSessionDto | { error: string }

export type CodexListMessagesResponse = { items: CodexMessageDto[] } | { error: string }

export type CodexUpdateSessionResponse = CodexSessionDto | { error: string }

export type CodexApprovalResponse = { message?: unknown; error?: string }

export type CodexHealthResponse = {
	ok?: boolean
	status?: string
	[key: string]: unknown
}

export type CodexStreamEvent =
	| { type: 'event'; event: string; data: unknown }
	| { type: 'error'; error: { message: string; details?: unknown } }
	| { type: 'done' }

type NanoBananaGenerateResponse =
	| { ok: true; imageUrl: string; baseUrl?: string }
	| { ok: false; error: string; status?: number; baseUrl?: string }

export type NanoBananaCacheRefsResponse =
	| { ok: true; cacheIds: string[]; baseUrl?: string }
	| { ok: false; error: string; status?: number; baseUrl?: string }

export type NanoBananaGenerateStreamEvent = BlueprintChatStreamEvent
export type SeedanceGenerateStreamEvent = BlueprintChatStreamEvent
export type JimengGenerateStreamEvent = BlueprintChatStreamEvent

export type SeedanceTaskMirrorItem = {
	id: number
	taskId: string
	provider: string
	model: string
	taskType?: string
	source?: string
	status: string
	prompt: string
	ratio?: string
	resolution?: string
	duration?: number
	seed?: number | null
	generateAudio?: boolean
	watermark?: boolean
	cameraFixed?: boolean
	returnLastFrame?: boolean
	enableWebSearch?: boolean
	priority?: number
	serviceTier?: string
	tools?: unknown[]
	usage?: Record<string, unknown>
	refImageUrls?: string[]
	refVideoUrls?: string[]
	refAudioUrls?: string[]
	videoUrlRemote?: string
	videoUrlLocal?: string
	videoSourcePathLocal?: string
	lastFrameUrlRemote?: string
	lastFrameUrlLocal?: string
	lastFrameSourcePathLocal?: string
	downloadStatus?: string
	downloadProgress?: number
	downloadError?: string
	errorMessage?: string
	statusText?: string
	projectId?: number | null
	remoteCreatedAt?: number | null
	remoteUpdatedAt?: number | null
	requestPayload?: Record<string, unknown>
	responsePayload?: Record<string, unknown>
	createdAt: string
	updatedAt: string
	syncedAt: string
}

type SeedanceTasksListResponse =
	| {
			ok: true
			items: SeedanceTaskMirrorItem[]
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type SeedanceTaskDetailResponse =
	| {
			ok: true
			item: SeedanceTaskMirrorItem
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type SeedanceSyncTasksResponse =
	| {
			ok: true
			item?: SeedanceTaskMirrorItem
			items?: SeedanceTaskMirrorItem[]
			total?: number
			remote?: Record<string, unknown>
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

export type SeedanceTaskDetailRemoteResponse =
	| {
			ok: true
			item: SeedanceTaskMirrorItem | null
			remote: Record<string, unknown> | null
			remoteStatus: string
			resourceAvailable: boolean
			resourceUnavailableReason: string
			videoUrlRemote: string
			lastFrameUrlRemote: string
	  }
	| { ok: false; error: string; resourceAvailable?: boolean }

export type SeedanceDownloadAssetResponse =
	| {
			ok: true
			sourcePath: string
			projectRelativePath: string
			url: string
			size: number
			kind: string
			taskId: string
	  }
	| { ok: false; error: string; resourceAvailable?: boolean }

export type SeedanceListAllRemoteResponse =
	| {
			ok: true
			items: SeedanceTaskMirrorItem[]
			total: number
			totalCount: number
			hasMore: boolean
			pageNum: number
			pageSize: number
	  }
	| { ok: false; error: string }

type MeshyGenerateResponse =
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

export type MeshyTaskRelationKind = 'model' | 'texture' | 'rigging' | 'animation' | 'remesh'

export type MeshyTaskCapability = 'model' | 'textured' | 'rigged' | 'animated'

export type MeshyTaskMirrorItem = {
	id: number
	taskId: string
	mode: string
	target: '3d' | 'image'
	family: string
	relationKind?: MeshyTaskRelationKind
	rootTaskId?: string
	parentTaskId?: string
	capabilities?: MeshyTaskCapability[]
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
	errorMessage?: string
	statusText?: string
	lastNodeId?: string
	projectId?: number | null
	remoteCreatedAt?: string
	remoteFinishedAt?: string
	createdAt: string
	updatedAt: string
	children?: MeshyTaskMirrorItem[]
	hasTextureChild?: boolean
	hasRiggingChild?: boolean
	hasAnimationChild?: boolean
	effectiveTaskId?: string
	effectiveRelationKind?: MeshyTaskRelationKind
	effectiveStatus?: string
	effectiveProgress?: number
	effectivePreferredModelUrl?: string
	effectiveLocalAssetUrl?: string
	effectiveLocalAssetPath?: string
	effectiveThumbnailUrl?: string
	selectedTaskId?: string
	requestPayload?: Record<string, unknown>
	responsePayload?: Record<string, unknown>
}

type MeshyTasksListResponse =
	| {
			ok: true
			items: MeshyTaskMirrorItem[]
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type MeshyTaskDetailResponse =
	| {
			ok: true
			item: MeshyTaskMirrorItem
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type MeshyTaskActionResponse =
	| {
			ok: true
			taskId: string
			status?: string
			deleted?: boolean
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

export type MeshyBalanceResponse =
	| {
			ok: true
			available: boolean
			configured: boolean
			displayText: string
			detail?: string
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type Tripo3DGenerateResponse =
	| { ok: true; mode: string; taskId: string; status: string; raw?: unknown }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type Tripo3DTaskResponse =
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
	| { ok: false; error: string; status?: number; baseUrl?: string }

type Tripo3DTaskMirrorItem = {
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
	requestPayload?: Record<string, unknown>
	responsePayload?: Record<string, unknown>
}

type Tripo3DTasksListResponse =
	| {
			ok: true
			items: Tripo3DTaskMirrorItem[]
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type Tripo3DTaskDetailResponse =
	| {
			ok: true
			item: Tripo3DTaskMirrorItem
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type Tripo3DTaskActionResponse =
	| {
			ok: true
			taskId: string
			status?: string
			deleted?: boolean
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type Tripo3DBalanceResponse =
	| {
			ok: true
			available: boolean
			configured: boolean
			displayText: string
			detail?: string
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type Tripo3DUploadFileResponse =
	| {
			ok: true
			fileToken: string
			raw?: Record<string, unknown>
	  }
	| { ok: false; error: string; status?: number; baseUrl?: string }

type JobResponse =
	| {
			ok: true
			baseUrl: string
			fallback?: string
			result: Record<string, unknown>
	  }
	| {
			ok: false
			error: string
			status?: number
			baseUrl?: string
	  }

export type ResolvedInputNode = {
	nodeId: string
	classType: string
	inputKey: string
	originalValue?: string
	displayName?: string
}

export type ResolvedTextNode = {
	nodeId: string
	classType: string
	originalText?: string
	inputKey?: string
	allTextKeys?: string[]
}

export type ComfyInputMappings = {
	imageInputs: ResolvedInputNode[]
	videoInputs: ResolvedInputNode[]
	textNodes: {
		positive: ResolvedTextNode[]
		negative: ResolvedTextNode[]
	}
	seedNodes: Array<{ nodeId: string; classType: string; inputKey: string }>
}

export type ResolvedOutputNode = {
	nodeId: string
	classType: string
	mediaKind: 'image' | 'video' | 'model3d'
	displayName?: string
}

export type ResolveHistoryResponse =
	| {
			ok: true
			baseUrl: string
			hasHistory: true
			promptGraph: Record<string, any>
			promptId: string
			matchType: 'exact' | 'fuzzy' | 'direct'
			timestamp?: number
			nodeCount: number
			imageInputs: ResolvedInputNode[]
			videoInputs: ResolvedInputNode[]
			textNodes: ComfyInputMappings['textNodes']
			seedNodes: ComfyInputMappings['seedNodes']
			outputs?: ResolvedOutputNode[]
			hasImageInput?: boolean
			hasVideoInput?: boolean
			hasTextPrompt: boolean
			hasImageOutput?: boolean
			hasVideoOutput?: boolean
			hasModel3dOutput?: boolean
			source?: string
	  }
	| {
			ok: false
			error: 'NO_HISTORY' | string
			message?: string
			baseUrl?: string
			requiresHistorySetup?: boolean
	  }

const jsonHeaders = (devToken?: string) => {
	const h: Record<string, string> = {
		'Content-Type': 'application/json'
	}
	if (devToken) h['X-DEV-TOKEN'] = devToken
	return h
}

const safeJson = async (
	res: Response
): Promise<{ ok: true; value: unknown } | { ok: false; text: string }> => {
	const text = await res.text()
	try {
		return { ok: true as const, value: JSON.parse(text) as unknown }
	} catch {
		return { ok: false as const, text }
	}
}

const extractErrorMessage = (
	body: { ok: true; value: unknown } | { ok: false; text: string },
	fallback: string
): string => {
	if (body.ok && isRecord(body.value) && isString(body.value.error)) {
		return body.value.error
	}
	return body.ok ? `${fallback}: ${JSON.stringify(body.value)}` : `${fallback}: ${body.text}`
}

const parseSseError = (data: string): { message: string; details: unknown } => {
	try {
		const obj: unknown = JSON.parse(data)
		if (isRecord(obj) && isString(obj.message)) {
			return { message: obj.message, details: obj }
		}
		return { message: 'error', details: obj }
	} catch {
		return { message: data || 'error', details: data }
	}
}

const parseSseAgentMessage = (data: string): AgentToUiMessage | null => {
	try {
		const obj: unknown = JSON.parse(data)
		if (isAgentToUiMessage(obj)) return obj
		return null
	} catch {
		return null
	}
}

const extractBodyError = (
	body: { ok: true; value: unknown } | { ok: false; text: string },
	fallback: string
): string => {
	if (body.ok && isRecord(body.value) && isString(body.value.error)) {
		return body.value.error
	}
	return body.ok ? fallback : `${fallback}: ${body.text}`
}

function isIpcAvailable(): boolean {
	return (
		!!(window as Window).__DWEB_RUNTIME__?.isElectron &&
		!!(window as any).dweb?.meshy &&
		!!(window as any).dweb?.seedance &&
		!!(window as any).dweb?.tripo3d
	)
}

function isThirdPartyIpcAvailable(): boolean {
	return !!(window as Window).__DWEB_RUNTIME__?.isElectron && !!(window as any).dweb?.thirdParty
}

function isComfyRuntimeIpcAvailable(): boolean {
	return (
		!!(window as Window).__DWEB_RUNTIME__?.isElectron && !!(window as any).dweb?.comfyui?.runtime
	)
}

function isCodexIpcAvailable(): boolean {
	return !!(window as Window).__DWEB_RUNTIME__?.isElectron && !!(window as any).dweb?.codex
}

type ComfyInputFile = File | { file: File; mediaType: 'image' | 'video' }

async function filesToDataUrlFiles(
	files: ComfyInputFile[]
): Promise<
	Array<{ name: string; dataUrl: string; mediaType: 'image' | 'video'; mimeType: string }>
> {
	const out: Array<{
		name: string
		dataUrl: string
		mediaType: 'image' | 'video'
		mimeType: string
	}> = []
	for (let i = 0; i < files.length; i++) {
		const entry = files[i]
		if (!entry) continue
		const f = entry instanceof File ? entry : entry.file
		const mediaType = entry instanceof File ? guessMediaTypeName(f.name) : entry.mediaType
		const dataUrl = await fileToDataUrl(f)
		out.push({
			name: f.name || `input_${i}`,
			dataUrl,
			mediaType,
			mimeType: f.type || 'application/octet-stream'
		})
	}
	return out
}

function guessMediaTypeName(filename: string): 'image' | 'video' {
	const n = String(filename || '')
		.trim()
		.toLowerCase()
	if (!n) return 'image'
	if (['.mp4', '.webm', '.mov', '.mkv', '.avi', '.gif'].some((ext) => n.endsWith(ext)))
		return 'video'
	return 'image'
}

async function formDataToObject(form: FormData): Promise<Record<string, unknown>> {
	const obj: Record<string, unknown> = {}
	const boolKeys = new Set([
		'generateAudio',
		'watermark',
		'cameraFixed',
		'returnLastFrame',
		'draft'
	])
	const numKeys = new Set([
		'duration',
		'seed',
		'frames',
		'referenceCount',
		'width',
		'height',
		'quantity'
	])
	const arrayKeys = new Set(['refImages', 'refCacheIds', 'ref_cache_ids', 'ref_images'])
	const refImageUrls: string[] = []
	const formAny = form as unknown as {
		entries: () => IterableIterator<[string, FormDataEntryValue]>
	}
	for (const [key, value] of Array.from(formAny.entries())) {
		if (value instanceof File) {
			const dataUrl = await fileToDataUrl(value)
			refImageUrls.push(dataUrl)
		} else if (typeof value === 'string') {
			if (arrayKeys.has(key)) {
				if (!obj[key]) obj[key] = []
				;(obj[key] as string[]).push(value)
			} else if (boolKeys.has(key)) {
				obj[key] = value === '1' || value === 'true'
			} else if (numKeys.has(key)) {
				const n = Number(value)
				obj[key] = Number.isFinite(n) ? n : value
			} else {
				obj[key] = value
			}
		}
	}
	if (refImageUrls.length > 0) {
		obj.refImages = refImageUrls
		obj.ref_images = refImageUrls
	}
	if (!obj.aspect_ratio && obj.aspectRatio) obj.aspect_ratio = obj.aspectRatio
	if (!obj.aspect_ratio && obj.ratio) obj.aspect_ratio = obj.ratio
	if (!obj.req_key && obj.model) obj.req_key = obj.model
	if (!obj.req_key && obj.imageModel) obj.req_key = obj.imageModel
	if (!obj.req_key && obj.videoModel) obj.req_key = obj.videoModel
	if (!obj.model && obj.imageModel) obj.model = obj.imageModel
	if (!obj.model && obj.videoModel) obj.model = obj.videoModel
	if (!obj.endpoint_id && obj.imageModel) obj.endpoint_id = obj.imageModel
	if (!obj.endpoint_id && obj.videoModel) obj.endpoint_id = obj.videoModel
	if (!obj.negative_prompt && obj.negativePrompt) obj.negative_prompt = obj.negativePrompt
	if (!obj.ai_model && obj.model && typeof obj.model === 'string') {
		const modelLower = obj.model.toLowerCase()
		if (modelLower.includes('gpt-image-2') || modelLower.includes('gptimage2')) {
			obj.ai_model = 'gpt-image-2'
		} else if (modelLower.includes('nano-banana-2') || modelLower.includes('nanobanana2')) {
			obj.ai_model = 'nano-banana-2'
		} else if (modelLower.includes('nano-banana') || modelLower.includes('nanobanana')) {
			obj.ai_model = modelLower.includes('pro') ? 'nano-banana-pro' : 'nano-banana'
		}
	}
	return obj
}

async function fileToDataUrl(file: File): Promise<string> {
	const buffer = await file.arrayBuffer()
	const bytes = new Uint8Array(buffer)
	let binary = ''
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i])
	}
	const b64 = btoa(binary)
	const mime = file.type || 'image/png'
	return `data:${mime};base64,${b64}`
}

async function* consumeThirdPartyIpcStream(
	generator: AsyncIterable<unknown>,
	fallbackLabel: string
): AsyncGenerator<BlueprintChatStreamEvent, void, void> {
	try {
		for await (const chunk of generator) {
			let parsed = chunk
			if (typeof chunk === 'string') {
				try {
					parsed = JSON.parse(chunk)
				} catch {
					parsed = chunk
				}
			}
			if (parsed && typeof parsed === 'object') {
				if ((parsed as any).type === 'done') {
					yield { type: 'done' }
					return
				}
				if ((parsed as any).type === 'error') {
					yield parsed as any
					return
				}
				if ((parsed as any).type === 'msg' && (parsed as any).message) {
					yield { type: 'msg', message: (parsed as any).message }
					continue
				}
				yield parsed as any
			}
		}
		yield { type: 'done' }
	} catch (err: unknown) {
		yield {
			type: 'error',
			error: { message: getErrorMessage(err) || `${fallbackLabel} failed via IPC` }
		}
	}
}

async function* consumeCodexIpcStream(
	generator: AsyncIterable<unknown>,
	fallbackLabel: string
): AsyncGenerator<CodexStreamEvent, void, void> {
	try {
		for await (const chunk of generator) {
			let parsed = chunk
			if (typeof chunk === 'string') {
				try {
					parsed = JSON.parse(chunk)
				} catch {
					parsed = chunk
				}
			}
			if (parsed && typeof parsed === 'object') {
				if ((parsed as any).type === 'error') {
					yield {
						type: 'error',
						error: { message: (parsed as any).error?.message || 'Stream error' }
					}
					return
				}
				if ((parsed as any).event === 'done' || (parsed as any).type === 'done') {
					yield { type: 'done' }
					return
				}
				const eventName = (parsed as any).event || (parsed as any).type
				const data = (parsed as any).data ?? parsed
				if (eventName) {
					yield { type: 'event', event: eventName, data }
				}
			}
		}
		yield { type: 'done' }
	} catch (err: unknown) {
		yield {
			type: 'error',
			error: { message: getErrorMessage(err) || `${fallbackLabel} failed via IPC` }
		}
	}
}

const isVideoFile = (file: File): boolean => {
	const name = file.name.toLowerCase()
	const type = file.type.toLowerCase()
	return (
		type.startsWith('video/') ||
		name.endsWith('.mp4') ||
		name.endsWith('.mov') ||
		name.endsWith('.avi') ||
		name.endsWith('.webm') ||
		name.endsWith('.mkv')
	)
}

const isAudioFile = (file: File): boolean => {
	const name = file.name.toLowerCase()
	const type = file.type.toLowerCase()
	return (
		type.startsWith('audio/') ||
		name.endsWith('.mp3') ||
		name.endsWith('.wav') ||
		name.endsWith('.ogg') ||
		name.endsWith('.flac') ||
		name.endsWith('.m4a')
	)
}

async function formDataToSeedancePayload(form: FormData): Promise<Record<string, unknown>> {
	const obj: Record<string, unknown> = {}
	const refImageUrls: string[] = []
	type VideoFileRef = { __file: true; name: string; type: string; data: ArrayBuffer }
	const refVideoUrls: (string | VideoFileRef)[] = []
	const refAudioUrls: string[] = []
	const boolKeys = new Set([
		'generateAudio',
		'watermark',
		'cameraFixed',
		'returnLastFrame',
		'draft',
		'generate_audio',
		'camera_fixed',
		'return_last_frame',
		'enableWebSearch',
		'enable_web_search'
	])
	const numKeys = new Set([
		'duration',
		'seed',
		'frames',
		'width',
		'height',
		'quantity',
		'referenceCount',
		'priority'
	])
	const imageArrayKeys = new Set([
		'refImages',
		'refCacheIds',
		'ref_cache_ids',
		'ref_images',
		'imageUrls'
	])
	const videoArrayKeys = new Set(['refVideos', 'ref_videos', 'videoUrls'])
	const audioArrayKeys = new Set(['refAudios', 'ref_audios', 'audioUrls'])
	const formAny = form as unknown as {
		entries: () => IterableIterator<[string, FormDataEntryValue]>
	}
	for (const [key, value] of Array.from(formAny.entries())) {
		if (value instanceof File) {
			if (isVideoFile(value)) {
				if (value.size > 200 * 1024 * 1024) {
					throw new Error('Seedance 参考视频不能超过200MB')
				}
				const ab = await value.arrayBuffer()
				refVideoUrls.push({
					__file: true as const,
					name: value.name,
					type: value.type || 'video/mp4',
					data: ab
				})
			} else {
				const dataUrl = await fileToDataUrl(value)
				if (isAudioFile(value)) {
					refAudioUrls.push(dataUrl)
				} else {
					refImageUrls.push(dataUrl)
				}
			}
		} else if (typeof value === 'string') {
			if (imageArrayKeys.has(key)) {
				if (!obj[key]) obj[key] = []
				;(obj[key] as string[]).push(value)
			} else if (videoArrayKeys.has(key)) {
				refVideoUrls.push(value)
			} else if (audioArrayKeys.has(key)) {
				if (!obj[key]) obj[key] = []
				;(obj[key] as string[]).push(value)
			} else if (boolKeys.has(key)) {
				obj[key] = value === '1' || value === 'true'
			} else if (numKeys.has(key)) {
				const n = Number(value)
				obj[key] = Number.isFinite(n) ? n : value
			} else {
				obj[key] = value
			}
		} else {
			obj[key] = value
		}
	}
	if (refImageUrls.length > 0) {
		obj.refImages = refImageUrls
		obj.ref_images = refImageUrls
		obj.imageUrls = refImageUrls
	}
	if (refVideoUrls.length > 0) {
		obj.refVideos = refVideoUrls
		obj.ref_videos = refVideoUrls
		obj.videoUrls = refVideoUrls
	}
	if (refAudioUrls.length > 0) {
		obj.refAudios = refAudioUrls
		obj.ref_audios = refAudioUrls
		obj.audioUrls = refAudioUrls
	}
	if (!obj.model && obj.videoModel) obj.model = obj.videoModel
	if (!obj.endpoint_id && obj.videoModel) obj.endpoint_id = obj.videoModel
	if (!obj.prompt && obj.text) obj.prompt = obj.text
	if (!obj.refMode && obj.mode) obj.refMode = obj.mode
	return obj
}

export class ComfyUIBridgeService {
	private readonly getBaseUrl: () => string
	private readonly devToken?: string
	private readonly localExecBasePath: string

	constructor(opts: ServiceOptions = {}) {
		if (typeof opts.baseUrl === 'function') this.getBaseUrl = opts.baseUrl
		else if (typeof opts.baseUrl === 'string') {
			const fixed = opts.baseUrl
			this.getBaseUrl = () => fixed
		} else {
			this.getBaseUrl = getBackendBaseUrl
		}
		this.devToken = opts.devToken
		this.localExecBasePath = normalizeLocalExecBasePath(opts.localExecBasePath)
	}

	private url(path: string) {
		const base = (this.getBaseUrl?.() ?? '').trim().replace(/\/$/, '')
		if (!base) return path
		if (path.startsWith('/')) return `${base}${path}`
		return `${base}/${path}`
	}

	private localExecUrl(path: string) {
		const normalized = path.startsWith('/') ? path : `/${path}`
		return this.url(`${this.localExecBasePath}${normalized}`)
	}

	private async fetchWithLog(
		input: RequestInfo | URL,
		init?: RequestInit,
		tag = 'comfyui'
	): Promise<Response> {
		const url =
			typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
		const method = String(init?.method || 'GET').toUpperCase()
		const start =
			typeof performance !== 'undefined' && typeof performance.now === 'function'
				? performance.now()
				: Date.now()
		try {
			const res = await fetch(input, init)
			const end =
				typeof performance !== 'undefined' && typeof performance.now === 'function'
					? performance.now()
					: Date.now()
			logBlueprintRequest({
				url,
				method,
				status: res.status,
				durationMs: Math.max(0, Math.round(end - start)),
				tag
			})
			return res
		} catch (err: unknown) {
			const end =
				typeof performance !== 'undefined' && typeof performance.now === 'function'
					? performance.now()
					: Date.now()
			logBlueprintRequest({
				url,
				method,
				durationMs: Math.max(0, Math.round(end - start)),
				errorMessage: getErrorMessage(err),
				tag
			})
			throw err
		}
	}

	async blueprintChat(payload: {
		content: string
		history?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
		provider?: string
		modelId?: string
		refImages?: string[]
		temperature?: number
		maxTokens?: number
		topP?: number
	}): Promise<BlueprintChatResponse> {
		if (isThirdPartyIpcAvailable()) {
			try {
				const ipcPayload = {
					content: payload.content,
					message: payload.content,
					history: payload.history || [],
					provider: payload.provider,
					modelId: payload.modelId,
					refImages: payload.refImages || [],
					temperature: payload.temperature,
					maxTokens: payload.maxTokens,
					topP: payload.topP
				}
				const ipcResult = await (window as any).dweb.thirdParty.blueprint.chat(ipcPayload)
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return { ok: false, error: ipcResult.error || 'blueprint/chat failed via IPC' }
					}
					if (ipcResult.ok && ipcResult.assistant) {
						return { ok: true, assistant: ipcResult.assistant, model: ipcResult.model }
					}
					return ipcResult as BlueprintChatResponse
				}
			} catch (err: unknown) {
				console.warn('[ComfyUIBridge] blueprint/chat IPC failed, falling back to HTTP:', err)
			}
		}
		const res = await this.fetchWithLog(this.url('/api/third-party/blueprint/chat'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify(payload ?? {})
		})
		if (!res.ok) {
			const body = await safeJson(res)
			if (body.ok && isRecord(body.value)) {
				const errorMsg = isString(body.value.error)
					? body.value.error
					: `blueprint/chat failed: ${res.status}`
				return {
					ok: false,
					status: res.status,
					error: errorMsg,
					...body.value
				} as BlueprintChatResponse
			}
			return {
				ok: false,
				status: res.status,
				error: extractErrorMessage(body, `blueprint/chat failed: ${res.status}`)
			}
		}
		return (await res.json()) as BlueprintChatResponse
	}

	/**
	 * Stream blueprint chat via SSE.
	 * Expected events:
	 * - event: msg, data: <AgentToUI envelope JSON>
	 * - event: error, data: {message,...}
	 * - event: done
	 */
	async *blueprintChatStream(
		payload: {
			content: string
			history?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
			provider?: string
			modelId?: string
			refImages?: string[]
			temperature?: number
			maxTokens?: number
			topP?: number
		},
		signal?: AbortSignal
	): AsyncGenerator<BlueprintChatStreamEvent, void, void> {
		if (isThirdPartyIpcAvailable()) {
			try {
				const ipcPayload = {
					content: payload.content,
					message: payload.content,
					history: payload.history || [],
					provider: payload.provider,
					modelId: payload.modelId,
					refImages: payload.refImages || [],
					temperature: payload.temperature,
					maxTokens: payload.maxTokens,
					topP: payload.topP
				}
				const generator = (window as any).dweb.thirdParty.blueprint.chatStream(ipcPayload)
				yield* consumeThirdPartyIpcStream(generator, 'blueprint/chat:stream')
				return
			} catch (err: unknown) {
				console.warn('[ComfyUIBridge] blueprint/chat:stream IPC failed, falling back to HTTP:', err)
			}
		}
		const res = await this.fetchWithLog(this.url('/api/third-party/blueprint/chat:stream'), {
			method: 'POST',
			headers: {
				...jsonHeaders(this.devToken),
				Accept: 'text/event-stream'
			},
			body: JSON.stringify(payload ?? {}),
			signal
		})

		if (!res.ok || !res.body) {
			const body = await safeJson(res)
			throw new Error(
				`blueprint/chat:stream failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			)
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder('utf-8')

		let buffer = ''
		let eventName: string | undefined
		let dataLines: string[] = []

		const flush = (): BlueprintChatStreamEvent[] => {
			if (dataLines.length === 0 && !eventName) return []
			const data = dataLines.join('\n')
			const name = eventName
			eventName = undefined
			dataLines = []

			if (name === 'done') return [{ type: 'done' }]

			if (name === 'error') {
				try {
					const v: unknown = JSON.parse(data)
					let msg = 'SSE error'
					if (isRecord(v) && isString(v.message)) {
						msg = v.message
					}
					return [{ type: 'error', error: { message: msg, details: v } }]
				} catch {
					return [{ type: 'error', error: { message: data || 'SSE error' } }]
				}
			}

			try {
				const v: unknown = JSON.parse(data)
				if (isAgentToUiMessage(v)) return [{ type: 'msg', message: v }]
				return []
			} catch (e: unknown) {
				return [
					{
						type: 'error',
						error: {
							message: 'SSE msg JSON.parse failed',
							details: { raw: data, error: getErrorMessage(e) }
						}
					}
				]
			}
		}

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })

				let idx = buffer.indexOf('\n')
				while (idx >= 0) {
					const line = buffer.slice(0, idx)
					buffer = buffer.slice(idx + 1)
					idx = buffer.indexOf('\n')

					const l = line.replace(/\r$/, '')
					if (!l.trim()) {
						for (const ev of flush()) yield ev
						continue
					}
					if (l.startsWith('event:')) {
						eventName = l.slice('event:'.length).trim()
						continue
					}
					if (l.startsWith('data:')) {
						dataLines.push(l.slice('data:'.length).trimStart())
						continue
					}
				}
			}
		} finally {
			try {
				reader.releaseLock()
			} catch {
				// ignore
			}
		}

		for (const ev of flush()) yield ev
	}

	async codexHealth(): Promise<CodexHealthResponse> {
		if (isCodexIpcAvailable()) {
			try {
				const result = await window.dweb?.codex?.health?.()
				if (result) return result as CodexHealthResponse
			} catch (err) {
				console.warn('[ComfyUIBridgeService] codex.health IPC failed:', err)
			}
		}
		const res = await this.fetchWithLog(this.localExecUrl('/health'), {
			method: 'GET',
			headers: jsonHeaders(this.devToken)
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return { ok: false, error: extractErrorMessage(body, `codex/health failed: ${res.status}`) }
		}
		return (await res.json()) as CodexHealthResponse
	}

	async codexListSessions(projectId: number | null): Promise<CodexListSessionsResponse> {
		if (isCodexIpcAvailable()) {
			try {
				const result = await window.dweb?.codex?.listSessions?.({
					projectId: projectId ?? undefined
				})
				if (result && !('error' in result)) return result as CodexListSessionsResponse
				if (result && 'error' in result) return result as { error: string }
			} catch (err) {
				console.warn('[ComfyUIBridgeService] codex.listSessions IPC failed:', err)
			}
		}
		const pid = Number.isFinite(projectId as number) ? Number(projectId) : NaN
		const query = Number.isFinite(pid) ? `?projectId=${encodeURIComponent(String(pid))}` : ''
		const res = await this.fetchWithLog(this.localExecUrl(`/sessions${query}`), {
			method: 'GET',
			headers: jsonHeaders(this.devToken)
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				error: `codex/sessions failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as CodexListSessionsResponse
	}

	async codexCreateSession(
		payload: { title?: string; cwd?: string; model?: string; projectId?: number | null } = {}
	): Promise<CodexCreateSessionResponse> {
		if (isCodexIpcAvailable()) {
			try {
				const result = await window.dweb?.codex?.createSession?.(payload)
				if (result && !('error' in result)) return result as CodexCreateSessionResponse
				if (result && 'error' in result) return result as { error: string }
			} catch (err) {
				console.warn('[ComfyUIBridgeService] codex.createSession IPC failed:', err)
			}
		}
		const res = await this.fetchWithLog(this.localExecUrl('/sessions'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify(payload ?? {})
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				error: `codex/create-session failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as CodexCreateSessionResponse
	}

	async codexListMessages(
		sessionId: string,
		projectId: number | null
	): Promise<CodexListMessagesResponse> {
		const sid = String(sessionId || '').trim()
		if (!sid) return { error: 'sessionId is required' }
		if (isCodexIpcAvailable()) {
			try {
				const result = await window.dweb?.codex?.listMessages?.({
					sessionId: sid,
					projectId: projectId ?? undefined
				})
				if (result && !('error' in result)) return result as CodexListMessagesResponse
				if (result && 'error' in result) return result as { error: string }
			} catch (err) {
				console.warn('[ComfyUIBridgeService] codex.listMessages IPC failed:', err)
			}
		}
		const pid = Number.isFinite(projectId as number) ? Number(projectId) : NaN
		const query = Number.isFinite(pid) ? `?projectId=${encodeURIComponent(String(pid))}` : ''
		const res = await this.fetchWithLog(
			this.localExecUrl(`/sessions/${encodeURIComponent(sid)}/messages${query}`),
			{
				method: 'GET',
				headers: jsonHeaders(this.devToken)
			}
		)
		if (!res.ok) {
			const body = await safeJson(res)
			return { error: extractErrorMessage(body, `codex/messages failed: ${res.status}`) }
		}
		return (await res.json()) as CodexListMessagesResponse
	}

	async codexUpdateSession(payload: {
		sessionId: string
		projectId: number | null
		title: string
	}): Promise<CodexUpdateSessionResponse> {
		const sid = String(payload.sessionId || '').trim()
		if (!sid) return { error: 'sessionId is required' }
		if (isCodexIpcAvailable()) {
			try {
				const result = await window.dweb?.codex?.updateSession?.({
					sessionId: sid,
					title: payload.title,
					projectId: payload.projectId ?? undefined
				})
				if (result && !('error' in result)) return result as CodexUpdateSessionResponse
				if (result && 'error' in result) return result as { error: string }
			} catch (err) {
				console.warn('[ComfyUIBridgeService] codex.updateSession IPC failed:', err)
			}
		}
		const res = await this.fetchWithLog(this.localExecUrl(`/sessions/${encodeURIComponent(sid)}`), {
			method: 'PATCH',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify({ title: payload.title, projectId: payload.projectId })
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return { error: extractErrorMessage(body, `codex/session patch failed: ${res.status}`) }
		}
		return (await res.json()) as CodexUpdateSessionResponse
	}

	async codexDeleteSession(payload: {
		sessionId: string
		projectId: number | null
	}): Promise<{ ok?: boolean; error?: string }> {
		const sid = String(payload.sessionId || '').trim()
		if (!sid) return { error: 'sessionId is required' }
		if (isCodexIpcAvailable()) {
			try {
				const result = await window.dweb?.codex?.deleteSession?.({
					sessionId: sid,
					projectId: payload.projectId ?? undefined
				})
				if (result) return result as { ok?: boolean; error?: string }
			} catch (err) {
				console.warn('[ComfyUIBridgeService] codex.deleteSession IPC failed:', err)
			}
		}
		const pid = Number.isFinite(payload.projectId as number) ? Number(payload.projectId) : NaN
		const query = Number.isFinite(pid) ? `?projectId=${encodeURIComponent(String(pid))}` : ''
		const res = await this.fetchWithLog(
			this.localExecUrl(`/sessions/${encodeURIComponent(sid)}${query}`),
			{
				method: 'DELETE',
				headers: jsonHeaders(this.devToken)
			}
		)
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				error: `codex/session delete failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return { ok: true }
	}

	async codexSubmitApproval(payload: {
		sessionId: string
		messageId: string
		decision: 'accept' | 'decline'
		projectId?: number | null
	}): Promise<CodexApprovalResponse> {
		const sid = String(payload.sessionId || '').trim()
		if (!sid) return { error: 'sessionId is required' }
		if (isCodexIpcAvailable()) {
			try {
				const result = await window.dweb?.codex?.submitApproval?.({
					sessionId: sid,
					messageId: payload.messageId,
					decision: payload.decision,
					projectId: payload.projectId ?? undefined
				})
				if (result) return result as CodexApprovalResponse
			} catch (err) {
				console.warn('[ComfyUIBridgeService] codex.submitApproval IPC failed:', err)
			}
		}
		const res = await this.fetchWithLog(
			this.localExecUrl(`/sessions/${encodeURIComponent(sid)}/approvals`),
			{
				method: 'POST',
				headers: jsonHeaders(this.devToken),
				body: JSON.stringify({
					message_id: payload.messageId,
					decision: payload.decision,
					projectId: payload.projectId ?? null
				})
			}
		)
		if (!res.ok) {
			const body = await safeJson(res)
			return { error: extractErrorMessage(body, `codex/approvals failed: ${res.status}`) }
		}
		return (await res.json()) as CodexApprovalResponse
	}

	async *codexStreamMessage(
		sessionId: string,
		payload: {
			content: string
			references?: Array<{ path: string; kind?: string; name?: string }>
			projectId?: number | null
			skillHints?: string[]
			executionHints?: string[]
			agentMode?: 'agent' | 'ask' | 'plan'
			permissionProfile?: string
		},
		signal?: AbortSignal,
		useTestStream = false
	): AsyncGenerator<CodexStreamEvent, void, void> {
		const sid = String(sessionId || '').trim()
		if (!sid) {
			yield { type: 'error', error: { message: 'sessionId is required' } }
			return
		}
		if (isCodexIpcAvailable() && !useTestStream) {
			try {
				const ipcPayload = { sessionId: sid, ...payload }
				const generator = window.dweb?.codex?.sendMessageStream?.(ipcPayload)
				if (generator) {
					yield* consumeCodexIpcStream(generator, 'codex/send-message:stream')
					return
				}
			} catch (err: unknown) {
				console.warn(
					'[ComfyUIBridge] codex/send-message:stream IPC failed, falling back to HTTP:',
					err
				)
			}
		}
		const streamPath = useTestStream
			? `/sessions/${encodeURIComponent(sid)}/messages:stream-test`
			: `/sessions/${encodeURIComponent(sid)}/messages:stream`
		const res = await this.fetchWithLog(this.localExecUrl(streamPath), {
			method: 'POST',
			headers: {
				...jsonHeaders(this.devToken),
				Accept: 'text/event-stream'
			},
			body: JSON.stringify(payload ?? {}),
			signal
		})

		if (!res.ok || !res.body) {
			const body = await safeJson(res)
			yield {
				type: 'error',
				error: {
					message: `local-exec/messages:stream failed: ${res.status}`,
					details: body.ok ? body.value : body.text
				}
			}
			return
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder('utf-8')

		let buffer = ''
		let eventName: string | undefined
		let dataLines: string[] = []

		const flush = (): CodexStreamEvent[] => {
			if (dataLines.length === 0 && !eventName) return []
			const dataText = dataLines.join('\n')
			const ev = eventName || 'message'
			eventName = undefined
			dataLines = []
			if (ev === 'done') return [{ type: 'done' }]
			let parsed: unknown = dataText
			try {
				parsed = dataText ? (JSON.parse(dataText) as unknown) : {}
			} catch {
				parsed = { raw: dataText }
			}
			return [{ type: 'event', event: ev, data: parsed }]
		}

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })

				let idx = buffer.indexOf('\n')
				while (idx >= 0) {
					const line = buffer.slice(0, idx)
					buffer = buffer.slice(idx + 1)
					idx = buffer.indexOf('\n')

					const l = line.replace(/\r$/, '')
					if (!l.trim()) {
						for (const ev of flush()) yield ev
						continue
					}
					if (l.startsWith('event:')) {
						eventName = l.slice('event:'.length).trim()
						continue
					}
					if (l.startsWith('data:')) {
						dataLines.push(l.slice('data:'.length).trimStart())
						continue
					}
				}
			}
		} finally {
			try {
				reader.releaseLock()
			} catch {
				// ignore
			}
		}

		for (const ev of flush()) yield ev
		yield { type: 'done' }
	}

	/**
	 * Cache NanoBanana ref images on Django backend before generation.
	 * Backend: POST /api/workflow/nanobanana/ref-cache
	 */
	async nanoBananaCacheRefImages(formData: FormData): Promise<NanoBananaCacheRefsResponse> {
		if (isThirdPartyIpcAvailable()) {
			try {
				const ipcPayload = await formDataToObject(formData)
				const ipcResult = await (window as any).dweb.thirdParty.nanobanana.refCache(ipcPayload)
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return { ok: false, error: ipcResult.error || 'nanobanana/ref-cache failed via IPC' }
					}
					if (Array.isArray(ipcResult.cacheIds)) {
						return { ok: true, cacheIds: ipcResult.cacheIds }
					}
					return ipcResult as NanoBananaCacheRefsResponse
				}
			} catch (err: unknown) {
				console.warn('[ComfyUIBridge] nanobanana/ref-cache IPC failed, falling back to HTTP:', err)
			}
		}
		const headers: Record<string, string> = {
			Accept: 'application/json'
		}
		if (this.devToken) headers['X-DEV-TOKEN'] = this.devToken
		const res = await this.fetchWithLog(this.url('/api/third-party/nanobanana/ref-cache'), {
			method: 'POST',
			headers,
			body: formData
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `nanobanana/ref-cache failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as NanoBananaCacheRefsResponse
	}

	/**
	 * Cache Seedream ref images on Django backend before generation.
	 * Backend: POST /api/workflow/seedream/ref-cache
	 */
	async seedreamCacheRefImages(formData: FormData): Promise<NanoBananaCacheRefsResponse> {
		if (isThirdPartyIpcAvailable()) {
			try {
				const ipcPayload = await formDataToObject(formData)
				const ipcResult = await (window as any).dweb.thirdParty.seedream.refCache(ipcPayload)
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return { ok: false, error: ipcResult.error || 'seedream/ref-cache failed via IPC' }
					}
					if (Array.isArray(ipcResult.cacheIds)) {
						return { ok: true, cacheIds: ipcResult.cacheIds }
					}
					return ipcResult as NanoBananaCacheRefsResponse
				}
			} catch (err: unknown) {
				console.warn('[ComfyUIBridge] seedream/ref-cache IPC failed, falling back to HTTP:', err)
			}
		}
		const headers: Record<string, string> = {
			Accept: 'application/json'
		}
		if (this.devToken) headers['X-DEV-TOKEN'] = this.devToken
		const res = await this.fetchWithLog(this.url('/api/third-party/seedream/ref-cache'), {
			method: 'POST',
			headers,
			body: formData
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `seedream/ref-cache failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as NanoBananaCacheRefsResponse
	}

	/**
	 * NanoBanana image generation (non-stream for now).
	 * Backend: POST /api/workflow/nanobanana/generate
	 */
	async nanoBananaGenerate(payload: {
		prompt: string
		aspectRatio?: string
		imageSize?: string
		width?: number
		height?: number
		negativePrompt?: string
		model?: string
		seed?: number
		reference_image_urls?: string[]
		refCacheIds?: string[]
	}): Promise<NanoBananaGenerateResponse> {
		if (isThirdPartyIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.thirdParty.nanobanana.generate(payload || {})
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return { ok: false, error: ipcResult.error || 'nanobanana/generate failed via IPC' }
					}
					if (ipcResult.ok && ipcResult.imageUrl) {
						return { ok: true, imageUrl: ipcResult.imageUrl }
					}
					return ipcResult as NanoBananaGenerateResponse
				}
			} catch (err: unknown) {
				console.warn('[ComfyUIBridge] nanobanana/generate IPC failed, falling back to HTTP:', err)
			}
		}
		const res = await this.fetchWithLog(this.url('/api/third-party/nanobanana/generate'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify(payload ?? {})
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: `nanobanana/generate failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			}
		}
		return (await res.json()) as NanoBananaGenerateResponse
	}

	/**
	 * NanoBanana image generation (SSE stream).
	 * Backend: POST /api/workflow/nanobanana/generate:stream
	 *
	 * Expected events:
	 * - event: msg, data: <AgentToUI envelope JSON>
	 * - event: error, data: {message,...}
	 * - event: done
	 */
	async *nanoBananaGenerateStream(
		form: FormData,
		signal?: AbortSignal
	): AsyncGenerator<NanoBananaGenerateStreamEvent, void, void> {
		if (isThirdPartyIpcAvailable()) {
			try {
				const ipcPayload = await formDataToObject(form)
				const generator = (window as any).dweb.thirdParty.nanobanana.generateStream(ipcPayload)
				yield* consumeThirdPartyIpcStream(generator, 'nanobanana/generate:stream')
				return
			} catch (err: unknown) {
				console.warn(
					'[ComfyUIBridge] nanobanana/generate:stream IPC failed, falling back to HTTP:',
					err
				)
			}
		}
		const headers: Record<string, string> = {
			Accept: 'text/event-stream'
		}
		if (this.devToken) headers['X-DEV-TOKEN'] = this.devToken

		const res = await this.fetchWithLog(this.url('/api/third-party/nanobanana/generate:stream'), {
			method: 'POST',
			headers,
			body: form,
			signal
		})

		if (!res.ok || !res.body) {
			const body = await safeJson(res)
			throw new Error(
				`nanobanana/generate:stream failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			)
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder('utf-8')

		let buffer = ''
		let eventName: string | undefined
		let dataLines: string[] = []

		const flush = (): NanoBananaGenerateStreamEvent[] => {
			if (dataLines.length === 0 && !eventName) return []
			const data = dataLines.join('\n')
			const name = eventName
			eventName = undefined
			dataLines = []

			if (name === 'done') return [{ type: 'done' }]
			if (name === 'error') {
				const err = parseSseError(data)
				return [{ type: 'error', error: err }]
			}
			const msg = parseSseAgentMessage(data)
			if (msg) return [{ type: 'msg', message: msg }]
			let errDetails: unknown = data
			try {
				errDetails = JSON.parse(data) as unknown
			} catch {
				// keep raw data
			}
			return [
				{ type: 'error', error: { message: 'invalid AgentToUI envelope', details: errDetails } }
			]
		}

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })

				let idx = buffer.indexOf('\n')
				while (idx >= 0) {
					const line = buffer.slice(0, idx)
					buffer = buffer.slice(idx + 1)
					idx = buffer.indexOf('\n')

					const l = line.replace(/\r$/, '')
					if (!l.trim()) {
						for (const ev of flush()) yield ev
						continue
					}
					if (l.startsWith('event:')) {
						eventName = l.slice('event:'.length).trim()
						continue
					}
					if (l.startsWith('data:')) {
						dataLines.push(l.slice('data:'.length).trimStart())
						continue
					}
				}
			}
		} finally {
			try {
				reader.releaseLock()
			} catch {
				// ignore
			}
		}

		for (const ev of flush()) yield ev
	}

	/**
	 * Seedream image generation (SSE stream).
	 * Backend: POST /api/workflow/seedream/generate:stream
	 */
	async *seedreamGenerateStream(
		form: FormData,
		signal?: AbortSignal
	): AsyncGenerator<NanoBananaGenerateStreamEvent, void, void> {
		if (isThirdPartyIpcAvailable()) {
			try {
				const ipcPayload = await formDataToObject(form)
				const generator = (window as any).dweb.thirdParty.seedream.generateStream(ipcPayload)
				yield* consumeThirdPartyIpcStream(generator, 'seedream/generate:stream')
				return
			} catch (err: unknown) {
				console.warn(
					'[ComfyUIBridge] seedream/generate:stream IPC failed, falling back to HTTP:',
					err
				)
			}
		}
		const headers: Record<string, string> = {
			Accept: 'text/event-stream'
		}
		if (this.devToken) headers['X-DEV-TOKEN'] = this.devToken

		const res = await this.fetchWithLog(this.url('/api/third-party/seedream/generate:stream'), {
			method: 'POST',
			headers,
			body: form,
			signal
		})

		if (!res.ok || !res.body) {
			const body = await safeJson(res)
			throw new Error(
				`seedream/generate:stream failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			)
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder('utf-8')

		let buffer = ''
		let eventName: string | undefined
		let dataLines: string[] = []

		const flush = (): NanoBananaGenerateStreamEvent[] => {
			if (dataLines.length === 0 && !eventName) return []
			const data = dataLines.join('\n')
			const name = eventName
			eventName = undefined
			dataLines = []

			if (name === 'done') return [{ type: 'done' }]
			if (name === 'error') {
				const err = parseSseError(data)
				return [{ type: 'error', error: err }]
			}
			const msg = parseSseAgentMessage(data)
			if (msg) return [{ type: 'msg', message: msg }]
			let errDetails: unknown = data
			try {
				errDetails = JSON.parse(data) as unknown
			} catch {
				// keep raw data
			}
			return [
				{ type: 'error', error: { message: 'invalid AgentToUI envelope', details: errDetails } }
			]
		}

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })

				let idx = buffer.indexOf('\n')
				while (idx >= 0) {
					const line = buffer.slice(0, idx)
					buffer = buffer.slice(idx + 1)
					idx = buffer.indexOf('\n')

					const l = line.replace(/\r$/, '')
					if (!l.trim()) {
						for (const ev of flush()) yield ev
						continue
					}
					if (l.startsWith('event:')) {
						eventName = l.slice('event:'.length).trim()
						continue
					}
					if (l.startsWith('data:')) {
						dataLines.push(l.slice('data:'.length).trimStart())
						continue
					}
				}
			}
		} finally {
			try {
				reader.releaseLock()
			} catch {
				// ignore
			}
		}

		for (const ev of flush()) yield ev
	}

	/**
	 * Gemini image generation (SSE stream).
	 * Backend IPC: dweb:third-party:gemini:image:generate:stream
	 */
	async *geminiImageGenerateStream(
		payload: Record<string, unknown>,
		signal?: AbortSignal
	): AsyncGenerator<NanoBananaGenerateStreamEvent, void, void> {
		if (isThirdPartyIpcAvailable()) {
			try {
				const generator = (window as any).dweb.thirdParty.gemini.imageGenerateStream(payload)
				yield* consumeThirdPartyIpcStream(generator, 'gemini/image/generate:stream')
				return
			} catch (err: unknown) {
				console.warn(
					'[ComfyUIBridge] gemini/image/generate:stream IPC failed, falling back to HTTP:',
					err
				)
			}
		}
		const headers: Record<string, string> = {
			Accept: 'text/event-stream',
			'Content-Type': 'application/json'
		}
		if (this.devToken) headers['X-DEV-TOKEN'] = this.devToken

		const res = await this.fetchWithLog(this.url('/api/third-party/gemini/image/generate:stream'), {
			method: 'POST',
			headers,
			body: JSON.stringify(payload),
			signal
		})

		if (!res.ok || !res.body) {
			const body = await safeJson(res)
			throw new Error(
				`gemini/image/generate:stream failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			)
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder('utf-8')

		let buffer = ''
		let eventName: string | undefined
		let dataLines: string[] = []

		const flush = (): NanoBananaGenerateStreamEvent[] => {
			if (dataLines.length === 0 && !eventName) return []
			const data = dataLines.join('\n')
			const name = eventName
			eventName = undefined
			dataLines = []

			if (name === 'done') return [{ type: 'done' }]
			if (name === 'error') {
				const err = parseSseError(data)
				return [{ type: 'error', error: err }]
			}
			const msg = parseSseAgentMessage(data)
			if (msg) return [{ type: 'msg', message: msg }]
			let errDetails: unknown = data
			try {
				errDetails = JSON.parse(data) as unknown
			} catch {
				// keep raw data
			}
			return [
				{ type: 'error', error: { message: 'invalid AgentToUI envelope', details: errDetails } }
			]
		}

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })

				let idx = buffer.indexOf('\n')
				while (idx >= 0) {
					const line = buffer.slice(0, idx)
					buffer = buffer.slice(idx + 1)
					idx = buffer.indexOf('\n')

					const l = line.replace(/\r$/, '')
					if (!l.trim()) {
						for (const ev of flush()) yield ev
						continue
					}
					if (l.startsWith('event:')) {
						eventName = l.slice('event:'.length).trim()
						continue
					}
					if (l.startsWith('data:')) {
						dataLines.push(l.slice('data:'.length).trimStart())
						continue
					}
				}
			}
		} finally {
			try {
				reader.releaseLock()
			} catch {
				// ignore
			}
		}

		for (const ev of flush()) yield ev
	}

	/**
	 * Seedance video generation (SSE stream).
	 * Backend: POST /api/workflow/seedance/generate:stream
	 */
	async *seedanceGenerateStream(
		form: FormData,
		signal?: AbortSignal
	): AsyncGenerator<SeedanceGenerateStreamEvent, void, void> {
		const ipcPayload = await formDataToSeedancePayload(form)

		if (isIpcAvailable()) {
			try {
				const generator = (window as any).dweb.seedance.generateStream(ipcPayload)
				yield* consumeThirdPartyIpcStream(generator, 'seedance/generate:stream')
				return
			} catch (err: unknown) {
				console.warn(
					'[ComfyUIBridge] seedance/generate:stream IPC failed, falling back to HTTP:',
					err
				)
			}
		}

		const headers: Record<string, string> = {
			Accept: 'text/event-stream'
		}
		if (this.devToken) headers['X-DEV-TOKEN'] = this.devToken

		const res = await this.fetchWithLog(this.url('/api/third-party/seedance/generate:stream'), {
			method: 'POST',
			headers,
			body: form,
			signal
		})

		if (!res.ok || !res.body) {
			const body = await safeJson(res)
			throw new Error(
				`seedance/generate:stream failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			)
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder('utf-8')

		let buffer = ''
		let eventName: string | undefined
		let dataLines: string[] = []

		const flush = (): SeedanceGenerateStreamEvent[] => {
			if (dataLines.length === 0 && !eventName) return []
			const data = dataLines.join('\n')
			const name = eventName
			eventName = undefined
			dataLines = []

			if (name === 'done') return [{ type: 'done' }]
			if (name === 'error') {
				try {
					const obj = JSON.parse(data)
					return [
						{ type: 'error', error: { message: String(obj?.message ?? 'error'), details: obj } }
					]
				} catch {
					return [{ type: 'error', error: { message: data || 'error' } }]
				}
			}
			try {
				const obj = JSON.parse(data)
				if (isAgentToUiMessage(obj)) return [{ type: 'msg', message: obj }]
				return [{ type: 'error', error: { message: 'invalid AgentToUI envelope', details: obj } }]
			} catch (e) {
				return [
					{ type: 'error', error: { message: 'invalid json in SSE message', details: String(e) } }
				]
			}
		}

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })

				let idx = buffer.indexOf('\n')
				while (idx >= 0) {
					const line = buffer.slice(0, idx)
					buffer = buffer.slice(idx + 1)
					idx = buffer.indexOf('\n')

					const l = line.replace(/\r$/, '')
					if (!l.trim()) {
						for (const ev of flush()) yield ev
						continue
					}
					if (l.startsWith('event:')) {
						eventName = l.slice('event:'.length).trim()
						continue
					}
					if (l.startsWith('data:')) {
						dataLines.push(l.slice('data:'.length).trimStart())
						continue
					}
				}
			}
		} finally {
			try {
				reader.releaseLock()
			} catch {
				// ignore
			}
		}

		for (const ev of flush()) yield ev
	}

	/**
	 * Jimeng image generation (SSE stream).
	 * Backend: POST /api/workflow/jimeng/image/generate:stream
	 */
	async *jimengImageGenerateStream(
		form: FormData,
		signal?: AbortSignal
	): AsyncGenerator<JimengGenerateStreamEvent, void, void> {
		if (isThirdPartyIpcAvailable()) {
			try {
				const ipcPayload = await formDataToObject(form)
				const generator = (window as any).dweb.thirdParty.jimeng.imageGenerateStream(ipcPayload)
				yield* consumeThirdPartyIpcStream(generator, 'jimeng/image/generate:stream')
				return
			} catch (err: unknown) {
				console.warn(
					'[ComfyUIBridge] jimeng/image/generate:stream IPC failed, falling back to HTTP:',
					err
				)
			}
		}
		const headers: Record<string, string> = {
			Accept: 'text/event-stream'
		}
		if (this.devToken) headers['X-DEV-TOKEN'] = this.devToken

		const res = await this.fetchWithLog(this.url('/api/third-party/jimeng/image/generate:stream'), {
			method: 'POST',
			headers,
			body: form,
			signal
		})

		if (!res.ok || !res.body) {
			const body = await safeJson(res)
			throw new Error(
				`jimeng/image/generate:stream failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			)
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder('utf-8')

		let buffer = ''
		let eventName: string | undefined
		let dataLines: string[] = []

		const flush = (): JimengGenerateStreamEvent[] => {
			if (dataLines.length === 0 && !eventName) return []
			const data = dataLines.join('\n')
			const name = eventName
			eventName = undefined
			dataLines = []

			if (name === 'done') return [{ type: 'done' }]
			if (name === 'error') {
				try {
					const obj = JSON.parse(data)
					return [
						{ type: 'error', error: { message: String(obj?.message ?? 'error'), details: obj } }
					]
				} catch {
					return [{ type: 'error', error: { message: data || 'error' } }]
				}
			}
			try {
				const obj = JSON.parse(data)
				if (isAgentToUiMessage(obj)) return [{ type: 'msg', message: obj }]
				return [{ type: 'error', error: { message: 'invalid AgentToUI envelope', details: obj } }]
			} catch (e) {
				return [
					{ type: 'error', error: { message: 'invalid json in SSE message', details: String(e) } }
				]
			}
		}

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })

				let idx = buffer.indexOf('\n')
				while (idx >= 0) {
					const line = buffer.slice(0, idx)
					buffer = buffer.slice(idx + 1)
					idx = buffer.indexOf('\n')

					const l = line.replace(/\r$/, '')
					if (!l.trim()) {
						for (const ev of flush()) yield ev
						continue
					}
					if (l.startsWith('event:')) {
						eventName = l.slice('event:'.length).trim()
						continue
					}
					if (l.startsWith('data:')) {
						dataLines.push(l.slice('data:'.length).trimStart())
						continue
					}
				}
			}
		} finally {
			try {
				reader.releaseLock()
			} catch {
				// ignore
			}
		}

		for (const ev of flush()) yield ev
	}

	/**
	 * Jimeng video generation (SSE stream).
	 * Backend: POST /api/third-party/jimeng/video/generate:stream
	 */
	async *jimengVideoGenerateStream(
		form: FormData,
		signal?: AbortSignal
	): AsyncGenerator<JimengGenerateStreamEvent, void, void> {
		if (isThirdPartyIpcAvailable()) {
			try {
				const ipcPayload = await formDataToObject(form)
				const generator = (window as any).dweb.thirdParty.jimeng.videoGenerateStream(ipcPayload)
				yield* consumeThirdPartyIpcStream(generator, 'jimeng/video/generate:stream')
				return
			} catch (err: unknown) {
				console.warn(
					'[ComfyUIBridge] jimeng/video/generate:stream IPC failed, falling back to HTTP:',
					err
				)
			}
		}
		const headers: Record<string, string> = {
			Accept: 'text/event-stream'
		}
		if (this.devToken) headers['X-DEV-TOKEN'] = this.devToken

		const res = await this.fetchWithLog(this.url('/api/third-party/jimeng/video/generate:stream'), {
			method: 'POST',
			headers,
			body: form,
			signal
		})

		if (!res.ok || !res.body) {
			const body = await safeJson(res)
			throw new Error(
				`jimeng/video/generate:stream failed: ${res.status} ${body.ok ? JSON.stringify(body.value) : body.text}`
			)
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder('utf-8')

		let buffer = ''
		let eventName: string | undefined
		let dataLines: string[] = []

		const flush = (): JimengGenerateStreamEvent[] => {
			if (dataLines.length === 0 && !eventName) return []
			const data = dataLines.join('\n')
			const name = eventName
			eventName = undefined
			dataLines = []

			if (name === 'done') return [{ type: 'done' }]
			if (name === 'error') {
				try {
					const obj = JSON.parse(data)
					return [
						{ type: 'error', error: { message: String(obj?.message ?? 'error'), details: obj } }
					]
				} catch {
					return [{ type: 'error', error: { message: data || 'error' } }]
				}
			}
			try {
				const obj = JSON.parse(data)
				if (isAgentToUiMessage(obj)) return [{ type: 'msg', message: obj }]
				return [{ type: 'error', error: { message: 'invalid AgentToUI envelope', details: obj } }]
			} catch (e) {
				return [
					{ type: 'error', error: { message: 'invalid json in SSE message', details: String(e) } }
				]
			}
		}

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })

				let idx = buffer.indexOf('\n')
				while (idx >= 0) {
					const line = buffer.slice(0, idx)
					buffer = buffer.slice(idx + 1)
					idx = buffer.indexOf('\n')

					const l = line.replace(/\r$/, '')
					if (!l.trim()) {
						for (const ev of flush()) yield ev
						continue
					}
					if (l.startsWith('event:')) {
						eventName = l.slice('event:'.length).trim()
						continue
					}
					if (l.startsWith('data:')) {
						dataLines.push(l.slice('data:'.length).trimStart())
						continue
					}
				}
			}
		} finally {
			try {
				reader.releaseLock()
			} catch {
				// ignore
			}
		}

		for (const ev of flush()) yield ev
	}

	async ping(comfyBaseUrl: string): Promise<PingResponse> {
		if (isComfyRuntimeIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.comfyui.runtime.ping({ baseUrl: comfyBaseUrl })
				if (ipcResult && typeof ipcResult === 'object') {
					return ipcResult as PingResponse
				}
				return { ok: false, error: 'Invalid IPC response', baseUrl: comfyBaseUrl }
			} catch (err: unknown) {
				console.warn('[ComfyUIBridge] ping IPC failed:', err)
				return {
					ok: false,
					error: getErrorMessage(err) || 'ping failed via IPC',
					baseUrl: comfyBaseUrl
				}
			}
		}
		return { ok: false, error: 'IPC not available', baseUrl: comfyBaseUrl }
	}

	async listWorkflows(comfyBaseUrl: string): Promise<WorkflowsListResponse> {
		if (isComfyRuntimeIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.comfyui.runtime.workflows.list({
					baseUrl: comfyBaseUrl
				})
				if (ipcResult && typeof ipcResult === 'object') {
					return ipcResult as WorkflowsListResponse
				}
				return { ok: false, error: 'Invalid IPC response', baseUrl: comfyBaseUrl, workflows: [] }
			} catch (err: unknown) {
				console.warn('[ComfyUIBridge] workflows/list IPC failed:', err)
				return {
					ok: false,
					error: getErrorMessage(err) || 'workflows/list failed via IPC',
					baseUrl: comfyBaseUrl,
					workflows: []
				}
			}
		}
		return { ok: false, error: 'IPC not available', baseUrl: comfyBaseUrl, workflows: [] }
	}

	async getWorkflow(comfyBaseUrl: string, workflowPath: string): Promise<WorkflowGetResponse> {
		if (isComfyRuntimeIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.comfyui.runtime.workflows.get({
					baseUrl: comfyBaseUrl,
					workflowPath
				})
				if (ipcResult && typeof ipcResult === 'object') {
					return ipcResult as WorkflowGetResponse
				}
				return { ok: false, error: 'Invalid IPC response', baseUrl: comfyBaseUrl }
			} catch (err: unknown) {
				console.warn('[ComfyUIBridge] workflows/get IPC failed:', err)
				return {
					ok: false,
					error: getErrorMessage(err) || 'workflows/get failed via IPC',
					baseUrl: comfyBaseUrl
				}
			}
		}
		return { ok: false, error: 'IPC not available', baseUrl: comfyBaseUrl }
	}

	async getObjectInfo(comfyBaseUrl: string): Promise<ObjectInfoResponse> {
		if (isComfyRuntimeIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.comfyui.runtime.objectInfo({
					baseUrl: comfyBaseUrl
				})
				if (ipcResult && typeof ipcResult === 'object') {
					return ipcResult as ObjectInfoResponse
				}
				return { ok: false, error: 'Invalid IPC response', baseUrl: comfyBaseUrl }
			} catch (err: unknown) {
				console.warn('[ComfyUIBridge] runtime/object_info IPC failed:', err)
				return {
					ok: false,
					error: getErrorMessage(err) || 'object_info failed via IPC',
					baseUrl: comfyBaseUrl
				}
			}
		}
		return { ok: false, error: 'IPC not available', baseUrl: comfyBaseUrl }
	}

	async getHistoryWorkflow(comfyBaseUrl: string, promptId: string): Promise<WorkflowGetResponse> {
		if (isComfyRuntimeIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.comfyui.runtime.workflows.getHistory({
					baseUrl: comfyBaseUrl,
					promptId
				})
				if (ipcResult && typeof ipcResult === 'object') {
					return ipcResult as WorkflowGetResponse
				}
				return { ok: false, error: 'Invalid IPC response', baseUrl: comfyBaseUrl }
			} catch (err: unknown) {
				console.warn('[ComfyUIBridge] workflows/get-history IPC failed:', err)
				return {
					ok: false,
					error: getErrorMessage(err) || 'workflows/get-history failed via IPC',
					baseUrl: comfyBaseUrl
				}
			}
		}
		return { ok: false, error: 'IPC not available', baseUrl: comfyBaseUrl }
	}

	async resolveHistory(
		comfyBaseUrl: string,
		workflowPath: string
	): Promise<ResolveHistoryResponse> {
		if (isComfyRuntimeIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.comfyui.runtime.workflows.resolveHistory({
					baseUrl: comfyBaseUrl,
					workflowPath
				})
				if (ipcResult && typeof ipcResult === 'object') {
					return ipcResult as ResolveHistoryResponse
				}
				return {
					ok: false,
					error: 'Invalid IPC response',
					message: 'Invalid IPC response',
					baseUrl: comfyBaseUrl
				}
			} catch (err: unknown) {
				console.warn('[ComfyUIBridge] workflows/resolve-history IPC failed:', err)
				return {
					ok: false,
					error: getErrorMessage(err) || 'resolve-history failed via IPC',
					message: getErrorMessage(err) || 'resolve-history failed via IPC',
					baseUrl: comfyBaseUrl
				}
			}
		}
		return {
			ok: false,
			error: 'IPC not available',
			message: 'IPC not available',
			baseUrl: comfyBaseUrl
		}
	}

	async run(
		comfyBaseUrl: string,
		workflowPath: string,
		files: ComfyInputFile[] = [],
		overrides?: {
			positivePrompt?: string
			negativePrompt?: string
			historyPromptId?: string
			inputMappings?: ComfyInputMappings
		}
	): Promise<RunResponse> {
		if (isComfyRuntimeIpcAvailable()) {
			try {
				const dataUrlFiles = await filesToDataUrlFiles(files)
				const rawPayload = {
					baseUrl: comfyBaseUrl,
					workflowPath,
					positivePrompt: overrides?.positivePrompt,
					negativePrompt: overrides?.negativePrompt,
					historyPromptId: overrides?.historyPromptId,
					inputMappings: overrides?.inputMappings,
					files: dataUrlFiles
				}
				const ipcPayload = JSON.parse(JSON.stringify(rawPayload))
				const ipcResult = await (window as any).dweb.comfyui.runtime.run(ipcPayload)
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							status: ipcResult.status || 500,
							baseUrl: comfyBaseUrl,
							error: ipcResult.error || 'run failed via IPC',
							requiresHistorySetup: ipcResult.requiresHistorySetup,
							message: ipcResult.message,
							comfyuiError: ipcResult.comfyuiError
						} as RunResponse
					}
					return ipcResult as RunResponse
				}
				return {
					ok: false,
					status: 500,
					error: 'Invalid IPC response',
					baseUrl: comfyBaseUrl
				} as RunResponse
			} catch (err: unknown) {
				console.warn('[ComfyUIBridge] run IPC failed:', err)
				return {
					ok: false,
					status: 500,
					baseUrl: comfyBaseUrl,
					error: getErrorMessage(err) || 'run failed via IPC'
				} as RunResponse
			}
		}
		return {
			ok: false,
			status: 500,
			error: 'IPC not available',
			baseUrl: comfyBaseUrl
		} as RunResponse
	}

	async outputs(comfyBaseUrl: string, promptId: string): Promise<OutputsResponse> {
		if (isComfyRuntimeIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.comfyui.runtime.outputs({
					baseUrl: comfyBaseUrl,
					promptId
				})
				if (ipcResult && typeof ipcResult === 'object') {
					return ipcResult as OutputsResponse
				}
				return { ok: false, error: 'Invalid IPC response', baseUrl: comfyBaseUrl }
			} catch (err: unknown) {
				console.warn('[ComfyUIBridge] outputs IPC failed:', err)
				return {
					ok: false,
					error: getErrorMessage(err) || 'outputs failed via IPC',
					baseUrl: comfyBaseUrl
				}
			}
		}
		return { ok: false, error: 'IPC not available', baseUrl: comfyBaseUrl }
	}

	async meshyGenerate(payload: Record<string, unknown>): Promise<MeshyGenerateResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.meshy.generate(payload)
				if (ipcResult && typeof ipcResult === 'object' && 'ok' in ipcResult) {
					return ipcResult as MeshyGenerateResponse
				}
				return { ok: true, ...ipcResult } as MeshyGenerateResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'meshy/generate failed via IPC'
				}
			}
		}
		const res = await this.fetchWithLog(this.url('/api/third-party/meshy/generate'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify(payload || {})
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `meshy/generate failed: ${res.status}`)
			}
		}
		return (await res.json()) as MeshyGenerateResponse
	}

	async meshyGenerateImage(form: FormData): Promise<MeshyGenerateResponse> {
		const payload: Record<string, unknown> = {}
		const refImageUrls: string[] = []

		const boolKeys = new Set(['generate_multi_view', 'generateMultiView'])
		const intKeys = new Set(['seed', 'output_image_count', 'outputImageCount'])
		const jsonKeys = new Set(['submittedParams'])

		const formAny = form as unknown as {
			entries: () => IterableIterator<[string, FormDataEntryValue]>
		}
		for (const [key, value] of Array.from(formAny.entries())) {
			if (key === 'refImages' && value instanceof File) {
				const fileValue = value
				const buffer = await fileValue.arrayBuffer()
				const bytes = new Uint8Array(buffer)
				let binary = ''
				for (let i = 0; i < bytes.length; i++) {
					binary += String.fromCharCode(bytes[i])
				}
				const b64 = btoa(binary)
				const mime = fileValue.type || 'image/png'
				refImageUrls.push(`data:${mime};base64,${b64}`)
			} else if (typeof value === 'string') {
				let v: unknown = value
				if (boolKeys.has(key)) {
					v = value.toLowerCase() === 'true' || value === '1'
				} else if (intKeys.has(key)) {
					const n = Number(value)
					v = Number.isFinite(n) ? n : value
				} else if (jsonKeys.has(key)) {
					try {
						v = JSON.parse(value)
					} catch {
						v = value
					}
				}
				payload[key] = v
			} else {
				payload[key] = value
			}
		}

		if (refImageUrls.length > 0) {
			payload.reference_image_urls = refImageUrls
		}

		if (!payload.ai_model && payload.model && typeof payload.model === 'string') {
			const modelLower = payload.model.toLowerCase()
			if (modelLower.includes('gpt-image-2') || modelLower.includes('gptimage2')) {
				payload.ai_model = 'gpt-image-2'
			} else if (modelLower.includes('nano-banana-2') || modelLower.includes('nanobanana2')) {
				payload.ai_model = 'nano-banana-2'
			} else if (modelLower.includes('nano-banana') || modelLower.includes('nanobanana')) {
				payload.ai_model = modelLower.includes('pro') ? 'nano-banana-pro' : 'nano-banana'
			}
		}

		console.log('[Meshy Image Generate] payload:', JSON.stringify(payload, null, 2))

		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.meshy.generate(payload)
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'meshy/generate failed via IPC'
						}
					}
					return ipcResult as MeshyGenerateResponse
				}
				return { ok: true, ...ipcResult } as MeshyGenerateResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'meshy/generate failed via IPC'
				}
			}
		}

		const res = await this.fetchWithLog(this.url('/api/third-party/meshy/generate'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify(payload)
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `meshy/generate failed: ${res.status}`)
			}
		}
		return (await res.json()) as MeshyGenerateResponse
	}

	async meshyTask(taskId: string, mode: string): Promise<MeshyTaskResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.meshy.getTask({ taskId, mode })
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'meshy/task failed via IPC'
						}
					}
					return ipcResult as MeshyTaskResponse
				}
				return { ok: true, ...ipcResult } as MeshyTaskResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'meshy/task failed via IPC'
				}
			}
		}
		const res = await this.fetchWithLog(this.url('/api/third-party/meshy/task'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify({ taskId, mode })
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `meshy/task failed: ${res.status}`)
			}
		}
		return (await res.json()) as MeshyTaskResponse
	}

	async meshyTasks(query?: {
		status?: string
		target?: '3d' | 'image' | 'all'
		family?: string
		limit?: number
	}): Promise<MeshyTasksListResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.meshy.listTasks(query || {})
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'meshy/tasks failed via IPC'
						}
					}
					return ipcResult as MeshyTasksListResponse
				}
				return { ok: true, ...ipcResult } as MeshyTasksListResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'meshy/tasks failed via IPC'
				}
			}
		}
		const search = new URLSearchParams()
		if (query?.status) search.set('status', String(query.status).trim())
		if (query?.target && query.target !== 'all') search.set('target', query.target)
		if (query?.family) search.set('family', String(query.family).trim())
		if (Number.isFinite(query?.limit)) search.set('limit', String(query?.limit))
		const suffix = search.size ? `?${search.toString()}` : ''
		const res = await this.fetchWithLog(this.url(`/api/third-party/meshy/tasks${suffix}`), {
			method: 'GET',
			headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `meshy/tasks failed: ${res.status}`)
			}
		}
		return (await res.json()) as MeshyTasksListResponse
	}

	async meshyTaskDetail(taskId: string): Promise<MeshyTaskDetailResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.meshy.taskDetail({ taskId })
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'meshy/task-detail failed via IPC'
						}
					}
					return ipcResult as MeshyTaskDetailResponse
				}
				return { ok: true, ...ipcResult } as MeshyTaskDetailResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'meshy/task-detail failed via IPC'
				}
			}
		}
		const search = new URLSearchParams({ taskId })
		const res = await this.fetchWithLog(
			this.url(`/api/third-party/meshy/task/detail?${search.toString()}`),
			{
				method: 'GET',
				headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined
			}
		)
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `meshy/task-detail failed: ${res.status}`)
			}
		}
		return (await res.json()) as MeshyTaskDetailResponse
	}

	async seedanceTasks(query?: {
		status?: string
		model?: string
		limit?: number
	}): Promise<SeedanceTasksListResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.seedance.list(query || {})
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'seedance/tasks failed via IPC'
						}
					}
					return ipcResult as SeedanceTasksListResponse
				}
				return { ok: true, ...ipcResult } as SeedanceTasksListResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'seedance/tasks failed via IPC'
				}
			}
		}
		const search = new URLSearchParams()
		if (query?.status) search.set('status', String(query.status).trim())
		if (query?.model) search.set('model', String(query.model).trim())
		if (Number.isFinite(query?.limit)) search.set('limit', String(query?.limit))
		const suffix = search.size ? `?${search.toString()}` : ''
		const res = await this.fetchWithLog(this.url(`/api/third-party/seedance/tasks${suffix}`), {
			method: 'GET',
			headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `seedance/tasks failed: ${res.status}`)
			}
		}
		return (await res.json()) as SeedanceTasksListResponse
	}

	async seedanceTaskDetail(taskId: string): Promise<SeedanceTaskDetailResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.seedance.taskDetail({ taskId })
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'seedance/task-detail failed via IPC'
						}
					}
					return ipcResult as SeedanceTaskDetailResponse
				}
				return { ok: true, ...ipcResult } as SeedanceTaskDetailResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'seedance/task-detail failed via IPC'
				}
			}
		}
		const search = new URLSearchParams({ taskId })
		const res = await this.fetchWithLog(
			this.url(`/api/third-party/seedance/task/detail?${search.toString()}`),
			{
				method: 'GET',
				headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined
			}
		)
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `seedance/task-detail failed: ${res.status}`)
			}
		}
		return (await res.json()) as SeedanceTaskDetailResponse
	}

	async seedanceSyncTasks(payload?: {
		taskId?: string
		status?: string
		model?: string
		pageNum?: number
		pageSize?: number
		projectId?: number
		saveMedia?: boolean
	}): Promise<SeedanceSyncTasksResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.seedance.sync(payload || {})
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'seedance/tasks:sync failed via IPC'
						}
					}
					return ipcResult as SeedanceSyncTasksResponse
				}
				return { ok: true, ...ipcResult } as SeedanceSyncTasksResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'seedance/tasks:sync failed via IPC'
				}
			}
		}
		const res = await this.fetchWithLog(this.url('/api/third-party/seedance/sync-tasks'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify(payload || {})
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `seedance/tasks:sync failed: ${res.status}`)
			}
		}
		return (await res.json()) as SeedanceSyncTasksResponse
	}

	async seedanceTaskDetailRemote(payload: {
		taskId: string
		projectId?: number
	}): Promise<SeedanceTaskDetailRemoteResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.seedance.taskDetailRemote(payload || {})
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'seedance/task-detail-remote failed via IPC'
						}
					}
					return ipcResult as SeedanceTaskDetailRemoteResponse
				}
				return { ok: true, ...ipcResult } as SeedanceTaskDetailRemoteResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'seedance/task-detail-remote failed via IPC'
				}
			}
		}
		return { ok: false, error: 'seedance task detail remote only available in Electron mode' }
	}

	async seedanceDownloadAsset(payload: {
		taskId: string
		projectId: number
		kind?: 'video' | 'lastFrame'
		name?: string
	}): Promise<SeedanceDownloadAssetResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.seedance.downloadAsset(payload || {})
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'seedance/download-asset failed via IPC'
						}
					}
					return ipcResult as SeedanceDownloadAssetResponse
				}
				return { ok: true, ...ipcResult } as SeedanceDownloadAssetResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'seedance/download-asset failed via IPC'
				}
			}
		}
		return { ok: false, error: 'seedance download asset only available in Electron mode' }
	}

	async seedanceListAllRemote(payload?: {
		pageNum?: number
		pageSize?: number
		status?: string
		model?: string
	}): Promise<SeedanceListAllRemoteResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.seedance.listAllRemote(payload || {})
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'seedance/list-all-remote failed via IPC'
						}
					}
					return ipcResult as SeedanceListAllRemoteResponse
				}
				return { ok: true, ...ipcResult } as SeedanceListAllRemoteResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'seedance/list-all-remote failed via IPC'
				}
			}
		}
		return { ok: false, error: 'seedance list all remote only available in Electron mode' }
	}

	async meshyStop(taskId: string, mode: string): Promise<MeshyTaskActionResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.meshy.stop({ taskId, mode })
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'meshy/stop failed via IPC'
						}
					}
					return ipcResult as MeshyTaskActionResponse
				}
				return { ok: true, ...ipcResult } as MeshyTaskActionResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'meshy/stop failed via IPC'
				}
			}
		}
		const res = await this.fetchWithLog(this.url('/api/third-party/meshy/stop'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify({ taskId, mode })
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `meshy/stop failed: ${res.status}`)
			}
		}
		return (await res.json()) as MeshyTaskActionResponse
	}

	async meshyDelete(taskId: string, mode: string): Promise<MeshyTaskActionResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.meshy.deleteTask({ taskId, mode })
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'meshy/delete failed via IPC'
						}
					}
					return ipcResult as MeshyTaskActionResponse
				}
				return { ok: true, ...ipcResult } as MeshyTaskActionResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'meshy/delete failed via IPC'
				}
			}
		}
		const res = await this.fetchWithLog(this.url('/api/third-party/meshy/delete'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify({ taskId, mode })
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `meshy/delete failed: ${res.status}`)
			}
		}
		return (await res.json()) as MeshyTaskActionResponse
	}

	async meshyBalance(): Promise<MeshyBalanceResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.meshy.balance()
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'meshy/balance failed via IPC'
						}
					}
					return ipcResult as MeshyBalanceResponse
				}
				return { ok: true, ...ipcResult } as MeshyBalanceResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'meshy/balance failed via IPC'
				}
			}
		}
		const res = await this.fetchWithLog(this.url('/api/third-party/meshy/balance'), {
			method: 'GET',
			headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `meshy/balance failed: ${res.status}`)
			}
		}
		return (await res.json()) as MeshyBalanceResponse
	}

	async tripo3dGenerate(payload: Record<string, unknown>): Promise<Tripo3DGenerateResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.tripo3d.generate(payload)
				if (ipcResult && typeof ipcResult === 'object' && 'ok' in ipcResult) {
					return ipcResult as Tripo3DGenerateResponse
				}
				return { ok: true, ...ipcResult } as Tripo3DGenerateResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'tripo3d/generate failed via IPC'
				}
			}
		}
		const res = await this.fetchWithLog(this.url('/api/third-party/tripo3d/generate'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify(payload || {})
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `tripo3d/generate failed: ${res.status}`)
			}
		}
		return (await res.json()) as Tripo3DGenerateResponse
	}

	async tripo3dGenerateTextToImage(
		payload: Record<string, unknown>
	): Promise<Tripo3DGenerateResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.tripo3d.generateTextToImage(payload)
				if (ipcResult && typeof ipcResult === 'object' && 'ok' in ipcResult) {
					return ipcResult as Tripo3DGenerateResponse
				}
				return { ok: true, ...ipcResult } as Tripo3DGenerateResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'tripo3d/generateTextToImage failed via IPC'
				}
			}
		}
		const res = await this.fetchWithLog(
			this.url('/api/third-party/tripo3d/generate/text-to-image'),
			{
				method: 'POST',
				headers: jsonHeaders(this.devToken),
				body: JSON.stringify(payload || {})
			}
		)
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `tripo3d/text-to-image failed: ${res.status}`)
			}
		}
		return (await res.json()) as Tripo3DGenerateResponse
	}

	async tripo3dGenerateImageToImage(
		payload: Record<string, unknown>
	): Promise<Tripo3DGenerateResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.tripo3d.generateImageToImage(payload)
				if (ipcResult && typeof ipcResult === 'object' && 'ok' in ipcResult) {
					return ipcResult as Tripo3DGenerateResponse
				}
				return { ok: true, ...ipcResult } as Tripo3DGenerateResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'tripo3d/generateImageToImage failed via IPC'
				}
			}
		}
		const res = await this.fetchWithLog(
			this.url('/api/third-party/tripo3d/generate/image-to-image'),
			{
				method: 'POST',
				headers: jsonHeaders(this.devToken),
				body: JSON.stringify(payload || {})
			}
		)
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `tripo3d/image-to-image failed: ${res.status}`)
			}
		}
		return (await res.json()) as Tripo3DGenerateResponse
	}

	async tripo3dGenerateImageToMultiview(
		payload: Record<string, unknown>
	): Promise<Tripo3DGenerateResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.tripo3d.generateImageToMultiview(payload)
				if (ipcResult && typeof ipcResult === 'object' && 'ok' in ipcResult) {
					return ipcResult as Tripo3DGenerateResponse
				}
				return { ok: true, ...ipcResult } as Tripo3DGenerateResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'tripo3d/generateImageToMultiview failed via IPC'
				}
			}
		}
		const res = await this.fetchWithLog(
			this.url('/api/third-party/tripo3d/generate/image-to-multiview'),
			{
				method: 'POST',
				headers: jsonHeaders(this.devToken),
				body: JSON.stringify(payload || {})
			}
		)
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `tripo3d/image-to-multiview failed: ${res.status}`)
			}
		}
		return (await res.json()) as Tripo3DGenerateResponse
	}

	async tripo3dTask(taskId: string): Promise<Tripo3DTaskResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.tripo3d.getTask({ taskId })
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'tripo3d/task failed via IPC'
						}
					}
					return ipcResult as Tripo3DTaskResponse
				}
				return { ok: true, ...ipcResult } as Tripo3DTaskResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'tripo3d/task failed via IPC'
				}
			}
		}
		const res = await this.fetchWithLog(
			this.url(`/api/third-party/tripo3d/task/${encodeURIComponent(taskId)}`),
			{
				method: 'GET',
				headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined
			}
		)
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `tripo3d/task failed: ${res.status}`)
			}
		}
		return (await res.json()) as Tripo3DTaskResponse
	}

	async tripo3dTasks(query?: {
		status?: string
		limit?: number
	}): Promise<Tripo3DTasksListResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.tripo3d.listTasks(query || {})
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'tripo3d/tasks failed via IPC'
						}
					}
					return ipcResult as Tripo3DTasksListResponse
				}
				return { ok: true, ...ipcResult } as Tripo3DTasksListResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'tripo3d/tasks failed via IPC'
				}
			}
		}
		const params = new URLSearchParams()
		if (query?.status) params.set('status', query.status)
		if (query?.limit) params.set('limit', String(query.limit))
		const qs = params.toString()
		const res = await this.fetchWithLog(
			this.url(`/api/third-party/tripo3d/tasks${qs ? `?${qs}` : ''}`),
			{
				method: 'GET',
				headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined
			}
		)
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `tripo3d/tasks failed: ${res.status}`)
			}
		}
		return (await res.json()) as Tripo3DTasksListResponse
	}

	async tripo3dTaskDetail(taskId: string): Promise<Tripo3DTaskDetailResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.tripo3d.taskDetail({ taskId })
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'tripo3d/task-detail failed via IPC'
						}
					}
					return ipcResult as Tripo3DTaskDetailResponse
				}
				return { ok: true, ...ipcResult } as Tripo3DTaskDetailResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'tripo3d/task-detail failed via IPC'
				}
			}
		}
		const res = await this.fetchWithLog(
			this.url(`/api/third-party/tripo3d/task/${encodeURIComponent(taskId)}/detail`),
			{
				method: 'GET',
				headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined
			}
		)
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `tripo3d/task-detail failed: ${res.status}`)
			}
		}
		return (await res.json()) as Tripo3DTaskDetailResponse
	}

	async tripo3dStop(taskId: string): Promise<Tripo3DTaskActionResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.tripo3d.stop({ taskId })
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'tripo3d/stop failed via IPC'
						}
					}
					return ipcResult as Tripo3DTaskActionResponse
				}
				return { ok: true, ...ipcResult } as Tripo3DTaskActionResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'tripo3d/stop failed via IPC'
				}
			}
		}
		const res = await this.fetchWithLog(
			this.url(`/api/third-party/tripo3d/task/${encodeURIComponent(taskId)}/stop`),
			{
				method: 'POST',
				headers: jsonHeaders(this.devToken)
			}
		)
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `tripo3d/stop failed: ${res.status}`)
			}
		}
		return (await res.json()) as Tripo3DTaskActionResponse
	}

	async tripo3dDelete(taskId: string): Promise<Tripo3DTaskActionResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.tripo3d.deleteTask({ taskId })
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'tripo3d/delete failed via IPC'
						}
					}
					return ipcResult as Tripo3DTaskActionResponse
				}
				return { ok: true, ...ipcResult } as Tripo3DTaskActionResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'tripo3d/delete failed via IPC'
				}
			}
		}
		const res = await this.fetchWithLog(
			this.url(`/api/third-party/tripo3d/task/${encodeURIComponent(taskId)}`),
			{
				method: 'DELETE',
				headers: jsonHeaders(this.devToken)
			}
		)
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `tripo3d/delete failed: ${res.status}`)
			}
		}
		return (await res.json()) as Tripo3DTaskActionResponse
	}

	async tripo3dBalance(): Promise<Tripo3DBalanceResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.tripo3d.balance()
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'tripo3d/balance failed via IPC'
						}
					}
					return ipcResult as Tripo3DBalanceResponse
				}
				return { ok: true, ...ipcResult } as Tripo3DBalanceResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'tripo3d/balance failed via IPC'
				}
			}
		}
		const res = await this.fetchWithLog(this.url('/api/third-party/tripo3d/balance'), {
			method: 'GET',
			headers: this.devToken ? { 'X-DEV-TOKEN': this.devToken } : undefined
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `tripo3d/balance failed: ${res.status}`)
			}
		}
		return (await res.json()) as Tripo3DBalanceResponse
	}

	async tripo3dUploadFile(payload: {
		fileData: string
		fileName?: string
		fileType?: string
	}): Promise<Tripo3DUploadFileResponse> {
		if (isIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.tripo3d.uploadFile(payload)
				if (ipcResult && typeof ipcResult === 'object') {
					if (ipcResult.ok === false) {
						return {
							ok: false,
							error: ipcResult.error || 'tripo3d/upload-file failed via IPC'
						}
					}
					return ipcResult as Tripo3DUploadFileResponse
				}
				return { ok: true, ...ipcResult } as Tripo3DUploadFileResponse
			} catch (err: unknown) {
				return {
					ok: false,
					error: getErrorMessage(err) || 'tripo3d/upload-file failed via IPC'
				}
			}
		}
		const res = await this.fetchWithLog(this.url('/api/third-party/tripo3d/upload-file'), {
			method: 'POST',
			headers: jsonHeaders(this.devToken),
			body: JSON.stringify(payload || {})
		})
		if (!res.ok) {
			const body = await safeJson(res)
			return {
				ok: false,
				status: res.status,
				error: extractBodyError(body, `tripo3d/upload-file failed: ${res.status}`)
			}
		}
		return (await res.json()) as Tripo3DUploadFileResponse
	}

	async cancel(comfyBaseUrl: string, promptId: string): Promise<CancelResponse> {
		if (isComfyRuntimeIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.comfyui.runtime.cancel({
					baseUrl: comfyBaseUrl,
					promptId
				})
				if (ipcResult && typeof ipcResult === 'object') {
					return ipcResult as CancelResponse
				}
				return { ok: false, error: 'Invalid IPC response', baseUrl: comfyBaseUrl }
			} catch (err: unknown) {
				console.warn('[ComfyUIBridge] cancel IPC failed:', err)
				return {
					ok: false,
					error: getErrorMessage(err) || 'cancel failed via IPC',
					baseUrl: comfyBaseUrl
				}
			}
		}
		return { ok: false, error: 'IPC not available', baseUrl: comfyBaseUrl }
	}

	async job(comfyBaseUrl: string, id: string): Promise<JobResponse> {
		if (isComfyRuntimeIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.comfyui.runtime.job({
					baseUrl: comfyBaseUrl,
					id
				})
				if (ipcResult && typeof ipcResult === 'object') {
					return ipcResult as JobResponse
				}
				return { ok: false, error: 'Invalid IPC response', baseUrl: comfyBaseUrl }
			} catch (err: unknown) {
				console.warn('[ComfyUIBridge] job IPC failed:', err)
				return {
					ok: false,
					error: getErrorMessage(err) || 'job failed via IPC',
					baseUrl: comfyBaseUrl
				}
			}
		}
		return { ok: false, error: 'IPC not available', baseUrl: comfyBaseUrl }
	}

	async clearHistoryCache(
		comfyBaseUrl: string,
		workflowPath: string
	): Promise<{ ok: boolean; error?: string }> {
		if (isComfyRuntimeIpcAvailable()) {
			try {
				const ipcResult = await (window as any).dweb.comfyui.runtime.clearCache({
					baseUrl: comfyBaseUrl,
					workflowPath
				})
				if (ipcResult && typeof ipcResult === 'object') {
					return ipcResult as { ok: boolean; error?: string }
				}
				return { ok: false, error: 'Invalid IPC response' }
			} catch (err: unknown) {
				console.warn('[ComfyUIBridge] clearCache IPC failed:', err)
				return { ok: false, error: getErrorMessage(err) || 'clearCache failed via IPC' }
			}
		}
		return { ok: false, error: 'IPC not available' }
	}
}
