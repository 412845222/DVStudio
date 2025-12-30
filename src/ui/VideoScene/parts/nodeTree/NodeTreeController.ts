import type { Store } from 'vuex'
import type { VideoSceneState, VideoSceneTreeNode } from '../../../../store/videoscene'

export type FlatNode = {
	id: string
	name: string
	depth: number
	parentId: string | null
	index: number
}

export abstract class NodeTreeController {
	protected store: Store<VideoSceneState>

	constructor(store: Store<VideoSceneState>) {
		this.store = store
	}

	abstract getActiveTreeRoot(): VideoSceneTreeNode[]

	flatten(nodes: VideoSceneTreeNode[], baseParentId: string | null = null): FlatNode[] {
		const out: FlatNode[] = []
		const walk = (list: VideoSceneTreeNode[], depth: number, parentId: string | null) => {
			for (let index = 0; index < list.length; index++) {
				const n = list[index]
				out.push({ id: n.id, name: n.name, depth, parentId, index })
				if (n.children?.length) walk(n.children, depth + 1, n.id)
			}
		}
		walk(nodes, 0, baseParentId)
		return out
	}

	selectNode(nodeId: string) {
		this.store.dispatch('setSelectedNode', { nodeId })
	}

	moveAsChild(nodeId: string, targetParentId: string) {
		this.store.dispatch('moveNode', { nodeId, targetParentId })
	}

	moveAsSibling(nodeId: string, targetParentId: string | null, targetIndex: number) {
		this.store.dispatch('moveNode', { nodeId, targetParentId, targetIndex })
	}

	moveToRoot(nodeId: string) {
		this.store.dispatch('moveNode', { nodeId, targetParentId: null })
	}
}
