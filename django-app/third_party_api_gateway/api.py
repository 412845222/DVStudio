from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import mimetypes
import os
import random
import shutil
import threading
from pathlib import Path
import re
import time
import uuid
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Generator, Iterable, List, Optional, Set, Tuple, cast

from django.conf import settings
from django.http import HttpRequest, HttpResponseNotAllowed, JsonResponse, StreamingHttpResponse
from django.http.response import HttpResponseBase
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from .models import MeshyTaskMirror, VideoGenerationTaskMirror

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
from dwebapp.ai.credentials_store import get_meshy_api_key


_seedance_download_lock = threading.Lock()
_seedance_active_download_ids: Set[int] = set()


def _json_error(message: str, status: int = 400) -> Response:
    return Response({"ok": False, "error": message}, status=status)


def _is_record(v: Any) -> bool:
    return isinstance(v, dict)


def _coerce_request_payload(v: Any) -> Dict[str, Any]:
    if isinstance(v, dict):
        return v
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
    base = v[:-1] if v.endswith("/") else v
    return base, None


_ssl_context_cache: Optional[ssl.SSLContext] = None


def _get_ssl_context() -> ssl.SSLContext:
    global _ssl_context_cache
    if _ssl_context_cache is not None:
        return _ssl_context_cache
    try:
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
    except Exception:
        ctx = ssl.create_default_context()
    _ssl_context_cache = ctx
    return ctx


def _request_json(method: str, url: str, payload: Optional[Dict[str, Any]] = None, timeout_sec: float = 5.0) -> Tuple[Optional[Any], Optional[str]]:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec, context=_get_ssl_context()) as res:
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
        with urllib.request.urlopen(req, timeout=timeout_sec, context=_get_ssl_context()) as res:
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


def _request_json_with_headers(method: str, url: str, payload: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None, timeout_sec: float = 30.0) -> Tuple[Optional[Any], Optional[str]]:
    data = None
    req_headers = {"Accept": "application/json"}
    if headers:
        req_headers.update({str(k): str(v) for k, v in headers.items()})
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec, context=_get_ssl_context()) as res:
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


def _meshy_cfg() -> Dict[str, Any]:
    api_key = get_meshy_api_key().strip()
    return {
        "api_key": api_key,
        "api_base": "https://api.meshy.ai",
        "timeout_sec": 45.0,
    }


def _meshy_mode_path(mode: str) -> Optional[str]:
    m = str(mode or "").strip()
    mapping = {
        "text-to-3d": "/openapi/v2/text-to-3d",
        "image-to-3d": "/openapi/v1/image-to-3d",
        "multi-image-to-3d": "/openapi/v1/multi-image-to-3d",
        "text-to-image": "/openapi/v1/text-to-image",
        "image-to-image": "/openapi/v1/image-to-image",
        "retexture": "/openapi/v1/retexture",
        "remesh": "/openapi/v1/remesh",
        "rigging": "/openapi/v1/rigging",
        "animation": "/openapi/v1/animations",
    }
    return mapping.get(m)


def _meshy_headers(cfg: Dict[str, Any]) -> Dict[str, str]:
    return {"Authorization": f"Bearer {str(cfg.get('api_key') or '').strip()}"}


def _meshy_pick_first_url(obj: Any) -> str:
    if isinstance(obj, str):
        return obj.strip()
    if isinstance(obj, dict):
        for key in ("glb", "pre_remeshed_glb", "fbx", "obj", "stl", "usdz", "rigged_character_glb_url", "rigged_character_fbx_url", "animation_glb_url", "animation_fbx_url", "processed_usdz_url", "processed_armature_fbx_url"):
            value = obj.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""


def _meshy_pick_first_image_url(obj: Any) -> str:
    if isinstance(obj, str):
        return obj.strip()
    if isinstance(obj, list):
        for item in obj:
            value = str(item or "").strip()
            if value:
                return value
    if isinstance(obj, dict):
        image_urls = obj.get("image_urls")
        if isinstance(image_urls, list):
            for item in image_urls:
                value = str(item or "").strip()
                if value:
                    return value
        for key in ("image_url", "thumbnail_url"):
            value = str(obj.get(key) or "").strip()
            if value:
                return value
    return ""


def _meshy_local_media_url(rel_path: Path) -> str:
    media_url = str(getattr(settings, "MEDIA_URL", "/media/") or "/media/")
    if not media_url.endswith("/"):
        media_url += "/"
    return media_url + str(rel_path).replace("\\", "/")


def _meshy_save_remote_asset(raw_url: str, stem: str, ext_hint: str) -> str:
    url = str(raw_url or "").strip()
    if not url:
        return ""
    media_root = Path(getattr(settings, "MEDIA_ROOT", "") or Path(__file__).resolve().parents[1] / "media")
    rel_dir = Path("meshy_outputs") / time.strftime("%Y%m")
    out_dir = media_root / rel_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    ext = ext_hint.strip() or Path(urllib.parse.urlparse(url).path).suffix or ".bin"
    safe_stem = re.sub(r"[^a-zA-Z0-9._-]+", "_", str(stem or "meshy_asset"))
    out_path = out_dir / f"{safe_stem}{ext}"
    req = urllib.request.Request(url, headers={"Accept": "*/*"}, method="GET")
    with urllib.request.urlopen(req, timeout=60.0, context=_get_ssl_context()) as res:
        data = res.read()
    out_path.write_bytes(data)
    return _meshy_local_media_url(rel_dir / out_path.name)


def _meshy_data_uri_from_bytes(content: bytes, mime_type: str) -> str:
    encoded = base64.b64encode(content).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _meshy_guess_mime_for_local_image(path: Path) -> str:
    guessed = mimetypes.guess_type(str(path))[0]
    if guessed:
        return guessed
    suffix = path.suffix.lower()
    if suffix in (".jpg", ".jpeg"):
        return "image/jpeg"
    if suffix == ".webp":
        return "image/webp"
    if suffix == ".bmp":
        return "image/bmp"
    if suffix == ".gif":
        return "image/gif"
    return "image/png"


def _meshy_path_from_local_reference(raw_value: str) -> Optional[Path]:
    value = str(raw_value or "").strip()
    if not value:
        return None
    parsed = urllib.parse.urlparse(value)
    path_text = ""
    if parsed.scheme == "file":
        path_text = urllib.request.url2pathname(parsed.path or "")
    elif re.match(r"^[a-zA-Z]:[\\/]", value) or value.startswith("/"):
        path_text = value
    elif parsed.scheme in ("http", "https", ""):
        url_path = parsed.path or value
        if url_path.startswith("/media/"):
            media_root = Path(getattr(settings, "MEDIA_ROOT", "") or Path(__file__).resolve().parents[1] / "media")
            rel = url_path[len("/media/"):].lstrip("/\\")
            path_text = str(media_root / rel)
        elif url_path.startswith("/api/workflow/projects/assets/local"):
            qs = urllib.parse.parse_qs(parsed.query or "")
            path_text = str((qs.get("path") or [""])[0] or "")
    if not path_text:
        return None
    try:
        path = Path(path_text)
    except Exception:
        return None
    if os.name == "nt":
        raw_path = str(path)
        if raw_path.startswith("\\") and re.match(r"^\\[a-zA-Z]:", raw_path):
            path = Path(raw_path.lstrip("\\"))
    try:
        return path if path.is_file() else None
    except Exception:
        return None


def _meshy_normalize_image_reference(raw_value: Any) -> str:
    value = str(raw_value or "").strip()
    if not value or value.startswith("data:"):
        return value
    path = _meshy_path_from_local_reference(value)
    if path is not None:
        try:
            return _meshy_data_uri_from_bytes(path.read_bytes(), _meshy_guess_mime_for_local_image(path))
        except Exception:
            return value
    return value


def _meshy_build_create_payload(payload: Dict[str, Any]) -> Tuple[Optional[str], Optional[Dict[str, Any]], Optional[str]]:
    mode = str(payload.get("mode") or "").strip().lower()
    family = str(payload.get("family") or "").strip().lower()
    if not mode and family:
        mode = family
    if mode == "refine":
        mode = "text-to-3d"
    if mode == "animations":
        mode = "animation"
    if mode in ("rigging", "animation"):
        return None, None, "mode is not supported yet: rigging/animation"
    endpoint = _meshy_mode_path(mode)
    if not endpoint:
        return None, None, "mode is invalid"
    body: Dict[str, Any] = {}
    prompt = str(payload.get("prompt") or "").strip()
    if mode == "text-to-3d":
        if not prompt:
            return None, None, "prompt is required"
        body["prompt"] = prompt
        stage = str(payload.get("stage") or "preview").strip()
        if stage in ("preview", "refine"):
            body["mode"] = stage
        preview_task_id = str(payload.get("preview_task_id") or "").strip()
        if preview_task_id:
            body["preview_task_id"] = preview_task_id
        negative_prompt = str(payload.get("negative_prompt") or "").strip()
        if negative_prompt:
            body["negative_prompt"] = negative_prompt
    elif mode == "image-to-3d":
        image_url = _meshy_normalize_image_reference(payload.get("image_url"))
        if not image_url:
            return None, None, "image_url is required"
        body["image_url"] = image_url
        if prompt:
            body["prompt"] = prompt
    elif mode == "multi-image-to-3d":
        image_urls = payload.get("image_urls")
        cleaned = [_meshy_normalize_image_reference(x) for x in image_urls] if isinstance(image_urls, list) else []
        cleaned = [x for x in cleaned if x][:4]
        if not cleaned:
            return None, None, "image_urls is required"
        body["image_urls"] = cleaned
        if prompt:
            body["prompt"] = prompt
    elif mode == "text-to-image":
        if not prompt:
            return None, None, "prompt is required"
        ai_model = str(payload.get("ai_model") or "").strip().lower()
        if ai_model not in ("nano-banana", "nano-banana-pro"):
            ai_model = "nano-banana"
        body["ai_model"] = ai_model
        body["prompt"] = prompt
    elif mode == "image-to-image":
        if not prompt:
            return None, None, "prompt is required"
        ai_model = str(payload.get("ai_model") or "").strip().lower()
        if ai_model not in ("nano-banana", "nano-banana-pro"):
            ai_model = "nano-banana"
        refs_any = payload.get("reference_image_urls")
        if not isinstance(refs_any, list):
            refs_any = payload.get("image_urls")
        refs = [_meshy_normalize_image_reference(x) for x in refs_any] if isinstance(refs_any, list) else []
        refs = [x for x in refs if x][:5]
        if not refs:
            return None, None, "reference_image_urls is required"
        body["ai_model"] = ai_model
        body["prompt"] = prompt
        body["reference_image_urls"] = refs
    elif mode == "retexture":
        input_task_id = str(payload.get("input_task_id") or payload.get("preview_task_id") or "").strip()
        model_url = str(payload.get("model_url") or "").strip()
        if input_task_id:
            body["input_task_id"] = input_task_id
        elif model_url:
            body["model_url"] = model_url
        else:
            return None, None, "input_task_id or model_url is required"
        text_style_prompt = str(payload.get("text_style_prompt") or payload.get("texture_prompt") or "").strip()
        image_style_url = str(payload.get("image_style_url") or payload.get("texture_image_url") or "").strip()
        if not text_style_prompt and prompt:
            text_style_prompt = prompt
        if not text_style_prompt and not image_style_url:
            return None, None, "text_style_prompt or image_style_url is required"
        if text_style_prompt:
            body["text_style_prompt"] = text_style_prompt
        if image_style_url:
            body["image_style_url"] = _meshy_normalize_image_reference(image_style_url)
    elif mode == "remesh":
        input_task_id = str(payload.get("input_task_id") or payload.get("preview_task_id") or "").strip()
        model_url = str(payload.get("model_url") or "").strip()
        if input_task_id:
            body["input_task_id"] = input_task_id
        elif model_url:
            body["model_url"] = model_url
        else:
            return None, None, "input_task_id or model_url is required"
    elif mode == "rigging":
        input_task_id = str(payload.get("input_task_id") or "").strip()
        model_url = str(payload.get("model_url") or "").strip()
        if input_task_id:
            body["input_task_id"] = input_task_id
        elif model_url:
            body["model_url"] = model_url
        else:
            return None, None, "input_task_id or model_url is required"
    elif mode == "animation":
        rig_task_id = str(payload.get("rig_task_id") or payload.get("input_task_id") or "").strip()
        action_id_raw = payload.get("action_id")
        if not rig_task_id:
            return None, None, "rig_task_id is required"
        try:
            action_id = int(float(str(action_id_raw)))
        except Exception:
            return None, None, "action_id is required"
        body["rig_task_id"] = rig_task_id
        body["action_id"] = action_id

    extra_keys: List[str] = []
    if mode in ("text-to-3d", "image-to-3d", "multi-image-to-3d"):
        extra_keys = ["ai_model", "model_type", "topology", "target_polycount", "symmetry_mode", "should_remesh", "save_pre_remeshed_model", "should_texture", "enable_pbr", "pose_mode", "texture_prompt", "texture_image_url", "moderation", "image_enhancement", "remove_lighting", "target_formats"]
    elif mode in ("text-to-image", "image-to-image"):
        extra_keys = ["aspect_ratio", "generate_multi_view", "pose_mode", "seed", "negative_prompt"]
    elif mode == "retexture":
        extra_keys = ["topology", "target_polycount", "texture_richness", "target_formats"]
    elif mode == "remesh":
        extra_keys = ["target_formats", "topology", "target_polycount", "resize_height", "origin_at", "convert_format_only"]
    elif mode == "rigging":
        extra_keys = ["height_meters", "is_t_pose", "is_animation", "seed"]
    elif mode == "animation":
        extra_keys = ["post_process", "seed"]

    for key in extra_keys:
        if key in body:
            continue
        value = payload.get(key)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        if isinstance(value, list) and not value:
            continue
        body[key] = value

    return mode, body, None


def _meshy_extract_task_id(obj: Any) -> str:
    if isinstance(obj, dict):
        for key in ("result", "id", "task_id"):
            value = obj.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""


def _meshy_normalize_task(mode: str, task_id: str, obj: Any) -> Dict[str, Any]:
    if not isinstance(obj, dict):
        return {"ok": True, "mode": mode, "taskId": task_id, "status": "unknown", "progress": 0, "thumbnailUrl": "", "modelUrls": {}, "preferredModelUrl": "", "statusText": "invalid response"}

    raw_status = str(obj.get("status") or "").strip().lower()
    status = raw_status or "unknown"
    progress = obj.get("progress")
    try:
        progress_num = max(0, min(100, int(float(str(progress)))))
    except Exception:
        progress_num = 0
    result_obj = obj.get("result")
    result = result_obj if isinstance(result_obj, dict) else {}
    thumbnail_url = str(obj.get("thumbnail_url") or result.get("thumbnail_url") or "").strip()
    model_urls = obj.get("model_urls") if isinstance(obj.get("model_urls"), dict) else {}
    if not model_urls and isinstance(result.get("model_urls"), dict):
        model_urls = cast(Dict[str, Any], result.get("model_urls"))
    if not model_urls and mode == "rigging":
        model_urls = {"glb": str(result.get("rigged_character_glb_url") or "").strip(), "fbx": str(result.get("rigged_character_fbx_url") or "").strip()}
    if not model_urls and mode == "animation":
        model_urls = {"glb": str(result.get("animation_glb_url") or "").strip(), "fbx": str(result.get("animation_fbx_url") or "").strip(), "usdz": str(result.get("processed_usdz_url") or "").strip(), "armature_fbx": str(result.get("processed_armature_fbx_url") or "").strip()}
    model_urls = {str(k): str(v).strip() for k, v in model_urls.items() if str(v or "").strip()} if isinstance(model_urls, dict) else {}
    preferred_model_url = _meshy_pick_first_url(model_urls)
    image_urls_raw = obj.get("image_urls")
    if not isinstance(image_urls_raw, list):
        image_urls_raw = result.get("image_urls")
    image_urls = [str(x or "").strip() for x in image_urls_raw] if isinstance(image_urls_raw, list) else []
    image_urls = [x for x in image_urls if x]
    preferred_image_url = _meshy_pick_first_image_url(image_urls)
    primary_remote_url = preferred_model_url or preferred_image_url
    preferred_local_url = ""
    if status in ("succeeded", "success", "completed") and primary_remote_url:
        ext_hint = Path(urllib.parse.urlparse(primary_remote_url).path).suffix or (".png" if image_urls else ".glb")
        try:
            preferred_local_url = _meshy_save_remote_asset(primary_remote_url, f"meshy_{task_id}", ext_hint)
        except Exception:
            preferred_local_url = ""
    task_error_raw = obj.get("task_error")
    task_error: Dict[str, Any] = task_error_raw if isinstance(task_error_raw, dict) else {}
    error_message = str(task_error.get("message") or obj.get("error") or "").strip()
    status_text = str(obj.get("status_text") or "").strip()
    if not status_text:
        if status in ("pending", "queued"):
            status_text = "Meshy：任务排队中"
        elif status in ("running", "processing", "in_progress"):
            status_text = f"Meshy：生成中 {progress_num}%"
        elif status in ("succeeded", "success", "completed"):
            status_text = "Meshy：生成完成"
        elif status in ("failed", "error"):
            status_text = error_message or "Meshy：生成失败"

    return {
        "ok": True,
        "mode": mode,
        "taskId": task_id,
        "status": status,
        "progress": progress_num,
        "thumbnailUrl": thumbnail_url,
        "modelUrls": model_urls,
        "imageUrls": image_urls,
        "preferredImageUrl": preferred_local_url or preferred_image_url,
        "sourceImageUrl": preferred_image_url,
        "preferredModelUrl": preferred_local_url or primary_remote_url,
        "sourceModelUrl": primary_remote_url,
        "statusText": status_text,
        "errorMessage": error_message,
        "raw": obj,
    }


def _meshy_target_and_family(mode: str, payload: Optional[Dict[str, Any]] = None) -> Tuple[str, str]:
    raw_target = str((payload or {}).get("target") or "").strip().lower()
    raw_family = str((payload or {}).get("family") or "").strip().lower()
    if raw_family:
        if raw_family in ("text-to-image", "image-to-image"):
            return "image", raw_family
        return "3d", raw_family
    if raw_target == "image":
        return "image", "text-to-image"
    if mode == "text-to-image":
        return "image", "text-to-image"
    if mode == "image-to-image":
        return "image", "image-to-image"
    if mode == "image-to-3d":
        return "3d", "image-to-3d"
    if mode == "multi-image-to-3d":
        return "3d", "multi-image-to-3d"
    if mode == "retexture":
        return "3d", "retexture"
    if mode == "remesh":
        return "3d", "remesh"
    if mode == "rigging":
        return "3d", "rigging"
    if mode == "animation":
        return "3d", "animation"
    return "3d", "text-to-3d"


def _meshy_image_count(payload: Optional[Dict[str, Any]]) -> int:
    if not isinstance(payload, dict):
        return 0
    image_urls = payload.get("image_urls")
    if isinstance(image_urls, list):
        return len([str(x or "").strip() for x in image_urls if str(x or "").strip()])
    reference_image_urls = payload.get("reference_image_urls")
    if isinstance(reference_image_urls, list):
        return len([str(x or "").strip() for x in reference_image_urls if str(x or "").strip()])
    image_url = str(payload.get("image_url") or "").strip()
    return 1 if image_url else 0


def _meshy_first_non_empty_str(payload: Optional[Dict[str, Any]], keys: List[str]) -> str:
    if not isinstance(payload, dict):
        return ""
    for key in keys:
        value = str(payload.get(key) or "").strip()
        if value:
            return value
    return ""


def _meshy_relation_kind_for_family(family: str) -> str:
    raw = str(family or "").strip().lower()
    if raw in ("retexture", "texture", "textured"):
        return "texture"
    if raw in ("rigging", "rig", "bind-skeleton", "skeleton"):
        return "rigging"
    if raw in ("animation", "bind-animation", "motion"):
        return "animation"
    if raw == "remesh":
        return "remesh"
    return "model"


def _meshy_payload_has_relation_context(payload: Optional[Dict[str, Any]]) -> bool:
    if not isinstance(payload, dict):
        return False
    keys = ["relationKind", "relation_kind", "rootTaskId", "root_task_id", "parentTaskId", "parent_task_id", "sourceTaskId", "source_task_id", "upstreamTaskId", "upstream_task_id", "preview_task_id", "capabilities"]
    for key in keys:
        value = payload.get(key)
        if isinstance(value, list) and value:
            return True
        if str(value or "").strip():
            return True
    return False


def _meshy_capabilities_for_relation(relation_kind: str, payload: Optional[Dict[str, Any]] = None) -> List[str]:
    next_caps: List[str] = []
    if isinstance(payload, dict):
        raw_caps = payload.get("capabilities")
        if isinstance(raw_caps, list):
            for raw in raw_caps:
                value = str(raw or "").strip().lower()
                if value and value not in next_caps:
                    next_caps.append(value)
    if "model" not in next_caps:
        next_caps.append("model")
    if relation_kind == "texture" and "textured" not in next_caps:
        next_caps.append("textured")
    if relation_kind == "rigging" and "rigged" not in next_caps:
        next_caps.append("rigged")
    if relation_kind == "animation" and "animated" not in next_caps:
        next_caps.append("animated")
    return next_caps


def _meshy_relationship_from_payload(task_id: str, family: str, payload: Optional[Dict[str, Any]]) -> Tuple[str, str, str, List[str]]:
    relation_kind = _meshy_first_non_empty_str(payload, ["relationKind", "relation_kind"]).lower() or _meshy_relation_kind_for_family(family)
    parent_task_id = _meshy_first_non_empty_str(payload, ["parentTaskId", "parent_task_id", "sourceTaskId", "source_task_id", "upstreamTaskId", "upstream_task_id", "preview_task_id"])
    root_task_id = _meshy_first_non_empty_str(payload, ["rootTaskId", "root_task_id"]) or parent_task_id or task_id
    capabilities = _meshy_capabilities_for_relation(relation_kind, payload)
    return relation_kind, root_task_id, parent_task_id, capabilities


def _meshy_child_order(item: Dict[str, Any]) -> Tuple[int, str]:
    kind = str(item.get("relationKind") or item.get("relation_kind") or "").strip().lower()
    order_map = {"model": 0, "texture": 1, "remesh": 2, "rigging": 3, "animation": 4}
    return order_map.get(kind, 99), str(item.get("taskId") or "")


def _meshy_effective_priority(item: Dict[str, Any]) -> Tuple[int, str]:
    kind = str(item.get("relationKind") or item.get("relation_kind") or "").strip().lower()
    priority_map = {"model": 0, "texture": 1, "remesh": 2, "rigging": 3, "animation": 4}
    return priority_map.get(kind, 99), str(item.get("updatedAt") or "")


def _build_meshy_task_tree(rows: List[MeshyTaskMirror]) -> List[Dict[str, Any]]:
    items = [_serialize_meshy_task_row(row) for row in rows]
    items.sort(key=_meshy_effective_priority)
    node_map: Dict[str, Dict[str, Any]] = {}
    roots: List[Dict[str, Any]] = []
    for item in items:
        task_id = str(item.get("taskId") or "").strip()
        if not task_id:
            continue
        node_map[task_id] = dict(item)
        node_map[task_id]["children"] = []
    for item in items:
        task_id = str(item.get("taskId") or "").strip()
        if not task_id:
            continue
        node = node_map.get(task_id)
        if not node:
            continue
        parent_id = str(item.get("parentTaskId") or "").strip()
        root_id = str(item.get("rootTaskId") or task_id).strip()
        node["rootTaskId"] = root_id
        if parent_id and parent_id in node_map and parent_id != task_id:
            node_map[parent_id]["children"].append(node)
        else:
            roots.append(node)
    for root in roots:
        root["children"].sort(key=_meshy_child_order)
    roots.sort(key=lambda x: str(x.get("updatedAt") or ""), reverse=True)
    return roots


def _serialize_meshy_task_row(row: MeshyTaskMirror) -> Dict[str, Any]:
    row_id = cast(int, getattr(row, "id"))
    project_id = cast(Optional[int], getattr(row, "project_id", None))
    return {
        "id": row_id,
        "taskId": row.task_id,
        "mode": row.mode,
        "target": row.task_target,
        "family": row.task_family,
        "relationKind": row.relation_kind,
        "rootTaskId": row.root_task_id,
        "parentTaskId": row.parent_task_id,
        "capabilities": row.capabilities or [],
        "status": row.status,
        "progress": row.progress,
        "prompt": row.prompt,
        "negativePrompt": row.negative_prompt,
        "imageCount": row.image_count,
        "thumbnailUrl": row.thumbnail_url,
        "preferredModelUrl": row.preferred_model_url,
        "localAssetUrl": row.local_asset_url,
        "localAssetPath": row.local_asset_path,
        "sourceModelUrl": row.source_model_url,
        "errorMessage": row.error_message,
        "statusText": row.status_text,
        "lastNodeId": row.last_node_id,
        "projectId": project_id,
        "remoteCreatedAt": row.remote_created_at,
        "remoteFinishedAt": row.remote_finished_at,
        "createdAt": row.created_at.isoformat(),
        "updatedAt": row.updated_at.isoformat(),
        "requestPayload": row.request_payload or {},
        "responsePayload": row.response_payload or {},
    }


def _meshy_upsert_task_mirror(*, task_id: str, mode: str, request_payload: Optional[Dict[str, Any]] = None, normalized_task: Optional[Dict[str, Any]] = None) -> Optional[MeshyTaskMirror]:
    task_id = str(task_id or "").strip()
    if not task_id:
        return None
    target, family = _meshy_target_and_family(mode, request_payload)
    row, _ = MeshyTaskMirror.objects.get_or_create(task_id=task_id)
    row.mode = str(mode or "").strip()
    row.task_target = target
    row.task_family = family

    if isinstance(request_payload, dict):
        has_relation_context = _meshy_payload_has_relation_context(request_payload)
        relation_kind, root_task_id, parent_task_id, capabilities = _meshy_relationship_from_payload(task_id, family, request_payload)
        row.request_payload = request_payload
        row.prompt = str(request_payload.get("prompt") or row.prompt or "").strip()
        row.negative_prompt = str(request_payload.get("negative_prompt") or row.negative_prompt or "").strip()
        row.image_count = _meshy_image_count(request_payload)
        if has_relation_context or not row.relation_kind:
            row.relation_kind = relation_kind
        if has_relation_context or not row.root_task_id:
            row.root_task_id = root_task_id
        if has_relation_context or not row.parent_task_id:
            row.parent_task_id = parent_task_id
        if has_relation_context or not isinstance(row.capabilities, list) or not row.capabilities:
            row.capabilities = capabilities

    if not row.relation_kind:
        row.relation_kind = _meshy_relation_kind_for_family(family)
    if not row.root_task_id:
        row.root_task_id = task_id
    if not isinstance(row.capabilities, list) or not row.capabilities:
        row.capabilities = _meshy_capabilities_for_relation(row.relation_kind, request_payload)

    if isinstance(normalized_task, dict):
        row.status = str(normalized_task.get("status") or row.status or "idle").strip() or "idle"
        try:
            row.progress = max(0, min(100, int(float(str(normalized_task.get("progress") or 0)))))
        except Exception:
            row.progress = 0
        row.thumbnail_url = str(normalized_task.get("thumbnailUrl") or row.thumbnail_url or "").strip()
        row.preferred_model_url = str(normalized_task.get("preferredModelUrl") or row.preferred_model_url or "").strip()
        row.source_model_url = str(normalized_task.get("sourceModelUrl") or row.source_model_url or "").strip()
        row.error_message = str(normalized_task.get("errorMessage") or row.error_message or "").strip()
        row.status_text = str(normalized_task.get("statusText") or row.status_text or "").strip()
        if row.preferred_model_url.startswith("/media/"):
            row.local_asset_url = row.preferred_model_url
        raw = normalized_task.get("raw")
        if isinstance(raw, dict):
            row.response_payload = raw
            row.remote_created_at = str(raw.get("created_at") or row.remote_created_at or "").strip()
            row.remote_finished_at = str(raw.get("finished_at") or row.remote_finished_at or "").strip()

    if isinstance(row.response_payload, dict):
        model_urls = row.response_payload.get("model_urls")
        if isinstance(model_urls, dict):
            preferred = _meshy_pick_first_url(model_urls)
            if preferred and not row.source_model_url:
                row.source_model_url = preferred
        image_urls = row.response_payload.get("image_urls")
        if isinstance(image_urls, list):
            preferred_image = _meshy_pick_first_image_url(image_urls)
            if preferred_image and not row.source_model_url:
                row.source_model_url = preferred_image
    row.save()
    return row


def _nanobanana_cfg() -> Dict[str, str]:
    NANOBANANA_DEFAULT_MODEL = "gemini-2.5-flash-image"
    NANOBANANA_FLASH31_MODEL = "gemini-3.1-flash-image-preview"
    NANOBANANA_PRO_MODEL = "gemini-3-pro-image-preview"
    NANOBANANA_ALLOWED_MODELS = {NANOBANANA_DEFAULT_MODEL, NANOBANANA_FLASH31_MODEL, NANOBANANA_PRO_MODEL}

    def _nanobanana_normalize_model(raw: str) -> str:
        m = str(raw or "").strip()
        if not m:
            return NANOBANANA_DEFAULT_MODEL
        if m in NANOBANANA_ALLOWED_MODELS:
            return m
        legacy_map = {"gemini-2.0-flash": NANOBANANA_DEFAULT_MODEL, "gemini-2.0-flash-lite": NANOBANANA_DEFAULT_MODEL, "gemini-2.5-flash": NANOBANANA_DEFAULT_MODEL, "gemini-2.5-flash-lite": NANOBANANA_DEFAULT_MODEL}
        if m in legacy_map:
            return legacy_map[m]
        return NANOBANANA_DEFAULT_MODEL

    def _env_or_default(name: str, fallback: str) -> str:
        v = os.environ.get(name)
        return v if v else fallback

    api_key = ""
    try:
        from dwebapp.ai.credentials_store import get_gemini_api_key
        api_key = (get_gemini_api_key() or "").strip()
    except Exception:
        api_key = ""
    model = _nanobanana_normalize_model(_env_or_default("NANOBANANA_MODEL", NANOBANANA_DEFAULT_MODEL))
    api_base = _env_or_default("NANOBANANA_API_BASE", "https://generativelanguage.googleapis.com/v1beta").strip() or "https://generativelanguage.googleapis.com/v1beta"
    timeout_sec = _env_or_default("NANOBANANA_TIMEOUT_SEC", "120").strip() or "120"
    generate_url = _env_or_default("NANOBANANA_GENERATE_URL", "").strip()
    stream_url = _env_or_default("NANOBANANA_STREAM_URL", "").strip()
    if not generate_url:
        generate_url = api_base.rstrip("/") + f"/models/{model}:generateContent"
    if not stream_url:
        stream_url = api_base.rstrip("/") + f"/models/{model}:streamGenerateContent"

    return {"generate_url": generate_url, "stream_url": stream_url, "api_key": api_key, "model": model, "api_base": api_base, "timeout_sec": timeout_sec}


def _nanobanana_truthy(v: Any) -> bool:
    if v is None:
        return False
    if isinstance(v, bool):
        return bool(v)
    s = str(v).strip().lower()
    return s in ("1", "true", "yes", "y", "on", "pro")


def _nanobanana_cfg_with_model(cfg: Dict[str, str], model: str) -> Dict[str, str]:
    allowed = {"gemini-2.5-flash-image", "gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"}
    m = str(model or "").strip()
    if not m:
        return cfg
    if m not in allowed:
        m = "gemini-2.5-flash-image"
    api_base = str(cfg.get("api_base") or "https://generativelanguage.googleapis.com/v1beta").strip() or "https://generativelanguage.googleapis.com/v1beta"
    next_cfg = dict(cfg)
    next_cfg["model"] = m
    next_cfg["generate_url"] = api_base.rstrip("/") + f"/models/{m}:generateContent"
    next_cfg["stream_url"] = api_base.rstrip("/") + f"/models/{m}:streamGenerateContent"
    return next_cfg


_NANOBANANA_ALLOWED_ASPECT_RATIOS: List[Tuple[int, int]] = [(1, 1), (2, 3), (3, 2), (3, 4), (4, 3), (4, 5), (5, 4), (9, 16), (16, 9), (21, 9)]


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


def _nanobanana_build_gemini_payload(*, prompt: str, aspect_ratio: Optional[str], image_size: Optional[str], ref_images: Optional[List[Tuple[str, bytes, str]]], model: str) -> Dict[str, Any]:
    parts: List[Dict[str, Any]] = [{"text": str(prompt or "")}]
    if ref_images:
        for ref_image in ref_images:
            try:
                _, content, content_type = ref_image
                mime_type = str(content_type or "application/octet-stream")
                parts.append({"inlineData": {"mimeType": mime_type, "data": base64.b64encode(content).decode("ascii")}})
            except Exception:
                continue

    image_cfg: Dict[str, Any] = {}
    ar = _nanobanana_coerce_aspect_ratio(aspect_ratio)
    if ar:
        image_cfg["aspectRatio"] = ar
    if (model or "").strip() == "gemini-3-pro-image-preview":
        sz = _nanobanana_coerce_image_size(image_size)
        if sz:
            image_cfg["imageSize"] = sz

    gen_cfg: Dict[str, Any] = {"responseModalities": ["IMAGE"]}
    if image_cfg:
        gen_cfg["imageConfig"] = image_cfg

    return {"contents": [{"role": "user", "parts": parts}], "generationConfig": gen_cfg}


def _nanobanana_with_key(url: str, api_key: str) -> str:
    u = str(url or "").strip()
    if not api_key:
        return u
    sep = "&" if "?" in u else "?"
    return f"{u}{sep}key={api_key}"


def _nanobanana_backoff_seconds(attempt: int, *, base: float, cap: float) -> float:
    return min(cap, base * (2.0 ** attempt) + random.uniform(0, 0.5))


def _nanobanana_is_temporarily_unavailable_error(msg: str) -> bool:
    m = str(msg or "").lower()
    signals = ("temporarily unavailable", "rate limit", "quota exceeded", "overloaded", "too many requests", "503", "429")
    return any(s in m for s in signals)


def _nanobanana_call_gemini_once(cfg: Dict[str, str], payload: Dict[str, Any], *, stream: bool) -> Any:
    url = str(cfg.get("stream_url" if stream else "generate_url") or "").strip()
    if not url:
        raise ValueError("NanoBanana Gemini URL missing")
    api_key = str(cfg.get("api_key") or "").strip()
    url = _nanobanana_with_key(url, api_key)
    timeout = float(cfg.get("timeout_sec") or 120)

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
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
    max_attempts = 3
    for attempt in range(max_attempts):
        raw, err = _request_raw("POST", url, data=body, headers={"Content-Type": "application/json", "Accept": "application/json"}, timeout_sec=timeout)
        if not err and raw is not None:
            last_err = None
            break
        last_err = err or "unknown error"
        transient_signals = ("Remote end closed connection", "timed out", "url error", "connection reset", "Connection reset", "TLS", "EOF")
        is_transient = any(s in last_err for s in transient_signals)
        is_unavailable = _nanobanana_is_temporarily_unavailable_error(last_err)
        if attempt < (max_attempts - 1) and (is_transient or is_unavailable):
            wait_s = _nanobanana_backoff_seconds(attempt, base=1.2, cap=8.0) if is_unavailable else _nanobanana_backoff_seconds(attempt, base=0.8, cap=3.0)
            try:
                time.sleep(wait_s)
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
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "Accept": "application/json"}, method="POST")

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
                    yield decoder.decode(payload_str)
                except Exception:
                    continue
            else:
                nl = buf.find("\n")
                if nl == -1:
                    return
                buf = buf[nl + 1 :]
                continue

    with urllib.request.urlopen(req, timeout=timeout, context=_get_ssl_context()) as res:
        while True:
            chunk = res.read(4096)
            if not chunk:
                break
            buf += chunk.decode("utf-8", errors="ignore")
            for obj in _drain():
                yield obj


def _nanobanana_extract_inline_image(obj: Any) -> Optional[Tuple[str, bytes]]:
    if not isinstance(obj, dict):
        return None
    candidates = []
    parts = obj.get("parts")
    if isinstance(parts, list):
        candidates.extend(parts)
    candidates.extend(obj.get("candidates") or [])
    for candidate in candidates:
        if isinstance(candidate, dict):
            content = candidate.get("content")
            if isinstance(content, dict):
                content_parts = content.get("parts")
                if isinstance(content_parts, list):
                    candidates.extend(content_parts)
        if isinstance(candidate, dict):
            inline_data = candidate.get("inlineData")
            if isinstance(inline_data, dict):
                mime_type = str(inline_data.get("mimeType") or "image/png").strip()
                data = str(inline_data.get("data") or "").strip()
                if data:
                    try:
                        return mime_type, base64.b64decode(data)
                    except Exception:
                        continue
    return None


def _nanobanana_extract_billing_text(obj: Any) -> Optional[str]:
    if not isinstance(obj, dict):
        return None
    candidates = [obj]
    candidates.extend(obj.get("candidates") or [])
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        content = candidate.get("content")
        if isinstance(content, dict):
            candidates.append(content)
        usage_metadata = candidate.get("usageMetadata")
        if isinstance(usage_metadata, dict):
            total_tokens = usage_metadata.get("totalTokenCount")
            if isinstance(total_tokens, int) and total_tokens > 0:
                return f"total_tokens={total_tokens}"
    return None


def _nanobanana_save_inline_image(mime_type: str, data: bytes) -> str:
    media_root = Path(getattr(settings, "MEDIA_ROOT", "") or Path(__file__).resolve().parents[1] / "media")
    rel_dir = Path("nanobanana_outputs") / time.strftime("%Y%m")
    out_dir = media_root / rel_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    ct = str(mime_type or "").split(";")[0].strip().lower()
    ext = mimetypes.guess_extension(ct) if ct else ".png"
    if ext == ".jpe":
        ext = ".jpg"
    if not ext.startswith("."):
        ext = "." + ext

    filename = f"{uuid.uuid4().hex}{ext}"
    out_path = out_dir / filename
    out_path.write_bytes(data)

    media_url = str(getattr(settings, "MEDIA_URL", "/media/") or "/media/")
    if not media_url.endswith("/"):
        media_url += "/"
    return media_url + str((rel_dir / filename).as_posix())


def _nanobanana_ref_cache_root() -> Path:
    media_root = Path(getattr(settings, "MEDIA_ROOT", "") or Path(__file__).resolve().parents[1] / "media")
    return media_root / "nanobanana_ref_cache"


def _seedream_ref_cache_root() -> Path:
    media_root = Path(getattr(settings, "MEDIA_ROOT", "") or Path(__file__).resolve().parents[1] / "media")
    return media_root / "seedream_ref_cache"


def _nanobanana_safe_cache_path(cache_id: str) -> Optional[Path]:
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


def _seedream_safe_cache_path(cache_id: str) -> Optional[Path]:
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
    root = _seedream_ref_cache_root().resolve()
    full = (root.joinpath(*parts)).resolve()
    if full == root:
        return None
    if root not in full.parents:
        return None
    return full


def _seedream_save_ref_cache(filename: str, content: bytes, content_type: str) -> Optional[str]:
    ct = str(content_type or "").split(";")[0].strip().lower()
    ext = mimetypes.guess_extension(ct) if ct else None
    if not ext:
        ext = os.path.splitext(str(filename or ""))[1] or ".png"
    if ext == ".jpe":
        ext = ".jpg"
    if not ext.startswith("."):
        ext = "." + ext
    allowed_ext = {".png", ".jpg", ".jpeg", ".webp"}
    if ext.lower() not in allowed_ext:
        ext = ".png"
    ym = time.strftime("%Y%m")
    rel_dir = Path(ym)
    out_dir = _seedream_ref_cache_root() / rel_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    out_name = f"{uuid.uuid4().hex}{ext}"
    out_path = out_dir / out_name
    out_path.write_bytes(content or b"")
    return str((rel_dir / out_name).as_posix())


def _nanobanana_load_cached_refs(cache_ids: List[str]) -> List[Tuple[str, bytes, str]]:
    out: List[Tuple[str, bytes, str]] = []
    for cache_id in cache_ids:
        path = _nanobanana_safe_cache_path(cache_id)
        if path is None:
            return []
        try:
            content = path.read_bytes()
        except Exception:
            return []
        ct = _meshy_guess_mime_for_local_image(path)
        out.append((str(path.name), content, ct))
    return out


def _seedream_load_cached_refs(cache_ids: List[str]) -> List[Tuple[str, bytes, str]]:
    out: List[Tuple[str, bytes, str]] = []
    for cache_id in cache_ids:
        path = _seedream_safe_cache_path(cache_id)
        if path is None:
            return []
        try:
            content = path.read_bytes()
        except Exception:
            return []
        ct = _meshy_guess_mime_for_local_image(path)
        out.append((str(path.name), content, ct))
    return out


def _seedream_download_and_save(url: str) -> str:
    u = str(url or "").strip()
    if not (u.startswith("http://") or u.startswith("https://")):
        raise ValueError("invalid image url")
    req = urllib.request.Request(u, headers={"Accept": "image/*,application/octet-stream"}, method="GET")
    with urllib.request.urlopen(req, timeout=60.0, context=_get_ssl_context()) as res:
        content_type = str(res.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        data = res.read()

    ext = mimetypes.guess_extension(content_type) if content_type else None
    if not ext:
        parsed = urllib.parse.urlparse(u)
        ext = os.path.splitext(parsed.path)[1] or ".png"
    if not ext.startswith("."):
        ext = "." + ext
    allowed_exts = (".png", ".jpg", ".jpeg", ".webp", ".bmp")
    if ext.lower() not in allowed_exts:
        ext = ".png"

    ym = time.strftime("%Y%m")
    rel_dir = Path("seedream_outputs") / ym
    media_root = Path(getattr(settings, "MEDIA_ROOT", "") or Path(__file__).resolve().parents[1] / "media")
    out_dir = media_root / rel_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{ext}"
    out_path = out_dir / filename
    out_path.write_bytes(data)

    media_url = str(getattr(settings, "MEDIA_URL", "/media/") or "/media/")
    if not media_url.endswith("/"):
        media_url += "/"
    return media_url + str((rel_dir / filename).as_posix())


def _seedream_cfg() -> Dict[str, str]:
    def _env_or_default(name: str, fallback: str) -> str:
        v = os.environ.get(name)
        return v if v else fallback

    api_key = ""
    try:
        from dwebapp.ai.credentials_store import get_bytedance_api_key
        api_key = (get_bytedance_api_key() or "").strip()
    except Exception:
        api_key = ""

    model = _env_or_default("SEEDREAM_MODEL", "doubao-seedream-5-0").strip() or "doubao-seedream-5-0"
    api_base = _env_or_default("SEEDREAM_API_BASE", "https://ark.cn-beijing.volces.com/api/v3").strip() or "https://ark.cn-beijing.volces.com/api/v3"
    timeout_sec = _env_or_default("SEEDREAM_TIMEOUT_SEC", "120").strip() or "120"

    generate_url = _env_or_default("SEEDREAM_GENERATE_URL", "").strip()
    if not generate_url:
        generate_url = api_base.rstrip("/") + "/images/generations"

    return {"api_key": api_key, "model": model, "api_base": api_base, "generate_url": generate_url, "timeout_sec": timeout_sec}


def _seedream_cfg_with_model(cfg: Dict[str, str], model: str) -> Dict[str, str]:
    m = str(model or "").strip()
    if not m:
        return cfg
    api_base = str(cfg.get("api_base") or "https://ark.cn-beijing.volces.com/api/v3").strip() or "https://ark.cn-beijing.volces.com/api/v3"
    next_cfg = dict(cfg)
    next_cfg["model"] = m
    next_cfg["generate_url"] = api_base.rstrip("/") + "/images/generations"
    return next_cfg


def _seedream_size_from_aspect_ratio(model: str, aspect_ratio: Optional[str]) -> str:
    ar = str(aspect_ratio or "").strip()
    if not ar:
        return "1024x1024"
    model_text = str(model or "").strip().lower()
    if "seedream-5-0" in model_text:
        table = {"1:1": "1024x1024", "2:3": "832x1280", "3:2": "1280x832", "3:4": "896x1152", "4:3": "1152x896", "4:5": "960x1184", "5:4": "1184x960", "9:16": "800x1408", "16:9": "1408x800", "21:9": "1600x688"}
        return table.get(ar, "1024x1024")
    table_v3 = {"1:1": "1024x1024", "2:3": "832x1216", "3:2": "1216x832", "3:4": "896x1152", "4:3": "1152x896", "4:5": "896x1152", "5:4": "1152x896", "9:16": "832x1472", "16:9": "1472x832", "21:9": "1536x640"}
    return table_v3.get(ar, "1024x1024")


def _seedream_build_payload(*, prompt: str, model: str, aspect_ratio: Optional[str], ref_images: Optional[List[Tuple[str, bytes, str]]]) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"model": str(model or "").strip(), "prompt": str(prompt or ""), "size": _seedream_size_from_aspect_ratio(model, aspect_ratio), "response_format": "url", "watermark": False}

    model_text = str(model or "").strip().lower()
    if "seedream-5-0" in model_text:
        payload["output_format"] = "png"

    refs = list(ref_images or [])[:14]
    if refs:
        urls: List[str] = []
        for _, content, content_type in refs:
            ct = str(content_type or "image/png").split(";")[0].strip().lower() or "image/png"
            b64 = base64.b64encode(content or b"").decode("ascii")
            urls.append(f"data:{ct};base64,{b64}")
        if len(urls) == 1:
            payload["image"] = urls[0]
        else:
            payload["image"] = urls

    return payload


def _seedream_extract_image_urls(obj: Any) -> List[str]:
    out: List[str] = []
    if not isinstance(obj, dict):
        return out
    data = obj.get("data")
    if not isinstance(data, list):
        return out
    for it in data:
        if not isinstance(it, dict):
            continue
        u = it.get("url")
        if isinstance(u, str) and (u.startswith("http://") or u.startswith("https://")):
            out.append(u)
    return out


@api_view(["POST"])
def meshy_generate(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    mode, body, err = _meshy_build_create_payload(payload)
    if err or not mode or body is None:
        return _json_error(err or "invalid payload")

    cfg = _meshy_cfg()
    if not str(cfg.get("api_key") or "").strip():
        return _json_error("Meshy API Key 未配置，请先到设置页保存。", status=400)

    endpoint = _meshy_mode_path(mode)
    if not endpoint:
        return _json_error("mode is invalid")

    obj, req_err = _request_json_with_headers(
        "POST",
        str(cfg.get("api_base") or "").rstrip("/") + endpoint,
        body,
        headers=_meshy_headers(cfg),
        timeout_sec=float(cfg.get("timeout_sec") or 45.0),
    )
    if req_err:
        return _json_error(f"Meshy create failed: {req_err}", status=502)

    task_id = _meshy_extract_task_id(obj)
    if not task_id:
        return _json_error("Meshy create failed: missing task id", status=502)

    _meshy_upsert_task_mirror(
        task_id=task_id,
        mode=mode,
        request_payload={**payload, **body},
        normalized_task={
            "taskId": task_id,
            "status": "pending",
            "progress": 0,
            "statusText": "Meshy：任务已创建",
            "raw": obj,
        },
    )

    return Response({
        "ok": True,
        "mode": mode,
        "taskId": task_id,
        "status": "pending",
        "raw": obj,
    })


@api_view(["POST"])
def meshy_task(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    mode = str(payload.get("mode") or "").strip()
    task_id = str(payload.get("taskId") or payload.get("id") or "").strip()
    if not task_id:
        return _json_error("taskId is required")

    cfg = _meshy_cfg()
    if not str(cfg.get("api_key") or "").strip():
        return _json_error("Meshy API Key 未配置，请先到设置页保存。", status=400)

    endpoint = _meshy_mode_path(mode)
    if not endpoint:
        return _json_error("mode is invalid")

    obj, req_err = _request_json_with_headers(
        "GET",
        str(cfg.get("api_base") or "").rstrip("/") + endpoint + "/" + urllib.parse.quote(task_id, safe=""),
        None,
        headers=_meshy_headers(cfg),
        timeout_sec=float(cfg.get("timeout_sec") or 45.0),
    )
    if req_err:
        return _json_error(f"Meshy task failed: {req_err}", status=502)

    normalized = _meshy_normalize_task(mode, task_id, obj)
    row = _meshy_upsert_task_mirror(
        task_id=task_id,
        mode=mode,
        request_payload=payload,
        normalized_task=normalized,
    )
    if row and row.local_asset_url and not normalized.get("preferredModelUrl"):
        normalized["preferredModelUrl"] = row.local_asset_url
    return Response(normalized)


def _meshy_delete_remote_task(mode: str, task_id: str, cfg: Dict[str, Any]) -> Optional[str]:
    endpoint = _meshy_mode_path(mode)
    if not endpoint:
        return "mode is invalid"
    _, req_err = _request_raw(
        "DELETE",
        str(cfg.get("api_base") or "").rstrip("/") + endpoint + "/" + urllib.parse.quote(task_id, safe=""),
        data=None,
        headers=_meshy_headers(cfg),
        timeout_sec=float(cfg.get("timeout_sec") or 45.0),
    )
    if req_err:
        err_text = str(req_err).strip().lower()
        if "http 404" in err_text or "not found" in err_text:
            return None
        return req_err
    return None


@api_view(["POST"])
def meshy_stop(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    task_id = str(payload.get("taskId") or payload.get("id") or "").strip()
    if not task_id:
        return _json_error("taskId is required")

    row = MeshyTaskMirror.objects.filter(task_id=task_id).first()
    mode = str(payload.get("mode") or (row.mode if row else "") or "").strip().lower()
    if not mode:
        return _json_error("mode is required")

    cfg = _meshy_cfg()
    if not str(cfg.get("api_key") or "").strip():
        return _json_error("Meshy API Key 未配置，请先到设置页保存。", status=400)

    req_err = _meshy_delete_remote_task(mode, task_id, cfg)
    if req_err:
        return _json_error(f"Meshy stop failed: {req_err}", status=502)

    if row:
        row.status = "canceled"
        row.status_text = "Meshy：任务已停止"
        row.error_message = ""
        row.save(update_fields=["status", "status_text", "error_message", "updated_at"])

    return Response({"ok": True, "taskId": task_id, "status": "canceled"})


@api_view(["POST"])
def meshy_delete(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    task_id = str(payload.get("taskId") or payload.get("id") or "").strip()
    if not task_id:
        return _json_error("taskId is required")

    row = MeshyTaskMirror.objects.filter(task_id=task_id).first()
    mode = str(payload.get("mode") or (row.mode if row else "") or "").strip().lower()
    if not mode:
        return _json_error("mode is required")

    cfg = _meshy_cfg()
    if not str(cfg.get("api_key") or "").strip():
        return _json_error("Meshy API Key 未配置，请先到设置页保存。", status=400)

    req_err = _meshy_delete_remote_task(mode, task_id, cfg)
    if req_err:
        return _json_error(f"Meshy delete failed: {req_err}", status=502)

    MeshyTaskMirror.objects.filter(task_id=task_id).delete()
    MeshyTaskMirror.objects.filter(root_task_id=task_id).delete()

    return Response({"ok": True, "taskId": task_id, "deleted": True})


@api_view(["GET"])
def meshy_tasks_list(request: Request) -> Response:
    status = str(request.query_params.get("status") or "").strip().lower()
    target = str(request.query_params.get("target") or "").strip().lower()
    family = str(request.query_params.get("family") or "").strip().lower()
    q = MeshyTaskMirror.objects.all().order_by("-updated_at", "-id")
    if status:
        q = q.filter(status=status)
    if target in ("3d", "image"):
        q = q.filter(task_target=target)
    if family:
        q = q.filter(task_family=family)
    limit_raw = str(request.query_params.get("limit") or "80").strip()
    try:
        limit = max(1, min(200, int(limit_raw or "80")))
    except Exception:
        limit = 80
    rows = list(q)
    root_ids: Set[str] = set()
    for row in rows:
        root_ids.add(str(row.root_task_id or row.task_id).strip() or str(row.task_id))
    if root_ids:
        merged: Dict[str, MeshyTaskMirror] = {str(row.task_id): row for row in rows}
        for root in MeshyTaskMirror.objects.filter(task_id__in=list(root_ids)).order_by("-updated_at", "-id"):
            merged.setdefault(str(root.task_id), root)
        rows = list(merged.values())
    items = _build_meshy_task_tree(rows)[:limit]
    return Response({"ok": True, "items": items})


@api_view(["GET"])
def meshy_task_detail(request: Request) -> Response:
    task_id = str(request.query_params.get("taskId") or request.query_params.get("id") or "").strip()
    if not task_id:
        return _json_error("taskId is required")
    row = MeshyTaskMirror.objects.filter(task_id=task_id).first()
    if not row:
        return _json_error("task not found", status=404)
    root_task_id = str(row.root_task_id or row.task_id).strip() or str(row.task_id)
    rows = list(
        MeshyTaskMirror.objects.filter(task_id=root_task_id).order_by("-updated_at", "-id")
    )
    rows.extend(
        list(
            MeshyTaskMirror.objects.filter(root_task_id=root_task_id)
            .exclude(task_id=root_task_id)
            .order_by("-updated_at", "-id")
        )
    )
    items = _build_meshy_task_tree(rows)
    item = items[0] if items else _serialize_meshy_task_row(row)
    item["selectedTaskId"] = task_id
    return Response({"ok": True, "item": item})


@api_view(["GET"])
def meshy_balance(request: Request) -> Response:
    cfg = _meshy_cfg()
    configured = bool(str(cfg.get("api_key") or "").strip())
    if not configured:
        return Response({
            "ok": True,
            "available": False,
            "configured": False,
            "displayText": "未配置",
            "detail": "Meshy API Key 未配置，当前无法读取积分余额。",
        })
    obj, req_err = _request_json_with_headers(
        "GET",
        str(cfg.get("api_base") or "").rstrip("/") + "/openapi/v1/balance",
        None,
        headers=_meshy_headers(cfg),
        timeout_sec=float(cfg.get("timeout_sec") or 45.0),
    )
    if req_err:
        return Response(
            {
                "ok": True,
                "available": False,
                "configured": True,
                "displayText": "读取失败",
                "detail": f"Meshy 余额接口调用失败：{req_err}",
            }
        )

    if not isinstance(obj, dict):
        return Response(
            {
                "ok": True,
                "available": False,
                "configured": True,
                "displayText": "读取失败",
                "detail": "Meshy 余额接口返回格式异常。",
            }
        )

    raw_balance = obj.get("balance")
    try:
        balance_value = float(raw_balance)
    except Exception:
        return Response(
            {
                "ok": True,
                "available": False,
                "configured": True,
                "displayText": "读取失败",
                "detail": f"Meshy 余额接口未返回有效 balance 字段：{raw_balance!r}",
            }
        )

    if abs(balance_value - round(balance_value)) < 1e-9:
        balance_text = f"{int(round(balance_value)):,}"
    else:
        balance_text = f"{balance_value:,.2f}".rstrip("0").rstrip(".")

    return Response(
        {
            "ok": True,
            "available": True,
            "configured": True,
            "displayText": f"{balance_text} 积分",
            "detail": f"已同步 Meshy 积分余额（{time.strftime('%Y-%m-%d %H:%M:%S')}）。",
        }
    )


@csrf_exempt
def nanobanana_ref_cache(request: HttpRequest) -> HttpResponseBase:
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
def seedream_ref_cache(request: HttpRequest) -> HttpResponseBase:
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
            cache_id = _seedream_save_ref_cache(name, content, ct)
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
def nanobanana_generate_stream(request: HttpRequest) -> HttpResponseBase:
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

    raw_ar = request.POST.get("aspectRatio") or request.POST.get("aspect_ratio")
    aspect_ratio = _nanobanana_coerce_aspect_ratio(raw_ar)

    requested_model = str(request.POST.get("imageModel") or request.POST.get("image_model") or request.POST.get("model") or "").strip()
    use_gemini = (not requested_model) or requested_model.startswith("gemini-")
    if use_gemini:
        cfg = _nanobanana_cfg()
        if requested_model:
            cfg = _nanobanana_cfg_with_model(cfg, requested_model)
    else:
        cfg = _seedream_cfg()
        if requested_model:
            cfg = _seedream_cfg_with_model(cfg, requested_model)

    if not cfg.get("api_key"):

        def missing_cfg() -> Generator[bytes, None, None]:
            if use_gemini:
                yield _sse(
                    "msg",
                    _agent_to_ui_error(
                        "missing_config",
                        "Gemini API Key 缺失。请在设置页保存。",
                        details={"need": ["geminiApiKey"]},
                    ),
                ).encode("utf-8")
            else:
                yield _sse(
                    "msg",
                    _agent_to_ui_error(
                        "missing_config",
                        "Seedream API Key 缺失。请在设置页保存。",
                        details={"need": ["seedreamApiKey"]},
                    ),
                ).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

        resp = StreamingHttpResponse(missing_cfg(), content_type="text/event-stream")
        _apply_sse_headers(resp)
        return resp

    ref_uploads: List[Any] = []
    try:
        ref_uploads = list(request.FILES.getlist("refImages") or [])
    except Exception:
        ref_uploads = []
    if not ref_uploads:
        ref_single = request.FILES.get("refImage")
        if ref_single is not None:
            ref_uploads = [ref_single]

    ref_images: List[Tuple[str, bytes, str]] = []
    for ref_upload in ref_uploads:
        if ref_upload is None:
            continue
        try:
            ref_bytes = ref_upload.read()
            if not ref_bytes:
                continue
            ref_name = str(getattr(ref_upload, "name", "ref.png") or "ref.png")
            ref_ct = str(getattr(ref_upload, "content_type", "") or "")
            if not ref_ct:
                ref_ct = mimetypes.guess_type(ref_name)[0] or "image/png"
            ref_images.append((ref_name, ref_bytes, ref_ct))
        except Exception:
            continue

    def gen() -> Generator[bytes, None, None]:
        try:
            if use_gemini:
                yield _sse("msg", _agent_to_ui_task_status("started", message="Gemini：生成中…")).encode("utf-8")
                model = str(cfg.get("model") or "").strip() or "gemini-2.5-flash-image"
                payload = _nanobanana_build_payload(prompt=prompt, model=model, aspect_ratio=aspect_ratio, ref_images=ref_images)
                for chunk in _nanobanana_iter_gemini_stream(cfg, payload):
                    image_info = _nanobanana_extract_inline_image(chunk)
                    if image_info:
                        mime_type, data = image_info
                        rel_path = _nanobanana_save_inline_image(mime_type, data)
                        out_payload: Dict[str, Any] = {
                            "imageUrl": "/media/" + rel_path,
                            "imagePath": rel_path,
                            "model": model,
                            "status": "done",
                        }
                        yield _sse("msg", _agent_to_ui_chat_message(json.dumps(out_payload, ensure_ascii=False))).encode("utf-8")
                        yield _sse("msg", _agent_to_ui_task_status("done", message="Gemini：完成")).encode("utf-8")
                        yield _sse("done", "{}").encode("utf-8")
                        return
                raise ValueError("Gemini stream ended without returning an image")
            else:
                yield _sse("msg", _agent_to_ui_task_status("started", message="Seedream：生成中…")).encode("utf-8")
                model = str(cfg.get("model") or "").strip() or "seedream-3-0"
                payload = _seedream_build_payload(prompt=prompt, model=model, aspect_ratio=aspect_ratio, ref_images=ref_images)
                url = str(cfg.get("generate_url") or "").strip()
                api_key = str(cfg.get("api_key") or "").strip()
                url = _seedream_with_key(url, api_key)
                timeout = float(cfg.get("timeout_sec") or 120)
                body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                raw, err = _request_raw("POST", url, data=body, headers={"Content-Type": "application/json"}, timeout_sec=timeout)
                if err or raw is None:
                    raise ValueError(f"Seedream request failed: {err or 'unknown error'}")
                try:
                    text = raw.decode("utf-8")
                except Exception:
                    text = raw.decode("utf-8", errors="ignore")
                try:
                    obj = json.loads(text) if text else {}
                except Exception:
                    obj = {"raw": text[:2000]}
                urls = _seedream_extract_image_urls(obj)
                if not urls:
                    raise ValueError(f"Seedream returned no image URLs: {str(obj)[:500]}")
                out_payload: Dict[str, Any] = {
                    "imageUrl": urls[0],
                    "model": model,
                    "status": "done",
                }
                if len(urls) > 1:
                    out_payload["imageUrls"] = urls
                yield _sse("msg", _agent_to_ui_chat_message(json.dumps(out_payload, ensure_ascii=False))).encode("utf-8")
                yield _sse("msg", _agent_to_ui_task_status("done", message="Seedream：完成")).encode("utf-8")
                yield _sse("done", "{}").encode("utf-8")
        except Exception as e:
            yield _sse("msg", _agent_to_ui_error("generation_error", str(e) or "unknown error")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp


@api_view(["POST"])
def nanobanana_generate(request: Request) -> Response:
    prompt = str(request.data.get("prompt") or "").strip()
    if not prompt:
        return Response({"error": "prompt is required"}, status=400)

    raw_ar = request.data.get("aspectRatio") or request.data.get("aspect_ratio")
    aspect_ratio = _nanobanana_coerce_aspect_ratio(raw_ar)

    requested_model = str(request.data.get("imageModel") or request.data.get("image_model") or request.data.get("model") or "").strip()
    use_gemini = (not requested_model) or requested_model.startswith("gemini-")
    if use_gemini:
        cfg = _nanobanana_cfg()
        if requested_model:
            cfg = _nanobanana_cfg_with_model(cfg, requested_model)
    else:
        cfg = _seedream_cfg()
        if requested_model:
            cfg = _seedream_cfg_with_model(cfg, requested_model)

    if not cfg.get("api_key"):
        if use_gemini:
            return Response({"error": "Gemini API Key 缺失。请在设置页保存。"}, status=400)
        else:
            return Response({"error": "Seedream API Key 缺失。请在设置页保存。"}, status=400)

    ref_images: List[Tuple[str, bytes, str]] = []
    try:
        ref_files = request.FILES.getlist("refImages")
        for f in ref_files:
            if f is None:
                continue
            ref_bytes = f.read()
            if not ref_bytes:
                continue
            ref_name = str(getattr(f, "name", "ref.png") or "ref.png")
            ref_ct = str(getattr(f, "content_type", "") or "")
            if not ref_ct:
                ref_ct = mimetypes.guess_type(ref_name)[0] or "image/png"
            ref_images.append((ref_name, ref_bytes, ref_ct))
    except Exception:
        pass

    try:
        if use_gemini:
            model = str(cfg.get("model") or "").strip() or "gemini-2.5-flash-image"
            payload = _nanobanana_build_payload(prompt=prompt, model=model, aspect_ratio=aspect_ratio, ref_images=ref_images)
            obj = _nanobanana_request_gemini(cfg, payload)
            image_info = _nanobanana_extract_inline_image(obj)
            if not image_info:
                return Response({"error": "Gemini returned no image", "raw": obj}, status=500)
            mime_type, data = image_info
            rel_path = _nanobanana_save_inline_image(mime_type, data)
            return Response({"imageUrl": "/media/" + rel_path, "imagePath": rel_path, "model": model})
        else:
            model = str(cfg.get("model") or "").strip() or "seedream-3-0"
            payload = _seedream_build_payload(prompt=prompt, model=model, aspect_ratio=aspect_ratio, ref_images=ref_images)
            url = str(cfg.get("generate_url") or "").strip()
            api_key = str(cfg.get("api_key") or "").strip()
            url = _seedream_with_key(url, api_key)
            timeout = float(cfg.get("timeout_sec") or 120)
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            raw, err = _request_raw("POST", url, data=body, headers={"Content-Type": "application/json"}, timeout_sec=timeout)
            if err or raw is None:
                return Response({"error": f"Seedream request failed: {err or 'unknown error'}"}, status=500)
            try:
                text = raw.decode("utf-8")
            except Exception:
                text = raw.decode("utf-8", errors="ignore")
            try:
                obj = json.loads(text) if text else {}
            except Exception:
                obj = {"raw": text[:2000]}
            urls = _seedream_extract_image_urls(obj)
            if not urls:
                return Response({"error": "Seedream returned no image URLs", "raw": obj}, status=500)
            out = {"imageUrl": urls[0], "model": model}
            if len(urls) > 1:
                out["imageUrls"] = urls
            return Response(out)
    except Exception as e:
        return Response({"error": str(e) or "unknown error"}, status=500)


@csrf_exempt
def seedream_generate_stream(request: HttpRequest) -> HttpResponseBase:
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

    cfg = _seedream_cfg()
    if not cfg.get("api_key"):

        def missing_cfg() -> Generator[bytes, None, None]:
            yield _sse(
                "msg",
                _agent_to_ui_error(
                    "missing_config",
                    "Seedream API Key 缺失。请在设置页保存。",
                    details={"need": ["seedreamApiKey"]},
                ),
            ).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

        resp = StreamingHttpResponse(missing_cfg(), content_type="text/event-stream")
        _apply_sse_headers(resp)
        return resp

    requested_model = str(request.POST.get("imageModel") or request.POST.get("image_model") or request.POST.get("model") or "").strip()
    if requested_model:
        cfg = _seedream_cfg_with_model(cfg, requested_model)

    raw_ar = request.POST.get("aspectRatio") or request.POST.get("aspect_ratio")
    aspect_ratio = _seedream_coerce_aspect_ratio(raw_ar)

    ref_uploads: List[Any] = []
    try:
        ref_uploads = list(request.FILES.getlist("refImages") or [])
    except Exception:
        ref_uploads = []
    if not ref_uploads:
        ref_single = request.FILES.get("refImage")
        if ref_single is not None:
            ref_uploads = [ref_single]

    ref_images: List[Tuple[str, bytes, str]] = []
    for ref_upload in ref_uploads:
        if ref_upload is None:
            continue
        try:
            ref_bytes = ref_upload.read()
            if not ref_bytes:
                continue
            ref_name = str(getattr(ref_upload, "name", "ref.png") or "ref.png")
            ref_ct = str(getattr(ref_upload, "content_type", "") or "")
            if not ref_ct:
                ref_ct = mimetypes.guess_type(ref_name)[0] or "image/png"
            ref_images.append((ref_name, ref_bytes, ref_ct))
        except Exception:
            continue

    def gen() -> Generator[bytes, None, None]:
        try:
            yield _sse("msg", _agent_to_ui_task_status("started", message="Seedream：生成中…")).encode("utf-8")
            model = str(cfg.get("model") or "").strip() or "seedream-3-0"
            payload = _seedream_build_payload(prompt=prompt, model=model, aspect_ratio=aspect_ratio, ref_images=ref_images)
            url = str(cfg.get("generate_url") or "").strip()
            api_key = str(cfg.get("api_key") or "").strip()
            url = _seedream_with_key(url, api_key)
            timeout = float(cfg.get("timeout_sec") or 120)
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            raw, err = _request_raw("POST", url, data=body, headers={"Content-Type": "application/json"}, timeout_sec=timeout)
            if err or raw is None:
                raise ValueError(f"Seedream request failed: {err or 'unknown error'}")
            try:
                text = raw.decode("utf-8")
            except Exception:
                text = raw.decode("utf-8", errors="ignore")
            try:
                obj = json.loads(text) if text else {}
            except Exception:
                obj = {"raw": text[:2000]}
            urls = _seedream_extract_image_urls(obj)
            if not urls:
                raise ValueError(f"Seedream returned no image URLs: {str(obj)[:500]}")
            out_payload: Dict[str, Any] = {
                "imageUrl": urls[0],
                "model": model,
                "status": "done",
            }
            if len(urls) > 1:
                out_payload["imageUrls"] = urls
            yield _sse("msg", _agent_to_ui_chat_message(json.dumps(out_payload, ensure_ascii=False))).encode("utf-8")
            yield _sse("msg", _agent_to_ui_task_status("done", message="Seedream：完成")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")
        except Exception as e:
            yield _sse("msg", _agent_to_ui_error("generation_error", str(e) or "unknown error")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp


@csrf_exempt
def seedance_generate_stream(request: HttpRequest) -> HttpResponseBase:
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

    cfg = _seedance_cfg()
    if not cfg.get("api_key"):

        def missing_cfg() -> Generator[bytes, None, None]:
            yield _sse(
                "msg",
                _agent_to_ui_error(
                    "missing_config",
                    "字节方舟 API Key 缺失。请在设置页保存。",
                    details={"need": ["bytedanceApiKey"]},
                ),
            ).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

        resp = StreamingHttpResponse(missing_cfg(), content_type="text/event-stream")
        _apply_sse_headers(resp)
        return resp

    model = str(request.POST.get("model") or cfg.get("model") or "").strip() or str(cfg.get("model") or "")

    ratio = str(request.POST.get("ratio") or "adaptive").strip() or "adaptive"
    resolution = str(request.POST.get("resolution") or "").strip()

    duration_raw = request.POST.get("duration")
    duration: Optional[int] = None
    if duration_raw is not None and str(duration_raw).strip() != "":
        duration = _seedance_coerce_int(duration_raw, 5, min_value=1, max_value=30)

    frames_raw = str(request.POST.get("frames") or "").strip()
    frames_val: Optional[int] = None
    if frames_raw:
        try:
            n = int(frames_raw)
            if n < 29 or n > 289 or ((n - 25) % 4 != 0):
                raise ValueError("frames must satisfy 29<=frames<=289 and frames=25+4n")
            frames_val = n
        except Exception:
            raise ValueError("invalid frames: must satisfy 29<=frames<=289 and frames=25+4n")

    if duration is None and frames_val is None:
        duration = 5

    seed_raw = str(request.POST.get("seed") or "").strip()
    seed_val: Optional[int] = None
    if seed_raw:
        try:
            seed_val = int(seed_raw)
        except Exception:
            seed_val = None
    generate_audio = _seedance_truthy(request.POST.get("generateAudio") or request.POST.get("generate_audio"))
    watermark = _seedance_truthy(request.POST.get("watermark"))
    camera_fixed = _seedance_truthy(request.POST.get("cameraFixed") or request.POST.get("camera_fixed"))
    draft = _seedance_truthy(request.POST.get("draft"))
    return_last_frame = _seedance_truthy(request.POST.get("returnLastFrame") or request.POST.get("return_last_frame"))
    service_tier = str(request.POST.get("serviceTier") or request.POST.get("service_tier") or "").strip().lower()
    if service_tier not in ("", "default", "flex"):
        service_tier = ""
    if service_tier and not _seedance_model_supports_service_tier(model):
        service_tier = ""
    execution_expires_after_raw = str(
        request.POST.get("executionExpiresAfter") or request.POST.get("execution_expires_after") or ""
    ).strip()
    execution_expires_after: Optional[int] = None
    if execution_expires_after_raw:
        try:
            execution_expires_after = max(1, int(execution_expires_after_raw))
        except Exception:
            execution_expires_after = None
    ref_mode = str(request.POST.get("refMode") or "auto").strip().lower() or "auto"
    requested_task_type = str(request.POST.get("taskType") or request.POST.get("task_type") or "").strip().lower()
    ref_count = _seedance_coerce_int(request.POST.get("referenceCount"), 4, min_value=1, max_value=4)
    source = str(request.POST.get("source") or "bottom-chat").strip() or "bottom-chat"
    project_id_raw = str(request.POST.get("projectId") or request.POST.get("project_id") or "").strip()
    project_id: Optional[int] = None
    if project_id_raw:
        try:
            project_id = int(project_id_raw)
        except Exception:
            project_id = None

    ref_uploads: List[Any] = []
    try:
        ref_uploads = list(request.FILES.getlist("refImages") or [])
    except Exception:
        ref_uploads = []
    if not ref_uploads:
        ref_single = request.FILES.get("refImage")
        if ref_single is not None:
            ref_uploads = [ref_single]

    ref_images: List[Tuple[str, bytes, str]] = []
    for ref_upload in ref_uploads:
        if ref_upload is None:
            continue
        try:
            ref_bytes = ref_upload.read()
            if not ref_bytes:
                continue
            ref_name = str(getattr(ref_upload, "name", "ref.png") or "ref.png")
            ref_ct = str(getattr(ref_upload, "content_type", "") or "")
            if not ref_ct:
                ref_ct = mimetypes.guess_type(ref_name)[0] or "image/png"
            ref_images.append((ref_name, ref_bytes, ref_ct))
        except Exception:
            continue

    def gen() -> Generator[bytes, None, None]:
        try:
            yield _sse("msg", _agent_to_ui_task_status("started", message="Seedance：创建任务中…")).encode("utf-8")

            effective_ref_mode = ref_mode

            task_type = _seedance_pick_task_type(model, ref_images, effective_ref_mode, requested_task_type)
            content_obj = _seedance_build_content(prompt, ref_images, effective_ref_mode, ref_count)
            create_payload: Dict[str, Any] = {
                "model": model,
                "prompt": prompt,
                "content": content_obj,
                "task_type": task_type,
                "ratio": ratio,
                "watermark": watermark,
                "generate_audio": bool(generate_audio),
                "camera_fixed": bool(camera_fixed),
                "draft": bool(draft),
                "return_last_frame": bool(return_last_frame),
            }
            if frames_val is not None:
                create_payload["frames"] = frames_val
            elif duration is not None:
                create_payload["duration"] = duration
            if resolution:
                create_payload["resolution"] = resolution
            if seed_val is not None:
                create_payload["seed"] = seed_val
            if service_tier:
                create_payload["service_tier"] = service_tier
            if execution_expires_after is not None:
                create_payload["execution_expires_after"] = execution_expires_after

            create_url = str(cfg.get("create_url") or "").strip()
            timeout_sec = float(cfg.get("timeout_sec") or 120)
            headers = _seedance_headers(cfg)

            raw, err = _request_raw(
                "POST",
                create_url,
                data=json.dumps(create_payload, ensure_ascii=False).encode("utf-8"),
                headers=headers,
                timeout_sec=timeout_sec,
            )
            if err or raw is None:
                raise ValueError(f"Seedance create task failed: {err or 'unknown error'}")
            try:
                create_text = raw.decode("utf-8")
            except Exception:
                create_text = raw.decode("utf-8", errors="ignore")
            create_obj = json.loads(create_text) if create_text else {}
            task_id = str((create_obj or {}).get("id") or "").strip()
            if not task_id:
                raise ValueError(f"Seedance create task failed: invalid response {str(create_obj)[:500]}")

            row = _seedance_upsert_task_mirror(
                task_id=task_id,
                request_payload=create_payload,
                remote_task=create_obj,
                project_id=project_id,
                source=source,
            )
            if row and not row.status:
                row.status = "queued"
                row.status_text = "Seedance：任务已创建，等待生成"
                row.save(update_fields=["status", "status_text", "synced_at", "updated_at"])

            yield _sse("msg", _agent_to_ui_task_status("streaming", message=f"Seedance：任务已创建（{task_id}），等待生成…")).encode("utf-8")

            started_at = time.time()
            poll_interval_sec = max(1.0, float(cfg.get("poll_interval_sec") or 3))
            poll_timeout_sec = max(30.0, float(cfg.get("poll_timeout_sec") or 600))
            billing_text: Optional[str] = None

            while True:
                synced_row = _seedance_sync_remote_task(
                    cfg,
                    task_id,
                    request_payload=create_payload,
                    project_id=project_id,
                    source=source,
                    save_media=False,
                )
                task_obj = synced_row.response_payload if synced_row and isinstance(synced_row.response_payload, dict) else _seedance_get_task(cfg, task_id)
                status = str(task_obj.get("status") or "").strip().lower()
                if status in ("succeeded", "success"):
                    video_url_remote, last_frame_url_remote = _seedance_extract_content_urls(task_obj)
                    if not video_url_remote:
                        raise ValueError("Seedance succeeded but content.video_url is empty")

                    billing_text = _seedance_extract_usage_text(task_obj) or billing_text
                    if synced_row:
                        synced_row.video_url_remote = video_url_remote
                        synced_row.last_frame_url_remote = last_frame_url_remote
                        synced_row.status = status
                        synced_row.status_text = "Seedance：完成"
                        synced_row.error_message = ""
                        synced_row.usage = task_obj.get("usage") if isinstance(task_obj.get("usage"), dict) else synced_row.usage
                        synced_row.response_payload = task_obj
                        synced_row.save(update_fields=["video_url_remote", "last_frame_url_remote", "status", "status_text", "error_message", "usage", "response_payload", "synced_at", "updated_at"])
                        synced_row = _seedance_reconcile_local_media(synced_row, save_missing=True)
                    current_video_url_local = str((synced_row.video_url_local if synced_row else "") or "").strip()
                    current_video_source_path = str((synced_row.video_source_path_local if synced_row else "") or "").strip()
                    current_last_frame_url_local = str((synced_row.last_frame_url_local if synced_row else "") or "").strip()
                    current_last_frame_source_path = str((synced_row.last_frame_source_path_local if synced_row else "") or "").strip()
                    current_download_status = str((synced_row.download_status if synced_row else "") or "idle").strip() or "idle"
                    current_download_progress = int((synced_row.download_progress if synced_row else 0) or 0)
                    current_download_error = str((synced_row.download_error if synced_row else "") or "").strip()
                    out_payload: Dict[str, Any] = {
                        "taskId": task_id,
                        "videoUrl": current_video_url_local or video_url_remote,
                        "videoUrlLocal": current_video_url_local,
                        "videoUrlRemote": video_url_remote,
                        "videoSourcePath": current_video_source_path,
                        "lastFrameUrl": current_last_frame_url_local or last_frame_url_remote,
                        "lastFrameUrlLocal": current_last_frame_url_local,
                        "lastFrameUrlRemote": last_frame_url_remote,
                        "lastFrameSourcePath": current_last_frame_source_path,
                        "downloadStatus": current_download_status,
                        "downloadProgress": current_download_progress,
                        "downloadError": current_download_error,
                        "model": model,
                        "status": status,
                    }
                    if billing_text:
                        out_payload["billing"] = billing_text

                    yield _sse("msg", _agent_to_ui_chat_message(json.dumps(out_payload, ensure_ascii=False))).encode("utf-8")
                    yield _sse("msg", _agent_to_ui_task_status("done", message="Seedance：完成")).encode("utf-8")
                    yield _sse("done", "{}").encode("utf-8")
                    return

                if status in ("failed", "error", "expired", "cancelled"):
                    err_obj = task_obj.get("error") if isinstance(task_obj, dict) else None
                    if synced_row:
                        synced_row.status = status
                        synced_row.error_message = json.dumps(err_obj, ensure_ascii=False) if err_obj is not None and not isinstance(err_obj, str) else str(err_obj or "")
                        synced_row.status_text = f"Seedance：{status}"
                        synced_row.response_payload = task_obj if isinstance(task_obj, dict) else synced_row.response_payload
                        synced_row.save()
                    raise ValueError(f"Seedance task failed: status={status}, error={err_obj}")

                billing_text = _seedance_extract_usage_text(task_obj) or billing_text
                elapsed = int(max(0, time.time() - started_at))
                suffix = f"；计费：{billing_text}" if billing_text else ""
                yield _sse(
                    "msg",
                    _agent_to_ui_task_status("streaming", message=f"Seedance：{status or 'running'}（{elapsed}s）{suffix}"),
                ).encode("utf-8")

                if time.time() - started_at >= poll_timeout_sec:
                    raise ValueError(f"Seedance task timeout after {int(poll_timeout_sec)}s")
                try:
                    time.sleep(poll_interval_sec)
                except Exception:
                    pass
        except Exception as e:
            yield _sse("msg", _agent_to_ui_error("seedance_error", str(e) or "unknown error")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp


@api_view(["GET"])
def seedance_tasks_list(request: Request) -> Response:
    status = str(request.query_params.get("status") or "").strip().lower()
    model = str(request.query_params.get("model") or "").strip()
    q = VideoGenerationTaskMirror.objects.all().order_by("-updated_at", "-id")
    if status:
        q = q.filter(status=status)
    if model:
        q = q.filter(model=model)
    limit_raw = str(request.query_params.get("limit") or "80").strip()
    try:
        limit = max(1, min(200, int(limit_raw)))
    except Exception:
        limit = 80
    rows = list(q[:limit])
    out: List[Dict[str, Any]] = []
    for row in rows:
        item: Dict[str, Any] = {
            "id": row.id,
            "remoteTaskId": row.remote_task_id,
            "model": row.model,
            "prompt": row.prompt,
            "status": row.status,
            "statusText": row.status_text,
            "videoUrl": row.video_url_local or row.video_url_remote,
            "videoUrlLocal": row.video_url_local,
            "videoUrlRemote": row.video_url_remote,
            "lastFrameUrl": row.last_frame_url_local or row.last_frame_url_remote,
            "lastFrameUrlLocal": row.last_frame_url_local,
            "lastFrameUrlRemote": row.last_frame_url_remote,
            "downloadStatus": row.download_status or "idle",
            "downloadProgress": row.download_progress or 0,
            "createdAt": row.created_at.isoformat() if row.created_at else None,
            "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
        }
        out.append(item)
    return Response(out)


@api_view(["GET"])
def seedance_task_detail(request: Request) -> Response:
    task_id = str(request.query_params.get("taskId") or request.query_params.get("task_id") or "").strip()
    if not task_id:
        return Response({"error": "taskId is required"}, status=400)
    try:
        row = VideoGenerationTaskMirror.objects.get(remote_task_id=task_id)
    except VideoGenerationTaskMirror.DoesNotExist:
        return Response({"error": "task not found"}, status=404)
    cfg = _seedance_cfg()
    task_obj = _seedance_sync_remote_task(cfg, task_id, project_id=row.project_id, source=row.source, save_media=True)
    out: Dict[str, Any] = {
        "id": row.id,
        "remoteTaskId": row.remote_task_id,
        "model": row.model,
        "prompt": row.prompt,
        "status": row.status,
        "statusText": row.status_text,
        "videoUrl": row.video_url_local or row.video_url_remote,
        "videoUrlLocal": row.video_url_local,
        "videoUrlRemote": row.video_url_remote,
        "videoSourcePath": row.video_source_path_local,
        "lastFrameUrl": row.last_frame_url_local or row.last_frame_url_remote,
        "lastFrameUrlLocal": row.last_frame_url_local,
        "lastFrameUrlRemote": row.last_frame_url_remote,
        "lastFrameSourcePath": row.last_frame_source_path_local,
        "downloadStatus": row.download_status or "idle",
        "downloadProgress": row.download_progress or 0,
        "downloadError": row.download_error or "",
        "createdAt": row.created_at.isoformat() if row.created_at else None,
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
    }
    if task_obj and isinstance(task_obj.response_payload, dict):
        out["usage"] = task_obj.response_payload.get("usage")
    return Response(out)


@api_view(["POST"])
def seedance_sync_tasks(request: Request) -> Response:
    cfg = _seedance_cfg()
    if not cfg.get("api_key"):
        return Response({"error": "Seedance API Key 缺失"}, status=400)
    task_ids = request.data.get("taskIds") or request.data.get("task_ids") or []
    if isinstance(task_ids, str):
        task_ids = [x.strip() for x in task_ids.split(",") if x.strip()]
    if not isinstance(task_ids, list):
        task_ids = []
    synced: List[Dict[str, Any]] = []
    for task_id in task_ids[:100]:
        task_id = str(task_id).strip()
        if not task_id:
            continue
        row = _seedance_sync_remote_task(cfg, task_id, save_media=True)
        if row:
            synced.append({
                "taskId": row.remote_task_id,
                "status": row.status,
                "videoUrl": row.video_url_local or row.video_url_remote,
            })
    return Response({"synced": synced})


@csrf_exempt
def jimeng_image_generate_stream(request: HttpRequest) -> HttpResponseBase:
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

    cfg = _jimeng_cfg()
    if not cfg.get("api_key"):

        def missing_cfg() -> Generator[bytes, None, None]:
            yield _sse(
                "msg",
                _agent_to_ui_error(
                    "missing_config",
                    "即梦 API Key 缺失。请在设置页保存。",
                    details={"need": ["jimengApiKey"]},
                ),
            ).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

        resp = StreamingHttpResponse(missing_cfg(), content_type="text/event-stream")
        _apply_sse_headers(resp)
        return resp

    model = str(request.POST.get("model") or cfg.get("model") or "").strip() or str(cfg.get("model") or "")
    aspect_ratio = str(request.POST.get("aspectRatio") or request.POST.get("aspect_ratio") or "1:1").strip() or "1:1"

    def gen() -> Generator[bytes, None, None]:
        try:
            yield _sse("msg", _agent_to_ui_task_status("started", message="即梦：生成中…")).encode("utf-8")
            url = str(cfg.get("image_generate_url") or "").strip()
            api_key = str(cfg.get("api_key") or "").strip()
            url = _jimeng_with_key(url, api_key)
            timeout = float(cfg.get("timeout_sec") or 120)
            payload = {"model": model, "prompt": prompt, "aspect_ratio": aspect_ratio}
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            raw, err = _request_raw("POST", url, data=body, headers={"Content-Type": "application/json"}, timeout_sec=timeout)
            if err or raw is None:
                raise ValueError(f"即梦请求失败: {err or 'unknown error'}")
            try:
                text = raw.decode("utf-8")
            except Exception:
                text = raw.decode("utf-8", errors="ignore")
            try:
                obj = json.loads(text) if text else {}
            except Exception:
                obj = {"raw": text[:2000]}
            image_url = str(obj.get("image_url") or "").strip()
            if not image_url:
                raise ValueError(f"即梦返回无效响应: {str(obj)[:500]}")
            out_payload: Dict[str, Any] = {
                "imageUrl": image_url,
                "model": model,
                "status": "done",
            }
            yield _sse("msg", _agent_to_ui_chat_message(json.dumps(out_payload, ensure_ascii=False))).encode("utf-8")
            yield _sse("msg", _agent_to_ui_task_status("done", message="即梦：完成")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")
        except Exception as e:
            yield _sse("msg", _agent_to_ui_error("jimeng_error", str(e) or "unknown error")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp


@csrf_exempt
def jimeng_video_generate_stream(request: HttpRequest) -> HttpResponseBase:
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

    cfg = _jimeng_cfg()
    if not cfg.get("api_key"):

        def missing_cfg() -> Generator[bytes, None, None]:
            yield _sse(
                "msg",
                _agent_to_ui_error(
                    "missing_config",
                    "即梦 API Key 缺失。请在设置页保存。",
                    details={"need": ["jimengApiKey"]},
                ),
            ).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

        resp = StreamingHttpResponse(missing_cfg(), content_type="text/event-stream")
        _apply_sse_headers(resp)
        return resp

    model = str(request.POST.get("model") or cfg.get("video_model") or "").strip() or str(cfg.get("video_model") or "")
    duration_raw = request.POST.get("duration")
    duration: Optional[int] = None
    if duration_raw is not None and str(duration_raw).strip() != "":
        try:
            duration = max(1, min(30, int(str(duration_raw).strip())))
        except Exception:
            duration = 5

    def gen() -> Generator[bytes, None, None]:
        try:
            yield _sse("msg", _agent_to_ui_task_status("started", message="即梦视频：创建任务中…")).encode("utf-8")
            create_url = str(cfg.get("video_create_url") or "").strip()
            api_key = str(cfg.get("api_key") or "").strip()
            create_url = _jimeng_with_key(create_url, api_key)
            timeout = float(cfg.get("timeout_sec") or 120)
            payload: Dict[str, Any] = {"model": model, "prompt": prompt}
            if duration is not None:
                payload["duration"] = duration
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            raw, err = _request_raw("POST", create_url, data=body, headers={"Content-Type": "application/json"}, timeout_sec=timeout)
            if err or raw is None:
                raise ValueError(f"即梦创建任务失败: {err or 'unknown error'}")
            try:
                text = raw.decode("utf-8")
            except Exception:
                text = raw.decode("utf-8", errors="ignore")
            try:
                obj = json.loads(text) if text else {}
            except Exception:
                obj = {"raw": text[:2000]}
            task_id = str(obj.get("task_id") or obj.get("id") or "").strip()
            if not task_id:
                raise ValueError(f"即梦创建任务失败: {str(obj)[:500]}")

            yield _sse("msg", _agent_to_ui_task_status("streaming", message=f"即梦视频：任务已创建（{task_id}），等待生成…")).encode("utf-8")

            started_at = time.time()
            poll_interval_sec = max(1.0, float(cfg.get("poll_interval_sec") or 3))
            poll_timeout_sec = max(30.0, float(cfg.get("poll_timeout_sec") or 600))

            while True:
                status_url = str(cfg.get("video_status_url") or "").strip()
                status_url = _jimeng_with_key(status_url, api_key)
                status_url = f"{status_url.rstrip('/')}/{task_id}"
                status_raw, status_err = _request_raw("GET", status_url, headers={"Content-Type": "application/json"}, timeout_sec=timeout)
                if status_err or status_raw is None:
                    raise ValueError(f"即梦查询任务失败: {status_err or 'unknown error'}")
                try:
                    status_text = status_raw.decode("utf-8")
                except Exception:
                    status_text = status_raw.decode("utf-8", errors="ignore")
                try:
                    status_obj = json.loads(status_text) if status_text else {}
                except Exception:
                    status_obj = {"raw": status_text[:2000]}
                status = str(status_obj.get("status") or "").strip().lower()

                if status in ("succeeded", "success", "completed"):
                    video_url = str(status_obj.get("video_url") or status_obj.get("result") or "").strip()
                    if not video_url:
                        raise ValueError("即梦视频生成成功但返回空URL")
                    out_payload: Dict[str, Any] = {
                        "taskId": task_id,
                        "videoUrl": video_url,
                        "model": model,
                        "status": "done",
                    }
                    yield _sse("msg", _agent_to_ui_chat_message(json.dumps(out_payload, ensure_ascii=False))).encode("utf-8")
                    yield _sse("msg", _agent_to_ui_task_status("done", message="即梦视频：完成")).encode("utf-8")
                    yield _sse("done", "{}").encode("utf-8")
                    return

                if status in ("failed", "error", "expired", "cancelled"):
                    error_msg = str(status_obj.get("error") or status_obj.get("message") or "").strip()
                    raise ValueError(f"即梦视频任务失败: status={status}, error={error_msg}")

                elapsed = int(max(0, time.time() - started_at))
                yield _sse(
                    "msg",
                    _agent_to_ui_task_status("streaming", message=f"即梦视频：{status or 'running'}（{elapsed}s）"),
                ).encode("utf-8")

                if time.time() - started_at >= poll_timeout_sec:
                    raise ValueError(f"即梦视频任务超时: {int(poll_timeout_sec)}s")
                try:
                    time.sleep(poll_interval_sec)
                except Exception:
                    pass
        except Exception as e:
            yield _sse("msg", _agent_to_ui_error("jimeng_video_error", str(e) or "unknown error")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp


@csrf_exempt
def blueprint_chat_stream(request: HttpRequest) -> HttpResponseBase:
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    messages_raw = request.POST.get("messages") or request.POST.get("payload") or ""
    try:
        messages = json.loads(str(messages_raw)) if messages_raw else []
    except Exception:
        messages = []

    if not isinstance(messages, list) or not messages:
        return HttpResponseBadRequest("invalid messages")

    def gen() -> Generator[bytes, None, None]:
        try:
            yield _sse("msg", _agent_to_ui_task_status("started", message="蓝图对话：处理中…")).encode("utf-8")
            from dwebapp.ai.blueprint_chat import blueprint_chat_stream_impl
            for chunk in blueprint_chat_stream_impl(messages):
                if isinstance(chunk, dict):
                    yield _sse("msg", json.dumps(chunk, ensure_ascii=False)).encode("utf-8")
            yield _sse("msg", _agent_to_ui_task_status("done", message="蓝图对话：完成")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")
        except Exception as e:
            yield _sse("msg", _agent_to_ui_error("blueprint_chat_error", str(e) or "unknown error")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp