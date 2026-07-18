import { NodeBase, type NodeBaseDTO, type NodeType, upgradeNodeType } from '../../nodesType'
import { normalizeLineLocalPoints } from '../../geometry'
import { collectAllNames, findLayer, findNode, makeUniqueName } from '../../tree'
import type {
	VideoSceneLayer,
	VideoSceneNodeTransform,
	VideoSceneTreeNode,
	VideoSceneUserNodeType
} from '../../types'
import { normalizeTextNodeProps, type TextNodePropsInput } from '../../nodesType/TextNode'

import type { NodePropsPatch, NodeTransformPatch } from './types'
import type { SelectionPatch } from '../selection/types'
import { setSingleSelection } from '../selection'
import { genId } from './utils'
import { computeTextAutoSize } from './textAutoSize'

export type {
	AddRenderableNodeArgs,
	AddRenderableNodeResult,
	NodePropsPatch,
	NodeTransformPatch
} from './types'

type LegacyTransform = {
	x?: unknown
	y?: unknown
	scaleX?: unknown
	scaleY?: unknown
	scale?: unknown
	pivotX?: unknown
	pivotY?: unknown
	width?: unknown
	height?: unknown
	rotation?: unknown
	opacity?: unknown
}

type LegacyNode = {
	id?: unknown
	createdAt?: unknown
	name?: unknown
	category?: unknown
	userType?: unknown
	type?: unknown
	transform?: LegacyTransform | unknown
	props?: unknown
	children?: unknown
}

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
						: type === 'video'
							? 'Video'
							: 'Line'
	)
	const upgraded = upgradeNodeType(base, type as unknown as NodeType)
	const tr = upgraded.transform
	return {
		id: upgraded.id,
		createdAt: Date.now(),
		name: upgraded.name,
		category: 'user',
		userType: upgraded.type as unknown as VideoSceneUserNodeType,
		transform: {
			x: tr.x,
			y: tr.y,
			scaleX: tr.scaleX,
			scaleY: tr.scaleY,
			pivotX: tr.pivotX,
			pivotY: tr.pivotY,
			width: tr.width,
			height: tr.height,
			rotation: tr.rotation,
			opacity: tr.opacity
		},
		props: upgraded.props ?? {}
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

	const normalizeNodeTreeInPlace = (n: LegacyNode) => {
		const clampScale = (v: unknown, fallback = 1) => {
			const x = Number(v)
			if (!Number.isFinite(x)) return fallback
			return Math.max(0, Math.min(100, x))
		}
		if (!n || typeof n !== 'object') return
		if (typeof n.id !== 'string' || !n.id.trim()) (n as Record<string, unknown>).id = genId('node')
		if (typeof n.createdAt !== 'number' || !Number.isFinite(n.createdAt as number))
			(n as Record<string, unknown>).createdAt = Date.now()
		if (typeof n.name !== 'string' || !n.name.trim()) (n as Record<string, unknown>).name = 'Node'
		if (n.category !== 'user' && n.category !== 'project')
			(n as Record<string, unknown>).category = 'user'

		if (n.category === 'user') {
			if (!n.transform || typeof n.transform !== 'object') {
				;(n as Record<string, unknown>).transform = {
					x: 0,
					y: 0,
					scaleX: 1,
					scaleY: 1,
					pivotX: 0.5,
					pivotY: 0.5,
					width: 200,
					height: 120,
					rotation: 0,
					opacity: 1
				}
			} else {
				const t = n.transform as LegacyTransform
				const legacyScale = clampScale(t.scale, 1)
				const sx = clampScale(t.scaleX, legacyScale)
				const sy = clampScale(t.scaleY, legacyScale)
				;(n as Record<string, unknown>).transform = {
					x: typeof t.x === 'number' && Number.isFinite(t.x) ? t.x : 0,
					y: typeof t.y === 'number' && Number.isFinite(t.y) ? t.y : 0,
					scaleX: sx,
					scaleY: sy,
					scale: legacyScale,
					pivotX:
						typeof t.pivotX === 'number' && Number.isFinite(t.pivotX)
							? Math.max(0, Math.min(1, t.pivotX))
							: 0.5,
					pivotY:
						typeof t.pivotY === 'number' && Number.isFinite(t.pivotY)
							? Math.max(0, Math.min(1, t.pivotY))
							: 0.5,
					width:
						typeof t.width === 'number' && Number.isFinite(t.width) ? Math.max(1, t.width) : 200,
					height:
						typeof t.height === 'number' && Number.isFinite(t.height) ? Math.max(1, t.height) : 120,
					rotation: typeof t.rotation === 'number' && Number.isFinite(t.rotation) ? t.rotation : 0,
					opacity:
						typeof t.opacity === 'number' && Number.isFinite(t.opacity)
							? Math.max(0, Math.min(1, t.opacity))
							: 1
				}
			}
			if (!n.props || typeof n.props !== 'object' || Array.isArray(n.props))
				(n as Record<string, unknown>).props = {}

			const userTypeStr = String(n.userType ?? n.type ?? '')
			if (userTypeStr === 'text') {
				const normalizedProps = normalizeTextNodeProps((n.props ?? {}) as TextNodePropsInput)
				;(n as Record<string, unknown>).props = normalizedProps
				const size = computeTextAutoSize(normalizedProps)
				if (size && n.transform && typeof n.transform === 'object') {
					;(n.transform as VideoSceneNodeTransform).width = size.width
					;(n.transform as VideoSceneNodeTransform).height = size.height
				}
			} else if (userTypeStr === 'line') {
				const propsRecord = n.props as Record<string, unknown>
				const tr = n.transform as VideoSceneNodeTransform | undefined
				Object.assign(
					n.props as object,
					normalizeLineLocalPoints({
						props: propsRecord,
						width: tr?.width ?? 200,
						height: tr?.height ?? 120
					})
				)
			}
		}

		if (Array.isArray(n.children)) {
			for (const c of n.children as LegacyNode[]) normalizeNodeTreeInPlace(c)
		} else if (n.children !== undefined) {
			delete (n as Record<string, unknown>).children
		}
	}

	normalizeNodeTreeInPlace(node as unknown as LegacyNode)

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

const normalizeTransformPatch = (
	prev: VideoSceneNodeTransform,
	patch: NodeTransformPatch
): VideoSceneNodeTransform => {
	const clampScale = (v: unknown, fallback = 1) => {
		const x = Number(v)
		if (!Number.isFinite(x)) return fallback
		return Math.max(0, Math.min(100, x))
	}
	const x = typeof patch.x === 'number' && Number.isFinite(patch.x) ? patch.x : prev.x
	const y = typeof patch.y === 'number' && Number.isFinite(patch.y) ? patch.y : prev.y
	const legacyScale = clampScale(patch.scale, prev.scale ?? 1)
	const scaleX =
		typeof patch.scaleX === 'number' && Number.isFinite(patch.scaleX)
			? clampScale(patch.scaleX, 1)
			: (prev.scaleX ?? legacyScale)
	const scaleY =
		typeof patch.scaleY === 'number' && Number.isFinite(patch.scaleY)
			? clampScale(patch.scaleY, 1)
			: (prev.scaleY ?? legacyScale)
	const pivotX =
		typeof patch.pivotX === 'number' && Number.isFinite(patch.pivotX)
			? Math.max(0, Math.min(1, patch.pivotX))
			: prev.pivotX
	const pivotY =
		typeof patch.pivotY === 'number' && Number.isFinite(patch.pivotY)
			? Math.max(0, Math.min(1, patch.pivotY))
			: prev.pivotY
	const width =
		typeof patch.width === 'number' && Number.isFinite(patch.width)
			? Math.max(1, patch.width)
			: prev.width
	const height =
		typeof patch.height === 'number' && Number.isFinite(patch.height)
			? Math.max(1, patch.height)
			: prev.height
	const rotation =
		typeof patch.rotation === 'number' && Number.isFinite(patch.rotation)
			? patch.rotation
			: prev.rotation
	const opacity =
		typeof patch.opacity === 'number' && Number.isFinite(patch.opacity)
			? Math.max(0, Math.min(1, patch.opacity))
			: prev.opacity
	return {
		x,
		y,
		scaleX,
		scaleY,
		scale: legacyScale,
		pivotX,
		pivotY,
		width,
		height,
		rotation,
		opacity
	}
}

export const updateUserNodeTransform = (
	layer: VideoSceneLayer,
	nodeId: string,
	patch: NodeTransformPatch
): boolean => {
	const node = findNode(layer.nodeTree, nodeId)
	if (!node || node.category !== 'user') return false
	const prev: VideoSceneNodeTransform = node.transform ?? {
		x: 0,
		y: 0,
		scaleX: 1,
		scaleY: 1,
		pivotX: 0.5,
		pivotY: 0.5,
		width: 10,
		height: 10,
		rotation: 0,
		opacity: 1
	}
	node.transform = normalizeTransformPatch(prev, patch)
	return true
}

export const updateNodeName = (layer: VideoSceneLayer, nodeId: string, name: string): boolean => {
	const node = findNode(layer.nodeTree, nodeId)
	if (!node) return false
	node.name = String(name ?? '')
	return true
}

export const updateUserNodeProps = (
	layer: VideoSceneLayer,
	nodeId: string,
	patch: NodePropsPatch
): boolean => {
	const node = findNode(layer.nodeTree, nodeId)
	if (!node || node.category !== 'user') return false
	if (!node.props) node.props = {}
	Object.assign(node.props, patch)

	if (String(node.userType ?? '') === 'text' && node.transform) {
		const normalizedProps = normalizeTextNodeProps(node.props)
		node.props = normalizedProps
		const hasTextChange = Object.prototype.hasOwnProperty.call(patch, 'textContent')
		const hasFontChange =
			Object.prototype.hasOwnProperty.call(patch, 'fontSize') ||
			Object.prototype.hasOwnProperty.call(patch, 'fontStyle')
		const hasAlignChange = Object.prototype.hasOwnProperty.call(patch, 'textAlign')
		if (hasTextChange || hasFontChange || hasAlignChange) {
			const size = computeTextAutoSize(normalizedProps)
			if (size) {
				node.transform.width = size.width
				node.transform.height = size.height
			}
		}
	}
	return true
}

export const setUserNodeType = (
	layer: VideoSceneLayer,
	nodeId: string,
	type: VideoSceneUserNodeType
): boolean => {
	const node = findNode(layer.nodeTree, nodeId)
	if (!node || node.category !== 'user') return false
	const nodeTr = node.transform
	const current: NodeBaseDTO = NodeBase.normalize({
		id: node.id,
		name: node.name,
		type: (node.userType ?? 'base') as unknown as NodeType,
		transform: {
			x: nodeTr?.x ?? 0,
			y: nodeTr?.y ?? 0,
			scaleX: nodeTr?.scaleX ?? nodeTr?.scale ?? 1,
			scaleY: nodeTr?.scaleY ?? nodeTr?.scale ?? 1,
			pivotX: nodeTr?.pivotX ?? 0.5,
			pivotY: nodeTr?.pivotY ?? 0.5,
			width: nodeTr?.width ?? 200,
			height: nodeTr?.height ?? 120,
			rotation: nodeTr?.rotation ?? 0,
			opacity: nodeTr?.opacity ?? 1
		},
		props: node.props ?? {}
	})
	const upgraded = upgradeNodeType(current, type as unknown as NodeType)
	node.userType = upgraded.type as unknown as VideoSceneUserNodeType
	node.props = upgraded.props ?? {}
	const tr: VideoSceneNodeTransform = (node.transform ??= {
		x: 0,
		y: 0,
		scaleX: 1,
		scaleY: 1,
		pivotX: 0.5,
		pivotY: 0.5,
		width: 10,
		height: 10,
		rotation: 0,
		opacity: 1
	})
	const ut = upgraded.transform
	const legacyScale = ut.scale ?? tr.scale ?? 1
	tr.scaleX = ut.scaleX ?? legacyScale
	tr.scaleY = ut.scaleY ?? legacyScale
	tr.scale = legacyScale
	tr.width = ut.width
	tr.height = ut.height
	tr.rotation = ut.rotation
	tr.opacity = ut.opacity
	if (type === 'text') {
		const size = computeTextAutoSize(node.props)
		if (size) {
			tr.width = size.width
			tr.height = size.height
		}
	}
	return true
}
