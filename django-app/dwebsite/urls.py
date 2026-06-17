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
    path("api/workflow/projects/", include("aiworkflow_project.urls")),
    path("api/workflow/", include("comfyui_bridge.urls")),
    path("api/workflow/codex/", include("codex_bridge.urls")),
    path("api/workflow/copilot/", include("codex_bridge.urls")),
    path("api/agent-skills/", include("agentSkills.urls")),
    path("api/third-party/", include("third_party_api_gateway.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
