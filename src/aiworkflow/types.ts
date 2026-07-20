import type { WorkflowResource } from './resource/types'

export type { WorkflowResource }

export type WorkflowViewport = {
	zoom: number
	panX: number
	panY: number
}

export type WorkflowAnchorSpec = {
	id: string
	label?: string
	offsetY?: number
	mediaType?: 'generic' | 'image' | 'video' | 'text' | 'flow' | 'model3d' | 'audio' | 'meta'
	legacyKind?: 'generic' | 'resource' | 'flow'
	acceptedMediaTypes?: Array<'image' | 'video' | 'text' | 'model3d' | 'audio'>
	multiInput?: boolean
}

export type WorkflowStoryBranch = {
	id: string
	text: string
}

export type WorkflowStoryNodeSettings = {
	/** preview resolution of the story "player" in pixels */
	previewWidth?: number
	previewHeight?: number
}

export type WorkflowImageCrop = {
	/** normalized in [0..1] in source image space (origin: top-left) */
	x: number
	y: number
	width: number
	height: number
}

export type WorkflowPixelRect = {
	x: number
	y: number
	width: number
	height: number
}

export type WorkflowImageNodeSettings = {
	/** desired output resolution in pixels */
	outputWidth?: number
	outputHeight?: number
	/** output format */
	outputFormat?: 'png' | 'jpeg' | 'webp'
	/** source image natural size in pixels (used for aspect-safe crop constraints) */
	naturalWidth?: number
	naturalHeight?: number
	/** whether crop should be applied to node output / downstream preview */
	cropEnabled?: boolean
	/** crop rect in normalized source space */
	crop?: WorkflowImageCrop
	/** image generation source */
	imageGenerationSource?: 'upload' | 'comfyui' | 'meshy' | 'gemini' | 'tripo3d'
	/** last generated image URL */
	lastGeneratedImageUrl?: string
	/** Meshy image generation settings */
	meshyImageSettings?: {
		prompt?: string
		negativePrompt?: string
		seed?: number
		aiModel?: 'nano-banana' | 'nano-banana-2' | 'nano-banana-pro' | 'gpt-image-2'
		generateMultiView?: boolean
		aspectRatio?: string
		outputImageCount?: number
		outputCount?: number
		poseMode?: '' | 'a-pose' | 't-pose'
		taskId?: string
		taskFamily?: 'text-to-image' | 'image-to-image'
		mode?: 'text-to-image' | 'image-to-image'
		taskStatus?: 'idle' | 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled'
		progress?: number
		statusText?: string
		errorMessage?: string
		submittedParams?: Record<string, unknown>
		outputSummary?: {
			preferredUrl?: string
			imageUrls?: string[]
			assetUrl?: string
			assetPath?: string
			thumbnailUrl?: string
		}
	}
	/** Gemini image generation settings */
	geminiImageSettings?: {
		prompt?: string
		negativePrompt?: string
		model?: string
		modelLabel?: string
		aspectRatio?: string
		numImages?: number
		outputCount?: number
		taskId?: string
		taskStatus?: 'idle' | 'submitting' | 'processing' | 'completed' | 'failed' | 'cancelled'
		progress?: number
		statusText?: string
		errorMessage?: string
		imageUrls?: string[]
		thumbnailUrl?: string
		submittedParams?: Record<string, unknown>
	}
	/** Tripo3D image generation settings */
	tripo3dImageSettings?: {
		prompt?: string
		negativePrompt?: string
		taskId?: string
		taskStatus?: WorkflowTripo3DTaskStatus
		progress?: number
		statusText?: string
		errorMessage?: string
		taskFamily?: WorkflowTripo3DMode
		taskMode?: string
		mode?: 'text_to_image' | 'image_to_image' | 'image_to_multiview'
		model?: string
		size?: string
		numOutputs?: number
		seed?: number
		strength?: number
		inputUrl?: string
		submittedParams?: Record<string, unknown>
		outputSummary?: {
			preferredUrl?: string
			imageUrls?: string[]
			assetUrl?: string
			assetPath?: string
			thumbnailUrl?: string
		}
		thumbnailUrl?: string
		outputImageUrl?: string
		outputImages?: string[]
		requestPayload?: Record<string, unknown>
		responsePayload?: Record<string, unknown>
	}
}

export type WorkflowVideoNodeSettings = {
	/** desired screenshot/output resolution in pixels */
	outputWidth?: number
	outputHeight?: number
	/** source video natural size in pixels */
	naturalWidth?: number
	/** current playback time position in seconds */
	currentTime?: number
	naturalHeight?: number
}

export type WorkflowSceneUnderstandModelOption = {
	id: string
	label: string
	supportsVision?: boolean
	supportsStructuredOutput?: boolean
	recommended?: boolean
	vendor?: string
}

export type WorkflowSceneType = 'auto' | 'indoor' | 'outdoor'

export type WorkflowSceneUnderstandingNodeSettings = {
	mode?: 'scene-layout' | 'scene-lighting'
	sceneType?: WorkflowSceneType
	selectedModel?: string
	availableModels?: WorkflowSceneUnderstandModelOption[]
	status?: 'idle' | 'loading-models' | 'running' | 'completed' | 'error' | 'canceled'
	message?: string
	statusText?: string
	progress?: number
	provider?: string
	providerStatusText?: string
	remoteStatusCode?: number
	outputJson?: string
	rawOutput?: string
	resultSummary?: string
	reasoningText?: string
	lastRunAt?: number
	lastInputImageUrl?: string
	lastInputImageUrls?: string[]
	lastInputPrompt?: string
	lastInputLayoutJson?: string
	detectedSceneType?: 'indoor' | 'outdoor' | 'semi-outdoor'
	sceneTypeConfidence?: number
	rewriteUsed?: boolean
	rewriteAttempts?: number
	mock?: boolean
}

export type WorkflowSceneLightConfig = {
	id: string
	name?: string
	type: 'ambient' | 'hemisphere' | 'directional' | 'point' | 'spot' | 'rect-area'
	role?: string
	anchorObjectId?: string
	color?: string
	groundColor?: string
	intensity?: number
	distance?: number
	decay?: number
	angle?: number
	penumbra?: number
	width?: number
	height?: number
	castShadow?: boolean
	position?: { x?: number; y?: number; z?: number }
	target?: { x?: number; y?: number; z?: number }
	direction?: { x?: number; y?: number; z?: number }
	rotation?: { x?: number; y?: number; z?: number }
	reason?: string
}

export type WorkflowSceneLightingPreviewConfig = {
	sceneSummary?: string
	lightingStyle?: string
	atmosphere?: {
		preset?: string
		brightness?: string
		contrast?: string
		warmth?: string
		intensityScale?: number
		notes?: string
	}
	globalSettings?: {
		exposure?: number
		environmentIntensity?: number
		intensityScale?: number
		notes?: string
	}
	ambientLight?: {
		color?: string
		intensity?: number
	}
	hemisphereLight?: {
		skyColor?: string
		groundColor?: string
		intensity?: number
	}
	mainDirectionalLight?: {
		color?: string
		intensity?: number
		position?: { x?: number; y?: number; z?: number }
		target?: { x?: number; y?: number; z?: number }
	}
	lights?: WorkflowSceneLightConfig[]
}

export type WorkflowSceneLayoutLightingControls = {
	masterIntensity?: number
	exposure?: number
	ambient?: number
	hemisphere?: number
	directional?: number
	point?: number
	spot?: number
	rectArea?: number
}

export type WorkflowSceneLayoutMaterialOverride = {
	materialSlotName?: string
	materialAssetPath?: string
	enabled?: boolean
	source?: string
}

export type WorkflowSceneLayoutHolePunchInfo = {
	id: string
	targetItemId: string
	toolItemId: string
	createdAt: number
}

export type WorkflowSceneLayoutItem = {
	id: string
	name?: string
	previewScaleMode?: 'placeholder' | 'model'
	orientationFix?: WorkflowSceneLayoutOrientationFix
	materialOverrides?: WorkflowSceneLayoutMaterialOverride[]
	fillMode?: 'single' | 'fill-x' | 'fill-y' | 'fill-z'
	fillCount?: number
	fillAxisScale?: number
	fillUpdatedAt?: number
	fitMode?: 'normal' | 'oriented' | 'filled' | 'forced'
	fitMessage?: string
	fitUpdatedAt?: number
	holePunches?: WorkflowSceneLayoutHolePunchInfo[]
	description?: string
	category?: string
	subCategory?: string
	material?: string
	surfaceType?: string
	color?: string
	sameTypeGroupId?: string
	sameTypeGroupLabel?: string
	isKeyElement?: boolean
	keyElementType?: string
	fixedInRoom?: boolean
	semanticRole?: string
	mountType?: string
	shouldTouchGround?: boolean
	groundReason?: string
	relationTags?: string[]
	layoutPriority?: number
	parentId?: string
	placement?: string
	supportSurface?: string
	anchor?: string
	wallRole?: string
	proximityGroupId?: string
	relationReason?: string
	inferred?: boolean
	sourceImageIndex?: number
	observedImageIndices?: number[]
	imageRect?: WorkflowImageCrop
	imageRectPixels?: WorkflowPixelRect
	position: { x: number; y: number; z: number }
	size: { width: number; height: number; depth: number }
	rotation?: { yaw?: number; pitch?: number; roll?: number }
	scale?: { x?: number; y?: number; z?: number }
}

export type WorkflowSceneLayoutOrientationFix = {
	mode?: 'auto' | 'manual'
	yaw?: number
	pitch?: number
	roll?: number
	confidence?: 'low' | 'high'
	updatedAt?: number
}

export type WorkflowSceneLayoutNodeSettings = {
	status?: 'idle' | 'running' | 'completed' | 'error'
	message?: string
	inputJson?: string
	lastRunAt?: number
	previewMode?: boolean
	lightingPreviewEnabled?: boolean
	lightingDebugEnabled?: boolean
	lightingControls?: WorkflowSceneLayoutLightingControls
	hidePlaceholderCubes?: boolean
	selectedLayoutItemId?: string
	selectedPlaceholderOutput?: string
	layoutItems?: WorkflowSceneLayoutItem[]
	manualModelBindings?: WorkflowSceneLayoutManualModelBinding[]
	camera?: {
		position?: { x: number; y: number; z: number }
		target?: { x: number; y: number; z: number }
	}
}

export type WorkflowResolvedVector3 = {
	x: number
	y: number
	z: number
}

export type WorkflowResolvedRotation = {
	yaw: number
	pitch: number
	roll: number
}

export type WorkflowResolvedQuaternion = {
	x: number
	y: number
	z: number
	w: number
}

export type WorkflowResolvedBounds = {
	min: WorkflowResolvedVector3
	max: WorkflowResolvedVector3
	center: WorkflowResolvedVector3
	size: WorkflowResolvedVector3
}

export type WorkflowResolvedTransform = {
	position: WorkflowResolvedVector3
	rotation: WorkflowResolvedRotation
	quaternion?: WorkflowResolvedQuaternion
	scale: WorkflowResolvedVector3
}

export type WorkflowResolvedReferenceAnchor = 'center' | 'base' | 'top' | 'surface' | 'unknown'

export type WorkflowUnrealResolvedSurfaceSemantics = {
	category: 'floor' | 'wall' | 'ceiling' | 'object' | 'unknown'
	placement?: string
	supportSurface?: string
	mountType?: string
	wallRole?: string
	anchor?: string
	semanticRole?: string
}

export type WorkflowUnrealResolvedParentReference = {
	mode: 'root' | 'parent-slot'
	targetObjectId?: string
	targetSlotId?: string
	parentAnchor?: WorkflowResolvedReferenceAnchor
	childAnchor?: WorkflowResolvedReferenceAnchor
	relativeTransform?: WorkflowResolvedTransform | null
}

export type WorkflowUnrealResolvedConstraintDiagnostics = {
	exportMode: 'root-relative' | 'parent-relative'
	notes?: string[]
}

export type WorkflowUnrealResolvedModelBinding = {
	sourceNodeId?: string
	sourceNodeType?: 'model3d' | 'meshy' | 'manual'
	modelUrl?: string
	modelAssetUrl?: string
	modelSourcePath?: string
	modelAssetPath?: string
	modelProjectRelativePath?: string
	modelAssetProjectRelativePath?: string
	modelSourceName?: string
	modelFormat?: WorkflowModelFormat
}

export type WorkflowUnrealResolvedLayoutSlot = {
	slotId: string
	sourceSlotId: string
	parentSlotId?: string
	parentSourceObjectId?: string
	sourceObjectId: string
	sourceObjectName?: string
	displayName: string
	cloneIndex: number
	cloneCount: number
	isClone: boolean
	previewScaleMode?: 'placeholder' | 'model'
	fitMode?: 'normal' | 'oriented' | 'filled' | 'forced'
	fillMode?: 'single' | 'fill-x' | 'fill-y' | 'fill-z'
	fillCount?: number
	fillAxisScale?: number
	materialOverrides?: WorkflowSceneLayoutMaterialOverride[]
	relationTags?: string[]
	notes?: string
	surfaceSemantics?: WorkflowUnrealResolvedSurfaceSemantics
	parentReference?: WorkflowUnrealResolvedParentReference
	constraintDiagnostics?: WorkflowUnrealResolvedConstraintDiagnostics
	modelBinding?: WorkflowUnrealResolvedModelBinding | null
	slotTransform: WorkflowResolvedTransform
	meshTransform: WorkflowResolvedTransform
	previewInstanceTransform: WorkflowResolvedTransform
	previewInstanceWorldTransform: WorkflowResolvedTransform
	worldTransform: WorkflowResolvedTransform
	relativeTransform: WorkflowResolvedTransform
	worldBounds: WorkflowResolvedBounds | null
	placeholderTransform: WorkflowResolvedTransform | null
	placeholderBounds: WorkflowResolvedBounds | null
	manualAdjustmentApplied?: boolean
	manualAdjustment?: {
		orientationMode?: 'auto' | 'manual'
		fitMode?: 'normal' | 'oriented' | 'filled' | 'forced'
		fillMode?: 'single' | 'fill-x' | 'fill-y' | 'fill-z'
	}
}

export type WorkflowUnrealResolvedLayoutExport = {
	generatedAt: number
	sourceItemCount: number
	slotCount: number
	actorOrigin: WorkflowResolvedVector3
	warnings: string[]
	slots: WorkflowUnrealResolvedLayoutSlot[]
}

export type WorkflowUnrealExportSessionInfo = {
	sessionId: string
	displayName?: string
	projectName?: string
	projectPath?: string
	saveDirectory?: string
	assetRootPath?: string
	pluginVersion?: string
	lastSeenAt?: number
	connectedAt?: number
	status?: 'connected' | 'stale'
}

export type WorkflowUnrealExportNodeSettings = {
	connectionStatus?: 'idle' | 'waiting' | 'connected' | 'exporting' | 'error'
	statusText?: string
	message?: string
	targetSessionId?: string
	connectedSession?: WorkflowUnrealExportSessionInfo | null
	lastHeartbeatAt?: number
	lastExportMode?: 'scene-layout' | 'lighting-only'
	lastExportJobId?: string
	lastExportStatus?:
		| 'queued'
		| 'picked'
		| 'downloading'
		| 'importing'
		| 'assembling-actor'
		| 'applying-lighting'
		| 'completed'
		| 'failed'
	lastExportStage?: string
	lastExportProgress?: number
	lastExportMessage?: string
	lastBlueprintAssetPath?: string
	lastModelsAssetPath?: string
	lastActorBaseClass?: string
	lastSpawnedLightCount?: number
	lastLightingTargetActor?: string
	lastLayoutProtocolVersion?: number
	lastSlotCount?: number
	lastAppliedSlotCount?: number
	lastMaterialOverrideCount?: number
	lastExportAt?: number
	autoPoll?: boolean

	editorStatus?: 'unknown' | 'checking' | 'not-running' | 'running'
	editorCheckedAt?: number
	editorProcess?: {
		pid?: number
		projectPath?: string
		projectName?: string
		engineVersion?: string
	} | null
	editorProcesses?: Array<{
		pid: number
		projectPath: string
		projectName: string
	}>

	pluginStatus?:
		| 'unknown'
		| 'checking'
		| 'not-installed'
		| 'installed'
		| 'installing'
		| 'install-error'
		| 'needs-restart'
	pluginCheckedAt?: number
	pluginVersion?: string
	pluginInstallError?: string
	pluginInstallConfig?: {
		targetProjectPath?: string
	}

	assetRootPath?: string
	assetPathValidation?: 'valid' | 'invalid' | 'checking'
	assetPathValidationError?: string
}

export type WorkflowModelFormat = 'glb' | 'gltf' | 'fbx' | 'obj' | 'stl' | 'dae'

export type WorkflowSceneLayoutManualModelBinding = {
	objectId: string
	modelUrl?: string
	modelAssetUrl?: string
	modelSourceName?: string
	modelSourcePath?: string
	modelAssetPath?: string
	modelProjectRelativePath?: string
	modelAssetProjectRelativePath?: string
	modelFormat?: WorkflowModelFormat
}

export type WorkflowSceneLayoutModelBinding = {
	objectId: string
	objectName?: string
	inputAnchorId: string
	connected: boolean
	sourceNodeId?: string
	sourceNodeType?: 'model3d' | 'meshy' | 'manual'
	modelUrl?: string
	modelAssetUrl?: string
	modelSourcePath?: string
	modelAssetPath?: string
	modelProjectRelativePath?: string
	modelAssetProjectRelativePath?: string
	modelSourceName?: string
	modelFormat?: WorkflowModelFormat
}

export type WorkflowSceneDecomposeOutput = {
	id: string
	objectId?: string
	name?: string
	category?: string
	material?: string
	visualDetails?: string
	description?: string
	cropMode?: 'cropped' | 'fallback' | 'cropped-enforced' | 'fallback-enforced'
	sourceImageIndex: number
	observedImageIndices?: number[]
	imageRect?: WorkflowImageCrop
	imageRectPixels?: WorkflowPixelRect
	imageAnchorId: string
	textAnchorId: string
	generatedResourceId?: string
	outputWidth?: number
	outputHeight?: number
}

export type WorkflowSceneDecomposeNodeSettings = {
	status?: 'idle' | 'running' | 'completed' | 'error'
	message?: string
	progress?: number
	currentStep?: string
	totalTasks?: number
	completedTasks?: number
	croppedCount?: number
	fallbackCount?: number
	inputJson?: string
	lastRunAt?: number
	outputs?: WorkflowSceneDecomposeOutput[]
	lastExpandedAt?: number
	lastExpandedCount?: number
}

export type WorkflowComfyUINodeSettings = {
	/** ComfyUI base URL, e.g. http://127.0.0.1:8188 */
	baseUrl?: string
	/** UI status for connection check */
	status?: 'idle' | 'connecting' | 'connected' | 'error'
	/** last error message (if any) */
	message?: string
	/** epoch ms */
	lastCheckedAt?: number
	/** available workflow files under user workflows dir or history */
	workflows?: { path: string; name: string; source?: 'userdata' | 'history' }[]
	/** selected workflow file path, e.g. workflows/xxx.json or history://xxx */
	workflowPath?: string
	/** source of selected workflow */
	workflowSource?: 'userdata' | 'history'
	/** optional override text for positive CLIP prompt nodes */
	positivePrompt?: string
	/** optional override text for negative CLIP prompt nodes */
	negativePrompt?: string
	/** ComfyUI /object_info cached data */
	objectInfo?: import('./domain/comfyui/objectInfoTypes').ComfyObjectInfo
	/** ComfyUI system info from /system_stats */
	systemInfo?: import('./domain/comfyui/objectInfoTypes').ComfySystemStats & {
		nodeCount?: number
	}
	/** available checkpoint models list */
	checkpoints?: string[]

	/** execution status for the loaded workflow */
	runStatus?: 'idle' | 'running' | 'canceling' | 'completed' | 'failed' | 'cancelled'
	/** prompt/job id returned by ComfyUI */
	promptId?: string
	/** 0-100 (may be coarse if polling-only) */
	progress?: number
	/** human-readable status text */
	statusText?: string
	/** extracted output media urls from history */
	outputs?: Array<{
		kind: 'image' | 'video' | 'model3d'
		url: string
		filename?: string
		anchorId?: string
		nodeId?: string
		sourcePath?: string
		subfolder?: string
		type?: string
	}>
	/** epoch ms */
	lastUpdateAt?: number
	/** whether to auto-create and wire downstream nodes on task completion */
	autoWireEnabled?: boolean
	/** parsed input requirements from the workflow (images/videos/models/prompts) */
	inputRequirements?: import('./domain/comfyui/parseWorkflowIO').ComfyInputRequirements
	/** workflow parsing warnings */
	workflowWarnings?: string[]
	/** whether the preview screenshot is stale and needs refresh */
	previewStale?: boolean

	/** history resolution status: whether we have a valid successful run record */
	hasHistory?: boolean
	/** whether history check has been performed for current workflow */
	historyChecked?: boolean
	/** error from history resolution */
	historyError?: string
	/** guide message to show when no history */
	historyGuideMessage?: string
	/** ComfyUI base url for opening UI when no history */
	historyGuideBaseUrl?: string
	/** prompt id of the matched history run */
	historyPromptId?: string
	/** epoch ms of the history run */
	historyTimestamp?: number
	/** match type used: exact/fuzzy/direct */
	historyMatchType?: 'exact' | 'fuzzy' | 'direct'
	/** number of image inputs detected from history */
	imageInputCount?: number
	/** number of video inputs detected from history */
	videoInputCount?: number
	/** whether there are text prompt inputs (CLIPTextEncode) */
	hasTextPromptInput?: boolean
	/** number of nodes in the prompt graph */
	historyNodeCount?: number
	/** exact input node mappings resolved from history, used for precise parameter replacement at runtime */
	historyInputMappings?: {
		imageInputs: Array<{ nodeId: string; classType: string; inputKey: string; originalValue?: string; displayName?: string }>
		videoInputs: Array<{ nodeId: string; classType: string; inputKey: string; originalValue?: string; displayName?: string }>
		textNodes: {
			positive: Array<{ nodeId: string; classType: string; originalText?: string; inputKey?: string; allTextKeys?: string[] }>
			negative: Array<{ nodeId: string; classType: string; originalText?: string; inputKey?: string; allTextKeys?: string[] }>
		}
		seedNodes: Array<{ nodeId: string; classType: string; inputKey: string }>
	}
	// detected output nodes from the workflow
	historyOutputNodes?: Array<{ nodeId: string; classType: string; mediaKind: 'image' | 'video' | 'model3d'; displayName?: string }>
	// which media types the workflow actually outputs (detected from Save/VHS_/Export nodes)
	hasImageOutput?: boolean
	hasVideoOutput?: boolean
	hasModel3dOutput?: boolean
}

export type WorkflowMeshyModelSettings = {
	prompt?: string
	negativePrompt?: string
	seed?: number
	aiModel?: 'latest' | 'meshy-6' | 'meshy-5'
	taskFamily?: 'text-to-3d' | 'image-to-3d' | 'multi-image-to-3d' | 'retexture'
	modelType?: 'standard' | 'lowpoly'
	topology?: 'triangle' | 'quad'
	targetPolycount?: number
	symmetryMode?: 'auto' | 'on' | 'off'
	shouldRemesh?: boolean
	savePreRemeshedModel?: boolean
	shouldTexture?: boolean
	enablePbr?: boolean
	texturePrompt?: string
	textureImageUrl?: string
	poseMode?: '' | 'a-pose' | 't-pose'
	autoSize?: boolean
	originAt?: 'bottom' | 'center'
	moderation?: boolean
	imageEnhancement?: boolean
	removeLighting?: boolean
	targetFormats?: string[]
	imageUrl?: string
	imageUrls?: string[]
	imageCount?: number
	taskId?: string
	taskStatus?: 'idle' | 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled'
	progress?: number
	statusText?: string
	errorMessage?: string
	outputSummary?: {
		preferredUrl?: string
		assetUrl?: string
		assetPath?: string
		thumbnailUrl?: string
		format?: string
	}
	relationKind?: 'model' | 'texture' | 'rigging' | 'animation'
	rootTaskId?: string
	parentTaskId?: string
	previewTaskId?: string
	downloadStage?: 'idle' | 'downloading' | 'done' | 'failed'
	downloadProgress?: number
	downloadLoadedBytes?: number
	downloadTotalBytes?: number
	downloadSpeedBytesPerSec?: number
	downloadError?: string
}

export type WorkflowTripo3DTaskStatus = 'idle' | 'pending' | 'queued' | 'running' | 'success' | 'succeeded' | 'failed' | 'cancelled' | 'canceled'

export type WorkflowTripo3DMode = 'text_to_model' | 'image_to_model' | 'multiview_to_model' | 'texture' | 'refine' | 'text_to_image' | 'image_to_image' | 'image_to_multiview' | 'mesh_segment' | 'mesh_smartsegment' | 'mesh_complete' | 'mesh_decimate' | 'models_convert'

export type WorkflowTripo3DModelSeries = 'h' | 'p'

export type WorkflowTripo3DView = 'front' | 'left' | 'back' | 'right'

export type WorkflowTripo3DSelectedImage = {
	nodeId: string
	view: WorkflowTripo3DView
	order: number
}

export type WorkflowTripo3DTextureQuality = 'standard' | 'detailed' | 'extreme'

export type WorkflowTripo3DGeometryQuality = 'standard' | 'detailed'

export type WorkflowTripo3DTextureAlignment = 'original_image' | 'geometry'

export type WorkflowTripo3DOrientation = 'default' | 'align_image'

export type WorkflowTripo3DRelationKind = 'model' | 'texture' | 'refine' | 'mesh_segment' | 'mesh_smartsegment' | 'mesh_complete' | 'mesh_decimate' | 'models_convert'

export type WorkflowTripo3DInputSummary = {
	promptSource?: 'linked' | 'manual' | 'none'
	promptText?: string
	imageCount?: number
	modelInputConnected?: boolean
	lastValidatedAt?: number
}

export type WorkflowTripo3DOutputSummary = {
	outputKind?: '3d-model'
	preferredUrl?: string
	thumbnailUrl?: string
	format?: string
	assetUrl?: string
	assetPath?: string
}

export type WorkflowTripo3DRelationSummary = {
	relationKind?: WorkflowTripo3DRelationKind
	rootTaskId?: string
	parentTaskId?: string
	effectiveTaskId?: string
	effectiveRelationKind?: WorkflowTripo3DRelationKind
	effectiveStatus?: string
	effectiveProgress?: number
	effectiveModelUrl?: string
	effectiveLocalAssetUrl?: string
	effectiveLocalAssetPath?: string
	effectiveThumbnailUrl?: string
}

export type WorkflowTripo3DModelSettings = {
	tripo3dEnabled?: boolean
	tripo3dTaskFamily?: WorkflowTripo3DMode
	tripo3dTaskId?: string
	tripo3dTaskStatus?: WorkflowTripo3DTaskStatus
	tripo3dProgress?: number
	tripo3dStatusText?: string
	tripo3dErrorMessage?: string
	tripo3dPrompt?: string
	tripo3dNegativePrompt?: string
	tripo3dImageUrl?: string
	tripo3dModelSeries?: WorkflowTripo3DModelSeries
	tripo3dModelVersion?: string
	tripo3dForceSingleImage?: boolean
	tripo3dSelectedImages?: WorkflowTripo3DSelectedImage[]
	tripo3dFaceLimit?: number
	tripo3dTexture?: boolean
	tripo3dPbr?: boolean
	tripo3dEnableImageAutofix?: boolean
	tripo3dTextureAlignment?: WorkflowTripo3DTextureAlignment
	tripo3dOrientation?: WorkflowTripo3DOrientation
	tripo3dTextureQuality?: WorkflowTripo3DTextureQuality
	tripo3dGeometryQuality?: WorkflowTripo3DGeometryQuality
	tripo3dAutoSize?: boolean
	tripo3dQuad?: boolean
	tripo3dSmartLowPoly?: boolean
	tripo3dGenerateParts?: boolean
	tripo3dCompress?: boolean
	tripo3dExportUv?: boolean
	tripo3dModelSeed?: number
	tripo3dTextureSeed?: number
	tripo3dModelTaskId?: string
	tripo3dRootTaskId?: string
	tripo3dParentTaskId?: string
	tripo3dRelationKind?: WorkflowTripo3DRelationKind
	tripo3dRelationSummary?: WorkflowTripo3DRelationSummary
	tripo3dOutputSummary?: WorkflowTripo3DOutputSummary
	tripo3dThumbnailUrl?: string
	tripo3dOutputAssetUrl?: string
	tripo3dOutputAssetPath?: string
	tripo3dInputSummary?: WorkflowTripo3DInputSummary
	tripo3dModelUrl?: string
	tripo3dRequestPayload?: Record<string, unknown>
	tripo3dResponsePayload?: Record<string, unknown>
	tripo3dMode?: WorkflowTripo3DMode
	tripo3dDownloadStage?: 'idle' | 'downloading' | 'done' | 'failed'
	tripo3dDownloadProgress?: number
	tripo3dDownloadLoadedBytes?: number
	tripo3dDownloadTotalBytes?: number
	tripo3dDownloadSpeedBytesPerSec?: number
	tripo3dDownloadError?: string
	tripo3dImageCount?: number
	tripo3dImageUrls?: string[]
	tripo3dUpstreamTaskId?: string
	tripo3dUpstreamTaskFamily?: string
	tripo3dUpstreamTaskStatus?: string
	tripo3dTaskMode?: string
}

export type WorkflowModel3DNodeSettings = {
	modelGenerationSource?: 'upload' | 'comfyui' | 'meshy' | 'tripo3d'
	meshyModelSettings?: WorkflowMeshyModelSettings
	tripo3dModelSettings?: WorkflowTripo3DModelSettings
	modelUrl?: string
	modelFormat?: WorkflowModelFormat
	modelSourceName?: string
	modelSourcePath?: string
	modelProjectRelativePath?: string
	modelAssetUrl?: string
	modelAssetPath?: string
	modelAssetProjectRelativePath?: string
	backgroundColor?: string
	lightIntensity?: number
	gridVisible?: boolean
	axesVisible?: boolean
	autoRotate?: boolean
	renderWidth?: number
	renderHeight?: number
	lastInputSignature?: string
	lastInputNodeId?: string
	lastInputSourceUrl?: string
	lastInputSourcePath?: string
	lastInputSourceName?: string
	lastInputPlaceholderId?: string
	lastInputPlaceholderJson?: string
}

export type WorkflowMeshyTaskTarget = '3d' | 'image'

export type WorkflowMeshyTaskFamily =
	| 'text-to-3d'
	| 'image-to-3d'
	| 'multi-image-to-3d'
	| 'refine'
	| 'retexture'
	| 'remesh'
	| 'uv-unwrap'
	| 'text-to-image'
	| 'image-to-image'

export type WorkflowMeshyTaskStatus =
	| 'idle'
	| 'pending'
	| 'running'
	| 'succeeded'
	| 'failed'
	| 'canceled'

export type WorkflowMeshyRelationKind = 'model' | 'texture' | 'rigging' | 'animation' | 'remesh'

export type WorkflowMeshyCapability = 'model' | 'textured' | 'rigged' | 'animated'

export type WorkflowMeshyInputSummary = {
	promptSource?: 'manual' | 'linked' | 'none'
	promptText?: string
	imageCount?: number
	modelInputConnected?: boolean
	lastValidatedAt?: number
}

export type WorkflowMeshyOutputSummary = {
	outputKind?: '3d-model' | 'image'
	preferredUrl?: string
	imageUrls?: string[]
	assetUrl?: string
	assetPath?: string
	thumbnailUrl?: string
	format?: string
}

export type WorkflowMeshyRelationSummary = {
	relationKind?: WorkflowMeshyRelationKind
	rootTaskId?: string
	parentTaskId?: string
	capabilities?: WorkflowMeshyCapability[]
	hasTextureChild?: boolean
	hasRiggingChild?: boolean
	hasAnimationChild?: boolean
	effectiveTaskId?: string
	effectiveRelationKind?: WorkflowMeshyRelationKind
	effectiveStatus?: WorkflowMeshyTaskStatus
	effectiveProgress?: number
	effectivePreferredModelUrl?: string
	effectivePreferredImageUrl?: string
	effectiveLocalAssetUrl?: string
	effectiveLocalAssetPath?: string
	effectiveThumbnailUrl?: string
}

export type WorkflowMeshyNodeSettings = {
	meshyApiSource?: 'meshy'
	meshyTaskTarget?: WorkflowMeshyTaskTarget
	meshyTaskFamily?: WorkflowMeshyTaskFamily
	meshyRelationKind?: WorkflowMeshyRelationKind
	meshyRootTaskId?: string
	meshyParentTaskId?: string
	meshyCapabilities?: WorkflowMeshyCapability[]
	meshyHelpTopic?: string
	meshyMode?: 'text-to-3d' | 'image-to-3d' | 'multi-image-to-3d' | 'remesh' | 'retexture' | 'uv-unwrap'
	meshyStage?: 'preview' | 'refine'
	meshyPrompt?: string
	meshyNegativePrompt?: string
	meshyPreviewTaskId?: string
	meshyImageUrl?: string
	meshyImageUrls?: string[]
	meshyTexturePrompt?: string
	meshyTextureImageUrl?: string
	meshyModelType?: 'standard' | 'lowpoly'
	meshyAiModel?: 'latest' | 'meshy-6' | 'meshy-5' | 'nano-banana' | 'nano-banana-pro'
	meshyAspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
	meshyGenerateMultiView?: boolean
	meshyOutputImageCount?: 1 | 2 | 3 | 4
	meshyImageInputCount?: number
	meshySeed?: number
	meshyAnimationActionId?: number
	meshyTopology?: 'triangle' | 'quad'
	meshyTargetPolycount?: number
	meshyDecimationMode?: 'auto' | 'fast' | 'accurate'
	meshyEnableOriginalUv?: boolean
	meshyEnablePbr?: boolean
	meshyHdTexture?: boolean
	meshyRemoveLighting?: boolean
	meshyAlphaThumbnail?: boolean
	meshyStyleSource?: 'text' | 'image'
	meshySymmetryMode?: 'off' | 'auto' | 'on'
	meshyShouldRemesh?: boolean
	meshySavePreRemeshedModel?: boolean
	meshyShouldTexture?: boolean
	meshyPoseMode?: '' | 'a-pose' | 't-pose'
	meshyModeration?: boolean
	meshyImageEnhancement?: boolean
	meshyAutoSize?: boolean
	meshyOriginAt?: 'bottom' | 'center'
	meshyTargetFormats?: Array<'glb' | 'obj' | 'fbx' | 'stl' | 'usdz'>
	meshyTaskId?: string
	meshyTaskStatus?: WorkflowMeshyTaskStatus
	meshyProgress?: number
	meshyStatusText?: string
	meshyThumbnailUrl?: string
	meshyModelUrls?: Partial<
		Record<'glb' | 'obj' | 'fbx' | 'stl' | 'usdz' | 'pre_remeshed_glb', string>
	>
	meshyOutputAssetUrl?: string
	meshyOutputAssetPath?: string
	meshyErrorMessage?: string
	meshyInputSummary?: WorkflowMeshyInputSummary
	meshyOutputSummary?: WorkflowMeshyOutputSummary
	meshyRelationSummary?: WorkflowMeshyRelationSummary
}

export type WorkflowBlenderChatMessage = {
	id: string
	role: 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result' | 'tool' | 'thinking' | 'command'
	content: string
	timestamp: number
	toolName?: string
	toolArgs?: Record<string, unknown>
	toolResult?: unknown
	toolError?: string
	toolCallId?: string
	status?: 'running' | 'completed' | 'error'
	isStreaming?: boolean
	isThinking?: boolean
	isStreamingThinking?: boolean
	isError?: boolean
	collapsed?: boolean
	thinkingContent?: string
	thinkingCollapsed?: boolean
	command?: string
	screenshots?: string[]
}

export type WorkflowBlenderNodeSettings = {
	mcpServerId?: string
	mcpHost?: string
	mcpPort?: number
	mcpStatus?:
		| 'unchecked'
		| 'checking'
		| 'no-blender'
		| 'no-addon'
		| 'blender-not-running'
		| 'addon-not-started'
		| 'disconnected'
		| 'connecting'
		| 'connected'
		| 'error'
	mcpError?: string | null
	blenderPath?: string | null
	blenderVersion?: string | null
	hasBlender?: boolean
	hasAddon?: boolean
	blenderRunning?: boolean
	addonListening?: boolean
	importStatus?: 'idle' | 'downloading' | 'importing' | 'completed' | 'error'
	importProgress?: number
	importError?: string | null
	chatMessages?: WorkflowBlenderChatMessage[]
	isResponding?: boolean
	isSubmitting?: boolean
	chatContextUsage?: {
		tokenCount: number
		budget: number
		usage: number
		truncated: boolean
	}
	agentBackend?: string
	agentSessionId?: string
	model?: string
	modelId?: string
	geminiTextModelVersion?: string
	textModelVersion?: string
	thinkingEffort?: string
	toolsReady?: boolean
	toolCount?: number
	missingToolCount?: number
	missingTools?: string[]
	/** 上一轮 Agent 会话的产物（供 out-0 下游取数，设计文档 §4.5） */
	lastOutputs?: {
		/** Agent 最终回复/场景信息文本 */
		text?: string
		/** 视口截图（data URL 或 dweb:// 资产 URL） */
		imageUrl?: string
		/** 导出模型文件路径（二期） */
		modelPath?: string
		updatedAt?: number
	}
	/** 工作空间绝对路径（Content/agent/{nodeId}/） */
	workspacePath?: string
	/** 工作空间相对项目根路径 */
	workspaceRelativePath?: string
}

export type WorkflowNode = {
	id: string
	type: string
	title: string
	alias?: string
	subtitle?: string
	/** For rotate-image nodes: generated camera prompt text */
	rotatePromptText?: string
	/** For text resource nodes: user-entered multi-line text */
	textValue?: string
	/** For text-merge nodes: ordered list of merge slots */
	textMergeItems?: Array<{ id: string }>
	/** Absolute path of the bound asset on host OS (desktop/dev usage) */
	resourcePath?: string
	imageSettings?: WorkflowImageNodeSettings
	videoSettings?: WorkflowVideoNodeSettings
	sceneUnderstandingSettings?: WorkflowSceneUnderstandingNodeSettings
	sceneLayoutSettings?: WorkflowSceneLayoutNodeSettings
	unrealExportSettings?: WorkflowUnrealExportNodeSettings
	sceneDecomposeSettings?: WorkflowSceneDecomposeNodeSettings
	storySettings?: WorkflowStoryNodeSettings
	comfyuiSettings?: WorkflowComfyUINodeSettings
	model3dSettings?: WorkflowModel3DNodeSettings
	meshySettings?: WorkflowMeshyNodeSettings
	blenderSettings?: WorkflowBlenderNodeSettings
	tripo3dSettings?: WorkflowTripo3DModelSettings
	/** For chat dialog: user-entered draft text */
	nodeChatDraft?: string
	/** For chat dialog: user-configured params */
	nodeChatParams?: Record<string, unknown>
	/** For chat dialog: mirror of nodeChatDraft (legacy prompt field, kept for back-compat) */
	prompt?: string
	worldX: number
	worldY: number
	width: number
	height: number
	sizeCustomized?: boolean
	resourceId?: string | null
	branches?: WorkflowStoryBranch[]
	inputs: WorkflowAnchorSpec[]
	outputs: WorkflowAnchorSpec[]
	createdAt: number
}

export type WorkflowEdge = {
	id: string
	fromNodeId: string
	fromAnchorId: string
	toNodeId: string
	toAnchorId: string
	createdAt: number
}

export type WorkflowNodeChatType = 'text' | 'image' | 'video' | 'model3d' | 'blender'

export type WorkflowNodeChatTextParams = {
	modelId?: string
	model?: string
	textModelVersion?: string
	geminiTextModelVersion?: string
	speed?: 'fast' | 'normal' | 'slow'
	thinking?: string
	responseFormat?: string
	maxTokens?: number
}

export type WorkflowNodeChatImageParams = {
	modelId?: string
	model?: string
	nanobananaModelVersion?: string
	geminiImageModelVersion?: string
	geminiImageSize?: string
	geminiAspectRatio?: string
	geminiQuantity?: number
	geminiThinkingLevel?: string
	geminiNegativePrompt?: string
	imageSize?: string
	thinkingLevel?: string
	seedreamModelVersion?: string
	seedreamSize?: string
	seedreamAspectRatio?: string
	seedreamOutputFormat?: string
	seedreamQuantity?: number
	seedreamWatermark?: boolean
	seedreamSeed?: number
	seedreamNegativePrompt?: string
	negativePrompt?: string
	resolution?: string
	aspectRatio?: string
	quantity?: number
	meshyImageAiModel?: string
	meshyAspectRatio?: string
	meshyNegativePrompt?: string
	meshyPoseMode?: string
	meshyGenerateMultiView?: boolean
	meshySeed?: number
	meshyOutputImageCount?: number
	tripo3dImageMode?: 'text_to_image' | 'image_to_image' | 'image_to_multiview'
	tripo3dImageModel?: string
	tripo3dImageSize?: string
	tripo3dImageAspectRatio?: string
	tripo3dImageOutputFormat?: 'png' | 'jpeg'
	tripo3dImageWatermark?: boolean
	tripo3dImageTemplate?: string
	tripo3dImageNumOutputs?: number
	tripo3dImageNegativePrompt?: string
	tripo3dImageStrength?: number
	tripo3dImageSeed?: number
	tripo3dImageForceSingleImage?: boolean
}

export type WorkflowNodeChatVideoParams = {
	modelId?: string
	model?: string
	seedanceModelVersion?: string
	mode?: 'auto' | 'text_to_video' | 'image_to_video' | 'first-last' | 'reference' | 'video_edit' | ''
	resolution?: string
	ratio?: string
	duration?: number
	seed?: number
	quantity?: number
	negativePrompt?: string
	generateAudio?: boolean
	watermark?: boolean
	cameraFixed?: boolean
	returnLastFrame?: boolean
	enableWebSearch?: boolean
	priority?: number
}

export type WorkflowNodeChatModel3DParams = {
	provider?: 'tripo3d' | 'meshy'
	modelId?: string
	model?: string
	tripoProvider?: 'dreammaker' | 'official'
	tripoMode?: 'image-to-3d' | 'multi-image-to-3d' | 'retopo'
	tripoOutputFormat?: 'fbx' | 'glb'
	tripoTextureQuality?: 'standard' | 'detailed'
	tripo3dModelSeries?: string
	tripo3dModelVersion?: string
	tripo3dForceSingleImage?: boolean
	tripo3dSelectedImages?: WorkflowTripo3DSelectedImage[]
	tripo3dFaceLimit?: number
	tripo3dTexture?: boolean
	tripo3dPbr?: boolean
	tripo3dNegativePrompt?: string
	tripo3dEnableImageAutofix?: boolean
	tripo3dTextureAlignment?: string
	tripo3dOrientation?: string
	tripo3dTextureQuality?: string
	tripo3dGeometryQuality?: string
	tripo3dAutoSize?: boolean
	tripo3dQuad?: boolean
	tripo3dSmartLowPoly?: boolean
	tripo3dGenerateParts?: boolean
	tripo3dCompress?: boolean
	tripo3dExportUv?: boolean
	tripo3dModelSeed?: number
	tripo3dTextureSeed?: number
	tripo3dTaskMode?: WorkflowTripo3DMode
	tripo3dTextureModelVersion?: 'v2.5-20250123' | 'v3.0-20250812'
	tripo3dTextureBake?: boolean
	tripo3dTextureForceSingleImage?: boolean
	tripo3dTextureSelectedImages?: WorkflowTripo3DSelectedImage[]
	tripo3dSegType?: 'image' | 'model'
	tripo3dGranularity?: 'coarse' | 'medium' | 'fine'
	tripo3dDecimateModel?: 'v1.0' | 'v2.0'
	tripo3dConvertFormat?: 'GLTF' | 'FBX' | 'USDZ' | 'OBJ' | 'STL' | '3MF'
	tripo3dConvertQuad?: boolean
	tripo3dConvertFlattenBottom?: boolean
	tripo3dConvertFaceLimit?: number
	tripo3dConvertTextureSize?: number
	tripo3dPartNames?: string[]
	tripo3dHint?: string
	tripo3dTransform?: number[]
	meshyMode?: string
	meshyAiModel?: string
	meshyModelType?: string
	meshyTopology?: string
	meshySymmetryMode?: string
	meshyOriginAt?: string
	meshyPoseMode?: string
	meshyOutputFormat?: string
	meshyMultiView?: boolean
	meshySeed?: number
	meshyTargetPolycount?: number
	meshyDecimationMode?: string
	meshyEnableOriginalUv?: boolean
	meshyEnablePbr?: boolean
	meshyHdTexture?: boolean
	meshyRemoveLighting?: boolean
	meshyAlphaThumbnail?: boolean
	meshyStyleSource?: string
	meshyTextureImageUrl?: string
	meshyTextureImageNodeId?: string
}

export type WorkflowNodeChatBlenderParams = {
	agentBackend?: 'dvsagent' | 'codex' | 'copilot'
	modelId?: string
	thinkingEffort?: 'disabled' | 'low' | 'medium' | 'high'
}

export type WorkflowNodeChatParamRecord =
	& Partial<WorkflowNodeChatTextParams>
	& Partial<WorkflowNodeChatImageParams>
	& Partial<WorkflowNodeChatVideoParams>
	& Partial<WorkflowNodeChatModel3DParams>
	& Partial<WorkflowNodeChatBlenderParams>

export type WorkflowNodeChatParams = {
	text?: WorkflowNodeChatParamRecord
	image?: WorkflowNodeChatParamRecord
	video?: WorkflowNodeChatParamRecord
	model3d?: WorkflowNodeChatParamRecord
	blender?: WorkflowNodeChatParamRecord
}

export type WorkflowNodeChatSubmitPayload = {
	nodeId: string
	nodeType: WorkflowNodeChatType
	prompt: string
	params: WorkflowNodeChatParamRecord
	references?: Array<{
		refId: string
		nodeId: string
		edgeId?: string
		type: 'text' | 'image' | 'video' | 'model3d' | 'blender'
		label: string
	}>
	attachments?: Array<{
		type?: string
		name?: string
		url?: string
		data?: string
	}>
}

export type WorkflowNodeGenerationStatus = 'idle' | 'submitting' | 'running' | 'completed' | 'error' | 'cancelled'

export type WorkflowNodeGenerationTask = {
	id: string
	nodeId: string
	nodeType: WorkflowNodeChatType
	status: WorkflowNodeGenerationStatus
	statusText: string
	progress: number
	startedAt: number
	finishedAt?: number
	errorMessage?: string
	results: Array<{ url: string; label?: string; kind: 'image' | 'video' | 'text' | 'model3d' }>
	detailLines: string[]
}

export type WorkflowNodeChatDialog = {
	visible: boolean
	nodeId: string | null
	nodeType: WorkflowNodeChatType | null
	draft: string
	submitting: boolean
	params: WorkflowNodeChatParams
}

export type WorkflowState = {
	viewport: WorkflowViewport
	nodesById: Record<string, WorkflowNode>
	nodeOrder: string[]
	edgesById: Record<string, WorkflowEdge>
	edgeOrder: string[]
	resourcesById: Record<string, WorkflowResource>
	resourceOrder: string[]
	selectedNodeId: string | null
	selectedNodeIds: string[]
	selectedEdgeId: string | null
	clipboardNode: WorkflowNode | null
	clipboardNodes: WorkflowNode[] | null
	clipboardPrimaryNodeId: string | null
	chatDraft: string
	nodeChatDialog: WorkflowNodeChatDialog
	nodeGenerationTasksById: Record<string, WorkflowNodeGenerationTask>
	nodeGenerationTaskIdsByNodeId: Record<string, string[]>
	/** 当前多选对应的 tag 记录（按 key 索引） */
	selectionTagsByKey: Record<string, WorkflowSelectionTag>
	/** 已保存的选区框列表（持久化实体） */
	savedSelectionFrames: SavedSelectionFrame[]
	/** 是否显示节点级多选框（运行时开关） */
	nodeCheckboxVisible: boolean
	/** 当前项目 ID */
	projectId: number | null
	/** 当前项目根路径 */
	projectRootPath: string
}

export type WorkflowSelectionTarget =
	| { kind: 'node'; id: string }
	| { kind: 'edge'; id: string }
	| { kind: 'none' }

export abstract class WorkflowEntity {
	abstract id: string
	abstract kind: 'node' | 'edge'
}

export abstract class WorkflowBlueprint {
	abstract id: string
	abstract name: string
}

/**
 * 多选标签（Selection Tag）
 *  - key  由 selectedNodeIds 排序拼接，保证 frame 稳定
 *  - label 为用户编辑的文本
 *  - note  为节点批注（可空）
 *  - color 标识色（可空）
 */
export type WorkflowSelectionTag = {
	/** 稳定 key：`ids:nodeId1|nodeId2|...` */
	key: string
	/** 用户可编辑的标签名 */
	label: string
	/** 可选批注 */
	note?: string
	/** 可选标识色（hex） */
	color?: string
	/** 节点 ID 列表（已排序） */
	nodeIds: string[]
	/** 创建时间（毫秒） */
	createdAt: number
	/** 最近更新时间 */
	updatedAt: number
}

/**
 * 已保存的选区框（持久化实体，不依赖运行时 selectedNodeIds）
 */
export type SavedSelectionFrame = {
	/** 唯一 ID（UUID） */
	id: string
	/** 用户命名的标签 */
	label: string
	/** 包含的节点 ID 列表（已排序） */
	nodeIds: string[]
	/** 创建时间 */
	createdAt: number
}
