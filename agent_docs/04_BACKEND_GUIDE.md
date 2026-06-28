# 后端开发指引 (Backend Guide)

## ⚠️ 重要提示

**Django 已完全移除**。本项目后端不再使用 Django 或任何 HTTP 服务器框架。所有后端逻辑运行在 Electron 主进程中，通过 IPC 与渲染进程通信。

## 1. 技术栈

- **运行环境**: Electron 主进程 Node.js（ESM 模块，`.mjs` 后缀）
- **通信方式**: Electron IPC（`ipcMain.handle` / `ipcRenderer.invoke`）
- **流式传输**: IPC 三通道模式（`:stream` 启动 + `:data` 数据块 + `:end` 结束 + `:error` 错误）
- **外部 HTTP 调用**: 内置 `electron/backend/core/http-client.mjs`（支持普通请求 + SSE 流式请求）
- **本地数据库**: better-sqlite3（通过 `electron/localdb/` 访问）
- **日志**: `electron/backend/core/logger.mjs`
- **错误处理**: `electron/backend/core/errors.mjs`（统一错误类型 + wrapError 包装）
- **Python Bridge**（可选）: 仅用于字幕处理等计算密集型任务，非核心依赖

## 2. 后端目录结构

```
electron/backend/
├── index.mjs              # 后端入口（initBackend/shutdownBackend）
├── router.mjs             # IPC 路由注册器（createRouter）
├── context.mjs            # 请求上下文工厂
├── diagnostics.mjs        # 诊断信息收集
├── python.mjs             # Python 环境检测
├── runtimeCleanup.mjs     # 旧运行时清理
├── projectAssetProtocol.mjs  # dweb:// 协议实现
├── core/                  # 核心工具库
│   ├── logger.mjs
│   ├── errors.mjs
│   ├── http-client.mjs    # HTTP 客户端（外部 API 调用）
│   ├── sse-parser.mjs     # SSE 解析器
│   └── stream.mjs         # IPC 流处理器
├── modules/               # 功能模块（按业务域划分）
│   ├── system/            # 系统模块
│   ├── projects/          # 项目管理
│   ├── project-assets/    # 项目资产
│   ├── chat/              # AI 对话
│   ├── codex/             # Codex/Copilot CLI
│   ├── comfyui/           # ComfyUI 桥接
│   ├── meshy/             # Meshy 3D
│   ├── seedance/          # Seedance 视频
│   ├── third-party/       # 三方 API 网关
│   ├── editor/            # 编辑器（组件库等）
│   ├── export/            # 导出
│   ├── subtitle/          # 字幕处理
│   └── agent-skills/      # Agent Skills
├── projectStaticAssets/   # 静态资产服务
│   ├── manifest.mjs
│   ├── paths.mjs
│   └── service.mjs
└── python-bridge/         # Python Bridge（可选）
    ├── index.mjs
    ├── runtime.mjs
    ├── rpc.mjs
    ├── pip.mjs
    └── scripts/           # Python 侧脚本
```

## 3. 后端核心机制

### 3.1 入口与初始化

后端入口在 [electron/backend/index.mjs](file:///G:/DwebStudio/DwebVideoStudio/DVStudio/electron/backend/index.mjs)：

```javascript
import { initBackend, shutdownBackend } from './backend/index.mjs'

// 初始化（在 main.mjs 的 app.whenReady() 后调用）
initBackend(mainWindow, deps)

// 关闭（应用退出时调用）
shutdownBackend()
```

`initBackend()` 会：
1. 收集所有模块的 routes
2. 创建 router 并注册所有 IPC 通道
3. 恢复已注册的项目根路径
4. 启动 Unreal HTTP 服务器（用于 Unreal 集成）

### 3.2 Router 机制

[electron/backend/router.mjs](file:///G:/DwebStudio/DwebVideoStudio/DVStudio/electron/backend/router.mjs) 提供统一的 IPC 路由注册：

- 自动包装 handler，统一 `{ ok, value, error }` 返回格式
- 自动捕获异常并包装为标准化错误
- 支持流式 handler（`stream: true`），通过 `createStreamHandler` 处理
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
- `repos`: LocalDB 仓库集合（projects, meshyTasks, videoTasks, apiKeys 等）
- 其他依赖（在 initBackend 时通过 deps 传入）

### 3.5 流式响应（IPC Stream）

对于需要流式输出的场景（如 AI 对话），使用 IPC 三通道模式：

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

#### Logger ([core/logger.mjs](file:///G:/DwebStudio/DwebVideoStudio/DVStudio/electron/backend/core/logger.mjs))
```javascript
import logger from './core/logger.mjs'
logger.info('message')
logger.warn('warning')
logger.error('error', err)
logger.debug('debug info')
```

#### Errors ([core/errors.mjs](file:///G:/DwebStudio/DwebVideoStudio/DVStudio/electron/backend/core/errors.mjs))
```javascript
import { UpstreamError, ValidationError, wrapError } from './core/errors.mjs'

throw new ValidationError('参数无效')
throw new UpstreamError('外部 API 调用失败')
// wrapError 会自动将任意错误包装为标准格式
```

#### HTTP Client ([core/http-client.mjs](file:///G:/DwebStudio/DwebVideoStudio/DVStudio/electron/backend/core/http-client.mjs))

用于调用外部 AI/三方 API（DeepSeek、Gemini、Meshy、Seedance 等）：

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

**Channel 命名规范**: `dweb:<module>:<action>`
- 模块名使用 kebab-case（如 `project-assets`、`third-party`、`agent-skills`）
- 使用动词或名词清晰描述操作

### 4.3 handlers.mjs 格式

```javascript
// modules/example/handlers.mjs
import { ValidationError } from '../../core/errors.mjs'

export async function helloHandler(ctx, payload, event) {
  const name = String(payload?.name || 'World')
  return { message: `Hello, ${name}!` }
  // 或返回 { ok: true, value: { message: ... } }
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

在 [electron/backend/index.mjs](file:///G:/DwebStudio/DwebVideoStudio/DVStudio/electron/backend/index.mjs) 中：

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

3. 如有需要，在 preload.mjs 中暴露对应的前端 API（参考现有模块的暴露方式）。

## 5. 现有后端模块详解

### 5.1 System 模块 (`modules/system/`)
- **职责**: 系统健康检查、迁移状态、诊断信息
- **Channels**:
  - `dweb:system:ping` - 健康检查
  - `dweb:system:migration-checklist` - 迁移检查清单
  - `dweb:diagnostics:collect` - 收集诊断信息（通过 main.mjs 注册）

### 5.2 Projects 模块 (`modules/projects/`)
- **职责**: 项目 CRUD（列表/保存/加载/删除/从文件夹打开）
- **Channels**: `dweb:projects:list`, `dweb:projects:save`, `dweb:projects:load`, `dweb:projects:delete`, `dweb:projects:open-folder` 等
- **数据来源**: LocalDB `projects` 表（唯一事实来源）

### 5.3 Project Assets 模块 (`modules/project-assets/`)
- **职责**: 项目资产元数据管理
- **Channels**: 资产列表、元数据查询等
- **注意**: 资产的二进制操作（上传/导入/下载）通过 `projectStaticAssets/service.mjs` 和 `dweb://` 协议处理

### 5.4 Chat 模块 (`modules/chat/`)
- **职责**: AI 对话服务（直接调用外部 AI API）
- **Channels**:
  - `dweb:chat:sendMessage` (stream) - 发送消息并流式返回响应
  - `dweb:chat:listModels` - 获取可用模型列表
- **支持的 AI 提供商**: DeepSeek（默认）、Gemini、ByteDance（豆包）等
- **API 密钥存储**: LocalDB `api_keys` 表（AES-256-GCM 加密）
- **HTTP 调用**: 使用 `core/http-client.mjs` 直接调用外部 API

### 5.5 Codex 模块 (`modules/codex/`)
- **职责**: GitHub Copilot CLI / Codex CLI 集成（可选）
- **Channels**: `dweb:codex:sendMessage` (stream) 等
- **注意**: 这是可选功能，需要本地安装 Copilot/Codex CLI

### 5.6 ComfyUI 模块 (`modules/comfyui/`)
- **职责**: ComfyUI 工作流桥接
- **Channels**: ComfyUI 工作流提交、状态查询、结果获取等
- **任务存储**: LocalDB `comfyui_jobs` 表

### 5.7 Meshy 模块 (`modules/meshy/`)
- **职责**: Meshy 3D 模型生成 API 集成
- **Channels**: 3D 生成任务提交、状态查询、结果下载等
- **任务存储**: LocalDB `meshy_tasks` 表
- **HTTP 调用**: 通过 `core/http-client.mjs` 调用 Meshy API

### 5.8 Seedance 模块 (`modules/seedance/`)
- **职责**: Seedance 视频生成 API 集成
- **Channels**: 视频生成任务提交、状态查询等
- **任务存储**: LocalDB `video_tasks` 表

### 5.9 Third-Party 模块 (`modules/third-party/`)
- **职责**: 三方 API 统一网关
- **Channels**: 统一的三方 API 调用入口
- **包含**: NanoBanana、SeeDream、即梦（Jimeng）等三方服务

### 5.10 Editor 模块 (`modules/editor/`)
- **职责**: 视频编辑器后端支持（组件库等）
- **Channels**: 组件库列表、组件 CRUD 等

### 5.11 Export 模块 (`modules/export/`)
- **职责**: 视频/项目导出
- **Channels**: 导出任务提交、状态查询、ffmpeg 调用（通过 child_process）
- **任务存储**: LocalDB `export_jobs` 表

### 5.12 Subtitle 模块 (`modules/subtitle/`)
- **职责**: 字幕处理（字幕解析、SRT 导出、AI 字幕等）
- **Channels**: 字幕解析、格式化等
- **注意**: 部分计算密集型任务通过 **Python Bridge** 执行

### 5.13 Agent Skills 模块 (`modules/agent-skills/`)
- **职责**: Agent Skills（场景理解、灯光、布局、Unreal 导出等）
- **Channels**: 场景理解、布局建议、Unreal 导出等
- **特殊功能**: 内置独立 HTTP 服务器用于 Unreal Engine 集成（`startUnrealHttpServer`）

## 6. Python Bridge（可选）

[electron/backend/python-bridge/](file:///G:/DwebStudio/DwebVideoStudio/DVStudio/electron/backend/python-bridge/) 提供可选的 Python 工作进程支持：

- **用途**: 字幕处理等需要 Python 生态的计算密集型任务
- **非核心依赖**: 核心功能（AI 对话、工作流、资产管理等）不依赖 Python
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

后端模块通过 context 中的 `repos` 访问 LocalDB：

```javascript
export async function exampleHandler(ctx, payload) {
  const { projects, apiKeys, meshyTasks } = ctx.repos
  
  // 查询项目
  const projectList = projects.list()
  
  // 保存 API Key（自动加密）
  await apiKeys.set('deepseek', { apiKey: 'sk-xxx', baseUrl: '...' })
  
  // 获取 API Key（自动解密）
  const key = await apiKeys.get('deepseek')
  
  return { ok: true }
}
```

LocalDB 仓库位于 [electron/localdb/repos/](file:///G:/DwebStudio/DwebVideoStudio/DVStudio/electron/localdb/repos/)，包含：
- `projects.mjs` - 项目仓库
- `apiKeys.mjs` - API 密钥（加密存储）
- `meshyTasks.mjs` - Meshy 任务
- `videoTasks.mjs` - 视频生成任务
- `comfyuiJobs.mjs` - ComfyUI 任务
- `exportJobs.mjs` - 导出任务

新增数据字段必须通过 [electron/localdb/migrations.mjs](file:///G:/DwebStudio/DwebVideoStudio/DVStudio/electron/localdb/migrations.mjs) 添加迁移。

## 8. 前端调用方式

前端通过 `src/electronBridge/index.ts` 和 `src/network/ipcClient.ts` 调用后端：

```typescript
import { ipcCall, hasIpcModule } from '../network/ipcClient'

// 检测模块可用性
if (hasIpcModule('chat')) {
  // 调用 IPC
  const result = await ipcCall(() => window.dweb.chat.sendMessage({ message: 'hello' }))
}

// 流式调用
const generator = window.dweb.chat.sendMessageStream({ message: 'hello' })
for await (const chunk of generator) {
  // 处理流式数据
}
```

## 9. 禁止事项

1. **禁止添加新的 HTTP 服务器**：除了 Unreal 导出专用的 HTTP 服务器外，不要在后端启动任何 HTTP 服务器
2. **禁止直接使用 Django**：不要添加任何 Django/Python HTTP 服务器相关代码
3. **禁止在后端操作 DOM**：后端运行在 Electron 主进程，不能访问 window/document
4. **禁止硬编码外部 API 地址**：外部 API 的 base URL 和密钥应允许用户配置（存储在 LocalDB 或 settings.json）
5. **禁止在 handler 中执行长时间阻塞操作**：使用异步生成器（stream）处理长时间运行的任务
6. **禁止直接修改 dweb:// 协议路径外的文件**：文件操作必须限制在项目根目录或 DVSResource 目录内
