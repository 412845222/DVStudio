"""Subtitle panel chat patch proposal prompts (JSON contract).

Canonical location (skill architecture):
- dwebapp.ai.skills.subtitle.panel_patch_json

Goal:
- Let the model propose *draft* modifications to summary.style.notes and/or summary.templates
  based on user chat intent.
- The proposal must be applied by the UI (explicit user click), not automatically.

The model output is a single JSON object that can be parsed via json.loads().
"""

from __future__ import annotations

from .._md_prompts import load_prompt_section


def system_prompt() -> str:
    return load_prompt_section(
        relative_to=__file__,
        filename="panel_patch_json.md",
        heading="Base Role",
        level=2,
    )


def json_contract() -> str:
    return load_prompt_section(
        relative_to=__file__,
        filename="panel_patch_json.md",
        heading="Output",
        level=2,
    )


def panel_patch_stage_system_prompt() -> str:
    return "\n".join([system_prompt(), json_contract()])
