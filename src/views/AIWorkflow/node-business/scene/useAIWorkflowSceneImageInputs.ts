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

export const useAIWorkflowSceneImageInputs = (payload: {
	store: {
		state: {
			nodesById: Record<string, WorkflowNode>
		}
	}
	getFirstIncomingEdge: (nodeId: string, anchorId?: string) => { fromNodeId: string; fromAnchorId?: string } | null | undefined
	connectedImageInputSource: (nodeId: string, inputId: string) => WorkflowImageInputSource | null
}) => {
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
