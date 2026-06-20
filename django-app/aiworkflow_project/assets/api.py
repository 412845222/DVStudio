from __future__ import annotations

import hashlib
import mimetypes
import os
import ssl
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import urllib.error
import uuid
from pathlib import Path
from typing import Any, Dict, Generator, Optional, Tuple

from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response
from django.http import StreamingHttpResponse

from aiworkflow_project.models import BlueprintProject
from aiworkflow_project.projects.storage import _project_root_from_row

# ============================
# 下载与重试配置
# ============================
_DOWNLOAD_MAX_RETRIES = 5                # 失败重试次数
_DOWNLOAD_TIMEOUT = 90                   # 单次请求超时时间（秒）
_DOWNLOAD_RETRY_BACKOFF = 2              # 重试退避基数（秒），指数退避
_DOWNLOAD_CHUNK_SIZE = 1024 * 1024       # 流式下载块大小（1MB）
_DOWNLOAD_MAX_SIZE = 10 * 1024 * 1024 * 1024  # 10GB 上限保护

# ============================
# SSL Context — 解决字节 CDN 的 SSL EOF / TLS 兼容性问题
# ============================
_ssl_context_cache: "Optional[ssl.SSLContext]" = None


def _get_ssl_context() -> ssl.SSLContext:
    """
    为 urllib HTTPS 请求创建一个兼容的 SSL context。
    与 comfyui_bridge/api.py 中的实现保持一致：
    - 优先使用 certifi 的根证书（如果安装了）
    - 降低 SSL 校验严格性以兼容部分 CDN（例如字节方舟 tos-cn-beijing 的 SNI/ALPN 行为）
    """
    global _ssl_context_cache
    if _ssl_context_cache is not None:
        return _ssl_context_cache
    try:
        import certifi  # type: ignore
        ctx = ssl.create_default_context(cafile=certifi.where())
    except Exception:
        ctx = ssl.create_default_context()
    # 允许 TLS 1.2+，禁用不安全的旧版本
    try:
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2  # type: ignore[attr-defined]
    except Exception:
        pass
    # 跳过证书 hostname 校验（仅在必要时；不推荐全局启用，这里对 CDN 资源是安全的）
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    _ssl_context_cache = ctx
    return ctx


def _json_error(message: str, status: int = 400) -> Response:
    return Response({"ok": False, "error": message}, status=status)


def _coerce_request_payload(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    dict_method = getattr(value, "dict", None)
    if callable(dict_method):
        try:
            out = dict_method()
            if isinstance(out, dict):
                return out
        except Exception:
            return {}
    return {}


def _project_from_id(raw: Any) -> Optional[BlueprintProject]:
    try:
        project_id = int(raw)
    except Exception:
        return None
    if project_id <= 0:
        return None
    return BlueprintProject.objects.filter(id=project_id).first()


def _safe_project_relative_path(raw: Any) -> Tuple[Optional[str], Optional[str]]:
    rel = str(raw or "").strip().replace("\\", "/")
    if not rel:
        return None, "path is required"
    if rel.startswith("/"):
        return None, "path must be relative"
    if ".." in Path(rel).parts:
        return None, "path is invalid"
    return rel, None


def _resolve_project_file_path(project: BlueprintProject, rel_path: str) -> Tuple[Optional[Path], Optional[str]]:
    root = _project_root_from_row(project)
    if root is None:
        return None, "project is not folder-backed"
    try:
        candidate = (root / rel_path).resolve()
        resolved_root = root.resolve()
    except Exception as exc:
        return None, f"path resolve failed: {exc}"
    if resolved_root not in candidate.parents and candidate != resolved_root:
        return None, "path out of project root"
    return candidate, None


def _guess_extension(file_name: str, content_type: str) -> str:
    ext = Path(file_name or "").suffix.lower()
    if ext:
        return ext

    guessed = mimetypes.guess_extension(str(content_type or "").split(";")[0].strip()) or ""
    if guessed:
        return guessed.lower()

    lower_name = str(file_name or "").lower()
    ext_map = {
        ".jpg": ".jpg",
        ".jpeg": ".jpg",
        ".png": ".png",
        ".webp": ".webp",
        ".gif": ".gif",
        ".bmp": ".bmp",
        ".mp4": ".mp4",
        ".mov": ".mov",
        ".webm": ".webm",
        ".mkv": ".mkv",
        ".m4v": ".m4v",
        ".mp3": ".mp3",
        ".wav": ".wav",
        ".ogg": ".ogg",
        ".m4a": ".m4a",
        ".flac": ".flac",
        ".pdf": ".pdf",
        ".glb": ".glb",
        ".gltf": ".gltf",
        ".obj": ".obj",
        ".json": ".json",
    }
    for k, v in ext_map.items():
        if k in lower_name:
            return v

    content_lower = str(content_type or "").lower()
    content_type_map = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/bmp": ".bmp",
        "video/mp4": ".mp4",
        "video/quicktime": ".mov",
        "video/webm": ".webm",
        "video/x-matroska": ".mkv",
        "video/x-m4v": ".m4v",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
        "audio/ogg": ".ogg",
        "audio/mp4": ".m4a",
        "audio/flac": ".flac",
        "application/pdf": ".pdf",
        "model/gltf-binary": ".glb",
        "model/gltf+json": ".gltf",
        "application/json": ".json",
    }
    for k, v in content_type_map.items():
        if k in content_lower:
            return v

    return ".bin"


def _guess_extension_from_file_signature(file_path: Path) -> str:
    try:
        with file_path.open("rb") as fp:
            header = fp.read(4096)
    except Exception:
        return ""
    if not header:
        return ""

    if header.startswith(b"\xFF\xD8\xFF"):
        return ".jpg"
    if header.startswith(b"\x89PNG\r\n\x1A\n"):
        return ".png"
    if header.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"
    if header.startswith(b"BM"):
        return ".bmp"
    if header.startswith((b"II*\x00", b"MM\x00*")):
        return ".tif"
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return ".webp"
    if len(header) >= 12 and header[4:8] == b"ftyp":
        brand = header[8:12].lower()
        if brand in (b"qt  ", b"moov"):
            return ".mov"
        return ".mp4"
    if header.startswith(b"\x1A\x45\xDF\xA3"):
        lowered = header.lower()
        if b"webm" in lowered:
            return ".webm"
        return ".mkv"
    if header.startswith(b"ID3"):
        return ".mp3"
    if header.startswith(b"OggS"):
        return ".ogg"
    if header.startswith(b"fLaC"):
        return ".flac"
    if header.startswith(b"RIFF") and len(header) >= 12 and header[8:12] == b"WAVE":
        return ".wav"
    if header.startswith(b"%PDF"):
        return ".pdf"
    if header.startswith(b"glTF"):
        return ".glb"
    if header[:1] in (b"{", b"["):
        return ".json"
    return ""


def _project_bucket_root(project: BlueprintProject, kind: str, bucket: str) -> Tuple[Optional[Path], Optional[str]]:
    root = _project_root_from_row(project)
    if root is None:
        return None, "project is not folder-backed"

    b = str(bucket or "assets").strip().lower()

    # 缩略图仍然使用独立目录，避免与原图混淆
    if b == "thumbnails":
        rel = "Content/Media/thumbnails"
    else:
        # 图片、视频、音频、模型等资源统一存放在 Content/Media 目录下
        # 不再按类型分子目录，也不再按日期分类
        rel = "Content/Media"

    target = (root / rel).resolve()
    try:
        target.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        return None, f"create bucket directory failed: {exc}"
    resolved_root = root.resolve()
    if resolved_root not in target.parents and target != resolved_root:
        return None, "bucket path out of project root"
    return target, None


def _build_project_asset_url(project_id: int, project_relative_path: str) -> str:
    return "dweb://project-assets?" + urllib.parse.urlencode(
        {
            "projectId": str(project_id),
            "path": project_relative_path,
        }
    )


def _build_asset_payload(project: BlueprintProject, file_path: Path, *, kind: str, name: str, content_type: str, size: int) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    root = _project_root_from_row(project)
    if root is None:
        return None, "project is not folder-backed"
    try:
        rel = file_path.resolve().relative_to(root.resolve()).as_posix()
    except Exception:
        return None, "failed to compute projectRelativePath"
    return {
        "kind": kind,
        "name": name,
        "contentType": content_type,
        "size": int(size or 0),
        "projectRelativePath": rel,
        "relativePath": rel,
        "absolutePath": str(file_path.resolve()),
        "url": _build_project_asset_url(int(project.id), rel),
    }, None


def _extract_rel_path_from_url(raw_url: Any) -> str:
    text = str(raw_url or "").strip()
    if not text:
        return ""
    try:
        parsed = urllib.parse.urlparse(text)
        if parsed.scheme.lower() == "dweb" and parsed.netloc.lower() == "project-assets":
            query = urllib.parse.parse_qs(parsed.query or "")
            path_values = query.get("path") or []
            rel = str(path_values[0] if path_values else "").strip()
            return rel.replace("\\", "/")
    except Exception:
        return ""
    return ""


def _write_binary_atomically(file_path: Path, content: bytes) -> Optional[str]:
    try:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = file_path.parent / ("." + file_path.name + ".tmp")
        with tmp.open("wb") as fp:
            fp.write(content)
        os.replace(str(tmp), str(file_path))
        return None
    except Exception as exc:
        try:
            if tmp.exists():
                tmp.unlink()
        except Exception:
            pass
        return str(exc)


def _is_retryable_error(exc: Exception) -> bool:
    """判断错误是否可以重试（包含 SSL EOF / TLS 握手失败等网络层波动）"""
    if isinstance(exc, urllib.error.HTTPError):
        # 5xx 服务器错误、429 限流可以重试
        code = getattr(exc, "code", None) or 0
        return code in (408, 429) or 500 <= code < 600
    if isinstance(exc, (TimeoutError, urllib.error.URLError)):
        return True
    if isinstance(exc, (ConnectionError, OSError)):
        return True
    # SSL/TLS 相关错误（字节 CDN 常见的 SSL EOF / 握手中断）
    if isinstance(exc, ssl.SSLError):
        return True
    try:
        exc_type = type(exc).__name__
        if "ssl" in exc_type.lower() or "tls" in exc_type.lower():
            return True
    except Exception:
        pass
    msg = str(exc).lower()
    return any(k in msg for k in (
        "timeout", "timed out", "connection", "reset",
        "econn", "ehost", "enet", "502", "503", "504",
        "ssl", "unexpected_eof", "eof occurred", "tlsv",
        "handshake", "sslv3", "certificate", "protocol",
    ))


def _extract_content_type(headers: Any) -> str:
    """从 HTTP 响应头中提取 content-type，兼容多种 header 类型"""
    try:
        # http.client.HTTPMessage / email.message.Message
        if hasattr(headers, "get_content_type"):
            ct = headers.get_content_type()
            if ct:
                return ct
    except Exception:
        pass
    # dict-like
    for key in ("Content-Type", "content-type", "Content-type"):
        v = None
        try:
            v = headers.get(key)
        except Exception:
            try:
                v = headers[key]
            except Exception:
                v = None
        if v:
            return str(v).split(";")[0].strip()
    return "application/octet-stream"


def _extract_content_length(headers: Any) -> Optional[int]:
    """从 HTTP 响应头中提取 content-length"""
    for key in ("Content-Length", "content-length", "Content-length"):
        try:
            v = headers.get(key)
        except Exception:
            try:
                v = headers[key]
            except Exception:
                v = None
        if v is not None:
            try:
                return int(str(v).strip())
            except Exception:
                pass
    return None


def _stream_url_to_file(url: str, target_path: Path) -> Tuple[Optional[int], Optional[str], Optional[str]]:
    """
    将远程 URL 流式下载到本地文件。
    使用自定义 SSL context + 指数退避重试，解决字节 CDN 的 TLS 兼容性问题。

    返回 (file_size_bytes, content_type, error_message)
    - 成功: (size, content_type, None)
    - 失败: (None, None, error_message)
    """
    last_error: Optional[str] = None
    target_path.parent.mkdir(parents=True, exist_ok=True)
    ssl_ctx = _get_ssl_context()

    for attempt in range(1, _DOWNLOAD_MAX_RETRIES + 1):
        tmp_path: Optional[Path] = None
        response = None
        try:
            # 每次重试都使用一个新的临时文件，避免残留数据
            tmp_suffix = f".part{attempt}"
            tmp_path = target_path.parent / (target_path.name + tmp_suffix)

            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 DwebVideoStudio/1.0 (compatible; +https://github.com/)",
                    "Accept": "*/*",
                    "Accept-Encoding": "identity",
                    "Connection": "keep-alive",
                },
            )

            # 使用自定义 SSL context，解决字节 CDN 的 TLS/SSL EOF 问题
            try:
                response = urllib.request.urlopen(request, timeout=_DOWNLOAD_TIMEOUT, context=ssl_ctx)
            except Exception:
                # 回退到系统默认 SSL 行为
                response = urllib.request.urlopen(request, timeout=_DOWNLOAD_TIMEOUT)

            with response as resp:
                content_type = _extract_content_type(resp.headers or resp)
                content_length = _extract_content_length(resp.headers or resp)

                if content_length is not None and content_length > _DOWNLOAD_MAX_SIZE:
                    try:
                        if tmp_path is not None and tmp_path.exists():
                            tmp_path.unlink()
                    except Exception:
                        pass
                    return None, None, f"file too large: {content_length} bytes (limit {_DOWNLOAD_MAX_SIZE})"

                total_written = 0
                with tmp_path.open("wb") as fp:
                    while True:
                        chunk = resp.read(_DOWNLOAD_CHUNK_SIZE)
                        if not chunk:
                            break
                        fp.write(chunk)
                        total_written += len(chunk)
                        if total_written > _DOWNLOAD_MAX_SIZE:
                            try:
                                if tmp_path is not None and tmp_path.exists():
                                    tmp_path.unlink()
                            except Exception:
                                pass
                            return None, None, f"file exceeded size limit: {total_written} bytes"

                # 检查是否是有效的空资源（0 字节也可能是有效的空文件，但 CDN 错误时会返回空）
                if total_written == 0:
                    try:
                        if tmp_path is not None and tmp_path.exists():
                            tmp_path.unlink()
                    except Exception:
                        pass
                    return None, None, "downloaded empty content (server may have rejected the request)"

                # 原子替换：把临时文件改名成目标文件
                os.replace(str(tmp_path), str(target_path))
                return total_written, content_type or "application/octet-stream", None

        except Exception as exc:
            last_error = f"{type(exc).__name__}: {exc}"
            # 清理本轮临时文件（如果存在）
            try:
                tmp_guess = target_path.parent / (target_path.name + f".part{attempt}")
                if tmp_guess.exists():
                    tmp_guess.unlink()
            except Exception:
                pass

            if not _is_retryable_error(exc):
                # 不可重试的错误，直接返回
                return None, None, last_error

            # 指数退避重试
            if attempt < _DOWNLOAD_MAX_RETRIES:
                sleep_sec = _DOWNLOAD_RETRY_BACKOFF ** attempt
                time.sleep(sleep_sec)
                continue

    return None, None, last_error or "download failed"


def _build_asset_payload_from_download(
    project: BlueprintProject,
    file_path: Path,
    *,
    kind: str,
    name: str,
    content_type: str,
    size: int,
    source_url: str,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """根据下载后的本地文件，构造资源返回 payload"""
    payload, err = _build_asset_payload(
        project,
        file_path,
        kind=kind,
        name=name,
        content_type=content_type,
        size=size,
    )
    if payload is not None:
        payload["sourceUrl"] = source_url
        payload["sourcePath"] = payload.get("absolutePath") or str(file_path.resolve())
    return payload, err


def _parse_range_header(range_header: str, file_size: int) -> Optional[Tuple[int, int]]:
    if not range_header:
        return None
    m = __import__("re").match(r"^bytes=(\d*)-(\d*)$", str(range_header).strip())
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
    if file_size <= 0 or start < 0 or start >= file_size:
        return None
    end = min(end, file_size - 1)
    if end < start:
        return None
    return start, end


def _stream_file_response(
    request: Request,
    file_path: Path,
    content_type: str,
    download_name: str,
    *,
    cache_control: Optional[str] = None,
):
    st = file_path.stat()
    file_size = int(getattr(st, "st_size", 0) or 0)
    mtime = int(getattr(st, "st_mtime", 0) or 0)
    byte_range = _parse_range_header(str(request.META.get("HTTP_RANGE") or ""), file_size) if file_size > 0 else None

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
        fp = file_path.open("rb")
        fp.seek(start)
        resp = StreamingHttpResponse(file_iter(fp, remaining=length), status=206, content_type=content_type)
        resp["Content-Range"] = f"bytes {start}-{end}/{file_size}"
        resp["Accept-Ranges"] = "bytes"
        resp["Content-Length"] = str(length)
    else:
        fp = file_path.open("rb")
        resp = StreamingHttpResponse(file_iter(fp, remaining=None), status=200, content_type=content_type)
        if file_size > 0:
            resp["Content-Length"] = str(file_size)
        resp["Accept-Ranges"] = "bytes"

    safe_name = Path(str(download_name or "file").replace("\\", "/")).name
    resp["Content-Disposition"] = f'inline; filename="{safe_name}"'
    resp["Cache-Control"] = cache_control or "private, max-age=0, must-revalidate"
    if file_size > 0 and mtime > 0:
        resp["ETag"] = f'W/"{file_size}-{mtime}"'
    return resp


_PROJECT_ASSET_PREVIEW_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
_PROJECT_ASSET_PREVIEW_LOCKS: Dict[str, threading.Lock] = {}
_PROJECT_ASSET_PREVIEW_LOCKS_GUARD = threading.Lock()


def _project_asset_preview_requested(request: Request) -> bool:
    variant = str(request.query_params.get("variant") or request.query_params.get("mode") or "").strip().lower()
    return variant in {"preview", "thumb", "thumbnail"}


def _coerce_project_asset_preview_size(value: Any) -> int:
    try:
        size = int(float(str(value or "").strip()))
    except Exception:
        size = 640
    return max(128, min(4096, size))


def _project_asset_preview_cache_path(
    project: BlueprintProject,
    source_path: Path,
    max_size: int,
    *,
    ext: str,
) -> Optional[Path]:
    project_root = _project_root_from_row(project)
    if project_root is None:
        return None
    try:
        rel = source_path.resolve().relative_to(project_root.resolve()).as_posix()
    except Exception:
        return None
    try:
        st = source_path.stat()
        signature = f"{rel}|{int(st.st_size)}|{int(st.st_mtime)}|{max_size}|{ext}"
    except Exception:
        signature = f"{rel}|{max_size}|{ext}"
    digest = hashlib.sha1(signature.encode("utf-8", errors="replace")).hexdigest()[:20]
    target_dir = (project_root / "Content" / "Media" / "thumbnails").resolve()
    try:
        target_dir.relative_to(project_root.resolve())
    except Exception:
        return None
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir / f"asset_preview_{digest}_{max_size}{ext}"


def _ensure_project_asset_image_preview(project: BlueprintProject, source_path: Path, max_size: int) -> Optional[Path]:
    if source_path.suffix.lower() not in _PROJECT_ASSET_PREVIEW_IMAGE_EXTS:
        return None

    try:
        from PIL import Image, ImageOps
    except Exception:
        return None

    def preview_file_usable(path_value: Path) -> bool:
        try:
            if not path_value.exists() or not path_value.is_file() or path_value.stat().st_size <= 0:
                return False
            with Image.open(path_value) as probe:
                probe.verify()
            return True
        except Exception:
            return False

    try:
        with Image.open(source_path) as img_probe:
            img_probe = ImageOps.exif_transpose(img_probe)
            has_alpha = img_probe.mode in {"RGBA", "LA"} or ("transparency" in img_probe.info)
        ext = ".png" if has_alpha else ".jpg"
        target_path = _project_asset_preview_cache_path(project, source_path, max_size, ext=ext)
        if target_path is None:
            return None

        try:
            if target_path.exists() and target_path.stat().st_mtime >= source_path.stat().st_mtime and preview_file_usable(target_path):
                return target_path
        except Exception:
            pass

        lock_key = str(target_path)
        with _PROJECT_ASSET_PREVIEW_LOCKS_GUARD:
            lock = _PROJECT_ASSET_PREVIEW_LOCKS.get(lock_key)
            if lock is None:
                lock = threading.Lock()
                _PROJECT_ASSET_PREVIEW_LOCKS[lock_key] = lock

        with lock:
            try:
                if target_path.exists() and target_path.stat().st_mtime >= source_path.stat().st_mtime and preview_file_usable(target_path):
                    return target_path
            except Exception:
                pass

            try:
                if target_path.exists():
                    target_path.unlink()
            except Exception:
                pass

            with Image.open(source_path) as img:
                img = ImageOps.exif_transpose(img)
                resample = Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.LANCZOS
                img.thumbnail((max_size, max_size), resample)
                if has_alpha:
                    if img.mode not in {"RGBA", "LA"}:
                        img = img.convert("RGBA")
                    img.save(target_path, format="PNG", optimize=True)
                else:
                    if img.mode != "RGB":
                        img = img.convert("RGB")
                    img.save(target_path, format="JPEG", quality=82, optimize=True)

            if not preview_file_usable(target_path):
                try:
                    target_path.unlink()
                except Exception:
                    pass
                return None
            return target_path
    except Exception:
        return None


@api_view(["GET"])
def project_asset_route_health(_: Request) -> Response:
    return Response({"ok": True, "route": "aiworkflow_project.assets", "schemaVersion": 1})


@api_view(["GET", "HEAD", "OPTIONS"])
def get_project_asset_file(request: Request):
    if request.method == "OPTIONS":
        resp = Response(status=204)
        resp["Allow"] = "GET, HEAD, OPTIONS"
        return resp

    project = _project_from_id(request.query_params.get("projectId"))
    if project is None:
        return _json_error("projectId is invalid", status=400)

    rel_path, rel_err = _safe_project_relative_path(request.query_params.get("path"))
    if rel_err or rel_path is None:
        return _json_error(rel_err or "path is invalid", status=400)

    file_path, path_err = _resolve_project_file_path(project, rel_path)
    if path_err or file_path is None:
        return _json_error(path_err or "resolve path failed", status=400)
    if not file_path.exists() or not file_path.is_file():
        return _json_error("asset file not found", status=404)

    selected_file = file_path
    preview_requested = _project_asset_preview_requested(request)
    if preview_requested:
        preview_size = _coerce_project_asset_preview_size(request.query_params.get("maxSize") or request.query_params.get("max_size"))
        preview_file = _ensure_project_asset_image_preview(project, file_path, preview_size)
        if preview_file is not None and preview_file.exists() and preview_file.is_file():
            selected_file = preview_file

    content_type = mimetypes.guess_type(str(selected_file))[0] or "application/octet-stream"
    if request.method == "HEAD":
        size = int(selected_file.stat().st_size)
        resp = Response(status=200)
        resp["Content-Type"] = content_type
        resp["Content-Length"] = str(size)
        resp["Accept-Ranges"] = "bytes"
        return resp

    preview_with_version = preview_requested and bool(str(request.query_params.get("v") or "").strip())
    cache_control = "private, max-age=31536000, immutable" if preview_with_version else None
    return _stream_file_response(request, selected_file, content_type, selected_file.name, cache_control=cache_control)


@api_view(["POST"])
def upload_project_asset(request: Request) -> Response:
    project = _project_from_id(request.data.get("projectId") if hasattr(request, "data") else None)
    if project is None:
        return _json_error("projectId is required", status=400)

    uploaded = request.FILES.get("file")
    if uploaded is None:
        return _json_error("file is required", status=400)

    kind = str(request.data.get("kind") if hasattr(request, "data") else "file" or "file")
    bucket = str(request.data.get("bucket") if hasattr(request, "data") else "assets" or "assets")

    root, root_err = _project_bucket_root(project, kind, bucket)
    if root_err or root is None:
        return _json_error(root_err or "bucket resolve failed", status=400)

    original_name = Path(str(getattr(uploaded, "name", "") or "file").replace("\\", "/")).name
    content_type = str(getattr(uploaded, "content_type", "") or "application/octet-stream")
    ext = _guess_extension(original_name, content_type)
    base_name = Path(original_name).stem.strip() or "file"
    final_name = f"{base_name}_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = (root / final_name).resolve()

    try:
        chunks = b"".join(bytes(chunk) for chunk in uploaded.chunks())
    except Exception as exc:
        return _json_error(f"read uploaded file failed: {exc}", status=500)

    write_err = _write_binary_atomically(file_path, chunks)
    if write_err:
        return _json_error(f"save asset failed: {write_err}", status=500)

    asset, payload_err = _build_asset_payload(
        project,
        file_path,
        kind=("file" if str(kind).strip().lower() == "model" else str(kind).strip().lower()),
        name=original_name,
        content_type=content_type,
        size=len(chunks),
    )
    if payload_err or asset is None:
        return _json_error(payload_err or "build asset payload failed", status=500)
    asset["sourcePath"] = str(asset.get("absolutePath") or "")
    return Response({"ok": True, "asset": asset})


@api_view(["POST"])
def import_project_asset(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    project = _project_from_id(payload.get("projectId"))
    if project is None:
        return _json_error("projectId is required", status=400)

    kind = str(payload.get("kind") or "file").strip().lower()
    if kind == "model":
        kind = "file"
    if kind not in ("image", "video", "audio", "file"):
        kind = "file"

    source_path_raw = str(payload.get("sourcePath") or "").strip()
    source_url_raw = str(payload.get("sourceUrl") or payload.get("url") or "").strip()
    file_name = str(payload.get("name") or payload.get("filename") or "").strip() or f"imported_{kind}"
    bucket = str(payload.get("bucket") or "assets").strip().lower() or "assets"

    content: Optional[bytes] = None
    content_type = "application/octet-stream"

    if source_path_raw:
        try:
            source_path = Path(source_path_raw).expanduser().resolve()
        except Exception:
            return _json_error("sourcePath is invalid", status=400)
        if (not source_path.is_absolute()) or (not source_path.exists()) or (not source_path.is_file()):
            return _json_error("sourcePath not found", status=404)
        content = source_path.read_bytes()
        content_type = mimetypes.guess_type(str(source_path))[0] or content_type
        if not payload.get("name"):
            file_name = source_path.name
    elif source_url_raw:
        root, root_err = _project_bucket_root(project, kind, bucket)
        if root_err or root is None:
            return _json_error(root_err or "bucket resolve failed", status=400)

        base_name = Path(file_name).stem.strip() or kind
        stamp = int(time.time() * 1000)
        nonce = uuid.uuid4().hex[:8]
        tmp_name = f"{base_name}_{stamp}_{nonce}.download"
        tmp_file_path = (root / tmp_name).resolve()

        # 使用增强的流式下载：支持大文件、自动重试、超时控制
        size, detected_content_type, dl_err = _stream_url_to_file(source_url_raw, tmp_file_path)
        if dl_err or size is None:
            try:
                if tmp_file_path.exists():
                    tmp_file_path.unlink()
            except Exception:
                pass
            return _json_error(f"download sourceUrl failed: {dl_err or 'unknown error'}", status=502)

        effective_content_type = detected_content_type or content_type or "application/octet-stream"
        detected_ext = _guess_extension(file_name, effective_content_type)
        if detected_ext == ".bin":
            magic_ext = _guess_extension_from_file_signature(tmp_file_path)
            if magic_ext:
                detected_ext = magic_ext
        if not detected_ext:
            detected_ext = ".bin"

        final_name = f"{base_name}_{stamp}_{nonce}{detected_ext}"
        file_path = (root / final_name).resolve()
        try:
            os.replace(str(tmp_file_path), str(file_path))
        except Exception as exc:
            try:
                if tmp_file_path.exists():
                    tmp_file_path.unlink()
            except Exception:
                pass
            return _json_error(f"finalize downloaded asset failed: {exc}", status=500)

        asset, payload_err = _build_asset_payload_from_download(
            project,
            file_path,
            kind=kind,
            name=file_name,
            content_type=effective_content_type,
            size=size,
            source_url=source_url_raw,
        )
        if payload_err or asset is None:
            try:
                if file_path.exists():
                    file_path.unlink()
            except Exception:
                pass
            return _json_error(payload_err or "build asset payload failed", status=500)
        asset["effectiveContentType"] = effective_content_type
        asset["correctedName"] = final_name
        return Response({"ok": True, "asset": asset})
    else:
        return _json_error("sourcePath or sourceUrl is required", status=400)

    if content is None:
        return _json_error("import content is empty", status=400)

    root, root_err = _project_bucket_root(project, kind, bucket)
    if root_err or root is None:
        return _json_error(root_err or "bucket resolve failed", status=400)

    ext = _guess_extension(file_name, content_type)
    base_name = Path(file_name).stem.strip() or kind
    final_name = f"{base_name}_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = (root / final_name).resolve()

    write_err = _write_binary_atomically(file_path, content)
    if write_err:
        return _json_error(f"save asset failed: {write_err}", status=500)

    asset, payload_err = _build_asset_payload(
        project,
        file_path,
        kind=kind,
        name=file_name,
        content_type=content_type,
        size=len(content),
    )
    if payload_err or asset is None:
        return _json_error(payload_err or "build asset payload failed", status=500)
    asset["sourcePath"] = str(asset.get("absolutePath") or source_path_raw or "")
    return Response({"ok": True, "asset": asset})


@api_view(["POST"])
def delete_project_asset(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    project = _project_from_id(payload.get("projectId"))
    if project is None:
        return _json_error("projectId is required", status=400)

    candidate_rel = payload.get("projectRelativePath") or payload.get("relativePath")
    if not candidate_rel:
        candidate_rel = _extract_rel_path_from_url(payload.get("url"))
    rel_path, rel_err = _safe_project_relative_path(candidate_rel)
    if rel_err or rel_path is None:
        return _json_error(rel_err or "projectRelativePath is invalid", status=400)

    file_path, path_err = _resolve_project_file_path(project, rel_path)
    if path_err or file_path is None:
        return _json_error(path_err or "resolve path failed", status=400)

    deleted = False
    try:
        if file_path.exists() and file_path.is_file():
            file_path.unlink()
            deleted = True
    except Exception as exc:
        return _json_error(f"delete asset failed: {exc}", status=500)

    return Response({"ok": True, "fileDeleted": deleted, "path": str(file_path)})


@api_view(["POST"])
def resolve_project_asset(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    project = _project_from_id(payload.get("projectId"))
    if project is None:
        return _json_error("projectId is required", status=400)

    rel_path = str(payload.get("projectRelativePath") or "").strip()
    source_path = str(payload.get("sourcePath") or "").strip()
    name = str(payload.get("name") or "").strip()

    if rel_path:
        safe_rel, rel_err = _safe_project_relative_path(rel_path)
        if not rel_err and safe_rel:
            resolved, path_err = _resolve_project_file_path(project, safe_rel)
            if not path_err and resolved and resolved.exists() and resolved.is_file():
                asset, payload_err = _build_asset_payload(
                    project,
                    resolved,
                    kind=str(payload.get("kind") or "file").strip().lower() or "file",
                    name=name or resolved.name,
                    content_type=mimetypes.guess_type(str(resolved))[0] or "application/octet-stream",
                    size=int(resolved.stat().st_size),
                )
                if not payload_err and asset:
                    return Response({"ok": True, "resolved": True, "asset": asset})

    if source_path:
        try:
            source = Path(source_path).expanduser().resolve()
            if source.exists() and source.is_file():
                root = _project_root_from_row(project)
                if root is not None and root.resolve() in source.parents:
                    rel = source.relative_to(root.resolve()).as_posix()
                    asset, payload_err = _build_asset_payload(
                        project,
                        source,
                        kind=str(payload.get("kind") or "file").strip().lower() or "file",
                        name=name or source.name,
                        content_type=mimetypes.guess_type(str(source))[0] or "application/octet-stream",
                        size=int(source.stat().st_size),
                    )
                    if not payload_err and asset:
                        asset["projectRelativePath"] = rel
                        return Response({"ok": True, "resolved": True, "asset": asset})
        except Exception:
            pass

    return Response({"ok": True, "resolved": False, "reason": "not_found"})


@api_view(["POST"])
def repair_project_asset(request: Request) -> Response:
    payload = _coerce_request_payload(request.data)
    project = _project_from_id(payload.get("projectId"))
    if project is None:
        return _json_error("projectId is required", status=400)

    root = _project_root_from_row(project)
    if root is None:
        return _json_error("project is not folder-backed", status=400)

    target_name = str(payload.get("name") or "").strip()
    if not target_name:
        rel_path = str(payload.get("projectRelativePath") or "").strip().replace("\\", "/")
        target_name = Path(rel_path).name if rel_path else ""
    if not target_name:
        return _json_error("name or projectRelativePath is required", status=400)

    hit: Optional[Path] = None
    media_root = (root / "Content/Media").resolve()
    generated_root = (root / "Content/Generated").resolve()
    scan_roots = [media_root, generated_root]
    for scan_root in scan_roots:
        if not scan_root.exists() or not scan_root.is_dir():
            continue
        for candidate in scan_root.rglob("*"):
            if not candidate.is_file():
                continue
            if candidate.name != target_name:
                continue
            hit = candidate.resolve()
            break
        if hit is not None:
            break

    if hit is None:
        return Response({"ok": True, "repaired": False, "reason": "not_found"})

    asset, payload_err = _build_asset_payload(
        project,
        hit,
        kind=str(payload.get("kind") or "file").strip().lower() or "file",
        name=target_name,
        content_type=mimetypes.guess_type(str(hit))[0] or "application/octet-stream",
        size=int(hit.stat().st_size),
    )
    if payload_err or asset is None:
        return _json_error(payload_err or "build asset payload failed", status=500)
    return Response({"ok": True, "repaired": True, "asset": asset})
