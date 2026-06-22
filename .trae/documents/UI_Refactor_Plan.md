# UI 整体优化计划

目标：在项目列表页的科幻风 UI 基础上，将渐变背景和漂浮矩形方块粒子推广到全局，并重设计 AI 工作流蓝图节点面板的视觉与状态。

---

## 一、当前设计语言分析

### 1.1 已验证的好看设计（参考基准）

| 组件 | 所在文件 | 核心做法 |
|------|---------|---------|
| 左侧导航粒子 | `src/ui/UIComponent/GlobalSideNav.vue` | **DOM span** + `gsn-drift` 动画，`cubic-bezier(0.22, 0.61, 0.36, 1)`，缓慢向上漂移 + 180° 旋转，`box-shadow` 发光 |
| 页面切换粒子 | `src/ui/UIComponent/PageTransitionOverlay.vue` | **DOM span** + `pto-fall` 动画，从顶部下降 + 左右 `sway` 偏移 + 旋转，多色翡翠调色调色板 |
| 项目列表卡片 | `src/views/ProjectList.vue` + `src/styles/project-list.css` | 渐变玻璃底 + 四角 L 括号 + Hover 辉光层 + 节点 ID 徽标 + `text-shadow` 标题发光 |
| 项目列表背景 | `src/styles/project-list.css` `.pl-bg-container` | 深色渐变底 + HUD 网格 (`linear-gradient` 网格) + 3 个 `pl-bg-glow` 彩色矩形缓慢漂移 |

### 1.2 待改进的设计

| 组件 | 问题 |
|------|------|
| `src/composables/useCardParticles.ts` | **Canvas 粒子效果不理想**：汇聚/扩散的复杂粒子在小卡片上视觉杂乱，相比导航栏的简洁漂浮方块质感差 |
| AI 工作流节点 | `node-skins.css` 过于基础：只有玻璃底 + 边框，缺少状态区分度（无 Hover 辉光、无粒子、无装饰角标） |
| 页面背景 | 除了 ProjectList，AIWorkflowPage、VideoStudio、Settings 等页面都是 `bg-vscode`（纯深色），与 ProjectList 视觉不统一 |

---

## 二、设计语言统一规范（全局）

### 2.1 粒子系统统一：DOM 漂浮矩形方块

**废弃 Canvas 粒子系统**，改用 **DOM 方块 + CSS 动画**（与 GlobalSideNav 相同做法）：

- **视觉元素**：3~8px 的正方形/矩形，随机 rotation（0~45°），纯色 + `box-shadow` 发光
- **动画曲线**：统一 `cubic-bezier(0.22, 0.61, 0.36, 1)`
- **动画时长**：5s ~ 12s（根据容器尺寸动态）
- **动画内容**：缓慢向上/向下漂移 + 180° 旋转 + opacity 渐入渐出
- **数量**：小容器 4~6 个，大容器 8~12 个
- **颜色**：翡翠主色 `#1f9d84`、青绿 `#27b99c`、暖金 `#d9982b`、冷青 `#4fb7c5`（取自 theme-tokens.css 的 `--pl-` 系列）
- **无障碍**：检测 `prefers-reduced-motion`，开启时减少到 2 个，动画时长减半

### 2.2 背景层统一：全局渐变 + HUD 网格 + 漂移辉光

做成一个 **可复用背景组件**，注入到 App.vue 的 `app-content` 中：

- **底层**：`linear-gradient(135deg, #07090d 0%, #111a22 55%, #0c1418 100%)`（暗色主题）
- **网格层**：HUD 风格网格线，`rgba(31, 157, 132, 0.06)`，`background-size: 48px 48px`
- **辉光层**：2~3 个彩色矩形（翡翠/暖金/冷青），缓慢 `transform: translate()` + opacity 呼吸动画
- **扫描线**：顶部极细扫描线（可选，仅 ProjectList 开启）
- **位置**：`position: absolute; inset: 0; pointer-events: none; z-index: 0`
- **所有页面内容 z-index ≥ 1**

---

## 三、改动清单（按模块分组）

### 模块 A：全局背景层（高优先级）

**新增文件**：

1. `src/ui/UIComponent/GlobalPageBackground.vue` — 可复用背景组件
   - template：`<div class="gpb-container" aria-hidden="true">` + 渐变底 + 网格 + 辉光方块
   - script：支持 props `variant`（'project-list' | 'workflow' | 'studio' | 'default'），`gridSize`，`glowCount`
   - style scoped：定义 `gpb-bg` / `gpb-grid` / `gpb-glow` / `gpb-glow-1..3` 动画

2. `src/styles/global-page-background.css` — 全局背景的 CSS 变量与动画
   - 为暗色/亮色主题定义 `--gpb-bg-0` / `--gpb-bg-1` / `--gpb-accent` 等变量
   - 定义 `@keyframes gpb-drift-x`（水平漂移）、`@keyframes gpb-breath`（透明度呼吸）

**修改文件**：

3. `src/styles/theme-tokens.css` — 在 `[data-theme="dark"]` 和 `[data-theme="light"]` 区追加 `--gpb-` 系列变量
4. `src/App.vue` — 在 `app-content` 中插入 `<GlobalPageBackground />`，放在 `<router-view>` 之前
5. `src/views/ProjectList.vue` — 移除内部的 `pl-bg-container` DOM，改用 `GlobalPageBackground` 的 `variant="project-list"`（保留原有视觉）
6. `src/views/AIWorkflow/AIWorkflowPage.vue` — 移除 `bg-vscode` 类，节点容器需要 `position: relative` 使背景在下方

### 模块 B：粒子系统重构（高优先级）

**新增文件**：

7. `src/composables/useSquareParticles.ts` — 新一代 DOM 方块粒子 composable
   - 输入：`options: { count, palette, minSize, maxSize, animationName, hovered, reducedMotion }`
   - 输出：`particles: { id, style }[]` — 一个响应式数组，供模板 `v-for` 渲染 DOM span
   - 提供 `buildParticles(options)` 函数返回静态数组（用于一次性渲染的场景，如导航栏）
   - 提供 `onHover(hovered)` 控制 hover 状态（hovered true 时粒子更密更亮，opacity 从 ~0.35 → ~0.75）

**修改文件**：

8. `src/views/ProjectList.vue` — 将现有的 Canvas 粒子（`<canvas>` + `useCardParticles`）替换为 DOM 方块粒子（`useSquareParticles` 生成的 span 数组，嵌入 `.card-glow` 区域）
9. `src/ui/UIComponent/GlobalSideNav.vue` — 将粒子生成逻辑改为调用 `useSquareParticles`，保持现有视觉不变（验证统一后的效果一致）
10. `src/ui/UIComponent/PageTransitionOverlay.vue` — 将粒子生成逻辑改为调用 `useSquareParticles`，保留下落动画
11. `src/composables/useCardParticles.ts` — 标记为 deprecated（保留文件但不再引用，或者直接删除）

### 模块 C：AI 工作流蓝图节点面板重设计（最高优先级）

**新增文件**：

12. `src/styles/workflow/node-skins-refined.css` — 节点新视觉样式（或者直接在 `node-skins.css` 上修改，推荐直接修改以保持引用链简单）
    - **节点外壳 `.wf-node`**：
      - 玻璃底 + 内阴影顶部高光（`inset 0 1px 0 rgba(255,255,255,0.06)`）
      - border: 1px，默认 `rgba(31, 157, 132, 0.22)`，用 `color-mix`
      - 四角 L 括号装饰（与 ProjectList 卡片相同做法）：`.wf-node::before`（左上+右下）/ `.wf-node::after`（右上+左下），hover/selected 时变亮
      - 内部粒子层：`.wf-node-particles`（DOM 方块，`useSquareParticles`），默认不可见，hover/selected/running 时可见
    - **选中状态 `.wf-node.is-primary-selected`**：
      - 边框 + glow：翡翠主色 `#1f9d84`
      - box-shadow：`0 0 0 1px rgba(31, 157, 132, 0.45) + 0 0 22px rgba(31, 157, 132, 0.18)`
      - 粒子层启用，中等密度（6~8 个），慢速漂移
    - **运行状态 `.wf-node.wf-node-running`**：
      - 边框 + glow：暖金 `#d9982b`
      - box-shadow：`0 0 0 1px rgba(217, 152, 43, 0.5) + 0 0 28px rgba(217, 152, 43, 0.22)`
      - 粒子层启用，高密度（10~12 个），**快速漂移**（体现"在运行"）
      - 可选：边框 pulse 动画（`@keyframes wf-running-pulse`）
    - **错误状态 `.wf-node.wf-node-error`**：
      - 边框 + glow：暗红 `#cf5a46`
      - 粒子层启用，暗红/暖金混合粒子
    - **次选中状态 `.wf-node.is-secondary-selected`**：
      - 边框亮度 56%（保持原有语义），不显示粒子层
    - **节点 ID 徽标**：`.wf-node-id` — 等宽字体，`#0001` 风格，右上角小标签
    - **锚点 `.wf-anchor`**：保持现有风格，但 hover 时增加发光（`box-shadow: 0 0 8px rgba(31, 157, 132, 0.5)`）

**修改文件**：

13. `src/styles/workflow/node-skins.css` — 按上面的设计重写
14. `src/views/AIWorkflow/AIWorkflowPage.vue` — 在节点 host 模板中：
    - 为每个节点内部插入粒子层 DOM（由 `useSquareParticles` 生成）
    - 插入四角 L 括号装饰层
    - 插入节点 ID 徽标
    - 根据节点状态（`selectedNodeIds.includes(node.id)`、`isRunning` 等）切换粒子层的可见性与密度
    - 注意：需要同时适配 full node 和 compact node（compact node 保留简化视觉，不显示粒子层）

15. `src/views/AIWorkflow/blueprint-core/useAIWorkflowNodeVisibility.ts` — 可选：为 compact node 增加轻微视觉点缀（如边框颜色微调整），但不改其核心逻辑

### 模块 D：节点运行/错误状态的精确判定（中优先级）

16. 检查 AIWorkflow store 中是否已有 `isRunning` / `isError` 的计算状态
    - 如无，在 `useAIWorkflowNodeActions.ts` 或相关 composable 中补全，使节点模板能方便读取 `:class="{ 'wf-node-running': nodeIsRunning, 'wf-node-error': nodeIsError }"`

---

## 四、实施顺序

1. **阶段 1（背景）**：A 模块 — 全局背景组件 + 变量 + 注入 App.vue，保证所有页面一致
2. **阶段 2（粒子）**：B 模块 — 编写 `useSquareParticles`，替换 ProjectList 的 Canvas 粒子，验证效果
3. **阶段 3（节点）**：C 模块 — 重写 `node-skins.css`，在 AIWorkflowPage 节点模板中注入粒子层与装饰层
4. **阶段 4（状态）**：D 模块 — 补全 running/error 状态判定与粒子密度切换

---

## 五、风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| DOM 粒子在蓝图中有 50+ 节点时性能问题 | 帧率下降 | ① 仅 selected/running 节点显示粒子（默认隐藏）；② 使用 CSS `will-change: transform`；③ compact node 不显示；④ 检测 viewport 缩放，zoom < 0.5 时全局隐藏粒子层 |
| GlobalPageBackground 与 AIWorkflowPage 的 Three.js 画布冲突 | 被 Three.js 覆盖 | 确保 Three.js renderer 有 `alpha: true` 且画布 `z-index` 高于背景层但低于节点 |
| 项目列表页原有的独特视觉被"通用化"后失去个性 | 识别度降低 | 通过 `variant="project-list"` 参数保留原有的特殊辉光颜色与密度，工作流页面用更低调的颜色 |
| 亮色主题下翡翠色对比不足 | 可访问性问题 | `--gpb-` 变量在亮色模式下用更深的色调（如 `#0f7d69`），网格线透明度提升到 `0.08` |
| `node-skins.css` 中大量 `!important` 与新样式冲突 | 样式覆盖不可控 | 保留 `!important` 前缀，但将规则改为更具体的选择器（如 `.aiwf-page .wf-node`）以保证优先级 |

---

## 六、验证清单

- [ ] ProjectList 页面的背景、卡片、粒子与之前一致（视觉回归）
- [ ] AIWorkflow 页面背景变为渐变 + 网格 + 辉光漂移，节点可见
- [ ] 节点 Hover：边框变亮、L 括号变亮、浅粒子出现
- [ ] 节点 Selected：翡翠色边框 + 辉光 + 中密度粒子
- [ ] 节点 Running：暖金色边框 + 辉光 + 高密度快速粒子
- [ ] 节点 Error：暗红色边框 + 辉光 + 暗红粒子
- [ ] 节点 Compact：不显示粒子层，保持简洁
- [ ] VideoStudio / Settings 页面背景与全局一致
- [ ] 开启 `prefers-reduced-motion`：粒子密度减半，动画速度显著降低
- [ ] 深色/亮色主题切换正常
- [ ] 导航栏/页面切换的粒子视觉保持一致或更佳
- [ ] 节点多时（50+）缩放/拖拽帧率稳定（60fps 或可接受）
