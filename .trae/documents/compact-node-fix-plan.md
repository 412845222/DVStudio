# 轻量壳显示问题详细解决方案

## 一、问题分析

### 当前问题确认

根据用户截图，存在两个核心问题：

| 问题 | 现象 | 可能原因 |
| --- | --- | --- |
| 标签被截断 | 右上角类型标签只显示一部分 | 标签宽度不足或被父容器裁剪 |
| 高度不一致 | 轻量壳高度明显小于真实节点 | 固定高度与真实节点缩放后高度不匹配 |

### 代码分析

**1. 类型标签样式（第538-559行）**
```css
.aiwf-node-compact-type-badge {
  position: absolute;
  top: -8px;
  right: 6px;
  font-size: 9px;
  padding: 1px 5px;
  white-space: nowrap;
}
```
标签使用 `white-space: nowrap` 但没有设置最大宽度，可能导致长文本溢出。

**2. 轻量壳尺寸（第477-507行）**
```css
.aiwf-node-compact {
  width: 160px;
  height: 64px;
}
```
固定尺寸可能与真实节点缩放后的尺寸不匹配。

**3. 真实节点尺寸计算（useAIWorkflowNodePresentation.ts）**
```typescript
const resolveNodeShellStyle = (..., zoom, width, height) => {
  return {
    width: `${Math.max(80, width || 240)}px`,
    height: `${Math.max(80, height || 160)}px`,
    transform: `translate(-50%, -50%) scale(${clampNodeScale(zoom)})`,
  }
}
```
真实节点使用 `scale(zoom)` 变换，而轻量壳不使用，导致视觉尺寸差异。

## 二、解决方案

### 方案1：动态匹配真实节点尺寸

**核心思路**：轻量壳应该根据真实节点的缩放后尺寸来设置自己的固定尺寸，确保视觉上完全一致。

**修改步骤**：

1. **修改 `compactNodeShellStyle`**：计算真实节点缩放后的尺寸作为轻量壳的固定尺寸
   - 宽度 = `Math.max(80, width || 240) * zoom`
   - 高度 = `Math.max(80, height || 160) * zoom`
   - 最小尺寸保护：宽度≥120px，高度≥48px

2. **调整类型标签样式**：确保标签不被截断
   - 设置合适的 `z-index` 确保在最上层
   - 添加 `max-width` 和 `overflow: hidden` 配合 `text-overflow: ellipsis`

3. **移除硬编码的固定尺寸**：改为动态计算

### 方案2：保持轻量壳独立但优化视觉一致性

**核心思路**：轻量壳保持固定尺寸，但调整为更合适的值，并优化标签显示。

**修改步骤**：

1. **调整轻量壳尺寸**：增加到 `180×72px`，更接近真实节点缩放后的平均尺寸

2. **优化标签样式**：
   - 增加 `z-index` 确保不被遮挡
   - 添加 `max-width` 防止溢出

## 三、推荐方案

采用**方案1：动态匹配真实节点尺寸**，因为这样可以确保轻量壳和真实节点在切换时视觉上无缝过渡。

## 四、修改计划

### 4.1 修改 useAIWorkflowNodePresentation.ts

```typescript
const compactNodeShellStyle = (
  worldToScreen, worldX, worldY, zoom, width, height,
) => {
  const point = worldToScreen({ x: worldX, y: worldY })
  // 计算真实节点缩放后的尺寸
  const nodeWidth = Math.max(80, width || 240)
  const nodeHeight = Math.max(80, height || 160)
  const safeZoom = Math.max(0.01, Number(zoom) || 1)
  
  // 动态计算轻量壳尺寸（匹配真实节点缩放后大小）
  const fixedWidth = Math.max(120, nodeWidth * safeZoom)
  const fixedHeight = Math.max(48, nodeHeight * safeZoom)
  
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
    width: `${fixedWidth}px`,
    height: `${fixedHeight}px`,
    transform: 'translate(-50%, -50%)',
  } as Record<string, string>
}
```

### 4.2 修改 node-skins.css

```css
/* Top-right type badge */
.aiwf-node-compact-type-badge {
  position: absolute;
  top: -9px;
  right: 8px;
  z-index: 10;  /* 提高层级确保不被遮挡 */
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 2px 6px;
  max-width: calc(100% - 16px);  /* 限制最大宽度 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid color-mix(in srgb, var(--tc, #1f9d84) 45%, transparent);
  background: color-mix(in srgb, rgba(21, 24, 28, 0.98));
  color: color-mix(in srgb, var(--tc, #1f9d84) 85%, #fff);
  border-radius: 2px;
  box-shadow: 0 0 6px color-mix(in srgb, var(--tc, #1f9d84) 25%, transparent);
}
```

### 4.3 修改轻量壳基础样式

```css
.aiwf-node-compact {
  position: relative;
  /* 宽度和高度由内联样式动态设置 */
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent);
  border-radius: 2px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, rgba(21, 24, 28, 0.88) 98%, transparent),
    color-mix(in srgb, rgba(21, 24, 28, 0.94) 80%, transparent)
  );
  backdrop-filter: blur(12px) saturate(130%);
  -webkit-backdrop-filter: blur(12px) saturate(130%);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--wf-primary, #1f9d84) 18%, #fff 10%),
    0 0 0 1px color-mix(in srgb, var(--wf-primary, #1f9d84) 16%, transparent),
    0 0 12px color-mix(in srgb, var(--wf-primary, #1f9d84) 16%, transparent),
    0 3px 10px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: row;
  align-items: stretch;
  transition: border-color 200ms ease, box-shadow 200ms ease;
  cursor: pointer;
  transform: translate(-50%, -50%);
  transform-origin: 50% 50%;
  box-sizing: border-box;
  user-select: none;
}
```

## 五、文件修改汇总

| 文件 | 修改内容 |
| --- | --- |
| `useAIWorkflowNodePresentation.ts` | 修改 `compactNodeShellStyle` 动态计算尺寸 |
| `node-skins.css` | 修改 `.aiwf-node-compact` 移除硬编码尺寸 |
| `node-skins.css` | 修改 `.aiwf-node-compact-type-badge` 优化显示 |

## 六、预期效果

| 缩放级别 | 轻量壳尺寸 | 效果 |
| --- | --- | --- |
| zoom = 0.5 | ~120×80px | 适中尺寸，标签完整显示 |
| zoom = 0.36 | ~86×58px | 最小保护尺寸，仍可读 |
| zoom < 0.36 | 120×48px (最小) | 强制最小尺寸保护 |

**关键改进**：
1. 轻量壳尺寸与真实节点缩放后尺寸动态匹配
2. 类型标签有最大宽度限制，超长文本会省略显示
3. 标签 z-index 提高，确保不被遮挡
4. 最小尺寸保护确保可读性

## 七、风险评估

| 风险 | 描述 | 缓解措施 |
| --- | --- | --- |
| 尺寸跳跃 | 切换时可能有视觉跳跃 | 使用过渡动画 |
| 极端缩放 | 极小缩放时可能仍太小 | 最小尺寸保护 |
| 标签溢出 | 极端情况下标签仍可能溢出 | `max-width` + `text-overflow` |
