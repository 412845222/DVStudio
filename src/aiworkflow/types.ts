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
}

export type WorkflowStoryBranch = {
	id: string
	text: string
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
	/** crop rect in normalized source space */
	crop?: WorkflowImageCrop
}

export type WorkflowNode = {
	id: string
	type: string
	title: string
	alias?: string
	subtitle?: string
	imageSettings?: WorkflowImageNodeSettings
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
