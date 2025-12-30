import type { Store } from 'vuex'
import type { VideoSceneLayer, VideoSceneState, VideoSceneTreeNode } from '../../../../store/videoscene'
import { NodeTreeController } from './NodeTreeController'

export class VideoSceneNodeTreeController extends NodeTreeController {
	constructor(store: Store<VideoSceneState>) {
		super(store)
	}

	getActiveLayer(): VideoSceneLayer | null {
		const state = this.store.state
		return state.layers.find((l) => l.id === state.activeLayerId) ?? state.layers[0] ?? null
	}

	getRootNode(): VideoSceneTreeNode | null {
		const layer = this.getActiveLayer()
		return layer?.nodeTree?.[0] ?? null
	}

	getActiveElements(): VideoSceneTreeNode[] {
		const root = this.getRootNode()
		return root?.children ?? []
	}

	getActiveTreeRoot(): VideoSceneTreeNode[] {
		// 兼容旧接口：返回“可见元素列表”而不是隐藏 root
		return this.getActiveElements()
	}

	moveToRoot(nodeId: string) {
		// “根”指图层的隐藏 root 节点
		this.store.dispatch('moveNode', { nodeId, targetParentId: 'root' })
	}
}
