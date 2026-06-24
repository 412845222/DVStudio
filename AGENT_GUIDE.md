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

**DVStudio (Dweb Video Studio)** 是一款面向视频创作的 AI 工作流工具。应用以 Electron 桌面端形式运行，在本地通过 Django 子进程提供 AI 对话与工作流推理能力。其核心由 AI 工作流蓝图、视频编辑器、本地资产数据库（LocalDB + dweb:// 协议）以及 AI 对话辅助四部分组成。

### 核心功能

1. **AI 工作流蓝图**：节点式编排（资源 → 剧情/分支 → ComfyUI / Meshy / 视频生成 → 输出媒体），单项目以「本地磁盘文件夹 + Electron LocalDB」共同存储
2. **视频编辑器**：舞台节点（矩形/文字/图片/线条）+ 时间轴关键帧 + AI 对话辅助
3. **Electron 本地资产数据库（核心层）**：`electron/localdb/`（better-sqlite3）统一管理项目、Meshy 任务、视频任务、API 密钥等本地数据
4. **dweb:// 项目资产协议**：`dweb://project-assets` 自定义协议让渲染进程直接从磁盘读取项目静态资产，绕过 Django HTTP 通道
5. **AI 对话集成**：Django 子进程 + GitHub Copilot CLI 首选、Codex 兼容，Django `StreamingHttpResponse` 实现 SSE 流式输出

### 技术栈

#### 前端（`src/`）
- **框架**：Vue 3（Composition API + `<script setup lang="ts">`）
- **语言**：TypeScript
- **构建**：Vite
- **状态管理**：Vuex（`aiworkflow` / `timeline` / `videoscene` / `videostudio` / `theme`）
- **渲染引擎**：自研 WebGL2 引擎（`src/engine/webgl/`）
- **路由**：Vue Router 4（Electron 下使用 Hash History，Web 下使用 HTML5 History）
- **运行平台感知**：`src/network/runtimePlatform.ts`（Electron / Web / Unknown）
- **后端地址解析**：`src/network/backendConfig.ts`（运行时注入优先于环境变量与 localStorage）
- **Electron 桥接**：`src/electronBridge/index.ts`（封装 `window.dweb.*`，含 `common` / `aiworkflow` / `videostudio` / `window` 命名空间）
- **运行环境**：Node.js `>=16`（来自 `package.json#engines`）

#### 后端（`django-app/`）
- **语言**：Python 3.11+
- **Web 框架**：Django 4.2.11 + Django REST Framework 3.14
- **AI 对话引擎**：GitHub Copilot CLI（首选，SSE 流式输出），Codex CLI（兼容备选）
- **SSE 实现**：Django 原生 `StreamingHttpResponse`（统一封装在 `dwebapp.ai.api.chat.utils._sse`）
- **数据库**：SQLite3（Django ORM，写入路径受 `DWEB_DATA_DIR` 环境变量控制）
- **关键 Apps**：`dwebapp`（核心 AI/凭证/法律/导出）、`codex_bridge`（Copilot/Codex 桥接）、`aiworkflow_project`（项目 + 资产）、`comfyui_bridge`（ComfyUI + **三方 API 共享实现库**）、`third_party_api_gateway`（**三方 API 网关新路由层**，挂在 `/api/third-party/`，包装 `comfyui_bridge.api` 中的实现）、`dvs_editor`（组件库）、`agentSkills`（场景理解/灯光/布局/Unreal 导出）、`dweb_models`（共享模型）

#### 桌面端（`electron/`）
- **框架**：Electron 33.x
- **本地数据库**：better-sqlite3（位于 `electron/localdb/`）
- **本地资产协议**：自定义协议 `dweb://project-assets`（在 `electron/main.mjs` 中以 `protocol.registerSchemesAsPrivileged` 注册，实现位于 `electron/backend/projectAssetProtocol.mjs`）
- **Python 引导安装**：`electron/static/bootstrap/`（macOS / Windows 平台的 Python 安装脚本，由 `electron/backend/django.mjs` 在缺环境时调用）
- **打包工具**：electron-builder（Windows → NSIS，macOS → DMG/ZIP）
- **进程通信**：IPC（`electron/preload.mjs` 通过 `contextBridge.exposeInMainWorld('dweb', ...)` 注入）
- **关键模块**：
  - `electron/localdb/`：本地数据库（db/migrations/repos/ipc）
  - `electron/backend/`：Django 进程管理 + dweb 协议 + 静态资产服务 + Python 环境检测
  - `electron/config.mjs`：项目根目录、Django 目录、窗口图标路径解析
  - `electron/static/bootstrap/`：Python 引导安装脚本

### 关键架构模块

#### 1. 前端 — Electron 运行平台三层
- `src/network/runtimePlatform.ts`：运行平台检测（Electron / Web / Unknown），单一事实来源
- `src/network/backendConfig.ts`：后端地址解析
  - **Electron 模式优先级**：`window.__DWEB_BACKEND_BASE_URL`（preload 注入）→ `localStorage` → `VITE_BACKEND_BASE_URL`（构建环境变量）→ 默认 `http://127.0.0.1:5800`
  - **Web 模式优先级**：`window.__DWEB_BACKEND_BASE_URL` → `VITE_BACKEND_BASE_URL` → `localStorage` → 默认
  - Electron 下 `localStorage` 在 `__DWEB_BACKEND_BASE_URL` 之后，是为了让 preload 注入的实时后端地址总能覆盖历史值
- `src/electronBridge/index.ts`：Electron IPC 桥接，按命名空间拆分：
  - `common`：后端地址/状态、设置、setup、诊断、窗口控制、引导安装
  - `aiworkflow`：项目/资源/Meshy/Video 任务、本地 DB、API 密钥、图片标注、资源管理器窗口
  - `videostudio`：导出目录选择等视频工作室特有能力
  - `window`：最小化/最大化/重载/开发者工具

#### 2. Electron 本地资产与任务数据库（`electron/localdb/`）
- `db.mjs` / `index.mjs`：SQLite 实例管理 + 多路径回退初始化（`backendDataDir` → `userDataDir` → `tmpdir` → `homedir`）
- `migrations.mjs`：数据库结构迁移（基于 `PRAGMA user_version`，向前兼容）
- `json.mjs`：JSON 序列化辅助（ISO ↔ 毫秒、可选 JSON 字段）
- `repos/projects.mjs`：项目仓库（CRUD、从文件夹打开、UUID、根路径）
- `repos/meshyTasks.mjs`：Meshy 3D 任务仓库
- `repos/videoTasks.mjs`：视频生成任务仓库
- `repos/apiKeys.mjs`：API 密钥仓库（AES-256-GCM + PBKDF2 本地对称加密，仅保存 fingerprint 明文）
- `ipc/ipcHost.mjs`：本地数据库 IPC 主机（前端 → 主进程数据访问通道，所有调用 `safe()` 包装）
- `ipc/djangoMigrate.mjs`：Django 迁移辅助 IPC（由主进程发起 `python manage.py migrate`）

#### 3. 项目资产协议（`electron/backend/projectAssetProtocol.mjs` + `projectStaticAssets/service.mjs`）
- 自定义 Electron 协议：`dweb://project-assets?projectId=<id>&path=<rel>&variant=<v>&maxSize=<n>&v=<versionTag>`
- 工作方式：渲染进程通过 `dweb://` URL 直接命中主进程协议处理器，**绕过 Django HTTP 通道**，从磁盘读取项目内的静态资产
- 路径安全：拒绝绝对路径、拒绝 `..` 路径穿越、强制解析后的相对路径在项目根目录内
- 配套服务（`projectStaticAssets/service.mjs`）：在主进程内直接调用 `projectAssetProtocol.mjs` 的 `upload/import/delete/resolve/repair/download/copy` 等函数，**取代 Django 的 assets 写操作**
- Django 侧 `aiworkflow_project/assets/api.py` 仍保留实现，但不再通过 `urls.py` 暴露（仅 `assets/health` 暴露），主要供未来 Web 模式或内部单元测试使用

#### 4. Copilot CLI 服务（`django-app/codex_bridge/`）
- `services/copilot_cli.py`：Copilot 可执行文件路径解析（支持本地 `node_modules/@github/copilot`、`npx`、nvm、Scoop、WinGet 等多种安装路径）
- `services/orchestrator.py`：`CodexOrchestrator` 统一编排 CodeX/Copilot 桥接
- `views.py`：对话会话管理、SSE 流式输出、health_check、workspace_references
- 注意：Codex CLI 仍保留为可选后端（`CODEX_*` 环境变量），Copilot CLI 为默认（`COPILOT_CLI_*`）

#### 5. Django 资产 API（`django-app/aiworkflow_project/`）
- `assets/api.py`：上传/导入/删除/解析/修复等实现（当前主要被 `projectStaticAssets/service.mjs` 调用，不通过 `urls.py` 暴露给前端）
- `projects/api.py` + `projects/storage.py`：项目清单、保存/加载/删除/从文件夹打开
- `models.py`：`BlueprintProject`（Django ORM 镜像，与 LocalDB 中 `projects` 表对应）

#### 6. 三方 API 网关（双层结构）
- **共享实现库**：`django-app/comfyui_bridge/api.py` —— 包含 Meshy / Seedance / NanoBanana / SeeDream / 即梦（Jimeng）等**所有三方服务的实现函数**（`_meshy_cfg` / `_seedance_cfg` / `_jimeng_signed_post` 等），**不再直接挂载三方 API 路由**
- **新路由层**：`django-app/third_party_api_gateway/` —— 包装共享实现库中的函数，通过 `urls.py` 暴露为 HTTP 端点（`/api/third-party/...`）
- **模型**：`MeshyTaskMirror` + `VideoGenerationTaskMirror` 定义在 `django-app/third_party_api_gateway/models.py`
- **路由前缀**：
  - ComfyUI 与项目 CRUD：`/api/workflow/`（来自 `comfyui_bridge/urls.py`）
  - 三方 API 网关：`/api/third-party/`（来自 `third_party_api_gateway/urls.py`）
- **新增三方 API 接入**统一在 `third_party_api_gateway/` 添加新 URL + View 实现，复用 `comfyui_bridge.api` 中的实现函数

### 前后端通信模型

- **Electron 主进程**（`electron/main.mjs`）
  - 启动并守护 Django Python 子进程（`electron/backend/django.mjs`）
  - 承载本地数据库（better-sqlite3，`electron/localdb/`）
  - 注册 `dweb://project-assets` 自定义协议
  - 加载并运行 `electron/static/bootstrap/` 中的 Python 引导安装脚本
  - 通过 IPC（`electron/preload.mjs` → `window.dweb.*`）向前端暴露本地数据库与项目操作能力
- **前端渲染进程**（`src/`）
  - 通过 `window.dweb.*` 桥接调用本地数据库与本地资产管理（`src/electronBridge/index.ts`）
  - 通过 HTTP/SSE 访问 Django REST API（`src/network/*Service.ts`）
  - 通过 SSE 接收 Copilot CLI 流式对话输出（`src/network/AIChatService.ts`）
  - 路由层（`src/router/index.ts`）：
    - `/welcome`：启动/环境检查页（`src/views/WelCome.vue`，注意命名拼写）
    - `/`：项目列表（`src/views/ProjectList.vue`）
    - `/workflow`：AI 工作流蓝图（`src/views/AIWorkflow.vue` → `src/views/AIWorkflow/AIWorkflowPage.vue`）
    - `/studio`：视频编辑器（`src/views/VideoStudio.vue`）
    - `/settings`：应用设置（`src/views/Settings.vue`）
    - `/image-markup-preview`：图片标注预览（`src/views/ImageMarkupPreviewPage.vue`）
    - `/resource-manager`：资源管理器窗口（`src/views/AIWorkflow/ResourceManagerWindow.vue`）

## 🤖 Agent 行为准则

1. **先阅读，后修改**：在修改任何代码前，请先阅读相关模块的 `agent_docs/` 指引文档。
2. **遵守边界**：严格遵守前后端分离边界，不要在前端直接处理需要后端处理的重逻辑，反之亦然。
3. **保持一致性**：遵循现有的代码风格（Vue 3 的 `<script setup>` + TypeScript、Django 的 App 结构、ESLint/Prettier 规范）。
4. **最小化修改**：只修改与当前任务直接相关的文件，避免过度重构。
5. **测试验证**：在提供代码后，尽可能给出验证修改是否正确的步骤或命令。
6. **运行平台感知**：修改涉及运行平台相关功能时，务必同时考虑 **Electron 环境** 与 **Web 浏览器环境** 两种模式（通过 `runtimePlatform.ts` 的 `isElectron()` 区分）。
7. **本地数据双轨**：LocalDB（`electron/localdb/`）是「运行时事实来源」，Django SQLite（`comfyui_blueprint_project` 等表）是「迁移期镜像」。**新增项目字段必须先写 LocalDB 表迁移**。
8. **资产 URL 一律走 `backendConfig.ts` 的 `resolveBackendUrl()`**：在渲染端不要硬编码 `http://127.0.0.1:5800`，以便 Electron 模式与 Web 模式复用同一套代码路径。

### 快速开发常用命令

```bash
# 启动开发模式（Electron 桌面端 + Vite 前端 + Django 后端）
npm run dev

# 纯 Web 开发（仅前端，方便不装 Electron 时调试）
npm run dev:web

# 手动启动 Django 后端
python django-app/manage.py runserver 5800

# 启动 Django + Vite（macOS，.venv 在上上级目录）
npm run start:dev:mac

# 重新编译 better-sqlite3 原生模块（Electron ABI 变化后）
npm run install:better-sqlite3

# 类型检查 / Lint / 单元测试
npm run typecheck
npm run lint
npm run test
npm run quality   # 上面三项一起跑

# 打包 Windows 安装程序
npm run dist:win

# 打包 macOS（生成 zip + dmg）
npm run dist:mac
```

### 关键工程文件位置速查

| 关注点 | 路径 |
| --- | --- |
| 前端入口 | `index.html` → `src/main.ts` → `src/App.vue` |
| 路由表 | `src/router/index.ts` |
| Vuex store 入口 | `src/store/index.ts`（目前仅 re-export `./videostudio`） |
| Vuex store 模块 | `src/store/{aiworkflow,timeline,videoscene,videostudio,theme}/store.ts` |
| 运行平台检测 | `src/network/runtimePlatform.ts` |
| 后端地址解析 | `src/network/backendConfig.ts` |
| Electron 桥接 | `src/electronBridge/index.ts`（前端侧）/ `electron/preload.mjs`（注入侧） |
| Electron 主进程 | `electron/main.mjs` |
| dweb:// 协议实现 | `electron/backend/projectAssetProtocol.mjs` |
| 项目静态资产服务 | `electron/backend/projectStaticAssets/{manifest,paths,service}.mjs` |
| 本地数据库 | `electron/localdb/{db,migrations,index,json}.mjs` + `electron/localdb/repos/*.mjs` |
| LocalDB IPC | `electron/localdb/ipc/{ipcHost,djangoMigrate}.mjs` |
| Django 进程管理 | `electron/backend/{django,djangoProject,python,runtimeCleanup}.mjs` |
| Python 引导安装脚本 | `electron/static/bootstrap/{windows,mac}/*` |
| Django 设置 | `django-app/dwebsite/settings.py`（`DWEB_DATA_DIR` 控制数据目录） |
| Django 入口 | `django-app/dwebsite/urls.py` |

---
*注：本文件及 `agent_docs/` 目录专为 AI Agent 设计，旨在提供结构化的项目上下文。*
