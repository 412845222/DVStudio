import { computed, type Ref } from 'vue'
import type { Store } from 'vuex'
import type { WorkflowEdge, WorkflowState } from '../../../aiworkflow/types'

export const useAIWorkflowEdgeIndex = (payload: {
  store: Store<WorkflowState>
  visibleRenderNodeIds: Ref<Set<string>>
  chatModelKey: Ref<string>
  chatCollapsed: Ref<boolean>
  nanoAnchorNodeId: string
}) => {
  const edges = computed(() => payload.store.state.edgeOrder.map((id) => payload.store.state.edgesById[id]).filter(Boolean))
  const EMPTY_WORKFLOW_EDGES: WorkflowEdge[] = []
  const edgeNodeAnchorKey = (nodeId: string, anchorId: string) => `${nodeId}::${anchorId}`

  const edgeIndex = computed(() => {
    const incomingByNode = new Map<string, WorkflowEdge[]>()
    const incomingByNodeAnchor = new Map<string, WorkflowEdge[]>()
    const outgoingByNode = new Map<string, WorkflowEdge[]>()
    const outgoingByNodeAnchor = new Map<string, WorkflowEdge[]>()
    const exactEdges = new Set<string>()

    for (const edge of edges.value) {
      const fromNodeId = String(edge?.fromNodeId ?? '').trim()
      const toNodeId = String(edge?.toNodeId ?? '').trim()
      const fromAnchorId = String(edge?.fromAnchorId ?? '').trim()
      const toAnchorId = String(edge?.toAnchorId ?? '').trim()
      if (!fromNodeId || !toNodeId) continue

      const incomingNodeList = incomingByNode.get(toNodeId) ?? []
      incomingNodeList.push(edge)
      incomingByNode.set(toNodeId, incomingNodeList)

      const outgoingNodeList = outgoingByNode.get(fromNodeId) ?? []
      outgoingNodeList.push(edge)
      outgoingByNode.set(fromNodeId, outgoingNodeList)

      if (toAnchorId) {
        const incomingAnchorKey = edgeNodeAnchorKey(toNodeId, toAnchorId)
        const incomingAnchorList = incomingByNodeAnchor.get(incomingAnchorKey) ?? []
        incomingAnchorList.push(edge)
        incomingByNodeAnchor.set(incomingAnchorKey, incomingAnchorList)
      }

      if (fromAnchorId) {
        const outgoingAnchorKey = edgeNodeAnchorKey(fromNodeId, fromAnchorId)
        const outgoingAnchorList = outgoingByNodeAnchor.get(outgoingAnchorKey) ?? []
        outgoingAnchorList.push(edge)
        outgoingByNodeAnchor.set(outgoingAnchorKey, outgoingAnchorList)
      }

      exactEdges.add(`${fromNodeId}::${fromAnchorId}=>${toNodeId}::${toAnchorId}`)
    }

    return {
      incomingByNode,
      incomingByNodeAnchor,
      outgoingByNode,
      outgoingByNodeAnchor,
      exactEdges,
    }
  })

  const getIncomingEdges = (nodeId: string, anchorId?: string) => {
    const normalizedNodeId = String(nodeId ?? '').trim()
    if (!normalizedNodeId) return EMPTY_WORKFLOW_EDGES
    if (anchorId) {
      return edgeIndex.value.incomingByNodeAnchor.get(edgeNodeAnchorKey(normalizedNodeId, String(anchorId))) ?? EMPTY_WORKFLOW_EDGES
    }
    return edgeIndex.value.incomingByNode.get(normalizedNodeId) ?? EMPTY_WORKFLOW_EDGES
  }

  const getOutgoingEdges = (nodeId: string, anchorId?: string) => {
    const normalizedNodeId = String(nodeId ?? '').trim()
    if (!normalizedNodeId) return EMPTY_WORKFLOW_EDGES
    if (anchorId) {
      return edgeIndex.value.outgoingByNodeAnchor.get(edgeNodeAnchorKey(normalizedNodeId, String(anchorId))) ?? EMPTY_WORKFLOW_EDGES
    }
    return edgeIndex.value.outgoingByNode.get(normalizedNodeId) ?? EMPTY_WORKFLOW_EDGES
  }

  const getFirstIncomingEdge = (nodeId: string, anchorId?: string) => getIncomingEdges(nodeId, anchorId)[0] ?? null
  const hasIncomingEdge = (nodeId: string, anchorId?: string) => getIncomingEdges(nodeId, anchorId).length > 0
  const hasOutgoingEdge = (nodeId: string, anchorId?: string) => getOutgoingEdges(nodeId, anchorId).length > 0

  const hasExactEdge = (edgePayload: { fromNodeId: string; fromAnchorId: string; toNodeId: string; toAnchorId: string }) => {
    const fromNodeId = String(edgePayload.fromNodeId ?? '').trim()
    const fromAnchorId = String(edgePayload.fromAnchorId ?? '').trim()
    const toNodeId = String(edgePayload.toNodeId ?? '').trim()
    const toAnchorId = String(edgePayload.toAnchorId ?? '').trim()
    if (!fromNodeId || !toNodeId) return false
    return edgeIndex.value.exactEdges.has(`${fromNodeId}::${fromAnchorId}=>${toNodeId}::${toAnchorId}`)
  }

  const renderEdges = computed(() => {
    const showNanoRef =
      (payload.chatModelKey.value === 'nanobanana' || payload.chatModelKey.value === 'seedance')
      && !payload.chatCollapsed.value
    const baseEdges = showNanoRef
      ? edges.value
      : edges.value.filter((edge) => edge.toNodeId !== payload.nanoAnchorNodeId && edge.fromNodeId !== payload.nanoAnchorNodeId)

    return baseEdges.filter((edge) => {
      if (edge.id === payload.store.state.selectedEdgeId) return true
      return payload.visibleRenderNodeIds.value.has(edge.fromNodeId) || payload.visibleRenderNodeIds.value.has(edge.toNodeId)
    })
  })

  return {
    edges,
    renderEdges,
    getIncomingEdges,
    getOutgoingEdges,
    getFirstIncomingEdge,
    hasIncomingEdge,
    hasOutgoingEdge,
    hasExactEdge,
  }
}
