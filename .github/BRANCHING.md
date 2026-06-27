# 分支治理规范

## 分支结构

```
main          ← 稳定发行版，仅接收从 dev 合并的 PR
dev           ← 开发主线，接收从 feature 分支合并的 PR
feature/*     ← 功能开发分支，从 dev 创建
hotfix/*      ← 紧急修复分支，从 main 创建
release/*     ← 发布准备分支，从 dev 创建
```

## 分支命名规范

| 前缀 | 用途 | 示例 |
|------|------|------|
| `feature/` | 新功能开发 | `feature/add-ai-assistant` |
| `hotfix/` | 紧急bug修复 | `hotfix/fix-crash-on-startup` |
| `release/` | 发布准备 | `release/v1.0.0` |
| `refactor/` | 代码重构 | `refactor/improve-performance` |
| `docs/` | 文档更新 | `docs/update-readme` |
| `test/` | 测试相关 | `test/add-unit-tests` |

## 工作流程

### 1. 开发新功能

```bash
# 从 dev 创建 feature 分支
git checkout dev
git pull origin dev
git checkout -b feature/your-feature-name

# 开发完成后推送到远程
git push origin feature/your-feature-name

# 在 GitHub 创建 PR → 目标分支: dev
```

### 2. 合并到 dev

- 创建 PR: `feature/xxx` → `dev`
- 需要通过 CI 检查
- 合并后删除 feature 分支

### 3. 发布到 main

```bash
# 从 dev 创建 release 分支（可选，用于预发布测试）
git checkout dev
git checkout -b release/v1.0.0

# 测试完成后创建 PR → 目标分支: main
# 合并后打标签
git tag v1.0.0
git push origin v1.0.0
```

### 4. 紧急修复

```bash
# 从 main 创建 hotfix 分支
git checkout main
git checkout -b hotfix/fix-urgent-bug

# 修复完成后推送到远程
git push origin hotfix/fix-urgent-bug

# 创建两个 PR:
#   1. hotfix → main（紧急修复）
#   2. hotfix → dev（同步修复）
```

## 分支保护规则

| 分支 | 保护策略 |
|------|---------|
| `main` | ✅ 禁止直接推送，需 PR 合并 |
| `dev` | ✅ 禁止直接推送，需 PR 合并 |
| `feature/*` | ❌ 无保护，可直接推送 |
| `hotfix/*` | ❌ 无保护，可直接推送 |

## Commit 规范

使用 Conventional Commits 格式：

```
<type>(<scope>): <description>

<optional body>

<optional footer>
```

### Type 类型

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | bug修复 |
| `docs` | 文档更新 |
| `style` | 代码格式（不影响逻辑） |
| `refactor` | 重构（既不新增功能也不修复bug） |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `build` | 构建/打包相关 |
| `ci` | CI/CD配置 |
| `chore` | 其他杂项 |

## PR 规范

### PR 标题

```
<type>(<scope>): <description>
```

### PR 描述模板

```markdown
## 变更说明

请简要描述本次变更的内容和目的。

## 变更类型

- [ ] 新功能 (Feature)
- [ ] Bug修复 (Fix)
- [ ] 代码重构 (Refactor)
- [ ] 文档更新 (Docs)
- [ ] 测试相关 (Test)
- [ ] 构建/CI (Build/CI)

## 测试验证

请描述如何验证本次变更的正确性。

## 影响范围

请说明本次变更可能影响的功能模块或文件。

## 相关 Issue

如有相关的 Issue 或 PR，请在此链接。
```

## 标签管理

| 标签格式 | 用途 |
|---------|------|
| `vX.Y.Z` | 正式版本发布 |
| `vX.Y.Z-beta.N` | 测试版本 |
| `vX.Y.Z-rc.N` | 候选版本 |

## 冲突处理

当本地分支落后于远程分支时：

```bash
# 使用 rebase 保持线性历史（推荐）
git checkout dev
git pull origin dev --rebase

# 如果有冲突，解决后继续
git add .
git rebase --continue

# 如果无法解决，放弃 rebase
git rebase --abort
```

## 定期清理

建议定期清理本地和远程的过时分支：

```bash
# 清理本地已合并的分支
git branch --merged dev | grep -v "\*" | xargs -n 1 git branch -d

# 清理远程已删除的分支引用
git fetch --prune
```

## 版本号规则

使用语义化版本（Semantic Versioning）：

- **主版本号 (Major)**：不兼容的API变更
- **次版本号 (Minor)**：向后兼容的功能新增
- **修订号 (Patch)**：向后兼容的bug修复

示例：`v1.0.0` → `v1.1.0` → `v1.1.1` → `v2.0.0`
