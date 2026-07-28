# AI 工作流蓝图开发指引 (AI Workflow Guide)

> 🔴 **重要提示**：蓝图引擎架构的完整详解（双层架构、SSOT数据流、engineApi清单、8条架构铁律、快捷键划分、15条合规测试规则）请优先阅读 [AGENT_GUIDE.md](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-continue-graphics-blueprint-VGeGk0/AGENT_GUIDE.md) 的 **"AI 工作流蓝图引擎架构详解"** 章节及架构红线#23。本文档主要聚焦**业务节点开发流程**和后端IPC集成，不再重复架构基础。

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

## 8. 节点底部对话框（Node Chat Dialog）Agent 开发边界

> **重要**：节点底部对话框是AI工作流中**单节点级AI交互入口**，与全局Agent聊天（顶部Chat面板）有本质区别。不同节点类型的对话框职责、输出格式、后端接口完全不同，修改时必须严格遵守以下边界。

### 8.1 通用架构

节点底部对话框的通用代码位于 `src/ui/BluePrint/node-dialog/`：

| 文件 | 职责 |
|------|------|
| `NodeChatDialog.vue` | 对话框容器（定位、展开/折叠、动画） |
| `NodeChatInput.vue` | 输入框组件（消息输入、发送按钮、停止生成） |
| `NodeChatParamPanel.vue` | 参数面板（模型选择、分辨率、比例等参数配置） |
| `nodeChatConfig.ts` | 节点聊天类型定义、默认参数、选项常量、参数规范化 |
| `useNodeChatSync.ts` | 节点草稿/聊天状态同步（draft ↔ node.data ↔ Vuex） |
| `index.ts` | 统一导出 |

业务执行逻辑位于 `src/views/AIWorkflow/node-business/chat/useAIWorkflowNodeGeneration.ts`，根据节点类型（`nodeType`）分发到不同的任务函数。

**通用数据流**：
```
用户输入 → NodeChatInput → handleSubmit → useNodeChatSync
  → runNodeGenerationTask → 根据nodeType分发:
      ├─ text → runTextTask() → third-party:blueprintChatStream
      ├─ image → runImageTask() → gemini/seedream/meshy/tripo3d对应接口
      ├─ video → runVideoTask() → seedance接口
      ├─ model3d → runModel3DTask() → meshy/tripo3d接口
      └─ blender → useBlenderAgentChat() → blender MCP接口
```

---

### 8.2 文本节点 (text) — 提示词生成器

**核心定位**：文本节点是工作流中的**提示词中转站**，输出必须是纯提示词文本，可直接被下游图像/视频/3D节点读取使用，不能有对话式内容。

| 维度 | 规范 |
|------|------|
| **节点类型** | `text` |
| **后端模块** | `electron/backend/modules/third-party/` |
| **IPC通道** | 流式: `dweb:third-party:blueprint:chat:stream`；非流式: `dweb:third-party:blueprint:chat` |
| **支持模型** | `bytedance`(豆包/Seed系列，默认)、`gemini` |
| **默认模型版本** | `doubao-seed-evolving` / `gemini-3.5-flash` |
| **输出写入位置** | `node.data.draft[assistantIdx].content` → 节点文本预览 → 下游节点输入 |
| **前端执行函数** | `runTextTask()` in `useAIWorkflowNodeGeneration.ts` |
| **系统Prompt常量** | `BLUEPRINT_TEXT_SYSTEM_PROMPT` in `service.mjs` |

**🔴 输出格式强制规则**：
1. **纯提示词输出**：直接输出提示词文本，禁止任何解释、前言、后记
2. **禁止对话语气**：禁止"以下是..."、"希望对你有帮助"等助手式语言
3. **禁止Markdown装饰**：禁止代码块（```` ``` ````）、标题（`###`）、分割线（`---`）、emoji、列表符号
4. **禁止提及软件**：禁止提到DVStudio或任何软件名称
5. **禁止参数教程**：禁止给出参数建议、使用教程、调整方案
6. **语言一致**：用户输入中文输出中文，输入英文输出英文
7. **可直接使用**：输出内容就是最终提示词，用逗号分隔关键词标签，自然流畅

**可配置参数**（`nodeChatConfig.ts` → `getDefaultParamsForType('text')`）：
- `model`: `'bytedance' | 'gemini'` — 模型提供商
- `textModelVersion`: 豆包模型版本（默认 `'doubao-seed-evolving'`）
- `geminiTextModelVersion`: Gemini文本模型版本（默认 `'gemini-3.5-flash'`）
- `speed`: `'fast' | 'normal' | 'slow'`
- `thinking`: `'enabled' | 'disabled'`
- `responseFormat`: `'text' | 'json_object'`
- `maxTokens`: `2048 | 4096 | 8192 | 16384`（默认4096）

**禁止行为**：
- ❌ 复用全局Agent聊天的系统prompt（如"你是DVStudio蓝图助手"）
- ❌ 输出多段内容（中文+英文+负向提示词分块）
- ❌ 输出教程、参数建议、调整方案
- ❌ 前端直接调用外部LLM API，必须通过Electron IPC

---

### 8.3 图片节点 (image) — AI图像生成

**核心定位**：图片节点用于直接生成图像资产，输出是图片资源URL，输入支持文本提示词+参考图。

| 维度 | 规范 |
|------|------|
| **节点类型** | `image` |
| **后端模块** | `third-party/`（gemini/seedream）、`meshy/`、`tripo3d/` |
| **IPC通道** | 按模型走对应模块的generate通道（如 `dweb:gemini:generate:stream`、`dweb:third-party:seedream:generate:stream`等） |
| **支持模型** | `gemini`(NanoBanana，默认)、`seedream`、`meshy`、`tripo3d`(文生图) |
| **输出写入位置** | 生成的图片URL → 节点资源池 → `node.data.outputs` → 节点预览 |
| **前端执行函数** | `runImageTask()` in `useAIWorkflowNodeGeneration.ts` |

**各模型参数差异**（由`NodeChatParamPanel.vue`根据选中模型动态渲染）：
- **Gemini/NanoBanana**: 模型版本（3.1-flash/3.1-pro/3.1-flash-lite等）、尺寸（512px~4K）、宽高比（1:1/16:9/9:16等14种）、数量（1/2/4）、思考深度（快速/深度）、负向提示词
- **SeeDream**: 模型版本（v4.0/v4.5/v5.0/v5.0-lite）、尺寸（1K~4K）、宽高比、输出格式（png/jpeg）、数量、水印开关、随机种子、负向提示词
- **Meshy文生图**: AI模型（nano-banana/nano-banana-2/nano-banana-pro/gpt-image-2）、宽高比、姿势模式（无/A-pose/T-pose）、负向提示词、多视图开关、随机种子、输出数量
- **Tripo3D文生图**: 模型（seedream_v4/seedream_v5/banana/banana_pro/banana2/chat_image系列）、尺寸、宽高比、输出格式、水印、模板（asset_extraction/character_completion/t_pose等）、数量、负向提示词、参考强度、随机种子

**参考图收集规则**：
- 通过`collectReferenceImages()`函数收集节点上游连接的图片节点输出
- 支持多张参考图，按连接顺序传入
- 图片节点本身也可以有图片输入边（图生图模式）

**任务状态追踪**：
- 任务执行过程中实时更新`node.data.taskStatus`（pending/processing/completed/failed）
- 完成后将生成的图片资源写入节点输出端口
- 失败时显示错误消息并保留在对话框历史中

---

### 8.4 视频节点 (video) — AI视频生成

**核心定位**：视频节点用于生成视频资产，输出是视频文件URL，支持文生视频、图生视频、首尾帧等模式。

| 维度 | 规范 |
|------|------|
| **节点类型** | `video` |
| **后端模块** | `electron/backend/modules/seedance/` |
| **IPC通道** | `dweb:seedance:generate:stream` |
| **支持模型** | `seedance`（字节Seedance系列） |
| **默认模型版本** | `doubao-seedance-2-0-260128` |
| **输出写入位置** | 生成的视频URL → 节点资源池 → `node.data.outputs` → 视频节点预览 |
| **前端执行函数** | `runVideoTask()` in `useAIWorkflowNodeGeneration.ts` |
| **任务存储** | LocalDB `video_tasks` 表 |

**可配置参数**：
- `modelVersion`: Seedance模型版本（2.0/2.0 Fast/2.0 Mini/1.5 Pro/1.0 Pro等）
- `mode`: `auto | text_to_video | image_to_video | first-last | reference | video_edit`
- `resolution`: `480p | 720p | 1080p | 4k`
- `ratio`: `adaptive | 16:9 | 9:16 | 1:1 | 4:3 | 3:4`
- `duration`: 视频时长（-1自动/4/5/6/8/10/12/15秒）
- `seed`: 随机种子（-1为随机）
- `generateAudio`: 是否生成音频
- `watermark`: 是否加水印
- `cameraFixed`: 是否固定镜头
- `returnLastFrame`: 是否返回最后一帧
- `enableWebSearch`: 是否启用联网搜索
- `priority`: 任务优先级

**参考输入**：
- 图生视频模式：收集上游图片节点输出作为首帧
- 首尾帧模式：收集两张参考图作为起始帧和结束帧
- 视频编辑模式：收集上游视频节点输出作为编辑源

---

### 8.5 3D模型节点 (model3d) — AI 3D资产生成

**核心定位**：3D模型节点用于生成3D模型资产（GLB/FBX/OBJ等格式），支持文生3D、图生3D、多视图生成、纹理烘焙、网格处理等多种任务模式。

| 维度 | 规范 |
|------|------|
| **节点类型** | `model3d` |
| **后端模块** | `electron/backend/modules/meshy/`、`electron/backend/modules/tripo3d/` |
| **IPC通道** | 按provider走对应模块通道（`dweb:meshy:*` / `dweb:tripo3d:*`） |
| **支持Provider** | `meshy`（默认）、`tripo3d` |
| **输出写入位置** | 生成的3D模型URL → 节点资源池 → `node.data.outputs` → Three.js预览 |
| **前端执行函数** | `runModel3DTask()`（分发到meshy/tripo3d对应composable） |
| **任务存储** | LocalDB `meshy_tasks` / `tripo3d_tasks` 表 |

**Meshy支持的任务模式**：
- `text-to-3d`: 文生3D
- `image-to-3d`: 单图生3D
- `multi-image-to-3d`: 多图生3D
- `remesh`: 重拓扑
- `retexture`: 重纹理
- `uv-unwrap`: UV展开

**Tripo3D支持的任务模式**：
- `text_to_model`: 文生3D
- `image_to_model`: 单图/多图生3D
- `multiview_to_model`: 多视图生3D
- `texture`: 纹理烘焙
- `refine`: 模型精炼
- `mesh_segment`: 网格分割
- `mesh_smartsegment`: 智能分割
- `mesh_complete`: 网格补全
- `mesh_decimate`: 网格减面
- `models_convert`: 格式转换

**关键参数（因provider和模式差异较大，由参数面板动态渲染）**：
- 通用：provider、taskMode、输出格式（glb/fbx/obj/stl/usdz/3mf）
- Meshy专属：AI模型（latest/meshy-6/meshy-5）、模型类型（standard/lowpoly）、拓扑（triangle/quad）、目标面数、对称模式、原点位置、姿势模式、PBR、高清纹理、面数限制
- Tripo3D专属：模型系列（H系列/P系列）、模型版本、面数限制（移动端/网页/游戏/影视级别）、纹理质量、几何质量、纹理对齐方式、朝向、自动尺寸、压缩、导出UV、智能低模、部件生成、分割类型、粒度、减面模型版本、转换格式/面数/纹理尺寸等

**参数规范化**：
- 所有参数必须经过 `normalizeTripo3DParams()` 规范化处理
- 根据模型版本和任务模式自动禁用不兼容的参数
- P系列模型禁用高级参数（quad/smartLowPoly/generateParts等）

**参考图收集**：
- 图生3D/多视图生3D模式：收集上游图片节点输出
- 纹理烘焙模式：收集目标模型+参考纹理图
- 多视图模式：收集前/左/后/右视图图片

---

### 8.6 Blender节点 (blender) — Blender MCP Agent 控制

**核心定位**：Blender节点通过MCP协议与Blender软件通信，由Agent直接操控Blender执行建模、材质、动画、渲染等操作。这是唯一需要外部软件（Blender）配合的节点类型。

| 维度 | 规范 |
|------|------|
| **节点类型** | `blender` |
| **后端模块** | `electron/backend/modules/blender/` |
| **IPC通道** | `dweb:blender:*`（MCP协议通信） |
| **支持Agent后端** | `dvsagent`(默认)、`codex`、`copilot` |
| **默认模型** | `bytedance` / `doubao-seed-evolving` |
| **输出** | Blender操作结果、3D场景修改、可导出资产 |
| **前端业务文件** | `src/views/AIWorkflow/node-business/blender/useBlenderAgentChat.ts` |
| **前置依赖** | 需要Blender已启动并通过MCP连接 |

**可配置参数**：
- `agentBackend`: Agent后端选择（dvsagent/codex/copilot）
- `model`: 模型提供商（默认bytedance）
- `modelId`/`textModelVersion`: 模型版本
- `thinkingEffort`: 思考深度（disabled/low/medium/high）

**特殊机制**：
- **MCP工具调用**：Agent可调用Blender MCP工具执行具体操作（创建物体、修改材质、设置动画等）
- **工作区管理**：Blender工作区脚本/截图存储在项目临时目录，由`workspace.mjs`管理
- **上游输入处理**：通过`useBlenderUpstreamInputs.ts`收集上游节点（图片/模型/文本）的输出作为Blender上下文
- **连接状态监听**：实时监听Blender MCP连接状态，未连接时提示用户启动Blender
- **事件通知**：Blender连接/断开/操作结果通过事件总线通知前端

**禁止行为**：
- ❌ 前端直接启动Blender进程，必须通过后端IPC
- ❌ 前端直接与Blender MCP服务器通信，必须通过后端blender模块桥接
- ❌ 绕过MCP协议直接调用Blender Python API

---

### 8.7 节点聊天对话框开发规范

#### 🔴 系统Prompt边界
| 节点类型 | 系统Prompt用途 | 是否允许对话式输出 |
|---------|---------------|------------------|
| text | 提示词优化器 | ❌ 禁止，必须纯提示词 |
| image | 图像生成提示词理解 | ✅ 允许简短状态反馈 |
| video | 视频生成提示词理解 | ✅ 允许简短状态反馈 |
| model3d | 3D生成需求理解 | ✅ 允许简短状态反馈 |
| blender | Blender操作Agent | ✅ 允许工具调用过程反馈 |

**注意**：只有`text`节点强制纯提示词输出，其他生成类节点允许输出简短的状态说明（如"正在生成..."、"已完成"），但主要输出是生成的资产而非文本。

#### 🔴 参数面板规范
1. **参数面板组件**：统一使用`NodeChatParamPanel.vue`，通过`nodeType`动态渲染对应参数控件
2. **默认参数**：所有参数默认值必须在`nodeChatConfig.ts`的`getDefaultParamsForType()`中定义
3. **参数规范化**：新增参数必须有对应的规范化逻辑（参考`normalizeTripo3DParams()`模式）
4. **模型选项集中管理**：模型/版本/分辨率/比例等选项常量统一定义在`nodeChatConfig.ts`，不要在组件内硬编码

#### 🔴 后端调用规范
1. **禁止前端直连**：所有外部AI API调用必须通过Electron后端IPC，禁止前端直接`fetch`外部接口
2. **通道命名**：遵循`dweb:<module>:<action>:stream`格式，流式接口必须标记`stream: true`
3. **preload绑定**：`createIpcStreamGenerator()`会自动给baseChannel追加`:stream`后缀，绑定时传入的baseChannel不要包含`:stream`（见[07_DEVELOPMENT_BOUNDARIES.md#4-electron-桥接-ipc-边界](07_DEVELOPMENT_BOUNDARIES.md)）
4. **API Key管理**：所有API Key存储在LocalDB `api_keys`表（自动加密），禁止硬编码
5. **任务持久化**：长时间运行的生成任务（图像/视频/3D）必须将任务状态存储到对应LocalDB表

#### 🔴 状态同步规范
1. **草稿状态**：节点聊天草稿保存在`node.data.draft`数组，与`useNodeChatSync.ts`同步
2. **任务状态**：生成过程中更新`node.data.taskStatus`和`node.data.taskProgress`
3. **输出写入**：生成结果（图片/视频/3D模型URL）必须写入节点对应输出锚点的资源池
4. **历史保留**：聊天历史保存在节点data中，随项目一起保存/加载

#### 🔴 参考图收集规范
- 使用`collectReferenceImages()`统一收集上游节点输出
- 根据节点类型和生成模式决定收集哪些类型的上游资源
- 参考图数量限制由各后端API决定，前端不做硬截断（由参数面板配置）

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

> ⚠️ 以下旧UI路径已迁移到引擎层，以新引擎路径为准。

- **画布主入口（新）**：`src/engine/blueprint/BlueprintEditor.vue`（Vue组件封装，暴露engineApi）
- **蓝图场景（新）**：`src/engine/blueprint/BlueprintScene.ts`（节点/连线/Command管理）
- **交互工具（新）**：`src/engine/blueprint/BlueprintEditorTool.ts`（拖拽/连线/框选/右键菜单）
- **DOM覆盖层（新）**：`src/engine/blueprint/dom/BlueprintDomOverlay.vue`（节点Vue组件渲染）
- **节点搜索菜单**：`src/ui/UIComponent/DwebCanvasNodeSearchMenu.vue`
- **连线（已迁移到引擎）**：`src/engine/blueprint/Connection.ts`（Canvas渲染由引擎负责）
- **节点基类（新）**：`src/engine/blueprint/dom/DomNodeWrapper.vue` + `src/engine/blueprint/dom/WorkflowNodeWrapper.vue`
- **业务节点Vue组件**：`src/views/AIWorkflow/node-components/`（图片/视频/3D/文本/AI对话等）
- **检查器面板**：`src/views/AIWorkflow/side-panel/WorkflowInspectorPanel.vue`
- **项目工具栏**：`src/views/AIWorkflow/BlueprintProjectToolbar.vue`
- **资源面板**：`src/views/AIWorkflow/ResourceManagerPanel.vue`
- **Meshy 任务面板**：`src/views/AIWorkflow/MeshyTaskPanel.vue`
- **Seedance/视频任务面板**：`src/views/AIWorkflow/VideoTaskPanel.vue`
- **日志面板**：`src/views/AIWorkflow/BlueprintLogPanel.vue`
- **锚点提示**：`src/views/AIWorkflow/AnchorTooltip.vue`

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
| 节点 UI 组件（业务节点） | `src/views/AIWorkflow/node-components/` |
| 蓝图引擎主组件（新） | `src/engine/blueprint/BlueprintEditor.vue` |
| 蓝图场景（新） | `src/engine/blueprint/BlueprintScene.ts` |
| 蓝图交互工具（新） | `src/engine/blueprint/BlueprintEditorTool.ts` |
| DOM覆盖层（新） | `src/engine/blueprint/dom/BlueprintDomOverlay.vue` |
| 业务Command集合（新） | `src/engine/blueprint/commands/` |
| 图形底座（新） | `src/engine/graphbase/` |
| 状态适配器（新） | `src/views/AIWorkflow/blueprint-bridge/workflowStateAdapter.ts` |
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
