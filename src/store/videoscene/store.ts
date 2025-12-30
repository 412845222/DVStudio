import { createStore, type Store } from 'vuex'
import type { InjectionKey } from 'vue'

import {
  addRenderableNodeToLayer,
  buildRenderPipeline,
  clearSelection as clearSelectionPatch,
  collectAllNames,
  findLayer,
  findNode,
  moveNodeInLayer,
  makeUniqueName,
  nodeExistsInAnyLayer,
  reconcileSelectionAcrossLayers,
  reconcileSelectionForActiveLayer,
  setUserNodeType,
  setMultiSelection,
  setSingleSelection,
  updateNodeName as updateNodeNameCore,
  updateUserNodeProps,
  updateUserNodeTransform,
} from '../../core/scene'

import type {
  VideoSceneLayer,
  VideoSceneLayoutInsets,
  VideoSceneNodeTransform,
  VideoSceneState,
  VideoSceneTreeNode,
  VideoSceneUserNodeType,
} from '../../core/scene'

import type { NodePropsPatch } from '../../core/scene'

import { createDefaultVideoSceneState, createVideoSceneLayer } from '../../core/scene'

export type {
  VideoSceneImageAsset,
  VideoSceneLayer,
  VideoSceneLayoutInsets,
  VideoSceneNodeCategory,
  VideoSceneNodeProps,
  VideoSceneNodeTransform,
  VideoSceneProjectNodeKind,
  VideoSceneRenderStep,
  VideoSceneState,
  VideoSceneTreeNode,
  VideoSceneUserNodeType,
} from '../../core/scene'

const clampPx = (v: unknown, fallback: number) => {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, n)
}

export const VideoSceneKey: InjectionKey<Store<VideoSceneState>> = Symbol('VideoSceneStore')

export const VideoSceneStore = createStore<VideoSceneState>({
  state: createDefaultVideoSceneState,
  mutations: {
    upsertImageAsset(state, payload: { id: string; url: string; name?: string }) {
      const id = String(payload.id || '').trim()
      const url = String(payload.url || '').trim()
      if (!id || !url) return
      state.imageAssets[id] = {
        id,
        url,
        name: String(payload.name ?? ''),
        createdAt: Date.now(),
      }
    },
    removeImageAsset(state, payload: { id: string }) {
      const id = String(payload.id || '').trim()
      if (!id) return
      delete state.imageAssets[id]
    },
    toggleSizePanel(state) {
      state.showSizePanel = !state.showSizePanel
      if (state.showSizePanel) state.showBackgroundPanel = false
    },
    setSizePanelVisible(state, payload: { visible: boolean }) {
      state.showSizePanel = !!payload.visible
      if (state.showSizePanel) state.showBackgroundPanel = false
    },
    toggleBackgroundPanel(state) {
      state.showBackgroundPanel = !state.showBackgroundPanel
      if (state.showBackgroundPanel) state.showSizePanel = false
    },
    setBackgroundPanelVisible(state, payload: { visible: boolean }) {
      state.showBackgroundPanel = !!payload.visible
      if (state.showBackgroundPanel) state.showSizePanel = false
    },
    setActiveLayer(state, payload: { layerId: string }) {
      const layer = findLayer(state, payload.layerId)
      if (!layer) return
      state.activeLayerId = payload.layerId
      Object.assign(state, reconcileSelectionForActiveLayer(layer.nodeTree, state))
    },
    setSelectedNode(state, payload: { nodeId: string | null }) {
      Object.assign(state, setSingleSelection(payload.nodeId))
    },
		setSelectedNodes(state, payload: { nodeIds: string[] }) {
      Object.assign(state, setMultiSelection(payload.nodeIds))
		},
		clearSelection(state) {
      Object.assign(state, clearSelectionPatch())
		},
		setFocusedNode(state, payload: { nodeId: string | null }) {
			state.focusedNodeId = payload.nodeId
		},
    setLayoutInsets(state, payload: Partial<VideoSceneLayoutInsets>) {
      state.layoutInsets = {
        rightPanelWidth: clampPx(payload.rightPanelWidth, state.layoutInsets.rightPanelWidth),
        bottomToolbarHeight: clampPx(payload.bottomToolbarHeight, state.layoutInsets.bottomToolbarHeight),
      }
    },
  addLayer(state, payload: { layerId: string; name: string }) {
    if (state.layers.some((l) => l.id === payload.layerId)) return
	state.layers.push(createVideoSceneLayer(payload.layerId, payload.name))
    state.activeLayerId = payload.layerId
    state.selectedNodeId = null
    state.selectedNodeIds = []
    state.focusedNodeId = null
  },
  removeLayer(state, payload: { layerId: string }) {
    const idx = state.layers.findIndex((l) => l.id === payload.layerId)
    if (idx < 0) return
    state.layers.splice(idx, 1)
    if (state.activeLayerId === payload.layerId) {
      state.activeLayerId = state.layers[0]?.id ?? ''
      state.selectedNodeId = null
      state.selectedNodeIds = []
      state.focusedNodeId = null
    }
  },
    moveNode(
      state,
      payload: { layerId: string; nodeId: string; targetParentId: string | null; targetIndex?: number }
    ) {
      const layer = findLayer(state, payload.layerId)
      if (!layer) return
      moveNodeInLayer({
        layer,
        nodeId: payload.nodeId,
        targetParentId: payload.targetParentId,
        targetIndex: payload.targetIndex,
      })
    },
  addRenderableNode(state, payload: { layerId: string; type: VideoSceneUserNodeType; parentId?: string | null }) {
    const layer = findLayer(state, payload.layerId)
    if (!layer) return
		const r = addRenderableNodeToLayer({ state, layerId: payload.layerId, type: payload.type, parentId: payload.parentId })
		if (!r) return
		Object.assign(state, r.selection)
  },
  updateNodeTransform(state, payload: { layerId: string; nodeId: string; patch: Partial<VideoSceneNodeTransform> }) {
    const layer = findLayer(state, payload.layerId)
    if (!layer) return
		updateUserNodeTransform(layer, payload.nodeId, payload.patch)
  },
  updateNodeName(state, payload: { layerId: string; nodeId: string; name: string }) {
    const layer = findLayer(state, payload.layerId)
    if (!layer) return
		updateNodeNameCore(layer, payload.nodeId, payload.name)
  },
  updateNodeProps(state, payload: { layerId: string; nodeId: string; patch: NodePropsPatch }) {
    const layer = findLayer(state, payload.layerId)
    if (!layer) return
		updateUserNodeProps(layer, payload.nodeId, payload.patch)
  },
  setNodeType(state, payload: { layerId: string; nodeId: string; type: VideoSceneUserNodeType }) {
    const layer = findLayer(state, payload.layerId)
    if (!layer) return
		setUserNodeType(layer, payload.nodeId, payload.type)
  },

  applyStageSnapshot(state, payload: { layers: VideoSceneLayer[] }) {
    const nextLayers = Array.isArray(payload.layers) ? payload.layers : []
    state.layers = nextLayers
    // activeLayerId 必须存在
    if (!state.layers.find((l) => l.id === state.activeLayerId)) {
      state.activeLayerId = state.layers[0]?.id ?? state.activeLayerId
    }
      Object.assign(state, reconcileSelectionAcrossLayers(state.layers, state))
  },
  },
  actions: {
    upsertImageAsset({ commit }, payload: { id: string; url: string; name?: string }) {
      commit('upsertImageAsset', payload)
    },
    removeImageAsset({ commit }, payload: { id: string }) {
      commit('removeImageAsset', payload)
    },
    toggleSizePanel({ commit }) {
      commit('toggleSizePanel')
    },
    setSizePanelVisible({ commit }, payload: { visible: boolean }) {
      commit('setSizePanelVisible', payload)
    },
		toggleBackgroundPanel({ commit }) {
			commit('toggleBackgroundPanel')
		},
		setBackgroundPanelVisible({ commit }, payload: { visible: boolean }) {
			commit('setBackgroundPanelVisible', payload)
		},
    setActiveLayer({ commit }, payload: { layerId: string }) {
      commit('setActiveLayer', payload)
    },
    setSelectedNode({ commit }, payload: { nodeId: string | null }) {
      commit('setSelectedNode', payload)
    },
    setSelectedNodes({ commit }, payload: { nodeIds: string[] }) {
      commit('setSelectedNodes', payload)
    },
    clearSelection({ commit }) {
      commit('clearSelection')
    },
	setFocusedNode({ commit }, payload: { nodeId: string | null }) {
		commit('setFocusedNode', payload)
	},
    setLayoutInsets({ commit }, payload: Partial<VideoSceneLayoutInsets>) {
      commit('setLayoutInsets', payload)
    },
  addLayer({ commit }, payload: { layerId: string; name: string }) {
    commit('addLayer', payload)
  },
  removeLayer({ commit }, payload: { layerId: string }) {
    commit('removeLayer', payload)
  },
    moveNode(
      { commit, state },
      payload: { layerId?: string; nodeId: string; targetParentId: string | null; targetIndex?: number }
    ) {
      const layerId = payload.layerId ?? state.activeLayerId
      commit('moveNode', { layerId, nodeId: payload.nodeId, targetParentId: payload.targetParentId, targetIndex: payload.targetIndex })
    },
    getRenderPipeline({ state }) {
      return buildRenderPipeline(state)
    },
  addRenderableNode({ commit, state }, payload: { type: VideoSceneUserNodeType; layerId?: string; parentId?: string | null }) {
    commit('addRenderableNode', { layerId: payload.layerId ?? state.activeLayerId, type: payload.type, parentId: payload.parentId })
  },
  updateNodeTransform(
    { commit, state },
    payload: { nodeId: string; patch: Partial<VideoSceneNodeTransform>; layerId?: string }
  ) {
    commit('updateNodeTransform', { layerId: payload.layerId ?? state.activeLayerId, nodeId: payload.nodeId, patch: payload.patch })
  },
  addBaseNode({ commit, state }, payload?: { layerId?: string; parentId?: string | null }) {
    commit('addRenderableNode', { layerId: payload?.layerId ?? state.activeLayerId, type: 'base', parentId: payload?.parentId })
  },
  setNodeType({ commit, state }, payload: { nodeId: string; type: VideoSceneUserNodeType; layerId?: string }) {
    commit('setNodeType', { layerId: payload.layerId ?? state.activeLayerId, nodeId: payload.nodeId, type: payload.type })
  },
  updateNodeName({ commit, state }, payload: { nodeId: string; name: string; layerId?: string }) {
    commit('updateNodeName', { layerId: payload.layerId ?? state.activeLayerId, nodeId: payload.nodeId, name: payload.name })
  },
  updateNodeProps({ commit, state }, payload: { nodeId: string; patch: NodePropsPatch; layerId?: string }) {
    commit('updateNodeProps', { layerId: payload.layerId ?? state.activeLayerId, nodeId: payload.nodeId, patch: payload.patch })
  },

	applyStageSnapshot({ commit }, payload: { layers: VideoSceneLayer[] }) {
		commit('applyStageSnapshot', payload)
	},
  },
})
