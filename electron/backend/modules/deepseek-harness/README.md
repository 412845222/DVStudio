# DeepSeek-Harness 全局服务管理

入口：客户端左侧「服务」→「DeepSeek-Harness」→「配置」。首次使用填写源码记录并保存，可选择已有目录，或填写 HTTPS Git 仓库地址、分支/标签/提交及新的本地目录。历史记录保存在 LocalDB，删除记录不会删除源码。

选择 Node.js 与 pnpm 后执行「检测环境」；尚未安装依赖或构建的源码可执行「准备环境」。准备操作会在用户确认后执行源码中的安装与构建脚本。完成后设为当前源码，再启动服务。支持停止、重启、查看/清空日志和打开 Web 界面。服务运行时锁定配置切换；离开页面不会停止服务，客户端退出或后端重启时清理所属进程。

## 支持范围

适配依据为官方 [deepseek-ai/DeepSeek-Harness](https://github.com/deepseek-ai/DeepSeek-Harness/tree/d347e703908d0406b7a7ef80e3a0e594d86b2215) 提交 `d347e703908d0406b7a7ef80e3a0e594d86b2215`：根包 `@deepseek-ai/dsh-root`，CLI 包 `@deepseek-ai/dsh`，构建入口 `apps/cli/lib/bin.js`，启动参数 `web --host 127.0.0.1 --port <port> --no-open`。该版本要求 Node.js `^22.19.0 || >=24.0.0`、pnpm `11.7.0`；程序会读取所选源码的声明并验证，不自动安装 Node.js 或 pnpm。

准备流程仅克隆到空目录，使用冻结锁文件安装并构建；不会覆盖已有工作区、执行 reset/pull 或删除源码。旧目录可以保存、选择，但不兼容的源码布局会明确报错，不能保证任意历史版本或分支均可启动。

就绪状态取自本次子进程的 `dsh web:` 本机地址输出，不假定存在健康检查接口。认证 URL 仅保留在主进程，由打开界面操作使用；日志中的令牌、凭据会脱敏。默认不随客户端启动，不接入蓝图任务执行或项目级数据。

## 分层与生命周期

- `ServiceCenterPage` → `useServiceCenterManager` → `useDeepSeekHarnessServiceManager` → 类型化 `electronBridge` → preload → 独立 `dweb:deepseek-harness:setup:*` IPC。
- `service.mjs` 管理全局配置和操作互斥，`sourceManager.mjs` 管理源码准备，`processManager.mjs` 管理服务子进程，`serviceEvents.mjs` 提供有序且有界的日志和状态事件。
- LocalDB v16 仅新增 Harness 配置表。版本号校验避免窗口间覆盖；运行 ID 避免旧窗口误停新实例。快照与增量事件合并时使用序号和日志 epoch。
- ComfyUI 继续使用原管理器和 IPC；图形底座、蓝图事件总线及项目/节点/资产/任务持久化不参与此次变更。

## 验证

```powershell
npm run quality
npm run build
node scripts/utils/verify-harness-process.mjs
# 使用项目 Electron 运行，避免 PowerShell 直接启动 GUI exe 后立即返回。
node node_modules/electron/cli.js scripts/utils/verify-harness-ipc.mjs
```

单元测试覆盖数据库增量迁移、路径与运行时验证、日志脱敏和序号、进程状态、桥接协议、页面选择和订阅释放。进程冒烟使用隔离的兼容源码夹具，验证真实 Node.js 子进程启动/停止且不影响无关进程；Electron 冒烟使用临时 userData 和内存仓库，验证真实 preload/IPC/广播/流式错误。它们不代替实际上游依赖安装及模型调用联调。Electron 冒烟的临时目录以 `dvs-harness-ipc-` 命名，不接触用户数据库。
