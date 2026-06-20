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

from .models import BlueprintProject

try:
    from third_party_api_gateway.models import VideoGenerationTaskMirror
except Exception:
    VideoGenerationTaskMirror = None

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


# ---------------------------------------------------------------------------
# SSL context — macOS Python venvs often lack the system CA bundle; use
# certifi when available so all outbound HTTPS calls can verify certificates.
# ---------------------------------------------------------------------------
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
    headers = {
        "Accept": "application/json",
    }
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


def _request_json_with_headers(
    method: str,
    url: str,
    payload: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    timeout_sec: float = 30.0,
) -> Tuple[Optional[Any], Optional[str]]:
    data = None
    req_headers = {
        "Accept": "application/json",
    }
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
    return {
        "Authorization": f"Bearer {str(cfg.get('api_key') or '').strip()}",
    }


def _meshy_pick_first_url(obj: Any) -> str:
    if isinstance(obj, str):
        return obj.strip()
    if isinstance(obj, dict):
        for key in (
            "glb",
            "pre_remeshed_glb",
            "fbx",
            "obj",
            "stl",
            "usdz",
            "rigged_character_glb_url",
            "rigged_character_fbx_url",
            "animation_glb_url",
            "animation_fbx_url",
            "processed_usdz_url",
            "processed_armature_fbx_url",
        ):
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

    # Meshy 官方 rigging / animation 后续链路暂未纳入当前产品可用范围，
    # 在创建阶段直接拒绝，避免前后端误触发未验证流程。
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
        extra_keys = [
            "ai_model",
            "model_type",
            "topology",
            "target_polycount",
            "symmetry_mode",
            "should_remesh",
            "save_pre_remeshed_model",
            "should_texture",
            "enable_pbr",
            "pose_mode",
            "texture_prompt",
            "texture_image_url",
            "moderation",
            "image_enhancement",
            "remove_lighting",
            "target_formats",
        ]
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
        return {
            "ok": True,
            "mode": mode,
            "taskId": task_id,
            "status": "unknown",
            "progress": 0,
            "thumbnailUrl": "",
            "modelUrls": {},
            "preferredModelUrl": "",
            "statusText": "invalid response",
        }

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
        model_urls = {
            "glb": str(result.get("rigged_character_glb_url") or "").strip(),
            "fbx": str(result.get("rigged_character_fbx_url") or "").strip(),
        }
    if not model_urls and mode == "animation":
        model_urls = {
            "glb": str(result.get("animation_glb_url") or "").strip(),
            "fbx": str(result.get("animation_fbx_url") or "").strip(),
            "usdz": str(result.get("processed_usdz_url") or "").strip(),
            "armature_fbx": str(result.get("processed_armature_fbx_url") or "").strip(),
        }
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
    keys = [
        "relationKind",
        "relation_kind",
        "rootTaskId",
        "root_task_id",
        "parentTaskId",
        "parent_task_id",
        "sourceTaskId",
        "source_task_id",
        "upstreamTaskId",
        "upstream_task_id",
        "preview_task_id",
        "capabilities",
    ]
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
    parent_task_id = _meshy_first_non_empty_str(
        payload,
        [
            "parentTaskId",
            "parent_task_id",
            "sourceTaskId",
            "source_task_id",
            "upstreamTaskId",
            "upstream_task_id",
            "input_task_id",
            "rig_task_id",
        ],
    )
    if not parent_task_id and relation_kind == "model":
        parent_task_id = _meshy_first_non_empty_str(payload, ["preview_task_id"])
    root_task_id = _meshy_first_non_empty_str(payload, ["rootTaskId", "root_task_id"])
    if not root_task_id:
        root_task_id = parent_task_id or str(task_id or "").strip()
    capabilities = _meshy_capabilities_for_relation(relation_kind, payload)
    return relation_kind, root_task_id, parent_task_id, capabilities


def _meshy_child_order(item: Dict[str, Any]) -> Tuple[int, str]:
    relation_kind = str(item.get("relationKind") or "model").strip().lower()
    order = {
        "texture": 10,
        "rigging": 20,
        "animation": 30,
        "remesh": 40,
        "model": 50,
    }.get(relation_kind, 99)
    updated = str(item.get("updatedAt") or "")
    return order, updated


def _meshy_effective_priority(item: Dict[str, Any]) -> Tuple[int, str]:
    relation_kind = str(item.get("relationKind") or "model").strip().lower()
    status = str(item.get("status") or "").strip().lower()
    priority = {
        "animation": 40,
        "rigging": 30,
        "texture": 20,
        "remesh": 15,
        "model": 10,
    }.get(relation_kind, 0)
    if status not in ("succeeded", "success", "completed"):
        priority = max(0, priority - 100)
    updated = str(item.get("updatedAt") or "")
    return priority, updated


def _build_meshy_task_tree(rows: List[MeshyTaskMirror]) -> List[Dict[str, Any]]:
    serialized: List[Dict[str, Any]] = []
    for row in rows:
        item = _serialize_meshy_task_row(row)
        item["children"] = []
        serialized.append(item)

    by_task_id: Dict[str, Dict[str, Any]] = {}
    roots_by_id: Dict[str, Dict[str, Any]] = {}
    for item in serialized:
        task_id = str(item.get("taskId") or "").strip()
        if not task_id:
            continue
        by_task_id[task_id] = item
        root_task_id = str(item.get("rootTaskId") or task_id).strip() or task_id
        parent_task_id = str(item.get("parentTaskId") or "").strip()
        if root_task_id == task_id or not parent_task_id:
            roots_by_id[root_task_id] = item

    for item in serialized:
        task_id = str(item.get("taskId") or "").strip()
        root_task_id = str(item.get("rootTaskId") or task_id).strip() or task_id
        parent_task_id = str(item.get("parentTaskId") or "").strip()
        if not task_id or root_task_id == task_id or not parent_task_id:
            continue
        root_item = roots_by_id.get(root_task_id)
        if not root_item:
            roots_by_id[root_task_id] = item
            continue
        cast(List[Dict[str, Any]], root_item["children"]).append(item)

    roots = list(roots_by_id.values())
    for root in roots:
        children = cast(List[Dict[str, Any]], root.get("children") or [])
        children.sort(key=_meshy_child_order)
        merged_caps: List[str] = []
        for item in [root] + children:
            raw_caps = item.get("capabilities")
            if isinstance(raw_caps, list):
                for raw in raw_caps:
                    cap = str(raw or "").strip().lower()
                    if cap and cap not in merged_caps:
                        merged_caps.append(cap)
        root["capabilities"] = merged_caps
        root["hasTextureChild"] = any(str(child.get("relationKind") or "") == "texture" for child in children)
        root["hasRiggingChild"] = any(str(child.get("relationKind") or "") == "rigging" for child in children)
        root["hasAnimationChild"] = any(str(child.get("relationKind") or "") == "animation" for child in children)

        effective = root
        for candidate in [root] + children:
            if _meshy_effective_priority(candidate) > _meshy_effective_priority(effective):
                effective = candidate

        root["effectiveTaskId"] = effective.get("taskId")
        root["effectiveRelationKind"] = effective.get("relationKind")
        root["effectiveStatus"] = effective.get("status")
        root["effectiveProgress"] = effective.get("progress")
        root["effectivePreferredModelUrl"] = effective.get("preferredModelUrl")
        root["effectiveLocalAssetUrl"] = effective.get("localAssetUrl")
        root["effectiveLocalAssetPath"] = effective.get("localAssetPath")
        root["effectiveThumbnailUrl"] = effective.get("thumbnailUrl")

    roots.sort(key=lambda item: str(item.get("updatedAt") or ""), reverse=True)
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


def _meshy_upsert_task_mirror(
    *,
    task_id: str,
    mode: str,
    request_payload: Optional[Dict[str, Any]] = None,
    normalized_task: Optional[Dict[str, Any]] = None,
) -> Optional[MeshyTaskMirror]:
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
        # If task already gone on Meshy side, we still treat local stop/delete as successful.
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

    # Remove current task and its descendants from local mirror if deleting a root task.
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
                "error": "DeepSeek API Key missing. Please save it in Settings.",
                "need": ["deepseekApiKey"],
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
def seedream_ref_cache(request: HttpRequest) -> HttpResponseBase:
    """Cache reference images on Django backend for Seedream.

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
@api_view(["POST"])
def nanobanana_generate(_: Request) -> Response:
    """NanoBanana image generation endpoint (sync).

    Note: UI is expected to use the SSE endpoint `nanobanana_generate_stream`.
    This sync endpoint is kept for convenience / debugging.

        Body JSON:
            - prompt: string
            - aspectRatio: string (optional; e.g. "16:9")
            - imageSize: string (optional; "1K"/"2K"/"4K"; only for gemini-3-pro-image-preview)
            - imageModel/model: string (optional; gemini-2.5-flash-image | gemini-3.1-flash-image-preview | gemini-3-pro-image-preview)
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
                "error": "Gemini API Key missing. Please save it in Settings.",
                "need": ["geminiApiKey"],
            },
            status=500,
        )

    raw_ar = payload.get("aspectRatio") or payload.get("aspect_ratio")
    aspect_ratio = _nanobanana_coerce_aspect_ratio(raw_ar)
    raw_size = payload.get("imageSize") or payload.get("image_size")
    image_size = _nanobanana_coerce_image_size(raw_size)

    requested_model = str(payload.get("imageModel") or payload.get("image_model") or payload.get("model") or "").strip()
    if requested_model:
        cfg = _nanobanana_cfg_with_model(cfg, requested_model)
    else:
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
    NANOBANANA_FLASH31_MODEL = "gemini-3.1-flash-image-preview"
    NANOBANANA_PRO_MODEL = "gemini-3-pro-image-preview"
    NANOBANANA_ALLOWED_MODELS = {NANOBANANA_DEFAULT_MODEL, NANOBANANA_FLASH31_MODEL, NANOBANANA_PRO_MODEL}

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

    api_key = ""
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
    allowed = {"gemini-2.5-flash-image", "gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"}
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
    max_attempts = 3
    for attempt in range(max_attempts):
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
        is_transient = any(s in last_err for s in transient_signals)
        is_unavailable = _nanobanana_is_temporarily_unavailable_error(last_err)
        if attempt < (max_attempts - 1) and (is_transient or is_unavailable):
            wait_s = (
                _nanobanana_backoff_seconds(attempt, base=1.2, cap=8.0)
                if is_unavailable
                else _nanobanana_backoff_seconds(attempt, base=0.8, cap=3.0)
            )
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
    max_attempts = 3
    for attempt in range(max_attempts):
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=_get_ssl_context()) as res:
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
            is_transient = any(s in last_err for s in transient_signals)
            is_unavailable = _nanobanana_is_temporarily_unavailable_error(last_err)
            if attempt < (max_attempts - 1) and (is_transient or is_unavailable):
                wait_s = (
                    _nanobanana_backoff_seconds(attempt, base=1.2, cap=8.0)
                    if is_unavailable
                    else _nanobanana_backoff_seconds(attempt, base=0.8, cap=3.0)
                )
                try:
                    time.sleep(wait_s)
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


def _seedream_ref_cache_root() -> Path:
    media_root = Path(getattr(settings, "MEDIA_ROOT", "") or Path(__file__).resolve().parents[1] / "media")
    return media_root / "seedream_ref_cache"


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


def _seedream_load_cached_refs(cache_ids: List[str]) -> List[Tuple[str, bytes, str]]:
    out: List[Tuple[str, bytes, str]] = []
    for cache_id in cache_ids:
        p = _seedream_safe_cache_path(cache_id)
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


def _nanobanana_is_temporarily_unavailable_error(err_text: str) -> bool:
    """Detect transient high-demand/service unavailable errors (503 UNAVAILABLE)."""

    t = str(err_text or "")
    if not t:
        return False

    # Common shapes:
    # - our _request_raw: "http 503: {\"error\":{...\"status\":\"UNAVAILABLE\"}}"
    # - urllib: "HTTP Error 503: Service Unavailable"
    if "http 503" in t or "HTTP Error 503" in t:
        return True
    if "UNAVAILABLE" in t and '"status"' in t:
        return True
    if "high demand" in t.lower():
        return True
    return False


def _nanobanana_backoff_seconds(attempt: int, *, base: float, cap: float) -> float:
    """Jittered exponential backoff."""

    a = max(0, int(attempt))
    base_s = float(base)
    cap_s = float(cap)
    delay = min(cap_s, base_s * (2.0**a))
    # Full jitter in [0.5x, 1.0x] to avoid thundering herd.
    jitter = 0.5 + random.random() * 0.5
    return max(0.2, delay * jitter)


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
    with urllib.request.urlopen(req, timeout=timeout, context=_get_ssl_context()) as res:
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

    with urllib.request.urlopen(req, timeout=timeout, context=_get_ssl_context()) as res:
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


def _seedream_download_and_save(url: str) -> str:
    """Download an upstream URL and save into Django MEDIA_ROOT/seedream_outputs."""

    u = str(url or "").strip()
    if not (u.startswith("http://") or u.startswith("https://")):
        raise ValueError("invalid image url")

    req = urllib.request.Request(u, headers={"Accept": "image/*"}, method="GET")
    with urllib.request.urlopen(req, timeout=30.0) as res:
        content_type = str(res.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        data = res.read()

    ext = mimetypes.guess_extension(content_type) if content_type else None
    if not ext:
        parsed = urllib.parse.urlparse(u)
        ext = os.path.splitext(parsed.path)[1] or ".png"
    if not ext.startswith("."):
        ext = "." + ext

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
    rel_posix = str((rel_dir / filename).as_posix())
    return media_url + rel_posix


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

    model = (
        _env_or_default("SEEDREAM_MODEL", "doubao-seedream-5-0-260128").strip()
        or "doubao-seedream-5-0-260128"
    )
    api_base = (
        _env_or_default("SEEDREAM_API_BASE", "https://ark.cn-beijing.volces.com/api/v3").strip()
        or "https://ark.cn-beijing.volces.com/api/v3"
    )
    timeout_sec = _env_or_default("SEEDREAM_TIMEOUT_SEC", "180").strip() or "180"
    generate_url = _env_or_default("SEEDREAM_GENERATE_URL", "").strip()
    if not generate_url:
        generate_url = api_base.rstrip("/") + "/images/generations"

    return {
        "api_key": api_key,
        "model": model,
        "api_base": api_base,
        "generate_url": generate_url,
        "timeout_sec": timeout_sec,
    }


def _seedream_cfg_with_model(cfg: Dict[str, str], model: str) -> Dict[str, str]:
    allowed = {
        "doubao-seedream-3-0-t2i-250415",
        "doubao-seedream-4-0-250828",
        "doubao-seedream-5-0-260128",
        "doubao-seedream-5-0-lite-260128",
    }
    m = str(model or "").strip()
    if not m:
        return cfg
    if m not in allowed:
        m = "doubao-seedream-5-0-260128"
    next_cfg = dict(cfg)
    next_cfg["model"] = m
    return next_cfg


def _seedream_size_from_aspect_ratio(model: str, aspect_ratio: Optional[str]) -> str:
    ar = _nanobanana_coerce_aspect_ratio(aspect_ratio) or "1:1"
    model_text = str(model or "").strip().lower()
    is_v3 = "seedream-3-0" in model_text

    if is_v3:
        table_v3 = {
            "1:1": "1024x1024",
            "2:3": "832x1248",
            "3:2": "1248x832",
            "3:4": "864x1152",
            "4:3": "1152x864",
            "4:5": "896x1120",
            "5:4": "1120x896",
            "9:16": "736x1312",
            "16:9": "1312x736",
            "21:9": "1568x672",
        }
        return table_v3.get(ar, "1024x1024")

    table_2k = {
        "1:1": "2048x2048",
        "2:3": "1664x2496",
        "3:2": "2496x1664",
        "3:4": "1728x2304",
        "4:3": "2304x1728",
        "4:5": "1792x2240",
        "5:4": "2240x1792",
        "9:16": "1600x2848",
        "16:9": "2848x1600",
        "21:9": "3136x1344",
    }
    return table_2k.get(ar, "2048x2048")


def _seedream_build_payload(
    *,
    prompt: str,
    model: str,
    aspect_ratio: Optional[str],
    ref_images: Optional[List[Tuple[str, bytes, str]]],
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "model": str(model or "").strip(),
        "prompt": str(prompt or ""),
        "size": _seedream_size_from_aspect_ratio(model, aspect_ratio),
        "response_format": "url",
        "watermark": False,
    }

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


@csrf_exempt
def nanobanana_generate_stream(request: HttpRequest) -> HttpResponseBase:
    """Image generation endpoint (SSE, supports Gemini + Seedream).

    Content-Type: multipart/form-data
            - prompt: string
            - aspectRatio: string (optional; e.g. "16:9")
            - imageModel/model: string (optional; Gemini or Seedream model id)
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
                        "Gemini API Key missing. Please save it in Settings.",
                        details={"need": ["geminiApiKey"]},
                    ),
                ).encode("utf-8")
            else:
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

    ref_images: List[Tuple[str, bytes, str]] = []

    # Prefer cached refs (ordered by refCacheIds), fallback to direct uploads.
    cache_ids: List[str] = []
    try:
        cache_ids = [str(x or "").strip() for x in (request.POST.getlist("refCacheIds") or [])]
    except Exception:
        cache_ids = []
    cache_ids = [x for x in cache_ids if x]

    if cache_ids:
        ref_images = _nanobanana_load_cached_refs(cache_ids) if use_gemini else _seedream_load_cached_refs(cache_ids)
        if len(ref_images) != len(cache_ids):

            def bad_cache() -> Generator[bytes, None, None]:
                yield _sse(
                    "msg",
                    _agent_to_ui_error(
                        "bad_ref_cache",
                        "参考图缓存缺失或不可读，请重新缓存后再试。",
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
        try:
            if use_gemini:
                payload_obj = _nanobanana_build_gemini_payload(
                    prompt=prompt,
                    aspect_ratio=aspect_ratio,
                    image_size=None,
                    ref_images=ref_images,
                    model=str(cfg.get("model") or ""),
                )
                yield _sse("msg", _agent_to_ui_task_status("started", message="NanoBanana：开始生成…")).encode("utf-8")
                yield _sse("msg", _agent_to_ui_task_status("streaming", message="NanoBanana：请求 Gemini 中…")).encode("utf-8")

                upstream_obj: Any = None
                inline_img: Optional[Tuple[str, bytes]] = None
                for obj in _nanobanana_iter_gemini_stream(cfg, payload_obj):
                    upstream_obj = obj
                    inline_img = _nanobanana_extract_inline_image(obj)
                    if inline_img:
                        break

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

                billing_text = _nanobanana_extract_billing_text(upstream_obj)
                yield _sse("msg", _agent_to_ui_task_status("streaming", message="NanoBanana：保存图片并落盘…")).encode("utf-8")
                mime_type, data = inline_img
                local_url = _nanobanana_save_inline_image(mime_type, data)

                result_payload: Dict[str, Any] = {
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

            payload_obj = _seedream_build_payload(
                prompt=prompt,
                model=str(cfg.get("model") or ""),
                aspect_ratio=aspect_ratio,
                ref_images=ref_images,
            )

            yield _sse("msg", _agent_to_ui_task_status("started", message="Seedream：开始生成…")).encode("utf-8")
            yield _sse("msg", _agent_to_ui_task_status("streaming", message="Seedream：请求火山方舟中…")).encode("utf-8")

            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
            api_key = str(cfg.get("api_key") or "").strip()
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}" if not api_key.lower().startswith("bearer ") else api_key

            raw, err = _request_raw(
                "POST",
                str(cfg.get("generate_url") or "").strip(),
                data=json.dumps(payload_obj, ensure_ascii=False).encode("utf-8"),
                headers=headers,
                timeout_sec=float(cfg.get("timeout_sec") or 180),
            )
            if err or raw is None:
                raise ValueError(f"Seedream request failed: {err or 'unknown error'}")

            try:
                text = raw.decode("utf-8")
            except Exception:
                text = raw.decode("utf-8", errors="ignore")
            try:
                upstream_obj = json.loads(text) if text else {}
            except Exception:
                upstream_obj = {"raw": text[:2000]}

            if isinstance(upstream_obj, dict) and isinstance(upstream_obj.get("error"), dict):
                err_obj = upstream_obj.get("error")
                err_msg = str((err_obj or {}).get("message") or (err_obj or {}).get("code") or "unknown error")
                raise ValueError(f"Seedream API error: {err_msg}")

            image_urls = _seedream_extract_image_urls(upstream_obj)
            if not image_urls:
                yield _sse(
                    "msg",
                    _agent_to_ui_error(
                        "seedream_no_image",
                        "seedream did not return image url",
                        details={"upstream": upstream_obj if isinstance(upstream_obj, dict) else {"value": str(upstream_obj)}},
                    ),
                ).encode("utf-8")
                yield _sse("done", "{}").encode("utf-8")
                return

            billing_text = _nanobanana_extract_billing_text(upstream_obj)
            yield _sse("msg", _agent_to_ui_task_status("streaming", message="Seedream：保存图片并落盘…")).encode("utf-8")
            local_url = _seedream_download_and_save(image_urls[0])

            result_payload = {
                "imageUrl": local_url,
                "model": str(cfg.get("model") or ""),
            }
            if billing_text:
                result_payload["billing"] = billing_text

            yield _sse("msg", _agent_to_ui_chat_message(json.dumps(result_payload, ensure_ascii=False))).encode("utf-8")
            yield _sse("msg", _agent_to_ui_task_status("done", message="Seedream：完成")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")
            return
        except Exception as e:
            code = "nanobanana_error" if use_gemini else "seedream_error"
            yield _sse("msg", _agent_to_ui_error(code, str(e) or "unknown error")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp


@csrf_exempt
def seedream_generate_stream(request: HttpRequest) -> HttpResponseBase:
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    return nanobanana_generate_stream(request)


def _seedance_cfg() -> Dict[str, str]:
    def _env_or_default(name: str, fallback: str) -> str:
        v = os.environ.get(name)
        return v if v else fallback

    api_key = ""
    try:
        from dwebapp.ai.credentials_store import get_bytedance_api_key

        api_key = (get_bytedance_api_key() or "").strip()
    except Exception:
        api_key = ""

    model = _env_or_default("SEEDANCE_MODEL", "doubao-seedance-1-5-pro-251215").strip() or "doubao-seedance-1-5-pro-251215"
    api_base = _env_or_default("SEEDANCE_API_BASE", "https://ark.cn-beijing.volces.com/api/v3").strip() or "https://ark.cn-beijing.volces.com/api/v3"
    timeout_sec = _env_or_default("SEEDANCE_TIMEOUT_SEC", "120").strip() or "120"
    poll_interval_sec = _env_or_default("SEEDANCE_POLL_INTERVAL_SEC", "3").strip() or "3"
    poll_timeout_sec = _env_or_default("SEEDANCE_POLL_TIMEOUT_SEC", "600").strip() or "600"

    create_url = _env_or_default("SEEDANCE_CREATE_URL", "").strip()
    if not create_url:
        create_url = api_base.rstrip("/") + "/contents/generations/tasks"

    return {
        "api_key": api_key,
        "model": model,
        "api_base": api_base,
        "create_url": create_url,
        "timeout_sec": timeout_sec,
        "poll_interval_sec": poll_interval_sec,
        "poll_timeout_sec": poll_timeout_sec,
    }


def _seedance_truthy(v: Any) -> bool:
    if v is None:
        return False
    if isinstance(v, bool):
        return bool(v)
    s = str(v).strip().lower()
    return s in ("1", "true", "yes", "y", "on")


def _seedance_coerce_int(v: Any, default_value: int, *, min_value: int, max_value: int) -> int:
    try:
        n = int(str(v).strip())
    except Exception:
        n = int(default_value)
    return max(min_value, min(max_value, n))


def _seedance_data_url_from_image(content: bytes, content_type: str) -> str:
    mime_type = str(content_type or "image/png").split(";")[0].strip().lower() or "image/png"
    b64 = base64.b64encode(content or b"").decode("ascii")
    return f"data:{mime_type};base64,{b64}"


def _seedance_extract_usage_text(obj: Any) -> Optional[str]:
    if not isinstance(obj, dict):
        return None
    usage = obj.get("usage")
    if isinstance(usage, dict):
        total = usage.get("total_tokens")
        completion = usage.get("completion_tokens")
        out: List[str] = []
        if isinstance(total, int):
            out.append(f"total={total}")
        if isinstance(completion, int):
            out.append(f"completion={completion}")
        if out:
            return "tokens: " + ", ".join(out)
    return None


def _seedance_save_media_from_url(raw_url: str, category: str, accept_header: str, allowed_exts: Tuple[str, ...], fallback_ext: str) -> str:
    url = str(raw_url or "").strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        raise ValueError("invalid media url")

    req = urllib.request.Request(url, headers={"Accept": accept_header}, method="GET")
    with urllib.request.urlopen(req, timeout=60.0) as res:
        content_type = str(res.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        data = res.read()

    ext = mimetypes.guess_extension(content_type) if content_type else None
    if not ext:
        parsed = urllib.parse.urlparse(url)
        ext = os.path.splitext(parsed.path)[1] or fallback_ext
    if not ext.startswith("."):
        ext = "." + ext
    if ext.lower() not in allowed_exts:
        ext = fallback_ext

    ym = time.strftime("%Y%m")
    rel_dir = Path("seedance_outputs") / category / ym
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


def _seedance_save_video_from_url(raw_url: str) -> str:
    return _seedance_save_media_from_url(
        raw_url,
        "video",
        "video/*,application/octet-stream",
        (".mp4", ".mov", ".webm", ".mkv", ".avi"),
        ".mp4",
    )


def _seedance_save_image_from_url(raw_url: str) -> str:
    return _seedance_save_media_from_url(
        raw_url,
        "image",
        "image/*,application/octet-stream",
        (".png", ".jpg", ".jpeg", ".webp", ".bmp"),
        ".png",
    )


def _seedance_stream_download_bytes(
    raw_url: str,
    *,
    accept: str,
    progress_callback: Optional[Any] = None,
) -> Tuple[bytes, str, str]:
    source_url = str(raw_url or "").strip()
    if not source_url:
        raise ValueError("remote media url is required")
    req = urllib.request.Request(
        source_url,
        headers={
            "Accept": accept,
            "User-Agent": "DwebVideoStudio/seedance-downloader",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            total = 0
            try:
                total = int(str(res.headers.get("Content-Length") or "0").strip() or "0")
            except Exception:
                total = 0
            content_type = str(res.headers.get("Content-Type") or "application/octet-stream").strip() or "application/octet-stream"
            chunks: List[bytes] = []
            downloaded = 0
            fallback_progress = 0
            while True:
                chunk = res.read(512 * 1024)
                if not chunk:
                    break
                chunks.append(chunk)
                downloaded += len(chunk)
                if progress_callback is None:
                    continue
                if total > 0:
                    pct = max(1, min(100, int((downloaded / total) * 100)))
                else:
                    fallback_progress = min(95, fallback_progress + 8)
                    pct = max(1, fallback_progress)
                try:
                    progress_callback(pct)
                except Exception:
                    pass
            data = b"".join(chunks)
            if progress_callback is not None:
                try:
                    progress_callback(100)
                except Exception:
                    pass
            return data, content_type, Path(urllib.parse.urlparse(source_url).path).name or ""
    except urllib.error.HTTPError as exc:
        try:
            body = exc.read().decode("utf-8", errors="ignore")
        except Exception:
            body = ""
        raise ValueError(f"http {exc.code}: {body}".strip()) from exc
    except urllib.error.URLError as exc:
        raise ValueError(f"url error: {getattr(exc, 'reason', str(exc))}") from exc
    except Exception as exc:
        raise ValueError(str(exc) or "download failed") from exc


def _seedance_materialize_project_asset_from_url(
    raw_url: str,
    *,
    kind: str,
    project_id: Optional[int],
    suggested_name: str,
    progress_callback: Optional[Any] = None,
) -> Tuple[str, str]:
    safe_kind = str(kind or "").strip().lower()
    accept = "video/*,application/octet-stream" if safe_kind == "video" else "image/*,application/octet-stream"
    data, content_type, remote_name = _seedance_stream_download_bytes(
        raw_url,
        accept=accept,
        progress_callback=progress_callback,
    )
    file_name = str(suggested_name or remote_name or f"seedance-{safe_kind}").strip() or f"seedance-{safe_kind}"
    asset, save_err = _persist_project_asset_bytes(
        data,
        kind=safe_kind,
        file_name=file_name,
        content_type=content_type,
        project_id=project_id,
        bucket="assets",
    )
    if save_err or asset is None:
        raise ValueError(save_err or "persist project asset failed")
    return str(asset.get("url") or "").strip(), str(asset.get("absolutePath") or "").strip()


def _seedance_update_download_state(
    row_id: int,
    *,
    download_status: Optional[str] = None,
    download_progress: Optional[int] = None,
    download_error: Optional[str] = None,
    video_url_local: Optional[str] = None,
    video_source_path_local: Optional[str] = None,
    last_frame_url_local: Optional[str] = None,
    last_frame_source_path_local: Optional[str] = None,
) -> None:
    row = VideoGenerationTaskMirror.objects.filter(id=row_id).first()
    if not row:
        return
    update_fields: List[str] = []
    if download_status is not None and row.download_status != download_status:
        row.download_status = download_status
        update_fields.append("download_status")
    if download_progress is not None:
        next_progress = max(0, min(100, int(download_progress)))
        if row.download_progress != next_progress:
            row.download_progress = next_progress
            update_fields.append("download_progress")
    if download_error is not None and row.download_error != download_error:
        row.download_error = download_error
        update_fields.append("download_error")
    if video_url_local is not None and row.video_url_local != video_url_local:
        row.video_url_local = video_url_local
        update_fields.append("video_url_local")
    if video_source_path_local is not None and row.video_source_path_local != video_source_path_local:
        row.video_source_path_local = video_source_path_local
        update_fields.append("video_source_path_local")
    if last_frame_url_local is not None and row.last_frame_url_local != last_frame_url_local:
        row.last_frame_url_local = last_frame_url_local
        update_fields.append("last_frame_url_local")
    if last_frame_source_path_local is not None and row.last_frame_source_path_local != last_frame_source_path_local:
        row.last_frame_source_path_local = last_frame_source_path_local
        update_fields.append("last_frame_source_path_local")
    if update_fields:
        row.save(update_fields=list(dict.fromkeys(update_fields + ["synced_at", "updated_at"])))


def _seedance_materialize_task_assets_worker(row_id: int) -> None:
    try:
        row = VideoGenerationTaskMirror.objects.filter(id=row_id).first()
        if not row:
            return
        video_path = str(row.video_source_path_local or "").strip()
        if video_path and Path(video_path).exists() and Path(video_path).is_file() and str(row.video_url_local or "").strip():
            _seedance_update_download_state(row_id, download_status="ready", download_progress=100, download_error="")
            return
        remote_video_url = str(row.video_url_remote or "").strip()
        remote_last_frame_url = str(row.last_frame_url_remote or "").strip()
        project_id = cast(Optional[int], getattr(row, "project_id", None))
        if not remote_video_url:
            _seedance_update_download_state(
                row_id,
                download_status="failed",
                download_progress=0,
                download_error="remote video url is empty",
            )
            return

        _seedance_update_download_state(
            row_id,
            download_status="downloading",
            download_progress=max(1, int(getattr(row, "download_progress", 0) or 0), 5),
            download_error="",
        )

        if project_id and int(project_id) > 0:
            def on_video_progress(pct: int) -> None:
                scaled = max(5, min(92, int(pct * 0.92)))
                _seedance_update_download_state(
                    row_id,
                    download_status="downloading",
                    download_progress=scaled,
                    download_error="",
                )

            video_name = f"seedance-{row.remote_task_id or row_id}.mp4"
            video_url_local, video_source_path_local = _seedance_materialize_project_asset_from_url(
                remote_video_url,
                kind="video",
                project_id=project_id,
                suggested_name=video_name,
                progress_callback=on_video_progress,
            )
        else:
            video_url_local = _seedance_save_video_from_url(remote_video_url)
            video_source_path_local = _seedance_local_media_source_path(video_url_local)
            _seedance_update_download_state(
                row_id,
                download_status="downloading",
                download_progress=92,
                download_error="",
            )

        last_frame_url_local = ""
        last_frame_source_path_local = ""
        if remote_last_frame_url:
            try:
                if project_id and int(project_id) > 0:
                    last_frame_name = f"seedance-{row.remote_task_id or row_id}-last-frame.png"
                    last_frame_url_local, last_frame_source_path_local = _seedance_materialize_project_asset_from_url(
                        remote_last_frame_url,
                        kind="image",
                        project_id=project_id,
                        suggested_name=last_frame_name,
                    )
                else:
                    last_frame_url_local = _seedance_save_image_from_url(remote_last_frame_url)
                    last_frame_source_path_local = _seedance_local_media_source_path(last_frame_url_local)
            except Exception:
                last_frame_url_local = ""
                last_frame_source_path_local = ""

        _seedance_update_download_state(
            row_id,
            download_status="ready",
            download_progress=100,
            download_error="",
            video_url_local=video_url_local,
            video_source_path_local=video_source_path_local,
            last_frame_url_local=last_frame_url_local,
            last_frame_source_path_local=last_frame_source_path_local,
        )
    except Exception as exc:
        _seedance_update_download_state(
            row_id,
            download_status="failed",
            download_progress=0,
            download_error=str(exc) or "download failed",
        )
    finally:
        with _seedance_download_lock:
            _seedance_active_download_ids.discard(int(row_id))


def _seedance_start_task_asset_materialization(row: VideoGenerationTaskMirror) -> VideoGenerationTaskMirror:
    row_id = cast(int, getattr(row, "id"))
    video_path = str(row.video_source_path_local or "").strip()
    if video_path and Path(video_path).exists() and Path(video_path).is_file() and str(row.video_url_local or "").strip():
        _seedance_update_download_state(row_id, download_status="ready", download_progress=100, download_error="")
        refreshed = VideoGenerationTaskMirror.objects.filter(id=row_id).first()
        return refreshed or row

    with _seedance_download_lock:
        if row_id in _seedance_active_download_ids:
            refreshed = VideoGenerationTaskMirror.objects.filter(id=row_id).first()
            return refreshed or row
        _seedance_active_download_ids.add(row_id)

    _seedance_update_download_state(
        row_id,
        download_status="pending",
        download_progress=max(1, int(getattr(row, "download_progress", 0) or 0)),
        download_error="",
    )
    worker = threading.Thread(
        target=_seedance_materialize_task_assets_worker,
        args=(row_id,),
        daemon=True,
        name=f"seedance-download-{row_id}",
    )
    worker.start()
    refreshed = VideoGenerationTaskMirror.objects.filter(id=row_id).first()
    return refreshed or row


def _seedance_headers(cfg: Dict[str, str]) -> Dict[str, str]:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    api_key = str(cfg.get("api_key") or "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}" if not api_key.lower().startswith("bearer ") else api_key
    return headers


def _seedance_get_task_list(
    cfg: Dict[str, str],
    *,
    page_num: int = 1,
    page_size: int = 20,
    status: str = "",
    model: str = "",
    task_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    api_base = str(cfg.get("api_base") or "https://ark.cn-beijing.volces.com/api/v3").rstrip("/")
    query: Dict[str, Any] = {
        "page_num": max(1, int(page_num or 1)),
        "page_size": max(1, min(100, int(page_size or 20))),
    }
    if status:
        query["filter.status"] = status
    if model:
        query["filter.model"] = model
    if task_ids:
        clean_ids = [str(task_id or "").strip() for task_id in task_ids if str(task_id or "").strip()]
        if clean_ids:
            query["filter.task_ids"] = clean_ids
    url = f"{api_base}/contents/generations/tasks?{urllib.parse.urlencode(query, doseq=True)}"
    raw, err = _request_raw("GET", url, data=None, headers=_seedance_headers(cfg), timeout_sec=float(cfg.get("timeout_sec") or 120))
    if err or raw is None:
        raise ValueError(f"Seedance list tasks failed: {err or 'unknown error'}")
    try:
        text = raw.decode("utf-8")
    except Exception:
        text = raw.decode("utf-8", errors="ignore")
    return json.loads(text) if text else {}


def _seedance_serialize_task_row(row: VideoGenerationTaskMirror) -> Dict[str, Any]:
    return {
        "id": cast(int, getattr(row, "id")),
        "taskId": row.remote_task_id,
        "provider": row.provider,
        "model": row.model,
        "taskType": row.task_type,
        "source": row.source,
        "status": row.status,
        "prompt": row.prompt,
        "ratio": row.ratio,
        "resolution": row.resolution,
        "duration": row.duration,
        "seed": row.seed,
        "generateAudio": row.generate_audio,
        "watermark": row.watermark,
        "cameraFixed": row.camera_fixed,
        "serviceTier": row.service_tier,
        "tools": row.tools or [],
        "usage": row.usage or {},
        "videoUrlRemote": row.video_url_remote,
        "videoUrlLocal": row.video_url_local,
        "videoSourcePathLocal": row.video_source_path_local,
        "lastFrameUrlRemote": row.last_frame_url_remote,
        "lastFrameUrlLocal": row.last_frame_url_local,
        "lastFrameSourcePathLocal": row.last_frame_source_path_local,
        "downloadStatus": row.download_status,
        "downloadProgress": row.download_progress,
        "downloadError": row.download_error,
        "errorMessage": row.error_message,
        "statusText": row.status_text,
        "projectId": cast(Optional[int], getattr(row, "project_id", None)),
        "remoteCreatedAt": row.remote_created_at,
        "remoteUpdatedAt": row.remote_updated_at,
        "requestPayload": row.request_payload or {},
        "responsePayload": row.response_payload or {},
        "createdAt": row.created_at.isoformat(),
        "updatedAt": row.updated_at.isoformat(),
        "syncedAt": row.synced_at.isoformat(),
    }


def _seedance_extract_content_urls(obj: Any) -> Tuple[str, str]:
    content = obj.get("content") if isinstance(obj, dict) else None
    if not isinstance(content, dict):
        return "", ""
    return str(content.get("video_url") or "").strip(), str(content.get("last_frame_url") or "").strip()


def _seedance_local_media_url_is_available(raw_url: str) -> bool:
    media_file = _try_media_file_from_url(raw_url)
    return media_file is not None and media_file.exists() and media_file.is_file()


def _seedance_local_media_source_path(raw_url: str) -> str:
    media_file = _try_media_file_from_url(raw_url)
    if media_file is None:
        return ""
    try:
        return str(media_file.resolve())
    except Exception:
        return str(media_file)


def _seedance_reconcile_local_media(
    row: VideoGenerationTaskMirror,
    *,
    save_missing: bool,
) -> VideoGenerationTaskMirror:
    update_fields: List[str] = []

    video_url_local = str(row.video_url_local or "").strip()
    if video_url_local and not _seedance_local_media_url_is_available(video_url_local):
        row.video_url_local = ""
        row.video_source_path_local = ""
        update_fields.append("video_url_local")
        update_fields.append("video_source_path_local")

    last_frame_url_local = str(row.last_frame_url_local or "").strip()
    if last_frame_url_local and not _seedance_local_media_url_is_available(last_frame_url_local):
        row.last_frame_url_local = ""
        row.last_frame_source_path_local = ""
        update_fields.append("last_frame_url_local")
        update_fields.append("last_frame_source_path_local")

    if row.video_url_local and str(row.video_source_path_local or "").strip() == "":
        row.video_source_path_local = _seedance_local_media_source_path(row.video_url_local)
        update_fields.append("video_source_path_local")

    if row.last_frame_url_local and str(row.last_frame_source_path_local or "").strip() == "":
        row.last_frame_source_path_local = _seedance_local_media_source_path(row.last_frame_url_local)
        update_fields.append("last_frame_source_path_local")

    video_ready = bool(str(row.video_url_local or "").strip()) and _seedance_local_media_url_is_available(str(row.video_url_local or "").strip())
    if video_ready:
        if row.download_status != "ready":
            row.download_status = "ready"
            update_fields.append("download_status")
        if int(row.download_progress or 0) != 100:
            row.download_progress = 100
            update_fields.append("download_progress")
        if row.download_error:
            row.download_error = ""
            update_fields.append("download_error")

    if save_missing:
        status = str(row.status or "").strip().lower()
        if status in ("succeeded", "success") and row.video_url_remote and not video_ready:
            if row.download_status not in ("pending", "downloading"):
                if update_fields:
                    row.save(update_fields=list(dict.fromkeys(update_fields + ["synced_at", "updated_at"])))
                    update_fields = []
                return _seedance_start_task_asset_materialization(row)

    if update_fields:
        deduped_fields = list(dict.fromkeys(update_fields + ["synced_at", "updated_at"]))
        row.save(update_fields=deduped_fields)
    return row


def _seedance_upsert_task_mirror(
    *,
    task_id: str,
    request_payload: Optional[Dict[str, Any]] = None,
    remote_task: Optional[Dict[str, Any]] = None,
    project_id: Optional[int] = None,
    source: str = "bottom-chat",
) -> Optional[VideoGenerationTaskMirror]:
    task_id = str(task_id or "").strip()
    if not task_id:
        return None
    row, _ = VideoGenerationTaskMirror.objects.get_or_create(remote_task_id=task_id)
    if project_id and BlueprintProject.objects.filter(id=project_id).exists():
        setattr(row, "project_id", project_id)
    if source:
        row.source = str(source).strip() or row.source
    if isinstance(request_payload, dict):
        row.request_payload = request_payload
        row.model = str(request_payload.get("model") or row.model or "").strip()
        row.task_type = str(request_payload.get("task_type") or row.task_type or "").strip()
        row.prompt = str(request_payload.get("prompt") or row.prompt or "").strip()
        row.ratio = str(request_payload.get("ratio") or row.ratio or "").strip()
        row.resolution = str(request_payload.get("resolution") or row.resolution or "").strip()
        try:
            row.duration = int(request_payload.get("duration") or row.duration or 0)
        except Exception:
            pass
        try:
            seed = request_payload.get("seed")
            row.seed = int(seed) if seed is not None and str(seed).strip() != "" else row.seed
        except Exception:
            pass
        row.generate_audio = bool(request_payload.get("generate_audio", row.generate_audio))
        row.watermark = bool(request_payload.get("watermark", row.watermark))
        row.camera_fixed = bool(request_payload.get("camera_fixed", row.camera_fixed))
        row.service_tier = str(request_payload.get("service_tier") or row.service_tier or "").strip()
        tools_val = request_payload.get("tools")
        if isinstance(tools_val, list):
            row.tools = tools_val
    if isinstance(remote_task, dict):
        row.response_payload = remote_task
        row.model = str(remote_task.get("model") or row.model or "").strip()
        row.task_type = str(remote_task.get("task_type") or row.task_type or "").strip()
        row.status = str(remote_task.get("status") or row.status or "queued").strip() or "queued"
        row.status_text = _seedance_extract_usage_text(remote_task) or row.status_text or ""
        row.usage = remote_task.get("usage") if isinstance(remote_task.get("usage"), dict) else row.usage
        video_url_remote, last_frame_url_remote = _seedance_extract_content_urls(remote_task)
        if video_url_remote:
            row.video_url_remote = video_url_remote
        if last_frame_url_remote:
            row.last_frame_url_remote = last_frame_url_remote
        err_obj = remote_task.get("error")
        if err_obj is not None:
            row.error_message = json.dumps(err_obj, ensure_ascii=False) if not isinstance(err_obj, str) else err_obj
        created_at_val = remote_task.get("created_at")
        updated_at_val = remote_task.get("updated_at") or remote_task.get("finished_at")
        try:
            row.remote_created_at = int(created_at_val) if created_at_val is not None and str(created_at_val).strip() != "" else row.remote_created_at
        except Exception:
            pass
        try:
            row.remote_updated_at = int(updated_at_val) if updated_at_val is not None and str(updated_at_val).strip() != "" else row.remote_updated_at
        except Exception:
            pass
    row.save()
    return row


def _seedance_sync_remote_task(
    cfg: Dict[str, str],
    task_id: str,
    *,
    request_payload: Optional[Dict[str, Any]] = None,
    project_id: Optional[int] = None,
    source: str = "bottom-chat",
    save_media: bool = False,
) -> Optional[VideoGenerationTaskMirror]:
    remote_task = _seedance_get_task(cfg, task_id)
    row = _seedance_upsert_task_mirror(
        task_id=task_id,
        request_payload=request_payload,
        remote_task=remote_task,
        project_id=project_id,
        source=source,
    )
    if not row:
        return None
    if save_media:
        row = _seedance_reconcile_local_media(row, save_missing=True)
    return row


def _seedance_sync_task_page(
    cfg: Dict[str, str],
    *,
    page_num: int,
    page_size: int,
    status: str = "",
    model: str = "",
    task_ids: Optional[List[str]] = None,
    project_id: Optional[int] = None,
    save_media: bool = False,
) -> Dict[str, Any]:
    obj = _seedance_get_task_list(cfg, page_num=page_num, page_size=page_size, status=status, model=model, task_ids=task_ids)
    items = obj.get("items") if isinstance(obj, dict) else None
    synced_items: List[Dict[str, Any]] = []
    if isinstance(items, list):
        for item in items:
            if not isinstance(item, dict):
                continue
            task_id = str(item.get("id") or "").strip()
            if not task_id:
                continue
            row = _seedance_upsert_task_mirror(task_id=task_id, remote_task=item, project_id=project_id, source="remote-sync")
            if row and save_media:
                row = _seedance_reconcile_local_media(row, save_missing=True)
            if row:
                synced_items.append(_seedance_serialize_task_row(row))
    return {
        "remote": obj,
        "items": synced_items,
    }


def _seedance_get_task(cfg: Dict[str, str], task_id: str) -> Dict[str, Any]:
    api_base = str(cfg.get("api_base") or "https://ark.cn-beijing.volces.com/api/v3").rstrip("/")
    url = f"{api_base}/contents/generations/tasks/{urllib.parse.quote(str(task_id or '').strip(), safe='')}"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    api_key = str(cfg.get("api_key") or "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}" if not api_key.lower().startswith("bearer ") else api_key
    raw, err = _request_raw("GET", url, data=None, headers=headers, timeout_sec=float(cfg.get("timeout_sec") or 120))
    if err or raw is None:
        raise ValueError(f"Seedance get task failed: {err or 'unknown error'}")
    try:
        text = raw.decode("utf-8")
    except Exception:
        text = raw.decode("utf-8", errors="ignore")
    return json.loads(text) if text else {}


def _seedance_build_content(prompt: str, ref_images: List[Tuple[str, bytes, str]], ref_mode: str, ref_count: int) -> List[Dict[str, Any]]:
    content: List[Dict[str, Any]] = [{"type": "text", "text": str(prompt or "")}]
    if not ref_images:
        return content

    refs = ref_images[: max(0, min(len(ref_images), ref_count))]
    if not refs:
        return content

    mode = str(ref_mode or "auto").strip().lower()
    if mode not in ("auto", "reference", "first", "first-last"):
        mode = "auto"

    for idx, (_, data, content_type) in enumerate(refs):
        item: Dict[str, Any] = {
            "type": "image_url",
            "image_url": {"url": _seedance_data_url_from_image(data, content_type)},
        }
        role: Optional[str] = None
        if mode == "reference":
            role = "reference_image"
        elif mode == "first":
            role = "first_frame" if idx == 0 else None
        elif mode == "first-last":
            if idx == 0:
                role = "first_frame"
            elif idx == 1:
                role = "last_frame"
            else:
                role = "reference_image"
        else:
            # auto
            if len(refs) == 1:
                role = "first_frame"
            elif len(refs) >= 2:
                if idx == 0:
                    role = "first_frame"
                elif idx == 1:
                    role = "last_frame"
                else:
                    role = "reference_image"
        if role:
            item["role"] = role
        content.append(item)

    return content


def _seedance_pick_task_type(model: str, ref_images: List[Tuple[str, bytes, str]], ref_mode: str, requested_task_type: str) -> str:
    mode = str(ref_mode or "").strip().lower()
    req = str(requested_task_type or "").strip().lower()

    if req in ("t2v", "i2v", "r2v"):
        return req

    if mode == "reference":
        return "r2v" if ref_images else "t2v"

    # Auto mode: as long as there are images, prefer i2v for compatibility.
    if ref_images:
        return "i2v"

    if mode in ("reference", "first", "first-last", "auto"):
        return "t2v"
    return "t2v"


def _seedance_model_supports_service_tier(model: str) -> bool:
    return str(model or "").strip() == "doubao-seedance-1-5-pro-251215"


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
            # Seedance 视频生成可能十几分钟，不做硬性超时，由用户或前端控制中止。
            poll_interval_sec = max(2.0, float(cfg.get("poll_interval_sec") or 5))
            heartbeat_interval_sec = 10.0
            billing_text: Optional[str] = None
            last_status_text: str = ""

            # 轮询期间：每 5 秒查询一次远程状态，同时确保每 10 秒内有数据写到客户端，
            # 以防止 Vite 代理 / TCP / 浏览器端因 idle 断开长连接。
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
                status_msg = f"Seedance：{status or 'running'}（{elapsed}s）{suffix}"
                yield _sse("msg", _agent_to_ui_task_status("streaming", message=status_msg)).encode("utf-8")
                last_status_text = status_msg

                # 在 poll_interval_sec 秒内分 1 秒小步骤 sleep，每 1 秒检查是否需要心跳，
                # 确保 TCP 连接不会因 idle 被任何中间层（代理、防火墙、浏览器）断开。
                slept = 0.0
                while slept < poll_interval_sec:
                    # 已经过了 heartbeat_interval_sec 没有写过数据？发送心跳 comment。
                    # SSE 客户端会忽略以 ':' 开头的行，所以我们用 event: ping 来携带一个轻量事件。
                    sleep_step = min(1.0, poll_interval_sec - slept)
                    try:
                        time.sleep(sleep_step)
                    except Exception:
                        pass
                    slept += sleep_step
                    # 每 heartbeat_interval_sec 写一次心跳，防止 socket idle。
                    if slept < poll_interval_sec:
                        # 写一个轻量级 ping 事件 + retry 提示，让前端知道连接仍然有效。
                        yield (
                            _sse(
                                "msg",
                                _agent_to_ui_task_status(
                                    "streaming",
                                    message=f"Seedance：{status or 'running'}（{int(time.time() - started_at)}s）…",
                                ),
                            ).encode("utf-8")
                        )
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
        limit = max(1, min(200, int(limit_raw or "80")))
    except Exception:
        limit = 80
    items: List[Dict[str, Any]] = []
    for row in list(q[:limit]):
        row = _seedance_reconcile_local_media(row, save_missing=False)
        items.append(_seedance_serialize_task_row(row))
    return Response({"ok": True, "items": items})


@api_view(["GET"])
def seedance_task_detail(request: Request) -> Response:
    task_id = str(request.query_params.get("taskId") or request.query_params.get("id") or "").strip()
    if not task_id:
        return _json_error("taskId is required")
    row = VideoGenerationTaskMirror.objects.filter(remote_task_id=task_id).first()
    if not row:
        return _json_error("task not found", status=404)
    row = _seedance_reconcile_local_media(row, save_missing=True)
    return Response({"ok": True, "item": _seedance_serialize_task_row(row)})


@api_view(["POST"])
def seedance_sync_tasks(request: Request) -> Response:
    cfg = _seedance_cfg()
    if not str(cfg.get("api_key") or "").strip():
        return _json_error("字节方舟 API Key 未配置，请先到设置页保存。", status=400)

    payload = _coerce_request_payload(request.data)
    task_id = str(payload.get("taskId") or payload.get("id") or "").strip()
    model = str(payload.get("model") or "").strip()
    status = str(payload.get("status") or "").strip().lower()
    try:
        page_num = max(1, int(str(payload.get("pageNum") or 1).strip()))
    except Exception:
        page_num = 1
    try:
        page_size = max(1, min(100, int(str(payload.get("pageSize") or 20).strip())))
    except Exception:
        page_size = 20
    save_media = _seedance_truthy(payload.get("saveMedia"))
    project_id: Optional[int] = None
    try:
        if payload.get("projectId") is not None and str(payload.get("projectId")).strip() != "":
            project_id = int(str(payload.get("projectId")).strip())
    except Exception:
        project_id = None

    try:
        if task_id:
            row = _seedance_sync_remote_task(cfg, task_id, project_id=project_id, source="remote-sync", save_media=save_media)
            if not row:
                return _json_error("task sync failed", status=502)
            return Response({"ok": True, "item": _seedance_serialize_task_row(row)})

        synced = _seedance_sync_task_page(
            cfg,
            page_num=page_num,
            page_size=page_size,
            status=status,
            model=model,
            project_id=project_id,
            save_media=save_media,
        )
        remote = synced.get("remote") if isinstance(synced, dict) else {}
        items = synced.get("items") if isinstance(synced, dict) else []
        total = remote.get("total") if isinstance(remote, dict) else None
        return Response({"ok": True, "items": items, "total": total, "remote": remote})
    except Exception as e:
        return _json_error(str(e) or "seedance sync failed", status=502)


def _jimeng_cfg() -> Dict[str, str]:
    def _env_or_default(name: str, fallback: str) -> str:
        v = os.environ.get(name)
        return v if v else fallback

    access_key_id = ""
    secret_key = ""
    try:
        from dwebapp.ai.credentials_store import get_jimeng_access_key_id, get_jimeng_secret_key

        access_key_id = (get_jimeng_access_key_id() or "").strip()
        secret_key = (get_jimeng_secret_key() or "").strip()
    except Exception:
        pass

    host = _env_or_default("JIMENG_VISUAL_HOST", "visual.volcengineapi.com").strip() or "visual.volcengineapi.com"
    timeout_sec = _env_or_default("JIMENG_TIMEOUT_SEC", "120").strip() or "120"
    poll_interval_sec = _env_or_default("JIMENG_POLL_INTERVAL_SEC", "3").strip() or "3"
    poll_timeout_sec = _env_or_default("JIMENG_POLL_TIMEOUT_SEC", "300").strip() or "300"

    ak_hint = ""
    if access_key_id:
        if len(access_key_id) <= 8:
            ak_hint = access_key_id[:2] + "****"
        else:
            ak_hint = access_key_id[:4] + "****" + access_key_id[-4:]

    return {
        "access_key_id": access_key_id,
        "secret_key": secret_key,
        "credential_source": "db",
        "access_key_hint": ak_hint,
        "host": host,
        "region": "cn-north-1",
        "service": "cv",
        "version": "2022-08-31",
        "submit_action": "CVSync2AsyncSubmitTask",
        "result_action": "CVSync2AsyncGetResult",
        "timeout_sec": timeout_sec,
        "poll_interval_sec": poll_interval_sec,
        "poll_timeout_sec": poll_timeout_sec,
    }


def _jimeng_hmac_sha256(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _jimeng_sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _jimeng_signing_key(secret_key: str, date_yyyymmdd: str, region: str, service: str) -> bytes:
    k_date = _jimeng_hmac_sha256(secret_key.encode("utf-8"), date_yyyymmdd)
    k_region = hmac.new(k_date, region.encode("utf-8"), hashlib.sha256).digest()
    k_service = hmac.new(k_region, service.encode("utf-8"), hashlib.sha256).digest()
    return hmac.new(k_service, b"request", hashlib.sha256).digest()


def _jimeng_signed_post(action: str, payload_obj: Dict[str, Any], cfg: Dict[str, str]) -> Dict[str, Any]:
    host = str(cfg.get("host") or "visual.volcengineapi.com").strip() or "visual.volcengineapi.com"
    region = str(cfg.get("region") or "cn-north-1").strip() or "cn-north-1"
    service = str(cfg.get("service") or "cv").strip() or "cv"
    version = str(cfg.get("version") or "2022-08-31").strip() or "2022-08-31"
    access_key_id = str(cfg.get("access_key_id") or "").strip()
    secret_key = str(cfg.get("secret_key") or "").strip()
    if not access_key_id or not secret_key:
        raise ValueError("即梦 AK/SK 缺失")

    query_items = [("Action", action), ("Version", version)]
    canonical_query = urllib.parse.urlencode(sorted(query_items), doseq=True, safe="-_.~")
    url = f"https://{host}/?{canonical_query}"

    payload_bytes = json.dumps(payload_obj or {}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    payload_hash = _jimeng_sha256_hex(payload_bytes)

    now = time.gmtime()
    x_date = time.strftime("%Y%m%dT%H%M%SZ", now)
    date_short = x_date[:8]
    canonical_headers_map = {
        "content-type": "application/json",
        "host": host,
        "x-content-sha256": payload_hash,
        "x-date": x_date,
    }
    signed_header_keys = sorted(canonical_headers_map.keys())
    canonical_headers = "".join(f"{k}:{canonical_headers_map[k]}\n" for k in signed_header_keys)
    signed_headers = ";".join(signed_header_keys)
    canonical_request = "\n".join(["POST", "/", canonical_query, canonical_headers, signed_headers, payload_hash])

    credential_scope = f"{date_short}/{region}/{service}/request"
    string_to_sign = "\n".join(
        [
            "HMAC-SHA256",
            x_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    signing_key = _jimeng_signing_key(secret_key, date_short, region, service)
    signature = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    authorization = (
        "HMAC-SHA256 "
        f"Credential={access_key_id}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, "
        f"Signature={signature}"
    )

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Host": host,
        "X-Date": x_date,
        "X-Content-Sha256": payload_hash,
        "Authorization": authorization,
    }

    raw, err = _request_raw("POST", url, data=payload_bytes, headers=headers, timeout_sec=float(cfg.get("timeout_sec") or 120))
    if err or raw is None:
        err_text = str(err or "unknown error")
        status = ""
        upstream = err_text
        m = re.match(r"^http\s+(\d+)\s*:\s*(.*)$", err_text, flags=re.IGNORECASE | re.DOTALL)
        if m:
            status = str(m.group(1) or "")
            upstream = str(m.group(2) or "")

        upstream_code = ""
        upstream_message = upstream.strip()
        request_id = ""
        try:
            parsed = json.loads(upstream)
            if isinstance(parsed, dict):
                upstream_code = str(parsed.get("Code") or parsed.get("code") or "").strip()
                upstream_message = str(parsed.get("Message") or parsed.get("message") or upstream_message).strip()
                request_id = str(
                    parsed.get("RequestId")
                    or parsed.get("RequestID")
                    or parsed.get("request_id")
                    or parsed.get("requestId")
                    or ""
                ).strip()
        except Exception:
            pass

        req_key = str((payload_obj or {}).get("req_key") or "").strip()
        ak_hint = str(cfg.get("access_key_hint") or "").strip() or "-"
        credential_source = str(cfg.get("credential_source") or "db").strip() or "db"

        parts: List[str] = ["即梦请求失败"]
        if status:
            parts.append(f"http={status}")
        parts.append(f"action={action}")
        if req_key:
            parts.append(f"req_key={req_key}")
        parts.append(f"credential={credential_source}")
        parts.append(f"ak={ak_hint}")
        if upstream_code:
            parts.append(f"code={upstream_code}")
        if request_id:
            parts.append(f"requestId={request_id}")
        if upstream_message:
            parts.append(f"message={upstream_message[:240]}")

        if status == "401":
            msg_lower = str(upstream_message or "").lower()
            code_lower = str(upstream_code or "").lower()
            if str(upstream_code or "") == "50400" or "access denied" in msg_lower:
                if req_key in ("jimeng_ti2v_v30", "jimeng_ti2v_v30_pro", "jimeng_i2v_recamera_v30"):
                    parts.append("权限不足或能力未开通（50400/Access Denied）。当前请求命中图生/运镜能力，请在火山控制台确认已开通对应能力。")
                else:
                    parts.append("权限不足或能力未开通（50400/Access Denied）。当前请求命中文生能力，请在火山控制台确认已开通对应能力。")
            elif any(k in msg_lower or k in code_lower for k in ("signature", "invalidaccesskey", "authfailure")):
                parts.append("鉴权失败：请检查 AccessKey/SecretKey 是否正确，并确认系统时间已同步。")
            else:
                parts.append("请确认填写的是 AccessKey ID（AK开头），不是账号ID（Account ID）。")

        raise ValueError("; ".join(parts))
    try:
        text = raw.decode("utf-8")
    except Exception:
        text = raw.decode("utf-8", errors="ignore")
    return json.loads(text) if text else {}


def _jimeng_extract_task_id(obj: Any) -> str:
    if not isinstance(obj, dict):
        return ""
    for key in ("task_id", "taskId", "id"):
        val = obj.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    data = obj.get("data")
    if isinstance(data, dict):
        for key in ("task_id", "taskId", "id"):
            val = data.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
    return ""


def _jimeng_extract_status(obj: Any) -> str:
    if not isinstance(obj, dict):
        return ""
    for key in ("status", "task_status", "state"):
        val = obj.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip().lower()
    data = obj.get("data")
    if isinstance(data, dict):
        for key in ("status", "task_status", "state"):
            val = data.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip().lower()
    return ""


def _jimeng_collect_urls(v: Any, out: List[str]) -> None:
    if isinstance(v, str):
        s = v.strip()
        if s.startswith("http://") or s.startswith("https://"):
            out.append(s)
        return
    if isinstance(v, list):
        for item in v:
            _jimeng_collect_urls(item, out)
        return
    if isinstance(v, dict):
        for vv in v.values():
            _jimeng_collect_urls(vv, out)


def _jimeng_extract_result_urls(obj: Any) -> Tuple[List[str], List[str]]:
    all_urls: List[str] = []
    _jimeng_collect_urls(obj, all_urls)
    uniq_urls = list(dict.fromkeys([u for u in all_urls if isinstance(u, str) and u]))
    image_ext = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif")
    video_ext = (".mp4", ".mov", ".webm", ".mkv", ".avi")

    def _is_image_url(u: str) -> bool:
        try:
            p = urllib.parse.urlparse(u)
            path_l = p.path.lower()
            q_l = p.query.lower()
            return path_l.endswith(image_ext) or any(ext in q_l for ext in image_ext)
        except Exception:
            ul = str(u or "").lower()
            return any(ext in ul for ext in image_ext)

    def _is_video_url(u: str) -> bool:
        try:
            p = urllib.parse.urlparse(u)
            path_l = p.path.lower()
            q_l = p.query.lower()
            if path_l.endswith(video_ext) or any(ext in q_l for ext in video_ext):
                return True
            ul = u.lower()
            return any(k in ul for k in ("video", "play", "vod", "download"))
        except Exception:
            ul = str(u or "").lower()
            return any(ext in ul for ext in video_ext) or any(k in ul for k in ("video", "play", "vod", "download"))

    images = [u for u in uniq_urls if _is_image_url(u)]
    videos = [u for u in uniq_urls if _is_video_url(u)]

    hinted_videos: List[str] = []
    hinted_images: List[str] = []

    def _collect_hinted(v: Any, key_hint: str = "") -> None:
        if isinstance(v, dict):
            for kk, vv in v.items():
                _collect_hinted(vv, str(kk or "").strip().lower())
            return
        if isinstance(v, list):
            for item in v:
                _collect_hinted(item, key_hint)
            return
        if isinstance(v, str):
            s = v.strip()
            if not (s.startswith("http://") or s.startswith("https://")):
                return
            kh = key_hint or ""
            if any(t in kh for t in ("video", "vid", "play", "download")):
                hinted_videos.append(s)
            elif any(t in kh for t in ("image", "img", "cover", "poster", "thumb")):
                hinted_images.append(s)

    _collect_hinted(obj)

    if not videos and hinted_videos:
        videos = list(dict.fromkeys(hinted_videos))
    if not images and hinted_images:
        images = list(dict.fromkeys(hinted_images))

    if not images and not videos:
        if uniq_urls:
            images = [uniq_urls[0]]
    return images, videos


def _jimeng_req_key_from_model(model: str, kind: str) -> str:
    m = str(model or "").strip()
    if kind == "image":
        if m == "jimeng-image-4.0":
            return "jimeng_t2i_v40"
        return "jimeng_t2i_v30" if m == "jimeng-image-3.0" else (m or "jimeng_t2i_v30")

    if m == "jimeng-video-3.0-pro":
        return "jimeng_ti2v_v30_pro"
    return "jimeng_ti2v_v30" if m == "jimeng-video-3.0" else (m or "jimeng_ti2v_v30")


def _jimeng_normalize_resolution(raw: Any) -> str:
    v = str(raw or "").strip().lower()
    if v in ("1080", "1080p"):
        return "1080p"
    return "720p"


def _jimeng_normalize_ref_mode(raw: Any) -> str:
    mode = str(raw or "auto").strip().lower()
    if mode in ("auto", "first", "first-last", "reference", "recamera"):
        return mode
    return "auto"


def _jimeng_normalize_aspect_ratio(raw: Any) -> str:
    ratio = str(raw or "").strip()
    allowed = {"16:9", "4:3", "1:1", "3:4", "9:16", "21:9"}
    if ratio in allowed:
        return ratio
    return "16:9"


JIMENG_VIDEO_SCENES: Dict[str, Dict[str, Any]] = {
    "pro-ti2v": {
        "req_key": "jimeng_ti2v_v30_pro",
        "max_refs": 1,
        "require_recamera_fields": False,
    },
    "720p-i2v-recamera": {
        "req_key": "jimeng_i2v_recamera_v30",
        "max_refs": 1,
        "require_recamera_fields": True,
    },
    "720p-ti2v": {
        "req_key": "jimeng_ti2v_v30",
        "max_refs": 4,
        "require_recamera_fields": False,
    },
    "1080p-t2v": {
        "req_key": "jimeng_t2v_v30_1080p",
        "max_refs": 0,
        "require_recamera_fields": False,
    },
    "720p-t2v": {
        "req_key": "jimeng_t2v_v30",
        "max_refs": 0,
        "require_recamera_fields": False,
    },
}

JIMENG_RECAMERA_TEMPLATE_IDS: Set[str] = {
    "hitchcock_dolly_in",
    "hitchcock_dolly_out",
    "robo_arm",
    "dynamic_orbit",
    "central_orbit",
    "crane_push",
    "quick_pull_back",
    "counterclockwise_swivel",
    "clockwise_swivel",
    "handheld",
    "rapid_push_pull",
}

JIMENG_RECAMERA_STRENGTHS: Set[str] = {"weak", "medium", "strong"}


def _jimeng_build_video_scene(
    model: str,
    resolution: str,
    ref_mode: str,
    has_refs: bool,
    task_type: str,
) -> Dict[str, Any]:
    is_pro = str(model or "").strip() == "jimeng-video-3.0-pro"
    if is_pro and has_refs:
        out = dict(JIMENG_VIDEO_SCENES["pro-ti2v"])
        out["scene_name"] = "pro-ti2v"
        return out

    if ref_mode == "recamera":
        out = dict(JIMENG_VIDEO_SCENES["720p-i2v-recamera"])
        out["scene_name"] = "720p-i2v-recamera"
        return out

    # Scene selection should rely on actual refs; frontend taskType may be stale.
    treat_as_i2v = has_refs
    if treat_as_i2v:
        out = dict(JIMENG_VIDEO_SCENES["720p-ti2v"])
        out["scene_name"] = "720p-ti2v"
        return out

    if resolution == "1080p":
        out = dict(JIMENG_VIDEO_SCENES["1080p-t2v"])
        out["scene_name"] = "1080p-t2v"
        return out
    out = dict(JIMENG_VIDEO_SCENES["720p-t2v"])
    out["scene_name"] = "720p-t2v"
    return out


def _jimeng_normalize_frames(raw_frames: Any, raw_duration: Any) -> int:
    frames_text = str(raw_frames or "").strip()
    if frames_text:
        try:
            frames = int(frames_text)
            if frames in (121, 241):
                return frames
        except Exception:
            pass

    duration_text = str(raw_duration or "").strip()
    if duration_text:
        try:
            duration = int(duration_text)
            return 241 if duration >= 8 else 121
        except Exception:
            pass
    return 121


def _jimeng_read_ref_images(request: HttpRequest, max_count: int = 4) -> List[Tuple[str, bytes, str]]:
    ref_uploads: List[Any] = []
    try:
        ref_uploads = list(request.FILES.getlist("refImages") or [])
    except Exception:
        ref_uploads = []
    if not ref_uploads:
        ref_single = request.FILES.get("refImage")
        if ref_single is not None:
            ref_uploads = [ref_single]

    out: List[Tuple[str, bytes, str]] = []
    for ref_upload in ref_uploads:
        if len(out) >= max_count:
            break
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
            out.append((ref_name, ref_bytes, ref_ct))
        except Exception:
            continue
    return out


def _jimeng_pick_refs_by_mode(
    refs: List[Tuple[str, bytes, str]],
    ref_mode: str,
    ref_count: int,
) -> List[Tuple[str, bytes, str]]:
    if not refs:
        return []

    mode = _jimeng_normalize_ref_mode(ref_mode)
    max_n = max(1, min(4, int(ref_count or 4)))

    if mode == "recamera":
        return refs[:1]

    if mode == "first":
        return refs[:1]
    if mode == "first-last":
        if len(refs) <= 1:
            return refs[:1]
        out = [refs[0], refs[-1]]
        return out[:max_n]

    # reference / auto: keep original order and clamp by referenceCount.
    return refs[:max_n]


def _jimeng_build_submit_payload(kind: str, prompt: str, model: str, request: HttpRequest) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"prompt": str(prompt or "").strip()}

    if kind == "image":
        payload["req_key"] = _jimeng_req_key_from_model(model, kind)
        ar = str(request.POST.get("aspectRatio") or request.POST.get("ratio") or "").strip()
        if ar:
            payload["aspect_ratio"] = ar
    else:
        ratio = _jimeng_normalize_aspect_ratio(request.POST.get("ratio") or "16:9")
        payload["aspect_ratio"] = ratio
        payload["frames"] = _jimeng_normalize_frames(request.POST.get("frames"), request.POST.get("duration"))

    seed_raw = str(request.POST.get("seed") or "").strip()
    if seed_raw:
        try:
            payload["seed"] = int(seed_raw)
        except Exception:
            pass

    ref_mode = _jimeng_normalize_ref_mode(request.POST.get("refMode") or "auto")
    ref_count_raw = str(request.POST.get("referenceCount") or "4").strip()
    try:
        ref_count = int(ref_count_raw)
    except Exception:
        ref_count = 4

    task_type = str(request.POST.get("taskType") or request.POST.get("task_type") or "").strip().lower()
    resolution = _jimeng_normalize_resolution(request.POST.get("resolution"))

    refs = _jimeng_read_ref_images(request, max_count=4)
    refs = _jimeng_pick_refs_by_mode(refs, ref_mode, ref_count)

    if kind == "video":
        scene = _jimeng_build_video_scene(model, resolution, ref_mode, bool(refs), task_type)
        payload["req_key"] = str(scene["req_key"])

        # Hard guard: no refs must not call ti2v/recamera req_key.
        if not refs and str(payload.get("req_key") or "").strip() in (
            "jimeng_ti2v_v30",
            "jimeng_ti2v_v30_pro",
            "jimeng_i2v_recamera_v30",
        ):
            payload["req_key"] = "jimeng_t2v_v30_1080p" if resolution == "1080p" else "jimeng_t2v_v30"

        max_refs = int(scene.get("max_refs") or 0)
        if max_refs <= 0:
            refs = []
        elif len(refs) > max_refs:
            raise ValueError(f"即梦场景 {scene.get('scene_name')} 仅支持 {max_refs} 张参考图")

        if scene.get("require_recamera_fields"):
            if not refs:
                raise ValueError("运镜模式需要且仅支持 1 张参考图")
            template_id = str(request.POST.get("templateId") or request.POST.get("template_id") or "").strip()
            if not template_id:
                raise ValueError("运镜模式缺少 template_id")
            if template_id not in JIMENG_RECAMERA_TEMPLATE_IDS:
                raise ValueError("运镜模式 template_id 非法")
            strength = str(request.POST.get("cameraStrength") or request.POST.get("camera_strength") or "").strip().lower()
            if strength not in JIMENG_RECAMERA_STRENGTHS:
                raise ValueError("运镜模式 camera_strength 必须为 weak/medium/strong")
            payload["template_id"] = template_id
            payload["camera_strength"] = strength
    else:
        payload["req_key"] = _jimeng_req_key_from_model(model, kind)

    if refs:
        payload["binary_data_base64"] = [base64.b64encode(data).decode("ascii") for _, data, _ in refs]

    return payload


def _jimeng_poll_result(cfg: Dict[str, str], task_id: str, req_key: str = "") -> Dict[str, Any]:
    payload: Dict[str, Any] = {"task_id": task_id}
    rk = str(req_key or "").strip()
    if rk:
        payload["req_key"] = rk
    return _jimeng_signed_post(str(cfg.get("result_action") or "CVSync2AsyncGetResult"), payload, cfg)


def _jimeng_generate_stream(request: HttpRequest, kind: str) -> HttpResponseBase:
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
    if not cfg.get("access_key_id") or not cfg.get("secret_key"):

        def missing_cfg() -> Generator[bytes, None, None]:
            yield _sse(
                "msg",
                _agent_to_ui_error(
                    "missing_config",
                    "即梦凭据缺失。请在设置页填写并保存 AccessKey ID 与 SecretAccessKey。",
                    details={"need": ["jimengAccessKeyId", "jimengSecretKey"]},
                ),
            ).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

        resp = StreamingHttpResponse(missing_cfg(), content_type="text/event-stream")
        _apply_sse_headers(resp)
        return resp

    model_default = "jimeng-image-3.0" if kind == "image" else "jimeng-video-3.0"
    model = str(request.POST.get("imageModel") or request.POST.get("model") or model_default).strip() or model_default

    def gen() -> Generator[bytes, None, None]:
        try:
            phase = "即梦图片" if kind == "image" else "即梦视频"
            yield _sse("msg", _agent_to_ui_task_status("started", message=f"{phase}：创建任务中…")).encode("utf-8")

            submit_payload = _jimeng_build_submit_payload(kind, prompt, model, request)
            submit_obj = _jimeng_signed_post(str(cfg.get("submit_action") or "CVSync2AsyncSubmitTask"), submit_payload, cfg)
            poll_req_key = str((submit_payload or {}).get("req_key") or "").strip()

            task_id = _jimeng_extract_task_id(submit_obj)
            if not task_id:
                raise ValueError(f"即梦任务创建失败：返回缺少 task_id，响应={str(submit_obj)[:500]}")

            yield _sse("msg", _agent_to_ui_task_status("streaming", message=f"{phase}：任务已创建（{task_id}），等待生成…")).encode(
                "utf-8"
            )

            started_at = time.time()
            poll_interval_sec = max(1.0, float(cfg.get("poll_interval_sec") or 3))
            poll_timeout_sec = max(30.0, float(cfg.get("poll_timeout_sec") or 300))

            while True:
                result_obj = _jimeng_poll_result(cfg, task_id, poll_req_key)
                status = _jimeng_extract_status(result_obj)

                if status in ("succeeded", "success", "done", "finished", "completed"):
                    image_urls, video_urls = _jimeng_extract_result_urls(result_obj)
                    if kind == "image":
                        if not image_urls:
                            raise ValueError("即梦图片生成成功但未返回 image url")
                        local_url = _seedream_download_and_save(image_urls[0])
                        out_payload: Dict[str, Any] = {
                            "taskId": task_id,
                            "imageUrl": local_url,
                            "imageUrlRemote": image_urls[0],
                            "model": model,
                            "status": status,
                        }
                    else:
                        if not video_urls:
                            fallback_urls: List[str] = []
                            _jimeng_collect_urls(result_obj, fallback_urls)
                            fallback_urls = [u for u in fallback_urls if isinstance(u, str) and u.strip()]
                            if fallback_urls:
                                video_urls = [fallback_urls[0]]
                            else:
                                raise ValueError("即梦视频生成成功但未返回 video url")
                        local_url = _seedance_save_video_from_url(video_urls[0])
                        out_payload = {
                            "taskId": task_id,
                            "videoUrl": local_url,
                            "videoUrlRemote": video_urls[0],
                            "videoSourcePath": _seedance_local_media_source_path(local_url),
                            "model": model,
                            "status": status,
                        }

                    yield _sse("msg", _agent_to_ui_chat_message(json.dumps(out_payload, ensure_ascii=False))).encode("utf-8")
                    yield _sse("msg", _agent_to_ui_task_status("done", message=f"{phase}：完成")).encode("utf-8")
                    yield _sse("done", "{}").encode("utf-8")
                    return

                if status in ("failed", "error", "expired", "cancelled", "canceled"):
                    raise ValueError(f"即梦任务失败：status={status}，响应={str(result_obj)[:500]}")

                elapsed = int(max(0, time.time() - started_at))
                yield _sse(
                    "msg",
                    _agent_to_ui_task_status("streaming", message=f"{phase}：{status or 'running'}（{elapsed}s）"),
                ).encode("utf-8")

                if time.time() - started_at >= poll_timeout_sec:
                    raise ValueError(f"即梦任务超时（{int(poll_timeout_sec)}s）")
                try:
                    time.sleep(poll_interval_sec)
                except Exception:
                    pass
        except Exception as e:
            code = "jimeng_image_error" if kind == "image" else "jimeng_video_error"
            yield _sse("msg", _agent_to_ui_error(code, str(e) or "unknown error")).encode("utf-8")
            yield _sse("done", "{}").encode("utf-8")

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    _apply_sse_headers(resp)
    return resp


@csrf_exempt
def jimeng_image_generate_stream(request: HttpRequest) -> HttpResponseBase:
    return _jimeng_generate_stream(request, "image")


@csrf_exempt
def jimeng_video_generate_stream(request: HttpRequest) -> HttpResponseBase:
    return _jimeng_generate_stream(request, "video")


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
                    "DeepSeek API Key missing. Please save it in Settings.",
                    details={"need": ["deepseekApiKey"]},
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


def _should_rewrite_project_local_url(raw_url: str) -> bool:
    url = str(raw_url or "").strip()
    if (not url) or url.startswith("blob:") or url.startswith("data:") or url.startswith("file:") or url.startswith("package://"):
        return True
    media_file = _try_media_file_from_url(url)
    return media_file is not None and (not media_file.exists())


def _build_project_local_asset_url(
    project_id: int,
    *,
    resource_id: Optional[str] = None,
    node_id: Optional[str] = None,
    object_id: Optional[str] = None,
) -> str:
    query: Dict[str, str] = {"projectId": str(project_id)}
    if resource_id:
        query["resourceId"] = str(resource_id)
    if node_id:
        query["nodeId"] = str(node_id)
    if object_id:
        query["objectId"] = str(object_id)
    return "/api/workflow/projects/assets/local?" + urllib.parse.urlencode(query)


def _rewrite_project_snapshot_local_asset_urls(project_id: int, snapshot: Dict[str, Any]) -> None:
    resources_by_id = snapshot.get("resourcesById")
    resource_order = snapshot.get("resourceOrder")
    if isinstance(resources_by_id, dict) and isinstance(resource_order, list):
        for rid in resource_order:
            if not isinstance(rid, str):
                continue
            resource = resources_by_id.get(rid)
            if not isinstance(resource, dict):
                continue
            source_path = str(resource.get("sourcePath") or "").strip()
            raw_url = str(resource.get("url") or "").strip()
            if not source_path or not _should_rewrite_project_local_url(raw_url):
                continue
            resource["url"] = _build_project_local_asset_url(project_id, resource_id=rid)

    nodes_by_id = snapshot.get("nodesById")
    node_order = snapshot.get("nodeOrder")
    if not isinstance(nodes_by_id, dict) or not isinstance(node_order, list):
        return

    for node_id in node_order:
        if not isinstance(node_id, str):
            continue
        node = nodes_by_id.get(node_id)
        if not isinstance(node, dict):
            continue
        node_type = str(node.get("type") or "").strip().lower()

        if node_type == "model3d":
            settings = node.get("model3dSettings")
            if not isinstance(settings, dict):
                continue
            source_path = str(settings.get("modelAssetPath") or settings.get("modelSourcePath") or "").strip()
            if not source_path:
                continue
            local_url = _build_project_local_asset_url(project_id, node_id=node_id)
            if _should_rewrite_project_local_url(str(settings.get("modelUrl") or "").strip()):
                settings["modelUrl"] = local_url
            if _should_rewrite_project_local_url(str(settings.get("modelAssetUrl") or "").strip()):
                settings["modelAssetUrl"] = local_url
            continue

        if node_type != "scene-layout":
            continue
        settings = node.get("sceneLayoutSettings")
        if not isinstance(settings, dict):
            continue
        bindings = settings.get("manualModelBindings")
        if not isinstance(bindings, list):
            continue
        for binding in bindings:
            if not isinstance(binding, dict):
                continue
            object_id = str(binding.get("objectId") or "").strip()
            source_path = str(binding.get("modelAssetPath") or binding.get("modelSourcePath") or "").strip()
            if not object_id or not source_path:
                continue
            local_url = _build_project_local_asset_url(project_id, node_id=node_id, object_id=object_id)
            if _should_rewrite_project_local_url(str(binding.get("modelUrl") or "").strip()):
                binding["modelUrl"] = local_url
            if _should_rewrite_project_local_url(str(binding.get("modelAssetUrl") or "").strip()):
                binding["modelAssetUrl"] = local_url


def _drop_missing_media_references(snapshot: Dict[str, Any]) -> int:
    """Clear media URL fields that point to missing files under MEDIA_ROOT.

    This prevents front-end image/video tags from repeatedly requesting known-missing
    /media/... files (especially stale thumbnail URLs in old snapshots).
    """

    removed = 0

    def _clear_missing_url(target: Dict[str, Any], key: str) -> None:
        nonlocal removed
        raw = str(target.get(key) or "").strip()
        if not raw:
            return
        candidate = _try_media_file_from_url(raw)
        if candidate is None:
            return
        try:
            exists = candidate.exists()
        except Exception:
            exists = False
        if exists:
            return
        target[key] = ""
        removed += 1

    resources_by_id = snapshot.get("resourcesById")
    if isinstance(resources_by_id, dict):
        for resource in resources_by_id.values():
            if not isinstance(resource, dict):
                continue
            _clear_missing_url(resource, "url")
            _clear_missing_url(resource, "posterUrl")

    nodes_by_id = snapshot.get("nodesById")
    if isinstance(nodes_by_id, dict):
        for node in nodes_by_id.values():
            if not isinstance(node, dict):
                continue
            node_type = str(node.get("type") or "").strip().lower()
            if node_type != "meshy":
                continue
            settings = node.get("meshySettings")
            if not isinstance(settings, dict):
                continue
            _clear_missing_url(settings, "meshyThumbnailUrl")

    return removed


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

    # Rewrite project-local assets to backend streaming endpoints so reload still works
    # when browser object urls or host-local file paths are no longer directly accessible.
    try:
        _rewrite_project_snapshot_local_asset_urls(project.id, snapshot)
    except Exception:
        # Never fail loading project due to best-effort URL rewrite.
        pass

    # Remove stale media URLs that already point to missing files, so the client
    # does not emit noisy 404 bursts after route switches/reloads.
    try:
        removed_count = _drop_missing_media_references(snapshot)
        if removed_count > 0:
            data_path, write_err = _write_project_snapshot_file(project, snapshot)
            if not write_err and data_path:
                project.data = data_path
                project.save(update_fields=["data", "updated_at"])
    except Exception:
        # Best effort only.
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
    if kind == "model":
        kind = "file"
    if kind not in ("image", "video", "file"):
        return _json_error("kind must be image, video or file", status=400)

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
        return Response({"ok": True, "fileDeleted": False, "path": "", "ignored": True, "reason": str(err)})
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
    node_id = str(request.query_params.get("nodeId") or "").strip()
    object_id = str(request.query_params.get("objectId") or "").strip()
    try:
        project_id = int(project_id_raw)
    except Exception:
        return _json_error("projectId is required")
    if not resource_id and not node_id:
        return _json_error("resourceId or nodeId is required")

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

    kind = "file"
    source_path_raw = ""
    name = "file"

    if resource_id:
        resources_by_id = snapshot.get("resourcesById")
        if not isinstance(resources_by_id, dict):
            return _json_error("project resources is invalid", status=500)
        resource = resources_by_id.get(resource_id)
        if not isinstance(resource, dict):
            return _json_error("resource not found", status=404)
        kind = str(resource.get("kind") or "").strip().lower()
        source_path_raw = str(resource.get("sourcePath") or "").strip()
        name = str(resource.get("name") or "").strip() or name
    else:
        nodes_by_id = snapshot.get("nodesById")
        if not isinstance(nodes_by_id, dict):
            return _json_error("project nodes is invalid", status=500)
        node = nodes_by_id.get(node_id)
        if not isinstance(node, dict):
            return _json_error("node not found", status=404)
        node_type = str(node.get("type") or "").strip().lower()

        if node_type == "model3d":
            settings = node.get("model3dSettings")
            if not isinstance(settings, dict):
                return _json_error("model3d settings is invalid", status=500)
            source_path_raw = str(settings.get("modelAssetPath") or settings.get("modelSourcePath") or "").strip()
            name = str(settings.get("modelSourceName") or "").strip() or name
        elif node_type == "scene-layout":
            if not object_id:
                return _json_error("objectId is required for scene-layout model asset", status=400)
            settings = node.get("sceneLayoutSettings")
            if not isinstance(settings, dict):
                return _json_error("scene-layout settings is invalid", status=500)
            bindings = settings.get("manualModelBindings")
            if not isinstance(bindings, list):
                return _json_error("scene-layout manualModelBindings is invalid", status=500)
            binding = next(
                (
                    item
                    for item in bindings
                    if isinstance(item, dict) and str(item.get("objectId") or "").strip() == object_id
                ),
                None,
            )
            if not isinstance(binding, dict):
                return _json_error("scene-layout model binding not found", status=404)
            source_path_raw = str(binding.get("modelAssetPath") or binding.get("modelSourcePath") or "").strip()
            name = str(binding.get("modelSourceName") or object_id).strip() or name
        else:
            return _json_error("node asset kind not supported", status=400)

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

    if kind not in ("image", "video"):
        kind = "file"

    # Basic extension guard to reduce risk of arbitrary file reads.
    ext = source_path.suffix.lower()
    if kind == "image" and ext not in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".avif"):
        return _json_error("file extension not allowed for image", status=403)
    if kind == "video" and ext not in (".mp4", ".webm", ".mov", ".m4v", ".mkv", ".avi", ".ogg"):
        return _json_error("file extension not allowed for video", status=403)
    if kind == "file" and ext not in (".glb", ".gltf", ".fbx", ".obj", ".mtl", ".stl", ".usdz", ".vrm", ".bin"):
        return _json_error("file extension not allowed for model asset", status=403)

    content_type = {
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".fbx": "application/octet-stream",
        ".obj": "text/plain",
        ".mtl": "text/plain",
        ".stl": "model/stl",
        ".usdz": "model/vnd.usdz+zip",
        ".vrm": "model/gltf-binary",
        ".bin": "application/octet-stream",
    }.get(ext) or mimetypes.guess_type(str(source_path))[0] or "application/octet-stream"
    name = name or source_path.name
    return _stream_file_response(request, source_path, content_type=content_type, download_name=name)
