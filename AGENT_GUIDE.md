# AI Agent 开发指引 (AI Agent Development Guide)

欢迎！作为 AI Agent，当你进入本项目（DVStudio）时，请首先阅读本指南。本指南将帮助你快速理解项目上下文、技术栈、架构边界以及开发规范，从而更好地提供 AI 编码服务。

## 📚 详细文档索引

为了保持根目录整洁，详细的上下文和开发边界指引已结构化存放在 `agent_docs/` 目录中。请根据当前任务的需要，查阅相应的文档：

- [00_INDEX.md](agent_docs/00_INDEX.md) - 文档目录与导读
- [01_PROJECT_OVERVIEW.md](agent_docs/01_PROJECT_OVERVIEW.md) - 项目概述与核心业务逻辑
- [02_ARCHITECTURE.md](agent_docs/02_ARCHITECTURE.md) - 系统架构与目录结构
- [03_FRONTEND_GUIDE.md](agent_docs/03_FRONTEND_GUIDE.md) - 前端开发指引 (Vue 3 + WebGL2)
- [04_BACKEND_GUIDE.md](agent_docs/04_BACKEND_GUIDE.md) - 后端开发指引 (Django + AI)
- [05_ELECTRON_GUIDE.md](agent_docs/05_ELECTRON_GUIDE.md) - 桌面端开发指引 (Electron)
- [06_AI_WORKFLOW_GUIDE.md](agent_docs/06_AI_WORKFLOW_GUIDE.md) - AI 工作流蓝图开发指引
- [07_DEVELOPMENT_BOUNDARIES.md](agent_docs/07_DEVELOPMENT_BOUNDARIES.md) - 全仓开发边界与规范 (⚠️ 必读)

## 🎯 快速上下文

- **项目名称**: DVStudio (Dweb Video Studio)
- **核心功能**: 
  1. AI 工作流蓝图 (资源 → 剧情/分支 → ComfyUI 推理 → 输出媒体)
  2. 视频编辑器 (舞台节点 + 时间轴关键帧 + AI 对话辅助)
- **技术栈**:
  - **前端**: Vue 3 (Composition API), TypeScript, Vite, Vuex, WebGL2 (自定义渲染引擎)
  - **后端**: Python 3.11+, Django (提供 SSE 和 AI 接入)
  - **桌面端**: Electron, NSIS
- **运行环境**: Node.js 16+, Python 3.11+

## 🤖 Agent 行为准则

1. **先阅读，后修改**：在修改任何代码前，请先阅读相关模块的 `agent_docs/` 指引文档。
2. **遵守边界**：严格遵守前后端分离边界，不要在前端直接处理需要后端处理的重逻辑，反之亦然。
3. **保持一致性**：遵循现有的代码风格（如 Vue 3 的 `<script setup>`，TypeScript 类型定义，Django 的 App 结构）。
4. **最小化修改**：只修改与当前任务直接相关的文件，避免过度重构。
5. **测试验证**：在提供代码后，尽可能提供验证修改是否正确的步骤或命令。

---
*注：本文件及 `agent_docs/` 目录专为 AI Agent 设计，旨在提供结构化的项目上下文。*