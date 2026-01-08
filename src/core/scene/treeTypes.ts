import type { VideoSceneTreeNode } from './types'

export type WorldPosResult = {
	node: VideoSceneTreeNode
	parentWorld: { x: number; y: number; scaleX: number; scaleY: number; rotation: number }
	world: { x: number; y: number; scaleX: number; scaleY: number; rotation: number }
}
