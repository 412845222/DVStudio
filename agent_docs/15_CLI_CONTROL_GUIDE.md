# 15. CLI 跨进程控制接口开发指引（dvscli）

> 目标读者：**外部 Agent / 集成脚本 / 自动化流水线**。
> 阅读本指南后，你应能在 5 分钟内从另一个进程调用 DVStudio 生成图片、查询状态、取消任务。

---

## 1. 是什么 / 不是什么

### ✅ 是什么
- **跨进程控制入口**：在 **DVStudio 已启动并打开了 AI 工作流蓝图项目** 的前提下，另一个进程（脚本、CI、其他 Agent、Python/Node/Rust 任意语言）通过本地 HTTP 接口（127.0.0.1 + Token）控制 DVStudio。
- **官方 CLI**：`cli/bin/dvscli.mjs`（可 `node cli/bin/dvscli.mjs status`），别名 `dvscli`。
- **三段流水线**：任何任务都会按 **P3（后端直连/Seedream 优先）→ P2（Agent Runtime 工具调用）→ P1（前端轮询+兜底）** 的顺序调度，一路失败则自动降级到下一路，不会挂死。
- **MCP 风格工具定义**：`dvscli tools list --json` 返回 JSON Schema 工具描述，可直接喂给 MCP Client 或另一个 Agent。
- **纯离线安全**：只绑定 127.0.0.1，随机端口 + 随机 Token，认证失败即 401，所有文件操作限定在项目目录/输出目录内。

### ❌ 不是什么
- **不是** DVStudio 的"启动器/安装器"，不能在未启动客户端时使用。
- **不是** Headless 服务器，没有蓝图编辑器时无法创建/执行节点（需要 AI 工作流蓝图页面处于打开状态，P2/P1 才生效；P3 Seedream 直连路径不依赖前端，即便无打开蓝图也可用）。
- **不是** 聊天 CLI，不直接与 LLM 对话；它只把任务提交到 DVStudio 内部的 Agent Runtime 并轮询结果。
- **不跨机器**，仅在同一台 Windows/macOS 主机内工作。

---

## 2. 发现协议（另一个程序如何找到 DVStudio）

### 2.1 5 层自动发现（优先级从高到低）
| 优先级 | 方式 | 说明 |
| ------ | ---- | ---- |
| 1 | CLI 显式参数 | `dvscli --port=52306 --token=xxx status` |
| 2 | 环境变量 | `DVSCLI_PORT / DVSCLI_HOST / DVSCLI_TOKEN` |
| 3 | 运行时配置文件 | `<DWEB_RESOURCE_DIR>/Runtime/cli-control-server.json`（JSON 含 `host/port/token`）|
| 4 | 便携模式 | `$CWD/DVSResource/Runtime/cli-control-server.json` |
| 5 | 端口扫描兜底 | 扫描 127.0.0.1:52300-52399 的 `/health` 公开端点 |

### 2.2 运行时文件格式（给非 JS 集成方参考）
```jsonc
// cli-control-server.json
{
  "host": "127.0.0.1",
  "port": 52306,
  "token": "dvs_cli_xxxxxxxxxxxxxxxx",
  "createdAt": 1787142036205,
  "pid": 33124
}
```
- 路径选择优先级：`DWEB_RESOURCE_DIR/Runtime` → `<工作目录>/DVSResource/Runtime` → `%APPDATA%/DVStudio/DVSResource/Runtime`。

### 2.3 先跑这 3 条（验证链路）
```bash
# 1. 确认客户端在线
node cli/bin/dvscli.mjs status --json
# => { ok:true, running:true, server:{port:52306}, agent:{ready:false}, mcp:{builtinToolsCount:13} }

# 2. 获取所有工具的 MCP 风格 JSON Schema（给另一个 Agent 快速解析）
node cli/bin/dvscli.mjs tools list --json

# 3. 查看子命令帮助
node cli/bin/dvscli.mjs help generate-image --json
```

---

## 3. 所有命令一览

| 命令 | 说明 | 推荐场景 |
| ---- | ---- | -------- |
| `status [--json]` | 健康检查 + 当前项目 + Agent 就绪状态 + 已注册工具数 | 集成前必跑，用于发现是否该降级 |
| `generate-image [options]` | 提交图片生成任务（**唯一推荐的图片生成入口**，三段流水线自动调度） | 其他 Agent / 脚本需要生图 |
| `tools list [--json]` | 列出所有 MCP 风格工具（JSON Schema 格式，含参数/返回/示例）| MCP Client / Tool Registry / 其他 Agent 动态集成 |
| `task query <taskId> [--json]` | 轮询任务状态 + 输出文件路径列表 | 长任务 / `--no-wait` 提交后查询结果 |
| `task cancel <taskId> [--json]` | 取消任务（best-effort，已在后端直连阶段的任务无法取消） | 用户取消 / 超时回收 |
| `help [command] [--json]` | 显示帮助 | 给人读 / 给程序解析 JSON |

### 3.1 全局参数（所有命令通用）
| 参数 | 环境变量 | 类型 | 默认 |
| ---- | -------- | ---- | ---- |
| `--host <host>` | `DVSCLI_HOST` | string | `127.0.0.1` |
| `--port <port>` | `DVSCLI_PORT` | number | 自动发现 |
| `--token <token>` | `DVSCLI_TOKEN` | string | 自动发现 |
| `--timeout <ms>` | — | number | `600000`（10 分钟，生图够用）|
| `--json` | — | flag | 文本输出 |
| `-h/--help` | — | — | 显示帮助 |
| `-v/--version` | — | — | 显示版本 |

### 3.2 退出码（EXACT 数值，脚本集成请按此判断）
| 值 | 宏 | 含义 |
| -- | ---- | ---- |
| 0 | `OK` | 成功 |
| 1 | `INTERNAL_ERROR` | CLI 内部错误（文件/网络/解析）|
| 2 | `INVALID_PARAMS` | 命令行参数错误 / 必填缺失 |
| 3 | `CLIENT_NOT_RUNNING` | 没发现 DVStudio（端口/文件/扫描都没找到）|
| 4 | `AUTH_FAILED` | Token 错误 / 过期 |
| 5 | `NO_ACTIVE_PROJECT` | 蓝图没打开项目（P2/P1 无法用；P3 直连不受影响）|
| 6 | `REQUEST_TIMEOUT` | 请求超时（超过 `--timeout`）|

---

## 4. generate-image 命令详解（三段流水线 + Seedream 原生参数体系）

这是最重要的命令。**无论走哪条路径，默认模型永远是字节方舟 Seedream 4.5（Endpoint `doubao-seedream-4-5-251128`）**。参数体系以 **Seedream 蓝图原生字段** 为唯一契约；legacy 的宽高、自由比例仍可传，但会在服务端被统一规范化为预设档位+官方比例。

### 4.1 模块划分 / 开发边界（7 层架构 + 禁止事项）

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │ Layer 0 调用入口（CLI → HTTP）                                       │
 │   [PS1] build/bin/dvs-cli.ps1（Windows 安装后 PATH 可用）             │
 │          dvs-cli.cmd / dvs-cli.ps1 解析 --seedream-size 等原生 flag  │
 │          generate-image if 块内部代码 → UTF-16LE Base64 包到脚本内    │
 │          运行时解码，规避 PS5 解析器对 `}` 关闭时的回溯 bug           │
 │   [ESM] cli/src/commands/generate-image.mjs（Node 开发者入口）        │
 │          目前仅传 legacy width/height/aspectRatio（但服务端会规范化） │
 │        ↓ POST /v1/generate-image (JSON body 见 §4.2)                │
 ├─────────────────────────────────────────────────────────────────────┤
 │ Layer 1 自动发现 + 鉴权                                              │
 │   5 层端口/Token 发现（§2.1）+ x-dvs-cli-token Header 注入          │
 │   auth.mjs：除 /health 外全部 401                                    │
 ├─────────────────────────────────────────────────────────────────────┤
 │ Layer 2 服务端规范化（最关键的一致性层 ⭐）                            │
 │   service.mjs :: normalizeSeedreamPayloadForSubmission()            │
 │     ├─ 优先读 seedreamSize / seedreamAspectRatio → 直接用           │
 │     ├─ 否则 width/height → _matchSeedreamPresetAndRatio()           │
 │     │     三阶段匹配：① WxH 精确命中表 → ② 最简比 + 面积差 →         │
 │     │                    ③ 全局 32 个预设按面积差最小兜底            │
 │     ├─ endpoint 解析：--seedream-endpoint > --seedream-model-version│
 │     │     > --model(真实 ep-/doubao-*) > 默认 doubao-seedream-4-5-251128 │
 │     └─ 最终输出：seedreamSize + seedreamAspectRatio + seedreamQuantity│
 │          + seedreamWatermark + seedreamOutputFormat + seedreamSeed   │
 │          + seedreamNegativePrompt + seedreamModelVersion             │
 │          （蓝图参数面板需要的最小集合；size/aspectRatio/w/h 仍在顶层 │
 │          作为 third-party service 兼容读取字段保留）                  │
 ├─────────────────────────────────────────────────────────────────────┤
 │ Layer 3 三段流水线调度（P3 → P2 → P1 逐级降级）                      │
 │   P3 后端直连（最快 1-5s，不依赖 UI）                                 │
 │     builtinTools.mjs :: generateImageViaSeedream()                  │
 │       → third-party/service.mjs seedreamGenerateStream              │
 │       → 下载到 %TEMP%/dvs-genimg/*.png → autoExport 复制到 outputPath│
 │       → 调用 enqueueCreateImageNodeRequests（exportedFiles 优先、     │
 │         outputFiles 兜底）创建 image 类型节点（纯预览，不重复跑）      │
 │       → enqueueChatImagePreviewBlocks 同样优先级回退，                │
 │         Agent 对话框注入 {type:'image_url', url:'file:///...'} 块    │
 │   P2 Agent Runtime（需蓝图打开，agent.ready=true）                    │
 │     useCLIAgentTrigger.ts :: buildAgentPromptForCLITask()           │
 │       → system prompt 强制 model=doubao-seedream-4-5-251128         │
 │       → ToolExecutor 调 generate_image in-process handler           │
 │   P1 前端轮询兜底（不推荐，60s IPC 超时天花板）                        │
 │     create_node(image-generation) → execute_node → 轮询完成 → 复制  │
 ├─────────────────────────────────────────────────────────────────────┤
 │ Layer 4 蓝图节点 + Agent 对话预览                                     │
 │   ImageNode（type='image'，只预览，不重复执行）                        │
 │   AIChatDialog.vue 中 Assistant Message 预览块                        │
 ├─────────────────────────────────────────────────────────────────────┤
 │ Layer 5 任务存储 + 结果查询                                            │
 │   taskStore.mjs（内存，completedAt + exportedFiles[] + outputFiles[]）│
 │   调用方必须优先 exportedFiles[]（最终路径）                           │
 └─────────────────────────────────────────────────────────────────────┘
```

> **开发边界铁律（⚠️ 修改 CLI 生图链路时必须遵守）**：
> 1. **Seedream 原生字段是唯一契约**，任何新的参数必须先写入 `seedreamSize/seedreamAspectRatio/seedreamQuantity/seedreamWatermark/seedreamOutputFormat/seedreamSeed/seedreamNegativePrompt/seedreamModelVersion`，然后才考虑 legacy 兼容；禁止"只传 width/height 然后在每层都反算一次"造成漂移。
> 2. **normalizeSeedreamPayloadForSubmission() 是唯一服务端兜底规范化函数**；任何 POST `/v1/generate-image` 的调用方（HTTP 直连 / CLI / MCP）只要把原始 JSON 交给它，就能得到与蓝图面板一致的 seedream-* 字段集合；不要再在别处另写一套匹配函数。
> 3. **预览节点 + Agent 对话块只在 Task 成功完成后入队一次**；用 exportedFiles 优先、outputFiles 兜底，防止 export 失败导致用户看不到任何结果。
> 4. **默认模型永远是 Seedream 4.5**，不要在 CLI 层、Tool Schema 层、Prompt 构造层写 `'gemini'/'gpt'` 为默认；非 seedream 兼容 ID 会被自动回退并打 WARN（静默不报错，避免用户误传导致失败）。
> 5. **落盘先临时后正式**：先写 `%TEMP%/dvs-genimg/*.png`，成功后再 `copyFile` 到 outputPath / project media；失败直接删除临时文件，不留下半成品。

### 4.2 参数 JSON 规范（同时适用于 CLI 和 /v1/generate-image HTTP POST）

> 🎯 **推荐写法（和蓝图参数面板字段完全一致）**：直接传 Seedream 原生字段。

```jsonc
{
  // ===== 必填 =====
  "prompt": "一只可爱的布偶猫戴着太空头盔漂浮在星空中",

  // ===== 推荐（Seedream 蓝图原生字段，优先级最高，服务端不再二次改写）=====
  "seedreamSize":            "2K",  // 1K | 2K | 3K | 4K        ← 与蓝图 "尺寸档位" 下拉一致
  "seedreamAspectRatio":   "16:9",  // 1:1 | 16:9 | 9:16 | 4:3 | 3:4 | 3:2 | 2:3 | 21:9  ← 8 种官方比例
  "seedreamQuantity":         1,    // 1 | 2 | 4（Seedream API 严格上限 4，超额自动 clamp）
  "seedreamWatermark":    false,    // bool（默认 false）
  "seedreamOutputFormat":  "jpeg",  // jpeg | png（默认 jpeg）
  "seedreamSeed":            -1,    // int >=0 固定种子；-1 或不传 = 随机
  "seedreamNegativePrompt": "模糊, 低质量",   // 字符串（或用 legacy negativePrompt 二选一）
  "seedreamModelVersion": "doubao-seedream-4-5-251128",
  // ↑ Endpoint 解析 4 级优先级：
  //   payload.seedreamEndpoint > seedreamModelVersion > model(真实 ep-/doubao-*) > 默认 doubao-seedream-4-5-251128
  //   推荐留空使用默认；用户显式指定 Seedream 5.0 时传 doubao-seedream-5-0-260128 即可

  // ===== Legacy 兼容（不推荐，但传了会先服务端规范化为上面 8 个原生字段，再进入流程）=====
  "width": 1024, "height": 1024,       // 任意像素；_matchSeedreamPresetAndRatio() 三阶段匹配到官方预设+比例
  "aspectRatio": "1:1",                 // 同上枚举 8 个或旧 5 个都可；不传 width/height 时默认 2K
  "size": "2K",                         // 等价 seedreamSize
  "aspect_ratio": "16:9",               // 等价 seedreamAspectRatio（Snake Case 兼容）
  "ratio": "3:4",                       // 等价 seedreamAspectRatio
  "negativePrompt": "...",              // 等价 seedreamNegativePrompt
  "seed": 42,                           // 等价 seedreamSeed（-1 = 随机）
  "imageCount": 1,                      // 等价 seedreamQuantity，但 seedreamQuantity 严格 1/2/4
  "model": "",                          // 推荐留空（按 4 级优先级 fallback）
  "references": ["C:/path/to/ref.jpg"], // 可选，图生图参考图（绝对路径数组）

  // ===== 任务控制 =====
  "outputPath": "G:/path/或文件",         // ⚠️ 不传时自动落到 <项目根>/generated_media/<项目名>/images/
  "projectId": 17,                       // 可选，默认当前打开项目
  "autoExport": true,                    // 完成后自动复制到 outputPath（默认 true）
  "wait": true,                          // 等后端返回后再退出（默认 true；false 立即返回需配合 task query）
  "stream": false                        // 保留字段，SSE 流式进度
}
```

#### ⚠️ 4.2.1 Endpoint / Model 参数强约束（4 级优先级）
| 优先级 | 字段 | 示例 | 说明 |
|---|---|---|---|
| 1（最高）| `seedreamEndpoint` | `ep-20240819xxxxx` 或 `doubao-seedream-5-0-260128` | 通过 `--seedream-endpoint` 传入；真实 Volcengine Ark Endpoint ID |
| 2 | `seedreamModelVersion` | `doubao-seedream-4-5-251128` | 通过 `--seedream-model-version` 传入；和蓝图参数面板"Seedream 模型版本"下拉一致 |
| 3 | `model` | `doubao-seedream-5-0-260128` / `ep-xxxx` | 短 Provider 名或真实 Endpoint ID；只有匹配 `^(ep-\|doubao-\|seedream-\|jimeng-\|seedance-\|bytedance-\|volc-)` 才会生效；传 `'gemini'/'gpt'` → 自动忽略并回退默认 + WARN 日志 |
| 4（兜底）| — | — | `doubao-seedream-4-5-251128`（Seedream 4.5，与蓝图对话框默认一致）|

#### 4.2.2 Seedream 官方 4 档 × 8 比例 像素映射表（唯一真值）
任何传进来的 width/height/aspectRatio 都会通过 `_matchSeedreamPresetAndRatio()` 规范化为下表中 32 个组合之一，对应精确 WxH 像素由 `third-party/service.mjs resolveSeedreamSize()` 查表展开。

| 档位 \ 比例 | **1:1** | **16:9** | **9:16** | **4:3** | **3:4** | **3:2** | **2:3** | **21:9** |
|---|---|---|---|---|---|---|---|---|
| **1K** | 1024×1024 | 1280×720 | 720×1280 | 1152×864 | 864×1152 | 1248×832 | 832×1248 | 1512×648 |
| **2K** ⭐默认 | 2048×2048 | **2848×1600** | 1600×2848 | 2304×1728 | 1728×2304 | 2496×1664 | 1664×2496 | 3136×1344 |
| **3K** | 3072×3072 | 4096×2304 | 2304×4096 | 3456×2592 | 2592×3456 | 3744×2496 | 2496×3744 | 4704×2016 |
| **4K** | 4096×4096 | 5504×3040 | 3040×5504 | 4704×3520 | 3520×4704 | 4992×3328 | 3328×4992 | 6240×2656 |

`_matchSeedreamPresetAndRatio(w, h)` 三阶段匹配算法：
1. **精确命中**：`${w}x${h}` 正好出现在上表 → 直接返回对应 preset+ratio。
2. **最简比命中**：宽高的 GCD 最简比命中 8 个官方 ratio 之一 → 在该 ratio 下 4 个档位按面积差最小选。
3. **全局兜底**：最简比不匹配（例如 2000×1333 最简比 200:133 不在枚举）→ 在 4×8=32 个预设中全局按面积差最小选。
4. **单边已知**：只传 width 或只传 height → 缺的一边按 1:1 近似（等于已知边），再递归匹配。
5. **什么都没传**：兜底 = `2K` + `1:1`（= 2048×2048）。

### 4.3 三段流水线调度（P3 → P2 → P1，逐级降级）
```
CLI POST /v1/generate-image
   │
   ▼
P3 后端直连（优先，不需要前端）:
   generateImageHandler()
    └─ generateImageViaSeedream()        // 字节方舟 Ark API，进程内完成，1-5 秒
        ├─ 成功 → 下载到 %TEMP%/dvs-genimg/*.png → autoExport 复制到 outputPath
        │     → enqueueCreateImageNodeRequests()   exportedFiles 优先 → outputFiles 兜底
        │       (创建 type: 'image' 纯预览节点，不重复执行 API)
        │     → enqueueChatImagePreviewBlocks()    同上优先级回退，注入 Assistant Message image_url 块
        │     → taskStore.markTaskCompleted，200 返回 completed
        └─ 失败（API Key 未配 / Ark 连不上）
   │
   ▼ 降级
P2 提交到 Agent Runtime（需蓝图页面已打开）:
   useCLIAgentTrigger.buildAgentPromptForCLITask()
     └─ 在 system prompt 里把 model 强制设为 doubao-seedream-4-5-251128
        → Agent Runtime 的 ToolExecutor 调 generate_image in-process handler
        → 同上 generateImageViaSeedream 走 P3 内层逻辑
   │
   ▼ 降级
P1 前端轮询分发（兜底，兼容历史链路）:
   create_node(image-generation) → execute_node → 轮询任务完成 → 复制到 outputPath
```

**为什么这样设计？**
- P3：最快、最省、最稳定（不依赖 UI，不涉及 Electron IPC）。
- P2：当用户在蓝图对话框场景里（agent.ready=true），和普通对话行为一致，结果直接出现在 UI。
- P1：兜底，不推荐。慢且有 60s IPC 超时天花板，只在 API Key 缺失但蓝图页面正常开着时撑场面。

### 4.4 默认落盘目录（未传 outputPath 时）
```
<蓝图项目根目录>/
  generated_media/
    <项目名（非法字符替换为_）>/
      images/
        seedream-<timestamp>-<n>.png
```
- 目录不存在时自动 `mkdir -p`。
- 当传的 `outputPath` 是目录时，在此目录下按 `seedream-<ts>-<n>.png` 命名。
- 当 `imageCount=1` 且 `outputPath` 是文件路径（带扩展名）时，直接按用户指定名称落盘。

### 4.5 命令行对应参数（⚠️ dvs-cli.ps1 / .cmd 完整支持；Node CLI 暂缺 seedream-* flags）

> **🎯 推荐：使用 Seedream 原生参数组合。** dvs-cli.ps1（Windows 安装后 PATH 中的 `dvs-cli`）和 Node 版 CLI 最终都会走 HTTP POST `/v1/generate-image` → service 层 normalize，所以 legacy 写法服务端也能正确标准化；但 Windows 端 PS1 在提交前就写入 seedream-*，更接近蓝图面板真实参数。

| 参数名（CLI flag） | payload 字段 | 类型 / 枚举 | 说明 |
| --- | --- | --- | --- |
| **`--prompt / -p <text>`** | prompt | string，**必填** | 提示词（不能为空字符串）|
| **🛸 Seedream 原生参数（推荐）** | | | |
| **`--seedream-size <1K\|2K\|3K\|4K>`** | seedreamSize | enum，默认 2K | 蓝图"尺寸档位"下拉。优先级高于 width/height；传了就不再做像素反推 |
| **`--seedream-aspect-ratio <r>`** | seedreamAspectRatio | enum，默认 1:1 | 蓝图"比例"下拉：`1:1 / 16:9 / 9:16 / 4:3 / 3:4 / 3:2 / 2:3 / 21:9` |
| **`--seedream-quantity <1\|2\|4>`** | seedreamQuantity | 1/2/4，默认 1 | Seedream 官方支持单次 1/2/4；传 3 → 自动 clamp 到 2；传 ≥5 → clamp 到 4 |
| `--seedream-watermark <1\|true\|0\|false>` | seedreamWatermark | bool，默认 false | Seedream 官方水印开关（默认不加水印）|
| `--seedream-output-format <jpeg\|png>` | seedreamOutputFormat | enum，默认 jpeg | 输出格式 |
| `--seedream-seed <int>` | seedreamSeed | int，默认 -1（随机）| 对应蓝图"随机种子"；≥0 生效；和 legacy `--seed` 等价 |
| `--seedream-negative-prompt <text>` | seedreamNegativePrompt | string | 负向提示词；和 legacy `--negative-prompt` 等价（都会双向写入）|
| `--seedream-model-version <name>` | seedreamModelVersion | string | Endpoint 解析优先级 2；别名 `--seedream-endpoint`；蓝图同款下拉。默认 `doubao-seedream-4-5-251128` |
| `--seedream-endpoint <ep-xxx>` | seedreamEndpoint + seedreamModelVersion | string | Endpoint 解析优先级 1；必须是真实 Ark Endpoint ID（`ep-2024xxxx` 或模型版本 ID `doubao-seedream-5-0-260128`）|
| **📜 Legacy 兼容参数（仍可用，但会在服务端规范化为 seedream-*）** | | | |
| `--width / -w <num>` | width | number | 任意像素；精确命中表 / 最简比 / 面积差 → 反查最近似档位+比例 |
| `--height / -h <num>` | height | number | 同上；只有一边时，缺边按 1:1 近似再匹配 |
| `--aspect-ratio / -a <s>` | aspectRatio | 推荐 8 种，兼容旧 5 种 | 没传宽高时默认 2K × 此比例 |
| `--reference / -r <path>` | references[] | path，可重复多次 | 参考图绝对路径（图生图）|
| `--negative-prompt <text>` | negativePrompt + seedreamNegativePrompt | string | 负向提示词（双向写入）|
| `--model / -m <name>` | model | string | 只有 `ep-/doubao-/seedream-/jimeng-/seedance-/bytedance-/volc-` 前缀才生效；否则静默回退默认并打 WARN。**推荐不传。** |
| `--image-count / -n <1-16>` | imageCount | number（1-16）| 生成数量；seedreamQuantity 会独立按 1/2/4 clamp，两边独立写入互不覆盖 |
| `--seed / -s <num>` | seed + seedreamSeed | number ≥0 或 -1 | 随机种子（双向写入）|
| **⚙️ 任务控制通用参数** | | | |
| `--output-path / -o <path>` | outputPath | path | 输出目录或文件路径；未传时按 §4.4 默认落盘 |
| `--project-id <num>` | projectId | number | 蓝图项目 ID（默认当前打开项目）|
| `--no-auto-export` | autoExport=false | flag | 生成后不复制到 outputPath（只在内部临时目录落盘，exportedFiles 为空，调用方须自行读取 outputFiles[]）|
| `--no-wait` | wait=false | flag | 提交即返回 JSON `{taskId, status:"running"}`，后续用 `task query <id>` 轮询 |
| `--wait` | wait=true | flag | **默认**；阻塞等待到完成或超时才退出 |
| `--stream` | stream | flag | 保留（SSE 流式进度）|
| `--timeout <seconds>` | — | number | **等待**超时秒数（默认 180s）；提交阶段默认 30s |
| `--json` | — | flag | 全局通用；输出 JSON（脚本集成时必加）|

> 📝 **两种 CLI 的差异提示**：
> - ✅ Windows 端 `dvs-cli.cmd / .ps1`：上表所有 flag 完整可用（包含 9 个 seedream-* 原生参数）。
> - ⚠️ Node 端 `cli/bin/dvscli.mjs`：目前（v0.2.4+）只实现了 legacy 参数（width/height/aspectRatio 等）；但提交到后端后 normalizeSeedreamPayloadForSubmission() 会自动规范化为 seedream-* 原生字段，所以最终行为一致。给其他 Agent 写示例时，若目标是 Windows 安装版，用 seedream-* 原生参数最直观；若目标是源码 + Node 启动，可以先用 legacy，最终效果相同。

### 4.6 命令行示例（其他 Agent 直接抄这个）

```bash
# ========== 🎯 推荐：Seedream 原生参数（和蓝图面板一一对应，最快上手）==========

# 例1：最简（Seedream 4.5 默认模型 + 2K 横屏 16:9）
#      → 自动落盘到 <项目根>/generated_media/<项目名>/images/
#      → 蓝图里自动创建 image 预览节点；Agent 对话框自动注入图片预览块
dvs-cli generate-image --seedream-size 2K --seedream-aspect-ratio 16:9 `
  --prompt "一只可爱的布偶猫戴着太空头盔漂浮在星空中，精细渲染，赛博朋克风格，8K高清"

# 例2：头像（1K 够用，省配额；1:1 方形）+ 固定 seed 可复现
dvs-cli generate-image --seedream-size 1K --seedream-aspect-ratio 1:1 `
  --seedream-seed 42 --prompt "头像插画，一位短发女生侧脸，极简配色，高级感"

# 例3：短视频封面（竖屏 9:16 + 2K 档 + PNG 无损 + 批量 4 张 + Seedream 5.0 Endpoint）
dvs-cli generate-image --seedream-size 2K --seedream-aspect-ratio 9:16 `
  --seedream-quantity 4 --seedream-output-format png `
  --seedream-endpoint doubao-seedream-5-0-260128 `
  --prompt "赛博朋克城市天际线，雨天，霓虹灯光，竖屏短视频封面" `
  --seedream-negative-prompt "模糊, 低质量, 变形脸, 文字扭曲" `
  --output-path "G:/output/cover_batch" --json

# ========== 📜 Legacy 兼容写法（仍可用，服务端自动规范化）==========

# 例4：width/height（1920x1080 命中最简比 16:9，面积最近似 2K 档 → 规范化为 2K 16:9 = 2848x1600）
dvs-cli generate-image --width 1920 --height 1080 --prompt "..."

# 例5：只传比例（没传宽高时默认 2K × 3:4 = 1728x2304）
dvs-cli generate-image --aspect-ratio 3:4 -p "海报，竖版电影感人物"

# 例6：只传一边（缺边按 1:1 近似；width=2000 近似 2000x2000 面积 → 命中 2K 1:1 = 2048x2048）
dvs-cli generate-image --width 2000 -p "..."

# ========== ⏰ 异步 + 轮询 + JSON 输出（流水线集成用）==========

# 例7：先提交不等待（立即返回 taskId），然后每 2s query 直到完成
dvs-cli generate-image -p "一只小猫" --seedream-size 1K --seedream-aspect-ratio 1:1 --no-wait --json
# => { "ok":true, "taskId":"cli_01JXYZ...", "status":"running", ... }

# （2s 后）
dvs-cli get-task --task-id cli_01JXYZ... --json
# 成功时：task.status === "completed" && exportedFiles.length > 0（最终落盘路径，优先用这个）
#         outputFiles[] 是临时目录，可能被清理，不要直接用

# 或者 wait-task 阻塞到完成为止（内部自带 2s 轮询 + 超时）
dvs-cli wait-task --task-id cli_01JXYZ... --timeout 240 --json
```

---

## 5. HTTP REST API（不用 CLI 时直接用）
所有端点都需要请求头 `x-dvs-cli-token: <token>`。

### 5.1 公共端点（无需 Token）
| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| GET | `/health` | 健康检查，返回 `{running, server, app, agent, mcp}` |

### 5.2 业务端点（需 Token，返回 401 即鉴权失败）
| 方法 | 路径 | 说明 | Body |
| ---- | ---- | ---- | ---- |
| POST | `/v1/generate-image` | 提交生图任务（三段流水线）| 见 §4.1 参数 JSON |
| GET  | `/v1/status` | 等价 `dvscli status` + 当前项目信息（`currentProject.id/.name/.rootDir`）| — |
| GET  | `/v1/task/:taskId` | 任务状态（`status: running|completed|failed` + `outputFiles[]` + `exportedFiles[]`）| — |
| POST | `/v1/task/:taskId/cancel` | 取消任务 | — |
| GET  | `/v1/tools/list` | MCP 风格 JSON Schema 工具定义 | — |
| POST | `/v1/tools/call` | 直接调用 MCP 工具（后端 in-process handler）| `{name, args, timeoutMs?}` |
| POST | `/v1/agent/submit` | 提交到 Agent 对话框（P2，需蓝图已打开）| `{taskId, prompt, references, model, ...}` |

### 5.3 调用示例（cURL / Invoke-RestMethod 兼容）
```powershell
# PowerShell
$body = @{ prompt = '一只布偶猫'; aspectRatio = '1:1'; seed = 42 } | ConvertTo-Json
$hdrs = @{ 'x-dvs-cli-token' = 'dvs_cli_xxxx' }
Invoke-RestMethod -Uri "http://127.0.0.1:52306/v1/generate-image" -Method Post `
  -Headers $hdrs -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 5
```

---

## 6. 给外部 Agent 的快速集成清单（7 步）
1. 运行 `dvscli status --json`，看 `running=true`。
2. 如果 `running=false`：提示用户"先启动 DVStudio 客户端并打开 AI 工作流蓝图项目"，**不要重试硬连**。
3. 取 `mcp.builtinToolsCount ≥ 13` 证明工具正常注册。
4. 图片生成用 `dvscli generate-image`（优先）或 POST `/v1/generate-image`，**不要**直接手写调用 MCP 的 create_node + execute_node（会直接落到 P1 慢路径）。
5. 不传 `model` 参数（让默认 Seedream 生效）；用户显式要求别的模型时再传。
6. 判断成功：`task.status === 'completed' && exportedFiles.length > 0`。如果 `status === 'running'`（直连失败降级到 Agent Runtime 了），循环 `task query <id>` 直到结束，间隔 2s。
7. 获取输出：**优先用 `exportedFiles[]`**（这是复制到用户 outputPath 的最终路径），不要直接拿 `outputFiles[]`（这是临时目录，会被清理）。

---

## 7. 开发边界与禁止事项（⚠️ 重要）

| 做 ✅ | 不做 ❌ |
| --- | --- |
| 参数体系唯一契约 = Seedream 蓝图原生 8 字段：`seedreamSize / seedreamAspectRatio / seedreamQuantity / seedreamWatermark / seedreamOutputFormat / seedreamSeed / seedreamNegativePrompt / seedreamModelVersion` | 在不同层（CLI / service / builtinTools）各自写一套 "width/height → 档位+比例" 的匹配函数，造成参数漂移 |
| `normalizeSeedreamPayloadForSubmission()` 是唯一服务端规范化入口；HTTP/CLI/MCP 任何入口都先调它，再进入后续逻辑 | 新增参数只在 HTTP JSON 里加，不同步 CLI flag 和 Tool Schema，导致三端参数声明不一致 |
| P3/P2/P1 分层失败降级；每层独立 try/catch | 把所有逻辑揉成一个函数，出错后直接抛异常中断 |
| generate_image 默认模型永远是 Seedream 4.5（`doubao-seedream-4-5-251128`）；非兼容 ID 用 normalizeSeedreamModel 回退并打 WARN 日志 | 在任何地方写入 `model = 'gemini'` 作为默认值，包括 CLI 参数、Tool Schema、Prompt 构造、Handler 入参 |
| Endpoint 解析严格按 4 级优先级：`seedreamEndpoint > seedreamModelVersion > model(真实前缀) > doubao-seedream-4-5-251128` | 用户传了 gemini 就真的去请求 gemini 接口（应该静默回退到 Seedream 默认 + 打 WARN，不中断用户流程）|
| 落盘先存 `%TEMP%/dvs-genimg/*.png`，成功后再复制到 outputPath / project media 目录 | 直接写入项目正式目录再失败，留下半成品 |
| outputPath 默认落在 `<项目根>/generated_media/<项目名>/images/` | 默认把媒体写到 `DVSResource/BackendData/` 或临时路径，用户找不到 |
| 生成后用 create_node 创建 **`type: 'image'`（纯预览节点）** 指向已导出图片，**exportedFiles 优先、outputFiles 兜底** | 创建 `image-generation` 节点后反复 re-run，消耗 API 配额；export 失败时直接不建任何节点，用户不知道任务是否完成 |
| Agent 对话框 assistant message 里带 `{type:'image_url', url:'file:///...'}` 块供预览，**exportedFiles 优先、outputFiles 兜底** | 只给文本路径让用户自己打开文件夹；export 失败时对话里没有任何图片预览 |
| 预览节点创建 + 对话块入队，仅在 Task 完成成功后入队 **一次** | 每级降级都尝试建节点，结果蓝图里同一组图片出现 3 次 |
| 新增参数必须同时在 CLI（dvs-cli.ps1 + generate-image.mjs）、HTTP（§4.2 JSON Schema）、Tool Schema（§6 MCP 风格）三处落地，类型对齐 | 在某一处加字段导致 JSON 输出与 Schema 声明不一致 |
| 新增接口加鉴权 Token 校验（除 `/health`）| 公开端点写文件 / 启动服务 |
| `--seedream-seed` 和 legacy `--seed` 双向写入，保持用户旧脚本可用 | 只实现 seedreamSeed 不动 seed，导致旧脚本 `--seed 123` 失效 |
| 数量限制：`seedreamQuantity` 严格 1/2/4（超额 clamp）；`imageCount` 仅 legacy 兼容展示 | 传 `imageCount=16` 就真向 Ark 发 16 张，触发 Seedream 的 API rate limit |
| dvs-cli.ps1 generate-image if 块修改后，必须按固定流程重编码 Base64（见 §11 PS5 兼容坑） | 直接用 PowerShell 编辑器修改 generate-image 内部代码，保存后跑触发 PS5 "Unexpected token '}'" |

---

## 8. 关键文件索引

| 文件 | 职责 |
| --- | --- |
| **📘 文档入口** | |
| [AGENT_GUIDE.md](../../AGENT_GUIDE.md) L28-L85 | 项目根级 Seedream CLI 速查（核心铁律 + 7 层数据流 + 像素映射表 + 4 条快捷键）|
| [agent_docs/15_CLI_CONTROL_GUIDE.md](../../agent_docs/15_CLI_CONTROL_GUIDE.md) §4 | 本文件：完整开发边界、参数 JSON、CLI flag、像素真值表、示例 |
| **⌨️ 调用入口层** | |
| [build/bin/dvs-cli.ps1](../../build/bin/dvs-cli.ps1) | Windows 最终用户 CLI（安装后 PATH 可用）；手动 arg parser；支持所有 9 个 seedream-* 原生 flag + legacy；generate-image 内部代码 UTF-16LE Base64 包装 |
| [build/bin/dvs-cli.cmd](../../build/bin/dvs-cli.cmd) | dvs-cli.ps1 的 launcher（cmd，避免 ExecutionPolicy 问题）|
| [cli/bin/dvscli.mjs](../../cli/bin/dvscli.mjs) | Node 开发者入口（ESM shebang）；目前仅 legacy width/height/aspectRatio（但服务端会 normalize）|
| [cli/src/runner.mjs](../../cli/src/runner.mjs) | Node CLI 子命令分发 + runtimeCtx 构建 |
| [cli/src/commands/generate-image.mjs](../../cli/src/commands/generate-image.mjs) | Node CLI 生图命令（参数解析 + POST /v1/generate-image）|
| [cli/src/commands/help.mjs](../../cli/src/commands/help.mjs) | help / tools list 输出（**Schema 随业务变化请同步更新这里 + 本文件 §4.5**）|
| **🔍 发现 + 鉴权层** | |
| [cli/src/core/discovery.mjs](../../cli/src/core/discovery.mjs) | Node CLI 5 层端口/Token 自动发现 |
| [dvs-cli.ps1 Get-CandidatePaths()](../../build/bin/dvs-cli.ps1#L127-L148) | PS1 CLI 5 层端口/Token 自动发现 |
| [cli-control-server/auth.mjs](../../electron/backend/modules/cli-control-server/auth.mjs) | Token 校验（除 `/health` 外全部强制）|
| **🖥️ HTTP 服务器层** | |
| [cli-control-server/httpServer.mjs](../../electron/backend/modules/cli-control-server/httpServer.mjs) | HTTP 服务器（启动绑定、端口文件写入、Token 校验、路由分发）|
| [cli-control-server/routes.mjs](../../electron/backend/modules/cli-control-server/routes.mjs) | 路由：/health、/v1/generate-image、/v1/tasks/*、/tools、/v1/tools/call、/v1/agent/submit |
| [cli-control-server/handlers.mjs](../../electron/backend/modules/cli-control-server/handlers.mjs) | 路由 handler 薄封装 → 调 service |
| **⭐ 服务端规范化 + 流水线调度（核心一致性层）** | |
| [cli-control-server/service.mjs](../../electron/backend/modules/cli-control-server/service.mjs) | 依赖注入 + `normalizeSeedreamPayloadForSubmission()`（服务端 Seedream 参数唯一规范化入口，宽高→档位+比例）+ `resolveSeedreamEndpointFromPayload()`（Endpoint 4 级优先级）+ `tryDirectGenerateImage()`（P3 主路径）+ `enqueueCreateImageNodeRequests() / enqueueChatImagePreviewBlocks()`（exportedFiles 优先、outputFiles 兜底）|
| [cli-control-server/taskStore.mjs](../../electron/backend/modules/cli-control-server/taskStore.mjs) | 任务状态存储（内存 + completedAt + exportedFiles + outputFiles）|
| **🛠️ MCP 内置工具 + 实际 API 调用** | |
| [mcp/builtinTools.mjs](../../electron/backend/modules/mcp/builtinTools.mjs) | `generateImageHandler` + `generateImageViaSeedream`（优先读 seedreamSize/seedreamAspectRatio 构造请求）+ `generateImageViaNodePipeline`（蓝图节点降级，把 seedream 原生字段写入 nodeConfig）；`normalizeSeedreamModel` 在此定义 |
| [third-party/service.mjs](../../electron/backend/modules/third-party/service.mjs) | 字节方舟 Seedream 实现：`resolveSeedreamSize(sizePreset, aspectRatio)`（档位+比例→WxH 像素，像素映射表唯一真值出处）；`seedreamGenerateStream async function*`；`seedreamRefCache` |
| **💬 前端 P2 Agent Runtime 接入** | |
| [useCLIAgentTrigger.ts](../../src/views/AIWorkflow/node-business/chat/useCLIAgentTrigger.ts) | P2：前端轮询 taskStore → dispatch 到 Agent 对话框；`isSeedreamLikeModel` 在此定义；蓝图 image 预览节点与 Assistant Message 预览块的消费入口 |
| [useAIWorkflowNodeGeneration.ts](../../src/views/AIWorkflow/node-business/chat/useAIWorkflowNodeGeneration.ts) L1936-L1965 | 蓝图参数面板 seedreamSize / seedreamAspectRatio / seedreamQuantity 等字段 → form.set() 提交，和 CLI seedream-* 原生字段 1:1 对应 |

---

## 9. 快速诊断脚本

```bash
# 9.1 客户端是否在监听
node cli/bin/dvscli.mjs status --json | jq '.running, .server.port, .agent.ready, .mcp.builtinToolsCount'
# 或 Windows 版：dvs-cli status --json

# 9.2 是否配了 Seedream API Key（查看后端日志 warn）
#    如果没有 seedreamGenerateStream 会在没有 Key 时走 mockImageStream（Dev Mock）
Get-Content -Tail 30 -Path "%AppData%\DVStudio\*.log" 2>$null | Select-String "seedream api key"

# 9.3 单张跑通闭环（验证 Ark API Key + 落盘 + 默认输出目录正确 + Seedream 原生参数链路）
dvs-cli generate-image -p "一只可爱的猫咪头像" --seedream-size 1K --seedream-aspect-ratio 1:1 --seedream-seed 1 --json

# 9.4 查看工具 Schema 是否与文档一致（可用于 diff）
dvs-cli tools list --json > tools.schema.json

# 9.5 非标准宽高 → 规范化结果 离线校验（服务端/CLI 同样的匹配函数）
node tests/test-seedream-service-normalize.mjs   # 25 case；输出每个输入规范化后的 seedreamSize+seedreamAspectRatio
powershell -File tests/test-seedream-params.ps1   # 14 case；PS1 端同样的 SIZE_MAP + 三阶段匹配
```

---

## 10. Changelog / 版本兼容

- **v0.2.5**（2026-08-20 简化参数链路 + PS5 兼容）：
  - 🎯 **推荐参数契约改为 Seedream 蓝图原生 8 字段**：`seedreamSize(1K/2K/3K/4K) + seedreamAspectRatio(8 ratios) + seedreamQuantity + seedreamWatermark + seedreamOutputFormat + seedreamSeed + seedreamNegativePrompt + seedreamModelVersion`，不再对 width/height 反复重算。
  - Endpoint 解析统一 4 级优先级：seedreamEndpoint > seedreamModelVersion > model(真实 ep-/doubao-) > 默认 doubao-seedream-4-5-251128。
  - `_matchSeedreamPresetAndRatio()` 三阶段匹配：精确命中表 → 最简比 + 面积差 → 全局 32 预设面积差兜底；单边已知按 1:1 近似。
  - 像素映射表扩展到 4 档 × 8 比例 = 32 个官方预设（新增 3:2 / 2:3 / 21:9），文档附完整真值表。
  - 预览节点 + Agent 对话块入队策略：exportedFiles 优先、outputFiles 兜底，防止 export 失败用户看不到结果。
  - dvs-cli.ps1 的 `generate-image` if 块内部代码以 UTF-16LE Base64 形式存进脚本，运行时解码执行，**彻底规避 PS5 解析器对嵌套 `}` / Add-Member / 复杂字面量关闭时的回溯 bug**（"Unexpected token '}'" 问题最终方案）。
  - 新增 dvs-cli.ps1 参数：`--seedream-size / --seedream-aspect-ratio / --seedream-quantity / --seedream-watermark / --seedream-output-format / --seedream-seed / --seedream-negative-prompt / --seedream-model-version / --seedream-endpoint` 共 9 个 Seedream 原生 flag；legacy width/height/aspectRatio 仍保留且服务端规范化行为一致。
- **v0.2.4**：初版 CLI Control Server，支持 status / generate-image / task / tools / help；三段流水线、自动 Seedream 默认模型、默认输出目录 generated_media、自动创建 image 预览节点、Assistant 对话图片预览。
- 后续新增命令（video generation / model3d / comfyui run）：请先扩展 `cli/src/commands/*` + `httpServer.mjs` 路由 + 本文件第 3、4 章节，**不要**在没有 CLI 命令层暴露的情况下直接要求外部 Agent 打 HTTP。

---

## 11. 附录：修改 dvs-cli.ps1 generate-image 内部代码的正确流程

> ⚠️ 由于 PS5 的解析器回溯 bug，**直接编辑 generate-image if 块的脚本代码几乎一定会触发语法错误**。请严格按以下流程修改。

1. **先从脚本中解码出内部可编辑的 PS1 源文件**：
   ```powershell
   # 从 dvs-cli.ps1 提取 Base64 并解码为可编辑文件 tests/_genImg-inner.ps1
   $content = Get-Content -Encoding UTF8 build\bin\dvs-cli.ps1 -Raw
   $idx = $content.IndexOf("`$__genImgB64 = @'")
   $idx += "`$__genImgB64 = @'".Length
   while ($content[$idx] -in "`r","`n") { $idx++ }
   $variants = @("`r`n'@`r`n  `$__genImgCmd = ","`n'@`n  `$__genImgCmd = ","`r`n'@`n  `$__genImgCmd = ","`n'@`r`n  `$__genImgCmd = ")
   $endIdx = -1
   foreach ($v in $variants) { $f = $content.IndexOf($v, $idx); if ($f -ge 0) { $endIdx = $f; break } }
   $b64 = $content.Substring($idx, $endIdx - $idx).Trim()
   $bytes = [System.Convert]::FromBase64String($b64)
   $inner = [System.Text.Encoding]::Unicode.GetString($bytes)
   Set-Content -Encoding UTF8 tests\_genImg-inner.ps1 -Value $inner
   ```
2. **只编辑 `tests/_genImg-inner.ps1`**（这是可修改的明码源）。不要用单行 `[ordered]@{ k1=v1;k2=v2 }`；逐行赋值 + `New-Object PSObject + Add-Member`；不要用 `[PSCustomObject]@{ code = $(if ... { } else { }) }` 等内嵌表达式哈希字面量。
3. **重新编码 + 写回脚本**：
   ```powershell
   $inner = Get-Content -Encoding UTF8 tests\_genImg-inner.ps1 -Raw
   $b64 = [System.Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($inner))
   # 按 §1 文档的 head/tail 边界模式注入回 dvs-cli.ps1（见 reinject 逻辑）
   # 最后用 PS5 ParseFile 验证：
   $tokens = $null; $errs = $null
   [void][System.Management.Automation.Language.Parser]::ParseFile('build\bin\dvs-cli.ps1', [ref]$tokens, [ref]$errs)
   $errs.Count  # 必须 = 0
   ```
4. **端到端跑两条非语法错误路径**：
   - `dvs-cli generate-image`（缺 prompt）→ 必须 Exit 400 + JSON `{ok:false, error:"MISSING_PROMPT"}`，不是语法错误。
   - `dvs-cli generate-image --seedream-size 2K --seedream-aspect-ratio 16:9 -p "..."`（DVStudio 未运行）→ 必须 Exit 非 0 但 JSON 是 `error.code:"SUBMIT_FAILED", error.message:"HTTP_ERROR"` 或正常连接错误，不是语法错误；同时 payload 里能看到 seedreamSize/seedreamAspectRatio 等 8 个原生字段。
5. **同步更新三处文档**：本文件 §4.5 CLI 参数表 + §4.2 JSON 规范 + `AGENT_GUIDE.md` 根级速查。
6. **跑离线测试**：`test-seedream-params.ps1` (14)、`test-seedream-service-normalize.mjs` (25)、`test-preview-queue-fallback.mjs` (3) 全部 PASS 后才允许合入。
