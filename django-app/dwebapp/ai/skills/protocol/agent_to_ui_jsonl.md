
# Skill: protocol.agent_to_ui_jsonl

## Purpose
定义 AgentToUI 的 JSONL 流式输出协议：每一行都是一个完整的 AgentToUI envelope JSON 对象。

## When to Use
- SSE 流式交互，前端按 `event: msg` 接收并逐条解析 envelope

## When NOT to Use
- 需要单个 JSON object（例如 `{"envelopes": [...]}`）输出时

## Input
- `default_intent`（string）
- `viewport`（object|null，可选）

## Output
JSONL（每行一个 envelope）。示例（单行 JSON 对象）：

```json
{
  "schemaVersion": 1,
  "type": "agentToUi/text",
  "id": "<uuid>",
  "createdAt": "2026-01-04T00:00:00Z",
  "source": { "agentName": "deepseek" },
  "payload": { "text": "正在生成…" }
}
```

## Prompt

你必须只输出 JSONL（每行一个 JSON 对象），禁止输出任何非 JSON 内容。
重要：你输出的每一个字符都必须属于某一行 JSON 对象；不得输出中文说明/前缀/后缀/空行。
如果你想“说一句话”，也必须用 agentToUi/chatMessage 的 payload.content 来说，仍然要用 JSONL 输出。
禁止输出 Markdown/代码块（例如 ```json ... ```）。
不要输出多行美化 JSON；每个 envelope 必须独立占一行。
每一行必须是完整的 AgentToUI envelope：必须包含 schemaVersion=1,type,id,createdAt,payload。
不要把 JSON 再包进字符串里（禁止输出带转义的 JSON 字符串）。必须输出原生 JSON 对象行。
每行行尾必须换行（\n）。允许多行（多个 envelope），但不允许空行。

文本字段禁止夹带 JSON（强制规则）：
- 对于任何“用户可见文本”字段（包括但不限于 agentToUi/chatMessage.payload.content、agentToUi/text.payload.text、任何 error/message 字段）：
  - 禁止出现 '{' '}' '[' ']' 或类似 JSON 的片段。
  - 禁止出现 schemaVersion/type/id/createdAt/payload 等字段名。
  - 禁止粘贴或转述任何模板/节点 JSON。
- 如果你需要引用节点，请只写 nodeId（例如 tmpl_xxx:root）或 localId（例如 root/title），不要输出对象。

当你要输出可插入舞台的图形产物时：
1) 必须先输出一条对话描述：type=agentToUi/chatMessage，payload.content 用中文说明你将插入什么、插入到哪里（简短即可）。
2) 然后输出一条图形产物：type=agentToUi/componentTemplate，payload.intent="{{default_intent}}"，并提供 payload.template。
   - 可选：如果要把新模块挂到舞台已存在的父节点下，可在 payload 里提供 parentId（舞台 nodeId）与可选 layerId。
3) payload.template 推荐是 ComponentTemplate；但也允许你直接提供“单节点/节点树”的简写对象（前端会自动包成模板后插入）。
4) 不要在 chatMessage 里粘贴模板 JSON（也不要输出任何带花括号的片段）。

插入方式（两种都允许，推荐按复杂度选择）：
A) agentToUi/componentTemplate：用于插入一个“模块/组件”，支持模板内部 parentLocalId 组装树；也支持 payload.parentId/layerId 增量挂载到舞台已有父节点。
B) agentToUi/insertNode：用于快速追加一个节点或一小棵节点树（单步落地），不要求 ComponentTemplate 结构；也支持 payload.parentId/layerId 增量挂载。
建议：大模块用 componentTemplate，小修补/单节点追加用 insertNode。
C) agentToUi/patchNode：用于按 nodeId 精确修改已存在节点（patch 语义：只改提供的字段），用于自检修正时必须优先使用。
D) agentToUi/deleteNode：用于按 nodeId 精确删除已存在节点（避免自检时通过新增覆盖导致错乱）。

节点精确修改/删除（用于自检修正；强制优先）：
- 当你在自检阶段发现问题（尺寸、位置、样式、文案等），你必须优先使用以下消息按 id 修正，而不是新建节点：
  - agentToUi/patchNode：payload.nodeId 指向已存在舞台节点；payload.patch 支持 name/userType/transform/props 的局部 patch（只改提供字段）。
  - agentToUi/deleteNode：payload.nodeId 或 payload.nodeIds 指向要删除的已存在舞台节点。
- 严禁在自检修正时通过“重新输出一个新节点树”来覆盖/替代旧节点，这会导致 id 与层级错乱。
- 重要提醒：子节点默认是相对父节点的坐标系；如果你 patch 父节点的 width/height（容器尺寸），视觉布局会变化。
  因此：你最好在首次生成时就给出正确的父容器宽高；若必须修改父容器尺寸，则要同步 patch 子节点的 transform.x/y 以保持布局不变。

你只能使用编辑器已支持的节点类型与字段命名（大小写必须一致）：
- ComponentTemplate: schemaVersion=1, templateId, name, params, nodes, rootLocalId。
- TemplateNode: localId(字符串)、type、parentLocalId(可选)、transform(可选)、props(必须)。
- transform: x,y,width,height,rotation,opacity（数值；如果用户未指定可省略部分字段）。
- type 支持：rect, text, image, line（禁止使用 group）。
  - 结构/容器请一律用 rect 来表达（rect 既可作为根节点也可作为父节点容器）。
  - 若你需要“不可见容器”，请使用 rect，并将 fillOpacity=0 且 borderOpacity=0（仍需给 width/height）。
  - rect.props：fillColor, fillOpacity, borderColor, borderOpacity, borderWidth, cornerRadius。
  - text.props：textContent, fontSize, fontColor, fontStyle, textAlign(left|center|right)。
  - image.props：imageId, imagePath, imageName, imageFit（建议：contain/cover/fill/none/scale-down）。
  - line.props：startX, startY, endX, endY, anchorX, anchorY, lineColor, lineWidth, lineStyle（solid/dashed）。
关键校验规则：每个节点都必须包含 props 字段，且 props 必须是对象（即使为空也要 props:{}）。
注意：不要使用不存在的字段名，否则模板会校验失败。

根节点与样式（强制规则，避免生成“空父节点+一个子节点就结束”）：
- 任何插入舞台的 componentTemplate，都必须包含一个“可作为容器”的根节点（强制使用 rect）。
- rootLocalId 必须指向一个 rect（背景/卡片/画布容器）。
  - root(rect) 必须显式给出 props：fillColor/fillOpacity/borderColor/borderOpacity/borderWidth/cornerRadius。
  - root(rect) 必须显式给出 transform.width/height（作为容器尺寸），并放到 viewport.centerWorld（或用户指定位置）。
- 你可以让其他节点的 parentLocalId 指向 root(rect)，用父子坐标系排版。
- 禁止输出“虚拟父节点”来仅作结构标识；所有父节点都必须是 rect 且具备明确 width/height。
- 除 text/image/line 等自身可视节点外：任何 rect 都必须有明确样式；不要依赖 CSS/HTML，这里只靠 props+transform 形成视觉。

父子关系（parentLocalId）硬规则（非常重要，避免前端报 parentLocalId not found）：
- parentLocalId 只能引用同一个 ComponentTemplate 内已声明的 TemplateNode.localId。
- 禁止在 parentLocalId 里写舞台 nodeId（例如 login_card:root、tmpl_xxx:root 这种带冒号的实例化 id）。
- rootLocalId 指向的根节点必须没有 parentLocalId 字段。
- 重要：parentLocalId 只用于模板内部组装树结构；如果你要把“新模块”挂到舞台中已存在的父节点，请使用 componentTemplate 的 payload.parentId。

增量挂载（允许分模块分步追加）：
- 你可以分多次输出 agentToUi/componentTemplate 来逐步完善界面（每次落地一个模块）。
- 当你需要把新模块挂到舞台上已存在的父节点下：
  - 在 agentToUi/componentTemplate 的 payload 中提供 parentId（舞台 nodeId，不是 parentLocalId）。
  - 可选提供 layerId（目标图层 id），不提供则默认当前 activeLayer。

模块化分步落地（强制完成所有模块）：
- 当你在 chatMessage 里列出模块（例如 4~6 个区域），你必须逐个模块输出对应的 componentTemplate/applyFilter，直到全部完成。
- 不允许只落地第一个模块就进入“完成”或只输出 taskStatus。
- 若你必须缩减：也必须一次性输出“完整但更简单”的版本（至少包含：背景容器 + 主标题 + 2 个内容区域）。

文本节点（text）的关键规则：
- textContent 支持换行：使用 \n（反斜杠+n）表示多行。
- 编辑器会根据 textContent/fontSize/fontStyle/textAlign 自动计算文本节点的宽高；因此可省略 transform.width/height（推荐）。
- textAlign 只允许 left/center/right 三个值。

自检回合（强制工作流）：
- 对于任何需要生成/修改舞台节点的任务，你必须按“拆分 → 逐步落地 → 自检”执行。
- 自检必须检查：parentLocalId 合法性、props 完整性、父容器 width/height 包裹子内容（含 padding）。
- 自检结论必须在 chatMessage 中给出至少 2~3 个父容器的 minWidth/minHeight 数字结论；禁止粘贴任何 JSON。

布局与坐标：
- 通过 transform 数值排版；子节点坐标系原点在父节点中心。

容器尺寸硬规则（避免父节点小于子节点）：
- 只要一个节点“有子节点”，该节点就必须显式给出 transform.width/height，并能完全包裹子内容（建议留 8~24 padding）。

当用户要求修改已选中节点（例如：添加发光/模糊滤镜）时，不要输出 componentTemplate。改为输出编辑器动作：
1) 先输出 chatMessage 简短说明你将做什么。
2) 再输出 type=agentToUi/applyFilter，payload.target="selection"，payload.mode="append"，payload.filter 为滤镜对象。

发光滤镜可视强度规则（针对 line 线条；强制建议）：
- 如果给线条添加 glow 且 blurX=5、blurY=5：intensity 建议 >=1.5。
- 当用户未明确要求 intensity 时：对线条的 glow 默认使用 intensity=4（blurX/blurY 默认 5）。

如果提供 viewport(JSON)，它只用于辅助定位/默认放置 root（中心为 viewport.centerWorld）。

## Viewport

舞台坐标系说明：
- world 坐标单位为像素（zoom=1 时）。
- world 原点 (0,0) 在舞台中心；x 向右为正，y 向下为正。
- 屏幕坐标与 world 的关系：screen = world * zoom + pan（pan 为屏幕像素）。
- 如果用户未指定具体坐标，请默认把 root 节点放在舞台中央（即当前视口中心 viewport.centerWorld）。
