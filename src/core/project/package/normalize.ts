import { upgradeNodeType } from '../../scene/nodesType'
import type { EditorSnapshot } from '../../editor/types'
import type { JsonValue } from '../../shared/json'
import type { NodeBaseDTO, NodeType } from '../../scene/nodesType'
import type { VideoSceneNodeProps, VideoSceneTreeNode, VideoSceneUserNodeType } from '../../scene/types'

const walkTree = (nodes: VideoSceneTreeNode[] | undefined, onNode: (node: VideoSceneTreeNode) => void) => {
	if (!nodes) return
	for (const n of nodes) {
		onNode(n)
		if (n.children?.length) walkTree(n.children, onNode)
	}
}

const normalizeLayerRoot = (layer: { name: string; nodeTree: VideoSceneTreeNode[] }) => {
	const root = layer.nodeTree.find((n) => n.id === 'root')
	if (root && root.category === 'project') return
	const children = layer.nodeTree.slice()
	layer.nodeTree = [
		{
			id: 'root',
			name: layer.name,
			category: 'project',
			projectKind: 'group',
			children,
		},
	]
}

const toNumber = (v: unknown, fallback: number) => {
	const n = Number(v)
	return Number.isFinite(n) ? n : fallback
}

export const normalizeSnapshotV1 = (snapshot: EditorSnapshot): EditorSnapshot => {
	for (const layer of snapshot.videoScene.layers ?? []) {
		normalizeLayerRoot(layer)
		walkTree(layer.nodeTree, (node) => {
			if (node.category !== 'user') return
			const t = (node.userType ?? 'base') as unknown as NodeType
			const tr = node.transform ?? { x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1 }
			const dto: NodeBaseDTO = {
				id: node.id,
				name: node.name,
				type: t,
				transform: {
					x: toNumber(tr.x, 0),
					y: toNumber(tr.y, 0),
					width: toNumber(tr.width, 200),
					height: toNumber(tr.height, 120),
					rotation: toNumber(tr.rotation, 0),
					opacity: toNumber(tr.opacity, 1),
				},
				props: (node.props ?? {}) as Record<string, JsonValue>,
			}
			const upgraded = upgradeNodeType(dto, t)
			node.userType = upgraded.type as unknown as VideoSceneUserNodeType
			node.transform = { ...upgraded.transform }
			node.props = (upgraded.props ?? {}) as unknown as VideoSceneNodeProps
		})
	}
	return snapshot
}
