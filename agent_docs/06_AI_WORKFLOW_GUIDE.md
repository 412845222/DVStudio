# AI 工作流蓝图开发指引 (AI Workflow Guide)

## 1. 核心概念
- **Blueprint (蓝图)**: 整个工作流的载体，包含节点 (Nodes) 和连线 (Edges)。
- **Node (节点)**: 工作流中的基本单元，具有输入锚点 (Input Anchors) 和输出锚点 (Output Anchors)。
- **Resource (资源)**: 在节点间流转的数据实体（如图片、视频、文本、3D 模型、音频）。
- **Story Branch (剧情分支)**: Story 节点下的子分支，每条分支带一段剧情文本。

## 2. 双层结构

工作流功能分布在 **两层**：

| 层 | 路径 | 角色 |
| --- | --- | --- |
| **核心数据 / 类型 / 操作层** | `src/aiworkflow/` | 类型定义、节点目录、跨领域逻辑、持久化 |
| **页面渲染层** | `src/views/AIWorkflow/` | Vue 组件、画布交互、节点业务、composable |

> **修改节点类型或新接入三方服务** 时，**优先在 `src/aiworkflow/` 改类型与目录**，再到 `src/views/AIWorkflow/node-business/` 实现具体 UI 行为。

## 3. 新增节点类型的标准流程

1. **定义数据结构**: 在 `src/aiworkflow/types.ts` 中定义节点的 Type 与 Data 接口（含 `WorkflowAnchorSpec` / `WorkflowViewport` 等共用类型）。
2. **注册节点目录**: 在 `src/aiworkflow/nodeLibrary.ts` 中追加元数据（`NEWUI2_NODE_CATALOG_*`、`catalogMetadata(...)`），声明输入输出锚点、分类、搜索别名。
3. **实现领域逻辑**（可选）: 在 `src/aiworkflow/domain/<area>/` 下放置纯函数（如 ComfyUI 输入输出解析、URL 校验、世界坐标拾取等）。
4. **开发 UI 组件**: 在 `src/ui/WorkFlow/WorlFlowNodes/` 下创建 `Workflow<New>Node.vue`（**注意 `WorlFlow` 拼写沿用历史**），继承或参考 `WorkflowNodeBase.vue`。
5. **实现执行逻辑**: 在 `src/views/AIWorkflow/node-business/<area>/` 中实现节点业务（composable 形式），处理命令请求 / 状态同步 / 错误处理。
6. **注册面板**: 在 `BlueprintProjectToolbar.vue` / 节点菜单中加入该节点。
7. **更新 inspector 面板**: `src/ui/WorkFlow/WorkflowInspectorPanel.vue` 与 `src/views/AIWorkflow/node-business/` 中的 composable 联动。

## 4. 已有节点类型（`src/ui/WorkFlow/WorlFlowNodes/`）

| 节点 | 文件 | 说明 |
| --- | --- | --- |
| Image | `WorkflowImageNode.vue` | 图片节点 |
| Video | `WorkflowVideoNode.vue` | 视频节点 |
| Text | `WorkflowTextNode.vue` | 文本节点 |
| Story | `WorkflowStoryNode.vue` | 剧情节点（多分支） |
| TextMerge | `WorkflowTextMergeNode.vue` | 文本合并 |
| ComfyUI | `WorkflowComfyUINode.vue` | ComfyUI 推理 |
| Model3D | `WorkflowModel3DNode.vue` | 3D 模型 |
| MeshyModel | `WorkflowMeshyModelNode.vue` | Meshy 3D 生成 |
| SceneLayout | `WorkflowSceneLayoutNode.vue` | 场景布局 |
| SceneUnderstanding | `WorkflowSceneUnderstandingNode.vue` | 场景理解 |
| SceneDecompose | `WorkflowSceneDecomposeNode.vue` | 场景拆解 |
| RotateImage | `WorkflowRotateImageNode.vue` | 图片旋转 |
| UnrealExport | `WorkflowUnrealExportNode.vue` | Unreal 导出 |
| ImageMarkup | `ImageMarkupDialog.vue` | 图片标注对话框 |

子目录：
- `three-preview/WorkflowThreePreviewShell.vue` + `types.ts`：Three.js 预览外壳
- `model3d/Model3DPreviewViewer.ts`：3D 模型预览
- `sceneLayout/SceneLayoutPreviewViewer.ts`：场景布局预览

## 5. 页面层（`src/views/AIWorkflow/`）

| 子目录 / 文件 | 角色 |
| --- | --- |
| `AIWorkflowPage.vue` | 页面主入口（被 `src/views/AIWorkflow.vue` 包装） |
| `ResourceManagerWindow.vue` | 资源管理器独立窗口 |
| `assets/` | 资源持久化相关 composable |
| `blueprint-core/` | 画布核心（视口 / 选中 / 边 / Worker） |
| `bridge/component-events/` | 右键菜单、键盘、节点预览 |
| `bridge/feedback/` | Toast 状态等反馈 |
| `concurrency/` | 并发相关 |
| `network/` | 网络请求相关 |
| `node-business/chat/` | AI 对话 / 节点生成 / 视频任务面板 |
| `node-business/comfy/` | ComfyUI 业务（连接、输出路由、运行时） |
| `node-business/meshy/` | Meshy 业务（资产、命令、拖拽、任务面板） |
| `node-business/presentation/` | 节点展示（媒体预览源、文本输出、截图） |
| `node-business/project/` | 项目相关（catalog import、snapshot、transfer、unreal） |
| `node-business/scene/` | 场景相关（拆解、布局、场景理解） |
| `node-business/unreal/` | Unreal 导出 |
| `useAIWorkflowNodeActions.ts` / `useAIWorkflowNodeRefresh.ts` / `useAIWorkflowNodeSettings.ts` / `useAIWorkflowTextMergeCommands.ts` | 通用节点 action |
| `ui/AIWorkflowDebugPanel.vue` | 页面内嵌调试面板 |

## 6. 核心数据层（`src/aiworkflow/`）

- `types.ts`：节点、边、锚点、视口、剧情分支、图像裁剪、像素矩形等核心类型
- `actions.ts`：单选 / 删除等轻量级操作
- `nodeLibrary.ts`：节点目录元数据（与 `ui/UIComponent/DwebCanvasMenu.types.ts` 联动）
- `resource/`：资源池（`pool.ts` / `index.ts` / `types.ts` / `usage.ts`）
- `domain/comfyui/parseWorkflowIO.ts`：解析 ComfyUI 工作流的输入输出
- `domain/link/anchorKinds.ts`：锚点类型常量
- `domain/resource/safeWorkflowUrl.ts`：工作流 URL 合法性校验
- `domain/resource/createVideoFirstFrameThumbnail.ts`：视频首帧缩略图
- `domain/selection/hitTestNodesInWorldRect.ts`：世界坐标矩形框选
- `persistence/blueprintSnapshot.ts`：蓝图快照序列化（保存到项目）
- `MediaResourceImportManager.ts` / `mediaResourceImportWorker.ts`：资源导入
- `VideoFirstFrameCaptureQueue.ts`：首帧捕获队列
- `VideoMetadataReadQueue.ts`：视频元数据读取队列
- `imageOutput.ts`：图片输出
- `localFileHandleDb.ts`：本地文件句柄 IndexedDB 缓存

## 7. 后端通信

### 7.1 ComfyUI 桥接
- 前端通过 `src/network/ComfyUIBridgeService.ts` 与 Django `comfyui_bridge` 通信。
- 后端负责将请求转发给实际的 ComfyUI 服务，并处理跨域、任务队列、SSL CDN 兼容等问题。
- 节点状态（排队中、执行中、完成、失败）需要实时同步到前端 Vuex 状态中。

### 7.2 三方 API 网关（Meshy / Seedance / NanoBanana / SeeDream / 即梦）
> **双层路由结构**（与 `04_BACKEND_GUIDE.md` 第 7 节一致）：
> - **共享实现库**：`django-app/comfyui_bridge/api.py` —— 包含所有三方服务的实现函数
> - **新路由层**：`django-app/third_party_api_gateway/` —— 包装实现并暴露为 HTTP 端点
> - 路由前缀：`/api/third-party/`（**不是** `/api/workflow/`，不要混淆）
- 实现函数位置：`django-app/comfyui_bridge/api.py`（被 `third_party_api_gateway/api.py` 复用）
- 路由挂载位置：`django-app/third_party_api_gateway/urls.py`（挂载到 `dwebsite/urls.py` 的 `/api/third-party/`）
- 模型定义位置：`django-app/third_party_api_gateway/models.py`（`MeshyTaskMirror` + `VideoGenerationTaskMirror`）
- 任务状态由 LocalDB 镜像表（`meshy_tasks` / `video_tasks`）保存，前端通过 `window.dweb.aiworkflow.db.meshy.*` 与 `window.dweb.aiworkflow.db.video.*` 访问

### 7.3 AI 对话
- 通过 `src/network/AIChatService.ts` 走 SSE 流式输出。
- 默认后端为 GitHub Copilot CLI（`/api/workflow/copilot/*`），兼容 Codex CLI（`/api/workflow/codex/*`）。

## 8. 渲染与交互

- 画布：`src/ui/BluePrint/BlueprintCanvas.vue`
- 连线：`src/ui/WorkFlow/WorkflowEdgeLayer.vue`
- 节点基类：`src/ui/WorkFlow/WorkflowNodeBase.vue`
- 选中工具栏：`src/ui/WorkFlow/WorkflowSelectionToolbar.vue`
- 检查器面板：`src/ui/WorkFlow/WorkflowInspectorPanel.vue`
- 项目工具栏：`src/ui/WorkFlow/BlueprintProjectToolbar.vue`
- 资源面板：`src/ui/WorkFlow/ResourceManagerPanel.vue`
- Meshy 任务面板：`src/ui/WorkFlow/MeshyTaskPanel.vue`
- 视频任务面板：`src/ui/WorkFlow/VideoTaskPanel.vue`
- 日志面板：`src/ui/WorkFlow/BlueprintLogPanel.vue`

## 9. 关键约定

- **数据流向**：用户操作 → 节点 composable → Vuex mutation → 画布重新渲染；远端状态由 AI Service 流式回写到 Vuex。
- **节点 ID 与锚点 ID**：由 `src/core/project/package/ids.ts` 工厂生成，**禁止**在 UI 层手动拼接。
- **连线规则**：`comfyui_bridge` / `anchorKinds.ts` 决定哪些 mediaType 可以互连。
- **资源 URL 解析**：所有展示 / 上传的资源 URL 走 `src/network/backendConfig.ts` 的 `resolveBackendUrl()`，dweb:// 协议自动被 Electron 拦截。
- **蓝图快照**：保存项目时使用 `src/aiworkflow/persistence/blueprintSnapshot.ts` 序列化，反序列化必须做版本兼容处理。

## 10. 关键文件位置速查

| 关注点 | 路径 |
| --- | --- |
| 核心类型 | `src/aiworkflow/types.ts` |
| 节点目录 | `src/aiworkflow/nodeLibrary.ts` |
| 蓝图快照 | `src/aiworkflow/persistence/blueprintSnapshot.ts` |
| 页面主入口 | `src/views/AIWorkflow/AIWorkflowPage.vue` |
| 节点业务 | `src/views/AIWorkflow/node-business/` |
| 节点 UI 组件 | `src/ui/WorkFlow/WorlFlowNodes/` |
| 画布 | `src/ui/BluePrint/BlueprintCanvas.vue` |
| ComfyUI 服务 | `src/network/ComfyUIBridgeService.ts` |
| AI 对话服务 | `src/network/AIChatService.ts` |
| ComfyUI 后端 | `django-app/comfyui_bridge/api.py`（共享实现库） |
| 三方 API 网关路由层 | `django-app/third_party_api_gateway/{api,urls,models}.py`（挂在 `/api/third-party/`） |
| 节点 Inspector 数据 composable | `src/views/AIWorkflow/node-business/` |
