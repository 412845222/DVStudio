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
		if (!targetParentId) return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
		if (targetParentId === 'root') return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
		const r = findWorldPos(layer.nodeTree, targetParentId)
		return r?.world ?? { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
	})()

	const moved = detachNode(layer.nodeTree, nodeId)
	if (!moved) return false

	if (before?.node?.transform && moved.transform) {
		const psx = Math.max(1e-6, Number(targetParentWorld.scaleX ?? 1))
		const psy = Math.max(1e-6, Number(targetParentWorld.scaleY ?? 1))
		const prot = Number(targetParentWorld.rotation ?? 0) || 0
		const cos = Math.cos(-prot)
		const sin = Math.sin(-prot)
		const wx = before.world.x - targetParentWorld.x
		const wy = before.world.y - targetParentWorld.y
		const rx = wx * cos - wy * sin
		const ry = wx * sin + wy * cos
		moved.transform = {
			...moved.transform,
			x: rx / psx,
			y: ry / psy
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
