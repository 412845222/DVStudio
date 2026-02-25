from __future__ import annotations

import base64
import binascii
import json
import mimetypes
import os
import shutil
from pathlib import Path
import re
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Generator, Iterable, List, Optional, Set, Tuple

from django.conf import settings
from django.http import HttpRequest, HttpResponseNotAllowed, JsonResponse, StreamingHttpResponse
from django.http.response import HttpResponseBase
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from .models import BlueprintProject

from dwebapp.ai.api.chat.utils import (
    _agent_to_ui_chat_message,
    _agent_to_ui_error,
    _agent_to_ui_task_status,
    _agent_to_ui_text,
    _apply_sse_headers,
    _deepseek_cfg,
    _openai_chat,
    _openai_stream_chat,
    _sse,
)


def _json_error(message: str, status: int = 400) -> Response:
    return Response({"ok": False, "error": message}, status=status)


def _is_record(v: Any) -> bool:
    return isinstance(v, dict)


def _coerce_request_payload(v: Any) -> Dict[str, Any]:
    if isinstance(v, dict):
        return v

    # DRF may give QueryDict for some content-types.
    dict_method = getattr(v, "dict", None)
    if callable(dict_method):
        try:
            out = dict_method()
            if isinstance(out, dict):
                return out
        except Exception:
            return {}

    return {}


def _normalize_base_url(raw: Any) -> Tuple[Optional[str], Optional[str]]:
    v = str(raw or "").strip()
    if not v:
        return None, "baseUrl is required"

    # Convenience: allow user input like 127.0.0.1:8188
    if "://" not in v:
        v = "http://" + v

    try:
        p = urllib.parse.urlparse(v)
    except Exception:
        return None, "baseUrl is invalid"

    if p.scheme not in ("http", "https"):
        return None, "baseUrl must be http or https"

    if not p.netloc:
        return None, "baseUrl host is missing"

    # strip trailing slash
    base = v[:-1] if v.endswith("/") else v
    return base, None


def _request_json(method: str, url: str, payload: Optional[Dict[str, Any]] = None, timeout_sec: float = 5.0) -> Tuple[Optional[Any], Optional[str]]:
    data = None
    headers = {
        "Accept": "application/json",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as res:
            raw = res.read()
            try:
                return json.loads(raw.decode("utf-8")), None
            except Exception:
                return None, "invalid json response"
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="ignore")
        except Exception:
            body = ""
        return None, f"http {e.code}: {body}".strip()
    except urllib.error.URLError as e:
        return None, f"url error: {getattr(e, 'reason', str(e))}"
    except Exception as e:
        return None, str(e)


def _request_raw(method: str, url: str, data: Optional[bytes] = None, headers: Optional[Dict[str, str]] = None, timeout_sec: float = 10.0) -> Tuple[Optional[bytes], Optional[str]]:
    h = {"Accept": "application/json"}
    if headers:
        h.update({str(k): str(v) for k, v in headers.items()})
    req = urllib.request.Request(url, data=data, headers=h, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as res:
            return res.read(), None
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="ignore")
        except Exception:
            body = ""
        return None, f"http {e.code}: {body}".strip()
    except urllib.error.URLError as e:
        return None, f"url error: {getattr(e, 'reason', str(e))}"
    except Exception as e:
        return None, str(e)


def _encode_multipart_form(fields: Dict[str, str], files: List[Tuple[str, str, bytes, str]]) -> Tuple[bytes, Dict[str, str]]:
    boundary = uuid.uuid4().hex
    body = bytearray()
    crlf = b"\r\n"

    def _add(s: bytes) -> None:
        body.extend(s)

    for name, value in fields.items():
        _add(b"--" + boundary.encode("utf-8") + crlf)
        _add(f'Content-Disposition: form-data; name="{name}"'.encode("utf-8") + crlf)
        _add(crlf)
        _add(str(value).encode("utf-8"))
        _add(crlf)

    for field_name, filename, content, content_type in files:
        _add(b"--" + boundary.encode("utf-8") + crlf)
        _add(
            f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"'.encode("utf-8")
            + crlf
        )
        _add(f"Content-Type: {content_type or 'application/octet-stream'}".encode("utf-8") + crlf)
        _add(crlf)
        _add(content)
        _add(crlf)

    _add(b"--" + boundary.encode("utf-8") + b"--" + crlf)
    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Accept": "application/json",
    }
    return bytes(body), headers


def _fetch_userdata_json(base: str, workflow_path: str) -> Tuple[Optional[Any], Optional[str]]:
    wp = str(workflow_path or "").strip()
    if wp.startswith("/"):
        wp = wp[1:]
    if not wp:
        return None, "workflowPath is required"
    quoted = urllib.parse.quote(wp, safe="")
    url = base + "/userdata/" + quoted
    raw, raw_err = _request_raw("GET", url, data=None, headers={"Accept": "application/json"}, timeout_sec=10.0)
    if raw_err or raw is None:
        return None, f"ComfyUI /userdata/{{file}} failed: {raw_err or 'unknown error'}"
    try:
        text = raw.decode("utf-8-sig")
    except Exception:
        text = raw.decode("utf-8", errors="ignore")
    try:
        return json.loads(text), None
    except Exception:
        preview = text[:300].replace("\n", "\\n")
        return None, f"invalid workflow json: {preview}"


def _extract_object_info_input_order(info: Any) -> List[str]:
    if not isinstance(info, dict):
        return []
    io = info.get("input_order")
    if not isinstance(io, dict):
        return []
    req = io.get("required")
    opt = io.get("optional")
    req_list = [str(x) for x in req if isinstance(x, str)] if isinstance(req, list) else []
    opt_list = [str(x) for x in opt if isinstance(x, str)] if isinstance(opt, list) else []
    return req_list + opt_list


def _extract_object_info_input_defs(info: Any) -> Dict[str, Any]:
    if not isinstance(info, dict):
        return {}
    raw = info.get("input")
    if not isinstance(raw, dict):
        return {}
    out: Dict[str, Any] = {}
    for bucket_name in ("required", "optional"):
        bucket = raw.get(bucket_name)
        if not isinstance(bucket, dict):
            continue
        for k, v in bucket.items():
            if isinstance(k, str):
                out[k] = v
    return out


def _is_object_info_widget_def(defn: Any) -> bool:
    # object_info input defs look like: ["INT", {..}] or [["a","b"], {..}] or ["MODEL", {}]
    if not isinstance(defn, (list, tuple)) or not defn:
        return False
    t = defn[0]
    if isinstance(t, (list, tuple)):
        return True
    if isinstance(t, str):
        # Socket types are link-only (not widgets). Everything else is treated as widget.
        socket_types = {
            "MODEL",
            "CLIP",
            "VAE",
            "CONDITIONING",
            "LATENT",
            "IMAGE",
            "MASK",
            "SAMPLER",
            "SIGMAS",
        }
        if t in socket_types:
            return False
        return True
    return False


def _object_info_def_default(defn: Any) -> Any:
    if not isinstance(defn, (list, tuple)):
        return None
    if len(defn) < 2 or not isinstance(defn[1], dict):
        return None
    return defn[1].get("default")


def _object_info_value_fits(defn: Any, value: Any) -> bool:
    # Strict-ish fit check so we can skip legacy extra widget values.
    if not isinstance(defn, (list, tuple)) or not defn:
        return False
    t = defn[0]

    # Enum / combo: prefer actual string option values.
    if isinstance(t, (list, tuple)):
        if isinstance(value, str):
            return value in set(str(x) for x in t)
        # Do NOT accept numeric indices here; we prefer skipping them if a real string exists later.
        return False

    if not isinstance(t, str):
        return False
    tt = t.upper()

    if tt == "INT":
        if isinstance(value, bool):
            return False
        if isinstance(value, int):
            return True
        if isinstance(value, str):
            s = value.strip()
            return s.isdigit() or (s.startswith("-") and s[1:].isdigit())
        return False

    if tt == "FLOAT":
        if isinstance(value, bool):
            return False
        if isinstance(value, (int, float)):
            return True
        if isinstance(value, str):
            try:
                float(value.strip())
                return True
            except Exception:
                return False
        return False

    if tt in ("BOOLEAN", "BOOL"):
        if isinstance(value, bool):
            return True
        if isinstance(value, int):
            return True
        if isinstance(value, str):
            return value.strip().lower() in ("true", "false", "enable", "disable", "enabled", "disabled", "1", "0")
        return False

    if tt == "STRING":
        return isinstance(value, str)

    # Any other non-socket widget types: accept strings/ints/floats/bools as-is.
    return isinstance(value, (str, int, float, bool))


def _object_info_coerce_value(defn: Any, value: Any) -> Any:
    if not isinstance(defn, (list, tuple)) or not defn:
        return value
    t = defn[0]

    if isinstance(t, (list, tuple)):
        # Enum: keep string; fallback to default if invalid.
        if isinstance(value, str) and value in set(str(x) for x in t):
            return value
        d = _object_info_def_default(defn)
        return d if d is not None else value

    if not isinstance(t, str):
        return value
    tt = t.upper()

    if tt == "INT":
        if isinstance(value, int) and not isinstance(value, bool):
            return value
        if isinstance(value, (float,)):
            return int(value)
        if isinstance(value, str):
            try:
                return int(value.strip())
            except Exception:
                d = _object_info_def_default(defn)
                return d if d is not None else value
        d = _object_info_def_default(defn)
        return d if d is not None else value

    if tt == "FLOAT":
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value.strip())
            except Exception:
                d = _object_info_def_default(defn)
                return d if d is not None else value
        d = _object_info_def_default(defn)
        return d if d is not None else value

    if tt in ("BOOLEAN", "BOOL"):
        if isinstance(value, bool):
            return value
        if isinstance(value, int):
            return bool(value)
        if isinstance(value, str):
            v = value.strip().lower()
            if v in ("true", "enable", "enabled", "1"):
                return True
            if v in ("false", "disable", "disabled", "0"):
                return False
        d = _object_info_def_default(defn)
        return d if d is not None else value

    if tt == "STRING":
        return str(value)

    return value


def _workflow_to_prompt(
    workflow: Any,
    known_node_types: Optional[set[str]] = None,
    object_info: Optional[Dict[str, Any]] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    if not isinstance(workflow, dict):
        return None, "workflow must be object"
    nodes = workflow.get("nodes")
    links = workflow.get("links")
    if not isinstance(nodes, list) or not isinstance(links, list):
        return None, "workflow.nodes/workflow.links missing"

    link_from_by_id: Dict[int, Tuple[int, int]] = {}
    used_node_ids: set[int] = set()
    for l in links:
        if not (isinstance(l, list) or isinstance(l, tuple)) or len(l) < 5:
            continue
        try:
            link_id = int(l[0])
            from_node_id = int(l[1])
            from_slot = int(l[2])
            to_node_id = int(l[3])
        except Exception:
            continue
        link_from_by_id[link_id] = (from_node_id, from_slot)
        used_node_ids.add(from_node_id)
        used_node_ids.add(to_node_id)

    prompt: Dict[str, Any] = {}
    unknown_used_types: set[str] = set()

    for node in nodes:
        if not isinstance(node, dict):
            continue
        raw_node_id = node.get("id")
        if raw_node_id is None:
            continue
        try:
            node_id = int(raw_node_id)
        except Exception:
            continue
        class_type = str(node.get("type") or "").strip()
        if not class_type:
            continue

        # Always ignore obvious UI-only nodes.
        if class_type in ("MarkdownNote",):
            continue

        if known_node_types is not None and class_type not in known_node_types:
            if node_id in used_node_ids:
                unknown_used_types.add(class_type)
            continue

        inputs_spec = node.get("inputs")
        inputs_list = inputs_spec if isinstance(inputs_spec, list) else []
        widget_values = node.get("widgets_values")
        values = widget_values if isinstance(widget_values, list) else []
        value_idx = 0

        inputs: Dict[str, Any] = {}

        linked_names: set[str] = set()
        for inp in inputs_list:
            if not isinstance(inp, dict):
                continue
            name = str(inp.get("name") or "").strip()
            if not name:
                continue
            link = inp.get("link")
            if link is not None:
                try:
                    link_id = int(link)
                except Exception:
                    continue
                from_info = link_from_by_id.get(link_id)
                if not from_info:
                    continue
                from_node_id, from_slot = from_info
                inputs[name] = [str(from_node_id), from_slot]
                linked_names.add(name)
                continue

        # Prefer object_info to determine *which* inputs are widgets and their canonical order.
        ordered_widget_names: List[str] = []
        if object_info and isinstance(object_info, dict):
            info = object_info.get(class_type)
            defs = _extract_object_info_input_defs(info)
            if defs:
                # Workflow JSON stores widgets_values following the node's input list order (UI order).
                # We only consume values for inputs that are actually widgets per ComfyUI object_info,
                # and we skip already-linked inputs.
                for inp in inputs_list:
                    if not isinstance(inp, dict):
                        continue
                    name = str(inp.get("name") or "").strip()
                    if not name or name in linked_names or name in inputs:
                        continue
                    if not _is_object_info_widget_def(defs.get(name)):
                        continue
                    ordered_widget_names.append(name)

        if ordered_widget_names and values:
            info = object_info.get(class_type) if isinstance(object_info, dict) else None
            defs = _extract_object_info_input_defs(info)

            idx = 0
            for name in ordered_widget_names:
                if name in inputs:
                    continue
                defn = defs.get(name)
                assigned = False
                while idx < len(values):
                    cand = values[idx]
                    if _object_info_value_fits(defn, cand):
                        inputs[name] = _object_info_coerce_value(defn, cand)
                        idx += 1
                        assigned = True
                        break
                    # Skip legacy/extra values that don't match current node schema.
                    idx += 1

                if not assigned:
                    d = _object_info_def_default(defn)
                    if d is not None:
                        inputs[name] = d
        else:
            # Fallback to workflow's input list order.
            for inp in inputs_list:
                if not isinstance(inp, dict):
                    continue
                name = str(inp.get("name") or "").strip()
                if not name:
                    continue
                if name in inputs:
                    continue
                if inp.get("link") is not None:
                    continue
                widget = inp.get("widget")
                if isinstance(widget, dict):
                    if value_idx < len(values):
                        inputs[name] = values[value_idx]
                    value_idx += 1

        prompt[str(node_id)] = {
            "class_type": class_type,
            "inputs": inputs,
        }

    if unknown_used_types:
        types_str = ", ".join(sorted(unknown_used_types))
        return None, f"workflow contains unknown node types (used by links): {types_str}"

    return prompt, None


def _upload_image_to_comfyui(base: str, filename: str, content: bytes, content_type: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    url = base + "/upload/image"
    fields = {"type": "input"}
    body, headers = _encode_multipart_form(fields, [("image", filename or "input.png", content, content_type or "application/octet-stream")])
    raw, raw_err = _request_raw("POST", url, data=body, headers=headers, timeout_sec=30.0)
    if raw_err or raw is None:
        return None, f"ComfyUI /upload/image failed: {raw_err or 'unknown error'}"
    try:
        out = json.loads(raw.decode("utf-8"))
    except Exception:
        return None, "ComfyUI /upload/image invalid json response"
    if not isinstance(out, dict):
        return None, "ComfyUI /upload/image invalid response"
    return out, None


def _patch_workflow_load_images(workflow: Dict[str, Any], uploaded_paths: List[str]) -> None:
    nodes = workflow.get("nodes")
    if not isinstance(nodes, list):
        return
    load_nodes = [n for n in nodes if isinstance(n, dict) and str(n.get("type") or "") == "LoadImage"]
    try:
        load_nodes.sort(key=lambda n: int((n.get("id") if isinstance(n, dict) else 0) or 0))
    except Exception:
        pass

    for idx, path in enumerate(uploaded_paths):
        if idx >= len(load_nodes):
            break
        n = load_nodes[idx]
        wv = n.get("widgets_values")
        if not isinstance(wv, list):
            wv = []
        # LoadImage: widgets_values[0] is filename, [1] is "image".
        if len(wv) >= 1:
            wv[0] = path
        else:
            wv.append(path)
        if len(wv) < 2:
            wv.append("image")
        n["widgets_values"] = wv


def _is_prompt_graph_json(v: Any) -> bool:
    # Prompt graph format: {"123": {"class_type": "X", "inputs": {...}}, ...}
    # Workflow format has top-level "nodes"/"links".
    if not isinstance(v, dict):
        return False
    if "nodes" in v and "links" in v:
        return False
    # Find at least one node-like entry.
    saw = 0
    for k, val in v.items():
        if not isinstance(k, str) or not k.isdigit():
            continue
        if not isinstance(val, dict):
            continue
        if "class_type" not in val or "inputs" not in val:
            continue
        if not isinstance(val.get("inputs"), dict):
            continue
        saw += 1
        if saw >= 2:
            return True
    return saw >= 1


def _extract_direct_prompt_graph(saved_json: Any) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    if not isinstance(saved_json, dict):
        return None, "保存文件不是 JSON 对象"

    # Case A: top-level is already prompt graph.
    if _is_prompt_graph_json(saved_json):
        return saved_json, None

    # Case B: wrapped payload that contains a prompt graph.
    wrapped = saved_json.get("prompt")
    if _is_prompt_graph_json(wrapped):
        return wrapped, None

    # Not directly runnable by /prompt without conversion.
    if "nodes" in saved_json and "links" in saved_json:
        return None, "当前文件是 Workflow 画布格式（nodes/links），按你的要求不做后端拼接转换。请在 ComfyUI 导出 API 格式（Prompt JSON）后再运行。"

    return None, "当前文件不包含可直接提交的 prompt graph（需要 class_type/inputs 结构）"


def _extract_workflow_id(saved_json: Any) -> str:
    if not isinstance(saved_json, dict):
        return ""
    wid = saved_json.get("id")
    if wid is None:
        return ""
    return str(wid).strip()


def _extract_prompt_and_extra_from_entry(entry: Any) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    # Comfy queue/history prompt tuple commonly: [priority, prompt_id, prompt_graph, extra_data, outputs]
    if isinstance(entry, list) and len(entry) >= 3 and isinstance(entry[2], dict):
        extra = entry[3] if len(entry) >= 4 and isinstance(entry[3], dict) else None
        return entry[2], extra
    return None, None


def _extract_workflow_id_from_extra(extra: Any) -> str:
    if not isinstance(extra, dict):
        return ""
    epi = extra.get("extra_pnginfo")
    if not isinstance(epi, dict):
        return ""
    wf = epi.get("workflow")
    if not isinstance(wf, dict):
        return ""
    wid = wf.get("id")
    return str(wid).strip() if wid is not None else ""


def _extract_create_time_from_extra(extra: Any) -> int:
    if not isinstance(extra, dict):
        return 0
    raw = extra.get("create_time")
    if raw is None:
        return 0
    try:
        val = int(str(raw).strip())
        return val if val > 0 else 0
    except Exception:
        return 0


def _find_prompt_graph_from_comfy_state(base: str, workflow_id: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    candidates: List[Tuple[int, int, Dict[str, Any]]] = []

    # 仅复用 history，不走 queue，不做 workflow->prompt 转换。
    hist_url = base + "/history"
    hist_out, hist_err = _request_json("GET", hist_url, payload=None, timeout_sec=10.0)
    if not hist_err and isinstance(hist_out, dict):
        rank = 0
        for _, item in hist_out.items():
            if not isinstance(item, dict):
                continue
            p = item.get("prompt")
            prompt, extra = _extract_prompt_and_extra_from_entry(p)
            if not isinstance(prompt, dict):
                continue
            item_wid = _extract_workflow_id_from_extra(extra)
            if workflow_id:
                if item_wid != workflow_id:
                    continue
            # 优先使用 extra_data.create_time 更大的记录；没有时退化到迭代顺序。
            create_time = _extract_create_time_from_extra(extra)
            candidates.append((create_time, rank, prompt))
            rank += 1

    if not candidates:
        return None, "未在 ComfyUI history 中找到可复用的 prompt graph。请先在 ComfyUI 前端运行一次该工作流。"

    candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return candidates[0][2], None


def _extract_template_input_overrides(payload: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    raw = payload.get("templateInputs")
    if not isinstance(raw, dict):
        raw = payload.get("nodeInputs")
    if not isinstance(raw, dict):
        return {}

    out: Dict[str, Dict[str, Any]] = {}
    for node_id, input_map in raw.items():
        key = str(node_id or "").strip()
        if not key:
            continue
        if not isinstance(input_map, dict):
            continue
        cleaned: Dict[str, Any] = {}
        for input_name, value in input_map.items():
            name = str(input_name or "").strip()
            if not name:
                continue
            cleaned[name] = value
        if cleaned:
            out[key] = cleaned
    return out


class WorkflowTemplatePromptFiller:
    def __init__(self, workflow: Dict[str, Any], object_info: Optional[Dict[str, Any]], known_node_types: Optional[set[str]]):
        self.workflow = workflow
        self.object_info = object_info
        self.known_node_types = known_node_types

    @classmethod
    def from_context(cls, base: str, workflow: Dict[str, Any], object_info: Optional[Dict[str, Any]]) -> "WorkflowTemplatePromptFiller":
        known_types = (
            {str(k) for k in object_info.keys() if isinstance(k, str)}
            if isinstance(object_info, dict)
            else _get_known_node_types(base)
        )
        return cls(workflow=workflow, object_info=object_info, known_node_types=known_types)

    def build_prompt_graph(self) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        graph, err = _workflow_to_prompt(
            self.workflow,
            known_node_types=self.known_node_types,
            object_info=self.object_info,
        )
        if not isinstance(graph, dict):
            return None, err or "workflow template to prompt failed"
        return graph, None

    def apply_input_overrides(self, prompt_graph: Dict[str, Any], overrides: Dict[str, Dict[str, Any]]) -> None:
        if not isinstance(prompt_graph, dict) or not isinstance(overrides, dict) or not overrides:
            return

        def _is_valid_link_ref(v: Any) -> bool:
            if not isinstance(v, (list, tuple)) or len(v) != 2:
                return False
            left = v[0]
            right = v[1]
            return isinstance(left, (str, int)) and isinstance(right, int)

        for node_id, input_map in overrides.items():
            node = prompt_graph.get(str(node_id))
            if not isinstance(node, dict):
                continue
            inputs = node.get("inputs")
            if not isinstance(inputs, dict):
                inputs = {}

            class_type = str(node.get("class_type") or "")
            info = self.object_info.get(class_type) if isinstance(self.object_info, dict) and class_type else None
            defs = _extract_object_info_input_defs(info)

            for name, value in input_map.items():
                key = str(name or "").strip()
                if not key:
                    continue
                defn = defs.get(key)

                if isinstance(defn, (list, tuple)) and defn:
                    type_token = defn[0]
                    if isinstance(type_token, str):
                        socket_types = {
                            "MODEL",
                            "CLIP",
                            "VAE",
                            "CONDITIONING",
                            "LATENT",
                            "IMAGE",
                            "MASK",
                            "SAMPLER",
                            "SIGMAS",
                            "AUDIO",
                            "VIDEO",
                            "CLIP_VISION_OUTPUT",
                        }
                        if type_token in socket_types:
                            if _is_valid_link_ref(value):
                                left = value[0]
                                right = value[1]
                                inputs[key] = [str(left), int(right)]
                            continue

                if defn is not None:
                    inputs[key] = _object_info_coerce_value(defn, value)
                else:
                    if isinstance(value, (str, int, float, bool, list, tuple, dict)):
                        inputs[key] = value

            node["inputs"] = inputs


def _apply_text_overrides(prompt_graph: Dict[str, Any], positive_prompt: str, negative_prompt: str) -> None:
    pp = str(positive_prompt or "").strip()
    np = str(negative_prompt or "").strip()
    if not pp and not np:
        return

    text_nodes: List[Tuple[int, Dict[str, Any]]] = []
    for k, v in prompt_graph.items():
        if not (isinstance(k, str) and k.isdigit() and isinstance(v, dict)):
            continue
        if str(v.get("class_type") or "") != "CLIPTextEncode":
            continue
        try:
            nid = int(k)
        except Exception:
            continue
        text_nodes.append((nid, v))
    text_nodes.sort(key=lambda x: x[0])

    if not text_nodes:
        return

    negative_idxs: List[int] = []
    positive_idxs: List[int] = []
    for idx, (_, node) in enumerate(text_nodes):
        meta = node.get("_meta")
        title = ""
        if isinstance(meta, dict):
            title = str(meta.get("title") or "")
        t = title.lower()
        if "negative" in t or "负" in title:
            negative_idxs.append(idx)
        else:
            positive_idxs.append(idx)

    if pp:
        targets = positive_idxs if positive_idxs else [0]
        for i in targets:
            node = text_nodes[i][1]
            inputs = node.get("inputs")
            if not isinstance(inputs, dict):
                inputs = {}
            inputs["text"] = pp
            node["inputs"] = inputs

    if np:
        if negative_idxs:
            targets = negative_idxs
        elif len(text_nodes) >= 2:
            targets = [1]
        else:
            targets = [0]
        for i in targets:
            node = text_nodes[i][1]
            inputs = node.get("inputs")
            if not isinstance(inputs, dict):
                inputs = {}
            inputs["text"] = np
            node["inputs"] = inputs


def _build_proxy_view_url(base: str, filename: str, subfolder: str, folder_type: str) -> str:
    q = urllib.parse.urlencode(
        {
            "baseUrl": base,
            "filename": filename,
            "subfolder": subfolder,
            "type": folder_type,
        }
    )
    return "/api/workflow/view?" + q


def _extract_media_from_history_result(base: str, result: Any, prompt_id: str) -> List[Dict[str, Any]]:
    item = None
    if isinstance(result, dict):
        if prompt_id and isinstance(result.get(prompt_id), dict):
            item = result.get(prompt_id)
        elif len(result) == 1:
            first_val = next(iter(result.values()))
            if isinstance(first_val, dict):
                item = first_val
    if not isinstance(item, dict):
        return []

    outputs = item.get("outputs")
    if not isinstance(outputs, dict):
        return []

    out: List[Dict[str, Any]] = []

    def _kind_by_filename(name: str) -> Optional[str]:
        n = str(name or "").strip().lower()
        if not n:
            return None
        if any(n.endswith(ext) for ext in (".mp4", ".webm", ".mov", ".mkv", ".avi", ".gif")):
            return "video"
        if any(n.endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".webp", ".bmp")):
            return "image"
        return None

    def _node_sort_key(v: Any) -> Tuple[int, str]:
        s = str(v or "").strip()
        try:
            return (0, f"{int(s):012d}")
        except Exception:
            return (1, s)

    sorted_nodes = sorted(outputs.items(), key=lambda kv: _node_sort_key(kv[0]))

    for node_id, node_out in sorted_nodes:
        if not isinstance(node_out, dict):
            continue
        for key in ("images", "gifs", "videos"):
            arr = node_out.get(key)
            if not isinstance(arr, list):
                continue
            for media in arr:
                if not isinstance(media, dict):
                    continue
                filename = str(media.get("filename") or "").strip()
                if not filename:
                    continue
                subfolder = str(media.get("subfolder") or "").strip()
                folder_type = str(media.get("type") or "output").strip()
                kind = "video" if key in ("gifs", "videos") else "image"
                inferred_kind = _kind_by_filename(filename)
                if inferred_kind in ("image", "video"):
                    kind = inferred_kind
                out.append(
                    {
                        "nodeId": str(node_id),
                        "kind": kind,
                        "filename": filename,
                        "subfolder": subfolder,
                        "type": folder_type,
                        "url": _build_proxy_view_url(base, filename, subfolder, folder_type),
                    }
                )
    return out


def _persist_bridge_input_file(filename: str, content: bytes) -> Optional[str]:
    try:
        media_root = str(getattr(settings, "MEDIA_ROOT", "") or "").strip()
        if not media_root:
            media_root = os.path.join(os.getcwd(), "media")
        target_dir = os.path.join(media_root, "comfyui_bridge_inputs")
        os.makedirs(target_dir, exist_ok=True)

        safe_name = os.path.basename(str(filename or "input.bin")).replace("\x00", "")
        if not safe_name:
            safe_name = "input.bin"
        stamp = str(int(time.time() * 1000))
        out_name = f"{stamp}-{uuid.uuid4().hex[:8]}-{safe_name}"
        out_path = os.path.join(target_dir, out_name)
        with open(out_path, "wb") as f:
            f.write(content)
        return out_path
    except Exception:
        return None


def _persist_reuse_analysis_snapshot(
    workflow_id: str,
    workflow_path: str,
    workflow_json: Dict[str, Any],
    prompt_reused: Dict[str, Any],
    prompt_submitted: Dict[str, Any],
    meta: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    try:
        media_root = str(getattr(settings, "MEDIA_ROOT", "") or "").strip()
        if not media_root:
            media_root = os.path.join(os.getcwd(), "media")

        safe_workflow_id = str(workflow_id or "unknown").replace("/", "_").replace("\\", "_")
        run_id = f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}"
        run_dir = os.path.join(media_root, "comfyui_bridge_reuse", safe_workflow_id, run_id)
        os.makedirs(run_dir, exist_ok=True)

        def _write_json(filename: str, value: Any) -> str:
            out_path = os.path.join(run_dir, filename)
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(value, f, ensure_ascii=False, indent=2)
            return out_path

        workflow_file = _write_json("workflow.template.json", workflow_json)
        reused_file = _write_json("prompt.reused.json", prompt_reused)
        submitted_file = _write_json("prompt.submitted.json", prompt_submitted)
        meta_file = _write_json(
            "run.meta.json",
            {
                "savedAt": int(time.time() * 1000),
                "workflowId": workflow_id,
                "workflowPath": workflow_path,
                **(meta if isinstance(meta, dict) else {}),
            },
        )

        return {
            "runId": run_id,
            "runDir": run_dir,
            "files": {
                "workflowTemplate": workflow_file,
                "promptReused": reused_file,
                "promptSubmitted": submitted_file,
                "meta": meta_file,
            },
        }
    except Exception:
        return None


def _coerce_bool(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return int(v) != 0
    s = str(v or "").strip().lower()
    return s in ("1", "true", "yes", "on", "y")


def _get_reuse_records_root() -> str:
    media_root = str(getattr(settings, "MEDIA_ROOT", "") or "").strip()
    if not media_root:
        media_root = os.path.join(os.getcwd(), "media")
    return os.path.join(media_root, "comfyui_bridge_reuse")


def _find_latest_local_record(workflow_id: str) -> Optional[Dict[str, Any]]:
    safe_workflow_id = str(workflow_id or "").strip().replace("/", "_").replace("\\", "_")
    if not safe_workflow_id:
        return None
    base_dir = os.path.join(_get_reuse_records_root(), safe_workflow_id)
    if not os.path.isdir(base_dir):
        return None

    latest: Optional[Dict[str, Any]] = None
    latest_score = -1
    try:
        children = os.listdir(base_dir)
    except Exception:
        return None

    for name in children:
        run_dir = os.path.join(base_dir, name)
        if not os.path.isdir(run_dir):
            continue
        meta_path = os.path.join(run_dir, "run.meta.json")
        submitted_path = os.path.join(run_dir, "prompt.submitted.json")
        if not os.path.isfile(meta_path) or not os.path.isfile(submitted_path):
            continue
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            continue
        if not isinstance(meta, dict):
            continue
        saved_at_raw = meta.get("savedAt")
        try:
            saved_at = int(str(saved_at_raw).strip()) if saved_at_raw is not None else 0
        except Exception:
            saved_at = 0
        if saved_at > latest_score:
            latest_score = saved_at
            latest = {
                "runDir": run_dir,
                "meta": meta,
                "promptSubmittedPath": submitted_path,
            }

    return latest


def _load_prompt_from_local_record(record: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    if not isinstance(record, dict):
        return None, "record is invalid"
    path = str(record.get("promptSubmittedPath") or "").strip()
    if not path:
        return None, "record prompt path missing"
    try:
        with open(path, "r", encoding="utf-8") as f:
            out = json.load(f)
    except Exception as e:
        return None, f"load local record failed: {e}"
    if not isinstance(out, dict):
        return None, "local record prompt is not object"
    return out, None


def _merge_runtime_settings_from_workflow(
    prompt_graph: Dict[str, Any],
    workflow_any: Any,
    object_info: Optional[Dict[str, Any]],
    base: str,
) -> None:
    if not isinstance(prompt_graph, dict) or not isinstance(workflow_any, dict):
        return

    known_types = {str(k) for k in object_info.keys() if isinstance(k, str)} if isinstance(object_info, dict) else _get_known_node_types(base)
    converted, _ = _workflow_to_prompt(workflow_any, known_node_types=known_types, object_info=object_info)
    if not isinstance(converted, dict):
        return

    def _is_link_ref(v: Any) -> bool:
        if not isinstance(v, (list, tuple)) or len(v) != 2:
            return False
        left = v[0]
        right = v[1]
        return isinstance(left, (str, int)) and isinstance(right, int)

    def _is_scalar(v: Any) -> bool:
        return isinstance(v, (str, int, float, bool))

    for node_id, dst_node in prompt_graph.items():
        if not isinstance(node_id, str) or not isinstance(dst_node, dict):
            continue
        src_node = converted.get(node_id)
        if not isinstance(src_node, dict):
            continue

        dst_class = str(dst_node.get("class_type") or "")
        src_class = str(src_node.get("class_type") or "")
        if dst_class and src_class and dst_class != src_class:
            continue

        dst_inputs = dst_node.get("inputs")
        src_inputs = src_node.get("inputs")
        if not isinstance(dst_inputs, dict) or not isinstance(src_inputs, dict):
            continue

        for key, value in src_inputs.items():
            if _is_scalar(value) or _is_link_ref(value):
                dst_inputs[str(key)] = value

        dst_node["inputs"] = dst_inputs


def _patch_prompt_graph_load_images(prompt_graph: Dict[str, Any], uploaded_paths: List[str]) -> None:
    # In API prompt format, LoadImage node uses inputs["image"] = filename
    load_nodes: List[Tuple[int, Dict[str, Any]]] = []
    for k, v in prompt_graph.items():
        if not (isinstance(k, str) and k.isdigit() and isinstance(v, dict)):
            continue
        if str(v.get("class_type") or "") != "LoadImage":
            continue
        try:
            nid = int(k)
        except Exception:
            continue
        load_nodes.append((nid, v))
    load_nodes.sort(key=lambda x: x[0])

    for idx, path in enumerate(uploaded_paths):
        if idx >= len(load_nodes):
            break
        _, node = load_nodes[idx]
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            inputs = {}
        inputs["image"] = path
        node["inputs"] = inputs


def _normalize_prompt_graph_for_runtime(prompt_graph: Dict[str, Any], object_info: Optional[Dict[str, Any]] = None) -> None:
    # Sanitize socket-like inputs.
    # Keep only valid link refs: [node_id, output_index].
    # Any scalar/null placeholder may trigger runtime type errors downstream.
    socket_types = {
        "MODEL",
        "CLIP",
        "VAE",
        "CONDITIONING",
        "LATENT",
        "IMAGE",
        "MASK",
        "SAMPLER",
        "SIGMAS",
        "AUDIO",
        "VIDEO",
        "CLIP_VISION_OUTPUT",
    }

    def _is_valid_link_ref(v: Any) -> bool:
        if not isinstance(v, (list, tuple)) or len(v) != 2:
            return False
        left = v[0]
        right = v[1]
        return isinstance(left, (str, int)) and isinstance(right, int)

    for _, node in prompt_graph.items():
        if not isinstance(node, dict):
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue

        class_type = str(node.get("class_type") or "")
        # Primary path: use object_info defs to identify socket inputs.
        info = None
        if isinstance(object_info, dict) and class_type:
            info = object_info.get(class_type)
        defs = _extract_object_info_input_defs(info)
        if defs:
            for name, defn in defs.items():
                if name not in inputs:
                    continue
                if not isinstance(defn, (list, tuple)) or not defn:
                    continue
                t = defn[0]
                if not isinstance(t, str) or t not in socket_types:
                    continue
                if not _is_valid_link_ref(inputs.get(name)):
                    inputs.pop(name, None)

        # Extra fallback for known problematic optional sockets when defs unavailable.
        for key in ("clip_vision_output", "audio"):
            if key in inputs and not _is_valid_link_ref(inputs.get(key)):
                inputs.pop(key, None)

        node["inputs"] = inputs


def _get_known_node_types(base: str) -> Optional[set[str]]:
    url = base + "/object_info"
    out, out_err = _request_json("GET", url, payload=None, timeout_sec=10.0)
    if out_err or not isinstance(out, dict):
        return None
    return {str(k) for k in out.keys() if isinstance(k, str)}


def _get_object_info(base: str) -> Optional[Dict[str, Any]]:
    url = base + "/object_info"
    out, out_err = _request_json("GET", url, payload=None, timeout_sec=15.0)
    if out_err or not isinstance(out, dict):
        return None
    return out


def _filter_workflow_files(items: Any) -> List[Dict[str, str]]:
    if not isinstance(items, list):
        return []

    out: List[Dict[str, str]] = []
    for it in items:
        if not isinstance(it, str):
            continue
        rel = it.strip().replace("\\", "/")
        if not rel:
            continue
        lower = rel.lower()
        if not lower.endswith(".json"):
            continue
        if lower.endswith(".index.json"):
            continue
        name = rel.rsplit("/", 1)[-1]
        if name.lower().endswith(".json"):
            name = name[: -len(".json")]
        out.append({"path": f"workflows/{rel}", "name": name})

    out.sort(key=lambda x: (x.get("name", ""), x.get("path", "")))
    return out


@api_view(["POST"])
def ping(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    base, err = _normalize_base_url(payload.get("baseUrl"))
    if err:
        return _json_error(err)
    if not base:
        return _json_error("baseUrl is invalid")

    # Use /system_stats as a reliable health endpoint with version/device info.
    stats_url = base + "/system_stats"
    stats, stats_err = _request_json("GET", stats_url, payload=None, timeout_sec=3.0)
    if stats_err or not isinstance(stats, dict):
        return _json_error(f"ComfyUI unreachable: {stats_err or 'unknown error'}", status=502)

    system_raw = stats.get("system")
    system: Dict[str, Any] = system_raw if isinstance(system_raw, dict) else {}
    devices_raw = stats.get("devices")
    devices = devices_raw if isinstance(devices_raw, list) else []
    device0_raw = devices[0] if devices and isinstance(devices[0], dict) else {}
    device0: Dict[str, Any] = device0_raw if isinstance(device0_raw, dict) else {}

    return Response(
        {
            "ok": True,
            "baseUrl": base,
            "comfyui": {
                "version": system.get("comfyui_version"),
                "os": system.get("os"),
                "deviceName": device0.get("name"),
            },
        }
    )


@csrf_exempt
@api_view(["POST"])
def blueprint_chat(request: Request) -> Response:
    """Generic chat endpoint for Blueprint / AIWorkflow UI.

    Body:
      - content: string (required)
      - history: [{role: 'user'|'assistant'|'system', content: string}] (optional)

    Returns:
      - { ok: true, assistant: string, model?: string }
      - { ok: false, error: string, need?: string[] }
    """

    payload = _coerce_request_payload(request.data)
    content = str(payload.get("content") or payload.get("message") or "").strip()
    if not content:
        return Response({"ok": False, "error": "content is required"}, status=400)

    cfg = _deepseek_cfg()
    if not cfg.get("base_url") or not cfg.get("api_key") or not cfg.get("model"):
        return Response(
            {
                "ok": False,
                "error": "DeepSeek API Key missing. Please set it in Settings (encrypted DB), or set env var DEEPSEEK_API_KEY.",
                "need": ["DEEPSEEK_BASE_URL", "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL"],
            },
            status=500,
        )

    raw_hist = payload.get("history")
    hist = raw_hist if isinstance(raw_hist, list) else []

    messages: List[Dict[str, str]] = [
        {
            "role": "system",
            "content": "你是 Dweb Video Studio 的蓝图工作流助手。请用简洁中文回答，并尽量给出可执行的步骤或参数建议。",
        }
    ]

    # Best-effort: keep last N messages to avoid huge prompt.
    # (UI will send full list; backend keeps it bounded.)
    MAX_HISTORY = 30
    tail = hist[-MAX_HISTORY:]
    for it in tail:
        if not isinstance(it, dict):
            continue
        role = it.get("role")
        msg = it.get("content")
        if role not in ("user", "assistant", "system"):
            continue
        if not isinstance(msg, str) or not msg.strip():
            continue
        messages.append({"role": str(role), "content": msg.strip()})

    # Ensure the current user message is appended last.
    messages.append({"role": "user", "content": content})

    try:
        text = _openai_chat(
            base_url=str(cfg["base_url"]),
            api_key=str(cfg["api_key"]),
            model=str(cfg["model"]),
            messages=messages,
        )
    except Exception as e:
        return Response({"ok": False, "error": str(e)}, status=502)

    return Response({"ok": True, "assistant": str(text or ""), "model": str(cfg["model"])})


@csrf_exempt
def nanobanana_ref_cache(request: HttpRequest) -> HttpResponseBase:
    """Cache reference images on Django backend for NanoBanana.

    Content-Type: multipart/form-data
      - refImages: file[]

    Response:
      - {ok:true, cacheIds:["202602/<uuid>.png", ...]}
    """

    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    uploads = []
    try:
        uploads = list(request.FILES.getlist("refImages") or [])
    except Exception:
        uploads = []

    if not uploads:
        return JsonResponse({"ok": False, "error": "refImages is required"}, status=400)

    cache_ids: List[str] = []
    for up in uploads:
        if up is None:
            continue
        try:
            content = up.read()
            name = str(getattr(up, "name", "ref.png") or "ref.png")
            ct = str(getattr(up, "content_type", "") or "")
            if not ct:
                ct = mimetypes.guess_type(name)[0] or "application/octet-stream"
            cache_id = _nanobanana_save_ref_cache(name, content, ct)
            if cache_id:
                cache_ids.append(cache_id)
        except Exception:
            continue

    if len(cache_ids) != len(uploads):
        return JsonResponse(
            {
                "ok": False,
                "error": "failed to cache some refImages",
                "cached": len(cache_ids),
                "received": len(uploads),
            },
            status=500,
        )

    return JsonResponse({"ok": True, "cacheIds": cache_ids})


@csrf_exempt
@api_view(["POST"])
def nanobanana_generate(_: Request) -> Response:
    """NanoBanana image generation endpoint (sync).

    Note: UI is expected to use the SSE endpoint `nanobanana_generate_stream`.
    This sync endpoint is kept for convenience / debugging.

        Body JSON:
            - prompt: string
            - aspectRatio: string (optional; e.g. "16:9")
            - imageSize: string (optional; "1K"/"2K"/"4K"; only for gemini-3-pro-image-preview)
            - usePro: bool (optional; when true, uses gemini-3-pro-image-preview)

    Response:
      - {ok:true, imageUrl:"/media/...png", billing?:string}
    """

    # DRF Request: may already be parsed.
    payload = _coerce_request_payload(getattr(_, "data", None))
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        return _json_error("prompt is required", status=400)

    cfg = _nanobanana_cfg()
    if not cfg.get("api_key"):
        return Response(
            {
                "ok": False,
                "error": "Gemini API Key missing. Please set it in Settings (encrypted DB), or set env vars NANOBANANA_API_KEY/GEMINI_API_KEY.",
                "need": ["NANOBANANA_API_KEY"],
            },
            status=500,
        )

    raw_ar = payload.get("aspectRatio") or payload.get("aspect_ratio")
    aspect_ratio = _nanobanana_coerce_aspect_ratio(raw_ar)
    raw_size = payload.get("imageSize") or payload.get("image_size")
    image_size = _nanobanana_coerce_image_size(raw_size)

    use_pro = _nanobanana_truthy(payload.get("usePro") or payload.get("use_pro") or payload.get("pro"))
    if use_pro:
        cfg = _nanobanana_cfg_with_model(cfg, "gemini-3-pro-image-preview")

    # Backward-compatible fallback: if old clients still send width/height, infer the closest allowed aspect ratio.
    if not aspect_ratio:
        try:
            width = int(payload.get("width") or 0)
            height = int(payload.get("height") or 0)
        except Exception:
            width, height = 0, 0
        if width > 0 and height > 0:
            aspect_ratio = _nanobanana_pick_aspect_ratio(width, height)

    try:
        payload_obj = _nanobanana_build_gemini_payload(
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            image_size=image_size,
            ref_images=None,
            model=str(cfg.get("model") or ""),
        )
        upstream_obj = _nanobanana_call_gemini_once(cfg, payload_obj, stream=False)
        img = _nanobanana_extract_inline_image(upstream_obj)
        if not img:
            return Response({"ok": False, "error": "gemini did not return inline image", "upstream": upstream_obj}, status=502)
        mime_type, data = img
        local_url = _nanobanana_save_inline_image(mime_type, data)
        billing_text = _nanobanana_extract_billing_text(upstream_obj)
        out: Dict[str, Any] = {
            "ok": True,
            "imageUrl": local_url,
            "model": str(cfg.get("model") or ""),
            "usePro": str(cfg.get("model") or "") == "gemini-3-pro-image-preview",
        }
        if billing_text:
            out["billing"] = billing_text
        return Response(out)
    except Exception as e:
        return Response({"ok": False, "error": str(e)}, status=502)


def _nanobanana_cfg() -> Dict[str, str]:
    """Load NanoBanana (Gemini) config from env or encrypted DB storage.

    Official API key: https://aistudio.google.com/apikey
    Official endpoints (REST):
        - POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
        - POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent
    """

    NANOBANANA_DEFAULT_MODEL = "gemini-2.5-flash-image"
    NANOBANANA_PRO_MODEL = "gemini-3-pro-image-preview"
    NANOBANANA_ALLOWED_MODELS = {NANOBANANA_DEFAULT_MODEL, NANOBANANA_PRO_MODEL}

    def _nanobanana_normalize_model(raw: str) -> str:
        m = str(raw or "").strip()
        if not m:
            return NANOBANANA_DEFAULT_MODEL
        if m in NANOBANANA_ALLOWED_MODELS:
            return m

        # Backward-compat: older app builds hard-coded deprecated text-only models.
        legacy_map = {
            "gemini-2.0-flash": NANOBANANA_DEFAULT_MODEL,
            "gemini-2.0-flash-lite": NANOBANANA_DEFAULT_MODEL,
            "gemini-2.5-flash": NANOBANANA_DEFAULT_MODEL,
            "gemini-2.5-flash-lite": NANOBANANA_DEFAULT_MODEL,
        }
        if m in legacy_map:
            return legacy_map[m]

        # Any other model string is treated as unsupported for this endpoint,
        # because we rely on Gemini native image generation returning inline images.
        return NANOBANANA_DEFAULT_MODEL

    def _env_or_default(name: str, fallback: str) -> str:
        v = os.environ.get(name)
        return v if v else fallback

    api_key = _env_or_default("NANOBANANA_API_KEY", "").strip()
    if not api_key:
        try:
            from dwebapp.ai.credentials_store import get_gemini_api_key

            api_key = (get_gemini_api_key() or "").strip()
        except Exception:
            api_key = ""
    model = _nanobanana_normalize_model(_env_or_default("NANOBANANA_MODEL", NANOBANANA_DEFAULT_MODEL))
    api_base = _env_or_default(
        "NANOBANANA_API_BASE",
        "https://generativelanguage.googleapis.com/v1beta",
    ).strip() or "https://generativelanguage.googleapis.com/v1beta"
    timeout_sec = _env_or_default("NANOBANANA_TIMEOUT_SEC", "120").strip() or "120"

    # Optional overrides.
    generate_url = _env_or_default("NANOBANANA_GENERATE_URL", "").strip()
    stream_url = _env_or_default("NANOBANANA_STREAM_URL", "").strip()
    if not generate_url:
        generate_url = api_base.rstrip("/") + f"/models/{model}:generateContent"
    if not stream_url:
        stream_url = api_base.rstrip("/") + f"/models/{model}:streamGenerateContent"

    return {
        "generate_url": generate_url,
        "stream_url": stream_url,
        "api_key": api_key,
        "model": model,
        "api_base": api_base,
        "timeout_sec": timeout_sec,
    }


def _nanobanana_truthy(v: Any) -> bool:
    if v is None:
        return False
    if isinstance(v, bool):
        return bool(v)
    s = str(v).strip().lower()
    return s in ("1", "true", "yes", "y", "on", "pro")


def _nanobanana_cfg_with_model(cfg: Dict[str, str], model: str) -> Dict[str, str]:
    # Keep in sync with _nanobanana_cfg() model rules.
    allowed = {"gemini-2.5-flash-image", "gemini-3-pro-image-preview"}
    m = str(model or "").strip()
    if not m:
        return cfg
    if m not in allowed:
        m = "gemini-2.5-flash-image"
    api_base = str(cfg.get("api_base") or "https://generativelanguage.googleapis.com/v1beta").strip() or "https://generativelanguage.googleapis.com/v1beta"
    next_cfg = dict(cfg)
    next_cfg["model"] = m
    # Always recompose default URLs for the overridden model to avoid calling the wrong endpoint.
    next_cfg["generate_url"] = api_base.rstrip("/") + f"/models/{m}:generateContent"
    next_cfg["stream_url"] = api_base.rstrip("/") + f"/models/{m}:streamGenerateContent"
    return next_cfg


_NANOBANANA_ALLOWED_ASPECT_RATIOS: List[Tuple[int, int]] = [
    (1, 1),
    (2, 3),
    (3, 2),
    (3, 4),
    (4, 3),
    (4, 5),
    (5, 4),
    (9, 16),
    (16, 9),
    (21, 9),
]


def _nanobanana_pick_aspect_ratio(width: int, height: int) -> str:
    if width <= 0 or height <= 0:
        return "1:1"
    try:
        target = width / float(height)
    except Exception:
        return "1:1"
    best = (1, 1)
    best_diff = float("inf")
    for w, h in _NANOBANANA_ALLOWED_ASPECT_RATIOS:
        diff = abs(target - (w / float(h)))
        if diff < best_diff:
            best = (w, h)
            best_diff = diff
    return f"{best[0]}:{best[1]}"


def _nanobanana_pick_image_size(width: int, height: int) -> str:
    # Gemini docs use 1K/2K/4K (uppercase K).
    max_dim = max(int(width or 0), int(height or 0))
    if max_dim <= 1024:
        return "1K"
    if max_dim <= 2048:
        return "2K"
    return "4K"


def _nanobanana_coerce_aspect_ratio(raw: Any) -> Optional[str]:
    v = str(raw or "").strip()
    if not v:
        return None
    allowed = {f"{w}:{h}" for (w, h) in _NANOBANANA_ALLOWED_ASPECT_RATIOS}
    return v if v in allowed else None


def _nanobanana_coerce_image_size(raw: Any) -> Optional[str]:
    v = str(raw or "").strip().upper()
    if not v:
        return None
    return v if v in ("1K", "2K", "4K") else None


def _nanobanana_build_gemini_payload(
    *,
    prompt: str,
    aspect_ratio: Optional[str],
    image_size: Optional[str],
    ref_images: Optional[List[Tuple[str, bytes, str]]],
    model: str,
) -> Dict[str, Any]:
    parts: List[Dict[str, Any]] = [{"text": str(prompt or "")}]
    if ref_images:
        for ref_image in ref_images:
            try:
                _, content, content_type = ref_image
                mime_type = str(content_type or "application/octet-stream")
                parts.append(
                    {
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": base64.b64encode(content).decode("ascii"),
                        }
                    }
                )
            except Exception:
                continue

    image_cfg: Dict[str, Any] = {}
    ar = _nanobanana_coerce_aspect_ratio(aspect_ratio)
    if ar:
        image_cfg["aspectRatio"] = ar

    # Only documented for gemini-3-pro-image-preview; omit otherwise to avoid hard failures.
    if (model or "").strip() == "gemini-3-pro-image-preview":
        sz = _nanobanana_coerce_image_size(image_size)
        if sz:
            image_cfg["imageSize"] = sz

    gen_cfg: Dict[str, Any] = {"responseModalities": ["IMAGE"]}
    if image_cfg:
        gen_cfg["imageConfig"] = image_cfg

    return {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": gen_cfg,
    }


def _nanobanana_with_key(url: str, api_key: str) -> str:
    u = str(url or "").strip()
    if not api_key:
        return u
    sep = "&" if "?" in u else "?"
    return f"{u}{sep}key={api_key}"


def _nanobanana_call_gemini_once(cfg: Dict[str, str], payload: Dict[str, Any], *, stream: bool) -> Any:
    url = str(cfg.get("stream_url" if stream else "generate_url") or "").strip()
    if not url:
        raise ValueError("NanoBanana Gemini URL missing")
    api_key = str(cfg.get("api_key") or "").strip()
    url = _nanobanana_with_key(url, api_key)
    timeout = float(cfg.get("timeout_sec") or 120)

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    # Best-effort diagnostics: include request size/model/ref count.
    model = str(cfg.get("model") or "")
    ref_count = 0
    try:
        contents = payload.get("contents") if isinstance(payload, dict) else None
        parts = None
        if isinstance(contents, list) and contents and isinstance(contents[0], dict):
            p = contents[0].get("parts")
            if isinstance(p, list):
                parts = p
        if isinstance(parts, list):
            for it in parts:
                if isinstance(it, dict) and isinstance(it.get("inlineData"), dict):
                    ref_count += 1
    except Exception:
        ref_count = 0

    last_err: Optional[str] = None
    for attempt in range(2):
        raw, err = _request_raw(
            "POST",
            url,
            data=body,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            timeout_sec=timeout,
        )
        if not err and raw is not None:
            last_err = None
            break

        last_err = err or "unknown error"
        # Retry only on likely-transient errors.
        transient_signals = (
            "Remote end closed connection",
            "timed out",
            "url error",
            "connection reset",
            "Connection reset",
            "TLS",
            "EOF",
        )
        if attempt == 0 and any(s in last_err for s in transient_signals):
            try:
                time.sleep(0.8)
            except Exception:
                pass
            continue
        break

    if last_err or raw is None:
        diag = f"model={model or '?'} size={len(body)}B refs={ref_count}"
        raise ValueError(f"Gemini request failed: {last_err or 'unknown error'} ({diag})")
    try:
        text = raw.decode("utf-8")
    except Exception:
        text = raw.decode("utf-8", errors="ignore")
    try:
        return json.loads(text) if text else {}
    except Exception:
        return {"raw": text[:2000]}


def _nanobanana_iter_gemini_stream(cfg: Dict[str, str], payload: Dict[str, Any]) -> Generator[Dict[str, Any], None, None]:
    url = str(cfg.get("stream_url") or "").strip()
    if not url:
        raise ValueError("NanoBanana stream_url missing")
    api_key = str(cfg.get("api_key") or "").strip()
    url = _nanobanana_with_key(url, api_key)
    timeout = float(cfg.get("timeout_sec") or 120)

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )

    decoder = json.JSONDecoder()
    buf = ""

    def _drain() -> Generator[Dict[str, Any], None, None]:
        nonlocal buf
        while True:
            trimmed = buf.lstrip(" \t\r\n,")
            if trimmed is not buf:
                buf = trimmed
            if not buf:
                return
            # SSE-ish framing
            if buf.startswith("data:"):
                nl = buf.find("\n")
                if nl == -1:
                    return
                line = buf[:nl].strip()
                buf = buf[nl + 1 :]
                payload_str = line[len("data:") :].strip()
                if not payload_str or payload_str in ("[DONE]", "DONE"):
                    continue
                try:
                    obj = json.loads(payload_str)
                except Exception:
                    continue
                if isinstance(obj, list):
                    for it in obj:
                        if isinstance(it, dict):
                            yield it
                elif isinstance(obj, dict):
                    yield obj
                continue
            try:
                obj, idx = decoder.raw_decode(buf)
            except json.JSONDecodeError:
                return
            buf = buf[idx:]
            if isinstance(obj, list):
                for it in obj:
                    if isinstance(it, dict):
                        yield it
            elif isinstance(obj, dict):
                yield obj

    last_err: Optional[str] = None
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                while True:
                    chunk = res.read(4096)
                    if not chunk:
                        break
                    try:
                        buf += chunk.decode("utf-8", errors="ignore")
                    except Exception:
                        continue
                    yield from _drain()
                yield from _drain()
            last_err = None
            break
        except Exception as e:
            last_err = str(e) or "unknown error"
            transient_signals = (
                "Remote end closed connection",
                "timed out",
                "connection reset",
                "Connection reset",
                "TLS",
                "EOF",
            )
            if attempt == 0 and any(s in last_err for s in transient_signals):
                try:
                    time.sleep(0.8)
                except Exception:
                    pass
                continue
            break

    if last_err:
        model = str(cfg.get("model") or "")
        raise ValueError(f"Gemini request failed: {last_err} (model={model or '?'})")


def _nanobanana_extract_inline_image(obj: Any) -> Optional[Tuple[str, bytes]]:
    if not isinstance(obj, dict):
        return None
    candidates = obj.get("candidates")
    if not isinstance(candidates, list):
        return None
    for cand in candidates:
        if not isinstance(cand, dict):
            continue
        content = cand.get("content")
        if not isinstance(content, dict):
            continue
        parts = content.get("parts")
        if not isinstance(parts, list):
            continue
        for part in parts:
            if not isinstance(part, dict):
                continue
            inline = part.get("inlineData")
            if not isinstance(inline, dict):
                continue
            mime_type = str(inline.get("mimeType") or "application/octet-stream")
            data_b64 = inline.get("data")
            if not isinstance(data_b64, str) or not data_b64:
                continue
            try:
                data = base64.b64decode(data_b64)
            except (binascii.Error, ValueError):
                continue
            return mime_type, data
    return None


def _nanobanana_save_inline_image(mime_type: str, data: bytes) -> str:
    ext = mimetypes.guess_extension(str(mime_type or "").split(";")[0].strip().lower()) or ".png"
    if ext == ".jpe":
        ext = ".jpg"

    ym = time.strftime("%Y%m")
    rel_dir = Path("nanobanana_outputs") / ym
    media_root = Path(getattr(settings, "MEDIA_ROOT", "") or Path(__file__).resolve().parents[1] / "media")
    out_dir = media_root / rel_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{ext}"
    out_path = out_dir / filename
    out_path.write_bytes(data)

    media_url = str(getattr(settings, "MEDIA_URL", "/media/") or "/media/")
    if not media_url.endswith("/"):
        media_url += "/"
    rel_posix = str((rel_dir / filename).as_posix())
    return media_url + rel_posix


def _nanobanana_ref_cache_root() -> Path:
    media_root = Path(getattr(settings, "MEDIA_ROOT", "") or Path(__file__).resolve().parents[1] / "media")
    return media_root / "nanobanana_ref_cache"


def _nanobanana_safe_cache_path(cache_id: str) -> Optional[Path]:
    """Resolve a cache id to an absolute path under cache root.

    Rejects absolute paths and any traversal segments.
    """

    raw = str(cache_id or "").strip().replace("\\", "/")
    if not raw:
        return None
    if raw.startswith("/"):
        raw = raw[1:]
    parts = [p for p in raw.split("/") if p not in ("", ".")]
    if not parts:
        return None
    if any(p == ".." for p in parts):
        return None

    root = _nanobanana_ref_cache_root().resolve()
    full = (root.joinpath(*parts)).resolve()
    if full == root:
        return None
    if root not in full.parents:
        return None
    return full


def _nanobanana_save_ref_cache(filename: str, content: bytes, content_type: str) -> Optional[str]:
    ct = str(content_type or "").split(";")[0].strip().lower()
    ext = mimetypes.guess_extension(ct) if ct else None
    if not ext:
        ext = os.path.splitext(str(filename or ""))[1] or ".png"
    if ext == ".jpe":
        ext = ".jpg"
    if not ext.startswith("."):
        ext = "." + ext

    # Keep cache types tight (Gemini inlineData should be image/*).
    allowed_ext = {".png", ".jpg", ".jpeg", ".webp"}
    if ext.lower() not in allowed_ext:
        ext = ".png"

    ym = time.strftime("%Y%m")
    rel_dir = Path(ym)
    out_dir = _nanobanana_ref_cache_root() / rel_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    out_name = f"{uuid.uuid4().hex}{ext}"
    out_path = out_dir / out_name
    out_path.write_bytes(content or b"")
    return str((rel_dir / out_name).as_posix())


def _nanobanana_load_cached_refs(cache_ids: List[str]) -> List[Tuple[str, bytes, str]]:
    out: List[Tuple[str, bytes, str]] = []
    for cache_id in cache_ids:
        p = _nanobanana_safe_cache_path(cache_id)
        if p is None or not p.exists() or not p.is_file():
            continue
        try:
            data = p.read_bytes()
        except Exception:
            continue
        name = p.name
        ct = mimetypes.guess_type(name)[0] or "application/octet-stream"
        out.append((name, data, ct))
    return out


def _nanobanana_extract_image_url(obj: Any) -> Optional[str]:
    if isinstance(obj, str):
        return obj if obj.startswith("http://") or obj.startswith("https://") else None
    if not isinstance(obj, dict):
        return None

    for key in ("imageUrl", "image_url", "url", "outputUrl", "output_url", "resultUrl", "result_url"):
        v = obj.get(key)
        if isinstance(v, str) and (v.startswith("http://") or v.startswith("https://")):
            return v

    # Nested common shapes
    for key in ("data", "result", "output"):
        inner = obj.get(key)
        if isinstance(inner, dict):
            u = _nanobanana_extract_image_url(inner)
            if u:
                return u
        if isinstance(inner, list) and inner:
            for it in inner:
                u = _nanobanana_extract_image_url(it)
                if u:
                    return u
    return None


def _nanobanana_extract_billing_text(obj: Any) -> Optional[str]:
    if not isinstance(obj, dict):
        return None

    # Gemini usageMetadata (token counts). Keep it short for UI.
    usage = obj.get("usageMetadata")
    if isinstance(usage, dict):
        total = usage.get("totalTokenCount")
        prompt = usage.get("promptTokenCount")
        cand = usage.get("candidatesTokenCount")
        parts: List[str] = []
        if isinstance(total, int):
            parts.append(f"total={total}")
        if isinstance(prompt, int):
            parts.append(f"prompt={prompt}")
        if isinstance(cand, int):
            parts.append(f"candidates={cand}")
        if parts:
            return "tokens: " + ", ".join(parts)

    for key in ("billing", "cost", "price", "usage", "credits", "charged", "amount"):
        v = obj.get(key)
        if isinstance(v, (str, int, float)):
            return str(v)
        if isinstance(v, dict):
            # Keep it short; the UI expects a small line.
            try:
                return json.dumps(v, ensure_ascii=False)[:200]
            except Exception:
                return None
    return None


def _nanobanana_is_rate_limited_error(err_text: str) -> bool:
    t = str(err_text or "")
    if not t:
        return False
    # Common shapes from our _request_raw error: "http 429: { ... }"
    if "http 429" in t:
        return True
    # Gemini may also report as RESOURCE_EXHAUSTED.
    if "RESOURCE_EXHAUSTED" in t and "Quota exceeded" in t:
        return True
    return False


def _nanobanana_parse_retry_after_seconds(err_text: str) -> Optional[float]:
    t = str(err_text or "")
    if not t:
        return None

    # 1) JSON body: {"retryDelay": "6s"}
    m = re.search(r'"retryDelay"\s*:\s*"([0-9]+(?:\.[0-9]+)?)s"', t)
    if m:
        try:
            return float(m.group(1))
        except Exception:
            return None

    # 2) Plain text: "Please retry in 6.526s."
    m = re.search(r"Please\s+retry\s+in\s+([0-9]+(?:\.[0-9]+)?)s", t)
    if m:
        try:
            return float(m.group(1))
        except Exception:
            return None
    return None


def _nanobanana_call_upstream_once(
    cfg: Dict[str, str],
    *,
    fields: Dict[str, str],
    ref_image: Optional[Tuple[str, bytes, str]] = None,
) -> Tuple[Any, Optional[str]]:
    """Call upstream once and parse JSON (non-SSE)."""

    files: List[Tuple[str, str, bytes, str]] = []
    if ref_image is not None:
        filename, content, content_type = ref_image
        files.append((cfg.get("ref_field") or "reference_image", filename, content, content_type))

    body, headers = _encode_multipart_form(fields, files)

    api_key = cfg.get("api_key") or ""
    auth_scheme = cfg.get("auth_scheme") or "Bearer"
    if api_key:
        headers["Authorization"] = f"{auth_scheme} {api_key}" if not api_key.lower().startswith("bearer ") else api_key
    headers["Accept"] = "application/json"

    url = str(cfg.get("generate_url") or "").strip()
    if not url:
        raise ValueError("NANOBANANA_GENERATE_URL is required")

    timeout = float(cfg.get("timeout_sec") or 120)
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as res:
        raw = res.read()
        try:
            text = raw.decode("utf-8")
        except Exception:
            text = raw.decode("utf-8", errors="ignore")
        try:
            obj = json.loads(text) if text else {}
        except Exception:
            obj = {"raw": text[:1000]}
        billing_text = _nanobanana_extract_billing_text(obj)
        return obj, billing_text


def _nanobanana_iter_upstream(
    cfg: Dict[str, str],
    *,
    fields: Dict[str, str],
    ref_image: Optional[Tuple[str, bytes, str]] = None,
) -> Generator[Any, None, None]:
    """Best-effort upstream streaming iterator.

    If upstream responds with `text/event-stream`, this yields parsed JSON payloads as they arrive.
    Otherwise, it yields exactly one JSON object from `_nanobanana_call_upstream_once`.
    """

    files: List[Tuple[str, str, bytes, str]] = []
    if ref_image is not None:
        filename, content, content_type = ref_image
        files.append((cfg.get("ref_field") or "reference_image", filename, content, content_type))

    body, headers = _encode_multipart_form(fields, files)

    api_key = cfg.get("api_key") or ""
    auth_scheme = cfg.get("auth_scheme") or "Bearer"
    if api_key:
        headers["Authorization"] = f"{auth_scheme} {api_key}" if not api_key.lower().startswith("bearer ") else api_key
    headers["Accept"] = "text/event-stream"

    url = str(cfg.get("generate_url") or "").strip()
    if not url:
        raise ValueError("NANOBANANA_GENERATE_URL is required")

    timeout = float(cfg.get("timeout_sec") or 120)
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")

    with urllib.request.urlopen(req, timeout=timeout) as res:
        ct = str(res.headers.get("Content-Type") or "")
        if "text/event-stream" not in ct.lower():
            raw = res.read()
            try:
                text = raw.decode("utf-8")
            except Exception:
                text = raw.decode("utf-8", errors="ignore")
            try:
                obj = json.loads(text) if text else {}
            except Exception:
                obj = {"raw": text[:1000]}
            yield obj
            return

        # SSE parsing
        event_name: Optional[str] = None
        data_lines: List[str] = []

        def _flush() -> Optional[str]:
            nonlocal event_name, data_lines
            if not data_lines:
                event_name = None
                return None
            data = "\n".join(data_lines)
            event_name = None
            data_lines = []
            return data

        for raw_line in res:
            try:
                line = raw_line.decode("utf-8", errors="ignore").rstrip("\r\n")
            except Exception:
                continue
            if not line.strip():
                data = _flush()
                if not data:
                    continue
                if data.strip() in ("[DONE]", "DONE"):
                    break
                try:
                    yield json.loads(data)
                except Exception:
                    # ignore non-json payloads
                    continue
                continue
            if line.startswith("event:"):
                event_name = line[len("event:") :].strip()
                continue
            if line.startswith("data:"):
                data_lines.append(line[len("data:") :].lstrip())
                continue


def _nanobanana_download_and_save(url: str) -> str:
    """Download an upstream URL and save into Django MEDIA_ROOT, returning the local media URL."""

    u = str(url or "").strip()
    if not (u.startswith("http://") or u.startswith("https://")):
        raise ValueError("invalid image url")

    req = urllib.request.Request(u, headers={"Accept": "image/*"}, method="GET")
    with urllib.request.urlopen(req, timeout=30.0) as res:
        content_type = str(res.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        data = res.read()

    ext = mimetypes.guess_extension(content_type) if content_type else None
    if not ext:
        # best effort from url
        parsed = urllib.parse.urlparse(u)
        ext = os.path.splitext(parsed.path)[1] or ".png"
    if not ext.startswith("."):
        ext = "." + ext

    ym = time.strftime("%Y%m")
    rel_dir = Path("nanobanana_outputs") / ym
    media_root = Path(getattr(settings, "MEDIA_ROOT", "") or Path(__file__).resolve().parents[1] / "media")
    out_dir = media_root / rel_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{ext}"
    out_path = out_dir / filename
    out_path.write_bytes(data)

    media_url = str(getattr(settings, "MEDIA_URL", "/media/") or "/media/")
    if not media_url.endswith("/"):
        media_url += "/"
    rel_posix = str((rel_dir / filename).as_posix())
    return media_url + rel_posix


@csrf_exempt
def nanobanana_generate_stream(request: HttpRequest) -> HttpResponseBase:
    """NanoBanana image generation endpoint (SSE).

    Content-Type: multipart/form-data
      - prompt: string
    - aspectRatio: string (optional; e.g. "16:9")
    - imageSize: string (optional; "1K"/"2K"/"4K"; only for gemini-3-pro-image-preview)
    - usePro: bool (optional; when true, uses gemini-3-pro-image-preview)
    - refImages/refImage: file(s) (optional)

    SSE:
      - event: msg, data: AgentToUI envelope
      - event: error
      - event: done
    """

    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    prompt = str(request.POST.get("prompt") or "").strip()
    if not prompt:

        def bad_req() -> Generator[bytes, None, None]:
            yield _sse("error", {"message": "prompt is required"}).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

        resp = StreamingHttpResponse(bad_req(), content_type="text/event-stream")
        _apply_sse_headers(resp)
        return resp

    cfg = _nanobanana_cfg()
    if not cfg.get("api_key"):

        def missing_cfg() -> Generator[bytes, None, None]:
            yield _sse(
                "msg",
                _agent_to_ui_error(
                    "missing_config",
                    "Gemini API Key missing. Please set it in Settings (encrypted DB), or set env vars NANOBANANA_API_KEY/GEMINI_API_KEY.",
                    details={"need": ["NANOBANANA_API_KEY"]},
                ),
            ).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

        resp = StreamingHttpResponse(missing_cfg(), content_type="text/event-stream")
        _apply_sse_headers(resp)
        return resp

    def _coerce_int(name: str, default: int) -> int:
        try:
            v = int(str(request.POST.get(name) or "").strip() or default)
            return v
        except Exception:
            return default

    raw_ar = request.POST.get("aspectRatio") or request.POST.get("aspect_ratio")
    aspect_ratio = _nanobanana_coerce_aspect_ratio(raw_ar)
    raw_size = request.POST.get("imageSize") or request.POST.get("image_size")
    image_size = _nanobanana_coerce_image_size(raw_size)

    use_pro = _nanobanana_truthy(request.POST.get("usePro") or request.POST.get("use_pro") or request.POST.get("pro"))
    if use_pro:
        cfg = _nanobanana_cfg_with_model(cfg, "gemini-3-pro-image-preview")

    # Backward-compatible fallback: infer aspect ratio from width/height if present.
    if not aspect_ratio:
        width = _coerce_int("width", 0)
        height = _coerce_int("height", 0)
        if width > 0 and height > 0:
            aspect_ratio = _nanobanana_pick_aspect_ratio(width, height)

    ref_images: List[Tuple[str, bytes, str]] = []

    # Prefer cached refs (ordered by refCacheIds), fallback to direct uploads.
    cache_ids: List[str] = []
    try:
        cache_ids = [str(x or "").strip() for x in (request.POST.getlist("refCacheIds") or [])]
    except Exception:
        cache_ids = []
    cache_ids = [x for x in cache_ids if x]

    if cache_ids:
        ref_images = _nanobanana_load_cached_refs(cache_ids)
        if len(ref_images) != len(cache_ids):

            def bad_cache() -> Generator[bytes, None, None]:
                yield _sse(
                    "msg",
                    _agent_to_ui_error(
                        "bad_ref_cache",
                        "NanoBanana：参考图缓存缺失或不可读，请重新缓存后再试。",
                        details={"received": len(cache_ids), "loaded": len(ref_images)},
                    ),
                ).encode("utf-8")
                yield _sse("done", "{}").encode("utf-8")

            resp = StreamingHttpResponse(bad_cache(), content_type="text/event-stream")
            _apply_sse_headers(resp)
            return resp
    else:
        ref_uploads = []
        try:
            ref_uploads = list(request.FILES.getlist("refImages") or [])
        except Exception:
            ref_uploads = []
        if not ref_uploads:
            ref_single = request.FILES.get("refImage")
            if ref_single is not None:
                ref_uploads = [ref_single]

        for ref_upload in ref_uploads:
            if ref_upload is None:
                continue
            try:
                ref_bytes = ref_upload.read()
                ref_name = str(getattr(ref_upload, "name", "ref.png") or "ref.png")
                ref_ct = str(getattr(ref_upload, "content_type", "") or "")
                if not ref_ct:
                    ref_ct = mimetypes.guess_type(ref_name)[0] or "application/octet-stream"
                ref_images.append((ref_name, ref_bytes, ref_ct))
            except Exception:
                continue

    def gen() -> Generator[bytes, None, None]:
        billing_text: Optional[str] = None
        try:
            payload_obj = _nanobanana_build_gemini_payload(
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                image_size=image_size,
                ref_images=ref_images,
                model=str(cfg.get("model") or ""),
            )

            for attempt in range(2):
                try:
                    if attempt == 0:
                        yield _sse("msg", _agent_to_ui_task_status("started", message="NanoBanana：开始生成…")).encode("utf-8")
                    else:
                        yield _sse("msg", _agent_to_ui_task_status("streaming", message="NanoBanana：开始重试…")).encode("utf-8")

                    # Gemini streamGenerateContent.
                    yield _sse("msg", _agent_to_ui_task_status("streaming", message="NanoBanana：请求 Gemini 中…")).encode("utf-8")

                    upstream_obj: Any = None
                    inline_img: Optional[Tuple[str, bytes]] = None
                    last_progress_ts = 0.0

                    try:
                        for obj in _nanobanana_iter_gemini_stream(cfg, payload_obj):
                            bt = _nanobanana_extract_billing_text(obj)
                            if bt:
                                billing_text = bt
                            inline_img = _nanobanana_extract_inline_image(obj)
                            if inline_img:
                                upstream_obj = obj
                                break

                            # Best-effort progress update (throttled).
                            progress_msg = None
                            if isinstance(obj, dict):
                                for k in ("message", "status", "phase"):
                                    v = obj.get(k)
                                    if isinstance(v, str) and v.strip():
                                        progress_msg = v.strip()
                                        break
                                for k in ("progress", "percent", "percentage"):
                                    v = obj.get(k)
                                    if isinstance(v, (int, float)):
                                        progress_msg = f"{progress_msg + ' ' if progress_msg else ''}{v}%"
                                        break

                            if progress_msg:
                                now = time.time()
                                if now - last_progress_ts >= 0.6:
                                    last_progress_ts = now
                                    suffix = f"；计费：{billing_text}" if billing_text else ""
                                    yield _sse(
                                        "msg",
                                        _agent_to_ui_task_status("streaming", message=f"NanoBanana：{progress_msg}{suffix}"),
                                    ).encode("utf-8")
                    except Exception:
                        upstream_obj = None
                        inline_img = None

                    if not inline_img:
                        # Fallback to non-stream generateContent.
                        yield _sse(
                            "msg",
                            _agent_to_ui_task_status("streaming", message="NanoBanana：流式未返回图片，改用 generateContent…"),
                        ).encode("utf-8")
                        upstream_obj = _nanobanana_call_gemini_once(cfg, payload_obj, stream=False)
                        bt = _nanobanana_extract_billing_text(upstream_obj)
                        if bt:
                            billing_text = bt
                        inline_img = _nanobanana_extract_inline_image(upstream_obj)

                    if not inline_img:
                        yield _sse(
                            "msg",
                            _agent_to_ui_error(
                                "gemini_no_inline_image",
                                "gemini did not return inline image",
                                details={"upstream": upstream_obj if isinstance(upstream_obj, dict) else {"value": str(upstream_obj)}},
                            ),
                        ).encode("utf-8")
                        yield _sse("done", "{}").encode("utf-8")
                        return

                    yield _sse("msg", _agent_to_ui_task_status("streaming", message="NanoBanana：保存图片并落盘…")).encode("utf-8")
                    mime_type, data = inline_img
                    local_url = _nanobanana_save_inline_image(mime_type, data)

                    result_payload = {
                        "imageUrl": local_url,
                        "model": str(cfg.get("model") or ""),
                        "usePro": str(cfg.get("model") or "") == "gemini-3-pro-image-preview",
                    }
                    if billing_text:
                        result_payload["billing"] = billing_text

                    yield _sse("msg", _agent_to_ui_chat_message(json.dumps(result_payload, ensure_ascii=False))).encode("utf-8")
                    yield _sse("msg", _agent_to_ui_task_status("done", message="NanoBanana：完成")).encode("utf-8")
                    yield _sse("done", "{}").encode("utf-8")
                    return
                except Exception as e:
                    msg = str(e) or "unknown error"
                    if attempt == 0 and _nanobanana_is_rate_limited_error(msg):
                        retry_after = _nanobanana_parse_retry_after_seconds(msg) or 6.0
                        retry_after = max(1.0, min(60.0, float(retry_after)))
                        yield _sse(
                            "msg",
                            _agent_to_ui_task_status(
                                "streaming",
                                message=f"NanoBanana：触发限流/配额不足，等待 {retry_after:.0f}s 后自动重试一次…",
                            ),
                        ).encode("utf-8")
                        try:
                            time.sleep(retry_after)
                        except Exception:
                            pass
                        continue
                    raise
        except Exception as e:
            yield _sse("msg", _agent_to_ui_error("nanobanana_error", str(e) or "unknown error")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp


@csrf_exempt
def blueprint_chat_stream(request: HttpRequest) -> HttpResponseBase:
    """Stream chat endpoint for Blueprint / AIWorkflow UI (SSE).

    Body:
      - content: string (required)
      - history: [{role: 'user'|'assistant'|'system', content: string}] (optional)

    SSE events:
      - event: msg, data: <AgentToUI envelope JSON>
      - event: error, data: {message,...}
      - event: done
    """

    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    try:
        raw = request.body.decode("utf-8") if request.body else ""
        data_any: Any = json.loads(raw) if raw else {}
    except Exception:
        data_any = {}
    payload = data_any if isinstance(data_any, dict) else {}

    content = str(payload.get("content") or payload.get("message") or "").strip()
    if not content:

        def bad_req() -> Generator[bytes, None, None]:
            yield _sse("error", {"message": "content is required"}).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

        resp = StreamingHttpResponse(bad_req(), content_type="text/event-stream")
        _apply_sse_headers(resp)
        return resp

    cfg = _deepseek_cfg()
    if not cfg.get("base_url") or not cfg.get("api_key") or not cfg.get("model"):

        def missing_cfg() -> Generator[bytes, None, None]:
            yield _sse(
                "msg",
                _agent_to_ui_error(
                    "missing_config",
                    "DeepSeek API Key missing. Please set it in Settings (encrypted DB), or set env var DEEPSEEK_API_KEY.",
                    details={"need": ["DEEPSEEK_BASE_URL", "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL"]},
                ),
            ).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

        resp = StreamingHttpResponse(missing_cfg(), content_type="text/event-stream")
        _apply_sse_headers(resp)
        return resp

    raw_hist = payload.get("history")
    hist = raw_hist if isinstance(raw_hist, list) else []

    messages: List[Dict[str, str]] = [
        {
            "role": "system",
            "content": "你是 Dweb Video Studio 的蓝图工作流助手。请用简洁中文回答，并尽量给出可执行的步骤或参数建议。",
        }
    ]

    MAX_HISTORY = 30
    tail = hist[-MAX_HISTORY:]
    for it in tail:
        if not isinstance(it, dict):
            continue
        role = it.get("role")
        msg = it.get("content")
        if role not in ("user", "assistant", "system"):
            continue
        if not isinstance(msg, str) or not msg.strip():
            continue
        messages.append({"role": str(role), "content": msg.strip()})

    messages.append({"role": "user", "content": content})

    model = str(cfg["model"])

    def gen() -> Generator[bytes, None, None]:
        yield _sse("msg", _agent_to_ui_task_status("started", message="开始生成…")).encode("utf-8")
        yield _sse("msg", _agent_to_ui_task_status("streaming", message="生成中…")).encode("utf-8")
        try:
            for delta in _openai_stream_chat(
                base_url=str(cfg["base_url"]),
                api_key=str(cfg["api_key"]),
                model=model,
                messages=messages,
            ):
                if isinstance(delta, str) and delta:
                    yield _sse("msg", _agent_to_ui_text(delta, source_model=model)).encode("utf-8")
            yield _sse("msg", _agent_to_ui_task_status("done", message="完成")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")
        except Exception as e:
            yield _sse("msg", _agent_to_ui_error("upstream_error", str(e))).encode("utf-8")
            yield _sse("error", {"message": str(e)}).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp


@api_view(["POST"])
def prompt(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    base, err = _normalize_base_url(payload.get("baseUrl"))
    if err:
        return _json_error(err)
    if not base:
        return _json_error("baseUrl is invalid")

    comfy_payload_any = payload.get("payload")
    if not isinstance(comfy_payload_any, dict):
        return _json_error("payload must be object")

    comfy_payload: Dict[str, Any] = {str(k): v for k, v in comfy_payload_any.items()}

    url = base + "/prompt"
    out, out_err = _request_json("POST", url, payload=comfy_payload, timeout_sec=30.0)
    if out_err or not _is_record(out):
        return _json_error(f"ComfyUI /prompt failed: {out_err or 'unknown error'}", status=502)

    return Response({"ok": True, "baseUrl": base, "result": out})


@api_view(["GET"])
def history(request: Request, prompt_id: str) -> Response:
    base_raw = request.GET.get("baseUrl")
    base, err = _normalize_base_url(base_raw)
    if err:
        return _json_error(err)
    if not base:
        return _json_error("baseUrl is invalid")

    pid = str(prompt_id or "").strip()
    if not pid:
        return _json_error("prompt_id is required")

    url = base + "/history/" + urllib.parse.quote(pid)
    out, out_err = _request_json("GET", url, payload=None, timeout_sec=10.0)
    if out_err or not _is_record(out):
        return _json_error(f"ComfyUI /history failed: {out_err or 'unknown error'}", status=502)

    return Response({"ok": True, "baseUrl": base, "result": out})


@api_view(["GET"])
def view(request: Request) -> Any:
    # Proxy /view binary for image/video outputs.
    base_raw = request.GET.get("baseUrl")
    base, err = _normalize_base_url(base_raw)
    if err:
        return _json_error(err)
    if not base:
        return _json_error("baseUrl is invalid")

    filename = str(request.GET.get("filename") or "").strip()
    if not filename:
        return _json_error("filename is required")

    # Pass-through safe query args ComfyUI expects.
    subfolder = str(request.GET.get("subfolder") or "").strip()
    folder_type = str(request.GET.get("type") or "output").strip()

    q = urllib.parse.urlencode({"filename": filename, "subfolder": subfolder, "type": folder_type})
    url = base + "/view?" + q

    upstream_headers: Dict[str, str] = {}
    range_header = str(request.META.get("HTTP_RANGE") or "").strip()
    if range_header:
        upstream_headers["Range"] = range_header

    req = urllib.request.Request(url, headers=upstream_headers)

    try:
        upstream = urllib.request.urlopen(req, timeout=20.0)
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="ignore")
        except Exception:
            body = ""
        return _json_error(f"ComfyUI /view http {e.code}: {body}".strip(), status=502)
    except Exception as e:
        return _json_error(f"ComfyUI /view failed: {e}", status=502)

    def _iter() -> Any:
        while True:
            chunk = upstream.read(1024 * 256)
            if not chunk:
                break
            yield chunk

    content_type = upstream.headers.get("Content-Type") or "application/octet-stream"
    status_code = int(getattr(upstream, "status", 200) or 200)
    resp = StreamingHttpResponse(_iter(), status=status_code, content_type=content_type)

    cd = upstream.headers.get("Content-Disposition")
    if cd:
        resp["Content-Disposition"] = cd

    content_length = upstream.headers.get("Content-Length")
    if content_length:
        resp["Content-Length"] = content_length

    content_range = upstream.headers.get("Content-Range")
    if content_range:
        resp["Content-Range"] = content_range

    accept_ranges = upstream.headers.get("Accept-Ranges")
    if accept_ranges:
        resp["Accept-Ranges"] = accept_ranges
    elif content_type.startswith("video/"):
        resp["Accept-Ranges"] = "bytes"

    cache_control = upstream.headers.get("Cache-Control")
    if cache_control:
        resp["Cache-Control"] = cache_control

    etag = upstream.headers.get("ETag")
    if etag:
        resp["ETag"] = etag

    last_modified = upstream.headers.get("Last-Modified")
    if last_modified:
        resp["Last-Modified"] = last_modified

    return resp


@api_view(["POST"])
def list_workflows(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    base, err = _normalize_base_url(payload.get("baseUrl"))
    if err:
        return _json_error(err)
    if not base:
        return _json_error("baseUrl is invalid")

    # ComfyUI stores workflows under user/{id}/workflows
    # Use userdata API to list files.
    q = urllib.parse.urlencode({"dir": "workflows", "recurse": "true"})
    url = base + "/userdata?" + q
    out, out_err = _request_json("GET", url, payload=None, timeout_sec=10.0)
    if out_err or not isinstance(out, list):
        return _json_error(f"ComfyUI /userdata failed: {out_err or 'unknown error'}", status=502)

    workflows = _filter_workflow_files(out)
    return Response({"ok": True, "baseUrl": base, "workflows": workflows})


@api_view(["POST"])
def get_workflow(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    base, err = _normalize_base_url(payload.get("baseUrl"))
    if err:
        return _json_error(err)
    if not base:
        return _json_error("baseUrl is invalid")

    workflow_path = str(payload.get("workflowPath") or "").strip()
    if not workflow_path:
        return _json_error("workflowPath is required")
    if workflow_path.startswith("/"):
        workflow_path = workflow_path[1:]

    # NOTE: ComfyUI exposes userdata files via FileResponse (raw bytes), not JSON API.
    # Also, the path param is a single segment; slashes must be URL-encoded (%2F).
    quoted = urllib.parse.quote(workflow_path, safe="")
    url = base + "/userdata/" + quoted
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"}, method="GET")
        with urllib.request.urlopen(req, timeout=10.0) as res:
            raw = res.read()
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="ignore")
        except Exception:
            body = ""
        return _json_error(f"ComfyUI /userdata/{{file}} http {e.code}: {body}".strip(), status=502)
    except Exception as e:
        return _json_error(f"ComfyUI /userdata/{{file}} failed: {e}", status=502)

    try:
        text = raw.decode("utf-8-sig")
    except Exception:
        text = raw.decode("utf-8", errors="ignore")

    try:
        workflow = json.loads(text)
    except Exception:
        preview = text[:300].replace("\n", "\\n")
        return _json_error(f"invalid workflow json: {preview}", status=502)

    return Response({"ok": True, "baseUrl": base, "workflowPath": workflow_path, "workflow": workflow})


@api_view(["POST"])
def run(request: Request) -> Response:
    # Accept multipart form-data so the frontend can attach connected input images.
    payload = _coerce_request_payload(request.data)
    base_raw = payload.get("baseUrl")
    base, err = _normalize_base_url(base_raw)
    if err:
        return _json_error(err)
    if not base:
        return _json_error("baseUrl is invalid")

    workflow_path = str(payload.get("workflowPath") or "").strip()
    if not workflow_path:
        return _json_error("workflowPath is required")

    positive_prompt = str(payload.get("positivePrompt") or "").strip()
    negative_prompt = str(payload.get("negativePrompt") or "").strip()
    confirm_reuse_record = _coerce_bool(payload.get("confirmReuseRecord"))

    workflow_any, wf_err = _fetch_userdata_json(base, workflow_path)
    if wf_err or not isinstance(workflow_any, dict):
        return _json_error(f"读取工作流失败：{wf_err or 'unknown error'}", status=502)

    # Upload input images (if any) and patch workflow LoadImage nodes.
    uploaded_paths: List[str] = []
    files = getattr(request, "FILES", None)
    if files:
        indexed: List[Tuple[int, Any]] = []
        for key in files.keys():
            if not isinstance(key, str) or not key.startswith("file"):
                continue
            idx_raw = key[len("file") :]
            try:
                idx = int(idx_raw)
            except Exception:
                continue
            indexed.append((idx, files.get(key)))
        indexed.sort(key=lambda x: x[0])

        for _, f in indexed:
            if not f:
                continue
            try:
                content = f.read()
            except Exception:
                continue
            if not content:
                continue
            fname = str(getattr(f, "name", "") or "input.png")
            ctype = str(getattr(f, "content_type", "") or "application/octet-stream")
            _persist_bridge_input_file(fname, content)
            up, up_err = _upload_image_to_comfyui(base, fname, content, ctype)
            if up_err or not isinstance(up, dict):
                return _json_error(f"上传图片失败：{up_err or 'unknown error'}", status=502)
            name = str(up.get("name") or "").strip()
            subfolder = str(up.get("subfolder") or "").strip().replace("\\", "/")
            path = f"{subfolder}/{name}" if subfolder else name
            if path:
                uploaded_paths.append(path)

    object_info = _get_object_info(base)
    template_overrides = _extract_template_input_overrides(payload)

    workflow_id = _extract_workflow_id(workflow_any) or f"path:{workflow_path}"
    filler = WorkflowTemplatePromptFiller.from_context(base, workflow_any, object_info)

    # 主路径：优先 Comfy history；history 缺失时可经用户确认后复用 Django 本地记录。
    strict_workflow_id = _extract_workflow_id(workflow_any)
    prompt_source = "history"
    if strict_workflow_id:
        prompt_graph, history_err = _find_prompt_graph_from_comfy_state(base, strict_workflow_id)
    else:
        prompt_graph, history_err = None, "workflow id missing"

    if not isinstance(prompt_graph, dict):
        local_record = _find_latest_local_record(workflow_id)
        if local_record and not confirm_reuse_record:
            meta_raw = local_record.get("meta") if isinstance(local_record.get("meta"), dict) else {}
            meta: Dict[str, Any] = meta_raw if isinstance(meta_raw, dict) else {}
            workflow_name = str(workflow_path).replace("\\", "/").rsplit("/", 1)[-1] or workflow_path
            return Response(
                {
                    "ok": False,
                    "error": "ComfyUI history 不可用，可改为复用 Django 记录继续运行。",
                    "requiresConfirm": True,
                    "fallbackRecord": {
                        "workflowName": workflow_name,
                        "workflowPath": workflow_path,
                        "workflowId": workflow_id,
                        "savedAt": meta.get("savedAt"),
                        "runDir": local_record.get("runDir"),
                    },
                },
                status=409,
            )

        if local_record and confirm_reuse_record:
            prompt_source = "django-record"
            prompt_graph, local_err = _load_prompt_from_local_record(local_record)
            if not isinstance(prompt_graph, dict):
                return _json_error(f"本地记录复用失败：{local_err or 'unknown error'}", status=400)
        else:
            prompt_source = "template"
            prompt_graph, build_err = filler.build_prompt_graph()
            if not isinstance(prompt_graph, dict):
                return _json_error(
                    f"history 不可用且模板解析失败：history={history_err or 'unknown'} | template={build_err or 'unknown'}",
                    status=400,
                )

    prompt_graph_final: Dict[str, Any] = prompt_graph
    prompt_graph_base: Dict[str, Any] = prompt_graph

    # Work on a detached copy to avoid mutating source snapshots.
    try:
        prompt_graph_base = json.loads(json.dumps(prompt_graph_base))
    except Exception:
        pass

    try:
        prompt_graph_final = json.loads(json.dumps(prompt_graph_final))
    except Exception:
        pass

    if template_overrides:
        filler.apply_input_overrides(prompt_graph_final, template_overrides)

    if uploaded_paths:
        _patch_prompt_graph_load_images(prompt_graph_final, uploaded_paths)

    _normalize_prompt_graph_for_runtime(prompt_graph_final, object_info=object_info)
    _apply_text_overrides(prompt_graph_final, positive_prompt, negative_prompt)

    client_id = uuid.uuid4().hex
    extra_data = {
        "extra_pnginfo": {
            "workflow": workflow_any,
        },
        "create_time": int(uuid.uuid1().time),
    }

    comfy_payload = {
        "prompt": prompt_graph_final,
        "client_id": client_id,
        "extra_data": extra_data,
    }
    url = base + "/prompt"
    out, out_err = _request_json("POST", url, payload=comfy_payload, timeout_sec=30.0)
    if out_err or not _is_record(out):
        status = 502
        comfy_err_payload: Optional[Any] = None
        raw_err = str(out_err or "unknown error")
        if raw_err.startswith("http 400"):
            status = 400
            body = raw_err.split(":", 1)[1].strip() if ":" in raw_err else ""
            if body:
                try:
                    comfy_err_payload = json.loads(body)
                except Exception:
                    comfy_err_payload = body

        debug_nodes: Dict[str, Any] = {}
        for nid in ("108", "133", "134"):
            v = prompt_graph_final.get(nid) if isinstance(prompt_graph_final, dict) else None
            if v is not None:
                debug_nodes[nid] = v

        # Also include raw workflow node info to help verify widgets_values ordering.
        debug_workflow_nodes: Dict[str, Any] = {}
        wf_nodes = workflow_any.get("nodes") if isinstance(workflow_any, dict) else None
        if isinstance(wf_nodes, list):
            wf_by_id: Dict[int, Dict[str, Any]] = {}
            for n in wf_nodes:
                if not isinstance(n, dict):
                    continue
                rid = n.get("id")
                if rid is None:
                    continue
                try:
                    nid_int = int(rid)
                except Exception:
                    continue
                wf_by_id[nid_int] = n

            for nid_int in (108, 133, 134):
                n = wf_by_id.get(nid_int)
                if not isinstance(n, dict):
                    continue
                class_type = str(n.get("type") or "")
                raw_inputs = n.get("inputs")
                inputs_list = raw_inputs if isinstance(raw_inputs, list) else []
                inputs_summary = []
                for inp in inputs_list:
                    if not isinstance(inp, dict):
                        continue
                    inputs_summary.append(
                        {
                            "name": inp.get("name"),
                            "link": inp.get("link"),
                            "hasWidget": isinstance(inp.get("widget"), dict),
                        }
                    )

                info = object_info.get(class_type) if isinstance(object_info, dict) and class_type else None
                defs = _extract_object_info_input_defs(info)
                input_order = _extract_object_info_input_order(info)
                widget_order = [
                    name
                    for name in input_order
                    if name in defs and _is_object_info_widget_def(defs.get(name))
                ]

                debug_workflow_nodes[str(nid_int)] = {
                    "type": class_type,
                    "widgets_values": n.get("widgets_values"),
                    "inputs": inputs_summary,
                    "object_info": {
                        "input_order": input_order,
                        "widget_order": widget_order,
                    }
                    if isinstance(object_info, dict)
                    else None,
                }

        return Response(
            {
                "ok": False,
                "error": f"ComfyUI /prompt failed: {raw_err}",
                "comfyuiError": comfy_err_payload,
                "snapshot": _persist_reuse_analysis_snapshot(
                    workflow_id=workflow_id,
                    workflow_path=workflow_path,
                    workflow_json=workflow_any,
                    prompt_reused=prompt_graph_base,
                    prompt_submitted=prompt_graph_final,
                    meta={
                        "status": "failed",
                        "promptSource": prompt_source,
                        "error": raw_err,
                        "comfyuiError": comfy_err_payload,
                    },
                ),
                "debugPromptNodes": debug_nodes,
                "debugWorkflowNodes": debug_workflow_nodes,
            },
            status=status,
        )

    prompt_id = str((out or {}).get("prompt_id") or "").strip()
    return Response(
        {
            "ok": True,
            "baseUrl": base,
            "promptId": prompt_id,
            "result": out,
            "snapshot": _persist_reuse_analysis_snapshot(
                workflow_id=workflow_id,
                workflow_path=workflow_path,
                workflow_json=workflow_any,
                prompt_reused=prompt_graph_base,
                prompt_submitted=prompt_graph_final,
                meta={
                    "status": "submitted",
                    "promptSource": prompt_source,
                    "promptId": prompt_id,
                },
            ),
        }
    )


@api_view(["POST"])
def outputs(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    base, err = _normalize_base_url(payload.get("baseUrl"))
    if err:
        return _json_error(err)
    if not base:
        return _json_error("baseUrl is invalid")

    prompt_id = str(payload.get("promptId") or payload.get("id") or "").strip()
    if not prompt_id:
        return _json_error("promptId is required")

    url = base + "/history/" + urllib.parse.quote(prompt_id)
    out, out_err = _request_json("GET", url, payload=None, timeout_sec=10.0)
    if out_err or not isinstance(out, dict):
        return _json_error(f"ComfyUI /history failed: {out_err or 'unknown error'}", status=502)

    media = _extract_media_from_history_result(base, out, prompt_id)
    return Response({"ok": True, "baseUrl": base, "promptId": prompt_id, "media": media, "result": out})


@api_view(["POST"])
def cancel(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    base, err = _normalize_base_url(payload.get("baseUrl"))
    if err:
        return _json_error(err)
    if not base:
        return _json_error("baseUrl is invalid")

    prompt_id = str(payload.get("promptId") or "").strip()
    if not prompt_id:
        return _json_error("promptId is required")

    url = base + "/interrupt"
    out, out_err = _request_json("POST", url, payload={"prompt_id": prompt_id}, timeout_sec=10.0)
    if out_err:
        return _json_error(f"ComfyUI /interrupt failed: {out_err}", status=502)
    return Response({"ok": True, "baseUrl": base, "result": out})


@api_view(["POST"])
def job(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    base, err = _normalize_base_url(payload.get("baseUrl"))
    if err:
        return _json_error(err)
    if not base:
        return _json_error("baseUrl is invalid")

    job_id = str(payload.get("id") or payload.get("promptId") or "").strip()
    if not job_id:
        return _json_error("id is required")

    # Prefer /api/jobs/{id} (unified status). Fallback to /history/{id}.
    url = base + "/api/jobs/" + urllib.parse.quote(job_id)
    out, out_err = _request_json("GET", url, payload=None, timeout_sec=10.0)
    if out_err or not _is_record(out):
        url2 = base + "/history/" + urllib.parse.quote(job_id)
        out2, out2_err = _request_json("GET", url2, payload=None, timeout_sec=10.0)
        if out2_err or not _is_record(out2):
            return _json_error(f"job status failed: {out_err or out2_err or 'unknown error'}", status=502)
        # history endpoint returns {prompt_id: {...}}. When backend restarted, id usually disappears.
        if job_id not in out2:
            return Response(
                {
                    "ok": True,
                    "baseUrl": base,
                    "fallback": "history",
                    "result": {"id": job_id, "status": "not_found"},
                }
            )
        return Response({"ok": True, "baseUrl": base, "fallback": "history", "result": out2})

    # Some ComfyUI versions may return record-shaped payloads without status for missing jobs.
    status_text = str((out or {}).get("status") or "").strip().lower()
    detail_text = str((out or {}).get("detail") or (out or {}).get("error") or "").strip().lower()
    if not status_text and ("not found" in detail_text or "missing" in detail_text):
        return Response({"ok": True, "baseUrl": base, "result": {"id": job_id, "status": "not_found"}})

    return Response({"ok": True, "baseUrl": base, "result": out})


def _blueprint_projects_root() -> Path:
    root = Path(getattr(settings, "MEDIA_ROOT", "") or "").resolve()
    if not str(root):
        root = (Path(getattr(settings, "BASE_DIR", ".")) / "media").resolve()
    projects_root = root / "blueprint_projects"
    projects_root.mkdir(parents=True, exist_ok=True)
    return projects_root


def _as_blueprint_snapshot(snapshot: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(snapshot, dict):
        return None
    schema_version = snapshot.get("schemaVersion")
    if schema_version != 1:
        return None
    required_keys = [
        "viewport",
        "nodesById",
        "nodeOrder",
        "edgesById",
        "edgeOrder",
        "resourcesById",
        "resourceOrder",
    ]
    for key in required_keys:
        if key not in snapshot:
            return None
    return snapshot


def _project_file_from_data_path(data_path: str) -> Tuple[Optional[Path], Optional[str]]:
    rel = str(data_path or "").strip().replace("\\", "/")
    if not rel:
        return None, "data path is empty"
    root = _blueprint_projects_root().resolve()
    candidate = (Path(getattr(settings, "MEDIA_ROOT", "") or root.parent) / rel).resolve()
    if root not in candidate.parents and candidate != root:
        return None, "invalid data path"
    return candidate, None


def _write_project_snapshot_file(project: BlueprintProject, snapshot: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    root = _blueprint_projects_root()
    project_dir = (root / str(project.id)).resolve()
    project_dir.mkdir(parents=True, exist_ok=True)

    # One project should only have ONE snapshot json.
    file_path = project_dir / "blueprint.json"

    # Ensure target stays within project dir.
    try:
        file_path = file_path.resolve()
    except Exception:
        file_path = project_dir / "blueprint.json"
    if project_dir not in file_path.parents and file_path != project_dir:
        file_path = project_dir / "blueprint.json"

    tmp_path = file_path.parent / ("." + file_path.name + ".tmp")

    payload = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"), indent=2)
    try:
        tmp_path.write_text(payload, encoding="utf-8")
        os.replace(str(tmp_path), str(file_path))
    except Exception as exc:
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except Exception:
            pass
        return None, f"write project json failed: {exc}"

    # Best-effort: cleanup old snapshot jsons in this project folder.
    try:
        for p in project_dir.iterdir():
            if not p.is_file():
                continue
            if p.suffix.lower() != ".json":
                continue
            if p.name == file_path.name:
                continue
            try:
                p.unlink()
            except Exception:
                pass
    except Exception:
        pass

    media_root = Path(getattr(settings, "MEDIA_ROOT", "") or root.parent).resolve()
    try:
        rel = file_path.resolve().relative_to(media_root)
    except Exception:
        return None, "failed to compute media relative path"
    return rel.as_posix(), None


def _snapshot_used_resource_ids(snapshot: Dict[str, Any]) -> Set[str]:
    used: Set[str] = set()
    nodes_by_id = snapshot.get("nodesById")
    node_order = snapshot.get("nodeOrder")
    if not isinstance(nodes_by_id, dict):
        return used
    order: List[str]
    if isinstance(node_order, list):
        order = [str(x) for x in node_order if isinstance(x, str)]
    else:
        order = [str(k) for k in nodes_by_id.keys()]
    for node_id in order:
        n = nodes_by_id.get(node_id)
        if not isinstance(n, dict):
            continue
        rid = str(n.get("resourceId") or "").strip()
        if rid:
            used.add(rid)
    return used


def _normalize_path_for_compare(p: Path) -> str:
    try:
        return str(p.resolve()).replace("\\", "/").lower()
    except Exception:
        return str(p).replace("\\", "/").lower()


def _collect_referenced_thumbnail_files(project_id: int, snapshot: Dict[str, Any]) -> Set[Path]:
    refs: Set[Path] = set()
    used_ids = _snapshot_used_resource_ids(snapshot)
    if not used_ids:
        return refs

    resources_by_id = snapshot.get("resourcesById")
    if not isinstance(resources_by_id, dict):
        return refs

    project_thumb_root = (_blueprint_projects_root() / str(project_id) / "thumbnails").resolve()
    project_thumb_root_key = _normalize_path_for_compare(project_thumb_root)

    media_root = _media_root_path()
    media_root_key = _normalize_path_for_compare(media_root)

    for rid in used_ids:
        r = resources_by_id.get(rid)
        if not isinstance(r, dict):
            continue

        poster_path_raw = str(r.get("posterSourcePath") or "").strip()
        poster_url_raw = str(r.get("posterUrl") or "").strip()

        candidate: Optional[Path] = None
        if poster_path_raw:
            try:
                candidate = Path(poster_path_raw).expanduser().resolve()
            except Exception:
                candidate = None
        elif poster_url_raw:
            candidate = _try_media_file_from_url(poster_url_raw)

        if candidate is None:
            continue

        candidate_key = _normalize_path_for_compare(candidate)
        if not candidate_key.startswith(media_root_key):
            continue
        if not candidate_key.startswith(project_thumb_root_key):
            continue
        refs.add(candidate)

    return refs


def _cleanup_project_thumbnail_orphans(project_id: int, snapshot: Dict[str, Any]) -> None:
    try:
        thumb_root = (_blueprint_projects_root() / str(project_id) / "thumbnails").resolve()
    except Exception:
        return
    if not thumb_root.exists() or not thumb_root.is_dir():
        return

    referenced = _collect_referenced_thumbnail_files(project_id, snapshot)
    referenced_keys = {_normalize_path_for_compare(p) for p in referenced}

    try:
        files = [p for p in thumb_root.rglob("*") if p.is_file()]
    except Exception:
        files = []

    for fp in files:
        key = _normalize_path_for_compare(fp)
        if key in referenced_keys:
            continue
        try:
            fp.unlink()
        except Exception:
            pass

    # Best effort: remove empty sub-directories under thumbnails root.
    try:
        dirs = [p for p in thumb_root.rglob("*") if p.is_dir()]
        dirs.sort(key=lambda x: len(x.parts), reverse=True)
        for d in dirs:
            try:
                d.rmdir()
            except Exception:
                pass
    except Exception:
        pass


def _parse_range_header(range_header: str, file_size: int) -> Optional[Tuple[int, int]]:
    # Supports a single range only: bytes=start-end | bytes=start- | bytes=-suffix
    if not range_header:
        return None
    m = re.match(r"^bytes=(\d*)-(\d*)$", str(range_header).strip())
    if not m:
        return None
    start_s, end_s = m.group(1), m.group(2)
    try:
        if start_s == "" and end_s:
            suffix = int(end_s)
            if suffix <= 0:
                return None
            start = max(0, file_size - suffix)
            end = file_size - 1
        else:
            start = int(start_s) if start_s else 0
            end = int(end_s) if end_s else file_size - 1
    except Exception:
        return None
    if file_size <= 0:
        return None
    if start < 0:
        return None
    if start >= file_size:
        return None
    end = min(end, file_size - 1)
    if end < start:
        return None
    return start, end


def _stream_file_response(request: Request, file_path: Path, content_type: str, download_name: str) -> Response:
    # NOTE: use StreamingHttpResponse + Range support so <video> can seek.
    try:
        st = file_path.stat()
        file_size = int(getattr(st, "st_size", 0) or 0)
        mtime = int(getattr(st, "st_mtime", 0) or 0)
    except Exception:
        file_size = 0
        mtime = 0

    range_header = request.META.get("HTTP_RANGE")
    byte_range = _parse_range_header(str(range_header or ""), file_size) if file_size > 0 else None

    def file_iter(fp: Any, remaining: Optional[int] = None) -> Generator[bytes, None, None]:
        try:
            chunk_size = 256 * 1024
            while True:
                if remaining is not None and remaining <= 0:
                    break
                read_size = chunk_size if remaining is None else min(chunk_size, remaining)
                data = fp.read(read_size)
                if not data:
                    break
                if remaining is not None:
                    remaining -= len(data)
                yield data
        finally:
            try:
                fp.close()
            except Exception:
                pass

    if byte_range is not None:
        start, end = byte_range
        length = end - start + 1
        try:
            fp = file_path.open("rb")
            fp.seek(start)
        except Exception as exc:
            return _json_error(f"open asset failed: {exc}", status=500)
        resp = StreamingHttpResponse(file_iter(fp, remaining=length), status=206, content_type=content_type)
        resp["Content-Range"] = f"bytes {start}-{end}/{file_size}"
        resp["Accept-Ranges"] = "bytes"
        resp["Content-Length"] = str(length)
    else:
        try:
            fp = file_path.open("rb")
        except Exception as exc:
            return _json_error(f"open asset failed: {exc}", status=500)
        resp = StreamingHttpResponse(file_iter(fp, remaining=None), status=200, content_type=content_type)
        if file_size > 0:
            resp["Content-Length"] = str(file_size)
        resp["Accept-Ranges"] = "bytes"

    safe_name = Path(str(download_name or "file").replace("\\", "/")).name
    resp["Content-Disposition"] = f'inline; filename="{safe_name}"'
    resp["Cache-Control"] = "private, max-age=0, must-revalidate"
    # Weak etag based on file stats; good enough for local dev.
    if file_size > 0 and mtime > 0:
        resp["ETag"] = f'W/"{file_size}-{mtime}"'
    return resp  # type: ignore[return-value]


def _try_media_file_from_url(raw_url: str) -> Optional[Path]:
    url = str(raw_url or "").strip()
    if not url:
        return None
    try:
        p = urllib.parse.urlparse(url)
        path = p.path or ""
    except Exception:
        path = url

    media_url = str(getattr(settings, "MEDIA_URL", "/media/") or "/media/")
    if not media_url.startswith("/"):
        media_url = "/" + media_url
    if not media_url.endswith("/"):
        media_url += "/"

    if not path.startswith(media_url):
        return None

    rel = path[len(media_url) :]
    if not rel:
        return None

    media_root = Path(getattr(settings, "MEDIA_ROOT", "") or Path.cwd() / "media").resolve()
    try:
        candidate = (media_root / rel).resolve()
    except Exception:
        return None
    # Prevent path traversal
    if media_root not in candidate.parents and candidate != media_root:
        return None
    return candidate


def _project_assets_root() -> Path:
    media_root = Path(getattr(settings, "MEDIA_ROOT", "") or Path.cwd() / "media")
    root = media_root / "aiworkflow_projects" / "assets"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _project_thumbnails_root() -> Path:
    media_root = Path(getattr(settings, "MEDIA_ROOT", "") or Path.cwd() / "media")
    root = media_root / "aiworkflow_projects" / "thumbnails"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _asset_bucket_root(project_id: Optional[int], bucket: str) -> Path:
    b = str(bucket or "assets").strip().lower()
    if b not in ("assets", "thumbnails"):
        b = "assets"

    pid = None
    try:
        if project_id is not None:
            pv = int(project_id)
            if pv > 0:
                pid = pv
    except Exception:
        pid = None

    if pid is not None:
        root = (_blueprint_projects_root() / str(pid) / b).resolve()
        root.mkdir(parents=True, exist_ok=True)
        return root

    return _project_assets_root() if b == "assets" else _project_thumbnails_root()


def _guess_extension(file_name: str, content_type: str) -> str:
    ext = Path(file_name or "").suffix.lower()
    if ext:
        return ext
    guessed = mimetypes.guess_extension(str(content_type or "").split(";")[0].strip()) or ""
    return guessed.lower() if guessed else ".bin"


def _build_asset_payload(file_path: Path, *, kind: str, name: str, content_type: str, size: int) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    media_root = Path(getattr(settings, "MEDIA_ROOT", "") or file_path.parent.parent).resolve()
    try:
        rel = file_path.resolve().relative_to(media_root)
    except Exception:
        return None, "failed to compute asset relative path"

    media_url = str(getattr(settings, "MEDIA_URL", "/media/") or "/media/")
    if not media_url.startswith("/"):
        media_url = "/" + media_url
    if not media_url.endswith("/"):
        media_url += "/"

    rel_url = rel.as_posix()
    url = f"{media_url}{rel_url}"
    return {
        "kind": kind,
        "name": name,
        "contentType": content_type,
        "size": int(size or 0),
        "relativePath": rel_url,
        "absolutePath": str(file_path.resolve()),
        "url": url,
    }, None


def _media_root_path() -> Path:
    return Path(getattr(settings, "MEDIA_ROOT", "") or Path.cwd() / "media").resolve()


def _path_under_media_root(path_obj: Path) -> bool:
    media_root = _media_root_path()
    try:
        candidate = path_obj.resolve()
    except Exception:
        return False
    return candidate == media_root or media_root in candidate.parents


def _is_comfy_forward_url(raw_url: str) -> bool:
    v = str(raw_url or "").strip()
    if not v:
        return False
    try:
        p = urllib.parse.urlparse(v)
        path = str(p.path or "").strip().lower()
        return path.endswith("/api/workflow/view") or path.endswith("/api/workflow/outputs")
    except Exception:
        return False


def _resolve_project_asset_delete_path(payload: Dict[str, Any]) -> Tuple[Optional[Path], Optional[str], bool]:
    """Return (path, err, forwarded_only). forwarded_only=True means comfy forwarded URL and no file deletion needed."""
    source_path_raw = str(payload.get("sourcePath") or "").strip()
    relative_path_raw = str(payload.get("relativePath") or "").strip().replace("\\", "/")
    raw_url = str(payload.get("url") or "").strip()

    if _is_comfy_forward_url(raw_url):
        return None, None, True

    candidate: Optional[Path] = None
    if source_path_raw:
        try:
            candidate = Path(source_path_raw).expanduser().resolve()
        except Exception:
            return None, "sourcePath is invalid", False
    elif relative_path_raw:
        rel = relative_path_raw.lstrip("/")
        candidate = (_media_root_path() / rel).resolve()
    elif raw_url:
        candidate = _try_media_file_from_url(raw_url)

    if candidate is None:
        return None, None, False
    if not _path_under_media_root(candidate):
        return None, "asset path out of media root", False
    return candidate, None, False


def _persist_uploaded_project_asset(uploaded_file: Any, kind: str, *, project_id: Optional[int] = None, bucket: str = "assets") -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    if uploaded_file is None:
        return None, "file is required"

    safe_kind = str(kind or "").strip().lower()
    if safe_kind not in ("image", "video"):
        safe_kind = "file"

    original_name = Path(str(getattr(uploaded_file, "name", "") or "file").replace("\\", "/")).name
    content_type = str(getattr(uploaded_file, "content_type", "") or "")
    ext = _guess_extension(original_name, content_type)
    base_name = Path(original_name).stem.strip() or safe_kind
    ts = int(time.time() * 1000)
    random_suffix = uuid.uuid4().hex[:8]
    final_name = f"{base_name}_{ts}_{random_suffix}{ext}"

    root = _asset_bucket_root(project_id, bucket)
    day_dir = root / time.strftime("%Y%m%d")
    day_dir.mkdir(parents=True, exist_ok=True)
    file_path = day_dir / final_name
    tmp_path = day_dir / f".{final_name}.tmp"

    try:
        with tmp_path.open("wb") as f:
            for chunk in uploaded_file.chunks():
                f.write(chunk)
        os.replace(str(tmp_path), str(file_path))
    except Exception as exc:
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except Exception:
            pass
        return None, f"save asset failed: {exc}"

    return _build_asset_payload(
        file_path,
        kind=safe_kind,
        name=original_name,
        content_type=content_type,
        size=int(getattr(uploaded_file, "size", 0) or 0),
    )


def _persist_project_asset_bytes(
    content: bytes,
    *,
    kind: str,
    file_name: str,
    content_type: str,
    project_id: Optional[int] = None,
    bucket: str = "assets",
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    safe_kind = str(kind or "").strip().lower()
    if safe_kind not in ("image", "video"):
        safe_kind = "file"

    original_name = Path(str(file_name or "file").replace("\\", "/")).name or "file"
    ext = _guess_extension(original_name, content_type)
    base_name = Path(original_name).stem.strip() or safe_kind
    ts = int(time.time() * 1000)
    random_suffix = uuid.uuid4().hex[:8]
    final_name = f"{base_name}_{ts}_{random_suffix}{ext}"

    root = _asset_bucket_root(project_id, bucket)
    day_dir = root / time.strftime("%Y%m%d")
    day_dir.mkdir(parents=True, exist_ok=True)
    file_path = day_dir / final_name
    tmp_path = day_dir / f".{final_name}.tmp"

    try:
        with tmp_path.open("wb") as f:
            f.write(content)
        os.replace(str(tmp_path), str(file_path))
    except Exception as exc:
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except Exception:
            pass
        return None, f"save asset failed: {exc}"

    return _build_asset_payload(
        file_path,
        kind=safe_kind,
        name=original_name,
        content_type=content_type,
        size=len(content),
    )


@api_view(["GET"])
def list_projects(_: Request) -> Response:
    items = BlueprintProject.objects.all().order_by("-updated_at", "-id")
    projects = [
        {
            "id": item.id,
            "name": item.name,
            "data": item.data,
            "createdAt": int(item.created_at.timestamp() * 1000) if item.created_at else None,
            "updatedAt": int(item.updated_at.timestamp() * 1000) if item.updated_at else None,
        }
        for item in items
    ]
    return Response({"ok": True, "projects": projects})


@api_view(["POST"])
def save_project(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    name = str(payload.get("name") or "").strip()
    if not name:
        return _json_error("name is required")

    snapshot = _as_blueprint_snapshot(payload.get("snapshot"))
    if snapshot is None:
        return _json_error("snapshot is invalid")

    project_id_raw = payload.get("projectId")
    project: Optional[BlueprintProject]
    if project_id_raw in (None, "", 0):
        project = BlueprintProject.objects.create(name=name, data="")
    else:
        try:
            project = BlueprintProject.objects.filter(id=int(project_id_raw)).first()
        except Exception:
            project = None
        if project is None:
            return _json_error("projectId not found", status=404)
        project.name = name

    data_path, write_err = _write_project_snapshot_file(project, snapshot)
    if write_err or not data_path:
        if project and not project.data:
            try:
                project.delete()
            except Exception:
                pass
        return _json_error(f"保存项目文件失败：{write_err or 'unknown error'}", status=500)

    project.data = data_path
    project.save(update_fields=["name", "data", "updated_at"])

    # Keep project thumbnail files strictly tied to currently node-referenced resources.
    try:
        _cleanup_project_thumbnail_orphans(project.id, snapshot)
    except Exception:
        pass
 
    return Response(
        {
            "ok": True,
            "project": {
                "id": project.id,
                "name": project.name,
                "data": project.data,
                "createdAt": int(project.created_at.timestamp() * 1000) if project.created_at else None,
                "updatedAt": int(project.updated_at.timestamp() * 1000) if project.updated_at else None,
            },
        }
    )


@api_view(["GET"])
def load_project(request: Request) -> Response:
    project_id_raw = request.query_params.get("id")
    try:
        project_id = int(project_id_raw)
    except Exception:
        return _json_error("id is required")

    project = BlueprintProject.objects.filter(id=project_id).first()
    if project is None:
        return _json_error("project not found", status=404)

    file_path, path_err = _project_file_from_data_path(project.data)
    if path_err or file_path is None:
        return _json_error(f"project data path invalid: {path_err or 'unknown error'}", status=500)
    if not file_path.exists():
        return _json_error("project json file not found", status=404)

    try:
        raw = file_path.read_text(encoding="utf-8")
        snapshot_any = json.loads(raw)
    except Exception as exc:
        return _json_error(f"读取项目文件失败：{exc}", status=500)

    snapshot = _as_blueprint_snapshot(snapshot_any)
    if snapshot is None:
        return _json_error("project snapshot is invalid", status=500)

    # Load path also performs a best-effort orphan cleanup to prevent stale thumbnail buildup.
    try:
        _cleanup_project_thumbnail_orphans(project.id, snapshot)
    except Exception:
        pass

    # If a resource has a sourcePath (absolute local path), rewrite its url to a backend streaming endpoint.
    # This makes refresh/reload possible even when browser can no longer access project-external local files.
    try:
        resources_by_id = snapshot.get("resourcesById")
        resource_order = snapshot.get("resourceOrder")
        if isinstance(resources_by_id, dict) and isinstance(resource_order, list):
            for rid in resource_order:
                if not isinstance(rid, str):
                    continue
                r = resources_by_id.get(rid)
                if not isinstance(r, dict):
                    continue
                source_path = str(r.get("sourcePath") or "").strip()
                raw_url = str(r.get("url") or "").strip()
                if not source_path:
                    continue

                # 1) always rewrite for non-persistable urls (blob/data/file) or empty url
                should_rewrite = (not raw_url) or raw_url.startswith("blob:") or raw_url.startswith("data:") or raw_url.startswith("file:")

                # 2) if url points to a media file that has been cleaned up (404), also rewrite.
                if not should_rewrite and raw_url:
                    media_file = _try_media_file_from_url(raw_url)
                    if media_file is not None and not media_file.exists():
                        should_rewrite = True

                if not should_rewrite:
                    continue
                rid_q = urllib.parse.quote(rid, safe="")
                r["url"] = f"/api/workflow/projects/assets/local?projectId={project.id}&resourceId={rid_q}"
    except Exception:
        # Never fail loading project due to best-effort URL rewrite.
        pass

    return Response(
        {
            "ok": True,
            "project": {
                "id": project.id,
                "name": project.name,
                "data": project.data,
                "createdAt": int(project.created_at.timestamp() * 1000) if project.created_at else None,
                "updatedAt": int(project.updated_at.timestamp() * 1000) if project.updated_at else None,
            },
            "snapshot": snapshot,
        }
    )


@api_view(["POST"])
def delete_project(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    project_id_raw = payload.get("id")
    try:
        project_id = int(project_id_raw)
    except Exception:
        return _json_error("id is required")

    project = BlueprintProject.objects.filter(id=project_id).first()
    if project is None:
        return _json_error("project not found", status=404)

    project_dir = (_blueprint_projects_root() / str(project.id)).resolve()

    project.delete()

    # Force cleanup: remove the whole project folder recursively, including
    # assets/thumbnails subfolders and all nested files, regardless of usage.
    try:
        root = _blueprint_projects_root().resolve()
        if project_dir.exists() and (root in project_dir.parents or project_dir == root):
            shutil.rmtree(project_dir, ignore_errors=True)
    except Exception:
        pass

    return Response({"ok": True, "id": project_id})


@api_view(["POST"])
def upload_project_asset(request: Request) -> Response:
    uploaded = request.FILES.get("file")
    kind = request.data.get("kind") if hasattr(request, "data") else None
    project_id_raw = request.data.get("projectId") if hasattr(request, "data") else None
    bucket_raw = request.data.get("bucket") if hasattr(request, "data") else None

    project_id: Optional[int] = None
    try:
        if project_id_raw not in (None, ""):
            v = int(project_id_raw)
            if v > 0:
                project_id = v
    except Exception:
        project_id = None

    bucket = str(bucket_raw or "assets").strip().lower() or "assets"
    asset, err = _persist_uploaded_project_asset(
        uploaded,
        str(kind or ""),
        project_id=project_id,
        bucket=bucket,
    )
    if err or asset is None:
        return _json_error(f"上传资源失败：{err or 'unknown error'}", status=400)
    return Response({"ok": True, "asset": asset})


@api_view(["POST"])
def import_project_asset(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)

    kind = str(payload.get("kind") or "").strip().lower()
    if kind not in ("image", "video"):
        return _json_error("kind must be image or video", status=400)

    project_id: Optional[int] = None
    try:
        pid_raw = payload.get("projectId")
        if pid_raw not in (None, ""):
            v = int(pid_raw)
            if v > 0:
                project_id = v
    except Exception:
        project_id = None

    bucket = str(payload.get("bucket") or "assets").strip().lower() or "assets"
    if bucket not in ("assets", "thumbnails"):
        bucket = "assets"

    base_url, _ = _normalize_base_url(payload.get("baseUrl")) if payload.get("baseUrl") else (None, None)
    filename = str(payload.get("filename") or payload.get("name") or "").strip()
    subfolder = str(payload.get("subfolder") or "").strip()
    folder_type = str(payload.get("type") or "output").strip() or "output"

    source_path_raw = str(payload.get("sourcePath") or "").strip()
    source_url_raw = str(payload.get("sourceUrl") or payload.get("url") or "").strip()

    content: Optional[bytes] = None
    content_type = "application/octet-stream"
    final_name = filename or f"imported_{kind}"
    source_path_for_snapshot = ""

    if source_path_raw:
        try:
            source_path = Path(source_path_raw).expanduser().resolve()
        except Exception:
            return _json_error("sourcePath is invalid", status=400)
        if not source_path.is_absolute():
            return _json_error("sourcePath must be absolute", status=400)
        if not source_path.exists() or not source_path.is_file():
            return _json_error("sourcePath not found", status=404)
        try:
            content = source_path.read_bytes()
        except Exception as exc:
            return _json_error(f"read sourcePath failed: {exc}", status=500)
        content_type = mimetypes.guess_type(str(source_path))[0] or content_type
        if not filename:
            final_name = source_path.name
        source_path_for_snapshot = str(source_path)
    else:
        if (not filename or not base_url) and source_url_raw:
            try:
                p = urllib.parse.urlparse(source_url_raw)
                q = urllib.parse.parse_qs(p.query)
                if not base_url:
                    base_from_q = str((q.get("baseUrl") or [""])[0]).strip()
                    if base_from_q:
                        base_url, _ = _normalize_base_url(base_from_q)
                if not filename:
                    filename = str((q.get("filename") or [""])[0]).strip()
                    if filename:
                        final_name = filename
                if not subfolder:
                    subfolder = str((q.get("subfolder") or [""])[0]).strip()
                if folder_type == "output":
                    folder_type_q = str((q.get("type") or [""])[0]).strip()
                    if folder_type_q:
                        folder_type = folder_type_q
            except Exception:
                pass

        if base_url and filename:
            view_q = urllib.parse.urlencode(
                {
                    "filename": filename,
                    "subfolder": subfolder,
                    "type": folder_type,
                }
            )
            comfy_view_url = str(base_url).rstrip("/") + "/view?" + view_q
            raw, err = _request_raw("GET", comfy_view_url, data=None, headers={"Accept": "*/*"}, timeout_sec=45.0)
            if err or raw is None:
                return _json_error(f"fetch comfy output failed: {err or 'unknown error'}", status=502)
            content = raw
            guessed = mimetypes.guess_type(filename)[0]
            if guessed:
                content_type = guessed
            source_path_for_snapshot = ""
        elif source_url_raw:
            raw, err = _request_raw("GET", source_url_raw, data=None, headers={"Accept": "*/*"}, timeout_sec=45.0)
            if err or raw is None:
                return _json_error(f"fetch sourceUrl failed: {err or 'unknown error'}", status=502)
            content = raw
        else:
            return _json_error("sourcePath or sourceUrl/baseUrl+filename is required", status=400)

    if content is None:
        return _json_error("import content is empty", status=400)

    asset, save_err = _persist_project_asset_bytes(
        content,
        kind=kind,
        file_name=final_name,
        content_type=content_type,
        project_id=project_id,
        bucket=bucket,
    )
    if save_err or asset is None:
        return _json_error(f"导入资源失败：{save_err or 'unknown error'}", status=500)

    # Persisted local path should be used by snapshot recovery path.
    asset["sourcePath"] = str(asset.get("absolutePath") or source_path_for_snapshot or "")
    return Response({"ok": True, "asset": asset})


@api_view(["POST"])
def delete_project_asset(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    if not isinstance(payload, dict):
        payload = {}

    candidate, err, forwarded_only = _resolve_project_asset_delete_path(payload)
    if err:
        return _json_error(f"删除资源失败：{err}", status=400)
    if forwarded_only:
        return Response({"ok": True, "fileDeleted": False, "path": ""})
    if candidate is None:
        # No backend-managed file location was provided/found.
        return Response({"ok": True, "fileDeleted": False, "path": ""})

    deleted = False
    try:
        if candidate.exists() and candidate.is_file():
            candidate.unlink()
            deleted = True
    except Exception as exc:
        return _json_error(f"删除资源失败：{exc}", status=500)

    return Response({"ok": True, "fileDeleted": deleted, "path": str(candidate)})


@api_view(["GET"])
def get_local_project_asset(request: Request) -> Response:
    project_id_raw = request.query_params.get("projectId")
    resource_id = str(request.query_params.get("resourceId") or "").strip()
    try:
        project_id = int(project_id_raw)
    except Exception:
        return _json_error("projectId is required")
    if not resource_id:
        return _json_error("resourceId is required")

    project = BlueprintProject.objects.filter(id=project_id).first()
    if project is None:
        return _json_error("project not found", status=404)

    file_path, path_err = _project_file_from_data_path(project.data)
    if path_err or file_path is None:
        return _json_error(f"project data path invalid: {path_err or 'unknown error'}", status=500)
    if not file_path.exists():
        return _json_error("project json file not found", status=404)

    try:
        raw = file_path.read_text(encoding="utf-8")
        snapshot_any = json.loads(raw)
    except Exception as exc:
        return _json_error(f"读取项目文件失败：{exc}", status=500)
    snapshot = _as_blueprint_snapshot(snapshot_any)
    if snapshot is None:
        return _json_error("project snapshot is invalid", status=500)

    resources_by_id = snapshot.get("resourcesById")
    if not isinstance(resources_by_id, dict):
        return _json_error("project resources is invalid", status=500)
    r = resources_by_id.get(resource_id)
    if not isinstance(r, dict):
        return _json_error("resource not found", status=404)

    kind = str(r.get("kind") or "").strip().lower()
    if kind not in ("image", "video"):
        return _json_error("resource kind not supported", status=400)

    source_path_raw = str(r.get("sourcePath") or "").strip()
    if not source_path_raw:
        return _json_error("resource sourcePath is empty", status=404)

    try:
        source_path = Path(source_path_raw).expanduser().resolve()
    except Exception:
        return _json_error("resource sourcePath is invalid", status=400)

    if not source_path.is_absolute():
        return _json_error("resource sourcePath must be absolute", status=400)
    if not source_path.exists() or not source_path.is_file():
        return _json_error("local file not found", status=404)

    # Basic extension guard to reduce risk of arbitrary file reads.
    ext = source_path.suffix.lower()
    if kind == "image" and ext not in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".avif"):
        return _json_error("file extension not allowed for image", status=403)
    if kind == "video" and ext not in (".mp4", ".webm", ".mov", ".m4v", ".mkv", ".avi", ".ogg"):
        return _json_error("file extension not allowed for video", status=403)

    content_type = mimetypes.guess_type(str(source_path))[0] or "application/octet-stream"
    name = str(r.get("name") or source_path.name)
    return _stream_file_response(request, source_path, content_type=content_type, download_name=name)
