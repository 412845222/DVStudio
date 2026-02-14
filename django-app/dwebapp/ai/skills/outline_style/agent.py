from __future__ import annotations

import json
from typing import Any, Dict, List

from .._md_prompts import load_prompt_section


def build_outline_to_style_messages(*, outline: Any, hints: List[str] | None = None) -> List[Dict[str, str]]:
    """Transform an outline into style guidance messages (pure text).

    This is a minimal scaffold: current production flow already generates style.notes
    in the subtitle understanding stage.
    """

    sys = load_prompt_section(
        relative_to=__file__,
        filename="outline_to_style.md",
        heading="Prompt",
        level=2,
    )
    user = "outline(JSON):\n" + json.dumps(outline or {}, ensure_ascii=False)
    if hints:
        user += "\n\nhints:\n" + "\n".join([f"- {h}" for h in hints if isinstance(h, str) and h.strip()])
    return [{"role": "system", "content": sys}, {"role": "user", "content": user}]
