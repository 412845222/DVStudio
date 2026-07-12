# AI Agent 开发指引 (AI Agent Development Guide)

欢迎！作为 AI Agent，当你进入本项目（DVStudio）时，请首先阅读本指南。本指南将帮助你快速理解项目上下文、技术栈、架构边界以及开发规范，从而更好地提供 AI 编码服务。

## 📚 详细文档索引

为了保持根目录整洁，详细的上下文和开发边界指引已结构化存放在 `agent_docs/` 目录中。请根据当前任务的需要，查阅相应的文档：

- [00_INDEX.md](agent_docs/00_INDEX.md) — 文档目录与导读
- [01_PROJECT_OVERVIEW.md](agent_docs/01_PROJECT_OVERVIEW.md) — 项目概述与核心业务逻辑
- [02_ARCHITECTURE.md](agent_docs/02_ARCHITECTURE.md) — 系统架构与目录结构
- [03_FRONTEND_GUIDE.md](agent_docs/03_FRONTEND_GUIDE.md) — 前端开发指引（Vue 3 + WebGL2 + Platform Bridge）
- [04_BACKEND_GUIDE.md](agent_docs/04_BACKEND_GUIDE.md) — 后端开发指引（Electron Node.js IPC 后端 + Python Bridge）
- [05_ELECTRON_GUIDE.md](agent_docs/05_ELECTRON_GUIDE.md) — 桌面端开发指引（Electron + LocalDB + Platform Abstraction）
- [06_AI_WORKFLOW_GUIDE.md](agent_docs/06_AI_WORKFLOW_GUIDE.md) — AI 工作流蓝图开发指引
- [07_DEVELOPMENT_BOUNDARIES.md](agent_docs/07_DEVELOPMENT_BOUNDARIES.md) — 全仓开发边界与规范（⚠️ 必读）
- [08_3D_EDITOR_RENDERING_GUIDE.md](agent_docs/08_3D_EDITOR_RENDERING_GUIDE.md) — 3D 编辑器开发指引（整体架构 + Three.js 渲染优化）
- [09_AGENT_SYSTEM_GUIDE.md](agent_docs/09_AGENT_SYSTEM_GUIDE.md) — Agent 运行时开发指引（AgentRuntime + ILLMProvider + ToolRegistry + MCP 集成）
- [10_MCP_GUIDE.md](agent_docs/10_MCP_GUIDE.md) — MCP 开发指引（DVStudioMCPServer + 双桥接 + 工具注册与执行）
- [11_NEW_AI_MODULES_GUIDE.md](agent_docs/11_NEW_AI_MODULES_GUIDE.md) — 新增 AI 模块群指引（Tripo3D / Ark / Gemini / Blender / CloudTemplates / CLI Adapters）
- [12_TESTING_GUIDE.md](agent_docs/12_TESTING_GUIDE.md) — 测试开发指引（tests/ 目录结构 + Vitest + Mock 策略 + 质量门禁）

## 🎯 快速上下文

### 项目简介

**DVStudio (Dweb Video Studio)** 是一款面向视频创作的 AI 工作流桌面工具。应用完全基于 Electron 构建，**后端逻辑已全部收拢到 Electron 主进程**，通过 IPC（进程间通信）与渲染进程交互，不再依赖外部 Django 子进程或 HTTP 服务器。核心由 AI 工作流蓝图、视频编辑器、Agent 运行时、MCP 服务器、本地资产数据库（LocalDB + `dweb://` 协议）、Steam 平台集成、CLI 适配器层、云端模板中心、AI 对话辅助等组成，Python 仅作为可选 Bridge 用于特定计算密集型任务（如字幕处理）。

### 核心功能

1. **AI 工作流蓝图**：节点式编排（资源 → 剧情/分支 → ComfyUI / Meshy / Tripo3D / Seedance / Ark / Gemini 视频生成 → 输出媒体），单项目以「本地磁盘文件夹 + Electron LocalDB」共同存储
2. **视频编辑器**：舞台节点（矩形/文字/图片/线条）+ 时间轴关键帧（含音频波形、缓动曲线编辑）+ AI 对话辅助 + 组件库面板 + 字幕编辑器
3. **Agent 运行时**：`electron/backend/modules/agent/` 提供统一 Agent 运行时（`runtime/` + `providers/` + `dvsagent/`），抽象 LLM Provider（Api/Cli/Codex/Copilot/DVSAgent），支持工具注册与上下文构建
4. **MCP 服务器集成**：`electron/backend/modules/mcp/` 内置 MCP（Model Context Protocol）服务器，支持 stdio 与 socket 双桥接，通过 `registerBuiltinTools()` 注册内置工具
5. **CLI 适配器层**：`electron/backend/modules/cli-adapters/` 统一封装 Claude/Codex/Copilot CLI（`base.mjs` + `manager.mjs` + 各 CLI 实现），替代旧 codex 模块
6. **Blender 集成**：`electron/backend/modules/blender/` 提供 Blender 工作空间管理与配置
7. **云端模板中心**：`electron/backend/modules/cloud-templates/` 提供模板中心服务（`adapters/` 含 local/steam 双适配器，通过 `adapters/factory.mjs` 分发）
8. **多模型 3D/视频生成**：Meshy / Tripo3D（3D 模型）、Seedance / Ark / Gemini（视频）多供应商并行支持
9. **Electron 本地资产数据库（核心层）**：`electron/localdb/`（better-sqlite3）统一管理项目、任务、对话、组件、工作流、API 密钥等本地数据（14 个仓库）
10. **`dweb://` 项目资产协议**：`dweb://project-assets` 自定义协议让渲染进程直接从磁盘读取项目静态资产，直接由 Electron 主进程处理
11. **Steam 平台集成**：`electron/platform/` 提供平台抽象层，支持 Steamworks 原生集成（好友列表、热键、Overlay、DLC 检测），通过 `src/platformBridge/` 桥接前端
12. **AI 对话集成**：直接在 Electron 主进程调用外部 AI API（DeepSeek、Gemini、字节跳动等，见 `chat/adapters/`），通过 IPC SSE 流式传输响应到前端
13. **Unreal Engine 集成**：`electron/static/unreal-plugin/` 提供 Unreal 插件源码（DwebWorkflowBridge），通过内置 HTTP 服务器实现双向通信

### 技术栈

#### 前端（`src/`）
- **框架**：Vue 3（Composition API + `<script setup lang="ts">`）
- **语言**：TypeScript
- **构建**：Vite
- **状态管理**：Vuex（`aiworkflow` / `timeline` / `videoscene` / `videostudio` / `theme` / `i18n`）
- **渲染引擎**：自研 WebGL2 引擎（`src/engine/webgl/`）
- **路由**：Vue Router 4（Electron 下使用 Hash History，Web 下使用 HTML5 History）
- **运行平台感知**：`src/network/runtimePlatform.ts`（Electron / Web / Unknown）
- **平台桥接层**：`src/platformBridge/`（Steam 等平台能力抽象，含 `usePlatform` / `useSteamEntry` composables）
- **IPC 客户端**：`src/network/ipcClient.ts`（统一封装 IPC 调用、流处理、错误处理）
- **Electron 桥接**：`src/electronBridge/index.ts`（封装 `window.dweb.*`，含 `common` / `window` / `projects` / `aiworkflow` / `db` / `projectAssets` / `videostudio` / `thirdParty` / `meshy` / `tripo3d` / `gemini` / `seedance` / `ark` / `comfyui` / `codex` / `agent` / `agentSkills` / `mcp` / `blender` / `cli` / `platform` / `cloudTemplates` 命名空间）
- **运行环境**：Node.js `>=16`（来自 `package.json#engines`）

#### 后端（`electron/backend/`）
- **运行环境**：Electron 主进程 Node.js（ESM 模块）
- **通信方式**：Electron IPC（`ipcMain.handle` / `ipcRenderer.invoke`），不再使用 HTTP 服务器
- **流式输出**：通过 IPC 流通道（`:data` / `:end` / `:error` 三通道模式）实现 SSE 风格流式传输
- **HTTP 客户端**：内置 `electron/backend/core/http-client.mjs` 用于调用外部 AI/三方 API（DeepSeek、Gemini、Meshy、Seedance、Ark、字节跳动等）
- **核心工具**：`electron/backend/core/`（errors、http-client、logger、sse-parser、stream）
- **功能模块**：`electron/backend/modules/`（按业务域划分的模块化后端，共 20 个模块）
  - `system/`：系统健康检查、迁移状态、诊断
  - `projects/`：项目 CRUD
  - `project-assets/`：项目资产管理
  - `chat/`：AI 对话服务（`adapters/` 含 base/bytedance/gemini/openai-compatible 多供应商适配器）
  - `comfyui/`：ComfyUI 桥接
  - `meshy/`：Meshy 3D 生成
  - `tripo3d/`：Tripo3D 3D 生成
  - `seedance/`：Seedance 视频生成
  - `ark/`：Ark 视频生成
  - `gemini/`：Gemini 视频生成
  - `third-party/`：三方 API 统一网关（nanobanana/seedream/gemini/jimeng/blueprint）
  - `editor/`：编辑器后端支持（组件库等）
  - `export/`：导出服务
  - `subtitle/`：字幕处理（通过 Python Bridge）
  - `agent-skills/`：Agent Skills（场景理解/灯光/布局/Unreal 导出，含 `unreal-editor-detector.mjs`）
  - `agent/`：**Agent 运行时**（`runtime/` AgentRuntime + ContextBuilder + ToolRegistry + ToolImageProcessor；`providers/` LLM Provider 抽象层 ApiLLMProvider/CliLLMProvider/CodexProvider/CopilotProvider/DVSAgentProvider；`dvsagent/` DVSAgentEnhancedProvider + LLMClient）
  - `mcp/`：**MCP 服务器**（`server/` DVStudioMCPServer + socketBridge + stdioBridge；`builtinTools.mjs` 内置工具注册；`toolExecutor.mjs` 工具执行器；`client.mjs` MCP 客户端）
  - `cli-adapters/`：**CLI 适配器层**（base.mjs 抽象基类 + manager.mjs 管理器 + claudeCli/codexCli/copilotCli 实现 + cliConfigStore 配置存储；替代旧 codex 模块）
  - `cloud-templates/`：**云端模板中心**（`adapters/` base/factory/local/steam 双适配器分发；types.mjs 类型定义）
  - `blender/`：**Blender 集成**（config.mjs 配置 + workspace.mjs 工作空间管理）
- **Python Bridge**（可选）：`electron/backend/python-bridge/` 用于需要 Python 的计算密集型任务（如字幕处理），非核心依赖
- **静态资产服务**：`electron/backend/projectStaticAssets/` 直接在主进程处理资产上传/导入/删除/解析

#### 桌面端（`electron/`）
- **框架**：Electron 33.x
- **本地数据库**：better-sqlite3（位于 `electron/localdb/`）
- **平台抽象层**：`electron/platform/`（Steam 等平台提供者抽象，含原生模块加载、事件泵、IPC 注册）
- **本地资产协议**：自定义协议 `dweb://project-assets`（在 `electron/main.mjs` 中以 `protocol.registerSchemesAsPrivileged` 注册，实现位于 `electron/backend/projectAssetProtocol.mjs`）
- **Python 引导安装**：`electron/static/bootstrap/`（macOS / Windows 平台的 Python 安装脚本，仅在需要 Python Bridge 功能时使用）
- **Unreal 插件源码**：`electron/static/unreal-plugin/`（DwebWorkflowBridge Unreal Engine 插件源码 + 打包 zip，用于 Unreal 双向通信集成）
- **Steam 原生模块**：`electron/platform/native/win32/`（`dweb_steamjs.node` + `steam_api64.dll`，Windows 平台 Steamworks 集成）
- **打包工具**：electron-builder（Windows → NSIS，macOS → DMG/ZIP）
- **进程通信**：IPC（`electron/preload.mjs` 通过 `contextBridge.exposeInMainWorld('dweb', ...)` 注入）
- **关键模块**：
  - `electron/localdb/`：本地数据库（db/migrations/repos/ipc，14 个仓库）
  - `electron/backend/`：Node.js IPC 后端（核心工具 + 20 个功能模块 + 静态资产 + Python Bridge）
  - `electron/platform/`：平台抽象层（Steam 提供者、事件、IPC、管理器）
  - `electron/config.mjs`：项目根目录、窗口图标路径解析
  - `electron/static/bootstrap/`：Python 引导安装脚本（可选）
  - `electron/static/unreal-plugin/`：Unreal 插件源码（可选）
- **资源目录**：应用运行时使用 `DVSResource/` 目录存储用户数据、设置、日志、后端数据，支持便携模式（安装在可写目录时数据保存在安装目录旁）

### 关键架构模块

#### 1. 前端 — Electron 运行平台三层
- `src/network/runtimePlatform.ts`：运行平台检测（Electron / Web / Unknown），单一事实来源
- `src/platformBridge/`：**平台能力桥接层**（Steam 等）
  - `platform.ts`：平台状态与提供者管理
  - `usePlatform.ts`：平台状态 composable
  - `useSteamEntry.ts`：Steam 入口引导 composable
  - `types.ts`：平台相关类型定义（PlatformId, DwebPlatformUser 等）
- `src/network/ipcClient.ts`：IPC 统一客户端
  - `hasIpcApi()` / `hasIpcModule()`：检测 IPC 模块可用性
  - `ipcCall<T>()`：调用 IPC 方法并自动解包结果
  - `ipcOrHttp()` / `ipcStreamOrHttp()`：迁移期兼容层（优先 IPC，失败回退 HTTP）
  - `unwrapIpcResult()`：统一解包 `{ ok, value, error }` 格式的 IPC 返回值
- `src/electronBridge/index.ts`：Electron IPC 桥接，按命名空间拆分（共 24 个命名空间）：
  - `common`：应用信息、后端状态、设置、诊断、窗口控制、引导安装
  - `window`：最小化/最大化/重载/开发者工具
  - `projects`：项目管理
  - `aiworkflow`：项目根注册、资产操作、资源管理器、图片标注
  - `db`：本地数据库直接访问（projects/meshy/video/tripo3d/apiKeys/templates 子命名空间）
  - `projectAssets`：项目资产
  - `videostudio`：视频工作室
  - `thirdParty`：三方 API 网关（nanobanana/seedream/gemini/jimeng/blueprint.chat 子命名空间）
  - `meshy`：Meshy 3D
  - `tripo3d`：Tripo3D 3D
  - `gemini`：Gemini 视频
  - `seedance`：Seedance 视频
  - `ark`：Ark 视频
  - `comfyui`：ComfyUI（runtime/workflows 子命名空间）
  - `codex`：Codex/Copilot CLI 集成
  - `agent`：Agent 运行时
  - `agentSkills`：Agent Skills（sceneUnderstand/sceneLighting/sceneLayout/unreal 子命名空间）
  - `mcp`：MCP 服务器集成
  - `blender`：Blender 集成
  - `cli`：CLI 适配器（统一 sendMessage 流式接口）
  - `platform`：平台能力（Steam 好友/热键/Overlay/DLC）
  - `cloudTemplates`：云端模板中心

#### 2. Electron 平台抽象层（`electron/platform/`）
- `manager.mjs`：平台管理器（discover / preflight / initialize / shutdown）
- `providers/`：平台提供者实现
  - `mock.mjs`：Mock 提供者（开发/测试用）
  - `steam.mjs`：Steam 平台提供者（封装原生模块调用）
- `native/`：平台原生模块
  - `win32/`：Windows 平台原生二进制（`dweb_steamjs.node` + `steam_api64.dll`）
- `config.mjs`：平台配置（原生模块路径解析）
- `events.mjs`：平台事件类型与事件泵
- `ipc.mjs`：平台 IPC 注册（向前端暴露平台状态/用户/好友/DLC/Overlay 等能力）
- `types.mjs`：平台相关类型定义
- **启动时序**：`platformPreflight()` → `platformInit()` → `registerPlatformIpc()` → `setMainWindowForPlatform()`

#### 3. Electron 本地资产与任务数据库（`electron/localdb/`）
- `db.mjs` / `index.mjs`：SQLite 实例管理 + 多路径回退初始化（`backendDataDir` → `userDataDir` → `tmpdir` → `homedir`）
- `migrations.mjs`：数据库结构迁移（基于 `PRAGMA user_version`，向前兼容）
- `json.mjs`：JSON 序列化辅助（ISO ↔ 毫秒、可选 JSON 字段）
- **仓库层（`repos/`，共 14 个仓库）**：
  - `projects.mjs`：项目仓库（CRUD、从文件夹打开、UUID、根路径）
  - `meshyTasks.mjs`：Meshy 3D 任务仓库
  - `videoTasks.mjs`：视频生成任务仓库
  - `tripo3dTasks.mjs`：Tripo3D 3D 任务仓库
  - `arkTasks.mjs`：Ark 视频任务仓库
  - `geminiTasks.mjs`：Gemini 视频任务仓库
  - `exportJobs.mjs`：导出任务仓库
  - `comfyuiJobs.mjs`：ComfyUI 任务仓库
  - `comfyuiWorkflows.mjs`：ComfyUI 工作流仓库
  - `editorComponents.mjs`：编辑器组件仓库
  - `chatConversations.mjs`：AI 对话会话仓库
  - `aiworkflowTemplates.mjs`：AI 工作流模板仓库
  - `refImageCache.mjs`：参考图缓存仓库
  - `apiKeys.mjs`：API 密钥仓库（AES-256-GCM + PBKDF2 本地对称加密，仅保存 fingerprint 明文）
- `ipc/ipcHost.mjs`：本地数据库 IPC 主机（前端 → 主进程数据访问通道，所有调用 `safe()` 包装）
- `ipc/djangoMigrate.mjs`：Django 迁移辅助（遗留迁移清理用）

#### 4. Node.js IPC 后端（`electron/backend/`）
- **入口**：`electron/backend/index.mjs`（`initBackend()` / `shutdownBackend()`）
- **路由**：`electron/backend/router.mjs`（`createRouter()` 统一注册 IPC 通道，自动错误包装、流处理支持）
- **上下文**：`electron/backend/context.mjs`（每个请求的上下文工厂，包含 mainWindow、deps、repos 等）
- **核心工具**（`electron/backend/core/`）：
  - `logger.mjs`：日志工具
  - `errors.mjs`：统一错误类型（UpstreamError、ValidationError、wrapError）
  - `http-client.mjs`：HTTP 客户端（支持普通请求 + SSE 流式请求，用于调用外部 API）
  - `sse-parser.mjs`：SSE 解析器
  - `stream.mjs`：IPC 流处理工具（创建三通道流处理器）
- **功能模块**（`electron/backend/modules/<name>/`）：每个模块遵循统一基础结构
  - `routes.mjs`：导出该模块的 IPC 路由列表（每个路由包含 `channel`、`handler`、可选 `stream: true`）
  - `handlers.mjs`：请求处理器实现
  - `service.mjs`：业务逻辑服务层（如需要）
  - **扩展子目录**（部分复杂模块使用）：
    - `agent/`：`runtime/`（AgentRuntime + ContextBuilder + ToolRegistry + ToolImageProcessor）+ `providers/`（LLM Provider 抽象层，实现 `ILLMProvider`）+ `dvsagent/`（DVSAgent 增强实现）
    - `chat/`：`adapters/`（base/bytedance/gemini/openai-compatible 多供应商对话适配器）
    - `mcp/`：`server/`（DVStudioMCPServer + socketBridge + stdioBridge 双桥接）
    - `cloud-templates/`：`adapters/`（base/factory/local/steam 双适配器分发）
    - `cli-adapters/`：扁平结构（base + manager + claudeCli/codexCli/copilotCli + cliConfigStore）
    - `blender/`：扁平结构（config + workspace + handlers/routes/service）
- **Python Bridge**（`electron/backend/python-bridge/`）：可选 Python 工作进程桥接
  - `index.mjs` / `runtime.mjs`：Python 进程管理
  - `rpc.mjs`：RPC 通信
  - `pip.mjs`：pip 包管理
  - `scripts/`：Python 侧脚本（worker 进程 + 字幕处理等）

#### 5. 项目资产协议（`electron/backend/projectAssetProtocol.mjs` + `projectStaticAssets/service.mjs`）
- 自定义 Electron 协议：`dweb://project-assets?projectId=<id>&path=<rel>&variant=<v>&maxSize=<n>&v=<versionTag>`
- 工作方式：渲染进程通过 `dweb://` URL 直接命中主进程协议处理器，从磁盘读取项目内的静态资产
- 路径安全：拒绝绝对路径、拒绝 `..` 路径穿越、强制解析后的相对路径在项目根目录内
- 配套服务（`projectStaticAssets/service.mjs`）：在主进程内直接提供 `upload/import/delete/resolve/repair/download/copy` 等资产管理函数

#### 6. 外部 AI API 集成（`electron/backend/modules/chat/` + `core/http-client.mjs`）
- AI 对话直接在 Electron 主进程中通过 HTTP 客户端调用外部 API（DeepSeek、Gemini 等）
- API 密钥存储在 LocalDB（`electron/localdb/repos/apiKeys.mjs`，加密存储）
- 通过 IPC 流式通道向前端推送 SSE 风格的响应块
- 支持多模型配置（用户可在设置中配置 API Key 和 Base URL）

#### 7. Unreal 导出 HTTP 服务器（`electron/backend/modules/agent-skills/service.mjs`）
- 内置独立 HTTP 服务器用于 Unreal Engine 集成（默认随机端口）
- 启动时自动启动，关闭时自动停止
- 用于 Unreal 插件与 DVStudio 的双向通信

### 前后端通信模型

- **Electron 主进程**（`electron/main.mjs`）
  - 注册 dweb 协议为 privileged scheme（`app.ready` 之前）
  - 执行平台预检（`platformPreflight()`，可能请求重启）
  - 配置便携模式路径（安装目录可写时使用 DVSResource/ 作为数据目录）
  - 初始化运行时日志与崩溃诊断
  - `app.whenReady()` 内：
    - 创建主窗口
    - 初始化 LocalDB（`initLocalDb`）
    - 初始化平台层（`platformInit()`）
    - 运行环境准备流程（`runSetupWorkflow()`：Python 检测 → 创建资源目录 → 初始化 Python Bridge → 初始化 Node.js IPC 后端 → 检测 ffmpeg）
    - 注册 dweb 协议处理器（`registerDwebProjectAssetProtocol`）
    - 注册 IPC 处理器（`registerLocalDbIpc`、`registerPlatformIpc`、`registerIpc`、`initBackend`）
    - 绑定主窗口到平台层（`setMainWindowForPlatform`）
    - 启动 Unreal HTTP 服务器
  - 退出时：平台关闭（`platformShutdown()`）、关闭 Python Bridge、关闭后端、关闭 LocalDB
- **前端渲染进程**（`src/`）
  - 通过 `window.dweb.*` 桥接调用本地数据库与本地资产管理（`src/electronBridge/index.ts`）
  - 通过 `window.dweb.platform.*` 调用平台能力（Steam 好友/热键/Overlay/DLC）
  - 通过 IPC 调用后端模块（chat/comfyui/meshy/tripo3d/seedance/ark/gemini/editor/agent/mcp/blender/cli 等）
  - 通过 IPC 流通道接收 AI 对话流式输出
  - 通过 `dweb://` 协议直接加载项目静态资产
  - 路由层（`src/router/index.ts`）：
    - `/welcome`：启动/环境检查页（`src/views/WelCome.vue`，注意命名拼写）
    - `/`：项目列表（`src/views/ProjectList.vue`）
    - `/workflow`：AI 工作流蓝图（`src/views/AIWorkflow.vue` → `src/views/AIWorkflow/AIWorkflowPage.vue`）
    - `/studio`：视频编辑器（`src/views/VideoStudio.vue`）
    - `/settings`：应用设置（`src/views/Settings.vue`）
    - `/image-markup-preview`：图片标注预览（`src/views/ImageMarkupPreviewPage.vue`）
    - `/resource-manager`：资源管理器窗口（`src/views/AIWorkflow/ResourceManagerWindow.vue`）
    - `/3d-editor`：3D 模型编辑器（`src/views/Model3DEditorPage.vue`）
    - `/template-center`：模板中心窗口（`src/views/AIWorkflow/TemplateCenterWindow.vue`）

## 🤖 Agent 行为准则

1. **先阅读，后修改**：在修改任何代码前，请先阅读相关模块的 `agent_docs/` 指引文档。
2. **遵守边界**：严格遵守前后端分离边界，前端代码在 `src/`（Vue/TS），后端代码在 `electron/backend/`（Node.js ESM），通过 IPC 通信。
3. **IPC 优先**：Electron 环境下所有后端调用应通过 IPC（`window.dweb.*`），不要在前端直接发起 HTTP 请求到 localhost（迁移期兼容代码除外）。
4. **保持一致性**：遵循现有的代码风格（Vue 3 的 `<script setup>` + TypeScript、后端 ESM 模块、ESLint/Prettier 规范）。
5. **模块结构规范**：新增后端功能时，在 `electron/backend/modules/` 下创建新模块目录，包含 `routes.mjs`、`handlers.mjs`、（可选）`service.mjs`，并在 `electron/backend/index.mjs` 中注册路由。
6. **统一返回格式**：所有 IPC handler 返回值必须遵循 `{ ok: true, value: ... }` 或 `{ ok: false, error: '...' }` 格式（router.mjs 会自动包装，但显式返回更清晰）。
7. **最小化修改**：只修改与当前任务直接相关的文件，避免过度重构。
8. **测试验证**：在提供代码后，尽可能给出验证修改是否正确的步骤或命令。
9. **运行平台感知**：修改涉及运行平台相关功能时，务必同时考虑 **Electron 环境** 与 **Web 浏览器环境** 两种模式（通过 `runtimePlatform.ts` 的 `isElectron()` 区分）。
10. **平台抽象感知**：修改涉及 Steam 等平台功能时，必须通过 `src/platformBridge/`（前端）和 `electron/platform/`（主进程）的抽象层，使用 Mock provider 做 Web 降级，不要直接耦合 Steam API。
11. **本地数据唯一事实来源**：LocalDB（`electron/localdb/`）是运行时唯一事实来源，不再有 Django SQLite 镜像。新增数据字段必须通过 LocalDB 迁移添加。
12. **桌面端可观测闭环**：当用户目标是「启动/打开 EXE/桌面应用」时，必须以主进程日志、窗口创建证据、崩溃堆栈为闭环，不要在缺少可见证据时断言「已启动/已修复」。
13. **Python Bridge 可选性**：Python Bridge 是可选组件，仅字幕等特定功能依赖。核心功能不应依赖 Python。新增核心功能优先使用 Node.js 实现。
14. **Django 已移除**：项目已完全移除 Django 依赖，不要添加新的 Django/Python HTTP 服务器代码。遗留的 Django 引用仅用于迁移清理。
15. **MCP 工具集成规范**：新增 MCP 工具应通过 `electron/backend/modules/mcp/builtinTools.mjs` 的 `registerBuiltinTools()` 注册，工具执行统一走 `toolExecutor.mjs`。MCP 服务器支持 stdio 与 socket 双桥接，新场景优先复用现有 bridge。
16. **Agent 运行时使用规范**：新增 LLM 接入应实现 `ILLMProvider` 接口（`electron/backend/modules/agent/providers/`），通过 `index.mjs` 工厂注册，不要在业务模块直接耦合具体 LLM API。Agent 工具通过 `runtime/ToolRegistry.mjs` 注册。
17. **CLI 适配器规范**：新功能优先使用 `electron/backend/modules/cli-adapters/` 的统一抽象（`base.mjs` + `manager.mjs`），不要直接调用 codex/copilot CLI。旧 `codex/` 模块已移除。
18. **测试规范**：新增功能应配套单元测试，放在 `tests/` 目录下（按 `unit/` + 业务域 + 模块组织），运行 `npm run test` 验证。

### 快速开发常用命令

```bash
# === 开发模式 ===
# 启动完整开发模式（Electron 桌面端 + Vite 前端 + Steam 原生模块）
npm run dev:electron
# Steam 开发环境（仅复制原生模块，不启动 Steam 调试）
npm run dev:electron:steam
# 纯前端开发（Web 模式，不启动 Electron，后端功能需要 mock）
npm run dev:web
# 空环境启动（模拟无配置/无资源环境，用于测试首次启动流程）
npm run dev:electron:empty
npm run dev:web:empty

# === 环境准备 ===
# 设置 Steam 开发环境（复制原生模块）
npm run setup:steam
# 重新编译 better-sqlite3 原生模块（Electron ABI 变化后）
npm run install:better-sqlite3
# 准备 Python 运行时（打包前，可选）
npm run prepare:python-runtime
# 配置 Steam（生成 steam.config.json）
npm run config:steam

# === 质量门禁 ===
# 类型检查（默认质量门禁）
npm run typecheck
# 严格类型检查
npm run typecheck:strict
# 单元测试
npm run test
# 测试覆盖率
npm run test:coverage
# 默认质量门禁（typecheck + test）
npm run quality
# 完整质量门禁（typecheck + lint + test）
npm run quality:full
# Lint 检查
npm run lint
# Lint 自动修复
npm run lint:fix
# 格式检查
npm run format:check

# === 打包与发布 ===
# 打包 Windows 安装程序
npm run dist:win
# 打包 macOS（生成 zip + dmg）
npm run dist:mac
# 打包 Steam 版 Windows 安装包
npm run dist:steam:win
# 上传 Steam 构建到 Steamworks
npm run upload:steam
# Steam 完整发布流程（构建 + 上传）
npm run release:steam
# Steam 正式上线（构建 + 上传 + set-live）
npm run release:steam:live

# === Unreal 插件 ===
# 打包 Unreal 插件
npm run pack:unreal-plugin

# === 资源生成 ===
# 生成 Windows 图标
npm run gen:win-icon
# 生成安装程序位图
npm run gen:installer-bitmaps
# 生成 Logo 资源
npm run gen:logo

# === 性能分析 ===
# Chrome 性能分析
npm run perf:analyze:chrome
# AI 工作流性能冒烟测试
npm run perf:aiwf:smoke
# 批量性能冒烟测试
npm run perf:aiwf:smoke:batch

# === Git Hooks ===
# 启用 Git hooks 保护
npm run git:protect-on
# 关闭 Git hooks 保护
npm run git:protect-off
```

> 完整命令清单见 `package.json#scripts`，共 50+ 个脚本。

### 关键工程文件位置速查

| 关注点 | 路径 |
| --- | --- |
| 前端入口 | `index.html` → `src/main.ts` → `src/App.vue` |
| 路由表 | `src/router/index.ts` |
| Vuex store 入口 | `src/store/index.ts` |
| Vuex store 模块 | `src/store/{aiworkflow,timeline,videoscene,videostudio,theme,i18n}/store.ts` |
| 运行平台检测 | `src/network/runtimePlatform.ts` |
| IPC 客户端 | `src/network/ipcClient.ts` |
| 平台桥接层（前端） | `src/platformBridge/`（platform / usePlatform / useSteamEntry / types） |
| Electron 桥接（前端封装） | `src/electronBridge/index.ts` |
| Preload 注入 | `electron/preload.mjs` |
| Electron 主进程 | `electron/main.mjs` |
| Node.js 后端入口 | `electron/backend/index.mjs` |
| 后端路由注册 | `electron/backend/router.mjs` |
| 后端核心工具 | `electron/backend/core/`（logger/errors/http-client/sse-parser/stream） |
| 后端功能模块 | `electron/backend/modules/*/`（20 个模块，routes.mjs/handlers.mjs/service.mjs + 扩展子目录） |
| Agent 运行时 | `electron/backend/modules/agent/`（runtime/ + providers/ + dvsagent/） |
| MCP 服务器 | `electron/backend/modules/mcp/`（server/ + builtinTools + toolExecutor + client） |
| CLI 适配器 | `electron/backend/modules/cli-adapters/`（base + manager + claudeCli/codexCli/copilotCli） |
| 云端模板中心 | `electron/backend/modules/cloud-templates/`（adapters/ + service + types） |
| Blender 集成 | `electron/backend/modules/blender/`（config + workspace + service） |
| 平台抽象层（主进程） | `electron/platform/`（manager / providers / config / events / ipc / types） |
| 平台原生模块 | `electron/platform/native/win32/`（dweb_steamjs.node / steam_api64.dll） |
| dweb:// 协议实现 | `electron/backend/projectAssetProtocol.mjs` |
| 项目静态资产服务 | `electron/backend/projectStaticAssets/{manifest,paths,service}.mjs` |
| 本地数据库 | `electron/localdb/{db,migrations,index,json}.mjs` + `electron/localdb/repos/*.mjs`（14 个仓库） |
| LocalDB IPC | `electron/localdb/ipc/ipcHost.mjs` |
| Python Bridge（可选） | `electron/backend/python-bridge/`（index/runtime/rpc/pip + scripts/） |
| Unreal 插件源码 | `electron/static/unreal-plugin/`（DwebWorkflowBridge 源码 + zip） |
| Python 引导安装 | `electron/static/bootstrap/`（mac/windows 安装脚本） |
| 单元测试 | `tests/`（unit/ + components/ + engine/ + scripts/，按业务域组织） |
| 3D 编辑器文档 | `agent_docs/08_3D_EDITOR_RENDERING_GUIDE.md` |
| 应用配置 | `electron/config.mjs` |
| 用户设置存储 | `DVSResource/UserSettings/settings.json` |
| 运行时日志 | `DVSResource/Logs/runtime.log`（便携模式）或 `userData/dweb-runtime.log` |

---
*注：本文件及 `agent_docs/` 目录专为 AI Agent 设计，旨在提供结构化的项目上下文。最后更新：2026-07-12（反映 Agent 运行时、MCP 服务器、CLI 适配器层、Blender、Tripo3D、Ark/Gemini、云端模板中心等模块新增；LocalDB 仓库扩展至 14 个；Electron 桥接命名空间扩展至 24 个；路由扩展至 9 个）*
