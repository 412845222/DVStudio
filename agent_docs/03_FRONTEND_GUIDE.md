# 前端开发指引 (Frontend Guide)

## ⚠️ 重要架构变更

**后端通信已从 Django HTTP 改为 Electron IPC**。所有后端调用通过 `src/network/ipcClient.ts` 走 Electron IPC 通道，不再使用 HTTP 请求到 localhost。

## 1. 技术栈
- **框架**: Vue 3（Composition API, `<script setup lang="ts">`）
- **语言**: TypeScript
- **状态管理**: Vuex 4
- **构建工具**: Vite
- **路由**: Vue Router 4（`src/router/index.ts`，Electron 下 Hash 模式，Web 下 History 模式）
- **渲染引擎**: 自研 WebGL2 引擎（`src/engine/webgl/`）
- **运行平台**: `src/network/runtimePlatform.ts`（electron / web / unknown）
- **平台桥接**: `src/platformBridge/`（Steam 等平台能力抽象）
- **测试**: Vitest + @vue/test-utils + jsdom

## 2. 组件开发规范
- 优先使用 `<script setup lang="ts">`。
- 样式使用 scoped CSS，或引入全局的 CSS 变量（`src/styles/`）。
- 复杂组件应拆分为逻辑（Composable/Hook）和视图（Template）。
- **绝对避免**在组件中直接调用 `window.dweb.*`：请通过 `src/electronBridge/index.ts` 封装。
- **绝对避免**在组件中直接调用平台 API：请通过 `src/platformBridge/` 的 composable 访问。

## 3. 状态管理 (Vuex)
- 状态按模块划分：`aiworkflow` / `timeline` / `videoscene` / `videostudio` / `theme`。
  - `src/store/aiworkflow/store.ts`：工作流节点、边、资源池。
  - `src/store/timeline/store.ts`：视频编辑器时间轴、关键帧、缓动。
  - `src/store/videoscene/store.ts`：舞台场景树、节点状态、选中。
  - `src/store/videostudio/store.ts`：编辑器全局状态。
  - `src/store/theme/store.ts`：主题 / 皮肤。
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
- `nodeLibrary.ts`：节点目录元数据
- `resource/`：资源池（`pool.ts` / `index.ts` / `types.ts` / `usage.ts`）
- `imageCropEnforcer.ts`：图片裁剪强制器
- `imageOutput.ts`：图片输出
- `localFileHandleDb.ts`：本地文件句柄 IndexedDB 缓存
- `domain/`：跨领域逻辑
  - `comfyui/parseWorkflowIO.ts`：解析 ComfyUI 工作流输入输出
  - `link/anchorKinds.ts`：锚点类型常量
  - `resource/safeWorkflowUrl.ts`：工作流 URL 合法性校验
  - `resource/createVideoFirstFrameThumbnail.ts`：视频首帧缩略图
  - `selection/hitTestNodesInWorldRect.ts`：世界坐标矩形框选
- `persistence/blueprintSnapshot.ts`：蓝图快照序列化（保存到项目）
- `MediaResourceImportManager.ts` / `mediaResourceImportWorker.ts`：资源导入
- `VideoFirstFrameCaptureQueue.ts`：首帧捕获队列
- `VideoMetadataReadQueue.ts`：视频元数据读取队列

## 6. 渲染引擎（`src/engine/webgl/`）
- **架构**: 采用类似场景图（Scene Graph）的结构。
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
- **修改指南**: 新增节点类型时，必须同时实现：
  1. `src/core/scene/nodesType/<New>Node.ts` 的数据结构
  2. `src/engine/webgl/renderers/<New>Renderer.ts` 的渲染逻辑
  3. 在 `src/core/scene/nodesType/index.ts` 中注册

## 7. UI 组件库（`src/ui/`）
- `BluePrint/`：工作流画布
  - `BlueprintCanvas.vue`：主画布
  - `node-dialog/`：节点聊天对话框（`NodeChatDialog` / `NodeChatInput` / `NodeChatParamPanel` / `nodeChatConfig`）
- `WorkFlow/`：工作流节点组件
  - `WorlFlowNodes/`：节点 Vue 组件（`WorkflowImageNode` / `WorkflowVideoNode` / `WorkflowTextNode` / `WorkflowStoryNode` / `WorkflowComfyUINode` / `WorkflowModel3DNode` / `WorkflowMeshyModelNode` / `WorkflowSceneLayoutNode` / `WorkflowSceneUnderstandingNode` / `WorkflowSceneDecomposeNode` / `WorkflowRotateImageNode` / `WorkflowTextMergeNode` / `WorkflowUnrealExportNode` / `ImageMarkupDialog`）
  - `WorlFlowNodes/three-preview/`：Three.js 预览（`WorkflowThreePreviewShell.vue`）
  - `WorlFlowNodes/model3d/` / `WorlFlowNodes/sceneLayout/`：3D / 场景预览子模块
  - `WorkflowNodeBase.vue`：所有节点 UI 的基类
  - `WorkflowEdgeLayer.vue`：连线渲染
  - `selection/`：选择相关（`SelectionFrameOverlay` / `WorkflowTagEditor`）
  - `BlueprintProjectToolbar.vue` / `BlueprintLogPanel.vue` / `MeshyTaskPanel.vue` / `VideoTaskPanel.vue` / `ResourceManagerPanel.vue` / `WorkflowInspectorPanel.vue` / `WorkflowSelectionToolbar.vue`
- `TimeLine/`：时间轴
  - `TimeLine.vue`：主组件
  - `audio/`：音频波形行（`TimeLineAudioWaveRow`）
  - `components/`：时间轴组件（`EasingCurveCanvas` / `TimeLineContextMenu` / `TimeLineEasingCurveEditor` / `TimeLineFrameCanvasRow` / `TimeLineFrameCell` / `TimeLineTickCanvas`）
  - `core/`：时间轴核心（`TimelineDataManager` / `TimelineTicker` / `VuexTimelineDataManager` / `curveTick`）
  - `progress/`：进度样式（`ProgressStylePanel` / `TimeLineProgressCanvasRow`）
- `VideoScene/`：视频场景编辑器
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
- `UIComponent/`：通用 UI 组件
  - `GlobalTitleBar` / `GlobalSideNav` / `GlobalPageBackground` / `BottomChatDock` / `SideNavDock`
  - `ModalDialog` / `ContextMenu` / `ToastStack` / `MarkdownViewer` / `VideoController`
  - `DwebCanvasMenu.types.ts` / `DwebCanvasNodeSearchMenu.vue`
  - `FullscreenProgressOverlay` / `PageTransitionOverlay` / `StartupProgressBar`
  - `SteamEntryOverlay.vue` / `SeedanceVideoForm.vue` / `MeshyImageForm.vue`
  - `WorkflowInspectorPanel.vue`
- `Steam/`：Steam 平台组件（`index.ts` 统一导出）
  - `SteamFriendsList.vue`：Steam 好友列表
  - `SteamPanel.vue`：Steam 面板
  - `SteamQuickActions.vue`：Steam 快捷操作
  - `SteamStatusBadge.vue`：Steam 状态徽章
  - `SteamUserButton.vue` / `SteamUserCard.vue`：Steam 用户按钮/卡片
- `User/`：用户组件（`index.ts` 统一导出）
  - `UserAvatar.vue` / `UserButton.vue` / `UserMenu.vue`
- `AIChat/`：AI 对话组件（`AIChatDialog.vue`）
- `Electron/`：Electron 启动环境（`CommandConsole.vue` / `EnvCheckList.vue`）

## 8. AI 工作流页面（`src/views/AIWorkflow/`）
- `AIWorkflowPage.vue`：页面主入口
- `ResourceManagerWindow.vue`：资源管理器窗口
- `assets/`：资源持久化相关 composable（`useAIWorkflowAssetPersistence` / `useAIWorkflowDropAssets` / `useAIWorkflowBatchMediaImport` / `useAIWorkflowImportRecoveryState` / `useAIWorkflowLocalResourceRecovery` / `useAIWorkflowNodeAssetBinding` / `useAIWorkflowNodeResourceCleanup` / `useAIWorkflowObjectUrlRegistry` / `useAIWorkflowResourceCache` / `useAIWorkflowResourceMigration` / `useAIWorkflowResourceRecordCleanup` / `useAIWorkflowSceneLayoutModelBinding` / `useAIWorkflow404Fallback`）
- `blueprint-core/`：画布核心逻辑（`canvas-interaction/` / `linking/` / `selection/` / `workers/edgePathWorker.ts` / `useAIWorkflowEdgeIndex` / `useAIWorkflowEdgeRenderer` / `useAIWorkflowNodeVisibility` / `useAIWorkflowPerfMonitor` / `useAIWorkflowSelectionState` / `useAIWorkflowThreejsLifecycleManager` / `useAIWorkflowViewport` / `blueprintLog`）
- `bridge/`：桥接（`component-events/` / `feedback/`）
- `concurrency/`：并发相关
- `network/`：网络请求相关
- `node-business/`：节点业务（`chat/` / `comfy/` / `meshy/` / `presentation/` / `project/` / `scene/` / `unreal/` + `useAIWorkflowNodeActions` / `useAIWorkflowNodeRefresh` / `useAIWorkflowNodeSettings` / `useAIWorkflowTextMergeCommands`）
- `node-screenshot/`：节点截图持久化缓存
  - `nodeScreenshotPersistentCache.ts`：节点截图 IndexedDB 持久化缓存
  - `useNodeScreenshotPool.ts`：节点截图池 composable
  - `index.ts`：统一导出
- `ui/`：页面内嵌 UI（`AIWorkflowDebugPanel.vue`）

## 9. Network 层（`src/network/`）
- **`ipcClient.ts`**：**IPC 统一客户端（核心）**
  - `hasIpcApi()` / `hasIpcModule(namespace)`：检测 IPC 可用性
  - `ipcCall<T>()`：调用 IPC 方法并自动解包 `{ ok, value, error }` 格式
  - `ipcStream<T>()`：调用流式 IPC 方法，返回异步生成器
  - `unwrapIpcResult()`：手动解包 IPC 返回结果
  - `ipcOrHttp()` / `ipcStreamOrHttp()`：迁移期兼容层（优先 IPC，失败回退 HTTP）
- `AIChatService.ts`：AI 对话（外部 API 直连，流式 IPC）
- `AICredentialService.ts`：API 凭证管理
- `ComfyUIBridgeService.ts`：ComfyUI 桥接（IPC）
- `BlueprintProjectService.ts`：项目保存 / 加载（IPC）
- `ComponentLibraryService.ts`：组件库（IPC）
- `ExportService.ts`：导出任务（IPC）
- `UnrealExportService.ts`：Unreal 导出
- `LegalDocService.ts`：法律文档
- `LocalExecChatService.ts`：本地执行型对话
- `SceneSkillService.ts`：场景理解 / 灯光 / 布局 / Unreal 等 Agent Skills（IPC）
- `SubtitleAIService.ts`：字幕 AI（subtitle / palette / template 等，IPC）
- `backendConfig.ts`：配置 + `resolveBackendUrl()` 工具
- `runtimePlatform.ts`：运行平台检测（electron / web / unknown）
- `blueprintRequestLog.ts`：请求日志

## 10. Electron 桥接（`src/electronBridge/`）
- 所有 IPC 调用通过此层封装，**禁止**在组件中直接使用 `window.dweb.*`。
- 命名空间：
  - `common.*`：应用信息、后端状态、设置、诊断、窗口控制、引导安装
  - `chat.*`：AI 对话（含流式通道）
  - `export.*`：导出服务
  - `editor.*`：编辑器后端（组件库等）
  - `comfyui.*`：ComfyUI 桥接
  - `thirdParty.*`：三方 API
  - `projects.*`：项目管理
  - `projectAssets.*`：项目资产
  - `meshy.*`：Meshy 3D
  - `seedance.*`：Seedance 视频
  - `agentSkills.*`：Agent Skills
  - `codex.*`：Codex/Copilot（可选）
  - `aiworkflow.*`：项目根注册、资产操作、资源管理器、图片标注、LocalDB 访问
  - `window.*`：最小化/最大化/重载/开发者工具
  - `platform.*`：平台能力（Steam 状态/用户/好友/Overlay/DLC/热键）
- 详细函数清单请查阅 `src/electronBridge/index.ts` 与 `src/electronBridge/types.ts`。
- **IPC 调用统一使用 `src/network/ipcClient.ts`**：
  - 普通调用：`ipcCall(() => window.dweb.<namespace>.<method>(...args))`
  - 流式调用：`ipcStream(() => window.dweb.<namespace>.<method>Stream(...args))`

## 11. 平台桥接层（`src/platformBridge/`）—— 新增模块
> 所有平台相关功能（Steam 等）必须通过此层访问，禁止直接调用 `window.dweb.platform.*`。

- `index.ts`：统一导出所有模块
- `platform.ts`：平台状态管理与提供者选择
  - 自动检测当前环境（Steam 启动 / 普通启动 / Web 模式）
  - 维护响应式平台状态（`status` / `user` / `friends` / `dlcs`）
  - 提供 `openOverlayUrl()` / `activateGameOverlay()` / `isDlcInstalled()` 等方法
- `usePlatform.ts`：平台状态 composable
  - 在组件中通过 `const { status, user, friends, ... } = usePlatform()` 访问
- `useSteamEntry.ts`：Steam 入口引导 composable
  - 处理 Steam 启动检测、重启请求、入口覆盖层显示
- `types.ts`：平台类型定义
  - `PlatformId`：`'mock'` | `'steam'`
  - `DwebPlatformStatus`：平台状态（active / activeDisplayName / available / user）
  - `DwebPlatformUser`：平台用户信息（steamId / displayName / avatarUrl / personaState）
  - `DwebPlatformDlcInfo`：DLC 信息
  - `PlatformEventMap`：平台事件类型映射

## 12. Vue 组合式函数（`src/composables/`）
- `useCardParticles.ts`：卡片粒子效果
- `useSquareParticles.ts`：方形粒子效果
- `useStartupProgress.ts`：启动进度
- `useSteamHotkeys.ts`：Steam 热键处理（监听 Steam Overlay 热键）
- `useSteamPanel.ts`：Steam 面板状态与交互

## 13. 适配器与跨模块桥（`src/adapters/`）
- `aiWorkflowPersistence.ts`：工作流持久化适配器
- `editorPersistence.ts`：编辑器持久化适配器
- `editorRecentCache.ts`：编辑器最近编辑缓存
- `windowEventBridge.ts`：窗口事件桥

## 14. 类型扩展（`src/types/`）
- `electron-bridge.d.ts`：`window.dweb.*` / `window.__DWEB_*` 的全局类型
- `three-rect-area-light.d.ts`：Three.js RectAreaLight 类型补丁
- `api.ts` / `utils.ts`：通用 API 与工具类型

## 15. 单元测试
- 测试运行：`npm run test`（vitest）
- 覆盖率：`npm run test:coverage`（@vitest/coverage-v8）
- 测试文件命名：与源文件同名 + `.spec.ts`（如 `core/scene/.../*.spec.ts`）

## 16. Web Worker（`src/workers/`）
- `exportRenderUploadWorker.ts`：导出渲染上传
- `exportUploadWorker.ts`：导出上传
