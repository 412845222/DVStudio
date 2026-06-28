# Agent 文档索引 (Agent Docs Index)

本目录包含了 DVStudio 项目的结构化全仓开发边界与上下文指引。作为 AI Agent，请根据任务需求查阅相关文档。

## ⚠️ 重要架构变更（2026-06）

**Django 依赖已完全移除**。项目后端已从「Django 子进程 + HTTP 服务器」架构重构为「纯 Electron 主进程 Node.js IPC 后端」架构：

- 不再启动 Django 子进程，不再监听 HTTP 端口
- 所有后端逻辑通过 Electron IPC（`ipcMain.handle` / `ipcRenderer.invoke`）通信
- 流式输出使用 IPC 三通道模式（`:data` / `:end` / `:error`）
- Python 仅作为可选 Bridge 用于特定计算任务（如字幕处理），非核心依赖
- 外部 AI API（DeepSeek、Gemini 等）直接在 Electron 主进程通过内置 HTTP 客户端调用
- LocalDB（better-sqlite3）是唯一数据事实来源，不再有 Django SQLite 镜像

## 目录结构

1. [01_PROJECT_OVERVIEW.md](01_PROJECT_OVERVIEW.md)
   - 项目背景、核心目标、五大部分能力（AI 工作流 / 视频编辑器 / LocalDB / dweb:// 协议 / Steam 平台集成 / AI 对话）介绍。
2. [02_ARCHITECTURE.md](02_ARCHITECTURE.md)
   - 全栈架构图、核心目录结构解析（`src/` / `electron/backend/` / `electron/localdb/` / `electron/platform/`）、IPC 通信模型、后端模块路由表、Electron 主进程启动时序（含平台层初始化、环境准备流程）。
3. [03_FRONTEND_GUIDE.md](03_FRONTEND_GUIDE.md)
   - Vue 3 + WebGL2 自研引擎、Vuex 状态管理、UI 组件库、AI 工作流双层结构（`src/aiworkflow/` + `src/views/AIWorkflow/`）、electronBridge 命名空间、IPC 客户端、**平台桥接层（platformBridge）**、Steam UI 组件、视频编辑器增强模块。
4. [04_BACKEND_GUIDE.md](04_BACKEND_GUIDE.md)
   - **Node.js IPC 后端（核心）**：ESM 模块、router 机制、统一返回格式、核心工具（logger/errors/http-client/stream）、模块结构规范（routes/handlers/service）、所有后端模块详解（system/projects/chat/codex/comfyui/meshy/seedance/third-party/editor/export/subtitle/agent-skills）、内置 HTTP 客户端、Python Bridge（可选）。
5. [05_ELECTRON_GUIDE.md](05_ELECTRON_GUIDE.md)
   - 主进程与渲染进程通信、dweb:// 协议、LocalDB（`electron/localdb/`）、项目静态资产服务（`electron/backend/projectStaticAssets/`）、环境准备流程（setup workflow）、便携模式资源目录、**平台抽象层（electron/platform/）** —— Steam 提供者、原生模块加载、事件泵、IPC、启动时序。
6. [06_AI_WORKFLOW_GUIDE.md](06_AI_WORKFLOW_GUIDE.md)
   - 工作流双层结构、节点类型全表、连线规则、ComfyUI 桥接、三方 API 集成（meshy/seedance）、Agent Skills、节点聊天对话框、IPC 调用方式。
7. [07_DEVELOPMENT_BOUNDARIES.md](07_DEVELOPMENT_BOUNDARIES.md)
   - **核心必读**：前后端 / Electron 主进程职责划分、状态管理边界、LocalDB 唯一事实来源、Electron 桥接 (IPC) 边界、dweb:// 协议边界、**平台抽象层边界**、代码风格、模块新增规范、测试与质量门禁、破坏性修改警告、桌面端可观测闭环准则。

## 文档维护约定

- **所有文档都应与代码现状保持一致**；当代码结构 / IPC 通道 / 命名空间 / 平台层发生变化时，**必须同步更新对应的 Agent 文档**。
- 修改前先看相关 `agent_docs/*.md`，避免破坏既有边界。
- 文档目录（`agent_docs/`）本身只读地记录**当前事实**；不要把"待办"或"未来计划"混入描述。
- 如果发现文档与代码不符，请直接修改文档（本文档维护是常态任务）。
- **不要添加 Django 相关的新文档或描述**；Django 已被移除，遗留引用仅用于迁移清理。
