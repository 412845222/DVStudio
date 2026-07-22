export type NodeOutputKind = 'text' | 'image' | 'video' | 'model3d' | 'audio' | 'blender' | 'node'

export interface NodeOutputPreview {
	kind: NodeOutputKind
	nodeId: string
	nodeType: string
	anchorId: string
	label: string
	name?: string
	text?: string
	previewUrl?: string
	meta?: Record<string, unknown>
}

export interface NodeOutputDragData {
	type: 'workflow-node-output'
	nodeId: string
	nodeType: string
	anchorId: string
	kind: NodeOutputKind
	label: string
	name?: string
	previewUrl?: string
	meta?: Record<string, unknown>
	text?: string
}

export type ChatContextItemType = 'image' | 'file' | 'skill' | 'node' | 'nodeOutput'

export interface BaseContextItem {
	id: string
	type: ChatContextItemType
	addedAt: number
}

export interface ImageContextItem extends BaseContextItem {
	type: 'image'
	name: string
	mimeType: string
	size: number
	dataUrl?: string
	url?: string
	width?: number
	height?: number
	thumbnailUrl?: string
}

export interface FileContextItem extends BaseContextItem {
	type: 'file'
	name: string
	mimeType: string
	size: number
	path?: string
	content?: string
	truncated?: boolean
}

export interface SkillContextItem extends BaseContextItem {
	type: 'skill'
	skillId: string
	name: string
	description: string
	prompt: string
	icon?: string
	category?: string
}

export interface NodeContextItem extends BaseContextItem {
	type: 'node'
	nodeId: string
	nodeType: string
	label: string
	config?: Record<string, unknown>
	includeConnections: boolean
	connections?: Array<{
		direction: 'in' | 'out'
		nodeId: string
		nodeType?: string
		anchorId: string
	}>
	previewUrl?: string
	resourceUrl?: string
	thumbKind?: NodeOutputKind
	mainOutputAnchorId?: string
	mainOutputText?: string
}

export interface NodeOutputContextItem extends BaseContextItem {
	type: 'nodeOutput'
	kind: NodeOutputKind
	nodeId: string
	nodeType: string
	anchorId: string
	edgeId?: string
	label: string
	name?: string
	text?: string
	previewUrl?: string
	meta?: Record<string, unknown>
}

export type ChatContextItem =
	| ImageContextItem
	| FileContextItem
	| SkillContextItem
	| NodeContextItem
	| NodeOutputContextItem
