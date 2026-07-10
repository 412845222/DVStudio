import type { WorkflowAnchorSpec, WorkflowNode, WorkflowState } from '../../types'

export type CanonicalAnchorMediaType = 'image' | 'video' | 'text' | 'model3d' | 'audio'
export type AnchorKind = 'flow' | 'resource' | 'meta' | CanonicalAnchorMediaType

const BASIC_MEDIA_NODE_TYPES = new Set<string>(['text', 'image', 'video', 'audio'])

type AnchorMediaContext = {
	node?: WorkflowNode
	nodeType?: string
	anchorId?: string
}

const normalizeNodeType = (node: WorkflowNode | undefined, fallback?: string) =>
	String(node?.type ?? fallback ?? '')
		.trim()
		.toLowerCase()

const isBasicMediaNode = (node: WorkflowNode | undefined) =>
	BASIC_MEDIA_NODE_TYPES.has(normalizeNodeType(node))

const canLinkBasicMediaNodes = (
	fromNode: WorkflowNode | undefined,
	toNode: WorkflowNode | undefined
) => {
	if (!isBasicMediaNode(fromNode) || !isBasicMediaNode(toNode)) return false
	const fromType = normalizeNodeType(fromNode)
	const toType = normalizeNodeType(toNode)
	if (toType === 'video') return fromType === 'image' || fromType === 'video' || fromType === 'text'
	return fromType === 'text' || fromType === 'image'
}

const shouldRejectBasicMediaNodes = (
	fromNode: WorkflowNode | undefined,
	toNode: WorkflowNode | undefined
) => {
	if (!isBasicMediaNode(fromNode) || !isBasicMediaNode(toNode)) return false
	const fromType = normalizeNodeType(fromNode)
	const toType = normalizeNodeType(toNode)
	if (toType === 'video') return fromType !== 'image' && fromType !== 'video' && fromType !== 'text'
	if (fromType === 'video') return toType !== 'video'
	return fromType === 'audio'
}

const looksLikeModelAnchor = (anchorId: string) => /(^|[-_])model(3d)?($|[-_])|3d/i.test(anchorId)

export const normalizeAnchorMediaType = (
	mediaType: unknown,
	context: AnchorMediaContext = {}
): WorkflowAnchorSpec['mediaType'] | undefined => {
	const raw = typeof mediaType === 'string' ? mediaType.trim().toLowerCase() : ''
	if (
		raw === 'image' ||
		raw === 'video' ||
		raw === 'text' ||
		raw === 'flow' ||
		raw === 'model3d' ||
		raw === 'audio' ||
		raw === 'meta'
	) {
		return raw
	}

	const nodeType = normalizeNodeType(context.node, context.nodeType)
	const anchorId = String(context.anchorId ?? '')
		.trim()
		.toLowerCase()
	if (raw === 'generic') {
		if (looksLikeModelAnchor(anchorId) || nodeType === 'model3d' || nodeType === 'meshy')
			return 'model3d'
		return 'generic'
	}
	return undefined
}

export const anchorKind = (
	node: WorkflowNode | undefined,
	anchorId: string,
	direction: 'in' | 'out'
): AnchorKind | null => {
	if (!node) return null

	if (node.type === 'story') {
		if (direction === 'in') return anchorId === 'in-resource' ? 'resource' : 'flow'
		return 'flow'
	}

	const list = direction === 'in' ? node.inputs : node.outputs
	const anchor = Array.isArray(list) ? list.find((a) => a.id === anchorId) : undefined
	const mediaType = normalizeAnchorMediaType(anchor?.mediaType, { node, anchorId })

	if (mediaType === 'image') return 'image'
	if (mediaType === 'video') return 'video'
	if (mediaType === 'text') return 'text'
	if (mediaType === 'flow') return 'flow'
	if (mediaType === 'model3d') return 'model3d'
	if (mediaType === 'audio') return 'audio'
	if (mediaType === 'meta') return 'meta'

	if ((node.type === 'image' || node.type === 'video') && direction === 'in') return 'resource'

	if (node.type === 'text') return 'text'
	if (node.type === 'image') return 'image'
	if (node.type === 'video') return 'video'
	if (node.type === 'model3d') return 'model3d'
	if (node.type === 'audio') return 'audio'

	return 'resource'
}

export const canLinkAnchors = (
	nodesById: WorkflowState['nodesById'],
	fromNodeId: string,
	fromAnchorId: string,
	toNodeId: string,
	toAnchorId: string
) => {
	const fromNode = nodesById[fromNodeId]
	const toNode = nodesById[toNodeId]
	const fromKind = anchorKind(fromNode, fromAnchorId, 'out')
	const toKind = anchorKind(toNode, toAnchorId, 'in')
	if (!fromKind || !toKind) return false
	if (canLinkBasicMediaNodes(fromNode, toNode)) return true
	if (shouldRejectBasicMediaNodes(fromNode, toNode)) return false
	// Blender 节点：单锚点兼容 text/image/model3d（generic 锚点默认接受 image/model3d，此处补充放行 text）
	if (normalizeNodeType(toNode) === 'blender' && toAnchorId === 'in-0' && fromKind === 'text') {
		return true
	}
	if (
		normalizeNodeType(fromNode) === 'blender' &&
		fromAnchorId === 'out-0' &&
		(toKind === 'text' || toKind === 'image' || toKind === 'model3d')
	) {
		return true
	}
	if (fromKind === toKind) return true
	if (
		toKind === 'resource' &&
		(fromKind === 'resource' ||
			fromKind === 'image' ||
			fromKind === 'video' ||
			fromKind === 'model3d' ||
			fromKind === 'audio')
	) {
		return true
	}
	return false
}

export const anchorKindLabel = (kind: AnchorKind | null) => {
	if (kind === 'flow') return 'flow'
	if (kind === 'resource') return 'resource'
	if (kind === 'image') return 'image'
	if (kind === 'video') return 'video'
	if (kind === 'model3d') return 'model3d'
	if (kind === 'audio') return 'audio'
	if (kind === 'text') return 'text'
	if (kind === 'meta') return 'meta'
	return 'unknown'
}
