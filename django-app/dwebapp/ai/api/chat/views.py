"""Views for chat APIs.

Extracted from chat_api.py.
"""

from __future__ import annotations

import datetime as _dt
import json
import uuid
from typing import Any, Dict, Generator, List, Optional

from django.http import HttpRequest, HttpResponseNotAllowed, StreamingHttpResponse
from django.http.response import HttpResponseBase
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from ...skills.protocol.message_builder import build_messages

from .utils import (
    _agent_to_ui_error,
    _agent_to_ui_task_status,
    _agent_to_ui_text,
    _apply_sse_headers,
    _deepseek_cfg,
    _is_agent_to_ui_envelope,
    _openai_chat,
    _openai_stream_chat,
    _sse,
    _wrap_short_agent_to_ui,
    _iso_now,
)


_ALLOWED_TEMPLATE_PARAM_TYPES = {"string", "number", "boolean", "color", "asset:image"}


def _sanitize_component_template_params(template: Any) -> Any:
    """Best-effort sanitize ComponentTemplate.params.

    Front-end validates that every params[] item has a non-empty string key.
    Some models occasionally emit params entries without key; we drop those
    entries to keep templates insertable.
    """

    if not isinstance(template, dict):
        return template

    raw_params = template.get("params")
    if raw_params is None:
        # keep stable shape
        out = dict(template)
        out["params"] = []
        return out
    if not isinstance(raw_params, list):
        out = dict(template)
        out["params"] = []
        return out

    seen: set[str] = set()
    params_out: List[Dict[str, Any]] = []
    for p in raw_params:
        if not isinstance(p, dict):
            continue
        key = p.get("key")
        if not isinstance(key, str) or not key.strip():
            continue
        k = key.strip()
        if k in seen:
            continue
        seen.add(k)
        pp = dict(p)
        pp["key"] = k
        t0 = pp.get("type")
        if not isinstance(t0, str) or t0.strip() not in _ALLOWED_TEMPLATE_PARAM_TYPES:
            pp["type"] = "string"
        params_out.append(pp)

    out = dict(template)
    out["params"] = params_out
    return out


def _postprocess_component_template_envelope(env: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(env, dict):
        return env
    if env.get("type") != "agentToUi/componentTemplate":
        return env
    payload = env.get("payload")
    if not isinstance(payload, dict):
        return env
    tpl = payload.get("template")
    if not isinstance(tpl, dict):
        return env

    tpl2 = _sanitize_component_template_params(tpl)
    if tpl2 is tpl:
        return env

    out = dict(env)
    p2 = dict(payload)
    p2["template"] = tpl2
    out["payload"] = p2
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


@csrf_exempt
@api_view(["POST"])
def create_conversation(_: Request) -> Response:
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
                "DeepSeek API Key missing. Please set it in Settings (encrypted DB), or set env var DEEPSEEK_API_KEY.",
                details={"need": ["DEEPSEEK_API_KEY"]},
            ),
            status=500,
        )

    model = str(model_override) if isinstance(model_override, str) and model_override else cfg["model"]
    msgs = _build_messages(content, context_pack, response_mode)

    try:
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
                    env = _postprocess_component_template_envelope(env)
                    return Response({"conversationId": conversation_id, "assistant": env})

        return Response({"conversationId": conversation_id, "assistant": _agent_to_ui_text(text, source_model=model)})
    except Exception as e:
        return Response(_agent_to_ui_error("upstream_error", str(e)), status=502)


@csrf_exempt
def stream_message(request: HttpRequest, conversation_id: str) -> HttpResponseBase:
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
                    "DeepSeek API Key missing. Please set it in Settings (encrypted DB), or set env var DEEPSEEK_API_KEY.",
                    details={"need": ["DEEPSEEK_API_KEY"]},
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

            if response_mode == "agentToUi-jsonl":
                import json as _json

                buf = ""
                decoder = _json.JSONDecoder()
                saw_any_delta = False
                emitted_any = False

                def _now_iso_z() -> str:
                    return _dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

                def _ensure_agent_to_ui_envelope_fields(obj: Dict[str, Any]) -> Dict[str, Any]:
                    out = dict(obj)
                    out["schemaVersion"] = 1
                    if not isinstance(out.get("id"), str) or not str(out.get("id") or "").strip():
                        out["id"] = str(uuid.uuid4())
                    if not isinstance(out.get("createdAt"), str) or not str(out.get("createdAt") or "").strip():
                        out["createdAt"] = _now_iso_z()
                    src = out.get("source")
                    if (
                        not isinstance(src, dict)
                        or not isinstance(src.get("agentName"), str)
                        or not str(src.get("agentName") or "").strip()
                    ):
                        out["source"] = {"agentName": provider, "model": model}
                    return out

                def _coerce_to_agent_to_ui(obj: Any) -> Optional[Dict[str, Any]]:
                    if not isinstance(obj, dict):
                        return None
                    t0 = obj.get("type")
                    if isinstance(t0, str) and t0.startswith("agentToUi/") and "payload" in obj:
                        return _ensure_agent_to_ui_envelope_fields(obj)
                    if isinstance(obj.get("type"), str) and "payload" in obj:
                        return _ensure_agent_to_ui_envelope_fields(_wrap_short_agent_to_ui(obj, source_model=model))
                    return None

                def drive_phase_by_type(t0: Optional[str]) -> Generator[bytes, None, None]:
                    if t0 in ("agentToUi/text", "agentToUi/chatMessage"):
                        for out in emit_phase("writing", message="生成说明"):
                            yield out
                    elif t0 == "agentToUi/componentTemplate":
                        for out in emit_phase("template", message="生成组件"):
                            yield out
                    else:
                        for out in emit_phase("writing", message="生成内容"):
                            yield out

                def try_emit_from_buffer() -> Generator[bytes, None, None]:
                    nonlocal buf, emitted_any
                    while True:
                        s = buf.lstrip()
                        if not s:
                            buf = ""
                            return

                        # Strict JSONL-only: discard any non-JSON prefix until the next '{'.
                        if not s.startswith("{"):
                            brace = s.find("{")
                            if brace == -1:
                                if len(s) > 50_000:
                                    buf = ""
                                return
                            buf = s[brace:]
                            continue

                        try:
                            obj, end = decoder.raw_decode(s)
                        except _json.JSONDecodeError:
                            return

                        consumed = (len(buf) - len(s)) + end
                        buf = buf[consumed:]

                        msg_obj = _coerce_to_agent_to_ui(obj)
                        if msg_obj is None:
                            yield _sse(
                                "msg",
                                _agent_to_ui_error(
                                    "invalid_jsonl_object",
                                    "Model emitted an unsupported JSON object in JSONL stream.",
                                    details={"preview": str(obj)[:2000]},
                                ),
                            ).encode("utf-8")
                            continue

                        # Best-effort hardening: prevent invalid ComponentTemplate.params[] from breaking insertion.
                        msg_obj = _postprocess_component_template_envelope(msg_obj)

                        t0 = msg_obj.get("type") if isinstance(msg_obj.get("type"), str) else None
                        for out in drive_phase_by_type(t0):
                            yield out
                        yield _sse("msg", msg_obj).encode("utf-8")
                        emitted_any = True

                for out in emit_phase("streaming", message="连接模型"):
                    yield out

                for delta in _openai_stream_chat(
                    base_url=cfg["base_url"],
                    api_key=cfg["api_key"],
                    model=model,
                    messages=msgs,
                ):
                    if not saw_any_delta:
                        saw_any_delta = True
                    if not delta:
                        continue
                    buf += delta
                    for out in try_emit_from_buffer():
                        yield out

                if not saw_any_delta:
                    yield _sse(
                        "msg",
                        _agent_to_ui_error(
                            "empty_content",
                            "Upstream returned empty content.",
                            details={"provider": provider, "responseMode": response_mode, "model": model},
                        ),
                    ).encode("utf-8")
                elif not emitted_any:
                    tail = buf.strip()
                    if tail:
                        for out in emit_phase("writing", message="生成说明"):
                            yield out
                        yield _sse("msg", _agent_to_ui_text(tail[:8000], source_model=model)).encode("utf-8")

                for out in emit_phase("done", message="完成"):
                    yield out
                yield _sse("done", "{}").encode("utf-8")
                return

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
                        for out in emit_phase("writing", message="生成内容"):
                            yield out

                def try_emit_from_buffer() -> Generator[bytes, None, None]:
                    nonlocal buf, search_pos, array_start, scan_pos, in_string, escape, depth, obj_start, emitted_any

                    if array_start is None:
                        k = buf.find('"envelopes"', search_pos)
                        if k == -1:
                            if len(buf) > 200_000:
                                buf = buf[-50_000:]
                                search_pos = 0
                            return
                        b = buf.find("[", k)
                        if b == -1:
                            search_pos = max(0, k)
                            return
                        array_start = b + 1
                        scan_pos = array_start

                    i = scan_pos
                    while i < len(buf):
                        ch = buf[i]
                        if in_string:
                            if escape:
                                escape = False
                            elif ch == "\\":
                                escape = True
                            elif ch == '"':
                                in_string = False
                            i += 1
                            continue

                        if ch == '"':
                            in_string = True
                            i += 1
                            continue

                        if ch == "{":
                            if depth == 0:
                                obj_start = i
                            depth += 1
                            i += 1
                            continue

                        if ch == "}":
                            if depth > 0:
                                depth -= 1
                                if depth == 0 and obj_start is not None:
                                    obj_text = buf[obj_start : i + 1]
                                    obj_start = None
                                    try:
                                        env0 = json.loads(obj_text)
                                    except Exception:
                                        depth = 0
                                        return
                                    if isinstance(env0, dict):
                                        if _is_agent_to_ui_envelope(env0):
                                            env_id = env0.get("id")
                                            if isinstance(env_id, str) and env_id:
                                                if env_id in seen_ids:
                                                    continue
                                                seen_ids.add(env_id)
                                            t0 = env0.get("type") if isinstance(env0.get("type"), str) else None
                                            if t0 == "agentToUi/componentTemplate":
                                                env0 = _postprocess_component_template_envelope(env0)
                                            for out in drive_phase_by_type(t0):
                                                yield out
                                            yield _sse("msg", env0).encode("utf-8")
                                            emitted_any = True
                                        elif isinstance(env0.get("type"), str) and "payload" in env0:
                                            env_id = env0.get("id")
                                            if isinstance(env_id, str) and env_id:
                                                if env_id in seen_ids:
                                                    continue
                                                seen_ids.add(env_id)

                                            wrapped = _wrap_short_agent_to_ui(env0, source_model=model)
                                            t0 = wrapped.get("type") if isinstance(wrapped.get("type"), str) else None
                                            if t0 == "agentToUi/componentTemplate":
                                                wrapped = _postprocess_component_template_envelope(wrapped)
                                            for out in drive_phase_by_type(t0):
                                                yield out
                                            yield _sse("msg", wrapped).encode("utf-8")
                                            emitted_any = True

                                    buf = buf[i + 1 :]
                                    search_pos = 0
                                    array_start = 0
                                    scan_pos = 0
                                    i = 0
                                    in_string = False
                                    escape = False
                                    depth = 0
                                    continue
                            i += 1
                            continue

                        if ch == "]":
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
                    tail = buf.strip()
                    if tail:
                        yield _sse("msg", _agent_to_ui_text(tail[:8000], source_model=model)).encode("utf-8")

                for out in emit_phase("done", message="完成"):
                    yield out
                yield _sse("done", "{}").encode("utf-8")
                return

            # Other response modes keep behavior identical (fall back to plain text).
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
            return
        except Exception as e:
            for out in emit_phase("error", message="发生错误"):
                yield out
            yield _sse("msg", _agent_to_ui_error("upstream_error", str(e))).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp
