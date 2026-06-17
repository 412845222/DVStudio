# 蓝图底层

负责蓝图编辑器本体，不负责具体 AI 业务。

## 主要职责

1. viewport 与 world/screen 坐标转换。
2. selection、box-select、focus、hover。
3. edge index、edge geometry、边渲染输入。
4. 节点拖拽、缩放、连线拖拽、落点判断。
5. 节点可见性裁剪与性能采样。

## 当前可迁入候选

1. `useAIWorkflowViewport.ts` 已迁入
2. `useAIWorkflowSelectionState.ts` 已迁入
3. `useAIWorkflowNodeVisibility.ts` 已迁入
4. `useAIWorkflowEdgeIndex.ts` 已迁入
5. `useAIWorkflowEdgeRenderer.ts` 已迁入
6. `useAIWorkflowPerfMonitor.ts` 已迁入

## 下一批目标

1. `canvas-interaction/useAIWorkflowCanvasInteraction.ts` 已迁入
2. `linking/useAIWorkflowLinking.ts` 已迁入
3. 继续收拢节点移动与 resize 之外的画布事件协调。