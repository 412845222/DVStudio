# 后端开发指引 (Backend Guide)

## 1. 技术栈
- **框架**: Django 4+
- **语言**: Python 3.11+
- **核心依赖**: `django-cors-headers`, `requests`, `sse-starlette` (或类似 SSE 库)

## 2. App 划分
- `dwebapp`: 核心应用，处理 AI 对话 (Chat)、字幕理解、API 凭证管理。
- `aiworkflow_project`: 处理 AI 工作流的项目存储与资源管理。
- `comfyui_bridge`: 处理与 ComfyUI 的通信、任务转发与状态轮询。
- `dvs_editor`: 视频编辑器相关的后端支持（如组件库）。

## 3. AI 接入规范
- **统一入口**: 所有大模型请求应通过 `dwebapp.ai` 模块进行封装。
- **流式输出 (SSE)**: 对话类接口必须支持 Server-Sent Events (SSE)，以便前端实时打字机效果展示。
- **Prompt 管理**: 系统 Prompt 和模板应存放在专门的 `.md` 或 `.py` 文件中（如 `dwebapp/ai/skills/` 目录下），避免硬编码在业务逻辑中。

## 4. 数据库与迁移
- 默认使用 SQLite (本地桌面端场景)。
- 修改 `models.py` 后，必须生成并提交 migration 文件 (`python manage.py makemigrations`)。