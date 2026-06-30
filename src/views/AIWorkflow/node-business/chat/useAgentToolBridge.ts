import type { Ref } from 'vue'
import type { WorkflowNode, WorkflowEdge } from '../../../../aiworkflow/types'
import { NEWUI2_NODE_CATALOG } from '../../../../aiworkflow/nodeLibrary'

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
  state: {
    nodesById: Record<string, WorkflowNode>
    edgeOrder: string[]
    edgesById: Record<string, WorkflowEdge>
    selectedNodeId: string | null
  }
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
}

const DANGEROUS_TOOLS = new Set(['delete_node', 'disconnect_nodes'])

type MCPIpcBridge = {
  dweb?: {
    mcp?: {
      onBuiltinToolCall?: (handler: (payload: ToolCallPayload) => void) => number
      offBuiltinToolCall?: (listenerId: number) => { ok: boolean }
      respondBuiltinTool?: (requestId: string, result: unknown) => void
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

  const respondTool = (requestId: string, result: unknown) => {
    const bridge = getMcpBridge()
    if (bridge.dweb?.mcp?.respondBuiltinTool) {
      bridge.dweb.mcp.respondBuiltinTool(requestId, result)
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

    if (DANGEROUS_TOOLS.has(toolName)) {
      addApprovalItem(approvalItem)
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
      respondTool(requestId, { error: msg })
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
        nodes: includeNodes
          ? nodes.slice(0, 100).map((n) => ({
              id: n.id,
              type: n.type,
              label:
                (n as { title?: string }).title ||
                (n as { name?: string }).name ||
                n.type,
              x: (n as { x?: number }).x,
              y: (n as { y?: number }).y,
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

    const worldCenterX = -panX / zoom
    const worldCenterY = -panY / zoom

    payload.store.commit('addNodeAt', {
      worldX: worldCenterX,
      worldY: worldCenterY,
      title
    })

    const nodeId = String(payload.store.state.selectedNodeId ?? '').trim()
    if (!nodeId) {
      payload.pushToast(`创建 ${label} 节点失败：未获取到节点ID`, 'warn')
      return {
        ok: false,
        error: 'Failed to get node ID after creation'
      }
    }

    payload.store.commit('setNodeType', { nodeId, type: nodeType })
    payload.store.commit('setNodeAlias', { nodeId, alias })

    if (args.config && typeof args.config === 'object') {
      Object.entries(args.config).forEach(([key, value]) => {
        payload.store.commit('upsertNode', {
          node: {
            ...payload.store.state.nodesById[nodeId],
            id: nodeId,
            [key]: value
          }
        })
      })
    }

    const focusNodeFn = payload.focusNode
    if (typeof focusNodeFn === 'function') {
      setTimeout(() => {
        focusNodeFn(nodeId)
      }, 50)
    }

    payload.pushToast(`已在蓝图视口中心创建 ${label} 节点`, 'info')
    return {
      ok: true,
      nodeId,
      nodeType: nodeType,
      title,
      position: { x: worldCenterX, y: worldCenterY }
    }
  }

  const deleteNode = (args: Record<string, unknown>) => {
    const nodeId = String(args.nodeId || '')
    if (!nodeId) throw new Error('nodeId is required')

    payload.pushToast(`Agent 请求删除节点 ${nodeId}，请在蓝图中手动操作`, 'warn')
    return {
      ok: true,
      note: 'Node deletion requires user approval. The user has been notified.',
      suggestedAction: 'delete_node',
      suggestedNodeId: nodeId,
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
      payload.pushToast(`已更新节点 ${nodeId} 配置：${configKeys}`, 'info')
      return {
        ok: true,
        nodeId,
        updatedKeys: configKeys,
      }
    }

    payload.pushToast(`Agent 请求更新节点 ${nodeId} 配置，但未提供配置数据`, 'info')
    return {
      ok: true,
      note: 'No config data provided for update.',
      nodeId,
    }
  }

  const connectNodes = (args: Record<string, unknown>) => {
    const fromNode = String(args.fromNode || '')
    const toNode = String(args.toNode || '')

    payload.pushToast(`Agent 请求连接节点，请在蓝图中手动操作`, 'info')
    return {
      ok: true,
      note: 'Node connection requires manual operation. The user has been notified.',
      suggestedAction: 'connect_nodes',
      suggestedFrom: fromNode,
      suggestedTo: toNode,
    }
  }

  const disconnectNodes = (args: Record<string, unknown>) => {
    const edgeId = String(args.edgeId || '')
    if (!edgeId) throw new Error('edgeId is required')

    payload.pushToast(`Agent 请求断开连接 ${edgeId}，请在蓝图中手动操作`, 'warn')
    return {
      ok: true,
      note: 'Disconnection requires user approval. The user has been notified.',
      suggestedAction: 'disconnect_nodes',
      suggestedEdgeId: edgeId,
    }
  }

  const getProjectInfo = () => {
    if (typeof payload.getProjectInfo === 'function') {
      return { ok: true, ...payload.getProjectInfo() }
    }
    return { ok: true, name: '', id: null }
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
      respondTool(requestId, { error: msg })
    }
  }

  const rejectTool = (requestId: string, reason?: string) => {
    const item = payload.toolApprovalQueue.value.find((i) => i.requestId === requestId)
    if (!item || item.status !== 'pending') return

    updateApprovalItem(requestId, { status: 'rejected', error: reason || 'User rejected' })
    respondTool(requestId, { error: reason || 'User rejected the operation' })
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
