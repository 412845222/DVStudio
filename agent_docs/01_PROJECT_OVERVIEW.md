# 项目概述 (Project Overview)

## ⚠️ 架构变更提示

**Django 依赖已完全移除（2026-06）**。项目后端已重构为纯 Electron 主进程 Node.js IPC 架构：
- 不再启动 Django 子进程
- 所有后端逻辑通过 Electron IPC 通信
- AI 对话直接在主进程调用外部 API（DeepSeek、Gemini 等）
- Python 仅作为可选 Bridge 用于字幕等特定计算任务

## 1. 项目简介

DVStudio (Dweb Video Studio) 是一个基于 WebGL2 的视频编辑与 AI 工作流蓝图项目。它旨在将传统的视频时间轴编辑与现代的 AI 生成能力（如 ComfyUI、Meshy、Seedance、即梦等）深度结合，提供一站式的视频创作体验。应用以 **Electron 桌面端**形式分发，**所有后端逻辑运行在 Electron 主进程中**，通过 IPC 与前端通信，辅以 **dweb:// 自定义协议** 直接从磁盘读取项目静态资产，并通过 **平台抽象层** 支持 Steamworks 原生集成。

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
- **后端模块**: `electron/backend/modules/comfyui/`、`meshy/`、`seedance/`、`third-party/`、`agent-skills/`

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
- **后端模块**: `electron/backend/modules/editor/`、`export/`、`subtitle/`

### 2.3 Electron 本地资产与任务数据库 (LocalDB)
- **定位**: 桌面端本地 SQLite（better-sqlite3）数据层，**唯一运行时事实来源**（不再有 Django SQLite 镜像）。
- **功能**:
  - 项目元数据（`projects` 表）：项目名、UUID、磁盘根路径、最近打开时间等。
  - Meshy 3D 任务（`meshy_tasks` 表）。
  - 视频生成任务（`video_tasks` 表）。
  - ComfyUI 任务（`comfyui_jobs` 表）。
  - 导出任务（`export_jobs` 表）。
  - API 密钥（AES-256-GCM + PBKDF2 加密，仅保存 fingerprint 明文）。
- **位置**: `electron/localdb/`
- **IPC 入口**: `electron/localdb/ipc/ipcHost.mjs` 注册的 `dweb:localdb:*` 通道；前端通过 `window.dweb.*` 访问

### 2.4 dweb:// 项目资产协议
- **定位**: 自定义 Electron 协议，让渲染端直接从磁盘读取项目静态资产，**不经过任何 HTTP 通道**。
- **协议格式**: `dweb://project-assets?projectId=<id>&path=<rel>&variant=<v>&maxSize=<n>&v=<versionTag>`
- **关键路径**:
  - 注册：`electron/main.mjs`（`protocol.registerSchemesAsPrivileged`）
  - 协议处理器：`electron/backend/projectAssetProtocol.mjs`
  - 静态资产管理服务：`electron/backend/projectStaticAssets/{manifest,paths,service}.mjs`
- **优势**:
  - 零 HTTP 开销，资产加载更快
  - 完全离线可用
  - 路径安全校验（拒绝绝对路径、拒绝 `..` 路径穿越）
  - 内置缩略图生成（`variant`、`maxSize` 参数）

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
- **后端**: 直接在 Electron 主进程中通过 `electron/backend/core/http-client.mjs` 调用外部 AI API。
- **支持的 AI 提供商**:
  - DeepSeek（默认，`deepseek-chat` 模型）
  - Gemini（`gemini-2.5-flash-image` 等）
  - ByteDance 豆包（可选）
  - GitHub Copilot CLI / Codex CLI（可选，通过 `codex` 模块）
- **前端**: `src/network/AIChatService.ts` 通过 IPC 流式通道接收响应。
- **流式实现**: IPC 三通道模式（`:stream` 启动 + `:data` 数据 + `:end` 结束 + `:error` 错误）。
- **后端模块**: `electron/backend/modules/chat/`、`codex/`
- **API 密钥存储**: LocalDB `api_keys` 表（加密存储）或 `DVSResource/UserSettings/settings.json`（用户设置）

### 2.7 Node.js IPC 后端（新增核心）
- **定位**: 所有后端逻辑的统一入口，运行在 Electron 主进程。
- **架构**: 模块化设计，每个业务域一个模块目录。
- **模块列表**:
  - `system/` - 系统健康检查、诊断、迁移状态
  - `projects/` - 项目 CRUD
  - `project-assets/` - 项目资产元数据
  - `chat/` - AI 对话（外部 API 直连）
  - `codex/` - Copilot/Codex CLI（可选）
  - `comfyui/` - ComfyUI 桥接
  - `meshy/` - Meshy 3D 生成
  - `seedance/` - Seedance 视频生成
  - `third-party/` - 三方 API 统一网关
  - `editor/` - 编辑器后端（组件库）
  - `export/` - 导出服务（ffmpeg 调用）
  - `subtitle/` - 字幕处理（部分通过 Python Bridge）
  - `agent-skills/` - Agent Skills（场景理解/布局/Unreal 导出，含内置 Unreal HTTP 服务器）
- **通信方式**: Electron IPC（`ipcMain.handle` / `ipcRenderer.invoke`）
- **详细文档**: [04_BACKEND_GUIDE.md](04_BACKEND_GUIDE.md)

### 2.8 Python Bridge（可选组件）
- **定位**: 可选的 Python 工作进程，用于需要 Python 生态的计算密集型任务。
- **非核心依赖**: 核心功能（AI 对话、工作流、资产管理等）完全不依赖 Python。
- **用途**: 字幕处理等需要特定 Python 库的任务。
- **位置**: `electron/backend/python-bridge/`
- **优雅降级**: Python 环境不可用时，相关功能给出明确提示，不影响核心功能运行。

### 2.9 便携模式资源目录
- **定位**: 支持便携版运行，数据保存在安装目录旁。
- **资源目录**: `DVSResource/`（安装目录可写时）或用户数据目录。
- **内容**:
  - `UserData/` - 用户数据（LocalDB、Session、CrashDumps）
  - `UserSettings/settings.json` - 用户设置
  - `BackendData/` - 后端数据
  - `Logs/runtime.log` - 运行时日志
- **便携检测**: 安装目录可写时自动启用便携模式；安装到 Program Files 等受保护目录时自动回退到用户目录。

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

## 4. 环境准备流程（Setup Workflow）

应用启动时会自动运行环境准备流程（可手动重试），步骤如下：

1. **Python 环境检测**（可选）：检测系统 Python >=3.11，缺失时在 Windows 下尝试 winget 自动安装
2. **创建资源目录**：创建 `DVSResource/` 目录结构（UserData、UserSettings、BackendData、Logs）
3. **初始化 Python Bridge**（可选）：如 Python 可用则初始化 Python 工作进程
4. **初始化 Node.js IPC 后端**：注册所有后端 IPC 模块路由
5. **检测 ffmpeg**（可选）：检测 ffmpeg 是否可用，不可用时仅影响视频导出

每个步骤都有进度展示和错误提示，用户可以在 `/welcome` 页面查看状态和重试。

## 5. 目标用户与使用场景
- **创作者**: 使用 AI 工作流快速生成素材，并在视频编辑器中进行精细化排版和动画制作；通过 Steam 平台分享作品或参与社区互动。
- **开发者**: 基于现有的 WebGL2 引擎、节点系统、模块化 IPC 后端和平台抽象层，扩展新的渲染能力、AI 接入能力或平台集成。

## 6. 与 AGENT_GUIDE 的关系

本文件是「项目是什么」的总览；如需了解具体模块的实现约定，请按需查阅 `agent_docs/02_ARCHITECTURE.md` 及之后的子文档。
