import type { WorkflowResource } from './resource/types'

export type WorkflowViewport = {
	zoom: number
	panX: number
	panY: number
}

export type WorkflowAnchorSpec = {
	id: string
	label?: string
	offsetY?: number
	mediaType?: 'generic' | 'image' | 'video' | 'text' | 'flow'
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
}

export type WorkflowVideoNodeSettings = {
	/** desired screenshot/output resolution in pixels */
	outputWidth?: number
	outputHeight?: number
	/** source video natural size in pixels */
	naturalWidth?: number
	naturalHeight?: number
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

export type WorkflowNode = {
	id: string
	type: string
	title: string
	alias?: string
	subtitle?: string
	/** For text resource nodes: user-entered multi-line text */
	textValue?: string
	/** For text-merge nodes: ordered list of merge slots */
	textMergeItems?: Array<{ id: string }>
	/** Absolute path of the bound asset on host OS (desktop/dev usage) */
	resourcePath?: string
	imageSettings?: WorkflowImageNodeSettings
	videoSettings?: WorkflowVideoNodeSettings
	storySettings?: WorkflowStoryNodeSettings
	comfyuiSettings?: WorkflowComfyUINodeSettings
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

export type WorkflowState = {
	viewport: WorkflowViewport
	nodesById: Record<string, WorkflowNode>
	nodeOrder: string[]
	edgesById: Record<string, WorkflowEdge>
	edgeOrder: string[]
	resourcesById: Record<string, WorkflowResource>
	resourceOrder: string[]
	// Primary selection (for inspector) + multi selection (for batch operations)
	selectedNodeId: string | null
	selectedNodeIds: string[]
	selectedEdgeId: string | null
	clipboardNode: WorkflowNode | null
	clipboardNodes: WorkflowNode[] | null
	clipboardPrimaryNodeId: string | null
	chatDraft: string
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
