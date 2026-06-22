# 轻量节点壳样式改进计划 v2

## 一、问题分析

### 1.1 节点面板大小不一致（问题1）

**问题**：当前轻量节点使用 `width = width * zoom` 来设置宽高，然后 `transform: translate(-50%, -50%)`（无scale）。而真实节点使用固定width/height + `transform: scale(zoom)`。

**根本差异**：
- 真实节点：`width: 240px; height: 160px; transform: translate(-50%, -50%) scale(0.5)` → 屏幕上显示为 120×80px
- 轻量节点（之前）：`width: 120px; height: 80px; transform: translate(-50%, -50%)` → 屏幕上也是 120×80px

但由于最小尺寸保护(`minWidth=140`)，轻量节点在zoom较小时**会比真实节点大**，导致不匹配。

### 1.2 缩小蓝图时节点被压扁（问题2）

**问题**：zoom继续减小后，节点的width/height过小，内部的文字（如"1入1出"）被截断或堆叠变形。

**原因**：内部元素使用相对布局 + 缩小后物理尺寸太小（高度可能只有40-50px），字体也缩小到不可读。

### 1.3 内容设计不够美观（问题3）

**问题**：
- 缺少渐变背景（色块只是纯色，无渐变）
- icon是线条描边风格，小尺寸下不醒目
- 没有类似真实节点右上角的"节点编号"badge来提示类型

## 二、修复方案

### 2.1 节点面板大小完全一致

| 文件 | 修改内容 |
| --- | --- |
| `src/views/AIWorkflow/node-business/presentation/useAIWorkflowNodePresentation.ts` | 修改 `compactNodeShellStyle`：使用**与真实节点完全相同**的计算方式 —— 固定 `width/height`（不乘zoom） + `transform: translate(-50%, -50%) scale(clampNodeScale(zoom))` |

```typescript
const compactNodeShellStyle = (
  worldToScreen, worldX, worldY, zoom, width, height
) => {
  const point = worldToScreen({ x: worldX, y: worldY })
  const nodeWidth = Math.max(80, width || 240)   // 与真实节点一致
  const nodeHeight = Math.max(80, height || 160) // 与真实节点一致
  const scale = clampNodeScale(zoom)  // 与真实节点一致的scale
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
    width: `${nodeWidth}px`,
    height: `${nodeHeight}px`,
    transform: `translate(-50%, -50%) scale(${scale})`,
  }
}
```

### 2.2 节点内容抗压扁设计

**策略**：节点内部的关键视觉元素使用固定比例的绝对尺寸，**不随容器缩放而坍塌**。

实现思路：
- 内部使用固定最小尺寸保证视觉元素完整性
- 当节点缩放时，整体scale但内部布局比例不变（因为外壳是scale transform缩放，内部元素的像素尺寸在缩放后自动变小但比例保持）

**关键改动**：
1. 在 `.aiwf-node-compact` 中去掉 `overflow: hidden` 的限制，改为让内部元素有稳定的布局比例
2. 使用 `flex-shrink: 0` 保护icon和标题区域

### 2.3 新视觉设计

新的布局结构：
```
┌────────────────────────────────────┬─┐
│  🎨                              图片│  ← 右上角类型badge (新)
│  ╔═══════════════════════════════════║
│  ║                                   ║
│  ║   ╔═══════╗                      ║
│  ║   ║ 大icon ║     节点标题         ║
│  ║   ║ (渐变) ║     1入1出           ║
│  ║   ╚═══════╝                      ║
│  ║                                   ║
│  ╚═══════════════════════════════════╝
└────────────────────────────────────┴─┘
  └─ L形边角装饰                       └─ 脉冲状态点
```

**具体设计**：
1. **渐变背景**：`background: linear-gradient(135deg, color-mix(typeColor 18%, base), base)`
2. **icon重新设计**：从 `stroke` 改为 `fill` 为主，增强小尺寸下的可识别性
3. **右上角类型badge**：类似 `.wf-node-id-badge` 的样式，显示中文类型名（"图片"、"视频"等）
4. **渐变图标色块**：左侧60-80px的色块，使用类型颜色做渐变，中间放icon
5. **右侧信息区**：标题（如"图片节点"）+ meta（如"1入1出"）

### 2.4 新增中文类型文字

| 文件 | 函数 | 新增内容 |
| --- | --- | --- |
| `src/views/AIWorkflow/node-business/presentation/useAIWorkflowNodePresentation.ts` | `compactNodeTypeChinese(node)` | 返回节点类型中文："图片"/"视频"/"文本"/"故事"/"场景"等 |
| `src/views/AIWorkflow/node-business/presentation/useAIWorkflowNodePresentation.ts` | `compactNodeTypeGradient(node)` | 返回渐变色字符串（用于icon色块背景） |

## 三、修改文件汇总

### 3.1 `src/views/AIWorkflow/node-business/presentation/useAIWorkflowNodePresentation.ts`
- 修改 `compactNodeShellStyle`：改为与真实节点相同的尺寸计算 + scale transform
- 新增 `compactNodeTypeChinese(node)`：返回中文类型名（用于右上角badge）
- 新增 `compactNodeTypeGradient(node)`：返回渐变色CSS字符串（用于icon色块）
- 修改 `compactNodeTypeLabel(node)`：返回更简洁的类型标签（"TXT"/"IMG"等英文缩写）
- 更新返回值，导出新函数

### 3.2 `src/views/AIWorkflow/AIWorkflowPage.vue`
- 重写 `aiwf-node-compact` 的模板结构
- 新增：右上角类型badge（`.aiwf-node-compact-type-badge`）
- 新增：左侧渐变icon色块 + 中文类型缩写
- 新增：右侧区域显示节点标题 + 入出信息
- 新增：状态指示器（running/error的辉光脉冲点）
- 导入新增的工具函数

### 3.3 `src/styles/workflow/node-skins.css`
- 重写 `.aiwf-node-compact` 系列样式：
  - 固定width/height，使用scale缩放（与真实节点一致）
  - 渐变背景 + 毛玻璃效果
  - L形边角装饰（同真实节点）
  - `.aiwf-node-compact-type-badge`：右上角类型badge样式
  - `.aiwf-node-compact-icon-block`：左侧渐变icon色块样式
  - `.aiwf-node-compact-title-row` / `.aiwf-node-compact-meta`：右侧信息
  - `.aiwf-node-compact-state-dot`：脉冲状态点
  - 选中/运行/错误状态的边框辉光效果

## 四、视觉设计规格

### 4.1 节点外壳
- **尺寸**：与真实节点完全一致（使用 `width`/`height` 字段，无缩放保护）
- **背景**：`linear-gradient(135deg, color-mix(typeColor 15%, base), base 70%)`
- **边框**：1px `color-mix(var(--wf-primary) 50%, transparent)`，角部辉光
- **毛玻璃**：`backdrop-filter: blur(14px)`
- **L形边角**：`::before`/`::after` 与真实节点相同

### 4.2 右上角类型badge
- **定位**：`position: absolute; top: -10px; right: 8px;`（与 `.wf-node-id-badge` 一致）
- **样式**：翡翠色边框 + 毛玻璃背景 + 文字发光
- **内容**：中文类型名（"图片"/"视频"/"文本"等）
- **尺寸**：`font-size: 10px; padding: 1px 6px;`

### 4.3 渐变icon色块（左侧）
- **尺寸**：`width: 70px; height: 100%;` 或固定比例
- **背景**：线性渐变从类型主色到深色
- **内容**：居中放置大尺寸填充式SVG icon
- **边框**：右侧与主体的分隔线

### 4.4 更好的icon
- 将当前的纯描边SVG改为填充为主的图标
- 不同节点类型使用不同的icon（已存在的SVG path，调整为fill模式）
- icon颜色：使用类型主色，带发光效果

### 4.5 右侧信息区
- **标题**：节点名称 / "图片节点"
- **Meta**：输入输出信息 "1入1出"
- **字体**：JetBrains Mono 等宽字体，小尺寸可读

### 4.6 状态脉冲点
- **Running**：金色脉冲点
- **Error**：红色脉冲点
- **位置**：右下角或右侧边缘
- **动画**：`@keyframes compact-pulse` 呼吸脉冲

## 五、风险与注意事项

1. **scale transform的影响**：由于节点使用 scale 缩放，内部的 `font-size` 等也会被缩放。在zoom=0.3时，10px文字实际只有3px不可读。**解决方案**：内部关键元素使用相对大的基础字体（12-14px），通过scale缩放后仍可识别；或者考虑在极小时只显示icon色块。

2. **anchor节点连接点**：缩放后，连接点的位置需要正确匹配到节点边缘。由于使用的是scale transform，锚点应该正确跟随节点缩放。

3. **中文类型映射**：需要为每种节点类型提供中文名称。

## 六、实现步骤

| 步骤 | 任务 | 文件 |
| --- | --- | --- |
| 1 | 修改 `compactNodeShellStyle` 尺寸计算，使用与真实节点相同的scale方式 | `useAIWorkflowNodePresentation.ts` |
| 2 | 新增 `compactNodeTypeChinese` 和 `compactNodeTypeGradient` 函数 | `useAIWorkflowNodePresentation.ts` |
| 3 | 重写轻量节点模板：右上角badge + 左侧icon色块 + 右侧信息区 | `AIWorkflowPage.vue` |
| 4 | 更新节点SVG icon：填充式图标样式 | `AIWorkflowPage.vue` |
| 5 | 重写 `.aiwf-node-compact` 全部CSS样式 | `node-skins.css` |
| 6 | 验证构建：`npm run build` | - |
