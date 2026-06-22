# 轻量节点壳可读性改进计划

## 一、问题分析

### 当前机制的问题

| 项 | 当前值 | 问题 |
| --- | --- | --- |
| 切换阈值 | `0.36`（36%） | 保持不变 |
| 轻量壳缩放 | `transform: scale(zoom)` | **问题核心**：内容跟着缩小，文字不可读 |
| zoom=0.36 时 | 240px节点 → 86px | 12px文字 → 4px，完全看不清 |

### 核心问题

轻量壳的目的是在节点缩小后保持可读性，但当前实现中：
- **切换后仍然应用缩放变换**，导致内容继续缩小
- 需要让轻量壳**保持固定物理尺寸**

## 二、解决方案

### 方案：轻量壳保持固定物理尺寸（保持阈值不变）

**核心思路**：
1. **保持当前阈值 0.36**：不修改切换逻辑
2. **轻量壳固定尺寸**：使用固定物理尺寸（如 160×56px），不应用 `scale(zoom)` 变换
3. **内容自适应**：调整内部布局，确保在小尺寸下内容仍然清晰可读

### 修改计划

#### 2.1 修改轻量壳尺寸计算（useAIWorkflowNodePresentation.ts）

**关键修改**：`compactNodeShellStyle` 使用固定尺寸，不应用 scale(zoom)

```typescript
const compactNodeShellStyle = (
  worldToScreen, worldX, worldY, _zoom, _width, _height
) => {
  const point = worldToScreen({ x: worldX, y: worldY })
  // 固定物理尺寸，不随缩放变化
  const fixedWidth = 160   // 固定宽度
  const fixedHeight = 56   // 固定高度
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
    width: `${fixedWidth}px`,
    height: `${fixedHeight}px`,
    transform: 'translate(-50%, -50%)',  // 只有居中，没有scale
  }
}
```

#### 2.2 更新轻量壳样式（node-skins.css）

调整布局以适应固定小尺寸：
- 紧凑布局：减少padding，优化间距
- 简化内容：只保留最关键的信息（类型图标 + 类型标签）
- 移除冗余元素：如IO信息等

#### 2.3 简化模板结构（AIWorkflowPage.vue）

保留核心信息：
- 类型图标色块（左侧）
- 类型标签（右上角badge）
- 状态指示器（右下角）

## 三、修改文件汇总

1. `src/views/AIWorkflow/node-business/presentation/useAIWorkflowNodePresentation.ts`
   - 修改 `compactNodeShellStyle`：固定尺寸 + 无 scale

2. `src/styles/workflow/node-skins.css`
   - 调整 `.aiwf-node-compact` 样式：紧凑布局，简化内容

3. `src/views/AIWorkflow/AIWorkflowPage.vue`
   - 简化轻量壳模板：只保留最关键信息

## 四、预期效果

| 缩放级别 | 行为 |
| --- | --- |
| zoom > 0.36 | 显示完整节点 |
| zoom ≤ 0.36 | 显示轻量壳（固定160×56px，内容不缩小） |

**关键改进**：
- 轻量壳在 zoom=0.36 时切换
- **轻量壳内容不随缩放缩小**，始终保持可读的物理尺寸
- 布局紧凑但信息完整

## 五、实现步骤

| 步骤 | 任务 | 文件 |
| --- | --- | --- |
| 1 | 修改 `compactNodeShellStyle` 固定尺寸，无 scale | `useAIWorkflowNodePresentation.ts` |
| 2 | 调整样式：紧凑布局，简化内容 | `node-skins.css` |
| 3 | 简化模板：只保留类型图标、标签、状态指示器 | `AIWorkflowPage.vue` |
| 4 | 构建验证 | - |
