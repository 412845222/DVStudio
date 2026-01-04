"""AI Subtitle Understanding APIs.

Skill 1 (subtitle understanding): produce structured JSON (outline/style-notes/templates/plans).
Palette generation is a separate skill (on-demand) to avoid unstable text mixing.

SSE format matches existing /api/chat/*: event=msg carries AgentToUI envelopes.
"""

from __future__ import annotations

import json
import datetime
import uuid
from typing import Any, Dict, Generator, List, Optional

from django.http import HttpRequest, HttpResponseNotAllowed, StreamingHttpResponse
from django.http.response import HttpResponseBase
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from .chat_api import (  # reuse proven SSE + DeepSeek wiring
    _agent_to_ui_chat_message,
    _agent_to_ui_error,
    _agent_to_ui_subtitle_summary_delta,
    _agent_to_ui_task_status,
    _agent_to_ui_text,
    _apply_sse_headers,
    _deepseek_cfg,
    _openai_stream_chat,
    _sse,
)
from ..skills.subtitle import understanding_json as subtitle_prompts
from ..skills.subtitle import panel_patch_json as panel_patch_prompts
from ..skills.component_template.presets import build_component_template_preview_system_parts
from ..skills.protocol.message_builder import build_messages, build_messages_from_preset
from ..skills.subtitle.agent import (
    build_chat_messages as _build_chat_messages_skill,
    build_palette_messages as _build_palette_messages_skill,
    build_understand_outline_messages as _build_understand_outline_messages_skill,
)

from .subtitle_understanding.utils import (
    _collect_palette_colors,
    _enforce_palette_whitelist,
    _ensure_glow_filter,
    _extract_first_json_object,
    _extract_top_bigrams,
    _is_record,
    _normalize_glow_filters,
    _repair_component_template,
    _to_safe_str,
    _try_parse_json,
    _validate_unique_root,
)


@csrf_exempt
def stream_template(request: HttpRequest) -> HttpResponseBase:
    """POST /api/ai/subtitle/template:stream

    Dedicated API for generating ComponentTemplate JSON via agentToUi-jsonl.

    Body:
    {
      "content": "...natural language...",
      "contextPack": {...},
      "viewport": {...},
      "provider": "deepseek",
      "model": "..." (optional)
    }

    Response: SSE
    - event: msg,  data: <AgentToUI envelope JSON>
    - event: done
    - event: error
    """

    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    try:
        raw = request.body.decode("utf-8") if request.body else ""
        data: Any = json.loads(raw) if raw else {}
    except Exception:
        data = {}
    body = data if isinstance(data, dict) else {}

    content = str(body.get("content") or "")
    prompt_preset = body.get("promptPreset")
    prompt_input = body.get("promptInput")
    context_pack = body.get("contextPack")
    viewport = body.get("viewport")
    provider = str(body.get("provider") or "deepseek")
    model_override = body.get("model")
    response_mode = str(body.get("responseMode") or "agentToUi-jsonl")

    if not content.strip() and not (isinstance(prompt_preset, str) and prompt_preset.strip()):
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

    if response_mode != "agentToUi-jsonl":
        def bad_mode() -> Generator[bytes, None, None]:
            yield _sse("error", {"message": f"unsupported responseMode: {response_mode}"}).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

        resp = StreamingHttpResponse(bad_mode(), content_type="text/event-stream")
        _apply_sse_headers(resp)
        return resp

    cfg = _deepseek_cfg()
    if not cfg.get("base_url") or not cfg.get("api_key") or not cfg.get("model"):
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

    model = str(model_override) if isinstance(model_override, str) and model_override else str(cfg["model"])
    viewport_dict = viewport if isinstance(viewport, dict) else None

    try:
        if isinstance(prompt_preset, str) and prompt_preset.strip():
            msgs = build_messages_from_preset(
                preset=prompt_preset,
                prompt_input=prompt_input,
                context_pack=context_pack,
                response_mode="agentToUi-jsonl",
                default_intent="template",
                viewport=viewport_dict,
            )
        else:
            msgs = build_messages(
                content=content,
                context_pack=context_pack,
                response_mode="agentToUi-jsonl",
                default_intent="template",
                viewport=viewport_dict,
            )
    except Exception as e:
        def bad_preset() -> Generator[bytes, None, None]:
            yield _sse("msg", _agent_to_ui_error("bad_prompt_preset", str(e))).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

        resp = StreamingHttpResponse(bad_preset(), content_type="text/event-stream")
        _apply_sse_headers(resp)
        return resp

    # Template-only hard constraints are maintained in the canonical skill doc.
    # NOTE: We inject them unconditionally because presets may drift.
    template_system = "\n\n".join(build_component_template_preview_system_parts(prompt_input=prompt_input))
    msgs = [*msgs[:1], {"role": "system", "content": template_system}, *msgs[1:]]

    def gen() -> Generator[bytes, None, None]:
        current_phase: Optional[str] = None
        sent_component_template = False
        last_tail_preview: str = ""

        def _now_iso_z() -> str:
            return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

        def _ensure_agent_to_ui_envelope_fields(obj: Dict[str, Any]) -> Dict[str, Any]:
            out = dict(obj)
            out["schemaVersion"] = 1
            if not isinstance(out.get("id"), str) or not str(out.get("id") or "").strip():
                out["id"] = str(uuid.uuid4())
            if not isinstance(out.get("createdAt"), str) or not str(out.get("createdAt") or "").strip():
                out["createdAt"] = _now_iso_z()
            src = out.get("source")
            if not isinstance(src, dict) or not isinstance(src.get("agentName"), str) or not str(src.get("agentName") or "").strip():
                out["source"] = {"agentName": provider}
            return out

        def _coerce_to_agent_to_ui(obj: Any) -> Optional[Dict[str, Any]]:
            if not isinstance(obj, dict):
                return None

            t0 = obj.get("type")
            if isinstance(t0, str) and t0.startswith("agentToUi/") and "payload" in obj:
                # Fill missing required fields to satisfy front-end guards.
                return _ensure_agent_to_ui_envelope_fields(obj)

            # Model sometimes emits ComponentTemplate directly.
            if obj.get("schemaVersion") == 1 and isinstance(obj.get("templateId"), str) and isinstance(obj.get("nodes"), list):
                return _ensure_agent_to_ui_envelope_fields(
                    {
                        "type": "agentToUi/componentTemplate",
                        "payload": {"template": obj},
                    }
                )

            # Or emits {template: <ComponentTemplate>}.
            tpl = obj.get("template")
            if isinstance(tpl, dict) and tpl.get("schemaVersion") == 1 and isinstance(tpl.get("templateId"), str) and isinstance(tpl.get("nodes"), list):
                return _ensure_agent_to_ui_envelope_fields(
                    {
                        "type": "agentToUi/componentTemplate",
                        "payload": {"template": tpl},
                    }
                )

            # Or emits task status without envelope.
            if isinstance(obj.get("phase"), str) and ("message" in obj):
                return _ensure_agent_to_ui_envelope_fields(
                    {
                        "type": "agentToUi/taskStatus",
                        "payload": {"phase": obj.get("phase"), "message": obj.get("message")},
                    }
                )

            return None

        def _postprocess_component_template_message(msg_obj: Dict[str, Any]) -> Dict[str, Any]:
            """Server-side hardening for componentTemplate.

            - Repair structure (schemaVersion/root/text placeholders/params)
            - Enforce palette whitelist when paletteLocked or palette provided
            - Ensure glow/blur presence when requireGlow
            """

            try:
                payload = msg_obj.get("payload")
                if not isinstance(payload, dict):
                    return msg_obj
                tpl = payload.get("template")
                if not isinstance(tpl, dict):
                    return msg_obj

                repaired = _repair_component_template(tpl, fallback_id=str(uuid.uuid4()))

                # Normalize glow intensity constraints (even if model emitted it).
                _normalize_glow_filters(repaired)

                pal = _collect_palette_colors(prompt_input)
                locked = bool(isinstance(prompt_input, dict) and prompt_input.get("paletteLocked") is True)
                require_glow = bool(isinstance(prompt_input, dict) and prompt_input.get("requireGlow") is True)

                # If palette is provided, we enforce whitelist anyway; paletteLocked means stricter intent.
                if pal and (locked or True):
                    _enforce_palette_whitelist(repaired, pal)
                if require_glow:
                    _ensure_glow_filter(repaired, pal)

                # After ensuring glow exists, normalize again for intensity bounds.
                _normalize_glow_filters(repaired)

                msg_obj2 = dict(msg_obj)
                payload2 = dict(payload)
                payload2["template"] = repaired
                msg_obj2["payload"] = payload2
                return msg_obj2
            except Exception:
                return msg_obj

        def emit_phase(phase: str, *, message: Optional[str] = None) -> Generator[bytes, None, None]:
            nonlocal current_phase
            if current_phase == phase:
                return
            current_phase = phase
            yield _sse("msg", _agent_to_ui_task_status(phase, message=message)).encode("utf-8")

        try:
            for out in emit_phase("started", message="已开始"):
                yield out

            max_attempts = 3
            last_reason: str = ""

            for attempt in range(1, max_attempts + 1):
                for out in emit_phase("streaming", message=f"连接模型（第 {attempt}/{max_attempts} 次）"):
                    yield out

                # On retries, add an extra system reminder with the concrete reason.
                msgs_attempt = msgs
                if attempt > 1:
                    extra = (
                        "上一次输出未通过服务端自检（唯一 root 约束）。\n"
                        f"失败原因：{last_reason or '未知'}\n"
                        "请重新生成一份全新模板并严格满足：rootLocalId='root' 且只有 root 没有 parentLocalId，其他节点必须有 parentLocalId 并挂在 root 下。\n"
                        "不要输出任何解释文字，只输出合法 JSONL envelopes。"
                    )
                    msgs_attempt = [*msgs[:1], {"role": "system", "content": extra}, *msgs[1:]]

                buf = ""
                decoder = json.JSONDecoder()
                saw_any_delta = False
                got_valid_template = False

                def try_emit_from_buffer() -> Generator[bytes, None, None]:
                    nonlocal buf, got_valid_template, last_reason, sent_component_template
                    while True:
                        s = buf.lstrip() 
                        if not s:
                            buf = ""
                            return

                        # Strict JSONL-only: discard any non-JSON prefix until the next '{'.
                        if s and not s.startswith("{"):
                            brace = s.find("{")
                            if brace == -1:
                                if len(s) > 50_000:
                                    buf = ""
                                return
                            buf = s[brace:]
                            continue

                        try:
                            obj, end = decoder.raw_decode(s)
                        except json.JSONDecodeError:
                            return

                        consumed = (len(buf) - len(s)) + end
                        buf = buf[consumed:]

                        # Compatibility: some providers may emit a single JSON object
                        # like {"envelopes":[...]} even when asked for JSONL.
                        if isinstance(obj, dict) and isinstance(obj.get("envelopes"), list):
                            for env_any in obj.get("envelopes") or []:
                                msg_obj = _coerce_to_agent_to_ui(env_any)
                                if msg_obj is None:
                                    yield _sse(
                                        "msg",
                                        _agent_to_ui_error(
                                            "invalid_jsonl_object",
                                            "Model emitted an unsupported JSON object in envelopes array.",
                                            details={"preview": str(env_any)[:2000]},
                                        ),
                                    ).encode("utf-8")
                                    continue

                                t0 = msg_obj.get("type")
                                if t0 in ("agentToUi/text", "agentToUi/chatMessage"):
                                    for out in emit_phase("writing", message="生成说明"):
                                        yield out
                                    if not got_valid_template:
                                        yield _sse("msg", msg_obj).encode("utf-8")
                                    continue

                                if t0 == "agentToUi/componentTemplate":
                                    for out in emit_phase("template", message="生成模板"):
                                        yield out
                                    msg_obj = _postprocess_component_template_message(msg_obj)

                                    tpl = None
                                    try:
                                        payload = msg_obj.get("payload")
                                        if isinstance(payload, dict):
                                            tpl = payload.get("template")
                                    except Exception:
                                        tpl = None

                                    if isinstance(tpl, dict):
                                        ok, reason = _validate_unique_root(tpl)
                                        if ok:
                                            got_valid_template = True
                                            sent_component_template = True
                                            yield _sse("msg", msg_obj).encode("utf-8")
                                            continue
                                        last_reason = reason
                                        yield _sse(
                                            "msg",
                                            _agent_to_ui_task_status(
                                                "writing",
                                                message=f"自检失败：{reason}；将自动重新生成（第 {attempt}/{max_attempts} 次）",
                                            ),
                                        ).encode("utf-8")
                                        continue

                                    last_reason = "componentTemplate.payload.template 缺失或非法"
                                    continue

                                yield _sse("msg", msg_obj).encode("utf-8")
                            continue

                        msg_obj = _coerce_to_agent_to_ui(obj)
                        if msg_obj is not None:
                            t0 = msg_obj.get("type")
                            if t0 in ("agentToUi/text", "agentToUi/chatMessage"):
                                for out in emit_phase("writing", message="生成说明"):
                                    yield out
                                # Forward text/chat only before we have a template.
                                if not got_valid_template:
                                    yield _sse("msg", msg_obj).encode("utf-8")
                                continue

                            if t0 == "agentToUi/componentTemplate":
                                for out in emit_phase("template", message="生成模板"):
                                    yield out
                                msg_obj = _postprocess_component_template_message(msg_obj)

                                tpl = None
                                try:
                                    payload = msg_obj.get("payload")
                                    if isinstance(payload, dict):
                                        tpl = payload.get("template")
                                except Exception:
                                    tpl = None

                                if isinstance(tpl, dict):
                                    ok, reason = _validate_unique_root(tpl)
                                    if ok:
                                        got_valid_template = True
                                        sent_component_template = True
                                        yield _sse("msg", msg_obj).encode("utf-8")
                                        continue
                                    last_reason = reason
                                    # Do NOT forward invalid template.
                                    yield _sse(
                                        "msg",
                                        _agent_to_ui_task_status(
                                            "writing",
                                            message=f"自检失败：{reason}；将自动重新生成（第 {attempt}/{max_attempts} 次）",
                                        ),
                                    ).encode("utf-8")
                                    continue

                                last_reason = "componentTemplate.payload.template 缺失或非法"
                                continue

                            # Forward other envelopes (taskStatus/error/etc)
                            yield _sse("msg", msg_obj).encode("utf-8")
                            continue

                        # Unexpected JSON: surface structured error.
                        yield _sse(
                            "msg",
                            _agent_to_ui_error(
                                "invalid_jsonl_object",
                                "Model emitted an unsupported JSON object in JSONL stream.",
                                details={"preview": str(obj)[:2000]},
                            ),
                        ).encode("utf-8")

                for delta in _openai_stream_chat(
                    base_url=str(cfg["base_url"]),
                    api_key=str(cfg["api_key"]),
                    model=model,
                    messages=msgs_attempt,
                    response_format=None,
                    timeout_s=60,
                ):
                    if got_valid_template:
                        break
                    if delta:
                        saw_any_delta = True
                        buf += delta
                        for out in try_emit_from_buffer():
                            yield out

                # Flush once at end of upstream stream in case the last chunk completed a JSON object.
                if not got_valid_template and buf.strip():
                    for out in try_emit_from_buffer():
                        yield out

                if got_valid_template:
                    break

                tail = buf.strip()
                if tail:
                    last_tail_preview = tail[:4000]

                if not saw_any_delta:
                    last_reason = "Upstream returned empty content"
                    yield _sse(
                        "msg",
                        _agent_to_ui_error(
                            "empty_content",
                            "Upstream returned empty content.",
                            details={"provider": provider, "responseMode": response_mode, "model": model, "attempt": attempt},
                        ),
                    ).encode("utf-8")

            # If still not valid after retries, surface a final error so front-end can react.
            if not sent_component_template:
                if not last_reason:
                    last_reason = "模型未返回 agentToUi/componentTemplate"
                for out in emit_phase("error", message="模板生成失败"):
                    yield out
                yield _sse(
                    "msg",
                    _agent_to_ui_error(
                        "missing_component_template",
                        "AI 未返回可用的 agentToUi/componentTemplate，无法确认/复用该模板。",
                        details={
                            "reason": last_reason,
                            "tailPreview": last_tail_preview,
                            "provider": provider,
                            "responseMode": response_mode,
                            "model": model,
                            "attempts": max_attempts,
                        },
                    ),
                ).encode("utf-8")

            for out in emit_phase("done", message="完成"):
                yield out
            yield _sse("done", "{}").encode("utf-8")
        except Exception as e:
            yield _sse(
                "msg",
                _agent_to_ui_error(
                    "upstream_error",
                    str(e),
                    details={"provider": provider, "responseMode": response_mode, "model": model},
                ),
            ).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp


def _node_type_cn(t: str) -> str:
    m = {
        "group": "分组容器",
        "rect": "矩形",
        "rectangle": "矩形",
        "text": "文本",
        "image": "图片占位",
        "img": "图片占位",
        "line": "线条",
    }
    k = str(t or "").strip().lower()
    return m.get(k, f"{k or '未知'}节点")


def _infer_template_description(tpl: Dict[str, Any]) -> List[str]:
    nodes_val: Any = tpl.get("nodes")
    nodes: List[Any] = nodes_val if isinstance(nodes_val, list) else []
    params_val: Any = tpl.get("params")
    params: List[Any] = params_val if isinstance(params_val, list) else []

    counts: Dict[str, int] = {}
    for n in nodes:
        if not isinstance(n, dict):
            continue
        nt = str(n.get("type") or "").strip().lower() or "unknown"
        counts[nt] = counts.get(nt, 0) + 1

    parts: List[str] = []
    for k, v in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        parts.append(f"{v} 个{_node_type_cn(k)}")

    param_keys: List[str] = []
    for p in params:
        if not isinstance(p, dict):
            continue
        key = p.get("key")
        if isinstance(key, str) and key.strip():
            param_keys.append(key.strip())

    # Keep it short, concrete, and renderer-friendly.
    lines: List[str] = []

    # Rough bounds / alignment inference (best-effort).
    min_x = min_y = None
    max_x = max_y = None
    text_xs: List[float] = []
    for n in nodes:
        if not isinstance(n, dict):
            continue
        tr_val: Any = n.get("transform")
        tr: Dict[str, Any] = tr_val if isinstance(tr_val, dict) else {}
        x: Any = tr.get("x")
        y: Any = tr.get("y")
        w: Any = tr.get("width")
        h: Any = tr.get("height")
        if isinstance(x, (int, float)) and isinstance(y, (int, float)) and isinstance(w, (int, float)) and isinstance(h, (int, float)):
            x2 = float(x) + float(w)
            y2 = float(y) + float(h)
            min_x = float(x) if min_x is None else min(min_x, float(x))
            min_y = float(y) if min_y is None else min(min_y, float(y))
            max_x = x2 if max_x is None else max(max_x, x2)
            max_y = y2 if max_y is None else max(max_y, y2)
        nt = str(n.get("type") or "").strip().lower()
        if nt == "text" and isinstance(x, (int, float)):
            text_xs.append(float(x))

    width = (max_x - min_x) if (min_x is not None and max_x is not None) else None
    height = (max_y - min_y) if (min_y is not None and max_y is not None) else None
    if parts:
        lines.append("结构：" + "、".join(parts[:6]) + " 组合成一个可复用卡片组件。")
    else:
        lines.append("结构：由一个容器节点承载内容区，适合做标题/要点类卡片。")

    if isinstance(width, (int, float)) and isinstance(height, (int, float)) and width > 0 and height > 0:
        lines.append(f"尺寸：内容边界约为宽 {width:.0f}、高 {height:.0f}（单位同引擎坐标系）。")

    if any(k in counts for k in ["rect", "rectangle"]) and any(k in counts for k in ["text"]):
        align = "居中"
        if width and text_xs:
            avg_x = sum(text_xs) / max(1, len(text_xs))
            rel = (avg_x - (min_x or 0.0)) / max(1.0, float(width))
            if rel < 0.35:
                align = "偏左"
            elif rel > 0.65:
                align = "偏右"
        lines.append(f"布局：以背景容器承载文本区域，常见为上方标题 + 下方正文/要点区；文本区域整体{align}，便于阅读。")
    else:
        lines.append("布局：在容器内按分区排列内容（可做上下分段或左右分栏）。")

    lines.append("样式：建议将背景/边框/强调色分别绑定到 palette 的 background/neutral/accent 等角色，保证对比度与可读性。")

    if param_keys:
        keys = "、".join([f"{{{{{k}}}}}" for k in param_keys[:8]])
        lines.append("填充：支持参数 " + keys + "，用于替换文本或图片占位内容。")

    # Ensure 3-6 lines.
    return lines[:6]


def _desc_is_too_generic(desc: List[str]) -> bool:
    if not desc:
        return True
    bad = 0
    for s in desc:
        ss = str(s or "").strip()
        if not ss:
            bad += 1
            continue
        if "描述缺失" in ss:
            bad += 1
            continue
        if "字幕提要" in ss or "结构化要点" in ss:
            bad += 1
            continue
    return bad >= max(1, len(desc) // 2)


def _normalize_desc_key(desc: List[str]) -> str:
    s = "\n".join([str(x or "").strip() for x in (desc or []) if str(x or "").strip()])
    s = " ".join(s.lower().split())
    return s


def _pick_cue_text(cues: List[Dict[str, Any]], cue_i: int) -> str:
    if cue_i < 0 or cue_i >= len(cues):
        return ""
    c = cues[cue_i]
    t = c.get("text") if isinstance(c, dict) else ""
    return _to_safe_str(t).strip()


def _build_understand_template_desc_messages(
    *,
    cues: List[Dict[str, Any]],
    outline_items: List[Dict[str, Any]],
    templates: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    outline_pack: List[Dict[str, Any]] = []
    for it in outline_items:
        if not isinstance(it, dict):
            continue
        title = _to_safe_str(it.get("title")).strip()
        try:
            sc_any: Any = it.get("startCue")
            ec_any: Any = it.get("endCue")
            if sc_any is None or ec_any is None:
                continue
            sc = int(sc_any)
            ec = int(ec_any)
        except Exception:
            continue
        if not title:
            continue
        if sc < 0:
            sc = 0
        if ec < sc:
            ec = sc
        sample_lines: List[str] = []
        for j in range(sc, min(ec + 1, sc + 3)):
            txt = _pick_cue_text(cues, j)
            if txt:
                if len(txt) > 120:
                    txt = txt[:120].rstrip() + "…"
                sample_lines.append(f"[{j}] {txt}")
        outline_pack.append({"title": title, "startCue": sc, "endCue": ec, "sampleLines": sample_lines})

    templates_pack: List[Dict[str, Any]] = []
    for t in templates:
        if not isinstance(t, dict):
            continue
        desc_any: Any = t.get("description")
        desc_list: List[Any] = desc_any if isinstance(desc_any, list) else []
        templates_pack.append(
            {
                "templateId": _to_safe_str(t.get("templateId")).strip(),
                "name": _to_safe_str(t.get("name")).strip(),
                "category": _to_safe_str(t.get("category")).strip(),
                "currentDescription": [
                    _to_safe_str(x).strip() for x in desc_list if isinstance(x, str) and _to_safe_str(x).strip()
                ],
            }
        )

    sys = (
        "你是资深 UI/UX 设计师，擅长把脚本大纲转成可复用的组件设计描述。\n"
        "你的任务：为给定的多个 templateId 写【差异化】的自然语言描述，必须结合大纲与脚本文本的真实内容倾向。\n"
        "硬性规则：\n"
        "- 输出必须是严格 JSON（不要 Markdown），结构：{\"templates\":[{\"templateId\":string,\"description\":[string,...]}]}\n"
        "- 每个 description 建议 3-6 条，必须包含：结构/布局/内容槽位/样式（palette 绑定建议）\n"
        "- 每个模板的描述必须不同：不要复用同一句式，不要写‘上下分段或左右分栏’这类空泛可套用句\n"
        "- 不要提到 group/group 容器；用‘容器/背景矩形/内容区’等 UI 术语表达\n"
        "- 只写描述性自然语言，不要输出任何 template JSON\n"
    )

    user = {
        "outline": {"items": outline_pack},
        "templates": templates_pack,
    }

    return [
        {"role": "system", "content": sys},
        {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
    ]


def _normalize_cue_index(v: Any, *, min_v: int, max_v: int) -> int:
    try:
        x = int(v)
    except Exception:
        x = min_v
    if x < min_v:
        return min_v
    if x > max_v:
        return max_v
    return x


@api_view(["GET"])
def ping(_: Request) -> Response:
    """Lightweight connectivity/config check used by the front-end panel."""

    cfg = _deepseek_cfg()
    ok = bool(cfg.get("base_url") and cfg.get("api_key") and cfg.get("model"))
    masked_key = "***" if cfg.get("api_key") else ""

    return Response(
        {
            "ok": ok,
            "provider": "deepseek",
            "model": cfg.get("model") or "",
            "baseUrl": cfg.get("base_url") or "",
            "hasApiKey": bool(cfg.get("api_key")),
            "apiKey": masked_key,
        }
    )


def _build_understand_outline_messages(*, cues: List[Dict[str, Any]], cue_ranges: List[Any]) -> List[Dict[str, str]]:
    return _build_understand_outline_messages_skill(cues=cues, cue_ranges=cue_ranges)
def _build_palette_messages(*, text: str) -> List[Dict[str, str]]:
    return _build_palette_messages_skill(text=text)


def _build_chat_messages(
    *,
    cues: List[Dict[str, Any]],
    cue_ranges: List[Any],
    summary: Any,
    messages: List[Dict[str, Any]],
    deep_mode: bool = False,
) -> List[Dict[str, str]]:
    return _build_chat_messages_skill(
        cues=cues,
        cue_ranges=cue_ranges,
        summary=summary,
        messages=messages,
        deep_mode=deep_mode,
    )



@csrf_exempt
def stream_understand(request: HttpRequest) -> HttpResponseBase:
    """POST /api/ai/subtitle/understand:stream

    Request JSON:
    {
      "layerId": "...",
      "cues": [{"text": "...", ...}],
      "cueRanges": [...]
    }

    SSE:
    - event: msg, data: AgentToUI envelope (taskStatus/text/error)
    - event: done
    """

    # Intentionally a plain Django view for Accept: text/event-stream.
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    try:
        raw = request.body.decode("utf-8") if request.body else ""
        data: Any = json.loads(raw) if raw else {}
    except Exception:
        data = {}

    body = data if isinstance(data, dict) else {}
    cues = body.get("cues")
    cue_ranges = body.get("cueRanges")
    scope_any: Any = body.get("scope") 
    scope = str(scope_any).strip().lower() if isinstance(scope_any, str) else ""

    cues_list: List[Dict[str, Any]] = cues if isinstance(cues, list) else []
    cue_ranges_list: List[Any] = cue_ranges if isinstance(cue_ranges, list) else []

    cfg = _deepseek_cfg()
    if not cfg.get("base_url") or not cfg.get("api_key") or not cfg.get("model"):
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

    outline_msgs = _build_understand_outline_messages(cues=cues_list, cue_ranges=cue_ranges_list)

    def gen() -> Generator[bytes, None, None]:
        # New: allow faster scoped run for better UX.
        # scope=overall: only generate "字幕整体理解" then stop.
        if scope in ("overall", "understanding"):
            yield _sse("msg", _agent_to_ui_task_status("connect", message="连接")).encode("utf-8")
            yield _sse("msg", _agent_to_ui_task_status("submit", message="传入前导词")).encode("utf-8")

            try:
                yield _sse("msg", _agent_to_ui_task_status("understanding_gen", message="生成字幕整体理解")).encode("utf-8")

                cue_texts_for_sum: List[str] = []
                for c in cues_list:
                    if not isinstance(c, dict):
                        continue
                    s = _to_safe_str(c.get("text")).strip()
                    if s:
                        cue_texts_for_sum.append(s)
                    if len(cue_texts_for_sum) >= 24:
                        break

                sys = "\n".join(
                    [
                        "你是字幕理解助手。",
                        "任务：基于字幕内容给出‘字幕整体理解’的简短归纳。",
                        "强约束：不要逐句复述字幕原文，不要引用长句，不要输出任何 JSON 以外的内容。",
                        "输出必须是单一 JSON 对象：{\"summary\":\"...\",\"points\":[...]}。",
                        "summary：1-2 句中文，概括主题/场景/核心信息；不要写标题。",
                        "points：可选 2-4 条要点（短句），不能是原句照抄。",
                    ]
                )
                user = "字幕片段（仅供理解，不可照抄原文）：\n" + "\n".join([f"- {t}" for t in cue_texts_for_sum])
                sum_msgs = [
                    {"role": "system", "content": sys},
                    {"role": "user", "content": user},
                ]

                buf = ""
                for d2 in _openai_stream_chat(
                    base_url=cfg["base_url"],
                    api_key=cfg["api_key"],
                    model=cfg["model"],
                    messages=sum_msgs,
                    response_format={"type": "json_object"},
                    timeout_s=25,
                ):
                    if d2:
                        buf += d2

                obj2 = _try_parse_json(buf)
                understanding_summary = ""
                understanding_points: List[str] = []
                if _is_record(obj2):
                    s2 = _to_safe_str(obj2.get("summary")).strip()
                    if s2:
                        understanding_summary = s2
                    pts2_any: Any = obj2.get("points")
                    pts2_in: List[Any] = pts2_any if isinstance(pts2_any, list) else []
                    understanding_points = [str(x).strip() for x in pts2_in if isinstance(x, str) and x.strip()][:6]

                if not understanding_summary:
                    topics = _extract_top_bigrams(cue_texts_for_sum, limit=5)
                    if topics:
                        understanding_summary = "主要内容：围绕“" + "、".join(topics[:4]) + "”等主题展开。"
                        if not understanding_points:
                            understanding_points = [f"关键词：{t}" for t in topics[:4]]
                    else:
                        understanding_summary = "主要内容：围绕多个主题展开的讲解与要点梳理。"

                yield _sse(
                    "msg",
                    _agent_to_ui_subtitle_summary_delta(
                        "understanding",
                        {
                            "summary": understanding_summary,
                            "points": understanding_points,
                        },
                    ),
                ).encode("utf-8")

                yield _sse("msg", _agent_to_ui_task_status("done", message="字幕整体理解完成")).encode("utf-8")
                yield _sse("done", "{}").encode("utf-8")
            except Exception as e:
                yield _sse(
                    "msg",
                    _agent_to_ui_error(
                        "upstream_error",
                        str(e),
                        details={"preview": ""},
                    ),
                ).encode("utf-8")
                yield _sse("msg", _agent_to_ui_task_status("error", message="字幕整体理解失败")).encode("utf-8")
                yield _sse("done", "{}").encode("utf-8")
            return

        # Phase list expected by the front-end:
        # 1) 连接 2) 确定技能角色 3) 传入前导词 4) 解析大纲 5) 输出大纲 6) 生成配色建议 7) 输出配色建议
        # 7) 生成可复用高级组件建议 8) 输出可复用高级组件建议 9) 应用各时间点对应的高级组件建议清单
        yield _sse("msg", _agent_to_ui_task_status("connect", message="连接")).encode("utf-8")
        yield _sse("msg", _agent_to_ui_task_status("role_confirm", message="确定技能角色（UI/UX设计师）")).encode("utf-8")
        yield _sse("msg", _agent_to_ui_task_status("submit", message="传入前导词")).encode("utf-8")
        yield _sse("msg", _agent_to_ui_task_status("outline_parse", message="解析大纲")).encode("utf-8")

        try:
            # Stage 1: outline/style-notes/templates/plans JSON (no palette)
            outline_buf = ""
            for delta in _openai_stream_chat(
                base_url=cfg["base_url"],
                api_key=cfg["api_key"],
                model=cfg["model"],
                messages=outline_msgs,
                response_format={"type": "json_object"},
                timeout_s=45,
            ):
                if delta:
                    outline_buf += delta

            outline_obj = _try_parse_json(outline_buf)
            outline_items: List[Dict[str, Any]] = []
            if _is_record(outline_obj):
                o = outline_obj.get("outline")
                if isinstance(o, dict):
                    items = o.get("items")
                    if isinstance(items, list):
                        for it in items:
                            if not isinstance(it, dict):
                                continue
                            title = _to_safe_str(it.get("title")).strip()
                            if not title:
                                continue
                            sc_any: Any = it.get("startCue")
                            ec_any: Any = it.get("endCue")
                            try:
                                sc_i = int(sc_any)
                                ec_i = int(ec_any)
                            except Exception:
                                continue
                            if sc_i < 0:
                                sc_i = 0
                            if ec_i < sc_i:
                                ec_i = sc_i
                            outline_items.append(
                                {
                                    "title": title,
                                    "startCue": sc_i,
                                    "endCue": ec_i,
                                    "startTimeMs": it.get("startTimeMs") if isinstance(it.get("startTimeMs"), (int, type(None))) else None,
                                    "endTimeMs": it.get("endTimeMs") if isinstance(it.get("endTimeMs"), (int, type(None))) else None,
                                }
                            )

            # understanding (overall short summary)
            understanding_summary = ""
            understanding_points: List[str] = []
            try:
                u = outline_obj.get("understanding") if _is_record(outline_obj) and isinstance(outline_obj.get("understanding"), dict) else {}
                understanding_summary = _to_safe_str(u.get("summary")).strip() if isinstance(u, dict) else ""
                pts_any: Any = u.get("points") if isinstance(u, dict) else None
                pts_in: List[Any] = pts_any if isinstance(pts_any, list) else []
                understanding_points = [str(x).strip() for x in pts_in if isinstance(x, str) and x.strip()][:6]
            except Exception:
                understanding_summary = ""
                understanding_points = []

            # If model omitted understanding, try a lightweight extra call to generate it.
            if not understanding_summary:
                try:
                    yield _sse("msg", _agent_to_ui_task_status("understanding_gen", message="生成字幕整体理解…")).encode("utf-8")

                    # Keep the call small: only include trimmed cue texts.
                    cue_texts_for_sum: List[str] = []
                    for c in cues_list:
                        if not isinstance(c, dict):
                            continue
                        s = _to_safe_str(c.get("text")).strip()
                        if s:
                            cue_texts_for_sum.append(s)
                        if len(cue_texts_for_sum) >= 24:
                            break

                    sys = "\n".join(
                        [
                            "你是字幕理解助手。",
                            "任务：基于字幕内容给出‘字幕整体理解’的简短归纳。",
                            "强约束：不要逐句复述字幕原文，不要引用长句，不要输出任何 JSON 以外的内容。",
                            "输出必须是单一 JSON 对象：{\"summary\":\"...\",\"points\":[...]}。",
                            "summary：1-2 句中文，概括主题/场景/核心信息；不要写标题。",
                            "points：可选 2-4 条要点（短句），不能是原句照抄。",
                        ]
                    )
                    user = "字幕片段（仅供理解，不可照抄原文）：\n" + "\n".join([f"- {t}" for t in cue_texts_for_sum])
                    sum_msgs = [
                        {"role": "system", "content": sys},
                        {"role": "user", "content": user},
                    ]

                    buf2 = ""
                    for d2 in _openai_stream_chat(
                        base_url=cfg["base_url"],
                        api_key=cfg["api_key"],
                        model=cfg["model"],
                        messages=sum_msgs,
                        response_format={"type": "json_object"},
                        timeout_s=25,
                    ):
                        if d2:
                            buf2 += d2

                    obj2 = _try_parse_json(buf2)
                    if _is_record(obj2):
                        s2 = _to_safe_str(obj2.get("summary")).strip()
                        if s2:
                            understanding_summary = s2
                        pts2_any: Any = obj2.get("points")
                        pts2_in: List[Any] = pts2_any if isinstance(pts2_any, list) else []
                        pts2 = [str(x).strip() for x in pts2_in if isinstance(x, str) and x.strip()][:6]
                        if pts2:
                            understanding_points = pts2
                except Exception:
                    # best-effort; fallback below
                    pass

            if not understanding_summary:
                # Fallback 1: derive from outline titles (more "summary-like" than raw cue text).
                titles = [str(x.get("title") or "").strip() for x in outline_items if isinstance(x, dict) and str(x.get("title") or "").strip()]
                titles = [t for t in titles if t][:6]
                if titles:
                    understanding_summary = "主要内容：" + " / ".join(titles[:4])
                else:
                    # Fallback 2: derive lightweight topics from subtitles without copying full sentences.
                    cue_texts: List[str] = []
                    for c in cues_list:
                        if not isinstance(c, dict):
                            continue
                        s = _to_safe_str(c.get("text")).strip()
                        if s:
                            cue_texts.append(s)
                        if len(cue_texts) >= 30:
                            break
                    topics = _extract_top_bigrams(cue_texts, limit=5)
                    if topics:
                        understanding_summary = "主要内容：围绕“" + "、".join(topics[:4]) + "”等主题展开。"
                        if not understanding_points:
                            understanding_points = [f"关键词：{t}" for t in topics[:4]]
                    else:
                        understanding_summary = "主要内容：围绕多个主题展开的讲解与要点梳理。"

            yield _sse(
                "msg",
                _agent_to_ui_subtitle_summary_delta(
                    "understanding",
                    {
                        "summary": understanding_summary,
                        "points": understanding_points,
                    },
                ),
            ).encode("utf-8")

            yield _sse("msg", _agent_to_ui_subtitle_summary_delta("outline", {"items": outline_items})).encode("utf-8")
            yield _sse("msg", _agent_to_ui_task_status("outline_done", message="输出大纲")).encode("utf-8")

            # style notes (no palette in this stage)
            yield _sse("msg", _agent_to_ui_task_status("style_gen", message="生成风格文字建议")).encode("utf-8")
            style: Dict[str, Any] = outline_obj.get("style") if _is_record(outline_obj) and isinstance(outline_obj.get("style"), dict) else {}
            notes_val: Any = style.get("notes")
            notes_in: List[Any] = notes_val if isinstance(notes_val, list) else []
            # Filter out accidental palette lines like "primary#1E90FF"
            notes: List[str] = []
            for x in notes_in:
                if not isinstance(x, str):
                    continue
                s = x.strip()
                if not s:
                    continue
                if "#" in s and len(s) <= 32 and s.replace(" ", "").count("#") == 1:
                    # likely "key#hex"; skip to avoid duplicating palette preview
                    continue
                notes.append(s)

            # Fallback: ensure style notes are always present.
            if not notes:
                notes = [
                    "版式：标题与正文分区明确，信息层级清晰。",
                    "节奏：每段突出 1 个核心信息，避免堆叠长句。",
                    "点缀：线条/边框可使用轻微发光或模糊作为强调，但保持克制。",
                ]

            yield _sse(
                "msg",
                _agent_to_ui_subtitle_summary_delta(
                    "style",
                    {
                        "palette": {},
                        "notes": notes,
                    },
                ),
            ).encode("utf-8")
            yield _sse("msg", _agent_to_ui_task_status("style_out", message="输出风格文字建议")).encode("utf-8")

            # templates
            yield _sse("msg", _agent_to_ui_task_status("template_gen", message="生成可复用高级组件建议")).encode("utf-8")
            templates_in = outline_obj.get("templates") if _is_record(outline_obj) and isinstance(outline_obj.get("templates"), list) else []
            templates_out: List[Dict[str, Any]] = []
            for i, t in enumerate(templates_in):
                if not isinstance(t, dict):
                    continue
                template_id = _to_safe_str(t.get("templateId")).strip() or f"tmpl_{i+1}"
                name = _to_safe_str(t.get("name")).strip() or template_id
                category = _to_safe_str(t.get("category")).strip() or ""
                desc_val: Any = t.get("description")
                desc_in: List[Any] = desc_val if isinstance(desc_val, list) else []
                desc: List[str] = [str(x).strip() for x in desc_in if isinstance(x, str) and x.strip()]
                templates_out.append(
                    {
                        "templateId": template_id,
                        "name": name,
                        "category": category or None,
                        "description": desc,
                    }
                )

            # Post-process: if descriptions are generic or duplicated, regenerate them grounded on outline + script.
            dup_groups: Dict[str, List[Dict[str, Any]]] = {}
            for t in templates_out:
                d_any: Any = t.get("description")
                d_in: List[Any] = d_any if isinstance(d_any, list) else []
                d_norm: List[str] = [str(x).strip() for x in d_in if isinstance(x, str) and str(x).strip()]
                k = _normalize_desc_key(d_norm)
                if k:
                    dup_groups.setdefault(k, []).append(t)

            to_regen: List[Dict[str, Any]] = []
            for t in templates_out:
                desc_any: Any = t.get("description")
                desc_list: List[str] = desc_any if isinstance(desc_any, list) else []
                k = _normalize_desc_key(desc_list)
                is_dup = bool(k and len(dup_groups.get(k, [])) >= 2)
                is_generic = _desc_is_too_generic(desc_list)
                joined = "\n".join(desc_list)
                looks_generic_phrase = "上下分段" in joined or "左右分栏" in joined or "可复用卡片" in joined
                if is_dup or is_generic or looks_generic_phrase:
                    to_regen.append(t)

            if to_regen:
                yield _sse(
                    "msg",
                    _agent_to_ui_task_status(
                        "template_desc_gen",
                        message="结合大纲与脚本细化组件描述",
                    ),
                ).encode("utf-8")

                regen_msgs = _build_understand_template_desc_messages(
                    cues=cues_list,
                    outline_items=outline_items,
                    templates=to_regen,
                )
                regen_buf = ""
                for delta in _openai_stream_chat(
                    base_url=cfg["base_url"],
                    api_key=cfg["api_key"],
                    model=cfg["model"],
                    messages=regen_msgs,
                    response_format={"type": "json_object"},
                    timeout_s=45,
                ):
                    if delta:
                        regen_buf += delta

                regen_obj = _try_parse_json(regen_buf)
                regen_list = regen_obj.get("templates") if _is_record(regen_obj) and isinstance(regen_obj.get("templates"), list) else []
                by_id: Dict[str, List[str]] = {}
                for x in regen_list:
                    if not isinstance(x, dict):
                        continue
                    tid = _to_safe_str(x.get("templateId")).strip()
                    dv: Any = x.get("description")
                    di: List[Any] = dv if isinstance(dv, list) else []
                    dd: List[str] = [str(s).strip() for s in di if isinstance(s, str) and s.strip()]
                    if tid and dd:
                        by_id[tid] = dd

                if by_id:
                    for t in templates_out:
                        tid = _to_safe_str(t.get("templateId")).strip()
                        if tid in by_id:
                            t["description"] = by_id[tid]

            # Fallback: ensure templates are always present (description-only, no template JSON).
            if not templates_out:
                templates_out = [
                    {
                        "templateId": "tmpl_summary_card",
                        "name": "摘要卡片",
                        "category": "summary",
                        "description": [
                            "结构：背景容器矩形 + 顶部标题文本 + 正文摘要文本 + 一条分割线。",
                            "布局：标题在上方靠左，摘要在下方；左右留白一致。",
                            "样式：背景用 palette.background；标题/正文用 palette.text；分割线/边框用 palette.neutral。",
                            "可填充：标题 {{title}}，摘要 {{body}}。",
                        ],
                    },
                    {
                        "templateId": "tmpl_bullet_list",
                        "name": "要点列表卡片",
                        "category": "bullets",
                        "description": [
                            "结构：背景容器矩形 + 标题文本 + 3-5 行要点列表文本 + 左侧小色条。",
                            "布局：标题在上方；要点垂直排列；色条贴左侧作为强调。",
                            "样式：色条用 palette.primary 或 palette.accent；正文用 palette.text；边框/分割线用 palette.neutral。",
                            "可填充：标题 {{title}}，要点 {{text}}（用换行分隔）。",
                        ],
                    },
                    {
                        "templateId": "tmpl_mindmap_node",
                        "name": "思维导图节点卡片",
                        "category": "mindmap",
                        "description": [
                            "结构：圆角矩形节点 + 节点标题文本 + 一条连接线（由节点向外延伸）。",
                            "布局：节点居中，连接线从节点侧边引出，便于串联多个节点。",
                            "样式：节点填充用 palette.background；描边/连接线用 palette.neutral；强调边用 palette.accent。",
                            "可填充：节点文字 {{text}}。",
                        ],
                    },
                ]

            yield _sse("msg", _agent_to_ui_subtitle_summary_delta("templates", templates_out)).encode("utf-8")
            yield _sse("msg", _agent_to_ui_task_status("template_out", message="输出可复用高级组件建议")).encode("utf-8")

            # plans
            yield _sse("msg", _agent_to_ui_task_status("plan_apply", message="输出时间点建议清单")).encode("utf-8")
            plans_in = outline_obj.get("plans") if _is_record(outline_obj) and isinstance(outline_obj.get("plans"), list) else []
            n_cues = max(1, len(cues_list))
            plans_out: List[Dict[str, Any]] = []
            for i, p in enumerate(plans_in):
                if not isinstance(p, dict):
                    continue
                pid = _to_safe_str(p.get("id")).strip() or f"p{i+1}"
                title = _to_safe_str(p.get("title")).strip() or pid
                template_ref = _to_safe_str(p.get("templateRef")).strip() or ""

                start_val: Any = p.get("start")
                end_val: Any = p.get("end")
                start_obj: Dict[str, Any] = start_val if isinstance(start_val, dict) else {}
                end_obj: Dict[str, Any] = end_val if isinstance(end_val, dict) else {}
                start_ci: Any = start_obj.get("cueIndex")
                end_ci: Any = end_obj.get("cueIndex")
                if start_ci is None:
                    start_ci = p.get("startCueIndex")
                if end_ci is None:
                    end_ci = p.get("endCueIndex")

                start_i = _normalize_cue_index(start_ci, min_v=0, max_v=n_cues - 1)
                end_i = _normalize_cue_index(end_ci, min_v=0, max_v=n_cues - 1)
                if end_i < start_i:
                    end_i = start_i

                confirm_required = p.get("confirmRequired") if isinstance(p.get("confirmRequired"), bool) else True
                previewable = p.get("previewable") if isinstance(p.get("previewable"), bool) else True

                plans_out.append(
                    {
                        "id": pid,
                        "title": title,
                        "templateRef": template_ref,
                        "start": {"cueIndex": start_i},
                        "end": {"cueIndex": end_i},
                        "confirmRequired": confirm_required,
                        "previewable": previewable,
                    }
                )

            # Fallback: ensure plans are always present and reference existing templates.
            if not plans_out:
                template_ids = [str(t.get("templateId") or "").strip() for t in templates_out if isinstance(t, dict) and str(t.get("templateId") or "").strip()]
                if not template_ids:
                    template_ids = ["tmpl_summary_card", "tmpl_bullet_list", "tmpl_mindmap_node"]

                if outline_items:
                    for i, it in enumerate(outline_items[:8]):
                        if not isinstance(it, dict):
                            continue
                        sc = it.get("startCue")
                        ec = it.get("endCue")
                        start_i = _normalize_cue_index(sc, min_v=0, max_v=n_cues - 1)
                        end_i = _normalize_cue_index(ec, min_v=0, max_v=n_cues - 1)
                        if end_i < start_i:
                            end_i = start_i
                        title = _to_safe_str(it.get("title")).strip() or f"段落 {i+1}"
                        plans_out.append(
                            {
                                "id": f"p{i+1}",
                                "title": title,
                                "templateRef": template_ids[i % len(template_ids)],
                                "start": {"cueIndex": start_i},
                                "end": {"cueIndex": end_i},
                                "confirmRequired": True,
                                "previewable": True,
                            }
                        )
                else:
                    # Split cues into 4 segments.
                    segs = 4
                    step = max(1, (n_cues + segs - 1) // segs)
                    for i in range(segs):
                        start_i = i * step
                        if start_i >= n_cues:
                            break
                        end_i = min(n_cues - 1, (i + 1) * step - 1)
                        plans_out.append(
                            {
                                "id": f"p{i+1}",
                                "title": f"片段 {i+1}",
                                "templateRef": template_ids[i % len(template_ids)],
                                "start": {"cueIndex": start_i},
                                "end": {"cueIndex": end_i},
                                "confirmRequired": True,
                                "previewable": True,
                            }
                        )

            yield _sse("msg", _agent_to_ui_subtitle_summary_delta("plans", plans_out)).encode("utf-8")
            yield _sse("msg", _agent_to_ui_task_status("done", message="字幕总结完成")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")
        except Exception as e:
            yield _sse(
                "msg",
                _agent_to_ui_error(
                    "upstream_error",
                    str(e),
                    details={
                        "outlinePreview": outline_buf[-500:] if isinstance(locals().get("outline_buf"), str) else "",
                        "restPreview": "",
                    },
                ),
            ).encode("utf-8")
            yield _sse("msg", _agent_to_ui_task_status("error", message="字幕总结失败")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp


@csrf_exempt
def stream_style(request: HttpRequest) -> HttpResponseBase:
    """POST /api/ai/subtitle/style:stream

    Input:
    {"layerId":"...", "understanding": {"summary":"...","points":[...]}}

    Output:
    - agentToUi/subtitleSummaryDelta section=style data={notes:[...], palette:{}}
    """

    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    try:
        raw = request.body.decode("utf-8") if request.body else ""
        data: Any = json.loads(raw) if raw else {}
    except Exception:
        data = {}

    body = data if isinstance(data, dict) else {}
    understanding_any: Any = body.get("understanding")
    understanding = understanding_any if isinstance(understanding_any, dict) else {}

    cfg = _deepseek_cfg()
    if not cfg.get("base_url") or not cfg.get("api_key") or not cfg.get("model"):
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

    def gen() -> Generator[bytes, None, None]:
        yield _sse("msg", _agent_to_ui_task_status("started", message="已开始")).encode("utf-8")
        yield _sse("msg", _agent_to_ui_task_status("writing", message="生成说明")).encode("utf-8")

        try:
            u_sum = _to_safe_str(understanding.get("summary")).strip()
            pts_any: Any = understanding.get("points")
            pts_in: List[Any] = pts_any if isinstance(pts_any, list) else []
            pts = [str(x).strip() for x in pts_in if isinstance(x, str) and x.strip()][:6]

            sys = "\n".join(
                [
                    "你是资深 UI/UX 设计师。",
                    "输入是‘字幕整体理解’（主题/场景/要点）。",
                    "任务：给出配色与风格建议，帮助做字幕可视化/思维导图风格的视频画面。",
                    "输出必须是单一 JSON 对象：{\"notes\":[...]}。",
                    "notes：3-6 条中文短句建议，每条尽量可执行（版式/节奏/字体层级/动效风格/色彩倾向等）。",
                    "不要输出 palette 具体色值（那由配色预览技能生成）。",
                ]
            )
            user = "字幕整体理解：\n" + (u_sum or "（空）")
            if pts:
                user += "\n\n要点：\n" + "\n".join([f"- {p}" for p in pts])
            msgs = [
                {"role": "system", "content": sys},
                {"role": "user", "content": user},
            ]

            buf = ""
            for delta in _openai_stream_chat(
                base_url=cfg["base_url"],
                api_key=cfg["api_key"],
                model=cfg["model"],
                messages=msgs,
                response_format={"type": "json_object"},
                timeout_s=35,
            ):
                if delta:
                    buf += delta

            obj = _try_parse_json(buf)
            notes_any: Any = obj.get("notes") if _is_record(obj) else None
            notes_in: List[Any] = notes_any if isinstance(notes_any, list) else []
            notes: List[str] = [str(x).strip() for x in notes_in if isinstance(x, str) and x.strip()]
            notes = [x for x in notes if x][:6]
            if not notes:
                notes = [
                    "版式：标题与正文分区明确，信息层级清晰。",
                    "节奏：每段突出 1 个核心信息，避免堆叠长句。",
                    "点缀：线条/边框可使用轻微发光或模糊作为强调，但保持克制。",
                ]

            yield _sse(
                "msg",
                _agent_to_ui_subtitle_summary_delta(
                    "style",
                    {
                        "palette": {},
                        "notes": notes,
                    },
                ),
            ).encode("utf-8")
            yield _sse("msg", _agent_to_ui_task_status("done", message="完成")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")
        except Exception as e:
            yield _sse("msg", _agent_to_ui_task_status("error", message="发生错误")).encode("utf-8")
            yield _sse(
                "msg",
                _agent_to_ui_error(
                    "upstream_error",
                    str(e),
                    details={"preview": ""},
                ),
            ).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp


@csrf_exempt
def stream_templates(request: HttpRequest) -> HttpResponseBase:
    """POST /api/ai/subtitle/templates:stream

    Input:
    {"layerId":"...", "understanding": {"summary":"...","points":[...]}}

    Output:
    - agentToUi/subtitleSummaryDelta section=templates data=[{templateId,name,category,description:[...]}]
    """

    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    try:
        raw = request.body.decode("utf-8") if request.body else ""
        data: Any = json.loads(raw) if raw else {}
    except Exception:
        data = {}

    body = data if isinstance(data, dict) else {}
    understanding_any: Any = body.get("understanding")
    understanding = understanding_any if isinstance(understanding_any, dict) else {}

    cfg = _deepseek_cfg()
    if not cfg.get("base_url") or not cfg.get("api_key") or not cfg.get("model"):
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

    def gen() -> Generator[bytes, None, None]:
        yield _sse("msg", _agent_to_ui_task_status("started", message="已开始")).encode("utf-8")
        yield _sse("msg", _agent_to_ui_task_status("writing", message="生成说明")).encode("utf-8")

        try:
            u_sum = _to_safe_str(understanding.get("summary")).strip()
            pts_any: Any = understanding.get("points")
            pts_in: List[Any] = pts_any if isinstance(pts_any, list) else []
            pts = [str(x).strip() for x in pts_in if isinstance(x, str) and x.strip()][:6]

            sys = "\n".join(
                [
                    "你是视频动画模板设计师。",
                    "输入是字幕整体理解（主题/要点）。",
                    "任务：生成 2-5 个可复用高级组件的‘描述’，用于后续生成可复用组件模板。",
                    "输出必须是单一 JSON 对象：{\"templates\":[...]}。",
                    "templates 每项字段：templateId(字符串)、name(字符串)、category(可选)、description(3-6 条中文短句)。",
                    "description 必须具体可实现：结构/布局/可替换参数/动效提示。",
                ]
            )
            user = "字幕整体理解：\n" + (u_sum or "（空）")
            if pts:
                user += "\n\n要点：\n" + "\n".join([f"- {p}" for p in pts])
            msgs = [
                {"role": "system", "content": sys},
                {"role": "user", "content": user},
            ]

            buf = ""
            for delta in _openai_stream_chat(
                base_url=cfg["base_url"],
                api_key=cfg["api_key"],
                model=cfg["model"],
                messages=msgs,
                response_format={"type": "json_object"},
                timeout_s=45,
            ):
                if delta:
                    buf += delta

            obj = _try_parse_json(buf)
            templates_in = obj.get("templates") if _is_record(obj) and isinstance(obj.get("templates"), list) else []
            templates_out: List[Dict[str, Any]] = []
            for i, t in enumerate(templates_in):
                if not isinstance(t, dict):
                    continue
                template_id = _to_safe_str(t.get("templateId")).strip() or f"tmpl_{i+1}"
                name = _to_safe_str(t.get("name")).strip() or template_id
                category = _to_safe_str(t.get("category")).strip() or ""
                desc_val: Any = t.get("description")
                desc_in: List[Any] = desc_val if isinstance(desc_val, list) else []
                desc: List[str] = [str(x).strip() for x in desc_in if isinstance(x, str) and x.strip()][:12]
                if not desc:
                    continue
                templates_out.append(
                    {
                        "templateId": template_id,
                        "name": name,
                        "category": category or None,
                        "description": desc,
                    }
                )

            if not templates_out:
                templates_out = [
                    {
                        "templateId": "tmpl_summary_card",
                        "name": "摘要卡片",
                        "category": "summary",
                        "description": [
                            "结构：背景容器矩形 + 顶部标题文本 + 正文摘要文本 + 一条分割线。",
                            "布局：标题在上方靠左，摘要在下方；左右留白一致。",
                            "样式：背景用 palette.background；标题/正文用 palette.text；分割线/边框用 palette.neutral。",
                            "可填充：标题 {{title}}，摘要 {{body}}。",
                        ],
                    },
                    {
                        "templateId": "tmpl_bullet_list",
                        "name": "要点列表卡片",
                        "category": "bullets",
                        "description": [
                            "结构：背景容器矩形 + 标题文本 + 3-5 行要点列表文本 + 左侧小色条。",
                            "布局：标题在上方；要点垂直排列；色条贴左侧作为强调。",
                            "样式：色条用 palette.primary 或 palette.accent；正文用 palette.text；边框/分割线用 palette.neutral。",
                            "可填充：标题 {{title}}，要点 {{text}}（用换行分隔）。",
                        ],
                    },
                ]

            yield _sse("msg", _agent_to_ui_subtitle_summary_delta("templates", templates_out)).encode("utf-8")
            yield _sse("msg", _agent_to_ui_task_status("done", message="完成")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")
        except Exception as e:
            yield _sse("msg", _agent_to_ui_task_status("error", message="发生错误")).encode("utf-8")
            yield _sse(
                "msg",
                _agent_to_ui_error(
                    "upstream_error",
                    str(e),
                    details={"preview": ""},
                ),
            ).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp


@csrf_exempt
def stream_palette(request: HttpRequest) -> HttpResponseBase:
    """POST /api/ai/subtitle/palette:stream

    Request JSON:
    {
      "layerId": "...",
      "summary": {...} | "...",
      "text": "..." (optional)
    }

    SSE:
    - event: msg, data: AgentToUI envelope (taskStatus/subtitleSummaryDelta/error)
    - event: done
    """

    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    try:
        raw = request.body.decode("utf-8") if request.body else ""
        data: Any = json.loads(raw) if raw else {}
    except Exception:
        data = {}

    body = data if isinstance(data, dict) else {}
    summary = body.get("summary")
    text = body.get("text")

    # Always include summary JSON as the grounding context.
    # NOTE: frontend may pass `text` as a nonce/seed; it must not override summary.
    parts: List[str] = []
    try:
        if isinstance(summary, dict):
            parts.append("当前 summary(JSON):\n" + json.dumps(summary, ensure_ascii=False))
        elif isinstance(summary, str) and summary.strip():
            parts.append("当前 summary(text):\n" + summary.strip())
    except Exception:
        pass
    if isinstance(text, str) and text.strip():
        parts.append("额外提示(text):\n" + text.strip())
    input_text = "\n\n".join(parts) if parts else "{}"

    cfg = _deepseek_cfg()
    if not cfg.get("base_url") or not cfg.get("api_key") or not cfg.get("model"):
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

    msgs = _build_palette_messages(text=input_text)

    def gen() -> Generator[bytes, None, None]:
        yield _sse("msg", _agent_to_ui_task_status("palette_gen", message="生成配色…")).encode("utf-8")

        try:
            buf = ""
            for delta in _openai_stream_chat(
                base_url=cfg["base_url"],
                api_key=cfg["api_key"],
                model=cfg["model"],
                messages=msgs,
                response_format={"type": "json_object"},
                timeout_s=60,
            ):
                if delta:
                    buf += delta

            obj = _try_parse_json(buf)
            if not _is_record(obj):
                raise RuntimeError("Model did not return valid JSON for palette")

            style = obj.get("style") if isinstance(obj.get("style"), dict) else {}
            palette_any: Any = style.get("palette")
            palette_in: Dict[Any, Any] = palette_any if isinstance(palette_any, dict) else {}
            palette: Dict[str, str] = {}
            for k, v in palette_in.items():
                if isinstance(k, str) and k.strip() and isinstance(v, str) and v.strip():
                    palette[k.strip()] = v.strip()

            yield _sse(
                "msg",
                _agent_to_ui_subtitle_summary_delta(
                    "style",
                    {
                        "palette": palette,
                    },
                ),
            ).encode("utf-8")
            yield _sse("msg", _agent_to_ui_task_status("palette_done", message="配色已生成")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")
        except Exception as e:
            yield _sse(
                "msg",
                _agent_to_ui_error(
                    "upstream_error",
                    str(e),
                    details={"preview": buf[-500:] if isinstance(locals().get("buf"), str) else ""},
                ),
            ).encode("utf-8")
            yield _sse("msg", _agent_to_ui_task_status("error", message="生成配色失败")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp


@csrf_exempt
def stream_chat(request: HttpRequest) -> HttpResponseBase:
    """POST /api/ai/subtitle/chat:stream

    Request JSON:
    {
      "layerId": "...",
      "cues": [...],
      "cueRanges": [...],
      "markdown": "...",
      "messages": [{"role":"user"|"assistant", "content":"..."}]
    }
    """

    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    try:
        raw = request.body.decode("utf-8") if request.body else ""
        data: Any = json.loads(raw) if raw else {}
    except Exception:
        data = {}

    body = data if isinstance(data, dict) else {}
    cues = body.get("cues")
    cue_ranges = body.get("cueRanges")
    summary = body.get("summary")
    messages_in = body.get("messages")
    deep_mode = bool(body.get("deepMode") is True)

    cues_list: List[Dict[str, Any]] = cues if isinstance(cues, list) else []
    cue_ranges_list: List[Any] = cue_ranges if isinstance(cue_ranges, list) else []
    summary_obj: Any = summary if isinstance(summary, dict) else {}
    msgs_in_list: List[Dict[str, Any]] = messages_in if isinstance(messages_in, list) else []

    cfg = _deepseek_cfg()
    if not cfg.get("base_url") or not cfg.get("api_key") or not cfg.get("model"):
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

    msgs = _build_chat_messages(
        cues=cues_list,
        cue_ranges=cue_ranges_list,
        summary=summary_obj,
        messages=msgs_in_list,
        deep_mode=deep_mode,
    )

    def gen() -> Generator[bytes, None, None]:
        # Align phases/messages with AIChatDialog so the UI can show continuous step updates.
        yield _sse("msg", _agent_to_ui_task_status("started", message="已开始")).encode("utf-8")
        yield _sse("msg", _agent_to_ui_task_status("streaming", message="连接模型")).encode("utf-8")

        try:
            parts: List[str] = []
            sent_writing = False
            for delta in _openai_stream_chat(
                base_url=cfg["base_url"],
                api_key=cfg["api_key"],
                model=cfg["model"],
                messages=msgs,
                response_format=None,
                timeout_s=120,
            ):
                if delta:
                    if not sent_writing:
                        sent_writing = True
                        yield _sse("msg", _agent_to_ui_task_status("writing", message="生成说明")).encode("utf-8")
                    parts.append(delta)
                    # Stream visible text to UI.
                    yield _sse("msg", _agent_to_ui_text(delta, source_model=cfg["model"])) .encode("utf-8")

            full = "".join(parts).strip()
            if not full:
                raise RuntimeError("Model returned empty reply")

            # Also send a final chatMessage for clients that prefer non-stream rendering.
            yield _sse("msg", _agent_to_ui_chat_message(full, source_model=cfg["model"])).encode("utf-8")

            yield _sse("msg", _agent_to_ui_task_status("done", message="完成")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")
        except Exception as e:
            yield _sse("msg", _agent_to_ui_task_status("error", message="发生错误")).encode("utf-8")
            yield _sse(
                "msg",
                _agent_to_ui_error(
                    "upstream_error",
                    str(e),
                    details={"preview": ""},
                ),
            ).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp


@csrf_exempt
def stream_panel_chat(request: HttpRequest) -> HttpResponseBase:
    """POST /api/ai/subtitle/panel-chat:stream

    A dedicated chat skill for the AI subtitle summary panel.

    Input JSON:
    {
      "layerId": "...",
      "summary": { ... },
      "messages": [{"role":"user"|"assistant", "content":"..."}],
      "deepMode": true|false
    }

    Output:
    - agentToUi/taskStatus for progress
    - agentToUi/text deltas (optional)
    - agentToUi/chatMessage with meta.panelPatch (draft proposal; UI applies on click)
    """

    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    try:
        raw = request.body.decode("utf-8") if request.body else ""
        data: Any = json.loads(raw) if raw else {}
    except Exception:
        data = {}

    body = data if isinstance(data, dict) else {}
    summary = body.get("summary")
    messages_in = body.get("messages")
    deep_mode = bool(body.get("deepMode") is True)

    summary_obj: Any = summary if isinstance(summary, dict) else {}
    msgs_in_list: List[Dict[str, Any]] = messages_in if isinstance(messages_in, list) else []

    cfg = _deepseek_cfg()
    if not cfg.get("base_url") or not cfg.get("api_key") or not cfg.get("model"):
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

    def _normalize_chat_messages(items: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        out: List[Dict[str, str]] = []
        for it in items[-30:]:
            if not isinstance(it, dict):
                continue
            role = _to_safe_str(it.get("role")).strip().lower()
            if role not in ("user", "assistant"):
                continue
            content = _to_safe_str(it.get("content")).strip()
            if not content:
                continue
            out.append({"role": role, "content": content})
        return out

    def _extract_summary_for_prompt(s: Any) -> Dict[str, Any]:
        if not isinstance(s, dict):
            return {}
        understanding_any = s.get("understanding")
        u: Dict[str, Any] = understanding_any if isinstance(understanding_any, dict) else {}

        style_any = s.get("style")
        style: Dict[str, Any] = style_any if isinstance(style_any, dict) else {}

        templates_any = s.get("templates")
        templates = templates_any if isinstance(templates_any, list) else []
        # Keep it compact for token + latency.
        return {
            "understanding": {
                "summary": _to_safe_str(u.get("summary")).strip(),
                "points": u.get("points") if isinstance(u.get("points"), list) else [],
            },
            "style": {
                "notes": style.get("notes") if isinstance(style.get("notes"), list) else [],
                # Do not let the model generate palette here; keep for context only.
                "palette": style.get("palette") if isinstance(style.get("palette"), dict) else {},
            },
            "templates": templates,
        }

    sys_prompt = panel_patch_prompts.panel_patch_stage_system_prompt()
    prompt_payload = {
        "deepMode": deep_mode,
        "messages": _normalize_chat_messages(msgs_in_list),
        "summary": _extract_summary_for_prompt(summary_obj),
    }

    msgs = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": json.dumps(prompt_payload, ensure_ascii=False)},
    ]

    def gen() -> Generator[bytes, None, None]:
        yield _sse("msg", _agent_to_ui_task_status("started", message="已开始")).encode("utf-8")
        yield _sse("msg", _agent_to_ui_task_status("streaming", message="连接模型")).encode("utf-8")

        try:
            yield _sse("msg", _agent_to_ui_task_status("writing", message="理解需求并生成修改提案")).encode("utf-8")

            buf = ""
            for delta in _openai_stream_chat(
                base_url=cfg["base_url"],
                api_key=cfg["api_key"],
                model=cfg["model"],
                messages=msgs,
                response_format={"type": "json_object"},
                timeout_s=90,
            ):
                if delta:
                    buf += delta

            obj = _try_parse_json(buf)
            if not _is_record(obj):
                raise RuntimeError("Model did not return valid JSON")

            reply = _to_safe_str(obj.get("reply")).strip()
            target = _to_safe_str(obj.get("target")).strip().lower()
            if target not in ("style", "templates", "both", "none"):
                target = "none"

            # Build draft patch (proposal). It must NOT be auto-applied by the UI.
            panel_patch: Dict[str, Any] = {}

            if target in ("style", "both"):
                style_any: Any = obj.get("style")
                style_in: Dict[str, Any] = style_any if isinstance(style_any, dict) else {}
                notes_any: Any = style_in.get("notes")
                notes_in: List[Any] = notes_any if isinstance(notes_any, list) else []
                notes = [str(x).strip() for x in notes_in if isinstance(x, str) and x.strip()][:8]
                if notes:
                    panel_patch["style"] = {
                        "notes": notes,
                    }

            if target in ("templates", "both"):
                templates_any: Any = obj.get("templates")
                templates_in: List[Any] = templates_any if isinstance(templates_any, list) else []
                templates_out: List[Dict[str, Any]] = []
                for i, t in enumerate(templates_in[:8]):
                    if not isinstance(t, dict):
                        continue
                    template_id = _to_safe_str(t.get("templateId")).strip() or f"tmpl_{i+1}"
                    name = _to_safe_str(t.get("name")).strip() or template_id
                    category = _to_safe_str(t.get("category")).strip() or ""
                    desc_any: Any = t.get("description")
                    desc_in: List[Any] = desc_any if isinstance(desc_any, list) else []
                    desc = [str(x).strip() for x in desc_in if isinstance(x, str) and x.strip()][:12]
                    if not desc:
                        continue
                    templates_out.append(
                        {
                            "templateId": template_id,
                            "name": name,
                            "category": category,
                            "description": desc,
                        }
                    )

                if templates_out:
                    panel_patch["templates"] = templates_out

            # If model decided to patch but output is empty, downgrade to none.
            if target != "none" and not panel_patch:
                target = "none"

            if not reply:
                if target == "none":
                    reply = "我已理解你的问题。目前这条消息不需要修改左侧内容。你也可以明确说‘请修改风格建议…’或‘请新增一个模板…’。"
                else:
                    reply = "我已生成修改提案。请点击‘应用修改’后再更新左侧面板。"

            meta: Dict[str, Any] = {
                "requiresApply": bool(panel_patch),
                "panelPatchTarget": target,
                "panelPatch": panel_patch,
            }

            # Send final chat message with proposal embedded in meta.
            msg = _agent_to_ui_chat_message(reply, source_model=cfg["model"])
            if isinstance(msg, dict):
                msg["meta"] = meta
            yield _sse("msg", msg).encode("utf-8")

            yield _sse("msg", _agent_to_ui_task_status("done", message="完成")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")
        except Exception as e:
            yield _sse("msg", _agent_to_ui_task_status("error", message="发生错误")).encode("utf-8")
            yield _sse(
                "msg",
                _agent_to_ui_error(
                    "upstream_error",
                    str(e),
                    details={"preview": buf[-500:] if isinstance(locals().get("buf"), str) else ""},
                ),
            ).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp
