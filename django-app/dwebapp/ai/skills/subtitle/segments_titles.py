"""Subtitle segments title prompts (JSON contract).

Canonical location (skill architecture):
- dwebapp.ai.skills.subtitle.segments_titles

Goal: generate short Chinese titles for segments to be used in progress bar UI.
"""

from __future__ import annotations

from .._md_prompts import load_prompt_section


def _base_role() -> str:
    return load_prompt_section(
        relative_to=__file__,
        filename="segments_titles.md",
        heading="Base Role",
        level=2,
    )


def _json_contract() -> str:
    return load_prompt_section(
        relative_to=__file__,
        filename="segments_titles.md",
        heading="JSON Contract",
        level=2,
    )


def segments_stage_system_prompt() -> str:
    return "\n".join(
        [
            _base_role(),
            _json_contract(),
            load_prompt_section(
                relative_to=__file__,
                filename="segments_titles.md",
                heading="Stage: segments_titles",
                level=2,
            ),
        ]
    )
