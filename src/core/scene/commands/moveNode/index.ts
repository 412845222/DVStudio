import { detachNode, findNode, findWorldPos, isDescendant } from '../../tree'
import type { MoveNodeArgs } from './types'

export type { MoveNodeArgs } from './types'

export const moveNodeInLayer = (args: MoveNodeArgs): boolean => {
	const { layer } = args
	const nodeId = String(args.nodeId || '').trim()
	if (!nodeId) return false

	const targetParentId = args.targetParentId ? String(args.targetParentId).trim() : null
	if (targetParentId && targetParentId === nodeId) return false
	if (targetParentId && isDescendant(layer.nodeTree, nodeId, targetParentId)) return false

	const before = findWorldPos(layer.nodeTree, nodeId)
	const targetParentWorld = (() => {
		if (!targetParentId) return { x: 0, y: 0 }
		if (targetParentId === 'root') return { x: 0, y: 0 }
		const r = findWorldPos(layer.nodeTree, targetParentId)
		return r?.world ?? { x: 0, y: 0 }
	})()

	const moved = detachNode(layer.nodeTree, nodeId)
	if (!moved) return false

	if (before?.node?.transform && moved.transform) {
		moved.transform = {
			...moved.transform,
			x: before.world.x - targetParentWorld.x,
			y: before.world.y - targetParentWorld.y,
		}
	}

	if (targetParentId) {
		const parent = findNode(layer.nodeTree, targetParentId)
		if (!parent) {
			layer.nodeTree.push(moved)
			return true
		}
		if (!parent.children) parent.children = []
		const idx =
			typeof args.targetIndex === 'number'
				? Math.max(0, Math.min(parent.children.length, Math.floor(args.targetIndex)))
				: parent.children.length
		parent.children.splice(idx, 0, moved)
		return true
	}

	const rootIdx =
		typeof args.targetIndex === 'number'
			? Math.max(0, Math.min(layer.nodeTree.length, Math.floor(args.targetIndex)))
			: layer.nodeTree.length
	layer.nodeTree.splice(rootIdx, 0, moved)
	return true
}
