# AI 工作流蓝图开发指引 (AI Workflow Guide)

## 🔴🔴🔴 架构红线必读（2026-07-27更新）

### 图形底座 + 蓝图业务层双层架构

AI工作流蓝图已迁移到**图形底座（GraphBase）+ 蓝图业务层（Blueprint）**的新架构：

```
┌─────────────────────────────────────────────────────┐
│  Vuex Store（仅页面级状态）                           │
│  - selectedNodeIds（UI选中状态，只读投影）             │
│  - nodeChatDialog（聊天对话框UI状态）                 │
│  - viewport（视口状态，只读投影）                      │
│  - 任务面板状态、toast通知、面板开关                  │
│  ❌ 不存储节点位置、连线、尺寸等蓝图绘制状态           │
└───────────────▲─────────────────────────────────────┘
                │ Engine → Vuex（单向只读投影）
                │ 禁止 Vuex → Engine 全量同步
┌───────────────┴─────────────────────────────────────┐
│  AIWorkflowPage.vue（Host桥接层）                    │
│  - onBlueprintEditorChange → hydrateDraft到Vuex     │
│  - onBlueprintEditorSelectionChange → 同步选中状态    │
│  - requestStoreSyncToEditor() 仅显式业务流程调用      │
│  ❌ watch selectedNodeIds 禁止触发反向loadBlueprint   │
└───────────────▲─────────────────────────────────────┘
                │ 通过 BlueprintEditor.vue 组件通信
┌───────────────┴─────────────────────────────────────┐
│  蓝图业务层（src/engine/blueprint/）                  │
│  - BlueprintScene：节点/连线CRUD、序列化、撤销重做     │
│  - BlueprintNode：节点业务数据+渲染                   │
│  - BlueprintEditorTool：交互（拖拽/选框/连线/右键）   │
│  - BlueprintDomOverlay：DOM覆盖层（编辑态节点）       │
│  - Commands：撤销重做命令栈                          │
│  唯一数据源：node.setPosition() / node.setSize()     │
└───────────────▲─────────────────────────────────────┘
                │ 继承/组合
┌───────────────┴─────────────────────────────────────┐
│  图形底座（src/engine/graphbase/）                    │
│  - Scene/GraphObject：场景图、Transform、渲染         │
│  - Canvas2DRenderer：Canvas2D渲染                    │
│  - InputManager：输入事件分发                        │
│  - SelectionManager/DragManager：选择/拖拽基础能力    │
│  - Camera：视口/缩放/平移                            │
│  只负责通用2D图形能力，不知道"蓝图"业务概念            │
└─────────────────────────────────────────────────────┘
```

### 数据流向铁律（违反即bug）

1. **唯一数据源**：引擎内部（`transform.position` + `data.worldX/Y` 通过 `setPosition()` 同步）是蓝图绘制状态的唯一权威来源
2. **单向数据流**：
   - ✅ **引擎 → Vuex**：用户交互完成后通过 `emitChange` → `onBlueprintEditorChange` → `hydrateDraft` 同步
   - ❌ **禁止 Vuex → 引擎全量重建**：除初始加载和显式业务流程外，禁止通过 `loadBlueprint()` 从Vuex重建节点
3. **API封装**：
   - ✅ 节点位置修改：必须使用 `node.setPosition(x, y)` 或 `node.translate(dx, dy)`
   - ✅ 节点尺寸修改：必须使用 `node.setSize(w, h)` 或 `node.updateSize(w, h)`
   - ❌ 禁止直接赋值：`node.transform.position.x = ...`、`node.data.worldX = ...`
4. **Vuex的职责边界**：
   - ✅ 页面级UI状态：对话框开关、面板展开/折叠、toast通知、选中高亮状态
   - ✅ 后端任务状态：ComfyUI/Meshy/Tripo3d等任务进度
   - ✅ 引擎状态的只读投影：nodesById/edges（供Inspector面板等非画布组件读取）
   - ❌ 禁止：节点位置/尺寸/连线坐标等蓝图绘制状态的"真值存储"
   - ❌ 禁止：通过watch Vuex状态变化来反向驱动引擎重建

### 禁止的代码模式（架构门禁测试会拦截）

| 禁止模式 | 原因 | 正确做法 |
|---------|------|---------|
| `node.transform.position.x = ...` | 绕过setPosition，双轨数据不一致 | `node.setPosition(x, y)` |
| `node.data.worldX = ...` | 绕过setPosition，双轨数据不一致 | 通过setPosition统一入口 |
| `watch(() => store.state.selectedNodeIds, ...)`触发syncBlueprintNow | 点击空白deselect→反向loadBlueprint→位置回退 | selectedNodeIds变化不触发蓝图重建 |
| `syncBlueprintNow()` 在用户交互路径调用 | Vuex→Engine反向覆盖拖拽结果 | 仅业务自动流程显式调用requestStoreSyncToEditor() |
| 在业务代码中直接修改 `transform.position` | 绕过API封装，数据不同步 | 始终通过公共API修改 |

### 新架构关键文件

| 模块 | 路径 | 职责 |
|------|------|------|
| 图形底座入口 | [src/engine/graphbase/](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/engine/graphbase) | 通用2D渲染/交互/场景图 |
| 图形对象基类 | [GraphObject.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/engine/graphbase/scene/GraphObject.ts) | setPosition/translate/setSize API |
| 蓝图场景 | [BlueprintScene.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/engine/blueprint/BlueprintScene.ts) | 节点/连线CRUD、序列化、命令栈 |
| 蓝图节点 | [BlueprintNode.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/engine/blueprint/BlueprintNode.ts) | 业务数据+setPosition同步data |
| 交互工具 | [BlueprintEditorTool.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/engine/blueprint/BlueprintEditorTool.ts) | 拖拽/选框/连线交互 |
| DOM覆盖层 | [BlueprintDomOverlay.vue](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/engine/blueprint/dom/BlueprintDomOverlay.vue) | 编辑态DOM节点渲染 |
| Host桥接 | [AIWorkflowPage.vue](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/views/AIWorkflow/AIWorkflowPage.vue) | 引擎↔Vuex桥接（单向） |
| 状态适配器 | [workflowStateAdapter.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/src/views/AIWorkflow/blueprint-bridge/workflowStateAdapter.ts) | 引擎LegacyData ↔ Vuex WorkflowState转换 |

---

## ⚠️ 重要架构变更（历史）

**后端通信已从 Django HTTP 改为 Electron IPC**。所有后端调用通过 `src/network/ipcClient.ts` 走 Electron IPC 通道，不再使用 HTTP 请求到 localhost。

## 1. 核心概念
- **Blueprint (蓝图)**: 整个工作流的载体，包含节点 (Nodes) 和连线 (Edges)。
- **Node (节点)**: 工作流中的基本单元，具有输入锚点 (Input Anchors) 和输出锚点 (Output Anchors)。
- **Resource (资源)**: 在节点间流转的数据实体（如图片、视频、文本、3D 模型、音频）。
- **Story Branch (剧情分支)**: Story 节点下的子分支，每条分支带一段剧情文本。

## 2. 双层结构

工作流功能分布在 **两层**：

| 层 | 路径 | 角色 |
| --- | --- | --- |
| **核心数据 / 类型 / 操作层** | `src/aiworkflow/` | 类型定义、节点目录、跨领域逻辑、持久化、资源池管理 |
| **页面渲染层** | `src/views/AIWorkflow/` | Vue 组件、画布交互、节点业务、composable、节点截图缓存 |

> **修改节点类型或新接入三方服务** 时，**优先在 `src/aiworkflow/` 改类型与目录**，再到 `src/views/AIWorkflow/node-business/` 实现具体 UI 行为。

## 3. 新增节点类型的标准流程

1. **定义数据结构**: 在 `src/aiworkflow/types.ts` 中定义节点的 Type 与 Data 接口（含 `WorkflowAnchorSpec` / `WorkflowViewport` 等共用类型）。
2. **注册节点目录**: 在 `src/aiworkflow/nodeLibrary.ts` 中追加元数据（`NEWUI2_NODE_CATALOG_*`、`catalogMetadata(...)`），声明输入输出锚点、分类、搜索别名。
3. **实现领域逻辑**（可选）: 在 `src/aiworkflow/domain/<area>/` 下放置纯函数（如 ComfyUI 输入输出解析、URL 校验、世界坐标拾取等）。
4. **开发 UI 组件**: 在 `src/ui/WorkFlow/WorlFlowNodes/` 下创建 `Workflow<New>Node.vue`（**注意 `WorlFlow` 拼写沿用历史**），继承或参考 `WorkflowNodeBase.vue`。
5. **实现节点聊天对话框**（如需要）: 复用 `src/ui/BluePrint/node-dialog/` 中的 `NodeChatDialog` / `NodeChatInput` / `NodeChatParamPanel` 组件。
6. **实现执行逻辑**: 在 `src/views/AIWorkflow/node-business/<area>/` 中实现节点业务（composable 形式），通过 `ipcClient` 调用对应后端 IPC 模块。
7. **注册面板**: 在 `BlueprintProjectToolbar.vue` / 节点菜单（`DwebCanvasNodeSearchMenu`）中加入该节点。
8. **更新 inspector 面板**: `src/ui/WorkFlow/WorkflowInspectorPanel.vue` 与 `src/views/AIWorkflow/node-business/` 中的 composable 联动。

## 4. 已有节点类型（`src/ui/WorkFlow/WorlFlowNodes/`）

| 节点 | 文件 | 说明 | 后端模块 |
| --- | --- | --- | --- |
| Image | `WorkflowImageNode.vue` | 图片节点 | - |
| Video | `WorkflowVideoNode.vue` | 视频节点 | - |
| Text | `WorkflowTextNode.vue` | 文本节点 | - |
| Story | `WorkflowStoryNode.vue` | 剧情节点（多分支） | - |
| TextMerge | `WorkflowTextMergeNode.vue` | 文本合并 | - |
| ComfyUI | `WorkflowComfyUINode.vue` | ComfyUI 推理 | `comfyui` |
| Model3D | `WorkflowModel3DNode.vue` | 3D 模型 | - |
| MeshyModel | `WorkflowMeshyModelNode.vue` | Meshy 3D 生成 | `meshy` |
| Tripo3D | `WorkflowTripo3DNode.vue` | Tripo3D 3D 生成 & 图片生成 | `tripo3d` |
| Gemini | `WorkflowGeminiNode.vue` | Gemini 图片生成 | `gemini` |
| Ark | （集成于任务面板） | 火山方舟任务管理 | `ark` |
| Blender | `WorkflowBlenderNode.vue` | Blender MCP 集成 | `blender` |
| SceneLayout | `WorkflowSceneLayoutNode.vue` | 场景布局 | `agent-skills` |
| SceneUnderstanding | `WorkflowSceneUnderstandingNode.vue` | 场景理解 | `agent-skills` |
| SceneDecompose | `WorkflowSceneDecomposeNode.vue` | 场景拆解 | `agent-skills` |
| SceneLighting | （待确认） | 场景光照 | `agent-skills` |
| RotateImage | `WorkflowRotateImageNode.vue` | 图片旋转 | - |
| UnrealExport | `WorkflowUnrealExportNode.vue` | Unreal 导出 | `agent-skills` |
| ImageMarkup | `ImageMarkupDialog.vue` | 图片标注对话框 | - |
| Seedance | `WorkflowSeedanceNode.vue` | Seedance 视频生成 | `seedance` |

子目录：
- `three-preview/WorkflowThreePreviewShell.vue` + `types.ts`：Three.js 预览外壳
- `model3d/Model3DPreviewViewer.ts`：3D 模型预览
- `sceneLayout/SceneLayoutPreviewViewer.ts`：场景布局预览
- `blender/`：Blender 节点相关组件

## 5. 页面层（`src/views/AIWorkflow/`）

| 子目录 / 文件 | 角色 |
| --- | --- |
| `AIWorkflowPage.vue` | 页面主入口（被 `src/views/AIWorkflow.vue` 包装） |
| `ResourceManagerWindow.vue` | 资源管理器独立窗口 |
| `TemplateCenterWindow.vue` | 模板中心独立窗口 |
| `assets/` | 资源持久化相关 composable（含 `useAIWorkflow404Fallback`、资源迁移、缓存、批量导入等） |
| `blueprint-core/` | 画布核心（视口 / 选中 / 边 / Worker / 性能监控 / Three.js 生命周期 / 选择框 / 标签编辑器 / 锚点磁吸 / 小地图） |
| `bridge/component-events/` | 右键菜单、键盘、节点预览、资源操作 |
| `bridge/feedback/` | Toast 状态等反馈 |
| `components/` | 通用组件（小地图、主题预热进度、节点层、锚点层、命中区域层） |
| `network/` | 网络请求相关（通过 IPC 客户端调用后端） |
| `node-business/chat/` | AI 对话 / 节点生成 / 视频任务面板 / Agent 工具桥接 |
| `node-business/comfy/` | ComfyUI 业务（连接、输出路由、运行时、类型定义） |
| `node-business/meshy/` | Meshy 业务（资产、命令、拖拽、任务面板、输入解析、请求、运行时） |
| `node-business/tripo3d/` | Tripo3D 业务（3D 生成、图片生成、任务面板、输入解析、资源、命令、运行时） |
| `node-business/gemini/` | Gemini 业务（图片生成任务面板） |
| `node-business/ark/` | 火山方舟业务（任务面板） |
| `node-business/blender/` | Blender 业务（MCP 连接、Agent 聊天、上游输入处理） |
| `node-business/seedance/` | Seedance 业务（视频生成任务） |
| `node-business/presentation/` | 节点展示（媒体预览源、文本输出、截图、旋转图片输出、节点额外属性、视频截图） |
| `node-business/project/` | 项目相关（catalog import、snapshot、transfer、unreal、package、identity、云模板持久化） |
| `node-business/scene/` | 场景相关（拆解、布局、场景理解、光照、元数据、模型绑定） |
| `node-business/unreal/` | Unreal 导出 |
| `node-screenshot/` | **节点截图持久化缓存**（IndexedDB 缓存 + 截图池 composable + 画布预热协调器） |
| `useAIWorkflowNodeActions.ts` / `useAIWorkflowNodeRefresh.ts` / `useAIWorkflowNodeSettings.ts` / `useAIWorkflowTextMergeCommands.ts` | 通用节点 action |
| `ui/AIWorkflowDebugPanel.vue` | 页面内嵌调试面板 |

## 6. 核心数据层（`src/aiworkflow/`）

- `types.ts`：节点、边、锚点、视口、剧情分支、图像裁剪、像素矩形等核心类型
- `actions.ts`：单选 / 删除等轻量级操作
- `nodeLibrary.ts`：节点目录元数据（与 `ui/UIComponent/DwebCanvasMenu.types.ts` 联动）
- `imageCropEnforcer.ts`：图片裁剪强制器
- `imageOutput.ts`：图片输出
- `localFileHandleDb.ts`：本地文件句柄 IndexedDB 缓存
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

## 7. 节点截图缓存（`src/views/AIWorkflow/node-screenshot/`）

为提升工作流画布性能，节点截图使用 IndexedDB 持久化缓存：

- `nodeScreenshotPersistentCache.ts`：节点截图 IndexedDB 持久化缓存
- `useNodeScreenshotPool.ts`：节点截图池 composable，管理截图的内存缓存与持久化
- `index.ts`：统一导出

## 8. 节点聊天对话框（`src/ui/BluePrint/node-dialog/`）

部分节点（如需要 AI 辅助输入的节点）支持内置聊天对话框：

- `NodeChatDialog.vue`：节点聊天对话框容器
- `NodeChatInput.vue`：聊天输入框
- `NodeChatParamPanel.vue`：聊天参数面板
- `nodeChatConfig.ts`：节点聊天配置
- `index.ts`：统一导出

通过节点上的聊天按钮打开，用于针对单个节点进行 AI 交互（如生成文本描述、调整参数等）。聊天通过 `chat` 后端 IPC 模块的流式通道实现。

## 9. 后端通信

> 所有后端通信通过 Electron IPC 进行，不再使用 HTTP 请求到 Django。前端使用 `src/network/ipcClient.ts` 的 `ipcCall()` 和 `ipcStream()` 调用后端。

### 9.1 IPC 客户端使用

```typescript
import { ipcCall, ipcStream, hasIpcModule } from '../network/ipcClient'

// 检测模块可用性
if (hasIpcModule('comfyui')) {
  // 普通调用
  const result = await ipcCall(() => window.dweb.comfyui.submit(workflow))
}

// 流式调用（AI 对话等）
const generator = ipcStream(() => window.dweb.chat.sendMessageStream({ message: 'hello' }))
for await (const chunk of generator) {
  // 处理流式数据
}
```

### 9.2 ComfyUI 桥接
- 前端通过 `src/network/ComfyUIBridgeService.ts` 与后端 `comfyui` IPC 模块通信。
- 后端负责将请求转发给实际的 ComfyUI 服务，并处理跨域、任务队列、SSL CDN 兼容等问题。
- 节点状态（排队中、执行中、完成、失败）通过 LocalDB `comfyui_jobs` 表同步到前端 Vuex 状态中。
- IPC 通道前缀：`dweb:comfyui:`

### 9.3 三方 API 集成（Meshy / Seedance / NanoBanana / SeeDream / 即梦）
> 所有三方 API 直接在 Electron 主进程通过 `core/http-client.mjs` 调用，不再经过 Django HTTP 网关。

- **Meshy**：后端模块 `meshy/`，IPC 通道前缀 `dweb:meshy:`
  - 任务存储在 LocalDB `meshy_tasks` 表
  - 前端通过 `window.dweb.meshy.*` 访问
- **Seedance**：后端模块 `seedance/`，IPC 通道前缀 `dweb:seedance:`
  - 任务存储在 LocalDB `video_tasks` 表
  - 前端通过 `window.dweb.seedance.*` 访问
- **其他三方服务**（NanoBanana / SeeDream / 即梦等）：后端模块 `third-party/`，IPC 通道前缀 `dweb:third-party:`
- **任务状态访问**：前端可通过 `window.dweb.aiworkflow.db.*` 直接查询 LocalDB 中的任务状态

### 9.4 AI 对话
- 通过 `src/network/AIChatService.ts` 走 IPC 流式通道（`dweb:chat:sendMessage`，stream: true）。
- 默认后端直接在 Electron 主进程调用外部 AI API（DeepSeek、Gemini 等），不再依赖 Copilot/Codex CLI（可选模块 `codex/` 仍保留）。
- 节点级聊天复用同一 IPC 流通道，但通过节点上下文参数区分。
- API 密钥存储在 LocalDB `api_keys` 表（AES-256-GCM 加密）。

### 9.5 Agent 系统
- 通过后端模块 `agent/` 实现，IPC 通道前缀 `dweb:agent:`
- 统一 Agent Runtime + Provider 架构，支持 dvsagent/copilot/codex 等多种后端
- 支持流式对话、工具调用循环、上下文构建、历史管理
- 会话数据存储在 LocalDB `chat_conversations` 表
- 前端通过 `src/network/chat/` 下的多个服务（AgentChatService、DVSAgentChatService等）调用

### 9.6 MCP 工具系统
- 通过后端模块 `mcp/` 实现，IPC 通道前缀 `dweb:mcp:`
- 支持 stdio/socket 双桥接，可连接外部 MCP 服务器（如 Blender MCP）
- 内置 13 个工作流蓝图操作工具（get_blueprint_state、create_node、connect_nodes等）
- 内置工具通过 IPC 桥接在前端执行，可操作节点、连线、执行等
- 前端通过 `window.dweb.mcp.*` 调用

### 9.7 CLI 适配器
- 通过后端模块 `cli-adapters/` 实现，IPC 通道前缀 `dweb:cli:`
- 支持 Claude CLI、Codex CLI、Copilot CLI 等外部 CLI 工具
- 统一会话管理、流式消息、配置持久化
- 前端通过 `src/network/CLIChatService.ts` 调用

### 9.8 Blender 集成
- 通过后端模块 `blender/` 实现，IPC 通道前缀 `dweb:blender:`
- 通过 MCP 协议与 Blender 通信，支持模型导入、工具调用、工作区管理
- 工作区脚本与截图保存在项目临时目录
- 前端通过 `src/views/AIWorkflow/node-business/blender/` composable 调用

### 9.9 Tripo3D 集成
- 通过后端模块 `tripo3d/` 实现，IPC 通道前缀 `dweb:tripo3d:`
- 支持文生3D、图生3D、多视图生成、文生图、图生图等功能
- 任务存储在 LocalDB `tripo3d_tasks` 表
- 前端通过 `src/views/AIWorkflow/node-business/tripo3d/` composable 调用

### 9.10 Gemini 集成
- 通过后端模块 `gemini/` 实现，IPC 通道前缀 `dweb:gemini:`
- 支持 Gemini 图片生成任务管理
- 任务存储在 LocalDB `gemini_tasks` 表
- 前端通过 `src/views/AIWorkflow/node-business/gemini/` composable 调用

### 9.11 火山方舟（ARK）
- 通过后端模块 `ark/` 实现，IPC 通道前缀 `dweb:ark:`
- 任务面板集成，记录与管理方舟任务
- 任务存储在 LocalDB `ark_tasks` 表
- 前端通过 `src/views/AIWorkflow/node-business/ark/` composable 调用

### 9.12 Agent Skills
- 通过后端模块 `agent-skills/` 实现，IPC 通道前缀 `dweb:agent-skills:`
- 包含场景理解、场景布局、场景拆解、场景光照、Unreal 导出等功能
- Unreal 导出通过内置 HTTP 服务器与 Unreal 插件通信
- 前端通过 `src/network/SceneSkillService.ts` 调用

### 9.13 云模板中心
- 通过后端模块 `cloud-templates/` 实现，IPC 通道前缀 `dweb:cloud-templates:`
- 支持本地/Steam 多适配器架构
- 包含配额查询、模板列表、上传、下载、删除功能
- 前端通过 `src/aiworkflow/template/useCloudTemplatePersistence.ts` 调用

### 9.14 项目与资产管理
- 项目 CRUD：后端模块 `projects/`，IPC `dweb:projects:*`
- 项目资产元数据：后端模块 `project-assets/`，IPC `dweb:project-assets:*`
- 资产二进制操作（上传/导入/删除）：通过 `projectStaticAssets/service.mjs` 的 IPC 通道
- 资产读取：通过 `dweb://` 自定义协议直接从磁盘读取

## 10. 渲染与交互

- 画布：`src/ui/BluePrint/BlueprintCanvas.vue`
- 节点搜索菜单：`src/ui/UIComponent/DwebCanvasNodeSearchMenu.vue`
- 连线：`src/ui/WorkFlow/WorkflowEdgeLayer.vue`
- 节点基类：`src/ui/WorkFlow/WorkflowNodeBase.vue`
- 选中工具栏：`src/ui/WorkFlow/WorkflowSelectionToolbar.vue`
- 选择框覆盖层：`src/ui/WorkFlow/selection/SelectionFrameOverlay.vue`
- 标签编辑器：`src/ui/WorkFlow/selection/WorkflowTagEditor.vue`
- 检查器面板：`src/ui/WorkFlow/WorkflowInspectorPanel.vue`
- 项目工具栏：`src/ui/WorkFlow/BlueprintProjectToolbar.vue`
- 资源面板：`src/ui/WorkFlow/ResourceManagerPanel.vue`
- Meshy 任务面板：`src/ui/WorkFlow/MeshyTaskPanel.vue`
- Seedance/视频任务面板：`src/ui/WorkFlow/VideoTaskPanel.vue`
- 日志面板：`src/ui/WorkFlow/BlueprintLogPanel.vue`
- 锚点提示：`src/ui/WorkFlow/AnchorTooltip.vue`

## 11. 关键约定

- **数据流向（新架构）**：
  - 画布交互（拖拽/连线/缩放）→ 引擎API（setPosition等）→ 引擎内部更新 → emitChange → hydrateDraft到Vuex（单向只读投影）
  - 业务操作（添加节点/删除/粘贴/撤销重做）→ 引擎Command → 引擎内部更新 → emitChange → hydrateDraft到Vuex
  - Vuex仅作为引擎状态的只读投影供非画布组件（Inspector、面板等）读取，**禁止Vuex反向驱动引擎重建**
  - 远端状态由 IPC 后端通过流式通道或 LocalDB 变更回写到 Vuex（任务状态等非绘制状态）
- **节点 ID 与锚点 ID**：由 `src/core/project/package/ids.ts` 工厂生成，**禁止**在 UI 层手动拼接。
- **连线规则**：`comfyui_bridge` / `anchorKinds.ts` 决定哪些 mediaType 可以互连。
- **资源 URL 解析**：所有展示 / 上传的资源 URL 走 `src/network/backendConfig.ts` 的 `resolveBackendUrl()`，dweb:// 协议自动被 Electron 拦截。
- **蓝图快照**：保存项目时从引擎 `serialize()` 获取数据序列化，反序列化必须做版本兼容处理，加载通过引擎 `loadBlueprint()`。
- **平台感知**：工作流中的平台特有功能（如 Steam 分享）必须通过 `src/platformBridge/` 访问，使用 Mock 降级。
- **截图缓存**：节点缩略图优先使用 `node-screenshot/` 缓存，避免重复渲染。
- **IPC 优先**：所有后端调用使用 `src/network/ipcClient.ts`，不要直接发起 HTTP 请求到 localhost（迁移期兼容代码除外）。
- **禁止外部 API 调用**：前端不要直接调用外部 AI 厂商 API，必须通过后端 IPC 模块以保护 API Key。
- **蓝图绘制状态不走Vuex**：节点位置（worldX/worldY）、尺寸（width/height）、连线坐标等绘制状态的唯一权威来源是引擎内部，Vuex仅存只读投影。

## 12. 关键文件位置速查

| 关注点 | 路径 |
| --- | --- |
| 核心类型 | `src/aiworkflow/types.ts` |
| 节点目录 | `src/aiworkflow/nodeLibrary.ts` |
| 蓝图快照 | `src/aiworkflow/persistence/blueprintSnapshot.ts` |
| 页面主入口 | `src/views/AIWorkflow/AIWorkflowPage.vue` |
| 节点业务 | `src/views/AIWorkflow/node-business/` |
| 节点截图缓存 | `src/views/AIWorkflow/node-screenshot/` |
| 节点 UI 组件 | `src/ui/WorkFlow/WorlFlowNodes/` |
| 节点聊天对话框 | `src/ui/BluePrint/node-dialog/` |
| 画布 | `src/ui/BluePrint/BlueprintCanvas.vue` |
| 节点搜索菜单 | `src/ui/UIComponent/DwebCanvasNodeSearchMenu.vue` |
| IPC 客户端 | `src/network/ipcClient.ts` |
| ComfyUI 服务 | `src/network/ComfyUIBridgeService.ts` |
| AI 对话服务 | `src/network/AIChatService.ts` |
| Agent 聊天服务 | `src/network/AgentChatService.ts` |
| CLI 聊天服务 | `src/network/CLIChatService.ts` |
| Scene Skill 服务 | `src/network/SceneSkillService.ts` |
| Agent Runtime 后端模块 | `electron/backend/modules/agent/` |
| MCP 后端模块 | `electron/backend/modules/mcp/` |
| CLI 适配器后端模块 | `electron/backend/modules/cli-adapters/` |
| Blender 后端模块 | `electron/backend/modules/blender/` |
| Tripo3D 后端模块 | `electron/backend/modules/tripo3d/` |
| Gemini 后端模块 | `electron/backend/modules/gemini/` |
| Ark 后端模块 | `electron/backend/modules/ark/` |
| ComfyUI 后端模块 | `electron/backend/modules/comfyui/` |
| Meshy 后端模块 | `electron/backend/modules/meshy/` |
| Seedance 后端模块 | `electron/backend/modules/seedance/` |
| Chat 后端模块 | `electron/backend/modules/chat/` |
| Agent Skills 后端模块 | `electron/backend/modules/agent-skills/` |
| Third-Party 后端模块 | `electron/backend/modules/third-party/` |
| Cloud Templates 后端模块 | `electron/backend/modules/cloud-templates/` |
| 节点 Inspector 数据 composable | `src/views/AIWorkflow/node-business/` |
