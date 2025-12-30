import type {
	VideoSceneLayer,
	VideoSceneProjectNodeKind,
	VideoSceneRenderStep,
	VideoSceneState,
	VideoSceneTreeNode,
	VideoSceneUserNodeType,
} from './types'
import type { WorldPosResult } from './treeTypes'

export const findLayer = (state: Pick<VideoSceneState, 'layers'>, layerId: string) => state.layers.find((l) => l.id === layerId)

export const getLayerNodeTree = (state: Pick<VideoSceneState, 'layers'>, layerId: string): VideoSceneTreeNode[] => {
	return findLayer(state, layerId)?.nodeTree ?? []
}

export const walkTree = (
	nodes: VideoSceneTreeNode[],
	visit: (node: VideoSceneTreeNode, parent: VideoSceneTreeNode | null, list: VideoSceneTreeNode[]) => boolean | void,
	parent: VideoSceneTreeNode | null = null
): boolean => {
	for (const node of nodes) {
		const stop = visit(node, parent, nodes)
		if (stop === true) return true
		if (node.children?.length) {
			const done = walkTree(node.children, visit, node)
			if (done) return true
		}
	}
	return false
}

export const detachNode = (root: VideoSceneTreeNode[], nodeId: string): VideoSceneTreeNode | null => {
	let removed: VideoSceneTreeNode | null = null
	walkTree(root, (node, _parent, list) => {
		if (node.id !== nodeId) return
		const idx = list.findIndex((n) => n.id === nodeId)
		if (idx >= 0) removed = list.splice(idx, 1)[0]
		return true
	})
	return removed
}

export const findNode = (root: VideoSceneTreeNode[], nodeId: string): VideoSceneTreeNode | null => {
	let found: VideoSceneTreeNode | null = null
	walkTree(root, (node) => {
		if (node.id === nodeId) {
			found = node
			return true
		}
	})
	return found
}

export const nodeExistsInAnyLayer = (layers: VideoSceneLayer[], nodeId: string) => {
	for (const layer of layers) {
		if (findNode(layer.nodeTree, nodeId)) return true
	}
	return false
}

export const collectAllNames = (root: VideoSceneTreeNode[]) => {
	const names: string[] = []
	walkTree(root, (node) => {
		names.push(String(node.name ?? ''))
	})
	return names
}

export const makeUniqueName = (existingNames: string[], baseName: string) => {
	const desired = String(baseName || 'Node').trim() || 'Node'
	if (!existingNames.includes(desired)) return desired
	const re = new RegExp(`^${desired.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+(\\d+))?$`)
	let maxN = 1
	for (const n of existingNames) {
		const m = re.exec(String(n || '').trim())
		if (!m) continue
		const k = m[1] ? Number(m[1]) : 1
		if (Number.isFinite(k)) maxN = Math.max(maxN, k)
	}
	return `${desired} ${maxN + 1}`
}

export const isDescendant = (root: VideoSceneTreeNode[], maybeAncestorId: string, nodeId: string) => {
	const ancestor = findNode(root, maybeAncestorId)
	if (!ancestor) return false
	const children = ancestor.children
	if (!children || children.length === 0) return false
	return !!findNode(children, nodeId)
}

export const findWorldPos = (root: VideoSceneTreeNode[], nodeId: string): WorldPosResult | null => {
	const dfs = (nodes: VideoSceneTreeNode[], parentWorld: { x: number; y: number }): WorldPosResult | null => {
		for (const n of nodes) {
			const hasT = !!n.transform
			const world = hasT
				? { x: parentWorld.x + (n.transform?.x ?? 0), y: parentWorld.y + (n.transform?.y ?? 0) }
				: parentWorld
			const nextParentWorld = hasT ? world : parentWorld
			if (n.id === nodeId) return { node: n, parentWorld, world }
			if (n.children?.length) {
				const hit = dfs(n.children, nextParentWorld)
				if (hit) return hit
			}
		}
		return null
	}
	return dfs(root, { x: 0, y: 0 })
}

export const buildRenderPipeline = (state: Pick<VideoSceneState, 'layers'>): VideoSceneRenderStep[] => {
	const steps: VideoSceneRenderStep[] = []
	for (const layer of state.layers) {
		const dfs = (nodes: VideoSceneTreeNode[], path: string[]) => {
			for (const n of nodes) {
				const category = n.category
				const type = (n.category === 'user' ? (n.userType ?? 'rect') : (n.projectKind ?? 'unknown')) as
					| VideoSceneProjectNodeKind
					| VideoSceneUserNodeType
				steps.push({ layerId: layer.id, nodeId: n.id, category, type, path: [...path, n.id] })
				if (n.children?.length) dfs(n.children, [...path, n.id])
			}
		}
		dfs(layer.nodeTree, [])
	}
	return steps
}

export const findLayerIdByNodeIdInLayers = (layers: VideoSceneLayer[], nodeId: string): string | null => {
	const id = String(nodeId || '').trim()
	if (!id) return null
	for (const layer of layers) {
		if (findNode(layer.nodeTree, id)) return layer.id
	}
	return null
}

export const findUserNodeTransformInLayers = (layers: VideoSceneLayer[], nodeId: string) => {
	const id = String(nodeId || '').trim()
	if (!id) return null
	for (const layer of layers) {
		const n = findNode(layer.nodeTree, id)
		if (!n) continue
		return n.category === 'user' ? (n.transform ?? null) : null
	}
	return null
}

export type UserNodeWithWorldHit = {
	layerId: string
	node: VideoSceneTreeNode
	parentWorld: { x: number; y: number }
	world: { x: number; y: number }
}

export const findUserNodeWithWorldInLayers = (layers: VideoSceneLayer[], nodeId: string): UserNodeWithWorldHit | null => {
	const id = String(nodeId || '').trim()
	if (!id) return null
	for (const layer of layers) {
		const hit = findWorldPos(layer.nodeTree, id)
		if (!hit) continue
		if (hit.node?.category !== 'user' || !hit.node?.transform) continue
		return { layerId: layer.id, node: hit.node, parentWorld: hit.parentWorld, world: hit.world }
	}
	return null
}
