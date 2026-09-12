import type { WorkflowAnchorSpec, WorkflowNode, WorkflowState } from '../../types'

export type CanonicalAnchorMediaType = 'image' | 'video' | 'text' | 'model3d' | 'audio'
export type AnchorKind = 'flow' | 'resource' | 'meta' | 'generic' | CanonicalAnchorMediaType

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
	if (toType === 'text')
		return (
			fromType === 'text' || fromType === 'image' || fromType === 'video' || fromType === 'audio'
		)
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
	if (toType === 'text') return false
	// video节点的resource输出可以连接到image节点的resource输入（用于截图等场景）
	if (fromType === 'video') return toType !== 'video' && toType !== 'image'
	return fromType === 'audio'
}

const looksLikeModelAnchor = (anchorId: string) => /(^|[-_])model(3d)?($|[-_])|3d/i.test(anchorId)
const looksLikeResourceAnchor = (anchorId: string) => /(^|[-_])resource($|[-_])/i.test(anchorId)

export const normalizeAnchorMediaType = (
	mediaType: unknown,
	context: AnchorMediaContext = {}
): WorkflowAnchorSpec['mediaType'] | undefined => {
	const raw = typeof mediaType === 'string' ? mediaType.trim().toLowerCase() : ''

	const nodeType = normalizeNodeType(context.node, context.nodeType)
	const anchorId = String(context.anchorId ?? '')
		.trim()
		.toLowerCase()

	// If explicit mediaType is provided (and not 'generic'), use it directly
	if (raw && raw !== 'generic') {
		if (
			raw === 'image' ||
			raw === 'video' ||
			raw === 'text' ||
			raw === 'flow' ||
			raw === 'model3d' ||
			raw === 'audio' ||
			raw === 'meta' ||
			raw === 'resource'
		) {
			return raw
		}
		return undefined
	}

	// For 'generic' or unspecified mediaType, infer from context
	if (looksLikeModelAnchor(anchorId) || nodeType === 'model3d' || nodeType === 'meshy') {
		return 'model3d'
	}
	if (looksLikeResourceAnchor(anchorId)) {
		return 'resource'
	}
	if (raw === 'generic') {
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
	if (mediaType === 'resource') return 'resource'
	if (mediaType === 'generic') {
		// generic锚点根据节点类型和锚点ID判断，保持多模态兼容性
		const nodeType = normalizeNodeType(node)
		// image节点的in-0是多模态输入，可以接受多种类型，不默认返回resource
		if (nodeType === 'image' && direction === 'in') return 'generic'
		if (nodeType === 'blender' && anchorId === 'in-0') return 'generic'
		if (nodeType === 'text' && anchorId === 'in-0') return 'generic'
		if (nodeType === 'comfyui' && anchorId === 'in-0') return 'generic'
		return 'generic'
	}

	// 对于video节点的in锚点，保持原有向后兼容（video节点仍有in-image/in-video等锚点）
	if (node.type === 'video' && direction === 'in') {
		if (anchorId === 'in-image') return 'image'
		if (anchorId === 'in-video') return 'video'
		if (anchorId === 'in-text') return 'text'
		return 'resource'
	}

	// 对于blender节点的in-resource锚点
	if (node.type === 'blender' && direction === 'in' && anchorId === 'in-resource') {
		return 'resource'
	}

	if (node.type === 'text' && direction === 'out') return 'text'
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

	// Get anchor specs
	const fromAnchor = fromNode?.outputs?.find((a) => a.id === fromAnchorId)
	const toAnchor = toNode?.inputs?.find((a) => a.id === toAnchorId)

	// generic锚点（多模态输入）需要检查acceptedMediaTypes或已知的多模态节点
	const fromType = normalizeNodeType(fromNode)
	const toType = normalizeNodeType(toNode)
	const isGenericTarget = toKind === 'generic'
	const isGenericSource = fromKind === 'generic'

	if (isGenericTarget) {
		// Check if the target anchor explicitly accepts this media type via acceptedMediaTypes
		const acceptedMediaTypes = toAnchor?.acceptedMediaTypes
		if (
			Array.isArray(acceptedMediaTypes) &&
			['image', 'text', 'video', 'audio', 'model3d', 'resource'].includes(fromKind) &&
			acceptedMediaTypes.includes(fromKind as CanonicalAnchorMediaType | 'resource')
		) {
			return true
		}
		// Known multi-modal input anchors that accept all media types
		// FX6: 修复 ComfyUI 锚点 ID 'in'（不是 'in-0'）的 fallback 匹配
		const isKnownMultiModalInput =
			(toType === 'image' && toAnchorId === 'in-0') ||
			(toType === 'blender' && toAnchorId === 'in-0') ||
			(toType === 'text' && toAnchorId === 'in-0') ||
			(toType === 'comfyui' && (toAnchorId === 'in' || toAnchorId === 'in-0'))
		if (isKnownMultiModalInput) {
			return true
		}
		// Generic targets without explicit acceptedMediaTypes should NOT accept arbitrary connections
		return false
	}
	if (isGenericSource) {
		// 源是generic锚点（如blender out-0），根据下游锚点类型判断
		if (
			toKind === 'text' ||
			toKind === 'image' ||
			toKind === 'model3d' ||
			toKind === 'video' ||
			toKind === 'audio'
		) {
			return true
		}
	}

	// Blender 节点：单锚点兼容 text/image/model3d（已通过generic逻辑处理，保留向后兼容）
	if (toType === 'blender' && toAnchorId === 'in-0' && fromKind === 'text') {
		return true
	}
	if (
		fromType === 'blender' &&
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
	if (
		toType === 'text' &&
		toAnchorId === 'in-0' &&
		(fromKind === 'model3d' || fromKind === 'resource')
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
	if (kind === 'generic') return 'generic'
	return 'unknown'
}

export const findBestInputAnchorForOutput = (
	nodesById: WorkflowState['nodesById'],
	fromNodeId: string,
	fromAnchorId: string,
	toNodeId: string
): string | null => {
	const fromNode = nodesById[fromNodeId]
	const toNode = nodesById[toNodeId]
	if (!fromNode || !toNode) return null

	const fromAnchor = fromNode.outputs?.find((a) => a.id === fromAnchorId)
	if (!fromAnchor) return null

	const fromMediaType = normalizeAnchorMediaType(fromAnchor.mediaType, {
		node: fromNode,
		anchorId: fromAnchorId
	})
	if (!fromMediaType) return null

	const inputAnchors = toNode.inputs || []
	if (inputAnchors.length === 0) return null

	const linkableAnchors = inputAnchors.filter((input) =>
		canLinkAnchors(nodesById, fromNodeId, fromAnchorId, toNodeId, input.id)
	)
	if (linkableAnchors.length === 0) return null

	const preferMultiInput = (anchors: WorkflowAnchorSpec[]) => {
		const multiInput = anchors.find((a) => a.multiInput)
		return multiInput ?? anchors[0]
	}

	const isCanonicalMediaType = (t: unknown): t is CanonicalAnchorMediaType =>
		t === 'image' || t === 'video' || t === 'text' || t === 'model3d' || t === 'audio'

	// 场景节点专属语义匹配：根据节点类型优先选择语义对应的输入锚点
	const fromType = normalizeNodeType(fromNode)
	const toType = normalizeNodeType(toNode)
	if (fromMediaType === 'text') {
		// scene-layout → scene-decompose：优先匹配in-json（场景JSON输入）
		if (fromType === 'scene-layout' && toType === 'scene-decompose') {
			const semanticMatch = linkableAnchors.find((a) => a.id === 'in-json')
			if (semanticMatch) return semanticMatch.id
		}
		// scene-layout → unreal-export：优先匹配in-layout-json（布局JSON输入）
		if (fromType === 'scene-layout' && toType === 'unreal-export') {
			const semanticMatch = linkableAnchors.find((a) => a.id === 'in-layout-json')
			if (semanticMatch) return semanticMatch.id
		}
		// scene-layout → director-console：优先匹配in-json（布局JSON输入）
		if (fromType === 'scene-layout' && toType === 'director-console') {
			const semanticMatch = linkableAnchors.find((a) => a.id === 'in-json')
			if (semanticMatch) return semanticMatch.id
		}
		// scene-understanding → scene-layout：优先匹配in-json（布局JSON输入）
		if (fromType === 'scene-understanding' && toType === 'scene-layout') {
			const semanticMatch = linkableAnchors.find((a) => a.id === 'in-json')
			if (semanticMatch) return semanticMatch.id
		}
		// scene-understanding(灯光模式) → unreal-export：优先匹配in-lighting-json
		if (fromType === 'scene-understanding' && toType === 'unreal-export') {
			const isLightingMode = fromNode.sceneUnderstandingSettings?.mode === 'scene-lighting'
			if (isLightingMode) {
				const lightingMatch = linkableAnchors.find((a) => a.id === 'in-lighting-json')
				if (lightingMatch) return lightingMatch.id
			}
			// 非灯光模式默认连布局JSON
			const layoutMatch = linkableAnchors.find((a) => a.id === 'in-layout-json')
			if (layoutMatch) return layoutMatch.id
		}
		// scene-decompose → 下游text节点：out-0输出，默认匹配
	}

	const exactMatches = linkableAnchors.filter((input) => {
		const inputMediaType = normalizeAnchorMediaType(input.mediaType, {
			node: toNode,
			anchorId: input.id
		})
		return inputMediaType === fromMediaType
	})
	if (exactMatches.length > 0) {
		return preferMultiInput(exactMatches).id
	}

	if (isCanonicalMediaType(fromMediaType)) {
		const genericCompatible = linkableAnchors.filter((input) => {
			if (input.mediaType !== 'generic') return false
			const accepted = input.acceptedMediaTypes
			return Array.isArray(accepted) && accepted.includes(fromMediaType)
		})
		if (genericCompatible.length > 0) {
			return preferMultiInput(genericCompatible).id
		}
	}

	return preferMultiInput(linkableAnchors).id
}
