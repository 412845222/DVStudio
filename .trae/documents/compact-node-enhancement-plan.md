# 轻量壳标签截断与背景对比度改进方案

## 一、问题分析

### 问题1：标签被截断

当前标签样式：
```css
.aiwf-node-compact-type-badge {
  top: -9px;           /* 向上偏移9px */
  font-size: 10px;
  padding: 2px 6px;
  border: 1px solid;
}
```

标签总高度 = 字体(10px) + padding(4px) + border(2px) = **16px**
向上偏移9px，意味着底部超出7px，顶部超出9px

**根本原因**：轻量壳高度计算未包含标签的垂直空间需求。

### 问题2：背景对比度不足

当前样式：
```css
.aiwf-node-compact {
  border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, rgba(21, 24, 28, 0.88) 98%, transparent),
    color-mix(in srgb, rgba(21, 24, 28, 0.94) 80%, transparent)
  );
}
```

**问题**：
- 背景色与蓝图深色背景(约#0d1117)过于接近
- 边框透明度太高(45%)，对比度不足
- 缺少明显的视觉边界

## 二、解决方案

### 方案1：调整高度计算包含标签空间

**修改 `compactNodeShellStyle`**：
- 标签高度约16px，向上偏移9px
- 需要在轻量壳高度基础上增加顶部空间来容纳标签
- 调整节点定位，确保标签完整显示

### 方案2：增强背景对比度

**修改 `.aiwf-node-compact` 样式**：
1. 增加边框厚度和不透明度
2. 使用更明显的渐变（深色到稍浅色）
3. 添加内部发光效果增强边界感
4. 增加阴影强度

## 三、修改计划

### 3.1 修改尺寸计算逻辑

```typescript
const compactNodeShellStyle = (
  worldToScreen, worldX, worldY, zoom, width, height,
) => {
  const point = worldToScreen({ x: worldX, y: worldY })
  const nodeWidth = Math.max(80, width || 240)
  const nodeHeight = Math.max(80, height || 160)
  const safeZoom = Math.max(0.01, Number(zoom) || 1)
  
  // 标签占用空间：高度16px，向上偏移9px
  const badgeHeight = 16
  const badgeOffset = 9
  
  // 动态计算尺寸，包含标签空间
  const fixedWidth = Math.max(120, nodeWidth * safeZoom)
  const fixedHeight = Math.max(48 + badgeOffset, nodeHeight * safeZoom + badgeOffset)
  
  // 调整垂直位置，让标签完整显示
  const adjustedY = point.y - badgeOffset / 2
  
  return {
    left: `${point.x}px`,
    top: `${adjustedY}px`,
    width: `${fixedWidth}px`,
    height: `${fixedHeight}px`,
    transform: 'translate(-50%, -50%)',
  }
}
```

### 3.2 修改轻量壳样式

```css
.aiwf-node-compact {
  position: relative;
  min-width: 120px;
  min-height: 64px;  /* 增加最小高度容纳标签 */
  border: 1.5px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
  border-radius: 4px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, rgba(30, 35, 40, 0.95) 0%, transparent),
      color-mix(in srgb, rgba(15, 20, 25, 0.98) 100%, transparent)
    ),
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--wf-primary, #1f9d84) 8%, transparent) 0%,
      transparent 50%,
      color-mix(in srgb, var(--wf-primary, #1f9d84) 6%, transparent) 100%
    );
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, #fff 8%),
    inset 0 0 20px color-mix(in srgb, var(--wf-primary, #1f9d84) 8%, transparent),
    0 0 0 1px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent),
    0 0 16px color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent),
    0 4px 14px rgba(0, 0, 0, 0.4);
}
```

### 3.3 调整标签位置

```css
.aiwf-node-compact-type-badge {
  position: absolute;
  top: -10px;  /* 调整偏移确保完整显示 */
  right: 10px;
  z-index: 10;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 2px 7px;
  max-width: calc(100% - 24px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1.5px solid color-mix(in srgb, var(--tc, #1f9d84) 60%, transparent);
  background: color-mix(in srgb, rgba(25, 30, 35, 0.99));
  color: color-mix(in srgb, var(--tc, #1f9d84) 90%, #fff);
  border-radius: 3px;
  box-shadow:
    0 0 8px color-mix(in srgb, var(--tc, #1f9d84) 35%, transparent),
    0 1px 3px rgba(0, 0, 0, 0.3);
}
```

## 四、文件修改汇总

| 文件 | 修改内容 |
| --- | --- |
| `useAIWorkflowNodePresentation.ts` | 调整高度计算，包含标签空间，调整垂直位置 |
| `node-skins.css` | 增强边框和背景效果，提高对比度 |
| `node-skins.css` | 调整标签样式和位置 |

## 五、预期效果

| 改进项 | 效果 |
| --- | --- |
| 标签显示 | 标签完整显示，不再被截断 |
| 背景对比度 | 边框更明显，渐变层次感增强 |
| 视觉边界 | 内发光效果增强边界识别 |
| 深色/浅色主题 | 都能清晰识别轻量壳 |

## 六、风险评估

| 风险 | 描述 | 缓解措施 |
| --- | --- | --- |
| 布局偏移 | 调整位置可能影响对齐 | 使用精确的偏移计算 |
| 性能影响 | 多层渐变可能影响性能 | 限制渐变层数，使用简单渐变 |
| 主题兼容性 | 增强效果可能在某些主题下不兼容 | 使用CSS变量确保兼容性 |
