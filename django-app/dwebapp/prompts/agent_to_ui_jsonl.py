from __future__ import annotations

import json
from typing import Any, Dict, List, Optional


def build_agent_to_ui_jsonl_system_parts(
    *,
    default_intent: str,
    viewport: Optional[Dict[str, Any]] = None,
) -> List[str]:
    """System prompt parts for AgentToUI JSONL mode.

    Goals:
    - Maximum format stability (strict JSONL, no extra text)
    - Prevent JSON leakage into chat bubbles
    - Ensure templates pass validation (props must be object)
    """

    parts: List[str] = []

    # Hard formatting constraints
    parts.append("你必须只输出 JSONL（每行一个 JSON 对象），禁止输出任何非 JSON 内容。")
    parts.append("重要：你输出的每一个字符都必须属于某一行 JSON 对象；不得输出中文说明/前缀/后缀/空行。")
    parts.append("如果你想‘说一句话’，也必须用 agentToUi/chatMessage 的 payload.content 来说，仍然要用 JSONL 输出。")
    parts.append("禁止输出 Markdown/代码块（例如 ```json ... ```）。")
    parts.append("不要输出多行美化 JSON；每个 envelope 必须独立占一行。")
    parts.append("每一行必须是完整的 AgentToUI envelope：必须包含 schemaVersion=1,type,id,createdAt,payload。")
    parts.append("不要把 JSON 再包进字符串里（禁止输出带转义的 JSON 字符串）。必须输出原生 JSON 对象行。")
    parts.append("每行行尾必须换行（\\n）。允许多行（多个 envelope），但不允许空行。")

    parts.append(
        "文本字段禁止夹带 JSON（强制规则）：\n"
        "- 对于任何‘用户可见文本’字段（包括但不限于 agentToUi/chatMessage.payload.content、agentToUi/text.payload.text、任何 error/message 字段）：\n"
        "  - 禁止出现 '{' '}' '[' ']' 或类似 JSON 的片段。\n"
        "  - 禁止出现 schemaVersion/type/id/createdAt/payload 等字段名。\n"
        "  - 禁止粘贴或转述任何模板/节点 JSON。\n"
        "- 如果你需要引用节点，请只写 nodeId（例如 tmpl_xxx:root）或 localId（例如 root/title），不要输出对象。"
    )

    # Message ordering conventions
    parts.append(
        "当你要输出可插入舞台的图形产物时：\n"
        "1) 必须先输出一条对话描述：type=agentToUi/chatMessage，payload.content 用中文说明你将插入什么、插入到哪里（简短即可）。\n"
        f"2) 然后输出一条图形产物：type=agentToUi/componentTemplate，payload.intent=\"{default_intent}\"，并提供 payload.template。\n"
        "   - 可选：如果要把新模块挂到舞台已存在的父节点下，可在 payload 里提供 parentId（舞台 nodeId）与可选 layerId。\n"
        "3) payload.template 推荐是 ComponentTemplate；但也允许你直接提供‘单节点/节点树’的简写对象（前端会自动包成模板后插入）。\n"
        "4) 不要在 chatMessage 里粘贴模板 JSON（也不要输出任何带花括号的片段）。"
    )

    parts.append(
        "插入方式（两种都允许，推荐按复杂度选择）：\n"
        "A) agentToUi/componentTemplate：用于插入一个‘模块/组件’，支持模板内部 parentLocalId 组装树；也支持 payload.parentId/layerId 增量挂载到舞台已有父节点。\n"
        "B) agentToUi/insertNode：用于快速追加一个节点或一小棵节点树（单步落地），不要求 ComponentTemplate 结构；也支持 payload.parentId/layerId 增量挂载。\n"
        "建议：大模块用 componentTemplate，小修补/单节点追加用 insertNode。\n"
        "C) agentToUi/patchNode：用于按 nodeId 精确修改已存在节点（patch 语义：只改提供的字段），用于自检修正时必须优先使用。\n"
        "D) agentToUi/deleteNode：用于按 nodeId 精确删除已存在节点（避免自检时通过新增覆盖导致错乱）。"
    )

    parts.append(
        "节点精确修改/删除（用于自检修正；强制优先）：\n"
        "- 当你在自检阶段发现问题（尺寸、位置、样式、文案等），你必须优先使用以下消息按 id 修正，而不是新建节点：\n"
        "  - agentToUi/patchNode：payload.nodeId 指向已存在舞台节点；payload.patch 支持 name/userType/transform/props 的局部 patch（只改提供字段）。\n"
        "  - agentToUi/deleteNode：payload.nodeId 或 payload.nodeIds 指向要删除的已存在舞台节点。\n"
        "- 严禁在自检修正时通过‘重新输出一个新节点树’来覆盖/替代旧节点，这会导致 id 与层级错乱。\n"
        "- 重要提醒：子节点默认是相对父节点的坐标系；如果你 patch 父节点的 width/height（容器尺寸），视觉布局会变化。\n"
        "  因此：你最好在首次生成时就给出正确的父容器宽高；若必须修改父容器尺寸，则要同步 patch 子节点的 transform.x/y 以保持布局不变。"
    )

    # Schema / validation rules aligned with frontend validate.ts
    parts.append(
        "你只能使用编辑器已支持的节点类型与字段命名（大小写必须一致）：\n"
        "- ComponentTemplate: schemaVersion=1, templateId, name, params, nodes, rootLocalId。\n"
        "- TemplateNode: localId(字符串)、type、parentLocalId(可选)、transform(可选)、props(必须)。\n"
        "- transform: x,y,width,height,rotation,opacity（数值；如果用户未指定可省略部分字段）。\n"
        "- type 支持：rect, text, image, line（禁止使用 group）。\n"
        "  - 结构/容器请一律用 rect 来表达（rect 既可作为根节点也可作为父节点容器）。\n"
        "  - 若你需要‘不可见容器’，请使用 rect，并将 fillOpacity=0 且 borderOpacity=0（仍需给 width/height）。\n"
        "  - rect.props：fillColor, fillOpacity, borderColor, borderOpacity, borderWidth, cornerRadius。\n"
        "  - text.props：textContent, fontSize, fontColor, fontStyle, textAlign(left|center|right)。\n"
        "  - image.props：imageId, imagePath, imageName, imageFit（建议：contain/cover/fill/none/scale-down）。\n"
        "  - line.props：startX, startY, endX, endY, anchorX, anchorY, lineColor, lineWidth, lineStyle（solid/dashed）。\n"
        "关键校验规则：每个节点都必须包含 props 字段，且 props 必须是对象（即使为空也要 props:{}）。\n"
        "注意：不要使用不存在的字段名，否则模板会校验失败。"
    )

    parts.append(
        "根节点与样式（强制规则，避免生成‘空父节点+一个子节点就结束’）：\n"
        "- 任何插入舞台的 componentTemplate，都必须包含一个‘可作为容器’的根节点（强制使用 rect）。\n"
        "- rootLocalId 必须指向一个 rect（背景/卡片/画布容器）。\n"
        "  - root(rect) 必须显式给出 props：fillColor/fillOpacity/borderColor/borderOpacity/borderWidth/cornerRadius。\n"
        "  - root(rect) 必须显式给出 transform.width/height（作为容器尺寸），并放到 viewport.centerWorld（或用户指定位置）。\n"
        "- 你可以让其他节点的 parentLocalId 指向 root(rect)，用父子坐标系排版。\n"
        "- 禁止输出‘虚拟父节点’来仅作结构标识；所有父节点都必须是 rect 且具备明确 width/height。\n"
        "- 除 text/image/line 等自身可视节点外：任何 rect 都必须有明确样式；不要依赖 CSS/HTML，这里只靠 props+transform 形成视觉。"
    )

    parts.append(
        "父子关系（parentLocalId）硬规则（非常重要，避免前端报 parentLocalId not found）：\n"
        "- parentLocalId 只能引用同一个 ComponentTemplate 内已声明的 TemplateNode.localId。\n"
        "- 禁止在 parentLocalId 里写舞台 nodeId（例如 login_card:root、tmpl_xxx:root 这种带冒号的实例化 id）。\n"
        "- rootLocalId 指向的根节点必须没有 parentLocalId 字段。\n"
        "- 重要：parentLocalId 只用于模板内部组装树结构；如果你要把‘新模块’挂到舞台中已存在的父节点，请使用 componentTemplate 的 payload.parentId（见下）。"
    )

    parts.append(
        "增量挂载（允许分模块分步追加，替代‘必须整棵树’规则）：\n"
        "- 你可以分多次输出 agentToUi/componentTemplate 来逐步完善界面（每次落地一个模块）。\n"
        "- 当你需要把新模块挂到舞台上已存在的父节点下：\n"
        "  - 在 agentToUi/componentTemplate 的 payload 中提供 parentId（舞台 nodeId，不是 parentLocalId）。\n"
        "  - 可选提供 layerId（目标图层 id），不提供则默认当前 activeLayer。\n"
        "- 如果 parentId 指向的舞台节点不存在，本次插入会回退到默认 root/顶层；因此在使用 parentId 前，应先在 chatMessage 里说明你要挂到哪个节点，并确保该节点已在 contextPack.stage 中存在。"
    )

    parts.append(
        "模块化分步落地（强制完成所有模块）：\n"
        "- 当你在 chatMessage 里列出模块（例如 4~6 个区域），你必须逐个模块输出对应的 componentTemplate/applyFilter，直到全部完成。\n"
        "- 不允许只落地第一个模块就进入‘完成’或只输出 taskStatus。\n"
        "- 若你必须缩减：也必须一次性输出‘完整但更简单’的版本（至少包含：背景容器 + 主标题 + 2 个内容区域）。"
    )

    parts.append(
        "文本节点（text）的关键规则（非常重要）：\n"
        "- textContent 支持换行：使用 \\n（反斜杠+n）表示多行。\n"
        "- 编辑器会根据 textContent/fontSize/fontStyle/textAlign 自动计算文本节点的宽高；因此：\n"
        "  - 你可以省略 transform.width/height（推荐），避免出现裁切。\n"
        "  - 如果你必须写 width/height，也要确保足够容纳文字内容（含多行），否则会被裁切。\n"
        "- textAlign 只允许 left/center/right 三个值；缺省时会被视为 center。"
    )

    parts.append(
        "模块化分步落地 + 自检回合（强制工作流）：\n"
        "- 对于任何需要生成/修改舞台节点的任务，你必须按‘拆分 → 逐步落地 → 自检’执行。\n"
        "- 第一步（拆分模块）：先输出一条 agentToUi/taskStatus，payload.message=\"拆分模块…\"；再输出一条 agentToUi/chatMessage，用中文列出 2~5 个步骤（不要贴 JSON）。\n"
        "- 第二步（逐步落地）：每落地一个模块，都先输出 taskStatus（message=\"落地：<模块名>\"），再输出必要的 componentTemplate/applyFilter。\n"
        "- 第三步（自检）：输出 taskStatus（message=\"自检…\"），你必须重新阅读你本次输出/插入的所有节点（逐个 localId / nodeId 检查），至少包含以下强制检查项：\n"
        "  1) parentLocalId 合法性：每个 parentLocalId 都必须引用同模板内已声明的 localId；rootLocalId 的节点不得有 parentLocalId。\n"
        "  2) props 完整性：每个节点必须有 props:{}（对象），不能缺失/为 null。\n"
        "  3) 容器尺寸硬规则：每一个‘有子节点’的父节点都必须显式给出 transform.width/height，且宽高必须能包裹所有子节点的内容（含 padding），不得出现父节点小于子节点占用范围。\n"
        "     - 例外：line 节点可以不写 transform.width/height（忽略宽高校验）；其占用范围应由 startX/startY/endX/endY + lineWidth 推导。\n"
        "- 自检结论输出（强制格式要求）：\n"
        "  - 你必须在自检 chatMessage 中，列出至少 2~3 个‘有子节点的父容器’（写 localId 或 nodeId 均可），并写出你核算得到的 minWidth/minHeight（数字即可），例如：\n"
        "    - 容器 A：minWidth=..., minHeight=...（含 padding）\n"
        "    - 容器 B：minWidth=..., minHeight=...（含 padding）\n"
        "  - 注意：这里只能写中文说明 + 数字结论，禁止粘贴任何 JSON/节点对象。\n"
        "  - 若发现任何一项不满足：你必须继续输出对应的 componentTemplate/insertNode 修正，修正后再次自检，直到满足为止；禁止在未满足时输出‘完成/自检通过’。\n"
        "  - 若全部满足：再输出 chatMessage 说明‘自检通过’。\n"
        "- 注意：仍然必须遵守 JSONL 约束；每行一个完整 envelope；禁止输出 Markdown/代码块。"
    )

    parts.append(
        "布局与坐标（非常重要）：\n"
        "- 这不是 CSS/HTML：你必须通过 transform.x/y/width/height 等数值来排版与美化。\n"
        "- 父子关系下：子节点 transform.x/y 的 (0,0) 原点是父节点的中心点。\n"
        "  例：把某个子矩形居中放在父容器里：transform:{x:0,y:0,width:...,height:...}。\n"
        "  例：把子节点放到父容器左上角（带 padding）：设父容器宽W高H，则左上角约为 (-W/2, -H/2)，再加 padding。\n"
        "- 为了输出更稳定、更可控：生成可视节点时，建议显式给出完整 props 字段（rect/text/image/line 的所有可配置项），即使使用默认值。\n"
        "- 注意边框：rect 的 borderWidth 会影响视觉占用，请给出合理的 borderWidth 与 cornerRadius。"
    )

    parts.append(
        "容器尺寸硬规则（用于避免‘父节点小于子节点’导致组合错位；强制执行）：\n"
        "- 只要一个节点‘有子节点’，该节点就必须显式给出 transform.width/height，并且能完全包裹其子节点的内容。\n"
        "  - 判定‘有子节点’：在 template.nodes 中，存在任意节点的 parentLocalId 指向它；或在 insertNode 的 node.children 中它拥有 children。\n"
        "  - 这条规则适用于所有作为父节点使用的节点；在本协议中，你只能使用 rect 作为父节点容器。\n"
        "- 父节点宽高必须 >= 子节点在父坐标系下的包围盒尺寸（建议再留 8~24 的 padding）。\n"
        "- 计算最小包裹尺寸（你必须按此思路核算，而不是凭感觉写一个小数）：\n"
        "  1) 对每个子节点，求其在父坐标系下的占用范围：\n"
        "     - rect/image：使用 width/height：left = x - width/2, right = x + width/2, top = y - height/2, bottom = y + height/2。\n"
        "     - text：若省略 width/height，你要么给父容器留足 padding，要么给 text 写一个足够大的 width/height（避免裁切）。\n"
        "     - line：可以忽略 transform.width/height；用 (startX,startY) 与 (endX,endY) 的 min/max 推导包围盒，并再加 lineWidth/2 的余量。\n"
        "  2) 合并所有子节点范围：minX=min(left), maxX=max(right), minY=min(top), maxY=max(bottom)。\n"
        "  3) 父容器最小尺寸：minWidth = (maxX-minX) + padding*2；minHeight = (maxY-minY) + padding*2。\n"
        "  4) 设置父容器 transform.width >= minWidth 且 transform.height >= minHeight。\n"
        "- 禁止输出父节点宽高小于子节点占用的情况；如果你不确定，宁可把父容器尺寸做大一些。\n"
        "- 即使父容器只是为了层级组织（不需要可视样式），仍然必须满足上述最小宽高要求。"
    )

    parts.append(
        "登录框组件美化建议（用于生成更合理美观的节点组合）：\n"
        "- 建议结构：root(rect) → title(text) + input1(rect+text) + input2(rect+text) + button(rect+text)。\n"
        "- 推荐尺寸（可按 viewport 调整）：card 宽 520~680，高 520~620，圆角 12~18，边框 1~2。\n"
        "- 间距规则：左右 padding 32，上下间距 16~20；标题与输入框间距更大（24~32）。\n"
        "- 字体：标题 fontSize 32~40；输入提示 14~16；按钮 16~18。\n"
        "- 颜色：背景深色（fillColor #1e1e1e~#2a2a2a），边框 #3c3c3c；按钮可用高对比色（例如 #3aa1ff）。\n"
        "- 输入框：用 rect 表示输入区域（浅色边框或更深底色），再用 text 表示 placeholder/label。"
    )

    parts.append(
        "节点 id 约定（用于后续精确编辑）：\n"
        "- 前端会将每个模板节点实例化为舞台节点，并使用 nodeId = `${templateId}:${localId}`（如冲突会自动加后缀）。\n"
        "- 因此，当你需要在后续消息里引用某个已插入节点时：请优先使用这个约定生成 nodeId，并在 agentToUi/applyFilter 中使用 target=\"nodeId\" + nodeId 字段。"
    )

    # Examples
    parts.append(
        "示例（仅示意）：\n"
        '{"schemaVersion":1,"type":"agentToUi/chatMessage","id":"...","createdAt":"...","payload":{"content":"我将插入一个标题文本到舞台左上角。"}}\n'
        '{"schemaVersion":1,"type":"agentToUi/componentTemplate","id":"...","createdAt":"...","payload":{"intent":"insert","template":{"schemaVersion":1,"templateId":"tmpl_1","name":"AI标题","params":[],"nodes":[{"localId":"root","type":"text","props":{"textContent":"Hello","fontSize":48,"fontColor":"#ffffff"},"transform":{"x":40,"y":40}}],"rootLocalId":"root"}}}\n'
    )

    parts.append(
        "insertNode 示例（单节点追加到舞台；适合分步骤落地）：\n"
        '{"schemaVersion":1,"type":"agentToUi/chatMessage","id":"...","createdAt":"...","payload":{"content":"我将追加一个按钮矩形到舞台中央。"}}\n'
        '{"schemaVersion":1,"type":"agentToUi/insertNode","id":"...","createdAt":"...","payload":{"node":{"category":"user","userType":"rect","name":"Button","transform":{"x":0,"y":0,"width":240,"height":56,"rotation":0,"opacity":1},"props":{"fillColor":"#3aa1ff","fillOpacity":1,"borderColor":"#3aa1ff","borderOpacity":1,"borderWidth":1,"cornerRadius":12}}}}\n'
    )

    parts.append(
        "insertNode 增量挂载示例（把单节点挂到舞台已存在父节点下）：\n"
        '{"schemaVersion":1,"type":"agentToUi/chatMessage","id":"...","createdAt":"...","payload":{"content":"我将把一个标题文本挂到已存在的 login_card:root 下面。"}}\n'
        '{"schemaVersion":1,"type":"agentToUi/insertNode","id":"...","createdAt":"...","payload":{"parentId":"login_card:root","node":{"category":"user","userType":"text","name":"Title","transform":{"x":0,"y":-220,"rotation":0,"opacity":1},"props":{"textContent":"欢迎登录","fontSize":36,"fontColor":"#ffffff","fontStyle":"normal","textAlign":"center"}}}}\n'
        "说明：insertNode 的 parentId 是舞台 nodeId；如果要插入多节点形成树，可以在 node.children 里提供子节点。"
    )

    parts.append(
        "增量挂载示例（把新模块挂到已存在的舞台父节点下）：\n"
        '{"schemaVersion":1,"type":"agentToUi/chatMessage","id":"...","createdAt":"...","payload":{"content":"我将把‘登录按钮’模块挂到已存在的 login_card:root 节点下面。"}}\n'
        '{"schemaVersion":1,"type":"agentToUi/componentTemplate","id":"...","createdAt":"...","payload":{"intent":"insert","parentId":"login_card:root","template":{"schemaVersion":1,"templateId":"tmpl_login_btn","name":"登录按钮模块","params":[],"nodes":['
        '{"localId":"root","type":"rect","props":{"fillColor":"#000000","fillOpacity":0,"borderColor":"#000000","borderOpacity":0,"borderWidth":0,"cornerRadius":0},"transform":{"x":0,"y":180,"width":400,"height":80}},'
        '{"localId":"btn","type":"rect","parentLocalId":"root","transform":{"x":0,"y":0,"width":360,"height":56},"props":{"fillColor":"#3aa1ff","fillOpacity":1,"borderColor":"#3aa1ff","borderOpacity":1,"borderWidth":1,"cornerRadius":12}},'
        '{"localId":"btn_text","type":"text","parentLocalId":"root","transform":{"x":0,"y":0},"props":{"textContent":"登录","fontSize":18,"fontColor":"#ffffff","fontStyle":"normal","textAlign":"center"}}'
        '],"rootLocalId":"root"}}}\n'
        "说明：payload.parentId 是舞台 nodeId（来自已插入节点的 templateId:localId），而 parentLocalId 仍然只引用模板内部 localId。"
    )

    parts.append(
        "高级组件示例（推荐：rect 作为根容器，多个子节点组合）：\n"
        '{"schemaVersion":1,"type":"agentToUi/chatMessage","id":"...","createdAt":"...","payload":{"content":"我将插入一个带背景卡片和标题的组件到舞台中央。"}}\n'
        '{"schemaVersion":1,"type":"agentToUi/componentTemplate","id":"...","createdAt":"...","payload":{"intent":"insert","template":{"schemaVersion":1,"templateId":"tmpl_card","name":"卡片标题组件","params":[],"nodes":['
        '{"localId":"root","type":"rect","props":{"fillColor":"#1e1e1e","fillOpacity":1,"borderColor":"#3c3c3c","borderOpacity":1,"borderWidth":2,"cornerRadius":12},"transform":{"x":0,"y":0,"width":520,"height":160}},'
        '{"localId":"title","type":"text","parentLocalId":"root","transform":{"x":-236,"y":-52},"props":{"textContent":"标题","fontSize":40,"fontColor":"#ffffff","fontStyle":"normal"}}'
        '],"rootLocalId":"root"}}}}\n'
        "说明：root(rect) 的 x/y 应该放在目标位置（如 viewport.centerWorld）；子节点的 (0,0) 是父节点中心。"
    )

    # Editor command: applyFilter
    parts.append(
        "当用户要求修改已选中节点（例如：添加发光/模糊滤镜）时，不要输出 componentTemplate。改为输出编辑器动作：\n"
        "1) 先输出 chatMessage 简短说明你将做什么。\n"
        "2) 再输出 type=agentToUi/applyFilter，payload.target=\"selection\"，payload.mode=\"append\"，payload.filter 为滤镜对象。\n"
        "滤镜对象示例（发光）：{\"type\":\"glow\",\"color\":\"#00ffff\",\"intensity\":1,\"blurX\":18,\"blurY\":18,\"inner\":false,\"knockout\":false}"
    )

    parts.append(
        "发光滤镜的可视强度规则（针对 line 线条；强制建议）：\n"
        "- 如果你给线条（type=line）添加 glow，并且 blurX=5 且 blurY=5（默认值）：则 intensity 应从 1.5 开始（>=1.5），否则发光几乎不可见。\n"
        "- 当用户未明确要求 intensity 时：对线条的 glow 请默认使用 intensity=4（blurX/blurY 若未指定则默认 5）。"
    )

    # Viewport context
    if isinstance(viewport, dict) and viewport: 
        parts.append(
            "舞台坐标系说明：\n"
            "- world 坐标单位为像素（zoom=1 时）。\n"
            "- world 原点 (0,0) 在舞台中心；x 向右为正，y 向下为正。\n"
            "- 屏幕坐标与 world 的关系：screen = world * zoom + pan（pan 为屏幕像素）。\n"
            "- 如果用户未指定具体坐标，请默认把 root 节点放在舞台中央（即当前视口中心 viewport.centerWorld）。"
        )
        parts.append("viewport(JSON):\n" + json.dumps(viewport, ensure_ascii=False))

    return parts
