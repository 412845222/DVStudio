# 蓝图工具栏与日志面板改造计划

本目录记录「AI 工作流蓝图页面左上角工具栏 + 日志面板」的改造计划与实施清单。

## 1. 背景 / 现状

- 页面：`src/views/AIWorkflow/AIWorkflowPage.vue`
- 工具栏组件：`src/ui/WorkFlow/BlueprintProjectToolbar.vue`
- 当前工具栏按钮（自上而下/从左到右）：
  - 项目身份标识（项目名）
  - **项目**（下拉：保存/加载/新建/修复资源/导入导出/性能优先等）
  - **节点库**（切换显示）
  - **提示词库**（`open-prompt-library` —— 当前仅 toast 占位）
  - **添加节点**（快捷菜单）
  - **资源**（弹出：资源列表 + 完整管理器入口）
  - **任务**（弹出：Meshy / 视频任务 / 其他任务入口）
  - **日志**（`toggle-backend-log` —— 当前仅 toast 占位）

## 2. 改造目标

### 2.1 删除的按钮与绑定
1. 删除工具栏中的 **「提示词库」** 按钮；同时删除 Vuex/事件绑定中 `open-prompt-library` 的引用（在 `AIWorkflowPage.vue` 中对应 `onRailOpenPromptLibrary` 也应移除或改为其它入口）。
2. 删除工具栏中的 **「任务」** 按钮及其弹出面板（Meshy/视频任务目前通过各自的浮动面板呈现，无需统一入口）。

> 保留：项目、节点库、添加节点、资源、日志。

### 2.2 新增：蓝图日志面板（BlueprintLogPanel）
- 位置：蓝图页面 **底部弹出面板**（`div.aiwf-ui-container` 底部）。
- 触发：点击工具栏 **「日志」** 按钮时切换显示/隐藏。
- 面板功能：
  - 日志列表（时间倒序），可滚动；
  - 日志级别（INFO / WARN / ERROR / DEBUG）过滤；
  - 日志分类（Category）过滤：
    - `runtime`：节点执行状态（ComfyUI / Meshy / 视频任务 / 场景理解 / 场景布局 / Unreal 导出等）
    - `request`：Django / 后端 API 请求（非 ping）
    - `operation`：关键操作（保存项目、加载项目、导入/导出、删除资源等）
    - `system`：Electron 运行期 / 本地数据库事件
  - 关键字搜索（文本包含匹配）；
  - 自动滚动到最新（可选开关）；
  - 清空当前面板；
  - 导出为 JSON / 纯文本；
  - 实时滚动与虚拟列表（可选：当条目超过 500 时启用简单的窗口裁剪）。

### 2.3 日志来源与接入策略
1. **节点运行日志（runtime）**：在节点运行相关的 composable（`useAIWorkflowComfyRuntime`、`useAIWorkflowMeshyRuntime`、节点侧 `onRun/onRefresh`、`onCancel` 等）中，统一调用 `blueprintLog.append(...)`。
2. **Django API 请求日志（request）**：在统一的网络层（`ComfyUIBridgeService`、`BlueprintProjectService`、`SceneSkillService` 等）中，对请求进行封装：
   - 记录：`method / url / status / durationMs`；
   - 过滤：URL 路径中包含 `ping`、`health`、`ready` 的请求一律 **不记录**；
   - 错误（4xx/5xx）标记为 `ERROR` 级别；
   - 重定向 / 304 / 206 等标记为 `INFO`。
3. **关键操作日志（operation）**：项目保存/加载、资源导入、节点删除、任务取消等关键操作在成功或失败时追加一条日志。

> 为避免日志无限增长，面板状态将维护一个有界环形缓冲（默认上限 2000 条；超出后丢弃最早条目）。

### 2.4 类型定义
- 路径：`src/views/AIWorkflow/blueprint-core/blueprintLog.ts`
- 类型：

```ts
export type BlueprintLogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
export type BlueprintLogCategory = 'runtime' | 'request' | 'operation' | 'system'

export interface BlueprintLogEntry {
  id: string
  timestamp: number
  level: BlueprintLogLevel
  category: BlueprintLogCategory
  /** 简短可读标签，例如节点 ID / 路由名称 */
  tag?: string
  /** 主体描述 */
  message: string
  /** 额外详情，例如请求体、错误栈等（可展开查看） */
  detail?: unknown
}

export interface BlueprintLogState {
  entries: BlueprintLogEntry[]
  maxEntries: number
}

/** 供组件调用的 API */
export interface BlueprintLogAPI {
  readonly entries: ReadonlyArray<BlueprintLogEntry>
  append(entry: Omit<BlueprintLogEntry, 'id' | 'timestamp'> & { timestamp?: number }): BlueprintLogEntry
  clear(): void
  exportAsJson(): string
  exportAsText(): string
}
```

### 2.5 网络层接入（request 类别）
- 为 `src/network/ComfyUIBridgeService.ts`、`src/network/BlueprintProjectService.ts`、`src/network/SceneSkillService.ts`、`src/network/UnrealExportService.ts` 等，提供一个共享的 `requestWithLog` 封装：
  - 规则：若请求 URL 的 pathname 中匹配 `/(ping|health|ready)([/.]|$)/i`，则跳过日志；
  - 正常：INFO 级别；失败：ERROR 级别；
  - 记录：durationMs、status、path、query、responseBody（如存在 error.message）。

### 2.6 组件结构
- `src/views/AIWorkflow/AIWorkflowPage.vue`：在现有 `aiwf-ui-container` 底部新增 `BlueprintLogPanel` 的挂载与显示控制；
- `src/ui/WorkFlow/BlueprintLogPanel.vue`：面板主体；
- `src/views/AIWorkflow/blueprint-core/blueprintLog.ts`：状态与 API。

## 3. 实施清单

- [x] 01. 在 `AIPlan/` 目录创建本计划文档
- [ ] 02. `BlueprintProjectToolbar.vue` 删除「提示词库」按钮与事件 emit
- [ ] 03. `BlueprintProjectToolbar.vue` 删除「任务」按钮与任务弹出面板
- [ ] 04. `BlueprintProjectToolbar.vue` 将「日志」按钮改为切换状态（高亮 active）并通过事件发射 toggle
- [ ] 05. 新建 `src/views/AIWorkflow/blueprint-core/blueprintLog.ts`，实现日志状态与 API
- [ ] 06. 新建 `src/ui/WorkFlow/BlueprintLogPanel.vue` 组件，含过滤、搜索、自动滚动、清空、导出
- [ ] 07. 在 `AIWorkflowPage.vue` 中集成日志面板（`BlueprintLogPanel`），并将 `onRailToggleBackendLog` 替换为真正的面板切换逻辑
- [ ] 08. 移除 `AIWorkflowPage.vue` 中 `@open-prompt-library`、`onRailOpenPromptLibrary` 绑定；移除与任务面板相关的 `@open-meshy-task`、`@open-video-task`、`@open-task-placeholder` 绑定（保留 Meshy/视频任务面板的手动打开入口）
- [ ] 09. 在节点运行相关 composable（Comfy/Meshy/视频/场景理解/布局/Unreal）调用 `blueprintLog.append` 记录运行状态/错误
- [ ] 10. 增加网络层请求日志封装，过滤掉 ping/health/ready 路径
- [ ] 11. 在关键操作（项目保存/加载/导入导出/删除节点）处追加 `operation` 日志

## 4. 验收标准

1. 工具栏只展示：项目、节点库、添加节点、资源、日志。（原「提示词库」「任务」按钮被移除）
2. 点击「日志」可 **从底部弹出一个可滚动/过滤/搜索的面板**，再次点击可收起。
3. 面板中能看到：
   - 节点执行日志（成功/失败/取消/耗时）；
   - Django API 请求日志（不含 ping/health/ready）；
   - 关键操作（保存/加载/导入/导出/删除节点/清理资源等）。
4. 日志上限生效：超出上限自动丢弃最早条目，不导致明显性能回退。
5. 日志支持导出 JSON / TXT，并在浏览器中可下载（Electron 环境下可保存到本地文档目录）。

## 5. 验证命令

```bash
npm run build        # 构建检查 TypeScript 与模板编译
npm run dev:web      # 纯前端运行模式，便于调试日志面板 UI
```
