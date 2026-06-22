# AI 工作流蓝图 —— UI 风格改造第二期

## 一、现状调研结论

### 1.1 节点背景

- 当前定义位于 `src/styles/workflow/node-skins.css` 的 `.wf-node`
- 背景为线性渐变 + 硬色 `rgba(22, 26, 30, 0.85)`，**无毛玻璃 / backdrop-filter**
- 边框是 1px `color-mix(in srgb, var(--wf-node-border) 85%, transparent)`
- 悬浮/选中状态通过 `box-shadow` 与边框颜色切换表现辉光
- **问题**：节点本身与蓝图背景重叠时视觉混乱，缺少层次

### 1.2 节点顶部选择状态工具栏

- 位于 `src/ui/WorkFlow/WorkflowNodeBase.vue` 内（组件内的 toolbar）
- 样式定义在 `node-skins.css` 的 `.wf-node-toolbar`
- `WorkflowSelectionToolbar.vue` 是另一个独立组件（可能与蓝图整体层面的选择有关）
- 目前的工具栏使用硬颜色，没有采用翡翠色辉光 / L 形边角

### 1.3 动画编辑器入口

- 入口定义在 `src/ui/UIComponent/GlobalSideNav.vue` 的 `items` 数组中：
  - `{ key: 'studio', label: '动画编辑器', active: route.name === 'VideoStudio' }`
- 路由标签在 `src/ui/UIComponent/PageTransitionOverlay.vue` 的 `NAV_LABELS` 中：`VideoStudio: '动画编辑器'`

### 1.4 轻量节点壳（compact node shell）

- 组件实现位于 `src/views/AIWorkflow/AIWorkflowPage.vue` 的节点渲染模板中
- 显示条件由 `useAIWorkflowNodeVisibility` 的 `shouldRenderCompactNode(vp.zoom, node)` 决定，阈值约 `0.3~0.35`
- 节点尺寸计算位于 `src/views/AIWorkflow/node-business/presentation/useAIWorkflowNodePresentation.ts`
- `resolveNodeShellStyle` 计算 width / height / transform: `Math.max(80, width || 240)` 和 `Math.max(80, height || 160)`，`scale(Math.max(0.2, Math.min(6, zoom)))`
- **核心问题**：
  - 当 zoom 较小时，transform scale 会把节点压得非常小，"体积感"消失
  - `.aiwf-node-compact` 的背景样式（`node-skins.css` 末尾）是一个简单的渐变背景，**缺少清晰可辨的节点类型标识**
  - 节点之间的连接（edge）在节点壳缩小后视觉与节点壳脱离
- **目标**：
  - 让轻量节点壳的**物理宽高**与正常节点一致（节点不随 zoom 进行 scale 压缩）
  - 在 zoom 缩小时，节点内容被替换为一个**可一眼识别**的紧凑面板（包含类型图标 + 标题 + 运行状态辉光）
  - 所有视觉元素（L 形边角、辉光、边框）保持与正常节点一致的主题

## 二、修改清单

### 2.1 节点背景（毛玻璃）

| 步骤 | 文件 | 说明 |
| --- | --- | --- |
| 1 | `src/styles/workflow/node-skins.css` | 在 `.wf-node` 中添加 `backdrop-filter: blur(14px) saturate(140%)` + `-webkit-backdrop-filter`，并将背景色改为 `color-mix` + 半透明的组合以便毛玻璃生效 |
| 2 | `src/styles/workflow/node-skins.css` | 调整 `.wf-node` 的 `box-shadow`：加入一层内阴影 + 外层弱辉光，使节点在渐变背景上"浮起" |
| 3 | `src/ui/WorkFlow/WorkflowNodeBase.vue` | 补充 `<style>` 中的 `.wf-node-body`：毛玻璃内部内容区 |

### 2.2 节点顶部选择工具栏（同风格改造）

| 步骤 | 文件 | 说明 |
| --- | --- | --- |
| 1 | `src/styles/workflow/node-skins.css` | 重写 `.wf-node-toolbar`：使用翡翠色辉光边框、毛玻璃背景、L 形伪元素边角、按钮 hover 与 active 状态 |
| 2 | `src/styles/workflow/node-skins.css` | `.wf-node-btn` / `.wf-node-type-dropdown` / `.wf-node-type-item` / `.wf-media-btn`：统一翡翠色 + 辉光 + 圆角为 0 或 2px |
| 3 | `src/ui/WorkFlow/WorkflowSelectionToolbar.vue` | 重写样式（该组件可能也在蓝图顶部出现）使用同样风格 |

### 2.3 隐藏"动画编辑器"左侧导航入口

| 步骤 | 文件 | 说明 |
| --- | --- | --- |
| 1 | `src/ui/UIComponent/GlobalSideNav.vue` | 在 `items` computed 中移除或注释掉 `{ key: 'studio', ... }` |
| 2 | `src/ui/UIComponent/PageTransitionOverlay.vue` | 保留 `NAV_LABELS['VideoStudio']` 的存在（防错误），但实际路由不再由导航触发 |

### 2.4 轻量节点壳 —— 尺寸与识别设计

| 步骤 | 文件 | 说明 |
| --- | --- | --- |
| 1 | `src/views/AIWorkflow/node-business/presentation/useAIWorkflowNodePresentation.ts` | 引入 `compactNodeShellStyle`：**不使用 scale**，直接使用 `width`、`height` 的恒定像素尺寸（例如 width: 240px / height: 88px），位置 `left: point.x, top: point.y`，`transform: translate(-50%, -50%)` |
| 2 | `src/views/AIWorkflow/AIWorkflowPage.vue` | 在节点模板中使用 `compactNodeShellStyle` 替代 `compactNodeStyle` |
| 3 | `src/styles/workflow/node-skins.css` | 重写 `.aiwf-node-compact`：毛玻璃背景 + 翡翠色辉光边框 + L 形伪元素边角 + 节点类型图标色块 + 标题 + 运行/错误状态条 |
| 4 | `src/styles/workflow/node-skins.css` | 新增 `.aiwf-node-compact.is-selected` / `.is-primary-selected` / `.is-secondary-selected` / `.is-running` / `.is-error` 状态样式，使用主题色变量 + 辉光 |
| 5 | `src/views/AIWorkflow/AIWorkflowPage.vue` | 在 `.aiwf-node-compact` 的模板中增加"类型图标色块"、"节点标题"、"运行状态"三个内部元素 |
| 6 | `src/views/AIWorkflow/blueprint-core/useAIWorkflowNodeVisibility.ts` | 复核 `shouldRenderCompactNode` 的阈值是否合理（保持当前，但确认阈值计算逻辑无 bug） |

## 三、核心设计要点

### 3.1 节点毛玻璃

```
.wf-node
├── backdrop-filter: blur(14px) saturate(140%)
├── background: rgba(20, 24, 28, 0.72) + 内渐变
├── border: 1px color-mix(var(--wf-primary) 45%, transparent)
├── box-shadow: inset 0 1px 0 + 0 0 18px outer-glow
├── ::before / ::after L 形边角
└── .wf-node-toolbar  —— 顶部弹出工具栏
```

### 3.2 顶部工具栏（选中态弹出）

```
.wf-node-toolbar
├── position: absolute, top: -44px
├── 翡翠色 1px 边框 + 辉光 box-shadow
├── backdrop-filter: blur(12px)
├── L 形 ::before / ::after 边角装饰
└── 按钮：翡翠色 hover，透明默认，细边框
```

### 3.3 紧凑节点壳（缩小时）

```
.aiwf-node-compact  (固定 240×88px)
├── 毛玻璃背景（与正常节点一致）
├── 1px 翡翠色辉光边框
├── L 形边角
├── 左侧：节点类型图标色块（88×88px，按类型着色）
│   │   ├── text: rgb(63, 140, 255)
│   │   ├── image: rgb(236, 72, 153)
│   │   ├── video: rgb(52, 211, 153)
│   │   ├── scene-understanding: rgb(168, 85, 247)
│   │   ├── scene-layout: rgb(249, 115, 22)
│   │   ├── comfyui: rgb(14, 165, 233)
│   │   └── ...
│   └── 色块内部：节点类型中文标签（等宽字体）
├── 右侧上部：节点标题（主文字）
├── 右侧下部：节点 subtitle / meta 信息
├── 右侧最右：运行/错误状态辉光点（pulse 动画）
└── .is-selected 时边框 + 外层更强辉光
```

## 四、修改文件汇总

1. `src/styles/workflow/node-skins.css` —— 核心样式
2. `src/ui/WorkFlow/WorkflowNodeBase.vue` —— 节点基础组件样式补充
3. `src/ui/WorkFlow/WorkflowSelectionToolbar.vue` —— 选择状态工具栏
4. `src/ui/UIComponent/GlobalSideNav.vue` —— 隐藏动画编辑器导航项
5. `src/ui/UIComponent/PageTransitionOverlay.vue` —— 保留路由 label（以防崩溃）
6. `src/views/AIWorkflow/node-business/presentation/useAIWorkflowNodePresentation.ts` —— 紧凑节点尺寸计算
7. `src/views/AIWorkflow/AIWorkflowPage.vue` —— 紧凑节点模板

## 五、潜在风险与规避

| 风险 | 影响 | 规避 |
| --- | --- | --- |
| `backdrop-filter` 可能在部分老版本 Electron/Chromium 生效不稳定 | 节点背景视觉降级 | 使用 `-webkit-` 前缀，并有纯色背景 fallback |
| 紧凑节点的固定宽高（240×88）可能与原节点宽度不一致 | edge 连接点错位 | 在 compact 渲染模式下使用统一的锚点 offset（上下左右居中） |
| 节点类型图标色块需要从 `node.type` 映射到颜色 | 逻辑耦合 | 在 `useAIWorkflowNodePresentation.ts` 中导出 `compactNodeTypeColor(node)` |
| 隐藏动画编辑器入口后，用户可能通过 URL 直接访问 VideoStudio 路由 | 无功能影响 | 保留路由定义即可，功能模块暂不删除代码 |
| `Math.max(0.2, Math.min(6, zoom))` 的 clamp 在紧凑节点现在不被使用 | 避免 scale 导致视觉"缩小" | 紧凑节点仅依赖固定宽高，不做 transform scale |
