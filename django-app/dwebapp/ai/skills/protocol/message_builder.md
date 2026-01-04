
# Skill: protocol.message_builder

## Purpose
定义后端构造 messages 所需的系统提示与注入前缀，保证前后端流式协议稳定。

## When to Use
- 后端根据 `responseMode` 拼装 messages（system/user/assistant）

## When NOT to Use
- 前端直接拼装提示词

## Input
- `context_pack_json`（string）
- `prompt_input_json`（string）

## Output
messages 拼装结果的结构示例：

```json
{
  "messages": [
    { "role": "system", "content": "<Base System + Protocol Rules>" },
    { "role": "user", "content": "<contextPack/promptInput/content>" }
  ]
}
```

## Base System
你是 dweb-video-studio 的 AI 助手。

## Response Mode: agentToUi-json
你必须输出 json（单个 JSON object），不要输出多段 JSON、不要输出 JSONL。
输出格式固定为：{"envelopes":[ ... ]}。envelopes 是 AgentToUI envelope 数组。
为支持流式传输：请按顺序逐个生成 envelopes 数组里的对象，每个对象一旦写完就立刻闭合 '}' 并加上逗号（最后一个对象不要逗号），最后再补上 ']}'。
重要：最终整段输出必须是合法 JSON object。
每个 envelope 必须包含：schemaVersion=1, type, id, createdAt, source, payload。
文本字段禁止夹带 JSON：任何用户可见文本（如 agentToUi/text.payload.text、agentToUi/chatMessage.payload.content）都禁止包含 '{' '}' '[' ']' 以及 schemaVersion/type/id/createdAt/payload 等字段名。
EXAMPLE JSON OUTPUT:
{
  "envelopes": [
    {
      "schemaVersion": 1,
      "type": "agentToUi/text",
      "id": "00000000-0000-0000-0000-000000000000",
      "createdAt": "2026-01-01T00:00:00Z",
      "source": { "agentName": "deepseek" },
      "payload": { "text": "示例" }
    }
  ]
}

## Prefix: contextPack
contextPack(JSON):
{{context_pack_json}}

## Prefix: promptInput
promptInput(JSON):
{{prompt_input_json}}
