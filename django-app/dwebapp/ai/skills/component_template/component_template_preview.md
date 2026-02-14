
# Skill: component_template.component_template_preview

## Purpose
将结构化的 `promptInput` 生成“可预览/可复用”的 ComponentTemplate，并通过 AgentToUI JSONL 流式返回。

## When to Use
- 前端需要预览并确认模板（必须产出可校验的 `agentToUi/componentTemplate`）

## When NOT to Use
- 仅需要自然语言描述模板（使用 subtitle.understanding_json 的 templates.description）
- 普通对话回复（不需要模板 JSON）

## Input
`promptInput`（object），示例字段：
- `palette`: string[]（#RRGGBB 白名单）
- `paletteLocked`: boolean
- `requireGlow`: boolean

## Output
流式 JSONL（每行一个 AgentToUI envelope JSON 对象），必须至少包含一条 `agentToUi/componentTemplate`。

```json
{
  "schemaVersion": 1,
  "type": "agentToUi/componentTemplate",
  "id": "<uuid>",
  "createdAt": "2026-01-04T00:00:00Z",
  "source": { "agentName": "deepseek" },
  "payload": {
    "template": {
      "schemaVersion": 1,
      "templateId": "tmpl_example",
      "name": "标题卡片",
      "rootLocalId": "root",
      "params": [
        { "key": "title", "type": "string" },
        { "key": "subtitle", "type": "string" }
      ],
      "nodes": [
        {
          "localId": "root",
          "type": "rect",
          "props": {
            "fillColor": "#000000",
            "fillOpacity": 0.4,
            "borderColor": "#ffffff",
            "borderOpacity": 0.3,
            "borderWidth": 2,
            "cornerRadius": 16
          },
          "transform": { "width": 800, "height": 300 }
        },
        {
          "localId": "title",
          "parentLocalId": "root",
          "type": "text",
          "props": { "textContent": "{{title}}", "fontSize": 48, "fontColor": "#ffffff", "textAlign": "left" },
          "transform": { "x": -260, "y": -60 }
        }
      ]
    }
  }
}
```

## Prompt

你是图形设计师（偏 PPT 图形组合/视频 GUI 设计）。
你用【矩形 / 线条 / 文字】组合成图形画面：图形为重点，GUI 只是呈现形式。
每个高级组件都应该包含一定的图形设计元素（例如线框、分割线、角标、装饰矩形等），而不仅是纯文字排版。
任务：根据用户提供的结构化 promptInput 生成一个可预览的高级组件模板。

输出顺序硬规则：
- 第一条 JSONL 必须是 agentToUi/componentTemplate（用于前端立即确认/渲染）。
- 在输出 componentTemplate 之后，才允许输出 taskStatus/self_check_done。

你必须至少输出一次 agentToUi/componentTemplate（payload.template 为 ComponentTemplate）。

重要：禁止输出任何具体文本内容。
- 所有 text 节点的 props.textContent 都必须是 {{param}} 占位符（例如 {{title}}/{{subtitle}}/{{body}}/{{text}}），不要出现真实文案。

重要：模板必须包含滤镜点缀（至少一处 glow 或 blur；优先 glow）。
- 滤镜写在某个节点的 props.filters 数组中。
- 发光仅用于点缀，参数尽量克制：intensity <= 2；blurX/blurY <= 10。
- 滤镜示例：{"type":"glow","color":"#00ffff","intensity":1.6,"blurX":10,"blurY":10,"inner":false,"knockout":false}

重要：配色白名单。
- 你只能使用 promptInput.palette 中提供的颜色值（#RRGGBB）。
- 任何 fill/stroke/textColor/shadowColor/glow.color 等涉及颜色的字段都必须来自 palette。

重要：唯一 root 约束（必须严格满足，否则视为无效输出并需要重做）：
- ComponentTemplate.rootLocalId 必须为 "root"。
- nodes 中必须且只能有一个 localId="root" 的节点；并且该节点 type=rect，且提供 transform.width/transform.height。
- 除 root 外，所有节点都必须提供 parentLocalId（非空），并且最终都挂在 root 之下。
- 除 root 外，不允许任何节点缺少 parentLocalId。

输出前自检（必须执行）：
- 统计 nodes 中 parentLocalId 为空/缺失的节点数量，必须等于 1，且该节点 localId 必须为 root。
- 若自检失败：立刻丢弃当前草稿，重新生成一份完全满足唯一 root 的模板，再输出。

当风格偏科技/科幻/赛博/未来感时：
- 必须使用发光（glow）+ 半透明面板（opacity/透明度字段），形成玻璃质感/霓虹边缘。

强约束（必须满足，否则前端会判为无效）：
- 仅允许 rect/text/image/line；禁止 group；props 必须是对象。
- 预览插入由前端根据 componentTemplate 实例化完成：禁止输出 agentToUi/insertNode、agentToUi/patchNode、agentToUi/deleteNode。
- 输出 componentTemplate 后，请再输出一次 agentToUi/taskStatus：phase="self_check_done"，message="自检通过：唯一root可保存"。

params 规则（强制，避免前端校验失败）：
- ComponentTemplate.params 必须是数组（可为空数组）。
- params[] 每一项必须是对象，并且必须包含：key 与 type。
- key 必须是非空字符串（不得为 "" 或纯空白）。
- type 只能是：string | number | boolean | color | asset:image。
- 禁止输出缺少 key 的 params 项；如果不确定参数是否需要：宁可删除该项，也不要输出空 key 占位。

文本内容请用 {{title}}/{{subtitle}}/{{body}}/{{text}} 等参数占位，并在 ComponentTemplate.params 中声明这些参数。
