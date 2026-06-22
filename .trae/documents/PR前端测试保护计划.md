# PR 前端测试流水线保护计划

## 目标

确保所有合并到 `main` 和 `dev` 分支的 PR 必须通过前端测试流水线，保护前端开发符合规范。

## 当前状态分析

### 1. 当前 CI/CD 配置

当前 `.github/workflows/test.yml` 已包含：
- ✅ `check-meta` - 版本和目录检查
- ✅ `lint` - ESLint + TypeScript 类型检查
- ✅ `build` - Vite 构建验证
- ✅ `test-frontend` - 多平台前端测试 (ubuntu/windows/macos)
- ✅ `test-electron` - Electron 主进程测试
- ✅ `coverage-aggregate` - 覆盖率聚合

### 2. 待完善项

| 项目 | 当前状态 | 需要做什么 |
|------|----------|------------|
| 分支保护规则 | ❌ 未配置 | 在 GitHub 设置中配置 |
| PR 状态检查 | ❌ 未配置 | 启用 status checks |
| PR 审核要求 | ❌ 未配置 | 启用 require approval |
| CODEOWNERS | ✅ 已创建 | 需要替换占位符 |
| 自动标签 | ❌ 未配置 | 添加 PR 自动标签 |

## 实施计划

### 阶段一：完善 CI/CD 工作流配置

#### 1.1 更新 test.yml 添加 status check 标记

**文件**: `.github/workflows/test.yml`

修改内容：
- 添加 `checks: write` 权限
- 添加 PR 评论覆盖率摘要
- 确保关键 job 失败会阻断合并

#### 1.2 创建 PR 自动标签工作流

**文件**: `.github/workflows/pr-labeler.yml`

功能：
- 根据 PR 修改的文件自动添加标签
- 标签示例：`frontend`, `backend`, `tests`, `ci`, `dependencies`

### 阶段二：配置分支保护规则

#### 2.1 配置 main 分支保护

**操作位置**: GitHub → Settings → Branches → Branch protection rules

| 设置项 | 值 |
|--------|------|
| Require a pull request before merging | ✅ |
| Require approvals | 1 |
| Dismiss stale pull request approvals | ✅ |
| Require status checks to pass | ✅ |
| Status checks: lint, build, test-frontend (ubuntu-latest) | ✅ |
| Require branches to be up to date | ✅ |
| Include administrators | ✅ |
| Allow force pushes | ❌ |
| Allow deletions | ❌ |

#### 2.2 配置 dev 分支保护

与 main 分支相同配置

### 阶段三：完善 CODEOWNERS

#### 3.1 更新 CODEOWNERS 文件

**文件**: `.github/CODEOWNERS`

替换 `@your-github-handle` 为实际 GitHub 用户名 `@412845222`

### 阶段四：添加 PR 模板

#### 4.1 创建 PR 模板

**文件**: `.github/PULL_REQUEST_TEMPLATE.md`

内容包含：
- PR 类型选择（feat/fix/chore/test/docs）
- 变更描述
- 测试验证说明
- 相关 issue 链接

### 阶段五：添加 Issue 模板

#### 5.1 创建 Issue 模板

**文件**: `.github/ISSUE_TEMPLATE/bug_report.md`
**文件**: `.github/ISSUE_TEMPLATE/feature_request.md`

## 验证步骤

### 本地验证
```bash
cd DVStudio
npm ci
npm run lint        # 验证 lint 通过
npm run typecheck   # 验证类型检查通过
npm run test:coverage  # 验证测试通过
npm run build       # 验证构建通过
```

### GitHub 验证
1. 提交一个包含错误的 PR
2. 验证 CI 流水线运行并失败
3. 验证 PR 无法合并（显示需要修复）
4. 修复错误后重新推送
5. 验证 CI 通过后可以合并

## 文件清单

需要创建/修改的文件：

| 文件路径 | 操作 | 说明 |
|----------|------|------|
| `.github/workflows/test.yml` | 修改 | 添加权限和 PR 评论 |
| `.github/workflows/pr-labeler.yml` | 新建 | PR 自动标签 |
| `.github/CODEOWNERS` | 修改 | 替换占位符 |
| `.github/PULL_REQUEST_TEMPLATE.md` | 新建 | PR 模板 |
| `.github/ISSUE_TEMPLATE/bug_report.md` | 新建 | Bug 报告模板 |
| `.github/ISSUE_TEMPLATE/feature_request.md` | 新建 | 功能请求模板 |

## 风险评估

| 风险 | 描述 | 缓解措施 |
|------|------|----------|
| CI 运行时间过长 | 影响开发效率 | 优化缓存策略，并行执行测试 |
| 覆盖率阈值过高 | 阻碍 PR 合并 | 设置合理阈值，逐步提升 |
| 误报失败 | 阻塞开发 | 设置 `continue-on-error: true` 对非关键检查 |

## 里程碑

| 阶段 | 目标 | 交付物 |
|------|------|--------|
| M1 | CI 流水线完善 | 更新后的 test.yml |
| M2 | 分支保护配置 | 配置截图/文档 |
| M3 | 模板完善 | PR/Issue 模板 |
| M4 | 验证 | 成功阻止不合格 PR |

---

## 实施步骤详解

### 步骤 1: 更新 test.yml

添加必要的权限和 PR 评论功能：

```yaml
permissions:
  contents: read
  pull-requests: write
  checks: write
```

### 步骤 2: 创建 pr-labeler.yml

```yaml
name: PR Labeler
on:
  pull_request_target:
    types: [opened, synchronize]

jobs:
  labeler:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/labeler@v4
        with:
          repo-token: "${{ secrets.GITHUB_TOKEN }}"
          configuration-path: .github/labeler.yml
```

### 步骤 3: 创建 labeler.yml

```yaml
frontend:
  - src/**/*
  - tests/**/*
  - vitest.config.ts
backend:
  - django-app/**/*
ci:
  - .github/workflows/**/*
  - .github/dependabot.yml
dependencies:
  - package.json
  - package-lock.json
```

### 步骤 4: 更新 CODEOWNERS

```
* @412845222
/src/core/** @412845222
/src/components/** @412845222
/tests/** @412845222
.github/** @412845222
```

### 步骤 5: 创建 PR 模板

```markdown
## 类型选择

- [ ] feat: 新功能
- [ ] fix: 修复 bug
- [ ] chore: 日常维护
- [ ] test: 测试相关
- [ ] docs: 文档更新

## 变更描述

请简要描述本次 PR 的变更内容

## 测试验证

请说明如何验证本次变更

## 相关 Issue

关联的 issue 链接（如有）
```
