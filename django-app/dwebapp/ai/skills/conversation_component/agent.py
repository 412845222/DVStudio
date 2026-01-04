from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from ..protocol.message_builder import build_messages_from_preset


def build_component_from_dialog_messages(
    *,
    prompt_preset: str,
    prompt_input: Any,
    context_pack: Any,
    viewport: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, str]]:
    """Generic helper for dialog -> component generation.

    It routes to backend-owned presets; caller selects which preset.
    """

    return build_messages_from_preset(
        preset=prompt_preset,
        prompt_input=prompt_input,
        context_pack=context_pack,
        response_mode="agentToUi-jsonl",
        default_intent="insert",
        viewport=viewport,
    )


def build_simple_chat_context(*, messages: List[Dict[str, Any]]) -> str:
    """Flatten chat messages as a minimal context string."""

    lines: List[str] = []
    for m in messages:
        r = m.get("role")
        c = m.get("content")
        if r in ("user", "assistant") and isinstance(c, str) and c.strip():
            lines.append(f"{r}: {c.strip()}")
    return "\n".join(lines)
