from __future__ import annotations

from typing import Any, List

from .._md_prompts import load_prompt_section


def build_component_template_preview_system_parts(*, prompt_input: Any) -> List[str]:
    """System prompt parts for component template preview presets.

    This prompt is backend-owned; frontend must NOT embed any prompt preambles.
    """

    _ = prompt_input
    prompt = load_prompt_section(
        relative_to=__file__,
        filename="component_template_preview.md",
        heading="Prompt",
        level=2,
    )
    return [prompt]
