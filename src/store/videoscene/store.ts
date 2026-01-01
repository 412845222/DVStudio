import { createStore, type Store } from 'vuex'
import type { InjectionKey } from 'vue'

import {
	addNodeTreeToLayer,
  addRenderableNodeToLayer,
  buildRenderPipeline,
  clearSelection as clearSelectionPatch,
  collectAllNames,
  detachNode,
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
  getLayerNodeTree,
  computeMovableSelectionIds,
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

const normalizeNodeIdentityInPlace = (node: any) => {
  if (!node || typeof node !== 'object') return
  if (typeof node.id !== 'string' || !node.id.trim()) {
    node.id = `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }
  if (typeof node.createdAt !== 'number' || !Number.isFinite(node.createdAt)) {
    node.createdAt = Date.now()
  }
  if (Array.isArray(node.children)) {
    for (const c of node.children) normalizeNodeIdentityInPlace(c)
  }
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
    addNodeTree(state, payload: { layerId: string; node: VideoSceneTreeNode; parentId?: string | null }) {
      const layer = findLayer(state, payload.layerId)
      if (!layer) return
      const r = addNodeTreeToLayer({ state, layerId: payload.layerId, node: payload.node, parentId: payload.parentId })
      if (!r) return
      Object.assign(state, r.selection)
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
		for (const layer of nextLayers) {
			if (!layer || typeof layer !== 'object') continue
			if (Array.isArray((layer as any).nodeTree)) {
				for (const n of (layer as any).nodeTree) normalizeNodeIdentityInPlace(n)
			}
		}
    state.layers = nextLayers
    // activeLayerId 必须存在
    if (!state.layers.find((l) => l.id === state.activeLayerId)) {
      state.activeLayerId = state.layers[0]?.id ?? state.activeLayerId
    }
      Object.assign(state, reconcileSelectionAcrossLayers(state.layers, state))
  },
    patchNodeById(
      state,
      payload: {
        nodeId: string
        layerId?: string
        patch: {
          name?: string
          userType?: VideoSceneUserNodeType
          transform?: Partial<VideoSceneNodeTransform>
          props?: NodePropsPatch
        }
      }
    ) {
      const nodeId = String(payload.nodeId || '').trim()
      if (!nodeId) return
      const explicitLayerId = typeof payload.layerId === 'string' && payload.layerId.trim() ? payload.layerId.trim() : ''
      const findLayerId = () => {
        if (explicitLayerId) {
          const layer = findLayer(state, explicitLayerId)
          if (layer && findNode(layer.nodeTree, nodeId)) return explicitLayerId
        }
        for (const layer of state.layers) {
          if (findNode(layer.nodeTree, nodeId)) return layer.id
        }
        return ''
      }
      const layerId = findLayerId()
      if (!layerId) return
      const layer = findLayer(state, layerId)
      if (!layer) return

      const p = payload.patch || ({} as any)
      if (typeof p.userType === 'string' && p.userType.trim()) {
        setUserNodeType(layer, nodeId, p.userType as VideoSceneUserNodeType)
      }
      if (p.transform && typeof p.transform === 'object') {
        updateUserNodeTransform(layer, nodeId, p.transform)
      }
      if (p.props && typeof p.props === 'object') {
        updateUserNodeProps(layer, nodeId, p.props)
      }
      if (typeof p.name === 'string' && p.name.trim()) {
        updateNodeNameCore(layer, nodeId, p.name.trim())
      }
    },
    deleteNodesById(state, payload: { nodeIds: string[]; layerId?: string }) {
      const rawIds = Array.isArray(payload.nodeIds) ? payload.nodeIds : []
      const ids = Array.from(new Set(rawIds.map((s) => String(s || '').trim()).filter(Boolean)))
      if (!ids.length) return
      const explicitLayerId = typeof payload.layerId === 'string' && payload.layerId.trim() ? payload.layerId.trim() : ''

      const deleteInLayer = (layerId: string, nodeId: string) => {
        const layer = findLayer(state, layerId)
        if (!layer) return
        detachNode(layer.nodeTree, nodeId)
      }

      for (const nodeId of ids) {
        let layerId = ''
        if (explicitLayerId) {
          const layer = findLayer(state, explicitLayerId)
          if (layer && findNode(layer.nodeTree, nodeId)) layerId = explicitLayerId
        }
        if (!layerId) {
          for (const layer of state.layers) {
            if (findNode(layer.nodeTree, nodeId)) {
              layerId = layer.id
              break
            }
          }
        }
        if (!layerId) continue
        deleteInLayer(layerId, nodeId)
        if (state.focusedNodeId === nodeId) state.focusedNodeId = null
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
  addNodeTree(
    { commit, state },
    payload: { node: VideoSceneTreeNode; layerId?: string; parentId?: string | null }
  ) {
    commit('addNodeTree', {
      layerId: payload.layerId ?? state.activeLayerId,
      node: payload.node,
      parentId: payload.parentId,
    })
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
  patchNodeById(
    { commit },
    payload: {
      nodeId: string
      layerId?: string
      patch: { name?: string; userType?: VideoSceneUserNodeType; transform?: Partial<VideoSceneNodeTransform>; props?: NodePropsPatch }
    }
  ) {
    commit('patchNodeById', payload)
  },
  deleteNodesById({ commit, state }, payload: { nodeIds: string[]; layerId?: string }) {
    const rawIds = Array.isArray(payload?.nodeIds) ? payload.nodeIds : []
    const ids = Array.from(new Set(rawIds.map((s) => String(s || '').trim()).filter(Boolean)))
    if (!ids.length) return
    const explicitLayerId = typeof payload.layerId === 'string' && payload.layerId.trim() ? payload.layerId.trim() : ''

    const collectSubtreeIds = (node: VideoSceneTreeNode | null | undefined, out: Set<string>) => {
      if (!node) return
      const id = String((node as any).id ?? '').trim()
      if (id) out.add(id)
      const children = (node as any).children
      if (Array.isArray(children) && children.length) {
        for (const c of children) collectSubtreeIds(c, out)
      }
    }

    const purge = new Set<string>()
    for (const nodeId of ids) {
      let layerId = ''
      if (explicitLayerId) {
        const layer = findLayer(state, explicitLayerId)
        if (layer && findNode(layer.nodeTree, nodeId)) layerId = explicitLayerId
      }
      if (!layerId) {
        for (const layer of state.layers as VideoSceneLayer[]) {
          if (findNode(layer.nodeTree, nodeId)) {
            layerId = layer.id
            break
          }
        }
      }
      if (!layerId) continue
      const layer = findLayer(state, layerId)
      if (!layer) continue
      const n = findNode(layer.nodeTree, nodeId)
      collectSubtreeIds(n, purge)
    }

    commit('deleteNodesById', { ...payload, nodeIds: ids, purgeNodeIds: Array.from(purge) } as any)
  },
  deleteNodeById({ dispatch }, payload: { nodeId: string; layerId?: string }) {
    dispatch('deleteNodesById', { nodeIds: [payload.nodeId], layerId: payload.layerId })
  },
  deleteSelectedNodes({ dispatch, state }) {
    const layerId = String(state.activeLayerId || '')
    const ids = Array.isArray(state.selectedNodeIds) ? state.selectedNodeIds : []
    if (!layerId || !ids.length) return
    const tree = getLayerNodeTree(state, layerId)
    const filtered = computeMovableSelectionIds(tree, ids)
    if (!filtered.length) return
    dispatch('deleteNodesById', { nodeIds: filtered, layerId })
  },
  },
})
