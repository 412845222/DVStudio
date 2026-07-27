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
- [13_CLOUD_MODULES_GUIDE.md](agent_docs/13_CLOUD_MODULES_GUIDE.md) — 🆕 云服务与扩展模块指引（CloudFS 云存储 / Steam Workshop 工坊模板 / ComfyUI 本地服务管理增强）

## 🎯 快速上下文

### 项目简介

**DVStudio (Dweb Video Studio)** 是一款面向视频创作的 AI 工作流桌面工具。应用完全基于 Electron 构建，**后端逻辑已全部收拢到 Electron 主进程**，通过 IPC（进程间通信）与渲染进程交互，不再依赖外部 Django 子进程或 HTTP 服务器。核心由 AI 工作流蓝图、视频编辑器、3D 模型编辑器（Three.js）、Agent 运行时、MCP 服务器、本地资产数据库（LocalDB + `dweb://` 协议）、Steam 平台集成、CLI 适配器层、云端模板中心、Steam 工坊模板、云存储文件系统（CloudFS）、AI 对话辅助、ComfyUI 集成管理、服务中心等组成，Python 仅作为可选 Bridge 用于特定计算密集型任务（如字幕处理）。

### 核心功能

1. **AI 工作流蓝图**：节点式编排（资源 → 剧情/分支 → ComfyUI / Meshy / Tripo3D / Seedance / Ark / Gemini 视频生成 → 输出媒体），单项目以「本地磁盘文件夹 + Electron LocalDB」共同存储
2. **视频编辑器**：舞台节点（矩形/文字/图片/线条/视频）+ 时间轴关键帧（含音频波形、缓动曲线编辑）+ AI 对话辅助 + 组件库面板 + 字幕编辑器
3. **3D 模型编辑器**：基于 Three.js 的 3D 模型预览与编辑（`src/composables/useEnhancedModel3DEditor.ts`、`three`、`three-bvh-csg`），支持模型导入、CSG 布尔运算、灯光调整
4. **Agent 运行时**：`electron/backend/modules/agent/` 提供统一 Agent 运行时（`runtime/` + `providers/` + `dvsagent/`），抽象 LLM Provider（Api/Cli/Codex/Copilot/DVSAgent），支持工具注册与上下文构建
5. **MCP 服务器集成**：`electron/backend/modules/mcp/` 内置 MCP（Model Context Protocol）服务器，支持 stdio 与 socket 双桥接，通过 `registerBuiltinTools()` 注册内置工具
6. **CLI 适配器层**：`electron/backend/modules/cli-adapters/` 统一封装 Claude/Codex/Copilot CLI（`base.mjs` + `manager.mjs` + 各 CLI 实现），替代旧 codex 模块
7. **Blender 集成**：`electron/backend/modules/blender/` 提供 Blender 工作空间管理与 MCP 连接，支持模型导入、脚本执行、工作空间管理
8. **云端模板中心**：`electron/backend/modules/cloud-templates/` 提供模板中心服务（`adapters/` 含 local/steam 双适配器，通过 `adapters/factory.mjs` 分发）
9. **Steam 工坊模板**：`electron/backend/modules/workshop-templates/` 提供 Steam Workshop 集成（`adapters/` 含 base/factory/mock/steam 适配器），支持模板查询、下载、进度跟踪、安装管理
10. **云存储文件系统（CloudFS）**：`electron/backend/modules/cloudfs/` 统一云存储抽象层（`providers/` 含 aliyun-oss/volcengine-tos/custom-http 多适配器），支持 Bucket 管理、文件上传下载、ACL 修复、公共 URL 生成
11. **ComfyUI 集成管理**：`electron/backend/modules/comfyui/` 提供 ComfyUI 本地服务管理（安装、环境检测、模型路径配置、服务启动/停止、日志查看、镜像源管理、Python 虚拟环境管理）
12. **多模型 3D/视频/图片生成**：Meshy / Tripo3D（3D 模型）、Seedance / Ark / Gemini（视频）、nanobanana / seedream / jimeng（图片）多供应商并行支持
13. **Electron 本地资产数据库（核心层）**：`electron/localdb/`（better-sqlite3）统一管理项目、任务、对话、组件、工作流、API 密钥、云存储配置等本地数据（15 个仓库）
14. **`dweb://` 项目资产协议**：`dweb://project-assets` 自定义协议让渲染进程直接从磁盘读取项目静态资产，直接由 Electron 主进程处理
15. **Steam 平台集成**：`electron/platform/` 提供平台抽象层，支持 Steamworks 原生集成（好友列表、热键、Overlay、DLC 检测），通过 `src/platformBridge/` 桥接前端
16. **AI 对话集成**：直接在 Electron 主进程调用外部 AI API（DeepSeek、Gemini、字节跳动、OpenAI 兼容接口等，见 `chat/adapters/`），通过 IPC SSE 流式传输响应到前端
17. **服务中心**：统一的后端服务管理界面（ComfyUI、MCP 服务器等状态监控与管理）
18. **Unreal Engine 集成**：`electron/static/unreal-plugin/` 提供 Unreal 插件源码（DwebWorkflowBridge），通过内置 HTTP 服务器实现双向通信

### 技术栈

#### 前端（`src/`）
- **框架**：Vue 3（Composition API + `<script setup lang="ts">`）
- **语言**：TypeScript
- **构建**：Vite
- **状态管理**：Vuex（`aiworkflow` / `timeline` / `videoscene` / `videostudio` / `theme` / `i18n`）。⚠️ **AI工作流蓝图（`aiworkflow`模块）已迁移到图形底座+蓝图业务层新架构**：Vuex仅管理页面级UI状态和引擎状态的只读投影，蓝图绘制状态（节点位置/尺寸/连线）由引擎内部管理，禁止Vuex反向驱动引擎重建（详见[06_AI_WORKFLOW_GUIDE.md](agent_docs/06_AI_WORKFLOW_GUIDE.md)架构红线章节）
- **2D 图形引擎（蓝图）**：自研图形底座（GraphBase，`src/engine/graphbase/`）+ 蓝图业务层（Blueprint，`src/engine/blueprint/`）双层架构。图形底座提供通用2D渲染/交互/场景图能力；蓝图业务层提供节点/连线/命令栈等工作流特定功能。Canvas渲染+DOM覆盖层混合模式。
- **2D 渲染引擎（旧/视频编辑器）**：自研 WebGL2 引擎（`src/engine/webgl/`）
- **3D 渲染引擎**：Three.js（`three` + `three-bvh-csg`，用于 3D 模型编辑器）
- **路由**：Vue Router 4（Electron 下使用 Hash History，Web 下使用 HTML5 History，共 13 个路由）
- **运行平台感知**：`src/electronBridge/index.ts` 中 `isElectron()`（Electron / Web / Unknown）
- **平台桥接层**：`src/platformBridge/`（Steam 等平台能力抽象，含 `usePlatform` / `useSteamEntry` composables）
- **Electron 桥接**：`electron/preload.mjs` 通过 `contextBridge.exposeInMainWorld('dweb', ...)` 注入，含 `common` / `window` / `projects` / `aiworkflow` / `videostudio` / `thirdParty` / `meshy` / `tripo3d` / `gemini` / `seedance` / `ark` / `comfyui` / `codex` / `agent` / `agentSkills` / `mcp` / `blender` / `cli` / `platform` / `cloudTemplates` / `workshopTemplates` / `cloudfs` 共 22 个命名空间
- **HTML 渲染**：html2canvas（用于导出等场景）
- **运行环境**：Node.js `>=16`（来自 `package.json#engines`）

#### 后端（`electron/backend/`）
- **运行环境**：Electron 主进程 Node.js（ESM 模块）
- **通信方式**：Electron IPC（`ipcMain.handle` / `ipcRenderer.invoke`），不再使用 HTTP 服务器
- **流式输出**：通过 IPC 流通道（`:data` / `:end` / `:error` 三通道模式）实现 SSE 风格流式传输
- **HTTP 客户端**：内置 `electron/backend/core/http-client.mjs` 用于调用外部 AI/三方 API（DeepSeek、Gemini、Meshy、Seedance、Ark、字节跳动等）
- **核心工具**：`electron/backend/core/`（errors、http-client、logger、resourcePaths、sse-parser、stream）
- **功能模块**：`electron/backend/modules/`（按业务域划分的模块化后端，共 22 个模块）
  - `system/`：系统健康检查、迁移状态、诊断、更新检查、Steam 版本检测
  - `projects/`：项目 CRUD、从文件夹打开项目
  - `project-assets/`：项目资产管理
  - `chat/`：AI 对话服务（`adapters/` 含 base/bytedance/gemini/openai-compatible 多供应商适配器）
  - `comfyui/`：ComfyUI 本地服务管理（安装/环境检测/模型路径/服务启停/日志/镜像源/Python venv 管理，含 `setup-service.mjs`、`log-line-parser.mjs`）
  - `meshy/`：Meshy 3D 生成
  - `tripo3d/`：Tripo3D 3D 生成 + 文生图/图生图/多视图生成
  - `seedance/`：Seedance 视频生成
  - `ark/`：Ark 视频生成任务管理
  - `gemini/`：Gemini 视频/图片生成
  - `third-party/`：三方 API 统一网关（nanobanana/seedream/gemini/jimeng/blueprint）
  - `editor/`：编辑器后端支持（组件库等）
  - `export/`：导出服务
  - `subtitle/`：字幕处理（通过 Python Bridge）
  - `agent-skills/`：Agent Skills（场景理解/灯光/布局/Unreal 导出，含 `unreal-editor-detector.mjs`、内置 Unreal HTTP 服务器）
  - `agent/`：**Agent 运行时**（`runtime/` AgentRuntime + ContextBuilder + ToolRegistry + ToolImageProcessor；`providers/` LLM Provider 抽象层 ApiLLMProvider/CliLLMProvider/CodexProvider/CopilotProvider/DVSAgentProvider + toolOutputParser；`dvsagent/` DVSAgentEnhancedProvider + LLMClient）
  - `mcp/`：**MCP 服务器**（`server/` DVStudioMCPServer + socketBridge + stdioBridge；`builtinTools.mjs` 内置工具注册；`toolExecutor.mjs` 工具执行器；`client.mjs` MCP 客户端；`handlers.mjs` IPC 处理器）
  - `cli-adapters/`：**CLI 适配器层**（base.mjs 抽象基类 + manager.mjs 管理器 + claudeCli/codexCli/copilotCli 实现 + cliConfigStore 配置存储 + handlers.mjs IPC 处理器；替代旧 codex 模块）
  - `cloud-templates/`：**云端模板中心**（`adapters/` base/factory/local/steam 双适配器分发；types.mjs 类型定义）
  - `workshop-templates/`：**Steam 工坊模板**（`adapters/` base/factory/mock/steam 适配器；支持工坊模板查询、下载、进度跟踪、安装信息获取）
  - `blender/`：**Blender 集成**（config.mjs 配置 + workspace.mjs 工作空间管理 + MCP 连接与工具调用）
  - `cloudfs/`：**云存储文件系统**（`registry.mjs` 提供商注册；`providers/` 含 aliyun-oss 阿里云 OSS / volcengine-tos 火山引擎 TOS / custom-http 自定义 HTTP 三类适配器；`base/utils.mjs` 通用工具；支持 Bucket 管理、文件上传下载、ACL 修复、公共 URL 生成）
- **云存储 SDK**：`@volcengine/tos-sdk`（火山引擎 TOS）、`ali-oss`（阿里云 OSS）
- **Python Bridge**（可选）：`electron/backend/python-bridge/` 用于需要 Python 的计算密集型任务（如字幕处理），非核心依赖
- **静态资产服务**：`electron/backend/projectStaticAssets/` 直接在主进程处理资产上传/导入/删除/解析
- **视频缩略图**：`electron/backend/videoThumbnails.mjs` 视频缩略图生成
- **运行时清理**：`electron/backend/runtimeCleanup.mjs` 运行时资源清理

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
  - `electron/localdb/`：本地数据库（db/migrations/repos/ipc，15 个仓库）
  - `electron/backend/`：Node.js IPC 后端（核心工具 + 22 个功能模块 + 静态资产 + Python Bridge）
  - `electron/platform/`：平台抽象层（Steam 提供者、事件、IPC、管理器）
  - `electron/config.mjs`：项目根目录、窗口图标路径解析
  - `electron/logo.config.mjs`：Logo 资源配置
  - `electron/static/bootstrap/`：Python 引导安装脚本（可选）
  - `electron/static/unreal-plugin/`：Unreal 插件源码（可选）
  - `electron/diagnostics.mjs`：诊断工具
- **资源目录**：应用运行时使用 `DVSResource/` 目录存储用户数据、设置、日志、后端数据，支持便携模式（安装在可写目录时数据保存在安装目录旁）

### 关键架构模块

#### 1. 前端 — Electron 运行平台三层
- `src/network/runtimePlatform.ts`：运行平台检测（`getRuntimePlatform()` / `isElectron()` / `isWeb()`，Electron / Web / Unknown），单一事实来源
- `src/electronBridge/index.ts`：封装所有 `window.dweb.*` IPC 调用，同时提供 `isElectron()` 便捷函数
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
- `electron/preload.mjs`：Electron IPC 桥接注入入口，通过 `contextBridge.exposeInMainWorld('dweb', ...)` 按命名空间拆分（共 22 个顶层命名空间）：
  - `common`：应用信息、后端状态、设置、诊断、窗口控制、引导安装、后端日志
  - `window`：最小化/最大化/重载/开发者工具/关闭、3D编辑器/视频编辑器/ComfyUI设置窗口打开
  - `projects`：项目管理（列表/保存/加载/删除/从文件夹打开）
  - `aiworkflow`：项目根注册、资产操作（上传/导入/删除/修复/诊断）、资源管理器、图片标注、模板中心、项目缓存管理、db 子命名空间（projects/meshy/video/tripo3d/apiKeys/templates）
  - `videostudio`：视频工作室（导出目录选择、胶片条生成）
  - `thirdParty`：三方 API 网关（nanobanana/seedream/gemini/jimeng/blueprint 子命名空间，支持图片/视频生成）
  - `meshy`：Meshy 3D（健康检查/生成/任务查询/停止/删除/余额）
  - `tripo3d`：Tripo3D 3D（健康检查/3D生成/文生图/图生图/多视图/任务查询/文件上传/余额）
  - `gemini`：Gemini 图片生成（健康检查/任务查询/取消/删除/图片路径）
  - `seedance`：Seedance 视频（健康检查/生成/列表/同步/远程任务/资产下载）
  - `ark`：Ark 视频任务管理（列表/详情/删除/记录）
  - `comfyui`：ComfyUI（runtime 子命名空间：ping/objectInfo/workflows/run/outputs/cancel/job；setup 子命名空间：安装/环境检测/模型路径/服务启停/日志/镜像源/Python venv 管理）
  - `codex`：Codex 编程助手（健康检查/会话管理/消息发送/审批提交/流式响应/取消）
  - `agent`：Agent 运行时（流式对话/上下文获取/中止/会话管理/消息添加）
  - `agentSkills`：Agent Skills（sceneUnderstand/sceneLighting/sceneLayout/unreal 子命名空间）
  - `mcp`：MCP 服务器集成（连接/断开/工具列表/工具调用/内置工具注册/工具调用回调）
  - `blender`：Blender 集成（状态检查/MCP连接/工具调用/模型导入/工作空间管理/脚本/截图）
  - `cli`：CLI 适配器（可用性检查/适配器列表/会话管理/流式消息/模型列表/配置/认证/修复）
  - `platform`：平台能力（状态/用户/Overlay/DLC/事件监听）
  - `cloudTemplates`：云端模板中心（平台/配额/列表/上传/下载/删除）
  - `workshopTemplates`：Steam 工坊模板（平台/查询/下载/进度/安装信息）
  - `cloudfs`：云存储文件系统（提供商列表/配置管理/凭据验证/Bucket管理/文件上传下载/公共URL/ACL修复）

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
- **仓库层（`repos/`，共 15 个仓库）**：
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
  - `cloudStorageConfig.mjs`：云存储配置仓库（CloudFS 提供商配置、Bucket 配置、活跃提供商选择）
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
    - `agent/`：`runtime/`（AgentRuntime + ContextBuilder + ToolRegistry + ToolImageProcessor）+ `providers/`（LLM Provider 抽象层，实现 `ILLMProvider`，含 toolOutputParser）+ `dvsagent/`（DVSAgent 增强实现 + LLMClient）
    - `chat/`：`adapters/`（base/bytedance/gemini/openai-compatible 多供应商对话适配器）
    - `mcp/`：`server/`（DVStudioMCPServer + socketBridge + stdioBridge 双桥接）
    - `cloud-templates/`：`adapters/`（base/factory/local/steam 双适配器分发）
    - `workshop-templates/`：`adapters/`（base/factory/mock/steam Steam 工坊适配器分发）
    - `cloudfs/`：`base/`（utils 通用工具）+ `providers/`（aliyun-oss/volcengine-tos/custom-http 多云存储适配器）+ registry.mjs（提供商注册中心）
    - `cli-adapters/`：扁平结构（base + manager + claudeCli/codexCli/copilotCli + cliConfigStore + handlers）
    - `comfyui/`：扁平结构（setup-service + log-line-parser + handlers/routes/service）
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

---

## 🔵 AI 工作流蓝图引擎架构详解

> ⚠️ 这是当前分支（`feat-continue-graphics-blueprint`）完成的核心架构重构。任何涉及蓝图编辑器的开发**必须**仔细阅读本节。违反架构规则会导致双轨/三轨数据不同步bug（拖拽瞬移、位置回退、DOM层拦截、undo失效等），架构合规测试会拦截此类违规代码。

### 一、双层引擎架构：图形底座 + 蓝图业务层

蓝图编辑器采用**双层引擎架构**，严格分离通用能力与业务逻辑：

```
┌───────────────────────────────────────────────────────────────┐
│  AIWorkflowPage.vue (Host 桥接层)                              │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Vuex Store (src/store/modules/workflow/)               │  │
│  │  ─ 页面级UI状态（对话框/面板/任务进度/选中高亮）          │  │
│  │  ─ 引擎状态的只读投影（hydrateDraft单向写入）             │  │
│  └─────────────────────────────────────────────────────────┘  │
│        ▲ 单向数据流（engine → store via emitChange）            │
│        │ 禁止反向全量同步                                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  BlueprintEditor.vue 组件 (src/engine/blueprint/)       │  │
│  │  ┌───────────────────────────────────────────────────┐  │  │
│  │  │  蓝图业务层 (Blueprint Layer)                     │  │  │
│  │  │  ─ BlueprintScene (场景/Command/undo/增量同步)    │  │  │
│  │  │  ─ BlueprintNode (节点位置/尺寸/端口/data同步)     │  │  │
│  │  │  ─ BlueprintEditorTool (交互/拖拽/连线/右键菜单)  │  │  │
│  │  │  ─ BlueprintDomOverlay (DOM层覆盖渲染)            │  │  │
│  │  │  ─ Connection/Port (连线与端口)                   │  │  │
│  │  │  ─ commands/ (业务Command集合)                    │  │  │
│  │  └───────────────────────────────────────────────────┘  │  │
│  │        ▲ 继承/组合                                        │  │
│  │  ┌───────────────────────────────────────────────────┐  │  │
│  │  │  图形底座 (GraphBase Layer)                       │  │  │
│  │  │  ─ Scene (场景图基类/CommandStack/键盘处理)       │  │  │
│  │  │  ─ GraphObject (对象基类/Transform/脏标记)        │  │  │
│  │  │  ─ Canvas2DRenderer (Canvas渲染器/Camera)         │  │  │
│  │  │  ─ InputManager (事件系统/命中检测)               │  │  │
│  │  │  ─ SelectionManager/DragManager (基础交互)        │  │  │
│  │  │  ─ commands/ (Command基类/CompositeCommand)       │  │  │
│  │  └───────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

**各层职责详解：**

| 层级 | 目录 | 职责 | 不知道什么 |
|------|------|------|-----------|
| **图形底座 (graphbase/)** | `src/engine/graphbase/` | 通用2D场景图能力：对象树、变换(Transform)、渲染、事件、选择、拖拽、Command栈、undo/redo基础、键盘快捷键 | 不知道"蓝图"、"节点"、"端口"、"连线"等业务概念，只处理GraphObject抽象基类 |
| **蓝图业务层 (blueprint/)** | `src/engine/blueprint/` | 工作流特定逻辑：BlueprintNode（含data.worldX/Y/width/height/inputs/outputs/status等业务字段）、连线创建与端口兼容检查、DOM节点覆盖渲染、增量loadBlueprint、节点/连线/缩放等业务Command、右键菜单 | 不关心底层Canvas如何绘制，不直接操作transform.position（通过setPosition/setSize API） |
| **Host桥接层** | `src/views/AIWorkflow/AIWorkflowPage.vue` | Vue组件宿主：引擎实例化、Vuex状态桥接、IPC通信、Inspector面板参数绑定、对话框管理、右键菜单业务处理 | 不直接修改引擎内部状态，通过engineApi调用引擎方法 |
| **Vuex Store** | `src/store/modules/workflow/` | 页面级UI状态管理（对话框开关、面板可见性、任务进度、选中高亮、搜索过滤等）+ 引擎状态的只读投影（通过hydrateDraft单向写入） | 不包含蓝图绘制状态的权威数据，不直接触发引擎状态变更（初始加载和显式业务流程除外） |

**关键文件索引：**

| 文件 | 职责 |
|------|------|
| [src/engine/graphbase/scene/Scene.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/engine/graphbase/scene/Scene.ts) | 场景图基类，管理GraphObject树、Camera、CommandStack、InputManager、键盘快捷键(Ctrl+Z/Y)、undo/redo入口 |
| [src/engine/graphbase/scene/GraphObject.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/engine/graphbase/scene/GraphObject.ts) | 对象基类，提供transform、setPosition/setSize/translate等公共API和脏标记机制 |
| [src/engine/graphbase/renderer/Canvas2DRenderer.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/engine/graphbase/renderer/Canvas2DRenderer.ts) | Canvas 2D渲染器，管理Camera、requestRedraw、视口变换 |
| [src/engine/graphbase/input/InputManager.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/engine/graphbase/input/InputManager.ts) | 统一输入系统，Pointer/Mouse/Wheel事件分发、命中检测、拖拽状态机 |
| [src/engine/graphbase/commands/Command.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/engine/graphbase/commands/Command.ts) | Command基类（execute/undo/redo），CommandStack管理undo/redo历史 |
| [src/engine/blueprint/BlueprintScene.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/engine/blueprint/BlueprintScene.ts) | 蓝图场景，继承Scene，实现节点创建/删除/连线/serializeLegacy/loadBlueprint（增量）/syncLoadSignature、after-command事件触发emitChange |
| [src/engine/blueprint/BlueprintNode.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/engine/blueprint/BlueprintNode.ts) | 蓝图节点，继承GraphObject，重写setPosition/setSize同步data.worldX/Y/width/height，管理inputs/outputs端口、status状态 |
| [src/engine/blueprint/BlueprintEditorTool.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/engine/blueprint/BlueprintEditorTool.ts) | 蓝图编辑器交互工具，处理节点拖拽/连线拖拽/框选/右键菜单/DOM模式切换、port兼容检查、自动对齐等核心交互逻辑 |
| [src/engine/blueprint/BlueprintEditor.vue](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/engine/blueprint/BlueprintEditor.vue) | Vue组件封装，实例化Scene/Renderer/Tool/DomOverlay，暴露engineApi给Host，监听引擎事件（change/selectionChange/viewport-change）转发给Host |
| [src/engine/blueprint/dom/BlueprintDomOverlay.vue](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/engine/blueprint/dom/BlueprintDomOverlay.vue) | DOM覆盖层，在Canvas上层渲染可交互的节点Vue组件（图片/视频/3D/文本/AI对话节点） |
| [src/engine/blueprint/commands/](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/engine/blueprint/commands) | 业务Command集合：MoveNodeCommand/ResizeNodeCommand/ConnectPortsCommand/DeleteSelectionCommand/PasteCommand/DuplicateCommand/AddNodeCommand/CopySelectionCommand/UpdateNodeTextCommand/CompositeCommand |
| [src/views/AIWorkflow/blueprint-bridge/workflowStateAdapter.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/views/AIWorkflow/blueprint-bridge/workflowStateAdapter.ts) | 状态适配器：workflowStateToLegacyBlueprint（Vuex WorkflowState → LegacyBlueprintData，含缓存和坐标同步）、legacyBlueprintToWorkflowState（反向转换，用于加载） |
| [src/views/AIWorkflow/bridge/component-events/useAIWorkflowKeyboardAndResize.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/views/AIWorkflow/bridge/component-events/useAIWorkflowKeyboardAndResize.ts) | 业务层键盘事件处理（捕获Ctrl+C/V/A/Delete/Backspace等，转发到engineApi；Ctrl+C加stopImmediatePropagation防止双重复制） |

### 二、SSOT 单向数据流（Single Source of Truth）

这是新架构的**核心原则**：引擎内部是蓝图绘制状态的唯一权威数据源（SSOT），数据流严格单向。

```
用户交互（鼠标/键盘/面板操作）
    ↓
BlueprintEditorTool/业务层处理
    ↓
创建 Command 对象（MoveNode/ResizeNode/Delete/Connect 等）
    ↓
scene.executeCommand(cmd)
    ↓
Command.execute() 执行操作（调用 node.setPosition/node.setSize 等 API）
    ↓
CommandStack 压入栈，触发 scene 'after-command' 事件
    ↓
BlueprintEditor.vue 监听到 after-command → emitChange()（防抖0ms，零延迟）
    ↓  ⚠️ emitChange 有守卫：isEngineDragging || isDomInteractionLocked 时不触发
Host (AIWorkflowPage.vue) onBlueprintEditorChange
    ↓
isUpdatingFromStore = true（防反馈环标志）
    ↓
store.commit('workflow/hydrateDraft', legacyData)  // 全量序列化后写入Vuex只读投影
    ↓
nextTick 微任务中重置 isUpdatingFromStore = false
    ↓
Vuex 触发各面板/组件更新（Inspector/缩略图/大纲等）
```

**独立同步路径（不触发全量serialize）：**

- **选择变化**：`selection` 对象触发 `select/deselect` 事件 → `selectionChange` 事件 → Host `onBlueprintEditorSelectionChange` → 仅commit `setSelectedNodeIds`，不触发hydrateDraft
- **视口变化**：`camera` 对象触发 `change` 事件 → `viewport-change` 事件 → Host `onBlueprintEditorViewportChange` → 仅commit `setViewport`
- **节点状态变化**：非位置/尺寸/连线的data变化（如status运行状态）通过 `setNodeStatus` 直接设置 → requestRedraw，不触发emitChange（运行状态由业务层单独管理）

**关键防反馈环机制：**

1. **isUpdatingFromStore 标志**：Host在commit到Vuex前设置true，commit后nextTick重置false。watch blueprint数据变化时若isUpdatingFromStore为true则跳过，防止"引擎→Vuex→引擎"的死循环。
2. **syncLoadSignature()**：每次executeCommand/undo/redo成功后，BlueprintScene计算当前节点/连线状态的signature存入`_lastLoadSignature`。当Vuex状态变化触发`loadBlueprint`时（如父组件序列化回传），先计算signature比较，相同则跳过增量更新，避免覆盖undo效果。
3. **交互锁**：
   - `isEngineDragging`：Canvas层拖拽节点/连线期间为true，阻止emitChange，避免拖拽中间状态被序列化覆盖最终位置
   - `isDomInteractionLocked`：DOM层拖拽/resize/连线期间为true，阻止Canvas层干扰并阻止emitChange
   - **顺序规则**：DOM/Canvas交互结束时，**必须先释放锁再executeCommand**，否则after-command触发的emitChange会被锁拦截导致状态不同步

### 三、engineApi 完整参考

Host通过`editorRef.value`调用`defineExpose`暴露的engineApi。**所有业务操作必须通过engineApi进行，禁止直接操作Vuex蓝图状态或直接访问引擎内部对象。**

| API | 走Command? | 说明 | 注意事项 |
|-----|-----------|------|---------|
| `addNode(type, x, y, title?, additionalData?)` | ✅ | 添加节点并自动选中 | 端口定义从getDefaultNodeData获取 |
| `connectPorts(fromNodeId, fromAnchorId, toNodeId, toAnchorId)` | ✅ | 连接两个端口 | anchorId必须使用`port.spec.id`（业务ID），不能用`port.id`（运行时ID） |
| `deleteSelection()` | ✅ | 删除当前选中节点/连线 | 同时触发资源清理（业务层在selectionChange时处理） |
| `copySelection()` | — | 复制选中节点到引擎内部剪贴板 | 业务层Ctrl+C需先stopImmediatePropagation再调用，防止双重复制 |
| `paste()` | ✅ | 在当前鼠标位置粘贴 | 使用内部跟踪的lastMouseWorldPos |
| `pasteAt(worldX, worldY)` | ✅ | 在指定位置粘贴 | 返回新节点ID数组 |
| `duplicate()` | ✅ | 原地复制选中节点（偏移30,30） | 内部实现为copy+paste |
| `createNodeWithConnection(params)` | ✅* | 创建节点并自动连接到指定端口 | fromAnchorId同样用spec.id |
| `undo()` | ✅ | 撤销上一操作 | 由引擎InputManager统一处理Ctrl+Z，业务层不得拦截 |
| `redo()` | ✅ | 重做下一操作 | Ctrl+Y/Shift+Z由引擎处理 |
| `canUndo()` | — | 查询是否可撤销 | 用于按钮状态 |
| `canRedo()` | — | 查询是否可重做 | 用于按钮状态 |
| `selectAll()` | — | 全选节点 | 触发selectionChange，不触发emitChange |
| `clearSelection()` | — | 清除选择 | 触发selectionChange |
| `setSelection(nodeIds)` | — | 设置选中节点 | 触发selectionChange |
| `getSelectedNodeIds()` | — | 获取当前选中节点ID数组 | 业务层获取选中状态**必须**使用此API，不能依赖Vuex.selectedNodeIds |
| `updateNodeData(nodeId, patch)` | ❌ | 更新节点data字段（合并patch） | ⚠️ 当前不走Command（暂不支持undo），inputs/outputs变化时自动更新连线端点 |
| `moveNode(nodeId, x, y)` | ✅ | 以Command方式移动单个节点 | 可撤销 |
| `moveNodesByDelta(nodeIds, dx, dy)` | ✅ | 以Command方式批量偏移节点 | 用于键盘方向键移动 |
| `setNodePosition(nodeId, worldX, worldY)` | ❌ | 直接设置节点位置（不走Command） | 仅用于初始化/程序化放置，不走undo |
| `setNodeSize(nodeId, width?, height?)` | ❌ | 直接设置节点尺寸（不走Command） | 仅用于resize完成后 |
| `removeNode(nodeId)` | ✅ | 删除单个节点 | 走DeleteSelectionCommand |
| `removeEdge(edgeId)` | ✅ | 删除单条连线 | 走DeleteSelectionCommand |
| `focusNode(nodeId)` | — | 聚焦并居中显示节点 | 调整viewport |
| `setEngineViewport(zoom, panX, panY)` | ❌ | 直接设置视口（不走Command） | Minimap操作直接调用此API绕过Vuex避免反馈环 |
| `setViewport(zoom, panX, panY, animate?)` | — | 设置视口（带动画选项） | Host桥接层使用 |
| `fitToView()` | — | 适配全部节点到视口 | |
| `resetView()` | — | 重置视口到默认（zoom=1, pan=0,0） | |
| `loadBlueprint(data)` | ❌ | 加载蓝图数据（增量模式） | **增量更新**：不dispose已有节点、不调用commands.clear()（保留undo栈），有signature去重 |
| `saveBlueprint()` | — | 序列化为LegacyBlueprintData格式 | 内部调用scene.serializeLegacy() |
| `clear()` | ❌ | 清空蓝图 | ⚠️ 重置lastStructureHash，会清空undo栈 |
| `getZoom()` | — | 获取当前缩放比例 | |
| `screenToWorld(clientX, clientY)` | — | 屏幕坐标转世界坐标 | |
| `getNodeScreenRect(nodeId)` | — | 获取节点在屏幕上的矩形 | 用于滚动定位、Minimap绘制 |
| `getScene()` | — | 获取BlueprintScene实例 | ⚠️ 高级用法，一般业务代码不应直接调用 |
| `getNode(nodeId)` | — | 获取BlueprintNode实例 | ⚠️ 高级用法，读取可以，但修改必须通过engineApi |
| `getNodeCount()` | — | 获取节点数量 | |
| `getEdgeCount()` | — | 获取连线数量 | |
| `setNodeStatus(nodeId, status)` | ❌ | 设置节点运行状态（pending/running/success/error等） | 不走Command，不触发emitChange |
| `saveSelectionFrame(label?)` | ❌ | 保存选中分组（预留功能） | |
| `getSavedSelectionFrames()` | — | 获取已保存分组 | |
| `deleteSavedSelectionFrame(frameId)` | ❌ | 删除分组 | |
| `renameSavedSelectionFrame(frameId, newLabel)` | ❌ | 重命名分组 | |
| `updateNodePositionDirect(nodeId, x, y)` | ❌ | 拖拽过程中直接更新位置（不走Command） | 仅用于拖拽中间态，拖拽结束必须用commitNodeMovement |
| `updateNodesPositionDirect(nodePositions)` | ❌ | 批量直接更新位置 | 框选拖拽中间态 |
| `commitNodeMovement(startPositions, endPositions)` | ✅ | 提交拖拽为MoveNodeCommand（可undo） | 拖拽结束时调用，记录起点终点 |
| `setSelectedNode(nodeId)` | — | 设置单选节点 | |
| `setSelectedNodes(nodeIds, primaryNodeId?)` | — | 设置多选节点 | |

### 四、架构红线：禁止模式与历史教训

以下8条铁律是开发过程中踩过的关键坑，违反任何一条都会导致难以调试的状态不同步bug。**架构合规测试（`npm run test:architecture`）会自动检测这些违规。**

#### 🔴 铁律1：禁止直接赋值 `node.transform.position.x/y`
- **错误做法**：`node.transform.position.x = 100;`
- **正确做法**：`node.setPosition(x, y)`（BlueprintNode重写此方法，同步transform和data.worldX/Y，并标记脏标记）
- **后果**：绕过脏标记清除机制，data.worldX/Y不同步，DOM层读取错误位置，渲染位置与逻辑位置不一致
- **测试规则**：Rule 1 — 蓝图层（blueprint/目录）禁止`.transform.position.[xy] =`直接赋值

#### 🔴 铁律2：禁止直接赋值 `node.data.worldX/worldY/width/height`
- **错误做法**：`node.data.worldX = 100; node.data.width = 400;`
- **正确做法**：使用`node.setPosition(x, y)` / `node.setSize(w, h)`统一入口
- **后果**：transform未同步，Canvas渲染位置与DOM位置不一致，连线端点错误
- **测试规则**：Rule 2 — Host层（views/AIWorkflow/，除adapter外）禁止直接赋值data.worldX/worldY/width/height

#### 🔴 铁律3：禁止watch selectedNodeIds触发反向同步
- **错误做法**：watch(selectedNodeIds变化后调用syncBlueprintNow/loadBlueprint
- **正确做法**：selectedNodeIds变化仅更新UI高亮，不触发任何引擎状态变更
- **后果**：点击空白deselect时触发全量loadBlueprint，signature不匹配导致增量更新覆盖引擎状态，节点位置回退、undo栈失效
- **测试规则**：Rule 3 — selectedNodeIds的watch不得调用syncBlueprintNow/scheduleStoreSyncToEditor触发反向同步

#### 🔴 铁律4：GraphObject.translate() 必须委托给 setPosition()
- **原因**：多态机制要求translate()内部调用this.setPosition()，这样子类（BlueprintNode）重写setPosition后translate才能正确同步data字段
- **测试规则**：Rule 4

#### 🔴 铁律5：BlueprintNode.setPosition 必须同步 data.worldX/Y
- **原因**：引擎内部使用GraphObject.transform.position（Vector2），而序列化和Vuex投影使用data.worldX/worldY，两者必须保持同步
- **测试规则**：Rule 5

#### 🔴 铁律6：交互锁释放顺序——先解锁后executeCommand
- **错误做法**：先executeCommand再释放isDomInteractionLocked
- **正确做法**：`isDomInteractionLocked = false; scene.executeCommand(cmd);`
- **后果**：after-command事件触发emitChange时锁仍为true，emitChange被守卫拦截，Vuex状态不更新，面板显示旧数据
- **测试规则**：Rule 6 — pointerup的NODES路径必须在executeCommand(MoveNodeCommand)之前设置isEngineDragging=false

#### 🔴 铁律7：loadBlueprint 必须增量更新，不得调用 commands.clear() 或 dispose 已有节点
- **错误做法**：每次loadBlueprint都clear()→disposeAll()→重新create所有节点
- **正确做法**：增量模式——已存在节点更新位置/尺寸/标题，已删除节点/连线移除，新增节点/连线创建
- **后果**：全量重建会清空CommandStack（undo历史丢失），节点对象引用变化导致DOM层持有disposed引用，内存泄漏
- **测试规则**：Rule 9（signature去重）、Rule 12（增量更新+禁止commands.clear()）

#### 🔴 铁律8：executeCommand/undo/redo 后必须 syncLoadSignature()
- **原因**：Command执行后引擎状态已变化，必须更新_lastLoadSignature。否则当Vuex因响应式变化序列化回传时，signature不匹配触发无意义的增量更新，会覆盖undo后的状态
- **测试规则**：Rule 13

### 五、键盘快捷键职责划分

快捷键处理采用**路由感知的分层处理**策略，`src/main.ts`在AIWorkflow/BlueprintTest路由下**不得拦截**键盘事件，让事件自然传播到引擎InputManager。

| 快捷键 | 处理层 | 处理方式 | 原因 |
|--------|--------|---------|------|
| **Ctrl+Z** | 引擎层 (Scene.setupKeyboardShortcuts) | InputManager捕获→scene.undo() | undo/redo必须由引擎CommandStack统一管理，保证多操作原子性 |
| **Ctrl+Y / Ctrl+Shift+Z** | 引擎层 | InputManager捕获→scene.redo() | 同上 |
| **Ctrl+X** | 业务层 (useAIWorkflowKeyboardAndResize) | keydown capture→copySelection+deleteSelection（stopImmediatePropagation） | 剪切需要同时处理业务资源清理 |
| **Ctrl+C** | 业务层 | keydown capture→copySelectedNodes（stopImmediatePropagation，不加preventDefault以保留copy事件MIME标记） | 防止引擎层重复执行copySelection导致双重复制 |
| **Ctrl+V** | 业务层 | keydown capture→pasteAt(lastMouseWorldPos)（stopImmediatePropagation） | 粘贴需要在鼠标位置而非画布中心，需要业务层跟踪鼠标位置 |
| **Ctrl+A** | 业务层 | keydown capture→engineApi.selectAll()（preventDefault） | 全选不触发浏览器默认全选页面文本 |
| **Ctrl+D** | 引擎层 | InputManager→duplicate | 引擎内部处理偏移30px复制 |
| **Delete / Backspace** | 业务层 | keydown capture→资源清理→engineApi.deleteSelection()（preventDefault+return） | 删除前需清理关联资源（如运行中任务、临时文件等），阻止浏览器后退默认行为 |
| **Enter** | 引擎层 | 进入DOM编辑模式/确认连线 | 引擎InputManager处理 |
| **Esc** | 引擎层 | 取消当前操作/退出DOM编辑模式 | 引擎InputManager处理 |
| **方向键** | 业务层/引擎 | Alt+方向键微调选中节点位置（moveNodesByDelta，走Command可撤销） | 微调精度由引擎配置 |

**main.ts中的路由放行规则**（测试Rule 11）：
```
在AIWorkflow/BlueprintTest路由下：
- Ctrl+Z/Y：PASS THROUGH（不调用stopPropagation/preventDefault），引擎InputManager处理undo/redo
- Delete/Backspace：PASS THROUGH，业务层capture处理资源清理后转发到引擎
- Ctrl+C/V/X/A：业务层capture处理，preventDefault/stopImmediatePropagation阻止默认行为
不在蓝图路由下：保持原有的全局行为（阻止Ctrl+Z/Y等）
```

### 六、架构合规测试15条规则速查

运行`npm run test:architecture`自动检测以下规则：

| Rule | 检查内容 | 违反后果 |
|------|---------|---------|
| **Rule 1** | 蓝图层禁止直接赋值`.transform.position.x/y`（GraphObject.ts除外） | 数据不同步、脏标记不清除 |
| **Rule 2** | Host层（views/AIWorkflow/，除adapter外）禁止直接赋值`.data.worldX/worldY/width/height` | Canvas与DOM位置不一致 |
| **Rule 3** | watch selectedNodeIds不得触发syncBlueprintNow/scheduleStoreSyncToEditor反向同步 | 点击空白deselect→位置回退、undo失效 |
| **Rule 4** | GraphObject.translate()必须调用this.setPosition()保证多态 | BlueprintNode重写失效、data不同步 |
| **Rule 5** | BlueprintNode.setPosition()必须设置this.data.worldX和this.data.worldY | 序列化数据与实际位置不一致 |
| **Rule 6** | pointerup中MoveNodeCommand executeCommand前必须有isEngineDragging=false | 拖拽结束后emitChange被锁拦截、Vuex不更新 |
| **Rule 7** | BlueprintScene.serialize()必须有防御性syncDataFromTransform | 序列化时data.worldX/Y可能过期 |
| **Rule 8** | emitChange必须有isEngineDragging守卫 | 拖拽中间态覆盖最终位置、性能问题 |
| **Rule 9** | loadBlueprint必须有signature去重（_lastLoadSignature） | 无意义重建覆盖undo效果 |
| **Rule 10** | onBlueprintEditorSelectionChange在commit前必须设置isUpdatingFromStore=true | 选择变化触发反馈环 |
| **Rule 11** | main.ts在AIWorkflow/BlueprintTest路由下必须PASS THROUGH（放行Ctrl+Z/Y/Delete） | 快捷键不工作或重复执行 |
| **Rule 12** | loadBlueprint必须增量更新已有节点，不得调用commands.clear() | undo历史丢失、节点引用失效 |
| **Rule 13** | executeCommand/undo/redo后必须调用syncLoadSignature() | Command后状态被loadBlueprint覆盖 |
| **Rule 14** | Scene基类setupKeyboardShortcuts必须处理Ctrl+Z→undo()、Ctrl+Y→redo() | 引擎层无法处理undo/redo |
| **Rule 15** | workflowStateToLegacyBlueprint缓存命中时必须同步节点坐标/尺寸/标题，cache key必须包含nodeCount | 缓存返回过期坐标、loadBlueprint覆盖引擎位置 |

### 七、后续开发注意事项

1. **新增节点类型**：流程参见[agent_docs/06_AI_WORKFLOW_GUIDE.md](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/agent_docs/06_AI_WORKFLOW_GUIDE.md)，重点关注：
   - 端口定义（inputs/outputs）在`getDefaultNodeData`中定义，包含`id/type/mediaType/label/position`
   - 节点Vue组件注册在`NodeComponentResolver`
   - 节点默认尺寸在`DEFAULT_NODE_SIZES`常量中同步更新（DOM层和引擎层必须一致）

2. **业务字段更新**：优先使用`engineApi.updateNodeData(nodeId, patch)`，不要直接`store.commit('patchBlueprintNodeData')`。`updateNodeData`会同步到引擎和Vuex，保持一致性。

3. **新增Command规范**：
   - 在`src/engine/blueprint/commands/`下创建新Command类，继承`Command`基类
   - 实现对称的`execute()`/`undo()`/`redo()`方法（redo默认调用execute）
   - Command构造函数应保存所有undo所需的状态快照（旧值/新值）
   - 建议补充单元测试（参考现有Command测试模式）
   - 在commands/index.ts中导出（如需要外部引用）

4. **禁止操作清单**（违反会导致架构破坏）：
   - ❌ 禁止直接访问`engine.getScene().commands`直接操作CommandStack
   - ❌ 禁止在业务层直接修改`store.state.workflow.blueprintDraft.nodesById/edgesById`
   - ❌ 禁止watch blueprintDraft.nodesById/edgesById触发任何引擎操作
   - ❌ 禁止在DOM节点组件的onDrag/onResize中直接修改node.transform
   - ❌ 禁止在Port连接中使用`port.id`（运行时ID），必须使用`port.spec.id`（业务稳定ID）
   - ❌ 禁止在BlueprintDomOverlay中直接操作canvas或transform，位置/尺寸完全由BlueprintEditorTool/BlueprintNode控制

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
  - 路由层（`src/router/index.ts`，共 13 个路由）：
    - `/welcome`：启动/环境检查页（`src/views/WelCome.vue`，注意命名拼写）
    - `/`：项目列表（`src/views/ProjectList.vue`）
    - `/workflow`：AI 工作流蓝图（`src/views/AIWorkflow.vue` → `src/views/AIWorkflow/AIWorkflowPage.vue`）
    - `/studio`：视频工作室（`src/views/VideoStudio.vue`）
    - `/video-editor`：独立视频编辑器（`src/views/VideoEditorPage.vue`）
    - `/settings`：应用设置（`src/views/Settings.vue`）
    - `/image-markup-preview`：图片标注预览（`src/views/ImageMarkupPreviewPage.vue`）
    - `/resource-manager`：资源管理器窗口（`src/views/AIWorkflow/ResourceManagerWindow.vue`）
    - `/3d-editor`：3D 模型编辑器（`src/views/Model3DEditorPage.vue`，基于 Three.js）
    - `/template-center`：模板中心窗口（`src/views/AIWorkflow/TemplateCenterWindow.vue`）
    - `/cloud-storage`：云存储管理页面（`src/views/CloudStorage/CloudStoragePage.vue`）
    - `/comfyui-setup`：ComfyUI 设置页面（`src/views/ComfyUISetupPage.vue`）
    - `/services`：服务中心页面（`src/views/ServiceCenterPage.vue`，统一管理 ComfyUI、MCP 等后端服务状态）

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
18. **CloudFS 云存储规范**：新增云存储提供商应在 `electron/backend/modules/cloudfs/providers/` 下创建适配器目录，实现统一接口（bucket/list/upload/delete 等），通过 `registry.mjs` 注册，不要在业务模块直接耦合具体云存储 SDK。
19. **Steam 工坊模板规范**：工坊模板适配应通过 `electron/backend/modules/workshop-templates/adapters/` 的抽象层实现，使用 factory 模式分发，Mock provider 用于开发/测试降级。
20. **3D 编辑器规范**：3D 相关功能使用 Three.js（`three` + `three-bvh-csg`），与 2D WebGL2 引擎（`src/engine/webgl/`）分离；3D 编辑器逻辑优先通过 `src/composables/` 组织。
21. **ComfyUI 管理规范**：ComfyUI 本地服务管理（安装、配置、启停、日志）统一走 `electron/backend/modules/comfyui/` 模块，前端通过 `window.dweb.comfyui.setup.*` 调用，不要在前端直接执行子进程或文件操作。
22. **测试规范**：新增功能应配套单元测试，放在 `tests/` 目录下（按 `unit/` + 业务域 + 模块组织），运行 `npm run test` 验证。
23. **🔴 AI工作流蓝图架构红线**：蓝图编辑器使用图形底座（`src/engine/graphbase/`）+ 蓝图业务层（`src/engine/blueprint/`）双层架构，**Vuex不管理蓝图绘制状态**：
    - 蓝图绘制状态（节点位置/尺寸/连线坐标）唯一权威来源是引擎内部，通过`node.setPosition()`/`node.setSize()`等公共API修改
    - **禁止直接赋值**：不允许写`node.transform.position.x = ...`或`node.data.worldX = ...`绕过API
    - **单向数据流**：引擎→Vuex（只读投影），禁止Vuex→引擎全量`loadBlueprint()`重建（初始加载和显式业务流程除外）
    - **禁止watch selectedNodeIds触发反向同步**：点击空白deselect不得触发蓝图重建
    - Vuex仅存页面级UI状态（对话框开关、面板状态、任务进度、选中高亮等）和引擎状态的只读投影
    - 违反以上规则会导致双轨/三轨数据不同步bug（拖拽瞬移、位置回退、DOM层拦截），架构门禁测试会拦截此类违规代码
    - 详见 [06_AI_WORKFLOW_GUIDE.md 架构红线必读章节](agent_docs/06_AI_WORKFLOW_GUIDE.md#%E6%9E%B6%E6%9E%84%E7%BA%A2%E7%BA%BF%E5%BF%85%E8%AF%BB2026-07-27%E6%9B%B4%E6%96%B0)

### 快速开发常用命令

```bash
# === 开发模式 ===
# 启动 Vite 前端开发服务器（端口 5173）
npm run dev
# 启动完整开发模式（Electron 桌面端 + Vite 前端 + Steam 原生模块）
npm run dev:electron
# 仅启动 Electron 应用（需先启动 Vite）
npm run dev:electron:app
# Steam 开发环境（仅复制原生模块，不启动 Steam 调试）
npm run dev:electron:steam
# 纯前端开发（Web 模式，不启动 Electron，后端功能需要 mock）
npm run dev:web
# 空环境启动（模拟无配置/无资源环境，用于测试首次启动流程）
npm run dev:electron:empty
npm run dev:electron:app:empty
npm run dev:web:empty
# Copilot SSE 连接检查
npm run check:copilot-sse
# Copilot 开发冒烟测试
npm run smoke:copilot-dev

# === 环境准备 ===
# 设置 Steam 开发环境（复制原生模块）
npm run setup:steam
# 重新编译 better-sqlite3 原生模块（Electron ABI 变化后）
npm run install:better-sqlite3
# 准备 Python 运行时（打包前，可选）
npm run prepare:python-runtime
# 配置 Steam（生成 steam.config.json）
npm run config:steam
# 清理旧版 Django 运行时残留
npm run clean:runtime-legacy

# === 构建 ===
# 构建前端（vue-tsc 类型检查 + Vite 构建）
npm run build
# 预览构建产物
npm run preview

# === 质量门禁 ===
# 类型检查（默认质量门禁）
npm run typecheck
# 严格类型检查
npm run typecheck:strict
# 类型检查监听模式
npm run typecheck:watch
# 单元测试
npm run test
# 单元测试监听模式
npm run test:watch
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
# Prettier 格式化
npm run format
# 格式检查
npm run format:check

# === 打包与发布 ===
# 打包 Windows（目录版，不生成安装程序）
npm run pack:win
# 打包 macOS（目录版）
npm run pack:mac
# 打包 Windows 安装程序（NSIS）
npm run dist:win
# 打包 macOS（生成 zip + dmg）
npm run dist:mac
# 打包 Steam 版 Windows 安装包
npm run dist:steam:win
# 构建 Steam 版本
npm run build:steam
# 上传 Steam 构建到 Steamworks
npm run upload:steam
# Steam 完整发布流程（构建 + 上传）
npm run release:steam
# Steam 正式上线（构建 + 上传 + set-live）
npm run release:steam:live
# 通用发布脚本
npm run release

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
# 大文本扫描
npm run perf:scan:large
# AI 工作流生成图像蓝图
npm run perf:aiwf:generate
# AI 工作流资产预览审计
npm run perf:aiwf:audit-preview
# AI 工作流性能冒烟测试
npm run perf:aiwf:smoke
# 批量性能冒烟测试
npm run perf:aiwf:smoke:batch

# === 打包分发 ===
# 源码打包
npm run pack:source
npm run clean:source-pack
# 局域网传输包（含/不含 DVSResource）
npm run pack:lan
npm run pack:lan:with-dvs
npm run clean:lan-pack
# Git bundle 打包
npm run pack:git-bundle
# 示例项目打包
npm run pack:sample
npm run clean:sample-pack

# === Git Hooks ===
# 启用 Git hooks 保护
npm run git:protect-on
# 关闭 Git hooks 保护
npm run git:protect-off
```

> 完整命令清单见 `package.json#scripts`，共 60+ 个脚本。

### 关键工程文件位置速查

| 关注点 | 路径 |
| --- | --- |
| 前端入口 | `index.html` → `src/main.ts` → `src/App.vue` |
| 路由表 | `src/router/index.ts`（13 个路由） |
| Vuex store 入口 | `src/store/index.ts` |
| Vuex store 模块 | `src/store/{aiworkflow,timeline,videoscene,videostudio,theme,i18n}/store.ts` |
| 3D 编辑器 Composables | `src/composables/useEnhancedModel3DEditor.ts`、`useModel3DEditor.ts` |
| Electron 桥接（前端封装） | `src/electronBridge/index.ts`（TypeScript 封装） |
| Preload 注入 | `electron/preload.mjs`（`window.dweb` 注入入口，22 个命名空间） |
| Electron 主进程 | `electron/main.mjs` |
| 应用配置 | `electron/config.mjs` |
| Logo 资源配置 | `electron/logo.config.mjs` |
| 诊断工具 | `electron/diagnostics.mjs` |
| Node.js 后端入口 | `electron/backend/index.mjs`（22 个模块注册） |
| 后端路由注册 | `electron/backend/router.mjs` |
| 后端核心工具 | `electron/backend/core/`（logger/errors/http-client/resourcePaths/sse-parser/stream） |
| 后端功能模块 | `electron/backend/modules/*/`（22 个模块，routes.mjs/handlers.mjs/service.mjs + 扩展子目录） |
| Agent 运行时 | `electron/backend/modules/agent/`（runtime/ + providers/ + dvsagent/） |
| MCP 服务器 | `electron/backend/modules/mcp/`（server/ + builtinTools + toolExecutor + client + handlers） |
| CLI 适配器 | `electron/backend/modules/cli-adapters/`（base + manager + claudeCli/codexCli/copilotCli + cliConfigStore + handlers） |
| 云端模板中心 | `electron/backend/modules/cloud-templates/`（adapters/ + service + types） |
| Steam 工坊模板 | `electron/backend/modules/workshop-templates/`（adapters/ base/factory/mock/steam + service + handlers） |
| Blender 集成 | `electron/backend/modules/blender/`（config + workspace + service） |
| 云存储文件系统（CloudFS） | `electron/backend/modules/cloudfs/`（registry + providers/ aliyun-oss/volcengine-tos/custom-http + base/utils + service） |
| ComfyUI 管理 | `electron/backend/modules/comfyui/`（setup-service + log-line-parser + service + handlers） |
| 平台抽象层（主进程） | `electron/platform/`（index/manager / providers / config / events / ipc / types） |
| 平台原生模块 | `electron/platform/native/win32/`（dweb_steamjs.node / steam_api64.dll） |
| dweb:// 协议实现 | `electron/backend/projectAssetProtocol.mjs` |
| 项目静态资产服务 | `electron/backend/projectStaticAssets/{manifest,paths,service}.mjs` |
| 视频缩略图生成 | `electron/backend/videoThumbnails.mjs` |
| 运行时清理 | `electron/backend/runtimeCleanup.mjs` |
| 本地数据库 | `electron/localdb/{db,migrations,index,json}.mjs` + `electron/localdb/repos/*.mjs`（15 个仓库） |
| LocalDB IPC | `electron/localdb/ipc/ipcHost.mjs` |
| Python Bridge（可选） | `electron/backend/python-bridge/`（index/runtime/rpc/pip + scripts/） |
| Unreal 插件源码 | `electron/static/unreal-plugin/`（DwebWorkflowBridge 源码 + zip） |
| Python 引导安装 | `electron/static/bootstrap/`（mac/windows 安装脚本） |
| 3D 渲染引擎 | `src/engine/webgl/`（2D WebGL2 引擎，旧/视频编辑器）；3D 使用 Three.js（`three` + `three-bvh-csg` 依赖） |
| 图形底座（蓝图） | `src/engine/graphbase/`（通用2D场景图/渲染/输入/选择/拖拽/Camera） |
| 蓝图业务层 | `src/engine/blueprint/`（BlueprintScene/BlueprintNode/BlueprintEditorTool/Commands/DOM覆盖层） |
| 蓝图Host桥接 | `src/views/AIWorkflow/AIWorkflowPage.vue`（引擎↔Vuex单向同步桥接层） |
| 蓝图状态适配器 | `src/views/AIWorkflow/blueprint-bridge/workflowStateAdapter.ts`（引擎LegacyData ↔ Vuex WorkflowState） |
| 单元测试 | `tests/`（unit/ + components/ + engine/ + scripts/，按业务域组织） |
| 3D 编辑器文档 | `agent_docs/08_3D_EDITOR_RENDERING_GUIDE.md` |
| 用户设置存储 | `DVSResource/UserSettings/settings.json` |
| 运行时日志 | `DVSResource/Logs/runtime.log`（便携模式）或 `userData/dweb-runtime.log` |

---
*注：本文件及 `agent_docs/` 目录专为 AI Agent 设计，旨在提供结构化的项目上下文。最后更新：2026-07-27（反映AI工作流蓝图架构迁移到图形底座+蓝图业务层双层架构；Vuex职责边界明确为页面级状态+引擎只读投影；新增架构红线规则#23；新增架构一致性门禁测试；引擎目录新增graphbase/blueprint双层结构）*
