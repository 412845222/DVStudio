from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from ..component_template.presets import build_component_template_preview_system_parts
from .._md_prompts import load_prompt_section
from .agent_to_ui_jsonl import build_agent_to_ui_jsonl_system_parts


def _base_system() -> str:
    return load_prompt_section(relative_to=__file__, filename="message_builder.md", heading="Base System")


def _agent_to_ui_json_system_block() -> str:
    return load_prompt_section(relative_to=__file__, filename="message_builder.md", heading="Response Mode: agentToUi-json")


def _context_pack_prefix(*, context_pack_json: str) -> str:
    return load_prompt_section(
        relative_to=__file__,
        filename="message_builder.md",
        heading="Prefix: contextPack",
        variables={"context_pack_json": context_pack_json},
    )


def _prompt_input_prefix(*, prompt_input_json: str) -> str:
    return load_prompt_section(
        relative_to=__file__,
        filename="message_builder.md",
        heading="Prefix: promptInput",
        variables={"prompt_input_json": prompt_input_json},
    )


def build_messages(
    *,
    content: str,
    context_pack: Any,
    response_mode: str,
    default_intent: str = "insert",
    viewport: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, str]]:
    """Build OpenAI-compatible messages.

    Centralizes prompt engineering so it can evolve without bloating the API view.

    Note:
    - This lives under protocol skill because it owns response-mode constraints
      (AgentToUI JSONL/JSON) and routing.
    """

    system_parts: List[str] = [_base_system()]

    if response_mode == "agentToUi-jsonl":
        system_parts.extend(build_agent_to_ui_jsonl_system_parts(default_intent=default_intent, viewport=viewport))

    # DeepSeek JSON Output mode: require a SINGLE valid JSON object.
    # Notes:
    # - DeepSeek requires prompts to contain the word 'json' and an example.
    # - We keep this response_mode separate from agentToUi-jsonl streaming.
    if response_mode == "agentToUi-json":
        system_parts.append(_agent_to_ui_json_system_block())

    if context_pack is not None:
        system_parts.append(_context_pack_prefix(context_pack_json=json.dumps(context_pack, ensure_ascii=False)))

    return [
        {"role": "system", "content": "\n".join(system_parts)},
        {"role": "user", "content": content},
    ]


def build_messages_from_preset(
    *,
    preset: str,
    prompt_input: Any,
    context_pack: Any,
    response_mode: str,
    default_intent: str = "insert",
    viewport: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, str]]:
    """Build messages with a backend-owned prompt preset.

    Frontend must NOT embed any prompt preambles.
    It should only pass `promptPreset` + `promptInput`.
    """

    preset_norm = str(preset or "").strip()
    if not preset_norm:
        return build_messages(
            content=json.dumps(prompt_input, ensure_ascii=False),
            context_pack=context_pack,
            response_mode=response_mode,
            default_intent=default_intent,
            viewport=viewport,
        )

    system_parts: List[str] = [_base_system()]

    if response_mode == "agentToUi-jsonl":
        system_parts.extend(build_agent_to_ui_jsonl_system_parts(default_intent=default_intent, viewport=viewport))

    # Presets for component template preview.
    # `subtitle_template_preview` is intentionally an alias for the same behavior.
    if preset_norm in ("subtitle_template_preview", "component_template_preview"):
        system_parts.extend(build_component_template_preview_system_parts(prompt_input=prompt_input))

        if context_pack is not None:
            system_parts.append(_context_pack_prefix(context_pack_json=json.dumps(context_pack, ensure_ascii=False)))

        user_content = _prompt_input_prefix(
            prompt_input_json=json.dumps(
                {"preset": preset_norm, "promptInput": prompt_input},
                ensure_ascii=False,
            )
        )

        return [
            {"role": "system", "content": "\n".join(system_parts)},
            {"role": "user", "content": user_content},
        ]

    raise ValueError(f"unsupported promptPreset: {preset_norm}")
