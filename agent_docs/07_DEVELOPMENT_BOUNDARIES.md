# 全仓开发边界与规范 (Development Boundaries)

⚠️ **作为 AI Agent，在进行代码修改时，请严格遵守以下边界与规范。**

## 1. 前后端职责边界

### 1.1 前端 (Vue / WebGL)
- 负责所有 UI 渲染、动画插值、画布交互。
- **禁止** 在前端直接调用外部 AI 厂商的 API（如 DeepSeek / OpenAI / Meshy / Seedance 等），必须通过 Django 后端代理，以保护 API Key 并解决跨域问题。
- **禁止** 在前端直接 fetch 文件系统（如 `fs.readFile`），必须通过 Electron IPC。
- **禁止** 在前端直接写 SQLite；项目 / 任务 / 凭证数据必须经由 `window.dweb.aiworkflow.db.*` 走主进程 LocalDB。

### 1.2 后端 (Django)
- 负责 API 代理、数据持久化（SQLite）、复杂文本/结构化数据处理、CDN 下载、SSL 兼容。
- **禁止** 在后端处理与 UI 渲染强相关的逻辑（如计算具体的像素坐标），后端只应提供结构化的意图或数据。
- **禁止** 在后端直接读写项目磁盘路径（`Content/Media/...`）—— 这部分由 Electron `projectStaticAssets/service.mjs` 处理；后端只保留纯算法实现。

### 1.3 Electron 主进程
- 负责启动 / 守护 Django 子进程；注册 dweb 协议；承载 LocalDB；项目静态资产读写；Python 环境检测。
- **禁止** 在主进程内启动任何与 UI 渲染相关的代码（如 `BrowserWindow` 内嵌渲染管线）。
- **禁止** 在主进程内做长耗时的同步 IO；长任务必须异步化（worker / 队列）。

## 2. 状态管理边界

### 2.1 Vuex vs 组件内部状态
- **Vuex 状态**: 全局共享状态（当前选中的节点、时间轴播放状态、蓝图节点列表、主题、Inspector 状态）必须放在 Vuex 中。
- **组件内部状态**: 仅在单个组件内使用的状态（弹窗的开关、表单的临时输入）使用 `ref` 或 `reactive`。
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
  - 命名空间：`common` / `aiworkflow` / `videostudio` / `window`。
- **新 IPC 通道**:
  1. 在 `electron/preload.mjs` 中通过 `contextBridge.exposeInMainWorld` 暴露 `invoke` 函数
  2. 在 `electron/main.mjs` 或对应模块（如 `electron/localdb/ipc/ipcHost.mjs`）注册 `ipcMain.handle`
  3. 在 `src/electronBridge/index.ts` 中添加 TypeScript 包装
  4. 在 `src/types/electron-bridge.d.ts` 中补充全局类型
- **channel 命名**: `dweb:<area>:<action>`（如 `dweb:localdb:projects:list`）
- **handler 包装**: LocalDB 的所有 handler 必须用 `safe()` 包装，以便 LocalDB 未初始化时自动 fallback 路径重试。

## 5. dweb:// 协议边界

- **只读访问**走 `dweb://project-assets?projectId=&path=`（URL 直接赋给 `<img src>` 等）。
- **写操作**不要在 URL 里 hack；走 IPC（`window.dweb.aiworkflow.uploadProjectAsset` 等）。
- **路径合法性**: 任何用户提供的 path 必须经过 `_safe_project_relative_path()` / `safeResolveProjectRelative()` 校验；**禁止**接受绝对路径或包含 `..` 的路径。

## 6. 代码风格与规范

### 6.1 TypeScript / Vue
- 尽量避免使用 `any`；为所有核心数据结构定义 `interface` 或 `type`。
- Vue 3：统一使用 Composition API（`<script setup lang="ts">`），避免使用 Options API。
- **组件中不要直接 import `window.dweb.*`**；必须经由 `src/electronBridge/index.ts`。
- 文件命名：Vue 组件使用 PascalCase（如 `MyComponent.vue`），TS/JS 文件使用 camelCase（如 `myUtils.ts`）。
- 长任务 / 频繁调用的逻辑放到 `src/composables/` 或 `src/views/<Page>/` 下的 composable 中。

### 6.2 Python
- 遵循 PEP 8 规范，使用 Type Hints 增加代码可读性。
- 文件命名：snake_case（如 `my_module.py`）。
- Django View 必须接 DRF 的 `Request` 类型；普通函数式 View 走 `rest_framework.decorators.api_view`。
- 异步 SSE 走 `StreamingHttpResponse` + `dwebapp/ai/api/chat/utils._sse`，**不要** 引入 `sse-starlette` 等第三方 SSE 库。

### 6.3 JavaScript / Node（Electron 主进程）
- 使用 ES Modules（`import / export`）；**不要** 使用 `require`（除非 `createRequire` 的特殊场景）。
- 文件后缀：`.mjs`。
- 主进程错误必须带可读上下文（`console.error('[dweb-protocol] ...', err)`）。
- 异步 IO 优先；同步 IO（`fs.readFileSync`）仅在启动期或必要的最后手段使用。

## 7. 测试与质量

- **单元测试**: Vitest (`npm run test`)，测试文件命名 `*.spec.ts`，位于源文件同级或 `__tests__/`。
- **类型检查**: `npm run typecheck`（vue-tsc --noEmit）。
- **Lint**: `npm run lint`（ESLint，`src/**/*.{ts,vue}` 与 `electron/**/*.{mjs,js}`）。
- **质量门禁**: `npm run quality` 一次跑 typecheck + lint + test。
- **覆盖率**: `npm run test:coverage`（@vitest/coverage-v8，输出至 `coverage/`）。

## 8. 破坏性修改警告

- 在修改 `src/engine/webgl/`（WebGL2 渲染引擎）、`src/core/scene/`（舞台核心）或 `electron/localdb/migrations.mjs`（数据库结构）时，必须极其谨慎：
  - WebGL 引擎变更可能导致整个编辑器崩溃；
  - 场景核心变更可能导致历史项目无法打开；
  - 数据库结构变更需保留向后兼容路径（保留旧字段、写新表、提供 `migrateFromDjango`）。
- 修改前请先读 `agent_docs/` 相关文档并保留旧字段（不要直接删除）。

## 9. 提交与 Git

- `package.json` 已配置 `postinstall` 自动安装 git hooks（`core.hooksPath = .githooks`）。
- pre-push hook 会阻止未通过质量门禁的提交。
- 提交前先 `npm run quality`；CI / 推送失败时先看 pre-push 报告。
- 单一目的提交（atomic commit），每个 commit 限定一个主题。
- 提交信息建议格式：`<scope>: <subject>`，如 `electron: add dweb:// project asset protocol`。

## 10. 与 AGENT_GUIDE 的关系

本文件描述「不要做什么」与「边界」；如需了解「如何做」，请按需查阅：

- [02_ARCHITECTURE.md](02_ARCHITECTURE.md) — 系统架构
- [03_FRONTEND_GUIDE.md](03_FRONTEND_GUIDE.md) — 前端开发
- [04_BACKEND_GUIDE.md](04_BACKEND_GUIDE.md) — 后端开发
- [05_ELECTRON_GUIDE.md](05_ELECTRON_GUIDE.md) — 桌面端开发
- [06_AI_WORKFLOW_GUIDE.md](06_AI_WORKFLOW_GUIDE.md) — AI 工作流
