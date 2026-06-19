"""Shared utilities for chat APIs.

This module is extracted from chat_api.py to keep the public API stable
while reducing file size.
"""

from __future__ import annotations

import datetime as _dt
import json
import uuid
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional

from django.http import StreamingHttpResponse

from ...credentials_store import get_bytedance_text_cfg, get_deepseek_cfg


def _iso_now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _deepseek_cfg() -> Dict[str, str]:
    return get_deepseek_cfg()


def _bytedance_text_cfg() -> Dict[str, str]:
    return get_bytedance_text_cfg()


def _agent_to_ui_text(delta: str, *, source_model: Optional[str] = None, source_name: str = "deepseek") -> Dict[str, Any]:
    return {
        "schemaVersion": 1,
        "type": "agentToUi/text",
        "id": str(uuid.uuid4()),
        "createdAt": _iso_now(),
        "source": {"agentName": source_name, "model": source_model} if source_model else {"agentName": source_name},
        "payload": {"text": delta},
    }


def _agent_to_ui_error(code: str, message: str, *, details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "schemaVersion": 1,
        "type": "agentToUi/error",
        "id": str(uuid.uuid4()),
        "createdAt": _iso_now(),
        "source": {"agentName": "backend"},
        "payload": {"code": code, "message": message},
    }
    if details is not None:
        out["payload"]["details"] = details
    return out


def _agent_to_ui_task_status(phase: str, *, message: Optional[str] = None, details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "schemaVersion": 1,
        "type": "agentToUi/taskStatus",
        "id": str(uuid.uuid4()),
        "createdAt": _iso_now(),
        "source": {"agentName": "backend"},
        "payload": {"phase": phase},
    }
    if message:
        out["payload"]["message"] = message
    if details is not None:
        out["payload"]["details"] = details
    return out


def _agent_to_ui_chat_message(content: str, *, source_model: Optional[str] = None, source_name: str = "deepseek") -> Dict[str, Any]:
    return {
        "schemaVersion": 1,
        "type": "agentToUi/chatMessage",
        "id": str(uuid.uuid4()),
        "createdAt": _iso_now(),
        "source": {"agentName": source_name, "model": source_model} if source_model else {"agentName": source_name},
        "payload": {"content": content},
    }


def _agent_to_ui_subtitle_summary_delta(section: str, data: Any) -> Dict[str, Any]:
    return {
        "schemaVersion": 1,
        "type": "agentToUi/subtitleSummaryDelta",
        "id": str(uuid.uuid4()),
        "createdAt": _iso_now(),
        "source": {"agentName": "backend"},
        "payload": {"section": section, "data": data},
    }


def _is_agent_to_ui_envelope(v: Any) -> bool:
    if not isinstance(v, dict):
        return False
    if v.get("schemaVersion") != 1:
        return False
    if not isinstance(v.get("type"), str):
        return False
    if not isinstance(v.get("id"), str):
        return False
    if not isinstance(v.get("createdAt"), str):
        return False
    if "payload" not in v:
        return False
    return True


def _wrap_short_agent_to_ui(
    obj: Dict[str, Any], *, source_model: Optional[str] = None, source_name: str = "deepseek"
) -> Dict[str, Any]:
    """Accept short-form {type, payload, ...} and wrap into a full AgentToUI envelope."""

    payload_any: Any = obj.get("payload")
    if obj.get("type") == "agentToUi/chat" and isinstance(payload_any, dict):
        p = payload_any
        content_val = p.get("content")
        msg_val = content_val if isinstance(content_val, str) else p.get("message")
        if isinstance(msg_val, str):
            obj = {"type": "agentToUi/chatMessage", "payload": {"content": msg_val}}

    out: Dict[str, Any] = {
        "schemaVersion": 1,
        "type": obj.get("type"),
        "id": str(uuid.uuid4()),
        "createdAt": _iso_now(),
        "payload": obj.get("payload"),
    }
    out["source"] = {"agentName": source_name, "model": source_model} if source_model else {"agentName": source_name}
    meta = obj.get("meta")
    if isinstance(meta, dict):
        out["meta"] = meta
    return out


def _openai_stream_chat(
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: List[Dict[str, str]],
    response_format: Optional[Dict[str, Any]] = None,
    timeout_s: Optional[float] = 60,
) -> Iterable[str]:
    """Yield delta text from an OpenAI-compatible streaming endpoint."""

    import urllib.request

    url = f"{base_url}/chat/completions"
    body: Dict[str, Any] = {"model": model, "messages": messages, "stream": True}
    if response_format is not None:
        body["response_format"] = response_format
    req_body = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=req_body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "Authorization": f"Bearer {api_key}",
        },
    )

    open_kwargs: Dict[str, Any] = {}
    if timeout_s is not None and float(timeout_s) > 0:
        open_kwargs["timeout"] = float(timeout_s)

    with urllib.request.urlopen(req, **open_kwargs) as resp:
        for raw in resp:
            try:
                line = raw.decode("utf-8", errors="ignore").strip()
            except Exception:
                continue
            if not line:
                continue
            if not line.startswith("data:"):
                continue
            data = line[len("data:") :].strip()
            if data == "[DONE]":
                break
            try:
                obj = json.loads(data)
            except json.JSONDecodeError:
                continue

            try:
                choices = obj.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                content = delta.get("content")
                if isinstance(content, str) and content:
                    yield content
            except Exception:
                continue


def _openai_chat(
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: List[Dict[str, str]],
    response_format: Optional[Dict[str, Any]] = None,
    timeout_s: Optional[float] = 60,
) -> str:
    import urllib.request

    url = f"{base_url}/chat/completions"
    body: Dict[str, Any] = {"model": model, "messages": messages, "stream": False}
    if response_format is not None:
        body["response_format"] = response_format
    req_body = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=req_body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )

    open_kwargs: Dict[str, Any] = {}
    if timeout_s is not None and float(timeout_s) > 0:
        open_kwargs["timeout"] = float(timeout_s)

    with urllib.request.urlopen(req, **open_kwargs) as resp:
        data = resp.read().decode("utf-8", errors="ignore")
    obj = json.loads(data)
    choices = obj.get("choices") or []
    if not choices:
        return ""
    msg = choices[0].get("message") or {}
    content = msg.get("content")
    return content if isinstance(content, str) else ""


def _sse(event: str, data: Any) -> str:
    payload = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False)
    return f"event: {event}\n" + "\n".join([f"data: {line}" for line in payload.splitlines()]) + "\n\n"


def _apply_sse_headers(resp: StreamingHttpResponse) -> None:
    # SSE 必需的响应头：告诉浏览器和代理不要缓冲这个流。
    resp["Cache-Control"] = "no-cache, no-transform"
    resp["X-Accel-Buffering"] = "no"
    # 显式声明 text/event-stream，确保浏览器正确识别为事件流。
    if not resp.get("Content-Type"):
        resp["Content-Type"] = "text/event-stream; charset=utf-8"
    # 注意：不要设置 Connection: keep-alive
    # Connection 是 hop-by-hop header，Django WSGI server 会拒绝它导致 500 错误。
    # 现代浏览器和 HTTP/1.1 默认就是 keep-alive，不需要显式声明。
