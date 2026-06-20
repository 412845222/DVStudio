# 全仓开发边界与规范 (Development Boundaries)

⚠️ **作为 AI Agent，在进行代码修改时，请严格遵守以下边界与规范。**

## 1. 前后端职责边界
- **前端 (Vue/WebGL)**: 
  - 负责所有 UI 渲染、动画插值、画布交互。
  - **禁止**在前端直接调用外部 AI 厂商的 API（如 DeepSeek/OpenAI），必须通过 Django 后端代理，以保护 API Key 并解决跨域问题。
- **后端 (Django)**:
  - 负责 API 代理、数据持久化（SQLite）、复杂文本/结构化数据处理。
  - **禁止**在后端处理与 UI 渲染强相关的逻辑（如计算具体的像素坐标），后端只应提供结构化的意图或数据。

## 2. 状态管理边界
- **Vuex vs 组件内部状态**:
  - 全局共享状态（如当前选中的节点、时间轴播放状态、蓝图节点列表）必须放在 Vuex 中。
  - 仅在单个组件内使用的状态（如弹窗的开关、表单的临时输入）使用 `ref` 或 `reactive` 放在组件内部。
- **持久化**:
  - 需要跨会话保存的数据，应通过 Electron API 写入本地文件，或通过 Django API 存入数据库。

## 3. 代码风格与规范
- **TypeScript**: 尽量避免使用 `any`，为所有核心数据结构定义 `interface` 或 `type`。
- **Vue 3**: 统一使用 Composition API (`<script setup>`)，避免使用 Options API。
- **Python**: 遵循 PEP 8 规范，使用 Type Hints 增加代码可读性。
- **命名规范**:
  - 文件名: Vue 组件使用 PascalCase (`MyComponent.vue`)，TS/JS 文件使用 camelCase (`myUtils.ts`)，Python 文件使用 snake_case (`my_module.py`)。

## 4. 破坏性修改警告
- 在修改 `src/engine/` (WebGL2 渲染引擎) 或 `src/core/` (核心数据结构) 时，必须极其谨慎，因为这可能导致整个编辑器崩溃或历史项目无法打开。
- 在修改前，请确保理解现有的数据流转机制，并尽量保持向后兼容。