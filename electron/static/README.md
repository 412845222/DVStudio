# Electron Static Resources

该目录用于 **Electron 打包时随应用一起携带的静态资源**（非前端 public/ 资源）。

当前包含：
- `bootstrap/`：用于“空白环境一键安装依赖”的脚本与说明。

## 开发期如何模拟空白环境

启动 Electron 时设置环境变量即可让诊断面板强制显示为缺失：

- `DWEB_SIMULATE_EMPTY_ENV=1`

例如（开发期）：
- `cross-env DWEB_SIMULATE_EMPTY_ENV=1 npm run dev:electron:app`

> 说明：这是“模拟缺失”的 UI/诊断模式，不会真的卸载你的 Python/ffmpeg。
