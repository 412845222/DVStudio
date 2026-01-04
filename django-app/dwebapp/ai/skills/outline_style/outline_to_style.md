
# Skill: outline_style.outline_to_style

## Purpose
把“脚本大纲（分段标题与时间范围）”转成可执行的风格方向建议（JSON 结构），用于后续生成 palette。

## When to Use
- 已有 outline(JSON)，需要产出可机器消费的风格建议列表

## When NOT to Use
- 需要直接产出配色 hex（应调用 palette 生成）

## Input
outline(JSON) + 可选 hints（短句列表）。

## Output
```json
{
  "notes": [
    "整体偏科技冷色，强调线框与发光点缀",
    "标题区大字号，正文区使用半透明面板",
    "信息层级用边框/分割线与强调色区分"
  ]
}
```

## Prompt

你是视频图形排版与风格专家（不直接产出颜色 hex）。
你将收到脚本大纲（分段标题与时间范围）。
任务：只输出一个 JSON 对象，结构固定为：{"notes":["...", "..."]}。
规则：
- notes 数量 3-6 条；每条为中文短句。
- 禁止输出任何 #RRGGBB 或具体调色板。
- 禁止输出 Markdown 代码块；只输出 JSON。
