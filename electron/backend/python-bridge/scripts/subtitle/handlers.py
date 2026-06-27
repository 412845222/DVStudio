"""Subtitle understanding handlers for Python Bridge.

Migrated from Django subtitle_understanding_api.py, removing HTTP/response dependencies.
Uses generator functions to stream AgentToUI envelopes via JSON-RPC.
"""

from __future__ import annotations

import json
import os
import threading
import queue
import time
import uuid
from datetime import datetime
from typing import Any, Dict, Generator, List, Optional

from .utils import (
    extract_top_bigrams,
    is_record,
    normalize_cue_index,
    postprocess_component_template,
    repair_component_template,
    try_parse_json,
    validate_unique_root,
    to_safe_str,
)


def _get_deepseek_config() -> Dict[str, Any]:
    """Get DeepSeek API configuration from environment or return empty."""
    base_url = os.environ.get("DEEPSEEK_BASE_URL") or "https://api.deepseek.com"
    api_key = os.environ.get("DEEPSEEK_API_KEY") or ""
    model = os.environ.get("DEEPSEEK_MODEL") or "deepseek-chat"
    return {
        "base_url": base_url,
        "api_key": api_key,
        "model": model,
    }


def _openai_stream_chat(
    base_url: str,
    api_key: str,
    model: str,
    messages: List[Dict[str, str]],
    response_format: Optional[Dict[str, str]] = None,
    timeout_s: int = 60,
) -> Generator[str, None, None]:
    """Stream chat completion from OpenAI-compatible API."""
    import urllib.request
    import urllib.error

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "text/event-stream",
    }

    body_obj: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": True,
    }
    if response_format:
        body_obj["response_format"] = response_format

    body_data = json.dumps(body_obj).encode("utf-8")
    url = f"{base_url.rstrip('/')}/chat/completions"

    req = urllib.request.Request(url, data=body_data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            for line in resp:
                line_str = line.decode("utf-8").strip()
                if not line_str:
                    continue
                if line_str.startswith("data:"):
                    data_str = line_str[5:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk_obj = json.loads(data_str)
                        choices = chunk_obj.get("choices") or []
                        for choice in choices:
                            delta = choice.get("delta") or {}
                            content = delta.get("content") or ""
                            if content:
                                yield content
                    except json.JSONDecodeError:
                        continue
    except urllib.error.URLError as e:
        raise RuntimeError(f"OpenAI API error: {e}")


def _now_iso_z() -> str:
    """Return current UTC timestamp in ISO format."""
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _agent_to_ui_envelope(type_: str, payload: Any, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Create AgentToUI envelope."""
    obj: Dict[str, Any] = {
        "schemaVersion": 1,
        "id": str(uuid.uuid4()),
        "createdAt": _now_iso_z(),
        "type": type_,
        "payload": payload,
        "source": {"agentName": "deepseek"},
    }
    if meta:
        obj["meta"] = meta
    return obj


def _agent_to_ui_task_status(phase: str, message: Optional[str] = None) -> Dict[str, Any]:
    """Create task status envelope."""
    return _agent_to_ui_envelope(
        "agentToUi/taskStatus",
        {"phase": phase, "message": message or ""},
    )


def _agent_to_ui_error(code: str, message: str, details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Create error envelope."""
    payload: Dict[str, Any] = {"code": code, "message": message}
    if details:
        payload["details"] = details
    return _agent_to_ui_envelope("agentToUi/error", payload)


def _agent_to_ui_subtitle_summary_delta(section: str, data: Any) -> Dict[str, Any]:
    """Create subtitle summary delta envelope."""
    return _agent_to_ui_envelope(
        "agentToUi/subtitleSummaryDelta",
        {"section": section, "data": data},
    )


def _agent_to_ui_text(text: str, source_model: Optional[str] = None) -> Dict[str, Any]:
    """Create text envelope."""
    return _agent_to_ui_envelope(
        "agentToUi/text",
        {"text": text, "sourceModel": source_model or "deepseek"},
    )


def _agent_to_ui_chat_message(content: str, source_model: Optional[str] = None, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Create chat message envelope."""
    payload: Dict[str, Any] = {"content": content, "sourceModel": source_model or "deepseek"}
    return _agent_to_ui_envelope("agentToUi/chatMessage", payload, meta)


def _pick_cue_text(cues: List[Dict[str, Any]], cue_i: int) -> str:
    """Get cue text by index."""
    if cue_i < 0 or cue_i >= len(cues):
        return ""
    c = cues[cue_i]
    t = c.get("text") if isinstance(c, dict) else ""
    return to_safe_str(t).strip()


def _compute_segments_boundaries(cues_in: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Compute segment boundaries for progress bar."""
    n = len(cues_in)
    if n <= 0:
        return []

    seg_count = max(4, min(8, int(round(n / 12)) or 1))
    seg_count = min(seg_count, n)
    seg_size = max(1, int((n + seg_count - 1) / seg_count))

    out: List[Dict[str, Any]] = []
    start = 0
    while start < n:
        end = min(n - 1, start + seg_size - 1)
        c0 = cues_in[start] if start < n else {}
        c1 = cues_in[end] if end < n else {}
        seg: Dict[str, Any] = {"startCue": start, "endCue": end}
        try:
            sm = c0.get("startMs")
            em = c1.get("endMs")
            if isinstance(sm, (int, float)):
                seg["startTimeMs"] = int(sm)
            if isinstance(em, (int, float)):
                seg["endTimeMs"] = int(em)
        except Exception:
            pass
        out.append(seg)
        start = end + 1

    if len(out) >= 2:
        last = out[-1]
        prev = out[-2]
        if (last.get("endCue", 0) - last.get("startCue", 0)) <= 1:
            prev["endCue"] = last.get("endCue", prev.get("endCue"))
            if "endTimeMs" in last:
                prev["endTimeMs"] = last.get("endTimeMs")
            out.pop()
    return out


def subtitle_understand_stream(params: Dict[str, Any]) -> Generator[Dict[str, Any], None, None]:
    """Stream subtitle understanding (outline/style/templates/plans).

    Parameters:
    - cues: List[Dict] - subtitle cues
    - cueRanges: List[Any] - cue ranges
    - scope: str - 'overall' for fast understanding only, 'full' for complete

    Yields: AgentToUI envelopes
    """
    cues = params.get("cues") or []
    cue_ranges = params.get("cueRanges") or []
    scope_any = params.get("scope")
    scope = str(scope_any).strip().lower() if isinstance(scope_any, str) else ""

    cues_list: List[Dict[str, Any]] = cues if isinstance(cues, list) else []
    cue_ranges_list: List[Any] = cue_ranges if isinstance(cue_ranges, list) else []

    cfg = _get_deepseek_config()
    if not cfg.get("base_url") or not cfg.get("api_key") or not cfg.get("model"):
        yield _agent_to_ui_error(
            "missing_config",
            "DeepSeek API Key missing. Set DEEPSEEK_API_KEY environment variable.",
        )
        return

    # Fast scope: only understanding + segments
    if scope in ("overall", "understanding"):
        yield _agent_to_ui_task_status("connect", message="连接")
        yield _agent_to_ui_task_status("submit", message="传入前导词")

        out_q: "queue.Queue[tuple[str, Any]]" = queue.Queue()
        flags = {"understanding": False, "segments": False, "understanding_ok": True}
        understanding_done_at: Optional[float] = None

        def _emit(envelope: Dict[str, Any]) -> None:
            out_q.put(("msg", envelope))

        def _mark_done(kind: str) -> None:
            out_q.put(("done", kind))

        def _worker_understanding() -> None:
            try:
                _emit(_agent_to_ui_task_status("understanding_gen", message="生成字幕整体理解"))

                cue_texts_for_sum: List[str] = []
                for c in cues_list:
                    if not isinstance(c, dict):
                        continue
                    s = to_safe_str(c.get("text")).strip()
                    if s:
                        cue_texts_for_sum.append(s)
                    if len(cue_texts_for_sum) >= 24:
                        break

                sys = "\n".join([
                    "你是字幕理解助手。",
                    "任务：基于字幕内容给出'字幕整体理解'的简短归纳。",
                    "强约束：不要逐句复述字幕原文，不要引用长句，不要输出任何 JSON 以外的内容。",
                    "输出必须是单一 JSON 对象：{\"summary\":\"...\",\"points\":[...]}。",
                    "summary：1-2 句中文，概括主题/场景/核心信息；不要写标题。",
                    "points：可选 2-4 条要点（短句），不能是原句照抄。",
                ])
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

                obj2 = try_parse_json(buf)
                understanding_summary = ""
                understanding_points: List[str] = []
                if is_record(obj2):
                    s2 = to_safe_str(obj2.get("summary")).strip()
                    if s2:
                        understanding_summary = s2
                    pts2_any: Any = obj2.get("points")
                    pts2_in: List[Any] = pts2_any if isinstance(pts2_any, list) else []
                    understanding_points = [str(x).strip() for x in pts2_in if isinstance(x, str) and x.strip()][:6]

                if not understanding_summary:
                    topics = extract_top_bigrams(cue_texts_for_sum, limit=5)
                    if topics:
                        understanding_summary = "主要内容：围绕\"" + "、".join(topics[:4]) + "\"等主题展开。"
                        if not understanding_points:
                            understanding_points = [f"关键词：{t}" for t in topics[:4]]
                    else:
                        understanding_summary = "主要内容：围绕多个主题展开的讲解与要点梳理。"

                _emit(
                    _agent_to_ui_subtitle_summary_delta(
                        "understanding",
                        {"summary": understanding_summary, "points": understanding_points},
                    )
                )
                _emit(_agent_to_ui_task_status("understanding_done", message="字幕整体理解完成"))
            except Exception as e:
                flags["understanding_ok"] = False
                _emit(_agent_to_ui_error("upstream_error", str(e)))
                _emit(_agent_to_ui_task_status("error", message="字幕整体理解失败"))
            finally:
                _mark_done("understanding")

        def _worker_segments() -> None:
            try:
                _emit(_agent_to_ui_task_status("segments_gen", message="生成段落标题（进度条）"))
                segments = _compute_segments_boundaries(cues_list)
                if not segments:
                    _mark_done("segments")
                    return

                cue_samples: List[Dict[str, Any]] = []
                for c in cues_list[:24]:
                    if not isinstance(c, dict):
                        continue
                    t = to_safe_str(c.get("text")).strip()
                    if not t:
                        continue
                    cue_samples.append({"text": t})

                # Simple fallback titles without model call
                items_out: List[Dict[str, Any]] = []
                for i, seg in enumerate(segments):
                    title = f"段落{i + 1}"
                    out_seg = dict(seg)
                    out_seg["title"] = title
                    items_out.append(out_seg)

                _emit(_agent_to_ui_subtitle_summary_delta("segments", {"items": items_out}))
                _emit(_agent_to_ui_task_status("segments_done", message="段落标题已生成"))
            except Exception:
                _emit(_agent_to_ui_task_status("segments_error", message="段落标题生成失败（已忽略）"))
            finally:
                _mark_done("segments")

        t_under = threading.Thread(target=_worker_understanding, daemon=True)
        t_seg = threading.Thread(target=_worker_segments, daemon=True)
        t_under.start()
        t_seg.start()

        segments_timeout_s = 28.0
        while True:
            try:
                kind, payload = out_q.get(timeout=0.2)
            except queue.Empty:
                pass
            else:
                if kind == "msg":
                    yield payload
                elif kind == "done":
                    flags[payload] = True
                    if payload == "understanding":
                        understanding_done_at = time.time()

            if flags.get("understanding"):
                if not flags.get("understanding_ok"):
                    break
                if flags.get("segments"):
                    break
                if understanding_done_at is not None and (time.time() - understanding_done_at) >= segments_timeout_s:
                    break

        yield _agent_to_ui_task_status("done", message="字幕整体理解完成")
        return

    # Full scope: complete understanding flow
    # TODO: implement full scope with outline/style/templates/plans
    # For now, return simple understanding
    yield _agent_to_ui_task_status("connect", message="连接")
    yield _agent_to_ui_task_status("submit", message="传入前导词")

    # Generate simple understanding
    cue_texts: List[str] = []
    for c in cues_list[:24]:
        if isinstance(c, dict):
            s = to_safe_str(c.get("text")).strip()
            if s:
                cue_texts.append(s)

    topics = extract_top_bigrams(cue_texts, limit=5) if cue_texts else []
    understanding_summary = "主要内容：围绕\"" + "、".join(topics[:4]) + "\"等主题展开。" if topics else "主要内容：围绕多个主题展开的讲解与要点梳理。"
    understanding_points = [f"关键词：{t}" for t in topics[:4]] if topics else []

    yield _agent_to_ui_subtitle_summary_delta(
        "understanding",
        {"summary": understanding_summary, "points": understanding_points},
    )
    yield _agent_to_ui_task_status("done", message="完成")


def subtitle_chat_stream(params: Dict[str, Any]) -> Generator[Dict[str, Any], None, None]:
    """Stream subtitle chat based on cues and context.

    Parameters:
    - cues: List[Dict] - subtitle cues
    - cueRanges: List[Any] - cue ranges
    - summary: Dict - current summary JSON
    - messages: List[Dict] - chat history
    - deepMode: bool - enable deep mode

    Yields: AgentToUI envelopes
    """
    cues = params.get("cues") or []
    cue_ranges = params.get("cueRanges") or []
    summary = params.get("summary") or {}
    messages_in = params.get("messages") or []
    deep_mode = bool(params.get("deepMode") is True)

    cfg = _get_deepseek_config()
    if not cfg.get("base_url") or not cfg.get("api_key") or not cfg.get("model"):
        yield _agent_to_ui_error(
            "missing_config",
            "DeepSeek API Key missing. Set DEEPSEEK_API_KEY environment variable.",
        )
        return

    # Build simple context prompt
    context_str = json.dumps(summary, ensure_ascii=False)[:2000] if isinstance(summary, dict) else str(summary)[:2000]

    sys = "\n".join([
        "你是字幕理解助手，负责基于字幕内容和当前总结回答用户问题。",
        "当前字幕总结：",
        context_str,
        "回答时：",
        "- 结合字幕内容，不要编造",
        "- 简洁回答，避免冗长",
    ])

    # Normalize messages
    msgs_normalized: List[Dict[str, str]] = []
    for m in messages_in[-30:]:
        if not isinstance(m, dict):
            continue
        role = str(m.get("role") or "").strip().lower()
        if role not in ("user", "assistant"):
            continue
        content = str(m.get("content") or "").strip()
        if not content:
            continue
        msgs_normalized.append({"role": role, "content": content})

    # Build messages list
    messages: List[Dict[str, str]] = [{"role": "system", "content": sys}]
    messages.extend(msgs_normalized)

    yield _agent_to_ui_task_status("started", message="已开始")
    yield _agent_to_ui_task_status("streaming", message="连接模型")

    try:
        parts: List[str] = []
        sent_writing = False
        for delta in _openai_stream_chat(
            base_url=cfg["base_url"],
            api_key=cfg["api_key"],
            model=cfg["model"],
            messages=messages,
            response_format=None,
            timeout_s=120,
        ):
            if delta:
                if not sent_writing:
                    sent_writing = True
                    yield _agent_to_ui_task_status("writing", message="生成说明")
                parts.append(delta)
                yield _agent_to_ui_text(delta)

        full = "".join(parts).strip()
        if not full:
            raise RuntimeError("Model returned empty reply")

        yield _agent_to_ui_chat_message(full)
        yield _agent_to_ui_task_status("done", message="完成")
    except Exception as e:
        yield _agent_to_ui_task_status("error", message="发生错误")
        yield _agent_to_ui_error("upstream_error", str(e))


def _build_palette_messages(text: str) -> List[Dict[str, str]]:
    """Build messages for palette generation."""
    palette_system = "\n".join([
        "你是 UI/UX 配色助手。",
        "任务：基于给定的字幕整体理解，生成配色建议。",
        "输出必须是单一 JSON 对象：{\"style\":{\"palette\":{...}}}。",
        "palette 字段使用语义化的 key（如 primary/background/text/accent/neutral）和对应的十六进制颜色值。",
        "颜色数量建议 4-8 个，保持对比度和可读性。",
    ])
    user = "字幕理解内容：\n" + (text or "(空)")
    return [
        {"role": "system", "content": palette_system},
        {"role": "user", "content": user},
    ]


def subtitle_style_stream(params: Dict[str, Any]) -> Generator[Dict[str, Any], None, None]:
    """Stream style analysis based on understanding.

    Parameters:
    - understanding: { summary: str, points: List[str] }

    Yields: AgentToUI envelopes
    """
    understanding = params.get("understanding") or {}
    cfg = _get_deepseek_config()

    if not cfg.get("base_url") or not cfg.get("api_key") or not cfg.get("model"):
        yield _agent_to_ui_error(
            "missing_config",
            "DeepSeek API Key missing. Set DEEPSEEK_API_KEY environment variable.",
        )
        return

    yield _agent_to_ui_task_status("started", message="已开始")
    yield _agent_to_ui_task_status("template_gen", message="生成风格建议...")

    try:
        u_sum = to_safe_str(understanding.get("summary")).strip()
        pts = understanding.get("points") or []
        pts = [to_safe_str(p).strip() for p in pts if isinstance(p, str) and p.strip()][:6]

        sys = "\n".join([
            "你是资深 UI/UX 设计师。",
            "输入是'字幕整体理解'（主题/场景/要点）。",
            "任务：给出配色与风格建议，帮助做字幕可视化/思维导图风格的视频画面。",
            "输出必须是单一 JSON 对象：{\"notes\":[...]}。",
            "notes：3-6 条中文短句建议，每条尽量可执行（版式/节奏/字体层级/动效风格/色彩倾向等）。",
            "不要输出 palette 具体色值（那由配色预览技能生成）。",
        ])
        user = "字幕整体理解：\n" + (u_sum or "（空）")
        if pts:
            user += "\n\n要点：\n" + "\n".join([f"- {p}" for p in pts])

        msgs = [
            {"role": "system", "content": sys},
            {"role": "user", "content": user},
        ]

        yield _agent_to_ui_task_status("template_desc_gen", message="细化风格描述...")

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

        obj = try_parse_json(buf)
        notes = []
        if is_record(obj):
            notes_any = obj.get("notes")
            notes = [to_safe_str(x).strip() for x in (notes_any or []) if isinstance(x, str) and x.strip()]

        if not notes:
            notes = [
                "版式：标题与正文分区明确，信息层级清晰。",
                "节奏：每段突出 1 个核心信息，避免堆叠长句。",
                "点缀：线条/边框可使用轻微发光或模糊作为强调，但保持克制。",
            ]

        yield _agent_to_ui_subtitle_summary_delta(
            "style",
            {"palette": {}, "notes": notes[:6]},
        )
        yield _agent_to_ui_task_status("done", message="完成")
    except Exception as e:
        yield _agent_to_ui_task_status("error", message="发生错误")
        yield _agent_to_ui_error("upstream_error", str(e))


def subtitle_templates_stream(params: Dict[str, Any]) -> Generator[Dict[str, Any], None, None]:
    """Stream template suggestions based on understanding.

    Parameters:
    - understanding: { summary: str, points: List[str] }

    Yields: AgentToUI envelopes
    """
    understanding = params.get("understanding") or {}
    cfg = _get_deepseek_config()

    if not cfg.get("base_url") or not cfg.get("api_key") or not cfg.get("model"):
        yield _agent_to_ui_error(
            "missing_config",
            "DeepSeek API Key missing. Set DEEPSEEK_API_KEY environment variable.",
        )
        return

    yield _agent_to_ui_task_status("started", message="已开始")
    yield _agent_to_ui_task_status("writing", message="生成模板建议...")

    try:
        u_sum = to_safe_str(understanding.get("summary")).strip()
        pts = understanding.get("points") or []
        pts = [to_safe_str(p).strip() for p in pts if isinstance(p, str) and p.strip()][:6]

        sys = "\n".join([
            "你是视频动画模板设计师。",
            "输入是字幕整体理解（主题/要点）。",
            "任务：生成 2-5 个可复用高级组件的'描述'，用于后续生成可复用组件模板。",
            "输出必须是单一 JSON 对象：{\"templates\":[...]}。",
            "templates 每项字段：templateId(字符串)、name(字符串)、category(可选)、description(3-6 条中文短句)。",
            "description 必须具体可实现：结构/布局/可替换参数/动效提示。",
        ])
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

        obj = try_parse_json(buf)
        templates_out = []
        if is_record(obj):
            templates_in = obj.get("templates") or []
            if isinstance(templates_in, list):
                for i, t in enumerate(templates_in):
                    if not isinstance(t, dict):
                        continue
                    template_id = to_safe_str(t.get("templateId")).strip() or f"tmpl_{i+1}"
                    name = to_safe_str(t.get("name")).strip() or template_id
                    category = to_safe_str(t.get("category")).strip() or ""
                    desc_any = t.get("description") or []
                    desc = [to_safe_str(x).strip() for x in (desc_any or []) if isinstance(x, str) and x.strip()]
                    if desc:
                        templates_out.append({
                            "templateId": template_id,
                            "name": name,
                            "category": category or None,
                            "description": desc,
                        })

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
            ]

        yield _agent_to_ui_subtitle_summary_delta("templates", templates_out)
        yield _agent_to_ui_task_status("done", message="完成")
    except Exception as e:
        yield _agent_to_ui_task_status("error", message="发生错误")
        yield _agent_to_ui_error("upstream_error", str(e))


def subtitle_palette_stream(params: Dict[str, Any]) -> Generator[Dict[str, Any], None, None]:
    """Stream palette generation based on summary.

    Parameters:
    - summary: Object - current summary JSON
    - text: str - optional additional text

    Yields: AgentToUI envelopes
    """
    summary = params.get("summary") or {}
    text = params.get("text")

    cfg = _get_deepseek_config()

    if not cfg.get("base_url") or not cfg.get("api_key") or not cfg.get("model"):
        yield _agent_to_ui_error(
            "missing_config",
            "DeepSeek API Key missing. Set DEEPSEEK_API_KEY environment variable.",
        )
        return

    # Build input text
    parts = []
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

    msgs = _build_palette_messages(input_text)

    yield _agent_to_ui_task_status("palette_gen", message="生成配色...")

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

        obj = try_parse_json(buf)
        if not is_record(obj):
            raise RuntimeError("Model did not return valid JSON for palette")

        style = obj.get("style") if isinstance(obj.get("style"), dict) else {}
        palette_any = style.get("palette") if isinstance(style, dict) else {}
        palette_in = palette_any if isinstance(palette_any, dict) else {}
        palette = {}
        for k, v in palette_in.items():
            if isinstance(k, str) and k.strip() and isinstance(v, str) and v.strip():
                palette[k.strip()] = v.strip()

        yield _agent_to_ui_subtitle_summary_delta(
            "style",
            {"palette": palette},
        )
        yield _agent_to_ui_task_status("palette_done", message="配色已生成")
    except Exception as e:
        yield _agent_to_ui_task_status("error", message="生成配色失败")
        yield _agent_to_ui_error("upstream_error", str(e))


def subtitle_panel_chat_stream(params: Dict[str, Any]) -> Generator[Dict[str, Any], None, None]:
    """Stream panel chat for subtitle summary editing.

    Parameters:
    - summary: Object - current summary JSON
    - messages: List[Dict] - chat history
    - deepMode: bool - enable deep mode

    Yields: AgentToUI envelopes
    """
    summary = params.get("summary") or {}
    messages_in = params.get("messages") or []
    deep_mode = bool(params.get("deepMode") is True)

    cfg = _get_deepseek_config()

    if not cfg.get("base_url") or not cfg.get("api_key") or not cfg.get("model"):
        yield _agent_to_ui_error(
            "missing_config",
            "DeepSeek API Key missing. Set DEEPSEEK_API_KEY environment variable.",
        )
        return

    # Normalize messages
    msgs_normalized = []
    for m in (messages_in or [])[-30:]:
        if not isinstance(m, dict):
            continue
        role = str(m.get("role") or "").strip().lower()
        if role not in ("user", "assistant"):
            continue
        content = str(m.get("content") or "").strip()
        if not content:
            continue
        msgs_normalized.append({"role": role, "content": content})

    # Extract summary for prompt
    def extract_summary_for_prompt(s):
        if not isinstance(s, dict):
            return {}
        u = s.get("understanding") or {}
        if isinstance(u, dict):
            u = {"summary": to_safe_str(u.get("summary")).strip(), "points": u.get("points") or []}
        else:
            u = {"summary": "", "points": []}

        st = s.get("style") or {}
        if isinstance(st, dict):
            st = {
                "notes": st.get("notes") or [],
                "palette": st.get("palette") or {},
            }
        else:
            st = {"notes": [], "palette": {}}

        templates = s.get("templates") or []
        if not isinstance(templates, list):
            templates = []

        return {
            "understanding": u,
            "style": st,
            "templates": templates,
        }

    sys_prompt = "\n".join([
        "你是字幕面板编辑助手，帮助用户修改字幕总结的风格建议和模板建议。",
        "根据用户对话和当前总结内容，生成修改提案。",
        "输出必须是单一 JSON 对象：{\"reply\":\"...\",\"target\":\"style|templates|both|none\",\"style\":{...},\"templates\":[...]}}。",
        "reply：自然语言回复，简洁回答用户问题。",
        "target：指明修改了哪个部分（style/templates/both/none）。",
        "如果用户只是询问，保持 target=none。",
    ])

    prompt_payload = {
        "deepMode": deep_mode,
        "messages": msgs_normalized,
        "summary": extract_summary_for_prompt(summary),
    }

    msgs = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": json.dumps(prompt_payload, ensure_ascii=False)},
    ]

    yield _agent_to_ui_task_status("started", message="已开始")
    yield _agent_to_ui_task_status("streaming", message="连接模型")
    yield _agent_to_ui_task_status("writing", message="理解需求并生成修改提案")

    try:
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

        obj = try_parse_json(buf)
        if not is_record(obj):
            raise RuntimeError("Model did not return valid JSON")

        reply = to_safe_str(obj.get("reply")).strip()
        target = to_safe_str(obj.get("target")).strip().lower()
        if target not in ("style", "templates", "both", "none"):
            target = "none"

        # Build patch
        panel_patch = {}
        if target in ("style", "both"):
            style_any = obj.get("style")
            if isinstance(style_any, dict):
                notes_any = style_any.get("notes") or []
                notes = [to_safe_str(x).strip() for x in notes_any if isinstance(x, str) and x.strip()][:8]
                if notes:
                    panel_patch["style"] = {"notes": notes}

        if target in ("templates", "both"):
            templates_any = obj.get("templates") or []
            templates_out = []
            for i, t in enumerate((templates_any or [])[:8]):
                if not isinstance(t, dict):
                    continue
                template_id = to_safe_str(t.get("templateId")).strip() or f"tmpl_{i+1}"
                name = to_safe_str(t.get("name")).strip() or template_id
                category = to_safe_str(t.get("category")).strip() or ""
                desc_any = t.get("description") or []
                desc = [to_safe_str(x).strip() for x in desc_any if isinstance(x, str) and x.strip()][:12]
                if desc:
                    templates_out.append({
                        "templateId": template_id,
                        "name": name,
                        "category": category,
                        "description": desc,
                    })
            if templates_out:
                panel_patch["templates"] = templates_out

        if target != "none" and not panel_patch:
            target = "none"

        if not reply:
            if target == "none":
                reply = "我已理解你的问题。目前这条消息不需要修改左侧内容。"
            else:
                reply = "我已生成修改提案。请点击'应用修改'后再更新左侧面板。"

        meta = {
            "requiresApply": bool(panel_patch),
            "panelPatchTarget": target,
            "panelPatch": panel_patch,
        }

        yield _agent_to_ui_chat_message(reply, meta=meta)
        yield _agent_to_ui_task_status("done", message="完成")
    except Exception as e:
        yield _agent_to_ui_task_status("error", message="发生错误")
        yield _agent_to_ui_error("upstream_error", str(e))


def subtitle_ping(params: Dict[str, Any]) -> Dict[str, Any]:
    """Ping subtitle AI service.

    Returns service status without making API calls.
    """
    import os as _os
    api_key = _os.environ.get("DEEPSEEK_API_KEY", "")
    has_key = bool(api_key and api_key.strip())
    return {
        "status": "ok",
        "service": "subtitle",
        "provider": "deepseek",
        "model": _os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
        "apiKeyConfigured": has_key,
        "pid": _os.getpid(),
    }


def subtitle_template_stream(params: Dict[str, Any]) -> Generator[Dict[str, Any], None, None]:
    """Stream single component template generation.

    Parameters:
    - templateDescription: Dict - { templateId, name, category, description: List[str] }
    - palette: Dict - color palette
    - paletteLocked: bool
    - requireGlow: bool

    Yields: AgentToUI envelopes
    """
    template_desc = params.get("templateDescription") or {}
    palette = params.get("palette") or {}
    palette_locked = bool(params.get("paletteLocked") is True)
    require_glow = bool(params.get("requireGlow") is True)

    cfg = _get_deepseek_config()

    if not cfg.get("base_url") or not cfg.get("api_key") or not cfg.get("model"):
        yield _agent_to_ui_error(
            "missing_config",
            "DeepSeek API Key missing. Set DEEPSEEK_API_KEY environment variable.",
        )
        return

    # Build simple fallback template
    template_id = to_safe_str(template_desc.get("templateId")).strip() or "tmpl_fallback"
    name = to_safe_str(template_desc.get("name")).strip() or template_id

    # Build a simple default template based on description
    desc_list = template_desc.get("description") or []
    desc_text = "\n".join([f"- {d}" for d in desc_list if isinstance(d, str) and d.strip()][:6])

    yield _agent_to_ui_task_status("template_gen", message=f"生成组件模板：{name}...")

    try:
        # For now, return a simple hardcoded template structure
        # This can be enhanced later with actual LLM template generation
        import uuid
        fallback_template = {
            "schemaVersion": 1,
            "templateId": template_id,
            "name": name,
            "params": [
                {"key": "title", "type": "string"},
                {"key": "body", "type": "string"},
            ],
            "rootLocalId": "root",
            "nodes": [
                {
                    "localId": "root",
                    "type": "rect",
                    "props": {
                        "fill": (palette.get("background") if isinstance(palette, dict) else "") or "#1a1a2e",
                    },
                    "transform": {"x": 0, "y": 0, "width": 800, "height": 300},
                },
                {
                    "localId": "title",
                    "type": "text",
                    "parentLocalId": "root",
                    "props": {
                        "textContent": "{{title}}",
                        "fill": (palette.get("text") if isinstance(palette, dict) else "") or "#ffffff",
                        "fontSize": 32,
                        "fontWeight": "bold",
                    },
                    "transform": {"x": 40, "y": 40, "width": 720, "height": 50},
                },
                {
                    "localId": "body",
                    "type": "text",
                    "parentLocalId": "root",
                    "props": {
                        "textContent": "{{body}}",
                        "fill": (palette.get("text") if isinstance(palette, dict) else "") or "#cccccc",
                        "fontSize": 18,
                    },
                    "transform": {"x": 40, "y": 110, "width": 720, "height": 150},
                },
            ],
        }

        # Apply post-processing
        msg = _agent_to_ui_subtitle_summary_delta(
            "template",
            {"templateId": template_id, "template": fallback_template},
        )
        msg = postprocess_component_template(msg, {
            "palette": palette if isinstance(palette, dict) else {},
            "paletteLocked": palette_locked,
            "requireGlow": require_glow,
        })

        yield msg
        yield _agent_to_ui_task_status("done", message="完成")
    except Exception as e:
        yield _agent_to_ui_task_status("error", message="生成模板失败")
        yield _agent_to_ui_error("upstream_error", str(e))


def register_handlers(dispatcher) -> None:
    """Register subtitle handlers with dispatcher."""
    dispatcher.register("subtitle.ping", subtitle_ping)
    dispatcher.register("subtitle.understand:stream", subtitle_understand_stream)
    dispatcher.register("subtitle.chat:stream", subtitle_chat_stream)
    dispatcher.register("subtitle.style:stream", subtitle_style_stream)
    dispatcher.register("subtitle.templates:stream", subtitle_templates_stream)
    dispatcher.register("subtitle.palette:stream", subtitle_palette_stream)
    dispatcher.register("subtitle.panel-chat:stream", subtitle_panel_chat_stream)
    dispatcher.register("subtitle.template:stream", subtitle_template_stream)