import type { Ref } from 'vue'
import type { WorkflowNode, WorkflowEdge, WorkflowState } from '../../../../aiworkflow/types'
import { NEWUI2_NODE_CATALOG } from '../../../../aiworkflow/nodeLibrary'
import { t } from '../../../../i18n'

type ToolCallPayload = {
  requestId: string
  toolName: string
  args?: Record<string, unknown>
}

type ToolApprovalItem = {
  requestId: string
  toolName: string
  args: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'error'
  result?: unknown
  error?: string
}

type AgentToolBridgeStore = {
  state: Pick<WorkflowState, 
    'nodesById' | 'edgeOrder' | 'edgesById' | 'selectedNodeId' | 'selectedEdgeId' | 
    'nodeGenerationTasksById' | 'nodeGenerationTaskIdsByNodeId'
  >
  commit: (type: string, value?: unknown) => void
}

type AgentToolBridgePayload = {
  store: AgentToolBridgeStore
  toolApprovalQueue: Ref<ToolApprovalItem[]>
  pushToast: (message: string, tone?: 'info' | 'warn' | 'error') => void
  getSelectedNode?: () => WorkflowNode | null | undefined
  getAllNodes?: () => WorkflowNode[]
  getAllEdges?: () => WorkflowEdge[]
  getNodeTypes?: (category?: string) => Array<{ type: string; label: string; category?: string }>
  getProjectInfo?: () => Record<string, unknown>
  viewport?: Ref<{
    zoom: number
    panX: number
    panY: number
  }>
  canvasViewportSize?: Ref<{
    width: number
    height: number
  }>
  focusNode?: (nodeId: string) => boolean
  engineApi?: {
    addNode?: (type: string, x: number, y: number, data?: Record<string, any>) => string | null
    updateNodeData?: (id: string, data: Record<string, any>) => void
    connectPorts?: (fId: string, fA: string, tId: string, tA: string) => boolean
    disconnectPorts?: (fId: string, fA: string, tId: string, tA: string) => boolean
    removeNode?: (id: string) => void
    removeEdge?: (edgeId: string) => void
  }
}

const DANGEROUS_TOOLS = new Set(['delete_node', 'disconnect_nodes', 'execute_node'])

const NODE_DEFAULT_WIDTH = 240
const NODE_DEFAULT_HEIGHT = 160
const NODE_SPACING = 40
const GRID_STEP_X = NODE_DEFAULT_WIDTH + NODE_SPACING
const GRID_STEP_Y = NODE_DEFAULT_HEIGHT + NODE_SPACING

type MCPIpcBridge = {
  dweb?: {
    mcp?: {
      onBuiltinToolCall?: (handler: (payload: ToolCallPayload) => void) => number
      offBuiltinToolCall?: (listenerId: number) => { ok: boolean }
      respondBuiltinTool?: (requestId: string, result: unknown, error?: string) => void
    }
  }
}

function getMcpBridge(): MCPIpcBridge {
  return window as unknown as MCPIpcBridge
}

function hasIpc(): boolean {
  const w = window as unknown as { dweb?: unknown }
  return !!w.dweb
}

export const useAgentToolBridge = (payload: AgentToolBridgePayload) => {
  let listenerId = -1
  const sessionCreatedNodeIds: string[] = []

  const respondTool = (requestId: string, result: unknown, error?: string) => {
    const bridge = getMcpBridge()
    if (bridge.dweb?.mcp?.respondBuiltinTool) {
      bridge.dweb.mcp.respondBuiltinTool(requestId, result, error)
    }
  }

  const addApprovalItem = (item: ToolApprovalItem) => {
    payload.toolApprovalQueue.value = [item, ...payload.toolApprovalQueue.value]
  }

  const updateApprovalItem = (requestId: string, updates: Partial<ToolApprovalItem>) => {
    payload.toolApprovalQueue.value = payload.toolApprovalQueue.value.map((item) =>
      item.requestId === requestId ? { ...item, ...updates } : item
    )
  }

  const handleToolCall = async (toolCall: ToolCallPayload) => {
    const { requestId, toolName, args = {} } = toolCall

    const approvalItem: ToolApprovalItem = {
      requestId,
      toolName,
      args,
      status: 'pending',
    }

    addApprovalItem(approvalItem)

    if (DANGEROUS_TOOLS.has(toolName)) {
      return
    }

    updateApprovalItem(requestId, { status: 'executing' })
    try {
      const result = await executeTool(toolName, args)
      updateApprovalItem(requestId, { status: 'completed', result })
      respondTool(requestId, result)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err)
      updateApprovalItem(requestId, { status: 'error', error: msg })
      respondTool(requestId, undefined, msg)
    }
  }

  const executeTool = async (toolName: string, args: Record<string, unknown>): Promise<unknown> => {
    switch (toolName) {
      case 'get_blueprint_state':
        return getBlueprintState(args)

      case 'list_node_types':
        return listNodeTypes(args)

      case 'create_node':
        return createNode(args)

      case 'delete_node':
        return deleteNode(args)

      case 'update_node_config':
        return updateNodeConfig(args)

      case 'connect_nodes':
        return connectNodes(args)

      case 'disconnect_nodes':
        return disconnectNodes(args)

      case 'get_project_info':
        return getProjectInfo()

      case 'get_node_info':
        return getNodeInfo(args)

      case 'select_node':
        return selectNode(args)

      case 'set_node_text':
        return setNodeText(args)

      case 'execute_node':
        return executeNode(args)

      case 'auto_layout':
        return autoLayout(args)

      case 'list_node_tasks':
        return listNodeTasks(args)

      default:
        throw new Error(`Unknown tool: ${toolName}`)
    }
  }

  const getBlueprintState = (args: Record<string, unknown>) => {
    const nodes = typeof payload.getAllNodes === 'function' ? payload.getAllNodes() : []
    const edges = typeof payload.getAllEdges === 'function' ? payload.getAllEdges() : []
    const selectedNode = typeof payload.getSelectedNode === 'function' ? payload.getSelectedNode() : null

    const includeNodes = args.includeNodes !== false
    const includeEdges = args.includeEdges !== false

    const nodeTypeStats: Record<string, number> = {}
    for (const n of nodes) {
      const t = String(n.type || 'unknown')
      nodeTypeStats[t] = (nodeTypeStats[t] || 0) + 1
    }

    const vp = payload.viewport?.value
    const zoom = Math.max(0.01, Number(vp?.zoom) || 1)
    const panX = Number(vp?.panX) || 0
    const panY = Number(vp?.panY) || 0

    return {
      ok: true,
      blueprint: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        nodeTypeStats,
        selectedNode: selectedNode
          ? {
              id: selectedNode.id,
              type: selectedNode.type,
              label:
                (selectedNode as { title?: string }).title ||
                (selectedNode as { name?: string }).name ||
                selectedNode.type,
            }
          : null,
        viewport: {
          zoom,
          panX,
          panY,
          centerWorldX: -panX / zoom,
          centerWorldY: -panY / zoom,
        },
        nodes: includeNodes
          ? nodes.slice(0, 100).map((n) => ({
              id: n.id,
              type: n.type,
              label:
                (n as { title?: string }).title ||
                (n as { name?: string }).name ||
                n.type,
              x: n.worldX,
              y: n.worldY,
            }))
          : undefined,
        edges: includeEdges
          ? edges.slice(0, 200).map((e) => ({
              id: e.id || '',
              from: e.fromNodeId || '',
              to: e.toNodeId || '',
              fromPort: e.fromAnchorId || '',
              toPort: e.toAnchorId || '',
            }))
          : undefined,
      },
    }
  }

  const listNodeTypes = (args: Record<string, unknown>) => {
    if (typeof payload.getNodeTypes === 'function') {
      const types = payload.getNodeTypes(String(args.category || ''))
      return { ok: true, types }
    }
    return { ok: true, types: [] }
  }

  const createNode = (args: Record<string, unknown>) => {
    const actionId = String(args.type || '')
    if (!actionId) throw new Error('type is required')

    const catalogItem = NEWUI2_NODE_CATALOG.find((item) => item.actionId === actionId)
    const nodeType = catalogItem?.nodeType || actionId
    const label = catalogItem?.label || actionId

    const title = String(args.title || label).trim() || label
    const alias = String(args.alias || title).trim() || title

    const zoom = Math.max(0.01, Number(payload.viewport?.value?.zoom) || 1)
    const panX = Number(payload.viewport?.value?.panX) || 0
    const panY = Number(payload.viewport?.value?.panY) || 0

    const isPositionFree = (testX: number, testY: number, excludeNodeId?: string): boolean => {
      const currentNodes = payload.store.state.nodesById
      return !Object.values(currentNodes).some((n) => {
        if (excludeNodeId && n.id === excludeNodeId) return false
        const nw = n.width || NODE_DEFAULT_WIDTH
        const nh = n.height || NODE_DEFAULT_HEIGHT
        const dx = Math.abs(testX - (n.worldX || 0))
        const dy = Math.abs(testY - (n.worldY || 0))
        return dx < (nw + NODE_SPACING) && dy < (nh + NODE_SPACING)
      })
    }

    let worldX: number
    let worldY: number

    const findPositionNear = (anchorX: number, anchorY: number): { x: number; y: number } | null => {
      if (isPositionFree(anchorX, anchorY)) {
        return { x: anchorX, y: anchorY }
      }
      const directions = [
        { dx: GRID_STEP_X, dy: 0 },
        { dx: 0, dy: GRID_STEP_Y },
        { dx: -GRID_STEP_X, dy: 0 },
        { dx: 0, dy: -GRID_STEP_Y },
      ]
      for (let ring = 1; ring <= 6; ring++) {
        for (let side = 0; side < 4; side++) {
          const steps = ring * 2
          for (let step = 0; step < steps; step++) {
            let tx = anchorX
            let ty = anchorY
            switch (side) {
              case 0:
                tx = anchorX + ring * GRID_STEP_X
                ty = anchorY - ring * GRID_STEP_Y + step * GRID_STEP_Y
                break
              case 1:
                tx = anchorX + ring * GRID_STEP_X - step * GRID_STEP_X
                ty = anchorY + ring * GRID_STEP_Y
                break
              case 2:
                tx = anchorX - ring * GRID_STEP_X
                ty = anchorY + ring * GRID_STEP_Y - step * GRID_STEP_Y
                break
              case 3:
                tx = anchorX - ring * GRID_STEP_X + step * GRID_STEP_X
                ty = anchorY - ring * GRID_STEP_Y
                break
            }
            if (isPositionFree(tx, ty)) {
              return { x: tx, y: ty }
            }
          }
        }
      }
      for (const dir of directions) {
        for (let dist = 1; dist <= 10; dist++) {
          const tx = anchorX + dir.dx * dist
          const ty = anchorY + dir.dy * dist
          if (isPositionFree(tx, ty)) {
            return { x: tx, y: ty }
          }
        }
      }
      return null
    }

    const lastSessionNodeId = sessionCreatedNodeIds.length > 0
      ? sessionCreatedNodeIds[sessionCreatedNodeIds.length - 1]
      : null
    const lastSessionNode = lastSessionNodeId
      ? payload.store.state.nodesById[lastSessionNodeId]
      : null

    if (lastSessionNode) {
      const anchorX = (lastSessionNode.worldX || 0) + ((lastSessionNode.width || NODE_DEFAULT_WIDTH) + NODE_SPACING)
      const anchorY = lastSessionNode.worldY || 0
      const pos = findPositionNear(anchorX, anchorY)
      if (pos) {
        worldX = pos.x
        worldY = pos.y
      } else {
        const viewportCenterWorldX = -panX / zoom
        const viewportCenterWorldY = -panY / zoom
        worldX = viewportCenterWorldX - NODE_DEFAULT_WIDTH / 2
        worldY = viewportCenterWorldY - NODE_DEFAULT_HEIGHT / 2
        const centerPos = findPositionNear(worldX, worldY)
        if (centerPos) {
          worldX = centerPos.x
          worldY = centerPos.y
        }
      }
    } else {
      const viewportCenterWorldX = -panX / zoom
      const viewportCenterWorldY = -panY / zoom
      worldX = viewportCenterWorldX - NODE_DEFAULT_WIDTH / 2
      worldY = viewportCenterWorldY - NODE_DEFAULT_HEIGHT / 2
      const pos = findPositionNear(worldX, worldY)
      if (pos) {
        worldX = pos.x
        worldY = pos.y
      }
    }

    if (typeof worldX !== 'number' || typeof worldY !== 'number' || Number.isNaN(worldX) || Number.isNaN(worldY)) {
      worldX = -panX / zoom - NODE_DEFAULT_WIDTH / 2
      worldY = -panY / zoom - NODE_DEFAULT_HEIGHT / 2
    }

    let nodeId: string | null = null
    let usedEngineSuccess = false
    if (payload.engineApi?.addNode) {
      nodeId = payload.engineApi.addNode(nodeType, worldX, worldY, { title, alias })
      usedEngineSuccess = Boolean(nodeId)
    }
    if (!nodeId) {
      payload.store.commit('addNodeAt', {
        worldX,
        worldY,
        title
      })
      nodeId = String(payload.store.state.selectedNodeId ?? '').trim()
    }
    if (!nodeId) {
      payload.pushToast(t('aiworkflow.toast.agentCreateNodeFailed', { label }), 'warn')
      return {
        ok: false,
        error: 'Failed to get node ID after creation'
      }
    }

    const finalNodeId: string = nodeId
    sessionCreatedNodeIds.push(finalNodeId)

    if (!usedEngineSuccess) {
      const validNodeTypes = ['base', 'text', 'text-merge', 'image', 'rotate-image', 'video', 'scene-understanding', 'scene-decompose', 'scene-layout', 'unreal-export', 'story', 'comfyui', 'model3d'] as const
      if (validNodeTypes.includes(nodeType as typeof validNodeTypes[number])) {
        payload.store.commit('setNodeType', { nodeId: finalNodeId, type: nodeType as typeof validNodeTypes[number] })
      }
      payload.store.commit('setNodeAlias', { nodeId: finalNodeId, alias })
    }

    if (args.config && typeof args.config === 'object') {
      if (usedEngineSuccess && payload.engineApi?.updateNodeData) {
        payload.engineApi.updateNodeData(finalNodeId, args.config as Record<string, any>)
      } else {
        Object.entries(args.config).forEach(([key, value]) => {
          payload.store.commit('upsertNode', {
            node: {
              ...payload.store.state.nodesById[finalNodeId],
              id: finalNodeId,
              [key]: value
            }
          })
        })
      }
    }

    payload.pushToast(t('aiworkflow.toast.agentNodeCreated', { label }), 'info')

    const focusNodeFn = payload.focusNode
    if (typeof focusNodeFn === 'function') {
      setTimeout(() => focusNodeFn(finalNodeId), 150)
    }

    return {
      ok: true,
      nodeId: finalNodeId,
      nodeType: nodeType,
      title,
      position: { x: worldX, y: worldY }
    }
  }

  const deleteNode = (args: Record<string, unknown>) => {
    const nodeId = String(args.nodeId || '')
    if (!nodeId) throw new Error('nodeId is required')

    const node = payload.store.state.nodesById[nodeId]
    if (!node) {
      return {
        ok: false,
        error: `Node ${nodeId} not found`
      }
    }

    if (payload.engineApi?.removeNode) {
      payload.engineApi.removeNode(nodeId)
    } else {
      payload.store.commit('removeNode', { nodeId })
    }
    payload.pushToast(t('aiworkflow.toast.agentNodeDeleted', { id: nodeId }), 'info')
    return {
      ok: true,
      nodeId,
      note: 'Node deleted successfully'
    }
  }

  const updateNodeConfig = (args: Record<string, unknown>) => {
    const nodeId = String(args.nodeId || '')
    if (!nodeId) throw new Error('nodeId is required')

    const config = args.config
    if (config && typeof config === 'object') {
      Object.entries(config).forEach(([key, value]) => {
        payload.store.commit('upsertNode', {
          node: {
            ...payload.store.state.nodesById[nodeId],
            id: nodeId,
            [key]: value
          }
        })
      })
      const configKeys = Object.keys(config).join(', ')
      payload.pushToast(t('aiworkflow.toast.agentNodeUpdated', { id: nodeId, keys: configKeys }), 'info')
      return {
        ok: true,
        nodeId,
        updatedKeys: configKeys,
      }
    }

    payload.pushToast(t('aiworkflow.toast.agentUpdateNoData', { id: nodeId }), 'info')
    return {
      ok: true,
      note: 'No config data provided for update.',
      nodeId,
    }
  }

  const connectNodes = (args: Record<string, unknown>) => {
    const fromNodeId = String(args.fromNode || '')
    const toNodeId = String(args.toNode || '')
    const fromPort = String(args.fromPort || 'out-0')
    const toPort = String(args.toPort || 'in-0')

    if (!fromNodeId || !toNodeId) {
      throw new Error('fromNode and toNode are required')
    }

    const fromNode = payload.store.state.nodesById[fromNodeId]
    const toNode = payload.store.state.nodesById[toNodeId]

    if (!fromNode) {
      return { ok: false, error: `Source node ${fromNodeId} not found` }
    }
    if (!toNode) {
      return { ok: false, error: `Target node ${toNodeId} not found` }
    }

    const fromAnchor = fromNode.outputs?.find((a) => a.id === fromPort || a.label === fromPort)
    const toAnchor = toNode.inputs?.find((a) => a.id === toPort || a.label === toPort)

    const resolvedFromPort = fromAnchor?.id || fromPort
    const resolvedToPort = toAnchor?.id || toPort

    let connected = false
    if (payload.engineApi?.connectPorts) {
      connected = payload.engineApi.connectPorts(fromNodeId, resolvedFromPort, toNodeId, resolvedToPort)
    }
    if (!connected) {
      payload.store.commit('addEdge', {
        fromNodeId,
        fromAnchorId: resolvedFromPort,
        toNodeId,
        toAnchorId: resolvedToPort
      })
    }

    payload.pushToast(t('aiworkflow.toast.agentNodesConnected'), 'info')
    return {
      ok: true,
      edgeId: payload.store.state.selectedEdgeId,
      fromNode: fromNodeId,
      fromPort: resolvedFromPort,
      toNode: toNodeId,
      toPort: resolvedToPort
    }
  }

  const disconnectNodes = (args: Record<string, unknown>) => {
    const edgeId = String(args.edgeId || '')
    const nodeId = String(args.nodeId || '')
    const portType = String(args.portType || 'all')

    if (edgeId) {
      const edge = payload.store.state.edgesById[edgeId]
      if (!edge) {
        return { ok: false, error: `Edge ${edgeId} not found` }
      }
      if (payload.engineApi?.removeEdge) {
        payload.engineApi.removeEdge(edgeId)
      } else {
        payload.store.commit('removeEdge', { edgeId })
      }
      payload.pushToast(t('aiworkflow.toast.agentEdgeDisconnected', { id: edgeId }), 'info')
      return { ok: true, edgeId, note: 'Edge disconnected successfully' }
    }

    if (nodeId) {
      const node = payload.store.state.nodesById[nodeId]
      if (!node) {
        return { ok: false, error: `Node ${nodeId} not found` }
      }

      const edgesToRemove: string[] = []
      for (const eId of payload.store.state.edgeOrder) {
        const e = payload.store.state.edgesById[eId]
        if (!e) continue
        if (portType === 'input' || portType === 'all') {
          if (e.toNodeId === nodeId) edgesToRemove.push(eId)
        }
        if (portType === 'output' || portType === 'all') {
          if (e.fromNodeId === nodeId) edgesToRemove.push(eId)
        }
      }

      for (const eId of edgesToRemove) {
        if (payload.engineApi?.removeEdge) {
          payload.engineApi.removeEdge(eId)
        } else {
          payload.store.commit('removeEdge', { edgeId: eId })
        }
      }

      payload.pushToast(t('aiworkflow.toast.agentNodeDisconnected', { id: nodeId, count: edgesToRemove.length }), 'info')
      return { ok: true, nodeId, removedEdges: edgesToRemove.length, note: 'Node connections disconnected successfully' }
    }

    throw new Error('Either edgeId or nodeId is required')
  }

  const getProjectInfo = () => {
    if (typeof payload.getProjectInfo === 'function') {
      return { ok: true, ...payload.getProjectInfo() }
    }
    return { ok: true, name: '', id: null }
  }

  const getNodeInfo = (args: Record<string, unknown>) => {
    const nodeId = String(args.nodeId || '')
    if (!nodeId) throw new Error('nodeId is required')

    const node = payload.store.state.nodesById[nodeId]
    if (!node) {
      return { ok: false, error: `Node ${nodeId} not found` }
    }

    const nodeTasks = payload.store.state.nodeGenerationTasksById
    const taskIdsForNode = payload.store.state.nodeGenerationTaskIdsByNodeId[nodeId] || []
    const tasks = taskIdsForNode.map((taskId) => nodeTasks[taskId]).filter(Boolean)

    return {
      ok: true,
      node: {
        id: node.id,
        type: node.type,
        title: node.title,
        alias: node.alias,
        position: { x: node.worldX, y: node.worldY },
        inputs: node.inputs?.map((a) => ({ id: a.id, label: a.label, mediaType: a.mediaType })) || [],
        outputs: node.outputs?.map((a) => ({ id: a.id, label: a.label, mediaType: a.mediaType })) || [],
        textValue: (node as { textValue?: string }).textValue,
        resourceId: node.resourceId,
        taskCount: tasks.length,
        latestTask: tasks.length > 0 ? tasks[tasks.length - 1] : null,
      }
    }
  }

  const selectNode = (args: Record<string, unknown>) => {
    const nodeId = String(args.nodeId || '')
    if (!nodeId) throw new Error('nodeId is required')

    const node = payload.store.state.nodesById[nodeId]
    if (!node) {
      return { ok: false, error: `Node ${nodeId} not found` }
    }

    payload.store.commit('setSelectedNode', { nodeId })
    const focusNodeFn = payload.focusNode
    if (typeof focusNodeFn === 'function') {
      setTimeout(() => {
        focusNodeFn(nodeId)
      }, 50)
    }

    return { ok: true, nodeId }
  }

  const setNodeText = (args: Record<string, unknown>) => {
    const nodeId = String(args.nodeId || '')
    const text = String(args.text || '')
    if (!nodeId) throw new Error('nodeId is required')

    const node = payload.store.state.nodesById[nodeId]
    if (!node) {
      return { ok: false, error: `Node ${nodeId} not found` }
    }

    if (node.type === 'text') {
      payload.store.commit('upsertNode', {
        node: { ...node, id: nodeId, textValue: text }
      })
    } else {
      payload.store.commit('upsertNode', {
        node: { ...node, id: nodeId, prompt: text }
      })
    }

    payload.pushToast(t('aiworkflow.toast.agentNodeTextSet', { id: nodeId }), 'info')
    return { ok: true, nodeId }
  }

  const executeNode = (_args: Record<string, unknown>) => {
    return {
      ok: true,
      note: 'Node execution requires user approval. Please click the execute button on the node.'
    }
  }

  const autoLayout = (args: Record<string, unknown>) => {
    const direction = String(args.direction || 'horizontal') as 'horizontal' | 'vertical'
    const spacing = Math.max(100, Number(args.spacing) || 200)

    let targetNodeIds: string[] = []
    if (Array.isArray(args.nodeIds) && args.nodeIds.length > 0) {
      targetNodeIds = args.nodeIds.map((id) => String(id)).filter((id) => !!payload.store.state.nodesById[id])
    } else {
      targetNodeIds = sessionCreatedNodeIds.filter((id) => !!payload.store.state.nodesById[id])
    }

    if (targetNodeIds.length === 0) {
      return { ok: true, note: 'No nodes to layout (provide nodeIds or create nodes first)' }
    }

    const allNodes = typeof payload.getAllNodes === 'function' ? payload.getAllNodes() : []
    const nodesById = new Map(allNodes.map((n) => [n.id, n]))
    const nodesToLayout = targetNodeIds.map((id) => nodesById.get(id)).filter((n): n is WorkflowNode => !!n)

    if (nodesToLayout.length === 0) {
      return { ok: true, note: 'Specified nodes not found' }
    }

    const sortedNodes = [...nodesToLayout].sort((a, b) => {
      if (direction === 'horizontal') {
        return (a.worldX || 0) - (b.worldX || 0)
      }
      return (a.worldY || 0) - (b.worldY || 0)
    })

    const startX = sortedNodes[0].worldX || 0
    const startY = sortedNodes[0].worldY || 0

    sortedNodes.forEach((node, index) => {
      if (direction === 'horizontal') {
        payload.store.commit('setNodePosition', {
          nodeId: node.id,
          worldX: startX + index * spacing,
          worldY: startY
        })
      } else {
        payload.store.commit('setNodePosition', {
          nodeId: node.id,
          worldX: startX,
          worldY: startY + index * spacing
        })
      }
    })

    payload.pushToast(t('aiworkflow.toast.agentAutoLayout', { count: nodesToLayout.length }), 'info')
    return {
      ok: true,
      arrangedNodes: nodesToLayout.length,
      direction,
      spacing
    }
  }

  const listNodeTasks = (args: Record<string, unknown>) => {
    const nodeId = args.nodeId ? String(args.nodeId) : null
    const statusFilter = args.status ? String(args.status) : null

    const nodeTasks = payload.store.state.nodeGenerationTasksById
    const taskIdsByNode = payload.store.state.nodeGenerationTaskIdsByNodeId

    const tasks: unknown[] = []

    if (nodeId) {
      const taskIds = taskIdsByNode[nodeId] || []
      for (const taskId of taskIds) {
        const task = nodeTasks[taskId]
        if (task && (!statusFilter || task.status === statusFilter)) {
          tasks.push(task)
        }
      }
    } else {
      for (const nodeIdKey in taskIdsByNode) {
        const taskIds = taskIdsByNode[nodeIdKey]
        for (const taskId of taskIds) {
          const task = nodeTasks[taskId]
          if (task && (!statusFilter || task.status === statusFilter)) {
            tasks.push({ ...task, nodeId: nodeIdKey })
          }
        }
      }
    }

    return {
      ok: true,
      taskCount: tasks.length,
      tasks: tasks.slice(0, 50)
    }
  }

  const approveTool = async (requestId: string) => {
    const item = payload.toolApprovalQueue.value.find((i) => i.requestId === requestId)
    if (!item || item.status !== 'pending') return

    updateApprovalItem(requestId, { status: 'executing' })
    try {
      const result = await executeTool(item.toolName, item.args)
      updateApprovalItem(requestId, { status: 'completed', result })
      respondTool(requestId, result)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err)
      updateApprovalItem(requestId, { status: 'error', error: msg })
      respondTool(requestId, undefined, msg)
    }
  }

  const rejectTool = (requestId: string, reason?: string) => {
    const item = payload.toolApprovalQueue.value.find((i) => i.requestId === requestId)
    if (!item || item.status !== 'pending') return

    const msg = reason || 'User rejected the operation'
    updateApprovalItem(requestId, { status: 'rejected', error: msg })
    respondTool(requestId, undefined, msg)
  }

  const setupToolListener = () => {
    if (!hasIpc()) return
    const bridge = getMcpBridge()
    if (bridge.dweb?.mcp?.onBuiltinToolCall) {
      listenerId = bridge.dweb.mcp.onBuiltinToolCall(handleToolCall)
    }
  }

  const cleanupToolListener = () => {
    if (listenerId >= 0 && hasIpc()) {
      const bridge = getMcpBridge()
      if (bridge.dweb?.mcp?.offBuiltinToolCall) {
        bridge.dweb.mcp.offBuiltinToolCall(listenerId)
      }
      listenerId = -1
    }
  }

  return {
    setupToolListener,
    cleanupToolListener,
    approveTool,
    rejectTool,
    executeTool,
  }
}

export type { ToolApprovalItem, ToolCallPayload }
