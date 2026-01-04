
# Skill: subtitle.agent_messages

## Purpose
为字幕理解/配色/对话等流程提供稳定的消息片段模板（仅用于拼装 messages）。

## When to Use
- 后端需要把 `cues`/`cueRanges`/`summary` 等上下文注入到 user/system message 中

## When NOT to Use
- 前端直接拼接提示词（避免重复与漂移）

## Input
- `cues_json`（string）：字幕 cues(JSON)
- `cue_ranges_json`（string）：cueRanges(JSON)
- `summary_json`（string）：当前 summary(JSON)
- `text`（string）：用于生成配色的提示文本

## Output
输出为“可拼装的 message 片段内容”，其结构示例：

```json
{
	"role": "user",
	"content": "字幕 cues(JSON):\n...\n\ncueRanges(JSON):\n..."
}
```

## User: outline_context
字幕 cues(JSON):
{{cues_json}}

cueRanges(JSON):
{{cue_ranges_json}}

## User: palette_text
用于生成配色的文字信息：
{{text}}

## User: chat_context
字幕 cues(JSON):
{{cues_json}}

cueRanges(JSON):
{{cue_ranges_json}}

当前 summary(JSON):
{{summary_json}}

## System Addon: deep_mode
深度思考模式：
- 先抽取用户问题的关键约束与目标，再给出结论。
- 如需改动 summary/style，请说明你修改的理由与影响（简短）。
- 避免泛泛而谈，尽量给出可执行的下一步。
