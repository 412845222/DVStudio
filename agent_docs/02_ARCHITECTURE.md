# 系统架构 (Architecture)

## ⚠️ 重要架构变更（2026-06）

**Django 依赖已完全移除**。项目后端已从「Django 子进程 + HTTP 服务器」架构重构为「纯 Electron 主进程 Node.js IPC 后端」架构：

- 不再启动 Django 子进程，不再监听 HTTP 端口
- 所有后端逻辑通过 Electron IPC（`ipcMain.handle` / `ipcRenderer.invoke`）通信
- 流式输出使用 IPC 三通道模式（`:stream` / `:data` / `:end` / `:error`）
- Python 仅作为可选 Bridge 用于特定计算任务（如字幕处理），非核心依赖
- 外部 AI API（DeepSeek、Gemini、Meshy、Seedance 等）直接在 Electron 主进程通过内置 HTTP 客户端调用
- LocalDB（better-sqlite3）是唯一数据事实来源，不再有 Django SQLite 镜像

## 1. 全栈架构

DVStudio 采用 **前端 (Vue 3 + WebGL2) + 平台桥接层 (Platform Bridge) + 后端 (Electron Node.js IPC) + 桌面端壳 (Electron + LocalDB + dweb:// 协议 + Platform Abstraction)** 的多层架构。

- **前端 (Frontend)**: 负责 UI 渲染、WebGL2 画布绘制、状态管理 (Vuex)、用户交互；通过 Electron IPC 桥访问本地能力与后端服务，通过平台桥接层访问 Steam 等平台能力。
- **平台桥接层 (Platform Bridge)**: `src/platformBridge/` 提供前端侧的平台能力抽象（Steam 等），通过 Electron IPC 与主进程平台层通信，Web 模式下自动降级为 Mock。
- **后端 (Backend)**: 运行在 Electron 主进程的 Node.js IPC 后端，负责 AI 接口代理（DeepSeek/Gemini/Meshy/Seedance 等外部 API 直连）、IPC 流式对话、组件库、Agent Skills（场景理解/灯光/布局/Unreal 导出）、项目数据持久化、ComfyUI 桥接、导出服务、字幕处理。
- **桌面端 (Desktop)**: Electron 主进程承担多重职责——
  - 承载 Node.js IPC 后端（`electron/backend/`）
  - 承载本地 SQLite 数据库（`electron/localdb/`）
  - 注册 `dweb://project-assets` 自定义协议直接读取项目资产
  - 提供 Python 环境检测与可选 Python Bridge 支持
  - **平台抽象层**（`electron/platform/`）：管理 Steam 等平台提供者，加载原生模块，处理平台事件泵
  - 通过 IPC（`window.dweb.*`）向前端暴露本地能力与平台能力
  - 内置 Unreal HTTP 服务器（用于 Unreal Engine 集成）

## 2. 核心目录结构

```text
DVStudio/
├── src/                          # 前端源码 (Vue 3 + TS)
│   ├── adapters/                 # 适配层（编辑器/工作流持久化、事件桥）
│   ├── ai/                       # AI 模型定义（chatModels.ts）
│   ├── aiworkflow/               # AI 工作流核心（types / actions / nodeLibrary / resource / persistence）
│   ├── assets/                   # 静态资源（vue.svg 等）
│   ├── composables/              # Vue 组合式函数（useCardParticles / useSquareParticles / useStartupProgress / useSteamHotkeys / useSteamPanel）
│   ├── core/                     # 核心业务（scene / project / history / events / components / agentToUI / studio / subtitle / timeline / shared）
│   │   ├── scene/
│   │   │   ├── commands/         # 场景命令（interaction / lines / moveNode / nodes / overlay / selection / snap）
│   │   │   │   └── snap/         # 吸附命令（axis / context / moveSession / resizeSession）
│   │   │   └── nodesType/        # 节点类型（NodeBase / RectNode / TextNode / ImageNode / LineNode）
│   ├── electronBridge/           # Electron IPC 桥接封装（index.ts + types.ts，按命名空间拆分）
│   ├── engine/                   # WebGL2 渲染引擎（canvas / scene / renderers / shaders / texture / camera / picking / pipeline / material / resources）
│   │   ├── canvas/
│   │   ├── material/             # 基础 2D shader 与圆角矩形/蒙版材质
│   │   ├── renderers/            # 渲染器（BaseRenderer / NodeRenderer / RectRenderer / TextRenderer / ImageRenderer / LineRenderer）
│   │   ├── resources/            # 资源管理（DwebImagePool 图片池等）
│   │   ├── scene/                # 场景管理（DwebVideoScene）
│   │   └── shaders/              # 着色器（postBlur 模糊）
│   ├── network/                  # API 服务封装 + IPC 客户端
│   │   ├── ipcClient.ts          # IPC 统一客户端（ipcCall / ipcStream / unwrapIpcResult）
│   │   ├── AIChatService.ts      # AI 对话（流式 IPC）
│   │   ├── AICredentialService.ts # API 凭证管理
│   │   ├── ComfyUIBridgeService.ts # ComfyUI 桥接
│   │   ├── BlueprintProjectService.ts # 项目保存/加载
│   │   ├── ComponentLibraryService.ts # 组件库
│   │   ├── ExportService.ts      # 导出任务
│   │   ├── UnrealExportService.ts # Unreal 导出
│   │   ├── LegalDocService.ts    # 法律文档
│   │   ├── LocalExecChatService.ts # 本地执行型对话
│   │   ├── SceneSkillService.ts  # Agent Skills
│   │   ├── SubtitleAIService.ts  # 字幕 AI
│   │   ├── backendConfig.ts      # 配置 + resolveBackendUrl()
│   │   ├── runtimePlatform.ts    # 运行平台检测（electron/web/unknown）
│   │   └── blueprintRequestLog.ts # 请求日志
│   ├── platformBridge/           # 平台桥接层（index / platform / usePlatform / useSteamEntry / types）
│   ├── router/                   # Vue Router 4 路由表
│   ├── store/                    # Vuex 状态（aiworkflow / timeline / videoscene / videostudio / theme）
│   ├── styles/                   # 全局样式（theme-tokens / workflow 子样式）
│   ├── types/                    # TypeScript 类型定义（electron-bridge.d.ts / three-rect-area-light.d.ts）
│   ├── ui/                       # UI 组件库
│   │   ├── AIChat/               # AI 对话（AIChatDialog）
│   │   ├── BluePrint/            # 工作流画布（BlueprintCanvas + node-dialog/）
│   │   ├── Electron/             # Electron 启动环境（CommandConsole / EnvCheckList）
│   │   ├── Steam/                # Steam 组件（SteamFriendsList / SteamPanel 等）
│   │   ├── TimeLine/             # 时间轴（TimeLine + components/ + core/）
│   │   ├── UIComponent/          # 通用 UI（GlobalTitleBar / GlobalSideNav / ModalDialog / ToastStack 等）
│   │   ├── User/                 # 用户组件（UserAvatar / UserButton / UserMenu）
│   │   ├── VideoScene/           # 视频场景编辑器（VideoScene + anim/ + panels/ + parts/ + ruler/）
│   │   └── WorkFlow/             # 工作流 UI（WorlFlowNodes/ + WorkflowNodeBase / WorkflowEdgeLayer 等）
│   ├── views/                    # 页面级组件
│   │   ├── AIWorkflow.vue        # 工作流页面（包装器）
│   │   ├── AIWorkflow/           # 工作流页面实现（assets / blueprint-core / bridge / concurrency / network / node-business / node-screenshot / ui）
│   │   ├── ImageMarkupPreviewPage.vue
│   │   ├── ProjectList.vue
│   │   ├── Settings.vue
│   │   ├── VideoStudio.vue
│   │   └── WelCome.vue           # 注意命名拼写：WelCome（历史遗留）
│   ├── workers/                  # Web Workers（exportRenderUploadWorker / exportUploadWorker）
│   ├── App.vue
│   ├── main.ts                   # 入口
│   └── vite-env.d.ts
│
├── electron/                     # 桌面端源码 (Electron 33.x, ESM .mjs)
│   ├── main.mjs                  # 主进程入口（注册 dweb 协议、平台预检、环境准备、初始化 LocalDB、初始化平台层、初始化 Node.js IPC 后端）
│   ├── preload.mjs               # 预加载脚本（contextBridge.exposeInMainWorld('dweb', ...)，按命名空间暴露所有 IPC API）
│   ├── config.mjs                # APP_NAME / getRepoRoot / getAppRoot / getWindowIconPath 等公共配置
│   ├── platform/                 # 平台抽象层（核心模块）
│   │   ├── manager.mjs           # 平台管理器（discover / preflight / initialize / shutdown / 事件泵）
│   │   ├── providers/            # 平台提供者
│   │   │   ├── mock.mjs          # Mock 提供者（开发/Web 模式降级）
│   │   │   └── steam.mjs         # Steam 平台提供者
│   │   ├── native/               # 平台原生模块
│   │   │   └── win32/            # Windows 原生（dweb_steamjs.node + steam_api64.dll）
│   │   ├── config.mjs            # 原生模块路径配置
│   │   ├── events.mjs            # 平台事件类型
│   │   ├── ipc.mjs               # 平台 IPC 注册
│   │   ├── index.mjs             # 平台层入口（platformPreflight / platformInit / platformShutdown）
│   │   └── types.mjs             # 平台类型定义
│   ├── backend/                  # Node.js IPC 后端（核心）
│   │   ├── index.mjs             # 后端入口（initBackend / shutdownBackend，收集所有模块路由）
│   │   ├── router.mjs            # IPC 路由注册器（createRouter，统一错误包装、流处理）
│   │   ├── context.mjs           # 请求上下文工厂（mainWindow / repos / deps）
│   │   ├── diagnostics.mjs       # 诊断信息收集
│   │   ├── python.mjs            # Python 环境检测（系统 / 引导安装）
│   │   ├── runtimeCleanup.mjs    # 旧运行时清理
│   │   ├── projectAssetProtocol.mjs # dweb:// 协议处理器（直接读取磁盘）
│   │   ├── core/                 # 核心工具库
│   │   │   ├── logger.mjs        # 日志工具
│   │   │   ├── errors.mjs        # 统一错误类型（UpstreamError / ValidationError / wrapError）
│   │   │   ├── http-client.mjs   # HTTP 客户端（普通请求 + SSE 流式请求）
│   │   │   ├── sse-parser.mjs    # SSE 解析器
│   │   │   └── stream.mjs        # IPC 流处理工具（三通道模式）
│   │   ├── modules/              # 功能模块（按业务域划分）
│   │   │   ├── system/           # 系统健康检查、迁移状态、诊断
│   │   │   ├── projects/         # 项目 CRUD
│   │   │   ├── project-assets/   # 项目资产元数据
│   │   │   ├── chat/             # AI 对话（外部 API 直连，流式）
│   │   │   ├── codex/            # Codex/Copilot CLI 集成（可选）
│   │   │   ├── comfyui/          # ComfyUI 桥接
│   │   │   ├── meshy/            # Meshy 3D 生成
│   │   │   ├── seedance/         # Seedance 视频生成
│   │   │   ├── third-party/      # 三方 API 统一网关（NanoBanana / SeeDream / 即梦等）
│   │   │   ├── editor/           # 编辑器后端（组件库等）
│   │   │   ├── export/           # 导出服务（ffmpeg 调用）
│   │   │   ├── subtitle/         # 字幕处理（部分通过 Python Bridge）
│   │   │   └── agent-skills/     # Agent Skills（场景理解/灯光/布局/Unreal 导出，含内置 Unreal HTTP 服务器）
│   │   ├── projectStaticAssets/  # 项目静态资产服务（写操作）
│   │   │   ├── manifest.mjs
│   │   │   ├── paths.mjs
│   │   │   └── service.mjs
│   │   └── python-bridge/        # Python Bridge（可选，非核心）
│   │       ├── index.mjs
│   │       ├── runtime.mjs
│   │       ├── rpc.mjs
│   │       ├── pip.mjs
│   │       └── scripts/          # Python 侧脚本
│   ├── localdb/                  # 本地 SQLite 数据库（better-sqlite3，唯一事实来源）
│   │   ├── db.mjs                # better-sqlite3 实例管理 + ABI 错误友好提示
│   │   ├── index.mjs             # 多路径回退初始化（backendDataDir → userDataDir → tmpdir → homedir）
│   │   ├── migrations.mjs        # 基于 PRAGMA user_version 的迁移
│   │   ├── json.mjs              # JSON / ISO ↔ 毫秒 辅助
│   │   ├── repos/                # 仓库层
│   │   │   ├── projects.mjs      # 项目仓库
│   │   │   ├── meshyTasks.mjs    # Meshy 任务仓库
│   │   │   ├── videoTasks.mjs    # 视频任务仓库
│   │   │   ├── comfyuiJobs.mjs   # ComfyUI 任务仓库
│   │   │   ├── exportJobs.mjs    # 导出任务仓库
│   │   │   └── apiKeys.mjs       # API 密钥仓库（AES-256-GCM + PBKDF2 加密）
│   │   └── ipc/
│   │       ├── ipcHost.mjs       # 前端 → LocalDB IPC 主机
│   │       └── djangoMigrate.mjs # Django 数据迁移辅助（仅用于迁移清理）
│   └── static/                   # 静态资源（打包时复制到 extraResources）
│       └── bootstrap/            # Python 引导安装脚本（可选）
│           ├── manifest.json
│           ├── windows/
│           └── mac/
│
├── samples/                      # 示例文件
├── scripts/                      # 工具脚本（dist-win / dist-mac / perf 分析 / better-sqlite3 rebuild / steam setup）
├── public/                       # 公共资源
├── .githooks/                    # Git hooks（pre-push）
├── build/                        # 打包图标与安装程序资源
├── DVSResource/                  # 运行时资源根（开发模式默认，便携模式数据目录）
├── index.html                    # Vite 入口
├── package.json                  # 前端 + Electron 依赖与脚本
├── AGENT_GUIDE.md                # AI Agent 总入口
├── agent_docs/                   # AI Agent 详细文档
└── README.md
```

## 3. 数据流转机制

### 3.1 通用流程
1. **用户交互**: 用户在 Vue 组件中触发操作。
2. **状态更新**: 组件调用 Vuex Action/Mutation 更新全局状态，或调用 `ref/reactive` 更新组件局部状态；平台事件（如 Steam 好友状态变化）通过平台桥接层回写到 Vuex。
3. **渲染更新**: 状态变更驱动 Vue 响应式 UI 更新，或触发 WebGL2 引擎重新渲染。
4. **后端通信**: 需要 AI 辅助或持久化时，通过 `src/network/` 中的 Service 调用 Electron IPC 后端（不再使用 HTTP）。
5. **本地能力**: 需要读写本地文件、访问本地 DB、调用原生窗口能力时，通过 `window.dweb.*` 桥接调用 Electron 主进程能力。
6. **平台能力**: 需要访问 Steam 等平台特有功能时，通过 `src/platformBridge/` → `window.dweb.platform.*` 调用主进程平台层。

### 3.2 后端 IPC 通信流程
1. 前端 Service 调用 `src/network/ipcClient.ts` 的 `ipcCall()` 或流方法。
2. `ipcClient` 通过 `window.dweb.<namespace>.<method>()` 调用 preload 暴露的 IPC invoke。
3. preload 脚本通过 `ipcRenderer.invoke()` 发送到主进程。
4. 主进程 `electron/backend/router.mjs` 路由到对应模块的 handler。
5. handler 通过 `ctx.repos` 访问 LocalDB，或通过 `core/http-client.mjs` 调用外部 API。
6. 普通请求：handler 返回结果，router 自动包装为 `{ ok: true, value: result }`。
7. 流式请求：handler 是异步生成器，通过三通道模式（`:data` / `:end` / `:error`）发送数据块。
8. 前端 `ipcClient` 自动解包结果或处理流，返回给 Service 层。

### 3.3 项目资产加载（dweb:// 协议）
1. 前端从项目元数据中拿到 `projectId` 与 `path`（项目内相对路径）。
2. 构造 URL `dweb://project-assets?projectId=<id>&path=<rel>` 并赋给 `<img src>` / `fetch()`。
3. Electron 主进程的协议处理器（`projectAssetProtocol.mjs`）拦截该 URL，**不经过任何后端模块**，直接从磁盘读取并返回。
4. 写操作（upload/import/delete/repair）由前端通过 `window.dweb.projectAssets.*` IPC 调用主进程 `projectStaticAssets/service.mjs`，在主进程内直接落盘。

### 3.4 本地数据库访问
1. 前端通过 `window.dweb.aiworkflow.db.*` 或后端模块通过 `ctx.repos.*` 访问 LocalDB。
2. `ipcHost.mjs` 中按 channel 路由到对应的 repo（`repos/projects.mjs` / `repos/meshyTasks.mjs` / `repos/videoTasks.mjs` / `repos/apiKeys.mjs` / `repos/comfyuiJobs.mjs` / `repos/exportJobs.mjs`）。
3. 仓库层封装 SQL，序列化时把 `TEXT` 字段的 ISO 时间戳 / 可选 JSON 解析回原始 JS 形态。
4. 所有 IPC handler 由 `safe()` 包装：若 LocalDB 尚未初始化，**自动用 fallback 路径重试**，避免启动竞态。
5. **LocalDB 是唯一事实来源**，不再有 Django SQLite 镜像。

### 3.5 平台能力调用
1. 前端通过 `src/platformBridge/` 的 composable（`usePlatform` / `useSteamEntry`）访问平台状态。
2. 底层通过 `window.dweb.platform.*` IPC 通道与主进程通信。
3. 主进程 `electron/platform/ipc.mjs` 路由到平台管理器（`manager.mjs`）。
4. 平台管理器将调用委派给当前激活的 provider（`steam.mjs` 或 `mock.mjs`）。
5. Steam provider 通过原生模块（`dweb_steamjs.node`）调用 Steamworks API。
6. 平台事件（如好友上线、Overlay 激活）通过事件泵（callback pump）从原生模块转发到 IPC，再推送到前端。

## 4. 运行平台与 IPC 可用性检测

- `src/network/runtimePlatform.ts`：检测 `electron` / `web` / `unknown`。
- `src/network/ipcClient.ts`：检测 IPC 模块可用性
  - `hasIpcApi()`：检测 `window.dweb` 是否存在
  - `hasIpcModule(namespace)`：检测特定命名空间是否可用
  - `ipcCall<T>()`：调用 IPC 方法并自动解包 `{ ok, value, error }` 格式
  - `ipcStream<T>()`：调用流式 IPC 方法，返回异步生成器
- `src/platformBridge/platform.ts`：平台提供者检测
  - **Electron + Steam**：激活 `steam` provider
  - **其他**：激活 `mock` provider（无操作，不影响核心功能）
- 资产 URL 一律走 `resolveBackendUrl(pathOrUrl)`：
  - `dweb://` / `blob:` / `data:` 原样返回
  - `http(s)://` 绝对 URL 原样返回
  - Web 模式下：相对路径直接返回（依赖 Vite dev server 代理或同源部署）
  - Electron 模式下：相对路径通过 IPC 后端处理（迁移期兼容）

## 5. IPC 通道命名规范与后端模块路由表

所有 IPC 通道遵循 `dweb:<module>:<action>` 命名规范：

| 模块 | Channel 前缀 | 职责 | 核心 Channels |
| --- | --- | --- | --- |
| system | `dweb:system:` | 系统健康检查、诊断 | `ping`, `migration-checklist` |
| projects | `dweb:projects:` | 项目 CRUD | `list`, `save`, `load`, `delete`, `open-folder` |
| project-assets | `dweb:project-assets:` | 项目资产元数据 | `list`, `get-metadata` |
| chat | `dweb:chat:` | AI 对话（流式） | `sendMessage` (stream), `listModels` |
| codex | `dweb:codex:` | Codex/Copilot CLI（可选） | `sendMessage` (stream) |
| comfyui | `dweb:comfyui:` | ComfyUI 桥接 | `submit`, `status`, `result` |
| meshy | `dweb:meshy:` | Meshy 3D 生成 | `submit`, `status`, `download` |
| seedance | `dweb:seedance:` | Seedance 视频生成 | `submit`, `status` |
| third-party | `dweb:third-party:` | 三方 API 网关 | 统一入口 |
| editor | `dweb:editor:` | 编辑器后端 | `component-library:list`, `component-library:save` |
| export | `dweb:export:` | 导出服务 | `submit`, `status` |
| subtitle | `dweb:subtitle:` | 字幕处理 | `parse`, `format`, `ai-understand` (stream) |
| agent-skills | `dweb:agent-skills:` | Agent Skills | `scene-understand` (stream), `layout`, `unreal-export` |
| localdb | `dweb:localdb:` | LocalDB 直接访问 | `projects:list`, `meshy:get`, `api-keys:set` 等 |
| platform | `dweb:platform:` | 平台能力 | `get-status`, `get-user`, `get-friends`, `open-overlay-url` |
| common | `dweb:common:` | 通用能力 | `get-app-info`, `get-backend-status`, `open-devtools` |
| aiworkflow | `dweb:aiworkflow:` | 工作流相关 | `register-project-root`, `upload-asset`, `open-resource-manager` |
| window | `dweb:window:` | 窗口控制 | `minimize`, `maximize`, `reload`, `toggle-devtools` |

> **流式通道**：标记为 `stream: true` 的通道使用三通道模式，前端通过 `*:stream` invoke 启动流，然后通过 `window.dweb.*.on*Data/on*End/on*Error` 事件接收数据。

## 6. Electron 主进程职责与启动时序（`electron/main.mjs`）

### 6.1 启动时序（简化）

1. **app.ready 之前**：
   - `protocol.registerSchemesAsPrivileged([{ scheme: 'dweb', ... }])` 注册 dweb 协议为 privileged。
   - **平台预检**：调用 `platformPreflight()`；若返回 `restart`（需要通过 Steam 客户端启动），则退出当前进程。

2. **app.whenReady().then(...) 内按顺序执行**：
   - 创建主窗口（BrowserWindow）
   - 配置便携模式路径（检测安装目录是否可写）
   - 初始化运行时日志与崩溃诊断
   - **初始化 LocalDB**（`initLocalDb`）—— 多路径回退，创建/迁移数据库
   - **初始化平台层**（`platformInit()`）—— 加载原生模块、启动事件泵
   - **运行环境准备流程**（`runSetupWorkflow()`）：
     - Python 环境检测（可选）
     - 创建资源目录（DVSResource/ 结构）
     - 初始化 Python Bridge（可选）
     - 检测 ffmpeg（可选）
   - **初始化 Node.js IPC 后端**（`initBackend(mainWindow, deps)`）—— 收集所有模块路由、注册 IPC 通道、启动 Unreal HTTP 服务器
   - 注册 dweb 协议处理器（`registerDwebProjectAssetProtocol`）
   - 注册 LocalDB IPC（`registerLocalDbIpc`）
   - 注册平台层 IPC（`registerPlatformIpc`）
   - 注册项目静态资产等其他 IPC
   - **绑定主窗口到平台层**（`setMainWindowForPlatform(win)`）—— 用于 Overlay 等需要窗口句柄的功能

3. **退出时**：
   - 平台关闭（`platformShutdown()`）
   - 关闭 Python Bridge（如已启动）
   - 关闭 Node.js IPC 后端（`shutdownBackend()`）
   - 关闭 Unreal HTTP 服务器
   - 关闭 LocalDB

### 6.2 环境准备流程（Setup Workflow）

应用启动时自动运行的环境准备步骤（用户可在 `/welcome` 页面查看进度和重试）：

1. **Python 环境检测**（可选）：检测系统 Python >=3.11，缺失时在 Windows 下尝试 winget 自动安装
2. **创建资源目录**：创建 `DVSResource/` 目录结构（UserData、UserSettings、BackendData、Logs）
3. **初始化 Python Bridge**（可选）：如 Python 可用则初始化 Python 工作进程
4. **初始化 Node.js IPC 后端**：注册所有后端 IPC 模块路由
5. **检测 ffmpeg**（可选）：检测 ffmpeg 是否可用，不可用时仅影响视频导出

## 7. 前后端通信模型总结

| 场景 | 通信方式 | 关键模块 |
| --- | --- | --- |
| 普通后端调用（非流式） | IPC invoke / handle | `src/network/ipcClient.ts` → `electron/backend/router.mjs` → 模块 handler |
| AI 对话 / 流式输出 | IPC 三通道流模式 | `core/stream.mjs` → `preload.mjs` 事件转发 → `ipcClient.ts` 异步生成器 |
| 项目资产读取（图片/视频等） | dweb:// 自定义协议 | `electron/backend/projectAssetProtocol.mjs`（直接读磁盘） |
| 项目资产写操作（上传/导入/删除） | IPC invoke | `electron/backend/projectStaticAssets/service.mjs` |
| 本地数据持久化 | LocalDB IPC | `electron/localdb/ipc/ipcHost.mjs` → repos |
| 平台能力（Steam 等） | Platform IPC | `electron/platform/ipc.mjs` → manager → provider |
| 窗口控制 | IPC invoke | `electron/main.mjs` 注册的 window 通道 |
| 外部 AI API 调用 | 主进程 HTTP 客户端 | `electron/backend/core/http-client.mjs`（在 handler 内部调用） |
| Unreal Engine 集成 | 内置 HTTP 服务器 | `electron/backend/modules/agent-skills/service.mjs`（启动独立 HTTP 服务器） |

## 8. 关键约束与边界

1. **无 HTTP 后端服务器**：除了 Unreal 集成专用的 HTTP 服务器外，后端不监听任何 HTTP 端口。
2. **LocalDB 唯一事实来源**：所有运行时数据存储在 LocalDB（better-sqlite3），不再有 Django SQLite 镜像。
3. **IPC 为唯一前后端通信方式**：Electron 模式下前端不直接发起 HTTP 请求到 localhost（迁移期兼容代码除外）。
4. **dweb:// 协议只读**：项目资产的读操作走 dweb:// 协议，写操作必须通过 IPC。
5. **Python Bridge 可选**：Python 仅用于字幕等特定计算密集型任务，核心功能不依赖 Python。
6. **平台抽象层强制**：所有平台相关功能必须通过 `src/platformBridge/`（前端）和 `electron/platform/`（主进程）访问，禁止直接耦合平台 SDK。
7. **模块化后端**：新增后端功能必须在 `electron/backend/modules/` 下创建新模块，遵循 routes/handlers/service 结构规范。
