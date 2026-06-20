# AI 工作流蓝图开发指引 (AI Workflow Guide)

## 1. 核心概念
- **Blueprint (蓝图)**: 整个工作流的载体，包含节点 (Nodes) 和连线 (Edges)。
- **Node (节点)**: 工作流中的基本单元，具有输入锚点 (Input Anchors) 和输出锚点 (Output Anchors)。
- **Resource (资源)**: 在节点间流转的数据实体（如图片、视频、文本）。

## 2. 节点开发规范
如果需要新增一种蓝图节点：
1. **定义数据结构**: 在 `src/aiworkflow/types.ts` 中定义节点的 Type 和 Data 接口。
2. **注册节点**: 在 `src/aiworkflow/nodeLibrary.ts` 中注册节点的元数据（名称、输入输出锚点定义）。
3. **开发 UI 组件**: 在 `src/ui/WorkFlow/WorlFlowNodes/` 下创建对应的 Vue 组件（继承或参考现有节点）。
4. **实现执行逻辑**: 如果节点需要本地执行逻辑，在 `src/aiworkflow/actions.ts` 或相关模块中实现。

## 3. ComfyUI 桥接
- 前端通过 `ComfyUIBridgeService.ts` 与 Django 后端的 `comfyui_bridge` 通信。
- 后端负责将请求转发给实际的 ComfyUI 服务，并处理跨域、任务队列等问题。
- 节点状态（排队中、执行中、完成、失败）需要实时同步到前端 Vuex 状态中。