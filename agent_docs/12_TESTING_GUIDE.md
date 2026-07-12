# 12 - 测试指南（Testing Guide）

> **最后更新**：2026-07-12
> **测试框架**：Vitest + @vue/test-utils
> **测试环境**：jsdom

---

## 目录

1. [测试体系概述](#1-测试体系概述)
2. [测试目录结构](#2-测试目录结构)
3. [运行测试](#3-运行测试)
4. [测试配置](#4-测试配置)
5. [单元测试规范（Unit Tests）](#5-单元测试规范unit-tests)
6. [组件测试规范（Component Tests）](#6-组件测试规范component-tests)
7. [引擎测试规范（Engine Tests）](#7-引擎测试规范engine-tests)
8. [脚本测试规范（Script Tests）](#8-脚本测试规范script-tests)
9. [Mock 与桩对象](#9-mock-与桩对象)
10. [覆盖率](#10-覆盖率)
11. [常见测试模式](#11-常见测试模式)
12. [测试最佳实践](#12-测试最佳实践)

---

## 1. 测试体系概述

项目使用 **Vitest** 作为测试运行器，配合 **@vue/test-utils** 进行 Vue 组件测试，测试环境为 **jsdom** 以模拟浏览器环境。

### 测试分层

| 测试类型 | 目录 | 文件后缀 | 说明 |
|---------|------|---------|------|
| 单元测试 | `tests/unit/` | `*.test.ts` | 核心逻辑、工具函数、Store、Service 等 |
| 组件测试 | `tests/components/` | `*.spec.ts` | Vue 组件渲染与交互 |
| 引擎测试 | `tests/engine/` | `*.test.ts` | WebGL2 渲染引擎相关 |
| 脚本测试 | `tests/scripts/` | `*.test.ts` | 构建/打包/发布脚本 |

### 核心依赖

- `vitest`: 测试运行器与断言库
- `@vue/test-utils`: Vue 组件测试工具
- `@vitejs/plugin-vue`: Vue SFC 支持
- `jsdom`: 浏览器环境模拟
- `@vitest/coverage-v8`: 覆盖率统计

---

## 2. 测试目录结构

```
tests/
├── setup-frontend.ts          # 全局测试 setup（Electron 桥接桩、WebGL 桩等）
├── unit/                      # 单元测试
│   ├── agent/                 # Agent 系统相关
│   │   └── toolOutputParser.test.ts
│   ├── aiworkflow/            # AI 工作流相关
│   │   ├── linking/           # 节点连接逻辑
│   │   ├── template/          # 模板合并
│   │   ├── canvasNodeRenderer.test.ts
│   │   └── ...
│   ├── config/                # 配置相关
│   ├── core/                  # 核心模块
│   │   ├── components/        # 组件系统
│   │   ├── events/            # 事件总线
│   │   ├── history/           # 历史记录
│   │   ├── project/           # 项目序列化
│   │   ├── scene/             # 场景几何
│   │   ├── shared/            # 通用工具
│   │   ├── subtitle/          # 字幕解析
│   │   └── timeline/          # 时间轴
│   ├── electron/              # Electron 相关
│   ├── electronBridge/        # Electron 桥接
│   ├── i18n/                  # 国际化
│   ├── model3d/               # 3D 模型编辑
│   ├── network/               # 网络服务
│   │   ├── AIChatService.test.ts
│   │   ├── SceneSkillService.test.ts
│   │   └── ...
│   ├── store/                 # Vuex Store
│   ├── views/                 # 视图逻辑
│   └── workflow/              # 工作流节点
│       ├── blender/           # Blender 集成
│       ├── meshy/             # Meshy 3D
│       ├── sceneLayout/       # 场景布局
│       ├── tripo3d/           # Tripo3D
│       ├── unreal/            # Unreal 导出
│       └── ...
├── components/                # 组件测试
│   ├── model3d/
│   │   └── EditorToolbar.spec.ts
│   └── ui/
│       ├── ModalDialog.spec.ts
│       ├── ThinkingBlock.spec.ts
│       └── ToolCallCard.spec.ts
├── engine/                    # 引擎测试
│   └── camera2d.test.ts
└── scripts/                   # 脚本测试
    ├── steam-upload.test.ts
    └── sync-version.test.ts
```

---

## 3. 运行测试

### 常用命令

```bash
# 运行所有测试（单次运行）
npm run test

# 监听模式（开发时使用）
npm run test:watch

# 运行测试并生成覆盖率报告
npm run test:coverage

# 类型检查
npm run typecheck

# 完整质量检查（类型检查 + 测试）
npm run quality

# 完整质量检查（类型检查 + Lint + 测试）
npm run quality:full
```

### 运行特定测试

```bash
# 运行单个测试文件
npx vitest run tests/unit/core/shared/json.test.ts

# 运行匹配模式的测试
npx vitest run tests/unit/agent/

# 运行特定测试用例
npx vitest run -t "isJsonObject"
```

---

## 4. 测试配置

### Vitest 配置 ([vitest.config.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-bilingual-readme-md-PvXXAz/vitest.config.ts))

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
      'tests/scripts/**/*.test.ts',
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

### 路径别名

| 别名 | 指向 | 说明 |
|-----|------|------|
| `@/` | `src/` | 前端源码 |
| `@electron/` | `electron/` | Electron 主进程源码 |

---

## 5. 单元测试规范（Unit Tests）

### 文件命名与位置

- 位置：`tests/unit/<模块>/`
- 命名：`<功能名>.test.ts`
- 对应源码结构：尽量与 `src/` 目录结构保持镜像

### 基本结构

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('模块名或功能名', () => {
  beforeEach(() => {
    // 每个测试用例前的初始化
  })

  describe('子功能分组', () => {
    it('应该做某事', () => {
      // Arrange
      const input = ...
      
      // Act
      const result = functionUnderTest(input)
      
      // Assert
      expect(result).toBe(expected)
    })
  })
})
```

### 示例：工具函数测试

参考 [json.test.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-bilingual-readme-md-PvXXAz/tests/unit/core/shared/json.test.ts)：

```typescript
import { describe, it, expect } from 'vitest'
import { isJsonObject } from '@/core/shared/json'

describe('isJsonObject', () => {
  it('returns true for plain objects', () => {
    expect(isJsonObject({})).toBe(true)
    expect(isJsonObject({ a: 1 })).toBe(true)
  })

  it('returns false for arrays', () => {
    expect(isJsonObject([])).toBe(false)
  })

  it('returns false for null', () => {
    expect(isJsonObject(null)).toBe(false)
  })
})
```

### 测试 Electron 主进程模块

对于 Electron 主进程（ESM `.mjs` 文件），使用动态 import：

参考 [toolOutputParser.test.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-bilingual-readme-md-PvXXAz/tests/unit/agent/toolOutputParser.test.ts)：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

let parseToolCallsFromText: (text: string) => Array<{id: string, name: string, arguments: Record<string, unknown>}>

beforeEach(async () => {
  const mod = await import('@electron/backend/modules/agent/providers/toolOutputParser.mjs')
  parseToolCallsFromText = mod.parseToolCallsFromText
})

describe('toolOutputParser', () => {
  it('parses single tool call correctly', () => {
    const text = `<|FunctionCallBegin|>[{"name": "create_node", "parameters": {"nodeType": "text"}}]<|FunctionCallEnd|>`
    const result = parseToolCallsFromText(text)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('create_node')
  })
})
```

---

## 6. 组件测试规范（Component Tests）

### 文件命名与位置

- 位置：`tests/components/<分类>/`
- 命名：`<组件名>.spec.ts`

### 基本结构

使用 `@vue/test-utils` 的 `mount` 或 `shallowMount`：

```typescript
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MyComponent from '@/ui/path/to/MyComponent.vue'

describe('MyComponent', () => {
  it('renders correctly', () => {
    const wrapper = mount(MyComponent, {
      props: { ... },
      slots: { ... },
      global: {
        plugins: [ ... ],
        mocks: { ... },
      },
    })
    
    expect(wrapper.find('.selector').exists()).toBe(true)
  })
})
```

### 示例：组件测试

参考 [ModalDialog.spec.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-bilingual-readme-md-PvXXAz/tests/components/ui/ModalDialog.spec.ts)：

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ModalDialog from '@/ui/UIComponent/ModalDialog.vue'

describe('ModalDialog', () => {
  describe('rendering', () => {
    it('renders when open prop is true', () => {
      const wrapper = mount(ModalDialog, {
        props: { open: true },
        slots: { default: 'Content' },
      })
      expect(wrapper.find('.dvs-modal-overlay').exists()).toBe(true)
    })

    it('does not render when open prop is false', () => {
      const wrapper = mount(ModalDialog, {
        props: { open: false },
      })
      expect(wrapper.find('.dvs-modal-overlay').exists()).toBe(false)
    })
  })

  describe('events', () => {
    it('emits close when close button is clicked', async () => {
      const wrapper = mount(ModalDialog, { props: { open: true } })
      await wrapper.findAll('.btn')[0].trigger('click')
      expect(wrapper.emitted('close')).toBeDefined()
    })
  })
})
```

### 组件测试要点

1. **Props 测试**：验证不同 props 下的渲染结果
2. **事件测试**：验证用户交互触发正确的事件
3. **Slots 测试**：验证插槽内容正确渲染
4. **条件渲染**：验证 v-if/v-show 控制的元素显示/隐藏
5. **无障碍属性**：验证 role、aria-label 等属性

---

## 7. 引擎测试规范（Engine Tests）

### 文件位置

- 位置：`tests/engine/`
- 命名：`<功能名>.test.ts`

### WebGL 模拟

测试环境已提供 WebGL2 桩对象（见 [setup-frontend.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-bilingual-readme-md-PvXXAz/tests/setup-frontend.ts)），支持基本的 WebGL 上下文调用，无需真实 GPU 环境。

---

## 8. 脚本测试规范（Script Tests）

### 文件位置

- 位置：`tests/scripts/`
- 命名：`<脚本名>.test.ts`

用于测试构建、打包、版本同步等 Node.js 脚本。

---

## 9. Mock 与桩对象

### 全局 Setup ([setup-frontend.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-bilingual-readme-md-PvXXAz/tests/setup-frontend.ts))

全局 setup 自动提供以下桩对象：

#### 1. Electron 桥接 (`window.dweb`)

```typescript
vi.stubGlobal('dweb', {
  common: {
    getBackendBaseUrl: vi.fn().mockResolvedValue('http://127.0.0.1:5800'),
    getAppInfo: vi.fn().mockResolvedValue({ ... }),
    // ... 其他 common 方法
  },
  window: {
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    // ... 窗口控制
  },
  aiworkflow: {
    selectMediaFiles: vi.fn().mockResolvedValue([]),
    // ... AI 工作流方法
  },
  agentSkills: {
    sceneUnderstand: { ... },
    sceneLighting: { ... },
    sceneLayout: { ... },
    unreal: { ... },
  },
})
```

#### 2. 全局常量

```typescript
vi.stubGlobal('__DWEB_BACKEND_BASE_URL__', 'http://127.0.0.1:5800')
vi.stubGlobal('__DWEB_RUNTIME__', { platform: 'web', isElectron: false })
vi.stubGlobal('__DWEB_APP_VERSION__', '0.1.3')
// ... 其他常量
```

#### 3. Fetch 桩

```typescript
vi.stubGlobal('fetch', vi.fn())
```

各测试文件可根据需要自行覆盖 fetch 实现：

```typescript
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ data: 'test' }),
})
vi.stubGlobal('fetch', mockFetch)
```

#### 4. WebGL2 桩

自动为 `HTMLCanvasElement.prototype.getContext` 提供 WebGL2 桩实现，支持常用方法调用。

#### 5. Observer 桩

- `ResizeObserver`
- `MutationObserver`

### 在测试中创建 Mock

#### Mock 函数

```typescript
const mockFn = vi.fn()
mockFn.mockReturnValue('value')
mockFn.mockResolvedValue({ ok: true })  // async
mockFn.mockImplementation((arg) => arg * 2)
```

#### Mock 模块

```typescript
vi.mock('@/network/service', () => ({
  fetchData: vi.fn().mockResolvedValue({ result: 'mocked' }),
}))
```

#### Mock 时间

```typescript
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})
```

---

## 10. 覆盖率

### 覆盖率阈值

配置在 [vitest.config.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-bilingual-readme-md-PvXXAz/vitest.config.ts#L40-L45)：

| 指标 | 阈值 |
|-----|------|
| Lines | 55% |
| Functions | 60% |
| Branches | 45% |
| Statements | 55% |

### 覆盖率包含范围

- `src/core/**/*.ts`
- `src/store/**/*.ts`
- `src/network/**/*.ts`
- `src/engine/webgl/**/*.ts`

### 查看覆盖率报告

```bash
npm run test:coverage
```

HTML 报告生成在 `coverage/frontend/index.html`，可直接在浏览器中打开查看。

---

## 11. 常见测试模式

### 1. 异步测试

```typescript
it('async function works', async () => {
  const result = await asyncFunction()
  expect(result).toBe(expected)
})
```

### 2. 异常测试

```typescript
it('throws on invalid input', () => {
  expect(() => parse('invalid')).toThrow('Invalid input')
})
```

### 3. Vuex Store 测试

```typescript
import { createStore } from 'vuex'
import myModule from '@/store/modules/myModule'

it('commits mutation correctly', () => {
  const store = createStore({ modules: { my: myModule } })
  store.commit('my/setData', 'value')
  expect(store.state.my.data).toBe('value')
})
```

### 4. 事件总线测试

```typescript
it('emits and receives events', () => {
  const handler = vi.fn()
  eventBus.on('event', handler)
  eventBus.emit('event', 'payload')
  expect(handler).toHaveBeenCalledWith('payload')
})
```

---

## 12. 测试最佳实践

### 编写可测试的代码

1. **单一职责**：每个函数只做一件事
2. **依赖注入**：通过参数传入依赖，而非直接 import
3. **纯函数优先**：减少副作用，便于测试
4. **避免直接访问全局**：通过参数或桥接层访问

### 测试设计原则

1. **AAA 模式**：Arrange（准备）→ Act（执行）→ Assert（断言）
2. **一个测试一个断言点**：每个 it 只验证一个行为
3. **测试描述清晰**：`it('应该...当...')` 格式
4. **不测试实现细节**：测试公共 API，而非内部状态
5. **边界条件覆盖**：null、undefined、空值、极值

### 避免反模式

1. **不要过度 Mock**：只 Mock 外部依赖，不 Mock 被测代码本身
2. **不要依赖测试顺序**：每个测试独立运行
3. **不要在测试中写逻辑**：直接使用明确的输入输出
4. **不要忽略失败的测试**：及时修复或调整

### 新增功能的测试要求

1. **核心工具函数**：必须有单元测试覆盖
2. **新增 Store 模块**：必须有 mutations/actions 测试
3. **新增通用组件**：应有基本渲染和交互测试
4. **新增 AI 模块**：工具解析、参数处理逻辑应有测试
5. **Bug 修复**：先写复现测试，再修复代码

---

## 相关文档

- [04 - 后端开发指南](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-bilingual-readme-md-PvXXAz/agent_docs/04_BACKEND_GUIDE.md) - 后端模块开发规范
- [07 - 开发边界](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/feat-bilingual-readme-md-PvXXAz/agent_docs/07_DEVELOPMENT_BOUNDARIES.md) - 代码规范与边界定义
