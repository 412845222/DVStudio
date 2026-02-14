"""dwebsite URL configuration."""
from __future__ import annotations

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("dwebapp.urls")),
    path("api/editor/", include("dvs_editor.urls")),
    path("api/workflow/", include("comfyui_bridge.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
