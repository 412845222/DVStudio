# 新增 AI 模块开发指南

本文档涵盖 Tripo3D、Gemini、火山方舟（ARK）、CLI 适配器等新增 AI 模块的开发指引。Blender MCP 集成请参见 [08_3D_EDITOR_RENDERING_GUIDE.md#blender-mcp-集成](08_3D_EDITOR_RENDERING_GUIDE.md#blender-mcp-集成) 和 [10_MCP_GUIDE.md](10_MCP_GUIDE.md)。

## 目录
1. [模块概览](#模块概览)
2. [Tripo3D 模块](#tripo3d-模块)
3. [Gemini 模块](#gemini-模块)
4. [火山方舟（ARK）模块](#火山方舟ark-模块)
5. [CLI 适配器模块](#cli-适配器模块)
6. [通用模块开发规范](#通用模块开发规范)
7. [关键文件位置](#关键文件位置)

---

## 模块概览

### 模块列表

| 模块 | 后端路径 | IPC 前缀 | LocalDB 表 | 前端业务目录 |
|-----|---------|---------|-----------|-------------|
| Tripo3D | `electron/backend/modules/tripo3d/` | `dweb:tripo3d:` | `tripo3d_tasks` | `src/views/AIWorkflow/node-business/tripo3d/` |
| Gemini | `electron/backend/modules/gemini/` | `dweb:gemini:` | `gemini_tasks` | `src/views/AIWorkflow/node-business/gemini/` |
| ARK | `electron/backend/modules/ark/` | `dweb:ark:` | `ark_tasks` | `src/views/AIWorkflow/node-business/ark/` |
| CLI 适配器 | `electron/backend/modules/cli-adapters/` | `dweb:cli:` | CLI配置存储 | `src/network/CLIChatService.ts` |
| Blender | `electron/backend/modules/blender/` | `dweb:blender:` | - | `src/views/AIWorkflow/node-business/blender/` |

### 标准模块结构

每个后端模块遵循标准的 routes/handlers/service 三层结构：

```
electron/backend/modules/<module>/
├── routes.mjs       # IPC 路由注册（导出 routes 数组）
├── handlers.mjs     # IPC handler 实现（参数校验、调用 service）
└── service.mjs      # 业务逻辑（API调用、数据处理）
```

复杂模块可额外包含：
- `config.mjs` - 模块配置
- `workspace.mjs` - 工作区管理（如 Blender）
- `adapters/` - 多适配器实现（如 CLI、云模板）
- `types.mjs` - 类型定义
- 子目录 - 细分功能

---

## Tripo3D 模块

### 功能说明

Tripo3D 模块提供 3D 模型生成和图片生成能力：

- 文生3D模型
- 图生3D模型
- 多视图生成3D
- 文生图
- 图生图
- 任务查询、余额查询、文件上传

### IPC 接口

| Channel | 说明 | 流式 |
|---------|------|------|
| `dweb:tripo3d:health` | 健康检查 | ❌ |
| `dweb:tripo3d:generate` | 通用生成接口 | ❌ |
| `dweb:tripo3d:generate:text-to-image` | 文生图 | ❌ |
| `dweb:tripo3d:generate:image-to-image` | 图生图 | ❌ |
| `dweb:tripo3d:generate:image-to-multiview` | 图生多视图 | ❌ |
| `dweb:tripo3d:get-task` | 获取单个任务 | ❌ |
| `dweb:tripo3d:list-tasks` | 列出任务 | ❌ |
| `dweb:tripo3d:task-detail` | 任务详情 | ❌ |
| `dweb:tripo3d:stop` | 停止任务 | ❌ |
| `dweb:tripo3d:delete` | 删除任务 | ❌ |
| `dweb:tripo3d:balance` | 查询余额 | ❌ |
| `dweb:tripo3d:upload-file` | 上传参考图片 | ❌ |

### 前端调用

```typescript
// 调用 Tripo3D 文生3D
const result = await window.dweb.tripo3d.generate({
  type: 'text_to_model',
  prompt: 'a cute cat',
  model_version: 'v2.0'
})

// 查询任务状态
const task = await window.dweb.tripo3d.getTask({ taskId: 'xxx' })
```

### 前端 composable

| 文件 | 职责 |
|-----|------|
| `useAIWorkflowTripo3DRuntime.ts` | 运行时状态管理 |
| `useAIWorkflowTripo3DRequest.ts` | API 请求封装 |
| `useAIWorkflowTripo3DTaskPanelController.ts` | 任务面板控制 |
| `useAIWorkflowTripo3DInputResolver.ts` | 输入参数解析与校验 |
| `useAIWorkflowTripo3DDrop.ts` | 拖拽上传处理 |
| `useAIWorkflowTripo3DCommands.ts` | 节点命令 |
| `useAIWorkflowTripo3DAssets.ts` | 生成资产管理 |
| `useAIWorkflowImageNodeTripo3D.ts` | 图片节点 Tripo3D 集成 |
| `types.ts` | 类型定义 |
| `tripo3dRuntimeUtils.ts` | 运行时工具函数 |

### LocalDB 存储

任务数据存储在 `tripo3d_tasks` 表，通过 `electron/localdb/repos/tripo3dTasks.mjs` 访问：
- `list()` - 列出任务
- `get(id)` - 获取任务
- `upsert(task)` - 创建/更新任务
- `remove(id)` - 删除任务

---

## Gemini 模块

### 功能说明

Gemini 模块提供 Google Gemini 图片生成能力：

- Gemini 图片生成任务提交
- 任务状态查询
- 任务列表管理
- 任务取消/删除
- 已完成任务清理
- 图片路径获取

### IPC 接口

| Channel | 说明 |
|---------|------|
| `dweb:gemini:health` | 健康检查 |
| `dweb:gemini:get-task` | 获取任务 |
| `dweb:gemini:list-tasks` | 列出任务 |
| `dweb:gemini:cancel` | 取消任务 |
| `dweb:gemini:delete` | 删除任务 |
| `dweb:gemini:clear-completed` | 清理已完成任务 |
| `dweb:gemini:get-image-path` | 获取生成图片路径 |

### 前端调用

```typescript
// 列出 Gemini 任务
const tasks = await window.dweb.gemini.listTasks()

// 获取任务详情
const task = await window.dweb.gemini.getTask({ taskId: 'xxx' })
```

### 前端 composable

| 文件 | 职责 |
|-----|------|
| `useAIWorkflowGeminiTaskPanelController.ts` | 任务面板控制 |

### LocalDB 存储

任务数据存储在 `gemini_tasks` 表，通过 `electron/localdb/repos/geminiTasks.mjs` 访问。

---

## 火山方舟（ARK）模块

### 功能说明

火山方舟模块提供字节跳动火山引擎方舟平台的任务管理：

- 任务记录
- 任务详情查询
- 任务删除
- 任务面板集成

### IPC 接口

| Channel | 说明 |
|---------|------|
| `dweb.ark.listTasks` | 列出任务 |
| `dweb.ark.getTaskDetail` | 获取任务详情 |
| `dweb.ark.deleteTask` | 删除任务 |
| `dweb.ark.recordTask` | 记录任务 |

> **注意**: ARK 模块当前 IPC channel 使用点号分隔（`dweb.ark.*`），后续应统一为冒号分隔格式。

### 前端调用

```typescript
// 列出 ARK 任务
const tasks = await window.dweb.ark.listTasks()

// 记录新任务
await window.dweb.ark.recordTask({
  taskId: 'xxx',
  model: 'doubao-seed',
  // ...
})
```

### 前端 composable

| 文件 | 职责 |
|-----|------|
| `useAIWorkflowArkTaskPanel.ts` | ARK 任务面板 |

### LocalDB 存储

任务数据存储在 `ark_tasks` 表，通过 `electron/localdb/repos/arkTasks.mjs` 访问。

---

## CLI 适配器模块

### 功能说明

CLI 适配器模块提供与外部 AI CLI 工具的集成：

- Claude CLI
- OpenAI Codex CLI
- GitHub Copilot CLI
- 统一会话管理
- 流式消息收发
- CLI 配置持久化
- 环境检测与修复
- CLI 认证流程

### 适配器架构

```
┌─────────────────────────────────────────────────────────┐
│                    CLI Adapter Manager                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Claude CLI   │  │ Codex CLI    │  │ Copilot CLI  │  │
│  │ Adapter      │  │ Adapter      │  │ Adapter      │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
           ↑                ↑                ↑
           └────────────────┼────────────────┘
                            │
                  ┌─────────▼─────────┐
                  │   CLI Config      │
                  │   Store           │
                  └───────────────────┘
```

所有适配器继承自 `base.mjs` 基类，实现统一接口。

### IPC 接口

| Channel | 说明 | 流式 |
|---------|------|------|
| `dweb:cli:check-availability` | 检查 CLI 可用性 | ❌ |
| `dweb:cli:list-adapters` | 列出可用适配器 | ❌ |
| `dweb:cli:start-session` | 启动会话 | ❌ |
| `dweb:cli:stop-session` | 停止会话 | ❌ |
| `dweb:cli:send-message:stream` | 发送消息（流式） | ✅ |
| `dweb:cli:cancel` | 取消当前请求 | ❌ |
| `dweb:cli:get-session` | 获取会话信息 | ❌ |
| `dweb:cli:list-sessions` | 列出所有会话 | ❌ |
| `dweb:cli:check-environment` | 检查环境 | ❌ |
| `dweb:cli:list-models` | 列出可用模型 | ❌ |
| `dweb:cli:get-config` | 获取配置 | ❌ |
| `dweb:cli:save-config` | 保存配置 | ❌ |
| `dweb:cli:reset-config` | 重置配置 | ❌ |
| `dweb:cli:run-fix` | 运行修复脚本 | ❌ |
| `dweb:cli:start-auth:stream` | 启动认证流程（流式） | ✅ |
| `dweb:cli:cancel-auth` | 取消认证 | ❌ |

### 前端调用

```typescript
// 检查 CLI 可用性
const available = await window.dweb.cli.checkAvailability({ adapter: 'claude' })

// 启动会话
const session = await window.dweb.cli.startSession({ adapter: 'claude' })

// 发送流式消息
const generator = window.dweb.cli.sendMessage({
  sessionId: session.id,
  message: 'Hello'
})
for await (const chunk of generator) {
  // 处理流式响应
}
```

### 前端服务

CLI 聊天通过 `src/network/CLIChatService.ts` 统一封装，各聊天服务在 `src/network/chat/` 目录下：

| 文件 | 职责 |
|-----|------|
| `CLIChatService.ts` | CLI 适配器统一服务 |
| `chat/CodexChatService.ts` | Codex CLI 服务 |
| `chat/CopilotChatService.ts` | Copilot CLI 服务 |

### 配置存储

CLI 配置通过 `cliConfigStore.mjs` 持久化到 LocalDB。

---

## 通用模块开发规范

### 新增后端模块步骤

1. **创建模块目录**: `electron/backend/modules/<new-module>/`

2. **创建 routes.mjs**:
```javascript
import * as handlers from './handlers.mjs'

export const routes = [
  { channel: 'dweb:<module>:<action>', handler: handlers.actionName },
  { channel: 'dweb:<module>:<stream-action>', handler: handlers.streamAction, stream: true },
]
```

3. **创建 handlers.mjs**:
```javascript
import * as service from './service.mjs'
import { ValidationError } from '../../core/errors.mjs'

export async function actionName(ctx, payload) {
  // 参数校验
  if (!payload?.param) {
    throw new ValidationError('param is required')
  }
  // 调用 service
  const result = await service.doSomething(ctx, payload)
  return { ok: true, value: result }
}
```

4. **创建 service.mjs**:
```javascript
import httpClient from '../../core/http-client.mjs'
import logger from '../../core/logger.mjs'

export async function doSomething(ctx, payload) {
  logger.info(`[<module>] doing something`)
  // 使用 ctx.repos 访问 LocalDB
  // 使用 httpClient 调用外部 API
  return result
}
```

5. **注册路由**: 在 `electron/backend/index.mjs` 的 `allRoutes` 数组中导入并添加模块路由

6. **暴露 preload API**: 在 `electron/preload.mjs` 中添加 `window.dweb.<module>.*` 封装

7. **添加 TypeScript 类型**: 在 `src/types/electron-bridge.d.ts` 中补充类型定义

8. **创建前端封装**: 在 `src/electronBridge/index.ts` 中添加封装，在 `src/network/` 下创建服务

9. **创建前端业务**: 在 `src/views/AIWorkflow/node-business/<module>/` 下创建 composable

10. **创建 LocalDB repo**（如需要）: 在 `electron/localdb/repos/` 下添加 repo，并在 `electron/localdb/migrations.mjs` 中添加表结构

### IPC Channel 命名规范

- 格式: `dweb:<module>:<action>`
- 全小写，使用连字符分隔单词: `dweb:tripo3d:text-to-image`
- 流式接口添加 `:stream` 后缀或标记 `stream: true`
- 避免使用点号分隔（历史遗留的 ARK 模块除外，后续应统一）

### 错误处理规范

- 使用 `core/errors.mjs` 中的错误类型:
  - `ValidationError` - 参数校验失败
  - `UpstreamError` - 上游 API 错误
  - `wrapError(err, message)` - 包装未知错误
- handler 中抛出的错误会由 router 自动捕获并包装为 `{ ok: false, error: message }`
- Service 层应记录详细错误日志: `logger.error('[module] action failed', err)`

### HTTP 客户端使用

所有外部 API 调用使用 `core/http-client.mjs`，不要直接使用 `fetch` 或 `node-fetch`：

```javascript
import httpClient from '../../core/http-client.mjs'

const response = await httpClient.fetch('https://api.example.com/endpoint', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: JSON.stringify(data),
  timeout: 30000,
})
```

### API Key 管理

- API Key 存储在 LocalDB `api_keys` 表，通过 `ctx.repos.apiKeys` 访问
- 使用 AES-256-GCM 自动加密存储
- 不要硬编码 API Key
- 不要在日志中输出 API Key

### 任务状态 LocalDB 规范

任务类模块应遵循以下 LocalDB 模式：

1. 创建 `<module>Tasks.mjs` repo
2. 提供标准 CRUD 方法: `list`, `get`, `upsert`, `remove`
3. 任务记录包含: `id`, `status`, `createdAt`, `updatedAt`, `result`, `error` 等字段
4. 在 `migrations.mjs` 中添加表结构迁移
5. 前端通过 `window.dweb.aiworkflow.db.<module>` 访问（如需），或通过模块专用 IPC 接口

---

## 关键文件位置

### Tripo3D

| 关注点 | 路径 |
|-------|------|
| 后端模块 | `electron/backend/modules/tripo3d/` |
| 前端业务 | `src/views/AIWorkflow/node-business/tripo3d/` |
| 节点组件 | `src/ui/WorkFlow/WorlFlowNodes/WorkflowTripo3DNode.vue` |
| LocalDB repo | `electron/localdb/repos/tripo3dTasks.mjs` |
| 测试 | `tests/unit/workflow/tripo3d/` |

### Gemini

| 关注点 | 路径 |
|-------|------|
| 后端模块 | `electron/backend/modules/gemini/` |
| 前端业务 | `src/views/AIWorkflow/node-business/gemini/` |
| LocalDB repo | `electron/localdb/repos/geminiTasks.mjs` |

### 火山方舟 (ARK)

| 关注点 | 路径 |
|-------|------|
| 后端模块 | `electron/backend/modules/ark/` |
| 前端业务 | `src/views/AIWorkflow/node-business/ark/` |
| LocalDB repo | `electron/localdb/repos/arkTasks.mjs` |
| 测试 | `tests/unit/aiworkflow/useAIWorkflowArkTaskPanel.test.ts` |

### CLI 适配器

| 关注点 | 路径 |
|-------|------|
| 后端模块 | `electron/backend/modules/cli-adapters/` |
| 适配器基类 | `electron/backend/modules/cli-adapters/base.mjs` |
| Claude CLI | `electron/backend/modules/cli-adapters/claudeCli.mjs` |
| Codex CLI | `electron/backend/modules/cli-adapters/codexCli.mjs` |
| Copilot CLI | `electron/backend/modules/cli-adapters/copilotCli.mjs` |
| 配置存储 | `electron/backend/modules/cli-adapters/cliConfigStore.mjs` |
| 前端服务 | `src/network/CLIChatService.ts` |
| Chat 服务 | `src/network/chat/` |

### Blender

| 关注点 | 路径 |
|-------|------|
| 后端模块 | `electron/backend/modules/blender/` |
| 工作区管理 | `electron/backend/modules/blender/workspace.mjs` |
| MCP 配置 | `electron/backend/modules/blender/config.mjs` |
| 前端业务 | `src/views/AIWorkflow/node-business/blender/` |
| 测试 | `tests/unit/workflow/blender/` |
