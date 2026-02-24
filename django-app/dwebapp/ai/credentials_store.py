from __future__ import annotations

from typing import Dict

import os


FIXED_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
FIXED_DEEPSEEK_MODEL = "deepseek-chat"


def _safe_db_get_plaintext_key(provider: str) -> str:
    """Fetch key from DB if possible.

    This function must be safe to call even before migrations are applied.
    """

    try:
        from dwebapp.models import ApiKeySecret

        row = ApiKeySecret.objects.filter(provider=provider).first()
        if not row:
            return ""
        return row.get_plaintext_key() or ""
    except Exception:
        return ""


def get_deepseek_cfg() -> Dict[str, str]:
    """Return DeepSeek OpenAI-compatible config.

    Priority:
    1) env var DEEPSEEK_API_KEY (allows CI or scripted runs)
    2) local encrypted DB storage
    """

    api_key = (os.environ.get("DEEPSEEK_API_KEY") or "").strip()
    if not api_key:
        api_key = _safe_db_get_plaintext_key("deepseek").strip()

    # base_url/model are fixed by product decision
    return {
        "base_url": FIXED_DEEPSEEK_BASE_URL,
        "api_key": api_key,
        "model": FIXED_DEEPSEEK_MODEL,
    }


def get_gemini_api_key() -> str:
    """Return Gemini API key.

    Priority:
    1) env var GEMINI_API_KEY / NANOBANANA_API_KEY
    2) local encrypted DB storage (provider=gemini)
    """

    api_key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("NANOBANANA_API_KEY") or "").strip()
    if api_key:
        return api_key
    return _safe_db_get_plaintext_key("gemini").strip()
