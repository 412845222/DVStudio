from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..protocol.message_builder import build_messages_from_preset


def build_component_template_messages(
    *,
    prompt_input: Any,
    context_pack: Any,
    viewport: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, str]]:
    """Build messages for generating a reusable advanced component template.

    Uses the existing preview preset to produce a ComponentTemplate (AgentToUI JSONL).
    """

    return build_messages_from_preset(
        preset="component_template_preview",
        prompt_input=prompt_input,
        context_pack=context_pack,
        response_mode="agentToUi-jsonl",
        default_intent="insert",
        viewport=viewport,
    )
