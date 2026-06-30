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
	/** source image natural size in pixels (used for aspect-safe crop constraints) */
	naturalWidth?: number
	naturalHeight?: number
	/** whether crop should be applied to node output / downstream preview */
	cropEnabled?: boolean
	/** crop rect in normalized source space */
	crop?: WorkflowImageCrop
	/** image generation source */
	imageGenerationSource?: 'upload' | 'comfyui' | 'meshy'
	/** Meshy image generation settings */
	meshyImageSettings?: {
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
		taskStatus?: 'idle' | 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled'
		progress?: number
		statusText?: string
		errorMessage?: string
		outputSummary?: {
			preferredUrl?: string
			imageUrls?: string[]
			assetUrl?: string
			assetPath?: string
			thumbnailUrl?: string
		}
	}
}

export type WorkflowVideoNodeSettings = {
	/** desired screenshot/output resolution in pixels */
	outputWidth?: number
	outputHeight?: number
	/** source video natural size in pixels */
	naturalWidth?: number
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

export type WorkflowSceneUnderstandingNodeSettings = {
	mode?: 'scene-layout' | 'scene-lighting'
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
	modelFormat?: 'glb' | 'gltf'
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

export type WorkflowSceneLayoutManualModelBinding = {
	objectId: string
	modelUrl?: string
	modelAssetUrl?: string
	modelSourceName?: string
	modelSourcePath?: string
	modelAssetPath?: string
	modelProjectRelativePath?: string
	modelAssetProjectRelativePath?: string
	modelFormat?: 'glb' | 'gltf'
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
	modelFormat?: 'glb' | 'gltf'
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
	/** available workflow files under user workflows dir */
	workflows?: { path: string; name: string }[]
	/** selected workflow file path, e.g. workflows/xxx.json */
	workflowPath?: string
	/** optional override text for positive CLIP prompt nodes */
	positivePrompt?: string
	/** optional override text for negative CLIP prompt nodes */
	negativePrompt?: string

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
		kind: 'image' | 'video'
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
}

export type WorkflowModel3DNodeSettings = {
	modelGenerationSource?: 'upload' | 'comfyui' | 'meshy'
	meshyModelSettings?: WorkflowMeshyModelSettings
	modelUrl?: string
	modelFormat?: 'glb' | 'gltf'
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
	/** For chat dialog: user-entered draft text */
	nodeChatDraft?: string
	/** For chat dialog: user-configured params */
	nodeChatParams?: Record<string, unknown>
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

export type WorkflowNodeChatType = 'text' | 'image' | 'video' | 'model3d'

export type WorkflowNodeChatTextParams = {
	modelId?: string
	model?: string
	textModelVersion?: string
	speed?: 'fast' | 'normal' | 'slow'
	thinking?: string
	responseFormat?: string
	maxTokens?: number
}

export type WorkflowNodeChatImageParams = {
	modelId?: string
	model?: string
	nanobananaModelVersion?: string
	seedreamModelVersion?: string
	seedreamSize?: string
	seedreamAspectRatio?: string
	seedreamOutputFormat?: string
	seedreamQuantity?: number
	seedreamWatermark?: boolean
	seedreamSeed?: number
	seedreamNegativePrompt?: string
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
}

export type WorkflowNodeChatVideoParams = {
	modelId?: string
	model?: string
	seedanceModelVersion?: string
	mode?: 'auto' | 'text_to_video' | 'image_to_video' | 'first-last' | 'reference'
	resolution?: string
	ratio?: string
	duration?: number
	seed?: number
	generateAudio?: boolean
	watermark?: boolean
	cameraFixed?: boolean
	returnLastFrame?: boolean
}

export type WorkflowNodeChatModel3DParams = {
	provider?: 'tripo3d' | 'meshy'
	modelId?: string
	model?: string
	tripoProvider?: 'dreammaker' | 'official'
	tripoMode?: 'image-to-3d' | 'multi-image-to-3d' | 'retopo'
	tripoOutputFormat?: 'fbx' | 'glb'
	tripoTextureQuality?: 'standard' | 'detailed'
	tripoModelVersion?: string
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

export type WorkflowNodeChatParamRecord =
	& Partial<WorkflowNodeChatTextParams>
	& Partial<WorkflowNodeChatImageParams>
	& Partial<WorkflowNodeChatVideoParams>
	& Partial<WorkflowNodeChatModel3DParams>

export type WorkflowNodeChatParams = {
	text?: WorkflowNodeChatParamRecord
	image?: WorkflowNodeChatParamRecord
	video?: WorkflowNodeChatParamRecord
	model3d?: WorkflowNodeChatParamRecord
}

export type WorkflowNodeChatSubmitPayload = {
	nodeId: string
	nodeType: WorkflowNodeChatType
	prompt: string
	params: WorkflowNodeChatParamRecord
}

export type WorkflowNodeGenerationStatus = 'idle' | 'submitting' | 'running' | 'completed' | 'error'

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
