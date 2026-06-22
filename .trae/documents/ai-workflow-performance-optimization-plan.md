# AI 工作流蓝图页面性能优化开发计划

- **项目**: DVStudio (Dweb Video Studio)
- **页面**: `src/views/AIWorkflow/AIWorkflowPage.vue`
- **目标**: 优化大量节点场景下的画布平移/缩放流畅度，降低节点挂载/卸载开销，优化媒体资源加载与渲染策略
- **关联文档**: `docs/性能优化/AI工作流蓝图页面性能优化方案.md`

---

## 1. 现状与瓶颈分析（基于代码审阅）

### 1.1 节点渲染
- **位置**: `AIWorkflowPage.vue` L33-L200 附近的 `v-for="node in safeVisibleRenderNodes"`
- **关键点**:
  - `safeVisibleRenderNodes = computed(() => visibleRenderNodes.value.map(n => ...))`，每次视口/节点状态变化都会重建数组
  - `v-if="shouldRenderCompactNode(vp.zoom, node)"` 与 `<component v-else :is="nodeComponent(node)">` 切换时会销毁并重建组件（挂载/卸载切换开销）
  - 每个节点都通过 `nodeStyle(...)` 计算 `transform` 与 `width/height`，纯函数但在大量节点下是 O(n) 调用
  - 紧凑节点内部还有 `compactNodeImageUrl(node)` → 又一轮字符串判断与资源查找

### 1.2 可见性检测
- **位置**: `src/views/AIWorkflow/blueprint-core/useAIWorkflowNodeVisibility.ts`
- **关键点**:
  - `visibleRenderNodeIds = computed(() => { for (const node of nodesForRender) { ... compute box & test } })` — O(N) 全量遍历
  - 已实现 `motionRecomputeMinIntervalMs=90ms` 防抖 + `lastViewportSignature/lastNodeSignature` 缓存回退，在静止时能命中缓存
  - **问题**: 平移过程中 `viewportSignature` 每帧变化，缓存失效，仍然需要遍历所有节点做 AABB 检测；节点数量数百时会阻塞主循环
  - 现有逻辑已考虑选中节点强制可见、`hiddenNodeIds` 过滤，但未做空间索引分块

### 1.3 媒体节点图像资源
- **位置**: `src/ui/WorkFlow/WorlFlowNodes/WorkflowImageNode.vue`（L39-L50 `previewImg`、L287-320 `displayResourceUrl`）
- **关键点**:
  - `displayResourceUrl` 在 `zoom` 变化时会在 320/640/原图 三种 URL 之间切换，切换即重新请求（即使资源相同）
  - 每个节点独立创建 `ResizeObserver`、独立创建 `Image` 对象做 `ensureNaturalSizeFallback`，节点数量多会放大 DOM/内存开销
  - `onPreviewImageLoad` 触发的 `emit('update-image-settings', ...)` 又会向上游 store 提交，进一步放大响应式链

### 1.4 Vue 响应式与渲染链
- `nodes = computed(() => store.state.nodeOrder.map(id => store.state.nodesById[id]).filter(Boolean))`，每次 store 相关字段变更全量重建
- `safeVisibleRenderNodes` → `compactVisibleNodeCount` → `fullVisibleNodeCount` → `AIWorkflowPage.vue` 模板的 `v-for`/`:style`/事件处理器，多个 `computed` 相互依赖
- 节点组件内部大量 `computed`：`displayResourceUrl`、`activePreviewUrl`、`outputWidth`、`outputHeight`、`crop`、`previewWrapStyle`、`previewImageStyle` 等，每个节点都有独立的响应式订阅

### 1.5 渲染与样式
- `WorkflowNodeBase.vue` 未启用 `contain: layout paint style;` / `will-change: transform;`，浏览器在节点 `transform` 变化时仍会做上层层检查
- `AIWorkflowPage.vue` 紧凑节点容器 `.aiwf-node-compact` 无明确样式隔离；与完整节点共享同一份 `position: absolute;` 容器
- 平移过程中没有统一做「降级渲染」信号（边缘层已有 `motionActive` 支持，但节点层只是间接依赖 viewport 的 zoom 来切换 compact）

---

## 2. 优化目标与度量

| 指标 | 优化前（估算） | 目标 |
|------|----------------|------|
| 平移时平均 FPS | ~15-25（大量节点） | > 30（目标 35+） |
| 单帧 JS 耗时（visibleRenderNodeIds + v-for re-render） | 30-80ms | < 16ms |
| 活跃挂载的完整节点组件数 | 视口内全部（数百） | 视口内 + 缓冲区，仅必要 |
| 图像重复请求次数 | 按节点实例数线性 | 0（URL 级缓存） |
| 可见性检测复杂度 | O(N) | O(√N) 或更低（空间索引） |

**度量方法**:
- Chrome DevTools Performance 面板录制平移/缩放操作，查看 Long Task、Frame 分布
- `useAIWorkflowPerfMonitor` 已内置 FPS / frameMs / slowFrames / longTask 统计，直接对照
- `buildPerfDiagnosticPayload()` 输出 JSON 方便做前后对比

---

## 3. 具体改造计划

### 3.1 P0 改造一：CSS 渲染隔离 + 合成层优化

**目标**: 降低浏览器渲染/重绘开销，让节点在 transform 变化时只进入 GPU 合成路径。

**涉及文件**:
- `src/ui/WorkFlow/WorkflowNodeBase.vue` — 添加 `contain` + `will-change`
- `src/views/AIWorkflow/AIWorkflowPage.vue` — `.aiwf-node-host` / `.aiwf-node-compact` 样式
- `src/ui/WorkFlow/WorlFlowNodes/WorkflowImageNode.vue` — 图像预览区域 `contain`

**具体改动**:
1. `WorkflowNodeBase.vue` 根节点样式追加：
   ```
   contain: layout paint style;
   will-change: transform, width, height;
   ```
2. `AIWorkflowPage.vue` 中 `.aiwf-node-host` / `.aiwf-node-compact` 统一声明：
   ```
   contain: strict;
   will-change: transform;
   ```
3. `WorkflowImageNode.vue` 的 `.wf-media-preview` 增加：
   ```
   contain: layout paint;
   will-change: opacity;
   ```
4. `AIWorkflowPage.vue` 节点内部复杂 UI（节点工具栏/弹窗）在 `viewportMotionActive === true` 时隐藏文字/阴影/边框，仅保留主轮廓：
   - 在 `:style` 中加入 `opacity`/`filter: none`/`box-shadow: none` 的条件样式
   - 利用已有的 `viewportMotionActive`，无需新增响应式源

**验收**:
- Performance 录制中，平移时 Rendering/Painting 占比下降，不再出现因布局抖动导致的 Long Task
- 所有节点/边缘元素在平移中仍然可读，不出现缺失或偏移 bug

---

### 3.2 P0 改造二：全局资源 URL 缓存 + 图像预加载

**目标**: 避免同一资源 URL（尤其是 320/640 预览缩略图）在不同节点中重复请求与重复解码。

**涉及文件**:
- `src/views/AIWorkflow/assets/` — 新增 `useAIWorkflowResourceCache.ts`（已有资源目录 `useAIWorkflowObjectUrlRegistry.ts`，复用此目录）
- `src/ui/WorkFlow/WorlFlowNodes/WorkflowImageNode.vue` — 接入缓存
- `src/views/AIWorkflow/AIWorkflowPage.vue` — 可选：在 viewport motion 结束后统一预加载新进入视口的节点图片

**具体改动**:
1. 新建 `useAIWorkflowResourceCache.ts`：
   - 提供单例 `Map<string, HTMLImageElement>` 缓存（key: URL）
   - 提供 `getOrCreateImage(url)`：缓存中存在则直接返回；不存在则异步创建 `new Image()` 并 `src = url`，完成后放入 Map
   - 提供 `hasLoaded(url)` / `isError(url)` 查询
   - 限制容量（例如 512 项 LRU），避免长时间内存驻留；在页面 unmount / store clear 时清理
   - 使用 `ref` 仅在必要场景暴露响应式状态，避免响应式开销
2. 改造 `WorkflowImageNode.vue`：
   - 移除 `ensureNaturalSizeFallback` 内的 `new Image()` + `img.src = url`，替换为 `getOrCreateImage(url)`
   - 如果缓存中已存在且已 `onload`，直接复用 `naturalWidth/naturalHeight`，不再触发网络请求
   - `onPreviewImageLoad` 仍然 emit `update-image-settings`，但只在尺寸与当前 store 值不同时才 emit（减少响应式链）
   - `failedPreviewUrl` 失败信息也走缓存，避免重复重试同一张失败图

**验收**:
- Network 面板中，同一 URL 仅出现一次请求（200 OK），后续全部走磁盘/内存缓存（from disk cache / from memory cache）
- 切换 zoom 使 `displayResourceUrl` 在 320/640 之间切换不触发新请求
- 所有图像节点的 natural size 读取不阻塞，首屏渲染正常

---

### 3.3 P1 改造三：可见性检测空间索引（QuadTree / Grid Bucketing）

**目标**: 将 `visibleRenderNodeIds` 的 O(N) 遍视在节点数较多时降为 O(√N) 数量级。

**涉及文件**:
- `src/views/AIWorkflow/blueprint-core/useAIWorkflowNodeVisibility.ts`

**具体改动**:
1. 在 `useAIWorkflowNodeVisibility` 内部新增惰性数据结构：
   - 按节点 `worldX`/`worldY`/`width`/`height` 做 Grid 分桶（如 2000×2000 世界单位一格），或用小型 QuadTree（按当前实现规模，Grid 更简单）
   - 缓存分桶结果，仅当 `buildNodeSignature` 变化时重建（与现有 `lastNodeSignature` 机制一致）
   - 当节点数 `< TUNE_THRESHOLD`（例如 80），保持原 O(N) 遍历，避免分桶 overhead
2. `visibleRenderNodeIds` 的核心循环改为：
   ```
   const bucketIds = worldQueryBuckets(viewLeft, viewTop, viewRight, viewBottom)
   for (const id of bucketIds) {
     const node = nodesById[id]
     if (node && aabbOverlap(node, view)) next.add(node.id)
   }
   ```
3. 保留现有逻辑中的「选中节点强制可见」「hiddenNodeIds 过滤」「viewport 签名缓存」「motion 间隔 90ms 防抖」机制不变
4. 在 `compactVisibleNodeCount` 路径上同样复用空间索引：只对候选节点运行 `shouldRenderCompactNode`

**验收**:
- 手动构造 300/500 节点项目，平移过程中 Performance 录制的 `visibleRenderNodeIds` 单帧耗时下降 > 50%
- 所有节点在平移/缩放结束后仍然能完整显示（不出现遗漏或误隐藏）
- 节点拖动、删除、添加后显示位置仍然正确（对空间索引的重建/增量更新做回归）

---

### 3.4 P1 改造四：运动过程中的渲染降级

**目标**: 在 `viewportMotionActive === true` 期间，减少节点内部复杂组件的响应式更新，优先保证 transform 流畅。

**涉及文件**:
- `src/views/AIWorkflow/AIWorkflowPage.vue` — `v-for` 节点渲染
- `src/views/AIWorkflow/node-business/presentation/useAIWorkflowNodeExtraProps.ts` — 已有 `viewportMotionActive` 的降级逻辑

**具体改动**:
1. `AIWorkflowPage.vue` 中对 `safeVisibleRenderNodes` 的完整节点增加「motion 期间降级」：
   - 在 motion 期间，将所有节点都切到 compact 渲染（覆盖 `shouldRenderCompactNode` 的 zoom 阈值判断），仅保留被选中节点为完整渲染
   - 使用 `:class="{ 'is-motion-degraded': viewportMotionActive }"` + CSS 快速切换，避免走组件 mount/unmount
2. 对 compact 节点中的文字/图标在 motion 中进一步降级：隐藏次要信息（如资源大小、锚点状态），保留主标题
3. `useAIWorkflowNodeExtraProps.ts`：若 `viewportMotionActive === true` 时走更浅层的 props 计算（仅返回静态标识字段），避免对节点 store 做全量读取

**验收**:
- 平移中节点不发生 mount/unmount（Performance 的 Vue Component Life 事件显著减少）
- 放开鼠标后 150ms（现有防抖阈值）内恢复完整渲染
- 选中节点在平移中仍然显示完整 UI、可选可拖拽

---

### 3.5 P2 改造五：响应式开销瘦身（shallow ref + 惰性计算）

**目标**: 避免 nodes 数组全量重建带来的大量响应式订阅。

**涉及文件**:
- `src/views/AIWorkflow/AIWorkflowPage.vue` 顶部的 `nodes` / `visibleRenderNodes` / `safeVisibleRenderNodes`

**具体改动**:
1. 将 `nodes = computed(() => nodeOrder.map(...))` 改为惰性构造：
   - 维护一个 `Map<string, WorkflowNode>`，仅在 store 增删节点时更新；数组形式按需从 Map 导出
   - 若现有 store 架构不便改造，可将直接使用 store 内部暴露的 `nodesById` + `nodeOrder`，避免页面层再 copy
2. `safeVisibleRenderNodes` 避免做 `map(...expandNode)`，改为直接返回 `visibleRenderNodes`，让组件内部自己按需读取字段
3. 将节点渲染用的 `nodeStyle` / `compactNodeStyle` 抽成外部纯函数，避免每个节点在模板中重新绑定

**验收**:
- Vue DevTools Timeline 中，平移时 Computed 更新次数下降
- 不改变页面任何交互行为（拖动、缩放、编辑、删除等）

---

## 4. 实施顺序与工作量

| 阶段 | 改造项 | 优先级 | 工作量（相对） | 预估风险 |
|------|--------|--------|----------------|----------|
| 阶段一 | 3.1 CSS 渲染隔离 + 合成层 | P0 | 小 | 低 |
| 阶段一 | 3.2 全局资源 URL 缓存 | P0 | 中 | 低 |
| 阶段二 | 3.4 motion 期间渲染降级 | P1 | 小 | 低 |
| 阶段二 | 3.3 空间索引可见性检测 | P1 | 中 | 中 |
| 阶段三 | 3.5 响应式瘦身 | P2 | 中 | 中 |

**建议**:
- 先完成阶段一（CSS + 资源缓存），做一次基准对比（Before/After），看是否已满足 30 FPS 目标
- 若仍有瓶颈，进入阶段二（motion 降级 + 空间索引），再做第二轮测试
- 阶段三（响应式瘦身）收益不确定性较大，需要在阶段一/二完成后评估是否继续

---

## 5. 修改文件清单

| 文件路径 | 改动类型 | 备注 |
|----------|----------|------|
| `src/views/AIWorkflow/AIWorkflowPage.vue` | 编辑 | 节点渲染降级、CSS 隔离、减少 computed 重建 |
| `src/views/AIWorkflow/blueprint-core/useAIWorkflowNodeVisibility.ts` | 编辑 | 空间索引（Grid/QuadTree）分桶、复用现有缓存机制 |
| `src/views/AIWorkflow/assets/useAIWorkflowResourceCache.ts` | 新建 | 图像 URL 缓存、natural size 预加载、LRU 淘汰 |
| `src/ui/WorkFlow/WorlFlowNodes/WorkflowImageNode.vue` | 编辑 | 接入资源缓存，移除重复 new Image()，减少 emit |
| `src/ui/WorkFlow/WorkflowNodeBase.vue` | 编辑 | 添加 contain/will-change，减少渲染范围 |
| `src/views/AIWorkflow/node-business/presentation/useAIWorkflowNodeExtraProps.ts` | 编辑 | motion 期间降级 props 计算 |

---

## 6. 验证与回归测试

**手动验证用例**:
1. **大量节点平移**: 打开一个含 200+ 节点的项目，按住 Space/中键拖动画布，FPS 保持 >= 30
2. **缩放切换 compact/完整**: 从 1.0x zoom 滑到 0.3x，再滑回 1.0x；切换过程无白屏、无图像闪烁
3. **图像资源加载**: 新建 10 个指向同一资源 URL 的图像节点；Network 面板仅 1 次 200 请求
4. **删除/添加节点**: 动态删除一个节点后，画布显示仍然正确；新增节点立刻出现在正确位置
5. **选中 + 拖动**: 选中节点并拖动，其他节点不出现卡顿
6. **Electron 环境**: 在 Electron 打包或 dev 环境下跑一遍 1-5，确保与 Web 浏览器行为一致（通过 `runtimePlatform.isElectron()` 区分的路径要覆盖到）

**Performance 录制对比**:
- 录制时长: 10-30 秒，包含至少 5 次大幅平移 + 2 次缩放
- 关注点:
  - 「Summary」中 Scripting / Rendering / Painting 占比
  - 「Frames」图表中 frame duration 分布（低于 16.6ms 比例）
  - 「Timings」 中 Vue Component Update / Long Task 数量

**自动度量**:
- `buildPerfDiagnosticPayload()` 输出的 JSON 做 Before/After 对比，主要关注 `fps`、`frameMs`、`slowFrames`、`nodes` / `visibleNodes`、`edgeComputeMs`

---

## 7. 风险与回滚策略

| 风险 | 描述 | 应对 |
|------|------|------|
| CSS contain 影响子元素 | `contain: strict;` 可能让 position:absolute 的子元素溢出不可见 | 先从 `contain: layout paint style;` 开始，必要时再升 strict；回归测试用例 4/5 重点覆盖 |
| 图像缓存引入内存压力 | 大量高清图像驻留，长时间运行内存增长 | 实现 LRU，最多 512 项；页面 unmount 清理 |
| 空间索引遗漏边缘节点 | 大范围节点/跨多个 bucket 节点可能被漏判 | 对跨 bucket 节点单独维护 "large" 列表；始终做一次 AABB 再确认 |
| motion 降级导致视觉 Bug | 平移中节点内容错乱、选中态丢失 | motion 仅通过 class 切换样式，不切换组件；选中节点始终保留完整渲染 |
| 响应式瘦身破坏数据流 | 部分字段在 store 变更后未同步 | 在 P2 阶段谨慎改，保留 computed 输出的兼容字段 |

**回滚策略**:
- 每项改动都放在独立 commit，通过 git revert 可单独回退
- 对新增的空间索引模块，通过运行时 flag（如 `const USE_SPATIAL_INDEX = true`）可一键切换到旧实现，便于快速定位

---

## 8. 交付物

- 完成 5 个目标文件的代码改动，通过 `npm run build:web` 或 `npm run dev:web` 本地运行验证
- Performance Before/After 截图（Chrome DevTools Performance 面板）
- `useAIWorkflowPerfMonitor` 生成的优化前后 JSON payload 对照
- 本 Plan 中所有手动验证用例的通过说明

---

## 9. 不在本次范围（Out of Scope）

- 替换 Vue 渲染为 Canvas/WebGL 节点绘制（改动面过大，风险高）
- 重写 AIWorkflow store 数据结构（属于更大重构范围）
- 重写 EdgeLayer 为 WebGL 路径（已有 edgeRenderer 做 culling，当前性能可接受）
- 修改 Electron 打包流程或后端 Django 服务（非前端渲染瓶颈根因）

