import type { WorkflowState, WorkflowSelectionTag } from '../types'
import type { WorkflowResource } from '../resource/types'
import { isRecord, isArray, isString } from '../../types/utils'

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
  selectionTagsByKey?: Record<string, WorkflowSelectionTag>
  savedSelectionFrames?: import('../types').SavedSelectionFrame[]
  nodeCheckboxVisible?: boolean
}

type LegacySnapshot = {
  schemaVersion?: unknown
  viewport?: unknown
  nodesById?: unknown
  nodeOrder?: unknown
  edgesById?: unknown
  edgeOrder?: unknown
  resourcesById?: unknown
  resourceOrder?: unknown
}

export const isValidBlueprintSnapshot = (v: unknown): v is AIWorkflowDraftSnapshot => {
  if (!isRecord(v)) return false
  const rec = v as LegacySnapshot
  if (Number(rec.schemaVersion) !== AIWF_BLUEPRINT_SNAPSHOT_SCHEMA_VERSION) return false
  return (
    isRecord(rec.viewport) &&
    isRecord(rec.nodesById) &&
    isArray(rec.nodeOrder) &&
    isRecord(rec.edgesById) &&
    isArray(rec.edgeOrder) &&
    isRecord(rec.resourcesById) &&
    isArray(rec.resourceOrder)
  )
}

export const buildSnapshotFromState = (state: WorkflowState): AIWorkflowDraftSnapshot => {
  const snapshot: AIWorkflowDraftSnapshot = {
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
  if (state.selectionTagsByKey && Object.keys(state.selectionTagsByKey).length) {
    snapshot.selectionTagsByKey = state.selectionTagsByKey
  }
  if (state.savedSelectionFrames && state.savedSelectionFrames.length) {
    snapshot.savedSelectionFrames = state.savedSelectionFrames
  }
  snapshot.nodeCheckboxVisible = state.nodeCheckboxVisible
  return snapshot
}

type LegacyResource = Record<string, unknown> & {
  url?: unknown
  posterUrl?: unknown
}

export const normalizeSnapshotResourceUrls = (
  snapshot: AIWorkflowDraftSnapshot,
  resolveUrl: (url: string) => string
): AIWorkflowDraftSnapshot => {
  const resourcesById: Record<string, WorkflowResource> = {}
  for (const rid of snapshot.resourceOrder) {
    const r = snapshot.resourcesById?.[rid]
    if (!r) continue
    const legacyR = r as LegacyResource
    const rawUrl = isString(legacyR.url) ? String(legacyR.url) : ''
    const rawPosterUrl = isString(legacyR.posterUrl) ? String(legacyR.posterUrl) : ''
    resourcesById[rid] = {
      ...r,
      url: resolveUrl(rawUrl),
      posterUrl: rawPosterUrl ? resolveUrl(rawPosterUrl) : undefined,
    }
  }
  return {
    ...snapshot,
    resourcesById,
  }
}
