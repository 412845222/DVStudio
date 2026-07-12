# 桌面端开发指引 (Electron Guide)

## ⚠️ 重要架构变更（2026-07 更新）

**Django 已完全移除**。Electron 不再启动或管理 Django 子进程。所有后端逻辑已收拢到 Electron 主进程的 Node.js IPC 后端中。

**2026-07 重大扩展**：新增 Agent Runtime、内置 MCP 服务器、CLI 适配器层、云端模板中心、Blender 集成、Tripo3D/Ark/Gemini 多模型生成、3D 编辑器窗口等能力：

- 后端模块从 13 个扩展至 **20 个**
- LocalDB 仓库从 6 个扩展至 **14 个**
- Electron 桥接命名空间扩展至 **24 个**
- 新增内置 MCP 服务器（stdio + socket 双桥接）
- 新增 CLI 适配器层（Claude/Codex/Copilot）
- 新增 Blender 集成与 MCP 桥接
- 启动时序增加 MCP 服务器初始化、Blender 环境检测
- 环境准备流程扩展至 7 步

## 1. 架构定位

Electron 在本项目中**绝不仅仅是"壳"**，它承担着以下关键职责：

1. **窗口宿主**：提供独立的 BrowserWindow 加载 Vue 前端，包括主窗口、资源管理器窗口、模板中心窗口、3D编辑器窗口、图片标注预览窗口等。
2. **Node.js IPC 后端**（`electron/backend/`）：承载所有后端逻辑（20个模块），通过 IPC 与渲染进程通信，直接调用外部 AI API。
3. **Agent Runtime**（`electron/backend/modules/agent/`）：统一 Agent 执行引擎，抽象 LLM Provider，管理工具注册、上下文构建、流式对话。
4. **MCP 服务器**（`electron/backend/modules/mcp/`）：内置 Model Context Protocol 服务器，支持 stdio/socket 双桥接，统一工具执行。
5. **CLI 适配器层**（`electron/backend/modules/cli-adapters/`）：管理 Claude/Codex/Copilot 等外部 CLI 工具的会话生命周期。
6. **本地数据库**（`electron/localdb/`）：better-sqlite3 SQLite 实例，承载 14 个仓库的数据（项目、任务、会话、模板、API密钥等）——**唯一事实来源**。
7. **dweb:// 项目资产协议**（`electron/backend/projectAssetProtocol.mjs`）：自定义协议让渲染端直接从磁盘读取项目静态资产，不经过任何 HTTP 通道。
8. **项目静态资产服务**（`electron/backend/projectStaticAssets/`）：upload / import / delete / resolve / repair / download / copy 等写操作的主进程实现。
9. **平台抽象层**（`electron/platform/`）：管理 Steam 等平台提供者，加载原生模块（如 `dweb_steamjs.node`），处理平台事件泵与 IPC。
10. **Blender 集成**（`electron/backend/modules/blender/`）：Blender 环境检测、工作空间管理、MCP 桥接连接。
11. **Python 环境引导安装**（`electron/static/bootstrap/`）：在缺失 Python 环境时调用 Windows / macOS 安装脚本（仅字幕等可选功能需要）。
12. **Python Bridge**（`electron/backend/python-bridge/`）：可选的 Python 工作进程桥接，用于计算密集型任务（非核心依赖）。
13. **云端模板中心**（`electron/backend/modules/cloud-templates/`）：支持 local/steam 双适配器的模板获取与管理。
14. **诊断与日志收集**（`electron/backend/diagnostics.mjs`）：用户报错时可一键导出诊断信息。
15. **IPC 桥**（`electron/preload.mjs` + `src/electronBridge/index.ts` + `src/platformBridge/`）：通过 `contextBridge.exposeInMainWorld('dweb', ...)` 暴露 24 个命名空间给前端。
16. **Unreal HTTP 服务器**（`electron/backend/modules/agent-skills/`）：内置独立 HTTP 服务器用于 Unreal Engine 集成（默认随机端口）。

## 2. 进程通信 (IPC)

### 2.1 主进程（`electron/main.mjs`）
- **启动前**（`app.ready` 之前）：
  - `protocol.registerSchemesAsPrivileged([{ scheme: 'dweb', ... }])` 注册 dweb 协议为 privileged。
  - 调用 `platformPreflight()` 执行平台预检；若请求重启（需通过 Steam 客户端启动），则直接退出。
- `app.whenReady().then(...)` 内按顺序执行：
  1. 创建主 BrowserWindow
  2. 配置便携模式路径（检测安装目录是否可写）
  3. 初始化运行时日志与崩溃诊断
  4. `initLocalDb()` —— 初始化本地数据库（多路径回退，14个仓库）
  5. `platformInit()` —— 初始化平台层（加载原生模块、启动事件泵）
  6. `runSetupWorkflow()` —— 运行环境准备流程（7步）：
     - Python 环境检测（可选）
     - 创建资源目录（DVSResource/ 结构）
     - 初始化 Python Bridge（可选）
     - 初始化 Node.js IPC 后端（注册所有20个模块路由）
     - **初始化 MCP 服务器** —— 启动 stdio/socket 双桥接，注册内置工具
     - Blender 环境检测（可选）
     - 检测 ffmpeg（可选）
  7. `registerDwebProjectAssetProtocol()` —— 注册 dweb 协议处理器
  8. `registerLocalDbIpc()` —— 注册 LocalDB IPC
  9. `registerPlatformIpc()` —— 注册平台层 IPC
  10. 注册 `projectStaticAssets`、MCP、Agent、CLI、Blender、Cloud Templates 等其他 IPC
  11. `setMainWindowForPlatform(win)` —— 将主窗口绑定到平台层（用于 Overlay）
  12. 启动 Unreal HTTP 服务器（agent-skills 模块）
- 注册 `ipcMain.handle` 监听器（通过模块化注册函数和 backend router）。
- **退出时**：`platformShutdown()` → 关闭 MCP 服务器 → 关闭 Python Bridge → `shutdownBackend()` → 关闭 Unreal HTTP 服务器 → 关闭 LocalDB。

### 2.2 预加载脚本（`electron/preload.mjs`）
- 通过 `contextBridge.exposeInMainWorld` 暴露安全的 API 给前端，按命名空间组织（共 **24 个命名空间**）：
  - `window.dweb.common.*`：应用信息、后端状态、设置、诊断、窗口控制、引导安装
  - `window.dweb.window.*`：窗口控制（最小化/最大化/重载/DevTools/打开3D编辑器/关闭）
  - `window.dweb.chat.*`：AI 对话（含流式通道）
  - `window.dweb.agent.*`：**新增** Agent Runtime（流式对话、上下文、会话管理、中止）
  - `window.dweb.mcp.*`：**新增** MCP 服务器（连接/断开/工具列表/工具调用/状态/桥接）
  - `window.dweb.cli.*`：**新增** CLI 适配器（环境检测、会话、流式消息、配置、认证）
  - `window.dweb.export.*`：导出服务
  - `window.dweb.editor.*`：编辑器后端
  - `window.dweb.comfyui.*`：ComfyUI 桥接
  - `window.dweb.thirdParty.*`：三方 API
  - `window.dweb.projects.*`：项目管理
  - `window.dweb.projectAssets.*`：项目资产
  - `window.dweb.meshy.*`：Meshy 3D
  - `window.dweb.tripo3d.*`：**新增** Tripo3D 3D 生成
  - `window.dweb.seedance.*`：Seedance 视频
  - `window.dweb.ark.*`：**新增** Ark 视频生成（点分隔命名）
  - `window.dweb.gemini.*`：**新增** Gemini 视频生成
  - `window.dweb.blender.*`：**新增** Blender 集成（状态、MCP桥接、导入、工具、工作空间）
  - `window.dweb.cloudTemplates.*`：**新增** 云端模板中心
  - `window.dweb.agentSkills.*`：Agent Skills
  - `window.dweb.codex.*`：Codex/Copilot（兼容保留）
  - `window.dweb.aiworkflow.*`：项目根注册、资产操作、资源管理器、图片标注、LocalDB 访问、模板中心
  - `window.dweb.platform.*`：平台能力（Steam 状态/用户/好友/Overlay/DLC/热键）
  - `window.dweb.model3d-editor.*`：**新增** 3D编辑器窗口控制
  - 资源管理器窗口预注册监听器与数据缓存（`onResourceManagerData`/`onResourceManagerEvent`/`onResourceManagerNotify`）
  - 模板中心窗口预注册监听器与数据缓存（`onTemplateCenterData`）
  - 后端运行时状态变化监听器（`onBackendRuntimeStateChanged`）
- **注意**：不再注入 `window.__DWEB_BACKEND_BASE_URL`（因为不再有 HTTP 后端服务器）。

### 2.3 渲染进程（Vue）
- 通过 `src/electronBridge/index.ts` 封装调用，**不要**在组件中直接 `window.dweb.*`。
- 通过 `src/platformBridge/` 封装平台能力调用，**不要**在组件中直接 `window.dweb.platform.*`。
- 通过 `src/network/runtimePlatform.ts` 的 `isElectron()` 区分 Electron / Web 模式。
- 通过 `src/network/ipcClient.ts` 的 `ipcCall()` / `ipcStream()` 调用 IPC 后端，自动解包结果。
- Agent/MCP/CLI 相关调用建议使用 `src/network/chat/` 下的服务类封装。
- 资产 URL 一律走 `src/network/backendConfig.ts` 的 `resolveBackendUrl()`，dweb:// 协议自动被 Electron 拦截。

## 3. Node.js IPC 后端（`electron/backend/`）—— 核心

### 3.1 架构概览

后端采用模块化设计，所有逻辑运行在 Electron 主进程中，通过 IPC 与前端通信：

- **入口**：`electron/backend/index.mjs`（`initBackend()` / `shutdownBackend()`）
- **路由**：`electron/backend/router.mjs`（`createRouter()` 统一注册 IPC 通道，自动错误包装、流处理支持）
- **上下文**：`electron/backend/context.mjs`（每个请求的上下文工厂，包含 mainWindow、14个repos、deps 等）
- **核心工具**（`electron/backend/core/`）：
  - `logger.mjs`：日志工具
  - `errors.mjs`：统一错误类型（UpstreamError、ValidationError、wrapError）
  - `http-client.mjs`：HTTP 客户端（支持普通请求 + SSE 流式请求，用于调用外部 API）
  - `sse-parser.mjs`：SSE 解析器
  - `stream.mjs`：IPC 流处理工具（创建三通道流处理器）
- **功能模块**（`electron/backend/modules/<name>/`，共20个）：每个模块遵循统一结构
  - `routes.mjs`：导出该模块的 IPC 路由列表
  - `handlers.mjs`：请求处理器实现
  - `service.mjs`：业务逻辑服务层（如需要）
  - 复杂模块可包含子目录（runtime/providers/server/adapters 等）

### 3.2 后端模块列表（共 20 个）

| 模块 | 路径 | 职责 |
| --- | --- | --- |
| system | `modules/system/` | 系统健康检查、迁移状态、诊断、更新检查 |
| projects | `modules/projects/` | 项目 CRUD |
| project-assets | `modules/project-assets/` | 项目资产元数据 |
| chat | `modules/chat/` | AI 对话（多供应商适配器，流式） |
| comfyui | `modules/comfyui/` | ComfyUI 桥接 |
| meshy | `modules/meshy/` | Meshy 3D 生成 |
| tripo3d | `modules/tripo3d/` | **新增** Tripo3D 3D 生成 |
| seedance | `modules/seedance/` | Seedance 视频生成 |
| ark | `modules/ark/` | **新增** Ark 视频生成（字节火山引擎） |
| gemini | `modules/gemini/` | **新增** Gemini 视频生成 |
| third-party | `modules/third-party/` | 三方 API 统一网关 |
| editor | `modules/editor/` | 编辑器后端（组件库等） |
| export | `modules/export/` | 导出服务（ffmpeg 调用） |
| subtitle | `modules/subtitle/` | 字幕处理（部分通过 Python Bridge） |
| agent-skills | `modules/agent-skills/` | Agent Skills（场景理解/灯光/布局/Unreal导出，含Unreal HTTP服务器） |
| agent | `modules/agent/` | **新增** Agent 运行时（runtime/providers/dvsagent） |
| mcp | `modules/mcp/` | **新增** MCP 服务器（server/builtinTools/toolExecutor） |
| cli-adapters | `modules/cli-adapters/` | **新增** CLI 适配器层（base/manager/claudeCli/codexCli/copilotCli） |
| cloud-templates | `modules/cloud-templates/` | **新增** 云端模板中心（adapters/：base/factory/local/steam） |
| blender | `modules/blender/` | **新增** Blender 集成（config/workspace/service + MCP桥接） |

### 3.3 统一返回格式

所有 IPC handler 返回值遵循 `{ ok, value, error }` 格式（router 自动包装）：
- 成功：`{ ok: true, value: <数据> }`
- 失败：`{ ok: false, error: '错误消息' }`

前端通过 `src/network/ipcClient.ts` 的 `unwrapIpcResult()` 或 `ipcCall()` 自动解包。

### 3.4 流式响应（IPC Stream）

对于 AI 对话、Agent 响应等需要流式输出的场景，使用 IPC 三通道模式：
1. 前端调用 `channel:stream` 启动流
2. 后端通过 `channel:data` 事件发送数据块（带 requestId）
3. 后端通过 `channel:end` 事件通知结束（带 requestId）
4. 出错时通过 `channel:error` 发送错误（带 requestId）

handler 使用异步生成器（`async function*`）实现，`core/stream.mjs` 的 `createStreamHandler` 自动处理通道事件。

详细规范请参阅 [04_BACKEND_GUIDE.md](04_BACKEND_GUIDE.md)。

## 4. 平台抽象层（`electron/platform/`）—— 核心模块

> 这一层为 Steam 等平台集成提供了统一抽象，通过 provider 模式支持多平台，Web/开发模式下自动降级为 Mock。

### 4.1 模块结构
- `index.mjs`：平台层入口
  - `platformPreflight()`：平台预检（app.ready 前调用，可能返回 'restart' 请求重启）
  - `platformInit()`：初始化所有已发现的 provider、启动事件泵
  - `platformShutdown()`：关闭所有 provider
  - `platformOverlayOpenUrl(url)`：通过平台 Overlay 打开 URL
  - `platformOverlayActivateGameOverlay(dialog)`：激活平台游戏 Overlay
  - `platformIsDlcInstalled(dlcAppId)`：检查 DLC 是否安装
  - `platformGetInstalledDlcs()`：获取已安装 DLC 列表
  - `registerPlatformIpc()`：注册平台 IPC 通道
  - `setMainWindowForPlatform(win)`：绑定主窗口供 Overlay 使用
- `manager.mjs`：平台管理器核心
  - `discover()`：发现可用 provider
  - `preflightAll()`：执行所有 provider 的预检
  - `initializeAll()`：初始化所有 provider
  - `startCallbackPump()`：启动事件回调泵（轮询原生模块事件）
  - `shutdownAll()`：关闭所有 provider
  - `getStatus()` / `getUser()` / `getFriends()` / `getInstalledDlcs()`：状态查询
- `providers/`：平台提供者实现
  - `mock.mjs`：Mock 提供者，无操作，用于 Web 模式或无平台环境
  - `steam.mjs`：Steam 平台提供者
    - 加载 `dweb_steamjs.node` 原生模块
    - 封装 Steamworks API 调用（初始化、用户信息、好友列表、DLC、Overlay）
    - 从原生模块回调泵接收事件
- `native/`：平台原生模块
  - `win32/`：Windows x64 平台二进制
    - `dweb_steamjs.node`：Steamworks Node.js 原生扩展（N-API）
    - `steam_api64.dll`：Steamworks 官方 DLL
    - `.manifest.json`：原生模块清单
  - 其他平台（macOS / Linux）暂未提供原生模块，自动回退到 Mock
- `config.mjs`：原生模块路径解析（按当前 OS / 架构查找正确的 .node / .dll / .dylib）
- `events.mjs`：平台事件类型定义
- `ipc.mjs`：平台 IPC 注册
  - 注册 `dweb:platform:*` 通道供前端调用
  - 推送平台事件到渲染进程
- `types.mjs`：平台类型定义（JSDoc）

### 4.2 启动时序
1. **app.ready 之前**：`platformPreflight()`
   - 管理器发现 provider（Steam 环境可用则选 steam，否则 mock）
   - 调用每个 provider 的 `preflight()`
   - Steam provider 检查是否通过 Steam 客户端启动；若不是且需要，则返回 'restart'
2. **app.whenReady 内**：`platformInit()`
   - 调用每个 provider 的 `initialize()`（Steam provider 加载并初始化原生模块）
   - 启动事件泵（`startCallbackPump()`），定时轮询原生模块事件
   - 打印初始化日志（激活平台名、用户名）
3. **创建窗口后**：`setMainWindowForPlatform(win)`
   - 将窗口句柄传给 provider，供 Steam Overlay 等功能使用
4. **运行时**：平台事件通过事件泵从原生模块 → provider → manager → IPC → 渲染进程
5. **退出时**：`platformShutdown()` 清理 provider 资源

### 4.3 Steam 开发环境设置
- 原生模块需通过 `npm run setup:steam` 从构建产物复制到正确位置
- 开发时使用 `npm run dev:electron`（已包含 Steam 设置步骤）
- 设置环境变量 `DWEB_STEAMJS_DEBUG=1` 可开启 Steam 原生模块调试日志
- Steam App ID 通过 `steam_appid.txt`（仓库根目录有 `steam_appid.txt.example`）配置

## 5. 本地数据库（`electron/localdb/`）—— 核心数据层

### 5.1 模块结构
- `db.mjs`：better-sqlite3 实例管理；带 ABI 错误友好提示（Electron / Node ABI 变化时）
- `index.mjs`：多路径回退初始化（`backendDataDir` → `userDataDir` → `tmpdir` → `homedir`）
- `migrations.mjs`：基于 `PRAGMA user_version` 的迁移（`TARGET_VERSION`，`runV<n>(db)` 函数）
- `json.mjs`：ISO ↔ 毫秒、可选 JSON 字段解析

### 5.2 仓库层（`electron/localdb/repos/`，共 14 个）
- `projects.mjs`：项目元数据 CRUD
- `meshyTasks.mjs`：Meshy 3D 任务
- `videoTasks.mjs`：视频生成任务
- `tripo3dTasks.mjs`：**新增** Tripo3D 任务
- `arkTasks.mjs`：**新增** Ark 任务
- `geminiTasks.mjs`：**新增** Gemini 任务
- `comfyuiJobs.mjs`：ComfyUI 任务
- `comfyuiWorkflows.mjs`：**新增** ComfyUI 工作流
- `exportJobs.mjs`：导出任务
- `editorComponents.mjs`：**新增** 编辑器组件
- `chatConversations.mjs`：**新增** AI/Agent 对话会话
- `aiworkflowTemplates.mjs`：**新增** AI 工作流模板
- `refImageCache.mjs`：**新增** 参考图缓存
- `apiKeys.mjs`：API 密钥（AES-256-GCM + PBKDF2，120k iterations；仅明文保存 `keyFingerprint`）

### 5.3 IPC 主机（`electron/localdb/ipc/`）
- `ipcHost.mjs`：注册 `dweb:localdb:*` 通道。所有 handler 由 `safe()` 包装，**LocalDB 未初始化时自动用 fallback 路径重试**，避免启动竞态。
- `djangoMigrate.mjs`：**迁移清理用** —— 从旧版 Django SQLite 迁移数据到 LocalDB（仅升级时使用，不用于日常运行）。

### 5.4 数据事实来源
- **LocalDB 是运行时唯一事实来源**。
- **不再有 Django SQLite 镜像**。
- 新增数据字段必须通过 LocalDB 迁移（`migrations.mjs`）添加。
- 后端模块通过 `ctx.repos` 访问 LocalDB；前端通过 `window.dweb.aiworkflow.db.*` IPC 访问。

## 6. dweb:// 项目资产协议

### 6.1 协议格式
```
dweb://project-assets?projectId=<id>&path=<rel>&variant=<v>&maxSize=<n>&v=<versionTag>
```

### 6.2 工作方式
- 渲染端把上述 URL 赋给 `<img src>` / `fetch()` / Three.js 纹理加载器。
- Electron 主进程的协议处理器（`electron/backend/projectAssetProtocol.mjs`）拦截该 URL，**不经过任何后端模块或 HTTP**，从磁盘读取并返回字节流。
- 同时可携带 `variant`（如 `thumb`）与 `maxSize`（128-4096 px）查询参数生成缩略图。
- `v` 是版本号标签（项目快照版本），避免浏览器缓存命中旧文件。

### 6.3 路径安全
- 拒绝绝对路径（`rel.startsWith('/')`）
- 拒绝 `..` 路径穿越（`rel.includes('..')`）
- 解析后必须位于项目根目录内
- MIME 推断按扩展名映射表

### 6.4 注册位置
- `electron/main.mjs`：`protocol.registerSchemesAsPrivileged([{ scheme: 'dweb', privileges: { standard, secure, supportFetchAPI, stream } }])`
- `electron/main.mjs`：`protocol.handle('dweb', handler)`（实际处理函数由 `registerDwebProjectAssetProtocol` 注入）

### 6.5 项目静态资产服务（`electron/backend/projectStaticAssets/`）
- `manifest.mjs`：项目 manifest（`{projectId, name, rootPath, assets, ...}`）读写
- `paths.mjs`：路径工具（安全 resolve、URL 构造、相对路径规范化）
- `service.mjs`：在主进程内直接提供 `uploadBufferProjectAsset` / `importUrlProjectAsset` / `importFileProjectAsset` / `deleteStaticProjectAsset` / `resolveStaticProjectAsset` / `repairAllProjectAssets` 等函数
- 这是 **Electron 模式下** 资产写操作的真实入口，前端通过 IPC 调用。

## 7. Agent Runtime（`electron/backend/modules/agent/`）—— 新增核心

> 统一的 Agent 执行引擎，抽象多种 LLM Provider，管理工具注册与执行。

### 7.1 目录结构
- `runtime/AgentRuntime.mjs`：Agent 运行时核心，协调 Provider、ToolRegistry、ContextBuilder
- `runtime/ContextBuilder.mjs`：对话上下文构建器
- `runtime/ToolRegistry.mjs`：工具注册中心，管理 MCP 工具和内置工具
- `runtime/ToolImageProcessor.mjs`：工具图片处理器
- `providers/ILLMProvider.mjs`：LLM Provider 接口定义
- `providers/ApiLLMProvider.mjs`：直接 API 调用 Provider
- `providers/CliLLMProvider.mjs`：CLI 适配器 Provider（通过 cli-adapters 模块）
- `providers/CodexProvider.mjs`：Codex Provider
- `providers/CopilotProvider.mjs`：Copilot Provider
- `providers/DVSAgentProvider.mjs`：DVSAgent Provider
- `providers/index.mjs`：Provider 工厂
- `providers/toolOutputParser.mjs`：工具输出解析器
- `dvsagent/DVSAgentEnhancedProvider.mjs`：DVSAgent 增强 Provider
- `dvsagent/LLMClient.mjs`：LLM 客户端

### 7.2 IPC 通道
- `dweb:agent:stream` (stream)：Agent 流式对话
- `dweb:agent:context`：获取上下文
- `dweb:agent:abort`：中止对话
- `dweb:agent:list-conversations`：会话列表
- `dweb:agent:create/delete/rename-conversation`：会话管理
- `dweb:agent:get/add-conversation-messages`：消息管理

## 8. MCP 服务器（`electron/backend/modules/mcp/`）—— 新增核心

> 内置 Model Context Protocol 服务器，支持 stdio/socket 双桥接。

### 8.1 目录结构
- `server/DVStudioMCPServer.mjs`：MCP 服务器主类
- `server/stdioBridge.mjs`：stdio 桥接（标准输入输出连接外部进程如 Blender）
- `server/socketBridge.mjs`：socket 桥接（TCP Socket 连接）
- `builtinTools.mjs`：内置工具注册
- `client.mjs`：MCP 客户端
- `toolExecutor.mjs`：工具执行器（统一参数验证、错误处理、超时控制）

### 8.2 IPC 通道
- `dweb:mcp:connect/disconnect`：连接/断开 MCP 服务器
- `dweb:mcp:list-tools`：列出可用工具
- `dweb:mcp:call-tool`：调用工具
- `dweb:mcp:register-builtin`：注册内置工具
- `dweb:mcp:get-status`：获取状态
- `dweb:mcp:list-servers`：列出服务器
- `dweb:mcp:get-bridge-status`：获取桥接状态
- `dweb:mcp:get-bridge-script`：获取桥接脚本

### 8.3 安全约束
- 工具执行必须通过 toolExecutor 统一管理
- 禁止绕过执行器直接调用工具
- Blender 等外部进程通过 MCP 桥接暴露工具

## 9. CLI 适配器层（`electron/backend/modules/cli-adapters/`）—— 新增

> 统一管理 Claude/Codex/Copilot 等外部 CLI 工具的会话生命周期。

### 9.1 目录结构
- `base.mjs`：CLI 适配器基类（统一 start/stop/send/cancel 接口）
- `manager.mjs`：CLI 适配器管理器（生命周期管理：check-environment → start-session → send-message:stream → stop-session）
- `claudeCli.mjs`：Claude CLI 适配器
- `codexCli.mjs`：Codex CLI 适配器
- `copilotCli.mjs`：Copilot CLI 适配器
- `cliConfigStore.mjs`：CLI 配置持久化存储

### 9.2 IPC 通道
- `dweb:cli:check-availability/list-adapters`：可用性与适配器列表
- `dweb:cli:start/stop-session`：会话管理
- `dweb:cli:send-message:stream` (stream)：流式发送消息
- `dweb:cli:cancel/check-environment/list-models`：取消、环境检查、模型列表
- `dweb:cli:get/save/reset-config`：配置管理
- `dweb:cli:run-fix`：修复运行
- `dweb:cli:start-auth:stream` (stream)：认证流程

## 10. Blender 集成（`electron/backend/modules/blender/`）—— 新增

> Blender 环境检测、工作空间管理、MCP 桥接连接。

### 10.1 目录结构
- `config.mjs`：Blender 配置
- `workspace.mjs`：Blender 工作空间管理
- `service.mjs`：Blender 服务

### 10.2 IPC 通道
- `dweb:blender:status:check`：状态检查
- `dweb:blender:mcp:connect/disconnect/status/call-tool`：MCP 桥接
- `dweb:blender:import:model`：导入模型
- `dweb:blender:tools:check/mount`：工具检查与挂载
- `dweb:blender:workspace:*`：工作空间操作

## 11. 云端模板中心（`electron/backend/modules/cloud-templates/`）—— 新增

> 支持多平台（local/steam）模板获取与管理，适配器模式。

### 11.1 目录结构
- `adapters/base.mjs`：适配器基类
- `adapters/factory.mjs`：适配器工厂
- `adapters/local.mjs`：本地模板适配器
- `adapters/steam.mjs`：Steam 模板适配器
- `types.mjs`：类型定义

### 11.2 IPC 通道
- `dweb:cloud-templates:get-platform/get-quota`：平台与配额
- `dweb:cloud-templates/list/upload/download/delete`：模板 CRUD

## 12. Python Bridge（`electron/backend/python-bridge/`）—— 可选组件

> Python Bridge 是可选组件，仅字幕等特定计算密集型功能依赖。核心功能完全不依赖 Python。

### 12.1 模块结构
- `index.mjs` / `runtime.mjs`：Python 子进程管理（启动/停止/健康检查）
- `rpc.mjs`：Node.js ↔ Python RPC 通信（JSON-RPC over stdio）
- `pip.mjs`：pip 包管理（按需安装依赖）
- `scripts/`：Python 侧脚本
  - `worker.py`：Python worker 进程入口
  - `subtitle/`：字幕处理 Python 实现

### 12.2 Python 环境引导（`electron/static/bootstrap/`）

打包时通过 `package.json#build.extraResources` 复制到 `resources/static/bootstrap/`。

- `manifest.json`：声明当前内置的 Python 版本 / 安装方式
- `windows/install.cmd` / `windows/install.ps1`：Windows 平台 PowerShell 引导
- `mac/install.sh`：macOS 引导
- 由 `electron/backend/python.mjs` 在检测不到 Python 时调用
- **注意**：引导安装脚本仅在用户需要字幕等 Python 相关功能时才会触发，核心功能不需要 Python。

### 12.3 使用原则
1. 新增核心功能优先使用 Node.js 实现
2. 仅在必须使用 Python 特定库（如某些音频/视频处理库）时才使用 Python Bridge
3. Python 相关功能必须有优雅降级（Python 不可用时给出明确提示，不影响核心功能运行）

## 13. 运行时资源根目录

- **环境变量**: `DWEB_RESOURCE_DIR`
  - 开发模式默认：`DVSResource`（仓库内）
  - 生产模式默认：Electron `app.getPath('userData')`
  - 便携模式：安装目录可写时使用安装目录旁的 `DVSResource/`
- **LocalDB 文件路径**: `DWEB_RESOURCE_DIR/UserData/localdb.sqlite3`
- **用户设置**: `DWEB_RESOURCE_DIR/UserSettings/settings.json`
- **运行时日志**: `DWEB_RESOURCE_DIR/Logs/runtime.log`
- **后端数据**: `DWEB_RESOURCE_DIR/BackendData/`
- **MCP 数据**: `DWEB_RESOURCE_DIR/MCP/`
- **Blender 工作空间**: `DWEB_RESOURCE_DIR/Blender/`

> 便携模式检测：安装目录可写时自动启用便携模式；安装到 Program Files 等受保护目录时自动回退到用户目录。

## 14. 环境准备流程（Setup Workflow）

应用启动时自动运行环境准备流程（用户可在 `/welcome` 页面查看进度和重试），共 **7 步**：

1. **Python 环境检测**（可选）：检测系统 Python >=3.11，缺失时在 Windows 下尝试 winget 自动安装
2. **创建资源目录**：创建 `DVSResource/` 目录结构（UserData、UserSettings、BackendData、Logs、MCP、Blender）
3. **初始化 Python Bridge**（可选）：如 Python 可用则初始化 Python 工作进程
4. **初始化 Node.js IPC 后端**：注册所有 20 个后端 IPC 模块路由，启动 Unreal HTTP 服务器
5. **初始化 MCP 服务器**：启动 stdio/socket 双桥接，注册内置工具
6. **Blender 环境检测**（可选）：检测 Blender 是否可用
7. **检测 ffmpeg**（可选）：检测 ffmpeg 是否可用，不可用时仅影响视频导出

## 15. 关键文件位置速查

| 关注点 | 路径 |
| --- | --- |
| 主进程入口 | `electron/main.mjs` |
| 预加载脚本 | `electron/preload.mjs` |
| 公共配置 | `electron/config.mjs` |
| Node.js IPC 后端入口 | `electron/backend/index.mjs` |
| 后端路由注册 | `electron/backend/router.mjs` |
| 后端核心工具 | `electron/backend/core/`（logger/errors/http-client/sse-parser/stream） |
| 后端功能模块 | `electron/backend/modules/*/`（routes.mjs/handlers.mjs/service.mjs，共20个） |
| **Agent 运行时** | `electron/backend/modules/agent/`（runtime/providers/dvsagent） |
| **MCP 服务器** | `electron/backend/modules/mcp/`（server/builtinTools/toolExecutor） |
| **CLI 适配器** | `electron/backend/modules/cli-adapters/`（base/manager/claudeCli/codexCli/copilotCli） |
| **Blender 集成** | `electron/backend/modules/blender/`（config/workspace/service） |
| **云端模板** | `electron/backend/modules/cloud-templates/`（adapters/：base/factory/local/steam） |
| Python 环境检测 | `electron/backend/python.mjs` |
| Python Bridge（可选） | `electron/backend/python-bridge/` |
| 诊断收集 | `electron/backend/diagnostics.mjs` |
| dweb 协议 | `electron/backend/projectAssetProtocol.mjs` |
| 静态资产服务 | `electron/backend/projectStaticAssets/{manifest,paths,service}.mjs` |
| 本地 DB | `electron/localdb/{db,migrations,index,json}.mjs` |
| LocalDB 仓库 | `electron/localdb/repos/{projects,meshyTasks,videoTasks,tripo3dTasks,arkTasks,geminiTasks,comfyuiJobs,comfyuiWorkflows,exportJobs,editorComponents,chatConversations,aiworkflowTemplates,refImageCache,apiKeys}.mjs`（14个） |
| LocalDB IPC | `electron/localdb/ipc/{ipcHost,djangoMigrate}.mjs` |
| **平台抽象层入口** | `electron/platform/index.mjs` |
| **平台管理器** | `electron/platform/manager.mjs` |
| **平台 IPC** | `electron/platform/ipc.mjs` |
| **Steam 提供者** | `electron/platform/providers/steam.mjs` |
| **Mock 提供者** | `electron/platform/providers/mock.mjs` |
| **平台原生模块 (Win32)** | `electron/platform/native/win32/{dweb_steamjs.node,steam_api64.dll}` |
| Python 引导 | `electron/static/bootstrap/{windows,mac}/*` |
| Unreal 插件 | `electron/static/unreal-plugin/` |
| Steam 设置脚本 | `scripts/setup-steam-dev.mjs` / `scripts/setup-steam-native.mjs` |
| better-sqlite3 重建脚本 | `scripts/rebuild-better-sqlite3.mjs` |
| Unreal 插件打包脚本 | `scripts/package-unreal-plugin.mjs` |

## 16. 禁止事项

1. **禁止启动 Django 子进程**：Django 已完全移除，不要添加任何启动 Django 的代码
2. **禁止添加 HTTP 后端服务器**：除了 Unreal 集成专用的 HTTP 服务器外，不要监听任何 HTTP 端口
3. **禁止在主进程内操作 DOM**：主进程不能访问 window/document
4. **禁止绕过平台抽象层**：所有平台相关功能必须通过 `electron/platform/` 访问
5. **禁止在主进程内做长耗时同步 IO**：使用异步操作
6. **禁止直接修改项目目录外的文件**：文件操作必须限制在项目根目录或 DVSResource 目录内
7. **禁止绕过 toolExecutor 执行 MCP 工具**：MCP 工具必须通过 toolExecutor 统一管理
8. **禁止绕过 ToolRegistry 注册 Agent 工具**：Agent 工具必须通过 ToolRegistry 注册
9. **禁止绕过 CLI 适配器管理器启动子进程**：CLI 子进程必须通过 manager.mjs 管理
10. **禁止执行任意路径的 Blender 脚本**：Blender 脚本仅限工作空间目录内
