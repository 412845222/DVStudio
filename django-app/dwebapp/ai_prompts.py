from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from .prompts.agent_to_ui_jsonl import build_agent_to_ui_jsonl_system_parts


def build_messages(
    *,
    content: str,
    context_pack: Any,
    response_mode: str,
    default_intent: str = "insert",
    viewport: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, str]]:
    """Build OpenAI-compatible messages.

    This centralizes prompt engineering so it can evolve without bloating the API view.
    """

    system_parts: List[str] = ["你是 dweb-video-studio 的 AI 助手。"]

    if response_mode == "agentToUi-jsonl":
        system_parts.extend(build_agent_to_ui_jsonl_system_parts(default_intent=default_intent, viewport=viewport))

    # DeepSeek JSON Output mode: require a SINGLE valid JSON object.
    # Notes:
    # - DeepSeek requires prompts to contain the word 'json' and an example.
    # - We keep this response_mode separate from agentToUi-jsonl streaming.
    if response_mode == "agentToUi-json":
        system_parts.extend(
            [
                "你必须输出 json（单个 JSON object），不要输出多段 JSON、不要输出 JSONL。",
                "输出格式固定为：{\"envelopes\":[ ... ]}。envelopes 是 AgentToUI envelope 数组。",
                "为支持流式传输：请按顺序逐个生成 envelopes 数组里的对象，每个对象一旦写完就立刻闭合 '}' 并加上逗号（最后一个对象不要逗号），最后再补上 ']}'。",
                "重要：最终整段输出必须是合法 JSON object。",
                "每个 envelope 必须包含：schemaVersion=1, type, id, createdAt, source, payload。",
                "文本字段禁止夹带 JSON：任何用户可见文本（如 agentToUi/text.payload.text、agentToUi/chatMessage.payload.content）都禁止包含 '{' '}' '[' ']' 以及 schemaVersion/type/id/createdAt/payload 等字段名。",
                "EXAMPLE JSON OUTPUT:\n{\n  \"envelopes\": [\n    {\n      \"schemaVersion\": 1,\n      \"type\": \"agentToUi/text\",\n      \"id\": \"00000000-0000-0000-0000-000000000000\",\n      \"createdAt\": \"2026-01-01T00:00:00Z\",\n      \"source\": { \"agentName\": \"deepseek\" },\n      \"payload\": { \"text\": \"示例\" }\n    }\n  ]\n}",
            ]
        )

    if context_pack is not None:
        system_parts.append("contextPack(JSON):\n" + json.dumps(context_pack, ensure_ascii=False))

    return [
        {"role": "system", "content": "\n".join(system_parts)},
        {"role": "user", "content": content},
    ]
