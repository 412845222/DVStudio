# 桌面端开发指引 (Electron Guide)

## 1. 架构定位

Electron 在本项目中**绝不仅仅是"壳"**，它承担着以下关键职责：

1. **窗口宿主**：提供独立的 BrowserWindow 加载 Vue 前端。
2. **后端进程管理**：启动 / 守护 / 重启 Django Python 子进程（端口 5800，可被自动分配替换）。
3. **本地数据库**（`electron/localdb/`）：better-sqlite3 SQLite 实例，承载项目、Meshy 任务、视频任务、API 密钥等运行时数据。
4. **dweb:// 项目资产协议**（`electron/backend/projectAssetProtocol.mjs`）：自定义协议让渲染端绕过 Django 直接读取项目静态资产。
5. **项目静态资产服务**（`electron/backend/projectStaticAssets/`）：upload / import / delete / resolve / repair / download / copy 等写操作的主进程实现。
6. **Python 环境引导安装**（`electron/static/bootstrap/`）：在缺失 Python 环境时调用 Windows / macOS 安装脚本。
7. **诊断与日志收集**（`electron/backend/diagnostics.mjs`）：用户报错时可一键导出诊断信息。
8. **IPC 桥**（`electron/preload.mjs` + `src/electronBridge/index.ts`）：通过 `contextBridge.exposeInMainWorld('dweb', ...)` 暴露给前端。

## 2. 进程通信 (IPC)

### 2.1 主进程（`electron/main.mjs`）
- 注册 `ipcMain.handle` 监听器（通过 `registerLocalDbIpc` 等模块化注册函数）。
- 注册 dweb 自定义协议为 **privileged scheme**（`protocol.registerSchemesAsPrivileged`）—— **必须在 `app.ready` 之前**完成。
- 启动 Django 子进程并健康检查；启动失败时尝试 fallback 端口。

### 2.2 预加载脚本（`electron/preload.mjs`）
- 通过 `contextBridge.exposeInMainWorld` 暴露安全的 API 给前端：
  - `window.dweb.common.*`：后端 / 设置 / setup / 诊断 / 窗口 / 引导
  - `window.dweb.aiworkflow.*`：项目 / 资源 / LocalDB / 任务 / API 密钥 / 图片标注 / 资源管理器
  - `window.dweb.videostudio.*`：导出目录
  - `window.dweb.window.*`：最小化 / 最大化 / 重载 / DevTools
  - 资源管理器窗口的 `onResourceManagerData` / `onResourceManagerEvent` / `onResourceManagerNotify` 系列监听器

### 2.3 渲染进程（Vue）
- 通过 `src/electronBridge/index.ts` 封装调用，**不要**在组件中直接 `window.dweb.*`。
- 通过 `src/network/runtimePlatform.ts` 的 `isElectron()` 区分 Electron / Web 模式。
- 资源 URL 一律走 `src/network/backendConfig.ts` 的 `resolveBackendUrl()`。

## 3. 本地数据库（`electron/localdb/`）—— 核心数据层

### 3.1 模块结构
- `db.mjs`：better-sqlite3 实例管理；带 ABI 错误友好提示（Electron / Node ABI 变化时）
- `index.mjs`：多路径回退初始化（`backendDataDir` → `userDataDir` → `tmpdir` → `homedir`）
- `migrations.mjs`：基于 `PRAGMA user_version` 的迁移（`TARGET_VERSION`，`runV<n>(db)` 函数）
- `json.mjs`：ISO ↔ 毫秒、可选 JSON 字段解析

### 3.2 仓库层（`electron/localdb/repos/`）
- `projects.mjs`：项目元数据 CRUD、`rootPath` / `projectUuid` / `manifestPath` / `storageVersion`
- `meshyTasks.mjs`：Meshy 3D 任务（task_id / status / progress / request_payload / response_payload）
- `videoTasks.mjs`：视频生成任务
- `apiKeys.mjs`：API 密钥（AES-256-GCM + PBKDF2，120k iterations；仅明文保存 `keyFingerprint`）

### 3.3 IPC 主机（`electron/localdb/ipc/`）
- `ipcHost.mjs`：注册 `dweb:localdb:*` 通道。所有 handler 由 `safe()` 包装，**LocalDB 未初始化时自动用 fallback 路径重试**，避免启动竞态。
- `djangoMigrate.mjs`：在 Electron 启动 / 升级时调用 `python manage.py migrate`。

### 3.4 与 Django SQLite 的关系
- LocalDB 是**运行时事实来源**。
- Django SQLite（`comfyui_blueprint_project` 等表）是**迁移期镜像**。
- **不要**在两边都写迁移脚本；新功能默认先写 LocalDB。

## 4. dweb:// 项目资产协议

### 4.1 协议格式
```
dweb://project-assets?projectId=<id>&path=<rel>&variant=<v>&maxSize=<n>&v=<versionTag>
```

### 4.2 工作方式
- 渲染端把上述 URL 赋给 `<img src>` / `fetch()`。
- Electron 主进程的协议处理器（`electron/backend/projectAssetProtocol.mjs`）拦截该 URL，**不经过 Django**，从磁盘读取并返回字节流。
- 同时可携带 `variant`（如 `thumb`）与 `maxSize`（128-4096 px）查询参数生成缩略图。
- `v` 是版本号标签（项目快照版本），避免 CDN/浏览器缓存命中旧文件。

### 4.3 路径安全
- 拒绝绝对路径（`rel.startsWith('/')`）
- 拒绝 `..` 路径穿越（`rel.includes('..')`）
- 解析后必须位于项目根目录内
- MIME 推断按扩展名映射表

### 4.4 注册位置
- `electron/main.mjs`：`protocol.registerSchemesAsPrivileged([{ scheme: 'dweb', privileges: { standard, secure, supportFetchAPI, stream } }])`
- `electron/main.mjs`：`protocol.handle('dweb', handler)`（实际处理函数由 `registerDwebProjectAssetProtocol` 注入）

### 4.5 项目静态资产服务（`electron/backend/projectStaticAssets/`）
- `manifest.mjs`：项目 manifest（`{projectId, name, rootPath, assets, ...}`）读写
- `paths.mjs`：路径工具（安全 resolve、URL 构造、相对路径规范化）
- `service.mjs`：在主进程内直接调用 `projectAssetProtocol.mjs` 的 `uploadBufferProjectAsset` / `importUrlProjectAsset` / `importFileProjectAsset` / `deleteStaticProjectAsset` / `resolveStaticProjectAsset` / `repairAllProjectAssets` 等函数
- 这是 **Electron 模式下** 资产写操作的真实入口

### 4.6 Web 模式降级
- 纯 Web 开发时（`npm run dev:web`），渲染端用 `fetch` 访问 Django 的 `assets/health` 等仅剩的端点；
- Django 侧的 `aiworkflow_project/assets/api.py` 仍保留实现，但**大部分端点不再通过 `urls.py` 暴露**（仅 `assets/health`），主要供未来 Web 模式或单元测试使用。

## 5. Django 进程管理（`electron/backend/`）

- `django.mjs`：`startDjangoServer` / `waitForBackendReady` / `pickBackendPort` / `killExistingDjangoRunservers` / `collectDiagnostics`
- `djangoProject.mjs`：`copyDjangoTemplateToRuntime` / `syncDjangoTemplateToRuntime` / `ensureRuntimeDjangoProjectScaffold` / `ensureRuntimeRequirements` / `sanitizeRuntimeDjangoDir`
- `python.mjs`：`detectPythonInfo` —— 探测系统 Python / .venv / 引导安装
- `runtimeCleanup.mjs`：`cleanupOldRuntimeProject` —— 清理旧版本运行时项目
- `diagnostics.mjs`：`collectDiagnostics` —— 收集诊断信息（含 Django log、Electron log、本地 DB 状态等）

> **进程退出**：在 Electron 退出时，必须正确 kill 掉 Django 进程（`killExistingDjangoRunservers`），避免孤儿进程占用端口 (5800) 与资源。

## 6. Python 引导安装（`electron/static/bootstrap/`）

打包时通过 `package.json#build.extraResources` 复制到 `resources/static/bootstrap/`。

- `manifest.json`：声明当前内置的 Python 版本 / 安装方式
- `windows/install.cmd` / `windows/install.ps1`：Windows 平台 PowerShell 引导
- `mac/install.sh`：macOS 引导
- 由 `electron/backend/django.mjs` 在检测不到 Python 时调用

## 7. 运行时资源根目录

- **环境变量**: `DWEB_RESOURCE_DIR`
  - 开发模式默认：`DVSResource`（仓库内）
  - 生产模式默认：Electron `app.getPath('userData')`
- **LocalDB 文件路径**: `DWEB_RESOURCE_DIR/localdb.sqlite3`（由 `electron/localdb/db.mjs` 的 `resolveLocalDbFilePath` 解析）
- **Django 数据目录**: `DWEB_DATA_DIR`（Django 侧 `settings.py` 解析；缺省回退到 `BASE_DIR`）

> 开发模式下 `DVSResource` 会从仓库根生成；生产模式下应使用 Electron 的 `userData` 目录（按 OS 不同，路径不同）。

## 8. 关键文件位置速查

| 关注点 | 路径 |
| --- | --- |
| 主进程入口 | `electron/main.mjs` |
| 预加载脚本 | `electron/preload.mjs` |
| 公共配置 | `electron/config.mjs` |
| Django 进程 | `electron/backend/django.mjs` |
| Python 环境 | `electron/backend/python.mjs` |
| dweb 协议 | `electron/backend/projectAssetProtocol.mjs` |
| 静态资产服务 | `electron/backend/projectStaticAssets/{manifest,paths,service}.mjs` |
| 本地 DB | `electron/localdb/{db,migrations,index,json}.mjs` |
| LocalDB 仓库 | `electron/localdb/repos/{projects,meshyTasks,videoTasks,apiKeys}.mjs` |
| LocalDB IPC | `electron/localdb/ipc/{ipcHost,djangoMigrate}.mjs` |
| Python 引导 | `electron/static/bootstrap/{windows,mac}/*` |
