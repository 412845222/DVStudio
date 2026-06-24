# 系统架构 (Architecture)

## 1. 全栈架构

DVStudio 采用 **前端 (Vue 3 + WebGL2) + 后端 (Django) + 桌面端壳 (Electron + LocalDB + dweb:// 协议)** 的三层架构。

- **前端 (Frontend)**: 负责 UI 渲染、WebGL2 画布绘制、状态管理 (Vuex)、用户交互；通过 Electron IPC 桥访问本地能力，通过 HTTP 访问 Django 后端。
- **后端 (Backend)**: 负责 AI 接口代理（Copilot CLI / Codex CLI / Meshy / Seedance / 即梦 / SeeDream / NanoBanana）、SSE 流式对话、组件库、Agent Skills（场景理解/灯光/布局/Unreal 导出）、项目数据持久化。
- **桌面端 (Desktop)**: Electron 主进程承担多重职责——
  - 启动并守护 Django Python 子进程
  - 承载本地 SQLite 数据库（`electron/localdb/`）
  - 注册 `dweb://project-assets` 自定义协议
  - 提供 Python 环境检测与引导安装
  - 通过 IPC（`window.dweb.*`）向前端暴露本地能力

## 2. 核心目录结构

```text
DVStudio/
├── src/                          # 前端源码 (Vue 3 + TS)
│   ├── adapters/                 # 适配层（编辑器/工作流持久化、事件桥）
│   ├── ai/                       # AI 模型定义（chatModels.ts）
│   ├── aiworkflow/               # AI 工作流核心（types / actions / nodeLibrary / resource / domain / persistence）
│   ├── assets/                   # 静态资源（vue.svg 等）
│   ├── composables/              # Vue 组合式函数（useCardParticles / useSquareParticles / useStartupProgress）
│   ├── core/                     # 核心业务（scene / project / history / events / components / agentToUI / studio / subtitle / timeline / shared）
│   ├── electronBridge/           # Electron IPC 桥接封装（index.ts + types.ts）
│   ├── engine/                   # WebGL2 渲染引擎（canvas / scene / renderers / shaders / texture / camera / picking / pipeline / material / resources / postprocess）
│   ├── network/                  # API 服务封装（AIChatService / ComfyUIBridgeService / BlueprintProjectService / ComponentLibraryService / ExportService / SceneSkillService / SubtitleAIService / UnrealExportService / LegalDocService / LocalExecChatService / AICredentialService / runtimePlatform / backendConfig / blueprintRequestLog）
│   ├── router/                   # Vue Router 4 路由表
│   ├── store/                    # Vuex 状态（aiworkflow / timeline / videoscene / videostudio / theme）
│   ├── styles/                   # 全局样式（theme-tokens / workflow 子样式）
│   ├── types/                    # TypeScript 类型定义（electron-bridge.d.ts / three-rect-area-light.d.ts）
│   ├── ui/                       # UI 组件库（AIChat / BluePrint / TimeLine / UIComponent / VideoScene / WorkFlow）
│   ├── views/                    # 页面级组件
│   │   ├── AIWorkflow.vue        # 工作流页面（包装器，内部委托给 AIWorkflow/AIWorkflowPage.vue）
│   │   ├── AIWorkflow/           # 工作流页面实现（assets / blueprint-core / bridge / concurrency / network / node-business / ui 等子目录）
│   │   ├── ImageMarkupPreviewPage.vue
│   │   ├── ProjectList.vue
│   │   ├── Settings.vue
│   │   ├── VideoStudio.vue
│   │   └── WelCome.vue           # 注意命名拼写：WelCome（历史遗留）
│   ├── workers/                  # Web Workers（exportRenderUploadWorker / exportUploadWorker）
│   ├── App.vue
│   ├── main.ts                   # 入口
│   ├── style.css
│   ├── vite-env.d.ts
│   └── vite-env-three.d.ts
│
├── django-app/                   # 后端源码 (Django 4.2.11)
│   ├── dwebapp/                  # 核心 App（AI 对话 / 凭证 / 法律文档 / 导出 / Agent Skills）
│   │   ├── ai/                   # AI 子模块
│   │   │   ├── api/              # REST API（chat / subtitle_understanding）
│   │   │   ├── skills/           # 提示词 + Skill 脚本（palette / subtitle / component_template / outline_style / conversation_component / video_gui / protocol）
│   │   │   ├── credentials_store.py
│   │   │   └── _md_prompts.py
│   │   ├── export_api.py
│   │   ├── legal_api.py
│   │   ├── dweb_apis.py
│   │   ├── dweb_urls.py
│   │   ├── models.py             # ApiKeySecret 等
│   │   ├── urls.py
│   │   ├── views.py
│   │   └── user_agreement_and_security.md
│   ├── aiworkflow_project/       # AI 工作流项目后端
│   │   ├── assets/               # 资产 API（api.py / tests.py）
│   │   ├── projects/             # 项目 API（api.py / storage.py / tests.py）
│   │   ├── models.py
│   │   ├── urls.py
│   │   └── apps.py
│   ├── codex_bridge/             # Copilot CLI / Codex CLI 桥接
│   │   ├── services/             # copilot_cli.py / codex.py / orchestrator.py
│   │   ├── management/commands/  # codex_smoke_test.py
│   │   ├── smoke_reports/        # 历史 smoke 测试报告
│   │   ├── views.py
│   │   ├── models.py             # ChatSession / ChatMessage
│   │   ├── migrations/
│   │   └── urls.py
│   ├── comfyui_bridge/           # ComfyUI 桥接 + 共享实现库（comfyui_bridge.api 同时被 third_party_api_gateway 复用）
│   │   ├── api.py                # 包含 ComfyUI、Meshy、Seedance、NanoBanana、SeeDream、即梦等共享实现函数
│   │   ├── models.py             # BlueprintProject（comfyui_blueprint_project）
│   │   ├── urls.py               # 仅暴露 ComfyUI + 项目 CRUD + 资产 local 端点
│   │   └── migrations/
│   ├── dvs_editor/               # 视频编辑器后端支持（组件库）
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── component_library.py   # 列表/创建/详情/导入
│   │   ├── models.py             # ComponentLibraryItem (UUID PK, JSONField template)
│   │   ├── urls.py
│   │   ├── apps.py
│   │   ├── admin.py
│   │   ├── tests.py
│   │   └── migrations/
│   ├── agentSkills/              # 场景理解 / 灯光 / 布局 / Unreal 导出
│   │   ├── skills/               # sceneLayoutSkill / sceneUnderstandSkill 子目录
│   │   ├── unreal_export.py
│   │   ├── views.py
│   │   ├── urls.py
│   │   └── models.py
│   ├── third_party_api_gateway/  # 三方 API 网关新路由层（挂在 /api/third-party/）
│   │   ├── api.py                # 包装 comfyui_bridge.api 中的共享实现并暴露为 HTTP 路由
│   │   ├── views.py              # 占位（无业务逻辑）
│   │   ├── urls.py               # /api/third-party/ 下所有路由
│   │   ├── models.py             # MeshyTaskMirror + VideoGenerationTaskMirror（实际定义）
│   │   ├── admin.py
│   │   ├── tests.py
│   │   ├── apps.py
│   │   └── migrations/
│   ├── dweb_models/              # DBVision 自动生成的模型
│   │   └── models.py
│   ├── dwebsite/                 # Django 项目设置
│   │   ├── settings.py           # DWEB_DATA_DIR 控制数据目录
│   │   ├── urls.py               # 根 URL 路由
│   │   ├── wsgi.py
│   │   └── asgi.py
│   ├── scripts/                  # 运维脚本
│   │   └── check_db_tables.py
│   ├── manage.py
│   └── requirements.txt
│
├── electron/                     # 桌面端源码 (Electron 33.x)
│   ├── main.mjs                  # 主进程入口（注册 dweb 协议、启动 Django、初始化 LocalDB）
│   ├── preload.mjs               # 预加载脚本（contextBridge.exposeInMainWorld('dweb', ...)）
│   ├── config.mjs                # APP_NAME / getRepoRoot / getDjangoAppDir / getWindowIconPath
│   ├── backend/                  # Django 进程管理 + 协议 + 静态资产 + Python 环境
│   │   ├── django.mjs            # spawn / kill Django runserver；端口选择；健康检查
│   │   ├── djangoProject.mjs     # 运行时项目脚手架 / 依赖安装
│   │   ├── python.mjs            # Python 环境检测（系统 / .venv / 引导安装）
│   │   ├── diagnostics.mjs       # 诊断信息收集
│   │   ├── runtimeCleanup.mjs    # 旧运行时项目清理
│   │   ├── projectAssetProtocol.mjs  # dweb:// 协议处理器
│   │   └── projectStaticAssets/  # 项目静态资产管理
│   │       ├── manifest.mjs
│   │       ├── paths.mjs
│   │       └── service.mjs
│   ├── localdb/                  # 本地 SQLite 数据库（核心新增层）
│   │   ├── db.mjs                # better-sqlite3 实例管理 + ABI 错误友好提示
│   │   ├── index.mjs             # 多路径回退初始化（backendDataDir → userDataDir → tmpdir → homedir）
│   │   ├── migrations.mjs        # 基于 PRAGMA user_version 的迁移
│   │   ├── json.mjs              # JSON / ISO ↔ 毫秒 辅助
│   │   ├── repos/                # 仓库层
│   │   │   ├── projects.mjs      # 项目仓库
│   │   │   ├── meshyTasks.mjs    # Meshy 任务仓库
│   │   │   ├── videoTasks.mjs    # 视频任务仓库
│   │   │   └── apiKeys.mjs       # API 密钥仓库（AES-256-GCM + PBKDF2）
│   │   └── ipc/
│   │       ├── ipcHost.mjs       # 前端 → LocalDB IPC 主机
│   │       └── djangoMigrate.mjs # Django 迁移辅助 IPC
│   └── static/                   # 静态资源（打包时复制到 extraResources）
│       └── bootstrap/            # Python 引导安装脚本
│           ├── manifest.json
│           ├── windows/          # install.cmd / install.ps1 / README.md
│           └── mac/              # install.sh / README.md
│
├── samples/                      # 示例文件（component template / editor snapshot / project package）
├── scripts/                      # 工具脚本（dist-win / dist-mac / perf 分析 / copilot smoke / better-sqlite3 rebuild）
├── public/                       # 公共资源（favicon.ico / logo.png）
├── coverage/                     # 测试覆盖率报告（vitest）
├── docs/                         # （可选）用户文档
├── .githooks/                    # Git hooks（pre-push）
├── build/                        # 打包图标（icon.ico）
├── DVSResource/                  # 运行时资源根（开发模式默认指向仓库内，生产指向 AppData）
├── index.html                    # Vite 入口
├── package.json                  # 前端 + Electron 依赖与脚本
├── package-lock.json
├── AGENT_GUIDE.md                # AI Agent 总入口
├── agent_docs/                   # AI Agent 详细文档（与本文件同级）
├── README.md
├── LICENSE
└── TRANSFER_MANIFEST.txt
```

## 3. 数据流转机制

### 3.1 通用流程
1. **用户交互**: 用户在 Vue 组件中触发操作。
2. **状态更新**: 组件调用 Vuex Action/Mutation 更新全局状态，或调用 `ref/reactive` 更新组件局部状态。
3. **渲染更新**: 状态变更驱动 Vue 响应式 UI 更新，或触发 WebGL2 引擎重新渲染。
4. **后端通信**: 需要 AI 辅助或持久化时，通过 `src/network/` 中的 Service 调用 Django API（SSE 流式或普通 HTTP）。
5. **本地能力**: 需要读写本地文件、访问本地 DB、调用原生窗口能力时，通过 `window.dweb.*` 桥接调用 Electron 主进程能力。

### 3.2 项目资产加载（dweb:// 协议）
1. 前端从项目元数据中拿到 `projectId` 与 `path`（项目内相对路径）。
2. 构造 URL `dweb://project-assets?projectId=<id>&path=<rel>` 并赋给 `<img src>` / `fetch()`。
3. Electron 主进程的协议处理器（`projectAssetProtocol.mjs`）拦截该 URL，**不经过 Django**，直接从磁盘读取并返回。
4. 写操作（upload/import/delete/repair）由前端通过 `window.dweb.aiworkflow.uploadProjectAsset` 等 IPC 调用主进程 `projectStaticAssets/service.mjs`，在主进程内直接落盘。

### 3.3 本地数据库访问
1. 前端通过 `window.dweb.aiworkflow.db.*` 调用 LocalDB IPC。
2. `ipcHost.mjs` 中按 channel 路由到对应的 repo（`repos/projects.mjs` / `repos/meshyTasks.mjs` / `repos/videoTasks.mjs` / `repos/apiKeys.mjs`）。
3. 仓库层封装 SQL，序列化时把 `TEXT` 字段的 ISO 时间戳 / 可选 JSON 解析回原始 JS 形态。
4. 所有 handler 由 `safe()` 包装：若 LocalDB 尚未初始化，**自动用 fallback 路径重试**，避免启动竞态。

## 4. 运行平台与后端地址解析

- `src/network/runtimePlatform.ts`：检测 `electron` / `web` / `unknown`。
- `src/network/backendConfig.ts`：后端地址解析
  - **Electron**：`window.__DWEB_BACKEND_BASE_URL`（preload 注入）→ `localStorage` → `VITE_BACKEND_BASE_URL` → `http://127.0.0.1:5800`
  - **Web**：`window.__DWEB_BACKEND_BASE_URL` → `VITE_BACKEND_BASE_URL` → `localStorage` → `http://127.0.0.1:5800`
- 资产 URL 一律走 `resolveBackendUrl(pathOrUrl)`：
  - `dweb://` / `blob:` / `data:` 原样返回
  - `http(s)://` 绝对 URL 原样返回
  - Web 模式下：相对路径直接返回（依赖 Vite dev server 代理或同源部署）
  - Electron 模式下：相对路径拼上 `baseUrl`

## 5. Django URL 路由一览（`django-app/dwebsite/urls.py`）

> ⚠️ **三/四方 API 网关存在"双层路由"**：
> - `comfyui_bridge/api.py` 提供了 Meshy / Seedance / NanoBanana / SeeDream / Jimeng / Blueprint chat 等大量**实现函数**（共享实现库）；
> - 这些函数**同时被** `comfyui_bridge/urls.py`（旧路由层，**已不再导出三方 API 路由**）和 `third_party_api_gateway/urls.py`（新路由层，挂在 `/api/third-party/`）调用。
> - 新增三方 API 接入统一走 `third_party_api_gateway/`。

| 路径 | 来源 | 用途 |
| --- | --- | --- |
| `/admin/` | Django Admin | |
| `/api/health/` / `/api/echo/` | `dwebapp.urls`（含 `dwebapp.dweb_urls` 自动生成的等价端点） | 健康检查 / echo（双层共存：legacy + 工具生成） |
| `/api/legal/...` | `dwebapp.urls` | 法律 / 协议文档 |
| `/api/ai/credentials/...` | `dwebapp.urls` | 加密凭证 |
| `/api/chat/...` | `dwebapp.urls` | AI 对话会话（SSE 流式） |
| `/api/ai/subtitle/...:stream` | `dwebapp.urls` | 字幕理解 / 调色板 / 模板（SSE） |
| `/api/export/...` | `dwebapp.urls` | 导出任务（SSE + raw 上传） |
| `/api/editor/component-library/...` | `dvs_editor.urls` | 视频编辑器组件库（CRUD / 导入 / 缩略图） |
| `/api/workflow/projects/...` | `aiworkflow_project.urls` | 项目 CRUD + 资产健康检查 |
| `/api/workflow/` | `comfyui_bridge.urls` | **ComfyUI**：ping / run / cancel / job / outputs / projects（不再挂载三方 API） |
| `/api/workflow/codex/` | `codex_bridge.urls` | Codex CLI 会话（兼容） |
| `/api/workflow/copilot/` | `codex_bridge.urls` | GitHub Copilot CLI 会话（首选） |
| `/api/agent-skills/...` | `agentSkills.urls` | 场景理解 / 灯光 / 布局 / Unreal 导出 |
| `/api/third-party/...` | `third_party_api_gateway.urls` | **三方 API 网关**：Meshy / Seedance / NanoBanana / SeeDream / Jimeng / Blueprint chat stream |

## 6. Electron 主进程职责（`electron/main.mjs`）

启动时序（简化）：
1. `protocol.registerSchemesAsPrivileged([{ scheme: 'dweb', ... }])` 注册 dweb 协议为 privileged。
2. `app.whenReady().then(...)` 内：
   - 初始化 LocalDB（`initLocalDb`）
   - 启动 Django 子进程（`startDjangoServer`）
   - 注册 dweb 协议处理器（`registerDwebProjectAssetProtocol`）
   - 注册 IPC 处理器（`registerLocalDbIpc`、`projectStaticAssets` 等）
3. 退出时：清理 Django 进程、关闭 LocalDB。
