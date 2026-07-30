# 14 - AI工作流蓝图节点开发三层链路架构指南

> 🆕 本文档总结场景分解/场景布局节点开发过程中确立的**三层新架构**规范，为后续AI工作流节点开发提供统一的开发边界与避坑指引。阅读本文档可快速理解节点事件链路的正确开发模式，避免重复踩坑。

---

## 一、三层架构总览

AI工作流蓝图节点开发采用**严格分离的三层架构**，任何节点功能开发必须遵循各层职责边界，禁止跨层直接操作。

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: UI组件层 (UI Component Layer)                        │
│  ─────────────────────────────────────────────────────────────  │
│  文件位置: src/ui/WorkFlow/WorlFlowNodes/*.vue                 │
│  职责: DOM渲染、用户交互事件、Three.js预览渲染、高度自适应        │
│  禁止: 直接调用engineApi、直接修改Vuex state、直接操作BlueprintNode│
└─────────────────────────────────────────────────────────────────┘
                              ↓ 事件emit / props
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: 业务逻辑层 (Business Logic Layer)                    │
│  ─────────────────────────────────────────────────────────────  │
│  文件位置: src/views/AIWorkflow/node-business/<domain>/*.ts    │
│  职责: 节点控制器(Controller)、数据同步工具、自动布线逻辑、      │
│        图像源追溯、bbox解析裁剪、业务状态机、重试机制            │
│  禁止: 直接操作DOM、直接访问BlueprintNode内部对象、绕过engineApi │
└─────────────────────────────────────────────────────────────────┘
                              ↓ commit / engineApi
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: 引擎核心层 (Engine Core Layer)                       │
│  ─────────────────────────────────────────────────────────────  │
│  文件位置: src/engine/blueprint/ + src/store/aiworkflow/        │
│  职责: Vuex Store状态管理、BlueprintScene序列化/反序列化、       │
│        节点创建/删除/连线Command、hydrateDraft单向同步、        │
│        数据持久化与防御逻辑                                      │
│  禁止: 处理业务逻辑（如AI调用、bbox解析、资源裁剪）              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、各层详细职责与文件索引

### Layer 1: UI组件层

**位置**：`src/ui/WorkFlow/WorlFlowNodes/Workflow*Node.vue`

**核心职责**：
1. **DOM渲染**：节点面板UI、参数表单、状态展示、按钮交互
2. **事件转发**：将用户操作（按钮点击、参数变化）通过emit向上传递
3. **预览渲染**：Three.js 3D预览（仅场景布局节点）、图片预览、JSON展示
4. **高度自适应**：监听内容变化，通过`auto-resize`事件请求父组件调整节点尺寸

**关键Props约定**：
```typescript
interface NodeComponentProps {
  nodeId: string                    // 节点ID（来自引擎）
  node: WorkflowNode                // 节点完整数据（来自Vuex投影）
  selected: boolean                 // 是否选中
  autoHeight?: boolean              // 是否启用自动高度
  sizeCustomized?: boolean          // 用户是否手动调整过尺寸
}
```

**关键Emit约定**：
```typescript
emit('auto-resize', height: number)  // 请求调整节点高度
emit('run', payload)                 // 请求执行节点任务
emit('param-change', patch)          // 参数变更（通过业务层处理）
```

**典型实现模式**（以场景布局节点为例）：
```vue
<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import WorkflowNodeBase from './WorkflowNodeBase.vue'

const props = defineProps<{/* ... */}>()
const emit = defineEmits<{/* ... */}>()

const baseRef = ref<InstanceType<typeof WorkflowNodeBase> | null>(null)
const sizeCustomized = ref(false)

// 高度自适应：监听内容变化触发resize
const requestResize = () => {
  nextTick(() => {
    baseRef.value?.requestAutoResize()
    setTimeout(() => baseRef.value?.requestAutoResize(), 50)  // 二次确认
  })
}

// 监听所有可能影响高度的状态
watch(
  [() => props.node?.status, () => props.node?.previewMode, /* ... */],
  requestResize,
  { flush: 'post' }
)

// 用户操作通过emit转发，不直接处理业务
const handleRunSceneLayout = () => {
  emit('run-scene-layout', { nodeId: props.nodeId })
}
</script>

<template>
  <WorkflowNodeBase
    ref="baseRef"
    :autoHeight="autoHeight"
    :sizeCustomized="sizeCustomized"
    @auto-resize="(h) => emit('auto-resize', h)"
  >
    <!-- 节点UI内容 -->
  </WorkflowNodeBase>
</template>
```

**🔴 UI层禁止事项**：
- ❌ 直接调用`window.dweb.*` IPC接口（必须通过业务层）
- ❌ 直接`store.commit()`修改Vuex状态（必须通过业务层或engineApi）
- ❌ 直接访问`editorRef.value.getNode()`操作BlueprintNode（必须通过engineApi）
- ❌ 在组件内执行AI调用、资源裁剪、bbox解析等业务逻辑
- ❌ 硬编码节点位置/尺寸计算（自动布线由业务层处理）

---

### Layer 2: 业务逻辑层

**位置**：`src/views/AIWorkflow/node-business/<domain>/use*.ts`

**核心职责**：
1. **Controller（控制器）**：处理节点业务流程（AI调用、状态流转、数据转换）
2. **Sync（同步工具）**：Store↔Engine双向数据同步、锚点同步
3. **AutoExpand（自动布线）**：节点创建、连线、位置计算、批量更新
4. **Shared（共享工具）**：bbox解析、图像源追溯、格式归一化
5. **MediaInputs（媒体输入）**：穿透多层节点递归追溯图像源/JSON源

**文件命名规范**：
- `useAIWorkflow<NodeType>Controller.ts` - 节点主控制器
- `useAIWorkflow<NodeType>Sync.ts` - 数据同步工具
- `useAIWorkflow<NodeType>AutoExpand.ts` - 自动布线/自动展开逻辑
- `<domain>Shared.ts` - 领域共享工具函数
- `useAIWorkflow<Domain>MediaPreviewSources.ts` - 媒体源追溯

**Controller典型实现模式**：
```typescript
// useAIWorkflowSceneLayoutController.ts
export function makeSceneLayoutController(options: {
  store: Store<AIWorkflowState>
  engineApi: SceneLayoutEngineApiLike
  pushToast: (msg: string, type?: string) => void
  hasEngine: boolean
}) {
  // 导入同步工具
  const { syncSceneLayoutNodeToEngine } = makeSyncSceneLayoutNodeToEngine({
    store: options.store,
    engineApi: options.engineApi,
    hasEngine: options.hasEngine
  })

  // 业务入口：由UI层emit触发
  async function onNodeRunSceneLayout(nodeId: string) {
    const node = options.store.state.nodesById[nodeId]
    if (!node) return

    // 1. 状态更新为running
    options.store.commit('setNodeSceneLayoutSettings', {
      nodeId,
      settings: { status: 'running', ... }
    })

    // 2. 获取输入JSON（支持cachedJson fallback）
    const inputJson = getInputJsonWithFallback(node)

    // 3. 执行业务逻辑（Direct路径或API路径）
    let layoutItems
    if (hasValid3DData(inputJson)) {
      layoutItems = normalizeLayoutItemsForPreview(inputJson.objects)
    } else {
      layoutItems = await callSceneLayoutAPI(inputJson)
    }

    // 4. Store commit更新状态
    options.store.commit('setNodeSceneLayoutSettings', {
      nodeId,
      settings: {
        status: 'completed',
        previewMode: true,
        layoutItems,
        inputJson: JSON.stringify(inputJson),
        lastRunAt: Date.now()
      }
    })

    // 5. ⚠️ 关键：Store→Engine同步（防止保存后数据重置）
    await syncSceneLayoutNodeToEngine(nodeId)

    options.pushToast('场景布局生成成功', 'success')
  }

  return { onNodeRunSceneLayout, syncSceneLayoutNodeToEngine }
}
```

**🔴 业务层关键规则**：

1. **节点创建必须Engine优先**：
```typescript
// ✅ 正确：先在引擎创建，再forceSync到Store
options.engineApi.beginBulkUpdate()
try {
  for (const item of items) {
    const nodeId = options.engineApi.addNode(type, x, y, title, {
      ...initialData,
      createdAt: Date.now()  // 3秒内新节点受hydrateDraft保护
    })
    // 资源绑定需双写
    if (resourceId) {
      options.store.commit('setNodeResource', { nodeId, resourceId })
      options.engineApi.updateNodeData(nodeId, { resourceId }, { silent: true })
    }
  }
} finally {
  options.engineApi.endBulkUpdate()
}
await options.engineApi.forceSyncToStore()
```

2. **Store→Engine同步不可少**：
   - 任何修改`sceneLayoutSettings`等扩展字段的commit后，必须调用`syncSceneLayoutNodeToEngine(nodeId)`
   - 等待30ms让Vuex响应式更新完成，再取store中最新数据推送到引擎
   - 同步后执行`forceSyncToStore()`确保双向一致

3. **重试机制处理异步锚点同步**：
```typescript
// 场景布局预览模式：锚点同步是异步的，需要重试连接模型节点
async function connectModelsWithRetry(sceneLayoutNodeId: string, modelNodeIds: string[]) {
  const maxRetries = 8
  for (let retry = 0; retry < maxRetries; retry++) {
    await options.engineApi.forceSyncToStore()
    const node = options.store.state.nodesById[sceneLayoutNodeId]
    if (node?.inputs?.length >= modelNodeIds.length) {
      // 锚点已就绪，执行连线
      for (let i = 0; i < modelNodeIds.length; i++) {
        options.engineApi.connectPorts(
          modelNodeIds[i], 'out',
          sceneLayoutNodeId, `model-${i}`
        )
      }
      return true
    }
    await new Promise(r => setTimeout(r, 200 + retry * 50))  // 递增延迟
  }
  return false
}
```

4. **图像源递归追溯**（穿透多层场景节点）：
```typescript
// 支持穿透scene-decompose → scene-layout → scene-understanding链路
function traceImageSource(nodeId: string, depth = 0): string | null {
  if (depth > 10) return null  // 深度限制防循环
  const node = store.state.nodesById[nodeId]
  if (!node) return null

  // 图片节点直接返回resourceId
  if (node.type === 'image' && node.resourceId) {
    return getResourceUrl(node.resourceId)
  }

  // 场景节点递归追溯JSON输入锚点
  if (['scene-decompose', 'scene-layout', 'scene-understanding'].includes(node.type)) {
    const jsonAnchor = node.inputs?.find(a => a.id === 'in-json')
    if (jsonAnchor?.connectedNodeId) {
      return traceImageSource(jsonAnchor.connectedNodeId, depth + 1)
    }
  }
  return null
}
```

5. **bbox格式兼容解析**：
   - 支持数组格式`[x1,y1,x2,y2]` / `[x,y,w,h]`
   - 支持对象格式`{x,y,w,h}` / `{x1,y1,x2,y2}`
   - 兼容字段名：bbox、bbox_2d、boundingBox、box2d、box、rect、bounds、imageRect、imageRectPixels
   - 自动检测UV归一化坐标(0~1) vs 像素坐标

---

### Layer 3: 引擎核心层

**位置**：
- Vuex Store：`src/store/aiworkflow/store.ts` + mutations
- Blueprint引擎：`src/engine/blueprint/BlueprintScene.ts`、`BlueprintNode.ts`
- 类型定义：`src/aiworkflow/types.ts`

**核心职责**：
1. **SSOT状态管理**：引擎内部是蓝图绘制状态唯一权威数据源
2. **单向数据流**：Engine → Store via `hydrateDraft`（禁止反向全量同步覆盖）
3. **序列化/反序列化**：`BlueprintScene.serialize()`生成快照、`legacyBlueprintToWorkflowState`转换
4. **数据归一化**：`normalize*`函数确保字段类型正确、默认值填充
5. **防御逻辑**：hydrateDraft中保护新节点和关键业务数据不被旧数据覆盖

**关键防御逻辑（hydrateDraft中scene-layout保护）**：
```typescript
// 在store.ts的hydrateDraft mutation中
if (nextNodesById[nodeId].type === 'scene-layout') {
  const prevSceneSettings = (prevNode as any)?.sceneLayoutSettings
  const incomingSceneSettings = nextNodesById[nodeId].sceneLayoutSettings as any

  const countValidItems = (items: unknown): number =>
    Array.isArray(items) ? items.filter((i: any) => String(i?.id ?? '').trim()).length : 0

  const prevItemsLen = countValidItems(prevSceneSettings?.layoutItems)
  const incomingItemsLen = countValidItems(incomingSceneSettings?.layoutItems)

  // ⚠️ 关键防御：如果Store中已有更完整的layoutItems，保留Store数据
  if (prevItemsLen > incomingItemsLen) {
    nextNodesById[nodeId].sceneLayoutSettings = normalizeSceneLayoutSettings({
      ...(incomingSceneSettings ?? {}),
      ...(prevSceneSettings ?? {}),
      layoutItems: prevSceneSettings.layoutItems,  // 保留已有布局
      previewMode: prevSceneSettings?.previewMode === true ? true : incomingSceneSettings?.previewMode,
      status: prevSceneSettings?.status === 'completed' ? 'completed' : incomingSceneSettings?.status,
      inputJson: String(prevSceneSettings?.inputJson ?? '').length >= String(incomingSceneSettings?.inputJson ?? '').length
        ? prevSceneSettings?.inputJson : incomingSceneSettings?.inputJson,
      camera: prevSceneSettings?.camera ?? incomingSceneSettings?.camera,
      lastRunAt: Math.max(Number(prevSceneSettings?.lastRunAt) || 0, Number(incomingSceneSettings?.lastRunAt) || 0) || undefined
    })
    console.log('[DraftFlow#hydrateDraft] PROTECT(scene-layout): keeping Store layoutItems',
      { nodeId, prevItemsLen, incomingItemsLen })
  }
  syncSceneLayoutAnchors(nextNodesById[nodeId])  // 同步动态锚点
}
```

**新节点保护机制**：
```typescript
// hydrateDraft中保护3秒内新创建的节点
const isNewNode = (node: any): boolean => {
  const createdAt = Number(node?.createdAt) || 0
  return createdAt > 0 && Date.now() - createdAt < 3000
}
// 如果是新节点且incoming中不存在（还没同步到引擎序列化），保留Store中的新节点
```

**🔴 引擎层禁止事项**：
- ❌ 在BlueprintNode/BlueprintScene中调用AI API或处理业务逻辑
- ❌ 在mutation中执行异步操作（必须是同步的）
- ❌ 绕过Command直接修改节点位置/尺寸（用户交互必须走Command支持undo）
- ❌ 在hydrateDraft中盲目用incoming数据覆盖所有字段（必须有防御逻辑）

---

## 三、数据流向标准流程

### 场景1：用户点击节点按钮执行任务

```
[UI层] 用户点击"生成布局"按钮
    ↓ emit('run-scene-layout', { nodeId })
[业务层] onNodeRunSceneLayout(nodeId)
    ├─ store.commit('setNodeSceneLayoutSettings', { status: 'running' })
    ├─ 获取输入JSON（含递归追溯+cachedJson fallback）
    ├─ 执行业务逻辑（AI调用/数据转换）
    ├─ store.commit('setNodeSceneLayoutSettings', {
    │     status: 'completed', previewMode: true, layoutItems: [...]
    │   })
    └─ await syncSceneLayoutNodeToEngine(nodeId)  // ⚠️ Store→Engine同步
[引擎层] BlueprintNode.data更新 → serialize()包含最新layoutItems
    ↓ emitChange（防抖0ms）
[Host层] onBlueprintEditorChange → hydrateDraft（有防御逻辑保留新数据）
    ↓
[UI层] Vuex props更新 → 组件重渲染 → Three.js预览启动 → requestResize()
```

### 场景2：场景分解自动布线（批量创建节点）

```
[业务层] onNodeRunSceneDecompose完成，解析出objects数组
    ↓
[业务层] engineApi.beginBulkUpdate()  // 批量更新包裹，避免中间状态
    ├─ 计算布局位置（最后一列右边缘+间距）
    ├─ 循环创建图片节点：
    │   ├─ 离屏Canvas裁剪图片（bbox解析+坐标转换）
    │   ├─ engineApi.addNode('image', x, y, title, {
    │   │     resourceId: croppedResourceId,
    │   │     createdAt: Date.now()  // 新节点保护
    │   │   })
    │   └─ store.commit('setNodeResource', { nodeId, resourceId })  // 双写绑定
    ├─ 创建文本节点：
    │   └─ engineApi.addNode('text', x, y, title, { textValue: prompt })
    ├─ 创建场景布局预览节点：
    │   ├─ engineApi.addNode('scene-layout', x, y, '场景布局', {
    │   │     previewMode: true,
    │   │     status: 'completed',
    │   │     layoutItems: previewItems,
    │   │     inputJson: JSON.stringify(actionableOutputs)
    │   │   })
    │   └─ syncSceneLayoutNodeToEngine(sceneLayoutNodeId)
    └─ engineApi.endBulkUpdate()
    ↓
[业务层] await engineApi.forceSyncToStore()  // 全量同步到Store
    ↓
[业务层] 重试连接模型节点到场景布局动态锚点（最多8次，递增延迟）
    ↓
[业务层] store.commit('setSelectedNode', sceneLayoutNodeId)  // 自动选中
    ↓
[UI层] 各节点组件挂载 → requestResize() → 高度自适应
[UI层] 场景布局节点检测previewMode=true && status=completed → 自动启动Three.js预览
```

### 场景3：Ctrl+S保存后数据持久化

```
[Host层] 用户按Ctrl+S
    ↓
[业务层] saveBlueprint()
    ├─ engineApi.saveBlueprint() → BlueprintScene.serialize()
    │  └─ 序列化所有BlueprintNode.data（包含已同步的sceneLayoutSettings）
    └─ 保存到LocalDB/磁盘
    ↓
[关键] 保存过程中不触发重置，因为：
    1. 业务层已通过syncSceneLayoutNodeToEngine将Store数据推送到Engine
    2. BlueprintNode.data包含最新layoutItems，serialize()取到正确值
    3. hydrateDraft防御逻辑检测到Store中layoutItems更完整时保留
    4. 新节点有createdAt保护，3秒内不会被清理
```

---

## 四、关键坑点与避坑指南

### 🕳️ 坑1：Store更新后未同步到Engine → Ctrl+S后布局重置

**现象**：生成3D布局后一切正常，按Ctrl+S保存，立方体变回默认并排排列。

**根因**：
1. 业务层只更新了Vuex Store，没有调用`engineApi.updateNodeData()`推送到BlueprintNode.data
2. Ctrl+S时Engine序列化的是旧数据
3. 保存后hydrateDraft用旧数据覆盖Store，新布局丢失

**修复**：所有修改节点扩展字段（如sceneLayoutSettings）的commit后，必须调用`syncSceneLayoutNodeToEngine(nodeId)`。

**调试日志关键字**：`[SCENE-LAYOUT-SYNC]`

---

### 🕳️ 坑2：节点在Vuex先创建后同步Engine → hydrateDraft清理新节点

**现象**：自动布线创建的节点，选中再取消选中后节点消失。

**根因**：
1. 先在Vuex中`addNode`创建节点，再调用engineApi.addNode
2. forceSyncToStore时，Engine中还没有该节点，hydrateDraft认为节点已被删除
3. 没有createdAt时间戳，新节点不受保护

**修复**：
- 必须Engine优先：`engineApi.addNode()` → `forceSyncToStore()`
- 批量操作使用`beginBulkUpdate/endBulkUpdate`包裹
- 所有新节点必须设置`createdAt: Date.now()`

**调试日志关键字**：`[DraftFlow#hydrateDraft]`、`PROTECT`

---

### 🕳️ 坑3：动态锚点同步是异步的 → 连线失败

**现象**：场景布局节点创建后，左侧输入锚点数量不对，模型节点连不上。

**根因**：
1. `setNodeSceneLayoutSettings` mutation内部调用`syncSceneLayoutAnchors`是同步的
2. 但Vuex响应式更新到Engine节点data需要时间
3. 立即调用`connectPorts`时锚点还不存在

**修复**：
- 使用重试机制（最多8次，递增延迟200ms→250ms+50ms*retry）
- 每次重试前调用`forceSyncToStore()`确保锚点已同步
- 检查`node.inputs.length`是否符合预期再连线

---

### 🕳️ 坑4：bbox格式不兼容 → 裁剪失败使用整图

**现象**：场景分解后每个对象的截图都是原图，没有裁剪。

**根因**：
1. AI返回的bbox格式多样（数组/对象、多种字段名、UV/像素坐标）
2. 旧代码只识别`imageRect`对象格式，其他格式全部fallback到整图复制

**修复**：
- 使用`coerceRectLikeToObject()`统一数组/对象格式
- 支持所有常见bbox字段名（bbox、bbox_2d、box、rect等）
- 自动检测坐标范围：值≤1视为UV归一化，否则视为像素坐标
- 添加详细裁剪日志：`[SCENE-DECOMPOSE CROP]`、`[IMAGE-CROP]`

---

### 🕳️ 坑5：图像源无法穿透多层场景节点 → 分解按钮置灰

**现象**：场景布局节点连接上游后，场景分解节点的"分解"按钮无法点击。

**根因**：图像追溯逻辑只穿透一层，无法处理`scene-decompose → scene-layout → scene-understanding`多层链路。

**修复**：实现递归追溯函数`traceImageSource`，深度限制≤10层防循环引用。

---

### 🕳️ 坑6：节点默认宽高不足 → DOM面板溢出

**现象**：新添加的场景理解/场景布局节点，内部面板内容超出节点边界。

**根因**：types.ts中默认宽高设置过小（480×400/480×450），且未启用自动高度。

**修复**：
- 在`src/engine/blueprint/types.ts`中调整默认尺寸：
  - `scene-understanding`: 520×680
  - `scene-layout`: 520×720
- 节点组件实现`autoHeight`+`requestResize()`机制
- 自动布线中`nodeFootprint`与默认尺寸保持一致

---

### 🕳️ 坑7：资源绑定只写Store不写Engine → 图片不显示

**现象**：自动布线创建的图片节点，缩略图区域空白。

**根因**：只调用了`store.commit('setNodeResource')`，没有通过`engineApi.updateNodeData`同步resourceId到BlueprintNode.data。

**修复**：双写绑定：
```typescript
options.store.commit('setNodeResource', { nodeId, resourceId })
options.engineApi.updateNodeData(nodeId, { resourceId }, { silent: true })
```

---

## 五、节点开发标准流程Checklist

新增节点类型时，请按以下顺序执行：

### 1. 引擎层准备
- [ ] 在`src/aiworkflow/types.ts`中添加节点类型定义、Settings类型、默认数据
- [ ] 在`src/engine/blueprint/types.ts`中设置默认宽高
- [ ] 在`getDefaultNodeData()`中定义inputs/outputs端口
- [ ] 在NodeComponentResolver中注册Vue组件映射

### 2. UI组件开发
- [ ] 创建`Workflow*Node.vue`，继承WorkflowNodeBase
- [ ] 实现props（nodeId, node, selected, autoHeight, sizeCustomized）
- [ ] 实现emit（auto-resize, run, 业务事件）
- [ ] 添加baseRef和requestResize()高度自适应逻辑
- [ ] 监听所有影响高度的状态，watch中调用requestResize
- [ ] 用户操作仅emit，不直接处理业务

### 3. 业务逻辑开发
- [ ] 创建`useAIWorkflow*Controller.ts`，使用工厂函数模式（make*Controller）
- [ ] 如节点有复杂扩展字段，创建`useAIWorkflow*Sync.ts`同步工具
- [ ] 如节点涉及自动创建下游节点，创建`useAIWorkflow*AutoExpand.ts`
- [ ] 节点创建必须Engine优先，使用beginBulkUpdate/endBulkUpdate包裹
- [ ] 新节点必须设置createdAt: Date.now()
- [ ] 资源绑定必须双写（Store commit + engineApi.updateNodeData）
- [ ] Store commit后必须调用同步工具推送到Engine
- [ ] 异步锚点操作必须有重试机制
- [ ] 添加统一前缀的调试日志

### 4. Store层更新
- [ ] 添加对应mutation（如setNode*Settings）
- [ ] 在mutation中调用sync*Anchors同步动态锚点
- [ ] 添加normalize*Settings归一化函数
- [ ] 在hydrateDraft中添加必要的防御逻辑（如适用）

### 5. Host层集成
- [ ] 在AIWorkflowPage.vue中实例化controller，传入store/engineApi/pushToast
- [ ] 监听节点组件emit的事件，转发到controller方法
- [ ] 处理auto-resize事件调整节点高度

### 6. 测试验证
- [ ] TypeScript类型检查通过：`npx vue-tsc --noEmit`
- [ ] 节点可正常添加到画布，默认宽高足够显示完整内容
- [ ] 按钮点击触发业务流程，状态流转正确
- [ ] 生成结果后Ctrl+S保存，刷新后数据不丢失
- [ ] 自动布线节点不消失，位置不堆叠
- [ ] 资源正确显示（图片/3D预览）
- [ ] undo/redo正常工作（用户交互走Command）

---

## 六、调试日志关键字速查

| 日志前缀 | 对应模块 | 用途 |
|---------|---------|------|
| `[SCENE-DECOMPOSE CROP]` | 场景分解裁剪 | bbox字段检测、裁剪模式判断 |
| `[SCENE-DECOMPOSE-CROP]` | bbox解析 | 格式转换、坐标检测 |
| `[IMAGE-CROP]` | 离屏裁剪 | Canvas渲染、像素坐标输出 |
| `[SCENE-DECOMPOSE-AUTOEXPAND]` | 自动布线 | 节点创建、位置计算、连线状态 |
| `[SCENE-LAYOUT-PREVIEW]` | 场景布局预览 | Three.js启动、渲染状态、自动触发 |
| `[SCENE-LAYOUT-SYNC]` | 数据同步 | Store→Engine同步状态、layoutItems数量 |
| `[DraftFlow#hydrateDraft]` | Store同步 | 防御逻辑触发、PROTECT标记 |
| `[SCENE-IMAGE-TRACE]` | 图像源追溯 | 递归追溯链路、深度、节点类型 |

---

## 七、相关文档索引

- [06_AI_WORKFLOW_GUIDE.md](06_AI_WORKFLOW_GUIDE.md) - AI工作流蓝图开发指引（双层引擎架构、engineApi参考、架构红线）
- [07_DEVELOPMENT_BOUNDARIES.md](07_DEVELOPMENT_BOUNDARIES.md) - 全仓开发边界与规范
- [AGENT_GUIDE.md](../AGENT_GUIDE.md) - Agent开发总入口

---

## 八、版本记录

- v1.0 (2026-07-31) - 初始版本，基于场景分解/场景布局节点开发经验总结三层架构规范
