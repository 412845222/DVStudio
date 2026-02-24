from __future__ import annotations

from pathlib import Path

from django.http import HttpRequest, HttpResponse


def user_agreement_and_security_md(_: HttpRequest) -> HttpResponse:
    """Serve the local markdown document via HTTP.

    This is intended for local/Electron runtime to display the agreement content.
    """

    here = Path(__file__).resolve().parent
    doc = here / "user_agreement_and_security.md"
    text = ""
    try:
        text = doc.read_text(encoding="utf-8")
    except Exception:
        text = "# 用户协议与安全声明\n\n协议文件缺失或无法读取。"

    resp = HttpResponse(text, content_type="text/markdown; charset=utf-8")
    # Local app: avoid caching so updates reflect immediately.
    resp["Cache-Control"] = "no-store"
    return resp
