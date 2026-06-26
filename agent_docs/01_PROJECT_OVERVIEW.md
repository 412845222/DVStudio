# 项目概述 (Project Overview)

## 1. 项目简介

DVStudio (Dweb Video Studio) 是一个基于 WebGL2 的视频编辑与 AI 工作流蓝图项目。它旨在将传统的视频时间轴编辑与现代的 AI 生成能力（如 ComfyUI、Meshy、Seedance、即梦等）深度结合，提供一站式的视频创作体验。应用以 **Electron 桌面端**形式分发，在本地通过 Django 子进程提供 AI 对话与工作流推理能力，辅以 **dweb:// 自定义协议** 直接从磁盘读取项目静态资产，并通过 **平台抽象层** 支持 Steamworks 原生集成。

## 2. 核心能力

### 2.1 AI 工作流蓝图 (AI Workflow Blueprint)
- **定位**: 节点化的 AI 任务编排工具。
- **功能**:
  - 资源导入与管理（图片 / 视频 / 音频 / 3D 模型 / 文本）。
  - 剧情与分支编排（Story Nodes）、场景理解、场景布局、场景拆解、Unreal 导出。
  - 连接本地或远程的 ComfyUI / Meshy / Seedance / 即梦 / SeeDream / NanoBanana 等服务进行推理。
  - 输出媒体（图片 / 视频 / 3D 模型）的回流与预览。
  - 节点内置聊天对话框（NodeChatDialog），支持针对单个节点的 AI 交互。
- **入口**: `src/views/AIWorkflow.vue` → `src/views/AIWorkflow/AIWorkflowPage.vue`

### 2.2 视频编辑器 (Video Editor)
- **定位**: 基于时间轴和关键帧的 2D 视频动画编辑器。
- **功能**:
  - 舞台节点（矩形、文字、图片、线条）的所见即所得编辑。
  - 时间轴关键帧与缓动曲线控制（含可视化缓动曲线编辑器）。
  - 音频波形显示与编辑。
  - 节点控制点（缩放控制点、线条控制点）。
  - 节点详情表单（通用变换、图片、线条、矩形、文字、滤镜、数值拖拽）。
  - 节点树层级管理。
  - 组件库面板（支持从组件库快速添加预设组件）。
  - 字幕编辑器与 AI 字幕理解面板。
  - 导出对话框、最近编辑加载对话框、进度条编辑对话框。
  - AI 对话辅助（生成布局、批量修改样式、生成滤镜、生成调色板）。
- **入口**: `src/views/VideoStudio.vue`

### 2.3 Electron 本地资产与任务数据库 (LocalDB)
- **定位**: 桌面端本地 SQLite（better-sqlite3）数据层，**运行时事实来源**。
- **功能**:
  - 项目元数据（`projects` 表）：项目名、UUID、磁盘根路径、最近打开时间等。
  - Meshy 3D 任务镜像（`meshy_tasks` 表）。
  - 视频生成任务镜像（`video_tasks` 表）。
  - API 密钥（AES-256-GCM + PBKDF2 加密，仅保存 fingerprint 明文）。
- **位置**: `electron/localdb/`
- **IPC 入口**: `electron/localdb/ipc/ipcHost.mjs` 注册的 `dweb:localdb:*` 通道；前端通过 `window.dweb.aiworkflow.db.*` 访问

### 2.4 dweb:// 项目资产协议
- **定位**: 自定义 Electron 协议，让渲染端直接从磁盘读取项目静态资产。
- **协议格式**: `dweb://project-assets?projectId=<id>&path=<rel>&variant=<v>&maxSize=<n>&v=<versionTag>`
- **关键路径**:
  - 注册：`electron/main.mjs`（`protocol.registerSchemesAsPrivileged`）
  - 协议处理器：`electron/backend/projectAssetProtocol.mjs`
  - 静态资产管理服务：`electron/backend/projectStaticAssets/{manifest,paths,service}.mjs`
- **优势**:
  - 绕过 Django HTTP 通道，资产加载更快
  - 离线可用
  - 路径安全校验（拒绝绝对路径、拒绝 `..` 路径穿越）

### 2.5 Steam 平台集成
- **定位**: 通过平台抽象层支持 Steamworks 原生集成，提供 Steam 平台特有能力。
- **功能**:
  - Steam 好友列表展示（SteamFriendsList）。
  - Steam 面板与快捷操作（SteamPanel、SteamQuickActions）。
  - Steam 用户状态徽章与用户卡片（SteamStatusBadge、SteamUserCard、SteamUserButton）。
  - Steam 热键支持（在应用内响应 Steam Overlay 热键）。
  - Steam Overlay 激活与 URL 打开。
  - DLC 安装状态检测。
  - Steam 入口引导覆盖层（SteamEntryOverlay）。
- **架构**:
  - 主进程：`electron/platform/`（平台抽象层 + Steam 提供者 + 原生模块）
  - 前端：`src/platformBridge/`（桥接层 + composables）
  - UI：`src/ui/Steam/`（Steam 相关组件）、`src/ui/User/`（用户相关组件）
- **降级策略**: Web 模式或非 Steam 环境下自动使用 Mock provider，不影响核心功能。

### 2.6 AI 对话集成
- **后端**: Django `codex_bridge` App 包装 GitHub Copilot CLI（首选）和 Codex CLI（兼容备选）。
- **前端**: `src/network/AIChatService.ts` 通过 SSE 接收流式输出。
- **SSE 实现**: Django 原生 `StreamingHttpResponse`，统一封装在 `dwebapp.ai.api.chat.utils._sse`。

## 3. 路由与页面

路由表位于 `src/router/index.ts`：

| 路径 | 组件 | 用途 |
| --- | --- | --- |
| `/welcome` | `src/views/WelCome.vue` | 启动 / 环境检查 / Setup 工作流（注意命名拼写为 WelCome） |
| `/` | `src/views/ProjectList.vue` | 项目列表（搜索、新建、从文件夹打开） |
| `/workflow` | `src/views/AIWorkflow.vue` → `src/views/AIWorkflow/AIWorkflowPage.vue` | AI 工作流蓝图编辑器 |
| `/studio` | `src/views/VideoStudio.vue` | 视频编辑器（舞台 + 时间轴 + 增强面板） |
| `/settings` | `src/views/Settings.vue` | 应用设置 |
| `/image-markup-preview` | `src/views/ImageMarkupPreviewPage.vue` | 图片标注预览（独立 BrowserWindow） |
| `/resource-manager` | `src/views/AIWorkflow/ResourceManagerWindow.vue` | 资源管理器窗口（独立 BrowserWindow） |

> **Electron 模式** 下使用 `createWebHashHistory()`（避免 file:// 协议下 History 模式失败）；**Web 模式** 下使用 `createWebHistory()`。

## 4. 目标用户与使用场景
- **创作者**: 使用 AI 工作流快速生成素材，并在视频编辑器中进行精细化排版和动画制作；通过 Steam 平台分享作品或参与社区互动。
- **开发者**: 基于现有的 WebGL2 引擎、节点系统和平台抽象层，扩展新的渲染能力、AI 接入能力或平台集成。

## 5. 与 AGENT_GUIDE 的关系

本文件是「项目是什么」的总览；如需了解具体模块的实现约定，请按需查阅 `agent_docs/02_ARCHITECTURE.md` 及之后的子文档。
