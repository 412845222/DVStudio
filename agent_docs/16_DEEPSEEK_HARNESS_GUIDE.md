# DeepSeek-Harness (DSH) 集成指南

> **最后更新**：2026-09-08
> **适用范围**：DVStudio 客户端与外部 DeepSeek-Harness 服务的集成链路，包括服务管理、DSHAgent 流式对话、IPC 代理与 WebSocket mux 协议。

## 1. 概述

DeepSeek-Harness（以下简称 DSH）是一个独立的 Agent 运行时服务（独立于 DVStudio 的 Electron 进程）。DVStudio 通过以下方式与其集成：

- **服务管理**：在 DVStudio 的「服务中心」页面启动/停止/监控 DSH 子进程
- **DSHAgent 流式对话**：在 AI 工作流蓝图的 Agent 对话框中，以 `dshagent` 后端类型发起会话，获取 DSH 侧的实时流式回复
- **IPC 代理**：渲染进程不直接访问 DSH（避免 CORS），所有 HTTP/WebSocket 请求通过 Electron 主进程代理

## 2. 后端模块结构

模块位于 `electron/backend/modules/deepseek-harness/`，遵循标准的 `routes.mjs` → `handlers.mjs` → `service.mjs` 三层结构。

| 文件 | 职责 |
|------|------|
| `routes.mjs` | 注册 IPC 通道（`dweb:deepseek-harness:setup:*`），含流式通道 `dshAgentStream` |
| `handlers.mjs` | IPC handler 实现，含 `dshAgentStream`（WebSocket mux 流式代理核心） |
| `service.mjs` | 服务状态机、URL/token 管理、事件分发 |
| `processManager.mjs` | DSH 子进程 spawn/生命周期、端口探测与**自动释放**、启动参数探测 |
| `commands.mjs` | 命令执行、环境变量清洗（剥离 NODE_OPTIONS/ELECTRON_RUN_AS_NODE） |
| `startupProbe.mjs` | 启动参数动态探测（从源码解析 flag，避免硬编码不支持的参数） |
| `sourceManager.mjs` | DSH 源码定位（localPath 探测，确保 dev 模式入口正确） |
| `runtimeAdapter.mjs` | announcedUrl 适配 |
| `diagnostics.mjs` | 服务诊断 |
| `autoSetup.mjs` | 自动环境检测 |
| `serviceEvents.mjs` | 事件 redact（日志脱敏） |

### 关键约束（来自 project memory）

- **不修改现有 Electron 客户端功能**，所有变更隔离在 deepseek-harness 模块
- 启动参数必须从源码动态探测，禁止硬编码
- dev 模式优先使用 `tsx/esm` loader + `src/bin.ts`
- 环境检查必须剥离 `NODE_OPTIONS` 和 `ELECTRON_RUN_AS_NODE`，防止调试器文本污染

## 3. 服务生命周期管理

### 启动流程

```
startService → probe(profile) → freePort(port) [新增] → portIsOpen 检查
  → probeSupportedFlags → buildLaunchArgs → spawnManaged → 状态机: preparing → running
```

### 端口自动释放（2026-09-08 新增）

**问题**：用户从服务页面手动启动 DSH 时，若端口 3080 被占用（如上次进程未正常退出），会报 `PORT_IN_USE` 且不停止外部进程。

**解决**：在 `processManager.mjs` 启动流程中，端口占用检查之前先调用 `freePort(port)`：

- `findPidsOnPort(port)`：Windows 用 `netstat -ano` 解析 LISTENING 行提取 PID；其他平台用 `lsof -ti:<port>`
- 用 `taskkill /F /PID <pid> /T`（Windows）或 `SIGKILL`（其他）终止占用进程
- 轮询等待端口释放（最多 3 秒/次，最多 3 次）
- 每步通过 `events.log('system', '[端口清空] ...')` 输出日志，用户可在服务页面看到

**注意**：`freePort` 只杀监听目标端口的进程，不会误杀无关进程。

## 4. DSHAgent 流式对话链路

### 整体架构

```
渲染进程 (Agent 对话框)
  └─ BottomChatDock.vue (选择 dshagent 后端)
     └─ useAIWorkflowChatGeneration.ts
        └─ DSHAgentChatService (IChatService 实现)
           └─ DshStreamClient
              ├─ 非 Electron: DshTransport (直连 HTTP+WS)
              └─ Electron:   DshIpcTransport → IPC → handlers.dshAgentStream (主进程)
                                                    └─ ws 包 → DSH /api/remote.mux
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `src/network/chat/dshAgentProtocol.ts` | DSH JSON-RPC 协议定义 + `DshTransport`（非 Electron 直连实现）+ `DshTransportLike` 接口 |
| `src/network/chat/dshStreamClient.ts` | 独立流式客户端，将 DSH 事件归一化为 `DshStreamEvent` |
| `src/network/chat/dshIpcTransport.ts` | Electron 环境传输层，通过 IPC 调用主进程代理 |
| `src/network/chat/DSHAgentChatService.ts` | 适配 `IChatService` 接口，桥接到 `AgentChatBridge` |
| `src/network/chat/AgentChatBridge.ts` | Agent 后端注册中心，注册 `dshagent` |
| `src/network/chat/types.ts` | `AgentBackendType` 含 `'dshagent'` 枚举 |
| `src/electronBridge/deepseekHarness.ts` | 渲染端 IPC 桥接（`dshAgentStream` 流式通道） |

### DshStreamClient 事件映射

`streamPrompt` 消费 `DshHistoryEvent`，产出归一化 `DshStreamEvent`：

| DSH 事件类型 | 映射输出 | 说明 |
|-------------|---------|------|
| `assistant-stream` (chunk + text-delta) | `{ type: 'text', content }` | session/follow 实时流式文本 |
| `assistant-stream` (chunk + reasoning-delta) | `{ type: 'thinking', content }` | 思考过程 |
| `assistant-stream` (start/end) | 无输出 | 流控制帧 |
| `assistant/chunk` (text-delta) | `{ type: 'text', content }` | session.history 轮询格式 |
| `assistant/message` | `{ type: 'text', content }` | 完整消息 |
| `tool/call` | `{ type: 'tool_call_start', ... }` | 工具调用开始 |
| `tool/result` (成功) | `{ type: 'tool_call_end', ... }` | 工具调用完成 |
| `tool/result` (含 error) | `{ type: 'tool_call_error', ... }` | 工具调用失败 |
| `turn/end` | `{ type: 'done' }` | 本轮结束 |
| `__error__` | `{ type: 'error', message }` | 传输层错误 |

### session/follow WebSocket mux 协议

DSH 提供 `/api/remote.mux` WebSocket 端点用于实时事件流。关键协议细节：

1. **Open 帧格式**：
```json
{
  "type": "open",
  "streamId": "<uuid>",
  "endpoint": "session/follow",
  "payload": {
    "args": {
      "request": { "address": { "kind": "session", "sessionId": "..." } },
      "assistantStream": true
    }
  }
}
```

⚠️ **必须传 `assistantStream: true`**，否则 DSH 只下发 snapshot + entry 事件，**不会推送 LLM 的 text-delta 实时输出**，导致非流式 + 内容重复。

2. **帧类型**：
   - `snapshot`：会话当前状态快照（含 cursor、records、assistantStream baseline）
   - `event`：实时历史事件
   - `assistant-stream`：LLM 实时流帧（start/chunk/end）

3. **prompt 发送**：`session/prompt` 方法，`mode: 'queue'`，content 为 `[{ type: 'text', text: '...' }]`

### CORS 绕过方案

渲染进程直接 `fetch`/`WebSocket` 本地 DSH 会触发 CORS。解决方案：

- **HTTP 调用**：渲染端通过 `ipcRenderer.invoke('dweb:deepseek-harness:setup:proxyCall', ...)` 转发到主进程，主进程用 `fetch` 调用 DSH 并返回结果
- **WebSocket 流式**：渲染端通过 `ipcRenderer.invoke('dweb:deepseek-harness:setup:dshAgentStream', ...)` 获取流式 IPC，主进程用 `ws` 包连接 DSH 的 `/api/remote.mux`，逐帧回传

### 主进程 WebSocket 实现注意

Electron 主进程的 Node.js 运行时**没有全局 `WebSocket`**（Node 20 不含，Node 21+ 才有）。因此 `handlers.mjs` 必须从 `ws` 包导入：

```js
import { WebSocket } from 'ws'
```

`ws` 已加入 `package.json` 依赖。`ws` 的 API（`.on('open')`/`.on('message')`/`.send()`/`.close()`/`.readyState`）与浏览器 WebSocket 兼容。

## 5. 前端 UI 集成

### Agent 对话框

- `BottomChatDock.vue`：在后端选择器中新增 `dshagent` 选项；选择后**隐藏二级菜单**（模型/思考强度选择器，因为 DSH 模型在其 webUI 配置）
- `useAIWorkflowChatGeneration.ts`：DSHAgent 分支在发起会话前检查服务状态（`snapshot()` → `status.ready && lifecycle === 'running' && runId`），未就绪时提示「请在服务页面启动 DeepSeek-Harness」
- `AIWorkflowPage.vue`：切换后端时清空会话缓存

### 输入框清空（2026-09-08 修复）

**Bug**：发送消息后输入框内容未清空。

**根因**：`BottomChatDock.vue` 中 `watch(props.modelValue)` 只在 `editorChips.length > 0` 时调用 `editor.clear()`。纯文本发送无 chip 时，contenteditable 编辑器不会被清空。

**修复**：当 `modelValue` 变空时，无条件调用 `editor.clear()`。

## 6. 测试

### 现有测试

| 测试文件 | 覆盖范围 |
|---------|---------|
| `tests/unit/network/chat/dshStreamClient.test.ts` | DshStreamClient 事件映射（text-delta/reasoning-delta/tool/turn/end/error）、createSession、isAvailable（17 个用例） |
| `tests/unit/electron/deepseek-harness/preloadRoutes.test.ts` | preload 与后端路由通道一致性 |
| `tests/unit/electron/deepseek-harness/processManager.test.ts` | 进程管理逻辑 |
| `tests/unit/electronBridge/deepseekHarness.test.ts` | 渲染端 IPC 桥接 |

### 测试策略

- `DshStreamClient` 通过注入 mock `DshTransportLike` 测试事件映射逻辑（纯函数式，不依赖网络）
- 后端 handler 测试通过 mock `electron` 模块验证 IPC 通道注册

## 7. 常见问题排查

| 现象 | 原因 | 解决 |
|------|------|------|
| 启动报 `PORT_IN_USE` | 端口被占用 | 已自动释放；若失败手动 `taskkill /F /PID <pid>` |
| `WebSocket is not defined` | 主进程无全局 WebSocket | 从 `ws` 包导入 |
| 回复非流式 + 内容重复 | `session/follow` 未传 `assistantStream: true` | 在 open 帧 args 中补上 |
| 渲染端 CORS 报错 | 直连本地 DSH | 走 IPC 代理（`DshIpcTransport`） |
| 输入框发送后未清空 | watch 条件错误 | 已修复：无条件 clear |
| `session/create` 无 sessionId | 响应格式变化 | 检查 DSH 版本 API 契约 |

## 8. 开发 Checklist

新增/修改 DSH 链路时：

- [ ] 不修改 Electron 客户端现有功能，变更隔离在 deepseek-harness 模块
- [ ] 启动参数从源码动态探测，不硬编码
- [ ] 流式链路必须走 WebSocket mux（`session/follow`），不要用轮询
- [ ] `session/follow` open 帧必须含 `assistantStream: true`
- [ ] 主进程 WebSocket 从 `ws` 包导入，不用全局
- [ ] 渲染端走 IPC 代理，不直连 DSH
- [ ] 新增文件必须通过 `prettier --check`、`vue-tsc --noEmit`、`npm run test`
