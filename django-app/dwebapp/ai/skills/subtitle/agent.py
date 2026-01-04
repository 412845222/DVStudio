from __future__ import annotations

import json
from typing import Any, Dict, List

from . import understanding_json as subtitle_prompts
from .._md_prompts import load_prompt_section


def build_understand_outline_messages(*, cues: List[Dict[str, Any]], cue_ranges: List[Any]) -> List[Dict[str, str]]:
    """Stage 1: outline + style notes + templates + plans (no palette)."""

    system = subtitle_prompts.outline_stage_system_prompt()
    user = load_prompt_section(
        relative_to=__file__,
        filename="agent_messages.md",
        heading="User: outline_context",
        variables={
            "cues_json": json.dumps(cues, ensure_ascii=False),
            "cue_ranges_json": json.dumps(cue_ranges, ensure_ascii=False),
        },
    )

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def build_palette_messages(*, text: str) -> List[Dict[str, str]]:
    system = subtitle_prompts.palette_stage_system_prompt()
    user = load_prompt_section(
        relative_to=__file__,
        filename="agent_messages.md",
        heading="User: palette_text",
        variables={"text": text or ""},
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def build_chat_messages(
    *,
    cues: List[Dict[str, Any]],
    cue_ranges: List[Any],
    summary: Any,
    messages: List[Dict[str, Any]],
    deep_mode: bool = False,
) -> List[Dict[str, str]]:
    """Follow-up chat grounded on subtitles + current summary JSON."""

    system = subtitle_prompts.chat_stage_system_prompt()
    if deep_mode:
        system += "\n\n" + load_prompt_section(
            relative_to=__file__,
            filename="agent_messages.md",
            heading="System Addon: deep_mode",
        )

    context = load_prompt_section(
        relative_to=__file__,
        filename="agent_messages.md",
        heading="User: chat_context",
        variables={
            "cues_json": json.dumps(cues, ensure_ascii=False),
            "cue_ranges_json": json.dumps(cue_ranges, ensure_ascii=False),
            "summary_json": json.dumps(summary or {}, ensure_ascii=False),
        },
    )

    out: List[Dict[str, str]] = [
        {"role": "system", "content": system + "\n\n" + context},
    ]

    for m in messages:
        r = m.get("role")
        c = m.get("content")
        if r not in ("user", "assistant"):
            continue
        if not isinstance(c, str) or not c.strip():
            continue
        out.append({"role": r, "content": c})

    return out
