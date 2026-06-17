#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '%s\n' "$*"
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

log "[bootstrap:mac] start"

if has_cmd python3; then
  py_ver="$(python3 --version 2>&1 || true)"
  log "[bootstrap:mac] python3 found: ${py_ver}"
else
  log "[bootstrap:mac] python3 not found. Please install Python 3.11+ (recommended: brew install python@3.11)."
fi

if has_cmd ffmpeg; then
  ff_ver="$(ffmpeg -version 2>/dev/null | head -n 1 || true)"
  log "[bootstrap:mac] ffmpeg found: ${ff_ver}"
else
  log "[bootstrap:mac] ffmpeg not found. Optional for export. Install with: brew install ffmpeg"
fi

log "[bootstrap:mac] done"
