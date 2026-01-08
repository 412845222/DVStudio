from __future__ import annotations

import json
import io
import os
import subprocess
import threading
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from queue import Queue
from typing import Any, Dict, Optional

from django.http import FileResponse, JsonResponse, StreamingHttpResponse
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response


@dataclass
class ExportJob:
    jobId: str
    status: str  # queued|running|done|error
    progress: int
    format: str  # mp4|mov
    width: int = 0
    height: int = 0
    fps: int = 30
    frameCount: int = 0
    receivedFrames: int = 0
    uploadMode: str = "disk"  # disk|pipe
    ignoreStageBackground: bool = False
    quality: Optional[str] = None  # high|medium|low（pipe 模式需要在启动 ffmpeg 前确定）
    fileName: Optional[str] = None
    downloadUrl: Optional[str] = None
    serverPath: Optional[str] = None
    error: Optional[str] = None


_EXPORT_JOBS: Dict[str, ExportJob] = {}
_EXPORT_JOB_LOCK = threading.Lock()
_EXPORT_SUBSCRIBERS: Dict[str, list[Queue[str]]] = {}
_EXPORT_RECEIVED: Dict[str, set[int]] = {}
_EXPORT_ENCODE_STARTED: set[str] = set()


@dataclass
class _PipeEncoder:
    proc: subprocess.Popen
    stdin_lock: threading.Lock
    ingress_lock: threading.Lock
    out_path: Path
    duration_us: int
    last_pct: int = -1
    stdin_closed: bool = False
    next_index: int = 0
    pending: Dict[int, bytes] = field(default_factory=dict)
    pending_bytes: int = 0
    max_pending_bytes: int = 0


_EXPORT_PIPE_ENCODERS: Dict[str, _PipeEncoder] = {}


def _env_int(name: str, default: int) -> int:
    try:
        return int(str(os.environ.get(name, str(default))).strip())
    except Exception:
        return default


def _pipe_max_pending_bytes() -> int:
    # Bound memory usage for out-of-order buffering.
    # Default: 512MB.
    mb = max(32, _env_int("DWEB_EXPORT_PIPE_PENDING_MB", 512))
    return int(mb) * 1024 * 1024


def _pipe_batch_max_frames() -> int:
    # Limit frames per HTTP request to avoid overly large bodies.
    # Default: 8 frames.
    return max(1, _env_int("DWEB_EXPORT_PIPE_BATCH_MAX_FRAMES", 8))


def _pipe_batch_max_bytes() -> int:
    # Default: 64MB.
    mb = max(4, _env_int("DWEB_EXPORT_PIPE_BATCH_MAX_MB", 64))
    return int(mb) * 1024 * 1024


def _quality_or_default(v: Any) -> str:
    s = str(v or "").strip().lower()
    if s in ("high", "medium", "low"):
        return s
    return "medium"


def _exports_dir() -> Path:
    # Keep exports near the Django project for dev use.
    base = Path(__file__).resolve().parent.parent  # django-app/
    out = base / ".dweb_exports"
    out.mkdir(parents=True, exist_ok=True)
    return out


def _job_dir(job_id: str) -> Path:
    d = _exports_dir() / job_id
    d.mkdir(parents=True, exist_ok=True)
    (d / "frames").mkdir(parents=True, exist_ok=True)
    return d


def _new_job_id() -> str:
    return f"exp-{int(time.time() * 1000)}-{os.urandom(3).hex()}"


def _json_error(message: str, status: int = 400) -> Response:
    return Response({"error": message}, status=status)


def _parse_bool(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if v is None:
        return False
    if isinstance(v, (int, float)):
        return bool(v)
    if isinstance(v, str):
        s = v.strip().lower()
        if s in ("1", "true", "yes", "y", "on"):
            return True
        if s in ("0", "false", "no", "n", "off", ""):
            return False
    return bool(v)


def _sse_send(job_id: str, payload: dict) -> None:
    data = json.dumps(payload, ensure_ascii=False)
    msg = f"event: progress\ndata: {data}\n\n"
    with _EXPORT_JOB_LOCK:
        subs = list(_EXPORT_SUBSCRIBERS.get(job_id, []))
    for q in subs:
        try:
            q.put_nowait(msg)
        except Exception:
            # best-effort
            pass


def _job_public(job: ExportJob) -> dict:
    # Keep shape close to frontend types.
    out = asdict(job)
    # progress: use encoding progress (0..100)
    out["progress"] = int(max(0, min(100, int(job.progress or 0))))
    return out


def _has_ffmpeg() -> bool:
    try:
        p = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True)
        return p.returncode == 0
    except Exception:
        return False


_FFMPEG_ENCODER_CACHE: dict[str, bool] = {}


_FFMPEG_X265_ALPHA_CACHE: Optional[bool] = None


def _ffmpeg_has_encoder(name: str) -> bool:
    key = (name or "").strip().lower()
    if not key:
        return False
    hit = _FFMPEG_ENCODER_CACHE.get(key)
    if hit is not None:
        return hit
    try:
        p = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True)
        ok = p.returncode == 0 and (f" {key}" in (p.stdout or "").lower())
        _FFMPEG_ENCODER_CACHE[key] = ok
        return ok
    except Exception:
        _FFMPEG_ENCODER_CACHE[key] = False
        return False


def _ffprobe_pix_fmt(path: Path) -> str:
    try:
        p = subprocess.run(
            [
                "ffprobe",
                "-hide_banner",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=pix_fmt",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            text=True,
        )
        if p.returncode != 0:
            return ""
        return (p.stdout or "").strip()
    except Exception:
        return ""


def _ffmpeg_x265_supports_alpha() -> bool:
    """Return True only if libx265 output keeps yuva* pixel format.

    Some FFmpeg/libx265 builds accept -pix_fmt yuva420p10le but still output yuv420p10le
    (alpha silently dropped). We probe once and cache.
    """

    global _FFMPEG_X265_ALPHA_CACHE
    if _FFMPEG_X265_ALPHA_CACHE is not None:
        return bool(_FFMPEG_X265_ALPHA_CACHE)

    if not _has_ffmpeg() or not _ffmpeg_has_encoder("libx265"):
        _FFMPEG_X265_ALPHA_CACHE = False
        return False

    try:
        tmp_dir = _exports_dir() / ".probe"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        out_path = (tmp_dir / "probe_x265_alpha.mov").resolve()

        cmd = [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=color=black@0.0:s=2x2:r=1,format=rgba",
            "-frames:v",
            "1",
            "-c:v",
            "libx265",
            "-pix_fmt",
            "yuva420p10le",
            "-tag:v",
            "hvc1",
            str(out_path),
        ]
        p = subprocess.run(cmd, capture_output=True, text=True)
        if p.returncode != 0:
            _FFMPEG_X265_ALPHA_CACHE = False
            return False

        pix_fmt = _ffprobe_pix_fmt(out_path)
        ok = pix_fmt.lower().startswith("yuva")
        _FFMPEG_X265_ALPHA_CACHE = bool(ok)
        return bool(ok)
    except Exception:
        _FFMPEG_X265_ALPHA_CACHE = False
        return False


def _duration_us(frame_count: int, fps: int) -> int:
    try:
        return int(max(1, frame_count) * 1_000_000 / max(1, fps))
    except Exception:
        return 1


def _pct_from_out_time_us(out_us: int, duration_us: int) -> int:
    try:
        return int(max(0, min(100, round(out_us * 100 / max(1, duration_us)))))
    except Exception:
        return 0


def _parse_out_time_to_us(v: str) -> Optional[int]:
    v = (v or "").strip()
    if not v:
        return None
    try:
        if v.isdigit() or (v.startswith("-") and v[1:].isdigit()):
            return int(v)
    except Exception:
        pass
    try:
        parts = v.split(":")
        if len(parts) != 3:
            return None
        hh = int(parts[0])
        mm = int(parts[1])
        ss = float(parts[2])
        total = (hh * 3600 + mm * 60 + ss) * 1_000_000
        return int(total)
    except Exception:
        return None


def _start_pipe_encoder(job_id: str) -> None:
    job_id = str(job_id or "").strip()
    if not job_id:
        return

    with _EXPORT_JOB_LOCK:
        job = _EXPORT_JOBS.get(job_id)
        if not job:
            return
        if job_id in _EXPORT_PIPE_ENCODERS:
            return

    if not _has_ffmpeg():
        with _EXPORT_JOB_LOCK:
            job2 = _EXPORT_JOBS.get(job_id)
            if not job2:
                return
            job2.status = "error"
            job2.error = "未找到 ffmpeg：请确保已安装并在 PATH 中可用"
        _sse_send(job_id, _job_public(job2))
        return

    with _EXPORT_JOB_LOCK:
        job2 = _EXPORT_JOBS.get(job_id)
        if not job2:
            return
        fmt = job2.format
        fps = max(1, int(job2.fps or 30))
        frame_count = max(1, int(job2.frameCount or 1))
        w = max(1, int(job2.width or 1))
        h = max(1, int(job2.height or 1))
        ignore_stage_bg = bool(getattr(job2, "ignoreStageBackground", False))
        quality = _quality_or_default(getattr(job2, "quality", None))

    export_dir = _job_dir(job_id)
    out_name = f"{job_id}.{fmt}"
    out_path = (export_dir / out_name).resolve()

    # For piping mode we cannot retry with fallback encoders (frames are not stored).
    # Prefer the most compatible choice.
    cmd: list[str] = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "-video_size",
        f"{w}x{h}",
        "-framerate",
        str(fps),
        "-i",
        "pipe:0",
    ]

    if fmt == "mov" and ignore_stage_bg:
        # Transparent MOV: prefer HEVC-with-alpha only if our ffmpeg/libx265 truly preserves alpha.
        # Otherwise force ProRes 4444 (reliable alpha).
        if _ffmpeg_x265_supports_alpha():
            crf = "24"
            if quality == "high":
                crf = "18"
            elif quality == "low":
                crf = "30"
            cmd += [
                "-c:v",
                "libx265",
                "-pix_fmt",
                "yuva420p10le",
                "-preset",
                "medium",
                "-crf",
                crf,
                "-tag:v",
                "hvc1",
                "-movflags",
                "+faststart",
            ]
        else:
            qscale = "14"
            if quality == "high":
                qscale = "8"
            elif quality == "low":
                qscale = "28"
            cmd += [
                "-c:v",
                "prores_ks",
                "-profile:v",
                "4",
                "-pix_fmt",
                "yuva444p10le",
                "-qscale:v",
                qscale,
            ]
    else:
        crf = "23"
        if quality == "high":
            crf = "18"
        elif quality == "low":
            crf = "28"
        cmd += [
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            crf,
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
        ]

    cmd += [
        "-progress",
        "pipe:1",
        "-nostats",
        str(out_path),
    ]

    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=0,
        )
    except Exception as e:
        with _EXPORT_JOB_LOCK:
            job3 = _EXPORT_JOBS.get(job_id)
            if not job3:
                return
            job3.status = "error"
            job3.error = f"启动 ffmpeg 失败：{e}"
        _sse_send(job_id, _job_public(job3))
        return

    encoder = _PipeEncoder(
        proc=proc,
        stdin_lock=threading.Lock(),
        ingress_lock=threading.Lock(),
        out_path=out_path,
        duration_us=_duration_us(frame_count, fps),
        max_pending_bytes=_pipe_max_pending_bytes(),
    )
    with _EXPORT_JOB_LOCK:
        _EXPORT_PIPE_ENCODERS[job_id] = encoder
        job4 = _EXPORT_JOBS.get(job_id)
        if job4:
            job4.status = "running"
            job4.progress = 0
    _sse_send(job_id, _job_public(_EXPORT_JOBS[job_id]))

    def worker() -> None:
        tail: list[str] = []
        try:
            if proc.stdout is not None:
                stdout_text = io.TextIOWrapper(proc.stdout, encoding="utf-8", errors="ignore", newline="\n")
                for raw in stdout_text:
                    s = (raw or "").strip("\n")
                    if s:
                        tail.append(s)
                        if len(tail) > 120:
                            tail = tail[-120:]
                    line = (raw or "").strip()
                    if not line or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip()
                    if k == "out_time_us":
                        try:
                            out_us = int(v)
                        except Exception:
                            continue
                        pct = _pct_from_out_time_us(out_us, encoder.duration_us)
                        if pct != encoder.last_pct:
                            encoder.last_pct = pct
                            with _EXPORT_JOB_LOCK:
                                jobx = _EXPORT_JOBS.get(job_id)
                                if jobx:
                                    jobx.progress = pct
                            with _EXPORT_JOB_LOCK:
                                jobx = _EXPORT_JOBS.get(job_id)
                            if jobx:
                                _sse_send(job_id, _job_public(jobx))
                    elif k == "out_time_ms":
                        try:
                            out_ms = int(v)
                        except Exception:
                            continue
                        pct = _pct_from_out_time_us(out_ms * 1000, encoder.duration_us)
                        if pct != encoder.last_pct:
                            encoder.last_pct = pct
                            with _EXPORT_JOB_LOCK:
                                jobx = _EXPORT_JOBS.get(job_id)
                                if jobx:
                                    jobx.progress = pct
                            with _EXPORT_JOB_LOCK:
                                jobx = _EXPORT_JOBS.get(job_id)
                            if jobx:
                                _sse_send(job_id, _job_public(jobx))
                    elif k == "out_time":
                        out_us = _parse_out_time_to_us(v)
                        if out_us is None:
                            continue
                        pct = _pct_from_out_time_us(out_us, encoder.duration_us)
                        if pct != encoder.last_pct:
                            encoder.last_pct = pct
                            with _EXPORT_JOB_LOCK:
                                jobx = _EXPORT_JOBS.get(job_id)
                                if jobx:
                                    jobx.progress = pct
                            with _EXPORT_JOB_LOCK:
                                jobx = _EXPORT_JOBS.get(job_id)
                            if jobx:
                                _sse_send(job_id, _job_public(jobx))
                    elif k == "progress" and v == "end":
                        with _EXPORT_JOB_LOCK:
                            jobx = _EXPORT_JOBS.get(job_id)
                            if jobx:
                                jobx.progress = max(int(jobx.progress or 0), 100)
                        with _EXPORT_JOB_LOCK:
                            jobx = _EXPORT_JOBS.get(job_id)
                        if jobx:
                            _sse_send(job_id, _job_public(jobx))
        except Exception:
            # best-effort: progress parsing shouldn't crash encoding
            pass

        rc = -1
        try:
            rc = proc.wait()
        except Exception:
            rc = -1

        with _EXPORT_JOB_LOCK:
            _EXPORT_PIPE_ENCODERS.pop(job_id, None)
            jobf = _EXPORT_JOBS.get(job_id)

        if not jobf:
            return

        if rc == 0 and out_path.exists():
            with _EXPORT_JOB_LOCK:
                jobf = _EXPORT_JOBS.get(job_id)
                if not jobf:
                    return
                jobf.status = "done"
                jobf.progress = 100
                jobf.fileName = out_name
                jobf.serverPath = str(out_path)
                jobf.downloadUrl = f"/api/export/jobs/{job_id}/file"
            _sse_send(job_id, _job_public(jobf))
            return

        err_tail = "\n".join(tail[-60:]).strip()
        with _EXPORT_JOB_LOCK:
            jobf = _EXPORT_JOBS.get(job_id)
            if not jobf:
                return
            jobf.status = "error"
            jobf.error = (err_tail or f"ffmpeg 退出码：{rc}")[:4000]
        _sse_send(job_id, _job_public(jobf))

    t = threading.Thread(target=worker, name=f"export-pipe-encode-{job_id}", daemon=True)
    t.start()


def _start_encode_if_ready(job_id: str) -> None:
    with _EXPORT_JOB_LOCK:
        job = _EXPORT_JOBS.get(job_id)
        if not job:
            return
        if job_id in _EXPORT_ENCODE_STARTED:
            return
        if job.frameCount <= 0 or job.receivedFrames < job.frameCount:
            return
        _EXPORT_ENCODE_STARTED.add(job_id)

    def worker():
        with _EXPORT_JOB_LOCK:
            job2 = _EXPORT_JOBS.get(job_id)
            if not job2:
                return
            job2.status = "running"
            job2.progress = 0
        _sse_send(job_id, _job_public(job2))

        if not _has_ffmpeg():
            with _EXPORT_JOB_LOCK:
                job2 = _EXPORT_JOBS.get(job_id)
                if not job2:
                    return
                job2.status = "error"
                job2.error = "未找到 ffmpeg：请确保已安装并在 PATH 中可用"
            _sse_send(job_id, _job_public(job2))
            return

        export_dir = _job_dir(job_id)
        frames_dir = export_dir / "frames"
        fmt = "mp4"
        fps = 30
        frame_count = 0
        w = 0
        h = 0
        ignore_stage_bg = False
        quality = "medium"
        with _EXPORT_JOB_LOCK:
            job2 = _EXPORT_JOBS.get(job_id)
            if not job2:
                return
            fmt = job2.format
            fps = max(1, int(job2.fps or 30))
            frame_count = max(1, int(job2.frameCount or 1))
            w = max(1, int(job2.width or 1))
            h = max(1, int(job2.height or 1))
            ignore_stage_bg = bool(getattr(job2, "ignoreStageBackground", False))
            quality = str(getattr(job2, "quality", "medium") or "medium")

        if quality not in ("high", "medium", "low"):
            quality = "medium"

        # Quality knobs (rough defaults)
        x264_preset = "fast" if quality == "medium" else "medium" if quality == "high" else "veryfast"
        x264_crf = "20" if quality == "high" else "23" if quality == "medium" else "28"
        x265_crf = "18" if quality == "high" else "22" if quality == "medium" else "28"
        prores_qscale = "8" if quality == "high" else "14" if quality == "medium" else "28"

        out_name = f"{job_id}.{fmt}"
        out_path = (export_dir / out_name).resolve()

        # Build ffmpeg command.
        # Use -progress pipe:1 to parse encoding progress.
        # Use image2 demuxer with sequential naming frame_%06d.png
        base_cmd = [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-framerate",
            str(fps),
            "-start_number",
            "0",
            "-i",
            str((frames_dir / "frame_%06d.png")),
            "-vf",
            f"scale={w}:{h},format=rgba",
        ]

        candidates: list[list[str]] = []

        if fmt == "mov" and ignore_stage_bg:
            if _ffmpeg_x265_supports_alpha():
                candidates.append(
                    base_cmd
                    + [
                        "-c:v",
                        "libx265",
                        "-pix_fmt",
                        "yuva420p10le",
                        "-preset",
                        "medium",
                        "-crf",
                        x265_crf,
                        "-tag:v",
                        "hvc1",
                        "-movflags",
                        "+faststart",
                    ]
                )
            candidates.append(
                base_cmd
                + [
                    "-c:v",
                    "prores_ks",
                    "-profile:v",
                    "4",
                    "-pix_fmt",
                    "yuva444p10le",
                    "-qscale:v",
                    prores_qscale,
                ]
            )
        else:
            # Default: compatible H.264 output (no alpha)
            candidates.append(
                base_cmd
                + [
                    "-c:v",
                    "libx264",
                    "-preset",
                    x264_preset,
                    "-crf",
                    x264_crf,
                    "-pix_fmt",
                    "yuv420p",
                    "-movflags",
                    "+faststart",
                ]
            )

        # Append progress/output args to each candidate.
        candidates = [
            c
            + [
                "-progress",
                "pipe:1",
                "-nostats",
                str(out_path),
            ]
            for c in candidates
        ]

        # duration in microseconds (align with ffmpeg progress fields)
        duration_us = int(frame_count * 1_000_000 / max(1, fps))
        last_pct = -1

        def _run_ffmpeg(cmd: list[str]) -> tuple[int, str]:
            """Run ffmpeg and stream progress; return (rc, log_tail)."""
            tail: list[str] = []
            try:
                # IMPORTANT: merge stderr into stdout to prevent deadlock when stderr buffer fills.
                proc = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    universal_newlines=True,
                )
            except Exception as e:
                return (1, f"启动 ffmpeg 失败：{e}")

            try:
                assert proc.stdout is not None
                for raw in proc.stdout:
                    s = (raw or "").strip("\n")
                    if s:
                        tail.append(s)
                        if len(tail) > 80:
                            tail = tail[-80:]
                    parse_progress_line(raw)
            except Exception:
                # ignore progress parse errors
                pass
            rc = proc.wait()
            return (rc, "\n".join(tail[-40:]))

        def _pct_from_out_time_us(out_us: int) -> int:
            try:
                return int(max(0, min(100, round(out_us * 100 / max(1, duration_us)))))
            except Exception:
                return 0

        def _parse_out_time_to_us(v: str) -> Optional[int]:
            v = (v or "").strip()
            if not v:
                return None
            # already numeric?
            try:
                if v.isdigit() or (v.startswith("-") and v[1:].isdigit()):
                    return int(v)
            except Exception:
                pass
            # format: HH:MM:SS.micro
            try:
                parts = v.split(":")
                if len(parts) != 3:
                    return None
                hh = int(parts[0])
                mm = int(parts[1])
                ss = float(parts[2])
                total = (hh * 3600 + mm * 60 + ss) * 1_000_000
                return int(total)
            except Exception:
                return None

        def parse_progress_line(line: str) -> None:
            nonlocal last_pct
            line = (line or "").strip()
            if not line or "=" not in line:
                return
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip()
            if k == "out_time_us":
                try:
                    out_us = int(v)
                except Exception:
                    return
                pct = _pct_from_out_time_us(out_us)
                if pct != last_pct:
                    last_pct = pct
                    with _EXPORT_JOB_LOCK:
                        job2 = _EXPORT_JOBS.get(job_id)
                        if not job2:
                            return
                        job2.progress = pct
                    _sse_send(job_id, _job_public(job2))
            elif k == "out_time_ms":
                # ffmpeg progress uses milliseconds here.
                try:
                    out_ms = int(v)
                except Exception:
                    return
                out_us = out_ms * 1000
                pct = _pct_from_out_time_us(out_us)
                if pct != last_pct:
                    last_pct = pct
                    with _EXPORT_JOB_LOCK:
                        job2 = _EXPORT_JOBS.get(job_id)
                        if not job2:
                            return
                        job2.progress = pct
                    _sse_send(job_id, _job_public(job2))
            elif k == "out_time":
                out_us = _parse_out_time_to_us(v)
                if out_us is None:
                    return
                pct = _pct_from_out_time_us(out_us)
                if pct != last_pct:
                    last_pct = pct
                    with _EXPORT_JOB_LOCK:
                        job2 = _EXPORT_JOBS.get(job_id)
                        if not job2:
                            return
                        job2.progress = pct
                    _sse_send(job_id, _job_public(job2))
            elif k == "progress" and v == "end":
                with _EXPORT_JOB_LOCK:
                    job2 = _EXPORT_JOBS.get(job_id)
                    if not job2:
                        return
                    job2.progress = max(int(job2.progress or 0), 100)
                _sse_send(job_id, _job_public(job2))

        last_err = ""
        ok = False
        for idx, cmd in enumerate(candidates):
            rc, tail = _run_ffmpeg(cmd)
            if rc == 0 and out_path.exists():
                ok = True
                break
            last_err = (tail.strip() or f"ffmpeg 退出码：{rc}")
            # If first attempt failed (e.g. libx265 alpha not supported), try fallback.
            try:
                if out_path.exists():
                    out_path.unlink(missing_ok=True)  # type: ignore[call-arg]
            except Exception:
                pass
            # reset progress a bit to reflect retry
            with _EXPORT_JOB_LOCK:
                job2 = _EXPORT_JOBS.get(job_id)
                if job2:
                    job2.progress = max(0, min(99, int(job2.progress or 0)))

        if not ok:
            with _EXPORT_JOB_LOCK:
                job2 = _EXPORT_JOBS.get(job_id)
                if not job2:
                    return
                job2.status = "error"
                job2.error = (last_err.strip() or "ffmpeg 编码失败")[:4000]
            _sse_send(job_id, _job_public(job2))
            return

        with _EXPORT_JOB_LOCK:
            job2 = _EXPORT_JOBS.get(job_id)
            if not job2:
                return
            job2.status = "done"
            job2.progress = 100
            job2.fileName = out_name
            job2.serverPath = str(out_path)
            job2.downloadUrl = f"/api/export/jobs/{job_id}/file"
        _sse_send(job_id, _job_public(job2))

    t = threading.Thread(target=worker, name=f"export-encode-{job_id}", daemon=True)
    t.start()


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def create_job(request: Request) -> Response:
    payload: Any = request.data
    if payload is None:
        payload = {}

    fmt = str((payload or {}).get("format") or "").strip().lower()
    if fmt not in ("mp4", "mov"):
        return _json_error("format 仅支持 mp4/mov")

    width = int((payload or {}).get("width") or 0)
    height = int((payload or {}).get("height") or 0)
    fps = int((payload or {}).get("fps") or 30)
    frame_count = int((payload or {}).get("frameCount") or 0)
    upload_mode = str((payload or {}).get("uploadMode") or "disk").strip().lower()
    ignore_stage_bg = _parse_bool((payload or {}).get("ignoreStageBackground"))
    quality = _quality_or_default((payload or {}).get("quality"))
    if width <= 0 or height <= 0:
        return _json_error("缺少有效的 width/height")
    if frame_count <= 0:
        return _json_error("缺少有效的 frameCount")
    if fps <= 0:
        fps = 30

    if upload_mode not in ("disk", "pipe"):
        upload_mode = "disk"

    job_id = _new_job_id()
    _job_dir(job_id)

    job = ExportJob(
        jobId=job_id,
        status="running" if upload_mode == "pipe" else "queued",
        progress=0,
        format=fmt,
        width=width,
        height=height,
        fps=fps,
        frameCount=frame_count,
        receivedFrames=0,
        uploadMode=upload_mode,
        ignoreStageBackground=ignore_stage_bg,
        quality=quality,
        fileName=None,
        serverPath=None,
        downloadUrl=None,
        error=None,
    )
    with _EXPORT_JOB_LOCK:
        _EXPORT_JOBS[job_id] = job
        _EXPORT_SUBSCRIBERS.setdefault(job_id, [])
        _EXPORT_RECEIVED[job_id] = set()

    if upload_mode == "pipe":
        _sse_send(job_id, _job_public(job))
        _start_pipe_encoder(job_id)
    return Response(_job_public(job))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def upload_frame_raw(request: Request, job_id: str) -> Response:
    job_id = str(job_id or "").strip()
    if not job_id:
        return _json_error("jobId 不能为空")

    try:
        frame_index = int(str((request.query_params or {}).get("frameIndex")))
    except Exception:
        return _json_error("frameIndex 必须为整数")

    with _EXPORT_JOB_LOCK:
        job = _EXPORT_JOBS.get(job_id)
        encoder = _EXPORT_PIPE_ENCODERS.get(job_id)
    if not job:
        return _json_error("未找到该导出任务", status=404)
    if str(getattr(job, "uploadMode", "disk")) != "pipe":
        return _json_error("该任务不是 pipe 模式，请使用 /frames 上传 PNG")
    if job.status in ("done", "error"):
        return _json_error(f"任务已结束：{job.status}")
    if frame_index < 0 or (job.frameCount > 0 and frame_index >= job.frameCount):
        return _json_error("frameIndex 越界")
    if not encoder or not encoder.proc or encoder.proc.poll() is not None:
        return _json_error("ffmpeg 管道不可用（进程未启动或已退出）", status=500)

    body = bytes(getattr(request, "body", b"") or b"")
    expect_len = max(1, int(job.width or 1)) * max(1, int(job.height or 1)) * 4
    if len(body) != expect_len:
        return _json_error(f"raw 帧长度不匹配：got {len(body)} expected {expect_len}")

    with _EXPORT_JOB_LOCK:
        expected = int(job.receivedFrames or 0)
    if frame_index != expected:
        return _json_error(f"帧上传乱序：got {frame_index} expected {expected}", status=409)

    try:
        assert encoder.proc.stdin is not None
        with encoder.stdin_lock:
            if encoder.stdin_closed:
                return _json_error("ffmpeg stdin 已关闭", status=409)
            encoder.proc.stdin.write(body)
    except Exception as e:
        with _EXPORT_JOB_LOCK:
            job2 = _EXPORT_JOBS.get(job_id)
            if job2:
                job2.status = "error"
                job2.error = f"写入 ffmpeg stdin 失败：{e}"
        with _EXPORT_JOB_LOCK:
            job2 = _EXPORT_JOBS.get(job_id)
        if job2:
            _sse_send(job_id, _job_public(job2))
        return _json_error(f"写入 ffmpeg stdin 失败：{e}", status=500)

    with _EXPORT_JOB_LOCK:
        job2 = _EXPORT_JOBS.get(job_id)
        if not job2:
            return _json_error("未找到该导出任务", status=404)
        received = _EXPORT_RECEIVED.setdefault(job_id, set())
        received.add(int(frame_index))
        job2.receivedFrames = int(job2.receivedFrames or 0) + 1

    # best-effort notify
    _sse_send(job_id, _job_public(job2))
    return Response(_job_public(job2))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def upload_frames_raw_batch(request: Request, job_id: str) -> Response:
    """Pipe-mode batch uploader.

    - Allows out-of-order uploads.
    - Buffers a bounded number of frames in memory.
    - Flushes contiguous frames to ffmpeg stdin in-order.

    Query params:
      - startIndex: int
      - count: int

    Body: application/octet-stream (RGBA concatenated)
    """

    job_id = str(job_id or "").strip()
    if not job_id:
        return _json_error("jobId 不能为空")

    try:
        start_index = int(str((request.query_params or {}).get("startIndex")))
        count = int(str((request.query_params or {}).get("count")))
    except Exception:
        return _json_error("startIndex/count 必须为整数")

    if start_index < 0:
        return _json_error("startIndex 越界")
    if count <= 0:
        return _json_error("count 必须大于 0")
    max_frames = _pipe_batch_max_frames()
    if count > max_frames:
        return _json_error(f"count 过大：max={max_frames}")

    with _EXPORT_JOB_LOCK:
        job = _EXPORT_JOBS.get(job_id)
        encoder = _EXPORT_PIPE_ENCODERS.get(job_id)
    if not job:
        return _json_error("未找到该导出任务", status=404)
    if str(getattr(job, "uploadMode", "disk")) != "pipe":
        return _json_error("该任务不是 pipe 模式")
    if job.status in ("done", "error"):
        return _json_error(f"任务已结束：{job.status}")
    if job.frameCount > 0 and (start_index + count) > int(job.frameCount):
        return _json_error("startIndex/count 越界")
    if not encoder or not encoder.proc or encoder.proc.poll() is not None:
        return _json_error("ffmpeg 管道不可用（进程未启动或已退出）", status=500)

    body = bytes(getattr(request, "body", b"") or b"")
    max_bytes = _pipe_batch_max_bytes()
    if len(body) > max_bytes:
        return _json_error(f"batch body 过大：maxBytes={max_bytes}", status=413)

    frame_len = max(1, int(job.width or 1)) * max(1, int(job.height or 1)) * 4
    expect_total = frame_len * count
    if len(body) != expect_total:
        return _json_error(f"raw batch 长度不匹配：got {len(body)} expected {expect_total}")

    try:
        with encoder.ingress_lock:
            new_frames = 0
            for i in range(count):
                idx = start_index + i
                if idx < encoder.next_index:
                    continue
                if idx in encoder.pending:
                    continue
                new_frames += 1

            add_bytes = new_frames * frame_len
            if encoder.pending_bytes + add_bytes > int(encoder.max_pending_bytes or 0):
                return _json_error(
                    f"pipe 缓冲区已满：pendingBytes={encoder.pending_bytes} addBytes={add_bytes} maxBytes={encoder.max_pending_bytes}",
                    status=429,
                )

            mv = memoryview(body)
            for i in range(count):
                idx = start_index + i
                if idx < encoder.next_index:
                    continue
                if idx in encoder.pending:
                    continue
                off = i * frame_len
                encoder.pending[idx] = bytes(mv[off : off + frame_len])
                encoder.pending_bytes += frame_len

            while True:
                b = encoder.pending.pop(encoder.next_index, None)
                if b is None:
                    break
                encoder.pending_bytes = max(0, int(encoder.pending_bytes) - frame_len)
                with encoder.stdin_lock:
                    if encoder.stdin_closed:
                        encoder.pending[encoder.next_index] = b
                        encoder.pending_bytes += frame_len
                        return _json_error("ffmpeg stdin 已关闭", status=409)
                    assert encoder.proc.stdin is not None
                    encoder.proc.stdin.write(b)
                with _EXPORT_JOB_LOCK:
                    job2 = _EXPORT_JOBS.get(job_id)
                    if job2:
                        job2.receivedFrames = int(job2.receivedFrames or 0) + 1
                        _EXPORT_RECEIVED.setdefault(job_id, set()).add(int(encoder.next_index))
                encoder.next_index += 1
    except Exception as e:
        with _EXPORT_JOB_LOCK:
            job2 = _EXPORT_JOBS.get(job_id)
            if job2:
                job2.status = "error"
                job2.error = f"写入 ffmpeg stdin 失败：{e}"
        with _EXPORT_JOB_LOCK:
            job2 = _EXPORT_JOBS.get(job_id)
        if job2:
            _sse_send(job_id, _job_public(job2))
        return _json_error(f"写入 ffmpeg stdin 失败：{e}", status=500)

    with _EXPORT_JOB_LOCK:
        job2 = _EXPORT_JOBS.get(job_id) or job
    _sse_send(job_id, _job_public(job2))
    return Response(_job_public(job2))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def upload_frame(request: Request, job_id: str) -> Response:
    job_id = str(job_id or "").strip()
    if not job_id:
        return _json_error("jobId 不能为空")

    data: Any = request.data
    frame_index_raw = None
    try:
        if isinstance(data, dict):
            frame_index_raw = data.get("frameIndex")
        else:
            frame_index_raw = getattr(data, "get", lambda _k, _d=None: None)("frameIndex")
    except Exception:
        frame_index_raw = None
    try:
        frame_index = int(str(frame_index_raw))
    except Exception:
        return _json_error("frameIndex 必须为整数")

    file = None
    try:
        files = getattr(request, "FILES", None)
        if files is not None:
            file = getattr(files, "get", lambda _k, _d=None: None)("file")
    except Exception:
        file = None
    if not file:
        return _json_error("缺少 file")

    with _EXPORT_JOB_LOCK:
        job = _EXPORT_JOBS.get(job_id)
    if not job:
        return _json_error("未找到该导出任务", status=404)
    if job.status in ("done", "error"):
        return _json_error(f"任务已结束：{job.status}")
    if frame_index < 0 or (job.frameCount > 0 and frame_index >= job.frameCount):
        return _json_error("frameIndex 越界")

    frames_dir = _job_dir(job_id) / "frames"
    out_path = (frames_dir / f"frame_{frame_index:06d}.png").resolve()

    # If already received and file exists, treat as idempotent success.
    with _EXPORT_JOB_LOCK:
        received0 = _EXPORT_RECEIVED.setdefault(job_id, set())
        already = int(frame_index) in received0
        job0 = _EXPORT_JOBS.get(job_id)
        if job0:
            job0.receivedFrames = len(received0)
    if already and out_path.exists():
        if job0:
            _sse_send(job_id, _job_public(job0))
            return Response(_job_public(job0))
        return _json_error("未找到该导出任务", status=404)

    tmp_path = out_path.with_suffix(out_path.suffix + f".tmp.{os.urandom(4).hex()}")
    try:
        with open(tmp_path, "wb") as f:
            for chunk in file.chunks():
                f.write(chunk)
        os.replace(str(tmp_path), str(out_path))
    except Exception as e:
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except Exception:
            pass
        return _json_error(f"写入帧失败：{e}", status=500)

    # Export is now two-step: upload (store frames) -> finalize (render video).
    with _EXPORT_JOB_LOCK:
        job2 = _EXPORT_JOBS.get(job_id)
        if not job2:
            return _json_error("未找到该导出任务", status=404)
        received = _EXPORT_RECEIVED.setdefault(job_id, set())
        received.add(int(frame_index))
        job2.receivedFrames = len(received)

    # Optional: notify SSE listeners about receive count (frontend still shows its own upload progress).
    _sse_send(job_id, _job_public(job2))

    return Response(_job_public(job2))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def finalize_job(request: Request, job_id: str) -> Response:
    job_id = str(job_id or "").strip()
    if not job_id:
        return _json_error("jobId 不能为空")
    with _EXPORT_JOB_LOCK:
        job = _EXPORT_JOBS.get(job_id)
    if not job:
        return _json_error("未找到该导出任务", status=404)
    if job.status in ("done", "error"):
        return Response(_job_public(job))

    # Allow overriding output options at finalize time (two-step export).
    try:
        payload = getattr(request, "data", None) or {}
        fmt = payload.get("format")
        quality = payload.get("quality")
        ignore_stage_bg = payload.get("ignoreStageBackground")
    except Exception:
        fmt = None
        quality = None
        ignore_stage_bg = None

    if str(getattr(job, "uploadMode", "disk")) == "pipe":
        # Pipe mode starts ffmpeg immediately at create_job, so output options must be immutable.
        job_fmt = str(getattr(job, "format", ""))
        job_q = _quality_or_default(getattr(job, "quality", None))
        job_bg = bool(getattr(job, "ignoreStageBackground", False))
        if fmt in ("mp4", "mov") and str(fmt) != job_fmt:
            return _json_error("pipe 模式不允许在 finalize 更改 format", status=409)
        if quality in ("high", "medium", "low") and _quality_or_default(quality) != job_q:
            return _json_error("pipe 模式不允许在 finalize 更改 quality", status=409)
        if ignore_stage_bg is not None and bool(ignore_stage_bg) != job_bg:
            return _json_error("pipe 模式不允许在 finalize 更改 ignoreStageBackground", status=409)
        with _EXPORT_JOB_LOCK:
            encoder = _EXPORT_PIPE_ENCODERS.get(job_id)
            job2 = _EXPORT_JOBS.get(job_id) or job
        if not encoder or encoder.proc.poll() is not None:
            return _json_error("ffmpeg 管道不可用（进程未启动或已退出）", status=500)
        if int(job2.receivedFrames or 0) < int(job2.frameCount or 0):
            return _json_error(
                f"仍有帧未上传：received={int(job2.receivedFrames or 0)} frameCount={int(job2.frameCount or 0)}",
                status=409,
            )
        try:
            with encoder.stdin_lock:
                if not encoder.stdin_closed and encoder.proc.stdin is not None:
                    encoder.stdin_closed = True
                    encoder.proc.stdin.close()
        except Exception:
            pass
        with _EXPORT_JOB_LOCK:
            job2 = _EXPORT_JOBS.get(job_id) or job
        return Response(_job_public(job2))

    # Disk mode: allow overriding output options at finalize time.
    with _EXPORT_JOB_LOCK:
        jobx = _EXPORT_JOBS.get(job_id)
        if jobx:
            if fmt in ("mp4", "mov"):
                jobx.format = fmt
            if quality in ("high", "medium", "low"):
                setattr(jobx, "quality", quality)
            if ignore_stage_bg is not None:
                setattr(jobx, "ignoreStageBackground", bool(ignore_stage_bg))

    # Disk mode: must have all frames before encoding.
    with _EXPORT_JOB_LOCK:
        job2 = _EXPORT_JOBS.get(job_id) or job
    if int(getattr(job2, "receivedFrames", 0) or 0) < int(getattr(job2, "frameCount", 0) or 0):
        return _json_error(
            f"仍有帧未上传：received={int(getattr(job2, 'receivedFrames', 0) or 0)} frameCount={int(getattr(job2, 'frameCount', 0) or 0)}",
            status=409,
        )

    # Try start regardless; encoder will re-check readiness.
    _start_encode_if_ready(job_id)
    with _EXPORT_JOB_LOCK:
        job2 = _EXPORT_JOBS.get(job_id) or job
    return Response(_job_public(job2))


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def get_job(request: Request, job_id: str) -> Response:
    job_id = str(job_id or "").strip()
    if not job_id:
        return _json_error("jobId 不能为空")
    job = _EXPORT_JOBS.get(job_id)
    if not job:
        return _json_error("未找到该导出任务", status=404)
    return Response(_job_public(job))


def stream_job_sse(request, job_id: str):
    # DEBUG: verify this handler is actually hit.
    try:
        accept = getattr(request, "headers", {}).get("Accept")
    except Exception:
        accept = None
    print(f"[export_sse] hit job_id={job_id} accept={accept}")

    job_id = str(job_id or "").strip()
    if not job_id:
        # Do NOT use DRF Response here; EventSource sends Accept: text/event-stream
        # which can trigger DRF's content negotiation to return 406.
        return JsonResponse({"error": "jobId 不能为空"}, status=400)

    with _EXPORT_JOB_LOCK:
        job = _EXPORT_JOBS.get(job_id)
    if not job:
        return JsonResponse({"error": "未找到该导出任务"}, status=404)

    q: Queue[str] = Queue()
    with _EXPORT_JOB_LOCK:
        _EXPORT_SUBSCRIBERS.setdefault(job_id, []).append(q)

    def gen():
        try:
            # Initial state
            yield f"event: progress\ndata: {json.dumps(_job_public(job), ensure_ascii=False)}\n\n".encode("utf-8")
            # Pump updates + keepalive
            while True:
                try:
                    msg = q.get(timeout=15)
                    yield msg.encode("utf-8")
                except Exception:
                    yield ": ping\n\n".encode("utf-8")
        except GeneratorExit:
            return
        finally:
            with _EXPORT_JOB_LOCK:
                subs = _EXPORT_SUBSCRIBERS.get(job_id, [])
                try:
                    subs.remove(q)
                except ValueError:
                    pass

    resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
    resp["Cache-Control"] = "no-cache"
    resp["X-Accel-Buffering"] = "no"
    resp["X-Dweb-Export-SSE"] = "1"
    return resp


# Backward-compatible alias (kept in case other callers import stream_job)
stream_job = stream_job_sse


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def download_job_file(request: Request, job_id: str):
    job_id = str(job_id or "").strip()
    job = _EXPORT_JOBS.get(job_id)
    if not job or not job.serverPath:
        return _json_error("未找到该导出任务", status=404)

    path = Path(job.serverPath)
    if not path.exists() or not path.is_file():
        return _json_error("导出文件不存在", status=404)

    return FileResponse(
        open(path, "rb"),
        as_attachment=True,
        filename=job.fileName or path.name,
        content_type="application/octet-stream",
    )
