# Plan: 节点锚点与AI对话组件科幻风格改造

## Summary

对 AI 工作流蓝图页面中三个组件进行统一科幻风格改造：
1. 节点锚点（圆形→方形，含磁吸附时的阻尼旋转效果）
2. 节点底部对话弹窗与参数面板（L括号装饰，翡翠辉光）
3. AI对话底部 Dock 按钮和对话面板（翡翠辉光边框，玻璃拟态背景）

## Current State Analysis

### 1. 节点锚点 (`WorkflowNodeBase.vue`)

- 锚点容器 `.wf-anchor-hit` 为透明框，包含两个子元素
- `.wf-anchor-hit::before` —— 内圆，8px，`border-radius: 50%`，颜色跟随类型（text=琥珀, image=蓝, video=绿, model3d=紫, flow=橙）
- `.wf-anchor-hit::after` —— 外框，22px，`border-radius: 50%`，`border: 1px solid var(--wf-node-anchor-border)`
- 磁吸附状态 `data-magnet-phase`：armed/dragging/snapped/release，通过改变 transform scale 来做呼吸效果
- Hover 状态：hover 时 `border-color: var(--wf-node-anchor-hover)` + 外辉光 `drop-shadow`
- 节点外的 `.wf-anchor-hit` 位于 `src/ui/WorkFlow/WorkflowNodeBase.vue` 的模板中（~L40-250）
- 节点外单独的 `nano-ref-dot` 也在 `BottomChatDock.vue` 中用于参考图锚点，样式同样是圆形

### 2. 节点底部对话弹窗 (`NodeChatDialog.vue`, `NodeChatParamPanel.vue`, `NodeChatInput.vue`)

- `NodeChatDialog.vue`（L1-654）：
  - `.bp-node-chat-dialog` —— 绝对定位，位于节点下方，宽度最大 420px
  - `.bp-node-chat-surface` —— `border: 1px solid var(--wf-border)` + `border-radius: 0` + `box-shadow: 0 8px 32px color-mix(...)`
  - `.bp-node-chat-header` —— 44px 头部，标题区含 icon + 文字，右侧关闭按钮
  - `.bp-node-chat-body` —— 主体区域，含参数引用列表 + 输入框
  - `.bp-node-chat-footer` —— 按钮区域，左侧辅助按钮，右侧发送/参数按钮
  - `.bp-node-chat-btn-primary` —— 主按钮，背景 `var(--wf-primary)`，按节点类型换色（text=琥珀, image=蓝, video=绿, model3d=紫）
  - `.bp-node-chat-param-popover` —— 参数面板弹窗，独立定位在对话框下方

- `NodeChatParamPanel.vue`（路径：`src/ui/BluePrint/node-dialog/`）：参数设置弹窗，含多个参数输入项
- `NodeChatInput.vue`：多行文本输入组件，含 placeholder、自适应高度

### 3. AI 对话 Dock (`BottomChatDock.vue`)

- `chat-dock` —— 主容器，两种模式：
  - **bottom 模式**（L1428-1445）：居中，最小化在下方
  - **right-drawer 模式**（L1446-1486）：右侧抽屉式，占用整高，可拖拽
- 关键元素：
  - `.chat-collapsed-handle` —— 最小化状态的点击按钮（"AI 对话"）
  - `.chat-content` —— 展开状态的内容容器
  - `.chat-history-bar` —— 标题栏，含 tab 切换、最小化/放大按钮
  - `.chat-panel-tab` —— "常规"/"Agent对话" tab
  - `.chat-history-body` —— 对话消息列表
  - `.chat-dock-footer` —— 底部输入区（输入框 + 发送按钮）
  - `.chat-dock-input` —— 输入框，`border: 1px solid var(--vscode-border)`
  - `.chat-dock-send` —— 发送按钮
  - `.chat-dock-toolbar-item / chat-dock-toolbar-item-model / chat-dock-toolbar-item-mini` —— 工具栏元素
  - `.chat-msg` —— 消息项（user/assistant/system）

## Proposed Changes

### 改造原则

1. 统一翡翠色（`--theme-accent: #1f9d84` / `--wf-primary: #1f9d84`）为主色调
2. 边框圆角 `0` / `2px`，加 1px 辉光边框 + 外发光阴影
3. 玻璃拟态背景（`backdrop-filter: blur` + 半透明深色底）
4. L 括号装饰（节点对话/Dock 面板的四角）
5. 顶部标题行使用翡翠色 `text-shadow: 0 0 8px` 光晕
6. 阻尼旋转效果（仅锚点）：通过 CSS `transform: rotate()` + cubic-bezier 缓动

---

### 变更 1：节点锚点样式 `src/ui/WorkFlow/WorkflowNodeBase.vue`

#### 1a. 基础样式改造（`<style scoped>` L~1014-1145）

| 原选择器 | 改造后样式要点 |
|---|---|
| `.wf-anchor-hit` | 保持透明容器，`border-radius: 0` |
| `.wf-anchor-hit::before` —— 内圆 | 改为方形：`width: 8px; height: 8px; border-radius: 2px;` 保留颜色映射，但加 `box-shadow: 0 0 6px color-mix(in srgb, currentColor 55%, transparent)` 发光 |
| `.wf-anchor-hit::after` —— 外框 | 改为方形：`width: 24px; height: 24px; border-radius: 2px;` `border: 1px solid color-mix(in srgb, var(--wf-node-anchor-border) 80%, transparent); background: color-mix(in srgb, var(--wf-node-anchor-bg) 90%, transparent)` |
| `.wf-anchor-hit[data-magnet-phase="armed"]::after` | 加 `box-shadow: 0 0 0 4px color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent), 0 0 14px color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent)` |
| `.wf-anchor-hit[data-magnet-phase="dragging"]::after` | 加 `transform: translate(-50%, -50%) scale(1.12); border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 80%, transparent)` 强辉光 |
| `.wf-anchor-hit[data-magnet-phase="snapped"]::after` | 最大辉光：`transform: translate(-50%, -50%) scale(1.18); border-color: var(--wf-primary, #1f9d84); box-shadow: 0 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 28%, transparent), 0 0 22px var(--wf-primary, #1f9d84)` |
| `.wf-anchor-hit:hover::after` | 悬浮时 `border-color: var(--wf-primary, #1f9d84); box-shadow: 0 0 0 3px color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent)` |

#### 1b. 阻尼旋转动画（新增）

为方形锚点添加角度阻尼动画，让吸附时有旋转对齐感：

```css
/* 在 <style scoped> 末尾追加 */

/* 阻尼旋转：snapped 时旋转 90°，hover 时微旋 2°，使用 cubic-bezier 实现阻尼感 */
.wf-anchor-hit::before,
.wf-anchor-hit::after {
  transform-origin: 50% 50%;
  transition:
    transform 360ms cubic-bezier(0.22, 0.8, 0.25, 1.05),
    border-color 220ms ease,
    box-shadow 220ms ease,
    background-color 220ms ease;
}

.wf-anchor-hit:hover::before {
  transform: translate(-50%, -50%) rotate(3deg);
}
.wf-anchor-hit:hover::after {
  transform: translate(-50%, -50%) scale(1.08) rotate(-2deg);
}

.wf-anchor-hit[data-magnet-phase="armed"]::before {
  transform: translate(-50%, -50%) scale(1.08) rotate(15deg);
}
.wf-anchor-hit[data-magnet-phase="dragging"]::before {
  transform: translate(-50%, -50%) scale(1.14) rotate(45deg);
  animation: wf-anchor-drag-pulse 0.9s cubic-bezier(0.22, 0.8, 0.25, 1.05) infinite;
}
.wf-anchor-hit[data-magnet-phase="snapped"]::before {
  transform: translate(-50%, -50%) scale(1.2) rotate(90deg);
  animation: wf-anchor-snap-glow 0.6s cubic-bezier(0.22, 0.8, 0.25, 1.05);
}
.wf-anchor-hit[data-magnet-phase="release"]::before {
  transform: translate(-50%, -50%) scale(1) rotate(0deg);
}

@keyframes wf-anchor-drag-pulse {
  0%   { transform: translate(-50%, -50%) scale(1.14) rotate(30deg); opacity: 0.85; }
  50%  { transform: translate(-50%, -50%) scale(1.2) rotate(60deg); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1.14) rotate(90deg); opacity: 0.85; }
}

@keyframes wf-anchor-snap-glow {
  0%   { transform: translate(-50%, -50%) scale(1.3) rotate(120deg); box-shadow: 0 0 0 2px var(--wf-primary, #1f9d84); }
  40%  { transform: translate(-50%, -50%) scale(1.22) rotate(95deg); box-shadow: 0 0 0 4px color-mix(in srgb, var(--wf-primary, #1f9d84) 60%, transparent), 0 0 14px var(--wf-primary, #1f9d84); }
  100% { transform: translate(-50%, -50%) scale(1.18) rotate(90deg); }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .wf-anchor-hit::before,
  .wf-anchor-hit::after {
    transition: none !important;
    animation: none !important;
  }
}
```

#### 1c. `node-skins.css` 中的锚点样式修正

`src/styles/workflow/node-skins.css` L185-227 的 `.wf-node-anchor` 系列规则用于节点自身显示的锚点样式（可能与 WorkflowNodeBase 的样式叠加），需要同步改造：
- 所有 `border-radius: 50%` 改为 `border-radius: 2px`
- 颜色从硬编码改为 `--wf-primary` 变量
- 添加与 1a 相同的辉光效果

---

### 变更 2：节点底部对话弹窗 `src/ui/BluePrint/node-dialog/NodeChatDialog.vue`

#### 2a. 模板改造

在 `.bp-node-chat-dialog` 根元素上添加 4 个 L 括号装饰：
```html
<span class="bp-dialog-bracket bp-dialog-bracket-tl" aria-hidden="true"></span>
<span class="bp-dialog-bracket bp-dialog-bracket-tr" aria-hidden="true"></span>
<span class="bp-dialog-bracket bp-dialog-bracket-bl" aria-hidden="true"></span>
<span class="bp-dialog-bracket bp-dialog-bracket-br" aria-hidden="true"></span>
```

#### 2b. 样式改造（`<style scoped>` L324-654）

| 原选择器 | 改造后样式要点 |
|---|---|
| `.bp-node-chat-dialog` | 加 `position: relative` |
| `.bp-node-chat-surface` | `border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 60%, transparent);` + 顶部脉冲边（`::before`） + `box-shadow: 0 0 0 1px color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent), 0 0 22px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent), 0 12px 32px rgba(0, 0, 0, 0.42)` |
| `.bp-node-chat-header` | `border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);` + 标题 `text-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent)` |
| `.bp-node-chat-title` | `font-weight: 700` + 翡翠色文字阴影 |
| `.bp-node-chat-close` | `border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);` + `border-radius: 2px;` hover 时 `border-color: var(--wf-primary); color: var(--wf-primary); box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent)` |
| `.bp-node-chat-body` | 加左侧翡翠色渐变竖条装饰 |
| `.bp-node-chat-param-ref-item` | `border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);` + `border-radius: 2px;` hover 时 `border-color: var(--wf-primary, #1f9d84); box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 28%, transparent)` |
| `.bp-node-chat-param-ref-icon` | `border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent); border-radius: 2px; background: color-mix(in srgb, var(--wf-surface-base) 92%, transparent)` |
| `.bp-node-chat-footer` | `border-top: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);` |
| `.bp-node-chat-btn-secondary` | `border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent); border-radius: 2px; background: transparent;` hover 时 `color: var(--wf-primary); border-color: var(--wf-primary); box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 32%, transparent)` |
| `.bp-node-chat-btn-primary` | `border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 65%, transparent); border-radius: 2px; background: color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent); color: var(--wf-primary, #1f9d84); box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent)` hover 时 `box-shadow: 0 0 14px color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent)` |
| `.bp-node-chat-param-popover` | `border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);` + `box-shadow: 0 0 0 1px color-mix(in srgb, var(--wf-primary, #1f9d84) 18%, transparent), 0 0 22px color-mix(in srgb, var(--wf-primary, #1f9d84) 28%, transparent), 0 18px 36px rgba(0, 0, 0, 0.42)` + 四角 L 括号装饰 |
| `.bp-dialog-bracket-*`（新增） | 4 个 L 括号装饰，`position: absolute` + `width/height: 10px; border: 1.5px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent)` |

**注意**：按节点类型的颜色变体（`bp-node-chat-image/video/text/model3d`）保留其 type 的颜色指示，但在 `border/box-shadow` 上保持翡翠色主导。

---

### 变更 3：节点参数输入 `src/ui/BluePrint/node-dialog/NodeChatInput.vue`

#### 3a. 模板检查

阅读该组件的 template 与 style，确认是否有 `textarea` 等输入元素需要改造边框/背景

#### 3b. 样式改造要点

- textarea：`border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent)` + `background: color-mix(in srgb, var(--wf-surface-base) 90%, transparent)` + `border-radius: 2px` + `color: var(--wf-text, #edf2f4)`
- focus 状态：`border-color: var(--wf-primary, #1f9d84); box-shadow: 0 0 0 2px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent), 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent)`
- placeholder：`color: color-mix(in srgb, var(--wf-text-muted, #aeb8bd) 55%, transparent)`

---

### 变更 4：节点参数面板 `src/ui/BluePrint/node-dialog/NodeChatParamPanel.vue`

#### 4a. 模板检查

阅读该组件的 template 与 style（检查参数项、label、input、select 等）

#### 4b. 样式改造要点

- 面板根：`border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 50%, transparent); border-radius: 2px; background: var(--wf-surface-base); box-shadow: 0 0 0 1px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent), 0 0 18px color-mix(in srgb, var(--wf-primary, #1f9d84) 28%, transparent)`
- 参数项 label：`color: var(--wf-primary, #1f9d84); text-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent)`
- select/number 输入框：`border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent); border-radius: 2px; background: color-mix(in srgb, var(--wf-surface-raised) 92%, transparent); color: var(--wf-text, #edf2f4)`
- focus 状态同上（翡翠色辉光）

---

### 变更 5：AI 对话底部 Dock `src/ui/UIComponent/BottomChatDock.vue`

#### 5a. 模板调整

在 `.chat-dock` 根 div 内部加 L 括号装饰：
```html
<span class="chat-dock-bracket chat-dock-bracket-tl" aria-hidden="true"></span>
<span class="chat-dock-bracket chat-dock-bracket-tr" aria-hidden="true"></span>
<span class="chat-dock-bracket chat-dock-bracket-bl" aria-hidden="true"></span>
<span class="chat-dock-bracket chat-dock-bracket-br" aria-hidden="true"></span>
```

#### 5b. 样式改造（`<style scoped>` L1427-2587）

| 原选择器 | 改造后样式要点 |
|---|---|
| `.chat-dock` | `border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent); background: color-mix(in srgb, var(--wf-surface-base, rgba(29,34,39,0.9)) 96%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent), 0 0 22px color-mix(in srgb, var(--wf-primary, #1f9d84) 28%, transparent), 0 14px 36px rgba(0, 0, 0, 0.4)` + `backdrop-filter: blur(14px) saturate(140%); -webkit-backdrop-filter: blur(14px) saturate(140%)` |
| `.chat-dock:hover` | `border-color: var(--wf-primary, #1f9d84)` |
| `.chat-collapsed-handle` | `border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent); background: color-mix(in srgb, var(--wf-surface-base) 90%, transparent); color: var(--wf-primary, #1f9d84); box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 28%, transparent)` hover 时 `box-shadow: 0 0 16px color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent); border-color: var(--wf-primary, #1f9d84)` |
| `.chat-history-bar` | `border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 28%, transparent)` |
| `.chat-panel-tab` | `border: 1px solid transparent; border-radius: 2px; color: color-mix(in srgb, var(--wf-text-muted) 85%, transparent)` hover 时 `border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent); background: color-mix(in srgb, var(--wf-primary, #1f9d84) 12%, transparent); color: var(--wf-primary, #1f9d84)` |
| `.chat-panel-tab.active` | `border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 60%, transparent); background: color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent); color: var(--wf-primary, #1f9d84); box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent); text-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 50%, transparent)` |
| `.chat-history-expand`, `.chat-history-minimize` | `border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent); border-radius: 2px; background: transparent; color: var(--wf-text-muted, #aeb8bd)` hover 时 `border-color: var(--wf-primary); color: var(--wf-primary); box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent)` |
| `.chat-msg-bubble` | `border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent); border-radius: 2px; background: color-mix(in srgb, var(--wf-surface-base) 92%, transparent);` |
| `.chat-msg.user .chat-msg-bubble` | `border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent); background: color-mix(in srgb, var(--wf-primary, #1f9d84) 12%, transparent); color: var(--wf-primary, #1f9d84)` |
| `.chat-msg.assistant .chat-msg-bubble` | `border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent); color: var(--wf-text, #edf2f4)` |
| `.chat-dock-toolbar-select` | `border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent); border-radius: 2px; background: color-mix(in srgb, var(--wf-surface-base) 88%, transparent); color: var(--wf-text, #edf2f4)` focus 时辉光 |
| `.chat-dock-input` | `border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent); border-radius: 2px; background: color-mix(in srgb, var(--wf-surface-base) 88%, transparent); color: var(--wf-text, #edf2f4)` focus 时辉光 |
| `.chat-dock-send` | `border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 60%, transparent); border-radius: 2px; background: color-mix(in srgb, var(--wf-primary, #1f9d84) 28%, transparent); color: var(--wf-primary, #1f9d84); box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent)` hover 时 `box-shadow: 0 0 16px color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent); border-color: var(--wf-primary)` |
| `.chat-dock-bracket-*`（新增） | 4 个 L 括号装饰，`position: absolute` + 翡翠色边框 |
| `.nano-anchor-item` | 悬浮状态 `border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent); background: color-mix(in srgb, var(--wf-primary, #1f9d84) 12%, transparent); box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 28%, transparent)` |

---

## Assumptions & Decisions

1. **锚点从圆形改为方形**：`border-radius: 50%` → `2px`，让每个输入/输出连接点看起来更像"接口接口插槽"
2. **阻尼旋转的实现**：纯 CSS 动画（`transform: rotate()` + `cubic-bezier`），在 hover / magnet 状态下触发不同角度；不依赖 JS 计算 —— 由现有 `data-magnet-phase` attribute 驱动
3. **颜色系统**：全部使用 `--wf-primary` / `--theme-accent` = 翡翠色 `#1f9d84`，不引入新 CSS 变量
4. **节点类型颜色差异**：保留现有 `bp-node-chat-<type>` 变体的节点类型色调，但仅用于标签/标题等小点缀，主边框统一为翡翠色
5. **Dock 的 right-drawer 模式**：保持右侧抽屉布局逻辑不变，只改样式
6. **Reduced motion fallback**：所有新增动画都有 `@media (prefers-reduced-motion: reduce)` 降级

## Verification Steps

1. **锚点**：在蓝图页面拖动一个节点的输出连接到另一节点的输入
   - 圆形点已变为方形
   - Hover 节点边缘的锚点：有辉光和轻微旋转（hover-effect）
   - 连接过程中：拖拽时旋转 45°，吸附到目标时有 "snap" 旋转动画
   - 断开后回到默认状态

2. **节点底部对话弹窗**：点击一个图像/文本节点
   - 弹窗有四角 L 括号装饰
   - 顶部有翡翠色脉冲线
   - 标题文字有发光效果
   - 输入框 focus 时边框辉光
   - 主按钮 hover 时强化辉光
   - 参数按钮打开的参数面板也有同款辉光效果

3. **AI 对话 Dock**：
   - 底部中央的 Dock 面板整体边框是翡翠色辉光
   - Tab 切换有 active 辉光效果
   - 输入框 focus 时辉光
   - 发送按钮 hover 时有强辉光
   - 最小化的 "AI 对话" 按钮也是翡翠色科幻风
   - right-drawer 模式（右侧展开）下的视觉效果同样一致

4. **Reduced motion 测试**：
   - 在浏览器中开启 `prefers-reduced-motion`（Chrome DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion"）
   - 所有动画都应立即停在目标状态，无中间过渡动画

5. **暗色主题下的一致性**：
   - 所有使用的 CSS 变量在 dark theme 中均已定义
   - 面板在暗背景 + 蓝/绿背景（AIWorkflowPage 默认渐变背景）下都有清晰对比
