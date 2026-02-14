"""Cross-skill protocols and shared prompting rules.

This module intentionally lives under `ai.skills` so that protocol prompts are
co-located with the agent/skill architecture.
"""

from __future__ import annotations

from .agent_to_ui_jsonl import build_agent_to_ui_jsonl_system_parts

__all__ = ["build_agent_to_ui_jsonl_system_parts"]
