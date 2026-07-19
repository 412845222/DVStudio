# 云服务与扩展模块开发指南（2026-07-19 新增）

本文档涵盖 CloudFS 云存储文件系统、Steam Workshop 工坊模板、ComfyUI 本地服务管理增强三个模块的开发指引。这三个模块均为 2026-07-19 新增/重构的核心后端模块。

## 目录
1. [模块概览](#模块概览)
2. [CloudFS 云存储文件系统](#cloudfs-云存储文件系统)
3. [Steam Workshop 工坊模板](#steam-workshop-工坊模板)
4. [ComfyUI 本地服务管理增强](#comfyui-本地服务管理增强)
5. [前端页面路由](#前端页面路由)
6. [关键文件位置](#关键文件位置)

---

## 模块概览

### 模块列表

| 模块 | 后端路径 | IPC 前缀 | LocalDB 仓库 | 前端命名空间 | 前端页面 |
|-----|---------|---------|-------------|-------------|---------|
| CloudFS | `electron/backend/modules/cloudfs/` | `dweb:cloud-fs:` | `cloudStorageConfig` | `window.dweb.cloudfs` | `/cloud-storage` |
| Workshop Templates | `electron/backend/modules/workshop-templates/` | `dweb:workshop-templates:` | - | `window.dweb.workshopTemplates` | `/template-center`（复用） |
| ComfyUI 增强 | `electron/backend/modules/comfyui/` | `dweb:comfyui:setup:`、`dweb:comfyui:runtime:` | `comfyuiJobs`、`comfyuiWorkflows` | `window.dweb.comfyui`（setup 子命名空间） | `/comfyui-setup`、`/services` |

---

## CloudFS 云存储文件系统

### 功能说明

CloudFS（Cloud File System）是统一的云存储抽象层，屏蔽不同云存储提供商之间的差异，对外提供一致的 API：

- 多云存储适配器支持：阿里云 OSS、火山引擎 TOS、自定义 HTTP 端点
- 提供商配置管理（凭据验证、配置保存/清除、激活切换）
- Bucket 管理（列表、创建、删除、配置、从云添加、活跃切换、ACL 修复）
- 文件操作（列表、上传、下载/删除、创建文件夹、公共 URL 获取、上传到公共 URL）
- 配置持久化到 LocalDB 的 `cloudStorageConfig` 仓库
- 开发/离线环境下适配器自动降级（Web 模式/无 SDK 环境）

### 目录结构

```
electron/backend/modules/cloudfs/
├── registry.mjs         # 提供商注册中心（getProvider/supportedProviders/registerProvider）
├── service.mjs          # 业务逻辑层（调用 providers，持久化配置到 repos.cloudStorageConfig）
├── handlers.mjs         # IPC handlers（参数校验、调用 service、错误包装）
├── routes.mjs           # IPC 路由注册（21 个通道）
├── types.mjs            # 类型定义（ProviderType、BucketConfig、CloudFSConfig、CLOUD_FS_CHANNELS）
├── base/
│   └── utils.mjs        # 通用工具函数
└── providers/
    ├── aliyun-oss/      # 阿里云 OSS 适配器
    │   ├── index.mjs    # 适配器入口 + createAliyunOSSProvider
    │   ├── client.mjs   # OSS 客户端初始化
    │   ├── bucket.mjs   # Bucket 操作
    │   ├── list.mjs     # 文件列表
    │   ├── upload.mjs   # 文件上传
    │   └── delete.mjs   # 文件删除
    ├── volcengine-tos/  # 火山引擎 TOS 适配器
    │   ├── index.mjs    # 适配器入口 + createVolcengineTOSProvider
    │   ├── client.mjs   # TOS 客户端初始化
    │   ├── bucket.mjs   # Bucket 操作
    │   ├── list.mjs     # 文件列表
    │   ├── upload.mjs   # 文件上传
    │   └── delete.mjs   # 文件删除
    └── custom-http/     # 自定义 HTTP 适配器（通用兼容层）
        └── index.mjs    # 自定义 HTTP Provider 实现
```

### IPC 接口（21 个通道）

所有通道前缀为 `dweb:cloud-fs:`，通过 `window.dweb.cloudfs.*` 调用：

#### 提供商配置

| Channel | 方法名 | 说明 |
|---------|-------|------|
| `dweb:cloud-fs:list-providers` | `listProviders` | 列出所有支持的云存储提供商 |
| `dweb:cloud-fs:get-active-config` | `getActiveConfig` | 获取当前激活的云存储配置 |
| `dweb:cloud-fs:save-config` | `saveConfig` | 保存提供商配置（含凭据） |
| `dweb:cloud-fs:clear-config` | `clearConfig` | 清除提供商配置 |
| `dweb:cloud-fs:test-config` | `testConfig` | 测试配置连接性 |
| `dweb:cloud-fs:validate-credentials` | `validateCredentials` | 验证凭据有效性 |

#### Bucket 管理

| Channel | 方法名 | 说明 |
|---------|-------|------|
| `dweb:cloud-fs:setup-bucket` | `setupBucket` | 初始设置 Bucket（向导流程） |
| `dweb:cloud-fs:list-buckets` | `listBuckets` | 列出云端所有 Bucket |
| `dweb:cloud-fs:create-bucket` | `createBucket` | 创建新 Bucket |
| `dweb:cloud-fs:create-folder` | `createFolder` | 在 Bucket 中创建文件夹 |
| `dweb:cloud-fs:update-bucket` | `updateBucket` | 更新 Bucket 配置 |
| `dweb:cloud-fs:list-configured-buckets` | `listConfiguredBuckets` | 列出已配置的 Bucket（本地持久化） |
| `dweb:cloud-fs:add-bucket-from-cloud` | `addBucketFromCloud` | 从云端 Bucket 添加到已配置列表 |
| `dweb:cloud-fs:remove-configured-bucket` | `removeConfiguredBucket` | 从已配置列表移除 Bucket |
| `dweb:cloud-fs:switch-active-bucket` | `switchActiveBucket` | 切换当前活跃 Bucket |
| `dweb:cloud-fs:fix-bucket-acl` | `fixBucketAcl` | 修复 Bucket ACL 权限（公开读） |

#### 文件操作

| Channel | 方法名 | 说明 |
|---------|-------|------|
| `dweb:cloud-fs:list-files` | `listFiles` | 列出 Bucket 中的文件/目录 |
| `dweb:cloud-fs:upload-file` | `uploadFile` | 上传文件到 Bucket |
| `dweb:cloud-fs:delete-file` | `deleteFile` | 删除文件 |
| `dweb:cloud-fs:get-public-url` | `getPublicUrl` | 获取文件公共访问 URL |
| `dweb:cloud-fs:upload-to-public-url` | `uploadToPublicUrl` | 上传文件并返回公共 URL |

### 适配器开发规范

新增云存储适配器需遵循以下规范：

1. 在 `electron/backend/modules/cloudfs/providers/<provider-name>/` 下创建目录
2. 适配器工厂函数必须导出统一接口（参考 aliyun-oss/index.mjs 和 volcengine-tos/index.mjs）
3. 必须实现的方法：
   - `testConnection()`：测试连接
   - `listBuckets()`：列出 Bucket
   - `createBucket()`：创建 Bucket
   - `listFiles(bucket, prefix)`：列出文件
   - `uploadFile(bucket, key, filePath/Buffer)`：上传文件
   - `deleteFile(bucket, key)`：删除文件
   - `getPublicUrl(bucket, key)`：获取公共 URL
4. 在 `registry.mjs` 中注册新适配器
5. SDK 依赖需添加到 `package.json#dependencies`
6. 凭据通过 `apiKeys` 仓库加密存储，配置通过 `cloudStorageConfig` 仓库持久化

**禁止**：
- 不要在业务模块直接 `import ali-oss` 或 `@volcengine/tos-sdk`，必须通过 registry/service 层调用
- 不要在前端直接持有云存储 SDK，所有操作必须走 IPC
- 不要将 AccessKey/SecretKey 等凭据明文存储或发送到前端

---

## Steam Workshop 工坊模板

### 功能说明

Workshop Templates 模块提供 Steam 创意工坊（Workshop）集成能力：

- 查询工坊模板列表（支持分页、搜索、筛选）
- 下载工坊模板（带进度跟踪）
- 获取模板安装信息（本地是否已安装、安装路径）
- 通过 adapters/factory 模式支持真实 Steam 和 Mock 降级
- 与现有 cloud-templates 模块配合使用

### 目录结构

```
electron/backend/modules/workshop-templates/
├── service.mjs          # 业务逻辑层
├── handlers.mjs         # IPC handlers
├── routes.mjs           # IPC 路由注册（5 个通道）
└── adapters/
    ├── base.mjs         # 适配器抽象基类
    ├── factory.mjs      # 适配器工厂（根据平台环境分发 steam/mock）
    ├── steam.mjs        # Steam 平台真实适配器（调用 Steamworks API）
    └── mock.mjs         # Mock 适配器（开发/非 Steam 环境降级）
```

### IPC 接口（5 个通道）

所有通道前缀为 `dweb:workshop-templates:`，通过 `window.dweb.workshopTemplates.*` 调用：

| Channel | 方法名 | 说明 |
|---------|-------|------|
| `dweb:workshop-templates:get-platform` | `getPlatform` | 获取当前工坊平台状态（是否可用、Steam 是否运行） |
| `dweb:workshop-templates:query` | `queryTemplates` | 查询工坊模板列表（分页、搜索、筛选参数） |
| `dweb:workshop-templates:download` | `downloadTemplate` | 下载指定模板（返回下载任务 ID） |
| `dweb:workshop-templates:progress` | `getDownloadProgress` | 获取下载进度（流式/轮询） |
| `dweb:workshop-templates:install-info` | `getInstallInfo` | 获取模板安装信息（本地状态、路径） |

### 适配器开发规范

1. 新适配器必须继承 `adapters/base.mjs` 抽象基类
2. 通过 `adapters/factory.mjs` 的工厂方法获取适配器实例
3. 非 Steam 环境必须自动降级到 mock 适配器，不要抛出硬错误
4. 下载进度必须通过 IPC 流或轮询接口提供给前端
5. 与 Steam 平台层（`electron/platform/`）的交互通过 platform 模块注入，不要直接加载原生模块

---

## ComfyUI 本地服务管理增强

### 功能说明

ComfyUI 模块在原有工作流桥接基础上，新增本地服务全生命周期管理：

- ComfyUI 安装向导（自动下载、Python venv 创建、依赖安装）
- 环境检测（Python 版本、Git、venv、已安装依赖）
- 模型路径配置（自定义模型目录映射）
- 本地服务启停（启动/停止/重启、端口管理）
- 服务日志实时查看（log-line-parser 解析日志行）
- 镜像源配置（国内镜像加速 pip/Git 下载）
- Python 虚拟环境管理（创建、修复、依赖同步）
- 服务状态事件推送
- 设置页面 `/comfyui-setup` 和服务中心 `/services` 展示状态

### 目录结构（关键新增/增强文件）

```
electron/backend/modules/comfyui/
├── routes.mjs           # IPC 路由（含 runtime: 和 setup: 两组前缀）
├── handlers.mjs         # IPC handlers（运行时 + 安装/管理）
├── service.mjs          # 业务逻辑（运行时桥接 + 服务管理）
├── setup-service.mjs    # 🆕 ComfyUI 安装/配置服务（核心新增）
│                         # - 环境检测（checkEnvironment）
│                         # - Python venv 管理（createVenv/repairVenv/syncDeps）
│                         # - ComfyUI 安装/更新（installComfyUI/updateComfyUI）
│                         # - 服务启停（startService/stopService/restartService）
│                         # - 镜像源配置（setMirror/getMirrors）
│                         # - 模型路径管理（getModelPaths/setModelPaths）
└── log-line-parser.mjs  # 🆕 日志行解析器（解析 ComfyUI stdout/stderr，结构化输出）
```

### IPC 接口（setup 子命名空间）

原有 `dweb:comfyui:runtime:*` 通道保持不变（工作流运行、任务管理等，见 06_AI_WORKFLOW_GUIDE），新增 `dweb:comfyui:setup:*` 通道：

#### 环境检测与安装

| Channel | 说明 |
|---------|------|
| `dweb:comfyui:setup:check-env` | 检测本地环境（Python/Git/venv/ComfyUI 安装状态） |
| `dweb:comfyui:setup:install` | 执行 ComfyUI 安装流程（下载+venv+依赖） |
| `dweb:comfyui:setup:update` | 更新已安装的 ComfyUI |
| `dweb:comfyui:setup:create-venv` | 创建 Python 虚拟环境 |
| `dweb:comfyui:setup:repair-venv` | 修复虚拟环境 |
| `dweb:comfyui:setup:sync-deps` | 同步/安装 Python 依赖 |

#### 服务管理

| Channel | 说明 |
|---------|------|
| `dweb:comfyui:setup:start` | 启动本地 ComfyUI 服务 |
| `dweb:comfyui:setup:stop` | 停止本地 ComfyUI 服务 |
| `dweb:comfyui:setup:restart` | 重启本地 ComfyUI 服务 |
| `dweb:comfyui:setup:status` | 获取服务当前状态 |
| `dweb:comfyui:setup:logs` | 获取服务日志（流式，IPC 三通道模式） |
| `dweb:comfyui:setup:ping` | Ping 本地 ComfyUI 服务（健康检查） |

#### 配置管理

| Channel | 说明 |
|---------|------|
| `dweb:comfyui:setup:get-model-paths` | 获取模型路径配置 |
| `dweb:comfyui:setup:set-model-paths` | 设置模型路径 |
| `dweb:comfyui:setup:get-mirrors` | 获取镜像源列表 |
| `dweb:comfyui:setup:set-mirror` | 设置当前使用的镜像源 |
| `dweb:comfyui:setup:get-config` | 获取完整 ComfyUI 配置 |

### 前端调用规范

```typescript
// 检测环境
const envStatus = await window.dweb.comfyui.setup.checkEnv()

// 安装（流式日志）
const stream = window.dweb.comfyui.setup.install(config)
stream.on('data', (logLine) => {
  // 解析后的结构化日志行（通过 log-line-parser.mjs 解析）
  console.log(logLine.level, logLine.message)
})
stream.on('end', () => { /* 安装完成 */ })
stream.on('error', (err) => { /* 安装失败 */ })

// 启动服务并监听日志
await window.dweb.comfyui.setup.start()
const logStream = window.dweb.comfyui.setup.logs()
```

**禁止**：
- 不要在前端直接执行 `child_process.spawn` 启动 Python/ComfyUI，必须通过 IPC 走 setup-service
- 不要绕过 setup-service 直接修改虚拟环境文件
- 日志解析必须在主进程完成（log-line-parser.mjs），前端只消费结构化结果

---

## 前端页面路由

三个模块对应以下前端页面：

| 路由 | 组件路径 | 模块 |
|-----|---------|------|
| `/cloud-storage` | `src/views/CloudStorage/CloudStoragePage.vue` | CloudFS 云存储管理页面 |
| `/comfyui-setup` | `src/views/ComfyUISetupPage.vue` | ComfyUI 安装与设置向导 |
| `/services` | `src/views/ServiceCenterPage.vue` | 服务中心（ComfyUI、MCP 等服务状态监控与管理） |
| `/video-editor` | `src/views/VideoEditorPage.vue` | 独立视频编辑器（非新模块但与本次新增相关） |

路由注册位于 [src/router/index.ts](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/src/router/index.ts)。

---

## 关键文件位置

### 后端

| 文件 | 说明 |
|-----|------|
| [electron/backend/modules/cloudfs/registry.mjs](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/electron/backend/modules/cloudfs/registry.mjs) | CloudFS 提供商注册中心 |
| [electron/backend/modules/cloudfs/service.mjs](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/electron/backend/modules/cloudfs/service.mjs) | CloudFS 业务逻辑 |
| [electron/backend/modules/cloudfs/routes.mjs](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/electron/backend/modules/cloudfs/routes.mjs) | CloudFS IPC 路由（21 通道） |
| [electron/backend/modules/cloudfs/types.mjs](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/electron/backend/modules/cloudfs/types.mjs) | CloudFS 类型与通道常量 |
| [electron/backend/modules/cloudfs/providers/aliyun-oss/index.mjs](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/electron/backend/modules/cloudfs/providers/aliyun-oss/index.mjs) | 阿里云 OSS 适配器 |
| [electron/backend/modules/cloudfs/providers/volcengine-tos/index.mjs](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/electron/backend/modules/cloudfs/providers/volcengine-tos/index.mjs) | 火山引擎 TOS 适配器 |
| [electron/backend/modules/cloudfs/providers/custom-http/index.mjs](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/electron/backend/modules/cloudfs/providers/custom-http/index.mjs) | 自定义 HTTP 适配器 |
| [electron/backend/modules/workshop-templates/routes.mjs](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/electron/backend/modules/workshop-templates/routes.mjs) | Workshop IPC 路由（5 通道） |
| [electron/backend/modules/workshop-templates/adapters/factory.mjs](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/electron/backend/modules/workshop-templates/adapters/factory.mjs) | Workshop 适配器工厂 |
| [electron/backend/modules/comfyui/setup-service.mjs](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/electron/backend/modules/comfyui/setup-service.mjs) | ComfyUI 安装/配置服务 |
| [electron/backend/modules/comfyui/log-line-parser.mjs](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/electron/backend/modules/comfyui/log-line-parser.mjs) | ComfyUI 日志行解析器 |
| [electron/localdb/repos/cloudStorageConfig.mjs](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/electron/localdb/repos/cloudStorageConfig.mjs) | 云存储配置 LocalDB 仓库 |

### 前端桥接

| 文件 | 说明 |
|-----|------|
| [electron/preload.mjs](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/electron/preload.mjs) | Preload 注入（cloudfs、workshopTemplates 命名空间、comfyui.setup 子命名空间） |
| [src/electronBridge/index.ts](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/src/electronBridge/index.ts) | 前端 TypeScript 封装 |

### 前端页面

| 文件 | 说明 |
|-----|------|
| [src/views/CloudStorage/CloudStoragePage.vue](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/src/views/CloudStorage/CloudStoragePage.vue) | 云存储管理页面 |
| [src/views/ComfyUISetupPage.vue](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/src/views/ComfyUISetupPage.vue) | ComfyUI 设置页面 |
| [src/views/ServiceCenterPage.vue](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/src/views/ServiceCenterPage.vue) | 服务中心页面 |
| [src/views/VideoEditorPage.vue](file:///C:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-update-agent-guide-md-3XBfli/src/views/VideoEditorPage.vue) | 独立视频编辑器页面 |

---
*本文档最后更新：2026-07-19，对应 CloudFS/Workshop/ComfyUI 增强模块上线。*
