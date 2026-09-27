# ComfyUI 模板识别、输入驱动与恢复

本说明对应 2026-09 的 ComfyUI 增量修复。图形底座、蓝图几何状态、全应用数据根目录不变。

## 用户入口

- 节点“刷新模板与成功历史 / 我已运行”重新读取保存文件与成功历史。
- 同一模板只变化注册版本元数据、节点位置或连线数组顺序时，允许语义匹配。模型、提示词、有效连线或未知扩展属性变化仍视为不同版本。
- 文件为空、损坏或无法关联时，面板提供成功历史候选。用户明确选择后切换为 `history://promptId`，不会把另一条历史静默拼接到原文件。
- “重新解析”保留已归档快照。归档失败会单独提示，在线成功不代表已可靠备份。
- 默认保留模板 seed；节点可勾选“每次运行随机种子”。
- 提交超时不自动重发。再次运行先查队列/历史；找不到时需要用户确认后重试，防止重复任务。

## 换目录安装或迁移服务地址

在节点“管理本地模板”中：

1. 旧安装导出恢复包，保存到安装目录外。
2. 新安装配置服务地址，导入恢复包并确认目标服务。
3. 刷新模板与成功历史，选择所需快照并检查依赖。

也可以使用“从旧安装恢复”选择旧 `DVSResource/BackendData/localdb.sqlite3`。此入口只读取 Comfy 快照与本地模板，不迁移其他业务表、密钥或全应用数据根。旧库直接恢复按当前服务地址寻找快照；地址也改变时，优先使用旧安装导出的恢复包。

恢复包包含模板内容，请按项目资料保管；常见凭证字段会阻止导出。包不包含图片、视频、模型、自定义节点和蓝图边绑定。蓝图项目仍应走原项目保存/备份机制；媒体与模型需要另外保留。跨服务导入不能补齐缺失依赖。

导入使用内容校验和、快照 hash、事务及当前库备份；同 ID 不同内容会取消整个导入，重复导入不会重复新增。LocalDB v18 仅新增 `comfyui_profiles`，v17 归档继续可读；不删除旧表或旧 URL 记录。不同地址默认是不同 profile，只有显式导入才跨地址迁移。

## 开发边界与定位

- 事件沿 `WorkflowComfyUINode → Wrapper → DomOverlay → BlueprintEditor → Host → AIWorkflowPage → ComfyConnection` 转发。
- IPC 仍走 `ComfyUIBridgeService → electronBridge/comfyuiRuntime → preload → comfyui/routes/handlers/service`。
- `runtime/workflowFingerprint.mjs` 负责保守语义指纹；`capabilityProfile.mjs` 对实际用到的节点 schema 计算指纹，忽略上传文件枚举变化。
- `templateResolver.mjs` 与运行驱动使用相同可执行子图生成输入映射；`inputBindings.mjs` 优先识别 schema upload 字段，并保留已知 loader 适配器。
- `runtime/archiveScope.mjs` 提供 profile 与旧 URL 归档兼容；`recovery/` 提供恢复包与旧库导入。
- `runtime/submissionGuard.mjs` 在 `comfyui_jobs` 中持久化未决请求身份；不存 prompt 或上传字节。POST 前异常不提交，响应丢失通过 request ID 找回。
- 业务 settings 继续走原 Store hook 定向更新引擎；不得全量重建蓝图。

`DVS_COMFY_SEMANTIC_MATCH=0` 仅关闭语义匹配，回到严格文件 hash 匹配。它不启用旧版 resolver，也不删除归档。既有 `DVS_COMFY_LEGACY_RESOLVER=1` 属于历史实现，不作为此次修复的推荐回滚方式。

## 验证

### 2026-09-27 二次修复与问题反馈

`ResolutionSelector.preview` 等非标量且 `socketless` 的预览控件不占用序列化参数槽位；实际标量控件仍照常读取。模板转换无警告并通过校验后，若转换后的可执行图与某条成功历史逐输入完全相同，可按 `executable` 方式关联。这个匹配不忽略种子、提示词、模型或连接差异；锁定快照时也不能换成其他记录。

节点解析后提供“下载诊断记录”，生成 `ComfyUI-diagnostics-<correlationId>.json`。下次反馈优先附上此文件，并说明出错操作和时间。记录包含 resolverRevision、应用版本、打包状态、文件/语义/执行 hash、候选差异字段、转换警告、被拒绝历史的状态及关联 ID，不包含完整 prompt、widget 参数值、模型文件或媒体内容。

客户端 `DVSResource/Logs/runtime.log` 中搜索 `[ComfyUI:diagnostic]`，可找到解析和提交结果。日志以 JSON 字符串写入，避免 Electron 将对象记录为 `[object Object]`。日志可能包含其他模块输出，反馈时优先提交节点下载的诊断 JSON，或截取该标记附近相关行。解析发生在异步请求返回时，每次刷新一条，不随画布重绘刷屏。

本轮后端标识为 `2026-09-27-socketless-v2`。若节点没有诊断下载按钮、记录里没有这个标识，先核对安装包是否来自当前工作区并完全退出再启动客户端。仅更新源码不会改变已安装的 `resources/app.asar`。

只读真实模板验收：设置 `DVS_TEST_COMFY_URL` 和 `DVS_TEST_COMFY_WORKFLOW`（例如 `workflows/MiniMax H3全能参考工作流.json`），单独运行 `liveExecution.test.ts` 中 `resolves the selected live saved`。此用例只读取模板、历史及 object_info，不提交生成任务，也不写生产归档库；因此其 `archiveState: failed` 代表测试未注入 LocalDB，不代表已安装客户端的归档故障。

执行 `npm run quality`，关注 `tests/unit/electron/comfyui/`、Comfy 输入/输出业务测试、节点组件测试与蓝图架构门禁。前端构建使用项目现有 Vite 构建流程。

真实轻量验证：`DVS_TEST_COMFY_URL` 指向专用测试实例，运行 `tests/unit/electron/comfyui/liveExecution.test.ts` 中 `submits a bound image`，仅上传/保存 16×16 图片并重放历史，不加载生成模型。不要在繁忙生产实例上运行。

**隔离实例必须同时指定 `--base-directory` 和 `--database-url sqlite:///绝对路径`**。本机 ComfyUI 0.36.0 即使设置 base directory，也可能将原 `user/comfyui.db` 自动改名迁移；显式 database-url 会关闭这一迁移。测试还应使用独立端口、`--cpu --disable-all-custom-nodes --disable-auto-launch`，完成后仅停止自己启动的进程。

升级后缺少节点、模型或第三方插件不兼容时应呈现依赖错误；此修复不承诺任意插件升级后无条件运行，不修改 ComfyUI 核心源码或 Python 环境。
