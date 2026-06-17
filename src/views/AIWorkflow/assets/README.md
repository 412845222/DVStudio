# 资产管理

负责 AIWorkflow 的资源生命周期，不直接负责具体节点业务。

## 主要职责

1. 资源上传、导入、去重、绑定、清理。
2. object URL 生命周期。
3. 本地句柄恢复与项目恢复。
4. 外部资源项目内持久化。
5. poster、thumbnail、metadata 相关恢复。
6. 资源拖拽落图与预览落图。

## 当前可迁入候选

1. `useAIWorkflowAssetPersistence.ts` 已迁入
2. `useAIWorkflowObjectUrlRegistry.ts` 已迁入
3. `useAIWorkflowImportRecoveryState.ts` 已迁入
4. `useAIWorkflowNodeAssetBinding.ts` 已迁入
5. `useAIWorkflowBatchMediaImport.ts` 已迁入
6. `useAIWorkflowDropAssets.ts` 已迁入

## 下一批目标

1. 继续收敛 poster / package import 的 URL 回收策略。
2. 评估本地句柄恢复与导入 overlay 的进一步拆分边界。
3. 继续缩小页面侧 onCanvasDrop 对 Meshy / 文件 / Nano 分支路由的耦合。