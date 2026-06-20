# 系统架构 (Architecture)

## 1. 全栈架构
DVStudio 采用 **前端 (Vue 3) + 后端 (Django) + 桌面端壳 (Electron)** 的三层架构。

- **前端 (Frontend)**: 负责 UI 渲染、WebGL2 画布绘制、状态管理 (Vuex)、用户交互。
- **后端 (Backend)**: 负责 AI 接口代理、SSE 流式对话、复杂业务逻辑（如字幕解析、大模型对话）。
- **桌面端 (Desktop)**: 提供本地文件系统访问、本地环境隔离、一键安装包能力。

## 2. 核心目录结构

```text
DVStudio/
├── src/                  # 前端源码 (Vue 3 + TS)
│   ├── engine/           # WebGL2 渲染引擎与滤镜管线
│   ├── ui/               # UI 组件 (舞台/时间轴/蓝图等)
│   ├── store/            # Vuex 状态管理
│   ├── core/             # 核心业务逻辑 (场景、节点、历史记录等)
│   ├── network/          # API 请求与服务封装
│   └── views/            # 页面级组件
├── django-app/           # 后端源码 (Django)
│   ├── dwebapp/          # 核心 App (AI 对话, 凭证管理等)
│   ├── aiworkflow_project/ # AI 工作流相关后端逻辑
│   ├── comfyui_bridge/   # ComfyUI 桥接服务
│   └── ...
├── electron/             # 桌面端源码
│   ├── main.mjs          # 主进程入口
│   ├── preload.mjs       # 预加载脚本 (暴露 API 给渲染进程)
│   └── backend/          # 管理本地 Django 进程的脚本
└── DVSResource/          # (运行时生成) 本地资源与配置目录
```

## 3. 数据流转机制
1. **用户交互**: 用户在 Vue 组件中触发操作。
2. **状态更新**: 组件调用 Vuex Action/Mutation 更新全局状态。
3. **渲染更新**: 状态变更驱动 Vue 响应式 UI 更新，或触发 WebGL2 引擎重新渲染。
4. **后端通信**: 需要 AI 辅助或持久化时，通过 `src/network/` 中的 Service 调用 Django API。
5. **本地能力**: 需要读写本地文件时，通过 `window.electronBridge` 调用 Electron 主进程能力。