# Windows 一键安装脚本

文件：
- `install.cmd`：双击可运行（会调用 PowerShell 脚本）。
- `install.ps1`：实际安装逻辑。

当前策略（尽量可重复执行、幂等）：
- 优先使用 `winget` 安装 Python 与 ffmpeg。
- 如果 `winget` 不可用，会给出提示（需要用户自行安装 winget / Microsoft Store App Installer）。

脚本会把输出写到 stdout/stderr，Electron 主进程会把它显示在 Welcome 的命令行面板里（前缀 `[bootstrap]`）。

注意：
- 这只是“开发期可运行的最小闭环脚本”。真正发布打包时，应结合你的 Electron 打包器（如 electron-builder）把 `electron/static` 复制到 `process.resourcesPath/static`。
