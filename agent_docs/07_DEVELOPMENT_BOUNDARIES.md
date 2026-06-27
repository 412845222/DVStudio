# 全仓开发边界与规范 (Development Boundaries)

⚠️ **作为 AI Agent，在进行代码修改时，请严格遵守以下边界与规范。**

## 1. 前后端职责边界

### 1.1 前端 (Vue / WebGL)
- 负责所有 UI 渲染、动画插值、画布交互。
- **禁止** 在前端直接调用外部 AI 厂商的 API（如 DeepSeek / OpenAI / Meshy / Seedance 等），必须通过 Django 后端代理，以保护 API Key 并解决跨域问题。
- **禁止** 在前端直接 fetch 文件系统（如 `fs.readFile`），必须通过 Electron IPC。
- **禁止** 在前端直接写 SQLite；项目 / 任务 / 凭证数据必须经由 `window.dweb.aiworkflow.db.*` 走主进程 LocalDB。
- **禁止** 在前端直接调用 Steamworks API 或其他平台 SDK；平台能力必须通过 `src/platformBridge/` 抽象层访问。

### 1.2 后端 (Django)
- 负责 API 代理、数据持久化（SQLite）、复杂文本/结构化数据处理、CDN 下载、SSL 兼容。
- **禁止** 在后端处理与 UI 渲染强相关的逻辑（如计算具体的像素坐标），后端只应提供结构化的意图或数据。
- **禁止** 在后端直接读写项目磁盘路径（`Content/Media/...`）—— 这部分由 Electron `projectStaticAssets/service.mjs` 处理；后端只保留纯算法实现。
- **禁止** 在后端直接调用平台 SDK（如 Steamworks）；平台相关能力由 Electron 主进程平台层处理。

### 1.3 Electron 主进程
- 负责启动 / 守护 Django 子进程；注册 dweb 协议；承载 LocalDB；项目静态资产读写；Python 环境检测；平台抽象层管理。
- **禁止** 在主进程内启动任何与 UI 渲染相关的代码（如 `BrowserWindow` 内嵌渲染管线）。
- **禁止** 在主进程内做长耗时的同步 IO；长任务必须异步化（worker / 队列）。
- **禁止** 在主进程内绕过平台抽象层直接调用平台 SDK（如直接 `require` 原生模块）；必须通过 `electron/platform/` 管理器访问。

## 2. 状态管理边界

### 2.1 Vuex vs 组件内部状态
- **Vuex 状态**: 全局共享状态（当前选中的节点、时间轴播放状态、蓝图节点列表、主题、Inspector 状态、平台状态）必须放在 Vuex 中。
- **组件内部状态**: 仅在单个组件内使用的状态（弹窗的开关、表单的临时输入）使用 `ref` / `reactive`。
- **平台状态**: Steam 等平台状态通过 `src/platformBridge/usePlatform.ts` 的 composable 提供响应式访问，自动同步，不需要手动写入 Vuex。
- **持久化**:
  - 跨会话保存的项目数据 → 通过 `electron/localdb/repos/projects.mjs` 写 LocalDB
  - 跨会话保存的任务数据 → 通过 `electron/localdb/repos/{meshyTasks,videoTasks}.mjs`
  - 跨会话保存的凭证 → 通过 `electron/localdb/repos/apiKeys.mjs`（自动加密）
  - 临时 UI 偏好 → `localStorage`（与 `src/network/backendConfig.ts` 的 `setBackendBaseUrl()` 一致）

### 2.2 LocalDB 与 Django SQLite
- **LocalDB 是运行时事实来源**；新增数据先写 LocalDB。
- **Django SQLite 是迁移期镜像**；不要绕过 LocalDB 直接调用 Django API 写项目数据。
- Django `models.py` 当前 `managed = False`，**不要** 把它改为 `True` 除非有明确理由。

## 3. 资源 URL 解析

- **所有资源 URL 一律走 `src/network/backendConfig.ts` 的 `resolveBackendUrl()`**：
  - `dweb://` / `blob:` / `data:` 原样返回
  - `http(s)://` 绝对 URL 原样返回
  - Web 模式下：相对路径直接返回（依赖 Vite dev server 代理或同源部署）
  - Electron 模式下：相对路径拼上 `baseUrl`
- **不要**在组件中硬编码 `http://127.0.0.1:5800/...`。
- **不要**自行构造 `dweb://` 拼接 query；统一使用 `parseDwebProjectAssetUrl()` 解析、`buildDwebAssetUrl()`（在 `projectStaticAssets/paths.mjs`）构造。

## 4. Electron 桥接 (IPC) 边界

- **绝对禁止** 在 Vue 组件 / composable 中直接调用 `window.dweb.*`。
  - 必须通过 `src/electronBridge/index.ts` 封装。
  - 命名空间：`common` / `aiworkflow` / `videostudio` / `window` / `platform`。
- **绝对禁止** 在 Vue 组件 / composable 中直接调用 `window.dweb.platform.*`。
  - 必须通过 `src/platformBridge/` 封装。
- **新 IPC 通道**:
  1. 在 `electron/preload.mjs` 中通过 `contextBridge.exposeInMainWorld` 暴露 `invoke` 函数
  2. 在 `electron/main.mjs` 或对应模块（如 `electron/localdb/ipc/ipcHost.mjs`、`electron/platform/ipc.mjs`）注册 `ipcMain.handle`
  3. 在 `src/electronBridge/index.ts` 中添加 TypeScript 包装
  4. 在 `src/types/electron-bridge.d.ts` 中补充全局类型
- **channel 命名**: `dweb:<area>:<action>`（如 `dweb:localdb:projects:list`、`dweb:platform:get-status`）
- **handler 包装**: LocalDB 的所有 handler 必须用 `safe()` 包装，以便 LocalDB 未初始化时自动 fallback 路径重试。

## 5. 平台抽象层边界（新增）

> Steam 等平台集成必须严格遵守以下边界，确保 Web 模式和非平台环境下的优雅降级。

- **前端**: 所有平台相关功能必须通过 `src/platformBridge/` 访问：
  - 使用 `usePlatform()` composable 获取响应式平台状态（用户、好友、DLC、Overlay 状态）
  - 使用 `useSteamEntry()` composable 处理 Steam 入口引导和重启逻辑
  - 使用 `platform.ts` 中的命令式方法调用平台功能（打开 Overlay、检查 DLC 等）
  - **禁止**直接在组件中 `window.dweb.platform.*`
  - **禁止**直接 `import` Steam SDK 或相关库
- **主进程**: 所有平台相关功能必须通过 `electron/platform/` 访问：
  - 使用 `manager.mjs` 中的方法与平台交互
  - 新增平台支持时，实现新的 provider（参考 `providers/mock.mjs` 和 `providers/steam.mjs`）
  - **禁止**在主进程其他模块直接 `require` 原生模块或平台 SDK
  - 原生模块统一放在 `electron/platform/native/<platform>/` 下，由 `config.mjs` 解析路径
- **降级策略**: 非平台环境（Web、未安装 Steam、非 Windows 平台）必须自动降级到 Mock provider，不影响核心功能运行。
- **启动时序**: 平台预检（`platformPreflight()`）在 `app.ready` 之前执行，可能请求应用重启（需要通过 Steam 客户端启动时）；平台初始化（`platformInit()`）在 `app.whenReady()` 内、Django 启动之前执行。
- **Steam 原生模块**:
  - 原生模块（`.node` / `.dll`）不提交到 Git（已在 `.gitignore` 中）
  - 开发时通过 `npm run setup:steam` 从构建产物复制
  - 打包时通过 `electron-builder` 的 `extraResources` 机制正确包含
  - 设置 `DWEB_STEAMJS_DEBUG=1` 环境变量可开启调试日志

## 6. dweb:// 协议边界

- **只读访问**走 `dweb://project-assets?projectId=&path=`（URL 直接赋给 `<img src>` 等）。
- **写操作**不要在 URL 里 hack；走 IPC（`window.dweb.aiworkflow.uploadProjectAsset` 等）。
- **路径合法性**: 任何用户提供的 path 必须经过 `_safe_project_relative_path()` / `safeResolveProjectRelative()` 校验；**禁止**接受绝对路径或包含 `..` 的路径。

## 7. 代码风格与规范

### 7.1 TypeScript / Vue
- 尽量避免使用 `any`；为所有核心数据结构定义 `interface` 或 `type`。
- Vue 3：统一使用 Composition API（`<script setup lang="ts">`），避免使用 Options API。
- **组件中不要直接 import `window.dweb.*`**；必须经由 `src/electronBridge/index.ts`。
- **组件中不要直接访问平台 API**；必须经由 `src/platformBridge/`。
- 文件命名：Vue 组件使用 PascalCase（如 `MyComponent.vue`），TS/JS 文件使用 camelCase（如 `myUtils.ts`）。
- 长任务 / 频繁调用的逻辑放到 `src/composables/` 或 `src/views/<Page>/` 下的 composable 中。

### 7.2 Python
- 遵循 PEP 8 规范，使用 Type Hints 增加代码可读性。
- 文件命名：snake_case（如 `my_module.py`）。
- Django View 必须接 DRF 的 `Request` 类型；普通函数式 View 走 `rest_framework.decorators.api_view`。
- 异步 SSE 走 `StreamingHttpResponse` + `dwebapp/ai/api/chat/utils._sse`，**不要** 引入 `sse-starlette` 等第三方 SSE 库。

### 7.3 JavaScript / Node（Electron 主进程）
- 使用 ES Modules（`import / export`）；**不要** 使用 `require`（除非 `createRequire` 的特殊场景）。
- 文件后缀：`.mjs`。
- 主进程错误必须带可读上下文（`console.error('[dweb-protocol] ...', err)`、`console.error('[platform] ...', err)`）。
- 异步 IO 优先；同步 IO（`fs.readFileSync`）仅在启动期或必要的最后手段使用。
- 平台相关日志统一使用 `[platform]` 前缀。

## 8. 测试与质量

- **单元测试**: Vitest (`npm run test`)，测试文件命名 `*.spec.ts`，位于源文件同级或 `__tests__/`。
- **类型检查**: `npm run typecheck`（vue-tsc --noEmit）。
- **Lint**: `npm run lint`（ESLint，`src/**/*.{ts,vue}` 与 `electron/**/*.{mjs,js}`）。
- **默认质量门禁**: `npm run quality` —— 运行 typecheck + test（lint 不包含在默认门禁中，可按需手动运行）。
- **完整质量门禁**: `npm run quality:full` —— 运行 typecheck + lint + test。
- **覆盖率**: `npm run test:coverage`（@vitest/coverage-v8，输出至 `coverage/`）。
- pre-push hook 会阻止未通过默认质量门禁的提交。

## 9. 破坏性修改警告

- 在修改以下模块时，必须极其谨慎：
  - `src/engine/webgl/`（WebGL2 渲染引擎）：变更可能导致整个编辑器崩溃
  - `src/core/scene/`（舞台核心）：变更可能导致历史项目无法打开
  - `electron/localdb/migrations.mjs`（数据库结构）：需保留向后兼容路径（保留旧字段、写新表、提供迁移路径）
  - `electron/platform/`（平台抽象层）：变更可能导致平台启动失败或 Overlay 异常
  - 原生模块（`electron/platform/native/`）：ABI 变化可能导致 Electron 崩溃
- 修改前请先读 `agent_docs/` 相关文档并保留旧字段（不要直接删除）。

## 10. 桌面端可观测闭环准则（新增）

> 当用户目标是「启动 EXE」、「打开桌面应用」、「修复启动问题」时，必须遵守以下准则，避免在缺少证据时断言成功：

1. **证据优先**: 必须基于以下可见证据判断状态：
   - Electron 主进程控制台日志（`[platform]`、`[django]`、`[localdb]` 前缀）
   - Django 进程输出（`Starting development server at ...` 或错误堆栈）
   - 窗口创建事件（`did-finish-load`、`ready-to-show`）
   - 崩溃报告（`render-process-gone`、`child-process-gone`）
2. **禁止过早断言**: 在没有看到窗口实际显示、或没有看到健康检查通过日志前，**不要** 对用户说「已启动」、「已修复」、「已打开」。
3. **命令执行规范**:
   - 在 PowerShell 5 中使用分号 `;` 分隔命令，**不要** 使用 `&&`（PS5 不支持）
   - 将「启动服务」和「打开页面/验证启动」解耦为两步
   - 长时运行进程（dev server、Electron）必须使用 `blocking: false` 启动
4. **证据缺失处理**: 如果工具输出被清理或日志不可用，**立即重新拉取证据**（重新运行命令、查看主进程日志、检查端口），不要基于假设推进。
5. **平台启动检查**: 涉及 Steam 启动时，检查 `platformPreflight()` 返回值、平台初始化日志、Steam 用户状态，确认 Overlay 正常。
6. **输出规范**: 如果无法确认状态，输出「下一步需要验证的最小信息」（如「请查看 DevTools 控制台是否有错误」、「请提供主进程日志输出」），不要猜测原因。

## 11. 提交与 Git

- `package.json` 已配置 `postinstall` 自动安装 git hooks（`core.hooksPath = .githooks`）。
- pre-push hook 会阻止未通过质量门禁（typecheck + test）的提交。
- 提交前先 `npm run quality`；CI / 推送失败时先看 pre-push 报告。
- 单一目的提交（atomic commit），每个 commit 限定一个主题。
- 提交信息建议格式：`<scope>: <subject>`，如 `electron: add platform abstraction layer for Steam`、`frontend: add Steam entry overlay`。
- **不要提交**：
  - `electron/platform/native/` 下的二进制文件（`.node`、`.dll`、`.dylib`）
  - `DVSResource/` 目录（运行时生成资源）
  - `electron/static/runtime/` 下的 Python 运行时（构建时生成）
  - 任何 API Key 或敏感凭证

## 12. 与 AGENT_GUIDE 的关系

本文件描述「不要做什么」与「边界」；如需了解「如何做」，请按需查阅：

- [02_ARCHITECTURE.md](02_ARCHITECTURE.md) — 系统架构
- [03_FRONTEND_GUIDE.md](03_FRONTEND_GUIDE.md) — 前端开发
- [04_BACKEND_GUIDE.md](04_BACKEND_GUIDE.md) — 后端开发
- [05_ELECTRON_GUIDE.md](05_ELECTRON_GUIDE.md) — 桌面端开发（含平台抽象层）
- [06_AI_WORKFLOW_GUIDE.md](06_AI_WORKFLOW_GUIDE.md) — AI 工作流
