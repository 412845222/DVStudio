from __future__ import annotations

from typing import Dict


FIXED_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
FIXED_DEEPSEEK_MODEL = "deepseek-chat"
FIXED_BYTEDANCE_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
DEFAULT_BYTEDANCE_TEXT_MODEL_KEY = "doubao-seed-2-0-lite-260215"
DEFAULT_CODEX_MODEL_KEY = "doubao-seed-2.0-Pro"


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

    Source:
    - local encrypted DB storage only (provider=deepseek)
    """

    api_key = _safe_db_get_plaintext_key("deepseek").strip()

    # base_url/model are fixed by product decision
    return {
        "base_url": FIXED_DEEPSEEK_BASE_URL,
        "api_key": api_key,
        "model": FIXED_DEEPSEEK_MODEL,
    }


def get_gemini_api_key() -> str:
    """Return Gemini API key.

    Source:
    - local encrypted DB storage only (provider=gemini)
    """

    return _safe_db_get_plaintext_key("gemini").strip()


def get_bytedance_api_key() -> str:
    """Return ByteDance Ark API key.

    Source:
    - local encrypted DB storage only (provider=bytedance)
    """

    return _safe_db_get_plaintext_key("bytedance").strip()


def get_meshy_api_key() -> str:
    """Return Meshy API key.

    Source:
    - local encrypted DB storage only (provider=meshy)
    """

    return _safe_db_get_plaintext_key("meshy").strip()


def get_codex_api_key() -> str:
    """Return Codex API key.

    Source:
    - local encrypted DB storage only (provider=codex)
    """

    return _safe_db_get_plaintext_key("codex").strip()


def get_bytedance_text_cfg() -> Dict[str, str]:
    """Return ByteDance Ark text chat config.

    Source:
    - local encrypted DB storage only (provider=bytedance)
    """

    api_key = get_bytedance_api_key()
    return {
        "base_url": FIXED_BYTEDANCE_ARK_BASE_URL,
        "api_key": api_key,
		"model": DEFAULT_BYTEDANCE_TEXT_MODEL_KEY,
    }


def get_codex_cfg() -> Dict[str, str]:
    """Return Codex config for OpenAI-compatible provider mode."""

    api_key = get_codex_api_key()
    return {
        "base_url": FIXED_BYTEDANCE_ARK_BASE_URL,
        "api_key": api_key,
        "model": DEFAULT_CODEX_MODEL_KEY,
    }


def get_jimeng_access_key_id() -> str:
    """Return Jimeng AccessKey ID.

    Source:
    - local encrypted DB storage only (provider=jimeng_access_key_id)
    """

    return _safe_db_get_plaintext_key("jimeng_access_key_id").strip()


def get_jimeng_secret_key() -> str:
    """Return Jimeng SecretAccessKey.

    Source:
    - local encrypted DB storage only (provider=jimeng_secret_key)
    """

    return _safe_db_get_plaintext_key("jimeng_secret_key").strip()
