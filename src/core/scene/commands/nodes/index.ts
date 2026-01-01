import { NodeBase, type NodeBaseDTO, type NodeType, upgradeNodeType } from '../../nodesType'
import { collectAllNames, findLayer, findNode, makeUniqueName } from '../../tree'
import type { VideoSceneLayer, VideoSceneNodeTransform, VideoSceneTreeNode, VideoSceneUserNodeType } from '../../types'

import type { NodePropsPatch, NodeTransformPatch } from './types'
import type { SelectionPatch } from '../selection/types'
import { setSingleSelection } from '../selection'
import { genId } from './utils'
import { computeTextAutoSize } from './textAutoSize'

export type { AddRenderableNodeArgs, AddRenderableNodeResult, NodePropsPatch, NodeTransformPatch } from './types'

export const createRenderableNode = (type: VideoSceneUserNodeType): VideoSceneTreeNode => {
	const id = genId(type)
	const base: NodeBaseDTO = NodeBase.create(
		id,
		type === 'base'
			? 'Node'
			: type === 'rect'
				? 'Rect'
				: type === 'text'
					? 'Text'
					: type === 'image'
						? 'Image'
						: 'Line'
	)
	const upgraded = upgradeNodeType(base, type as unknown as NodeType)
	return {
		id: upgraded.id,
		createdAt: Date.now(),
		name: upgraded.name,
		category: 'user',
		userType: upgraded.type as unknown as VideoSceneUserNodeType,
		transform: {
			x: upgraded.transform.x,
			y: upgraded.transform.y,
			width: upgraded.transform.width,
			height: upgraded.transform.height,
			rotation: upgraded.transform.rotation,
			opacity: upgraded.transform.opacity,
		},
		props: upgraded.props ?? {},
	}
}

export const addRenderableNodeToLayer = (args: {
	state: { layers: VideoSceneLayer[]; activeLayerId: string }
	layerId: string
	type: VideoSceneUserNodeType
	parentId?: string | null
}): { node: VideoSceneTreeNode; selection: SelectionPatch } | null => {
	const layer = findLayer(args.state, args.layerId)
	if (!layer) return null
	const node = createRenderableNode(args.type)

	const existingNames = collectAllNames(layer.nodeTree)
	node.name = makeUniqueName(existingNames, node.name)

	const root = findNode(layer.nodeTree, args.parentId ?? 'root')
	if (root) {
		if (!root.children) root.children = []
		root.children.push(node)
	} else {
		layer.nodeTree.push(node)
	}

	return { node, selection: setSingleSelection(node.id) }
}

const ensureUniqueNamesForTree = (root: VideoSceneTreeNode, existingNames: string[]) => {
	const desired = String(root.name ?? '').trim() || 'Node'
	root.name = makeUniqueName(existingNames, desired)
	existingNames.push(root.name)
	if (root.children?.length) {
		for (const c of root.children) ensureUniqueNamesForTree(c, existingNames)
	}
}

export const addNodeTreeToLayer = (args: {
	state: { layers: VideoSceneLayer[]; activeLayerId: string }
	layerId: string
	node: VideoSceneTreeNode
	parentId?: string | null
}): { node: VideoSceneTreeNode; selection: SelectionPatch } | null => {
	const layer = findLayer(args.state, args.layerId)
	if (!layer) return null
	const node = args.node

	const normalizeNodeTreeInPlace = (n: any) => {
		if (!n || typeof n !== 'object') return
		if (typeof n.id !== 'string' || !n.id.trim()) n.id = genId('node')
		if (typeof n.createdAt !== 'number' || !Number.isFinite(n.createdAt)) n.createdAt = Date.now()
		if (typeof n.name !== 'string' || !n.name.trim()) n.name = 'Node'
		// Ensure category is present (default to user because addNodeTreeToLayer is mainly for renderables).
		if (n.category !== 'user' && n.category !== 'project') n.category = 'user'

		if (n.category === 'user') {
			// Match createRenderableNode() output shape.
			if (!n.transform || typeof n.transform !== 'object') {
				n.transform = { x: 0, y: 0, width: 200, height: 120, rotation: 0, opacity: 1 }
			} else {
				const t = n.transform as any
				n.transform = {
					x: typeof t.x === 'number' && Number.isFinite(t.x) ? t.x : 0,
					y: typeof t.y === 'number' && Number.isFinite(t.y) ? t.y : 0,
					width: typeof t.width === 'number' && Number.isFinite(t.width) ? Math.max(1, t.width) : 200,
					height: typeof t.height === 'number' && Number.isFinite(t.height) ? Math.max(1, t.height) : 120,
					rotation: typeof t.rotation === 'number' && Number.isFinite(t.rotation) ? t.rotation : 0,
					opacity:
						typeof t.opacity === 'number' && Number.isFinite(t.opacity) ? Math.max(0, Math.min(1, t.opacity)) : 1,
				}
			}
			if (!n.props || typeof n.props !== 'object' || Array.isArray(n.props)) n.props = {}

			// Text autosize: always derive w/h from text + font on insertion.
			const t = String((n as any).userType ?? (n as any).type ?? '')
			if (t === 'text') {
				const size = computeTextAutoSize(n.props ?? {})
				if (size) {
					n.transform.width = size.width
					n.transform.height = size.height
				}
			}
		}

		if (Array.isArray(n.children)) {
			for (const c of n.children) normalizeNodeTreeInPlace(c)
		} else if (n.children !== undefined) {
			delete n.children
		}
	}

	normalizeNodeTreeInPlace(node)

	const existingNames = collectAllNames(layer.nodeTree)
	ensureUniqueNamesForTree(node, existingNames)

	const root = findNode(layer.nodeTree, args.parentId ?? 'root')
	if (root) {
		if (!root.children) root.children = []
		root.children.push(node)
	} else {
		layer.nodeTree.push(node)
	}

	return { node, selection: setSingleSelection(node.id) }
}

const normalizeTransformPatch = (prev: VideoSceneNodeTransform, patch: NodeTransformPatch): VideoSceneNodeTransform => {
	const x = typeof patch.x === 'number' && Number.isFinite(patch.x) ? patch.x : prev.x
	const y = typeof patch.y === 'number' && Number.isFinite(patch.y) ? patch.y : prev.y
	const width = typeof patch.width === 'number' && Number.isFinite(patch.width) ? Math.max(1, patch.width) : prev.width
	const height = typeof patch.height === 'number' && Number.isFinite(patch.height) ? Math.max(1, patch.height) : prev.height
	const rotation = typeof patch.rotation === 'number' && Number.isFinite(patch.rotation) ? patch.rotation : prev.rotation
	const opacity =
		typeof patch.opacity === 'number' && Number.isFinite(patch.opacity) ? Math.max(0, Math.min(1, patch.opacity)) : prev.opacity
	return { x, y, width, height, rotation, opacity }
}

export const updateUserNodeTransform = (layer: VideoSceneLayer, nodeId: string, patch: NodeTransformPatch): boolean => {
	const node = findNode(layer.nodeTree, nodeId)
	if (!node || node.category !== 'user') return false
	const prev: VideoSceneNodeTransform = node.transform ?? { x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1 }
	node.transform = normalizeTransformPatch(prev, patch)
	return true
}

export const updateNodeName = (layer: VideoSceneLayer, nodeId: string, name: string): boolean => {
	const node = findNode(layer.nodeTree, nodeId)
	if (!node) return false
	node.name = String(name ?? '')
	return true
}

export const updateUserNodeProps = (layer: VideoSceneLayer, nodeId: string, patch: NodePropsPatch): boolean => {
	const node = findNode(layer.nodeTree, nodeId)
	if (!node || node.category !== 'user') return false
	if (!node.props) node.props = {}
	Object.assign(node.props, patch)

	// Text autosize: any time text/font changes, recompute width/height.
	if (String(node.userType ?? '') === 'text' && node.transform) {
		const hasTextChange = Object.prototype.hasOwnProperty.call(patch, 'textContent')
		const hasFontChange = Object.prototype.hasOwnProperty.call(patch, 'fontSize') || Object.prototype.hasOwnProperty.call(patch, 'fontStyle')
		const hasAlignChange = Object.prototype.hasOwnProperty.call(patch, 'textAlign')
		if (hasTextChange || hasFontChange || hasAlignChange) {
			const size = computeTextAutoSize(node.props as any)
			if (size) {
				node.transform.width = size.width
				node.transform.height = size.height
			}
		}
	}
	return true
}

export const setUserNodeType = (layer: VideoSceneLayer, nodeId: string, type: VideoSceneUserNodeType): boolean => {
	const node = findNode(layer.nodeTree, nodeId)
	if (!node || node.category !== 'user') return false
	const current: NodeBaseDTO = NodeBase.normalize({
		id: node.id,
		name: node.name,
		type: (node.userType ?? 'base') as unknown as NodeType,
		transform: {
			x: node.transform?.x ?? 0,
			y: node.transform?.y ?? 0,
			width: node.transform?.width ?? 200,
			height: node.transform?.height ?? 120,
			rotation: node.transform?.rotation ?? 0,
			opacity: node.transform?.opacity ?? 1,
		},
		props: node.props ?? {},
	})
	const upgraded = upgradeNodeType(current, type as unknown as NodeType)
	node.userType = upgraded.type as unknown as VideoSceneUserNodeType
	node.props = upgraded.props ?? {}
	if (!node.transform) node.transform = { x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1 }
	node.transform.width = upgraded.transform.width
	node.transform.height = upgraded.transform.height
	node.transform.rotation = upgraded.transform.rotation
	node.transform.opacity = upgraded.transform.opacity
	if (type === 'text') {
		const size = computeTextAutoSize(node.props as any)
		if (size) {
			node.transform.width = size.width
			node.transform.height = size.height
		}
	}
	return true
}
