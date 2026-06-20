# 桌面端开发指引 (Electron Guide)

## 1. 架构定位
Electron 在本项目中主要作为“壳”，提供以下能力：
- 独立的浏览器窗口运行 Vue 前端。
- 随应用启动和关闭本地的 Django 后端进程。
- 提供 Node.js 级别的本地文件系统访问能力。

## 2. 进程通信 (IPC)
- **主进程 (`electron/main.mjs`)**: 注册 `ipcMain.handle` 监听器。
- **预加载脚本 (`electron/preload.mjs`)**: 通过 `contextBridge.exposeInMainWorld` 暴露安全的 API 给前端 (`window.electronBridge`)。
- **渲染进程 (Vue)**: 通过 `src/electronBridge/index.ts` 封装调用。

## 3. 本地资源管理 (`DVSResource/`)
- Electron 启动时，会确定一个本地资源目录（开发环境下通常是项目根目录的 `DVSResource`，生产环境下是用户的 AppData 目录）。
- 所有的本地数据库、用户设置 (`UserSettings/settings.json`)、下载的媒体资源都应存放在此目录下。

## 4. 后端进程管理
- `electron/backend/django.mjs` 负责在 Electron 启动时 spawn Python 进程运行 Django。
- 必须确保在 Electron 退出时，正确 kill 掉 Django 进程，避免孤儿进程占用端口 (5800)。