# DVStudio v0.1.0（首个安装包）

## 发布内容

- 首个 Windows 客户端安装包（安装版 + 免安装版）
- AI 工作流蓝图编辑能力（资源/剧情/分支）
- 视频编辑器（舞台 + 时间轴关键帧）
- 本地 Django 后端与 AI 接入链路

## 运行环境流程（首启自动）

- Python 检测（3.11+），缺失时自动尝试安装（Windows + winget）
- 创建 DVSResource 与 Python 虚拟环境
- Django migrate + 启动
- 关键依赖检查与自动补装
- ffmpeg 可选检测（缺失仅告警，不阻断流程；仅影响视频导出）

## 安装与使用

详见：`docs/INSTALL_PACKAGE.md`
