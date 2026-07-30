import type { WorkflowAnchorSpec, WorkflowNode } from '../../../../aiworkflow/types'

type WorkflowImageInputSource = { url: string; width?: number; height?: number }

type WorkflowImageInputRef = {
	inputAnchorId: string
	fromNodeId: string
	fromAnchorId: string
	fromNode: WorkflowNode
}

const isSceneImageAnchor = (anchorId: string) => /^in-image(?:-\d+)?$/.test(anchorId)

const parseSceneImageAnchorOrder = (anchorId: string) => {
	if (anchorId === 'in-image') return 1
	return Number(String(anchorId).match(/(\d+)/)?.[1] ?? 99)
}

/**
 * 将输入/输出锚点ID映射到对应序号的图像输入锚点ID
 */
const mapAnchorToImageInput = (anchorId: string): string => {
	const id = String(anchorId ?? '').trim()
	if (id === 'in-json' || id === 'in-text' || id === 'in-0' || id.startsWith('out-')) {
		return 'in-image'
	}
	if (id === 'in-image') return 'in-image'
	const match = id.match(/^in-image-(\d+)$/)
	if (match) {
		const idx = Math.max(2, Math.min(4, parseInt(match[1], 10)))
		return `in-image-${idx}`
	}
	return 'in-image'
}

/**
 * 判断是否为场景JSON处理节点
 */
const isSceneJsonNodeType = (nodeType: string): boolean => {
	return nodeType === 'scene-layout' || nodeType === 'scene-understanding' || nodeType === 'scene-decompose'
}

/**
 * 获取场景节点的JSON输入锚点ID
 */
const getSceneNodeJsonAnchor = (nodeType: string): string | null => {
	if (nodeType === 'scene-layout' || nodeType === 'scene-decompose') return 'in-json'
	if (nodeType === 'scene-understanding') return 'in-layout-json'
	return null
}

/**
 * 判断节点是否为直接图像源
 */
const isDirectImageSourceType = (nodeType: string): boolean => {
	return nodeType === 'image' || nodeType === 'video' || nodeType === 'comfyui' || nodeType === 'scene-decompose'
}

export const useAIWorkflowSceneImageInputs = (payload: {
	store: {
		state: {
			nodesById: Record<string, WorkflowNode>
		}
	}
	getFirstIncomingEdge: (nodeId: string, anchorId?: string) => { fromNodeId: string; fromAnchorId?: string } | null | undefined
	connectedImageInputSource: (nodeId: string, inputId: string) => WorkflowImageInputSource | null
}) => {
	/**
	 * 追溯图像输入引用，支持穿透scene-layout/scene-understanding等场景节点
	 */
	const traceImageInputRef = (
		nodeId: string,
		startAnchorId: string,
		fallbackToJsonAnchor: boolean = false,
		depth: number = 0
	): WorkflowImageInputRef | null => {
		if (depth > 10) return null

		let edge = payload.getFirstIncomingEdge(nodeId, String(startAnchorId ?? ''))

		// 如果起始锚点没有入边，且允许回退，则检查JSON锚点
		if (!edge && fallbackToJsonAnchor) {
			const node = payload.store.state.nodesById[nodeId]
			const jsonAnchor = node ? getSceneNodeJsonAnchor(node.type) : null
			if (jsonAnchor && startAnchorId !== jsonAnchor) {
				edge = payload.getFirstIncomingEdge(nodeId, jsonAnchor)
			}
		}

		if (!edge) return null
		let fromNode = payload.store.state.nodesById[edge.fromNodeId]
		if (!fromNode) return null
		let fromAnchorId = String(edge.fromAnchorId ?? '')
		let currentInputAnchorId = String(startAnchorId ?? '')

		const visited = new Set<string>()

		// 穿透场景节点
		while (fromNode && isSceneJsonNodeType(fromNode.type) && !visited.has(`${fromNode.id}:${fromAnchorId}`)) {
			visited.add(`${fromNode.id}:${fromAnchorId}`)

			const targetImageAnchor = mapAnchorToImageInput(fromAnchorId || currentInputAnchorId)

			// 先尝试该场景节点的图像锚点是否有直接连接
			const imageEdge = payload.getFirstIncomingEdge(fromNode.id, targetImageAnchor)
			if (imageEdge) {
				const imageFromNode = payload.store.state.nodesById[imageEdge.fromNodeId]
				if (imageFromNode) {
					// 递归追溯
					const traced = traceImageInputRef(fromNode.id, targetImageAnchor, false, depth + 1)
					if (traced && isDirectImageSourceType(traced.fromNode.type)) {
						return traced
					}
					if (traced) {
						fromNode = traced.fromNode
						fromAnchorId = traced.fromAnchorId
						currentInputAnchorId = traced.inputAnchorId
						continue
					}
				}
			}

			// 沿JSON输入继续向上追溯
			const jsonAnchor = getSceneNodeJsonAnchor(fromNode.type)
			if (!jsonAnchor) break

			const jsonEdge = payload.getFirstIncomingEdge(fromNode.id, jsonAnchor)
			if (!jsonEdge) break

			fromAnchorId = String(jsonEdge.fromAnchorId ?? '')
			const nextFromNode = payload.store.state.nodesById[jsonEdge.fromNodeId]
			if (!nextFromNode) break
			fromNode = nextFromNode
		}

		if (fromNode && isDirectImageSourceType(fromNode.type)) {
			return {
				inputAnchorId: currentInputAnchorId,
				fromNodeId: fromNode.id,
				fromAnchorId,
				fromNode
			}
		}

		return null
	}

	const connectedSceneUnderstandImageInputs = (nodeId: string) => {
		const node = payload.store.state.nodesById[nodeId]
		const anchors: WorkflowAnchorSpec[] = Array.isArray(node?.inputs) ? node.inputs : []
		const sortedAnchors = anchors
			.filter((anchor: WorkflowAnchorSpec) => isSceneImageAnchor(String(anchor?.id ?? '')))
			.sort((a: WorkflowAnchorSpec, b: WorkflowAnchorSpec) => {
				const ai = parseSceneImageAnchorOrder(String(a?.id ?? ''))
				const bi = parseSceneImageAnchorOrder(String(b?.id ?? ''))
				return ai - bi
			})
		const result: WorkflowImageInputSource[] = []
		for (const anchor of sortedAnchors) {
			const source = payload.connectedImageInputSource(nodeId, String(anchor?.id ?? ''))
			if (!source?.url) continue
			result.push(source)
		}
		return result.slice(0, 4)
	}

	const connectedSceneUnderstandImageInputRefs = (nodeId: string) => {
		const node = payload.store.state.nodesById[nodeId]
		const anchors: WorkflowAnchorSpec[] = Array.isArray(node?.inputs) ? node.inputs : []
		return anchors
			.filter((anchor: WorkflowAnchorSpec) => isSceneImageAnchor(String(anchor?.id ?? '')))
			.sort((a: WorkflowAnchorSpec, b: WorkflowAnchorSpec) => {
				const ai = parseSceneImageAnchorOrder(String(a?.id ?? ''))
				const bi = parseSceneImageAnchorOrder(String(b?.id ?? ''))
				return ai - bi
			})
			.map((anchor: WorkflowAnchorSpec) => {
				const inputAnchorId = String(anchor?.id ?? '')
				// 使用追溯逻辑获取穿透后的图像引用
				const isSceneNode = node && isSceneJsonNodeType(node.type)
				const traced = traceImageInputRef(nodeId, inputAnchorId, isSceneNode)
				if (traced) return traced
				// 回退到直接边
				const edge = payload.getFirstIncomingEdge(nodeId, inputAnchorId)
				if (!edge) return null
				const fromNodeId = String(edge.fromNodeId ?? '').trim()
				const fromAnchorId = String(edge.fromAnchorId ?? '').trim()
				const fromNode = payload.store.state.nodesById[fromNodeId]
				if (!fromNode || !fromNodeId || !fromAnchorId) return null
				return {
					inputAnchorId,
					fromNodeId,
					fromAnchorId,
					fromNode
				}
			})
			.filter((item: WorkflowImageInputRef | null): item is WorkflowImageInputRef => Boolean(item))
			.slice(0, 4)
	}

	const connectedSceneDecomposeImageInputs = (nodeId: string) =>
		connectedSceneUnderstandImageInputs(nodeId)

	const connectedSceneDecomposeImageInputRefs = (nodeId: string) =>
		connectedSceneUnderstandImageInputRefs(nodeId)

	const sceneDecomposeImageInputAnchorId = (sourceImageIndex: number) => {
		const normalizedIndex = Math.max(1, Math.min(4, Math.floor(Number(sourceImageIndex) || 1)))
		return normalizedIndex === 1 ? 'in-image' : `in-image-${normalizedIndex}`
	}

	const connectedSceneDecomposeImageInputAt = (nodeId: string, sourceImageIndex: number) => {
		return payload.connectedImageInputSource(
			nodeId,
			sceneDecomposeImageInputAnchorId(sourceImageIndex)
		)
	}

	const connectedSceneDecomposeImageInputRefAt = (nodeId: string, sourceImageIndex: number) => {
		const inputAnchorId = sceneDecomposeImageInputAnchorId(sourceImageIndex)
		// 首先尝试穿透追溯
		const traced = traceImageInputRef(nodeId, inputAnchorId, true)
		if (traced) return traced
		// 回退到直接边
		const edge = payload.getFirstIncomingEdge(nodeId, inputAnchorId)
		if (!edge) return null as WorkflowImageInputRef | null
		const fromNodeId = String(edge.fromNodeId ?? '').trim()
		const fromAnchorId = String(edge.fromAnchorId ?? '').trim()
		const fromNode = payload.store.state.nodesById[fromNodeId]
		if (!fromNode || !fromNodeId || !fromAnchorId) return null
		return {
			inputAnchorId,
			fromNodeId,
			fromAnchorId,
			fromNode
		}
	}

	return {
		connectedSceneUnderstandImageInputs,
		connectedSceneUnderstandImageInputRefs,
		connectedSceneDecomposeImageInputs,
		connectedSceneDecomposeImageInputRefs,
		sceneDecomposeImageInputAnchorId,
		connectedSceneDecomposeImageInputAt,
		connectedSceneDecomposeImageInputRefAt
	}
}
