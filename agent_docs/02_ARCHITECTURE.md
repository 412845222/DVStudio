# 系统架构 (Architecture)

## ⚠️ 重要架构变更（2026-07 更新）

**Django 依赖已完全移除（2026-06）**。项目后端已从「Django 子进程 + HTTP 服务器」架构重构为「纯 Electron 主进程 Node.js IPC 后端」架构。

**2026-07 重大扩展**：在 IPC 后端基础上新增 Agent 运行时、MCP 服务器、CLI 适配器层、3D 编辑器、Blender 集成、多模型生成等能力：

- 后端模块从 13 个扩展至 **20 个**（新增 agent/mcp/cli-adapters/cloud-templates/blender/tripo3d/ark/gemini）
- LocalDB 仓库从 6 个扩展至 **14 个**
- Electron 桥接命名空间扩展至 **24 个**
- 路由从 7 个扩展至 **9 个**（新增 /3d-editor、/template-center）
- Vuex Store 从 5 个扩展至 **6 个**（新增 i18n）
- 内置 MCP 服务器（stdio + socket 双桥接）
- Agent Runtime 统一 LLM Provider 抽象
- Python 仅作为可选 Bridge 用于特定计算任务（如字幕处理），非核心依赖
- LocalDB（better-sqlite3）是唯一数据事实来源

## 1. 全栈架构

DVStudio 采用 **前端 (Vue 3 + WebGL2 + Three.js) + 平台桥接层 (Platform Bridge) + Agent/MCP 层 + 后端 (Electron Node.js IPC) + 桌面端壳 (Electron + LocalDB + dweb:// 协议 + Platform Abstraction)** 的多层架构。

- **前端 (Frontend)**: 负责 UI 渲染、WebGL2 2D 画布绘制、Three.js 3D 渲染、状态管理 (Vuex 6 模块)、用户交互；通过 Electron IPC 桥访问本地能力与后端服务，通过平台桥接层访问 Steam 等平台能力。
- **平台桥接层 (Platform Bridge)**: `src/platformBridge/` 提供前端侧的平台能力抽象（Steam 等），通过 Electron IPC 与主进程平台层通信，Web 模式下自动降级为 Mock。
- **Agent 层 (Agent Runtime)**: `electron/backend/modules/agent/` 提供统一 Agent 执行引擎，抽象 LLM Provider（Api/Cli/Codex/Copilot/DVSAgent），管理工具注册（ToolRegistry）、上下文构建（ContextBuilder）、流式对话。
- **MCP 层 (MCP Server)**: `electron/backend/modules/mcp/` 内置 Model Context Protocol 服务器，支持 stdio/socket 双桥接，注册内置工具（builtinTools），通过 toolExecutor 统一执行。
- **后端 (Backend)**: 运行在 Electron 主进程的 Node.js IPC 后端（20 个模块），负责 AI 接口代理（DeepSeek/Gemini/Meshy/Tripo3D/Seedance/Ark 等外部 API 直连）、IPC 流式对话、组件库、Agent Skills、CLI 适配器、云端模板、项目数据持久化、ComfyUI/Blender 桥接、导出服务、字幕处理。
- **桌面端 (Desktop)**: Electron 主进程承担多重职责——
  - 承载 Node.js IPC 后端（`electron/backend/`，20 个模块）
  - 承载本地 SQLite 数据库（`electron/localdb/`，14 个仓库）
  - 注册 `dweb://project-assets` 自定义协议直接读取项目资产
  - 提供 Python 环境检测与可选 Python Bridge 支持
  - 提供 Blender 环境检测与工作空间管理
  - 启动 MCP 服务器（stdio + socket 双桥接）
  - **平台抽象层**（`electron/platform/`）：管理 Steam 等平台提供者，加载原生模块，处理平台事件泵
  - 通过 IPC（`window.dweb.*`，24 个命名空间）向前端暴露本地能力与平台能力
  - 内置 Unreal HTTP 服务器（用于 Unreal Engine 集成，位于 agent-skills 模块）

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
│   ├── electronBridge/           # Electron IPC 桥接封装（index.ts + types.ts，24 个命名空间）
│   ├── engine/                   # WebGL2 渲染引擎（canvas / scene / renderers / shaders / texture / camera / picking / pipeline / material / resources）
│   │   ├── canvas/
│   │   ├── material/             # 基础 2D shader 与圆角矩形/蒙版材质
│   │   ├── renderers/            # 渲染器（BaseRenderer / NodeRenderer / RectRenderer / TextRenderer / ImageRenderer / LineRenderer）
│   │   ├── resources/            # 资源管理（DwebImagePool 图片池等）
│   │   ├── scene/                # 场景管理（DwebVideoScene）
│   │   └── shaders/              # 着色器（postBlur 模糊）
│   ├── model3d/                  # 3D 编辑器核心（Three.js 场景、编辑器逻辑）
│   ├── network/                  # API 服务封装 + IPC 客户端
│   │   ├── ipcClient.ts          # IPC 统一客户端（ipcCall / ipcStream / unwrapIpcResult）
│   │   ├── AIChatService.ts      # AI 对话（流式 IPC，通过 Agent Runtime）
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
│   ├── router/                   # Vue Router 4 路由表（9 个路由）
│   ├── store/                    # Vuex 状态（aiworkflow / timeline / videoscene / videostudio / theme / i18n）
│   ├── styles/                   # 全局样式（theme-tokens / workflow 子样式）
│   ├── types/                    # TypeScript 类型定义（electron-bridge.d.ts / three-rect-area-light.d.ts）
│   ├── ui/                       # UI 组件库
│   │   ├── AIChat/               # AI 对话（AIChatDialog）
│   │   ├── BluePrint/            # 工作流画布（BlueprintCanvas + node-dialog/）
│   │   ├── Electron/             # Electron 启动环境（CommandConsole / EnvCheckList）
│   │   ├── Model3D/              # 3D 编辑器组件（EditorToolbar / 属性面板等）
│   │   ├── Steam/                # Steam 组件（SteamFriendsList / SteamPanel 等）
│   │   ├── TimeLine/             # 时间轴（TimeLine + components/ + core/）
│   │   ├── UIComponent/          # 通用 UI（GlobalTitleBar / GlobalSideNav / ModalDialog / ToastStack / ToolCallCard / ThinkingBlock 等）
│   │   ├── User/                 # 用户组件（UserAvatar / UserButton / UserMenu）
│   │   ├── VideoScene/           # 视频场景编辑器（VideoScene + anim/ + panels/ + parts/ + ruler/）
│   │   └── WorkFlow/             # 工作流 UI（WorlFlowNodes/ + WorkflowNodeBase / WorkflowEdgeLayer 等）
│   ├── views/                    # 页面级组件
│   │   ├── AIWorkflow.vue        # 工作流页面（包装器）
│   │   ├── AIWorkflow/           # 工作流页面实现（assets / blueprint-core / bridge / concurrency / network / node-business / node-screenshot / ui）
│   │   │   ├── ResourceManagerWindow.vue  # 资源管理器窗口
│   │   │   └── TemplateCenterWindow.vue   # 模板中心窗口
│   │   ├── ImageMarkupPreviewPage.vue
│   │   ├── Model3DEditorPage.vue # 3D 模型编辑器页面
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
│   ├── main.mjs                  # 主进程入口（注册 dweb 协议、平台预检、环境准备、初始化 LocalDB、平台层、MCP、后端）
│   ├── preload.mjs               # 预加载脚本（contextBridge.exposeInMainWorld('dweb', ...)，24 个命名空间）
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
│   ├── backend/                  # Node.js IPC 后端（核心，20 个模块）
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
│   │   ├── modules/              # 功能模块（按业务域划分，共 20 个）
│   │   │   ├── system/           # 系统健康检查、迁移状态、诊断
│   │   │   ├── projects/         # 项目 CRUD
│   │   │   ├── project-assets/   # 项目资产元数据
│   │   │   ├── chat/             # AI 对话（adapters/：base/bytedance/gemini/openai-compatible 多供应商）
│   │   │   ├── comfyui/          # ComfyUI 桥接
│   │   │   ├── meshy/            # Meshy 3D 生成
│   │   │   ├── tripo3d/          # Tripo3D 3D 生成
│   │   │   ├── seedance/         # Seedance 视频生成
│   │   │   ├── ark/              # Ark 视频生成（字节火山引擎）
│   │   │   ├── gemini/           # Gemini 视频生成
│   │   │   ├── third-party/      # 三方 API 统一网关（NanoBanana / SeeDream / 即梦 / jimeng / blueprint）
│   │   │   ├── editor/           # 编辑器后端（组件库等）
│   │   │   ├── export/           # 导出服务（ffmpeg 调用）
│   │   │   ├── subtitle/         # 字幕处理（部分通过 Python Bridge）
│   │   │   ├── agent-skills/     # Agent Skills（场景理解/灯光/布局/Unreal 导出，含 Unreal HTTP 服务器）
│   │   │   ├── agent/            # Agent 运行时
│   │   │   │   ├── runtime/      # AgentRuntime / ContextBuilder / ToolRegistry / ToolImageProcessor
│   │   │   │   ├── providers/    # ILLMProvider 接口 + 5 个实现（Api/Cli/Codex/Copilot/DVSAgent）+ index.mjs 工厂
│   │   │   │   └── dvsagent/     # DVSAgentEnhancedProvider + LLMClient
│   │   │   ├── mcp/              # MCP 服务器
│   │   │   │   └── server/       # DVStudioMCPServer + stdioBridge + socketBridge
│   │   │   ├── cli-adapters/     # CLI 适配器层
│   │   │   │   └── (base / manager / claudeCli / codexCli / copilotCli / cliConfigStore)
│   │   │   ├── cloud-templates/  # 云端模板中心
│   │   │   │   └── adapters/     # base / factory / local / steam 双适配器
│   │   │   └── blender/          # Blender 集成（config / workspace / service + MCP 桥接）
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
│   ├── localdb/                  # 本地 SQLite 数据库（better-sqlite3，唯一事实来源，14 个仓库）
│   │   ├── db.mjs                # better-sqlite3 实例管理 + ABI 错误友好提示
│   │   ├── index.mjs             # 多路径回退初始化（backendDataDir → userDataDir → tmpdir → homedir）
│   │   ├── migrations.mjs        # 基于 PRAGMA user_version 的迁移
│   │   ├── json.mjs              # JSON / ISO ↔ 毫秒 辅助
│   │   ├── repos/                # 仓库层（14 个）
│   │   │   ├── projects.mjs              # 项目仓库
│   │   │   ├── meshyTasks.mjs            # Meshy 任务仓库
│   │   │   ├── videoTasks.mjs            # 视频任务仓库
│   │   │   ├── tripo3dTasks.mjs          # Tripo3D 任务仓库
│   │   │   ├── arkTasks.mjs              # Ark 任务仓库
│   │   │   ├── geminiTasks.mjs           # Gemini 任务仓库
│   │   │   ├── exportJobs.mjs            # 导出任务仓库
│   │   │   ├── comfyuiJobs.mjs           # ComfyUI 任务仓库
│   │   │   ├── comfyuiWorkflows.mjs      # ComfyUI 工作流仓库
│   │   │   ├── editorComponents.mjs      # 编辑器组件仓库
│   │   │   ├── chatConversations.mjs     # AI 对话会话仓库
│   │   │   ├── aiworkflowTemplates.mjs   # AI 工作流模板仓库
│   │   │   ├── refImageCache.mjs         # 参考图缓存仓库
│   │   │   └── apiKeys.mjs               # API 密钥仓库（AES-256-GCM + PBKDF2 加密）
│   │   └── ipc/
│   │       ├── ipcHost.mjs       # 前端 → LocalDB IPC 主机
│   │       └── djangoMigrate.mjs # Django 数据迁移辅助（仅用于迁移清理）
│   └── static/                   # 静态资源（打包时复制到 extraResources）
│       ├── bootstrap/            # Python 引导安装脚本（可选）
│       │   ├── manifest.json
│       │   ├── windows/
│       │   └── mac/
│       └── unreal-plugin/        # Unreal 插件源码（DwebWorkflowBridge + 打包 zip）
│
├── tests/                        # 测试目录（Vitest）
│   ├── unit/                     # 单元测试（按业务域组织）
│   │   ├── agent/                # Agent 模块测试
│   │   ├── aiworkflow/           # AI 工作流测试（节点库/视口/画布/锚点等）
│   │   ├── config/               # 配置测试
│   │   ├── core/                 # 核心业务测试（components/events/history/project/scene/shared/subtitle/timeline）
│   │   ├── electron/             # Electron 相关测试
│   │   ├── electronBridge/       # Electron 桥接测试
│   │   ├── i18n/                 # 国际化测试
│   │   ├── model3d/              # 3D 编辑器测试
│   │   ├── network/              # 网络服务测试（AIWorkflow/SceneSkill/AIChat 等）
│   │   ├── store/                # Vuex Store 测试
│   │   ├── views/                # 视图测试
│   │   └── workflow/             # 工作流测试（blender/meshy/sceneLayout/tripo3d/unreal）
│   ├── components/               # 组件测试（ui/Model3D, ui/通用组件）
│   ├── engine/                   # 引擎测试（camera2d 等）
│   └── scripts/                  # 脚本测试（sync-version, steam-upload）
│
├── samples/                      # 示例文件
├── scripts/                      # 工具脚本（dist-win / dist-mac / perf 分析 / better-sqlite3 rebuild / steam setup / unreal-plugin 打包）
├── public/                       # 公共资源
├── .githooks/                    # Git hooks（pre-push）
├── build/                        # 打包图标与安装程序资源
├── DVSResource/                  # 运行时资源根（开发模式默认，便携模式数据目录）
├── index.html                    # Vite 入口
├── package.json                  # 前端 + Electron 依赖与脚本（50+ 个 npm scripts）
├── AGENT_GUIDE.md                # AI Agent 总入口
├── agent_docs/                   # AI Agent 详细文档（00-12）
└── README.md                     # 项目 README（中英双语）
```

## 3. 数据流转机制

### 3.1 通用流程
1. **用户交互**: 用户在 Vue 组件中触发操作。
2. **状态更新**: 组件调用 Vuex Action/Mutation 更新全局状态，或调用 `ref/reactive` 更新组件局部状态；平台事件（如 Steam 好友状态变化）通过平台桥接层回写到 Vuex。
3. **渲染更新**: 状态变更驱动 Vue 响应式 UI 更新，或触发 WebGL2/Three.js 引擎重新渲染。
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
7. 流式请求：handler 是异步生成器，通过三通道模式（`:data`/`:end`/`:error`）发送数据块。
8. 前端 `ipcClient` 自动解包结果或处理流，返回给 Service 层。

### 3.3 Agent 工具调用流程
1. 前端通过 `window.dweb.agent.stream()` 发起 Agent 流式对话。
2. Agent Runtime 接收消息，通过 ContextBuilder 构建上下文。
3. AgentRuntime 选择 LLM Provider（ApiLLMProvider/CliLLMProvider/DVSAgentProvider 等）发送请求。
4. 若 LLM 返回工具调用请求，AgentRuntime 通过 ToolRegistry 查找对应工具。
5. 工具可能来自：MCP 服务器注册的工具（通过 mcp/toolExecutor 执行）、Agent Skills 内置工具。
6. 工具执行结果回传给 LLM，继续多轮对话。
7. 流式响应通过 IPC 三通道模式推送到前端。
8. 对话记录通过 `ctx.repos.chatConversations` 持久化到 LocalDB。

### 3.4 MCP 工具执行流程
1. MCP 服务器（DVStudioMCPServer）启动时注册内置工具（registerBuiltinTools）和外部 MCP 工具。
2. 支持双桥接：stdioBridge 用于标准输入输出连接，socketBridge 用于 TCP Socket 连接。
3. 前端通过 `window.dweb.mcp.list-tools()` 列出可用工具，通过 `window.dweb.mcp.call-tool()` 调用工具。
4. toolExecutor 统一管理工具调用执行，包括参数验证、错误处理、超时控制。
5. Agent Runtime 通过 ToolRegistry 发现 MCP 工具，将其纳入 Agent 可调用工具集。
6. Blender 等外部进程通过 MCP 桥接连接到 DVStudioMCPServer，暴露 Blender 专用工具。

### 3.5 CLI 适配器流程
1. 前端通过 `window.dweb.cli.*` 管理 CLI 适配器（Claude/Codex/Copilot）。
2. CLIAdapterManager 管理适配器生命周期：check-environment → start-session → send-message:stream → stop-session。
3. 每个 CLI 适配器继承自 base.mjs 基类，实现统一的 start/stop/send/cancel 接口。
4. CliLLMProvider 在 Agent Runtime 中通过 CLI 适配器调用 CLI 工具，将其作为 LLM Provider 使用。
5. cliConfigStore 持久化 CLI 配置到本地。

### 3.6 3D 编辑器数据流
1. 用户进入 `/3d-editor` 路由，Model3DEditorPage.vue 初始化 Three.js 场景。
2. 3D 模型加载通过 dweb:// 协议从项目资产目录读取，或通过 `window.dweb.tripo3d.*` 从 Tripo3D 生成结果加载。
3. Blender 集成通过 `window.dweb.blender.*` 管理 Blender 工作空间、导入模型、执行脚本。
4. Agent/MCP 辅助通过 `window.dweb.agent.*` / `window.dweb.mcp.*` 提供 AI 辅助（如场景理解、材质生成）。
5. Three.js 渲染管线（SSAO/Bloom/ColorCorrection/FXAA）在前端独立线程/帧循环中运行，不阻塞 UI。

### 3.7 项目资产加载（dweb:// 协议）
1. 前端从项目元数据中拿到 `projectId` 与 `path`（项目内相对路径）。
2. 构造 URL `dweb://project-assets?projectId=<id>&path=<rel>` 并赋给 `<img src>` / `fetch()` / Three.js 纹理加载器。
3. Electron 主进程的协议处理器（`projectAssetProtocol.mjs`）拦截该 URL，**不经过任何后端模块**，直接从磁盘读取并返回。
4. 写操作（upload/import/delete/repair）由前端通过 `window.dweb.projectAssets.*` IPC 调用主进程 `projectStaticAssets/service.mjs`，在主进程内直接落盘。

### 3.8 本地数据库访问
1. 前端通过 `window.dweb.db.*` 或后端模块通过 `ctx.repos.*` 访问 LocalDB。
2. `ipcHost.mjs` 中按 channel 路由到对应的 14 个 repo。
3. 仓库层封装 SQL，序列化时把 `TEXT` 字段的 ISO 时间戳 / 可选 JSON 解析回原始 JS 形态。
4. 所有 IPC handler 由 `safe()` 包装：若 LocalDB 尚未初始化，**自动用 fallback 路径重试**，避免启动竞态。
5. **LocalDB 是唯一事实来源**，不再有 Django SQLite 镜像。

### 3.9 平台能力调用
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

所有 IPC 通道遵循 `dweb:<module>:<action>` 命名规范（ark 模块使用 `dweb.ark.<action>` 点分隔，历史遗留）：

| 模块 | Channel 前缀 | 职责 | 核心 Channels |
| --- | --- | --- | --- |
| system | `dweb:system:` | 系统健康检查、诊断 | `ping`, `migration-checklist` |
| projects | `dweb:projects:` | 项目 CRUD | `list`, `save`, `load`, `delete`, `open-folder` |
| project-assets | `dweb:project-assets:` | 项目资产元数据 | `list`, `get-metadata` |
| chat | `dweb:chat:` | AI 对话（适配器模式） | `sendMessage` (stream), `listModels` |
| comfyui | `dweb:comfyui:` | ComfyUI 桥接 | `submit`, `status`, `result`, `runtime:*`, `workflows:*` |
| meshy | `dweb:meshy:` | Meshy 3D 生成 | `submit`, `status`, `download` |
| tripo3d | `dweb:tripo3d:` | Tripo3D 3D 生成 | `health`, `generate`, `generate:text-to-image`, `generate:image-to-*`, `get-task`, `list-tasks`, `balance`, `upload-file` |
| seedance | `dweb:seedance:` | Seedance 视频生成 | `submit`, `status` |
| ark | `dweb.ark.` | Ark 视频生成（点分隔） | `listTasks`, `getTaskDetail`, `deleteTask`, `recordTask` |
| gemini | `dweb:gemini:` | Gemini 视频生成 | `health`, `get-task`, `list-tasks`, `cancel`, `delete`, `clear-completed`, `get-image-path` |
| third-party | `dweb:third-party:` | 三方 API 网关 | `nanobanana:*`, `seedream:*`, `jimeng:*`, `blueprint:*` |
| editor | `dweb:editor:` | 编辑器后端 | `component-library:list`, `component-library:save` |
| export | `dweb:export:` | 导出服务 | `submit`, `status` |
| subtitle | `dweb:subtitle:` | 字幕处理 | `parse`, `format`, `ai-understand` (stream) |
| agent-skills | `dweb:agent-skills:` | Agent Skills | `scene-understand` (stream), `scene-lighting`, `scene-layout`, `unreal-export` |
| agent | `dweb:agent:` | Agent 运行时 | `stream` (stream), `context`, `abort`, `list-conversations`, `create/delete/rename-conversation`, `get/add-conversation-messages` |
| mcp | `dweb:mcp:` | MCP 服务器 | `connect`, `disconnect`, `list-tools`, `call-tool`, `register-builtin`, `get-status`, `list-servers`, `get-bridge-status`, `get-bridge-script` |
| cli | `dweb:cli:` | CLI 适配器 | `check-availability`, `list-adapters`, `start/stop-session`, `send-message:stream` (stream), `cancel`, `check-environment`, `list-models`, `get/save/reset-config`, `run-fix`, `start-auth:stream` (stream) |
| cloud-templates | `dweb:cloud-templates:` | 云端模板 | `get-platform`, `get-quota`, `list`, `upload`, `download`, `delete` |
| blender | `dweb:blender:` | Blender 集成 | `status:check`, `mcp:connect/disconnect/status/call-tool`, `import:model`, `tools:check/mount`, `workspace:*` |
| localdb / db | `dweb:localdb:` / `dweb:db:` | LocalDB 直接访问 | `projects:*`, `meshy:*`, `video:*`, `tripo3d:*`, `api-keys:*`, `templates:*` 等 |
| platform | `dweb:platform:` | 平台能力 | `get-status`, `get-user`, `get-friends`, `open-overlay-url` |
| common | `dweb:common:` | 通用能力 | `get-app-info`, `get-backend-status`, `open-devtools`, `setup:*` |
| aiworkflow | `dweb:aiworkflow:` | 工作流相关 | `register-project-root`, `upload-asset`, `open-resource-manager` |
| videostudio | `dweb:videostudio:` | 视频工作室 | 编辑器相关操作 |
| codex | `dweb:codex:` | Codex CLI（兼容保留） | `sendMessage` (stream) |
| window | `dweb:window:` | 窗口控制 | `minimize`, `maximize`, `reload`, `toggle-devtools` |

> **流式通道**：标记为 `stream: true` 的通道使用三通道模式，前端通过 `*:stream` invoke 启动流，然后通过事件接收数据。

## 6. Electron 主进程职责与启动时序（`electron/main.mjs`）

### 6.1 启动时序（简化）

1. **app.ready 之前**：
   - `protocol.registerSchemesAsPrivileged([{ scheme: 'dweb', ... }])` 注册 dweb 协议为 privileged。
   - **平台预检**：调用 `platformPreflight()`；若返回 `restart`（需要通过 Steam 客户端启动），则退出当前进程。

2. **app.whenReady().then(...) 内按顺序执行**：
   - 创建主窗口（BrowserWindow）
   - 配置便携模式路径（检测安装目录是否可写）
   - 初始化运行时日志与崩溃诊断
   - **初始化 LocalDB**（`initLocalDb`）—— 多路径回退，创建/迁移数据库（14 个仓库）
   - **初始化平台层**（`platformInit()`）—— 加载原生模块、启动事件泵
   - **运行环境准备流程**（`runSetupWorkflow()`）：
     - Python 环境检测（可选）
     - 创建资源目录（DVSResource/ 结构）
     - 初始化 Python Bridge（可选）
     - 初始化 Node.js IPC 后端（`initBackend`）—— 注册所有 20 个模块路由
     - **初始化 MCP 服务器** —— 启动 stdio/socket 双桥接，注册内置工具
     - Blender 环境检测（可选）
     - 检测 ffmpeg（可选）
   - 注册 dweb 协议处理器（`registerDwebProjectAssetProtocol`）
   - 注册 LocalDB IPC（`registerLocalDbIpc`）
   - 注册平台层 IPC（`registerPlatformIpc`）
   - 注册项目静态资产等其他 IPC
   - **绑定主窗口到平台层**（`setMainWindowForPlatform(win)`）—— 用于 Overlay 等需要窗口句柄的功能
   - 启动 Unreal HTTP 服务器（agent-skills 模块）

3. **退出时**：
   - 平台关闭（`platformShutdown()`）
   - 关闭 MCP 服务器
   - 关闭 Python Bridge（如已启动）
   - 关闭 Node.js IPC 后端（`shutdownBackend()`）
   - 关闭 Unreal HTTP 服务器
   - 关闭 LocalDB

### 6.2 环境准备流程（Setup Workflow）

应用启动时自动运行的环境准备步骤（用户可在 `/welcome` 页面查看进度和重试）：

1. **Python 环境检测**（可选）：检测系统 Python >=3.11
2. **创建资源目录**：创建 `DVSResource/` 目录结构
3. **初始化 Python Bridge**（可选）：如 Python 可用则初始化
4. **初始化 Node.js IPC 后端**：注册所有 20 个后端 IPC 模块路由
5. **初始化 MCP 服务器**：启动双桥接，注册内置工具
6. **Blender 环境检测**（可选）：检测 Blender 是否可用
7. **检测 ffmpeg**（可选）：检测 ffmpeg 是否可用

## 7. 前后端通信模型总结

| 场景 | 通信方式 | 关键模块 |
| --- | --- | --- |
| 普通后端调用（非流式） | IPC invoke / handle | `src/network/ipcClient.ts` → `electron/backend/router.mjs` → 模块 handler |
| AI 对话 / 流式输出 | IPC 三通道流模式 | `core/stream.mjs` → `preload.mjs` 事件转发 → `ipcClient.ts` 异步生成器 |
| Agent 工具调用 | Agent Runtime + ToolRegistry | `agent/runtime/AgentRuntime.mjs` → `ToolRegistry.mjs` → MCP/Skills 工具 |
| MCP 工具执行 | MCP 双桥接 + toolExecutor | `mcp/server/DVStudioMCPServer.mjs` → `toolExecutor.mjs` → 工具实现 |
| CLI 适配器调用 | CLI session 管理 | `cli-adapters/manager.mjs` → 具体 CLI 适配器 → 子进程 |
| Blender 集成 | Blender MCP 桥接 | `blender/service.mjs` → MCP 桥接 → Blender 进程 |
| 云端模板 | 适配器模式 IPC | `cloud-templates/adapters/factory.mjs` → local/steam adapter |
| 3D 编辑器交互 | IPC + dweb:// 协议 | `window.dweb.blender.*` / `window.dweb.tripo3d.*` + Three.js 渲染 |
| 项目资产读取（图片/视频/3D模型） | dweb:// 自定义协议 | `electron/backend/projectAssetProtocol.mjs`（直接读磁盘） |
| 项目资产写操作（上传/导入/删除） | IPC invoke | `electron/backend/projectStaticAssets/service.mjs` |
| 本地数据持久化 | LocalDB IPC | `electron/localdb/ipc/ipcHost.mjs` → 14 个 repos |
| 平台能力（Steam 等） | Platform IPC | `electron/platform/ipc.mjs` → manager → provider |
| 窗口控制 | IPC invoke | `electron/main.mjs` 注册的 window 通道 |
| 外部 AI API 调用 | 主进程 HTTP 客户端 | `electron/backend/core/http-client.mjs`（在 handler 内部调用） |
| Unreal Engine 集成 | 内置 HTTP 服务器 | `electron/backend/modules/agent-skills/service.mjs`（启动独立 HTTP 服务器） |

## 8. 关键约束与边界

1. **无 HTTP 后端服务器**：除了 Unreal 集成专用的 HTTP 服务器外，后端不监听任何 HTTP 端口。
2. **LocalDB 唯一事实来源**：所有运行时数据存储在 LocalDB（better-sqlite3，14 个仓库），不再有 Django SQLite 镜像。
3. **IPC 为唯一前后端通信方式**：Electron 模式下前端不直接发起 HTTP 请求到 localhost（迁移期兼容代码除外）。
4. **dweb:// 协议只读**：项目资产的读操作走 dweb:// 协议，写操作必须通过 IPC。
5. **Python Bridge 可选**：Python 仅用于字幕等特定计算密集型任务，核心功能不依赖 Python。
6. **平台抽象层强制**：所有平台相关功能必须通过 `src/platformBridge/`（前端）和 `electron/platform/`（主进程）访问，禁止直接耦合平台 SDK。
7. **模块化后端**：新增后端功能必须在 `electron/backend/modules/` 下创建新模块，遵循 routes/handlers/service 结构规范；复杂模块可使用子目录（参考 agent/mcp/cloud-templates 结构）。
8. **MCP 工具安全**：MCP 工具执行必须通过 toolExecutor 统一管理，禁止绕过执行器直接调用工具；工具注册需明确权限范围。
9. **Agent 工具安全**：Agent 可调用的工具必须通过 ToolRegistry 注册，禁止 Agent 直接执行任意代码；文件系统访问需限制在项目目录范围内。
10. **CLI 适配器沙箱**：CLI 适配器启动的子进程需限制权限，配置存储在 cliConfigStore 中，禁止直接暴露 shell 访问。
11. **Blender 脚本安全**：Blender 脚本执行仅限工作空间目录内的脚本，禁止执行任意路径的 Blender 脚本。
12. **Django 已移除**：不添加任何 Django/Python HTTP 服务器代码，遗留引用仅用于迁移清理。
