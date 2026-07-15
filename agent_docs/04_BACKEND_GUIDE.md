# 后端开发指引 (Backend Guide)

## ⚠️ 重要提示（2026-07 更新）

**Django 已完全移除**。本项目后端不再使用 Django 或任何 HTTP 服务器框架（除 Unreal 集成专用 HTTP 服务器外）。所有后端逻辑运行在 Electron 主进程中，通过 IPC 与渲染进程通信。

**2026-07 重大扩展**：后端模块从 13 个扩展至 **20 个**，新增 Agent Runtime、MCP 服务器、CLI 适配器、云端模板、Blender 集成、Tripo3D/Ark/Gemini 多模型生成等能力：

- 新增 `agent/` 模块：统一 Agent 执行引擎，支持 5 种 LLM Provider
- 新增 `mcp/` 模块：内置 MCP 服务器，支持 stdio/socket 双桥接
- 新增 `cli-adapters/` 模块：CLI 适配器层（Claude/Codex/Copilot）
- 新增 `cloud-templates/` 模块：云端模板中心，支持 local/steam 双适配器
- 新增 `blender/` 模块：Blender 集成与 MCP 桥接
- 新增 `tripo3d/`、`ark/`、`gemini/` 模块：多模型生成 API 集成
- LocalDB 仓库从 6 个扩展至 **14 个**
- 支持 Agent 工具注册与执行、MCP 工具统一管理、CLI 会话生命周期管理

## 1. 技术栈

- **运行环境**: Electron 主进程 Node.js（ESM 模块，`.mjs` 后缀）
- **通信方式**: Electron IPC（`ipcMain.handle` / `ipcRenderer.invoke`），共 **24 个命名空间**
- **流式传输**: IPC 三通道模式（`:stream` 启动 + `:data` 数据块 + `:end` 结束 + `:error` 错误）
- **外部 HTTP 调用**: 内置 `electron/backend/core/http-client.mjs`（支持普通请求 + SSE 流式请求）
- **本地数据库**: better-sqlite3（通过 `electron/localdb/` 访问，14 个仓库，唯一事实来源）
- **Agent Runtime**: 统一 LLM Provider 抽象（ILLMProvider 接口 + 5 个实现）
- **MCP Server**: 内置 Model Context Protocol 服务器（stdio/socket 双桥接）
- **CLI Adapters**: CLI 适配器管理器（统一管理 Claude/Codex/Copilot CLI 会话）
- **日志**: `electron/backend/core/logger.mjs`
- **错误处理**: `electron/backend/core/errors.mjs`（统一错误类型 + wrapError 包装）
- **Python Bridge**（可选）: 仅用于字幕处理等特定计算密集型任务，非核心依赖

## 2. 后端目录结构

```
electron/backend/
├── index.mjs              # 后端入口（initBackend/shutdownBackend，收集20个模块路由）
├── router.mjs             # IPC 路由注册器（createRouter，统一错误包装、流处理）
├── context.mjs            # 请求上下文工厂（mainWindow/repos/deps）
├── diagnostics.mjs        # 诊断信息收集
├── python.mjs             # Python 环境检测
├── runtimeCleanup.mjs     # 旧运行时清理
├── projectAssetProtocol.mjs  # dweb:// 协议实现（直接读磁盘）
├── core/                  # 核心工具库
│   ├── logger.mjs
│   ├── errors.mjs         # UpstreamError/ValidationError/wrapError
│   ├── http-client.mjs    # HTTP 客户端（普通请求 + SSE 流式）
│   ├── sse-parser.mjs     # SSE 解析器
│   └── stream.mjs         # IPC 流处理器（三通道模式）
├── modules/               # 功能模块（按业务域划分，共20个）
│   ├── system/            # 系统健康检查、迁移状态、诊断
│   ├── projects/          # 项目 CRUD
│   ├── project-assets/    # 项目资产元数据
│   ├── chat/              # AI 对话（adapters/：base/bytedance/gemini/openai-compatible 多供应商）
│   ├── comfyui/           # ComfyUI 桥接
│   ├── meshy/             # Meshy 3D 生成
│   ├── tripo3d/           # Tripo3D 3D 生成（新增）
│   ├── seedance/          # Seedance 视频生成
│   ├── ark/               # Ark 视频生成（字节火山引擎，新增）
│   ├── gemini/            # Gemini 视频生成（新增）
│   ├── third-party/       # 三方 API 统一网关（NanoBanana/SeeDream/即梦/jimeng/blueprint）
│   ├── editor/            # 编辑器后端（组件库等）
│   ├── export/            # 导出（ffmpeg 调用）
│   ├── subtitle/          # 字幕处理（部分通过 Python Bridge）
│   ├── agent-skills/      # Agent Skills（场景理解/灯光/布局/Unreal导出，含Unreal HTTP服务器）
│   ├── agent/             # Agent 运行时（新增，runtime/providers/dvsagent 子目录）
│   ├── mcp/               # MCP 服务器（新增，server/builtinTools/toolExecutor）
│   ├── cli-adapters/      # CLI 适配器层（新增，base/manager/claudeCli/codexCli/copilotCli/cliConfigStore）
│   ├── cloud-templates/   # 云端模板中心（新增，adapters/：base/factory/local/steam）
│   └── blender/           # Blender 集成（新增，config/workspace/service + MCP桥接）
├── projectStaticAssets/   # 项目静态资产写服务
│   ├── manifest.mjs
│   ├── paths.mjs
│   └── service.mjs
└── python-bridge/         # Python Bridge（可选，非核心）
    ├── index.mjs
    ├── runtime.mjs
    ├── rpc.mjs
    ├── pip.mjs
    └── scripts/           # Python 侧脚本
```

## 3. 后端核心机制

### 3.1 入口与初始化

后端入口在 `electron/backend/index.mjs`：

```javascript
import { initBackend, shutdownBackend } from './backend/index.mjs'

// 初始化（在 main.mjs 的 app.whenReady() 后、MCP 初始化之后调用）
initBackend(mainWindow, deps)

// 关闭（应用退出时调用）
shutdownBackend()
```

`initBackend()` 会：
1. 收集所有 20 个模块的 routes
2. 创建 router 并注册所有 IPC 通道
3. 恢复已注册的项目根路径
4. 启动 Unreal HTTP 服务器（用于 Unreal 集成，agent-skills 模块）

### 3.2 Router 机制

`electron/backend/router.mjs` 提供统一的 IPC 路由注册：

- 自动包装 handler，统一 `{ ok, value, error }` 返回格式
- 自动捕获异常并包装为标准化错误
- 支持流式 handler（`stream: true`），通过 `createStreamHandler` 处理三通道模式
- 自动检查重复 channel 注册

### 3.3 统一返回格式

所有 IPC handler **必须**返回以下格式之一：

```javascript
// 成功
{ ok: true, value: <返回数据> }
// 或直接返回数据（router 会自动包装为 { ok: true, value: data }）
return data

// 失败
{ ok: false, error: '错误消息' }
// 或抛出异常（router 会自动捕获并包装）
throw new Error('错误消息')
```

前端使用 `src/network/ipcClient.ts` 的 `unwrapIpcResult()` 或 `ipcCall()` 自动解包。

### 3.4 请求上下文（Context）

每个请求通过 `context.mjs` 的工厂函数创建上下文，包含：

- `mainWindow`: 主窗口引用
- `repos`: LocalDB 仓库集合（共14个：projects, meshyTasks, videoTasks, tripo3dTasks, arkTasks, geminiTasks, exportJobs, comfyuiJobs, comfyuiWorkflows, editorComponents, chatConversations, aiworkflowTemplates, refImageCache, apiKeys）
- 其他依赖（在 initBackend 时通过 deps 传入）

### 3.5 流式响应（IPC Stream）

对于需要流式输出的场景（如 AI 对话、Agent 流式响应），使用 IPC 三通道模式：

1. 前端调用 `channel:stream` 启动流
2. 后端通过 `channel:data` 事件发送数据块（带 requestId）
3. 后端通过 `channel:end` 事件通知结束（带 requestId）
4. 出错时通过 `channel:error` 发送错误（带 requestId）

使用 `core/stream.mjs` 的 `createStreamHandler` 简化流处理：

```javascript
// routes.mjs
{
  channel: 'dweb:chat:sendMessage',
  stream: true,
  handler: chatStreamHandler
}

// handlers.mjs - 流 handler 接收 (ctx, payload, event) 并返回异步生成器
async function* chatStreamHandler(ctx, payload) {
  for await (const chunk of callExternalAI(payload)) {
    yield chunk  // 每个 yield 会作为 :data 事件发送
  }
}
```

前端使用 `preload.mjs` 中的 `createIpcStreamGenerator` 创建异步迭代器。

### 3.6 核心工具

#### Logger
```javascript
import logger from './core/logger.mjs'
logger.info('message')
logger.warn('warning')
logger.error('error', err)
logger.debug('debug info')
```

#### Errors
```javascript
import { UpstreamError, ValidationError, wrapError } from './core/errors.mjs'

throw new ValidationError('参数无效')
throw new UpstreamError('外部 API 调用失败')
// wrapError 会自动将任意错误包装为标准格式
```

#### HTTP Client

用于调用外部 AI/三方 API（DeepSeek、Gemini、Meshy、Tripo3D、Seedance、Ark 等）：

```javascript
import { getHttpClient } from './core/http-client.mjs'

const http = getHttpClient()

// 普通请求
const res = await http.post('https://api.example.com/endpoint', { key: 'value' })
if (res.ok) {
  console.log(res.body)
}

// SSE 流式请求
for await (const line of http.postStream('https://api.example.com/stream', body)) {
  // 处理 SSE 行
}
```

## 4. 功能模块规范

### 4.1 模块结构

每个功能模块位于 `electron/backend/modules/<module-name>/`，必须包含：

| 文件 | 必填 | 用途 |
| --- | --- | --- |
| `routes.mjs` | 是 | 导出 `routes` 数组，定义该模块的所有 IPC 通道 |
| `handlers.mjs` | 是 | 实现每个路由的 handler 函数 |
| `service.mjs` | 否 | 业务逻辑层（复杂模块建议抽取到 service） |

**复杂模块可使用子目录结构**（参考 agent/mcp/cli-adapters/cloud-templates/blender）：
- `runtime/`：运行时核心类
- `providers/`：多实现提供者（如 LLM Provider、CLI Adapter）
- `server/`：服务器实现
- `adapters/`：适配器模式实现
- `dvsagent/`：特定实现
- `config.mjs` / `workspace.mjs` / `types.mjs`：配置/工作空间/类型

### 4.2 routes.mjs 格式

```javascript
// modules/example/routes.mjs
import { helloHandler, streamHandler } from './handlers.mjs'

export const routes = [
  {
    channel: 'dweb:example:hello',
    handler: helloHandler,
    // stream: false  // 默认非流式
  },
  {
    channel: 'dweb:example:stream',
    handler: streamHandler,
    stream: true,  // 标记为流式 handler
  },
]
```

**Channel 命名规范**: `dweb:<module>:<action>`（ark 模块使用 `dweb.ark.<action>` 点分隔为历史遗留）
- 模块名使用 kebab-case（如 `project-assets`、`third-party`、`agent-skills`、`cli-adapters`、`cloud-templates`）
- 使用动词或名词清晰描述操作

### 4.3 handlers.mjs 格式

```javascript
// modules/example/handlers.mjs
import { ValidationError } from '../../core/errors.mjs'

export async function helloHandler(ctx, payload, event) {
  const name = String(payload?.name || 'World')
  return { message: `Hello, ${name}!` }
}

// 流式 handler: async generator
export async function* streamHandler(ctx, payload) {
  const count = Number(payload?.count || 5)
  for (let i = 0; i < count; i++) {
    yield { index: i, text: `Chunk ${i}` }
    await new Promise(r => setTimeout(r, 100))
  }
}
```

### 4.4 注册新模块

在 `electron/backend/index.mjs` 中：

1. 导入 routes：
```javascript
import { routes as exampleRoutes } from './modules/example/routes.mjs'
```

2. 添加到 allRoutes 数组：
```javascript
const allRoutes = [
  // ... 现有路由
  ...exampleRoutes,
]
```

3. 在 `electron/preload.mjs` 中暴露对应的前端 API（按命名空间组织，参考现有模块的暴露方式）。

## 5. 现有后端模块详解（共 20 个）

### 5.1 System 模块 (`modules/system/`)
- **职责**: 系统健康检查、迁移状态、诊断信息、更新检查、Steam版本检测
- **Channels**:
  - `dweb:system:ping` - 健康检查
  - `dweb:system:migration-checklist` - 迁移检查清单
  - `dweb:system:check-update` - 检查更新
  - `dweb:system:is-steam` - 是否Steam版本
  - `dweb:diagnostics:collect` - 收集诊断信息（通过 main.mjs 注册）

### 5.2 Projects 模块 (`modules/projects/`)
- **职责**: 项目 CRUD（列表/保存/加载/删除/从文件夹打开）
- **Channels**: `dweb:projects:list`, `dweb:projects:save`, `dweb:projects:load`, `dweb:projects:delete`, `dweb:projects:open-folder`
- **数据来源**: LocalDB `projects` 表（唯一事实来源）

### 5.3 Project Assets 模块 (`modules/project-assets/`)
- **职责**: 项目资产元数据管理
- **Channels**: 资产列表、元数据查询等
- **注意**: 资产的二进制操作（上传/导入/下载）通过 `projectStaticAssets/service.mjs` 和 `dweb://` 协议处理

### 5.4 Chat 模块 (`modules/chat/`)
- **职责**: AI 对话服务（适配器模式支持多供应商）
- **Channels**:
  - `dweb:chat:sendMessage` (stream) - 发送消息并流式返回响应
  - `dweb:chat:listModels` - 获取可用模型列表
- **支持的 AI 提供商**: DeepSeek（默认）、Gemini、ByteDance（豆包）、OpenAI兼容接口
- **适配器结构**: `adapters/` 目录包含 base/bytedance/gemini/openai-compatible
- **API 密钥存储**: LocalDB `api_keys` 表（AES-256-GCM 加密）
- **HTTP 调用**: 使用 `core/http-client.mjs` 直接调用外部 API

### 5.5 ComfyUI 模块 (`modules/comfyui/`)
- **职责**: ComfyUI 工作流桥接
- **Channels**: ComfyUI 工作流提交、状态查询、结果获取、运行时管理、工作流管理
- **任务存储**: LocalDB `comfyui_jobs` 和 `comfyui_workflows` 表

### 5.6 Meshy 模块 (`modules/meshy/`)
- **职责**: Meshy 3D 模型生成 API 集成
- **Channels**: 3D 生成任务提交、状态查询、结果下载等
- **任务存储**: LocalDB `meshy_tasks` 表
- **HTTP 调用**: 通过 `core/http-client.mjs` 调用 Meshy API

### 5.7 Tripo3D 模块 (`modules/tripo3d/`) —— 新增
- **职责**: Tripo3D 3D 模型生成 API 集成
- **Channels**:
  - `dweb:tripo3d:health` - 健康检查
  - `dweb:tripo3d:generate` - 生成模型
  - `dweb:tripo3d:generate:text-to-image` - 文生图
  - `dweb:tripo3d:generate:image-to-*` - 图生模型
  - `dweb:tripo3d:get-task` - 获取任务详情
  - `dweb:tripo3d:list-tasks` - 获取任务列表
  - `dweb:tripo3d:balance` - 查询余额
  - `dweb:tripo3d:upload-file` - 上传参考图
- **任务存储**: LocalDB `tripo3d_tasks` 表
- **HTTP 调用**: 通过 `core/http-client.mjs` 调用 Tripo3D API

### 5.8 Seedance 模块 (`modules/seedance/`)
- **职责**: Seedance 视频生成 API 集成
- **Channels**: 视频生成任务提交、状态查询等
- **任务存储**: LocalDB `video_tasks` 表

### 5.9 Ark 模块 (`modules/ark/`) —— 新增
- **职责**: Ark（字节火山引擎）视频生成 API 集成
- **Channels**（使用点分隔命名，历史遗留）:
  - `dweb.ark.listTasks` - 任务列表
  - `dweb.ark.getTaskDetail` - 任务详情
  - `dweb.ark.deleteTask` - 删除任务
  - `dweb.ark.recordTask` - 记录任务
- **任务存储**: LocalDB `ark_tasks` 表

### 5.10 Gemini 模块 (`modules/gemini/`) —— 新增
- **职责**: Gemini 视频生成 API 集成
- **Channels**:
  - `dweb:gemini:health` - 健康检查
  - `dweb:gemini:get-task` - 获取任务
  - `dweb:gemini:list-tasks` - 任务列表
  - `dweb:gemini:cancel` - 取消任务
  - `dweb:gemini:delete` - 删除任务
  - `dweb:gemini:clear-completed` - 清理已完成任务
  - `dweb:gemini:get-image-path` - 获取图片路径
- **任务存储**: LocalDB `gemini_tasks` 表

### 5.11 Third-Party 模块 (`modules/third-party/`)
- **职责**: 三方 API 统一网关
- **Channels**: 统一的三方 API 调用入口
- **包含**: NanoBanana、SeeDream、即梦（Jimeng）、blueprint 等三方服务

### 5.12 Editor 模块 (`modules/editor/`)
- **职责**: 编辑器后端支持（组件库等）
- **Channels**: 组件库列表、组件 CRUD 等
- **数据存储**: LocalDB `editor_components` 表

### 5.13 Export 模块 (`modules/export/`)
- **职责**: 视频/项目导出
- **Channels**: 导出任务提交、状态查询、ffmpeg 调用（通过 child_process）
- **任务存储**: LocalDB `export_jobs` 表

### 5.14 Subtitle 模块 (`modules/subtitle/`)
- **职责**: 字幕处理（字幕解析、SRT 导出、AI 字幕等）
- **Channels**: 字幕解析、格式化、AI 理解（流式）等
- **注意**: 部分计算密集型任务通过 **Python Bridge** 执行

### 5.15 Agent Skills 模块 (`modules/agent-skills/`)
- **职责**: Agent Skills（场景理解、灯光、布局、Unreal 导出等）
- **Channels**:
  - `dweb:agent-skills:scene-understand` (stream) - 场景理解
  - `dweb:agent-skills:scene-lighting` - 场景灯光
  - `dweb:agent-skills:scene-layout` - 场景布局
  - `dweb:agent-skills:unreal-export` - Unreal 导出
- **特殊功能**: 内置独立 HTTP 服务器用于 Unreal Engine 集成（`startUnrealHttpServer`，默认随机端口）
- **附加**: `unreal-editor-detector.mjs` - Unreal 编辑器检测

### 5.16 Agent 模块 (`modules/agent/`) —— 新增核心模块
- **职责**: 统一 Agent 执行引擎，管理 LLM 调用、工具注册、上下文构建、流式对话
- **目录结构**:
  - `runtime/`: AgentRuntime / ContextBuilder / ToolRegistry / ToolImageProcessor
  - `providers/`: ILLMProvider 接口 + 5 个实现
    - `ILLMProvider.mjs` - LLM Provider 接口定义
    - `ApiLLMProvider.mjs` - 直接 API 调用 Provider
    - `CliLLMProvider.mjs` - CLI 适配器 Provider（通过 cli-adapters 模块）
    - `CodexProvider.mjs` - Codex Provider
    - `CopilotProvider.mjs` - Copilot Provider
    - `DVSAgentProvider.mjs` - DVSAgent Provider
    - `index.mjs` - Provider 工厂
    - `toolOutputParser.mjs` - 工具输出解析器
  - `dvsagent/`: DVSAgent 增强实现
    - `DVSAgentEnhancedProvider.mjs` - DVSAgent 增强 Provider
    - `LLMClient.mjs` - LLM 客户端
- **Channels**:
  - `dweb:agent:stream` (stream) - Agent 流式对话
  - `dweb:agent:context` - 获取上下文
  - `dweb:agent:abort` - 中止对话
  - `dweb:agent:list-conversations` - 会话列表
  - `dweb:agent:create-conversation` / `delete-conversation` / `rename-conversation` - 会话管理
  - `dweb:agent:get-conversation-messages` / `add-conversation-messages` - 消息管理
- **数据存储**: LocalDB `chat_conversations` 表
- **核心类**:
  - `AgentRuntime`: Agent 运行时核心，协调 Provider、ToolRegistry、ContextBuilder
  - `ToolRegistry`: 工具注册中心，管理 MCP 工具和内置工具
  - `ContextBuilder`: 对话上下文构建器

### 5.17 MCP 模块 (`modules/mcp/`) —— 新增核心模块
- **职责**: 内置 Model Context Protocol 服务器，支持 stdio/socket 双桥接，统一工具执行
- **目录结构**:
  - `server/`: MCP 服务器实现
    - `DVStudioMCPServer.mjs` - MCP 服务器主类
    - `stdioBridge.mjs` - stdio 桥接（标准输入输出）
    - `socketBridge.mjs` - socket 桥接（TCP Socket）
  - `builtinTools.mjs` - 内置工具注册
  - `client.mjs` - MCP 客户端
  - `toolExecutor.mjs` - 工具执行器（统一管理参数验证、错误处理、超时控制）
- **Channels**:
  - `dweb:mcp:connect` - 连接 MCP 服务器
  - `dweb:mcp:disconnect` - 断开连接
  - `dweb:mcp:list-tools` - 列出可用工具
  - `dweb:mcp:call-tool` - 调用工具
  - `dweb:mcp:register-builtin` - 注册内置工具
  - `dweb:mcp:get-status` - 获取状态
  - `dweb:mcp:list-servers` - 列出服务器
  - `dweb:mcp:get-bridge-status` - 获取桥接状态
  - `dweb:mcp:get-bridge-script` - 获取桥接脚本
- **安全约束**: 工具执行必须通过 toolExecutor 统一管理，禁止绕过执行器直接调用工具

### 5.18 CLI Adapters 模块 (`modules/cli-adapters/`) —— 新增
- **职责**: CLI 适配器层，统一管理 Claude/Codex/Copilot 等外部 CLI 工具的会话生命周期
- **目录结构**:
  - `base.mjs` - CLI 适配器基类
  - `manager.mjs` - CLI 适配器管理器（生命周期管理）
  - `claudeCli.mjs` - Claude CLI 适配器
  - `codexCli.mjs` - Codex CLI 适配器
  - `copilotCli.mjs` - Copilot CLI 适配器
  - `cliConfigStore.mjs` - CLI 配置持久化存储
- **Channels**:
  - `dweb:cli:check-availability` - 检查可用性
  - `dweb:cli:list-adapters` - 列出适配器
  - `dweb:cli:start-session` - 启动会话
  - `dweb:cli:stop-session` - 停止会话
  - `dweb:cli:send-message:stream` (stream) - 流式发送消息
  - `dweb:cli:cancel` - 取消
  - `dweb:cli:check-environment` - 环境检查
  - `dweb:cli:list-models` - 模型列表
  - `dweb:cli:get-config` / `save-config` / `reset-config` - 配置管理
  - `dweb:cli:run-fix` - 修复运行
  - `dweb:cli:start-auth:stream` (stream) - 认证流程
- **生命周期**: check-environment → start-session → send-message:stream → stop-session

### 5.19 Cloud Templates 模块 (`modules/cloud-templates/`) —— 新增
- **职责**: 云端模板中心，支持多平台（本地/Steam）模板获取与管理
- **目录结构**:
  - `adapters/`: 适配器实现
    - `base.mjs` - 适配器基类
    - `factory.mjs` - 适配器工厂
    - `local.mjs` - 本地模板适配器
    - `steam.mjs` - Steam 模板适配器
  - `types.mjs` - 类型定义
- **Channels**:
  - `dweb:cloud-templates:get-platform` - 获取当前平台
  - `dweb:cloud-templates:get-quota` - 获取配额
  - `dweb:cloud-templates:list` - 列出模板
  - `dweb:cloud-templates:upload` - 上传模板
  - `dweb:cloud-templates:download` - 下载模板
  - `dweb:cloud-templates:delete` - 删除模板

### 5.20 Blender 模块 (`modules/blender/`) —— 新增
- **职责**: Blender 集成，支持 Blender 环境检测、工作空间管理、模型导入、MCP 桥接
- **目录结构**:
  - `config.mjs` - Blender 配置
  - `workspace.mjs` - Blender 工作空间管理
  - `service.mjs` - Blender 服务
- **Channels**:
  - `dweb:blender:status:check` - 状态检查
  - `dweb:blender:mcp:connect` / `disconnect` / `status` / `call-tool` - MCP 桥接
  - `dweb:blender:import:model` - 导入模型
  - `dweb:blender:tools:check` / `mount` - 工具检查与挂载
  - `dweb:blender:workspace:*` - 工作空间操作
- **集成方式**: 通过 MCP 桥接连接到 Blender 进程，暴露 Blender 专用工具给 Agent

## 6. Python Bridge（可选）

`electron/backend/python-bridge/` 提供可选的 Python 工作进程支持：

- **用途**: 字幕处理等需要 Python 生态的计算密集型任务
- **非核心依赖**: 核心功能（AI 对话、工作流、资产管理、Agent、MCP、CLI 等）完全不依赖 Python
- **组件**:
  - `runtime.mjs`: Python 子进程管理
  - `rpc.mjs`: Node.js ↔ Python RPC 通信
  - `pip.mjs`: pip 包管理（按需安装依赖）
  - `scripts/worker.py`: Python worker 进程入口
  - `scripts/subtitle/`: 字幕处理 Python 实现

**使用原则**:
1. 新增核心功能优先使用 Node.js 实现
2. 仅在必须使用 Python 特定库（如某些音频/视频处理库）时才使用 Python Bridge
3. Python 相关功能必须有优雅降级（Python 不可用时给出明确提示）

## 7. LocalDB 访问

后端模块通过 context 中的 `repos` 访问 LocalDB（共 14 个仓库）：

```javascript
export async function exampleHandler(ctx, payload) {
  const { projects, apiKeys, meshyTasks, tripo3dTasks, chatConversations, aiworkflowTemplates } = ctx.repos
  
  // 查询项目
  const projectList = projects.list()
  
  // 保存 API Key（自动加密）
  await apiKeys.set('deepseek', { apiKey: 'sk-xxx', baseUrl: '...' })
  
  // 获取 API Key（自动解密）
  const key = await apiKeys.get('deepseek')
  
  // 管理 Agent 会话
  const conversations = chatConversations.list()
  
  return { ok: true }
}
```

LocalDB 仓库位于 `electron/localdb/repos/`，共 14 个：
- `projects.mjs` - 项目仓库
- `apiKeys.mjs` - API 密钥（AES-256-GCM + PBKDF2 加密存储）
- `meshyTasks.mjs` - Meshy 任务
- `videoTasks.mjs` - 视频生成任务
- `tripo3dTasks.mjs` - Tripo3D 任务（新增）
- `arkTasks.mjs` - Ark 任务（新增）
- `geminiTasks.mjs` - Gemini 任务（新增）
- `comfyuiJobs.mjs` - ComfyUI 任务
- `comfyuiWorkflows.mjs` - ComfyUI 工作流（新增）
- `exportJobs.mjs` - 导出任务
- `editorComponents.mjs` - 编辑器组件（新增）
- `chatConversations.mjs` - AI/Agent 对话会话（新增）
- `aiworkflowTemplates.mjs` - AI 工作流模板（新增）
- `refImageCache.mjs` - 参考图缓存（新增）

新增数据字段必须通过 `electron/localdb/migrations.mjs` 添加迁移。

## 8. 前端调用方式

前端通过 `src/electronBridge/index.ts` 和 `src/network/ipcClient.ts` 调用后端：

```typescript
import { ipcCall, hasIpcModule, ipcStream } from '../network/ipcClient'

// 检测模块可用性
if (hasIpcModule('agent')) {
  // 流式调用 Agent
  const generator = ipcStream(() => window.dweb.agent.stream({ message: 'hello', conversationId }))
  for await (const chunk of generator) {
    // 处理流式数据
  }
}

// 普通 IPC 调用
const result = await ipcCall(() => window.dweb.mcp.listTools())
```

对话/Agent 相关建议使用 `src/network/chat/` 下的服务类封装。

## 9. 禁止事项

1. **禁止添加新的 HTTP 服务器**：除了 Unreal 导出专用的 HTTP 服务器外，不要在后端启动任何 HTTP 服务器
2. **禁止直接使用 Django**：不要添加任何 Django/Python HTTP 服务器相关代码
3. **禁止在后端操作 DOM**：后端运行在 Electron 主进程，不能访问 window/document
4. **禁止硬编码外部 API 地址**：外部 API 的 base URL 和密钥应允许用户配置（存储在 LocalDB 或 settings.json）
5. **禁止在 handler 中执行长时间阻塞操作**：使用异步生成器（stream）处理长时间运行的任务
6. **禁止直接修改项目目录外的文件**：文件操作必须限制在项目根目录或 DVSResource 目录内
7. **禁止绕过 toolExecutor 执行 MCP 工具**：MCP 工具执行必须通过 toolExecutor 统一管理
8. **禁止绕过 ToolRegistry 注册 Agent 工具**：Agent 可调用工具必须通过 ToolRegistry 注册，禁止 Agent 直接执行任意代码
9. **禁止绕过 CLI 适配器管理器直接启动 CLI 子进程**：CLI 适配器必须通过 manager.mjs 统一管理
10. **禁止执行任意路径的 Blender 脚本**：Blender 脚本执行仅限工作空间目录内
