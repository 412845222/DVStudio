# 前端开发指引 (Frontend Guide)

## 1. 技术栈
- **框架**: Vue 3 (Composition API, `<script setup>`)
- **语言**: TypeScript
- **状态管理**: Vuex 4
- **构建工具**: Vite
- **渲染引擎**: 自研 WebGL2 引擎 (`src/engine/`)

## 2. 组件开发规范
- 优先使用 `<script setup lang="ts">`。
- 样式使用 scoped CSS，或引入全局的 CSS 变量 (`src/styles/`)。
- 复杂组件应拆分为逻辑 (Composable/Hook) 和视图 (Template)。

## 3. 状态管理 (Vuex)
- 状态按模块划分：`aiworkflow`, `timeline`, `videoscene`, `videostudio`。
- **严禁**在组件中直接修改 Vuex state，必须通过 Mutation。
- 复杂的异步逻辑或多 Mutation 组合应放在 Action 中。

## 4. WebGL2 渲染引擎 (`src/engine/`)
- **架构**: 采用类似场景图 (Scene Graph) 的结构。
- **节点**: `NodeBase` 及其子类 (`RectNode`, `TextNode`, `ImageNode` 等)。
- **渲染器**: 每个节点类型对应一个 Renderer (`RectRenderer`, `TextRenderer` 等)。
- **修改指南**: 如果需要新增节点类型，必须同时实现对应的 Node 数据结构和 Renderer 渲染逻辑，并在 `src/core/scene/nodesType/` 中注册。

## 5. AI 工作流蓝图 (`src/ui/WorkFlow/`)
- 节点 UI 组件继承自 `WorkflowNodeBase.vue`。
- 连线逻辑和画布交互由 `BlueprintCanvas.vue` 和 `WorkflowEdgeLayer.vue` 处理。