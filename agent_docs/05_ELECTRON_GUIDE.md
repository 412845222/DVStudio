# 桌面端开发指引 (Electron Guide)

## 1. 架构定位

Electron 在本项目中**绝不仅仅是"壳"**，它承担着以下关键职责：

1. **窗口宿主**：提供独立的 BrowserWindow 加载 Vue 前端。
2. **后端进程管理**：启动 / 守护 / 重启 Django Python 子进程（端口 5800，可被自动分配替换）。
3. **本地数据库**（`electron/localdb/`）：better-sqlite3 SQLite 实例，承载项目、Meshy 任务、视频任务、API 密钥等运行时数据。
4. **dweb:// 项目资产协议**（`electron/backend/projectAssetProtocol.mjs`）：自定义协议让渲染端绕过 Django 直接读取项目静态资产。
5. **项目静态资产服务**（`electron/backend/projectStaticAssets/`）：upload / import / delete / resolve / repair / download / copy 等写操作的主进程实现。
6. **平台抽象层**（`electron/platform/`）：管理 Steam 等平台提供者，加载原生模块（如 `dweb_steamjs.node`），处理平台事件泵与 IPC。
7. **Python 环境引导安装**（`electron/static/bootstrap/`）：在缺失 Python 环境时调用 Windows / macOS 安装脚本。
8. **诊断与日志收集**（`electron/backend/diagnostics.mjs`）：用户报错时可一键导出诊断信息。
9. **IPC 桥**（`electron/preload.mjs` + `src/electronBridge/index.ts` + `src/platformBridge/`）：通过 `contextBridge.exposeInMainWorld('dweb', ...)` 暴露给前端。

## 2. 进程通信 (IPC)

### 2.1 主进程（`electron/main.mjs`）
- **启动前**（`app.ready` 之前）：
  - `protocol.registerSchemesAsPrivileged([{ scheme: 'dweb', ... }])` 注册 dweb 协议为 privileged。
  - 调用 `platformPreflight()` 执行平台预检；若请求重启（需通过 Steam 客户端启动），则直接退出。
- `app.whenReady().then(...)` 内按顺序执行：
  1. `initLocalDb()` —— 初始化本地数据库
  2. `platformInit()` —— 初始化平台层（加载原生模块、启动事件泵）
  3. `startDjangoServer()` —— 启动 Django 子进程
  4. `registerDwebProjectAssetProtocol()` —— 注册 dweb 协议处理器
  5. `registerLocalDbIpc()` —— 注册 LocalDB IPC
  6. `registerPlatformIpc()` —— 注册平台层 IPC
  7. 注册 `projectStaticAssets` 等其他 IPC
  8. 创建主 BrowserWindow
  9. `setMainWindowForPlatform(win)` —— 将主窗口绑定到平台层（用于 Overlay）
- 注册 `ipcMain.handle` 监听器（通过模块化注册函数）。
- 启动 Django 子进程并健康检查；启动失败时尝试 fallback 端口。
- **退出时**：`platformShutdown()` → `killExistingDjangoRunservers()` → 关闭 LocalDB。

### 2.2 预加载脚本（`electron/preload.mjs`）
- 通过 `contextBridge.exposeInMainWorld` 暴露安全的 API 给前端：
  - `window.dweb.common.*`：后端 / 设置 / setup / 诊断 / 窗口 / 引导
  - `window.dweb.aiworkflow.*`：项目 / 资源 / LocalDB / 任务 / API 密钥 / 图片标注 / 资源管理器
  - `window.dweb.videostudio.*`：导出目录
  - `window.dweb.window.*`：最小化 / 最大化 / 重载 / DevTools
  - `window.dweb.platform.*`：平台能力（getStatus / getUser / getFriends / getInstalledDlcs / openOverlayUrl / activateGameOverlay / isDlcInstalled / onEvent 等）
  - 资源管理器窗口的 `onResourceManagerData` / `onResourceManagerEvent` / `onResourceManagerNotify` 系列监听器
  - 注入 `window.__DWEB_BACKEND_BASE_URL`（实时后端地址）

### 2.3 渲染进程（Vue）
- 通过 `src/electronBridge/index.ts` 封装调用，**不要**在组件中直接 `window.dweb.*`。
- 通过 `src/platformBridge/` 封装平台能力调用，**不要**在组件中直接 `window.dweb.platform.*`。
- 通过 `src/network/runtimePlatform.ts` 的 `isElectron()` 区分 Electron / Web 模式。
- 资源 URL 一律走 `src/network/backendConfig.ts` 的 `resolveBackendUrl()`。

## 3. 平台抽象层（`electron/platform/`）—— 核心新增模块

> 这一层为 Steam 等平台集成提供了统一抽象，通过 provider 模式支持多平台，Web/开发模式下自动降级为 Mock。

### 3.1 模块结构
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

### 3.2 启动时序
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

### 3.3 Steam 开发环境设置
- 原生模块需通过 `npm run setup:steam` 从 `scripts/setup-steam-native.mjs` 复制到正确位置
- 开发时使用 `npm run dev:electron`（已包含 Steam 设置步骤）
- 设置环境变量 `DWEB_STEAMJS_DEBUG=1` 可开启 Steam 原生模块调试日志
- Steam App ID 通过 `steam_appid.txt`（仓库根目录有 `steam_appid.txt.example`）配置

## 4. 本地数据库（`electron/localdb/`）—— 核心数据层

### 4.1 模块结构
- `db.mjs`：better-sqlite3 实例管理；带 ABI 错误友好提示（Electron / Node ABI 变化时）
- `index.mjs`：多路径回退初始化（`backendDataDir` → `userDataDir` → `tmpdir` → `homedir`）
- `migrations.mjs`：基于 `PRAGMA user_version` 的迁移（`TARGET_VERSION`，`runV<n>(db)` 函数）
- `json.mjs`：ISO ↔ 毫秒、可选 JSON 字段解析

### 4.2 仓库层（`electron/localdb/repos/`）
- `projects.mjs`：项目元数据 CRUD、`rootPath` / `projectUuid` / `manifestPath` / `storageVersion`
- `meshyTasks.mjs`：Meshy 3D 任务（task_id / status / progress / request_payload / response_payload）
- `videoTasks.mjs`：视频生成任务
- `apiKeys.mjs`：API 密钥（AES-256-GCM + PBKDF2，120k iterations；仅明文保存 `keyFingerprint`）

### 4.3 IPC 主机（`electron/localdb/ipc/`）
- `ipcHost.mjs`：注册 `dweb:localdb:*` 通道。所有 handler 由 `safe()` 包装，**LocalDB 未初始化时自动用 fallback 路径重试**，避免启动竞态。
- `djangoMigrate.mjs`：在 Electron 启动 / 升级时调用 `python manage.py migrate`。

### 4.4 与 Django SQLite 的关系
- LocalDB 是**运行时事实来源**。
- Django SQLite（`comfyui_blueprint_project` 等表）是**迁移期镜像**。
- **不要**在两边都写迁移脚本；新功能默认先写 LocalDB。

## 5. dweb:// 项目资产协议

### 5.1 协议格式
```
dweb://project-assets?projectId=<id>&path=<rel>&variant=<v>&maxSize=<n>&v=<versionTag>
```

### 5.2 工作方式
- 渲染端把上述 URL 赋给 `<img src>` / `fetch()`。
- Electron 主进程的协议处理器（`electron/backend/projectAssetProtocol.mjs`）拦截该 URL，**不经过 Django**，从磁盘读取并返回字节流。
- 同时可携带 `variant`（如 `thumb`）与 `maxSize`（128-4096 px）查询参数生成缩略图。
- `v` 是版本号标签（项目快照版本），避免 CDN/浏览器缓存命中旧文件。

### 5.3 路径安全
- 拒绝绝对路径（`rel.startsWith('/')`）
- 拒绝 `..` 路径穿越（`rel.includes('..')`）
- 解析后必须位于项目根目录内
- MIME 推断按扩展名映射表

### 5.4 注册位置
- `electron/main.mjs`：`protocol.registerSchemesAsPrivileged([{ scheme: 'dweb', privileges: { standard, secure, supportFetchAPI, stream } }])`
- `electron/main.mjs`：`protocol.handle('dweb', handler)`（实际处理函数由 `registerDwebProjectAssetProtocol` 注入）

### 5.5 项目静态资产服务（`electron/backend/projectStaticAssets/`）
- `manifest.mjs`：项目 manifest（`{projectId, name, rootPath, assets, ...}`）读写
- `paths.mjs`：路径工具（安全 resolve、URL 构造、相对路径规范化）
- `service.mjs`：在主进程内直接调用 `projectAssetProtocol.mjs` 的 `uploadBufferProjectAsset` / `importUrlProjectAsset` / `importFileProjectAsset` / `deleteStaticProjectAsset` / `resolveStaticProjectAsset` / `repairAllProjectAssets` 等函数
- 这是 **Electron 模式下** 资产写操作的真实入口

### 5.6 Web 模式降级
- 纯 Web 开发时（`npm run dev:web`），渲染端用 `fetch` 访问 Django 的 `assets/health` 等仅剩的端点；
- Django 侧的 `aiworkflow_project/assets/api.py` 仍保留实现，但**大部分端点不再通过 `urls.py` 暴露**（仅 `assets/health`），主要供未来 Web 模式或单元测试使用。

## 6. Django 进程管理（`electron/backend/`）

- `django.mjs`：`startDjangoServer` / `waitForBackendReady` / `pickBackendPort` / `killExistingDjangoRunservers` / `collectDiagnostics`
- `djangoProject.mjs`：`copyDjangoTemplateToRuntime` / `syncDjangoTemplateToRuntime` / `ensureRuntimeDjangoProjectScaffold` / `ensureRuntimeRequirements` / `sanitizeRuntimeDjangoDir`
- `python.mjs`：`detectPythonInfo` —— 探测系统 Python / .venv / 引导安装
- `runtimeCleanup.mjs`：`cleanupOldRuntimeProject` —— 清理旧版本运行时项目
- `diagnostics.mjs`：`collectDiagnostics` —— 收集诊断信息（含 Django log、Electron log、本地 DB 状态、平台状态等）

> **进程退出**：在 Electron 退出时，必须正确 kill 掉 Django 进程（`killExistingDjangoRunservers`），避免孤儿进程占用端口 (5800) 与资源。

## 7. Python 引导安装（`electron/static/bootstrap/`）

打包时通过 `package.json#build.extraResources` 复制到 `resources/static/bootstrap/`。

- `manifest.json`：声明当前内置的 Python 版本 / 安装方式
- `windows/install.cmd` / `windows/install.ps1`：Windows 平台 PowerShell 引导
- `mac/install.sh`：macOS 引导
- 由 `electron/backend/django.mjs` 在检测不到 Python 时调用
- 内置 Python 运行时位于 `electron/static/runtime/python-win32-x64/`（Windows），打包时复制到 `resources/runtime/`

## 8. 运行时资源根目录

- **环境变量**: `DWEB_RESOURCE_DIR`
  - 开发模式默认：`DVSResource`（仓库内）
  - 生产模式默认：Electron `app.getPath('userData')`
- **LocalDB 文件路径**: `DWEB_RESOURCE_DIR/localdb.sqlite3`（由 `electron/localdb/db.mjs` 的 `resolveLocalDbFilePath` 解析）
- **Django 数据目录**: `DWEB_DATA_DIR`（Django 侧 `settings.py` 解析；缺省回退到 `BASE_DIR`）

> 开发模式下 `DVSResource` 会从仓库根生成；生产模式下应使用 Electron 的 `userData` 目录（按 OS 不同，路径不同）。

## 9. 关键文件位置速查

| 关注点 | 路径 |
| --- | --- |
| 主进程入口 | `electron/main.mjs` |
| 预加载脚本 | `electron/preload.mjs` |
| 公共配置 | `electron/config.mjs` |
| Django 进程 | `electron/backend/django.mjs` |
| Python 环境 | `electron/backend/python.mjs` |
| 诊断收集 | `electron/backend/diagnostics.mjs` |
| dweb 协议 | `electron/backend/projectAssetProtocol.mjs` |
| 静态资产服务 | `electron/backend/projectStaticAssets/{manifest,paths,service}.mjs` |
| 本地 DB | `electron/localdb/{db,migrations,index,json}.mjs` |
| LocalDB 仓库 | `electron/localdb/repos/{projects,meshyTasks,videoTasks,apiKeys}.mjs` |
| LocalDB IPC | `electron/localdb/ipc/{ipcHost,djangoMigrate}.mjs` |
| **平台抽象层入口** | `electron/platform/index.mjs` |
| **平台管理器** | `electron/platform/manager.mjs` |
| **平台 IPC** | `electron/platform/ipc.mjs` |
| **Steam 提供者** | `electron/platform/providers/steam.mjs` |
| **Mock 提供者** | `electron/platform/providers/mock.mjs` |
| **平台原生模块 (Win32)** | `electron/platform/native/win32/{dweb_steamjs.node,steam_api64.dll}` |
| Python 引导 | `electron/static/bootstrap/{windows,mac}/*` |
| Steam 设置脚本 | `scripts/setup-steam-dev.mjs` / `scripts/setup-steam-native.mjs` |
