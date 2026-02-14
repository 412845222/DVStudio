import type { WorkflowState } from '../types'

export const AIWF_BLUEPRINT_SNAPSHOT_SCHEMA_VERSION = 1 as const

export type AIWorkflowDraftSnapshot = {
  schemaVersion: typeof AIWF_BLUEPRINT_SNAPSHOT_SCHEMA_VERSION
  savedAt: number
  viewport: WorkflowState['viewport']
  nodesById: WorkflowState['nodesById']
  nodeOrder: WorkflowState['nodeOrder']
  edgesById: WorkflowState['edgesById']
  edgeOrder: WorkflowState['edgeOrder']
  resourcesById: WorkflowState['resourcesById']
  resourceOrder: WorkflowState['resourceOrder']
  selectedNodeId: WorkflowState['selectedNodeId']
  selectedNodeIds: WorkflowState['selectedNodeIds']
}

export const isValidBlueprintSnapshot = (v: any): v is AIWorkflowDraftSnapshot => {
  if (!v || typeof v !== 'object') return false
  if (Number((v as any).schemaVersion) !== AIWF_BLUEPRINT_SNAPSHOT_SCHEMA_VERSION) return false
  return (
    typeof (v as any).viewport === 'object' &&
    typeof (v as any).nodesById === 'object' &&
    Array.isArray((v as any).nodeOrder) &&
    typeof (v as any).edgesById === 'object' &&
    Array.isArray((v as any).edgeOrder) &&
    typeof (v as any).resourcesById === 'object' &&
    Array.isArray((v as any).resourceOrder)
  )
}

export const buildSnapshotFromState = (state: WorkflowState): AIWorkflowDraftSnapshot => {
  return {
    schemaVersion: AIWF_BLUEPRINT_SNAPSHOT_SCHEMA_VERSION,
    savedAt: Date.now(),
    viewport: state.viewport,
    nodesById: state.nodesById,
    nodeOrder: state.nodeOrder,
    edgesById: state.edgesById,
    edgeOrder: state.edgeOrder,
    resourcesById: state.resourcesById,
    resourceOrder: state.resourceOrder,
    selectedNodeId: state.selectedNodeId,
    selectedNodeIds: state.selectedNodeIds,
  }
}

export const normalizeSnapshotResourceUrls = (
  snapshot: AIWorkflowDraftSnapshot,
  resolveUrl: (url: string) => string
): AIWorkflowDraftSnapshot => {
  const resourcesById: WorkflowState['resourcesById'] = {}
  for (const rid of snapshot.resourceOrder) {
    const r = snapshot.resourcesById?.[rid]
    if (!r) continue
    const rawUrl = typeof (r as any).url === 'string' ? String((r as any).url) : ''
    const rawPosterUrl = typeof (r as any).posterUrl === 'string' ? String((r as any).posterUrl) : ''
    resourcesById[rid] = {
      ...(r as any),
      url: resolveUrl(rawUrl),
			posterUrl: rawPosterUrl ? resolveUrl(rawPosterUrl) : undefined,
    } as any
  }
  return {
    ...snapshot,
    resourcesById,
  }
}
