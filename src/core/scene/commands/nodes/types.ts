import type { JsonValue } from '../../../shared/json'
import type { VideoSceneNodeTransform, VideoSceneState, VideoSceneTreeNode, VideoSceneUserNodeType } from '../../types'
import type { SelectionPatch } from '../selection/types'

export type AddRenderableNodeArgs = {
	state: Pick<VideoSceneState, 'layers' | 'activeLayerId'>
	layerId: string
	type: VideoSceneUserNodeType
	parentId?: string | null
}

export type AddRenderableNodeResult = {
	node: VideoSceneTreeNode
	selection: SelectionPatch
}

export type NodePropsPatch = Record<string, JsonValue>

export type NodeTransformPatch = Partial<VideoSceneNodeTransform>
