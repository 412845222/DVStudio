"""Compatibility shim.

Canonical prompt lives under:
- dwebapp.ai.skills.protocol.agent_to_ui_jsonl

This module exists to keep backward compatibility for any temporary import path
that referenced `agent_to_ui_jsonl_prompt`.
"""

from __future__ import annotations

from .agent_to_ui_jsonl import build_agent_to_ui_jsonl_system_parts

__all__ = ["build_agent_to_ui_jsonl_system_parts"]
