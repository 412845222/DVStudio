# AIWorkflow 目录结构

当前 AIWorkflow 采用“页面壳 + 六层主架构”的组织方式。

## 根目录原则

1. `AIWorkflowPage.vue` 只做页面总装配。
2. 六层目录是后续新增代码的默认落点。
3. `composables/` 当前仅保留为空兼容目录，不再默认新增业务文件。

## 六层入口

1. `blueprint-core/`：蓝图编辑器底层交互。
2. `assets/`：资源生命周期、节点资源绑定、项目内持久化。
3. `node-business/`：Meshy、Scene、ComfyUI、Unreal、聊天、项目域。
4. `bridge/`：浏览器/Electron/组件事件桥接。
5. `network/`：面向 AIWorkflow 的 API/stream 适配。
6. `concurrency/`：队列、轮询、取消、重试、进度汇总。

## 当前迁移规则

1. 不再默认向 `composables/` 新增业务域文件。
2. 具体业务实现优先放到对应层，而不是先写进页面壳。
3. 临时兼容文件如暂留 `composables/`，必须有明确目标迁移层。
4. 当前 `composables/` 已清空，不再作为任何新代码的落点。