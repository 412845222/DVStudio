# 各节点业务

负责具体节点域与稳定业务域，不负责通用资源生命周期和通用调度。

## 主要子域

1. Meshy
2. Scene
3. ComfyUI
4. Unreal
5. Chat
6. Project

## 当前可迁入候选

1. `meshy/useAIWorkflowMeshyAssets.ts` 已迁入
2. `presentation/useAIWorkflowNodePresentation.ts` 已迁入
3. `meshy/useAIWorkflowMeshyDrop.ts` 已迁入
4. `meshy/useAIWorkflowMeshyCommands.ts` 已迁入
5. `meshy/useAIWorkflowMeshyRuntime.ts` 已迁入
6. `meshy/useAIWorkflowMeshyRequest.ts` 已迁入
7. `meshy/useAIWorkflowMeshyTaskPanelMapping.ts` 已迁入
8. `meshy/useAIWorkflowMeshyTaskPanelController.ts` 已迁入
9. `meshy/useAIWorkflowMeshyInputResolver.ts` 已迁入
10. `scene/useAIWorkflowSceneUnderstandingController.ts` 已迁入
11. `scene/useAIWorkflowSceneDecomposeController.ts` 已迁入
12. `scene/sceneDecomposeShared.ts` 已迁入

## 下一批目标

1. 继续把页面壳中的 Meshy 剩余面板/预览链路拆出域边界。
2. 推进 `project/` 子域的落地。
3. 让页面模板只绑定域接口，而不是直接绑定长函数。
