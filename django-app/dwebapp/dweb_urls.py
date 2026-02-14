"""URL routes for Dweb Studio generated APIs.

This file is safe to overwrite by tooling. Custom additions should be merged via the blueprint."""
from __future__ import annotations

from django.urls import path
from . import dweb_apis

urlpatterns = [
    path("health/", dweb_apis.health, name="dweb-health-api"),
    path("echo/", dweb_apis.echo, name="dweb-echo-api"),
]
