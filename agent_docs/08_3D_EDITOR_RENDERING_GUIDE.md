# 3D编辑器渲染优化技术指南

## 目录
1. [渲染管线架构](#渲染管线架构)
2. [后处理Pass详解](#后处理pass详解)
3. [光照预设设计](#光照预设设计)
4. [PBR材质调优](#pbr材质调优)
5. [性能优化建议](#性能优化建议)
6. [Blender MCP 集成](#blender-mcp-集成)
7. [常见问题排查](#常见问题排查)

---

## 渲染管线架构

### 整体架构

```
用户打开3D编辑器
  ↓
初始化WebGLRenderer
  ↓
配置渐变背景环境 (SphereGeometry + ShaderMaterial)
  ↓
加载RoomEnvironment环境贴图 (PMREMGenerator)
  ↓
配置三点光照系统 (主光+补光+边缘光)
  ↓
初始化后处理管线 (EffectComposer)
  ↓
渲染循环
  ├─ RenderPass (基础渲染)
  ├─ SSAOPass (环境光遮蔽)
  ├─ ColorCorrectionPass (色彩校正)
  ├─ UnrealBloomPass (辉光效果)
  └─ FXAAPass (抗锯齿)
```

### 核心模块

| 模块 | 文件 | 职责 |
|-----|------|------|
| EditorViewer | `editor/EditorViewer.ts` | 3D编辑器主控制器 |
| EnhancedRenderingPipeline | `editor/EnhancedRenderingPipeline.ts` | 后处理管线封装 |
| EnvironmentPresets | `editor/EnvironmentPresets.ts` | 光照/背景预设配置 |
| useEnhancedModel3DEditor | `composables/useEnhancedModel3DEditor.ts` | Vue Composable封装 |

---

## 后处理Pass详解

### Pass顺序

后处理Pass的顺序对最终效果有重要影响，当前顺序为：

1. **RenderPass** - 基础场景渲染
2. **SSAOPass** - 屏幕空间环境光遮蔽
3. **ColorCorrectionPass** - 色彩校正
4. **UnrealBloomPass** - 辉光效果
5. **FXAAPass** - 快速近似抗锯齿

### SSAOPass (屏幕空间环境光遮蔽)

**作用**: 增强模型细节和真实感，在模型缝隙、角落处添加自然的阴影。

**关键参数**:

| 参数 | 默认值 | 说明 | 调优建议 |
|-----|-------|------|---------|
| kernelRadius | 12 | 采样核半径 | 值越大，AO范围越广 |
| minDistance | 0.01 | 最小距离阈值 | 避免近距离过暗 |
| maxDistance | 0.15 | 最大距离阈值 | 避免远距离伪影 |

**调优指南**:
- 模型细节不足 → 减小 `kernelRadius`，增加 `maxDistance`
- 画面过暗 → 增大 `minDistance`，减小 `kernelRadius`
- 性能优化 → 降低分辨率或禁用SSAO

### UnrealBloomPass (辉光效果)

**作用**: 为高光区域添加柔和的辉光，增强材质的真实感。

**关键参数**:

| 参数 | 默认值 | 说明 | 调优建议 |
|-----|-------|------|---------|
| strength | 0.03 | 辉光强度 | 过高会导致"油腻感" |
| radius | 0.3 | 辉光半径 | 控制辉光扩散范围 |
| threshold | 0.9 | 亮度阈值 | 只有超过阈值的像素才发光 |

**调优指南**:
- 材质"油腻" → 降低 `strength`，提高 `threshold`
- 金属材质不够闪亮 → 适度提高 `strength`
- 性能优化 → 降低 `radius` 或禁用

### ColorCorrectionPass (色彩校正)

**作用**: 调整画面的整体色彩倾向，提供电影级调色效果。

**关键参数**:

| 参数 | 默认值 | 说明 |
|-----|-------|------|
| powRGB | [1.1, 1.1, 1.12] | Gamma校正（幂运算） |
| mulRGB | [1.0, 1.0, 1.02] | 乘法色彩调整 |

**调优指南**:
- 画面偏暗 → 降低 `powRGB` 或提高 `mulRGB`
- 画面偏暖 → 降低红色通道值
- 画面偏冷 → 降低蓝色通道值

### FXAAPass (抗锯齿)

**作用**: 快速近似抗锯齿，减少模型边缘的锯齿。

**注意**: FXAA是性能消耗最低的抗锯齿方案，但效果不如MSAA。当前已配合 `antialias: true` 的WebGL原生MSAA使用。

---

## 光照预设设计

### 三点光照系统

专业3D渲染的标准配置，包含：

1. **主光源 (Key Light)**: 最亮的光源，塑造主要形态和阴影
2. **补光 (Fill Light)**: 减弱主光造成的阴影，照亮暗部
3. **边缘光 (Rim Light)**: 从背后照亮模型边缘，增强轮廓感

### 预设列表

| 预设 | 适用场景 | 特点 |
|-----|---------|------|
| studio | 通用模型预览 | 均衡的三点光照，适中的环境反射 |
| soft-studio | 细腻材质展示 | 柔和光照，低对比度，突出材质细节 |
| outdoor | 户外风格模型 | 暖色调主光，高曝光，模拟阳光 |
| dark | 暗调氛围展示 | 低环境光，强边缘光，神秘感 |
| no-light | 纯材质查看 | 仅环境光，无方向光阴影 |

### 预设参数对比

| 参数 | studio | soft-studio | outdoor | dark |
|-----|--------|-------------|---------|------|
| 环境光强度 | 0.6 | 0.3 | 0.4 | 0.15 |
| 主光强度 | 1.8 | 1.2 | 2.0 | 0.8 |
| 补光强度 | 0.5 | 0.35 | 0.3 | 0.1 |
| 边缘光强度 | 0.7 | 0.4 | 0.25 | 1.5 |
| 环境强度 | 0.5 | 0.45 | 0.6 | 0.3 |
| 曝光度 | 0.85 | 0.8 | 1.0 | 0.8 |

---

## PBR材质调优

### "油腻感"问题分析

PBR材质"油腻"通常由以下原因造成：

1. **曝光度过高** → 降低 `toneMappingExposure`
2. **环境反射过强** → 降低 `environmentIntensity`
3. **Bloom强度过高** → 降低 `bloomStrength`，提高 `threshold`
4. **金属度过高** → 调整材质 `metalness` 参数
5. **粗糙度过低** → 调整材质 `roughness` 参数

### 推荐参数范围

| 参数 | 推荐范围 | 说明 |
|-----|---------|------|
| toneMappingExposure | 0.7 - 1.0 | 全局曝光度 |
| environmentIntensity | 0.4 - 0.8 | 环境反射强度 |
| bloomStrength | 0.02 - 0.08 | 辉光强度 |
| bloomThreshold | 0.85 - 0.95 | 辉光阈值 |

### 色调映射

当前使用 `ACESFilmicToneMapping`，这是电影工业标准的色调映射算法：
- 高光过渡更自然
- 暗部细节保留更好
- 色彩更具电影感

---

## 性能优化建议

### 性能等级

| 等级 | SSAO | Bloom | ColorCorrection | 像素比 | 适用场景 |
|-----|------|-------|-----------------|-------|---------|
| 高质量 | ✅ | ✅ | ✅ | 2.0 | 高端设备 |
| 平衡 | ✅ | ✅ | ❌ | 1.5 | 中端设备 |
| 性能 | ❌ | ❌ | ❌ | 1.0 | 低端设备 |

### 优化技巧

1. **降低SSAO分辨率**: 显著提升性能，视觉损失较小
2. **减少Bloom半径**: 小半径Bloom性能更好
3. **控制模型面数**: 使用LOD（细节层次）技术
4. **限制后处理Pass数量**: 只启用必要的效果
5. **使用requestAnimationFrame**: 确保与浏览器同步

### 性能监控

- 使用 `renderer.info` 监控绘制调用和三角形数量
- 使用 Chrome DevTools Performance 面板分析帧率
- 关注 `render` 方法的执行时间

---

## Blender MCP 集成

### 集成架构

DVStudio 通过 MCP（Model Context Protocol）协议与 Blender 集成，实现 AI 驱动的 3D 场景编辑能力。

```
DVStudio Agent Runtime
  ↓
MCP Client (socket/stdio bridge)
  ↓
Blender MCP Server (Addon)
  ↓
Blender Python API (bpy)
```

### 核心功能

| 功能 | 说明 | 后端模块 |
|-----|------|---------|
| MCP 连接管理 | 连接/断开 Blender MCP 服务器，状态监控 | `blender/` |
| 模型导入 | 支持 GLB/GLTF/FBX/OBJ 等格式导入 | `blender/` |
| 工具调用 | 通过 MCP 调用 Blender 工具（创建物体、修改材质等） | `mcp/` + `blender/` |
| 工作区管理 | 脚本保存、截图捕获、文件管理 | `blender/workspace.mjs` |
| Agent 聊天 | 在节点内通过 Agent 与 Blender 交互 | `chat/` + `blender/` |

### 后端 IPC 通道

- `dweb:blender:status:check` - 检查 Blender 状态
- `dweb:blender:mcp:connect` - 连接 Blender MCP
- `dweb:blender:mcp:disconnect` - 断开连接
- `dweb:blender:mcp:call-tool` - 调用 MCP 工具
- `dweb:blender:import:model` - 导入 3D 模型
- `dweb:blender:workspace:*` - 工作区管理操作

### 前端集成

前端 Blender 节点业务逻辑位于 `src/views/AIWorkflow/node-business/blender/`：

- `useBlenderAgentChat.ts` - Blender 节点 Agent 聊天
- `useBlenderUpstreamInputs.ts` - 上游输入处理
- 聊天 UI 复用节点聊天对话框组件

### 使用流程

1. 启动 Blender 并启用 MCP 插件
2. 在 DVStudio 中添加 Blender 节点
3. 连接 Blender MCP 服务器
4. 通过 Agent 对话发送指令（如"创建一个红色立方体"）
5. Agent 通过 MCP 工具调用 Blender API 执行操作
6. 截图回传到 DVStudio 显示结果

### 关键文件位置

| 关注点 | 路径 |
|-------|------|
| Blender 后端模块 | `electron/backend/modules/blender/` |
| MCP 后端模块 | `electron/backend/modules/mcp/` |
| Blender 节点业务 | `src/views/AIWorkflow/node-business/blender/` |
| Blender 节点组件 | `src/ui/WorkFlow/WorlFlowNodes/blender/` |
| MCP 桥接 | `electron/backend/modules/mcp/server/socketBridge.mjs` |

---

## 常见问题排查

### 问题1: 背景是纯黑色

**可能原因**:
- 渐变背景Shader未正确渲染
- `bgMesh.renderOrder` 设置不正确
- 背景色覆盖了渐变

**排查步骤**:
1. 检查 `bgMesh` 是否已添加到场景
2. 确认 `renderOrder` 设置为 -1
3. 检查 `depthWrite: false` 和 `depthTest: false`
4. 验证 `side: THREE.BackSide`

### 问题2: 模型全黑

**可能原因**:
- 环境贴图未正确生成
- 光照强度为0
- 材质 `metalness` 太高且无环境反射

**排查步骤**:
1. 检查 `RoomEnvironment` 是否正常生成
2. 验证 `environmentIntensity` > 0
3. 确认 `ambientLight.intensity` > 0
4. 切换到 "无光照" 模式测试

### 问题3: 材质"油腻"

**可能原因**:
- 曝光度过高
- 环境反射过强
- Bloom强度过高

**排查步骤**:
1. 降低 `toneMappingExposure` 到 0.7-0.8
2. 降低 `environmentIntensity` 到 0.4-0.5
3. 降低Bloom的 `strength`，提高 `threshold`
4. 检查材质 `metalness` 是否过高

### 问题4: 阴影有锯齿

**可能原因**:
- 阴影贴图分辨率太低
- 未启用软阴影

**排查步骤**:
1. 确认 `shadowMap.type = THREE.PCFSoftShadowMap`
2. 检查 `shadow.mapSize.width/height` >= 2048
3. 调整 `shadow.radius` 增加柔化
4. 调整 `shadow.bias` 消除阴影失真

### 问题5: SSAO效果过强/过弱

**可能原因**:
- `kernelRadius` 不合适
- `minDistance`/`maxDistance` 阈值不对

**排查步骤**:
- 效果过强 → 减小 `kernelRadius`，增大 `minDistance`
- 效果过弱 → 增大 `kernelRadius`，减小 `maxDistance`
- 有伪影 → 增大 `minDistance`

---

## ⚠️⚠️⚠️ 3D模型节点（Meshy/Tripo3D）本地GLB文件加载链路全解析（2026-08-03 修复总结，必读！）

> 本章节是为了**彻底避免下次开发再次踩坑**而写。请在修改任何 3D 模型节点的渲染逻辑、路径解析、模型加载代码前，**完整阅读本章**。

### 🔴 核心铁律（违反必出 bug）

1. **3D模型节点绝不直接使用 Meshy/Tripo3D 的远程 CDN URL（https://assets.meshy.ai 等）进行渲染**。远程 URL 仅在任务轮询阶段用于**下载到本地**，一旦下载完成必须丢弃。
2. **3D模型节点渲染只信任「蓝图项目根目录下的本地 GLB 文件」**，加载方式优先级严格为：
   - ① `file:///G:/.../项目名/Content/Media/xxx.glb`（Windows 本地绝对路径转 file URL，最高优先级）
   - ② 本地绝对路径 `G:\...\Content\Media\xxx.glb`
   - ③ `dweb://project-assets/?projectId=1&path=Content/Media/xxx.glb`（仅作 fallback，不推荐）
   - ④ ❌ **禁止**：远程 https?:// URL（CORS 必挂 + 网络不稳）
3. **扩展名检测优先级**：文件扩展名（URL/路径后缀）> 文件魔数 > Content-Type。扩展名白名单 `glb/gltf/fbx/obj/stl/usdz` 命中即视为合法模型，**不再校验魔数或 Content-Type**。
4. **3D模型节点必须禁止记录图片后缀**：所有 `model*` 字段（modelUrl / modelSourcePath / modelAssetPath / localAssetUrl / localAssetPath）写入前必须校验扩展名，**遇到 png/jpg/jpeg/webp/bmp/gif 直接拒绝写入**。

---

### 🟢 完整数据流（Meshy 任务 → 蓝图节点 → 预览区渲染 → 3D 编辑器弹窗）

#### 第 1 层：任务下载（后端 + Runtime）

| 阶段 | 文件 | 关键逻辑 |
|-----|------|---------|
| Meshy 任务产物下载到本地 | `electron/backend/modules/meshy/service.mjs` | `updateTaskLocalAsset()` 接口会下载 meshy 的 model.glb → 保存到 `<项目根目录>/Content/Media/meshy-3d-<taskId>.glb`（注意是**短横线**不是下划线！）。**写入 localAssetUrl/localAssetPath 前会检查扩展名，图片后缀直接抛错拒绝**。 |
| Tripo3D 任务产物下载 | `electron/backend/modules/tripo3d/service.mjs` | 同上，保存为 `tripo3d-<taskId>.glb`。 |
| Runtime 轮询同步节点 settings | `src/views/AIWorkflow/node-business/meshy/useAIWorkflowMeshyRuntime.ts`、`src/views/AIWorkflow/node-business/tripo3d/useAIWorkflowTripo3DRuntime.ts` | 从 DB 读取 localAssetPath 后赋值给 `model3dSettings.modelSourcePath` / `modelUrl`。**赋值前进行图片后缀拦截**（见 `MODEL_EXT_WHITELIST` / `IMAGE_EXT_BLACKLIST`）。 |

> ⚠️ **文件名约定**：
> - Meshy: `meshy-3d-<UUID>.glb`（短横线，不是 `meshy_xxx`！）
> - Tripo3D: `tripo3d-<UUID>.glb`

#### 第 2 层：蓝图节点 settings 存储

每个 `type === 'model3d'` 的节点在 Blueprint JSON（`<项目根>/Blueprints/main.blueprint.json`）中存储结构如下：

```jsonc
{
  "id": "node_xxx",
  "type": "model3d",
  "resourceId": "res_xxx",              // ✅ 关键：关联 resourcesById 中的资源实体
  "model3dSettings": {
    "meshyModelSettings": {
      "taskId": "019fc3fb-...",         // Meshy 任务ID
      "modelUrl": "dweb://project-assets/?projectId=...",
      "modelSourcePath": "G:\\...\\Content\\Media\\meshy-3d-<taskId>.glb",
      "modelProjectRelativePath": "Content/Media/meshy-3d-<taskId>.glb"
    },
    "tripo3dModelSettings": { /* 同上结构 */ }
  }
}
```

同时 `blueprint.resourcesById[resourceId]` 中：
```jsonc
{
  "kind": "model3d",
  "name": "xxx.glb",
  "sourcePath": "G:\\...\\Content\\Media\\meshy-3d-<taskId>.glb",  // 本地绝对路径
  "projectRelativePath": "Content/Media/meshy-3d-<taskId>.glb",      // ✅ 最可靠的相对路径！
  "url": "dweb://project-assets/?projectId=1&path=Content%2FMedia%2Fmeshy-3d-..."
}
```

> 🔑 **核心结论**：当节点外层 `model3dSettings.*` 字段被旧数据污染（如误写为 .png）时，**`resourcesById[node.resourceId].projectRelativePath` 永远是最可信的 GLB 相对路径来源**（场景布局节点预览模式就是靠它正常渲染的！）。

#### 第 3 层：节点预览区渲染（WorkflowModel3DNode.vue）

**文件**：[WorkflowModel3DNode.vue](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-3d-model-node-polling-lag-ouiwhL/src/ui/WorkFlow/WorlFlowNodes/WorkflowModel3DNode.vue)

**渲染路径选择最高优先级顺序**（`forceResolvedLocalFileUrl` + `effectiveModelUrl` 计算属性）：

1. **从 resourcesById 取 projectRelativePath → 拼项目根目录 → 转 file:///**（最可靠）
   - 代码路径：`forceResolvedLocalFileUrl` → `ensureResolveToLocalFileUrl()` → 取 `props.resourceProjectRelativePath`（来自父组件 BlueprintDomOverlay 通过 `resourcesById[node.resourceId].projectRelativePath` 注入）
   - 拼接：`useProjectStore().currentProject.rootDir + '/' + projectRelativePath` → 转 `file:///G:/...`

2. **用 taskId 推导路径**（当 resourceId 关联失败时 fallback）
   - `deriveProjectMediaModelCandidates()` → `Content/Media/meshy-3d-<meshyTaskId>.glb`
   - 拼项目根 → 转 file:///

3. **settings.modelSourcePath（本地绝对路径）** → 转 file:///

4. **settings.modelProjectRelativePath** → 拼项目根 → 转 file:///

5. **内层 meshyModelSettings / tripo3dModelSettings 中的 URL**（仅在以上全失败时才考虑 dweb）

6. **❌ 永不考虑远程 https:// URL**（有 CORS，且文件已在本地）

> 🔴 **2026-08-03 修复前的核心 Bug**：`forceResolvedLocalFileUrl` 算出了正确的 file:/// 路径，但 `effectiveModelUrl` 这个 computed **完全没有引用它**，继续用了 dweb URL，导致各种 404/CORS。修复后 `effectiveModelUrl` 第一优先级就是 `forceResolvedLocalFileUrl.value`。

**最终渲染加载**（`loadModelIntoViewer()`）：
- 拿到 `effectiveModelUrl` 后，若是 `file:///` 或本地绝对路径，直接通过 Electron 主进程 `fetchAsArrayBuffer(url)` 代理读取 → 转 Uint8Array → `viewer.loadModelFromArrayBuffer()` 交给 Three.js GLTFLoader。
- 完全不经过网络请求（除了 Electron 主进程读本地磁盘）。

#### 第 4 层：3D 编辑器弹窗加载

**链路**：点击节点右上角「打开3D编辑器」按钮 → `onOpenEditor()` → `window.dweb.window.open3DEditor(payload)` → Electron 主进程处理 → 新开 `/3d-editor` 路由窗口 → `Model3DEditorPage.vue` 读取 URL query → 加载模型。

**关键文件**：
- 主进程处理：[electron/main.mjs](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-3d-model-node-polling-lag-ouiwhL/electron/main.mjs)（`open3DEditor` handler）
- 编辑器页面：[Model3DEditorPage.vue](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-3d-model-node-polling-lag-ouiwhL/src/views/Model3DEditorPage.vue)

**主进程 URL 构造**（`pickBestCandidate`）：同样按本地路径优先，**将传入的 modelUrl / modelAssetPath / models[].url 先转换为 `file:///` 绝对路径**，再编码到 URL query `models` 参数中。

**编辑器加载**（`parseModelsFromQuery()` → `initEditor()`）：
- 从 `route.query.models` 解码模型列表
- 每个模型的 URL 如果是 `file:///` 或本地绝对路径，通过主进程 `fetchAsArrayBuffer()` 读取 → Blob URL → `viewer.loadModel()`
- 完成后释放 Blob URL（`URL.revokeObjectURL`）

#### 第 5 层：EditorViewer.ts 模型校验（底层）

**文件**：`src/editor/EditorViewer.ts`

**校验顺序**（`verifyModelResource()` / `extractUrlExt()`）：

1. **先从 URL 提取扩展名**（白名单检查）：
   - `dweb://project-assets/?path=...glb` → 从 `path` / `relativePath` query 参数提取 `.glb`
   - `file:///G:/.../xxx.glb` → 从路径末尾提取
   - `http://cdn/xxx.glb?xxx` → 去掉 query 后从末尾提取

2. **扩展名命中 MODEL_EXT_WHITELIST（glb/gltf/fbx/obj/stl/usdz）→ 直接放行，不再做后续校验**（不再读 Content-Type、不再读魔数，避免 CDN 返回错误 Content-Type: image/png 导致误杀）

3. **扩展名命中 IMAGE_EXT_BLACKLIST（png/jpg/jpeg/webp/bmp/gif）→ 直接拒绝，不再做后续校验**

4. **无法识别扩展名 → fallback 魔数校验**（Range 请求 4KB header 检查 `glTF` / `PK` / PNG signature 等）

> 🔴 **2026-08-03 修复前的 Bug**：旧版按 Content-Type → 魔数 → 扩展名顺序校验，而 Meshy CDN 对 GLB 返回错误的 `Content-Type: image/png`，导致 100% 误杀。修复后改为扩展名优先 + 白名单直接放行。

---

### 🟡 轮询优化链路（TaskPollScheduler）

Meshy / Tripo3D Runtime 的任务轮询已不再用 `setInterval(1600ms)` 暴力轮询，改为统一调度中心：

**目录**：`src/views/AIWorkflow/node-business/shared/task-poll-scheduler/`

| 模块 | 说明 |
|-----|------|
| `TaskPollScheduler.ts` | 调度中心，动态间隔（PENDING→RUNNING 2000ms→4000ms，完成后停止），节点卸载自动去注册 |
| `useTaskPollScheduler.ts` | Vue composable，在 Runtime 中 onMounted 注册、onBeforeUnmount 注销 |
| `types.ts` / `constants.ts` | 类型与 Feature Flag |
| `index.ts` | 入口导出 |

**Feature Flag 紧急开关**（localStorage）：
```
localStorage.setItem('DVS_DISABLE_TASK_POLL_SCHEDULER', '1')  // 关闭新调度器，回退到 setInterval
localStorage.removeItem('DVS_DISABLE_TASK_POLL_SCHEDULER')    // 恢复
```

---

### 🔵 诊断脚本（调试必用）

当 3D 模型节点渲染异常时，先在项目根目录运行以下脚本（不需要开 Electron/Chrome，纯 Node 读取磁盘）：

| 脚本 | 路径 | 功能 |
|-----|------|------|
| `verify-model3d-local-path.mjs` | [scripts/utils/verify-model3d-local-path.mjs](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-3d-model-node-polling-lag-ouiwhL/scripts/utils/verify-model3d-local-path.mjs) | 读取蓝图 JSON → 扫描所有 model3d 节点 → 从 resourcesById/settings/taskId 三个来源拼候选路径 → 逐个检查真实存在性 → 输出 `file:///` URL。✅ 这是验证链路是否通的最快方式。 |
| `dump-blueprint-model3d-chain.mjs` | [scripts/utils/dump-blueprint-model3d-chain.mjs](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-3d-model-node-polling-lag-ouiwhL/scripts/utils/dump-blueprint-model3d-chain.mjs) | 场景分解节点下游链路完整 dump（含 resourceId → resourcesById 映射）。 |
| `inspect-blueprint-model3d-nodes.mjs` | [scripts/utils/inspect-blueprint-model3d-nodes.mjs](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-3d-model-node-polling-lag-ouiwhL/scripts/utils/inspect-blueprint-model3d-nodes.mjs) | 通用节点扫描 + resourceId 映射校验 + LocalDB meshyTasks 表关联读取。 |
| 设计方案文档 | [scripts/utils/01_3D模型节点轮询优化与模型加载修复设计方案.md](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-3d-model-node-polling-lag-ouiwhL/scripts/utils/01_3D模型节点轮询优化与模型加载修复设计方案.md) | 历史调研记录：卡顿根因、设计方案、目录结构。 |

**运行命令**：
```bash
node scripts/utils/verify-model3d-local-path.mjs
```

如果脚本输出某节点的候选路径中存在 `✅✅✅ 命中`，但节点仍无法渲染 → 说明代码选择了错误 URL（不是 file:///），回到「第 3 层」检查 `effectiveModelUrl` / `forceResolvedLocalFileUrl` 的优先级。

---

### 🟣 常见坑点速查（踩过的坑不要再踩！）

| 坑 | 现象 | 根因 | 正确做法 |
|----|------|------|---------|
| 🚫 使用远程 Meshy CDN URL | CORS 报错 `No 'Access-Control-Allow-Origin' header` + net::ERR_FAILED 200 | `effectiveModelUrl` 选了 `https://assets.meshy.ai/...` 而不是本地路径 | 第一优先级用 `projectRelativePath` + `rootDir` → 拼 `file:///` |
| 🚫 dweb:// 404 | GET dweb://project-assets/... 404 Not Found | dweb URL 拼错了（用 `meshy_` 而非 `meshy-3d-`），或参数路径错 | 永远优先拼本地绝对路径转 file:///，dweb 只作最后 fallback |
| 🚫 Content-Type 误杀 | `Content-Type为图片类型(image/png)，拒绝作为3D模型加载` | 旧版 EditorViewer 先校验 Content-Type，Meshy CDN 返回错误 image/png | `extractUrlExt()` 先拿扩展名，命中 MODEL_EXT_WHITELIST 直接放行，不要再校验 Content-Type |
| 🚫 文件后缀污染为 .png | `Content-Type(image/png) 和 文件魔数(PNG) 均为图片格式` | 旧任务轮询时把缩略图 PNG 路径写到了 modelSourcePath / localAssetPath | 后端 updateTaskLocalAsset 和 Runtime 赋值前双重拦截图片后缀；消费端用 resourcesById.projectRelativePath 作为最高优先级 |
| 🚫 forceResolvedLocalFileUrl 算出正确路径却没用 | 脚本显示文件存在，但节点仍用 dweb 渲染 | `effectiveModelUrl` 计算属性忘记把 `forceResolvedLocalFileUrl` 放入候选池 | `effectiveModelUrl` 第一优先级必须是 `forceResolvedLocalFileUrl.value` |
| 🚫 新节点和旧节点行为不一致 | 新建的 3D 模型节点正常，但历史节点渲染失败 | 旧节点 settings 中 model* 字段为空/错误，但 resourceId 是对的 | 永远先查 `resourcesById[node.resourceId].projectRelativePath`，这是新旧节点都稳定存在的字段（场景布局节点就是靠它） |
| 🚫 taskId 推导文件名错误 | 拼出 `Content/Media/meshy_<taskId>.glb` 但实际是 `meshy-3d-<taskId>.glb` | Meshy 资产的保存命名是 `meshy-3d-<taskId>.glb`（短横线+3d），不是下划线 | `deriveProjectMediaModelCandidates()` 中正确的前缀是 `meshy-3d-` 和 `tripo3d-` |
| 🚫 轮询太频繁卡顿 | AI 工作流蓝图页面拖拽卡顿、任务节点疯狂刷新 | setInterval 固定 1600ms 轮询所有任务 → 频繁 store commit → 主线程阻塞 | 用 TaskPollScheduler 动态间隔，完成后自动停止；Feature Flag 可紧急回退 |

---

## 参考文献

1. Three.js 官方文档: https://threejs.org/docs/
2. Real-Time Rendering 第四版
3. Blender EEVEE 技术文档
4. Google Model Viewer 最佳实践
5. Learn OpenGL: https://learnopengl.com/
