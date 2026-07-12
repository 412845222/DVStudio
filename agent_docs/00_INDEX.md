# Agent 文档索引 (Agent Docs Index)

本目录包含了 DVStudio 项目的结构化全仓开发边界与上下文指引。作为 AI Agent，请根据任务需求查阅相关文档。

## ⚠️ 重要架构变更（2026-07 更新）

**Django 依赖已完全移除（2026-06）**。项目后端已从「Django 子进程 + HTTP 服务器」架构重构为「纯 Electron 主进程 Node.js IPC 后端」架构：

- 不再启动 Django 子进程，不再监听 HTTP 端口
- 所有后端逻辑通过 Electron IPC（`ipcMain.handle` / `ipcRenderer.invoke`）通信
- 流式输出使用 IPC 三通道模式（`:data` / `:end` / `:error`）
- Python 仅作为可选 Bridge 用于特定计算任务（如字幕处理），非核心依赖
- 外部 AI API（DeepSeek、Gemini、字节跳动等）直接在 Electron 主进程通过内置 HTTP 客户端调用
- LocalDB（better-sqlite3）是唯一数据事实来源，不再有 Django SQLite 镜像

**2026-07 重大扩展**：在 IPC 后端基础上，项目新增以下核心能力：

- **Agent 运行时**（`electron/backend/modules/agent/`）：统一 Agent Runtime，抽象 LLM Provider（Api/Cli/Codex/Copilot/DVSAgent），支持工具注册与上下文构建
- **MCP 服务器**（`electron/backend/modules/mcp/`）：内置 Model Context Protocol 服务器，支持 stdio 与 socket 双桥接，通过 `registerBuiltinTools()` 注册工具
- **CLI 适配器层**（`electron/backend/modules/cli-adapters/`）：统一封装 Claude/Codex/Copilot CLI，替代旧 codex 模块
- **3D 编辑器**（`/3d-editor` 路由）：基于 Three.js 的 3D 模型编辑器页面
- **多模型扩展**：Tripo3D（3D）、Ark/Gemini（视频）、Blender（3D 集成）、Cloud Templates（模板中心）
- **测试体系**：`tests/` 目录含 4 类测试（unit/components/engine/scripts），覆盖 agent/aiworkflow/core/electron/network/store/views/workflow

## 关键数字速查

| 维度 | 数量 | 说明 |
|------|------|------|
| 后端模块 | **20** | system/projects/project-assets/chat/comfyui/meshy/tripo3d/seedance/ark/gemini/third-party/editor/export/subtitle/agent-skills/agent/mcp/cli-adapters/cloud-templates/blender |
| LocalDB 仓库 | **14** | projects/meshyTasks/videoTasks/tripo3dTasks/arkTasks/geminiTasks/exportJobs/comfyuiJobs/comfyuiWorkflows/editorComponents/chatConversations/aiworkflowTemplates/refImageCache/apiKeys |
| Electron 桥接命名空间 | **24** | common/window/projects/aiworkflow/db/projectAssets/videostudio/thirdParty/meshy/tripo3d/gemini/seedance/ark/comfyui/codex/agent/agentSkills/mcp/blender/cli/platform/cloudTemplates |
| 路由页面 | **9** | /welcome, /, /workflow, /studio, /settings, /image-markup-preview, /resource-manager, /3d-editor, /template-center |
| Vuex Store | **6** | aiworkflow/timeline/videoscene/videostudio/theme/i18n |

## 目录结构

### 入口与总览

1. [AGENT_GUIDE.md](../AGENT_GUIDE.md)
   - **入口文件**：AI Agent 进入项目时第一个阅读的文档，包含快速上下文、技术栈、关键架构模块、前后端通信模型、Agent 行为准则。
2. [00_INDEX.md](00_INDEX.md)（本文件）
   - 文档目录与导读、架构变更说明、关键数字速查。

### 核心文档

3. [01_PROJECT_OVERVIEW.md](01_PROJECT_OVERVIEW.md)
   - 项目背景、核心目标、13 项核心能力（AI 工作流 / 视频编辑器 / Agent 运行时 / MCP 服务器 / CLI 适配器 / 3D 编辑器 / Blender 集成 / LocalDB / dweb:// 协议 / Steam 平台 / AI 对话 / 云端模板 / Python Bridge）、9 个路由页面、环境准备流程。
4. [02_ARCHITECTURE.md](02_ARCHITECTURE.md)
   - 全栈架构图（含 Agent/MCP/3D 编辑器层）、核心目录结构解析（含 20 个后端模块、14 个 LocalDB 仓库、6 个 Vuex store、tests/ 目录）、IPC 通信模型、后端模块路由表（完整 20 模块）、Electron 主进程启动时序、数据流转机制。
5. [07_DEVELOPMENT_BOUNDARIES.md](07_DEVELOPMENT_BOUNDARIES.md)
   - **⚠️ 核心必读**：前后端 / Electron 主进程职责划分、状态管理边界、LocalDB 唯一事实来源、Electron 桥接 (IPC) 边界、dweb:// 协议边界、平台抽象层边界、Agent/MCP/CLI/Blender/CloudTemplates/Tripo3D/Ark/Gemini/3D 编辑器边界、代码风格、模块新增规范、测试与质量门禁。

### 分层开发指引

6. [03_FRONTEND_GUIDE.md](03_FRONTEND_GUIDE.md)
   - Vue 3 + WebGL2 + Three.js 自研引擎、Vuex 状态管理（6 个模块）、UI 组件库（含 3D 编辑器组件）、AI 工作流双层结构（`src/aiworkflow/` + `src/views/AIWorkflow/`）、electronBridge 24 个命名空间、IPC 客户端、平台桥接层（platformBridge）、Steam UI 组件、视频编辑器增强模块、3D 编辑器前端架构、tests/ 目录结构。
7. [04_BACKEND_GUIDE.md](04_BACKEND_GUIDE.md)
   - **Node.js IPC 后端（核心）**：ESM 模块、router 机制、统一返回格式、核心工具（logger/errors/http-client/stream/sse-parser）、模块结构规范（routes/handlers/service + 复杂子目录）、**20 个后端模块详解**、LocalDB 14 个仓库完整清单、后端测试规范。
8. [05_ELECTRON_GUIDE.md](05_ELECTRON_GUIDE.md)
   - 主进程与渲染进程通信、dweb:// 协议、LocalDB（14 个仓库）、项目静态资产服务、环境准备流程（含 Blender/MCP 初始化）、便携模式资源目录、**平台抽象层（electron/platform/）**、Unreal 插件静态资产、preload 24 个命名空间。

### 专项指引

9. [06_AI_WORKFLOW_GUIDE.md](06_AI_WORKFLOW_GUIDE.md)
   - 工作流双层结构、节点类型全表（含 Tripo3D/Blender/Ark/Gemini/MCP/Agent/CloudTemplate 节点）、连线规则、ComfyUI 桥接、三方 API 集成（meshy/seedance/tripo3d/ark/gemini/blender）、Agent Skills、MCP 工具节点、3D 编辑器与工作流集成、节点聊天对话框、IPC 调用方式。
10. [08_3D_EDITOR_RENDERING_GUIDE.md](08_3D_EDITOR_RENDERING_GUIDE.md)
    - 3D 编辑器开发指引：整体架构（路由/Vue 组件/Three.js/状态管理）、与后端模块集成（blender/tripo3d/agent/mcp）、与 AI 工作流集成、dweb:// 协议使用、Three.js 后处理管线优化（SSAO/Bloom/ColorCorrection/FXAA）、三点光照系统、PBR 材质调优、性能优化、常见问题排查。

### 新模块专项指引

11. [09_AGENT_SYSTEM_GUIDE.md](09_AGENT_SYSTEM_GUIDE.md)
    - **Agent 运行时**：AgentRuntime 架构、ILLMProvider 接口与 5 个 Provider 实现（ApiLLMProvider/CliLLMProvider/CodexProvider/CopilotProvider/DVSAgentProvider+DVSAgentEnhancedProvider）、Provider 工厂、ContextBuilder、ToolRegistry、ToolImageProcessor、与 MCP/cli-adapters 的协作、前端 IPC 接口（window.dweb.agent.*）、新增 LLM 接入规范。
12. [10_MCP_GUIDE.md](10_MCP_GUIDE.md)
    - **MCP 集成**：DVStudioMCPServer 架构、stdioBridge/socketBridge 双桥接模式、builtinTools 内置工具注册（registerBuiltinTools）、toolExecutor 工具执行器、MCP 客户端、工具注册规范、权限与安全边界、前端 IPC 接口（window.dweb.mcp.*）、与 Agent Runtime 的集成。
13. [11_NEW_AI_MODULES_GUIDE.md](11_NEW_AI_MODULES_GUIDE.md)
    - **新增 AI 模块群**：tripo3d/ark/gemini/blender/cloud-templates/cli-adapters 六个模块的架构、IPC 通道、前端桥接、routes/handlers/service 结构、LocalDB 仓库对应关系、API 密钥管理、错误处理与降级策略。
14. [12_TESTING_GUIDE.md](12_TESTING_GUIDE.md)
    - **测试开发指引**：tests/ 目录结构（unit/components/engine/scripts 四类）、按业务域组织（agent/aiworkflow/core/electron/network/store/views/workflow）、Vitest 配置、Mock 策略（IPC Mock/Platform Mock/API Mock）、测试编写规范、运行命令、质量门禁（quality/quality:full）。

## 快速查找指南

| 你要做什么 | 应该查阅的文档 |
|-----------|--------------|
| 了解项目是什么、有哪些能力 | [01_PROJECT_OVERVIEW.md](01_PROJECT_OVERVIEW.md) |
| 了解系统整体架构和目录结构 | [02_ARCHITECTURE.md](02_ARCHITECTURE.md) |
| 修改前端 Vue 组件 / UI / WebGL 渲染 | [03_FRONTEND_GUIDE.md](03_FRONTEND_GUIDE.md) |
| 修改后端模块 / 新增 IPC 通道 | [04_BACKEND_GUIDE.md](04_BACKEND_GUIDE.md) + [07_DEVELOPMENT_BOUNDARIES.md](07_DEVELOPMENT_BOUNDARIES.md) |
| 修改 Electron 主进程 / preload / dweb:// / 平台层 | [05_ELECTRON_GUIDE.md](05_ELECTRON_GUIDE.md) |
| 修改 AI 工作流节点 / 连线 / 蓝图逻辑 | [06_AI_WORKFLOW_GUIDE.md](06_AI_WORKFLOW_GUIDE.md) |
| 修改 3D 编辑器 / Three.js 渲染 | [08_3D_EDITOR_RENDERING_GUIDE.md](08_3D_EDITOR_RENDERING_GUIDE.md) |
| 修改 Agent 对话 / LLM 接入 / 工具调用 | [09_AGENT_SYSTEM_GUIDE.md](09_AGENT_SYSTEM_GUIDE.md) |
| 修改 MCP 工具 / 新增 MCP 工具 | [10_MCP_GUIDE.md](10_MCP_GUIDE.md) |
| 新增 AI 提供商（3D/视频/对话） | [11_NEW_AI_MODULES_GUIDE.md](11_NEW_AI_MODULES_GUIDE.md) |
| 编写测试 / 了解测试结构 | [12_TESTING_GUIDE.md](12_TESTING_GUIDE.md) |
| 不确定修改边界在哪 | [07_DEVELOPMENT_BOUNDARIES.md](07_DEVELOPMENT_BOUNDARIES.md)（⚠️ 必读） |

## 文档维护约定

- **所有文档都应与代码现状保持一致**；当代码结构 / IPC 通道 / 命名空间 / 平台层发生变化时，**必须同步更新对应的 Agent 文档**。
- 修改前先看相关 `agent_docs/*.md`，避免破坏既有边界。
- 文档目录（`agent_docs/`）本身只读地记录**当前事实**；不要把"待办"或"未来计划"混入描述。
- 如果发现文档与代码不符，请直接修改文档（本文档维护是常态任务）。
- **不要添加 Django 相关的新文档或描述**；Django 已被移除，遗留引用仅用于迁移清理。
- **数字必须统一**：后端模块=20、LocalDB 仓库=14、Electron 桥接命名空间=24、路由=9、Vuex store=6。
- **新增后端模块时**，必须同步更新：02_ARCHITECTURE.md（目录树+路由表）、04_BACKEND_GUIDE.md（模块详解）、05_ELECTRON_GUIDE.md（命名空间）、07_DEVELOPMENT_BOUNDARIES.md（边界规范）；如属 AI 模块还需更新 06/09/10/11。
- **新增前端页面/路由时**，必须同步更新：01_PROJECT_OVERVIEW.md（路由表）、02_ARCHITECTURE.md（目录树+路由表）、03_FRONTEND_GUIDE.md（前端指引）。
