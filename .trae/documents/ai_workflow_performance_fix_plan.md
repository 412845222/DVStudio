# AI工作流性能优化修复计划

## 问题描述

### 问题1：开发者工具打开时卡顿
当 Electron 打开开发者工具时，在节点数量较多的情况下会出现明显卡顿，关闭开发者工具后恢复正常。

**原因分析**：开发者工具的性能监控和调试功能会对每个 DOM 操作进行额外追踪，增加大量性能开销。当前的优化策略过于激进，在开发者工具开启时会产生大量额外工作。

### 问题2：鼠标交互时图片闪烁
只要有鼠标交互（如平移、缩放），图片就会被取消渲染，造成整个蓝图的频繁闪烁。

**原因分析**：在 `buildMotionReducedProps` 函数中，对于 image/video 节点，`resourceUrl` 被设置为空字符串 `''`，导致 `img` 标签的 `src` 属性被清空，图片被卸载。

## 解决方案

### 修改文件列表

| 文件路径 | 修改内容 |
|---------|---------|
| `src/views/AIWorkflow/assets/useAIWorkflowResourceCache.ts` | 添加资源缓存状态跟踪，确保已加载资源不被重复处理 |
| `src/views/AIWorkflow/node-business/presentation/useAIWorkflowNodeExtraProps.ts` | 修改 `buildMotionReducedProps`，保留已加载的资源URL |
| `src/views/AIWorkflow/blueprint-core/useAIWorkflowViewport.ts` | 添加开发者工具检测和性能模式调整 |
| `src/ui/WorkFlow/WorlFlowNodes/WorkflowImageNode.vue` | 确保图片加载成功后保持渲染状态 |

### 修改步骤

#### 步骤1：修改 useAIWorkflowResourceCache.ts
添加 `isResourceCached` 方法，用于判断资源是否已缓存。

#### 步骤2：修改 useAIWorkflowNodeExtraProps.ts
- 对于 image/video 节点，保留 `resourceUrl` 和预览URL，不设置为空字符串
- 只减少计算密集型的 props（如 `inputParamPreviewRefs`）
- 添加资源缓存检查，已缓存的资源保持正常渲染

#### 步骤3：修改 useAIWorkflowViewport.ts
- 添加开发者工具检测逻辑
- 当开发者工具打开时，降低优化的激进程度
- 添加性能模式动态调整

#### 步骤4：修改 WorkflowImageNode.vue
- 确保图片加载成功后，即使在 motion 模式下也保持渲染
- 添加 `loading="lazy"` 和 `decoding="async"` 属性优化加载

## 关键代码修改

### useAIWorkflowNodeExtraProps.ts 修改
```typescript
// 原代码（问题代码）
if (node.type === 'image' || node.type === 'video') {
  return {
    resourceUrl: '',  // 问题：清空导致图片卸载
    resourcePreviewUrl320: null,
    resourcePreviewUrl640: null,
    // ...
  }
}

// 修改后
if (node.type === 'image' || node.type === 'video') {
  // 保留已加载的资源URL，避免图片卸载
  const cachedResourceUrl = payload.nodeResourceUrl(node)
  const cachedPreviewUrl320 = payload.nodeImagePreviewUrl(node, 320)
  const cachedPreviewUrl640 = payload.nodeImagePreviewUrl(node, 640)
  
  return {
    resourceUrl: sanitizeWorkflowMediaUrl(cachedResourceUrl) || '',
    resourcePreviewUrl320: sanitizeWorkflowMediaUrl(cachedPreviewUrl320) || null,
    resourcePreviewUrl640: sanitizeWorkflowMediaUrl(cachedPreviewUrl640) || null,
    // 只减少计算密集型props
    inputParamPreviewRefs: [],
    // ... 其他属性保持不变
  }
}
```

### useAIWorkflowViewport.ts 修改
```typescript
// 添加开发者工具检测
const isDevToolsOpen = ref(false)

const checkDevTools = () => {
  if (typeof window !== 'undefined' && window.ElectronAPI) {
    window.ElectronAPI.onDevToolsStateChange((open: boolean) => {
      isDevToolsOpen.value = open
    })
  }
}

// 在 markViewportMotion 中考虑开发者工具状态
const markViewportMotion = () => {
  viewportMotionActive.value = true
  // 如果开发者工具打开，延长重置时间，减少优化触发频率
  const resetMs = isDevToolsOpen.value ? motionResetMs * 3 : motionResetMs
  if (viewportMotionTimer != null) window.clearTimeout(viewportMotionTimer)
  viewportMotionTimer = window.setTimeout(() => {
    viewportMotionTimer = null
    viewportMotionActive.value = false
  }, resetMs)
}
```

## 风险评估

| 风险点 | 风险等级 | 应对措施 |
|-------|---------|---------|
| 资源缓存可能导致内存占用增加 | 中等 | 保留 LRU 淘汰机制，限制最大缓存数量 |
| 开发者工具检测可能不稳定 | 低 | 使用 try-catch 包裹，失败时降级到默认行为 |
| 修改可能影响现有功能 | 低 | 只修改 motion 模式下的行为，正常模式保持不变 |

## 测试要点

1. 打开开发者工具后，节点多的时候是否仍然卡顿
2. 鼠标交互时图片是否仍然闪烁
3. 图片资源是否正常加载和缓存
4. 长时间使用后内存占用是否在合理范围内