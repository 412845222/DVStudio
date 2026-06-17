# 网络层

负责 AIWorkflow 视角的接口适配，不直接持有 Vue 页面状态。

## 主要职责

1. 工作流专用 API 入口。
2. stream 请求与错误归一化。
3. 对现有 `src/network` 服务做工作流语义适配。

## 当前外部依赖

1. `ComfyUIBridgeService.ts`
2. `SceneSkillService.ts`
3. `UnrealExportService.ts`
4. 项目保存与加载相关服务

## 下一批目标

1. 建立统一 adapter 入口。
2. 统一 stream 错误和空结果语义。
3. 避免页面壳直接拼装网络参数。