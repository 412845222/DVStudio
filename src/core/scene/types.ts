import type { JsonValue } from '../shared/json'

export type VideoSceneProjectNodeKind = 'group' | 'stage' | 'grid' | 'unknown'
export type VideoSceneUserNodeType = 'base' | 'rect' | 'text' | 'image' | 'line'
export type VideoSceneNodeCategory = 'project' | 'user'

export type VideoSceneNodeTransform = {
	x: number
	y: number
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
	rightPanelWidth: number
	bottomToolbarHeight: number
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

export interface VideoSceneState {
	showSizePanel: boolean
	showBackgroundPanel: boolean
	layers: VideoSceneLayer[]
	activeLayerId: string
	selectedNodeId: string | null
	selectedNodeIds: string[]
	focusedNodeId: string | null
	layoutInsets: VideoSceneLayoutInsets
	imageAssets: Record<string, VideoSceneImageAsset>
}
