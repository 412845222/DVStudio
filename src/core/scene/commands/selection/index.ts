import { findNode, nodeExistsInAnyLayer } from '../../tree'
import type { VideoSceneLayer, VideoSceneState, VideoSceneTreeNode } from '../../types'

import type { SelectionPatch } from './types'
import { toCleanIdList } from './utils'

export type { SelectionPatch } from './types'

export const setSingleSelection = (nodeId: string | null): SelectionPatch => {
	const id = String(nodeId || '').trim()
	return {
		selectedNodeIds: id ? [id] : [],
		selectedNodeId: id || null,
		focusedNodeId: id || null,
	}
}

export const setMultiSelection = (nodeIds: string[]): SelectionPatch => {
	const uniq = toCleanIdList(nodeIds)
	return {
		selectedNodeIds: uniq,
		selectedNodeId: uniq[uniq.length - 1] ?? null,
		focusedNodeId: uniq[uniq.length - 1] ?? null,
	}
}

export const clearSelection = (): SelectionPatch => ({
	selectedNodeIds: [],
	selectedNodeId: null,
	focusedNodeId: null,
})

export const reconcileSelectionForActiveLayer = (
	layerNodeTree: VideoSceneTreeNode[],
	state: Pick<VideoSceneState, 'selectedNodeId' | 'selectedNodeIds'>
): SelectionPatch => {
	const baseline: string[] = []
	if (Array.isArray(state.selectedNodeIds) && state.selectedNodeIds.length) baseline.push(...state.selectedNodeIds)
	else if (state.selectedNodeId) baseline.push(state.selectedNodeId)

	const filtered = baseline.filter((id) => !!findNode(layerNodeTree, id))
	return {
		selectedNodeIds: filtered,
		selectedNodeId: filtered[filtered.length - 1] ?? null,
		focusedNodeId: filtered[filtered.length - 1] ?? null,
	}
}

export const reconcileSelectionAcrossLayers = (
	layers: VideoSceneLayer[],
	state: Pick<VideoSceneState, 'selectedNodeId' | 'selectedNodeIds'>
): SelectionPatch => {
	const baseline: string[] = []
	if (Array.isArray(state.selectedNodeIds) && state.selectedNodeIds.length) baseline.push(...state.selectedNodeIds)
	else if (state.selectedNodeId) baseline.push(state.selectedNodeId)

	const filtered = baseline.filter((id) => nodeExistsInAnyLayer(layers, id))
	return {
		selectedNodeIds: filtered,
		selectedNodeId: filtered[filtered.length - 1] ?? null,
		focusedNodeId: filtered[filtered.length - 1] ?? null,
	}
}
