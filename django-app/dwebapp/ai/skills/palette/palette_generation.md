
# Skill: palette.palette_generation

## Purpose
将“风格提示文本”包装为稳定的 user 消息内容，供后端生成配色时拼装 messages。

## When to Use
- 需要根据文字提示生成 `style.palette`（JSON）

## When NOT to Use
- 不需要生成配色

## Input
风格提示文本（string）。

## Output
一个 user 消息片段（content string），其结构示例：

```json
{
	"role": "user",
	"content": "用于生成配色的文字信息：\n<text>"
}
```

## User: palette_text
用于生成配色的文字信息：
{{text}}
