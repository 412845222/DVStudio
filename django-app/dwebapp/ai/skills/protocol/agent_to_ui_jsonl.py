from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from .._md_prompts import load_prompt_section


def build_agent_to_ui_jsonl_system_parts(
    *,
    default_intent: str,
    viewport: Optional[Dict[str, Any]] = None,
) -> List[str]:
    """System prompt parts for AgentToUI JSONL mode.

    Canonical location (skill architecture):
    - dwebapp.ai.skills.protocol.agent_to_ui_jsonl

    Goals:
    - Maximum format stability (strict JSONL, no extra text)
    - Prevent JSON leakage into chat bubbles
    - Ensure templates pass validation (props must be object)
    """

    parts: List[str] = [
        load_prompt_section(
            relative_to=__file__,
            filename="agent_to_ui_jsonl.md",
            heading="Prompt",
            level=2,
            variables={"default_intent": default_intent},
        )
    ]

    if isinstance(viewport, dict) and viewport:
        parts.append(
            load_prompt_section(
                relative_to=__file__,
                filename="agent_to_ui_jsonl.md",
                heading="Viewport",
                level=2,
            )
        )
        parts.append("viewport(JSON):\n" + json.dumps(viewport, ensure_ascii=False))

    return parts
