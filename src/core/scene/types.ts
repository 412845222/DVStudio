import type { JsonValue } from '../shared/json'

export type VideoSceneProjectNodeKind = 'group' | 'stage' | 'grid' | 'unknown'
export type VideoSceneUserNodeType = 'base' | 'rect' | 'text' | 'image' | 'line' | 'video'
export type VideoSceneNodeCategory = 'project' | 'user'

export type VideoSceneNodeTransform = {
	x: number
	y: number
	/**
	 * Node scale in local space, clamped to [0..1].
	 * - scaleX/scaleY are the canonical fields.
	 */
	scaleX: number
	scaleY: number
	/** @deprecated legacy uniform scale; loader/normalizer will map it to scaleX/scaleY */
	scale?: number
	/**
	 * Pivot in local space, normalized to [0..1].
	 * - 0.5 means the node's (x,y) is at its center (legacy behavior)
	 * - 0 means the node's (x,y) is at its left/top edge
	 */
	pivotX: number
	pivotY: number
	width: number
	height: number
	rotation: number
	opacity: number
}
export type VideoSceneNodeProps = {
	// base/rect/text/image/line 不同类型使用不同字段
	[key: string]: JsonValue
}

export type VideoSceneTreeNode = {
	id: string
	createdAt?: number
	name: string
	category: VideoSceneNodeCategory
	projectKind?: VideoSceneProjectNodeKind
	userType?: VideoSceneUserNodeType
	transform?: VideoSceneNodeTransform
	props?: VideoSceneNodeProps
	children?: VideoSceneTreeNode[]
}

export type VideoSceneLayer = {
	id: string
	name: string
	nodeTree: VideoSceneTreeNode[]
}

export type VideoSceneLayoutInsets = {
	leftPanelWidth: number
	rightPanelWidth: number
	bottomToolbarHeight: number
}

export type VideoSceneLeftPanelMode = 'subtitle' | 'subtitle-ai' | 'component-library'

export type VideoSceneLeftPanelState = {
	open: boolean
	mode: VideoSceneLeftPanelMode | null
	layerId: string | null
	videoPath?: string | null
	/** increments whenever openLeftPanel is called, used to force-refresh UI */
	refreshToken: number
}

export type VideoSceneRenderStep = {
	layerId: string
	nodeId: string
	category: VideoSceneNodeCategory
	type: VideoSceneProjectNodeKind | VideoSceneUserNodeType
	path: string[]
}

export type VideoSceneImageAsset = {
	id: string
	url: string
	name: string
	createdAt: number
}

export type VideoSceneVideoAsset = {
	id: string
	url: string
	name: string
	videoWidth?: number
	videoHeight?: number
	duration?: number
	createdAt: number
}

export interface VideoSceneState {
	showSizePanel: boolean
	showBackgroundPanel: boolean
	showExportPanel: boolean
	showSubtitleRecogDialog: boolean
	leftPanel: VideoSceneLeftPanelState
	layers: VideoSceneLayer[]
	activeLayerId: string
	selectedNodeId: string | null
	selectedNodeIds: string[]
	focusedNodeId: string | null
	layoutInsets: VideoSceneLayoutInsets
	imageAssets: Record<string, VideoSceneImageAsset>
	videoAssets: Record<string, VideoSceneVideoAsset>
}
