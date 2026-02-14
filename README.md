# DVStudio (Dweb Video Studio)

🎬 一个基于 **WebGL2** 的视频编辑与 AI 工作流蓝图项目。

本仓库当前包含两条核心能力：

- **AI 工作流蓝图**：资源 → 剧情/分支 → ComfyUI 推理 → 输出媒体
- **视频编辑器**：舞台节点 + 时间轴关键帧 + AI 对话辅助

🔗 开源仓库：<https://github.com/412845222/DVStudio>

🌐 官方网站：<https://www.dweb.club/>

📺 B站：<https://space.bilibili.com/22690066>（B站包月进入赞助交流群）

---

## 🚀 快速开始

### 前端

| 项目 | 版本建议 |
|---|---|
| Node.js | 16+（建议 18+） |
| npm | 与 Node.js 配套 |

```bash
npm install
npm run dev
```

构建：

```bash
npm run build
```

### 后端（Django SSE / AI 接入）

后端目录：`django-app/`

| 项目 | 版本建议 |
|---|---|
| Python | 3.9+（Django 4.2） |
| pip | 最新即可 |

Windows（PowerShell）：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r django-app\requirements.txt
```

macOS/Linux：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r django-app/requirements.txt
```

运行：

```bash
python django-app/manage.py migrate
python django-app/manage.py runserver 5800
```

前端通过 [vite.config.ts](vite.config.ts) 将 `/api` 代理到 `http://127.0.0.1:5800`。

---

## 🔐 AI 秘钥配置（DeepSeek + NanoBanana）

### 方式一：环境变量（推荐）

| 变量 | 示例 | 说明 |
|---|---|---|
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | DeepSeek OpenAI 兼容 base URL |
| `DEEPSEEK_API_KEY` | `sk-...` | DeepSeek API Key |
| `DEEPSEEK_MODEL` | `deepseek-chat` | DeepSeek 默认模型 |
| `NANOBANANA_API_KEY` | `AIza...` | NanoBanana/Gemini API Key |
| `NANOBANANA_MODEL` | `gemini-2.5-flash-image` | 图像模型（默认该值） |
| `NANOBANANA_API_BASE` | `https://generativelanguage.googleapis.com/v1beta` | Gemini API base |
| `NANOBANANA_GENERATE_URL` | `https://...:generateContent` | 可选，覆盖完整生成 URL |
| `NANOBANANA_STREAM_URL` | `https://...:streamGenerateContent` | 可选，覆盖完整流式 URL |
| `NANOBANANA_TIMEOUT_SEC` | `120` | 请求超时秒数 |

> NanoBanana API Key 获取：<https://aistudio.google.com/apikey>

### 方式二：本地 secrets 文件（仅本地调试）

- DeepSeek：创建 `django-app/dwebapp/deepseek_secrets.py`
- NanoBanana：复制 [django-app/dwebapp/nanobanana_secrets.example.py](django-app/dwebapp/nanobanana_secrets.example.py) 为 `django-app/dwebapp/nanobanana_secrets.py` 并填写

这两个真实 secrets 文件都应保持在 `.gitignore` 忽略状态，**不要提交到仓库**。

---

## 📘 使用文档一：AI 工作流蓝图（优先）

工作流页面入口见 [src/views/AIWorkflow.vue](src/views/AIWorkflow.vue)。

### 1) 画布基础操作

- 鼠标滚轮：缩放（以鼠标位置为中心）
- 右键拖拽：平移画布
- 左键拖拽空白区域：框选节点
- 点击空白区域：清空选择

### 2) 资源与项目

- 在资源面板导入图片/视频资源
- 资源可绑定到图片/视频节点
- 支持项目保存、加载、导入/导出 JSON

### 3) 连线规则

- 连线从节点输出锚点拖到输入锚点
- 仅允许同类型连线（如资源→资源、流程→流程、文本→文本）
- 不合法连接会被过滤并提示

### 4) 当前工作流节点说明

| 节点类型 | 作用 | 典型输入/输出 |
|---|---|---|
| `text` 文本节点 | 保存多行文本资源（提示词/文案） | 输出 `text` |
| `text-merge` 文本拼接节点 | 将多个文本输入按顺序拼接 | 输入 `text`，输出 `text` |
| `image` 图片节点 | 承载图片资源，可做尺寸/裁剪相关设置 | 输入 `resource`，输出 `image` |
| `video` 视频节点 | 承载视频资源，可读取尺寸并生成缩略图 | 输入 `resource`，输出 `video` |
| `story` 剧情节点 | 流程与分支编排（可新增/删除分支） | 输入 `flow/resource`，输出多分支 `flow` |
| `comfyui` 节点 | 连接 ComfyUI、选择工作流并执行推理 | 输入资源/文本，输出图片或视频 |

### 5) ComfyUI 典型流程

1. 新建 `comfyui` 节点并填写 ComfyUI 地址（例如 `http://127.0.0.1:8188`）
2. 点击连接并加载工作流列表
3. 选择工作流，按输入锚点接入 `image/video/text` 节点
4. 点击运行，等待输出回流到资源池与下游节点

---

## 📗 使用文档二：视频编辑器（原有能力）

视频编辑页面见 [src/views/VideoStudio.vue](src/views/VideoStudio.vue)，布局为舞台 + 时间轴。

### 1) 时间轴使用

- 创建图层（Layer）
- 设置 FPS、总帧数、当前帧
- 在帧格中添加关键帧
- 在关键帧之间设置缓动曲线
- 播放预览并观察舞台插值变化

### 2) 舞台与节点

编辑器支持常用舞台节点（矩形/文字/图片/线条）及属性面板编辑。

### 3) AI 辅助

AI 助手可用于：

- 根据自然语言生成布局
- 批量修改样式/属性
- 辅助生成滤镜与结构化修改指令

---

## 🗂 目录结构（简表）

| 路径 | 说明 |
|---|---|
| `src/` | 前端主代码（Vue 3 + TS） |
| `src/views/AIWorkflow.vue` | AI 工作流蓝图页面 |
| `src/views/VideoStudio.vue` | 视频编辑器页面 |
| `src/engine/` | WebGL2 渲染引擎与滤镜管线 |
| `src/ui/` | UI 组件（舞台/时间轴/蓝图等） |
| `src/store/` | Vuex Store（视频场景/时间轴/蓝图状态） |
| `django-app/` | Django 后端（SSE + AI 接入） |

---

## 🧑‍💻 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动前端开发服务 |
| `npm run build` | 前端构建 |
| `python django-app/manage.py runserver 5800` | 启动后端 |

---

## 📄 License

MIT © DwebStudio
