export type DwebCanvasMenuNodeActionId =
	| 'text-generation'
	| 'image-generation'
	| 'video-generation'
	| 'scene-understanding'
	| 'scene-layout'
	| 'scene-decompose'
	| 'comfyui'
	| 'model3d'
	| 'meshy'
	| 'rotate-image'
	| 'unreal-export'

export type DwebCanvasMenuSpecialActionId = 'upload'

export type DwebCanvasMenuActionId = DwebCanvasMenuNodeActionId | DwebCanvasMenuSpecialActionId

export type DwebCanvasMenuSource =
	| 'pane-context'
	| 'connect-blank-drop'
	| 'selection-batch-io'
	| 'node-context'

export type DwebCanvasMenuMode = 'default' | 'connect-recommend'

export type DwebCanvasMenuOrigin = 'canvas' | 'quick-add'

export type DwebCanvasMenuConnectFrom = {
	sourceNodeId: string
	sourceAnchorId: string
}

export type DwebCanvasMenuDataKind =
	| 'flow'
	| 'resource'
	| 'generic'
	| 'image'
	| 'video'
	| 'audio'
	| 'text'

export type Newui2NodeCategoryId = 'basic' | 'image2d' | 'video' | 'audio' | 'model3d'

export type Newui2NodeCatalogCategory = {
	id: Newui2NodeCategoryId
	label: string
	description?: string
}

export type Newui2NodeTopCategoryId =
	| 'inputs'
	| 'text'
	| 'image'
	| 'video'
	| 'audio'
	| 'scene'
	| 'model3d'
	| 'materials'
	| 'plugin'

export type Newui2NodeTopCategoryIconKey =
	| 'inputs'
	| 'text'
	| 'image'
	| 'video'
	| 'audio'
	| 'scene'
	| 'model3d'
	| 'materials'
	| 'plugin'

export type Newui2NodeTopCategory = {
	id: Newui2NodeTopCategoryId
	label: string
	description?: string
	iconKey: Newui2NodeTopCategoryIconKey
}

export type Newui2NodeSpecialGroupId =
	| 'object-cluster'
	| 'indoor-scene'
	| 'outdoor-scene'
	| 'gaussian-splat'
	| 'motion'

export type Newui2NodeSpecialGroupIconKey =
	| 'object-cluster'
	| 'indoor-scene'
	| 'outdoor-scene'
	| 'gaussian-splat'
	| 'motion'

export type Newui2NodeSpecialGroup = {
	id: Newui2NodeSpecialGroupId
	label: string
	description?: string
	iconKey: Newui2NodeSpecialGroupIconKey
}

export type Newui2NodeCatalogItem = {
	actionId: DwebCanvasMenuNodeActionId
	nodeType: string
	label: string
	description?: string
	primaryCategoryId?: Newui2NodeCategoryId
	categoryIds?: Newui2NodeCategoryId[]
	topCategoryId?: Newui2NodeTopCategoryId
	specialGroupId?: Newui2NodeSpecialGroupId
	searchAliases?: string[]
	featuredBasicOrder?: number
	inputKinds: DwebCanvasMenuDataKind[]
	outputKinds: DwebCanvasMenuDataKind[]
	order: number
}

export type AIWorkflowDraggedNodeTemplate = {
	nodeType: string
	label: string
	source: 'newui2-node-library'
}
