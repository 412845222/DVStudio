"""Minimal Django settings for the Dweb Studio backend template.

Runtime data (SECRET_KEY / sqlite db) is written under DWEB_DATA_DIR,
so copied runtime projects can be safely re-created on a fresh machine.
"""
from __future__ import annotations

import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

_DWEB_DATA_DIR = Path(os.getenv("DWEB_DATA_DIR", str(BASE_DIR))).resolve()
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
    "comfyui_bridge",
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
