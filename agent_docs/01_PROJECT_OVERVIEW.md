# 项目概述 (Project Overview)

## ⚠️ 架构变更提示

**Django 依赖已完全移除（2026-06）**。项目后端已重构为纯 Electron 主进程 Node.js IPC 架构：
- 不再启动 Django 子进程
- 所有后端逻辑通过 Electron IPC 通信
- AI 对话直接在主进程调用外部 API（DeepSeek、Gemini、字节跳动等）
- Python 仅作为可选 Bridge 用于字幕等特定计算任务

**2026-07 重大扩展**：在 IPC 后端基础上新增 Agent 运行时、MCP 服务器、CLI 适配器层、3D 编辑器、Blender 集成、多模型 3D/视频生成（Tripo3D/Ark/Gemini）、云端模板中心等能力。后端模块扩展至 20 个，LocalDB 仓库扩展至 14 个，Electron 桥接命名空间扩展至 24 个。

## 1. 项目简介

DVStudio (Dweb Video Studio) 是一个基于 WebGL2 + Three.js 的视频编辑与 AI 工作流蓝图桌面应用。它将传统的视频时间轴编辑、3D 模型编辑与现代的 AI 生成能力（ComfyUI、Meshy、Tripo3D、Seedance、Ark、Gemini 等）深度结合，提供一站式的 AI 创作体验。应用以 **Electron 桌面端**形式分发，**所有后端逻辑运行在 Electron 主进程中**，通过 IPC 与前端通信，辅以 **dweb:// 自定义协议** 直接从磁盘读取项目静态资产，通过 **平台抽象层** 支持 Steamworks 原生集成，并内置 **Agent 运行时**与 **MCP 服务器**实现 AI 工具调用与多模型协作。

## 2. 核心能力

### 2.1 AI 工作流蓝图 (AI Workflow Blueprint)
- **定位**: 节点化的 AI 任务编排工具。
- **功能**:
  - 资源导入与管理（图片 / 视频 / 音频 / 3D 模型 / 文本）。
  - 剧情与分支编排（Story Nodes）、场景理解、场景布局、场景拆解、Unreal 导出。
  - 连接本地或远程的 ComfyUI / Meshy / Tripo3D / Seedance / Ark / Gemini / 即梦 / SeeDream / NanoBanana 等服务进行推理。
  - 支持 MCP 工具节点和 Agent 辅助节点。
  - 云端模板中心（本地/Steam 双适配器）。
  - 输出媒体（图片 / 视频 / 3D 模型）的回流与预览。
  - 节点内置聊天对话框（NodeChatDialog），支持针对单个节点的 AI 交互。
- **入口**: `src/views/AIWorkflow.vue` → `src/views/AIWorkflow/AIWorkflowPage.vue`
- **后端模块**: `electron/backend/modules/comfyui/`、`meshy/`、`tripo3d/`、`seedance/`、`ark/`、`gemini/`、`third-party/`、`agent-skills/`、`agent/`、`mcp/`、`cloud-templates/`

### 2.2 视频编辑器 (Video Editor)
- **定位**: 基于时间轴和关键帧的 2D 视频动画编辑器。
- **功能**:
  - 舞台节点（矩形、文字、图片、线条）的所见即所得编辑。
  - 时间轴关键帧与缓动曲线控制（含可视化缓动曲线编辑器）。
  - 音频波形显示与编辑。
  - 节点控制点（缩放控制点、线条控制点）。
  - 节点详情表单（通用变换、图片、线条、矩形、文字、滤镜、数值拖拽）。
  - 节点树层级管理。
  - 组件库面板（支持从组件库快速添加预设组件）。
  - 字幕编辑器与 AI 字幕理解面板。
  - 导出对话框、最近编辑加载对话框、进度条编辑对话框。
  - AI 对话辅助（生成布局、批量修改样式、生成滤镜、生成调色板）。
- **入口**: `src/views/VideoStudio.vue`
- **后端模块**: `electron/backend/modules/editor/`、`export/`、`subtitle/`

### 2.3 3D 模型编辑器 (3D Model Editor)
- **定位**: 基于 Three.js 的 3D 模型预览与编辑工具。
- **功能**:
  - Three.js 后处理管线（SSAO/Bloom/ColorCorrection/FXAA）。
  - 三点光照系统与光照预设。
  - PBR 材质渲染与调优。
  - 支持从 Tripo3D 生成的 3D 模型导入。
  - 支持 Blender 工作空间集成。
  - 与 AI 工作流蓝图双向集成。
- **入口**: `src/views/Model3DEditorPage.vue`（路由 `/3d-editor`）
- **后端模块**: `electron/backend/modules/blender/`、`tripo3d/`、`agent/`、`mcp/`
- **详细文档**: [08_3D_EDITOR_RENDERING_GUIDE.md](08_3D_EDITOR_RENDERING_GUIDE.md)

### 2.4 Agent 运行时 (Agent Runtime)
- **定位**: 统一的 AI Agent 执行引擎，支持多 LLM Provider 和工具调用。
- **功能**:
  - AgentRuntime 管理 Agent 生命周期、消息处理、流式输出。
  - ILLMProvider 抽象层支持 5 种 Provider：ApiLLMProvider（直连 API）、CliLLMProvider（CLI 基类）、CodexProvider、CopilotProvider、DVSAgentProvider（+DVSAgentEnhancedProvider 增强）。
  - ToolRegistry 工具注册与发现，支持 MCP 工具。
  - ContextBuilder 上下文构建策略。
  - ToolImageProcessor 工具输出图片处理。
  - 对话管理（创建/删除/重命名/消息历史）。
- **后端模块**: `electron/backend/modules/agent/`
- **前端桥接**: `window.dweb.agent.*`
- **详细文档**: [09_AGENT_SYSTEM_GUIDE.md](09_AGENT_SYSTEM_GUIDE.md)

### 2.5 MCP 服务器 (MCP Server)
- **定位**: 内置 Model Context Protocol 服务器，支持工具注册与外部 MCP 客户端连接。
- **功能**:
  - DVStudioMCPServer 核心服务器。
  - 双桥接模式：stdioBridge（标准输入输出）和 socketBridge（Socket）。
  - 内置工具注册（registerBuiltinTools）。
  - toolExecutor 工具执行器，统一管理工具调用、错误处理、超时。
  - MCP 客户端（client.mjs）连接外部 MCP 服务器。
- **后端模块**: `electron/backend/modules/mcp/`
- **前端桥接**: `window.dweb.mcp.*`
- **详细文档**: [10_MCP_GUIDE.md](10_MCP_GUIDE.md)

### 2.6 CLI 适配器层 (CLI Adapters)
- **定位**: 统一封装外部 CLI AI 工具（Claude/Codex/Copilot CLI），替代旧 codex 模块。
- **功能**:
  - CLIAdapterManager 统一管理多个 CLI 适配器。
  - 基类抽象（base.mjs），支持适配器注册。
  - 三种适配器实现：ClaudeCliAdapter、CodexCliAdapter、CopilotCliAdapter。
  - 会话管理（启动/停止/发送/取消/列出）。
  - 配置存储（cliConfigStore）。
  - 环境检测与认证流程。
- **后端模块**: `electron/backend/modules/cli-adapters/`
- **前端桥接**: `window.dweb.cli.*`
- **与 Agent 关系**: CliLLMProvider 通过 CLI 适配器调用 CLI 工具

### 2.7 Electron 本地资产与任务数据库 (LocalDB)
- **定位**: 桌面端本地 SQLite（better-sqlite3）数据层，**唯一运行时事实来源**（不再有 Django SQLite 镜像）。
- **功能**:
  - 14 个仓库：projects、meshyTasks、videoTasks、tripo3dTasks、arkTasks、geminiTasks、exportJobs、comfyuiJobs、comfyuiWorkflows、editorComponents、chatConversations、aiworkflowTemplates、refImageCache、apiKeys。
  - API 密钥加密存储（AES-256-GCM + PBKDF2）。
  - 多路径回退初始化（backendDataDir → userDataDir → tmpdir → homedir）。
- **位置**: `electron/localdb/`
- **IPC 入口**: `electron/localdb/ipc/ipcHost.mjs` 注册的 `dweb:localdb:*` 和 `window.dweb.db.*` 通道；前端通过 `window.dweb.*` 访问

### 2.8 dweb:// 项目资产协议
- **定位**: 自定义 Electron 协议，让渲染端直接从磁盘读取项目静态资产，**不经过任何 HTTP 通道**。
- **协议格式**: `dweb://project-assets?projectId=<id>&path=<rel>&variant=<v>&maxSize=<n>&v=<versionTag>`
- **关键路径**:
  - 注册：`electron/main.mjs`（`protocol.registerSchemesAsPrivileged`）
  - 协议处理器：`electron/backend/projectAssetProtocol.mjs`
  - 静态资产管理服务：`electron/backend/projectStaticAssets/{manifest,paths,service}.mjs`
- **优势**: 零 HTTP 开销、完全离线可用、路径安全校验、内置缩略图生成

### 2.9 Steam 平台集成
- **定位**: 通过平台抽象层支持 Steamworks 原生集成，提供 Steam 平台特有能力。
- **功能**: Steam 好友列表、面板与快捷操作、用户状态徽章、热键支持、Overlay 激活、DLC 检测、入口引导覆盖层。
- **架构**: 主进程 `electron/platform/` + 前端 `src/platformBridge/` + UI `src/ui/Steam/`
- **降级策略**: Web 模式或非 Steam 环境下自动使用 Mock provider

### 2.10 AI 对话集成
- **后端**: 通过 Agent Runtime（`electron/backend/modules/agent/`）统一调度，支持直连 API 模式和 CLI 模式。
- **支持的 AI 提供商**:
  - DeepSeek（默认）、Gemini、字节跳动豆包（直连 API，通过 ApiLLMProvider）
  - Claude CLI、Codex CLI、GitHub Copilot CLI（通过 CLI 适配器 + CliLLMProvider）
  - DVS Agent（增强模式，通过 DVSAgentProvider）
- **前端**: 通过 IPC 流式通道接收响应（`dweb:agent:stream`）。
- **流式实现**: IPC 三通道模式（`:data`/`:end`/`:error`）。
- **对话持久化**: LocalDB `chatConversations` 仓库。

### 2.11 Node.js IPC 后端
- **定位**: 所有后端逻辑的统一入口，运行在 Electron 主进程。
- **架构**: 模块化设计，每个业务域一个模块目录，共 20 个模块。
- **模块列表**:
  - `system/` - 系统健康检查、诊断、迁移状态
  - `projects/` - 项目 CRUD
  - `project-assets/` - 项目资产元数据
  - `chat/` - AI 对话（adapters/ 多供应商适配器：base/bytedance/gemini/openai-compatible）
  - `comfyui/` - ComfyUI 桥接
  - `meshy/` - Meshy 3D 生成
  - `tripo3d/` - Tripo3D 3D 生成
  - `seedance/` - Seedance 视频生成
  - `ark/` - Ark 视频生成
  - `gemini/` - Gemini 视频生成
  - `third-party/` - 三方 API 统一网关（nanobanana/seedream/gemini/jimeng/blueprint）
  - `editor/` - 编辑器后端（组件库）
  - `export/` - 导出服务（ffmpeg 调用）
  - `subtitle/` - 字幕处理（部分通过 Python Bridge）
  - `agent-skills/` - Agent Skills（场景理解/灯光/布局/Unreal 导出，含 Unreal HTTP 服务器）
  - `agent/` - Agent 运行时（runtime/providers/dvsagent）
  - `mcp/` - MCP 服务器（server/builtinTools/toolExecutor/client）
  - `cli-adapters/` - CLI 适配器层（base/manager + claudeCli/codexCli/copilotCli）
  - `cloud-templates/` - 云端模板中心（adapters/local+steam/factory）
  - `blender/` - Blender 集成（config/workspace/service + MCP 桥接）
- **通信方式**: Electron IPC（`ipcMain.handle` / `ipcRenderer.invoke`）
- **详细文档**: [04_BACKEND_GUIDE.md](04_BACKEND_GUIDE.md)

### 2.12 Blender 集成
- **定位**: Blender 工作空间管理与 MCP 桥接。
- **功能**: Blender 环境检测、MCP 连接/断开、3D 模型导入、工具挂载检查、工作空间初始化/脚本管理/截图/统计。
- **后端模块**: `electron/backend/modules/blender/`
- **前端桥接**: `window.dweb.blender.*`

### 2.13 云端模板中心 (Cloud Templates)
- **定位**: 提供云端模板浏览、下载、上传功能。
- **架构**: 适配器模式（adapters/），支持 local（本地）和 steam（Steam 云）双适配器，通过 factory 分发。
- **后端模块**: `electron/backend/modules/cloud-templates/`
- **前端桥接**: `window.dweb.cloudTemplates.*`
- **入口**: `/template-center` 路由（TemplateCenterWindow.vue）

### 2.14 Python Bridge（可选组件）
- **定位**: 可选的 Python 工作进程，用于需要 Python 生态的计算密集型任务。
- **非核心依赖**: 核心功能完全不依赖 Python。
- **用途**: 字幕处理等需要特定 Python 库的任务。
- **位置**: `electron/backend/python-bridge/`
- **优雅降级**: Python 环境不可用时给出明确提示，不影响核心功能。

### 2.15 便携模式资源目录
- **定位**: 支持便携版运行，数据保存在安装目录旁。
- **资源目录**: `DVSResource/`（安装目录可写时）或用户数据目录。
- **内容**: UserData（LocalDB/Session/CrashDumps）、UserSettings/settings.json、BackendData/、Logs/runtime.log
- **便携检测**: 安装目录可写时自动启用便携模式。

## 3. 路由与页面

路由表位于 `src/router/index.ts`，共 9 个路由：

| 路径 | 组件 | 用途 | 窗口类型 |
| --- | --- | --- | --- |
| `/welcome` | `src/views/WelCome.vue` | 启动 / 环境检查 / Setup 工作流（注意命名拼写为 WelCome） | 主窗口 |
| `/` | `src/views/ProjectList.vue` | 项目列表（搜索、新建、从文件夹打开） | 主窗口 |
| `/workflow` | `src/views/AIWorkflow.vue` → `src/views/AIWorkflow/AIWorkflowPage.vue` | AI 工作流蓝图编辑器 | 主窗口 |
| `/studio` | `src/views/VideoStudio.vue` | 视频编辑器（舞台 + 时间轴 + 增强面板） | 主窗口 |
| `/settings` | `src/views/Settings.vue` | 应用设置 | 主窗口 |
| `/image-markup-preview` | `src/views/ImageMarkupPreviewPage.vue` | 图片标注预览 | 独立 BrowserWindow |
| `/resource-manager` | `src/views/AIWorkflow/ResourceManagerWindow.vue` | 资源管理器窗口 | 独立 BrowserWindow |
| `/3d-editor` | `src/views/Model3DEditorPage.vue` | 3D 模型编辑器（Three.js） | 主窗口/独立窗口 |
| `/template-center` | `src/views/AIWorkflow/TemplateCenterWindow.vue` | 云端模板中心 | 独立 BrowserWindow |

> **Electron 模式** 下使用 `createWebHashHistory()`（避免 file:// 协议下 History 模式失败）；**Web 模式** 下使用 `createWebHistory()`。

## 4. 环境准备流程（Setup Workflow）

应用启动时自动运行环境准备流程（可手动重试），步骤如下：

1. **Python 环境检测**（可选）：检测系统 Python >=3.11，缺失时在 Windows 下尝试 winget 自动安装
2. **创建资源目录**：创建 `DVSResource/` 目录结构（UserData、UserSettings、BackendData、Logs）
3. **初始化 Python Bridge**（可选）：如 Python 可用则初始化 Python 工作进程
4. **初始化 Node.js IPC 后端**：注册所有 20 个后端 IPC 模块路由，初始化 MCP 服务器
5. **Blender 环境检测**（可选）：检测 Blender 是否可用，不可用时仅影响 3D 相关功能
6. **检测 ffmpeg**（可选）：检测 ffmpeg 是否可用，不可用时仅影响视频导出

每个步骤都有进度展示和错误提示，用户可以在 `/welcome` 页面查看状态和重试。

## 5. 技术栈概览

| 层级 | 技术 |
|------|------|
| 前端框架 | Vue 3（Composition API + `<script setup lang="ts">`）+ TypeScript |
| 构建工具 | Vite |
| 2D 渲染 | 自研 WebGL2 引擎（`src/engine/webgl/`） |
| 3D 渲染 | Three.js（后处理管线 + PBR 材质） |
| 状态管理 | Vuex（aiworkflow / timeline / videoscene / videostudio / theme / i18n） |
| 桌面端 | Electron 33.x（ESM .mjs） |
| 本地数据库 | better-sqlite3（14 个仓库） |
| 后端通信 | Electron IPC（三通道流式模式） |
| 外部 API | 内置 HTTP 客户端（`core/http-client.mjs`） |
| AI 运行时 | Agent Runtime + ILLMProvider 抽象 + MCP 工具 |
| 打包 | electron-builder（Windows NSIS / macOS DMG+ZIP） |
| 测试 | Vitest（tests/ 目录，4 类测试） |

## 6. 目标用户与使用场景
- **创作者**: 使用 AI 工作流快速生成素材（图片/视频/3D模型），在视频编辑器中进行精细化排版和动画制作，在 3D 编辑器中预览和调整 3D 模型；通过 Steam 平台分享作品或参与社区互动。
- **开发者**: 基于现有的 WebGL2/Three.js 引擎、节点系统、模块化 IPC 后端、Agent 运行时和平台抽象层，扩展新的渲染能力、AI 接入能力、MCP 工具或平台集成。

## 7. 与 AGENT_GUIDE 的关系

本文件是「项目是什么」的总览；如需了解具体模块的实现约定，请按需查阅 `agent_docs/02_ARCHITECTURE.md` 及之后的子文档。修改任何代码前，请先阅读 [07_DEVELOPMENT_BOUNDARIES.md](07_DEVELOPMENT_BOUNDARIES.md) 了解开发边界。
