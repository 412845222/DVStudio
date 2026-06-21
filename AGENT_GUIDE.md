# AI Agent 开发指引 (AI Agent Development Guide)

欢迎！作为 AI Agent，当你进入本项目（DVStudio）时，请首先阅读本指南。本指南将帮助你快速理解项目上下文、技术栈、架构边界以及开发规范，从而更好地提供 AI 编码服务。

## 📚 详细文档索引

为了保持根目录整洁，详细的上下文和开发边界指引已结构化存放在 `agent_docs/` 目录中。请根据当前任务的需要，查阅相应的文档：

- [00_INDEX.md](agent_docs/00_INDEX.md) — 文档目录与导读
- [01_PROJECT_OVERVIEW.md](agent_docs/01_PROJECT_OVERVIEW.md) — 项目概述与核心业务逻辑
- [02_ARCHITECTURE.md](agent_docs/02_ARCHITECTURE.md) — 系统架构与目录结构
- [03_FRONTEND_GUIDE.md](agent_docs/03_FRONTEND_GUIDE.md) — 前端开发指引（Vue 3 + WebGL2）
- [04_BACKEND_GUIDE.md](agent_docs/04_BACKEND_GUIDE.md) — 后端开发指引（Django + AI）
- [05_ELECTRON_GUIDE.md](agent_docs/05_ELECTRON_GUIDE.md) — 桌面端开发指引（Electron + LocalDB）
- [06_AI_WORKFLOW_GUIDE.md](agent_docs/06_AI_WORKFLOW_GUIDE.md) — AI 工作流蓝图开发指引
- [07_DEVELOPMENT_BOUNDARIES.md](agent_docs/07_DEVELOPMENT_BOUNDARIES.md) — 全仓开发边界与规范（⚠️ 必读）

## 🎯 快速上下文

### 项目简介

**DVStudio (Dweb Video Studio)** 是一款面向视频创作的 AI 工作流工具。应用以 Electron 桌面端形式运行，在本地通过 Django 子进程提供 AI 对话与工作流推理能力。其核心由 AI 工作流蓝图、视频编辑器、本地资产数据库以及 AI 对话辅助四部分组成。

### 核心功能

1. **AI 工作流蓝图**：资源 → 剧情/分支 → ComfyUI 推理 → 输出媒体（项目以本地磁盘项目文件夹 + SQLite 共同存储）
2. **视频编辑器**：舞台节点 + 时间轴关键帧 + AI 对话辅助
3. **Electron 本地资产数据库**（核心新增）：通过 `electron/localdb/` 统一管理项目、任务、API 密钥等本地数据
4. **AI 对话集成**：Electron 主进程内嵌 Django 服务 + GitHub Copilot CLI 驱动 AI 对话（SSE 流式输出）

### 技术栈

#### 前端（`src/`）
- **框架**：Vue 3（Composition API）
- **语言**：TypeScript
- **构建**：Vite
- **状态管理**：Vuex
- **渲染引擎**：WebGL2（自定义）
- **运行环境**：Node.js 16+
- **运行平台感知**：`src/network/runtimePlatform.ts`（Electron / Web / Unknown）
- **后端地址解析**：`src/network/backendConfig.ts`（运行时注入优先于环境变量与 localStorage）

#### 后端（`django-app/`）
- **语言**：Python 3.11+
- **Web 框架**：Django（含 Django REST Framework）
- **AI 对话引擎**：GitHub Copilot CLI（SSE 流式输出，取代原有 Codex 服务）
- **数据库**：SQLite3（Django ORM）

#### 桌面端（`electron/`）
- **框架**：Electron
- **本地数据库**：SQLite3（better-sqlite3）
- **本地资产协议**：自定义协议 `dweb://project-assets`
- **打包工具**：NSIS
- **进程通信**：IPC（preload.mjs 注入）
- **关键新增模块**：`electron/localdb/`（本地资产与任务数据层）、`electron/backend/projectAssetProtocol.mjs`

### 关键架构模块

1. **前端 — Electron 运行平台三层**
   - `src/network/runtimePlatform.ts`：运行平台检测（electron / web / unknown）
   - `src/network/backendConfig.ts`：后端地址解析（Electron 运行时注入优先 > `VITE_BACKEND_BASE_URL` 构建环境变量 > localStorage > 默认 Django 地址 `http://127.0.0.1:5800`）
   - `src/electronBridge/index.ts`：Electron IPC 桥接（项目列表、目录选择、后端启动/重启、客户端设置等）

2. **Electron 本地资产与任务数据库**（`electron/localdb/`，核心新增层）
   - `db.mjs` / `index.mjs`：SQLite 数据库实例管理与仓库聚合入口
   - `migrations.mjs`：数据库结构迁移（保证 schema 向前兼容）
   - `json.mjs`：JSON 序列化辅助（ISO 时间戳转换 / 可选 JSON 字段）
   - `repos/projects.mjs`：项目仓库（项目清单、保存 / 加载 / 删除 / 从文件夹打开）
   - `repos/meshyTasks.mjs`：Meshy 3D 任务仓库
   - `repos/videoTasks.mjs`：视频任务仓库
   - `repos/apiKeys.mjs`：API 密钥仓库（本地对称加密存储）
   - `ipc/ipcHost.mjs`：本地数据库 IPC 主机（前端 → 主进程数据访问通道）
   - `ipc/djangoMigrate.mjs`：Django 迁移辅助 IPC（由主进程发起 `python manage.py migrate`）

3. **项目资产协议**（`electron/backend/projectAssetProtocol.mjs`，新增）
   - 自定义 Electron 协议：`dweb://project-assets`
   - 工作方式：Electron 环境中项目静态资产直接从磁盘读取，绕过 Django HTTP 通道，提升加载速度并保证离线可用
   - Django 仍负责：upload / import / delete / resolve / repair 等会落盘或远程拉取的写操作
   - Web 开发环境降级：通过 Django 的 `/api/workflow/projects/assets/file` 代理端点访问

4. **Copilot CLI 服务**（`django-app/codex_bridge/`）
   - `services/copilot_cli.py`：Copilot 可执行文件路径解析（支持本地 `node_modules/@github/copilot`、`npx`、nvm、Scoop、WinGet 等多种安装路径）
   - `views.py`：对话会话管理、SSE 流式输出
   - `services/orchestrator.py`：服务协调者（会话创建 / 消息流编排）

5. **Django 资产 API**（`django-app/aiworkflow_project/assets/api.py`）
   - 负责上传 / 导入 / 删除 / 解析 / 修复等会落盘或远程拉取的写操作
   - 提供 `/api/workflow/projects/assets/` 下的各操作端点

### 前后端通信模型

- **Electron 主进程**
  - 启动并守护 Django Python 子进程
  - 承载本地数据库（better-sqlite3）
  - 注册 `dweb://project-assets` 自定义协议
  - 通过 IPC 向前端暴露本地数据库与项目操作能力
- **前端渲染进程**
  - 通过 IPC 调用本地数据库与本地资产管理
  - 通过 HTTP 访问 Django REST API
  - 通过 SSE 接收 Copilot CLI 流式对话输出

## 🤖 Agent 行为准则

1. **先阅读，后修改**：在修改任何代码前，请先阅读相关模块的 `agent_docs/` 指引文档。
2. **遵守边界**：严格遵守前后端分离边界，不要在前端直接处理需要后端处理的重逻辑，反之亦然。
3. **保持一致性**：遵循现有的代码风格（如 Vue 3 的 `<script setup>`、TypeScript 类型定义、Django 的 App 结构）。
4. **最小化修改**：只修改与当前任务直接相关的文件，避免过度重构。
5. **测试验证**：在提供代码后，尽可能给出验证修改是否正确的步骤或命令。
6. **运行平台感知**：修改涉及运行平台相关功能时，务必同时考虑 **Electron 环境** 与 **Web 浏览器环境** 两种模式（通过 `runtimePlatform.ts` 的 `isElectron()` 区分）。

### 快速开发常用命令

```bash
# 启动开发模式（Electron 桌面端 + Vite 前端 + Django 后端）
npm run dev

# 纯 Web 开发（仅前端，方便不装 Electron 时调试）
npm run dev:web

# 手动启动 Django 后端
python django-app/manage.py runserver 5800

# 打包 Windows 安装程序
npm run dist:win
```

---
*注：本文件及 `agent_docs/` 目录专为 AI Agent 设计，旨在提供结构化的项目上下文。*
