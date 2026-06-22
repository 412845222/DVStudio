# 轻量节点壳可读性改进计划

## 一、问题分析

### 当前阈值和缩放机制

| 项 | 当前值 | 问题 |
| --- | --- | --- |
| 切换阈值 | `0.36`（36%） | 阈值太低，节点已经非常小时才切换 |
| 轻量壳缩放 | `transform: scale(zoom)` | 整个节点包括内容都跟着缩放，文字不可读 |
| 典型场景 | zoom=0.36 时切换 | 240px节点 → 86px → 内部12px文字 → 4px，完全看不清 |

### 根本原因

轻量壳的目的是在节点缩小后保持可读性，但当前实现中：
1. 切换太晚（36%才切换）
2. 切换后仍然应用缩放变换，内容继续缩小

## 二、解决方案

### 方案：轻量壳保持固定物理尺寸

**核心思路**：
1. **提高切换阈值**：从 0.36 提高到 0.6（60%），让轻量壳更早出现
2. **轻量壳不缩放**：固定物理尺寸（如 160×56px），不应用 `scale(zoom)` 变换
3. **最小尺寸保护**：确保轻量壳在任何情况下都保持可读的最小尺寸

### 修改计划

#### 2.1 修改阈值配置（useAIWorkflowNodeVisibility.ts）

| 文件 | 修改内容 |
| --- | --- |
| `src/views/AIWorkflow/blueprint-core/useAIWorkflowNodeVisibility.ts` | 默认阈值从 `0.36` 改为 `0.6` |

#### 2.2 修改轻量壳尺寸计算（useAIWorkflowNodePresentation.ts）

| 文件 | 修改内容 |
| --- | --- |
| `src/views/AIWorkflow/node-business/presentation/useAIWorkflowNodePresentation.ts` | `compactNodeShellStyle` 使用固定尺寸，不应用 scale(zoom) |

**新的尺寸逻辑**：
```typescript
const compactNodeShellStyle = (
  worldToScreen, worldX, worldY, _zoom, width, height
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

#### 2.3 更新轻量壳样式（node-skins.css）

| 文件 | 修改内容 |
| --- | --- |
| `src/styles/workflow/node-skins.css` | 移除最小尺寸限制，优化紧凑布局 |

## 三、修改文件汇总

1. `src/views/AIWorkflow/blueprint-core/useAIWorkflowNodeVisibility.ts`
   - 修改默认阈值 `0.36` → `0.6`

2. `src/views/AIWorkflow/node-business/presentation/useAIWorkflowNodePresentation.ts`
   - 修改 `compactNodeShellStyle`：固定尺寸 + 无 scale

3. `src/styles/workflow/node-skins.css`
   - 调整 `.aiwf-node-compact` 样式以适应固定小尺寸

## 四、预期效果

| 缩放级别 | 行为 |
| --- | --- |
| zoom > 0.6 | 显示完整节点 |
| 0.6 ≥ zoom > 0.56 | 显示轻量壳（固定160×56px） |
| zoom ≤ 0.56 | 显示轻量壳（固定160×56px） |

**关键改进**：
- 轻量壳在 zoom=0.6 时就开始显示，此时节点还不算太小
- 轻量壳内容不随缩放缩小，始终保持可读
- 边缘触发（hysteresis）保持 0.03 或 8%，避免频繁切换

## 五、实现步骤

| 步骤 | 任务 | 文件 |
| --- | --- | --- |
| 1 | 修改切换阈值从 0.36 → 0.6 | `useAIWorkflowNodeVisibility.ts` |
| 2 | 修改 `compactNodeShellStyle` 固定尺寸，无 scale | `useAIWorkflowNodePresentation.ts` |
| 3 | 调整样式适应固定小尺寸 | `node-skins.css` |
| 4 | 构建验证 | - |
