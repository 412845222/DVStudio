from __future__ import annotations

from typing import Any, List

from .._md_prompts import load_prompt_section


def build_video_scene_plan_system_parts(*, prompt_input: Any) -> List[str]:
    """System prompt parts for VideoScene GUI/animation plan generation.

    Frontend only provides structured promptInput; prompt wording stays backend-owned.
    """

    _ = prompt_input
    prompt = load_prompt_section(
        relative_to=__file__,
        filename="video_scene_plan.md",
        heading="Prompt",
        level=2,
    )
    return [prompt]