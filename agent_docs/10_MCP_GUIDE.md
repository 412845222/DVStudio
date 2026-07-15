# MCP (Model Context Protocol) 开发指南

## 目录
1. [MCP 概述](#mcp-概述)
2. [架构设计](#架构设计)
3. [内置工具](#内置工具)
4. [外部 MCP 服务器](#外部-mcp-服务器)
5. [ToolExecutor](#toolexecutor)
6. [IPC 接口](#ipc-接口)
7. [前端集成](#前端集成)
8. [添加新工具](#添加新工具)
9. [关键文件位置](#关键文件位置)

---

## MCP 概述

### 什么是 MCP

MCP (Model Context Protocol) 是 DVStudio 中用于 Agent 工具调用的统一协议层。它提供：

- **内置工具**: 操作工作流蓝图的13个内置工具
- **外部服务器连接**: 通过 stdio/socket 连接外部 MCP 服务器（如 Blender MCP）
- **统一工具执行**: ToolExecutor 统一调度内置工具和外部工具
- **IPC 桥接**: 内置工具通过 IPC 在前端执行

### 核心能力

| 能力 | 说明 |
|-----|------|
| 工具注册 | 动态注册工具定义（名称、描述、参数 schema） |
| 工具调用 | 统一调用接口，支持内置/外部工具路由 |
| 多桥接 | stdio（子进程）和 socket（TCP）两种连接方式 |
| 服务器管理 | 连接/断开、状态查询、工具列表同步 |
| 内置桥接 | IPC 桥接，内置工具在前端渲染进程执行 |

---

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Vue)                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │               Tool Call Handler                       │  │
│  │  (操作 Vuex / 画布 / 节点 / 连线)                     │  │
│  └───────────────────────────┬───────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────┘
                               │ IPC (dweb:builtin-tool:call)
┌──────────────────────────────┼──────────────────────────────┐
│ Electron Backend             │                              │
│  ┌───────────────────────────▼───────────────────────────┐  │
│  │                     ToolExecutor                      │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │  │
│  │  │ Builtin      │  │ MCP Client   │  │ Future:      │ │  │
│  │  │ Tools Router │  │ (ext servers)│  │ Other impls  │ │  │
│  │  └──────────────┘  └──────┬───────┘  └──────────────┘ │  │
│  └──────────────────────────┬─┴───────────────────────────┘  │
│                             │                                │
│  ┌──────────────────────────▼─────────────────────────────┐ │
│  │                     MCP Module                         │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │ │
│  │  │ stdioBridge  │  │ socketBridge │  │ Client       │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │ │
│  └──────────────────────────┬─────────────────────────────┘ │
└─────────────────────────────┼───────────────────────────────┘
                              │
           ┌──────────────────┴──────────────────┐
           │                                     │
    ┌──────▼──────┐                      ┌───────▼───────┐
    │  Blender    │                      │  Other MCP     │
    │  MCP Server │                      │  Servers      │
    │  (Addon)    │                      │  (stdio/TCP)   │
    └─────────────┘                      └───────────────┘
```

### 目录结构

```
electron/backend/modules/mcp/
├── server/
│   ├── stdioBridge.mjs       # stdio 桥接（子进程通信）
│   ├── socketBridge.mjs      # socket 桥接（TCP通信）
│   └── DVStudioMCPServer.mjs # DVStudio 内置 MCP 服务器（可选）
├── builtinTools.mjs          # 内置工具注册
├── client.mjs                # MCP 客户端（连接外部服务器）
├── handlers.mjs              # IPC handlers
├── routes.mjs                # IPC 路由定义
└── toolExecutor.mjs          # 统一工具执行器
```

---

## 内置工具

### 工具列表

DVStudio 注册了13个工作流蓝图操作内置工具：

| 工具名 | 描述 | 关键参数 |
|-------|------|---------|
| `get_blueprint_state` | 获取当前蓝图状态（节点、连线、视口、选中） | `includeNodes`, `includeEdges` |
| `list_node_types` | 列出可用节点类型，支持分类筛选 | `category` |
| `create_node` | 创建新节点（自动放置在视口中心，不要传position） | `type` (必填), `title`, `config` |
| `delete_node` | 删除节点（危险操作） | `nodeId` (必填), `force` |
| `update_node_config` | 更新节点配置 | `nodeId` (必填), `config` (必填) |
| `connect_nodes` | 连接两个节点端口 | `fromNode`, `fromPort`, `toNode`, `toPort` (均必填) |
| `disconnect_nodes` | 断开连接 | `edgeId` 或 `nodeId`, `portType` |
| `get_project_info` | 获取当前项目基本信息 | - |
| `get_node_info` | 获取指定节点详情 | `nodeId` (必填) |
| `select_node` | 选中节点（画布高亮） | `nodeId` (必填) |
| `set_node_text` | 设置文本节点内容或提示词 | `nodeId` (必填), `text` (必填) |
| `execute_node` | 执行节点（提交生成任务，危险操作） | `nodeId` (必填) |
| `auto_layout` | 自动布局节点（仅用户明确要求时使用） | `nodeIds`, `direction`, `spacing` |
| `list_node_tasks` | 列出节点生成任务记录 | `nodeId`, `status` |

### 工具注册示例

在 `builtinTools.mjs` 中注册工具：

```javascript
executor.registerTool(
  'create_node',
  '在工作流蓝图中创建新节点。重要提示：新节点会自动放置在用户当前蓝图视口中心（自动避开已有节点），你不需要也不应该传入position/x/y参数。创建前建议先调用 list_node_types 获取正确的节点类型ID。',
  {
    type: 'object',
    required: ['type'],
    properties: {
      type: {
        type: 'string',
        description: '节点类型ID，必须是list_node_types返回的有效type值。'
      },
      title: {
        type: 'string',
        description: '节点显示名称，可选'
      },
      config: {
        type: 'object',
        description: '节点初始配置参数，可选'
      }
    }
  }
)
```

### 内置工具执行流程

1. Agent Runtime 收到 LLM 的 function_call
2. 调用 `ToolExecutor.executeTool(toolName, args)`
3. ToolExecutor 识别为内置工具
4. 通过 IPC 发送 `dweb:builtin-tool:call` 事件到前端
5. 前端 `useAgentToolBridge.ts` 监听并执行对应操作
6. 前端通过 `dweb:builtin-tool:${requestId}:response` 通道返回结果
7. ToolExecutor 将结果返回给 Agent Runtime

---

## 外部 MCP 服务器

### 支持的桥接方式

| 桥接方式 | 文件 | 适用场景 |
|---------|------|---------|
| **stdio** | `server/stdioBridge.mjs` | 本地子进程 MCP 服务器（如 CLI 工具） |
| **socket** | `server/socketBridge.mjs` | TCP socket MCP 服务器（如 Blender Addon） |

### Blender MCP 集成

Blender 通过 socket 桥接连接：

1. Blender 启用 MCP Addon，启动 TCP 服务器
2. DVStudio 通过 `dweb:blender:mcp:connect` 连接
3. 连接成功后，Blender 的工具自动注册到 ToolExecutor
4. Agent 可以直接调用 Blender 工具（如创建物体、修改材质等）

Blender 相关操作封装在 `electron/backend/modules/blender/` 模块中，详见 [08_3D_EDITOR_RENDERING_GUIDE.md#blender-mcp-集成](08_3D_EDITOR_RENDERING_GUIDE.md#blender-mcp-集成)。

### 连接外部服务器

通过 IPC 接口连接外部 MCP 服务器：

```javascript
// 连接 socket 服务器（如 Blender）
await window.dweb.mcp.connect({
  type: 'socket',
  host: 'localhost',
  port: 9876,
  serverId: 'blender'
})

// 连接 stdio 服务器
await window.dweb.mcp.connect({
  type: 'stdio',
  command: 'path/to/mcp-server',
  args: ['--arg1', 'value'],
  serverId: 'my-server'
})
```

---

## ToolExecutor

### 核心职责

`toolExecutor.mjs` 是工具执行的统一入口：

- 注册工具定义（内置工具和外部 MCP 工具）
- 根据工具名路由到对应执行器
- 处理 IPC 桥接（内置工具）
- 处理外部 MCP 工具调用
- 维护工具列表和状态

### 核心 API

```javascript
// 获取单例
const executor = getToolExecutor()

// 注册工具
executor.registerTool(name, description, parametersSchema)

// 执行工具
const result = await executor.executeTool(toolName, args, context)

// 列出所有工具
const tools = executor.listTools()

// 注册 IPC 桥接（内置工具）
executor.registerIPCBridge()

// 注册外部 MCP 服务器工具
executor.registerMCPTools(serverId, tools)
```

### 工具定义格式

工具定义遵循 JSON Schema 格式：

```javascript
{
  name: 'tool_name',
  description: '工具功能描述（给LLM看的，要清晰）',
  parameters: {
    type: 'object',
    required: ['param1'],
    properties: {
      param1: {
        type: 'string',
        description: '参数1说明'
      },
      param2: {
        type: 'number',
        description: '参数2说明'
      }
    }
  }
}
```

---

## IPC 接口

### MCP 模块接口

| Channel | 说明 | 参数 |
|---------|------|------|
| `dweb:mcp:connect` | 连接 MCP 服务器 | `{ type: 'stdio'|'socket', ...connectionParams }` |
| `dweb:mcp:disconnect` | 断开连接 | `{ serverId }` |
| `dweb:mcp:list-tools` | 列出工具 | `{ serverId? }` |
| `dweb:mcp:call-tool` | 调用工具 | `{ serverId?, toolName, arguments }` |
| `dweb:mcp:register-builtin` | 注册内置工具 | - |
| `dweb:mcp:get-status` | 获取 MCP 状态 | - |
| `dweb:mcp:list-servers` | 列出已连接服务器 | - |
| `dweb:mcp:get-bridge-status` | 获取桥接状态 | `{ serverId }` |
| `dweb:mcp:get-bridge-script` | 获取桥接脚本路径 | - |

### 内置工具桥接事件

| 通道 | 方向 | 说明 |
|-----|------|------|
| `dweb:builtin-tool:call` | 后端→前端 | 请求执行内置工具 |
| `dweb:builtin-tool:${requestId}:response` | 前端→后端 | 返回工具执行结果 |
| `dweb:blender:mcp:status-changed` | 后端→前端 | Blender MCP 状态变更 |

---

## 前端集成

### 监听内置工具调用

在前端使用 `window.dweb.mcp.onBuiltinToolCall` 监听工具调用：

```typescript
const listenerId = window.dweb.mcp.onBuiltinToolCall((payload) => {
  const { requestId, toolName, arguments: args } = payload
  
  let result
  let error = null
  
  try {
    switch (toolName) {
      case 'get_blueprint_state':
        result = getBlueprintState(args)
        break
      case 'create_node':
        result = createNode(args)
        break
      // ... 其他工具
      default:
        error = `Unknown tool: ${toolName}`
    }
  } catch (err) {
    error = err.message
  }
  
  window.dweb.mcp.respondBuiltinTool(requestId, result, error)
})

// 取消监听
window.dweb.mcp.offBuiltinToolCall(listenerId)
```

### useAgentToolBridge

DVStudio 在 `src/views/AIWorkflow/node-business/chat/useAgentToolBridge.ts` 中提供了统一的工具桥接 composable，已处理所有内置工具的实现。

### Blender 前端集成

Blender 节点业务位于 `src/views/AIWorkflow/node-business/blender/`：

- `useBlenderAgentChat.ts` - Blender 节点 Agent 聊天
- `useBlenderUpstreamInputs.ts` - 上游输入（图片/模型）处理

前端通过 `window.dweb.blender.*` 调用 Blender 相关 IPC：

```typescript
// 检查 Blender 状态
const status = await window.dweb.blender.checkStatus()

// 连接 Blender MCP
await window.dweb.blender.mcpConnect({ port: 9876 })

// 调用 Blender 工具
const result = await window.dweb.blender.mcpCallTool({
  toolName: 'create_object',
  arguments: { type: 'CUBE', location: [0, 0, 0] }
})
```

---

## 添加新工具

### 添加内置工具步骤

1. 在 `electron/backend/modules/mcp/builtinTools.mjs` 中注册工具定义
2. 在前端 `useAgentToolBridge.ts` 中添加工具处理逻辑
3. 工具实现应该操作 Vuex store 或画布，不要直接调用后端 API
4. 返回结果应该是可序列化的 JSON 对象

### 连接新的外部 MCP 服务器

1. 确认服务器支持 stdio 或 socket 连接
2. 通过 `dweb:mcp:connect` IPC 接口建立连接
3. 工具会自动注册到 ToolExecutor
4. Agent 可以自动发现和使用这些工具

### 工具设计原则

1. **原子性**: 每个工具做一件事，不要做复合操作
2. **幂等性**: 重复调用相同参数应该产生相同结果（或明确是副作用操作）
3. **描述清晰**: 工具描述和参数说明要让 LLM 能理解何时使用
4. **参数最少**: 只暴露必要参数，能推断的不要让 LLM 传
5. **错误明确**: 错误信息要清晰，告诉 LLM 如何修正
6. **避免位置参数**: 节点创建等操作自动计算位置，不要让 LLM 传坐标

---

## 关键文件位置

| 关注点 | 路径 |
|-------|------|
| MCP 后端模块 | `electron/backend/modules/mcp/` |
| ToolExecutor | `electron/backend/modules/mcp/toolExecutor.mjs` |
| 内置工具注册 | `electron/backend/modules/mcp/builtinTools.mjs` |
| MCP 客户端 | `electron/backend/modules/mcp/client.mjs` |
| stdio 桥接 | `electron/backend/modules/mcp/server/stdioBridge.mjs` |
| socket 桥接 | `electron/backend/modules/mcp/server/socketBridge.mjs` |
| Blender 后端模块 | `electron/backend/modules/blender/` |
| 前端工具桥接 | `src/views/AIWorkflow/node-business/chat/useAgentToolBridge.ts` |
| Blender 节点业务 | `src/views/AIWorkflow/node-business/blender/` |
| Agent Runtime | `electron/backend/modules/agent/runtime/AgentRuntime.mjs` |
