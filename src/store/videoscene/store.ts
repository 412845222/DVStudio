import { createStore, type Store } from 'vuex'
import type { InjectionKey } from 'vue'
import { NodeBase, type NodeBaseDTO, type NodeType, upgradeNodeType } from '../../DwebStudioUI/VideoScene/nodesType'

export type VideoSceneProjectNodeKind = 'group' | 'stage' | 'grid' | 'unknown'
export type VideoSceneUserNodeType = 'base' | 'rect' | 'text' | 'image'
export type VideoSceneNodeCategory = 'project' | 'user'

export type VideoSceneNodeTransform = {
  x: number
  y: number
  width: number
  height: number
	rotation: number
	opacity: number
}

export type VideoSceneNodeProps = {
	// base/rect/text/image 不同类型使用不同字段
	[key: string]: any
}

export type VideoSceneTreeNode = {
  id: string
  name: string
  category: VideoSceneNodeCategory
  projectKind?: VideoSceneProjectNodeKind
  userType?: VideoSceneUserNodeType
  transform?: VideoSceneNodeTransform
  props?: VideoSceneNodeProps
  children?: VideoSceneTreeNode[]
}

export type VideoSceneLayer = {
  id: string
  name: string
  nodeTree: VideoSceneTreeNode[]
}

const createLayer = (layerId: string, name: string): VideoSceneLayer => ({
  id: layerId,
  name,
  nodeTree: [
    {
      id: 'root',
      name,
      category: 'project',
      projectKind: 'group',
      children: [],
    },
  ],
})

export type VideoSceneLayoutInsets = {
  rightPanelWidth: number
  bottomToolbarHeight: number
}

export type VideoSceneRenderStep = {
  layerId: string
  nodeId: string
  category: VideoSceneNodeCategory
  type: VideoSceneProjectNodeKind | VideoSceneUserNodeType
  path: string[]
}

export interface VideoSceneState {
  showSizePanel: boolean
	showBackgroundPanel: boolean
  layers: VideoSceneLayer[]
  activeLayerId: string
  selectedNodeId: string | null
	focusedNodeId: string | null
  layoutInsets: VideoSceneLayoutInsets
}

const clampPx = (v: unknown, fallback: number) => {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, n)
}

const findLayer = (state: VideoSceneState, layerId: string) => state.layers.find((l) => l.id === layerId)

const walkTree = (
  nodes: VideoSceneTreeNode[],
  visit: (node: VideoSceneTreeNode, parent: VideoSceneTreeNode | null, list: VideoSceneTreeNode[]) => boolean | void,
  parent: VideoSceneTreeNode | null = null
): boolean => {
  for (const node of nodes) {
    const stop = visit(node, parent, nodes)
    if (stop === true) return true
    if (node.children?.length) {
      const done = walkTree(node.children, visit, node)
      if (done) return true
    }
  }
  return false
}

const detachNode = (root: VideoSceneTreeNode[], nodeId: string): VideoSceneTreeNode | null => {
  let removed: VideoSceneTreeNode | null = null
  walkTree(root, (node, _parent, list) => {
    if (node.id !== nodeId) return
    const idx = list.findIndex((n) => n.id === nodeId)
    if (idx >= 0) removed = list.splice(idx, 1)[0]
    return true
  })
  return removed
}

const findNode = (root: VideoSceneTreeNode[], nodeId: string): VideoSceneTreeNode | null => {
  let found: VideoSceneTreeNode | null = null
  walkTree(root, (node) => {
    if (node.id === nodeId) {
      found = node
      return true
    }
  })
  return found
}

const collectAllNames = (root: VideoSceneTreeNode[]) => {
  const names: string[] = []
  walkTree(root, (node) => {
    names.push(String(node.name ?? ''))
  })
  return names
}

const makeUniqueName = (existingNames: string[], baseName: string) => {
  const desired = String(baseName || 'Node').trim() || 'Node'
  if (!existingNames.includes(desired)) return desired
  const re = new RegExp(`^${desired.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?:\\s+(\\d+))?$`)
  let maxN = 1
  for (const n of existingNames) {
    const m = re.exec(String(n || '').trim())
    if (!m) continue
    const k = m[1] ? Number(m[1]) : 1
    if (Number.isFinite(k)) maxN = Math.max(maxN, k)
  }
  return `${desired} ${maxN + 1}`
}

const isDescendant = (root: VideoSceneTreeNode[], maybeAncestorId: string, nodeId: string) => {
	const ancestor = findNode(root, maybeAncestorId)
	if (!ancestor) return false
	const children = ancestor.children
	if (!children || children.length === 0) return false
	return !!findNode(children, nodeId)
}

type WorldPosResult = {
  node: VideoSceneTreeNode
  parentWorld: { x: number; y: number }
  world: { x: number; y: number }
}

const findWorldPos = (root: VideoSceneTreeNode[], nodeId: string): WorldPosResult | null => {
  const dfs = (nodes: VideoSceneTreeNode[], parentWorld: { x: number; y: number }): WorldPosResult | null => {
    for (const n of nodes) {
      const hasT = !!n.transform
      const world = hasT
        ? { x: parentWorld.x + (n.transform?.x ?? 0), y: parentWorld.y + (n.transform?.y ?? 0) }
        : parentWorld
      const nextParentWorld = hasT ? world : parentWorld
      if (n.id === nodeId) return { node: n, parentWorld, world }
      if (n.children?.length) {
        const hit = dfs(n.children, nextParentWorld)
        if (hit) return hit
      }
    }
    return null
  }
  return dfs(root, { x: 0, y: 0 })
}

export const buildRenderPipeline = (state: VideoSceneState): VideoSceneRenderStep[] => {
  const steps: VideoSceneRenderStep[] = []
  for (const layer of state.layers) {
    const dfs = (nodes: VideoSceneTreeNode[], path: string[]) => {
      for (const n of nodes) {
        const category = n.category
        const type = (n.category === 'user' ? (n.userType ?? 'rect') : (n.projectKind ?? 'unknown')) as
      | VideoSceneProjectNodeKind
      | VideoSceneUserNodeType
        steps.push({ layerId: layer.id, nodeId: n.id, category, type, path: [...path, n.id] })
        if (n.children?.length) dfs(n.children, [...path, n.id])
      }
    }
    dfs(layer.nodeTree, [])
  }
  return steps
}

const genId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const createRenderableNode = (type: VideoSceneUserNodeType): VideoSceneTreeNode => {
	const id = genId(type)
	const base: NodeBaseDTO = NodeBase.create(id, type === 'base' ? 'Node' : type === 'rect' ? 'Rect' : type === 'text' ? 'Text' : 'Image')
	const upgraded = upgradeNodeType(base, type as NodeType)
	return {
		id: upgraded.id,
		name: upgraded.name,
		category: 'user',
		userType: upgraded.type as VideoSceneUserNodeType,
		transform: {
			x: upgraded.transform.x,
			y: upgraded.transform.y,
			width: upgraded.transform.width,
			height: upgraded.transform.height,
			rotation: upgraded.transform.rotation,
			opacity: upgraded.transform.opacity,
		},
		props: upgraded.props ?? {},
	}
}

const createDefaultState = (): VideoSceneState => ({
  showSizePanel: false,
	showBackgroundPanel: false,
  layers: [
    {
      id: 'layer-1',
      name: '图层1',
      nodeTree: createLayer('layer-1', '图层1').nodeTree,
    },
  ],
  activeLayerId: 'layer-1',
  selectedNodeId: null,
	focusedNodeId: null,
  layoutInsets: { rightPanelWidth: 240, bottomToolbarHeight: 40 },
})

export const VideoSceneKey: InjectionKey<Store<VideoSceneState>> = Symbol('VideoSceneStore')

export const VideoSceneStore = createStore<VideoSceneState>({
  state: createDefaultState,
  mutations: {
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
    // 若当前选中节点不在新图层中，则清空选中/焦点，避免节点树与舞台状态不一致
    if (state.selectedNodeId) {
      const exists = findNode(layer.nodeTree, state.selectedNodeId)
      if (!exists) {
        state.selectedNodeId = null
        state.focusedNodeId = null
      }
    }
    },
    setSelectedNode(state, payload: { nodeId: string | null }) {
      state.selectedNodeId = payload.nodeId
    state.focusedNodeId = payload.nodeId
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
    state.layers.push(createLayer(payload.layerId, payload.name))
    state.activeLayerId = payload.layerId
    state.selectedNodeId = null
    state.focusedNodeId = null
  },
  removeLayer(state, payload: { layerId: string }) {
    const idx = state.layers.findIndex((l) => l.id === payload.layerId)
    if (idx < 0) return
    state.layers.splice(idx, 1)
    if (state.activeLayerId === payload.layerId) {
      state.activeLayerId = state.layers[0]?.id ?? ''
      state.selectedNodeId = null
      state.focusedNodeId = null
    }
  },
    moveNode(
      state,
      payload: { layerId: string; nodeId: string; targetParentId: string | null; targetIndex?: number }
    ) {
      const layer = findLayer(state, payload.layerId)
      if (!layer) return
      if (payload.targetParentId && payload.targetParentId === payload.nodeId) return
      if (payload.targetParentId && isDescendant(layer.nodeTree, payload.nodeId, payload.targetParentId)) return

    // 让节点的 transform 作为“相对父节点的局部坐标”，同时在重设父子关系时尽量保持节点的 world 位置不变
    const before = findWorldPos(layer.nodeTree, payload.nodeId)
    const targetParentWorld = (() => {
      if (!payload.targetParentId) return { x: 0, y: 0 }
      if (payload.targetParentId === 'root') return { x: 0, y: 0 }
      const r = findWorldPos(layer.nodeTree, payload.targetParentId)
      return r?.world ?? { x: 0, y: 0 }
    })()

    const moved = detachNode(layer.nodeTree, payload.nodeId)
      if (!moved) return
    if (before?.node?.transform && moved.transform) {
      moved.transform = {
        ...moved.transform,
        x: before.world.x - targetParentWorld.x,
        y: before.world.y - targetParentWorld.y,
      }
    }

      if (payload.targetParentId) {
        const parent = findNode(layer.nodeTree, payload.targetParentId)
        if (!parent) {
          // parent 不存在则放回根
          layer.nodeTree.push(moved)
          return
        }
        if (!parent.children) parent.children = []
        const idx =
          typeof payload.targetIndex === 'number'
            ? Math.max(0, Math.min(parent.children.length, Math.floor(payload.targetIndex)))
            : parent.children.length
        parent.children.splice(idx, 0, moved)
        return
      }

      const rootIdx =
        typeof payload.targetIndex === 'number'
          ? Math.max(0, Math.min(layer.nodeTree.length, Math.floor(payload.targetIndex)))
          : layer.nodeTree.length
      layer.nodeTree.splice(rootIdx, 0, moved)
    },
  addRenderableNode(state, payload: { layerId: string; type: VideoSceneUserNodeType; parentId?: string | null }) {
    const layer = findLayer(state, payload.layerId)
    if (!layer) return
    const node = createRenderableNode(payload.type)
		// 默认命名：同名递增后缀（Node / Node 2 / Node 3...）
		const existingNames = collectAllNames(layer.nodeTree)
		node.name = makeUniqueName(existingNames, node.name)
    // 默认插入到 root(Scene) 下；若找不到则插入顶层
    const root = findNode(layer.nodeTree, payload.parentId ?? 'root')
    if (root) {
      if (!root.children) root.children = []
      root.children.push(node)
    } else {
      layer.nodeTree.push(node)
    }
    state.selectedNodeId = node.id
    state.focusedNodeId = node.id
  },
  updateNodeTransform(state, payload: { layerId: string; nodeId: string; patch: Partial<VideoSceneNodeTransform> }) {
    const layer = findLayer(state, payload.layerId)
    if (!layer) return
    const node = findNode(layer.nodeTree, payload.nodeId)
    if (!node || node.category !== 'user') return
    const prev = node.transform ?? { x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1 }
    node.transform = {
      x: Number.isFinite(payload.patch.x as any) ? Number(payload.patch.x) : prev.x,
      y: Number.isFinite(payload.patch.y as any) ? Number(payload.patch.y) : prev.y,
      width: Number.isFinite(payload.patch.width as any) ? Math.max(1, Number(payload.patch.width)) : prev.width,
      height: Number.isFinite(payload.patch.height as any) ? Math.max(1, Number(payload.patch.height)) : prev.height,
    rotation: Number.isFinite(payload.patch.rotation as any) ? Number(payload.patch.rotation) : prev.rotation,
    opacity: Number.isFinite(payload.patch.opacity as any) ? Math.max(0, Math.min(1, Number(payload.patch.opacity))) : prev.opacity,
    }
  },
  updateNodeName(state, payload: { layerId: string; nodeId: string; name: string }) {
    const layer = findLayer(state, payload.layerId)
    if (!layer) return
    const node = findNode(layer.nodeTree, payload.nodeId)
    if (!node) return
    node.name = String(payload.name ?? '')
  },
  updateNodeProps(state, payload: { layerId: string; nodeId: string; patch: Record<string, any> }) {
    const layer = findLayer(state, payload.layerId)
    if (!layer) return
    const node = findNode(layer.nodeTree, payload.nodeId)
    if (!node || node.category !== 'user') return
    if (!node.props) node.props = {}
    Object.assign(node.props, payload.patch)
  },
  setNodeType(state, payload: { layerId: string; nodeId: string; type: VideoSceneUserNodeType }) {
    const layer = findLayer(state, payload.layerId)
    if (!layer) return
    const node = findNode(layer.nodeTree, payload.nodeId)
    if (!node || node.category !== 'user') return
    const current: NodeBaseDTO = NodeBase.normalize({
      id: node.id,
      name: node.name,
      type: (node.userType ?? 'base') as any,
      transform: {
        x: node.transform?.x ?? 0,
        y: node.transform?.y ?? 0,
        width: node.transform?.width ?? 200,
        height: node.transform?.height ?? 120,
        rotation: (node.transform as any)?.rotation ?? 0,
        opacity: (node.transform as any)?.opacity ?? 1,
      },
      props: node.props ?? {},
    })
    const upgraded = upgradeNodeType(current, payload.type as any)
    node.userType = upgraded.type as any
    node.props = upgraded.props ?? {}
    if (!node.transform) node.transform = { x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1 }
    node.transform.width = upgraded.transform.width
    node.transform.height = upgraded.transform.height
    node.transform.rotation = upgraded.transform.rotation
    node.transform.opacity = upgraded.transform.opacity
  },
  },
  actions: {
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
  updateNodeProps({ commit, state }, payload: { nodeId: string; patch: Record<string, any>; layerId?: string }) {
    commit('updateNodeProps', { layerId: payload.layerId ?? state.activeLayerId, nodeId: payload.nodeId, patch: payload.patch })
  },
  },
})
