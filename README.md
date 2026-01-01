# DVStudio (Dweb Video Studio)

🎬 一个基于 **Vite + Vue 3 + TypeScript + WebGL2** 的「视频动画模板/编辑器」项目。

✨ 目标：让用户通过编辑节点（矩形/文字/图片/线条）与时间轴关键帧，快速生成可用于视频的动画与“思维导图”视觉效果，并提供 🤖 AI 对话辅助生成/修改场景。

🔗 开源仓库：<https://github.com/412845222/DVStudio>

🌐 官方网站：<https://www.dweb.club/>

📺 B站：<https://space.bilibili.com/22690066>（B站包月进入赞助交流群）

---

## 🚀 快速开始（前端）

### ✅ 环境要求

| 项目 | 版本建议 |
|---|---|
| Node.js | 16+（建议 18+） |
| npm | 与 Node.js 配套 |

### 📦 安装 & 启动

```bash
npm install
npm run dev
```

### 🏗 构建

```bash
npm run build
```

---

## 🧩 后端（Django SSE / AI 接入）

后端目录位于：`django-app/`

### ✅ 环境要求

| 项目 | 版本建议 |
|---|---|
| Python | 3.9+（在 Django 4.2 支持范围内） |
| pip | 最新即可 |

### 📦 安装依赖

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

### ▶️ 运行服务

```bash
python django-app/manage.py migrate
python django-app/manage.py runserver 5800
```

### 🔌 端口说明（前端需要）

- 本仓库的前端开发服务（Vite）在 [vite.config.ts](vite.config.ts) 中将 `/api` 代理到 `http://127.0.0.1:5800`。
- 因此本地开发时建议 Django 按上面命令运行在 `5800` 端口，否则前端的 `/api/...` 请求会连不上。
- 如需改端口：
	- 方式 A：改 [vite.config.ts](vite.config.ts) 里的代理 `target`
	- 方式 B：设置前端后端地址（优先级：`window.__DWEB_BACKEND_BASE_URL` → `VITE_BACKEND_BASE_URL` → `localStorage:dweb.backendBaseUrl`）

### 🔐 DeepSeek 配置（务必不要提交密钥）

本项目会读取以下环境变量（推荐）：

| 变量 | 示例 | 说明 |
|---|---|---|
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | OpenAI 兼容接口 base url |
| `DEEPSEEK_API_KEY` | `sk-...` | API Key（不要提交） |
| `DEEPSEEK_MODEL` | `deepseek-chat` | 默认模型 |

如需本地快速跑通，也可在 `django-app/dwebapp/deepseek_secrets.py` 填写（该文件已在 `.gitignore` 中忽略）。

---

## 🧱 节点类型（4 种）

项目当前主要提供 4 类节点：

| 节点 | 用途 | 常见操作 |
|---|---|---|
| 🟦 矩形（Rect） | 卡片/背景/容器 | 位置/尺寸/圆角/颜色/透明度 |
| 🔤 文字（Text） | 标题/正文/标注 | 内容/字号/对齐/颜色/透明度 |
| 🖼 图片（Image） | 头像/插图/图标 | 替换图片/缩放/裁剪(视实现)/透明度 |
| ✏️ 线条（Line） | 连接/指向/思维导图连线 | 起点/终点/控制点/线宽/颜色/滤镜 |

🎨 滤镜能力：线条/节点支持 blur、glow 以及自定义 shader（以当前工程实现为准）。

---

## ⏱ 时间轴动画使用方法

时间轴位于页面底部（见 [src/views/VideoStudio.vue](src/views/VideoStudio.vue)），支持：播放/暂停/停止、循环、FPS/总帧数设置、关键帧与缓动曲线。

### 1) 创建图层

🧱 在时间轴左侧点击「新建」创建图层（Layer）。

### 2) 设置帧数与 FPS

🎛 在顶部工具条设置：

- `FPS`
- `总帧数`
- `当前帧`

### 3) 添加关键帧

📌 在图层的帧格上通过右键菜单/双击（以实际 UI 为准）添加关键帧。

### 4) 设置缓动（Easing）

📈 在两个关键帧之间，可以启用缓动段并编辑曲线（时间轴内置曲线编辑器）。

### 5) 播放预览

▶️ 点击「播放」，时间轴会驱动舞台按帧插值更新节点属性（位置/尺寸/旋转/透明度等），并同步滤镜参数。

---

## 🤖 AI 智能对话辅助

编辑器内置「AI助手」对话框（可在舞台工具栏打开/最小化），用于：

- 🧠 根据自然语言生成节点与布局
- 🛠 批量修改属性（例如统一颜色/尺寸/对齐）
- 🧩 为节点添加滤镜（如 glow/blur）
- 🧾 输出可复现的结构化指令（由后端 SSE 推送给前端并逐步执行）

📡 通信方式：后端 Django 提供 SSE 流式接口，前端实时消费并将结构化消息应用到舞台/时间轴。

---

## 🗂 目录结构（简表）

| 路径 | 说明 |
|---|---|
| `src/` | 前端主代码（Vue 3 + TS） |
| `src/engine/` | WebGL2 渲染引擎与滤镜管线 |
| `src/ui/` | UI 组件（舞台/时间轴/AI 对话框等） |
| `src/store/` | Vuex Store（视频场景/时间轴/编辑器状态） |
| `django-app/` | Django 后端（SSE + AI 接入） |

---

## 🧑‍💻 开发建议

✅ 推荐 IDE：VS Code

✅ 常用命令：

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动前端开发服务 |
| `npm run build` | 前端构建 |
| `python django-app/manage.py runserver` | 启动后端 |

---

## 📄 License

MIT © DwebStudio
