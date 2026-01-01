"""Sample API views for PageMaker to talk to."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict

from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt


def health(_: HttpRequest) -> JsonResponse:
    return JsonResponse({"status": "ok", "timestamp": datetime.utcnow().isoformat() + "Z"})


@csrf_exempt
def echo(request: HttpRequest) -> JsonResponse: 
    if request.method == "POST":
        try:
            payload: Dict[str, Any] = json.loads(request.body.decode("utf-8")) if request.body else {}
        except json.JSONDecodeError:
            payload = {"raw": request.body.decode("utf-8", errors="ignore")}
    else:
        payload = dict(request.GET)
    return JsonResponse({"received": payload, "method": request.method})
