# 桌面端开发指引 (Electron Guide)

## ⚠️ 重要架构变更

**Django 已完全移除**。Electron 不再启动或管理 Django 子进程。所有后端逻辑已收拢到 Electron 主进程的 Node.js IPC 后端中。

## 1. 架构定位

Electron 在本项目中**绝不仅仅是"壳"**，它承担着以下关键职责：

1. **窗口宿主**：提供独立的 BrowserWindow 加载 Vue 前端。
2. **Node.js IPC 后端**（`electron/backend/`）：承载所有后端逻辑，通过 IPC 与渲染进程通信，直接调用外部 AI API。
3. **本地数据库**（`electron/localdb/`）：better-sqlite3 SQLite 实例，承载项目、Meshy 任务、视频任务、ComfyUI 任务、导出任务、API 密钥等运行时数据（唯一事实来源）。
4. **dweb:// 项目资产协议**（`electron/backend/projectAssetProtocol.mjs`）：自定义协议让渲染端直接从磁盘读取项目静态资产，不经过任何 HTTP 通道。
5. **项目静态资产服务**（`electron/backend/projectStaticAssets/`）：upload / import / delete / resolve / repair / download / copy 等写操作的主进程实现。
6. **平台抽象层**（`electron/platform/`）：管理 Steam 等平台提供者，加载原生模块（如 `dweb_steamjs.node`），处理平台事件泵与 IPC。
7. **Python 环境引导安装**（`electron/static/bootstrap/`）：在缺失 Python 环境时调用 Windows / macOS 安装脚本（仅字幕等可选功能需要）。
8. **Python Bridge**（`electron/backend/python-bridge/`）：可选的 Python 工作进程桥接，用于计算密集型任务（非核心依赖）。
9. **诊断与日志收集**（`electron/backend/diagnostics.mjs`）：用户报错时可一键导出诊断信息。
10. **IPC 桥**（`electron/preload.mjs` + `src/electronBridge/index.ts` + `src/platformBridge/`）：通过 `contextBridge.exposeInMainWorld('dweb', ...)` 暴露给前端。
11. **Unreal HTTP 服务器**（`electron/backend/modules/agent-skills/`）：内置独立 HTTP 服务器用于 Unreal Engine 集成（默认随机端口）。

## 2. 进程通信 (IPC)

### 2.1 主进程（`electron/main.mjs`）
- **启动前**（`app.ready` 之前）：
  - `protocol.registerSchemesAsPrivileged([{ scheme: 'dweb', ... }])` 注册 dweb 协议为 privileged。
  - 调用 `platformPreflight()` 执行平台预检；若请求重启（需通过 Steam 客户端启动），则直接退出。
- `app.whenReady().then(...)` 内按顺序执行：
  1. 创建主 BrowserWindow
  2. 配置便携模式路径（检测安装目录是否可写）
  3. 初始化运行时日志与崩溃诊断
  4. `initLocalDb()` —— 初始化本地数据库（多路径回退）
  5. `platformInit()` —— 初始化平台层（加载原生模块、启动事件泵）
  6. `runSetupWorkflow()` —— 运行环境准备流程：
     - Python 环境检测（可选）
     - 创建资源目录（DVSResource/ 结构）
     - 初始化 Python Bridge（可选）
     - 检测 ffmpeg（可选）
  7. `initBackend(mainWindow, deps)` —— 初始化 Node.js IPC 后端（收集所有模块路由、注册 IPC 通道、启动 Unreal HTTP 服务器）
  8. `registerDwebProjectAssetProtocol()` —— 注册 dweb 协议处理器
  9. `registerLocalDbIpc()` —— 注册 LocalDB IPC
  10. `registerPlatformIpc()` —— 注册平台层 IPC
  11. 注册 `projectStaticAssets` 等其他 IPC
  12. `setMainWindowForPlatform(win)` —— 将主窗口绑定到平台层（用于 Overlay）
- 注册 `ipcMain.handle` 监听器（通过模块化注册函数和 backend router）。
- **退出时**：`platformShutdown()` → 关闭 Python Bridge → `shutdownBackend()` → 关闭 Unreal HTTP 服务器 → 关闭 LocalDB。

### 2.2 预加载脚本（`electron/preload.mjs`）
- 通过 `contextBridge.exposeInMainWorld` 暴露安全的 API 给前端，按命名空间组织：
  - `window.dweb.common.*`：应用信息、后端状态、设置、诊断、窗口控制、引导安装
  - `window.dweb.chat.*`：AI 对话（含流式通道）
  - `window.dweb.export.*`：导出服务
  - `window.dweb.editor.*`：编辑器后端
  - `window.dweb.comfyui.*`：ComfyUI 桥接
  - `window.dweb.thirdParty.*`：三方 API
  - `window.dweb.projects.*`：项目管理
  - `window.dweb.projectAssets.*`：项目资产
  - `window.dweb.meshy.*`：Meshy 3D
  - `window.dweb.seedance.*`：Seedance 视频
  - `window.dweb.agentSkills.*`：Agent Skills
  - `window.dweb.codex.*`：Codex/Copilot
  - `window.dweb.aiworkflow.*`：项目根注册、资产操作、资源管理器、图片标注、LocalDB 访问
  - `window.dweb.window.*`：最小化 / 最大化 / 重载 / DevTools
  - `window.dweb.platform.*`：平台能力（getStatus / getUser / getFriends / getInstalledDlcs / openOverlayUrl / activateGameOverlay / isDlcInstalled / onEvent 等）
  - 资源管理器窗口的 `onResourceManagerData` / `onResourceManagerEvent` / `onResourceManagerNotify` 系列监听器
- **注意**：不再注入 `window.__DWEB_BACKEND_BASE_URL`（因为不再有 HTTP 后端服务器）。

### 2.3 渲染进程（Vue）
- 通过 `src/electronBridge/index.ts` 封装调用，**不要**在组件中直接 `window.dweb.*`。
- 通过 `src/platformBridge/` 封装平台能力调用，**不要**在组件中直接 `window.dweb.platform.*`。
- 通过 `src/network/runtimePlatform.ts` 的 `isElectron()` 区分 Electron / Web 模式。
- 通过 `src/network/ipcClient.ts` 的 `ipcCall()` / `ipcStream()` 调用 IPC 后端，自动解包结果。
- 资产 URL 一律走 `src/network/backendConfig.ts` 的 `resolveBackendUrl()`，dweb:// 协议自动被 Electron 拦截。

## 3. Node.js IPC 后端（`electron/backend/`）—— 核心

### 3.1 架构概览

后端采用模块化设计，所有逻辑运行在 Electron 主进程中，通过 IPC 与前端通信：

- **入口**：`electron/backend/index.mjs`（`initBackend()` / `shutdownBackend()`）
- **路由**：`electron/backend/router.mjs`（`createRouter()` 统一注册 IPC 通道，自动错误包装、流处理支持）
- **上下文**：`electron/backend/context.mjs`（每个请求的上下文工厂，包含 mainWindow、repos、deps 等）
- **核心工具**（`electron/backend/core/`）：
  - `logger.mjs`：日志工具
  - `errors.mjs`：统一错误类型（UpstreamError、ValidationError、wrapError）
  - `http-client.mjs`：HTTP 客户端（支持普通请求 + SSE 流式请求，用于调用外部 API）
  - `sse-parser.mjs`：SSE 解析器
  - `stream.mjs`：IPC 流处理工具（创建三通道流处理器）
- **功能模块**（`electron/backend/modules/<name>/`）：每个模块遵循统一结构
  - `routes.mjs`：导出该模块的 IPC 路由列表
  - `handlers.mjs`：请求处理器实现
  - `service.mjs`：业务逻辑服务层（如需要）

### 3.2 后端模块列表

| 模块 | 路径 | 职责 |
| --- | --- | --- |
| system | `modules/system/` | 系统健康检查、迁移状态、诊断 |
| projects | `modules/projects/` | 项目 CRUD |
| project-assets | `modules/project-assets/` | 项目资产元数据 |
| chat | `modules/chat/` | AI 对话（外部 API 直连，流式） |
| codex | `modules/codex/` | Codex/Copilot CLI 集成（可选） |
| comfyui | `modules/comfyui/` | ComfyUI 桥接 |
| meshy | `modules/meshy/` | Meshy 3D 生成 |
| seedance | `modules/seedance/` | Seedance 视频生成 |
| third-party | `modules/third-party/` | 三方 API 统一网关 |
| editor | `modules/editor/` | 编辑器后端（组件库等） |
| export | `modules/export/` | 导出服务（ffmpeg 调用） |
| subtitle | `modules/subtitle/` | 字幕处理（部分通过 Python Bridge） |
| agent-skills | `modules/agent-skills/` | Agent Skills（含 Unreal HTTP 服务器） |

### 3.3 统一返回格式

所有 IPC handler 返回值遵循 `{ ok, value, error }` 格式（router 自动包装）：
- 成功：`{ ok: true, value: <数据> }`
- 失败：`{ ok: false, error: '错误消息' }`

前端通过 `src/network/ipcClient.ts` 的 `unwrapIpcResult()` 或 `ipcCall()` 自动解包。

### 3.4 流式响应（IPC Stream）

对于 AI 对话等需要流式输出的场景，使用 IPC 三通道模式：
1. 前端调用 `channel:stream` 启动流
2. 后端通过 `channel:data` 事件发送数据块（带 requestId）
3. 后端通过 `channel:end` 事件通知结束（带 requestId）
4. 出错时通过 `channel:error` 发送错误（带 requestId）

handler 使用异步生成器（`async function*`）实现，`core/stream.mjs` 的 `createStreamHandler` 自动处理通道事件。

详细规范请参阅 [04_BACKEND_GUIDE.md](04_BACKEND_GUIDE.md)。

## 4. 平台抽象层（`electron/platform/`）—— 核心模块

> 这一层为 Steam 等平台集成提供了统一抽象，通过 provider 模式支持多平台，Web/开发模式下自动降级为 Mock。

### 4.1 模块结构
- `index.mjs`：平台层入口
  - `platformPreflight()`：平台预检（app.ready 前调用，可能返回 'restart' 请求重启）
  - `platformInit()`：初始化所有已发现的 provider、启动事件泵
  - `platformShutdown()`：关闭所有 provider
  - `platformOverlayOpenUrl(url)`：通过平台 Overlay 打开 URL
  - `platformOverlayActivateGameOverlay(dialog)`：激活平台游戏 Overlay
  - `platformIsDlcInstalled(dlcAppId)`：检查 DLC 是否安装
  - `platformGetInstalledDlcs()`：获取已安装 DLC 列表
  - `registerPlatformIpc()`：注册平台 IPC 通道
  - `setMainWindowForPlatform(win)`：绑定主窗口供 Overlay 使用
- `manager.mjs`：平台管理器核心
  - `discover()`：发现可用 provider
  - `preflightAll()`：执行所有 provider 的预检
  - `initializeAll()`：初始化所有 provider
  - `startCallbackPump()`：启动事件回调泵（轮询原生模块事件）
  - `shutdownAll()`：关闭所有 provider
  - `getStatus()` / `getUser()` / `getFriends()` / `getInstalledDlcs()`：状态查询
- `providers/`：平台提供者实现
  - `mock.mjs`：Mock 提供者，无操作，用于 Web 模式或无平台环境
  - `steam.mjs`：Steam 平台提供者
    - 加载 `dweb_steamjs.node` 原生模块
    - 封装 Steamworks API 调用（初始化、用户信息、好友列表、DLC、Overlay）
    - 从原生模块回调泵接收事件
- `native/`：平台原生模块
  - `win32/`：Windows x64 平台二进制
    - `dweb_steamjs.node`：Steamworks Node.js 原生扩展（N-API）
    - `steam_api64.dll`：Steamworks 官方 DLL
    - `.manifest.json`：原生模块清单
  - 其他平台（macOS / Linux）暂未提供原生模块，自动回退到 Mock
- `config.mjs`：原生模块路径解析（按当前 OS / 架构查找正确的 .node / .dll / .dylib）
- `events.mjs`：平台事件类型定义
- `ipc.mjs`：平台 IPC 注册
  - 注册 `dweb:platform:*` 通道供前端调用
  - 推送平台事件到渲染进程
- `types.mjs`：平台类型定义（JSDoc）

### 4.2 启动时序
1. **app.ready 之前**：`platformPreflight()`
   - 管理器发现 provider（Steam 环境可用则选 steam，否则 mock）
   - 调用每个 provider 的 `preflight()`
   - Steam provider 检查是否通过 Steam 客户端启动；若不是且需要，则返回 'restart'
2. **app.whenReady 内**：`platformInit()`
   - 调用每个 provider 的 `initialize()`（Steam provider 加载并初始化原生模块）
   - 启动事件泵（`startCallbackPump()`），定时轮询原生模块事件
   - 打印初始化日志（激活平台名、用户名）
3. **创建窗口后**：`setMainWindowForPlatform(win)`
   - 将窗口句柄传给 provider，供 Steam Overlay 等功能使用
4. **运行时**：平台事件通过事件泵从原生模块 → provider → manager → IPC → 渲染进程
5. **退出时**：`platformShutdown()` 清理 provider 资源

### 4.3 Steam 开发环境设置
- 原生模块需通过 `npm run setup:steam` 从构建产物复制到正确位置
- 开发时使用 `npm run dev:electron`（已包含 Steam 设置步骤）
- 设置环境变量 `DWEB_STEAMJS_DEBUG=1` 可开启 Steam 原生模块调试日志
- Steam App ID 通过 `steam_appid.txt`（仓库根目录有 `steam_appid.txt.example`）配置

## 5. 本地数据库（`electron/localdb/`）—— 核心数据层

### 5.1 模块结构
- `db.mjs`：better-sqlite3 实例管理；带 ABI 错误友好提示（Electron / Node ABI 变化时）
- `index.mjs`：多路径回退初始化（`backendDataDir` → `userDataDir` → `tmpdir` → `homedir`）
- `migrations.mjs`：基于 `PRAGMA user_version` 的迁移（`TARGET_VERSION`，`runV<n>(db)` 函数）
- `json.mjs`：ISO ↔ 毫秒、可选 JSON 字段解析

### 5.2 仓库层（`electron/localdb/repos/`）
- `projects.mjs`：项目元数据 CRUD、`rootPath` / `projectUuid` / `manifestPath` / `storageVersion`
- `meshyTasks.mjs`：Meshy 3D 任务（task_id / status / progress / request_payload / response_payload）
- `videoTasks.mjs`：视频生成任务
- `comfyuiJobs.mjs`：ComfyUI 任务
- `exportJobs.mjs`：导出任务
- `apiKeys.mjs`：API 密钥（AES-256-GCM + PBKDF2，120k iterations；仅明文保存 `keyFingerprint`）

### 5.3 IPC 主机（`electron/localdb/ipc/`）
- `ipcHost.mjs`：注册 `dweb:localdb:*` 通道。所有 handler 由 `safe()` 包装，**LocalDB 未初始化时自动用 fallback 路径重试**，避免启动竞态。
- `djangoMigrate.mjs`：**迁移清理用** —— 从旧版 Django SQLite 迁移数据到 LocalDB（仅升级时使用，不用于日常运行）。

### 5.4 数据事实来源
- **LocalDB 是运行时唯一事实来源**。
- **不再有 Django SQLite 镜像**。
- 新增数据字段必须通过 LocalDB 迁移（`migrations.mjs`）添加。
- 后端模块通过 `ctx.repos` 访问 LocalDB；前端通过 `window.dweb.aiworkflow.db.*` IPC 访问。

## 6. dweb:// 项目资产协议

### 6.1 协议格式
```
dweb://project-assets?projectId=<id>&path=<rel>&variant=<v>&maxSize=<n>&v=<versionTag>
```

### 6.2 工作方式
- 渲染端把上述 URL 赋给 `<img src>` / `fetch()`。
- Electron 主进程的协议处理器（`electron/backend/projectAssetProtocol.mjs`）拦截该 URL，**不经过任何后端模块或 HTTP**，从磁盘读取并返回字节流。
- 同时可携带 `variant`（如 `thumb`）与 `maxSize`（128-4096 px）查询参数生成缩略图。
- `v` 是版本号标签（项目快照版本），避免浏览器缓存命中旧文件。

### 6.3 路径安全
- 拒绝绝对路径（`rel.startsWith('/')`）
- 拒绝 `..` 路径穿越（`rel.includes('..')`）
- 解析后必须位于项目根目录内
- MIME 推断按扩展名映射表

### 6.4 注册位置
- `electron/main.mjs`：`protocol.registerSchemesAsPrivileged([{ scheme: 'dweb', privileges: { standard, secure, supportFetchAPI, stream } }])`
- `electron/main.mjs`：`protocol.handle('dweb', handler)`（实际处理函数由 `registerDwebProjectAssetProtocol` 注入）

### 6.5 项目静态资产服务（`electron/backend/projectStaticAssets/`）
- `manifest.mjs`：项目 manifest（`{projectId, name, rootPath, assets, ...}`）读写
- `paths.mjs`：路径工具（安全 resolve、URL 构造、相对路径规范化）
- `service.mjs`：在主进程内直接提供 `uploadBufferProjectAsset` / `importUrlProjectAsset` / `importFileProjectAsset` / `deleteStaticProjectAsset` / `resolveStaticProjectAsset` / `repairAllProjectAssets` 等函数
- 这是 **Electron 模式下** 资产写操作的真实入口，前端通过 IPC 调用。

## 7. Python Bridge（`electron/backend/python-bridge/`）—— 可选组件

> Python Bridge 是可选组件，仅字幕等特定计算密集型功能依赖。核心功能（AI 对话、工作流、资产管理等）完全不依赖 Python。

### 7.1 模块结构
- `index.mjs` / `runtime.mjs`：Python 子进程管理（启动/停止/健康检查）
- `rpc.mjs`：Node.js ↔ Python RPC 通信（JSON-RPC over stdio）
- `pip.mjs`：pip 包管理（按需安装依赖）
- `scripts/`：Python 侧脚本
  - `worker.py`：Python worker 进程入口
  - `subtitle/`：字幕处理 Python 实现

### 7.2 Python 环境引导（`electron/static/bootstrap/`）

打包时通过 `package.json#build.extraResources` 复制到 `resources/static/bootstrap/`。

- `manifest.json`：声明当前内置的 Python 版本 / 安装方式
- `windows/install.cmd` / `windows/install.ps1`：Windows 平台 PowerShell 引导
- `mac/install.sh`：macOS 引导
- 由 `electron/backend/python.mjs` 在检测不到 Python 时调用
- **注意**：引导安装脚本仅在用户需要字幕等 Python 相关功能时才会触发，核心功能不需要 Python。

### 7.3 使用原则
1. 新增核心功能优先使用 Node.js 实现
2. 仅在必须使用 Python 特定库（如某些音频/视频处理库）时才使用 Python Bridge
3. Python 相关功能必须有优雅降级（Python 不可用时给出明确提示，不影响核心功能运行）

## 8. 运行时资源根目录

- **环境变量**: `DWEB_RESOURCE_DIR`
  - 开发模式默认：`DVSResource`（仓库内）
  - 生产模式默认：Electron `app.getPath('userData')`
  - 便携模式：安装目录可写时使用安装目录旁的 `DVSResource/`
- **LocalDB 文件路径**: `DWEB_RESOURCE_DIR/UserData/localdb.sqlite3`
- **用户设置**: `DWEB_RESOURCE_DIR/UserSettings/settings.json`
- **运行时日志**: `DWEB_RESOURCE_DIR/Logs/runtime.log`
- **后端数据**: `DWEB_RESOURCE_DIR/BackendData/`

> 便携模式检测：安装目录可写时自动启用便携模式；安装到 Program Files 等受保护目录时自动回退到用户目录。

## 9. 环境准备流程（Setup Workflow）

应用启动时自动运行环境准备流程（用户可在 `/welcome` 页面查看进度和重试）：

1. **Python 环境检测**（可选）：检测系统 Python >=3.11，缺失时在 Windows 下尝试 winget 自动安装
2. **创建资源目录**：创建 `DVSResource/` 目录结构（UserData、UserSettings、BackendData、Logs）
3. **初始化 Python Bridge**（可选）：如 Python 可用则初始化 Python 工作进程
4. **初始化 Node.js IPC 后端**：注册所有后端 IPC 模块路由，启动 Unreal HTTP 服务器
5. **检测 ffmpeg**（可选）：检测 ffmpeg 是否可用，不可用时仅影响视频导出

## 10. 关键文件位置速查

| 关注点 | 路径 |
| --- | --- |
| 主进程入口 | `electron/main.mjs` |
| 预加载脚本 | `electron/preload.mjs` |
| 公共配置 | `electron/config.mjs` |
| Node.js IPC 后端入口 | `electron/backend/index.mjs` |
| 后端路由注册 | `electron/backend/router.mjs` |
| 后端核心工具 | `electron/backend/core/`（logger/errors/http-client/sse-parser/stream） |
| 后端功能模块 | `electron/backend/modules/*/`（routes.mjs/handlers.mjs/service.mjs） |
| Python 环境检测 | `electron/backend/python.mjs` |
| Python Bridge（可选） | `electron/backend/python-bridge/` |
| 诊断收集 | `electron/backend/diagnostics.mjs` |
| dweb 协议 | `electron/backend/projectAssetProtocol.mjs` |
| 静态资产服务 | `electron/backend/projectStaticAssets/{manifest,paths,service}.mjs` |
| 本地 DB | `electron/localdb/{db,migrations,index,json}.mjs` |
| LocalDB 仓库 | `electron/localdb/repos/{projects,meshyTasks,videoTasks,comfyuiJobs,exportJobs,apiKeys}.mjs` |
| LocalDB IPC | `electron/localdb/ipc/{ipcHost,djangoMigrate}.mjs` |
| **平台抽象层入口** | `electron/platform/index.mjs` |
| **平台管理器** | `electron/platform/manager.mjs` |
| **平台 IPC** | `electron/platform/ipc.mjs` |
| **Steam 提供者** | `electron/platform/providers/steam.mjs` |
| **Mock 提供者** | `electron/platform/providers/mock.mjs` |
| **平台原生模块 (Win32)** | `electron/platform/native/win32/{dweb_steamjs.node,steam_api64.dll}` |
| Python 引导 | `electron/static/bootstrap/{windows,mac}/*` |
| Steam 设置脚本 | `scripts/setup-steam-dev.mjs` / `scripts/setup-steam-native.mjs` |
| better-sqlite3 重建脚本 | `scripts/rebuild-better-sqlite3.mjs` |

## 11. 禁止事项

1. **禁止启动 Django 子进程**：Django 已完全移除，不要添加任何启动 Django 的代码
2. **禁止添加 HTTP 后端服务器**：除了 Unreal 集成专用的 HTTP 服务器外，不要监听任何 HTTP 端口
3. **禁止在主进程内操作 DOM**：主进程不能访问 window/document
4. **禁止绕过平台抽象层**：所有平台相关功能必须通过 `electron/platform/` 访问
5. **禁止在主进程内做长耗时同步 IO**：使用异步操作
6. **禁止直接修改项目目录外的文件**：文件操作必须限制在项目根目录或 DVSResource 目录内
