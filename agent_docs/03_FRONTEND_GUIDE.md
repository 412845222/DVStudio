# 前端开发指引 (Frontend Guide)

## ⚠️ 重要架构变更（2026-07 更新）

**后端通信已从 Django HTTP 改为 Electron IPC**。所有后端调用通过 `src/network/ipcClient.ts` 走 Electron IPC 通道，不再使用 HTTP 请求到 localhost。

**2026-07 重大扩展**：新增 Agent 对话层、MCP 工具调用、CLI 适配器（Claude/Codex/Copilot）、云端模板中心、3D 编辑器、Blender 集成、多模型生成（Tripo3D/Ark/Gemini）、国际化（i18n）等能力：

- Vuex Store 从 5 个扩展至 **6 个**（新增 i18n）
- Electron 桥接命名空间扩展至 **24 个**
- 路由从 7 个扩展至 **9 个**（新增 `/3d-editor`、`/template-center`）
- 新增 `src/network/chat/` 子目录统一管理多种对话服务
- 新增 `src/i18n/` 国际化模块（中英双语）
- 新增 `src/ai/models/` 模型定义层
- 新增 Agent/MCP/CLI 相关 UI 组件

## 1. 技术栈
- **框架**: Vue 3（Composition API, `<script setup lang="ts">`）
- **语言**: TypeScript
- **状态管理**: Vuex 4（6 个模块）
- **构建工具**: Vite
- **路由**: Vue Router 4（`src/router/index.ts`，Electron 下 Hash 模式，Web 下 History 模式，9 个路由）
- **渲染引擎**: 自研 WebGL2 引擎（`src/engine/webgl/`）+ Three.js 3D 渲染（`src/ui/WorkFlow/WorlFlowNodes/model3d/`）
- **国际化**: Vue I18n（`src/i18n/`，zh-CN / en-US）
- **运行平台**: `src/network/runtimePlatform.ts`（electron / web / unknown）
- **平台桥接**: `src/platformBridge/`（Steam 等平台能力抽象）
- **Agent/MCP**: 通过 `window.dweb.agent.*` / `window.dweb.mcp.*` / `window.dweb.cli.*` IPC 访问
- **测试**: Vitest + @vue/test-utils + jsdom

## 2. 组件开发规范
- 优先使用 `<script setup lang="ts">`。
- 样式使用 scoped CSS，或引入全局的 CSS 变量（`src/styles/`）。
- 复杂组件应拆分为逻辑（Composable/Hook）和视图（Template）。
- **绝对避免**在组件中直接调用 `window.dweb.*`：请通过 `src/electronBridge/index.ts` 或 `src/network/` 中的 Service 封装。
- **绝对避免**在组件中直接调用平台 API：请通过 `src/platformBridge/` 的 composable 访问。
- **AI 对话/Agent 相关**：请通过 `src/network/chat/` 中的服务调用，不要直接使用 IPC。

## 3. 状态管理 (Vuex)
- 状态按模块划分，共 **6 个模块**：
  - `src/store/aiworkflow/store.ts`：工作流节点、边、资源池
  - `src/store/timeline/store.ts`：视频编辑器时间轴、关键帧、缓动
  - `src/store/videoscene/store.ts`：舞台场景树、节点状态、选中
  - `src/store/videostudio/store.ts`：编辑器全局状态
  - `src/store/theme/store.ts`：主题 / 皮肤（深浅色切换）
  - `src/store/i18n/store.ts`：国际化语言切换（zh-CN / en-US）
- **严禁**在组件中直接修改 Vuex state，必须通过 Mutation。
- 复杂的异步逻辑或多 Mutation 组合应放在 Action 中。
- 仅在单个组件内使用的状态（如弹窗的开关、表单临时输入）使用 `ref` / `reactive`。
- 平台状态（如 Steam 用户信息、好友列表）通过 `src/platformBridge/usePlatform.ts` 访问，自动同步到响应式状态。

## 4. 核心业务模块（`src/core/`）
- `scene/`：舞台场景树与节点命令
  - `commands/`：交互命令（`interaction/` / `lines/` / `moveNode/` / `nodes/` / `overlay/` / `selection/` / `snap/`）
    - `nodes/textAutoSize.ts`：文本节点自动大小调整
    - `snap/`：吸附系统（axis / baseSession / context / moveSession / resizeSession / internalTypes）
  - `nodesType/`：节点类型定义（`NodeBase` / `RectNode` / `TextNode` / `ImageNode` / `LineNode` + `upgradeNodeType` + `numbers`）
  - `factories/videoSceneState.ts`：场景状态工厂
  - `tree.ts`：场景树操作
  - `geometry.ts`：几何计算
- `project/`：项目包（package assets / ids / io / normalize / rewriteAssetIds / serialize）
- `history/`：编辑器撤销/重做核心（`editorHistoryCore`）
- `events/`：类型化事件总线（`typedEventBus` + `dvsEvents`）
- `components/`：组件库 API（api / exportTemplate / instantiate / validate / types）
- `agent/`：Agent 前端配置（`agentConfig.ts` / `index.ts`）
- `agentToUI/`：AI → UI 协议解析（`consumeComponentTemplate` / `videoScenePlan` / `guards` / `types`）
- `studio/`：工厂函数
- `subtitle/`：SRT、字幕关键帧、舞台快照清理（`sanitizeStageSnapshot`）
- `timeline/`：时间轴核心
- `export/`：导出核心（`computeSceneStateAtFrame` 计算指定帧场景状态）
- `editor/`：编辑器类型定义
- `shared/`：通用工具（cloneJsonSafe / json / time）

## 5. AI 工作流核心（`src/aiworkflow/`）
> 页面渲染层在 `src/views/AIWorkflow/`，**核心数据/类型/操作层在 `src/aiworkflow/`**。
- `types.ts`：节点、边、锚点、视口、剧情分支、图像裁剪、像素矩形等核心类型
- `actions.ts`：单选 / 删除等轻量级操作
- `nodeLibrary.ts`：节点目录元数据（含 i18n 支持）
- `useNodeLibraryI18n.ts`：节点库国际化 composable
- `nodePositionUtils.ts`：节点位置工具
- `resource/`：资源池（`pool.ts` / `index.ts` / `types.ts` / `usage.ts`）
- `template/`：模板系统（`builtinTemplates.ts` / `types.ts` / `useCloudTemplatePersistence.ts` / `useTemplateCenter.ts` / `useTemplateMerge.ts` / `useTemplatePersistence.ts`）
- `imageCropEnforcer.ts`：图片裁剪强制器
- `imageOutput.ts`：图片输出
- `localFileHandleDb.ts`：本地文件句柄 IndexedDB 缓存
- `domain/`：跨领域逻辑
  - `comfyui/parseWorkflowIO.ts`：解析 ComfyUI 工作流输入输出
  - `link/anchorKinds.ts`：锚点类型常量
  - `resource/safeWorkflowUrl.ts`：工作流 URL 合法性校验
  - `resource/createVideoFirstFrameThumbnail.ts`：视频首帧缩略图
  - `selection/hitTestNodesInWorldRect.ts`：世界坐标矩形框选
  - `selection/selectionFrameUtils.ts`：选框工具
  - `selection/selectionTagUtils.ts`：标签选择工具
- `persistence/blueprintSnapshot.ts`：蓝图快照序列化（保存到项目）
- `MediaResourceImportManager.ts` / `mediaResourceImportWorker.ts`：资源导入
- `VideoFirstFrameCaptureQueue.ts`：首帧捕获队列
- `VideoMetadataReadQueue.ts`：视频元数据读取队列

## 6. AI 模型定义（`src/ai/`）
- `models/chatModels.ts`：对话模型定义
- `models/agentModels.ts`：Agent 模型定义

## 7. 国际化（`src/i18n/`）
- `index.ts` / `useI18n.ts` / `helpers.ts` / `types.ts`：i18n 核心
- `locales/zh-CN/`：中文语言包
  - `aichat/`：AI 对话相关文案
  - `aiworkflow/`：工作流相关文案（含 templateCenter）
  - `nodes/`：节点文案（blender/comfyui/image/meshy/model3d/scene*/video 等）
  - `tasks/`：任务面板文案（ark/gemini/meshy/tripo3d/video）
  - `common.json` / `settings.json` / `steam.json` 等通用文案
- `locales/en-US/`：英文语言包（结构与 zh-CN 对应）

## 8. 渲染引擎（`src/engine/webgl/`）
- **架构**: 采用类似场景图（Scene Graph）的结构，用于 2D 视频场景编辑。
- **节点类型**: `RectNode` / `TextNode` / `ImageNode` / `LineNode` 及其 Renderer（`BaseRenderer` / `NodeRenderer` / `RectRenderer` / `TextRenderer` / `ImageRenderer` / `LineRenderer`）
  - 数据结构在 `src/core/scene/nodesType/`
  - 渲染器在 `src/engine/webgl/renderers/`
- **核心模块**:
  - `canvas/DwebCanvasGL.ts`：WebGL2 画布主类
  - `canvas/postprocess/`：后期处理管线（pipeline / program / targets / types）
  - `camera/camera2d.ts`：2D 摄像机
  - `picking/rectPicking.ts`：矩形拾取
  - `pipeline/glProgram.ts`：着色器程序封装
  - `resources/`：资源管理（含 `DwebImagePool.ts` 图片池）
  - `scene/DwebVideoScene.ts`：视频场景管理
  - `texture/texture2d.ts`：2D 纹理管理
  - `material/`：基础 2D shader 与圆角矩形 / 蒙版材质（`basic2dShaders` / `roundedRectShader` / `roundedMaskTextureShader`）
  - `shaders/`：着色器（`postBlur` 模糊 / `postGlowComposite` 辉光合成）
- **3D 渲染**：Three.js 3D 渲染用于模型预览和 3D 编辑器，位于 `src/ui/WorkFlow/WorlFlowNodes/model3d/`，包含：
  - `Model3DPreviewViewer.ts`：工作流节点内的 3D 预览
  - `editor/EditorViewer.ts`：3D 编辑器主查看器
  - `editor/EnhancedRenderingPipeline.ts`：增强渲染管线（SSAO/Bloom/ColorCorrection/FXAA）
  - `editor/EnvironmentPresets.ts`：环境预设
- **修改指南**: 新增 2D 节点类型时，必须同时实现：
  1. `src/core/scene/nodesType/<New>Node.ts` 的数据结构
  2. `src/engine/webgl/renderers/<New>Renderer.ts` 的渲染逻辑
  3. 在 `src/core/scene/nodesType/index.ts` 中注册

## 9. UI 组件库（`src/ui/`）

### 9.1 AIChat/：AI 对话组件
- `AIChatDialog.vue`：主对话弹窗
- `AgentToolsPanel.vue`：Agent 工具面板
- `ThinkingBlock.vue`：思考状态块
- `ToolCallCard.vue`：工具调用卡片（执行后自动折叠动画）
- `NodeLocationCard.vue`：节点定位卡片
- `UserChoicePanel.vue`：用户选择面板

### 9.2 BluePrint/：工作流画布
- `BlueprintCanvas.vue`：主画布
- `node-dialog/`：节点聊天对话框（`NodeChatDialog` / `NodeChatInput` / `NodeChatParamPanel` / `nodeChatConfig`）

### 9.3 WorkFlow/：工作流节点与面板
- `WorlFlowNodes/`：节点 Vue 组件
  - 基础节点：`WorkflowImageNode` / `WorkflowVideoNode` / `WorkflowTextNode` / `WorkflowStoryNode` / `WorkflowRotateImageNode` / `WorkflowTextMergeNode` / `ImageMarkupDialog`
  - AI 节点：`WorkflowComfyUINode` / `WorkflowMeshyModelNode` / `WorkflowSceneLayoutNode` / `WorkflowSceneUnderstandingNode` / `WorkflowSceneDecomposeNode` / `WorkflowUnrealExportNode`
  - **新增节点**：`WorkflowModel3DNode` / `WorkflowBlenderNode`
  - `three-preview/`：Three.js 预览（`WorkflowThreePreviewShell.vue`）
  - `model3d/`：3D 预览与编辑器
    - `Model3DPreviewViewer.ts`：节点内预览
    - `editor/`：3D 编辑器（EditorViewer / EnhancedRenderingPipeline / EnvironmentPresets / types）
  - `sceneLayout/`：场景布局预览（`SceneLayoutPreviewViewer.ts`）
- `WorkflowNodeBase.vue`：所有节点 UI 的基类
- `WorkflowEdgeLayer.vue`：连线渲染
- `selection/`：选择相关（`SelectionFrameOverlay` / `WorkflowTagEditor`）
- **工具栏与面板**：
  - 基础：`BlueprintProjectToolbar.vue` / `BlueprintLogPanel.vue` / `ResourceManagerPanel.vue` / `WorkflowInspectorPanel.vue` / `WorkflowSelectionToolbar.vue`
  - 任务面板：`MeshyTaskPanel.vue` / `VideoTaskPanel.vue` / **新增**：`Tripo3DTaskPanel.vue` / `ArkTaskPanel.vue` / `GeminiTaskPanel.vue`
  - **模板中心**：`TemplateCenterDialog.vue` / `TemplateCard.vue` / `TemplateApplyDialog.vue` / `SaveTemplateDialog.vue`
- `AnchorTooltip.vue`：锚点提示

### 9.4 Model3D/：3D 编辑器组件
> 位于 `src/ui/UIComponent/Model3DEditor/`
- `EditorToolbar.vue`：编辑器工具栏
- `EditorOutliner.vue` / `OutlinerPanel.vue` / `OutlinerNode.vue`：大纲面板
- `EditorProperties.vue` / `PropertiesPanel.vue`：属性面板
- `EditorStatusBar.vue`：状态栏
- `ProgressOverlay.vue`：进度覆盖层

### 9.5 TimeLine/：时间轴
- `TimeLine.vue`：主组件
- `audio/`：音频波形行（`TimeLineAudioWaveRow`）
- `components/`：时间轴组件（`EasingCurveCanvas` / `TimeLineContextMenu` / `TimeLineEasingCurveEditor` / `TimeLineFrameCanvasRow` / `TimeLineFrameCell` / `TimeLineTickCanvas`）
- `core/`：时间轴核心（`TimelineDataManager` / `TimelineTicker` / `VuexTimelineDataManager` / `curveTick`）
- `progress/`：进度样式（`ProgressStylePanel` / `TimeLineProgressCanvasRow`）

### 9.6 VideoScene/：视频场景编辑器
- `VideoScene.vue` + `VideoSceneRuntime.ts`：主组件与运行时
- `anim/`：动画（color / timelineAnimation）
- `dialogs/`：对话框（`ExportDialog` / `LoadRecentEditDialog` / `ProgressBarEditDialog`）
- `markdown/`：Markdown 解析（`MarkdownParser`）
- `nodesType/`：渲染层节点类型
- `panels/`：面板（`AiSubtitleUnderstandingPanel` / `ComponentLibraryPanel` / `SubtitleEditorPanel` / `VideoStudioLeftPanel` / `VideoStudioRightPanel`）
- `parts/`：部件
  - `nodeControlPoints/`：节点控制点（`LineControlPoints` / `ResizeControlPoints`）
  - `nodeDetail/`：节点详情
    - `forms/`：表单（`CommonTransformForm` / `ImageNodeForm` / `LineNodeForm` / `NodeFiltersForm` / `RectNodeForm` / `TextNodeForm` / `useNumberScrub`）
    - `VideoNodeDetailForm.vue`
  - `nodeTree/`：节点树（`NodeTreeController` / `VideoSceneNodeTree` / `VideoSceneNodeTreeController`）
  - `VideoSceneToolbar.vue` / `flyThumbnail.ts`
- `ruler/`：标尺（`RulerOverlay` / `rulerMath`）
- `subtitleAI/`：字幕 AI 状态（`subtitleSummaryState`）

### 9.7 UIComponent/：通用 UI 组件
- 布局：`GlobalTitleBar` / `GlobalSideNav` / `GlobalPageBackground` / `BottomChatDock` / `SideNavDock` / `DialogTitleBar`
- 弹窗与菜单：`ModalDialog` / `ContextMenu` / `ToastStack` / `MarkdownViewer` / `VideoController` / `AboutDialog` / `LanguageSwitcher.vue`
- 画布菜单：`DwebCanvasMenu.types.ts` / `DwebCanvasNodeSearchMenu.vue`
- 进度与过渡：`FullscreenProgressOverlay` / `PageTransitionOverlay` / `StartupProgressBar` / `SciFiFeedback.vue`
- 平台与表单：`SteamEntryOverlay.vue` / `SeedanceVideoForm.vue` / `MeshyImageForm.vue`
- 全局反馈：`useGlobalFeedback.ts` / `aboutDialogStore.ts`
- 工作流：`WorkflowInspectorPanel.vue`

### 9.8 Steam/：Steam 平台组件
- `SteamFriendsList.vue`：Steam 好友列表
- `SteamPanel.vue`：Steam 面板
- `SteamQuickActions.vue`：Steam 快捷操作
- `SteamStatusBadge.vue`：Steam 状态徽章
- `SteamUserButton.vue` / `SteamUserCard.vue`：Steam 用户按钮/卡片
- `index.ts`：统一导出

### 9.9 User/：用户组件
- `UserAvatar.vue` / `UserButton.vue` / `UserMenu.vue`
- `index.ts`：统一导出

### 9.10 Electron/：Electron 启动环境
- `CommandConsole.vue` / `EnvCheckList.vue`

## 10. 页面级组件（`src/views/`）
- `AIWorkflow.vue`：工作流页面（包装器）
- `AIWorkflow/`：工作流页面实现
  - `assets/`：资源持久化相关 composable
  - `blueprint-core/`：画布核心逻辑（canvas-interaction / linking / selection / workers / edgePathWorker / viewport 等）
  - `bridge/`：桥接（component-events / feedback）
  - `concurrency/`：并发相关
  - `network/`：网络请求相关
  - `node-business/`：节点业务（chat / comfy / meshy / presentation / project / scene / unreal / **blender/tripo3d/ark/gemini**）
  - `node-screenshot/`：节点截图持久化缓存
  - `ui/`：页面内嵌 UI
  - `ResourceManagerWindow.vue`：资源管理器窗口
  - `TemplateCenterWindow.vue`：模板中心窗口
- `Model3DEditorPage.vue`：**新增** 3D 模型编辑器页面
- `VideoStudio.vue`：视频工作室页面
- `ProjectList.vue`：项目列表
- `Settings.vue`：设置页面
- `WelCome.vue`：欢迎/环境准备页面（注意命名拼写：WelCome，历史遗留）
- `ImageMarkupPreviewPage.vue`：图片标注预览页面

## 11. Network 层（`src/network/`）

### 11.1 核心客户端
- **`ipcClient.ts`**：**IPC 统一客户端（核心）**
  - `hasIpcApi()` / `hasIpcModule(namespace)`：检测 IPC 可用性
  - `ipcCall<T>()`：调用 IPC 方法并自动解包 `{ ok, value, error }` 格式
  - `ipcStream<T>()`：调用流式 IPC 方法，返回异步生成器
  - `unwrapIpcResult()`：手动解包 IPC 返回结果

### 11.2 应用信息与配置
- `appInfo.ts`：应用信息
- `backendConfig.ts`：配置 + `resolveBackendUrl()` 工具
- `runtimePlatform.ts`：运行平台检测（electron / web / unknown）
- `blueprintRequestLog.ts`：请求日志
- `AICredentialService.ts`：API 凭证管理

### 11.3 对话服务（`src/network/chat/`）—— 新增子目录
> 统一管理多种对话/Agent 服务
- `index.ts`：统一导出
- `types.ts`：类型定义
- `AgentChatBridge.ts`：Agent 对话桥接
- `AIChatService.ts`：基础 AI 对话（流式 IPC）
- `AgentChatService.ts`：Agent Runtime 对话服务
- `CLIChatService.ts`：CLI 适配器对话服务
- `DVSAgentChatService.ts`：DVSAgent 增强对话服务
- `CodexChatService.ts`：Codex CLI 对话服务
- `CopilotChatService.ts`：Copilot CLI 对话服务
- `LocalExecChatService.ts`：本地执行型对话

### 11.4 业务服务
- `BlueprintProjectService.ts`：项目保存 / 加载（IPC）
- `ComponentLibraryService.ts`：组件库（IPC）
- `ExportService.ts`：导出任务（IPC）
- `UnrealExportService.ts`：Unreal 导出
- `LegalDocService.ts`：法律文档
- `SceneSkillService.ts`：场景理解 / 灯光 / 布局 / Unreal 等 Agent Skills（IPC）
- `SubtitleAIService.ts`：字幕 AI（subtitle / palette / template 等，IPC）
- `ComfyUIBridgeService.ts`：ComfyUI 桥接（IPC）

## 12. Electron 桥接（`src/electronBridge/`）
- 所有 IPC 调用通过此层封装，**禁止**在组件中直接使用 `window.dweb.*`。
- **共 24 个命名空间**：
  - `common.*`：应用信息、后端状态、设置、诊断、窗口控制、引导安装
  - `window.*`：窗口控制（最小化/最大化/重载/开发者工具/打开3D编辑器）
  - `chat.*`：AI 对话（含流式通道）
  - `agent.*`：**新增** Agent Runtime（流式对话、上下文管理、会话管理、中止）
  - `mcp.*`：**新增** MCP 服务器（连接/断开/工具列表/工具调用/状态）
  - `cli.*`：**新增** CLI 适配器（Claude/Codex/Copilot 环境检测、会话管理、流式消息、配置）
  - `export.*`：导出服务
  - `editor.*`：编辑器后端（组件库等）
  - `comfyui.*`：ComfyUI 桥接
  - `thirdParty.*`：三方 API
  - `projects.*`：项目管理
  - `projectAssets.*`：项目资产
  - `meshy.*`：Meshy 3D
  - `tripo3d.*`：**新增** Tripo3D 3D 生成（健康检查、生成、任务查询、余额、文件上传）
  - `seedance.*`：Seedance 视频
  - `ark.*`：**新增** Ark 视频生成（任务列表/详情/删除/记录）
  - `gemini.*`：**新增** Gemini 视频生成（健康检查、任务查询、取消、删除、图片路径）
  - `blender.*`：**新增** Blender 集成（状态检查、MCP桥接、模型导入、工具检查、工作空间）
  - `cloudTemplates.*`：**新增** 云端模板中心（平台、配额、列表、上传、下载、删除）
  - `agentSkills.*`：Agent Skills
  - `codex.*`：Codex/Copilot（兼容保留）
  - `aiworkflow.*`：项目根注册、资产操作、资源管理器、图片标注、LocalDB 访问
  - `platform.*`：平台能力（Steam 状态/用户/好友/Overlay/DLC/热键）
  - `model3d-editor.*`：3D 编辑器窗口控制
- 详细函数清单请查阅 `src/electronBridge/index.ts` 与 `src/electronBridge/types.ts`。
- **IPC 调用统一使用 `src/network/ipcClient.ts`**：
  - 普通调用：`ipcCall(() => window.dweb.<namespace>.<method>(...args))`
  - 流式调用：`ipcStream(() => window.dweb.<namespace>.<method>Stream(...args))`

## 13. 平台桥接层（`src/platformBridge/`）
> 所有平台相关功能（Steam 等）必须通过此层访问，禁止直接调用 `window.dweb.platform.*`。
- `index.ts`：统一导出所有模块
- `platform.ts`：平台状态管理与提供者选择
  - 自动检测当前环境（Steam 启动 / 普通启动 / Web 模式）
  - 维护响应式平台状态（`status` / `user` / `friends` / `dlcs`）
  - 提供 `openOverlayUrl()` / `activateGameOverlay()` / `isDlcInstalled()` 等方法
- `usePlatform.ts`：平台状态 composable
- `useSteamEntry.ts`：Steam 入口引导 composable
- `types.ts`：平台类型定义

## 14. Vue 组合式函数（`src/composables/`）
- `useCardParticles.ts`：卡片粒子效果
- `useSquareParticles.ts`：方形粒子效果
- `useStartupProgress.ts`：启动进度
- `useSteamHotkeys.ts`：Steam 热键处理
- `useSteamPanel.ts`：Steam 面板状态与交互
- `useModel3DEditor.ts` / `useEnhancedModel3DEditor.ts`：**新增** 3D 编辑器 composable

## 15. 适配器与跨模块桥（`src/adapters/`）
- `aiWorkflowPersistence.ts`：工作流持久化适配器
- `editorPersistence.ts`：编辑器持久化适配器
- `editorRecentCache.ts`：编辑器最近编辑缓存
- `windowEventBridge.ts`：窗口事件桥

## 16. 类型扩展（`src/types/`）
- `electron-bridge.d.ts`：`window.dweb.*` / `window.__DWEB_*` 的全局类型
- `three-rect-area-light.d.ts`：Three.js RectAreaLight 类型补丁

## 17. 单元测试
- 测试运行：`npm run test`（vitest）
- 覆盖率：`npm run test:coverage`（@vitest/coverage-v8）
- 测试文件命名：与源文件同名 + `.spec.ts`
- 测试目录：`tests/`（unit/components/engine/scripts）
  - `tests/unit/agent/`：Agent 模块测试
  - `tests/unit/i18n/`：国际化测试
  - `tests/unit/model3d/`：3D 编辑器测试
  - `tests/unit/network/`：网络服务测试（含 Agent/Chat 等）
  - `tests/unit/workflow/`：工作流测试（blender/meshy/sceneLayout/tripo3d/unreal 等）

## 18. Web Worker（`src/workers/`）
- `exportRenderUploadWorker.ts`：导出渲染上传
- `exportUploadWorker.ts`：导出上传

## 19. 路由表（`src/router/index.ts`）—— 共 9 个路由
| 路径 | 组件 | 说明 |
| --- | --- | --- |
| `/` | `AIWorkflow.vue` | AI 工作流画布（默认页） |
| `/studio` | `VideoStudio.vue` | 视频工作室/编辑器 |
| `/welcome` | `WelCome.vue` | 欢迎/环境准备页 |
| `/project-list` | `ProjectList.vue` | 项目列表 |
| `/settings` | `Settings.vue` | 设置页 |
| `/image-markup` | `ImageMarkupPreviewPage.vue` | 图片标注预览 |
| `/3d-editor` | `Model3DEditorPage.vue` | **新增** 3D 模型编辑器 |
| `/template-center` | （窗口） | **新增** 模板中心窗口 |
| `/resource-manager` | （窗口） | 资源管理器窗口 |
