type WorkflowNodeType =
	| 'text'
	| 'image'
	| 'rotate-image'
	| 'video'
	| 'scene-understanding'
	| 'scene-decompose'
	| 'scene-layout'
	| 'unreal-export'
	| 'comfyui'
	| 'model3d'
	| 'meshy'

type NodeActionsNode = {
	worldX?: unknown
	worldY?: unknown
}

type NodeActionsStore = {
	state: {
		nodesById: Record<string, NodeActionsNode | undefined>
	}
	commit: (type: string, value: unknown) => void
}

export const useAIWorkflowNodeActions = (payload: {
	store: NodeActionsStore
	selectedNodeIds: { value: string[] }
	pasteNodesWithResourceDedupe: (position?: { worldX?: number; worldY?: number }) => void
	removeSelectedNodesWithResourceCleanup: (nodeIds: string[]) => Promise<void>
	copySelection?: () => void
	paste?: () => void
	setSelection?: (nodeIds: string[]) => void
}) => {
	const onNodeCopy = (nodeId: string) => {
		if (payload.setSelection) {
			payload.setSelection([nodeId])
		}
		if (payload.copySelection) {
			payload.copySelection()
		}
		payload.store.commit('copyNode', { nodeId })
	}

	const onNodePaste = (_nodeId: string) => {
		if (payload.paste) {
			payload.paste()
		} else {
			payload.pasteNodesWithResourceDedupe()
		}
	}

	const onNodeDelete = (nodeId: string) => {
		if (
			payload.selectedNodeIds.value.length > 1 &&
			payload.selectedNodeIds.value.includes(nodeId)
		) {
			void payload.removeSelectedNodesWithResourceCleanup(payload.selectedNodeIds.value)
			return
		}
		payload.store.commit('setSelectedNode', { nodeId })
		void payload.removeSelectedNodesWithResourceCleanup([nodeId])
	}

	const onNodeSetType = (nodeId: string, type: WorkflowNodeType) => {
		payload.store.commit('setNodeType', { nodeId, type })
	}

	return {
		onNodeCopy,
		onNodePaste,
		onNodeDelete,
		onNodeSetType
	}
}
