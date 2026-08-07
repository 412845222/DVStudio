# Deprecation 目录说明

> **过渡兼容层**。本目录下全部代码均为临时过渡方案，用于在**不删除旧文件**的前提下，将旧架构的截图预热系统降级为空实现，避免因一次性大规模重构引入回归风险。

## 目录结构

```
deprecation/
├── index.ts                          # Feature Flag 统一入口
├── ScreenshotWarmupDeprecation.ts   # 截图预热系统的 noop 实现与分发
└── README.md                         # 本说明文档
```

## Feature Flag

| 键名 | 值 | 含义 |
|------|-----|------|
| `DVS_ENABLE_LEGACY_SCREENSHOT_WARMUP` | `'1'` | 启用旧截图预热系统（紧急回退用） |
| `DVS_ENABLE_LEGACY_SCREENSHOT_WARMUP` | 未设置 / 其他值 | **禁用旧系统（默认），走 noop 实现** |

### 紧急回退步骤（用户侧）

```js
// F12 控制台执行，然后刷新蓝图页面或重启 DVStudio
localStorage.setItem('DVS_ENABLE_LEGACY_SCREENSHOT_WARMUP', '1')
```

### 再次关闭（恢复新架构）

```js
localStorage.removeItem('DVS_ENABLE_LEGACY_SCREENSHOT_WARMUP')
```

## 废弃模块清单 & 移除时间表

| 模块 | 当前状态 | 计划删除版本 | 说明 |
|------|---------|-------------|------|
| `node-screenshot/useNodeScreenshotPool.ts` | 已通过 flag 分发至 noop | vNext+3 | DOM 截图并发池 |
| `node-screenshot/nodeScreenshotPersistentCache.ts` | 已通过 NoopPersistentCache 降级 | vNext+3 | IndexedDB 持久化 |
| `node-screenshot/canvasWarmupCoordinator.ts` | warmup() 立即 resolve | vNext+3 | Canvas 预热协调器 |
| `node-screenshot/warmupPromptManager.ts` | 已通过 createNoopWarmupPrompt 降级 | vNext+3 | 打开蓝图预热提示 |
| `node-screenshot/canvasScreenshotPool.ts` | 空实现降级 | vNext+3 | Canvas 纹理池 |
| `components/ThemeWarmupProgress.vue` | 模板 `v-if="false"` 强制隐藏 | vNext+3 | 主题预热进度条 |
| `ui/BluePrint/WarmupPromptDialog.vue` | 模板 `v-if="false"` 强制隐藏 | vNext+3 | 预热确认对话框 |
| `node-screenshot/nodeVersionCalculator.ts` | `hasCachedScreenshot` 返回 false 后失活 | vNext+3 | 版本哈希计算 |
| `deprecation/*` | 过渡层 | vNext+4 | 本目录随旧模块一并删除 |

## 边界与红线

- 本目录下代码**绝不**允许引用 `electron/` 任何文件
- 本目录下代码**绝不**允许调用 `window.dweb.*` IPC 通道
- 本目录下代码**绝不**允许引入新的 npm 依赖
- 所有修改**仅限渲染进程 `src/` 范围内**
