"""Minimal Django settings for the Dweb Studio backend template.

Runtime data (SECRET_KEY / sqlite db) is written under DWEB_DATA_DIR,
so copied runtime projects can be safely re-created on a fresh machine.
"""
from __future__ import annotations

import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Use DWEB_DATA_DIR if set to a non-empty value; fall back to BASE_DIR.
# Treats empty string the same as unset to guard against Electron passing '' by mistake.
_DWEB_DATA_DIR = Path(os.getenv("DWEB_DATA_DIR") or str(BASE_DIR)).resolve()
_DWEB_DATA_DIR.mkdir(parents=True, exist_ok=True)

_SECRET_FILE = _DWEB_DATA_DIR / "django_secret_key.txt"
if _SECRET_FILE.exists():
    SECRET_KEY = _SECRET_FILE.read_text(encoding="utf-8").strip() or ""
else:
    SECRET_KEY = ""

if not SECRET_KEY:
    SECRET_KEY = secrets.token_urlsafe(48)
    try:
        _SECRET_FILE.write_text(SECRET_KEY, encoding="utf-8")
    except Exception:
        pass

DEBUG = True
ALLOWED_HOSTS = ["*", "127.0.0.1", "localhost"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "dwebapp",
    "dvs_editor",
    "aiworkflow_project",
    "comfyui_bridge",
    "third_party_api_gateway",
    "codex_bridge",
    "agentSkills",
    "corsheaders",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "dwebsite.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "dwebsite.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": _DWEB_DATA_DIR / "db.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "zh-hans"
TIME_ZONE = "Asia/Shanghai"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = _DWEB_DATA_DIR / "static"
MEDIA_URL = "/media/"
MEDIA_ROOT = _DWEB_DATA_DIR / "media"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ],
}

CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True
APPEND_SLASH = False

_DEFAULT_UPLOAD_LIMIT_MB = 256
_UPLOAD_LIMIT_BYTES = int(os.getenv("DWEB_UPLOAD_LIMIT_BYTES", str(_DEFAULT_UPLOAD_LIMIT_MB * 1024 * 1024)))
DATA_UPLOAD_MAX_MEMORY_SIZE = _UPLOAD_LIMIT_BYTES
FILE_UPLOAD_MAX_MEMORY_SIZE = _UPLOAD_LIMIT_BYTES

def _read_alias_env(primary: str, fallback: str, default: str = "") -> str:
    v = os.getenv(primary)
    if v is not None and str(v).strip() != "":
        return str(v)
    v2 = os.getenv(fallback)
    if v2 is not None and str(v2).strip() != "":
        return str(v2)
    return default


# Legacy CODEX_* keeps the existing app-server bridge available for old callers.
CODEX_ENABLED = os.getenv("CODEX_ENABLED", "true").strip().lower() == "true"
CODEX_MODEL = os.getenv("CODEX_MODEL", "doubao-seed-2.0-Pro")
CODEX_PROVIDER = os.getenv("CODEX_PROVIDER", "openai")
CODEX_BASE_URL = os.getenv("CODEX_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
CODEX_ENV_KEY_NAME = os.getenv("CODEX_ENV_KEY_NAME", "ARK_API_KEY")
CODEX_WORKSPACE_ROOT = os.getenv("CODEX_WORKSPACE_ROOT", str(BASE_DIR.parent.parent / "Claw-code"))
CODEX_SANDBOX_MODE = os.getenv("CODEX_SANDBOX_MODE", "workspace-write")
CODEX_APPROVAL_POLICY = os.getenv("CODEX_APPROVAL_POLICY", "on-request")
CODEX_COMMAND = os.getenv("CODEX_COMMAND", "codex")
CODEX_HOME_ROOT = os.getenv("CODEX_HOME_ROOT", "")
CODEX_STARTUP_TIMEOUT_MS = int(os.getenv("CODEX_STARTUP_TIMEOUT_MS", "12000"))

# GitHub Copilot CLI is the primary provider for /api/workflow/copilot/*.
COPILOT_CLI_ENABLED = os.getenv("COPILOT_CLI_ENABLED", "true").strip().lower() == "true"
COPILOT_CLI_MODEL = os.getenv("COPILOT_CLI_MODEL", "auto")
COPILOT_CLI_PROVIDER = "copilot-cli"
COPILOT_CLI_BASE_URL = ""
COPILOT_CLI_ENV_KEY_NAME = ""
COPILOT_CLI_WORKSPACE_ROOT = os.getenv("COPILOT_CLI_WORKSPACE_ROOT", str(BASE_DIR.parent))
COPILOT_CLI_SANDBOX_MODE = os.getenv("COPILOT_CLI_SANDBOX_MODE", "workspace-write")
COPILOT_CLI_APPROVAL_POLICY = os.getenv("COPILOT_CLI_APPROVAL_POLICY", "on-request")
COPILOT_CLI_COMMAND = os.getenv("COPILOT_CLI_COMMAND", "copilot")
COPILOT_CLI_HOME_ROOT = os.getenv("COPILOT_CLI_HOME_ROOT", "")
COPILOT_CLI_STARTUP_TIMEOUT_MS = int(os.getenv("COPILOT_CLI_STARTUP_TIMEOUT_MS", "12000"))

_DWEB_LOG_DIR = _DWEB_DATA_DIR / "logs"
try:
    _DWEB_LOG_DIR.mkdir(parents=True, exist_ok=True)
except Exception:
    pass

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "%(asctime)s %(levelname)s [%(name)s] %(message)s",
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
        },
        "codex_file": {
            "class": "logging.FileHandler",
            "filename": str(_DWEB_LOG_DIR / "codex_bridge.log"),
            "formatter": "standard",
            "encoding": "utf-8",
        },
    },
    "loggers": {
        "codex_bridge": {
            "handlers": ["console", "codex_file"],
            "level": os.getenv("CODEX_LOG_LEVEL", "INFO").strip().upper() or "INFO",
            "propagate": False,
        }
    },
}
