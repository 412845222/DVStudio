import { computed } from 'vue'
import type { Store } from 'vuex'
import type { WorkflowEdge, WorkflowNode, WorkflowState } from '../../../aiworkflow/types'

export const useAIWorkflowSelectionState = (store: Store<WorkflowState>) => {
	const selectedNodeId = computed(() => store.state.selectedNodeId)
	const selectedNodeIds = computed(() => store.state.selectedNodeIds ?? [])
	const selectedEdgeId = computed(() => store.state.selectedEdgeId)

	const active3DPreviewNodeId = computed(() => {
		if (selectedNodeIds.value.length !== 1) return ''
		const nodeId = String(selectedNodeId.value ?? '').trim()
		if (!nodeId) return ''
		const node = store.state.nodesById[nodeId]
		if (!node) return ''
		return node.type === 'scene-layout' || node.type === 'model3d' ? nodeId : ''
	})

	const selectedNode = computed<WorkflowNode | null>(() =>
		selectedNodeId.value ? store.state.nodesById[selectedNodeId.value] : null
	)
	const selectedEdge = computed<WorkflowEdge | null>(() =>
		selectedEdgeId.value ? store.state.edgesById[selectedEdgeId.value] : null
	)
	const selectedNodeResource = computed(() => {
		const node = selectedNode.value
		if (!node?.resourceId) return null
		return store.state.resourcesById[node.resourceId] ?? null
	})

	return {
		selectedNodeId,
		selectedNodeIds,
		selectedEdgeId,
		selectedNode,
		selectedEdge,
		selectedNodeResource,
		active3DPreviewNodeId
	}
}
