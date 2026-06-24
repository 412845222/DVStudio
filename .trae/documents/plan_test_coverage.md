# 测试覆盖率开发与部署计划

> 版本: v1.0
> 配套文档: `AGENT_GUIDE.md`, `03_Frontend_Vue3_Test_Plan.md`

---

## 1. 概述与目标

本计划旨在为 DVStudio 前端（Vue 3 + TypeScript + WebGL2）建立完整的测试覆盖体系，采用 **Vitest 2.x** 作为测试框架，实现以下目标：

- **行覆盖率**: ≥ 55%（核心纯函数模块 ≥ 85%）
- **分支覆盖率**: ≥ 45%
- **函数覆盖率**: ≥ 60%
- **代码质量门槛**: TypeScript 编译 + ESLint + Vitest 测试均需通过

---

## 2. 当前状态分析

### 2.1 项目现状

| 项目 | 状态 |
|------|------|
| vitest 配置 | ❌ 不存在 |
| 测试依赖 | ❌ 未安装 |
| 测试目录 | ❌ 不存在 |
| CI 测试步骤 | ⚠️ 需追加 |

### 2.2 技术栈

- **框架**: Vue 3 (Composition API) + TypeScript
- **构建**: Vite 3.2.3
- **状态管理**: Vuex 4
- **渲染引擎**: WebGL2
- **测试框架**: Vitest 2.x（待安装）

### 2.3 源码结构（待测）

```
src/
├── core/
│   ├── shared/          # 纯函数工具（json.ts, cloneJsonSafe.ts, time.ts）
│   ├── events/          # 事件系统（typedEventBus.ts, dvsEvents.ts）
│   ├── subtitle/        # 字幕处理（srt.ts, subtitleKeyframes.ts, sanitizeStageSnapshot.ts）
│   ├── project/package/ # 项目序列化（assets.ts, ids.ts, io.ts, normalize.ts 等）
│   ├── scene/           # 场景节点系统
│   │   ├── nodesType/  # 节点类型
│   │   ├── commands/   # 命令系统
│   │   ├── factories/   # 工厂函数
│   │   ├── geometry.ts
│   │   ├── tree.ts
│   │   └── treeTypes.ts
│   ├── history/         # 编辑器历史栈
│   ├── timeline/        # 时间线
│   ├── components/      # 组件验证/实例化
│   └── agentToUI/       # AI 到 UI 转换
├── store/               # Vuex stores
│   ├── aiworkflow/
│   ├── theme/
│   ├── timeline/
│   ├── videoscene/
│   └── videostudio/
├── network/             # 网络服务层
│   ├── runtimePlatform.ts
│   ├── backendConfig.ts
│   ├── AIChatService.ts
│   ├── BlueprintProjectService.ts
│   └── ...
├── engine/webgl/        # WebGL2 引擎
│   ├── camera/
│   ├── material/
│   ├── pipeline/
│   ├── renderers/
│   ├── texture/
│   └── ...
└── ui/                  # Vue 组件
```

---

## 3. 实施计划

### 阶段 1: 基础设施搭建（M1）

#### 3.1.1 安装测试依赖

**文件**: `package.json`

```json
{
  "devDependencies": {
    // 现有依赖保持不变...
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "@vue/test-utils": "^2.4.0",
    "jsdom": "^24.0.0",
    "@types/node": "^20.0.0"
  }
}
```

#### 3.1.2 创建 vitest 配置

**文件**: `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@electron': path.resolve(__dirname, 'electron'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'tests/unit/**/*.test.ts',
      'tests/components/**/*.spec.ts',
      'tests/engine/**/*.test.ts',
    ],
    setupFiles: ['./tests/setup-frontend.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov', 'json'],
      reportsDirectory: 'coverage/frontend',
      include: [
        'src/core/**/*.ts',
        'src/store/**/*.ts',
        'src/network/**/*.ts',
        'src/engine/webgl/**/*.ts',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.vue',
        'src/core/**/types.ts',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
      ],
      thresholds: {
        lines: 55,
        functions: 60,
        branches: 45,
        statements: 55,
      },
    },
  },
})
```

#### 3.1.3 创建测试 setup 文件

**文件**: `tests/setup-frontend.ts`

- 模拟 Electron 桥（`window.dweb`）
- 桩 `fetch` 函数
- WebGL2 上下文桩

#### 3.1.4 添加 npm scripts

**文件**: `package.json`

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "vue-tsc --noEmit",
    "lint": "eslint \"src/**/*.{ts,vue}\" \"electron/**/*.{mjs,js}\"",
    "quality": "npm run typecheck && npm run lint && npm run test"
  }
}
```

---

### 阶段 2: 纯函数层测试（M1-M2）

#### 3.2.1 `src/core/shared/` 测试

| 文件 | 测试用例数 | 重点 |
|------|-----------|------|
| `json.ts` | 6-8 | `isJsonObject` 类型守卫 |
| `cloneJsonSafe.ts` | 8-12 | 深拷贝、循环引用、Vuex Proxy |
| `time.ts` | 4-6 | 时间戳互转、时区 |

**创建文件**:
- `tests/unit/core/shared/json.test.ts`
- `tests/unit/core/shared/cloneJsonSafe.test.ts`
- `tests/unit/core/shared/time.test.ts`

#### 3.2.2 `src/core/events/` 测试

| 文件 | 测试用例数 | 重点 |
|------|-----------|------|
| `typedEventBus.ts` | 8-10 | on/emit/off 生命周期、异常处理 |
| `dvsEvents.ts` | 4-6 | 全局事件总线、内存泄漏检测 |

**创建文件**:
- `tests/unit/core/events/typedEventBus.test.ts`
- `tests/unit/core/events/dvsEvents.test.ts`

#### 3.2.3 `src/core/subtitle/` 测试

| 文件 | 测试用例数 | 重点 |
|------|-----------|------|
| `srt.ts` | 8-10 | SRT 解析、非法时间戳、往返 |
| `subtitleKeyframes.ts` | 4-6 | 关键帧对齐 |
| `sanitizeStageSnapshot.ts` | 4-6 | 快照规范化 |

**创建文件**:
- `tests/unit/core/subtitle/srt.test.ts`
- `tests/unit/core/subtitle/subtitleKeyframes.test.ts`
- `tests/unit/core/subtitle/sanitizeStageSnapshot.test.ts`

#### 3.2.4 `src/core/project/package/` 测试

| 文件 | 测试用例数 | 重点 |
|------|-----------|------|
| `assets.ts` | 4-6 | 资产引用收集、去重 |
| `ids.ts` | 3-5 | ID 生成格式 |
| `io.ts` | 5-8 | 文件导入/导出往返 |
| `normalize.ts` | 4-6 | 字段默认值 |
| `rewriteAssetIds.ts` | 4-6 | ID 重写映射 |
| `serialize.ts` | 4-6 | 序列化边界 |

**创建文件**:
- `tests/unit/core/project/package/assets.test.ts`
- `tests/unit/core/project/package/ids.test.ts`
- `tests/unit/core/project/package/io.test.ts`
- `tests/unit/core/project/package/normalize.test.ts`
- `tests/unit/core/project/package/rewriteAssetIds.test.ts`
- `tests/unit/core/project/package/serialize.test.ts`

#### 3.2.5 `src/core/scene/` 测试

**nodesType**:
- `tests/unit/core/scene/nodesType/NodeBase.test.ts`
- `tests/unit/core/scene/nodesType/ImageNode.test.ts`
- `tests/unit/core/scene/nodesType/upgradeNodeType.test.ts`
- `tests/unit/core/scene/nodesType/numbers.test.ts`

**commands**:
- `tests/unit/core/scene/commands/nodes.test.ts`
- `tests/unit/core/scene/commands/lines.test.ts`
- `tests/unit/core/scene/commands/moveNode.test.ts`
- `tests/unit/core/scene/commands/selection.test.ts`
- `tests/unit/core/scene/commands/snap.test.ts`
- `tests/unit/core/scene/commands/overlay.test.ts`

**其他**:
- `tests/unit/core/scene/geometry.test.ts`
- `tests/unit/core/scene/tree.test.ts`
- `tests/unit/core/scene/factories/videoSceneState.test.ts`

#### 3.2.6 `src/core/history/` 测试

- `tests/unit/core/history/editorHistoryCore.test.ts`

#### 3.2.7 `src/core/timeline/` 测试

- `tests/unit/core/timeline/factories.test.ts`
- `tests/unit/core/timeline/index.test.ts`

#### 3.2.8 `src/core/components/` 和 `src/core/agentToUI/` 测试

- `tests/unit/core/components/validate.test.ts`
- `tests/unit/core/components/instantiate.test.ts`
- `tests/unit/core/agentToUI/videoScenePlan.test.ts`
- `tests/unit/core/agentToUI/guards.test.ts`

---

### 阶段 3: 状态管理层测试（M2-M3）

#### 3.3.1 Vuex Store 测试

| Store | 测试文件 |
|-------|---------|
| aiworkflow | `tests/unit/store/aiworkflow.test.ts` |
| theme | `tests/unit/store/theme.test.ts` |
| timeline | `tests/unit/store/timeline.test.ts` |
| videoscene | `tests/unit/store/videoscene.test.ts` |
| videostudio | `tests/unit/store/videostudio.test.ts` |

---

### 阶段 4: 网络服务层测试（M2-M3）

#### 3.4.1 Network Service 测试

| 文件 | 测试文件 |
|------|---------|
| `runtimePlatform.ts` | `tests/unit/network/runtimePlatform.test.ts` |
| `backendConfig.ts` | `tests/unit/network/backendConfig.test.ts` |
| `AIChatService.ts` | `tests/unit/network/AIChatService.test.ts` |
| `BlueprintProjectService.ts` | `tests/unit/network/BlueprintProjectService.test.ts` |
| `ComfyUIBridgeService.ts` | `tests/unit/network/ComfyUIBridgeService.test.ts` |
| `ExportService.ts` | `tests/unit/network/ExportService.test.ts` |
| `SubtitleAIService.ts` | `tests/unit/network/SubtitleAIService.test.ts` |

---

### 阶段 5: 组件层测试（M3-M4）

#### 3.5.1 Vue 组件 Smoke Test

| 组件 | 测试文件 |
|------|---------|
| `ModalDialog.vue` | `tests/components/ui/ModalDialog.spec.ts` |
| `ToastStack.vue` | `tests/components/ui/ToastStack.spec.ts` |
| `VideoScene.vue` | `tests/components/ui/VideoScene.spec.ts` |
| `TimeLine.vue` | `tests/components/ui/TimeLine.spec.ts` |
| `AIChatDialog.vue` | `tests/components/ui/AIChatDialog.spec.ts` |
| 节点表单 | `tests/components/ui/VideoStudioNodeForms.spec.ts` |

---

### 阶段 6: WebGL2 引擎层测试（M4-M5）

#### 3.6.1 引擎纯函数测试

| 文件 | 测试文件 |
|------|---------|
| `camera2d.ts` | `tests/engine/camera2d.test.ts` |
| `glProgram.ts` | `tests/engine/glProgram.test.ts` |
| `texture2d.ts` | `tests/engine/texture2d.test.ts` |

---

### 阶段 7: CI/CD 集成（M4）

#### 3.7.1 GitHub Actions 工作流更新

**文件**: `.github/workflows/test.yml`（新建）

```yaml
name: Test & Coverage

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]
  schedule:
    - cron: '0 3 * * *'  # 每日 03:00 UTC

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci --prefer-offline
      - name: Type Check
        run: npx vue-tsc --noEmit
      - name: Lint
        run: npx eslint "src/**/*.{ts,vue}"
      - name: Frontend tests with coverage
        run: npx vitest run --coverage
      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-frontend
          path: coverage/frontend/
          retention-days: 14
```

---

## 4. 测试目录结构

```
DVStudio/
├── tests/
│   ├── setup-frontend.ts           # 全局桩
│   ├── unit/
│   │   ├── core/
│   │   │   ├── shared/
│   │   │   ├── events/
│   │   │   ├── subtitle/
│   │   │   ├── project/package/
│   │   │   ├── scene/
│   │   │   ├── history/
│   │   │   ├── timeline/
│   │   │   ├── components/
│   │   │   └── agentToUI/
│   │   ├── store/
│   │   └── network/
│   ├── components/
│   │   └── ui/
│   └── engine/
├── vitest.config.ts
└── package.json
```

---

## 5. 覆盖率目标与阶段

| 阶段 | 时间 | 目标行覆盖率 | 新增文件数 |
|------|------|-------------|-----------|
| M1 | 第 1 周 | 30% | ~15 个 .test.ts |
| M2 | 第 2-3 周 | 55% | +10 个 |
| M3 | 第 4 周 | 65% | +10 个 .spec.ts |
| M4 | 第 5-6 周 | 75% | +20 个 |
| M5 | 持续 | ≥ 85% | 缺陷回归 |

---

## 6. 关键文件清单

### 新建文件（按优先级）

**优先级 P0（基础设施）**:
1. `vitest.config.ts`
2. `tests/setup-frontend.ts`
3. 更新 `package.json`（依赖 + scripts）

**优先级 P1（核心纯函数）**:
4. `tests/unit/core/shared/json.test.ts`
5. `tests/unit/core/shared/cloneJsonSafe.test.ts`
6. `tests/unit/core/events/typedEventBus.test.ts`
7. `tests/unit/core/subtitle/srt.test.ts`
8. `tests/unit/core/project/package/io.test.ts`

**优先级 P2（业务领域）**:
9. `tests/unit/core/scene/geometry.test.ts`
10. `tests/unit/core/scene/tree.test.ts`
11. `tests/unit/core/history/editorHistoryCore.test.ts`
12. `tests/unit/core/timeline/factories.test.ts`

**优先级 P3（状态管理 + 网络）**:
13. `tests/unit/store/videoscene.test.ts`
14. `tests/unit/network/runtimePlatform.test.ts`
15. `tests/unit/network/backendConfig.test.ts`

**优先级 P4（组件 + 引擎）**:
16. `tests/components/ui/ModalDialog.spec.ts`
17. `tests/engine/camera2d.test.ts`

**优先级 P5（CI）**:
18. `.github/workflows/test.yml`

---

## 7. 验证步骤

### 本地验证

```bash
# 1. 安装依赖后运行测试
npm ci
npm run test

# 2. 查看覆盖率报告
npm run test:coverage
# 报告生成在 coverage/frontend/index.html

# 3. 完整质量检查
npm run quality
```

### CI 验证

- Push 到 `main` 或 `dev` 分支触发完整流程
- 查看 GitHub Actions 日志确认测试通过
- 下载 `coverage-frontend` artifact 查看覆盖率报告

---

## 8. 风险与注意事项

1. **Vue 单文件组件**: 测试写在 `.spec.ts` 中 mount 组件，`.vue` 文件不纳入 coverage
2. **WebGL2 上下文**: jsdom 不支持真实 GL，通过 `vi.stubGlobal` 提供桩
3. **异步测试**: 使用 `await flushPromises()` 处理 Promise
4. **全局状态隔离**: 每个测试创建独立 store 实例，使用 `vi.resetAllMocks()`
5. **Electron 桥**: `setup-frontend.ts` 中提供完整桩对象
