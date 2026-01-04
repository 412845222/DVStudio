"""Subtitle understanding prompts (JSON contract).

Canonical location (skill architecture):
- dwebapp.ai.skills.subtitle.understanding_json

Goal: avoid unstable markdown parsing by having the model output structured JSON.
The backend streams it to the front-end as AgentToUI `agentToUi/subtitleSummaryDelta` messages.

Important: subtitle summary stage MUST NOT output any ComponentTemplate JSON.
Templates are described in natural language only; rendering/preview is handled by a dedicated API.
"""

from __future__ import annotations

from .._md_prompts import load_prompt_section


def _base_role() -> str:
    return load_prompt_section(
        relative_to=__file__,
        filename="understanding_json.md",
        heading="Base Role",
        level=2,
    )


def _json_contract() -> str:
    return load_prompt_section(
        relative_to=__file__,
        filename="understanding_json.md",
        heading="JSON Contract",
        level=2,
    )


def outline_stage_system_prompt() -> str:
    """Stage 1: outline + style notes + templates + plans (no palette)."""

    return "\n".join(
        [
            _base_role(),
            _json_contract(),
            load_prompt_section(
                relative_to=__file__,
                filename="understanding_json.md",
                heading="Stage: outline",
                level=2,
            ),
        ]
    )


def rest_stage_system_prompt() -> str:
    """Stage 2: style + templates + plans."""

    return "\n".join(
        [
            _base_role(),
            _json_contract(),
            load_prompt_section(
                relative_to=__file__,
                filename="understanding_json.md",
                heading="Stage: rest",
                level=2,
            ),
        ]
    )


def palette_stage_system_prompt() -> str:
    """Palette generation skill: generate only palette JSON based on text guidance."""

    return "\n".join(
        [
            load_prompt_section(
                relative_to=__file__,
                filename="understanding_json.md",
                heading="Stage: palette",
                level=2,
            ),
            _json_contract(),
        ]
    )


def chat_stage_system_prompt() -> str:
    """Follow-up chat prompt grounded on cues + current summary JSON."""

    return load_prompt_section(
        relative_to=__file__,
        filename="understanding_json.md",
        heading="Stage: chat",
        level=2,
    )
