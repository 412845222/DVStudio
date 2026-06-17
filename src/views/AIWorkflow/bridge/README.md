# 底层桥

负责环境适配与事件转译，不是杂物层。

## 主要职责

1. 浏览器与 Electron 环境桥接。
2. 文件句柄与拖放数据转译。
3. 组件事件到领域命令的桥接。
4. 页面 overlay 状态到任务状态的桥接。

## 下一批目标

1. `component-events/useAIWorkflowContextMenu.ts` 已迁入
2. `feedback/useAIWorkflowToastState.ts` 已迁入
3. 抽离 drag/drop 数据解析桥。
4. 抽离本地文件句柄恢复桥。
5. 继续抽离组件事件协议适配层。