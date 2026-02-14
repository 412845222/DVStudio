"""AI Chat APIs (DRF function-based views).

This file is a compatibility wrapper.

The implementation has been moved into the `dwebapp.ai.api.chat` package to
keep this module small while preserving existing import paths.
"""

from __future__ import annotations

from .chat.utils import (  # re-export for other modules (e.g. subtitle_understanding_api)
    _agent_to_ui_chat_message,
    _agent_to_ui_error,
    _agent_to_ui_subtitle_summary_delta,
    _agent_to_ui_task_status,
    _agent_to_ui_text,
    _apply_sse_headers,
    _deepseek_cfg,
    _is_agent_to_ui_envelope,
    _openai_chat,
    _openai_stream_chat,
    _sse,
    _wrap_short_agent_to_ui,
)

from .chat.views import create_conversation, send_message, stream_message


__all__ = [
    # Views
    "create_conversation",
    "send_message",
    "stream_message",
    # Helpers (used cross-module)
    "_agent_to_ui_text",
    "_agent_to_ui_error",
    "_agent_to_ui_task_status",
    "_agent_to_ui_chat_message",
    "_agent_to_ui_subtitle_summary_delta",
    "_is_agent_to_ui_envelope",
    "_wrap_short_agent_to_ui",
    "_deepseek_cfg",
    "_openai_stream_chat",
    "_openai_chat",
    "_sse",
    "_apply_sse_headers",
]
