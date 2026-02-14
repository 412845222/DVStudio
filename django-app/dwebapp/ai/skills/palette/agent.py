from __future__ import annotations

from typing import Any, Dict, List

from .._md_prompts import load_prompt_section
from ..subtitle.understanding_json import palette_stage_system_prompt


def build_palette_messages(*, text: str) -> List[Dict[str, str]]:
    """Generate palette messages given style guidance text."""

    return [
        {"role": "system", "content": palette_stage_system_prompt()},
        {
            "role": "user",
            "content": load_prompt_section(
                relative_to=__file__,
                filename="palette_generation.md",
                heading="User: palette_text",
                variables={"text": text or ""},
            ),
        },
    ]
