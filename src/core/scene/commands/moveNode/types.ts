import type { VideoSceneLayer } from '../../types'

export type MoveNodeArgs = {
	layer: VideoSceneLayer
	nodeId: string
	targetParentId: string | null
	targetIndex?: number
}
