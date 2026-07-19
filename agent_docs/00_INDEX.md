# Agent 文档索引 (Agent Docs Index)

本目录包含了 DVStudio 项目的结构化全仓开发边界与上下文指引。作为 AI Agent，请根据任务需求查阅相关文档。

## ⚠️ 重要架构变更（2026-07-19 更新）

**Django 依赖已完全移除（2026-06）**。项目后端已从「Django 子进程 + HTTP 服务器」架构重构为「纯 Electron 主进程 Node.js IPC 后端」架构：

- 不再启动 Django 子进程，不再监听 HTTP 端口
- 所有后端逻辑通过 Electron IPC（`ipcMain.handle` / `ipcRenderer.invoke`）通信
- 流式输出使用 IPC 三通道模式（`:data` / `:end` / `:error`）
- Python 仅作为可选 Bridge 用于特定计算任务（如字幕处理），非核心依赖
- 外部 AI API（DeepSeek、Gemini、字节跳动、OpenAI 兼容接口等）直接在 Electron 主进程通过内置 HTTP 客户端调用
- LocalDB（better-sqlite3）是唯一数据事实来源，不再有 Django SQLite 镜像

**2026-07-19 最新扩展**：在 IPC 后端基础上，项目新增以下核心能力：

- **CloudFS 云存储文件系统**（`electron/backend/modules/cloudfs/`）：统一云存储抽象层，支持阿里云 OSS、火山引擎 TOS、自定义 HTTP 三类适配器，支持 Bucket 管理、文件上传下载、ACL 修复、公共 URL 生成
- **Steam 工坊模板**（`electron/backend/modules/workshop-templates/`）：Steam Workshop 集成，支持工坊模板查询、下载、进度跟踪、安装信息获取
- **ComfyUI 本地服务管理增强**（`electron/backend/modules/comfyui/`）：支持 ComfyUI 本地安装、环境检测、模型路径配置、服务启停、日志查看、镜像源管理、Python 虚拟环境管理
- **Three.js 3D 编辑器增强**：新增 `useEnhancedModel3DEditor.ts`，支持 CSG 布尔运算（three-bvh-csg）、灯光调整、模型导入
- **新增页面**：独立视频编辑器 `/video-editor`、云存储管理 `/cloud-storage`、ComfyUI 设置 `/comfyui-setup`、服务中心 `/services`
- **新增 SDK 依赖**：`@volcengine/tos-sdk`（火山引擎 TOS）、`ali-oss`（阿里云 OSS）、`html2canvas`、`three-bvh-csg`

## 关键数字速查（2026-07-19 最新）

| 维度 | 数量 | 说明 |
|------|------|------|
| 后端模块 | **22** | system/projects/project-assets/chat/comfyui/meshy/tripo3d/seedance/ark/gemini/third-party/editor/export/subtitle/agent-skills/agent/mcp/cli-adapters/cloud-templates/workshop-templates/blender/cloudfs |
| LocalDB 仓库 | **15** | projects/meshyTasks/videoTasks/tripo3dTasks/arkTasks/geminiTasks/exportJobs/comfyuiJobs/comfyuiWorkflows/editorComponents/chatConversations/aiworkflowTemplates/refImageCache/apiKeys/cloudStorageConfig |
| Electron 桥接命名空间（preload） | **22** | common/window/projects/aiworkflow/videostudio/thirdParty/meshy/tripo3d/gemini/seedance/ark/comfyui/codex/agent/agentSkills/mcp/blender/cli/platform/cloudTemplates/workshopTemplates/cloudfs |
| 路由页面 | **13** | /welcome, /, /workflow, /studio, /video-editor, /settings, /image-markup-preview, /resource-manager, /3d-editor, /template-center, /cloud-storage, /comfyui-setup, /services |
| Vuex Store | **6** | aiworkflow/timeline/videoscene/videostudio/theme/i18n |
| 云存储适配器 | **3** | aliyun-oss（阿里云 OSS）/ volcengine-tos（火山引擎 TOS）/ custom-http（自定义 HTTP） |
| Steam 工坊适配器 | **2+1** | steam（真实 Steam）/ mock（开发降级），通过 factory 分发 |

> **注意**：深层文档（02-12）中部分数字（如「20 个模块」「14 个仓库」「24 个命名空间」「9 个路由」）可能仍为旧值，请以本索引页数字为准。文档逐页更新为常态任务，建议修改对应模块时顺带更新相关文档。

## 目录结构

### 入口与总览

1. [AGENT_GUIDE.md](../AGENT_GUIDE.md)
   - **入口文件**：AI Agent 进入项目时第一个阅读的文档，包含快速上下文、技术栈、关键架构模块、前后端通信模型、Agent 行为准则（已更新至 2026-07-19）。
2. [00_INDEX.md](00_INDEX.md)（本文件）
   - 文档目录与导读、架构变更说明、关键数字速查（**本页数字为最新权威来源**）。

### 核心文档

3. [01_PROJECT_OVERVIEW.md](01_PROJECT_OVERVIEW.md)
   - 项目背景、核心目标、核心能力、路由页面、环境准备流程。
4. [02_ARCHITECTURE.md](02_ARCHITECTURE.md)
   - 全栈架构图、核心目录结构解析、IPC 通信模型、后端模块路由表、Electron 主进程启动时序、数据流转机制。
   - ⚠️ 注：本文数字可能滞后，最新数字见本页「关键数字速查」。
5. [07_DEVELOPMENT_BOUNDARIES.md](07_DEVELOPMENT_BOUNDARIES.md)
   - **⚠️ 核心必读**：前后端 / Electron 主进程职责划分、状态管理边界、LocalDB 唯一事实来源、Electron 桥接 (IPC) 边界、dweb:// 协议边界、平台抽象层边界、代码风格、模块新增规范、测试与质量门禁。

### 分层开发指引

6. [03_FRONTEND_GUIDE.md](03_FRONTEND_GUIDE.md)
   - Vue 3 + WebGL2 + Three.js、Vuex 状态管理、UI 组件库、AI 工作流双层结构、electronBridge、IPC 客户端、平台桥接层、视频编辑器、3D 编辑器前端架构、tests/ 目录结构。
7. [04_BACKEND_GUIDE.md](04_BACKEND_GUIDE.md)
   - **Node.js IPC 后端（核心）**：ESM 模块、router 机制、统一返回格式、核心工具、模块结构规范、后端模块详解、LocalDB 仓库清单、后端测试规范。
   - ⚠️ 注：本文模块数量可能滞后，最新模块列表见本页或 backend/index.mjs。
8. [05_ELECTRON_GUIDE.md](05_ELECTRON_GUIDE.md)
   - 主进程与渲染进程通信、dweb:// 协议、LocalDB、项目静态资产服务、环境准备流程、便携模式资源目录、平台抽象层、Unreal 插件、preload 命名空间。

### 专项指引

9. [06_AI_WORKFLOW_GUIDE.md](06_AI_WORKFLOW_GUIDE.md)
   - 工作流双层结构、节点类型全表、连线规则、ComfyUI 桥接、三方 API 集成、Agent Skills、MCP 工具节点、3D 编辑器与工作流集成、节点聊天对话框、IPC 调用方式。
10. [08_3D_EDITOR_RENDERING_GUIDE.md](08_3D_EDITOR_RENDERING_GUIDE.md)
    - 3D 编辑器开发指引：整体架构、与后端模块集成（blender/tripo3d/agent/mcp）、与 AI 工作流集成、dweb:// 协议使用、Three.js 后处理管线优化、三点光照系统、PBR 材质调优、性能优化、常见问题排查。

### 新模块专项指引

11. [09_AGENT_SYSTEM_GUIDE.md](09_AGENT_SYSTEM_GUIDE.md)
    - **Agent 运行时**：AgentRuntime 架构、ILLMProvider 接口与 Provider 实现、Provider 工厂、ContextBuilder、ToolRegistry、ToolImageProcessor、与 MCP/cli-adapters 的协作、前端 IPC 接口、新增 LLM 接入规范。
12. [10_MCP_GUIDE.md](10_MCP_GUIDE.md)
    - **MCP 集成**：DVStudioMCPServer 架构、stdioBridge/socketBridge 双桥接模式、builtinTools 内置工具注册、toolExecutor 工具执行器、MCP 客户端、工具注册规范、权限与安全边界、前端 IPC 接口、与 Agent Runtime 的集成。
13. [11_NEW_AI_MODULES_GUIDE.md](11_NEW_AI_MODULES_GUIDE.md)
    - **新增 AI 模块群**：tripo3d/ark/gemini/blender/cloud-templates/cli-adapters 六个模块的架构、IPC 通道、前端桥接、routes/handlers/service 结构、LocalDB 仓库对应关系、API 密钥管理、错误处理与降级策略。
14. [12_TESTING_GUIDE.md](12_TESTING_GUIDE.md)
    - **测试开发指引**：tests/ 目录结构、按业务域组织、Vitest 配置、Mock 策略、测试编写规范、运行命令、质量门禁。
15. [13_CLOUD_MODULES_GUIDE.md](13_CLOUD_MODULES_GUIDE.md)
    - **🆕 云服务与扩展模块（2026-07-19 新增）**：
      - CloudFS 云存储文件系统（registry/providers 架构、aliyun-oss/volcengine-tos/custom-http 适配器、Bucket 管理、文件上传下载、ACL 修复、公共 URL、配置持久化到 cloudStorageConfig 仓库）
      - Steam Workshop 工坊模板（adapters/factory 架构、steam/mock 适配器、查询/下载/进度/安装信息 IPC 接口）
      - ComfyUI 本地服务管理增强（setup-service 安装流程、Python venv 管理、镜像源配置、服务启停/日志/状态事件、前端 setup 命名空间）

## 快速查找指南

| 你要做什么 | 应该查阅的文档 |
|-----------|--------------|
| 了解项目是什么、有哪些能力 | [01_PROJECT_OVERVIEW.md](01_PROJECT_OVERVIEW.md) |
| 了解系统整体架构和目录结构 | [02_ARCHITECTURE.md](02_ARCHITECTURE.md)（数字以本索引为准） |
| 修改前端 Vue 组件 / UI / WebGL 渲染 | [03_FRONTEND_GUIDE.md](03_FRONTEND_GUIDE.md) |
| 修改后端模块 / 新增 IPC 通道 | [04_BACKEND_GUIDE.md](04_BACKEND_GUIDE.md) + [07_DEVELOPMENT_BOUNDARIES.md](07_DEVELOPMENT_BOUNDARIES.md) |
| 修改 Electron 主进程 / preload / dweb:// / 平台层 | [05_ELECTRON_GUIDE.md](05_ELECTRON_GUIDE.md) |
| 修改 AI 工作流节点 / 连线 / 蓝图逻辑 | [06_AI_WORKFLOW_GUIDE.md](06_AI_WORKFLOW_GUIDE.md) |
| 修改 3D 编辑器 / Three.js 渲染 | [08_3D_EDITOR_RENDERING_GUIDE.md](08_3D_EDITOR_RENDERING_GUIDE.md) |
| 修改 Agent 对话 / LLM 接入 / 工具调用 | [09_AGENT_SYSTEM_GUIDE.md](09_AGENT_SYSTEM_GUIDE.md) |
| 修改 MCP 工具 / 新增 MCP 工具 | [10_MCP_GUIDE.md](10_MCP_GUIDE.md) |
| 新增 AI 提供商（3D/视频/对话） | [11_NEW_AI_MODULES_GUIDE.md](11_NEW_AI_MODULES_GUIDE.md) |
| 新增云存储适配器 / 修改 CloudFS | **[13_CLOUD_MODULES_GUIDE.md](13_CLOUD_MODULES_GUIDE.md)** 🆕 |
| 修改 Steam 工坊模板 / WorkShop 集成 | **[13_CLOUD_MODULES_GUIDE.md](13_CLOUD_MODULES_GUIDE.md)** 🆕 |
| 修改 ComfyUI 本地安装/配置/服务管理 | **[13_CLOUD_MODULES_GUIDE.md](13_CLOUD_MODULES_GUIDE.md)** 🆕 |
| 编写测试 / 了解测试结构 | [12_TESTING_GUIDE.md](12_TESTING_GUIDE.md) |
| 不确定修改边界在哪 | [07_DEVELOPMENT_BOUNDARIES.md](07_DEVELOPMENT_BOUNDARIES.md)（⚠️ 必读） |

## 文档维护约定

- **所有文档都应与代码现状保持一致**；当代码结构 / IPC 通道 / 命名空间 / 平台层发生变化时，**必须同步更新对应的 Agent 文档**。
- 修改前先看相关 `agent_docs/*.md`，避免破坏既有边界。
- 文档目录（`agent_docs/`）本身只读地记录**当前事实**；不要把「待办」或「未来计划」混入描述。
- 如果发现文档与代码不符，请直接修改文档（本文档维护是常态任务）。
- **不要添加 Django 相关的新文档或描述**；Django 已被移除，遗留引用仅用于迁移清理。
- **数字必须统一**：后端模块=22、LocalDB 仓库=15、preload 顶层命名空间=22、路由=13、Vuex store=6（以本索引页为权威）。
- **新增后端模块时**，必须同步更新：
  1. [AGENT_GUIDE.md](../AGENT_GUIDE.md)（核心功能/技术栈/速查表）
  2. [00_INDEX.md](00_INDEX.md)（本页，关键数字+目录+查找表）
  3. [02_ARCHITECTURE.md](02_ARCHITECTURE.md)（目录树+路由表）
  4. [04_BACKEND_GUIDE.md](04_BACKEND_GUIDE.md)（模块详解）
  5. [07_DEVELOPMENT_BOUNDARIES.md](07_DEVELOPMENT_BOUNDARIES.md)（边界规范）
  - 如属 AI 模块还需更新 06/09/10/11；如属云/平台扩展模块更新 13。
- **新增前端页面/路由时**，必须同步更新：[00_INDEX.md](00_INDEX.md)（关键数字）、[01_PROJECT_OVERVIEW.md](01_PROJECT_OVERVIEW.md)（路由表）、[02_ARCHITECTURE.md](02_ARCHITECTURE.md)（目录树+路由表）、[03_FRONTEND_GUIDE.md](03_FRONTEND_GUIDE.md)（前端指引）。
