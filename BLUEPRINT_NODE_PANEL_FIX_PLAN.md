# 蓝图节点参数面板修复开发计划

## 一、问题概述

本计划针对 AI 工作流蓝图中图片节点与视频节点底部对话框参数面板的两个核心问题进行修复：

1. **图片节点 Meshy 参数面板问题**：尺寸（resolution）与宽高比（aspectRatio）参数冲突，Meshy 模型有自己独立的参数体系，应参考官方文档设计专用表单
2. **视频节点模型型号错误问题**：视频生成面板底部的型号错误地使用了生图模型 Seedream，应改为视频生成模型 Seedance

---

## 二、问题详细分析

### 2.1 图片节点 Meshy 参数面板问题

#### 2.1.1 当前实现

- **位置**：[NodeChatParamPanel.vue](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/ui/BluePrint/node-dialog/NodeChatParamPanel.vue) 第 120-272 行
- **配置文件**：[nodeChatConfig.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/ui/BluePrint/node-dialog/nodeChatConfig.ts)
- **类型定义**：[types.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/aiworkflow/types.ts) 中 `WorkflowImageNodeSettings` 和 `WorkflowNodeChatImageParams`

#### 2.1.2 问题根因

1. **参数冲突**：当前面板同时展示「尺寸」（如 1024x1024）和「宽高比」（如 16:9）两个独立参数，但 Meshy API 只使用 `aspect_ratio` 参数控制输出尺寸，不使用像素级 resolution
2. **模型差异**：不同 Meshy 模型支持的宽高比不同：
   - `nano-banana` / `nano-banana-2` / `nano-banana-pro`：支持 `1:1`, `16:9`, `9:16`, `4:3`, `3:4`
   - `gpt-image-2`：仅支持 `1:1`, `3:2`, `2:3`
3. **参数互斥**：`generate_multi_view` 为 true 时，不能同时设置 `aspect_ratio`
4. **缺少专用参数**：Meshy 还有 `negative_prompt`、`seed`、`output_image_count` 等专用参数未在底部对话框中完整展示

#### 2.1.3 Meshy 官方文档参考（text-to-image）

**API 端点**：`POST /openapi/v1/text-to-image`

**支持的参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `ai_model` | string | 是 | 模型 ID：`nano-banana`, `nano-banana-2`, `nano-banana-pro`, `gpt-image-2` |
| `prompt` | string | 是 | 提示词 |
| `negative_prompt` | string | 否 | 负向提示词 |
| `aspect_ratio` | string | 否 | 宽高比，默认 `1:1`。不同模型支持不同 |
| `generate_multi_view` | boolean | 否 | 多视图生成，默认 false。为 true 时不能设置 aspect_ratio |
| `pose_mode` | string | 否 | 姿态模式：`a-pose`, `t-pose` |
| `seed` | number | 否 | 随机种子 |
| `output_image_count` | number | 否 | 输出图片数量 |

**不同模型的 aspect_ratio 支持**：
- nano-banana / nano-banana-2 / nano-banana-pro：`1:1`, `16:9`, `9:16`, `4:3`, `3:4`
- gpt-image-2：`1:1`, `3:2`, `2:3`

---

### 2.2 视频节点模型型号错误问题

#### 2.2.1 当前实现

- **位置**：[NodeChatParamPanel.vue](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/ui/BluePrint/node-dialog/NodeChatParamPanel.vue) 第 646 行
- **问题代码**：
  ```typescript
  const seedanceModelVersionOptions = NODE_CHAT_SEEDREAM_MODEL_VERSION_OPTIONS
  ```
- **正确引用**：应该是 `NODE_CHAT_SEEDANCE_MODEL_VERSION_OPTIONS`

#### 2.2.2 问题根因

变量赋值错误，将视频模型选项错误地指向了图片模型（Seedream）的选项列表，导致视频生成面板中展示的是生图模型版本而不是视频模型版本。

#### 2.2.3 Seedance 视频生成官方文档参考

**支持的视频模型系列**：

| 模型 | 说明 |
|------|------|
| Seedance 2.0 | 最新版，支持多模态参考（图+视频+音频），4K 输出 |
| Seedance 2.0 Fast | 快速版，适合快速试稿 |
| Seedance 2.0 Mini | 轻量版（即将上线 API） |
| Seedance 1.5 Pro | 支持 draft 试稿模式、1080p、离线推理 |
| Seedance 1.0 Pro | 支持 1080p |
| Seedance 1.0 Pro Fast | 速度优先 |
| Seedance 1.0 Lite I2V / T2V | 轻量版 |
| 即梦视频 3.0 / 3.0 Pro | 即梦后端链路 |

**核心参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `model` | string | 模型 ID（必选） |
| `resolution` | string | 分辨率：480p, 720p, 1080p, 4k（2.0 支持） |
| `ratio` | string | 宽高比：16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive |
| `duration` | number | 视频时长（秒），不同模型支持范围不同 |
| `seed` | number | 随机种子 |
| `generate_audio` | boolean | 是否生成音频（2.0 和 1.5 Pro 支持） |
| `camera_fixed` | boolean | 固定镜头 |
| `watermark` | boolean | 水印 |
| `return_last_frame` | boolean | 返回尾帧 |
| `draft` | boolean | 样片模式（仅 1.5 Pro） |
| `service_tier` | string | 服务等级：default / flex（仅 1.5 Pro） |

---

## 三、修复方案

### 3.1 图片节点 Meshy 参数面板修复

#### 3.1.1 修复目标

为 Meshy 图片生成设计独立的参数表单，根据所选模型动态调整可用参数，消除尺寸与比例的冲突问题。

#### 3.1.2 修改文件清单

| 文件路径 | 修改类型 | 说明 |
|----------|----------|------|
| `src/ui/BluePrint/node-dialog/nodeChatConfig.ts` | 修改 | 新增 Meshy 图片专用参数配置和模型-比例映射表 |
| `src/ui/BluePrint/node-dialog/NodeChatParamPanel.vue` | 修改 | 图片节点 Meshy 模式下隐藏通用 resolution，使用 Meshy 专用参数组 |
| `src/aiworkflow/types.ts` | 修改 | （如需）补充类型定义 |

#### 3.1.3 具体实现步骤

**Step 1: 扩充 nodeChatConfig.ts 配置**

1. 新增 `NODE_CHAT_MESHY_IMAGE_ASPECT_RATIO_OPTIONS`，按模型分组：
   - nano-banana 系列：1:1, 16:9, 9:16, 4:3, 3:4
   - gpt-image-2：1:1, 3:2, 2:3

2. 新增 `getMeshyAspectRatioOptions(aiModel: string)` 工具函数，根据模型返回对应的宽高比选项

3. 在 `getDefaultParamsForType('image')` 中，为 meshy 模式补充 `meshyNegativePrompt`、`meshySeed`、`meshyOutputImageCount` 等默认值

**Step 2: 修改 NodeChatParamPanel.vue 参数面板**

1. 在 `nodeType === 'image'` 且 `params.model === 'meshy'` 的条件下：
   - **隐藏**「尺寸」（resolution）参数行（Meshy 不用像素级 resolution）
   - 「宽高比」参数行改为动态选项，根据 `params.meshyImageAiModel` 调用 `getMeshyAspectRatioOptions`
   - 新增「负向提示词」输入框（如已有则调整位置）
   - 新增「输出数量」选项
   - 新增「随机种子」输入框
   - 当 `params.meshyGenerateMultiView === true` 时，禁用「宽高比」选项，并显示提示文字

2. 调整参数布局，确保 Meshy 参数分组清晰

**Step 3: 验证 buildMeshyImageRequestPayload 逻辑**

检查 [useAIWorkflowImageNodeMeshy.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/views/AIWorkflow/node-business/meshy/useAIWorkflowImageNodeMeshy.ts) 中的 `buildMeshyImageRequestPayload` 函数：
- 确认参数正确传递到后端
- 确保 aspect_ratio 与 generate_multi_view 的互斥逻辑在提交前校验

---

### 3.2 视频节点模型型号错误修复

#### 3.2.1 修复目标

1. 修复视频节点型号选项引用错误（Seedream → Seedance）
2. 完善视频节点参数面板，增加更多 Seedance 专用参数

#### 3.2.2 修改文件清单

| 文件路径 | 修改类型 | 说明 |
|----------|----------|------|
| `src/ui/BluePrint/node-dialog/NodeChatParamPanel.vue` | 修改 | 修复 seedanceModelVersionOptions 引用错误 |
| `src/ui/BluePrint/node-dialog/nodeChatConfig.ts` | 修改 | （如需）补充视频模型配置 |

#### 3.2.3 具体实现步骤

**Step 1: 修复变量引用错误（核心 Bug 修复）**

在 [NodeChatParamPanel.vue](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/ui/BluePrint/node-dialog/NodeChatParamPanel.vue#L646-L646) 第 646 行：

**修改前**：
```typescript
const seedanceModelVersionOptions = NODE_CHAT_SEEDREAM_MODEL_VERSION_OPTIONS
```

**修改后**：
```typescript
const seedanceModelVersionOptions = NODE_CHAT_SEEDANCE_MODEL_VERSION_OPTIONS
```

同时确保顶部 import 已引入 `NODE_CHAT_SEEDANCE_MODEL_VERSION_OPTIONS`。

**Step 2: 完善视频参数面板（可选增强）**

参考 [SeedanceVideoForm.vue](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/ui/UIComponent/SeedanceVideoForm.vue) 中更完整的参数配置，为底部对话框的视频参数面板增加：

1. **分辨率**（resolution）：480p / 720p / 1080p（当前已有 ratio，但缺少独立的 resolution 选项）
2. **固定镜头**（camera_fixed）：开关选项
3. **返回尾帧**（return_last_frame）：开关选项
4. **模型感知的参数动态调整**：
   - 选择不同 Seedance 版本时，动态调整可选的 duration 范围
   - Seedance 2.0 系列：支持 4-15 秒，支持 4K
   - Seedance 1.5 Pro：支持 4-12 秒，支持 draft 模式
   - Seedance 1.0 系列：支持 2-12 秒

**Step 3: 同步 nodeChatConfig.ts 配置**

确保 `NODE_CHAT_SEEDANCE_MODEL_VERSION_OPTIONS` 与 [SeedanceVideoForm.vue](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/ui/UIComponent/SeedanceVideoForm.vue) 中的模型列表保持一致（包括即梦视频 3.0 等）。

---

## 四、代码修改位置索引

### 4.1 图片节点 Meshy 修复

| 位置 | 文件 | 行号范围 | 说明 |
|------|------|----------|------|
| 参数配置 | [nodeChatConfig.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/ui/BluePrint/node-dialog/nodeChatConfig.ts) | 184-203 | `NODE_CHAT_MESHY_IMAGE_OPTIONS` 配置区 |
| 默认参数 | [nodeChatConfig.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/ui/BluePrint/node-dialog/nodeChatConfig.ts) | 242-254 | `getDefaultParamsForType('image')` |
| 参数面板 UI | [NodeChatParamPanel.vue](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/ui/BluePrint/node-dialog/NodeChatParamPanel.vue) | 120-272 | `nodeType === 'image'` 模板块 |
| 模型选项映射 | [NodeChatParamPanel.vue](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/ui/BluePrint/node-dialog/NodeChatParamPanel.vue) | 620-647 | 底部 import 和变量映射 |
| 请求构建 | [useAIWorkflowImageNodeMeshy.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/views/AIWorkflow/node-business/meshy/useAIWorkflowImageNodeMeshy.ts) | 80-119 | `buildMeshyImageRequestPayload` |
| 类型定义 | [types.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/aiworkflow/types.ts) | 774-779 | `WorkflowNodeChatImageParams` |

### 4.2 视频节点模型修复

| 位置 | 文件 | 行号范围 | 说明 |
|------|------|----------|------|
| **核心 Bug** | [NodeChatParamPanel.vue](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/ui/BluePrint/node-dialog/NodeChatParamPanel.vue) | 646 | `seedanceModelVersionOptions` 赋值错误 |
| 视频模型配置 | [nodeChatConfig.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/ui/BluePrint/node-dialog/nodeChatConfig.ts) | 220-228 | `NODE_CHAT_SEEDANCE_MODEL_VERSION_OPTIONS` |
| 视频参数 UI | [NodeChatParamPanel.vue](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/ui/BluePrint/node-dialog/NodeChatParamPanel.vue) | 274-388 | `nodeType === 'video'` 模板块 |
| 参考组件 | [SeedanceVideoForm.vue](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/ui/UIComponent/SeedanceVideoForm.vue) | 全部 | 完整的 Seedance 表单组件 |
| 类型定义 | [types.ts](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/src/aiworkflow/types.ts) | 781-790 | `WorkflowNodeChatVideoParams` |

---

## 五、验证方案

### 5.1 图片节点 Meshy 验证

1. **基础功能验证**：
   - 打开图片节点底部对话框
   - 模型接口选择「Meshy」
   - 确认「尺寸」参数不再显示（或被禁用）
   - 确认「宽高比」参数显示正确的选项

2. **模型-比例联动验证**：
   - 选择 `nano-banana` 模型，宽高比应显示：1:1, 16:9, 9:16, 4:3, 3:4
   - 选择 `gpt-image-2` 模型，宽高比应显示：1:1, 3:2, 2:3

3. **多视图互斥验证**：
   - 开启「多视图」开关
   - 确认「宽高比」选项被禁用或隐藏
   - 关闭「多视图」开关
   - 确认「宽高比」选项恢复可用

4. **生成验证**：
   - 填写提示词，选择 16:9 比例
   - 点击生成，确认请求 payload 中 aspect_ratio=16:9，无 resolution 参数
   - 生成成功后，确认输出图片比例为 16:9

### 5.2 视频节点型号验证

1. **型号列表验证**：
   - 打开视频节点底部对话框
   - 模型接口选择「Seedance」
   - 确认「型号」列表显示的是 Seedance 系列模型（而非 Seedream）
   - 模型应包括：Seedance 2.0、Seedance 2.0 Fast、Seedance 1.5 Pro 等

2. **生成验证**：
   - 选择一个 Seedance 模型，填写提示词
   - 点击生成，确认任务使用正确的视频模型
   - 任务成功后，在视频任务面板中确认 model 字段正确

---

## 六、注意事项

1. **向后兼容**：修改参数结构时，需确保已保存的旧项目蓝图能正常加载，对缺失的新参数使用默认值
2. **多模型共存**：图片节点有三种模型（NanoBanana / Seedream / Meshy），每种有不同的参数体系，需确保切换模型时参数正确切换
3. **类型安全**：TypeScript 类型定义需与实际参数结构保持一致
4. **参数校验**：提交生成前，在前端做参数合法性校验（如多视图与宽高比互斥）
5. **与后端对齐**：前端参数命名需与后端 [comfyui_bridge/api.py](file:///c:/Users/Sugar/.trae-cn/worktrees/DVStudio/fix-blueprint-node-panel-bug-gjxq8t/django-app/comfyui_bridge/api.py) 中的实现保持一致

---

## 七、开发优先级

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P0（必须） | 修复视频节点型号引用错误 | 一行代码修复，核心 Bug |
| P1（重要） | Meshy 图片参数面板重构 | 消除尺寸与比例冲突 |
| P2（优化） | 视频参数面板完善 | 增加 resolution、camera_fixed 等参数 |
