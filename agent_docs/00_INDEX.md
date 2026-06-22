# Agent 文档索引 (Agent Docs Index)

本目录包含了 DVStudio 项目的结构化全仓开发边界与上下文指引。作为 AI Agent，请根据任务需求查阅相关文档。

## 目录结构

1. [01_PROJECT_OVERVIEW.md](01_PROJECT_OVERVIEW.md)
   - 项目背景、核心目标、四大部分能力（AI 工作流 / 视频编辑器 / LocalDB / dweb:// 协议 / AI 对话）介绍。
2. [02_ARCHITECTURE.md](02_ARCHITECTURE.md)
   - 全栈架构图、核心目录结构解析（`src/` / `django-app/` / `electron/` 全部子目录）、前后端数据流转机制、**Django URL 路由表（拆分 `/api/workflow/` 与 `/api/third-party/`）**、Electron 主进程启动时序。
3. [03_FRONTEND_GUIDE.md](03_FRONTEND_GUIDE.md)
   - Vue 3 + WebGL2 自研引擎、Vuex 状态管理、UI 组件库、AI 工作流双层结构（`src/aiworkflow/` + `src/views/AIWorkflow/`）、electronBridge 命名空间。
4. [04_BACKEND_GUIDE.md](04_BACKEND_GUIDE.md)
   - Django 4.2.11 + DRF 3.14、原生 `StreamingHttpResponse` SSE、所有 App 划分（`dwebapp` / `codex_bridge` / `aiworkflow_project` / `comfyui_bridge` / `third_party_api_gateway` / `dvs_editor` / `agentSkills` / `dweb_models`）、**三/四方 API 网关双层路由结构**（`comfyui_bridge/api.py` 共享实现 + `third_party_api_gateway` 新路由层）、数据库双轨（Django SQLite + LocalDB）。
5. [05_ELECTRON_GUIDE.md](05_ELECTRON_GUIDE.md)
   - 主进程与渲染进程通信、dweb:// 协议、LocalDB（`electron/localdb/`）、项目静态资产服务（`electron/backend/projectStaticAssets/`）、Django 进程管理、Python 引导安装。
6. [06_AI_WORKFLOW_GUIDE.md](06_AI_WORKFLOW_GUIDE.md)
   - 工作流双层结构、节点类型全表、连线规则、ComfyUI 桥接、**三/四方 API 网关双层路由**（实现层 `comfyui_bridge` + 路由层 `third_party_api_gateway`）、Agent Skills。
7. [07_DEVELOPMENT_BOUNDARIES.md](07_DEVELOPMENT_BOUNDARIES.md)
   - **核心必读**：前后端 / Electron 主进程职责划分、状态管理边界、LocalDB 与 Django SQLite 双轨、Electron 桥接 (IPC) 边界、dweb:// 协议边界、代码风格、测试与质量门禁、破坏性修改警告。

## 文档维护约定

- **所有文档都应与代码现状保持一致**；当代码结构 / 路由 / 命名空间发生变化时，**必须同步更新对应的 Agent 文档**。
- 修改前先看相关 `agent_docs/*.md`，避免破坏既有边界。
- 文档目录（`agent_docs/`）本身只读地记录**当前事实**；不要把"待办"或"未来计划"混入描述。
- 如果发现文档与代码不符，请直接修改文档（本文档维护是常态任务）。
