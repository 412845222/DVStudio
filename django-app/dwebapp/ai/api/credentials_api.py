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
                    "bytedance": _provider_status("bytedance"),
                    "codex": _provider_status("codex"),
                    "meshy": _provider_status("meshy"),
                    "jimengAccessKeyId": _provider_status("jimeng_access_key_id"),
                    "jimengSecretKey": _provider_status("jimeng_secret_key"),
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
    bytedance_key = body.get("bytedanceApiKey")
    codex_key = body.get("codexApiKey")
    meshy_key = body.get("meshyApiKey")
    jimeng_access_key_id = body.get("jimengAccessKeyId")
    jimeng_secret_key = body.get("jimengSecretKey")

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

        if bytedance_key is not None:
            row, _ = ApiKeySecret.objects.get_or_create(provider="bytedance")
            row.set_plaintext_key(str(bytedance_key or ""))
            row.save(update_fields=["key_encrypted", "key_fingerprint", "updated_at"])
            changed.append("bytedance")

        if codex_key is not None:
            row, _ = ApiKeySecret.objects.get_or_create(provider="codex")
            row.set_plaintext_key(str(codex_key or ""))
            row.save(update_fields=["key_encrypted", "key_fingerprint", "updated_at"])
            changed.append("codex")

        if meshy_key is not None:
            row, _ = ApiKeySecret.objects.get_or_create(provider="meshy")
            row.set_plaintext_key(str(meshy_key or ""))
            row.save(update_fields=["key_encrypted", "key_fingerprint", "updated_at"])
            changed.append("meshy")

        if jimeng_access_key_id is not None:
            row, _ = ApiKeySecret.objects.get_or_create(provider="jimeng_access_key_id")
            row.set_plaintext_key(str(jimeng_access_key_id or ""))
            row.save(update_fields=["key_encrypted", "key_fingerprint", "updated_at"])
            changed.append("jimengAccessKeyId")

        if jimeng_secret_key is not None:
            row, _ = ApiKeySecret.objects.get_or_create(provider="jimeng_secret_key")
            row.set_plaintext_key(str(jimeng_secret_key or ""))
            row.save(update_fields=["key_encrypted", "key_fingerprint", "updated_at"])
            changed.append("jimengSecretKey")

        return JsonResponse({"ok": True, "changed": changed, "providers": {
            "deepseek": _provider_status("deepseek"),
            "gemini": _provider_status("gemini"),
            "bytedance": _provider_status("bytedance"),
            "codex": _provider_status("codex"),
            "meshy": _provider_status("meshy"),
            "jimengAccessKeyId": _provider_status("jimeng_access_key_id"),
            "jimengSecretKey": _provider_status("jimeng_secret_key"),
        }})
    except Exception as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=500)
