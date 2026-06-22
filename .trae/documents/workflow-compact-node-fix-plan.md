# 轻量节点壳样式修复计划

## 一、问题分析

### 1.1 类型图标块布局问题（截图1）

当前实现问题：
- `.aiwf-node-compact-icon` 使用 `flex-direction: column` + `gap: 4px`
- 图标(28px) + 标签(10px) + gap(4px) = 42px，在 88px 高度内垂直居中后上方留白过多
- 标签文字"IMG"、"VID"等没有居中，视觉上显得偏移

### 1.2 尺寸不一致问题（截图2）

当前实现问题：
- `compactNodeShellStyle` 使用固定值 `width: 240px; height: 88px`
- 真实节点宽度可能是 300px+、高度可能是 160px+
- 导致轻量壳与完整节点尺寸不匹配，选中后视觉跳变

## 二、修复方案

### 2.1 修复类型图标块布局

| 步骤 | 文件 | 修改内容 |
| --- | --- | --- |
| 1 | `src/styles/workflow/node-skins.css` | 修改 `.aiwf-node-compact-icon`：移除 `gap`，使用 `justify-content: center` 配合 `margin` 调整间距 |
| 2 | `src/styles/workflow/node-skins.css` | 调整 `.aiwf-node-compact-icon-label`：字体改为 11px，字间距调整，添加更好的阴影 |
| 3 | `src/styles/workflow/node-skins.css` | 调整图标大小为 24px，与标签比例更协调 |

新布局：
```
.aiwf-node-compact-icon (88×88px)
├── 背景色块（半透明）
├── SVG图标（24px，顶部距20px）
└── 标签文字（11px，图标下方4px）
```

### 2.2 修复轻量壳尺寸一致性

| 步骤 | 文件 | 修改内容 |
| --- | --- | --- |
| 1 | `src/views/AIWorkflow/node-business/presentation/useAIWorkflowNodePresentation.ts` | 修改 `compactNodeShellStyle`：使用真实节点的 width/height，添加最小尺寸限制 |
| 2 | `src/styles/workflow/node-skins.css` | 移除 `.aiwf-node-compact` 的固定宽高定义 |

新尺寸逻辑：
```typescript
const compactNodeShellStyle = (
  worldToScreen, worldX, worldY, _zoom, width, height
) => {
  const point = worldToScreen({ x: worldX, y: worldY })
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
    width: `${Math.max(180, width || 280)}px`,  // 最小180px，使用真实节点宽度
    height: `${Math.max(64, height || 120)}px`,   // 最小64px，使用真实节点高度
    transform: 'translate(-50%, -50%)',           // 无scale，保持物理尺寸
  }
}
```

### 2.3 调整轻量壳内部布局

| 步骤 | 文件 | 修改内容 |
| --- | --- | --- |
| 1 | `src/styles/workflow/node-skins.css` | 修改 `.aiwf-node-compact-icon` 宽度为 72px，更紧凑 |
| 2 | `src/styles/workflow/node-skins.css` | 调整 `.aiwf-node-compact-body` 的 padding 和间距 |

## 三、修改文件汇总

1. `src/styles/workflow/node-skins.css` —— 轻量壳样式
2. `src/views/AIWorkflow/node-business/presentation/useAIWorkflowNodePresentation.ts` —— 尺寸计算
3. `src/views/AIWorkflow/AIWorkflowPage.vue` —— 模板（如需调整）

## 四、预期效果

1. 类型图标块中的图标和标签垂直居中对齐，视觉协调
2. 轻量壳尺寸与真实节点完全一致（最小尺寸保护）
3. 选中节点时不再有尺寸跳变
