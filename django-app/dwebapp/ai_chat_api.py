"""AI Chat APIs (DRF function-based views).

Endpoints (no trailing slashes; APPEND_SLASH=False):
- POST /api/chat/conversations
- POST /api/chat/conversations/{id}/messages
- POST /api/chat/conversations/{id}/messages:stream   (SSE)

Designed to be easy to read for rapid iteration.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from typing import Any, Dict, Generator, Iterable, List, Optional

from django.http import HttpRequest, HttpResponseNotAllowed, StreamingHttpResponse
from django.http.response import HttpResponseBase
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from . import deepseek_secrets
from .ai_prompts import build_messages


def _iso_now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _env_or_secret(name: str, fallback: str) -> str:
    v = os.environ.get(name)
    return v if v else fallback


def _deepseek_cfg() -> Dict[str, str]:
    base_url = _env_or_secret("DEEPSEEK_BASE_URL", deepseek_secrets.DEEPSEEK_BASE_URL).rstrip("/")
    api_key = _env_or_secret("DEEPSEEK_API_KEY", deepseek_secrets.DEEPSEEK_API_KEY)
    model = _env_or_secret("DEEPSEEK_MODEL", deepseek_secrets.DEEPSEEK_MODEL)
    return {"base_url": base_url, "api_key": api_key, "model": model}


def _agent_to_ui_text(delta: str, *, source_model: Optional[str] = None) -> Dict[str, Any]:
    return {
        "schemaVersion": 1,
        "type": "agentToUi/text",
        "id": str(uuid.uuid4()),
        "createdAt": _iso_now(),
        "source": {"agentName": "deepseek", "model": source_model} if source_model else {"agentName": "deepseek"},
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


def _agent_to_ui_task_status(phase: str, *, message: Optional[str] = None) -> Dict[str, Any]:
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
    return out


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


def _wrap_short_agent_to_ui(obj: Dict[str, Any], *, source_model: Optional[str] = None) -> Dict[str, Any]:
    """Accept short-form {type, payload, ...} and wrap into a full AgentToUI envelope."""

    # Normalize common chat shapes into a stable message type.
    payload_any: Any = obj.get("payload")
    if obj.get("type") == "agentToUi/chat" and isinstance(payload_any, dict):
        p = payload_any  # runtime-narrowed dict
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
    if source_model:
        out["source"] = {"agentName": "deepseek", "model": source_model}
    else:
        out["source"] = {"agentName": "deepseek"}
    meta = obj.get("meta")
    if isinstance(meta, dict):
        out["meta"] = meta
    return out


def _build_messages(
    content: str,
    context_pack: Any,
    response_mode: str,
    *,
    default_intent: str = "insert",
    viewport: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, str]]:
    return build_messages(
        content=content,
        context_pack=context_pack,
        response_mode=response_mode,
        default_intent=default_intent,
        viewport=viewport,
    )


def _openai_stream_chat(
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: List[Dict[str, str]],
    response_format: Optional[Dict[str, Any]] = None,
    timeout_s: int = 60,
) -> Iterable[str]:
    """Yield delta text from an OpenAI-compatible streaming endpoint.

    Uses stdlib urllib to avoid extra deps.
    Expected upstream response is SSE with lines: "data: {...}" and "data: [DONE]".
    """

    import urllib.request

    # DeepSeek docs: POST {base_url}/chat/completions
    # For OpenAI compatibility, base_url may be set to https://api.deepseek.com/v1
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

    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
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

            # OpenAI-compatible streaming shape
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
    timeout_s: int = 60,
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

    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        data = resp.read().decode("utf-8", errors="ignore")
    obj = json.loads(data)
    choices = obj.get("choices") or []
    if not choices:
        return ""
    msg = choices[0].get("message") or {}
    content = msg.get("content")
    return content if isinstance(content, str) else ""


@csrf_exempt
@api_view(["POST"])
def create_conversation(_: Request) -> Response:
    # MVP: stateless conversation creation (no DB yet)
    cid = str(uuid.uuid4())
    return Response({"id": cid, "createdAt": _iso_now()})


@csrf_exempt
@api_view(["POST"])
def send_message(request: Request, conversation_id: str) -> Response:
    data: Any = request.data
    body = data if isinstance(data, dict) else {}
    content = str(body.get("content") or "")
    context_pack = body.get("contextPack")
    provider = str(body.get("provider") or "deepseek")
    model_override = body.get("model")
    response_mode = str(body.get("responseMode") or "text")

    if not content.strip():
        return Response(_agent_to_ui_error("bad_request", "content is required"), status=400)

    if provider != "deepseek":
        return Response(_agent_to_ui_error("bad_request", f"unsupported provider: {provider}"), status=400)

    cfg = _deepseek_cfg()
    if not cfg["base_url"] or not cfg["api_key"] or not cfg["model"]:
        return Response(
            _agent_to_ui_error(
                "missing_config",
                "DeepSeek config missing. Please fill dwebapp/deepseek_secrets.py or set env vars.",
                details={"need": ["DEEPSEEK_BASE_URL", "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL"]},
            ),
            status=500,
        )

    model = str(model_override) if isinstance(model_override, str) and model_override else cfg["model"]
    msgs = _build_messages(content, context_pack, response_mode)

    try:
        # Provider-scoped feature flag: DeepSeek JSON Output
        use_json_output = response_mode == "agentToUi-json"
        response_format = {"type": "json_object"} if (provider == "deepseek" and use_json_output) else None

        text = _openai_chat(
            base_url=cfg["base_url"],
            api_key=cfg["api_key"],
            model=model,
            messages=msgs,
            response_format=response_format,
        )

        if use_json_output:
            if not text.strip():
                return Response(
                    _agent_to_ui_error(
                        "empty_content",
                        "DeepSeek JSON Output returned empty content; try adjusting prompt or max_tokens.",
                        details={"provider": provider, "responseMode": response_mode},
                    ),
                    status=502,
                )
            try:
                obj = json.loads(text)
            except Exception:
                return Response(
                    _agent_to_ui_error(
                        "bad_json",
                        "DeepSeek JSON Output did not return valid JSON.",
                        details={"provider": provider, "responseMode": response_mode, "raw": text[:2000]},
                    ),
                    status=502,
                )

            envs = obj.get("envelopes") if isinstance(obj, dict) else None
            if isinstance(envs, list) and envs:
                first = envs[0]
                if isinstance(first, dict):
                    env = first if _is_agent_to_ui_envelope(first) else _wrap_short_agent_to_ui(first, source_model=model)
                    return Response({"conversationId": conversation_id, "assistant": env})

        return Response({"conversationId": conversation_id, "assistant": _agent_to_ui_text(text, source_model=model)})
    except Exception as e:
        return Response(_agent_to_ui_error("upstream_error", str(e)), status=502)


@csrf_exempt
def stream_message(request: HttpRequest, conversation_id: str) -> HttpResponseBase:
    # NOTE: This endpoint is intentionally a plain Django view.
    # DRF's content negotiation may return 406 for `Accept: text/event-stream`.
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    try:
        raw = request.body.decode("utf-8") if request.body else ""
        data: Any = json.loads(raw) if raw else {}
    except Exception:
        data = {}
    body = data if isinstance(data, dict) else {}
    content = str(body.get("content") or "")
    context_pack = body.get("contextPack")
    viewport = body.get("viewport")
    provider = str(body.get("provider") or "deepseek")
    model_override = body.get("model")
    response_mode = str(body.get("responseMode") or "agentToUi-jsonl")

    if not content.strip():
        def bad_req() -> Generator[bytes, None, None]:
            yield _sse("error", {"message": "content is required"}).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

        resp = StreamingHttpResponse(bad_req(), content_type="text/event-stream")
        _apply_sse_headers(resp)
        return resp

    if provider != "deepseek":
        def bad_provider() -> Generator[bytes, None, None]:
            yield _sse("error", {"message": f"unsupported provider: {provider}"}).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

        resp = StreamingHttpResponse(bad_provider(), content_type="text/event-stream")
        _apply_sse_headers(resp)
        return resp

    cfg = _deepseek_cfg()
    if not cfg["base_url"] or not cfg["api_key"] or not cfg["model"]:
        def missing_cfg() -> Generator[bytes, None, None]:
            yield _sse(
                "msg",
                _agent_to_ui_error(
                    "missing_config",
                    "DeepSeek config missing. Please fill dwebapp/deepseek_secrets.py or set env vars.",
                    details={"need": ["DEEPSEEK_BASE_URL", "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL"]},
                ),
            ).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

        resp = StreamingHttpResponse(missing_cfg(), content_type="text/event-stream")
        _apply_sse_headers(resp)
        return resp

    model = str(model_override) if isinstance(model_override, str) and model_override else cfg["model"]
    viewport_dict = viewport if isinstance(viewport, dict) else None
    msgs = _build_messages(content, context_pack, response_mode, default_intent="insert", viewport=viewport_dict)

    def gen() -> Generator[bytes, None, None]:
        current_phase: Optional[str] = None

        def emit_phase(phase: str, *, message: Optional[str] = None) -> Generator[bytes, None, None]:
            nonlocal current_phase
            if current_phase == phase:
                return
            current_phase = phase
            yield _sse("msg", _agent_to_ui_task_status(phase, message=message)).encode("utf-8")

        try:
            for out in emit_phase("started", message="已开始"):
                yield out

            # DeepSeek JSON Output mode: one-shot JSON, then emit envelopes as SSE msgs.
            if response_mode == "agentToUi-json":
                buf = ""
                search_pos = 0
                array_start: Optional[int] = None
                scan_pos = 0
                in_string = False
                escape = False
                depth = 0
                obj_start: Optional[int] = None

                seen_ids: set[str] = set()

                saw_any_delta = False
                emitted_any = False

                def drive_phase_by_type(t0: Optional[str]) -> Generator[bytes, None, None]:
                    if t0 in ("agentToUi/text", "agentToUi/chatMessage"):
                        for out in emit_phase("writing", message="生成说明"):
                            yield out
                    elif t0 == "agentToUi/componentTemplate":
                        for out in emit_phase("template", message="生成组件"):
                            yield out
                    else:
                        # default
                        for out in emit_phase("writing", message="生成内容"):
                            yield out

                def try_emit_from_buffer() -> Generator[bytes, None, None]:
                    nonlocal buf, search_pos, array_start, scan_pos, in_string, escape, depth, obj_start, emitted_any

                    # 1) locate envelopes array start
                    if array_start is None:
                        # Find "envelopes" key then the first '[' after it.
                        k = buf.find('"envelopes"', search_pos)
                        if k == -1:
                            # keep buffer bounded
                            if len(buf) > 200_000:
                                buf = buf[-50_000:]
                                search_pos = 0
                            return
                        b = buf.find('[', k)
                        if b == -1:
                            search_pos = max(0, k)
                            return
                        array_start = b + 1
                        scan_pos = array_start

                    # 2) scan for complete JSON objects inside envelopes array
                    i = scan_pos
                    while i < len(buf):
                        ch = buf[i]
                        if in_string:
                            if escape:
                                escape = False
                            elif ch == '\\':
                                escape = True
                            elif ch == '"':
                                in_string = False
                            i += 1
                            continue

                        if ch == '"':
                            in_string = True
                            i += 1
                            continue

                        if ch == '{':
                            if depth == 0:
                                obj_start = i
                            depth += 1
                            i += 1
                            continue

                        if ch == '}':
                            if depth > 0:
                                depth -= 1
                                if depth == 0 and obj_start is not None:
                                    obj_text = buf[obj_start : i + 1]
                                    obj_start = None
                                    try:
                                        env0 = json.loads(obj_text)
                                    except Exception:
                                        # Keep scanning; we may have split or malformed object.
                                        # Do not advance scan_pos past this '}' yet.
                                        depth = 0
                                        return
                                    if isinstance(env0, dict):
                                        if _is_agent_to_ui_envelope(env0):
                                            env_id = env0.get("id")
                                            if isinstance(env_id, str) and env_id:
                                                if env_id in seen_ids:
                                                    # Skip duplicates to avoid repeated UI side effects.
                                                    continue
                                                seen_ids.add(env_id)
                                            t0 = env0.get("type") if isinstance(env0.get("type"), str) else None
                                            for out in drive_phase_by_type(t0):
                                                yield out
                                            yield _sse("msg", env0).encode("utf-8")
                                            emitted_any = True
                                        elif isinstance(env0.get("type"), str) and "payload" in env0:
                                            # Short-form messages should also carry id; if present, dedupe.
                                            env_id = env0.get("id")
                                            if isinstance(env_id, str) and env_id:
                                                if env_id in seen_ids:
                                                    continue
                                                seen_ids.add(env_id)

                                            wrapped = _wrap_short_agent_to_ui(env0, source_model=model)
                                            t0 = wrapped.get("type") if isinstance(wrapped.get("type"), str) else None
                                            for out in drive_phase_by_type(t0):
                                                yield out
                                            yield _sse("msg", wrapped).encode("utf-8")
                                            emitted_any = True

                                    # We can safely drop everything up to i+1 to keep buffer small.
                                    buf = buf[i + 1 :]
                                    # Reset scan to start of remaining buffer.
                                    search_pos = 0
                                    array_start = 0  # since buf is now inside array content
                                    scan_pos = 0
                                    i = 0
                                    in_string = False
                                    escape = False
                                    depth = 0
                                    continue
                            i += 1
                            continue

                        # If envelopes array ends, we can stop.
                        if ch == ']':
                            scan_pos = i
                            return

                        i += 1

                    scan_pos = i

                for out in emit_phase("streaming", message="连接模型"):
                    yield out

                for delta in _openai_stream_chat(
                    base_url=cfg["base_url"],
                    api_key=cfg["api_key"],
                    model=model,
                    messages=msgs,
                    response_format={"type": "json_object"},
                ):
                    if not saw_any_delta:
                        saw_any_delta = True
                    buf += delta
                    for out in try_emit_from_buffer():
                        yield out

                if not saw_any_delta:
                    yield _sse(
                        "msg",
                        _agent_to_ui_error(
                            "empty_content",
                            "DeepSeek JSON Output returned empty content; try adjusting prompt or max_tokens.",
                            details={"provider": provider, "responseMode": response_mode},
                        ),
                    ).encode("utf-8")
                elif not emitted_any:
                    # Fallback: if we couldn't extract any envelope, surface raw tail.
                    tail = buf.strip()
                    if tail:
                        yield _sse("msg", _agent_to_ui_text(tail[:8000], source_model=model)).encode("utf-8")

                for out in emit_phase("done", message="完成"):
                    yield out
                yield _sse("done", "{}").encode("utf-8")
                return

            if response_mode == "agentToUi-jsonl":
                buf = ""
                decoder = json.JSONDecoder()

                # Track emitted envelopes so we can ask the model to continue after a parse error.
                seen_ids: set[str] = set()
                emitted: list[dict[str, str]] = []  # [{"id":..., "type":...}, ...]
                last_discarded_prefix_preview: str | None = None
                flushed_buffer_due_to_size: bool = False

                saw_any_delta = False

                def _build_tail_debug_details(*, tail: str) -> dict[str, Any]:
                    import hashlib

                    tail_safe = tail
                    # Keep payload bounded; do not stream huge raw blobs.
                    if len(tail_safe) > 8000:
                        tail_safe = tail_safe[:8000]
                    return {
                        "provider": provider,
                        "responseMode": response_mode,
                        "model": model,
                        "tailLen": len(tail),
                        "tailPreview": tail_safe,
                        "tailSha256": hashlib.sha256(tail.encode("utf-8", errors="ignore")).hexdigest(),
                        "discardedPrefixPreview": last_discarded_prefix_preview,
                        "flushedBufferDueToSize": flushed_buffer_due_to_size,
                        "emittedEnvelopes": emitted[-30:],
                    }

                def _build_repair_messages(*, tail: str) -> list[dict[str, str]]:
                    # Ask the model to continue without terminating the conversation.
                    tail_preview = tail
                    if len(tail_preview) > 2000:
                        tail_preview = tail_preview[:2000]
                    emitted_lines = "\n".join([f"- {m.get('type')} id={m.get('id')}" for m in emitted[-30:]])
                    repair_sys = (
                        "你正在进行一次‘后端自动纠错续写’：上一次输出因 JSONL 解析失败而被后端中止解析。"
                        "你必须继续完成用户任务，且必须严格只输出 JSONL（每行一个完整 AgentToUI envelope JSON 对象），"
                        "禁止输出任何非 JSON 内容。"
                    )
                    repair_user = (
                        "上一次输出触发 jsonl_parse_error。以下是无法解析的残留内容预览（仅供你定位问题；不要原样输出）：\n"
                        f"{tail_preview}\n\n"
                        "以下是已成功发送到前端的最近消息（避免重复）：\n"
                        f"{emitted_lines if emitted_lines else '(none)'}\n\n"
                        "现在请：\n"
                        "1) 先输出一条 agentToUi/chatMessage 简短说明你将纠正并继续；\n"
                        "2) 然后继续输出你原本应该输出的剩余消息（如 componentTemplate/applyFilter/patchNode 等）；\n"
                        "3) 严格遵守 JSONL 约束，不要输出任何额外文本。"
                    )

                    # Append to the original conversation.
                    return [
                        *msgs,
                        {"role": "system", "content": repair_sys},
                        {"role": "user", "content": repair_user},
                    ]

                def try_emit_from_buffer() -> Generator[bytes, None, None]:
                    nonlocal buf, last_discarded_prefix_preview, flushed_buffer_due_to_size
                    while True:
                        s = buf.lstrip()
                        if not s:
                            buf = ""
                            return

                        # Strict JSONL-only: if model leaks any non-JSON text (e.g. Chinese prose)
                        # before a JSON object, discard it until the next '{'.
                        if s and not s.startswith("{"):
                            brace = s.find("{")
                            if brace == -1:
                                # No JSON object start yet; keep buffer bounded but don't emit text.
                                if len(s) > 50_000:
                                    last_discarded_prefix_preview = s[:2000]
                                    flushed_buffer_due_to_size = True
                                    buf = ""
                                return
                            # Drop everything before the next object start.
                            last_discarded_prefix_preview = s[: min(brace, 2000)]
                            buf = s[brace:]
                            continue
                        try:
                            obj, end = decoder.raw_decode(s)
                        except json.JSONDecodeError:
                            # Need more data.
                            return
                        consumed = (len(buf) - len(s)) + end
                        buf = buf[consumed:]

                        if _is_agent_to_ui_envelope(obj):
                            try:
                                mid = obj.get("id")
                                if isinstance(mid, str) and mid:
                                    if mid in seen_ids:
                                        continue
                                    seen_ids.add(mid)
                                t_emit = obj.get("type")
                                if isinstance(mid, str) and isinstance(t_emit, str):
                                    emitted.append({"id": mid, "type": t_emit})
                            except Exception:
                                pass
                            t0 = obj.get("type")
                            if t0 in ("agentToUi/text", "agentToUi/chatMessage"):
                                for out in emit_phase("writing", message="生成说明"):
                                    yield out
                            elif t0 == "agentToUi/componentTemplate":
                                for out in emit_phase("template", message="生成组件"):
                                    yield out
                            yield _sse("msg", obj).encode("utf-8")
                            continue

                        if isinstance(obj, dict) and isinstance(obj.get("type"), str) and "payload" in obj:
                            t = obj.get("type")
                            if isinstance(t, str) and t.startswith("agentToUi/"):
                                try:
                                    mid2 = obj.get("id")
                                    if isinstance(mid2, str) and mid2:
                                        if mid2 in seen_ids:
                                            continue
                                        seen_ids.add(mid2)
                                    if isinstance(mid2, str) and isinstance(t, str):
                                        emitted.append({"id": mid2, "type": t})
                                except Exception:
                                    pass
                                if t in ("agentToUi/text", "agentToUi/chatMessage"):
                                    for out in emit_phase("writing", message="生成说明"):
                                        yield out
                                elif t == "agentToUi/componentTemplate":
                                    for out in emit_phase("template", message="生成组件"):
                                        yield out
                                yield _sse("msg", _wrap_short_agent_to_ui(obj, source_model=model)).encode("utf-8")
                                continue

                        # Unexpected JSON shape: do NOT stringify JSON into user-visible text.
                        # Surface a structured error instead.
                        yield _sse(
                            "msg",
                            _agent_to_ui_error(
                                "unexpected_json_shape",
                                "模型输出了非 AgentToUI 的 JSON 对象，已忽略。",
                                details={"provider": provider, "responseMode": response_mode},
                            ),
                        ).encode("utf-8")

                for delta in _openai_stream_chat(
                    base_url=cfg["base_url"],
                    api_key=cfg["api_key"],
                    model=model,
                    messages=msgs,
                ):
                    if not saw_any_delta:
                        saw_any_delta = True
                        for out in emit_phase("streaming", message="连接模型"):
                            yield out
                    buf += delta
                    for out in try_emit_from_buffer():
                        yield out

                tail = buf.strip()
                if tail:
                    # Flush tail: try to emit any remaining JSON object.
                    for out in try_emit_from_buffer():
                        yield out

                    # Still have tail but cannot parse: fallback.
                    tail2 = buf.strip()
                    if tail2:
                        # Best-effort recovery FIRST: ask the model to correct the error and continue.
                        # If recovery succeeds, do NOT emit agentToUi/error (to avoid interrupting UI flow).
                        emitted_before_repair = len(emitted)
                        for out in emit_phase("streaming", message="检测到输出残留，尝试让模型修复并继续"):
                            yield out

                        # Reset buffer and parse the repair stream.
                        buf = ""
                        repair_msgs = _build_repair_messages(tail=tail2)
                        repaired_any = False
                        for delta2 in _openai_stream_chat(
                            base_url=cfg["base_url"],
                            api_key=cfg["api_key"],
                            model=model,
                            messages=repair_msgs,
                        ):
                            repaired_any = True
                            buf += delta2
                            for out in try_emit_from_buffer():
                                yield out

                        # Flush whatever we can after repair.
                        for out in try_emit_from_buffer():
                            yield out

                        repair_added_messages = len(emitted) > emitted_before_repair

                        if repair_added_messages:
                            # Non-fatal note for operator; avoid emitting an error envelope that may stop the UI.
                            yield _sse(
                                "msg",
                                _agent_to_ui_task_status("repair", message="检测到模型输出被截断/残留，后端已自动修复并继续"),
                            ).encode("utf-8")

                            # If repair still leaves tail, drop it but only warn (do not error).
                            tail4 = buf.strip()
                            if repaired_any and tail4:
                                yield _sse(
                                    "msg",
                                    _agent_to_ui_task_status(
                                        "repair_warning",
                                        message="修复续写后仍有少量残留内容被丢弃（未中断任务）",
                                    ),
                                ).encode("utf-8")
                        else:
                            # Recovery failed: emit a structured error WITH tail preview for debugging.
                            yield _sse(
                                "msg",
                                _agent_to_ui_error(
                                    "jsonl_parse_error",
                                    "模型输出包含无法解析的残留内容（已丢弃）。",
                                    details=_build_tail_debug_details(tail=tail2),
                                ),
                            ).encode("utf-8")
            else:
                saw_any_delta = False
                for delta in _openai_stream_chat(
                    base_url=cfg["base_url"],
                    api_key=cfg["api_key"],
                    model=model,
                    messages=msgs,
                ):
                    if not saw_any_delta:
                        saw_any_delta = True
                        for out in emit_phase("streaming", message="连接模型"):
                            yield out
                        for out in emit_phase("writing", message="生成说明"):
                            yield out
                    yield _sse("msg", _agent_to_ui_text(delta, source_model=model)).encode("utf-8")

            for out in emit_phase("done", message="完成"):
                yield out
            yield _sse("done", "{}").encode("utf-8")
        except (GeneratorExit, BrokenPipeError):
            # Client disconnected / aborted.
            return
        except Exception as e:
            for out in emit_phase("error", message="发生错误"):
                yield out
            yield _sse("msg", _agent_to_ui_error("upstream_error", str(e))).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp


def _sse(event: str, data: Any) -> str:
    if isinstance(data, str):
        payload = data
    else:
        payload = json.dumps(data, ensure_ascii=False)
    # One event with one data block
    return f"event: {event}\n" + "\n".join([f"data: {line}" for line in payload.splitlines()]) + "\n\n"


def _apply_sse_headers(resp: StreamingHttpResponse) -> None:
    resp["Cache-Control"] = "no-cache"
    resp["X-Accel-Buffering"] = "no"

