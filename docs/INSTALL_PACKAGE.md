# DVStudio Windows 安装包使用说明

适用版本：`v0.1.0`（首个公开安装包）

## 1. 下载

请从项目 Release 页面下载：

- `release-20260224-175649.zip`

下载入口：<https://github.com/412845222/DVStudio/releases/latest>

## 2. 压缩包内容

该 zip 同时包含两种运行方式：

- **安装版（推荐）**：通过安装程序安装
- **免安装版（便携）**：直接运行 `win-unpacked` 中的可执行文件

## 3. 安装版使用（推荐）

1. 解压 zip
2. 找到安装程序（通常为 `Dweb Video Studio Setup*.exe`）
3. 双击安装，完成后从桌面或开始菜单启动

## 4. 免安装版使用

1. 解压 zip
2. 进入 `win-unpacked/`
3. 运行 `Dweb Video Studio.exe`

> 说明：免安装版同样会在本机创建运行时数据目录。

## 5. 首次启动环境流程（自动执行）

客户端启动后会进入 Welcome 环境检查流程，主要步骤如下：

1. **Python 检查**
   - 检查 `python/py` 命令与版本（要求 `3.11+`）
   - 若缺失或版本不满足，Windows 下会尝试自动使用 `winget` 安装 Python
   - 若自动安装失败，会明确提示“Python 不存在或版本不满足”
2. **创建运行目录**
   - 创建 `DVSResource`、`UserSettings`、`BackendData`
3. **创建 Python 虚拟环境**
   - 在 `DVSResource/.venv` 创建/复用 venv
4. **准备 Django 运行时项目**
   - 复制模板代码到运行目录并清理敏感/临时文件
5. **启动 Django 后端**
   - 自动执行 `migrate` 后启动后端服务
6. **依赖检查与补装**
   - 检查 Django 关键依赖（含 `cryptography`）
   - 缺失时自动执行 `pip install -r requirements.txt`
7. **ffmpeg 检查（可选）**
   - 若缺失仅显示 `warn`，**不会阻断启动流程**
   - 影响范围：动画编辑器视频导出能力不可用

## 6. ffmpeg 缺失时的影响

- 可以正常进入项目与进行编辑
- 仅在“导出视频”相关功能中受限
- 需要时可后续安装 ffmpeg 再重试导出

## 7. 常见问题

### Q1：提示没有 Python 怎么办？

- 优先安装 `winget`（Microsoft App Installer）后重试
- 或手动安装 Python 3.11+，并确保命令行可执行：
  - `python --version`
  - `py -3 --version`

### Q2：首次启动比较慢正常吗？

正常。首次启动会创建 venv、迁移数据库并检查/安装依赖。

### Q3：数据目录在哪里？

运行时会在客户端目录或用户数据目录下创建 `DVSResource/`，包含后端与配置数据。
