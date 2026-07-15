# Agent 系统开发指南

## 目录
1. [架构概述](#架构概述)
2. [Agent Runtime](#agent-runtime)
3. [Provider 层](#provider-层)
4. [工具注册与执行](#工具注册与执行)
5. [会话管理](#会话管理)
6. [前端集成](#前端集成)
7. [IPC 接口](#ipc-接口)
8. [关键文件位置](#关键文件位置)

---

## 架构概述

### 整体架构

DVStudio Agent 系统采用 **Runtime + Provider** 两层架构，统一编排所有 LLM 后端：

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Vue)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ AgentChat    │  │ NodeChat     │  │ BlenderAgentChat │  │
│  │ Service      │  │ Dialog       │  │                  │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
└─────────┼─────────────────┼───────────────────┼────────────┘
          │                 │                   │
          └─────────────────┼───────────────────┘
                            │ IPC (dweb:agent:stream)
┌───────────────────────────┼───────────────────────────────┐
│ Electron Backend          │                                │
│  ┌────────────────────────▼─────────────────────────────┐ │
│  │                  Agent Runtime                        │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │ │
│  │  │ Context      │  │ Tool Call    │  │ Stream      │ │ │
│  │  │ Builder      │  │ Loop         │  │ Manager     │ │ │
│  │  └──────────────┘  └──────┬───────┘  └─────────────┘ │ │
│  │                           │                           │ │
│  │  ┌────────────────────────▼────────────────────────┐ │ │
│  │  │              Tool Registry/Executor             │ │ │
│  │  │  (MCP builtin tools + external MCP servers)     │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  └────────────────────────┬─────────────────────────────┘ │
│                           │                                │
│  ┌────────────────────────▼─────────────────────────────┐ │
│  │                    Providers                         │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │ │
│  │  │ ApiLLM       │  │ CliLLM       │  │ Specialized │ │ │
│  │  │ Provider     │  │ Provider     │  │ Providers   │ │ │
│  │  │ (Doubao/     │  │ (Claude/     │  │ (DVSAgent/  │ │ │
│  │  │  Gemini/...) │  │  Codex/...)  │ │  Copilot)   │ │ │
│  │  └──────────────┘  └──────────────┘  └─────────────┘ │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 核心设计原则

1. **统一入口**: 所有 Agent 对话通过 `dweb:agent:stream` 统一入口
2. **Provider 抽象**: 不同 LLM 后端实现统一的 `ILLMProvider` 接口
3. **工具解耦**: 工具执行通过 MCP ToolExecutor 统一管理，支持内置工具和外部 MCP 服务器
4. **流式优先**: 所有对话采用流式响应，实时输出内容和工具调用
5. **会话持久化**: 对话历史存储在 LocalDB，支持跨会话恢复

---

## Agent Runtime

### 核心职责

`AgentRuntime` (`electron/backend/modules/agent/runtime/AgentRuntime.mjs`) 负责：

- 接收用户消息并启动对话流程
- 管理上下文构建（系统提示、历史消息、蓝图状态）
- 驱动工具调用循环（LLM 响应 → 工具调用 → 结果回传 → 继续）
- 流式输出事件（text、tool_call、tool_result、error、done）
- 会话中止与资源清理
- 限制最大工具调用次数（默认35次，防止无限循环）

### 流式事件格式

Runtime 通过异步生成器输出标准化事件：

```javascript
// 文本块
{ type: 'text', content: '正在分析当前蓝图状态...' }

// 工具调用开始
{ type: 'tool_call', id: 'call_xxx', name: 'get_blueprint_state', arguments: {...} }

// 工具调用结果
{ type: 'tool_result', id: 'call_xxx', result: {...} }

// 思考过程（可选）
{ type: 'thinking', content: '...' }

// 错误
{ type: 'error', message: '...' }

// 完成
{ type: 'done' }
```

### 上下文构建

`ContextBuilder` (`electron/backend/modules/agent/runtime/ContextBuilder.mjs`) 负责：

- 注入系统提示词
- 管理对话历史（支持token数量限制自动截断）
- 注入附件内容（图片等）
- 注入蓝图上下文（当前节点、项目信息等）
- 注入可用工具列表

---

## Provider 层

### Provider 接口

所有 Provider 实现 `ILLMProvider` 接口：

```javascript
class ILLMProvider {
  // 流式消息
  async *streamMessage(params) {
    // yield 标准化的消息块
  }

  // 中止请求
  abort(requestId) {}

  // 列出可用模型
  async listModels() { return [] }
}
```

### 内置 Provider 列表

| Provider | 文件 | 说明 |
|---------|------|------|
| `ApiLLMProvider` | `providers/ApiLLMProvider.mjs` | 通用 HTTP API Provider（支持 OpenAI 兼容格式） |
| `CliLLMProvider` | `providers/CliLLMProvider.mjs` | 外部 CLI 工具适配基类 |
| `DVSAgentProvider` | `providers/DVSAgentProvider.mjs` | DVStudio 增强 Agent Provider（含工具调用解析） |
| `DVSAgentEnhancedProvider` | `dvsagent/DVSAgentEnhancedProvider.mjs` | 增强版 Provider（图片处理等） |
| `CodexProvider` | `providers/CodexProvider.mjs` | OpenAI Codex CLI 适配 |
| `CopilotProvider` | `providers/CopilotProvider.mjs` | GitHub Copilot CLI 适配 |

### Provider 选择逻辑

在 `service.mjs` 中根据参数自动选择 Provider：

1. 如果指定了 `backend` 参数，使用对应 backend
2. 如果 `cliMode === true` 或 `apiSource` 是 `codex/copilot`，使用对应 CLI Provider
3. 默认使用 `dvsagent` backend（DVSAgentProvider）

---

## 工具注册与执行

### 内置 MCP 工具

Agent 系统通过 MCP ToolExecutor 注册和执行工具。内置工具在 `mcp/builtinTools.mjs` 中注册，共13个工作流操作工具：

| 工具名 | 说明 |
|-------|------|
| `get_blueprint_state` | 获取当前蓝图状态（节点、连线、视口） |
| `list_node_types` | 列出可用节点类型 |
| `create_node` | 创建新节点（自动放置在视口中心） |
| `delete_node` | 删除节点 |
| `update_node_config` | 更新节点配置 |
| `connect_nodes` | 连接两个节点 |
| `disconnect_nodes` | 断开连接 |
| `get_project_info` | 获取项目信息 |
| `get_node_info` | 获取节点详情 |
| `select_node` | 选中节点 |
| `set_node_text` | 设置文本节点内容 |
| `execute_node` | 执行节点（提交生成任务） |
| `auto_layout` | 自动布局节点（仅在用户明确要求时使用） |
| `list_node_tasks` | 列出节点任务记录 |

### 工具执行流程

1. LLM 返回工具调用请求（function_call）
2. Runtime 将工具调用转发给 ToolExecutor
3. ToolExecutor 根据工具类型路由：
   - **内置工具**: 通过 IPC 发送 `dweb:builtin-tool:call` 事件到前端执行
   - **外部 MCP 工具**（如 Blender）: 通过 MCP 客户端转发到对应服务器
4. 前端/外部服务器执行工具并返回结果
5. Runtime 将结果回传给 LLM 继续对话

### 内置工具前端执行

内置工具在前端执行，通过事件监听机制：

```typescript
// 注册工具调用监听
const listenerId = window.dweb.mcp.onBuiltinToolCall((payload) => {
  const { requestId, toolName, arguments: args } = payload
  // 执行工具...
  // 返回结果
  window.dweb.mcp.respondBuiltinTool(requestId, result, null)
})
```

前端通过 `src/views/AIWorkflow/node-business/chat/useAgentToolBridge.ts` 处理内置工具调用。

---

## 会话管理

### LocalDB 存储

会话数据存储在 `chat_conversations` 表，通过 `electron/localdb/repos/chatConversations.mjs` 访问：

- `list({ projectPath })` - 列出项目下的会话
- `create({ title, model, projectPath })` - 创建新会话
- `remove(id)` - 删除会话
- `updateTitle(id, title)` - 重命名会话
- `getMessages(conversationId)` - 获取会话消息
- `addMessage({ conversationId, role, content, model })` - 添加消息

### IPC 会话接口

- `dweb:agent:list-conversations` - 列出会话
- `dweb:agent:create-conversation` - 创建会话
- `dweb:agent:delete-conversation` - 删除会话
- `dweb:agent:rename-conversation` - 重命名会话
- `dweb:agent:get-conversation-messages` - 获取消息
- `dweb:agent:add-conversation-message` - 添加消息
- `dweb:agent:abort` - 中止当前会话

---

## 前端集成

### 网络服务层

前端网络服务位于 `src/network/chat/`：

| 文件 | 职责 |
|-----|------|
| `AgentChatService.ts` | 通用 Agent 聊天服务 |
| `DVSAgentChatService.ts` | DVSAgent 专用服务 |
| `CodexChatService.ts` | Codex CLI 服务 |
| `CopilotChatService.ts` | Copilot CLI 服务 |
| `CLIChatService.ts` | CLI 适配器统一服务 |
| `AgentChatBridge.ts` | Agent 聊天桥接 |
| `types.ts` | 类型定义 |

### 节点聊天

AI 工作流节点支持内置聊天对话框，位于 `src/ui/BluePrint/node-dialog/`：

- `NodeChatDialog.vue` - 聊天对话框容器
- `NodeChatInput.vue` - 输入框
- `NodeChatParamPanel.vue` - 参数面板
- `nodeChatConfig.ts` - 配置

聊天通过 `dweb:chat:sendMessage` 或 `dweb:agent:stream` 流式通道实现。

### Agent 工具桥接

`useAgentToolBridge.ts` composable 负责处理内置工具调用：

- 监听 `dweb:builtin-tool:call` 事件
- 根据工具名路由到对应处理函数
- 操作 Vuex 状态/画布（创建节点、连线等）
- 将结果返回给后端

---

## IPC 接口

### 流式对话

```
channel: dweb:agent:stream (stream: true)
payload: {
  content: string,           // 用户消息
  attachments?: Array,       // 附件
  model?: string,            // 模型ID
  backend?: string,          // 后端标识 (dvsagent/codex/copilot)
  apiSource?: string,        // API来源
  context?: object,          // 工作流上下文
  history?: Array,           // 对话历史
  apiKeys?: object,          // API Key配置
  thinkingEffort?: string,   // 思考深度 (low/medium/high)
  maxToolCalls?: number,     // 最大工具调用次数 (默认35)
  sessionId?: string,        // 会话ID
  systemPrompt?: string,     // 自定义系统提示
  enableToolCallWarning?: boolean // 工具调用警告
}
```

### 其他接口

| Channel | 说明 |
|---------|------|
| `dweb:agent:context` | 获取 Agent 上下文 |
| `dweb:agent:abort` | 中止当前对话 |
| `dweb:agent:list-conversations` | 列出会话 |
| `dweb:agent:create-conversation` | 创建会话 |
| `dweb:agent:delete-conversation` | 删除会话 |
| `dweb:agent:rename-conversation` | 重命名会话 |
| `dweb:agent:get-conversation-messages` | 获取会话消息 |
| `dweb:agent:add-conversation-message` | 添加会话消息 |

---

## 关键文件位置

| 关注点 | 路径 |
|-------|------|
| Agent 后端入口 | `electron/backend/modules/agent/` |
| Agent Runtime | `electron/backend/modules/agent/runtime/AgentRuntime.mjs` |
| Context Builder | `electron/backend/modules/agent/runtime/ContextBuilder.mjs` |
| Tool Registry | `electron/backend/modules/agent/runtime/ToolRegistry.mjs` |
| Providers | `electron/backend/modules/agent/providers/` |
| DVSAgent 增强 | `electron/backend/modules/agent/dvsagent/` |
| MCP 内置工具 | `electron/backend/modules/mcp/builtinTools.mjs` |
| Tool Executor | `electron/backend/modules/mcp/toolExecutor.mjs` |
| 会话 LocalDB | `electron/localdb/repos/chatConversations.mjs` |
| 前端聊天服务 | `src/network/chat/` |
| Agent 聊天服务 | `src/network/AgentChatService.ts` |
| 工具桥接 composable | `src/views/AIWorkflow/node-business/chat/useAgentToolBridge.ts` |
| 节点聊天对话框 | `src/ui/BluePrint/node-dialog/` |
| 前端 Agent 核心 | `src/core/agent/` |
