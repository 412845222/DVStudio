# 并发层

负责任务调度与运行时控制，不负责业务字段拼装。

## 主要职责

1. 队列。
2. 轮询。
3. 取消、超时、重试。
4. 节流与并发控制。
5. 进度聚合。

## 当前可复用候选

1. `MediaResourceImportManager.ts`
2. `VideoMetadataReadQueue.ts`
3. 批量导入编排已由 `assets/useAIWorkflowBatchMediaImport.ts` 调用这些队列能力，页面不再直接展开 worker 回调细节。

## 下一批目标

1. 抽离导入队列与 metadata 队列适配。
2. 收敛 Meshy、ComfyUI、Unreal 等轮询运行时。
3. 把 timer/map/retry 逻辑从页面壳搬离。
