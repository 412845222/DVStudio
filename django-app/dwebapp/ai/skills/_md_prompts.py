from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional


@lru_cache(maxsize=256)
def _read_text(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def read_md(*, relative_to: str, filename: str) -> str:
    """Read a markdown file located next to a python module file."""

    base = Path(relative_to).resolve().parent
    path = base / filename
    return _read_text(str(path))


def render_vars(text: str, variables: Optional[Dict[str, Any]] = None) -> str:
    """Render very small template vars in the form of {{var}}.

    We intentionally avoid `{}` formatting because prompt texts often contain JSON.
    """

    if not variables:
        return text

    out = text
    for key, value in variables.items():
        out = out.replace("{{" + str(key) + "}}", str(value))
    return out


_SECTION_RE_CACHE: Dict[tuple[int, str], re.Pattern[str]] = {}


def extract_heading_section(
    md_text: str,
    *,
    heading: str,
    level: int = 2,
) -> str:
    """Extract the section body under a markdown heading.

    Example:
      heading='Prompt', level=2 extracts content under '## Prompt' until the next '## '.

    Raises ValueError if not found.
    """

    key = (level, heading)
    pattern = _SECTION_RE_CACHE.get(key)
    if pattern is None:
        prefix = "#" * int(level)
        # Match heading line, then capture until next same-level heading or EOF.
        pattern = re.compile(
            rf"^\s*{re.escape(prefix)}\s+{re.escape(heading)}\s*$\n"  # heading line
            rf"(.*?)"  # body
            rf"(?=^\s*{re.escape(prefix)}\s+|\Z)",
            flags=re.MULTILINE | re.DOTALL,
        )
        _SECTION_RE_CACHE[key] = pattern

    m = pattern.search(md_text)
    if not m:
        raise ValueError(f"Markdown section not found: level={level} heading={heading!r}")

    return m.group(1).strip()


def load_prompt_section(
    *,
    relative_to: str,
    filename: str,
    heading: str = "Prompt",
    level: int = 2,
    variables: Optional[Dict[str, Any]] = None,
) -> str:
    md = read_md(relative_to=relative_to, filename=filename)
    section = extract_heading_section(md, heading=heading, level=level)
    return render_vars(section, variables)
