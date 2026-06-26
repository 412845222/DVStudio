# 后端开发指引 (Backend Guide)

## 1. 技术栈
- **框架**: Django 4.2.11（**不是泛指 Django 4+**）
- **语言**: Python 3.11+
- **Web API**: Django REST Framework 3.14
- **核心依赖**（见 `django-app/requirements.txt`）：
  - `Django==4.2.11`
  - `djangorestframework==3.14.0`
  - `django-cors-headers==4.4.0`
  - `cryptography==42.0.8`（API 密钥加密辅助）
  - `certifi>=2024.0.0`（CDN SSL 兼容）
  - `Pillow>=10.4.0`
- **SSE 实现**: **Django 原生 `StreamingHttpResponse`**，**不依赖** `sse-starlette` 或 `sse-starlette-serve`。
  - 统一封装在 `dwebapp/ai/api/chat/utils.py` 的 `_sse` / `_apply_sse_headers` 工具中
  - 所有 Copilot/Codex/字幕/调色板/模板/导出/Agent Skills 等流式接口均使用此 SSE 通道
- **CORS**: `corsheaders`，`CORS_ALLOW_ALL_ORIGINS = True`（开发环境简化）

## 2. App 划分

| App | 路径 | 用途 |
| --- | --- | --- |
| `dwebapp` | `django-app/dwebapp/` | 核心 App：健康检查、AI 凭证、AI 对话、字幕理解、Export Jobs、法律文档、用户协议 |
| `dweb_models` | `django-app/dweb_models/` | DBVision 自动生成的共享模型（通常为空壳） |
| `codex_bridge` | `django-app/codex_bridge/` | **GitHub Copilot CLI（首选）** 与 **Codex CLI（兼容）** 桥接；提供 `/api/workflow/copilot/*` 与 `/api/workflow/codex/*` |
| `aiworkflow_project` | `django-app/aiworkflow_project/` | 工作流项目 + 资产 API（`assets/` 写操作主要被 Electron 主进程调用） |
| `comfyui_bridge` | `django-app/comfyui_bridge/` | ComfyUI 桥接 + 项目模型；同时是**三方 API 共享实现库**（Meshy / Seedance / NanoBanana / SeeDream / 即梦 的实现函数都在 `api.py`） |
| `third_party_api_gateway` | `django-app/third_party_api_gateway/` | 三方 API 网关**新路由层**（挂在 `/api/third-party/`）；包装 `comfyui_bridge.api` 中的实现并暴露为 HTTP 端点；**模型（`MeshyTaskMirror` / `VideoGenerationTaskMirror`）实际定义在此** |
| `dvs_editor` | `django-app/dvs_editor/` | 视频编辑器后端支持：组件库（`/api/editor/component-library/*`） |
| `agentSkills` | `django-app/agentSkills/` | Agent Skills：场景理解 / 灯光 / 布局 / Unreal 导出（`/api/agent-skills/*`） |

注册入口：`django-app/dwebsite/settings.py` 的 `INSTALLED_APPS` 与 `django-app/dwebsite/urls.py` 的 `urlpatterns`。

## 3. AI 对话与 SSE（`dwebapp/ai/api/`）

> 实现已被拆分到 `dwebapp/ai/api/` 包；`chat_api.py` 仍然作为 re-export 兼容旧 import 路径。

- `chat/`：SSE 对话实现
  - `utils.py`：SSE 工具、SSE 头部、深求（DeepSeek）配置、Agent-to-UI 协议解析
  - `views.py`：`create_conversation` / `send_message` / `stream_message`
- `subtitle_understanding/`：字幕理解相关工具（`utils.py`）
- `credentials_api.py`：API 凭证（明文读取不直接暴露，由 `credentials_store.py` 加密存储）
- `credentials_store.py`：基于 `cryptography.fernet` 的加密封装

> **Copilot / Codex** 的实现不在 `dwebapp/ai/` 中，而是在 `codex_bridge/services/{copilot_cli,codex,orchestrator}.py`。`dwebapp/ai/api/chat` 主要负责把 SSE 数据流以 Agent-to-UI 协议格式返回前端。

## 4. 提示词与 Agent Skills（`dwebapp/ai/skills/`）
- `palette/`：调色板生成
- `subtitle/`：字幕分段 / 标题 / 摘要 / 风格 / 模板 / 面板补丁
- `component_template/`：组件模板生成（含 `presets.py` 预设）
- `outline_style/`：大纲 → 样式
- `conversation_component/`：对话式组件
- `video_gui/`：视频 GUI 规划（含 `presets.py` 预设）
- `protocol/`：Agent ↔ UI 协议（`agent_to_ui_jsonl` / `message_builder`）
- 每个 skill 子目录下通常包含：`agent.py`（实现）+ 多个 `*.md`（提示词 / 模板）+ `*.py`（辅助解析）
- 共用工具：`dwebapp/ai/_md_prompts.py`

## 5. Agent Skills App（`django-app/agentSkills/`）
- `skills/`：Skill 实现子目录
  - `sceneLayoutSkill/`：场景布局 Skill（`sceneLayout_skill.py`）
  - `sceneUnderstandSkill/`：场景理解 Skills
    - `lightAgentSkill/`：灯光 Skill（含 system_prompt.md、schema 定义）
    - `layoutAgentSkill/`：布局 Skill（含 system_prompt.md、schema 定义）
    - `sceneLighting_skill.py` / `sceneUnderstand_skill.py` 等
- `unreal_export.py`：Unreal 导出实现
- `views.py`：API 视图
- `urls.py`：路由（`/api/agent-skills/*`）

## 6. CodeX / Copilot 桥接（`codex_bridge/`）
- `services/copilot_cli.py`：Copilot CLI 可执行文件路径解析（本地 `node_modules/@github/copilot`、`npx`、nvm、Scoop、WinGet 等）
- `services/codex.py`：Codex CLI 包装
- `services/orchestrator.py`：`CodexOrchestrator` 统一选择 Copilot / Codex 桥接
- `views.py`：会话管理、SSE 流式输出、health_check、workspace_references
- `models.py`：`ChatSession` / `ChatMessage`
- `management/commands/codex_smoke_test.py`：smoke 测试命令
- `smoke_reports/`：历史 smoke 报告
- 环境变量：
  - `COPILOT_CLI_*`：Copilot CLI 配置（默认启用）
  - `CODEX_*`：Codex CLI 配置（兼容，可选）
  - `DWEB_LOG_LEVEL`：codex_bridge logger 级别

## 7. 工作流项目与资产（`aiworkflow_project/`）
- `models.py`：`BlueprintProject`（表名 `comfyui_blueprint_project`，与 LocalDB `projects` 表互为镜像）
- `projects/api.py`：项目 CRUD（list / save / load / delete / open-folder）
- `projects/storage.py`：项目快照加载 / 保存
- `assets/api.py`：资产上传 / 导入 / 删除 / 解析 / 修复（**当前不通过 `urls.py` 暴露给前端**，主要被 Electron `projectStaticAssets/service.mjs` 调用）
- `urls.py` 当前只挂载了 `assets/health`，其余端点保留为内嵌函数式 API

## 8. ComfyUI + 三方 API 网关（`comfyui_bridge/` + `third_party_api_gateway/`）
- **共享实现库**：`comfyui_bridge/api.py` —— 核心实现，包含 ComfyUI、Meshy、Seedance、NanoBanana、SeeDream、即梦等所有三方服务的调用函数
- `comfyui_bridge/models.py`：**仅包含 `BlueprintProject`**（表名 `comfyui_blueprint_project`）
- `comfyui_bridge/urls.py`：对外暴露 ComfyUI 相关路由（`/api/workflow/`）
- **新路由层**：`third_party_api_gateway/` —— 包装 `comfyui_bridge.api` 中的实现
  - `api.py`：包装共享实现并暴露为 HTTP 路由
  - `urls.py`：`/api/third-party/` 下所有路由
  - `models.py`：**`MeshyTaskMirror` + `VideoGenerationTaskMirror` 实际定义在此**（表名 `third_party_meshy_task_mirror` / `third_party_video_generation_task_mirror`）
- **路由前缀**：
  - ComfyUI 与项目 CRUD：`/api/workflow/`（来自 `comfyui_bridge/urls.py`）
  - 三方 API 网关：`/api/third-party/`（来自 `third_party_api_gateway/urls.py`）
- **新增三方 API 接入**统一在 `third_party_api_gateway/` 添加新 URL + View 实现，复用 `comfyui_bridge.api` 中的实现函数

## 9. 数据库与迁移

### 9.1 Django SQLite
- 默认使用 SQLite（本地桌面端场景）。
- 数据库文件路径由 `DWEB_DATA_DIR` 环境变量控制（`django-app/dwebsite/settings.py` 中解析）：
  - 若 `DWEB_DATA_DIR` 为空 / 未设置，则使用 `BASE_DIR`（开发模式）
  - 否则使用 `DWEB_DATA_DIR/db.sqlite3`（生产 / 运行时）
- `SECRET_KEY` 在首次启动时自动生成并写入 `DWEB_DATA_DIR/django_secret_key.txt`
- `STATIC_ROOT` / `MEDIA_ROOT` 也使用 `DWEB_DATA_DIR`
- 上传大小上限：`DWEB_UPLOAD_LIMIT_BYTES`（默认 256MB）

### 9.2 Electron LocalDB（better-sqlite3）
- 位于 `electron/localdb/`，**与 Django SQLite 是双轨**：
  - **LocalDB 是运行时事实来源**（新项目/任务/凭证都先写这里，表名 `projects` / `meshy_tasks` / `video_tasks` / `api_keys`）
  - Django SQLite 主要承担"迁移期镜像"角色（`comfyui_blueprint_project` / `third_party_meshy_task_mirror` / `third_party_video_generation_task_mirror`）
- 新增表 / 字段时：先在 `electron/localdb/migrations.mjs` 写 `runV<n>(db)`，并在文件顶部 `TARGET_VERSION += 1`
- Django 侧的 Django ORM 模型（`models.py` 的 `managed = False`）**只用于查询**和单元测试；**不要**通过 Django 的 migration 改表结构

### 9.3 Django 迁移命令
```bash
# 在 django-app 目录中
python manage.py makemigrations <app>
python manage.py migrate
```
- 在 Electron 模式下，主进程会调用 `runLegacyDbMigration`（`electron/localdb/ipc/djangoMigrate.mjs`）在升级/启动时执行 `migrate`。
- **不要**把 `models.py` 改成 `managed = True`，除非明确要把 Django 也作为写入路径。

## 10. 第三方调用规范
- **统一入口**: 所有大模型请求应通过 `dwebapp.ai` 模块或 `comfyui_bridge` / `codex_bridge` 内的封装函数发起，**禁止**在 Views 中直接拼 HTTP。
- **流式输出 (SSE)**: 对话类接口（`/api/chat/...`、`/api/agent-skills/.../...:stream` 等）必须通过 `dwebapp.ai.api.chat.utils._sse` 工具返回 `StreamingHttpResponse`。
- **API 凭证**: 不得在日志或错误信息中输出明文 API Key；通过 `credentials_store.py` 的密文存储 + 运行时解密。
- **CDN SSL 兼容**: 字节方舟等 CDN 存在 SSL EOF / TLS 兼容问题，下载工具（如 `assets/api.py` 中的 `_stream_url_to_file`）使用 `certifi` + 自定义 SSL context + 指数退避重试。

## 11. 关键文件位置速查

| 关注点 | 路径 |
| --- | --- |
| Django 设置 | `django-app/dwebsite/settings.py` |
| Django URL 入口 | `django-app/dwebsite/urls.py` |
| 核心 App | `django-app/dwebapp/` |
| AI 对话实现 | `django-app/dwebapp/ai/api/chat/` |
| 字幕理解 | `django-app/dwebapp/ai/api/subtitle_understanding/` |
| dwebapp Skills | `django-app/dwebapp/ai/skills/`（palette / subtitle / protocol 等） |
| Copilot / Codex 桥接 | `django-app/codex_bridge/services/` |
| 项目 + 资产 | `django-app/aiworkflow_project/` |
| ComfyUI 桥接 + 共享实现 | `django-app/comfyui_bridge/api.py`（**共享实现库，被 `third_party_api_gateway` 复用**） |
| ComfyUI 模型 | `django-app/comfyui_bridge/models.py`（`BlueprintProject`） |
| 三方 API 网关（新路由层） | `django-app/third_party_api_gateway/{api,urls,models}.py`（挂在 `/api/third-party/`） |
| 三方 API 模型 | `django-app/third_party_api_gateway/models.py`（`MeshyTaskMirror` + `VideoGenerationTaskMirror`） |
| 组件库 | `django-app/dvs_editor/api/component_library.py` + `django-app/dvs_editor/models.py` |
| Agent Skills App | `django-app/agentSkills/`（sceneLayoutSkill / sceneUnderstandSkill / unreal_export） |
