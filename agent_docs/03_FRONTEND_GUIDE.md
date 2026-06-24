# 前端开发指引 (Frontend Guide)

## 1. 技术栈
- **框架**: Vue 3（Composition API, `<script setup lang="ts">`）
- **语言**: TypeScript
- **状态管理**: Vuex 4
- **构建工具**: Vite
- **路由**: Vue Router 4（`src/router/index.ts`，Electron 下 Hash 模式，Web 下 History 模式）
- **渲染引擎**: 自研 WebGL2 引擎（`src/engine/webgl/`）
- **运行平台**: `src/network/runtimePlatform.ts`（electron / web / unknown）
- **测试**: Vitest + @vue/test-utils + jsdom

## 2. 组件开发规范
- 优先使用 `<script setup lang="ts">`。
- 样式使用 scoped CSS，或引入全局的 CSS 变量（`src/styles/`）。
- 复杂组件应拆分为逻辑（Composable/Hook）和视图（Template）。
- **绝对避免**在组件中直接调用 `window.dweb.*`：请通过 `src/electronBridge/index.ts` 封装。

## 3. 状态管理 (Vuex)
- 状态按模块划分：`aiworkflow` / `timeline` / `videoscene` / `videostudio` / `theme`。
  - `src/store/aiworkflow/store.ts`：工作流节点、边、资源池。
  - `src/store/timeline/store.ts`：视频编辑器时间轴、关键帧、缓动。
  - `src/store/videoscene/store.ts`：舞台场景树、节点状态、选中。
  - `src/store/videostudio/store.ts`：编辑器全局状态。
  - `src/store/theme/store.ts`：主题 / 皮肤。
- **严禁**在组件中直接修改 Vuex state，必须通过 Mutation。
- 复杂的异步逻辑或多 Mutation 组合应放在 Action 中。
- 仅在单个组件内使用的状态（如弹窗开关、表单临时输入）使用 `ref` / `reactive`。

## 4. 核心业务模块（`src/core/`）
- `scene/`：舞台场景树与节点命令（`commands/` 下的 nodes / lines / moveNode / overlay / selection / snap / interaction）
  - `scene/nodesType/`：节点类型定义（`NodeBase` / `RectNode` / `TextNode` / `ImageNode` / `LineNode`）
  - `scene/factories/videoSceneState.ts`：场景状态工厂
  - `scene/tree.ts`：场景树操作
- `project/`：项目包（package assets / ids / io / normalize / rewriteAssetIds / serialize）
- `history/`：编辑器撤销/重做核心
- `events/`：类型化事件总线（`typedEventBus` + `dvsEvents`）
- `components/`：组件库 API（api / exportTemplate / instantiate / validate / types）
- `agentToUI/`：AI → UI 协议解析（`consumeComponentTemplate` / `videoScenePlan` / `guards` / `types`）
- `studio/`：工厂函数
- `subtitle/`：SRT 与字幕关键帧
- `timeline/`：时间轴核心
- `shared/`：通用工具（cloneJsonSafe / json / time）

## 5. AI 工作流核心（`src/aiworkflow/`）
> 页面渲染层在 `src/views/AIWorkflow/`，**核心数据/类型/操作层在 `src/aiworkflow/`**。
- `types.ts`：节点、边、锚点、资源等核心类型
- `actions.ts`：单选/删除等小操作
- `nodeLibrary.ts`：节点目录元数据
- `resource/`：资源池（`pool.ts` / `index.ts` / `types.ts` / `usage.ts`）
- `domain/`：跨领域逻辑
  - `comfyui/parseWorkflowIO.ts`：解析 ComfyUI 工作流输入输出
  - `link/anchorKinds.ts`：锚点类型常量
  - `resource/safeWorkflowUrl.ts`：URL 合法性校验
  - `resource/createVideoFirstFrameThumbnail.ts`：视频首帧缩略图
  - `selection/hitTestNodesInWorldRect.ts`：世界坐标矩形框选
- `persistence/blueprintSnapshot.ts`：蓝图快照序列化
- `MediaResourceImportManager.ts` / `mediaResourceImportWorker.ts`：资源导入
- `VideoFirstFrameCaptureQueue.ts`：首帧捕获队列
- `VideoMetadataReadQueue.ts`：视频元数据读取队列
- `imageOutput.ts` / `localFileHandleDb.ts`：图片输出与本地文件句柄缓存

## 6. 渲染引擎（`src/engine/webgl/`）
- **架构**: 采用类似场景图（Scene Graph）的结构。
- **节点类型**: `RectNode` / `TextNode` / `ImageNode` / `LineNode` 及其 Renderer（`RectRenderer` / `TextRenderer` / `ImageRenderer` / `LineRenderer`）
  - 数据结构在 `src/core/scene/nodesType/`
  - 渲染器在 `src/engine/webgl/renderers/`
- **核心模块**:
  - `canvas/DwebCanvasGL.ts`：WebGL2 画布主类
  - `canvas/postprocess/`：后期处理管线（pipeline / program / targets / types）
  - `scene/DwebVideoScene.ts`：视频场景对象
  - `shaders/`：GLSL 着色器（postBlur / postGlowComposite）
  - `material/`：基础 2D shader 与圆角矩形 / 蒙版材质
  - `camera/camera2d.ts`：2D 摄像机
  - `picking/rectPicking.ts`：矩形拾取
  - `pipeline/glProgram.ts`：着色器程序封装
  - `resources/DwebImagePool.ts`：图片资源池
  - `texture/texture2d.ts`：2D 纹理管理
- **修改指南**: 新增节点类型时，必须同时实现：
  1. `src/core/scene/nodesType/<New>Node.ts` 的数据结构
  2. `src/engine/webgl/renderers/<New>Renderer.ts` 的渲染逻辑
  3. 在 `src/core/scene/nodesType/index.ts` 中注册

## 7. UI 组件库（`src/ui/`）
- `BluePrint/`：工作流画布（`BlueprintCanvas.vue`）与节点对话框（`node-dialog/`）
- `WorkFlow/`：工作流节点组件（`WorlFlowNodes/`，注意 `WorlFlow` 拼写沿用历史）
  - `WorlFlowNodes/`：节点 Vue 组件（`WorkflowImageNode` / `WorkflowVideoNode` / `WorkflowTextNode` / `WorkflowStoryNode` / `WorkflowComfyUINode` / `WorkflowModel3DNode` / `WorkflowMeshyModelNode` / `WorkflowSceneLayoutNode` / `WorkflowSceneUnderstandingNode` / `WorkflowSceneDecomposeNode` / `WorkflowRotateImageNode` / `WorkflowTextMergeNode` / `WorkflowUnrealExportNode` / `ImageMarkupDialog`）
  - `WorlFlowNodes/three-preview/`：Three.js 预览（`WorkflowThreePreviewShell.vue`）
  - `WorlFlowNodes/model3d/` / `WorlFlowNodes/sceneLayout/`：3D / 场景预览子模块
  - `WorkflowNodeBase.vue`：所有节点 UI 的基类
  - `WorkflowEdgeLayer.vue`：连线渲染
  - `BlueprintProjectToolbar.vue` / `BlueprintLogPanel.vue` / `MeshyTaskPanel.vue` / `VideoTaskPanel.vue` / `ResourceManagerPanel.vue` / `WorkflowInspectorPanel.vue` / `WorkflowSelectionToolbar.vue`
- `TimeLine/`：时间轴（`TimeLine.vue` + `audio/` + `components/` + `core/` + `progress/`）
- `UIComponent/`：通用 UI 组件（`GlobalPageBackground` / `GlobalTitleBar` / `GlobalSideNav` / `BottomChatDock` / `SideNavDock` / `ModalDialog` / `ToastStack` / `MarkdownViewer` / `VideoController` / `WorkflowInspectorPanel` / `FullscreenProgressOverlay` / `PageTransitionOverlay` / `StartupProgressBar` / `SeedanceVideoForm` / `ContextMenu` / `DwebCanvasNodeSearchMenu`）
- `VideoScene/`：视频场景编辑器（`VideoScene.vue` + `anim/` + `dialogs/` + `markdown/` + `nodesType/` + `panels/` + `parts/` + `ruler/` + `subtitleAI/` + `VideoSceneRuntime.ts`）
- `AIChat/`：AI 对话组件（`AIChatDialog.vue`）
- `Electron/`：Electron 启动环境（`CommandConsole.vue` / `EnvCheckList.vue`）

## 8. AI 工作流页面（`src/views/AIWorkflow/`）
- `AIWorkflowPage.vue`：页面主入口
- `ResourceManagerWindow.vue`：资源管理器窗口
- `assets/`：资源持久化相关 composable（`useAIWorkflowAssetPersistence` / `useAIWorkflowDropAssets` / `useAIWorkflowBatchMediaImport` / `useAIWorkflowImportRecoveryState` / `useAIWorkflowLocalResourceRecovery` / `useAIWorkflowNodeAssetBinding` / `useAIWorkflowNodeResourceCleanup` / `useAIWorkflowObjectUrlRegistry` / `useAIWorkflowResourceCache` / `useAIWorkflowResourceMigration` / `useAIWorkflowResourceRecordCleanup` / `useAIWorkflowSceneLayoutModelBinding`）
- `blueprint-core/`：画布核心逻辑（`canvas-interaction/` / `linking/` / `workers/edgePathWorker.ts` / `useAIWorkflowEdgeIndex` / `useAIWorkflowEdgeRenderer` / `useAIWorkflowNodeVisibility` / `useAIWorkflowPerfMonitor` / `useAIWorkflowSelectionState` / `useAIWorkflowThreejsLifecycleManager` / `useAIWorkflowViewport` / `blueprintLog`）
- `bridge/`：桥接（`component-events/` / `feedback/`）
- `concurrency/`：并发相关
- `network/`：网络请求相关
- `node-business/`：节点业务（`chat/` / `comfy/` / `meshy/` / `presentation/` / `project/` / `scene/` / `unreal/` + `useAIWorkflowNodeActions` / `useAIWorkflowNodeRefresh` / `useAIWorkflowNodeSettings` / `useAIWorkflowTextMergeCommands`）
- `ui/`：页面内嵌 UI（`AIWorkflowDebugPanel.vue`）

## 9. Network 层（`src/network/`）
- `AIChatService.ts`：AI 对话（Copilot CLI / Codex CLI），流式 SSE
- `AICredentialService.ts`：API 凭证管理
- `ComfyUIBridgeService.ts`：ComfyUI 桥接
- `BlueprintProjectService.ts`：项目保存 / 加载
- `ComponentLibraryService.ts`：组件库
- `ExportService.ts`：导出任务
- `UnrealExportService.ts`：Unreal 导出
- `LegalDocService.ts`：法律文档
- `LocalExecChatService.ts`：本地执行型对话
- `SceneSkillService.ts`：场景理解 / 灯光 / 布局 / Unreal 等 Agent Skills
- `SubtitleAIService.ts`：字幕 AI（subtitle / palette / template 等）
- `backendConfig.ts`：后端地址解析 + `resolveBackendUrl()` 工具
- `runtimePlatform.ts`：运行平台检测
- `blueprintRequestLog.ts`：请求日志

## 10. Electron 桥接（`src/electronBridge/`）
- 命名空间：
  - `common.*`：后端地址/状态、设置、setup、诊断、窗口、引导安装
  - `aiworkflow.*`：项目/资源/Meshy/Video 任务、LocalDB、API 密钥、图片标注、资源管理器
  - `videostudio.*`：导出目录等
  - `window.*`：最小化/最大化/重载/开发者工具
- 详细函数清单请查阅 `src/electronBridge/index.ts` 与 `src/electronBridge/types.ts`。

## 11. 适配器与跨模块桥（`src/adapters/`）
- `aiWorkflowPersistence.ts`：工作流持久化适配器
- `editorPersistence.ts`：编辑器持久化适配器
- `editorRecentCache.ts`：编辑器最近编辑缓存
- `windowEventBridge.ts`：窗口事件桥

## 12. 类型扩展（`src/types/`）
- `electron-bridge.d.ts`：`window.dweb.*` / `window.__DWEB_*` 的全局类型
- `three-rect-area-light.d.ts`：Three.js RectAreaLight 类型补丁

## 13. 单元测试
- 测试运行：`npm run test`（vitest）
- 覆盖率：`npm run test:coverage`（@vitest/coverage-v8）
- 测试文件命名：与源文件同名 + `.spec.ts`（如 `core/scene/.../*.spec.ts`）

## 14. Web Worker（`src/workers/`）
- `exportRenderUploadWorker.ts`：导出渲染上传
- `exportUploadWorker.ts`：导出上传
