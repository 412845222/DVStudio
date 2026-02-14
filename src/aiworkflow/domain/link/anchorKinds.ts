import type { WorkflowNode, WorkflowState } from '../../types'

export type AnchorKind = 'flow' | 'resource' | 'image' | 'video' | 'text'

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

  if (node.type === 'image' && direction === 'in') return 'resource'

  const list = direction === 'in' ? node.inputs : node.outputs
  const anchor = Array.isArray(list) ? list.find((a) => a.id === anchorId) : undefined

  if (anchor?.mediaType === 'image') return 'image'
  if (anchor?.mediaType === 'video') return 'video'
  if (anchor?.mediaType === 'text') return 'text'
  if (anchor?.mediaType === 'flow') return 'flow'

  if (node.type === 'text') return 'text'
  if (node.type === 'image') return 'image'
  if (node.type === 'video') return 'video'

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
  if (fromKind === toKind) return true
  if (toKind === 'resource' && (fromKind === 'resource' || fromKind === 'image' || fromKind === 'video')) {
    return true
  }
  return false
}

export const anchorKindLabel = (kind: AnchorKind | null) => {
  if (kind === 'flow') return 'flow'
  if (kind === 'resource') return 'resource'
  if (kind === 'image') return 'image'
  if (kind === 'video') return 'video'
  if (kind === 'text') return 'text'
  return 'unknown'
}
