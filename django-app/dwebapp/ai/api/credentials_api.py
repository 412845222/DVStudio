from __future__ import annotations

import json
from typing import Any, Dict

from django.http import HttpRequest, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from dwebapp.models import ApiKeySecret


def _json_body(request: HttpRequest) -> Dict[str, Any]:
    try:
        if not request.body:
            return {}
        return json.loads(request.body.decode("utf-8"))
    except Exception:
        return {}


def _provider_status(provider: str) -> Dict[str, Any]:
    row = ApiKeySecret.objects.filter(provider=provider).first()
    if not row:
        return {"hasKey": False, "fingerprint": "", "updatedAt": None}
    return {
        "hasKey": bool((row.key_encrypted or "").strip()),
        "fingerprint": str(row.key_fingerprint or ""),
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
    }


@csrf_exempt
def credentials_status(_: HttpRequest) -> JsonResponse:
    try:
        return JsonResponse(
            {
                "ok": True,
                "providers": {
                    "deepseek": _provider_status("deepseek"),
                    "gemini": _provider_status("gemini"),
                },
                "serverTime": timezone.now().isoformat(),
            }
        )
    except Exception as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=500)


@csrf_exempt
def upsert_credentials(request: HttpRequest) -> JsonResponse:
    if request.method != "POST":
        return JsonResponse({"ok": False, "error": "Method not allowed"}, status=405)

    body = _json_body(request)
    deepseek_key = body.get("deepseekApiKey")
    gemini_key = body.get("geminiApiKey")

    try:
        changed = []
        if deepseek_key is not None:
            row, _ = ApiKeySecret.objects.get_or_create(provider="deepseek")
            row.set_plaintext_key(str(deepseek_key or ""))
            row.save(update_fields=["key_encrypted", "key_fingerprint", "updated_at"])
            changed.append("deepseek")

        if gemini_key is not None:
            row, _ = ApiKeySecret.objects.get_or_create(provider="gemini")
            row.set_plaintext_key(str(gemini_key or ""))
            row.save(update_fields=["key_encrypted", "key_fingerprint", "updated_at"])
            changed.append("gemini")

        return JsonResponse({"ok": True, "changed": changed, "providers": {
            "deepseek": _provider_status("deepseek"),
            "gemini": _provider_status("gemini"),
        }})
    except Exception as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=500)
